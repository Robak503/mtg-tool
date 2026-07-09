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

import { appendGame, loadGrindManifest, grindRoot, markShardParsed, pruneParsedShards } from "./gameLogStore.js";

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
    expect(files).toContain("game-000000.json");
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
    expect(after).toContain("game-000000.json"); // still present
  });
});
