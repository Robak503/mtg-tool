/**
 * WI-5 KIND ECHO-CHECK — applyPendingChoice (learnSession.js) rejects a submitted choice whose `kind`
 * doesn't match the CURRENT state.pendingChoice.kind, instead of dispatching it to whichever settler is
 * live. Every useLearnSession apply* method now stamps its payload with its own expected kind
 * (useLearnSession.js) — this pins the SERVER-SIDE half: a stale/cross-kind submit (e.g. a double-click
 * race that lands a soft-counter's `{kind:"soft-counter", pay:false}` after the server already advanced
 * to a DIFFERENT pending choice) is silently dropped and re-derived instead of misinterpreted by the wrong
 * settler. A choice with NO kind field (a raw API client, or a body with no kind) is unaffected —
 * purely additive, backward-compatible.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { advanceUntilDecision, applyPendingChoice } from "./learnSession.js";
import { setPendingSoftCounterChoice, setPendingOptionalManaPaymentChoice } from "./pendingChoice.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

function baseState() {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...base,
    phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
  };
}

describe("WI-5 kind echo-check — cross-kind submit is dropped, not misdispatched", () => {
  it("a soft-counter's {kind, pay} submitted against a DIFFERENT pending optional-mana-payment is rejected (re-derives, stays pending)", () => {
    const state = setPendingOptionalManaPaymentChoice(baseState(), {
      controller: "user",
      cost: { kind: "mana", mana: { generic: 1, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } },
      effectAtoms: [],
      sourceName: "Test Source",
    });
    const pending = { status: "active", state, difficulty: "beginner", decisionLog: [] };
    const { session, decision } = applyPendingChoice(pending, { kind: "soft-counter", pay: false });
    // The stale cross-kind submit must NOT be read as a decline of the optional-mana-payment — the choice
    // stays pending, unresolved, for the CORRECT kind.
    expect(decision.kind).toBe("optional-mana-payment");
    expect(session.state.pendingChoice?.kind).toBe("optional-mana-payment");
  });

  it("matching kind dispatches normally (no regression)", () => {
    const state = setPendingSoftCounterChoice(baseState(), { controller: "user", amount: 0, spellId: "nonexistent" }); // amount 0 → always affordable
    const pending = { status: "active", state, difficulty: "beginner", decisionLog: [] };
    const { session } = applyPendingChoice(pending, { kind: "soft-counter", pay: true });
    expect(session.state.pendingChoice).toBeUndefined(); // settled
  });

  it("a choice with NO kind field is unaffected (legacy / raw API client) — dispatches by state alone", () => {
    const state = setPendingSoftCounterChoice(baseState(), { controller: "user", amount: 0, spellId: "nonexistent" });
    const pending = { status: "active", state, difficulty: "beginner", decisionLog: [] };
    const { session } = applyPendingChoice(pending, { pay: true }); // no kind
    expect(session.state.pendingChoice).toBeUndefined(); // settled — unchanged legacy behavior
  });

  it("no pendingChoice at all + a kind-stamped choice re-derives cleanly (no crash)", () => {
    const pending = { status: "active", state: baseState(), difficulty: "beginner", decisionLog: [] };
    expect(() => applyPendingChoice(pending, { kind: "soft-counter", pay: true })).not.toThrow();
  });

  it("advanceUntilDecision on the untouched session still surfaces the original pending choice after a dropped cross-kind submit", () => {
    const state = setPendingOptionalManaPaymentChoice(baseState(), {
      controller: "user",
      cost: { kind: "mana", mana: { generic: 1, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } },
      effectAtoms: [],
      sourceName: "Test Source",
    });
    const pending = { status: "active", state, difficulty: "beginner", decisionLog: [] };
    const { session: afterDrop } = applyPendingChoice(pending, { kind: "hand-discard", cardId: "garbage" });
    const { decision } = advanceUntilDecision(afterDrop);
    expect(decision.kind).toBe("optional-mana-payment"); // still there — the client can resubmit correctly
  });
});
