/**
 * grindLoop.js — the continuous "GRIND BUTTON" loop (run-until-cancel). Press → plays games back-to-back in
 * random balanced pods with the selected persona, appending one file PER GAME to the data-lifecycle store the
 * whole time, until the user CANCELS (finishes the in-flight game, never a hard-kill) or the disk cap is hit.
 *
 * Runs as a MODULE-LEVEL SINGLETON in the persistent Next server: startGrind fires the loop (NOT awaited);
 * requestGrindCancel sets a flag the loop checks at each GAME BOUNDARY; grindStatus is polled by the panel.
 * The loop `await`s a macrotask between games so the event loop can service the cancel/status routes.
 *
 * Scheduler: a built-in seeded random-balanced pod former (deterministic per baseSeed; avoids repeating the exact
 * previous pod). Omnath's `overnight-schedule.mjs makeScheduler().nextGame()` is a drop-in refinement (pod-freshness
 * guarantee) — swap `formPod` for it once it's bundled/dropped; the loop shape is identical.
 */

import { readFile } from "node:fs/promises";

import { runSelfPlayGame, resolveBaseSeed, engineSeatsForMode } from "./selfPlayRunner.js";
import { appendGame } from "./gameLogStore.js";
import { formPod, podToArgs, gameSeedAt } from "./grindPod.js";

// One grind at a time (a persistent-server singleton). Serializable-plain so grindStatus() can be JSON'd to the panel.
let state = freshState();
function freshState() {
  return { running: false, cancelRequested: false, gamesPlayed: 0, gamesTrusted: 0, gamesStuck: 0, startedAt: null, lastResult: null, capReached: false, error: null, totalBytes: 0, capBytes: null };
}

export function grindStatus() {
  return { ...state, uptimeMs: state.startedAt ? Date.now() - state.startedAt : 0 };
}

/** Request a graceful stop — the loop finishes the CURRENT game, appends it, then exits (CR-safe, no torn game). */
export function requestGrindCancel() {
  if (state.running) state.cancelRequested = true;
  return grindStatus();
}

let cachedVersion = null;
async function engineVersion() {
  if (cachedVersion) return cachedVersion;
  try {
    cachedVersion = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8")).version;
  } catch {
    cachedVersion = "unknown";
  }
  return cachedVersion;
}

// Pod-forming/seed math lives in grindPod.js — SHARED with the pool workers
// (scripts/grind-worker.mjs) so both grind flavors play the identical sequence.

/**
 * Start the grind. `decks` = enriched RUNNER decks (toRunnerDeck), `pilots` = the seat→persona map (from
 * buildPilotsForBatch), `capBytes` = the disk budget (default 100GB via the store). Fire-and-forget: returns
 * immediately with { started }, the loop runs in the background until cancel/cap. Refuses a second concurrent grind.
 */
export async function startGrind({ decks, mode = "commander", pilotBuilder = null, capBytes = null, seed = "auto" } = {}) {
  if (state.running) return { started: false, reason: "a grind is already running", ...grindStatus() };
  const podSize = mode === "commander" ? 4 : 2;
  if (!Array.isArray(decks) || decks.length < podSize) {
    return { started: false, reason: `need at least ${podSize} playable decks for ${mode}` };
  }
  state = { ...freshState(), running: true, startedAt: Date.now(), capBytes };
  loop({ decks, mode, pilotBuilder, capBytes, seed, podSize }).catch((e) => {
    state.error = e?.message || String(e);
    state.running = false;
  });
  return { started: true, ...grindStatus() };
}

async function loop({ decks, mode, pilotBuilder, capBytes, seed, podSize }) {
  const base = resolveBaseSeed(seed);
  const version = await engineVersion();
  const seatNames = engineSeatsForMode(mode); // seat order matches pod order (pod[0]=user, pod[1]=ai1, …)
  let i = 0;
  while (!state.cancelRequested) {
    const gameSeed = gameSeedAt(base, i);
    const pod = formPod(decks, podSize, gameSeed);
    // Per-GAME pilots: hand the persona THIS pod's decks (seat order) so buildPilots can pick each seat's
    // DECK-NATIVE playbook (Omnath v2). v1 ignores decks → a temperament spread + default playbook (still varied,
    // still tagged). A builder throw never kills the grind — fall back to default autopilot for this game.
    let pilots = {};
    try { if (pilotBuilder) pilots = pilotBuilder(pod) || {}; } catch (e) { state.error = `pilot build ${i}: ${e?.message || e}`; }
    const identity = Object.fromEntries(Object.entries(pilots).map(([s, p]) => [s, { playbook: p?.playbook ?? null, temperament: p?.temperament ?? null, pilotType: p?.pilotType ?? null }]));
    let game;
    try {
      game = runSelfPlayGame(podToArgs(pod, mode, pilots, gameSeed));
    } catch (e) {
      // A single engine error never kills the grind — log it, skip the game, keep going.
      state.error = `game ${i} error: ${e?.message || e}`;
      i += 1;
      await macrotask();
      continue;
    }
    // Record which DECK sat at each seat (seat order = pod order) so the results view can attribute
    // wins + participation per deck — winnerSeat alone can't say which deck won.
    const seatDecks = pod.map((d, si) => ({ seat: seatNames[si] ?? `seat${si}`, id: d?.id ?? null, name: d?.name ?? null }));
    const record = {
      header: { seed: gameSeed, pilots: identity, decks: seatDecks, engineVersion: version, result: game?.result ?? null, winnerSeat: game?.winnerSeat ?? null, turns: game?.turns ?? null, mode, mulliganPolicyV: game?.mulliganPolicyV ?? null },
      rows: game?.decisionTrajectory?.rows ?? [],
    };
    const appended = await appendGame(record, { capBytes });
    if (appended.capReached) { state.capReached = true; break; } // 100GB cap → pause cleanly (the in-flight game was NOT written)
    if (appended.rejected) {
      // Malformed record refused by the store — surface it, skip the counters, keep grinding.
      state.error = `game ${i} rejected by store: ${appended.reason}`;
      i += 1;
      await macrotask();
      continue;
    }
    state.gamesPlayed += 1;
    if ((game?.trainingWeight ?? 0) > 0) state.gamesTrusted += 1;
    const res = game?.result ?? null;
    if (!["user-wins", "ai-wins", "draw"].includes(res)) state.gamesStuck += 1; // non-decisive → triage-indexed by the store
    state.lastResult = res;
    state.totalBytes = appended.totalBytes;
    i += 1;
    await macrotask(); // yield so the event loop can service the cancel/status routes between games
  }
  state.running = false;
}

const macrotask = () => new Promise((r) => setImmediate(r));
