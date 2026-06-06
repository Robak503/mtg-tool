/**
 * atomicJson.js — crash-safe JSON file IO, shared by the games + learn-save stores.
 *
 * Extracted from /api/games (Phase-7 PR-4a). Writing to a temp file then
 * renaming is atomic on the same volume (NTFS + POSIX), so a crash mid-write
 * leaves either the old good file or the new good file, never a torn one.
 */

import fs from "node:fs/promises";
import path from "node:path";

/**
 * Write `payload` as pretty JSON to `filePath` atomically (temp + rename).
 * Creates the parent directory if needed. Throws on IO failure (e.g. ENOSPC)
 * so callers can surface disk-full distinctly.
 */
export async function atomicWriteJson(filePath, payload) {
  const body = JSON.stringify(payload, null, 2);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, body, "utf8");
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
