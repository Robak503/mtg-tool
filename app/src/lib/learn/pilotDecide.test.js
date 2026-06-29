/**
 * pilotDecide.test.js — Learn-to-Play item #3 v1: the pluggable `decide` seam +
 * full-decision trajectory recording.
 *
 * Three things proven here (the task's VERIFY list):
 *   1. BYTE-IDENTICAL DEFAULT: a seeded sweep with NO decide == the same sweep where
 *      decide always defers (returns undefined) == where decide returns an out-of-set
 *      garbage action. The seam is transparent when the pilot defers/misbehaves — no
 *      illegal/fabricated move can leak, no crash.
 *   2. PLUGGABLE PROOF: a real stub decider ("always pick the LAST legalAction") makes
 *      the game play MEASURABLY differently (the log diverges) — proving decide controls
 *      play — AND a decision trajectory is recorded with the right per-row shape.
 *   3. TRAJECTORY SHAPE: rows are tagged by pilot={playbook,temperament}, carry a feature
 *      object + a stably-serializable action, and the trajectory carries the final
 *      { result, winnerSeat, trainingWeight }. A forced-timeout game → trainingWeight 0.
 *
 * Hermetic: builds fully-shaped cards directly (no oracle-index dependency), exactly like
 * selfPlayRunner.test.js, so it runs in a fresh worktree with no MTG_APP_ROOT.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { _resetIdsForTests } from "./gameState.js";
import { runSelfPlayGame, runSelfPlayBatch } from "./selfPlayRunner.js";
import { advanceUntilDecision, createLearnSession } from "./learnSession.js";
import { FEATURE_KEYS } from "./gameFeatures.js";

beforeEach(() => _resetIdsForTests());

function forest(i) { return { id: `f-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}.", mana: "" }; }
function bear(i) { return { id: `b-${i}`, name: "Grizzly Bears", type: "Creature — Bear", oracle: "", mana: "{1}{G}", cmc: 2, keywords: [], power: 2, toughness: 2 }; }
function aggroDeck(prefix) {
  const cards = [];
  for (let i = 0; i < 25; i++) cards.push(forest(`${prefix}-${i}`));
  for (let i = 0; i < 25; i++) cards.push(bear(`${prefix}-${i}`));
  return cards;
}
function landDeck(prefix) {
  const cards = [];
  for (let i = 0; i < 60; i++) cards.push(forest(`${prefix}-${i}`));
  return cards;
}

// Quiet the turn-limit warnings the engine prints on stalling games.
function quiet(fn) {
  const w = vi.spyOn(console, "warn").mockImplementation(() => {});
  const l = vi.spyOn(console, "log").mockImplementation(() => {});
  try { return fn(); } finally { w.mockRestore(); l.mockRestore(); }
}

describe("decide seam — DEFAULT is byte-identical (the CREED line)", () => {
  it("no-decide == always-undefined-decide == garbage-decide (full logs/result/turns)", () => {
    const decks = [
      { id: "U", name: "U", cards: aggroDeck("u") },
      { id: "A", name: "A", cards: aggroDeck("a") },
    ];
    const opts = { mode: "standard", gamesPer: 3, baseSeed: 4242, timePressure: true };

    const A = quiet(() => runSelfPlayBatch(decks, opts));
    const B = quiet(() => runSelfPlayBatch(decks, {
      ...opts,
      pilots: { user: { decide: () => undefined }, ai: { decide: () => undefined } },
    }));
    const C = quiet(() => runSelfPlayBatch(decks, {
      ...opts,
      pilots: {
        user: { decide: () => ({ kind: "TOTALLY-FAKE", playerId: "user" }) },
        ai: { decide: () => ({ kind: "TOTALLY-FAKE", playerId: "ai" }) },
      },
    }));

    const fp = (batch) => batch.games.map((g) => JSON.stringify({ result: g.result, turns: g.turns, log: g.log }));
    const fa = fp(A), fb = fp(B), fc = fp(C);

    expect(fa.length).toBe(3);
    // A deferring pilot (undefined) and a misbehaving pilot (out-of-set garbage) both fall
    // back to the default pick → byte-identical to no decide at all.
    expect(fb).toEqual(fa);
    expect(fc).toEqual(fa);
  });

  it("a throwing decide never crashes the game — falls back to the default pick", () => {
    const decks = [
      { id: "U", name: "U", cards: aggroDeck("u") },
      { id: "A", name: "A", cards: aggroDeck("a") },
    ];
    const opts = { mode: "standard", gamesPer: 2, baseSeed: 7, timePressure: true };
    const A = quiet(() => runSelfPlayBatch(decks, opts));
    const T = quiet(() => runSelfPlayBatch(decks, {
      ...opts,
      pilots: { user: { decide: () => { throw new Error("boom"); } }, ai: { decide: () => { throw new Error("boom"); } } },
    }));
    const fp = (batch) => batch.games.map((g) => JSON.stringify({ result: g.result, turns: g.turns, log: g.log }));
    expect(fp(T)).toEqual(fp(A)); // a throwing pilot is swallowed → default pick → identical play
  });
});

describe("decide seam — PLUGGABLE proof (a stub decider controls play)", () => {
  // "always pick the LAST legalAction" — a legal but deliberately non-default policy.
  const pickLast = ({ legalActions }) => legalActions[legalActions.length - 1];

  it("a stub decider makes the game play MEASURABLY differently AND records a trajectory", () => {
    const baseArgs = { deckA: aggroDeck("u"), deckB: aggroDeck("a"), mode: "standard", seed: 999, timePressure: true };

    const def = quiet(() => runSelfPlayGame(baseArgs));
    const piloted = quiet(() => runSelfPlayGame({
      ...baseArgs,
      pilots: {
        user: { decide: pickLast, playbook: "test-last", temperament: "greedy" },
        ai: { decide: pickLast, playbook: "test-last", temperament: "greedy" },
      },
      recordDecisions: true,
    }));

    // Both reach a real terminal result (the seam never strands the game).
    expect(["user-wins", "ai-wins", "draw", "timeout"]).toContain(def.result);
    expect(["user-wins", "ai-wins", "draw", "timeout"]).toContain(piloted.result);

    // DECIDE CONTROLS PLAY: the piloted line diverges from the default line. Compare the
    // full engine logs — a different action policy ⇒ a different game record.
    expect(JSON.stringify(piloted.log)).not.toEqual(JSON.stringify(def.log));

    // A trajectory was recorded with rows (at least one enumerated decision happened).
    expect(piloted.decisionTrajectory).toBeTruthy();
    expect(Array.isArray(piloted.decisionTrajectory.rows)).toBe(true);
    expect(piloted.decisionTrajectory.rows.length).toBeGreaterThan(0);
  });

  it("default play records NO decision trajectory (opt-in, zero overhead)", () => {
    const def = quiet(() => runSelfPlayGame({ deckA: aggroDeck("u"), deckB: aggroDeck("a"), mode: "standard", seed: 1 }));
    expect(def.decisionTrajectory).toBeUndefined();
  });
});

describe("decide seam — TRAJECTORY shape", () => {
  const pickLast = ({ legalActions }) => legalActions[legalActions.length - 1];

  it("rows are tagged by pilot {playbook,temperament}, carry features + a stable action; the trajectory carries the final outcome", () => {
    const game = quiet(() => runSelfPlayGame({
      deckA: aggroDeck("u"),
      deckB: aggroDeck("a"),
      mode: "standard",
      seed: 314,
      timePressure: true,
      pilots: {
        user: { decide: pickLast, playbook: "voltron", temperament: "aggressive" },
        ai: { decide: pickLast, playbook: "control", temperament: "cautious" },
      },
      recordDecisions: true,
    }));

    const traj = game.decisionTrajectory;
    expect(traj).toBeTruthy();
    expect(traj.mode).toBe("standard");
    // The final game outcome is attached (the task's required shape).
    expect(traj.result).toBe(game.result);
    expect(traj).toHaveProperty("winnerSeat");
    expect(traj).toHaveProperty("trainingWeight");
    expect(traj.trainingWeight).toBe(game.trainingWeight);

    const seatsSeen = new Set();
    for (const row of traj.rows) {
      // Per-decision identity: turn, seat, pilot{playbook,temperament}.
      expect(Number.isInteger(row.turn)).toBe(true);
      expect(typeof row.seat).toBe("string");
      seatsSeen.add(row.seat);
      expect(row.pilot).toBeTruthy();
      expect(row.pilot).toHaveProperty("playbook");
      expect(row.pilot).toHaveProperty("temperament");

      // Features: a full featurizeState object (every canonical key present + finite).
      for (const k of FEATURE_KEYS) expect(Number.isFinite(row.features[k])).toBe(true);

      // Action serializes stably: a plain JSON object with a `kind`, no functions, round-trips.
      expect(row.action).toBeTruthy();
      expect(typeof row.action.kind).toBe("string");
      expect(JSON.parse(JSON.stringify(row.action))).toEqual(row.action);
    }

    // Each seat's pilot identity is recorded per its OWN config (per-seat, not shared).
    const userRow = traj.rows.find((r) => r.seat === "user");
    const aiRow = traj.rows.find((r) => r.seat === "ai");
    if (userRow) {
      expect(userRow.pilot.playbook).toBe("voltron");
      expect(userRow.pilot.temperament).toBe("aggressive");
    }
    if (aiRow) {
      expect(aiRow.pilot.playbook).toBe("control");
      expect(aiRow.pilot.temperament).toBe("cautious");
    }
    // Both seats took at least one enumerated decision over a full game.
    expect(seatsSeen.has("user")).toBe(true);
    expect(seatsSeen.has("ai")).toBe(true);
  });

  it("a forced-TIMEOUT game records a trajectory with trainingWeight 0 (never a fabricated W/L)", () => {
    // A pure-land mirror can never deal damage; a high soft cap keeps the clock from biting
    // before MAX_TURNS, so the game reaches the hard cap → an honest `timeout`.
    const game = quiet(() => runSelfPlayGame({
      deckA: landDeck("u"),
      deckB: landDeck("a"),
      mode: "standard",
      seed: 5,
      timePressure: { softCapTurn: 999, lifeLossStep: 4 }, // clock effectively never engages
      pilots: { user: { decide: pickLast, playbook: "p", temperament: "t" } },
      recordDecisions: true,
    }));

    expect(game.result).toBe("timeout");
    expect(game.trainingWeight).toBe(0); // a timeout is an honest non-result
    expect(game.decisionTrajectory).toBeTruthy();
    expect(game.decisionTrajectory.trainingWeight).toBe(0);
    expect(game.decisionTrajectory.winnerSeat).toBeNull(); // no winner from a stall
    expect(game.decisionTrajectory.result).toBe("timeout");
  });

  it("the bare advanceUntilDecision exposes the same decide+recordDecision seam (the loop-level contract)", () => {
    // Prove the seam at the LOOP level too (not only via the runner adapter): build a session,
    // pass decide + recordDecision directly, and confirm rows are captured + the game ends.
    const session = createLearnSession({
      userDeck: aggroDeck("u"),
      opponentDeck: aggroDeck("a"),
      difficulty: "expert",
      mode: "standard",
      seed: 77,
    });
    const rows = [];
    const out = quiet(() => advanceUntilDecision(session, {
      timePressure: true,
      pilot: { playbook: "loop", temperament: "neutral" },
      decide: ({ legalActions }) => legalActions[legalActions.length - 1],
      recordDecision: (row) => rows.push(row),
    }));
    expect(out.decision.kind).toBe("game-over");
    expect(rows.length).toBeGreaterThan(0);
    // The loop-level recorder stamps the single `pilot` passed to advanceUntilDecision.
    expect(rows[0].pilot).toEqual({ playbook: "loop", temperament: "neutral" });
    expect(typeof rows[0].action.kind).toBe("string");
    for (const k of FEATURE_KEYS) expect(Number.isFinite(rows[0].features[k])).toBe(true);
  });
});
