/**
 * /api/ab-bench — the A/B card bench. POST {action:"start"} runs a fixed 4-deck pod BOTH ways on the same
 * seeds: baseline vs a ONE-CARD swap on the target deck, returning the target's win-rate delta with a
 * confidence band (abBench, fire-and-forget). {action:"cancel"} stops it; GET / {action:"status"} polls.
 *
 * The swap is guarded before the run ever starts (cardSwap.buildSwappedDeck): a banned, off-color, unknown,
 * or already-run card is rejected with a reason — the bench can only ever test a LEGAL deck. Fully offline.
 */

export const runtime = "nodejs";

import {
  toRunnerDeck,
  partitionPlayableRunnerDecks,
  loadAllProfileDecks,
  selectDecksByIds,
  decksForActiveProfile,
} from "../../../lib/server/selfPlayDecks.js";
import { buildSwappedDeck } from "../../../lib/server/cardSwap.js";
import { startAbBench, abBenchStatus, requestAbBenchCancel } from "../../../lib/learn/abBench.js";

export async function GET() {
  return Response.json(abBenchStatus());
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const action = body?.action;
  if (action === "cancel") return Response.json(requestAbBenchCancel());
  if (action === "status") return Response.json(abBenchStatus());
  if (action !== "start") {
    return Response.json({ error: 'action must be "start", "cancel", or "status".' }, { status: 400 });
  }

  const mode = "commander"; // A/B is Commander-only for now — same fixed pod as the Crucible.
  const podSize = 4;
  const deckIds = Array.isArray(body?.deckIds) ? body.deckIds.filter((id) => typeof id === "string" && id) : [];
  if (deckIds.length !== podSize) {
    return Response.json({ error: `An A/B pod is exactly ${podSize} decks (got ${deckIds.length}).` }, { status: 400 });
  }
  const targetDeckId = typeof body?.targetDeckId === "string" ? body.targetDeckId : null;
  if (!targetDeckId || !deckIds.includes(targetDeckId)) {
    return Response.json({ error: "Pick which of the four decks the swap is on." }, { status: 400 });
  }
  const remove = body?.swap?.remove;
  const add = body?.swap?.add;
  const games = Math.min(500, Math.max(1, Number.isFinite(body?.games) ? Math.floor(body.games) : 100));

  // Resolve the pod decks (cross-profile when asked — a fair pod can span Colton + Joe).
  let poolDecks;
  try {
    poolDecks = body?.allProfiles ? await loadAllProfileDecks() : await decksForActiveProfile();
  } catch (error) {
    return Response.json({ error: error?.message || "Could not load decks." }, { status: 500 });
  }
  const raw = selectDecksByIds(poolDecks, deckIds);
  const { playable, empty } = partitionPlayableRunnerDecks(raw.map(toRunnerDeck));
  if (playable.length !== podSize) {
    return Response.json({ error: "Every pod deck must be non-empty and enrichable.", skippedDecks: empty.map((d) => d.name) }, { status: 400 });
  }

  const target = playable.find((d) => d.id === targetDeckId);
  if (!target) return Response.json({ error: "The target deck didn't resolve — check the deck id." }, { status: 400 });

  // BANLIST + color-identity + singleton guardrail: a bad swap never reaches the run.
  const swapped = buildSwappedDeck(target, { remove, add });
  if (!swapped.ok) return Response.json({ error: swapped.error, reason: swapped.reason }, { status: 400 });

  const res = startAbBench({
    decks: playable,
    targetId: targetDeckId,
    variantDeck: swapped.deck,
    swap: { removed: swapped.removed, added: swapped.added },
    mode,
    games,
  });
  return Response.json(res, { status: res.started ? 200 : 409 });
}
