/**
 * learnSaveStore.js — per-profile disk save/resume for learn sessions (Phase-7 PR-4a).
 *
 * Wraps serialization (state <-> JSON) with session-level concerns: schema
 * version, checksum, atomic write, a denormalized index, and pruning. All paths
 * resolve via profilePath() so saves are scoped to the active profile.
 *
 * Autosave is fire-and-forget from the routes; a failed save never breaks a live
 * game. Resume re-hydrates the session into the in-memory store and the route
 * re-derives the current decision via advanceUntilDecision.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { profilePath } from "./paths.js";
import { sanitiseId } from "./sanitiseId.js";
import { atomicWriteJson, readJsonSafe } from "./atomicJson.js";
import {
  CURRENT_SCHEMA_VERSION,
  checksumOf,
  verifyChecksum,
  isSerializable,
  isResumable,
} from "./learnSaveSchema.js";

const SAVES_DIR = () => profilePath("learn-sessions");
const INDEX_FILE = () => path.join(SAVES_DIR(), "index.json");
const ENGINE_VERSION = process.env.npm_package_version || null;

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
    resumable: isResumable(doc),
  };
}

function isSaveFile(name) {
  return name.endsWith(".json") && name !== "index.json" && !name.includes(".tmp.");
}

/** Autosave a live session to disk. Returns the save doc, or null if it couldn't. */
export async function autosaveSession(session) {
  if (!session?.id) return null;
  const ser = isSerializable(session);
  const saveDoc = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    kind: "learn-session-save",
    savedAt: new Date().toISOString(),
    sessionId: session.id,
    session,
    serializable: ser.ok,
    checksum: checksumOf(session),
  };
  await fs.mkdir(SAVES_DIR(), { recursive: true });
  await atomicWriteJson(saveFilePath(session.id), saveDoc);
  await rebuildIndex().catch(() => {});
  await pruneSaves().catch(() => {});
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

/** List saves from the index (self-heals by rebuilding if missing/corrupt). */
export async function listSaves() {
  let idx = await readJsonSafe(INDEX_FILE());
  if (!idx || !Array.isArray(idx.saves)) idx = await rebuildIndex();
  return idx?.saves || [];
}

/** Delete a save file + refresh the index. */
export async function deleteSave(sessionId) {
  await fs.unlink(saveFilePath(sessionId)).catch(() => {});
  await rebuildIndex().catch(() => {});
  return true;
}

/** Rebuild the denormalized index by scanning the save files. Returns the index. */
export async function rebuildIndex() {
  const emptyIdx = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    kind: "learn-session-index",
    updatedAt: new Date().toISOString(),
    saves: [],
  };
  let files;
  try {
    files = await fs.readdir(SAVES_DIR());
  } catch {
    return emptyIdx;
  }
  const saves = [];
  for (const f of files) {
    if (!isSaveFile(f)) continue;
    const doc = await readJsonSafe(path.join(SAVES_DIR(), f));
    if (!doc || doc.kind !== "learn-session-save") continue;
    saves.push(indexEntryFromDoc(doc));
  }
  saves.sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
  const idx = { ...emptyIdx, saves };
  await atomicWriteJson(INDEX_FILE(), idx).catch(() => {});
  return idx;
}

/** Prune saves past the count cap (oldest first) + the age cap. */
export async function pruneSaves() {
  let files;
  try {
    files = await fs.readdir(SAVES_DIR());
  } catch {
    return;
  }
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
  await Promise.all(deletions.map(p => fs.unlink(p).catch(() => {})));
  if (deletions.length) await rebuildIndex().catch(() => {});
}
