import { createLogger, getTraceContext, runWithCorrelationId } from "@yourorg/otel";
import { NextRequest, NextResponse } from "next/server";
import { getOrders } from "../../lib/server/orders-service";

const logger = createLogger("api/orders");

// One route serves both call patterns:
//   SSR:  page (server component) -> fetch here directly
//   CSR:  client service (browser) -> fetch here
// Both are expected to send `x-correlation-id`; if it's missing (a caller
// forgot, or someone hits this directly) one is generated so the rest of
// the chain still has something to log against.
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get("x-correlation-id") ?? crypto.randomUUID();

  return runWithCorrelationId(correlationId, async () => {
    const startTime = Date.now();

    logger.info("GET /api/orders called", {
      userAgent: request.headers.get("user-agent"),
    });

    const traceId = getTraceContext()?.traceId;
    const responseHeaders: Record<string, string> = { "x-correlation-id": correlationId };
    if (traceId) responseHeaders["x-trace-id"] = traceId;

    try {
      const orders = await getOrders();
      const duration = Date.now() - startTime;

      logger.info("GET /api/orders succeeded", {
        count: orders.length,
        duration: `${duration}ms`,
      });

      return NextResponse.json(
        { success: true, orders, correlationId, traceId },
        { status: 200, headers: responseHeaders }
      );
    } catch (error) {
      const duration = Date.now() - startTime;

      // 3rd arg records the exception on the active span (recordException +
      // setStatus ERROR) - this request's span shows as failed in Jaeger.
      logger.error(
        "GET /api/orders failed",
        { duration: `${duration}ms` },
        error
      );

      return NextResponse.json(
        {
          success: false,
          correlationId,
          traceId,
          error: error instanceof Error ? error.message : String(error),
        },
        { status: 502, headers: responseHeaders }
      );
    }
  });
}
