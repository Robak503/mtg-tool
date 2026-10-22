/**
 * learnOutcome.js — map a game-over `reason` to the player-facing result.
 *
 * Pure + exported so the board's game-over overlay (and any future post-game
 * screen) share ONE source of truth, and so the win/loss/draw labelling is
 * unit-tested. The old inline check (`reason === "user-wins" ? won : lost`)
 * mislabelled every non-win — draw and turn-limit stalemate both read as a loss.
 *
 * Reasons the engine emits on a `{ kind: "game-over", reason }` decision
 * (learnSession.recordOutcomeIfChanged / the turn-limit path / endEngineStoppedGame):
 *   user-wins | ai-wins | draw | turn-limit | abandoned | engine-stopped   (+ unknown fallback)
 *
 * `tone` is a stable token the UI maps to colour: "win" | "loss" | "draw" | "neutral".
 */
import { seatLabel } from "./seatLabels.js";

const count = (n) => (Number.isFinite(n) ? n.toLocaleString("en-US") : String(n));
const steps = (n) => `${count(n)} step${n === 1 ? "" : "s"}`;

/**
 * What stopped a game, in words, from the driver's `guard` (learnSession.advanceUntilDecision): which guard, the size,
 * whose board. endEngineStoppedGame puts it after "The engine stopped the game: " in the game log, and the end screen
 * shows it under its title.
 */
export function engineStopDetail(guard) {
  switch (guard?.type) {
    case "runaway":
      if (guard.zone === "stack") {
        return `${count(guard.count)} spells and abilities were waiting on the stack, past the engine's limit of ${count(guard.limit)} — a loop kept adding to the stack.`;
      }
      return `${seatLabel(guard.seat) || "A player"} controlled ${count(guard.count)} permanents, past the engine's limit of ${count(guard.limit)} — a loop kept adding to the board.`;
    case "turn-stall":
      return `turn ${guard.turn} went past the engine's limit of ${steps(guard.limit)} for one turn without ending — a loop it could not get out of.`;
    case "safety-cap":
      return `it took the engine's limit of ${steps(guard.limit)} without coming to a choice for you — a loop it could not get out of.`;
    default:
      return "it could not go on.";
  }
}

const ENGINE_STOPPED_TAIL =
  "Nobody won or lost. The game can't go on, so it is no longer offered under “Continue a game”; its record is kept.";

/** `decision` (optional) is the game-over decision itself; an engine-stopped one carries the `detail` shown. */
export function reasonToOutcome(reason, decision = null) {
  switch (reason) {
    case "user-wins":
      return { tone: "win", title: "You won.", blurb: "Every opponent is out of the game. Well played." };
    case "ai-wins":
      return { tone: "loss", title: "You lost.", blurb: "You were eliminated — your life hit 0 or commander damage finished you. Review the board to see how it unravelled." };
    case "draw":
      return { tone: "draw", title: "Draw.", blurb: "Everyone left the game at once — nobody wins." };
    case "turn-limit":
      return { tone: "draw", title: "Stalemate.", blurb: "The game hit the turn limit with no winner. The board locked up — neither side could close." };
    case "abandoned":
      return { tone: "neutral", title: "Game abandoned.", blurb: "You ended the game early." };
    case "engine-stopped": {
      const detail = typeof decision?.detail === "string" && decision.detail ? decision.detail : null;
      const capitalised = detail ? `${detail.charAt(0).toUpperCase()}${detail.slice(1)}` : null;
      return { tone: "neutral", title: "The engine stopped the game.", blurb: capitalised ? `${capitalised} ${ENGINE_STOPPED_TAIL}` : ENGINE_STOPPED_TAIL };
    }
    default:
      return { tone: "neutral", title: "Game over.", blurb: "The game has ended." };
  }
}

/** Is this game-over reason a win for the user? (Convenience for callers.) */
export function isUserWin(reason) {
  return reason === "user-wins";
}
