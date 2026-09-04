/**
 * recurringInsight.test.js — SHELF-85 runbook Phase 2 · K9 (2026-09-04): Recurring Insight (Kellan).
 *
 *   "Draw cards equal to the number of cards in target opponent's hand.
 *    Rebound"
 *
 * The TD-1 (tapped-count draw) shape one count over: the CONTROLLER draws, the chosen opponent target only supplies the
 * count — countForSpec's cardsInTargetOpponentHand, the live hand length at resolution (CR 608.2h). Rebound was already
 * modeled (castModifiers — the self-exile on resolution + the next-upkeep free recast); this slice adds only the count.
 *
 * Mutation-checked 3/3 killed (arm removed; the count read off the controller's hand; an absent target fabricating 1). A
 * fourth candidate — widening the arm's subject to "your hand" — was an EQUIVALENT mutant and was deleted, not ignored:
 * the older cardsInHand arm claims that sentence before this arm runs, so the widening is unobservable by any test.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { countForSpec } from "./effects/atoms/shared.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const INSIGHT = { id: "c-ri", name: "Recurring Insight", type: "Sorcery", mana: "{4}{U}{U}", keywords: ["Rebound"],
  oracle: "Draw cards equal to the number of cards in target opponent's hand.\nRebound (If you cast this spell from your hand, exile it as it resolves. At the beginning of your next upkeep, you may cast this card from exile without paying its mana cost.)" };
const island = (id) => createPermanent({ id, card: { id: "card-" + id, name: "Island", type: "Basic Land — Island", oracle: "({T}: Add {U}.)" }, controller: "user" });
const filler = (id) => ({ id, name: "Filler " + id, type: "Creature — Bear", oracle: "", power: 2, toughness: 2 });
const lib = (n, tag) => Array.from({ length: n }, (_, i) => filler(tag + i));

const board = (oppHand) => {
  let s = createGameState({ userDeck: lib(10, "u"), aiDeck: lib(10, "a") });
  s = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 8,
    players: { ...s.players,
      user: { ...s.players.user, hand: [INSIGHT], battlefield: [island("I1"), island("I2"), island("I3"), island("I4"), island("I5"), island("I6")] },
      ai: { ...s.players.ai, hand: lib(oppHand, "h") } } };
  return s;
};
const castIt = (s) => {
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "c-ri");
  expect(act).toBeTruthy();
  expect(act.targets?.[0]?.id).toBe("ai");
  s = dispatchAction(s, act);
  while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
  return s;
};

describe("parse", () => {
  it("the draw is the controller's, sized by the target opponent's hand", () => {
    const r = parseEffectClause("Draw cards equal to the number of cards in target opponent's hand.", "Sorcery");
    expect(programConfidence(r)).toBe("high");
    expect(r.atoms).toEqual([{ op: "draw", who: "controller", targetType: "opponent", amountCount: { kind: "cardsInTargetOpponentHand" } }]);
    // A scaled variant the anchored arm must not swallow (the "your hand" and "each opponent … their hand" siblings are
    // older arms' and parse on their own — not this arm's business).
    expect(programConfidence(parseEffectClause("Draw cards equal to twice the number of cards in target opponent's hand.", "Sorcery"))).toBe("low");
  });
});

describe("runtime", () => {
  it("the count is the target's LIVE hand length; an absent target reads 0", () => {
    const s = board(4);
    expect(countForSpec(s, { targets: [{ type: "player", id: "ai" }] }, { kind: "cardsInTargetOpponentHand" })).toBe(4);
    expect(countForSpec(s, { targets: [{ type: "player", id: "nobody" }] }, { kind: "cardsInTargetOpponentHand" })).toBe(0);
    expect(countForSpec(s, { targets: [] }, { kind: "cardsInTargetOpponentHand" })).toBe(0);
  });
  it("cast against a 4-card hand: you draw 4; the spell rebounds to exile instead of the graveyard", () => {
    let s = board(4);
    s = castIt(s);
    expect(s.players.user.hand.length).toBe(4); // the Insight left the hand (1 → 0), then four drawn
    expect(s.players.ai.hand.length).toBe(4); // the opponent drew nothing
    expect(s.players.user.exile.some((c) => c.id === "c-ri")).toBe(true);
    expect(s.players.user.graveyard.some((c) => c.id === "c-ri")).toBe(false);
  });
  it("cast against an empty hand: you draw nothing", () => {
    let s = board(0);
    s = castIt(s);
    expect(s.players.user.hand.length).toBe(0);
  });
});

describe("classifier", () => {
  it("Recurring Insight is a native spell", () => {
    expect(classifyCard(INSIGHT)).toBe("native-spell");
  });
});
