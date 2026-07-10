/**
 * instantSorcerySoftCounter.test.js — the "instant or sorcery" soft-counter filter (Flusterstorm class —
 * SHELF Phase 2). "Counter target instant or sorcery spell unless its controller pays {1}" → the existing
 * soft-counter atom with the NEW instantSorcery spellFilter (both filter sites mirrored: enumeration's
 * spellMatchesCounterFilter + resolution's counterFilterMatches). Flusterstorm's Storm half was already
 * modeled (the synthesized selfCast copy trigger). CREED FP = offering/countering a non-instant/sorcery.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests } from "./gameState.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { counterFilterMatches } from "./effects/atoms/stack.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const FLUSTERSTORM = { id: "fs", name: "Flusterstorm", type: "Instant", mana: "{U}",
  oracle: "Counter target instant or sorcery spell unless its controller pays {1}.\nStorm (When you cast this spell, copy it for each spell cast before it this turn. You may choose new targets for the copies.)" };

describe("parse + classify", () => {
  it("the instant-or-sorcery soft-counter parses HIGH; Flusterstorm (storm already modeled) → native-spell", () => {
    const p = parseEffectClause("Counter target instant or sorcery spell unless its controller pays {1}.", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "counter", spellFilter: "instantSorcery", targetType: "spell", unlessPay: 1 }]);
    expect(classifyCard(FLUSTERSTORM)).toBe("native-spell");
  });
});

describe("the filter (CREED core — both zones of the union, nothing else)", () => {
  it("matches an Instant and a Sorcery; never a creature/artifact spell", () => {
    expect(counterFilterMatches({ type: "Instant" }, "instantSorcery")).toBe(true);
    expect(counterFilterMatches({ type: "Sorcery" }, "instantSorcery")).toBe(true);
    expect(counterFilterMatches({ type: "Creature — Bear" }, "instantSorcery")).toBe(false);
    expect(counterFilterMatches({ type: "Artifact" }, "instantSorcery")).toBe(false);
  });
});
