/**
 * boardSnapshot.js — the FULL per-player board view model for the Academy board UI.
 *
 * `tableSnapshot` gives the client only counts (life, hand size). The clickable
 * board needs the real cards: your hand, every player's permanents (with derived
 * P/T, tapped/sick/counters/keywords), the public zones (graveyard/exile/command),
 * the stack, and whose priority it is. The server holds the full GameState; this
 * serializes the part the UI is allowed to see.
 *
 * VISIBILITY (mirrors real MTG public/hidden information):
 *   - YOUR hand        → revealed (cards). Opponents' hands → COUNT only.
 *   - Battlefield       → revealed for everyone (permanents are public).
 *   - Graveyard / Exile → revealed for everyone (public).
 *   - Command zone      → revealed (commanders are public).
 *   - Library           → COUNT only (nobody sees library contents/order).
 *   - Mana pool         → yours only (floating mana; opponents' is ~always empty).
 *
 * Pure: reads state, returns plain JSON. Derived P/T comes from the CR-613 layer
 * engine via `creaturePower/creatureToughness(perm, state)`, so anthems/lords/pump
 * show the true on-board value, not printed.
 */

import { creaturePower, creatureToughness } from "./gameState.js";
import { permanentHasKeyword, permanentIsCreature } from "./layers.js";

// Combat-relevant keywords surfaced as badges on creature tiles.
const BADGE_KEYWORDS = [
  "Flying", "Reach", "Deathtouch", "Trample", "Vigilance", "Lifelink",
  "First Strike", "Double Strike", "Menace", "Haste", "Hexproof", "Indestructible",
];

function typeOf(card) {
  return String(card?.type || card?.type_line || "");
}
function oracleOf(card) {
  return String(card?.oracle || card?.oracle_text || "");
}
function manaOf(card) {
  return String(card?.mana || card?.mana_cost || "");
}

/** A card in a hidden-order zone (hand/graveyard/exile/command) — no board state. */
function cardView(card) {
  if (!card) return null;
  return {
    id: card.id || null,
    name: card.name || "",
    type: typeOf(card),
    mana: manaOf(card),
    oracle: oracleOf(card),
  };
}

/** A permanent on the battlefield — with derived characteristics + board state. */
function permanentView(state, perm) {
  const t = typeOf(perm.card);
  // Layer-aware (WALT-ANIMATE): an animated land / man-land IS the creature it has become, so the
  // board shows it as a creature with its set P/T + granted keywords — not the printed land. `isLand`
  // stays printed-based (animate is additive: it's still a land, shown in the lands row). Behavior-
  // neutral for every other permanent (permanentIsCreature ⊇ the printed-type check).
  const isCreature = permanentIsCreature(state, perm.id);
  const view = {
    id: perm.id,
    cardId: perm.card?.id || null,
    name: perm.card?.name || "",
    type: t,
    oracle: oracleOf(perm.card),
    mana: manaOf(perm.card),
    tapped: !!perm.tapped,
    summoningSick: !!perm.summoningSick,
    counters: { ...(perm.counters || {}) },
    isLand: /Land/.test(t),
    isCreature,
  };
  if (isCreature) {
    view.power = creaturePower(perm, state);
    view.toughness = creatureToughness(perm, state);
    view.keywords = BADGE_KEYWORDS.filter(kw => {
      try { return permanentHasKeyword(state, perm.id, kw); } catch { return false; }
    });
  }
  return view;
}

function playerView(state, id) {
  const p = state.players[id];
  const isUser = id === "user";
  const battlefield = (p.battlefield || []).map(perm => permanentView(state, perm));
  return {
    id,
    isUser,
    isActive: id === state.activePlayer,
    hasPriority: id === state.priorityHolder,
    life: p.life,
    commanderDamageFrom: { ...(p.commanderDamageFrom || {}) },
    manaPool: isUser ? { ...(p.manaPool || {}) } : null,
    handCount: (p.hand || []).length,
    hand: isUser ? (p.hand || []).map(cardView) : null, // your hand only
    libraryCount: (p.library || []).length,
    // Split for the UI's two rows (creatures/permanents over lands).
    lands: battlefield.filter(c => c.isLand),
    permanents: battlefield.filter(c => !c.isLand),
    graveyard: (p.graveyard || []).map(cardView),
    exile: (p.exile || []).map(cardView),
    command: (p.command || []).map(cardView),
  };
}

/** A stack object (spell/ability resolving) for the stack strip. */
function stackView(obj) {
  return {
    id: obj.id,
    kind: obj.kind || "spell",
    name: obj.source?.name || obj.payload?.params?.card?.name || obj.payload?.params?.cardName || "Spell",
    controller: obj.controller,
    targets: Array.isArray(obj.targets) ? obj.targets.map(t => ({ type: t.type, id: t.id })) : [],
  };
}

/**
 * Full board snapshot for the Academy board UI. Players are listed in turn order,
 * living seats only (eliminated players are already gone from turnOrder/players).
 */
export function boardSnapshot(state) {
  if (!state || !state.players) return null;
  const order = Array.isArray(state.turnOrder) && state.turnOrder.length
    ? state.turnOrder
    : Object.keys(state.players);
  return {
    turn: state.turn,
    step: state.step,
    mode: state.mode,
    activePlayer: state.activePlayer,
    priorityHolder: state.priorityHolder,
    stack: (state.stack || []).map(stackView),
    players: order.filter(id => state.players[id]).map(id => playerView(state, id)),
  };
}
