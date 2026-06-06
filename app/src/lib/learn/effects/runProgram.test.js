/**
 * Tests for effects/runProgram.js — the `effect-program` resolver: the
 * all-or-nothing confidence gate, the Arbiter-seam route on low confidence,
 * registry registration, and end-to-end resolution through resolveTopOfStack.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "../gameState.js";
import { runEffectProgram } from "./runProgram.js";
import { RESOLVERS, RESOLVER_KEYS, getResolver } from "../resolvers.js";
import { resolveTopOfStack } from "../gameEngine.js";

beforeEach(() => _resetIdsForTests());

function cr(name, id, controller, { power = 2, toughness = 2 } = {}) {
  return { id, card: { name, type: "Creature — Bear", power, toughness, oracle: "" }, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
}
// createGameState opens at step "untap", which grants NO priority — so
// resolveTopOfStack just resolves the top and returns, isolating resolution.
function freshState(over = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, ...over };
}
function stackObj(program, { controller = "user", targets = [], source = { name: "Test Spell", oracle: "" }, id = "stk-1" } = {}) {
  return { id, kind: "spell", source, controller, targets, cost: null, payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program, controller, targets } } };
}

const high = (atoms) => ({ version: 1, source: "parser", confidence: "high", structure: "sequence", atoms, unparsedTail: null });

describe("runEffectProgram — confidence gate", () => {
  it("high confidence runs every atom (deal-damage kills the targeted creature)", () => {
    let state = freshState();
    state = { ...state, players: { ...state.players, ai: { ...state.players.ai, battlefield: [cr("Ogre", "ogre", "ai", { toughness: 3 })] } } };
    const obj = stackObj(high([{ op: "deal-damage", amount: 3, targetType: "creature" }]), { targets: [{ type: "creature", id: "ogre" }] });
    const out = runEffectProgram(state, obj);
    expect(out.players.ai.graveyard.map(c => c.name)).toEqual(["Ogre"]);
    expect(out.pendingArbiter).toBeUndefined();
  });

  it("low confidence runs ZERO atoms and flags the Arbiter seam", () => {
    const state = freshState();
    const lowProgram = { version: 1, confidence: "low", structure: "sequence", atoms: [], unparsedTail: "Counter target spell." };
    const obj = stackObj(lowProgram, { source: { name: "Counterspell", oracle: "Counter target spell." }, id: "stk-9" });
    const out = runEffectProgram(state, obj);
    expect(out.pendingArbiter).toMatchObject({ stackObjectId: "stk-9", cardName: "Counterspell", controller: "user" });
    expect(out.log.some(l => l.kind === "spell-unresolved")).toBe(true);
  });

  it("runs multi-atom programs in printed order (CR 608.2c)", () => {
    let state = freshState();
    state = { ...state, players: { ...state.players, user: { ...state.players.user, library: [{ id: "l1", name: "L1" }, { id: "l2", name: "L2" }] } } };
    const before = state.players.user.hand.length;
    const obj = stackObj(high([{ op: "draw", amount: 1 }, { op: "draw", amount: 1 }]));
    const out = runEffectProgram(state, obj);
    expect(out.players.user.hand.length).toBe(before + 2);
    expect(out.pendingArbiter).toBeUndefined();
  });
});

describe("effect-program resolver registration + end-to-end", () => {
  it("is a built-in resolver under the reserved key", () => {
    expect(getResolver(RESOLVER_KEYS.EFFECT_PROGRAM)).toBe(RESOLVERS[RESOLVER_KEYS.EFFECT_PROGRAM]);
    expect(typeof getResolver(RESOLVER_KEYS.EFFECT_PROGRAM)).toBe("function");
  });

  it("resolves end-to-end through resolveTopOfStack and pops the stack", () => {
    let state = freshState();
    state = {
      ...state,
      players: { ...state.players, ai: { ...state.players.ai, battlefield: [cr("Bear", "bear", "ai", { toughness: 2 })] } },
      stack: [stackObj(high([{ op: "deal-damage", amount: 2, targetType: "creature" }]), { targets: [{ type: "creature", id: "bear" }] })],
    };
    const out = resolveTopOfStack(state);
    expect(out.stack).toHaveLength(0);
    expect(out.players.ai.graveyard.map(c => c.name)).toEqual(["Bear"]);
  });

  it("routes a low-confidence program to the Arbiter seam through resolveTopOfStack", () => {
    const lowProgram = { version: 1, confidence: "low", structure: "sequence", atoms: [], unparsedTail: "x" };
    const state = freshState({ stack: [stackObj(lowProgram, { source: { name: "Cyclonic Rift", oracle: "x" }, id: "stk-cr" })] });
    const out = resolveTopOfStack(state);
    expect(out.stack).toHaveLength(0);
    expect(out.pendingArbiter?.cardName).toBe("Cyclonic Rift");
    expect(out.log.some(l => l.kind === "spell-unresolved")).toBe(true);
  });
});
