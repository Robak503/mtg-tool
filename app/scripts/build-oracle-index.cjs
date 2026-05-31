#!/usr/bin/env node
/**
 * build-oracle-index.cjs
 *
 * Reads the 165MB scryfall oracle_cards.json bulk file and writes a slim
 * name→card lookup index to data/scryfall-bulk/oracle-index.json (~10-20MB).
 *
 * cardIndex.js prefers the slim index when present, cutting cold-start parse
 * time from ~3-5s down to ~200ms. Falls back to the full file if absent.
 *
 * Run after `npm run sync:scryfall-bulk` (or any time oracle_cards.json refreshes):
 *   npm run build:oracle-index
 *
 * Format:
 *   {
 *     generatedAt: ISO-8601 string,
 *     sourceFile: relative path to source JSON,
 *     sourceCount: number of input cards,
 *     count: number of cards in the slim index (art_series excluded),
 *     cards: [
 *       { name, oracle_id, type_line, oracle_text, mana_cost, cmc,
 *         color_identity, legalities, layout, keywords, edhrec_rank, card_faces? }
 *     ]
 *   }
 *
 * The slim index keeps only fields cardIndex.js needs for rules retrieval,
 * card-name matching, and color/legality filtering — no images, no prices,
 * no edhrec_rank, no set data.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

// Writes land in app/data by default, but the bundled .exe sets
// MTG_APP_ROOT so the rebuilt index goes into AppData. For READING the
// source oracle_cards.json we additionally fall back to MTG_REFERENCE_DIR
// (the read-only bundled snapshot) if the writable copy doesn't exist —
// matches the paths.js dataPath() resolution.
const REPO_ROOT = (process.env.MTG_APP_ROOT && process.env.MTG_APP_ROOT.trim())
  ? process.env.MTG_APP_ROOT.trim()
  : path.resolve(__dirname, "..");
const DATA_DIR = path.join(REPO_ROOT, "data");
const OUTPUT = path.join(DATA_DIR, "scryfall-bulk", "oracle-index.json");
const TMP_OUTPUT = `${OUTPUT}.tmp`;

const LIVE_SOURCE = path.join(DATA_DIR, "scryfall-bulk", "oracle_cards.json");
const BUNDLED_SOURCE = (process.env.MTG_REFERENCE_DIR && process.env.MTG_REFERENCE_DIR.trim())
  ? path.join(process.env.MTG_REFERENCE_DIR.trim(), "scryfall-bulk", "oracle_cards.json")
  : null;
const SOURCE = (fs.existsSync(LIVE_SOURCE) || !BUNDLED_SOURCE) ? LIVE_SOURCE : BUNDLED_SOURCE;

function fail(message, exitCode = 1) {
  process.stderr.write(`build-oracle-index: ${message}\n`);
  process.exit(exitCode);
}

function slimCard(card) {
  if (!card || typeof card !== "object") return null;
  // Exclude non-card artifacts (art series, etc.) — keep this in sync with
  // cardIndex.js cardRank() which heavily penalizes layout === "art_series".
  if (card.layout === "art_series") return null;

  const slim = {
    name: card.name,
    oracle_id: card.oracle_id || null,
    type_line: card.type_line || "",
    oracle_text: card.oracle_text || "",
    mana_cost: card.mana_cost || "",
    cmc: typeof card.cmc === "number" ? card.cmc : 0,
    color_identity: Array.isArray(card.color_identity) ? card.color_identity : [],
    legalities: card.legalities || {},
    layout: card.layout || "normal",
    keywords: Array.isArray(card.keywords) ? card.keywords : [],
    // edhrec_rank powers staple-ranking in searchLocalCards() and the deck
    // recommender (lower rank = more played). Kept slim (one number) — without
    // it, edhrec_rank-based scoring silently no-ops on the slim-index path.
    edhrec_rank: typeof card.edhrec_rank === "number" ? card.edhrec_rank : null,
  };

  if (Array.isArray(card.card_faces) && card.card_faces.length) {
    slim.card_faces = card.card_faces.map(face => ({
      name: face.name || "",
      type_line: face.type_line || "",
      oracle_text: face.oracle_text || "",
      mana_cost: face.mana_cost || "",
      colors: Array.isArray(face.colors) ? face.colors : [],
    }));
  }

  return slim;
}

function main() {
  if (!fs.existsSync(SOURCE)) {
    fail(
      `Source file not found: ${SOURCE}\n` +
      "  Run `npm run sync:scryfall-bulk` first to download oracle_cards.json."
    );
  }

  const startedAt = Date.now();
  process.stdout.write(`Reading ${path.relative(REPO_ROOT, SOURCE)} ...\n`);

  let parsed;
  try {
    const raw = fs.readFileSync(SOURCE, "utf8");
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(`Failed to read/parse source file: ${error.message}`);
  }

  const sourceCards = Array.isArray(parsed) ? parsed : parsed.cards;
  if (!Array.isArray(sourceCards)) {
    fail("Source file does not contain an array of cards.");
  }

  const cards = [];
  for (const card of sourceCards) {
    const slim = slimCard(card);
    if (slim) cards.push(slim);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceFile: path.relative(REPO_ROOT, SOURCE).replace(/\\/g, "/"),
    sourceCount: sourceCards.length,
    count: cards.length,
    cards,
  };

  // Atomic write so a partial/aborted run never leaves a corrupt index that
  // cardIndex.js would silently load.
  fs.writeFileSync(TMP_OUTPUT, JSON.stringify(payload));
  fs.renameSync(TMP_OUTPUT, OUTPUT);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(2);
  const sourceMB = (fs.statSync(SOURCE).size / 1_048_576).toFixed(1);
  const outputMB = (fs.statSync(OUTPUT).size / 1_048_576).toFixed(1);
  process.stdout.write(
    `Wrote ${path.relative(REPO_ROOT, OUTPUT)}\n` +
    `  ${cards.length}/${sourceCards.length} cards (excluded ${sourceCards.length - cards.length} art_series/invalid)\n` +
    `  ${sourceMB}MB → ${outputMB}MB (${elapsed}s)\n`
  );
}

main();
