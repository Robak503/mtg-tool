/**
 * Integration tests for ADDCOST — spell additional costs on the CAST path (CR 601.2f).
 *
 * Slice 1: a chosen-victim sacrifice ("As an additional cost to cast this spell, sacrifice a/an <type>").
 * The cost is paid AT CAST, before the spell resolves. End-to-end:
 *   parser            → attaches `program.additionalCosts` (effects/parser.js)
 *   legalChoices      → one cast action per legal victim; uncastable when none can be sacrificed
 *   actionDispatcher  → pays it via the γ1b `sacrificePermanentForCost` helper, then puts the spell on the stack
 *   gameEngine        → resolves the (cost-paid) spell's effect
 *
 * The CREED-critical assertion is that the victim actually LEAVES play — a spell that resolves while
 * silently skipping its sacrifice would be the cardinal false positive.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// Bone Splinters — the canonical sac-to-cast removal spell.
const BONE_SPLINTERS = "As an additional cost to cast this spell, sacrifice a creature.\nDestroy target creature.";

function creature(name, oracle = "", over = {}) {
  return { id: `card-${name}`, name, type: "Creature — Goblin", power: 2, toughness: 2, oracle, ...over };
}
function spellCard(over = {}) {
  return { id: "card-bone", name: "Bone Splinters", type: "Sorcery", mana: "{B}", oracle: BONE_SPLINTERS, ...over };
}
function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function setup({ userPerms = [], aiPerms = [], hand = [], mana = {} } = {}) {
  let s = mainState();
  s = {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userPerms, hand, manaPool: { ...s.players.user.manaPool, ...mana } },
      ai: { ...s.players.ai, battlefield: aiPerms },
    },
  };
  return s;
}
const casts = (state, pid = "user") => legalActionsForPlayer(state, pid).filter((a) => a.kind === "cast-spell");

describe("ADDCOST — legal cast actions (enumerate + gate)", () => {
  it("offers Bone Splinters once per legal victim, with the chosen victim frozen on", () => {
    const myGuy = createPermanent({ id: "perm-mine", card: creature("My Goblin"), controller: "user", summoningSick: false });
    const enemy = createPermanent({ id: "perm-enemy", card: creature("Their Goblin"), controller: "ai", summoningSick: false });
    const s = setup({ userPerms: [myGuy], aiPerms: [enemy], hand: [spellCard()], mana: { B: 1 } });

    const acts = casts(s);
    // Only the sensible combo survives: sac my creature, destroy the ENEMY (sac'ing the very creature you'd
    // target is dropped — it would fizzle, CR 608.2b).
    expect(acts.length).toBe(1);
    expect(acts[0]).toMatchObject({ name: "Bone Splinters", sacCreatureId: "perm-mine", sacCreatureName: "My Goblin" });
    expect(acts[0].targets[0].id).toBe("perm-enemy");
  });

  it("is UNCASTABLE when the controller has no creature to sacrifice (the cost can't be paid)", () => {
    const enemy = createPermanent({ id: "perm-enemy", card: creature("Their Goblin"), controller: "ai", summoningSick: false });
    // User has the spell + mana but ZERO creatures of their own to sacrifice.
    const s = setup({ userPerms: [], aiPerms: [enemy], hand: [spellCard()], mana: { B: 1 } });
    expect(casts(s)).toHaveLength(0);
  });

  it("is UNCASTABLE when the only creature is BOTH the only victim and the only legal target (would fizzle)", () => {
    // Bone Splinters needs to sac a creature AND destroy a target creature. With exactly one creature on the
    // whole board (yours), the only sac victim is also the only destroy target — sacrificing it leaves the
    // spell with no legal target, so the (self-defeating) combo is dropped and the spell isn't offered.
    const onlyGuy = createPermanent({ id: "perm-only", card: creature("Lonely Goblin"), controller: "user", summoningSick: false });
    const s = setup({ userPerms: [onlyGuy], aiPerms: [], hand: [spellCard()], mana: { B: 1 } });
    expect(casts(s)).toHaveLength(0);
  });

  it("excludes a victim whose own leave-trigger the dies path can't fire (sacrificeDropsTrigger fail-safe)", () => {
    // The only creature available carries a 'leaves the battlefield' trigger — sacrificing it would silently
    // drop that trigger, so it's not a legal victim → the spell is uncastable rather than partially applied.
    const tricky = createPermanent({
      id: "perm-ltb",
      card: creature("Cartographer", "When Cartographer leaves the battlefield, draw a card."),
      controller: "user", summoningSick: false,
    });
    const enemy = createPermanent({ id: "perm-enemy", card: creature("Their Goblin"), controller: "ai", summoningSick: false });
    const s = setup({ userPerms: [tricky], aiPerms: [enemy], hand: [spellCard()], mana: { B: 1 } });
    expect(casts(s)).toHaveLength(0);
  });
});

describe("ADDCOST — dispatch pays the cost, then the spell resolves", () => {
  it("sacrifices the chosen creature to the graveyard AND destroys the target", () => {
    const myGuy = createPermanent({ id: "perm-mine", card: creature("My Goblin"), controller: "user", summoningSick: false });
    const enemy = createPermanent({ id: "perm-enemy", card: creature("Their Goblin"), controller: "ai", summoningSick: false });
    const s = setup({ userPerms: [myGuy], aiPerms: [enemy], hand: [spellCard()], mana: { B: 1 } });
    const action = casts(s).find((a) => a.sacCreatureId === "perm-mine");

    const afterCast = dispatchAction(s, action);
    // Cost paid: my creature left the battlefield for the graveyard.
    expect(afterCast.players.user.battlefield.find((p) => p.id === "perm-mine")).toBeUndefined();
    expect(afterCast.players.user.graveyard.some((c) => c.id === "card-My Goblin")).toBe(true);
    // The spell is on the stack (cost paid, hand emptied of it).
    expect(afterCast.stack.some((o) => o.kind === "spell")).toBe(true);
    expect(afterCast.players.user.hand.some((c) => c.id === "card-bone")).toBe(false);

    // Resolve the spell → the enemy creature is destroyed.
    const afterResolve = resolveTopOfStack(afterCast);
    expect(afterResolve.players.ai.battlefield.find((p) => p.id === "perm-enemy")).toBeUndefined();
  });

  it("FAIL-FAST: dispatching a sac-cost spell with no victim chosen throws (never casts cost-free)", () => {
    const myGuy = createPermanent({ id: "perm-mine", card: creature("My Goblin"), controller: "user", summoningSick: false });
    const enemy = createPermanent({ id: "perm-enemy", card: creature("Their Goblin"), controller: "ai", summoningSick: false });
    const s = setup({ userPerms: [myGuy], aiPerms: [enemy], hand: [spellCard()], mana: { B: 1 } });
    const action = casts(s).find((a) => a.sacCreatureId === "perm-mine");
    // Strip the frozen victim — simulates a malformed action reaching the dispatcher.
    const unpaid = { ...action, sacCreatureId: undefined, sacCreatureName: undefined };
    expect(() => dispatchAction(s, unpaid)).toThrow(/sacrifice cost/i);
  });
});
