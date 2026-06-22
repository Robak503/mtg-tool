/**
 * effects/atoms/removal.js — removal + sacrifice atoms (destroy, exile-with-rider, sacrifice).
 * Hosts the RIDER-REMOVAL dispatch (applyControllerRider) which calls into tokens.js / library.js /
 * zones.js (DAG: {tokens,library,zones} <- removal). Keep the rider logic HERE (moving it to shared.js
 * would create a cycle).
 */

import { applyDestroyEffect } from "../../spellEffects.js";
import { logEvent, gainLife, opponentsOf, findPermanent, moveCardToZone, creaturePower } from "../../gameState.js";
import { checkDiesTriggers, checkLifegainTriggers, checkSacrificeTriggers } from "../../triggers.js";
import { setPendingSacrificeChoice } from "../../pendingChoice.js";
import { atomTargets, isCreatureCard } from "./shared.js";
import { applyCreateToken, applyCreateNamedToken } from "./tokens.js";
import { applyTutor } from "./library.js";
import { applyZoneMove } from "./zones.js";

/**
 * ===== RIDER-REMOVAL ===== (Dex) targeted removal whose SECOND clause acts on the TARGET's controller
 * (CR — "its controller" = the just-removed permanent's controller): Swords to Plowshares (exile + that
 * controller gains life = the creature's power), Beast Within / Generous Gift (destroy + that controller
 * makes a vanilla token), Path to Exile / Assassin's Trophy (exile/destroy + that controller may ramp a
 * basic land). The controller (and the creature's power, for the lifegain rider) is captured BEFORE the
 * removal moves the permanent off the battlefield; the removal then runs through the SHARED exile/destroy
 * resolver (so indestructible/regen/dies are handled identically); finally the rider applies to the
 * captured controller. The rider is unconditional — Beast Within still makes the token even if the target
 * was indestructible (the destroy failed but the second sentence still resolves).
 */
export function applyRemovalWithRider(state, atom, ctx) {
  const targets = atomTargets(state, atom, ctx);
  // Capture each target's controller + power while it's still on the battlefield (these spells are
  // single-target in the corpus, but the loop is general).
  const captures = [];
  for (const t of targets) {
    if (t.type !== "creature" && t.type !== "permanent" && t.type !== "planeswalker") continue;
    const lk = findPermanent(state, t.id);
    if (lk) captures.push({ controller: lk.controller, power: Math.max(0, creaturePower(lk.permanent, state)) });
  }
  // Perform the removal through the shared resolver (exile → applyZoneMove, destroy → applyDestroyEffect).
  let next = atom.op === "exile"
    ? applyZoneMove(state, atom, ctx, "exile")
    : applyDestroyEffect(state, { controller: ctx.controller, targets, cannotRegenerate: atom.cannotRegenerate });
  // Apply the rider to each captured controller.
  for (const cap of captures) {
    if (!next.players?.[cap.controller]) continue; // controller eliminated mid-resolution → skip (CR 800.4a)
    next = applyControllerRider(next, atom.controllerRider, cap, ctx);
    // A rampBasic rider suspends the program (a tutor pending-choice scoped to that player); stop the loop
    // so a (theoretical) second target can't clobber the pending choice — the runner resumes from here.
    if (next.pendingChoice && !next.pendingChoice.resume) break;
  }
  return next;
}

/** Apply a single RIDER-REMOVAL controller-rider to the captured target-controller `cap`. */
export function applyControllerRider(state, rider, cap, ctx) {
  if (rider.kind === "gainLifePower") {
    let next = gainLife(state, { playerId: cap.controller, amount: cap.power });
    if (cap.power > 0) next = checkLifegainTriggers(next, cap.controller, cap.power);
    return logEvent(next, { kind: "spell-effect", effect: "rider-gain-life", controller: cap.controller, amount: cap.power });
  }
  if (rider.kind === "createToken") {
    // A token (vanilla OR keyworded — Swan Song's flying Bird) under the captured controller; reuse
    // applyCreateToken with the controller swapped and any modeled keywords threaded.
    const tokenAtom = { op: "create-token", count: 1, power: rider.power, toughness: rider.toughness, descriptor: `${rider.color} ${rider.subtype}`, keywords: rider.keywords || [], targetType: null };
    return applyCreateToken(state, tokenAtom, { ...ctx, controller: cap.controller });
  }
  if (rider.kind === "createNamedToken") {
    // An Offer You Can't Refuse — N named artifact tokens (Treasure/Clue/Food/Gold) under the captured controller.
    const tokenAtom = { op: "create-named-token", token: rider.token, count: rider.count, targetType: null };
    return applyCreateNamedToken(state, tokenAtom, { ...ctx, controller: cap.controller });
  }
  if (rider.kind === "rampBasic") {
    // Reuse the RAMP-1 battlefield tutor (basic land → battlefield), scoped to the TARGET's controller — their
    // library, their pick; the "may" is the tutor's find-nothing. Suspends the program (pending-choice).
    const tutorAtom = { op: "tutor", filter: { groups: [["basic", "land"]] }, filterLabel: "basic land card", destination: "battlefield", entersTapped: !!rider.entersTapped, targetType: null };
    return applyTutor(state, tutorAtom, { ...ctx, controller: cap.controller });
  }
  return state;
}

/**
 * ===== EDICTS ===== — sacrifice a creature controlled by `playerId` as an EFFECT (CR 701.21): move it
 * battlefield → graveyard and fire its + watchers' dies triggers (CR 700.4 — the aristocrats payoff).
 * The EFFECT-side twin of actionDispatcher.sacrificePermanentForCost (the cost-side self-sac), kept here
 * so the edict resolver + the resolution-time victim-choice path (runProgram.resolveSacrificeChoice)
 * share ONE implementation. These paths only ever pass a CREATURE, so dies triggers always fire; the
 * dispatch's stack-resolution finalizer flushes them above the rest (CR 603.3b). A stale id (the creature
 * already left) is a logged no-op via the findPermanent guard + moveCardToZone's own guard.
 */
export function sacrificeCreatureEffect(state, playerId, permId) {
  const lk = findPermanent(state, permId);
  if (!lk) return logEvent(state, { kind: "spell-effect", effect: "sacrifice", controller: playerId, sacrificed: null });
  let next = moveCardToZone(state, { playerId, fromZone: "battlefield", toZone: "graveyard", cardId: permId });
  if (isCreatureCard(lk.permanent.card)) {
    next = checkDiesTriggers(next, [{ controller: playerId, id: permId, name: lk.permanent.card?.name || "creature", card: lk.permanent.card }]);
  }
  // TRIG-SACRIFICE: fire "Whenever you sacrifice a <permanent|creature|artifact>" for the sacrificing
  // player. The perm has left the battlefield, so its type rides on the lookBack card (sacScopeMatches reads it).
  next = checkSacrificeTriggers(next, playerId, { id: permId, controller: playerId, card: lk.permanent.card });
  return logEvent(next, { kind: "spell-effect", effect: "sacrifice", controller: playerId, sacrificed: permId, cardName: lk.permanent.card?.name });
}

/**
 * ===== EDICTS ===== — walk the sacrifice CHAIN (CR 701.21 — each sacrificing player chooses which creature
 * to give up). `queue` is the remaining sacrificers, head-first, each `{ playerId }` (one creature apiece —
 * the modeled "sacrifices a creature" forms). For each in turn:
 *   - eliminated / no creature → drop and move on (a clean no-op; you can't sacrifice what you don't have).
 *   - exactly 1 creature → FORCED sacrifice (no real choice): pitch it inline (dies triggers fire), move on.
 *   - ≥2 creatures → a REAL choice: pause via setPendingSacrificeChoice for THIS sacrificer (the driver
 *     pauses a human picker, auto-sacs an AI's least-valuable), carrying the queue so resolveSacrificeChoice
 *     can drop the settled head + re-enter.
 * When the queue empties with no pause, returns the advanced state (the program continues / resumes). Shared
 * by applySacrifice (the atom's first entry) and runProgram.resolveSacrificeChoice (each subsequent pick),
 * so ONE implementation drives the single-target edict (#214) AND the each-player / each-opponent forms.
 * Hidden-info safe: each sacrificer's creatures are public, and the chooser IS their controller.
 */
export function advanceSacrificeChain(state, { queue, sourceName = null }) {
  let next = state;
  let q = queue || [];
  while (q.length) {
    const head = q[0];
    const player = next.players?.[head.playerId];
    if (!player) { q = q.slice(1); continue; } // sacrificer left the game (CR 800.4a) → skip
    const creatures = (player.battlefield || [])
      .filter((p) => isCreatureCard(p.card))
      .map((p) => ({ id: p.id, name: p.card?.name }));
    if (creatures.length === 0) { q = q.slice(1); continue; } // no creature → can't sacrifice → skip
    if (creatures.length === 1) {
      next = sacrificeCreatureEffect(next, head.playerId, creatures[0].id); // forced — sole legal pick
      q = q.slice(1);
      continue;
    }
    // ≥2 — a real choice: pause for THIS sacrificer's pick, carrying the rest of the queue.
    return setPendingSacrificeChoice(next, { controller: head.playerId, candidates: creatures, queue: q, sourceName });
  }
  return next;
}

/**
 * EDICTS — sacrifice-as-an-effect, resolved through the chain above. The SACRIFICING player chooses which
 * creature (CR 701.21), never the caster. `atom.who` selects the sacrificers:
 *   - "target" (default, #214) — the player(s) targeted at cast (Diabolic Edict / Cruel Edict / Geth's Verdict).
 *   - "eachPlayer" (Innocent Blood / Reign of the Pit) — every player, the controller first (APNAP-stable).
 *   - "eachOpponent" (Liliana's Triumph / Skull Storm) — every opponent.
 * A removed sacrificer / no creatures is a clean no-op; the caster's riders resume after the whole chain settles.
 */
function applySacrifice(state, atom, ctx) {
  let sacrificers;
  if (atom.who === "eachPlayer") {
    const seen = new Set();
    sacrificers = [ctx.controller, ...opponentsOf(state, ctx.controller)]
      .filter((pid) => state.players?.[pid] && !seen.has(pid) && seen.add(pid));
  } else if (atom.who === "eachOpponent") {
    sacrificers = opponentsOf(state, ctx.controller).filter((pid) => state.players?.[pid]);
  } else {
    sacrificers = (ctx.targets || [])
      .filter((t) => t.type === "player" && state.players?.[t.id])
      .map((t) => t.id);
  }
  if (sacrificers.length === 0) {
    return logEvent(state, { kind: "spell-effect", effect: "sacrifice", who: atom.who || "target", sacrificers: 0 });
  }
  return advanceSacrificeChain(state, { queue: sacrificers.map((pid) => ({ playerId: pid })), sourceName: ctx.cardName });
}

export const removalResolvers = {
  "destroy": (state, atom, ctx) =>
    atom.controllerRider
      ? applyRemovalWithRider(state, atom, ctx) // RIDER-REMOVAL — Beast Within / Generous Gift / Assassin's Trophy
      : applyDestroyEffect(state, { controller: ctx.controller, targets: atomTargets(state, atom, ctx), cannotRegenerate: atom.cannotRegenerate }), // MTG-001 — honor the "can't be regenerated" rider
  "exile": (state, atom, ctx) =>
    atom.controllerRider
      ? applyRemovalWithRider(state, atom, ctx) // RIDER-REMOVAL — Path to Exile / Swords to Plowshares
      : applyZoneMove(state, atom, ctx, "exile"),
  "sacrifice": applySacrifice,
};
