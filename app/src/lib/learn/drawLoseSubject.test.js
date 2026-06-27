/**
 * drawLoseSubject.test.js — DRAW-LOSE-SUBJECT: "Target player draws N cards and loses M life" (Sign in
 * Blood, Blood Pact, Painful Lesson, Harrowing Journey) shares ONE subject across the conjunction. The
 * top-level " and " split would orphan "loses M life" (no subject → unmodeled → Arbiter). A splitClauses
 * normalize injects the subject into the 2nd half ("…draws N cards. Target player loses M life") so both
 * halves parse with their EXISTING who:"target" atoms (draw + lose-life). Recognition-only — no new resolver.
 */
import { describe, it, expect } from "vitest";
import { parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

const draw = (n) => ({ op: "draw", amount: n, who: "target", targetType: "player" });
const lose = (n) => ({ op: "lose-life", amount: n, who: "target", targetType: "player" });
const S = (name, oracle, type = "Sorcery", mana = "{1}{B}") => ({ name, oracle, type, keywords: [], mana });

describe("draw-lose-subject — the conjunction parses to the two who:target atoms", () => {
  it("'draws two cards and loses 2 life' → [draw target 2, lose-life target 2]", () => {
    expect(parseEffectProgram(S("Sign in Blood", "Target player draws two cards and loses 2 life.")).atoms).toEqual([draw(2), lose(2)]);
  });
  it("'draws three cards and loses 3 life' (Harrowing Journey) parses to the two atoms", () => {
    expect(parseEffectProgram(S("Harrowing Journey", "Target player draws three cards and loses 3 life.")).atoms).toEqual([draw(3), lose(3)]);
  });
  it("flips native across spell / +counter rider / modal / trigger", () => {
    expect(classifyCard(S("Sign in Blood", "Target player draws two cards and loses 2 life."))).toBe("native-spell");
    expect(classifyCard(S("Cost of Brilliance", "Target player draws two cards and loses 2 life. Put a +1/+1 counter on up to one target creature."))).toBe("native-spell"); // the counter rider IS modeled
    expect(classifyCard(S("Shredder's Revenge", "Choose one —\n• Target player discards two cards.\n• Target player draws two cards and loses 2 life."))).toBe("native-spell");
    expect(classifyCard(S("Bloodgift Demon", "Flying\nAt the beginning of your upkeep, target player draws a card and loses 1 life.", "Creature — Demon", "{3}{B}"))).toBe("native-trigger");
  });
});

describe("draw-lose-subject — CREED: a rider / comma-chain / split keeps the card on the Arbiter", () => {
  it("a poison comma-chain ('draws three cards, loses 3 life, and gets three poison counters') stays Arbiter", () => {
    expect(classifyCard(S("Caress of Phyrexia", "Target player draws three cards, loses 3 life, and gets three poison counters."))).not.toMatch(/^native/);
  });
  it("an Adamant rider (Foreboding Fruit) keeps the card on the Arbiter", () => {
    expect(classifyCard(S("Foreboding Fruit", "Target player draws two cards and loses 2 life.\nAdamant — If at least three black mana was spent to cast this spell, create a Food token."))).not.toMatch(/^native/);
  });
});
