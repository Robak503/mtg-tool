/**
 * breakageReport.test.js — the aggregator buckets REAL log entries by card and the
 * .txt contains the expected sections. Uses synthetic game results with hand-built
 * state.log entries shaped exactly like the engine emits (spell-unresolved,
 * stack-resolve-error, trigger-removed-no-target).
 */

import { describe, expect, it } from "vitest";
import { aggregateBreakages, formatBreakageTxt } from "./breakageReport.js";

// A game result shaped like runSelfPlayGame's output.
function game({ result = "draw", turns = 10, reason = null, log = [], meta = {}, winnerSeat = null, winnerName = null, winCondition = null }) {
  return { result, status: result, reason, turns, ticks: null, log, meta, winnerSeat, winnerName, winCondition };
}

describe("aggregateBreakages", () => {
  it("buckets per-card breakages by cardName and ranks by frequency", () => {
    const games = [
      game({
        result: "ai-wins",
        turns: 12,
        meta: { seatNames: ["Deck A", "Deck B"] },
        log: [
          { turn: 3, kind: "spell-unresolved", cardName: "Akroma's Will", controller: "user", reason: "effect-program (low confidence)" },
          { turn: 5, kind: "spell-unresolved", cardName: "Akroma's Will", controller: "ai", reason: "effect-program (low confidence)" },
          { turn: 7, kind: "stack-resolve-error", cardName: "Doomsday", error: "boom" },
          { turn: 2, kind: "trigger-removed-no-target", source: "Mortuary Mire", controller: "ai" },
          { turn: 4, kind: "stack-resolve", objectId: "x" }, // NOT a breakage kind — ignored
        ],
      }),
      game({
        result: "draw",
        turns: 20,
        meta: { seatNames: ["Deck C", "Deck D"] },
        log: [
          { turn: 9, kind: "spell-unresolved", cardName: "Akroma's Will", controller: "user", reason: "effect-program (low confidence)" },
        ],
      }),
    ];

    const agg = aggregateBreakages(games);

    // Akroma's Will appears 3× total → ranked first.
    expect(agg.cards[0].card).toBe("Akroma's Will");
    expect(agg.cards[0].count).toBe(3);
    expect(agg.cards[0].kinds).toEqual({ "spell-unresolved": 3 });
    expect(agg.cards[0].sampleReason).toBe("effect-program (low confidence)");
    expect(agg.cards[0].sampleTurn).toBe(3);

    // Doomsday + Mortuary Mire are also bucketed (count 1 each).
    const names = agg.cards.map((c) => c.card);
    expect(names).toContain("Doomsday");
    expect(names).toContain("Mortuary Mire");

    // The non-breakage "stack-resolve" entry is not counted: 3 Akroma + Doomsday
    // + Mortuary Mire = 5 real breakage entries across the two games.
    expect(agg.totalBreakages).toBe(5);

    // Outcome tally is honest.
    expect(agg.outcomes.total).toBe(2);
    expect(agg.outcomes.aiWins).toBe(1);
    expect(agg.outcomes.draws).toBe(1);
    expect(agg.outcomes.completed).toBe(2);
    expect(agg.avgTurns).toBe(16); // (12 + 20) / 2
  });

  it("reports non-completions honestly (never coerced to a draw)", () => {
    const games = [
      game({ result: "engine-stuck", turns: 50, reason: "safety cap" }),
      game({ result: "dispatch-error", turns: 8, reason: "DispatcherError" }),
      game({ result: "setup-error", turns: 0, reason: "userDeck empty" }),
    ];
    const agg = aggregateBreakages(games);
    expect(agg.outcomes.engineStuck).toBe(1);
    expect(agg.outcomes.dispatchError).toBe(1);
    expect(agg.outcomes.setupError).toBe(1);
    expect(agg.outcomes.completed).toBe(0);
    expect(agg.outcomes.draws).toBe(0); // a stuck game is NOT a draw
  });

  it("a timePressure TIMEOUT lands in its own labeled bucket — not 'unexpected'", () => {
    const games = [
      game({ result: "timeout", turns: 60, reason: "timeout" }),
      game({ result: "user-wins", turns: 9 }),
    ];
    const agg = aggregateBreakages(games);
    expect(agg.outcomes.timeouts).toBe(1);
    expect(agg.outcomes.unexpected).toBe(0); // no longer miscounted as an unknown result
    expect(agg.outcomes.completed).toBe(1);  // a timeout is honestly a non-completion
    const txt = formatBreakageTxt(agg, { deckNames: ["A", "B"] });
    expect(txt).toContain("timeout:         1"); // surfaced in the NON-COMPLETIONS section
  });

  it("handles a clean batch with zero breakages", () => {
    const agg = aggregateBreakages([game({ result: "user-wins", turns: 6, log: [] })]);
    expect(agg.cards).toEqual([]);
    expect(agg.totalBreakages).toBe(0);
    expect(agg.outcomes.userWins).toBe(1);
  });
});

describe("formatBreakageTxt", () => {
  it("renders the expected sections with real counts", () => {
    const games = [
      game({
        result: "ai-wins",
        turns: 12,
        reason: "ai-wins",
        winnerSeat: "ai2",
        winnerName: "Deck C",
        winCondition: "commander-damage",
        meta: { seatNames: ["Deck A", "Deck B", "Deck C", "Deck D"] },
        log: [
          { turn: 3, kind: "spell-unresolved", cardName: "Akroma's Will", controller: "user", reason: "unmodeled effect" },
        ],
      }),
    ];
    const agg = aggregateBreakages(games);
    const txt = formatBreakageTxt(agg, { deckNames: ["Deck A", "Deck B", "Deck C", "Deck D"], mode: "commander" });

    // Header + the three named sections are present.
    expect(txt).toContain("MTG Tool — Self-Play Stress Test");
    expect(txt).toContain("OUTCOMES");
    expect(txt).toContain("UNMODELED / BROKEN CARDS");
    expect(txt).toContain("PER-GAME RESULTS");

    // The real card + its reason appear in the table.
    expect(txt).toContain("Akroma's Will");
    expect(txt).toContain("unmodeled effect");
    expect(txt).toContain("spell-unresolved×1");

    // The per-game one-liner NAMES the winner + HOW they won, and joins the pod with
    // " · " so a comma-bearing commander name doesn't read as extra decks.
    expect(txt).toContain("Deck C won by commander damage (turn 12)");
    expect(txt).toContain("pod: Deck A · Deck B · Deck C · Deck D");

    // Decks header reflects the roster.
    expect(txt).toContain("Decks (4):");
  });

  it("states 'None' clearly when there were no breakages", () => {
    const agg = aggregateBreakages([game({ result: "draw", turns: 5, log: [] })]);
    const txt = formatBreakageTxt(agg, { deckNames: ["X"], mode: "standard" });
    expect(txt).toContain("UNMODELED / BROKEN CARDS");
    expect(txt).toMatch(/None —/);
  });

  it("surfaces a NON-COMPLETIONS block when a game got stuck", () => {
    const agg = aggregateBreakages([game({ result: "engine-stuck", turns: 99, reason: "safety cap" })]);
    const txt = formatBreakageTxt(agg, { deckNames: ["X", "Y", "Z", "W"], mode: "commander" });
    expect(txt).toContain("NON-COMPLETIONS");
    expect(txt).toContain("engine-stuck:");
  });
});
