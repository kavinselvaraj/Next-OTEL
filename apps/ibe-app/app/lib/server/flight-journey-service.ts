import { createLogger, getJourneyId, tagJourneyStep, runWithExternalCorrelationId } from "@yourorg/otel";
import { callBackend, callExternalSystem } from "@yourorg/sdk";

const logger = createLogger("server/flight-journey-service");

const STEP_ORDER = [
  "search",
  "results",
  "seats",
  "passengers",
  "extras",
  "review",
  "payment",
  "completion",
];

export interface JourneyStepResult {
  step: string;
  journeyId: string;
  data: unknown;
  externalCorrelationId?: string;
}

// Called once per page in the flight-search -> completion flow. Tags the
// active span + logs with journey_id and the step name, so this page's
// trace is findable alongside the other 7 via Jaeger's tag search
// (journey_id=<id>), even though each page load is its own separate trace.
export async function recordJourneyStep(step: string): Promise<JourneyStepResult> {
  const journeyId = getJourneyId();
  if (!journeyId) {
    throw new Error(`recordJourneyStep("${step}") called outside runWithJourneyId`);
  }

  tagJourneyStep(journeyId, step);
  logger.info(`Journey step: ${step}`, { step });

  // Stand-in for a real per-step backend call (availability, pricing, seat
  // map, etc.) - reuses the same auto-instrumented SDK call as the orders
  // demo, hitting a different demo endpoint per step for variety. This is
  // OUR OWN backend (OTEL-aware) - the active trace_id propagates onto it
  // automatically, no correlation-id code needed.
  const data = await callBackend({ path: `/todos/${stepIndex(step)}` });

  // The payment step is where a real flight-booking flow would call out to
  // an external PSS/POP system (e.g. to confirm the fare, hold the
  // reservation, or process payment). That's a system we don't control and
  // can't assume runs OTEL - so this specific call uses
  // runWithExternalCorrelationId() + callExternalSystem() instead of
  // relying on trace propagation alone. See packages/sdk's
  // callExternalSystem() and ARCHITECTURE.md's external-correlation
  // decision for the full reasoning.
  let externalCorrelationId: string | undefined;
  if (step === "payment") {
    externalCorrelationId = crypto.randomUUID();
    await runWithExternalCorrelationId(externalCorrelationId, async () => {
      logger.info("Calling external PSS/POP for payment confirmation", { externalCorrelationId });
      await callExternalSystem({ path: "/posts/1" }); // distinct demo path, so it's visually distinguishable from the callBackend() call above in Jaeger
      logger.info("External PSS/POP confirmed payment", { externalCorrelationId });
    });
  }

  logger.info(`Journey step completed: ${step}`, { step });

  return { step, journeyId, data, externalCorrelationId };
}

function stepIndex(step: string): number {
  const idx = STEP_ORDER.indexOf(step);
  return idx >= 0 ? idx + 1 : 1;
}
