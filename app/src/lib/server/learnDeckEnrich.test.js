/**
 * Tests for learnDeckEnrich.js — filling blank learn-session deck cards from the
 * local index. Uses an INJECTED lookup so the suite never depends on the large,
 * gitignored oracle index being present.
 */

import { describe, it, expect } from "vitest";
import { mergeCardData, enrichDeckCard, enrichDeck, enrichDecks } from "./learnDeckEnrich.js";

// A fake index: the four cards a Koma opening hand might contain.
const FAKE = {
  "Lightning Bolt": { type: "Instant", mana: "{R}", oracle: "Lightning Bolt deals 3 damage to any target.", cmc: 1, power: null, toughness: null, keywords: [], colors: ["R"] },
  "Grizzly Bears": { type: "Creature — Bear", mana: "{1}{G}", oracle: "", cmc: 2, power: "2", toughness: "2", keywords: [], colors: ["G"] },
  "Forest": { type: "Basic Land — Forest", mana: "", oracle: "", cmc: 0, power: null, toughness: null, keywords: [], colors: [] },
  "Serra Angel": { type: "Creature — Angel", mana: "{3}{W}{W}", oracle: "Flying, vigilance", cmc: 5, power: "4", toughness: "4", keywords: ["Flying", "Vigilance"], colors: ["W"] },
};
const lookup = (name) => FAKE[name] || null;

const blank = (name) => ({ id: `d-${name}-0`, name, type: "", mana: "", oracle: "" });

describe("mergeCardData", () => {
  it("fills missing engine fields and keeps id + name", () => {
    const merged = mergeCardData(blank("Lightning Bolt"), FAKE["Lightning Bolt"]);
    expect(merged).toMatchObject({
      id: "d-Lightning Bolt-0",
      name: "Lightning Bolt",
      type: "Instant",
      mana: "{R}",
      oracle: "Lightning Bolt deals 3 damage to any target.",
      cmc: 1,
    });
  });
  it("carries power/toughness/keywords/colors for creatures", () => {
    const merged = mergeCardData(blank("Serra Angel"), FAKE["Serra Angel"]);
    expect(merged).toMatchObject({ power: "4", toughness: "4", keywords: ["Flying", "Vigilance"], colors: ["W"] });
  });
  it("returns the card untouched when there is no index data", () => {
    const card = blank("Unknown Card");
    expect(mergeCardData(card, null)).toBe(card);
  });
});

describe("enrichDeckCard", () => {
  it("enriches a blank card by name", () => {
    expect(enrichDeckCard(blank("Lightning Bolt"), lookup).mana).toBe("{R}");
  });
  it("is idempotent — an already-shaped card is left untouched (no clobber)", () => {
    const shaped = { id: "x", name: "Lightning Bolt", type: "Instant", mana: "{R}", oracle: "custom text" };
    expect(enrichDeckCard(shaped, lookup)).toBe(shaped);
  });
  it("leaves an unknown name BLANK (honest fail-safe, never fabricates)", () => {
    const card = blank("Totally Made Up Card");
    const out = enrichDeckCard(card, lookup);
    expect(out.type).toBe("");
    expect(out.oracle).toBe("");
    expect(out.mana).toBe("");
  });
  it("handles null/nameless cards without throwing", () => {
    expect(enrichDeckCard(null, lookup)).toBeNull();
    expect(enrichDeckCard({ id: "x" }, lookup)).toEqual({ id: "x" });
  });
});

describe("enrichDeck / enrichDecks", () => {
  it("enriches every card in a flat deck", () => {
    const deck = [blank("Forest"), blank("Grizzly Bears"), blank("Lightning Bolt")];
    const out = enrichDeck(deck, lookup);
    expect(out.map(c => c.type)).toEqual(["Basic Land — Forest", "Creature — Bear", "Instant"]);
  });
  it("enriches an array of decks (the Commander pod)", () => {
    const decks = [[blank("Forest")], [blank("Grizzly Bears")], [blank("Serra Angel")]];
    const out = enrichDecks(decks, lookup);
    expect(out[0][0].type).toBe("Basic Land — Forest");
    expect(out[2][0].keywords).toContain("Flying");
  });
  it("passes non-arrays through unchanged", () => {
    expect(enrichDeck(undefined, lookup)).toBeUndefined();
    expect(enrichDecks(null, lookup)).toBeNull();
  });
});
