/**
 * Tests for Phase 6 PR1 — gameState.js pure data layer.
 *
 * Everything here is immutability + correctness. The engine (PR2) will
 * exercise transitions; PR1 just has to be a solid foundation.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetIdsForTests,
  mintId,
  PLAYER_IDS, ZONES, MANA_COLORS, PHASES, STEPS,
  createGameState,
  createPlayerState,
  createPermanent,
  createStackObject,
  getPlayer,
  getZone,
  findPermanent,
  totalAvailableMana,
  opponentOf,
  moveCardToZone,
  drawCards,
  shuffleLibrary,
  putCardsOnBottom,
  tapPermanent,
  untapPermanent,
  untapAll,
  addCounter,
  removeCounter,
  getCounter,
  addMana,
  emptyManaPoolForPlayer,
  emptyAllManaPools,
  loseLife,
  gainLife,
  addCommanderDamage,
  resetTurnCounters,
  logEvent,
} from "./gameState.js";

function card(name, extra = {}) {
  return { id: `card-${name}-${extra.suffix || "x"}`, name, ...extra };
}

function makeDeck(count, namePrefix = "C") {
  return Array.from({ length: count }, (_, i) => ({ id: `card-${namePrefix}-${i}`, name: `${namePrefix} ${i}` }));
}

beforeEach(() => {
  _resetIdsForTests();
});

describe("constants", () => {
  it("exposes the expected coordinate system", () => {
    expect(PLAYER_IDS).toEqual(["user", "ai"]);
    expect(ZONES).toContain("library");
    expect(ZONES).toContain("battlefield");
    expect(ZONES).toContain("command");
    expect(MANA_COLORS).toEqual(["W", "U", "B", "R", "G", "C"]);
    expect(PHASES).toContain("combat");
    expect(STEPS.combat).toContain("declare-attackers");
  });
});

describe("opponentOf", () => {
  it("maps user → ai and ai → user", () => {
    expect(opponentOf("user")).toBe("ai");
    expect(opponentOf("ai")).toBe("user");
  });
  it("throws on invalid player", () => {
    expect(() => opponentOf("eve")).toThrow();
  });
});

describe("createPlayerState", () => {
  it("creates an empty player at starting life with empty zones", () => {
    const player = createPlayerState({ library: makeDeck(99) });
    expect(player.life).toBe(40);  // Commander default
    expect(player.poison).toBe(0);
    expect(player.library).toHaveLength(99);
    expect(player.hand).toEqual([]);
    expect(player.battlefield).toEqual([]);
    expect(player.graveyard).toEqual([]);
    expect(player.exile).toEqual([]);
    expect(player.command).toEqual([]);
    expect(player.manaPool).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
  });

  it("seeds the command zone when commanderCards are provided", () => {
    const player = createPlayerState({
      library: makeDeck(99),
      commanderCards: [card("Atraxa")],
    });
    expect(player.command).toHaveLength(1);
    expect(player.command[0].name).toBe("Atraxa");
  });

  it("supports non-default starting life (e.g., for non-Commander)", () => {
    const player = createPlayerState({ library: [], life: 20 });
    expect(player.life).toBe(20);
  });
});

describe("createPermanent", () => {
  it("wraps a card with default flags", () => {
    const perm = createPermanent({ card: card("Llanowar Elves"), controller: "user" });
    expect(perm.card.name).toBe("Llanowar Elves");
    expect(perm.controller).toBe("user");
    expect(perm.tapped).toBe(false);
    expect(perm.summoningSick).toBe(true);
    expect(perm.counters).toEqual({});
    expect(perm.attachments).toEqual([]);
    expect(perm.attachedTo).toBeNull();
    expect(typeof perm.id).toBe("string");
  });

  it("respects explicit tapped/summoningSick flags", () => {
    const perm = createPermanent({
      card: card("Sol Ring"),
      controller: "ai",
      tapped: true,
      summoningSick: false,
    });
    expect(perm.tapped).toBe(true);
    expect(perm.summoningSick).toBe(false);
  });

  it("throws on missing card or invalid controller", () => {
    expect(() => createPermanent({ controller: "user" })).toThrow();
    expect(() => createPermanent({ card: card("X"), controller: "eve" })).toThrow();
  });

  it("generates unique IDs across calls", () => {
    const a = createPermanent({ card: card("A"), controller: "user" });
    const b = createPermanent({ card: card("B"), controller: "user" });
    expect(a.id).not.toBe(b.id);
  });
});

describe("createStackObject", () => {
  it("creates a spell with default empty targets", () => {
    const obj = createStackObject({ kind: "spell", source: card("Lightning Bolt"), controller: "user" });
    expect(obj.kind).toBe("spell");
    expect(obj.controller).toBe("user");
    expect(obj.targets).toEqual([]);
  });

  it("rejects unknown kinds", () => {
    expect(() => createStackObject({ kind: "alien", source: card("X"), controller: "user" })).toThrow();
  });
});

describe("createGameState", () => {
  it("creates a state with both players, decks, and starting phase", () => {
    const state = createGameState({
      userDeck: makeDeck(99, "U"),
      aiDeck: makeDeck(99, "A"),
      userCommanders: [card("Atraxa")],
      aiCommanders: [card("Edgar Markov")],
    });
    expect(state.turn).toBe(1);
    expect(state.activePlayer).toBe("user");
    expect(state.phase).toBe("beginning");
    expect(state.step).toBe("untap");
    expect(state.stack).toEqual([]);
    expect(state.players.user.library).toHaveLength(99);
    expect(state.players.user.command[0].name).toBe("Atraxa");
    expect(state.players.ai.command[0].name).toBe("Edgar Markov");
  });

  it("supports a custom activePlayer (e.g., AI goes first)", () => {
    const state = createGameState({ userDeck: [], aiDeck: [], activePlayer: "ai" });
    expect(state.activePlayer).toBe("ai");
  });
});

describe("immutability — every helper returns a NEW state", () => {
  function baseState() {
    return createGameState({ userDeck: makeDeck(60, "U"), aiDeck: makeDeck(60, "A") });
  }

  it("drawCards does not mutate the input", () => {
    const before = baseState();
    const beforeLib = before.players.user.library;
    const after = drawCards(before, { playerId: "user", count: 1 });
    expect(after).not.toBe(before);
    expect(after.players.user).not.toBe(before.players.user);
    expect(before.players.user.library).toBe(beforeLib);  // reference identity preserved
    expect(before.players.user.hand).toHaveLength(0);
    expect(after.players.user.hand).toHaveLength(1);
  });

  it("tapPermanent does not mutate the input permanent", () => {
    let state = baseState();
    state = drawCards(state, { playerId: "user", count: 1 });
    const cardId = state.players.user.hand[0].id;
    state = moveCardToZone(state, { playerId: "user", fromZone: "hand", toZone: "battlefield", cardId, becomePermanent: true });
    const beforePerm = state.players.user.battlefield[0];
    const after = tapPermanent(state, beforePerm.id);
    expect(beforePerm.tapped).toBe(false);
    expect(after.players.user.battlefield[0].tapped).toBe(true);
    expect(after.players.user.battlefield[0]).not.toBe(beforePerm);
  });

  it("addMana does not mutate the input mana pool", () => {
    const before = baseState();
    const beforePool = before.players.user.manaPool;
    const after = addMana(before, { playerId: "user", color: "G", amount: 3 });
    expect(beforePool.G).toBe(0);
    expect(after.players.user.manaPool.G).toBe(3);
    expect(beforePool).not.toBe(after.players.user.manaPool);
  });
});

describe("drawCards", () => {
  function state() {
    return createGameState({ userDeck: makeDeck(7, "U"), aiDeck: makeDeck(7, "A") });
  }

  it("draws cards from top of library to hand and increments cardsDrawnThisTurn", () => {
    const after = drawCards(state(), { playerId: "user", count: 3 });
    expect(after.players.user.library).toHaveLength(4);
    expect(after.players.user.hand).toHaveLength(3);
    expect(after.players.user.cardsDrawnThisTurn).toBe(3);
    // FIFO: first 3 cards from library came to hand in order
    expect(after.players.user.hand[0].name).toBe("U 0");
    expect(after.players.user.hand[2].name).toBe("U 2");
  });

  it("draws as many as possible when count exceeds library", () => {
    const after = drawCards(state(), { playerId: "user", count: 99 });
    expect(after.players.user.library).toHaveLength(0);
    expect(after.players.user.hand).toHaveLength(7);
    expect(after.players.user.cardsDrawnThisTurn).toBe(7);
  });

  it("draws 0 when count is 0", () => {
    const after = drawCards(state(), { playerId: "user", count: 0 });
    expect(after.players.user.hand).toHaveLength(0);
  });

  it("throws on negative count", () => {
    expect(() => drawCards(state(), { playerId: "user", count: -1 })).toThrow();
  });
});

describe("shuffleLibrary", () => {
  it("preserves library size and contents", () => {
    const state = createGameState({ userDeck: makeDeck(20, "U"), aiDeck: [] });
    const after = shuffleLibrary(state, { playerId: "user" });
    expect(after.players.user.library).toHaveLength(20);
    const beforeNames = new Set(state.players.user.library.map(c => c.name));
    const afterNames = new Set(after.players.user.library.map(c => c.name));
    expect(afterNames).toEqual(beforeNames);
  });

  it("respects a deterministic rng", () => {
    const state = createGameState({ userDeck: makeDeck(5, "U"), aiDeck: [] });
    const counter = (() => {
      const seq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
      let i = 0;
      return () => seq[i++ % seq.length];
    })();
    const a = shuffleLibrary(state, { playerId: "user", rng: counter });
    // Two independent shuffles with the same starting RNG sequence yield
    // identical results.
    const counter2 = (() => {
      const seq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
      let i = 0;
      return () => seq[i++ % seq.length];
    })();
    const b = shuffleLibrary(state, { playerId: "user", rng: counter2 });
    expect(a.players.user.library.map(c => c.id)).toEqual(b.players.user.library.map(c => c.id));
  });
});

describe("putCardsOnBottom", () => {
  it("moves named hand cards to the bottom of the library", () => {
    let state = createGameState({ userDeck: makeDeck(20, "U"), aiDeck: [] });
    state = drawCards(state, { playerId: "user", count: 5 });
    const handIds = state.players.user.hand.slice(0, 2).map(c => c.id);
    const after = putCardsOnBottom(state, { playerId: "user", cardIds: handIds });
    expect(after.players.user.hand).toHaveLength(3);
    expect(after.players.user.library).toHaveLength(17);
    // The two bottomed cards are at the end of the library.
    expect(after.players.user.library.slice(-2).map(c => c.id)).toEqual(handIds);
  });

  it("ignores card IDs not in hand", () => {
    let state = createGameState({ userDeck: makeDeck(5, "U"), aiDeck: [] });
    state = drawCards(state, { playerId: "user", count: 3 });
    const after = putCardsOnBottom(state, { playerId: "user", cardIds: ["nonexistent-id"] });
    expect(after.players.user.hand).toHaveLength(3);
    expect(after.players.user.library).toHaveLength(2);
  });
});

describe("moveCardToZone", () => {
  function setup() {
    return createGameState({
      userDeck: makeDeck(5, "U"),
      aiDeck: makeDeck(5, "A"),
    });
  }

  it("moves a card from hand to graveyard", () => {
    let state = setup();
    state = drawCards(state, { playerId: "user", count: 1 });
    const cardId = state.players.user.hand[0].id;
    const after = moveCardToZone(state, { playerId: "user", fromZone: "hand", toZone: "graveyard", cardId });
    expect(after.players.user.hand).toHaveLength(0);
    expect(after.players.user.graveyard).toHaveLength(1);
    expect(after.players.user.graveyard[0].id).toBe(cardId);
  });

  it("wraps a card in a permanent when entering the battlefield with becomePermanent:true", () => {
    let state = setup();
    state = drawCards(state, { playerId: "user", count: 1 });
    const cardId = state.players.user.hand[0].id;
    const after = moveCardToZone(state, { playerId: "user", fromZone: "hand", toZone: "battlefield", cardId, becomePermanent: true });
    expect(after.players.user.hand).toHaveLength(0);
    expect(after.players.user.battlefield).toHaveLength(1);
    const perm = after.players.user.battlefield[0];
    expect(perm.card.id).toBe(cardId);
    expect(perm.controller).toBe("user");
    expect(typeof perm.id).toBe("string");
    expect(perm.id).not.toBe(cardId);
  });

  it("unwraps a permanent when leaving the battlefield", () => {
    let state = setup();
    state = drawCards(state, { playerId: "user", count: 1 });
    const cardId = state.players.user.hand[0].id;
    state = moveCardToZone(state, { playerId: "user", fromZone: "hand", toZone: "battlefield", cardId, becomePermanent: true });
    const permId = state.players.user.battlefield[0].id;
    state = addCounter(state, { permanentId: permId, type: "+1/+1", amount: 2 });
    // Now destroy it — move to graveyard. Counters should NOT survive.
    const after = moveCardToZone(state, {
      playerId: "user",
      fromZone: "battlefield",
      toZone: "graveyard",
      cardId: permId,
    });
    expect(after.players.user.battlefield).toHaveLength(0);
    expect(after.players.user.graveyard).toHaveLength(1);
    // The graveyard has the card object, not a permanent.
    expect(after.players.user.graveyard[0].counters).toBeUndefined();
  });

  it("throws when the card is not in the source zone", () => {
    const state = setup();
    expect(() =>
      moveCardToZone(state, { playerId: "user", fromZone: "hand", toZone: "graveyard", cardId: "nope" })
    ).toThrow();
  });
});

describe("permanent helpers", () => {
  function setupWithPermanent() {
    let state = createGameState({ userDeck: makeDeck(5, "U"), aiDeck: [] });
    state = drawCards(state, { playerId: "user", count: 1 });
    const cardId = state.players.user.hand[0].id;
    state = moveCardToZone(state, { playerId: "user", fromZone: "hand", toZone: "battlefield", cardId, becomePermanent: true });
    const permId = state.players.user.battlefield[0].id;
    return { state, permId };
  }

  it("taps and untaps a single permanent", () => {
    const { state, permId } = setupWithPermanent();
    let next = tapPermanent(state, permId);
    expect(next.players.user.battlefield[0].tapped).toBe(true);
    next = untapPermanent(next, permId);
    expect(next.players.user.battlefield[0].tapped).toBe(false);
  });

  it("untapAll clears tapped and summoningSick for the active player", () => {
    let { state, permId } = setupWithPermanent();
    state = tapPermanent(state, permId);
    expect(state.players.user.battlefield[0].tapped).toBe(true);
    expect(state.players.user.battlefield[0].summoningSick).toBe(true);

    const next = untapAll(state, { playerId: "user" });
    expect(next.players.user.battlefield[0].tapped).toBe(false);
    expect(next.players.user.battlefield[0].summoningSick).toBe(false);
  });

  it("adds and removes counters; getCounter reads the current value", () => {
    const { state, permId } = setupWithPermanent();
    let next = addCounter(state, { permanentId: permId, type: "+1/+1", amount: 3 });
    expect(getCounter(next, permId, "+1/+1")).toBe(3);
    next = addCounter(next, { permanentId: permId, type: "+1/+1", amount: 2 });
    expect(getCounter(next, permId, "+1/+1")).toBe(5);
    next = removeCounter(next, { permanentId: permId, type: "+1/+1", amount: 4 });
    expect(getCounter(next, permId, "+1/+1")).toBe(1);
    next = removeCounter(next, { permanentId: permId, type: "+1/+1", amount: 10 });
    expect(getCounter(next, permId, "+1/+1")).toBe(0);
    // Counter type fully removed when value reaches 0.
    expect(next.players.user.battlefield[0].counters["+1/+1"]).toBeUndefined();
  });

  it("returns 0 from getCounter for missing permanent or type", () => {
    const { state } = setupWithPermanent();
    expect(getCounter(state, "nonexistent-id", "+1/+1")).toBe(0);
    expect(getCounter(state, state.players.user.battlefield[0].id, "loyalty")).toBe(0);
  });

  it("throws on operations against an unknown permanent", () => {
    const { state } = setupWithPermanent();
    expect(() => tapPermanent(state, "nope")).toThrow();
    expect(() => addCounter(state, { permanentId: "nope", type: "+1/+1" })).toThrow();
  });
});

describe("mana pool", () => {
  function s0() {
    return createGameState({ userDeck: [], aiDeck: [] });
  }

  it("addMana accumulates per color", () => {
    let state = addMana(s0(), { playerId: "user", color: "G", amount: 2 });
    state = addMana(state, { playerId: "user", color: "G", amount: 1 });
    state = addMana(state, { playerId: "user", color: "U", amount: 1 });
    expect(state.players.user.manaPool.G).toBe(3);
    expect(state.players.user.manaPool.U).toBe(1);
    expect(totalAvailableMana(state, "user")).toBe(4);
  });

  it("emptyManaPoolForPlayer drains exactly one side", () => {
    let state = addMana(s0(), { playerId: "user", color: "G", amount: 2 });
    state = addMana(state, { playerId: "ai", color: "B", amount: 1 });
    state = emptyManaPoolForPlayer(state, { playerId: "user" });
    expect(state.players.user.manaPool.G).toBe(0);
    expect(state.players.ai.manaPool.B).toBe(1);
  });

  it("emptyAllManaPools drains everyone", () => {
    let state = addMana(s0(), { playerId: "user", color: "G", amount: 2 });
    state = addMana(state, { playerId: "ai", color: "B", amount: 1 });
    state = emptyAllManaPools(state);
    expect(totalAvailableMana(state, "user")).toBe(0);
    expect(totalAvailableMana(state, "ai")).toBe(0);
  });

  it("rejects invalid colors", () => {
    expect(() => addMana(s0(), { playerId: "user", color: "Z", amount: 1 })).toThrow();
  });

  it("rejects negative amounts", () => {
    expect(() => addMana(s0(), { playerId: "user", color: "G", amount: -1 })).toThrow();
  });
});

describe("life and damage", () => {
  function s0() {
    return createGameState({ userDeck: [], aiDeck: [], startingLife: 40 });
  }

  it("loseLife reduces life by exact amount", () => {
    const state = loseLife(s0(), { playerId: "user", amount: 7 });
    expect(state.players.user.life).toBe(33);
  });

  it("loseLife can drop below 0 (SBA-checked downstream)", () => {
    const state = loseLife(s0(), { playerId: "user", amount: 99 });
    expect(state.players.user.life).toBe(-59);
  });

  it("gainLife adds to life", () => {
    const state = gainLife(s0(), { playerId: "user", amount: 5 });
    expect(state.players.user.life).toBe(45);
  });

  it("addCommanderDamage accumulates PER-COMMANDER (CR 903.10a — a single commander)", () => {
    let state = addCommanderDamage(s0(), { commanderId: "cmdr-a", toPlayer: "user", amount: 7 });
    state = addCommanderDamage(state, { commanderId: "cmdr-a", toPlayer: "user", amount: 3 });
    state = addCommanderDamage(state, { commanderId: "cmdr-b", toPlayer: "user", amount: 4 }); // a partner — tracked separately
    expect(state.players.user.commanderDamageFrom["cmdr-a"]).toBe(10);
    expect(state.players.user.commanderDamageFrom["cmdr-b"]).toBe(4);
  });

  it("addCommanderDamage ignores a missing commanderId or non-positive amount (no-op)", () => {
    const base = s0();
    expect(addCommanderDamage(base, { toPlayer: "user", amount: 5 })).toBe(base);                 // no commanderId
    expect(addCommanderDamage(base, { commanderId: "cmdr-a", toPlayer: "user", amount: 0 })).toBe(base); // zero amount
  });
});

describe("turn counter resets", () => {
  it("resetTurnCounters zeros out per-turn fields", () => {
    let state = createGameState({ userDeck: makeDeck(10, "U"), aiDeck: [] });
    state = drawCards(state, { playerId: "user", count: 4 });
    expect(state.players.user.cardsDrawnThisTurn).toBe(4);

    state = withLandsPlayed(state, "user", 1);
    state = resetTurnCounters(state, { playerId: "user" });
    expect(state.players.user.cardsDrawnThisTurn).toBe(0);
    expect(state.players.user.landsPlayedThisTurn).toBe(0);
  });
});

function withLandsPlayed(state, playerId, n) {
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...state.players[playerId], landsPlayedThisTurn: n },
    },
  };
}

describe("findPermanent", () => {
  it("finds a permanent across both battlefields", () => {
    let state = createGameState({ userDeck: makeDeck(5, "U"), aiDeck: makeDeck(5, "A") });
    state = drawCards(state, { playerId: "ai", count: 1 });
    const aiCardId = state.players.ai.hand[0].id;
    state = moveCardToZone(state, {
      playerId: "ai",
      fromZone: "hand",
      toZone: "battlefield",
      cardId: aiCardId,
      becomePermanent: true,
    });
    const permId = state.players.ai.battlefield[0].id;
    const found = findPermanent(state, permId);
    expect(found).toBeTruthy();
    expect(found.controller).toBe("ai");
    expect(found.permanent.id).toBe(permId);
  });

  it("returns null when no permanent matches", () => {
    const state = createGameState({ userDeck: [], aiDeck: [] });
    expect(findPermanent(state, "nope")).toBeNull();
  });
});

describe("getZone + getPlayer reads", () => {
  it("exposes per-player zones safely", () => {
    const state = createGameState({ userDeck: makeDeck(3, "U"), aiDeck: makeDeck(2, "A") });
    expect(getZone(state, "user", "library")).toHaveLength(3);
    expect(getZone(state, "ai", "library")).toHaveLength(2);
    expect(getPlayer(state, "user").life).toBe(40);
  });

  it("throws on bad inputs", () => {
    const state = createGameState({ userDeck: [], aiDeck: [] });
    expect(() => getPlayer(state, "eve")).toThrow();
    expect(() => getZone(state, "user", "bogus")).toThrow();
  });
});

describe("logEvent", () => {
  it("appends to the log with the current turn baked in", () => {
    let state = createGameState({ userDeck: [], aiDeck: [] });
    state = logEvent(state, { kind: "phase-change", phase: "beginning", step: "untap" });
    state = logEvent(state, { kind: "draw", playerId: "user", count: 1 });
    expect(state.log).toHaveLength(2);
    expect(state.log[0].turn).toBe(1);
    expect(state.log[0].kind).toBe("phase-change");
    expect(state.log[1].kind).toBe("draw");
  });
});

describe("mintId + state.idSeq (Phase-7 PR-0 deterministic ids)", () => {
  it("returns { id, state } with a prefix-N id and the counter advanced", () => {
    const state = createGameState({ userDeck: [], aiDeck: [] });
    expect(state.idSeq).toBe(0);
    const { id, state: next } = mintId(state, "perm");
    expect(id).toBe("perm-1");
    expect(next.idSeq).toBe(1);
  });

  it("is a pure function — same state in always yields the same id (serialize-stable)", () => {
    const state = { ...createGameState({ userDeck: [], aiDeck: [] }), idSeq: 6 };
    const a = mintId(state, "stk");
    const b = mintId(state, "stk");
    expect(a.id).toBe("stk-7");
    expect(b.id).toBe("stk-7");      // deterministic: didn't depend on call order or entropy
    expect(state.idSeq).toBe(6);     // input is not mutated
  });

  it("advances monotonically when threaded through the returned state", () => {
    let state = createGameState({ userDeck: [], aiDeck: [] });
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const m = mintId(state, "perm");
      ids.push(m.id);
      state = m.state;
    }
    expect(ids).toEqual(["perm-1", "perm-2", "perm-3"]);
    expect(state.idSeq).toBe(3);
  });

  it("createGameState seeds idSeq:0 in both modes", () => {
    const std = createGameState({ userDeck: [], aiDeck: [] });
    const cmd = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    expect(std.idSeq).toBe(0);
    expect(cmd.idSeq).toBe(0);
  });

  it("factories honor an explicit id over the legacy fallback", () => {
    const perm = createPermanent({ id: "perm-explicit", card: card("Bear"), controller: "user" });
    const stk = createStackObject({ id: "stk-explicit", kind: "spell", source: card("Bolt"), controller: "user" });
    expect(perm.id).toBe("perm-explicit");
    expect(stk.id).toBe("stk-explicit");
  });

  it("moveCardToZone mints a deterministic permanent id from state.idSeq", () => {
    let state = createGameState({ userDeck: makeDeck(2, "U"), aiDeck: makeDeck(2, "A") });
    state = drawCards(state, { playerId: "user", count: 2 });

    const firstCardId = state.players.user.hand[0].id;
    state = moveCardToZone(state, { playerId: "user", fromZone: "hand", toZone: "battlefield", cardId: firstCardId, becomePermanent: true });
    expect(state.players.user.battlefield[0].id).toBe("perm-1");
    expect(state.idSeq).toBe(1);     // counter advanced and persisted on the returned state

    const secondCardId = state.players.user.hand[0].id;
    state = moveCardToZone(state, { playerId: "user", fromZone: "hand", toZone: "battlefield", cardId: secondCardId, becomePermanent: true });
    expect(state.players.user.battlefield[1].id).toBe("perm-2");
    expect(state.idSeq).toBe(2);
  });
});
