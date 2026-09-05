"use client";

import { useAppDispatch, useAppSelector } from "../lib/redux/hooks";
import { fetchOrders } from "../lib/redux/ordersSlice";

// CSR path demo: Redux dispatch -> client service -> api route -> server
// service -> sdk. Open devtools network tab and watch the request to
// /api/orders carry an `x-correlation-id` header generated in
// orders-client-service.ts, and the response echo it back alongside
// `x-trace-id` (the real OTEL trace, which only starts at the API route).
export default function OrdersPage() {
  const dispatch = useAppDispatch();
  const { orders, status, error, correlationId, traceId } = useAppSelector(
    (state) => state.orders
  );

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>Orders (CSR demo)</h1>
      <p>
        Redux dispatch → client service → <code>/api/orders</code> → server
        service → sdk → backend
      </p>

      <button onClick={() => dispatch(fetchOrders())} disabled={status === "loading"}>
        {status === "loading" ? "Loading..." : "Fetch Orders"}
      </button>

      {status === "succeeded" && (
        <div style={{ marginTop: "16px" }}>
          <p>
            correlationId: <code>{correlationId}</code>
            <br />
            traceId: <code>{traceId ?? "n/a"}</code>
          </p>
          <ul>
            {orders.map((order) => (
              <li key={order.id}>
                #{order.id} {order.title} {order.completed ? "✅" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {status === "failed" && (
        <div style={{ marginTop: "16px", color: "red" }}>
          <p>Request failed: {error}</p>
          <p>
            correlationId: <code>{correlationId ?? "n/a"}</code>
            <br />
            traceId: <code>{traceId ?? "n/a"}</code>
          </p>
        </div>
      )}
    </div>
  );
}
