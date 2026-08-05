/**
 * learnClause.test.js — LEARN (CR 701.44a, Strixhaven). Fourteen carriers, none native before this.
 *
 * The printed choice is three-way: reveal a Lesson you own FROM OUTSIDE THE GAME and put it into your hand,
 * OR discard a card to draw a card, OR do nothing.
 *
 * ⭐ THIS ENGINE HAS NO OUTSIDE-THE-GAME ZONE, so the Lesson branch is a mode no player here can take —
 * exactly as if they had brought no Lessons, which is a legal way to play the card. What remains is the
 * discard-to-draw branch, and it is not approximated: it maps onto the EXISTING `optional-discard-payment`
 * atom, the same one the printed wording "You may discard a card. If you do, draw a card." already
 * produces. The atom shape was COPIED from parsing that sentence rather than hand-built, and this file pins
 * the two against each other so they can never drift.
 *
 * FN-SAFE BY CONSTRUCTION, which is the whole admission argument: the player's option set is REDUCED (one
 * of three modes unavailable), never widened, and the remaining branch stays OPTIONAL so declining is still
 * allowed. No resolution is ever wrong — a player simply cannot reach for a Lesson that is not in the game.
 *
 * It reaches every carrier shape through ONE clause parser, because "Learn." is a sentence like any other:
 * spells (Igneous Inspiration), ETB triggers (Professor of Symbology), dies triggers (Eyetwitch), an
 * Equipment's enters trigger (Poet's Quill) and a sacrifice-activated ability (Overgrown Arch) all pick it
 * up with no per-lane work.
 *
 * Mutation-checked (2026-08-04, grep-verified as applied AND verified on the case under test — the parser
 * was called directly and returned null for "Learn." before the suite was read): the clause parser disabled
 * -> every pin red.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-04).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram, learnClauseParser } from "./effects/parser.js";
import { _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const IGNEOUS_INSPIRATION = { id: "c-ii", name: "Igneous Inspiration", type: "Sorcery", mana: "{2}{R}",
  oracle: "Igneous Inspiration deals 3 damage to any target.\nLearn. (You may reveal a Lesson card you own from outside the game and put it into your hand, or discard a card to draw a card.)" };
const PROFESSOR_OF_SYMBOLOGY = { id: "c-pos", name: "Professor of Symbology", type: "Creature — Human Cleric", mana: "{1}{W}",
  power: 1, toughness: 3, oracle: "When this creature enters, learn." };
const EYETWITCH = { id: "c-et", name: "Eyetwitch", type: "Creature — Eye", mana: "{B}",
  power: 1, toughness: 1, oracle: "Flying\nWhen this creature dies, learn." };

describe("the clause maps onto the atom the printed wording already produces", () => {
  it("⭐ 'Learn.' yields EXACTLY the atom of 'You may discard a card. If you do, draw a card.'", () => {
    // Pinned against each other so the alias can never drift from the wording it stands in for.
    const printed = parseEffectProgram({ id: "c-w", name: "Wording", type: "Instant", mana: "{U}",
      oracle: "You may discard a card. If you do, draw a card." });
    expect(learnClauseParser("Learn.")).toEqual(printed.atoms[0]);
  });

  it("the atom is an OPTIONAL payment — declining stays legal", () => {
    const a = learnClauseParser("Learn.");
    expect(a.op).toBe("optional-discard-payment");
    expect(a.effectAtoms).toEqual([{ op: "draw", amount: 1, targetType: null }]);
  });

  it("⛔ whole-clause anchored — 'learn' inside other text never matches", () => {
    expect(learnClauseParser("Learn two cards.")).toBeNull();
    expect(learnClauseParser("Lesson")).toBeNull();
    expect(learnClauseParser("You have learned much.")).toBeNull();
  });
});

describe("one clause parser reaches every carrier lane", () => {
  it("a SPELL keeps its own effect and gains the learn atom after it", () => {
    expect(classifyCard(IGNEOUS_INSPIRATION)).toBe("native-spell");
    expect((parseEffectProgram(IGNEOUS_INSPIRATION).atoms || []).map((a) => a.op))
      .toEqual(["deal-damage", "optional-discard-payment"]);
  });

  it("ETB and DIES triggers pick it up with no per-lane work", () => {
    expect(classifyCard(PROFESSOR_OF_SYMBOLOGY)).toBe("native-trigger");
    expect(classifyCard(EYETWITCH)).toBe("native-trigger");
  });

  it("an EQUIPMENT enters-trigger and a SACRIFICE-activated ability reach it too", () => {
    expect(classifyCard({ id: "c-pq", name: "Poet's Quill", type: "Artifact — Equipment", mana: "{2}",
      oracle: "When this Equipment enters, learn.\nEquipped creature gets +1/+1 and has lifelink.\nEquip {2}" })).toBe("native-equipment");
    expect(classifyCard({ id: "c-oa", name: "Overgrown Arch", type: "Creature — Plant Wall", mana: "{1}{G}",
      power: 0, toughness: 5, oracle: "Defender\n{T}: You gain 1 life.\n{2}, Sacrifice this creature: Learn." })).toBe("native-activated");
  });

  it("⛔ an UNMODELED sibling line still parks the card (the alias adds no permission)", () => {
    expect(classifyCard({ ...IGNEOUS_INSPIRATION, id: "c-x", name: "Odd Inspiration",
      oracle: "Interpret the omens however you like.\nLearn." })).toBe("arbiter-spell");
  });
});
