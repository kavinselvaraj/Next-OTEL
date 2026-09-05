# 🔍 Testing the SSR / CSR Tracing Demo

This walks through verifying the `orders` demo in `apps/ibe-app` — the
reference implementation of correlation-ID tracing across both the SSR and
CSR call patterns. See `OTEL_COMPLETE_IMPLEMENTATION_GUIDE.md` for how the
base OTEL setup works; this doc is specifically about the two request
patterns and how to confirm each one is wired correctly.

---

## What You're Verifying

Two different paths that both end up at the same API route, backend, and
logging/tracing pipeline:

```
SSR:  page (server component) ────────────────────► /api/orders ─► server service ─► sdk ─► backend
CSR:  Redux dispatch ─► client service (browser) ──► /api/orders ─► server service ─► sdk ─► backend
```

What should hold true in both cases:
- The response carries `x-correlation-id` (app-level ID, generated at the true origin) and `x-trace-id` (real OTEL trace, starts at the API route)
- Server-side logs for that request show both IDs together
- Jaeger shows the API route span, and — since the SDK's outbound call is auto-instrumented — a nested `fetch GET https://jsonplaceholder...` child span, all under the same trace ID
- A failing request still returns both IDs, so it's reportable

---

## Setup

```bash
docker-compose up -d          # jaeger + otel-collector
pnpm --filter ibe-app dev     # http://localhost:3000
```

---

## 1. Verify the API Route Directly

This isolates the "api route → server service → sdk" chain from either caller.

```bash
curl -i http://localhost:3000/api/orders
```

**Check for:**
- `x-correlation-id` header — a generated UUID (nothing sent one, so the route made its own)
- `x-trace-id` header — a 32-char hex OTEL trace ID
- Body: `{"success":true,"orders":[...],"correlationId":"...","traceId":"..."}` — same IDs as the headers

Now send your own correlation ID and confirm it passes through unchanged instead of being regenerated:

```bash
curl -i http://localhost:3000/api/orders -H "x-correlation-id: my-test-id-001"
```
`x-correlation-id: my-test-id-001` should come back exactly as sent.

---

## 2. Verify the SSR Path

```bash
curl -s http://localhost:3000/orders-ssr | grep -o 'correlationId.\{0,60\}'
```

Or just open [http://localhost:3000/orders-ssr](http://localhost:3000/orders-ssr) in a browser and view source / check the rendered `correlationId` and `traceId` values on the page.

**What's actually happening:** the page is a server component. It generates a correlation ID with `crypto.randomUUID()` *before* fetching, then calls its own `/api/orders` over a real HTTP request (server components don't get an implicit base URL for self-fetches). There is no client service in this path — check `app/orders-ssr/page.tsx` to see the ID generated right there.

**Confirm it's a fresh ID each load:** refresh the page a few times — the `correlationId` shown should differ each time, since it's generated per-render, not cached.

---

## 3. Verify the CSR Path

Open [http://localhost:3000/orders](http://localhost:3000/orders) in a browser with DevTools open (Network tab).

1. Click **Fetch Orders**
2. Find the request to `/api/orders` in the Network tab
3. **Request Headers** — confirm `x-correlation-id` is present and looks like a UUID (generated in `orders-client-service.ts`, in the browser, before the fetch)
4. **Response Headers** — confirm the *same* `x-correlation-id` comes back, plus `x-trace-id`
5. On the page itself, the rendered `correlationId` / `traceId` under the order list should match what you saw in the Network tab

**What's actually happening:** clicking the button dispatches a Redux thunk (`fetchOrders`). The thunk calls the client service, which generates the correlation ID and does the fetch — Redux's `dispatch()` itself is synchronous; the actual network call and ID generation happen inside the thunk body.

---

## 4. Confirm Trace Correlation in Jaeger

1. Take a `traceId` from any of the above (response header, or the page's rendered value)
2. Open [http://localhost:16686](http://localhost:16686)
3. Paste the trace ID directly into the search box (or select service `ibe-app` → Find Traces → pick the `/api/orders` trace)
4. You should see spans nested like:
   ```
   GET \api\orders\route                                    (root span for this request)
   └─ executing api route (app) \api\orders\route
      └─ fetch GET https://jsonplaceholder.typicode.com/...  ← the SDK's outbound call,
                                                                 auto-instrumented, same trace ID
   ```
5. Expand the API route span → **Logs** section should show `log.info` events (`"GET /api/orders called"`, `"GET /api/orders succeeded"`) each carrying `log.correlation_id` as an attribute, tying the two IDs together inside the trace itself.

If the SDK's `fetch` span is missing, the auto-instrumentation isn't active — check that `instrumentation.ts` → `register()` ran (it logs nothing by itself, but the app should show `resolve page components` spans for every route in the collector logs if it's working at all).

---

## 5. Confirm Correlation Shows Up in Terminal Logs

While the dev server is running, trigger either path (step 1–3) and watch the terminal. You should see lines like:

```
[INFO] 2026-09-05T10:41:07.123Z api/orders - GET /api/orders called (correlation=9b92da9a-..., trace=52bcc4d6...)
[INFO] 2026-09-05T10:41:07.145Z server/orders-service - Fetching orders (correlation=9b92da9a-..., trace=52bcc4d6...)
[INFO] 2026-09-05T10:41:07.170Z sdk/backend-client - Calling backend (correlation=9b92da9a-..., trace=52bcc4d6...)
[INFO] 2026-09-05T10:41:08.740Z sdk/backend-client - Backend call succeeded (correlation=9b92da9a-..., trace=52bcc4d6...)
```

Every layer — API route, server service, sdk — logs with the **same** `correlation` and `trace` values, even though none of them explicitly passed an ID to the next one. That's `AsyncLocalStorage` doing its job: `runWithCorrelationId()` in the route handler makes `getCorrelationId()` return the right value anywhere downstream in the same async call chain, no threading through function parameters required.

---

## 6. Verify a Failure Still Carries Both IDs

Temporarily break the backend call to see the failure path — e.g. edit `packages/sdk/src/index.ts` and change `BACKEND_BASE_URL` to something that will fail (`https://invalid.example.test`), or stop your network temporarily.

**API route directly:**
```bash
curl -i http://localhost:3000/api/orders
```
Expect `502` with a body like `{"success":false,"correlationId":"...","traceId":"...","error":"..."}` — the IDs are still present on failure.

**CSR page:** click **Fetch Orders** — the page should show the red "Request failed" block with `correlationId` and `traceId` still rendered. This confirms `ordersSlice.ts`'s `rejectWithValue` path is carrying the IDs into Redux error state rather than losing them in a thrown error.

**In Jaeger:** the API route span should now show as **failed/red**, not a normal "OK" span — this is `span.recordException()` + `span.setStatus(ERROR)` firing because `logger.error()` was called with the caught error as its third argument.

Remember to revert `BACKEND_BASE_URL` afterward.

---

## Quick Reference: Where Each Piece Lives

| Concern | File |
|---|---|
| Correlation ID storage (AsyncLocalStorage) | `packages/otel/src/correlation.ts` |
| Correlation ID attached to logs/spans | `packages/otel/src/log-helper.ts` |
| SDK's auto-traced outbound call | `packages/sdk/src/index.ts` |
| Single API entry point for both paths | `apps/ibe-app/app/api/orders/route.ts` |
| Server service (in-process, no HTTP hop) | `apps/ibe-app/app/lib/server/orders-service.ts` |
| SSR page (generates its own ID) | `apps/ibe-app/app/orders-ssr/page.tsx` |
| Client service (browser, no `@yourorg/otel` import) | `apps/ibe-app/app/lib/client/orders-client-service.ts` |
| Redux thunk (ID survives into error state) | `apps/ibe-app/app/lib/redux/ordersSlice.ts` |
| CSR demo page | `apps/ibe-app/app/orders/page.tsx` |

---

## Troubleshooting

**No `x-trace-id` header at all** — the request never reached an instrumented span. Confirm `instrumentation.ts` exists at the app root and exports `register` from `@yourorg/otel`.

**`x-correlation-id` differs between request and response** — shouldn't happen; the route always echoes back what it read (or generated). If it does, check nothing else is stripping/rewriting headers (a proxy, middleware, etc.) between the client and the route.

**Terminal logs show `trace=...` but no `correlation=...`** — the log call happened outside `runWithCorrelationId()`'s callback. Every log in the request path needs to happen *after* the route wraps the handler body in `runWithCorrelationId(id, async () => { ... })`.

**SDK's fetch span missing from Jaeger** — see step 4 above.
