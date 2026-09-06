import { generateTraceparent } from "@yourorg/otel/src/trace-context";

// Runs in the browser. Imports ONLY the dependency-free trace-context
// helper (via its direct subpath) - never `@yourorg/otel`'s main entry,
// which pulls in Node's `async_hooks` and `@vercel/otel` and will break in
// a browser bundle.
//
// Sends a hand-crafted W3C `traceparent` header instead of a custom
// correlation ID. Verified against this repo: @vercel/otel's
// auto-instrumentation extracts this on arrival and uses its trace-id as
// the ACTUAL trace_id for the request - no browser OTEL SDK required, no
// custom "correlation_id" field needed, and the same trace now continues
// automatically into any of our own downstream services (Java backend
// included) since standard OTEL propagation forwards traceparent on every
// outbound call. See ARCHITECTURE.md's traceparent decision for the full
// reasoning versus the old x-correlation-id approach.
export interface OrdersResponse {
  success: boolean;
  orders?: { id: number; title: string; completed: boolean }[];
  traceId?: string;
  error?: string;
}

// Always resolves with the parsed body, success or failure - callers check
// `success` rather than relying on try/catch, so a failed request's
// traceId survives to be shown to the user (see ordersSlice's use of
// rejectWithValue). Only a genuine network failure (offline, DNS, the
// fetch call itself rejecting) throws, since there's no server response to
// read a traceId from in that case.
export async function fetchOrdersFromClient(): Promise<OrdersResponse> {
  const traceparent = generateTraceparent();

  const response = await fetch("/api/orders", {
    headers: { traceparent },
  });

  const data = (await response.json()) as OrdersResponse;
  return data;
}
