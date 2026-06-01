#!/usr/bin/env node
/**
 * build-collection-printings-index.cjs
 *
 * Streams app/data/scryfall-bulk/default_cards.json (~540 MB) and writes a
 * slim printing-level lookup index to data/scryfall-bulk/printings-index.json.
 *
 * Why default_cards (not unique_artwork): the Collection printing-picker needs
 * EVERY paper printing of a card, including art-REUSE reprints (e.g. Commander
 * Masters reprinting a card with its original M15 artwork). unique_artwork.json
 * keeps only one entry per DISTINCT artwork, so those reprints are invisible —
 * the user couldn't pick the exact print they own. default_cards.json has one
 * entry per printing, which is what we want.
 *
 * default_cards.json is ~540 MB — past Node's ~512 MB single-string limit, so
 * readFileSync + JSON.parse throws ERR_STRING_TOO_LONG. We stream it with
 * stream-json (a build-time devDependency) so memory stays flat regardless of
 * source size.
 *
 * The existing oracle-index.json is oracle-level only (name, oracle_id,
 * type_line, oracle_text, etc.) — it lacks the fields the Collection
 * feature needs. This index is PER-PRINTING (per Scryfall id) and includes:
 *
 *   - set, collector_number   — for CSV matching by set+collector
 *   - id (scryfallId)         — for stable per-row identity
 *   - image_uris.art_crop URL — for grid display (lazy-cached at runtime)
 *   - prices.usd / usd_foil / usd_etched — for price tracking
 *   - finishes                — for nonfoil / foil / etched support
 *   - releasedAt              — for newest-first ordering in the picker
 *
 * Excluded rows: art_series cards, digital-only printings (MTGO / Arena /
 * Alchemy — not ownable in paper), and rows missing a stable id/oracle_id.
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
 *       { id, oracleId, name, set, setName, collectorNumber, finishes,
 *         foilTypes, layout, releasedAt, artCropUrl,
 *         prices: { usd, usdFoil, usdEtched } }
 *     ]
 *   }
 *
 * Runtime (printingIndex.js) builds in-memory Maps from this:
 *   - bySetCollector: "${set}:${collector_number}" → card row
 *   - byId: scryfallId → card row
 *   - byName: lowercased name → [card rows]
 *
 * Art crops are NOT bundled — too large (~1.7 GB for all printings).
 * The runtime stores the Scryfall CDN URL here and lazy-fetches +
 * caches to %APPDATA%\com.colton.mtg-tool\data\art-crops\<id>.jpg on
 * first view. After cache populates, the user is fully offline.
 *
 * Bundling: prepare-tauri-resources.cjs copies the produced
 * printings-index.json into resources/data/scryfall-bulk/. (NOT
 * strip-standalone-bloat.cjs — that script nukes .next/standalone/data/
 * wholesale, but the real bundle staging is prepare-tauri-resources.cjs's
 * hand-picked dataFiles list.)
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { chain } = require("stream-chain");
const { parser } = require("stream-json");
const { streamArray } = require("stream-json/streamers/stream-array.js");

// Which Scryfall promo_types are a special FOIL treatment (vs promo metadata
// like boosterfun / datestamped / prerelease). Rule: anything ending in "foil"
// plus a curated set of named treatments that don't. Display names + ordering
// live in src/lib/foilTreatments.js (the UI side); this is just the filter so
// the index carries only foil-relevant promo_types. Keep the two in sync.
const FOIL_TREATMENT_EXTRAS = new Set([
  "oilslick", "stepandcompleat", "gilded", "textured", "neonink",
  "doublerainbow", "invisibleink",
]);
function foilTreatmentsOf(card) {
  const promos = Array.isArray(card.promo_types) ? card.promo_types : [];
  return promos.filter(p => typeof p === "string" && (p.endsWith("foil") || FOIL_TREATMENT_EXTRAS.has(p)));
}

// Mirrors build-oracle-index.cjs path resolution: MTG_APP_ROOT overrides
// when running inside the packaged .exe (writes go to AppData);
// MTG_REFERENCE_DIR is the read-only bundled snapshot fallback.
const REPO_ROOT = (process.env.MTG_APP_ROOT && process.env.MTG_APP_ROOT.trim())
  ? process.env.MTG_APP_ROOT.trim()
  : path.resolve(__dirname, "..");
const DATA_DIR = path.join(REPO_ROOT, "data");
const OUTPUT = path.join(DATA_DIR, "scryfall-bulk", "printings-index.json");
const TMP_OUTPUT = `${OUTPUT}.tmp`;

const REF_DIR = (process.env.MTG_REFERENCE_DIR && process.env.MTG_REFERENCE_DIR.trim())
  ? process.env.MTG_REFERENCE_DIR.trim()
  : null;

// Source preference: full per-printing coverage (default_cards) first, with
// unique_artwork as a graceful fallback so the build still produces an index
// (reduced coverage) in an environment that only has the smaller file.
function pickSource() {
  const candidates = [
    path.join(DATA_DIR, "scryfall-bulk", "default_cards.json"),
    REF_DIR ? path.join(REF_DIR, "scryfall-bulk", "default_cards.json") : null,
    path.join(DATA_DIR, "scryfall-bulk", "unique_artwork.json"),
    REF_DIR ? path.join(REF_DIR, "scryfall-bulk", "unique_artwork.json") : null,
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function fail(message, exitCode = 1) {
  process.stderr.write(`build-collection-printings-index: ${message}\n`);
  process.exit(exitCode);
}

/**
 * Project a Scryfall printing into the slim Collection schema.
 * Returns null for rows that should be excluded (art series, digital-only,
 * missing ids). Exported for unit testing.
 */
function slimPrinting(card) {
  if (!card || typeof card !== "object") return null;

  // Exclude non-card artifacts. art_series is the dominant case;
  // also skip token / emblem / vanguard (Collection ignores them by
  // default per Open Question #8, though the data is preserved).
  if (card.layout === "art_series") return null;

  // Digital-only printings (MTGO / Arena / Alchemy) can't be owned in paper,
  // so they'd be noise in a physical-collection picker.
  if (card.digital === true) return null;

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
    setName: card.set_name || "",
    collectorNumber: card.collector_number || "",
    rarity: card.rarity || null,
    finishes: Array.isArray(card.finishes) && card.finishes.length
      ? card.finishes
      : ["nonfoil"],
    foilTypes: foilTreatmentsOf(card),
    layout: card.layout || "normal",
    releasedAt: card.released_at || null,
    artCropUrl,
    prices: {
      usd: prices.usd || null,
      usdFoil: prices.usd_foil || null,
      usdEtched: prices.usd_etched || null,
    },
  };
}

/**
 * Stream the source array, projecting each printing through slimPrinting.
 * Resolves with the collected rows and skip counters. Memory stays flat —
 * we never hold the whole source string, only the slim output array.
 */
function buildFromSource(source) {
  return new Promise((resolve, reject) => {
    const cards = [];
    let sourceCount = 0;
    let skippedArtSeries = 0;
    let skippedDigital = 0;
    let skippedMissingIds = 0;

    const pipeline = chain([
      fs.createReadStream(source),
      parser(),
      streamArray(),
    ]);

    pipeline.on("data", ({ value }) => {
      sourceCount += 1;
      const slim = slimPrinting(value);
      if (!slim) {
        if (value && value.layout === "art_series") skippedArtSeries += 1;
        else if (value && value.digital === true) skippedDigital += 1;
        else skippedMissingIds += 1;
        return;
      }
      cards.push(slim);
    });

    pipeline.on("end", () =>
      resolve({ cards, sourceCount, skippedArtSeries, skippedDigital, skippedMissingIds }));
    pipeline.on("error", reject);
  });
}

async function main() {
  const source = pickSource();
  if (!source) {
    fail(
      "No source file found (looked for default_cards.json then unique_artwork.json).\n" +
      "  Run `npm run sync:scryfall-bulk` first to download the bulk data."
    );
  }

  const startedAt = Date.now();
  process.stdout.write(`Reading ${path.relative(REPO_ROOT, source)} (streaming) ...\n`);

  let result;
  try {
    result = await buildFromSource(source);
  } catch (error) {
    fail(`Streaming parse failed: ${error.message}`);
  }

  const { cards, sourceCount, skippedArtSeries, skippedDigital, skippedMissingIds } = result;

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceFile: path.relative(REPO_ROOT, source).replace(/\\/g, "/"),
    sourceCount,
    count: cards.length,
    cards,
  };

  // Atomic write so a partial/aborted run never leaves a corrupt index
  // that printingIndex.js would silently load.
  fs.writeFileSync(TMP_OUTPUT, JSON.stringify(payload));
  fs.renameSync(TMP_OUTPUT, OUTPUT);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(2);
  const sourceMB = (fs.statSync(source).size / 1_048_576).toFixed(1);
  const outputMB = (fs.statSync(OUTPUT).size / 1_048_576).toFixed(1);
  process.stdout.write(
    `Wrote ${path.relative(REPO_ROOT, OUTPUT)}\n` +
    `  ${cards.length}/${sourceCount} printings ` +
    `(skipped ${skippedArtSeries} art_series, ${skippedDigital} digital, ${skippedMissingIds} missing ids)\n` +
    `  ${sourceMB}MB → ${outputMB}MB (${elapsed}s)\n`
  );
}

if (require.main === module) {
  main().catch(error => fail(error.message));
}

module.exports = { slimPrinting };
