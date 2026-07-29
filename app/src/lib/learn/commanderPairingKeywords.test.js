/**
 * commanderPairingKeywords.test.js — the COMMAND-ZONE PAIRING family is inert during a game (CR 702.124,
 * 702.139–702.141), and one member of it is emphatically NOT.
 *
 * Bare "Partner" was already credited. Its siblings were not, on a comment that claimed they "carry extra
 * unmodeled text". The corpus disagrees — every one of the 47 pairing lines in the index carries only a
 * reminder, and reminders are stripped before this check:
 *
 *     Partner—Friends forever  (You can have two commanders if both have this ability.)   ×7
 *     Partner—Character select (…same…)  ×5   ·  Partner—Survivors ×4  ·  Partner—Father & son ×2
 *     Choose a Background      (You can have a Background as a second commander.)         ×31
 *     Doctor's companion       (You can have two commanders if the other is the Doctor.)  ×27
 *
 * None changes anything during play, and the engine never reads them to decide seating: `commanderCards`
 * arrives from the DECK DEFINITION and createPlayerState seats whatever it is handed. So no clause is being
 * dropped — which is exactly why crediting them cannot become a claimed-native no-op.
 *
 * ⛔ "PARTNER WITH <name>" IS THE EXCEPTION AND MUST STAY REFUSED: its reminder is "(When this creature
 * enters, target player may put <name> into their hand from their library…)" — a real linked ETB tutor
 * (CR 702.124f) the engine does not model. Crediting it WOULD drop an effect. The whole point of this pin is
 * that the family splits, and it splits on whether the keyword does anything once the game starts.
 */
import { describe, expect, it } from "vitest";

import { isKeywordOnly, classifyCard } from "./coverage.js";

const legend = (oracle) => ({ name: "X", type: "Legendary Creature — Human Soldier", mana: "{2}{W}", power: 2, toughness: 2, oracle });

describe("the inert pairing keywords are keyword-only", () => {
  for (const kw of [
    "Partner",
    "Partner—Friends forever",
    "Partner—Character select",
    "Partner—Survivors",
    "Partner—Father & son",   // the "&" is why the label class is not just [a-z' ]
    "Friends forever",
    "Choose a Background",
    "Doctor's companion",
  ]) {
    it(`"${kw}"`, () => {
      expect(isKeywordOnly(kw, "X")).toBe(true);
    });
  }

  it("a card whose only extra line is a pairing keyword classifies native", () => {
    expect(classifyCard(legend("Flying\nPartner—Character select"))).toMatch(/^native/);
  });
});

describe("⛔ CREED — \"Partner with <name>\" carries a real ETB tutor and stays refused", () => {
  it("it is NOT keyword-only", () => {
    expect(isKeywordOnly("Partner with Ley Weaver", "X")).toBe(false);
  });

  it("and it still parks the card", () => {
    expect(classifyCard(legend("Flying\nPartner with Ley Weaver"))).not.toMatch(/^native/);
  });

  it("the em-dash form must never be loosened into matching it", () => {
    // "partner with" has no em-dash, so the label alternation cannot reach it — asserted so a future
    // "simplification" of that regex fails here rather than silently crediting a dropped tutor.
    expect(isKeywordOnly("Partner with Blaring Recruiter", "X")).toBe(false);
  });
});

describe("⭐ CREED — the label alternation does not swallow real text", () => {
  it("a pairing-shaped line with an actual ability after it is not keyword-only", () => {
    expect(isKeywordOnly("Partner—Character select. Whenever this creature attacks, draw a card", "X")).toBe(false);
  });

  it("an unrelated em-dash keyword is unaffected", () => {
    expect(isKeywordOnly("Glorbulate—Pay 2 life", "X")).toBe(false);
  });
});
