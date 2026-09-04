/**
 * startingTown.test.js — SHELF-85 runbook V2 (2026-09-04): Starting Town, the one land four sub-85 shelf decks
 * share (Teval, Kellan, Shalai, Otharri).
 *
 *   "This land enters tapped unless it's your first, second, or third turn of the game.
 *    {T}: Add {C}.
 *    {T}, Pay 1 life: Add one mana of any color."
 *
 * Three honest halves, each with its own runtime seam:
 *   ① THE TURN ORDINAL. `player.turnsTaken` is stamped at the untap step (resetTurnCounters, the same place the
 *      per-turn counters reset — extra turns count, CR 500.7) and the intervening-if vocabulary reads the printed
 *      condition off it. Both enter sites already go through conditionalEntersTapped (lands slice 1), so the gate
 *      is live the moment the vocabulary can read the line.
 *   ② THE PAY-LIFE EXTRA LINE. EXTRA_MANA_LINE_RE used to refuse "{T}, Pay N life: Add one mana of any color."
 *      on purpose, because the extra-record push did not carry riders — a free any-colour tap was the forbidden
 *      direction. The push now carries `payLife` and is gated on life exactly like a main product, so the line is
 *      an honest extra record: offered only while the life is there, and actually paid when spent.
 *   ③ THE HONEST MAIN. The whole-card merge reads the pay-life cost off the FIRST add line ("{T}: Add {C}." — no
 *      cost) and so produced a FREE any-colour main once the pay-life line counted as an extra. A pay-life line is
 *      now always an unsafe merge partner: the plain line is the main, the pay-life line rides as the extra.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, resetTurnCounters, _resetIdsForTests } from "./gameState.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { entersTappedUnlessCondition, conditionalEntersTapped } from "./landEntersTapped.js";
import { manaProduction, extraManaLineProducts, manaSources, planPayment, commitPaymentPlan } from "./manaModel.js";
import { parseManaCost } from "./legalChoices.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const STARTING_TOWN = {
  id: "c-startingtown", name: "Starting Town", type: "Land — Town", keywords: [],
  oracle: "This land enters tapped unless it's your first, second, or third turn of the game.\n{T}: Add {C}.\n{T}, Pay 1 life: Add one mana of any color.",
};
const CONDITION = "it's your first, second, or third turn of the game";

function baseState() {
  return createGameState({ userDeck: [], aiDeck: [] });
}
function withTown(state, { life = 40 } = {}) {
  const town = { ...createPermanent({ id: "town", card: STARTING_TOWN, controller: "user" }), summoningSick: false, enteredOnTurn: 1 };
  return { ...state, turn: 3, players: { ...state.players, user: { ...state.players.user, life, battlefield: [town] } } };
}
function afterTurns(state, playerId, n) {
  let s = state;
  for (let i = 0; i < n; i++) s = resetTurnCounters(s, { playerId });
  return s;
}

describe("① the turn ordinal — 'it's your first, second, or third turn of the game'", () => {
  it("the reader admits the printed line and the vocabulary can evaluate it", () => {
    expect(entersTappedUnlessCondition(STARTING_TOWN)).toBe(CONDITION);
    expect(interveningIfParseable(CONDITION)).toBe(true);
  });

  it("turnsTaken is stamped per seat at the untap step and only for the seat whose turn it is", () => {
    const s0 = baseState();
    expect(s0.players.user.turnsTaken || 0).toBe(0);
    const s = afterTurns(afterTurns(s0, "user", 2), "ai", 1);
    expect(s.players.user.turnsTaken).toBe(2);
    expect(s.players.ai.turnsTaken).toBe(1);
  });

  it("holds through the controller's third turn and fails from the fourth", () => {
    const s0 = baseState();
    expect(evaluateInterveningIf(afterTurns(s0, "user", 1), CONDITION, "user")).toBe(true);
    expect(evaluateInterveningIf(afterTurns(s0, "user", 3), CONDITION, "user")).toBe(true);
    expect(evaluateInterveningIf(afterTurns(s0, "user", 4), CONDITION, "user")).toBe(false);
    // The OPPONENT's fourth turn is not the controller's: the read is per seat.
    expect(evaluateInterveningIf(afterTurns(s0, "ai", 4), CONDITION, "user")).toBe(true);
  });

  it("conditionalEntersTapped: untapped on turns 1–3, tapped from turn 4", () => {
    const s0 = baseState();
    expect(conditionalEntersTapped(afterTurns(s0, "user", 1), STARTING_TOWN, "user")).toBe(false);
    expect(conditionalEntersTapped(afterTurns(s0, "user", 3), STARTING_TOWN, "user")).toBe(false);
    expect(conditionalEntersTapped(afterTurns(s0, "user", 4), STARTING_TOWN, "user")).toBe(true);
    expect(conditionalEntersTapped(afterTurns(s0, "user", 9), STARTING_TOWN, "user")).toBe(true);
  });
});

describe("② + ③ the two mana lines — a free {C} main and a pay-life any-colour extra", () => {
  it("the main product is the plain {C} line, never the free any-colour merge", () => {
    const main = manaProduction(STARTING_TOWN);
    expect(main.colors).toEqual(["C"]);
    expect(main.payLife).toBeUndefined();
  });

  it("the pay-life line rides as an extra record carrying its cost", () => {
    const extras = extraManaLineProducts(STARTING_TOWN, manaProduction(STARTING_TOWN));
    expect(extras).toHaveLength(1);
    expect(extras[0].colors).toEqual(["W", "U", "B", "R", "G"]);
    expect(extras[0].payLife).toBe(1);
  });

  it("manaSources offers both records while the life is there; only {C} at 1 life", () => {
    const rich = manaSources(withTown(baseState(), { life: 40 }), "user");
    expect(rich).toHaveLength(2);
    const plain = rich.find((s) => !s.extraLine);
    const paid = rich.find((s) => s.extraLine);
    expect(plain.colors).toEqual(["C"]);
    expect(plain.payLife).toBeUndefined();
    expect(paid.colors).toEqual(["W", "U", "B", "R", "G"]);
    expect(paid.payLife).toBe(1);

    const poor = manaSources(withTown(baseState(), { life: 1 }), "user");
    expect(poor).toHaveLength(1);
    expect(poor[0].colors).toEqual(["C"]);
  });

  it("paying {G} through the pay-life line taps the Town and costs exactly 1 life", () => {
    const s = withTown(baseState(), { life: 40 });
    const plan = planPayment(s.players.user.manaPool, manaSources(s, "user"), parseManaCost("{G}"));
    expect(plan).toBeTruthy();
    const after = commitPaymentPlan(s, "user", plan);
    expect(after.players.user.life).toBe(39);
    expect(after.players.user.battlefield[0].tapped).toBe(true);
  });

  it("paying {C} takes the free line: no life lost", () => {
    const s = withTown(baseState(), { life: 40 });
    const plan = planPayment(s.players.user.manaPool, manaSources(s, "user"), parseManaCost("{C}"));
    expect(plan).toBeTruthy();
    const after = commitPaymentPlan(s, "user", plan);
    expect(after.players.user.life).toBe(40);
    expect(after.players.user.battlefield[0].tapped).toBe(true);
  });

  it("the classifier credits the whole card as `land`", () => {
    expect(classifyCard(STARTING_TOWN)).toBe("land");
  });
});
