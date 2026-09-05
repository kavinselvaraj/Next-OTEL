import { AsyncLocalStorage } from "async_hooks";
import { trace } from "@opentelemetry/api";

// journey_id identifies one multi-page user flow (e.g. flight search ->
// completion, 8 separate page loads / 8 separate OTEL traces). Unlike
// correlation_id (correlation.ts - regenerated per request, ties one
// browser call to one server response), journey_id is generated ONCE at
// the start of the flow and persists - via a cookie set in middleware.ts,
// since Server Components cannot set cookies themselves - across every
// subsequent page load until the flow ends.
//
// A trace is bounded to a single request; forcing an 8-page, multi-minute
// flow into one OTEL trace would produce an unusable waterfall. journey_id
// is instead set as a SPAN ATTRIBUTE (not just a log field) on every
// page/route's root span, so Jaeger's tag search (`journey_id=<id>`)
// returns every trace across all 8 pages that share it - a business-level
// correlation layered on top of normal per-request tracing, not a
// replacement for it.
const journeyIdStorage = new AsyncLocalStorage<string>();

export function runWithJourneyId<T>(id: string, fn: () => T): T {
  return journeyIdStorage.run(id, fn);
}

export function getJourneyId(): string | undefined {
  return journeyIdStorage.getStore();
}

// Tags the active span with journey_id + the current step name. Call this
// once per page/route, right after entering runWithJourneyId. This - not
// the log line - is what makes the journey queryable across traces: Jaeger
// searches span tags, not nested log-event fields.
export function tagJourneyStep(journeyId: string, step: string) {
  const span = trace.getActiveSpan();
  if (!span) return;

  span.setAttribute("journey_id", journeyId);
  span.setAttribute("journey_step", step);
  span.addEvent("journey.step", { journey_id: journeyId, step });
}

// Call on the terminal page of the flow to mark it finished (or explicitly
// abandoned, if you have a signal for that) - this is what turns "the last
// step seen" into an actual queryable completion rate later.
export function tagJourneyStatus(journeyId: string, status: "completed" | "abandoned") {
  const span = trace.getActiveSpan();
  if (!span) return;

  span.setAttribute("journey_id", journeyId);
  span.setAttribute("journey_status", status);
  span.addEvent("journey.status", { journey_id: journeyId, status });
}
