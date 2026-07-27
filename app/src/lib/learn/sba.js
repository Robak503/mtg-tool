/**
 * sba.js — the comprehensive state-based-action sweep (CR 704.3, CR-remediation B2).
 *
 * CR 704.3: "Whenever a player would get priority, the game checks ... for any of the listed
 * conditions ... All applicable state-based actions are performed simultaneously as a single event,
 * [then] the check is repeated" — a FIXPOINT, re-run until a full pass changes nothing. Before this
 * module, the engine ran the permanent-level SBAs as scattered eager calls at individual mutation
 * sites (correct but incomplete — a chain reaction crossing two mechanisms, e.g. an anthem source
 * dying dropping another creature to 0 toughness, was only caught when some later mutation happened
 * to re-sweep) and never at the actual priority checkpoints.
 *
 * `checkAllStateBasedActions(state)` runs, in CR 704.5 order, each arm firing its owed triggers:
 *   - 704.5f/g — 0-toughness / lethal-damage creatures (destroyLethalCreatures + dies triggers)
 *   - 704.5i   — 0-loyalty planeswalkers (+ PW dies triggers)
 *   - 704.5j   — the LEGEND RULE (applyLegendRule — new in B2; + dies triggers for creatures)
 *   - 704.5m/n — attachment legality: an Equipment on a non-creature (or vanished host) becomes
 *                unattached; an Aura whose host is gone or no longer matches its enchant type goes
 *                to its owner's graveyard. Player-auras (enchantedPlayerId — the Curse class) and
 *                bestowed permanents are exempt (their legality is owned by the elimination sweep
 *                and the bestow exit transform respectively).
 *   - 704.5r   — +1/+1 and -1/-1 counter annihilation (previously unimplemented; invisible to
 *                layer-derived P/T but VISIBLE to counter-reading effects: undying's intervening-if,
 *                remove-a-counter costs, proliferate, requiresAnyCounter selectors).
 *
 * PLAYER-LOSS SBAs (704.5a-c life/poison/commander-damage) deliberately stay at the session layer
 * (learnSession.recordOutcomeIfChanged / isPlayerDead) — elimination is a session concern (CR 800.4
 * object cleanup lives there); this module owns the PERMANENT-level board sweep.
 *
 * Reference-stability contract: every arm returns the SAME state object when it has nothing to do
 * (the immutable-engine idiom), so the fixpoint loop terminates the moment a pass is a no-op. The
 * pass cap is a defensive backstop only; a real game never needs more than a few passes.
 */
import {
  destroyLethalCreatures,
  destroyZeroLoyaltyPlaneswalkers,
  applyLegendRule,
  moveCardToZone,
  findPermanent,
  logEvent,
  removeCounter,
  updatePermanentSafe,
} from "./gameState.js";
import { checkDiesTriggers, checkPlaneswalkerDiesTriggers, checkLeavesTriggers, checkStateTriggers } from "./triggers.js";
import { permanentIsCreature } from "./layers.js";

const MAX_PASSES = 10;

/** CR 704.5m/n — attachment legality. One pass; returns the same state when nothing is illegal. */
function sweepAttachmentLegality(state) {
  let next = state;
  for (const [pid, player] of Object.entries(state.players)) {
    for (const perm of player.battlefield) {
      if (!perm.attachedTo) continue;
      if (perm.bestowed) continue; // bestow's host-exit transform owns this case (CR 702.103e)
      if (perm.enchantedPlayerId) continue; // player-aura — legality is the enchanted player's existence
      const type = String(perm.card?.type || perm.card?.type_line || "");
      const isAura = /\bAura\b/.test(type);
      const isEquipment = /\bEquipment\b/.test(type);
      if (!isAura && !isEquipment) continue; // an attachment shape we don't model — leave it alone (CREED)
      const host = findPermanent(next, perm.attachedTo);
      if (isEquipment) {
        // CR 704.5m — attached to an illegal permanent (or nothing) → becomes unattached, stays on
        // the battlefield. Layer-aware creature-ness: an expired man-land animation is the live case.
        const hostIsLegal = host?.permanent && permanentIsCreature(next, host.permanent.id);
        if (!hostIsLegal) {
          const hostId = perm.attachedTo;
          next = updatePermanentSafe(next, perm.id, (p) => ({ ...p, attachedTo: null }));
          if (host?.permanent) {
            next = updatePermanentSafe(next, hostId, (h) => ({ ...h, attachments: (h.attachments || []).filter((id) => id !== perm.id) }));
          }
          next = logEvent(next, { kind: "equipment-unattached", turn: next.turn, cardName: perm.card?.name, controller: pid, cause: "sba" });
        }
        continue;
      }
      // Aura (CR 704.5n): legality follows the Aura's OWN printed "Enchant <X>" line — the honest
      // per-card source (the AURA_ETB creature/land dichotomy under-describes the granted-activated
      // lane: Squirrel Nest legally enchants a land). Only the three requirements the engine can
      // check faithfully are enforced: "Enchant creature" → layer-aware creature-ness (so an Aura on
      // an animated permanent stays legal while the animation lasts and falls off when it expires at
      // cleanup); "Enchant land" → the host's type line; "Enchant permanent" → any live host. Any
      // other/missing Enchant requirement (Enchant Forest, subtype/control riders) checks ONLY host
      // existence — a missed fall-off is the safe direction; a wrong kill is the forbidden one (CREED).
      let legal = false;
      if (host?.permanent) {
        const enchantM = String(perm.card?.oracle || perm.card?.oracle_text || "").match(/^Enchant (creature|land|permanent)\b/im);
        if (!enchantM) legal = true;
        else if (enchantM[1] === "creature") legal = permanentIsCreature(next, host.permanent.id);
        else if (enchantM[1] === "land") legal = /\bLand\b/.test(String(host.permanent.card?.type || host.permanent.card?.type_line || ""));
        else legal = true; // "Enchant permanent"
      }
      if (!legal) {
        const hostId = perm.attachedTo;
        if (host?.permanent) {
          next = updatePermanentSafe(next, hostId, (h) => ({ ...h, attachments: (h.attachments || []).filter((id) => id !== perm.id) }));
        }
        next = moveCardToZone(next, { playerId: pid, fromZone: "battlefield", toZone: "graveyard", cardId: perm.id });
        next = logEvent(next, { kind: "aura-falls-off", turn: next.turn, cardName: perm.card?.name, controller: pid, cause: "sba" });
      }
    }
  }
  return next;
}

/** CR 704.5r — annihilate min(+1/+1, -1/-1) counters pairwise. Same-state when no permanent has both. */
function sweepCounterAnnihilation(state) {
  let next = state;
  for (const player of Object.values(state.players)) {
    for (const perm of player.battlefield) {
      const plus = perm.counters?.["+1/+1"] || 0;
      const minus = perm.counters?.["-1/-1"] || 0;
      const k = Math.min(plus, minus);
      if (k <= 0) continue;
      next = removeCounter(next, { permanentId: perm.id, type: "+1/+1", amount: k });
      next = removeCounter(next, { permanentId: perm.id, type: "-1/-1", amount: k });
    }
  }
  return next;
}

/**
 * The CR 704.3 fixpoint. Pure; safe (and cheap) to call at every priority checkpoint — every arm
 * returns the identical state object when it has nothing to do, so the quiescent case is one scan.
 */
export function checkAllStateBasedActions(state) {
  let cur = state;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const before = cur;

    // 704.5f/g — lethal/0-toughness creatures.
    const lethal = destroyLethalCreatures(cur);
    cur = lethal.dead.length > 0 ? checkDiesTriggers(lethal.state, lethal.dead) : lethal.state;

    // 704.5i — 0-loyalty planeswalkers.
    const pw = destroyZeroLoyaltyPlaneswalkers(cur);
    cur = pw.dead.length > 0 ? checkPlaneswalkerDiesTriggers(pw.state, pw.dead) : pw.state;

    // 704.5j — the legend rule.
    const legend = applyLegendRule(cur);
    cur = legend.dead.length > 0 ? checkDiesTriggers(legend.state, legend.dead) : legend.state;

    // 704.5m/n — attachment legality.
    cur = sweepAttachmentLegality(cur);

    // 704.5r — counter annihilation.
    cur = sweepCounterAnnihilation(cur);

    if (cur === before) break; // fixpoint reached (CR 704.3 "repeated until no more are performed")
  }
  // Drain any leave events queued by non-death exits this sweep produced (aura falls-off / legend-rule
  // non-creature moves when no dies-pass ran to drain them). No-op on an empty queue.
  if ((cur.pendingLeaveEvents || []).length > 0) cur = checkLeavesTriggers(cur);
  // STATE TRIGGERS (CR 603.8) — checked at the same cadence as state-based actions, AFTER the fixpoint so
  // they see the settled board (a creature that just died can't also state-trigger). checkStateTriggers
  // carries its own arm/disarm latch, so calling this at every priority checkpoint enqueues a trigger only
  // on a real false->true transition, never once per pass.
  cur = checkStateTriggers(cur);
  return cur;
}
