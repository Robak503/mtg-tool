/**
 * Tests for the COST-INTEGRITY GUARD in check-local-oracle.cjs.
 *
 * The guard catches a sync regression that drops a real mana cost from a playable card (so a
 * consumer deriving a cast cost from the empty string would treat it as FREE). It must flag a
 * commander-legal castable card that has cmc>0 and no cost anywhere, while staying silent on the
 * legitimately-costless entries Scryfall ships (tokens, meld backs, suspend-only spells, DFC fronts).
 *
 * ESM test importing the CommonJS guard module — Node's interop exposes its named exports.
 */

import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { findCostlessCastableCards, hasCastableCost } = require("./check-local-oracle.cjs");

const legal = { commander: "legal" };

describe("hasCastableCost", () => {
  it("true for a top-level cost", () => {
    expect(hasCastableCost({ mana_cost: "{G}" })).toBe(true);
  });
  it("true when only a face carries the cost (DFC)", () => {
    expect(hasCastableCost({ mana_cost: "", card_faces: [{ mana_cost: "{2}{R}" }, { mana_cost: "" }] })).toBe(true);
  });
  it("false when neither the card nor any face has a cost", () => {
    expect(hasCastableCost({ mana_cost: "", card_faces: [{ mana_cost: "" }] })).toBe(false);
  });
});

describe("findCostlessCastableCards — the data-pipeline tripwire", () => {
  it("flags a commander-legal creature with cmc>0 and no cost (the dropped-cost regression)", () => {
    const cards = [
      { name: "Llanowar Elves", type_line: "Creature — Elf Druid", cmc: 1, mana_cost: "", card_faces: [], legalities: legal },
    ];
    expect(findCostlessCastableCards(cards).map((c) => c.name)).toEqual(["Llanowar Elves"]);
  });

  it("does NOT flag a card whose cost is present", () => {
    const cards = [
      { name: "Elvish Mystic", type_line: "Creature — Elf Druid", cmc: 1, mana_cost: "{G}", legalities: legal },
    ];
    expect(findCostlessCastableCards(cards)).toEqual([]);
  });

  it("does NOT flag a DFC whose cost lives on the front face", () => {
    const cards = [
      {
        name: "Esika, God of the Tree // The Prismatic Bridge",
        type_line: "Legendary Creature — God // Legendary Enchantment",
        cmc: 3,
        mana_cost: "",
        card_faces: [{ mana_cost: "{1}{G}{G}" }, { mana_cost: "" }],
        legalities: legal,
      },
    ];
    expect(findCostlessCastableCards(cards)).toEqual([]);
  });

  it("does NOT flag a predefined token (not commander-legal, no cost by rule)", () => {
    const cards = [
      { name: "Llanowar Elves", type_line: "Token Creature — Elf Druid", cmc: 0, mana_cost: "", legalities: { commander: "not_legal" } },
    ];
    expect(findCostlessCastableCards(cards)).toEqual([]);
  });

  it("does NOT flag a suspend-only / true-0-cost spell (cmc 0)", () => {
    const cards = [
      { name: "Ancestral Vision", type_line: "Sorcery", cmc: 0, mana_cost: "", legalities: legal },
    ];
    expect(findCostlessCastableCards(cards)).toEqual([]);
  });

  it("does NOT flag a meld result (commander-legal + cmc>0 but layout 'meld' — never cast)", () => {
    const cards = [
      { name: "Brisela, Voice of Nightmares", type_line: "Legendary Creature — Eldrazi Angel", cmc: 11, mana_cost: "", layout: "meld", legalities: legal },
    ];
    expect(findCostlessCastableCards(cards)).toEqual([]);
  });

  it("does NOT flag a land (no cost by rule)", () => {
    const cards = [
      { name: "Wastes", type_line: "Basic Land", cmc: 0, mana_cost: "", legalities: legal },
    ];
    expect(findCostlessCastableCards(cards)).toEqual([]);
  });
});
