/**
 * grindPod.js — the grind's deterministic pod-forming core, extracted so the in-process
 * grind loop (grindLoop.js) and the parallel pool workers (scripts/grind-worker.mjs) run
 * the EXACT same sequence math. One source of truth: a pool with laneCount=1 must
 * reproduce the single-process game stream byte-for-byte — any duplicate copy of this
 * logic is the drift bug that guarantee exists to prevent.
 */

import { createHash } from "node:crypto";

import { engineSeatsForMode } from "./selfPlayRunner.js";
import { mulberry32, seededShuffle } from "./seedMath.js";

// Seed/PRNG primitives live in seedMath.js (R2.6 — ONE source; the runner uses the same module).
export { gameSeedAt, mulberry32 as rng, seededShuffle as shuffle } from "./seedMath.js";

/** A random balanced pod of `size` runner decks (seeded). */
export function formPod(decks, size, seed) {
  const rand = mulberry32(seed);
  return seededShuffle(decks, rand).slice(0, size);
}

export function podToArgs(pod, mode, pilots, seed) {
  const [userDeck, ...opp] = pod;
  return {
    deckA: userDeck?.cards || [],
    opponentDecks: opp.map((d) => d?.cards || []),
    userCommanders: userDeck?.commanders || [],
    opponentCommanders: opp.map((d) => d?.commanders || []),
    userCompanion: userDeck?.companion || null,
    opponentCompanions: opp.map((d) => d?.companion || null),
    mode, seed, timePressure: true, pilots, recordDecisions: true, mulligan: true,
  };
}

/** Seat names for the mode, in pod order (pod[0] = the first seat). */
export function engineSeatsFor(mode) {
  return engineSeatsForMode(mode);
}

/**
 * Deck-version hash (R3, Colton 2026-07-15 — the living-history foundation): a stable fingerprint of
 * the EXACT list — every mainboard copy (basics included), the commanders, and the companion, by card
 * NAME. Any card swap, count change, or commander change produces a new hash; printings don't (the
 * runner deck carries names, not printings). Sections are prefixed so a card moving between the 99 and
 * the command zone registers. sha1, first 12 hex — collision-safe at deck-version scale, cheap to eye.
 * WeakMap-cached per runner-deck object (pods reuse the same deck objects across thousands of games).
 */
const deckHashCache = new WeakMap();
export function deckVersionHash(deck) {
  if (!deck || typeof deck !== "object") return null;
  const hit = deckHashCache.get(deck);
  if (hit) return hit;
  const names = (xs) => (Array.isArray(xs) ? xs.map((c) => c?.name || "").sort() : []);
  const canonical = `C:${names(deck.commanders).join("|")};P:${deck.companion?.name || ""};M:${names(deck.cards).join("|")}`;
  const v = createHash("sha1").update(canonical, "utf8").digest("hex").slice(0, 12);
  deckHashCache.set(deck, v);
  return v;
}

/**
 * THE ONE grind-store header builder (featuresV=2 drift guard — Omnath 2026-07-10): grindLoop (the
 * in-process grind) and scripts/grind-worker.mjs (the pool lanes) BOTH assemble game headers; the
 * featuresV=2 fields (startSeat/turnOrder/decisionsCount/pilotV) initially landed only in grindLoop
 * and the pool kept writing headers without them. One shared builder = the two write paths cannot
 * drift again. `game` is a runSelfPlayGame result; `pilotV` is the persona-pack era marker (read off
 * the pilotBuilder fn by both callers; null until Omnath's builder exposes it).
 *
 * R3 (2026-07-15): the builder now takes the POD + seatNames (not pre-flattened deck entries) and
 * assembles decks[] itself — {seat, id, name, deckV} with deckV = deckVersionHash of the exact list —
 * so the version stamp rides the same drift guard as everything else. Forward-only + additive:
 * pre-R3 headers simply have no deckV (consumers read `?? null`, never guess).
 */
export function buildGrindHeader({ gameSeed, pilots, pod, seatNames, engineVersion, mode, pool, game, pilotV = null }) {
  // Which DECK sat at each seat (seat order = pod order) so results views can attribute wins +
  // participation per deck — winnerSeat alone can't say which deck won.
  const decks = (pod || []).map((d, si) => ({
    seat: seatNames?.[si] ?? `seat${si}`, id: d?.id ?? null, name: d?.name ?? null, deckV: deckVersionHash(d),
  }));
  return {
    seed: gameSeed, pilots, decks, engineVersion: engineVersion ?? null,
    result: game?.result ?? null, winnerSeat: game?.winnerSeat ?? null, turns: game?.turns ?? null,
    mode, pool, mulliganPolicyV: game?.mulliganPolicyV ?? null,
    seatStats: game?.seatStats ?? null, winCondition: game?.winCondition ?? null,
    startSeat: game?.onThePlay ?? null,
    turnOrder: game?.turnOrder ?? null,
    decisionsCount: game?.decisionTrajectory?.rows?.length ?? null,
    pilotV,
  };
}
