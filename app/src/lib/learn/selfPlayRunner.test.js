/**
 * selfPlayRunner.test.js — the thin self-play wrapper drives the existing Expert
 * auto-pilot to a terminal result, and the batch/pairing logic is correct.
 *
 * These build fully-shaped cards directly (no oracle-index dependency), exactly
 * like playable.integration.test.js, so they're hermetic in a fresh worktree.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { _resetIdsForTests } from "./gameState.js";
import {
  runSelfPlayGame,
  runSelfPlayBatch,
  buildPairings,
  outcomeLabelForSeat,
  trajectoriesToJsonl,
  writeTrajectoriesJsonl,
  startSeatForGame,
  engineSeatsForMode,
} from "./selfPlayRunner.js";
import { FEATURE_KEYS } from "./gameFeatures.js";

beforeEach(() => _resetIdsForTests());

function forest(i) {
  return { id: `f-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}.", mana: "" };
}
function bear(i) {
  return { id: `b-${i}`, name: "Grizzly Bears", type: "Creature — Bear", oracle: "", mana: "{1}{G}", cmc: 2, keywords: [], power: 2, toughness: 2 };
}
function aggroDeck(prefix) {
  const cards = [];
  for (let i = 0; i < 25; i++) cards.push(forest(`${prefix}-${i}`));
  for (let i = 0; i < 25; i++) cards.push(bear(`${prefix}-${i}`));
  return cards;
}

describe("runSelfPlayGame (Standard 1v1)", () => {
  it("runs a real game to a terminal result with turns + a log", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const game = runSelfPlayGame({
      deckA: aggroDeck("u"),
      deckB: aggroDeck("a"),
      mode: "standard",
      meta: { seatNames: ["U", "A"] },
    });
    warn.mockRestore();
    log.mockRestore();

    // A definite terminal token — never an unexpected/ask leak at Expert.
    expect(["user-wins", "ai-wins", "draw"]).toContain(game.result);
    expect(game.turns).toBeGreaterThan(0);
    expect(Array.isArray(game.log)).toBe(true);
    expect(game.log.length).toBeGreaterThan(0); // the engine logs every real game
    expect(game.meta.seatNames).toEqual(["U", "A"]);
  });

  it("returns a setup-error (not a throw) for an empty deck", () => {
    const game = runSelfPlayGame({ deckA: [], deckB: aggroDeck("a"), mode: "standard" });
    expect(game.result).toBe("setup-error");
    expect(game.error).toBeTruthy();
    expect(game.log).toEqual([]);
  });
});

describe("runSelfPlayGame (Commander 4P)", () => {
  it("runs a real 4-player pod to a terminal result", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const game = runSelfPlayGame({
      deckA: aggroDeck("u"),
      opponentDecks: [aggroDeck("a1"), aggroDeck("a2"), aggroDeck("a3")],
      mode: "commander",
    });
    warn.mockRestore();
    log.mockRestore();
    expect(["user-wins", "ai-wins", "draw"]).toContain(game.result);
    expect(game.turns).toBeGreaterThan(0);
  });
});

describe("buildPairings", () => {
  it("commander chunks decks into pods of 4 and wraps a remainder", () => {
    // 6 decks → pod[0..3] and pod[4,5,wrap,wrap]; second pod is flagged padded.
    const pairings = buildPairings(6, "commander");
    expect(pairings.length).toBe(2);
    expect(pairings[0].seats).toEqual([0, 1, 2, 3]);
    expect(pairings[0].padded).toBe(false);
    expect(pairings[1].seats).toEqual([4, 5, 0, 1]); // wrapped to fill
    expect(pairings[1].padded).toBe(true);
  });

  it("commander with <4 decks builds one wrapped, padded pod", () => {
    const pairings = buildPairings(2, "commander");
    expect(pairings.length).toBe(1);
    expect(pairings[0].seats).toEqual([0, 1, 0, 1]);
    expect(pairings[0].padded).toBe(true);
  });

  it("standard builds every distinct head-to-head pair", () => {
    const pairings = buildPairings(3, "standard");
    expect(pairings.map((p) => p.seats)).toEqual([[0, 1], [0, 2], [1, 2]]);
  });

  it("returns no pairings for an empty deck list", () => {
    expect(buildPairings(0, "commander")).toEqual([]);
  });
});

describe("runSelfPlayBatch", () => {
  it("runs one game per commander pod and tags each with seat names", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const decks = ["A", "B", "C", "D"].map((n) => ({ id: n, name: n, cards: aggroDeck(n) }));
    const { games, pairings } = runSelfPlayBatch(decks, { mode: "commander" });
    warn.mockRestore();
    log.mockRestore();

    expect(pairings.length).toBe(1); // exactly one full pod
    expect(games.length).toBe(1);
    expect(games[0].meta.seatNames).toEqual(["A", "B", "C", "D"]);
    expect(["user-wins", "ai-wins", "draw"]).toContain(games[0].result);
  });

  it("gamesPer>1 produces that many games (no cap) — seeded shuffle makes repeats REAL", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const decks = [{ id: "u", name: "U", cards: aggroDeck("u") }, { id: "a", name: "A", cards: aggroDeck("a") }];
    const { games } = runSelfPlayBatch(decks, { mode: "standard", gamesPer: 3 });
    warn.mockRestore();
    log.mockRestore();

    expect(games.length).toBe(3); // the old cap is gone — all 3 repeats ran
    // Each game carries a DISTINCT seed (the per-game derivation, recorded on meta).
    const seeds = games.map((g) => g.meta.seed);
    expect(new Set(seeds).size).toBe(3);
    expect(seeds.every((s) => Number.isInteger(s))).toBe(true);
  });

  it("a 3-game self-play batch yields 3 DISTINCT games (different opening draws and/or game lines)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const decks = [{ id: "u", name: "U", cards: aggroDeck("u") }, { id: "a", name: "A", cards: aggroDeck("a") }];
    const { games } = runSelfPlayBatch(decks, { mode: "standard", gamesPer: 3 });
    warn.mockRestore();
    log.mockRestore();

    // Fingerprint each game by its full event log (the engine records every action). Distinct
    // shuffles ⇒ distinct draws ⇒ distinct logs. At minimum the three logs must not all match.
    const fingerprints = games.map((g) => JSON.stringify(g.log));
    expect(new Set(fingerprints).size).toBeGreaterThan(1);
  });

  it("baseSeed makes the whole batch reproducible run-to-run (same baseSeed ⇒ same games)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const decks = [{ id: "u", name: "U", cards: aggroDeck("u") }, { id: "a", name: "A", cards: aggroDeck("a") }];
    const a = runSelfPlayBatch(decks, { mode: "standard", gamesPer: 3, baseSeed: 99 });
    const b = runSelfPlayBatch(decks, { mode: "standard", gamesPer: 3, baseSeed: 99 });
    warn.mockRestore();
    log.mockRestore();

    expect(a.games.map((g) => g.meta.seed)).toEqual(b.games.map((g) => g.meta.seed));
    // Same seeds ⇒ byte-identical game lines.
    expect(a.games.map((g) => JSON.stringify(g.log))).toEqual(b.games.map((g) => JSON.stringify(g.log)));
  });
});

// ─── Learn-to-Play Track-1a: trajectory recording ──────────────────────────────

describe("outcomeLabelForSeat — the value target", () => {
  it("labels the winner 1, the loser 0, a draw/turn-limit 0.5, a non-completion null", () => {
    expect(outcomeLabelForSeat("user", "user-wins")).toBe(1);
    expect(outcomeLabelForSeat("ai", "user-wins")).toBe(0);
    expect(outcomeLabelForSeat("user", "ai-wins")).toBe(0);
    expect(outcomeLabelForSeat("ai", "ai-wins")).toBe(1);
    expect(outcomeLabelForSeat("user", "draw")).toBe(0.5);
    expect(outcomeLabelForSeat("ai1", "turn-limit")).toBe(0.5);
    expect(outcomeLabelForSeat("user", "engine-stuck")).toBeNull();
    expect(outcomeLabelForSeat("user", "setup-error")).toBeNull();
  });

  it("a 'timeout' yields NO label (null) for every seat — an honest non-result, never a fabricated W/L or 0.5", () => {
    expect(outcomeLabelForSeat("user", "timeout")).toBeNull();
    expect(outcomeLabelForSeat("ai", "timeout")).toBeNull();
    expect(outcomeLabelForSeat("ai2", "timeout")).toBeNull();
  });
});

describe("self-play time pressure (the stalemate fix)", () => {
  it("a clean decisive game carries trainingWeight 1; the option default keeps results learnable", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    // Aggro decks close decisively; with the clock on (the runner default for batches) the
    // result is a real W/L and the game is weighted 1 (learnable).
    const game = runSelfPlayGame({ deckA: aggroDeck("u"), deckB: aggroDeck("a"), mode: "standard", timePressure: true });
    warn.mockRestore();
    log.mockRestore();
    expect(["user-wins", "ai-wins", "draw"]).toContain(game.result);
    expect(game.trainingWeight).toBe(1);
  });

  it("a stalling game resolves DECISIVELY with the clock on (W/L), and as a draw with it off", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    // A pure-land pairing can never deal damage → a guaranteed stall.
    const land = (p) => { const c = []; for (let i = 0; i < 60; i++) c.push(forest(`${p}-${i}`)); return c; };
    const off = runSelfPlayGame({ deckA: land("u"), deckB: land("a"), mode: "standard", seed: 3 }); // default OFF
    const on = runSelfPlayGame({ deckA: land("u"), deckB: land("a"), mode: "standard", seed: 3, timePressure: true });
    warn.mockRestore();
    log.mockRestore();
    // OFF: an honest draw (0.5 label) at the cap.
    expect(off.result).toBe("draw");
    expect(off.trainingWeight).toBe(1); // a real draw IS a learnable 0.5 outcome
    // ON: a decisive W/L (a clean win/loss training label), resolved before the hard cap.
    expect(["user-wins", "ai-wins"]).toContain(on.result);
    expect(on.trainingWeight).toBe(1);
    expect(on.turns).toBeLessThan(100);
  });

  it("a timeout (clock on, still hits the cap) is reported honestly with trainingWeight 0", () => {
    // Drive the timeout branch by importing the session helpers directly — the runner maps
    // the engine's `timeout` status to a `timeout` result with weight 0 (excluded from training).
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    // We can't easily force a real engine timeout here without a contrived deck, so assert the
    // mapping contract via outcomeLabelForSeat (null) + the weight rule the runner applies:
    // any non-clean result (timeout / error) ⇒ weight 0. The engine-side timeout path itself
    // is covered in termination.test.js.
    const setupErr = runSelfPlayGame({ deckA: [], deckB: aggroDeck("a"), mode: "standard" });
    warn.mockRestore();
    log.mockRestore();
    expect(setupErr.trainingWeight).toBe(0);
    expect(outcomeLabelForSeat("user", "timeout")).toBeNull();
  });
});

describe("runSelfPlayGame with recordTrajectory", () => {
  it("OFF by default: result is byte-identical and carries NO trajectory field", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const plain = runSelfPlayGame({ deckA: aggroDeck("u"), deckB: aggroDeck("a"), mode: "standard" });
    warn.mockRestore();
    log.mockRestore();
    expect(plain.trajectory).toBeUndefined();
    expect(["user-wins", "ai-wins", "draw"]).toContain(plain.result);
  });

  it("ON: emits per-turn, per-seat feature rows labeled with each seat's eventual outcome", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const game = runSelfPlayGame({
      deckA: aggroDeck("u"),
      deckB: aggroDeck("a"),
      mode: "standard",
      recordTrajectory: true,
    });
    warn.mockRestore();
    log.mockRestore();

    expect(["user-wins", "ai-wins", "draw"]).toContain(game.result);
    expect(game.trajectory).toBeTruthy();
    expect(game.trajectory.mode).toBe("standard");

    // One entry per seat (Standard = user + ai), each with rows + an outcome label.
    const seats = game.trajectory.seats;
    expect(seats.map((s) => s.seat).sort()).toEqual(["ai", "user"]);

    for (const s of seats) {
      expect(s.rows.length).toBeGreaterThan(0); // captured at least the opening turn
      // The outcome is a REAL value target tied to the real result.
      expect([0, 0.5, 1, null]).toContain(s.outcome);
      // Turns are positive integers; the first row is an early turn.
      expect(s.rows[0].turn).toBeGreaterThan(0);
      // Each row is a full feature object.
      const f = s.rows[0].features;
      for (const k of FEATURE_KEYS) expect(Number.isFinite(f[k])).toBe(true);
    }

    // A decisive game labels the two seats oppositely (1 vs 0); the labels are consistent
    // with the result token (no fabricated win).
    if (game.result === "user-wins") {
      expect(seats.find((s) => s.seat === "user").outcome).toBe(1);
      expect(seats.find((s) => s.seat === "ai").outcome).toBe(0);
    } else if (game.result === "ai-wins") {
      expect(seats.find((s) => s.seat === "user").outcome).toBe(0);
      expect(seats.find((s) => s.seat === "ai").outcome).toBe(1);
    } else {
      expect(seats.every((s) => s.outcome === 0.5)).toBe(true);
    }

    // is_active_player must be set on SOME row for each seat (each takes turns).
    expect(seats.find((s) => s.seat === "user").rows.some((r) => r.features.is_active_player === 1)).toBe(true);
  });
});

describe("runSelfPlayBatch with record + the JSONL writer", () => {
  it("flattens trajectories to one JSONL line per (game, seat, turn) and writes atomically", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const decks = ["A", "B"].map((n) => ({ id: n, name: n, cards: aggroDeck(n) }));
    const batch = runSelfPlayBatch(decks, { mode: "standard", record: true });
    warn.mockRestore();
    log.mockRestore();

    expect(batch.games.length).toBe(1);
    expect(batch.games[0].trajectory.deckIds).toEqual(["A", "B"]);

    const jsonl = trajectoriesToJsonl(batch);
    const lines = jsonl.trim().split("\n");
    expect(lines.length).toBeGreaterThan(0);

    // Every line is valid JSON with the expected training-pair shape.
    const sample = JSON.parse(lines[0]);
    expect(sample).toHaveProperty("seat");
    expect(sample).toHaveProperty("turn");
    expect(sample).toHaveProperty("outcome");
    expect(sample).toHaveProperty("deckId");
    expect(sample).toHaveProperty("features");
    expect(["A", "B"]).toContain(sample.deckId);
    expect(Number.isFinite(sample.features.own_life)).toBe(true);

    // The writer drops to disk (inject a tmp dir so paths.js isn't needed).
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "traj-test-"));
    const outPath = await writeTrajectoriesJsonl(batch, { dir: tmpDir, fileName: "t.jsonl" });
    expect(outPath).toBe(path.join(tmpDir, "t.jsonl"));
    const written = await fs.readFile(outPath, "utf8");
    expect(written.trim().split("\n").length).toBe(lines.length);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("writes nothing (returns null) when there are no recorded trajectories", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "traj-empty-"));
    const out = await writeTrajectoriesJsonl({ games: [] }, { dir: tmpDir });
    expect(out).toBeNull();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

// ─── STARTING-PLAYER ALTERNATION (de-bias self-play seating) ────────────────────
//
// The on-the-play seat had been pinned to "user", so a mirror always handed that seat
// the position edge ⇒ seat-position-biased training data. These cover: the seat picker
// is deterministic + round-robin (balanced); the default single game stays byte-identical
// (user on the play); a non-default starting seat correctly takes the CR 103.7a first-turn
// draw-skip; the result records the on-the-play seat; and a batch is balanced + reproducible.

describe("startSeatForGame / engineSeatsForMode — deterministic round-robin seat picker", () => {
  it("lists the engine seats for each mode in turn order", () => {
    expect(engineSeatsForMode("standard")).toEqual(["user", "ai"]);
    expect(engineSeatsForMode("commander")).toEqual(["user", "ai1", "ai2", "ai3"]);
  });

  it("game 0 always leads with 'user' (matches the historical first-game seating)", () => {
    expect(startSeatForGame("standard", 0)).toBe("user");
    expect(startSeatForGame("commander", 0)).toBe("user");
  });

  it("round-robins over the mode's seats, wrapping", () => {
    expect([0, 1, 2, 3, 4].map((i) => startSeatForGame("standard", i)))
      .toEqual(["user", "ai", "user", "ai", "user"]);
    expect([0, 1, 2, 3, 4, 5].map((i) => startSeatForGame("commander", i)))
      .toEqual(["user", "ai1", "ai2", "ai3", "user", "ai1"]);
  });

  it("is deterministic — a given (mode, index) always yields the same seat", () => {
    for (const i of [0, 1, 7, 13, 100]) {
      expect(startSeatForGame("commander", i)).toBe(startSeatForGame("commander", i));
    }
  });
});

describe("runSelfPlayGame startSeat (CR 103.7a — who is on the play)", () => {
  it("defaults to 'user' on the play and is BYTE-IDENTICAL to an explicit startSeat:'user'", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    // Same seed ⇒ deterministic; default (no startSeat) vs explicit "user" must match exactly.
    const dflt = runSelfPlayGame({ deckA: aggroDeck("u"), deckB: aggroDeck("a"), mode: "standard", seed: 42 });
    const explicitUser = runSelfPlayGame({ deckA: aggroDeck("u"), deckB: aggroDeck("a"), mode: "standard", seed: 42, startSeat: "user" });
    warn.mockRestore();
    log.mockRestore();

    expect(dflt.onThePlay).toBe("user");
    expect(explicitUser.onThePlay).toBe("user");
    // Full game line byte-identical (the opt-in path with the default seat == pre-slice path).
    expect(JSON.stringify(dflt.log)).toBe(JSON.stringify(explicitUser.log));
    expect(dflt.result).toBe(explicitUser.result);
    // game-start stamps user; user's turn-1 draw is the one skipped.
    expect(dflt.log.find((e) => e.kind === "game-start").startingPlayer).toBe("user");
    const firstDraw = dflt.log.find((e) => e.kind === "step" && e.step === "draw");
    expect(firstDraw.player).toBe("user");
    expect(firstDraw.skipped).toBe("first-turn-draw");
  });

  it("a non-default starting seat takes the first-turn draw-skip (the skip FOLLOWS the seat)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const aiFirst = runSelfPlayGame({ deckA: aggroDeck("u"), deckB: aggroDeck("a"), mode: "standard", seed: 42, startSeat: "ai" });
    warn.mockRestore();
    log.mockRestore();

    expect(aiFirst.onThePlay).toBe("ai");
    // game-start stamps the chosen seat as startingPlayer.
    expect(aiFirst.log.find((e) => e.kind === "game-start").startingPlayer).toBe("ai");
    // The FIRST draw step is the skip, and it's AI's draw that's skipped (not user's).
    const firstDraw = aiFirst.log.find((e) => e.kind === "step" && e.step === "draw");
    expect(firstDraw.player).toBe("ai");
    expect(firstDraw.skipped).toBe("first-turn-draw");
    // It still reaches a real terminal result (rotation wraps from the non-default seat).
    expect(["user-wins", "ai-wins", "draw"]).toContain(aiFirst.result);
  });

  it("records onThePlay even on a setup-error (null — the game never started)", () => {
    const game = runSelfPlayGame({ deckA: [], deckB: aggroDeck("a"), mode: "standard", startSeat: "ai" });
    expect(game.result).toBe("setup-error");
    expect(game.onThePlay).toBeNull();
  });

  it("commander: a non-default pod seat (ai2) is on the play and skips its first draw", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const game = runSelfPlayGame({
      deckA: aggroDeck("u"),
      opponentDecks: [aggroDeck("a1"), aggroDeck("a2"), aggroDeck("a3")],
      mode: "commander",
      seed: 9,
      startSeat: "ai2",
    });
    warn.mockRestore();
    log.mockRestore();
    expect(game.onThePlay).toBe("ai2");
    const firstDraw = game.log.find((e) => e.kind === "step" && e.step === "draw");
    expect(firstDraw.player).toBe("ai2");
    expect(firstDraw.skipped).toBe("first-turn-draw");
  });
});

describe("runSelfPlayBatch alternateStart — balanced, deterministic seating", () => {
  function decksN(names) {
    return names.map((n) => ({ id: n, name: n, cards: aggroDeck(n), commanders: [] }));
  }

  it("ON by default: a standard batch is BALANCED across seats (≈ half each) and records the seat", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    // 4 decks ⇒ 6 pairings; gamesPer 4 ⇒ 24 games. Round-robin ⇒ exactly 12 user / 12 ai.
    const batch = runSelfPlayBatch(decksN(["A", "B", "C", "D"]), { mode: "standard", gamesPer: 4, baseSeed: 7 });
    warn.mockRestore();
    log.mockRestore();

    const counts = {};
    for (const g of batch.games) counts[g.onThePlay] = (counts[g.onThePlay] || 0) + 1;
    expect(batch.games.length).toBe(24);
    expect(counts).toEqual({ user: 12, ai: 12 }); // perfectly balanced
    // meta.startSeat is recorded and matches the result's onThePlay for every game.
    expect(batch.games.every((g) => g.meta.startSeat === g.onThePlay)).toBe(true);
    // Game 0 still leads with user (historical seating preserved as the batch anchor).
    expect(batch.games[0].onThePlay).toBe("user");
  });

  it("ON by default: a commander batch is balanced across all four pod seats", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    // 8 decks ⇒ 2 pods; gamesPer 4 ⇒ 8 games. Round-robin over 4 seats ⇒ 2 each.
    const batch = runSelfPlayBatch(decksN(["A", "B", "C", "D", "E", "F", "G", "H"]), { mode: "commander", gamesPer: 4, baseSeed: 3 });
    warn.mockRestore();
    log.mockRestore();

    const counts = {};
    for (const g of batch.games) counts[g.onThePlay] = (counts[g.onThePlay] || 0) + 1;
    expect(batch.games.length).toBe(8);
    expect(counts).toEqual({ user: 2, ai1: 2, ai2: 2, ai3: 2 });
  });

  it("seating is DETERMINISTIC per baseSeed (same baseSeed ⇒ same on-the-play sequence)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const decks = decksN(["A", "B", "C", "D"]);
    const a = runSelfPlayBatch(decks, { mode: "standard", gamesPer: 4, baseSeed: 7 });
    const b = runSelfPlayBatch(decks, { mode: "standard", gamesPer: 4, baseSeed: 7 });
    warn.mockRestore();
    log.mockRestore();
    expect(a.games.map((g) => g.onThePlay)).toEqual(b.games.map((g) => g.onThePlay));
  });

  it("alternateStart:false pins every game to user-on-the-play (the pre-slice batch path)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const batch = runSelfPlayBatch(decksN(["A", "B"]), { mode: "standard", gamesPer: 3, baseSeed: 7, alternateStart: false });
    warn.mockRestore();
    log.mockRestore();
    expect(batch.games.every((g) => g.onThePlay === "user")).toBe(true);
    expect(batch.games.every((g) => g.meta.startSeat === null)).toBe(true);
  });

  it("the recorded onThePlay is independent of WHO won (result names the winning deck/seat, onThePlay the position)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const batch = runSelfPlayBatch(decksN(["A", "B"]), { mode: "standard", gamesPer: 4, baseSeed: 11 });
    warn.mockRestore();
    log.mockRestore();
    // Every game records a concrete on-the-play seat from the mode's seat set, regardless of result.
    for (const g of batch.games) {
      expect(["user", "ai"]).toContain(g.onThePlay);
      expect(["user-wins", "ai-wins", "draw", "timeout"]).toContain(g.result);
    }
  });
});
