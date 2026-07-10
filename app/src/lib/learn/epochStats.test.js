/**
 * epochStats.test.js — EPOCH-2 per-game instrumentation: finish ranks (winner 1, survivors
 * tie best-remaining, eliminated bottom-up), the win-condition taxonomy (vitals-driven), and
 * mana-health derivation from the engine's own log events.
 */
import { describe, it, expect } from "vitest";
import { computeEpochStats } from "./epochStats.js";

const SEATS = ["user", "ai1", "ai2", "ai3"];
const elim = (player, turn, vitals = {}) => ({ kind: "player-eliminated", player, turn, life: 0, poison: 0, decked: false, commanderLethal: false, ...vitals });

describe("finish ranks", () => {
  it("sole-survivor win: winner 1, eliminated rank bottom-up in elimination order", () => {
    const log = [elim("ai2", 10), elim("user", 15), elim("ai1", 22)];
    const { seats } = computeEpochStats({ state: { players: { ai3: {} } }, log, result: "ai-wins", winnerSeat: "ai3", seats: SEATS });
    expect(seats.ai3.finishRank).toBe(1);
    expect(seats.ai1.finishRank).toBe(2); // last eliminated = best of the fallen
    expect(seats.user.finishRank).toBe(3);
    expect(seats.ai2.finishRank).toBe(4); // first out = last place
    expect(seats.ai2.eliminatedAtTurn).toBe(10);
    expect(seats.ai3.eliminatedAtTurn).toBeNull();
  });

  it("clock end with no winner: all survivors tie at rank 1", () => {
    const log = [elim("ai1", 9)];
    const { seats } = computeEpochStats({ state: { players: { user: {}, ai2: {}, ai3: {} } }, log, result: "timeout", winnerSeat: null, seats: SEATS });
    expect(seats.user.finishRank).toBe(1);
    expect(seats.ai2.finishRank).toBe(1);
    expect(seats.ai3.finishRank).toBe(1);
    expect(seats.ai1.finishRank).toBe(4);
  });
});

describe("win condition taxonomy", () => {
  const base = { state: { players: { user: {} } }, seats: SEATS, winnerSeat: "user" };
  it("commander damage", () => {
    const { winCondition } = computeEpochStats({ ...base, log: [elim("ai1", 8), elim("ai2", 9), elim("ai3", 12, { commanderLethal: true })], result: "user-wins" });
    expect(winCondition).toBe("commander-damage");
  });
  it("poison", () => {
    const { winCondition } = computeEpochStats({ ...base, log: [elim("ai3", 12, { poison: 10 })], result: "user-wins" });
    expect(winCondition).toBe("poison");
  });
  it("decking", () => {
    const { winCondition } = computeEpochStats({ ...base, log: [elim("ai3", 12, { decked: true, life: 20 })], result: "user-wins" });
    expect(winCondition).toBe("decking");
  });
  it("plain damage (combat/burn undistinguished v1)", () => {
    const { winCondition } = computeEpochStats({ ...base, log: [elim("ai3", 12)], result: "user-wins" });
    expect(winCondition).toBe("damage");
  });
  it("clock / stuck / draw map from the result token", () => {
    expect(computeEpochStats({ ...base, log: [], result: "timeout" }).winCondition).toBe("clock");
    expect(computeEpochStats({ ...base, log: [], result: "engine-stuck" }).winCondition).toBe("stuck");
    expect(computeEpochStats({ ...base, log: [], result: "draw" }).winCondition).toBe("draw");
  });
});

describe("mana health", () => {
  it("landsByT5 + commanderOnlineTurn from log events; screw/flood flags; colorMiss stays null (parked)", () => {
    const log = [
      { kind: "play-land", playerId: "user", turn: 1 },
      { kind: "play-land", playerId: "user", turn: 2 },
      { kind: "play-land", playerId: "user", turn: 7 }, // past T5 — not counted
      { kind: "cast-spell", playerId: "user", cardName: "Omnath, Locus of Mana", turn: 4 },
      { kind: "play-land", playerId: "ai1", turn: 1 },
    ];
    const { seats } = computeEpochStats({
      state: { players: { user: {}, ai1: {} } }, log, result: "draw", winnerSeat: null, seats: ["user", "ai1"],
      commandersBySeat: { user: ["Omnath, Locus of Mana"], ai1: ["Koma, Cosmos Serpent"] },
    });
    expect(seats.user.manaHealth.landsByT5).toBe(2);
    expect(seats.user.manaHealth.commanderOnlineTurn).toBe(4);
    expect(seats.user.manaHealth.screw).toBe(true); // 2 < 3
    expect(seats.ai1.manaHealth.commanderOnlineTurn).toBeNull(); // never cast
    expect(seats.user.manaHealth.colorMissEvents).toBeNull(); // parked, never fabricated
  });
});
