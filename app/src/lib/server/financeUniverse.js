/**
 * financeUniverse.js — the set of cards the Finance section tracks/suggests.
 *
 * "Worth getting" staples come from EDHREC play-rank (edhrec_rank in the oracle
 * index — lower = more played) across all of Commander, NOT filtered to the
 * user's colors. Each staple is mapped to a representative (cheapest-priced)
 * printing so we have a scryfallId + price to track and display.
 *
 * Pricing flows through resolvePrices (Scryfall TCGPlayer → printing index →
 * Card Kingdom), so a staple always shows a real number when one exists.
 */

import { getCardIndex } from "./cardIndex.js";
import { lookupByName } from "./printingIndex.js";
import { resolvePrices } from "./priceResolution.js";

const BASIC_LANDS = new Set([
  "Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes",
  "Snow-Covered Plains", "Snow-Covered Island", "Snow-Covered Swamp",
  "Snow-Covered Mountain", "Snow-Covered Forest", "Snow-Covered Wastes",
]);

let _staplesCache = null;

/**
 * Top Commander staples by EDHREC rank (most-played first). Commander-legal,
 * non-basic-land, real cards only. Cached per process (the oracle index is
 * static at runtime).
 * @returns {{ name, oracleId, edhrecRank }[]}
 */
export function topStaples(limit = 200) {
  if (!_staplesCache) {
    const repo = getCardIndex();
    _staplesCache = (repo.cards || [])
      .filter(c => typeof c.edhrec_rank === "number" && c.edhrec_rank > 0)
      .filter(c => c.legalities?.commander === "legal")
      .filter(c => c.layout !== "art_series")
      .filter(c => !BASIC_LANDS.has(c.name))
      .sort((a, b) => a.edhrec_rank - b.edhrec_rank)
      .map(c => ({ name: c.name, oracleId: c.oracle_id, edhrecRank: c.edhrec_rank }));
  }
  return _staplesCache.slice(0, Math.max(0, limit));
}

/**
 * Pick a representative printing for a card name — the cheapest one that has a
 * resolvable USD price (falls back to the first printing). Returns the printing
 * identity + resolved prices, or null if the name isn't in the printings index.
 */
export function representativePrinting(name) {
  const printings = lookupByName(name);
  if (!printings.length) return null;

  let best = null;
  let bestPrice = Infinity;
  for (const p of printings) {
    const usd = parseFloat(p.prices?.usd);
    if (Number.isFinite(usd) && usd < bestPrice) {
      bestPrice = usd;
      best = p;
    }
  }
  const chosen = best || printings[0];
  return {
    scryfallId: chosen.id,
    oracleId: chosen.oracleId,
    name: chosen.name,
    setCode: chosen.set,
    setName: chosen.setName,
    collectorNumber: chosen.collectorNumber,
    artCropUrl: chosen.artCropUrl || null,
    prices: resolvePrices(chosen.id, chosen.prices),
  };
}

/**
 * Representative-printing snapshot targets for the top staples — the extra
 * scryfallIds the daily price snapshot should record so staple movers accrue.
 * @returns {{ scryfallId, prices }[]}
 */
export function stapleSnapshotTargets(limit = 200) {
  const targets = [];
  const seen = new Set();
  for (const staple of topStaples(limit)) {
    const rep = representativePrinting(staple.name);
    if (rep?.scryfallId && !seen.has(rep.scryfallId)) {
      seen.add(rep.scryfallId);
      targets.push({ scryfallId: rep.scryfallId, prices: rep.prices });
    }
  }
  return targets;
}

export function resetStaplesCacheForTests() {
  _staplesCache = null;
}
