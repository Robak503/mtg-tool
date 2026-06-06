/**
 * P2.3 — pump-spell wiring, end to end through the real cast path.
 *
 * Proves: Giant Growth parses HIGH as a pump atom → the cast emits an
 * effect-program → runEffectProgram registers a layer-7c continuous effect →
 * derived P/T (via the layer engine) reflects +3/+3 → it wears off at cleanup
 * (CR 514.2, endOfTurn duration). The layer mechanism itself was built + tested
 * in Phase 1; this is the wiring proof.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "../gameState.js";
import { legalActionsForPlayer, filterActions } from "../legalChoices.js";
import { dispatchAction } from "../actionDispatcher.js";
import { resolveTopOfStack } from "../gameEngine.js";
import { permanentPower, permanentToughness, expireContinuousEffects } from "../layers.js";
import { parseEffectProgram, programConfidence } from "./parser.js";

beforeEach(() => _resetIdsForTests());

const GIANT_GROWTH = { id: "gg", name: "Giant Growth", type: "Instant", oracle: "Target creature gets +3/+3 until end of turn.", mana: "{G}" };

function bearPerm() {
  return {
    id: "bear", card: { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2 },
    controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0,
    attachments: [], attachedTo: null, timestamp: 0,
  };
}
function mainState() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
    startingPlayer: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, hand: [GIANT_GROWTH], battlefield: [bearPerm()], manaPool: { ...s.players.user.manaPool, G: 1 } },
    },
  };
}

describe("P2.3 pump-spell wiring", () => {
  it("parses Giant Growth as a high-confidence pump program", () => {
    const prog = parseEffectProgram(GIANT_GROWTH);
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms).toEqual([{ op: "pump", ptDelta: { p: 3, t: 3 }, targetType: "creature", duration: "endOfTurn" }]);
  });

  it("surfaces a per-creature cast action and pumps the targeted creature's DERIVED P/T", () => {
    const state = mainState();
    const casts = filterActions(legalActionsForPlayer(state, "user"), "cast-spell");
    const onBear = casts.find(c => c.targets?.[0]?.id === "bear");
    expect(onBear).toBeTruthy();
    const resolved = resolveTopOfStack(dispatchAction(state, onBear));
    expect(permanentPower(resolved, "bear")).toBe(5);     // 2 + 3
    expect(permanentToughness(resolved, "bear")).toBe(5); // 2 + 3
  });

  it("the +3/+3 wears off at cleanup (CR 514.2 endOfTurn duration)", () => {
    const state = mainState();
    const casts = filterActions(legalActionsForPlayer(state, "user"), "cast-spell");
    const onBear = casts.find(c => c.targets?.[0]?.id === "bear");
    const resolved = resolveTopOfStack(dispatchAction(state, onBear));
    const afterCleanup = expireContinuousEffects(resolved, { atCleanupOfTurn: resolved.turn });
    expect(permanentPower(afterCleanup, "bear")).toBe(2);
    expect(permanentToughness(afterCleanup, "bear")).toBe(2);
  });

  it("a NEGATIVE pump that drops derived toughness to 0 kills the creature at resolution (CR 704.5f)", () => {
    // Disfigure-style -2/-2 removal. The pump atom runs the lethal SBA, so the
    // 2/2 dies immediately instead of lingering at 0 toughness until combat.
    const disfigure = { id: "dis", name: "Disfigure", type: "Instant", oracle: "Target creature gets -2/-2 until end of turn.", mana: "{B}" };
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const state = {
      ...s0,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
      startingPlayer: "user", consecutivePasses: 0,
      players: {
        ...s0.players,
        user: { ...s0.players.user, hand: [disfigure], manaPool: { ...s0.players.user.manaPool, B: 1 } },
        ai: { ...s0.players.ai, battlefield: [{ ...bearPerm(), controller: "ai" }] },
      },
    };
    const casts = filterActions(legalActionsForPlayer(state, "user"), "cast-spell");
    const onBear = casts.find(c => c.targets?.[0]?.id === "bear");
    expect(onBear).toBeTruthy();
    const resolved = resolveTopOfStack(dispatchAction(state, onBear));
    expect(resolved.players.ai.battlefield).toHaveLength(0);                 // off the battlefield
    expect(resolved.players.ai.graveyard.map(c => c.name)).toEqual(["Grizzly Bears"]); // in the graveyard
  });
});
