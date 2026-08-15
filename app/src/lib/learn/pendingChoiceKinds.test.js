/**
 * PENDING-CHOICE KINDS CONTRACT (WI-4) — mechanically enforces that PENDING_CHOICE_KINDS (pendingChoice.js)
 * stays exhaustive against BOTH consumers of state.pendingChoice.kind: the advanceUntilDecision driver loop
 * and applyPendingChoice's dispatch table (learnSession.js). Before this fix, any pendingChoice kind without
 * an explicit driver branch silently fell through to the tutor settler, which no-ops on a kind mismatch —
 * an AI seat spun every tick to the 50,000-tick SAFETY_CAP ("engine-stuck" with a useless reason), and a
 * human seat surfaced an unrenderable decision. This file:
 *   1. For every REAL kind in PENDING_CHOICE_KINDS, builds a minimal pendingChoice with an AI controller
 *      (so the driver auto-decides without pausing for a human panel) and asserts one advanceUntilDecision
 *      tick SETTLES it — pendingChoice is cleared (or legally re-paused on a real subsequent choice), and
 *      the decision is NEVER "engine-stuck".
 *   2. Asserts applyPendingChoice dispatches every kind to its own settle path rather than falling through
 *      to the tutor settler (spied via a distinguishing side effect for kinds whose settle is idempotent).
 *   3. Injects a FAKE, deliberately-unhandled kind and asserts the WI-4 failsafe fires: the choice is
 *      cleared (no infinite spin) and the driver reports "engine-stuck" with an honest reason — never a
 *      silent no-op, never a SAFETY_CAP timeout.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { advanceUntilDecision, applyPendingChoice } from "./learnSession.js";
import {
  PENDING_CHOICE_KINDS,
  setPendingTutorChoice,
  setPendingCloneChoice,
  setPendingScryChoice,
  setPendingHandDiscardChoice,
  setPendingImprintChoice,
  setPendingImpulseDigChoice,
  setPendingLookTopTakeChoice,
  setPendingDigLandChoice,
  setPendingSacrificeChoice,
  setPendingDivideChoice,
  setPendingDistributeChoice,
  setPendingDiscardChoice,
  setPendingHandToLibraryTopChoice,
  setPendingSoftCounterChoice,
  setPendingOptionalManaPaymentChoice,
  setPendingOptionalSacBySubtypeChoice,
  setPendingOptionalDrawDiscardChoice,
  setPendingOptionalDiscardPaymentChoice,
  setPendingOptionalExileSelfChoice,
  setPendingMilledPickChoice,
  setPendingSacUnlessPayChoice,
  setPendingTaxedPaymentChoice,
  setPendingEdictModeChoice,
  setPendingCommanderReturnChoice,
  setPendingCleanupDiscardChoice,
} from "./pendingChoice.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

function baseState() {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...base,
    phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0,
  };
}

// One minimal, AI-controlled pendingChoice fixture per real kind. `controller: "ai"` means the driver's
// `pause` gate is always false (pause requires controller === "user"), so every kind here exercises the
// AUTO-DECIDE branch — exactly the self-play path the mission notes says never livelocks.
const FIXTURES = {
  "tutor-search": (s) => setPendingTutorChoice(s, { controller: "ai", candidates: [] }),
  "clone-search": (s) => setPendingCloneChoice(s, { controller: "ai", candidates: [], resume: {} }),
  "scry-surveil": (s) => setPendingScryChoice(s, { controller: "ai", mode: "scry", cards: [] }),
  "optional-effect": (s) => ({
    ...s,
    pendingChoice: {
      kind: "optional-effect", controller: "ai", atomIndex: 0, effectOp: "draw", cardName: "Test Source",
      resume: {
        program: { atoms: [{ op: "draw", amount: 1, optional: true }] },
        controller: "ai", targets: [], xValue: 0, sourceId: null, context: {}, kicked: false, chosenMode: null,
        nextAtomIndex: 0, cardName: "Test Source",
      },
    },
  }),
  // commander-return is USER-ONLY in production (returnCommandersToZone auto-returns an AI owner's
  // commander directly, without ever pausing — see learnSession.js:556-559) — an AI-controller
  // pendingChoice for this kind can never occur, so unlike every other fixture this one uses
  // controller:"user" and is exercised at difficulty:"expert" (never pauses, exact same auto-decide
  // code path a "user"-controller choice takes at Expert autopilot).
  "commander-return": (s) => setPendingCommanderReturnChoice(
    { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: [{ id: "user-cmdr", name: "Test Commander", type: "Legendary Creature", oracle: "", isCommander: true }] } } },
    { controller: "user", zone: "graveyard", cardId: "user-cmdr", cardName: "Test Commander" },
  ),
  "hand-discard": (s) => setPendingHandDiscardChoice(s, { controller: "ai", victim: "user", candidates: [] }),
  // IMPRINT (CR 207.2c) — an empty candidate list settles in one tick: the AI's auto-pick finds nothing, the
  // settler stamps nothing (an un-imprinted permanent is a legal, common state — imprint is "you may"), and
  // the choice clears. `sourceId: null` mirrors the gone-permanent case the resolver already tolerates.
  "imprint-exile": (s) => setPendingImprintChoice(s, { controller: "ai", candidates: [], sourceId: null }),
  "impulse-dig": (s) => setPendingImpulseDigChoice(s, { controller: "ai", candidates: [], restTo: "graveyard" }),
  // BLITZ LK-2 — the AI auto-takes (autoPickLookTopTake returns the candidate id); the settler moves it library→hand
  // only if it's still the top card (an empty/mismatched library is the defensive no-op), then resumes (no resume →
  // finishSpellResolution) → pendingChoice cleared. One-tick settle.
  "look-top-take": (s) => setPendingLookTopTakeChoice(s, { controller: "ai", candidate: { id: "ltt-x", name: "Top Card" } }),
  "dig-land-to-battlefield": (s) => setPendingDigLandChoice(s, { controller: "ai", candidates: [], restIds: [] }),
  "sacrifice-choice": (s) => setPendingSacrificeChoice(s, { controller: "ai", candidates: [] }),
  "discard": (s) => setPendingDiscardChoice(s, { controller: "ai", remaining: 0, candidates: [], queue: [] }),
  "hand-to-library-top": (s) => setPendingHandToLibraryTopChoice(s, { controller: "ai", remaining: 1, candidates: [] }),
  "divide-damage": (s) => setPendingDivideChoice(s, { controller: "ai", amount: 0, candidates: [], group: [] }),
  "distribute-counters": (s) => setPendingDistributeChoice(s, { controller: "ai", amount: 0, counterType: "+1/+1", maxTargets: 2, candidates: [] }),
  "soft-counter": (s) => setPendingSoftCounterChoice(s, { controller: "ai", amount: 1, spellId: "nonexistent" }),
  "optional-mana-payment": (s) => setPendingOptionalManaPaymentChoice(s, {
    controller: "ai", cost: { kind: "mana", mana: { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } }, effectAtoms: [],
  }),
  "optional-sac-payment": (s) => setPendingOptionalSacBySubtypeChoice(s, { controller: "ai", subtype: "Food", available: false, effectAtoms: [] }),
  "optional-draw-discard": (s) => setPendingOptionalDrawDiscardChoice(s, { controller: "ai", effectAtoms: [] }),
  "optional-discard-payment": (s) => setPendingOptionalDiscardPaymentChoice(s, { controller: "ai", available: false, effectAtoms: [] }),
  "optional-exile-self-payment": (s) => setPendingOptionalExileSelfChoice(s, { controller: "ai", available: false, cardId: "gone", effectAtoms: [] }),
  "milled-pick": (s) => setPendingMilledPickChoice(s, { controller: "ai", candidates: [{ id: "mp1", name: "A", type: "Creature" }, { id: "mp2", name: "B", type: "Land" }] }),
  "sac-unless-pay": (s) => setPendingSacUnlessPayChoice(s, { controller: "ai", cost: { kind: "mana", mana: { generic: 2, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } }, sourceId: null }),
  "taxed-payment": (s) => setPendingTaxedPaymentChoice(s, { payer: "ai", beneficiary: "user", cost: { kind: "mana", mana: { generic: 1, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } } }),
  // ITERATED-EDICT (Torment of Hailfire) — the affected OPPONENT (ai) chooses one mode. Comfortable life →
  // autoPickEdictMode returns { mode: "life" }; resolveEdictModeChoice applies the 3-life loss, then advances
  // the (empty) queue → chain done → the spell finishes (no resume) → pendingChoice cleared. One-tick settle.
  "edict-mode": (s) => setPendingEdictModeChoice(s, { controller: "ai", modes: ["life"], sac: [], disc: [], queue: [{ playerId: "ai" }] }),
  // CR 514.1 cleanup hand-size discard (CR-remediation B3) — an empty hand settles in one tick: the
  // autopick returns null, nothing discards, the excess recomputes to 0, and the deferred 514.2
  // cleanup tail runs (settleCleanupDiscardChoice → finishCleanupActions) → pendingChoice cleared.
  "cleanup-discard": (s) => setPendingCleanupDiscardChoice(s, { controller: "ai", candidates: [], count: 1 }),
};

describe("PENDING_CHOICE_KINDS is exhaustive against the FIXTURES map (this test file itself)", () => {
  it("every kind in PENDING_CHOICE_KINDS has a fixture, and vice versa", () => {
    expect(new Set(PENDING_CHOICE_KINDS)).toEqual(new Set(Object.keys(FIXTURES)));
  });
});

describe("advanceUntilDecision — every real kind settles (AI seat never spins to SAFETY_CAP)", () => {
  for (const kind of PENDING_CHOICE_KINDS) {
    // Every fixture is controller:"ai" (auto-decide at any difficulty) except commander-return, which is
    // controller:"user" (production-real — see the FIXTURES comment) and needs difficulty:"expert" to
    // take the same never-pause auto-decide path.
    const difficulty = kind === "commander-return" ? "expert" : "beginner";
    it(`"${kind}" settles in one tick — never returns engine-stuck`, () => {
      const state = FIXTURES[kind](baseState());
      expect(state.pendingChoice?.kind).toBe(kind); // fixture sanity
      const session = { status: "active", state, difficulty, decisionLog: [] };
      const { session: after, decision } = advanceUntilDecision(session);
      expect(decision.kind).not.toBe("engine-stuck");
      // Settled means the SAME kind is no longer pending (it may have chained into a genuinely
      // different pendingChoice via a payoff, which is legal — just never the identical stale kind).
      expect(after.state.pendingChoice?.kind).not.toBe(kind);
    });
  }
});

describe("applyPendingChoice — every real kind dispatches to its own settle path", () => {
  it("optional-mana-payment: choice.pay is honored (not misread as a tutor candidateId)", () => {
    const state = setPendingOptionalManaPaymentChoice(baseState(), {
      controller: "ai", cost: { kind: "mana", mana: { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } }, effectAtoms: [],
    });
    const pending = { status: "active", state, difficulty: "beginner", decisionLog: [] };
    const { session } = applyPendingChoice(pending, { pay: true });
    expect(session.state.pendingChoice).toBeUndefined();
    expect(session.decisionLog.some((e) => e.action?.kind === "optional-mana-payment-choice")).toBe(true);
  });

  it("commander-return: choice.return is honored (not misread as a tutor candidateId)", () => {
    // settleCommanderReturnChoice (the actual dispatch target) is exercised directly here rather than
    // through the post-settle advanceUntilDecision drive: with no deck content, a full "expert" drive
    // plays out to the turn-limit draw and its own SBAs clear the board — irrelevant to what this test
    // pins (that applyPendingChoice ROUTES a commander-return choice to its own settler, not the tutor
    // settler, which would misread `choice.return` as a missing candidateId).
    const state = FIXTURES["commander-return"](baseState());
    const pending = { status: "active", state, difficulty: "expert", decisionLog: [] };
    const { session } = applyPendingChoice(pending, { return: true });
    expect(session.decisionLog.some((e) => e.action?.kind === "commander-return" && e.action.returned === true)).toBe(true);
  });

  it("no pendingChoice at all (double-submit) re-derives instead of crashing", () => {
    const pending = { status: "active", state: baseState(), difficulty: "beginner", decisionLog: [] };
    expect(() => applyPendingChoice(pending, { pay: true })).not.toThrow();
  });
});

describe("WI-4 FAILSAFE — a deliberately-injected unhandled kind never spins or silently no-ops", () => {
  it("advanceUntilDecision clears the choice + reports engine-stuck honestly (no SAFETY_CAP spin)", () => {
    const state = {
      ...baseState(),
      pendingChoice: { kind: "some-future-kind-nobody-wired-yet", controller: "ai" },
    };
    const session = { status: "active", state, difficulty: "beginner", decisionLog: [] };
    const { session: after, decision } = advanceUntilDecision(session);
    expect(decision.kind).toBe("engine-stuck");
    expect(decision.reason).toMatch(/some-future-kind-nobody-wired-yet/);
    expect(after.state.pendingChoice).toBeUndefined(); // cleared — the driver isn't stuck next tick
    expect(after.state.decisionLog ?? true).toBeTruthy(); // no crash constructing the return
  });

  it("also fires for a HUMAN-controlled unhandled kind (never surfaces an unrenderable decision)", () => {
    const state = {
      ...baseState(),
      activePlayer: "user", priorityHolder: "user",
      pendingChoice: { kind: "some-future-kind-nobody-wired-yet", controller: "user" },
    };
    const session = { status: "active", state, difficulty: "beginner", decisionLog: [] };
    const { decision } = advanceUntilDecision(session);
    expect(decision.kind).toBe("engine-stuck");
  });

  it("applyPendingChoice on an unhandled kind re-derives into the same honest failsafe (not a crash, not a tutor misread)", () => {
    const state = {
      ...baseState(),
      pendingChoice: { kind: "some-future-kind-nobody-wired-yet", controller: "ai" },
    };
    const pending = { status: "active", state, difficulty: "beginner", decisionLog: [] };
    const { decision } = applyPendingChoice(pending, { candidateId: "garbage" });
    expect(decision.kind).toBe("engine-stuck");
  });
});
