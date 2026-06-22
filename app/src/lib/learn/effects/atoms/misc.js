/**
 * effects/atoms/misc.js — misc atoms (draw, fog, create-emblem, divide-damage).
 */

import { applyDrawEffect } from "../../spellEffects.js";
import { logEvent, addEmblem } from "../../gameState.js";
import { setPendingDivideChoice } from "../../pendingChoice.js";
import { resolveScaledAmount, isCreatureCard } from "./shared.js";

/**
 * Draw (CR 120) — the ACTOR is the atom's `who`:
 *   - undefined / "controller" (the legacy + "draw N cards" form) — the spell's controller draws.
 *   - "eachPlayer" ("Each player draws N cards" — Vision Skeins) — EVERY player draws.
 *   - "target" ("Target player draws N cards" — Opportunity / Ancestral Recall) — the chosen player(s) draw.
 * Each drawing player goes through applyDrawEffect, the SINGLE source of truth for a draw (shared with the
 * legacy cast path), so the each/target forms are byte-identical to a controller draw, just for a different
 * player. amountX (an {X}-draw) still reads ctx.xValue for the controller form; the each/target forms are
 * numeric-only at the parser (an "{X}" each/target draw fails the anchor → Arbiter), so effectiveAmount is
 * a plain number there. An eliminated/removed player id is skipped (no throw).
 */
function applyDrawAtom(state, atom, ctx) {
  const amount = resolveScaledAmount(state, atom, ctx); // FOR-EACH: count × per (else amountX / printed)
  if (atom.who === "eachPlayer") {
    let next = state;
    for (const pid of Object.keys(state.players)) {
      if (next.players[pid]) next = applyDrawEffect(next, { controller: pid, amount });
    }
    return next;
  }
  if (atom.who === "target") {
    let next = state;
    for (const t of ctx.targets || []) {
      if (t.type === "player" && next.players[t.id]) next = applyDrawEffect(next, { controller: t.id, amount });
    }
    return next;
  }
  return applyDrawEffect(state, { controller: ctx.controller, amount });
}

/**
 * ===== FOG ===== (FOG-1, CR 615 prevention) — "Prevent all combat damage that would be dealt this turn."
 * Stamp the current turn onto state.preventCombatDamageTurn; combatResolution.resolveCombatDamage skips
 * ALL combat damage (both the first-strike and regular steps) while that flag === state.turn, then it
 * SELF-EXPIRES (next turn's number differs, so no cleanup is needed). Non-targeted, no choice; the flag
 * is a plain number so a mid-combat serialize/restore is byte-identical.
 */
function applyFog(state, atom, ctx) {
  const next = { ...state, preventCombatDamageTurn: state.turn };
  return logEvent(next, { kind: "spell-effect", effect: "fog", controller: ctx.controller, turn: state.turn });
}

/**
 * ===== EMBLEM ===== (PW-5, CR 114) — "You get an emblem with '[ability]'." Give the controller an
 * emblem carrying the quoted ability text (addEmblem). The parser only emits this atom when the
 * ability is a modeled static (a clean anthem the layer engine can apply); the emblem's effect then
 * applies continuously via layers.emblemEffectsOf. Non-targeted; a removed controller is a clean no-op.
 */
function applyCreateEmblem(state, atom, ctx) {
  if (!ctx.controller || !state.players?.[ctx.controller]) return state;
  const next = addEmblem(state, { playerId: ctx.controller, oracle: atom.emblemOracle || "" });
  return logEvent(next, { kind: "spell-effect", effect: "create-emblem", controller: ctx.controller });
}

/**
 * ===== DIVIDE ===== (MT-1) — "deals N damage divided as you choose among any number of target X." Gather
 * the legal target set per `atom.group` (every battlefield's creatures, and/or every player) and PAUSE for
 * the caster's division (setPendingDivideChoice); resolveDivideChoice (runProgram) applies the per-target
 * damage. Non-targeted at cast — the division is a resolution-time choice — so no ctx.targets are consumed.
 * Numeric `atom.amount` only for now (an {X} divide is a fast-follow). EXPORTED for direct testing; it is
 * intentionally NOT in ATOM_RESOLVERS yet (so divide-damage stays low → Arbiter until the picker + driver +
 * UI all land — no native-but-unplayable false positive). 0 amount / no legal target → a logged no-op.
 */
export function applyDivideDamage(state, atom, ctx) {
  const amount = atom.amount || 0;
  const group = atom.group || "anyTarget";
  if (amount <= 0) return logEvent(state, { kind: "spell-effect", effect: "divide-damage", controller: ctx.controller, amount: 0 });
  const candidates = [];
  if (group !== "players") {
    for (const pid of Object.keys(state.players)) {
      for (const perm of state.players[pid].battlefield) {
        if (isCreatureCard(perm.card)) candidates.push({ id: perm.id, name: perm.card?.name, type: "creature", controller: pid });
      }
    }
  }
  if (group !== "creatures") {
    for (const pid of Object.keys(state.players)) candidates.push({ id: pid, name: pid, type: "player", controller: pid });
  }
  if (candidates.length === 0) return logEvent(state, { kind: "spell-effect", effect: "divide-damage", controller: ctx.controller, amount, candidates: 0 });
  return setPendingDivideChoice(state, { controller: ctx.controller, amount, candidates, group, sourceName: ctx.cardName });
}

export const miscResolvers = {
  "draw": applyDrawAtom, // ===== EACH-PLAYER ===== who-aware: controller / eachPlayer / target player
  "fog": applyFog, // ===== FOG ===== (FOG-1) prevent all combat damage this turn — a turn-scoped latch
  "create-emblem": applyCreateEmblem, // ===== EMBLEM ===== (PW-5) "you get an emblem with '[modeled static]'"
  // ===== DIVIDE ===== (MT-1) — split N damage among any number of targets via a resolution-time picker.
  // Wired end-to-end: applyDivideDamage → setPendingDivideChoice → driver (AI auto-distributes /
  // human assigns via the LearnView DivideDamagePanel) → resolveDivideChoice applies it through the
  // deal-damage atom. (distribute-counters reuses this same picker — fast-follow.)
  "divide-damage": applyDivideDamage,
};
