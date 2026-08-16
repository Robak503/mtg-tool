/**
 * optionalBlinkSplit.test.js — OPTIONAL "you may" BLINK keep-whole (SHELF-TAIL SH13 — Conjurer's Closet).
 *
 * The blink keep-whole guard (blinkFlicker.test.js) anchored on "^exile …, then return …", so a leading
 * "you may" (Conjurer's Closet's end-step "you may exile target creature you control, then return that card
 * to the battlefield under your control") slipped past it and the ", then" split severed the sentence. Like
 * the mandatory blink, this is NOT a fail-safe mis-split: the severed first half — "you may exile target
 * creature you control" — parses HIGH as an OPTIONAL exile, describing a card that may exile your creature and
 * never return it. Admitting the optional prefix in the guard keeps the sentence whole; the α2 wrapper then
 * peels "you may" and stamps the blink atom optional. Flip +1/0/0.
 *
 * Mutation-checked (via Edit): dropping the "(?:you may )?" from the guard → the sentence splits → Conjurer's
 * Closet falls back to body-only (classify pin dies) and the whole clause no longer keeps together.
 */
import { describe, expect, it } from "vitest";
import { splitClauses } from "./effects/splitClauses.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

const YM_BLINK = "you may exile target creature you control, then return that card to the battlefield under your control";
const CONJURERS_CLOSET = { name: "Conjurer's Closet", type: "Artifact", mana: "{5}",
  oracle: "At the beginning of your end step, you may exile target creature you control, then return that card to the battlefield under your control." };

describe("the splitter fix — the optional blink survives ', then' as ONE clause", () => {
  it("'you may exile … you control, then return …' stays ONE clause", () => {
    expect(splitClauses(YM_BLINK + ".")).toHaveLength(1);
  });
  it("THE DANGEROUS HALF — 'you may exile target creature you control' parses HIGH alone, so the split is NOT fail-safe", () => {
    const p = parseEffectClause("you may exile target creature you control");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0].op).toBe("exile");
    expect(p.atoms[0].optional).toBe(true);
  });
  it("an unrelated 'you may X, then Y' still splits normally (the guard is anchored to the blink shape)", () => {
    expect(splitClauses("You may scry 2, then draw a card.")).toHaveLength(2);
  });
});

describe("parse + classify", () => {
  it("the whole clause reduces to an OPTIONAL blink (opt:true), the mandatory shape unchanged", () => {
    const p = parseEffectClause(YM_BLINK);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "blink", targetType: "creature", returnTo: "controller", optional: true });
    // regression: the mandatory (no "you may") form carries no optional flag
    expect(parseEffectClause("exile target creature you control, then return that card to the battlefield under your control").atoms[0].optional).toBeUndefined();
  });
  it("Conjurer's Closet classifies native-trigger (the end-step optional blink is now whole)", () => {
    expect(classifyCard(CONJURERS_CLOSET)).toBe("native-trigger");
  });
});
