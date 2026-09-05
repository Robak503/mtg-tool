/**
 * SELF-ETB DISJUNCTION GUARD — a hollow closed 2026-09-05 (surfaced while sizing Campsite Cuisine for Bumble Flower). The
 * bare self-ETB fallback accepted ANY self-referencing "… enters" condition, so "Whenever this enchantment OR a legendary
 * creature you control enters" detected as a plain self-ETB with the second subject silently dropped — the card would
 * fire on its own entry and never on the legendary creature's, a confident partial. The fallback now refuses a self
 * reference that still carries an " or " no arm modelled; the modelled disjunctions (Kor Celebrant's creature scope,
 * Satoru's batch) return from their own arms above it and are untouched.
 *
 * Mutation-checked: see the run ledger (docs-sk76).
 */
import { describe, it, expect } from "vitest";
import { detectTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";

const card = (name, type, oracle) => ({ name, type, mana: "{1}", keywords: [], oracle });

describe("the self-ETB fallback and disjoint subjects", () => {
  it("an unmodelled 'this X or a <filter> enters' head detects NOTHING and the card parks; the modelled disjunctions still detect on their own scopes and classify native", () => {
    const camp = card("Campsite Cuisine", "Enchantment", "Whenever this enchantment or a legendary creature you control enters, create a Food token.");
    const kor = card("Kor Celebrant", "Creature — Kor Cleric", "Whenever this creature or another creature you control enters, you gain 1 life.");
    const satoru = card("Satoru, the Infiltrator", "Legendary Creature — Human Ninja", "Whenever Satoru and/or one or more other nontoken creatures you control enter, if none of them were cast or no mana was spent to cast them, draw a card.");
    const plain = card("Plain Bear", "Creature — Bear", "When this creature enters, you gain 1 life.");
    const row = {
      camp: [detectTriggers(camp).map((d) => [d.event, d.scope]), classifyCard(camp)],
      kor: [detectTriggers(kor).map((d) => [d.event, d.scope]), classifyCard(kor)],
      satoru: [detectTriggers(satoru).map((d) => [d.event, d.scope]), classifyCard(satoru)],
      plain: [detectTriggers(plain).map((d) => [d.event, d.scope]), classifyCard(plain)],
    };
    console.log("  WITNESS selfEtbOr", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.camp).toEqual([[], "body-only"]);
    expect(row.kor[0]).toEqual([["etb", "subtypeYouControl"]]);
    expect(row.kor[1]).toBe("native-trigger");
    expect(row.satoru[0]).toEqual([["etb", "selfOrOtherCreatureYouControl"]]);
    expect(row.satoru[1]).toBe("native-trigger");
    expect(row.plain).toEqual([[["etb", "self"]], "native-trigger"]);
  });
  it("EVENT disjunctions: a VACUOUS second event the engine can never produce (turned face up / specializes) keeps the working ETB; a PRODUCIBLE second event (combat damage, becoming a target) parks the card", () => {
    const gadget = card("Gadget Technician", "Creature — Goblin Artificer", "When this creature enters or is turned face up, create a 1/1 colorless Thopter artifact creature token with flying.\nDisguise {U/R}{U/R}");
    const laezel = card("Lae'zel, Wrathful Warrior", "Legendary Creature — Gith Warrior", "When this creature enters or specializes, create two 1/1 white Soldier creature tokens.");
    const lich = card("Tomebound Lich", "Creature — Zombie Wizard", "Whenever this creature enters or deals combat damage to a player, draw a card, then discard a card.");
    const mare = card("Shield Mare", "Creature — Horse", "When this creature enters or becomes the target of a spell or ability an opponent controls, you gain 3 life.");
    const row = {
      gadget: [detectTriggers(gadget).map((d) => [d.event, d.scope]), classifyCard(gadget)],
      laezel: [detectTriggers(laezel).map((d) => [d.event, d.scope]), classifyCard(laezel)],
      lich: [detectTriggers(lich).map((d) => [d.event, d.scope]), classifyCard(lich)],
      mare: [detectTriggers(mare).map((d) => [d.event, d.scope]), classifyCard(mare)],
    };
    console.log("  WITNESS selfEtbOrEvents", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.gadget[0]).toEqual([["etb", "self"]]);
    expect(row.gadget[1]).toMatch(/^native-/);
    expect(row.laezel[0]).toEqual([["etb", "self"]]);
    expect(row.laezel[1]).toMatch(/^native-/);
    expect(row.lich).toEqual([[], "body-only"]);   // the combat-damage half is a trigger the engine DOES fire — no partial credit
    expect(row.mare).toEqual([[], "body-only"]);   // targeting happens in this engine — no partial credit
  });
});
