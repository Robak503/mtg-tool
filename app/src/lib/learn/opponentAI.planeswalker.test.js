/**
 * AI piloting of planeswalkers (PW-3): the AI activates a beneficial MODELED loyalty ability each
 * turn (preferring an enemy-side removal, else a loyalty-building +N; never a self-harm variant, never
 * an Arbiter-routed one), and diverts a clean swing to remove a dangerous enemy walker.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { pickAction, pickLoyaltyAction, pickAttackPlan } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

const pw = (name, oracle, over = {}) =>
  ({ id: `card-${name}`, name, type: "Legendary Planeswalker — Test", loyalty: "3", mana: "", oracle, ...over });
const creature = (name, over = {}) => ({ id: `card-${name}`, name, type: "Creature — Bear", type_line: "Creature — Bear", power: 2, toughness: 2, oracle: "", ...over });

function pwPerm(id, card, controller, loyalty = 3) {
  const p = createPermanent({ id, card, controller, summoningSick: false });
  return { ...p, counters: { ...p.counters, loyalty } };
}
function aiMain(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "ai", priorityHolder: "ai", phase: "precombat-main", step: "main", startingPlayer: "ai", ...over };
}
function withBf(state, pid, perms) {
  return { ...state, players: { ...state.players, [pid]: { ...state.players[pid], battlefield: perms } } };
}
const loyaltyActs = (s) => legalActionsForPlayer(s, "ai").filter((a) => a.kind === "activate-loyalty");

describe("AI loyalty-ability piloting", () => {
  it("prefers an enemy-side removal over a +N tick-up", () => {
    const walker = pwPerm("pw", pw("W", "+1: Draw a card.\n−2: Destroy target creature."), "ai", 3);
    const enemyCreature = createPermanent({ id: "ec", card: creature("Goblin"), controller: "user", summoningSick: false });
    let s = withBf(aiMain(), "ai", [walker]);
    s = withBf(s, "user", [enemyCreature]);
    const pick = pickLoyaltyAction(s, "ai", loyaltyActs(s));
    expect(pick.costDelta).toBe(-2);
    expect(pick.targets[0].id).toBe("ec"); // the enemy creature, not a friendly
  });

  it("never picks a self-harm variant (−N destroy aimed at the AI's own creature)", () => {
    const walker = pwPerm("pw", pw("W", "+1: Draw a card.\n−2: Destroy target creature."), "ai", 3);
    const ownCreature = createPermanent({ id: "own", card: creature("MyBear"), controller: "ai", summoningSick: false });
    // No enemy creature → the only −2 targets the AI's own creature → unsafe → AI ticks up instead.
    const s = withBf(aiMain(), "ai", [walker, ownCreature]);
    const pick = pickLoyaltyAction(s, "ai", loyaltyActs(s));
    expect(pick.costDelta).toBe(1); // the +1 draw, not the self-destroy
  });

  it("falls back to a loyalty-building +N when there's no removal target", () => {
    const walker = pwPerm("pw", pw("W", "+1: Draw a card.\n−2: Destroy target creature."), "ai", 3);
    const s = withBf(aiMain(), "ai", [walker]); // no creatures anywhere → −2 has no legal target
    const pick = pickLoyaltyAction(s, "ai", loyaltyActs(s));
    expect(pick.costDelta).toBe(1);
  });

  it("pickAction activates a loyalty ability when no land/cast is available", () => {
    const walker = pwPerm("pw", pw("W", "+1: Draw a card."), "ai", 3);
    const s = withBf(aiMain(), "ai", [walker]);
    const acts = legalActionsForPlayer(s, "ai");
    const chosen = pickAction(s, "ai", acts);
    expect(chosen.kind).toBe("activate-loyalty");
  });

  it("pickAction does NOT activate an Arbiter-routed (unmodeled) ability — it passes instead", () => {
    const walker = pwPerm("pw", pw("W", "−6: You get an emblem with \"X\"."), "ai", 6); // only an unmodeled ability
    const s = withBf(aiMain(), "ai", [walker]);
    const chosen = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(chosen.kind).toBe("pass-priority"); // no native loyalty to use → no self-play stall
  });
});

describe("AI attacking enemy planeswalkers", () => {
  // AI has a 3-power attacker; the user has a 2-loyalty walker and NO blockers.
  function combatState(extraUser = []) {
    const attacker = createPermanent({ id: "att", card: creature("Striker", { power: 3, toughness: 3 }), controller: "ai", summoningSick: false });
    let s = aiMain({ phase: "combat", step: "declare-attackers" });
    s = withBf(s, "ai", [attacker]);
    const enemyPw = pwPerm("upw", pw("UserWalker", "+1: Draw a card."), "user", 2);
    s = withBf(s, "user", [enemyPw, ...extraUser]);
    return s;
  }

  it("diverts a clean swing to kill a dangerous enemy walker", () => {
    const s = combatState();
    s.players.user.life = 40; // not lethal on the player
    const acts = legalActionsForPlayer(s, "ai").filter((a) => a.kind === "declare-attacker");
    const plan = pickAttackPlan(s, "ai", acts);
    expect(plan[0].defenderPlaneswalkerId).toBe("upw"); // attacks the walker, not the face
  });

  it("goes face (ignores the walker) when the swing is lethal on the player", () => {
    const s = combatState();
    s.players.user.life = 2; // a 3-power unblocked attacker is lethal
    const acts = legalActionsForPlayer(s, "ai").filter((a) => a.kind === "declare-attacker");
    const plan = pickAttackPlan(s, "ai", acts);
    expect(plan[0].defenderPlaneswalkerId).toBeUndefined();
    expect(plan[0].defenderId).toBe("user");
  });

  it("does NOT divert to the walker when its controller has an untapped blocker (not a clean kill)", () => {
    const s = combatState([createPermanent({ id: "blk", card: creature("Wall", { toughness: 4 }), controller: "user", summoningSick: false })]);
    s.players.user.life = 40;
    const acts = legalActionsForPlayer(s, "ai").filter((a) => a.kind === "declare-attacker");
    const plan = pickAttackPlan(s, "ai", acts);
    expect(plan.every((a) => a.defenderPlaneswalkerId === undefined)).toBe(true);
  });
});
