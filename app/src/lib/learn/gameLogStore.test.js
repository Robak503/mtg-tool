/**
 * gameLogStore.test.js — the append-per-game data-lifecycle store for the grind button (Omnath handoff).
 * Locks: sharded per-game writes + a forever headers.jsonl + manifest rollups · the 100GB-style cap PAUSES
 * cleanly (no write, no crash) · prune reclaims a PARSED shard's raw game files but KEEPS the headers (so a
 * pruned game is replay-regenerable) · an UNPARSED shard is never pruned. chdir(tmpdir) so profilePath() writes
 * under a throwaway root (vitest scrubs MTG_APP_ROOT, so paths.js resolves to cwd).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { appendGame, loadGrindManifest, grindRoot, markShardParsed, pruneParsedShards, summarizeGrind, readGameFile, gameFilePath } from "./gameLogStore.js";

let tmpDir;
let originalCwd;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "grind-log-test-"));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});
afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

const mkGame = (i) => ({
  header: { seed: i, pilots: { user: { playbook: "p", temperament: "t" } }, engineVersion: "0.117.0", result: "user-wins", winnerSeat: "user", turns: 8, mode: "commander" },
  rows: [{ turn: 1, seat: "user", action: { kind: "pass" } }],
});

describe("gameLogStore — append-per-game sharded log + manifest (grind data lifecycle)", () => {
  it("appends games → per-game files + a forever headers.jsonl + manifest rollups", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await appendGame(mkGame(i));
      expect(r.capReached).toBe(false);
      expect(r.index).toBe(i);
    }
    const m = await loadGrindManifest();
    expect(m.nextIndex).toBe(3);
    expect(m.shards).toHaveLength(1);
    expect(m.shards[0]).toMatchObject({ shard: "shard-0000", firstIndex: 0, count: 3, parsed: false, pruned: false });
    expect(m.totalBytes).toBeGreaterThan(0);
    const files = await fs.readdir(path.join(grindRoot(), "shard-0000"));
    expect(files).toContain("game-000000.json.gz"); // gz per game (wave 2 — lossless)
    expect(files).toContain("headers.jsonl");
    const headers = (await fs.readFile(path.join(grindRoot(), "shard-0000", "headers.jsonl"), "utf8")).trim().split("\n");
    expect(headers).toHaveLength(3);
    expect(JSON.parse(headers[0])).toMatchObject({ index: 0, seed: 0, engineVersion: "0.117.0", result: "user-wins" });
  });

  it("PAUSES cleanly at the cap — capReached, no write, nextIndex unchanged", async () => {
    await appendGame(mkGame(0));
    const r = await appendGame(mkGame(1), { capBytes: 1 }); // already over a 1-byte budget
    expect(r.capReached).toBe(true);
    expect(r.index).toBeNull();
    expect((await loadGrindManifest()).nextIndex).toBe(1); // nothing was written
  });

  it("prune reclaims a PARSED shard's raw game files but KEEPS headers.jsonl (replay-regenerable)", async () => {
    await appendGame(mkGame(0));
    await markShardParsed("shard-0000");
    const pr = await pruneParsedShards({ capBytes: 1 });
    expect(pr.prunedShards).toContain("shard-0000");
    expect(pr.freedBytes).toBeGreaterThan(0);
    const after = await fs.readdir(path.join(grindRoot(), "shard-0000"));
    expect(after).toEqual(["headers.jsonl"]); // raw gone, header kept forever
    expect((await loadGrindManifest()).shards[0].pruned).toBe(true);
  });

  it("NEVER prunes an UNPARSED shard (would drop un-distilled data)", async () => {
    await appendGame(mkGame(0)); // NOT marked parsed
    const pr = await pruneParsedShards({ capBytes: 1 });
    expect(pr.prunedShards).toHaveLength(0);
    const after = await fs.readdir(path.join(grindRoot(), "shard-0000"));
    expect(after).toContain("game-000000.json.gz"); // still present
  });

  it("gz round-trip is LOSSLESS: readGameFile returns exactly what was appended (+ stamps)", async () => {
    const game = mkGame(7);
    game.rows = [{ turn: 1, seat: "user", action: { kind: "cast", card: "Sol Ring" }, features: { own_life: 40 } }];
    await appendGame(game);
    const p = await gameFilePath(0);
    expect(p.endsWith(".json.gz")).toBe(true);
    const back = await readGameFile(0);
    expect(back.rows).toEqual(game.rows); // byte-content equality of the payload
    expect(back.header).toMatchObject({ seed: 7, result: "user-wins", schemaVersion: 3 });
  });

  it("legacy PLAIN .json games stay readable next to gz ones (mixed store)", async () => {
    await appendGame(mkGame(0)); // written as .json.gz by current code
    // Simulate a pre-gz record: plain .json at the next index + a manifest bump.
    const legacy = { index: 1, header: { seed: 99, result: "ai-wins", turns: 5, mode: "commander" }, rows: [] };
    await fs.writeFile(path.join(grindRoot(), "shard-0000", "game-000001.json"), JSON.stringify(legacy), "utf8");
    expect((await readGameFile(1)).header.seed).toBe(99); // resolver falls back to plain
    expect((await readGameFile(0)).header.seed).toBe(0);
  });
});

describe("summarizeGrind — per-deck standings + winner split for the Sim Center readout", () => {
  // A game with per-seat DECK attribution (the grindLoop recorder now stamps header.decks).
  const gameWithDecks = (seed, winnerSeat, seatDeckNames) => ({
    header: {
      seed, winnerSeat, turns: 10, mode: "commander", engineVersion: "0.123.0",
      result: winnerSeat === "user" ? "user-wins" : winnerSeat ? "ai-wins" : "draw", // real headers always carry result
      pilots: { user: { playbook: "ramp" }, ai1: { playbook: "combo" } },
      decks: seatDeckNames.map((name, i) => ({ seat: ["user", "ai1", "ai2", "ai3"][i], id: `d-${name}`, name })),
    },
    rows: [],
  });

  it("attributes wins + participation per deck (seat-based, never by name collision)", async () => {
    // 3 games, same pod: A wins twice, B wins once.
    await appendGame(gameWithDecks(1, "user", ["A", "B", "C", "D"]));
    await appendGame(gameWithDecks(2, "user", ["A", "B", "C", "D"]));
    await appendGame(gameWithDecks(3, "ai1", ["A", "B", "C", "D"]));

    const s = await summarizeGrind();
    expect(s.games).toBe(3);
    expect(s.withDeckAttribution).toBe(3);
    expect(s.avgTurns).toBe(10);
    expect(s.winnerSeats).toEqual({ user: 2, ai1: 1 });
    const byName = Object.fromEntries(s.decks.map((d) => [d.name, d]));
    expect(byName.A).toMatchObject({ games: 3, wins: 2 });
    expect(byName.B).toMatchObject({ games: 3, wins: 1 });
    expect(byName.C).toMatchObject({ games: 3, wins: 0 });
    expect(byName.A.winRate).toBeCloseTo(2 / 3);
  });

  it("counts pre-attribution games in totals but not in the per-deck table", async () => {
    await appendGame(mkGame(0)); // legacy header — no `decks`
    await appendGame(gameWithDecks(1, "user", ["A", "B", "C", "D"]));
    const s = await summarizeGrind();
    expect(s.games).toBe(2);
    expect(s.withDeckAttribution).toBe(1); // only the attributed one
    expect(s.decks.every((d) => d.name !== undefined)).toBe(true);
    expect(s.decks.find((d) => d.name === "A")).toBeTruthy();
  });

  it("returns zeros on an empty store (never throws)", async () => {
    const s = await summarizeGrind();
    expect(s).toMatchObject({ games: 0, withDeckAttribution: 0, decks: [] });
  });

  it("R2.1: win rates are DECISIVE-only — a stuck game is not a loss and not a draw", async () => {
    await appendGame(gameWithDecks(1, "user", ["A", "B", "C", "D"]));
    const stuck = gameWithDecks(2, null, ["A", "B", "C", "D"]);
    stuck.header.result = "engine-stuck";
    await appendGame(stuck);
    const s = await summarizeGrind();
    const a = s.decks.find((d) => d.name === "A");
    expect(a.games).toBe(2); // participation counts both
    expect(a.decisiveGames).toBe(1); // the denominator doesn't
    expect(a.winRate).toBe(1); // 1 win / 1 decisive — NOT diluted to 0.5 by the stuck game
    expect(s.winnerSeats.draw ?? 0).toBe(0); // the stuck game's null winner is NOT a draw
    expect(s.results["engine-stuck"]).toBe(1);
  });

  it("R2.2: a caller's run-scoped capBytes is NOT persisted into the manifest", async () => {
    await appendGame(mkGame(0), { capBytes: 5 * 1024 * 1024 });
    const m = await loadGrindManifest();
    expect(m.capBytes).toBe(100 * 1024 * 1024 * 1024); // still the store default, not 5MB
  });

  it("R2.3: a stale nextIndex (crash window) SKIPS to the first free index — never overwrites a game", async () => {
    await appendGame(mkGame(0));
    await appendGame(mkGame(1));
    // Simulate the crash: manifest says nextIndex=1 but game-000001 already exists on disk.
    const m = await loadGrindManifest();
    m.nextIndex = 1;
    const { atomicWriteJson } = await import("../server/atomicJson.js");
    await atomicWriteJson(path.join(grindRoot(), "manifest.json"), m);
    const r = await appendGame(mkGame(99));
    expect(r.index).toBe(2); // skipped past the existing file
    expect((await readGameFile(1)).header.seed).toBe(1); // game 1 untouched
    expect((await readGameFile(2)).header.seed).toBe(99);
  });

  it("R2.3 read-side: a duplicated header index is deduped in summarize (first occurrence wins)", async () => {
    await appendGame(gameWithDecks(1, "user", ["A", "B", "C", "D"]));
    // Orphaned duplicate header line for the same index (the crash artifact).
    const dupe = { index: 0, seed: 1, winnerSeat: "ai1", result: "ai-wins", turns: 5, mode: "commander", schemaVersion: 2 };
    await fs.appendFile(path.join(grindRoot(), "shard-0000", "headers.jsonl"), JSON.stringify(dupe) + "\n", "utf8");
    const s = await summarizeGrind();
    expect(s.games).toBe(1); // not double-counted
    expect(s.duplicateHeaders).toBe(1); // and reported
    expect(s.winnerSeats).toEqual({ user: 1 }); // the first (real) line won
  });

  it("EXCLUDES pre-schema-2 (fabricated-winner) games from the standings table — totals still count them", async () => {
    // One honest game via the current writer (stamped schemaVersion 2)…
    await appendGame(gameWithDecks(1, "user", ["A", "B", "C", "D"]));
    // …and one LEGACY game: a schema-1 header line with decks + a crowned "winner" (the
    // 2026-07-09 fabrication class), appended raw the way old writers left them.
    const legacy = {
      index: 1, seed: 9, winnerSeat: "ai1", result: "ai-wins", turns: 20, mode: "commander",
      decks: ["A", "B", "C", "D"].map((name, i) => ({ seat: ["user", "ai1", "ai2", "ai3"][i], id: `d-${name}`, name })),
    };
    await fs.appendFile(path.join(grindRoot(), "shard-0000", "headers.jsonl"), JSON.stringify(legacy) + "\n", "utf8");

    const s = await summarizeGrind();
    expect(s.games).toBe(2); // totals count everything
    expect(s.legacyGames).toBe(1); // …and say how much was excluded
    expect(s.withDeckAttribution).toBe(1); // standings base = honest games only
    const b = s.decks.find((d) => d.name === "B");
    expect(b.games).toBe(1); // NOT 2 — the legacy game doesn't attribute
    expect(b.wins).toBe(0); // the fabricated ai1 crown is not counted as B's win
  });
});

describe("schema stamps + validation + stuck-triage (HARNESS-DATA wave 1)", () => {
  it("stamps schemaVersion + featuresV into every stored header (choke-point, caller can't opt out)", async () => {
    await appendGame(mkGame(0));
    const stored = await readGameFile(0);
    expect(stored.header.schemaVersion).toBe(3); // EPOCH-2 bump (the ONE bump, 2026-07-09)
    expect(typeof stored.header.featuresV).toBe("number");
    const headerLine = JSON.parse((await fs.readFile(path.join(grindRoot(), "shard-0000", "headers.jsonl"), "utf8")).trim());
    expect(headerLine.schemaVersion).toBe(3);
  });

  it("REJECTS a malformed record without writing (no junk in the store)", async () => {
    const bad = await appendGame({ header: { seed: 1 }, rows: [{ turn: "one", seat: "user", action: {} }] });
    expect(bad.rejected).toBe(true);
    expect(bad.reason).toMatch(/turn/);
    expect((await loadGrindManifest()).nextIndex).toBe(0); // nothing written
    const noRows = await appendGame({ header: {} });
    expect(noRows.rejected).toBe(true);
  });

  it("indexes a NON-DECISIVE game into stuck-triage.jsonl (decisive games stay out)", async () => {
    await appendGame(mkGame(0)); // user-wins → decisive, no triage line
    const stuck = mkGame(1);
    stuck.header.result = "engine-stuck";
    stuck.header.winnerSeat = null;
    await appendGame(stuck);
    const triage = (await fs.readFile(path.join(grindRoot(), "stuck-triage.jsonl"), "utf8")).trim().split("\n");
    expect(triage).toHaveLength(1);
    const t = JSON.parse(triage[0]);
    expect(t).toMatchObject({ index: 1, result: "engine-stuck", seed: 1 });
    expect(t.schemaVersion).toBe(3); // triage lines carry the full stamped header (repro-ready)
  });

  it("summarize reports the results histogram, stuck count, per-deck seat counts + maxSeatSkew", async () => {
    const g = (seed, winnerSeat, result = "user-wins") => ({
      header: {
        seed, winnerSeat, result, turns: 10, mode: "commander", engineVersion: "0.125.0",
        decks: ["A", "B", "C", "D"].map((name, i) => ({ seat: ["user", "ai1", "ai2", "ai3"][i], id: `d-${name}`, name })),
      },
      rows: [],
    });
    await appendGame(g(1, "user"));
    await appendGame(g(2, "ai1", "ai-wins"));
    const stuck = g(3, null, "engine-stuck");
    await appendGame(stuck);
    const s = await summarizeGrind();
    expect(s.results).toEqual({ "user-wins": 1, "ai-wins": 1, "engine-stuck": 1 });
    expect(s.stuckGames).toBe(1);
    const a = s.decks.find((d) => d.name === "A");
    expect(a.seats).toEqual({ user: 3 }); // A sat the user seat in all 3 games
    expect(s.maxSeatSkew).toBe(0); // no deck has ≥100 games → skew reported as 0, not noise
  });
});
