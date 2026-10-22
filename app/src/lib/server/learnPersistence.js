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
 * record; a leftover save at worst lingers in the resume list until the profile's save pruning removes it (resuming
 * it re-derives the same end, and that pass removes it again).
 *
 * `persistAfterPlay` is the one step every play route takes after the engine (2026-10-22): a finished game —
 * a win, a draw, or a game one of the engine's guards stopped (learnSession.endEngineStoppedGame, status
 * "engine-stopped") — goes through `finishGame`, which keeps its record, frees the session and drops its save, so a
 * game that can't go on is never left in "Continue a game"; a game in progress is autosaved. The resume routes call
 * `finishGame` when the re-derived decision ends the game (a save from before 2026-10-22 whose game a guard had
 * stopped).
 */

import { autosaveSession, deleteSave } from "./learnSaveStore.js";
import { isSerializable } from "./learnSaveSchema.js";
import { appendGameRecord, recordFromSession } from "./gameRecordsStore.js";
import { deleteSession } from "./learnSessionStore.js";
import { isComplete, filteredDecisionLogTail, ENGINE_STOPPED } from "../learn/learnSession.js";

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

/**
 * A finished game leaves play: its record is kept (with a FULL narrative tail, up to the store's 160-line cap, for the
 * replay scrubber — not the 5-entry live strip), its session is freed and its in-flight save dropped. A game the engine
 * stopped is also named in the server log (server.err.log in the exe) with its guard's reason. Returns the record's
 * `saveFailure`, or null.
 */
export async function finishGame(session) {
  if (session.status === ENGINE_STOPPED) {
    console.warn(`[learn] the engine stopped game ${session.id} on turn ${session.engineStop?.turn ?? "?"} (${session.engineStop?.reason ?? "no reason"}) — ended, its record kept and its save removed`);
  }
  const saveFailure = await recordFinishedGame(recordFromSession(session, filteredDecisionLogTail(session, 160)));
  deleteSession(session.id);
  await dropFinishedGameSave(session.id);
  return saveFailure;
}

/** After a move: a finished game goes through finishGame; a game in progress is autosaved. Returns the `saveFailure`, or null. */
export async function persistAfterPlay(session) {
  return isComplete(session) ? finishGame(session) : autosaveForPlay(session);
}
