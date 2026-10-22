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
 *   { sessionId, decision, status, turn, activePlayer, step, saveFailure? }
 *   saveFailure ({ kind: "autosave" | "game-record", detail }) is present only when the game
 *   could not be kept on disk (learnPersistence.js); play goes on and the Academy shows a notice.
 *   When one of the engine's guards stops the game, it ends: status "engine-stopped" and
 *   decision { kind: "game-over", reason: "engine-stopped", guard, message, detail } (the same
 *   on every play route and on resume — learnSession.endEngineStoppedGame).
 *
 * Errors:
 *   400 — missing body / unknown sessionId / invalid choice
 *   500 — engine error
 */

export const runtime = "nodejs";

import { applyChoice, endEngineStoppedGame, filteredDecisionLogTail } from "../../../../lib/learn/learnSession.js";
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
    // A game one of the engine's guards stopped ENDS here (status "engine-stopped") — never left active to be resumed into it.
    result = endEngineStoppedGame(applyChoice(session, choice, { policy: { playHints: loadPlayHints() || true } }));
  } catch (error) {
    return Response.json({ error: error.message || "Engine error processing choice." }, { status: 500 });
  }

  // Preserve the route-level deck metadata across the step (the pure engine
  // doesn't carry session.meta).
  const stepped = result.session.meta
    ? result.session
    : { ...result.session, meta: session.meta };

  putSession(stepped);

  // Game over: the record is kept (P2 — finished games used to be discarded here), the session freed and the in-flight
  // save dropped; a game in progress is autosaved so it survives a restart. Never blocks play; a failure is logged and
  // comes back as `saveFailure` (learnPersistence.js).
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
