/**
 * POST /api/learn/resume-puzzle  { puzzleId }
 *
 * Load a saved puzzle's captured position into a FRESH in-memory session and
 * re-derive its current decision — the same restore path /api/learn/resume uses
 * (advanceUntilDecision on the pure, deserialized state), but sourced from the
 * puzzle store and NOT sharing the original game's session id (so re-attempting a
 * puzzle never collides with a live game or a save). Same response envelope as
 * /start + /resume so the client reuses one code path, plus a `puzzle` block the
 * UI needs for the goal check.
 *
 * NB: this is a NEW route — the default deck-based /api/learn/start path is
 * untouched, so it stays byte-identical (the engine trajectory can't move).
 *
 * Errors: 400 bad body · 404 no puzzle · 422 corrupt/unmigratable · 500 engine error.
 */

export const runtime = "nodejs";

import { randomUUID } from "node:crypto";

import { advanceUntilDecision } from "../../../../lib/learn/learnSession.js";
import { decisionViewForWire } from "../../../../lib/learn/decisionWire.js";
import { tableSnapshot } from "../../../../lib/learn/tableSnapshot.js";
import { boardSnapshot } from "../../../../lib/learn/boardSnapshot.js";
import { enrichUnresolvedDecision } from "../../../../lib/learn/arbiterSeam.js";
import { putSession } from "../../../../lib/server/learnSessionStore.js";
import { getPuzzle } from "../../../../lib/server/puzzleStore.js";
import { loadPlayHints } from "../../../../lib/server/playHintsLedger.js"; // PLAY-HINTS (2026-08-12) — parked cards get a play identity

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const puzzleId = body?.puzzleId;
  if (!puzzleId || typeof puzzleId !== "string") {
    return Response.json({ error: "puzzleId required." }, { status: 400 });
  }

  const loaded = await getPuzzle(puzzleId);
  if (!loaded.ok) {
    const status = loaded.reason === "not-found" ? 404 : 422;
    return Response.json({ error: `Could not load puzzle (${loaded.reason}).`, reason: loaded.reason }, { status });
  }

  // Restore into a FRESH session id — a puzzle attempt is a new, throwaway game;
  // it must not overwrite the original save or clobber another attempt.
  const snapshot = loaded.doc.session;
  const session = {
    ...snapshot,
    id: `puzsess_${randomUUID()}`,
    meta: { ...(snapshot.meta || null), puzzleId: loaded.doc.id },
  };

  let advanced;
  try {
    advanced = advanceUntilDecision(session, { policy: { playHints: loadPlayHints() || true } });
  } catch (error) {
    return Response.json({ error: error.message || "Engine error loading the puzzle." }, { status: 500 });
  }

  putSession(advanced.session);

  return Response.json({
    sessionId: advanced.session.id,
    decision: decisionViewForWire(enrichUnresolvedDecision(advanced.decision, advanced.session.state)),
    status: advanced.session.status,
    mode: advanced.session.mode,
    difficulty: advanced.session.difficulty,
    turn: advanced.session.state.turn,
    activePlayer: advanced.session.state.activePlayer,
    step: advanced.session.state.step,
    table: tableSnapshot(advanced.session.state),
    board: boardSnapshot(advanced.session.state),
    puzzle: { id: loaded.doc.id, goal: loaded.doc.goal, startTurn: loaded.doc.startTurn },
  });
}
