/**
 * sacUnlessDiscardRandom.test.js — "When this creature enters, sacrifice it unless you discard a card at random." (Minotaur
 * Explorer, Pillaging Horde, Balduvian Horde — the 09-06 plan's stage ③, census row ⑦, 2026-09-30).
 *
 * Machinery, both halves: the sac-unless-pay pause (echo, cumulative upkeep, the Masticore cycle's "unless you discard a
 * card") and the random-discard cost kind Apathy's optional payment settles through the seeded pitchRandomDiscard
 * (CR 701.9b). The composition needed three arms, each of which a past slice learned the hard way:
 *   · the matcher: "( at random)?" on the Masticore arm → cost { kind: "discard-random" };
 *   · the SETTLE: its own discard-random branch (a real random discard; an empty hand pays nothing → sacrificed);
 *   · the AUTO-PICK: its own branch — without one, the kind falls through to canAfford(…, {}) which is TRUE for an empty
 *     mana cost, and the AI says "pay" with an empty hand (the Masticore lesson recorded in autoPickSacUnlessPay).
 * The human panel names the cost ("Discard a card at random") — pinned in PendingChoicePanels.test.jsx.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { resolveSacUnlessPayChoice, autoPickSacUnlessPay } from "./effects/runProgram.js";

beforeEach(() => _resetIdsForTests());

const EXPLORER = { id: "mex-c", name: "Minotaur Explorer", type: "Creature — Minotaur Scout", mana: "{1}{R}", power: 3, toughness: 3,
  oracle: "When this creature enters, sacrifice it unless you discard a card at random." };
const PILLAGING = { name: "Pillaging Horde", type: "Creature — Human Barbarian", mana: "{2}{R}{R}", power: 5, toughness: 5,
  oracle: "When this creature enters, sacrifice it unless you discard a card at random." };
const BALDUVIAN = { name: "Balduvian Horde", type: "Creature — Human Barbarian", mana: "{2}{R}{R}", power: 5, toughness: 5,
  oracle: "When this creature enters, sacrifice it unless you discard a card at random." };
const card = (id, name) => ({ id, name, type: "Instant", mana: "{R}", oracle: "Shock deals 2 damage to any target." });

function explorerEnters(hand) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  let s = { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, hand: [EXPLORER, ...hand], manaPool: { ...s0.players.user.manaPool, R: 1, C: 1 } } } };
  const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "mex-c");
  expect(cast).toBeTruthy();
  s = resolveTopOfStack(dispatchAction(s, cast)); // it enters; the ETB goes on the stack
  s = resolveTopOfStack(s); // the ETB resolves → the pay-or-sacrifice pause
  return s;
}
const onBoard = (s) => s.players.user.battlefield.some((p) => p.card?.name === "Minotaur Explorer");

describe("classification + parse", () => {
  it("the three carriers → native-trigger", () => {
    for (const c of [EXPLORER, PILLAGING, BALDUVIAN]) expect(classifyCard(c)).toBe("native-trigger");
  });
  it("'at random' is its own cost kind; the plain discard keeps its own", () => {
    expect(parseEffectClause("sacrifice this permanent unless you discard a card at random").atoms).toEqual([
      { op: "sac-unless-pay", cost: { kind: "discard-random", count: 1 }, targetType: null }]);
    expect(parseEffectClause("sacrifice this creature unless you discard a card").atoms).toEqual([
      { op: "sac-unless-pay", cost: { kind: "discard", count: 1 }, targetType: null }]);
  });
});

describe("RUNTIME — discard at random, or lose the creature", () => {
  it("the pause is the sac-unless-pay choice carrying the random-discard cost", () => {
    const s = explorerEnters([card("h1", "A"), card("h2", "B")]);
    expect(s.pendingChoice).toMatchObject({ kind: "sac-unless-pay", controller: "user", cost: { kind: "discard-random", count: 1 } });
  });

  it("⭐ PAY: exactly one card leaves the hand at random, and the Explorer stays", () => {
    const s = explorerEnters([card("h1", "A"), card("h2", "B"), card("h3", "C")]);
    const out = resolveSacUnlessPayChoice(s, true);
    expect(onBoard(out)).toBe(true);
    expect(out.players.user.hand).toHaveLength(2);
    expect(out.players.user.graveyard).toHaveLength(1);
    console.log(`WITNESS explorerPaid ${JSON.stringify({ onBoard: onBoard(out), hand: out.players.user.hand.length, discarded: out.players.user.graveyard.map((c) => c.name) })}`);
  });

  it("the random pick is SEEDED — the same game state discards the same card (serialize-stable)", () => {
    const a = resolveSacUnlessPayChoice(explorerEnters([card("h1", "A"), card("h2", "B"), card("h3", "C")]), true);
    _resetIdsForTests();
    const b = resolveSacUnlessPayChoice(explorerEnters([card("h1", "A"), card("h2", "B"), card("h3", "C")]), true);
    expect(a.players.user.graveyard.map((c) => c.id)).toEqual(b.players.user.graveyard.map((c) => c.id));
  });

  it("DECLINE: the Explorer is sacrificed and the hand is untouched", () => {
    const s = explorerEnters([card("h1", "A")]);
    const out = resolveSacUnlessPayChoice(s, false);
    expect(onBoard(out)).toBe(false);
    expect(out.players.user.graveyard.map((c) => c.name)).toContain("Minotaur Explorer");
    expect(out.players.user.hand).toHaveLength(1);
  });

  it("⛔ an EMPTY hand: the AI says decline (not the empty-mana-cost 'pay'), and even a 'pay' sacrifices", () => {
    const s = explorerEnters([]);
    expect(autoPickSacUnlessPay(s, s.pendingChoice)).toBe(false);
    const out = resolveSacUnlessPayChoice(s, true);
    expect(onBoard(out)).toBe(false);
  });

  it("the AI pays when it has a card to discard", () => {
    const s = explorerEnters([card("h1", "A")]);
    expect(autoPickSacUnlessPay(s, s.pendingChoice)).toBe(true);
  });
});
