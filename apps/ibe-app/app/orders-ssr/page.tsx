import { headers } from "next/headers";
import { createLogger } from "@yourorg/otel";
import { generateTraceparent } from "@yourorg/otel/src/trace-context";

const logger = createLogger("pages/orders-ssr");

// SSR path demo: page (server component) -> /api/orders -> server service
// -> sdk -> backend. Unlike the CSR page, there's no client service - the
// page itself generates a `traceparent` header and calls the same API
// route directly during render, over a real HTTP request (Server
// Components don't get an implicit base URL for self-fetches, hence
// reading `host` from headers()).
export default async function OrdersSSRPage() {
  const host = headers().get("host");
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const baseUrl = `${protocol}://${host}`;

  const traceparent = generateTraceparent();

  logger.info("Rendering orders-ssr page");

  const res = await fetch(`${baseUrl}/api/orders`, {
    headers: { traceparent },
    cache: "no-store",
  });
  const data = await res.json();

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>Orders (SSR demo)</h1>
      <p>
        page (server component) → <code>/api/orders</code> → server service
        → sdk → backend
      </p>

      <p>
        traceId: <code>{data.traceId ?? "n/a"}</code>
      </p>

      {data.success ? (
        <ul>
          {data.orders.map((order: { id: number; title: string; completed: boolean }) => (
            <li key={order.id}>
              #{order.id} {order.title} {order.completed ? "✅" : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ color: "red" }}>Request failed: {data.error}</p>
      )}
    </div>
  );
}
