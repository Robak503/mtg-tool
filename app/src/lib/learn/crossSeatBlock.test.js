/**
 * CR 509.1a — the DEFENDER-IDENTITY block gate (CR-remediation B1).
 *
 * "For each of the chosen creatures, the defending player chooses one creature for it to block
 *  THAT'S ATTACKING THAT PLAYER, a planeswalker they control, or a battle they protect."
 *
 * The bug this pins closed: in a 4-seat pod, `canBlockAttacker` never read the attacker's declared
 * `defender`, so seat C's creatures were offered (and could dispatch) blocks against an attacker
 * aimed at seat D — denying D the combat it was owed and fighting C's creature in a combat it was
 * never part of. Three layers, all asserted here:
 *   1. canBlockAttacker — pairwise gate (declared entry → defender identity enforced;
 *      NO entry → hypothetical attack-planning probe, gate stays out of the way).
 *   2. actionsDeclareBlocker enumeration (the real legalChoices path, attackers from live combat).
 *   3. applyDeclareBlocker — hard dispatch guard (a stray/replayed cross-seat action throws).
 */
import { describe, it, expect, beforeEach } from "vitest";

import { canBlockAttacker } from "./combatEvasion.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction, DispatcherError } from "./actionDispatcher.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

function cr(name, id, controller, { power = 2, toughness = 2, oracle = "", type = "Creature — Bear" } = {}) {
  return {
    id,
    card: { name, type, power, toughness, oracle },
    controller,
    tapped: false,
    summoningSick: false,
    counters: {},
    damageMarked: 0,
    attachments: [],
    attachedTo: null,
  };
}

/** 4-seat commander pod: user attacks; ai1 and ai2 each hold an untapped bear. */
function podState({ attackers = [] } = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return {
    ...s,
    activePlayer: "user",
    phase: "combat",
    step: "declare-blockers",
    combat: { attackers, blockers: [] },
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: [cr("Raider", "att1", "user")] },
      ai1: { ...s.players.ai1, battlefield: [cr("Bystander Bear", "c-blk", "ai1")] },
      ai2: { ...s.players.ai2, battlefield: [cr("Defender Bear", "d-blk", "ai2")] },
    },
  };
}

const AIMED_AT_AI2 = [{ permanentId: "att1", attackingPlayer: "user", defender: "ai2" }];

describe("CR 509.1a — canBlockAttacker defender-identity gate", () => {
  it("a declared attacker can be blocked ONLY by the seat it attacks", () => {
    const s = podState({ attackers: AIMED_AT_AI2 });
    expect(canBlockAttacker(s, "d-blk", "att1", "ai2")).toBe(true); // the attacked seat blocks
    expect(canBlockAttacker(s, "c-blk", "att1", "ai1")).toBe(false); // a bystander seat must not
  });

  it("an UNDECLARED attacker (no combat entry) stays probe-able — the attack-planning path", () => {
    const s = podState({ attackers: [] }); // hypothetical: opponentAI evaluating a future attack
    expect(canBlockAttacker(s, "c-blk", "att1", "ai1")).toBe(true);
    expect(canBlockAttacker(s, "d-blk", "att1", "ai2")).toBe(true);
  });
});

describe("CR 509.1a — enumeration (the real legalChoices path, attackers from live combat)", () => {
  it("the attacked seat is offered the block; the bystander seat is offered NOTHING", () => {
    const s = podState({ attackers: AIMED_AT_AI2 });
    const forDefender = filterActions(legalActionsForPlayer(s, "ai2"), "declare-blocker");
    const forBystander = filterActions(legalActionsForPlayer(s, "ai1"), "declare-blocker");
    expect(forDefender).toHaveLength(1);
    expect(forDefender[0]).toMatchObject({ playerId: "ai2", permanentId: "d-blk", attackerId: "att1" });
    expect(forBystander).toHaveLength(0);
  });
});

describe("CR 509.1a — applyDeclareBlocker hard guard", () => {
  it("a cross-seat block action throws CROSS_SEAT_BLOCK; the legal block dispatches", () => {
    const s = podState({ attackers: AIMED_AT_AI2 });
    expect(() =>
      dispatchAction(s, { kind: "declare-blocker", playerId: "ai1", permanentId: "c-blk", attackerId: "att1" }),
    ).toThrow(DispatcherError);
    let code = null;
    try {
      dispatchAction(s, { kind: "declare-blocker", playerId: "ai1", permanentId: "c-blk", attackerId: "att1" });
    } catch (e) {
      code = e.code;
    }
    expect(code).toBe("CROSS_SEAT_BLOCK");

    const after = dispatchAction(s, { kind: "declare-blocker", playerId: "ai2", permanentId: "d-blk", attackerId: "att1" });
    expect(after.combat.blockers).toHaveLength(1);
    expect(after.combat.blockers[0]).toMatchObject({ blockerId: "d-blk", attackerId: "att1", blockingPlayer: "ai2" });
  });

  it("blocking a creature that is not in combat at all throws ATTACKER_NOT_IN_COMBAT", () => {
    const s = podState({ attackers: AIMED_AT_AI2 });
    let code = null;
    try {
      dispatchAction(s, { kind: "declare-blocker", playerId: "ai2", permanentId: "d-blk", attackerId: "ghost-attacker" });
    } catch (e) {
      code = e.code;
    }
    expect(code).toBe("ATTACKER_NOT_IN_COMBAT");
  });
});
