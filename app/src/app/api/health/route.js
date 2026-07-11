/**
 * /api/health — server identity endpoint. Two consumers, one payload:
 *
 * 1. The Tauri shell's readiness gate. The shell generates a random MTG_LAUNCH_NONCE
 *    per launch and passes it to the node it spawns; it then polls this route and
 *    requires the nonce to ECHO BACK before treating port 3000 as "ready". A stale
 *    orphaned server from an older build (the 2026-07-09 ghost-registry incident: an
 *    old worktree build's node squatting on :3000, serving months-old code + a dead
 *    profile registry while every fresh launch silently attached to it) has a
 *    different nonce — or, like pre-health builds, 404s here — so the shell detects
 *    the hijack instead of blindly trusting any listener on the port.
 *
 * 2. The Sim Center's freshness confession. The page polls this route and compares
 *    { version, registryId, activeProfile } against the identity it loaded its deck
 *    list under (and, in the .exe, against the shell's own version). Any drift —
 *    server ≠ shell, registry changed on disk, active profile switched — flips the
 *    green box amber and disables the Run button: stale can render, not launch.
 *
 *    version     — the server bundle's package.json version (build-time constant;
 *                  an orphaned old server reports its OLD version = one-line skew).
 *    registryId  — 8-hex content hash of the live profiles registry (ids + names +
 *                  active pointer), read via the same profiles.js the profiles API
 *                  uses. Changes iff the registry changes on disk.
 *    activeProfile — { id, name } of the active profile, or null pre-migration.
 *
 * A registry failure must NOT break the shell's readiness gate, so it rides the
 * payload as registryError (the Sim Center treats it as stale) instead of a 500.
 */

export const runtime = "nodejs";

import crypto from "node:crypto";

import pkg from "../../../../package.json";
import { listProfiles } from "../../../lib/server/profiles.js";

export async function GET() {
  let registryId = null;
  let activeProfile = null;
  let registryError = null;
  try {
    // listProfiles runs the one-time migration, so even a fresh install reports a
    // real registry identity (the same call path /api/profiles serves the picker from).
    const { profiles, activeProfileId } = listProfiles();
    registryId = crypto
      .createHash("sha256")
      .update(JSON.stringify({ profiles: profiles.map((p) => ({ id: p.id, name: p.name })), activeProfileId }))
      .digest("hex")
      .slice(0, 8);
    const active = profiles.find((p) => p.id === activeProfileId) || null;
    activeProfile = active ? { id: active.id, name: active.name } : null;
  } catch (error) {
    registryError = error?.message || String(error); // surfaced in the payload — the client flips amber
  }

  return Response.json(
    {
      ok: true,
      nonce: process.env.MTG_LAUNCH_NONCE ?? null,
      pid: process.pid,
      version: process.env.npm_package_version || pkg.version,
      registryId,
      activeProfile,
      registryError,
      now: Date.now(),
    },
    {
      // The loading placeholder is served from the tauri:// origin and must be able
      // to READ this response (an opaque no-cors probe can't distinguish our server
      // from a stale one). Identity info only — safe to expose on localhost.
      headers: { "Access-Control-Allow-Origin": "*" },
    },
  );
}
