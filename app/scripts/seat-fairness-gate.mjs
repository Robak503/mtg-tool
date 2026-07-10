/**
 * seat-fairness-gate.mjs — SIM-INTEGRITY Phase 0's permanent tripwire: seat fairness must
 * never regress silently again. MIRRORED pod (the IDENTICAL deck in all four seats, default
 * autopilot — deck skill cancels perfectly, only POSITION remains) over N seeded games; the
 * max deviation of any seat's win share from 25% must stay inside the threshold.
 *
 *   MTG_APP_ROOT=<root> node scripts/seat-fairness-gate.mjs [--games=200] [--threshold=6]
 *     [--deck-id=<id>]   (default: the first playable mixed-pool deck)
 *
 * Run at every re-anchor event / before blessing a new data era. The pre-FFA engine would
 * have failed this at +27pts (ai1 crowned 52% on a fair field); the fix's 40-game probe sat
 * within noise — this is the N≥200 statistical version.
 */

import { pathToFileURL } from "node:url";
import path from "node:path";

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

const u = (rel) => pathToFileURL(path.join(process.cwd(), rel)).href;
const { loadAllProfileDecks, toRunnerDeck, partitionPlayableRunnerDecks } = await import(u("src/lib/server/selfPlayDecks.js"));
const { runSelfPlayGame } = await import(u("src/lib/learn/selfPlayRunner.js"));
const { gameSeedAt } = await import(u("src/lib/learn/seedMath.js"));

const games = Number(argv.games) || 200;
const threshold = (Number(argv.threshold) || 6) / 100;

const { playable } = partitionPlayableRunnerDecks((await loadAllProfileDecks()).map(toRunnerDeck));
const deck = argv["deck-id"] ? playable.find((d) => d.id === argv["deck-id"]) : playable.find((d) => (d.pool ?? "mixed") === "mixed");
if (!deck) { console.error("no playable deck found"); process.exit(2); }
console.log(`mirrored pod: 4× "${deck.name}" · ${games} games · threshold ±${(threshold * 100).toFixed(0)}pts`);

const wins = { user: 0, ai1: 0, ai2: 0, ai3: 0 };
let decisive = 0, other = 0;
const t0 = Date.now();
for (let i = 0; i < games; i++) {
  const g = runSelfPlayGame({
    deckA: deck.cards, opponentDecks: [deck.cards, deck.cards, deck.cards],
    userCommanders: deck.commanders, opponentCommanders: [deck.commanders, deck.commanders, deck.commanders],
    userCompanion: deck.companion, opponentCompanions: [deck.companion, deck.companion, deck.companion],
    mode: "commander", seed: gameSeedAt(1337, i), timePressure: true, mulligan: true,
  });
  if (g.winnerSeat && (g.result === "user-wins" || g.result === "ai-wins")) { wins[g.winnerSeat] = (wins[g.winnerSeat] || 0) + 1; decisive += 1; }
  else other += 1;
  if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${games} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

console.log(`decisive: ${decisive} · non-decisive: ${other}`);
let worst = 0, worstSeat = null;
for (const [seat, w] of Object.entries(wins)) {
  const share = decisive ? w / decisive : 0;
  const dev = Math.abs(share - 0.25);
  console.log(`  ${seat}: ${w} wins = ${(share * 100).toFixed(1)}% (dev ${(dev * 100).toFixed(1)}pts)`);
  if (dev > worst) { worst = dev; worstSeat = seat; }
}
if (decisive < games * 0.5) {
  console.error(`GATE INCONCLUSIVE — only ${decisive} decisive games (mirrored pods may stall each other; try a different deck)`);
  process.exit(2);
}
if (worst > threshold) {
  console.error(`GATE FAIL — ${worstSeat} deviates ${(worst * 100).toFixed(1)}pts from 25% (threshold ${(threshold * 100).toFixed(0)}pts). Seat fairness regressed.`);
  process.exit(1);
}
console.log(`GATE PASS — max seat deviation ${(worst * 100).toFixed(1)}pts ≤ ${(threshold * 100).toFixed(0)}pts.`);
