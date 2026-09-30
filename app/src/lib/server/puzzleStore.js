/**
 * puzzleStore.js — persistent user-authored puzzles (P9).
 *
 * A puzzle is a captured mid-game position: a serialized learn-session snapshot
 * plus a goal. Storage mirrors gameRecordsStore — a single JSON array at
 * profilePath("puzzles.json"), newest first, capped, atomic tmp+rename write.
 *
 * The snapshot is the SAME shape a save uses (a whole `session` with its pure
 * `state`), so it round-trips through the identical restore path the resume route
 * exercises (advanceUntilDecision on the deserialized session). Checksum + the
 * serialize/resumable guards are reused from learnSaveSchema so a puzzle can't be
 * saved with a live closure in state or loaded corrupt.
 */

import fs from "node:fs/promises";

import { profilePath } from "./paths.js";
import {
  CURRENT_SCHEMA_VERSION,
  checksumOf,
  verifyChecksum,
  isSerializable,
  isResumable,
  migrate,
} from "./learnSaveSchema.js";
import { normalizePuzzleGoal } from "../learn/puzzleGoal.js";
import { engineBuild } from "../learn/engineBuild.js";

const MAX_PUZZLES = 100;

function puzzlesFile() {
  return profilePath("puzzles.json");
}

/** All stored puzzle docs (full, with session). Corrupt/missing file → []. */
async function readAll() {
  try {
    const parsed = JSON.parse(await fs.readFile(puzzlesFile(), "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Slim list entry — everything the picker shows, WITHOUT the heavy session. */
function indexEntry(doc) {
  return {
    id: doc.id,
    createdAt: doc.createdAt,
    goal: doc.goal,
    label: doc.label || null,
    startTurn: doc.startTurn ?? null,
    mode: doc.session?.mode ?? null,
    difficulty: doc.session?.difficulty ?? null,
    meta: doc.session?.meta ?? doc.meta ?? null,
    resumable: doc.schemaVersion === CURRENT_SCHEMA_VERSION && doc.serializable !== false,
  };
}

/**
 * Build a puzzle doc from a LIVE session + goal. Pure. Returns
 * { ok, doc } or { ok:false, reason } when the session can't be snapshotted
 * (a live closure in state would be dropped by JSON and corrupt the reload).
 */
export function puzzleFromSession(session, { goal, label } = {}) {
  const ser = isSerializable(session);
  if (!ser.ok) return { ok: false, reason: ser.reason };
  const doc = {
    id: `puz_${Date.now().toString(36)}_${session?.id ? String(session.id).slice(-4) : "x"}`,
    kind: "learn-puzzle",
    schemaVersion: CURRENT_SCHEMA_VERSION,
    engineVersion: engineBuild(), // the build stamp (engineBuild.js) — npm_package_version was null in the exe
    createdAt: new Date().toISOString(),
    goal: normalizePuzzleGoal(goal),
    label: typeof label === "string" && label.trim() ? label.trim().slice(0, 120) : null,
    startTurn: session?.state?.turn ?? null,
    activePlayer: session?.state?.activePlayer ?? null,
    session,
    serializable: true,
    checksum: checksumOf(session),
  };
  return { ok: true, doc };
}

/** Append a puzzle doc (read-modify-write, newest first, capped). Returns the count. */
export async function savePuzzle(doc) {
  const file = puzzlesFile();
  const existing = await readAll();
  const next = [doc, ...existing.filter((p) => p?.id !== doc.id)].slice(0, MAX_PUZZLES);
  const tmp = `${file}.tmp`;
  await fs.mkdir(profilePath(), { recursive: true }).catch(() => {});
  await fs.writeFile(tmp, JSON.stringify(next));
  await fs.rename(tmp, file);
  return next.length;
}

/** Slim list of puzzles (newest first) for the picker. */
export async function listPuzzles() {
  const all = await readAll();
  return all.map(indexEntry);
}

/**
 * Load a full puzzle by id, migrated + integrity-checked, ready to restore.
 * { ok, doc } (doc.session is the snapshot to hand to advanceUntilDecision) or
 * { ok:false, reason } — "not-found" | "foreign" | "checksum" | "unmigratable" | "not-resumable".
 */
export async function getPuzzle(id) {
  const all = await readAll();
  const raw = all.find((p) => p?.id === id);
  if (!raw) return { ok: false, reason: "not-found" };
  if (raw.kind !== "learn-puzzle") return { ok: false, reason: "foreign" };
  if (!verifyChecksum(raw)) return { ok: false, reason: "checksum" };
  let doc;
  try {
    doc = migrate(raw);
  } catch (e) {
    return { ok: false, reason: "unmigratable", detail: e.message };
  }
  if (!isResumable(doc)) return { ok: false, reason: "not-resumable" };
  return { ok: true, doc };
}

/** Delete a puzzle by id. Returns the remaining count. */
export async function deletePuzzle(id) {
  const file = puzzlesFile();
  const existing = await readAll();
  const next = existing.filter((p) => p?.id !== id);
  const tmp = `${file}.tmp`;
  await fs.mkdir(profilePath(), { recursive: true }).catch(() => {});
  await fs.writeFile(tmp, JSON.stringify(next));
  await fs.rename(tmp, file);
  return next.length;
}
