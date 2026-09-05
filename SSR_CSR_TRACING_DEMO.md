# 🔍 Testing the SSR / CSR Tracing Demo

This walks through verifying two reference implementations in `apps/ibe-app`:

- **§1–6: the `orders` demo** — correlation-ID tracing across a single SSR
  or CSR request
- **§7: the `flight/*` demo** — `journey_id` correlation across an 8-page
  flow (search → ... → completion), where each page is its own trace

See `OTEL_COMPLETE_IMPLEMENTATION_GUIDE.md` for how the base OTEL setup
works, and `ARCHITECTURE.md` for the design reasoning behind both demos.

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

## 7. Verify the Multi-Page Journey (`journey_id`)

This is a different flow entirely — `apps/ibe-app/app/flight/*` (8 pages:
`search` → `results` → `seats` → `passengers` → `extras` → `review` →
`payment` → `completion`). Each page load is its own trace; `journey_id` is
what ties all 8 together. See `ARCHITECTURE.md` §4 for the full design.

### Walk the flow with a cookie jar

```bash
rm -f /tmp/flight-cookies.txt

# Step 1 - always issues a FRESH journey_id, even over a stale cookie
curl -s -c /tmp/flight-cookies.txt -D - http://localhost:3000/flight/search -o /tmp/search.html \
  | grep -i set-cookie

# Steps 2-8 - same journey_id should appear on every page
for step in results seats passengers extras review payment completion; do
  echo "=== $step ==="
  curl -s -b /tmp/flight-cookies.txt -c /tmp/flight-cookies.txt \
    http://localhost:3000/flight/$step -o /tmp/$step.html
  grep -o 'journeyId:.\{0,50\}' /tmp/$step.html | head -1
done
```

**Confirm:** the same `journeyId` value appears on all 8 pages.

### Verify the fallback path (deep link, no cookie)

```bash
curl -s -D - http://localhost:3000/flight/seats -o /tmp/deeplink.html | grep -i set-cookie
grep -o 'fallback journey_id[^<]*' /tmp/deeplink.html
```
Expect a **new** cookie to be issued and the page to show the
"⚠ fallback journey_id" warning — confirming a deep link mid-flow doesn't
silently pretend to be a normal journey start.

### Verify re-entry issues a fresh journey

```bash
echo "before:"; grep journey_id /tmp/flight-cookies.txt | awk '{print $7}'
curl -s -b /tmp/flight-cookies.txt -c /tmp/flight-cookies2.txt http://localhost:3000/flight/search -o /dev/null
echo "after:"; grep journey_id /tmp/flight-cookies2.txt | awk '{print $7}'
```
The two IDs should differ — hitting `/flight/search` again always starts a
new journey, even with a valid existing cookie.

### Verify the terminal logs

Same as the `orders` demo — but now every line carries `journey=` alongside
`trace=`, and it's the **same `journey=` value across many different
`trace=` values**:

```
[INFO] ... server/flight-journey-service - Journey step: search (journey=abc..., trace=111...)
[INFO] ... server/flight-journey-service - Journey step: results (journey=abc..., trace=222...)
[WARN] ... pages/flight-flow - journey_id missing on entry, generated fallback (journey=xyz..., trace=333...)
[INFO] ... pages/flight-flow - Journey completed (journey=abc..., trace=888...)
```

### Verify Jaeger's tag search returns all 8 traces

This is the actual point of the feature — a single query pulling up an
entire booking attempt from 8 separate traces:

```bash
JID="<paste a journeyId from any /flight/* page>"
curl -s -G "http://localhost:16686/api/traces" \
  --data-urlencode "service=ibe-app" \
  --data-urlencode "tags={\"journey_id\":\"$JID\"}" \
  --data-urlencode "limit=20" | node -e "
let raw='';process.stdin.on('data',c=>raw+=c).on('end',()=>{
const d=JSON.parse(raw);const traces=d.data||[];
console.log('traces returned:', traces.length);
for(const t of traces){const steps=new Set(),status=new Set();
for(const s of t.spans)for(const tag of (s.tags||[])){if(tag.key==='journey_step')steps.add(tag.value);if(tag.key==='journey_status')status.add(tag.value);}
console.log(' ', t.traceID.slice(0,16), '| step:', [...steps].join(',')||'-', '| status:', [...status].join(',')||'-');}
});"
```

Or in the Jaeger UI directly: **Find Traces** → service `ibe-app` → Tags
field → `journey_id=<id>` → **Find Traces**. Expect **8 results**, one per
step, with the completion trace additionally tagged `journey_status=completed`.

You can also confirm this the other way, in the Jaeger UI: open any single
`/flight/*` trace, expand its root span, and check the **Tags** section for
`journey_id` and `journey_step` — if `journey_id` only appears inside a
**Logs** event (not as a top-level tag), the tag search above won't find it;
it needs to be a real span tag, per `ARCHITECTURE.md` Decision 7.

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
| Journey ID storage (AsyncLocalStorage) + span tagging | `packages/otel/src/journey.ts` |
| Journey cookie set/forwarded (Edge runtime) | `apps/ibe-app/middleware.ts` |
| Journey step service (in-process, tags + logs) | `apps/ibe-app/app/lib/server/flight-journey-service.ts` |
| Shared page renderer for all 8 steps | `apps/ibe-app/app/flight/_lib/render-step.tsx` |
| The 8 flow pages | `apps/ibe-app/app/flight/{search,results,seats,passengers,extras,review,payment,completion}/page.tsx` |

---

## Troubleshooting

**No `x-trace-id` header at all** — the request never reached an instrumented span. Confirm `instrumentation.ts` exists at the app root and exports `register` from `@yourorg/otel`.

**Journey pages throw `Cannot read properties of undefined (reading 'attributeCountLimit')`** — this is the Edge-runtime bug described in `ARCHITECTURE.md` §4: adding `middleware.ts` makes Next.js invoke `instrumentation.ts` on Edge too, and `@vercel/otel` isn't Edge-safe. Confirm `instrumentation.ts` gates the import behind `process.env.NEXT_RUNTIME === "nodejs"`.

**`journey_id` tag search in Jaeger returns 0 results** — confirm `tagJourneyStep`/`tagJourneyStatus` are actually being called (check the terminal logs show `journey=` on that request) and that they use `span.setAttribute()`, not just `span.addEvent()` — only real span tags are searchable this way.

**Same `journey_id` unexpectedly appears across unrelated bookings** — likely two tabs/windows sharing one browser profile hit `/flight/search` around the same time; this is the known cookie tab-collision tradeoff in `ARCHITECTURE.md` Decision 6, not a bug.

**`x-correlation-id` differs between request and response** — shouldn't happen; the route always echoes back what it read (or generated). If it does, check nothing else is stripping/rewriting headers (a proxy, middleware, etc.) between the client and the route.

**Terminal logs show `trace=...` but no `correlation=...`** — the log call happened outside `runWithCorrelationId()`'s callback. Every log in the request path needs to happen *after* the route wraps the handler body in `runWithCorrelationId(id, async () => { ... })`.

**SDK's fetch span missing from Jaeger** — see step 4 above.
