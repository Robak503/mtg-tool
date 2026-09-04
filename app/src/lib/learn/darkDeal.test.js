/**
 * darkDeal.test.js — SHELF-85 runbook Phase 2 · N10 (2026-09-04): Dark Deal + Incendiary Command's wheel mode (Nekusar).
 *
 *   Dark Deal — "Each player discards all the cards in their hand, then draws that many cards minus one."
 *   Incendiary Command (mode) — "Each player discards all the cards in their hand, then draws that many cards."
 *
 * "that many" is each player's OWN discarded count, so the ", then" split severed the draw from its referent. The
 * splitter keeps the sentence whole; hand.js emits Tolarian Winds' composite for EVERY seat (discard-hand-draw-same,
 * who:"eachPlayer", `minus` 0|1): each count is read before any discard, every hand is pitched through the shared
 * each-player discard-all (discard watchers fire), then each player draws their own count less `minus`, floored at zero.
 * Wheel and Deal ("any number of target opponents each discard …") is a different lane and stays parked.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { splitClauses } from "./effects/splitClauses.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const DARK_DEAL = { id: "c-dd", name: "Dark Deal", type: "Sorcery", mana: "{2}{B}", cmc: 3, keywords: [], oracle: "Each player discards all the cards in their hand, then draws that many cards minus one." };
const COMMAND = { id: "c-ic", name: "Incendiary Command", type: "Sorcery", mana: "{3}{R}{R}", cmc: 5, keywords: [],
  oracle: "Choose two —\n• Incendiary Command deals 4 damage to target player or planeswalker.\n• Incendiary Command deals 2 damage to each creature.\n• Destroy target nonbasic land.\n• Each player discards all the cards in their hand, then draws that many cards." };
const WHEEL_AND_DEAL = { id: "c-wd", name: "Wheel and Deal", type: "Instant", mana: "{3}{U}", cmc: 4, keywords: [], oracle: "Any number of target opponents each discard their hands, then draw seven cards.\nDraw a card." };

const card = (id, name = "Filler") => ({ id, name, type: "Instant", mana: "{U}", cmc: 1, oracle: "Draw a card." });
const lib = (pid, n) => Array.from({ length: n }, (_, i) => card(`${pid}-lib-${i}`, "Swamp"));
const swamp = (id) => createPermanent({ id, card: { id: "card-" + id, name: "Swamp", type: "Basic Land — Swamp", oracle: "{T}: Add {B}." }, controller: "user" });

function board({ aiHand = 2 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 5,
    players: { ...s.players,
      user: { ...s.players.user, battlefield: [swamp("S1"), swamp("S2"), swamp("S3")], hand: [{ ...DARK_DEAL, id: "dd-hand" }, card("u-h1"), card("u-h2"), card("u-h3")], library: lib("user", 6), graveyard: [] },
      ai: { ...s.players.ai, hand: Array.from({ length: aiHand }, (_, i) => card(`a-h${i}`)), library: lib("ai", 6), graveyard: [] } } };
}

describe("parse", () => {
  it("the each-player wheel by own count, with and without the minus one", () => {
    expect(splitClauses(DARK_DEAL.oracle)).toHaveLength(1);
    const r = parseEffectClause(DARK_DEAL.oracle, "Sorcery");
    expect(programConfidence(r)).toBe("high");
    expect(r.atoms).toEqual([{ op: "discard-hand-draw-same", who: "eachPlayer", minus: 1, targetType: null }]);
    const m = parseEffectClause(COMMAND.oracle, "Sorcery");
    expect(programConfidence(m)).toBe("high");
    expect(m.modal.chooseCount).toBe(2);
    expect(m.modal.modes[3].atoms).toEqual([{ op: "discard-hand-draw-same", who: "eachPlayer", minus: 0, targetType: null }]);
  });
  it("seen-to-fail: 'minus two' and the targeted-opponents form are not this arm", () => {
    expect(parseEffectClause("Each player discards all the cards in their hand, then draws that many cards minus two.", "Sorcery").atoms).toEqual([]);
    expect(programConfidence(parseEffectClause(WHEEL_AND_DEAL.oracle, "Instant"))).toBe("low");
  });
});

describe("runtime — Dark Deal", () => {
  it("each player pitches their hand and draws that many minus one; the caster's own count excludes the spell itself", () => {
    let s = board();
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "dd-hand");
    expect(cast).toBeTruthy();
    s = dispatchAction(s, cast);
    while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
    // user: 3 cards discarded → draws 2; ai: 2 discarded → draws 1
    expect(s.players.user.hand).toHaveLength(2);
    expect(s.players.ai.hand).toHaveLength(1);
    expect(s.players.user.hand.every((c) => c.name === "Swamp")).toBe(true);
    expect(s.players.ai.hand.every((c) => c.name === "Swamp")).toBe(true);
    expect(s.players.user.library).toHaveLength(4);
    expect(s.players.ai.library).toHaveLength(5);
    expect(s.players.user.graveyard.map((c) => c.id).sort()).toEqual(["dd-hand", "u-h1", "u-h2", "u-h3"]);
    expect(s.players.ai.graveyard.map((c) => c.id).sort()).toEqual(["a-h0", "a-h1"]);
  });
  it("an empty opposing hand discards nothing and draws nothing (the minus floors at zero)", () => {
    let s = board({ aiHand: 0 });
    s = dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "dd-hand"));
    while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
    expect(s.players.ai.hand).toHaveLength(0);
    expect(s.players.ai.library).toHaveLength(6);
    expect(s.players.user.hand).toHaveLength(2);
  });
});

describe("classifier", () => {
  it("Dark Deal and Incendiary Command are native spells; Wheel and Deal stays arbiter", () => {
    expect(classifyCard(DARK_DEAL)).toBe("native-spell");
    expect(classifyCard(COMMAND)).toBe("native-spell");
    expect(classifyCard(WHEEL_AND_DEAL)).toBe("arbiter-spell");
  });
});
