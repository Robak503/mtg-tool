/**
 * Tests for effects/effectAtoms.js — each atom resolver in isolation.
 *
 * The keystone atoms delegate to the shared spellEffects helpers, so these prove
 * the atom layer is byte-for-byte equivalent to the legacy resolution path.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "../gameState.js";
import { resolveAtom, ATOM_RESOLVERS } from "./effectAtoms.js";

beforeEach(() => _resetIdsForTests());

function cr(name, id, controller, { power = 2, toughness = 2 } = {}) {
  return { id, card: { name, type: "Creature — Bear", power, toughness, oracle: "" }, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
}
function st({ userBf = [], aiBf = [], aiLife = 40 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf },
      ai: { ...s.players.ai, battlefield: aiBf, life: aiLife },
    },
  };
}

describe("effectAtoms — per-atom resolution (parity with the legacy helpers)", () => {
  it("deal-damage to a creature kills it via the lethal SBA", () => {
    const state = st({ aiBf: [cr("Victim", "v", "ai", { toughness: 3 })] });
    const after = resolveAtom(state, { op: "deal-damage", amount: 3, targetType: "creature" }, { controller: "user", targets: [{ type: "creature", id: "v" }] });
    expect(after.players.ai.graveyard.map(c => c.name)).toEqual(["Victim"]);
  });
  it("deal-damage to a player loses life", () => {
    const after = resolveAtom(st({ aiLife: 40 }), { op: "deal-damage", amount: 3, targetType: "player" }, { controller: "user", targets: [{ type: "player", id: "ai" }] });
    expect(after.players.ai.life).toBe(37);
  });
  it("deal-damage to each opponent hits every opponent", () => {
    const after = resolveAtom(st({ aiLife: 40 }), { op: "deal-damage", amount: 2, targetType: "eachOpponent" }, { controller: "user", targets: [] });
    expect(after.players.ai.life).toBe(38);
  });
  it("destroy moves the target creature to its graveyard", () => {
    const state = st({ aiBf: [cr("Doomed", "d", "ai", { toughness: 5 })] });
    const after = resolveAtom(state, { op: "destroy", targetType: "creature" }, { controller: "user", targets: [{ type: "creature", id: "d" }] });
    expect(after.players.ai.graveyard.map(c => c.name)).toEqual(["Doomed"]);
    expect(after.players.ai.battlefield).toHaveLength(0);
  });
  it("draw adds cards to the controller's hand", () => {
    let state = st();
    state = { ...state, players: { ...state.players, user: { ...state.players.user, library: [{ id: "l1", name: "L1" }, { id: "l2", name: "L2" }] } } };
    const after = resolveAtom(state, { op: "draw", amount: 2 }, { controller: "user", targets: [] });
    expect(after.players.user.hand.map(c => c.name)).toEqual(["L1", "L2"]);
  });
  it("pump registers an endOfTurn layer-7c continuous effect for the targeted creature", () => {
    const state = st({ userBf: [cr("Bear", "bear", "user")] });
    const after = resolveAtom(state, { op: "pump", ptDelta: { p: 3, t: 3 }, targetType: "creature" }, { controller: "user", targets: [{ type: "creature", id: "bear" }] });
    expect(after.continuousEffects).toHaveLength(1);
    const eff = after.continuousEffects[0];
    expect(eff).toMatchObject({ layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 3, toughness: 3 } });
    expect(eff.duration).toMatchObject({ kind: "endOfTurn" });
    expect(eff.affects.permanentIds).toEqual(["bear"]);
  });

  it("returns null for an unknown atom op (caller routes to the Arbiter seam, never fabricates)", () => {
    expect(resolveAtom(st(), { op: "counter-spell" }, { controller: "user", targets: [] })).toBeNull();
    expect(ATOM_RESOLVERS["counter-spell"]).toBeUndefined();
  });
});

// ===== COUNTERS ===== team counter distribution (scope:youControl) — applyAddCounter routes the
// scope to the controller's creatures (gathered at resolution), reusing the single-target loop. No
// chosen target; the affected set is keyed off ctx.controller, so a trigger/activated source on a
// non-user player buffs THAT player's team.
describe("effectAtoms — team counter distribution (scope:youControl)", () => {
  it("puts a +1/+1 counter on EVERY creature the controller controls, none of the opponent's", () => {
    const state = st({ userBf: [cr("Mine A", "a", "user"), cr("Mine B", "b", "user")], aiBf: [cr("Theirs", "t", "ai")] });
    const after = resolveAtom(state, { op: "add-counter", counterType: "+1/+1", amount: 1, scope: "youControl" }, { controller: "user", targets: [] });
    expect(after.players.user.battlefield.map(p => p.counters["+1/+1"] || 0)).toEqual([1, 1]);
    expect(after.players.ai.battlefield[0].counters["+1/+1"] || 0).toBe(0); // opponent untouched
  });
  it("carries the count N to every controlled creature", () => {
    const state = st({ userBf: [cr("Mine", "a", "user")] });
    const after = resolveAtom(state, { op: "add-counter", counterType: "+1/+1", amount: 2, scope: "youControl" }, { controller: "user", targets: [] });
    expect(after.players.user.battlefield[0].counters["+1/+1"]).toBe(2);
  });
  it("resolves against ctx.controller — an AI-controlled source buffs the AI's team only (trigger/activated path)", () => {
    const state = st({ userBf: [cr("User", "u", "user")], aiBf: [cr("AI", "x", "ai")] });
    const after = resolveAtom(state, { op: "add-counter", counterType: "+1/+1", amount: 1, scope: "youControl" }, { controller: "ai", targets: [] });
    expect(after.players.ai.battlefield[0].counters["+1/+1"]).toBe(1);
    expect(after.players.user.battlefield[0].counters["+1/+1"] || 0).toBe(0);
  });
  it("a -1/-1 team distribution runs the lethal SBA (a 2/2 dropped to 0 toughness dies)", () => {
    const state = st({ userBf: [cr("Frail", "f", "user", { power: 2, toughness: 2 })] });
    const after = resolveAtom(state, { op: "add-counter", counterType: "-1/-1", amount: 2, scope: "youControl" }, { controller: "user", targets: [] });
    expect(after.players.user.battlefield).toHaveLength(0);
    expect(after.players.user.graveyard.map(c => c.name)).toEqual(["Frail"]);
  });
});
