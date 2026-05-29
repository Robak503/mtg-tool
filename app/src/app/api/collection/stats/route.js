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
import { parseHistory, computeDeltas } from "../../../../lib/server/collectionPrices.js";

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
    const summary = collectionSummary(collection);

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
      },
      colorBreakdown: summary.colorBreakdown,
      historyAvailable: historyDates.length > 0,
      historyDates,
    });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to load stats" }, { status: 500 });
  }
}
