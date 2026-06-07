/**
 * POST /api/learn/continue
 *
 * Phase-2 P2.1 — the player has seen the Arbiter's ruling for an `unresolved`
 * spell (the engine couldn't model it) and wants to keep playing. Clears the
 * `pendingArbiter` flag, records the acknowledgment, and re-derives the next
 * decision. Same response envelope as /api/learn/step.
 *
 * Body:
 *   { sessionId }
 *
 * Errors:
 *   400 — missing body / sessionId
 *   404 — unknown sessionId (expired or server restarted)
 *   500 — engine error
 */

export const runtime = "nodejs";

import { continueFromArbiter, isComplete } from "../../../../lib/learn/learnSession.js";
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
    result = continueFromArbiter(session);
  } catch (error) {
    return Response.json({ error: error.message || "Engine error continuing the game." }, { status: 500 });
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
    turn: stepped.state.turn,
    activePlayer: stepped.state.activePlayer,
    step: stepped.state.step,
    decisionLogTail: stepped.decisionLog.slice(-5),
    table: tableSnapshot(stepped.state),
    board: boardSnapshot(stepped.state),
  });
}
