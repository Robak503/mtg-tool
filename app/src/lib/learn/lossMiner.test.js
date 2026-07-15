/**
 * lossMiner.test.js — "Why you lost" pure miner. Fixture headers exercise the honest gating: too-few-losses
 * silence, null-flag conservatism, the finishRank-2 attribution guard on cause-of-death, and the LIFT gate
 * (a pattern as common in wins as losses is dropped) + lift ranking.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { mineDeckLosses, mineDeckLossesFromStore, readAllGrindHeaders } from "./lossMiner.js";
import { appendGame } from "./gameLogStore.js";

const DECKS4 = [
  { seat: "user", name: "Rival A" },
  { seat: "ai1", id: "koma", name: "Koma" },
  { seat: "ai2", name: "Rival B" },
  { seat: "ai3", name: "Rival C" },
];
const KOMA = { id: "koma", name: "Koma" };

// A Koma LOSS header (ai1 lost; a rival won). Override any state field.
function loss({ screw = false, flood = false, cmdrOnline = 4, ownTurns = 6, finishRank = 3, elimTurn = 10, winCondition = "combat", finalHandSize = 7 } = {}) {
  return {
    result: "ai-wins", winnerSeat: "user", decks: DECKS4, winCondition,
    seatStats: { ai1: {
      finishRank, eliminatedAtTurn: elimTurn,
      manaHealth: { screw, flood, commanderOnlineTurn: cmdrOnline, ownTurns },
      mull: { ships: 7 - finalHandSize, finalHandSize, bottomedCount: 7 - finalHandSize },
    } },
  };
}
// A Koma WIN header (ai1 won). Override any state field (mirrors loss(), for building win baselines).
function win({ cmdrOnline = 3, ownTurns = 9, finalHandSize = 7, screw = false, flood = false } = {}) {
  return { result: "ai-wins", winnerSeat: "ai1", decks: DECKS4, winCondition: "combat",
    seatStats: { ai1: {
      finishRank: 1, eliminatedAtTurn: null,
      manaHealth: { screw, flood, commanderOnlineTurn: cmdrOnline, ownTurns },
      mull: { ships: 7 - finalHandSize, finalHandSize, bottomedCount: 7 - finalHandSize },
    } } };
}
const rep = (n, f) => Array.from({ length: n }, (_, i) => f(i));

describe("mineDeckLosses — honest loss-pattern mining", () => {
  it("stays silent under the min-losses floor (too few to characterize)", () => {
    const r = mineDeckLosses(rep(5, () => loss({ screw: true })), KOMA);
    expect(r.games).toBe(5);
    expect(r.losses).toBe(5);
    expect(r.patterns).toEqual([]);
    expect(r.note).toMatch(/Only 5 recorded losses/);
  });

  it("surfaces a dominant pattern with its real loss-share once past the floor", () => {
    // 20 losses: 12 mana-screw, rest clean. No wins → the lift gate is waived (share-only fallback).
    const headers = [...rep(12, () => loss({ screw: true })), ...rep(8, () => loss({ screw: false }))];
    const r = mineDeckLosses(headers, KOMA);
    expect(r.losses).toBe(20);
    const screw = r.patterns.find((p) => p.key === "mana-screw");
    expect(screw).toBeTruthy();
    expect(screw.count).toBe(12);
    expect(screw.lossShare).toBeCloseTo(0.6, 5);
    expect(screw.winShare).toBeNull();   // no win baseline
    expect(screw.lift).toBeNull();
  });

  it("excludes wins and games the deck never played in", () => {
    const other = { result: "ai-wins", winnerSeat: "ai2", decks: [{ seat: "user", name: "X" }, { seat: "ai1", name: "NotKoma" }], winCondition: "combat", seatStats: {} };
    const headers = [...rep(10, () => loss({ screw: true })), ...rep(4, () => win()), other, other];
    const r = mineDeckLosses(headers, KOMA);
    expect(r.games).toBe(14);      // 10 losses + 4 wins; the two non-Koma games excluded
    expect(r.wins).toBe(4);
    expect(r.losses).toBe(10);
    expect(r.winRate).toBeCloseTo(4 / 14, 5);
  });

  it("never counts a null flag as the pattern (conservative — 'couldn't tell' != 'happened')", () => {
    // 12 losses where screw is null (game ended before turn 5) — mana-screw must NOT surface.
    const r = mineDeckLosses(rep(12, () => loss({ screw: null })), KOMA);
    expect(r.patterns.find((p) => p.key === "mana-screw")).toBeUndefined();
  });

  it("attributes commander-damage death only at finishRank 2 (the last elimination the header can name)", () => {
    // 6 cmdr-damage games where Koma died FIRST (rank 4) — not attributable; 5 where Koma died LAST (rank 2) — attributable.
    const headers = [
      ...rep(6, () => loss({ winCondition: "commander-damage", finishRank: 4, elimTurn: 6 })),
      ...rep(5, () => loss({ winCondition: "commander-damage", finishRank: 2, elimTurn: 12 })),
      ...rep(4, () => loss({ winCondition: "combat", finishRank: 3 })),
    ];
    const r = mineDeckLosses(headers, KOMA);
    const cd = r.patterns.find((p) => p.key === "killed-commander-damage");
    expect(cd).toBeTruthy();
    expect(cd.count).toBe(5); // only the rank-2 deaths, never the rank-4 ones
    expect(cd.lossShare).toBeCloseTo(5 / 15, 5);
  });

  it("attributes cause of death only to the last-eliminated seat — a finishRank-2 SURVIVOR never counts", () => {
    // 20 losses: 6 truly beaten in combat (died last, rank 2), 6 poisoned out (died last, rank 2),
    // 8 finishRank-2 SURVIVORS of someone else's combat win (eliminatedAtTurn null — never died).
    const headers = [
      ...rep(6, () => loss({ winCondition: "combat", finishRank: 2, elimTurn: 12 })),
      ...rep(6, () => loss({ winCondition: "poison", finishRank: 2, elimTurn: 14 })),
      ...rep(8, () => loss({ winCondition: "combat", finishRank: 2, elimTurn: null })),
    ];
    const r = mineDeckLosses(headers, KOMA);
    const combat = r.patterns.find((p) => p.key === "killed-combat");
    const poison = r.patterns.find((p) => p.key === "killed-poison");
    expect(combat.count).toBe(6);            // the 8 survivors are NOT counted — they never died
    expect(combat.lossShare).toBeCloseTo(6 / 20, 5);
    expect(poison.count).toBe(6);
  });

  it("merges non-combat lethal (burn + drain/damage) into one 'burned or drained' cause", () => {
    const headers = [
      ...rep(5, () => loss({ winCondition: "burn", finishRank: 2, elimTurn: 10 })),
      ...rep(5, () => loss({ winCondition: "damage", finishRank: 2, elimTurn: 11 })),
      ...rep(6, () => loss({ winCondition: "combat", finishRank: 3 })),
    ];
    const r = mineDeckLosses(headers, KOMA);
    const bd = r.patterns.find((p) => p.key === "killed-burn-drain");
    expect(bd.count).toBe(10); // burn + damage folded together
  });

  it("gates + ranks on LIFT — an endemic pattern (as common in wins) is dropped; a discriminative one is kept", () => {
    // The real-data trap: mulligan-tax fires in ~90% of losses AND ~90% of wins (the sim just mulls a lot),
    // while 'commander never came down' is 50% of losses but 5% of wins. Only the second is a reason you lost.
    const L = [
      ...rep(8, () => loss({ cmdrOnline: null, ownTurns: 5, finalHandSize: 5 })), // no-commander + mull
      ...rep(2, () => loss({ cmdrOnline: null, ownTurns: 5, finalHandSize: 7 })), // no-commander, full hand
      ...rep(10, () => loss({ cmdrOnline: 4, ownTurns: 6, finalHandSize: 5 })),   // mull only
    ]; // losses: no-commander 10/20 = .50 · mulligan-tax 18/20 = .90
    const W = [
      ...rep(1, () => win({ cmdrOnline: null, finalHandSize: 5 })),
      ...rep(17, () => win({ cmdrOnline: 3, finalHandSize: 5 })),
      ...rep(2, () => win({ cmdrOnline: 3, finalHandSize: 7 })),
    ]; // wins: no-commander 1/20 = .05 · mulligan-tax 18/20 = .90
    const r = mineDeckLosses([...L, ...W], KOMA);
    const keys = r.patterns.map((p) => p.key);
    expect(keys).toContain("no-commander");
    expect(keys).not.toContain("mulligan-tax");     // .90 vs .90 → lift 0 → filtered, despite a huge loss-share
    const nc = r.patterns.find((p) => p.key === "no-commander");
    expect(nc.lossShare).toBeCloseTo(0.5, 5);
    expect(nc.winShare).toBeCloseTo(0.05, 5);
    expect(nc.lift).toBeCloseTo(0.45, 5);
  });

  it("drops patterns below the concrete-count gate and ranks the survivors (no baseline → by loss-share)", () => {
    // 20 losses, no wins: 10 died-fast (0.50), 4 flood (0.20), 2 screw (count 2 < 3 → dropped by the count gate).
    const headers = [
      ...rep(10, () => loss({ elimTurn: 6 })),
      ...rep(4, () => loss({ elimTurn: 12, flood: true })),
      ...rep(2, () => loss({ elimTurn: 12, screw: true })),
      ...rep(4, () => loss({ elimTurn: 12 })),
    ];
    const r = mineDeckLosses(headers, KOMA);
    const keys = r.patterns.map((p) => p.key);
    expect(keys[0]).toBe("died-fast");           // highest loss-share leads
    expect(keys).toContain("flood");
    expect(keys).not.toContain("mana-screw");    // count 2 < MIN_PATTERN_COUNT (3)
    // ranked descending by lift ?? lossShare (no baseline here → lossShare)
    for (let i = 1; i < r.patterns.length; i++) expect(r.patterns[i - 1].lossShare).toBeGreaterThanOrEqual(r.patterns[i].lossShare);
  });

  it("returns null when the deck never appears; 0 losses when it appears but only won; reports avgLossTurn", () => {
    expect(mineDeckLosses([win(), win()], { id: "nobody" })).toBeNull(); // never in the pod → null
    expect(mineDeckLosses([win(), win()], KOMA).losses).toBe(0);          // in the pod but only won → 0 losses
    expect(mineDeckLosses([], KOMA)).toBeNull();
    const r = mineDeckLosses(rep(10, () => loss({ elimTurn: 9 })), KOMA);
    expect(r.avgLossTurn).toBeCloseTo(9, 5);
  });
});

describe("lossMiner reader — over a REAL on-disk grind store (chdir tmp, appendGame convention)", () => {
  let tmpDir, cwd;
  beforeEach(async () => { tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lossminer-")); cwd = process.cwd(); process.chdir(tmpDir); });
  afterEach(async () => { process.chdir(cwd); await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {}); });

  it("reads forever-headers across shards and mines a deck's losses end-to-end", async () => {
    const lossGame = (i) => ({
      header: {
        seed: i, engineVersion: "0.140.0", result: "ai-wins", winnerSeat: "user", turns: 11, mode: "commander",
        decks: [{ seat: "user", name: "A" }, { seat: "ai1", id: "koma", name: "Koma" }, { seat: "ai2", name: "B" }, { seat: "ai3", name: "C" }],
        seatStats: { ai1: { finishRank: 3, eliminatedAtTurn: 10, manaHealth: { screw: true, flood: false, commanderOnlineTurn: null, ownTurns: 6 } } },
        winCondition: "combat",
      },
      rows: [{ turn: 1, seat: "ai1", action: { kind: "pass" } }],
    });
    for (let i = 0; i < 12; i++) await appendGame(lossGame(i));
    const headers = await readAllGrindHeaders();
    expect(headers).toHaveLength(12);              // forever-headers read back across the shard
    const r = await mineDeckLossesFromStore({ id: "koma", name: "Koma" });
    expect(r.losses).toBe(12);
    expect(r.patterns.find((p) => p.key === "mana-screw").count).toBe(12); // schema-3 seatStats survives the round-trip
  });
});
