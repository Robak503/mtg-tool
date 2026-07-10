/**
 * swap-bench.mjs — PAIRED-SEED pilot A/B bench (Omnath's axis-2 primary instrument, blocker b).
 *
 * For each pair i: the SAME seed + SAME pod play twice — game A with every seat piloted by the
 * BASELINE pack, game B identical except ONE seat (rotating i % podSize so no position is favored)
 * swaps to the CANDIDATE pack. The paired finishRank delta for the swapped seat (B − A; negative =
 * the candidate finishes better) is the promotion metric, reported with a 95% CI so ~500 pairs can
 * detect a ~0.15 rank shift. Win-share deltas ride along.
 *
 *   node scripts/swap-bench.mjs --baseline=<pilots/file.mjs|default> --candidate=<pilots/file.mjs>
 *       [--games=200] [--seed=20260711] [--mode=commander] [--ids=id1,id2,...] [--out=<path.json>]
 *
 * "default" (or omitting --baseline) = the shipping autopilot (no pilot injected).
 * DETERMINISM NOTE: the engine is deterministic; pairing removes pod/seed variance entirely. Until
 * the persona pack's temperament assignment is seed-derived (Omnath ASK-1), the NON-swapped seats
 * of game B can draw different temperaments than game A — that residual noise is UNBIASED (it can't
 * favor either pack) and shrinks with n; once seed-derived lands, pairs become exact.
 * Rows are NOT recorded (bench games are throwaway — nothing is written to the grind store).
 */
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

const APP = path.resolve(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "..");
const u = (rel) => pathToFileURL(path.join(APP, rel)).href;
const { loadAllProfileDecks, toRunnerDeck, partitionPlayableRunnerDecks, selectDecksByIds } = await import(u("src/lib/server/selfPlayDecks.js"));
const { loadPilotBuilder } = await import(u("src/lib/server/pilotLoader.js"));
const { runSelfPlayGame } = await import(u("src/lib/learn/selfPlayRunner.js"));
const { formPod, podToArgs, gameSeedAt, engineSeatsFor } = await import(u("src/lib/learn/grindPod.js"));

const arg = (name, dflt = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};

const mode = arg("mode", "commander");
const games = Math.max(1, parseInt(arg("games", "200"), 10) || 200);
const baseSeed = (parseInt(arg("seed", "20260711"), 10) || 20260711) >>> 0;
const outPath = arg("out", null);
const baselineFile = arg("baseline", "default");
const candidateFile = arg("candidate", null);
if (!candidateFile) { console.error("swap-bench: --candidate=<pilots/file.mjs> is required"); process.exit(1); }

const deckStore = (await loadAllProfileDecks()).map(toRunnerDeck);
const idsArg = arg("ids", null);
const raw = idsArg ? selectDecksByIds(deckStore, idsArg.split(",")) : deckStore;
const { playable } = partitionPlayableRunnerDecks(raw, mode);
const podSize = mode === "standard" ? 2 : 4;
if (playable.length < podSize) { console.error(`swap-bench: only ${playable.length} playable decks (< pod ${podSize})`); process.exit(1); }

const baseBuilder = baselineFile === "default" ? null : await loadPilotBuilder(baselineFile, mode);
const candBuilder = await loadPilotBuilder(candidateFile, mode);
const seatNames = engineSeatsFor(mode);

// A bench game never records rows and never touches the store — throwaway evidence games.
const gameArgs = (pod, pilots, seed) => ({ ...podToArgs(pod, mode, pilots, seed), recordDecisions: false });

const pairs = [];      // { i, seat, rankA, rankB, delta, winA, winB }
const perSeat = Object.fromEntries(seatNames.map((s) => [s, { n: 0, sumDelta: 0 }]));
let skipped = 0;
for (let i = 0; i < games; i++) {
  const seed = gameSeedAt(baseSeed, i);
  const pod = formPod(playable, podSize, seed);
  const swapSeat = seatNames[i % podSize];
  let pilotsA = {}, pilotsB = {};
  try { pilotsA = baseBuilder ? (baseBuilder(pod, seed) || {}) : {}; } catch { /* default autopilot */ }
  try {
    const cand = candBuilder(pod, seed) || {};
    pilotsB = { ...pilotsA, [swapSeat]: cand[swapSeat] };
    if (!pilotsB[swapSeat]) delete pilotsB[swapSeat]; // candidate pack has no pilot for this seat → default
  } catch { pilotsB = { ...pilotsA }; }
  let gA, gB;
  try {
    gA = runSelfPlayGame(gameArgs(pod, pilotsA, seed));
    gB = runSelfPlayGame(gameArgs(pod, pilotsB, seed));
  } catch { skipped++; continue; }
  const rankA = gA?.seatStats?.[swapSeat]?.finishRank ?? null;
  const rankB = gB?.seatStats?.[swapSeat]?.finishRank ?? null;
  if (rankA == null || rankB == null) { skipped++; continue; } // non-decisive/stuck halves carry no rank label
  const delta = rankB - rankA;
  pairs.push({ i, seat: swapSeat, rankA, rankB, delta, winA: gA.winnerSeat === swapSeat, winB: gB.winnerSeat === swapSeat });
  perSeat[swapSeat].n += 1;
  perSeat[swapSeat].sumDelta += delta;
  if ((i + 1) % 25 === 0) process.stderr.write(`pair ${i + 1}/${games}\n`);
}

const n = pairs.length;
const mean = n ? pairs.reduce((s, p) => s + p.delta, 0) / n : 0;
const sd = n > 1 ? Math.sqrt(pairs.reduce((s, p) => s + (p.delta - mean) ** 2, 0) / (n - 1)) : 0;
const ci95 = n ? 1.96 * sd / Math.sqrt(n) : 0;
const winA = pairs.filter((p) => p.winA).length, winB = pairs.filter((p) => p.winB).length;

const report = {
  baseline: baselineFile, candidate: candidateFile, mode, games, baseSeed,
  pairs: n, skipped,
  // rankDelta = candidate − baseline for the swapped seat: NEGATIVE means the candidate finishes better.
  rankDelta: { mean: +mean.toFixed(4), sd: +sd.toFixed(4), ci95: +ci95.toFixed(4), significant: Math.abs(mean) > ci95 },
  winShare: { baseline: n ? +(winA / n).toFixed(4) : null, candidate: n ? +(winB / n).toFixed(4) : null },
  perSeat: Object.fromEntries(Object.entries(perSeat).map(([s, v]) => [s, { pairs: v.n, meanDelta: v.n ? +(v.sumDelta / v.n).toFixed(4) : null }])),
};
if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`\nrankDelta ${report.rankDelta.mean} ± ${report.rankDelta.ci95} (95% CI, n=${n})` +
  ` → ${report.rankDelta.significant ? (mean < 0 ? "CANDIDATE BETTER" : "CANDIDATE WORSE") : "no significant difference"}`);
