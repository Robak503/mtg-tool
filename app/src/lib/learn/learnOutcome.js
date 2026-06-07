/**
 * learnOutcome.js — map a game-over `reason` to the player-facing result.
 *
 * Pure + exported so the board's game-over overlay (and any future post-game
 * screen) share ONE source of truth, and so the win/loss/draw labelling is
 * unit-tested. The old inline check (`reason === "user-wins" ? won : lost`)
 * mislabelled every non-win — draw and turn-limit stalemate both read as a loss.
 *
 * Reasons the engine emits on a `{ kind: "game-over", reason }` decision
 * (learnSession.recordOutcomeIfChanged / the turn-limit path):
 *   user-wins | ai-wins | draw | turn-limit | abandoned   (+ unknown fallback)
 *
 * `tone` is a stable token the UI maps to colour: "win" | "loss" | "draw" | "neutral".
 */
export function reasonToOutcome(reason) {
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
    default:
      return { tone: "neutral", title: "Game over.", blurb: "The game has ended." };
  }
}

/** Is this game-over reason a win for the user? (Convenience for callers.) */
export function isUserWin(reason) {
  return reason === "user-wins";
}
