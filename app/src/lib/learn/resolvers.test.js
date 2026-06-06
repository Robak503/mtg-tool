/**
 * Tests for Phase-7 PR-1 — resolvers.js (serializable resolver registry).
 *
 * Nothing in production calls this yet; these prove the registry, each built-in
 * resolver, the extension mechanism, and the extracted enterPermanent /
 * isPermanentSpell helpers in isolation. PR-2/PR-3 wire them in.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  RESOLVER_KEYS,
  RESOLVERS,
  getResolver,
  registerResolver,
  _clearExtensionsForTests,
  enterPermanent,
  isPermanentSpell,
  markPendingArbiter,
} from "./resolvers.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

function makeDeck(count, prefix = "C") {
  return Array.from({ length: count }, (_, i) => ({ id: `card-${prefix}-${i}`, name: `${prefix} ${i}` }));
}
function creature(name, extra = {}) {
  return { id: `card-${name}`, name, type: "Creature — Bear", power: 2, toughness: 2, ...extra };
}
function freshState() {
  return createGameState({ userDeck: makeDeck(5, "U"), aiDeck: makeDeck(5, "A") });
}
/** Minimal stack object — resolvers read only payload.params (+ id/kind/source/controller). */
function stk(params, { id = "stk-1", kind = "spell", source, controller } = {}) {
  return { id, kind, source, controller, payload: { params } };
}

beforeEach(() => {
  _resetIdsForTests();
  _clearExtensionsForTests();
});

describe("RESOLVER_KEYS contract", () => {
  it("is frozen and exposes the canonical key set", () => {
    expect(Object.isFrozen(RESOLVER_KEYS)).toBe(true);
    expect(RESOLVER_KEYS.SPELL_EFFECT).toBe("spell.effect");
    expect(RESOLVER_KEYS.PERMANENT_ETB).toBe("spell.permanent");
    expect(RESOLVER_KEYS.SPELL_NOOP).toBe("spell.noop");
    expect(RESOLVER_KEYS.TRIGGER_EFFECT).toBe("trigger.effect");
    expect(RESOLVER_KEYS.ACTIVATED_EFFECT).toBe("activated.effect");
    expect(RESOLVER_KEYS.MANUAL).toBe("manual");
    expect(RESOLVER_KEYS.EFFECT_PROGRAM).toBe("effect-program"); // reserved for Phase 2
  });

  it("RESOLVERS is frozen and every built-in key resolves to a function", () => {
    expect(Object.isFrozen(RESOLVERS)).toBe(true);
    for (const key of Object.values(RESOLVER_KEYS)) {
      if (key === RESOLVER_KEYS.EFFECT_PROGRAM) continue; // reserved, no built-in yet
      expect(typeof RESOLVERS[key]).toBe("function");
    }
  });
});

describe("getResolver / registerResolver precedence", () => {
  it("returns the built-in for a known key and null for an unknown key", () => {
    expect(getResolver(RESOLVER_KEYS.SPELL_EFFECT)).toBe(RESOLVERS[RESOLVER_KEYS.SPELL_EFFECT]);
    expect(getResolver("does-not-exist")).toBeNull();
    expect(getResolver(undefined)).toBeNull();
  });

  it("resolves a registered extension key", () => {
    const fn = (s) => s;
    registerResolver("test.custom", fn);
    expect(getResolver("test.custom")).toBe(fn);
  });

  it("built-ins win over an extension trying to shadow the same key", () => {
    const shadow = (s) => s;
    registerResolver(RESOLVER_KEYS.SPELL_NOOP, shadow);
    expect(getResolver(RESOLVER_KEYS.SPELL_NOOP)).toBe(RESOLVERS[RESOLVER_KEYS.SPELL_NOOP]);
    expect(getResolver(RESOLVER_KEYS.SPELL_NOOP)).not.toBe(shadow);
  });

  it("_clearExtensionsForTests drops registrations", () => {
    registerResolver("test.custom", (s) => s);
    _clearExtensionsForTests();
    expect(getResolver("test.custom")).toBeNull();
  });

  it("registerResolver rejects a non-function", () => {
    expect(() => registerResolver("test.bad", 42)).toThrow();
  });
});

describe("built-in resolvers", () => {
  it("spell.effect resolves a parsed effect (draw)", () => {
    const state = freshState();
    const before = state.players.user.hand.length;
    const out = RESOLVERS[RESOLVER_KEYS.SPELL_EFFECT](
      state,
      stk({ effect: { kind: "draw", amount: 1, targetType: null }, controller: "user", targets: [] }),
    );
    expect(out.players.user.hand.length).toBe(before + 1);
  });

  it("spell.effect with no effect falls through to the manual log (Arbiter escape)", () => {
    const state = freshState();
    const out = RESOLVERS[RESOLVER_KEYS.SPELL_EFFECT](state, stk({ controller: "user" }, { id: "stk-9", source: { name: "Mystery" } }));
    expect(out.log.some(l => l.kind === "stack-resolve" && l.manual === true)).toBe(true);
  });

  it("spell.permanent puts a permanent on the battlefield with a deterministic id", () => {
    const state = freshState();
    const out = RESOLVERS[RESOLVER_KEYS.PERMANENT_ETB](state, stk({ card: creature("Bear"), controller: "user" }));
    expect(out.players.user.battlefield).toHaveLength(1);
    const perm = out.players.user.battlefield[0];
    expect(perm.id).toBe("perm-1");
    expect(perm.summoningSick).toBe(true);
    expect(perm.enteredOnTurn).toBe(out.turn);
    expect(out.idSeq).toBe(1);
    expect(out.log.some(l => l.kind === "permanent-enters")).toBe(true);
  });

  it("spell.noop flags the unresolved->Arbiter seam (P2.1 — never a silent no-op)", () => {
    const state = freshState();
    const obj = stk(
      { cardName: "Mystic Confluence", reason: "no recognized effect" },
      { id: "stk-3", source: { name: "Mystic Confluence", oracle: "Choose three —" }, controller: "user" },
    );
    const out = RESOLVERS[RESOLVER_KEYS.SPELL_NOOP](state, obj);
    // Structured, honest log (NOT the old misleading spell-no-op-resolve).
    expect(out.log.some(l => l.kind === "spell-unresolved" && l.cardName === "Mystic Confluence" && l.controller === "user")).toBe(true);
    // Flags pendingArbiter so the driver surfaces it + the UI hands it to the Arbiter.
    expect(out.pendingArbiter).toMatchObject({
      stackObjectId: "stk-3",
      cardName: "Mystic Confluence",
      oracle: "Choose three —",
      controller: "user",
    });
  });

  it("markPendingArbiter is FIFO — a second unresolved spell does not overwrite the first", () => {
    const state = freshState();
    const first = markPendingArbiter(state, stk({}, { id: "stk-1", source: { name: "Spell A" }, controller: "user" }), "a");
    const second = markPendingArbiter(first, stk({}, { id: "stk-2", source: { name: "Spell B" }, controller: "ai" }), "b");
    // pendingArbiter still points at the FIRST; both are logged honestly.
    expect(second.pendingArbiter.cardName).toBe("Spell A");
    expect(second.log.filter(l => l.kind === "spell-unresolved")).toHaveLength(2);
  });

  it("manual logs a stack-resolve with manual:true", () => {
    const state = freshState();
    const out = RESOLVERS[RESOLVER_KEYS.MANUAL](state, stk({}, { id: "stk-5", kind: "triggered-ability", source: { name: "Weird Card" } }));
    const entry = out.log.find(l => l.kind === "stack-resolve");
    expect(entry).toBeTruthy();
    expect(entry.manual).toBe(true);
    expect(entry.source).toBe("Weird Card");
  });

  it("activated.effect is a stub that resolves through the manual path (Phase 2)", () => {
    const state = freshState();
    const out = RESOLVERS[RESOLVER_KEYS.ACTIVATED_EFFECT](state, stk({}, { id: "stk-7", kind: "activated-ability" }));
    expect(out.log.some(l => l.kind === "stack-resolve" && l.manual === true)).toBe(true);
  });
});

describe("enterPermanent", () => {
  it("stamps enteredOnTurn, mints from idSeq, and sets summoning sickness for creatures", () => {
    const state = freshState();
    const out = enterPermanent(state, creature("Bear"), "user");
    const perm = out.players.user.battlefield[0];
    expect(perm.id).toBe("perm-1");
    expect(perm.enteredOnTurn).toBe(state.turn);
    expect(perm.summoningSick).toBe(true);
    expect(out.idSeq).toBe(1);
  });

  it("non-creature permanents are not summoning sick", () => {
    const state = freshState();
    const out = enterPermanent(state, { id: "card-sol", name: "Sol Ring", type: "Artifact" }, "user");
    expect(out.players.user.battlefield[0].summoningSick).toBe(false);
  });

  it("returns state unchanged for an unknown controller", () => {
    const state = freshState();
    const out = enterPermanent(state, creature("Bear"), "nobody");
    expect(out).toBe(state);
  });
});

describe("isPermanentSpell", () => {
  it("is true for permanent card types and false otherwise", () => {
    expect(isPermanentSpell({ type: "Creature — Bear" })).toBe(true);
    expect(isPermanentSpell({ type: "Artifact" })).toBe(true);
    expect(isPermanentSpell({ type: "Enchantment — Aura" })).toBe(true);
    expect(isPermanentSpell({ type: "Legendary Planeswalker — Jace" })).toBe(true);
    expect(isPermanentSpell({ type_line: "Artifact Creature — Golem" })).toBe(true);
    expect(isPermanentSpell({ type: "Instant" })).toBe(false);
    expect(isPermanentSpell({ type: "Sorcery" })).toBe(false);
    expect(isPermanentSpell({ type: "Basic Land — Forest" })).toBe(false);
    expect(isPermanentSpell({})).toBe(false);
  });
});
