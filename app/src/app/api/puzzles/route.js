/**
 * /api/puzzles — user-authored puzzles (P9).
 *
 * POST { sessionId, goal?, label? }
 *   Capture the LIVE session's current position as a puzzle. The server holds the
 *   session in memory (a game in progress), so the client sends only the id — the
 *   whole state never crosses the wire. 404 if the session is gone (finished /
 *   evicted); 422 if the state can't be snapshotted losslessly.
 *   → { id, count }
 *
 * GET            → { puzzles: SlimEntry[] }   (newest first, no session payload)
 * GET ?id=<id>   → { puzzle: FullDoc }        (with the session snapshot)
 */

export const runtime = "nodejs";

import { getSession } from "../../../lib/server/learnSessionStore.js";
import { puzzleFromSession, savePuzzle, listPuzzles, getPuzzle } from "../../../lib/server/puzzleStore.js";

export async function GET(request) {
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const loaded = await getPuzzle(id);
    if (!loaded.ok) {
      const status = loaded.reason === "not-found" ? 404 : 422;
      return Response.json({ error: `Could not load puzzle (${loaded.reason}).`, reason: loaded.reason }, { status });
    }
    return Response.json({ puzzle: loaded.doc });
  }
  return Response.json({ puzzles: await listPuzzles() });
}

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
    return Response.json({ error: "No active game with that id — a puzzle can only be captured mid-game." }, { status: 404 });
  }

  const built = puzzleFromSession(session, { goal: body.goal, label: body.label });
  if (!built.ok) {
    return Response.json({ error: `This position can't be saved as a puzzle (${built.reason}).`, reason: built.reason }, { status: 422 });
  }

  let count;
  try {
    count = await savePuzzle(built.doc);
  } catch (e) {
    return Response.json({ error: e.message || "Could not save the puzzle." }, { status: 500 });
  }
  return Response.json({ id: built.doc.id, count });
}
