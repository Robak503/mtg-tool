/**
 * proftsEideticMemory.test.js — SHELF-85 runbook V5 (2026-09-04): Proft's Eidetic Memory (Brago · Nekusar) and the
 * unplanned twin the flip-diff surfaced, Thundering Djinn.
 *
 *   Proft's:  "When Proft's Eidetic Memory enters, draw a card.
 *              You have no maximum hand size.
 *              At the beginning of combat on your turn, if you've drawn more than one card this turn, put X +1/+1
 *              counters on target creature you control, where X is the number of cards you've drawn this turn minus one."
 *   Djinn:    "Flying\nWhenever this creature attacks, it deals damage to any target equal to the number of cards
 *              you've drawn this turn."
 *
 * Two vocabulary cells on one ledger — `player.cardsDrawnThisTurn`, stamped at the single draw chokepoint and reset
 * for every seat at untap (the field the "second card each turn" triggers already read):
 *   ① the intervening-if "you've drawn more than one card this turn" (evaluated at flush AND at resolution, CR 603.4),
 *   ② the count source "cards you've drawn this turn [minus one]" read by countForSpec — the printed "minus one"
 *      rides as `minus` and is floored at 0.
 * The combat-begin event, the ETB draw, the no-maximum-hand-size static and the where-X counter arm all existed.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers } from "./triggers.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { parseEffectClause } from "./effects/parser.js";
import { parseCountSource } from "./effects/parseHelpers.js";
import { countForSpec } from "./effects/atoms/shared.js";
import { advanceStep, runStepActions, flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const PROFTS = { id: "c-pem", name: "Proft's Eidetic Memory", type: "Legendary Enchantment", mana: "{1}{U}", keywords: [],
  oracle: "When Proft's Eidetic Memory enters, draw a card.\nYou have no maximum hand size.\nAt the beginning of combat on your turn, if you've drawn more than one card this turn, put X +1/+1 counters on target creature you control, where X is the number of cards you've drawn this turn minus one." };
const DJINN = { id: "c-djinn", name: "Thundering Djinn", type: "Creature — Djinn", mana: "{3}{U}{R}", power: 4, toughness: 3, keywords: ["Flying"],
  oracle: "Flying\nWhenever this creature attacks, it deals damage to any target equal to the number of cards you've drawn this turn." };
const COND = "you've drawn more than one card this turn";
const CLAUSE = "put X +1/+1 counters on target creature you control, where X is the number of cards you've drawn this turn minus one.";

function board(drawn) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const mem = createPermanent({ id: "MEM", card: PROFTS, controller: "user" });
  const bear = createPermanent({ id: "BEAR", card: { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user", summoningSick: false });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 3,
    players: { ...s.players, user: { ...s.players.user, battlefield: [mem, bear], cardsDrawnThisTurn: drawn } },
  };
}
const counters = (s) => s.players.user.battlefield.find((p) => p.id === "BEAR")?.counters?.["+1/+1"] || 0;
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };

describe("① the intervening-if — 'you've drawn more than one card this turn'", () => {
  it("is parseable and reads the controller's own draw tally", () => {
    expect(interveningIfParseable(COND)).toBe(true);
    expect(evaluateInterveningIf(board(0), COND, "user")).toBe(false);
    expect(evaluateInterveningIf(board(1), COND, "user")).toBe(false);
    expect(evaluateInterveningIf(board(2), COND, "user")).toBe(true);
    expect(evaluateInterveningIf(board(5), COND, "user")).toBe(true);
  });
  it("CREED near-miss: a numeric or opponent-scoped variant is not admitted", () => {
    expect(interveningIfParseable("you've drawn three or more cards this turn")).toBe(false);
    expect(interveningIfParseable("an opponent has drawn more than one card this turn")).toBe(false);
  });
  it("detectTriggers carries it on the combat-begin half", () => {
    const d = detectTriggers(PROFTS).find((x) => x.event === "combatBegin");
    expect(d).toMatchObject({ whose: "yours", interveningIf: COND });
  });
});

describe("② the count source — 'cards you've drawn this turn [minus one]'", () => {
  it("parses with and without the printed minus", () => {
    expect(parseCountSource("cards you've drawn this turn minus one")).toEqual({ kind: "cardsDrawnThisTurn", minus: 1 });
    expect(parseCountSource("cards you have drawn this turn")).toEqual({ kind: "cardsDrawnThisTurn" });
    expect(parseCountSource("cards you've drawn this turn minus two")).toBeNull();
  });
  it("the where-X counter clause parses HIGH onto the own-creature target", () => {
    const p = parseEffectClause(CLAUSE, "Enchantment");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "add-counter", counterType: "+1/+1", countFor: { kind: "cardsDrawnThisTurn", minus: 1 }, targetType: "creatureYouControl" }]);
  });
  it("countForSpec reads the tally less the minus, floored at 0", () => {
    const spec = { kind: "cardsDrawnThisTurn", minus: 1 };
    expect(countForSpec(board(3), { controller: "user" }, spec)).toBe(2);
    expect(countForSpec(board(1), { controller: "user" }, spec)).toBe(0);
    expect(countForSpec(board(0), { controller: "user" }, spec)).toBe(0);
    expect(countForSpec(board(3), { controller: "user" }, { kind: "cardsDrawnThisTurn" })).toBe(3);
  });
});

describe("end to end — the engine's beginning of combat", () => {
  it("after three draws this turn, entering combat puts two counters on the Bear", () => {
    let s = runStepActions(advanceStep(board(3)));
    expect(s.step).toBe("beginning-of-combat");
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(counters(s)).toBe(2);
  });
  it("after a single draw (the draw step alone) the gate is closed: nothing goes on the stack", () => {
    let s = runStepActions(advanceStep(board(1)));
    expect(s.step).toBe("beginning-of-combat");
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    expect(s.stack).toHaveLength(0);
    expect(counters(s)).toBe(0);
  });
});

describe("classifier — whole cards", () => {
  it("Proft's Eidetic Memory and Thundering Djinn are native-trigger", () => {
    expect(classifyCard(PROFTS)).toBe("native-trigger");
    expect(classifyCard(DJINN)).toBe("native-trigger");
  });
  it("the Djinn's attack damage counts the same tally", () => {
    const p = parseEffectClause("it deals damage to any target equal to the number of cards you've drawn this turn.", "Creature");
    expect(p.atoms).toEqual([{ op: "deal-damage", targetType: "any", amountCount: { kind: "cardsDrawnThisTurn" } }]);
  });
});
