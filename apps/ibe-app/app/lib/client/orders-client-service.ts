// Runs in the browser. Deliberately does NOT import @yourorg/otel -
// that package pulls in Node's `async_hooks`, which doesn't exist in a
// browser bundle. This is the CSR half of "Option B": no browser tracer,
// no OTEL bundle cost, no CORS/collector exposure - just a correlation ID
// generated here and forwarded as a header, so the eventual server-side
// trace and logs can still be tied back to this specific browser call.
export interface OrdersResponse {
  success: boolean;
  orders?: { id: number; title: string; completed: boolean }[];
  correlationId: string;
  traceId?: string;
  error?: string;
}

// Always resolves with the parsed body, success or failure - callers check
// `success` rather than relying on try/catch, so a failed request's
// correlationId/traceId survive to be shown to the user (see ordersSlice's
// use of rejectWithValue). Only a genuine network failure (offline, DNS,
// the fetch call itself rejecting) throws, since there's no server
// response to read a traceId from in that case.
export async function fetchOrdersFromClient(): Promise<OrdersResponse> {
  const correlationId = crypto.randomUUID();

  const response = await fetch("/api/orders", {
    headers: { "x-correlation-id": correlationId },
  });

  const data = (await response.json()) as OrdersResponse;

  // The API route echoes the same correlationId back; fall back to the
  // client-generated one only if the response body was ever malformed.
  return { ...data, correlationId: data.correlationId ?? correlationId };
}
