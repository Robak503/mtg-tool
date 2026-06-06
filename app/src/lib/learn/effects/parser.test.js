/**
 * Tests for effects/parser.js — the EffectProgram shape + the confidence boundary.
 *
 * This is the highest-value test file in P2.2: the MUST_DROP_TO_LOW corpus pins
 * the fail-safe so a future parser change can't silently widen "high" and start
 * resolving the WRONG behavior (the #1 Phase-2 risk). Widening "high" must edit
 * this corpus deliberately.
 */

import { describe, it, expect } from "vitest";
import { parseEffectProgram, programConfidence, KNOWN_ATOM_OPS } from "./parser.js";

const I = (oracle) => ({ type: "Instant", oracle });

describe("parseEffectProgram — high-confidence (the modeled patterns)", () => {
  it("parses burn to any target", () => {
    const p = parseEffectProgram(I("Lightning Bolt deals 3 damage to any target."));
    expect(p).toMatchObject({ structure: "sequence", confidence: "high", atoms: [{ op: "deal-damage", amount: 3, targetType: "any" }] });
    expect(programConfidence(p)).toBe("high");
  });
  it("parses damage to creature / player / each opponent", () => {
    expect(parseEffectProgram(I("Deals 2 damage to target creature.")).atoms).toEqual([{ op: "deal-damage", amount: 2, targetType: "creature" }]);
    expect(parseEffectProgram(I("Deals 4 damage to target player.")).atoms).toEqual([{ op: "deal-damage", amount: 4, targetType: "player" }]);
    expect(parseEffectProgram(I("Deals 1 damage to each opponent.")).atoms).toEqual([{ op: "deal-damage", amount: 1, targetType: "eachOpponent" }]);
  });
  it("parses destroy target creature and draw N", () => {
    expect(parseEffectProgram(I("Destroy target creature.")).atoms).toEqual([{ op: "destroy", targetType: "creature" }]);
    expect(parseEffectProgram({ type: "Sorcery", oracle: "Draw two cards." }).atoms).toEqual([{ op: "draw", amount: 2, targetType: null }]);
    expect(parseEffectProgram({ type: "Sorcery", oracle: "Draw a card." }).atoms).toEqual([{ op: "draw", amount: 1, targetType: null }]);
  });
  it("tolerates reminder text in parens (stripped before the clean-clause check)", () => {
    const p = parseEffectProgram(I("Draw two cards (this clause is reminder text)."));
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "draw", amount: 2, targetType: null }]);
  });
});

describe("parseEffectProgram — null only for non-spells", () => {
  it("returns null for permanents and for cards with no oracle text", () => {
    expect(parseEffectProgram({ type: "Creature — Bear", oracle: "When this enters, draw a card." })).toBeNull();
    expect(parseEffectProgram({ type: "Artifact", oracle: "{T}: Add {C}." })).toBeNull();
    expect(parseEffectProgram(I(""))).toBeNull();
    expect(parseEffectProgram({ type: "Sorcery", oracle: "" })).toBeNull();
  });
});

// THE FAIL-SAFE GATE. Every near-miss / unmodeled instant-or-sorcery MUST drop to
// a low-confidence, ZERO-atom program (→ Arbiter seam). Crucially this includes
// oracles the LOOSE legacy regexes over-match (e.g. "destroy target creature
// unless …", which legacy parses as a plain destroy) — the clean-clause gate
// catches the rider so the interpreter never resolves the wrong thing.
const MUST_DROP_TO_LOW = [
  "Counter target spell.",
  "Destroy target creature unless its controller pays {2}.",   // legacy over-matches → MUST drop
  "Destroy target nonblack creature.",                          // unmodeled restriction → MUST drop
  "Deals 3 damage to target creature an opponent controls.",    // unmodeled restriction → MUST drop
  "Destroy target artifact.",
  "Destroy all creatures.",
  "Return target creature to its owner's hand.",
  "Exile target creature.",
  "Target creature gets +3/+3 until end of turn.",
  "Create a 1/1 white Soldier creature token.",
  "Each player draws a card.",
  "Target player discards a card at random.",
  "Scry 2, then draw a card.",
  "Deal damage to target creature equal to the number of Mountains you control.",
  "Choose one — Draw two cards; or destroy target creature.",
  "Deal 2 damage to target creature. Draw a card.",            // multi-clause → MUST drop
];

describe("parseEffectProgram — MUST drop to low (the CI merge gate)", () => {
  it.each(MUST_DROP_TO_LOW)("low confidence + zero atoms: %s", (oracle) => {
    const p = parseEffectProgram(I(oracle));
    expect(p).not.toBeNull();             // it IS a program (an instant with text)
    expect(programConfidence(p)).toBe("low");
    expect(p.atoms).toHaveLength(0);      // all-or-nothing: ZERO atoms run
  });
});

describe("programConfidence — pure shape function", () => {
  it("is low for an absent/empty program; high only when every atom is a known op", () => {
    expect(programConfidence(null)).toBe("low");
    expect(programConfidence({ atoms: [] })).toBe("low");
    expect(programConfidence({ atoms: [{ op: "draw" }] })).toBe("high");
    expect(programConfidence({ atoms: [{ op: "draw" }, { op: "pump" }] })).toBe("low"); // one unknown → low
    KNOWN_ATOM_OPS.forEach((op) => expect(programConfidence({ atoms: [{ op }] })).toBe("high"));
  });
});
