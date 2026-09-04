/**
 * nekusarUnless.test.js — SHELF-85 runbook Phase 2 · N6 + N7 (2026-09-04): Painful Quandary + Phyrexian Tyranny (Nekusar).
 *
 *   N7 Phyrexian Tyranny — "Whenever a player draws a card, that player loses 2 life unless they pay {2}." The Rhystic
 *      Study pause (taxed-payment) aimed at the DRAWING seat, with the decline landing on the PAYER as life loss
 *      (declinePayoff "loseLife" / declineAmount) instead of on the beneficiary as a draw. Every seat is hit, the
 *      controller included. The AI pays iff it can afford the tax (the lane's policy).
 *   N6 Painful Quandary — "Whenever an opponent casts a spell, that player loses 5 life unless they discard a card."
 *      The optional-discard-payment pause aimed at the CASTING seat with a decline penalty (declineLoseLife): declining,
 *      or holding no card, costs that player 5. The AI discards iff it can (the lane's policy).
 *   Isolation Cell graduates with N7 (an opponent's creature spell → "loses 2 life unless they pay {2}").
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { detectTriggers } from "./triggers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { applyDrawEffect } from "./spellEffects.js";
import { resolveTaxedPaymentChoice, resolveOptionalDiscardPaymentChoice, resolveDiscardChoice, autoPickTaxedPayment, autoPickOptionalDiscard } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const TYRANNY = { id: "c-pt", name: "Phyrexian Tyranny", type: "Enchantment", mana: "{U}{B}{R}", cmc: 3, keywords: [], oracle: "Whenever a player draws a card, that player loses 2 life unless they pay {2}." };
const QUANDARY = { id: "c-pq", name: "Painful Quandary", type: "Enchantment", mana: "{3}{B}{B}", cmc: 5, keywords: [], oracle: "Whenever an opponent casts a spell, that player loses 5 life unless they discard a card." };
const CELL = { id: "c-ic", name: "Isolation Cell", type: "Artifact", mana: "{4}", cmc: 4, keywords: [], oracle: "Whenever an opponent casts a creature spell, that player loses 2 life unless they pay {2}." };

const lib = (pid, n) => Array.from({ length: n }, (_, i) => ({ id: `${pid}-lib-${i}`, name: "Island", type: "Basic Land — Island", oracle: "{T}: Add {U}." }));
const island = (id, ctrl) => createPermanent({ id, card: { id: "card-" + id, name: "Island", type: "Basic Land — Island", oracle: "{T}: Add {U}." }, controller: ctrl });
const resolveAll = (s) => { while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s); return s; };

describe("parse", () => {
  it("Tyranny: the drawing player pays {2} or loses 2 (every seat); Quandary: the casting opponent discards or loses 5", () => {
    const t = detectTriggers(TYRANNY)[0];
    expect(t.event).toBe("cardDrawn");
    expect(parseEffectClause(t.effectClause, "Enchantment").atoms).toEqual([{ op: "taxed-lose-life", amount: 2, cost: { kind: "mana", mana: { generic: 2, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } }, who: "drawingPlayer", targetType: null }]);
    const q = detectTriggers(QUANDARY)[0];
    expect(q.event).toBe("cast");
    expect(parseEffectClause(q.effectClause, "Enchantment").atoms).toEqual([{ op: "lose-life-unless-discard", amount: 5, who: "castingPlayer", targetType: null }]);
  });
  it("seen-to-fail: an un-rewritten 'that player' and an {X} tax stay low", () => {
    expect(programConfidence(parseEffectClause("That player loses 2 life unless they pay {2}.", "Enchantment"))).toBe("low");
    expect(programConfidence(parseEffectClause("The drawing player loses 2 life unless they pay {X}.", "Enchantment"))).toBe("low");
  });
});

describe("N7 — Phyrexian Tyranny at runtime", () => {
  function board() {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, turn: 4, activePlayer: "ai", priorityHolder: "ai", phase: "precombat-main", step: "main", consecutivePasses: 0,
      players: { ...s.players,
        user: { ...s.players.user, life: 40, battlefield: [createPermanent({ id: "PT", card: TYRANNY, controller: "user" }), island("U1", "user"), island("U2", "user")], library: lib("user", 3), hand: [] },
        ai: { ...s.players.ai, life: 40, battlefield: [island("A1", "ai")], library: lib("ai", 3), hand: [] } } };
  }
  it("the AI draws: the pause is the AI's; it can't afford {2} on one Island, so the policy declines and the AI loses 2", () => {
    let s = board();
    s = applyDrawEffect(s, { controller: "ai", amount: 1 });
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    s = resolveAll(s);
    expect(s.pendingChoice).toMatchObject({ kind: "taxed-payment", controller: "ai", payer: "ai", beneficiary: "user", declinePayoff: "loseLife", declineAmount: 2 });
    expect(autoPickTaxedPayment(s, s.pendingChoice)).toBe(false);
    s = resolveTaxedPaymentChoice(s, false);
    expect(s.players.ai.life).toBe(38);
    expect(s.players.user.life).toBe(40);
    expect(s.players.user.hand).toHaveLength(0); // the beneficiary draws NOTHING on this lane
  });
  it("the CONTROLLER draws too: its own pause; paying {2} from two Islands keeps the life", () => {
    let s = board();
    s = applyDrawEffect(s, { controller: "user", amount: 1 });
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    s = resolveAll(s);
    expect(s.pendingChoice).toMatchObject({ kind: "taxed-payment", controller: "user", payer: "user" });
    expect(autoPickTaxedPayment(s, s.pendingChoice)).toBe(true);
    s = resolveTaxedPaymentChoice(s, true);
    expect(s.players.user.life).toBe(40);
    expect(s.players.user.battlefield.filter((p) => p.tapped)).toHaveLength(2);
  });
});

describe("N6 — Painful Quandary at runtime", () => {
  function board({ aiHand }) {
    const bear = { id: "ai-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, oracle: "" };
    const forest = (id) => createPermanent({ id, card: { id: "card-" + id, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "ai" });
    let s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, turn: 4, activePlayer: "ai", priorityHolder: "ai", phase: "precombat-main", step: "main", consecutivePasses: 0,
      players: { ...s.players,
        user: { ...s.players.user, life: 40, battlefield: [createPermanent({ id: "PQ", card: QUANDARY, controller: "user" })], library: lib("user", 3), hand: [] },
        ai: { ...s.players.ai, life: 40, battlefield: [forest("F1"), forest("F2")], hand: [bear, ...aiHand], library: lib("ai", 3), graveyard: [] } } };
  }
  const castBear = (s) => { const a = legalActionsForPlayer(s, "ai").find((x) => x.kind === "cast-spell" && x.cardId === "ai-bear"); expect(a).toBeTruthy(); return dispatchAction(s, a); };
  it("the AI casts with a card in hand: the pause is the AI's; the policy discards; the discard settles and no life is lost", () => {
    let s = board({ aiHand: [{ id: "ai-extra", name: "Opt", type: "Instant", mana: "{U}", cmc: 1, oracle: "Scry 1. Draw a card." }] });
    s = castBear(s);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    s = resolveAll(s);
    expect(s.pendingChoice).toMatchObject({ kind: "optional-discard-payment", controller: "ai", available: true, declineLoseLife: 5 });
    expect(autoPickOptionalDiscard(s, s.pendingChoice)).toBe(true);
    s = resolveOptionalDiscardPaymentChoice(s, true);
    if (s.pendingChoice?.kind === "discard") s = resolveDiscardChoice(s, ["ai-extra"]);
    s = resolveAll(s);
    expect(s.players.ai.graveyard.some((c) => c.id === "ai-extra")).toBe(true);
    expect(s.players.ai.life).toBe(40);
  });
  it("the AI casts its last card: no card to pitch, the pause still surfaces, the decline costs 5", () => {
    let s = board({ aiHand: [] });
    s = castBear(s);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    s = resolveAll(s);
    expect(s.pendingChoice).toMatchObject({ kind: "optional-discard-payment", controller: "ai", available: false, declineLoseLife: 5 });
    expect(autoPickOptionalDiscard(s, s.pendingChoice)).toBe(false);
    s = resolveOptionalDiscardPaymentChoice(s, false);
    s = resolveAll(s);
    expect(s.players.ai.life).toBe(35);
    expect(s.players.ai.battlefield.some((p) => p.card?.name === "Grizzly Bears")).toBe(true);
  });
});

describe("classifier", () => {
  it("Phyrexian Tyranny, Painful Quandary and Isolation Cell are native-trigger", () => {
    expect(classifyCard(TYRANNY)).toBe("native-trigger");
    expect(classifyCard(QUANDARY)).toBe("native-trigger");
    expect(classifyCard(CELL)).toBe("native-trigger");
  });
});
