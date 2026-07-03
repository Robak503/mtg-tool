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
