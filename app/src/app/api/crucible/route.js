/**
 * /api/crucible — the bounded POD power-read (exactly-N games over one 4-deck pod).
 *
 * The Crucible's "pod" path, distinct from /api/grind (the ∞ training loop). POST {action:"start"}
 * kicks off the in-memory crucibleRun loop with the selected persona; {action:"cancel"} stops it at
 * the next game boundary; GET returns live status (poll for the modal), and GET ?results=1 (or
 * {action:"results"}) returns the final power ranking. Deck + pilot loading mirror /api/grind.
 *
 * Fully offline: decks come from local profile files, pilots are dynamic-imported from pilotsDir(),
 * the engine never touches the network at runtime.
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
import {
  startCrucibleRun,
  crucibleStatus,
  crucibleResults,
  requestCrucibleCancel,
} from "../../../lib/learn/crucibleRun.js";

export async function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get("results")) {
    return Response.json({ status: crucibleStatus(), results: crucibleResults() });
  }
  return Response.json(crucibleStatus());
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const action = body?.action;
  if (action === "cancel") return Response.json(requestCrucibleCancel());
  if (action === "status") return Response.json(crucibleStatus());
  if (action === "results") return Response.json(crucibleResults());
  if (action !== "start") {
    return Response.json({ error: 'action must be "start", "cancel", "status", or "results".' }, { status: 400 });
  }

  const mode = body?.mode === "standard" ? "standard" : "commander";
  const podSize = mode === "commander" ? 4 : 2;
  // A pod is EXACTLY podSize decks (the deck-count run model: 4 → pod; 5+ / 0 → the ∞ grind route).
  const deckIds = Array.isArray(body?.deckIds) ? body.deckIds.filter((id) => typeof id === "string" && id) : [];
  if (deckIds.length !== podSize) {
    return Response.json({ error: `A ${mode} pod is exactly ${podSize} decks (got ${deckIds.length}). Use /api/grind for a full grind.` }, { status: 400 });
  }
  // Bounded game count. Clamp to a sane ceiling so a typo can't spin forever; the pod is a
  // read, not the training engine — huge runs belong to the ∞ grind.
  const target = Math.min(100000, Math.max(1, Number.isFinite(body?.games) ? Math.floor(body.games) : 100));
  const pilotFile = typeof body?.pilot === "string" && body.pilot ? body.pilot : null;
  const pool = body?.pool === "cedh" ? "cedh" : "mixed";

  // Resolve the requested deck ids → enriched runner decks (cross-profile when asked).
  let poolDecks;
  try {
    poolDecks = body?.allProfiles ? await loadAllProfileDecks() : await decksForActiveProfile();
  } catch (error) {
    return Response.json({ error: error?.message || "Could not load decks." }, { status: 500 });
  }
  const rawDecks = selectDecksByIds(poolDecks, deckIds);
  if (rawDecks.length !== podSize) {
    return Response.json({ error: `Resolved ${rawDecks.length} of ${podSize} requested decks — check the deck ids.` }, { status: 400 });
  }
  const { playable, empty } = partitionPlayableRunnerDecks(rawDecks.map(toRunnerDeck));
  if (playable.length !== podSize) {
    return Response.json({ error: "Every pod deck must be non-empty and enrichable.", skippedDecks: empty.map((d) => d.name) }, { status: 400 });
  }

  // Load the per-game persona builder server-side (closures can't cross JSON). Absent ⇒ default autopilot.
  let pilotBuilder = null;
  if (pilotFile) {
    try {
      pilotBuilder = await loadPilotBuilder(pilotFile, mode);
    } catch (error) {
      return Response.json({ error: `Pilot "${pilotFile}" failed to load: ${error?.message || error}` }, { status: 400 });
    }
  }

  const res = startCrucibleRun({ decks: playable, mode, target, pilotBuilder, pilot: pilotFile, pool });
  return Response.json(res, { status: res.started ? 200 : 409 });
}
