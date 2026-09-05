import { createLogger, getJourneyId, tagJourneyStep } from "@yourorg/otel";
import { callBackend } from "@yourorg/sdk";

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
  // demo, hitting a different demo endpoint per step for variety.
  const data = await callBackend({ path: `/todos/${stepIndex(step)}` });

  logger.info(`Journey step completed: ${step}`, { step });

  return { step, journeyId, data };
}

function stepIndex(step: string): number {
  const idx = STEP_ORDER.indexOf(step);
  return idx >= 0 ? idx + 1 : 1;
}
