/**
 * spendRestrictedMana.test.js — SPEND-RESTRICTED MANA (CR 106.6) must not be modeled as general mana.
 *
 * "{T}: Add {U}. Spend this mana only to cast an artifact spell." The payment planner has NO restricted-mana
 * concept, so modelling the source at all hands the engine GENERAL-PURPOSE mana from a restricted one —
 * strictly better than the printed card, and the forbidden FP direction. The whole card routes out (null →
 * Arbiter, a clean false negative) until restrictions are real.
 *
 * ⚠️ THE GUARD ALREADY EXISTED FOR QUOTED/GRANTED abilities (stripNonSelfQuotedGrants — Battery Bearer),
 * with this exact reasoning written out in its comment. A card's OWN printed mana line had no such check,
 * so 60 non-land cards were credited native-mana with the restriction silently dropped — including
 * JEWELED LOTUS, whose three mana are commander-only and were being spent on anything.
 *
 * ⭐ HOW IT WAS FOUND, because the method is the transferable part: `probe-lossy-clause-tails.mjs` injects a
 * clause that can never be modeled ("and glorbulate") into each printed line of every native card and
 * re-classifies. A card that STAYS native proves its parser read a prefix and ignored the rest. The
 * mana-ability shapes were the probe's largest cluster, and this is what was hiding under them. The
 * previous instance of this same FP class (the lossy anthem tail) was found BY ACCIDENT; this one was found
 * on purpose.
 */
import { describe, expect, it } from "vitest";

import { manaProduction } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

const artifact = (oracle) => ({ name: "X", type: "Artifact", mana: "{2}", oracle });

describe("a spend restriction routes the whole card out", () => {
  it("⭐ THE LOAD-BEARING ONE — restricted mana is never GENERAL-PURPOSE mana", () => {
  // ⭐⭐ RE-POINTED 2026-07-29 — THIS PIN GRADUATED. It asserted `null` because the payment planner had no
  // restricted-mana concept, and this file's own header named the condition: *"until restrictions are real."*
  // They are now real for the CAST half (parseSpendRestriction → source.restriction → planPayment's
  // default-deny + no-surplus filter), so the pin moves from "produces NOTHING" to "produces a source that
  // carries its restriction" — which is the same CREED claim, now expressible. A CAPABILITY pin graduates on
  // runtime proof and is RE-POINTED, never deleted; the proof is spendRestrictedManaRuntime.test.js, which
  // shows the source pays its printed cast, refuses every other, refuses a caller with no context, and
  // refuses to launder surplus.
    const prod = manaProduction(artifact("{T}: Add {C}. Spend this mana only to cast artifact spells."));
    expect(prod.restriction).toEqual({ castTypes: ["artifact"] });
  });

  it("the \"can't be spent to\" phrasing is covered too", () => {
    expect(manaProduction(artifact("{T}: Add {C}. This mana can't be spent to cast a nonartifact spell."))).toBe(null);
  });

  it("and the card classifies native-mana ONLY because the restriction now rides with it", () => {
    // ⭐⭐ RE-POINTED with its siblings. The tier flips to native-mana BECAUSE the restriction is now modeled,
    // not because it was dropped — which is exactly the distinction this file exists to police. The assertion
    // therefore pairs the tier with the tag: a native-mana tier on a restricted card is only honest while the
    // restriction rides along, so asserting the tier ALONE would be the false positive.
    const card = artifact("{T}: Add {C}. Spend this mana only to cast artifact spells.");
    expect(classifyCard(card)).toBe("native-mana");
    expect(manaProduction(card).restriction).toEqual({ castTypes: ["artifact"] });
  });

  it("⭐ Jeweled Lotus — three mana that are COMMANDER-ONLY are not general mana", () => {
    const lotus = { name: "Jeweled Lotus", type: "Legendary Artifact", mana: "{0}",
      oracle: "{T}, Sacrifice this artifact: Add three mana of any one color. Spend this mana only to cast your commander." };
    // Re-pointed with the rest — the claim is unchanged (three COMMANDER-ONLY mana are not general mana);
    // only the mechanism moved from refusing the card to tagging the source. The runtime file proves the
    // tag bites, including that these three cannot be tapped for a 1- or 2-mana commander cast (surplus
    // would launder them into general mana).
    expect(manaProduction(lotus).restriction).toEqual({ castTypes: ["@commander"] });
  });
});

describe("⭐ CREED — the refusal is NARROW; unrestricted sources are untouched", () => {
  it("a plain tap-for-mana artifact still produces", () => {
    expect(manaProduction(artifact("{T}: Add {C}."))).toMatchObject({ amount: 1 });
    expect(classifyCard(artifact("{T}: Add {C}."))).toBe("native-mana");
  });

  it("a two-mana rock still produces two", () => {
    expect(manaProduction(artifact("{T}: Add {C}{C}."))).toMatchObject({ amount: 2 });
  });

  it("an any-color source still produces", () => {
    expect(manaProduction({ name: "X", type: "Creature — Bird", mana: "{G}", power: 0, toughness: 1, oracle: "Flying\n{T}: Add one mana of any color." })).toBeTruthy();
  });

  it("a card merely MENTIONING spending is not caught (the phrase is anchored)", () => {
    expect(manaProduction(artifact("{T}: Add {C}.\nWhenever you spend mana to cast a spell, scry 1."))).toBeTruthy();
  });
});
