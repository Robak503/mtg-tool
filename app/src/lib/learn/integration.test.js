/**
 * Phase 6 — end-to-end integration test.
 *
 * Wires gameState + gameEngine + legalChoices + opponentAI +
 * decisionGate together and drives a real game forward through
 * several priority windows. This is the "proof of life" that the
 * foundation layers actually compose into something that runs
 * without crashing.
 *
 * What it verifies:
 *   - startGame seeds both opening hands and applies the first
 *     untap-step effects without throwing.
 *   - decisionGate routes the user's decisions (auto-passed in
 *     expert mode for the test) and the AI's decisions (always
 *     auto-decided) into the engine without engine.passPriority
 *     ever throwing on a stale state.
 *   - The engine advances cleanly through ≥ 2 full turn cycles
 *     (turn 1 user → turn 1 ai → turn 2 user …).
 *   - At least one land lands on the battlefield via the
 *     play-land → moveCardToZone path, proving that an action
 *     dispatched through the gate actually mutates state.
 *
 * Not in scope (yet — bigger PRs):
 *   - Spell resolution affecting board state beyond entering the
 *     battlefield (counters, removal, draw).
 *   - Combat damage actually being assigned.
 *   - The narrator prompts that decisionGate produces in "ask"
 *     mode (covered separately in decisionGate.test.js).
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  _resetIdsForTests,
  createGameState,
  moveCardToZone,
  PLAYER_IDS,
} from "./gameState.js";
import {
  startGame,
  passPriority,
  nextStep,
} from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { makeDecision } from "./decisionGate.js";

// ─── Deck fixtures ────────────────────────────────────────────────────────────

function basicForest(i) {
  return {
    id: `forest-${i}`,
    name: "Forest",
    type: "Basic Land — Forest",
    oracle: "{T}: Add {G}.",
    mana: "",
  };
}

function bear(i) {
  return {
    id: `bear-${i}`,
    name: "Grizzly Bears",
    type: "Creature — Bear",
    oracle: "",
    mana: "{1}{G}",
    cmc: 2,
    keywords: [],
    power: 2,
    toughness: 2,
  };
}

/** A 30-card mono-G deck: 18 Forests + 12 bears. Enough to run several turns. */
function makeMonoGreenDeck(label) {
  const cards = [];
  for (let i = 0; i < 18; i++) cards.push(basicForest(`${label}-${i}`));
  for (let i = 0; i < 12; i++) cards.push(bear(`${label}-${i}`));
  return cards;
}

function commander(label) {
  return {
    id: `cmd-${label}`,
    name: label === "u" ? "Atraxa, Praetors' Voice" : "Edgar Markov",
    type: "Legendary Creature — Vampire",
    oracle: "",
    mana: "{1}{W}{B}{B}",
    cmc: 4,
  };
}

// ─── Action dispatcher ───────────────────────────────────────────────────────
//
// The engine doesn't have a "perform action" method yet (that's PR6 —
// the LearnView wires it). For now we apply the obvious actions
// directly: pass-priority via passPriority, play-land via
// moveCardToZone, etc. Anything else (cast-spell, combat) is treated
// as "pass" for the smoke test.

function applyAction(state, action) {
  if (!action) return passPriority(state);
  switch (action.kind) {
    case "pass-priority":
      return passPriority(state);
    case "play-land": {
      const next = moveCardToZone(state, {
        playerId: action.playerId,
        fromZone: "hand",
        toZone: "battlefield",
        cardId: action.cardId,
        becomePermanent: true,
      });
      // Increment landsPlayedThisTurn so legalChoices stops offering
      // the same land again.
      const player = next.players[action.playerId];
      const withCounter = {
        ...next,
        players: {
          ...next.players,
          [action.playerId]: { ...player, landsPlayedThisTurn: player.landsPlayedThisTurn + 1 },
        },
      };
      // After a sorcery-speed action, priority restarts at active.
      return { ...withCounter, priorityHolder: state.activePlayer, consecutivePasses: 0 };
    }
    default:
      // For everything else (cast-spell, declare-attacker, …),
      // treat as a no-op pass. PR6 will hook these up.
      return passPriority(state);
  }
}

// ─── The drive loop ──────────────────────────────────────────────────────────

/**
 * Step the engine forward by ONE meaningful tick:
 *   - If a player holds priority → ask the decisionGate for an action
 *     for that player, then apply it.
 *   - If nobody holds priority → call nextStep to advance.
 *
 * Returns the new state plus a hint flag so the caller can detect
 * stuck states (shouldn't happen, but if the engine has a bug we'd
 * loop forever). Used inside a bounded for-loop with a safety cap.
 */
function tick(state, { userDifficulty = "expert", maxSpellsPerWindow = 0 } = {}) {
  if (!state.priorityHolder) {
    return { state: nextStep(state), kind: "step" };
  }

  const actor = state.priorityHolder;
  const actions = legalActionsForPlayer(state, actor);
  const decision = makeDecision(state, actor, actions, {
    difficulty: actor === "user" ? userDifficulty : "expert",
  });

  if (decision.kind !== "auto-decided") {
    // In the smoke test we always run expert mode, so this should
    // never happen. Surface it loudly if it does.
    throw new Error(`Unexpected ask-decision for ${actor} in expert mode`);
  }

  return { state: applyAction(state, decision.action), kind: "action", action: decision.action };
}

beforeEach(() => {
  _resetIdsForTests();
});

describe("Phase 6 integration — startGame + decisionGate + engine", () => {
  it("opens 7 cards to each player and stands at turn 1 untap step", () => {
    let state = createGameState({
      userDeck: makeMonoGreenDeck("u"),
      aiDeck: makeMonoGreenDeck("a"),
      userCommanders: [commander("u")],
      aiCommanders: [commander("a")],
    });
    state = startGame(state);

    expect(state.turn).toBe(1);
    expect(state.activePlayer).toBe("user");
    expect(state.step).toBe("untap");
    expect(state.players.user.hand).toHaveLength(7);
    expect(state.players.ai.hand).toHaveLength(7);
    expect(state.players.user.command).toHaveLength(1);
  });

  it("advances cleanly through ≥ 2 turn cycles without crashing", () => {
    let state = createGameState({
      userDeck: makeMonoGreenDeck("u"),
      aiDeck: makeMonoGreenDeck("a"),
      userCommanders: [commander("u")],
      aiCommanders: [commander("a")],
    });
    state = startGame(state);

    const ACTIONS_LOG = [];
    const SAFETY_CAP = 600;
    let safety = 0;
    // Run until we've started turn 3 (which means turns 1 and 2 both
    // completed cleanly) or we hit the safety cap.
    while (state.turn < 3 && safety < SAFETY_CAP) {
      const { state: next, kind, action } = tick(state);
      state = next;
      if (kind === "action") ACTIONS_LOG.push({ turn: state.turn, ...action });
      safety += 1;
    }

    expect(state.turn).toBeGreaterThanOrEqual(3);
    expect(safety).toBeLessThan(SAFETY_CAP);
    // Each player should have played at least one land by turn 3.
    expect(state.players.user.battlefield.some(p => p.card.name === "Forest")).toBe(true);
    expect(state.players.ai.battlefield.some(p => p.card.name === "Forest")).toBe(true);
  });

  it("respects the once-per-turn land rule across both players", () => {
    let state = createGameState({
      userDeck: makeMonoGreenDeck("u"),
      aiDeck: makeMonoGreenDeck("a"),
      userCommanders: [commander("u")],
      aiCommanders: [commander("a")],
    });
    state = startGame(state);

    const SAFETY_CAP = 600;
    let safety = 0;
    while (state.turn < 3 && safety < SAFETY_CAP) {
      const { state: next } = tick(state);
      state = next;
      safety += 1;
    }

    // Across two full turns, neither player should have more than 2
    // lands on the battlefield (one per turn cap).
    for (const playerId of PLAYER_IDS) {
      const lands = state.players[playerId].battlefield.filter(p => p.card.name === "Forest");
      expect(lands.length).toBeLessThanOrEqual(2);
    }
  });

  it("appends to the event log as the game progresses", () => {
    let state = createGameState({
      userDeck: makeMonoGreenDeck("u"),
      aiDeck: makeMonoGreenDeck("a"),
      userCommanders: [commander("u")],
      aiCommanders: [commander("a")],
    });
    state = startGame(state);

    const initialLog = state.log.length;
    let safety = 0;
    while (state.turn < 2 && safety < 400) {
      const { state: next } = tick(state);
      state = next;
      safety += 1;
    }

    expect(state.log.length).toBeGreaterThan(initialLog);
    // At least one phase-change / step event should be in the log.
    expect(state.log.some(entry => entry.kind === "step")).toBe(true);
  });

  it("AI side always auto-decides at every difficulty (smoke check)", () => {
    let state = createGameState({
      userDeck: makeMonoGreenDeck("u"),
      aiDeck: makeMonoGreenDeck("a"),
    });
    state = startGame(state);

    // Force AI to have priority for the assertion.
    const forceState = { ...state, priorityHolder: "ai", activePlayer: "ai", phase: "precombat-main", step: "main" };
    const actions = legalActionsForPlayer(forceState, "ai");
    for (const difficulty of ["beginner", "intermediate", "expert"]) {
      const decision = makeDecision(forceState, "ai", actions, { difficulty });
      expect(decision.kind).toBe("auto-decided");
    }
  });
});
