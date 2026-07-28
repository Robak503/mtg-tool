/**
 * lockedCandidate.test.js — the locked/candidate deck model (roadmap wave 3 item 8).
 *
 * Omnath's schema read, built as delivered. A per-card `locked` BOOLEAN — not a new `section` value and
 * not a separate candidates list.
 *
 * WHY A FIELD AND NOT A SECTION, verified before building rather than taken on trust: every consumer that
 * reads deck content filters with a DENY-list (`section !== "Sideboard" && section !== "Tokens"`). I
 * grepped it — 18 such sites in src/, and ZERO allow-list sites. A new section value would fall through
 * all 18 SILENTLY and be counted as real deck content: inflating the power rating, bending the curve,
 * pricing into the ledger, and reaching the ENGINE as a castable card, with no error anywhere. A new
 * FIELD is invisible to those same 18, so today's behaviour is untouched and each consumer opts in
 * deliberately.
 *
 * THE DEFAULT IS THE SAFETY PROPERTY. Absent means LOCKED. Every deck that exists right now reads exactly
 * as it did before this shipped — no migration, and no possibility of a deck quietly losing cards under
 * its owner. That is the assertion this file guards hardest.
 */
import { describe, expect, it } from "vitest";

import { isDeckSlot, isLocked, isCandidate, lockedCount, candidateCount, normalizeDeck } from "./deckMemory.js";

const card = (name, extra = {}) => ({ name, qty: 1, section: "Mainboard", ...extra });

describe("THE DEFAULT — absent means locked, so nothing changes under an existing deck", () => {
  it("a card with no `locked` field is locked", () => {
    expect(isLocked(card("Sol Ring"))).toBe(true);
    expect(isCandidate(card("Sol Ring"))).toBe(false);
  });

  it("a whole legacy deck counts exactly as it did before the model existed", () => {
    // The pre-existing hand-rolled count was: everything that isn't Sideboard/Tokens.
    const cards = [
      card("Sol Ring"), card("Arcane Signet"), card("Forest", { qty: 30 }),
      card("Omnath", { section: "Commander" }),
      card("Sideboard Thing", { section: "Sideboard" }),
      card("Treasure", { section: "Tokens", qty: 5 }),
    ];
    const legacy = cards.filter((c) => c.section !== "Sideboard" && c.section !== "Tokens").reduce((s, c) => s + c.qty, 0);
    expect(lockedCount(cards)).toBe(legacy);
    expect(candidateCount(cards)).toBe(0);
  });
});

describe("CANDIDATES — only an explicit false demotes a card", () => {
  it("locked:false is a candidate and does not count toward x/100", () => {
    const cards = [card("Sol Ring"), card("Maybe This", { locked: false })];
    expect(lockedCount(cards)).toBe(1);
    expect(candidateCount(cards)).toBe(1);
  });

  it("qty is respected on both sides of the bar", () => {
    const cards = [card("Forest", { qty: 12 }), card("Snow Forest", { qty: 4, locked: false })];
    expect(lockedCount(cards)).toBe(12);
    expect(candidateCount(cards)).toBe(4);
  });

  it("a truthy-but-not-true value does NOT demote — only the literal false does", () => {
    // Fail-safe toward the status quo: a hand-edited file with `locked: 0` or `locked: "no"` must not
    // silently shrink someone's deck. Only a real boolean false is a demotion.
    for (const v of [undefined, null, true, 1, "false", 0]) {
      expect(isLocked(card("X", { locked: v }))).toBe(true);
    }
    expect(isLocked(card("X", { locked: false }))).toBe(false);
  });
});

describe("THE COMMANDER is structurally lock #1, and it is DERIVED", () => {
  it("a commander is locked even when the file says otherwise", () => {
    // Color identity comes off the commander (CR 903.4) and the pips derive from it. A candidate
    // commander would make identity ambiguous and every downstream legality check unstable, so a stored
    // locked:false is IGNORED rather than honoured.
    const cmd = card("Omnath, Locus of Mana", { section: "Commander", locked: false });
    expect(isLocked(cmd)).toBe(true);
    expect(isCandidate(cmd)).toBe(false);
    expect(lockedCount([cmd])).toBe(1);
  });

  it("normalizeDeck FORCES the commander's flag true on the way in", () => {
    const out = normalizeDeck({ cards: [card("Omnath", { section: "Commander", locked: false })] });
    expect(out.cards[0].locked).toBe(true);
  });
});

describe("SIDEBOARD and TOKENS are never deck content, locked or otherwise", () => {
  it.each(["Sideboard", "Tokens"])("%s is neither locked nor candidate", (section) => {
    const c = card("Thing", { section });
    expect(isDeckSlot(c)).toBe(false);
    expect(isLocked(c)).toBe(false);
    expect(isCandidate(c)).toBe(false);
  });

  it("they stay out of both counts", () => {
    const cards = [card("Real"), card("SB", { section: "Sideboard" }), card("Tok", { section: "Tokens", locked: false })];
    expect(lockedCount(cards)).toBe(1);
    expect(candidateCount(cards)).toBe(0);
  });
});

describe("normalizeDeck fail-safes toward the status quo", () => {
  it("stamps locked:true on every ordinary card", () => {
    const out = normalizeDeck({ cards: [card("Sol Ring"), card("Forest")] });
    expect(out.cards.every((c) => c.locked === true)).toBe(true);
  });

  it("preserves an explicit candidate", () => {
    const out = normalizeDeck({ cards: [card("Maybe", { locked: false })] });
    expect(out.cards[0].locked).toBe(false);
  });

  it("coerces a junk value to LOCKED rather than to candidate", () => {
    // The direction matters: coercing the wrong way would delete cards from a deck on load.
    const out = normalizeDeck({ cards: [card("Junk", { locked: "maybe" }), card("Junk2", { locked: 0 })] });
    expect(out.cards.map((c) => c.locked)).toEqual([true, true]);
  });
});
