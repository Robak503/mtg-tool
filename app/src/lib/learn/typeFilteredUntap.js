/**
 * typeFilteredUntap.js — the TYPE-filtered member of the "during each other player's untap step" family:
 *
 *   "Untap all artifacts you control during each other player's untap step."          Unwinding Clock #545
 *   "Untap all creatures you control during each other player's untap step."          Drumbellower #1940
 *   "Untap all creatures and lands you control during each other player's untap step." Prophet of Kruphix
 *
 * THE FAMILY ALREADY HAD TWO MEMBERS and both are single-card hooks: seedbornUntap.js ("all permanents")
 * and murkfiendUntap.js ("all green and/or blue creatures"). This is the third shape, and it is
 * deliberately PARAMETERIZED by its type list rather than being a third hard-coded twin — three
 * near-identical modules is how the untap-step semantics drift apart, and the stun / becomes-untapped /
 * summoning-sickness handling below is exactly the fiddly part that must not fork again.
 *
 * WHY A TARGETED HOOK AT ALL (the seedbornUntap.js precedent): detectTriggers has no "during each other
 * player's untap step" event and the effect vocabulary has no untap-others atom, so the clause parses LOW
 * and the card parks. The runtime fires a dedicated synchronous hook at the untap step instead
 * (gameEngine.runStepActions → case "untap", alongside its two siblings).
 *
 * CR 502.x: the untap step's turn-based action untaps the ACTIVE player's permanents; this static creates
 * an ADDITIONAL untap of ITS controller's matching permanents during every OTHER player's untap step. We
 * set `tapped:false` ONLY — summoning sickness and once-per-turn loyalty flags stay, because those are
 * tied to the permanent controller's OWN untap step (CR 302.6 / 606.3) and clearing them on an opponent's
 * untap would be a fabrication. That is the same call both siblings make, and the reason they are worth
 * reading together.
 *
 * TYPE READ IS LAYER-AWARE (permanentTypes, layer 4), like Murkfiend's: an animated Vehicle that is a
 * creature right now IS untapped by the creature form, and a creature that lost the type is not.
 *
 * SCOPE — the three printed type shapes above, anchored whole. A SUBTYPE filter (Ohabi Caleria's
 * "Archers") and a counter-gated form (Quest for Renewal's "as long as there are four or more quest
 * counters") stay unmatched → those cards park (safe FNs). Pure; a board with no watcher returns the
 * state unchanged.
 */
import { logEvent, untapOrConsumeStun } from "./gameState.js";
import { permanentTypes } from "./layers.js";

// Anchored whole. The three type words map to the layer-4 type tokens the runtime tests.
const TYPE_UNTAP_RE =
  /untap all (artifacts|creatures|creatures and lands) you control during each other player'?s untap step/i;

const TYPES_FOR = {
  artifacts: ["Artifact"],
  creatures: ["Creature"],
  "creatures and lands": ["Creature", "Land"],
};

/**
 * The type list this card's phase-static untaps, or null. Mechanism-keyed (not name-keyed), so a reprint
 * or a future card with identical templating flips automatically. ONE parser, shared by the coverage
 * classifier and the runtime hook, so the metric and the game can't disagree about which cards untap.
 */
export function parseTypeFilteredUntap(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "").replace(/\([^)]*\)/g, " ");
  const m = oracle.match(TYPE_UNTAP_RE);
  return m ? TYPES_FOR[m[1].toLowerCase()] : null;
}

/**
 * At the untap step of `activePlayer`, each type-filtered watcher controlled by a NON-active player makes
 * that player untap their matching permanents too. Sets `tapped:false` only (see the CR note above);
 * records real tapped→untapped transitions as becomes-untapped events (Mesmeric Orb), and a stunned
 * permanent consumes a stun counter instead of untapping (CR 122.1c). Pure.
 */
export function applyTypeFilteredUntap(state, activePlayer) {
  const players = state?.players;
  if (!players) return state;
  let next = state;
  for (const pid of Object.keys(players)) {
    if (pid === activePlayer) continue; // the active player already untapped via the normal turn-based untapAll
    const player = next.players[pid];
    if (!player?.battlefield?.length) continue;
    // A player controlling TWO different watchers (an Unwinding Clock and a Drumbellower) untaps the UNION
    // — each static applies independently, so collecting them is what the cards actually say.
    const wanted = new Set();
    for (const perm of player.battlefield) {
      for (const t of parseTypeFilteredUntap(perm.card) || []) wanted.add(t);
    }
    if (!wanted.size) continue;
    let changed = false;
    const becameUntapped = [];
    const untapped = player.battlefield.map((p) => {
      if (!p.tapped) return p;
      const types = permanentTypes(next, p.id)?.types || [];
      if (!types.some((t) => wanted.has(t))) return p;
      changed = true;
      if (!((p.counters?.stun || 0) > 0)) becameUntapped.push({ id: p.id, controller: pid });
      return untapOrConsumeStun(p);
    });
    if (!changed) continue;
    next = { ...next, players: { ...next.players, [pid]: { ...next.players[pid], battlefield: untapped } } };
    if (becameUntapped.length) next = { ...next, pendingUntapEvents: [...(next.pendingUntapEvents || []), ...becameUntapped] };
    next = logEvent(next, { kind: "type-filtered-untap", controller: pid, types: [...wanted], duringUntapOf: activePlayer });
  }
  return next;
}
