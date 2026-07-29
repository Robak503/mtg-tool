/**
 * squadReminderPhantom.test.js — the SQUAD reminder was minting a PHANTOM ETB TRIGGER (CR 207.2 / 702.157a).
 *
 * "Squad {3} (As an additional cost to cast this spell, you may pay {3} any number of times. When this creature
 * enters, create that many tokens that are copies of it.)"
 *
 * ⛔ THAT SECOND SENTENCE STARTS WITH "When" AT A SENTENCE BOUNDARY INSIDE THE PAREN, so detectTriggers'
 * anchor caught it and every squad creature grew an ETB trigger it does not have. The effect clause it produced
 * was the malformed `create that many tokens that are copies of it. )` — stray paren included, which is the
 * tell that REMINDER TEXT was being read as RULES TEXT. Reminder text has no rules meaning (CR 207.2).
 *
 * ⚠️ AND IT WAS A RUNTIME DEFECT, NOT ONLY A METRIC ONE: the phantom descriptor routes UNNATIVELY, so a squad
 * creature sent its ETB to the Arbiter for an ability it never had. The trigger the reminder describes exists
 * only when the optional squad cost was PAID; the engine never pays optional additional costs, so "that many"
 * is always zero and its absence is faithful — the same reasoning coverage.js already credits the squad LINE
 * under.
 *
 * ⭐ FOUND BY A PATH ACCIDENT. Squad was credited on the STATIC residue path and refused on the TRIGGER path,
 * so an identical card flipped or parked purely on what its OTHER line happened to be. This engine has fixed
 * that exact shape before (the self-no-untap static — "a pure path accident"), which is why the asymmetry was
 * worth chasing rather than shrugging at.
 */
import { describe, expect, it } from "vitest";

import { detectTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { triggerRoutesNatively } from "./triggerRouting.js";

const SQUAD = "Squad {3} (As an additional cost to cast this spell, you may pay {3} any number of times. When this creature enters, create that many tokens that are copies of it.)";
const CREATURE = { type: "Creature — Robot", mana: "{3}{R}", power: 2, toughness: 2, name: "X" };
const TRIGGER = "Whenever this creature attacks, it gets +1/+0 until end of turn.";
const STATIC = "Other creatures you control get +1/+1.";

describe("the phantom is gone", () => {
  it("⭐ a squad line alone detects NO triggers", () => {
    expect(detectTriggers({ ...CREATURE, oracle: SQUAD })).toHaveLength(0);
  });

  it("⭐ squad + a real trigger detects exactly ONE — the real one", () => {
    const t = detectTriggers({ ...CREATURE, oracle: `${SQUAD}\n${TRIGGER}` });
    expect(t).toHaveLength(1);
    expect(t[0].event).toBe("attacks");
  });

  it("⛔⭐ and the phantom was UNROUTABLE, which is why it was a runtime defect", () => {
    // The regression guard with teeth: were the strip removed, this card would carry an extra `etb` descriptor
    // that fails triggerRoutesNatively — sending the ETB of a squad creature to the Arbiter for an ability it
    // does not have. Asserting "every detected trigger routes" catches that, where a count alone might not.
    const t = detectTriggers({ ...CREATURE, oracle: `${SQUAD}\n${TRIGGER}` });
    expect(t.every(triggerRoutesNatively)).toBe(true);
  });
});

describe("⭐ the PATH ACCIDENT is closed — the other line no longer decides", () => {
  it("⭐ squad + trigger and squad + static now agree", () => {
    // ⚠️ THE ASYMMETRY THAT EXPOSED THE BUG. squad+static was native and squad+trigger was body-only, on
    // cards differing only in what their second line happened to be. Asserted as a PAIR, because either half
    // alone would pass on an engine that got both wrong in the same direction.
    expect(classifyCard({ ...CREATURE, oracle: `${SQUAD}\n${STATIC}` })).toMatch(/^native/);
    expect(classifyCard({ ...CREATURE, oracle: `${SQUAD}\n${TRIGGER}` })).toMatch(/^native/);
  });
});

describe("⛔ CREED — the strip is anchored to the squad reminder and nothing else", () => {
  it("⛔ a real ETB trigger printed OUTSIDE a paren is untouched", () => {
    const t = detectTriggers({ ...CREATURE, oracle: `${SQUAD}\nWhen this creature enters, draw a card.` });
    expect(t).toHaveLength(1);
    expect(t[0].event).toBe("etb");
  });

  it("⛔ the FADING/VANISHING reminder strip still works (the precedent this follows)", () => {
    // Both strips live on the same expression; a careless edit to one can eat the other.
    const vanishing = { ...CREATURE, oracle: "Vanishing 3 (This creature enters the battlefield with three time counters on it. At the beginning of your upkeep, remove a time counter from it. When the last is removed, sacrifice it.)\nFlying" };
    expect(detectTriggers(vanishing)).toHaveLength(0);
  });

  it("⛔ kicker / multikicker reminders were never phantoms and still aren't", () => {
    expect(detectTriggers({ ...CREATURE, oracle: "Kicker {3} (You may pay an additional {3} as you cast this spell.)" })).toHaveLength(0);
    expect(detectTriggers({ ...CREATURE, oracle: "Multikicker {1} (You may pay an additional {1} any number of times as you cast this spell.)" })).toHaveLength(0);
  });

  it("⛔ a non-squad 'any number of times' paren is not swallowed wholesale", () => {
    // The anchor requires the additional-cost lead-in, so an unrelated parenthetical keeps its trigger.
    const t = detectTriggers({ ...CREATURE, oracle: "When this creature enters, draw a card. (You may do this any number of times.)" });
    expect(t).toHaveLength(1);
  });
});
