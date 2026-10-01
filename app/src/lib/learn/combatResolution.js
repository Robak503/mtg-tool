/**
 * combatResolution.js — apply combat damage, keyword-aware.
 *
 * Resolves the declared combat in `state.combat`. Called at BOTH combat-damage
 * sub-steps so first strike works:
 *   - firstStrikeStep=true  → only first-strike / double-strike creatures deal.
 *   - firstStrikeStep=false → only non-first-strike (and double-strike) deal.
 * State-based actions (lethal → graveyard) run within each call, so a creature
 * killed by first strike never deals back in the regular step.
 *
 * Keywords modeled (printed only, via keywords.js):
 *   - First strike / Double strike — the two-step split above.
 *   - Trample — excess over the blockers' lethal need hits the defender.
 *   - Deathtouch — any damage is lethal (assigns 1 as "lethal", kills on >0).
 *   - Lifelink — the dealer's controller gains life equal to damage dealt.
 *   - Flying / Reach — enforced in legalChoices (who may block), not here.
 *   - Indestructible — enforced by the lethal-damage SBA this calls
 *     (gameState.destroyLethalCreatures → isIndestructible, CR 704.5g), not here.
 *   - Menace — the ≥2-blocker rule (CR 509.1c / 702.111b): a menace attacker left with exactly one
 *     blocker is normalized to unblocked here (block-legality lives in legalChoices/combatEvasion).
 * Still NOT enforced (a body with these mis-plays them): protection (DEBT) and first-strike-vs-
 * regular ordering subtleties beyond the two-step model. Per the enforce-don't-drop policy they
 * stay claimed native in coverage.js COVERED_KEYWORDS as INTERIM false positives while the
 * enforcement is built (Cindy's lanes) — see retired-fp-ledger.md.
 *
 * Mode-agnostic: reads `state.combat` + each attacker's `defender`, so Standard
 * (1v1) and Commander (4P) resolve through the same path. Vanilla combat (no
 * keywords) is byte-for-byte the old behavior, resolved entirely in the regular
 * step.
 */

import { applyMonarchCombatSteal } from "./effects/atoms/monarch.js";
import {
  findPermanent,
  loseLife,
  gainLife,
  logEvent,
  creaturePower,
  creatureToughness,
  markCombatDamage,
  recordDamageSource,
  removeCounter,
  addRadCounters,
  destroyLethalCreatures,
  isPlaneswalker,
  adjustLoyalty,
  destroyZeroLoyaltyPlaneswalkers,
  addCommanderDamage,
  addCounter,
  addPoison,
  hasShieldCounter,
  consumeShieldCounter,
  preventionShieldsFor,
} from "./gameState.js";
import { permanentHasKeyword, permanentColors, permanentProtectionColors, permanentProtectionClasses, assignsCombatDamageWithToughness } from "./layers.js";
import { applyDestroyEffect } from "./spellEffects.js"; // DG-1 — the shared destroy primitive (indestructible/shield/regen/totem + dies-triggers); spellEffects never imports this module (cycle-safe)
import { protectionApplies } from "./protection.js";
import { playerDamageRedirectTarget } from "./damageRedirect.js"; // shelf D42 — combat damage to a player dealt to a creature instead (CR 614.9)
import { selfDamagePrevention, selfDamagePreventionBy, attachedDamagePrevention, mayAssignAsUnblocked, attackerMinBlockers, counterShieldPrevention, attachedPreventPutCounters, selfPreventPutCounters } from "./combatEvasion.js";
import { boardHasDamageReplacement, consultDamageAmount, combatDamageUnpreventable } from "./damageReplacements.js"; // + SG-11 (Frenzied Baloth): "Combat damage can't be prevented."
import { playerProtectedFromEverything, moveCardToZone } from "./gameState.js"; // TEFERI'S PROTECTION — a shielded player takes no combat damage; moveCardToZone — ④-AX end-of-combat self-bounce
import { sacrificeCreatureEffect } from "./effects/atoms/removal.js"; // ④-AX — the shared sacrifice primitive for the end-of-combat self-sacrifice
import { armDamageToCreatureFlag, marksDamageToCreature } from "./wolverine.js";
import { checkDiesTriggers, checkPlaneswalkerDiesTriggers, checkCombatDamageTriggers, checkCombatDamageToCreatureTriggers, checkBatchCombatDamageTriggers, checkLifegainTriggers, checkDealtDamageTriggers, checkDealtByTriggers } from "./triggers.js";

// KW-POISON (toxic — CR 702.180a): the toxic VALUE N. The keyword reminder text spells the number
// out ("Toxic 3"); the Scryfall keywords array only carries the bare word "Toxic", so N is read from
// the oracle. The creature's OWN toxic is always the FIRST "Toxic N" in its text (the keyword line
// precedes any GRANTED "…gains toxic 1" / "Other Rats have toxic 1" clause — verified across the
// corpus). Granted-toxic riders stay unmodeled (those cards aren't keyword-only → never claimed
// native), so reading the first match never over-credits.
function toxicValue(card) {
  const m = String(card?.oracle ?? card?.oracle_text ?? "").match(/\btoxic\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * END-OF-COMBAT delayed effects (BLITZ DG-1 — the Deathgazer basilisk touch, CR 511): drain
 * state.endOfCombatEffects. Each entry ({op:"destroy", permanentId, turn}) was enqueued by the
 * destroy-at-end-of-combat atom when its "blocks or becomes blocked" trigger RESOLVED (at declare-
 * blockers); the destroy itself belongs to the end-of-combat step (CR 511.1 — the delayed trigger
 * fires there, AFTER combat damage).
 *
 * THE BOUNDARY: this engine's step machine runs first-strike-damage → combat-damage → end-of-combat,
 * and the end-of-combat case in gameEngine only CLEARS combat state — no game actions run there. The
 * regular (firstStrikeStep=false) resolveCombatDamage call is therefore the LAST game action of every
 * combat, so its end — after damage, the lethal SBA, and the dies-trigger look-backs — IS the
 * end-of-combat boundary, and the drain lives HERE (this file owns combat resolution; gameEngine
 * stays untouched). Called from the regular step's exits only (never the first-strike sub-step —
 * destroying between the two damage sub-steps would be early, CR 511 comes after CR 510).
 *
 * SELF-LIMITING (the stale guard): each entry is stamped with the turn it was enqueued; an entry
 * whose turn isn't the CURRENT turn is DROPPED unfired — a stale delayed destroy firing in a later
 * combat would be a forbidden FP, a dropped one is FN-safe. The queue empties on every drain either
 * way, so nothing survives past its combat. Destroys run through the SHARED applyDestroyEffect, so
 * indestructible (CR 702.12b), shield counters (CR 122.1c), regeneration (CR 701.19), totem armor
 * (CR 702.89) and dies-triggers behave exactly like any other destroy; an entry whose creature
 * already left (died to combat damage) is a clean skip.
 */
function drainEndOfCombatEffects(state) {
  const queue = state.endOfCombatEffects || [];
  if (queue.length === 0) return state;
  let next = { ...state, endOfCombatEffects: [] };
  for (const e of queue) {
    if (e?.op !== "destroy" && e?.op !== "sacrifice" && e?.op !== "bounce" && e?.op !== "remove-counter") continue; // unknown entry kinds never fire (FN-safe)
    if (e.turn !== next.turn) continue;                // STALE (an earlier turn's leftover) → dropped, never fired
    const lk = findPermanent(next, e.permanentId);
    if (!lk) continue;                                 // already dead / gone → nothing to destroy
    // ④-AX — the SOURCE's own delayed sacrifice / bounce ("When this creature attacks or blocks, sacrifice it / return it
    // to its owner's hand at end of combat" — Mardu Blazebringer, Windscouter): the sacrifice rides the shared sacrifice
    // primitive (dies triggers, death look-backs), the bounce the shared zone move; both skip a creature that already
    // died to combat damage, exactly as the destroy above does.
    if (e.op === "sacrifice") {
      next = logEvent(next, { kind: "end-of-combat-sacrifice", turn: next.turn, target: e.permanentId, cardName: lk.permanent.card?.name, source: e.sourceCardName || null });
      next = sacrificeCreatureEffect(next, lk.controller, e.permanentId);
      continue;
    }
    if (e.op === "bounce") {
      next = logEvent(next, { kind: "end-of-combat-bounce", turn: next.turn, target: e.permanentId, cardName: lk.permanent.card?.name, source: e.sourceCardName || null });
      next = moveCardToZone(next, { playerId: lk.controller, fromZone: "battlefield", toZone: "hand", cardId: e.permanentId });
      continue;
    }
    // ③ · 14 — the Clockwork cycle's delayed counter removal ("remove a +1/+1 counter from it at end of combat"): through the
    // counter chokepoint, then the lethal check and its dies look-back — the pair combat damage runs above — so a Clockwork
    // left at 0/0 dies before anyone gets priority (CR 704.5f). No counter left → removeCounter changes nothing.
    if (e.op === "remove-counter") {
      const type = e.counterType || "+1/+1";
      next = logEvent(next, { kind: "end-of-combat-remove-counter", turn: next.turn, target: e.permanentId, counterType: type, cardName: lk.permanent.card?.name, source: e.sourceCardName || null });
      next = removeCounter(next, { permanentId: e.permanentId, type, amount: 1 });
      const lethal = destroyLethalCreatures(next);
      next = lethal.dead.length ? checkDiesTriggers(lethal.state, lethal.dead) : lethal.state;
      continue;
    }
    next = logEvent(next, { kind: "end-of-combat-destroy", turn: next.turn, target: e.permanentId, cardName: lk.permanent.card?.name, source: e.sourceCardName || null });
    next = applyDestroyEffect(next, { controller: lk.controller, targets: [{ type: "creature", id: e.permanentId }] });
  }
  return next;
}

// Combat keyword checks go through the layer engine (permanentHasKeyword) so a
// GRANTED keyword (sliver lord, anthem, equipment) is respected, not just a
// printed one (Phase-7 PR-12). Vanilla creatures resolve via the empty-board
// fast path, so this is byte-identical for keyword-less boards.
function combatHasFirstStrike(state, combat) {
  const ids = [
    ...combat.attackers.map(a => a.permanentId),
    ...(combat.blockers || []).map(b => b.blockerId),
  ];
  return ids.some(id =>
    findPermanent(state, id) &&
    (permanentHasKeyword(state, id, "First strike") || permanentHasKeyword(state, id, "Double strike")),
  );
}

/**
 * Resolve combat damage for one sub-step. Pure: returns a new state with damage
 * marked, life adjusted, lethal creatures moved to graveyards, and events
 * logged. No-op when nobody is attacking (or, in the first-strike step, when no
 * creature in combat has first/double strike).
 */
export function resolveCombatDamage(state, { firstStrikeStep = false } = {}) {
  const combat = state.combat;
  if (!combat || !Array.isArray(combat.attackers) || combat.attackers.length === 0) {
    return state;
  }
  // ===== FOG ===== (FOG-1, CR 615.6) — a resolved fog stamped the current turn onto
  // state.preventCombatDamageTurn; while that holds, ALL combat damage this turn is prevented (this
  // short-circuit covers BOTH the first-strike and the regular step). No marks, no life loss, no
  // lifelink, no lethal SBA from combat — the step is a logged no-op. Self-expires: next turn's number
  // differs. (Non-combat damage is unaffected; this hook is only the combat-damage step.)
  // SG-11 (Frenzied Baloth, CR 615.12): while any battlefield permanent prints "Combat damage can't be
  // prevented", the fog latch (and every other combat prevention below) is inert — the step runs in full.
  const unpreventable = combatDamageUnpreventable(state);
  if (state.preventCombatDamageTurn === state.turn && !unpreventable) {
    const fogged = logEvent(state, { kind: "combat-damage-prevented", turn: state.turn, firstStrikeStep });
    // DG-1: a fog prevents combat DAMAGE (CR 615.6) — a delayed end-of-combat DESTROY is not damage
    // and still happens (CR 511). Drain at the regular step's exit, the end-of-combat boundary.
    return firstStrikeStep ? fogged : drainEndOfCombatEffects(fogged);
  }
  // The first combat-damage step only happens if a creature has first/double
  // strike (CR 510.4) — otherwise skip it entirely (the regular step does all).
  if (firstStrikeStep && !combatHasFirstStrike(state, combat)) {
    return state;
  }

  const blockers = Array.isArray(combat.blockers) ? combat.blockers : [];
  const blockersByAttacker = {};
  for (const b of blockers) {
    (blockersByAttacker[b.attackerId] ||= []).push(b);
  }

  // ===== EVADE (the SET-level ≥N block-size rule — CR 509.1b / 702.111b; menace + BLITZ EV-3) =====
  // An attacker whose block must contain at least N creatures (menace's 2, or the printed "can't be
  // blocked except by <N> or more creatures" — Guile / Rampaging Ceratops class, plus the Sonorous
  // Howlbonder team static; attackerMinBlockers aggregates all three, layer-aware) that is left with
  // FEWER than N blockers can't legally be blocked → it's unblocked (the under-sized would-be block
  // isn't in combat, so those blockers deal/take no combat damage). ≥N blockers resolve normally; an
  // unrestricted attacker (N=1) is untouched. legalChoices already avoids offering a hopeless
  // under-sized block; this is the resolution guarantee.
  for (const att of combat.attackers) {
    const list = blockersByAttacker[att.permanentId];
    if (list && list.length < attackerMinBlockers(state, att.permanentId)) {
      delete blockersByAttacker[att.permanentId];
    }
  }

  const dealsThisStep = (perm) => {
    // LACCOLITH (④-AU — "this creature assigns no combat damage this turn"): a creature stamped for THIS turn by the
    // taken optional damage deals nothing in either damage step — attacker, sole blocker or divided multi-blocker
    // (every dealer loop passes through here). It still RECEIVES combat damage. Self-expires: next turn's number differs.
    if (perm.noCombatDamageTurn === state.turn) return false;
    const fs = permanentHasKeyword(state, perm.id, "First strike");
    const ds = permanentHasKeyword(state, perm.id, "Double strike");
    return firstStrikeStep ? (fs || ds) : (!fs || ds);
  };

  // REGEN (CR 701.19a): a creature regenerated in an EARLIER damage step of this combat is removed from combat
  // — it deals and takes no further combat damage. It's still on the battlefield (findPermanent finds it), so
  // the damage loops must skip it explicitly. `combatant` returns the live lookup ONLY while still in combat.
  const combatant = (id) => { const lk = findPermanent(state, id); return lk && !lk.permanent.removedFromCombat ? lk : null; };

  // CR 122.1c — a creature with a SHIELD COUNTER has all combat damage that would be dealt to it this step
  // PREVENTED, and removes one shield counter (ONE event per creature — CR 510.2 combat damage is simultaneous).
  // Modeled like protection: the shield is read off the PRE-step `state`, so a creature shielded at the start of
  // the step prevents every source's damage this step and (below, after the deal loops) removes exactly one
  // shield. Prevented damage is NOT dealt — no marks, no -1/-1, no lifelink credit, no combat-damage-to-creature
  // trigger (Toxin/Wolverine), no enrage — matching CR 120.8 (0 damage dealt). ASSIGNMENT still treats the
  // shielded creature as absorbing its lethal share for trample (CR 510.1c-d — assignment ignores prevention),
  // so a trampler over a shielded blocker still spills only the excess. `shieldConsumed` records which shields to
  // remove after the loops. Gated on the counter, so a no-shield board never allocates work → byte-identical.
  const shieldPrevents = (id) => { const lk = findPermanent(state, id); return !!(lk && hasShieldCounter(lk.permanent)); };
  const shieldConsumed = new Set();

  // COUNTER-SHIELD (Phantom cycle / Bloatfly Swarm, CR 615) — a prevention wall that PAYS OUT OF +1/+1
  // COUNTERS. Same record-at-the-deal-site shape as shieldConsumed directly above, but a MAP (id -> counters
  // owed) rather than a Set, because Bloatfly sheds "that many" rather than one.
  //
  // ⭐ THE LOCAL BUDGET IS LOAD-BEARING. `state` is the frozen pre-step board, so several hits in one step
  // would each read the SAME starting counter total and could between them promise to remove more counters
  // than the creature owns - handing out phantom rad counters and a negative counter bag. csBudget tracks
  // what is left as the step is walked, so the total removed can never exceed what it actually had.
  const csRemovals = new Map();   // permanentId -> +1/+1 counters to remove after the loops
  const csRad = { n: 0 };         // Bloatfly: rad counters owed to EACH player, = counters actually removed
  const csBudget = new Map();     // permanentId -> counters still available this step
  const csCountersLeft = (id) => {
    if (!csBudget.has(id)) {
      const lk = findPermanent(state, id);
      csBudget.set(id, (lk?.permanent?.counters?.["+1/+1"]) || 0);
    }
    return csBudget.get(id);
  };
  /** Decide the counter-shield for one hit. Returns true when the damage is PREVENTED. */
  const counterShieldPrevents = (targetId, amount) => {
    const lk = findPermanent(state, targetId);
    const mode = lk && counterShieldPrevention(lk.permanent.card);
    if (!mode) return false;
    const have = csCountersLeft(targetId);
    if (mode === "phantom") {
      // Prevention is UNCONDITIONAL - a Phantom with no counters left is still damage-proof, it just has
      // nothing to shed. Removes exactly one, when there is one.
      if (have > 0) {
        csBudget.set(targetId, have - 1);
        csRemovals.set(targetId, (csRemovals.get(targetId) || 0) + 1);
      }
      return true;
    }
    // BLOATFLY - conditional. No counter, no prevention: the damage goes through and it can die.
    if (have <= 0) return false;
    const removed = Math.min(have, amount);
    csBudget.set(targetId, have - removed);
    csRemovals.set(targetId, (csRemovals.get(targetId) || 0) + removed);
    csRad.n += removed;                       // "a rad counter for each +1/+1 counter removed this way"
    return true;
  };

  // PREVENT-AND-PUT (SHELF CAP9, CR 615 — Panther Habit / Ironscale Hydra): the counter-shield's inverse,
  // recorded here and PAID after the loops for the same reason csRemovals is — `state` is the frozen
  // pre-step board and addCounter must run against the accumulating `next`.
  //
  // ⭐ NO BUDGET, DELIBERATELY (contrast csBudget above). The shield needs one because it spends a finite
  // resource several hits could over-promise; this pays OUT, so each prevented hit independently earns its
  // own counters and two hits in one step correctly earn twice. The absence of a budget here is the
  // difference between the two families, not an oversight.
  const pcAdditions = new Map();  // permanentId -> +1/+1 counters to ADD after the loops
  /** Decide the prevent-and-put wall for one hit. Returns true when the damage is PREVENTED. */
  const preventAndPutCounters = (targetId, amount, sourcePerm) => {
    const lk = findPermanent(state, targetId);
    if (!lk) return false;
    // ATTACHED (Panther Habit): all damage, any source, "that many" = the amount about to be dealt.
    if (attachedPreventPutCounters(state, targetId)) {
      if (amount > 0) pcAdditions.set(targetId, (pcAdditions.get(targetId) || 0) + amount);
      return true;
    }
    // SELF (Ironscale Hydra): COMBAT damage FROM A CREATURE only, and exactly ONE counter. This funnel is
    // by definition combat, so the remaining printed restriction to enforce is the source being a creature
    // — checked live off the dealer's type line. A sourceless hit can't satisfy "a creature would deal", so
    // it is NOT prevented (FN-safe: the Hydra takes it, never an invented wall).
    if (selfPreventPutCounters(lk.permanent.card)) {
      const type = String(sourcePerm?.card?.type_line ?? sourcePerm?.card?.type ?? "");
      if (!/\bcreature\b/i.test(type)) return false;
      pcAdditions.set(targetId, (pcAdditions.get(targetId) || 0) + 1);
      return true;
    }
    return false;
  };

  // ASSIGNS-DAMAGE-BY-TOUGHNESS (BLITZ DN-1, CR 510.1a — Doran / Belligerent Brontodon / Ancient Lumberknot):
  // the AMOUNT of combat damage a creature assigns. CR 510.1a assigns combat damage equal to POWER; a live
  // "assigns combat damage equal to its toughness rather than its power" static replaces that with the
  // creature's layer-aware effective TOUGHNESS (assignsCombatDamageWithToughness reads the static via the
  // shared selector machinery, scoped to the printed subject). Only the assigned MAGNITUDE changes — a
  // blocker's lethal-need (its own toughness) and every keyword branch (first/double strike, trample,
  // deathtouch, lifelink, infect) read this substituted amount consistently. Floored at 0 (CR 510.1a — a
  // creature that would assign 0 or less doesn't assign at all). Byte-identical on a Doran-less board:
  // assignsCombatDamageWithToughness returns false for the empty/no-static board, so this collapses to the
  // exact `Math.max(0, creaturePower(...))` the two deal sites used before this seam.
  const combatDamageAmount = (perm) =>
    Math.max(0, assignsCombatDamageWithToughness(state, perm.id)
      ? creatureToughness(perm, state)
      : creaturePower(perm, state));

  // ── Compute damage from the pre-step board (simultaneous within the step) ──
  const dmgToPermanent = {};   // permanentId -> amount
  const deathtouched = new Set();
  const lifeLoss = {};         // playerId -> amount
  const lifeGain = {};         // playerId -> amount (lifelink)
  const dealtBySources = {};   // permId -> total dealt this step (SL-1 — the dealt-by lifegain links)
  const minusCounters = {};    // permanentId -> count (KW-POISON: infect/wither creature damage → -1/-1)
  const poisonGain = {};       // playerId -> count (KW-POISON: infect/toxic combat damage → poison)
  const loyaltyLoss = {};      // planeswalker permanentId -> loyalty removed by combat damage (PW-1)
  const playerEvents = [];
  // WOLVERINE clause 2 (CR 603.4 intervening-if): record (sourcePerm → creature it dealt damage to) pairs so
  // the per-turn `dealtDamageToCreatureThisTurn` flag can be armed when `next` is built below. Only pairs whose
  // SOURCE carries the clause are recorded, so a board without Wolverine collects nothing → byte-identical.
  const armPairs = [];
  const recordArm = (sourcePerm, targetCreatureId) => {
    if (sourcePerm?.card && marksDamageToCreature(sourcePerm.card)) armPairs.push({ source: sourcePerm, targetId: targetCreatureId });
  };
  // GLOBAL SUBTYPE combat-damage-to-a-creature (Toxin Sliver) — record (dealing creature → damaged creature)
  // pairs so checkCombatDamageToCreatureTriggers can fire "Whenever a <Subtype> deals combat damage to a
  // creature, destroy that creature". UNGATED (unlike recordArm's Wolverine gate): every creature-vs-creature
  // combat-damage hit is recorded with its dealer + the dealer's controller + the damaged creature, then the
  // trigger scan applies the exact subtype gate. Only collected when `dealtToTarget > 0` (CR 120.8 — a
  // 0/prevented hit isn't "combat damage dealt"). Keyed nowhere — a flat list, deduped implicitly by the
  // per-hit semantics (one entry per source→target this step; the trigger fires per pair, matching CR 510.2).
  const creatureDamagePairs = [];
  const recordCreatureDamage = (sourcePerm, damagedCreatureId, dealt) => {
    if (dealt > 0 && sourcePerm?.id != null) creatureDamagePairs.push({ dealerId: sourcePerm.id, dealerController: sourcePerm.controller, damagedCreatureId });
  };
  // KW-POISON (CR 702.90b infect / 702.80a wither): when the SOURCE has infect or wither, combat
  // damage to a creature is dealt as that many -1/-1 counters, NOT as marked damage (`minus=true`).
  // The damage is still "dealt", so deathtouch (if also present) still marks the creature — no real
  // card has infect/wither AND deathtouch (corpus-verified 0), so this is a harmless guard.
  const addDmg = (id, n, dt, minus) => {
    if (n > 0) {
      if (minus) minusCounters[id] = (minusCounters[id] || 0) + n;
      else dmgToPermanent[id] = (dmgToPermanent[id] || 0) + n;
      if (dt) deathtouched.add(id);
    }
  };
  // KW-PROTECTION (CR 702.16e): damage from a source of the stated color is PREVENTED. `targetId` is the
  // creature taking damage; `sourceColors` is the dealer's colors. Read LAYER-AWARE so PRINTED protection
  // AND protection GRANTED by an attached Equipment/Aura (the Captain America Swords) both apply. A
  // prevented blocker/attacker takes NO marked damage, NO -1/-1 counters, and grants NO lifelink — the
  // call sites skip dealing entirely (CR 702.16e + the trample assignment in 702.19e).
  const protectionPrevents = (targetId, sourceColors) => {
    // B7 — PROTECTION FROM CREATURES (CR 702.16e): every combat-damage source is a creature, so the class quality
    // prevents the damage outright, beside the color check.
    return protectionApplies(permanentProtectionColors(state, targetId), sourceColors)
      || permanentProtectionClasses(state, targetId).has("creatures");
  };

  // ===== DAMAGE-REPLACEMENT consult (CR 614 — Wolverine "double all damage", Furnace of Rath …) =====
  // Gated on the board carrying ANY replacement: a no-doubler board never calls the consult, so its damage
  // numbers (and the whole step) are byte-identical to before this seam. The consult finalizes the amount
  // BEFORE it is recorded (added to dmgToPermanent / spilled to the defender) — never a hook on loseLife.
  // FRESH per resolveCombatDamage call (MUST-FIX 4): each combat sub-step is its own call, so a double-striker
  // doubles in BOTH the first-strike and the regular step (per-step doubling, never ×2 "for two steps").
  const hasReplacement = boardHasDamageReplacement(state);
  // PV-1 (CR 615): floating prevent-next-N shields consume at THIS funnel — per source→target deal event,
  // BEFORE the amount is recorded — so lifelink / infect / toxic / commander damage / triggers all read the
  // post-prevention amount (a shield-counter-style skip, but with a decrementing magnitude). The pool is a
  // LOCAL copy (the shieldConsumed pattern: state is the frozen pre-step board) written back to `next` after
  // the apply loops. Empty pool → zero allocations on the hot path → byte-identical.
  const pvPool = unpreventable ? [] : preventionShieldsFor(state).map((s) => ({ ...s })); // SG-11: no shield consumes while combat damage can't be prevented
  const pvConsume = (targetKind, targetId, dealt) => {
    let rem = dealt;
    for (const sh of pvPool) {
      if (rem <= 0) break;
      if (sh.amount <= 0 || sh.targetKind !== targetKind || sh.targetId !== targetId) continue;
      const used = Math.min(sh.amount, rem);
      sh.amount -= used;
      rem -= used;
      // ④-H (the en-Kor cycle, CR 615.7): a REDIRECT shield sends the consumed damage to the named creature instead —
      // it joins the SAME accumulation every other combat deal uses (marked and lethal-checked with the rest). Dealt
      // as plain damage: the dealer's deathtouch/infect is not carried (an under-kill — the FN-safe direction).
      if (sh.redirectTo && findPermanent(state, sh.redirectTo)) addDmg(sh.redirectTo, used, false, false);
    }
    return rem;
  };
  // Finalize a combat damage amount for one source→target event. `targetKind` is "creature" | "player" |
  // "planeswalker"; `targetId` is the receiving permanent/player. 120.8 zero-guard is re-checked by the
  // callers (addDmg's `n > 0`, spillToDefender's `amount <= 0`) AFTER this returns.
  // PLAYERS-ONLY FOG (BLITZ FOG-1b, CR 615 — Defend the Hearth): the players-scoped fog flag zeroes only
  // player-directed deals (the bare whole-turn fog short-circuits the whole step above, untouched).
  const fogPlayers = state.preventCombatPlayersTurn === state.turn && !unpreventable;
  const consultCombat = (rawAmount, sourcePerm, targetKind, targetId) => {
    let amt = rawAmount;
    if (amt > 0 && fogPlayers && targetKind === "player") return 0;
    // FOG-1 self statics: the damaged CREATURE's own printed prevent-all wall (Guard Gomazoa's combat
    // form and Dawn Elemental's all form both zero a combat deal). Read per hit, layer-free (a printed
    // static — no granted form is modeled, so the card read is exact). SG-11: every wall in this block and
    // the dealer block below is inert while combat damage can't be prevented.
    if (amt > 0 && !unpreventable && targetKind === "creature") {
      const lk = findPermanent(state, targetId);
      if (lk && selfDamagePrevention(lk.permanent.card)) return 0;
      // COUNTER-SHIELD: prevents like the flat walls above, but bills itself in +1/+1 counters (recorded
      // here, applied after the loops). Sits AFTER the flat walls so a creature carrying both is prevented
      // by the free one and never charged a counter it did not need to spend.
      if (counterShieldPrevents(targetId, amt)) return 0;
      // PREVENT-AND-PUT (CAP9): sits directly after its sibling and BEFORE the attached AP-1 wall. Under
      // CR 616.1 the affected creature's controller orders applicable prevention effects; the engine's
      // deterministic stand-in gives this one priority over the flat attached wall because it is the only
      // one with an upside, which is what that controller would choose. A creature carrying a FREE self
      // wall (Guard Gomazoa) above still wins — the counters simply aren't earned, an under-count and so
      // the FN-safe direction, never an over-claim.
      if (preventAndPutCounters(targetId, amt, sourcePerm)) return 0;
      // AP-1 (Gaseous Form / Sandskin): an attached "…dealt TO enchanted creature" wall zeroes the deal.
      if (lk && attachedDamagePrevention(state, targetId).to) return 0;
    }
    // AP-1 (Gaseous Form / Defang): the DEALER's attached "…dealt BY enchanted creature" wall zeroes
    // every combat deal it makes ("all" and "combat" both bind here — this IS combat damage). PV-1 adds the
    // DEALER's own printed self BY wall (Fog Bank "…dealt to and dealt by this creature") — it deals zero
    // combat damage, so a Fog Bank blocking a 6/6 takes none (TO wall, line above) AND marks none on it.
    if (amt > 0 && !unpreventable && sourcePerm?.id) {
      if (attachedDamagePrevention(state, sourcePerm.id).by) return 0;
      if (selfDamagePreventionBy(sourcePerm.card)) return 0;
    }
    if (hasReplacement && amt > 0) {
      amt = consultDamageAmount(state, {
        sourceId: sourcePerm?.id ?? null,
        sourceController: sourcePerm?.controller ?? null,
        amount: amt,
        targetKind,
        targetId,
        isCombat: true,
      });
    }
    // PV-1: shields consume AFTER the doubler (deterministic 616.1 ordering, matching applyDamageEffect).
    if (amt > 0 && pvPool.length) amt = pvConsume(targetKind, targetId, amt);
    return amt;
  };

  // Attackers deal.
  for (const att of combat.attackers) {
    const lookup = combatant(att.permanentId);
    if (!lookup || !dealsThisStep(lookup.permanent)) continue;
    const attackerId = lookup.permanent.id;
    const power = combatDamageAmount(lookup.permanent);
    const deathtouch = permanentHasKeyword(state, attackerId, "Deathtouch");
    const trample = permanentHasKeyword(state, attackerId, "Trample");
    const lifelink = permanentHasKeyword(state, attackerId, "Lifelink");
    // KW-POISON — read the attacker's source keywords (layer-aware, so a granted infect counts).
    // infect/wither reroute its CREATURE damage to -1/-1 counters; infect reroutes its PLAYER damage
    // to poison (replacement); toxic N adds N poison ON TOP of normal player damage.
    const attackerMinus = permanentHasKeyword(state, attackerId, "Infect") || permanentHasKeyword(state, attackerId, "Wither");
    const attackerInfect = permanentHasKeyword(state, attackerId, "Infect");
    const attackerToxicN = toxicValue(lookup.permanent.card);
    const attackerColors = permanentColors(state, attackerId); // KW-PROTECTION: a blocker protected from these takes 0

    // "Was blocked" reads the DECLARED blockers; "live" reads the survivors.
    // A creature blocked by a now-dead blocker (e.g. a first-striker that
    // killed its blocker) stays blocked and deals no damage to the player —
    // it must NOT fall through to the unblocked path. (CR 509.1h / 510.1c.)
    const declaredBlockers = blockersByAttacker[att.permanentId] || [];
    const wasBlocked = declaredBlockers.length > 0;
    const liveBlockers = declaredBlockers
      .map(b => combatant(b.blockerId))
      .filter(Boolean);

    const spillToDefender = (rawAmount, trampleFlag) => {
      if (rawAmount <= 0) return 0;
      // PW-1: if this attacker is attacking a planeswalker, its damage to the "defender" is removed
      // as loyalty from that walker (CR 120.3c), NOT life from its controller. If the walker has
      // already left the battlefield, the attacker deals no combat damage — it does NOT redirect to
      // the player (CR 509.1h / 508.4 — its declared target is gone).
      if (att.defenderPlaneswalkerId) {
        const pw = findPermanent(state, att.defenderPlaneswalkerId);
        if (pw && isPlaneswalker(pw.permanent.card)) {
          // DAMAGE-REPLACEMENT (CR 120.3c — loyalty uses the DOUBLED amount; the consult runs BEFORE the
          // loyalty event is constructed). 120.8 zero-guard: doubling never produces 0 from >0, but re-check.
          const amount = consultCombat(rawAmount, lookup.permanent, "planeswalker", att.defenderPlaneswalkerId);
          if (amount <= 0) return 0;
          loyaltyLoss[att.defenderPlaneswalkerId] = (loyaltyLoss[att.defenderPlaneswalkerId] || 0) + amount;
          playerEvents.push({ kind: "combat-damage-planeswalker", turn: state.turn, attackerId: att.permanentId, attackingPlayer: att.attackingPlayer, planeswalkerId: att.defenderPlaneswalkerId, amount, ...(trampleFlag ? { trample: true } : {}) });
          return amount;
        }
        return 0;
      }
      const defender = att.defender;
      // DAMAGE REDIRECT (shelf D42, CR 614.9 — With Great Power . . ., Pariah, Empyrial Archangel): combat damage that would be
      // dealt to the defender is dealt to the creature their redirect names instead — the deal an attacker makes to a blocker
      // (protection, Maze of Ith's stamp, a shield counter, the creature-side walls and doublers, deathtouch and infect/wither,
      // the dealt-by record). Wolverine's dealt-to-a-creature arm is not set — an under-delivery. No player is dealt damage, so
      // no combat-damage-player event: no commander damage, no monarch steal, no "deals combat damage to a player" trigger.
      // Applied first, a legal CR 616.1 order. Lifelink still counts it.
      const redirectTo = defender && state.players[defender] ? playerDamageRedirectTarget(state, defender) : null;
      if (redirectTo) {
        if (protectionPrevents(redirectTo, attackerColors)) return 0;
        if (findPermanent(state, redirectTo).permanent.takesNoCombatDamageTurn === state.turn) return 0;
        if (shieldPrevents(redirectTo)) { shieldConsumed.add(redirectTo); return 0; }
        const amount = consultCombat(rawAmount, lookup.permanent, "creature", redirectTo);
        addDmg(redirectTo, amount, deathtouch, attackerMinus);
        recordCreatureDamage(lookup.permanent, redirectTo, amount);
        return amount;
      }
      if (defender && state.players[defender]) {
        // DAMAGE-REPLACEMENT (CR 614): finalize the player-damage amount BEFORE the infect/toxic split and
        // BEFORE the combat-damage-player event (so 903.10a commander damage accrues the DOUBLED amount —
        // the 21-rule reads playerEvents.amount). The toxic-N rider is added AFTER and is NOT doubled.
        const amount = consultCombat(rawAmount, lookup.permanent, "player", defender);
        if (amount <= 0) return 0;
        // KW-POISON (CR 702.90a infect / 702.180a toxic). Infect REPLACES the life loss with that many
        // poison counters (the player loses NO life). Otherwise normal life loss, PLUS — if the attacker
        // has toxic N — a fixed N poison on top (additive). N is per damage EVENT, so a double-striker
        // poisons in BOTH combat steps (each is its own resolveCombatDamage call), matching CR. The event
        // below still carries `amount` so 21-rule commander damage (903.10a) and "deals combat damage to a
        // player" triggers fire — infect/toxic damage is still combat damage, just in poison form.
        if (attackerInfect) {
          poisonGain[defender] = (poisonGain[defender] || 0) + amount;
        } else {
          lifeLoss[defender] = (lifeLoss[defender] || 0) + amount;
          if (attackerToxicN > 0) poisonGain[defender] = (poisonGain[defender] || 0) + attackerToxicN;
        }
        // CMD-DAMAGE (CR 903.10a): if the attacker is a commander, tag the event with its card id (+ name,
        // for N4's log line) so the post-combat step accrues 21-rule commander damage to the defender
        // (keyed per-commander).
        const attCard = lookup.permanent?.card;
const commanderId = attCard?.isCommander ? (attCard.commanderInstanceId || attCard.id) : null;
        playerEvents.push({ kind: "combat-damage-player", turn: state.turn, attackerId: att.permanentId, attackingPlayer: att.attackingPlayer, defender, amount, ...(commanderId ? { commanderId, commanderName: attCard.name } : {}), ...(trampleFlag ? { trample: true } : {}) });
        return amount;
      }
      return 0;
    };

    let dealt = 0;
    // ASSIGN-AS-UNBLOCKED (BLITZ TE-1, CR 508.1h — Thorn Elemental class): a BLOCKED attacker printing
    // "You may have this creature assign its combat damage as though it weren't blocked" assigns its FULL
    // power straight to the defending player (the deterministic take of the printed MAY — always legal,
    // and the entire point of the card). Its blockers still deal back normally in the blocker loop below;
    // trample is irrelevant on this path (nothing is assigned to blockers, so nothing "spills").
    if ((liveBlockers.length > 0 || wasBlocked) && (mayAssignAsUnblocked(lookup.permanent.card) || permanentHasKeyword(state, lookup.permanent.id, "assignsCombatDamageAsUnblocked"))) {
      dealt += spillToDefender(power, false);
    } else if (liveBlockers.length > 0) {
      let remaining = power;
      for (const blk of liveBlockers) {
        const already = blk.permanent.damageMarked || 0;
        // Deathtouch makes 1 damage lethal; otherwise lethal = remaining toughness.
        const lethalNeed = deathtouch ? 1 : Math.max(1, creatureToughness(blk.permanent, state) - already);
        // KW-PROTECTION (CR 702.16e): a blocker with protection from the attacker's color has the damage
        // PREVENTED — it is dealt 0. But damage ASSIGNMENT ignores prevention (CR 510.1c-d / 702.19d:
        // "not any abilities or effects that might change the amount of lethal damage"), so the blocker
        // still absorbs its lethal share before anything can trample past it: a 5/5 red trampler blocked
        // by a 2/2 pro-red deals 3 to the player, not 5.
        if (protectionPrevents(blk.permanent.id, attackerColors)) {
          remaining -= Math.min(remaining, lethalNeed);
          continue;
        }
        // MAZE OF ITH (SHELF-85 V13, CR 615): a blocker stamped "takes no combat damage this turn" is dealt 0 — exactly
        // the protection shape above: assignment still absorbs its lethal share, so a trampler spills only the excess.
        if (blk.permanent.takesNoCombatDamageTurn === state.turn) {
          remaining -= Math.min(remaining, lethalNeed);
          continue;
        }
        const give = Math.min(remaining, lethalNeed);
        // CR 122.1c — a SHIELD COUNTER on the blocker PREVENTS the damage (0 dealt: no mark, no lifelink, no
        // Wolverine/Toxin combat-damage-to-creature trigger) and removes one shield. Like protection, ASSIGNMENT
        // still absorbs its lethal share (`remaining -= give` below), so a trampler spills only the excess.
        if (shieldPrevents(blk.permanent.id)) {
          shieldConsumed.add(blk.permanent.id);
          remaining -= give;
          continue;
        }
        // DAMAGE-REPLACEMENT (CR 614 + 702.19e): the attacker ASSIGNS lethal off normal toughness, then each
        // assigned chunk is doubled as it's DEALT — so `remaining` decrements by the un-doubled `give` (the
        // assignment math) while the blocker is MARKED (and lifelink credited) the doubled amount. 120.8: a
        // doubled-from->0 chunk can't appear (give>0), but addDmg's `n > 0` re-guards regardless.
        const dealtToBlocker = consultCombat(give, lookup.permanent, "creature", blk.permanent.id);
        addDmg(blk.permanent.id, dealtToBlocker, deathtouch, attackerMinus);
        if (dealtToBlocker > 0) recordArm(lookup.permanent, blk.permanent.id); // WOLVERINE: attacker dealt to a creature
        recordCreatureDamage(lookup.permanent, blk.permanent.id, dealtToBlocker); // SUBTYPE-GLOBAL→CREATURE (Toxin): attacker → blocker
        remaining -= give;
        dealt += dealtToBlocker;
      }
      // Trample: leftover beyond all blockers' lethal need spills to the defender.
      if (trample && remaining > 0) dealt += spillToDefender(remaining, true);
    } else if (wasBlocked) {
      // Blocked, but every blocker is gone. Deals NO damage — unless trample,
      // which then lets its full power through (no blockers to assign to).
      if (trample) dealt += spillToDefender(power, true);
    } else {
      // Truly unblocked: full damage to the defending player.
      dealt += spillToDefender(power, false);
    }
    if (lifelink && dealt > 0) lifeGain[att.attackingPlayer] = (lifeGain[att.attackingPlayer] || 0) + dealt;
    // SL-1: record the attacker's DEALT total for the dealt-by lifegain links (one CR 510.2 event per source).
    if (dealt > 0) dealtBySources[att.permanentId] = (dealtBySources[att.permanentId] || 0) + dealt;
  }

  // ── MULTI-BLOCK DIVISION (BLITZ CS-1, CR 510.1d) ──
  // "If it's blocking two or more creatures, it assigns its combat damage divided as its controller
  // chooses among them." A creature blocking 2+ attackers (legal via maxBlocksOf — Palace Guard /
  // Selesnya Sagittars class) must DIVIDE its power, never deal it in full to each (that would be a
  // fabricated-damage FP). Deterministic take of the division choice: lethal need (deathtouch → 1,
  // CR 702.2c) to each blocked attacker in DECLARATION order, then all remainder onto the LAST one —
  // a legal division under 510.1d. Computed per damage sub-step from the step's live combatants (a
  // first-strike casualty drops out and the survivor absorbs the full division, mirroring the
  // attacker-side loop). Single-block (the universal case): the map stays empty and the deal below
  // uses full power — byte-identical.
  const blockCountByBlocker = {};
  for (const list of Object.values(blockersByAttacker)) {
    for (const b of list) blockCountByBlocker[b.blockerId] = (blockCountByBlocker[b.blockerId] || 0) + 1;
  }
  const multiBlockPortion = {}; // "blockerId::attackerId" -> assigned amount this step
  for (const [bid, count] of Object.entries(blockCountByBlocker)) {
    if (count < 2) continue;
    const blk = combatant(bid);
    if (!blk || !dealsThisStep(blk.permanent)) continue;
    // The attackers this blocker blocks, in declaration order, still in combat this step (a normalized
    // under-sized block was deleted from blockersByAttacker above and never receives an assignment).
    const targets = blockers
      .filter((b) => b.blockerId === bid && blockersByAttacker[b.attackerId])
      .map((b) => combatant(b.attackerId))
      .filter(Boolean);
    if (targets.length === 0) continue;
    let remaining = combatDamageAmount(blk.permanent);
    const bdt = permanentHasKeyword(state, bid, "Deathtouch");
    const gives = targets.map((t) => {
      const already = t.permanent.damageMarked || 0;
      const lethalNeed = bdt ? 1 : Math.max(1, creatureToughness(t.permanent, state) - already);
      const give = Math.min(remaining, lethalNeed);
      remaining -= give;
      return { id: t.permanent.id, give };
    });
    if (remaining > 0) gives[gives.length - 1].give += remaining;
    for (const g of gives) multiBlockPortion[`${bid}::${g.id}`] = g.give;
  }

  // Blockers deal back to the attacker they're blocking.
  for (const att of combat.attackers) {
    const attLookup = combatant(att.permanentId);
    if (!attLookup) continue;
    for (const b of (blockersByAttacker[att.permanentId] || [])) {
      const blk = combatant(b.blockerId);
      if (!blk || !dealsThisStep(blk.permanent)) continue;
      // CR 510.1d — a multi-blocking creature deals only its DIVIDED portion to this attacker.
      const portionKey = `${blk.permanent.id}::${att.permanentId}`;
      const bpow = portionKey in multiBlockPortion ? multiBlockPortion[portionKey] : combatDamageAmount(blk.permanent);
      const bdt = permanentHasKeyword(state, blk.permanent.id, "Deathtouch");
      const blifelink = permanentHasKeyword(state, blk.permanent.id, "Lifelink");
      // KW-PROTECTION (CR 702.16e): if the attacker has protection from the blocker's color, the blocker's
      // damage back to it is prevented — 0 dealt, and no lifelink for the blocker.
      if (protectionPrevents(att.permanentId, permanentColors(state, blk.permanent.id))) continue;
      // MAZE OF ITH (SHELF-85 V13): an attacker stamped "takes no combat damage this turn" is dealt 0 by its blockers.
      if (attLookup.permanent.takesNoCombatDamageTurn === state.turn) continue;
      // CR 122.1c — a SHIELD COUNTER on the ATTACKER (the recipient here) PREVENTS the blocker's damage (0 dealt:
      // no mark, no blocker lifelink, no Wolverine/Toxin trigger) and removes one shield. No trample math applies
      // to a creature dealing damage back, so this is a clean skip (mirrors the protection skip above).
      if (shieldPrevents(att.permanentId)) { shieldConsumed.add(att.permanentId); continue; }
      // KW-POISON — the BLOCKER is the source here, so its OWN infect/wither reroutes the damage it
      // deals back to the attacker into -1/-1 counters (toxic is player-only, irrelevant blocking).
      const bminus = permanentHasKeyword(state, blk.permanent.id, "Infect") || permanentHasKeyword(state, blk.permanent.id, "Wither");
      // DAMAGE-REPLACEMENT (CR 614): the BLOCKER is the source here — double its damage to the attacker (and
      // credit its lifelink off the doubled amount). Source-scoped to the blocker permanent.
      const bdealt = consultCombat(bpow, blk.permanent, "creature", att.permanentId);
      addDmg(att.permanentId, bdealt, bdt, bminus);
      if (bdealt > 0) recordArm(blk.permanent, att.permanentId); // WOLVERINE: blocker dealt to the attacking creature
      recordCreatureDamage(blk.permanent, att.permanentId, bdealt); // SUBTYPE-GLOBAL→CREATURE (Toxin): blocker → attacker
      if (blifelink && bdealt > 0) lifeGain[blk.permanent.controller] = (lifeGain[blk.permanent.controller] || 0) + bdealt;
      // SL-1: the blocker is a dealt-by source too.
      if (bdealt > 0) dealtBySources[blk.permanent.id] = (dealtBySources[blk.permanent.id] || 0) + bdealt;
    }
  }

  // ── Apply marks + life changes ──
  let next = state;
  // CR 122.1c — remove one shield counter from each creature whose combat damage this step was prevented by its
  // shield (recorded at the deal sites). Done BEFORE marking so the log reflects the post-prevention board.
  for (const id of shieldConsumed) if (findPermanent(next, id)) next = consumeShieldCounter(next, id);
  // COUNTER-SHIELD payout (CR 615) — spend the +1/+1 counters the prevention was billed to, then hand out
  // Bloatfly's rad. Also before marking, for the same reason the shield line above is: the log should show
  // the board AFTER the wall has paid for itself.
  //
  // ⛔ THIS LOOP IS THE HALF THAT MAKES THE CREDIT HONEST. Prevention without it is a creature that blocks
  // all damage forever and never pays - unkillable by damage, strictly better than every printed card here.
  // If this is ever removed, counterShieldPrevention must stop being credited in coverage on the same day.
  for (const [id, n] of csRemovals) {
    if (n > 0 && findPermanent(next, id)) next = removeCounter(next, { permanentId: id, type: "+1/+1", amount: n });
  }
  // "…give EACH PLAYER a rad counter for each +1/+1 counter removed this way" - every player, not just
  // opponents (CR 728; the rad subsystem itself is already modeled and mills/drains at each precombat main).
  if (csRad.n > 0) {
    for (const pid of Object.keys(next.players)) next = addRadCounters(next, { playerId: pid, amount: csRad.n });
  }
  // PREVENT-AND-PUT payout (CAP9, CR 615) — the half that makes THIS credit honest, exactly as the
  // csRemovals loop above is for the shield. Routed through addCounter (the counter chokepoint) rather
  // than a direct write, so CR 616 counter doublers and every counters-placed watcher see the placement.
  // A creature that left the battlefield during the step earns nothing (findPermanent guard), matching
  // every sibling loop here.
  for (const [id, n] of pcAdditions) {
    if (n > 0 && findPermanent(next, id)) next = addCounter(next, { permanentId: id, type: "+1/+1", amount: n });
  }
  // PV-1 (CR 615): write the surviving prevention shields back (the local pool decremented at the deal
  // sites). Only when a live pool existed — an empty pool leaves state untouched (byte-identical).
  if (pvPool.length) next = { ...next, preventionShields: pvPool.filter((s) => s.amount > 0) };
  for (const [id, amount] of Object.entries(dmgToPermanent)) {
    if (findPermanent(next, id)) next = markCombatDamage(next, { permanentId: id, amount });
  }
  // DAMAGED-BY (the Sengir Vampire family — "whenever a creature dealt damage by ~ this turn dies"): the
  // marking loop above works off dmgToPermanent, which is aggregated per victim and has therefore already
  // thrown away WHO dealt each hit. creatureDamagePairs still has it — the same ungated per-hit list the
  // Toxin Sliver trigger reads — so the source record is taken from there rather than from a second,
  // parallel collection that could drift out of step with it. It also covers infect/wither, where the damage
  // became -1/-1 counters and never entered dmgToPermanent at all but was still damage DEALT.
  for (const pair of creatureDamagePairs) {
    if (findPermanent(next, pair.damagedCreatureId)) {
      next = recordDamageSource(next, { permanentId: pair.damagedCreatureId, sourceId: pair.dealerId });
    }
  }
  for (const [pid, amount] of Object.entries(lifeLoss)) {
    // TEFERI'S PROTECTION — protection from everything prevents all damage to the player (CR 702.16b); the life
    // lock would also hold the total, but the DAMAGE itself is prevented, so no lifelink / dealt-damage watcher
    // sees it either.
    if (amount > 0 && playerProtectedFromEverything(next, pid)) { next = logEvent(next, { kind: "combat-damage-prevented", playerId: pid, amount, via: "protection from everything" }); continue; }
    if (amount > 0) next = loseLife(next, { playerId: pid, amount, combatDamage: true });
  }
  // KW-POISON (CR 702.90b infect / 702.80a wither): infect/wither combat damage to a creature is dealt
  // as -1/-1 counters. Applied BEFORE the lethal SBA below so a creature dropped to 0 toughness is
  // destroyed in the SAME step (CR 704.5f) and fires its dies-triggers — exactly like marked lethal
  // damage. The +1/+1 ⟷ -1/-1 annihilation (CR 122.3) is handled by the net counterPtDelta math.
  for (const [id, amount] of Object.entries(minusCounters)) {
    if (amount > 0 && findPermanent(next, id)) next = addCounter(next, { permanentId: id, type: "-1/-1", amount });
  }
  // KW-POISON (CR 702.90a infect / 702.180a toxic): poison counters from combat damage to a player.
  for (const [pid, amount] of Object.entries(poisonGain)) {
    if (amount > 0 && next.players[pid]) next = addPoison(next, { playerId: pid, amount });
  }
  // CMD-DAMAGE (CR 903.10a): accrue 21-rule commander combat damage off the per-attacker events whose
  // attacker was a commander — read from the events (not the live board) so a commander that died trading
  // in this same step still records the damage it dealt. isPlayerDead checks the tracker for the SBA loss.
  // MONARCH (CR 725.4) — creature combat damage to the monarch passes the crown to the dealer's
  // controller. Read from the SAME per-attacker events as commander damage (a dealer that traded and
  // died this step still stole the crown — the events carry it). No monarch on board → no-op.
  next = applyMonarchCombatSteal(next, playerEvents);
  for (const ev of playerEvents) {
    if (ev.kind === "combat-damage-player" && ev.commanderId && ev.amount > 0) {
      next = addCommanderDamage(next, { commanderId: ev.commanderId, toPlayer: ev.defender, amount: ev.amount });
      // N4: log the accrual itself — previously silent (a board-visible progression toward the 21-rule
      // loss with zero explanation). total is read back off the tracker post-accrual so the log always
      // reflects the real running total, not just this hit's amount.
      const total = next.players[ev.defender]?.commanderDamageFrom?.[ev.commanderId] || ev.amount;
      next = logEvent(next, {
        kind: "commander-damage",
        turn: next.turn,
        commanderId: ev.commanderId,
        commanderName: ev.commanderName || "a commander",
        attackingPlayer: ev.attackingPlayer,
        defender: ev.defender,
        amount: ev.amount,
        total,
      });
    }
  }
  for (const [pid, amount] of Object.entries(lifeGain)) {
    // TRIG-LIFEGAIN (CR 119.3): lifelink life gain fires each gaining player's "Whenever you gain life".
    if (amount > 0) next = checkLifegainTriggers(gainLife(next, { playerId: pid, amount }), pid, amount);
  }
  // PW-1: remove loyalty from attacked planeswalkers (CR 120.3c — combat damage to a walker
  // removes that many loyalty counters). Guarded against a walker that left mid-step.
  for (const [pwId, amount] of Object.entries(loyaltyLoss)) {
    if (amount > 0 && findPermanent(next, pwId)) next = adjustLoyalty(next, { permanentId: pwId, delta: -amount });
  }

  // WOLVERINE clause 2: arm the per-turn `dealtDamageToCreatureThisTurn` flag for every source that dealt
  // damage to another creature this step (no-op when armPairs is empty → byte-identical without Wolverine).
  for (const { source, targetId } of armPairs) next = armDamageToCreatureFlag(next, source, targetId);

  // Combat-damage-to-a-player triggers (CR 510.2 — combat damage dealt) — fired off the per-attacker
  // player-damage events BEFORE the lethal SBA so a trading attacker is still present to bind to (it
  // triggered at the damage event; abilities that triggered on combat damage go on the stack after the
  // SBA, CR 510.3a). They land in pendingTriggers; flushTriggers stacks them at the next priority point.
  next = checkCombatDamageTriggers(next, playerEvents);
  // GLOBAL SUBTYPE combat-damage-TO-A-CREATURE (Toxin Sliver — "Whenever a Sliver deals combat damage to a
  // creature, destroy that creature"). Fired off the (dealer → damaged-creature) pairs collected above, BEFORE
  // the lethal SBA so both the dealer and the damaged creature are still on the battlefield to bind to (the
  // destroy resolves at the next priority point; a damaged creature that the lethal SBA already removed
  // self-no-ops at resolution — thatCreature → [] when it's gone). No-op without a Toxin-style watcher (the
  // collected pairs are inert until the trigger scan finds a matching subtype-global watcher).
  next = checkCombatDamageToCreatureTriggers(next, creatureDamagePairs);
  // BATCH combat-damage (CR 510.4) — "one or more creatures you control deal combat damage to a player"
  // fires ONCE per controller who connected (not per attacker). Same playerEvents, fired alongside.
  next = checkBatchCombatDamageTriggers(next, playerEvents);
  // ENRAGE / DAMAGE-RECEIVED (CR 603.2 — "Whenever this creature is dealt damage, …"). The step IS the
  // damage event (CR 510.2 — all combat damage is dealt simultaneously), so each creature fires EXACTLY
  // ONCE with its TOTAL this step — never once per attacking/blocking source. dmgToPermanent (marked
  // damage) and minusCounters (infect/wither — still "damage dealt", CR 120.3 / 702.90b) are the per-
  // creature tallies, already keyed by creature id (a creature blocked by TWO creatures has ONE summed
  // entry). Both are post-consult (the Wave-5a doubler already applied), and every recorded amount is > 0
  // (addDmg's `n > 0` guard), so prevented/0 damage (protection/fog) never produced an entry (CR 120.8).
  // Fired BEFORE the lethal SBA (the source binds while still on the battlefield); a creature that dies to
  // the SBA self-no-ops at resolution (the "must survive" reminder, CR 704.5g). The dealtDamage scope is
  // self-only, so summing both maps into one amount-per-creature is the faithful CR 510.2 single event.
  const dealtDamageTotals = {};
  for (const [id, amount] of Object.entries(dmgToPermanent)) dealtDamageTotals[id] = (dealtDamageTotals[id] || 0) + amount;
  for (const [id, amount] of Object.entries(minusCounters)) dealtDamageTotals[id] = (dealtDamageTotals[id] || 0) + amount;
  next = checkDealtDamageTriggers(next, Object.entries(dealtDamageTotals).map(([creatureId, amount]) => ({ creatureId, amount })));
  // SL-1 — the DEALT-BY lifegain links (Spirit Link / Zebra Unicorn): one event per dealing source with
  // its CR 510.2 step total, fired before the lethal SBA (the source + its attachments bind live).
  next = checkDealtByTriggers(next, Object.entries(dealtBySources).map(([sourceId, amount]) => ({ sourceId, amount })), { isCombat: true });

  // ── SBA: lethal damage (or ANY deathtouch damage) destroys creatures ──
  // N4: destroyLethalCreatures itself now logs each creature-dies (cause "combat" here, so the shape
  // is byte-identical to what this call site used to emit) — no separate emission loop needed below.
  const { state: afterDeaths, dead } = destroyLethalCreatures(next, deathtouched, "combat");
  next = afterDeaths;
  // ── SBA: a planeswalker at 0 loyalty is put into its owner's graveyard (CR 704.5i) ──
  const { state: afterPwDeaths, dead: deadPw } = destroyZeroLoyaltyPlaneswalkers(next);
  next = afterPwDeaths;

  // ── Log ──
  next = logEvent(next, {
    kind: "combat-damage",
    turn: next.turn,
    step: firstStrikeStep ? "first-strike" : "regular",
    deaths: dead.map(d => d.name),
    playerDamage: lifeLoss,
    lifeGain,
  });
  for (const ev of playerEvents) next = logEvent(next, ev);
  for (const d of deadPw) {
    next = logEvent(next, { kind: "planeswalker-dies", turn: next.turn, cardName: d.name, controller: d.controller, cause: "combat" });
  }

  // Fire dies triggers (self + surviving watchers) off the look-back `dead`
  // snapshot. They land in pendingTriggers; flushTriggers puts them on the stack
  // at the next priority-grant checkpoint.
  next = checkDiesTriggers(next, dead);
  // PLANESWALKER-DIES (CR 700.4) — a planeswalker driven to 0 loyalty by combat damage also "dies"; fire its
  // dies-watchers off the deadPw look-back so a creature-or-planeswalker drain (Cruel Celebrant) fires. Only
  // the creatureOrPwYouControl scope responds to a PW death; creature-only scopes skip it (see the function).
  next = checkPlaneswalkerDiesTriggers(next, deadPw);

  // DG-1 — the end-of-combat boundary (see drainEndOfCombatEffects): the regular step is this combat's
  // LAST damage sub-step, so after its damage + lethal SBA + dies look-backs the delayed end-of-combat
  // destroys fire. Never on the first-strike sub-step (CR 511 comes after ALL of CR 510).
  if (!firstStrikeStep) next = drainEndOfCombatEffects(next);

  return next;
}
