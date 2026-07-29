/**
 * selfPowerThreshold.test.js — "if THIS CREATURE has power N or greater" in the condition vocabulary.
 *
 * The board-wide form ("you control a creature with power N or greater") already existed; this is the SELF
 * referent, resolved through the same `context.sourcePermanentId` the tapped-check uses.
 *
 * ⭐ LAYER-AWARE ON PURPOSE. `creaturePower(perm, state)` is the live reader, so counters and pumps count.
 * That is the whole point on the card that sent me here — Level Up DOUBLES its counters and then asks whether
 * it got big enough. A printed-power read would answer about a creature that no longer exists.
 *
 * ⚠️ SCOPE, stated honestly: this lands the CONDITION. It is reachable today through the INTERVENING-IF path
 * (pinned below, both directions). It does NOT yet complete Level Up, whose clause is an ATOM-level trailing
 * condition inside a compound — both parser arms that attach an atom `condition` gate on
 * `spellConditionParseable`, which by design probes with an EMPTY context and so cannot admit a
 * source-dependent condition. That gate is the last blocker and is banked in the ledger; it is a parser
 * plumbing question (a trigger clause supplies a source, a spell clause does not, and the parser currently
 * cannot tell them apart), NOT a gap in this vocabulary.
 *
 * FN-SAFE BY CONSTRUCTION: a missing referent or a source that has left the battlefield returns null, not
 * false — "can't confirm" skips the effect, where false would be a confident wrong answer.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const COND = "this creature has power 10 or greater";

function boardWithPower(power, { counters = 0 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const perm = {
    ...createPermanent({ id: "m", card: { id: "m", name: "Big", type: "Creature — Bear", power, toughness: 2, oracle: "" }, controller: "user" }),
    ...(counters ? { counters: { "+1/+1": counters } } : {}),
  };
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [perm] } } };
}
const evalCond = (state, cond = COND) => evaluateInterveningIf(state, cond, "user", { sourcePermanentId: "m" });

describe("the condition is in the vocabulary", () => {
  it("both the explicit and pronoun forms are parseable", () => {
    expect(interveningIfParseable(COND)).toBe(true);
    expect(interveningIfParseable("it has power 10 or greater")).toBe(true);
  });

  it("⭐ it answers in BOTH directions — not just the true branch", () => {
    expect(evalCond(boardWithPower(12))).toBe(true);
    expect(evalCond(boardWithPower(3))).toBe(false);
    // The boundary: "10 or greater" includes exactly 10.
    expect(evalCond(boardWithPower(10))).toBe(true);
    expect(evalCond(boardWithPower(9))).toBe(false);
  });

  it("⭐ LAYER-AWARE — +1/+1 counters count toward the threshold", () => {
    // A printed-power read would say false here. This is the case Level Up's doubling produces.
    expect(evalCond(boardWithPower(2, { counters: 8 }))).toBe(true);
    expect(evalCond(boardWithPower(2, { counters: 3 }))).toBe(false);
  });

  it("⛔ CREED — no referent, or a source that LEFT, is null (can't confirm), never false", () => {
    // null and false differ: null skips the effect as unconfirmable; false would be a confident answer.
    expect(evaluateInterveningIf(boardWithPower(12), COND, "user", {})).toBeNull();
    expect(evaluateInterveningIf(boardWithPower(12), COND, "user", { sourcePermanentId: "gone" })).toBeNull();
  });
});

describe("⭐ the live consumer — an INTERVENING-IF trigger", () => {
  const CARD = { name: "Test Threshold", type: "Creature — Bear", mana: "{2}{G}", power: 2, toughness: 2, oracle: "Whenever this creature attacks, if this creature has power 10 or greater, draw a card." };

  it("the trigger carries the condition and the card classifies native", () => {
    const [t] = detectTriggers(CARD);
    expect(t).toMatchObject({ event: "attacks", interveningIf: COND });
    expect(classifyCard(CARD)).toBe("native-trigger");
  });
});
