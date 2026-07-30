/**
 * bestowWithTrigger.test.js — the BESTOW + natively-routing-TRIGGER widening (Herald of Torment,
 * Crystalline Nautilus).
 *
 * `isNativeBestow` condition (3) originally demanded a KEYWORD-ONLY creature-mode body, which parked every
 * bestow card carrying a triggered ability — including ones whose trigger the engine already routes. The
 * aura mode is untouched by a self-body trigger, and the creature mode is exactly what triggerRoutesNatively
 * already validates, so the two modes compose.
 *
 * ⛔ STILL ALL-OR-NOTHING (CREED whole-card). The widening admits natively-routing TRIGGERS, never residue:
 *   - every detected trigger must route natively, AND
 *   - the body with its trigger LINES removed must still be keyword-only.
 *
 * ⭐ WHOLE LINES, not the descriptor's `sourceText`. A descriptor's sourceText is only the trigger's HEAD —
 * it carries neither the ability-word label ("Landfall — ") nor any later sentence of the effect. A
 * substring strip leaves debris that is not keyword-only, so the card parks for the WRONG reason. A printed
 * trigger occupies its own oracle line, so the line is the unit.
 */
import { describe, expect, it } from "vitest";
import { classifyCard, isNativeBestow } from "./coverage.js";

// Real printed oracles (bundled Scryfall snapshot).
const HERALD_OF_TORMENT = { name: "Herald of Torment", type: "Enchantment Creature — Demon", power: "3", toughness: "3", mana: "{1}{B}{B}",
  oracle: "Flying\nBestow {3}{B}\nAt the beginning of your upkeep, you lose 1 life.\nEnchanted creature gets +3/+3 and has flying." };
const CRYSTALLINE_NAUTILUS = { name: "Crystalline Nautilus", type: "Enchantment Creature — Nautilus", power: "4", toughness: "4", mana: "{2}{U}",
  oracle: "Bestow {3}{U}\nWhen this creature becomes the target of a spell or ability, sacrifice it.\nEnchanted creature gets +4/+4." };
// A keyword-only bestow body — the ORIGINAL path, which the widening must leave untouched.
// ⚠️ Read out of the snapshot. A first draft invented this fixture from memory and it did not classify,
// which is the second time this session that recalled card text failed a test it had no business failing.
const LEAFCROWN_DRYAD = { name: "Leafcrown Dryad", type: "Enchantment Creature — Nymph Dryad", power: "2", toughness: "2", mana: "{1}{G}",
  oracle: "Bestow {3}{G} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nReach\nEnchanted creature gets +2/+2 and has reach." };

describe("⭐ the widening admits a natively-routing trigger", () => {
  it("Herald of Torment (upkeep life-loss) is native-aura", () => {
    expect(classifyCard(HERALD_OF_TORMENT)).toBe("native-aura");
  });

  it("Crystalline Nautilus (becomes-targeted sacrifice) is native-aura", () => {
    expect(classifyCard(CRYSTALLINE_NAUTILUS)).toBe("native-aura");
  });
});

describe("⛔ still all-or-nothing", () => {
  it("an UNMODELED non-keyword body line still parks the card", () => {
    // The remainder after removing the trigger lines must be keyword-only, or the WHOLE card parks.
    const withResidue = { ...HERALD_OF_TORMENT, name: "Fake Herald",
      oracle: HERALD_OF_TORMENT.oracle + "\nSacrifice a Goblin: Untap all Swamps you control if you have exactly seven cards in hand." };
    expect(isNativeBestow(withResidue)).toBe(false);
  });

  it("a trigger that does NOT route natively still parks the card", () => {
    const badTrigger = { ...HERALD_OF_TORMENT, name: "Fake Herald 2",
      oracle: "Flying\nBestow {3}{B}\nAt the beginning of your upkeep, roll a d20 and consult the table below.\nEnchanted creature gets +3/+3 and has flying." };
    expect(isNativeBestow(badTrigger)).toBe(false);
  });

  it("a bestow card whose AURA bonus does not parse is unaffected by the widening", () => {
    const badBonus = { ...HERALD_OF_TORMENT, name: "Fake Herald 3",
      oracle: "Flying\nBestow {3}{B}\nAt the beginning of your upkeep, you lose 1 life.\nEnchanted creature gets +3/+3 and gains an unmodeled ability that does nothing describable." };
    expect(isNativeBestow(badBonus)).toBe(false);
  });

  it("the KEYWORD-ONLY path is untouched — a triggerless bestow body still qualifies the old way", () => {
    expect(isNativeBestow(LEAFCROWN_DRYAD)).toBe(true);
  });
});
