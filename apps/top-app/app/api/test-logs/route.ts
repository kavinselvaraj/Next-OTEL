import { createLogger } from "@yourorg/otel";
import { NextRequest, NextResponse } from "next/server";

const logger = createLogger("api/test-logs");

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  logger.info("GET /api/test-logs called", {
    method: request.method,
    url: request.url,
    userAgent: request.headers.get("user-agent"),
  });

  try {
    const data = {
      message: "Logs are working in top-app!",
      timestamp: new Date().toISOString(),
      status: "success",
    };

    const duration = Date.now() - startTime;

    logger.info("Request successful", {
      status: 200,
      dataSize: JSON.stringify(data).length,
      duration: `${duration}ms`,
    });

    return NextResponse.json(data);
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error("Request failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${duration}ms`,
    });

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
