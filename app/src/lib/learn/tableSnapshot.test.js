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
    expect(snap.map(s => s.id)).toEqual(["user", "ai1", "ai2", "ai3"]);
    expect(snap[0]).toMatchObject({ id: "user", isUser: true, isActive: false, life: 38, handCount: 5, boardCount: 7, graveyardCount: 2 });
    expect(snap[1]).toMatchObject({ id: "ai1", isUser: false, isActive: true });
    expect(snap[2].commanderDamage).toEqual({ user: 6 });
  });

  it("falls back to player keys when turnOrder is missing", () => {
    const state = { activePlayer: "user", players: { user: player(), ai: player() } };
    expect(tableSnapshot(state).map(s => s.id).sort()).toEqual(["ai", "user"]);
  });

  it("omits a seat that's been removed from players but lingers in turnOrder", () => {
    const state = {
      turnOrder: ["user", "ai2"], // ai1 eliminated + pruned from players
      activePlayer: "user",
      players: { user: player(), ai2: player() },
    };
    expect(tableSnapshot(state).map(s => s.id)).toEqual(["user", "ai2"]);
  });
});
