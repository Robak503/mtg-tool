/**
 * combatResolution.js — apply combat damage at the combat-damage step.
 *
 * Before this, the combat-damage step was a no-op: creatures were declared as
 * attackers/blockers but nothing took damage, nothing died, and no player lost
 * life. This resolves the declared combat in `state.combat`:
 *
 *   - Blocked attacker: each blocker deals its power to the attacker; the
 *     attacker assigns lethal to its blockers in order (leftover is wasted —
 *     no trample modeled). A blocked attacker deals NO damage to a player.
 *   - Unblocked attacker: deals its power to the defending player (the
 *     `defender` seat picked at declare-attacker time).
 *   - Damage is computed from the PRE-damage board (simultaneous), then marked,
 *     then state-based actions destroy any creature with lethal damage marked.
 *
 * Mode-agnostic: it reads `state.combat` and the `defender` on each attacker,
 * so Standard (1v1) and Commander (4P) both resolve through the same path.
 *
 * Deliberately simplified (matches the learn engine's scope): no first strike,
 * trample, deathtouch, or combat tricks. First strike damage is left to the
 * combat-damage step too (the first-strike-damage step stays a no-op).
 */

import {
  findPermanent,
  loseLife,
  moveCardToZone,
  logEvent,
  creaturePower,
  creatureToughness,
  markCombatDamage,
} from "./gameState.js";

function isCreatureCard(card) {
  return String(card?.type_line || "").includes("Creature");
}

/**
 * Resolve all combat damage for the current `state.combat`. Pure function:
 * returns a new state with damage marked, life adjusted, lethal creatures moved
 * to graveyards, and combat events logged. No-op when nobody is attacking.
 */
export function resolveCombatDamage(state) {
  const combat = state.combat;
  if (!combat || !Array.isArray(combat.attackers) || combat.attackers.length === 0) {
    return state;
  }
  const blockers = Array.isArray(combat.blockers) ? combat.blockers : [];

  // attackerId -> [blocker entries]
  const blockersByAttacker = {};
  for (const b of blockers) {
    (blockersByAttacker[b.attackerId] ||= []).push(b);
  }

  // ── Pass 1: compute damage from the pre-damage board (simultaneous) ──
  const dmgToPermanent = {}; // permanentId -> amount
  const lifeLoss = {};       // playerId -> amount
  const playerEvents = [];
  const addDmg = (id, n) => { if (n > 0) dmgToPermanent[id] = (dmgToPermanent[id] || 0) + n; };

  for (const att of combat.attackers) {
    const lookup = findPermanent(state, att.permanentId);
    if (!lookup) continue; // attacker left the battlefield before damage
    const power = Math.max(0, creaturePower(lookup.permanent));
    const assigned = blockersByAttacker[att.permanentId] || [];

    if (assigned.length > 0) {
      // Blocked: blockers hit the attacker; attacker assigns lethal in order.
      let remaining = power;
      for (const b of assigned) {
        const blk = findPermanent(state, b.blockerId);
        if (!blk) continue;
        addDmg(att.permanentId, Math.max(0, creaturePower(blk.permanent)));
        const need = Math.max(0, creatureToughness(blk.permanent));
        const give = Math.min(remaining, need);
        addDmg(b.blockerId, give);
        remaining -= give;
      }
    } else {
      // Unblocked: damage to the defending player.
      const defender = att.defender;
      if (defender && state.players[defender] && power > 0) {
        lifeLoss[defender] = (lifeLoss[defender] || 0) + power;
        playerEvents.push({
          kind: "combat-damage-player",
          turn: state.turn,
          attackerId: att.permanentId,
          attackingPlayer: att.attackingPlayer,
          defender,
          amount: power,
        });
      }
    }
  }

  // ── Pass 2: apply marks + life loss ──
  let next = state;
  for (const [id, amount] of Object.entries(dmgToPermanent)) {
    if (findPermanent(next, id)) next = markCombatDamage(next, { permanentId: id, amount });
  }
  for (const [pid, amount] of Object.entries(lifeLoss)) {
    if (amount > 0) next = loseLife(next, { playerId: pid, amount });
  }

  // ── Pass 3: state-based actions — lethal damage destroys creatures ──
  const dead = [];
  for (const [pid, player] of Object.entries(next.players)) {
    for (const perm of player.battlefield) {
      if (!isCreatureCard(perm.card)) continue;
      // Only judge creatures with a real numeric toughness (skip "*"/unknown).
      const printed = Number(perm.card?.toughness);
      if (!Number.isFinite(printed)) continue;
      const tough = creatureToughness(perm);
      const dmg = perm.damageMarked || 0;
      if (tough <= 0 || (dmg > 0 && dmg >= tough)) {
        dead.push({ controller: pid, id: perm.id, name: perm.card?.name || "creature" });
      }
    }
  }
  for (const d of dead) {
    next = moveCardToZone(next, { playerId: d.controller, fromZone: "battlefield", toZone: "graveyard", cardId: d.id });
  }

  // ── Log ──
  next = logEvent(next, {
    kind: "combat-damage",
    turn: next.turn,
    deaths: dead.map(d => d.name),
    playerDamage: lifeLoss,
  });
  for (const ev of playerEvents) next = logEvent(next, ev);
  for (const d of dead) {
    next = logEvent(next, { kind: "creature-dies", turn: next.turn, cardName: d.name, controller: d.controller, cause: "combat" });
  }

  return next;
}
