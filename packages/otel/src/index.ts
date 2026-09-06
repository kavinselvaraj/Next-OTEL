import { registerOTel } from "@vercel/otel";
import { initializeLoggerProvider } from "./logger";

export { getLogger } from "./logger";
export { createLogger, getTraceContext } from "./log-helper";
export type { Logger, LogLevel, LogAttributes } from "./log-helper";
export { runWithExternalCorrelationId, getExternalCorrelationId } from "./external-correlation";
export { runWithJourneyId, getJourneyId, tagJourneyStep, tagJourneyStatus } from "./journey";

// NOTE: generateTraceparent (trace-context.ts) is intentionally NOT
// re-exported here. This file's top-level import of @vercel/otel is
// Node-only; anything imported from this main entry point is unsafe in a
// browser or Edge-runtime file. Import the browser-safe generator via its
// direct subpath instead: `@yourorg/otel/src/trace-context`.

export function register() {
  initializeLoggerProvider();

  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "unknown-service",
    traceExporter: "auto",
  });
}
