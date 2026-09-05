import { trace, SpanStatusCode } from "@opentelemetry/api";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const colorMap: Record<LogLevel, string> = {
  DEBUG: "\x1b[36m",   // Cyan
  INFO: "\x1b[32m",    // Green
  WARN: "\x1b[33m",    // Yellow
  ERROR: "\x1b[31m",   // Red
};

const resetColor = "\x1b[0m";

export interface LogAttributes {
  [key: string]: string | number | boolean | undefined | any;
}

// Returns the active trace/span IDs, or undefined if there is no active span
// (e.g. code running outside a request context).
export function getTraceContext(): { traceId: string; spanId: string } | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;

  const ctx = span.spanContext();
  if (!ctx || ctx.traceId === "00000000000000000000000000000000") return undefined;

  return { traceId: ctx.traceId, spanId: ctx.spanId };
}

export function createLogger(name: string) {
  return {
    log(level: LogLevel, message: string, attributes?: LogAttributes, err?: unknown) {
      const timestamp = new Date().toISOString();
      const color = colorMap[level];
      const traceContext = getTraceContext();

      // JSON object for structured logging
      const logObject = {
        timestamp,
        level,
        logger: name,
        message,
        ...(traceContext && { trace_id: traceContext.traceId, span_id: traceContext.spanId }),
        ...(attributes && attributes),
      };

      if (process.env.NODE_ENV === "production") {
        // Production: JSON Lines format (one JSON object per line) - for CloudWatch, Datadog, etc.
        console.log(JSON.stringify(logObject));
      } else {
        // Development: Pretty-printed format with colors
        const prefix = `${color}[${level}]${resetColor}`;
        const traceSuffix = traceContext ? ` (trace=${traceContext.traceId})` : "";
        console.log(`${prefix} ${timestamp} ${name} - ${message}${traceSuffix}`);
        if (attributes && Object.keys(attributes).length > 0) {
          console.log(JSON.stringify(attributes, null, 2));
        }
      }

      // Attach to the active span so it's visible in Jaeger, and mark the
      // span as failed when logging an error with a real Error object.
      try {
        const span = trace.getActiveSpan();
        if (span) {
          span.addEvent(`log.${level.toLowerCase()}`, {
            "log.message": message,
            "log.level": level,
            "log.logger": name,
            ...(attributes && flattenAttributes(attributes)),
          });

          if (level === "ERROR") {
            if (err instanceof Error) {
              span.recordException(err);
            }
            span.setStatus({ code: SpanStatusCode.ERROR, message });
          }
        }
      } catch (spanError) {
        // Span context might not be available
      }
    },

    info(message: string, attributes?: LogAttributes) {
      this.log("INFO", message, attributes);
    },

    // Pass the caught error as the third argument to record it on the span
    // (span.recordException) and mark the span status as ERROR.
    error(message: string, attributes?: LogAttributes, err?: unknown) {
      this.log("ERROR", message, attributes, err);
    },

    warn(message: string, attributes?: LogAttributes) {
      this.log("WARN", message, attributes);
    },

    debug(message: string, attributes?: LogAttributes) {
      this.log("DEBUG", message, attributes);
    },
  };
}

// Flatten attributes for OTEL (nested objects become dot-notation keys)
function flattenAttributes(obj: LogAttributes, prefix = ""): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      continue;
    } else if (typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenAttributes(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }

  return result;
}

export type Logger = ReturnType<typeof createLogger>;
