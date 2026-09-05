import { renderFlightStep } from "../_lib/render-step";

export default async function FlightSeatsPage() {
  return renderFlightStep({ step: "seats", nextHref: "/flight/passengers", nextLabel: "Passenger Details" });
}
