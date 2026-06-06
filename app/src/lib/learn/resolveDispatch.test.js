/**
 * Tests for Phase-7 PR-2 — resolveTopOfStack registry dispatch.
 *
 * The expand step: resolveTopOfStack consults the resolver registry first, then
 * the legacy onResolve closure, then the manual/no-op log. PR-2 adds the registry
 * branch without removing the closure fallback, so existing behavior is unchanged
 * and these prove the new path.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { resolveTopOfStack } from "./gameEngine.js";
import { registerResolver, _clearExtensionsForTests, RESOLVER_KEYS } from "./resolvers.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

function freshState() {
  // step "untap" doesn't grant priority, so resolveTopOfStack just resolves the
  // top and returns — perfect for isolating dispatch behavior.
  return createGameState({ userDeck: [], aiDeck: [] });
}
function withStack(state, payload, { kind = "spell", source } = {}) {
  return { ...state, stack: [{ id: "stk-1", kind, source, controller: "user", targets: [], cost: null, payload }] };
}

beforeEach(() => {
  _resetIdsForTests();
  _clearExtensionsForTests();
});

describe("resolveTopOfStack registry dispatch (Phase-7 PR-2)", () => {
  it("dispatches a payload.resolver through the registry and pops the stack", () => {
    const state = withStack(freshState(), {
      resolver: RESOLVER_KEYS.SPELL_NOOP,
      params: { cardName: "Brainstorm", reason: "test" },
    });
    const out = resolveTopOfStack(state);
    expect(out.stack).toHaveLength(0);
    expect(out.log.some(l => l.kind === "spell-no-op-resolve" && l.cardName === "Brainstorm")).toBe(true);
  });

  it("resolves a permanent ETB payload onto the battlefield deterministically", () => {
    const state = withStack(freshState(), {
      resolver: RESOLVER_KEYS.PERMANENT_ETB,
      params: { card: { id: "card-bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" },
    });
    const out = resolveTopOfStack(state);
    expect(out.stack).toHaveLength(0);
    expect(out.players.user.battlefield).toHaveLength(1);
    expect(out.players.user.battlefield[0].id).toBe("perm-1");
  });

  it("logs stack-resolve-error when a registered resolver throws (never throws out)", () => {
    registerResolver("test.throws", () => { throw new Error("boom"); });
    const state = withStack(freshState(), { resolver: "test.throws", params: {} });
    const out = resolveTopOfStack(state);
    expect(out.stack).toHaveLength(0);
    expect(out.log.some(l => l.kind === "stack-resolve-error")).toBe(true);
  });

  it("still honors a legacy onResolve closure when no resolver key is present (fallback)", () => {
    let called = false;
    const state = withStack(freshState(), { onResolve: (s) => { called = true; return s; } });
    const out = resolveTopOfStack(state);
    expect(called).toBe(true);
    expect(out.stack).toHaveLength(0);
  });

  it("an unknown resolver key with no closure falls to the manual/no-op log (no throw)", () => {
    const state = withStack(freshState(), { resolver: "does-not-exist", params: {} }, { source: { name: "Mystery" } });
    const out = resolveTopOfStack(state);
    expect(out.stack).toHaveLength(0);
    expect(out.log.some(l => l.kind === "stack-resolve")).toBe(true);
  });
});
