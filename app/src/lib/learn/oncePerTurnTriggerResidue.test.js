/**
 * oncePerTurnTriggerResidue.test.js — "This ability triggers only once each turn." (M1a's residue half).
 *
 * The same class as the token ability-grant fix, found by the same scan: every trigger on the card ROUTES
 * natively, there is no activated text to blame, and `permanentTriggersCovered` still says no — so the only
 * thing rejecting it is the residue strip, which was never taught this sentence.
 *
 * detectTriggers ALREADY consumes this wording: it sets `descriptor.oncePerTurnTrigger` and leaves the
 * effect clause clean ("scry 1", not "scry 1. This ability triggers…"). Only the residue check was blind,
 * because the trigger-sentence strip stops at the first period.
 *
 * WHY STRIPPING IT IS HONEST, and this is the part that had to be checked rather than assumed: the runtime
 * genuinely ENFORCES the restriction. gameEngine's flush chokepoint keys a per-source, per-event ledger
 * (`state.onceTriggersFiredThisTurn`, cleared each untap step) and DROPS a second same-turn firing. A
 * frequency rider stripped WITHOUT enforcement would credit a trigger that fires every time — the exact
 * over-credit the activated-ability `activationLimit` is careful about. The runtime test below asserts the
 * drop, not just the flag.
 *
 * NOTED IN PASSING, not fixed here: the sibling wording "Do this only once each turn." does NOT set the
 * flag — detectTriggers leaves it inside the effect clause. A comment in permanentTriggersCovered implies
 * otherwise. That is a separate and larger gap (it needs the detector taught, not just the residue strip),
 * and it is recorded in the ledger rather than guessed at here.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { enterPermanent } from "./resolvers.js";

const RIDER = "This ability triggers only once each turn.";
const card = (oracle, over = {}) => ({
  name: "Sentinel", type: "Creature — Human Soldier", mana: "{2}{U}", power: "2", toughness: "2", keywords: [], oracle, ...over,
});

describe("the detector already handled this — only the residue check was blind", () => {
  it("sets oncePerTurnTrigger and leaves the effect clause clean", () => {
    const d = detectTriggers(card(`Whenever you cast a noncreature spell, scry 1. ${RIDER}`))[0];
    expect(d.oncePerTurnTrigger).toBe(true);
    expect(d.effectClause).toBe("scry 1");
  });

  it("…and the card now classifies native instead of parking on the rider", () => {
    expect(classifyCard(card(`Whenever you cast a noncreature spell, scry 1. ${RIDER}`))).toMatch(/^native/);
  });

  it("without the rider the card was always native (the rider was the only difference)", () => {
    expect(classifyCard(card("Whenever you cast a noncreature spell, scry 1."))).toMatch(/^native/);
  });

  it("a real carrier's shape flips (Mary Jane Watson)", () => {
    expect(classifyCard(card(`Whenever a Spider you control enters, draw a card. ${RIDER}`))).toMatch(/^native/);
  });
});

describe("RUNTIME — the restriction is genuinely ENFORCED, which is what licenses the strip", () => {
  /** Two separate ETB events in ONE turn for a watcher with the once-per-turn draw trigger. */
  function twoEntersOneTurn() {
    _resetIdsForTests();
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const watcher = createPermanent({
      id: "w",
      card: { id: "c-w", name: "Watcher", type: "Creature — Human", power: 2, toughness: 2, oracle: `Whenever another creature you control enters, draw a card. ${RIDER}` },
      controller: "user", summoningSick: false,
    });
    let s = {
      ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: {
        ...s0.players,
        user: { ...s0.players.user, battlefield: [watcher], hand: [], library: Array.from({ length: 10 }, (_, i) => ({ id: `lib${i}`, name: `Card${i}`, type: "Sorcery" })) },
      },
    };
    const drain = () => { let g = 0; s = flushTriggers(s, { chooseTargets: chooseTriggerTargets }); while ((s.stack || []).length && g++ < 20) s = resolveTopOfStack(s); };
    // enterPermanent is what actually RAISES the ETB event — pushing onto the battlefield array fires
    // nothing, which is how the first draft of this test measured zero and briefly looked like a bug.
    const enter = (id) => {
      s = enterPermanent(s, { id: `c-${id}`, name: id, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, "user");
      drain();
    };
    enter("a");
    const afterFirst = s.players.user.hand.length;
    enter("b");
    return { afterFirst, afterSecond: s.players.user.hand.length };
  }

  it("fires on the FIRST event and is DROPPED on the second within the same turn", () => {
    const { afterFirst, afterSecond } = twoEntersOneTurn();
    expect(afterFirst).toBe(1);   // first creature entering drew a card
    expect(afterSecond).toBe(1);  // second did NOT — the once-per-turn ledger latched
  });
});

describe("CREED", () => {
  it("an unmodeled sibling clause still parks the whole card", () => {
    expect(classifyCard(card(`Whenever you cast a noncreature spell, scry 1. ${RIDER}\nEach opponent glorbulates.`))).not.toMatch(/^native/);
  });

  it("an unmodeled trigger EFFECT still parks it — the rider does not rescue anything", () => {
    expect(classifyCard(card(`Whenever you cast a noncreature spell, glorbulate twice. ${RIDER}`))).not.toMatch(/^native/);
  });
});
