/**
 * causativeDamage.test.js — optional causative "you may HAVE this creature DEAL N damage to X" (SHELF-TAIL
 * SH6 — Kederekt Parasite; CR 603.2). The causative twin of the declarative "this creature DEALS N damage
 * to X" (which parses HIGH — Fate Unraveler's native form). A clause-level conjugation of "have <bound self>
 * deal" → "<self> deals" lets the existing damage matcher bind; the "you may" wrapper is peeled + stamped
 * optional by α2 upstream. Kederekt's other two pieces were already fine — the intervening-if "if you control
 * a red permanent" routes, and "the drawing player" is the cardDrawn rewrite. Flip +1/0/0.
 *
 * Mutation-checked (via Edit): disabling the causative conjugation → "have this creature deal …" stays LOW →
 * Kederekt body-only (parse + classify pins die). Scoping pin: a CHOSEN-target causative ("have TARGET
 * creature deal …") is NOT this bound-self shape and stays unnormalized (never a fabricated deal-damage).
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";

describe("SH6 — the causative conjugation", () => {
  it("'you may have this creature deal N damage to X' → a deal-damage atom, optional", () => {
    const p = parseEffectClause("you may have this creature deal 1 damage to the drawing player", "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "deal-damage", optional: true });
  });
  it("the bare causative (no 'you may') also binds; the declarative twin is unchanged", () => {
    expect(programConfidence(parseEffectClause("have this creature deal 2 damage to the drawing player", "Instant", { sourceScoped: true }))).toBe("high");
    expect(programConfidence(parseEffectClause("this creature deals 1 damage to the drawing player", "Instant", { sourceScoped: true }))).toBe("high");
  });
  it("SCOPING — a non-bound-self causative ('have another creature deal …') is NOT normalized (stays low)", () => {
    // "another creature" is not one of the bound self-referents (this creature / it / that creature), so my
    // conjugation must leave it alone — it never fabricates a deal-damage atom out of an unmodeled causative.
    // (A "have TARGET creature deal …" causative has its OWN pre-existing high parse and is intentionally
    // not the boundary here.)
    expect(programConfidence(parseEffectClause("have another creature deal 2 damage to you", "Instant", { sourceScoped: true }))).toBe("low");
  });
});

describe("SH6 — Kederekt Parasite classifies native-trigger (causative + intervening-if + cardDrawn)", () => {
  it("the whole card", () => {
    expect(classifyCard({ name: "Kederekt Parasite", type: "Creature — Horror", power: 2, toughness: 2, oracle: "Whenever an opponent draws a card, if you control a red permanent, you may have this creature deal 1 damage to that player." })).toBe("native-trigger");
  });
  it("REGRESSION — the intervening-if alone and the declarative-damage form still classify native", () => {
    expect(classifyCard({ name: "A", type: "Creature — Horror", power: 2, toughness: 2, oracle: "Whenever an opponent draws a card, if you control a red permanent, this creature deals 1 damage to that player." })).toBe("native-trigger");
    expect(classifyCard({ name: "Fate", type: "Enchantment", oracle: "Whenever an opponent draws a card, this creature deals 1 damage to that player." })).toBe("native-trigger");
  });
});
