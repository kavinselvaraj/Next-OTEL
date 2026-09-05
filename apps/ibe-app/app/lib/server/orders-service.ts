import { createLogger } from "@yourorg/otel";
import { callBackend } from "@yourorg/sdk";

const logger = createLogger("server/orders-service");

export interface Order {
  id: number;
  title: string;
  completed: boolean;
}

// This is imported directly by the API route (a plain function call, not
// an HTTP request) - the OTEL span opened for the incoming API request
// stays active across this call automatically via AsyncLocalStorage, so
// nothing here needs to touch tracing directly. It just calls the SDK and
// adds domain-specific logging around it.
export async function getOrders(): Promise<Order[]> {
  logger.info("Fetching orders");

  const orders = await callBackend<Order[]>({ path: "/todos?_limit=5" });

  logger.info("Orders fetched", { count: orders.length });

  return orders;
}
