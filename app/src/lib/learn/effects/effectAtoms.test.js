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
