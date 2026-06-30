/**
 * godDevotion.test.js — the GOD-DEVOTION subsystem (Theros Gods).
 *
 * "As long as your devotion to <color>[ and <color>] is less than N, [this God] isn't a creature."
 * (CR 700.5 devotion; CR 613.1d layer-4 conditional type-removal). Covers:
 *   • CLASSIFICATION — the 5 Gods whose OTHER abilities are fully modeled flip to native (whole-card CREED);
 *     a God with an unmodeled ability stays body-only (anti-FP pin).
 *   • RUNTIME — the live devotion count flips the God's creature-ness BOTH directions (4 green pips → not a
 *     creature; the 5th green pip → a creature; remove it → not a creature again), and the gate respects the
 *     threshold for one- and two-color Gods (two colors SUM their symbols, CR 700.5).
 *   • INTERACTION — while a God is below devotion it is NOT seen as a Creature by another source's
 *     "creatures you control …" anthem (effectiveTypeIdentity removal), exactly as the rules require.
 */

import { describe, it, expect } from "vitest";
import { createGameState } from "./gameState.js";
import { classifyCard } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import {
  permanentTypes,
  permanentIsCreature,
  deriveCharacteristics,
} from "./layers.js";

// Real Theros God oracle text (verified against bundled Scryfall data).
const NYLEA_HUNT = {
  name: "Nylea, God of the Hunt",
  type: "Legendary Enchantment Creature — God",
  mana: "{3}{G}",
  power: 6, toughness: 6,
  oracle:
    "Indestructible\n" +
    "As long as your devotion to green is less than five, Nylea isn't a creature. (Each {G} in the mana costs of permanents you control counts toward your devotion to green.)\n" +
    "Other creatures you control have trample.\n" +
    "{3}{G}: Target creature gets +2/+2 until end of turn.",
};
const HELIOD_SUN = {
  name: "Heliod, God of the Sun",
  type: "Legendary Enchantment Creature — God",
  mana: "{3}{W}",
  power: 5, toughness: 6,
  oracle:
    "Indestructible\n" +
    "As long as your devotion to white is less than five, Heliod isn't a creature.\n" +
    "Other creatures you control have vigilance.\n" +
    "{2}{W}{W}: Create a 2/1 white Cleric enchantment creature token.",
};
const PURPHOROS_FORGE = {
  name: "Purphoros, God of the Forge",
  type: "Legendary Enchantment Creature — God",
  mana: "{3}{R}",
  power: 7, toughness: 6,
  oracle:
    "Indestructible\n" +
    "As long as your devotion to red is less than five, Purphoros isn't a creature.\n" +
    "Whenever another creature you control enters, Purphoros deals 2 damage to each opponent.\n" +
    "{2}{R}: Creatures you control get +1/+0 until end of turn.",
};
const THASSA_SEA = {
  name: "Thassa, God of the Sea",
  type: "Legendary Enchantment Creature — God",
  mana: "{2}{U}",
  power: 5, toughness: 5,
  oracle:
    "Indestructible\n" +
    "As long as your devotion to blue is less than five, Thassa isn't a creature. (Each {U} in the mana costs of permanents you control counts toward your devotion to blue.)\n" +
    "At the beginning of your upkeep, scry 1.\n" +
    "{1}{U}: Target creature you control can't be blocked this turn.",
};
const KARAMETRA_HARVESTS = {
  name: "Karametra, God of Harvests",
  type: "Legendary Enchantment Creature — God",
  mana: "{3}{G}{W}",
  power: 6, toughness: 7,
  oracle:
    "Indestructible\n" +
    "As long as your devotion to green and white is less than seven, Karametra isn't a creature.\n" +
    "Whenever you cast a creature spell, you may search your library for a Forest or Plains card, put it onto the battlefield tapped, then shuffle.",
};

// A God whose OTHER ability is UNMODELED (Erebos — "Your opponents can't gain life" static + a draw ability):
// the devotion gate is modeled but the whole card is NOT, so CREED keeps it body-only (anti-FP pin).
const EREBOS_DEAD = {
  name: "Erebos, God of the Dead",
  type: "Legendary Enchantment Creature — God",
  mana: "{3}{B}",
  power: 5, toughness: 7,
  oracle:
    "Indestructible\n" +
    "As long as your devotion to black is less than five, Erebos isn't a creature. (Each {B} in the mana costs of permanents you control counts toward your devotion to black.)\n" +
    "Your opponents can't gain life.\n" +
    "{1}{B}, Pay 2 life: Draw a card.",
};

// Build a permanent with an explicit id/controller; `mana` carries the cost pips devotion reads.
function perm(card, id, controller, { timestamp = 0 } = {}) {
  return {
    id,
    card,
    controller,
    tapped: false, summoningSick: false, counters: {}, damageMarked: 0,
    attachments: [], attachedTo: null, timestamp,
  };
}

function stateWith(userBf) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: userBf } } };
}

// A bare mana-source permanent contributing `n` pips of a color (e.g. an aura-less Forest-cost dork) — used to
// dial devotion up/down. `cost` is a raw mana string; the card need not be a creature.
function pipSource(cost, id, controller = "user") {
  return perm({ name: `pips-${id}`, type: "Enchantment", mana: cost, oracle: "" }, id, controller);
}

describe("GOD-DEVOTION — classification (whole-card CREED)", () => {
  it("flips the 5 Gods whose other abilities are all modeled to native-mixed", () => {
    expect(classifyCard(NYLEA_HUNT)).toBe("native-mixed");
    expect(classifyCard(HELIOD_SUN)).toBe("native-mixed");
    expect(classifyCard(PURPHOROS_FORGE)).toBe("native-mixed");
    expect(classifyCard(THASSA_SEA)).toBe("native-mixed");
    expect(classifyCard(KARAMETRA_HARVESTS)).toBe("native-mixed");
  });

  it("CREED anti-FP: a God with an unmodeled ability stays body-only despite the modeled gate", () => {
    // Erebos's "Your opponents can't gain life" static + the draw activated ability are not modeled, so the
    // whole card must NOT flip — the gate alone is never enough.
    expect(classifyCard(EREBOS_DEAD)).toBe("body-only");
    // The mill-grant Gods (Phenax) + the complex coin-counter / exile-return Gods stay body-only too.
    expect(classifyCard({
      name: "Phenax, God of Deception", type: "Legendary Enchantment Creature — God", mana: "{3}{U}{B}",
      power: 4, toughness: 7,
      oracle: "Indestructible\nAs long as your devotion to blue and black is less than seven, Phenax isn't a creature.\nCreatures you control have \"{T}: Target player mills X cards, where X is this creature's toughness.\"",
    })).toBe("body-only");
  });

  it("emits a single layer-4 conditional type-removal descriptor for the gate", () => {
    const ds = parseStaticAbilities(NYLEA_HUNT).filter(d => d.op?.layerOp === "removeTypeWhileDevotionBelow");
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({
      layer: 4,
      op: { layerOp: "removeTypeWhileDevotionBelow", removeType: "Creature", colors: ["G"], atLeast: 5 },
      affects: { mode: "self" },
    });
  });

  it("parses a two-color gate's colors + threshold (Karametra: green+white, < 7)", () => {
    const d = parseStaticAbilities(KARAMETRA_HARVESTS).find(x => x.op?.layerOp === "removeTypeWhileDevotionBelow");
    expect(d.op.colors).toEqual(["G", "W"]);
    expect(d.op.atLeast).toBe(7);
  });

  it("does NOT model a different-named 'X isn't a creature' clause as a self-gate (only this/God-name self-ref)", () => {
    // Sanity: the gate is self-only. (No real card phrases a devotion gate about another permanent, but the
    // descriptor must be SELF-affecting so it can never strip the wrong permanent's type.)
    const d = parseStaticAbilities(THASSA_SEA).find(x => x.op?.layerOp === "removeTypeWhileDevotionBelow");
    expect(d.affects).toEqual({ mode: "self" });
  });
});

describe("GOD-DEVOTION — runtime type-gate (flips both directions)", () => {
  it("Nylea is NOT a creature at 4 green pips, IS a creature at 5, and reverts when a pip leaves", () => {
    const nylea = perm(NYLEA_HUNT, "nylea", "user"); // {3}{G} → 1 green pip from Nylea herself
    // 3 more single-green permanents → 4 green pips total (< 5) → not a creature.
    const below = stateWith([nylea, pipSource("{G}", "g1"), pipSource("{G}", "g2"), pipSource("{G}", "g3")]);
    expect(permanentIsCreature(below, "nylea")).toBe(false);
    expect(permanentTypes(below, "nylea").types).not.toContain("Creature");
    // It is STILL an Enchantment + God (the removal strips only Creature; subtypes keep their printed case).
    expect(permanentTypes(below, "nylea").types).toContain("Enchantment");
    expect(permanentTypes(below, "nylea").subtypes).toContain("God");

    // Add a 5th green pip ({G}{G} source = 2 pips → 5 total) → devotion 5 ≥ 5 → a creature.
    const at = stateWith([nylea, pipSource("{G}", "g1"), pipSource("{G}", "g2"), pipSource("{G}{G}", "g4")]);
    expect(permanentIsCreature(at, "nylea")).toBe(true);
    expect(permanentTypes(at, "nylea").types).toContain("Creature");

    // Remove pips back to 4 → not a creature again (the reverse direction).
    const back = stateWith([nylea, pipSource("{G}", "g1"), pipSource("{G}", "g2"), pipSource("{G}", "g3")]);
    expect(permanentIsCreature(back, "nylea")).toBe(false);
  });

  it("counts hybrid/Phyrexian pips toward devotion (CR 700.5)", () => {
    // Nylea + a {G/W} hybrid + a {G/P} Phyrexian + two {G} → green pips: 1 (Nylea) +1 +1 +2 = 5 → a creature.
    const nylea = perm(NYLEA_HUNT, "nylea", "user");
    const st = stateWith([nylea, pipSource("{G/W}", "h1"), pipSource("{G/P}", "p1"), pipSource("{G}{G}", "g2")]);
    expect(permanentIsCreature(st, "nylea")).toBe(true);
  });

  it("only the named color(s) count — off-color pips do not raise devotion", () => {
    // Nylea (1 green) + four BLUE pips → green devotion stays 1 (< 5) → not a creature.
    const nylea = perm(NYLEA_HUNT, "nylea", "user");
    const st = stateWith([nylea, pipSource("{U}{U}", "u1"), pipSource("{U}{U}", "u2")]);
    expect(permanentIsCreature(st, "nylea")).toBe(false);
  });

  it("a two-color God SUMS both colors' symbols toward the threshold (Karametra: green+white < 7)", () => {
    const kara = perm(KARAMETRA_HARVESTS, "kara", "user"); // {3}{G}{W} → 1 green + 1 white = 2
    // Add 2 green + 2 white pips → 4 green-or-white symbols + Karametra's 2 = 6 (< 7) → not a creature.
    const below = stateWith([kara, pipSource("{G}{G}", "g1"), pipSource("{W}{W}", "w1")]);
    expect(permanentIsCreature(below, "kara")).toBe(false);
    // One more white pip → 7 total → a creature.
    const at = stateWith([kara, pipSource("{G}{G}", "g1"), pipSource("{W}{W}", "w1"), pipSource("{W}", "w2")]);
    expect(permanentIsCreature(at, "kara")).toBe(true);
  });

  it("devotion is the CONTROLLER's permanents only — an opponent's pips don't count", () => {
    const nylea = perm(NYLEA_HUNT, "nylea", "user");
    const oppGreen = perm({ name: "opp", type: "Enchantment", mana: "{G}{G}{G}{G}", oracle: "" }, "opp1", "ai");
    const st = {
      ...createGameState({ userDeck: [], aiDeck: [] }),
      players: {
        ...createGameState({ userDeck: [], aiDeck: [] }).players,
        user: { ...createGameState({ userDeck: [], aiDeck: [] }).players.user, battlefield: [nylea] },
        ai: { ...createGameState({ userDeck: [], aiDeck: [] }).players.ai, battlefield: [oppGreen] },
      },
    };
    // Nylea's controller (user) has only 1 green pip; the opponent's 4 green pips are irrelevant → not a creature.
    expect(permanentIsCreature(st, "nylea")).toBe(false);
  });
});

describe("GOD-DEVOTION — interaction with other continuous effects", () => {
  it("a God below devotion is NOT buffed by ANOTHER source's 'creatures you control get +1/+1' anthem", () => {
    // Anthem source: a separate permanent granting +1/+1 to "creatures you control". While Nylea is below
    // devotion she isn't a Creature, so the anthem (cardTypes:["Creature"]) must skip her (CR 613 layer-4
    // before layer-7c). At/above devotion she's a creature and the anthem applies.
    const anthemCard = {
      name: "Glorious Anthem", type: "Enchantment", mana: "{1}{W}{W}",
      oracle: "Creatures you control get +1/+1.",
    };
    const nylea = perm(NYLEA_HUNT, "nylea", "user");
    const anthem = perm(anthemCard, "anthem", "user", { timestamp: 1 });

    // 4 green pips (< 5) → Nylea not a creature → anthem does NOT apply → base 6/6, untouched.
    const below = stateWith([nylea, anthem, pipSource("{G}", "g1"), pipSource("{G}", "g2"), pipSource("{G}", "g3")]);
    const cBelow = deriveCharacteristics(below, "nylea");
    expect(cBelow.types).not.toContain("Creature");
    expect(cBelow.power).toBe(6);
    expect(cBelow.toughness).toBe(6);

    // 5 green pips → Nylea a creature → anthem applies → 7/7.
    const at = stateWith([nylea, anthem, pipSource("{G}", "g1"), pipSource("{G}", "g2"), pipSource("{G}{G}", "g4")]);
    const cAt = deriveCharacteristics(at, "nylea");
    expect(cAt.types).toContain("Creature");
    expect(cAt.power).toBe(7);
    expect(cAt.toughness).toBe(7);
  });
});
