/**
 * build-grind-card-evidence.mjs — EPOCH-2 item 3: the cast × outcome attribution table
 * (the first deck-advice product; also the grind-side feed for the corpus blend re-ranking).
 *
 *   MTG_APP_ROOT=<root> node scripts/build-grind-card-evidence.mjs [--out=<path>] [--min-casts=5]
 *
 * Scans the grind store's RAW game files (rows carry every cast-spell action; headers carry the
 * honest labels) and aggregates per card name:
 *   gamesCast            — games in which the card was cast at least once
 *   castsTotal           — total cast events
 *   winRateWhenCast      — caster-seat win rate over DECISIVE schema≥2 games (honest winners only)
 *   avgFinishRankWhenCast — mean caster finishRank over schema≥3 games (1 = won the pod)
 * Pre-schema-2 games contribute casts/gamesCast only (their winners are fabricated — excluded
 * from both outcome columns). Pruned games are skipped (headers alone can't attribute casts).
 * Output: grind-card-evidence.json at the grind root (or --out).
 */

import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

const { grindRoot, readGameFile, loadGrindManifest } = await import(pathToFileURL(path.join(process.cwd(), "src/lib/learn/gameLogStore.js")).href);

const DECISIVE = new Set(["user-wins", "ai-wins", "draw"]);
const manifest = await loadGrindManifest();
const byCard = new Map(); // name -> { gamesCast, castsTotal, outcomeGames, outcomeWins, rankGames, rankSum }
let scanned = 0, skipped = 0;

for (let index = 0; index < manifest.nextIndex; index++) {
  const game = await readGameFile(index).catch(() => null);
  if (!game) { skipped += 1; continue; } // pruned or missing raw — headers can't attribute casts
  scanned += 1;
  const h = game.header || {};
  const honest = (h.schemaVersion ?? 1) >= 2 && DECISIVE.has(h.result);
  const perSeatCards = new Map(); // seat -> Set(cardName) cast this game
  for (const row of game.rows || []) {
    const a = row?.action;
    if (!a || a.kind !== "cast-spell" || !a.name) continue;
    if (!perSeatCards.has(row.seat)) perSeatCards.set(row.seat, new Set());
    perSeatCards.get(row.seat).add(a.name);
    const rec = byCard.get(a.name) || { gamesCast: 0, castsTotal: 0, outcomeGames: 0, outcomeWins: 0, rankGames: 0, rankSum: 0 };
    rec.castsTotal += 1;
    byCard.set(a.name, rec);
  }
  for (const [seat, names] of perSeatCards) {
    for (const name of names) {
      const rec = byCard.get(name);
      rec.gamesCast += 1;
      if (honest) {
        rec.outcomeGames += 1;
        if (h.winnerSeat === seat) rec.outcomeWins += 1;
        const rank = h.seatStats?.[seat]?.finishRank;
        if (Number.isFinite(rank)) { rec.rankGames += 1; rec.rankSum += rank; }
      }
    }
  }
}

const minCasts = Number(argv["min-casts"]) || 5;
const table = [...byCard.entries()]
  .map(([name, r]) => ({
    name,
    gamesCast: r.gamesCast,
    castsTotal: r.castsTotal,
    winRateWhenCast: r.outcomeGames ? r.outcomeWins / r.outcomeGames : null,
    outcomeGames: r.outcomeGames,
    avgFinishRankWhenCast: r.rankGames ? r.rankSum / r.rankGames : null,
    rankGames: r.rankGames,
  }))
  .filter((r) => r.gamesCast >= minCasts)
  .sort((a, b) => b.gamesCast - a.gamesCast);

const out = argv.out || path.join(grindRoot(), "grind-card-evidence.json");
fs.writeFileSync(out, JSON.stringify({
  builtAt: new Date().toISOString(),
  gamesScanned: scanned,
  gamesSkipped: skipped,
  minCasts,
  note: "winRateWhenCast/avgFinishRank over honest games only (schemaVersion>=2 decisive; ranks schemaVersion>=3). Casts from pruned games are not attributable.",
  cards: table,
}, null, 1));
console.log(`grind-card-evidence: ${table.length} cards (>=${minCasts} casts) from ${scanned} games (${skipped} pruned/missing) -> ${out}`);
