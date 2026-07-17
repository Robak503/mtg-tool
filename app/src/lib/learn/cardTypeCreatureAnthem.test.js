/**
 * cardTypeCreatureAnthem.test.js — CARD-TYPE-qualified creature anthem ("<Artifact|Enchantment|Land>
 * creatures you control get|gain|has|have …").
 *
 * The qualifier reads on the LEFT of the type-line em-dash, so it's a card-TYPE filter (NOT a creature
 * subtype). Before this slice staticAbilityParser treated Artifact/Land/Enchantment as NON_SUBTYPE_ANTHEM_WORDS
 * and refused to model them (a SAFE false-negative: the code comment said "these stay body-only until a
 * card-type-selector anthem is built"). Now they emit a `cardTypes:["Creature", X]` selector — and
 * matchesSelector's AND-semantics over a candidate's EFFECTIVE (printed ∪ layer-4-animated) types makes that
 * select exactly the permanents that are BOTH a Creature and an X (e.g. an earthbended Land that became a 0/0
 * creature, or an Artifact creature). Runtime-honored, not a metric-only flip.
 *
 * Engine-first (THE CREED): each card both CLASSIFIES native AND its grant RESOLVES end-to-end via the layers
 * engine (permanentHasKeyword). Anti-FP pins: a board-state / quality qualifier (Attacking/Tapped/Token) must
 * STAY body-only (it would select nobody yet flip the card native), and the Land anthem must NOT grant to a
 * non-Land creature (the AND-semantics).
 *
 * Motivated by Toph, Earthbending Master's deck — Earthbending Student ("Land creatures you control have
 * vigilance") flips native-mixed (ETB earthbend trigger + the now-modeled Land-creature anthem). Corpus
 * ride-along: Tempered Steel / Master of Etherium / Chief of the Foundry / Thopter Engineer / Krang
 * ("Artifact creatures you control get/have …").
 */
import { describe, it, expect, beforeEach } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

// A permanent with an explicit id/timestamp so the layers engine is deterministic.
function perm(name, id, controller, { power = 1, toughness = 1, type = "Creature", oracle = "", counters = {}, timestamp = 0 } = {}) {
  return {
    id, card: { name, type, power, toughness, oracle }, controller,
    tapped: false, summoningSick: false, counters, damageMarked: 0,
    attachments: [], attachedTo: null, timestamp,
  };
}
function stateWith({ userBf = [], aiBf = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf }, ai: { ...s.players.ai, battlefield: aiBf } },
  };
}

// ── 1. METRIC: card-type anthems flip native-static ──────────────────────────────
describe("card-type creature anthem — classification", () => {
  const cases = [
    ["Land creatures you control have vigilance", "Enchantment", ["Creature", "Land"]],
    ["Artifact creatures you control get +2/+2", "Enchantment", ["Creature", "Artifact"]],
    ["Artifact creatures you control have haste", "Enchantment", ["Creature", "Artifact"]],
    ["Other artifact creatures you control get +1/+1", "Enchantment", ["Creature", "Artifact"]],
    ["Enchantment creatures you control have trample", "Enchantment", ["Creature", "Enchantment"]],
  ];
  for (const [oracle, type, sel] of cases) {
    it(`"${oracle}" → native-static, selector ${JSON.stringify(sel)}`, () => {
      expect(classifyCard({ name: "T", type, mana: "{2}{G}", oracle })).toBe("native-static");
      const statics = parseStaticAbilities({ name: "T", type, mana: "{2}{G}", oracle });
      const match = (statics || []).find((s) => JSON.stringify(s?.affects?.selector?.cardTypes) === JSON.stringify(sel));
      expect(match, "a static with the card-type selector").toBeTruthy();
    });
  }
});

// ── 2. CREED anti-FP pins: board-state / quality qualifiers STAY body-only ────────
describe("card-type creature anthem — anti-FP (these are NOT card types, must stay body-only)", () => {
  // ("Attacking creatures you control get +1/+0" sat here until BLITZ AT-1 modeled it with a REAL
  // combat-state selector; "Tapped creatures you control …" graduated in BLITZ SF-1 with the live-tapped
  // selector — see attackingAnthem.test.js / anthemSubjectFilter.test.js. The remaining qualifiers below stay
  // genuinely unmodeled parks: "Token creatures …" is the reversed-word-order twin of the modeled "Creature
  // tokens …" anthem — no selector field for it; "Enchanted …" is an aura-attachment state we don't track.)
  for (const oracle of [
    "Token creatures you control get +1/+1",
    "Enchanted creatures you control have flying",
  ]) {
    it(`"${oracle}" stays body-only`, () => {
      expect(classifyCard({ name: "T", type: "Enchantment", mana: "{2}{G}", oracle })).toBe("body-only");
    });
  }
  it("SF-1: 'Tapped creatures you control have vigilance' now flips native (live-tapped selector)", () => {
    expect(classifyCard({ name: "T", type: "Enchantment", mana: "{2}{G}", oracle: "Tapped creatures you control have vigilance." })).toBe("native-static");
  });
});

// ── 3. RUNTIME: the grant resolves through the layers engine ──────────────────────
describe("card-type creature anthem — runtime grant (permanentHasKeyword)", () => {
  it("Land anthem grants Vigilance to a Land creature but NOT to a plain creature (AND-semantics)", () => {
    const anthem = perm("Land Anthem", "a1", "user", {
      power: 0, toughness: 0, type: "Enchantment", oracle: "Land creatures you control have vigilance.",
    });
    // An earthbended/animated land: BOTH Land and Creature on its type line.
    const landCreature = perm("Awakened Forest", "lc1", "user", { power: 0, toughness: 0, type: "Land Creature — Forest Elemental" });
    const plainCreature = perm("Bear", "bc1", "user", { power: 2, toughness: 2, type: "Creature — Bear" });
    const state = stateWith({ userBf: [anthem, landCreature, plainCreature] });
    expect(permanentHasKeyword(state, "lc1", "Vigilance")).toBe(true);   // is a Land AND a Creature → granted
    expect(permanentHasKeyword(state, "bc1", "Vigilance")).toBe(false);  // not a Land → not granted
  });

  it("Artifact anthem grants haste to an artifact creature but NOT to a non-artifact creature", () => {
    const anthem = perm("Foundry Banner", "a1", "user", {
      power: 0, toughness: 0, type: "Enchantment", oracle: "Artifact creatures you control have haste.",
    });
    const artCreature = perm("Thopter", "ac1", "user", { power: 1, toughness: 1, type: "Artifact Creature — Thopter" });
    const plainCreature = perm("Elf", "ec1", "user", { power: 1, toughness: 1, type: "Creature — Elf" });
    const state = stateWith({ userBf: [anthem, artCreature, plainCreature] });
    expect(permanentHasKeyword(state, "ac1", "Haste")).toBe(true);
    expect(permanentHasKeyword(state, "ec1", "Haste")).toBe(false);
  });

  it("Land anthem does NOT grant across controllers (controllerScope: you)", () => {
    const anthem = perm("Land Anthem", "a1", "user", {
      power: 0, toughness: 0, type: "Enchantment", oracle: "Land creatures you control have vigilance.",
    });
    const enemyLandCreature = perm("Enemy Awakened Land", "elc1", "ai", { power: 0, toughness: 0, type: "Land Creature — Elemental" });
    const state = stateWith({ userBf: [anthem], aiBf: [enemyLandCreature] });
    expect(permanentHasKeyword(state, "elc1", "Vigilance")).toBe(false);
  });
});

// ── 4. The real deck cards this slice unblocks (Toph + Artifact-anthem corpus ride-along) ──
describe("card-type creature anthem — real cards classify native", () => {
  it("Earthbending Student → native-mixed (ETB earthbend trigger + Land-creature vigilance anthem)", () => {
    const oracle = [
      "When this creature enters, earthbend 2. (Target land you control becomes a 0/0 creature with haste that's still a land. Put two +1/+1 counters on it. When it dies or is exiled, return it to the battlefield tapped.)",
      "Land creatures you control have vigilance. (Attacking doesn't cause them to tap.)",
    ].join("\n");
    expect(classifyCard({ name: "Earthbending Student", type: "Creature — Human Warrior Ally", mana: "{1}{G}", oracle })).toBe("native-mixed");
  });

  it("Tempered Steel → native-static (Artifact creatures you control get +2/+2)", () => {
    expect(classifyCard({ name: "Tempered Steel", type: "Enchantment", mana: "{1}{W}", oracle: "Artifact creatures you control get +2/+2." })).toBe("native-static");
  });

  it("Chief of the Foundry → native-static (Other artifact creatures you control get +1/+1)", () => {
    expect(classifyCard({ name: "Chief of the Foundry", type: "Artifact Creature — Construct", mana: "{4}", oracle: "Other artifact creatures you control get +1/+1." })).toBe("native-static");
  });
});
