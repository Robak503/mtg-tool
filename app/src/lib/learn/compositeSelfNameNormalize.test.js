/**
 * compositeSelfNameNormalize.test.js — the composite tier must normalize self-names too (slice 21).
 *
 * clauseProducesStatic's grammar is anchored on the MODERN self reference ("this creature's power and
 * toughness are each equal to …"). staticAbilitiesCoverCard normalizes an oracle with selfNormalizeOracle
 * before parsing, so a legacy printing that names ITSELF (CR 201.4 — "Mortivore's power and toughness …")
 * is credited by the single-mechanism static tier. permanentFullyCovered — the COMPOSITE tier — did not
 * normalize, so it saw the same line as unmodeled residue.
 *
 * The result was a card falling between both tiers with every piece understood:
 *
 *   the CDA line alone            -> native-static
 *   {B}: Regenerate this creature -> native-activated
 *   both together                 -> body-only          (the bug)
 *
 * Two paths reading one grammar have to normalize identically. 14 cards, all self-naming CDA creatures.
 *
 * FOUND BY the census TWO-FLIP report added this session: a card with more than one single-line deletion
 * that flips it native is a composition failure, never a missing mechanic.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";

const CDA = "Mortivore's power and toughness are each equal to the number of creature cards in all graveyards.";
const REGEN = "{B}: Regenerate this creature.";
const mortivore = (oracle) => ({ name: "Mortivore", type: "Creature — Lhurgoyf", mana: "{3}{B}", power: "*", toughness: "*", oracle });

describe("a self-NAMING static composes with other modeled abilities", () => {
  it("CDA + activated → native-mixed (was body-only)", () => {
    expect(classifyCard(mortivore(`${CDA}\n${REGEN}`))).toBe("native-mixed");
  });

  it("each half alone was already credited — which is what made this a composition bug", () => {
    expect(classifyCard(mortivore(CDA))).toBe("native-static");
    expect(classifyCard(mortivore(REGEN))).toBe("native-activated");
  });

  it("the MODERN wording composes identically (the two must not diverge)", () => {
    const modern = "This creature's power and toughness are each equal to the number of creature cards in all graveyards.";
    expect(classifyCard(mortivore(`${modern}\n${REGEN}`))).toBe("native-mixed");
  });

  it("a self-naming CDA with a modeled TRIGGER also composes (Psychosis Crawler shape)", () => {
    expect(classifyCard({ name: "Psychosis Crawler", type: "Artifact Creature — Horror", mana: "{5}", power: "*", toughness: "*",
      oracle: "Psychosis Crawler's power and toughness are each equal to the number of cards in your hand.\nWhenever you draw a card, each opponent loses 1 life." }))
      .toBe("native-mixed");
  });
});

describe("CREED — normalizing the residue credits nothing extra", () => {
  it("an UNMODELED sibling still parks the card", () => {
    expect(classifyCard(mortivore(`${CDA}\n${REGEN}\nEach opponent glorbulates twice.`))).not.toMatch(/^native/);
  });

  it("an unmodeled ACTIVATED ability still parks it", () => {
    expect(classifyCard(mortivore(`${CDA}\n{B}: Each opponent glorbulates.`))).not.toMatch(/^native/);
  });

  it("a name-shaped line that ISN'T a modeled static is not smuggled through", () => {
    expect(classifyCard(mortivore(`Mortivore's controller glorbulates each upkeep.\n${REGEN}`))).not.toMatch(/^native/);
  });
});
