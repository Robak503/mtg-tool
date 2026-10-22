/**
 * learnSaveStore.js — per-profile disk save/resume for learn sessions (Phase-7 PR-4a).
 *
 * Wraps serialization (state <-> JSON) with session-level concerns: schema
 * version, checksum, atomic write, a denormalized index, and pruning. All paths
 * resolve via profilePath() so saves are scoped to the active profile.
 *
 * Failures are never swallowed here. Writing the save, its index entry, or a
 * deletion throws to the caller; the play routes go through learnPersistence.js,
 * which logs the failure and reports it in the response (the Academy shows a
 * notice) without blocking the game. Pruning old saves is the one best-effort
 * step: its failures are logged and the new save still stands.
 * Resume re-hydrates the session into the in-memory store and the route
 * re-derives the current decision via advanceUntilDecision.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { profilePath } from "./paths.js";
import { sanitiseId } from "./sanitiseId.js";
import { atomicWriteJson, readJsonSafe } from "./atomicJson.js";
import { engineBuild } from "../learn/engineBuild.js";
import {
  CURRENT_SCHEMA_VERSION,
  checksumOf,
  verifyChecksum,
  isSerializable,
  isResumable,
  migrate,
} from "./learnSaveSchema.js";

const SAVES_DIR = () => profilePath("learn-sessions");
const INDEX_FILE = () => path.join(SAVES_DIR(), "index.json");

function envNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
const MAX_LEARN_SAVES = envNumber("MAX_LEARN_SAVES", 20);
const MAX_LEARN_SAVE_AGE_DAYS = envNumber("MAX_LEARN_SAVE_AGE_DAYS", 30);

function saveFilePath(sessionId) {
  return path.join(SAVES_DIR(), `${sanitiseId(sessionId)}.json`);
}

function opponentSummary(session) {
  return session?.mode === "commander" ? "3 opponents (pod)" : "1 opponent";
}

function indexEntryFromDoc(doc) {
  const s = doc.session || {};
  // Compute `resumable` against the MIGRATED doc, exactly as the resume route
  // does (loadSave → migrate → isResumable). Computing it on the raw on-disk doc
  // would report `resumable:false` for every save written by an older schema
  // (e.g. a v2 save after a v2→v3 bump) even though the resume route migrates and
  // resumes it fine — greying out the Resume button and stranding in-flight games.
  let migrated;
  try { migrated = migrate(doc); } catch { migrated = null; }
  return {
    sessionId: doc.sessionId,
    savedAt: doc.savedAt,
    createdAt: s.createdAt,
    difficulty: s.difficulty,
    mode: s.mode,
    status: s.status,
    turn: s.state?.turn,
    userDeckName: s.meta?.userDeckName || null,
    opponentSummary: opponentSummary(s),
    schemaVersion: doc.schemaVersion,
    engineVersion: doc.engineVersion,
    resumable: !!migrated && isResumable(migrated),
  };
}

function isSaveFile(name) {
  return name.endsWith(".json") && name !== "index.json" && !name.includes(".tmp.");
}

/**
 * Autosave a live session to disk. Returns the save doc (null for a session without an id). Throws when the save
 * file or the saved-games index (what the Resume list reads) can't be written. Pruning old saves afterwards is
 * best-effort: a failure there is logged and the new save stands.
 */
export async function autosaveSession(session) {
  if (!session?.id) return null;
  const ser = isSerializable(session);
  const saveDoc = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    engineVersion: engineBuild(), // the build stamp (engineBuild.js) — npm_package_version was null in the exe
    kind: "learn-session-save",
    savedAt: new Date().toISOString(),
    sessionId: session.id,
    session,
    serializable: ser.ok,
    checksum: checksumOf(session),
  };
  await fs.mkdir(SAVES_DIR(), { recursive: true });
  await atomicWriteJson(saveFilePath(session.id), saveDoc);
  await rebuildIndex();
  try {
    await pruneSaves();
  } catch (error) {
    console.error(`[learnSaveStore] pruning old Academy saves failed (the new save of ${session.id} stands):`, error);
  }
  return saveDoc;
}

/** Load a save by session id. { ok, saveDoc } or { ok:false, reason }. */
export async function loadSave(sessionId) {
  const doc = await readJsonSafe(saveFilePath(sessionId));
  if (!doc) return { ok: false, reason: "not-found" };
  if (doc.kind !== "learn-session-save") return { ok: false, reason: "foreign-file" };
  if (!verifyChecksum(doc)) return { ok: false, reason: "checksum" };
  return { ok: true, saveDoc: doc };
}

/**
 * List saves from the index. A missing or corrupt index self-heals from the save files; the list is served from
 * that scan even when the rebuilt index can't be written back (logged — the next autosave writes it again).
 */
export async function listSaves() {
  const idx = await readJsonSafe(INDEX_FILE());
  if (idx && Array.isArray(idx.saves)) return idx.saves;
  const files = await readSaveFolder();
  if (!files) return [];
  const rebuilt = await indexFromFiles(files);
  try {
    await atomicWriteJson(INDEX_FILE(), rebuilt);
  } catch (error) {
    console.error("[learnSaveStore] the rebuilt saved-games index could not be written (listed from the save files):", error);
  }
  return rebuilt.saves;
}

/** Delete a save file + refresh the index. A save that is already gone is fine; any other failure throws. */
export async function deleteSave(sessionId) {
  try {
    await fs.unlink(saveFilePath(sessionId));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await rebuildIndex();
  return true;
}

function emptyIndex() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    kind: "learn-session-index",
    updatedAt: new Date().toISOString(),
    saves: [],
  };
}

/** The save folder's entries, or null when it doesn't exist yet (no game saved). Any other failure throws. */
async function readSaveFolder() {
  try {
    return await fs.readdir(SAVES_DIR());
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function indexFromFiles(files) {
  const saves = [];
  for (const f of files) {
    if (!isSaveFile(f)) continue;
    const doc = await readJsonSafe(path.join(SAVES_DIR(), f));
    if (!doc || doc.kind !== "learn-session-save") continue;
    saves.push(indexEntryFromDoc(doc));
  }
  saves.sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
  return { ...emptyIndex(), saves };
}

/**
 * Rebuild the denormalized index by scanning the save files and write it. Returns the index. With no save folder
 * there is nothing to index and nothing is written. Throws when the folder can't be read or the index written.
 */
export async function rebuildIndex() {
  const files = await readSaveFolder();
  if (!files) return emptyIndex();
  const idx = await indexFromFiles(files);
  await atomicWriteJson(INDEX_FILE(), idx);
  return idx;
}

/**
 * Prune saves past the count cap (oldest first) + the age cap. Every deletion is attempted; then the index is
 * rebuilt if anything was deleted, and an AggregateError names the saves that could not be deleted.
 */
export async function pruneSaves() {
  const files = await readSaveFolder();
  if (!files) return;
  const docs = [];
  for (const f of files) {
    if (!isSaveFile(f)) continue;
    const full = path.join(SAVES_DIR(), f);
    const doc = await readJsonSafe(full);
    if (doc && doc.kind === "learn-session-save") docs.push({ full, savedAt: doc.savedAt });
  }
  docs.sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || ""))); // newest first
  const cutoff = MAX_LEARN_SAVE_AGE_DAYS > 0 ? Date.now() - MAX_LEARN_SAVE_AGE_DAYS * 86_400_000 : -Infinity;
  const deletions = [];
  docs.forEach((d, i) => {
    const overCount = MAX_LEARN_SAVES > 0 && i >= MAX_LEARN_SAVES;
    const t = Date.parse(d.savedAt);
    const tooOld = Number.isFinite(t) && t < cutoff;
    if (overCount || tooOld) deletions.push(d.full);
  });
  const results = await Promise.allSettled(deletions.map(p => fs.unlink(p)));
  const failures = results
    .filter(r => r.status === "rejected" && r.reason?.code !== "ENOENT") // already gone is pruned
    .map(r => r.reason);
  if (deletions.length) await rebuildIndex();
  if (failures.length) {
    throw new AggregateError(failures, `could not delete ${failures.length} of ${deletions.length} old save(s)`);
  }
}
