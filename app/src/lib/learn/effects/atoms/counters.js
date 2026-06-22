/**
 * effects/atoms/counters.js — counter atoms (add-counter, proliferate, gain-experience, rad).
 */

import { logEvent, destroyLethalCreatures, opponentsOf, findPermanent, addCounter, addPoison, addExperience, addRadCounters } from "../../gameState.js";
import { checkDiesTriggers } from "../../triggers.js";
import { atomTargets, isCreatureCard } from "./shared.js";

/**
 * WAVE 3b COUNTERS-ON-EVENT — the TRIGGERING-PERMANENT referent ("…on that creature" / non-self "…on
 * it", target:"thatCreature"; the pronoun refers to the object the ability triggered on, CR 608.2c;
 * counter placement CR 122.6). The trigger flush threads ctx.triggeringPermanentId (the
 * creature whose event fired the trigger — e.g. the attacker that dealt combat damage for Sphere Grid).
 * Returns a single-creature target list, or [] when the referent is absent (a spell, or the triggering
 * permanent already left the battlefield) — a clean no-op, never a fabricated counter. Mirrors
 * selfTargets: only a CREATURE referent is honored ("that creature" implies a creature).
 */
function triggeringCreatureTargets(state, ctx) {
  const lk = ctx.triggeringPermanentId ? findPermanent(state, ctx.triggeringPermanentId) : null;
  return lk && isCreatureCard(lk.permanent.card)
    ? [{ type: "creature", id: ctx.triggeringPermanentId, controller: lk.controller }]
    : [];
}

/** RAD (CR 728) — give rad counter(s) to the controller / each player / each opponent / a target player /
 * the just-damaged player. Fixed-N grants, OR a `countContext` dynamic count (CDMG-PLAYER-PAYOFF — "they get
 * that many rad counters" = ctx.combatDamageAmount, floored at 0, never forced to 1; the parser still routes
 * "for each" / X / scaled forms to the Arbiter). The inherent radiation ability (gameEngine, at each player's
 * precombat main) does the mill + life-loss + counter-removal. Mirrors applyLoseLife's who-resolution;
 * non-targeted, so identical on a spell or a trigger. A missing / eliminated player is a clean skip.
 *
 * who:"damagedPlayer" (CDMG-PLAYER-PAYOFF — Glowing One "they get four rad counters", Infesting Radroach
 * "they get that many rad counters") reads ctx.damagedPlayerId, the player just dealt combat damage (carried
 * by triggers.checkCombatDamageTriggers). Absent (a spell / non-combat trigger) → a clean no-op (0), never a
 * fabricated grant or a wrong recipient. */
export function applyRad(state, atom, ctx) {
  let next = state;
  const amount = atom.countContext
    ? Math.max(0, ctx[atom.countContext] || 0) // CDMG-PLAYER-PAYOFF — "that many" = combatDamageAmount, floor 0
    : Math.max(0, atom.amount || 0);
  if (amount === 0) return next;
  if (atom.who === "eachPlayer") {
    for (const pid of Object.keys(next.players)) {
      if (next.players[pid]) next = addRadCounters(next, { playerId: pid, amount });
    }
  } else if (atom.who === "eachOpponent") {
    for (const opp of opponentsOf(next, ctx.controller)) {
      if (next.players[opp]) next = addRadCounters(next, { playerId: opp, amount });
    }
  } else if (atom.who === "target") {
    for (const t of ctx.targets || []) {
      if (t.type === "player" && next.players[t.id]) next = addRadCounters(next, { playerId: t.id, amount });
    }
  } else if (atom.who === "damagedPlayer") {
    // The just-damaged player (CR — the combat-damage trigger's referent). Absent → clean no-op.
    const pid = ctx.damagedPlayerId;
    if (pid && next.players[pid]) next = addRadCounters(next, { playerId: pid, amount });
  } else {
    next = addRadCounters(next, { playerId: ctx.controller, amount });
  }
  return logEvent(next, { kind: "spell-effect", effect: "rad", who: atom.who || "controller", amount });
}

/** Put +1/+1 or -1/-1 counters on the chosen creature(s), or the SOURCE for a self counter
 * ("put a +1/+1 counter on this creature", atom.target "self"; CR 122.1). */
export function applyAddCounter(state, atom, ctx) {
  let next = state;
  // WAVE 3b — the triggering-permanent referent ("…on that creature" / non-self "…on it") resolves to
  // ctx.triggeringPermanentId (CR 608.2c); every other form goes through the shared atomTargets dispatch
  // (self / chosen target / team). Absent referent → [] → a clean no-op (CREED, never a fabricated counter).
  const targets = atom.target === "thatCreature" ? triggeringCreatureTargets(state, ctx) : atomTargets(state, atom, ctx);
  for (const t of targets) {
    if (t.type === "creature" && findPermanent(next, t.id)) {
      next = addCounter(next, { permanentId: t.id, type: atom.counterType, amount: atom.amount || 1 });
    }
  }
  // -1/-1 counters lower DERIVED toughness — run the lethal SBA so a creature it
  // drops to 0 dies at resolution (the P2.3 negative-pump discipline).
  if (atom.counterType === "-1/-1") {
    const r = destroyLethalCreatures(next);
    next = checkDiesTriggers(r.state, r.dead);
  }
  return logEvent(next, { kind: "spell-effect", effect: "add-counter", counterType: atom.counterType, amount: atom.amount || 1, targets: targets.map(t => t.id) });
}

// PROLIFERATE (CR 701.27): "choose any number of permanents and/or players that have a counter on them,
// then give each another counter of each kind already there." The "may choose any number" is auto-resolved
// to NEVER-HARMFUL picks (the sim's controller plays to win): a permanent is proliferated only when adding
// to it HELPS ctx.controller — MY permanent that has a GOOD counter and no BAD one, an OPPONENT's that has
// a BAD counter and no good one — plus POISON on opponent players. Per CR one of EACH kind on a chosen
// permanent is added, so the choice is PER-PERMANENT (not per-kind). Ambiguous counters (saga lore, etc.)
// are never the reason to choose a permanent → a safe no-op. (A future interactive choice UI can replace
// the heuristic; this is the rules engine.) Compounds with every counter the engine tracks.
const PROLIF_GOOD = new Set(["+1/+1", "loyalty", "charge", "fade", "time", "level", "oil"]);
const PROLIF_BAD = new Set(["-1/-1", "stun"]);

export function applyProliferate(state, atom, ctx) {
  const me = ctx.controller;
  const times = Math.max(1, atom.times || 1); // "proliferate twice" (Contagion Engine) runs it twice
  let next = state;
  for (let n = 0; n < times; n++) {
    for (const pid of Object.keys(next.players)) {
      const mine = pid === me;
      for (const perm of [...next.players[pid].battlefield]) {
        const kinds = Object.entries(perm.counters || {}).filter(([, v]) => v > 0).map(([k]) => k);
        if (kinds.length === 0) continue;
        const hasGood = kinds.some((k) => PROLIF_GOOD.has(k));
        const hasBad = kinds.some((k) => PROLIF_BAD.has(k));
        const choose = mine ? (hasGood && !hasBad) : (hasBad && !hasGood);
        if (!choose) continue;
        for (const k of kinds) next = addCounter(next, { permanentId: perm.id, type: k, amount: 1 });
      }
      // POISON on opponent players (the player counter whose proliferation is unambiguously good for me).
      if (!mine && (next.players[pid].poison || 0) > 0) next = addPoison(next, { playerId: pid, amount: 1 });
      // RAD (CR 728) on opponent players — same heuristic as poison: more rad on an opponent mills + drains
      // THEM, so it's unambiguously good for me (and bad on myself, so I skip my own). CR 701.34a lets
      // proliferate add a rad counter to any player who already has one.
      if (!mine && (next.players[pid].radCounters || 0) > 0) next = addRadCounters(next, { playerId: pid, amount: 1 });
    }
  }
  // A proliferated -1/-1 may drop an opponent's creature to lethal toughness (CR 704.5g).
  const r = destroyLethalCreatures(next);
  next = checkDiesTriggers(r.state, r.dead);
  return logEvent(next, { kind: "spell-effect", effect: "proliferate", controller: me });
}

/**
 * GAIN-EXPERIENCE (EARTHBEND-PR3, Toph landfall) — "You get an experience counter." Increments the
 * controller's experience counter total (player.experience). Non-targeted, infallible (counter players
 * can't be targeted). PR3 scope: the landfall trigger fires once per land entry, each granting +1.
 */
export function applyGainExperience(state, atom, ctx) {
  const count = Math.max(1, atom.count || 1);
  const pid = ctx.controller;
  if (!state.players?.[pid]) return state;
  return addExperience(state, { playerId: pid, amount: count });
}

export const counterResolvers = {
  "add-counter": applyAddCounter,
  "gain-experience": applyGainExperience, // EARTHBEND-PR3 — "you get an experience counter" (Toph landfall)
  "rad": applyRad, // RAD (CR 728) — "each/target player gets N rad counter(s)" (The Wise Mothman); engine mills + drains at precombat main
  "proliferate": applyProliferate, // PROLIFERATE (CR 701.27) — add one of each counter kind to never-harmful picks
};
