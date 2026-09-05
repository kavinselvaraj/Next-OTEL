import { createLogger, getTraceContext } from "@yourorg/otel";
import { NextRequest, NextResponse } from "next/server";

const logger = createLogger("api/test-logs");

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  logger.info("GET /api/test-logs called", {
    method: request.method,
    url: request.url,
    userAgent: request.headers.get("user-agent"),
    requestId,
  });

  try {
    // Simulate some processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    const duration = Date.now() - startTime;

    // Success response structure
    const successResponse = {
      success: true,
      status: "completed",
      requestId,
      data: {
        message: "Logs are working perfectly!",
        timestamp: new Date().toISOString(),
        message_type: "info",
      },
      metadata: {
        duration: `${duration}ms`,
        responseTime: duration,
        statusCode: 200,
      },
    };

    logger.info("Request successful", {
      requestId,
      status: 200,
      dataSize: JSON.stringify(successResponse).length,
      duration: `${duration}ms`,
      message: "Logs are working perfectly!",
      timestamp: new Date().toISOString(),
      date: new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
      time: new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }),
    });

    const traceId = getTraceContext()?.traceId;

    return NextResponse.json(successResponse, {
      status: 200,
      headers: traceId ? { "x-trace-id": traceId } : undefined,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const traceId = getTraceContext()?.traceId;

    // Error response structure
    const errorResponse = {
      success: false,
      status: "error",
      requestId,
      traceId,
      error: {
        message: errorMessage,
        code: "INTERNAL_SERVER_ERROR",
        details: error instanceof Error ? error.stack : undefined,
      },
      metadata: {
        duration: `${duration}ms`,
        responseTime: duration,
        statusCode: 500,
        timestamp: new Date().toISOString(),
      },
    };

    // Pass the caught error as the 3rd arg so it's recorded on the span
    // (span.recordException) and the span status is marked ERROR in Jaeger.
    logger.error(
      "Request failed",
      {
        requestId,
        status: 500,
        error: errorMessage,
        errorCode: "INTERNAL_SERVER_ERROR",
        duration: `${duration}ms`,
      },
      error
    );

    return NextResponse.json(errorResponse, {
      status: 500,
      headers: traceId ? { "x-trace-id": traceId } : undefined,
    });
  }
}
