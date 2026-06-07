/**
 * Tests for boardSnapshot.js — the full board view model.
 * Verifies information visibility (your hand revealed, opponents' hidden),
 * derived P/T, land/permanent split, zones, and the stack.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { boardSnapshot } from "./boardSnapshot.js";

beforeEach(() => _resetIdsForTests());

function creature(name, id, controller, { power = 2, toughness = 2, tapped = false, oracle = "" } = {}) {
  return { id, card: { id: `c-${id}`, name, type: "Creature — Sliver", power, toughness, oracle, mana: "{1}{G}" }, controller, tapped, summoningSick: false, counters: {}, attachments: [], attachedTo: null };
}
function land(name, id, controller, { tapped = false } = {}) {
  return { id, card: { id: `c-${id}`, name, type: "Basic Land — Forest", oracle: "" }, controller, tapped, summoningSick: false, counters: {}, attachments: [], attachedTo: null };
}

function baseState() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    turn: 5,
    step: "main",
    activePlayer: "user",
    priorityHolder: "user",
    players: {
      ...s.players,
      user: {
        ...s.players.user,
        life: 38,
        hand: [{ id: "h1", name: "Lightning Bolt", type: "Instant", mana: "{R}", oracle: "Deals 3 damage." }],
        library: [{ id: "l1", name: "X" }, { id: "l2", name: "Y" }],
        battlefield: [creature("Blur Sliver", "p1", "user", { power: 2, toughness: 2 }), land("Forest", "p2", "user", { tapped: true })],
        graveyard: [{ id: "g1", name: "Dead Sliver", type: "Creature — Sliver" }],
        exile: [],
        command: [{ id: "cmd1", name: "Sliver Hivelord", type: "Legendary Creature — Sliver" }],
      },
      ai: {
        ...s.players.ai,
        life: 40,
        hand: [{ id: "ah1", name: "Secret" }, { id: "ah2", name: "Secret2" }],
        battlefield: [creature("Goblin", "p3", "ai", { power: 1, toughness: 1 })],
      },
    },
    stack: [{ id: "stk1", kind: "spell", controller: "user", source: { name: "Lightning Bolt" }, targets: [{ type: "creature", id: "p3" }] }],
  };
}

describe("boardSnapshot", () => {
  it("reveals YOUR hand but only the COUNT of an opponent's hand", () => {
    const snap = boardSnapshot(baseState());
    const me = snap.players.find(p => p.id === "user");
    const opp = snap.players.find(p => p.id === "ai");
    expect(me.hand.map(c => c.name)).toEqual(["Lightning Bolt"]);
    expect(me.handCount).toBe(1);
    expect(opp.hand).toBeNull();          // hidden
    expect(opp.handCount).toBe(2);        // but the count is public
  });

  it("library is count-only (never reveals contents)", () => {
    const me = boardSnapshot(baseState()).players.find(p => p.id === "user");
    expect(me.libraryCount).toBe(2);
    expect(me).not.toHaveProperty("library");
  });

  it("splits lands from other permanents and includes derived P/T + tapped", () => {
    const me = boardSnapshot(baseState()).players.find(p => p.id === "user");
    expect(me.lands.map(l => l.name)).toEqual(["Forest"]);
    expect(me.lands[0].tapped).toBe(true);
    expect(me.permanents.map(c => c.name)).toEqual(["Blur Sliver"]);
    expect(me.permanents[0]).toMatchObject({ isCreature: true, power: 2, toughness: 2, tapped: false });
    expect(Array.isArray(me.permanents[0].keywords)).toBe(true);
  });

  it("exposes the public zones (graveyard / exile / command) for every player", () => {
    const me = boardSnapshot(baseState()).players.find(p => p.id === "user");
    expect(me.graveyard.map(c => c.name)).toEqual(["Dead Sliver"]);
    expect(me.exile).toEqual([]);
    expect(me.command.map(c => c.name)).toEqual(["Sliver Hivelord"]);
  });

  it("serializes turn/step/priority and the stack", () => {
    const snap = boardSnapshot(baseState());
    expect(snap).toMatchObject({ turn: 5, step: "main", activePlayer: "user", priorityHolder: "user" });
    expect(snap.stack).toEqual([{ id: "stk1", kind: "spell", name: "Lightning Bolt", controller: "user", targets: [{ type: "creature", id: "p3" }] }]);
    const me = snap.players.find(p => p.id === "user");
    expect(me.hasPriority).toBe(true);
    expect(me.isActive).toBe(true);
  });

  it("returns null for an empty state", () => {
    expect(boardSnapshot(null)).toBeNull();
    expect(boardSnapshot({})).toBeNull();
  });
});
