/**
 * cardKingdomPrices.js — in-memory lookup over the cached Card Kingdom
 * pricelist index (data/cardkingdom-prices.json, built by
 * sync-cardkingdom-prices.cjs).
 *
 * This is the fallback price source: when Scryfall reports no TCGPlayer
 * market price for a printing, Card Kingdom almost always still lists it,
 * so we use Card Kingdom's retail price (matched by scryfall_id) to keep
 * the collection from showing nil values.
 *
 * Loads once on first access. Mirrors printingIndex.js: sync readFileSync,
 * single load, degrade-to-empty when the file is missing (dev / pre-sync)
 * so the collection still renders — it just won't have a Card Kingdom
 * fallback until a sync runs.
 *
 * Index shape on disk:
 *   { generatedAt, source, count, prices: { "<scryfallId>": { usd, usdFoil } } }
 * Prices are strings ("1.23") matching Scryfall's `prices.usd` format.
 */

import fs from "node:fs";

import { dataPath } from "./paths.js";
import { readJsonOrNull } from "./jsonFile.js";

function indexFile() {
  return dataPath("cardkingdom-prices.json");
}

let cached = null;

function ensureIndex() {
  if (cached) return cached;
  const file = indexFile();
  if (!fs.existsSync(file)) {
    // Not synced yet — empty fallback. The collection still works; cards
    // that TCGPlayer can't price just stay null until a Card Kingdom sync.
    cached = { prices: Object.create(null), generatedAt: null, count: 0 };
    return cached;
  }
  const parsed = readJsonOrNull(file, { fallback: {}, label: "cardkingdom-prices" });
  cached = {
    prices: parsed && typeof parsed.prices === "object" && parsed.prices ? parsed.prices : Object.create(null),
    generatedAt: parsed?.generatedAt || null,
    count: parsed?.count || 0,
  };
  return cached;
}

/**
 * Card Kingdom retail prices for a printing, or null if Card Kingdom
 * doesn't stock it.
 * @returns {{ usd?: string, usdFoil?: string } | null}
 */
export function cardKingdomPrice(scryfallId) {
  if (!scryfallId) return null;
  return ensureIndex().prices[scryfallId] || null;
}

/** Freshness + size, for the Updates panel and diagnostics. */
export function cardKingdomStats() {
  const idx = ensureIndex();
  return { generatedAt: idx.generatedAt, count: idx.count };
}
