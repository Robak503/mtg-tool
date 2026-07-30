/**
 * globalBoardEmptyInterveningIf.test.js — the GLOBAL board-empty intervening-if (CR 603.4 + 400.1).
 *
 * "At the beginning of the end step, if no creatures are on the battlefield, sacrifice this enchantment."
 * (Pyrohemia, Pestilence — the shared blocker on Colton's cdh shelf deck.)
 *
 * ⭐ AN AXIS FIX. Every other piece already worked, verified by probe before a line was written:
 *     end-step trigger + plain effect                        -> native-trigger
 *     end-step + self-sacrifice, no condition                -> native-trigger
 *     end-step + "if YOU CONTROL no creatures" + self-sac     -> native-trigger   <-- the sibling
 *     end-step + "if no creatures are ON THE BATTLEFIELD"     -> body-only        <-- the gap
 * The controller-scoped predicate existed; the GLOBAL one did not. So the fix is a scope widening over the
 * same parseFilter / permMatchesFilter vocabulary — no new machinery.
 *
 * ⛔ AND THE SCOPE IS THE ENTIRE RISK. The battlefield is a SHARED zone (CR 400.1): "no creatures are on the
 * battlefield" asks about EVERY seat. A controller-only read would sacrifice Pyrohemia while an opponent's
 * creature is still out — a confident wrong answer, which is worse than parking the card. That is why the
 * opponent-creature case below is the load-bearing test rather than a nicety.
 */
import { describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";

const ENCHANT = { name: "Pyro", type: "Enchantment", mana: "{2}{R}" };
const LINE = "At the beginning of the end step, if no creatures are on the battlefield, sacrifice this enchantment.";

const CREATURE = (id) => ({ id, card: { name: id, type: "Creature — Bear" } });
const LAND = (id) => ({ id, card: { name: id, type: "Land" } });
const ZOMBIE = (id) => ({ id, card: { name: id, type: "Creature — Zombie" } });
const board = (mine, theirs = []) => ({
  players: {
    me: { battlefield: mine, life: 40, hand: [], graveyard: [] },
    opp: { battlefield: theirs, life: 40, hand: [], graveyard: [] },
  },
});
const evalEmpty = (state, cond = "no creatures are on the battlefield") => evaluateInterveningIf(state, cond, "me");

describe("⭐ the condition is READ, so the trigger classifies native", () => {
  it("the printed Pyrohemia / Pestilence line is native", () => {
    expect(isNativeTier(classifyCard({ ...ENCHANT, oracle: LINE }))).toBe(true);
  });

  it("⛔ and the SIBLING it was modelled on is untouched (regression pin)", () => {
    // "you control no creatures" already worked; a careless edit to the shared parseFilter path would break
    // it. Asserted as a PAIR with the global form so a regression in either direction shows up here.
    const controllerScoped = "At the beginning of the end step, if you control no creatures, sacrifice this enchantment.";
    expect(isNativeTier(classifyCard({ ...ENCHANT, oracle: controllerScoped }))).toBe(true);
    expect(isNativeTier(classifyCard({ ...ENCHANT, oracle: LINE }))).toBe(true);
  });

  it("both printed spellings are parseable", () => {
    expect(interveningIfParseable("no creatures are on the battlefield")).toBe(true);
    expect(interveningIfParseable("there are no zombies on the battlefield")).toBe(true);
  });
});

describe("⛔⭐ SHARED-ZONE SCOPE (CR 400.1) — the forbidden-FP guard", () => {
  it("empty battlefield everywhere → the condition holds", () => {
    expect(evalEmpty(board([], []))).toBe(true);
  });

  it("MY creature on the battlefield → false", () => {
    expect(evalEmpty(board([CREATURE("mine")], []))).toBe(false);
  });

  it("⛔⭐ an OPPONENT's creature on the battlefield → FALSE (a controller-only read would say true)", () => {
    // THE test. Read controllerBoard instead of every seat and this is the one assertion that fails: the
    // engine would sacrifice Pyrohemia with an opposing creature still out — doing something the card
    // forbids, the direction THE CREED rules out entirely.
    expect(evalEmpty(board([], [CREATURE("theirs")]))).toBe(false);
  });

  it("creatures on BOTH sides → false", () => {
    expect(evalEmpty(board([CREATURE("mine")], [CREATURE("theirs")]))).toBe(false);
  });

  it("only non-matching permanents anywhere → true (the filter is honoured, not ignored)", () => {
    expect(evalEmpty(board([LAND("l1")], [LAND("l2")]))).toBe(true);
  });

  it("the subtype form scopes to the subtype, on either side of the table", () => {
    const cond = "there are no zombies on the battlefield";
    expect(evalEmpty(board([], []), cond)).toBe(true);
    expect(evalEmpty(board([CREATURE("bear")], []), cond)).toBe(true);      // a Bear is not a Zombie
    expect(evalEmpty(board([], [ZOMBIE("z")]), cond)).toBe(false);          // an opponent's Zombie counts
    expect(evalEmpty(board([ZOMBIE("z")], []), cond)).toBe(false);
  });
});

describe("⛔ CREED — an unreadable filter refuses instead of guessing", () => {
  it("a DESIGNATION is not a type line word, so the condition stays unparseable", () => {
    // "commander" is a designation, not a card type (NON_TYPE_WORDS). A \bCommander\b type-line scan would
    // silently count zero and report the condition TRUE — a fabricated answer. It must refuse.
    expect(interveningIfParseable("no commanders are on the battlefield")).toBe(false);
    expect(evalEmpty(board([], []), "no commanders are on the battlefield")).toBe(null);
  });

  it("a controller who has left the game evaluates false, never fail-open", () => {
    expect(evaluateInterveningIf(board([], []), "no creatures are on the battlefield", "ghost")).toBe(false);
  });
});
