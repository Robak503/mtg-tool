/**
 * CMD-RETURN (CR 903.9) — when a commander is in a graveyard/exile, its OWNER may put it back in the
 * command zone. The SBA `returnCommandersToZone` auto-returns an AI commander (so it can recast) and sets
 * a pending yes/no for the HUMAN (never auto — 903.9 is the owner's choice). The tax (commanderCastCount,
 * CR 903.8) persists across the return. PR2 of the commander framework (builds on CMD-CAST).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { returnCommandersToZone, settleCommanderReturnChoice, advanceUntilDecision, applyPendingChoice } from "./learnSession.js";
import { _resetIdsForTests, createGameState, moveCardToZone } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const cmdr = (id) => ({ id, name: `General ${id}`, type: "Legendary Creature — Avatar", oracle: "", isCommander: true });

function withDeadCommander(pid, { zone = "graveyard", castCount = 0 } = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...base,
    phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...base.players,
      [pid]: { ...base.players[pid], [zone]: [cmdr(`${pid}-c`)], commanderCastCount: { [`${pid}-c`]: castCount } },
    },
  };
}

describe("CMD-RETURN — returnCommandersToZone SBA", () => {
  it("AUTO-returns an AI commander from the graveyard to the command zone (no pending choice)", () => {
    const after = returnCommandersToZone(withDeadCommander("ai"));
    expect(after.players.ai.graveyard).toHaveLength(0);
    expect(after.players.ai.command.some((c) => c.id === "ai-c")).toBe(true);
    expect(after.pendingChoice).toBeUndefined();
  });
  it("also returns from EXILE (903.9a covers both dead zones)", () => {
    const after = returnCommandersToZone(withDeadCommander("ai", { zone: "exile" }));
    expect(after.players.ai.exile).toHaveLength(0);
    expect(after.players.ai.command.some((c) => c.id === "ai-c")).toBe(true);
  });
  it("OFFERS the human a choice (sets pendingChoice) — never auto-returns the human's commander", () => {
    const after = returnCommandersToZone(withDeadCommander("user"));
    expect(after.pendingChoice).toMatchObject({ kind: "commander-return", controller: "user", zone: "graveyard", cardId: "user-c" });
    expect(after.players.user.graveyard).toHaveLength(1); // still in the graveyard, pending the decision
  });
  it("a commander with no command zone (Standard) is a no-op — no throw, no pending", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] }); // no commanders
    expect(returnCommandersToZone(base)).toBe(base);
  });
});

describe("CMD-RETURN — settleCommanderReturnChoice", () => {
  it("return=true moves the commander to the command zone + preserves the tax counter", () => {
    let s = withDeadCommander("user", { castCount: 2 });
    s = returnCommandersToZone(s);                      // sets the pending choice
    s = settleCommanderReturnChoice(s, true);
    expect(s.pendingChoice).toBeUndefined();
    expect(s.players.user.command.some((c) => c.id === "user-c")).toBe(true);
    expect(s.players.user.graveyard).toHaveLength(0);
    expect(s.players.user.commanderCastCount["user-c"]).toBe(2); // CR 903.8 — tax persists across the return
  });
  it("return=false leaves it in the graveyard, marked so the SBA won't re-offer it", () => {
    let s = withDeadCommander("user");
    s = returnCommandersToZone(s);
    s = settleCommanderReturnChoice(s, false);
    expect(s.pendingChoice).toBeUndefined();
    const dead = s.players.user.graveyard.find((c) => c.id === "user-c");
    expect(dead?._returnHandled).toBe(true);
    // re-running the SBA does NOT re-offer the declined commander while it sits in the graveyard
    expect(returnCommandersToZone(s).pendingChoice).toBeUndefined();
  });

  it("4b P2: a DECLINED commander is re-offered after it leaves the graveyard (reanimate → re-death)", () => {
    let s = withDeadCommander("user");
    s = settleCommanderReturnChoice(returnCommandersToZone(s), false); // decline → _returnHandled
    expect(returnCommandersToZone(s).pendingChoice).toBeUndefined();   // not re-offered while it sits

    // Reanimate: graveyard → battlefield strips the stale decline marker (CR 903.9a "since last check").
    s = moveCardToZone(s, { playerId: "user", fromZone: "graveyard", toZone: "battlefield", cardId: "user-c", becomePermanent: true });
    const perm = s.players.user.battlefield.find((p) => p.card.id === "user-c");
    expect(perm.card._returnHandled).toBeUndefined();

    // It dies AGAIN → a fresh graveyard arrival → the SBA re-offers the return (no longer stranded).
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: perm.id });
    expect(returnCommandersToZone(s).pendingChoice).toMatchObject({ kind: "commander-return", cardId: "user-c" });
  });
});

describe("CMD-RETURN — driver loop", () => {
  it("surfaces a commander-return decision for the human at beginner", () => {
    const session = { status: "active", state: withDeadCommander("user"), difficulty: "beginner", decisionLog: [] };
    const { decision } = advanceUntilDecision(session);
    expect(decision.kind).toBe("commander-return");
    expect(decision.cardId).toBe("user-c");
  });
});

describe("CMD-RETURN — /api/learn/choose resolution (applyPendingChoice)", () => {
  it("choice.return=true sends the commander back to the command zone + logs it + preserves the tax", () => {
    const pending = { status: "active", state: returnCommandersToZone(withDeadCommander("user", { castCount: 1 })), difficulty: "beginner", decisionLog: [] };
    expect(pending.state.pendingChoice?.kind).toBe("commander-return");
    const { session } = applyPendingChoice(pending, { return: true });
    expect(session.state.players.user.command.some((c) => c.id === "user-c")).toBe(true);
    expect(session.state.players.user.graveyard).toHaveLength(0);
    expect(session.state.players.user.commanderCastCount["user-c"]).toBe(1); // tax persists across the return
    expect(session.decisionLog.some((e) => e.action?.kind === "commander-return" && e.action.returned === true)).toBe(true);
  });
  it("choice.return=false leaves the commander in the graveyard", () => {
    const pending = { status: "active", state: returnCommandersToZone(withDeadCommander("user")), difficulty: "beginner", decisionLog: [] };
    const { session } = applyPendingChoice(pending, { return: false });
    expect(session.state.players.user.graveyard.some((c) => c.id === "user-c")).toBe(true);
    expect(session.state.players.user.command.some((c) => c.id === "user-c")).toBe(false);
  });
});
