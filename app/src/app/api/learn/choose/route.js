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

import { applyPendingChoice, endEngineStoppedGame, filteredDecisionLogTail } from "../../../../lib/learn/learnSession.js";
import { decisionViewForWire } from "../../../../lib/learn/decisionWire.js";
import { tableSnapshot } from "../../../../lib/learn/tableSnapshot.js";
import { boardSnapshot } from "../../../../lib/learn/boardSnapshot.js";
import { enrichUnresolvedDecision } from "../../../../lib/learn/arbiterSeam.js";
import { getSession, putSession } from "../../../../lib/server/learnSessionStore.js";
import { persistAfterPlay } from "../../../../lib/server/learnPersistence.js";
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
    // A game one of the engine's guards stopped ENDS here (status "engine-stopped") — never left active to be resumed into it.
    result = endEngineStoppedGame(applyPendingChoice(session, body?.choice || {}, { policy: { playHints: loadPlayHints() || true } }));
  } catch (error) {
    return Response.json({ error: error.message || "Engine error applying the choice." }, { status: 500 });
  }

  // Preserve the route-level deck metadata (the pure engine doesn't carry it).
  const stepped = result.session.meta
    ? result.session
    : { ...result.session, meta: session.meta };

  putSession(stepped);

  // Game over: record kept, session freed, save dropped; otherwise autosaved. Never blocks play; a failure is logged
  // and comes back as `saveFailure` (learnPersistence.js).
  const saveFailure = await persistAfterPlay(stepped);

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
