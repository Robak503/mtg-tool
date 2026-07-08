/**
 * revealTopDrainSelf.test.js — REVEAL-TOP-DRAIN-BY-MV, the YOU-LOSE (controller) variant.
 *
 * The Yuriko drain matcher (matchRevealTopDrainByMv) modeled only "each opponent loses life equal to that
 * card's mana value"; this extends it to the Dark Confidant wording — "reveal the top card, put it into your
 * hand. YOU lose life equal to its mana value" → reveal-top-to-hand + lose-life { who:"controller" } (the
 * atom's default self-drain branch). Two edits: the parser matcher who-branch + the coverage residue-strip
 * (the drain FOLLOWS the reveal in the same trigger; the trigger regex stops at the first period, so the
 * drain sentence must be stripped like the each-opponent one). Flip-diff: GAINED = {Dark Confidant, Dark
 * Tutelage, Darkstar Augur, Ruin Raider}, LOST = 0.
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";

const C = (name, oracle, type = "Creature — Human Wizard") => ({ name, oracle, type, keywords: [], mana: "" });

describe("REVEAL-TOP-DRAIN-BY-MV — the you-lose (controller) variant flips the Dark Confidant family", () => {
  it("Dark Confidant is native-trigger", () => {
    expect(classifyCard(C("Dark Confidant", "At the beginning of your upkeep, reveal the top card of your library and put that card into your hand. You lose life equal to its mana value."))).toBe("native-trigger");
  });

  it("Dark Tutelage (Enchantment) is native-trigger", () => {
    expect(classifyCard(C("Dark Tutelage", "At the beginning of your upkeep, reveal the top card of your library and put that card into your hand. You lose life equal to its mana value.", "Enchantment"))).toBe("native-trigger");
  });

  it("Ruin Raider (Raid end-step drain, 'the card's mana value') is native-trigger", () => {
    expect(classifyCard(C("Ruin Raider", "Raid — At the beginning of your end step, if you attacked this turn, reveal the top card of your library and put that card into your hand. You lose life equal to the card's mana value.", "Creature — Orc Warrior"))).toBe("native-trigger");
  });

  it("the each-opponent variant (Yuriko shape) is NOT regressed", () => {
    expect(classifyCard(C("Drain Trigger", "Whenever this creature deals combat damage to a player, reveal the top card of your library and put that card into your hand. Each opponent loses life equal to that card's mana value."))).toBe("native-trigger");
  });

  it("CREED guard: an unmodeled drain rider ('then draw a card') keeps the card body-only — the anchored matcher can't collapse the residue", () => {
    expect(classifyCard(C("Fake Confidant", "At the beginning of your upkeep, reveal the top card of your library and put that card into your hand. You lose life equal to its mana value, then draw a card."))).not.toMatch(/^native/);
  });
});
