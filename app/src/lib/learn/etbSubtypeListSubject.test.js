/**
 * etbSubtypeListSubject.test.js — the UNION list on an ETB trigger subject
 * ("Whenever a Mutant, Ninja, or Turtle you control enters, investigate." — April O'Neil, Live on the Scene,
 * a SHELF card in Halfshell heroes; Valley Mightcaller; Moria Marauder).
 *
 * ⭐ THE LIST WAS ALREADY SAYABLE ON THE `dies` SIBLING, twenty lines away in the same file, through the same
 * `parseSubtypeList` helper and into the same `subtypeFilter` descriptor field — and `subtypeFilterMatches`
 * has always accepted a string OR an array, matching ANY member. Only the ETB arm still read a single
 * `[a-z]{3,}`, so the identical printed sentence fired on death and was invisible on entry. The regex is now
 * the dies arm's, verbatim except for the trailing verb.
 *
 * ⛔ WHY THE RUNTIME ASSERTIONS BELOW ARE NOT OPTIONAL HERE, more than anywhere else in this run. The failure
 * mode this file's own header warns about is the VACUOUS FILTER: a subtypeFilter no printed card can satisfy
 * makes the card classify NATIVE while the trigger fires ZERO times — and that is INVISIBLE to the per-card
 * tier diff, because nothing moves (the card is native before and after). Two live instances have already
 * shipped that way in this engine (Norn's Choirmaster, Keleth). A parse-only test would reproduce the bug
 * exactly. So every member of the list is fired on a real board.
 *
 * `probe-vacuous-subtype-filters.mjs` was run after this change per the instruction in triggers.js:
 * 35,364 cards walked, 383 filters minted, 0 vacuous.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { detectTriggers, checkEnterTriggers } from "./triggers.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const APRIL = {
  name: "April O'Neil, Live on the Scene",
  type: "Legendary Creature — Human Citizen",
  mana: "{1}{W}",
  power: 2, toughness: 2,
  oracle: "Whenever a Mutant, Ninja, or Turtle you control enters, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")",
};

const descriptorOf = (card) => detectTriggers(card).find((t) => t.subtypeFilter !== undefined);

const boardWith = (sourceCard) => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const src = createPermanent({ id: "src", controller: "user", card: sourceCard });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [src] } } };
};
// Enter `type` under `controller` and report whether the source's ETB trigger fired.
//
// ⚠️ `checkEnterTriggers` RETURNS THE NEXT STATE, not a list of fired triggers, and the firing signal is
// `state.pendingTriggers`. The first version of this helper read the return value as an array and reported
// "did not fire" for EVERYTHING — including the single-subtype form that has been native for months. The
// four negative assertions below all passed against that broken harness, because nothing firing satisfies
// "should not fire" perfectly. ⭐ The POSITIVE CONTROL is what exposed it: running the already-working
// single-subtype card through the same helper and finding it silent too. A harness that reports no signal is
// indistinguishable from an engine that produces no signal, until you make it show you one it must have.
const firesFor = (sourceCard, type, controller = "user") => {
  const st = boardWith(sourceCard);
  const entering = createPermanent({ id: "new", controller, card: { id: "new", name: "Newcomer", type } });
  const bf = st.players[controller].battlefield;
  const withNew = {
    ...st,
    players: { ...st.players, [controller]: { ...st.players[controller], battlefield: [...bf, entering] } },
  };
  return (checkEnterTriggers(withNew, entering).pendingTriggers || []).length > 0;
};

describe("parse — the list reaches the descriptor as an ARRAY", () => {
  it("⭐ all three subtypes, capitalized, in one filter", () => {
    expect(descriptorOf(APRIL).subtypeFilter).toEqual(["Mutant", "Ninja", "Turtle"]);
  });

  it("⭐ April O'Neil classifies native", () => {
    expect(isNativeTier(classifyCard(APRIL))).toBe(true);
  });

  it("⛔ a SINGLE subtype still yields a bare STRING — byte-identical to the old shape", () => {
    const one = { ...APRIL, oracle: "Whenever a Turtle you control enters, investigate." };
    expect(descriptorOf(one).subtypeFilter).toBe("Turtle");
  });

  it('⭐ the list rides the "ANOTHER" determiner too — Valley Mightcaller', () => {
    // Found by auditing an UNDERSHOOT: the slice predicted 3 flips and delivered 1. The measurement had
    // swapped every list for a single subtype and asked "does the card flip", which proves the list is the
    // blocker but NOT that this arm is where the list lives. Valley Mightcaller's is behind "another", and
    // Moria Marauder's is a combat-damage subject — three different constructions of one shape.
    // ⭐ Measure per CONSTRUCTION, not per shape.
    const va = { ...APRIL, oracle: "Whenever another Frog, Rabbit, Raccoon, or Squirrel you control enters, investigate." };
    expect(descriptorOf(va).subtypeFilter).toEqual(["Frog", "Rabbit", "Raccoon", "Squirrel"]);
    expect(descriptorOf(va).scope).toBe("otherSubtypeYouControl");
  });

  it('⛔ "another <Subtype>" single-word form is unchanged, denylist still applied', () => {
    const one = { ...APRIL, oracle: "Whenever another Goblin you control enters, investigate." };
    expect(descriptorOf(one).subtypeFilter).toBe("Goblin");
    // "another creature you control" must NOT mint a subtype filter — it has its own non-subtype scope.
    const cre = { ...APRIL, oracle: "Whenever another creature you control enters, investigate." };
    expect(descriptorOf(cre)).toBeUndefined();
    expect(isNativeTier(classifyCard(cre))).toBe(true);   // still native, via the creature scope
  });

  it('⛔ a card-TYPE word inside an "another" list parks it', () => {
    const bad = { ...APRIL, oracle: "Whenever another Frog or creature you control enters, investigate." };
    expect(descriptorOf(bad)).toBeUndefined();
    expect(isNativeTier(classifyCard(bad))).toBe(false);
  });
});

describe("⛔ RUNTIME — the trigger fires for EVERY member, not just the first", () => {
  it("⭐⭐ POSITIVE CONTROL — the single-subtype form, native for months, fires through this same helper", () => {
    // RULE 1b, kept as a permanent fixture rather than a one-off check: before believing any negative result
    // below, prove the harness can produce a positive one. This assertion is the reason the whole file is
    // trustworthy, and it is the assertion that caught the broken helper.
    const one = { ...APRIL, oracle: "Whenever a Mutant you control enters, investigate." };
    expect(firesFor(one, "Creature — Mutant")).toBe(true);
  });

  it("⭐ Mutant fires", () => expect(firesFor(APRIL, "Creature — Mutant")).toBe(true));
  it("⭐ Ninja fires (the MIDDLE element — a first-only bug passes the Mutant case)", () =>
    expect(firesFor(APRIL, "Creature — Ninja")).toBe(true));
  it("⭐ Turtle fires (the LAST element — a truncated list passes both earlier cases)", () =>
    expect(firesFor(APRIL, "Creature — Turtle")).toBe(true));

  it("⛔ a creature on NO member of the list does not fire it", () => {
    expect(firesFor(APRIL, "Creature — Bear")).toBe(false);
  });

  it("⛔ and it is YOU-CONTROL scoped — an opponent's Turtle does not fire it", () => {
    expect(firesFor(APRIL, "Creature — Turtle", "ai")).toBe(false);
  });

  it("⛔⭐ THE VACUOUS-FILTER GUARD: the filter is satisfiable at all", () => {
    // The named failure mode of this whole family — a gate no printed card matches leaves the card NATIVE and
    // the trigger firing zero times, which no tier diff can see. If every assertion above were deleted, this
    // one line is the minimum that still distinguishes a working filter from a decorative one.
    expect(firesFor(APRIL, "Creature — Mutant Ninja Turtle")).toBe(true);
  });
});

describe("⛔ CREED — a card-TYPE word anywhere in the list parks the whole trigger", () => {
  const parks = (oracle) => {
    const card = { ...APRIL, oracle };
    expect(descriptorOf(card)).toBeUndefined();
    expect(isNativeTier(classifyCard(card))).toBe(false);
  };

  it("⛔ 'creature or token' — both would match every permanent (an over-fire)", () => {
    parks("Whenever a creature or token you control enters, investigate.");
  });

  it("⛔ 'permanent or artifact'", () => {
    parks("Whenever a permanent or artifact you control enters, investigate.");
  });

  it("⛔⭐ ONE bad element poisons the whole list — a real subtype beside a card type still parks", () => {
    // All-or-nothing. Honoring the Mutant half and dropping "creature" would fire on a strict subset of the
    // printed text while the card read native — the same silent under-delivery the static list arm guards.
    parks("Whenever a Mutant or creature you control enters, investigate.");
  });
});
