/**
 * POST /api/learn/abandon  { sessionId }
 *
 * The person ends a game early — the Academy's "Abandon game". The game ends with status "abandoned"
 * (learnSession.abandon) and leaves play the way every finished game does (learnPersistence.finishGame): its record is
 * kept with that result, its session freed and its save dropped, so "Continue a game" no longer offers it. A game in
 * memory is ended as it stands; a game that is only on disk (the server restarted, or the in-memory store let it go,
 * since it was last played) is ended from its save. A game still at its opening-hand mulligans can be abandoned too.
 * Until 2026-10-22 the button only reset the page: the game stayed in "Continue a game" and no record was kept.
 *
 * Response — the play routes' envelope:
 *   { sessionId, decision: { kind: "game-over", reason: "abandoned" }, status: "abandoned", mode, difficulty, turn,
 *     activePlayer, step, decisionLogTail, table, board, userDeckName, opponentDeckNames, saveFailure? }
 *   saveFailure ({ kind: "game-record", detail }) is present only when the record could not be kept (learnPersistence.js);
 *   the game is ended either way.
 *
 * Errors:
 *   400 — missing sessionId / invalid body
 *   404 — no game in play or saved with that id
 *   409 — that game is already over (nothing to abandon)
 *   422 — its save can't be read (corrupt or unmigratable)
 *   500 — the game could not be ended
 */

export const runtime = "nodejs";

import { abandon, filteredDecisionLogTail, isComplete } from "../../../../lib/learn/learnSession.js";
import { tableSnapshot } from "../../../../lib/learn/tableSnapshot.js";
import { boardSnapshot } from "../../../../lib/learn/boardSnapshot.js";
import { getSession } from "../../../../lib/server/learnSessionStore.js";
import { loadSave } from "../../../../lib/server/learnSaveStore.js";
import { migrate } from "../../../../lib/server/learnSaveSchema.js";
import { finishGame } from "../../../../lib/server/learnPersistence.js";
import { deckNamesOf } from "../../../../lib/server/learnDeckNames.js";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const sessionId = body?.sessionId;
  if (!sessionId || typeof sessionId !== "string") {
    return Response.json({ error: "sessionId required." }, { status: 400 });
  }

  // The game as it stands: in memory, else its save.
  let session = getSession(sessionId);
  if (!session) {
    const loaded = await loadSave(sessionId);
    if (!loaded.ok) {
      const status = loaded.reason === "not-found" ? 404 : 422;
      return Response.json(
        { error: loaded.reason === "not-found" ? "No game in play or saved with that id." : `Could not read the saved game (${loaded.reason}).`, reason: loaded.reason },
        { status },
      );
    }
    try {
      session = migrate(loaded.saveDoc).session;
    } catch (error) {
      return Response.json(
        { error: "This game was saved on an older version and can't be read; delete it from “Continue a game”.", reason: "unmigratable", detail: error.message },
        { status: 422 },
      );
    }
  }

  if (isComplete(session)) {
    return Response.json({ error: "This game is already over.", status: session.status }, { status: 409 });
  }

  const ended = abandon(session, "user-abandoned");
  let answer;
  let saveFailure;
  try {
    // The answer is built before the game leaves play, so a failure here leaves the game as it was (record, save).
    answer = {
      sessionId: ended.id,
      decision: { kind: "game-over", reason: ended.status }, // what the driver answers for an abandoned session
      status: ended.status,
      mode: ended.mode,
      difficulty: ended.difficulty,
      turn: ended.state.turn,
      activePlayer: ended.state.activePlayer,
      step: ended.state.step,
      decisionLogTail: filteredDecisionLogTail(ended),
      table: tableSnapshot(ended.state),
      board: boardSnapshot(ended.state),
      ...deckNamesOf(ended),
    };
    // The one way a finished game leaves play: the record kept, the session freed, the save dropped.
    saveFailure = await finishGame(ended);
  } catch (error) {
    console.error(`[learn] abandoning game ${sessionId} failed:`, error);
    return Response.json({ error: error.message || "Could not end the game." }, { status: 500 });
  }

  return Response.json({ ...answer, ...(saveFailure ? { saveFailure } : {}) });
}
