import { renderFlightStep } from "../_lib/render-step";

export default async function FlightResultsPage() {
  return renderFlightStep({ step: "results", nextHref: "/flight/seats", nextLabel: "Select Seats" });
}
