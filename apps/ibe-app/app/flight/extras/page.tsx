import { renderFlightStep } from "../_lib/render-step";

export default async function FlightExtrasPage() {
  return renderFlightStep({ step: "extras", nextHref: "/flight/review", nextLabel: "Review Booking" });
}
