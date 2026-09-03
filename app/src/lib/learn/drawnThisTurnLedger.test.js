/**
 * drawnThisTurnLedger.test.js — SG-15a (2026-09-03): the per-player DRAWN-THIS-TURN card ledger
 * (`drawnThisTurnIds`), stamped at the one draw chokepoint (drawCards) and cleared with the per-turn draw
 * counter. Substrate for Sylvan Library's "choose two cards in your hand drawn this turn" (and any
 * "cards drawn this turn" referent) — a pure engine fact, no coverage claim rides on it alone.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, drawCards, resetTurnCounters, resetCardsDrawnAllPlayers, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const card = (id) => ({ id, name: "Card " + id, type: "Instant", mana: "{U}", oracle: "" });

function board() {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, turn: 3,
    players: {
      ...s0.players,
      user: { ...s0.players.user, hand: [], library: [card("a"), card("b"), card("c"), card("d")] },
      ai: { ...s0.players.ai, hand: [], library: [card("x"), card("y")] },
    },
  };
}

describe("the ledger", () => {
  it("⭐ records the drawn cards' ids in draw order, across separate draws, alongside the count", () => {
    const one = drawCards(board(), { playerId: "user", count: 2 });
    expect(one.players.user.drawnThisTurnIds).toEqual(["a", "b"]);
    expect(one.players.user.cardsDrawnThisTurn).toBe(2);
    const two = drawCards(one, { playerId: "user", count: 1 });
    expect(two.players.user.drawnThisTurnIds).toEqual(["a", "b", "c"]);
    expect(two.players.ai.drawnThisTurnIds).toEqual([]);
  });

  it("a decked draw records only what was actually drawn", () => {
    const s = board();
    s.players.ai.library = [card("x")];
    const out = drawCards(s, { playerId: "ai", count: 3 });
    expect(out.players.ai.drawnThisTurnIds).toEqual(["x"]);
  });

  it("resetTurnCounters clears the active player's ledger; resetCardsDrawnAllPlayers clears every seat", () => {
    let s = drawCards(drawCards(board(), { playerId: "user", count: 2 }), { playerId: "ai", count: 1 });
    const a = resetTurnCounters(s, { playerId: "user" });
    expect(a.players.user.drawnThisTurnIds).toEqual([]);
    expect(a.players.ai.drawnThisTurnIds).toEqual(["x"]);
    const b = resetCardsDrawnAllPlayers(s);
    expect(b.players.user.drawnThisTurnIds).toEqual([]);
    expect(b.players.ai.drawnThisTurnIds).toEqual([]);
  });

  it("a legacy seat without the field (an old save) still draws and starts a fresh ledger", () => {
    const s = board();
    delete s.players.user.drawnThisTurnIds;
    const out = drawCards(s, { playerId: "user", count: 1 });
    expect(out.players.user.drawnThisTurnIds).toEqual(["a"]);
  });
});
