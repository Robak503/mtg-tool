/**
 * deckIdHistory.test.js — a deck's grind history stays one history when the deck is given an id (2026-10-21).
 *
 * A deck saved without an id was ground under its NAME: selfPlayDecks.toRunnerDeck sets the runner id to
 * `deck.id || deck.name`, so its grind headers carry `{ id: "<name>", name: "<name>" }` and the deck-versions
 * registry keys its versions by the name. Once /api/decks gives the deck an id, its new games and versions
 * carry that id. The Sim Center standings (summarizeGrind) and the Reflecting Pool's version history
 * (mineDeckHistory) must read the two as one deck — not two rows, not unnamed old versions.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { appendGame, summarizeGrind } from "./gameLogStore.js";
import { mineDeckHistory } from "./lossMiner.js";

let tmpDir;
let originalCwd;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "deck-id-history-test-"));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});
afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

const SEATS = ["user", "ai1", "ai2", "ai3"];
// One schema-2 pod game; `decks` = [{ id, name }] by seat.
const game = (seed, winnerSeat, decks) => ({
  header: {
    seed, winnerSeat, turns: 10, mode: "commander", engineVersion: "0.168.0", schemaVersion: 2,
    result: winnerSeat === "user" ? "user-wins" : "ai-wins",
    decks: decks.map((d, i) => ({ seat: SEATS[i], ...d })),
  },
  rows: [],
});
const NAME_KEYED = { id: "Hive Mind", name: "Hive Mind" }; // before: no id, ground under its name
const ID_KEYED = { id: "deck_hive_mind_k3j9x0aa", name: "Hive Mind" }; // after: the id /api/decks gave it
const RIVALS = [{ id: "r1", name: "Rival 1" }, { id: "r2", name: "Rival 2" }, { id: "r3", name: "Rival 3" }];

describe("summarizeGrind — the Sim Center standings", () => {
  it("folds a deck's name-keyed games into its id-keyed row: one row, every game and win counted", async () => {
    await appendGame(game(1, "user", [NAME_KEYED, ...RIVALS]));
    await appendGame(game(2, "ai1", [NAME_KEYED, ...RIVALS]));
    await appendGame(game(3, "user", [ID_KEYED, ...RIVALS]));
    const s = await summarizeGrind();
    const rows = s.decks.filter((d) => d.name === "Hive Mind");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "deck_hive_mind_k3j9x0aa", games: 3, decisiveGames: 3, wins: 2 });
    expect(rows[0].seats).toEqual({ user: 3 });
    expect(rows[0].seatWins).toEqual({ user: 2 });
    expect(rows[0].winRate).toBeCloseTo(2 / 3);
  });

  it("a name two different ids share is never folded (which deck the old games were is unknowable)", async () => {
    await appendGame(game(1, "user", [{ id: "Twin", name: "Twin" }, ...RIVALS]));
    await appendGame(game(2, "user", [{ id: "deck_twin_aaaaaaaa", name: "Twin" }, ...RIVALS]));
    await appendGame(game(3, "user", [{ id: "deck_twin_bbbbbbbb", name: "Twin" }, ...RIVALS]));
    const rows = (await summarizeGrind()).decks.filter((d) => d.name === "Twin");
    expect(rows.map((r) => [r.id, r.games]).sort()).toEqual([["Twin", 1], ["deck_twin_aaaaaaaa", 1], ["deck_twin_bbbbbbbb", 1]]);
  });

  it("decks that always had ids are untouched (control)", async () => {
    await appendGame(game(1, "user", [{ id: "a-1", name: "Alpha" }, ...RIVALS]));
    await appendGame(game(2, "ai1", [{ id: "a-1", name: "Alpha" }, ...RIVALS]));
    const rows = (await summarizeGrind()).decks.filter((d) => d.name === "Alpha");
    expect(rows).toEqual([expect.objectContaining({ id: "a-1", games: 2, wins: 1 })]);
  });
});

describe("mineDeckHistory — the Reflecting Pool's version history", () => {
  // Two stamped eras of one deck: v1 ground under the name, v2 under the new id.
  const stamped = (deck, deckV, index, won) => ({
    index, result: "ai-wins", winnerSeat: won ? "user" : "ai1", turns: 10,
    decks: [{ seat: "user", ...deck, deckV }, ...RIVALS.map((r, i) => ({ seat: SEATS[i + 1], ...r }))],
    seatStats: { user: { finishRank: won ? 1 : 3, eliminatedAtTurn: won ? null : 9, manaHealth: { screw: false, flood: false, commanderOnlineTurn: 4, ownTurns: 8 } } },
  });
  const headers = [
    ...Array.from({ length: 6 }, (_, i) => stamped(NAME_KEYED, "v1", i, i % 2 === 0)),
    ...Array.from({ length: 6 }, (_, i) => stamped(ID_KEYED, "v2", 100 + i, i % 2 === 0)),
  ];
  const v1 = { deckName: "Hive Mind", firstSeen: "2026-09-01T00:00:00Z", cards: { "Old Card": 1, Forest: 30 }, commanders: ["Hive Queen"], companion: null };
  const v2 = { deckName: "Hive Mind", firstSeen: "2026-10-22T00:00:00Z", cards: { "New Card": 1, Forest: 30 }, commanders: ["Hive Queen"], companion: null };

  it("names the change from a version registered under the deck's name to one registered under its id", () => {
    const registry = { "Hive Mind": { v1 }, deck_hive_mind_k3j9x0aa: { v2 } };
    const r = mineDeckHistory(headers, { id: ID_KEYED.id, name: "Hive Mind" }, registry);
    expect(r.eras.map((e) => [e.deckV, e.games])).toEqual([["v1", 6], ["v2", 6]]);
    expect(r.eras[1].diff).toEqual({ added: [{ name: "New Card", count: 1 }], removed: [{ name: "Old Card", count: 1 }] });
  });

  it("a deck that always had its id reads only its own entry (control)", () => {
    const only = headers.map((h) => ({ ...h, decks: h.decks.map((d) => (d.seat === "user" ? { ...d, id: ID_KEYED.id } : d)) }));
    const registry = { deck_hive_mind_k3j9x0aa: { v1, v2 } };
    const r = mineDeckHistory(only, { id: ID_KEYED.id, name: "Hive Mind" }, registry);
    expect(r.eras[1].diff).toEqual({ added: [{ name: "New Card", count: 1 }], removed: [{ name: "Old Card", count: 1 }] });
  });
});
