import { describe, it, expect } from "vitest";
import { evaluatePuzzle, normalizePuzzleGoal, puzzleGoalLabel, PUZZLE_GOALS } from "./puzzleGoal.js";

const WIN = { type: "win-this-turn" };

describe("normalizePuzzleGoal", () => {
  it("passes a known goal type through", () => {
    expect(normalizePuzzleGoal("win-this-turn")).toEqual({ type: "win-this-turn" });
    expect(normalizePuzzleGoal({ type: "win-this-turn" })).toEqual({ type: "win-this-turn" });
  });
  it("falls back to the default for unknown / missing goals", () => {
    expect(normalizePuzzleGoal("nonsense")).toEqual({ type: "win-this-turn" });
    expect(normalizePuzzleGoal(null)).toEqual({ type: "win-this-turn" });
    expect(normalizePuzzleGoal(undefined)).toEqual({ type: "win-this-turn" });
  });
  it("labels a goal", () => {
    expect(puzzleGoalLabel(WIN)).toBe(PUZZLE_GOALS["win-this-turn"].label);
    expect(puzzleGoalLabel("mystery")).toBe(PUZZLE_GOALS["win-this-turn"].label);
  });
});

describe("evaluatePuzzle — win-this-turn", () => {
  it("SOLVED when the user wins on the capture turn", () => {
    expect(evaluatePuzzle({ goal: WIN, startTurn: 5, status: "ended", turn: 5, reason: "user-wins" })).toBe("solved");
  });

  it("FAILED when the user wins but a later turn (didn't win THIS turn)", () => {
    expect(evaluatePuzzle({ goal: WIN, startTurn: 5, status: "ended", turn: 7, reason: "user-wins" })).toBe("failed");
  });

  it("FAILED when the user loses or draws", () => {
    expect(evaluatePuzzle({ goal: WIN, startTurn: 5, status: "ended", turn: 5, reason: "ai-wins" })).toBe("failed");
    expect(evaluatePuzzle({ goal: WIN, startTurn: 5, status: "ended", turn: 5, reason: "draw" })).toBe("failed");
  });

  it("FAILED when the turn rolls past the capture turn with no win yet", () => {
    expect(evaluatePuzzle({ goal: WIN, startTurn: 5, status: "active", turn: 6 })).toBe("failed");
  });

  it("PENDING while still on the capture turn and not yet won", () => {
    expect(evaluatePuzzle({ goal: WIN, startTurn: 5, status: "active", turn: 5 })).toBe("pending");
  });

  it("degrades to win-from-here when startTurn is null (any winning turn solves)", () => {
    expect(evaluatePuzzle({ goal: WIN, startTurn: null, status: "ended", turn: 9, reason: "user-wins" })).toBe("solved");
  });

  it("unknown goal type never auto-resolves (pending)", () => {
    expect(evaluatePuzzle({ goal: { type: "survive-10" }, startTurn: 1, status: "ended", turn: 1, reason: "user-wins" })).toBe("pending");
  });
});
