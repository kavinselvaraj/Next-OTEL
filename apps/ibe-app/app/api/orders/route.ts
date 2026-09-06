import { createLogger, getTraceContext } from "@yourorg/otel";
import { NextRequest, NextResponse } from "next/server";
import { getOrders } from "../../lib/server/orders-service";

const logger = createLogger("api/orders");

// One route serves both call patterns:
//   SSR:  page (server component) -> fetch here directly
//   CSR:  client service (browser) -> fetch here
//
// No manual correlation-id handling here anymore. Both callers send a
// `traceparent` header instead of a custom one - @vercel/otel's
// auto-instrumentation extracts it automatically BEFORE this handler even
// runs, so getTraceContext().traceId below already IS the exact trace-id
// the caller generated. See packages/otel/src/trace-context.ts and
// ARCHITECTURE.md's traceparent decision for why this replaces the old
// x-correlation-id mechanism entirely for boundaries we control.
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  logger.info("GET /api/orders called", {
    userAgent: request.headers.get("user-agent"),
  });

  const traceId = getTraceContext()?.traceId;
  const responseHeaders: Record<string, string> = {};
  if (traceId) responseHeaders["x-trace-id"] = traceId;

  try {
    const orders = await getOrders();
    const duration = Date.now() - startTime;

    logger.info("GET /api/orders succeeded", {
      count: orders.length,
      duration: `${duration}ms`,
    });

    return NextResponse.json(
      { success: true, orders, traceId },
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
        traceId,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 502, headers: responseHeaders }
    );
  }
}
