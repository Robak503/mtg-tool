/**
 * Phase 6 PR6.1 — actionDispatcher.js
 *
 * Given a GameState and a legal action (from legalChoices.js),
 * produce the new GameState after applying that action. The
 * decisionGate + opponentAI together pick WHICH action to take;
 * this module applies the chosen action's effects.
 *
 * Pure: no fetches, no React, no engine-internal mutation. Every
 * function returns a new state.
 *
 * Scope (PR6.1):
 *   - pass-priority   → passPriority
 *   - play-land       → moveCardToZone + landsPlayedThisTurn + priority reset
 *   - cast-spell      → spend mana + move card to stack + priority reset
 *   - declare-attacker / declare-blocker → tracked combat state (engine
 *                       reads back via state.combat.* until combat ends)
 *
 * Deferred:
 *   - Ability activation (no ability schema yet)
 *   - Target selection (engine surfaces it post-action; PR7+)
 *   - Sacrifice / discard / other non-mana costs (Arbiter case)
 *
 * Errors are thrown as `DispatcherError` with a `code` field so
 * callers (API route, UI) can render them precisely.
 */

import {
  createStackObject,
  emptyManaPoolForPlayer,
  moveCardToZone,
  logEvent,
  opponentOf,
} from "./gameState.js";
import { passPriority } from "./gameEngine.js";
import { canPayManaCost } from "./legalChoices.js";

export class DispatcherError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "DispatcherError";
    this.code = code;
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function findCardInHand(state, playerId, cardId) {
  const player = state.players[playerId];
  return player?.hand.find(c => c.id === cardId) || null;
}

function findCreatureOnBattlefield(state, playerId, permanentId) {
  const player = state.players[playerId];
  return player?.battlefield.find(p => p.id === permanentId) || null;
}

/**
 * Subtract the parsed cost from the player's mana pool. Mirrors the
 * affordability check in legalChoices.canPayManaCost: colored pips
 * first, then hybrid (prefer cheapest payable side), then generic
 * from whatever's left. Throws if the cost can't be paid — callers
 * must have already validated via canPayManaCost.
 */
function deductManaCost(manaPool, cost) {
  let pool = { ...manaPool };

  for (const color of ["W", "U", "B", "R", "G", "C"]) {
    const need = cost[color] || 0;
    if (need > 0) {
      if (pool[color] < need) {
        throw new DispatcherError(`Cannot deduct ${need} ${color} (pool has ${pool[color]})`, "MANA_SHORT");
      }
      pool = { ...pool, [color]: pool[color] - need };
    }
  }

  // Hybrid pips: pay from whichever side is available, preferring the
  // smaller pool (so we don't drain a color we might need later).
  for (const options of cost.hybrid || []) {
    const colored = options.filter(o => !/^\d+$/.test(o));
    let paid = false;
    // Prefer the option where the pool has the LEAST mana (preserves
    // flexibility for future casts).
    colored.sort((a, b) => (pool[a] || 0) - (pool[b] || 0));
    for (const opt of colored) {
      if ((pool[opt] || 0) > 0) {
        pool = { ...pool, [opt]: pool[opt] - 1 };
        paid = true;
        break;
      }
    }
    if (!paid) throw new DispatcherError("Cannot pay hybrid pip", "MANA_SHORT");
  }

  // Generic: drain remaining pool. Spend C first (it can only pay
  // generic), then the colors with the most available so we don't
  // strand a color we needed elsewhere.
  if ((cost.generic || 0) > 0) {
    let need = cost.generic;
    const order = ["C", "W", "U", "B", "R", "G"];
    order.sort((a, b) => (pool[b] || 0) - (pool[a] || 0));  // most-available first for the colored fallback
    // But always spend C before colored.
    if (pool.C > 0) {
      const take = Math.min(pool.C, need);
      pool = { ...pool, C: pool.C - take };
      need -= take;
    }
    for (const color of order) {
      if (color === "C") continue;
      if (need <= 0) break;
      const take = Math.min(pool[color], need);
      pool = { ...pool, [color]: pool[color] - take };
      need -= take;
    }
    if (need > 0) {
      throw new DispatcherError(`Not enough mana for ${cost.generic} generic`, "MANA_SHORT");
    }
  }

  return pool;
}

// ─── Combat-state helper ──────────────────────────────────────────────────────

/**
 * Ensure state.combat exists and reset it if we just entered a new
 * combat phase. The structure:
 *   state.combat = {
 *     attackers: [{ permanentId, attackingPlayer, defender }],
 *     blockers:  [{ blockerId, attackerId }],
 *   }
 */
function ensureCombat(state) {
  if (state.combat) return state;
  return { ...state, combat: { attackers: [], blockers: [] } };
}

// ─── Individual action handlers ──────────────────────────────────────────────

function applyPassPriority(state) {
  return passPriority(state);
}

function applyPlayLand(state, action) {
  const player = state.players[action.playerId];
  if (!player) throw new DispatcherError(`Unknown player ${action.playerId}`, "BAD_PLAYER");
  if (player.landsPlayedThisTurn >= 1) {
    throw new DispatcherError("Already played a land this turn", "LAND_PER_TURN");
  }
  const card = findCardInHand(state, action.playerId, action.cardId);
  if (!card) throw new DispatcherError(`Card ${action.cardId} not in hand`, "CARD_NOT_IN_HAND");

  let next = moveCardToZone(state, {
    playerId: action.playerId,
    fromZone: "hand",
    toZone: "battlefield",
    cardId: action.cardId,
    becomePermanent: true,
  });
  next = {
    ...next,
    players: {
      ...next.players,
      [action.playerId]: {
        ...next.players[action.playerId],
        landsPlayedThisTurn: next.players[action.playerId].landsPlayedThisTurn + 1,
      },
    },
  };
  next = logEvent(next, {
    kind: "play-land",
    playerId: action.playerId,
    cardName: card.name,
  });
  // Sorcery-speed action restarts the priority loop at the active player.
  return {
    ...next,
    priorityHolder: state.activePlayer,
    consecutivePasses: 0,
  };
}

function applyCastSpell(state, action) {
  const card = findCardInHand(state, action.playerId, action.cardId);
  if (!card) throw new DispatcherError(`Card ${action.cardId} not in hand`, "CARD_NOT_IN_HAND");

  const pool = state.players[action.playerId].manaPool;
  if (!canPayManaCost(pool, action.cost)) {
    throw new DispatcherError("Cannot pay the spell's mana cost", "MANA_SHORT");
  }

  // 1. Move the card out of hand. We don't push it through
  // moveCardToZone because the stack is shared (not per-player); it
  // lives at the top level of state. So we splice manually.
  const player = state.players[action.playerId];
  const handIndex = player.hand.findIndex(c => c.id === action.cardId);
  const nextHand = [...player.hand.slice(0, handIndex), ...player.hand.slice(handIndex + 1)];

  // 2. Deduct mana cost.
  const nextPool = deductManaCost(pool, action.cost);

  // 3. Build the stack object. payload.onResolve isn't supplied here —
  // it's the engine's job (PR4-PR8) to wire up per-card resolvers.
  // For now, the spell resolves as a no-op + log entry, matching the
  // engine's default resolveTopOfStack behavior. PR7+ can hook in
  // creature-enters-battlefield, instant-speed-effect, etc.
  const stackObject = createStackObject({
    kind: "spell",
    source: card,
    controller: action.playerId,
    targets: action.targets || [],
    cost: action.cost,
    payload: {
      cardId: card.id,
      // Default resolver: creature spells enter the battlefield;
      // everything else just logs and pops. PR7 will replace this
      // with type-aware resolution for instants/sorceries.
      onResolve: defaultSpellResolver(card, action.playerId),
    },
  });

  let next = {
    ...state,
    players: {
      ...state.players,
      [action.playerId]: {
        ...player,
        hand: nextHand,
        manaPool: nextPool,
      },
    },
    stack: [...state.stack, stackObject],
  };
  next = logEvent(next, {
    kind: "cast-spell",
    playerId: action.playerId,
    cardName: card.name,
    cost: action.cost,
  });
  // Restart priority loop at active player after the spell goes on
  // the stack (per CR 117.1c).
  return {
    ...next,
    priorityHolder: state.activePlayer,
    consecutivePasses: 0,
  };
}

/**
 * Default per-spell resolver. Creatures enter the battlefield; other
 * permanents (artifacts, enchantments, planeswalkers) also enter; the
 * "etb on this side" rule is enforced by the engine's default — it
 * calls onResolve which here moves the card from a placeholder to
 * battlefield. Instants and sorceries just log and pop.
 */
function defaultSpellResolver(card, controller) {
  const typeLine = String(card?.type || card?.type_line || "");
  const isPermanentSpell =
    /Creature/.test(typeLine) ||
    /Artifact/.test(typeLine) ||
    /Enchantment/.test(typeLine) ||
    /Planeswalker/.test(typeLine);
  if (!isPermanentSpell) {
    return (state) => logEvent(state, {
      kind: "spell-no-op-resolve",
      cardName: card.name,
      reason: "instant-or-sorcery (effects not wired in PR6.1)",
    });
  }

  return (state) => {
    // Card is already off hand and on the stack. Resolution puts the
    // card on the battlefield as a new Permanent. We need to insert
    // the card object back through moveCardToZone — except it's not
    // currently in any zone. We can splice it in directly.
    const player = state.players[controller];
    if (!player) return state;
    const newPermanent = {
      id: `perm-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      card,
      controller,
      tapped: false,
      summoningSick: /Creature/.test(typeLine),
      counters: {},
      attachments: [],
      attachedTo: null,
      enteredOnTurn: state.turn,
    };
    return {
      ...state,
      players: {
        ...state.players,
        [controller]: {
          ...player,
          battlefield: [...player.battlefield, newPermanent],
        },
      },
      log: [
        ...state.log,
        { turn: state.turn, kind: "permanent-enters", cardName: card.name, controller },
      ],
    };
  };
}

function applyDeclareAttacker(state, action) {
  const creature = findCreatureOnBattlefield(state, action.playerId, action.permanentId);
  if (!creature) throw new DispatcherError(`Permanent ${action.permanentId} not on battlefield`, "PERM_NOT_FOUND");

  const withCombat = ensureCombat(state);
  const defender = opponentOf(action.playerId);
  const attackerEntry = {
    permanentId: action.permanentId,
    attackingPlayer: action.playerId,
    defender,
  };
  return {
    ...withCombat,
    combat: {
      ...withCombat.combat,
      attackers: [...withCombat.combat.attackers, attackerEntry],
    },
    log: [
      ...withCombat.log,
      { turn: state.turn, kind: "attack-declared", attackerId: action.permanentId, attackingPlayer: action.playerId },
    ],
  };
}

function applyDeclareBlocker(state, action) {
  const blocker = findCreatureOnBattlefield(state, action.playerId, action.permanentId);
  if (!blocker) throw new DispatcherError(`Permanent ${action.permanentId} not on battlefield`, "PERM_NOT_FOUND");

  const withCombat = ensureCombat(state);
  const blockerEntry = {
    blockerId: action.permanentId,
    blockingPlayer: action.playerId,
    attackerId: action.attackerId,
  };
  return {
    ...withCombat,
    combat: {
      ...withCombat.combat,
      blockers: [...withCombat.combat.blockers, blockerEntry],
    },
    log: [
      ...withCombat.log,
      { turn: state.turn, kind: "block-declared", blockerId: action.permanentId, attackerId: action.attackerId },
    ],
  };
}

// ─── Public dispatch ─────────────────────────────────────────────────────────

const HANDLERS = {
  "pass-priority": applyPassPriority,
  "play-land": applyPlayLand,
  "cast-spell": applyCastSpell,
  "declare-attacker": applyDeclareAttacker,
  "declare-blocker": applyDeclareBlocker,
};

/**
 * Apply a single action to a state, returning the new state.
 *
 * Errors thrown:
 *   - DispatcherError(BAD_ACTION) — action is null or unknown kind
 *   - DispatcherError(...) — see individual handlers
 *
 * Callers should catch and surface to the user (typically: log the
 * error, leave state unchanged, ask the user for another choice).
 */
export function dispatchAction(state, action) {
  if (!action) {
    throw new DispatcherError("Cannot dispatch null action", "BAD_ACTION");
  }
  const handler = HANDLERS[action.kind];
  if (!handler) {
    throw new DispatcherError(`Unknown action kind: ${action.kind}`, "BAD_ACTION");
  }
  return handler(state, action);
}

/**
 * Convenience: clear the per-turn combat state. Called by the engine
 * at end-of-combat. Pure function.
 */
export function clearCombat(state) {
  if (!state.combat) return state;
  return { ...state, combat: { attackers: [], blockers: [] } };
}

// Re-export deductManaCost for tests that want to assert mana
// arithmetic directly without going through dispatchAction.
export { deductManaCost as _deductManaCostForTests };
