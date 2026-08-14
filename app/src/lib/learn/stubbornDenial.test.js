/**
 * stubbornDenial.test.js — FEROCIOUS HARD-COUNTER UPGRADE (2026-08-14). Stubborn Denial: "Counter
 * target noncreature spell unless its controller pays {1}. Ferocious — If you control a creature with
 * power 4 or greater, counter that spell instead."
 *
 * ⭐ ONE ATOM, ONE GATE: the ordinary soft counter + hardIfCondition, evaluated by applyCounter at
 * resolution through the SAME spell-readable vocabulary the parser's spellConditionParseable gate
 * vouched (the condition is a pure board read — a resolving spell can answer it). CR 608.2's
 * "instead": the condition TRUE replaces the pay-choice with an outright counter; anything else keeps
 * the printed BASE (soft) behavior — never a fabricated upgrade.
 *
 * Whole-card audit: the card IS these two sentences.
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK; scripts throw on no-op):
 *   · the fold arm disabled -> Stubborn Denial parks.
 *   · the hardUpgrade gate removed from applyCounter -> the ferocious board still gets the pay-choice
 *     (the ⭐⭐ witness dies).
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-14).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { parseEffectProgram } from "./effects/parser.js";
import { _resetIdsForTests, createGameState, createPermanent, createStackObject } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ORACLE = "Counter target noncreature spell unless its controller pays {1}.\nFerocious — If you control a creature with power 4 or greater, counter that spell instead.";
const DENIAL = { id: "c-sd", name: "Stubborn Denial", type: "Instant", mana: "{U}", oracle: ORACLE };

function board({ power = null } = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const spell = createStackObject({
    id: "stk-t", kind: "spell", controller: "ai1", targets: [],
    source: { id: "card-t", name: "Big Sorcery", type: "Sorcery", cmc: 4, oracle: "" },
    payload: { resolver: "manual", params: {} },
  });
  const bf = power == null ? [] : [createPermanent({ id: "F", controller: "user", summoningSick: false,
    card: { id: "card-F", name: "Ferocious One", type: "Creature — Beast", power: String(power), toughness: "4", oracle: "" } })];
  return { ...g, stack: [spell], players: { ...g.players, user: { ...g.players.user, battlefield: bf } } };
}
const atomOf = () => parseEffectProgram(DENIAL, "Instant").atoms[0];
const resolve = (s) => ATOM_RESOLVERS.counter(s, atomOf(), { controller: "user", targets: [{ type: "spell", id: "stk-t" }], cardName: "Stubborn Denial" });

describe("the carrier and the shape", () => {
  it("⭐ Stubborn Denial flips; one atom carries the soft counter + the ferocious upgrade", () => {
    expect(classifyCard(DENIAL)).toBe("native-spell");
    expect(atomOf()).toMatchObject({ op: "counter", spellFilter: "noncreature", targetType: "spell", unlessPay: 1,
      hardIfCondition: "you control a creature with power 4 or greater" });
  });
});

describe("⭐⭐ LAW 6 — ferocious upgrades to HARD; the base stays SOFT; the threshold is exact", () => {
  it("⭐⭐ a 4-power creature out: countered OUTRIGHT — no pay-choice offered", () => {
    const after = resolve(board({ power: 4 }));
    const row = { stack: after.stack.length, pendingChoice: !!after.pendingChoice };
    console.log("  WITNESS denialHard", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ stack: 0, pendingChoice: false });
  });

  it("⛔ NO big creature: the printed SOFT counter — the pay-choice pends, the spell waits", () => {
    const after = resolve(board({}));
    const row = { stack: after.stack.length, pendingChoice: !!after.pendingChoice };
    console.log("  WITNESS denialSoft", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ stack: 1, pendingChoice: true });
  });

  it("⛔ a 3-power creature does NOT upgrade (the threshold is exactly four)", () => {
    const after = resolve(board({ power: 3 }));
    expect(after.stack.length).toBe(1);
    expect(!!after.pendingChoice).toBe(true);
  });
});
