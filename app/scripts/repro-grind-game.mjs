/**
 * repro-grind-game.mjs — re-run ONE recorded grind game from its header (the stuck-triage
 * workflow: every non-decisive game lands in <grind>/stuck-triage.jsonl; this replays it).
 *
 *   MTG_APP_ROOT=<root> node scripts/repro-grind-game.mjs --index 4711
 *   MTG_APP_ROOT=<root> node scripts/repro-grind-game.mjs --line '<one headers.jsonl line>'
 *   optional: --pilot omnath.mjs   (rebuild personas via the pilot loader for the repro)
 *
 * EXACTNESS (honest): a game is a function of (seed, decks-in-seat-order, mode, pilots,
 * engineVersion). With --pilot matching the original persona file and the same engine
 * version, the repro is the original game. For default-autopilot games it is EXACT by
 * construction. If the engine has changed since the record, you are reproducing the
 * SCENARIO, not the bytes — which is exactly what stuck-triage needs (does it still stick?).
 */

import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};

const { loadAllProfileDecks, toRunnerDeck } = await import(pathToFileURL(path.join(process.cwd(), "src/lib/server/selfPlayDecks.js")).href);
const { runSelfPlayGame, engineSeatsForMode } = await import(pathToFileURL(path.join(process.cwd(), "src/lib/learn/selfPlayRunner.js")).href);
const { grindRoot } = await import(pathToFileURL(path.join(process.cwd(), "src/lib/learn/gameLogStore.js")).href);

// ── resolve the header ──
let header = null;
if (opt("line")) {
  header = JSON.parse(opt("line"));
} else if (opt("index") != null) {
  const index = Number(opt("index"));
  const shard = `shard-${String(Math.floor(index / 1000)).padStart(4, "0")}`;
  const txt = fs.readFileSync(path.join(grindRoot(), shard, "headers.jsonl"), "utf8");
  for (const line of txt.split("\n")) {
    if (!line.trim()) continue;
    const h = JSON.parse(line);
    if (h.index === index) { header = h; break; }
  }
  if (!header) throw new Error(`index ${index} not found in ${shard}/headers.jsonl`);
} else {
  console.error("usage: --index <n> | --line '<headers.jsonl line>'  [--pilot <file.mjs>]");
  process.exit(2);
}
if (!Array.isArray(header.decks) || !header.decks.length) {
  throw new Error("header has no decks[] (pre-v0.124 record) — cannot rebuild the pod");
}

// ── rebuild the pod in seat order ──
const all = await loadAllProfileDecks();
const bySeat = new Map(header.decks.map((d) => [d.seat, d]));
const seats = engineSeatsForMode(header.mode || "commander");
const pod = seats.map((seat) => {
  const want = bySeat.get(seat);
  if (!want) throw new Error(`header.decks missing seat ${seat}`);
  const deck = all.find((x) => x.id === want.id) || all.find((x) => x.name === want.name);
  if (!deck) throw new Error(`deck ${want.id || want.name} not on the shelf — restore it first`);
  return toRunnerDeck(deck);
});

// ── pilots (optional) ──
let pilots = {};
if (opt("pilot")) {
  const { loadPilotBuilder } = await import(pathToFileURL(path.join(process.cwd(), "src/lib/server/pilotLoader.js")).href);
  const build = await loadPilotBuilder(opt("pilot"), header.mode || "commander");
  // Pass the RECORDED game seed: pilotV>=3 personas derive temperaments from it, so a seed-less
  // rebuild would assign different temperaments than the original game (a silent repro mismatch).
  if (build) pilots = build(pod, header.seed, { flags: [] }) || {};
}

// ── re-run ──
const [userDeck, ...opp] = pod;
console.log(`repro: index=${header.index ?? "?"} seed=${header.seed} mode=${header.mode} — original: ${header.result} (turn ${header.turns})`);
const game = runSelfPlayGame({
  deckA: userDeck?.cards || [],
  opponentDecks: opp.map((d) => d?.cards || []),
  userCommanders: userDeck?.commanders || [],
  opponentCommanders: opp.map((d) => d?.commanders || []),
  userCompanion: userDeck?.companion || null,
  opponentCompanions: opp.map((d) => d?.companion || null),
  mode: header.mode || "commander",
  seed: header.seed,
  timePressure: true,
  pilots,
  recordDecisions: true,
  mulligan: true,
});
console.log(`now:   ${game.result} (turn ${game.turns})${game.error ? ` error=${game.error}` : ""}`);
console.log(game.result === header.result ? "MATCH — still reproduces" : "DIFFERENT — behavior changed since the record (engine fix or pilot mismatch)");
