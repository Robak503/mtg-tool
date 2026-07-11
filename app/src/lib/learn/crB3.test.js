/**
 * crB3.test.js — CR-remediation B3: turn-structure and mandatory actions.
 *
 *  - CR 514.1: the cleanup-step hand-size discard (previously entirely unenforced — every pilot could
 *    hoard an unlimited hand). Raised as the "cleanup-discard" pendingChoice; the settler re-raises
 *    until the hand is at the max, then runs the deferred 514.2 tail. "You have no maximum hand size"
 *    (Reliquary Tower) exempts its controller; any OTHER hand-size-modifying text on any battlefield
 *    suspends enforcement entirely (CREED — never force a discard the real rules might not require).
 *  - CR 508.8/511.1: a combat with no declared attackers skips declare-blockers and combat-damage
 *    entirely (the steps never begin).
 */
import { describe, it, expect, beforeEach } from "vitest";

import { runStepActions, advanceStep, settleCleanupDiscardChoice, cleanupDiscardExcess } from "./gameEngine.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

function card(name, i) {
  return { id: `c${i}-${name}`, name, type: "Sorcery", oracle: "" };
}
function perm(name, id, controller, { type = "Land", oracle = "" } = {}) {
  return { id, card: { name, type, oracle }, controller, tapped: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
}
function atCleanup({ handSize = 0, userBf = [], aiBf = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    activePlayer: "user",
    phase: "ending",
    step: "cleanup",
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf, hand: Array.from({ length: handSize }, (_, i) => card(`Card ${i}`, i)) },
      ai: { ...s.players.ai, battlefield: aiBf },
    },
  };
}

describe("CR 514.1 — cleanup hand-size discard", () => {
  it("a 9-card hand at cleanup raises the cleanup-discard choice (count 2); settling twice discards to 7 and runs the tail", () => {
    const raised = runStepActions(atCleanup({ handSize: 9 }));
    expect(raised.pendingChoice).toMatchObject({ kind: "cleanup-discard", controller: "user", count: 2 });
    expect(raised.pendingChoice.candidates).toHaveLength(9);

    const afterOne = settleCleanupDiscardChoice(raised, raised.pendingChoice.candidates[0].id);
    expect(afterOne.pendingChoice).toMatchObject({ kind: "cleanup-discard", count: 1 });
    expect(afterOne.players.user.hand).toHaveLength(8);

    const done = settleCleanupDiscardChoice(afterOne, afterOne.pendingChoice.candidates[0].id);
    expect(done.pendingChoice ?? null).toBeNull();
    expect(done.players.user.hand).toHaveLength(7);
    expect(done.players.user.graveyard).toHaveLength(2);
    // The deferred 514.2 tail ran exactly once, at the end of the chain.
    expect(done.log.filter((e) => e.kind === "step" && e.step === "cleanup")).toHaveLength(1);
  });

  it("a 7-card hand raises nothing — the tail runs inline (pre-B3 flow)", () => {
    const after = runStepActions(atCleanup({ handSize: 7 }));
    expect(after.pendingChoice ?? null).toBeNull();
    expect(after.log.some((e) => e.kind === "step" && e.step === "cleanup")).toBe(true);
  });

  it("Reliquary Tower ('You have no maximum hand size.') exempts its controller", () => {
    const tower = perm("Reliquary Tower", "rt1", "user", { oracle: "{T}: Add {C}.\nYou have no maximum hand size." });
    const after = runStepActions(atCleanup({ handSize: 12, userBf: [tower] }));
    expect(after.pendingChoice ?? null).toBeNull();
    expect(after.players.user.hand).toHaveLength(12);
  });

  it("any OTHER maximum-hand-size text on ANY battlefield suspends enforcement (the conservative guard)", () => {
    const rack = perm("Cursed Rack", "cr1", "ai", { type: "Artifact", oracle: "As this artifact enters, choose a player.\nThe chosen player's maximum hand size is four." });
    expect(cleanupDiscardExcess(atCleanup({ handSize: 9, aiBf: [rack] }), "user")).toBe(0);
    const after = runStepActions(atCleanup({ handSize: 9, aiBf: [rack] }));
    expect(after.pendingChoice ?? null).toBeNull();
  });

  it("a stale pick discards nothing but re-derives from the live hand — the discard can't be skipped", () => {
    const raised = runStepActions(atCleanup({ handSize: 8 }));
    const after = settleCleanupDiscardChoice(raised, "not-a-real-card-id");
    expect(after.pendingChoice).toMatchObject({ kind: "cleanup-discard", count: 1 });
    expect(after.players.user.hand).toHaveLength(8);
  });
});

describe("CR 508.8/511.1 — no-attackers combat skips the blocker/damage steps", () => {
  function atDeclareAttackers(attackers) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, activePlayer: "user", phase: "combat", step: "declare-attackers", combat: { attackers, blockers: [] } };
  }

  it("leaving declare-attackers with NO attackers jumps straight to end-of-combat", () => {
    const after = advanceStep(atDeclareAttackers([]));
    expect(after.step).toBe("end-of-combat");
  });

  it("with attackers declared, the normal sequence proceeds to declare-blockers", () => {
    const after = advanceStep(atDeclareAttackers([{ permanentId: "a1", attackingPlayer: "user", defender: "ai" }]));
    expect(after.step).toBe("declare-blockers");
  });
});
