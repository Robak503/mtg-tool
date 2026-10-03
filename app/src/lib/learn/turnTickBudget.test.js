/**
 * turnTickBudget.test.js — the grind server-hang / OOM hotfix (2026-07-14).
 *
 * Root cause: a game where an AI loops an action that PRODUCES something each pass (mana, a
 * token) slips past the anti-loop latch (progressSignature only force-passes a no-op) and grinds
 * one turn to the 50000-tick SAFETY_CAP — ~tens of seconds of blocked event loop + an O(n²)
 * decisionLog balloon (the OOM). 3.3% of a real 24k-game store ended engine-stuck this way.
 *
 * Fix: a per-turn tick budget (default 2000; no legit turn measured over 333). A turn that burns
 * the budget without advancing is a non-terminating loop → end it engine-stuck at once. These pins
 * lock (a) the guard fires + carries its shape, and (b) a real game never trips the default budget.
 *
 * Decks are inline (plain vitest has no oracle index on disk) — the Forest/Grizzly Bears fixture
 * the other learnSession tests use.
 */

import { describe, it, expect } from "vitest";
import { createGame } from "./gameApi.js";
import { advanceUntilDecision, TURN_RAW_TICK_MULTIPLE } from "./learnSession.js";
import { parseEffectClause } from "./effects/parser.js";

function deck(prefix) {
  const out = [];
  for (let i = 0; i < 24; i++) out.push({ id: `${prefix}-f-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." });
  for (let i = 0; i < 16; i++) out.push({ id: `${prefix}-b-${i}`, name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, oracle: "" });
  return out;
}
const expertGame = () => createGame({ userDeck: deck("u"), opponentDeck: deck("a"), difficulty: "expert", mode: "standard", seed: "turn-budget" });

describe("per-turn tick budget — the grind spin guard", () => {
  it("a stingy budget ends the game 'turn stall' at the budget, NOT at the 50000 cap", () => {
    const { decision } = advanceUntilDecision(expertGame(), { turnTickBudget: 10 });
    expect(decision.kind).toBe("engine-stuck");
    expect(String(decision.reason)).toMatch(/turn stall/);
    // Bailed as soon as one turn crossed the budget — nowhere near SAFETY_CAP.
    expect(decision.maxTurnTicks).toBeLessThanOrEqual(11);
    expect(decision.ticks).toBeLessThanOrEqual(11);
  });

  it("the default 2000 budget never trips on a real game, and surfaces maxTurnTicks", () => {
    const { decision } = advanceUntilDecision(expertGame()); // default budget
    expect(decision.kind).toBe("game-over"); // a real game terminates on its own
    expect(String(decision.reason ?? "")).not.toMatch(/turn stall/);
    // Observability: the busiest turn is recorded, and it's far under the budget.
    expect(decision.maxTurnTicks).toBeGreaterThan(0);
    expect(decision.maxTurnTicks).toBeLessThan(2000);
  });
});

// ---------------------------------------------------------------------------------------------------------
// WHAT THE BUDGET COUNTS (2026-10-03): ticks that begin with an EMPTY stack. Every player passing so the next
// object can resolve is resolution work, and a legitimate turn can hold thousands of those ticks (236 Squirrels
// entering beside Altar of the Brood and Blasting Station: ~4,700). The raw count keeps its own ceiling, ten
// budgets, for a stack that never empties.
// ---------------------------------------------------------------------------------------------------------
describe("the budget is spent on empty-stack ticks", () => {
  const gainLife = parseEffectClause("You gain 1 life.", "Instant");
  const stackObject = (i) => ({
    id: `stk-probe-${i}`, kind: "activated-ability", source: { id: "probe-card", name: "Probe" }, controller: "user", targets: [],
    payload: { resolver: "effect-program", params: { program: gainLife, controller: "user", targets: [], cardId: "probe-card", sourceId: null } },
  });
  const loaded = (n) => { const s = expertGame(); return { ...s, state: { ...s.state, stack: Array.from({ length: n }, (_, i) => stackObject(i)) } }; };

  it("a turn busier than the budget is not a stall while the ticks over it were resolving the stack", () => {
    // Twenty abilities wait on the stack on turn 1: that turn takes 59 ticks against a budget of 30.
    const { session, decision } = advanceUntilDecision(loaded(20), { turnTickBudget: 30 });
    expect(decision.kind).toBe("game-over");
    expect(decision.maxTurnTicks).toBeGreaterThan(30);
    expect(session.state.players.user.life).toBe(60); // every one of the twenty resolved
  });

  it("a plain game's busiest turn may pass the budget in raw ticks too", () => {
    const { decision } = advanceUntilDecision(expertGame(), { turnTickBudget: 30 });
    expect(decision.kind).toBe("game-over");
    expect(decision.maxTurnTicks).toBeGreaterThan(30);
  });

  it("the raw count has a ceiling of ten budgets: a stack that will not empty in time is a stall", () => {
    const { session, decision } = advanceUntilDecision(loaded(200), { turnTickBudget: 5 });
    expect(decision.kind).toBe("engine-stuck");
    expect(String(decision.reason)).toBe("turn stall (51 ticks in a single turn — non-terminating loop)");
    expect(decision.ticks).toBe(51);
    expect(session.state.stack.length).toBeGreaterThan(0);
    expect(TURN_RAW_TICK_MULTIPLE).toBe(10);
  });
});
