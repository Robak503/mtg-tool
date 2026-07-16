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
import { commanderLegality } from "../../../lib/server/cardIndex.js";
import { classifyCard, isNativeTier } from "../../../lib/learn/coverage.js";
import { startAbBench, abBenchStatus, requestAbBenchCancel } from "../../../lib/learn/abBench.js";

export async function GET(request) {
  let url;
  try { url = new URL(request.url); } catch { return Response.json(abBenchStatus()); }

  // ?check=<name> — live banlist/legality check for the "bench in" field (the guardrail, made visible as
  // the user types). Color-identity + singleton are still enforced at start (they need the target deck).
  const check = url.searchParams.get("check");
  if (check != null) {
    try { return Response.json(commanderLegality(check)); }
    catch { return Response.json({ ok: false, reason: "index-error", message: "Couldn't check that card right now." }); }
  }

  // ?decks=<id,id,…> — resolve the pod decks CROSS-PROFILE (a pod can span Colton + Joe) with their card
  // name lists, so the modal's target/pull pickers work regardless of which profile owns each deck. Uses
  // the SAME resolution the run does, so the names line up exactly.
  const deckParam = url.searchParams.get("decks");
  if (deckParam) {
    const ids = deckParam.split(",").map((s) => s.trim()).filter(Boolean);
    try {
      const pool = await loadAllProfileDecks();
      const decks = selectDecksByIds(pool, ids).map(toRunnerDeck).map((d) => ({
        id: d.id,
        name: d.name,
        cards: [...new Set((d.cards || []).map((c) => c?.name).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
      }));
      return Response.json({ decks });
    } catch (error) {
      return Response.json({ error: error?.message || "Could not load decks." }, { status: 500 });
    }
  }

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
  // Dedupe: a repeated id would resolve one deck into two seats and inject the variant into both, corrupting
  // the comparison — so distinct ids only, and there must be exactly podSize of them.
  const deckIds = Array.isArray(body?.deckIds) ? [...new Set(body.deckIds.filter((id) => typeof id === "string" && id))] : [];
  if (deckIds.length !== podSize) {
    return Response.json({ error: `An A/B pod is exactly ${podSize} distinct decks (got ${deckIds.length}).` }, { status: 400 });
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

  // TRUST GATE (Omnath's card-A/B feasibility rule, COMMS 2026-07-15): an A/B is only fully
  // trustworthy when BOTH cards are natively modeled — a body-only card's abilities silently never
  // fire, so its side of the comparison under-reads and "no effect" can be a coverage artifact, not
  // a verdict on the card. Not a refusal (a body still attacks/blocks — a partial read is still a
  // read): classify both cards and ride the verdict on the swap so the modal shows an honest banner.
  const trustOf = (cardObj) => {
    if (!cardObj) return { tier: null, native: false };
    const tier = classifyCard({ name: cardObj.name, type: cardObj.type, oracle: cardObj.oracle, mana: cardObj.mana });
    return { tier, native: isNativeTier(tier) };
  };
  const removedCard = (target.cards || []).find((c) => c?.name === swapped.removed) || null;
  const addedCard = (swapped.deck.cards || []).find((c) => c?.name === swapped.added) || null;
  const trust = {
    removed: { name: swapped.removed, ...trustOf(removedCard) },
    added: { name: swapped.added, ...trustOf(addedCard) },
  };
  trust.trustworthy = trust.removed.native && trust.added.native;

  const res = startAbBench({
    decks: playable,
    targetId: targetDeckId,
    variantDeck: swapped.deck,
    swap: { removed: swapped.removed, added: swapped.added, trust },
    mode,
    games,
  });
  return Response.json(res, { status: res.started ? 200 : 409 });
}
