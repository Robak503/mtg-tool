/**
 * auraCoveredKeywordLine.test.js — a bare COVERED keyword line ("Flash") was residue to the aura-own
 * ACTIVATED lane while every other lane in the project already credits it. Blessing of Leeches and
 * Jolrael's Favor parked on that one word.
 *
 * THE DRIFT, the same shape as the strips fixed earlier today: one lane accepts a line, another calls it
 * leftover text. `isKeywordOnly` / COVERED_KEYWORDS already treat flash as covered — a vanilla Flash
 * creature is native-body, and Ambush Viper (Flash + Deathtouch) is native-body — but
 * isNativeOwnActivatedAura's residue walk allowed only the Enchant line and activated-ability lines, so
 * an Aura carrying a printed keyword line fell out no matter how modeled its actual abilities were.
 *
 * ⛔ THIS PROPAGATES AN EXISTING POLICY; IT DOES NOT MAKE ONE. And the policy is worth stating plainly
 * because it is NOT free: the runtime does not enforce flash timing at all — legalChoices.isSorcerySpeed
 * says so in its own comment ("Flash check is a v1.5 add — for now any non-instant defaults to sorcery"),
 * so a flash permanent is castable only at sorcery speed. That is strictly WEAKER than printed, which is
 * why the project treats it as a safe false negative and lists flash among COVERED_KEYWORDS. Every
 * keyword-only card already rides on exactly that call. This lane now rides on it too, rather than
 * disagreeing with it. An UNCOVERED keyword line still fails isKeywordOnly and still parks the card —
 * pinned below, because that is the whole boundary.
 *
 * Mutation-checked (2026-08-04, verified applied): the isKeywordOnly allowance removed -> both flip pins
 * go red; the allowance widened to `continue` unconditionally -> the uncovered-keyword park goes red.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-04).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const JOLRAELS_FAVOR = { id: "c-jf", name: "Jolrael's Favor", type: "Enchantment — Aura", mana: "{G}",
  oracle: "Flash\nEnchant creature\n{1}{G}: Regenerate enchanted creature." };
const BLESSING_OF_LEECHES = { id: "c-bl", name: "Blessing of Leeches", type: "Enchantment — Aura", mana: "{1}{B}",
  oracle: "Flash\nEnchant creature\nAt the beginning of your upkeep, you lose 1 life.\n{0}: Regenerate enchanted creature." };

describe("recognition", () => {
  it("both carriers flip to native-activated", () => {
    expect(classifyCard(JOLRAELS_FAVOR)).toBe("native-activated");
    // Blessing of Leeches also needs the aura-own activated x triggered composition, so it exercises
    // both that lane and this allowance at once.
    expect(classifyCard(BLESSING_OF_LEECHES)).toBe("native-activated");
  });

  it("the keyword line was the ONLY blocker — without it they were already native", () => {
    expect(classifyCard({ ...JOLRAELS_FAVOR, id: "c-a", oracle: "Enchant creature\n{1}{G}: Regenerate enchanted creature." })).toBe("native-activated");
  });

  it("⛔ an UNCOVERED keyword line still parks the card (the boundary)", () => {
    // Annihilator is not in COVERED_KEYWORDS, so isKeywordOnly rejects it and the Aura stays Arbiter.
    expect(classifyCard({ ...JOLRAELS_FAVOR, id: "c-x", name: "Odd Favor",
      oracle: "Annihilator 2\nEnchant creature\n{1}{G}: Regenerate enchanted creature." })).toBe("body-only");
  });

  it("⛔ an unmodeled SENTENCE is still residue — this only admits bare keyword lines", () => {
    expect(classifyCard({ ...JOLRAELS_FAVOR, id: "c-y", name: "Riddle Favor",
      oracle: "Flash\nEnchant creature\nWhenever a player consults an oracle, interpret its riddle however you like.\n{1}{G}: Regenerate enchanted creature." })).toBe("body-only");
  });

  it("the policy this rides on is real elsewhere — a vanilla Flash creature is already native", () => {
    // Stated as a pin so the next reader can see the allowance is consistency, not a new permission.
    expect(classifyCard({ id: "c-v", name: "Ambush Viper", type: "Creature — Snake", mana: "{1}{G}", power: "2", toughness: "1",
      oracle: "Flash\nDeathtouch" })).toBe("native-body");
  });
});

describe("the SIBLING lane: the same allowance in the clone-shape view", () => {
  // Stunt Double is the same one-word blocker through a DIFFERENT function (parseCloneSpec's residue
  // check), so it was deliberately not batched with the aura fix and is pinned here beside it.
  const STUNT_DOUBLE = { id: "c-sd", name: "Stunt Double", type: "Creature — Shapeshifter", mana: "{3}{U}", power: "0", toughness: "0",
    oracle: "Flash\nYou may have this creature enter as a copy of any creature on the battlefield." };

  it("Stunt Double flips to native-clone", () => {
    expect(classifyCard(STUNT_DOUBLE)).toBe("native-clone");
  });

  it("the keyword line was the ONLY blocker", () => {
    expect(classifyCard({ ...STUNT_DOUBLE, id: "c-sd2",
      oracle: "You may have this creature enter as a copy of any creature on the battlefield." })).toBe("native-clone");
  });

  it("⛔ an UNCOVERED keyword line still parks the clone", () => {
    expect(classifyCard({ ...STUNT_DOUBLE, id: "c-sd3", name: "Odd Double",
      oracle: "Annihilator 2\nYou may have this creature enter as a copy of any creature on the battlefield." })).toBe("body-only");
  });

  it("⛔ an unmodeled SENTENCE still parks the clone (bare keyword lines only)", () => {
    expect(classifyCard({ ...STUNT_DOUBLE, id: "c-sd4", name: "Riddle Double",
      oracle: "Flash\nWhenever a player consults an oracle, interpret its riddle however you like.\nYou may have this creature enter as a copy of any creature on the battlefield." })).toBe("body-only");
  });
});
