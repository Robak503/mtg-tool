/**
 * selfPlaySeatingDeterminism.test.js — the LOAD-INDEPENDENT pin for the replay
 * invariant: "same seed ⇒ byte-identical game" (flake root-cause pass, 2026-07-17).
 *
 * WHY THIS FILE EXISTS: a selfPlayRunner test flaked under full-suite parallel load
 * while passing 100% in isolation. The root-cause investigation cleared the engine —
 * every production id threads the state-carried mintId (never the legacy random
 * nextId, which is now deterministic too), all module caches are per-object WeakMaps,
 * vitest runs isolate:true, and the game path never touches disk — leaving spurious
 * timeout-under-contention as the failure mode (fixed with a per-file ceiling there).
 * THIS file is the tripwire for the other arm: if genuine nondeterminism ever creeps
 * into seating/shuffle/decisions, these pins fail DETERMINISTICALLY, every run, with
 * a diff — not intermittently under load. The sim's "Watch it" replay and the whole
 * grind-data pipeline (banked { seed, startSeat } reproduction) stand on this.
 *
 * Fixtures are fully-shaped cards (no oracle-index dependency) — hermetic anywhere.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { _resetIdsForTests } from "./gameState.js";
import { createLearnSession, advanceUntilDecision } from "./learnSession.js";
import { serializeState, deserializeState } from "./serialization.js";
import { runSelfPlayGame, runSelfPlayBatch } from "./selfPlayRunner.js";

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

/** Everything a replay comparison cares about, in one stable string. */
function gameFingerprint(g) {
  return JSON.stringify({ result: g.result, turns: g.turns, winnerSeat: g.winnerSeat, onThePlay: g.onThePlay, log: g.log });
}

describe("same seed ⇒ byte-identical game (the replay invariant, pinned load-independently)", () => {
  it("standard: two same-seed runs produce byte-identical seating + full game line", () => {
    const run = () =>
      quiet(() => runSelfPlayGame({ deckA: aggroDeck("u"), deckB: aggroDeck("a"), mode: "standard", seed: 1337 }));
    const a = run();
    const b = run();
    // Seating: same starting player, stamped identically in the log's game-start.
    expect(a.onThePlay).toBe(b.onThePlay);
    expect(a.log.find((e) => e.kind === "game-start")?.startingPlayer)
      .toBe(b.log.find((e) => e.kind === "game-start")?.startingPlayer);
    // The whole game line, byte for byte.
    expect(gameFingerprint(a)).toBe(gameFingerprint(b));
  });

  it("commander 4P pod: two same-seed runs are byte-identical (4-seat seating included)", () => {
    const run = () =>
      quiet(() => runSelfPlayGame({
        deckA: aggroDeck("u"),
        opponentDecks: [aggroDeck("a1"), aggroDeck("a2"), aggroDeck("a3")],
        mode: "commander",
        seed: 77,
        startSeat: "ai2", // a non-default seat, so the pin covers the rotated-seating path too
      }));
    const a = run();
    const b = run();
    expect(a.onThePlay).toBe("ai2");
    expect(gameFingerprint(a)).toBe(gameFingerprint(b));
  });

  it("same-seed determinism survives WITHOUT the module-id reset between runs (process-lifetime independence)", () => {
    // The beforeEach reset ran once for this test; deliberately do NOT reset between
    // the two runs. If any id in a compared structure came from the module-global
    // legacy minter (counter position differs run to run) — or from any entropy
    // source — this fails. Production ids ride state.idSeq, so it must pass.
    const run = () =>
      quiet(() => runSelfPlayGame({ deckA: aggroDeck("u"), deckB: aggroDeck("a"), mode: "standard", seed: 424242 }));
    const a = run();
    const b = run(); // module counter now offset by a whole game's worth of mints
    expect(gameFingerprint(a)).toBe(gameFingerprint(b));
  });

  it("batch seating: same baseSeed ⇒ identical per-game seeds, starting seats, and game lines", () => {
    const decks = [
      { id: "u", name: "U", cards: aggroDeck("u") },
      { id: "a", name: "A", cards: aggroDeck("a") },
    ];
    const run = () => quiet(() => runSelfPlayBatch(decks, { mode: "standard", gamesPer: 4, baseSeed: 55 }));
    const a = run();
    const b = run();
    expect(a.games.map((g) => g.meta.seed)).toEqual(b.games.map((g) => g.meta.seed));
    expect(a.games.map((g) => g.onThePlay)).toEqual(b.games.map((g) => g.onThePlay));
    expect(a.games.map(gameFingerprint)).toEqual(b.games.map(gameFingerprint));
  });
});

describe("serialize/deserialize mid-game ⇒ byte-identical continuation (Phase-7 resume invariant)", () => {
  it("a session restored from a mid-game snapshot finishes with the SAME final log as the uninterrupted run", () => {
    // Capture a serialized snapshot at the first turn boundary past turn 3 via the
    // read-only onTurnStart observer, while the original run continues untouched.
    let snapshot = null;
    let snapshotTurn = null;
    const session = createLearnSession({
      userDeck: aggroDeck("u"),
      opponentDeck: aggroDeck("a"),
      difficulty: "expert",
      mode: "standard",
      seed: 9001,
    });
    const { session: finished } = quiet(() =>
      advanceUntilDecision(session, {
        onTurnStart: (state, turnNumber) => {
          if (snapshot === null && turnNumber > 3) {
            snapshot = serializeState(state);
            snapshotTurn = turnNumber;
          }
        },
      }));
    expect(snapshot).not.toBeNull(); // the game reached turn 4 (bears always do)
    const finalLogA = JSON.stringify(finished.state.log);
    expect(finished.status).not.toBe("active"); // ran to termination

    // Restore: same plain-object session shell around the deserialized state —
    // everything decision-driving (idSeq, rngSeed, log, players, turnOrder) rides state.
    const restored = {
      id: "restored-for-test",
      createdAt: session.createdAt,
      difficulty: "expert",
      mode: "standard",
      state: deserializeState(snapshot),
      decisionLog: [],
      status: "active",
    };
    expect(restored.state.turn).toBe(snapshotTurn);
    const { session: resumed } = quiet(() => advanceUntilDecision(restored, {}));
    const finalLogB = JSON.stringify(resumed.state.log);

    // The continuation is byte-identical: same final log, same terminal status.
    expect(finalLogB).toBe(finalLogA);
    expect(resumed.status).toBe(finished.status);
  });
});
