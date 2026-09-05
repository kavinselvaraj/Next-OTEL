import { renderFlightStep } from "../_lib/render-step";

export default async function FlightPaymentPage() {
  return renderFlightStep({ step: "payment", nextHref: "/flight/completion", nextLabel: "Complete Booking" });
}
