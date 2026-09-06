import { AsyncLocalStorage } from "async_hooks";

// external_correlation_id identifies one outbound call to a system WE DO
// NOT CONTROL - a third-party vendor like a PSS (Passenger Service System)
// or POP integration. This is deliberately NOT the same mechanism as
// trace_id/traceparent (see trace-context.ts):
//
// For boundaries we control (browser -> our Next.js server -> our own Java
// backend), traceparent is strictly better - both ends run real OTEL, both
// extract/propagate it automatically, giving one true distributed trace
// with zero custom code.
//
// For an external vendor system, we CANNOT assume that. PSS/POP almost
// certainly doesn't run OTEL and won't extract or forward a traceparent
// header the way our own services would. Sending it a "correlation id"
// buys nothing from THEM automatically continuing anything - the value is
// entirely on OUR side: our own request/response logs record "we sent PSS
// this exact ID, on this exact request," which is durable and searchable
// on our end regardless of what the external system does with it.
//
// Bottom line: this module exists specifically for the our-system ->
// external-system boundary. It is NOT used for browser -> our-server
// anymore (traceparent replaced that use case entirely).
const externalCorrelationIdStorage = new AsyncLocalStorage<string>();

export function runWithExternalCorrelationId<T>(id: string, fn: () => T): T {
  return externalCorrelationIdStorage.run(id, fn);
}

export function getExternalCorrelationId(): string | undefined {
  return externalCorrelationIdStorage.getStore();
}
