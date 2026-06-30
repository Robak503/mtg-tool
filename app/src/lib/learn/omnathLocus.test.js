/**
 * OMNATH, LOCUS OF MANA — the TIER-2 mono-green ramp commander, full native (#omnath-commander).
 *
 * Two STATIC abilities, both genuinely resolving through registries the engine already consults:
 *   • GREEN-MANA RETENTION (CR 500.4) — cardEffects.REGISTRY.manaDoesNotEmpty = ["G"]; the controller's
 *     green survives every step/phase end (routed through emptyManaPools at the advanceStep chokepoint),
 *     controller-scoped (a non-controller's green still empties; other colors empty for the controller).
 *   • DYNAMIC +1/+1-PER-GREEN (CR 613, layer 7c) — layers.STATIC_REGISTRY ptModifyDynamic(omnathGreen)
 *     reads the controller's LIVE unspent green every P/T computation, so Omnath is an X/X that grows as
 *     green is floated and SHRINKS as it's spent (recursion-safe: a plain pool read).
 *
 * classifyCard credits native-static via classifyOmnathLocus (coverage.js), GROUNDED on both runtime
 * registries — it self-disables if either half is ever removed. CREED: a qualified / wrong-text / ridered
 * variant stays NON-native (safe false-negative), never a fabricated or mis-applied effect.
 */
import { describe, expect, it, beforeEach } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { advanceStep, emptyManaPools } from "./gameEngine.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { manaDoesNotEmpty } from "./cardEffects.js";
import { createGameState, createPermanent, addMana, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ─── Verified oracle text (Scryfall oracle-index.json — "Omnath, Locus of Mana", {2}{G}, 1/1) ───
const OMNATH = {
  id: "c-omn",
  name: "Omnath, Locus of Mana",
  type: "Legendary Creature — Elemental",
  power: 1,
  toughness: 1,
  mana: "{2}{G}",
  oracle: "You don't lose unspent green mana as steps and phases end.\nOmnath gets +1/+1 for each unspent green mana you have.",
};

const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
function stateWith({ userBf = [], aiBf = [], userPool = {}, aiPool = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    activePlayer: "user",
    phase: "precombat-main",
    step: "main",
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf, manaPool: { ...EMPTY_POOL, ...userPool } },
      ai: { ...s.players.ai, battlefield: aiBf, manaPool: { ...EMPTY_POOL, ...aiPool } },
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// CLASSIFICATION — native-static, grounded on both registries
// ══════════════════════════════════════════════════════════════════════════════════════════
describe("OMNATH classification", () => {
  it("classifies native-static (retention + dynamic +1/+1-per-green)", () => {
    expect(classifyCard(OMNATH)).toBe("native-static");
    expect(isNativeTier(classifyCard(OMNATH))).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// RETENTION — green survives a REAL phase transition; scoped to the controller + green only
// ══════════════════════════════════════════════════════════════════════════════════════════
describe("OMNATH green-mana retention (CR 500.4)", () => {
  it("manaDoesNotEmpty reports ['G'] for the controller", () => {
    const omn = createPermanent({ id: "p-omn", card: OMNATH, controller: "user", summoningSick: false });
    const s = stateWith({ userBf: [omn], userPool: { G: 5, U: 2 } });
    expect(manaDoesNotEmpty(s, "user")).toEqual(["G"]);
  });

  it("green SURVIVES an actual step/phase transition (advanceStep), other colors empty", () => {
    const omn = createPermanent({ id: "p-omn", card: OMNATH, controller: "user", summoningSick: false });
    // 5 green + 2 blue floating at precombat-main → advanceStep ends the step (CR 500.4 empties the pool).
    let s = stateWith({ userBf: [omn], userPool: { G: 5, U: 2 } });
    expect(s.players.user.manaPool.G).toBe(5);
    s = advanceStep(s); // precombat-main/main → combat/beginning-of-combat — the pool empties HERE
    expect(s.players.user.manaPool.G).toBe(5); // green RETAINED across the real phase boundary
    expect(s.players.user.manaPool.U).toBe(0); // blue emptied as usual
  });

  it("green keeps surviving across MULTIPLE consecutive transitions", () => {
    const omn = createPermanent({ id: "p-omn", card: OMNATH, controller: "user", summoningSick: false });
    let s = stateWith({ userBf: [omn], userPool: { G: 3 } });
    for (let i = 0; i < 3; i++) s = advanceStep(s);
    expect(s.players.user.manaPool.G).toBe(3); // still there several steps later
  });

  it("SCOPING — a NON-controller's green still empties (controller-scoped, not symmetric)", () => {
    const omn = createPermanent({ id: "p-omn", card: OMNATH, controller: "user", summoningSick: false });
    // The AI controls NO Omnath but has 4 floating green — it must empty normally.
    const s = stateWith({ userBf: [omn], userPool: { G: 5 }, aiPool: { G: 4 } });
    expect(manaDoesNotEmpty(s, "ai")).toEqual([]); // AI gets no retention
    const after = emptyManaPools(s);
    expect(after.players.user.manaPool.G).toBe(5); // controller keeps green
    expect(after.players.ai.manaPool.G).toBe(0);   // non-controller's green emptied
  });

  it("when Omnath LEAVES, green no longer survives (effect is tied to the permanent)", () => {
    // No Omnath on the battlefield → default CR 500.4 (all mana empties).
    const s = stateWith({ userBf: [], userPool: { G: 5 } });
    expect(manaDoesNotEmpty(s, "user")).toEqual([]);
    expect(emptyManaPools(s).players.user.manaPool.G).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// DYNAMIC P/T — live X/X = unspent green, BOTH directions
// ══════════════════════════════════════════════════════════════════════════════════════════
describe("OMNATH dynamic +1/+1-per-green (layer 7c)", () => {
  it("is a 1/1 with no floating green", () => {
    const omn = createPermanent({ id: "p-omn", card: OMNATH, controller: "user", summoningSick: false });
    const s = stateWith({ userBf: [omn], userPool: { G: 0 } });
    expect(permanentPower(s, "p-omn")).toBe(1);
    expect(permanentToughness(s, "p-omn")).toBe(1);
  });

  it("reads 6/6 with 5 unspent green (grows UP as green is added)", () => {
    const omn = createPermanent({ id: "p-omn", card: OMNATH, controller: "user", summoningSick: false });
    let s = stateWith({ userBf: [omn], userPool: { G: 0 } });
    s = addMana(s, { playerId: "user", color: "G", amount: 5 });
    expect(permanentPower(s, "p-omn")).toBe(6); // 1 base + 5 green
    expect(permanentToughness(s, "p-omn")).toBe(6);
  });

  it("SHRINKS as green is spent — 5 green (6/6) → spend 2 → 3 green (4/4)", () => {
    const omn = createPermanent({ id: "p-omn", card: OMNATH, controller: "user", summoningSick: false });
    let s = stateWith({ userBf: [omn], userPool: { G: 5 } });
    expect(permanentPower(s, "p-omn")).toBe(6);
    // Spend 2 green (simulate paying a cost) → pool drops to 3 → Omnath re-derives live to 4/4.
    s = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { ...s.players.user.manaPool, G: 3 } } } };
    expect(permanentPower(s, "p-omn")).toBe(4); // 1 base + 3 green
    expect(permanentToughness(s, "p-omn")).toBe(4);
  });

  it("only the CONTROLLER's green counts — an opponent's floating green does NOT buff Omnath", () => {
    const omn = createPermanent({ id: "p-omn", card: OMNATH, controller: "user", summoningSick: false });
    const s = stateWith({ userBf: [omn], userPool: { G: 0 }, aiPool: { G: 7 } });
    expect(permanentPower(s, "p-omn")).toBe(1); // the AI's 7 green is irrelevant — still a 1/1
  });

  it("only GREEN counts — floating other colors do NOT buff Omnath", () => {
    const omn = createPermanent({ id: "p-omn", card: OMNATH, controller: "user", summoningSick: false });
    const s = stateWith({ userBf: [omn], userPool: { U: 4, R: 3, C: 2 } });
    expect(permanentPower(s, "p-omn")).toBe(1); // non-green mana doesn't grow Omnath
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// INTEGRATION — retention + dynamic P/T together: floated green keeps Omnath big past a phase
// ══════════════════════════════════════════════════════════════════════════════════════════
describe("OMNATH retention + P/T together", () => {
  it("a 6/6 with 5 floated green STAYS a 6/6 after a phase transition (green survives → still buffed)", () => {
    const omn = createPermanent({ id: "p-omn", card: OMNATH, controller: "user", summoningSick: false });
    let s = stateWith({ userBf: [omn], userPool: { G: 5 } });
    expect(permanentPower(s, "p-omn")).toBe(6);
    s = advanceStep(s); // step ends; green is retained
    expect(s.players.user.manaPool.G).toBe(5);
    expect(permanentPower(s, "p-omn")).toBe(6); // still a 6/6 — the buff persists because the green did
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// CREED — anti-FP: the classifier is grounded + all-or-nothing
// ══════════════════════════════════════════════════════════════════════════════════════════
describe("OMNATH CREED anti-FP", () => {
  it("a card with the same TEXT but a different NAME does NOT flip (registry-grounded, not text-only)", () => {
    // Same two sentences, but no cardEffects/layers registry entry under this name → no native credit.
    const impostor = { ...OMNATH, name: "Faux Omnath", id: "c-faux" };
    expect(classifyCard(impostor)).not.toBe("native-static");
  });

  it("a RIDERED Omnath (an extra unmodeled ability) does NOT flip (all-or-nothing residue)", () => {
    const ridered = {
      ...OMNATH,
      oracle: OMNATH.oracle + "\nWhenever you cast a green spell, draw two cards and gain a billion life.",
    };
    expect(classifyCard(ridered)).not.toBe("native-static");
  });

  it("a non-creature with the name is rejected (the registries read a creature's controller)", () => {
    expect(classifyOmnathRejectsNonCreature()).toBe(true);
  });
});

// Helper kept out of the it() body for readability.
function classifyOmnathRejectsNonCreature() {
  const asArtifact = { ...OMNATH, type: "Legendary Artifact" };
  return classifyCard(asArtifact) !== "native-static";
}
