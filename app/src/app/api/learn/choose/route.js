/**
 * POST /api/learn/choose
 *
 * The player resolved an interactive choice — a tutor's "search your library for a card"
 * (`tutor-search`), a clone's "which creature to copy" (`clone-search`, CR 707), or a scry/surveil
 * reorder (`scry-surveil`, CR 701.22 / 701.25). `applyPendingChoice` dispatches by the pending
 * choice's kind; the resolution resumes/finishes it + re-derives the next decision.
 *
 * Body:
 *   { sessionId, choice: { cardId: string | null } }  // tutor: cardId null/absent = find nothing
 *   { sessionId, choice: { permId: string | null } }  // clone: permId null/absent = decline copy
 *   { sessionId, choice: { keep: string[] } }         // scry/surveil: ordered ids to keep on top
 *
 * Response: the step route envelope, with saveFailure ({ kind, detail }) only when the game could not
 * be kept on disk (learnPersistence.js) — play goes on and the Academy shows a notice.
 *
 * Errors:
 *   400 — missing body / sessionId
 *   404 — unknown sessionId (expired or server restarted)
 *   500 — engine error
 */

export const runtime = "nodejs";

import { applyPendingChoice, isComplete, filteredDecisionLogTail } from "../../../../lib/learn/learnSession.js";
import { decisionViewForWire } from "../../../../lib/learn/decisionWire.js";
import { tableSnapshot } from "../../../../lib/learn/tableSnapshot.js";
import { boardSnapshot } from "../../../../lib/learn/boardSnapshot.js";
import { enrichUnresolvedDecision } from "../../../../lib/learn/arbiterSeam.js";
import { getSession, putSession, deleteSession } from "../../../../lib/server/learnSessionStore.js";
import { autosaveForPlay, recordFinishedGame, dropFinishedGameSave } from "../../../../lib/server/learnPersistence.js";
import { recordFromSession } from "../../../../lib/server/gameRecordsStore.js";
import { loadPlayHints } from "../../../../lib/server/playHintsLedger.js"; // PLAY-HINTS (2026-08-12) — parked cards get a play identity

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

  const session = getSession(sessionId);
  if (!session) {
    return Response.json(
      { error: "Session not found. It may have expired or the server restarted — call /api/learn/start to begin a new game." },
      { status: 404 }
    );
  }

  let result;
  try {
    result = applyPendingChoice(session, body?.choice || {}, { policy: { playHints: loadPlayHints() || true } });
  } catch (error) {
    return Response.json({ error: error.message || "Engine error applying the choice." }, { status: 500 });
  }

  // Preserve the route-level deck metadata (the pure engine doesn't carry it).
  const stepped = result.session.meta
    ? result.session
    : { ...result.session, meta: session.meta };

  putSession(stepped);

  // Never blocks play; a failure is logged and comes back as `saveFailure` (learnPersistence.js).
  let saveFailure;
  if (isComplete(stepped)) {
    // The record keeps a FULL narrative tail (up to the store's 160-line cap) for
    // the P7 replay scrubber — not the 5-entry "recent activity" strip the live feed uses.
    saveFailure = await recordFinishedGame(recordFromSession(stepped, filteredDecisionLogTail(stepped, 160)));
    deleteSession(sessionId);
    await dropFinishedGameSave(sessionId);
  } else {
    saveFailure = await autosaveForPlay(stepped);
  }

  return Response.json({
    sessionId: stepped.id,
    decision: decisionViewForWire(enrichUnresolvedDecision(result.decision, stepped.state)),
    status: stepped.status,
    difficulty: stepped.difficulty,
    turn: stepped.state.turn,
    activePlayer: stepped.state.activePlayer,
    step: stepped.state.step,
    decisionLogTail: filteredDecisionLogTail(stepped),
    table: tableSnapshot(stepped.state),
    board: boardSnapshot(stepped.state),
    ...(saveFailure ? { saveFailure } : {}),
  });
}
