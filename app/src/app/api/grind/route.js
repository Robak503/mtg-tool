/**
 * /api/grind — the continuous GRIND BUTTON (run-until-cancel). POST {action:"start"} kicks off a background
 * grind loop (grindLoop.js singleton) that plays random balanced pods with the selected persona and appends one
 * file per game to the data-lifecycle store; POST {action:"cancel"} requests a graceful stop (finish the in-flight
 * game); GET returns live status (games played, running, cap). Mirrors /api/self-play's deck loading + pilot injection.
 */

export const runtime = "nodejs";

import {
  toRunnerDeck,
  partitionPlayableRunnerDecks,
  loadAllProfileDecks,
  selectDecksByIds,
  decksForActiveProfile,
} from "../../../lib/server/selfPlayDecks.js";
import { loadPilotBuilder } from "../../../lib/server/pilotLoader.js";
import { startGrind, requestGrindCancel, grindStatus } from "../../../lib/learn/grindLoop.js";
import { summarizeGrind } from "../../../lib/learn/gameLogStore.js";

// GET returns live status; GET ?results=1 also returns the standings summary (per-deck W/L, winner split, totals).
export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("results")) {
      return Response.json({ status: grindStatus(), results: await summarizeGrind() });
    }
  } catch {
    /* fall through to status */
  }
  return Response.json(grindStatus());
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  const action = body?.action;
  if (action === "cancel") {
    return Response.json(requestGrindCancel());
  }
  if (action === "status") {
    return Response.json(grindStatus());
  }
  if (action !== "start") {
    return Response.json({ error: 'action must be "start", "cancel", or "status".' }, { status: 400 });
  }

  const mode = body?.mode === "standard" ? "standard" : "commander";
  const podSize = mode === "commander" ? 4 : 2;
  const deckIds = Array.isArray(body?.deckIds) ? body.deckIds.filter((id) => typeof id === "string" && id) : [];
  const capGB = Number.isFinite(body?.capGB) && body.capGB > 0 ? body.capGB : null;
  const capBytes = capGB ? Math.round(capGB * 1024 * 1024 * 1024) : null;
  const pilotFile = typeof body?.pilot === "string" && body.pilot ? body.pilot : null;

  // Resolve decks (cross-profile when asked — the 13-deck set spans two profiles), enrich, drop empties.
  let pool;
  try {
    pool = body?.allProfiles ? await loadAllProfileDecks() : await decksForActiveProfile();
  } catch (error) {
    return Response.json({ error: error?.message || "Could not load decks." }, { status: 500 });
  }
  const rawDecks = deckIds.length ? selectDecksByIds(pool, deckIds) : pool;
  const { playable } = partitionPlayableRunnerDecks(rawDecks.map(toRunnerDeck));
  if (playable.length < podSize) {
    return Response.json({ error: `Need at least ${podSize} playable decks for a ${mode} grind (got ${playable.length}).` }, { status: 400 });
  }

  // Load a per-GAME pilot builder server-side (closures can't cross JSON). The grind hands it each pod's decks so
  // the persona can pick deck-native playbooks per seat (Omnath v2); v1 ignores decks → a varied temperament spread.
  let pilotBuilder = null;
  if (pilotFile) {
    try {
      pilotBuilder = await loadPilotBuilder(pilotFile, mode);
    } catch (error) {
      return Response.json({ error: `Pilot "${pilotFile}" failed to load: ${error?.message || error}` }, { status: 400 });
    }
  }

  const podPool = body?.pool === "cedh" ? "cedh" : "mixed"; // SIM-INTEGRITY Phase 3 — pods form within ONE pool
  const res = await startGrind({ decks: playable, mode, pilotBuilder, capBytes, pool: podPool });
  return Response.json(res, { status: res.started ? 200 : 409 });
}
