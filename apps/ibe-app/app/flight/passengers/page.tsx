import { renderFlightStep } from "../_lib/render-step";

export default async function FlightPassengersPage() {
  return renderFlightStep({ step: "passengers", nextHref: "/flight/extras", nextLabel: "Add Extras" });
}
