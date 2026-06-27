/**
 * toughnessRestriction.test.js — "destroy / deal N damage to target creature with toughness N or
 * greater|less" (Collar the Culprit, Sungold Barrage, Gallant Strike; Fleshpulper Giant "2 or less";
 * modal Destroy Evil / Valorous Stance). Mirrors the power restriction: parseCreatureTargetRestrictions
 * extracts {kind:"toughness", op, value}, MODELED_RESTRICTION_RES strips it (so the confidence gate
 * passes), and creatureSatisfiesRestrictions enforces it LAYER-AWARE (creatureToughness) — enumerateTargets
 * only offers creatures of the right toughness.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { enumerateTargets } from "./spellEffects.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

describe("toughness-restriction — parser", () => {
  it("'destroy target creature with toughness 4 or greater' → destroy + toughness>=4", () => {
    const p = parseEffectClause("Destroy target creature with toughness 4 or greater.", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "destroy", targetType: "creature", restrictions: [{ kind: "toughness", op: ">=", value: 4 }] }]);
  });
  it("'toughness 2 or less' → toughness<=2", () => {
    const p = parseEffectClause("Destroy target creature with toughness 2 or less.", "Instant");
    expect(p.atoms).toEqual([{ op: "destroy", targetType: "creature", restrictions: [{ kind: "toughness", op: "<=", value: 2 }] }]);
  });
});

describe("toughness-restriction — enumerateTargets filters by toughness", () => {
  function board() {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const big = createPermanent({ id: "big", card: { id: "big", name: "Wall", type: "Creature — Wall", power: 0, toughness: 5 }, controller: "ai" });
    const small = createPermanent({ id: "small", card: { id: "small", name: "Bird", type: "Creature — Bird", power: 2, toughness: 1 }, controller: "ai" });
    return { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [big, small] } } };
  }
  it("'toughness 4 or greater' → only the 5-toughness creature is legal", () => {
    const ids = enumerateTargets(board(), "user", { op: "destroy", targetType: "creature", restrictions: [{ kind: "toughness", op: ">=", value: 4 }] }).map(t => t.id);
    expect(ids).toContain("big");
    expect(ids).not.toContain("small");
  });
  it("'toughness 2 or less' → only the 1-toughness creature is legal", () => {
    const ids = enumerateTargets(board(), "user", { op: "destroy", targetType: "creature", restrictions: [{ kind: "toughness", op: "<=", value: 2 }] }).map(t => t.id);
    expect(ids).toContain("small");
    expect(ids).not.toContain("big");
  });
});

describe("toughness-restriction — coverage flips", () => {
  const C = (name, oracle, type = "Instant") => ({ name, oracle, type, keywords: [], mana: "{1}{W}" });
  it("destroy-by-toughness flips native (spell, modal, trigger)", () => {
    expect(classifyCard(C("Collar the Culprit", "Destroy target creature with toughness 4 or greater."))).toBe("native-spell");
    expect(classifyCard(C("Destroy Evil", "Choose one —\n• Destroy target creature with toughness 4 or greater.\n• Destroy target enchantment."))).toBe("native-spell");
    expect(classifyCard(C("Fleshpulper Giant", "When this creature enters, you may destroy target creature with toughness 2 or less.", "Creature — Giant"))).toBe("native-trigger");
  });
});
