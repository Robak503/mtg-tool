/**
 * POST /api/learn/mulligan
 *
 * Answer the current step of the interactive human London mulligan (CR 103.5). The session must
 * have been started with `humanMulligan: true` (it then sits at status "mulligan" until the
 * player finishes). `advanceMulligan` drives the engine step-primitives one step per call and,
 * once the player keeps, opens the game and hands off to the normal decision loop.
 *
 * Body:
 *   { sessionId, action: { kind: "mulligan-ship" } }                      // reshuffle + redraw 7
 *   { sessionId, action: { kind: "mulligan-keep" } }                      // keep the current hand
 *   { sessionId, action: { kind: "mulligan-bottom", cardIds: string[] } } // bottom exactly those
 *
 * Response mirrors /api/learn/step|choose: the next `decision` is either another mulligan ask
 * (still status "mulligan") or the game's first real decision (status "active" once opened).
 *
 * Errors:
 *   400 — missing body / sessionId
 *   404 — unknown sessionId (expired or server restarted)
 *   500 — engine error
 */

export const runtime = "nodejs";

import {
  advanceMulligan,
  isComplete,
  filteredDecisionLogTail,
} from "../../../../lib/learn/learnSession.js";
import {
  decisionViewForWire,
  mulliganDecisionForWire,
} from "../../../../lib/learn/decisionWire.js";
import { tableSnapshot } from "../../../../lib/learn/tableSnapshot.js";
import { boardSnapshot } from "../../../../lib/learn/boardSnapshot.js";
import { enrichUnresolvedDecision } from "../../../../lib/learn/arbiterSeam.js";
import { getSession, putSession, deleteSession } from "../../../../lib/server/learnSessionStore.js";
import { autosaveSession, deleteSave } from "../../../../lib/server/learnSaveStore.js";
import { appendGameRecord, recordFromSession } from "../../../../lib/server/gameRecordsStore.js";

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
      {
        error:
          "Session not found. It may have expired or the server restarted — call /api/learn/start to begin a new game.",
      },
      { status: 404 },
    );
  }

  let result;
  try {
    result = advanceMulligan(session, body?.action || {});
  } catch (error) {
    return Response.json(
      { error: error.message || "Engine error resolving the mulligan." },
      { status: 500 },
    );
  }

  // Preserve the route-level deck metadata (the pure engine doesn't carry it).
  const stepped = result.session.meta ? result.session : { ...result.session, meta: session.meta };

  putSession(stepped);

  // A game can't normally end during the mulligan phase, but keep the completion handling uniform
  // with /choose|/step in case the opened game reaches a terminal on the very first advance.
  if (isComplete(stepped)) {
    try {
      await appendGameRecord(recordFromSession(stepped, filteredDecisionLogTail(stepped, 160)));
    } catch {
      /* records are best-effort */
    }
    deleteSession(sessionId);
    try {
      await deleteSave(sessionId);
    } catch {
      /* never block on cleanup */
    }
  } else {
    try {
      await autosaveSession(stepped);
    } catch {
      /* never block play on a save */
    }
  }

  // Still in the mulligan phase ⇒ another mulligan ask; otherwise the game has opened and the
  // decision is a normal in-game one (or a terminal), which the standard wire view handles.
  const decision =
    stepped.status === "mulligan"
      ? mulliganDecisionForWire(result.decision)
      : decisionViewForWire(enrichUnresolvedDecision(result.decision, stepped.state));

  return Response.json({
    sessionId: stepped.id,
    decision,
    status: stepped.status,
    difficulty: stepped.difficulty,
    turn: stepped.state.turn,
    activePlayer: stepped.state.activePlayer,
    step: stepped.state.step,
    decisionLogTail: filteredDecisionLogTail(stepped),
    table: tableSnapshot(stepped.state),
    board: boardSnapshot(stepped.state),
  });
}
