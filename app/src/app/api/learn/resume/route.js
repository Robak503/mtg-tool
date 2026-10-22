/**
 * POST /api/learn/resume  { sessionId }
 *
 * Re-hydrates a saved game into the in-memory store and re-derives the current
 * decision via advanceUntilDecision. Same response envelope as /api/learn/start
 * so the client reuses one code path. Phase-7 PR-4a.
 *
 * A save whose game can't go on ends here (2026-10-22): when the re-derived decision is one of the engine's guards
 * stopping it — a save written before then, when a stopped game was left active and autosaved — the game ends as
 * any stopped game does (learnSession.endEngineStoppedGame, status "engine-stopped"), its record is kept and its save
 * removed (learnPersistence.finishGame), so "Continue a game" stops offering it. A save that re-derives any other
 * game over (a finished game whose save could not be dropped) is finished the same way.
 *
 * Errors:
 *   400 — missing sessionId / invalid body
 *   404 — no save with that id
 *   422 — save corrupt, unmigratable, or not resumable (e.g. future schema)
 *   500 — engine error resuming
 */

export const runtime = "nodejs";

import { advanceUntilDecision, endEngineStoppedGame, filteredDecisionLogTail, isComplete } from "../../../../lib/learn/learnSession.js";
import { decisionViewForWire } from "../../../../lib/learn/decisionWire.js";
import { tableSnapshot } from "../../../../lib/learn/tableSnapshot.js";
import { boardSnapshot } from "../../../../lib/learn/boardSnapshot.js";
import { enrichUnresolvedDecision } from "../../../../lib/learn/arbiterSeam.js";
import { putSession } from "../../../../lib/server/learnSessionStore.js";
import { loadSave } from "../../../../lib/server/learnSaveStore.js";
import { finishGame } from "../../../../lib/server/learnPersistence.js";
import { migrate, isResumable } from "../../../../lib/server/learnSaveSchema.js";
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

  const loaded = await loadSave(sessionId);
  if (!loaded.ok) {
    const status = loaded.reason === "not-found" ? 404 : 422;
    return Response.json(
      { error: `Could not load saved game (${loaded.reason}).`, reason: loaded.reason, resumable: false },
      { status }
    );
  }

  let doc;
  try {
    doc = migrate(loaded.saveDoc);
  } catch (error) {
    return Response.json(
      { error: "This game was saved on an older version and can't be continued. Start a new game.", reason: "unmigratable", resumable: false, detail: error.message },
      { status: 422 }
    );
  }

  if (!isResumable(doc)) {
    return Response.json(
      { error: "This game can't be resumed (it was saved mid-resolution or under an incompatible version).", resumable: false },
      { status: 422 }
    );
  }

  let advanced;
  try {
    // Re-derive the current decision rather than persisting it — decisions can
    // hold (formerly non-serializable) option data, and recomputing from the
    // pure, deterministic state is both safe and free.
    advanced = endEngineStoppedGame(advanceUntilDecision(doc.session, { policy: { playHints: loadPlayHints() || true } }));
  } catch (error) {
    return Response.json({ error: error.message || "Engine error resuming the game." }, { status: 500 });
  }

  putSession(advanced.session);
  // A game that is over on resume leaves play: its record is kept, its session freed and its save dropped. A game in
  // progress keeps its save as it is (the next move rewrites it). A record that can't be kept comes back as `saveFailure`.
  const saveFailure = isComplete(advanced.session) ? await finishGame(advanced.session) : null;

  return Response.json({
    sessionId: advanced.session.id,
    decision: decisionViewForWire(enrichUnresolvedDecision(advanced.decision, advanced.session.state)),
    status: advanced.session.status,
    mode: advanced.session.mode,
    difficulty: advanced.session.difficulty,
    turn: advanced.session.state.turn,
    activePlayer: advanced.session.state.activePlayer,
    step: advanced.session.state.step,
    decisionLogTail: filteredDecisionLogTail(advanced.session),
    table: tableSnapshot(advanced.session.state),
    board: boardSnapshot(advanced.session.state),
    resumed: true,
    ...(saveFailure ? { saveFailure } : {}),
  });
}
