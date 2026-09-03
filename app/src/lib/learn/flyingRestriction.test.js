/**
 * flyingRestriction.test.js — the anti-flyer removal restriction: "destroy / deal N damage to target
 * creature WITH flying" (Plummet, Pierce the Sky, Shredding Winds) and "WITHOUT flying" (Roast,
 * Defenestrate). parseCreatureTargetRestrictions now extracts a `{kind:"hasKeyword", keyword:"flying",
 * negate}` restriction (and MODELED_RESTRICTION_RES strips "with/without flying" so the confidence gate
 * passes); enumerateTargets enforces it via the EXISTING creatureSatisfiesRestrictions hasKeyword check
 * (layer-aware — a GRANTED flying counts). So the spell can ONLY target the right creatures.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { enumerateTargets } from "./spellEffects.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ─── 1. Parser ──────────────────────────────────────────────────────────────────
describe("flying-restriction — parser", () => {
  it("'deals N damage to target creature with flying' → deal-damage + hasKeyword flying", () => {
    const p = parseEffectClause("Pierce the Sky deals 7 damage to target creature with flying.", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "deal-damage", amount: 7, targetType: "creature", restrictions: [{ kind: "hasKeyword", keyword: "flying", negate: false }] }]);
  });
  it("'destroy target creature without flying' → destroy + negated hasKeyword", () => {
    const p = parseEffectClause("Destroy target creature without flying.", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "destroy", targetType: "creature", restrictions: [{ kind: "hasKeyword", keyword: "flying", negate: true }] }]);
  });
  it("⭐ another CURATED keyword (with first strike) parses HIGH since ④-AF (2026-09-03); a keyword OUTSIDE the vocabulary stays low → Arbiter", () => {
    // KW-1 widened the legacy vocabulary beyond flying; ④-AF's subject peel reads the same curated list for every
    // effects-lane arm. The CREED pin moves to a keyword the list does not name — "without ward" would fail OPEN.
    const fs = parseEffectClause("Destroy target creature with first strike.", "Instant");
    expect(programConfidence(fs)).toBe("high");
    expect(fs.atoms[0].restrictions).toEqual([{ kind: "hasKeyword", keyword: "first strike", negate: false }]);
    expect(programConfidence(parseEffectClause("Destroy target creature with ward.", "Instant"))).toBe("low");
  });
});

// ─── 2. Enforcement — enumerateTargets filters by flying ───────────────────────────
describe("flying-restriction — enumerateTargets only offers the legal creatures", () => {
  function board() {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const flyer = createPermanent({ id: "flyer", card: { id: "flyer", name: "Bird", type: "Creature — Bird", power: 2, toughness: 2, keywords: ["flying"] }, controller: "ai" });
    const ground = createPermanent({ id: "ground", card: { id: "ground", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, keywords: [] }, controller: "ai" });
    return { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [flyer, ground] } } };
  }
  it("'with flying' → only the flyer is a legal target", () => {
    const s = board();
    const atom = { op: "deal-damage", amount: 3, targetType: "creature", restrictions: [{ kind: "hasKeyword", keyword: "flying", negate: false }] };
    const ids = enumerateTargets(s, "user", atom).map(t => t.id);
    expect(ids).toContain("flyer");
    expect(ids).not.toContain("ground");
  });
  it("'without flying' → only the non-flyer is a legal target", () => {
    const s = board();
    const atom = { op: "destroy", targetType: "creature", restrictions: [{ kind: "hasKeyword", keyword: "flying", negate: true }] };
    const ids = enumerateTargets(s, "user", atom).map(t => t.id);
    expect(ids).toContain("ground");
    expect(ids).not.toContain("flyer");
  });
});

// ─── 3. Coverage flips + CREED non-flips ──────────────────────────────────────────
describe("flying-restriction — coverage", () => {
  const C = (name, oracle, type = "Instant") => ({ name, oracle, type, keywords: [], mana: "{1}{G}" });
  it("with/without-flying removal flips native", () => {
    expect(classifyCard(C("Plummet", "Destroy target creature with flying."))).toBe("native-spell");
    expect(classifyCard(C("Roast", "Roast deals 5 damage to target creature without flying.", "Sorcery"))).toBe("native-spell");
    expect(classifyCard(C("Defenestrate", "Destroy target creature without flying."))).toBe("native-spell");
    expect(classifyCard(C("Centaur Archer", "{T}: This creature deals 1 damage to target creature with flying.", "Creature — Centaur Archer"))).toBe("native-activated");
    expect(classifyCard(C("Aerial Predation", "Destroy target creature with flying.\nYou gain 2 life.", "Sorcery"))).toBe("native-spell");
  });
  it("CREED: an UNMODELED keyword restriction stays Arbiter — shadow joined the curated list (④-AF), ward has not", () => {
    expect(classifyCard(C("X", "Destroy target creature with shadow."))).toBe("native-spell");
    expect(classifyCard(C("Y", "Destroy target creature with ward."))).not.toMatch(/^native/);
  });
});
