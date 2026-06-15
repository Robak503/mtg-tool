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

describe("ETB triggers via the full EffectProgram (P2.8)", () => {
  // Resolve a creature spell so its ETB trigger ends up on the stack, then inspect.
  function castAndResolveSpell(card, over = {}) {
    let s = stateWith(over);
    s = { ...s, stack: [{ id: "stk-1", kind: "spell", source: card, controller: "user", targets: [], cost: null, payload: { resolver: "spell.permanent", params: { card, controller: "user" } } }] };
    return resolveTopOfStack(s);
  }

  it("an ETB TOKEN trigger routes through EFFECT_PROGRAM and makes the token (new — fallback couldn't)", () => {
    const c = creature("Token Maker", "When Token Maker enters, create a 1/1 white Soldier creature token.", { id: "card-tm" });
    const afterSpell = castAndResolveSpell(c);
    expect(afterSpell.stack[0].kind).toBe("triggered-ability");
    expect(afterSpell.stack[0].payload.resolver).toBe("effect-program");
    const after = resolveTopOfStack(afterSpell);
    expect(after.stack).toHaveLength(0);
    expect(after.players.user.battlefield.some((p) => p.card?.token)).toBe(true);
  });

  it("an ETB gain-life trigger gains the life via EFFECT_PROGRAM", () => {
    const before = createGameState({ userDeck: [], aiDeck: [] }).players.user.life;
    const c = creature("Healer", "When Healer enters, you gain 3 life.", { id: "card-h" });
    const afterSpell = castAndResolveSpell(c);
    expect(afterSpell.stack[0].payload.resolver).toBe("effect-program");
    expect(resolveTopOfStack(afterSpell).players.user.life).toBe(before + 3);
  });

  it("an ETB 'each opponent loses life' trigger routes through EFFECT_PROGRAM", () => {
    const c = creature("Drainer", "When Drainer enters, each opponent loses 2 life.", { id: "card-dr" });
    const oppBefore = createGameState({ userDeck: [], aiDeck: [] }).players.ai.life;
    const afterSpell = castAndResolveSpell(c);
    expect(afterSpell.stack[0].payload.resolver).toBe("effect-program");
    expect(resolveTopOfStack(afterSpell).players.ai.life).toBe(oppBefore - 2);
  });

  it("an ETB 'deal N damage to each opponent' trigger routes through EFFECT_PROGRAM and damages opponents", () => {
    const c = creature("Bomber", "When Bomber enters, it deals 2 damage to each opponent.", { id: "card-bm" });
    const oppBefore = createGameState({ userDeck: [], aiDeck: [] }).players.ai.life;
    const afterSpell = castAndResolveSpell(c);
    expect(afterSpell.stack[0].payload.resolver).toBe("effect-program");
    expect(resolveTopOfStack(afterSpell).players.ai.life).toBe(oppBefore - 2);
  });

  it("an INTERVENING-IF ETB is NOT routed and does NOT fabricate its effect (CR 603.4 condition unevaluated)", () => {
    const c = creature("Conditional Maker", "When Conditional Maker enters, if you control another creature, create a 1/1 white Soldier creature token.", { id: "card-cm" });
    const afterSpell = castAndResolveSpell(c);
    expect(afterSpell.stack[0].payload.resolver).not.toBe("effect-program"); // kept the fallback
    const after = resolveTopOfStack(afterSpell);
    expect(after.players.user.battlefield.filter((p) => p.card?.token)).toHaveLength(0); // no fabricated token
  });

  it("the canonical 'draw a card' ETB routes through EFFECT_PROGRAM (draw unlocked off a creature source)", () => {
    const c = creature("Visionary", "When Visionary enters, draw a card.", { id: "card-v2" });
    let s = withLibrary(stateWith(), [{ id: "lib-x", name: "Card" }]);
    s = { ...s, stack: [{ id: "stk-1", kind: "spell", source: c, controller: "user", targets: [], cost: null, payload: { resolver: "spell.permanent", params: { card: c, controller: "user" } } }] };
    const afterSpell = resolveTopOfStack(s);
    expect(afterSpell.stack[0].payload.resolver).toBe("effect-program");
    expect(resolveTopOfStack(afterSpell).players.user.hand.map((x) => x.id)).toContain("lib-x");
  });

  it("a TARGETED ETB routes through EFFECT_PROGRAM, choosing a target at flush time (CR 603.3c)", () => {
    // An enemy creature is on board, so the restricted target ('an opponent controls')
    // has a legal pick; the flush chooser binds it (default first-legal) and the
    // interpreter destroys it — the small fallback could never resolve this.
    let s = enterPermanent(stateWith(), creature("Victim", "", { id: "card-vic" }), "ai");
    const victimId = s.players.ai.battlefield[0].id;
    const hunter = creature("Hunter", "When Hunter enters, destroy target creature an opponent controls.", { id: "card-hu" });
    s = { ...s, stack: [{ id: "stk-1", kind: "spell", source: hunter, controller: "user", targets: [], cost: null, payload: { resolver: "spell.permanent", params: { card: hunter, controller: "user" } } }] };
    const afterSpell = resolveTopOfStack(s);
    const trig = afterSpell.stack.find((o) => o.kind === "triggered-ability");
    expect(trig.payload.resolver).toBe("effect-program");
    expect(trig.payload.params.targets.map((t) => t.id)).toContain(victimId);
    expect(trig.targets.map((t) => t.id)).toContain(victimId); // mirrored onto the stack object
    expect(resolveTopOfStack(afterSpell).players.ai.battlefield).toHaveLength(0); // destroyed
  });

  it("a TARGETED ETB with NO legal target is removed from the stack, never fabricated (CR 603.3c)", () => {
    // No opponent creature → 'destroy target creature an opponent controls' has no
    // legal target, so the trigger is dropped (logged) rather than put on the stack.
    const hunter = creature("Hunter", "When Hunter enters, destroy target creature an opponent controls.", { id: "card-hu2" });
    const afterSpell = castAndResolveSpell(hunter);
    expect(afterSpell.stack.find((o) => o.kind === "triggered-ability")).toBeUndefined();
    expect(afterSpell.log.some((e) => e.kind === "trigger-removed-no-target")).toBe(true);
  });

  it("a MODAL 'choose one' ETB does NOT use EFFECT_PROGRAM — routing it would silently pick one mode (gameEngine gate: structure !== modal)", () => {
    // Without a chosen mode, the interpreter would resolve modes[undefined] →
    // zero atoms, silently dropping the ability. The gate must keep the fallback.
    const c = creature("Chooser", "When Chooser enters, choose one — draw a card; or you gain 3 life.", { id: "card-ch" });
    const afterSpell = castAndResolveSpell(c);
    expect(afterSpell.stack[0].kind).toBe("triggered-ability");
    expect(afterSpell.stack[0].payload.resolver).not.toBe("effect-program");
  });
});
