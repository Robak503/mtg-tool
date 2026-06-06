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
import { addContinuousEffect } from "./layers.js";

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

  it("round-trips an effect-program payload (high-confidence instant) to byte-identical resolution", () => {
    const burn = card("Searing Spear", "Instant", "{1}{R}");
    burn.oracle = "Searing Spear deals 3 damage to any target.";
    let state = createGameState({ userDeck: [], aiDeck: [] });
    state = {
      ...state,
      phase: "precombat-main", step: "main", priorityHolder: "user", activePlayer: "user",
      players: {
        ...state.players,
        user: { ...state.players.user, hand: [burn], manaPool: { ...state.players.user.manaPool, R: 1, C: 1 } },
      },
    };
    const before = dispatchAction(state, {
      kind: "cast-spell", playerId: "user", cardId: burn.id, name: "Searing Spear",
      cost: parseManaCost("{1}{R}"), cmc: 2, targets: [{ type: "player", id: "ai" }],
    });
    // The cast emitted a serializable effect-program payload (plain data, no closure).
    expect(before.stack[0].payload.resolver).toBe("effect-program");
    expect(containsFunction(before)).toBe(false);

    const after = deserializeState(serializeState(before));
    expect(after).toEqual(before);

    const r1 = resolveTopOfStack(before);
    const r2 = resolveTopOfStack(after);
    expect(r2).toEqual(r1);
    expect(r1.players.ai.life).toBe(37); // 3 damage to the player resolved through the interpreter
  });

  it("a cast game state contains NO functions anywhere (closure-regression guard)", () => {
    const state = castBearState();
    expect(containsFunction(state)).toBe(false);
    // The stack payload is plain data with a string resolver, not a closure.
    expect(state.stack[0].payload.resolver).toBe("spell.permanent");
    expect(typeof state.stack[0].payload.onResolve).toBe("undefined");
  });

  it("a POPULATED continuousEffects (incl. a dynamic op) stays closure-free and round-trips", () => {
    // The layer engine's dynamic P/T lives in code (DYNAMIC_PT_FNS); only the string
    // `fn` key ever reaches state. Prove the no-closure + round-trip invariant on a
    // state that actually carries a stored resolution effect, not just the [] seed.
    let state = createGameState({ userDeck: [], aiDeck: [] });
    state = addContinuousEffect(state, {
      layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 3, toughness: 3 },
      affects: { mode: "fixed", permanentIds: ["perm-1"] }, duration: { kind: "endOfTurn", turn: 1 },
      source: { kind: "resolution", permanentId: null, cardName: "Giant Growth" },
    }).state;
    state = addContinuousEffect(state, {
      layer: 7, sublayer: "7c", op: { layerOp: "ptModifyDynamic", fn: "omnathGreen" },
      affects: { mode: "self", permanentId: "perm-2" }, duration: { kind: "permanent" },
      source: { kind: "static", permanentId: "perm-2", cardName: "Omnath, Locus of Mana" },
    }).state;
    expect(state.continuousEffects).toHaveLength(2);
    expect(containsFunction(state)).toBe(false);
    const restored = deserializeState(serializeState(state));
    expect(restored).toEqual(state);
    expect(restored.continuousEffects[1].op.fn).toBe("omnathGreen"); // a string key, not a function
  });

  it("containsFunction detects a function and is cycle-safe", () => {
    expect(containsFunction({ a: 1, b: { c: () => {} } })).toBe(true);
    expect(containsFunction({ a: 1, b: { c: 2 } })).toBe(false);
    const cyclic = { a: 1 };
    cyclic.self = cyclic;
    expect(containsFunction(cyclic)).toBe(false);
  });
});
