import { describe, expect, it } from "vitest";
import { summariseGameHistory, formatInsightsForAgent } from "./gameInsights.js";

function run({ archetype = "ramp", score = 60, mulligans = 0, summary = "", savedAt = new Date().toISOString(), deckId = "deck-a", deckName = "Test Deck" } = {}) {
  return { deckId, deckName, archetype, score, mulligans, summary, savedAt };
}

describe("summariseGameHistory", () => {
  it("returns count:0 when no runs", () => {
    expect(summariseGameHistory([])).toEqual({ count: 0 });
    expect(summariseGameHistory(null)).toEqual({ count: 0 });
  });

  it("picks archetype consensus from the most common archetype", () => {
    const runs = [
      run({ archetype: "combo" }),
      run({ archetype: "combo" }),
      run({ archetype: "combo" }),
      run({ archetype: "ramp" }),
    ];
    const result = summariseGameHistory(runs);
    expect(result.archetype.consensus).toBe("combo");
    expect(result.archetype.confidence).toBe(75);
    expect(result.archetype.distribution.combo).toBe(3);
    expect(result.archetype.distribution.ramp).toBe(1);
  });

  it("computes avg/min/max/recent5/trend correctly", () => {
    const newer = [80, 78, 82, 85, 79];
    const older = [50, 52, 48, 55, 51];
    const all = [...newer, ...older]; // newer first because we sort by savedAt desc
    const runs = all.map((score, i) => run({
      score,
      savedAt: new Date(2026, 4, 26, 10, 30 - i).toISOString(),
    }));
    const result = summariseGameHistory(runs);
    expect(result.score.max).toBe(85);
    expect(result.score.min).toBe(48);
    expect(result.score.recent5Avg).toBe(Math.round((80 + 78 + 82 + 85 + 79) / 5));
    expect(result.score.trend).toBe("improving");
  });

  it("flags regressing trend when newer scores are lower", () => {
    const newer = [40, 42, 38, 41, 39];
    const older = [70, 72, 68, 71, 69];
    const all = [...newer, ...older];
    const runs = all.map((score, i) => run({
      score,
      savedAt: new Date(2026, 4, 26, 10, 30 - i).toISOString(),
    }));
    const result = summariseGameHistory(runs);
    expect(result.score.trend).toBe("regressing");
  });

  it("computes mulligan rate from runs with mulligans > 0", () => {
    const runs = [
      run({ mulligans: 0 }),
      run({ mulligans: 1 }),
      run({ mulligans: 0 }),
      run({ mulligans: 2 }),
    ];
    const result = summariseGameHistory(runs);
    expect(result.mulligan.rate).toBe(50);
    expect(result.mulligan.avgCount).toBeCloseTo(0.75, 2);
  });

  it("extracts pacing from summary strings", () => {
    const runs = [
      run({ summary: "archetype ramp; commander on turn 3; early ramp online; card flow appeared; first threat turn 4" }),
      run({ summary: "archetype ramp; commander on turn 5; no early ramp; no early card flow; first threat turn 6" }),
      run({ summary: "archetype ramp; commander on turn 4; early ramp online; card flow appeared; first threat turn 5" }),
    ];
    const result = summariseGameHistory(runs);
    // Commander by turn 4: runs 1 (T3) and 3 (T4) qualify → 2/3 = 67%
    expect(result.pacing.commanderByTurn4Rate).toBe(67);
    expect(result.pacing.earlyRampRate).toBe(67);   // 2/3
    expect(result.pacing.earlyDrawRate).toBe(67);
    expect(result.pacing.threatByTurn5Rate).toBe(67); // T4 and T5 qualify
  });

  it("surfaces weak signals when pacing is bad", () => {
    const runs = Array.from({ length: 5 }, () => run({
      summary: "archetype midrange; commander not cast by turn 6; no early ramp; no early card flow; no clear threat by turn 6",
      mulligans: 0,
    }));
    const result = summariseGameHistory(runs);
    expect(result.weakSignals.length).toBeGreaterThan(0);
    expect(result.weakSignals.some(s => s.includes("Commander"))).toBe(true);
  });

  it("surfaces strong signals when pacing is good", () => {
    const runs = Array.from({ length: 5 }, () => run({
      summary: "archetype ramp; commander on turn 3; early ramp online; card flow appeared; first threat turn 4",
    }));
    const result = summariseGameHistory(runs);
    expect(result.strongSignals.length).toBeGreaterThan(0);
  });

  it("includes newest3 samples", () => {
    const runs = Array.from({ length: 5 }, (_, i) => run({
      score: i * 10,
      savedAt: new Date(2026, 4, 26, 10, 30 - i).toISOString(),
    }));
    const result = summariseGameHistory(runs);
    expect(result.samples.newest3).toHaveLength(3);
    expect(result.samples.newest3[0].score).toBe(0);  // most recent (i=0)
  });
});

describe("formatInsightsForAgent", () => {
  it("returns empty string when fewer than 2 runs", () => {
    expect(formatInsightsForAgent({ count: 0 })).toBe("");
    expect(formatInsightsForAgent({ count: 1 })).toBe("");
    expect(formatInsightsForAgent(null)).toBe("");
  });

  it("produces structured plain text with all sections when data present", () => {
    const runs = Array.from({ length: 8 }, (_, i) => run({
      score: 60 + i,
      summary: "archetype ramp; commander on turn 3; early ramp online; card flow appeared; first threat turn 4",
    }));
    const insights = summariseGameHistory(runs);
    const formatted = formatInsightsForAgent(insights);
    expect(formatted).toContain("Goldfish History");
    expect(formatted).toContain("simulated 8 times");
    expect(formatted).toContain("ramp");
    expect(formatted).toContain("Average score");
    expect(formatted).toContain("Pacing");
  });
});
