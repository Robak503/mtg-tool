/**
 * PENDING-CHOICE UI WIRING (WI-1) — pins the human-pause DECISION SHAPE for optional-mana-payment and
 * optional-sac-payment, the two pendingChoice kinds that previously had no LearnView panel / useLearnSession
 * method and soft-locked the Academy at beginner/intermediate (board renders, nothing actionable but Abandon).
 * The engine/settle layer already worked (optionalManaPayment.test.js, reflexiveSacBySubtype.test.js) — this
 * file pins the CLIENT-FACING contract: advanceUntilDecision must pause+surface the fields the new panels read
 * (OptionalManaPaymentPanel / OptionalSacPanel in LearnView.jsx), and applyPendingChoice must dispatch both.
 * Mirrors cmdReturn.test.js's "driver loop" + "/api/learn/choose resolution" describe blocks.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { advanceUntilDecision, applyPendingChoice } from "./learnSession.js";
import { setPendingOptionalManaPaymentChoice, setPendingOptionalSacBySubtypeChoice } from "./pendingChoice.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

function baseState() {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...base,
    phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
  };
}

describe("optional-mana-payment — human pause surfaces a decision the panel can render", () => {
  it("advanceUntilDecision pauses at beginner and carries controller/cost/sourceName/affordable", () => {
    const state = setPendingOptionalManaPaymentChoice(baseState(), {
      controller: "user",
      cost: { kind: "mana", mana: { generic: 1, W: 0, U: 0, B: 0, R: 0, G: 1, C: 0, hybrid: [] } },
      effectAtoms: [{ op: "draw", amount: 1 }],
      sourceName: "Lifecrafter's Bestiary",
    });
    const session = { status: "active", state, difficulty: "beginner", decisionLog: [] };
    const { decision } = advanceUntilDecision(session);
    expect(decision.kind).toBe("optional-mana-payment");
    expect(decision.controller).toBe("user");
    expect(decision.sourceName).toBe("Lifecrafter's Bestiary");
    expect(decision.cost).toMatchObject({ kind: "mana" });
    expect(typeof decision.affordable).toBe("boolean");
  });

  it("does NOT pause at expert (self-play never soft-locks)", () => {
    const state = setPendingOptionalManaPaymentChoice(baseState(), {
      controller: "user",
      cost: { kind: "mana", mana: { generic: 1, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } },
      effectAtoms: [],
      sourceName: "Test Source",
    });
    const session = { status: "active", state, difficulty: "expert", decisionLog: [] };
    const { decision } = advanceUntilDecision(session);
    expect(decision.kind).not.toBe("optional-mana-payment");
  });
});

describe("optional-sac-payment — human pause surfaces a decision the panel can render", () => {
  it("advanceUntilDecision pauses at beginner and carries controller/subtype/available/sourceName", () => {
    const state = setPendingOptionalSacBySubtypeChoice(baseState(), {
      controller: "user",
      subtype: "Food",
      available: true,
      effectAtoms: [{ op: "gain-life", amount: 3 }],
      sourceName: "The Goose Mother",
    });
    const session = { status: "active", state, difficulty: "beginner", decisionLog: [] };
    const { decision } = advanceUntilDecision(session);
    expect(decision.kind).toBe("optional-sac-payment");
    expect(decision.controller).toBe("user");
    expect(decision.subtype).toBe("Food");
    expect(decision.available).toBe(true);
    expect(decision.sourceName).toBe("The Goose Mother");
  });

  it("available:false rides through so the panel can disable the sac button", () => {
    const state = setPendingOptionalSacBySubtypeChoice(baseState(), {
      controller: "user",
      subtype: "Treasure",
      available: false,
      effectAtoms: [],
      sourceName: "Test Source",
    });
    const session = { status: "active", state, difficulty: "beginner", decisionLog: [] };
    const { decision } = advanceUntilDecision(session);
    expect(decision.available).toBe(false);
  });
});

describe("/api/learn/choose resolution — applyPendingChoice dispatches both kinds", () => {
  it("choice.pay=true resolves optional-mana-payment and clears the pause", () => {
    const state = setPendingOptionalManaPaymentChoice(baseState(), {
      controller: "user",
      cost: { kind: "mana", mana: { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } }, // free — always affordable
      effectAtoms: [],
      sourceName: "Test Source",
    });
    const pending = { status: "active", state, difficulty: "beginner", decisionLog: [] };
    const { session } = applyPendingChoice(pending, { pay: true });
    expect(session.state.pendingChoice).toBeUndefined();
    expect(session.decisionLog.some((e) => e.action?.kind === "optional-mana-payment-choice" && e.action.paid === true)).toBe(true);
  });

  it("choice.pay=false declines optional-mana-payment and clears the pause", () => {
    const state = setPendingOptionalManaPaymentChoice(baseState(), {
      controller: "user",
      cost: { kind: "mana", mana: { generic: 1, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } },
      effectAtoms: [],
      sourceName: "Test Source",
    });
    const pending = { status: "active", state, difficulty: "beginner", decisionLog: [] };
    const { session } = applyPendingChoice(pending, { pay: false });
    expect(session.state.pendingChoice).toBeUndefined();
    expect(session.decisionLog.some((e) => e.action?.kind === "optional-mana-payment-choice" && e.action.paid === false)).toBe(true);
  });

  it("choice.sac=false declines optional-sac-payment and clears the pause", () => {
    const state = setPendingOptionalSacBySubtypeChoice(baseState(), {
      controller: "user",
      subtype: "Food",
      available: true,
      effectAtoms: [],
      sourceName: "Test Source",
    });
    const pending = { status: "active", state, difficulty: "beginner", decisionLog: [] };
    const { session } = applyPendingChoice(pending, { sac: false });
    expect(session.state.pendingChoice).toBeUndefined();
    expect(session.decisionLog.some((e) => e.action?.kind === "optional-sac-payment-choice" && e.action.sacrificed === false)).toBe(true);
  });
});
