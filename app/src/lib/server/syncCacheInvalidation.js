/**
 * syncCacheInvalidation.js — drop stale in-memory caches after an in-app sync.
 *
 * The in-app data sync (/api/sync-data) runs each script in a CHILD process
 * that writes fresh files to the data dir. The server process holds its own
 * in-memory singleton caches (cardIndex, spellbook, salt, Card Kingdom prices,
 * rules index) loaded from those files — and would keep serving the STALE copy
 * until a restart. After a sync phase succeeds we drop the caches whose on-disk
 * source it just rewrote, so the next lookup reloads the fresh data. (A5.)
 */

import { resetCardIndexForTests as resetCardIndexCache } from "./cardIndex.js";
import { resetRulesRetrievalForTests as resetRulesRetrievalCache } from "./rulesRetrieval.js";
import { resetSpellbookCache } from "./spellbook.js";
import { resetEdhrecSaltCache } from "./edhrecSalt.js";
import { resetCardKingdomPricesCache } from "./cardKingdomPrices.js";
import { resetPrintingIndexCache } from "./printingIndex.js";

// Each /api/sync-data action → the caches whose on-disk source it rewrites.
export const CACHE_RESETTERS = {
  "scryfall-bulk":      [resetCardIndexCache],        // oracle_cards.json + rulings.json
  "oracle-index":       [resetCardIndexCache],        // oracle-index.json (preferred card source)
  "printings-index":    [resetPrintingIndexCache],    // printings-index.json (Vault card lookups)
  "spellbook":          [resetSpellbookCache],
  "edhrec-salt":        [resetEdhrecSaltCache],
  "cardkingdom-prices": [resetCardKingdomPricesCache],
  "rules-index":        [resetRulesRetrievalCache],
};

/**
 * Invalidate the caches affected by a completed sync action. No-op for unknown
 * actions. A failing reset must never break the sync's HTTP response.
 */
export function invalidateCachesFor(action) {
  for (const reset of CACHE_RESETTERS[action] || []) {
    try {
      reset();
    } catch {
      /* a cache reset must never break the sync response */
    }
  }
}
