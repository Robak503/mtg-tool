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
 *                unattached; an Aura whose host is gone or no longer matches its enchant type, or
 *                that is attached to nothing at all, goes to its owner's graveyard. Player-auras
 *                (enchantedPlayerId — the Curse class) and bestowed permanents are exempt (their
 *                legality is owned by the elimination sweep and the bestow exit transform
 *                respectively).
 *   - 704.5r   — +1/+1 and -1/-1 counter annihilation (previously unimplemented; invisible to
 *                layer-derived P/T but VISIBLE to counter-reading effects: undying's intervening-if,
 *                remove-a-counter costs, proliferate, requiresAnyCounter selectors).
 *   - 704.5y   — Role uniqueness: of the Roles one player controls on one permanent, only the most
 *                recently attached stays; the rest go to their owners' graveyards (a token ceases to
 *                exist there, after its leaves triggers — the Wicked Role's drain fires).
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
import { permanentIsCreature, permanentHasCardType } from "./layers.js";
import { grantCitysBlessings } from "./ascend.js"; // shelf D5 — Ascend (CR 702.131b) at the same cadence
import { isRoleCard } from "./auraEntry.js"; // the one reading of "a Role" (CR 303.7) — the entry choice and the token copy share it

const MAX_PASSES = 10;

/**
 * CR 704.5m — "…or is not attached to an object or player, that Aura is put into its owner's graveyard." An Aura the engine
 * attaches to something other than a permanent is attached all the same: to a player (the Curse class — `enchantedPlayerId`),
 * or to a creature card in a graveyard (Animate Dead — `enchantedGraveyardCard`, until its enters trigger returns the card and
 * attaches to it). A bestowed permanent whose host left is an enchantment creature, no longer an Aura (CR 702.103e). A face-down
 * permanent never matches: it has no subtypes (CR 708.2), and its `card` is the face-down stand-in. Front face up (CR 712.8d).
 */
function attachedToNothing(perm) {
  if (perm.attachedTo || perm.enchantedPlayerId || perm.enchantedGraveyardCard || perm.bestowed) return false;
  return /\bAura\b/.test(String(perm.card?.type || perm.card?.type_line || "").split(" // ")[0]);
}

/** CR 704.5m/n — attachment legality. One pass; returns the same state when nothing is illegal. */
function sweepAttachmentLegality(state) {
  let next = state;
  for (const [pid, player] of Object.entries(state.players)) {
    for (const perm of player.battlefield) {
      if (attachedToNothing(perm) && findPermanent(next, perm.id)) {
        next = moveCardToZone(next, { playerId: pid, fromZone: "battlefield", toZone: "graveyard", cardId: perm.id });
        next = logEvent(next, { kind: "aura-falls-off", turn: next.turn, cardName: perm.card?.name, controller: pid, cause: "sba", reason: "attached to nothing" });
        continue;
      }
      if (!perm.attachedTo) continue;
      if (perm.bestowed) continue; // bestow's host-exit transform owns this case (CR 702.103e)
      if (perm.enchantedPlayerId) continue; // player-aura — legality is the enchanted player's existence
      const type = String(perm.card?.type || perm.card?.type_line || "");
      const isAura = /\bAura\b/.test(type);
      const isEquipment = /\bEquipment\b/.test(type);
      if (!isAura && !isEquipment) continue; // an attachment shape we don't model — leave it alone (CREED)
      const host = findPermanent(next, perm.attachedTo);
      if (isEquipment) {
        // CR 704.5n — attached to an illegal permanent (or nothing) → becomes unattached, stays on
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
      // Aura (CR 704.5m): legality follows the Aura's OWN printed "Enchant <X>" line — the honest
      // per-card source (the AURA_ETB creature/land dichotomy under-describes the granted-activated
      // lane: Squirrel Nest legally enchants a land). Only the three requirements the engine can
      // check faithfully are enforced: "Enchant creature" → layer-aware creature-ness (so an Aura on
      // an animated permanent stays legal while the animation lasts and falls off when it expires at
      // cleanup); "Enchant land" → the host's type line; "Enchant permanent" → any live host. Any
      // other/missing Enchant requirement (Enchant Forest, subtype/control riders) checks ONLY host
      // existence — a missed fall-off is the safe direction; a wrong kill is the forbidden one (CREED).
      let legal = false;
      if (host?.permanent) {
        // ⛔⛔ THE UNION EXCLUSION (ES-1, 2026-08-05) — `(?!\s+or\b)`. Without it "Enchant creature or
        // Vehicle" (Aether Meltdown, Mists of Littjara) matches the bare `creature` alternative, and this
        // sweep then kills the Aura the instant its host is an UNCREWED Vehicle — a legal host by the
        // printed line. The card would have been credited native, attached correctly, and then destroyed
        // itself on the next SBA pass: a wrong kill, the direction this module's own policy names as the
        // forbidden one. A union subject falls through to host-existence-only, the documented safe branch.
        const oracle = String(perm.card?.oracle || perm.card?.oracle_text || "");
        const enchantM = oracle.match(/^Enchant (creature|land|permanent)\b(?!\s+or\b)/im);
        // THE ARTIFACT SUBJECTS (play-weighted #511): "Enchant artifact" (Stasis Cocoon), "Enchant artifact or creature" (Ice Over,
        // Coma Veil), "Enchant artifact, creature, or planeswalker" (Planar Disruption) — the exact whole line, read layer-aware
        // like the creature arm. The cast offers a host that is an artifact only by a layer-4 effect (a creature Liquimetal Torque
        // made an artifact, a land Liquimetal Coating did), so when that effect ends at cleanup (CR 514.2) the host no longer
        // matches and the Aura goes (CR 704.5m) — before, the subject was never checked and the lock outlived the artifact.
        const artifactM = oracle.match(/^Enchant (artifact|artifact or creature|creature or artifact|artifact, creature, or planeswalker)$/im);
        if (artifactM) {
          const hid = host.permanent.id;
          const isArtifact = permanentHasCardType(next, hid, "Artifact");
          legal = artifactM[1] === "artifact" ? isArtifact
            : artifactM[1] === "artifact, creature, or planeswalker" ? (isArtifact || permanentIsCreature(next, hid) || permanentHasCardType(next, hid, "Planeswalker"))
            : (isArtifact || permanentIsCreature(next, hid));
        }
        else if (!enchantM) legal = true;
        else if (enchantM[1] === "creature") legal = permanentIsCreature(next, host.permanent.id);
        // A land NOW (layer-aware, the face that is up — CR 712.8d), like the creature and artifact arms: a Treasure Map is an
        // artifact whose combined line carries Treasure Cove's Land, and an Enchant-land Aura on it stayed (CR 704.5m).
        else if (enchantM[1] === "land") legal = permanentHasCardType(next, host.permanent.id, "Land");
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
 * CR 704.5y (CR 303.7a) — "If a permanent has more than one Role controlled by the same player attached to it, each of those
 * Roles except the one with the most recent timestamp is put into its owner's graveyard." Without it a token doubler (Doubling
 * Season) with one Role creation left two Roles on one creature, both granting their bonus, and a second Role from the same
 * player never replaced the first.
 *
 * THE TIMESTAMP. A Role is an Aura; it receives a new timestamp each time it becomes attached (CR 613.7e), and it enters attached,
 * so its most recent timestamp is the moment it was last attached. Role tokens carry no `timestamp` field (the token mints never
 * stamp one), but the engine records exactly that order: every attachment is formed by gameState.attachPermanent, which moves the
 * attached id to the END of the host's `attachments` — so the newest Role of a player is the last of them in that list. Roles
 * attached in one event (a doubled creation) come out in creation order; CR 613.7m lets their controller order them, and they
 * are copies of one Role, so which stays changes nothing.
 *
 * Grouped per (permanent, Role controller): Roles of different players on one permanent all stay. A Role counts only while both
 * links hold (its `attachedTo` names the host and the host lists it). The Role that goes leaves through moveCardToZone — owner
 * routing, the token vanish (CR 111.7), the host's link teardown and the leave event the end of the sweep drains (the Wicked
 * Role's "When this Aura is put into a graveyard from the battlefield" fires). Same-state when no permanent carries two Roles of
 * one player; the quiescent scan reads only attached permanents' type lines and looks nothing up.
 */
function sweepRoleUniqueness(state) {
  let groups = null; // `${hostId} ${controller}` -> { hostId, controller, roles: [permanent] }
  for (const [pid, player] of Object.entries(state.players)) {
    for (const perm of player.battlefield) {
      if (!perm.attachedTo || !isRoleCard(perm.card)) continue;
      const key = `${perm.attachedTo} ${pid}`;
      groups ??= new Map();
      if (!groups.has(key)) groups.set(key, { hostId: perm.attachedTo, controller: pid, roles: [] });
      groups.get(key).roles.push(perm);
    }
  }
  if (!groups) return state;
  let next = state;
  for (const { hostId, controller, roles } of groups.values()) {
    if (roles.length < 2) continue;
    const host = findPermanent(state, hostId)?.permanent;
    if (!host) continue;
    const order = host.attachments || [];
    // Newest first: the higher a Role's place in the host's attachments, the later it was attached (CR 613.7e).
    const ranked = roles.map((role) => ({ role, at: order.indexOf(role.id) })).filter((r) => r.at >= 0).sort((a, b) => b.at - a.at);
    if (ranked.length < 2) continue;
    const kept = ranked[0].role;
    for (const { role } of ranked.slice(1)) {
      if (!findPermanent(next, role.id)) continue;
      next = moveCardToZone(next, { playerId: controller, fromZone: "battlefield", toZone: "graveyard", cardId: role.id });
      next = logEvent(next, { kind: "role-replaced", turn: next.turn, cardName: role.card?.name, controller, hostName: host.card?.name, keptName: kept.card?.name, cause: "sba" });
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

    // 704.5j — the legend rule. A planeswalker it puts into the graveyard dies too (CR 700.4) — the planeswalker dies dispatch.
    const legend = applyLegendRule(cur);
    cur = legend.dead.length > 0 ? checkDiesTriggers(legend.state, legend.dead) : legend.state;
    if (legend.deadPw.length > 0) cur = checkPlaneswalkerDiesTriggers(cur, legend.deadPw);

    // 704.5m/n — attachment legality.
    cur = sweepAttachmentLegality(cur);

    // 704.5r — counter annihilation.
    cur = sweepCounterAnnihilation(cur);

    // 704.5y — one Role per player per permanent.
    cur = sweepRoleUniqueness(cur);

    if (cur === before) break; // fixpoint reached (CR 704.3 "repeated until no more are performed")
  }
  // Drain any leave events queued by non-death exits this sweep produced (aura falls-off / legend-rule
  // non-creature moves / a replaced Role, when no dies-pass ran to drain them). No-op on an empty queue.
  if ((cur.pendingLeaveEvents || []).length > 0) cur = checkLeavesTriggers(cur);
  // ASCEND (CR 702.131b, shelf D5) — "any time you control ten or more permanents": checked on the settled board, before
  // the state triggers below so a trigger conditioned on the city's blessing sees it the moment it is granted.
  cur = grantCitysBlessings(cur);
  // STATE TRIGGERS (CR 603.8) — checked at the same cadence as state-based actions, AFTER the fixpoint so
  // they see the settled board (a creature that just died can't also state-trigger). checkStateTriggers
  // carries its own arm/disarm latch, so calling this at every priority checkpoint enqueues a trigger only
  // on a real false->true transition, never once per pass.
  cur = checkStateTriggers(cur);
  return cur;
}
