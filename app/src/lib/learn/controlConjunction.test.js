/**
 * controlConjunction.test.js — "if you control an artifact and an enchantment" (Naomi, Pillar of Order;
 * Kami of Terrible Secrets).
 *
 * ⭐ AN ELIDED SUBJECT, NOT A CONJUNCTION OF CONDITIONS. The printed English drops the repeated subject:
 * the clause means "you control an artifact AND you control an enchantment", so the right half is the bare
 * noun "an enchantment", which is not a condition at all. A naive split on " and " produces one readable
 * half and one fragment.
 *
 * ⛔ AND A GENERIC " and " SPLITTER IS WORTH ZERO — MEASURED, NOT ASSUMED. Across the corpus all 18
 * AND-shaped unparseable conditions have a half that does not read standalone. Worse, several carry an
 * " and " that is INTERNAL to a single condition and must never be split:
 *     "your devotion to white and black is seven or greater"
 *     "you gained and lost life this turn"
 *     "you've cast three or more instant and sorcery spells this turn"
 * Splitting those would hand the evaluator nonsense halves and get a confident answer back. So this arm is
 * whole-clause anchored on the one shape that elides a "you control" subject, and the guards below are the
 * point of the file.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { detectTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real printed oracles (bundled Scryfall snapshot).
const NAOMI = { name: "Naomi, Pillar of Order", type: "Legendary Creature — Human Advisor", power: "4", toughness: "4", mana: "{3}{W}{B}",
  oracle: "Whenever Naomi enters or attacks, if you control an artifact and an enchantment, create a 2/2 white Samurai creature token with vigilance." };
const KAMI = { name: "Kami of Terrible Secrets", type: "Creature — Spirit", power: "3", toughness: "4", mana: "{3}{B}",
  oracle: "When this creature enters, if you control an artifact and an enchantment, you draw a card and you gain 1 life." };

const ARTIFACT = { id: "art", name: "Sol Ring", type: "Artifact", mana: "{1}", oracle: "" };
const ENCHANTMENT = { id: "ench", name: "Ghostly Prison", type: "Enchantment", mana: "{2}{W}", oracle: "" };
const CREATURE = { id: "cre", name: "Bear", type: "Creature — Bear", mana: "{1}{G}", oracle: "" };

function board(cards) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const perms = cards.map((c, i) => createPermanent({ id: `p${i}`, card: c, controller: "user", summoningSick: false }));
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: perms } } };
}
const ask = (state) => evaluateInterveningIf(state, "you control an artifact and an enchantment", "user", {});

describe("⭐ BOTH halves must hold", () => {
  it("VACUITY CONTROL: an empty board fails, so a true below means something", () => {
    expect(ask(board([]))).toBe(false);
  });

  it("artifact + enchantment → true", () => {
    expect(ask(board([ARTIFACT, ENCHANTMENT]))).toBe(true);
  });

  it("⛔ artifact alone → false", () => {
    expect(ask(board([ARTIFACT]))).toBe(false);
  });

  it("⛔ enchantment alone → false", () => {
    expect(ask(board([ENCHANTMENT]))).toBe(false);
  });

  it("⛔ neither — a creature satisfies no half", () => {
    expect(ask(board([CREATURE]))).toBe(false);
  });

  it("extra permanents do not disturb it", () => {
    expect(ask(board([CREATURE, ARTIFACT, ENCHANTMENT]))).toBe(true);
  });
});

describe("⛔ THE ANCHOR — conditions whose ' and ' is INTERNAL must never be split", () => {
  it("stays unparseable for every internal-and condition in the corpus", () => {
    // These are real corpus conditions. Each would evaluate nonsense halves under a generic splitter.
    for (const c of [
      "your devotion to white and black is seven or greater",
      "you gained and lost life this turn",
      "you've cast three or more instant and sorcery spells this turn",
      "you've cast both a creature spell and a noncreature spell this turn",
    ]) {
      expect(interveningIfParseable(c), c).toBe(false);
    }
  });

  it("⛔ a three-noun chain refuses — only the printed two-noun shape is modelled", () => {
    expect(interveningIfParseable("you control an artifact and an enchantment and a creature")).toBe(false);
  });

  it("⛔ an unreadable noun makes the whole thing unreadable, never silently false", () => {
    // "a commander" is a DESIGNATION, refused by the you-control vocabulary — so the conjunction must
    // inherit that refusal rather than answering false.
    expect(interveningIfParseable("you control an artifact and a commander")).toBe(false);
  });

  it("the parseable form is exactly the printed one", () => {
    expect(interveningIfParseable("you control an artifact and an enchantment")).toBe(true);
  });
});

describe("the corpus rows", () => {
  it("both carriers flip", () => {
    expect(detectTriggers(NAOMI)[0].interveningIf).toBe("you control an artifact and an enchantment");
    expect(classifyCard(NAOMI)).toBe("native-trigger");
    expect(classifyCard(KAMI)).toBe("native-trigger");
  });
});
