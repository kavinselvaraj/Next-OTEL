import { NextRequest, NextResponse } from "next/server";

const JOURNEY_COOKIE = "journey_id";
const JOURNEY_TTL_SECONDS = 45 * 60; // 45 minutes - roughly the max time a real booking flow should take

// Runs on the Edge runtime (Next.js default for middleware). Deliberately
// does NOT import @yourorg/otel - that package uses Node's async_hooks for
// correlation/journey context, which doesn't exist on Edge. This file's
// only job is guaranteeing a journey_id cookie exists before any /flight/*
// page renders. The actual tracing/logging happens once the request
// reaches a Node-runtime page (see app/flight/_lib/render-step.tsx).
export function middleware(request: NextRequest) {
  const isFlowEntryPoint = request.nextUrl.pathname === "/flight/search";
  const existingId = request.cookies.get(JOURNEY_COOKIE)?.value;

  // A fresh visit to the entry point always starts a new journey, even if a
  // stale cookie from an old/abandoned attempt is present. Any other step
  // just needs the cookie to exist - if it already does, nothing to do.
  if (!isFlowEntryPoint && existingId) {
    return NextResponse.next();
  }

  const journeyId = crypto.randomUUID();
  // True only when a LATER step was reached with no cookie at all (deep
  // link, expired TTL, cleared cookies) - distinct from the entry point,
  // which always "regenerates" by design. Downstream pages log this as a
  // warning instead of treating it as a normal fresh journey start.
  const isFallback = !isFlowEntryPoint;

  // Server Components can't set cookies themselves, so mutating the
  // request's cookie here is the only way THIS render's cookies() call
  // (in the page that's about to render) sees the new value immediately.
  request.cookies.set(JOURNEY_COOKIE, journeyId);

  const requestHeaders = new Headers(request.headers);
  if (isFallback) {
    requestHeaders.set("x-journey-fallback", "1");
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Set it on the response too, so the browser stores it for every
  // subsequent page load in the flow.
  response.cookies.set(JOURNEY_COOKIE, journeyId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: JOURNEY_TTL_SECONDS,
  });

  return response;
}

export const config = {
  matcher: ["/flight/:path*"],
};
