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
  // CONTRACT-MIG (the play-weighted slice pw20): a v10 game may carry a permanent's `leaveExiledInstead` (Whip of Erebos), a
  // `doesNotUntapNext` naming a seat (an exerted Arena of Glory), a tagged mana entry's `rider`, `departedDamageThisTurn` (Spinerock
  // Knoll) and a paid graveyard `pendingFreeCast` (Conduit of Worlds). A v9 save has none, and absent means what every v9 game says,
  // so the migration stamps the version only. The round trip: each field survives save → JSON → migrate and still plays — the stamped
  // creature bounced goes to exile, the exerted land stays tapped through its exerter's untap step.
  it("carries a v9 save forward to v10 (stamp-only; a v10 game's leave stamp, exert, rider, departed damage and paid window round-trip)", async () => {
    const { moveCardToZone, untapAll } = await import("../learn/gameState.js");
    const empty = { life: 40, battlefield: [], hand: [], graveyard: [], exile: [], library: [] };
    const v9 = {
      schemaVersion: 9, kind: "learn-session-save", savedAt: "2026-11-02T00:00:00.000Z", sessionId: "learn-v9", serializable: true,
      session: { id: "learn-v9", difficulty: "expert", mode: "standard", status: "active",
        state: { turn: 5, idSeq: 3, stack: [], log: [], rngSeed: 9, continuousEffects: [], timestampCounter: 4, players: { user: { ...empty }, ai: { ...empty } } },
        decisionLog: [] },
      checksum: "sha256:stale-but-unused-after-verify",
    };
    expect(typeof MIGRATIONS[9]).toBe("function"); // the v9 → v10 step exists (CONTRACT-MIG)
    expect(MIGRATIONS[9](JSON.parse(JSON.stringify(v9)))).toEqual({ ...v9, schemaVersion: 10 }); // and stamps the version only
    const upgraded = migrate(JSON.parse(JSON.stringify(v9)));
    expect({ version: upgraded.schemaVersion, resumable: isResumable(upgraded), state: upgraded.session.state }).toEqual({ version: CURRENT_SCHEMA_VERSION, resumable: true, state: v9.session.state });
    // a v10 game holding each new shape
    const perm = (id, card, extra = {}) => ({ id, card: { id: `c-${id}`, ...card }, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, timestamp: 1, ...extra });
    const giant = perm("giant", { name: "Hill Giant", type: "Creature — Giant", power: "3", toughness: "3", oracle: "" }, { leaveExiledInstead: true });
    const arena = perm("arena", { name: "Arena of Glory", type: "Land", oracle: "" }, { tapped: true, doesNotUntapNext: "user" });
    const state = { ...v9.session.state,
      players: { user: { ...empty, battlefield: [giant, arena], restrictedMana: [{ pool: { W: 0, U: 0, B: 0, R: 2, G: 0, C: 0 }, restriction: null, rider: { kind: "creatureSpellHasteEot" } }] }, ai: { ...empty } },
      departedDamageThisTurn: [{ playerId: "ai2", amount: 8, turn: 5 }],
      pendingFreeCast: { controller: "user", candidateIds: ["c-x"], fromZone: "graveyard", paid: true, lockAfterCast: true, sourceName: "Conduit of Worlds" } };
    const v10 = { ...upgraded, session: { ...upgraded.session, state } };
    expect(isSerializable(v10.session).ok).toBe(true);
    const back = migrate(JSON.parse(JSON.stringify(v10)));
    expect({ version: back.schemaVersion, state: back.session.state }).toEqual({ version: CURRENT_SCHEMA_VERSION, state }); // + pw21: the chain now runs on to v11 (and on to v12 since pw22 — the shapes ride forward unchanged)
    const s = back.session.state;
    const bounced = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "hand", cardId: "giant" });
    expect({ hand: bounced.players.user.hand.map((c) => c.name), exile: bounced.players.user.exile.map((c) => c.name) }).toEqual({ hand: [], exile: ["Hill Giant"] });
    const untapped = untapAll(s, { playerId: "user" }).players.user.battlefield.find((p) => p.id === "arena");
    expect({ tapped: untapped.tapped, flag: untapped.doesNotUntapNext ?? null }).toEqual({ tapped: true, flag: null });
  });
  // CONTRACT-MIG (the play-weighted slice pw21): a v11 leave event may carry `lkiCopyMv` (its mana value under a layer-1 copy effect —
  // layers.lkiCopyManaValueStamp, CR 603.10a, 707.2; Scrap Trawler's cap). A v10 save has none; absent means its card's mana value, so the
  // migration stamps the version only, and a v11 leave event's stamp survives save → JSON → migrate.
  it("carries a v10 save forward to v11 (stamp-only; a v11 leave event's copy mana value round-trips)", () => {
    const leave = { id: "perm-0", controller: "user", card: { id: "card-0", name: "Mizzium Transreliquat", type: "Artifact", cmc: 3, oracle: "" }, toGraveyard: true, counters: {} };
    const v10 = {
      schemaVersion: 10, kind: "learn-session-save", savedAt: "2026-11-02T00:00:00.000Z", sessionId: "learn-v10", serializable: true,
      session: { id: "learn-v10", difficulty: "expert", mode: "standard", status: "active",
        state: { turn: 5, idSeq: 3, stack: [], rngSeed: 9, continuousEffects: [], timestampCounter: 4, pendingLeaveEvents: [leave],
          players: { user: { life: 20, battlefield: [], hand: [], graveyard: [], exile: [], library: [] }, ai: { life: 20, battlefield: [], hand: [], graveyard: [], exile: [], library: [] } } },
        decisionLog: [] },
      checksum: "sha256:stale-but-unused-after-verify",
    };
    expect(typeof MIGRATIONS[9]).toBe("function"); // a continuous chain from v9
    expect(typeof MIGRATIONS[10]).toBe("function"); // the v10 → v11 step exists (CONTRACT-MIG)
    expect(MIGRATIONS[10](JSON.parse(JSON.stringify(v10)))).toEqual({ ...v10, schemaVersion: 11 }); // and stamps the version only
    const upgraded = migrate(JSON.parse(JSON.stringify(v10)));
    expect({ version: upgraded.schemaVersion, resumable: isResumable(upgraded) }).toEqual({ version: CURRENT_SCHEMA_VERSION, resumable: true });
    expect(upgraded.session.state.pendingLeaveEvents).toEqual([leave]); // no field added: absent means its card's mana value
    const stamped = { ...leave, lkiCopyMv: 1 };
    const v11 = { ...upgraded, session: { ...upgraded.session, state: { ...upgraded.session.state, pendingLeaveEvents: [stamped] } } };
    expect(migrate(JSON.parse(JSON.stringify(v11))).session.state.pendingLeaveEvents).toEqual([stamped]);
  });
  // CONTRACT-MIG (the play-weighted slice pw22): a v12 game may carry a pending tutor choice's `eachPlayerSearch` (Field of Ruin), a
  // permanent's `myriadToken`, a pending `myriad` trigger, an `end-of-combat` delayed record (the copies' exile) and a stack object's
  // last-known source record with `counters` (Descent into Avernus). An earlier save has none, and absent means what every earlier game
  // says, so v11 → v12 stamps the version only. The round trip: a v12 game holding each new shape survives save → JSON → migrate, and the
  // legend rule still keeps the creature that isn't a copy.
  it("carries a v11 save forward to v12 (stamp-only; a v12 game's each-player search, myriad copy, trigger, delayed exile and last-known counters round-trip)", async () => {
    const { applyLegendRule } = await import("../learn/gameState.js");
    const empty = { life: 40, battlefield: [], hand: [], graveyard: [], exile: [], library: [] };
    const v11 = {
      schemaVersion: 11, kind: "learn-session-save", savedAt: "2026-11-03T00:00:00.000Z", sessionId: "learn-v11", serializable: true,
      session: { id: "learn-v11", difficulty: "expert", mode: "standard", status: "active",
        state: { turn: 5, idSeq: 3, stack: [], log: [], rngSeed: 9, continuousEffects: [], timestampCounter: 4, players: { user: { ...empty }, ai: { ...empty } } },
        decisionLog: [] },
      checksum: "sha256:stale-but-unused-after-verify",
    };
    expect([typeof MIGRATIONS[10], typeof MIGRATIONS[11]]).toEqual(["function", "function"]); // a continuous chain; the v11 → v12 step exists (CONTRACT-MIG)
    expect(MIGRATIONS[11](JSON.parse(JSON.stringify(v11)))).toEqual({ ...v11, schemaVersion: 12 }); // and stamps the version only
    const upgraded = migrate(JSON.parse(JSON.stringify(v11)));
    expect({ version: upgraded.schemaVersion, resumable: isResumable(upgraded), state: upgraded.session.state }).toEqual({ version: CURRENT_SCHEMA_VERSION, resumable: true, state: v11.session.state });
    const perm = (id, card, extra = {}) => ({ id, card: { id: `c-${id}`, ...card }, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, timestamp: 1, ...extra });
    const legend = { name: "Isamaru, Hound of Konda", type: "Legendary Creature — Dog", power: "2", toughness: "2", oracle: "" };
    const original = perm("isamaru", legend, { timestamp: 1 });
    const copy = perm("tok-1", { ...legend, token: true }, { timestamp: 2, tapped: true, myriadToken: true });
    const descentLki = { permanentId: "desc", controller: "user", isCreature: false, colors: ["R"], types: ["Enchantment"], keywords: [], power: 0, counters: { descent: 4 } };
    const state = { ...v11.session.state,
      stack: [{ id: "stk-1", kind: "ability", controller: "user", source: { permanentId: "desc", name: "Descent into Avernus" },
        payload: { resolver: "manual", params: { controller: "user", sourceId: "desc", targets: [], context: { abilitySourceLki: descentLki } } } }],
      players: { user: { ...empty, battlefield: [original, copy] }, ai: { ...empty, library: [{ id: "ai-lib0", name: "Forest", type: "Basic Land — Forest", oracle: "" }] } },
      pendingChoice: { kind: "tutor-search", controller: "user", candidates: [], sourceName: "Field of Ruin", filterLabel: "basic land card", filter: { groups: [["basic", "land"]] }, destination: "battlefield", entersTapped: false, remaining: 1, sourceZone: "library", sourceZones: null, destinations: null, mayFailToFind: true,
        eachPlayerSearch: { atom: { op: "tutor", eachPlayer: false, filter: { groups: [["basic", "land"]] }, filterLabel: "basic land card", destination: "battlefield", entersTapped: false, targetType: null }, rest: ["ai"], cardName: "Field of Ruin" } },
      pendingTriggers: [{ event: "myriad", source: { permanentId: "isamaru", cardId: "c-isamaru", name: legend.name }, controller: "user", descriptor: { event: "myriad" }, context: { defendingPlayerId: "ai", myriadLastKnown: original.card }, targets: [],
        reflexiveProgram: { structure: "sequence", atoms: [{ op: "myriad", optional: true, targetType: null }] }, xValue: null, payload: { resolver: "manual", params: { controller: "user", targets: [], context: { defendingPlayerId: "ai" } } } }],
      delayedTriggers: [{ id: "dly-1-5", controller: "user", fireStep: "end-of-combat", fireScope: "any", effectClause: "[minted-leave exile tok-1]", sourceName: legend.name, sourceCardId: null, sourcePermanentId: "isamaru", createdTurn: 5 }] };
    const v12 = { ...upgraded, session: { ...upgraded.session, state } };
    expect(isSerializable(v12.session).ok).toBe(true);
    const back = migrate(JSON.parse(JSON.stringify(v12)));
    expect({ version: back.schemaVersion, state: back.session.state }).toEqual({ version: CURRENT_SCHEMA_VERSION, state }); // the chain runs on to v13 since pw23
    const kept = applyLegendRule(back.session.state).state.players.user.battlefield.map((p) => p.id);
    expect(kept).toEqual(["isamaru"]);
  });
  // CONTRACT-MIG (the play-weighted slice pw23): a v13 game may carry a player's `castNamesThisGame` (Approach of the Second Sun), a
  // permanent's `vowAgainst` beside its `vow` counter (Promise of Loyalty) and, paused mid-Promise, `state.vowPoolsThisWay`. An earlier
  // save has none, and absent means what every earlier game says, so the migration stamps the version only. The round trip: each survives
  // save → JSON → migrate and still plays — the vowed creature is not offered an attack at the player it promised.
  it("carries a v12 save forward to v13 (stamp-only; a v13 game's tally, vow and paused pools round-trip, and the vow still binds)", async () => {
    const { legalActionsForPlayer } = await import("../learn/legalChoices.js");
    const empty = { life: 40, battlefield: [], hand: [], graveyard: [], exile: [], library: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } };
    const v12 = {
      schemaVersion: 12, kind: "learn-session-save", savedAt: "2026-11-03T00:00:00.000Z", sessionId: "learn-v12", serializable: true,
      session: { id: "learn-v12", difficulty: "expert", mode: "standard", status: "active",
        state: { turn: 5, idSeq: 3, stack: [], log: [], rngSeed: 9, continuousEffects: [], timestampCounter: 4, players: { user: { ...empty }, ai: { ...empty } } },
        decisionLog: [] },
      checksum: "sha256:stale-but-unused-after-verify",
    };
    expect(typeof MIGRATIONS[12]).toBe("function"); // the v12 → v13 step exists (CONTRACT-MIG)
    expect(MIGRATIONS[12](JSON.parse(JSON.stringify(v12)))).toEqual({ ...v12, schemaVersion: 13 }); // and stamps the version only
    const upgraded = migrate(JSON.parse(JSON.stringify(v12)));
    expect({ version: upgraded.schemaVersion, resumable: isResumable(upgraded), state: upgraded.session.state }).toEqual({ version: CURRENT_SCHEMA_VERSION, resumable: true, state: v12.session.state });
    const perm = (id, card, extra = {}) => ({ id, card: { id: `c-${id}`, ...card }, controller: "ai", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, timestamp: 1, enteredOnTurn: 1, ...extra });
    const wurm = perm("wurm", { name: "Craw Wurm", type: "Creature — Wurm", power: "6", toughness: "4", oracle: "" }, { counters: { vow: 1 }, vowAgainst: ["user"] });
    const state = { ...v12.session.state, activePlayer: "ai", priorityHolder: "ai", phase: "combat", step: "declare-attackers", combat: null, turnOrder: ["user", "ai"], mode: "standard",
      players: { user: { ...empty, castNamesThisGame: { "Approach of the Second Sun": 1 } }, ai: { ...empty, battlefield: [wurm] } },
      vowPoolsThisWay: { ai: ["wurm"] } };
    const v13 = { ...upgraded, session: { ...upgraded.session, state } };
    expect(isSerializable(v13.session).ok).toBe(true);
    const back = migrate(JSON.parse(JSON.stringify(v13)));
    expect({ version: back.schemaVersion, state: back.session.state }).toEqual({ version: CURRENT_SCHEMA_VERSION, state }); // the chain runs on past v13 since pw24
    const attacks = (st) => legalActionsForPlayer(st, "ai").filter((a) => a.kind === "declare-attacker" && a.permanentId === "wurm").length;
    const freed = { ...back.session.state, players: { ...back.session.state.players, ai: { ...back.session.state.players.ai, battlefield: [{ ...wurm, counters: { vow: 0 } }] } } };
    expect({ vowed: attacks(back.session.state), freed: attacks(freed) }).toEqual({ vowed: 0, freed: 1 }); // the control: the same board without the counter attacks
  });
  // CONTRACT-MIG (the play-weighted slice pw24): a v14 game may carry a pending discard's `perDiscardDraw` (Syphon Mind), a delayed
  // record's `watchCombatDamage` (Hunter's Insight), a removeKeyword's `cantHave` and a targetShield's `hexproof` (Arcane Lighthouse,
  // Veil of Summer), a tutor choice's `pickFilters` / `entrySourceId` and a permanent's `enteredViaAbilityOf` (Krosan Verge, Kodama of
  // the East Tree), a permanent's `becameAura` (Necromancy), `exertedTurn` and an attacker entry's `exerted` (Combat Celebrant). An
  // earlier save has none, and absent means what every earlier game says, so v13 → v14 stamps the version only. The round trip: each survives save → JSON → migrate and still plays — the
  // Celebrant exerted this turn isn't offered the exert again, and the watched creature's combat damage still draws.
  it("carries a v13 save forward to v14 (stamp-only; a v14 game's pw24 shapes round-trip, the exert stamp and the damage watch still read)", async () => {
    const { legalActionsForPlayer } = await import("../learn/legalChoices.js");
    const { checkCombatDamageTriggers } = await import("../learn/triggers.js");
    const empty = { life: 40, battlefield: [], hand: [], graveyard: [], exile: [], library: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } };
    const v13 = {
      schemaVersion: 13, kind: "learn-session-save", savedAt: "2026-11-03T00:00:00.000Z", sessionId: "learn-v13", serializable: true,
      session: { id: "learn-v13", difficulty: "expert", mode: "standard", status: "active",
        state: { turn: 6, idSeq: 3, stack: [], log: [], rngSeed: 9, continuousEffects: [], timestampCounter: 4, players: { user: { ...empty }, ai: { ...empty } } },
        decisionLog: [] },
      checksum: "sha256:stale-but-unused-after-verify",
    };
    expect(typeof MIGRATIONS[13]).toBe("function"); // the v13 → v14 step exists (CONTRACT-MIG; graduated by pw26's v14 → v15 — no longer the last)
    expect(MIGRATIONS[13](JSON.parse(JSON.stringify(v13)))).toEqual({ ...v13, schemaVersion: 14 }); // no land face in play: the version only
    const upgraded = migrate(JSON.parse(JSON.stringify(v13)));
    expect({ version: upgraded.schemaVersion, resumable: isResumable(upgraded), state: upgraded.session.state }).toEqual({ version: CURRENT_SCHEMA_VERSION, resumable: true, state: v13.session.state });
    const perm = (id, card, extra = {}) => ({ id, card: { id: `c-${id}`, ...card }, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, timestamp: 1, enteredOnTurn: 1, ...extra });
    const celebrant = perm("cel", { name: "Combat Celebrant", type: "Creature — Human Warrior", power: "4", toughness: "1",
      oracle: "If this creature hasn't been exerted this turn, you may exert it as it attacks. When you do, untap all other creatures you control and after this phase, there is an additional combat phase. (An exerted creature won't untap during your next untap step.)" },
    { exertedTurn: 6, doesNotUntapNext: "user" });
    const giant = perm("hg", { name: "Hill Giant", type: "Creature — Giant", power: "3", toughness: "3", oracle: "" }, { tapped: true, enteredViaAbilityOf: "kodama" });
    const necro = perm("nec", { name: "Necromancy", type: "Enchantment", oracle: "" }, { becameAura: true });
    const state = { ...v13.session.state, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers", turnOrder: ["user", "ai"], mode: "standard",
      combat: { attackers: [{ permanentId: "hg", attackingPlayer: "user", defender: "ai", exerted: true }], blockers: [] },
      players: { user: { ...empty, battlefield: [celebrant, giant, necro], library: [{ id: "l1", name: "Forest", type: "Basic Land — Forest", oracle: "" }, { id: "l2", name: "Forest", type: "Basic Land — Forest", oracle: "" }, { id: "l3", name: "Forest", type: "Basic Land — Forest", oracle: "" }] }, ai: { ...empty } },
      continuousEffects: [
        { id: "ce-1", layer: 6, op: { layerOp: "removeKeyword", keyword: "Hexproof", cantHave: true }, affects: { mode: "fixed", permanentIds: ["hg"] }, duration: { kind: "endOfTurn", turn: 6 }, source: { kind: "resolution", permanentId: null, cardName: "Arcane Lighthouse" }, timestamp: 2 },
        { id: "ce-2", layer: 6, op: { layerOp: "targetShield", colors: ["B"], opponentsOnly: true, hexproof: true }, affects: { mode: "fixed", permanentIds: ["hg"] }, duration: { kind: "endOfTurn", turn: 6 }, source: { kind: "resolution", permanentId: null, cardName: "Veil of Summer" }, timestamp: 3 },
      ],
      delayedTriggers: [{ id: "dly-1-6", controller: "user", watchCombatDamage: "hg", recipients: "playerOrPlaneswalker", effectClause: "draw that many cards", sourceName: "Hunter's Insight", sourceCardId: null, sourcePermanentId: null, createdTurn: 6 }],
      pendingChoice: { kind: "discard", controller: "ai", remaining: 1, candidates: [], queue: [], sourceName: "Syphon Mind", connive: null, perDiscardDraw: { controller: "user", count: 1 } } };
    const v14 = { ...upgraded, session: { ...upgraded.session, state } };
    expect(isSerializable(v14.session).ok).toBe(true);
    const back = migrate(JSON.parse(JSON.stringify(v14)));
    expect({ version: back.schemaVersion, state: back.session.state }).toEqual({ version: CURRENT_SCHEMA_VERSION, state }); // graduated (pw26): carried on to the current version
    const resumed = { ...back.session.state, pendingChoice: undefined };
    const exertOffers = legalActionsForPlayer(resumed, "user").filter((a) => a.kind === "declare-attacker" && a.permanentId === "cel").map((a) => !!a.exert);
    const fired = checkCombatDamageTriggers(resumed, [{ kind: "combat-damage-player", attackerId: "hg", attackingPlayer: "user", defender: "ai", amount: 3 }]).pendingTriggers || [];
    expect({ exertOffers, watch: fired.map((t) => [t.descriptor.effectClause, t.context.combatDamageAmount]) }).toEqual({ exertOffers: [false], watch: [["draw that many cards", 3]] });
  });
  // CONTRACT-MIG (the recheck of pw24, R2): v13 → v14 also rewrites one stored value. A modal DFC played as its land face is a permanent
  // whose card is the face view, and a v13 build stored that view with the combined card's mana value (its front face's). The save below
  // was made by the base build (9decc956: the person plays Turntimber, Serpentine Wood, declines the 3 life, and serialization.serializeState
  // writes the game — pw24-evidence/scripts/r2-basesave.mjs), copied verbatim: its land reads 7. Migrated, it reads 0, as a fresh game
  // does (CR 712.8f, 202.3a); the combined card it returns to when it leaves (`printedCard`) keeps its front face's 7 (CR 712.8a), and
  // nothing else in the save changes.
  it("carries a v13 save's land face forward with its own mana value: Turntimber, Serpentine Wood saved by the base build reads 7, resumes at 0 (CR 712.8f, 202.3a)", async () => {
    const { permanentManaValue } = await import("../learn/layers.js");
    const v13 = {"schemaVersion":13,"kind":"learn-session-save","savedAt":"2026-11-03T00:00:00.000Z","sessionId":"learn-tt","serializable":true,"session":{"id":"learn-tt","difficulty":"expert","mode":"standard","status":"active","state":{"turn":5,"idSeq":1,"mode":"standard","activePlayer":"user","turnOrder":["user","ai"],"priorityHolder":"user","phase":"precombat-main","step":"main","stack":[],"pendingTriggers":[],"delayedTriggers":[],"continuousEffects":[],"timestampCounter":0,"rngSeed":0,"players":{"user":{"life":40,"startingLife":40,"poison":0,"energy":0,"commanderDamageFrom":{},"commanderCastCount":{},"manaPool":{"W":0,"U":0,"B":0,"R":0,"G":0,"C":0},"manaHold":{"W":0,"U":0,"B":0,"R":0,"G":0,"C":0},"library":[],"hand":[],"battlefield":[{"id":"perm-1","card":{"name":"Turntimber, Serpentine Wood","type":"Land","mana":"","oracle":"As this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {G}.","layout":"modal_dfc","cmc":7,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"],"id":"user-tt","faceIndex":1,"mdfcOf":"Turntimber Symbiosis // Turntimber, Serpentine Wood"},"controller":"user","tapped":true,"summoningSick":true,"counters":{},"damageMarked":0,"attachments":[],"attachedTo":null,"enteredOnTurn":null,"printedCard":{"name":"Turntimber Symbiosis // Turntimber, Serpentine Wood","type":"Sorcery // Land","mana":"{4}{G}{G}{G}","oracle":"Turntimber Symbiosis - Sorcery {4}{G}{G}{G}\nLook at the top seven cards of your library. You may put a creature card from among them onto the battlefield. If that card has mana value 3 or less, it enters with three additional +1/+1 counters on it. Put the rest on the bottom of your library in a random order.\n//\nTurntimber, Serpentine Wood - Land \nAs this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {G}.","layout":"modal_dfc","cmc":7,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"],"id":"user-tt"}}],"graveyard":[],"exile":[],"companion":null,"command":[],"commanderIdentity":null,"emblems":[],"experience":0,"radCounters":0,"landsPlayedThisTurn":1,"extraLandsThisTurn":0,"cardsDrawnThisTurn":0,"drawnThisTurnIds":[],"spellsCastThisTurn":0,"nextSpellUncounterable":false,"noncreatureSpellsCastThisTurn":0,"creaturesDiedThisTurn":0,"sacrificedThisTurn":[],"attackedThisTurn":false,"hasMulliganed":false},"ai":{"life":40,"startingLife":40,"poison":0,"energy":0,"commanderDamageFrom":{},"commanderCastCount":{},"manaPool":{"W":0,"U":0,"B":0,"R":0,"G":0,"C":0},"manaHold":{"W":0,"U":0,"B":0,"R":0,"G":0,"C":0},"library":[],"hand":[],"battlefield":[],"graveyard":[],"exile":[],"companion":null,"command":[],"commanderIdentity":null,"emblems":[],"experience":0,"radCounters":0,"landsPlayedThisTurn":0,"extraLandsThisTurn":0,"cardsDrawnThisTurn":0,"drawnThisTurnIds":[],"spellsCastThisTurn":0,"nextSpellUncounterable":false,"noncreatureSpellsCastThisTurn":0,"creaturesDiedThisTurn":0,"sacrificedThisTurn":[],"attackedThisTurn":false,"hasMulliganed":false}},"log":[{"turn":5,"kind":"optional-life-payment-pending","controller":"user","amount":3,"sourceName":"Turntimber, Serpentine Wood"},{"turn":5,"kind":"play-land","playerId":"user","cardName":"Turntimber, Serpentine Wood"},{"turn":5,"kind":"spell-effect","effect":"optional-life-payment","controller":"user","paid":false,"amount":3,"permanentId":"perm-1"}],"consecutivePasses":0},"decisionLog":[]},"checksum":"sha256:stale-but-unused-after-verify"};
    const land = (d) => d.session.state.players.user.battlefield[0];
    const before = { cmc: land(v13).card.cmc, mv: permanentManaValue(v13.session.state, land(v13)) };
    const back = migrate(JSON.parse(JSON.stringify(v13)));
    const expected = JSON.parse(JSON.stringify(v13));
    expected.schemaVersion = CURRENT_SCHEMA_VERSION; // graduated (pw26): migrate carries it on to the current version
    land(expected).card.cmc = 0;
    expect({ before, after: { cmc: land(back).card.cmc, mv: permanentManaValue(back.session.state, land(back)), printed: land(back).printedCard.cmc }, doc: back })
      .toEqual({ before: { cmc: 7, mv: 7 }, after: { cmc: 0, mv: 0, printed: 7 }, doc: expected });
  });
  // CONTRACT-MIG (the play-weighted slice pw26): a v15 game may carry a pending discard's `conniveN` (Spymaster's Vault), a protection-color
  // pause's `grantText` and the Skrelv atom it runs, a toxic grant's `toxicAmount` and a `cantBeBlockedByColor` effect (Skrelv, Defector
  // Mite), a target's `slotPlayer` (Grasp of Fate) and an ability-source record's `attachedTo` (Tarrian's Soulcleaver). An earlier save has
  // none, and absent means what every earlier game says, so v14 → v15 stamps the version only. The round trip: each survives save → JSON →
  // migrate and still plays — the connive's last discard places the tallied counters in one placement, the toxic grant and the colour
  // evasion still read, and "equipped creature" still finds the creature a departed Equipment was attached to.
  it("carries a v14 save forward to v15 (stamp-only; a v15 game's pw26 shapes round-trip, the connive tally and the grants still read)", async () => {
    const { resolveDiscardChoice } = await import("../learn/effects/runProgram.js");
    const { grantedToxicAmount, permanentUnblockableByColors } = await import("../learn/layers.js");
    const { equippedTargets } = await import("../learn/effects/atoms/shared.js");
    const empty = { life: 40, battlefield: [], hand: [], graveyard: [], exile: [], library: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } };
    const v14 = {
      schemaVersion: 14, kind: "learn-session-save", savedAt: "2026-11-03T00:00:00.000Z", sessionId: "learn-v14", serializable: true,
      session: { id: "learn-v14", difficulty: "expert", mode: "standard", status: "active",
        state: { turn: 6, idSeq: 3, stack: [], log: [], rngSeed: 9, continuousEffects: [], timestampCounter: 4, players: { user: { ...empty }, ai: { ...empty } } },
        decisionLog: [] },
      checksum: "sha256:stale-but-unused-after-verify",
    };
    expect([typeof MIGRATIONS[14], typeof MIGRATIONS[15]]).toEqual(["function", "function"]); // the v14 → v15 step exists (CONTRACT-MIG); graduated (pw27): v15 → v16 follows it
    expect(MIGRATIONS[14](JSON.parse(JSON.stringify(v14)))).toEqual({ ...v14, schemaVersion: 15 }); // the version only
    const upgraded = migrate(JSON.parse(JSON.stringify(v14)));
    expect({ version: upgraded.schemaVersion, resumable: isResumable(upgraded), state: upgraded.session.state }).toEqual({ version: CURRENT_SCHEMA_VERSION, resumable: true, state: v14.session.state });
    const perm = (id, card, extra = {}) => ({ id, card: { id: `c-${id}`, ...card }, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, timestamp: 1, enteredOnTurn: 1, ...extra });
    const bears = perm("bears", { name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" });
    const hand = [{ id: "h0", name: "Hill Giant", type: "Creature — Giant", oracle: "" }, { id: "h1", name: "Forest", type: "Basic Land — Forest", oracle: "" }];
    const state = { ...v14.session.state, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", turnOrder: ["user", "ai"], mode: "standard",
      players: { user: { ...empty, battlefield: [bears, perm("grasp", { name: "Grasp of Fate", type: "Enchantment", oracle: "" })], hand },
        ai: { ...empty, battlefield: [perm("aigiant", { name: "Hill Giant", type: "Creature — Giant", power: "3", toughness: "3", oracle: "" }, { controller: "ai" })] } },
      continuousEffects: [
        { id: "ce-1", layer: 6, op: { layerOp: "addKeyword", keyword: "toxic", toxicAmount: 1 }, affects: { mode: "fixed", permanentIds: ["bears"] }, duration: { kind: "endOfTurn", turn: 6 }, source: { kind: "resolution", permanentId: null, cardName: "Skrelv, Defector Mite" }, timestamp: 2 },
        { id: "ce-2", layer: 6, op: { layerOp: "cantBeBlockedByColor", color: "R" }, affects: { mode: "fixed", permanentIds: ["bears"] }, duration: { kind: "endOfTurn", turn: 6 }, source: { kind: "resolution", permanentId: null, cardName: "Skrelv, Defector Mite" }, timestamp: 3 },
      ],
      pendingTriggers: [{ id: "pt-1", controller: "user", source: { permanentId: "cleaver", name: "Tarrian's Soulcleaver" }, descriptor: { event: "permanentLeaves", effectClause: "put a +1/+1 counter on equipped creature" },
        context: { abilitySourceLki: { permanentId: "cleaver", controller: "user", isCreature: false, colors: [], types: ["Artifact"], keywords: [], power: 0, attachedTo: "bears" } } }],
      // Grasp of Fate's enters trigger below the resolving Vault ability, its one target chosen for its slot's opponent (`slotPlayer`).
      stack: [{ id: "stk-1", kind: "triggered-ability", controller: "user", source: { permanentId: "grasp", name: "Grasp of Fate" }, cost: null,
        targets: [{ type: "permanent", id: "aigiant", controller: "ai", atomIndex: 0, slotPlayer: "ai" }],
        payload: { resolver: "effect-program", params: { controller: "user", sourceId: "grasp", context: { sourceId: "grasp" },
          program: { version: 1, source: "parser", confidence: "high", structure: "sequence", atoms: [{ op: "exile", targetType: "nonlandPermanent", restrictions: [{ kind: "controller", who: "opponent" }, { kind: "auraEntryModeled" }], minTargets: 0, maxTargets: 1, untilSourceLeaves: true, perOpponent: true }], modal: null, xSpell: false, unparsedTail: null },
          targets: [{ type: "permanent", id: "aigiant", controller: "ai", atomIndex: 0, slotPlayer: "ai" }] } } }],
      pendingChoice: { kind: "discard", controller: "user", remaining: 1, candidates: hand.map((c) => ({ id: c.id, name: c.name })), queue: [{ playerId: "user", remaining: 1 }],
        sourceName: "Spymaster's Vault", connive: null, conniveN: { permanentId: "bears", controller: "user", nonland: 1 } } };
    const v15 = { ...upgraded, session: { ...upgraded.session, state } };
    expect(isSerializable(v15.session).ok).toBe(true);
    const back = migrate(JSON.parse(JSON.stringify(v15)));
    expect({ version: back.schemaVersion, state: back.session.state }).toEqual({ version: CURRENT_SCHEMA_VERSION, state }); // graduated (pw27): the chain runs on to v16
    const settled = resolveDiscardChoice(back.session.state, "h0");
    const lki = back.session.state.pendingTriggers[0].context.abilitySourceLki;
    expect({
      counters: settled.players.user.battlefield[0].counters["+1/+1"] ?? 0, pending: settled.pendingChoice ?? null,
      toxic: grantedToxicAmount(back.session.state, "bears"), unblockableBy: [...permanentUnblockableByColors(back.session.state, "bears")],
      equipped: equippedTargets(back.session.state, { sourceId: "cleaver", abilitySourceLki: lki }).map((t) => t.id),
    }).toEqual({ counters: 2, pending: null, toxic: 1, unblockableBy: ["R"], equipped: ["bears"] });
    // A person's Grasp of Fate between its two questions (the review of pw26, F2): ai's slot answered (`chosen`), ai2's asked next.
    const { raiseTriggerTargetChoice } = await import("../learn/gameEngine.js");
    const t = (id, controller) => ({ type: "permanent", id, controller, atomIndex: 0, slotPlayer: controller });
    const waiting = { ...state, pendingChoice: undefined, pendingTriggers: [], humanSeats: ["user"],
      players: { ...state.players, ai2: { ...empty, battlefield: [perm("ai2sol", { name: "Sol Ring", type: "Artifact", oracle: "{T}: Add {C}{C}." }, { controller: "ai2" })] } },
      stack: [{ ...state.stack[0], targets: [], payload: { ...state.stack[0].payload, params: { ...state.stack[0].payload.params, targets: [] } },
        awaitingTargets: { candidates: [{ targets: [t("ai2sol", "ai2")] }, { targets: [] }], abilityText: "When this enchantment enters, …",
          perOpponent: { slots: [[{ targets: [t("aigiant", "ai")] }, { targets: [] }], [{ targets: [t("ai2sol", "ai2")] }, { targets: [] }]], at: 1, chosen: [t("aigiant", "ai")] } } }] };
    const backWaiting = migrate(JSON.parse(JSON.stringify({ ...v15, session: { ...v15.session, state: waiting } }))).session.state;
    expect(backWaiting).toEqual(waiting);
    expect(raiseTriggerTargetChoice(backWaiting).pendingChoice?.candidates.map((c) => c.targets.map((x) => x.id))).toEqual([["ai2sol"], []]);
  });
  // CONTRACT-MIG (the play-weighted slice pw27): a v16 game may carry the turn's combat damage ledger (`combatDamageToPlayersThisTurn` —
  // Steel Hellkite), the life lost this turn by a seat that left (`departedLifeLostThisTurn` — Neheb, the Eternal) and a search's top four
  // (`searchTopIds` on a pending tutor choice — Aven Mindcensor). An earlier save has none, and absent means what every earlier game says,
  // so v15 → v16 stamps the version only. The round trip: each survives save → JSON → migrate and still reads.
  it("carries a v15 save forward to v16 (stamp-only; a v16 game's pw27 shapes round-trip and still read)", async () => {
    const { nonlandPermanentsDamagedBySourceWithManaValue, countForSpec } = await import("../learn/effects/atoms/shared.js");
    const { resolveTutorChoice } = await import("../learn/effects/runProgram.js");
    const empty = { life: 40, battlefield: [], hand: [], graveyard: [], exile: [], library: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } };
    const v15 = {
      schemaVersion: 15, kind: "learn-session-save", savedAt: "2026-11-03T00:00:00.000Z", sessionId: "learn-v15", serializable: true,
      session: { id: "learn-v15", difficulty: "expert", mode: "standard", status: "active",
        state: { turn: 7, idSeq: 3, stack: [], log: [], rngSeed: 11, continuousEffects: [], timestampCounter: 2, players: { user: { ...empty }, ai: { ...empty } } },
        decisionLog: [] },
      checksum: "sha256:stale-but-unused-after-verify",
    };
    expect([typeof MIGRATIONS[15], typeof MIGRATIONS[16]]).toEqual(["function", "undefined"]); // the v15 → v16 step exists and is the last (CONTRACT-MIG)
    expect(MIGRATIONS[15](JSON.parse(JSON.stringify(v15)))).toEqual({ ...v15, schemaVersion: 16 }); // the version only
    const upgraded = migrate(JSON.parse(JSON.stringify(v15)));
    expect({ version: upgraded.schemaVersion, resumable: isResumable(upgraded), state: upgraded.session.state }).toEqual({ version: CURRENT_SCHEMA_VERSION, resumable: true, state: v15.session.state });
    const perm = (id, card, controller) => ({ id, card: { id: `c-${id}`, ...card }, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, timestamp: 1, enteredOnTurn: 1 });
    const lib = ["l1", "l2", "l3", "l4", "l5"].map((id, i) => ({ id, name: i === 4 ? "Plains" : "Forest", type: i === 4 ? "Basic Land — Plains" : "Basic Land — Forest", oracle: "" }));
    const state = { ...v15.session.state, activePlayer: "user", priorityHolder: "user", phase: "postcombat-main", step: "main", turnOrder: ["user", "ai"], mode: "standard", pendingTriggers: [],
      players: { user: { ...empty, lifeLostThisTurn: 0, library: lib, battlefield: [perm("hk", { name: "Steel Hellkite", type: "Artifact Creature — Dragon", cmc: 6, power: "5", toughness: "5", oracle: "" }, "user")] },
        ai: { ...empty, lifeLostThisTurn: 5, battlefield: [perm("stone", { name: "Mind Stone", type: "Artifact", cmc: 2, oracle: "" }, "ai"), perm("ring", { name: "Sol Ring", type: "Artifact", cmc: 1, oracle: "" }, "ai")] } },
      combatDamageToPlayersThisTurn: { turn: 7, bySource: { hk: ["ai"] } },
      departedLifeLostThisTurn: [{ playerId: "ai2", amount: 4, turn: 7 }],
      pendingChoice: { kind: "tutor-search", controller: "user", candidates: [{ id: "l1", name: "Forest" }, { id: "l2", name: "Forest" }], sourceName: "Explosive Vegetation", filterLabel: "basic land card",
        filter: { groups: [["basic", "land"]] }, sourceZone: "library", sourceZones: null, destination: "hand", entersTapped: false, remaining: 2, destinations: null, mayFailToFind: true,
        searchTopIds: ["l1", "l2", "l3", "l4"] } };
    const v16 = { ...upgraded, session: { ...upgraded.session, state } };
    expect(isSerializable(v16.session).ok).toBe(true);
    const back = migrate(JSON.parse(JSON.stringify(v16)));
    expect({ version: back.schemaVersion, state: back.session.state }).toEqual({ version: CURRENT_SCHEMA_VERSION, state });
    const s = back.session.state;
    const second = resolveTutorChoice(s, "l1").pendingChoice;
    expect({
      destroyed: nonlandPermanentsDamagedBySourceWithManaValue(s, { sourceId: "hk", xValue: 2 }).map((t) => t.id),
      lifeLost: countForSpec(s, { controller: "user" }, { kind: "opponentsLifeLostThisTurn" }),
      secondPick: { cands: (second?.candidates || []).map((c) => c.id), top: second?.searchTopIds },
    }).toEqual({ destroyed: ["stone"], lifeLost: 9, secondPick: { cands: ["l2"], top: ["l1", "l2", "l3", "l4"] } });
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
