/**
 * POST /api/self-play — run an offline self-play stress test over the user's decks
 * and return a breakage report.
 *
 * Body:
 *   {
 *     deckIds:    string[],   // deck-store ids to include (required, >= 1)
 *     mode?:      "commander" | "standard",   // default "commander"
 *     gamesPer?:  number,     // repeats per pairing (Pass A: capped at 1, see runner)
 *     allProfiles?: boolean   // when true, resolve deckIds across ALL profiles (the
 *                             // 13-deck set spans two); default = active profile only
 *   }
 *
 * Response (JSON):
 *   {
 *     ok: true,
 *     mode,
 *     deckNames: string[],
 *     games: number,
 *     outcomes, avgTurns, breakages,   // the aggregate (cards ranked by frequency)
 *     report: string,                  // the full .txt blob (also written to disk)
 *     file:   string                   // the written .txt filename
 *   }
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
  loadAllProfileDecks,
  selectDecksByIds,
  decksForActiveProfile,
} from "../../../lib/server/selfPlayDecks.js";
import { runSelfPlayBatch } from "../../../lib/learn/selfPlayRunner.js";
import {
  aggregateBreakages,
  formatBreakageTxt,
} from "../../../lib/learn/breakageReport.js";
import fs from "node:fs/promises";

const SELF_PLAY_DIR = () => profilePath("self-play");

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
  const gamesPer = Number.isFinite(body?.gamesPer) ? body.gamesPer : 1;

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
  const rawDecks = selectDecksByIds(pool, deckIds);
  if (rawDecks.length === 0) {
    return Response.json(
      { error: "None of the requested deckIds matched a saved deck." },
      { status: 400 }
    );
  }
  if (mode === "commander" && rawDecks.length < 4) {
    // Commander needs 4-player pods. We could pad by wrapping (the runner does), but
    // for the API surface be explicit so the caller knows the result is degenerate.
    // We still proceed (the runner pads + flags it) — just note it in the report.
  }

  // Enrich every deck from the local oracle index.
  const runnerDecks = rawDecks.map(toRunnerDeck);
  const deckNames = runnerDecks.map((d) => d.name);

  // Run the batch (offline, no network) and aggregate the engine's honest signals.
  let batch;
  try {
    batch = runSelfPlayBatch(runnerDecks, { mode, gamesPer });
  } catch (error) {
    return Response.json(
      { error: error?.message || "Self-play batch failed." },
      { status: 500 }
    );
  }
  const aggregate = aggregateBreakages(batch.games);
  const generatedAt = new Date().toISOString();
  const report = formatBreakageTxt(aggregate, { deckNames, mode, generatedAt });

  // Atomically write the .txt to the profile's self-play dir (mirror /api/games).
  const safeTs = generatedAt.replace(/:/g, "-").replace(/\..+Z$/, "Z");
  const filename = `self-play-${sanitiseId(safeTs)}-${generateShortId()}.txt`;
  try {
    await atomicWriteText(path.join(SELF_PLAY_DIR(), filename), report);
    // Also drop a JSON sidecar so the structured aggregate is queryable later.
    await atomicWriteJson(
      path.join(SELF_PLAY_DIR(), filename.replace(/\.txt$/, ".json")),
      { generatedAt, mode, deckNames, ...aggregate, games: undefined, gamesCount: aggregate.games.length }
    );
  } catch (error) {
    // A failed write must not discard a completed run — return the report anyway,
    // surfacing the write error honestly rather than swallowing it.
    return Response.json({
      ok: true,
      mode,
      deckNames,
      games: aggregate.outcomes.total,
      outcomes: aggregate.outcomes,
      avgTurns: aggregate.avgTurns,
      breakages: aggregate.cards,
      report,
      file: null,
      writeError: error?.message || String(error),
    });
  }

  return Response.json({
    ok: true,
    mode,
    deckNames,
    games: aggregate.outcomes.total,
    outcomes: aggregate.outcomes,
    avgTurns: aggregate.avgTurns,
    breakages: aggregate.cards,
    report,
    file: filename,
  });
}
