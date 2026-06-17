/**
 * POST /api/learn/choose
 *
 * The player resolved an interactive choice — a tutor's "search your library for a card"
 * (`tutor-search`), a clone's "which creature to copy" (`clone-search`, CR 707), or a scry/surveil
 * reorder (`scry-surveil`, CR 701.18 / 701.43). `applyPendingChoice` dispatches by the pending
 * choice's kind; the resolution resumes/finishes it + re-derives the next decision.
 *
 * Body:
 *   { sessionId, choice: { cardId: string | null } }  // tutor: cardId null/absent = find nothing
 *   { sessionId, choice: { permId: string | null } }  // clone: permId null/absent = decline copy
 *   { sessionId, choice: { keep: string[] } }         // scry/surveil: ordered ids to keep on top
 *
 * Errors:
 *   400 — missing body / sessionId
 *   404 — unknown sessionId (expired or server restarted)
 *   500 — engine error
 */

export const runtime = "nodejs";

import { applyPendingChoice, isComplete } from "../../../../lib/learn/learnSession.js";
import { tableSnapshot } from "../../../../lib/learn/tableSnapshot.js";
import { boardSnapshot } from "../../../../lib/learn/boardSnapshot.js";
import { enrichUnresolvedDecision } from "../../../../lib/learn/arbiterSeam.js";
import { getSession, putSession, deleteSession } from "../../../../lib/server/learnSessionStore.js";
import { autosaveSession, deleteSave } from "../../../../lib/server/learnSaveStore.js";

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
    result = applyPendingChoice(session, body?.choice || {});
  } catch (error) {
    return Response.json({ error: error.message || "Engine error applying the choice." }, { status: 500 });
  }

  // Preserve the route-level deck metadata (the pure engine doesn't carry it).
  const stepped = result.session.meta
    ? result.session
    : { ...result.session, meta: session.meta };

  putSession(stepped);

  if (isComplete(stepped)) {
    deleteSession(sessionId);
    try { await deleteSave(sessionId); } catch { /* never block on cleanup */ }
  } else {
    try { await autosaveSession(stepped); } catch { /* never block play on a save */ }
  }

  return Response.json({
    sessionId: stepped.id,
    decision: enrichUnresolvedDecision(result.decision, stepped.state),
    status: stepped.status,
    difficulty: stepped.difficulty,
    turn: stepped.state.turn,
    activePlayer: stepped.state.activePlayer,
    step: stepped.state.step,
    decisionLogTail: stepped.decisionLog.slice(-5),
    table: tableSnapshot(stepped.state),
    board: boardSnapshot(stepped.state),
  });
}
