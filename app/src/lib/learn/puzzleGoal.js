/**
 * puzzleGoal.js — puzzle goal definitions + the pure goal-check for P9.
 *
 * A puzzle is a captured mid-game position (a serialized session snapshot) plus
 * a GOAL. Solving it means driving the loaded position to satisfy the goal. The
 * check is pure and derives only from observable session facts (status / turn /
 * game-over reason), so it's identical on the client (the live overlay) and in
 * tests. No engine coupling.
 *
 * v1 ships ONE goal type, "win-this-turn": find the line that wins the game
 * before the turn passes (the classic "find lethal" puzzle). `startTurn` (the
 * turn the puzzle was captured on) is stored on the puzzle so the check can tell
 * "won this turn" from "won eventually". Additional goal types (survive-N,
 * win-from-here) are additive here + a branch in evaluatePuzzle.
 */

import { isUserWin } from "./learnOutcome.js";

export const PUZZLE_GOALS = {
  "win-this-turn": {
    type: "win-this-turn",
    label: "Win this turn",
    blurb: "Find the line that wins the game before the turn passes.",
  },
};

export const DEFAULT_PUZZLE_GOAL = "win-this-turn";

/** Normalize an arbitrary goal input to a stored goal object ({ type }). Unknown → default. */
export function normalizePuzzleGoal(goal) {
  const type = typeof goal === "string" ? goal : goal?.type;
  return PUZZLE_GOALS[type] ? { type } : { type: DEFAULT_PUZZLE_GOAL };
}

/** Human label for a stored goal. */
export function puzzleGoalLabel(goal) {
  const type = typeof goal === "string" ? goal : goal?.type;
  return PUZZLE_GOALS[type]?.label || PUZZLE_GOALS[DEFAULT_PUZZLE_GOAL].label;
}

/**
 * Evaluate a puzzle attempt from observable session facts. Returns one of
 * "solved" | "failed" | "pending".
 *
 * @param {object} args
 * @param {object} args.goal       the stored goal ({ type })
 * @param {number|null} args.startTurn  the turn the puzzle was captured on
 * @param {string} args.status     session status ("active" | "ended")
 * @param {number} args.turn       the current turn
 * @param {string} [args.reason]   the game-over reason (present when ended)
 */
export function evaluatePuzzle({ goal, startTurn, status, turn, reason } = {}) {
  const type = (typeof goal === "string" ? goal : goal?.type) || DEFAULT_PUZZLE_GOAL;
  const ended = status === "ended";
  const won = isUserWin(reason);

  if (type === "win-this-turn") {
    // Solved: the user wins, on the SAME turn the puzzle started (startTurn null
    // degrades gracefully to "win from here" — any winning turn counts).
    if (ended && won && (startTurn == null || turn === startTurn)) return "solved";
    // Failed: the user lost/drew, OR the turn rolled past the capture turn with no win.
    if (ended && !won) return "failed";
    if (startTurn != null && typeof turn === "number" && turn > startTurn) return "failed";
    return "pending";
  }

  // Unknown goal type: never auto-resolve (fail-open to "pending" so the UI just
  // plays the position without a false success/fail).
  return "pending";
}
