/**
 * printingIndex.js — in-memory lookup over the bundled per-printing index.
 *
 * Loads printings-index.json (built by build-collection-printings-index.cjs)
 * once on first access and builds two Maps:
 *
 *   bySetCollector  "set:collector_number" → row   (CSV match key)
 *   byId            scryfallId             → row   (stable row identity)
 *
 * Mirrors cardIndex.js: sync readFileSync, single load, never refreshed
 * at runtime. Node's event loop blocks until JSON.parse returns so two
 * cold-start requests cannot race the build.
 *
 * Each row has the slim fields produced by build-collection-printings-index.cjs:
 *   { id, oracleId, name, set, setName, collectorNumber, rarity, setType,
 *     reserved, finishes, foilTypes, layout, releasedAt, artCropUrl,
 *     artist, fullArt, borderColor, storySpotlight,          // V5 (2026-07-04)
 *     prices: { usd, usdFoil, usdEtched } }
 *   Indexes built before V5 lack the artist/flag fields — consumers must
 *   treat them as optional and feature-hide, never crash.
 *
 * Art crops are NOT bundled. artCropUrl is the Scryfall CDN URL;
 * the renderer should lazy-fetch + cache on first view.
 */

import fs from "node:fs";

import { dataPath } from "./paths.js";
import { readJsonOrNull } from "./jsonFile.js";

function indexFile() {
  return dataPath("scryfall-bulk", "printings-index.json");
}

let cachedIndex = null;

function buildIndex() {
  const file = indexFile();
  if (!fs.existsSync(file)) {
    const error = new Error(
      `Printings index missing: ${file}. Run ` +
      "`npm run build:printings-index` after `npm run sync:scryfall-bulk`.",
    );
    error.code = "ENOENT";
    throw error;
  }

  // Missing file still throws above (actionable hint). A corrupt index degrades
  // to empty (no matches) rather than 500-ing collection import / art lookups.
  const parsed = readJsonOrNull(file, { fallback: {}, label: "printings-index" });
  const cards = Array.isArray(parsed?.cards) ? parsed.cards : [];

  const bySetCollector = new Map();
  const byId = new Map();
  const byNameLower = new Map();
  const bySet = new Map(); // set code → { setCode, setName, releasedAt, cards: [] }

  for (const card of cards) {
    if (!card || !card.id) continue;
    byId.set(card.id, card);
    if (card.set && card.collectorNumber) {
      bySetCollector.set(`${card.set}:${card.collectorNumber}`, card);
    }
    if (card.name) {
      const key = card.name.toLowerCase();
      let bucket = byNameLower.get(key);
      if (!bucket) {
        bucket = [];
        byNameLower.set(key, bucket);
      }
      bucket.push(card);
    }
    if (card.set) {
      let s = bySet.get(card.set);
      if (!s) {
        s = { setCode: card.set, setName: card.setName || card.set.toUpperCase(), releasedAt: card.releasedAt || null, cards: [] };
        bySet.set(card.set, s);
      }
      s.cards.push(card);
      // keep the earliest known release date for the set
      if (card.releasedAt && (!s.releasedAt || card.releasedAt < s.releasedAt)) s.releasedAt = card.releasedAt;
    }
  }

  return {
    bySetCollector,
    byId,
    byNameLower,
    bySet,
    generatedAt: parsed.generatedAt || null,
    count: cards.length,
  };
}

function ensureIndex() {
  if (!cachedIndex) cachedIndex = buildIndex();
  return cachedIndex;
}

export function lookupBySetCollector(set, collectorNumber) {
  const idx = ensureIndex();
  if (!set || !collectorNumber) return null;
  const key = `${String(set).toLowerCase()}:${String(collectorNumber)}`;
  return idx.bySetCollector.get(key) || null;
}

export function lookupById(scryfallId) {
  if (!scryfallId) return null;
  const idx = ensureIndex();
  return idx.byId.get(scryfallId) || null;
}

/**
 * Returns all printings of a given card name (case-insensitive). Used
 * for CSV imports where the source has the name but not always a
 * collector number, and we need to disambiguate by set.
 */
export function lookupByName(name) {
  if (!name) return [];
  const idx = ensureIndex();
  return idx.byNameLower.get(String(name).toLowerCase()) || [];
}

/**
 * Resolve a (name, setCode) pair to a single printing. Preferred when
 * the source format has both. Falls back to the first-encountered
 * printing of the name when no set match is found.
 */
export function lookupByNameAndSet(name, setCode) {
  const printings = lookupByName(name);
  if (printings.length === 0) return null;
  if (!setCode) return printings[0];
  const lower = String(setCode).toLowerCase();
  const exact = printings.find(p => p.set === lower);
  return exact || printings[0];
}

export function printingIndexStats() {
  const idx = ensureIndex();
  return { generatedAt: idx.generatedAt, count: idx.count };
}

/**
 * Every set present in the index, newest first. Powers the Set Browser (#23).
 * `total` is the number of printings the index holds for that set.
 * @returns {{ setCode, setName, releasedAt, total }[]}
 */
export function listSets() {
  const idx = ensureIndex();
  return [...idx.bySet.values()]
    .map(s => ({ setCode: s.setCode, setName: s.setName, releasedAt: s.releasedAt, total: s.cards.length }))
    .sort((a, b) =>
      (b.releasedAt || "").localeCompare(a.releasedAt || "") || a.setCode.localeCompare(b.setCode),
    );
}

/** Every printing in a set (raw index rows), or [] if the set is unknown. */
export function cardsInSet(setCode) {
  if (!setCode) return [];
  const idx = ensureIndex();
  const s = idx.bySet.get(String(setCode).toLowerCase());
  return s ? s.cards : [];
}

/**
 * Substring search across the bundled printings. Returns up to `limit`
 * matches deduplicated by oracleId (one printing per card name).
 *
 * Relevance ranking:
 *   100 = exact name match (case-insensitive)
 *    80 = name starts with query
 *    50 = substring match anywhere in "name set #collectorNumber"
 *
 * For tied scores, results come in printing-index insertion order. With
 * 50+ printings of common cards (Sol Ring, Lightning Bolt) this picks
 * the first-encountered printing. Users can disambiguate by typing the
 * set code, e.g. "sol ring c21".
 */
export function searchPrintings(query, limit = 20) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const idx = ensureIndex();

  // Walk in insertion order so tied scores stay stable.
  const seenOracles = new Set();
  const scored = [];

  for (const card of idx.byId.values()) {
    const name = (card.name || "").toLowerCase();
    const setCollector = `${card.set || ""} #${card.collectorNumber || ""}`.toLowerCase();
    const haystack = `${name} ${setCollector}`;

    let score;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (haystack.includes(q)) score = 50;
    else continue;

    // Dedupe by oracleId — keep the first (highest-scored due to walk order)
    // of any given card name.
    if (card.oracleId && seenOracles.has(card.oracleId)) continue;
    if (card.oracleId) seenOracles.add(card.oracleId);

    scored.push({ card, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.card);
}

/**
 * Test-only helper. Clears the in-memory cache so the next call rebuilds
 * from disk. Useful when a test writes a fresh fixture between cases.
 */
export function resetPrintingIndexCache() {
  cachedIndex = null;
}
