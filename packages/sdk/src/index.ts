import { createLogger, getCorrelationId } from "@yourorg/otel";

export function ping() {
  return "pong";
}

const logger = createLogger("sdk/backend-client");

// Base URL of the real backend this SDK talks to. Swap this for your
// actual backend's base URL via env var - the SDK code itself doesn't
// need to change.
const BACKEND_BASE_URL =
  process.env.BACKEND_BASE_URL ?? "https://jsonplaceholder.typicode.com";

export interface BackendCallOptions extends RequestInit {
  /** Path relative to BACKEND_BASE_URL, e.g. "/todos?_limit=5" */
  path: string;
}

// "Auto only" tracing (per architecture decision): this uses the global
// `fetch`, which Node's OTEL auto-instrumentation (bundled by @vercel/otel
// via instrumentation.ts -> register()) already wraps in an HTTP client
// span automatically. No manual tracer.startActiveSpan() calls here - the
// span appears as a generic "GET https://..." child of whatever span was
// active when this was called (the server service -> api route chain).
//
// What IS manual: forwarding the app-level correlation ID as a header, and
// logging around the call. The correlation ID isn't something OTEL knows
// about - it's carried by AsyncLocalStorage (see packages/otel/src/correlation.ts)
// and only needs to be read here, not re-generated.
export async function callBackend<T = unknown>({
  path,
  headers,
  ...init
}: BackendCallOptions): Promise<T> {
  const correlationId = getCorrelationId();
  const url = `${BACKEND_BASE_URL}${path}`;
  const startTime = Date.now();

  logger.info("Calling backend", { url, method: init.method ?? "GET" });

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...headers,
        ...(correlationId ? { "x-correlation-id": correlationId } : {}),
      },
    });

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
    // Already logged above for non-OK responses; this also catches
    // network-level failures (DNS, timeout, connection refused, etc.)
    if (!(error instanceof Error && error.message.startsWith("Backend responded with"))) {
      logger.error("Backend call errored", { url, duration: `${duration}ms` }, error);
    }
    throw error;
  }
}
