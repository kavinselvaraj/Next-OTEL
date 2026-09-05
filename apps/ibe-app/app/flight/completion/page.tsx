import { renderFlightStep } from "../_lib/render-step";

// Terminal step - render-step.tsx calls tagJourneyStatus(journeyId, "completed")
// specifically when step === "completion".
export default async function FlightCompletionPage() {
  return renderFlightStep({ step: "completion" });
}
