/**
 * keywordParityCredit.test.js — SPELL/PERMANENT keyword parity (surge · miracle · prowl · flashback).
 *
 * ⭐ FOUND BY A PARITY SWEEP, not card by card. Every cost-carrying entry of CAST_KEYWORD_LINE (the
 * SPELL-side vacuous-line strip, textNormalize.js) was tested against isKeywordOnly (the PERMANENT-side
 * credit). SIXTEEN keywords were handled on one side and absent from the other. Spectacle was the first
 * fixed; these are the rest of the simple `KEYWORD {cost}` shape that actually have permanent carriers.
 *
 * Each is the vacuous-alt-entry rationale, CR-checked rather than assumed:
 *   SURGE   702.117a — "You may pay [cost] rather than pay this spell's mana cost as you cast it…"
 *   MIRACLE 702.94a  — "You may reveal this card from your hand as you draw it … cast it for its miracle cost"
 *   PROWL   702.76a  — "You may pay [cost] rather than pay this spell's mana cost if a player was dealt
 *                       combat damage this turn…"
 *   FLASHBACK        — the graveyard re-cast window, on the basis CAST_KEYWORD_LINE already states.
 * The card is castable at its printed cost and the resulting permanent is identical, so the unoffered alt
 * entry is a missing OPTION, never a mis-resolution.
 *
 * ⛔ THE ^…$ ANCHOR IS THE SAFETY PROPERTY, and Catalyst Stone proves it: "Flashback costs you pay cost {2}
 * less." is a keyword-REFERENCING static, has more words, cannot match, and the card correctly stays parked.
 * A card that CARES about a keyword must never be credited for merely mentioning it.
 */
import { describe, expect, it } from "vitest";
import { classifyCard, isKeywordOnly } from "./coverage.js";

// Real printed oracles, read out of the snapshot.
// ⚠️ `find(name)` is NOT safe for fixtures — "Zephyrim" has a TOKEN row ("Flying, vigilance", no miracle
// line) ahead of the real card. Pulling by name alone grabbed the token and would have tested nothing.
const JWAR_ISLE_AVENGER = { name: "Jwar Isle Avenger", type: "Creature — Sphinx", power: "3", toughness: "3", mana: "{4}{U}",
  oracle: "Surge {2}{U} (You may cast this spell for its surge cost if you or a teammate has cast another spell this turn.)\nFlying" };
const GOBLIN_FREERUNNER = { name: "Goblin Freerunner", type: "Creature — Goblin Warrior Ally", power: "3", toughness: "2", mana: "{3}{R}",
  oracle: "Surge {1}{R} (You may cast this spell for its surge cost if you or a teammate has cast another spell this turn.)\nMenace (This creature can't be blocked except by two or more creatures.)" };
const ZEPHYRIM = { name: "Zephyrim", type: "Creature — Human Warrior", power: "3", toughness: "3", mana: "{3}{W}",
  oracle: "Squad {2} (As an additional cost to cast this spell, you may pay {2} any number of times. When this creature enters, create that many tokens that are copies of it.)\nFlying, vigilance\nMiracle {1}{W} (You may cast this card for its miracle cost when you draw it if it's the first card you drew this turn.)" };
const CATALYST_STONE = { name: "Catalyst Stone", type: "Artifact", mana: "{2}",
  oracle: "Flashback costs you pay cost {2} less.\nFlashback costs your opponents pay cost {2} more." };

describe("⭐ the parity credits", () => {
  it("the bare cost clauses are keyword-only", () => {
    expect(isKeywordOnly("surge {1}{r}")).toBe(true);
    expect(isKeywordOnly("miracle {1}{w}")).toBe(true);
    expect(isKeywordOnly("prowl {1}{b}")).toBe(true);
    expect(isKeywordOnly("flashback {2}{r}")).toBe(true);
  });

  it("the carriers flip on their own bodies", () => {
    expect(classifyCard(JWAR_ISLE_AVENGER)).toBe("native-body");
    expect(classifyCard(GOBLIN_FREERUNNER)).toBe("native-body");
    expect(classifyCard(ZEPHYRIM)).toBe("native-body");
  });
});

describe("⛔ the credit is the BARE COST LINE only", () => {
  it("Catalyst Stone stays parked — a flashback-REFERENCING static is not a flashback line", () => {
    expect(isKeywordOnly("flashback costs you pay cost {2} less")).toBe(false);
    expect(classifyCard(CATALYST_STONE)).not.toMatch(/^native/);
  });

  it("other keyword-referencing text is not credited either", () => {
    expect(isKeywordOnly("spells with surge cost {1} less to cast")).toBe(false);
    expect(isKeywordOnly("whenever you cast a spell for its prowl cost, draw a card")).toBe(false);
  });

  it("⛔ compound-cost keywords are still NOT credited — the clause split defeats them", () => {
    // escape / suspend / awaken print a dash-joined compound cost; isKeywordOnly splits on commas and
    // dashes BEFORE testing, so no whole-line pattern reaches them. 10 permanents wait on that change.
    // ✅ escape graduated (whole-LINE removal, escapeLineCredit.test.js); suspend + awaken still refused.
    expect(isKeywordOnly("suspend 3—{1}{u}")).toBe(false);
    expect(isKeywordOnly("awaken 6—{6}{u}{u}{u}")).toBe(false);
  });

  it("an UNMODELED body still parks the card", () => {
    const residue = { ...JWAR_ISLE_AVENGER, name: "Fake Avenger",
      oracle: "Surge {2}{U} (reminder)\nConsult an oracle and interpret its riddle however you like." };
    expect(classifyCard(residue)).not.toMatch(/^native/);
  });
});
