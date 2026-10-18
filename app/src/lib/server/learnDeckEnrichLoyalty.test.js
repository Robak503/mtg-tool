/**
 * learnDeckEnrichLoyalty.test.js — a planeswalker's printed loyalty survives deck enrichment.
 *
 * THE BUG (found 2026-10-18 by the planeswalker-attack slice): `mergeCardData` copied power and toughness from the local
 * index but never `loyalty`, and the already-shaped branch backfilled only layout and colour identity. So every
 * planeswalker in a game deck reached the engine with no loyalty: `startingLoyalty` read null, `planeswalkerPlayable`
 * refused it, and the cast resolved as a no-op (actionDispatcher's SPELL_NOOP lane) — in the 80-game A/B batch 25 of 26
 * planeswalker casts did nothing. The same enrichment feeds /api/learn/start, so the Academy had it too.
 *
 * Card text below is copied from the bundled oracle (data/scryfall-bulk/oracle_cards.json).
 */

import { describe, it, expect } from "vitest";
import { mergeCardData, enrichDeckCard } from "./learnDeckEnrich.js";
import { startingLoyalty } from "../learn/gameState.js";
import { planeswalkerPlayable } from "../learn/effects/loyaltyAbilities.js";

const LILIANA_INDEX = {
  type: "Legendary Planeswalker — Liliana",
  mana: "{1}{B}{B}",
  oracle: "+1: Each player discards a card.\n−2: Target player sacrifices a creature.\n−6: Separate all permanents target player controls into two piles. That player sacrifices all permanents in the pile of their choice.",
  cmc: 3,
  power: null,
  toughness: null,
  loyalty: "3",
  keywords: [],
  colors: ["B"],
  colorIdentity: ["B"],
  layout: "normal",
};
const BEARS_INDEX = { type: "Creature — Bear", mana: "{1}{G}", oracle: "", cmc: 2, power: "2", toughness: "2", loyalty: null, keywords: [], colors: ["G"], colorIdentity: ["G"], layout: "normal" };
const FAKE = { "Liliana of the Veil": LILIANA_INDEX, "Grizzly Bears": BEARS_INDEX };
const lookup = (name) => FAKE[name] || null;

describe("a planeswalker's loyalty survives enrichment", () => {
  it("a blank deck card picks up its printed loyalty, so the engine reads a starting loyalty and plays it", () => {
    const merged = enrichDeckCard({ id: "d-1", name: "Liliana of the Veil", type: "", mana: "", oracle: "" }, lookup);
    expect(merged.loyalty).toBe("3");
    expect(startingLoyalty(merged)).toBe(3);
    expect(planeswalkerPlayable(merged)).toBe(true);
  });

  it("a saved, already-shaped deck card without loyalty (the app's deck snapshot) gets it backfilled", () => {
    const saved = { id: "d-2", name: "Liliana of the Veil", type: LILIANA_INDEX.type, mana: LILIANA_INDEX.mana, oracle: LILIANA_INDEX.oracle, layout: "normal", colorIdentity: ["B"] };
    const enriched = enrichDeckCard(saved, lookup);
    expect(enriched.loyalty).toBe("3");
    expect(startingLoyalty(enriched)).toBe(3);
    expect(planeswalkerPlayable(enriched)).toBe(true);
  });

  it("control: a card's own loyalty is never overwritten", () => {
    const merged = mergeCardData({ id: "d-3", name: "Liliana of the Veil", type: "", mana: "", oracle: "", loyalty: "5" }, LILIANA_INDEX);
    expect(merged.loyalty).toBe("5");
  });

  it("control: a fully shaped non-planeswalker is returned untouched (no lookup needed)", () => {
    const shaped = { id: "d-4", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", oracle: "", layout: "normal", colorIdentity: ["G"] };
    expect(enrichDeckCard(shaped, lookup)).toBe(shaped);
  });

  it("control: a non-planeswalker merges with no loyalty", () => {
    const merged = enrichDeckCard({ id: "d-5", name: "Grizzly Bears", type: "", mana: "", oracle: "" }, lookup);
    expect(merged.loyalty ?? null).toBeNull();
  });
});
