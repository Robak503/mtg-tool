/**
 * THE DRAW DOUBLER — "If you would draw a card except the first one you draw in each of your draw steps, draw two cards
 * instead." (Teferi's Ageless Insight · Alhammarret's Archive · Bard, King of Dale). Residue census 2026-09-05: a 3-sole-blocker
 * family, two of them EDHREC-popular, one sentence.
 *
 * CR 614.1 replacement read at the ONE draw chokepoint (gameState.drawCards) off the doublers the drawing player controls
 * (replacementEffects.drawMultiplier); the draw-step site passes `drawStep: true` so the turn-based draw stays a single card.
 * An opponent's draws are untouched. Two such permanents stack (×4), as printed.
 *
 * Mutation-checked: see the run ledger (docs-rg1).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { drawMultiplier } from "./replacementEffects.js";
import { _resetIdsForTests, createGameState, createPermanent, drawCards } from "./gameState.js";
import { applyDrawEffect } from "./spellEffects.js";

beforeEach(() => _resetIdsForTests());

const INSIGHT = { id: "c-tai", name: "Teferi's Ageless Insight", type: "Legendary Enchantment", mana: "{2}{U}{U}", keywords: [],
  oracle: "If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead." };
const ARCHIVE = { id: "c-aa", name: "Alhammarret's Archive", type: "Legendary Artifact", mana: "{5}", keywords: [],
  oracle: "If you would gain life, you gain twice that much life instead.\nIf you would draw a card except the first one you draw in each of your draw steps, draw two cards instead." };
const BARD = { id: "c-bard", name: "Bard, King of Dale", type: "Legendary Creature — Human Noble Archer", mana: "{4}{W}{U}", power: 3, toughness: 4, keywords: ["Reach", "Vigilance"],
  oracle: "Reach, vigilance\nIf you would draw a card except the first one you draw in each of your draw steps, draw two cards instead.\nIf one or more tokens would be created under your control, twice that many of those tokens are created instead." };

const lib = (pid, n) => Array.from({ length: n }, (_, i) => ({ id: `${pid}-l${i}`, name: "Card", type: "Instant", mana: "{U}", oracle: "" }));
function board(doublers) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
    players: { ...s0.players,
      user: { ...s0.players.user, battlefield: doublers.map((c, i) => createPermanent({ id: `d${i}`, card: c, controller: "user" })), library: lib("user", 12), hand: [] },
      ai: { ...s0.players.ai, library: lib("ai", 12), hand: [] } } };
}

describe("the classifier", () => {
  it("the three carriers read native", () => {
    const row = { insight: classifyCard(INSIGHT), archive: classifyCard(ARCHIVE), bard: classifyCard(BARD) };
    console.log("  WITNESS drawDoubler", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    for (const k of Object.keys(row)) expect(row[k], k).toMatch(/^native/);
  });
});

describe("RUNTIME — the chokepoint", () => {
  it("a spell draw of 1 becomes 2 (the count stamp follows); the draw step's first stays 1; a draw of 3 in the draw step is 1 + 2×2; an opponent draws normally; two doublers stack", () => {
    const s = board([INSIGHT]);
    const spell = applyDrawEffect(s, { controller: "user", amount: 1 });
    const step = drawCards(s, { playerId: "user", count: 1, drawStep: true });
    const stepThree = drawCards(s, { playerId: "user", count: 3, drawStep: true });
    const opp = applyDrawEffect(s, { controller: "ai", amount: 1 });
    const two = applyDrawEffect(board([INSIGHT, ARCHIVE]), { controller: "user", amount: 1 });
    const row = { mult: drawMultiplier(s, "user"), spell: spell.players.user.hand.length, spellDrawn: spell.players.user.cardsDrawnThisTurn, step: step.players.user.hand.length, stepThree: stepThree.players.user.hand.length, opp: opp.players.ai.hand.length, two: two.players.user.hand.length };
    console.log("  WITNESS drawDoublerRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ mult: 2, spell: 2, spellDrawn: 2, step: 1, stepThree: 5, opp: 1, two: 4 });
  });
});
