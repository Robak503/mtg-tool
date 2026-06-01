/**
 * /api/collection/stats — summary stats over the user's collection.
 *
 * Returns current value + counts + color breakdown, plus 30/90/365-day
 * value deltas when price history exists. History is populated by
 * POST /api/collection/prices (fired on CollectionView mount). With no
 * history yet, deltas are null and the UI shows a "tracking will start"
 * hint instead of a misleading $0 delta.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";

import { dataPath } from "../../../../lib/server/paths.js";
import { loadCollection } from "../../../../lib/server/collectionStorage.js";
import { collectionSummary } from "../../../../lib/server/collectionContext.js";
import { enrichCollectionPrices } from "../../../../lib/server/priceResolution.js";
import { parseHistory, computeDeltas, collectionValueSeries } from "../../../../lib/server/collectionPrices.js";
import { computeCollectionBreakdowns } from "../../../../lib/server/collectionStats.js";
import { lookupCard } from "../../../../lib/server/cardIndex.js";
import { lookupById } from "../../../../lib/server/printingIndex.js";

// Resolve a row's oracle metadata for composition breakdowns. Best-effort:
// returns null breakdowns if the local card index isn't synced (e.g. CI) so the
// rest of the stats payload still returns.
function buildBreakdowns(collection) {
  try {
    const getMeta = (row) => {
      const oracle = lookupCard(row.name);
      const printing = row.scryfallId ? lookupById(row.scryfallId) : null;
      // Color identity (Commander's meaningful axis) — present in the slim
      // oracle index; fall back to cost colors / face colors for older data.
      const colors = oracle?.color_identity?.length
        ? oracle.color_identity
        : oracle?.colors?.length
          ? oracle.colors
          : (oracle?.card_faces?.flatMap((f) => f.colors || []) || []);
      return {
        typeLine: oracle?.type_line || null,
        cmc: oracle?.cmc,
        colors,
        // Rarity is printing-specific; the slim oracle index doesn't carry it,
        // so prefer the printing's rarity, falling back to the oracle's.
        rarity: printing?.rarity || oracle?.rarity || null,
        setName: printing?.setName || oracle?.set_name || null,
      };
    };
    return computeCollectionBreakdowns(collection, getMeta);
  } catch (error) {
    console.warn("[/api/collection/stats] breakdowns skipped:", error.message);
    return null;
  }
}

async function loadPriceHistory() {
  try {
    return parseHistory(await fs.readFile(dataPath("collection-prices.jsonl"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function GET() {
  try {
    const { collection } = await loadCollection();
    // Value the Overview total off resolved prices (TCGPlayer → printing index
    // → Card Kingdom) so a card TCGPlayer can't price still counts.
    const summary = collectionSummary(enrichCollectionPrices(collection));

    const scryfallIds = new Set(
      (collection.cards || [])
        .filter(c => !c.wishlist)
        .map(c => c.scryfallId)
        .filter(Boolean),
    );

    const history = await loadPriceHistory();
    // Only history for cards the user currently owns is meaningful here.
    const relevant = history.filter(h => scryfallIds.has(h.scryfallId));
    const historyDates = Array.from(new Set(relevant.map(h => h.snappedAt))).sort();

    const deltas = computeDeltas(collection, relevant, new Date());

    return Response.json({
      counts: {
        totalCards: summary.totalCards,
        uniqueOracles: summary.uniqueOracles,
        wishlistCount: (collection.cards || []).filter(c => c.wishlist).length,
      },
      value: {
        currentUsd: summary.totalValueUsd,
        deltas, // { d30, d90, d365 } — each null or { asOf, pastValue, currentValue, delta }
        series: collectionValueSeries(collection, relevant), // [{ snappedAt, value }] oldest→newest
      },
      colorBreakdown: summary.colorBreakdown,
      breakdowns: buildBreakdowns(collection),
      historyAvailable: historyDates.length > 0,
      historyDates,
    });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to load stats" }, { status: 500 });
  }
}
