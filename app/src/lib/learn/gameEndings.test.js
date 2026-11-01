/**
 * gameEndings.test.js — the session loop's side of how an Academy game ends (2026-10-22).
 *
 *   - The two engine faults name themselves on the driver's decision — a "dispatch-error" carrying the error and its stack
 *     since 2026-11-01 (an engine-stuck until then) — `guard` { type: "engine-error",
 *     message } for a step that throws, { type: "no-legal-action", seat, message } for a seat holding priority with no
 *     legal action whose pass throws — so endEngineStoppedGame ends the game they stop, with an honest one-line reason.
 *     The reason text and the "active" session are unchanged; the self-play result is "dispatch-error" with the stack.
 *   - abandon() ends a game still at its opening-hand mulligans (start saves it, so it is offered under "Continue a game").
 *   - A puzzle attempt the person abandoned gets no puzzle verdict: they neither solved nor missed it.
 * The pending-choice failsafe's engine-stuck is left as it was: it clears the choice, so the game can go on.
 */

import { describe, expect, it, vi } from "vitest";
import * as learn from "./learnSession.js";
import { reasonToOutcome } from "./learnOutcome.js";
import { evaluatePuzzle } from "./puzzleGoal.js";

function forest(i) {
  return { id: `f-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}.", mana: "" };
}
function bear(i) {
  return { id: `b-${i}`, name: "Grizzly Bears", type: "Creature — Bear", oracle: "", mana: "{1}{G}", cmc: 2 };
}
function deck(label) {
  const out = [];
  for (let i = 0; i < 18; i++) out.push(forest(`${label}-${i}`));
  for (let i = 0; i < 12; i++) out.push(bear(`${label}-${i}`));
  return out;
}
const newSession = (extra = {}) => learn.createLearnSession({ userDeck: deck("u"), opponentDeck: deck("a"), difficulty: "beginner", mode: "standard", ...extra });

/** A game at its first decision, then put into an engine state the engine can't move on from (see the route test). */
function faulted(kind) {
  const { session } = learn.advanceUntilDecision(newSession());
  const patch = kind === "engine-error"
    ? { priorityHolder: null, step: "no-such-step" }
    : { pendingFreeCast: { controller: "ai", card: null }, priorityHolder: "user", consecutivePasses: 1, step: "no-such-step" };
  return { ...session, state: { ...session.state, ...patch } };
}
const THROWN = "Invalid (phase=precombat-main, step=no-such-step)";

describe("the engine faults name themselves, and the game they stop ends", () => {
  it("a step that throws: guard engine-error with the error's message; ended as engine-stopped with an honest reason", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const raw = learn.advanceUntilDecision(faulted("engine-error"));
      expect(raw.decision.kind).toBe("dispatch-error"); // a throw is a crash (2026-11-01 — it was engine-stuck)
      expect(typeof raw.decision.error.stack).toBe("string");
      expect(raw.decision.reason).toBe(THROWN);
      expect(raw.decision.guard).toEqual({ type: "engine-error", message: THROWN });
      expect(raw.session.status).toBe("active");

      const ended = learn.endEngineStoppedGame(raw);
      const detail = `moving the game to its next step failed with an engine error — ${THROWN}.`;
      expect(ended.session.status).toBe("engine-stopped");
      expect(ended.session.engineStop).toMatchObject({ guard: "engine-error", reason: THROWN, detail, message: `The engine stopped the game: ${detail}` });
      expect(ended.decision).toEqual({ kind: "game-over", reason: "engine-stopped", guard: "engine-error", message: `The engine stopped the game: ${detail}`, detail });
      expect(ended.session.decisionLog.at(-1)).toMatchObject({ actor: null, action: { kind: "game-stopped", guard: "engine-error" } });
      expect(reasonToOutcome("engine-stopped", ended.decision).blurb).toMatch(/^Moving the game to its next step failed with an engine error — Invalid \(phase=precombat-main, step=no-such-step\)\. Nobody won or lost\./);
      // Once ended, the driver answers game-over — resuming it can no longer re-derive the throw.
      expect(learn.advanceUntilDecision(ended.session).decision).toEqual({ kind: "game-over", reason: "engine-stopped" });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("no legal action and the pass throws: guard no-legal-action naming the seat; ended as engine-stopped", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const raw = learn.advanceUntilDecision(faulted("no-legal-action"));
      expect(raw.decision.kind).toBe("dispatch-error"); // a throw is a crash (2026-11-01 — it was engine-stuck)
      expect(typeof raw.decision.error.stack).toBe("string");
      expect(raw.decision.reason).toBe("no legal action and no pass available");
      expect(raw.decision.guard).toEqual({ type: "no-legal-action", seat: "user", message: THROWN });
      expect(raw.session.status).toBe("active");

      const ended = learn.endEngineStoppedGame(raw);
      const detail = `You had priority with no legal action, and moving the game on failed with an engine error — ${THROWN}.`;
      expect(ended.session.status).toBe("engine-stopped");
      expect(ended.decision).toMatchObject({ kind: "game-over", reason: "engine-stopped", guard: "no-legal-action", detail });
      // The error is logged, not dropped (it used to be swallowed by an empty catch).
      expect(errorSpy.mock.calls.some((args) => args.some((a) => a instanceof Error && a.message === THROWN))).toBe(true);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("control: the pending-choice failsafe still names no guard, so the game is not ended (its choice is cleared — it can go on)", () => {
    const { session } = learn.advanceUntilDecision(newSession());
    const raw = learn.advanceUntilDecision({ ...session, state: { ...session.state, pendingChoice: { kind: "no-such-kind", controller: "user" } } });
    expect(raw.decision.kind).toBe("engine-stuck");
    expect(raw.decision.guard).toBeUndefined();
    expect(raw.session.state.pendingChoice ?? null).toBeNull();
    expect(learn.endEngineStoppedGame(raw)).toBe(raw);
  });
});

describe("abandon", () => {
  it("ends a game still at its opening-hand mulligans", () => {
    const atMulligan = newSession({ humanMulligan: true });
    expect(atMulligan.status).toBe("mulligan");
    const after = learn.abandon(atMulligan);
    expect(after.status).toBe("abandoned");
    expect(after.abandonReason).toBe("user-abandoned");
    expect(typeof after.endedAt).toBe("string");
    expect(learn.isComplete(after)).toBe(true);
  });

  it("control: ends a game being played, and leaves a finished game as it is", () => {
    const { session } = learn.advanceUntilDecision(newSession());
    expect(learn.abandon(session).status).toBe("abandoned");
    const won = { ...session, status: "user-wins" };
    expect(learn.abandon(won)).toBe(won);
  });
});

describe("a puzzle attempt the person abandoned has no verdict", () => {
  it("abandoned is neither solved nor failed", () => {
    expect(evaluatePuzzle({ goal: "win-this-turn", startTurn: 3, status: "ended", turn: 3, reason: "abandoned" })).toBe("abandoned");
    expect(evaluatePuzzle({ goal: "win-this-turn", startTurn: 3, status: "ended", turn: 5, reason: "abandoned" })).toBe("abandoned");
  });

  it("control: the other verdicts are unchanged", () => {
    expect(evaluatePuzzle({ goal: "win-this-turn", startTurn: 3, status: "ended", turn: 3, reason: "user-wins" })).toBe("solved");
    expect(evaluatePuzzle({ goal: "win-this-turn", startTurn: 3, status: "ended", turn: 3, reason: "ai-wins" })).toBe("failed");
    expect(evaluatePuzzle({ goal: "win-this-turn", startTurn: 3, status: "active", turn: 4 })).toBe("failed");
    expect(evaluatePuzzle({ goal: "win-this-turn", startTurn: 3, status: "active", turn: 3 })).toBe("pending");
    expect(evaluatePuzzle({ goal: "win-this-turn", startTurn: 3, status: "ended", turn: 3, reason: "engine-stopped" })).toBe("stopped");
  });
});
