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
  it("plain damage — a life<=0 finish with no stamped source (drain/pay-life/legacy) stays generic", () => {
    const { winCondition } = computeEpochStats({ ...base, log: [elim("ai3", 12)], result: "user-wins" });
    expect(winCondition).toBe("damage");
  });
  it("combat — the lethal blow was combat damage", () => {
    const { winCondition } = computeEpochStats({ ...base, log: [elim("ai3", 12, { lethalByCombat: true })], result: "user-wins" });
    expect(winCondition).toBe("combat");
  });
  it("burn — the lethal blow was non-combat (spell/ability) damage", () => {
    const { winCondition } = computeEpochStats({ ...base, log: [elim("ai3", 12, { lethalByCombat: false })], result: "user-wins" });
    expect(winCondition).toBe("burn");
  });
  it("commander damage outranks a combat stamp (a commander's combat hit is commander-damage, not combat)", () => {
    const { winCondition } = computeEpochStats({ ...base, log: [elim("ai3", 12, { commanderLethal: true, lethalByCombat: true })], result: "user-wins" });
    expect(winCondition).toBe("commander-damage");
  });
  it("clock / stuck / draw map from the result token", () => {
    expect(computeEpochStats({ ...base, log: [], result: "timeout" }).winCondition).toBe("clock");
    expect(computeEpochStats({ ...base, log: [], result: "engine-stuck" }).winCondition).toBe("stuck");
    expect(computeEpochStats({ ...base, log: [], result: "draw" }).winCondition).toBe("draw");
  });
});

describe("mana health — featuresV=2 PER-SEAT-TURN units (Omnath 2026-07-10)", () => {
  // A 2-seat game, 12 GLOBAL turns = 6 own turns each. user owns odd global turns, ai1 even.
  const untaps = [];
  for (let t = 1; t <= 12; t++) untaps.push({ kind: "step", step: "untap", player: t % 2 === 1 ? "user" : "ai1", turn: t });

  it("landsByT5 counts the seat's OWN first 5 turns; commanderOnlineTurn is an own-turn index", () => {
    const log = [
      ...untaps,
      { kind: "play-land", playerId: "user", turn: 1 },  // user's own turn 1
      { kind: "play-land", playerId: "user", turn: 3 },  // own turn 2
      { kind: "play-land", playerId: "user", turn: 11 }, // own turn 6 — past the window, not counted
      { kind: "cast-spell", playerId: "user", cardName: "Omnath, Locus of Mana", turn: 7 }, // own turn 4
      { kind: "play-land", playerId: "ai1", turn: 2 },   // ai1's own turn 1
    ];
    const { seats } = computeEpochStats({
      state: { players: { user: {}, ai1: {} } }, log, result: "draw", winnerSeat: null, seats: ["user", "ai1"],
      commandersBySeat: { user: ["Omnath, Locus of Mana"], ai1: ["Koma, Cosmos Serpent"] },
    });
    expect(seats.user.manaHealth.landsByT5).toBe(2);
    expect(seats.user.manaHealth.ownTurns).toBe(6);
    expect(seats.user.manaHealth.commanderOnlineTurn).toBe(4);   // OWN-turn index, not global 7
    expect(seats.user.manaHealth.screw).toBe(true);              // 2 < 3 over a FULL 5-own-turn window
    expect(seats.ai1.manaHealth.commanderOnlineTurn).toBeNull(); // never cast
    expect(seats.user.manaHealth.colorMissEvents).toBeNull();    // parked, never fabricated
  });

  it("a TRUNCATED window (game ended before 5 own turns) → screw/flood null, never a fabricated flag", () => {
    // 4 global turns = 2 own turns each — the exact 198/200 all-seats-screwed bug shape.
    const shortLog = untaps.slice(0, 4).concat([
      { kind: "play-land", playerId: "user", turn: 1 },
      { kind: "play-land", playerId: "user", turn: 3 },
    ]);
    const { seats } = computeEpochStats({
      state: { players: { user: {}, ai1: {} } }, log: shortLog, result: "draw", winnerSeat: null, seats: ["user", "ai1"],
    });
    expect(seats.user.manaHealth.ownTurns).toBe(2);
    expect(seats.user.manaHealth.landsByT5).toBe(2); // 1 land per own turn so far — healthy
    expect(seats.user.manaHealth.screw).toBeNull();  // window truncated → no flag
    expect(seats.user.manaHealth.flood).toBeNull();
  });
});

describe("featuresV=2 — turnOrder + per-seat mulligan summary", () => {
  it("turnOrder = the seats in actual turn order; absent step events → null (never guessed)", () => {
    const log = [
      { kind: "step", step: "untap", player: "ai1", turn: 1 },
      { kind: "step", step: "untap", player: "user", turn: 2 },
      { kind: "step", step: "untap", player: "ai1", turn: 3 },
    ];
    const withSteps = computeEpochStats({ state: { players: {} }, log, result: "draw", winnerSeat: null, seats: ["user", "ai1"] });
    expect(withSteps.turnOrder).toEqual(["ai1", "user"]);
    const bare = computeEpochStats({ state: { players: {} }, log: [], result: "draw", winnerSeat: null, seats: ["user", "ai1"] });
    expect(bare.turnOrder).toBeNull();
  });

  it("mull = {ships, finalHandSize, bottomedCount} from the final keep event; absent → null", () => {
    const log = [
      { kind: "mulligan-ship", player: "user", mulligans: 1 },
      { kind: "mulligan-keep", player: "user", mulligans: 1, bottomed: 1 },
      { kind: "mulligan-keep", player: "ai1", mulligans: 0, bottomed: 0 },
    ];
    const { seats } = computeEpochStats({ state: { players: {} }, log, result: "draw", winnerSeat: null, seats: ["user", "ai1", "ai2"] });
    expect(seats.user.mull).toEqual({ ships: 1, finalHandSize: 6, bottomedCount: 1 });
    expect(seats.ai1.mull).toEqual({ ships: 0, finalHandSize: 7, bottomedCount: 0 });
    expect(seats.ai2.mull).toBeNull(); // no keep event recorded → absent, never fabricated
  });
});

describe("per-seat cause of death (Tier-2 forward capture)", () => {
  it("attributes a cause to EVERY eliminated seat (not just the last); the winner gets none", () => {
    const log = [
      elim("ai2", 6, { lethalByCombat: true }),                   // combat, first out
      elim("user", 10, { poison: 10 }),                           // poisoned out
      elim("ai1", 14, { commanderLethal: true, landsInHand: 4 }), // commander damage, 4 lands stranded in hand
    ];
    const { seats } = computeEpochStats({ state: { players: { ai3: {} } }, log, result: "ai-wins", winnerSeat: "ai3", seats: SEATS });
    expect(seats.ai2.death).toEqual({ cause: "combat", byCombat: true, landsInHand: null });
    expect(seats.user.death.cause).toBe("poison");
    expect(seats.ai1.death).toEqual({ cause: "commander-damage", byCombat: null, landsInHand: 4 });
    expect(seats.ai3.death).toBeUndefined(); // the winner never died — no death record fabricated
  });

  it("death.cause of the LAST-eliminated seat matches the game winCondition (shared taxonomy)", () => {
    const log = [elim("ai1", 8), elim("ai2", 9), elim("ai3", 12, { lethalByCombat: false })];
    const r = computeEpochStats({ state: { players: { user: {} } }, log, result: "user-wins", winnerSeat: "user", seats: SEATS });
    expect(r.winCondition).toBe("burn");
    expect(r.seats.ai3.death.cause).toBe("burn");
  });
});
