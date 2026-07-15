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
    why: freshWhy(), // honest per-seat aggregates that EXPLAIN the delta in plain English; whyOf() reduces it, stripped from status
  };
}

// WHY accumulators — read straight off each paired game's seatStats/winCondition (epochStats.js). Every
// rate carries its own ELIGIBLE denominator: a game whose instrumentation is absent (seatStats null, or a
// screw/flood flag still null before the seat's 5th own turn) simply doesn't count, so a percentage is
// never fabricated over games that couldn't produce the signal. This is the CREED honesty bar for the "why".
function freshWhy() {
  return {
    turnsBase: 0, turnsVar: 0, turnsN: 0,                // avg game length, base vs variant
    rankBase: 0, rankVar: 0, rankN: 0,                   // avg target finishRank (1 = won, higher = worse)
    screwBase: 0, screwVar: 0, screwElig: 0,             // mana-screw rate over eligible games
    floodBase: 0, floodVar: 0, floodElig: 0,             // flood rate over eligible games
    cmdrOnlineBase: 0, cmdrOnlineVar: 0, cmdrOnlineN: 0,  // how often the commander came online at all
    winMix: {},                                          // winCondition tally over the flipped-to-win games
  };
}

// Fold one paired game into the WHY accumulator for the TARGET seat. Pure reads off the two game results
// (seatStats/turns/winCondition); anything absent is skipped, never guessed. `d` = varWon - baseWon.
function accumulateWhy(w, seat, baseGame, varGame, d) {
  if (Number.isFinite(baseGame?.turns) && Number.isFinite(varGame?.turns)) {
    w.turnsBase += baseGame.turns; w.turnsVar += varGame.turns; w.turnsN += 1;
  }
  const b = baseGame?.seatStats?.[seat];
  const v = varGame?.seatStats?.[seat];
  if (b && v) {
    if (Number.isFinite(b.finishRank) && Number.isFinite(v.finishRank)) {
      w.rankBase += b.finishRank; w.rankVar += v.finishRank; w.rankN += 1;
    }
    const bs = b.manaHealth?.screw, vs = v.manaHealth?.screw;      // only when BOTH games have a real flag
    if (bs != null && vs != null) { w.screwElig += 1; if (bs) w.screwBase += 1; if (vs) w.screwVar += 1; }
    const bf = b.manaHealth?.flood, vf = v.manaHealth?.flood;
    if (bf != null && vf != null) { w.floodElig += 1; if (bf) w.floodBase += 1; if (vf) w.floodVar += 1; }
    w.cmdrOnlineN += 1;
    if (b.manaHealth?.commanderOnlineTurn != null) w.cmdrOnlineBase += 1;
    if (v.manaHealth?.commanderOnlineTurn != null) w.cmdrOnlineVar += 1;
  }
  if (d > 0 && varGame?.winCondition) w.winMix[varGame.winCondition] = (w.winMix[varGame.winCondition] || 0) + 1;
}

// Reduce the accumulator to reportable shifts (base vs variant), each null when no game produced it.
function whyOf(s) {
  const w = s.why;
  return {
    avgTurns: w.turnsN ? { base: w.turnsBase / w.turnsN, var: w.turnsVar / w.turnsN, n: w.turnsN } : null,
    avgRank: w.rankN ? { base: w.rankBase / w.rankN, var: w.rankVar / w.rankN } : null,
    screwRate: w.screwElig ? { base: w.screwBase / w.screwElig, var: w.screwVar / w.screwElig, n: w.screwElig } : null,
    floodRate: w.floodElig ? { base: w.floodBase / w.floodElig, var: w.floodVar / w.floodElig, n: w.floodElig } : null,
    cmdrOnlineRate: w.cmdrOnlineN ? { base: w.cmdrOnlineBase / w.cmdrOnlineN, var: w.cmdrOnlineVar / w.cmdrOnlineN, n: w.cmdrOnlineN } : null,
    winMix: w.winMix,
  };
}

const WIN_LABEL = { combat: "combat", "commander-damage": "commander damage", burn: "burn", damage: "damage", poison: "poison", decking: "decking", "win-game-effect": "a win-the-game effect", combo: "combo", clock: "the turn clock", draw: "a draw" };

/**
 * Plain-English "why" — turns the whyOf() shifts into honest sentences a player can read. Exported + pure so
 * it's unit-testable and the modal just renders the strings. A fact appears ONLY when it's over a real sample
 * (n≥10 for rates) AND it actually moved (≥4 points for rates, ≥0.5 turns) — so the "why" never narrates noise.
 */
export function abBenchWhySentences(status) {
  const w = status?.why;
  if (!w) return [];
  const name = status?.targetName || "The deck";
  const pctS = (x) => `${Math.round(100 * x)}%`;
  const pts = (a, b) => Math.round(100 * Math.abs(a - b));
  // A rate claim shows ONLY over a real sample (n≥30), a real move (≥5 points), AND a real count shift
  // (≥3 games actually differed) — so a 1-game wobble on a short run is never narrated as a cause (CREED).
  const rateShows = (r) => r && r.n >= 30 && pts(r.base, r.var) >= 5 && Math.abs(r.base - r.var) * r.n >= 3;
  const out = [];
  if (rateShows(w.screwRate)) {
    const less = w.screwRate.var < w.screwRate.base;
    out.push(`${name} hit mana screw ${less ? "less" : "more"} often — ${pctS(w.screwRate.var)} of games vs ${pctS(w.screwRate.base)} before.`);
  }
  if (rateShows(w.floodRate)) {
    const less = w.floodRate.var < w.floodRate.base;
    out.push(`It flooded ${less ? "less" : "more"} — ${pctS(w.floodRate.var)} of games vs ${pctS(w.floodRate.base)}.`);
  }
  if (rateShows(w.cmdrOnlineRate)) {
    const more = w.cmdrOnlineRate.var > w.cmdrOnlineRate.base;
    out.push(`Its commander came online ${more ? "more" : "less"} reliably — ${pctS(w.cmdrOnlineRate.var)} of games vs ${pctS(w.cmdrOnlineRate.base)}.`);
  }
  if (w.avgTurns && w.avgTurns.n >= 20 && Math.abs(w.avgTurns.base - w.avgTurns.var) >= 0.5) {
    const faster = w.avgTurns.var < w.avgTurns.base;
    out.push(`Games ran ${Math.abs(w.avgTurns.base - w.avgTurns.var).toFixed(1)} turns ${faster ? "shorter" : "longer"} on average.`);
  }
  const mix = Object.entries(w.winMix || {}).sort((a, b) => b[1] - a[1]);
  if (mix.length && (status.flipToWin || 0) > 0) {
    const parts = mix.slice(0, 3).map(([k, c]) => `${WIN_LABEL[k] || k} (${c})`);
    out.push(`The ${status.flipToWin} games that flipped to wins closed on ${parts.join(", ")}.`);
  }
  return out;
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
  const { diffs: _diffs, why: _why, ...rest } = state;
  const status = {
    ...rest,
    done: !state.running && state.finishedAt != null,
    elapsedMs: state.startedAt ? (state.finishedAt ?? Date.now()) - state.startedAt : 0,
    ...deltaOf(state),
    why: whyOf(state),
  };
  // Build the plain-English "why" HERE (server-side) so the client renders plain strings and never has to
  // import this module (which pulls in the engine). The sentence list rides along in the status payload.
  status.whySentences = abBenchWhySentences(status);
  return status;
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
    accumulateWhy(state.why, targetSeat, baseGame, varGame, d);
    state.played += 1;
    await macrotask();
  }
  state.running = false;
  state.finishedAt = Date.now();
}

/** Test-only reset. */
export function _resetAbBenchForTests() { state = freshState(); }
