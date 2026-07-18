/**
 * CLEANUP-DISCARD UI WIRING (WI-7) — the CR 514.1 hand-size discard is the pendingChoice kind that
 * stranded the Academy play loop for a human seat: the ENGINE half shipped with CR-remediation B3
 * (ea5a2b08, 2026-07-11, covered by crB3.test.js) and `advanceUntilDecision` duly paused a beginner seat
 * on it — but `useLearnSession` had no submit method and `LearnView` had no panel, so the board rendered
 * with nothing actionable. Because cleanup runs EVERY turn (unlike the card-specific kinds), any game
 * where the player ended a turn over max hand size wedged immediately — the "Academy breaks at turn 1"
 * report (Colton, 2026-07-12), one day after B3 landed.
 *
 * This file pins the CLIENT-FACING contract the new CleanupDiscardPanel reads, mirroring
 * pendingChoiceUiWiring.test.js (WI-1), which exists for exactly this bug class.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { advanceUntilDecision, applyPendingChoice } from "./learnSession.js";
import { setPendingCleanupDiscardChoice, PENDING_CHOICE_KINDS } from "./pendingChoice.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

/**
 * A REALISTIC over-full cleanup, mirroring crB3.test.js's fixture: the settler recomputes the remaining
 * discards from the ACTUAL hand vs max hand size (7), so `count` must be earned by a genuinely oversized
 * hand — hand-setting count on a small hand produces a state the engine immediately resolves away.
 */
function handState(handSize) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  const hand = Array.from({ length: handSize }, (_, i) => ({
    id: `h-${i}`, name: `Card ${i}`, type: "Basic Land — Forest", oracle: "", mana: "", cmc: 0,
  }));
  return {
    ...base,
    phase: "ending", step: "cleanup", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...base.players, user: { ...base.players.user, hand } },
  };
}

function pendingCleanup(handSize = 8) {
  const state = handState(handSize);
  const withPending = setPendingCleanupDiscardChoice(state, {
    controller: "user",
    candidates: state.players.user.hand.map((c) => ({ id: c.id, name: c.name })),
    count: handSize - 7, // CR 514.1 — down to the maximum hand size
  });
  return { status: "active", state: withPending, difficulty: "beginner", decisionLog: [] };
}

describe("cleanup-discard — human pause surfaces a decision the panel can render", () => {
  it("advanceUntilDecision pauses at beginner and carries controller/candidates/count", () => {
    const { decision } = advanceUntilDecision(pendingCleanup(8));
    expect(decision.kind).toBe("cleanup-discard");
    expect(decision.controller).toBe("user");
    // CleanupDiscardPanel maps decision.candidates -> the card grid and reads decision.count for its label.
    expect(Array.isArray(decision.candidates)).toBe(true);
    expect(decision.candidates.length).toBeGreaterThan(0);
    expect(decision.candidates[0]).toMatchObject({ id: expect.any(String), name: expect.any(String) });
    expect(decision.count).toBe(1);
  });

  it("a multi-card discard reports the full remaining count (the panel's \"N left\" label)", () => {
    const { decision } = advanceUntilDecision(pendingCleanup(9));
    expect(decision.count).toBe(2);
  });
});

describe("cleanup-discard — /api/learn/choose resolution (the payload the hook posts)", () => {
  it("applyPendingChoice honors the panel's { kind, cardId } payload and clears the pause", () => {
    // Exactly what useLearnSession.applyCleanupDiscardChoice posts to /api/learn/choose.
    const { session } = applyPendingChoice(pendingCleanup(8), { kind: "cleanup-discard", cardId: "h-0" });
    expect(session.state.pendingChoice).toBeUndefined();
    expect(session.decisionLog.some((e) => e.action?.kind === "cleanup-discard-choice")).toBe(true);
  });

  it("the chosen card actually leaves hand for the graveyard", () => {
    const { session } = applyPendingChoice(pendingCleanup(8), { kind: "cleanup-discard", cardId: "h-0" });
    expect(session.state.players.user.hand.some((c) => c.id === "h-0")).toBe(false);
    expect(session.state.players.user.graveyard.some((c) => c.id === "h-0")).toBe(true);
  });

  it("MANDATORY — an illegal/stale cardId re-surfaces the picker instead of skipping the discard", () => {
    const { decision } = applyPendingChoice(pendingCleanup(8), { kind: "cleanup-discard", cardId: "not-in-hand" });
    expect(decision.kind).toBe("cleanup-discard");
  });

  it("a 2-card discard RE-RAISES the picker after one pick (count ticks down)", () => {
    const { decision } = applyPendingChoice(pendingCleanup(9), { kind: "cleanup-discard", cardId: "h-0" });
    expect(decision.kind).toBe("cleanup-discard");
    expect(decision.count).toBe(1);
  });
});

/**
 * THE SYSTEMIC GUARD (the reason this bug class recurs).
 *
 * pendingChoiceKinds.test.js already pins the SERVER half — every PENDING_CHOICE_KINDS entry settles in
 * the driver and dispatches through applyPendingChoice. Nothing pinned the CLIENT half, which is the hole
 * both WI-1 (optional-mana/sac-payment) and this fix (cleanup-discard) fell through: a kind can pause a
 * human seat with no panel to render it and no hook method to answer it.
 *
 * Every kind below reaches `if (pause) return { decision }` in the driver, so a human controller CAN be
 * shown it. KNOWN_UNWIRED is the honest current debt — these seven still have no client half and will
 * soft-lock a human seat if their card comes up. The list may only SHRINK: adding a kind to
 * PENDING_CHOICE_KINDS without a client half (or re-breaking a wired one) fails this test.
 */
// EMPTY as of 2026-07-18 (WI-7): the seven kinds that lived here are all wired now — panel + hook
// method each, pinned per-kind in pendingChoiceWiringWave.test.js. The list may only SHRINK, so an
// empty list is the strongest form of this guard: ANY registered kind lacking a client half now fails.
const KNOWN_UNWIRED = [];

describe("WI-7 CLIENT CONTRACT — every human-pausable pendingChoice kind has a panel + a hook method", () => {
  const learnView = readFileSync(new URL("../../components/mtg/LearnView.jsx", import.meta.url), "utf8");
  const hook = readFileSync(new URL("../../hooks/useLearnSession.js", import.meta.url), "utf8");

  it("no kind is silently unwired — the gap list is exactly KNOWN_UNWIRED", () => {
    const unwired = PENDING_CHOICE_KINDS.filter(
      (kind) => !learnView.includes(`"${kind}"`) || !hook.includes(`"${kind}"`),
    );
    expect(unwired.sort()).toEqual([...KNOWN_UNWIRED].sort());
  });

  it("cleanup-discard specifically is wired on BOTH client halves (the turn-1 regression)", () => {
    expect(learnView).toContain('decision.kind === "cleanup-discard"');
    expect(learnView).toContain("CleanupDiscardPanel");
    expect(hook).toContain('kind: "cleanup-discard"');
    expect(hook).toContain("applyCleanupDiscardChoice");
  });

  it("KNOWN_UNWIRED only shrinks — every entry is still a real registered kind", () => {
    for (const kind of KNOWN_UNWIRED) expect(PENDING_CHOICE_KINDS).toContain(kind);
  });
});
