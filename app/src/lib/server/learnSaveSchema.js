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

export const CURRENT_SCHEMA_VERSION = 13;

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

  // v8 → v9 — the ability-loss S2 (2026-11-02): a leave event on `pendingLeaveEvents` (gameState.recordLeaveEvent) may carry `lkiSubtypes`
  // — the subtypes the permanent had as it left, written only on a board that sets card or creature types (layers.lkiSubtypesStamp, CR
  // 603.10a), read with its `lkiTypes` by the leave and graveyard scopes (layers.typeLineNow: a creature Kenrith's Transformation made an
  // Elk was no artifact as it left). An ABSENT stamp already has its meaning there: the printed type line answers, as every v8 leave event
  // says (no v8 save holds a stage-S2 effect). So a v8 save needs no backfill; this migration only stamps the version forward, as v7 → v8
  // does. (CONTRACT-MIG.)
  8: (doc) => ({ ...doc, schemaVersion: 9 }),

  // v9 → v10 — the play-weighted slice pw20 (2026-11-02) persists five new shapes, each written only by its own card and each ABSENT
  // meaning what every v9 game says:
  //   · a permanent's `leaveExiledInstead` (Whip of Erebos, Gruesome Encore, Moira and Teshar — gameState.stampLeaveExiledInstead, CR
  //     614.1a): absent, it leaves for wherever it is put;
  //   · a permanent's `doesNotUntapNext` may name a seat (an exerted Arena of Glory — the untap step of THAT player skips it, CR 701.43a);
  //     `true` keeps its old meaning (its controller's next untap step);
  //   · a `restrictedMana` entry's `rider` (Arena of Glory's {R}{R} — `{ kind: "creatureSpellHasteEot" }`), and a spell payload's
  //     `params.hasteUntilEndOfTurn` (the turn a creature spell it paid for gains haste): absent, no rider;
  //   · `state.departedDamageThisTurn` (Spinerock Knoll — the damage a seat that left the game took this turn): absent, none;
  //   · a `pendingFreeCast` from the graveyard with `paid` / `lockAfterCast` (Conduit of Worlds' window), a `pendingCascade` with
  //     `cap: null` and `sourceName` (Tibalt's Trickery's), a cast trigger's `castSpellSnapshot` (Reflections of Littjara): absent,
  //     the windows and triggers every v9 build makes.
  // So a v9 save needs no backfill; this migration only stamps the version forward, as v8 → v9 does — and a v9 build refuses a v10
  // save (migrate throws on a newer version) instead of reading `doesNotUntapNext: "user"` as `true` and dropping the rest. (CONTRACT-MIG.)
  9: (doc) => ({ ...doc, schemaVersion: 10 }),

  // v10 → v11 — the play-weighted slice pw21 (2026-11-02). New, optional stored fields, each absent on every older save and each meaning
  // there what an older game already did: a leave event on `pendingLeaveEvents` (gameState.recordLeaveEvent) and a pending trigger's
  // context may carry `lkiCopyMv` / `triggeringCopyMv` — the mana value of a permanent that left while a layer-1 copy effect named it
  // (layers.lkiCopyManaValueStamp, CR 603.10a, 707.2; Scrap Trawler's cap — absent: its card's mana value answers); a prevention shield
  // may carry `combatOnly` and `perPrevented` + `controller` (Inkshield, Druid's Deliverance); an impulse-dig pause `thenExilePlay` or
  // chosenTo "impulseExile" (Expressive Iteration); a milled-pick pause toZone "battlefieldYours" with `collected` and `queue` (Breach the
  // Multiverse); an exiled card of your own `_impulseFree` (Urza, Mind's Desire). No backfill: this migration stamps the version only.
  // (CONTRACT-MIG.)
  10: (doc) => ({ ...doc, schemaVersion: 11 }),

  // v11 → v12 — the play-weighted slice pw22 (2026-11-03) persists five new shapes, each written only by its own card and each ABSENT
  // meaning what every earlier game says:
  //   · a pending tutor choice's `eachPlayerSearch` (Field of Ruin — the atom and the players still to search after this one,
  //     effects/atoms/library.startEachPlayerSearch): absent, the search is the only one;
  //   · a permanent's `myriadToken` (a copy myriad made — the legend rule's house pick keeps the permanent that isn't one): absent, none;
  //   · a pending trigger with `event: "myriad"` (its inline program, the `myriad` atom, and its context's `defendingPlayerId` and
  //     `myriadLastKnown`), and a delayed record whose `fireStep` is `"end-of-combat"` (the copies' exile): absent, none;
  //   · a resume record's `xValue` may be a bound count (ONE X ACROSS CONJUNCTS — runEffectProgram's `bind-x`): the same field, read as
  //     the program's X as before.
  //   · a stack object's `abilitySourceLki` may carry `counters` (the source's counter pile as it left, written only for an ability that
  //     counts its source's named counters — gameState.stampAbilitySourceLki, CR 608.2h; Descent into Avernus): absent, the record
  //     every earlier build writes.
  // So an earlier save needs no backfill; this migration only stamps the version forward — and an earlier build refuses a v12 save
  // (migrate throws on a newer version) instead of dropping the players still to search or resolving an unknown atom. (CONTRACT-MIG.)
  11: (doc) => ({ ...doc, schemaVersion: 12 }),

  // v12 → v13 — the play-weighted slice pw23 (2026-11-03) persists four new shapes, each written only by its own card and each ABSENT
  // meaning what every earlier game says:
  //   · a player's `castNamesThisGame` (Approach of the Second Sun — gameState.recordSpellCast's tally of the casts of a spell whose own
  //     text reads that history): absent, no such spell cast this game;
  //   · a permanent's `vowAgainst` beside a `vow` counter (Promise of Loyalty — the players it promised not to attack, CR 508.1c):
  //     absent, no promise;
  //   · `state.vowPoolsThisWay` (Promise of Loyalty's pools, carried across the sacrifice pauses to the vow atom): absent between
  //     resolutions;
  //   · `state.spellResolutionPlacement` (Approach's "seventh from the top", read by the disposition step in the same call — never held
  //     across a pause): absent.
  // So an earlier save needs no backfill; this migration only stamps the version forward, as v9 → v10 does — and an earlier build refuses
  // a v13 save (migrate throws on a newer version) instead of dropping a vow mid-game. (CONTRACT-MIG.)
  12: (doc) => ({ ...doc, schemaVersion: 13 }),
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
