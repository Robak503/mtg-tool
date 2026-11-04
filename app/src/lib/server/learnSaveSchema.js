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
import { faceManaValue } from "../learn/modalDfc.js"; // a leaf chain (splitCard, spellColors): the face's own mana value, v13 → v14's one rewrite

export const CURRENT_SCHEMA_VERSION = 18;

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

  // v13 → v14 — the play-weighted slice pw24 (2026-11-03) persists these new shapes, each written only by its own card and each ABSENT
  // meaning what every earlier game says:
  //   · a pending discard choice's `perDiscardDraw` (Syphon Mind — the cards the chain has discarded so far, drawn when it ends):
  //     absent, no draw follows the discards;
  //   · a delayed-trigger record's `watchCombatDamage` + `recipients` (Hunter's Insight — the permanent watched this turn): absent, none;
  //   · a layer-6 removeKeyword's `cantHave` and a targetShield's `hexproof` (Arcane Lighthouse; Veil of Summer's and Dawn's Truce's
  //     shields are hexproof): absent, a removal timestamp order decides, and the shield isn't a hexproof ability;
  //   · a pending tutor choice's `pickFilters` (Krosan Verge — the filters of the picks still to come) and `entrySourceId` (Kodama of the
  //     East Tree — the ability putting the card), a permanent's `enteredViaAbilityOf`, a pending trigger's context
  //     `triggeringEnteredViaAbilityOf`: absent, the search's one filter, and nothing put it there by an ability;
  //   · a permanent's `becameAura` (Necromancy — it became an Aura by its own enters trigger): absent, it is what its card says;
  //   · a permanent's `exertedTurn` and an attacker entry's `exerted` (Combat Celebrant and the exert template — CR 701.43): absent,
  //     never exerted, nothing exerted as it attacked.
  // And one stored VALUE changes meaning (the recheck of pw24, R2): a modal DFC played as its land face is a permanent whose card is the
  // face view (`faceIndex: 1`, `mdfcOf`), and that view's `cmc` was the combined card's (its front face's — Turntimber, Serpentine Wood
  // 7) until pw24 gave the face its own (CR 712.8f, 202.3a — 0). A v13 save made with such a land in play would resume reading 7 while
  // a fresh game reads 0, so this step rewrites each battlefield land face's `cmc` with the live view's read (modalDfc.faceManaValue).
  // Nothing else is touched; a save with no land face in play is stamped only.
  13: (doc) => ({ ...withLandFaceManaValue(doc), schemaVersion: 14 }),

  // v14 → v15 — the play-weighted slice pw26 (2026-11-03) persists these new shapes, each written only by its own card and each ABSENT
  // meaning what every earlier game says:
  //   · a pending discard choice's `conniveN` (Spymaster's Vault — connive N's nonland tally, placed as counters when the chain ends):
  //     absent, the discard places no counters;
  //   · a pending protection-color choice's `grantText` and a `step.atom` of op "chosen-color-toxic-shield" (Skrelv, Defector Mite):
  //     absent, the colour is a protection grant's;
  //   · a layer-6 addKeyword "toxic" with `toxicAmount`, and a `cantBeBlockedByColor` effect with `color` (Skrelv): absent, none;
  //   · a recorded target's `slotPlayer` (Grasp of Fate — the opponent its "target" was chosen for): absent, an ordinary target; and a
  //     waiting trigger's `awaitingTargets.perOpponent` `{ slots, at, chosen }` (a person asked one opponent at a time — the review of pw26,
  //     F2): absent, the ability is asked its targets in one question;
  //   · an ability-source record's `attachedTo` (a stack object's or pending trigger's `abilitySourceLki`, a leave event's `sourceLki` —
  //     Tarrian's Soulcleaver, Ghost Lantern: the creature an Equipment was attached to as it left, CR 608.2h): absent, none recorded.
  // So an earlier save needs no backfill; this migration only stamps the version forward — and an earlier build refuses a v15 save
  // (migrate throws on a newer version) instead of dropping a connive's tally or a per-opponent target's player. (CONTRACT-MIG.)
  14: (doc) => ({ ...doc, schemaVersion: 15 }),

  // v15 → v16 — the play-weighted slice pw27 (2026-11-03) persists these new shapes, each ABSENT meaning what every earlier game says:
  //   · `state.combatDamageToPlayersThisTurn` `{ turn, bySource: { [dealer permanent id]: [player ids] } }` (combatResolution — the players
  //     each object dealt combat damage to this turn; Steel Hellkite's "whose controller was dealt combat damage by this creature this
  //     turn"): absent, no record — written by every combat that deals a player damage, so a v15 game resumed mid-turn after combat has
  //     none for that turn (a Hellkite activated then destroys nothing — an under-read, never a wrong one);
  //   · `state.departedLifeLostThisTurn` (`{ playerId, amount, turn }` — the life a seat that left the game lost this turn; Neheb, the
  //     Eternal's "for each 1 life your opponents have lost this turn"): absent, none;
  //   · a pending tutor choice's `searchTopIds` (Aven Mindcensor — the top four library cards one search may find, for every pick of
  //     it): absent, the whole library.
  // So an earlier save needs no backfill; this migration only stamps the version forward — and an earlier build refuses a v16 save
  // (migrate throws on a newer version) instead of widening a Mindcensor-limited search to the whole library. (CONTRACT-MIG.)
  15: (doc) => ({ ...doc, schemaVersion: 16 }),

  // v16 → v17 — the play-weighted slice pw28 (2026-11-03) persists these new shapes, each ABSENT meaning what every earlier game says:
  //   · `state.pendingCounteredSpells` — the spells a counter removed since the last flush, each with the controller of the spell or
  //     ability that countered it (Baral, Chief of Compliance; Lullmage Mentor — triggers.checkSpellCounteredTriggers): absent, none;
  //   · `state.pendingLibraryExiles` — the cards put into exile from a library since the last flush, with their owner and an optional
  //     `batch` (Laelia, the Blade Reforged — gameState.recordLibraryExiles): absent, none;
  //   · a pending soft-counter choice's `counterer` and a stack object's `wardOwed.counterer` — the player whose spell or ability counters
  //     the object on a decline: absent, the counter records no counterer (no "you counter a spell" watcher hears it);
  //   · an `endOfCombatEffects` entry's `controller` and `sourceId`: absent (a v16 save made mid-combat), the entry's delayed ability takes
  //     the AFFECTED creature's controller as it drains (delayedTrigger.drainEndOfCombatQueue) — for a basilisk's destroy or Wall of Tears'
  //     bounce that is the opponent, not the ability's controller: the same outcome, only the trigger's owner and APNAP place differ.
  // So an earlier save needs no backfill; this migration only stamps the version forward — and an earlier build refuses a v17 save
  // instead of dropping a counter or an exile Baral or Laelia was waiting to hear. (CONTRACT-MIG.)
  16: (doc) => ({ ...doc, schemaVersion: 17 }),

  // v17 → v18 — the copy-targets fix (2026-11-04, CR 707.10c, 115.7d) persists these new shapes, each ABSENT meaning what every earlier game
  // says:
  //   · a stack object's `awaitingCopyTargets` `{ positions: [{ keep, options, group, atomKey }], chosen, at, house?, sourceName, copyNumber?,
  //     copyCount?, chooser?, retarget? }` (a copy a person controls, or the spell or ability their Deflecting Swat aims at, waiting for them
  //     to keep its targets or choose new ones one at a time — atoms/stack placeCopyForPerson, applyRetarget): absent, it has its targets;
  //   · a pending choice of kind "copy-targets" (`stackObjectId`, `spellName`, `sourceName`, `objectKind`, `copyNumber` / `copyCount`,
  //     `slotNumber` / `slotCount`, `retarget`, `candidates`, `suggestedId`): absent, nothing is asked;
  //   · a "copy-activated-ability" / "copy-ability" atom's `newTargets`, and a "copy-self-spell" atom's `copiedTargets` and `copyColors` (in
  //     a pending choice's effect atoms or a suspended program): absent, the copy keeps the original's targets for every seat and names no
  //     colours, as an earlier build did;
  //   · a self-copy's source `colors` (on a stack object): absent, no colours named.
  // So an earlier save needs no backfill; this migration only stamps the version forward — and an earlier build refuses a v18 save
  // (migrate throws on a newer version) instead of resolving a copy that is still waiting for its targets. (CONTRACT-MIG.)
  17: (doc) => ({ ...doc, schemaVersion: 18 }),
};

/** v13 → v14's rewrite: each battlefield permanent that is a modal DFC's land face carries that face's own mana value. */
function withLandFaceManaValue(doc) {
  const state = doc?.session?.state;
  if (!state?.players || typeof state.players !== "object") return doc;
  let changed = false;
  const players = {};
  for (const [pid, p] of Object.entries(state.players)) {
    if (!Array.isArray(p?.battlefield)) { players[pid] = p; continue; }
    players[pid] = { ...p, battlefield: p.battlefield.map((perm) => {
      const card = perm?.card;
      if (!card || card.faceIndex !== 1 || !card.mdfcOf || !/\bLand\b/.test(String(card.type || ""))) return perm;
      const mv = faceManaValue(card.mana);
      if (card.cmc === mv) return perm;
      changed = true;
      return { ...perm, card: { ...card, cmc: mv } };
    }) };
  }
  return changed ? { ...doc, session: { ...doc.session, state: { ...state, players } } } : doc;
}

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
