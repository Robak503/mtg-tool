/**
 * kwTriggerReconciliation.test.js — DETHRONE / TRAINING / FIREBENDING / SOULSHIFT in the shaped-vs-detected sum.
 *
 * `allTriggerSentencesModeled` requires `shaped === detected`, where `detected` is detectTriggers' output and
 * `shaped` is the printed trigger SENTENCES plus a per-keyword bump for every keyword whose ability lives in
 * reminder parens (and so contributes no sentence). These four keywords were SYNTHESIZED by detectTriggers
 * but missing from the bump — so the counts only balanced while the keyword was the card's ONLY trigger.
 * Put any printed trigger beside one and the card parked on arithmetic, not on a missing mechanic.
 *
 * ⚠️⚠️ AND THE FIX EXPOSED A SECOND, NASTIER SHAPE — the reason this file exists rather than a one-line diff.
 * Three cards were credited native by TWO ERRORS CANCELLING: an unrecognised printed trigger was counted as
 * SHAPED (it looks like a trigger sentence) while the keyword was DETECTED but not shaped. +1 and −1 balanced,
 * the gate passed, and the card carried a trigger the engine cannot fire. Fixing the keyword side exposed the
 * other side and those three now correctly park.
 *
 * ⭐ **`shaped === detected` PASSING IS NOT EVIDENCE THAT EVERY TRIGGER ON A CARD IS MODELED.** It is evidence
 * the two counts agree. They can agree while both are wrong. That is the lesson worth keeping.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers, soulshiftKeywordCount } from "./triggers.js";

const NATIVE = /^(?:native|land)/;
const C = (name, type, oracle, over = {}) => ({ name, type, mana: "{2}{G}", power: "2", toughness: "2", ...over, oracle });

describe("a reminder-parens keyword beside a PRINTED trigger now reconciles", () => {
  const CASES = [
    ["Training + a dies trigger (Parish-Blade Trainee)", "Creature — Human Soldier",
      "Training (Whenever this creature attacks with another creature with greater power, put a +1/+1 counter on this creature.)\nWhen this creature dies, put its counters on target creature you control."],
    ["Training + an ETB (Rural Recruit)", "Creature — Human Peasant",
      "Training (Whenever this creature attacks with another creature with greater power, put a +1/+1 counter on this creature.)\nWhen this creature enters, create a 3/1 green Boar creature token."],
    ["Dethrone + a combat-damage trigger (Marchesa's Infiltrator)", "Creature — Human Rogue",
      "Dethrone (Whenever this creature attacks the player with the most life or tied for most life, put a +1/+1 counter on it.)\nWhenever this creature deals combat damage to a player, draw a card."],
    ["Firebending + an ETB (Tundra Tank)", "Artifact — Vehicle",
      "Firebending 1 (Whenever this creature attacks, add {R}. This mana lasts until end of combat.)\nWhen this Vehicle enters, target creature you control gains indestructible until end of turn.\nCrew 2"],
    ["Soulshift + a damage trigger (Kami of the Honored Dead)", "Creature — Spirit",
      "Whenever this creature is dealt damage, you gain that much life.\nSoulshift 6 (When this creature dies, you may return target Spirit card with mana value 6 or less from your graveyard to your hand.)"],
  ];
  for (const [label, type, oracle] of CASES) {
    it(label, () => expect(classifyCard(C("X", type, oracle))).toMatch(NATIVE));
  }
});

describe("soulshift counts INSTANCES, not presence (CR 702.46b)", () => {
  it("a DOUBLE soulshift synthesizes two dies triggers and must be counted twice", () => {
    // Forked-Branch Garami's shape. If the count collapsed to a boolean, shaped would under-run detected by
    // one and the card would park — which is exactly what a presence check does.
    const garami = "Soulshift 4, soulshift 4 (When this creature dies, you may return up to two target Spirit cards with mana value 4 or less from your graveyard to your hand.)";
    expect(soulshiftKeywordCount(garami)).toBe(2);
    expect(detectTriggers(C("Forked-Branch Garami", "Creature — Spirit", garami))).toHaveLength(2);
  });

  it("a single soulshift still counts one", () => {
    expect(soulshiftKeywordCount("Soulshift 3 (When this creature dies, …)")).toBe(1);
  });

  it("the counter reads the same text the synthesis does — reminder parens are stripped first", () => {
    // The synthesis strips parens before matching; a `soulshift N` appearing ONLY inside another card's
    // reminder text must not be counted, or shaped over-runs detected and a fine card parks.
    expect(soulshiftKeywordCount("Flying (This creature can't be blocked except by soulshift 2 creatures.)")).toBe(0);
  });
});

describe("⛔ CREED — the gate still refuses a card whose printed trigger is unmodeled", () => {
  it("an unrecognised trigger beside the keyword parks the card (the two-errors-cancel class)", () => {
    // Jenny Flint / Cloaked Cadet's shape. Before the fix this read NATIVE, because the unrecognised
    // sentence was counted as shaped while the keyword was detected-but-not-shaped and the errors cancelled.
    // Verified alone on a bare creature: detectTriggers returns 0 for this sentence.
    const card = C("Cloaked Cadet", "Creature — Human Ranger",
      "Training (Whenever this creature attacks with another creature with greater power, put a +1/+1 counter on this creature.)\nWhenever one or more +1/+1 counters are put on one or more Humans you control, draw a card.");
    expect(detectTriggers(card)).toHaveLength(1);          // the keyword only — the printed sentence is invisible
    expect(classifyCard(card)).not.toMatch(NATIVE);
  });
});
