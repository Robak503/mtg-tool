/**
 * dredgeSpellSide.test.js — dredge is vacuous on the SPELL path too (census slice 28).
 *
 * Dredge (CR 702.51) is a graveyard REPLACEMENT for a draw: "If you would draw a card, you may mill N
 * instead. If you do, return this card from your graveyard to your hand." It changes nothing about how the
 * card resolves when it is CAST NORMALLY from hand, which is exactly the vacuous-line rationale textNormalize
 * already applies to flashback / escape / jump-start / retrace.
 *
 * The keyword was credited on PERMANENTS (isKeywordOnly's reDredgeCost — Shambling Shell, Golgari Thug) but
 * missing from CAST_KEYWORD_LINE, so the identical keyword parked every dredge SPELL. A split with no reason
 * behind it: one path had the credit, the other didn't.
 *
 * Unlike suspend (slice 19) there is no costless hazard here — dredge never replaces casting, so every dredge
 * card has a normal mana cost and is hard-castable. Not offering the graveyard recursion stays a safe FN.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";

const REM = (n, w) => `Dredge ${n} (If you would draw a card, you may mill ${w} cards instead. If you do, return this card from your graveyard to your hand.)`;

describe("dredge SPELLS now classify like their permanent siblings", () => {
  it("Darkblast (instant)", () => {
    expect(classifyCard({ name: "Darkblast", type: "Instant", mana: "{B}",
      oracle: `Target creature gets -1/-1 until end of turn.\n${REM(3, "three")}` })).toBe("native-spell");
  });
  it("Shenanigans (sorcery)", () => {
    expect(classifyCard({ name: "Shenanigans", type: "Sorcery", mana: "{1}{R}",
      oracle: `Destroy target artifact.\n${REM(1, "a")}` })).toBe("native-spell");
  });
  it("the PERMANENT path is unchanged (it always worked)", () => {
    expect(classifyCard({ name: "Shambling Shell", type: "Creature — Plant Zombie", mana: "{1}{B}{G}", power: 2, toughness: 2,
      oracle: `Sacrifice this creature: Put a +1/+1 counter on target creature.\n${REM(3, "three")}` })).toBe("native-activated");
  });
});

describe("CREED — stripping the keyword line credits nothing else", () => {
  it("an UNMODELED body still parks the spell", () => {
    expect(classifyCard({ name: "X", type: "Sorcery", mana: "{1}{B}",
      oracle: `Each opponent glorbulates twice.\n${REM(2, "two")}` })).not.toMatch(/^native/);
  });
  it("a spell with no dredge line is untouched", () => {
    expect(classifyCard({ name: "Shock", type: "Instant", mana: "{R}",
      oracle: "Shock deals 2 damage to any target." })).toBe("native-spell");
  });
});
