import { describe, it, expect } from "vitest";

import { tableSnapshot } from "./tableSnapshot.js";

function player({ life = 40, hand = 0, board = 0, gy = 0, cmd = {} } = {}) {
  return {
    life,
    hand: Array(hand).fill({}),
    battlefield: Array(board).fill({}),
    graveyard: Array(gy).fill({}),
    commanderDamageFrom: cmd,
  };
}

describe("tableSnapshot", () => {
  it("returns [] for an empty/invalid state", () => {
    expect(tableSnapshot(null)).toEqual([]);
    expect(tableSnapshot({})).toEqual([]);
  });

  it("emits one entry per seat, in turn order, with counts + flags", () => {
    const state = {
      turnOrder: ["user", "ai1", "ai2", "ai3"],
      activePlayer: "ai1",
      players: {
        user: player({ life: 38, hand: 5, board: 7, gy: 2 }),
        ai1: player({ life: 40, hand: 6, board: 3 }),
        ai2: player({ life: 21, hand: 7, board: 9, cmd: { user: 6 } }),
        ai3: player({ life: 12 }),
      },
    };
    const snap = tableSnapshot(state);
    expect(snap.map((s) => s.id)).toEqual(["user", "ai1", "ai2", "ai3"]);
    expect(snap[0]).toMatchObject({
      id: "user",
      isUser: true,
      isActive: false,
      life: 38,
      handCount: 5,
      boardCount: 7,
      graveyardCount: 2,
    });
    expect(snap[1]).toMatchObject({ id: "ai1", isUser: false, isActive: true });
    expect(snap[2].commanderDamage).toEqual({ user: 6 });
  });

  it("falls back to player keys when turnOrder is missing", () => {
    const state = { activePlayer: "user", players: { user: player(), ai: player() } };
    expect(
      tableSnapshot(state)
        .map((s) => s.id)
        .sort(),
    ).toEqual(["ai", "user"]);
  });

  it("omits a seat that's been removed from players but lingers in turnOrder", () => {
    const state = {
      turnOrder: ["user", "ai2"], // ai1 eliminated + pruned from players
      activePlayer: "user",
      players: { user: player(), ai2: player() },
    };
    expect(tableSnapshot(state).map((s) => s.id)).toEqual(["user", "ai2"]);
  });

  it("CMD-DAMAGE: maps a commander-card-id key to the commander's NAME for display (not a raw id)", () => {
    const omnath = { id: "omnath-card", name: "Omnath, Locus of Mana", isCommander: true };
    const state = {
      turnOrder: ["user", "ai1"],
      activePlayer: "user",
      players: {
        user: { ...player({ cmd: { "omnath-card": 14 } }), command: [] },
        ai1: { ...player(), command: [omnath] }, // ai1's commander, in its command zone → resolves the id
      },
    };
    expect(tableSnapshot(state)[0].commanderDamage).toEqual({ "Omnath, Locus of Mana": 14 });
  });

  it("flags a seat as eliminated when it is dead but still in the snapshot (no more '-4 life')", () => {
    const state = {
      turnOrder: ["user", "ai1", "ai2", "ai3", "ai4"],
      activePlayer: "user",
      players: {
        user: player({ life: 30 }), // alive
        ai1: player({ life: -4 }), // dead by damage — the reported "-4 life" case
        ai2: { ...player({ life: 12 }), poison: 10 }, // dead by poison
        ai3: player({ life: 20, cmd: { "cmdr-x": 21 } }), // dead by 21 commander damage
        ai4: { ...player({ life: 8 }), lostGame: true }, // explicit loss (e.g. Door to Nothingness)
      },
    };
    const snap = tableSnapshot(state);
    const by = Object.fromEntries(snap.map((s) => [s.id, s.eliminated]));
    expect(by).toEqual({ user: false, ai1: true, ai2: true, ai3: true, ai4: true });
    // Life is still carried (the UI shows the badge instead, but the datum is intact).
    expect(snap.find((s) => s.id === "ai1").life).toBe(-4);
  });
});
