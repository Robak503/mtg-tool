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
  outcomeLabelForSeatV2,
  trajectoriesToJsonl,
  writeTrajectoriesJsonl,
  startSeatForGame,
  engineSeatsForMode,
  winnerDeckName,
  resolveBaseSeed,
  permutedDeckIndices,
  dedupeSeatDecks,
  wilsonInterval,
  summarizeSeatOutcomes,
} from "./selfPlayRunner.js";
import { FEATURE_KEYS } from "./gameFeatures.js";

// HEAVY-RUNNER FILE (flake root-cause pass, 2026-07-17): several tests here drive FULL
// Expert games to termination — the balanced-seating test alone runs 24 games, its
// commander sibling 8 four-seat pod games. In isolation the file finishes in seconds,
// but the suite runs ~770 files in parallel forks, and under MULTI-SUITE contention
// (agent worktrees running their own gates concurrently on the same box) a 24-game
// test has been observed past the global 20s ceiling — the exact spurious-timeout
// class vitest.config.js documents for rules-retrieval ("passes in isolation and on
// a full-suite rerun"). 90s is margin, not a mask: a genuinely hung run is still
// killed by scripts/test-with-timeout.cjs's 5-minute wall-clock guard, and the
// engine-determinism invariant itself is pinned load-independently in
// selfPlaySeatingDeterminism.test.js.
vi.setConfig({ testTimeout: 90_000 });

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

// ROUTER-BAG CONTRACT (the destructuring-class fix, instance #4): resolveDecideAction hands the
// self-play `routedDecide` router a bag { state, legalActions, seat, pilot, features, previewFeatures };
// the router must forward the WHOLE bag to the seat's pilot, never destructure-and-rebuild. This is the
// sentinel test Omnath asked for — it would have caught all four historical instances (loadPilotBuilder
// flags-drop, repro-seed drop, the gameApi router, and this self-play one) before each cost a bench.
describe("routedDecide forwards the whole decide bag (no key dropped at the router hop)", () => {
  it("a pilot driven through the self-play path receives features + previewFeatures", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    let sawFeatures = false;
    let sawPreviewFn = false;
    let previewWorks = false;
    const pilot = {
      decide: (bag) => {
        if (bag.features && typeof bag.features === "object") sawFeatures = true;
        if (typeof bag.previewFeatures === "function") {
          sawPreviewFn = true;
          // The lookahead closure must actually produce a feature vector (or null, never throw).
          const pv = bag.previewFeatures(bag.legalActions?.[0]);
          if (pv === null || (pv && typeof pv === "object")) previewWorks = true;
        }
        return bag.legalActions?.[0]; // take the first legal action (keeps the game moving)
      },
    };
    const game = runSelfPlayGame({
      deckA: aggroDeck("u"),
      deckB: aggroDeck("a"),
      mode: "standard",
      pilots: { user: pilot },
    });
    warn.mockRestore();
    log.mockRestore();
    expect(["user-wins", "ai-wins", "draw"]).toContain(game.result);
    expect(sawFeatures).toBe(true);      // features survived the router hop (was dropped pre-fix)
    expect(sawPreviewFn).toBe(true);     // previewFeatures survived too
    expect(previewWorks).toBe(true);     // and it's a working closure, not just present
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

  it("commander: a non-default pod seat (ai2) is on the play and DRAWS on turn 1 (CR 103.8c — multiplayer doesn't skip)", () => {
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
    // Only TWO-player games skip the first draw (CR 103.8a); the 4-seat pod's starting player draws.
    expect(firstDraw.skipped).toBeUndefined();
  });

  it("exposes winnerSeat + winnerName at the top level, consistent with decisionTrajectory (Omnath FYI #1)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const game = runSelfPlayGame({ deckA: aggroDeck("u"), deckB: aggroDeck("a"), mode: "standard", seed: 7, timePressure: true, recordDecisions: true, meta: { seatNames: ["User Deck", "AI Deck"] } });
    warn.mockRestore();
    log.mockRestore();
    // winnerSeat is now a first-class field on the result (was absent → surfaced as "(none)").
    expect("winnerSeat" in game).toBe(true);
    // …and never drifts from the decisionTrajectory summary (single source).
    expect(game.winnerSeat).toBe(game.decisionTrajectory.winnerSeat);
    // a decisive result names a seat AND resolves that seat to its deck name; a draw/timeout is null.
    if (game.result === "user-wins" || game.result === "ai-wins") {
      expect(game.winnerSeat).not.toBeNull();
      expect(game.winnerName).toBe(["User Deck", "AI Deck"][["user", "ai"].indexOf(game.winnerSeat)]);
    } else {
      expect(game.winnerSeat).toBeNull();
      expect(game.winnerName).toBeNull();
    }
  });

  it("winnerDeckName maps a seat id → the deck at that seat (regression: the seatNames[winnerSeat] string-index bug)", () => {
    const pod = ["Sliver Hivelord", "Vihaan", "Koma", "Zaxara, the Exemplary"];
    // Every commander seat resolves to the deck sitting there — the old array[string] returned undefined.
    expect(winnerDeckName("commander", pod, "user")).toBe("Sliver Hivelord");
    expect(winnerDeckName("commander", pod, "ai1")).toBe("Vihaan");
    expect(winnerDeckName("commander", pod, "ai2")).toBe("Koma");
    expect(winnerDeckName("commander", pod, "ai3")).toBe("Zaxara, the Exemplary");
    // Standard's two seats, plus the honest-null cases (no winner / unknown seat / no names).
    expect(winnerDeckName("standard", ["A", "B"], "ai")).toBe("B");
    expect(winnerDeckName("standard", ["A", "B"], null)).toBeNull();
    expect(winnerDeckName("commander", pod, "ai9")).toBeNull();
    expect(winnerDeckName("commander", null, "user")).toBeNull();
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

// ─── LANE A4 — RUNNER DATA QUALITY ──────────────────────────────────────────────

function quiet(fn) {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    return fn();
  } finally {
    warn.mockRestore();
    log.mockRestore();
  }
}

describe("outcomeLabelForSeatV2 — per-seat FATE labels (HB-3)", () => {
  // Minimal terminal-state fixtures: only the fields the labeler reads
  // (players[id] presence, life/poison/commanderDamageFrom/lostGame via isPlayerDead, wonGame).
  const alive = (life = 20) => ({ life });
  const dead = () => ({ life: 0 });

  it("Commander wonGame (CR 104.2a) winner: ONLY the winner is 1, every other pod seat 0", () => {
    const state = { players: { user: alive(), ai1: alive(3), ai2: { life: 10, wonGame: true }, ai3: alive(5) } };
    const label = (seat) => outcomeLabelForSeatV2({ seat, result: "ai-wins", winnerSeat: "ai2", state });
    expect(label("user")).toBe(0);
    expect(label("ai1")).toBe(0);
    expect(label("ai2")).toBe(1);
    expect(label("ai3")).toBe(0);
    // THE HB-3 bug this fixes: the old blanket labeler crowned the two losers too.
    expect(outcomeLabelForSeat("ai1", "ai-wins")).toBe(1); // (the deprecated behavior, pinned for contrast)
  });

  it("Commander user-death with 3 LIVE opponents: user 0, survivors null (undetermined — never crown liveOpponents[0])", () => {
    const state = { players: { user: dead(), ai1: alive(), ai2: alive(), ai3: alive() } };
    // gameStatus would report winnerSeat = "ai1" (arbitrary turn-order-first survivor).
    const label = (seat) => outcomeLabelForSeatV2({ seat, result: "ai-wins", winnerSeat: "ai1", state });
    expect(label("user")).toBe(0);
    expect(label("ai1")).toBeNull();
    expect(label("ai2")).toBeNull();
    expect(label("ai3")).toBeNull();
  });

  it("Commander user-death with a SOLE survivor (others eliminated/removed): survivor 1, all others 0", () => {
    // ai1 was removed from the game entirely (CR 800.4a), ai2 is dead-in-state, ai3 survives.
    const state = { players: { user: dead(), ai2: dead(), ai3: alive(12) } };
    const label = (seat) => outcomeLabelForSeatV2({ seat, result: "ai-wins", winnerSeat: "ai3", state });
    expect(label("ai3")).toBe(1);
    expect(label("user")).toBe(0);
    expect(label("ai1")).toBe(0); // removed seat → eliminated → a proven loss
    expect(label("ai2")).toBe(0);
  });

  it("Standard is unchanged by construction (exactly one opponent ⇒ always a TRUE winner)", () => {
    const aiWon = { players: { user: dead(), ai: alive() } };
    expect(outcomeLabelForSeatV2({ seat: "ai", result: "ai-wins", winnerSeat: "ai", state: aiWon })).toBe(1);
    expect(outcomeLabelForSeatV2({ seat: "user", result: "ai-wins", winnerSeat: "ai", state: aiWon })).toBe(0);
    const userWon = { players: { user: alive(), ai: dead() } };
    expect(outcomeLabelForSeatV2({ seat: "user", result: "user-wins", winnerSeat: "user", state: userWon })).toBe(1);
    expect(outcomeLabelForSeatV2({ seat: "ai", result: "user-wins", winnerSeat: "user", state: userWon })).toBe(0);
  });

  it("draw/turn-limit → 0.5 for every seat; timeout/stuck/error → null for every seat", () => {
    const state = { players: { user: alive(), ai1: alive(), ai2: alive(), ai3: alive() } };
    for (const seat of ["user", "ai1", "ai2", "ai3"]) {
      expect(outcomeLabelForSeatV2({ seat, result: "draw", winnerSeat: null, state })).toBe(0.5);
      expect(outcomeLabelForSeatV2({ seat, result: "turn-limit", winnerSeat: null, state })).toBe(0.5);
      expect(outcomeLabelForSeatV2({ seat, result: "timeout", winnerSeat: null, state })).toBeNull();
      expect(outcomeLabelForSeatV2({ seat, result: "engine-stuck", winnerSeat: null, state })).toBeNull();
      expect(outcomeLabelForSeatV2({ seat, result: "dispatch-error", winnerSeat: null, state })).toBeNull();
    }
  });

  it("a recorded pod game's labels are FATE-sane: at most one 1, user-wins labels exactly [1, 0, 0, 0]", () => {
    const game = quiet(() => runSelfPlayGame({
      deckA: aggroDeck("u"),
      opponentDecks: [aggroDeck("a1"), aggroDeck("a2"), aggroDeck("a3")],
      mode: "commander",
      seed: 21,
      timePressure: true,
      recordTrajectory: true,
    }));
    expect(game.trajectory).toBeTruthy();
    const winners = game.trajectory.seats.filter((s) => s.outcome === 1);
    expect(winners.length).toBeLessThanOrEqual(1); // NEVER the 3-winners-per-pod corruption
    if (game.result === "user-wins") {
      expect(game.trajectory.seats.find((s) => s.seat === "user").outcome).toBe(1);
      for (const s of game.trajectory.seats) if (s.seat !== "user") expect(s.outcome).toBe(0);
    }
    if (game.result === "ai-wins") {
      expect(game.trajectory.seats.find((s) => s.seat === "user").outcome).toBe(0);
      // A 1 (if any) must be the reported winnerSeat; other opponents are 0 (proven) or null (undetermined).
      for (const s of winners) expect(s.seat).toBe(game.winnerSeat);
    }
  });
});

describe("resolveBaseSeed — seed discipline (HB-4)", () => {
  it("defaults to the historical deterministic 1 (null/empty/garbage)", () => {
    expect(resolveBaseSeed(null)).toBe(1);
    expect(resolveBaseSeed(undefined)).toBe(1);
    expect(resolveBaseSeed("")).toBe(1);
    expect(resolveBaseSeed("not-a-number")).toBe(1);
  });

  it("normalizes numbers exactly like the runner (>>>0), so the echoed seed is the effective one", () => {
    expect(resolveBaseSeed(42)).toBe(42);
    expect(resolveBaseSeed("42")).toBe(42);
    expect(resolveBaseSeed(-1)).toBe(4294967295);
  });

  it("auto mode uses the injected nonce (deterministic in tests, never Date-based) or a crypto uint32", () => {
    expect(resolveBaseSeed("auto", { nonce: 123 })).toBe(123);
    expect(resolveBaseSeed("auto", { nonce: 123 })).toBe(123); // counter/nonce path is pure
    const minted = resolveBaseSeed("auto");
    expect(Number.isInteger(minted)).toBe(true);
    expect(minted).toBeGreaterThanOrEqual(0);
    expect(minted).toBeLessThanOrEqual(0xffffffff);
  });

  it("the per-game seed rides the recorded trajectory + JSONL rows (banked duplicates are detectable)", () => {
    const decks = ["A", "B"].map((n) => ({ id: n, name: n, cards: aggroDeck(n) }));
    const batch = quiet(() => runSelfPlayBatch(decks, { mode: "standard", record: true, baseSeed: 77 }));
    const g = batch.games[0];
    expect(g.trajectory.seed).toBe(g.meta.seed);
    const lines = trajectoriesToJsonl(batch).trim().split("\n");
    for (const line of lines) expect(JSON.parse(line).seed).toBe(g.meta.seed);
  });
});

describe("runSelfPlayBatch rotateSeats — deck↔seat de-confounding (HB-5)", () => {
  const decksN = (names) => names.map((n) => ({ id: n, name: n, cards: aggroDeck(n) }));

  it("OFF (default): meta carries NO seatRotation key and seating never rotates (legacy byte-identical)", () => {
    const batch = quiet(() => runSelfPlayBatch(decksN(["U", "A"]), { mode: "standard", gamesPer: 2, baseSeed: 5 }));
    for (const g of batch.games) {
      expect("seatRotation" in g.meta).toBe(false);
      expect(g.meta.seatNames).toEqual(["U", "A"]);
    }
  });

  it("ON: rotation advances once per seatCount games (slower than startSeat — the anti-aliasing axis split)", () => {
    const batch = quiet(() => runSelfPlayBatch(decksN(["U", "A"]), { mode: "standard", gamesPer: 4, baseSeed: 5, rotateSeats: true }));
    expect(batch.games.map((g) => g.meta.seatRotation)).toEqual([0, 0, 1, 1]);
    expect(batch.games[0].meta.seatNames).toEqual(["U", "A"]); // game 0 byte-identical to unrotated
    expect(batch.games[1].meta.seatNames).toEqual(["U", "A"]);
    expect(batch.games[2].meta.seatNames).toEqual(["A", "U"]); // the decks swapped seats
    expect(batch.games[3].meta.seatNames).toEqual(["A", "U"]);
    // startSeat still rides the RAW game counter (round-robin per game, unchanged).
    expect(batch.games.map((g) => g.meta.startSeat)).toEqual(["user", "ai", "user", "ai"]);
  });

  it("DEGENERATE-CASE PIN: a single pod at gamesPer=3 rotates ZERO times — visible as seatRotation:0, not mistaken for rotation", () => {
    const batch = quiet(() => runSelfPlayBatch(decksN(["A", "B", "C", "D"]), { mode: "commander", gamesPer: 3, baseSeed: 9, rotateSeats: true }));
    expect(batch.games.length).toBe(3);
    for (const g of batch.games) {
      expect(g.meta.seatRotation).toBe(0); // floor(idx/4)%4 = 0 for idx 0..2 — a documented no-op
      expect(g.meta.seatNames).toEqual(["A", "B", "C", "D"]);
    }
  });

  it("rotation is deterministic per baseSeed and the trajectory attribution follows the rotated seating", () => {
    const decks = decksN(["U", "A"]);
    const a = quiet(() => runSelfPlayBatch(decks, { mode: "standard", gamesPer: 4, baseSeed: 13, rotateSeats: true, record: true }));
    const b = quiet(() => runSelfPlayBatch(decks, { mode: "standard", gamesPer: 4, baseSeed: 13, rotateSeats: true, record: true }));
    expect(a.games.map((g) => g.meta.seatNames)).toEqual(b.games.map((g) => g.meta.seatNames));
    // deckIds on the recorded trajectory are the PER-GAME rotated assignment (attribution can't drift).
    expect(a.games[2].trajectory.deckIds).toEqual(["A", "U"]);
    expect(a.games[0].trajectory.deckIds).toEqual(["U", "A"]);
  });
});

describe("runSelfPlayBatch podShuffle — cross-chunk pod sampling (HB-6)", () => {
  const decksN = (names) => names.map((n) => ({ id: n, name: n, cards: aggroDeck(n) }));

  it("permutedDeckIndices is a deterministic permutation (pure per (n, seed))", () => {
    const p1 = permutedDeckIndices(8, 12345);
    const p2 = permutedDeckIndices(8, 12345);
    expect(p1).toEqual(p2);
    expect([...p1].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(permutedDeckIndices(8, 54321)).not.toEqual(p1); // a different seed re-deals
  });

  it("OFF (default): legacy pairing-major order, no podCycle/podPermutation keys", () => {
    const batch = quiet(() => runSelfPlayBatch(decksN(["A", "B", "C", "D", "E", "F", "G", "H"]), { mode: "commander", gamesPer: 2, baseSeed: 3 }));
    expect(batch.games.length).toBe(4); // 2 pods × 2 repeats, pairing-major
    expect(batch.games[0].meta.seatNames).toEqual(["A", "B", "C", "D"]);
    expect(batch.games[1].meta.seatNames).toEqual(["A", "B", "C", "D"]); // repeats stay grouped per pod
    expect(batch.games[2].meta.seatNames).toEqual(["E", "F", "G", "H"]);
    for (const g of batch.games) expect("podCycle" in g.meta).toBe(false);
  });

  it("ON: each cycle re-deals pod composition (cross-chunk matchups sampled), deterministically per baseSeed", () => {
    const names = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const run = () => quiet(() => runSelfPlayBatch(decksN(names), { mode: "commander", gamesPer: 4, baseSeed: 3, podShuffle: true }));
    const batch = run();
    expect(batch.games.length).toBe(8); // 4 cycles × 2 pods — same total as repeats
    // Every game is stamped with its cycle + the cycle's full permutation (attribution).
    for (const g of batch.games) {
      expect(g.meta.podCycle).toBeGreaterThanOrEqual(0);
      expect(typeof g.meta.podPermutation).toBe("string");
    }
    // Deck A meets MULTIPLE distinct pod compositions across cycles (the fixed-chunk gap closed).
    const podsWithA = new Set(
      batch.games
        .filter((g) => g.meta.seatNames.includes("A"))
        .map((g) => [...g.meta.seatNames].sort().join("|"))
    );
    expect(podsWithA.size).toBeGreaterThanOrEqual(3);
    // Fully seed-derived: an identical rerun deals the identical compositions.
    const again = run();
    expect(again.games.map((g) => g.meta.seatNames)).toEqual(batch.games.map((g) => g.meta.seatNames));
  });
});

describe("dedupeSeatDecks — padded-mirror shared-card-id de-aliasing (watch item)", () => {
  it("passes distinct decks through UNTOUCHED (identity — the non-padded path is byte-identical)", () => {
    const a = { id: "a", name: "A", cards: aggroDeck("a"), commanders: [], companion: null };
    const b = { id: "b", name: "B", cards: aggroDeck("b"), commanders: [], companion: null };
    const out = dedupeSeatDecks([a, b]);
    expect(out[0]).toBe(a);
    expect(out[1]).toBe(b);
  });

  it("suffixes the 2nd+ occurrence of the SAME deck object so cross-seat card ids are disjoint", () => {
    const cmd = { id: "cmd-x", name: "Cmdr", type: "Legendary Creature" };
    const a = { id: "a", name: "A", cards: aggroDeck("a"), commanders: [cmd], companion: { id: "comp-x", name: "Comp" } };
    const out = dedupeSeatDecks([a, a, a]);
    expect(out[0]).toBe(a); // first occurrence untouched
    expect(out[1]).not.toBe(a);
    expect(out[1].cards[0].id).toBe(`${a.cards[0].id}~s1`);
    expect(out[2].cards[0].id).toBe(`${a.cards[0].id}~s2`);
    expect(out[1].commanders[0].id).toBe("cmd-x~s1");
    expect(out[1].companion.id).toBe("comp-x~s1");
    // Non-id fields survive the clone.
    expect(out[1].cards[0].name).toBe(a.cards[0].name);
    // All three seats' id sets are pairwise disjoint.
    const ids = out.map((d) => new Set(d.cards.map((c) => c.id)));
    expect([...ids[0]].filter((id) => ids[1].has(id) || ids[2].has(id))).toEqual([]);
    expect([...ids[1]].filter((id) => ids[2].has(id))).toEqual([]);
  });

  it("GUARD: a padded 2-deck commander pod seats DISJOINT card ids (no cross-seat aliasing in the live state)", () => {
    const decks = [
      { id: "a", name: "A", cards: aggroDeck("a") },
      { id: "b", name: "B", cards: aggroDeck("b") },
    ];
    let captured = null;
    const pilots = {
      user: {
        decide: ({ state }) => {
          if (!captured) captured = state;
          return undefined; // fall through to the default autopilot pick
        },
      },
    };
    const batch = quiet(() => runSelfPlayBatch(decks, { mode: "commander", baseSeed: 2, pilots }));
    expect(batch.pairings[0].padded).toBe(true); // [0,1,0,1] — decks A and B each seat twice
    expect(batch.games[0].result).not.toBe("setup-error");
    expect(captured).toBeTruthy();
    const seats = Object.keys(captured.players);
    const idsOf = (seat) => {
      const p = captured.players[seat];
      return new Set([...(p.library || []), ...(p.hand || [])].map((c) => c.id));
    };
    for (let i = 0; i < seats.length; i++) {
      for (let j = i + 1; j < seats.length; j++) {
        const a = idsOf(seats[i]);
        const overlap = [...idsOf(seats[j])].filter((id) => a.has(id));
        expect(overlap).toEqual([]); // shared deck ⇒ previously IDENTICAL ids across seats
      }
    }
  });
});

describe("runSelfPlayBatch mulligan default (AI-F9)", () => {
  const noLandDeck = (p) => {
    const cards = [];
    for (let i = 0; i < 50; i++) cards.push(bear(`${p}-${i}`));
    return cards;
  };

  it("ON by default: an unkeepable dealt hand (0 lands) is SHIPPED — twice, then the forced floor keep", () => {
    const decks = [
      { id: "u", name: "U", cards: noLandDeck("u") },
      { id: "a", name: "A", cards: aggroDeck("a") },
    ];
    const batch = quiet(() => runSelfPlayBatch(decks, { mode: "standard", baseSeed: 4 }));
    const g = batch.games[0];
    // The 0-land seat ships exactly twice (decideMulliganForAI's ≤2-ship floor), then keeps.
    const ships = g.log.filter((e) => e.kind === "mulligan-ship" && e.player === "user");
    expect(ships.length).toBe(2);
    const keep = g.log.find((e) => e.kind === "mulligan-keep" && e.player === "user");
    expect(keep).toBeTruthy();
    expect(keep.mulligans).toBe(2);
  });

  it("mulligan:false recovers the pre-slice keep-every-7 batch (no mulligan events at all)", () => {
    const decks = [
      { id: "u", name: "U", cards: noLandDeck("u") },
      { id: "a", name: "A", cards: aggroDeck("a") },
    ];
    const batch = quiet(() => runSelfPlayBatch(decks, { mode: "standard", baseSeed: 4, mulligan: false }));
    const g = batch.games[0];
    expect(g.log.some((e) => e.kind === "mulligan-ship" || e.kind === "mulligan-keep")).toBe(false);
  });

  it("a pilot's own decideMulligan still takes precedence over the batch default", () => {
    const decks = [
      { id: "u", name: "U", cards: noLandDeck("u") },
      { id: "a", name: "A", cards: aggroDeck("a") },
    ];
    const pilots = { user: { decideMulligan: () => ({ kind: "mulligan-keep" }) } };
    const batch = quiet(() => runSelfPlayBatch(decks, { mode: "standard", baseSeed: 4, pilots }));
    const g = batch.games[0];
    // The pilot kept its (terrible) 7 — the AI default did NOT override it.
    expect(g.log.filter((e) => e.kind === "mulligan-ship" && e.player === "user")).toEqual([]);
    const keep = g.log.find((e) => e.kind === "mulligan-keep" && e.player === "user");
    expect(keep.mulligans).toBe(0);
  });
});

describe("summarizeSeatOutcomes — the seat-position win table (HB-7)", () => {
  it("wilsonInterval brackets the point estimate and degrades to [0,1] on n=0", () => {
    expect(wilsonInterval(0, 0)).toEqual({ lo: 0, hi: 1 });
    const ci = wilsonInterval(7, 12);
    expect(ci.lo).toBeGreaterThan(0);
    expect(ci.lo).toBeLessThan(7 / 12);
    expect(ci.hi).toBeGreaterThan(7 / 12);
    expect(ci.hi).toBeLessThanOrEqual(1);
  });

  it("tables wins by turn-order seat, by deck (positional join through per-game seatNames), and on-the-play", () => {
    const games = [
      { result: "ai-wins", winnerSeat: "ai1", onThePlay: "user", meta: { mode: "commander", seatNames: ["A", "B", "C", "D"] } },
      { result: "ai-wins", winnerSeat: "ai1", onThePlay: "ai1", meta: { mode: "commander", seatNames: ["D", "A", "B", "C"] } }, // rotated assignment
      { result: "user-wins", winnerSeat: "user", onThePlay: "ai2", meta: { mode: "commander", seatNames: ["A", "B", "C", "D"] } },
      { result: "timeout", winnerSeat: null, onThePlay: "ai3", meta: { mode: "commander", seatNames: ["A", "B", "C", "D"] } },
      { result: "setup-error", winnerSeat: null, onThePlay: null, meta: { mode: "commander", seatNames: ["A", "B", "C", "D"] } },
    ];
    const s = summarizeSeatOutcomes(games);
    expect(s.games).toBe(5);
    expect(s.decisiveGames).toBe(3); // the timeout is honest non-signal; setup-error never seated
    // TURN-ORDER POSITION marginals — the "is ai1 over-winning?" instrument.
    expect(s.bySeat.ai1).toMatchObject({ wins: 2, games: 4 });
    expect(s.bySeat.user).toMatchObject({ wins: 1, games: 4 });
    expect(s.bySeat.ai2).toMatchObject({ wins: 0, games: 4 });
    expect(s.bySeat.ai3).toMatchObject({ wins: 0, games: 4 });
    // DECK marginals join through the PER-GAME seat assignment (rotation-correct):
    // game 2's ai1 seat held deck A, so A collects that win + game 3's user-seat win.
    expect(s.byDeck.A).toMatchObject({ wins: 2, games: 4 });
    expect(s.byDeck.B).toMatchObject({ wins: 1, games: 4 }); // game 1: ai1 held B
    expect(s.byDeck.C).toMatchObject({ wins: 0, games: 4 });
    expect(s.byDeck.D).toMatchObject({ wins: 0, games: 4 });
    // On-the-play: 4 seated games; only game 2's winner was also on the play.
    expect(s.onThePlay).toMatchObject({ wins: 1, games: 4 });
    // Every row carries a rate + CI.
    expect(s.bySeat.ai1.winRate).toBeCloseTo(0.5);
    expect(s.bySeat.ai1.ci95.lo).toBeLessThan(0.5);
    expect(s.bySeat.ai1.ci95.hi).toBeGreaterThan(0.5);
  });
});
