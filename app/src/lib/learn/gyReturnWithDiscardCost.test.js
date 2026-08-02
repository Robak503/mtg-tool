/**
 * gyReturnWithDiscardCost.test.js — Old One Eye's "Fast Healing": a graveyard-functioning self-return that
 * CHARGES for itself. "At the beginning of your first main phase, you may discard two cards. If you do,
 * return this card from your graveyard to your hand."
 *
 * Third member of the graveyard-functioning family (milled → Infesting Radroach, cast → the Eidolon cycle,
 * and now a step event), and the FIRST that costs something. Four seams, every one an existing pattern:
 *   1. "Fast Healing —" joins the flavour-label strip — NOT a CR 207.2c word, but the trigger is written out
 *      in full after it (verified on the only carrier), the same basis treasure hunter / eukrasia strip on.
 *   2. A firstMain GRAVEYARD SCAN in checkStepTriggers, mirroring the milled and cast scans.
 *   3. A sentinel carrying the COUNT, which becomes an optional-discard-payment atom …
 *   4. … whose payoff is the ordinary gy-self-return-hand atom. So the pause chaining and the actual card
 *      movement are both code that already existed and is already proven.
 *
 * ⭐ THE COST IS THE WHOLE RISK, AND A RUNTIME PROBE CAUGHT IT PAYING SHORT. The offer site gates on having
 * enough cards, but resolveOptionalDiscardPaymentChoice carried its OWN independent check that only required
 * a non-empty hand — so with ONE card in hand the two-card cost "succeeded", the program pitched what it
 * could, and the card came back anyway. A payoff running for an unpaid cost is a fabricated effect. Both
 * gates now count. The one-card case below is the test that would have caught it.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { parseEffectClause } from "./effects/parser.js";
import { resolveDiscardChoice, resolveHandDiscardChoice, resolveOptionalDiscardPaymentChoice } from "./effects/runProgram.js";
import { checkStepTriggers, detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";

beforeEach(() => _resetIdsForTests());

const FAST_HEALING = "Fast Healing — At the beginning of your first main phase, you may discard two cards. If you do, return this card from your graveyard to your hand.";
const OLD_ONE_EYE = {
  id: "cooe", name: "Old One Eye", type: "Legendary Creature — Tyranid", mana: "{5}{G}", power: 6, toughness: 6,
  oracle: `Trample\nOther creatures you control have trample.\nWhen Old One Eye enters, create a 5/5 green Tyranid creature token.\n${FAST_HEALING}`,
};

/** Old One Eye in the graveyard, `handSize` cards in hand; run the first-main trigger. */
function firstMain(handSize, take) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const hand = Array.from({ length: handSize }, (_, i) => ({ id: `h${i}`, name: "Forest", type: "Basic Land — Forest" }));
  let s = {
    ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
    players: { ...s0.players, user: { ...s0.players.user, graveyard: [{ ...OLD_ONE_EYE, id: "gooe" }], hand, library: [] } },
  };
  s = flushTriggers(checkStepTriggers(s, "firstMain"), { chooseTargets: chooseTriggerTargets });
  let guard = 0;
  while (((s.stack || []).length || s.pendingChoice) && guard++ < 15) {
    const pc = s.pendingChoice;
    if (pc) {
      if (pc.kind === "optional-discard-payment") s = resolveOptionalDiscardPaymentChoice(s, take);
      else if (pc.kind === "discard") s = resolveDiscardChoice(s, (s.players.user.hand[0] || {}).id);
      else if (pc.kind === "hand-discard") s = resolveHandDiscardChoice(s, (s.players.user.hand[0] || {}).id);
      else break;
      continue;
    }
    s = resolveTopOfStack(s);
  }
  return {
    returned: s.players.user.hand.some((c) => c.name === "Old One Eye"),
    hand: s.players.user.hand.length,
    graveyard: s.players.user.graveyard.length,
    errors: (s.log || []).filter((l) => l.kind === "stack-resolve-error").length,
  };
}

describe("⭐ it really comes back, and it really pays", () => {
  it("three cards in hand, TAKING it: two are discarded and Old One Eye returns", () => {
    // 3 in hand − 2 discarded + the returned creature = 2.
    expect(firstMain(3, true)).toMatchObject({ returned: true, hand: 2, errors: 0 });
  });

  it("DECLINING costs nothing and returns nothing", () => {
    expect(firstMain(3, false)).toMatchObject({ returned: false, hand: 3, graveyard: 1, errors: 0 });
  });
});

describe("⛔ THE COST GATE — a payoff must never run for a price that was not paid", () => {
  it("⭐ ONE card in hand cannot pay a TWO-card cost — it must NOT return", () => {
    // This exact case shipped broken until a runtime probe caught it: the offer site counted, the resolver
    // only checked for a non-empty hand, so the program pitched one card and returned the creature anyway.
    expect(firstMain(1, true)).toMatchObject({ returned: false, hand: 1, errors: 0 });
  });

  it("an EMPTY hand cannot pay either", () => {
    expect(firstMain(0, true)).toMatchObject({ returned: false, hand: 0, errors: 0 });
  });

  it("⛔ …and the choice is not even OFFERED as payable with too few cards", () => {
    // The two gates are independent and this pins the OUTER one. A mutation loosening the offer-site
    // availability SURVIVED the tests above, because the resolver's own cost check refuses regardless — so
    // what the offer gate actually buys is not presenting a choice the player cannot take. That is a real
    // difference (an offer you can accept and that then does nothing is a bug report), and it is what this
    // asserts. The RULES safety lives in the resolver; do not read this as the gate.
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const mk = (n) => ({
      ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
      players: { ...s0.players, user: { ...s0.players.user, graveyard: [{ ...OLD_ONE_EYE, id: "gooe" }],
        hand: Array.from({ length: n }, (_, i) => ({ id: `h${i}`, name: "Forest", type: "Basic Land — Forest" })), library: [] } },
    });
    const settle = (st) => flushTriggers(checkStepTriggers(st, "firstMain"), { chooseTargets: chooseTriggerTargets });
    let one = settle(mk(1));
    let guard = 0;
    while (!one.pendingChoice && (one.stack || []).length && guard++ < 10) one = resolveTopOfStack(one);
    expect(one.pendingChoice?.kind).toBe("optional-discard-payment");
    expect(one.pendingChoice.available).toBe(false);   // ← the offer gate, pinned
    expect(one.pendingChoice.discardCount).toBe(2);

    let three = settle(mk(3));
    guard = 0;
    while (!three.pendingChoice && (three.stack || []).length && guard++ < 10) three = resolveTopOfStack(three);
    expect(three.pendingChoice.available).toBe(true);  // CONTROL — payable when the cards are there
  });
});

describe("the seams are wired", () => {
  it("the flavour label is stripped, and the trigger is stamped graveyard-functioning", () => {
    const d = detectTriggers(OLD_ONE_EYE).filter((x) => x.functionsFromGraveyard);
    expect(d).toHaveLength(1);
    expect(d[0].event).toBe("firstMain");
    expect(triggerRoutesNatively(d[0])).toBe(true);
  });

  it("the sentinel carries the COUNT and reuses the existing payment + return atoms", () => {
    expect(parseEffectClause("[gy-self-return:hand-discard2] discard two cards then return it to your hand").atoms)
      .toEqual([{ op: "optional-discard-payment", discardCount: 2, effectAtoms: [{ op: "gy-self-return-hand" }], targetType: null }]);
  });

  it("⛔ the sentinel must stay COMMA-FREE — a comma shatters it across splitClauses", () => {
    // The first draft read "…discard two cards, THEN return it…" and parsed to nothing at all, because the
    // clause splitter broke the sentinel in half before the matcher saw it. Pinned so it is not "tidied" back.
    expect(parseEffectClause("[gy-self-return:hand-discard2] discard two cards, then return it to your hand").atoms).toEqual([]);
  });
});

describe("classification", () => {
  it("Old One Eye is native", () => {
    expect(classifyCard(OLD_ONE_EYE)).toMatch(/^native/);
  });

  it("⛔ CREED — an unmodeled sibling clause still parks the card", () => {
    expect(classifyCard({ ...OLD_ONE_EYE, name: "Fake", oracle: `${OLD_ONE_EYE.oracle}\nEach opponent glorbulates at dawn.` })).not.toMatch(/^native/);
  });
});
