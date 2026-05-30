/**
 * /api/collection/refresh-prices — POST re-pulls LIVE Scryfall prices for
 * owned cards whose stored TCGPlayer price is null, and writes the fresh
 * numbers back to the collection.
 *
 * This is the user's workaround for "TCGPlayer shows copies for sale but
 * Scryfall reports no price": Scryfall's market price is computed from recent
 * sales and lags, so a card unpriced at sync time often has a real number a
 * few days later. The button re-pulls just the gaps.
 *
 * Local-first: user-triggered, bounded to the cards that need it, result
 * persisted to disk, never polled. Uses Scryfall's batch endpoint (75/call),
 * throttled. Cards Scryfall still can't price keep their Card Kingdom
 * fallback at display time, so the collection never shows a nil value.
 */

export const runtime = "nodejs";

import {
  loadCollection,
  writeCollectionAtomic,
  withCollectionLock,
  CollectionVersionMismatch,
} from "../../../../lib/server/collectionStorage.js";
import { fetchScryfallPrices } from "../../../../lib/server/scryfallPriceFetch.js";

// Bound a single refresh so a huge collection can't fan out into hundreds of
// Scryfall calls in one click. Anything beyond this is reported, not dropped
// silently — a second click picks up the rest.
const MAX_REFRESH = 500;

const FINISH_KEYS = { foil: "usdFoil", etched: "usdEtched" };
function finishKey(finish) {
  return FINISH_KEYS[finish] || "usd";
}

/** Finishes the user owns (qty > 0); falls back to nonfoil for wishlist rows. */
function relevantFinishes(row) {
  const owned = (row.stacks || []).filter(s => (s.quantity || 0) > 0).map(s => s.finish);
  return owned.length ? owned : ["nonfoil"];
}

/** A row needs a live re-pull if any finish it cares about has no stored price. */
function rowNeedsRefresh(row) {
  const prices = row.prices || {};
  return relevantFinishes(row).some(f => {
    const v = prices[finishKey(f)];
    return v == null || v === "";
  });
}

export async function POST() {
  try {
    const { collection } = await loadCollection();
    const rows = Array.isArray(collection.cards) ? collection.cards : [];

    const needing = rows.filter(r => r.scryfallId && rowNeedsRefresh(r));
    const neededIds = [...new Set(needing.map(r => r.scryfallId))];

    if (neededIds.length === 0) {
      return Response.json({ checked: rows.length, needed: 0, refreshed: 0, stillNull: 0, capped: false });
    }

    const capped = neededIds.length > MAX_REFRESH;
    const idsToFetch = neededIds.slice(0, MAX_REFRESH);

    let liveMap;
    try {
      liveMap = await fetchScryfallPrices(idsToFetch);
    } catch (error) {
      return Response.json(
        { error: `Could not reach Scryfall: ${error.message || "request failed"}` },
        { status: 502 },
      );
    }

    // Apply under the lock so a concurrent add/edit can't clobber our write.
    const { refreshed, stillNull } = await withCollectionLock(async () => {
      const { collection: fresh } = await loadCollection();
      let refreshedCount = 0;
      for (const row of fresh.cards || []) {
        const live = row.scryfallId && liveMap.get(row.scryfallId);
        if (!live) continue;
        const prices = { ...(row.prices || {}) };
        let changed = false;
        for (const key of ["usd", "usdFoil", "usdEtched"]) {
          if ((prices[key] == null || prices[key] === "") && live[key] != null) {
            prices[key] = live[key];
            changed = true;
          }
        }
        if (changed) {
          row.prices = prices;
          refreshedCount++;
        }
      }
      const stillNullCount = (fresh.cards || []).filter(r => r.scryfallId && rowNeedsRefresh(r)).length;
      if (refreshedCount > 0) await writeCollectionAtomic(fresh);
      return { refreshed: refreshedCount, stillNull: stillNullCount };
    });

    return Response.json({
      checked: rows.length,
      needed: neededIds.length,
      fetched: idsToFetch.length,
      refreshed,
      stillNull,
      capped,
    });
  } catch (error) {
    if (error instanceof CollectionVersionMismatch) {
      return Response.json({ error: error.message, code: error.code }, { status: 409 });
    }
    return Response.json({ error: error.message || "Price refresh failed" }, { status: 500 });
  }
}
