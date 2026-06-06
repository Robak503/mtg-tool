/**
 * POST /api/learn/saves/delete  { sessionId }
 *
 * Deletes a saved game for the active profile. Phase-7 PR-4a.
 *
 * Response: { ok: true }
 */

export const runtime = "nodejs";

import { deleteSave } from "../../../../../lib/server/learnSaveStore.js";

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

  try {
    await deleteSave(sessionId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message || "Could not delete saved game." }, { status: 500 });
  }
}
