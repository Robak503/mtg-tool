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
import { getSession, putSession, deleteSession } from "../../../../lib/server/learnSessionStore.js";

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

  putSession(result.session);

  // If the game ended, clean up the session from the store after a
  // short delay. The client gets one final response with the final
  // state; subsequent requests would 404. We delete eagerly to free
  // memory for active sessions.
  if (isComplete(result.session)) {
    deleteSession(sessionId);
  }

  return Response.json({
    sessionId: result.session.id,
    decision: stripDecisionForWire(result.decision),
    status: result.session.status,
    turn: result.session.state.turn,
    activePlayer: result.session.state.activePlayer,
    step: result.session.state.step,
    decisionLogTail: result.session.decisionLog.slice(-5),
    table: tableSnapshot(result.session.state),
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
