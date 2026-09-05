import { renderFlightStep } from "../_lib/render-step";

// Entry point of the flow - middleware.ts always issues a fresh journey_id
// cookie for this exact path, even if a stale one exists.
export default async function FlightSearchPage() {
  return renderFlightStep({ step: "search", nextHref: "/flight/results", nextLabel: "Search Flights" });
}
