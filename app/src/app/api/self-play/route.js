/**
 * /api/self-play — the offline self-play Sim Center backend.
 *
 * POST — run a self-play stress test over the user's decks and return a breakage
 *   report.
 *
 *   Body:
 *     {
 *       deckIds:    string[],   // deck-store ids to include (required, >= 1)
 *       mode?:      "commander" | "standard",   // default "commander"
 *       gamesPer?:  number,     // repeats per pairing; each repeat gets a distinct shuffle seed (real variety)
 *       allProfiles?: boolean,  // when true, resolve deckIds across ALL profiles (the
 *                               // 13-deck set spans two); default = active profile only
 *       record?:    boolean,    // OPT-IN: also bank a per-turn training trajectory
 *                               // (Track-1a) to profilePath("self-play/trajectories")
 *       baseSeed?:  number,     // HB-4: batch base seed (default 1 — deterministic; a "run
 *                               // again" re-banks byte-identical rows UNLESS you vary this;
 *                               // echoed in the response + sidecar and stamped per game)
 *       mulligan?:  boolean,    // AI-F9: default true (AI London mulligan — unkeepable dealt
 *                               // 7s are shipped); false recovers keep-every-7
 *       rotateSeats?: boolean,  // HB-5 (opt-in): rotate deck→seat across the batch
 *       podShuffle?:  boolean,  // HB-6 (opt-in): re-deal deck→pod composition each cycle
 *       analyze?:     boolean   // P5 (opt-in): also return a per-deck "reality report"
 *                               // (dead-turn rate / avg casts·lands / mulligan rate / avg X);
 *                               // forces recordDecisions on for this run
 *     }
 *
 *   Response (JSON):
 *     {
 *       ok: true,
 *       mode,
 *       deckNames: string[],
 *       games: number,
 *       outcomes, avgTurns, breakages,   // the aggregate (cards ranked by frequency)
 *       report: string,                  // the full .txt blob (also written to disk)
 *       file:   string,                  // the written .txt filename
 *       trajectoryFile?: string,         // banked JSONL filename (only when record)
 *       trajectoryRows?: number,         // labeled rows banked this run (only when record)
 *       reality?: [{ deck, seat, games, avgDeadTurns, deadTurnRate, avgCasts, avgLands,
 *                    mulliganRate, avgX, avgAttacks, ... }]  // P5 per-deck report (only when analyze)
 *     }
 *
 * GET — read-only Sim Center support data (selected by ?action=):
 *   (none)              → { decks: [{ id, name, profile }] }  cross-profile picker list
 *   ?action=reports     → { reports: [{ file, savedAt, deckNames, games, breakages, mode }] }
 *   ?action=report&file → { file, report } — one saved .txt report verbatim (path-safe)
 *   ?action=stats       → { games, rows, files } — cumulative banked-trajectory totals
 *
 * Fully offline: decks come from local profile files, cards are enriched from the
 * bundled local oracle index, and the engine never calls the network at runtime.
 * The .txt is atomically written to profilePath("self-play") (mirrors /api/games).
 *
 * Errors:
 *   400 — missing/invalid body or no resolvable decks
 *   500 — unexpected failure
 */

export const runtime = "nodejs";

import path from "node:path";

import { profilePath } from "../../../lib/server/paths.js";
import { atomicWriteJson } from "../../../lib/server/atomicJson.js";
import { sanitiseId } from "../../../lib/server/sanitiseId.js";
import {
  toRunnerDeck,
  partitionPlayableRunnerDecks,
  loadAllProfileDecks,
  listAllProfileDecks,
  selectDecksByIds,
  decksForActiveProfile,
} from "../../../lib/server/selfPlayDecks.js";
import {
  runSelfPlayBatch,
  trajectoriesToJsonl,
  writeTrajectoriesJsonl,
  summarizeSeatOutcomes,
  engineSeatsForMode,
} from "../../../lib/learn/selfPlayRunner.js";
import { summarizeSeatReality } from "../../../lib/learn/gameAnalysis.js"; // P5: per-deck post-game reality report
import { buildPilotsForBatch } from "../../../lib/server/pilotLoader.js"; // PILOT PANEL: inject a persona from pilotsDir() (Omnath seam)
import {
  aggregateBreakages,
  formatBreakageTxt,
} from "../../../lib/learn/breakageReport.js";
import fs from "node:fs/promises";

const SELF_PLAY_DIR = () => profilePath("self-play");
const TRAJECTORY_DIR = () => profilePath("self-play", "trajectories");

function generateShortId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(16).slice(2, 10);
}

/** Atomically write the plaintext report (mirrors atomicWriteJson's tmp+rename). */
async function atomicWriteText(filePath, body) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, filePath);
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const deckIds = Array.isArray(body?.deckIds)
    ? body.deckIds.filter((id) => typeof id === "string" && id)
    : [];
  if (deckIds.length === 0) {
    return Response.json(
      { error: "deckIds is required and must be a non-empty array of deck ids." },
      { status: 400 }
    );
  }
  const mode = body?.mode === "standard" ? "standard" : "commander";
  // R2.7 (audit 2026-07-09): clamp server-side — runSelfPlayBatch is SYNCHRONOUS on the request
  // thread, so an unbounded gamesPer (a typo'd 10000) would freeze the server for hours. Bulk
  // data collection belongs to the grind (background loop / pool), not this one-shot route.
  const gamesPer = Math.min(50, Math.max(1, Number.isFinite(body?.gamesPer) ? Math.floor(body.gamesPer) : 1));
  const record = body?.record === true;
  // HB-4: batch base seed. Default 1 (deterministic, as always) — but now the caller can
  // vary it, it's echoed back + stamped into the sidecar and every recorded game, so a
  // "run again" that would re-bank duplicate training rows is detectable/preventable.
  // Coerced >>>0 to match the runner's own normalization (the echo IS the effective seed).
  const baseSeed = Number.isFinite(body?.baseSeed) ? body.baseSeed >>> 0 : 1;
  const mulligan = body?.mulligan === false ? false : true; // AI-F9: default ON
  const rotateSeats = body?.rotateSeats === true; // HB-5 (opt-in)
  const podShuffle = body?.podShuffle === true; // HB-6 (opt-in)
  // "pod" = run the selection as a SINGLE table; "all" (default) = every pairing
  // the runner builds. We honour "pod" by trimming to one pod-size worth of decks
  // below, so the UI's "just the selected pod" promise is real, not cosmetic.
  const scope = body?.scope === "pod" ? "pod" : "all";
  // P5: opt-in per-deck "reality report" — how each deck ACTUALLY played (dead-turn rate, avg
  // casts/lands, mulligan rate, avg X, combat outcomes), mined from the recorded decision
  // trajectory. Forces recordDecisions on (the analyzer needs the per-decision rows).
  const analyze = body?.analyze === true;

  // Resolve the requested deck ids → raw deck-store entries. Cross-profile when
  // asked (the 13-deck set spans two profiles), else the active profile only.
  let pool;
  try {
    pool = body?.allProfiles ? await loadAllProfileDecks() : await decksForActiveProfile();
  } catch (error) {
    return Response.json(
      { error: error?.message || "Could not load decks." },
      { status: 500 }
    );
  }
  let rawDecks = selectDecksByIds(pool, deckIds);
  if (rawDecks.length === 0) {
    return Response.json(
      { error: "None of the requested deckIds matched a saved deck." },
      { status: 400 }
    );
  }
  // Single-pod scope: keep exactly one table's worth of decks (4 for Commander,
  // 2 for Standard) so the run is one pod / one head-to-head, not a full sweep.
  if (scope === "pod") {
    rawDecks = rawDecks.slice(0, mode === "commander" ? 4 : 2);
  }
  if (mode === "commander" && rawDecks.length < 4) {
    // Commander needs 4-player pods. We could pad by wrapping (the runner does), but
    // for the API surface be explicit so the caller knows the result is degenerate.
    // We still proceed (the runner pads + flags it) — just note it in the report.
  }

  // Enrich every deck from the local oracle index, then drop EMPTY/unenrichable decks (the CLI
  // sweep's guard, shared) — an empty deck seeded into a pod can only setup-error the table.
  // Skipped names ride the response so the Sim Center can show them honestly.
  const { playable, empty: skippedDeckObjs } = partitionPlayableRunnerDecks(rawDecks.map(toRunnerDeck));
  const skippedDecks = skippedDeckObjs.map((d) => d.name);
  if (playable.length === 0) {
    return Response.json(
      { error: "Every selected deck is empty or failed to enrich — nothing playable.", skippedDecks },
      { status: 400 }
    );
  }
  const runnerDecks = playable;
  const deckNames = runnerDecks.map((d) => d.name);

  // PILOT PANEL (Omnath seam): if a persona was selected, dynamic-import it from pilotsDir() and build the
  // seat→pilot map SERVER-SIDE (the browser can't send a decide closure). Injected into every seat so self-play
  // is persona-driven + the banked rows carry {playbook,temperament}. Absent ⇒ {} ⇒ default autopilot (unchanged).
  const pilotFile = typeof body?.pilot === "string" && body.pilot ? body.pilot : null;
  let pilots = {};
  if (pilotFile) {
    try {
      pilots = await buildPilotsForBatch(pilotFile, mode);
    } catch (error) {
      return Response.json({ error: `Pilot "${pilotFile}" failed to load: ${error?.message || error}` }, { status: 400 });
    }
  }

  // Run the batch (offline, no network) and aggregate the engine's honest signals.
  // `record` (opt-in) also captures a per-turn feature trajectory for Track-1a.
  let batch;
  try {
    batch = runSelfPlayBatch(runnerDecks, { mode, gamesPer, record, recordDecisions: analyze, baseSeed, mulligan, rotateSeats, podShuffle, pilots });
  } catch (error) {
    return Response.json(
      { error: error?.message || "Self-play batch failed." },
      { status: 500 }
    );
  }
  const aggregate = aggregateBreakages(batch.games);
  // HB-7: per-seat / per-deck / on-the-play win tables (analysis-only) so a turn-order
  // position bias is measurable from the Sim Center, not just the CLI.
  const seatSummary = summarizeSeatOutcomes(batch.games);
  const generatedAt = new Date().toISOString();
  const report = formatBreakageTxt(aggregate, { deckNames, mode, generatedAt });

  // P4 matchup ledger: compact per-game outcome rows (deck-vs-deck records).
  // Additive to the sidecar (app-internal); winnerDeck maps winnerSeat →
  // meta.seatNames positionally, honest null when the game was undecided.
  const perGameOutcomes = batch.games.map((g) => {
    const seats = g?.meta?.seatNames || [];
    const w = g?.winnerSeat;
    return {
      decks: seats,
      winnerDeck: (w != null && seats[w]) ? seats[w] : null,
      result: g?.result ?? null,
      turns: g?.turns ?? null,
    };
  }).filter((r) => r.decks.length >= 2);

  // P5 REALITY REPORT (only when analyze) — per-deck tempo/curve/combat profile from the recorded
  // decision trajectory. Deck↔seat via the same meta.seatNames join summarizeSeatOutcomes uses
  // (seats[k] === the engine seat id analyzeGame keys on; names[k] === the deck at that seat). The
  // default no-rotation batch fixes a deck to one seat, so a per-seat aggregate IS that deck's
  // profile. A seat that never appears yields a null row and is dropped — never a fabricated zero.
  let reality = null;
  if (analyze) {
    const seats = engineSeatsForMode(mode);
    const names0 = batch.games.find((g) => Array.isArray(g?.meta?.seatNames))?.meta?.seatNames || deckNames;
    reality = seats
      .map((seatId, k) => {
        const r = summarizeSeatReality(batch.games, seatId);
        return r ? { deck: names0[k] ?? `deck${k}`, seat: seatId, ...r } : null;
      })
      .filter(Boolean);
  }

  // Bank training data (opt-in). Atomic JSONL write to the trajectories namespace;
  // a write failure here must NOT discard the completed run, so we capture the
  // outcome and surface it honestly in the response rather than throwing.
  let trajectoryFile = null;
  let trajectoryRows = 0;
  let trajectoryError = null;
  if (record) {
    try {
      trajectoryRows = trajectoriesToJsonl(batch).split("\n").filter(Boolean).length;
      const written = await writeTrajectoriesJsonl(batch);
      trajectoryFile = written ? path.basename(written) : null;
    } catch (error) {
      trajectoryError = error?.message || String(error);
    }
  }

  // Atomically write the .txt to the profile's self-play dir (mirror /api/games).
  const safeTs = generatedAt.replace(/:/g, "-").replace(/\..+Z$/, "Z");
  const filename = `self-play-${sanitiseId(safeTs)}-${generateShortId()}.txt`;
  try {
    await atomicWriteText(path.join(SELF_PLAY_DIR(), filename), report);
    // Also drop a JSON sidecar so the structured aggregate (and the run's deck +
    // breakage counts, read by the history list) are queryable later.
    await atomicWriteJson(
      path.join(SELF_PLAY_DIR(), filename.replace(/\.txt$/, ".json")),
      {
        generatedAt,
        mode,
        deckNames,
        ...(skippedDecks.length ? { skippedDecks } : {}),
        deckIds,
        baseSeed, // HB-4: the effective batch seed — a duplicate banking of this exact run is identifiable
        seatSummary, // HB-7: win-by-seat/deck/on-the-play tables (Wilson CIs)
        breakageCount: aggregate.cards.length,
        ...aggregate,
        games: undefined,
        perGameOutcomes,
        gamesCount: aggregate.games.length,
      }
    );
  } catch (error) {
    // A failed write must not discard a completed run — return the report anyway,
    // surfacing the write error honestly rather than swallowing it.
    return Response.json({
      ok: true,
      mode,
      deckNames,
      ...(skippedDecks.length ? { skippedDecks } : {}),
      games: aggregate.outcomes.total,
      outcomes: aggregate.outcomes,
      avgTurns: aggregate.avgTurns,
      breakages: aggregate.cards,
      baseSeed,
      seatSummary,
      ...(reality ? { reality } : {}),
      report,
      file: null,
      writeError: error?.message || String(error),
      trajectoryFile,
      trajectoryRows,
      trajectoryError,
    });
  }

  return Response.json({
    ok: true,
    mode,
    deckNames,
    ...(skippedDecks.length ? { skippedDecks } : {}),
    games: aggregate.outcomes.total,
    outcomes: aggregate.outcomes,
    avgTurns: aggregate.avgTurns,
    breakages: aggregate.cards,
    baseSeed,
    seatSummary,
    ...(reality ? { reality } : {}),
    report,
    file: filename,
    trajectoryFile,
    trajectoryRows,
    trajectoryError,
  });
}

/**
 * List the saved-report history from the self-play dir, newest first. Each entry
 * pairs a .txt report with its .json sidecar's metadata (deck names + game/breakage
 * counts). A .txt with no readable sidecar still appears (counts unknown) so the
 * list never silently hides a real report.
 */
async function buildMatchupLedger() {
  let files;
  try { files = await fs.readdir(SELF_PLAY_DIR()); } catch { return { decks: [], soloWins: {}, pair: {}, games: 0 }; }
  const soloWins = {};
  const pair = {};
  let games = 0;
  for (const f of files.filter((x) => x.endsWith(".json"))) {
    let sc;
    try { sc = JSON.parse(await fs.readFile(path.join(SELF_PLAY_DIR(), f), "utf8")); } catch { continue; }
    for (const row of sc.perGameOutcomes || []) {
      const decks = Array.isArray(row.decks) ? row.decks : [];
      if (decks.length < 2) continue;
      games += 1;
      const winner = row.winnerDeck;
      for (const d of decks) {
        soloWins[d] = soloWins[d] || { games: 0, wins: 0 };
        soloWins[d].games += 1;
        if (d === winner) soloWins[d].wins += 1;
      }
      for (const a of decks) for (const b of decks) {
        if (a === b) continue;
        const key = a + "||" + b;
        pair[key] = pair[key] || { games: 0, aWins: 0 };
        pair[key].games += 1;
        if (winner === a) pair[key].aWins += 1;
      }
    }
  }
  const decks = Object.keys(soloWins).sort((x, y) => soloWins[y].games - soloWins[x].games);
  return { decks, soloWins, pair, games };
}

async function listSavedReports() {
  let files;
  try {
    files = await fs.readdir(SELF_PLAY_DIR());
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const txts = files.filter((f) => f.endsWith(".txt") && !f.endsWith(".tmp.txt"));
  const reports = [];
  for (const file of txts) {
    let meta = null;
    try {
      const raw = await fs.readFile(
        path.join(SELF_PLAY_DIR(), file.replace(/\.txt$/, ".json")),
        "utf8"
      );
      meta = JSON.parse(raw);
    } catch {
      // sidecar missing/corrupt — still list the .txt with unknown counts
    }
    reports.push({
      file,
      savedAt: meta?.generatedAt || null,
      mode: meta?.mode || null,
      deckNames: Array.isArray(meta?.deckNames) ? meta.deckNames : [],
      games: meta?.outcomes?.total ?? meta?.gamesCount ?? null,
      breakages: meta?.breakageCount ?? (Array.isArray(meta?.cards) ? meta.cards.length : null),
    });
  }
  // Newest first: prefer the sidecar timestamp, fall back to the filename (which
  // embeds the ISO timestamp) so undated reports still sort sensibly.
  reports.sort((a, b) =>
    String(b.savedAt || b.file).localeCompare(String(a.savedAt || a.file))
  );
  return reports;
}

/** Cumulative banked-trajectory totals: JSONL files + their labeled-row count. */
async function trajectoryStats() {
  let files;
  try {
    files = await fs.readdir(TRAJECTORY_DIR());
  } catch (error) {
    if (error.code === "ENOENT") return { games: 0, rows: 0, files: 0 };
    throw error;
  }
  const jsonls = files.filter((f) => f.endsWith(".jsonl") && !f.endsWith(".tmp.jsonl"));
  let rows = 0;
  for (const file of jsonls) {
    try {
      const raw = await fs.readFile(path.join(TRAJECTORY_DIR(), file), "utf8");
      rows += raw.split("\n").filter(Boolean).length;
    } catch {
      // skip unreadable
    }
  }
  // One JSONL file = one banked run (the writer emits one file per recorded batch).
  return { games: jsonls.length, rows, files: jsonls.length };
}

export async function GET(request) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  try {
    if (action === "reports") {
      return Response.json({ reports: await listSavedReports() });
    }

    if (action === "matchups") {
      return Response.json(await buildMatchupLedger());
    }

    if (action === "stats") {
      return Response.json(await trajectoryStats());
    }

    if (action === "report") {
      // Read one saved report verbatim. Path-safe: only a bare basename ending in
      // .txt is accepted, and we re-join against the dir + verify the resolved path
      // stays inside it — a traversal (../) or absolute path is rejected.
      const requested = url.searchParams.get("file") || "";
      if (!requested.endsWith(".txt") || requested !== path.basename(requested)) {
        return Response.json({ error: "Invalid report file name." }, { status: 400 });
      }
      const dir = SELF_PLAY_DIR();
      const full = path.join(dir, requested);
      if (path.relative(dir, full).startsWith("..")) {
        return Response.json({ error: "Invalid report path." }, { status: 400 });
      }
      let report;
      try {
        report = await fs.readFile(full, "utf8");
      } catch (error) {
        if (error.code === "ENOENT") {
          return Response.json({ error: "Report not found." }, { status: 404 });
        }
        throw error;
      }
      return Response.json({ file: requested, report });
    }

    // Default: the cross-profile deck picker list { decks: [{ id, name, profile }] }.
    return Response.json({ decks: await listAllProfileDecks() });
  } catch (error) {
    return Response.json(
      { error: error?.message || "Self-play GET failed." },
      { status: 500 }
    );
  }
}
