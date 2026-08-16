/**
 * delayedBlinkDelayLast.test.js — DELAYED-BLINK, the DELAY-LAST plain phrasing (SHELF-TAIL SH15 — Turn to
 * Mist, Mistmeadow Witch). The SH14 machinery ([blink-return] sentinel + applyDelayedBlink/applyBlinkReturn,
 * delayedBlink.test.js) resolves the whole delayed chain; this widening only teaches matchDelayedBlink the
 * OTHER printed word order — the delay clause LAST, no +1/+1 counter:
 *   "Exile target creature. Return that card to the battlefield under its owner's control at the beginning of
 *    the next end step."
 * It flips Turn to Mist (a spell) and the cost-stripped effect of Mistmeadow Witch's activated ability. Only
 * the "under its owner's control" return is admitted (a delayed "your control" spell isn't in the corpus);
 * withCounter:false routes the exact same applier, adding no counter. Flip +2/0/0.
 *
 * Mutation-checked (via Edit): neuter the delay-last arm of matchDelayedBlink → both cards fall back
 * (Turn to Mist arbiter-spell, Mistmeadow Witch body-only) — the classify pins die.
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";

const TURN_TO_MIST = "Exile target creature. Return that card to the battlefield under its owner's control at the beginning of the next end step.";
const MISTMEADOW = "{2}{U}{W}: Exile target creature. Return that card to the battlefield under its owner's control at the beginning of the next end step.";
const OTHERWORLDLY = "Exile target creature. At the beginning of the next end step, return that card to the battlefield under its owner's control with a +1/+1 counter on it.";

describe("SH15 — the delay-LAST plain phrasing", () => {
  it("the delay-last form parses to a NO-COUNTER delayed-blink atom", () => {
    const p = parseEffectClause(TURN_TO_MIST, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "delayed-blink", targetType: "creature", withCounter: false }]);
  });
  it("the delay-FIRST + counter form is unchanged (regression) — withCounter:true", () => {
    expect(parseEffectClause(OTHERWORLDLY, "Instant").atoms[0]).toMatchObject({ op: "delayed-blink", withCounter: true });
  });
  it("Turn to Mist (spell) and Mistmeadow Witch (activated) both classify native", () => {
    expect(classifyCard({ name: "Turn to Mist", type: "Instant", mana: "{1}{U}", oracle: TURN_TO_MIST })).toBe("native-spell");
    expect(classifyCard({ name: "Mistmeadow Witch", type: "Creature — Kithkin Wizard", power: 2, toughness: 2, mana: "{2}{W}{U}", oracle: MISTMEADOW })).toBe("native-activated");
  });
  it("CREED gate — a delayed 'under your control' form is NOT modeled (owner-return only) → LOW → Arbiter", () => {
    expect(programConfidence(parseEffectClause("Exile target creature. Return that card to the battlefield under your control at the beginning of the next end step.", "Instant"))).toBe("low");
  });
});
