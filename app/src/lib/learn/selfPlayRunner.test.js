/**
 * selfPlayRunner.test.js — the thin self-play wrapper drives the existing Expert
 * auto-pilot to a terminal result, and the batch/pairing logic is correct.
 *
 * These build fully-shaped cards directly (no oracle-index dependency), exactly
 * like playable.integration.test.js, so they're hermetic in a fresh worktree.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { _resetIdsForTests } from "./gameState.js";
import {
  runSelfPlayGame,
  runSelfPlayBatch,
  buildPairings,
} from "./selfPlayRunner.js";

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
});
