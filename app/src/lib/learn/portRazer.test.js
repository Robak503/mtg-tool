/**
 * portRazer.test.js — POD-SIM THREE · Killer Turts KT-1 (2026-09-05): Port Razer.
 *
 * The trigger line ("deals combat damage to a player → untap each creature you control; additional combat phase") was
 * already native. The card's OTHER line — "This creature can't attack a player it has already attacked this turn." — is
 * the extra-combat deck's own restriction: a defender requirement keyed on the ATTACKER's per-turn memo
 * (`attackedPlayersThisTurn`, stamped at declare-attacker beside `attackedThisTurn`, cleared with it at untap). The
 * enumeration passes the attacking permanent to defenderMeetsAttackRequirement; without it the check fails CLOSED.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-05).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { attackDefenderRequirementOf, defenderMeetsAttackRequirement } from "./combatEvasion.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, resetAttackedThisTurnAllPlayers } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const RAZER = { id: "c-razer", name: "Port Razer", type: "Creature — Orc Pirate", mana: "{3}{R}{R}", keywords: [], power: 4, toughness: 4,
  oracle: "Whenever this creature deals combat damage to a player, untap each creature you control. After this phase, there is an additional combat phase.\nThis creature can't attack a player it has already attacked this turn." };
const BEARS = { id: "c-bears", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", oracle: "", power: 2, toughness: 2 };

function board(userBf) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...g, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers", turn: 6,
    combat: { attackers: [], blockers: [] },
    players: { ...g.players, user: { ...g.players.user, battlefield: userBf } },
  };
}
const offered = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "declare-attacker").map((a) => a.permanentId);
const declare = (s, id) => {
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "declare-attacker" && a.permanentId === id);
  if (!act) throw new Error(`no declare-attacker offered for ${id}`);
  return dispatchAction(s, act);
};
// a second combat this turn: the same permanents (untapped, memo intact), a fresh attackers list
const nextCombat = (s) => ({ ...s, step: "declare-attackers", combat: { attackers: [], blockers: [] },
  players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => ({ ...p, tapped: false })) } } });

describe("reader + classifier", () => {
  it("the restriction line reads as a notAlreadyAttacked defender requirement; the card classifies native", () => {
    expect(attackDefenderRequirementOf(RAZER)).toEqual({ kind: "notAlreadyAttacked" });
    expect(classifyCard({ name: RAZER.name, type: RAZER.type, oracle: RAZER.oracle, mana: RAZER.mana, keywords: [] })).toBe("native-trigger");
    // fail closed: no attacker permanent threaded → not met
    expect(defenderMeetsAttackRequirement({}, "ai", { kind: "notAlreadyAttacked" })).toBe(false);
    expect(defenderMeetsAttackRequirement({}, "ai", { kind: "notAlreadyAttacked" }, { attackedPlayersThisTurn: [] })).toBe(true);
    expect(defenderMeetsAttackRequirement({}, "ai", { kind: "notAlreadyAttacked" }, { attackedPlayersThisTurn: ["ai"] })).toBe(false);
  });
});

describe("runtime — declare-attackers across two combats in one turn", () => {
  it("first combat: Razer and the bear are offered; Razer attacks and the memo records the defender", () => {
    let s = board([createPermanent({ id: "PR", card: RAZER, controller: "user", summoningSick: false }), createPermanent({ id: "B", card: BEARS, controller: "user", summoningSick: false })]);
    expect(offered(s)).toEqual(expect.arrayContaining(["PR", "B"]));
    s = declare(s, "PR");
    const razer = s.players.user.battlefield.find((p) => p.id === "PR");
    expect(razer.attackedThisTurn).toBe(true);
    expect(razer.attackedPlayersThisTurn).toEqual(["ai"]);
  });

  it("second combat the same turn: Razer is NOT offered against the player it already attacked; the bear still is; after untap Razer is offered again", () => {
    let s = board([createPermanent({ id: "PR", card: RAZER, controller: "user", summoningSick: false }), createPermanent({ id: "B", card: BEARS, controller: "user", summoningSick: false })]);
    s = declare(s, "PR");
    s = nextCombat(s);
    expect(offered(s)).toContain("B");
    expect(offered(s)).not.toContain("PR");
    const reset = nextCombat(resetAttackedThisTurnAllPlayers(s));
    expect(offered(reset)).toContain("PR");
    expect(reset.players.user.battlefield.find((p) => p.id === "PR").attackedPlayersThisTurn).toBeUndefined();
  });

  it("a plain bear with no restriction line attacks in both combats (the memo restricts only carriers)", () => {
    let s = board([createPermanent({ id: "B", card: BEARS, controller: "user", summoningSick: false })]);
    s = declare(s, "B");
    s = nextCombat(s);
    expect(offered(s)).toContain("B");
  });
});
