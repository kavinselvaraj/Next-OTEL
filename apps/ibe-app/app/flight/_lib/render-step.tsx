import { cookies, headers } from "next/headers";
import { createLogger, getTraceContext, runWithJourneyId, tagJourneyStatus } from "@yourorg/otel";
import { recordJourneyStep } from "../../lib/server/flight-journey-service";

const logger = createLogger("pages/flight-flow");
const JOURNEY_COOKIE = "journey_id";

export async function renderFlightStep({
  step,
  nextHref,
  nextLabel,
}: {
  step: string;
  nextHref?: string;
  nextLabel?: string;
}) {
  const journeyId = cookies().get(JOURNEY_COOKIE)?.value;
  const isFallback = headers().get("x-journey-fallback") === "1";

  if (!journeyId) {
    // Shouldn't happen - middleware.ts guarantees the cookie exists for
    // every /flight/* route - but fail loudly rather than silently if it
    // somehow does (e.g. middleware.ts's matcher was edited).
    throw new Error(`No journey_id cookie present on step "${step}"`);
  }

  return runWithJourneyId(journeyId, async () => {
    if (isFallback) {
      logger.warn("journey_id missing on entry, generated fallback", { step });
    }

    const result = await recordJourneyStep(step);

    if (step === "completion") {
      tagJourneyStatus(journeyId, "completed");
      logger.info("Journey completed");
    }

    const traceId = getTraceContext()?.traceId;

    return (
      <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "600px" }}>
        <h1>Flight Booking — {step}</h1>
        <p>
          journeyId: <code>{journeyId}</code>
          <br />
          traceId: <code>{traceId ?? "n/a"}</code>
          {isFallback && (
            <>
              <br />
              <span style={{ color: "#b45309" }}>⚠ fallback journey_id (no cookie found)</span>
            </>
          )}
        </p>

        <pre style={{ background: "#f0f0f0", padding: "10px", overflowX: "auto" }}>
          {JSON.stringify(result.data, null, 2)}
        </pre>

        {step === "completion" ? (
          <p style={{ fontWeight: "bold" }}>✅ Booking complete!</p>
        ) : (
          nextHref && (
            <a href={nextHref}>
              <button>{nextLabel ?? "Next"}</button>
            </a>
          )
        )}
      </div>
    );
  });
}
