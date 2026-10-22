/**
 * deckIds.test.js — the derived-id rule every saved deck is given an id by (2026-10-21).
 */
import { describe, expect, it } from "vitest";

import { derivedDeckId, ensureDeckIds, hasDeckId } from "./deckIds.js";

const deck = (name, extra = {}) => ({ name, cards: [], memory: { owner: "Colton" }, ...extra });

describe("hasDeckId", () => {
  it("a non-blank string or a finite number is an id; anything else is not", () => {
    expect(hasDeckId({ id: "deck_a_1" })).toBe(true);
    expect(hasDeckId({ id: 1720000000000 })).toBe(true);
    for (const id of [undefined, null, "", "   ", NaN, Infinity, {}, []]) expect(hasDeckId({ id })).toBe(false);
    expect(hasDeckId(null)).toBe(false);
  });
});

describe("derivedDeckId", () => {
  it("is deck_<slug>_<8 base-36 chars> and depends on scope, owner, name and ordinal", () => {
    const base = derivedDeckId(deck("Zed's X Spells"), 0, "prof_x");
    expect(base).toMatch(/^deck_zed_s_x_spells_[0-9a-z]{8}$/);
    expect(derivedDeckId(deck("Zed's X Spells"), 0, "prof_x")).toBe(base); // deterministic
    expect(derivedDeckId(deck("Zed's X Spells"), 1, "prof_x")).not.toBe(base);
    expect(derivedDeckId(deck("Zed's X Spells"), 0, "prof_y")).not.toBe(base);
    expect(derivedDeckId(deck("Zed's X Spells", { memory: { owner: "Joe" } }), 0, "prof_x")).not.toBe(base);
  });

  it("slugs accents and symbols down to [a-z0-9_]; a name with no letters slugs to 'deck'", () => {
    expect(derivedDeckId(deck("Éowyn · Ça va"))).toMatch(/^deck_eowyn_ca_va_[0-9a-z]{8}$/);
    expect(derivedDeckId(deck("!!!"))).toMatch(/^deck_deck_[0-9a-z]{8}$/);
    expect(derivedDeckId({ cards: [] })).toMatch(/^deck_deck_[0-9a-z]{8}$/);
  });
});

describe("ensureDeckIds", () => {
  it("leaves decks that have ids as the same objects and reports nothing assigned", () => {
    const decks = [deck("A", { id: "a" }), deck("B", { id: 2 })];
    const { decks: out, assigned } = ensureDeckIds(decks);
    expect(out[0]).toBe(decks[0]);
    expect(out[1]).toBe(decks[1]);
    expect(assigned).toEqual([]);
  });

  it("gives each id-less deck a distinct id, id first, without touching anything else", () => {
    const input = [deck("Twin"), deck("Other", { id: "keep" }), deck("Twin"), deck("Blank", { id: "  " })];
    const { decks, assigned } = ensureDeckIds(input, { scope: "prof_1" });
    expect(decks[1]).toBe(input[1]);
    expect(Object.keys(decks[0])[0]).toBe("id");
    expect(decks[0]).toEqual({ id: decks[0].id, ...input[0] });
    expect(decks[3].id).not.toBe("  ");
    expect(new Set(decks.map((d) => d.id)).size).toBe(4);
    expect(assigned.map((a) => [a.index, a.name])).toEqual([[0, "Twin"], [2, "Twin"], [3, "Blank"]]);
    expect(decks[0].id).toBe(derivedDeckId(input[0], 0, "prof_1"));
    expect(decks[2].id).toBe(derivedDeckId(input[2], 1, "prof_1"));
  });

  it("is idempotent: a second pass assigns nothing and returns the same ids", () => {
    const once = ensureDeckIds([deck("One"), deck("Two")]).decks;
    const twice = ensureDeckIds(once);
    expect(twice.assigned).toEqual([]);
    expect(twice.decks.map((d) => d.id)).toEqual(once.map((d) => d.id));
  });

  it("a derived id already in use (in the list or reserved) takes the next free suffix", () => {
    const derived = derivedDeckId(deck("Echo"), 0, "");
    const inList = ensureDeckIds([deck("Squatter", { id: derived }), deck("Echo")]).decks;
    expect(inList[0].id).toBe(derived);
    expect(inList[1].id).toBe(`${derived}_2`);
    const reserved = ensureDeckIds([deck("Echo")], { reserved: [derived, `${derived}_2`] }).decks;
    expect(reserved[0].id).toBe(`${derived}_3`);
  });

  it("passes anything that is not an array, and non-object entries, through untouched", () => {
    expect(ensureDeckIds(undefined)).toEqual({ decks: undefined, assigned: [] });
    const { decks } = ensureDeckIds([null, deck("Real")]);
    expect(decks[0]).toBe(null);
    expect(hasDeckId(decks[1])).toBe(true);
  });
});
