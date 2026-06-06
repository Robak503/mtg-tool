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
 * Deferred: Menace (needs multi-block coordination), first-strike vs regular
 * ordering subtleties beyond the two-step model, protection, indestructible.
 *
 * Mode-agnostic: reads `state.combat` + each attacker's `defender`, so Standard
 * (1v1) and Commander (4P) resolve through the same path. Vanilla combat (no
 * keywords) is byte-for-byte the old behavior, resolved entirely in the regular
 * step.
 */

import {
  findPermanent,
  loseLife,
  gainLife,
  logEvent,
  creaturePower,
  creatureToughness,
  markCombatDamage,
  destroyLethalCreatures,
} from "./gameState.js";
import { hasKeyword } from "./keywords.js";
import { checkDiesTriggers } from "./triggers.js";

function combatHasFirstStrike(state, combat) {
  const ids = [
    ...combat.attackers.map(a => a.permanentId),
    ...(combat.blockers || []).map(b => b.blockerId),
  ];
  return ids.some(id => {
    const lookup = findPermanent(state, id);
    return lookup && (hasKeyword(lookup.permanent.card, "First strike") || hasKeyword(lookup.permanent.card, "Double strike"));
  });
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
  // The first combat-damage step only happens if a creature has first/double
  // strike (CR 510.5) — otherwise skip it entirely (the regular step does all).
  if (firstStrikeStep && !combatHasFirstStrike(state, combat)) {
    return state;
  }

  const blockers = Array.isArray(combat.blockers) ? combat.blockers : [];
  const blockersByAttacker = {};
  for (const b of blockers) {
    (blockersByAttacker[b.attackerId] ||= []).push(b);
  }

  const dealsThisStep = (perm) => {
    const fs = hasKeyword(perm.card, "First strike");
    const ds = hasKeyword(perm.card, "Double strike");
    return firstStrikeStep ? (fs || ds) : (!fs || ds);
  };

  // ── Compute damage from the pre-step board (simultaneous within the step) ──
  const dmgToPermanent = {};   // permanentId -> amount
  const deathtouched = new Set();
  const lifeLoss = {};         // playerId -> amount
  const lifeGain = {};         // playerId -> amount (lifelink)
  const playerEvents = [];
  const addDmg = (id, n, dt) => {
    if (n > 0) {
      dmgToPermanent[id] = (dmgToPermanent[id] || 0) + n;
      if (dt) deathtouched.add(id);
    }
  };

  // Attackers deal.
  for (const att of combat.attackers) {
    const lookup = findPermanent(state, att.permanentId);
    if (!lookup || !dealsThisStep(lookup.permanent)) continue;
    const card = lookup.permanent.card;
    const power = Math.max(0, creaturePower(lookup.permanent, state));
    const deathtouch = hasKeyword(card, "Deathtouch");
    const trample = hasKeyword(card, "Trample");
    const lifelink = hasKeyword(card, "Lifelink");

    // "Was blocked" reads the DECLARED blockers; "live" reads the survivors.
    // A creature blocked by a now-dead blocker (e.g. a first-striker that
    // killed its blocker) stays blocked and deals no damage to the player —
    // it must NOT fall through to the unblocked path. (CR 509.1h / 510.1c.)
    const declaredBlockers = blockersByAttacker[att.permanentId] || [];
    const wasBlocked = declaredBlockers.length > 0;
    const liveBlockers = declaredBlockers
      .map(b => findPermanent(state, b.blockerId))
      .filter(Boolean);

    const spillToDefender = (amount, trampleFlag) => {
      const defender = att.defender;
      if (defender && state.players[defender] && amount > 0) {
        lifeLoss[defender] = (lifeLoss[defender] || 0) + amount;
        playerEvents.push({ kind: "combat-damage-player", turn: state.turn, attackerId: att.permanentId, attackingPlayer: att.attackingPlayer, defender, amount, ...(trampleFlag ? { trample: true } : {}) });
        return amount;
      }
      return 0;
    };

    let dealt = 0;
    if (liveBlockers.length > 0) {
      let remaining = power;
      for (const blk of liveBlockers) {
        const already = blk.permanent.damageMarked || 0;
        // Deathtouch makes 1 damage lethal; otherwise lethal = remaining toughness.
        const lethalNeed = deathtouch ? 1 : Math.max(1, creatureToughness(blk.permanent, state) - already);
        const give = Math.min(remaining, lethalNeed);
        addDmg(blk.permanent.id, give, deathtouch);
        remaining -= give;
        dealt += give;
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
  }

  // Blockers deal back to the attacker they're blocking.
  for (const att of combat.attackers) {
    const attLookup = findPermanent(state, att.permanentId);
    if (!attLookup) continue;
    for (const b of (blockersByAttacker[att.permanentId] || [])) {
      const blk = findPermanent(state, b.blockerId);
      if (!blk || !dealsThisStep(blk.permanent)) continue;
      const bpow = Math.max(0, creaturePower(blk.permanent, state));
      const bdt = hasKeyword(blk.permanent.card, "Deathtouch");
      const blifelink = hasKeyword(blk.permanent.card, "Lifelink");
      addDmg(att.permanentId, bpow, bdt);
      if (blifelink && bpow > 0) lifeGain[blk.permanent.controller] = (lifeGain[blk.permanent.controller] || 0) + bpow;
    }
  }

  // ── Apply marks + life changes ──
  let next = state;
  for (const [id, amount] of Object.entries(dmgToPermanent)) {
    if (findPermanent(next, id)) next = markCombatDamage(next, { permanentId: id, amount });
  }
  for (const [pid, amount] of Object.entries(lifeLoss)) {
    if (amount > 0) next = loseLife(next, { playerId: pid, amount });
  }
  for (const [pid, amount] of Object.entries(lifeGain)) {
    if (amount > 0) next = gainLife(next, { playerId: pid, amount });
  }

  // ── SBA: lethal damage (or ANY deathtouch damage) destroys creatures ──
  const { state: afterDeaths, dead } = destroyLethalCreatures(next, deathtouched);
  next = afterDeaths;

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
  for (const d of dead) {
    next = logEvent(next, { kind: "creature-dies", turn: next.turn, cardName: d.name, controller: d.controller, cause: "combat" });
  }

  // Fire dies triggers (self + surviving watchers) off the look-back `dead`
  // snapshot. They land in pendingTriggers; flushTriggers puts them on the stack
  // at the next priority-grant checkpoint.
  next = checkDiesTriggers(next, dead);

  return next;
}
