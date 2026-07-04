/**
 * /api/pod-balance/rate — persist a machine power rating into its owning
 * profile (wave E5; Colton's choice 2026-07-04: "into each deck's own profile").
 *
 * POST { deckId, powerRank } → find which profile owns deckId (across ALL
 * profiles), write memory.powerRank into that profile's decks.local.json
 * (additive, shape-guarded, atomic), and return { ok, profileId }. This is
 * how a rating computed for ANOTHER player's deck (e.g. Joe's) sticks across
 * sessions — the active-user's own decks already persist via the deck store.
 *
 * Fully local; the rating is a derived/additive field (never destructive user
 * content), the same shape auto-rate writes for your own decks.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";
import path from "node:path";

import { atomicWriteJson } from "../../../../lib/server/atomicJson.js";
import { profilesRegistryPath } from "../../../../lib/server/paths.js";

function validRank(pr) {
  return pr && typeof pr === "object"
    && Number.isFinite(pr.powerLevel)
    && (pr.bracket == null || Number.isFinite(pr.bracket));
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const deckId = typeof body?.deckId === "string" ? body.deckId : null;
  if (!deckId) return Response.json({ error: "deckId is required." }, { status: 400 });
  if (!validRank(body?.powerRank)) {
    return Response.json({ error: "powerRank must be { powerLevel:number, bracket?, bracketLabel?, ratedAt? }." }, { status: 400 });
  }
  // Normalize to exactly the stored shape (never trust extra fields through).
  const powerRank = {
    powerLevel: body.powerRank.powerLevel,
    bracket: body.powerRank.bracket ?? null,
    bracketLabel: typeof body.powerRank.bracketLabel === "string" ? body.powerRank.bracketLabel : "",
    ratedAt: typeof body.powerRank.ratedAt === "string" ? body.powerRank.ratedAt : new Date().toISOString(),
  };

  try {
    const registryDir = path.dirname(profilesRegistryPath());
    let reg;
    try {
      reg = JSON.parse(await fs.readFile(profilesRegistryPath(), "utf8"));
    } catch {
      return Response.json({ error: "No profiles registry." }, { status: 404 });
    }
    const profiles = Array.isArray(reg?.profiles) ? reg.profiles : [];

    // Find the profile whose decks.local.json contains deckId, and write there.
    for (const p of profiles) {
      const file = path.join(registryDir, "profiles", p.id, "decks.local.json");
      let parsed;
      try {
        parsed = JSON.parse(await fs.readFile(file, "utf8"));
      } catch {
        continue; // profile has no deck file yet
      }
      const decks = Array.isArray(parsed) ? parsed : (parsed.decks || []);
      const idx = decks.findIndex((d) => (d.id || d.name) === deckId);
      if (idx < 0) continue;

      const deck = decks[idx];
      deck.memory = { ...(deck.memory || {}), powerRank };
      // Write back in the same shape we read (bare array or { decks }).
      const out = Array.isArray(parsed) ? decks : { ...parsed, decks };
      await atomicWriteJson(file, out);
      return Response.json({ ok: true, profileId: p.id });
    }

    return Response.json({ error: "No profile owns that deckId." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to persist rating." }, { status: 500 });
  }
}
