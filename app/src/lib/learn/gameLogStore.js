/**
 * gameLogStore.js — the append-per-game data-lifecycle store for the GRIND BUTTON (Omnath sim-center handoff;
 * spec in COMMS 2026-07-08, corrected to file-per-game). A multi-hour grind streams one file PER GAME so a crash
 * loses only the in-flight game, and each game is independently parseable + replay-regenerable. Both sides use
 * this: the runner's grind loop APPENDS here; Omnath's parse→distill consumer READS sealed shards, marks them
 * parsed, and the prune reclaims their raw payload.
 *
 * LAYOUT (writable, default AppData) — profilePath("self-play","grind"):
 *   manifest.json                         — the single source of truth (per-SHARD rollups; small even after millions
 *                                           of games): { nextIndex, totalBytes, capBytes, shards:[{shard, firstIndex,
 *                                           count, sizeBytes, parsed, pruned}] }
 *   shard-0000/ … shard-NNNN/             — ≤1000 game files each (flat 100k+ files chokes NTFS — Omnath's shard rule)
 *     game-000000.json                    — { index, header{seed,pilots,engineVersion,result,winnerSeat,turns,mode},
 *                                           rows:[…] } — the bulky, PRUNABLE raw (regen by replay from the header)
 *     headers.jsonl                       — one header line per game, append-only, KEPT FOREVER (so any pruned game
 *                                           is replay-regenerable; permanent footprint stays tiny)
 *
 * RETENTION (Omnath): distilled stores + the ~100B headers live forever; raw game files are a prunable working set.
 * CAP (Colton: 100 GB): appendGame refuses + signals capReached at the budget → the grind PAUSES cleanly, never
 * overwrites unparsed games, never crashes. pruneParsedShards reclaims only OLDEST *parsed* shards (never unparsed).
 */

import fs from "node:fs/promises";
import path from "node:path";

import { profilePath } from "../server/paths.js";
import { atomicWriteJson, readJsonSafe } from "../server/atomicJson.js";

const SHARD_SIZE = 1000; // games per shard folder (NTFS-friendly)
const DEFAULT_CAP_BYTES = 100 * 1024 * 1024 * 1024; // 100 GB (Colton's raw-file budget)

export function grindRoot() {
  return profilePath("self-play", "grind");
}
const manifestPath = () => path.join(grindRoot(), "manifest.json");
const shardName = (index) => `shard-${String(Math.floor(index / SHARD_SIZE)).padStart(4, "0")}`;
const gameFileName = (index) => `game-${String(index).padStart(6, "0")}.json`;

/** Load the manifest (fresh default if absent). Never throws. */
export async function loadGrindManifest() {
  const m = await readJsonSafe(manifestPath());
  if (m && typeof m === "object" && Array.isArray(m.shards)) return m;
  return { nextIndex: 0, totalBytes: 0, capBytes: DEFAULT_CAP_BYTES, shards: [] };
}

/**
 * Append ONE game. Writes the raw game file + a forever-kept header line, then updates the manifest atomically.
 * Returns { index, file, capReached }. When the cap is hit returns { capReached:true } WITHOUT writing (the grind
 * loop pauses cleanly — never a partial/overwrite). `record` = { header:{seed,pilots,engineVersion,result,
 * winnerSeat,turns,mode}, rows:[…] }; the rows are the decision path (kept compact by the recorder).
 */
export async function appendGame(record, { capBytes = null } = {}) {
  const manifest = await loadGrindManifest();
  const cap = Number.isFinite(capBytes) ? capBytes : manifest.capBytes ?? DEFAULT_CAP_BYTES;
  if (manifest.totalBytes >= cap) {
    return { capReached: true, index: null, file: null, totalBytes: manifest.totalBytes, capBytes: cap };
  }
  const index = manifest.nextIndex;
  const shard = shardName(index);
  const shardDir = path.join(grindRoot(), shard);
  await fs.mkdir(shardDir, { recursive: true });

  const header = { index, ...(record?.header || {}) };
  const gameObj = { index, header: record?.header || {}, rows: Array.isArray(record?.rows) ? record.rows : [] };
  const body = JSON.stringify(gameObj);
  const size = Buffer.byteLength(body, "utf8");
  const file = path.join(shardDir, gameFileName(index));
  // Atomic write of the raw game file (tmp+rename) so a crash never leaves a torn game.
  const tmp = `${file}.tmp.${process.pid}.${index}`;
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, file);
  // Append the header line (kept forever; append is the crash-safety — lose only a torn last line, recoverable).
  await fs.appendFile(path.join(shardDir, "headers.jsonl"), JSON.stringify(header) + "\n", "utf8");

  // Update the manifest: bump nextIndex/totalBytes + the current shard's rollup.
  let shardEntry = manifest.shards.find((s) => s.shard === shard);
  if (!shardEntry) {
    shardEntry = { shard, firstIndex: index, count: 0, sizeBytes: 0, parsed: false, pruned: false };
    manifest.shards.push(shardEntry);
  }
  shardEntry.count += 1;
  shardEntry.sizeBytes += size;
  manifest.nextIndex = index + 1;
  manifest.totalBytes += size;
  manifest.capBytes = cap;
  await atomicWriteJson(manifestPath(), manifest);
  return { capReached: false, index, file, totalBytes: manifest.totalBytes, capBytes: cap };
}

/** Mark a shard parsed (Omnath's consumer calls this after distilling a SEALED shard) so prune may reclaim it. */
export async function markShardParsed(shard) {
  const manifest = await loadGrindManifest();
  const entry = manifest.shards.find((s) => s.shard === shard);
  if (!entry) return manifest;
  entry.parsed = true;
  await atomicWriteJson(manifestPath(), manifest);
  return manifest;
}

/**
 * Reclaim raw payload to stay under budget: delete the game-*.json of the OLDEST already-PARSED, not-yet-pruned
 * shards (KEEPING headers.jsonl forever) until totalBytes ≤ capBytes. NEVER prunes an unparsed shard (that would
 * drop un-distilled data). Returns { prunedShards, freedBytes }. A no-op when already under budget or nothing is
 * parsed. Logged by the caller.
 */
export async function pruneParsedShards({ capBytes = null } = {}) {
  const manifest = await loadGrindManifest();
  const cap = Number.isFinite(capBytes) ? capBytes : manifest.capBytes ?? DEFAULT_CAP_BYTES;
  const prunedShards = [];
  let freedBytes = 0;
  // Oldest-first among parsed, not-yet-pruned shards.
  const candidates = manifest.shards
    .filter((s) => s.parsed && !s.pruned)
    .sort((a, b) => a.firstIndex - b.firstIndex);
  for (const entry of candidates) {
    if (manifest.totalBytes <= cap) break;
    const shardDir = path.join(grindRoot(), entry.shard);
    let removed = 0;
    try {
      const files = await fs.readdir(shardDir);
      for (const f of files) {
        if (!/^game-\d+\.json$/.test(f)) continue; // keep headers.jsonl
        const fp = path.join(shardDir, f);
        try {
          const st = await fs.stat(fp);
          await fs.rm(fp, { force: true });
          removed += st.size;
        } catch { /* already gone */ }
      }
    } catch { /* shard dir gone */ }
    entry.pruned = true;
    entry.sizeBytes = 0;
    manifest.totalBytes = Math.max(0, manifest.totalBytes - removed);
    freedBytes += removed;
    prunedShards.push(entry.shard);
  }
  if (prunedShards.length) await atomicWriteJson(manifestPath(), manifest);
  return { prunedShards, freedBytes };
}
