/**
 * middleware.js — Origin gate for state-changing /api/* requests (S-P1-4).
 *
 * See src/lib/server/originGuard.js for the threat model and the policy
 * (no-Origin passes; cross-origin POST/PUT/PATCH/DELETE is rejected). Kept
 * dependency-free — plain Response, no next/server import — so the decision
 * logic is directly unit-testable and the middleware bundle stays tiny.
 */
import { shouldBlockOrigin } from "./lib/server/originGuard.js";

export function middleware(request) {
  const origin = request.headers.get("origin");
  // Host enables the dynamic same-origin rule (dev servers on non-3000
  // loopback ports) — see originGuard.js.
  const host = request.headers.get("host");
  if (shouldBlockOrigin(request.method, origin, host)) {
    return Response.json(
      { error: `Cross-origin request blocked: ${origin} may not modify local MTG Tool data.` },
      { status: 403 },
    );
  }
  // No return value: the request continues to the route handler.
}

export const config = { matcher: "/api/:path*" };
