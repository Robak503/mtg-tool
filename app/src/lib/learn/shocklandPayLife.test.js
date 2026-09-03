/**
 * shocklandPayLife.test.js — LANDS-TIER slice 2 (2026-09-03): THE SHOCKLAND CLAUSE, "As this land enters,
 * you may pay 2 life. If you don't, it enters tapped." (CR 614.1c replacement + CR 119.4 life payment). Ten
 * corpus shocklands; Cap America's three (Sacred Foundry / Hallowed Fountain / Steam Vents) — one arm.
 *
 * TWO ENTER SITES, ONE READER, TWO DECISION MODES:
 *   • play-land path (actionDispatcher) — the land is already on the battlefield UNTAPPED when the clause is
 *     read; a controller who can pay gets a REAL pending choice (`optional-life-payment`: human picker / AI
 *     auto-policy), a controller who can't (life < N, CR 119.4) has no choice: tapped, no pause.
 *   • tutor site (resolvers.enterPermanent) — runs inside an effect's resolution where no land-entry pause
 *     has a resume seam, so the WRITTEN policy (autoPickOptionalLifePayment: pay iff life ≥ 10) decides for
 *     every seat, and a decision to pay is CHARGED then and there. An untapped shockland with no life charged
 *     is the fabricated-effect false positive this file exists to forbid.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03): the mana ability is REMINDER
 * text on a shockland (the basic land types carry it), so the printed rules text is the clause alone.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { enterPermanent } from "./resolvers.js";
import { resolveOptionalLifePaymentChoice } from "./effects/runProgram.js";
import { paysLifeOrEntersTapped, autoPickOptionalLifePayment } from "./landEntersTapped.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SHOCK_TEXT = "({T}: Add {R} or {W}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped.";
const SACRED_FOUNDRY = { id: "c-sacredfoundry", name: "Sacred Foundry", type: "Land — Mountain Plains", oracle: SHOCK_TEXT };
const STEAM_VENTS = { id: "c-steamvents", name: "Steam Vents", type: "Land — Island Mountain", oracle: "({T}: Add {U} or {R}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped." };
// Probes — NOT real cards; each differs from the printed clause by exactly one thing the reader must refuse.
const RIDER = { id: "c-rider", name: "Probe Rider", type: "Land — Mountain Plains", oracle: "As this land enters, you may pay 2 life. If you don't, it enters tapped. When it enters untapped, draw a card." };
const OTHER_SUBJECT = { id: "c-subj", name: "Probe Subject", type: "Land", oracle: "As this permanent enters, you may pay 2 life. If you don't, it enters tapped.\n{T}: Add {C}." };
const NOT_A_SHOCK = { id: "c-plain", name: "Probe Plain", type: "Land — Mountain Plains", oracle: "({T}: Add {R} or {W}.)\nThis land enters tapped." };

const twoSeat = () => createGameState({ userDeck: [], aiDeck: [] });
const withLife = (state, life) => ({ ...state, players: { ...state.players, user: { ...state.players.user, life } } });

/** Play `card` via the real play-land action at `life`; returns { state, perm }. */
function playLand(state, card, life) {
  const st = {
    ...withLife(state, life), phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...state.players, user: { ...state.players.user, life, hand: [{ ...card, id: "L" }], battlefield: [], landsPlayedThisTurn: 0 } },
  };
  const out = dispatchAction(st, { kind: "play-land", playerId: "user", cardId: "L" });
  const perm = out.players.user.battlefield.find((x) => x.card?.name === card.name);
  if (!perm) throw new Error("land did not enter");
  return { state: out, perm };
}
const bfPerm = (state, name) => state.players.user.battlefield.find((p) => p.card.name === name);

describe("the reader — exactly the printed clause, nothing looser", () => {
  it("reads the real shockland text as { life: 2 }", () => {
    expect(paysLifeOrEntersTapped(SACRED_FOUNDRY)).toEqual({ life: 2 });
    expect(paysLifeOrEntersTapped(STEAM_VENTS)).toEqual({ life: 2 });
  });

  it("⛔ refuses a rider, a different subject, and a plain enters-tapped land", () => {
    expect(paysLifeOrEntersTapped(RIDER)).toBe(null);          // the sentence pair is not alone on its line
    expect(paysLifeOrEntersTapped(OTHER_SUBJECT)).toBe(null);  // "this permanent" is not the printed subject
    expect(paysLifeOrEntersTapped(NOT_A_SHOCK)).toBe(null);    // no "pay N life" at all
  });
});

describe("the written auto-policy — pay iff life ≥ 10 (and ≥ the cost)", () => {
  it("pays at 20 and at exactly 10, declines at 9, and refuses a null / zero cost", () => {
    expect(autoPickOptionalLifePayment(withLife(twoSeat(), 20), "user", 2)).toBe(true);
    expect(autoPickOptionalLifePayment(withLife(twoSeat(), 10), "user", 2)).toBe(true);
    expect(autoPickOptionalLifePayment(withLife(twoSeat(), 9), "user", 2)).toBe(false);
    expect(autoPickOptionalLifePayment(withLife(twoSeat(), 20), "user", 0)).toBe(false);
    expect(autoPickOptionalLifePayment(withLife(twoSeat(), 20), "nobody", 2)).toBe(false);
  });
});

describe("play-land path — a REAL pending choice, then pay-or-tap", () => {
  it("at 20 life the land enters untapped with an optional-life-payment choice pending (nothing else may act)", () => {
    const { state, perm } = playLand(twoSeat(), SACRED_FOUNDRY, 20);
    expect(perm.tapped).toBe(false);
    expect(state.pendingChoice).toMatchObject({ kind: "optional-life-payment", controller: "user", permanentId: perm.id, life: 2, sourceName: "Sacred Foundry" });
    expect(state.players.user.life).toBe(20); // nothing charged until the choice is made
  });

  it("PAY: life is charged (20 → 18) and the land stays untapped; the choice clears", () => {
    const { state, perm } = playLand(twoSeat(), SACRED_FOUNDRY, 20);
    const after = resolveOptionalLifePaymentChoice(state, true);
    expect(after.pendingChoice).toBeFalsy();
    expect(after.players.user.life).toBe(18);
    expect(bfPerm(after, "Sacred Foundry").tapped).toBe(false);
    expect(after.log.some((e) => e.effect === "optional-life-payment" && e.paid === true && e.amount === 2 && e.permanentId === perm.id)).toBe(true);
  });

  it("DECLINE: the land is tapped and life is untouched", () => {
    const { state } = playLand(twoSeat(), SACRED_FOUNDRY, 20);
    const after = resolveOptionalLifePaymentChoice(state, false);
    expect(after.pendingChoice).toBeFalsy();
    expect(after.players.user.life).toBe(20);
    expect(bfPerm(after, "Sacred Foundry").tapped).toBe(true);
  });

  it("⛔ CR 119.4: at 1 life there is NO choice — the land enters tapped, no pause, life untouched", () => {
    const { state, perm } = playLand(twoSeat(), SACRED_FOUNDRY, 1);
    expect(perm.tapped).toBe(true);
    expect(state.pendingChoice).toBeFalsy();
    expect(state.players.user.life).toBe(1);
  });

  it("⛔ a 'pay' answer the player cannot cover never goes negative: it taps instead", () => {
    // The choice was raised at 2 life (affordable), then life dropped before the answer — the resolver
    // re-checks and taps rather than fabricating a payment below zero.
    const { state } = playLand(twoSeat(), SACRED_FOUNDRY, 2);
    const starved = withLife(state, 1);
    const after = resolveOptionalLifePaymentChoice(starved, true);
    expect(after.players.user.life).toBe(1);
    expect(bfPerm(after, "Sacred Foundry").tapped).toBe(true);
  });

  it("a non-shock land raises no choice (the arm is inert elsewhere)", () => {
    const { state, perm } = playLand(twoSeat(), NOT_A_SHOCK, 20);
    expect(perm.tapped).toBe(true); // its own plain enters-tapped
    expect(state.pendingChoice).toBeFalsy();
  });
});

describe("tutor site — resolvers.enterPermanent applies the written policy AND charges the life", () => {
  it("⭐ at 20 life: untapped AND life 18 — the two halves are never separable", () => {
    const after = enterPermanent(withLife(twoSeat(), 20), SACRED_FOUNDRY, "user");
    expect(bfPerm(after, "Sacred Foundry").tapped).toBe(false);
    expect(after.players.user.life).toBe(18);
    expect(after.log.some((e) => e.effect === "optional-life-payment" && e.paid === true && e.auto === true)).toBe(true);
  });

  it("at 9 life the policy declines: tapped, life untouched, no pending choice", () => {
    const after = enterPermanent(withLife(twoSeat(), 9), SACRED_FOUNDRY, "user");
    expect(bfPerm(after, "Sacred Foundry").tapped).toBe(true);
    expect(after.players.user.life).toBe(9);
    expect(after.pendingChoice).toBeFalsy();
  });
});

describe("the classifier — the shock line is credited only through the same reader", () => {
  it("the real shocklands flip to `land`; the rider / other-subject probes stay land-partial", () => {
    expect(classifyCard(SACRED_FOUNDRY)).toBe("land");
    expect(classifyCard(STEAM_VENTS)).toBe("land");
    expect(classifyCard(RIDER)).toBe("land-partial");
    expect(classifyCard(OTHER_SUBJECT)).toBe("land-partial");
  });
});
