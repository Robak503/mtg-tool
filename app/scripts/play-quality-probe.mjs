#!/usr/bin/env node
/**
 * play-quality-probe.mjs — seeded A/B play-quality probe for the opponent AI.
 *
 * Runs head-to-head self-play batches over the REAL profile decks where one side
 * ("OLD") pilots its seats through `pickAction(..., { policy })` with the LEGACY
 * ("v1") policy flags and the other side ("NEW") plays the shipping default.
 * Every opponent-AI play-quality change lands with before/after numbers from THIS
 * script — it replaces trajectory-hash anchoring as the evidence instrument
 * (the decisions change BY DESIGN; what must improve is measured play quality).
 *
 * The OLD side is injected through the runner's documented pilot seam
 * (runSelfPlayGame's `pilots` map → learnSession's resolveDecideAction), so every
 * pick is validated against the OFFERED legal set — a policy variant can never
 * inject an illegal action (THE CREED). The NEW side runs the default autopilot
 * (no pilot), i.e. exactly what the Academy and self-play ship.
 *
 * USAGE (PowerShell, from the repo root or app/):
 *   $env:MTG_APP_ROOT="C:/Users/colto/Documents/Claude/Projects/MTG-TOOL/app"
 *   node app/scripts/play-quality-probe.mjs [flags]
 *
 * MTG_APP_ROOT must point at a data root that has BOTH profiles/ (the real deck
 * set) AND scryfall-bulk/oracle-index.json (local enrichment — zero network).
 * The main dev tree's app/ satisfies both.
 *
 * Flags:
 *   --legacy=land,block,attack,xSizing | all
 *                        which policy subsystems the OLD side runs as "v1"
 *                        (default all). Use a single key to isolate one work item.
 *   --mode=standard|commander   default standard (clean 1v1 head-to-head)
 *   --pairing=mirror|cross      mirror = each deck vs itself (default; no deck-
 *                               strength confound). cross = adjacent-pair decks
 *                               (side-swap balances deck strength across the grid).
 *   --games=N            games per pairing (default 4; rounded UP to a multiple of
 *                        4 so the 2×2 {old-side × on-the-play} grid stays balanced)
 *   --max=N              cap the number of decks (default all)
 *   --seed=N             base seed (default 7); same seed ⇒ identical batch
 *   --mull               give the NEW side the AI mulligan heuristic
 *                        (opponentAI.decideMulliganForAI — opt-in A/B for W2)
 *   --no-time-pressure   disable the symmetric self-play "game clock"
 *   --json=<path>        also write the raw per-game metrics as JSON
 *   --self-test          plumbing check: runs one seeded game twice (default
 *                        autopilot vs pass-through pilots with NO legacy flags)
 *                        and asserts the decision streams are identical.
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { appRoot } from "../src/lib/server/paths.js";
import { loadAllProfileDecks, toRunnerDeck } from "../src/lib/server/selfPlayDecks.js";
import { runSelfPlayGame } from "../src/lib/learn/selfPlayRunner.js";
import * as opponentAI from "../src/lib/learn/opponentAI.js";

const LEGACY_KEYS = ["land", "block", "attack", "xSizing"];

function parseArgs(argv) {
  const args = {
    legacy: [...LEGACY_KEYS],
    mode: "standard",
    pairing: "mirror",
    games: 4,
    max: null,
    seed: 7,
    mull: false,
    timePressure: true,
    json: null,
    selfTest: false,
  };
  for (const a of argv) {
    if (a.startsWith("--legacy=")) {
      const v = a.slice(9).trim();
      args.legacy = v === "all" ? [...LEGACY_KEYS] : v.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a.startsWith("--mode=")) args.mode = a.slice(7) === "commander" ? "commander" : "standard";
    else if (a.startsWith("--pairing=")) args.pairing = a.slice(10) === "cross" ? "cross" : "mirror";
    else if (a.startsWith("--games=")) args.games = Math.max(1, parseInt(a.slice(8), 10) || 4);
    else if (a.startsWith("--max=")) args.max = Math.max(1, parseInt(a.slice(6), 10) || 0) || null;
    else if (a.startsWith("--seed=")) args.seed = (parseInt(a.slice(7), 10) || 7) >>> 0;
    else if (a === "--mull") args.mull = true;
    else if (a === "--no-time-pressure") args.timePressure = false;
    else if (a.startsWith("--json=")) args.json = a.slice(7);
    else if (a === "--self-test") args.selfTest = true;
  }
  // Keep the 2×2 {old-side × on-the-play} grid balanced.
  args.games = Math.ceil(args.games / 4) * 4;
  return args;
}

const SEATS = { standard: ["user", "ai"], commander: ["user", "ai1", "ai2", "ai3"] };

/**
 * Which seats play the OLD policy and who is on the play for game `idx` of a
 * pairing. Standard cycles the 2×2 grid {old-side × on-the-play} every 4 games so
 * neither side banks the position edge or (in cross pairings) the stronger deck.
 * Commander alternates the diagonal seat pair that plays OLD and rotates the lead.
 */
function sidesForGame(mode, idx) {
  const seats = SEATS[mode];
  if (mode === "standard") {
    const oldSeat = idx % 4 < 2 ? "user" : "ai";
    const startSeat = idx % 2 === 0 ? "user" : "ai";
    return { sideOf: { user: oldSeat === "user" ? "old" : "new", ai: oldSeat === "ai" ? "old" : "new" }, startSeat };
  }
  const oldPair = idx % 2 === 0 ? ["user", "ai2"] : ["ai1", "ai3"];
  const sideOf = {};
  for (const s of seats) sideOf[s] = oldPair.includes(s) ? "old" : "new";
  return { sideOf, startSeat: seats[idx % 4] };
}

/** Legacy-policy object for the OLD side from the --legacy key list. */
function legacyPolicyOf(keys) {
  const pol = {};
  for (const k of keys) pol[k] = "v1";
  return pol;
}

/**
 * Build the per-seat pilots map for one game. OLD seats decide via pickAction with
 * the legacy policy flags — a null/out-of-set return falls back to the default pick
 * inside resolveDecideAction, so an OLD pilot can never wedge or cheat a window it
 * doesn't understand. NEW seats run the default autopilot (no `decide`); with
 * --mull they additionally opt into the AI mulligan heuristic (W2 A/B).
 */
function pilotsFor(sideOf, legacyPolicy, mull) {
  const pilots = {};
  for (const [seat, side] of Object.entries(sideOf)) {
    if (side === "old") {
      pilots[seat] = {
        playbook: "probe-old",
        decide: ({ state, legalActions, seat: s }) =>
          opponentAI.pickAction(state, s, legalActions, { policy: legacyPolicy }) ?? undefined,
      };
    } else if (mull) {
      if (typeof opponentAI.decideMulliganForAI !== "function") {
        throw new Error("--mull requested but opponentAI.decideMulliganForAI is not exported yet (W2)");
      }
      pilots[seat] = { playbook: "probe-new", decideMulligan: (args) => opponentAI.decideMulliganForAI(args) };
    }
  }
  return pilots;
}

/** Deterministic per-game seed (same derivation idiom as runSelfPlayBatch). */
function seedFor(base, gameCounter) {
  return (base + Math.imul(gameCounter, 2654435761)) >>> 0;
}

/**
 * Deep-clone a runner deck with remapped card ids for MIRROR pairings — both
 * sides of a mirror must not share card ids (ids seed zone lookups and target
 * references; a collision would alias cards across seats).
 */
function cloneDeckWithSuffix(deck, suffix) {
  const remap = (c) => (c ? { ...c, id: `${c.id}${suffix}` } : c);
  return {
    ...deck,
    id: `${deck.id}${suffix}`,
    cards: (deck.cards || []).map(remap),
    commanders: (deck.commanders || []).map(remap),
    companion: remap(deck.companion || null),
  };
}

const DEAD_KINDS = new Set(["pass-priority", "play-land"]);

/**
 * Per-seat play-quality metrics for one finished game, mined from the recorded
 * decision trajectory (every pick, all windows) + the engine's own state.log
 * (creature-dies events). Attacker-vs-blocker death attribution joins the
 * creature-dies (turn, controller, cardName) against the names that seat declared
 * attacking/blocking that turn — name-level join (duplicates blur it slightly),
 * fine for aggregate A/B deltas.
 */
function analyzeGame(game) {
  const perSeat = {};
  const seatOf = (seat) => (perSeat[seat] ??= {
    activeTurnKinds: new Map(), // turn -> [action kinds] while this seat was the active player
    casts: 0,
    lands: 0,
    xValues: [],
    mulligans: 0,
    attacks: new Map(), // turn -> Set(creature names declared attacking)
    blocks: new Map(), // turn -> Set(creature names declared blocking)
    attackerDeaths: 0,
    blockerDeaths: 0,
    otherCombatDeaths: 0,
  });

  for (const row of game.decisionTrajectory?.rows || []) {
    const s = seatOf(row.seat);
    const kind = row.action?.kind || "";
    if (kind === "mulligan-ship") s.mulligans += 1;
    if (row.features?.is_active_player === 1) {
      const list = s.activeTurnKinds.get(row.turn) || [];
      list.push(kind);
      s.activeTurnKinds.set(row.turn, list);
    }
    if (kind === "cast-spell") {
      s.casts += 1;
      if (row.action.xValue != null) s.xValues.push(row.action.xValue);
    } else if (kind === "play-land") {
      s.lands += 1;
    } else if (kind === "declare-attacker") {
      if (!s.attacks.has(row.turn)) s.attacks.set(row.turn, new Set());
      s.attacks.get(row.turn).add(row.action.name);
    } else if (kind === "declare-blocker") {
      if (!s.blocks.has(row.turn)) s.blocks.set(row.turn, new Set());
      s.blocks.get(row.turn).add(row.action.name);
    }
  }

  for (const ev of game.log || []) {
    if (ev?.kind !== "creature-dies" || ev.cause !== "combat" || !perSeat[ev.controller]) continue;
    const s = perSeat[ev.controller];
    if (s.attacks.get(ev.turn)?.has(ev.cardName)) s.attackerDeaths += 1;
    else if (s.blocks.get(ev.turn)?.has(ev.cardName)) s.blockerDeaths += 1;
    else s.otherCombatDeaths += 1;
  }

  const out = {};
  for (const [seat, s] of Object.entries(perSeat)) {
    let dead = 0;
    for (const kinds of s.activeTurnKinds.values()) {
      if (kinds.length > 0 && kinds.every((k) => DEAD_KINDS.has(k))) dead += 1;
    }
    out[seat] = {
      deadTurns: dead,
      activeTurns: s.activeTurnKinds.size,
      casts: s.casts,
      lands: s.lands,
      xValues: s.xValues,
      mulligans: s.mulligans,
      attacksDeclared: [...s.attacks.values()].reduce((n, set) => n + set.size, 0),
      blocksDeclared: [...s.blocks.values()].reduce((n, set) => n + set.size, 0),
      attackerDeaths: s.attackerDeaths,
      blockerDeaths: s.blockerDeaths,
      otherCombatDeaths: s.otherCombatDeaths,
    };
  }
  return out;
}

function emptySide() {
  return {
    seatGames: 0, wins: 0, deadTurns: 0, activeTurns: 0, casts: 0, lands: 0,
    xCasts: 0, xSum: 0, mulligans: 0, attacksDeclared: 0, blocksDeclared: 0,
    attackerDeaths: 0, blockerDeaths: 0, otherCombatDeaths: 0,
  };
}

function foldSeatMetrics(side, m) {
  side.seatGames += 1;
  side.deadTurns += m.deadTurns;
  side.activeTurns += m.activeTurns;
  side.casts += m.casts;
  side.lands += m.lands;
  side.xCasts += m.xValues.length;
  side.xSum += m.xValues.reduce((a, b) => a + b, 0);
  side.mulligans += m.mulligans;
  side.attacksDeclared += m.attacksDeclared;
  side.blocksDeclared += m.blocksDeclared;
  side.attackerDeaths += m.attackerDeaths;
  side.blockerDeaths += m.blockerDeaths;
  side.otherCombatDeaths += m.otherCombatDeaths;
}

/** One head-to-head game via the runner's documented seams. */
function runProbeGame({ pairDecks, mode, seed, startSeat, pilots }) {
  if (mode === "commander") {
    const [userDeck, ...oppDecks] = pairDecks;
    return runSelfPlayGame({
      deckA: userDeck.cards,
      opponentDecks: oppDecks.map((d) => d.cards),
      userCommanders: userDeck.commanders || [],
      opponentCommanders: oppDecks.map((d) => d.commanders || []),
      userCompanion: userDeck.companion || null,
      opponentCompanions: oppDecks.map((d) => d.companion || null),
      mode, seed, startSeat, pilots, recordDecisions: true, timePressure: probeTimePressure,
    });
  }
  const [a, b] = pairDecks;
  return runSelfPlayGame({
    deckA: a.cards,
    deckB: b.cards,
    userCommanders: a.commanders || [],
    opponentCommanders: b.commanders || [],
    userCompanion: a.companion || null,
    opponentCompanions: b.companion || null,
    mode, seed, startSeat, pilots, recordDecisions: true, timePressure: probeTimePressure,
  });
}

let probeTimePressure = true;

/** Strip a decision trajectory to its comparable core (pilot identity differs by design). */
function decisionStream(game) {
  return (game.decisionTrajectory?.rows || []).map((r) => ({ turn: r.turn, seat: r.seat, action: r.action }));
}

/**
 * Plumbing self-test: the SAME seeded game must produce an IDENTICAL decision
 * stream when both seats run pass-through pilots (pickAction with NO legacy flags)
 * as when no pilots are attached at all. Proves the probe's pilot seam is inert.
 */
function runSelfTest(decks, mode, seed) {
  const pairDecks = mode === "commander" ? decks.slice(0, 4) : [decks[0], cloneDeckWithSuffix(decks[0], "-mirror")];
  const base = runProbeGame({ pairDecks, mode, seed, startSeat: null, pilots: {} });
  const pilots = {};
  for (const seat of SEATS[mode]) {
    pilots[seat] = {
      playbook: "probe-self-test",
      decide: ({ state, legalActions, seat: s }) =>
        opponentAI.pickAction(state, s, legalActions, {}) ?? undefined,
    };
  }
  const piloted = runProbeGame({ pairDecks, mode, seed, startSeat: null, pilots });
  const a = JSON.stringify({ result: base.result, turns: base.turns, rows: decisionStream(base) });
  const b = JSON.stringify({ result: piloted.result, turns: piloted.turns, rows: decisionStream(piloted) });
  if (a === b) {
    console.log(`[probe] SELF-TEST PASS — ${decisionStream(base).length} decisions, result ${base.result}, byte-identical with pass-through pilots`);
    return true;
  }
  console.error("[probe] SELF-TEST FAIL — pass-through pilots altered the decision stream");
  const ra = decisionStream(base); const rb = decisionStream(piloted);
  for (let i = 0; i < Math.max(ra.length, rb.length); i++) {
    if (JSON.stringify(ra[i]) !== JSON.stringify(rb[i])) {
      console.error(`  first divergence at row ${i}:`);
      console.error(`    default: ${JSON.stringify(ra[i])}`);
      console.error(`    piloted: ${JSON.stringify(rb[i])}`);
      break;
    }
  }
  return false;
}

const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "—");
const pct = (n, d = 1) => (Number.isFinite(n) ? `${(n * 100).toFixed(d)}%` : "—");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  probeTimePressure = args.timePressure;

  if (!process.env.MTG_APP_ROOT) {
    console.warn("[probe] MTG_APP_ROOT is not set — falling back to cwd. Point it at a data root with profiles/ + scryfall-bulk/oracle-index.json.");
  }
  console.log(`[probe] app root: ${appRoot()}`);

  let allDecks = await loadAllProfileDecks();
  if (allDecks.length === 0) {
    console.error("[probe] No decks found under profiles/ — check MTG_APP_ROOT.");
    process.exit(1);
  }
  console.log(`[probe] ${allDecks.length} deck(s); enriching from the local oracle index…`);
  let decks = allDecks.map(toRunnerDeck).filter((d) => {
    if ((d.cards || []).length === 0) {
      console.log(`[probe]   skipping empty deck: ${d.name}`);
      return false;
    }
    return true;
  });
  if (args.max) decks = decks.slice(0, args.max);
  if (decks.length === 0) {
    console.error("[probe] No playable (non-empty) decks found.");
    process.exit(1);
  }

  if (args.selfTest) {
    process.exit(runSelfTest(decks, args.mode, args.seed) ? 0 : 1);
  }

  const legacyPolicy = legacyPolicyOf(args.legacy);
  console.log(`[probe] mode=${args.mode} pairing=${args.pairing} games/pairing=${args.games} seed=${args.seed} timePressure=${args.timePressure ? "ON" : "OFF"}`);
  console.log(`[probe] OLD side legacy flags: ${args.legacy.join(",") || "(none)"}${args.mull ? " · NEW side mulligans (decideMulliganForAI)" : ""}`);

  // Pairings.
  const pairings = [];
  if (args.mode === "commander") {
    for (let i = 0; i + 3 < decks.length; i += 4) pairings.push(decks.slice(i, i + 4));
    if (pairings.length === 0) pairings.push([decks[0], decks[1 % decks.length], decks[2 % decks.length], decks[3 % decks.length]]);
  } else if (args.pairing === "cross") {
    for (let i = 0; i + 1 < decks.length; i += 2) pairings.push([decks[i], decks[i + 1]]);
    if (pairings.length === 0) pairings.push([decks[0], cloneDeckWithSuffix(decks[0], "-mirror")]);
  } else {
    for (const d of decks) pairings.push([d, cloneDeckWithSuffix(d, "-mirror")]);
  }

  const sides = { old: emptySide(), new: emptySide() };
  const outcomes = {};
  let totalTurns = 0;
  const perGame = [];
  let counter = 0;
  const t0 = Date.now();

  for (const pairDecks of pairings) {
    const label = pairDecks.map((d) => d.name).join(" vs ");
    for (let g = 0; g < args.games; g++) {
      const idx = counter++;
      const { sideOf, startSeat } = sidesForGame(args.mode, g);
      const seed = seedFor(args.seed, idx);
      const pilots = pilotsFor(sideOf, legacyPolicy, args.mull);
      const game = runProbeGame({ pairDecks, mode: args.mode, seed, startSeat, pilots });

      outcomes[game.result] = (outcomes[game.result] || 0) + 1;
      totalTurns += game.turns || 0;
      const metrics = analyzeGame(game);
      for (const [seat, m] of Object.entries(metrics)) {
        const side = sides[sideOf[seat]];
        if (!side) continue;
        foldSeatMetrics(side, m);
      }
      if (game.winnerSeat && sideOf[game.winnerSeat]) sides[sideOf[game.winnerSeat]].wins += 1;
      perGame.push({ pairing: label, seed, startSeat, sideOf, result: game.result, winnerSeat: game.winnerSeat ?? null, turns: game.turns, metrics });
    }
    console.log(`[probe]   ${label}: ${args.games} game(s) done (${((Date.now() - t0) / 1000).toFixed(1)}s elapsed)`);
  }

  const games = perGame.length;
  const decisive = (outcomes["user-wins"] || 0) + (outcomes["ai-wins"] || 0);
  console.log("");
  console.log("────────── PLAY-QUALITY A/B PROBE ──────────");
  console.log(`games: ${games} · decisive: ${decisive} · avg turns: ${fmt(totalTurns / Math.max(1, games), 1)}`);
  console.log(`outcomes: ${Object.entries(outcomes).sort().map(([k, v]) => `${k}=${v}`).join("  ")}`);
  console.log("");
  const row = (name, f, d = 2) => {
    const o = f(sides.old); const n = f(sides.new);
    console.log(`  ${name.padEnd(28)} OLD ${String(fmt(o, d)).padStart(8)}   NEW ${String(fmt(n, d)).padStart(8)}   Δ ${fmt(n - o, d)}`);
  };
  const per = (side, k) => side[k] / Math.max(1, side.seatGames);
  console.log(`  ${"".padEnd(28)} (per seat-game unless noted; OLD seat-games=${sides.old.seatGames}, NEW=${sides.new.seatGames})`);
  console.log(`  ${"win rate (of decisive)".padEnd(28)} OLD ${pct(sides.old.wins / Math.max(1, decisive)).padStart(8)}   NEW ${pct(sides.new.wins / Math.max(1, decisive)).padStart(8)}`);
  row("wins", (s) => s.wins, 0);
  row("dead turns", (s) => per(s, "deadTurns"));
  row("casts", (s) => per(s, "casts"));
  row("lands", (s) => per(s, "lands"));
  row("attacks declared", (s) => per(s, "attacksDeclared"));
  row("blocks declared", (s) => per(s, "blocksDeclared"));
  row("attacker combat deaths", (s) => per(s, "attackerDeaths"));
  row("blocker combat deaths", (s) => per(s, "blockerDeaths"));
  row("mulligans taken", (s) => per(s, "mulligans"));
  const avgX = (s) => (s.xCasts > 0 ? s.xSum / s.xCasts : NaN);
  console.log(`  ${"avg X on X-casts".padEnd(28)} OLD ${fmt(avgX(sides.old)).padStart(8)} (${sides.old.xCasts})   NEW ${fmt(avgX(sides.new)).padStart(8)} (${sides.new.xCasts})`);
  console.log("─────────────────────────────────────────────");

  if (args.json) {
    const outPath = path.resolve(args.json);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify({ args: { ...args }, sides, outcomes, games, perGame }, null, 2), "utf8");
    console.log(`[probe] raw metrics written: ${outPath}`);
  }
}

main().catch((err) => {
  console.error("[probe] FAILED:", err?.stack || err?.message || err);
  process.exit(1);
});
