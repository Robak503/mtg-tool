/**
 * colorTypeCostReduction.test.js — COLOR + CARD-TYPE cost reduction (CR 601.2f): the Monument cycle.
 * Bontu's #664 · Oketra's #1009 · Hazoret's #1879 · Rhonas's #2151 · Kefnet's #5041.
 *
 *   "<Color> creature spells you cast cost {1} less to cast."
 *
 * Found by probe-near-miss-clauses.mjs, one word from a shape the engine already reads ("creature spells
 * you cast cost {1} less" — Honest Rutstein). The cycle sat parked because parseColorCostReduction's shape
 * B captures "[a-z ,]+? spells", so "black creature" reached it as a COLOR LIST, failed the color parse,
 * and returned null. A safe false negative that had been quietly costing five cards.
 *
 * ⚠️ THIS IS THE ONE REDUCER SHAPE THAT IS AN *AND*, and that is the whole risk. Every pre-existing
 * descriptor carries EITHER `subtype` OR `colors`, and costReductionForSpell dispatches on them with a
 * matching if/else-if chain. A descriptor carrying both would have degraded silently to the FIRST branch —
 * Bontu's Monument shaving {1} off a WHITE creature spell. Not a crash, not a missing effect: a wrong
 * price, on every game, invisible in the coverage tier. The AND lives in costReductionForSpell and ships
 * with the emission.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseStaticAbilities, collectCostReducers, costReductionForSpell } from "./staticAbilityParser.js";

const monument = (name, color, rider) => ({
  id: `c-${color}`, name, type: "Artifact", mana: "{3}",
  oracle: `${color[0].toUpperCase()}${color.slice(1)} creature spells you cast cost {1} less to cast.\n${rider}`,
});
const BONTU = monument("Bontu's Monument", "black", "Whenever you cast a creature spell, each opponent loses 1 life and you gain 1 life.");
const OKETRA = monument("Oketra's Monument", "white", "Whenever you cast a creature spell, create a 1/1 white Warrior creature token with vigilance.");
const RHONAS = monument("Rhonas's Monument", "green", "Whenever you cast a creature spell, target creature you control gets +2/+2 and gains trample until end of turn.");

const spell = (over) => ({ name: "S", type: "Creature — Bear", mana: "{2}{B}", colors: ["B"], ...over });
const reduce = (card, sp) => costReductionForSpell(collectCostReducers([{ card }]), sp);

describe("the parser — both qualities on ONE descriptor", () => {
  it("Bontu's Monument emits { colors:['B'], subtype:'Creature', amount:1 }", () => {
    expect(parseStaticAbilities(BONTU).find((d) => d.costReduction).costReduction)
      .toEqual({ colors: ["B"], subtype: "Creature", amount: 1 });
  });

  it("all five colors read the same way", () => {
    expect(parseStaticAbilities(OKETRA).find((d) => d.costReduction).costReduction.colors).toEqual(["W"]);
    expect(parseStaticAbilities(RHONAS).find((d) => d.costReduction).costReduction.colors).toEqual(["G"]);
  });

  it("CREED — a color + SUBTYPE cross is NOT claimed (no printed carrier, and the type-line match differs)", () => {
    expect(parseStaticAbilities({ oracle: "Green Elf spells you cast cost {1} less to cast." }).find((d) => d.costReduction))
      .toBeUndefined();
  });

  it("REGRESSION PIN — the colors-only and type-only reducers are untouched", () => {
    expect(parseStaticAbilities({ oracle: "Red spells you cast cost {1} less to cast." }).find((d) => d.costReduction).costReduction)
      .toEqual({ colors: ["R"], amount: 1 });
    expect(parseStaticAbilities({ oracle: "Creature spells you cast cost {1} less to cast." }).find((d) => d.costReduction).costReduction)
      .toEqual({ subtype: "Creature", amount: 1 });
  });
});

describe("THE AND — both qualities must hold", () => {
  it("a BLACK creature spell is reduced", () => {
    expect(reduce(BONTU, spell())).toBe(1);
  });

  it("THE LOAD-BEARING ONE — a WHITE creature spell is NOT reduced by Bontu's Monument", () => {
    // With the if/else-if dispatch and no AND, this returns 1: a wrong price on every white creature,
    // every game, and completely invisible in the coverage tier.
    expect(reduce(BONTU, spell({ mana: "{2}{W}", colors: ["W"] }))).toBe(0);
  });

  it("a BLACK non-creature spell is NOT reduced either (the type half bites too)", () => {
    expect(reduce(BONTU, spell({ type: "Instant" }))).toBe(0);
  });

  it("a multicolored spell that INCLUDES the color is reduced (CR 105.2 — colors are a union)", () => {
    expect(reduce(BONTU, spell({ mana: "{1}{W}{B}", colors: ["W", "B"] }))).toBe(1);
  });

  it("a colorless creature spell is not reduced", () => {
    expect(reduce(BONTU, spell({ mana: "{3}", colors: [] }))).toBe(0);
  });

  it("two Monuments of DIFFERENT colors each reduce only their own — a B/W creature gets {2} total", () => {
    const both = collectCostReducers([{ card: BONTU }, { card: OKETRA }]);
    expect(costReductionForSpell(both, spell({ mana: "{1}{W}{B}", colors: ["W", "B"] }))).toBe(2);
    expect(costReductionForSpell(both, spell({ mana: "{2}{B}", colors: ["B"] }))).toBe(1);
  });
});

describe("classification — the cycle this unblocks", () => {
  it("Bontu's / Oketra's / Rhonas's Monuments flip", () => {
    for (const c of [BONTU, OKETRA, RHONAS]) expect(classifyCard(c)).toMatch(/^native/);
  });

  it("Kefnet's Monument stays PARKED — its doesn't-untap rider is unmodeled (whole-card law)", () => {
    expect(classifyCard(monument("Kefnet's Monument", "blue",
      "Whenever you cast a creature spell, target creature an opponent controls doesn't untap during its controller's next untap step.")))
      .toBe("body-only");
  });
});
