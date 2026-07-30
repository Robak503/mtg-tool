/**
 * conditionFilterVocabulary.test.js — the "you control <filter>" vocabulary, widened (13 cards).
 *
 * ⭐ WHY THIS PAYS THREE TIMES. `evaluateInterveningIf` is ONE grammar behind three probes —
 * `interveningIfParseable` (triggers), `spellConditionParseable` (resolving spells) and
 * `activationConditionParseable` (activated abilities, CR 602.5d). conditionVocabularyReaders.test.js states it
 * outright: "a single reader added here reaches all three". A census of the parked corpus put 45 cards on
 * "you control <filter>" phrases `parseFilter` could not read, while `permMatchesFilter`'s own gates (tapped
 * state, layer-aware power) showed the evaluation machinery was already there. Four filter kinds were added:
 * KEYWORD ("a creature with flying"), COLOR ("a blue permanent"), TYPE UNION ("an artifact or enchantment")
 * and the SNOW supertype ("four or more snow permanents").
 *
 * ⛔ EVERY TEST HERE ASSERTS BOTH DIRECTIONS, and that is the point. A condition that reads but evaluates
 * WRONG is worse than one that parks: the ability fires when the card says it must not. So each filter gets a
 * board where it should be TRUE and a board where it must be FALSE.
 *
 * ⭐ THE SHARPEST HAZARD — UNION vs CONJUNCTION. `word` may be an array, and the quantifier is not the same:
 * "artifact or enchantment" is a UNION (any listed word matches) while "snow land" is a CONJUNCTION
 * (["Land","Snow"], flagged allWords — every word must match). Using `.some()` for both would let
 * "you control four or more snow permanents" count ordinary lands, i.e. fire an ability whose printed
 * condition is false.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { evaluateInterveningIf, interveningIfParseable, spellConditionParseable, activationConditionParseable } from "./interveningIf.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

/** A board where the USER controls the given cards. */
function board(cards) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const bf = cards.map((card, i) => createPermanent({ id: `p${i}`, card: { id: `c${i}`, ...card }, controller: "user" }));
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf } } };
}
const ev = (cards, cond) => evaluateInterveningIf(board(cards), cond, "user", { sourcePermanentId: "p0" });

const CREA = { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 };
const FLYER = { name: "Bird", type: "Creature — Bird", power: 1, toughness: 1, keywords: ["flying"] };
const ARTI = { name: "Rock", type: "Artifact" };
const ENCH = { name: "Glow", type: "Enchantment" };
const LAND = { name: "Waste", type: "Land" };
const SNOWLAND = { name: "Snow-Covered Forest", type: "Snow Land — Forest" };
const BLUEPERM = { name: "Blue Thing", type: "Artifact", colors: ["U"] };

describe("⭐ all three lanes read the widened vocabulary (one grammar, three probes)", () => {
  const PHRASES = [
    "you control a creature with flying",
    "you control a blue permanent",
    "you control an artifact or enchantment",
    "you control four or more snow permanents",
  ];
  for (const p of PHRASES) {
    it(`«${p}» is readable on the trigger, spell AND activation lanes`, () => {
      expect(interveningIfParseable(p), "trigger").toBe(true);
      expect(spellConditionParseable(p), "spell").toBe(true);
      expect(activationConditionParseable(p), "activation").toBe(true);
    });
  }
});

describe("⛔⭐ KEYWORD filter — both directions", () => {
  it("true with a flyer, FALSE with only a ground creature", () => {
    expect(ev([FLYER], "you control a creature with flying")).toBe(true);
    expect(ev([CREA], "you control a creature with flying")).toBe(false);
  });
  it("the count form respects the keyword", () => {
    expect(ev([FLYER, FLYER, CREA], "you control two or more creatures with flying")).toBe(true);
    expect(ev([FLYER, CREA, CREA], "you control two or more creatures with flying")).toBe(false);
  });
  it("⛔ an UNRECOGNISED keyword word is REFUSED, not silently counted as 0", () => {
    // A word nobody grants would make the condition FALSE forever while the shape gate still reported
    // "readable" — a native-classified ability that can never fire. It must stay unparseable instead.
    expect(activationConditionParseable("you control a creature with lifelink")).toBe(true);
    expect(activationConditionParseable("you control a creature with gobbledygook")).toBe(false);
    expect(activationConditionParseable("you control a creature with three")).toBe(false);
  });
  it("⛔ a NON-TYPE noun can't ride the keyword arm into being a type filter", () => {
    expect(activationConditionParseable("you control a spell with flying")).toBe(false);
    expect(activationConditionParseable("you control a commander with flying")).toBe(false);
  });
});

describe("⛔⭐ COLOR filter — both directions, and fail-closed", () => {
  it("true for a blue permanent, FALSE for a colorless one", () => {
    expect(ev([BLUEPERM], "you control a blue permanent")).toBe(true);
    expect(ev([ARTI], "you control a blue permanent")).toBe(false);
  });
  it("the colour composes with a type noun", () => {
    expect(ev([{ ...CREA, colors: ["W"] }], "you control a white creature")).toBe(true);
    expect(ev([{ ...CREA, colors: ["W"] }], "you control a blue creature")).toBe(false);
    expect(ev([{ ...ARTI, colors: ["W"] }], "you control a white creature")).toBe(false); // right colour, wrong type
  });
});

describe("⛔⭐ TYPE UNION — any listed word matches, and a non-type side is refused", () => {
  it("either half satisfies it; neither half does not", () => {
    expect(ev([ARTI], "you control an artifact or enchantment")).toBe(true);
    expect(ev([ENCH], "you control an artifact or enchantment")).toBe(true);
    expect(ev([CREA], "you control an artifact or enchantment")).toBe(false);
  });
  it("⛔ a union with a NON-type side stays unparseable (never a silently-dropped half)", () => {
    expect(activationConditionParseable("you control an artifact or permanent")).toBe(false);
    expect(activationConditionParseable("you control an artifact or commander")).toBe(false);
  });
});

describe("⛔⭐ SNOW is a CONJUNCTION, not a union — THE sharpest hazard in this slice", () => {
  it("a snow land counts; an ordinary land must NOT", () => {
    // If the array were quantified with .some() instead of .every(), a plain Land would satisfy
    // ["Land","Snow"] and Heidar / Rimewind Cryomancer would activate off an untapped Island.
    expect(ev([SNOWLAND], "you control a snow land")).toBe(true);
    expect(ev([LAND], "you control a snow land")).toBe(false);
  });
  it("the count form is exact — four snow permanents yes, three snow plus a plain land no", () => {
    expect(ev([SNOWLAND, SNOWLAND, SNOWLAND, SNOWLAND], "you control four or more snow permanents")).toBe(true);
    expect(ev([SNOWLAND, SNOWLAND, SNOWLAND, LAND], "you control four or more snow permanents")).toBe(false);
  });
});

describe("⛔ THE INCUMBENTS ARE UNCHANGED", () => {
  it("the bare, tapped, count, power and no-<filter> forms all still evaluate as before", () => {
    expect(ev([CREA], "you control a creature")).toBe(true);
    expect(ev([ARTI], "you control a creature")).toBe(false);
    expect(ev([{ ...CREA, power: 4 }], "you control a creature with power 4 or greater")).toBe(true);
    expect(ev([CREA], "you control a creature with power 4 or greater")).toBe(false);
    expect(ev([ARTI, ARTI], "you control two or more artifacts")).toBe(true);
    expect(ev([ARTI], "you control two or more artifacts")).toBe(false);
    expect(ev([LAND], "you control no untapped lands")).toBe(false);   // one untapped land present
    expect(ev([CREA], "you control no untapped lands")).toBe(true);
  });
  it("a designation is still refused (it is not a type line word)", () => {
    expect(activationConditionParseable("you control a commander")).toBe(false);
    expect(activationConditionParseable("you control a monarch")).toBe(false);
  });
});
