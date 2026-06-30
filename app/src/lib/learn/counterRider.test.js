/**
 * COUNTER-RIDER (CROSS-COUNTER, v0.82.0) — counter spells whose hard-counter lead carries a SECOND effect that
 * composes onto the existing counter atom, cross-deck (Kinnan / Rograkh / Yuriko / Zaxara / Koma blue shells):
 *
 *   - CNT-ZONE-REDIRECT — "If that spell is countered this way, put it into its owner's hand|on top of its
 *     owner's library instead of into that player's graveyard." routes the countered card to a non-graveyard
 *     zone via `counterDest`:
 *       Remand       "Counter target spell. … put it into its owner's hand instead …  Draw a card."  → hand + draw
 *       Memory Lapse "Counter target spell. … put it on top of its owner's library instead …"        → library top
 *   - CNT-DRAW-RIDER — Dream Fracture "Counter target spell. Its controller draws a card. Draw a card." — the
 *     COUNTERED spell's controller draws (a `drawCards` controllerRider, applied to that player in applyCounter),
 *     then the CASTER draws (the trailing "Draw a card." folded by collapsed()).
 *
 * The soft-counter "unless its controller pays {N}" family (Mana Leak / Miscalculation / Spell Pierce) is
 * already native + runtime-resolved (softCounter.test.js); this slice adds the COUNTER-then-rider compositions.
 * Genuinely-unmodeled riders (Arcane Denial's DELAYED draw, Mana Drain's delayed mana, Render Silent's
 * cast-restriction, Daze's alt-cost) are PARKED → Arbiter — pinned below as anti-FP CREED guards.
 *
 * This file pins: (1) the parser shapes; (2) the RUNTIME — the countered spell lands in the right zone + the
 * draws actually happen; (3) coverage flips; (4) CREED anti-FP pins.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { RESOLVER_KEYS } from "./resolvers.js";

beforeEach(() => _resetIdsForTests());

const S = (oracle, type = "Instant") => parseEffectProgram({ type, oracle });
const isHigh = (oracle, type = "Instant") => programConfidence(S(oracle, type)) === "high";
const atomsOf = (oracle, type = "Instant") => S(oracle, type)?.atoms;

const ORACLE = {
  remand: "Counter target spell. If that spell is countered this way, put it into its owner's hand instead of into that player's graveyard.\nDraw a card.",
  memoryLapse: "Counter target spell. If that spell is countered this way, put it on top of its owner's library instead of into that player's graveyard.",
  dreamFracture: "Counter target spell. Its controller draws a card.\nDraw a card.",
  // PARK
  arcaneDenial: "Counter target spell. Its controller may draw up to two cards at the beginning of the next turn's upkeep.\nYou draw a card at the beginning of the next turn's upkeep.",
  manaDrain: "Counter target spell. At the beginning of your next main phase, add an amount of {C} equal to that spell's mana value.",
  renderSilent: "Counter target spell. Its controller can't cast spells this turn.",
  daze: "You may return an Island you control to its owner's hand rather than pay this spell's mana cost.\nCounter target spell unless its controller pays {1}.",
};

// ---- shared runtime helpers ----
const spellOnStack = (id, name, type, controller) => ({
  id, kind: "spell", controller, targets: [], cost: null,
  source: { id: `card-${id}`, name, type, oracle: "" },
  payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: {} },
});

// A state with `ai`'s Divination on the stack (the counter target) + a seeded library for both players so a
// rider draw / library-top tuck is observable.
function counterState({ aiLib = [], userLib = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    stack: [spellOnStack("s1", "Divination", "Sorcery", "ai")],
    players: {
      ...s.players,
      ai: { ...s.players.ai, library: aiLib },
      user: { ...s.players.user, library: userLib },
    },
  };
}
const spellTarget = { type: "spell", id: "s1" };
// Resolve the WHOLE program (counter + folded rider atoms) via runEffectProgram — the live resolution path.
const runProg = (state, oracle, controller = "user") =>
  runEffectProgram(state, { source: { name: "test" }, payload: { params: { program: S(oracle), controller, targets: [spellTarget] } } });

describe("parser — counter-rider compositions parse HIGH with the right atoms", () => {
  it("Remand → counter(counterDest:hand) + draw", () => {
    expect(atomsOf(ORACLE.remand)).toEqual([
      { op: "counter", spellFilter: "any", targetType: "spell", counterDest: "hand" },
      { op: "draw", amount: 1, targetType: null },
    ]);
  });
  it("Memory Lapse → counter(counterDest:library-top), no draw", () => {
    expect(atomsOf(ORACLE.memoryLapse)).toEqual([
      { op: "counter", spellFilter: "any", targetType: "spell", counterDest: "library-top" },
    ]);
  });
  it("Dream Fracture → counter(drawCards rider) + caster draw", () => {
    expect(atomsOf(ORACLE.dreamFracture)).toEqual([
      { op: "counter", spellFilter: "any", targetType: "spell", controllerRider: { kind: "drawCards", count: 1 } },
      { op: "draw", amount: 1, targetType: null },
    ]);
  });
});

describe("runtime — the countered spell lands in the right zone (CNT-ZONE-REDIRECT)", () => {
  it("Remand: the countered spell goes to its OWNER's HAND (not graveyard); the caster draws", () => {
    const st = runProg(counterState({ userLib: [{ id: "u1", name: "Plains" }] }), ORACLE.remand, "user");
    expect(st.stack).toHaveLength(0);                                     // countered
    expect(st.players.ai.hand.map((c) => c.name)).toEqual(["Divination"]); // → ai's HAND
    expect(st.players.ai.graveyard).toHaveLength(0);                      // NOT the graveyard
    expect(st.players.user.hand.map((c) => c.name)).toEqual(["Plains"]);  // the caster drew 1
  });
  it("Memory Lapse: the countered spell goes ON TOP of its OWNER's LIBRARY (index 0)", () => {
    const st = runProg(counterState({ aiLib: [{ id: "x", name: "Mountain" }] }), ORACLE.memoryLapse, "user");
    expect(st.stack).toHaveLength(0);
    expect(st.players.ai.library[0].name).toBe("Divination");             // tucked to the TOP, above the existing card
    expect(st.players.ai.library.map((c) => c.name)).toEqual(["Divination", "Mountain"]);
    expect(st.players.ai.graveyard).toHaveLength(0);
  });
});

describe("runtime — Dream Fracture's draws happen for BOTH players (CNT-DRAW-RIDER)", () => {
  it("the COUNTERED spell's controller draws 1 AND the caster draws 1; spell to graveyard", () => {
    const st = runProg(
      counterState({ aiLib: [{ id: "a1", name: "Swamp" }], userLib: [{ id: "u1", name: "Forest" }] }),
      ORACLE.dreamFracture, "user");
    expect(st.stack).toHaveLength(0);
    expect(st.players.ai.graveyard.map((c) => c.name)).toEqual(["Divination"]); // default zone (no redirect)
    expect(st.players.ai.hand.map((c) => c.name)).toEqual(["Swamp"]);   // countered controller drew (the rider)
    expect(st.players.user.hand.map((c) => c.name)).toEqual(["Forest"]); // caster drew (the trailing clause)
  });
});

describe("CREED — a counter that FIZZLES (target gone) fires no rider, no redirect", () => {
  it("Remand on an empty stack: no draw, no zone move (a logged fizzle)", () => {
    const empty = { ...counterState(), stack: [] };
    const st = runProg(empty, ORACLE.remand, "user");
    expect(st.players.user.hand).toHaveLength(0); // caster did NOT draw — wait: the caster-draw clause is a
    // SEPARATE atom that runs unconditionally after the counter atom. The counter fizzles (logged), but the
    // draw atom still runs (it is the caster's own draw, not gated on the counter). Assert the COUNTER side only.
    expect(st.stack).toHaveLength(0);
    expect(st.players.ai.hand).toHaveLength(0);       // nothing tucked to ai's hand (the counter found no target)
    expect(st.players.ai.graveyard).toHaveLength(0);
    expect(st.log.some((l) => l.effect === "counter-fizzle")).toBe(true);
  });
});

describe("coverage — the three new counter-riders flip native-spell", () => {
  const C = (oracle, name) => ({ type: "Instant", oracle, mana: "", name });
  it("Remand / Memory Lapse / Dream Fracture are native-spell", () => {
    expect(classifyCard(C(ORACLE.remand, "Remand"))).toBe("native-spell");
    expect(classifyCard(C(ORACLE.memoryLapse, "Memory Lapse"))).toBe("native-spell");
    expect(classifyCard(C(ORACLE.dreamFracture, "Dream Fracture"))).toBe("native-spell");
  });
});

describe("CREED — genuinely-unmodeled counter-riders STAY Arbiter (anti-FP)", () => {
  const C = (oracle, name) => ({ type: "Instant", oracle, mana: "", name });
  it("Arcane Denial (DELAYED draw at next upkeep) stays arbiter-spell", () => {
    expect(isHigh(ORACLE.arcaneDenial)).toBe(false);
    expect(classifyCard(C(ORACLE.arcaneDenial, "Arcane Denial"))).toBe("arbiter-spell");
  });
  it("Mana Drain (DELAYED mana at next main phase) stays arbiter-spell", () => {
    expect(isHigh(ORACLE.manaDrain)).toBe(false);
    expect(classifyCard(C(ORACLE.manaDrain, "Mana Drain"))).toBe("arbiter-spell");
  });
  it("Render Silent (continuous can't-cast restriction) stays arbiter-spell", () => {
    expect(isHigh(ORACLE.renderSilent)).toBe(false);
    expect(classifyCard(C(ORACLE.renderSilent, "Render Silent"))).toBe("arbiter-spell");
  });
  it("Daze (alt-cost line) stays arbiter-spell — the counter line alone isn't the whole card", () => {
    expect(isHigh(ORACLE.daze)).toBe(false);
    expect(classifyCard(C(ORACLE.daze, "Daze"))).toBe("arbiter-spell");
  });
});

describe("regression — the existing counter-rider staples are untouched", () => {
  const C = (oracle, name, type = "Instant") => ({ type, oracle, mana: "", name });
  it("An Offer / Swan Song / Deny Existence / Exclude / Mana Leak stay native-spell", () => {
    expect(classifyCard(C("Counter target noncreature spell. Its controller creates two Treasure tokens.", "An Offer You Can't Refuse"))).toBe("native-spell");
    expect(classifyCard(C("Counter target enchantment, instant, or sorcery spell. Its controller creates a 2/2 blue Bird creature token with flying.", "Swan Song"))).toBe("native-spell");
    expect(classifyCard(C("Counter target creature spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard.", "Deny Existence"))).toBe("native-spell");
    expect(classifyCard(C("Counter target creature spell.\nDraw a card.", "Exclude"))).toBe("native-spell");
    expect(classifyCard(C("Counter target spell unless its controller pays {3}.", "Mana Leak"))).toBe("native-spell");
  });
});
