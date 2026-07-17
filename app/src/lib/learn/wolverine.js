/**
 * wolverine.js — the Wolverine, Best There Is whole-card hook (the #353/#356 targeted-hook pattern).
 *
 * Verified oracle (bundled Scryfall, app/data/scryfall.oracle.local.json):
 *   "Unrivaled Lethality — Double all damage Wolverine would deal.
 *    At the beginning of each end step, if Wolverine dealt damage to another creature this turn, put a
 *    +1/+1 counter on him.
 *    {1}{G}: Regenerate Wolverine."
 *   {1}{R}{G}  Legendary Creature — Mutant Berserker Hero
 *
 * Three interlocking clauses (CREED — all three or the card stays non-native):
 *   1. DOUBLE-ALL-DAMAGE — a SOURCE-scoped damage-replacement static (CR 614). Modeled by the reusable
 *      damageReplacements.js layer (parseDamageReplacements matches "Double all damage Wolverine would
 *      deal" → { op:multiply×2, scope:source-self }). Synthesized-on-read: it vanishes when Wolverine
 *      leaves. NOT modeled here — the layer owns it; this module owns clauses 2 + 3.
 *   2. END-STEP +1/+1 COUNTER (CR 603.4 intervening-if) — "if Wolverine dealt damage to another creature
 *      this turn". A per-turn flag (`dealtDamageToCreatureThisTurn` on the permanent) is set at every
 *      damage-apply site where Wolverine is the SOURCE and the target is ANOTHER creature; checked at each
 *      end step (intervening-if, CR 603.4 — checked when the trigger would fire); reset at cleanup. The
 *      counter is placed via gameState.addCounter so the Wave-3 counter-doubler (Doubling Season, Hardened
 *      Scales) COMPOSES automatically.
 *   3. {1}{G}: REGENERATE — the activated regeneration ability (CR 701.19), modeled via the existing
 *      addRegenShield precedent. Recognized by the activated-ability classifier (a "Regenerate <name>"
 *      effect is already in the engine's regen atom vocabulary).
 *
 * Self-contained + pure. The end-step pass fires at the `end` step alongside checkStepTriggers (gameEngine).
 */

import { addCounter, findPermanent, logEvent } from "./gameState.js";

// The end-step-counter clause, anchored to Wolverine's exact templating so no other card false-matches.
// "another creature" (CR 109.2 self-exclusion) is load-bearing — Wolverine's own damage to a DIFFERENT
// creature, not to itself, arms the counter.
export const ENDSTEP_COUNTER =
  /at the beginning of each end step, if (?:wolverine|this creature) dealt damage to another creature this turn, put a \+1\/\+1 counter on (?:him|her|it|them)/i;

/**
 * Does this card carry the "dealt damage to another creature this turn → +1/+1 at end step" clause? Used to
 * (a) decide whether a damage-apply site should ARM the per-turn flag on this permanent, and (b) gate the
 * end-step counter pass. Reads the card oracle (synthesized-on-read; no stored state).
 */
export function marksDamageToCreature(card) {
  return ENDSTEP_COUNTER.test(String(card?.oracle ?? card?.oracle_text ?? ""));
}

/**
 * ARM the per-turn flag: a permanent (`sourcePerm`) just dealt damage to a creature whose id is `targetId`.
 * Sets `dealtDamageToCreatureThisTurn` ONLY if (a) the source carries the clause and (b) the target is
 * ANOTHER creature (CR 109.2 — not itself). Returns a new state (or the same state, untouched, when the
 * source doesn't carry the clause — so non-Wolverine damage is byte-identical). Pure.
 */
export function armDamageToCreatureFlag(state, sourcePerm, targetId) {
  if (!sourcePerm?.card || !marksDamageToCreature(sourcePerm.card)) return state;
  if (!targetId || targetId === sourcePerm.id) return state; // "another creature" — self-damage doesn't arm it
  const target = findPermanent(state, targetId);
  if (!target) return state;
  return updatePerm(state, sourcePerm.id, (p) => (p.dealtDamageToCreatureThisTurn ? p : { ...p, dealtDamageToCreatureThisTurn: true }));
}

/**
 * The end-step intervening-if pass (CR 603.4): for each permanent on the battlefield whose clause is armed
 * (`dealtDamageToCreatureThisTurn`), put a +1/+1 counter on it (via addCounter → Wave-3 doublers compose).
 * Fired at the `end` step. A board with no armed Wolverine is byte-identical (the loop body never runs).
 * NOTE: the flag clears at cleanup (clearWolverineTurnFlags), so a creature that dealt no damage this turn
 * never gets a counter, and the trigger doesn't re-fire on a later turn's end step from a stale flag.
 */
export function applyWolverineEndStep(state) {
  let next = state;
  for (const pid of Object.keys(next.players || {})) {
    for (const perm of next.players[pid].battlefield || []) {
      if (perm.dealtDamageToCreatureThisTurn && marksDamageToCreature(perm.card)) {
        next = addCounter(next, { permanentId: perm.id, type: "+1/+1", amount: 1 });
        next = logEvent(next, { kind: "wolverine-endstep-counter", permanentId: perm.id, cardName: perm.card?.name, controller: pid });
      }
    }
  }
  return next;
}

/**
 * Reset every permanent's per-turn `dealtDamageToCreatureThisTurn` flag (CR 514.2 cleanup-step cleanup of
 * "this turn" state). Called at the cleanup step. Pure; only clears a set flag, so a board with none is
 * byte-identical.
 */
export function clearWolverineTurnFlags(state) {
  let touched = false;
  const players = {};
  for (const pid of Object.keys(state.players || {})) {
    const player = state.players[pid];
    const battlefield = (player.battlefield || []).map((p) => {
      if (p.dealtDamageToCreatureThisTurn) {
        touched = true;
        const { dealtDamageToCreatureThisTurn: _drop, ...rest } = p;
        return rest;
      }
      return p;
    });
    players[pid] = battlefield === player.battlefield ? player : { ...player, battlefield };
  }
  return touched ? { ...state, players } : state;
}

// The classifier `classifyWolverine` lives in coverage.js (it needs effects/abilities, whose import chain
// would cycle through this module via spellEffects→wolverine). It reuses the exported `marksDamageToCreature`
// + `ENDSTEP_COUNTER` + the damage-replacement parser there. This module stays the runtime-hook leaf.

// Local permanent updater (mirrors gameState.updatePermanent shape; kept local to avoid widening imports).
function updatePerm(state, permanentId, fn) {
  const players = {};
  let touched = false;
  for (const pid of Object.keys(state.players || {})) {
    const player = state.players[pid];
    let changed = false;
    const battlefield = (player.battlefield || []).map((p) => {
      if (p.id === permanentId) {
        changed = true;
        touched = true;
        return fn(p);
      }
      return p;
    });
    players[pid] = changed ? { ...player, battlefield } : player;
  }
  return touched ? { ...state, players } : state;
}
