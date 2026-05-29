/**
 * Phase 6 PR 8 — multiplayer engine primitives.
 *
 * Standard (1v1) behavior is covered exhaustively in gameState.test.js /
 * gameEngine.test.js. This file proves the data-model shift that makes
 * Commander (4P FFA) possible: the mode flag, the turn-order rotation,
 * the "all enemies" primitive, and the priority-pass threshold scaling
 * with the number of seats — all WITHOUT regressing the two-player path.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetIdsForTests,
  MODES,
  COMMANDER_PLAYER_IDS,
  createGameState,
  createPlayerState,
  opponentsOf,
  nextInTurnOrder,
} from "./gameState.js";
import { passPriority, advanceStep } from "./gameEngine.js";

beforeEach(() => {
  _resetIdsForTests();
});

const TINY_DECK = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, name: `C${i}` }));

// A minimal-but-valid 4-seat state sitting at a priority window in the
// precombat main phase. Enough structure for the priority machine to run.
function fourSeatState(overrides = {}) {
  const seat = () => createPlayerState({ library: [...TINY_DECK] });
  return {
    turn: 1,
    mode: "commander",
    activePlayer: "user",
    turnOrder: ["user", "ai1", "ai2", "ai3"],
    priorityHolder: "user",
    consecutivePasses: 0,
    phase: "precombat-main",
    step: "main",
    stack: [],
    pendingTriggers: [],
    players: { user: seat(), ai1: seat(), ai2: seat(), ai3: seat() },
    log: [],
    ...overrides,
  };
}

describe("mode constants", () => {
  it("exposes the two supported formats", () => {
    expect(MODES).toEqual(["standard", "commander"]);
  });
  it("exposes the Commander seat layout", () => {
    expect(COMMANDER_PLAYER_IDS).toEqual(["user", "ai1", "ai2", "ai3"]);
  });
});

describe("createGameState mode + turnOrder", () => {
  it("defaults to standard with a two-seat turn order", () => {
    const s = createGameState({ userDeck: [...TINY_DECK], aiDeck: [...TINY_DECK] });
    expect(s.mode).toBe("standard");
    expect(s.turnOrder).toEqual(["user", "ai"]);
  });

  it("builds four seats + pod turn order in commander mode", () => {
    const s = createGameState({
      userDeck: [...TINY_DECK],
      opponentDecks: [[...TINY_DECK], [...TINY_DECK], [...TINY_DECK]],
      mode: "commander",
    });
    expect(s.mode).toBe("commander");
    expect(s.turnOrder).toEqual(["user", "ai1", "ai2", "ai3"]);
    expect(Object.keys(s.players).sort()).toEqual(["ai1", "ai2", "ai3", "user"]);
  });

  it("seeds per-opponent commanders in commander mode", () => {
    const cmd = (name) => ({ id: `cmd-${name}`, name, type: "Legendary Creature" });
    const s = createGameState({
      userDeck: [...TINY_DECK],
      opponentDecks: [[...TINY_DECK], [...TINY_DECK], [...TINY_DECK]],
      opponentCommanders: [[cmd("A")], [cmd("B")], []],
      mode: "commander",
    });
    expect(s.players.ai1.command).toHaveLength(1);
    expect(s.players.ai2.command).toHaveLength(1);
    expect(s.players.ai3.command).toHaveLength(0);
  });

  it("throws if commander mode lacks exactly 3 opponent decks", () => {
    expect(() =>
      createGameState({ userDeck: [...TINY_DECK], opponentDecks: [[...TINY_DECK]], mode: "commander" }),
    ).toThrow(/exactly 3 decks/);
    expect(() =>
      createGameState({ userDeck: [...TINY_DECK], mode: "commander" }),
    ).toThrow(/exactly 3 decks/);
  });

  it("tolerates an opponentCommanders array shorter than the pod", () => {
    const cmd = (n) => ({ id: `cmd-${n}`, name: n, type: "Legendary Creature" });
    const s = createGameState({
      userDeck: [...TINY_DECK],
      opponentDecks: [[...TINY_DECK], [...TINY_DECK], [...TINY_DECK]],
      opponentCommanders: [[cmd("A")]], // only one provided
      mode: "commander",
    });
    expect(s.players.ai1.command).toHaveLength(1);
    expect(s.players.ai2.command).toHaveLength(0);
    expect(s.players.ai3.command).toHaveLength(0);
  });

  it("throws on an unsupported mode", () => {
    expect(() =>
      createGameState({ userDeck: [...TINY_DECK], aiDeck: [...TINY_DECK], mode: "modern" }),
    ).toThrow(/mode must be one of/);
  });
});

describe("opponentsOf", () => {
  it("returns the lone opponent in Standard", () => {
    const s = createGameState({ userDeck: [...TINY_DECK], aiDeck: [...TINY_DECK] });
    expect(opponentsOf(s, "user")).toEqual(["ai"]);
    expect(opponentsOf(s, "ai")).toEqual(["user"]);
  });

  it("returns the three other seats in turn order in Commander", () => {
    const s = fourSeatState();
    expect(opponentsOf(s, "user")).toEqual(["ai1", "ai2", "ai3"]);
    expect(opponentsOf(s, "ai2")).toEqual(["user", "ai1", "ai3"]);
  });

  it("falls back to Object.keys(players) when turnOrder is absent", () => {
    const s = fourSeatState({ turnOrder: undefined });
    expect(opponentsOf(s, "user").sort()).toEqual(["ai1", "ai2", "ai3"]);
  });

  it("throws on an unknown player", () => {
    const s = fourSeatState();
    expect(() => opponentsOf(s, "eve")).toThrow();
  });
});

describe("nextInTurnOrder", () => {
  it("toggles the two seats in Standard", () => {
    const s = createGameState({ userDeck: [...TINY_DECK], aiDeck: [...TINY_DECK] });
    expect(nextInTurnOrder(s, "user")).toBe("ai");
    expect(nextInTurnOrder(s, "ai")).toBe("user");
  });

  it("rotates around the pod and wraps in Commander", () => {
    const s = fourSeatState();
    expect(nextInTurnOrder(s, "user")).toBe("ai1");
    expect(nextInTurnOrder(s, "ai1")).toBe("ai2");
    expect(nextInTurnOrder(s, "ai2")).toBe("ai3");
    expect(nextInTurnOrder(s, "ai3")).toBe("user"); // wrap
  });

  it("throws when the player is not seated", () => {
    const s = fourSeatState({ turnOrder: ["user", "ai1", "ai2", "ai3"] });
    // ai is a valid id but not in this game's turn order.
    expect(() => nextInTurnOrder(s, "ai")).toThrow(/not in turn order/);
  });
});

describe("priority pass threshold scales with seat count", () => {
  it("hands priority around all four seats before a step ends", () => {
    let s = fourSeatState();

    // Pass 1: user → ai1. Old 2-seat logic would NOT yet resolve.
    s = passPriority(s);
    expect(s.priorityHolder).toBe("ai1");
    expect(s.consecutivePasses).toBe(1);
    expect(s.step).toBe("main"); // still in the same step

    // Pass 2: ai1 → ai2. CRITICAL — with the old `>= 2` threshold the
    // step would have ended here. It must NOT in a 4-seat game.
    s = passPriority(s);
    expect(s.priorityHolder).toBe("ai2");
    expect(s.consecutivePasses).toBe(2);
    expect(s.step).toBe("main");

    // Pass 3: ai2 → ai3.
    s = passPriority(s);
    expect(s.priorityHolder).toBe("ai3");
    expect(s.consecutivePasses).toBe(3);
    expect(s.step).toBe("main");

    // Pass 4: full lap complete with an empty stack → step ends and we
    // advance to beginning-of-combat with priority back to the active
    // player.
    s = passPriority(s);
    expect(s.phase).toBe("combat");
    expect(s.step).toBe("beginning-of-combat");
    expect(s.priorityHolder).toBe("user");
  });

  it("a taken action mid-lap (reset passes) forces a fresh full lap", () => {
    // Simulate: three seats passed, then someone acted (consecutivePasses
    // reset to 0). The step must require another full four-seat lap.
    let s = fourSeatState({ priorityHolder: "ai3", consecutivePasses: 0 });
    s = passPriority(s); // ai3 → user, 1 pass
    expect(s.consecutivePasses).toBe(1);
    expect(s.step).toBe("main");
  });
});

describe("turn rotation across the pod", () => {
  it("ending a seat's turn hands the next turn to the next pod member", () => {
    // Sitting at the final step of the turn (ending/cleanup); advancing
    // ends the turn and passes it to the next seat in turn order.
    const atEndOfTurn = fourSeatState({ phase: "ending", step: "cleanup", activePlayer: "user" });
    const next = advanceStep(atEndOfTurn);
    expect(next.activePlayer).toBe("ai1");
    expect(next.turn).toBe(2);
    expect(next.phase).toBe("beginning");
    expect(next.step).toBe("untap");
  });

  it("wraps from the last seat back to the user", () => {
    const ai3sTurnEnd = fourSeatState({ phase: "ending", step: "cleanup", activePlayer: "ai3" });
    expect(advanceStep(ai3sTurnEnd).activePlayer).toBe("user");
  });

  it("rotates correctly over a pod with an eliminated seat", () => {
    // ai2 was eliminated — both turnOrder and players drop it. Rotation
    // must skip the gap (this is the whole point of shrinking turnOrder).
    const s = fourSeatState({ turnOrder: ["user", "ai1", "ai3"] });
    delete s.players.ai2;
    expect(nextInTurnOrder(s, "ai1")).toBe("ai3"); // skips the hole
    expect(nextInTurnOrder(s, "ai3")).toBe("user"); // wraps
    expect(opponentsOf(s, "user")).toEqual(["ai1", "ai3"]);
  });
});
