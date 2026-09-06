import { createLogger, getExternalCorrelationId } from "@yourorg/otel";

export function ping() {
  return "pong";
}

const logger = createLogger("sdk/backend-client");

// Base URL of the real backend this SDK talks to. Swap this for your
// actual backend's base URL via env var - the SDK code itself doesn't
// need to change.
const BACKEND_BASE_URL =
  process.env.BACKEND_BASE_URL ?? "https://jsonplaceholder.typicode.com";

// Base URL of an EXTERNAL vendor system (e.g. an airline PSS/POP
// integration) - a system we don't control and can't assume runs OTEL.
// See callExternalSystem() below for why this is handled differently from
// callBackend().
const EXTERNAL_SYSTEM_BASE_URL =
  process.env.EXTERNAL_SYSTEM_BASE_URL ?? "https://jsonplaceholder.typicode.com";

export interface BackendCallOptions extends RequestInit {
  /** Path relative to BACKEND_BASE_URL, e.g. "/todos?_limit=5" */
  path: string;
}

// "Auto only" tracing (per architecture decision): this uses the global
// `fetch`, which Node's OTEL auto-instrumentation (bundled by @vercel/otel
// via instrumentation.ts -> register()) already wraps in an HTTP client
// span automatically. No manual tracer.startActiveSpan() calls here.
//
// This represents OUR OWN backend (e.g. the Java service) - a system that
// also runs OTEL. No correlation-id handling is needed here at all: the
// active trace context (originally established from the caller's
// `traceparent` header, see trace-context.ts) is propagated onto this
// outbound fetch automatically by the same auto-instrumentation, carrying
// the SAME trace_id all the way into that service's own spans. That's the
// entire point of traceparent over a custom header - zero propagation code
// needed for boundaries where both sides run OTEL.
export async function callBackend<T = unknown>({
  path,
  headers,
  ...init
}: BackendCallOptions): Promise<T> {
  const url = `${BACKEND_BASE_URL}${path}`;
  const startTime = Date.now();

  logger.info("Calling backend", { url, method: init.method ?? "GET" });

  try {
    const response = await fetch(url, { ...init, headers });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const error = new Error(`Backend responded with ${response.status}`);
      logger.error(
        "Backend call failed",
        { url, status: response.status, duration: `${duration}ms` },
        error
      );
      throw error;
    }

    logger.info("Backend call succeeded", {
      url,
      status: response.status,
      duration: `${duration}ms`,
    });

    return (await response.json()) as T;
  } catch (error) {
    const duration = Date.now() - startTime;
    if (!(error instanceof Error && error.message.startsWith("Backend responded with"))) {
      logger.error("Backend call errored", { url, duration: `${duration}ms` }, error);
    }
    throw error;
  }
}

export interface ExternalSystemCallOptions extends RequestInit {
  /** Path relative to EXTERNAL_SYSTEM_BASE_URL */
  path: string;
}

// Represents a call to a system WE DO NOT CONTROL - e.g. an airline PSS
// (Passenger Service System) or a POP integration. Unlike callBackend()
// above, we cannot assume the far side runs OTEL or will extract/forward a
// `traceparent` header - most vendor systems won't. The trace may
// effectively end here as far as OUR tracing goes.
//
// What we send instead is an `x-external-correlation-id` header - not for
// the external system's benefit (it may ignore it entirely), but so OUR
// OWN request/response logs record "we sent this exact ID to PSS, on this
// exact call," which is durable and searchable on our side regardless of
// what the external system does with it. Callers must wrap this in
// runWithExternalCorrelationId() first (see flight-journey-service.ts).
export async function callExternalSystem<T = unknown>({
  path,
  headers,
  ...init
}: ExternalSystemCallOptions): Promise<T> {
  const externalCorrelationId = getExternalCorrelationId();
  const url = `${EXTERNAL_SYSTEM_BASE_URL}${path}`;
  const startTime = Date.now();

  logger.info("Calling external system", {
    url,
    method: init.method ?? "GET",
    externalCorrelationId,
  });

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...headers,
        ...(externalCorrelationId ? { "x-external-correlation-id": externalCorrelationId } : {}),
      },
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const error = new Error(`External system responded with ${response.status}`);
      logger.error(
        "External system call failed",
        { url, status: response.status, duration: `${duration}ms`, externalCorrelationId },
        error
      );
      throw error;
    }

    logger.info("External system call succeeded", {
      url,
      status: response.status,
      duration: `${duration}ms`,
      externalCorrelationId,
    });

    return (await response.json()) as T;
  } catch (error) {
    const duration = Date.now() - startTime;
    if (!(error instanceof Error && error.message.startsWith("External system responded with"))) {
      logger.error(
        "External system call errored",
        { url, duration: `${duration}ms`, externalCorrelationId },
        error
      );
    }
    throw error;
  }
}
