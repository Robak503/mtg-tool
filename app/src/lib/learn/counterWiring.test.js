/**
 * P3.1 wiring — counter target spell end-to-end through the live action path.
 *
 * Verifies the response window the engine already grants (a spell on the stack +
 * priority to the responder) lets the USER cast a counterspell that removes the
 * target spell from the stack → graveyard, and that the AI HOLDS counterspells
 * (the deferred seam: it never counters its own spell, mirroring pump/extended
 * atoms — the AI does not yet evaluate response windows).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { RESOLVER_KEYS } from "./resolvers.js";

beforeEach(() => _resetIdsForTests());

const COUNTERSPELL = { id: "cs", name: "Counterspell", type: "Instant", oracle: "Counter target spell.", mana: "{U}{U}" };
const NEGATE = { id: "neg", name: "Negate", type: "Instant", oracle: "Counter target noncreature spell.", mana: "{1}{U}" };

// A spell sitting on the stack (the would-be counter target), controlled by `controller`.
function spellOnStack(id, name, type, controller) {
  return {
    id, kind: "spell", controller, targets: [], cost: null,
    source: { id: `card-${id}`, name, type, oracle: "" },
    payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: {} },
  };
}

// A precombat-main state with `responder` holding priority while `stack` sits unresolved.
function responseState({ responder = "user", stack = [], userHand = [], aiHand = [], userPool = {}, aiPool = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    phase: "precombat-main",
    step: "main",
    activePlayer: "ai",            // the AI cast something; the responder now has priority
    priorityHolder: responder,
    consecutivePasses: 0,
    stack,
    players: {
      ...s.players,
      user: { ...s.players.user, hand: userHand, manaPool: { ...s.players.user.manaPool, ...userPool } },
      ai: { ...s.players.ai, hand: aiHand, manaPool: { ...s.players.ai.manaPool, ...aiPool } },
    },
  };
}

describe("user casts a counterspell in response (end to end)", () => {
  it("offers Counterspell only when a legal spell-target is on the stack", () => {
    const withSpell = responseState({ userHand: [COUNTERSPELL], userPool: { U: 2 }, stack: [spellOnStack("s1", "Divination", "Sorcery", "ai")] });
    const casts = filterActions(legalActionsForPlayer(withSpell, "user"), "cast-spell");
    const counter = casts.find(c => c.cardId === "cs");
    expect(counter).toBeTruthy();
    expect(counter.targets[0]).toMatchObject({ type: "spell", id: "s1" });

    // Empty stack → no legal target → Counterspell is NOT castable.
    const noSpell = responseState({ userHand: [COUNTERSPELL], userPool: { U: 2 }, stack: [] });
    expect(filterActions(legalActionsForPlayer(noSpell, "user"), "cast-spell").some(c => c.cardId === "cs")).toBe(false);
  });

  it("countering removes the target spell from the stack → its controller's graveyard, unresolved", () => {
    const state = responseState({ userHand: [COUNTERSPELL], userPool: { U: 2 }, stack: [spellOnStack("s1", "Divination", "Sorcery", "ai")] });
    const counter = filterActions(legalActionsForPlayer(state, "user"), "cast-spell").find(c => c.cardId === "cs");
    const onStack = dispatchAction(state, counter);
    expect(onStack.stack.map(o => o.source.name)).toEqual(["Divination", "Counterspell"]); // counter on top
    const resolved = resolveTopOfStack(onStack);
    expect(resolved.stack).toHaveLength(0);                                   // both off the stack
    expect(resolved.players.ai.graveyard.map(c => c.name)).toEqual(["Divination"]); // target countered → graveyard
    expect(resolved.log.some(l => l.effect === "counter")).toBe(true);
  });

  it("Negate cannot target a creature spell (no legal target → not offered)", () => {
    const state = responseState({ userHand: [NEGATE], userPool: { U: 1, C: 1 }, stack: [spellOnStack("bear", "Grizzly Bears", "Creature — Bear", "ai")] });
    expect(filterActions(legalActionsForPlayer(state, "user"), "cast-spell").some(c => c.cardId === "neg")).toBe(false);
  });
});

describe("AI holds counterspells (deferred seam)", () => {
  it("does NOT cast Counterspell even with a legal enemy spell on the stack", () => {
    const state = responseState({ responder: "ai", aiHand: [COUNTERSPELL], aiPool: { U: 2 }, stack: [spellOnStack("u1", "Divination", "Sorcery", "user")] });
    // The action IS surfaced to the AI...
    expect(filterActions(legalActionsForPlayer(state, "ai"), "cast-spell").some(c => c.cardId === "cs")).toBe(true);
    // ...but the AI holds it (never counters; mirrors pump/extended-atom deferral).
    const picked = pickAction(state, "ai", legalActionsForPlayer(state, "ai"));
    expect(picked?.kind === "cast-spell" && picked.cardId === "cs").toBe(false);
  });

  // P3.1 review fix #2: a counter+damage spell (Suffocating Blast) has a NON-null legacy
  // damage effect, so the AI's hold must not rely on the coincidence that the spell
  // target sorts first — the explicit programContainsCounter guard holds it outright.
  it("holds a counter+damage spell (Suffocating Blast) even with a damage target available", () => {
    const SUFFOCATING_BLAST = { id: "sb", name: "Suffocating Blast", type: "Instant",
      oracle: "Counter target spell and Suffocating Blast deals 3 damage to target creature.", mana: "{2}{U}{U}{R}" };
    const state = responseState({
      responder: "ai", aiHand: [SUFFOCATING_BLAST], aiPool: { U: 2, R: 1, C: 2 },
      stack: [spellOnStack("u1", "Wrath of God", "Sorcery", "user")],
    });
    // Give the user a creature so the damage atom has a legal target too (spell is offerable).
    const withCreature = { ...state, players: { ...state.players, user: { ...state.players.user, battlefield: [
      { id: "tgt", card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null },
    ] } } };
    expect(filterActions(legalActionsForPlayer(withCreature, "ai"), "cast-spell").some(c => c.cardId === "sb")).toBe(true);
    const picked = pickAction(withCreature, "ai", legalActionsForPlayer(withCreature, "ai"));
    expect(picked?.kind === "cast-spell" && picked.cardId === "sb").toBe(false);
  });
});
