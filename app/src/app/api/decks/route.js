export const runtime = "nodejs";

import fs from "node:fs/promises";
import path from "node:path";

import { normalizeDeck } from "../../../lib/deck/deckMemory";
import { ensureDeckIds, hasDeckId } from "../../../lib/deck/deckIds";
import { activeProfileId, isValidProfileId, profilePath, profilesRegistryPath } from "../../../lib/server/paths";
import { ensureMigrated, readRegistry } from "../../../lib/server/profiles";
import { atomicWriteJson } from "../../../lib/server/atomicJson";

// Keep this many rolling auto-backups of the deck file (one per save) so a torn
// write or a junk overwrite always has a recent good state to auto-restore from.
const MAX_AUTO_BACKUPS = 10;
let autoBackupCounter = 0; // makes same-millisecond backup filenames distinct
// Names a *placeholder* library is made of — an empty set, or decks that are all
// obviously-generated stubs ("new1", "Untitled 2"…). A real deck name like
// "New Capenna Reanimator" won't match (the pattern is the WHOLE name). Used to
// detect the junk-restore that wiped the real decks on 2026-07-08.
const PLACEHOLDER_NAME = /^(new|untitled|test|deck|copy)\s*\d*$/i;
function isAllPlaceholder(decks) {
  return Array.isArray(decks) && decks.length > 0 && decks.every((d) => PLACEHOLDER_NAME.test(String(d?.name || "").trim()));
}
function isRealLibrary(decks) {
  return Array.isArray(decks) && decks.length > 0 && !isAllPlaceholder(decks);
}

// Resolve paths per-call (not captured at import) so a changed MTG_APP_ROOT
// is always honored — the packaged .exe sets it, and tests change it between
// cases. paths.js is the single source of truth for on-disk locations.
function deckFile() {
  return profilePath("decks.local.json");
}
function backupDir() {
  return profilePath("backups");
}
// Deck ids are derived per profile (lib/deck/deckIds.js): the same library always derives the same
// ids, and two profiles holding the same deck derive different ones.
function deckIdScope() {
  return activeProfileId() || "";
}

// Preserve (rename) the current on-disk deck file out of the way before we
// overwrite it during a recovery, so a bad file is never destroyed — the user
// (or a later session) can still inspect the .broken-/.displaced- copy.
async function preserveCurrent(target, suffix) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  try {
    await fs.rename(target, profilePath(`decks.local.${suffix}-${stamp}.json`));
  } catch {
    // rename failed (permissions / file in use): leave the file; the caller's
    // atomicWriteJson still replaces it with the recovered content.
  }
}

// Scan the profile's backups/ for the NEWEST backup (by mtime) that parses AND
// holds a real (non-empty, non-placeholder) library. Returns the decks or null.
async function restoreFromNewestGoodBackup() {
  const dir = backupDir();
  let files;
  try {
    files = await fs.readdir(dir);
  } catch {
    return null; // no backups dir yet
  }
  const candidates = files.filter((f) => f.endsWith(".json") && (f.startsWith("decks.autobackup-") || f.startsWith("decks.local.")));
  const stated = [];
  for (const f of candidates) {
    try {
      const st = await fs.stat(path.join(dir, f));
      stated.push({ f, mtime: st.mtimeMs });
    } catch {
      /* skip unreadable */
    }
  }
  stated.sort((a, b) => b.mtime - a.mtime); // newest first
  for (const { f } of stated) {
    try {
      const parsed = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
      const arr = Array.isArray(parsed) ? parsed : parsed.decks;
      const decks = Array.isArray(arr) ? arr.map(normalizeDeck) : null;
      if (isRealLibrary(decks)) return decks;
    } catch {
      /* skip a corrupt backup, keep looking */
    }
  }
  return null;
}

async function readDeckFile() {
  const target = deckFile();
  let raw;
  try {
    raw = await fs.readFile(target, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return []; // genuinely absent (fresh profile), not corruption
    throw error;
  }

  let decks;
  try {
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : parsed.decks;
    decks = Array.isArray(arr) ? arr.map(normalizeDeck) : null;
  } catch {
    decks = null; // unparseable (torn write, disk glitch)
  }

  if (isRealLibrary(decks)) return decks; // healthy — the common path

  // The file is unparseable, OR it parsed to an empty/placeholder set. Rather
  // than silently serve an empty/junk library (the 2026-07-08 incident: a torn
  // write parse-failed -> the store returned empty -> junk "new1"/"new2" decks
  // were written over the real ones), auto-restore from the newest GOOD backup.
  const restored = await restoreFromNewestGoodBackup();
  if (restored) {
    const suffix = decks === null ? "broken" : "displaced";
    await preserveCurrent(target, suffix); // keep the bad file for inspection; never destroy
    await atomicWriteJson(target, { version: 1, updatedAt: new Date().toISOString(), decks: restored });
    console.error(`[decks] RECOVERED ${restored.length} decks from backup after a ${suffix} deck file at ${target}`);
    return restored;
  }

  // No good backup to fall back on.
  if (decks === null) {
    // Corrupt with nothing to restore: preserve the .broken- copy (unchanged
    // behavior) and start empty rather than 500-ing every read forever.
    await preserveCurrent(target, "broken");
    console.error(`[decks] deck file was corrupt and no good backup was found — starting empty at ${target}`);
    return [];
  }
  // A valid empty/placeholder library with no better backup: respect it as-is
  // (a brand-new profile legitimately has zero decks).
  return decks;
}

// Roll the CURRENT good deck file into the backup ring BEFORE overwriting it, so
// there is always a recent restore point. Only snapshots a parseable, non-empty
// state (never archives junk over good history), and prunes to MAX_AUTO_BACKUPS.
async function rotateAutoBackup(target) {
  let raw;
  try {
    raw = await fs.readFile(target, "utf8");
  } catch {
    return; // nothing on disk yet (first-ever save)
  }
  let arr;
  try {
    const parsed = JSON.parse(raw);
    arr = Array.isArray(parsed) ? parsed : parsed.decks;
  } catch {
    return; // don't ring a corrupt file (recovery reads it via preserveCurrent instead)
  }
  if (!Array.isArray(arr) || arr.length === 0) return; // don't archive empties over real backups
  const dir = backupDir();
  await fs.mkdir(dir, { recursive: true });
  // Counter suffix so bursts of saves in the same millisecond produce DISTINCT
  // backup files (a bare ms stamp would collide and overwrite, shrinking the ring).
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  try {
    await fs.writeFile(path.join(dir, `decks.autobackup-${stamp}-${++autoBackupCounter}.json`), raw, "utf8");
  } catch {
    return; // a failed backup must never block the actual save
  }
  // Prune oldest auto-backups (manual reason-tagged backups are left untouched).
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.startsWith("decks.autobackup-") && f.endsWith(".json")).sort();
    const excess = files.slice(0, Math.max(0, files.length - MAX_AUTO_BACKUPS));
    await Promise.all(excess.map((f) => fs.rm(path.join(dir, f), { force: true }).catch(() => {})));
  } catch {
    /* pruning is best-effort */
  }
}

// Serialize writes through a promise chain so two concurrent saves (e.g. a
// debounced client save racing an import's save) can't interleave and
// silently clobber each other. One failed write must not poison the next.
let writeChain = Promise.resolve();

async function writeDeckFile(decks) {
  const run = writeChain.then(async () => {
    const target = deckFile();
    await fs.mkdir(path.dirname(target), { recursive: true });
    await rotateAutoBackup(target); // capture the pre-write good state first
    const payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      decks: decks.map(normalizeDeck),
    };
    // Crash-safe write: temp + fsync + rename (shared atomicJson helper), so a
    // crash mid-write never truncates the file and never promotes a torn temp.
    await atomicWriteJson(target, payload);
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

async function createBackup(reason, target = deckFile(), dir = backupDir()) {
  try {
    await fs.access(target);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }

  await fs.mkdir(dir, { recursive: true });
  const backupPath = path.join(dir, backupName(reason));
  await fs.copyFile(target, backupPath);
  return backupPath;
}

// ONE-TIME ID BACKFILL (2026-10-21). Every deck needs an `id` — the Academy pickers, the active deck,
// a chat's locked deck, the Sim Center and Pod Balance all key decks by it — but this route used to
// store whatever it was sent, and decks saved by a writer that never set one (the import preview's
// `{ name, format, source, cards }` posted with a `memory`) had none: 6 of the owner's 8 decks could not
// be picked in the Academy. A read that finds an id-less deck gives each one a derived id
// (lib/deck/deckIds.js) and rewrites that deck file once, through the write chain (so it can't
// interleave with a save), after copying the original into that profile's backups/
// (`decks.local.<stamp>.deck-id-backfill.json`, never pruned). It re-reads the file inside the chain:
// a concurrent read that already backfilled leaves nothing to do. Only the ids are added; each deck is
// otherwise written back exactly as it was. Returns the library as now on disk (normalized), or null
// when there is no parseable library to backfill (absent, or replaced by a torn write since the read —
// readDeckFile's recovery owns that).
async function backfillDeckIds({ target = deckFile(), dir = backupDir(), scope = deckIdScope() } = {}) {
  const run = writeChain.then(async () => {
    let raw;
    try {
      raw = await fs.readFile(target, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null; // torn since the read: the next read's recovery path handles it
    }
    const stored = Array.isArray(parsed) ? parsed : parsed?.decks;
    if (!Array.isArray(stored)) return null;
    const { decks, assigned } = ensureDeckIds(stored, { scope });
    if (!assigned.length) return stored.map(normalizeDeck);
    const backupPath = await createBackup("deck-id-backfill", target, dir);
    const envelope = Array.isArray(parsed) ? { version: 1 } : parsed;
    await atomicWriteJson(target, { ...envelope, updatedAt: new Date().toISOString(), decks });
    console.log(
      `[decks] gave ${assigned.length} saved deck(s) in ${target} an id: ${assigned.map((a) => `"${a.name}" → ${a.id}`).join(", ")} — the original deck file is kept at ${backupPath}`,
    );
    return decks.map(normalizeDeck);
  });
  writeChain = run.then(() => {}, () => {});
  return run;
}

// Serve a library in which every deck has an id. A failed backfill must not take the library away
// (that would be a worse outage than the bug), and it is not hidden: it is logged, and the decks are
// served with the ids the backfill derives — the same ids a later read persists (they are derived
// from the library, not random), and the ids the client's next save writes back.
async function withDeckIds(decks) {
  if (decks.every(hasDeckId)) return decks;
  try {
    const backfilled = await backfillDeckIds();
    if (backfilled) return backfilled;
  } catch (error) {
    console.error(
      `[decks] could not save ids for the decks that lack one (${error?.message || error}) — serving them with their derived ids; the next read retries the write`,
    );
  }
  return ensureDeckIds(decks, { scope: deckIdScope() }).decks;
}

// The other profiles' libraries, once per server process. The Sim Center, Pod Balance, the Crucible and
// the A/B bench pick decks from EVERY profile by id (selfPlayDecks.listAllProfileDecks), so a profile
// that is never opened would otherwise keep its id-less decks unpickable there. Each profile derives
// with its own id as the scope — what that profile's own reads would derive. A failure is logged and
// retried on the next read; it never blocks the active profile's library.
let otherProfilesBackfilled = false;
async function backfillOtherProfilesOnce() {
  if (otherProfilesBackfilled) return;
  let ok = true;
  try {
    const reg = readRegistry();
    const active = activeProfileId();
    const profilesDir = path.join(path.dirname(profilesRegistryPath()), "profiles");
    for (const p of reg?.profiles || []) {
      if (!isValidProfileId(p?.id) || p.id === active) continue;
      const folder = path.join(profilesDir, p.id);
      try {
        await backfillDeckIds({ target: path.join(folder, "decks.local.json"), dir: path.join(folder, "backups"), scope: p.id });
      } catch (error) {
        ok = false;
        console.error(`[decks] could not give the id-less decks of profile ${p.name || p.id} their ids (${error?.message || error}); the next read retries`);
      }
    }
  } catch (error) {
    ok = false;
    console.error(`[decks] could not read the profiles registry to give every profile's decks their ids (${error?.message || error}); the next read retries`);
  }
  otherProfilesBackfilled = ok;
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
    const decks = await withDeckIds(await readDeckFile());
    await backfillOtherProfilesOnce();
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
    // (deck seeding no longer exists; the client owns the full library state) —
    // except that a deck sent without an id is given one: an id-less deck can't be
    // picked anywhere. The id is derived, so re-sending the same id-less library
    // (an outside script, a window opened before the backfill) lands on the same ids.
    const { decks, assigned } = ensureDeckIds(body.decks.map(normalizeDeck), { scope: deckIdScope() });
    if (assigned.length) {
      console.log(`[decks] a save sent ${assigned.length} deck(s) without an id; gave them ids: ${assigned.map((a) => `"${a.name}" → ${a.id}`).join(", ")}`);
    }
    const backupPath = body.createBackup ? await createBackup(body.reason || "manual") : null;
    const saved = await writeDeckFile(decks);

    return Response.json({ decks: saved, path: deckFile(), backupPath });
  } catch (error) {
    return Response.json({ error: error.message || "Could not save deck file." }, { status: 500 });
  }
}
