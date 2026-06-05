/**
 * Phase 6 — Learn-to-Play: opponentAI.js
 *
 * Picks an action for the AI side. NOT trying to be a strong opponent
 * in v1 — just coherent and consistent enough that learning sessions
 * feel like a real game.
 *
 * Strategy: archetype-aware policy reusing goldfish v2's classifier.
 * Per archetype, we have a priority ordering for cast-spell candidates
 * (matching what runGoldfish v2 does internally). For everything else
 * (play-land, declare-attacker, declare-blocker), we use rule-based
 * heuristics tuned for "obvious correct play" — the AI isn't trying
 * to beat the user, just to play coherently.
 *
 * The action picker is deterministic given the same state + same
 * declaredArchetype. Tests pass a fake state and assert specific picks.
 *
 * Deferred:
 *   - Combat math (block-to-trade vs block-to-survive)
 *   - Bluffing / mana-held-up cues
 *   - Target selection on spells (the engine will surface a "pick
 *     target" decision after PR3.5 lands; for now, the AI passes
 *     when it would need to choose)
 *   - Card-specific synergies (Atraxa stacking proliferate triggers,
 *     etc.) — that's Arbiter or PR8+ territory
 */

import { detectArchetype } from "../goldfish.js";
import { filterActions } from "./legalChoices.js";
import { opponentsOf } from "./gameState.js";

// ─── Cast priority by archetype ──────────────────────────────────────────────

/**
 * Score a cast-spell action for the given archetype. Lower score =
 * cast sooner. Mirrors `buildCastScorer` from lib/goldfish.js (which
 * runGoldfish uses internally), but operating on a cast-spell
 * legal-action object rather than a fully-classified card.
 */
function scoreCastAction(action, card, archetype) {
  const type = String(card?.type || card?.type_line || "");
  const oracle = String(card?.oracle || card?.oracle_text || "");
  const isCreature = /Creature/.test(type);
  const cmc = action.cmc || 0;

  // Heuristic flags — very rough versions of what goldfish.js does in
  // depth. Good enough for "play coherently."
  const isRamp = /add \{[WUBRGC]+/i.test(oracle) || /\bcreate.{0,30}treasure\b/i.test(oracle);
  const isDraw = /\bdraw\b/i.test(oracle);
  const isInteraction = /(counter target|destroy target|exile target|deals? \d+ damage)/i.test(oracle);
  const isTokenMaker = /create.+token/i.test(oracle);
  const isEquipment = /Equipment/.test(type);

  switch (archetype) {
    case "aggro":
      if (isCreature && cmc <= 2) return 0;
      if (isCreature && cmc <= 3) return 1;
      if (isInteraction) return 2;
      if (isRamp) return 3;
      return 5;
    case "control":
      if (isInteraction) return 0;
      if (isDraw) return 1;
      if (isRamp) return 2;
      return 4;
    case "combo":
      if (isRamp) return 0;
      if (isDraw) return 1;
      return 3;
    case "voltron":
      if (isRamp) return 0;
      if (isEquipment) return 1;
      return 2;
    case "tokens":
      if (isRamp) return 0;
      if (isTokenMaker) return 1;
      return 2;
    case "aristocrats":
      if (isRamp) return 0;
      if (isTokenMaker) return 1;
      return 2;
    case "ramp":
      if (isRamp) return 0;
      if (isDraw) return 1;
      if (cmc >= 7) return 2;
      return 3;
    case "midrange":
    default:
      if (isRamp) return 0;
      if (isDraw) return 1;
      if (isInteraction) return 2;
      return 3;
  }
}

// ─── Card lookup ─────────────────────────────────────────────────────────────

/**
 * Resolve a card by ID from the AI player's hand. Used to look up
 * full card data (oracle, type, mana) from the action's cardId.
 */
function cardFromHand(state, playerId, cardId) {
  const player = state.players[playerId];
  return player?.hand.find(c => c.id === cardId) || null;
}

function permanentFromBattlefield(state, playerId, permanentId) {
  const player = state.players[playerId];
  return player?.battlefield.find(p => p.id === permanentId) || null;
}

// ─── Sub-pickers ──────────────────────────────────────────────────────────────

/**
 * Pick the best play-land action. Preference order:
 *   1. Lands that produce colors the AI needs (vs already has 2+ of)
 *   2. Otherwise: first land in hand alphabetically (stable)
 *
 * v1 doesn't do anything smart about basics-vs-duals or sequencing
 * tap-lands. That's PR8+ territory.
 */
function pickLandAction(state, aiPlayerId, landActions) {
  if (landActions.length === 0) return null;
  // For now, deterministic alphabetical pick. Mana-color-gap logic
  // would need to read the AI's commanders / hand colors which we
  // can revisit when archetype detection sees the full deck context.
  const sorted = [...landActions].sort((a, b) => a.name.localeCompare(b.name));
  return sorted[0];
}

/**
 * Pick the best cast-spell action via archetype-aware scoring.
 * Returns null if no spell is affordable.
 */
function pickCastAction(state, aiPlayerId, castActions, archetype) {
  if (castActions.length === 0) return null;

  // Score each affordable cast.
  const scored = castActions.map(action => {
    const card = cardFromHand(state, aiPlayerId, action.cardId);
    if (!card) return { action, score: Infinity };  // skip if card vanished
    return { action, score: scoreCastAction(action, card, archetype) };
  });

  scored.sort((a, b) => a.score - b.score || (a.action.cmc - b.action.cmc));
  return scored[0]?.action || null;
}

/**
 * Pick which creatures to attack with. Default policy: attack with
 * every legal attacker. Defers the "trap detection" enhancement
 * (Intermediate mode flagging "they have untapped mana for a counter")
 * to PR7.
 */
function pickAllAttackers(attackerActions) {
  return attackerActions;
}

/**
 * Pick blocking assignments. v1 policy: block only when the AI has
 * a higher-toughness creature than the attacker's power (no trades,
 * just chumps when forced). For PR4 we keep this minimal — pick one
 * blocker per attacker, preferring the smallest legal blocker.
 * Returns an array of declare-blocker actions.
 */
function pickBlockers(blockerActions, state, aiPlayerId) {
  if (blockerActions.length === 0) return [];

  // Group by attackerId so each gets at most one blocker.
  const assigned = new Map();
  const sorted = [...blockerActions].sort((a, b) => {
    // Prefer smaller creatures (cheaper-to-lose chump blockers).
    const aCard = permanentFromBattlefield(state, aiPlayerId, a.permanentId)?.card;
    const bCard = permanentFromBattlefield(state, aiPlayerId, b.permanentId)?.card;
    const aPow = Number(aCard?.power) || 0;
    const bPow = Number(bCard?.power) || 0;
    return aPow - bPow;
  });

  for (const action of sorted) {
    if (!assigned.has(action.attackerId)) {
      assigned.set(action.attackerId, action);
    }
  }
  return [...assigned.values()];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Pick a single action from the legal actions list. Returns the chosen
 * action (one of the items in `actions`), or null if no action makes
 * sense (caller should pass priority).
 *
 * Priority order:
 *   1. play-land if available (always — never skip a land drop)
 *   2. cast-spell via archetype scoring
 *   3. declare-attacker — only the first one; engine batches
 *      attackers per step, but the picker is called for the FIRST
 *      decision; downstream the engine reads pickAttackPlan instead.
 *   4. pass-priority (the fallback)
 *
 * For attacks and blocks (which are batch decisions), use the
 * specialized pickers below.
 */
export function pickAction(state, aiPlayerId, actions, { archetype = null } = {}) {
  if (!Array.isArray(actions) || actions.length === 0) return null;

  // Combat is a batch decision, but the driver applies one action per tick.
  // We compute the plan and return its first still-legal choice; declared
  // attackers/blockers are excluded from the legal set next tick (attackers
  // tap on declare; blockers are tracked), so each tick drains one and the
  // step empties, after which we fall through to pass.
  if (state.step === "declare-attackers") {
    const attackerActions = filterActions(actions, "declare-attacker");
    if (attackerActions.length > 0) {
      const plan = pickAttackPlan(state, aiPlayerId, attackerActions);
      if (plan.length > 0) return plan[0];
    }
  }
  if (state.step === "declare-blockers") {
    // Only consider attackers we haven't blocked yet (v1: one blocker each),
    // so the AI doesn't pile redundant blockers on the same attacker.
    const blocked = new Set((state.combat?.blockers || []).map(b => b.attackerId));
    const blockerActions = filterActions(actions, "declare-blocker").filter(a => !blocked.has(a.attackerId));
    if (blockerActions.length > 0) {
      const plan = pickBlockPlan(state, aiPlayerId, blockerActions);
      if (plan.length > 0) return plan[0];
    }
  }

  const lands = filterActions(actions, "play-land");
  if (lands.length > 0) {
    const land = pickLandAction(state, aiPlayerId, lands);
    if (land) return land;
  }

  const casts = filterActions(actions, "cast-spell");
  if (casts.length > 0) {
    // Resolve archetype lazily if not supplied. Caller usually passes
    // it for performance — recomputing detectArchetype per priority
    // window is wasteful.
    const aiDeck = { cards: deriveDeckRepresentation(state, aiPlayerId) };
    const detected = archetype || detectArchetype(aiDeck, {}).archetype;
    const cast = pickCastAction(state, aiPlayerId, casts, detected);
    if (cast) return cast;
  }

  // No active-window action — pass priority. (The engine's combat
  // step pickers below handle declare-attackers/blockers as batch
  // decisions, not via pickAction.)
  return actions.find(a => a.kind === "pass-priority") || null;
}

/** Count an opponent's untapped creatures (rough "how hard to push through"). */
function untappedBlockerCount(state, playerId) {
  const bf = state.players?.[playerId]?.battlefield || [];
  return bf.filter(p => String(p.card?.type_line || "").includes("Creature") && !p.tapped).length;
}

/**
 * Which opponent should the AI swing at? Heuristic (design §11.5): the
 * lowest-life living opponent; ties broken by who has the fewest untapped
 * blockers (easiest to push damage through). Returns null when there's no
 * living opponent. In Standard this is just the lone opponent.
 */
function chooseDefender(state, aiPlayerId) {
  const living = opponentsOf(state, aiPlayerId).filter(id => (state.players?.[id]?.life ?? 0) > 0);
  if (living.length === 0) return null;
  return living.slice().sort((a, b) => {
    const lifeDiff = state.players[a].life - state.players[b].life;
    if (lifeDiff !== 0) return lifeDiff;
    return untappedBlockerCount(state, a) - untappedBlockerCount(state, b);
  })[0];
}

/**
 * Batch-decision picker for declare-attackers: returns the array of
 * attacker actions the AI commits to. Engine passes the result to
 * its combat-state tracker.
 *
 * Commander: the legal-action set contains one entry per (creature, defender);
 * the AI focuses all its attackers on the single best target (chooseDefender)
 * and emits exactly one action per creature. Standard: the actions carry no
 * defenderId (the dispatcher fills the lone opponent), so this returns the full
 * attacker set unchanged.
 */
export function pickAttackPlan(state, aiPlayerId, attackerActions) {
  if (!Array.isArray(attackerActions) || attackerActions.length === 0) return [];
  const hasDefenderChoice = attackerActions.some(a => a.defenderId);
  if (!hasDefenderChoice) return pickAllAttackers(attackerActions);

  const target = chooseDefender(state, aiPlayerId);
  const byPermanent = new Map();
  for (const a of attackerActions) {
    if (!byPermanent.has(a.permanentId)) byPermanent.set(a.permanentId, []);
    byPermanent.get(a.permanentId).push(a);
  }
  const plan = [];
  for (const opts of byPermanent.values()) {
    plan.push((target && opts.find(o => o.defenderId === target)) || opts[0]);
  }
  return plan;
}

/**
 * Batch-decision picker for declare-blockers.
 */
export function pickBlockPlan(state, aiPlayerId, blockerActions) {
  return pickBlockers(blockerActions, state, aiPlayerId);
}

// ─── Deck-context helper ──────────────────────────────────────────────────────

/**
 * Construct a card list shape compatible with detectArchetype() from
 * the AI player's CURRENT zones (library + hand + battlefield + graveyard
 * + command). Used to bias play decisions to the deck's actual shape.
 * Cards in exile/sideboard aren't included — they don't reflect the
 * deck's identity for the rest of the game.
 *
 * Public for tests; consumers should use pickAction.
 */
export function deriveDeckRepresentation(state, playerId) {
  const player = state.players[playerId];
  if (!player) return [];
  const zones = [
    player.library, player.hand, player.battlefield, player.graveyard, player.command,
  ];
  const cards = [];
  for (const zone of zones) {
    for (const item of zone) {
      // Battlefield entries are permanents; unwrap to .card. Other
      // zones contain raw card objects.
      const card = item?.card || item;
      if (card?.name) {
        cards.push({ name: card.name, qty: 1, section: "Mainboard" });
      }
    }
  }
  return cards;
}
