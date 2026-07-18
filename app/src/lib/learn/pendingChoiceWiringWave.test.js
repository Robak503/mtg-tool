/**
 * PENDING-CHOICE WIRING WAVE (WI-7, 2026-07-18) — the seven kinds that paused a HUMAN seat with no
 * panel and no hook method, so the Academy board rendered with nothing actionable (a soft-lock):
 *
 *   dig-land-to-battlefield · distribute-counters · optional-draw-discard ·
 *   optional-discard-payment · sac-unless-pay · taxed-payment · edict-mode
 *
 * The engine/settle side was already complete and pinned (pendingChoiceKinds.test.js); ONLY the
 * client half was missing. This file pins both ends of the seam per kind, mirroring
 * cleanupDiscardUiWiring.test.js / pendingChoiceUiWiring.test.js:
 *   1. advanceUntilDecision pauses a beginner seat and surfaces the FIELDS the panel renders, and
 *   2. applyPendingChoice honors the EXACT payload the hook posts.
 *
 * Self-play cannot catch this class — at Expert the driver auto-answers every seat, so tens of
 * thousands of green games say nothing about whether a human can answer.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { advanceUntilDecision, applyPendingChoice } from "./learnSession.js";
import {
  setPendingDigLandChoice,
  setPendingDistributeChoice,
  setPendingOptionalDrawDiscardChoice,
  setPendingOptionalDiscardPaymentChoice,
  setPendingSacUnlessPayChoice,
  setPendingTaxedPaymentChoice,
  setPendingEdictModeChoice,
} from "./pendingChoice.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

function baseState() {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...base,
    phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
  };
}

function session(state) {
  return { status: "active", state, difficulty: "beginner", decisionLog: [] };
}

/** Put real cards in a player's zone so a settler has something to move. */
function withZone(state, seat, zone, cards) {
  return { ...state, players: { ...state.players, [seat]: { ...state.players[seat], [zone]: cards } } };
}

describe("dig-land-to-battlefield — pick one revealed land", () => {
  const candidates = [{ id: "l-1", name: "Forest" }, { id: "l-2", name: "Island" }];
  const pending = () => session(setPendingDigLandChoice(baseState(), {
    controller: "user", candidates, restIds: [], entersTapped: true, sourceName: "Test Dig",
  }));

  it("pauses and surfaces the fields DigLandPanel renders", () => {
    const { decision } = advanceUntilDecision(pending());
    expect(decision.kind).toBe("dig-land-to-battlefield");
    expect(decision.controller).toBe("user");
    expect(decision.candidates).toHaveLength(2);
    expect(decision.candidates[0]).toMatchObject({ id: expect.any(String), name: expect.any(String) });
    expect(decision.entersTapped).toBe(true);   // the panel says "(it enters tapped)"
    expect(decision.sourceName).toBe("Test Dig");
  });

  it("applyPendingChoice honors the hook's { kind, cardId } payload", () => {
    const { session: after } = applyPendingChoice(pending(), { kind: "dig-land-to-battlefield", cardId: "l-1" });
    expect(after.state.pendingChoice).toBeUndefined();
  });

  it("an illegal cardId re-surfaces the picker rather than silently skipping", () => {
    const { decision } = applyPendingChoice(pending(), { kind: "dig-land-to-battlefield", cardId: "nope" });
    expect(decision.kind).toBe("dig-land-to-battlefield");
  });
});

describe("distribute-counters — allocate across your own creatures", () => {
  const candidates = [{ id: "c-1", name: "Bear" }, { id: "c-2", name: "Elf" }];
  const pending = (amount = 3) => session(setPendingDistributeChoice(baseState(), {
    controller: "user", amount, counterType: "+1/+1", maxTargets: 2, perTargetCap: 2, candidates, sourceName: "Earth Crystal",
  }));

  it("pauses and surfaces amount / counterType / caps / candidates for the allocator", () => {
    const { decision } = advanceUntilDecision(pending());
    expect(decision.kind).toBe("distribute-counters");
    expect(decision.amount).toBe(3);
    expect(decision.counterType).toBe("+1/+1");
    expect(decision.maxTargets).toBe(2);
    expect(decision.perTargetCap).toBe(2);
    expect(decision.candidates).toHaveLength(2);
  });

  it("applyPendingChoice honors the hook's { kind, distribution:[{id,amount}] } payload", () => {
    const { session: after } = applyPendingChoice(pending(3), {
      kind: "distribute-counters",
      distribution: [{ id: "c-1", amount: 2 }, { id: "c-2", amount: 1 }],
    });
    expect(after.state.pendingChoice).toBeUndefined();
  });

  it("UNDER-ASSIGNMENT re-surfaces the picker (the panel's submit is gated on remaining === 0)", () => {
    const { decision } = applyPendingChoice(pending(3), {
      kind: "distribute-counters",
      distribution: [{ id: "c-1", amount: 1 }],
    });
    expect(decision.kind).toBe("distribute-counters");
  });
});

describe("optional-draw-discard — take it or skip it", () => {
  const pending = () => session(setPendingOptionalDrawDiscardChoice(
    withZone(baseState(), "user", "library", [{ id: "d-1", name: "Forest", type: "Basic Land — Forest" }]),
    { controller: "user", effectAtoms: [], sourceName: "Test Loot" },
  ));

  it("pauses and surfaces controller + sourceName", () => {
    const { decision } = advanceUntilDecision(pending());
    expect(decision.kind).toBe("optional-draw-discard");
    expect(decision.controller).toBe("user");
    expect(decision.sourceName).toBe("Test Loot");
  });

  it("declining with { kind, draw:false } clears the pause", () => {
    const { session: after } = applyPendingChoice(pending(), { kind: "optional-draw-discard", draw: false });
    expect(after.state.pendingChoice).toBeUndefined();
  });
});

describe("optional-discard-payment — the discard IS the cost", () => {
  const pending = (available = true) => session(setPendingOptionalDiscardPaymentChoice(baseState(), {
    controller: "user", available, effectAtoms: [], sourceName: "Test Pitch",
  }));

  it("pauses and surfaces `available` (the panel disables the pay button without it)", () => {
    const { decision } = advanceUntilDecision(pending(false));
    expect(decision.kind).toBe("optional-discard-payment");
    expect(decision.available).toBe(false);
  });

  it("declining with { kind, discard:false } clears the pause", () => {
    const { session: after } = applyPendingChoice(pending(), { kind: "optional-discard-payment", discard: false });
    expect(after.state.pendingChoice).toBeUndefined();
  });
});

describe("sac-unless-pay — INVERTED polarity (declining costs you the permanent)", () => {
  const pending = () => session(setPendingSacUnlessPayChoice(baseState(), {
    controller: "user", cost: { kind: "mana", mana: { generic: 2, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } },
    sourceId: "p-1", sourceName: "Test Upkeep",
  }));

  it("pauses and surfaces the cost + sourceName the panel names in BOTH buttons", () => {
    const { decision } = advanceUntilDecision(pending());
    expect(decision.kind).toBe("sac-unless-pay");
    expect(decision.cost).toMatchObject({ kind: "mana" });
    expect(decision.sourceName).toBe("Test Upkeep");
  });

  it("declining with { kind, pay:false } clears the pause (the sacrifice branch)", () => {
    const { session: after } = applyPendingChoice(pending(), { kind: "sac-unless-pay", pay: false });
    expect(after.state.pendingChoice).toBeUndefined();
  });
});

describe("taxed-payment — you are the payer (Rhystic Study class)", () => {
  const pending = () => session(setPendingTaxedPaymentChoice(baseState(), {
    payer: "user", beneficiary: "ai",
    cost: { kind: "mana", mana: { generic: 1, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } },
    sourceName: "Rhystic Study", declinePayoff: "draw",
  }));

  it("routes the pause to the PAYER's seat and surfaces beneficiary + declinePayoff", () => {
    const { decision } = advanceUntilDecision(pending());
    expect(decision.kind).toBe("taxed-payment");
    expect(decision.controller).toBe("user");   // controller IS the payer — that's how it reaches this seat
    expect(decision.payer).toBe("user");
    expect(decision.beneficiary).toBe("ai");
    expect(decision.declinePayoff).toBe("draw");
  });

  it("declining with { kind, pay:false } clears the pause", () => {
    const { session: after } = applyPendingChoice(pending(), { kind: "taxed-payment", pay: false });
    expect(after.state.pendingChoice).toBeUndefined();
  });
});

describe("edict-mode — pick the mode, then its target", () => {
  const pending = () => session(setPendingEdictModeChoice(baseState(), {
    controller: "user",
    modes: ["life", "sacrifice"],
    sac: [{ id: "p-1", name: "Bear" }],
    disc: [],
    sourceName: "Torment of Hailfire",
  }));

  it("pauses and surfaces modes + the sac/disc pools the panel reveals per mode", () => {
    const { decision } = advanceUntilDecision(pending());
    expect(decision.kind).toBe("edict-mode");
    expect(decision.modes).toEqual(["life", "sacrifice"]);
    expect(decision.sac).toHaveLength(1);
    expect(decision.disc).toEqual([]);
  });

  it("applyPendingChoice honors the hook's { kind, mode, permId } payload", () => {
    const { session: after } = applyPendingChoice(pending(), { kind: "edict-mode", mode: "sacrifice", permId: "p-1" });
    expect(after.state.pendingChoice).toBeUndefined();
  });

  it("a mode outside the offered list falls back to life rather than dispatching something unoffered", () => {
    const { session: after } = applyPendingChoice(pending(), { kind: "edict-mode", mode: "not-a-mode" });
    expect(after.state.pendingChoice).toBeUndefined();
  });
});

describe("WI-7 — the kind echo-check protects every new method", () => {
  it("a stale submit carrying the WRONG kind is dropped, not misread by the live settler", () => {
    // A taxed-payment {pay:false} landing after the server advanced to an edict-mode choice must NOT
    // be read as an edict answer — applyPendingChoice re-derives and returns the real current decision.
    const live = session(setPendingEdictModeChoice(baseState(), {
      controller: "user", modes: ["life", "sacrifice"], sac: [{ id: "p-1", name: "Bear" }], disc: [], sourceName: "Torment",
    }));
    const { decision } = applyPendingChoice(live, { kind: "taxed-payment", pay: false });
    expect(decision.kind).toBe("edict-mode");
  });
});

describe("distribute-counters SOFT-LOCK — 'each of up to X targets' with fewer creatures than X", () => {
  // Found live by scripts/playability-sweep.mjs (commander, turn 47): amount=3, perTargetCap=1,
  // candidates=2. The Wise Mothman's "put a +1/+1 counter on EACH OF UP TO X target creatures" caps
  // TARGETS, not counters — with only 2 creatures you legally target 2 and place 2. The settler used to
  // demand the raw amount, which is unsatisfiable, and because the choice is MANDATORY it re-surfaced
  // forever: the human could never enable submit and the game could not continue.
  const pendingCapped = () => session(setPendingDistributeChoice(baseState(), {
    controller: "user", amount: 3, counterType: "+1/+1", maxTargets: 3, perTargetCap: 1,
    candidates: [{ id: "c-1", name: "Bear" }, { id: "c-2", name: "Elf" }], sourceName: "The Wise Mothman",
  }));

  it("accepts the MAXIMUM the board can take (2 of 3) instead of re-surfacing forever", () => {
    const { session: after } = applyPendingChoice(pendingCapped(), {
      kind: "distribute-counters",
      distribution: [{ id: "c-1", amount: 1 }, { id: "c-2", amount: 1 }],
    });
    expect(after.state.pendingChoice).toBeUndefined();
  });

  it("still rejects a genuine under-assignment (1 of an achievable 2)", () => {
    const { decision } = applyPendingChoice(pendingCapped(), {
      kind: "distribute-counters",
      distribution: [{ id: "c-1", amount: 1 }],
    });
    expect(decision.kind).toBe("distribute-counters");
  });

  it("an uncapped division (Armament Corps) still requires the FULL amount — no regression", () => {
    const uncapped = () => session(setPendingDistributeChoice(baseState(), {
      controller: "user", amount: 2, counterType: "+1/+1", maxTargets: 2, perTargetCap: null,
      candidates: [{ id: "c-1", name: "Bear" }, { id: "c-2", name: "Elf" }], sourceName: "Armament Corps",
    }));
    // 1 of 2 must still re-surface...
    expect(applyPendingChoice(uncapped(), { kind: "distribute-counters", distribution: [{ id: "c-1", amount: 1 }] }).decision.kind)
      .toBe("distribute-counters");
    // ...and the full 2 settles.
    expect(applyPendingChoice(uncapped(), { kind: "distribute-counters", distribution: [{ id: "c-1", amount: 2 }] }).session.state.pendingChoice)
      .toBeUndefined();
  });
});
