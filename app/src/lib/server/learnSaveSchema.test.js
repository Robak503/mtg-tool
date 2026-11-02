/**
 * Tests for learnSaveSchema.js (Phase-7 PR-4a) — the save-format contract.
 */

import { describe, it, expect } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  checksumOf,
  verifyChecksum,
  isSerializable,
  migrate,
  isResumable,
  SaveMigrationError,
  MIGRATIONS,
} from "./learnSaveSchema.js";

function sampleSession() {
  return {
    id: "learn-abc123",
    createdAt: "2026-06-06T00:00:00.000Z",
    difficulty: "beginner",
    mode: "standard",
    status: "active",
    state: { turn: 3, idSeq: 4, stack: [], players: { user: { life: 40 }, ai: { life: 40 } } },
    decisionLog: [],
  };
}
function saveDoc(session, over = {}) {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    kind: "learn-session-save",
    savedAt: "2026-06-06T00:01:00.000Z",
    sessionId: session.id,
    session,
    serializable: true,
    checksum: checksumOf(session),
    ...over,
  };
}

describe("checksum", () => {
  it("is deterministic for the same session", () => {
    const s = sampleSession();
    expect(checksumOf(s)).toBe(checksumOf(sampleSession()));
  });
  it("verifyChecksum passes for an untampered doc and fails for a tampered one", () => {
    const s = sampleSession();
    const doc = saveDoc(s);
    expect(verifyChecksum(doc)).toBe(true);
    const tampered = { ...doc, session: { ...s, state: { ...s.state, turn: 99 } } };
    expect(verifyChecksum(tampered)).toBe(false);
  });
});

describe("isSerializable", () => {
  it("accepts a clean plain-data session", () => {
    expect(isSerializable(sampleSession())).toEqual({ ok: true });
  });
  it("rejects a session carrying a function anywhere (closure regression)", () => {
    const s = sampleSession();
    s.state.stack.push({ id: "stk-1", payload: { onResolve: () => {} } });
    const res = isSerializable(s);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("live-closure-in-state");
  });
});

describe("migrate", () => {
  it("returns a current-version doc unchanged", () => {
    const doc = saveDoc(sampleSession());
    expect(migrate(doc)).toBe(doc);
  });
  it("throws on a doc with no schemaVersion", () => {
    expect(() => migrate({ session: {} })).toThrow(SaveMigrationError);
  });
  it("throws when no migration exists for an older version", () => {
    const doc = saveDoc(sampleSession(), { schemaVersion: 0 });
    expect(() => migrate(doc)).toThrow(SaveMigrationError);
  });
  it("throws on a future-schema doc (downgrade not attempted)", () => {
    const doc = saveDoc(sampleSession(), { schemaVersion: CURRENT_SCHEMA_VERSION + 5 });
    expect(() => migrate(doc)).toThrow(/newer than supported/);
  });

  // CONTRACT-MIG: the CR 613 layers slice (PR-9) added continuousEffects /
  // timestampCounter / permanent.timestamp. A v1 fixture must carry forward to the
  // current schema (now v3, via v1→v2→v3) with those fields defaulted (no data
  // loss). This save-v1 fixture is the proof.
  it("carries a v1 save forward to the current schema, defaulting the layers fields", () => {
    const saveV1 = {
      schemaVersion: 1,
      kind: "learn-session-save",
      savedAt: "2026-06-06T00:01:00.000Z",
      sessionId: "learn-old1",
      serializable: true,
      session: {
        id: "learn-old1",
        createdAt: "2026-06-06T00:00:00.000Z",
        difficulty: "beginner",
        mode: "standard",
        status: "active",
        // A v1 game state — note: NO continuousEffects / timestampCounter, and the
        // permanent has NO timestamp field (it predates the layers engine).
        state: {
          turn: 4,
          idSeq: 7,
          stack: [],
          players: {
            user: { life: 40, battlefield: [{ id: "perm-3", card: { name: "Grizzly Bears" }, counters: {} }] },
            ai: { life: 38, battlefield: [] },
          },
        },
        decisionLog: [],
      },
      checksum: "sha256:stale-but-unused-after-verify",
    };

    const upgraded = migrate(saveV1);
    expect(upgraded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(upgraded.session.state.continuousEffects).toEqual([]);
    expect(upgraded.session.state.timestampCounter).toBe(0);
    expect(upgraded.session.state.players.user.battlefield[0].timestamp).toBe(0);
    // Preserved fields are untouched.
    expect(upgraded.session.state.turn).toBe(4);
    expect(upgraded.session.state.idSeq).toBe(7);
    expect(upgraded.session.state.players.ai.life).toBe(38);
    expect(upgraded.serializable).toBe(true);
    // A migrated v1 save is now resumable (current schema + serializable).
    expect(isResumable(upgraded)).toBe(true);
  });

  // The v1->v2 migration must be TOTAL — never throw on a partial/malformed save,
  // and never lose data. Exercise the odd-shape branches the happy-path fixture
  // doesn't reach.
  it("v1->v2 migration is total across missing/null/odd shapes", () => {
    const oddV1 = {
      schemaVersion: 1,
      kind: "learn-session-save",
      savedAt: "2026-06-06T00:01:00.000Z",
      sessionId: "learn-odd",
      serializable: true,
      session: {
        id: "learn-odd",
        state: {
          turn: 2,
          players: {
            user: { life: 40, battlefield: null }, // non-array battlefield
            ai: { life: 40, battlefield: [null, { id: "perm-9", card: { name: "X" }, timestamp: 5 }] },
          },
        },
      },
      checksum: "sha256:unused",
    };
    let upgraded;
    expect(() => { upgraded = migrate(oddV1); }).not.toThrow();
    expect(upgraded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(upgraded.session.state.continuousEffects).toEqual([]);
    expect(upgraded.session.state.timestampCounter).toBe(0);
    // non-array battlefield normalized to []
    expect(upgraded.session.state.players.user.battlefield).toEqual([]);
    // a null entry survives untouched; an already-timestamped perm keeps its value
    expect(upgraded.session.state.players.ai.battlefield[0]).toBeNull();
    expect(upgraded.session.state.players.ai.battlefield[1].timestamp).toBe(5);
  });

  it("v1->v2 migration tolerates a save with no state/players at all", () => {
    const bare = { schemaVersion: 1, kind: "learn-session-save", session: { id: "x" }, serializable: true, checksum: "sha256:x" };
    let upgraded;
    expect(() => { upgraded = migrate(bare); }).not.toThrow();
    expect(upgraded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(upgraded.session.state.continuousEffects).toEqual([]);
    expect(upgraded.session.state.timestampCounter).toBe(0);
  });

  // CONTRACT-MIG: Phase-2 P2.1 added a transient state.pendingArbiter flag (the
  // unresolved→Arbiter seam). A v2 save (no such field) carries forward to v3
  // untouched and stays resumable — absent === "no pending ruling".
  it("carries a v2 save forward to v3 (the P2.1 seam) and keeps it resumable", () => {
    const saveV2 = {
      schemaVersion: 2,
      kind: "learn-session-save",
      savedAt: "2026-06-06T00:01:00.000Z",
      sessionId: "learn-v2",
      serializable: true,
      session: {
        id: "learn-v2",
        difficulty: "beginner",
        mode: "standard",
        status: "active",
        state: {
          turn: 5,
          idSeq: 9,
          stack: [],
          continuousEffects: [],
          timestampCounter: 0,
          players: {
            user: { life: 38, battlefield: [{ id: "perm-1", card: { name: "Grizzly Bears" }, counters: {}, timestamp: 0 }] },
            ai: { life: 40, battlefield: [] },
          },
        },
        decisionLog: [],
      },
      checksum: "sha256:stale-but-unused-after-verify",
    };
    const upgraded = migrate(saveV2);
    expect(upgraded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    // No field churn — a v2 save had no pendingArbiter and still has none.
    expect(upgraded.session.state.pendingArbiter).toBeUndefined();
    // Layers fields + game data preserved untouched.
    expect(upgraded.session.state.continuousEffects).toEqual([]);
    expect(upgraded.session.state.turn).toBe(5);
    expect(upgraded.session.state.players.user.battlefield[0].timestamp).toBe(0);
    expect(isResumable(upgraded)).toBe(true);
  });

  // CONTRACT-MIG: the interactive-tutor slice added a DURABLE state.rngSeed (the threaded
  // deterministic-shuffle seed). A v3 save (no field) backfills rngSeed:0 and stays resumable.
  it("carries a v3 save forward to v4, backfilling an explicit rngSeed:0", () => {
    const saveV3 = {
      schemaVersion: 3,
      kind: "learn-session-save",
      savedAt: "2026-06-15T00:00:00.000Z",
      sessionId: "learn-v3",
      serializable: true,
      session: {
        id: "learn-v3", difficulty: "beginner", mode: "standard", status: "active",
        state: { turn: 3, idSeq: 4, stack: [], continuousEffects: [], timestampCounter: 0, players: { user: { life: 40, battlefield: [] }, ai: { life: 40, battlefield: [] } } },
        decisionLog: [],
      },
      checksum: "sha256:stale-but-unused-after-verify",
    };
    expect(saveV3.session.state.rngSeed).toBeUndefined(); // pre-v4: no seed on disk
    const upgraded = migrate(saveV3);
    expect(upgraded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(upgraded.session.state.rngSeed).toBe(0);       // explicit backfill (not the read-side ?? 0)
    expect(upgraded.session.state.turn).toBe(3);          // game data preserved
    expect(isResumable(upgraded)).toBe(true);
  });

  // CONTRACT-MIG (SD-2): v5 lifted the driver's turn-boundary stamp into state as
  // `state.observedTurn` (written only on instrumented advances). It is absent-by-default
  // (absent === "not yet stamped"), so the v4→v5 migration is stamp-only — no backfill,
  // no field churn — and a v4 save stays resumable.
  it("carries a v4 save forward to v5 (stamp-only; observedTurn stays absent)", () => {
    const saveV4 = {
      schemaVersion: 4,
      kind: "learn-session-save",
      savedAt: "2026-07-03T00:00:00.000Z",
      sessionId: "learn-v4",
      serializable: true,
      session: {
        id: "learn-v4", difficulty: "beginner", mode: "standard", status: "active",
        state: { turn: 7, idSeq: 11, stack: [], rngSeed: 42, continuousEffects: [], timestampCounter: 0, players: { user: { life: 34, battlefield: [] }, ai: { life: 40, battlefield: [] } } },
        decisionLog: [],
      },
      checksum: "sha256:stale-but-unused-after-verify",
    };
    expect(saveV4.session.state.observedTurn).toBeUndefined(); // pre-v5: no stamp on disk
    const upgraded = migrate(saveV4);
    expect(upgraded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(upgraded.session.state.observedTurn).toBeUndefined(); // absent-by-default, NOT backfilled
    expect(upgraded.session.state.turn).toBe(7);                 // game data preserved untouched
    expect(upgraded.session.state.rngSeed).toBe(42);
    expect(isResumable(upgraded)).toBe(true);
  });

  // CONTRACT-MIG (the aura-entry-host pause, CR 303.4f): v6 carries the seats a person plays as
  // `state.humanSeats`, which createLearnSession stamps below Expert. A v5 save is backfilled from its
  // own difficulty, so an in-flight beginner game resumes still asking its player; an Expert one never
  // did, and an existing field is kept as it is.
  it("carries a v5 save forward to v6, stamping humanSeats from the session's difficulty — and only below Expert", () => {
    const v5 = (difficulty, extraState = {}) => ({
      schemaVersion: 5,
      kind: "learn-session-save",
      savedAt: "2026-10-16T00:00:00.000Z",
      sessionId: `learn-v5-${difficulty}`,
      serializable: true,
      session: {
        id: `learn-v5-${difficulty}`, difficulty, mode: "standard", status: "active",
        state: { turn: 4, idSeq: 9, stack: [], rngSeed: 7, continuousEffects: [], timestampCounter: 0, players: { user: { life: 20, battlefield: [] }, ai: { life: 20, battlefield: [] } }, ...extraState },
        decisionLog: [],
      },
      checksum: "sha256:stale-but-unused-after-verify",
    });
    const seats = (doc) => migrate(doc).session.state.humanSeats ?? null;
    expect({ beginner: seats(v5("beginner")), intermediate: seats(v5("intermediate")), expert: seats(v5("expert")), kept: seats(v5("beginner", { humanSeats: [] })) })
      .toEqual({ beginner: ["user"], intermediate: ["user"], expert: null, kept: [] });
    const upgraded = migrate(v5("beginner"));
    expect({ version: upgraded.schemaVersion, turn: upgraded.session.state.turn, rngSeed: upgraded.session.state.rngSeed, resumable: isResumable(upgraded) })
      .toEqual({ version: CURRENT_SCHEMA_VERSION, turn: 4, rngSeed: 7, resumable: true });
  });

  // CONTRACT-MIG (the ability-loss core, 2026-11-01): v7 permanents may carry `counterTimestamps` (CR 613.7c) and `suspectedTimestamp`.
  // A v6 save has neither; an absent stamp reads as older than every effect (layers' keyword-counter and suspicion seeds), which is
  // what a counter put on before the save is, so the migration stamps the version only. The round trip: the v6 game resumes, a
  // "loses all abilities" effect created after the resume removes the old flying counter and the suspicion, and a flying counter put
  // on after the loss counts; a v7 game's stamps survive save → JSON → migrate untouched.
  it("carries a v6 save forward to v7 (stamp-only; an unstamped counter or suspicion reads as older than a loss made after the resume)", async () => {
    const { permanentHasKeyword, addContinuousEffect } = await import("../learn/layers.js");
    const { addCounter } = await import("../learn/gameState.js");
    const bear = { id: "perm-1", card: { name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", tapped: false,
      summoningSick: false, counters: { flying: 1 }, damageMarked: 0, attachments: [], attachedTo: null, timestamp: 1, suspected: true };
    const v6 = {
      schemaVersion: 6,
      kind: "learn-session-save",
      savedAt: "2026-11-01T00:00:00.000Z",
      sessionId: "learn-v6",
      serializable: true,
      session: {
        id: "learn-v6", difficulty: "expert", mode: "standard", status: "active",
        state: { turn: 5, idSeq: 3, stack: [], rngSeed: 9, continuousEffects: [], timestampCounter: 4,
          players: { user: { life: 20, battlefield: [bear], hand: [], graveyard: [], exile: [], library: [] }, ai: { life: 20, battlefield: [], hand: [], graveyard: [], exile: [], library: [] } } },
        decisionLog: [],
      },
      checksum: "sha256:stale-but-unused-after-verify",
    };
    expect(typeof MIGRATIONS[6]).toBe("function"); // the v6 → v7 step exists (CONTRACT-MIG)
    expect(MIGRATIONS[6](JSON.parse(JSON.stringify(v6)))).toEqual({ ...v6, schemaVersion: 7 }); // and stamps the version only
    const upgraded = migrate(JSON.parse(JSON.stringify(v6)));
    expect({ version: upgraded.schemaVersion, resumable: isResumable(upgraded) }).toEqual({ version: CURRENT_SCHEMA_VERSION, resumable: true });
    expect(upgraded.session.state.players.user.battlefield[0]).toEqual(bear); // no field added: absent is the v7 meaning of "older"
    let s = upgraded.session.state;
    expect(["flying", "menace"].map((k) => permanentHasKeyword(s, "perm-1", k))).toEqual([true, true]);
    s = addContinuousEffect(s, { layer: 6, op: { layerOp: "loseAllAbilities" }, affects: { mode: "fixed", permanentIds: ["perm-1"] }, duration: { kind: "permanent" }, source: { kind: "resolution", permanentId: null, controller: "ai" } }).state;
    expect(["flying", "menace"].map((k) => permanentHasKeyword(s, "perm-1", k))).toEqual([false, false]);
    s = addCounter(s, { permanentId: "perm-1", type: "flying" });
    expect(permanentHasKeyword(s, "perm-1", "flying")).toBe(true);
    // a v7 game's stamps round-trip: save → JSON → migrate keeps them as they were
    const v7 = { ...v6, schemaVersion: CURRENT_SCHEMA_VERSION, session: { ...v6.session, state: s } };
    expect(isSerializable(v7.session).ok).toBe(true);
    const back = migrate(JSON.parse(JSON.stringify(v7)));
    expect(back.session.state.players.user.battlefield[0].counterTimestamps).toEqual(s.players.user.battlefield[0].counterTimestamps);
    expect(back.session.state.players.user.battlefield[0].counterTimestamps.flying).toBe(5);
    expect(permanentHasKeyword(back.session.state, "perm-1", "flying")).toBe(true);
  });

  // CONTRACT-MIG (the ability-loss S2): a v9 leave event may carry `lkiSubtypes` (the subtypes it had as it left, on a board that sets
  // types — layers.lkiSubtypesStamp, CR 603.10a). A v8 save has none; absent means the printed type line answers, so the migration stamps
  // the version only, and a v9 leave event's stamp survives save → JSON → migrate.
  it("carries a v8 save forward to v9 (stamp-only; a v9 leave event's type stamp round-trips)", () => {
    const leave = { id: "perm-0", controller: "user", card: { id: "card-0", name: "Ornithopter", type: "Artifact Creature — Thopter", oracle: "Flying" }, toGraveyard: true, counters: {} };
    const v8 = {
      schemaVersion: 8, kind: "learn-session-save", savedAt: "2026-11-02T00:00:00.000Z", sessionId: "learn-v8", serializable: true,
      session: { id: "learn-v8", difficulty: "expert", mode: "standard", status: "active",
        state: { turn: 5, idSeq: 3, stack: [], rngSeed: 9, continuousEffects: [], timestampCounter: 4, pendingLeaveEvents: [leave],
          players: { user: { life: 20, battlefield: [], hand: [], graveyard: [], exile: [], library: [] }, ai: { life: 20, battlefield: [], hand: [], graveyard: [], exile: [], library: [] } } },
        decisionLog: [] },
      checksum: "sha256:stale-but-unused-after-verify",
    };
    expect(typeof MIGRATIONS[8]).toBe("function"); // the v8 → v9 step exists (CONTRACT-MIG)
    expect(MIGRATIONS[8](JSON.parse(JSON.stringify(v8)))).toEqual({ ...v8, schemaVersion: 9 }); // and stamps the version only
    const upgraded = migrate(JSON.parse(JSON.stringify(v8)));
    expect({ version: upgraded.schemaVersion, resumable: isResumable(upgraded) }).toEqual({ version: CURRENT_SCHEMA_VERSION, resumable: true });
    expect(upgraded.session.state.pendingLeaveEvents).toEqual([leave]); // no field added: absent means the printed type line
    const stamped = { ...leave, lkiTypes: ["Creature"], lkiSubtypes: ["Frog"] };
    const v9 = { ...upgraded, session: { ...upgraded.session, state: { ...upgraded.session.state, pendingLeaveEvents: [stamped] } } };
    expect(migrate(JSON.parse(JSON.stringify(v9))).session.state.pendingLeaveEvents).toEqual([stamped]);
  });
  // CONTRACT-MIG (the ability-loss readers, S0b): a v8 leave event may carry `lkiAbilityLoss` (the loss the permanent had as it left —
  // layers.abilityLossStamp, CR 603.10a). A v7 save has none; an absent stamp means it left with its printed abilities, so the migration
  // stamps the version only. The round trip: a v7 game with an undrained leave event resumes unchanged, and a v8 leave event's stamp
  // survives save → JSON → migrate, still read by the look-back (the departed creature's granted dies trigger stays cut).
  it("carries a v7 save forward to v8 (stamp-only; a v8 leave event's ability-loss stamp round-trips)", async () => {
    const { addContinuousEffect, grantedTriggeredQuotedFor } = await import("../learn/layers.js");
    const { moveCardToZone } = await import("../learn/gameState.js");
    const bear = { id: "perm-1", card: { id: "card-1", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", owner: "user", tapped: false,
      summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, timestamp: 1 };
    const leave = { id: "perm-0", controller: "user", card: { id: "card-0", name: "Grizzly Bears", type: "Creature — Bear", oracle: "" }, toGraveyard: true, counters: {} };
    const v7 = {
      schemaVersion: 7, kind: "learn-session-save", savedAt: "2026-11-01T00:00:00.000Z", sessionId: "learn-v7", serializable: true,
      session: {
        id: "learn-v7", difficulty: "expert", mode: "standard", status: "active",
        state: { turn: 5, idSeq: 3, stack: [], rngSeed: 9, continuousEffects: [], timestampCounter: 4, pendingLeaveEvents: [leave],
          players: { user: { life: 20, battlefield: [bear], hand: [], graveyard: [], exile: [], library: [] }, ai: { life: 20, battlefield: [], hand: [], graveyard: [], exile: [], library: [] } } },
        decisionLog: [],
      },
      checksum: "sha256:stale-but-unused-after-verify",
    };
    expect(typeof MIGRATIONS[7]).toBe("function"); // the v7 → v8 step exists (CONTRACT-MIG)
    expect(MIGRATIONS[7](JSON.parse(JSON.stringify(v7)))).toEqual({ ...v7, schemaVersion: 8 }); // and stamps the version only
    const upgraded = migrate(JSON.parse(JSON.stringify(v7)));
    expect({ version: upgraded.schemaVersion, resumable: isResumable(upgraded) }).toEqual({ version: CURRENT_SCHEMA_VERSION, resumable: true });
    expect(upgraded.session.state.pendingLeaveEvents).toEqual([leave]); // no field added: absent means "left with its abilities"
    // a v8 game: a granted dies trigger, then a loss, then the creature leaves — its leave event carries the stamp
    let s = upgraded.session.state;
    const quoted = "When this creature dies, draw a card.";
    s = addContinuousEffect(s, { layer: 6, op: { layerOp: "addAbility", grant: { kind: "triggered", quoted } }, affects: { mode: "fixed", permanentIds: ["perm-1"] }, duration: { kind: "permanent" }, source: { kind: "resolution", permanentId: null, controller: "user" } }).state;
    s = addContinuousEffect(s, { layer: 6, op: { layerOp: "loseAllAbilities" }, affects: { mode: "fixed", permanentIds: ["perm-1"] }, duration: { kind: "permanent" }, source: { kind: "resolution", permanentId: null, controller: "ai" } }).state;
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "perm-1" });
    const ev = s.pendingLeaveEvents.find((e) => e.id === "perm-1");
    expect(ev.lkiAbilityLoss?.keep).toBe("none");
    const v8 = { ...v7, schemaVersion: CURRENT_SCHEMA_VERSION, session: { ...v7.session, state: s } };
    expect(isSerializable(v8.session).ok).toBe(true);
    const back = migrate(JSON.parse(JSON.stringify(v8)));
    const evBack = back.session.state.pendingLeaveEvents.find((e) => e.id === "perm-1");
    expect(evBack.lkiAbilityLoss).toEqual(JSON.parse(JSON.stringify(ev.lkiAbilityLoss)));
    // the resumed look-back still cuts the grant made before the loss (CR 603.10a, 613.7)
    expect(grantedTriggeredQuotedFor(back.session.state, "perm-1", { id: "perm-1", controller: "user", card: evBack.card, lkiAbilityLoss: evBack.lkiAbilityLoss })).toEqual([]);
    expect(grantedTriggeredQuotedFor(back.session.state, "perm-1", { id: "perm-1", controller: "user", card: evBack.card })).toEqual([quoted]); // control: no stamp → it fires
  });

  // A game serialized mid-tutor-search (a paused pendingChoice + its resume continuation)
  // is plain JSON — it must round-trip losslessly so save/resume mid-search is exact.
  it("a v4 save paused on a tutor-search (pendingChoice + resume) round-trips serializably", () => {
    const session = sampleSession();
    session.state.rngSeed = 12345;
    session.state.pendingChoice = {
      kind: "tutor-search", controller: "user", sourceName: "Demonic Tutor", filterLabel: "card",
      candidates: [{ id: "a", name: "Sol Ring" }, { id: "b", name: "Grave Titan" }],
      resume: {
        program: { version: 1, confidence: "high", structure: "sequence", atoms: [{ op: "tutor", filter: null }, { op: "gain-life", amount: 2 }] },
        controller: "user", targets: [], xValue: null, chosenMode: null, nextAtomIndex: 1, cardName: "Demonic Tutor",
      },
    };
    expect(isSerializable(session)).toEqual({ ok: true }); // no closures — pure JSON
    const doc = saveDoc(session);
    expect(verifyChecksum(doc)).toBe(true);
    expect(isResumable(doc)).toBe(true);
  });

  it("a v3 save carrying a pendingArbiter flag is serializable and resumable", () => {
    const session = sampleSession();
    session.state.pendingArbiter = {
      stackObjectId: "stk-7",
      cardName: "Mystic Confluence",
      oracle: "Choose three —",
      reason: "instant-or-sorcery (no recognized effect)",
      controller: "user",
    };
    // Plain data — no closure smuggled in, so it round-trips losslessly.
    expect(isSerializable(session)).toEqual({ ok: true });
    const doc = saveDoc(session);
    expect(verifyChecksum(doc)).toBe(true);
    expect(isResumable(doc)).toBe(true);
  });
});

describe("isResumable", () => {
  it("is true for a current, serializable save", () => {
    expect(isResumable(saveDoc(sampleSession()))).toBe(true);
  });
  it("is false for a non-serializable save", () => {
    expect(isResumable(saveDoc(sampleSession(), { serializable: false }))).toBe(false);
  });
  it("is false for a wrong-version save", () => {
    expect(isResumable(saveDoc(sampleSession(), { schemaVersion: CURRENT_SCHEMA_VERSION + 1 }))).toBe(false);
  });
});
