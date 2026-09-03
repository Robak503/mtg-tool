/**
 * eachOpponentGainsLife.test.js — ④-Y (2026-09-03 night): "each opponent gains N life" — Aria of Flame's ETB (Veyran
 * Cantrips). The loss twin ("each opponent loses N life") and the targeted gain both existed; the each-opponent GAIN
 * had no arm, so the whole enchantment parked on its drawback line. The applier gains for every opponent and fires
 * each one's own lifegain triggers (CR 119.3). Real oracle fixture (bundled Scryfall snapshot, read in-session).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ARIA = { id: "h-aria", name: "Aria of Flame", type: "Enchantment", mana: "{2}{R}", mana_cost: "{2}{R}", cmc: 3, keywords: [],
  oracle: "When this enchantment enters, each opponent gains 10 life.\nWhenever you cast an instant or sorcery spell, put a verse counter on this enchantment, then it deals damage equal to the number of verse counters on it to target player or planeswalker." };

describe("the parse + the tier", () => {
  it("⭐ the clause parses to the each-opponent gain; Aria of Flame is native-trigger", () => {
    expect(parseEffectClause("each opponent gains 10 life", "Enchantment").atoms).toEqual([{ op: "gain-life", amount: 10, who: "eachOpponent", targetType: null }]);
    expect(classifyCard(ARIA)).toBe("native-trigger");
  });
});

describe("runtime — a four-seat pod", () => {
  it("⭐ cast from hand: every opponent gains 10, the caster does not", () => {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const seats = Object.keys(s0.players);
    const opps = seats.filter((p) => p !== "user");
    expect(opps.length).toBe(3);
    const s = { ...s0, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s0.players, user: { ...s0.players.user, hand: [ARIA], battlefield: [], manaPool: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 2 } } } };
    const before = Object.fromEntries(seats.map((p) => [p, s.players[p].life]));
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-aria");
    expect(act).toBeTruthy();
    const entered = flushTriggers(resolveTopOfStack(dispatchAction(s, act)));
    expect(entered.stack.map((o) => o.kind)).toEqual(["triggered-ability"]);
    const out = resolveTopOfStack(entered);
    for (const p of opps) expect(out.players[p].life).toBe(before[p] + 10);
    expect(out.players.user.life).toBe(before.user);
  });
});
