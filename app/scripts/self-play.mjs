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
 *     --seed=N|auto               batch base seed (HB-4). Default 1 — deterministic, a bare
 *                                 rerun reproduces byte-identically. A number = that seed
 *                                 (echoed + stamped per game so banked duplicates are
 *                                 detectable); "auto" = a fresh crypto-derived sweep seed.
 *     --no-mulligan               disable the AI London mulligan (AI-F9 — default ON for
 *                                 batches so 0-land/7-land dealt hands are shipped, not kept)
 *     --rotate-seats              HB-5: rotate deck→seat assignment across the batch so
 *                                 pilot/deck/seat de-confound (recorded on meta.seatRotation)
 *     --pod-shuffle               HB-6: re-deal deck→pod composition each cycle (seed-derived)
 *                                 so cross-chunk matchups get sampled
 *     --pilot=<path>              PILOT INJECTION (Omnath sim-center seam): load a pilot module and
 *                                 route its persona decide() into every seat, so self-play is no
 *                                 longer persona-blind. The module exports EITHER buildPilots(seats,
 *                                 {mode}) → { [seat]: {decide,playbook,temperament} } (per-seat
 *                                 personas) OR a bare decide (+ optional decideMulligan/playbook/
 *                                 temperament) applied to all seats. Combine with --export-trajectories
 *                                 to persist the pilot-tagged decision rows. See scripts/pilots/
 *                                 example-pilot.mjs for the reference template + full contract. Omnath's
 *                                 real personas live in external omnath-tools/pilots/ modules.
 *     --no-time-pressure          disable the opt-in "game clock" (recovers old draw-at-cap;
 *                                 default is ON so stalling games end decisively W/L)
 *     --export-trajectories=<path>  ENGINE→BRAIN DATA HOOK (Omnath seam, P3): also record every
 *                                 decision and write one JSONL line per game —
 *                                 schema "omnath-trajectory-v1", tagged by pilot identity and
 *                                 TRUST-GATED by the runner's honest trainingWeight (timeout/
 *                                 non-completion = 0, never a fabricated label) — so self-play
 *                                 feeds the Omnath case store without scraping engine internals.
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
import { pathToFileURL } from "node:url";

import { appRoot } from "../src/lib/server/paths.js";
import { loadAllProfileDecks, toRunnerDeck } from "../src/lib/server/selfPlayDecks.js";
import { runSelfPlayBatch, resolveBaseSeed, summarizeSeatOutcomes, engineSeatsForMode } from "../src/lib/learn/selfPlayRunner.js";
import { aggregateBreakages, formatBreakageTxt } from "../src/lib/learn/breakageReport.js";
import { engineBuild } from "../src/lib/learn/engineBuild.js";

function parseArgs(argv) {
  const args = { mode: "commander", ids: null, out: null, max: null, gamesPer: 1, timePressure: true, exportTrajectories: null, seed: null, mulligan: true, rotateSeats: false, podShuffle: false, pilot: null };
  for (const a of argv) {
    if (a.startsWith("--mode=")) args.mode = a.slice(7) === "standard" ? "standard" : "commander";
    else if (a.startsWith("--ids=")) args.ids = a.slice(6).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith("--out=")) args.out = a.slice(6);
    else if (a.startsWith("--max=")) args.max = Math.max(1, parseInt(a.slice(6), 10) || 0) || null;
    else if (a.startsWith("--games-per=")) args.gamesPer = Math.max(1, parseInt(a.slice(12), 10) || 1);
    else if (a === "--no-time-pressure") args.timePressure = false; // recover the old draw-at-cap behavior
    else if (a.startsWith("--export-trajectories=")) args.exportTrajectories = a.slice(22);
    else if (a.startsWith("--seed=")) args.seed = a.slice(7); // HB-4: N | "auto" (resolved below)
    else if (a === "--no-mulligan") args.mulligan = false; // AI-F9 opt-out (recovers keep-every-7)
    else if (a === "--rotate-seats") args.rotateSeats = true; // HB-5 deck↔seat de-confound
    else if (a === "--pod-shuffle") args.podShuffle = true; // HB-6 cross-chunk pod sampling
    else if (a.startsWith("--pilot=")) args.pilot = a.slice(8); // PILOT: path to a pilot module (persona injection)
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

  // PILOT INJECTION (Omnath sim-center seam): --pilot=<path> loads an external pilot module and routes
  // its persona decide() into each engine seat, so self-play is no longer persona-blind and the exported
  // decision rows carry the pilot's {playbook,temperament} identity (recordDecision stamps pilotIdentity
  // per row). Without --pilot, `pilots` stays {} → every seat plays the default autopilot (unchanged).
  // The module may export either buildPilots(seats,{mode}) → per-seat map, OR a bare decide (+ optional
  // decideMulligan/playbook/temperament) applied to every seat. A pilot's decide that returns undefined /
  // out-of-set defers to the default pick (selfPlayRunner), so a persona can never inject an illegal move.
  let pilots = {};
  if (args.pilot) {
    const seats = engineSeatsForMode(args.mode);
    const mod = await import(pathToFileURL(path.resolve(args.pilot)).href);
    if (typeof mod.buildPilots === "function") {
      pilots = mod.buildPilots(seats, { mode: args.mode }) || {};
    } else if (typeof mod.decide === "function") {
      const p = {
        decide: mod.decide,
        decideMulligan: typeof mod.decideMulligan === "function" ? mod.decideMulligan : undefined,
        playbook: mod.playbook ?? null,
        temperament: mod.temperament ?? null,
      };
      for (const s of seats) pilots[s] = p;
    } else {
      console.error(`[self-play] --pilot module ${args.pilot} exports neither buildPilots(seats,{mode}) nor a decide function.`);
      process.exit(1);
    }
    const tags = seats.map((s) => `${s}:${pilots[s]?.playbook ?? "default"}/${pilots[s]?.temperament ?? "-"}`).join(", ");
    console.log(`[self-play] pilot injected from ${args.pilot} → ${tags}`);
    if (!args.exportTrajectories) console.log("[self-play]   (note: pass --export-trajectories=<path> to persist the pilot-tagged decision rows)");
  }

  const t0 = Date.now();
  // HB-4: resolve the batch base seed. Default 1 (deterministic — a bare rerun
  // reproduces byte-identically); an explicit number is normalized (>>>0) so the
  // echoed value is the effective one; "auto" mints a fresh non-Date sweep seed.
  const baseSeed = resolveBaseSeed(args.seed);
  console.log(`[self-play] running self-play batch… (baseSeed ${baseSeed}${args.seed === "auto" ? " — auto" : ""}, mulligan ${args.mulligan ? "ON" : "OFF"}${args.rotateSeats ? ", rotate-seats" : ""}${args.podShuffle ? ", pod-shuffle" : ""})`);
  // Time pressure is ON by default for batches (decisive endings → clean W/L training
  // labels). Pass --no-time-pressure to recover the old draw-at-cap behavior.
  const batch = runSelfPlayBatch(runnerDecks, {
    mode: args.mode,
    gamesPer: args.gamesPer,
    baseSeed,
    timePressure: args.timePressure,
    mulligan: args.mulligan, // AI-F9: default ON (ship unkeepable 7s); --no-mulligan opts out
    rotateSeats: args.rotateSeats, // HB-5 (opt-in)
    podShuffle: args.podShuffle, // HB-6 (opt-in)
    pilots, // PILOT: {} (default autopilot) or the seat→persona map from --pilot; the runner routes + tags per row
    recordDecisions: !!args.exportTrajectories, // the export needs the per-decision rows
  });
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

  // HB-7: per-seat / per-deck / on-the-play win tables — the measurement that makes a
  // turn-order-position bias (the "ai1 concentration" question) visible. Wilson 95% CIs;
  // without --rotate-seats, seat and deck are CONFOUNDED (the tables then differ only by label).
  const seatSummary = summarizeSeatOutcomes(batch.games);
  const fmtRow = (k, e) => `[self-play]   ${k.padEnd(28)} ${String(e.wins).padStart(3)}/${String(e.games).padEnd(4)} ${(e.winRate * 100).toFixed(1).padStart(5)}%  CI95 [${(e.ci95.lo * 100).toFixed(1)}%, ${(e.ci95.hi * 100).toFixed(1)}%]`;
  console.log(`[self-play] win rates by TURN-ORDER seat position (${seatSummary.decisiveGames}/${seatSummary.games} decisive${args.rotateSeats ? "" : "; seat↔deck confounded — pass --rotate-seats to de-confound"}):`);
  for (const [k, e] of Object.entries(seatSummary.bySeat)) console.log(fmtRow(k, e));
  console.log(`[self-play] win rates by DECK:`);
  for (const [k, e] of Object.entries(seatSummary.byDeck)) console.log(fmtRow(k, e));
  console.log(fmtRow("on-the-play", seatSummary.onThePlay));

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

  // ENGINE→BRAIN DATA HOOK (omnath-trajectory-v1): one JSONL line per game. TAGGED (pilot identity
  // rides every row from the recorder) + TRUST-GATED (trainingWeight is the runner's HONEST label —
  // 0 for timeout/error/non-completion, so the brain's distiller can hard-filter untrusted games
  // without re-deriving trust). Atomic write (tmp+rename). The schema is part of the Omnath seam
  // contract (docs/orchestration/PLAY-API-CONTRACT.md §4) — additive changes only within v1.
  if (args.exportTrajectories) {
    // REPLAY-ON-DEMAND HEADER (Omnath trajectory-contract, additive within v1): each game line self-describes
    // its ENGINE VERSION + PILOT-MAP + SEED so a decision's full reasoning is regenerable by replaying from the
    // seed with debug on (no per-row reasoning stored). seed is already in `meta.seed` + top-level `baseSeed`;
    // add engineVersion (the app version that produced the game) + a {seat:{playbook,temperament}} identity map
    // (batch-constant; the pilot is seat-keyed even under --rotate-seats). Empty pilots map ⇒ default autopilot.
    const engineVersion = engineBuild(); // the build stamp (git describe) — package.json's version is never bumped in-repo
    const pilotHeader = Object.fromEntries(
      Object.entries(pilots).map(([s, p]) => [s, { playbook: p?.playbook ?? null, temperament: p?.temperament ?? null }]),
    );
    const lines = batch.games.map((g) => JSON.stringify({
      schema: "omnath-trajectory-v1",
      generatedAt,
      engineVersion, // REPLAY: pins the engine that produced this game (deterministic replay is version-sensitive)
      mode: args.mode,
      baseSeed, // HB-4 (additive within v1): the batch base — with meta.seed, banked duplicates are detectable
      pilots: pilotHeader, // REPLAY: the {seat:{playbook,temperament}} identity map — with meta.seed, a game reconstructs
      result: g.result ?? null,
      winnerSeat: g.winnerSeat ?? null,
      onThePlay: g.onThePlay ?? null,
      turns: g.turns ?? null,
      trainingWeight: g.trainingWeight ?? 0,
      meta: g.meta ?? null,
      rows: g.decisionTrajectory?.rows ?? [],
    }));
    const exportPath = path.resolve(args.exportTrajectories);
    await fs.mkdir(path.dirname(exportPath), { recursive: true });
    const etmp = `${exportPath}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(etmp, lines.join("\n") + "\n", "utf8");
    await fs.rename(etmp, exportPath);
    const trusted = batch.games.filter((g) => (g.trainingWeight ?? 0) > 0).length;
    console.log(`[self-play] trajectories exported: ${exportPath} (${batch.games.length} games, ${trusted} trusted, ${batch.games.reduce((a, g) => a + (g.decisionTrajectory?.rows?.length || 0), 0)} rows)`);
  }
  console.log("");
  console.log("───────── REPORT (first 30 lines) ─────────");
  console.log(report.split("\n").slice(0, 30).join("\n"));
  console.log("───────────────────────────────────────────");
}

main().catch((err) => {
  console.error("[self-play] FAILED:", err?.stack || err?.message || err);
  process.exit(1);
});
