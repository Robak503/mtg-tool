/**
 * crucibleRun.js — the bounded "Crucible pod" power-read (run-until-N, non-blocking).
 *
 * SIBLING of grindLoop.js — it does NOT touch the ∞ grind or the on-disk store. Where the
 * grind runs forever and writes a file PER GAME (~50/min, IO-bound), a Crucible pod plays a
 * FIXED N games over ONE 4-deck pod entirely IN MEMORY, yielding a macrotask between games so
 * the Tauri window stays live. That's the ~360/min path measured in the order — the fast read.
 *
 * Fairness: formPod re-seeds a shuffle each game, so the SAME four decks rotate through all
 * four seats across the run (deck↔seat bias averages out); on-the-play also rotates via the
 * per-game seed. Placement is read off epochStats.seatStats[seat].finishRank (1 = won, 4 = first
 * out), attributed to each deck by pod position (pod[k] sits at engineSeatsForMode(mode)[k]).
 *
 * Runs as a MODULE-LEVEL SINGLETON in the persistent Next server: startCrucibleRun fires the
 * loop (NOT awaited); crucibleStatus() is polled by the live modal; crucibleResults() returns
 * the final power ranking. requestCrucibleCancel() stops at the next game boundary.
 *
 * CREED: every number here traces to a real game result — finish ranks, win conditions, turns.
 * A non-decisive game (engine-stuck) is counted honestly as non-decisive, never coerced to a
 * win/loss/draw. Banking (spool → export) is a SEPARATE concern added on top (bank/discard).
 */

import { runSelfPlayGame, resolveBaseSeed, engineSeatsForMode } from "./selfPlayRunner.js";
import { formPod, podToArgs, gameSeedAt } from "./grindPod.js";
import { aggregateBreakages } from "./breakageReport.js";

const DECISIVE = new Set(["user-wins", "ai-wins"]); // a real winner; "draw" is decisive-but-winnerless (≈0 in practice)
const RECENT_CAP = 12; // live synopsis ring buffer shown streaming in the modal
const CHUNK = 1; // yield every game (a single commander game is ~170ms — plenty of UI breathing room)

let state = freshState();
function freshState() {
  return {
    running: false,
    cancelRequested: false,
    target: 0,
    played: 0,
    decisive: 0,
    stuck: 0,
    startedAt: null,
    finishedAt: null,
    mode: "commander",
    pool: "mixed",
    pilot: null,
    error: null,
    // ── live aggregates (constant-ish memory: per-deck rows + running sums, no game retention) ──
    standings: new Map(), // deckKey → { id, name, games, wins, finishSum, finish:[0,0,0,0], winCons:{} }
    turnsSum: 0,
    killTurnSum: 0,
    killTurnN: 0,
    lastResult: null,
    recent: [], // ring buffer of the last RECENT_CAP one-line synopses
    breakageEntries: [], // real per-card breakage log entries (rare — most games are clean native)
    perGame: [], // lightweight per-game rows for the leaderboard's per-game log
  };
}

/** A deck's stable key for the standings map (id first, name fallback). */
function deckKey(d) {
  return d?.id || d?.name || "unknown";
}

/** One-line synopsis of a finished game (who won, how, how long) — the streaming feed line. */
function synopsis(game) {
  const turn = Number.isFinite(game.turns) ? `turn ${game.turns}` : "—";
  if (DECISIVE.has(game.result)) {
    const who = game.winnerName || game.winnerSeat || "A deck";
    return `${who} won by ${game.winCondition || "damage"} (${turn})`;
  }
  if (game.result === "draw") return `Draw — no winner (${turn})`;
  return `No result — ${game.result || "unknown"} (${turn})`;
}

/** Fold one finished game into the running aggregates. Pure bookkeeping over real fields. */
function foldGame(game, pod, seats) {
  state.played += 1;
  state.lastResult = game.result ?? null;
  if (Number.isFinite(game.turns)) state.turnsSum += game.turns;
  const decisive = DECISIVE.has(game.result);
  if (decisive) state.decisive += 1;
  else if (game.result !== "draw") state.stuck += 1;

  // First-elimination turn (kill-turn) — the earliest non-null eliminatedAtTurn across seats.
  let killTurn = null;
  const seatStats = game.seatStats || {};
  for (const s of seats) {
    const t = seatStats[s]?.eliminatedAtTurn;
    if (Number.isFinite(t)) killTurn = killTurn == null ? t : Math.min(killTurn, t);
  }
  if (killTurn != null) { state.killTurnSum += killTurn; state.killTurnN += 1; }

  // Per-deck placement + wins, attributed by pod position (pod[k] ↔ seats[k]).
  const order = new Array(pod.length); // finishRank → deck name, for the per-game log
  pod.forEach((deck, k) => {
    const seat = seats[k];
    const rank = seatStats[seat]?.finishRank;
    const key = deckKey(deck);
    let rec = state.standings.get(key);
    if (!rec) { rec = { id: deck?.id ?? null, name: deck?.name || key, games: 0, wins: 0, finishSum: 0, finish: [0, 0, 0, 0], winCons: {} }; state.standings.set(key, rec); }
    rec.games += 1;
    if (Number.isFinite(rank)) {
      rec.finishSum += rank;
      if (rank >= 1 && rank <= 4) rec.finish[rank - 1] += 1;
      order[rank - 1] = deck?.name || key;
    }
    if (decisive && game.winnerSeat === seat) {
      rec.wins += 1;
      const wc = game.winCondition || "damage";
      rec.winCons[wc] = (rec.winCons[wc] || 0) + 1;
    }
  });

  // Streaming synopsis (ring buffer) + lightweight per-game row for the log.
  const line = synopsis(game);
  state.recent.push(line);
  if (state.recent.length > RECENT_CAP) state.recent.shift();
  state.perGame.push({ i: state.perGame.length, result: game.result ?? null, winner: game.winnerName ?? null, winCon: game.winCondition ?? null, turns: game.turns ?? null, order: order.filter(Boolean) });

  // Mine real breakage log entries (unmodeled/broken cards) — rare; fed to aggregateBreakages at results time.
  const log = Array.isArray(game.log) ? game.log : [];
  for (const e of log) {
    if (e?.kind === "spell-unresolved" || e?.kind === "stack-resolve-error" || e?.kind === "trigger-removed-no-target") {
      state.breakageEntries.push(e);
    }
  }
}

const macrotask = () => new Promise((r) => setImmediate(r));

/**
 * Start a bounded Crucible pod. `decks` = exactly `podSize` enriched runner decks; `target` =
 * how many games to play; `pilotBuilder` = the per-game seat→pilot builder (loadPilotBuilder),
 * or null for the default autopilot. Fire-and-forget — returns { started } immediately; the loop
 * runs in the background until it hits `target` or is cancelled. Refuses a second concurrent run.
 */
export function startCrucibleRun({ decks, mode = "commander", target = 100, pilotBuilder = null, pilot = null, seed = "auto", pool = "mixed" } = {}) {
  if (state.running) return { started: false, reason: "a Crucible run is already going", ...crucibleStatus() };
  const podSize = mode === "commander" ? 4 : 2;
  const runnerDecks = Array.isArray(decks) ? decks : [];
  if (runnerDecks.length < podSize) return { started: false, reason: `need ${podSize} decks for a ${mode} pod (got ${runnerDecks.length})` };
  const N = Math.max(1, Math.floor(target) || 1);

  state = { ...freshState(), running: true, target: N, mode, pool, pilot, startedAt: Date.now() };
  loop({ decks: runnerDecks.slice(0, podSize), mode, target: N, pilotBuilder, seed, podSize }).catch((e) => {
    state.error = e?.message || String(e);
    state.running = false;
    state.finishedAt = Date.now();
  });
  return { started: true, ...crucibleStatus() };
}

async function loop({ decks, mode, target, pilotBuilder, seed, podSize }) {
  const base = resolveBaseSeed(seed);
  const seats = engineSeatsForMode(mode);
  let i = 0;
  while (!state.cancelRequested && state.played < target) {
    const gameSeed = gameSeedAt(base, i);
    const pod = formPod(decks, podSize, gameSeed);
    let pilots = {};
    try { if (pilotBuilder) pilots = pilotBuilder(pod, gameSeed) || {}; } catch (e) { state.error = `pilot build ${i}: ${e?.message || e}`; }
    const meta = { mode, seatNames: pod.map((d) => d?.name || d?.id || "Unknown deck"), seed: gameSeed };
    let game;
    try {
      game = runSelfPlayGame({ ...podToArgs(pod, mode, pilots, gameSeed), meta });
    } catch (e) {
      // A single engine throw never kills the run — count it honestly as stuck, keep going.
      state.stuck += 1; state.played += 1; state.error = `game ${i}: ${e?.message || e}`;
      i += 1; if (i % CHUNK === 0) await macrotask(); continue;
    }
    foldGame(game, pod, seats);
    i += 1;
    if (i % CHUNK === 0) await macrotask(); // yield so status/cancel routes are serviced
  }
  state.running = false;
  state.finishedAt = Date.now();
}

/** Request a graceful stop — the loop exits at the next game boundary. */
export function requestCrucibleCancel() {
  if (state.running) state.cancelRequested = true;
  return crucibleStatus();
}

/** Live snapshot for the modal's poll — progress + the four glass-tile averages + the stream. */
export function crucibleStatus() {
  const elapsedMs = state.startedAt ? (state.finishedAt ?? Date.now()) - state.startedAt : 0;
  const played = state.played;
  return {
    running: state.running,
    done: !state.running && state.finishedAt != null,
    target: state.target,
    played,
    mode: state.mode,
    pilot: state.pilot,
    lastResult: state.lastResult,
    error: state.error,
    elapsedMs,
    tiles: {
      turnsPerGame: played ? state.turnsSum / played : 0,
      gamesPerMin: elapsedMs > 0 ? (played / (elapsedMs / 60000)) : 0,
      cleanFinishPct: played ? (100 * (played - state.stuck) / played) : 0, // engine-health (draws≈0), NOT draws
      avgKillTurn: state.killTurnN ? state.killTurnSum / state.killTurnN : 0,
    },
    recent: [...state.recent],
  };
}

/**
 * The final power ranking + supporting data for the results screens. Standings sorted by BEST
 * AVERAGE FINISH (ascending — 1.0 is a deck that always wins); the podium is the top 4 of that,
 * and mostWins is called out SEPARATELY because best-average ≠ most-wins (Colton's explicit ask).
 * Breakages fold through aggregateBreakages so the "unmodeled cards" box only renders when non-empty.
 */
export function crucibleResults() {
  const rows = [...state.standings.values()].map((r) => {
    const topWinCon = Object.entries(r.winCons).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return {
      id: r.id,
      name: r.name,
      games: r.games,
      wins: r.wins,
      winRate: r.games ? r.wins / r.games : 0,
      avgFinish: r.games ? r.finishSum / r.games : null,
      finish: r.finish.slice(), // [1st,2nd,3rd,4th] counts
      topWinCon,
    };
  });
  // Rank by average finish (asc); a null avgFinish (no ranked games) sorts last.
  rows.sort((a, b) => (a.avgFinish ?? 99) - (b.avgFinish ?? 99) || b.winRate - a.winRate);
  const mostWins = rows.reduce((best, r) => (best == null || r.wins > best.wins ? r : best), null);
  const breakages = aggregateBreakages(state.breakageEntries.length ? [{ log: state.breakageEntries }] : []);

  return {
    mode: state.mode,
    pilot: state.pilot,
    target: state.target,
    played: state.played,
    decisive: state.decisive,
    stuck: state.stuck,
    tiles: crucibleStatus().tiles,
    podium: rows.slice(0, 4), // 1st → 4th by avg finish
    standings: rows, // full leaderboard, same order
    mostWins: mostWins ? { name: mostWins.name, id: mostWins.id, wins: mostWins.wins, winRate: mostWins.winRate } : null,
    perGame: state.perGame, // lightweight per-game finish log
    breakages: breakages.cards, // [] when clean → the box does not render
    // highlights: filled by highlightsMiner (C1 follow-on)
  };
}

/** Reset to idle (used by tests + a fresh session). Never called mid-run. */
export function _resetCrucibleForTests() {
  state = freshState();
}
