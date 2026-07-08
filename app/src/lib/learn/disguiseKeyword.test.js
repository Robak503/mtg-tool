/**
 * disguiseKeyword.test.js — recognize the "Disguise {cost}" alt-cast keyword (CR 702.168) + the turned-face-up
 * guard that makes it CREED-safe. Disguise is the same face-down structure as morph (cast face down for {3} as a
 * 2/2 with ward {2}, turn face up for the disguise cost); every disguise card ALSO hard-casts as its printed
 * self, so — like ninjutsu/morph/sneak/dash — the engine plays it face up and the body resolves correctly.
 *
 * THE GUARD (classifyCondition): a PURE "When this creature is turned face up, <effect>" trigger fires only on a
 * face-down→face-up flip, an event the engine never reaches (it hard-casts face up). Detecting it would model an
 * effect that can't fire — and a "…is turned face up, until end of turn, whenever <X>, <Y>" delayed-setup wrapper
 * gets mis-split so the inner <X> reads as a PERMANENT trigger (Mistway Spy → "combat damage → investigate"). So
 * a pure turned-face-up trigger is left UNDETECTED → the shaped sentence out-runs the detected count → body-only.
 * The COMPOUND "enters or is turned face up" (Gadget Technician, Rakish Scoundrel) keeps its ETB (it DOES fire on
 * the face-up hard cast) → those flip. Flip-diff: +11 GAINED, LOST=0, Mistway Spy NOT credited.
 */
import { describe, it, expect } from "vitest";
import { classifyCard, isKeywordOnly } from "./coverage.js";
import { detectTriggers } from "./triggers.js";

describe("Disguise — recognition", () => {
  it("isKeywordOnly credits a bare 'disguise {cost}' line", () => {
    expect(isKeywordOnly("Flying\nDisguise {1}{U}")).toBe(true);
    expect(isKeywordOnly("Disguise {3}{G/U}{G/U}")).toBe(true);
    expect(isKeywordOnly("disguise abilities you activate cost {1} less")).toBe(false);
  });
  it("a plain disguise creature and a compound enters-or-flip disguise creature both flip native", () => {
    expect(classifyCard({ name: "Nightdrinker Moroii", type: "Creature — Vampire", mana: "{3}{B}", power: 4, toughness: 4, oracle: "When this creature enters, you lose 2 life.\nDisguise {B}{B}" })).toMatch(/^native/);
    expect(classifyCard({ name: "Gadget Technician", type: "Creature — Goblin Artificer", mana: "{2}{R}", power: 2, toughness: 2, oracle: "When this creature enters or is turned face up, create a 1/1 colorless Thopter artifact creature token with flying.\nDisguise {U/R}{U/R}" })).toMatch(/^native/);
  });
});

describe("Disguise — turned-face-up CREED guard", () => {
  it("a PURE 'when turned face up' delayed trigger is left undetected → the card stays body-only", () => {
    const mistway = { name: "Mistway Spy", type: "Creature — Bird Spy", mana: "{1}{U}", power: 2, toughness: 1, oracle: "Flying\nDisguise {1}{U}\nWhen this creature is turned face up, until end of turn, whenever a creature you control deals combat damage to a player, investigate." };
    // the inner "combat damage → investigate" must NOT be detected as a permanent trigger
    expect((detectTriggers(mistway) || []).some((t) => t.event === "combatDamageToPlayer")).toBe(false);
    expect(classifyCard(mistway)).not.toMatch(/^native/);
  });
  it("the COMPOUND 'enters or is turned face up' still routes as a modeled ETB", () => {
    const gadget = { name: "Gadget Technician", type: "Creature — Goblin Artificer", mana: "{2}{R}", power: 2, toughness: 2, oracle: "When this creature enters or is turned face up, create a 1/1 colorless Thopter artifact creature token with flying.\nDisguise {U/R}{U/R}" };
    expect((detectTriggers(gadget) || []).some((t) => t.event === "etb")).toBe(true);
  });
});
