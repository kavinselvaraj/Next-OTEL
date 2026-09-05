import { context, trace } from "@opentelemetry/api";

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

export function createLogger(name: string) {
  return {
    log(level: LogLevel, message: string, attributes?: LogAttributes) {
      const timestamp = new Date().toISOString();
      const color = colorMap[level];

      // Console output with color
      const prefix = `${color}[${level}]${resetColor}`;
      console.log(`${prefix} ${timestamp} ${name} - ${message}`, attributes || "");

      // Also add to current span as an event (visible in Jaeger)
      try {
        const span = trace.getActiveSpan();
        if (span) {
          span.addEvent(`log.${level.toLowerCase()}`, {
            "log.message": message,
            "log.level": level,
            "log.logger": name,
            ...(attributes && flattenAttributes(attributes)),
          });
        }
      } catch (error) {
        // Span context might not be available
      }
    },

    info(message: string, attributes?: LogAttributes) {
      this.log("INFO", message, attributes);
    },

    error(message: string, attributes?: LogAttributes) {
      this.log("ERROR", message, attributes);
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
