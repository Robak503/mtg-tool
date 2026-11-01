/**
 * engineThrowGuard.test.js — advanceUntilDecision never throws on an engine bug, and never hides one (2026-11-01).
 *
 * Its contract says it never throws, and the self-play runner leans on it — but the legal-actions call at the priority window, the
 * pending-choice settlers and the SBA pass ran outside every guard. Self-play seed 3277877396 threw "Maximum call stack size
 * exceeded" out of legalActionsForPlayer on turn 34; four shelf seeds threw out of settleSacrificeChoice (Kozilek's annihilator, an
 * Aura whose host was sacrificed beside it) and settleCommanderReturnChoice (a discover cast Kellan, the Kid out of the exile the
 * return choice still named). Each escaped to the runner, whose catch reported the turn of the session it was HANDED (turn 1).
 *
 * Now a throw inside the loop is a "dispatch-error" — a crash, never a stall — carrying the error itself (`error: { name, message,
 * code, stack }`), the turn it happened on, and `guard: { type: "engine-error", message }` so the Academy ends the game honestly
 * (endEngineStoppedGame) instead of leaving it to re-throw on every resume. The self-play record keeps the classification and the
 * error: result "dispatch-error", `error`, `errorStack`, the real `turns`.
 *
 * UNDER THE TEST-TIME AUDITOR (MTG_AUDIT=1, every vitest run — src/test-setup) the guard converts nothing: a throw inside the loop —
 * an AUDIT_VIOLATION, any invariant error — escapes advanceUntilDecision exactly as it did before the guard, so a test that never
 * asserts the decision still goes red on engine corruption. The conversion witnesses below switch the auditor off for themselves.
 *
 * The throw is injected (legalActionsForPlayer wrapped to throw from a chosen turn on) — the real throws are fixed or reported
 * elsewhere, and this pins the guard for any throw, not one bug. (The castexplode review's F3.)
 *
 * THE LOOP'S OWN CATCHES (the re-review's N3): a step that throws (nextStep) and a seat with no legal action whose pass throws were
 * 1.9.0's "engine-stuck" with a guard and no stack — a crash folded into a stall. Both are the same dispatch-error now, with the
 * error and its stack, keeping their guards ("engine-error" / "no-legal-action"); they convert in every mode, as they always did.
 * A throw the outer guard catches carries `at: "loop"`, so the Academy's line names an engine error, not a failed step.
 * F10: a pending-choice settler throwing — a commander-return choice whose card is not in the zone it names (the Kellan seeds).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./legalChoices.js", async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    legalActionsForPlayer: (state, playerId) => {
      const from = globalThis.__engineThrowGuardFromTurn;
      if (from != null && (state?.turn ?? 0) >= from) throw new RangeError("Maximum call stack size exceeded");
      return mod.legalActionsForPlayer(state, playerId);
    },
  };
});

const learn = await import("./learnSession.js");
const { runSelfPlayGame } = await import("./selfPlayRunner.js");
const { _resetIdsForTests } = await import("./gameState.js");

vi.setConfig({ testTimeout: 90_000 });

function deck(prefix) {
  const out = [];
  for (let i = 0; i < 25; i++) out.push({ id: `${prefix}-f-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}.", mana: "" });
  for (let i = 0; i < 25; i++) out.push({ id: `${prefix}-b-${i}`, name: "Grizzly Bears", type: "Creature — Bear", oracle: "", mana: "{1}{G}", cmc: 2, keywords: [], power: 2, toughness: 2 });
  return out;
}

let errorSpy;
let auditWas;
beforeEach(() => {
  _resetIdsForTests();
  globalThis.__engineThrowGuardFromTurn = null;
  auditWas = process.env.MTG_AUDIT;
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  globalThis.__engineThrowGuardFromTurn = null;
  process.env.MTG_AUDIT = auditWas;
  vi.restoreAllMocks();
});
const auditorOff = () => { process.env.MTG_AUDIT = "0"; };

const expertGame = () => learn.createLearnSession({ userDeck: deck("u"), opponentDeck: deck("a"), difficulty: "expert", mode: "standard", seed: "engine-throw-guard" });

describe("WITNESS — a throw inside the driver's loop is a dispatch-error carrying the error, not an escape and not a stall", () => {
  it("the legal-actions call throwing on turn 3: dispatch-error with the error's message, name and stack, on the session before the throw", () => {
    auditorOff();
    globalThis.__engineThrowGuardFromTurn = 3;
    let result = null;
    let threw = null;
    try { result = learn.advanceUntilDecision(expertGame()); } catch (e) { threw = e; }
    expect(threw).toBeNull();
    expect(result.decision.kind).toBe("dispatch-error");
    expect(result.decision.reason).toBe("Maximum call stack size exceeded");
    expect(result.decision.error).toMatchObject({ name: "RangeError", message: "Maximum call stack size exceeded" });
    expect(result.decision.error.stack).toMatch(/RangeError: Maximum call stack size exceeded/);
    expect(result.decision.turn).toBe(3);
    expect(result.decision.guard).toEqual({ type: "engine-error", message: "Maximum call stack size exceeded", at: "loop" });
    expect(result.session.status).toBe("active");
    expect(result.session.state.turn).toBe(3);
    // Reported, never swallowed: logged with the error itself (its stack rides it).
    expect(errorSpy.mock.calls.some((args) => args.some((a) => a instanceof RangeError))).toBe(true);
  });

  it("the Academy ends that game honestly: engine-stopped, its line naming the engine error", () => {
    auditorOff();
    globalThis.__engineThrowGuardFromTurn = 2;
    let ended = null;
    try { ended = learn.endEngineStoppedGame(learn.advanceUntilDecision(expertGame())); } catch { /* the base escapes here — asserted below */ }
    expect(ended?.session.status).toBe("engine-stopped");
    expect(ended.decision).toMatchObject({ kind: "game-over", reason: "engine-stopped", guard: "engine-error" });
    expect(ended.session.engineStop.turn).toBe(2);
  });

  it("the self-play runner records it as a dispatch-error with the turn it happened on, the message and the stack", () => {
    auditorOff();
    globalThis.__engineThrowGuardFromTurn = 4;
    const game = runSelfPlayGame({ deckA: deck("u"), deckB: deck("a"), mode: "standard" });
    expect(game.result).toBe("dispatch-error");
    expect(game.turns).toBe(4);
    expect(game.reason).toBe("Maximum call stack size exceeded");
    expect(game.error).toBe("Maximum call stack size exceeded");
    expect(typeof game.errorStack).toBe("string");
    expect(game.errorStack).toMatch(/RangeError: Maximum call stack size exceeded/);
    expect(game.trainingWeight).toBe(0);
  });

  it("under the test-time auditor (MTG_AUDIT=1) the same throw escapes advanceUntilDecision, as it did before the guard", () => {
    process.env.MTG_AUDIT = "1";
    globalThis.__engineThrowGuardFromTurn = 3;
    expect(() => learn.advanceUntilDecision(expertGame())).toThrow(RangeError);
  });
});

describe("CONTROL — no throw, no change", () => {
  it("the same game with nothing injected plays to its end", () => {
    const game = runSelfPlayGame({ deckA: deck("u"), deckB: deck("a"), mode: "standard" });
    expect(["user-wins", "ai-wins", "draw"]).toContain(game.result);
    expect(game.turns).toBeGreaterThan(4);
    expect(game.error).toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

/** A game the engine can't move on from: no priority holder, an unknown step — nextStep throws (gameEndings.test.js' state). */
function stepFaulted() {
  const session = expertGame();
  return { ...session, state: { ...session.state, priorityHolder: null, step: "no-such-step" } };
}
const stepThrown = (session) => `Invalid (phase=${session.state.phase}, step=no-such-step)`;

describe("WITNESS (N3) — a step that throws is a dispatch-error carrying its stack, not a stall", () => {
  it("nextStep throwing: dispatch-error with the error, its stack and the step's guard; the Academy's line still names the step", () => {
    const faulted = stepFaulted();
    const STEP_THROWN = stepThrown(faulted);
    const raw = learn.advanceUntilDecision(faulted);
    expect(raw.decision.kind).toBe("dispatch-error");
    expect(raw.decision.reason).toBe(STEP_THROWN);
    expect(typeof raw.decision.error.stack).toBe("string");
    expect(raw.decision.error.message).toBe(STEP_THROWN);
    expect(raw.decision.guard).toEqual({ type: "engine-error", message: STEP_THROWN });
    const ended = learn.endEngineStoppedGame(raw);
    expect(ended.session.status).toBe("engine-stopped");
    expect(ended.decision.detail).toBe(`moving the game to its next step failed with an engine error — ${STEP_THROWN}.`);
  });

  it("a throw the outer guard catches reads as an engine error, not a failed step, on the Academy's end line", () => {
    auditorOff();
    globalThis.__engineThrowGuardFromTurn = 2;
    const raw = learn.advanceUntilDecision(expertGame());
    expect(raw.decision.guard).toEqual({ type: "engine-error", message: "Maximum call stack size exceeded", at: "loop" });
    const ended = learn.endEngineStoppedGame(raw);
    expect(ended.decision.detail).toBe("the engine hit an error — Maximum call stack size exceeded.");
    expect(ended.decision.detail).not.toMatch(/next step/);
  });
});

describe("TESTS (F10) — a pending-choice settler's throw reaches the guard", () => {
  it("a commander-return choice whose card is not in exile: dispatch-error naming it, with the settler on its stack", () => {
    auditorOff();
    const session = expertGame();
    const state = { ...session.state, pendingChoice: { kind: "commander-return", controller: "user", zone: "exile", cardId: "ghost-cmdr", cardName: "Ghost Commander" } };
    const raw = learn.advanceUntilDecision({ ...session, state });
    expect(raw.decision.kind).toBe("dispatch-error");
    expect(raw.decision.reason).toMatch(/ghost-cmdr/);
    expect(raw.decision.error.stack).toMatch(/settleCommanderReturnChoice/);
    expect(raw.decision.guard).toMatchObject({ type: "engine-error", at: "loop" });
  });

  it("under the test-time auditor the same settler throw escapes, as before the guard", () => {
    process.env.MTG_AUDIT = "1";
    const session = expertGame();
    const state = { ...session.state, pendingChoice: { kind: "commander-return", controller: "user", zone: "exile", cardId: "ghost-cmdr", cardName: "Ghost Commander" } };
    expect(() => learn.advanceUntilDecision({ ...session, state })).toThrow(/ghost-cmdr/);
  });
});
