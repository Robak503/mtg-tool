/**
 * auraDredgeLine.test.js — an Aura's own "Dredge N" line was residue to the static-bonus aura lane while
 * `coverage.isKeywordOnly` already credits it everywhere else (Moldervine Cloak).
 *
 * THE ARGUMENT IS THE PROJECT'S OWN, not a new one. coverage.js records it beside `reDredgeCost`: dredge
 * is a REPLACEMENT OPTION on a draw taken while the card sits in the GRAVEYARD, the engine never offers
 * it, so every draw stays a normal draw and the resolution is faithful. Nothing about the Aura's
 * battlefield behaviour changes either way. A vanilla creature printing "Dredge 2" is already native-body
 * — this lane was simply disagreeing with a call that had been settled.
 *
 * ⛔ ADDED AS ITS OWN ANCHORED LINE, deliberately not as a blanket "admit every covered keyword". Each
 * entry in that residue walk carries a SEPARATE vacuity argument — flash (the timing goes unused), cycling
 * (a hand-zone action the runtime really does offer), madness (an alternative entry), escape (a recast
 * window) — and a wholesale isKeywordOnly admission would credit keywords whose aura-side behaviour
 * nobody has checked. Widening the safe way costs one line per keyword and buys an argument per keyword.
 *
 * Mutation-checked (2026-08-04, each verified applied by grepping the mutated line before running):
 * dredge line removed -> its flip pin red; digit anchor loosened to bare `^dredge` -> the reference-text
 * park red; ripple line disabled -> its flip pin red; ripple anchor loosened to bare `^ripple` -> the
 * ripple reference-text park red. (The first attempt at the ripple mutants silently applied NOTHING —
 * shell escaping ate the pattern and the suite stayed green, which would have read as an unkillable line.
 * The occurrence count is the check, not the diff.)
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-04).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard, isKeywordOnly } from "./coverage.js";
import { _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const MOLDERVINE_CLOAK = { id: "c-mc", name: "Moldervine Cloak", type: "Enchantment — Aura", mana: "{3}{G}",
  oracle: "Enchant creature\nEnchanted creature gets +3/+3.\nDredge 2" };

describe("recognition", () => {
  it("Moldervine Cloak flips to native-aura", () => {
    expect(classifyCard(MOLDERVINE_CLOAK)).toBe("native-aura");
  });

  it("the dredge line was the ONLY blocker", () => {
    expect(classifyCard({ ...MOLDERVINE_CLOAK, id: "c-a", oracle: "Enchant creature\nEnchanted creature gets +3/+3." })).toBe("native-aura");
  });

  it("the call this rides on was already settled elsewhere", () => {
    // Pinned so the next reader can see the admission is consistency, not a new permission.
    expect(isKeywordOnly("Dredge 2")).toBe(true);
    expect(classifyCard({ id: "c-v", name: "Dredger", type: "Creature — Zombie", mana: "{2}{B}", power: "2", toughness: "2",
      oracle: "Dredge 2" })).toBe("native-body");
  });

  it("⛔ dredge-REFERENCING text is not the keyword line and still parks the card", () => {
    expect(classifyCard({ ...MOLDERVINE_CLOAK, id: "c-x", name: "Odd Cloak",
      oracle: "Enchant creature\nEnchanted creature gets +3/+3.\nDredge cards you own have flying." })).toBe("body-only");
  });

  it("⛔ an unmodeled bonus beside the dredge line still parks it (the other half's gate holds)", () => {
    expect(classifyCard({ ...MOLDERVINE_CLOAK, id: "c-y", name: "Riddle Cloak",
      oracle: "Enchant creature\nEnchanted creature gets +3/+3 as long as you have interpreted the omens.\nDredge 2" })).toBe("body-only");
  });
});

describe("the sibling admission: RIPPLE N, on the same settled call", () => {
  // Added the same day, one line apart, for the same reason — kept beside dredge so the pair reads as
  // one policy rather than two ad-hoc exceptions.
  const SURGING_MIGHT = { id: "c-sm", name: "Surging Might", type: "Enchantment — Aura", mana: "{1}{G}",
    oracle: "Enchant creature\nEnchanted creature gets +2/+2.\nRipple 4" };

  it("Surging Might flips to native-aura", () => {
    expect(classifyCard(SURGING_MIGHT)).toBe("native-aura");
  });

  it("the call it rides on was already settled", () => {
    expect(isKeywordOnly("Ripple 4")).toBe(true);
    expect(classifyCard({ id: "c-rv", name: "Rippler", type: "Creature — Merfolk", mana: "{2}{U}", power: "2", toughness: "2",
      oracle: "Ripple 4" })).toBe("native-body");
  });

  it("⛔ ripple-REFERENCING text is not the keyword line and still parks", () => {
    expect(classifyCard({ ...SURGING_MIGHT, id: "c-rx", name: "Odd Might",
      oracle: "Enchant creature\nEnchanted creature gets +2/+2.\nRipple cards you own have flying." })).toBe("body-only");
  });
});
