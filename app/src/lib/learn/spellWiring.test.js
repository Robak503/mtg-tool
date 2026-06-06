/**
 * PR 11.2 wiring — a targeted spell surfaces per-target cast actions, resolves
 * its effect through the stack, and the AI aims removal at an enemy creature.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

function cr(name, id, controller, { power = 3, toughness = 3 } = {}) {
  return { id, card: { name, type: "Creature — Bear", power, toughness, oracle: "" }, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
}

function mainState({ who = "user", userHand = [], aiHand = [], userBf = [], aiBf = [], userPool = {}, aiPool = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    phase: "precombat-main",
    step: "main",
    activePlayer: who,
    priorityHolder: who,
    startingPlayer: "user",
    consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, hand: userHand, battlefield: userBf, manaPool: { ...s.players.user.manaPool, ...userPool } },
      ai: { ...s.players.ai, hand: aiHand, battlefield: aiBf, manaPool: { ...s.players.ai.manaPool, ...aiPool } },
    },
  };
}

const BOLT = { id: "bolt", name: "Lightning Bolt", type: "Instant", oracle: "Lightning Bolt deals 3 damage to any target.", mana: "{R}" };
const DOOM = { id: "doom", name: "Doom Blade", type: "Instant", oracle: "Destroy target creature.", mana: "{1}{B}" };

describe("targeted spell — end to end", () => {
  it("surfaces one cast action per legal target", () => {
    const state = mainState({ userHand: [BOLT], userPool: { R: 1 }, aiBf: [cr("Ogre", "ogre", "ai")] });
    const casts = filterActions(legalActionsForPlayer(state, "user"), "cast-spell");
    // any target → the one creature + both players = 3 options.
    const targetIds = casts.map(c => c.targets?.[0]?.id).sort();
    expect(targetIds).toEqual(["ai", "ogre", "user"]);
  });

  it("resolving a bolt at a creature kills it", () => {
    const state = mainState({ userHand: [BOLT], userPool: { R: 1 }, aiBf: [cr("Ogre", "ogre", "ai", { power: 3, toughness: 3 })] });
    const casts = filterActions(legalActionsForPlayer(state, "user"), "cast-spell");
    const killShot = casts.find(c => c.targets?.[0]?.id === "ogre");
    expect(killShot).toBeTruthy();
    const onStack = dispatchAction(state, killShot);
    expect(onStack.stack).toHaveLength(1);
    const resolved = resolveTopOfStack(onStack);
    expect(resolved.players.ai.graveyard.map(c => c.name)).toEqual(["Ogre"]);
  });

  it("resolving a bolt at a player drains life", () => {
    const state = mainState({ userHand: [BOLT], userPool: { R: 1 } });
    const casts = filterActions(legalActionsForPlayer(state, "user"), "cast-spell");
    const faceBurn = casts.find(c => c.targets?.[0]?.id === "ai");
    const resolved = resolveTopOfStack(dispatchAction(state, faceBurn));
    expect(resolved.players.ai.life).toBe(37);
  });
});

describe("restricted targeting — end to end (P2.4)", () => {
  it("'an opponent controls' removal only surfaces the opponent's creatures, not your own", () => {
    const DISFAVOR = { id: "disf", name: "Disfavor", type: "Sorcery", oracle: "Destroy target creature an opponent controls.", mana: "{B}" };
    const state = mainState({ userHand: [DISFAVOR], userPool: { B: 1 }, userBf: [cr("Mine", "mine", "user")], aiBf: [cr("Theirs", "theirs", "ai")] });
    const casts = filterActions(legalActionsForPlayer(state, "user"), "cast-spell");
    const targetIds = casts.map(c => c.targets?.[0]?.id).sort();
    expect(targetIds).toEqual(["theirs"]); // your own "mine" is no longer a legal target
  });

  it("a power restriction only surfaces creatures within the power bound", () => {
    const SMITE = { id: "smite", name: "Smite the Weak", type: "Instant", oracle: "Destroy target creature with power 2 or less.", mana: "{W}" };
    const state = mainState({ userHand: [SMITE], userPool: { W: 1 }, aiBf: [cr("Weak", "weak", "ai", { power: 1, toughness: 1 }), cr("Strong", "strong", "ai", { power: 5, toughness: 5 })] });
    const casts = filterActions(legalActionsForPlayer(state, "user"), "cast-spell");
    expect(casts.map(c => c.targets?.[0]?.id)).toEqual(["weak"]);
  });
});

describe("AI removal targeting", () => {
  it("aims Doom Blade at the user's creature, not its own", () => {
    const state = mainState({
      who: "ai",
      aiHand: [DOOM],
      aiPool: { B: 1, C: 1 },
      userBf: [cr("Threat", "threat", "user", { power: 5, toughness: 5 })],
      aiBf: [cr("Mine", "mine", "ai", { power: 2, toughness: 2 })],
    });
    const picked = pickAction(state, "ai", legalActionsForPlayer(state, "ai"));
    expect(picked.kind).toBe("cast-spell");
    expect(picked.cardId).toBe("doom");
    expect(picked.targets[0].id).toBe("threat"); // the enemy creature, not "mine"
  });

  it("won't cast removal when it has no enemy creature to hit", () => {
    const state = mainState({
      who: "ai",
      aiHand: [DOOM],
      aiPool: { B: 1, C: 1 },
      aiBf: [cr("Mine", "mine", "ai")], // only a friendly creature
    });
    const picked = pickAction(state, "ai", legalActionsForPlayer(state, "ai"));
    // Should NOT cast Doom Blade on its own creature — passes (or does something else).
    expect(picked?.kind === "cast-spell" && picked.cardId === "doom").toBe(false);
  });
});
