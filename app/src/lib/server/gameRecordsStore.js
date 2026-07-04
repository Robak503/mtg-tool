/**
 * gameRecordsStore.js — persistent completed-game records (P2 v1, closes the
 * "Academy deletes finished games" gap flagged as open question Q8).
 *
 * Storage: profilePath("learn-records.json") — a single JSON array, newest
 * first, capped so the file can't grow unbounded. Writes are read-modify-write
 * via tmp+rename (single local user; the Academy finishes one game at a time).
 * Every field is copied defensively — a record is written best-effort and must
 * NEVER block or fail the game-over response.
 */

import fs from "node:fs/promises";

import { profilePath } from "./paths.js";

const MAX_RECORDS = 300;
const MAX_LOG_LINES = 160;

function recordsFile() {
  return profilePath("learn-records.json");
}

export async function listGameRecords() {
  try {
    const parsed = JSON.parse(await fs.readFile(recordsFile(), "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Build a compact GameRecord from a terminal Academy session. Pure + total:
 * unknown fields become nulls, the log is tail-capped, nothing throws.
 */
export function recordFromSession(session, logTail) {
  const meta = session?.meta && typeof session.meta === "object" ? session.meta : null;
  return {
    id: session?.id || `rec_${Date.now().toString(36)}`,
    endedAt: new Date().toISOString(),
    source: "academy",
    status: session?.status ?? null,          // e.g. user-wins / ai-wins / draw
    difficulty: session?.difficulty ?? null,
    turns: session?.state?.turn ?? null,
    meta,                                      // deck names / seats as the session carried them
    logTail: Array.isArray(logTail) ? logTail.slice(-MAX_LOG_LINES) : [],
  };
}

export async function appendGameRecord(record) {
  const file = recordsFile();
  const existing = await listGameRecords();
  const next = [record, ...existing.filter((r) => r?.id !== record.id)].slice(0, MAX_RECORDS);
  const tmp = `${file}.tmp`;
  await fs.mkdir(profilePath(), { recursive: true }).catch(() => {});
  await fs.writeFile(tmp, JSON.stringify(next));
  await fs.rename(tmp, file);
  return next.length;
}
