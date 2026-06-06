/**
 * GET /api/learn/saves
 *
 * Returns the resumable-game list for the active profile (denormalized index
 * entries — no full game state). Phase-7 PR-4a.
 *
 * Response: { saves: SaveIndexEntry[] }
 */

export const runtime = "nodejs";

import { listSaves } from "../../../../lib/server/learnSaveStore.js";

export async function GET() {
  try {
    const saves = await listSaves();
    return Response.json({ saves });
  } catch (error) {
    return Response.json({ error: error.message || "Could not list saved games." }, { status: 500 });
  }
}
