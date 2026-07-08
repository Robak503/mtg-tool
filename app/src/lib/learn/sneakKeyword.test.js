/**
 * sneakKeyword.test.js — recognize the "Sneak {cost}" alt-cast keyword (Tarkir: Dragonstorm). Sneak lets you
 * cast a card for its sneak cost if you also return an unblocked attacker you control to hand (it enters tapped
 * and attacking). It is RESOLUTION-INVARIANT (changes only how you pay, never what the card does) and has no
 * engine lane, so — exactly like ninjutsu/morph/convoke — the engine hard-casts at full printed cost and the
 * body resolves correctly; only the optional sneak entry is unmodeled. Recognized on TWO paths: isKeywordOnly
 * (permanents — reSneakCost) and stripCostOnlyKeywordLines (spells — the sneak line is stripped before the
 * effect is parsed). Flip-diff: +8, LOST=0 (Foot Ninjas, Elektra, Splinter, Oroku Saki + the four Techniques).
 */
import { describe, it, expect } from "vitest";
import { classifyCard, isKeywordOnly } from "./coverage.js";
import { stripCostOnlyKeywordLines } from "./effects/parseHelpers.js";

describe("Sneak — recognition on both paths", () => {
  it("isKeywordOnly credits a bare 'sneak {cost}' line (permanent path)", () => {
    expect(isKeywordOnly("Menace\nSneak {1}{B}")).toBe(true);
    expect(isKeywordOnly("Sneak {2}{B}")).toBe(true);
    expect(isKeywordOnly("sneak abilities cost {1} less")).toBe(false); // a sneak-referencing static is NOT a bare cost line
  });
  it("stripCostOnlyKeywordLines removes a sneak line (spell path)", () => {
    expect(stripCostOnlyKeywordLines("Draw two cards.\nSneak {2}{U}")).toBe("Draw two cards.");
    expect(stripCostOnlyKeywordLines("Sneak {1}{B} (You may cast this spell for {1}{B} if you also return an unblocked attacker you control to hand during the declare blockers step. It enters tapped and attacking.)\nSearch your library for a card, put that card into your hand, then shuffle.")).toBe("Search your library for a card, put that card into your hand, then shuffle.");
  });
});

describe("Sneak — classification", () => {
  it("a sneak creature (modeled body) and a sneak spell (modeled effect) both flip native", () => {
    expect(classifyCard({ name: "Splinter, Hamato Yoshi", type: "Creature — Rat Ninja", mana: "{1}{B}", power: 2, toughness: 3, oracle: "Menace\nSneak {1}{B}" })).toMatch(/^native/);
    expect(classifyCard({ name: "Donatello's Technique", type: "Sorcery", mana: "{2}{U}", oracle: "Draw two cards.\nSneak {2}{U}" })).toMatch(/^native/);
  });
  it("CREED: a sneak card with an unmodeled sibling ability stays body-only", () => {
    expect(classifyCard({ name: "T", type: "Creature — Ninja", mana: "{2}{B}", power: 2, toughness: 2, oracle: "Sneak {1}{B}\nWhenever this creature attacks, each opponent reveals their hand and you gain the city's blessing for the rest of the game." })).not.toMatch(/^native/);
  });
});
