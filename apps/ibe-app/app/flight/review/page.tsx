import { renderFlightStep } from "../_lib/render-step";

export default async function FlightReviewPage() {
  return renderFlightStep({ step: "review", nextHref: "/flight/payment", nextLabel: "Proceed to Payment" });
}
