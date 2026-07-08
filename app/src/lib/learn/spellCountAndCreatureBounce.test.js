/**
 * spellCountAndCreatureBounce.test.js — two small coverage extensions (overnight grind batch).
 *
 * 1) SPELLS-CAST-THIS-TURN intervening-if: evaluateInterveningIf now reads the per-turn spellsCastThisTurn
 *    counter for "you've cast [N or more] spells this turn" (Loan Shark's ETB). Same source the native
 *    "cast your second spell" triggers use; interveningIfParseable picks it up automatically.
 * 2) CREATURE bounce controller restriction: bounceClauseParser now accepts "return target creature
 *    [you control | an opponent controls | you don't control] to its owner's hand" (Chulane), mirroring the
 *    non-creature branch. Flip-diff GAINED = {Loan Shark, Chulane, + 9 corpus bounce cards}, LOST = 0.
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";

const C = (name, oracle, type) => ({ name, oracle, type, keywords: [], mana: "" });

describe("SPELLS-CAST-THIS-TURN intervening-if — Loan Shark", () => {
  it("Loan Shark ('if you've cast two or more spells this turn') is native-trigger", () => {
    const card = C("Loan Shark", "When Loan Shark enters, if you've cast two or more spells this turn, draw a card.\nPlot {3}{U} (You may pay {3}{U} and exile this card from your hand as a sorcery. Cast it as a sorcery on a later turn without paying its mana cost.)", "Creature — Shark");
    expect(classifyCard(card)).toBe("native-trigger");
  });

  it("CREED guard: a FILTERED spell-count ('noncreature spells') stays non-native — the anchor is unfiltered spells only", () => {
    const card = C("Fake Shark", "When this creature enters, if you've cast two or more noncreature spells this turn, draw a card.", "Creature — Shark");
    expect(classifyCard(card)).not.toMatch(/^native/);
  });
});

describe("CREATURE bounce with controller restriction — Chulane family", () => {
  it("Chulane ('{3},{T}: Return target creature you control to its owner's hand') flips native", () => {
    const card = C("Chulane, Teller of Tales", "Vigilance\nWhenever you cast a creature spell, draw a card, then you may put a land card from your hand onto the battlefield.\n{3}, {T}: Return target creature you control to its owner's hand.", "Legendary Creature — Human Advisor");
    expect(classifyCard(card)).toMatch(/^native/);
  });

  it("Exclusion Mage ('return target creature an opponent controls') is native-trigger", () => {
    const card = C("Exclusion Mage", "When Exclusion Mage enters, return target creature an opponent controls to its owner's hand.", "Creature — Human Wizard");
    expect(classifyCard(card)).toBe("native-trigger");
  });

  it("CREED guard: the plain unrestricted 'return target creature' is unchanged (still native)", () => {
    const card = C("Plain Bouncer", "When this creature enters, return target creature to its owner's hand.", "Creature — Human Wizard");
    expect(classifyCard(card)).toBe("native-trigger");
  });
});
