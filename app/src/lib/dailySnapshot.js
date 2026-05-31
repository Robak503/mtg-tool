/**
 * dailySnapshot.js — fire the daily price-history snapshot on app launch.
 *
 * The snapshot (POST /api/collection/prices) records today's prices for owned
 * cards plus the finance "universe" (grails + top staples) into
 * collection-prices.jsonl. It is idempotent per day server-side, so calling it
 * on every launch is a cheap no-op after the first.
 *
 * Previously it only fired when the Vault view mounted, so price history — and
 * therefore the Finance movers — accrued slowly or never for users who rarely
 * open the collection. Firing it once on launch makes history accrue reliably.
 * (Vault V1 #21.)
 */

const SNAPSHOT_ENDPOINT = "/api/collection/prices";

/**
 * Best-effort, fire-and-forget. Never rejects — the snapshot is advisory and
 * must not surface errors at launch. `fetchImpl` is injectable for tests.
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<void>}
 */
export function ensureDailySnapshot(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") return Promise.resolve();
  return Promise.resolve()
    .then(() => fetchImpl(SNAPSHOT_ENDPOINT, { method: "POST" }))
    .then(() => undefined)
    .catch(() => undefined);
}
