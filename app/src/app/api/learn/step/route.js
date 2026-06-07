/**
 * POST /api/learn/step
 *
 * Body:
 *   { sessionId, choice }
 *
 * Where `choice` is one of the options from a previous decision
 * (kind + identifying fields like cardId / permanentId / attackerId).
 *
 * Response:
 *   { sessionId, decision, status, turn, activePlayer, step }
 *
 * Errors:
 *   400 — missing body / unknown sessionId / invalid choice
 *   500 — engine error
 */

export const runtime = "nodejs";

import { applyChoice, isComplete } from "../../../../lib/learn/learnSession.js";
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

  const { sessionId, choice } = body || {};
  if (!sessionId) {
    return Response.json({ error: "sessionId required." }, { status: 400 });
  }
  if (!choice || typeof choice !== "object") {
    return Response.json({ error: "choice required and must be an object with at least a `kind` field." }, { status: 400 });
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
    result = applyChoice(session, choice);
  } catch (error) {
    return Response.json({ error: error.message || "Engine error processing choice." }, { status: 500 });
  }

  // Preserve the route-level deck metadata across the step (the pure engine
  // doesn't carry session.meta).
  const stepped = result.session.meta
    ? result.session
    : { ...result.session, meta: session.meta };

  putSession(stepped);

  if (isComplete(stepped)) {
    // Game over: free the in-memory session and drop the in-flight save (it's no
    // longer resumable). Completed-game records are Phase 3.
    deleteSession(sessionId);
    try { await deleteSave(sessionId); } catch { /* never block on cleanup */ }
  } else {
    // Autosave so the game survives a restart (awaited but error-swallowed).
    try { await autosaveSession(stepped); } catch { /* never block play on a save */ }
  }

  return Response.json({
    sessionId: stepped.id,
    decision: stripDecisionForWire(enrichUnresolvedDecision(result.decision, stepped.state)),
    status: stepped.status,
    turn: stepped.state.turn,
    activePlayer: stepped.state.activePlayer,
    step: stepped.state.step,
    decisionLogTail: stepped.decisionLog.slice(-5),
    table: tableSnapshot(stepped.state),
    board: boardSnapshot(stepped.state),
  });
}

function stripDecisionForWire(decision) {
  if (!decision) return null;
  if (decision.kind !== "ask") return decision;
  return {
    ...decision,
    options: (decision.options || []).map(opt => {
      const { ...safe } = opt;
      return safe;
    }),
    metadata: decision.metadata ? {
      ...decision.metadata,
      suggestion: decision.metadata.suggestion ? { ...decision.metadata.suggestion } : null,
    } : undefined,
  };
}
