/**
 * abBench.js — the A/B card bench's PAIRED run. Given a fixed pod and a legal swap on ONE deck (the
 * variant built by cardSwap.buildSwappedDeck), run the pod BOTH ways on the SAME seeds: baseline (original
 * decks) and variant (the swapped deck dropped into the SAME seat). Same seed → same shuffle → the two
 * games share the longest prefix and only diverge once the swapped card first changes a decision.
 *
 * Why paired: the target deck's raw win rate swings on seat + draw luck. Running the identical seeds both
 * ways cancels that luck game-for-game, so the per-game DIFFERENCE (won-with-variant minus won-with-baseline,
 * each ∈ {-1,0,+1}) isolates the swap. delta = mean(diff); the confidence band = delta ± 1.96·SE(diff), so
 * the reader can tell a real move from noise. HONEST: once the swap changes a play the game reshapes, so this
 * measures "same start, how the swap changes the finish" — not a card-for-card whole-game isolation.
 *
 * Runs FIRE-AND-FORGET on the persistent server (like the grind), yielding each game so the app stays
 * responsive; abBenchStatus() carries progress + the running delta for the modal to poll. One run at a time.
 */

import { runSelfPlayGame, resolveBaseSeed, engineSeatsForMode } from "./selfPlayRunner.js";
import { formPod, podToArgs, gameSeedAt } from "./grindPod.js";

const macrotask = () => new Promise((r) => setImmediate(r));

let state = freshState();
function freshState() {
  return {
    running: false, cancelRequested: false, target: 0, played: 0, startedAt: null, finishedAt: null,
    swap: null, targetName: null, error: null,
    baseWins: 0, varWins: 0, flipToWin: 0, flipToLoss: 0,
    diffs: [], // per-game (varWon - baseWon) ∈ {-1,0,1}; kept for the paired SE, stripped from status
  };
}

/** Live win-rate delta for the target deck + a paired 95% confidence band. */
function deltaOf(s) {
  const n = s.played;
  if (!n) return { baseWinRate: 0, varWinRate: 0, delta: 0, ci: [0, 0], n: 0 };
  const baseWinRate = s.baseWins / n;
  const varWinRate = s.varWins / n;
  const delta = varWinRate - baseWinRate; // = mean of the per-game diffs
  const variance = s.diffs.reduce((acc, d) => acc + (d - delta) ** 2, 0) / Math.max(1, n - 1);
  const se = Math.sqrt(variance / n);
  return { baseWinRate, varWinRate, delta, ci: [delta - 1.96 * se, delta + 1.96 * se], n };
}

export function abBenchStatus() {
  const { diffs: _diffs, ...rest } = state;
  return {
    ...rest,
    done: !state.running && state.finishedAt != null,
    elapsedMs: state.startedAt ? (state.finishedAt ?? Date.now()) - state.startedAt : 0,
    ...deltaOf(state),
  };
}

export function requestAbBenchCancel() {
  if (state.running) state.cancelRequested = true;
  return abBenchStatus();
}

/**
 * Kick off the paired run (fire-and-forget). `decks` = the pod's original runner decks; `variantDeck` =
 * buildSwappedDeck's output for the target; `targetId` = which deck the swap is on; `swap` = {removed, added}.
 */
export function startAbBench({ decks, targetId, variantDeck, swap = null, mode = "commander", games = 100, seed = "auto" } = {}) {
  if (state.running) return { started: false, reason: "an A/B run is already going" };
  const podSize = mode === "commander" ? 4 : 2;
  if (!Array.isArray(decks) || decks.length !== podSize) return { started: false, reason: `A/B needs exactly ${podSize} decks (got ${decks?.length ?? 0})` };
  if (!variantDeck || !targetId) return { started: false, reason: "no variant/target to bench" };
  const target = Math.min(2000, Math.max(1, Math.floor(Number(games)) || 100));
  const targetName = decks.find((d) => d?.id === targetId)?.name ?? null;
  state = { ...freshState(), running: true, startedAt: Date.now(), target, swap, targetName };
  loop({ decks, targetId, variantDeck, mode, target, seed, podSize }).catch((e) => {
    state.error = e?.message || String(e);
    state.running = false;
    state.finishedAt = Date.now();
  });
  return { started: true, ...abBenchStatus() };
}

async function loop({ decks, targetId, variantDeck, mode, target, seed, podSize }) {
  const base = resolveBaseSeed(seed);
  const seats = engineSeatsForMode(mode);
  for (let i = 0; i < target && !state.cancelRequested; i++) {
    const gameSeed = gameSeedAt(base, i);
    // Form the pod ONCE for the baseline, then substitute the variant into the SAME seat — so the two
    // games are identical but for the one deck's one card (never re-form the pod for the variant, which
    // could re-seat it and break the pairing).
    const pod = formPod(decks, podSize, gameSeed);
    const targetSeatIdx = pod.findIndex((d) => d?.id === targetId);
    if (targetSeatIdx < 0) { state.error = "target deck fell out of the pod"; break; }
    const targetSeat = seats[targetSeatIdx];
    const varPod = pod.map((d) => (d?.id === targetId ? variantDeck : d));

    let baseGame, varGame;
    try {
      baseGame = runSelfPlayGame(podToArgs(pod, mode, {}, gameSeed));
      await macrotask(); // yield between the two ~0.7s games so a run never blocks the app in >1s chunks
      varGame = runSelfPlayGame(podToArgs(varPod, mode, {}, gameSeed));
    } catch (e) {
      state.error = `game ${i}: ${e?.message || e}`;
      await macrotask();
      continue; // a single engine error never kills the run
    }

    const baseWon = baseGame?.winnerSeat === targetSeat ? 1 : 0;
    const varWon = varGame?.winnerSeat === targetSeat ? 1 : 0;
    state.baseWins += baseWon;
    state.varWins += varWon;
    const d = varWon - baseWon;
    state.diffs.push(d);
    if (d > 0) state.flipToWin += 1;
    else if (d < 0) state.flipToLoss += 1;
    state.played += 1;
    await macrotask();
  }
  state.running = false;
  state.finishedAt = Date.now();
}

/** Test-only reset. */
export function _resetAbBenchForTests() { state = freshState(); }
