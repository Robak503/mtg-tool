/**
 * learnPersistence.js — what the Academy's play routes (start, step, choose, continue, mulligan) do with disk
 * after a move: autosave a game in progress; when it ends, keep its record and drop its in-flight save.
 *
 * None of it may block play, and none of it may fail silently (CLAUDE.md §1.2 / §8). Until 2026-10-21 each route
 * wrapped these calls in an empty catch, which is how every Academy autosave failed unseen from v0.161.0 on (a
 * bundling bug in engineBuild.js threw inside autosaveSession). Now every failure is logged with its error —
 * console.error reaches server.err.log in the packaged app — and the two a person loses something to come back
 * as a `saveFailure` the route puts in its response, which the Academy shows as a dismissible notice:
 *   - "autosave": the game in progress isn't (fully) on disk, so it may not survive a restart;
 *   - "game-record": the finished game's record wasn't kept, so it won't appear in the Crucible's records.
 * Dropping a finished game's in-flight save is cleanup and only logs: the game is over and its result is in the
 * record; a leftover save at worst lingers in the resume list until the profile's save pruning removes it.
 */

import { autosaveSession, deleteSave } from "./learnSaveStore.js";
import { isSerializable } from "./learnSaveSchema.js";
import { appendGameRecord } from "./gameRecordsStore.js";

function messageOf(error) {
  return error?.message || String(error);
}

/**
 * Autosave a game in progress. Returns null when it is saved and resumable, or a `saveFailure` for the response:
 * { kind: "autosave", detail } — the write failed, or the game was written but can't be resumed from it.
 */
export async function autosaveForPlay(session) {
  let saveDoc;
  try {
    saveDoc = await autosaveSession(session);
  } catch (error) {
    console.error(`[learn] autosave failed for ${session?.id} — the game goes on, but may not survive a restart:`, error);
    return { kind: "autosave", detail: messageOf(error) };
  }
  if (saveDoc && saveDoc.serializable === false) {
    const reason = isSerializable(session).reason || "not serializable";
    console.error(`[learn] autosave of ${session.id} wrote a save that can't be resumed (${reason})`);
    return { kind: "autosave", detail: `the saved game can't be resumed (${reason})` };
  }
  return null;
}

/** Keep a finished game's record. Returns null when kept, or { kind: "game-record", detail }. */
export async function recordFinishedGame(record) {
  try {
    await appendGameRecord(record);
    return null;
  } catch (error) {
    console.error(`[learn] the record of finished game ${record?.id} could not be saved:`, error);
    return { kind: "game-record", detail: messageOf(error) };
  }
}

/** Drop a finished game's in-flight save. Cleanup: a failure is logged, never shown and never thrown. */
export async function dropFinishedGameSave(sessionId) {
  try {
    await deleteSave(sessionId);
  } catch (error) {
    console.error(`[learn] the in-flight save of finished game ${sessionId} could not be removed (it may linger in the resume list):`, error);
  }
}
