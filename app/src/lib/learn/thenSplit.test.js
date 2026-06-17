/**
 * The ", then" sequence split (#10) — splitClauses now severs a top-level ", then " so "X, then Y"
 * composes into a 2-atom program ("Scry 2, then draw a card" — Preordain; "Surveil 2, then draw two
 * cards. You lose 2 life." — Read the Bones). The comma is required so an in-effect "then" isn't
 * severed; a mis-split just yields an unmodeled clause → low → Arbiter, never a confident partial.
 */

import { describe, it, expect } from "vitest";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";

const I = (oracle) => ({ type: "Instant", oracle });
const ops = (oracle) => parseEffectProgram(I(oracle)).atoms.map((a) => a.op);

describe("', then' splits a top-level sequence", () => {
  it("composes scry/surveil + draw (the cantrip combos)", () => {
    expect(ops("Scry 2, then draw a card.")).toEqual(["scry", "draw"]);           // Preordain
    expect(ops("Scry 4, then draw two cards.")).toEqual(["scry", "draw"]);         // Foresee
    expect(ops("Surveil 2, then draw two cards. You lose 2 life.")).toEqual(["surveil", "draw", "lose-life"]); // Read the Bones
  });
  it("composes a draw-then-effect sequence", () => {
    expect(ops("Draw a card, then you gain 2 life.")).toEqual(["draw", "gain-life"]);
  });
  it("a tutor's internal '… then shuffle' is NOT severed (the no-split guard wins)", () => {
    expect(ops("Search your library for a creature card, put it into your hand, then shuffle.")).toEqual(["tutor"]);
  });
  it("an unmodeled second half still drops the whole program (all-or-nothing)", () => {
    expect(programConfidence(parseEffectProgram(I("Scry 2, then exile the top card of your library.")))).toBe("low"); // impulse — unmodeled
    expect(programConfidence(parseEffectProgram(I("Scry 2, then create a Treasure token.")))).toBe("low");
  });
});
