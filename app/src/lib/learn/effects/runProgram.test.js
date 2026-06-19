/**
 * Tests for effects/runProgram.js — the `effect-program` resolver: the
 * all-or-nothing confidence gate, the Arbiter-seam route on low confidence,
 * registry registration, and end-to-end resolution through resolveTopOfStack.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "../gameState.js";
import { runEffectProgram, resolveTutorChoice, autoPickTutorCandidate } from "./runProgram.js";
import { RESOLVERS, RESOLVER_KEYS, getResolver } from "../resolvers.js";
import { resolveTopOfStack } from "../gameEngine.js";
import { hasKeyword } from "../keywords.js";
import { permanentHasKeyword } from "../layers.js";
import { manaProduction, manaSources } from "../manaModel.js";

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

// ===== DMG-SCALE ===== (WALT-DMG-SCALE) the damage AMOUNT is a board count (`amountCount`) computed at
// resolution from the controller's current board/hand — not a printed number, not a chosen X.
describe("runEffectProgram — board-count damage (DMG-SCALE)", () => {
  const dmgAtom = (targetType, amountCount) => ({ op: "deal-damage", targetType, amountCount });
  const withBoard = (perms) => { const s = freshState(); return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: perms } } }; };
  const land = (name, id, sub) => ({ id, card: { name, type: `Basic Land — ${sub}`, oracle: "" }, controller: "user", tapped: false, summoningSick: false, counters: {} });

  it("deals damage to a player equal to the number of creatures you control (counted at resolution)", () => {
    const state = withBoard([cr("Bear", "b1", "user"), cr("Bear", "b2", "user"), cr("Bear", "b3", "user")]);
    const obj = stackObj(high([dmgAtom("player", { kind: "permanentsYouControl", cardType: "creature" })]), { targets: [{ type: "player", id: "ai" }] });
    expect(runEffectProgram(state, obj).players.ai.life).toBe(state.players.ai.life - 3);
  });
  it("counts a basic-land SUBTYPE (Mountains you control), ignoring other lands", () => {
    const state = withBoard([land("Mountain", "m1", "Mountain"), land("Mountain", "m2", "Mountain"), land("Forest", "f1", "Forest")]);
    const obj = stackObj(high([dmgAtom("player", { kind: "permanentsYouControl", subtype: "Mountain" })]), { targets: [{ type: "player", id: "ai" }] });
    expect(runEffectProgram(state, obj).players.ai.life).toBe(state.players.ai.life - 2); // 2 Mountains; the Forest doesn't count
  });
  it("counts cards in your hand", () => {
    let state = freshState();
    state = { ...state, players: { ...state.players, user: { ...state.players.user, hand: [{ id: "h1" }, { id: "h2" }, { id: "h3" }, { id: "h4" }] } } };
    const obj = stackObj(high([dmgAtom("player", { kind: "cardsInHand" })]), { targets: [{ type: "player", id: "ai" }] });
    expect(runEffectProgram(state, obj).players.ai.life).toBe(state.players.ai.life - 4);
  });
  it("a zero count deals zero damage (no crash, no fabricated damage)", () => {
    const state = withBoard([]); // no creatures
    const obj = stackObj(high([dmgAtom("player", { kind: "permanentsYouControl", cardType: "creature" })]), { targets: [{ type: "player", id: "ai" }] });
    expect(runEffectProgram(state, obj).players.ai.life).toBe(state.players.ai.life); // 0 creatures → 0 damage
  });
  it("an Artifact Creature counts for BOTH 'creatures' and 'artifacts' you control", () => {
    const ac = { id: "ac", card: { name: "Ornithopter", type: "Artifact Creature — Thopter", power: 0, toughness: 2, oracle: "" }, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0 };
    const state = withBoard([ac]);
    const tg = { targets: [{ type: "player", id: "ai" }] };
    expect(runEffectProgram(state, stackObj(high([dmgAtom("player", { kind: "permanentsYouControl", cardType: "creature" })]), tg)).players.ai.life).toBe(state.players.ai.life - 1);
    expect(runEffectProgram(state, stackObj(high([dmgAtom("player", { kind: "permanentsYouControl", cardType: "artifact" })]), tg)).players.ai.life).toBe(state.players.ai.life - 1);
  });
});

// ===== FOR-EACH ===== (WALT-FOR-EACH) a count-scaled NON-TARGETED controller effect — amount = a board
// count × per (resolveScaledAmount), computed at resolution. Reuses the DMG-SCALE count subsystem.
describe("runEffectProgram — count-scaled draw / life (FOR-EACH)", () => {
  const withUser = (over) => { const s = freshState(); return { ...s, players: { ...s.players, user: { ...s.players.user, ...over } } }; };
  const ccard = (id) => ({ id, name: "Bear", type: "Creature — Bear" });

  it("gain N life for each creature you control multiplies by per (2 life × 3 creatures = 6)", () => {
    const state = withUser({ battlefield: [cr("Bear", "b1", "user"), cr("Bear", "b2", "user"), cr("Bear", "b3", "user")] });
    const obj = stackObj(high([{ op: "gain-life", targetType: null, amountCount: { kind: "permanentsYouControl", cardType: "creature", per: 2 } }]));
    expect(runEffectProgram(state, obj).players.user.life).toBe(state.players.user.life + 6);
  });
  it("draw a card for each creature you control draws exactly the count (per 1)", () => {
    const state = withUser({ battlefield: [cr("Bear", "b1", "user"), cr("Bear", "b2", "user")], library: [{ id: "l1" }, { id: "l2" }, { id: "l3" }] });
    const before = state.players.user.hand.length;
    const obj = stackObj(high([{ op: "draw", targetType: null, amountCount: { kind: "permanentsYouControl", cardType: "creature", per: 1 } }]));
    expect(runEffectProgram(state, obj).players.user.hand.length).toBe(before + 2);
  });
  it("counts cards in YOUR graveyard by type (2 creature cards among a noncreature)", () => {
    const state = withUser({ graveyard: [ccard("g1"), ccard("g2"), { id: "g3", name: "Bolt", type: "Instant" }], library: [{ id: "l1" }, { id: "l2" }, { id: "l3" }] });
    const before = state.players.user.hand.length;
    const obj = stackObj(high([{ op: "draw", targetType: null, amountCount: { kind: "cardsInGraveyard", cardType: "creature", per: 1 } }]));
    expect(runEffectProgram(state, obj).players.user.hand.length).toBe(before + 2); // 2 creature cards; the Instant doesn't count
  });
  it("each opponent loses N life for each creature you control (2 life × 2 creatures = 4)", () => {
    const state = withUser({ battlefield: [cr("Bear", "b1", "user"), cr("Bear", "b2", "user")] });
    const obj = stackObj(high([{ op: "lose-life", who: "eachOpponent", targetType: null, amountCount: { kind: "permanentsYouControl", cardType: "creature", per: 2 } }]));
    expect(runEffectProgram(state, obj).players.ai.life).toBe(state.players.ai.life - 4);
  });
  it("a zero count → zero (no life gained, no crash)", () => {
    const state = withUser({ battlefield: [] });
    const obj = stackObj(high([{ op: "gain-life", targetType: null, amountCount: { kind: "permanentsYouControl", cardType: "creature", per: 5 } }]));
    expect(runEffectProgram(state, obj).players.user.life).toBe(state.players.user.life);
  });
  it("a zero count DRAWS ZERO — never fabricates a card (the `?? 1` floor, not `|| 1`)", () => {
    const state = withUser({ battlefield: [], library: [{ id: "l1" }, { id: "l2" }] }); // no creatures
    const before = state.players.user.hand.length;
    const obj = stackObj(high([{ op: "draw", targetType: null, amountCount: { kind: "permanentsYouControl", cardType: "creature", per: 1 } }]));
    const out = runEffectProgram(state, obj);
    expect(out.players.user.hand.length).toBe(before);          // drew 0, not 1
    expect(out.players.user.library.length).toBe(2);            // library untouched
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

describe("P3.1 counter target spell — resolution (stack-removal mechanic)", () => {
  // A spell sitting on the stack as the counter's target. kind:"spell" + a card source.
  const spellOnStack = (id, name, type = "Instant", controller = "ai") => ({
    id, kind: "spell", source: { id: `card-${id}`, name, type, oracle: "" }, controller, targets: [], cost: null,
    payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: {} },
  });
  const counterObj = (spellFilter, targetId, { name = "Counterspell", id = "stk-c" } = {}) =>
    stackObj(high([{ op: "counter", spellFilter, targetType: "spell" }]),
      { source: { name, oracle: "" }, id, targets: [{ type: "spell", id: targetId }] });

  it("removes the target spell from the stack → its controller's graveyard, WITHOUT resolving", () => {
    // resolveTopOfStack pops the counter first, so the resolver sees only the target.
    let state = freshState({ stack: [spellOnStack("tgt", "Shock", "Instant")] });
    const out = runEffectProgram(state, counterObj("any", "tgt"));
    expect(out.stack).toHaveLength(0);                                    // target removed from the stack
    expect(out.players.ai.graveyard.map(c => c.name)).toEqual(["Shock"]); // → its controller's graveyard
    expect(out.log.some(l => l.effect === "counter" && l.cardName === "Shock")).toBe(true);
  });

  it("fizzles (logged no-op, never an error) when the target already left the stack", () => {
    const out = runEffectProgram(freshState({ stack: [] }), counterObj("any", "gone"));
    expect(out.log.some(l => l.effect === "counter-fizzle")).toBe(true);
    expect(out.players.ai.graveyard).toHaveLength(0);
  });

  it("the noncreature filter never counters a creature spell (defensive CR 608.2b re-check)", () => {
    let state = freshState({ stack: [spellOnStack("crt", "Bear", "Creature — Bear")] });
    const out = runEffectProgram(state, counterObj("noncreature", "crt", { name: "Negate" }));
    expect(out.stack).toHaveLength(1);  // the creature spell is NOT countered by Negate
    expect(out.players.ai.graveyard).toHaveLength(0);
    expect(out.log.some(l => l.effect === "counter-fizzle")).toBe(true);
  });

  it("resolves end-to-end through resolveTopOfStack: top counter pops, target spell is countered", () => {
    const target = spellOnStack("tgt2", "Divination", "Sorcery");
    const counter = counterObj("any", "tgt2", { id: "stk-ce" });
    const out = resolveTopOfStack(freshState({ stack: [target, counter] }));
    expect(out.stack).toHaveLength(0);                                        // both gone
    expect(out.players.ai.graveyard.map(c => c.name)).toEqual(["Divination"]); // countered → graveyard
  });

  it("a counter targeting ANOTHER counter (nested stack-removal) resolves in CR order", () => {
    // Stack bottom→top: ai Divination, user Counterspell→Divination, ai Negate→Counterspell.
    const base = spellOnStack("div", "Divination", "Sorcery", "ai");
    const inner = { ...counterObj("any", "div", { id: "inner-cs", name: "Counterspell" }), controller: "user",
      targets: [{ type: "spell", id: "div" }] };
    inner.payload.params.controller = "user";
    const outer = counterObj("any", "inner-cs", { id: "outer-neg", name: "Negate" }); // controlled by "user" via stackObj default... set ai below
    outer.controller = "ai"; outer.payload.params.controller = "ai";
    let state = freshState({ stack: [base, inner, outer] });
    // Negate (top) resolves first → counters the inner Counterspell (to user's graveyard).
    state = resolveTopOfStack(state);
    expect(state.players.user.graveyard.map(c => c.name)).toEqual(["Counterspell"]);
    expect(state.stack.map(o => o.source.name)).toEqual(["Divination"]); // base Divination survives
    // Divination now resolves normally (NOT countered — its counter was itself countered).
    state = resolveTopOfStack(state);
    expect(state.stack).toHaveLength(0);
    expect(state.players.ai.graveyard.some(c => c.name === "Divination")).toBe(false);
  });
});

describe("interactive tutor — resolution-time choice (pause / resume)", () => {
  const lib = (id, name, type, mana = "") => ({ id, name, type, mana });
  const withLibrary = (cards) => {
    const s = freshState();
    return { ...s, players: { ...s.players, user: { ...s.players.user, library: cards } } };
  };
  const tutorObj = (filter) => stackObj(high([{ op: "tutor", filter, destination: "hand", targetType: null }]));

  it("sets a pendingChoice with the matching candidates (no fetch yet) and pauses", () => {
    const state = withLibrary([lib("l1", "Forest", "Basic Land — Forest"), lib("a1", "Sol Ring", "Artifact", "{1}"), lib("a3", "Gilded Lotus", "Artifact", "{5}")]);
    const out = runEffectProgram(state, tutorObj({ groups: [["artifact"]] }));
    expect(out.pendingChoice).toMatchObject({ kind: "tutor-search", controller: "user" });
    expect(out.pendingChoice.candidates.map(c => c.name).sort()).toEqual(["Gilded Lotus", "Sol Ring"]);
    expect(out.players.user.hand).toHaveLength(0);   // nothing fetched yet
    expect(out.players.user.library).toHaveLength(3);
  });

  it("resolveTutorChoice fetches the PLAYER's chosen card → hand, shuffles, never leaks the name", () => {
    const paused = runEffectProgram(withLibrary([lib("a1", "Sol Ring", "Artifact", "{1}"), lib("a3", "Gilded Lotus", "Artifact", "{5}")]), tutorObj({ groups: [["artifact"]] }));
    const out = resolveTutorChoice(paused, "a1"); // the player picks Sol Ring, NOT the auto best
    expect(out.players.user.hand.map(c => c.name)).toEqual(["Sol Ring"]);
    expect(out.players.user.library).toHaveLength(1);
    expect(out.pendingChoice).toBeUndefined();
    const tutorLog = out.log.find(l => l.effect === "tutor");
    expect(tutorLog).toMatchObject({ found: true, controller: "user" });
    expect(tutorLog.cardName).toBeUndefined(); // hidden-info safe
  });

  it("autoPickTutorCandidate picks the highest-MV match (Expert/AI auto-pick path)", () => {
    const paused = runEffectProgram(withLibrary([lib("a1", "Sol Ring", "Artifact", "{1}"), lib("a3", "Gilded Lotus", "Artifact", "{5}")]), tutorObj({ groups: [["artifact"]] }));
    expect(autoPickTutorCandidate(paused, paused.pendingChoice)).toBe("a3"); // Gilded Lotus, MV 5
    const out = resolveTutorChoice(paused, autoPickTutorCandidate(paused, paused.pendingChoice));
    expect(out.players.user.hand.map(c => c.name)).toEqual(["Gilded Lotus"]);
  });

  it("resolveTutorChoice(null) finds nothing (no fetch), still shuffles + logs", () => {
    const paused = runEffectProgram(withLibrary([lib("a1", "Sol Ring", "Artifact", "{1}")]), tutorObj({ groups: [["artifact"]] }));
    const out = resolveTutorChoice(paused, null);
    expect(out.players.user.hand).toHaveLength(0);
    expect(out.players.user.library).toHaveLength(1);
    expect(out.log.some(l => l.effect === "tutor" && l.found === false)).toBe(true);
  });

  it("an empty filter (unfiltered 'a card') offers the WHOLE library as candidates", () => {
    const out = runEffectProgram(withLibrary([lib("a", "A", "Instant"), lib("b", "B", "Creature — Bear")]), tutorObj(null));
    expect(out.pendingChoice.candidates.map(c => c.id).sort()).toEqual(["a", "b"]);
  });

  it("filter matching: 'basic land' excludes nonbasic; MDFC matches FRONT face only", () => {
    const a = runEffectProgram(withLibrary([lib("nb", "Command Tower", "Land"), lib("b", "Island", "Basic Land — Island")]), tutorObj({ groups: [["basic", "land"]] }));
    expect(a.pendingChoice.candidates.map(c => c.name)).toEqual(["Island"]); // not the nonbasic Land
    // MDFC front is a Creature, back a Land → a [land] tutor does NOT offer it (CR 712.4a).
    const m = runEffectProgram(withLibrary([lib("m", "Glasspool Mimic", "Creature — Shapeshifter // Land"), lib("f", "Forest", "Basic Land — Forest")]), tutorObj({ groups: [["land"]] }));
    expect(m.pendingChoice.candidates.map(c => c.name)).toEqual(["Forest"]);
  });

  it("a multi-atom tutor (tutor → gain-life) RESUMES the remaining atoms after the choice", () => {
    const state = withLibrary([lib("a1", "Sol Ring", "Artifact", "{1}")]);
    const program = high([{ op: "tutor", filter: { groups: [["artifact"]] }, destination: "hand", targetType: null }, { op: "gain-life", amount: 2 }]);
    const before = state.players.user.life;
    const paused = runEffectProgram(state, stackObj(program));
    expect(paused.pendingChoice.resume.nextAtomIndex).toBe(1);
    expect(paused.players.user.life).toBe(before); // gain-life hasn't run yet
    const out = resolveTutorChoice(paused, "a1");
    expect(out.players.user.hand.map(c => c.name)).toEqual(["Sol Ring"]);
    expect(out.players.user.life).toBe(before + 2); // resumed → gained 2
  });

  it("the shuffle atom keeps the same card set deterministically (serialize-stable)", () => {
    const cards = Array.from({ length: 6 }, (_, i) => lib(`c${i}`, `C${i}`, "Instant"));
    const shuf = (st) => runEffectProgram(st, stackObj(high([{ op: "shuffle", targetType: null }])));
    const out = shuf(withLibrary(cards));
    expect(out.players.user.library.map(c => c.id).sort()).toEqual(cards.map(c => c.id).sort()); // same set
    expect(shuf(withLibrary(cards)).players.user.library.map(c => c.id)).toEqual(out.players.user.library.map(c => c.id)); // deterministic
  });
});

describe("P2.6 create-token — resolution", () => {
  it("puts N token creatures (correct P/T) on the controller's battlefield", () => {
    const state = freshState();
    const before = state.players.user.battlefield.length;
    const out = runEffectProgram(state, stackObj(high([{ op: "create-token", count: 2, power: 2, toughness: 2, descriptor: "green bear" }])));
    expect(out.players.user.battlefield.length).toBe(before + 2);
    const tokens = out.players.user.battlefield.filter(p => p.card.token);
    expect(tokens).toHaveLength(2);
    expect(tokens[0].card).toMatchObject({ power: 2, toughness: 2, token: true, name: "Bear", type: "Token Creature — Bear" });
    expect(tokens[0].summoningSick).toBe(true);
  });

  // ===== TOKENS ===== T1: keyword tokens mint a real keywords[] array that the layer + combat
  // engine reads (hasKeyword / permanentHasKeyword), so the granted ability is actually enforced.
  it("mints a keyword token with a real keywords[] array honored by hasKeyword/permanentHasKeyword", () => {
    const out = runEffectProgram(freshState(), stackObj(high([{ op: "create-token", count: 1, power: 4, toughness: 4, descriptor: "white angel", keywords: ["Flying", "Vigilance"] }])));
    const tok = out.players.user.battlefield.find(p => p.card.token);
    expect(tok.card).toMatchObject({ power: 4, toughness: 4, name: "Angel", type: "Token Creature — Angel", keywords: ["Flying", "Vigilance"] });
    expect(hasKeyword(tok.card, "flying")).toBe(true);
    expect(hasKeyword(tok.card, "vigilance")).toBe(true);
    expect(permanentHasKeyword(out, tok.id, "Flying")).toBe(true);
    expect(hasKeyword(tok.card, "menace")).toBe(false);
  });

  it("mints a Thopter as an Artifact Creature with flying", () => {
    const out = runEffectProgram(freshState(), stackObj(high([{ op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "colorless thopter artifact", keywords: ["Flying"] }])));
    const tok = out.players.user.battlefield.find(p => p.card.token);
    expect(tok.card).toMatchObject({ name: "Thopter", type: "Token Artifact Creature — Thopter", keywords: ["Flying"] });
  });

  // ===== TOKENS ===== T4: an ability-carrying token (slice 1: a MANA ability) is minted with the
  // ability as its real `oracle`, so the mana model drives it like Treasure/Gold (no special-casing). A
  // sac-for-{C} Eldrazi Spawn is a one-shot {C} source usable WHILE summoning sick (no {T}, CR 302.6).
  it("mints a mana-ability token carrying its oracle, driven end-to-end by the mana model", () => {
    const out = runEffectProgram(freshState(), stackObj(high([{ op: "create-token", count: 1, power: 0, toughness: 1, descriptor: "colorless eldrazi spawn", tokenOracle: "Sacrifice this token: Add {C}" }])));
    const tok = out.players.user.battlefield.find(p => p.card.token);
    expect(tok.card).toMatchObject({ power: 0, toughness: 1, token: true, type: "Token Creature — Eldrazi Spawn", oracle: "Sacrifice this token: Add {C}" });
    expect(tok.card.keywords).toEqual([]); // no fabricated combat keyword
    expect(tok.summoningSick).toBe(true);
    expect(manaProduction(tok.card)).toMatchObject({ colors: ["C"], amount: 1, sacrifices: true, requiresTap: false });
    expect(manaSources(out, "user").some(s => s.permanentId === tok.id)).toBe(true); // usable now (no {T})
  });
});
