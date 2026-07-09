/**
 * /api/health — server identity endpoint for the Tauri shell's readiness gate.
 *
 * The shell generates a random MTG_LAUNCH_NONCE per launch and passes it to the node it
 * spawns; it then polls this route and requires the nonce to ECHO BACK before treating
 * port 3000 as "ready". A stale orphaned server from an older build (the 2026-07-09
 * ghost-registry incident: an old worktree build's node squatting on :3000, serving
 * months-old code + a dead profile registry while every fresh launch silently attached
 * to it) has a different nonce — or, like pre-health builds, 404s here — so the shell
 * detects the hijack instead of blindly trusting any listener on the port.
 */

export const runtime = "nodejs";

export async function GET() {
  return Response.json(
    {
      ok: true,
      nonce: process.env.MTG_LAUNCH_NONCE ?? null,
      pid: process.pid,
    },
    {
      // The loading placeholder is served from the tauri:// origin and must be able
      // to READ this response (an opaque no-cors probe can't distinguish our server
      // from a stale one). Identity info only — safe to expose on localhost.
      headers: { "Access-Control-Allow-Origin": "*" },
    },
  );
}
