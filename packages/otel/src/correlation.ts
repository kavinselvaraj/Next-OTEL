import { AsyncLocalStorage } from "async_hooks";

// App-level correlation ID, separate from the OTEL trace ID.
//
// Why this exists alongside trace_id: the OTEL trace only starts once a
// request reaches an instrumented server span (the API route). A browser
// (CSR) call happens before that, with no OTEL SDK loaded client-side
// (see Option B in the architecture notes - no browser tracer, no bundle
// cost, no CORS/collector exposure). The correlation ID is generated at
// the true origin of the request - the client service in the browser, or
// the SSR page on the server - and threaded through every hop via a
// plain HTTP header (`x-correlation-id`), so a user-reported error can
// still be traced back to its origin even though there's no distributed
// trace covering the browser leg.
//
// Once a request reaches the API route, both IDs exist side by side in
// every log line: trace_id (API route -> server service -> sdk, from
// OTEL) and correlation_id (client/SSR origin -> ... -> sdk, from this
// module).
const correlationIdStorage = new AsyncLocalStorage<string>();

// Runs `fn` with `id` set as the active correlation ID for the duration of
// the call (and anything it awaits). Call this once, at the API route,
// wrapping the rest of the request handling.
export function runWithCorrelationId<T>(id: string, fn: () => T): T {
  return correlationIdStorage.run(id, fn);
}

// Reads the correlation ID set by the nearest enclosing runWithCorrelationId
// call. Returns undefined outside of one (e.g. at module init time).
export function getCorrelationId(): string | undefined {
  return correlationIdStorage.getStore();
}
