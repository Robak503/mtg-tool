#!/usr/bin/env node
/**
 * build-collection-printings-index.cjs
 *
 * Reads app/data/scryfall-bulk/unique_artwork.json (~252 MB) and writes a
 * slim printing-level lookup index to data/scryfall-bulk/printings-index.json.
 *
 * The existing oracle-index.json is oracle-level only (name, oracle_id,
 * type_line, oracle_text, etc.) — it lacks the fields the Collection
 * feature needs. This index is PER-PRINTING (per Scryfall id) and includes:
 *
 *   - set, collector_number  — for CSV matching by set+collector
 *   - id (scryfallId)        — for stable per-row identity
 *   - image_uris.art_crop URL — for grid display (lazy-cached at runtime)
 *   - prices.usd / usd_foil / usd_etched — for price tracking
 *   - finishes               — for nonfoil / foil / etched support
 *
 * Source: unique_artwork.json (every distinct artwork — already synced
 * by sync-scryfall-bulk.cjs and bundled by prepare-tauri-resources.cjs).
 * Each row = one printing. ~25,000 rows total. The slim projection
 * targets ~30-50 MB output.
 *
 * Run after `npm run sync:scryfall-bulk`:
 *   npm run build:printings-index
 *
 * Format:
 *   {
 *     generatedAt: ISO-8601 string,
 *     sourceFile: relative path to source JSON,
 *     sourceCount: number of input printings,
 *     count: number of printings in the slim index,
 *     cards: [
 *       { id, oracleId, name, set, collectorNumber, finishes,
 *         layout, artCropUrl, prices: { usd, usdFoil, usdEtched } }
 *     ]
 *   }
 *
 * Runtime (printingIndex.js) builds in-memory Maps from this:
 *   - bySetCollector: "${set}:${collector_number}" → card row
 *   - byId: scryfallId → card row
 *
 * Art crops are NOT bundled — too large (~1.7 GB for all printings).
 * The runtime stores the Scryfall CDN URL here and lazy-fetches +
 * caches to %APPDATA%\com.colton.mtg-tool\data\art-crops\<id>.jpg on
 * first view. After cache populates, the user is fully offline.
 *
 * Bundling: prepare-tauri-resources.cjs is updated separately to copy
 * the produced printings-index.json into resources/data/scryfall-bulk/.
 * (NOT strip-standalone-bloat.cjs — that script nukes
 * .next/standalone/data/ wholesale, but the real bundle staging is
 * prepare-tauri-resources.cjs's hand-picked dataFiles list.)
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

// Mirrors build-oracle-index.cjs path resolution: MTG_APP_ROOT overrides
// when running inside the packaged .exe (writes go to AppData);
// MTG_REFERENCE_DIR is the read-only bundled snapshot fallback.
const REPO_ROOT = (process.env.MTG_APP_ROOT && process.env.MTG_APP_ROOT.trim())
  ? process.env.MTG_APP_ROOT.trim()
  : path.resolve(__dirname, "..");
const DATA_DIR = path.join(REPO_ROOT, "data");
const OUTPUT = path.join(DATA_DIR, "scryfall-bulk", "printings-index.json");
const TMP_OUTPUT = `${OUTPUT}.tmp`;

const LIVE_SOURCE = path.join(DATA_DIR, "scryfall-bulk", "unique_artwork.json");
const BUNDLED_SOURCE = (process.env.MTG_REFERENCE_DIR && process.env.MTG_REFERENCE_DIR.trim())
  ? path.join(process.env.MTG_REFERENCE_DIR.trim(), "scryfall-bulk", "unique_artwork.json")
  : null;
const SOURCE = (fs.existsSync(LIVE_SOURCE) || !BUNDLED_SOURCE) ? LIVE_SOURCE : BUNDLED_SOURCE;

function fail(message, exitCode = 1) {
  process.stderr.write(`build-collection-printings-index: ${message}\n`);
  process.exit(exitCode);
}

/**
 * Project a Scryfall printing into the slim Collection schema.
 * Returns null for rows that should be excluded (art series, missing ids).
 * Exported for unit testing.
 */
function slimPrinting(card) {
  if (!card || typeof card !== "object") return null;

  // Exclude non-card artifacts. art_series is the dominant case;
  // also skip token / emblem / vanguard (Collection ignores them by
  // default per Open Question #8, though the data is preserved).
  if (card.layout === "art_series") return null;

  // Skip placeholder / extras with no stable identity. Collection
  // rows are keyed by scryfallId so a missing id is unusable.
  if (!card.oracle_id || !card.id) return null;

  // Art crop URL: top-level image_uris first (single-faced cards),
  // then card_faces[0] for DFCs / MDFCs / transform layouts.
  // Open Question #7 in the design doc: render the front face by default.
  let artCropUrl = null;
  if (card.image_uris && card.image_uris.art_crop) {
    artCropUrl = card.image_uris.art_crop;
  } else if (
    Array.isArray(card.card_faces) &&
    card.card_faces[0] &&
    card.card_faces[0].image_uris &&
    card.card_faces[0].image_uris.art_crop
  ) {
    artCropUrl = card.card_faces[0].image_uris.art_crop;
  }

  const prices = card.prices || {};

  return {
    id: card.id,
    oracleId: card.oracle_id,
    name: card.name || "",
    set: (card.set || "").toLowerCase(),
    collectorNumber: card.collector_number || "",
    finishes: Array.isArray(card.finishes) && card.finishes.length
      ? card.finishes
      : ["nonfoil"],
    layout: card.layout || "normal",
    artCropUrl,
    prices: {
      usd: prices.usd || null,
      usdFoil: prices.usd_foil || null,
      usdEtched: prices.usd_etched || null,
    },
  };
}

function main() {
  if (!fs.existsSync(SOURCE)) {
    fail(
      `Source file not found: ${SOURCE}\n` +
      "  Run `npm run sync:scryfall-bulk` first to download unique_artwork.json."
    );
  }

  const startedAt = Date.now();
  process.stdout.write(`Reading ${path.relative(REPO_ROOT, SOURCE)} ...\n`);

  let parsed;
  try {
    const raw = fs.readFileSync(SOURCE, "utf8");
    parsed = JSON.parse(raw);
  } catch (error) {
    if (error.code === "ERR_STRING_TOO_LONG") {
      const size = fs.statSync(SOURCE).size;
      fail(
        `Source file too large for whole-file JSON.parse ` +
        `(${(size / 1048576).toFixed(1)} MB > Node's ~512 MB string limit).\n` +
        "  unique_artwork.json should be under that. If you're hitting this, " +
        "the source has grown — switch to a streaming parser (e.g. stream-json)."
      );
    }
    fail(`Failed to read/parse source file: ${error.message}`);
  }

  const sourcePrintings = Array.isArray(parsed) ? parsed : parsed.cards;
  if (!Array.isArray(sourcePrintings)) {
    fail("Source file does not contain an array of printings.");
  }

  const cards = [];
  let skippedArtSeries = 0;
  let skippedMissingIds = 0;
  for (const card of sourcePrintings) {
    const slim = slimPrinting(card);
    if (!slim) {
      if (card && card.layout === "art_series") skippedArtSeries += 1;
      else skippedMissingIds += 1;
      continue;
    }
    cards.push(slim);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceFile: path.relative(REPO_ROOT, SOURCE).replace(/\\/g, "/"),
    sourceCount: sourcePrintings.length,
    count: cards.length,
    cards,
  };

  // Atomic write so a partial/aborted run never leaves a corrupt index
  // that printingIndex.js would silently load.
  fs.writeFileSync(TMP_OUTPUT, JSON.stringify(payload));
  fs.renameSync(TMP_OUTPUT, OUTPUT);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(2);
  const sourceMB = (fs.statSync(SOURCE).size / 1_048_576).toFixed(1);
  const outputMB = (fs.statSync(OUTPUT).size / 1_048_576).toFixed(1);
  process.stdout.write(
    `Wrote ${path.relative(REPO_ROOT, OUTPUT)}\n` +
    `  ${cards.length}/${sourcePrintings.length} printings ` +
    `(skipped ${skippedArtSeries} art_series, ${skippedMissingIds} missing ids)\n` +
    `  ${sourceMB}MB → ${outputMB}MB (${elapsed}s)\n`
  );
}

if (require.main === module) {
  main();
}

module.exports = { slimPrinting };
