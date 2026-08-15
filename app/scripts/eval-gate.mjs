/**
 * eval-gate.mjs — THE QUARTET PHASE-1 GOLDFISH GATE (SUBSYSTEM-QUARTET-PLAN.md).
 *
 * A/B: for each seed, form the SAME pod and run the game twice — BASELINE (usePolicyEval null,
 * byte-identical legacy play) and TREATMENT (usePolicyEval = [one treated seat], rotating with the
 * seed index so every seat position is treated equally often). Score: how often the treated seat WINS
 * in each arm. The evaluator earns its default only if the treated seat's win count is higher with
 * the flag than without, over the same seeds, with zero game errors.
 *
 *   MTG_APP_ROOT=<root> node scripts/eval-gate.mjs [--games=100] [--base-seed=987001] [--mode=commander]
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
const u = (p) => pathToFileURL(path.join(process.cwd(), p)).href;

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const games = Number(argv.games) || 100;
const baseSeed = Number(argv["base-seed"]) || 987001;
const mode = argv.mode === "standard" ? "standard" : "commander";
const diagnose = !!argv.diagnose;

const { loadAllProfileDecks, toRunnerDeck, partitionPlayableRunnerDecks } = await import(u("src/lib/server/selfPlayDecks.js"));
const { runSelfPlayGame } = await import(u("src/lib/learn/selfPlayRunner.js"));
const { formPod, podToArgs, gameSeedAt, engineSeatsFor } = await import(u("src/lib/learn/grindPod.js"));

const deckStore = await loadAllProfileDecks();
const { playable } = partitionPlayableRunnerDecks(deckStore.map(toRunnerDeck));
const podSize = mode === "standard" ? 2 : 4;
if (playable.length < podSize) { console.error(`only ${playable.length} playable decks`); process.exit(1); }
const seats = engineSeatsFor(mode);

let treatedWinsOn = 0, treatedWinsOff = 0, errors = 0, done = 0, diverged = 0;
const firstDivergence = {}; // kind -> { count, onWon, offWon } over diverged games (--diagnose)
const t0 = Date.now();
for (let i = 0; i < games; i++) {
  const gameSeed = gameSeedAt(baseSeed, i);
  const pod = formPod(playable, podSize, gameSeed);
  const treatedSeat = seats[i % seats.length];
  const args = podToArgs(pod, mode, {}, gameSeed);
  let off, on;
  try {
    off = runSelfPlayGame({ ...args, ...(diagnose ? { recordDecisions: true } : {}) });
    on = runSelfPlayGame({ ...args, usePolicyEval: [treatedSeat], ...(diagnose ? { recordDecisions: true } : {}) });
  } catch (e) {
    errors += 1;
    console.error(`seed ${i}: ${e?.message || e}`);
    continue;
  }
  if (off?.result === "setup-error" || on?.result === "setup-error") { errors += 1; continue; }
  // HOLLOW-GATE GUARD: the arms must provably differ somewhere — identical games in every seed would
  // mean the flag never reached a choice site and the whole gate is vacuous.
  const gameDiverged = off?.winnerSeat !== on?.winnerSeat || off?.turns !== on?.turns || off?.ticks !== on?.ticks;
  if (gameDiverged) diverged += 1;
  // PHASE-2 DIAGNOSTIC: the treated seat's FIRST differing decision names the choice class that forked
  // the game; correlate it with who won each arm. Uses the EXISTING rows-v3 trajectory (no new spine).
  if (diagnose && gameDiverged) {
    const rowsOf = (g) => (g?.decisionTrajectory?.rows || []).filter((r) => r.seat === treatedSeat);
    const a = rowsOf(off), b = rowsOf(on);
    let fork = null;
    for (let k = 0; k < Math.min(a.length, b.length); k++) {
      if (JSON.stringify(a[k]?.action) !== JSON.stringify(b[k]?.action)) { fork = b[k]; break; }
    }
    const kind = fork ? (fork.action?.kind || "unknown") + "@t" + (fork.turn ?? "?") : "no-fork-found";
    const key = fork ? (fork.action?.kind || "unknown") : "no-fork-found";
    firstDivergence[key] = firstDivergence[key] || { count: 0, onWon: 0, offWon: 0, sampleTurns: [] };
    firstDivergence[key].count += 1;
    if (on?.winnerSeat === treatedSeat) firstDivergence[key].onWon += 1;
    if (off?.winnerSeat === treatedSeat) firstDivergence[key].offWon += 1;
    if (firstDivergence[key].sampleTurns.length < 5 && fork) firstDivergence[key].sampleTurns.push(fork.turn ?? null);
    void kind;
  }
  if (off?.winnerSeat === treatedSeat) treatedWinsOff += 1;
  if (on?.winnerSeat === treatedSeat) treatedWinsOn += 1;
  done += 1;
  if (done % 10 === 0) console.log(`[${done}/${games}] treated-seat wins: flag-on ${treatedWinsOn} vs flag-off ${treatedWinsOff} (errors ${errors}, ${(Date.now() - t0) / 1000 | 0}s)`);
}
if (diagnose) console.log("FIRST-DIVERGENCE BY KIND:", JSON.stringify(firstDivergence, null, 1));
console.log(JSON.stringify({ games: done, errors, diverged, treatedWinsOn, treatedWinsOff,
  // A real margin, not noise: +1 over a handful of divergent games proves nothing (the 2026-08-14
  // first run: 27 vs 26 with 17 diverged — numerically positive, statistically vacuous). Require the
  // win delta to clear max(3, 20% of the divergent games) before the default may flip.
  verdict: errors === 0 && (treatedWinsOn - treatedWinsOff) >= Math.max(3, Math.ceil(0.2 * diverged)) ? "GATE PASSED" : "GATE NOT PASSED (no real margin)" }, null, 2));
