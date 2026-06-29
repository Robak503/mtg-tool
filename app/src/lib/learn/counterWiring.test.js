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

// COUNTER-NO-TARGET GATE (CR 601.2c) — a counter whose unmodeled rider / alternative cost drops its
// program below HIGH confidence (Remand, Cryptic Command, Force of Will, Daze, Stubborn Denial, …) used to
// fall through to the no-target cast offer, so self-play would OFFER it at an EMPTY stack — an illegal cast
// (a "counter target spell" with no spell on the stack has no legal target). The fix gates these
// LOW-confidence counters on a legal stack target the same way HIGH counters already self-gate.
describe("LOW-confidence counters: not offered with no legal stack target (CR 601.2c)", () => {
  // Each carries a clause/cost the parser leaves below HIGH, so it reaches the no-target fall-through.
  const REMAND = { id: "rmd", name: "Remand", type: "Instant",
    oracle: "Counter target spell. If that spell is countered this way, put it into its owner's hand instead of into that player's graveyard. Draw a card.", mana: "{1}{U}" };
  const CRYPTIC = { id: "cf", name: "Cryptic Command", type: "Instant",
    oracle: "Choose two —\n• Counter target spell.\n• Return target permanent to its owner's hand.\n• Tap all creatures your opponents control.\n• Draw a card.", mana: "{1}{U}{U}{U}" };
  const FORCE_OF_WILL = { id: "fow", name: "Force of Will", type: "Instant",
    oracle: "You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana cost.\nCounter target spell.", mana: "{3}{U}{U}" };
  const STUBBORN_DENIAL = { id: "sd", name: "Stubborn Denial", type: "Instant",
    oracle: "Counter target noncreature spell unless its controller pays {1}. Ferocious — If you control a creature with power 4 or greater, counter that spell instead.", mana: "{U}" };

  it("empty stack → NOT offered (Remand / Cryptic Command / Force of Will / Stubborn Denial)", () => {
    for (const card of [REMAND, CRYPTIC, FORCE_OF_WILL, STUBBORN_DENIAL]) {
      const state = responseState({ userHand: [card], userPool: { U: 5, C: 5 }, stack: [] });
      const offered = filterActions(legalActionsForPlayer(state, "user"), "cast-spell").some(c => c.cardId === card.id);
      expect(offered, `${card.name} should NOT be offered at an empty stack`).toBe(false);
    }
  });

  it("legal spell on the stack → offered AND targets that spell", () => {
    for (const card of [REMAND, CRYPTIC, FORCE_OF_WILL]) {
      const state = responseState({ userHand: [card], userPool: { U: 5, C: 5 }, stack: [spellOnStack("s1", "Divination", "Sorcery", "ai")] });
      const offer = filterActions(legalActionsForPlayer(state, "user"), "cast-spell").find(c => c.cardId === card.id);
      expect(offer, `${card.name} should be offered with a spell on the stack`).toBeTruthy();
      expect(offer.needsTargets).toBe(true);
      expect(offer.targets[0]).toMatchObject({ type: "spell", id: "s1" });
    }
  });

  it("respects the counter's own restriction: a noncreature-only counter is NOT offered against a creature spell", () => {
    // Stubborn Denial counters noncreature spells only → a creature spell on the stack is no legal target.
    const creatureStack = responseState({ userHand: [STUBBORN_DENIAL], userPool: { U: 5, C: 5 }, stack: [spellOnStack("bear", "Grizzly Bears", "Creature — Bear", "ai")] });
    expect(filterActions(legalActionsForPlayer(creatureStack, "user"), "cast-spell").some(c => c.cardId === STUBBORN_DENIAL.id)).toBe(false);
    // ...but IS offered against a noncreature spell.
    const noncreatureStack = responseState({ userHand: [STUBBORN_DENIAL], userPool: { U: 5, C: 5 }, stack: [spellOnStack("div", "Divination", "Sorcery", "ai")] });
    const offer = filterActions(legalActionsForPlayer(noncreatureStack, "user"), "cast-spell").find(c => c.cardId === STUBBORN_DENIAL.id);
    expect(offer).toBeTruthy();
    expect(offer.targets[0]).toMatchObject({ type: "spell", id: "div" });
  });

  it("FN-safe: an unparseable ability-targeting counter (Disallow) is unchanged — still offered at empty stack", () => {
    // "Counter target spell, activated ability, or triggered ability" can target an ABILITY, so requiring a
    // spell on the stack would be wrong. The clause isn't anchor-matched → the gate leaves it untouched.
    const DISALLOW = { id: "dis", name: "Disallow", type: "Instant",
      oracle: "Counter target spell, activated ability, or triggered ability.", mana: "{1}{U}{U}" };
    const state = responseState({ userHand: [DISALLOW], userPool: { U: 5, C: 5 }, stack: [] });
    expect(filterActions(legalActionsForPlayer(state, "user"), "cast-spell").some(c => c.cardId === DISALLOW.id)).toBe(true);
  });

  it("does NOT touch non-counter no-target spells (a plain draw spell is still offered at an empty stack)", () => {
    const DIVINATION = { id: "draw", name: "Divination", type: "Sorcery", oracle: "Draw two cards.", mana: "{2}{U}" };
    // own main, empty stack so a sorcery is castable
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const state = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [],
      players: { ...s.players, user: { ...s.players.user, hand: [DIVINATION], manaPool: { ...s.players.user.manaPool, U: 5, C: 5 } } } };
    expect(filterActions(legalActionsForPlayer(state, "user"), "cast-spell").some(c => c.cardId === "draw")).toBe(true);
  });
});
