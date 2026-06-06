/**
 * Tests for Phase-7 PR-4 — serialization round-trip + the no-closure guard.
 *
 * This is the executable definition of "serialization done": a game state with
 * a spell on the stack serializes, restores, and resolves to byte-identical
 * behavior. It FAILED before PR-3 (closures dropped by JSON.stringify) and
 * passes now. The no-closure guard is the CI-gating forcing function that keeps
 * the invariant alive until Phase-3 save/resume becomes a live consumer.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { serializeState, deserializeState, containsFunction } from "./serialization.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseManaCost } from "./legalChoices.js";
import { resolveTopOfStack } from "./gameEngine.js";

function card(name, type, mana = "", id = null) {
  return { id: id || `card-${name}`, name, type, mana };
}

/** Cast Grizzly Bears (pool-paid) so a real spell.permanent payload is on the stack. */
function castBearState() {
  const bear = card("Grizzly Bears", "Creature — Bear", "{1}{G}");
  let state = createGameState({ userDeck: [], aiDeck: [] });
  state = {
    ...state,
    phase: "precombat-main", step: "main", priorityHolder: "user", activePlayer: "user",
    players: {
      ...state.players,
      user: { ...state.players.user, hand: [bear], manaPool: { ...state.players.user.manaPool, G: 1, C: 1 } },
    },
  };
  return dispatchAction(state, {
    kind: "cast-spell", playerId: "user", cardId: bear.id, name: "Grizzly Bears",
    cost: parseManaCost("{1}{G}"), cmc: 2,
  });
}

beforeEach(() => {
  _resetIdsForTests();
});

describe("serialization round-trip (Phase-7 PR-4)", () => {
  it("round-trips a mid-stack state to byte-identical resolution behavior", () => {
    const before = castBearState();
    expect(before.stack).toHaveLength(1); // the bear spell is on the stack

    const json = serializeState(before);
    expect(() => JSON.parse(json)).not.toThrow();        // (1) it serializes cleanly
    const after = deserializeState(json);

    expect(after).toEqual(before);                       // (2) no data silently dropped
    expect(serializeState(after)).toBe(json);            //     stable round-trip

    // (3) BEHAVIORAL equality — resolving the restored state yields the same
    //     state as resolving the original. This is what proves the closure is
    //     truly gone: a dropped resolver would diverge here.
    const r1 = resolveTopOfStack(before);
    const r2 = resolveTopOfStack(after);
    expect(r2).toEqual(r1);

    // (4) it actually resolved (the bear entered) — proves a real path was tested,
    //     with a deterministic id that survives serialize -> restore.
    expect(r1.players.user.battlefield).toHaveLength(1);
    expect(r1.players.user.battlefield[0].card.name).toBe("Grizzly Bears");
    expect(r1.players.user.battlefield[0].id).toBe(r2.players.user.battlefield[0].id);
  });

  it("a cast game state contains NO functions anywhere (closure-regression guard)", () => {
    const state = castBearState();
    expect(containsFunction(state)).toBe(false);
    // The stack payload is plain data with a string resolver, not a closure.
    expect(state.stack[0].payload.resolver).toBe("spell.permanent");
    expect(typeof state.stack[0].payload.onResolve).toBe("undefined");
  });

  it("containsFunction detects a function and is cycle-safe", () => {
    expect(containsFunction({ a: 1, b: { c: () => {} } })).toBe(true);
    expect(containsFunction({ a: 1, b: { c: 2 } })).toBe(false);
    const cyclic = { a: 1 };
    cyclic.self = cyclic;
    expect(containsFunction(cyclic)).toBe(false);
  });
});
