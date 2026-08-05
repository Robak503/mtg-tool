/**
 * fixedTypeRevealToHand.test.js — "Reveal the top four cards of your library. Put all GOBLIN cards revealed
 * this way into your hand and the rest on the bottom of your library in any order." (Goblin Ringleader,
 * Sylvan Messenger, Kavu Howler, Grave Defiler, Enlistment Officer, Merfolk Wayfinder, Elder Pine of Jukai,
 * Tidal Courier, Lair Delve).
 *
 * ⭐ THE RESOLVER WAS ALREADY BUILT, for the CHOOSE-a-type twin (For the Ancestors). Everything it does is
 * identical here — reveal the top N, move every match to hand, bottom the rest — and only the SOURCE of the
 * type differs: this cycle NAMES the type instead of choosing one. So the atom carries `fixedType` and the
 * resolver skips its maximizing pick; nothing else changed. Sixth slice in a row on the same lens: find the
 * built engine with no ignition.
 *
 * ⭐ CHANGELING IS TAKEN FOR A NAMED TYPE (CR 702.73a) and that falls out for free: `cardHasChosenType` is
 * the same changeling-aware eligibility test the chosen-type twin uses, so riding that resolver gets the
 * rule right rather than reimplementing it. Pinned, because a hand-rolled filter would have missed it.
 *
 * ⛔ "IN ANY ORDER" RESOLVES AS THE RANDOM BOTTOMING THE RESOLVER ALREADY DOES, and that is faithful rather
 * than a shortcut: the rest go to the BOTTOM of the library either way, and the controller's ordering of
 * cards they cannot see again before drawing them is not an observable difference. The chosen-type twin
 * prints "in a random order" and shares the path.
 *
 * Mutation-checked (2026-08-05, grep-verified as applied AND verified on the case under test — the clause
 * was parsed directly and yielded [] before the suite was read): the matcher disabled -> every pin red; the
 * `fixedType` branch removed from the resolver -> the named-type rows go red as the maximizing pick takes
 * over and hands back the WRONG type.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CLAUSE = "Reveal the top four cards of your library. Put all Goblin cards revealed this way into your hand and the rest on the bottom of your library in any order.";
const GOBLIN_RINGLEADER = { id: "c-gr", name: "Goblin Ringleader", type: "Creature — Goblin", mana: "{3}{R}",
  power: 2, toughness: 2, oracle: `Haste\nWhen this creature enters, ${CLAUSE.charAt(0).toLowerCase()}${CLAUSE.slice(1)}` };
const SYLVAN_MESSENGER = { id: "c-sm", name: "Sylvan Messenger", type: "Creature — Elf Warrior", mana: "{2}{G}{G}",
  power: 2, toughness: 2, oracle: "Trample\nWhen this creature enters, reveal the top four cards of your library. Put all Elf cards revealed this way into your hand and the rest on the bottom of your library in any order." };

const gob = (i) => ({ id: `g${i}`, name: `Goblin ${i}`, type: "Creature — Goblin", oracle: "", power: 1, toughness: 1 });
const bear = (i) => ({ id: `o${i}`, name: `Bear ${i}`, type: "Creature — Bear", oracle: "", power: 2, toughness: 2 });
const changeling = (i) => ({ id: `c${i}`, name: `Shapeshifter ${i}`, type: "Creature — Shapeshifter", oracle: "Changeling", keywords: ["changeling"], power: 2, toughness: 2 });

/** Resolve the clause over `library` and report what reached hand. */
function reveal(library) {
  const prog = parseEffectClause(CLAUSE, "Creature");
  const b = createGameState({ userDeck: [], aiDeck: [] });
  const s = { ...b, players: { ...b.players, user: { ...b.players.user, library, hand: [] } } };
  const r = runEffectProgram(s, { id: "so", source: { name: "Goblin Ringleader" },
    payload: { params: { program: prog, controller: "user", targets: [], sourceId: "gr" } } });
  const st = r?.state || r;
  return { hand: (st.players.user.hand || []).map((c) => c.name), lib: (st.players.user.library || []).length };
}

describe("parse", () => {
  it("⭐ rides the chosen-type resolver, carrying the NAMED type", () => {
    expect(parseEffectClause(CLAUSE, "Creature").atoms)
      .toEqual([{ op: "chosen-type-reveal-to-hand", amount: 4, fixedType: "Goblin", targetType: null }]);
  });

  it("the carriers flip", () => {
    expect(classifyCard(GOBLIN_RINGLEADER)).toBe("native-trigger");
    expect(classifyCard(SYLVAN_MESSENGER)).toBe("native-trigger");
  });

  it("⛔ the CHOOSE-a-type twin keeps its own atom, with no fixedType", () => {
    const [a] = parseEffectClause("Choose a creature type. Look at the top five cards of your library. You may reveal any number of cards of the chosen type from among them and put the revealed cards into your hand. Put the rest on the bottom of your library in a random order.", "Sorcery").atoms || [];
    expect(a.op).toBe("chosen-type-reveal-to-hand");
    expect(a.fixedType).toBeUndefined();
  });

  it("⛔ a rider leaves residue and drops to the Arbiter, never a partial", () => {
    expect(classifyCard({ ...GOBLIN_RINGLEADER, id: "c-x", name: "Odd Ringleader",
      oracle: "When this creature enters, reveal the top four cards of your library. Put all Goblin cards revealed this way into your hand and the rest into your graveyard." })).toBe("body-only");
  });
});

describe("⭐ LAW 6 — resolved against a real library", () => {
  it("takes EVERY match and bottoms the rest", () => {
    const r = reveal([gob(1), bear(1), gob(2), bear(2)]);
    expect(r.hand).toEqual(["Goblin 1", "Goblin 2"]);
    expect(r.lib).toBe(2);
  });

  it("⛔ takes nothing when no revealed card matches, and the library is intact", () => {
    const r = reveal([bear(1), bear(2), bear(3), bear(4)]);
    expect(r.hand).toEqual([]);
    expect(r.lib).toBe(4);
  });

  it("⭐ a CHANGELING is taken for the named type (CR 702.73a) — free from riding the shared test", () => {
    const r = reveal([changeling(1), bear(1), bear(2), bear(3)]);
    expect(r.hand).toEqual(["Shapeshifter 1"]);
  });

  it("a library shorter than the reveal count is handled, not over-read", () => {
    const r = reveal([gob(1), bear(1)]);
    expect(r.hand).toEqual(["Goblin 1"]);
    expect(r.lib).toBe(1);
  });
});
