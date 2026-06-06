/**
 * layers.test.js — the CR 613 layers engine (Phase-7 PR-9).
 *
 * Covers: derive correctness, the empty-board fast path, counters→7c parity with
 * the legacy arithmetic, the Omnath dynamic descriptor, sublayer ordering
 * (7b set < 7c modify < 7d switch), timestamp ordering (613.7), idempotence
 * (613.1), the WeakMap memo, and the addContinuousEffect / expireContinuousEffects
 * mutators. The engine is standalone here — NOT yet wired into creaturePower
 * (that swap is PR-11, gated by the PR-10 equivalence test).
 */

import { readFileSync } from "node:fs";
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState } from "./gameState.js";
import {
  deriveCharacteristics,
  permanentPower,
  permanentToughness,
  permanentHasKeyword,
  collectContinuousEffects,
  addContinuousEffect,
  removeContinuousEffect,
  expireContinuousEffects,
  orderEffectsForPermanent,
  _layerStats,
  _resetLayerStatsForTests,
} from "./layers.js";

// Build a permanent with an explicit id/timestamp so tests are deterministic.
function perm(name, id, controller, { power = 1, toughness = 1, type = "Creature", oracle = "", counters = {}, timestamp = 0 } = {}) {
  return {
    id, card: { name, type, power, toughness, oracle }, controller,
    tapped: false, summoningSick: false, counters, damageMarked: 0,
    attachments: [], attachedTo: null, timestamp,
  };
}

// A real game state with hand-placed battlefields (createGameState seeds the
// continuousEffects/timestampCounter fields the engine reads).
function stateWith({ userBf = [], aiBf = [], userPool = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf, manaPool: { ...s.players.user.manaPool, ...userPool } },
      ai: { ...s.players.ai, battlefield: aiBf },
    },
  };
}

beforeEach(() => _resetLayerStatsForTests());

describe("cycle-break discipline (eng-review F3)", () => {
  // layers/ptPrimitive must NEVER import gameState — gameState delegates OUTWARD
  // to layers, so a layers→gameState import would close the cycle. (Comments may
  // mention gameState; an `import ... from "./gameState"` statement may not.)
  const importsGameState = (file) => {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    return /^\s*import[^\n]*from\s+["']\.\/gameState(\.js)?["']/m.test(src);
  };
  it("layers.js does not import gameState", () => {
    expect(importsGameState("./layers.js")).toBe(false);
  });
  it("ptPrimitive.js does not import gameState", () => {
    expect(importsGameState("./ptPrimitive.js")).toBe(false);
  });
  it("staticAbilityParser.js does not import gameState", () => {
    expect(importsGameState("./staticAbilityParser.js")).toBe(false);
  });
});

describe("empty-board fast path", () => {
  it("returns printed P/T when no effects and no counters", () => {
    const bear = perm("Grizzly Bears", "b1", "user", { power: 2, toughness: 2 });
    const state = stateWith({ userBf: [bear] });
    expect(permanentPower(state, "b1")).toBe(2);
    expect(permanentToughness(state, "b1")).toBe(2);
    expect(collectContinuousEffects(state)).toEqual([]);
  });

  it("an unknown permanent id derives to zeros", () => {
    const state = stateWith({ userBf: [perm("Bear", "b1", "user", { power: 2, toughness: 2 })] });
    expect(permanentPower(state, "ghost")).toBe(0);
    expect(permanentToughness(state, "ghost")).toBe(0);
  });
});

describe("counters as layer 7c (CR 613.4c) — parity with legacy arithmetic", () => {
  it("+1/+1 counters add to both P/T", () => {
    const c = perm("Counter Cat", "c1", "user", { power: 2, toughness: 2, counters: { "+1/+1": 3 } });
    const state = stateWith({ userBf: [c] });
    expect(permanentPower(state, "c1")).toBe(5);
    expect(permanentToughness(state, "c1")).toBe(5);
  });
  it("-1/-1 counters subtract and can drive toughness ≤ 0 (true CR value)", () => {
    const c = perm("Shrunk", "c1", "user", { power: 1, toughness: 1, counters: { "-1/-1": 3 } });
    const state = stateWith({ userBf: [c] });
    expect(permanentPower(state, "c1")).toBe(-2);
    expect(permanentToughness(state, "c1")).toBe(-2);
  });
  it("both counter kinds net out", () => {
    const c = perm("Mixed", "c1", "user", { power: 2, toughness: 2, counters: { "+1/+1": 2, "-1/-1": 1 } });
    const state = stateWith({ userBf: [c] });
    expect(permanentPower(state, "c1")).toBe(3);
  });
});

describe("Omnath as a layer-7c dynamic descriptor", () => {
  const OMNATH = (id = "omn") => perm("Omnath, Locus of Mana", id, "user", { power: 1, toughness: 1 });

  it("is 1/1 with no floating green", () => {
    const state = stateWith({ userBf: [OMNATH()], userPool: { G: 0 } });
    expect(permanentPower(state, "omn")).toBe(1);
    expect(permanentToughness(state, "omn")).toBe(1);
  });
  it("grows +1/+1 per unspent green (6/6 with 5 green)", () => {
    const state = stateWith({ userBf: [OMNATH()], userPool: { G: 5 } });
    expect(permanentPower(state, "omn")).toBe(6);
    expect(permanentToughness(state, "omn")).toBe(6);
  });
  it("stacks with +1/+1 counters", () => {
    const o = perm("Omnath, Locus of Mana", "omn", "user", { power: 1, toughness: 1, counters: { "+1/+1": 2 } });
    const state = stateWith({ userBf: [o], userPool: { G: 3 } });
    expect(permanentPower(state, "omn")).toBe(6); // 1 base + 2 counters + 3 green
  });
  it("only affects itself, not other creatures (mode:self)", () => {
    const bear = perm("Bear", "b1", "user", { power: 2, toughness: 2 });
    const state = stateWith({ userBf: [OMNATH(), bear], userPool: { G: 5 } });
    expect(permanentPower(state, "b1")).toBe(2);
  });
});

describe("anthem (layer 7c, dynamic affect)", () => {
  const anthem = (id = "an") => perm("Glorious Anthem", id, "user", {
    power: 0, toughness: 0, type: "Enchantment", oracle: "Creatures you control get +1/+1.",
  });

  it("buffs the controller's creatures but not the opponent's", () => {
    const mine = perm("Soldier", "s1", "user", { power: 1, toughness: 1 });
    const theirs = perm("Goblin", "g1", "ai", { power: 1, toughness: 1 });
    const state = stateWith({ userBf: [anthem(), mine], aiBf: [theirs] });
    expect(permanentPower(state, "s1")).toBe(2);
    expect(permanentToughness(state, "s1")).toBe(2);
    expect(permanentPower(state, "g1")).toBe(1);
  });

  it("two anthems stack", () => {
    const a1 = anthem("a1");
    const a2 = perm("Gaea's Anthem", "a2", "user", { power: 0, toughness: 0, type: "Enchantment", oracle: "Creatures you control get +1/+1." });
    const mine = perm("Soldier", "s1", "user", { power: 1, toughness: 1 });
    const state = stateWith({ userBf: [a1, a2, mine] });
    expect(permanentPower(state, "s1")).toBe(3);
  });
});

describe("tribal lord (Slivers)", () => {
  const muscle = perm("Muscle Sliver", "m1", "user", {
    power: 1, toughness: 1, type: "Creature — Sliver",
    oracle: "Other Sliver creatures you control get +1/+1.",
  });

  it("buffs other Slivers but not itself (excludeSelf)", () => {
    const other = perm("Metallic Sliver", "o1", "user", { power: 1, toughness: 1, type: "Artifact Creature — Sliver" });
    const state = stateWith({ userBf: [muscle, other] });
    expect(permanentPower(state, "o1")).toBe(2);
    expect(permanentPower(state, "m1")).toBe(1); // the lord itself ("other")
  });

  it("does not buff a non-Sliver", () => {
    const bear = perm("Bear", "b1", "user", { power: 2, toughness: 2, type: "Creature — Bear" });
    const state = stateWith({ userBf: [muscle, bear] });
    expect(permanentPower(state, "b1")).toBe(2);
  });

  it("two lords buff each other (each gets the other's +1/+1)", () => {
    const muscle2 = perm("Muscle Sliver", "m2", "user", { power: 1, toughness: 1, type: "Creature — Sliver", oracle: "Other Sliver creatures you control get +1/+1." });
    const state = stateWith({ userBf: [muscle, muscle2] });
    expect(permanentPower(state, "m1")).toBe(2);
    expect(permanentPower(state, "m2")).toBe(2);
  });
});

describe("sublayer ordering (CR 613.4)", () => {
  it("7b set base applies before 7c modify (set 0/1 then +1/+1 → 1/2)", () => {
    const c = perm("Set Creature", "c1", "user", { power: 3, toughness: 3 });
    let state = stateWith({ userBf: [c] });
    let r = addContinuousEffect(state, {
      layer: 7, sublayer: "7b", op: { layerOp: "ptSet", power: 0, toughness: 1 },
      affects: { mode: "fixed", permanentIds: ["c1"] }, duration: { kind: "permanent" },
      source: { kind: "resolution", permanentId: null, cardName: "Test" },
    });
    state = r.state;
    r = addContinuousEffect(state, {
      layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 1, toughness: 1 },
      affects: { mode: "fixed", permanentIds: ["c1"] }, duration: { kind: "permanent" },
      source: { kind: "resolution", permanentId: null, cardName: "Test" },
    });
    state = r.state;
    expect(permanentPower(state, "c1")).toBe(1);
    expect(permanentToughness(state, "c1")).toBe(2);
  });

  it("7d switch applies after 7c modify (2/4 +2/+0 then switch → 4/4)", () => {
    const c = perm("Switch Creature", "c1", "user", { power: 2, toughness: 4 });
    let state = stateWith({ userBf: [c] });
    let r = addContinuousEffect(state, {
      layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 2, toughness: 0 },
      affects: { mode: "fixed", permanentIds: ["c1"] }, duration: { kind: "permanent" },
      source: { kind: "resolution", permanentId: null, cardName: "Pump" },
    });
    state = r.state;
    r = addContinuousEffect(state, {
      layer: 7, sublayer: "7d", op: { layerOp: "ptSwitch" },
      affects: { mode: "fixed", permanentIds: ["c1"] }, duration: { kind: "permanent" },
      source: { kind: "resolution", permanentId: null, cardName: "Switcheroo" },
    });
    state = r.state;
    // base 2/4 → +2/+0 → 4/4 → switch → 4/4
    expect(permanentPower(state, "c1")).toBe(4);
    expect(permanentToughness(state, "c1")).toBe(4);
  });
});

describe("timestamp ordering (CR 613.7) for non-commuting effects", () => {
  it("later 7b set wins over earlier 7b set", () => {
    const c = perm("Base", "c1", "user", { power: 5, toughness: 5 });
    let state = stateWith({ userBf: [c] });
    let r = addContinuousEffect(state, {
      layer: 7, sublayer: "7b", op: { layerOp: "ptSet", power: 0, toughness: 1 },
      affects: { mode: "fixed", permanentIds: ["c1"] }, duration: { kind: "permanent" },
      source: { kind: "resolution", permanentId: null, cardName: "First" },
    });
    state = r.state;
    r = addContinuousEffect(state, {
      layer: 7, sublayer: "7b", op: { layerOp: "ptSet", power: 2, toughness: 2 },
      affects: { mode: "fixed", permanentIds: ["c1"] }, duration: { kind: "permanent" },
      source: { kind: "resolution", permanentId: null, cardName: "Second" },
    });
    state = r.state;
    expect(permanentPower(state, "c1")).toBe(2);
    expect(permanentToughness(state, "c1")).toBe(2);
  });
});

describe("idempotence (CR 613.1) + memoization", () => {
  it("deriving twice yields a deep-equal result and computes once", () => {
    const o = perm("Omnath, Locus of Mana", "omn", "user", { power: 1, toughness: 1 });
    const state = stateWith({ userBf: [o], userPool: { G: 4 } });
    _resetLayerStatsForTests();
    const a = deriveCharacteristics(state, "omn");
    const b = deriveCharacteristics(state, "omn");
    expect(b.power).toBe(a.power);
    expect(b.toughness).toBe(a.toughness);
    expect(b).toBe(a); // per-(state,id) memo returns the same object
    expect(_layerStats.collectRuns).toBe(1); // collected once for the state
  });

  it("a new state object recomputes (immutable-state memo key)", () => {
    const o = perm("Omnath, Locus of Mana", "omn", "user", { power: 1, toughness: 1 });
    const s1 = stateWith({ userBf: [o], userPool: { G: 1 } });
    const s2 = stateWith({ userBf: [o], userPool: { G: 9 } });
    expect(permanentPower(s1, "omn")).toBe(2);
    expect(permanentPower(s2, "omn")).toBe(10);
  });
});

describe("resolution effects: add / remove / expire", () => {
  it("addContinuousEffect mints a ceff id, stamps a timestamp, advances counters", () => {
    const c = perm("Pumped", "c1", "user", { power: 1, toughness: 1 });
    const state = stateWith({ userBf: [c] });
    const { state: s2, effectId } = addContinuousEffect(state, {
      layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 3, toughness: 3 },
      affects: { mode: "fixed", permanentIds: ["c1"] }, duration: { kind: "endOfTurn", turn: state.turn },
      source: { kind: "resolution", permanentId: null, cardName: "Giant Growth" },
    });
    expect(effectId).toMatch(/^ceff-\d+$/);
    expect(s2.idSeq).toBe(state.idSeq + 1);
    expect(s2.timestampCounter).toBe(state.timestampCounter + 1);
    expect(permanentPower(s2, "c1")).toBe(4);
  });

  it("removeContinuousEffect drops it", () => {
    const c = perm("Pumped", "c1", "user", { power: 1, toughness: 1 });
    const state = stateWith({ userBf: [c] });
    const { state: s2, effectId } = addContinuousEffect(state, {
      layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 3, toughness: 3 },
      affects: { mode: "fixed", permanentIds: ["c1"] }, duration: { kind: "permanent" },
      source: { kind: "resolution", permanentId: null, cardName: "Pump" },
    });
    const s3 = removeContinuousEffect(s2, effectId);
    expect(permanentPower(s3, "c1")).toBe(1);
  });

  it("expireContinuousEffects drops endOfTurn effects at cleanup (CR 514.2)", () => {
    const c = perm("Pumped", "c1", "user", { power: 1, toughness: 1 });
    const state = stateWith({ userBf: [c] });
    const { state: s2 } = addContinuousEffect(state, {
      layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 3, toughness: 3 },
      affects: { mode: "fixed", permanentIds: ["c1"] }, duration: { kind: "endOfTurn", turn: state.turn },
      source: { kind: "resolution", permanentId: null, cardName: "Giant Growth" },
    });
    expect(permanentPower(s2, "c1")).toBe(4);
    const cleaned = expireContinuousEffects(s2, { atCleanupOfTurn: s2.turn });
    expect(cleaned.continuousEffects).toEqual([]);
    expect(permanentPower(cleaned, "c1")).toBe(1);
  });

  it("expireContinuousEffects keeps permanent-duration effects", () => {
    const c = perm("Pumped", "c1", "user", { power: 1, toughness: 1 });
    const state = stateWith({ userBf: [c] });
    const { state: s2 } = addContinuousEffect(state, {
      layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 1, toughness: 1 },
      affects: { mode: "fixed", permanentIds: ["c1"] }, duration: { kind: "permanent" },
      source: { kind: "resolution", permanentId: null, cardName: "Static" },
    });
    const cleaned = expireContinuousEffects(s2, { atCleanupOfTurn: s2.turn });
    expect(cleaned.continuousEffects.length).toBe(1);
  });
});

describe("granted keywords via layer 6", () => {
  it("permanentHasKeyword unions a printed keyword", () => {
    const flyer = perm("Bird", "b1", "user", { power: 1, toughness: 1, oracle: "Flying" });
    const state = stateWith({ userBf: [flyer] });
    expect(permanentHasKeyword(state, "b1", "Flying")).toBe(true);
    expect(permanentHasKeyword(state, "b1", "Trample")).toBe(false);
  });

  it("grants flying to all creatures you control (Levitation-style)", () => {
    const lev = perm("Levitation", "lv", "user", { power: 0, toughness: 0, type: "Enchantment", oracle: "Creatures you control have flying." });
    const ground = perm("Ground Pounder", "g1", "user", { power: 3, toughness: 3 });
    const enemy = perm("Enemy", "e1", "ai", { power: 1, toughness: 1 });
    const state = stateWith({ userBf: [lev, ground], aiBf: [enemy] });
    expect(permanentHasKeyword(state, "g1", "Flying")).toBe(true);
    expect(permanentHasKeyword(state, "e1", "Flying")).toBe(false);
  });

  it("a granted keyword via keyword counter (613.1f)", () => {
    const c = perm("Counted", "c1", "user", { power: 1, toughness: 1, counters: { flying: 1 } });
    const state = stateWith({ userBf: [c] });
    expect(permanentHasKeyword(state, "c1", "Flying")).toBe(true);
  });
});

describe("orderEffectsForPermanent", () => {
  it("orders by layer ascending then sublayer", () => {
    const c = perm("X", "c1", "user", { power: 1, toughness: 1 });
    let state = stateWith({ userBf: [c] });
    const mk = (layer, sublayer, op) => ({
      layer, sublayer, op, affects: { mode: "fixed", permanentIds: ["c1"] },
      duration: { kind: "permanent" }, source: { kind: "resolution", permanentId: null, cardName: "T" },
    });
    state = addContinuousEffect(state, mk(7, "7c", { layerOp: "ptModify", power: 1, toughness: 1 })).state;
    state = addContinuousEffect(state, mk(6, null, { layerOp: "addKeyword", keyword: "Flying" })).state;
    const ordered = orderEffectsForPermanent(state.continuousEffects, "c1", state);
    expect(ordered.map(e => e.layer)).toEqual([6, 7]);
  });
});
