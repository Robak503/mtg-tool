/**
 * effects/atoms/iteratedEdict.js — the X-iterated multi-mode edict atom (Torment of Hailfire).
 *
 * MODELS (CR 118.9 / 701.16 / 701.8): "Repeat the following process X times. Each opponent loses 3 life
 * unless that player sacrifices a nonland permanent of their choice or discards a card."
 *
 * SHAPE — an {X}-cost sorcery whose body is an X-times-repeated, per-opponent, THREE-mode edict. Each
 * time the process runs, EVERY opponent (APNAP / turn order, deterministic) faces a choice they make
 * themselves (CR 118.9's "unless" is the affected player's decision, exactly like a Diabolic Edict's
 * sacrificer or a Mind Rot victim chooses):
 *   - "life"     → lose 3 life                (always available — CR 119.4, life can go below 0)
 *   - "sacrifice"→ sacrifice a nonland permanent of their choice (available iff they control one)
 *   - "discard"  → discard a card             (available iff they have a card in hand)
 *
 * RESOLUTION MODEL — a pausing CHAIN, mirroring advanceSacrificeChain / advanceDiscardChain. The queue is
 * X rounds × the opponents in turn order, flattened head-first. For each queue head:
 *   - opponent left the game (CR 800.4a) → drop, move on.
 *   - ONLY "life" is legal (no nonland permanent AND empty hand) → FORCED lose-3 inline, move on (no real
 *     choice → no pause).
 *   - ≥2 legal modes → a REAL choice: pause via setPendingEdictModeChoice for THAT opponent (the driver
 *     surfaces a picker for a human, auto-picks for an AI via autoPickEdictMode), carrying the queue so
 *     resolveEdictModeChoice can drop the settled head + re-enter.
 * When the queue empties with no pause, returns the advanced state (the caster's program resumes — Torment
 * has no rider, but the seam is uniform with the other edict chains). CREED: NEVER a partial iteration —
 * the whole X × opponents queue drains, or (a `low`-confidence program never reaches this atom) the card
 * routes to the Arbiter. X=0 (cast for free / X chosen 0) is a clean no-op (an empty queue).
 *
 * Hidden-info safe: the chooser IS the affected opponent; their board (sac pool) and hand SIZE are public,
 * and the discard's specific card is chosen by them at resolution via the SAME discard chain (CR 701.8),
 * so the caster never sees or cherry-picks an opponent's hand.
 */

import { logEvent, opponentsOf, moveCardToZone } from "../../gameState.js";
import { setPendingEdictModeChoice } from "../../pendingChoice.js";
import { sacrificeCreatureEffect } from "./removal.js";
import { isLandCard } from "./shared.js";
import { loseLife } from "../../gameState.js";

/** The nonland permanents an opponent controls, as `{ id, name }` (public — on the battlefield). */
export function nonlandSacPool(state, playerId) {
  const player = state.players?.[playerId];
  if (!player) return [];
  return (player.battlefield || [])
    .filter((p) => !isLandCard(p.card))
    .map((p) => ({ id: p.id, name: p.card?.name }));
}

/** The cards an opponent could discard (their non-token hand cards) as `{ id, name }` (count is public). */
export function discardPool(state, playerId) {
  const player = state.players?.[playerId];
  if (!player) return [];
  return (player.hand || []).filter((c) => !c.token).map((c) => ({ id: c.id, name: c.name }));
}

/**
 * The legal modes an opponent has for ONE edict decision, in a stable order: always "life", plus
 * "sacrifice" when they control a nonland permanent, plus "discard" when they hold a card. Returned with
 * the candidate pools so the picker / auto-pick / settler all read the SAME legality (never a fabricated
 * or illegal option). "life" is always present (CR 119.4 — you can always lose life, even below 0).
 */
export function edictLegalModes(state, playerId) {
  const sac = nonlandSacPool(state, playerId);
  const disc = discardPool(state, playerId);
  const modes = ["life"];
  if (sac.length) modes.push("sacrifice");
  if (disc.length) modes.push("discard");
  return { modes, sac, disc };
}

/** Amount of life the edict drains on the "life" branch. Torment is a fixed 3 (CR-printed). */
export const EDICT_LIFE_LOSS = 3;

/**
 * Resolve the "life" branch inline (the opponent chose — or was forced — to lose life). Non-targeted loss
 * for the affected opponent; loseLife lets the total go below 0 (CR 118.2) with the SBA firing on the next
 * driver tick, identical to every other life-loss path. Logged for decision-log parity.
 */
export function edictLoseLife(state, playerId) {
  if (!state.players?.[playerId]) return state;
  const next = loseLife(state, { playerId, amount: EDICT_LIFE_LOSS });
  return logEvent(next, { kind: "spell-effect", effect: "iterated-edict-life", controller: playerId, amount: EDICT_LIFE_LOSS });
}

/**
 * Walk the iterated-edict CHAIN. `queue` is the remaining per-opponent decisions, head-first, each
 * `{ playerId }` (one decision apiece). For each head: an eliminated opponent is dropped; an opponent with
 * ONLY the "life" mode loses 3 inline (forced — no real choice, no pause); an opponent with ≥2 legal modes
 * pauses via setPendingEdictModeChoice, carrying the rest of the queue. Shared by applyIteratedEdict (the
 * atom's first entry) and runProgram.resolveEdictModeChoice (each subsequent decision), so ONE
 * implementation drives both the inline and interactive paths.
 */
export function advanceEdictChain(state, { queue, sourceName = null }) {
  let next = state;
  let q = queue || [];
  while (q.length) {
    const head = q[0];
    if (!next.players?.[head.playerId]) { q = q.slice(1); continue; } // opponent left the game (CR 800.4a)
    const { modes, sac, disc } = edictLegalModes(next, head.playerId);
    if (modes.length === 1) {
      // Only "life" is legal (no nonland permanent, empty hand) — forced loss, no decision, no pause.
      next = edictLoseLife(next, head.playerId);
      q = q.slice(1);
      continue;
    }
    // A real choice (≥2 modes): pause for THIS opponent's mode pick, carrying the rest of the queue.
    return setPendingEdictModeChoice(next, { controller: head.playerId, modes, sac, disc, queue: q, sourceName });
  }
  return next;
}

/**
 * ===== ITERATED-EDICT ===== atom entry. Builds the decision queue = X rounds × the opponents (turn order,
 * APNAP-stable), flattened head-first, then advances the chain. X comes from ctx.xValue (bound at cast for
 * the {X} spell); a missing / zero X is a clean no-op (empty queue → no loss, no pause). Each opponent
 * appears once PER round, so with X rounds and K opponents the queue has X×K heads (each a single decision).
 */
export function applyIteratedEdict(state, atom, ctx) {
  const rounds = Math.max(0, ctx.xValue || 0);
  const opps = opponentsOf(state, ctx.controller).filter((pid) => state.players?.[pid]);
  const queue = [];
  for (let r = 0; r < rounds; r++) {
    for (const pid of opps) queue.push({ playerId: pid });
  }
  const logged = logEvent(state, { kind: "spell-effect", effect: "iterated-edict", controller: ctx.controller, rounds, opponents: opps.length });
  return advanceEdictChain(logged, { queue, sourceName: ctx.cardName || null });
}

/**
 * Apply ONE settled edict mode for the affected opponent (`playerId`). "life" → lose 3; "sacrifice" →
 * sacrifice the chosen nonland permanent (`permId`, validated against the sac pool — a stale/illegal id
 * falls back to the life loss so the decision still resolves, never a fabricated sac); "discard" → discard
 * the chosen card (`cardId`, validated against the live hand — a stale id falls back to life loss). Reuses
 * sacrificeCreatureEffect (fires dies + sacrifice triggers for ANY permanent) and moveCardToZone (hand →
 * graveyard) so the sac/discard are byte-identical to the shared edict/discard paths. Returns the new state.
 */
export function applyEdictMode(state, { playerId, mode, permId = null, cardId = null, sac = [] }) {
  if (!state.players?.[playerId]) return state;
  if (mode === "sacrifice") {
    const legal = permId && sac.some((c) => c.id === permId);
    if (legal) return sacrificeCreatureEffect(state, playerId, permId);
    return edictLoseLife(state, playerId); // stale/illegal pick → the mandatory life loss still happens
  }
  if (mode === "discard") {
    const inHand = cardId && (state.players[playerId].hand || []).some((c) => c.id === cardId);
    if (inHand) {
      const next = moveCardToZone(state, { playerId, fromZone: "hand", toZone: "graveyard", cardId });
      return logEvent(next, { kind: "spell-effect", effect: "iterated-edict-discard", controller: playerId, discarded: 1 });
    }
    return edictLoseLife(state, playerId);
  }
  return edictLoseLife(state, playerId); // "life" (and any unknown mode — defensive → the always-legal loss)
}

export const iteratedEdictResolvers = {
  "iterated-edict": applyIteratedEdict, // Torment of Hailfire — X × per-opponent (lose 3 / sac nonland / discard) edict chain
};
