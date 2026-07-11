/**
 * transmuteStrip.test.js — TRANSMUTE joins the cost-only keyword strip + the instant-or-sorcery union HARD
 * counter (Muddle the Mixture class — SHELF Phase 2). Transmute (CR 702.53) is a hand-only activated
 * ability (discard this card → tutor same-MV) the engine never offers — the normal cast + resolution are
 * byte-identical to the printed body, the Flashback/Sneak rationale exactly.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests } from "./gameState.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { stripCostOnlyKeywordLines } from "./effects/parseHelpers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const MUDDLE = { id: "mm", name: "Muddle the Mixture", type: "Instant", mana: "{U}{U}",
  oracle: "Counter target instant or sorcery spell.\nTransmute {1}{U}{U} ({1}{U}{U}, Discard this card: Search your library for a card with the same mana value as this card, reveal it, put it into your hand, then shuffle. Transmute only as a sorcery.)" };

describe("transmute strip + the union hard counter", () => {
  it("the Transmute line strips; the union hard counter parses HIGH; Muddle → native-spell", () => {
    expect(stripCostOnlyKeywordLines(MUDDLE.oracle)).toBe("Counter target instant or sorcery spell.");
    const p = parseEffectClause("Counter target instant or sorcery spell.", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "counter", spellFilter: "instantSorcery", targetType: "spell" }]);
    expect(classifyCard(MUDDLE)).toBe("native-spell");
  });
  it("CREED — a transmute-GRANTING sentence is never stripped (line-anchored keyword+cost only)", () => {
    const granting = "Each card in your hand has transmute {2}.";
    expect(stripCostOnlyKeywordLines(granting)).toBe(granting);
  });
});
