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

import {
  findPermanent,
  loseLife,
  gainLife,
  logEvent,
  creaturePower,
  creatureToughness,
  markCombatDamage,
  destroyLethalCreatures,
  isPlaneswalker,
  adjustLoyalty,
  destroyZeroLoyaltyPlaneswalkers,
  addCommanderDamage,
  addCounter,
  addPoison,
} from "./gameState.js";
import { permanentHasKeyword, permanentColors } from "./layers.js";
import { parseProtectionColors, protectionApplies } from "./protection.js";
import { checkDiesTriggers, checkCombatDamageTriggers, checkBatchCombatDamageTriggers, checkLifegainTriggers } from "./triggers.js";

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
  if (state.preventCombatDamageTurn === state.turn) {
    return logEvent(state, { kind: "combat-damage-prevented", turn: state.turn, firstStrikeStep });
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

  // ===== EVADE (menace — CR 509.1c / 702.111b) ===== a menace attacker left with exactly ONE
  // blocker can't legally be blocked → it's unblocked (the lone would-be blocker isn't in combat,
  // so it deals/takes no combat damage). 2+ blockers resolve normally; non-menace is untouched.
  // legalChoices already avoids offering a hopeless lone block; this is the resolution guarantee.
  for (const att of combat.attackers) {
    const list = blockersByAttacker[att.permanentId];
    if (list && list.length === 1 && permanentHasKeyword(state, att.permanentId, "Menace")) {
      delete blockersByAttacker[att.permanentId];
    }
  }

  const dealsThisStep = (perm) => {
    const fs = permanentHasKeyword(state, perm.id, "First strike");
    const ds = permanentHasKeyword(state, perm.id, "Double strike");
    return firstStrikeStep ? (fs || ds) : (!fs || ds);
  };

  // REGEN (CR 701.15a): a creature regenerated in an EARLIER damage step of this combat is removed from combat
  // — it deals and takes no further combat damage. It's still on the battlefield (findPermanent finds it), so
  // the damage loops must skip it explicitly. `combatant` returns the live lookup ONLY while still in combat.
  const combatant = (id) => { const lk = findPermanent(state, id); return lk && !lk.permanent.removedFromCombat ? lk : null; };

  // ── Compute damage from the pre-step board (simultaneous within the step) ──
  const dmgToPermanent = {};   // permanentId -> amount
  const deathtouched = new Set();
  const lifeLoss = {};         // playerId -> amount
  const lifeGain = {};         // playerId -> amount (lifelink)
  const minusCounters = {};    // permanentId -> count (KW-POISON: infect/wither creature damage → -1/-1)
  const poisonGain = {};       // playerId -> count (KW-POISON: infect/toxic combat damage → poison)
  const loyaltyLoss = {};      // planeswalker permanentId -> loyalty removed by combat damage (PW-1)
  const playerEvents = [];
  // KW-POISON (CR 702.90b infect / 702.79b wither): when the SOURCE has infect or wither, combat
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
  // creature taking damage; `sourceColors` is the dealer's colors. Read from the pre-step board (printed
  // protection). A prevented blocker/attacker takes NO marked damage, NO -1/-1 counters, and grants NO
  // lifelink — the call sites skip dealing entirely (CR 702.16e + the trample assignment in 702.19e).
  const protectionPrevents = (targetId, sourceColors) => {
    const lk = findPermanent(state, targetId);
    return lk ? protectionApplies(parseProtectionColors(lk.permanent.card), sourceColors) : false;
  };

  // Attackers deal.
  for (const att of combat.attackers) {
    const lookup = combatant(att.permanentId);
    if (!lookup || !dealsThisStep(lookup.permanent)) continue;
    const attackerId = lookup.permanent.id;
    const power = Math.max(0, creaturePower(lookup.permanent, state));
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

    const spillToDefender = (amount, trampleFlag) => {
      if (amount <= 0) return 0;
      // PW-1: if this attacker is attacking a planeswalker, its damage to the "defender" is removed
      // as loyalty from that walker (CR 120.3c), NOT life from its controller. If the walker has
      // already left the battlefield, the attacker deals no combat damage — it does NOT redirect to
      // the player (CR 509.1h / 508.4 — its declared target is gone).
      if (att.defenderPlaneswalkerId) {
        const pw = findPermanent(state, att.defenderPlaneswalkerId);
        if (pw && isPlaneswalker(pw.permanent.card)) {
          loyaltyLoss[att.defenderPlaneswalkerId] = (loyaltyLoss[att.defenderPlaneswalkerId] || 0) + amount;
          playerEvents.push({ kind: "combat-damage-planeswalker", turn: state.turn, attackerId: att.permanentId, attackingPlayer: att.attackingPlayer, planeswalkerId: att.defenderPlaneswalkerId, amount, ...(trampleFlag ? { trample: true } : {}) });
          return amount;
        }
        return 0;
      }
      const defender = att.defender;
      if (defender && state.players[defender]) {
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
        // CMD-DAMAGE (CR 903.10a): if the attacker is a commander, tag the event with its card id so the
        // post-combat step accrues 21-rule commander damage to the defender (keyed per-commander).
        const attCard = lookup.permanent?.card;
        const commanderId = attCard?.isCommander ? attCard.id : null;
        playerEvents.push({ kind: "combat-damage-player", turn: state.turn, attackerId: att.permanentId, attackingPlayer: att.attackingPlayer, defender, amount, ...(commanderId ? { commanderId } : {}), ...(trampleFlag ? { trample: true } : {}) });
        return amount;
      }
      return 0;
    };

    let dealt = 0;
    if (liveBlockers.length > 0) {
      let remaining = power;
      for (const blk of liveBlockers) {
        // KW-PROTECTION (CR 702.16e + 702.19e): a blocker with protection from the attacker's color is
        // assigned NO damage — it takes 0, and (for trample) absorbs nothing, so the full power tramples.
        if (protectionPrevents(blk.permanent.id, attackerColors)) continue;
        const already = blk.permanent.damageMarked || 0;
        // Deathtouch makes 1 damage lethal; otherwise lethal = remaining toughness.
        const lethalNeed = deathtouch ? 1 : Math.max(1, creatureToughness(blk.permanent, state) - already);
        const give = Math.min(remaining, lethalNeed);
        addDmg(blk.permanent.id, give, deathtouch, attackerMinus);
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
    const attLookup = combatant(att.permanentId);
    if (!attLookup) continue;
    for (const b of (blockersByAttacker[att.permanentId] || [])) {
      const blk = combatant(b.blockerId);
      if (!blk || !dealsThisStep(blk.permanent)) continue;
      const bpow = Math.max(0, creaturePower(blk.permanent, state));
      const bdt = permanentHasKeyword(state, blk.permanent.id, "Deathtouch");
      const blifelink = permanentHasKeyword(state, blk.permanent.id, "Lifelink");
      // KW-PROTECTION (CR 702.16e): if the attacker has protection from the blocker's color, the blocker's
      // damage back to it is prevented — 0 dealt, and no lifelink for the blocker.
      if (protectionPrevents(att.permanentId, permanentColors(state, blk.permanent.id))) continue;
      // KW-POISON — the BLOCKER is the source here, so its OWN infect/wither reroutes the damage it
      // deals back to the attacker into -1/-1 counters (toxic is player-only, irrelevant blocking).
      const bminus = permanentHasKeyword(state, blk.permanent.id, "Infect") || permanentHasKeyword(state, blk.permanent.id, "Wither");
      addDmg(att.permanentId, bpow, bdt, bminus);
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
  // KW-POISON (CR 702.90b infect / 702.79b wither): infect/wither combat damage to a creature is dealt
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
  for (const ev of playerEvents) {
    if (ev.kind === "combat-damage-player" && ev.commanderId && ev.amount > 0) {
      next = addCommanderDamage(next, { commanderId: ev.commanderId, toPlayer: ev.defender, amount: ev.amount });
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

  // Combat-damage-to-a-player triggers (CR 510.2 — combat damage dealt) — fired off the per-attacker
  // player-damage events BEFORE the lethal SBA so a trading attacker is still present to bind to (it
  // triggered at the damage event; abilities that triggered on combat damage go on the stack after the
  // SBA, CR 510.3a). They land in pendingTriggers; flushTriggers stacks them at the next priority point.
  next = checkCombatDamageTriggers(next, playerEvents);
  // BATCH combat-damage (CR 510.4) — "one or more creatures you control deal combat damage to a player"
  // fires ONCE per controller who connected (not per attacker). Same playerEvents, fired alongside.
  next = checkBatchCombatDamageTriggers(next, playerEvents);

  // ── SBA: lethal damage (or ANY deathtouch damage) destroys creatures ──
  const { state: afterDeaths, dead } = destroyLethalCreatures(next, deathtouched);
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
  for (const d of dead) {
    next = logEvent(next, { kind: "creature-dies", turn: next.turn, cardName: d.name, controller: d.controller, cause: "combat" });
  }
  for (const d of deadPw) {
    next = logEvent(next, { kind: "planeswalker-dies", turn: next.turn, cardName: d.name, controller: d.controller, cause: "combat" });
  }

  // Fire dies triggers (self + surviving watchers) off the look-back `dead`
  // snapshot. They land in pendingTriggers; flushTriggers puts them on the stack
  // at the next priority-grant checkpoint.
  next = checkDiesTriggers(next, dead);

  return next;
}
