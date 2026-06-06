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
  // timestampCounter / permanent.timestamp. A v1 fixture must carry forward to v2
  // with those fields defaulted (no data loss). This save-v1 fixture is the proof.
  it("carries a v1 save forward to v2, defaulting the layers fields", () => {
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
    expect(upgraded.schemaVersion).toBe(2);
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
