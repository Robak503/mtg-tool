/**
 * coverageReminderStrip.test.js — TRIG-REMINDER-STRIP.
 *
 * allTriggerSentencesModeled (coverage.js) counts trigger-shaped sentences with TRIGGER_SENTENCE_RE
 * and compares against detectTriggers' count.  A keyword's REMINDER text can contain a "When …" clause
 * that the regex counts as a shaped sentence but is NOT a real trigger — earthbend's reminder is
 * "(… When it dies or is exiled, return it to the battlefield tapped.)".  detectTriggers rejects that
 * reminder clause (its "it" referent / "return … tapped" effect don't classify), so the shaped count
 * out-ran the detected count → a false body-only on Earth Village Ruffians / Haru / Toph.
 *
 * The fix strips reminder text (CR 207.2 — no rules meaning) BEFORE counting shaped sentences.  Because
 * a real triggered ability is NEVER printed only in reminder parens, stripping the reminder can only
 * LOWER the shaped count — it never hides a real unmodeled trigger (strictly false-negative-safe / CREED).
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";

const C = (name, oracle, type = "Creature") => ({ name, oracle, type, keywords: [], mana: "" });

// Real oracle text from Scryfall (oracle_cards.json).
const EARTH_VILLAGE_RUFFIANS = C(
  "Earth Village Ruffians",
  "When this creature dies, earthbend 2. (Target land you control becomes a 0/0 creature with haste that's still a land. Put two +1/+1 counters on it. When it dies or is exiled, return it to the battlefield tapped.)",
);
const HARU = C(
  "Haru, Hidden Talent",
  "Whenever another Ally you control enters, earthbend 1. (Target land you control becomes a 0/0 creature with haste that's still a land. Put a +1/+1 counter on it. When it dies or is exiled, return it to the battlefield tapped.)",
  "Legendary Creature — Human Ally",
);
const TOPH = C(
  "Toph, Earthbending Master",
  "Landfall — Whenever a land you control enters, you get an experience counter.\nWhenever you attack, earthbend X, where X is the number of experience counters you have. (Target land you control becomes a 0/0 creature with haste that's still a land. Put X +1/+1 counters on it. When it dies or is exiled, return it to the battlefield tapped.)",
  "Legendary Creature — Human Citizen",
);

describe("TRIG-REMINDER-STRIP — earthbend cards flip native-trigger", () => {
  it("Earth Village Ruffians (dies → earthbend 2) is native-trigger", () => {
    expect(classifyCard(EARTH_VILLAGE_RUFFIANS)).toBe("native-trigger");
  });
  it("Haru, Hidden Talent (Ally-ETB → earthbend 1) is native-trigger", () => {
    expect(classifyCard(HARU)).toBe("native-trigger");
  });
  it("Toph, Earthbending Master (landfall-experience + attack → earthbend X) is native-trigger", () => {
    expect(classifyCard(TOPH)).toBe("native-trigger");
  });

  it("the reminder's 'When it dies …' clause is NOT a detected trigger (count stays accurate)", () => {
    // detectTriggers must NOT pick up the reminder's "When it dies or is exiled" — only the real triggers.
    expect(detectTriggers(EARTH_VILLAGE_RUFFIANS).length).toBe(1);
    expect(detectTriggers(HARU).length).toBe(1);
    expect(detectTriggers(TOPH).length).toBe(2);
  });
});

describe("TRIG-REMINDER-STRIP — CREED: a real (non-reminder) unmodeled trigger still blocks", () => {
  it("a second trigger with an unmodeled event keeps the card body-only (count mismatch survives the strip)", () => {
    // "draw seven cards" on upkeep is a shaped+detected sentence whose effect routes; but the
    // SECOND clause here is a real, non-reminder trigger whose event is modeled but effect is NOT —
    // it must keep the card out of native-trigger.  (Reminder strip only removes parenthetical text.)
    const card = C(
      "Synthetic Test",
      "When this creature dies, earthbend 2. (Target land you control becomes a 0/0 creature with haste that's still a land.)\nAt the beginning of your upkeep, you may pay {3}. If you do, draw a card.",
    );
    expect(classifyCard(card)).not.toBe("native-trigger");
  });

  it("a card whose ONLY trigger is inside reminder parens has zero real triggers (not native-trigger)", () => {
    // A pure-keyword body with a reminder is native-BODY (keyword-only), never native-TRIGGER —
    // the reminder strip removes the parenthetical "When …" so no false trigger is counted.
    const card = C("Modular Tester", "Modular 2 (This creature enters with two +1/+1 counters on it. When it dies, you may put its +1/+1 counters on target artifact creature.)");
    expect(classifyCard(card)).not.toBe("native-trigger");
  });
});
