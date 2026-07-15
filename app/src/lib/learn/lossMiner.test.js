/**
 * lossMiner.test.js — "Why you lost" pure miner. Fixture headers exercise the honest gating: too-few-losses
 * silence, null-flag conservatism, the finishRank-2 attribution guard on cause-of-death, and share ranking.
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
function loss({ screw = false, flood = false, cmdrOnline = 4, ownTurns = 6, finishRank = 3, elimTurn = 10, winCondition = "combat" } = {}) {
  return {
    result: "ai-wins", winnerSeat: "user", decks: DECKS4, winCondition,
    seatStats: { ai1: { finishRank, eliminatedAtTurn: elimTurn, manaHealth: { screw, flood, commanderOnlineTurn: cmdrOnline, ownTurns } } },
  };
}
// A Koma WIN header.
function win() {
  return { result: "ai-wins", winnerSeat: "ai1", decks: DECKS4, winCondition: "combat",
    seatStats: { ai1: { finishRank: 1, eliminatedAtTurn: null, manaHealth: { screw: false, flood: false, commanderOnlineTurn: 3, ownTurns: 9 } } } };
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

  it("surfaces a dominant pattern with its real share once past the floor", () => {
    // 20 losses: 12 mana-screw, rest clean.
    const headers = [...rep(12, () => loss({ screw: true })), ...rep(8, () => loss({ screw: false }))];
    const r = mineDeckLosses(headers, KOMA);
    expect(r.losses).toBe(20);
    const screw = r.patterns.find((p) => p.key === "mana-screw");
    expect(screw).toBeTruthy();
    expect(screw.count).toBe(12);
    expect(screw.share).toBeCloseTo(0.6, 5);
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
    const cd = r.patterns.find((p) => p.key === "commander-damage");
    expect(cd).toBeTruthy();
    expect(cd.count).toBe(5); // only the rank-2 deaths, never the rank-4 ones
    expect(cd.share).toBeCloseTo(5 / 15, 5);
  });

  it("drops patterns below the count/share gate and ranks the survivors by share", () => {
    // 20 losses: 10 died-fast (0.50), 4 flood (0.20), 2 screw (0.10 — below the 0.15 share gate → dropped).
    const headers = [
      ...rep(10, () => loss({ elimTurn: 6 })),
      ...rep(4, () => loss({ elimTurn: 12, flood: true })),
      ...rep(2, () => loss({ elimTurn: 12, screw: true })),
      ...rep(4, () => loss({ elimTurn: 12 })),
    ];
    const r = mineDeckLosses(headers, KOMA);
    const keys = r.patterns.map((p) => p.key);
    expect(keys[0]).toBe("died-fast");           // highest share leads
    expect(keys).toContain("flood");
    expect(keys).not.toContain("mana-screw");    // 2/20 = 0.10 < 0.15 gate
    // ranked descending by share
    for (let i = 1; i < r.patterns.length; i++) expect(r.patterns[i - 1].share).toBeGreaterThanOrEqual(r.patterns[i].share);
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
