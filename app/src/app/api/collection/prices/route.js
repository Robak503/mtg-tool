/**
 * /api/collection/prices — POST writes today's price snapshot.
 *
 * Idempotent per calendar day: a second POST on the same day is a no-op.
 * The client (CollectionView) fires this once on mount; over time it
 * builds the daily history that /api/collection/stats turns into value
 * deltas ("up $X this month").
 *
 * Prices come from the printing index (freshest, refreshed on data sync)
 * with a fallback to the prices stored on each collection row. Old
 * entries are compacted to monthly granularity on every write.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";
import path from "node:path";

import { dataPath, profilePath } from "../../../../lib/server/paths.js";
import { loadCollection } from "../../../../lib/server/collectionStorage.js";
import { loadWatchlist } from "../../../../lib/server/watchlistStorage.js";
import { loadAlerts, writeAlertsAtomic } from "../../../../lib/server/priceAlertStorage.js";
import { applyCrossings } from "../../../../lib/server/priceAlerts.js";
import { resolvePrices } from "../../../../lib/server/priceResolution.js";
import { stapleSnapshotTargets } from "../../../../lib/server/financeUniverse.js";
import {
  todayStamp,
  parseHistory,
  serializeHistory,
  hasSnapshotForDate,
  buildSnapshotEntries,
  buildExtraSnapshotEntries,
  compactHistory,
} from "../../../../lib/server/collectionPrices.js";

// Per-profile price history. Write always targets the active profile's
// collection-prices.jsonl; read falls back to the bundled global seed (see
// readHistory) when the profile has no history yet.
const HISTORY_FILE = () => profilePath("collection-prices.jsonl");
const HISTORY_WRITE_FILE = () => profilePath("collection-prices.jsonl");

// Top EDHREC staples to track daily (beyond owned + grails) so the Finance
// section's "worth getting" movers have a candidate universe to chart.
const STAPLE_SNAPSHOT_LIMIT = 200;

function priceFor(scryfallId, row) {
  // Resolve through the full fallback chain so a snapshot records a real
  // value even for cards TCGPlayer can't price: row → printing index
  // (sync-fresh TCGPlayer) → Card Kingdom retail.
  return resolvePrices(scryfallId, row?.prices);
}

async function readHistory() {
  try {
    return parseHistory(await fs.readFile(HISTORY_FILE(), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  // No per-profile history yet: seed from the bundled global baseline of
  // staple prices (resources/data via MTG_REFERENCE_DIR) so day-1 Finance has
  // a value line. These are universal market prices, not personal data; the
  // merged result is then written into the active profile by the caller.
  try {
    return parseHistory(await fs.readFile(dataPath("collection-prices.jsonl"), "utf8"));
  } catch {
    return [];
  }
}

async function writeHistoryAtomic(entries) {
  await fs.mkdir(path.dirname(HISTORY_WRITE_FILE()), { recursive: true });
  const target = HISTORY_WRITE_FILE();
  const tmp = `${target}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, serializeHistory(entries), "utf8");
  await fs.rename(tmp, target);
}

export async function POST() {
  try {
    const { collection } = await loadCollection();
    const stamp = todayStamp();
    const history = await readHistory();

    if (hasSnapshotForDate(history, stamp)) {
      return Response.json({ snapped: false, alreadyExisted: true, dateStamp: stamp });
    }

    const ownedEntries = buildSnapshotEntries(collection, stamp, priceFor);
    const ownedIds = new Set(ownedEntries.map(e => e.scryfallId));

    // Also snapshot the finance "universe" — grails + top staples — so movers
    // accrue for cards the user doesn't own yet. Best-effort: if the indexes
    // aren't synced, skip the extras rather than fail the owned snapshot.
    let extraEntries = [];
    try {
      const { watchlist } = await loadWatchlist();
      const grailTargets = (watchlist.cards || []).map(card => ({
        scryfallId: card.scryfallId,
        prices: resolvePrices(card.scryfallId, null),
      }));
      const stapleTargets = stapleSnapshotTargets(STAPLE_SNAPSHOT_LIMIT);
      extraEntries = buildExtraSnapshotEntries([...grailTargets, ...stapleTargets], stamp, ownedIds);
    } catch (error) {
      console.warn("[/api/collection/prices] universe snapshot skipped:", error.message);
    }

    const entries = [...ownedEntries, ...extraEntries];
    if (entries.length === 0) {
      return Response.json({
        snapped: false,
        alreadyExisted: false,
        dateStamp: stamp,
        entryCount: 0,
        reason: "no cards to snapshot",
      });
    }

    const merged = compactHistory([...history, ...entries]);
    await writeHistoryAtomic(merged);

    // Re-evaluate price alerts against this snapshot's prices, stamping
    // crossing state (#1). Best-effort: a failure here must not lose the
    // snapshot we just wrote.
    let alertsTriggered = 0;
    try {
      const { store } = await loadAlerts();
      if (store.alerts.length) {
        const priceByScryfall = new Map(merged.map(e => [e.scryfallId, e.usd]));
        const priceForAlert = (id) => priceByScryfall.get(id) ?? resolvePrices(id, null)?.usd ?? null;
        const { alerts, newlyTriggered } = applyCrossings(store.alerts, priceForAlert);
        await writeAlertsAtomic({ alerts });
        alertsTriggered = newlyTriggered.length;
      }
    } catch (error) {
      console.warn("[/api/collection/prices] alert crossing skipped:", error.message);
    }

    return Response.json({
      snapped: true,
      dateStamp: stamp,
      entryCount: entries.length,
      ownedCount: ownedEntries.length,
      extraCount: extraEntries.length,
      alertsTriggered,
    });
  } catch (error) {
    return Response.json({ error: error.message || "Snapshot failed" }, { status: 500 });
  }
}
