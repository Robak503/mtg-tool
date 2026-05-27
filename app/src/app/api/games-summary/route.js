/**
 * /api/games-summary?deckId=X — server-side aggregation of goldfish runs
 * for a specific deck. Returns the shape produced by summariseGameHistory()
 * over runs filtered by deckId. Used by GarfieldPanel and the
 * deck-context-builder for agent system prompts.
 *
 * Read-only. Returns { count: 0 } when no runs exist.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";
import path from "node:path";
import { summariseGameHistory } from "../../../lib/gameInsights";

const DATA_DIR = path.join(process.cwd(), "data");
const GAMES_DIR = path.join(DATA_DIR, "games");

function sanitiseId(value) {
  const stripped = String(value || "").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "");
  return stripped.slice(0, 64);
}

export async function GET(request) {
  const url = new URL(request.url);
  const deckIdRaw = url.searchParams.get("deckId");
  const deckId = deckIdRaw ? sanitiseId(deckIdRaw) : null;

  let files;
  try {
    files = await fs.readdir(GAMES_DIR);
  } catch (error) {
    if (error.code === "ENOENT") return Response.json({ count: 0 });
    return Response.json({ error: error.message }, { status: 500 });
  }

  const runs = [];
  for (const file of files) {
    if (!file.endsWith(".json") || file.endsWith(".tmp.json")) continue;
    // Cheap pre-filter on filename — speeds up large dirs when a deckId is given.
    if (deckId && !file.startsWith(`${deckId}-`)) continue;
    try {
      const raw = await fs.readFile(path.join(GAMES_DIR, file), "utf8");
      const parsed = JSON.parse(raw);
      if (deckId && parsed?.deckId !== deckId) continue;
      runs.push(parsed);
    } catch {
      // skip unreadable
    }
  }

  const insights = summariseGameHistory(runs);
  return Response.json(insights);
}
