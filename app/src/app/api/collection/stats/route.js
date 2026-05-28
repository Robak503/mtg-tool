/**
 * /api/collection/stats — summary stats over the user's collection.
 *
 * v1 returns current value + counts. Historical deltas require a
 * `collection-prices.jsonl` populated by the sync pipeline (Step 13.1
 * follow-up); for now we just compute the snapshot at request time
 * using current prices stored on each row, and surface a notice when
 * no history file exists.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";

import { dataPath } from "../../../../lib/server/paths.js";
import { loadCollection } from "../../../../lib/server/collectionStorage.js";
import { collectionSummary } from "../../../../lib/server/collectionContext.js";

async function loadPriceHistory() {
  try {
    const raw = await fs.readFile(dataPath("collection-prices.jsonl"), "utf8");
    const lines = raw.split("\n").map(s => s.trim()).filter(Boolean);
    return lines.map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function summarizeHistory(history, scryfallIds) {
  if (history.length === 0) return null;
  // Filter to entries relevant to this user's collection
  const relevant = history.filter(h => scryfallIds.has(h.scryfallId));
  if (relevant.length === 0) return null;

  // Group by snappedAt date
  const byDate = new Map();
  for (const entry of relevant) {
    const date = entry.snappedAt;
    if (!byDate.has(date)) byDate.set(date, new Map());
    byDate.get(date).set(entry.scryfallId, entry);
  }
  const dates = Array.from(byDate.keys()).sort();
  return { dates, byDate };
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
    const histSummary = summarizeHistory(history, scryfallIds);

    return Response.json({
      counts: {
        totalCards: summary.totalCards,
        uniqueOracles: summary.uniqueOracles,
        wishlistCount: (collection.cards || []).filter(c => c.wishlist).length,
      },
      value: {
        currentUsd: summary.totalValueUsd,
        // Historical deltas require populated history. When absent, the
        // UI shows a "snapshot will start tracking" hint instead of
        // misleading "$0 delta".
        deltas: histSummary ? null : null,
      },
      colorBreakdown: summary.colorBreakdown,
      historyAvailable: histSummary !== null,
      historyDates: histSummary ? histSummary.dates : [],
    });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to load stats" }, { status: 500 });
  }
}
