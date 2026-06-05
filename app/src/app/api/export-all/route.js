/**
 * /api/export-all — download every bit of the user's work as one JSON backup
 * (K1, PLAN I1). Decks, chats, collection, grails, agent notes, feedback, and
 * game records — for machine migration or a paranoia backup.
 *
 * Read-only + best-effort: any missing file/dir is simply absent from the
 * bundle. No secrets, env, or API keys are included.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";
import path from "node:path";

import { dataPath, profilePath } from "../../../lib/server/paths.js";
import { buildUserDataBundle } from "../../../lib/server/userDataExport.js";

// Per-profile files resolve via profilePath; feedback (global, dev-facing) uses dataPath.
async function readJsonFile(rel) {
  try {
    return JSON.parse(await fs.readFile(profilePath(rel), "utf8"));
  } catch {
    return null;
  }
}

async function readJsonDir(rel, resolve = dataPath) {
  const dir = resolve(rel);
  let names;
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(await fs.readFile(path.join(dir, name), "utf8")));
    } catch {
      /* skip unreadable entry */
    }
  }
  return out;
}

export async function GET() {
  try {
    const [decks, chats, collection, watchlist, priceAlerts, agentNotes, feedback, games] = await Promise.all([
      readJsonFile("decks.local.json"),
      readJsonFile("chats.local.json"),
      readJsonFile("collection.json"),
      readJsonFile("watchlist.json"),
      readJsonFile("price-alerts.json"),
      readJsonFile("agent-notes.local.json"),
      readJsonDir("feedback"),
      readJsonDir("games", profilePath),
    ]);

    const bundle = buildUserDataBundle({ decks, chats, collection, watchlist, priceAlerts, agentNotes, feedback, games });
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(bundle, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="mtg-tool-backup-${stamp}.json"`,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message || "Export failed." }, { status: 500 });
  }
}
