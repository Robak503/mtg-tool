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

  it("P2.5 multi-clause: damages a creature AND draws a card in one resolution", () => {
    let state = freshState();
    state = {
      ...state,
      players: {
        ...state.players,
        user: { ...state.players.user, library: [{ id: "l1", name: "L1" }] },
        ai: { ...state.players.ai, battlefield: [cr("Ogre", "ogre", "ai", { toughness: 2 })] },
      },
    };
    const before = state.players.user.hand.length;
    // "Deal 2 damage to target creature. Draw a card." — untagged single target (legacy
    // path) applies to the only targeting atom; the draw atom ignores it.
    const obj = stackObj(high([{ op: "deal-damage", amount: 2, targetType: "creature" }, { op: "draw", amount: 1 }]),
      { targets: [{ type: "creature", id: "ogre" }] });
    const out = runEffectProgram(state, obj);
    expect(out.players.ai.graveyard.map(c => c.name)).toEqual(["Ogre"]); // creature died
    expect(out.players.user.hand.length).toBe(before + 1);               // and we drew
    expect(out.pendingArbiter).toBeUndefined();
  });

  it("P2.5 atomIndex binding: each atom only sees its OWN tagged targets", () => {
    let state = freshState();
    state = {
      ...state,
      players: {
        ...state.players,
        ai: { ...state.players.ai, battlefield: [cr("A", "a1", "ai", { toughness: 2 }), cr("B", "b1", "ai", { toughness: 2 })] },
      },
    };
    // Two damage atoms, each bound to a DIFFERENT creature via atomIndex. Atom 0 → a1,
    // atom 1 → b1. Both die; neither atom touches the other's target.
    const program = high([
      { op: "deal-damage", amount: 2, targetType: "creature" },
      { op: "deal-damage", amount: 2, targetType: "creature" },
    ]);
    const targets = [{ atomIndex: 0, type: "creature", id: "a1" }, { atomIndex: 1, type: "creature", id: "b1" }];
    const obj = { id: "stk-x", kind: "spell", source: { name: "Twin Bolt", oracle: "" }, controller: "user", targets, cost: null,
      payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program, controller: "user", targets } } };
    const out = runEffectProgram(state, obj);
    expect(out.players.ai.graveyard.map(c => c.name).sort()).toEqual(["A", "B"]);
  });
});

describe("runEffectProgram — X spells (amountX reads ctx.xValue)", () => {
  it("X-burn deals EXACTLY the bound X: X=5 kills a 5-toughness creature", () => {
    let state = freshState();
    state = { ...state, players: { ...state.players, ai: { ...state.players.ai, battlefield: [cr("Hydra", "hydra", "ai", { toughness: 5 })] } } };
    const targets = [{ type: "creature", id: "hydra" }];
    const obj = { id: "stk-x5", kind: "spell", source: { name: "Blaze", oracle: "" }, controller: "user", targets, cost: null,
      payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program: high([{ op: "deal-damage", targetType: "creature", amountX: true }]), controller: "user", targets, xValue: 5 } } };
    const out = runEffectProgram(state, obj);
    expect(out.players.ai.graveyard.map(c => c.name)).toEqual(["Hydra"]);
  });

  it("X-burn deals exactly X and no more: X=2 leaves a 5-toughness creature alive with 2 damage marked", () => {
    let state = freshState();
    state = { ...state, players: { ...state.players, ai: { ...state.players.ai, battlefield: [cr("Hydra", "hydra", "ai", { toughness: 5 })] } } };
    const targets = [{ type: "creature", id: "hydra" }];
    const obj = { id: "stk-x2", kind: "spell", source: { name: "Blaze", oracle: "" }, controller: "user", targets, cost: null,
      payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program: high([{ op: "deal-damage", targetType: "creature", amountX: true }]), controller: "user", targets, xValue: 2 } } };
    const out = runEffectProgram(state, obj);
    const hydra = out.players.ai.battlefield.find(p => p.id === "hydra");
    expect(hydra).toBeTruthy();
    expect(hydra.damageMarked).toBe(2);
  });

  it("X-burn to a player loses exactly X life", () => {
    const state = freshState();
    const targets = [{ type: "player", id: "ai" }];
    const obj = { id: "stk-xp", kind: "spell", source: { name: "Fireball", oracle: "" }, controller: "user", targets, cost: null,
      payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program: high([{ op: "deal-damage", targetType: "player", amountX: true }]), controller: "user", targets, xValue: 7 } } };
    const before = state.players.ai.life;
    const out = runEffectProgram(state, obj);
    expect(out.players.ai.life).toBe(before - 7);
  });

  it("X-draw draws exactly X cards", () => {
    let state = freshState();
    state = { ...state, players: { ...state.players, user: { ...state.players.user, library: [{ id: "l1", name: "L1" }, { id: "l2", name: "L2" }, { id: "l3", name: "L3" }, { id: "l4", name: "L4" }] } } };
    const before = state.players.user.hand.length;
    const obj = stackObj(high([{ op: "draw", targetType: null, amountX: true }]));
    obj.payload.params.xValue = 3;
    const out = runEffectProgram(state, obj);
    expect(out.players.user.hand.length).toBe(before + 3);
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

describe("P2.7 life atoms — resolution", () => {
  it("gain-life adds to the controller's life", () => {
    let state = freshState();
    const before = state.players.user.life;
    const out = runEffectProgram(state, stackObj(high([{ op: "gain-life", amount: 3 }])));
    expect(out.players.user.life).toBe(before + 3);
  });
  it("lose-life (controller) and each-opponent loss reduce the right players", () => {
    let state = freshState();
    const myBefore = state.players.user.life, oppBefore = state.players.ai.life;
    const out = runEffectProgram(state, stackObj(high([{ op: "lose-life", amount: 2, who: "controller" }])));
    expect(out.players.user.life).toBe(myBefore - 2);
    expect(out.players.ai.life).toBe(oppBefore); // controller-only

    const out2 = runEffectProgram(freshState(), stackObj(high([{ op: "lose-life", amount: 4, who: "eachOpponent" }])));
    expect(out2.players.ai.life).toBe(oppBefore - 4);
    expect(out2.players.user.life).toBe(myBefore); // the caster doesn't lose
  });
  it("a damage+gain-life rider runs BOTH atoms (Lightning Helix)", () => {
    let state = freshState();
    state = { ...state, players: { ...state.players, ai: { ...state.players.ai, battlefield: [cr("Ogre", "ogre", "ai", { toughness: 3 })] } } };
    const myBefore = state.players.user.life;
    const obj = stackObj(high([{ op: "deal-damage", amount: 3, targetType: "any" }, { op: "gain-life", amount: 3 }]),
      { targets: [{ type: "creature", id: "ogre" }] });
    const out = runEffectProgram(state, obj);
    expect(out.players.ai.graveyard.map(c => c.name)).toEqual(["Ogre"]); // 3 damage killed it
    expect(out.players.user.life).toBe(myBefore + 3);                    // and we gained 3
  });
});

describe("P2.7 targeted atoms — resolution", () => {
  const withOgre = (extra = {}) => {
    const s = freshState();
    return { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [cr("Ogre", "ogre", "ai", extra)] } } };
  };
  const aim = (op, props = {}) => stackObj(high([{ op, targetType: "creature", ...props }]), { targets: [{ type: "creature", id: "ogre" }] });

  it("tap taps the target creature", () => {
    const out = runEffectProgram(withOgre(), aim("tap"));
    expect(out.players.ai.battlefield.find(p => p.id === "ogre").tapped).toBe(true);
  });
  it("bounce returns the creature to its owner's hand", () => {
    const out = runEffectProgram(withOgre(), aim("bounce"));
    expect(out.players.ai.battlefield.find(p => p.id === "ogre")).toBeUndefined();
    expect(out.players.ai.hand.some(c => c.name === "Ogre")).toBe(true);
  });
  it("exile moves the creature to exile, NOT graveyard (no dies trigger)", () => {
    const out = runEffectProgram(withOgre(), aim("exile"));
    expect(out.players.ai.exile.some(c => c.name === "Ogre")).toBe(true);
    expect(out.players.ai.graveyard.some(c => c.name === "Ogre")).toBe(false);
  });
  it("a -1/-1 counter dropping toughness to 0 kills the creature (lethal SBA)", () => {
    const out = runEffectProgram(withOgre({ power: 1, toughness: 1 }), aim("add-counter", { counterType: "-1/-1", amount: 1 }));
    expect(out.players.ai.graveyard.map(c => c.name)).toEqual(["Ogre"]);
  });
  it("a +1/+1 counter buffs the creature and it survives", () => {
    const out = runEffectProgram(withOgre({ power: 2, toughness: 2 }), aim("add-counter", { counterType: "+1/+1", amount: 1 }));
    const ogre = out.players.ai.battlefield.find(p => p.id === "ogre");
    expect(ogre).toBeTruthy();
    expect(ogre.counters["+1/+1"]).toBe(1);
  });
});
