export const runtime = "nodejs";

import fs from "node:fs/promises";
import path from "node:path";

import { normalizeDeck } from "../../../lib/deck/deckMemory";
import { profilePath } from "../../../lib/server/paths";
import { ensureMigrated } from "../../../lib/server/profiles";

// Resolve paths per-call (not captured at import) so a changed MTG_APP_ROOT
// is always honored — the packaged .exe sets it, and tests change it between
// cases. paths.js is the single source of truth for on-disk locations.
function deckFile() {
  return profilePath("decks.local.json");
}
function backupDir() {
  return profilePath("backups");
}

async function readDeckFile() {
  const target = deckFile();
  let raw;
  try {
    raw = await fs.readFile(target, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  try {
    const parsed = JSON.parse(raw);
    const decks = Array.isArray(parsed) ? parsed : parsed.decks;
    return Array.isArray(decks) ? decks.map(normalizeDeck) : [];
  } catch {
    // Corrupted JSON (interrupted write, disk glitch). Back up the broken
    // file and start empty rather than 500-ing every deck read forever.
    // Nothing re-seeds the library (the old starter-deck seed is gone): the
    // user recovers via the renamed .broken-* copy or a saved backup.
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    try {
      await fs.rename(target, profilePath(`decks.local.broken-${stamp}.json`));
    } catch {
      // If the rename fails (permissions, file in use), leave the broken file
      // alone — the empty list still loads and the next write replaces it.
    }
    return [];
  }
}

// Serialize writes through a promise chain so two concurrent saves (e.g. a
// debounced client save racing an import's save) can't interleave and
// silently clobber each other. One failed write must not poison the next.
let writeChain = Promise.resolve();

async function writeDeckFile(decks) {
  const run = writeChain.then(async () => {
    await fs.mkdir(path.dirname(deckFile()), { recursive: true });
    const payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      decks: decks.map(normalizeDeck),
    };
    const target = deckFile();
    // Atomic temp + rename so a crash mid-write never truncates the file.
    // Unique tmp name avoids two concurrent writers sharing one temp file.
    const tmp = `${target}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tmp, JSON.stringify(payload, null, 2), "utf8");
    await fs.rename(tmp, target);
    return payload.decks;
  });
  writeChain = run.then(() => {}, () => {});
  return run;
}

function backupName(reason = "manual") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const cleanReason = String(reason).replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "manual";
  return `decks.local.${stamp}.${cleanReason}.json`;
}

async function createBackup(reason) {
  const target = deckFile();
  try {
    await fs.access(target);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }

  const dir = backupDir();
  await fs.mkdir(dir, { recursive: true });
  const backupPath = path.join(dir, backupName(reason));
  await fs.copyFile(target, backupPath);
  return backupPath;
}

export async function GET() {
  try {
    // Run the one-time profiles migration to completion FIRST. ensureMigrated()
    // is fully synchronous + idempotent, so the first request to call it (this
    // route or /api/profiles) finishes the migration atomically before Node
    // yields — no route ever reads the legacy flat deck file via profilePath's
    // pre-migration fallback and writes it into the active profile (the race
    // that would clobber a freshly-split profile on upgrade).
    ensureMigrated();
    const decks = await readDeckFile();
    return Response.json({ decks, path: deckFile() });
  } catch (error) {
    return Response.json({ error: error.message || "Could not load deck file." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    ensureMigrated();
    const body = await request.json();
    if (!Array.isArray(body.decks)) {
      return Response.json({ error: "Request body must include a decks array." }, { status: 400 });
    }

    // Save exactly what the client sends — no server-side merging of any kind
    // (deck seeding no longer exists; the client owns the full library state).
    const decks = body.decks.map(normalizeDeck);
    const backupPath = body.createBackup ? await createBackup(body.reason || "manual") : null;
    const saved = await writeDeckFile(decks);

    return Response.json({ decks: saved, path: deckFile(), backupPath });
  } catch (error) {
    return Response.json({ error: error.message || "Could not save deck file." }, { status: 500 });
  }
}
