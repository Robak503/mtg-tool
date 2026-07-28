/**
 * disjunctivePtBound.test.js — "with power OR TOUGHNESS N or less" (Warping Wail, EDHREC #2046).
 *
 * BOTH HALVES WERE ALREADY MODELED. "with power 1 or less" parsed HIGH and "with toughness 1 or less"
 * parsed HIGH; only the disjunction was missing. The failure mode was subtle and worth recording: the
 * toughness matcher consumed "toughness 1 or less" out of the MIDDLE of the printed phrase and left
 * "power or" behind as residue, which fails the cleanliness check — so the card parsed low for a reason
 * that looked nothing like "we don't model this". Hence the whole-phrase strip, ordered BEFORE the
 * single-characteristic matchers.
 *
 * ONE RESTRICTION, NOT TWO. The restrictions array is AND-ed. Pushing {power<=1} and {toughness<=1}
 * separately would demand BOTH bounds, and Warping Wail could not hit a 3/1 — an under-offer that would
 * have looked like a working card while quietly playing a different one. The OR lives inside the kind,
 * and the 3/1 and 1/3 tests below are what prove it.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { enumerateTargets } from "./spellEffects.js";
import { parseEffectClause } from "./effects/parser.js";

const c = (id, name, power, toughness) => ({
  id, controller: "ai1",
  card: { id: `c-${id}`, name, type: "Creature — Bear", oracle: "", power, toughness },
});

/** A board covering every corner of the disjunction against a bound of 1. */
function board() {
  return {
    players: {
      user: { battlefield: [], graveyard: [] },
      ai1: {
        graveyard: [],
        battlefield: [
          c("small", "One One", 1, 1),      // both <= 1
          c("wide", "Three One", 3, 1),     // toughness only  <- the case an AND would wrongly drop
          c("tall", "One Three", 1, 3),     // power only      <- likewise
          c("big", "Four Four", 4, 4),      // neither
        ],
      },
    },
  };
}

const names = (restrictions) =>
  enumerateTargets(board(), "user", { targetType: "creature", restrictions }, [], {}).map((t) => t.name).sort();

describe("parse — the disjunction is one restriction", () => {
  it("'power or toughness 1 or less' becomes a single powerOrToughness restriction (Warping Wail)", () => {
    const p = parseEffectClause("exile target creature with power or toughness 1 or less");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{
      op: "exile", targetType: "creature",
      restrictions: [{ kind: "powerOrToughness", op: "<=", value: 1 }],
    }]);
  });

  it("REGRESSION PIN — the single-characteristic forms are untouched", () => {
    expect(parseEffectClause("exile target creature with power 1 or less").atoms)
      .toEqual([{ op: "exile", targetType: "creature", restrictions: [{ kind: "power", op: "<=", value: 1 }] }]);
    expect(parseEffectClause("exile target creature with toughness 1 or less").atoms)
      .toEqual([{ op: "exile", targetType: "creature", restrictions: [{ kind: "toughness", op: "<=", value: 1 }] }]);
  });
});

describe("enumeration — EITHER characteristic is enough", () => {
  it("THE LOAD-BEARING PAIR — a 3/1 and a 1/3 are both legal targets", () => {
    // An AND of two restrictions would drop both of these while still passing a naive 1/1 test. This is
    // the assertion that distinguishes a working card from a plausible-looking wrong one.
    const got = names([{ kind: "powerOrToughness", op: "<=", value: 1 }]);
    expect(got).toContain("Three One");
    expect(got).toContain("One Three");
  });

  it("a creature failing BOTH bounds is never offered", () => {
    expect(names([{ kind: "powerOrToughness", op: "<=", value: 1 }])).not.toContain("Four Four");
  });

  it("the full set for 'or less 1' is exactly the three qualifying creatures", () => {
    expect(names([{ kind: "powerOrToughness", op: "<=", value: 1 }])).toEqual(["One One", "One Three", "Three One"]);
  });

  it("the 'or greater' direction mirrors it (either characteristic at or above the bound)", () => {
    expect(names([{ kind: "powerOrToughness", op: ">=", value: 3 }])).toEqual(["Four Four", "One Three", "Three One"]);
  });

  it("CONTRAST — the AND-ed single restrictions really are stricter (why the OR needed its own kind)", () => {
    expect(names([{ kind: "power", op: "<=", value: 1 }, { kind: "toughness", op: "<=", value: 1 }]))
      .toEqual(["One One"]);
  });
});

describe("classification — the staple this unblocks", () => {
  it("Warping Wail's shape flips", () => {
    expect(classifyCard({
      name: "Warping Wail", type: "Instant", mana: "{1}{C}", keywords: [],
      oracle: "Choose one —\n• Counter target sorcery spell.\n• Exile target creature with power or toughness 1 or less.\n• Create a 1/1 colorless Eldrazi Scion creature token. It has \"Sacrifice this creature: Add {C}.\"",
    })).toMatch(/^native/);
  });
});
