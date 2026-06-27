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
import { parseEffectProgram } from "./parser.js";

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

// ===== X-DRAW (actor-aware) ===== "Target player draws X cards" (Braingeyser/Stroke of Genius) and
// "Each player draws X cards" (Prosperity) — the X amount flows through the SAME pay-fixed+X pipeline,
// and the draw lands on the TARGET / EVERY player (not the controller). Proves the parser's amountX path
// now preserves `who` AND the resolver reads ctx.xValue for the each/target forms (previously Arbiter).
describe("X-DRAW actor-aware cast → pay → resolve", () => {
  const island = (id) => ({ id, card: { name: "Island", type: "Basic Land — Island", oracle: "" }, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null });
  const lib = (who, n) => Array.from({ length: n }, (_, i) => ({ id: `${who}-lib${i}`, name: `Forest`, type: "Basic Land — Forest", oracle: "" }));
  function drawState(spell, userLands, userLib, aiLib) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [],
      players: { ...s.players,
        user: { ...s.players.user, hand: [spell], battlefield: Array.from({ length: userLands }, (_, i) => island(`i${i}`)), library: lib("u", userLib) },
        ai: { ...s.players.ai, library: lib("a", aiLib) } } };
  }

  it("Braingeyser X=3 at the OPPONENT: the opponent draws exactly 3 (controller draws 0)", () => {
    const braingeyser = { id: "bg", name: "Braingeyser", type: "Sorcery", mana: "{X}{U}{U}", oracle: "Target player draws X cards." };
    const state = drawState(braingeyser, 5, 4, 9); // {X}{U}{U}, X=3 → {3}{U}{U} = 5 Islands
    const action = legalActionsForPlayer(state, "user").find(
      a => a.kind === "cast-spell" && a.xValue === 3 && a.targets?.[0]?.id === "ai" && a.targets?.[0]?.type === "player",
    );
    expect(action).toBeTruthy();
    const afterCast = dispatchAction(state, action);
    expect(afterCast.players.user.battlefield.filter(p => p.tapped)).toHaveLength(5); // {U}{U} + {3}
    const uHand = afterCast.players.user.hand.length, aHand = afterCast.players.ai.hand.length;
    const resolved = resolveTopOfStack(afterCast);
    expect(resolved.players.ai.hand.length).toBe(aHand + 3);     // TARGET drew X=3
    expect(resolved.players.ai.library.length).toBe(6);          // 9 − 3
    expect(resolved.players.user.hand.length).toBe(uHand);       // controller drew nothing
    expect(resolved.pendingArbiter).toBeUndefined();
  });

  it("Prosperity X=2: EVERY player draws exactly 2", () => {
    const prosperity = { id: "pr", name: "Prosperity", type: "Sorcery", mana: "{X}{U}", oracle: "Each player draws X cards." };
    const state = drawState(prosperity, 3, 5, 5); // {X}{U}, X=2 → {2}{U} = 3 Islands
    const action = legalActionsForPlayer(state, "user").find(a => a.kind === "cast-spell" && a.xValue === 2);
    expect(action).toBeTruthy();
    const afterCast = dispatchAction(state, action);
    const uHand = afterCast.players.user.hand.length, aHand = afterCast.players.ai.hand.length;
    const resolved = resolveTopOfStack(afterCast);
    expect(resolved.players.user.hand.length).toBe(uHand + 2);
    expect(resolved.players.ai.hand.length).toBe(aHand + 2);
    expect(resolved.pendingArbiter).toBeUndefined();
  });
});

// ===== TOKENS ===== T3 — an X-COUNT token spell (Secure the Wastes, {X}{W}: "Create X 1/1 white
// Warrior creature tokens") makes EXACTLY X tokens, with the chosen X bound + paid through the same
// pipeline as an X-damage spell.
describe("X-COUNT token spell cast → pay → resolve (TOK-3)", () => {
  const plains = (id) => ({ id, card: { name: "Plains", type: "Basic Land — Plains", oracle: "" }, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null });
  function secureState() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const secure = { id: "secure", name: "Secure the Wastes", type: "Instant", mana: "{X}{W}", oracle: "Create X 1/1 white Warrior creature tokens." };
    return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [],
      players: { ...s.players, user: { ...s.players.user, hand: [secure], battlefield: [plains("p0"), plains("p1"), plains("p2"), plains("p3")] } } };
  }
  it("parses to a countX create-token atom and flags the program xSpell", () => {
    const p = parseEffectProgram({ type: "Instant", mana: "{X}{W}", oracle: "Create X 1/1 white Warrior creature tokens." });
    expect(p.xSpell).toBe(true);
    expect(p.atoms).toEqual([{ op: "create-token", power: 1, toughness: 1, descriptor: "white warrior", targetType: null, countX: true }]);
  });
  it("casting for X=3 pays {3}{W} and mints exactly 3 Warrior tokens", () => {
    const state = secureState();
    const action = legalActionsForPlayer(state, "user").find(a => a.kind === "cast-spell" && a.xValue === 3);
    expect(action).toBeTruthy();
    const afterCast = dispatchAction(state, action);
    expect(afterCast.players.user.battlefield.filter(p => p.tapped)).toHaveLength(4); // {W} + {3} = 4 Plains
    const resolved = resolveTopOfStack(afterCast);
    const tokens = resolved.players.user.battlefield.filter(p => p.card?.token);
    expect(tokens).toHaveLength(3);
    expect(tokens.every(t => t.card.power === 1 && t.card.toughness === 1 && /Warrior/.test(t.card.type))).toBe(true);
    expect(resolved.pendingArbiter).toBeUndefined();
  });
});
