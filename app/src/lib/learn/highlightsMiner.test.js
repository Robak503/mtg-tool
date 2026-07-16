/**
 * highlightsMiner.test.js — the miner turns a Crucible results object into honest fact cards,
 * and NEVER invents a fact the data can't prove.
 */

import { describe, expect, it } from "vitest";
import { mineHighlights } from "./highlightsMiner.js";

const results = {
  played: 100,
  decisive: 98,
  winConMix: { damage: 70, "commander-damage": 20, combo: 8 },
  tiles: { cleanFinishPct: 100 },
  standings: [
    { name: "Ur-Dragon", games: 100, wins: 46, winRate: 0.46, avgFinish: 1.9, finish: [46, 20, 18, 16], topWinCon: "damage" },
    { name: "Zaxara", games: 100, wins: 52, winRate: 0.52, avgFinish: 2.1, finish: [52, 8, 16, 24], topWinCon: "commander-damage" },
    { name: "Koma", games: 100, wins: 0, winRate: 0.0, avgFinish: 3.5, finish: [0, 10, 30, 60], topWinCon: null },
  ],
  mostWins: { name: "Zaxara", wins: 52, winRate: 0.52 },
  perGame: [
    { winner: "Ur-Dragon", turns: 8, result: "ai-wins", seedIndex: 0 },
    { winner: "Zaxara", turns: 22, result: "ai-wins", seedIndex: 2 }, // seedIndex ≠ array index (a throw consumed seed 1)
    { winner: "Ur-Dragon", turns: 14, result: "user-wins", seedIndex: 3 },
  ],
};

describe("mineHighlights", () => {
  it("crowns the best-average deck and flags the wins-vs-placement gap", () => {
    const h = mineHighlights(results);
    const titles = h.map((c) => c.title);
    expect(titles).toContain("The crown");
    // Ur-Dragon has the best avg finish; Zaxara has the most wins → the gap fact fires.
    const gap = h.find((c) => c.title === "Wins vs. placement");
    expect(gap).toBeTruthy();
    expect(gap.detail).toContain("Zaxara");
    expect(gap.detail).toContain("Ur-Dragon");
  });

  it("summarizes how the pod closes from the win-con mix", () => {
    const h = mineHighlights(results);
    const close = h.find((c) => c.title === "How the pod closes");
    expect(close).toBeTruthy();
    // Damage is the plurality (70 of 98) → leads, ~71%, with the runners-up named.
    expect(close.detail).toMatch(/71% of wins came via damage/);
    expect(close.detail).toContain("commander damage");
    expect(close.detail).toContain("a combo");
  });

  it("reports the fastest close from real per-game turns", () => {
    const h = mineHighlights(results);
    const fast = h.find((c) => c.title === "Fastest close");
    expect(fast).toBeTruthy();
    expect(fast.detail).toContain("turn 8"); // the min-turns decisive game
    expect(fast.detail).toContain("Ur-Dragon");
  });

  it("game-anchored facts carry the game's SEED index for ▶ watch-it; aggregate facts never do (feature C)", () => {
    const h = mineHighlights(results);
    const fast = h.find((c) => c.title === "Fastest close");
    const grind = h.find((c) => c.title === "The long grind");
    expect(fast.gameIndex).toBe(0);   // the row's seedIndex, NOT its array position
    expect(grind.gameIndex).toBe(2);  // longest game (22 turns) sits at seedIndex 2
    for (const c of h) {
      if (c.title !== "Fastest close" && c.title !== "The long grind") expect(c.gameIndex ?? null).toBeNull();
    }
  });

  it("a legacy row without seedIndex yields gameIndex null — the ▶ never points at a guessed game", () => {
    const legacy = { ...results, perGame: results.perGame.map(({ seedIndex: _s, ...g }) => g) };
    const h = mineHighlights(legacy);
    expect(h.find((c) => c.title === "Fastest close").gameIndex).toBeNull();
  });

  it("caps the reel and returns nothing for empty results", () => {
    expect(mineHighlights({ standings: [] })).toEqual([]);
    expect(mineHighlights(null)).toEqual([]);
    expect(mineHighlights(results).length).toBeLessThanOrEqual(6);
  });
});
