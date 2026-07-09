/**
 * atomicJson.js — crash-safe JSON file IO, shared by the games + learn-save stores.
 *
 * Extracted from /api/games (Phase-7 PR-4a). Writing to a temp file then
 * renaming is atomic on the same volume (NTFS + POSIX), so a crash mid-write
 * leaves either the old good file or the new good file, never a torn one.
 */

import fs from "node:fs/promises";
import path from "node:path";

// Monotonic within-process counter so two writers in the SAME millisecond never
// share a temp file. A shared temp is exactly how a small write left the trailing
// bytes of a larger earlier write and produced a valid-JSON-plus-garbage file
// (the 2026-07-08 deck corruption): pid alone isn't enough, and pid+Date.now()
// collides on sub-millisecond bursts.
let writeCounter = 0;

/**
 * Write `payload` as pretty JSON to `filePath` atomically (temp + fsync + rename).
 * Creates the parent directory if needed. Throws on IO failure (e.g. ENOSPC)
 * so callers can surface disk-full distinctly.
 *
 * fsync BEFORE the rename is load-bearing: without it, `writeFile` only hands the
 * bytes to the OS page cache, so a crash/power-loss just after the rename can
 * promote a temp whose contents were never flushed — a torn file. fsync forces
 * the bytes to the platter first, then the rename atomically swaps the fully
 * durable temp over the target.
 */
export async function atomicWriteJson(filePath, payload) {
  const body = JSON.stringify(payload, null, 2);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}.${++writeCounter}`;
  const fh = await fs.open(tmp, "w");
  try {
    await fh.writeFile(body, "utf8");
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fs.rename(tmp, filePath);
}

/**
 * Read + parse JSON from `filePath`, returning `null` on a missing file or a
 * parse error (never throws). The caller decides whether null means "absent"
 * or "corrupt" from context.
 */
export async function readJsonSafe(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
