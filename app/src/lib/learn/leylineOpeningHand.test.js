/**
 * leylineOpeningHand.test.js — LEYLINE-OPENING-HAND-STRIP.
 *
 * "If this card is in your opening hand, you may begin the game with it on the battlefield." (CR 103.6)
 * is a PRE-GAME special action with zero in-play runtime effect — the self-play engine never starts a
 * game from an opening hand, and the line never changes how the permanent behaves once on the battlefield.
 * classifyCard pre-strips it so an otherwise-fully-modeled Leyline permanent isn't dragged to body-only by
 * rules-neutral residue. Strictly LOST-safe: removing text can only let a card reach native, never demote
 * one. Flip-diff over the corpus: GAINED = {Leyline Axe, Leyline of Anticipation, Leyline of Lifeforce,
 * Leyline of Vitality}, LOST = 0. Coverage grind — Joe's Captain America deck runs Leyline Axe.
 */
import { describe, it, expect } from "vitest";
import { classifyCard, isNativeTier } from "./coverage.js";

const C = (name, oracle, type) => ({ name, oracle, type, keywords: [], mana: "" });

describe("LEYLINE-OPENING-HAND-STRIP — the pre-game line no longer drags a modeled permanent to body-only", () => {
  it("Leyline Axe (equip bonus + Equip {3}) is native-equipment", () => {
    const card = C(
      "Leyline Axe",
      "If this card is in your opening hand, you may begin the game with it on the battlefield.\nEquipped creature gets +1/+1 and has double strike and trample.\nEquip {3}",
      "Artifact — Equipment",
    );
    expect(classifyCard(card)).toBe("native-equipment");
  });

  it("Leyline of Vitality (anthem + ETB-lifegain) flips native", () => {
    const card = C(
      "Leyline of Vitality",
      "If this card is in your opening hand, you may begin the game with it on the battlefield.\nCreatures you control get +0/+1.\nWhenever a creature you control enters, you gain 1 life.",
      "Enchantment",
    );
    expect(isNativeTier(classifyCard(card))).toBe(true);
  });

  it("CREED guard: Leyline of the Void STAYS non-native — the strip removes only the opening-hand line, not the unmodeled graveyard-replacement static", () => {
    const card = C(
      "Leyline of the Void",
      "If this card is in your opening hand, you may begin the game with it on the battlefield.\nIf a card would be put into an opponent's graveyard from anywhere, exile it instead.",
      "Enchantment",
    );
    expect(isNativeTier(classifyCard(card))).toBe(false);
  });

  it("a card WITHOUT the opening-hand line is untouched (the strip is gated)", () => {
    // A plain equipment with a rider the engine doesn't model stays body-only either way.
    const card = C(
      "Rider Blade",
      "Equipped creature gets +1/+1.\nWhenever equipped creature dies, draw three cards, then discard two at random unless you sacrifice a land.\nEquip {2}",
      "Artifact — Equipment",
    );
    expect(isNativeTier(classifyCard(card))).toBe(false);
  });
});
