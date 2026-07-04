/**
 * gameAnalysis.test.js (P5) — the shared post-game analyzer. Pins analyzeGame's per-seat
 * metrics (casts/lands/X/mulligans/attacks + dead-turn detection + combat-death attribution)
 * and summarizeSeatReality's per-deck aggregation, from synthetic finished-game specs.
 */
import { describe, it, expect } from "vitest";
import { analyzeGame, summarizeSeatReality } from "./gameAnalysis.js";

const game = (rows, log = []) => ({ decisionTrajectory: { rows }, log });

describe("analyzeGame — per-seat metrics", () => {
  it("counts casts, lands, X values, mulligans, attacks", () => {
    const m = analyzeGame(game([
      { turn: 0, seat: "user", action: { kind: "mulligan-ship" }, features: {} },
      { turn: 1, seat: "user", action: { kind: "play-land" }, features: { is_active_player: 1 } },
      { turn: 1, seat: "user", action: { kind: "cast-spell", xValue: 3 }, features: { is_active_player: 1 } },
      { turn: 2, seat: "user", action: { kind: "cast-spell" }, features: { is_active_player: 1 } },
      { turn: 3, seat: "user", action: { kind: "declare-attacker", name: "Bear" }, features: { is_active_player: 1 } },
      { turn: 3, seat: "user", action: { kind: "declare-attacker", name: "Elk" }, features: { is_active_player: 1 } },
    ])).user;
    expect(m.casts).toBe(2);
    expect(m.lands).toBe(1);
    expect(m.xValues).toEqual([3]);
    expect(m.mulligans).toBe(1);
    expect(m.attacksDeclared).toBe(2);
  });

  it("a turn with ONLY pass-priority / play-land is dead; a turn with a cast is not", () => {
    const m = analyzeGame(game([
      { turn: 1, seat: "user", action: { kind: "play-land" }, features: { is_active_player: 1 } },
      { turn: 1, seat: "user", action: { kind: "pass-priority" }, features: { is_active_player: 1 } },   // dead
      { turn: 2, seat: "user", action: { kind: "play-land" }, features: { is_active_player: 1 } },
      { turn: 2, seat: "user", action: { kind: "cast-spell" }, features: { is_active_player: 1 } },       // live
    ])).user;
    expect(m.activeTurns).toBe(2);
    expect(m.deadTurns).toBe(1);
  });

  it("only ACTIVE-player rows count toward a seat's turns (off-turn passes are not dead turns)", () => {
    const m = analyzeGame(game([
      { turn: 1, seat: "user", action: { kind: "pass-priority" }, features: { is_active_player: 0 } }, // opponent's turn
    ])).user;
    expect(m.activeTurns).toBe(0);
    expect(m.deadTurns).toBe(0);
  });

  it("combat deaths attribute to attacker vs blocker by the names that seat declared that turn; non-combat ignored", () => {
    const out = analyzeGame(game([
      { turn: 4, seat: "user", action: { kind: "declare-attacker", name: "Ox" }, features: { is_active_player: 1 } },
      { turn: 4, seat: "ai1", action: { kind: "declare-blocker", name: "Wall" }, features: { is_active_player: 0 } },
    ], [
      { kind: "creature-dies", cause: "combat", controller: "user", turn: 4, cardName: "Ox" },   // attacker died
      { kind: "creature-dies", cause: "combat", controller: "ai1", turn: 4, cardName: "Wall" },  // blocker died
      { kind: "creature-dies", cause: "sba", controller: "user", turn: 5, cardName: "Ghost" },   // non-combat → ignored
    ]));
    expect(out.user.attackerDeaths).toBe(1);
    expect(out.user.blockerDeaths).toBe(0);
    expect(out.ai1.blockerDeaths).toBe(1);
  });
});

describe("summarizeSeatReality — per-deck reality report", () => {
  const liveGame = (seat) => game([
    { turn: 1, seat, action: { kind: "cast-spell", xValue: 2 }, features: { is_active_player: 1 } },
    { turn: 2, seat, action: { kind: "play-land" }, features: { is_active_player: 1 } },
    { turn: 2, seat, action: { kind: "pass-priority" }, features: { is_active_player: 1 } }, // dead turn
  ]);

  it("averages a seat's metrics across games; deadTurnRate = dead/active", () => {
    const r = summarizeSeatReality([liveGame("user"), liveGame("user")], "user");
    expect(r.games).toBe(2);
    expect(r.avgActiveTurns).toBe(2);
    expect(r.avgDeadTurns).toBe(1);
    expect(r.deadTurnRate).toBeCloseTo(0.5);
    expect(r.avgCasts).toBe(1);
    expect(r.avgX).toBe(2);
  });

  it("returns null when the seat never appears (no fabricated zero row)", () => {
    expect(summarizeSeatReality([liveGame("user")], "ai9")).toBeNull();
  });
});
