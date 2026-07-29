/**
 * aftermathKeywordLine.test.js — the AFTERMATH keyword LINE, stripped from the half it labels.
 *
 * ⚠️ THE WHOLE MECHANISM WAS ALREADY BUILT AND THE FAMILY STILL PARKED. A previous slice unparked aftermath
 * properly: `parseSplitCard` sets `rightGraveyardOnly`, `splitFaceCards` turns it into `graveyardOnly`, and
 * `actionsCastSplitFromHand` skips that face so the engine can never make the illegal hand-cast CR 702.127a
 * forbids. All correct — and every aftermath card was still arbiter-spell, because the literal line
 * "Aftermath (Cast this spell only from your graveyard. Then exile it.)" was left sitting in the right half's
 * ORACLE, so that half's effect parsed LOW and the both-halves gate refused the card.
 *
 * ⭐ Measured, not guessed: on Claim // Fame the LEFT half parsed HIGH, the RIGHT half parsed LOW, and the
 * only difference was that one line in front of an otherwise fully-modeled effect.
 *
 * ⛔ STRIPPING IT IS REDUNDANCY REMOVAL, NOT AN UNREAD TAIL. Once `rightGraveyardOnly` carries the cast-zone
 * restriction, the line states nothing the model doesn't already hold, and its "Then exile it" rider applies
 * ONLY to the graveyard cast the engine never offers — the flashback bargain verbatim, which is why that
 * keyword is stripped on identical reasoning.
 */
import { describe, expect, it } from "vitest";

import { parseSplitCard, splitFaceCards } from "./splitCard.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

// Printed text, verified against the bundled Scryfall snapshot.
const CLAIM_FAME = {
  name: "Claim // Fame", type: "Sorcery // Sorcery", mana: "{B} // {1}{R}",
  oracle: "Claim - Sorcery {B}\nReturn target creature card with mana value 2 or less from your graveyard to the battlefield.\n//\nFame - Sorcery {1}{R}\nAftermath (Cast this spell only from your graveyard. Then exile it.)\nTarget creature gets +2/+0 and gains haste until end of turn.",
};

describe("the keyword line comes off the half it labels", () => {
  it("⭐ the right half's oracle no longer carries the Aftermath line", () => {
    const p = parseSplitCard(CLAIM_FAME);
    expect(p.right.oracle).toBe("Target creature gets +2/+0 and gains haste until end of turn.");
    expect(p.right.oracle).not.toMatch(/aftermath/i);
  });

  it("⭐ and the half now parses HIGH — which is the entire reason the card was parked", () => {
    const p = parseSplitCard(CLAIM_FAME);
    expect(programConfidence(parseEffectClause(p.left.oracle, p.left.type))).toBe("high");
    expect(programConfidence(parseEffectClause(p.right.oracle, p.right.type))).toBe("high");
  });

  it("⭐ Claim // Fame classifies native-spell", () => {
    expect(classifyCard(CLAIM_FAME)).toBe("native-spell");
  });
});

describe("⛔ the cast-zone restriction is UNCHANGED — stripping the line must not lose the rule", () => {
  it("⛔⭐ rightGraveyardOnly still set, and still reaches the face as graveyardOnly", () => {
    // ⚠️ THE ASSERTION THAT KEEPS THIS HONEST. The line was safe to strip only BECAUSE the flag carries its
    // meaning; if a refactor ever drops the flag, the strip turns an illegal hand-cast into a legal-looking
    // offer — strictly worse than the parked card this slice started from.
    expect(parseSplitCard(CLAIM_FAME).rightGraveyardOnly).toBe(true);
    const [left, right] = splitFaceCards(CLAIM_FAME);
    expect(left.graveyardOnly).toBeUndefined();
    expect(right.graveyardOnly).toBe(true);
  });

  it("⛔ a NON-aftermath split keeps both halves hand-castable and is untouched", () => {
    const fire = {
      name: "Fire // Ice", type: "Instant // Instant", mana: "{1}{R} // {1}{U}",
      oracle: "Fire - Instant {1}{R}\nFire deals 2 damage divided as you choose among one or two targets.\n//\nIce - Instant {1}{U}\nTap target permanent.\nDraw a card.",
    };
    const p = parseSplitCard(fire);
    expect(p.rightGraveyardOnly).toBeUndefined();
    const [, right] = splitFaceCards(fire);
    expect(right.graveyardOnly).toBeUndefined();
  });

  it("⛔ an aftermath card whose half is genuinely UNMODELED still refuses", () => {
    // The both-halves gate is untouched: the strip removes a redundant line, it does not credit an effect.
    const bogus = {
      name: "Real // Glorb", type: "Sorcery // Sorcery", mana: "{B} // {1}{R}",
      oracle: "Real - Sorcery {B}\nDraw a card.\n//\nGlorb - Sorcery {1}{R}\nAftermath (Cast this spell only from your graveyard. Then exile it.)\nEach player glorbulates their library.",
    };
    expect(classifyCard(bogus)).not.toBe("native-spell");
  });
});
