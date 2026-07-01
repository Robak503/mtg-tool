/**
 * /api/export-all — download every bit of the user's work as one JSON backup
 * (K1, PLAN I1). Decks, chats, collection, grails, agent notes, feedback, and
 * game records — for machine migration or a paranoia backup.
 *
 * Read-only + best-effort: a missing file/dir is simply absent from the
 * bundle (normal for unused features), but an UNREADABLE section is not
 * silently dropped — bundle.sectionStatus records {ok:false, error} per
 * section so a backup taken over a corrupt/locked file is detectable instead
 * of masquerading as a complete backup (S-P2-2). The restore path ignores
 * sectionStatus and keeps tolerating absent sections. No secrets, env, or
 * API keys are included.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";
import path from "node:path";

import { dataPath, profilePath } from "../../../lib/server/paths.js";
import { buildUserDataBundle } from "../../../lib/server/userDataExport.js";

// Per-profile files resolve via profilePath; feedback (global, dev-facing) uses
// dataPath. Each reader returns { data, status }: data keeps the old shape
// (null / [] on failure) so the bundle layout is unchanged; status makes the
// failure mode explicit — { ok: true } (present or legitimately absent) vs
// { ok: false, error } (exists but unreadable/corrupt).
async function readJsonFile(rel) {
  try {
    return { data: JSON.parse(await fs.readFile(profilePath(rel), "utf8")), status: { ok: true } };
  } catch (error) {
    if (error?.code === "ENOENT") return { data: null, status: { ok: true, absent: true } };
    return { data: null, status: { ok: false, error: String(error?.message || error) } };
  }
}

async function readJsonDir(rel, resolve = dataPath) {
  const dir = resolve(rel);
  let names;
  try {
    names = await fs.readdir(dir);
  } catch (error) {
    if (error?.code === "ENOENT") return { data: [], status: { ok: true, absent: true } };
    return { data: [], status: { ok: false, error: String(error?.message || error) } };
  }
  const out = [];
  const errors = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(await fs.readFile(path.join(dir, name), "utf8")));
    } catch (error) {
      errors.push(`${name}: ${String(error?.message || error)}`);
    }
  }
  return { data: out, status: errors.length ? { ok: false, error: errors.join("; ") } : { ok: true } };
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

    const bundle = buildUserDataBundle({
      decks: decks.data,
      chats: chats.data,
      collection: collection.data,
      watchlist: watchlist.data,
      priceAlerts: priceAlerts.data,
      agentNotes: agentNotes.data,
      feedback: feedback.data,
      games: games.data,
    });
    // Bundle metadata, not restorable data: which sections were readable at
    // export time. import-all ignores unknown top-level keys.
    bundle.sectionStatus = {
      decks: decks.status,
      chats: chats.status,
      collection: collection.status,
      watchlist: watchlist.status,
      priceAlerts: priceAlerts.status,
      agentNotes: agentNotes.status,
      feedback: feedback.status,
      games: games.status,
    };
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
