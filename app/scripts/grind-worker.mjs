/**
 * grind-worker.mjs — ONE lane of the parallel grind pool (spawned by grind-pool.mjs; not for
 * direct use). Plays whole games in-process and emits one JSON line per finished game on
 * stdout; the PARENT is the only store writer (single-writer manifest integrity).
 *
 * Seed-lane determinism: this worker plays game indices i ≡ laneIndex (mod laneCount) of the
 * SAME sequence the single-process grind loop would play (identical gameSeedAt formula +
 * formPod), so a pool with laneCount=1 reproduces the in-process game stream byte-for-byte —
 * that equality is the pool's correctness gate.
 *
 * Protocol: argv[2] = path to a JSON config file {deckIds, mode, pilotFile, baseSeed,
 * laneIndex, laneCount, maxGames}. stdout: one line per game
 * `{"i":<sequenceIndex>,"record":{header,rows}}` then `{"done":true,"lane":k,"games":n}`.
 * Decks are re-loaded from the profile store by id (cheap, avoids piping ~MBs of deck JSON).
 */

import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

const cfg = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const APP = process.cwd();
const u = (rel) => pathToFileURL(path.join(APP, rel)).href;

const { loadAllProfileDecks, toRunnerDeck, partitionPlayableRunnerDecks, selectDecksByIds } = await import(u("src/lib/server/selfPlayDecks.js"));
const { loadPilotBuilder } = await import(u("src/lib/server/pilotLoader.js"));
const { runSelfPlayGame } = await import(u("src/lib/learn/selfPlayRunner.js"));
const { formPod, podToArgs, gameSeedAt, engineSeatsFor } = await import(u("src/lib/learn/grindPod.js"));

const pool = await loadAllProfileDecks();
const raw = cfg.deckIds?.length ? selectDecksByIds(pool, cfg.deckIds) : pool;
const { playable } = partitionPlayableRunnerDecks(raw.map(toRunnerDeck));
const podSize = cfg.mode === "standard" ? 2 : 4;
if (playable.length < podSize) {
  process.stderr.write(`lane ${cfg.laneIndex}: only ${playable.length} playable decks\n`);
  process.exit(1);
}
const pilotBuilder = cfg.pilotFile ? await loadPilotBuilder(cfg.pilotFile, cfg.mode) : null;
const seatNames = engineSeatsFor(cfg.mode);

let played = 0;
for (let i = cfg.laneIndex; cfg.maxGames == null || played < cfg.maxGames; i += cfg.laneCount) {
  const gameSeed = gameSeedAt(cfg.baseSeed, i);
  const pod = formPod(playable, podSize, gameSeed);
  let pilots = {};
  try { if (pilotBuilder) pilots = pilotBuilder(pod) || {}; } catch (e) { process.stderr.write(`lane ${cfg.laneIndex} pilot build ${i}: ${e?.message || e}\n`); }
  const identity = Object.fromEntries(Object.entries(pilots).map(([s, p]) => [s, { playbook: p?.playbook ?? null, temperament: p?.temperament ?? null, pilotType: p?.pilotType ?? null }]));
  let game;
  try {
    game = runSelfPlayGame(podToArgs(pod, cfg.mode, pilots, gameSeed));
  } catch (e) {
    process.stderr.write(`lane ${cfg.laneIndex} game ${i} error: ${e?.message || e}\n`);
    continue;
  }
  const seatDecks = pod.map((d, si) => ({ seat: seatNames[si] ?? `seat${si}`, id: d?.id ?? null, name: d?.name ?? null }));
  const record = {
    header: {
      seed: gameSeed, pilots: identity, decks: seatDecks, engineVersion: cfg.engineVersion ?? null,
      result: game?.result ?? null, winnerSeat: game?.winnerSeat ?? null, turns: game?.turns ?? null, mode: cfg.mode, mulliganPolicyV: game?.mulliganPolicyV ?? null,
    },
    rows: game?.decisionTrajectory?.rows ?? [],
  };
  process.stdout.write(JSON.stringify({ i, trusted: (game?.trainingWeight ?? 0) > 0, record }) + "\n");
  played += 1;
}
process.stdout.write(JSON.stringify({ done: true, lane: cfg.laneIndex, games: played }) + "\n");
