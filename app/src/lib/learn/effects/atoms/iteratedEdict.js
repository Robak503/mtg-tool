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
import { applyDrawEffect } from "../../spellEffects.js"; // P·20 — the single draw path (draw watchers fire), as the draw atom uses
import { permanentTypes } from "../../layers.js"; // P·20 — "shares a card type with it" reads each candidate's live card types
import { checkDiscardTriggers } from "../../triggers.js"; // TRIG-DISCARD (CR 701.9a) — an edict discard is a discard
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
export function edictLegalModes(state, playerId, spec = null) {
  // P·20 (Braids, Arisen Nightmare): a SPEC narrows the chain — `sacTypes` makes the sacrifice pool "a permanent that shares a
  // card type with it" (any of the listed card types, read live), and `allowDiscard: false` drops the discard mode. No spec →
  // Torment of Hailfire's nonland pool and discard mode, byte-identical.
  const sac = spec?.sacTypes ? sharesTypeSacPool(state, playerId, spec.sacTypes) : nonlandSacPool(state, playerId);
  const disc = spec?.allowDiscard === false ? [] : discardPool(state, playerId);
  const modes = ["life"];
  if (sac.length) modes.push("sacrifice");
  if (disc.length) modes.push("discard");
  return { modes, sac, disc };
}

/** Amount of life the edict drains on the "life" branch. Torment is a fixed 3 (CR-printed); a spec may print another. */
export const EDICT_LIFE_LOSS = 3;

/** P·20 — the permanents `playerId` controls sharing at least one card type with `types` (layer-aware), as `{ id, name }`. */
export function sharesTypeSacPool(state, playerId, types) {
  const want = new Set(types || []);
  return (state.players?.[playerId]?.battlefield || [])
    .filter((p) => permanentTypes(state, p.id).types.some((ty) => want.has(ty)))
    .map((p) => ({ id: p.id, name: p.card?.name }));
}

/**
 * Resolve the "life" branch inline (the opponent chose — or was forced — to lose life). Non-targeted loss
 * for the affected opponent; loseLife lets the total go below 0 (CR 118.2) with the SBA firing on the next
 * driver tick, identical to every other life-loss path. Logged for decision-log parity.
 */
export function edictLoseLife(state, playerId, spec = null) {
  if (!state.players?.[playerId]) return state;
  const amount = spec?.lifeLoss ?? EDICT_LIFE_LOSS;
  let next = loseLife(state, { playerId, amount });
  next = logEvent(next, { kind: "spell-effect", effect: "iterated-edict-life", controller: playerId, amount });
  // P·20 (Braids): "…that player loses 2 life AND YOU DRAW A CARD" — the spec's beneficiary draws on every life branch.
  if (spec?.drawFor && next.players?.[spec.drawFor]) next = applyDrawEffect(next, { controller: spec.drawFor, amount: spec.drawCount });
  return next;
}

/**
 * Walk the iterated-edict CHAIN. `queue` is the remaining per-opponent decisions, head-first, each
 * `{ playerId }` (one decision apiece). For each head: an eliminated opponent is dropped; an opponent with
 * ONLY the "life" mode loses 3 inline (forced — no real choice, no pause); an opponent with ≥2 legal modes
 * pauses via setPendingEdictModeChoice, carrying the rest of the queue. Shared by applyIteratedEdict (the
 * atom's first entry) and runProgram.resolveEdictModeChoice (each subsequent decision), so ONE
 * implementation drives both the inline and interactive paths.
 */
export function advanceEdictChain(state, { queue, sourceName = null, spec = null }) {
  let next = state;
  let q = queue || [];
  while (q.length) {
    const head = q[0];
    if (!next.players?.[head.playerId]) { q = q.slice(1); continue; } // opponent left the game (CR 800.4a)
    const { modes, sac, disc } = edictLegalModes(next, head.playerId, spec);
    if (modes.length === 1) {
      // Only "life" is legal (no nonland permanent, empty hand) — forced loss, no decision, no pause.
      next = edictLoseLife(next, head.playerId, spec);
      q = q.slice(1);
      continue;
    }
    // A real choice (≥2 modes): pause for THIS opponent's mode pick, carrying the rest of the queue (and the spec).
    return setPendingEdictModeChoice(next, { controller: head.playerId, modes, sac, disc, queue: q, sourceName, spec });
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
export function applyEdictMode(state, { playerId, mode, permId = null, cardId = null, sac = [], spec = null }) {
  if (!state.players?.[playerId]) return state;
  if (mode === "sacrifice") {
    const legal = permId && sac.some((c) => c.id === permId);
    if (legal) return sacrificeCreatureEffect(state, playerId, permId);
    return edictLoseLife(state, playerId, spec); // stale/illegal pick → the mandatory life loss still happens
  }
  if (mode === "discard") {
    const inHand = cardId && (state.players[playerId].hand || []).some((c) => c.id === cardId);
    if (inHand) {
      const next = moveCardToZone(state, { playerId, fromZone: "hand", toZone: "graveyard", cardId });
      return checkDiscardTriggers(logEvent(next, { kind: "spell-effect", effect: "iterated-edict-discard", controller: playerId, discarded: 1 }), playerId, [cardId]);
    }
    return edictLoseLife(state, playerId, spec);
  }
  return edictLoseLife(state, playerId, spec); // "life" (and any unknown mode — defensive → the always-legal loss)
}

/**
 * BRAIDS, ARISEN NIGHTMARE (the play-weighted program, P·20 — EDHREC #291):
 *   "At the beginning of your end step, you may sacrifice an artifact, creature, enchantment, land, or planeswalker. If you do,
 *    each opponent may sacrifice a permanent of their choice that shares a card type with it. For each opponent who doesn't,
 *    that player loses 2 life and you draw a card."
 * The whole effect, read as two atoms: the controller's OPTIONAL sacrifice from the five-type pool, then this edict — gated
 * `ifSacrificed`, so it runs only when that sacrifice happened. Each opponent faces the chain's choice with a spec: the pool is
 * their permanents sharing a card type with the sacrificed one (its types as it left — the sacrifice log carries them, CR
 * 608.2h), the "life" branch loses the printed N and the caster draws, and there is no discard mode. An opponent with nothing
 * that shares a type has only the life branch (forced). Returns { atoms } | null.
 */
export function matchBraidsPunisher(oracle) {
  const s = String(oracle || "").toLowerCase();
  const m = s.match(/^you may sacrifice an artifact, creature, enchantment, land, or planeswalker\. if you do, each opponent may sacrifice a permanent of their choice that shares a card type with it\. for each opponent who doesn't, that player loses (\d+) life and you draw a card\.?$/);
  if (!m) return null;
  return { atoms: [
    { op: "sacrifice", who: "controller", what: "nonbattlePermanent", optional: true },
    { op: "edict-shares-type", ifSacrificed: true, lifeLoss: parseInt(m[1], 10), casterDraws: 1, targetType: null },
  ] };
}

export function applyEdictSharesType(state, atom, ctx) {
  const last = [...(state.log || [])].reverse().find((e) => e.effect === "sacrifice" && e.controller === ctx.controller && e.sacrificed != null);
  const types = last?.cardTypes || [];
  if (!types.length) return state; // no typed sacrifice to share with — nothing for the opponents to answer
  const spec = { lifeLoss: atom.lifeLoss, drawFor: ctx.controller, drawCount: atom.casterDraws, sacTypes: types, allowDiscard: false };
  const queue = opponentsOf(state, ctx.controller).filter((pid) => state.players?.[pid]).map((pid) => ({ playerId: pid }));
  const logged = logEvent(state, { kind: "spell-effect", effect: "edict-shares-type", controller: ctx.controller, types, opponents: queue.length });
  return advanceEdictChain(logged, { queue, sourceName: ctx.cardName || null, spec });
}

export const iteratedEdictResolvers = {
  "iterated-edict": applyIteratedEdict, // Torment of Hailfire — X × per-opponent (lose 3 / sac nonland / discard) edict chain
  "edict-shares-type": applyEdictSharesType, // P·20 — Braids, Arisen Nightmare: sac a shared-type permanent, or lose N and the caster draws
};
