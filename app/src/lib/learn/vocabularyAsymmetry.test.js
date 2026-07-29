/**
 * vocabularyAsymmetry.test.js — the COVERAGE WITNESS for probe-vocabulary-asymmetry.mjs.
 *
 * The probe diffs twin clause templates to find a capability present on one arm and absent on its
 * neighbour — the shape that produced three slices in a row (+6 tutor destination, +6 tutor filters,
 * +13 reanimate filters). Its whole value is the day it prints a row nobody expected.
 *
 * ⛔ WHICH MEANS A CLEAN RUN MUST BE EARNED, NOT ASSUMED. The hollow-gate law: an instrument that reports
 * zero is worthless unless it is PROVEN able to report non-zero. A probe whose templates silently stopped
 * parsing — a renamed helper, a changed anchor — would print "no asymmetry" forever and read as good news.
 * So this pins both directions against the live parser:
 *   • a KNOWN-ASYMMETRIC pair still reads asymmetric (the probe can still see one)
 *   • a KNOWN-SYMMETRIC pair still reads symmetric (it is not just flagging everything)
 *
 * Hermetic — parser only, no card index, no MTG_APP_ROOT — so unlike the shelf probes this contract can
 * live in CI.
 */
import { describe, expect, it } from "vitest";

import { parseEffectClause } from "./effects/parser.js";

const parses = (clause) => {
  const p = parseEffectClause(clause, "Sorcery", { hasX: false });
  return !!(p && (p.atoms || []).length && p.confidence === "high");
};

describe("⭐ the probe can still SEE an asymmetry (a zero run would otherwise be meaningless)", () => {
  it("instant/sorcery: sayable to HAND, refused to the BATTLEFIELD (rules-correct, CR 110.4a)", () => {
    // The reference asymmetry. It is also the probe's own worked example of a row that is CORRECT and must
    // never be "fixed": a card entering the battlefield has to be a permanent.
    expect(parses("return target instant card from your graveyard to your hand")).toBe(true);
    expect(parses("return target instant card from your graveyard to the battlefield")).toBe(false);
  });

  it("the uncapped battlefield TUTOR is narrower than its MV-capped twin", () => {
    // The live lead this probe surfaced: bfm's guaranteed-land guard. Recorded as a pin so that if the
    // guard is ever revisited, this test names what changed rather than the change passing silently.
    expect(parses("search your library for a creature card with mana value 3 or less, put it onto the battlefield, then shuffle")).toBe(true);
    expect(parses("search your library for a creature card, put it onto the battlefield, then shuffle")).toBe(false);
  });
});

describe("⛔ and it is not merely flagging everything", () => {
  it("a KNOWN-SYMMETRIC pair reads symmetric — the tutor destinations agree on a creature filter", () => {
    // hand + graveyard both accept it (the graveyard arm shipped in the destination slice). If this ever
    // reads asymmetric, a destination regressed.
    expect(parses("search your library for a creature card, put it into your hand, then shuffle")).toBe(true);
    expect(parses("search your library for a creature card, put it into your graveyard, then shuffle")).toBe(true);
  });

  it("destroy and exile agree on every noun the probe feeds them", () => {
    for (const noun of ["creature", "artifact", "enchantment", "permanent", "nonland permanent", "creature or planeswalker"]) {
      expect(parses(`destroy target ${noun}`), `destroy ${noun}`).toBe(true);
      expect(parses(`exile target ${noun}`), `exile ${noun}`).toBe(true);
    }
  });
});
