/**
 * Integration test for X-spells through the full cast pipeline:
 *   legalChoices.actionsCastSpell  → surfaces a BOUNDED set of affordable X casts
 *   actionDispatcher.applyCastSpell → auto-taps to pay the FIXED cost + chosen X
 *   gameEngine.resolveTopOfStack    → effects/runProgram resolves the amountX atom
 *                                     reading the bound X (ctx.xValue)
 *
 * This is the "deals exactly X and pays fixed+X" contract end-to-end, exercising the
 * dispatcher's mana arithmetic (not just the resolver in isolation).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "../gameState.js";
import { legalActionsForPlayer } from "../legalChoices.js";
import { dispatchAction } from "../actionDispatcher.js";
import { resolveTopOfStack } from "../gameEngine.js";

beforeEach(() => _resetIdsForTests());

function mountain(id) {
  return {
    id,
    card: { name: "Mountain", type: "Basic Land — Mountain", oracle: "" },
    controller: "user",
    tapped: false,
    summoningSick: false,
    counters: {},
    damageMarked: 0,
    attachments: [],
    attachedTo: null,
  };
}

// 5 untapped Mountains, Blaze ({X}{R}) in hand, user at a sorcery-speed window.
function blazeState() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const blaze = { id: "blaze", name: "Blaze", type: "Sorcery", mana: "{X}{R}", oracle: "Blaze deals X damage to any target." };
  return {
    ...s,
    activePlayer: "user",
    priorityHolder: "user",
    phase: "precombat-main",
    step: "main",
    stack: [],
    players: {
      ...s.players,
      user: {
        ...s.players.user,
        hand: [blaze],
        battlefield: [mountain("m0"), mountain("m1"), mountain("m2"), mountain("m3"), mountain("m4")],
      },
    },
  };
}

describe("X-spell cast → pay → resolve (end-to-end)", () => {
  it("surfaces only AFFORDABLE X values (5 mana → X=1..4 for {X}{R}, not X=5)", () => {
    const state = blazeState();
    const casts = legalActionsForPlayer(state, "user").filter(a => a.kind === "cast-spell");
    const xs = [...new Set(casts.map(a => a.xValue))].sort((a, b) => a - b);
    expect(xs).toEqual([1, 2, 3, 4]); // {X}{R}: fixed {R} + X generic ≤ 5 mana → X ≤ 4
    // Each cast bakes X into the generic cost and is flagged with xValue.
    const x4 = casts.find(a => a.xValue === 4);
    expect(x4.cost.generic).toBe(4);
    expect(x4.cmc).toBe(5);
  });

  it("casting Blaze for X=4 at the opponent pays fixed+X (taps 5 Mountains) and deals exactly 4", () => {
    const state = blazeState();
    const action = legalActionsForPlayer(state, "user").find(
      a => a.kind === "cast-spell" && a.xValue === 4 && a.targets[0]?.id === "ai" && a.targets[0]?.type === "player",
    );
    expect(action).toBeTruthy();

    // Dispatch: auto-taps to pay {R} + {4} = 5 mana from the 5 Mountains.
    const afterCast = dispatchAction(state, action);
    expect(afterCast.players.user.hand.find(c => c.id === "blaze")).toBeUndefined();
    expect(afterCast.players.user.battlefield.filter(p => p.tapped)).toHaveLength(5);
    expect(Object.values(afterCast.players.user.manaPool).reduce((s, v) => s + v, 0)).toBe(0); // no floating mana left
    expect(afterCast.stack).toHaveLength(1);

    // Resolve: Blaze deals exactly X=4 to the opponent.
    const before = afterCast.players.ai.life;
    const resolved = resolveTopOfStack(afterCast);
    expect(resolved.players.ai.life).toBe(before - 4);
    expect(resolved.stack).toHaveLength(0);
    expect(resolved.pendingArbiter).toBeUndefined();
  });

  it("X=2 at the opponent pays only 3 mana (taps 3 Mountains), leaving 2 Mountains untapped", () => {
    const state = blazeState();
    const action = legalActionsForPlayer(state, "user").find(
      a => a.kind === "cast-spell" && a.xValue === 2 && a.targets[0]?.id === "ai" && a.targets[0]?.type === "player",
    );
    const afterCast = dispatchAction(state, action);
    expect(afterCast.players.user.battlefield.filter(p => p.tapped)).toHaveLength(3); // {R} + {2} = 3
    expect(afterCast.players.user.battlefield.filter(p => !p.tapped)).toHaveLength(2);
    const before = afterCast.players.ai.life;
    expect(resolveTopOfStack(afterCast).players.ai.life).toBe(before - 2);
  });
});
