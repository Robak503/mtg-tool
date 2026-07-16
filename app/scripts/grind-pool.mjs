/**
 * grind-pool.mjs — the PARALLEL walk-away grind (HARNESS-DATA wave 2). Spawns N worker
 * lanes (default: half the cores — Colton's speed budget) each playing whole games via
 * scripts/grind-worker.mjs, while THIS parent stays the only store writer (appendGame is
 * single-threaded here by construction — no manifest races). Lanes split one deterministic
 * game sequence by index (i ≡ lane mod N over the shared grindPod math), so a 1-worker pool
 * reproduces the in-process grind stream byte-for-byte.
 *
 *   MTG_APP_ROOT=<root> node scripts/grind-pool.mjs [--workers=8] [--cap-gb=40]
 *     [--max-hours=12] [--pilot=omnath.mjs] [--mode=commander] [--games=N]
 *     [--base-seed=12345] [--deck-ids=a,b,c]
 *
 * Stops on: disk cap (store-enforced, clean pause) · --games played · --max-hours · Ctrl-C
 * (drains in-flight games, never tears one). Progress prints once a minute.
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

const { appendGame, upsertDeckVersions } = await import(pathToFileURL(path.join(process.cwd(), "src/lib/learn/gameLogStore.js")).href);

const workers = Math.max(1, Number(argv.workers) || Math.max(1, Math.floor(os.cpus().length / 2)));
const capBytes = argv["cap-gb"] ? Math.round(Number(argv["cap-gb"]) * 1024 ** 3) : null;
const maxHours = Number(argv["max-hours"]) || 12;
const totalGames = argv.games ? Number(argv.games) : null;
const baseSeed = argv["base-seed"] != null ? Number(argv["base-seed"]) >>> 0 : (Date.now() & 0xffffffff) >>> 0;
const mode = argv.mode === "standard" ? "standard" : "commander";
const engineVersion = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")).version;

const stats = { games: 0, trusted: 0, stuck: 0, rejected: 0, bytes: 0, start: Date.now() };
let stopping = false;
const children = [];

// SERIALIZE store writes: readline 'line' handlers from different lanes interleave at their
// awaits, and two concurrent appendGame calls would read the same manifest nextIndex and
// overwrite each other's game file (the determinism gate caught exactly this — 4 processed,
// 3 stored). One promise chain = one writer, full stop.
let writeChain = Promise.resolve();
function enqueueAppend(record, opts) {
  const run = writeChain.then(() => appendGame(record, opts));
  writeChain = run.then(() => {}, () => {});
  return run;
}

function stopAll(why) {
  if (stopping) return;
  stopping = true;
  console.log(`[pool] stopping (${why}) — draining lanes`);
  for (const c of children) { try { c.kill(); } catch { /* already gone */ } }
}

const laneConfigs = []; // cleaned up at exit (R2.4 — per-worker tmp configs used to accumulate forever)
for (let k = 0; k < workers; k++) {
  const laneGames = totalGames == null ? null : Math.max(0, Math.ceil((totalGames - k) / workers));
  if (laneGames === 0) continue;
  const cfgPath = path.join(os.tmpdir(), `grind-lane-${process.pid}-${k}.json`);
  laneConfigs.push(cfgPath);
  fs.writeFileSync(cfgPath, JSON.stringify({
    deckIds: argv["deck-ids"] ? String(argv["deck-ids"]).split(",") : [],
    mode,
    pilotFile: argv.pilot || null,
    // RECALL-ARM plumb (M2.3, Omnath handoff): --pilot-flags=recall-on[,…] reaches every
    // pilotBuilder call as the 3rd-arg options bag ({ flags: [...] }); the persona reads it.
    pilotFlags: argv["pilot-flags"] ? String(argv["pilot-flags"]).split(",").filter(Boolean) : [],
    pool: argv.pool === "cedh" ? "cedh" : "mixed",
    baseSeed,
    laneIndex: k,
    laneCount: workers,
    maxGames: laneGames,
    engineVersion,
  }));
  const child = spawn(process.execPath, [path.join(process.cwd(), "scripts/grind-worker.mjs"), cfgPath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "inherit"], // worker stderr passes through for honest error surfacing
  });
  children.push(child);
  const rl = createInterface({ input: child.stdout });
  rl.on("line", async (line) => {
    // R2.4 (audit 2026-07-09): the whole handler is guarded — an async rejection here (a disk
    // error inside appendGame) was an UNHANDLED REJECTION that killed the parent mid-run and
    // orphaned every lane. A store failure now logs loudly and stops the pool CLEANLY instead.
    try {
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.done) { console.log(`[pool] lane ${msg.lane} done (${msg.games} games)`); return; }
      // R4 living-history handshake: each lane sends its decks' version snapshots before game 1;
      // ride the single write chain (registry read-modify-write must not interleave with itself).
      if (msg.versions) { writeChain = writeChain.then(() => upsertDeckVersions(msg.versions)).then(() => {}, (e) => console.error(`[pool] deck-versions registry: ${e?.message || e}`)); return; }
      if (!msg.record) return;
      const appended = await enqueueAppend(msg.record, { capBytes });
      if (appended.capReached) { stopAll("disk cap reached"); return; }
      if (appended.rejected) { stats.rejected += 1; console.error(`[pool] record rejected: ${appended.reason}`); return; }
      stats.games += 1;
      stats.bytes = appended.totalBytes;
      if (msg.trusted) stats.trusted += 1;
      if (!["user-wins", "ai-wins", "draw"].includes(msg.record.header?.result)) stats.stuck += 1;
      if (totalGames != null && stats.games >= totalGames) stopAll("game target reached");
    } catch (error) {
      console.error(`[pool] STORE ERROR — stopping cleanly: ${error?.message || error}`);
      stopAll("store error");
    }
  });
}

const tick = setInterval(() => {
  const mins = (Date.now() - stats.start) / 60000;
  console.log(`[pool] +${Math.round(mins)}m  games=${stats.games} trusted=${stats.trusted} stuck=${stats.stuck} MB=${Math.round(stats.bytes / 1048576)} rate=${(stats.games / Math.max(mins, 0.1)).toFixed(1)}/min workers=${children.filter((c) => c.exitCode === null).length}`);
  if (mins > maxHours * 60) stopAll("max hours reached");
}, 60000);

process.on("SIGINT", () => stopAll("Ctrl-C"));

await Promise.all(children.map((c) => new Promise((r) => c.on("exit", r))));
clearInterval(tick);
await writeChain; // drain the last enqueued append before reporting
for (const cfg of laneConfigs) { try { fs.rmSync(cfg, { force: true }); } catch { /* best-effort */ } }
const mins = (Date.now() - stats.start) / 60000;
console.log(`[pool] DONE — ${stats.games} games (${stats.trusted} trusted, ${stats.stuck} stuck, ${stats.rejected} rejected) in ${mins.toFixed(1)} min = ${(stats.games / Math.max(mins, 0.1)).toFixed(1)}/min, seed=${baseSeed}, workers=${workers}`);
