/**
 * altCastKeywords.test.js — recognize four more brace-cost ALTERNATIVE-CAST keywords: Foretell (CR 702.143),
 * Blitz (702.152), Freerunning (Assassin's Creed), and Prototype (702.161). All are RESOLUTION-INVARIANT with no
 * engine lane: the card ALSO has a normal mana cost, so the engine hard-casts it as its printed self and the body
 * resolves correctly; only the optional alt entry (deferred foretell cast, blitz haste+draw+sac, the smaller
 * prototype profile) is unmodeled — the same handling as Ninjutsu/Morph/Sneak/Dash. Recognized on both paths:
 * isKeywordOnly (creatures) and CAST_KEYWORD_LINE (spells — foretell/freerunning). Flip-diff: +25, LOST=0.
 */
import { describe, it, expect } from "vitest";
import { classifyCard, isKeywordOnly } from "./coverage.js";

describe("alt-cast keywords — isKeywordOnly recognition", () => {
  it("credits bare foretell / blitz / freerunning / prototype cost lines", () => {
    expect(isKeywordOnly("Foretell {4}{R}")).toBe(true);
    expect(isKeywordOnly("Trample\nBlitz {4}{G}{G}")).toBe(true);
    expect(isKeywordOnly("Freerunning {1}{B}")).toBe(true);
    expect(isKeywordOnly("Prototype {1}{B} — 1/1")).toBe(true);          // artifact-creature second profile
    expect(isKeywordOnly("Prototype {2}{U}{U} — 3/4")).toBe(true);
  });
  it("does NOT credit a keyword-referencing static or a malformed line (safe FN)", () => {
    expect(isKeywordOnly("foretell abilities you activate cost {1} less")).toBe(false);
    expect(isKeywordOnly("prototype {1}{b}")).toBe(false);              // missing the "— X/Y" profile
    expect(isKeywordOnly("blitz {2} target creature")).toBe(false);     // trailing rider fails the anchor
  });
});

describe("alt-cast keywords — classification", () => {
  it("a creature whose only extra text is one of these keywords flips native", () => {
    expect(classifyCard({ name: "Doomskar Titan", type: "Creature — Giant Berserker", mana: "{5}{R}{R}", power: 5, toughness: 5, oracle: "Foretell {4}{R}" })).toMatch(/^native/);
    expect(classifyCard({ name: "Workshop Warchief", type: "Creature — Rhino Warrior", mana: "{4}{G}{G}", power: 5, toughness: 5, oracle: "Trample\nBlitz {4}{G}{G}" })).toMatch(/^native/);
    expect(classifyCard({ name: "Goring Warplow", type: "Artifact Creature — Construct", mana: "{4}{B}", power: 4, toughness: 4, oracle: "Deathtouch\nPrototype {1}{B} — 1/1" })).toMatch(/^native/);
  });
  it("CREED: a card with an unmodeled sibling ability stays body-only", () => {
    expect(classifyCard({ name: "T", type: "Creature — Assassin", mana: "{3}{B}", power: 3, toughness: 3, oracle: "Freerunning {1}{B}\nWhenever this creature deals combat damage to a player, that player reveals their hand and you choose a noncreature, nonland card from it. That player discards that card and you draw a card unless they exile it face down." })).not.toMatch(/^native/);
  });
});
