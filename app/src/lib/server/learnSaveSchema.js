/**
 * learnSaveSchema.js — on-disk save-format contract for learn-session save/resume.
 *
 * Phase-7 PR-4a. Pure (no fs, no fetch). Owns:
 *  - CURRENT_SCHEMA_VERSION + an ordered, forward-only MIGRATIONS map.
 *  - isSerializable(session): the runtime guard that a session can be saved and
 *    restored losslessly (a closure anywhere in state would be silently dropped
 *    by JSON.stringify and corrupt resume).
 *  - checksum + verify (corruption guard).
 *  - migrate(): carry an older save forward; fail-closed (throw) on an unknown
 *    or future version so we never silently load a mismatched shape.
 *
 * CONTRACT-MIG: any later phase that changes the persisted game-state shape
 * (triggers add pendingTrigger payload data; layers add continuousEffects /
 * timestamps) MUST bump CURRENT_SCHEMA_VERSION and add a MIGRATIONS[old] entry
 * + a fixture round-trip test in the same PR.
 */

import { createHash } from "node:crypto";
import { containsFunction } from "../learn/serialization.js";

export const CURRENT_SCHEMA_VERSION = 2;

/**
 * Forward-only migrations: { [fromVersion]: (saveDoc) => saveDoc-at-fromVersion+1 }.
 * Each entry upgrades exactly one version and must be pure + total.
 */
export const MIGRATIONS = {
  // v1 → v2 — the CR 613 layers engine (Phase-7 PR-9) added continuous-effects
  // state to the game state. A v1 save predates it; default the new fields so it
  // resumes cleanly. `continuousEffects` (resolution effects — none in an old
  // save) and `timestampCounter` (the monotonic 613.7 source) seed empty/zero;
  // each permanent gets `timestamp: 0` (they all predate the counter, and every
  // Phase-1 layer effect is additive, so a uniform timestamp is order-neutral).
  1: (doc) => {
    const session = doc.session || {};
    const state = session.state || {};
    const players = state.players || {};
    const nextPlayers = {};
    for (const [pid, p] of Object.entries(players)) {
      const bf = Array.isArray(p?.battlefield) ? p.battlefield : [];
      nextPlayers[pid] = {
        ...p,
        battlefield: bf.map(perm =>
          (perm && typeof perm === "object" && perm.timestamp === undefined)
            ? { ...perm, timestamp: 0 }
            : perm,
        ),
      };
    }
    return {
      ...doc,
      schemaVersion: 2,
      session: {
        ...session,
        state: {
          ...state,
          continuousEffects: Array.isArray(state.continuousEffects) ? state.continuousEffects : [],
          timestampCounter: Number.isFinite(state.timestampCounter) ? state.timestampCounter : 0,
          players: nextPlayers,
        },
      },
    };
  },
};

export class SaveMigrationError extends Error {
  constructor(message) {
    super(message);
    this.name = "SaveMigrationError";
  }
}

/** Canonical JSON for checksumming (stable for a given object's key order). */
export function canonicalJson(value) {
  return JSON.stringify(value);
}

/** sha256 checksum of a session payload. */
export function checksumOf(session) {
  return "sha256:" + createHash("sha256").update(canonicalJson(session)).digest("hex");
}

/** True if saveDoc.checksum matches a fresh checksum of its session. */
export function verifyChecksum(saveDoc) {
  if (!saveDoc || typeof saveDoc.checksum !== "string") return false;
  return checksumOf(saveDoc.session) === saveDoc.checksum;
}

/**
 * Can this live session be serialized to disk losslessly AND read back? A
 * closure anywhere in state (the pre-Phase-7 onResolve blocker) would be
 * silently dropped by JSON.stringify and corrupt resume — reject it.
 * Returns { ok: boolean, reason?: string }.
 */
export function isSerializable(session) {
  if (!session || typeof session !== "object") return { ok: false, reason: "not-an-object" };
  if (containsFunction(session)) return { ok: false, reason: "live-closure-in-state" };
  try {
    JSON.parse(JSON.stringify(session));
  } catch {
    return { ok: false, reason: "non-serializable-field" };
  }
  return { ok: true };
}

/**
 * Carry a save document forward to CURRENT_SCHEMA_VERSION. Throws
 * SaveMigrationError on an unknown intermediate version or a future-schema doc
 * (fail-closed — never silently load a mismatched shape).
 */
export function migrate(saveDoc) {
  if (!saveDoc || typeof saveDoc.schemaVersion !== "number") {
    throw new SaveMigrationError("Save has no schemaVersion");
  }
  let doc = saveDoc;
  let guard = 0;
  while (doc.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const fn = MIGRATIONS[doc.schemaVersion];
    if (typeof fn !== "function") {
      throw new SaveMigrationError(`No migration from schema v${doc.schemaVersion}`);
    }
    doc = fn(doc);
    if (++guard > 64) throw new SaveMigrationError("Migration loop guard tripped");
  }
  if (doc.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new SaveMigrationError(`Save schema v${doc.schemaVersion} is newer than supported v${CURRENT_SCHEMA_VERSION}`);
  }
  return doc;
}

/** A save is resumable if it's at the current schema and was flagged serializable. */
export function isResumable(saveDoc) {
  return !!saveDoc && saveDoc.schemaVersion === CURRENT_SCHEMA_VERSION && saveDoc.serializable !== false;
}
