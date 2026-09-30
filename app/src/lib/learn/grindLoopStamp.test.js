/**
 * grindLoopStamp.test.js — the grind header's engineVersion comes from engineBuild() (release-readiness R2,
 * 2026-09-29), not app/package.json's never-bumped version. The engine run and the store are mocked so ONE
 * fake game flows through the REAL loop; grindLoop.test.js keeps its guard tests mock-free.
 */
import { describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => []);

vi.mock("./engineBuild.js", () => ({ engineBuild: () => "9.9.9+sentinel" }));
vi.mock("./selfPlayRunner.js", () => ({
  runSelfPlayGame: () => ({ result: "user-wins", winnerSeat: "user", turns: 5, decisionTrajectory: { rows: [] } }),
  resolveBaseSeed: () => 1,
  engineSeatsForMode: () => ["user", "ai1", "ai2", "ai3"],
}));
vi.mock("./gameLogStore.js", () => ({
  appendGame: async (record) => {
    captured.push(record);
    return { totalBytes: 1 };
  },
  upsertDeckVersions: async () => {},
}));

import { grindStatus, requestGrindCancel, startGrind } from "./grindLoop.js";

const deck = (n) => ({ id: `d${n}`, name: `Deck ${n}`, cards: [{ name: `Card ${n}` }], commanders: [] });

async function until(pred, ms = 5000) {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for the grind loop");
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe("grindLoop — the header's engine stamp", () => {
  it("every recorded game carries engineBuild()'s stamp", async () => {
    const r = await startGrind({ decks: [deck(1), deck(2), deck(3), deck(4)], mode: "commander" });
    expect(r.started).toBe(true);
    await until(() => captured.length >= 1);
    requestGrindCancel();
    await until(() => !grindStatus().running);
    expect(grindStatus().error).toBeNull();
    expect(captured.length).toBeGreaterThanOrEqual(1);
    for (const rec of captured) expect(rec.header.engineVersion).toBe("9.9.9+sentinel");
  });
});
