/**
 * triggerTargetRestraint.js — two restraints on the α1 trigger-target chooser (gameEngine.chooseTriggerTargets), which picks the
 * targets of every triggered ability for both seats as it goes on the stack (CR 603.3d → 601.2c).
 *
 * 1. AN OPTIONAL FIGHT IS TAKEN ONLY WHEN IT GAINS SOMETHING (restrainOptionalFights). "It fights up to one target creature you
 *    don't control" (Apex Altisaur, Kogla, Meltstrider's Resolve) lets its controller choose no target: an ability that requires
 *    targets may allow zero (CR 115.6), and a variable number of targets is announced as it goes on the stack (CR 601.2c). The
 *    chooser took the first correct-side candidate, and the expander lists the decline LAST, so the fight was always taken —
 *    found 2026-10-18 in the goad entry's supplement game (seed 3724842652): an indestructible Apex Altisaur fought Earth Bent's
 *    Lumra, Bellow of the Woods 2,000 times in one turn (each fight dealt it damage, its enrage put the fight back on the stack,
 *    neither died) and the game ended engine-stuck. Each candidate's fight is now read by resolving it on a copy of the board with
 *    the fight resolver itself (effects/atoms/combat.fightCreature — CR 701.14a, and everything the damage path applies:
 *    indestructible, deathtouch, protection, prevention, infect, regeneration, the lethal-damage pass). It is worth taking when
 *      - the target leaves the battlefield and the fighter does not (a trade, or a fight the fighter loses, is never taken — the
 *        same discipline as the AI's fight spells and fight activations); or
 *      - both live, as a step of a chain that ends with the target dead: the fighter is dealt damage, its own "whenever this
 *        creature is dealt damage" trigger fights again (it routes natively), the target is one damage can destroy (CR 704.5g —
 *        not indestructible, CR 702.12b), and at this fight's rate the target runs out of toughness before the fighter does
 *        (an indestructible fighter never does) — Apex Altisaur against Unhallowed Phalanx (1/13) fights twice and kills it.
 *    A target that already has lethal damage marked and is still on the battlefield is one damage does not destroy here; no fight
 *    is worth taking against it. Every other candidate becomes its decline. Each step of a chain re-reads the live board, so a
 *    chain only continues while the target's remaining toughness falls — it ends after at most that many fights.
 *
 * 2. THE LOOP BACKSTOP (loopSpent / loopBreakingChoice). A loop that contains an optional action is not a draw (CR 104.4b; only a
 *    loop of mandatory actions is, CR 732.4 — mandatoryLoop.js), so something must break it: the player makes a different game
 *    choice so the loop does not continue (CR 732.3, and the shortcut's number of iterations, CR 732.2a). Once a triggered ability
 *    has resolved LOOP_ITERATIONS times this turn (gameEngine's per-turn resolution ledger, `abilityResolutionsThisTurn`, keyed by
 *    the ability), its next target choice is the different one: an optional target is declined; otherwise a candidate that
 *    targets only players is preferred (damage to a player is dealt to no creature, so a creature's "is dealt damage" trigger does
 *    not fire again). Two indestructible Spitemares under Avacyn, Angel of Hope sent the damage back and forth for ever: each
 *    "any target" trigger took the other Spitemare. The ability's controller changes its choice, whichever seat that is (the rule
 *    names the active player, or the first involved in turn order — a simplification, documented). LOOP_ITERATIONS clears the
 *    busiest legitimate turn measured (236 resolutions of one ability — Squirrels beside Altar of the Brood, learnSession's tick
 *    budget note) and stays far below the per-turn raw tick ceiling (20,000 ticks; a loop iteration costs a handful).
 *
 * Pure reads of `state`: the copy the fight resolves on is discarded, nothing is written or logged.
 */
import { findPermanent, isIndestructible } from "./gameState.js";
import { permanentToughness } from "./layers.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause } from "./effects/parser.js";
import { fightCreature } from "./effects/atoms/combat.js";

/** Resolutions of one triggered ability in one turn after which its target choice breaks the loop (see the header, 2). */
export const LOOP_ITERATIONS = 300;

/** A source-bound "fights up to one target creature" slot (the fight-pair's fighter half carries role "fighter" and is not one). */
const optionalFightSlot = (atom, t) => atom?.op === "fight" && !!atom.optionalTarget && t?.role !== "fighter";

/**
 * May the ability go on the stack with this slot empty (CR 115.6, 601.2c)? An "up to N" subset atom, the primary of an
 * "up to one target" atom, and the fighter half of an "up to one target creature you control fights" atom.
 */
function optionalSlot(atom, t) {
  if (!atom) return false;
  if (atom.maxTargets >= 1 && (atom.minTargets ?? 1) === 0) return true;
  if (atom.optionalTarget && t?.role !== "fighter") return true;
  return !!atom.secondaryOptionalTarget && t?.role === "fighter";
}
const hasOptionalSlot = (atoms) => atoms.some((a) => a && ((a.maxTargets >= 1 && (a.minTargets ?? 1) === 0) || a.optionalTarget || a.secondaryOptionalTarget));

/** Toughness left before lethal damage (CR 704.5g): toughness less the damage marked; null when the permanent is gone. */
function toughnessLeft(state, id) {
  const lk = findPermanent(state, id);
  return lk ? permanentToughness(state, id) - Math.max(0, Number(lk.permanent.damageMarked) || 0) : null;
}

/** Does this creature's own "whenever this creature is dealt damage" trigger fight (and route natively)? Apex Altisaur's enrage. */
function fightsWhenDealtDamage(state, id) {
  const card = findPermanent(state, id)?.permanent?.card;
  if (!card) return false;
  return detectTriggers(card).some((d) => d.event === "dealtDamage" && d.scope === "self" && triggerRoutesNatively(d)
    && (parseEffectClause(d.effectClause, "Instant", { hasX: !!d.effectHasX, sourceScoped: true })?.atoms || []).some((a) => a.op === "fight" && !a.fighterReferent));
}

/**
 * Is this source-bound fight worth taking for `controller` (see the header, 1)? `atom` is the fight, `target` the chosen creature,
 * `sourceId` the trigger's source (the fighter, or the Aura whose host fights).
 */
export function fightWorthTaking(state, controller, atom, target, sourceId) {
  const fighterId = atom.fighterReferent === "enchantedHost"
    ? (sourceId ? findPermanent(state, sourceId)?.permanent?.attachedTo ?? null : null)
    : sourceId;
  const fighter = fighterId ? findPermanent(state, fighterId) : null;
  const victim = findPermanent(state, target.id);
  if (!fighter || !victim) return false; // nothing would fight (CR 701.14b)
  const before = { victim: toughnessLeft(state, target.id), fighter: toughnessLeft(state, fighterId) };
  const after = fightCreature(state, atom, { controller, sourceId, targets: [target] });
  if (!findPermanent(after, fighterId)) return false; // the fighter dies — a loss or a trade
  if (!findPermanent(after, target.id)) return true; // the target dies, the fighter lives
  const victimLeft = toughnessLeft(after, target.id);
  const fighterLeft = toughnessLeft(after, fighterId);
  const toVictim = before.victim - victimLeft;
  const toFighter = before.fighter - fighterLeft;
  // Lethal damage marked and still on the battlefield (victimLeft ≤ 0): damage doesn't destroy it here, so no fight will.
  if (!(toVictim > 0) || !(victimLeft > 0) || isIndestructible(victim.permanent, state)) return false;
  if (!(toFighter > 0) || !fightsWhenDealtDamage(state, fighterId)) return false;
  const more = Math.ceil(victimLeft / toVictim);
  return isIndestructible(fighter.permanent, state) || fighterLeft - more * toFighter > 0;
}

/**
 * The correct-side candidates (`safe`, in the chooser's order) with every candidate whose optional fight is not worth taking
 * dropped. When none is left — the expander's cap can cut the decline off a long candidate list — the first candidate's decline
 * (its optional fight target removed) is the one candidate returned. `safe` itself when no candidate has an optional fight.
 */
export function restrainOptionalFights(state, controller, safe, atomsFor, sourceId) {
  const fightTargets = (c) => (c.targets || []).filter((t) => optionalFightSlot(atomsFor(c)[t.atomIndex], t));
  if (!safe.some((c) => fightTargets(c).length)) return safe;
  const kept = safe.filter((c) => fightTargets(c).every((t) => fightWorthTaking(state, controller, atomsFor(c)[t.atomIndex], t, sourceId)));
  if (kept.length) return kept;
  const first = safe[0];
  return [{ ...first, targets: (first.targets || []).filter((t) => !optionalFightSlot(atomsFor(first)[t.atomIndex], t)) }];
}

/** Has this trigger's ability already resolved LOOP_ITERATIONS times this turn? (`trigger.context.abilityKey`, stamped at flush.) */
export function loopSpent(state, trigger) {
  const key = trigger?.context?.abilityKey;
  const rec = key ? state?.abilityResolutionsThisTurn?.[key] : null;
  return !!rec && rec.turn === state.turn && rec.n >= LOOP_ITERATIONS;
}

/**
 * The loop-breaking choice among the correct-side candidates (see the header, 2): the first candidate with its optional targets
 * declined when the ability has any optional slot; else the first candidate that targets only players; else null (no different
 * choice to make — the engine's tick guards still end the turn).
 */
export function loopBreakingChoice(safe, atomsFor) {
  const first = safe[0];
  if (!first) return null;
  if (hasOptionalSlot(atomsFor(first))) return { ...first, targets: (first.targets || []).filter((t) => !optionalSlot(atomsFor(first)[t.atomIndex], t)) };
  return safe.find((c) => (c.targets || []).length > 0 && c.targets.every((t) => t.type === "player")) ?? null;
}
