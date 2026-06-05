/**
 * PR 10.1 wiring tests — the end-to-end unblock: with lands on the
 * battlefield and an EMPTY mana pool (the real in-game state), a spell is
 * castable and casting auto-taps to pay. Plus the explicit tap-for-mana
 * action (Beginner/floating) and that floated mana persists in the pool.
 */

import { describe, expect, it } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions, parseManaCost } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";

function landPerm(name, id, colorType, { tapped = false } = {}) {
  return { id, card: { name, type: `Basic Land — ${colorType}` }, controller: "user", tapped, summoningSick: false, counters: {} };
}

function baseState({ hand = [], battlefield = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    phase: "precombat-main",
    step: "main",
    activePlayer: "user",
    priorityHolder: "user",
    startingPlayer: "user",
    consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, hand, battlefield },
    },
  };
}

describe("PR 10.1 — casting off an empty pool", () => {
  it("makes a spell castable when untapped lands can cover it (empty pool)", () => {
    const state = baseState({
      hand: [{ id: "bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}" }],
      battlefield: [landPerm("Forest", "f1", "Forest"), landPerm("Forest", "f2", "Forest")],
    });
    // Pool is empty (the real in-game state). Pre-fix this was never castable.
    expect(state.players.user.manaPool).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
    const casts = filterActions(legalActionsForPlayer(state, "user"), "cast-spell");
    expect(casts.map(c => c.name)).toContain("Grizzly Bears");
  });

  it("is NOT castable when the lands can't cover the colored cost", () => {
    const state = baseState({
      hand: [{ id: "bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}" }],
      battlefield: [landPerm("Island", "i1", "Island"), landPerm("Island", "i2", "Island")],
    });
    const casts = filterActions(legalActionsForPlayer(state, "user"), "cast-spell");
    expect(casts.map(c => c.name)).not.toContain("Grizzly Bears");
  });

  it("auto-taps lands to pay when the spell is cast", () => {
    const state = baseState({
      hand: [{ id: "bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}" }],
      battlefield: [landPerm("Forest", "f1", "Forest"), landPerm("Forest", "f2", "Forest")],
    });
    const after = dispatchAction(state, {
      kind: "cast-spell",
      playerId: "user",
      cardId: "bear",
      cost: parseManaCost("{1}{G}"),
    });
    // Both forests tapped, pool emptied by the payment, bear on the stack.
    expect(after.players.user.battlefield.every(p => p.tapped)).toBe(true);
    expect(after.players.user.manaPool).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
    expect(after.stack).toHaveLength(1);
    expect(after.players.user.hand).toHaveLength(0);
  });

  it("only taps as many sources as the cost needs", () => {
    const state = baseState({
      hand: [{ id: "elf", name: "Llanowar Elves", type: "Creature — Elf", mana: "{G}" }],
      battlefield: [landPerm("Forest", "f1", "Forest"), landPerm("Forest", "f2", "Forest"), landPerm("Forest", "f3", "Forest")],
    });
    const after = dispatchAction(state, {
      kind: "cast-spell",
      playerId: "user",
      cardId: "elf",
      cost: parseManaCost("{G}"),
    });
    const tapped = after.players.user.battlefield.filter(p => p.tapped);
    expect(tapped).toHaveLength(1); // {G} needs exactly one Forest
  });
});

describe("PR 10.1 — tap-for-mana action + floating", () => {
  it("surfaces tap-for-mana in the player's own main phase", () => {
    const state = baseState({ battlefield: [landPerm("Forest", "f1", "Forest")] });
    const taps = filterActions(legalActionsForPlayer(state, "user"), "tap-for-mana");
    expect(taps).toHaveLength(1);
    expect(taps[0]).toMatchObject({ permanentId: "f1", color: "G", amount: 1 });
  });

  it("does NOT surface tap-for-mana outside the main step", () => {
    const state = { ...baseState({ battlefield: [landPerm("Forest", "f1", "Forest")] }), step: "upkeep", phase: "beginning" };
    expect(filterActions(legalActionsForPlayer(state, "user"), "tap-for-mana")).toHaveLength(0);
  });

  it("tapping for mana floats it in the pool and taps the source", () => {
    const state = baseState({ battlefield: [landPerm("Forest", "f1", "Forest")] });
    const after = dispatchAction(state, { kind: "tap-for-mana", playerId: "user", permanentId: "f1", color: "G", amount: 1 });
    expect(after.players.user.manaPool.G).toBe(1); // floated
    expect(after.players.user.battlefield[0].tapped).toBe(true);
    expect(after.priorityHolder).toBe("user"); // mana ability doesn't change priority
  });

  it("a floated pool pays a later cast with zero additional taps", () => {
    // Float 2 green, then cast a {1}{G} spell — should pay from the pool.
    let state = baseState({
      hand: [{ id: "bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}" }],
      battlefield: [landPerm("Forest", "f1", "Forest"), landPerm("Forest", "f2", "Forest")],
    });
    state = dispatchAction(state, { kind: "tap-for-mana", playerId: "user", permanentId: "f1", color: "G", amount: 1 });
    state = dispatchAction(state, { kind: "tap-for-mana", playerId: "user", permanentId: "f2", color: "G", amount: 1 });
    expect(state.players.user.manaPool.G).toBe(2);
    const after = dispatchAction(state, { kind: "cast-spell", playerId: "user", cardId: "bear", cost: parseManaCost("{1}{G}") });
    // Both lands were already tapped for the float; the cast pays from the pool.
    expect(after.players.user.manaPool).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
    expect(after.stack).toHaveLength(1);
  });
});
