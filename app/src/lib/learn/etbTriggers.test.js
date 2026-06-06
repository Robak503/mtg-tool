/**
 * Tests for ETB triggers firing end-to-end (Phase-7 PR-6).
 *
 * enterPermanent now enqueues ETB triggers (self + watchers); resolveTopOfStack's
 * flushTriggers puts them on the stack, and the trigger.effect resolver applies
 * them. Vanilla cards (the existing fixtures) have no triggers, so nothing else
 * changes.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { enterPermanent } from "./resolvers.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

function creature(name, oracle, extra = {}) {
  return { id: `card-${name}`, name, type: "Creature — Bear", power: 2, toughness: 2, oracle, ...extra };
}
function stateWith(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withLibrary(state, cards, playerId = "user") {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], library: cards } } };
}

describe("ETB triggers fire (Phase-7 PR-6)", () => {
  it("enterPermanent enqueues a self ETB trigger", () => {
    const visionary = creature("Elvish Visionary", "When Elvish Visionary enters, draw a card.", { id: "card-ev" });
    const s = withLibrary(stateWith(), [{ id: "lib-1", name: "X" }]);
    const out = enterPermanent(s, visionary, "user");
    expect(out.players.user.battlefield).toHaveLength(1);
    expect(out.pendingTriggers).toHaveLength(1);
    expect(out.pendingTriggers[0].payload.params.effect).toMatchObject({ kind: "draw" });
  });

  it("a watcher fires when ANOTHER creature enters, not on its own ETB", () => {
    const warden = creature("Soul Warden", "Whenever another creature enters the battlefield, you gain 1 life.", { id: "card-sw" });
    let s = enterPermanent(stateWith(), warden, "user");
    expect(s.pendingTriggers || []).toHaveLength(0); // no self-trigger on its own entry
    const out = enterPermanent(s, creature("Bear", "", { id: "card-bear" }), "user");
    expect(out.pendingTriggers).toHaveLength(1);
    expect(out.pendingTriggers[0].payload.params.effect).toMatchObject({ kind: "gainLife", amount: 1 });
  });

  it("'enters tapped' does NOT enqueue a trigger (CR 603.6d)", () => {
    const tapland = creature("Tapland", "Tapland enters tapped.", { id: "card-tl", type: "Land" });
    expect(enterPermanent(stateWith(), tapland, "user").pendingTriggers || []).toHaveLength(0);
  });

  it("a vanilla creature enqueues nothing", () => {
    const bear = creature("Grizzly Bears", "", { id: "card-gb" });
    expect(enterPermanent(stateWith(), bear, "user").pendingTriggers || []).toHaveLength(0);
  });

  it("end-to-end: resolving a creature spell fires its ETB draw through the stack", () => {
    const visionary = creature("Elvish Visionary", "When Elvish Visionary enters, draw a card.", { id: "card-ev" });
    let s = withLibrary(stateWith(), [{ id: "lib-1", name: "Card" }]);
    s = { ...s, stack: [{ id: "stk-1", kind: "spell", source: visionary, controller: "user", targets: [], cost: null, payload: { resolver: "spell.permanent", params: { card: visionary, controller: "user" } } }] };

    // Resolve the spell: permanent enters, ETB trigger enqueued, flushTriggers
    // puts it on the stack.
    const afterSpell = resolveTopOfStack(s);
    expect(afterSpell.players.user.battlefield).toHaveLength(1);
    expect(afterSpell.stack).toHaveLength(1);
    expect(afterSpell.stack[0].kind).toBe("triggered-ability");

    // Resolve the trigger: the card is drawn.
    const afterTrigger = resolveTopOfStack(afterSpell);
    expect(afterTrigger.stack).toHaveLength(0);
    expect(afterTrigger.players.user.hand).toHaveLength(1);
    expect(afterTrigger.players.user.hand[0].id).toBe("lib-1");
  });
});
