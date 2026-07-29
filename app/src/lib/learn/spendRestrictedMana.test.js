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
  it("⭐ THE LOAD-BEARING ONE — restricted mana produces NO source at all", () => {
    expect(manaProduction(artifact("{T}: Add {C}. Spend this mana only to cast artifact spells."))).toBe(null);
  });

  it("the \"can't be spent to\" phrasing is covered too", () => {
    expect(manaProduction(artifact("{T}: Add {C}. This mana can't be spent to cast a nonartifact spell."))).toBe(null);
  });

  it("and the card does not classify native-mana", () => {
    expect(classifyCard(artifact("{T}: Add {C}. Spend this mana only to cast artifact spells."))).not.toBe("native-mana");
  });

  it("⭐ Jeweled Lotus — three mana that are COMMANDER-ONLY are not general mana", () => {
    const lotus = { name: "Jeweled Lotus", type: "Legendary Artifact", mana: "{0}",
      oracle: "{T}, Sacrifice this artifact: Add three mana of any one color. Spend this mana only to cast your commander." };
    expect(manaProduction(lotus)).toBe(null);
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
