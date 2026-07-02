#!/usr/bin/env node
/**
 * self-play.mjs — headless self-play stress-test runner (no UI, no server).
 *
 * Runs the existing Expert auto-pilot over the user's saved decks entirely offline,
 * mines each game's state.log for the engine's HONEST breakage signals, and writes
 * a human-readable .txt breakage report (the same one /api/self-play returns).
 *
 * USAGE:
 *   # Sweep ALL decks across ALL profiles (the 13-deck training set spans two):
 *   MTG_APP_ROOT=<appdata-root> node app/scripts/self-play.mjs
 *
 *   # On Windows PowerShell:
 *   $env:MTG_APP_ROOT="C:/Users/<you>/AppData/Roaming/com.colton.mtg-tool"; node app/scripts/self-play.mjs
 *
 *   Flags:
 *     --mode=commander|standard   default commander (the 13 decks are commander)
 *     --ids=id1,id2,...           restrict to specific deck ids (default: all found)
 *     --out=<path>                explicit .txt output path (default: <appRoot>/data/self-play/...)
 *     --max=N                     cap the number of decks (e.g. --max=4 for a quick smoke)
 *     --games-per=N               repeat each pairing N times (distinct seeds → varied games)
 *     --no-time-pressure          disable the opt-in "game clock" (recovers old draw-at-cap;
 *                                 default is ON so stalling games end decisively W/L)
 *
 * MTG_APP_ROOT must point at a data root that has BOTH the profiles (decks) AND the
 * bundled scryfall-bulk/oracle-index.json (so cards enrich locally — zero network).
 * In a dev worktree that's the installed app-data dir, e.g.
 * %APPDATA%/com.colton.mtg-tool. The engine never calls the network at runtime, so
 * the whole sweep is fully offline.
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { appRoot } from "../src/lib/server/paths.js";
import { loadAllProfileDecks, toRunnerDeck } from "../src/lib/server/selfPlayDecks.js";
import { runSelfPlayBatch } from "../src/lib/learn/selfPlayRunner.js";
import { aggregateBreakages, formatBreakageTxt } from "../src/lib/learn/breakageReport.js";

function parseArgs(argv) {
  const args = { mode: "commander", ids: null, out: null, max: null, gamesPer: 1, timePressure: true };
  for (const a of argv) {
    if (a.startsWith("--mode=")) args.mode = a.slice(7) === "standard" ? "standard" : "commander";
    else if (a.startsWith("--ids=")) args.ids = a.slice(6).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith("--out=")) args.out = a.slice(6);
    else if (a.startsWith("--max=")) args.max = Math.max(1, parseInt(a.slice(6), 10) || 0) || null;
    else if (a.startsWith("--games-per=")) args.gamesPer = Math.max(1, parseInt(a.slice(12), 10) || 1);
    else if (a === "--no-time-pressure") args.timePressure = false; // recover the old draw-at-cap behavior
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.MTG_APP_ROOT) {
    console.warn(
      "[self-play] MTG_APP_ROOT is not set — falling back to cwd. " +
      "Set it to your app-data root (with profiles/ AND scryfall-bulk/oracle-index.json) " +
      "so real decks load and cards enrich. Continuing anyway."
    );
  }

  console.log(`[self-play] app root: ${appRoot()}`);
  console.log(`[self-play] loading decks across all profiles…`);

  let allDecks = await loadAllProfileDecks();
  if (allDecks.length === 0) {
    console.error("[self-play] No decks found. Is MTG_APP_ROOT pointing at a data root with profiles/?");
    process.exit(1);
  }

  if (args.ids) {
    const want = new Set(args.ids);
    allDecks = allDecks.filter((d) => want.has(d.id));
  }
  if (args.max) allDecks = allDecks.slice(0, args.max);

  console.log(`[self-play] ${allDecks.length} deck(s): ${allDecks.map((d) => d.name).join(", ")}`);
  console.log(`[self-play] mode: ${args.mode}; enriching from local oracle index…`);

  let runnerDecks = allDecks.map(toRunnerDeck);
  // EMPTY-DECK GUARD (overhaul pass): an empty/unenrichable deck ("Test Deck", a failed import)
  // seeded 4-player pods that could only setup-error — 2 of 3 pods in a 10-deck sweep died on it.
  // Skip such decks up front with an honest warning; explicitly-requested --ids are NOT exempt
  // (an empty deck can never play a game either way).
  const empty = runnerDecks.filter((d) => d.cards.length === 0);
  for (const d of empty) console.warn(`[self-play]   SKIPPING ${d.name}: 0 mainboard cards (empty or unenrichable deck)`);
  runnerDecks = runnerDecks.filter((d) => d.cards.length > 0);
  // Honest sanity line: how many cards actually enriched (got a type) per deck.
  for (const d of runnerDecks) {
    const enriched = d.cards.filter((c) => c.type && String(c.type).length).length;
    console.log(`[self-play]   ${d.name}: ${enriched}/${d.cards.length} mainboard cards enriched`);
  }

  const t0 = Date.now();
  console.log(`[self-play] running self-play batch…`);
  // Time pressure is ON by default for batches (decisive endings → clean W/L training
  // labels). Pass --no-time-pressure to recover the old draw-at-cap behavior.
  const batch = runSelfPlayBatch(runnerDecks, { mode: args.mode, gamesPer: args.gamesPer, timePressure: args.timePressure });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[self-play] ${batch.games.length} game(s) completed in ${elapsed}s`);

  // Outcome distribution — the headline metric for the stalemate fix. A decisive game
  // (user-wins/ai-wins) is a clean training label; a `timeout` is honestly excluded
  // (trainingWeight 0); a real `draw` is a legitimate 0.5. Print the breakdown + rates so
  // a before/after (clock off vs on) shows the draw/timeout collapse into decisive W/L.
  const dist = {};
  for (const g of batch.games) dist[g.result] = (dist[g.result] || 0) + 1;
  const n = batch.games.length || 1;
  const pct = (k) => `${(((dist[k] || 0) / n) * 100).toFixed(1)}%`;
  const decisive = (dist["user-wins"] || 0) + (dist["ai-wins"] || 0);
  console.log(`[self-play] outcome distribution (time pressure ${args.timePressure ? "ON" : "OFF"}):`);
  for (const k of Object.keys(dist).sort()) console.log(`[self-play]   ${k}: ${dist[k]} (${pct(k)})`);
  console.log(`[self-play]   → decisive (W/L): ${decisive}/${batch.games.length} (${pct("user-wins")} + ${pct("ai-wins")} = ${((decisive / n) * 100).toFixed(1)}%)`);
  console.log(`[self-play]   → draw: ${pct("draw")} · timeout: ${pct("timeout")}`);

  const aggregate = aggregateBreakages(batch.games);
  const generatedAt = new Date().toISOString();
  const report = formatBreakageTxt(aggregate, {
    deckNames: runnerDecks.map((d) => d.name),
    mode: args.mode,
    generatedAt,
  });

  // Write the .txt.
  const safeTs = generatedAt.replace(/:/g, "-").replace(/\..+Z$/, "Z");
  const outPath = args.out
    ? path.resolve(args.out)
    : path.join(appRoot(), "data", "self-play", `self-play-${safeTs}.txt`);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const tmp = `${outPath}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, report, "utf8");
  await fs.rename(tmp, outPath);

  console.log(`[self-play] report written: ${outPath}`);
  console.log("");
  console.log("───────── REPORT (first 30 lines) ─────────");
  console.log(report.split("\n").slice(0, 30).join("\n"));
  console.log("───────────────────────────────────────────");
}

main().catch((err) => {
  console.error("[self-play] FAILED:", err?.stack || err?.message || err);
  process.exit(1);
});
