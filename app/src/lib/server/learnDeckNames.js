/**
 * learnDeckNames.js — the deck names an Academy game carries, as the routes that open a game answer them.
 *
 * /api/learn/start captures them from the person's picks into `session.meta` (`userDeckName`, `opponentNames`); the
 * save and the game's record keep that meta. Start, resume, resume-puzzle and abandon answer them the same way, so the
 * Academy's header names the decks however the game was opened — until 2026-10-22 resume answered none, and after a
 * restart the header read "You vs Opponent".
 */

/** { userDeckName: string | null, opponentDeckNames: string[] } from a session's meta (absent fields → null / []). */
export function deckNamesOf(session) {
  const meta = session?.meta && typeof session.meta === "object" ? session.meta : {};
  return {
    userDeckName: typeof meta.userDeckName === "string" && meta.userDeckName ? meta.userDeckName : null,
    opponentDeckNames: Array.isArray(meta.opponentNames) ? meta.opponentNames.filter((n) => typeof n === "string") : [],
  };
}
