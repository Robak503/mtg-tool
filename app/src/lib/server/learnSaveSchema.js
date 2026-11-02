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

export const CURRENT_SCHEMA_VERSION = 8;

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

  // v2 → v3 — Phase-2 P2.1 added a TRANSIENT `state.pendingArbiter` flag (the
  // unresolved→Arbiter seam). It is absent-by-default and absent === "no pending
  // ruling", so a v2 save needs no field backfill — an old in-flight game simply
  // resumes with no pause, which is correct. This migration only stamps the
  // version forward so pre-v0.26 saves stay resumable. (CONTRACT-MIG.)
  2: (doc) => ({ ...doc, schemaVersion: 3 }),

  // v3 → v4 — the interactive-tutor slice added a DURABLE `state.rngSeed` (the
  // threaded deterministic-shuffle seed). Unlike pendingArbiter it is NOT transient:
  // shuffles read + advance it, so a pre-v4 save (no field) must get an EXPLICIT
  // seed rather than relying on the read-side `?? 0` fallback — otherwise the on-disk
  // shape is ambiguous (a v4 doc without rngSeed vs one with rngSeed:0). Backfill 0
  // (= a fresh game's seed). The transient `state.pendingChoice` (resolution-time tutor
  // pause) is absent-by-default like pendingArbiter, so it needs no backfill. (CONTRACT-MIG.)
  3: (doc) => {
    const session = doc.session || {};
    const state = session.state || {};
    return {
      ...doc,
      schemaVersion: 4,
      session: {
        ...session,
        state: { ...state, rngSeed: Number.isFinite(state.rngSeed) ? state.rngSeed : 0 },
      },
    };
  },

  // v4 → v5 — SD-2 lifted the driver's turn-boundary stamp into state as
  // `state.observedTurn`, written ONLY on instrumented advances (time-pressure /
  // onTurnStart), so re-entrant advances never re-fire the boundary. It is
  // absent-by-default and absent === "boundary not yet stamped", so a v4 save needs
  // no backfill — this migration only stamps the version forward (mirrors v2→v3).
  // HONESTY NOTE: a pre-v5 save resumed mid-turn lacks the stamp, so the boundary
  // fires once more for the in-flight turn — harmless today (resume passes no opts;
  // worst case one extra time-pressure drain on an opted-in resume). (CONTRACT-MIG.)
  4: (doc) => ({ ...doc, schemaVersion: 5 }),

  // v5 → v6 — the aura-entry-host pause (2026-10-16, CR 303.4f) carries the seats a PERSON
  // plays as `state.humanSeats` (createLearnSession stamps ["user"] below Expert); the engine
  // asks those seats the choices it otherwise makes by house policy. Absent means nobody is
  // asked, so a pre-v6 game resumed without it would silently keep choosing for its player.
  // Backfill it from the session's own difficulty, exactly as createLearnSession stamps it;
  // an Expert (or difficulty-less) save stays without it, and an existing field is kept.
  // (CONTRACT-MIG.)
  5: (doc) => {
    const session = doc.session || {};
    const state = session.state;
    const stamp = !!state && state.humanSeats === undefined && typeof session.difficulty === "string" && session.difficulty !== "expert";
    return stamp
      ? { ...doc, schemaVersion: 6, session: { ...session, state: { ...state, humanSeats: ["user"] } } }
      : { ...doc, schemaVersion: 6 };
  },

  // v6 → v7 — the ability-loss core (2026-11-01) added two per-permanent TIMESTAMPS: `counterTimestamps` ({ [counter kind]: stamp },
  // written by gameState.addCounter — CR 613.7c) and `suspectedTimestamp` (written as a creature becomes suspected). The layer engine
  // reads them only to decide whether a keyword counter or the suspected designation is newer than a "loses all abilities" effect, and
  // an ABSENT stamp already has its meaning there: older than every effect — exactly what a counter put on before the save was: no
  // effect created after the resume can be older than it, and no v6 save holds a loss (no build before v7 emits one). So a v6 save
  // needs no backfill (backfilling 0 would say the same thing in
  // more bytes, and a live v7 game holds unstamped counters too — those written outside addCounter); this migration only stamps the
  // version forward, as v2→v3 and v4→v5 do. (CONTRACT-MIG.)
  6: (doc) => ({ ...doc, schemaVersion: 7 }),

  // v7 → v8 — the ability-loss readers (S0b, 2026-11-01): a leave event on `pendingLeaveEvents` (gameState.recordLeaveEvent) may carry
  // `lkiAbilityLoss` — the "loses all abilities" effects the permanent had as it left (layers.abilityLossStamp, CR 603.10a), read by the
  // leave triggers' look-back. It is written only for a permanent that had lost its abilities, and an ABSENT stamp already has its
  // meaning there: it left with every ability it printed — what a v7 game's leave events say (no v7 save holds a loss; no build emits
  // one). So a v7 save needs no backfill; this migration only stamps the version forward, as v6 → v7 does. (CONTRACT-MIG.)
  7: (doc) => ({ ...doc, schemaVersion: 8 }),
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
