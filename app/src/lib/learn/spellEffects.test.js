/**
 * PR 11.2 — spell-effect parsing, targeting, AI selection, and resolution.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import {
  parseSpellEffect,
  effectNeedsTarget,
  enumerateTargets,
  chooseAITarget,
  resolveSpellEffect,
} from "./spellEffects.js";

beforeEach(() => _resetIdsForTests());

function cr(name, id, controller, { power = 2, toughness = 2 } = {}) {
  return { id, card: { name, type: "Creature — Bear", power, toughness, oracle: "" }, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
}
function st({ userBf = [], aiBf = [], userLife = 40, aiLife = 40 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf, life: userLife },
      ai: { ...s.players.ai, battlefield: aiBf, life: aiLife },
    },
  };
}

describe("parseSpellEffect", () => {
  it("parses burn to any target", () => {
    expect(parseSpellEffect({ type: "Instant", oracle: "Lightning Bolt deals 3 damage to any target." }))
      .toEqual({ kind: "damage", amount: 3, targetType: "any" });
  });
  it("parses damage to target creature / player / each opponent", () => {
    expect(parseSpellEffect({ type: "Instant", oracle: "Deals 2 damage to target creature." })).toMatchObject({ kind: "damage", targetType: "creature" });
    expect(parseSpellEffect({ type: "Sorcery", oracle: "Deals 4 damage to target player." })).toMatchObject({ kind: "damage", targetType: "player" });
    expect(parseSpellEffect({ type: "Sorcery", oracle: "Deals 1 damage to each opponent." })).toMatchObject({ kind: "damage", targetType: "eachOpponent" });
  });
  it("parses destroy target creature", () => {
    expect(parseSpellEffect({ type: "Instant", oracle: "Destroy target nonblack creature." })).toEqual({ kind: "destroy", targetType: "creature" });
  });
  it("parses draw N cards", () => {
    expect(parseSpellEffect({ type: "Sorcery", oracle: "Draw two cards." })).toEqual({ kind: "draw", amount: 2, targetType: null });
    expect(parseSpellEffect({ type: "Sorcery", oracle: "Draw a card." })).toEqual({ kind: "draw", amount: 1, targetType: null });
  });
  it("returns null for permanents and unrecognized spells", () => {
    expect(parseSpellEffect({ type: "Creature — Bear", oracle: "" })).toBeNull();
    expect(parseSpellEffect({ type: "Instant", oracle: "Counter target spell." })).toBeNull();
    expect(parseSpellEffect({ type: "Sorcery", oracle: "" })).toBeNull();
  });
  it("effectNeedsTarget is true only for single-target effects", () => {
    expect(effectNeedsTarget({ kind: "damage", targetType: "any" })).toBe(true);
    expect(effectNeedsTarget({ kind: "draw", targetType: null })).toBe(false);
    expect(effectNeedsTarget({ kind: "damage", targetType: "eachOpponent" })).toBe(false);
  });
});

describe("enumerateTargets", () => {
  it("lists creatures, players, or both per target type", () => {
    const state = st({ userBf: [cr("A", "a", "user")], aiBf: [cr("B", "b", "ai")] });
    expect(enumerateTargets(state, "user", { targetType: "creature" }).map(t => t.id).sort()).toEqual(["a", "b"]);
    expect(enumerateTargets(state, "user", { targetType: "player" }).map(t => t.id).sort()).toEqual(["ai", "user"]);
    expect(enumerateTargets(state, "user", { targetType: "any" }).length).toBe(4);
    expect(enumerateTargets(state, "user", { targetType: null })).toEqual([]);
  });
});

describe("chooseAITarget", () => {
  it("destroy picks the biggest enemy creature, never its own", () => {
    const state = st({ userBf: [cr("Big", "big", "user", { power: 4, toughness: 4 }), cr("Small", "sm", "user", { power: 1, toughness: 1 })], aiBf: [cr("Mine", "mine", "ai", { power: 9, toughness: 9 })] });
    const targets = enumerateTargets(state, "ai", { targetType: "creature" });
    const pick = chooseAITarget(state, "ai", { kind: "destroy", targetType: "creature" }, targets);
    expect(pick.id).toBe("big"); // biggest ENEMY creature (not the 9/9 it owns)
  });
  it("destroy returns null when only friendly creatures exist", () => {
    const state = st({ aiBf: [cr("Mine", "mine", "ai")] });
    const targets = enumerateTargets(state, "ai", { targetType: "creature" });
    expect(chooseAITarget(state, "ai", { kind: "destroy", targetType: "creature" }, targets)).toBeNull();
  });
  it("burn prefers a killable enemy creature, else the lowest-life enemy player", () => {
    const state = st({ userBf: [cr("Killable", "k", "user", { power: 2, toughness: 2 })], userLife: 5 });
    const targets = enumerateTargets(state, "ai", { targetType: "any" });
    const pick = chooseAITarget(state, "ai", { kind: "damage", amount: 3, targetType: "any" }, targets);
    expect(pick.id).toBe("k"); // can kill the 2-toughness creature

    const state2 = st({ userBf: [cr("Tank", "t", "user", { power: 1, toughness: 9 })], userLife: 4 });
    const targets2 = enumerateTargets(state2, "ai", { targetType: "any" });
    const pick2 = chooseAITarget(state2, "ai", { kind: "damage", amount: 3, targetType: "any" }, targets2);
    expect(pick2).toMatchObject({ type: "player", id: "user" }); // can't kill the 9-tough tank → burn the player
  });
});

describe("resolveSpellEffect", () => {
  it("damage to a creature kills it via the lethal SBA", () => {
    const state = st({ aiBf: [cr("Victim", "v", "ai", { power: 3, toughness: 3 })] });
    const after = resolveSpellEffect(state, { effect: { kind: "damage", amount: 3, targetType: "creature" }, controller: "user", targets: [{ type: "creature", id: "v" }] });
    expect(after.players.ai.graveyard.map(c => c.name)).toEqual(["Victim"]);
  });
  it("damage to a player loses life", () => {
    const state = st({ aiLife: 40 });
    const after = resolveSpellEffect(state, { effect: { kind: "damage", amount: 3, targetType: "player" }, controller: "user", targets: [{ type: "player", id: "ai" }] });
    expect(after.players.ai.life).toBe(37);
  });
  it("each-opponent damage hits every opponent", () => {
    const state = st({ aiLife: 40 });
    const after = resolveSpellEffect(state, { effect: { kind: "damage", amount: 2, targetType: "eachOpponent" }, controller: "user", targets: [] });
    expect(after.players.ai.life).toBe(38);
  });
  it("destroy moves the target creature to its graveyard", () => {
    const state = st({ aiBf: [cr("Doomed", "d", "ai", { power: 5, toughness: 5 })] });
    const after = resolveSpellEffect(state, { effect: { kind: "destroy", targetType: "creature" }, controller: "user", targets: [{ type: "creature", id: "d" }] });
    expect(after.players.ai.graveyard.map(c => c.name)).toEqual(["Doomed"]);
    expect(after.players.ai.battlefield).toHaveLength(0);
  });
  it("draw adds cards to the controller's hand", () => {
    let state = st();
    // Give the user a library to draw from.
    state = { ...state, players: { ...state.players, user: { ...state.players.user, library: [{ id: "l1", name: "L1" }, { id: "l2", name: "L2" }] } } };
    const after = resolveSpellEffect(state, { effect: { kind: "draw", amount: 2, targetType: null }, controller: "user", targets: [] });
    expect(after.players.user.hand.map(c => c.name)).toEqual(["L1", "L2"]);
  });
});
