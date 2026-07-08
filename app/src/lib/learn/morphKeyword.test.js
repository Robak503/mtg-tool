/**
 * morphKeyword.test.js — recognize "Morph {cost}" / "Megamorph {cost}" as a covered keyword (CR 702.37 /
 * 702.109). Morph is an ALTERNATIVE way to play a card (cast face down as a 2/2 for {3}, turn face up for the
 * morph cost); the engine does not offer/enforce it (no morph lane in legalChoices — its tier-gated alt-cast
 * lanes are all mechanic-specific: adventure/plot/emerge/kicker/bestow, none of which fire for a morph card).
 * Every morph card ALSO has a normal mana cost, so the engine hard-casts it FACE UP and its body resolves
 * normally; only the optional face-down entry is unmodeled — the SAME rationale that credits Cycling/Ninjutsu.
 *
 * reMorphCost is brace-mana-cost anchored (^(?:mega)?morph (?:\{…\})+$), so a non-mana morph ("Morph—Reveal a
 * … card"), a morph-referencing static, or a morph line with a trailing rider all fail → body-only (safe FN).
 * The caller still validates all OTHER text all-or-nothing: a morph card with an unmodeled sibling ability keeps
 * that residue and stays body-only. Flip-diff (this slice): +65 GAINED, LOST=0.
 */
import { describe, it, expect } from "vitest";
import { classifyCard, isKeywordOnly } from "./coverage.js";

describe("morph / megamorph — isKeywordOnly recognition", () => {
  it("credits a bare brace-cost morph / megamorph line (alone or beside other covered keywords)", () => {
    expect(isKeywordOnly("Morph {4}{W}")).toBe(true);
    expect(isKeywordOnly("Trample, hexproof\nMorph {3}{G}{U}")).toBe(true);   // Sagu Mauler shape
    expect(isKeywordOnly("Megamorph {5}{G}")).toBe(true);
    expect(isKeywordOnly("Morph {2}{U}{U}")).toBe(true);
  });
  it("does NOT credit non-mana morph, a morph-referencing static, or a morph line with a rider (safe FN)", () => {
    expect(isKeywordOnly("Morph—Reveal a Mountain card in your hand.")).toBe(false); // non-mana cost
    expect(isKeywordOnly("Morph abilities you activate cost {1} less to activate")).toBe(false);
    expect(isKeywordOnly("Morph {2} if it's your turn")).toBe(false);               // trailing rider fails the anchor
  });
});

describe("morph / megamorph — classification", () => {
  it("a vanilla or all-keyword morph body flips native", () => {
    expect(classifyCard({ name: "War Behemoth", type: "Creature — Beast", mana: "{5}{W}", power: 5, toughness: 5, oracle: "Morph {5}{W}" })).toMatch(/^native/);
    expect(classifyCard({ name: "Sagu Mauler", type: "Creature — Beast", mana: "{4}{G}{U}", power: 6, toughness: 6, oracle: "Trample, hexproof\nMorph {3}{G}{U}" })).toMatch(/^native/);
    expect(classifyCard({ name: "Megamorpher", type: "Creature — Test", mana: "{4}{G}", power: 4, toughness: 4, oracle: "Reach\nMegamorph {5}{G}" })).toMatch(/^native/);
  });
  it("CREED: a morph card with an unmodeled sibling ability stays body-only", () => {
    // a non-mana morph is unrecognized → the whole card is unmodeled residue
    expect(classifyCard({ name: "T", type: "Creature — Test", mana: "{2}", power: 2, toughness: 2, oracle: "Morph—Reveal a Mountain card in your hand." })).not.toMatch(/^native/);
    // morph is recognized, but a clearly-unmodeled activated ability keeps the card body-only
    expect(classifyCard({ name: "T2", type: "Creature — Test", mana: "{3}", power: 3, toughness: 3, oracle: "Morph {4}\n{2}, {T}: Draw cards equal to the number of face-down creatures target opponent controls." })).not.toMatch(/^native/);
  });
});
