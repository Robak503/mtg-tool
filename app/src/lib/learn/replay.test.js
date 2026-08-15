/**
 * replay.test.js — QUARTET PHASE 3 slice 2 (2026-08-15): seeded replay via the stable state hash.
 * Plan: docs/orchestration/SUBSYSTEM-QUARTET-PLAN.md Phase 3.
 *
 * ⭐ THE PREMISE MADE A CONTRACT: runSelfPlayGame is deterministic over its args (evidenced by four
 * 100-game gate runs reproducing identical outcomes) — so a replay is a re-run with identical args,
 * and stateHash (explicit field order, FNV-1a over the canonical string) is the equality witness. A
 * real-game bug report becomes { args, finalStateHash }: replays bit-identical or names the leak.
 *
 * ⛔ THE CONSTANT-HASH HOLLOW GATE: a hash that returns the same value for every state passes the
 * determinism pin vacuously — the DIFFERENT-seed control below is what gives the pin teeth.
 *
 * Mutation-checked (2026-08-15): canonicalState's battlefield component dropped → the two-board
 * different-hash witness dies (boards differing only on battlefield collide).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { stateHash } from "./replay.js";
import { runSelfPlayGame } from "./selfPlayRunner.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CARD = (id, name) => ({ id, name, type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: "" });
const DECK = (prefix) => Array.from({ length: 20 }, (_, i) =>
  i < 12 ? { id: `${prefix}-F${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "" } : CARD(`${prefix}-B${i}`, "Bear"));

describe("the hash — stable, state-sensitive, never constant", () => {
  it("⭐ the same state hashes identically; a battlefield difference changes it (the anti-constant control)", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const withPerm = { ...g, players: { ...g.players, user: { ...g.players.user,
      battlefield: [createPermanent({ id: "P1", controller: "user", card: CARD("c1", "Bear") })] } } };
    const row = { same: stateHash(g) === stateHash(structuredClone(g)), differs: stateHash(g) !== stateHash(withPerm) };
    console.log("  WITNESS replayHash", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ same: true, differs: true });
  });

  it("a tapped permanent, a counter, and a life change each move the hash (the canonical fields are live)", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const base = { ...g, players: { ...g.players, user: { ...g.players.user,
      battlefield: [createPermanent({ id: "P1", controller: "user", card: CARD("c1", "Bear") })] } } };
    const h = stateHash(base);
    const tapped = structuredClone(base); tapped.players.user.battlefield[0].tapped = true;
    const countered = structuredClone(base); countered.players.user.battlefield[0].counters = { "+1/+1": 1 };
    const hurt = structuredClone(base); hurt.players.user.life -= 1;
    expect(new Set([h, stateHash(tapped), stateHash(countered), stateHash(hurt)]).size).toBe(4);
  });
});

describe("⭐⭐ LAW 6 — a game REPLAYS hash-identical; a different seed does not", () => {
  it("⭐⭐ the same args twice → the same finalStateHash; seed+1 → a different one", () => {
    const args = { deckA: DECK("a"), deckB: DECK("b"), mode: "standard", seed: 424242, withStateHash: true };
    const run1 = runSelfPlayGame(structuredClone(args));
    const run2 = runSelfPlayGame(structuredClone(args));
    const other = runSelfPlayGame(structuredClone({ ...args, seed: 424243 }));
    const row = { replayIdentical: run1.finalStateHash === run2.finalStateHash,
      hash: run1.finalStateHash, otherDiffers: run1.finalStateHash !== other.finalStateHash };
    console.log("  WITNESS replayGame", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.replayIdentical).toBe(true);
    expect(row.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(row.otherDiffers).toBe(true); // the anti-constant control at the GAME level
  });
});
