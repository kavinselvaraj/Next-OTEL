import { LoggerProvider, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";

let loggerProvider: LoggerProvider | null = null;

export function initializeLoggerProvider() {
  if (loggerProvider) return loggerProvider;

  loggerProvider = new LoggerProvider();

  // Note: Logs are collected by the LoggerProvider
  // Jaeger will receive them via the standard OTEL SDK's metrics/logs collection
  // The @vercel/otel package handles exporting logs automatically

  return loggerProvider;
}

export function getLogger(name: string) {
  const provider = initializeLoggerProvider();
  return provider.getLogger(name);
}
