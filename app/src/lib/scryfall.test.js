/**
 * Card-name detection tests.
 *
 * Regression guard for the grounding bug where a chat about a comma-named
 * commander ("Omnath, Locus of Mana", "Atraxa, Praetors' Voice") attached NO
 * Oracle text, because the old tokenizer split on commas and the rejoined
 * span ("Omnath , Locus of Mana") never matched the catalog key. With no card
 * data in the prompt, the local model fabricated card text. Nearly every
 * legendary commander has a comma, so this hit the single most common case.
 *
 * detectCardNamesFromCatalog is the free-text detector that feeds
 * buildCardContext; these tests pin its behavior on the cases that mattered.
 */

import { describe, expect, it } from "vitest";

import { buildCatalogMaps, detectCardNamesFromCatalog, normalizeCardKey } from "./scryfall";

const CARDS = [
  "Omnath, Locus of Mana",
  "Atraxa, Praetors' Voice",
  "Krenko, Mob Boss",
  "Sol Ring",
  "Forest",
  "Tovolar, Dire Overlord // Tovolar, the Midnight Scourge",
];

const { exact, normalized } = buildCatalogMaps(CARDS);
const detect = text => detectCardNamesFromCatalog(text, exact, normalized);

describe("normalizeCardKey", () => {
  it("lowercases and collapses punctuation to single spaces", () => {
    expect(normalizeCardKey("Omnath, Locus of Mana")).toBe("omnath locus of mana");
    expect(normalizeCardKey("Atraxa, Praetors' Voice")).toBe("atraxa praetors voice");
    expect(normalizeCardKey("  Sol   Ring!  ")).toBe("sol ring");
  });
});

describe("detectCardNamesFromCatalog", () => {
  it("detects a comma name typed plainly (the original bug)", () => {
    expect(detect("Omnath, Locus of Mana")).toEqual(["Omnath, Locus of Mana"]);
  });

  it("detects a comma name embedded in a sentence", () => {
    expect(detect("how does Omnath, Locus of Mana work with my mana pool")).toEqual([
      "Omnath, Locus of Mana",
    ]);
  });

  it("detects an apostrophe name from prose", () => {
    expect(detect("is Atraxa, Praetors' Voice any good?")).toEqual(["Atraxa, Praetors' Voice"]);
  });

  it("still detects a plain comma-free name", () => {
    expect(detect("tell me about Sol Ring")).toEqual(["Sol Ring"]);
  });

  it("detects a DFC/split card by its front face", () => {
    expect(detect("I cast Tovolar, Dire Overlord on turn three")).toEqual([
      "Tovolar, Dire Overlord // Tovolar, the Midnight Scourge",
    ]);
  });

  it("detects multiple cards in one message", () => {
    expect(detect("does Krenko, Mob Boss work with Sol Ring").sort()).toEqual(
      ["Krenko, Mob Boss", "Sol Ring"].sort(),
    );
  });

  it("does not match ordinary prose", () => {
    expect(detect("what is the best removal spell for this deck")).toEqual([]);
  });

  it("does not guess on an ambiguous bare first name (documented limitation)", () => {
    // "omnath" alone maps to 5+ real cards; we intentionally do not guess —
    // the user should bracket [[Omnath, Locus of Mana]] or type the full name.
    expect(detect("pull the oracle text for omnath")).toEqual([]);
  });

  it("returns nothing when the catalog is empty", () => {
    expect(detectCardNamesFromCatalog("Sol Ring", new Map(), new Map())).toEqual([]);
  });
});
