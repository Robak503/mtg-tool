/**
 * engineStopped.test.js — the session layer's end for a game a guard stopped, and the words a person reads (2026-10-22).
 *
 * The driver's three guards (the runaway size guard, the per-turn tick budget, the safety cap) return an "engine-stuck"
 * decision on a session that is still active — the self-play harnesses count that as their "engine-stuck" result and the
 * driver is unchanged. The Academy ends such a game with `endEngineStoppedGame`: status "engine-stopped", a game-log
 * line and an engine-log event saying why, and the end-of-game decision. The end screen says the engine stopped the game
 * and that nobody won or lost; a puzzle attempt the engine stopped is neither solved nor failed.
 *
 * Each guard's stop is produced by the real driver (its test limits for the tick budget and the safety cap, real limits
 * for the runaway board).
 */

import { describe, expect, it } from "vitest";
import * as learn from "./learnSession.js";
import { createPermanent } from "./gameState.js";
import { reasonToOutcome } from "./learnOutcome.js";
import { logActionText } from "./actionLabel.js";
import { evaluatePuzzle } from "./puzzleGoal.js";

function deck(prefix) {
  const out = [];
  for (let i = 0; i < 18; i++) out.push({ id: `${prefix}-f-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}.", mana: "" });
  for (let i = 0; i < 12; i++) out.push({ id: `${prefix}-b-${i}`, name: "Grizzly Bears", type: "Creature — Bear", oracle: "", mana: "{1}{G}", cmc: 2 });
  return out;
}
const beginner = () => learn.createLearnSession({ userDeck: deck("u"), opponentDeck: deck("a"), difficulty: "beginner", mode: "standard", seed: "engine-stopped" });

/** The user's first ask, and the pass that hands the turn to the engine. */
function firstAsk() {
  const { session, decision } = learn.advanceUntilDecision(beginner());
  expect(decision.kind).toBe("ask");
  return { session, pass: decision.options.find((o) => o.kind === "pass-priority") };
}

function swarmed(session, seat, count, stackCount = 0) {
  const squirrel = { name: "Squirrel", type: "Token Creature — Squirrel", power: 1, toughness: 1, oracle: "", keywords: [], token: true, colors: ["G"] };
  const swarm = Array.from({ length: count }, (_, i) => createPermanent({ id: `sq-${i}`, card: { ...squirrel, id: `sq-${i}-card` }, controller: seat, summoningSick: false }));
  return {
    ...session,
    state: {
      ...session.state,
      players: { ...session.state.players, [seat]: { ...session.state.players[seat], battlefield: swarm } },
      stack: Array.from({ length: stackCount }, (_, i) => ({ id: `stk-${i}`, kind: "triggered-ability", source: { id: "x", name: "X" }, controller: seat, targets: [], payload: {} })),
    },
  };
}

/** The driver's stop for each guard. */
const STOPS = {
  "turn-stall": () => {
    const { session, pass } = firstAsk();
    return learn.applyChoice(session, pass, { turnTickBudget: 3 });
  },
  "safety-cap": () => {
    const { session, pass } = firstAsk();
    return learn.applyChoice(session, pass, { turnTickBudget: Infinity, safetyCap: 1 });
  },
  runaway: () => learn.advanceUntilDecision(swarmed(firstAsk().session, "user", 2001)),
};

describe("the driver names the guard that stopped it (an additive field; the decision is still engine-stuck)", () => {
  it.each(Object.keys(STOPS))("%s", (guard) => {
    const { session, decision } = STOPS[guard]();
    expect(decision.kind).toBe("engine-stuck");
    expect(session.status).toBe("active");
    expect(decision.guard?.type).toBe(guard);
  });

  it("the runaway guard says which zone, how many and whose; the reason text is unchanged", () => {
    const board = STOPS.runaway();
    expect(board.decision.reason).toBe("runaway battlefield (2001 permanents, user)");
    expect(board.decision.guard).toEqual({ type: "runaway", zone: "battlefield", count: 2001, limit: 2000, seat: "user" });
    const stacked = learn.advanceUntilDecision(swarmed(firstAsk().session, "ai", 0, 3), { runawayLimits: { stack: 2, battlefield: 2000 } });
    expect(stacked.decision.reason).toBe("runaway stack (3 objects)");
    expect(stacked.decision.guard).toEqual({ type: "runaway", zone: "stack", count: 3, limit: 2 });
  });

  it("the safety cap keeps its reason text at the shipped cap", () => {
    expect(learn.SAFETY_CAP_TICKS).toBe(50000);
    const { decision } = STOPS["safety-cap"]();
    expect(decision.reason).toBe("safety cap (1 ticks) hit");
    expect(decision.guard).toEqual({ type: "safety-cap", limit: 1 });
  });
});

describe("endEngineStoppedGame — the Academy's end for a stopped game", () => {
  it.each(Object.keys(STOPS))("%s: a terminal status, the game-log line, the engine-log event and the end-of-game decision", (guard) => {
    expect(learn.endEngineStoppedGame).toBeTypeOf("function");
    const stopped = STOPS[guard]();
    const { session, decision } = learn.endEngineStoppedGame(stopped);

    expect(session.status).toBe("engine-stopped");
    expect(learn.isComplete(session)).toBe(true);
    expect(session.endedAt).toEqual(expect.any(String));
    expect(decision).toEqual({ kind: "game-over", reason: "engine-stopped", guard, message: session.engineStop.message, detail: session.engineStop.detail });
    expect(session.engineStop).toMatchObject({ guard, reason: stopped.decision.reason, turn: stopped.session.state.turn });
    expect(session.engineStop.message).toBe(`The engine stopped the game: ${session.engineStop.detail}`);

    const line = session.decisionLog.at(-1);
    expect(line).toMatchObject({ actor: null, auto: true, turn: stopped.session.state.turn, action: { kind: "game-stopped", guard, message: session.engineStop.message } });
    expect(session.decisionLog.length).toBe(stopped.session.decisionLog.length + 1);
    expect(learn.filteredDecisionLogTail(session).at(-1)).toBe(line);

    const event = session.state.log.at(-1);
    expect(event).toMatchObject({ kind: "game-stopped", guard, reason: stopped.decision.reason });
    expect(session.state.log.length).toBe(stopped.session.state.log.length + 1);

    // Ended for good: the driver answers game-over and plays nothing more.
    const again = learn.advanceUntilDecision(session);
    expect(again.decision).toEqual({ kind: "game-over", reason: "engine-stopped" });
    expect(again.session).toBe(session);
  });

  it("the words: which guard, the size, whose board — never a win or a loss", () => {
    expect(learn.endEngineStoppedGame).toBeTypeOf("function");
    const runaway = learn.endEngineStoppedGame(STOPS.runaway()).session.engineStop;
    expect(runaway.message).toBe("The engine stopped the game: You controlled 2,001 permanents, past the engine's limit of 2,000 — a loop kept adding to the board.");
    const stall = learn.endEngineStoppedGame(STOPS["turn-stall"]()).session.engineStop;
    expect(stall.message).toMatch(/^The engine stopped the game: turn 1 went past the engine's limit of 3 steps for one turn without ending — a loop it could not get out of\.$/);
    const cap = learn.endEngineStoppedGame(STOPS["safety-cap"]()).session.engineStop;
    expect(cap.message).toBe("The engine stopped the game: it took the engine's limit of 1 step without coming to a choice for you — a loop it could not get out of.");
    const stack = learn.endEngineStoppedGame(learn.advanceUntilDecision(swarmed(firstAsk().session, "ai", 0, 3), { runawayLimits: { stack: 2, battlefield: 2000 } })).session.engineStop;
    expect(stack.message).toBe("The engine stopped the game: 3 spells and abilities were waiting on the stack, past the engine's limit of 2 — a loop kept adding to the stack.");
  });

  it("controls: a game in progress, a game already over and an engine-stuck that no guard raised pass through untouched", () => {
    expect(learn.endEngineStoppedGame).toBeTypeOf("function");
    const asked = learn.advanceUntilDecision(beginner());
    expect(learn.endEngineStoppedGame(asked)).toBe(asked);

    const won = learn._forceLifeForTests(firstAsk().session, "ai", 0);
    const over = learn.advanceUntilDecision(won);
    expect(over.session.status).toBe("user-wins");
    expect(learn.endEngineStoppedGame(over)).toBe(over);

    // The pending-choice failsafe clears the choice and reports engine-stuck; the game can go on, so it is not ended here.
    const { session } = firstAsk();
    const unhandled = learn.advanceUntilDecision({ ...session, state: { ...session.state, pendingChoice: { kind: "no-such-kind", controller: "ai" } } });
    expect(unhandled.decision.kind).toBe("engine-stuck");
    expect(unhandled.decision.guard).toBeUndefined();
    expect(learn.endEngineStoppedGame(unhandled)).toBe(unhandled);
  });
});

describe("what the person reads", () => {
  it("the end screen: the engine stopped the game, nobody won or lost — not a win, a loss or an abandon", () => {
    const outcome = reasonToOutcome("engine-stopped", { detail: "Opponent controlled 2,001 permanents, past the engine's limit of 2,000 — a loop kept adding to the board." });
    expect(outcome.tone).toBe("neutral");
    expect(outcome.title).toBe("The engine stopped the game.");
    expect(outcome.blurb).toBe(
      "Opponent controlled 2,001 permanents, past the engine's limit of 2,000 — a loop kept adding to the board. Nobody won or lost. The game can't go on, so it is no longer offered under “Continue a game”; its record is kept.",
    );
    expect(`${outcome.title} ${outcome.blurb}`).not.toMatch(/You won|You lost|ended the game early|abandon/i);
    // Without the details the words are still true.
    expect(reasonToOutcome("engine-stopped").blurb).toBe("Nobody won or lost. The game can't go on, so it is no longer offered under “Continue a game”; its record is kept.");
  });

  it("the game-log line reads as its message", () => {
    const message = "The engine stopped the game: turn 4 went past the engine's limit of 2,000 steps for one turn without ending — a loop it could not get out of.";
    expect(logActionText({ kind: "game-stopped", guard: "turn-stall", message })).toBe(message);
    expect(logActionText({ kind: "game-stopped", guard: "turn-stall", message }, { seat: "ai1" })).toBe(message);
  });

  it("a puzzle attempt the engine stopped is neither solved nor failed", () => {
    const stopped = evaluatePuzzle({ goal: "win-this-turn", startTurn: 3, status: "ended", turn: 3, reason: "engine-stopped" });
    expect(stopped).toBe("stopped");
    // controls
    expect(evaluatePuzzle({ goal: "win-this-turn", startTurn: 3, status: "ended", turn: 3, reason: "ai-wins" })).toBe("failed");
    expect(evaluatePuzzle({ goal: "win-this-turn", startTurn: 3, status: "ended", turn: 3, reason: "user-wins" })).toBe("solved");
  });
});
