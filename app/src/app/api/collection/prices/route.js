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

import { dataDir, dataPath } from "../../../../lib/server/paths.js";
import { loadCollection } from "../../../../lib/server/collectionStorage.js";
import { loadWatchlist } from "../../../../lib/server/watchlistStorage.js";
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

const HISTORY_FILE = () => dataPath("collection-prices.jsonl");

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
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeHistoryAtomic(entries) {
  await fs.mkdir(dataDir(), { recursive: true });
  const target = HISTORY_FILE();
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

    return Response.json({
      snapped: true,
      dateStamp: stamp,
      entryCount: entries.length,
      ownedCount: ownedEntries.length,
      extraCount: extraEntries.length,
    });
  } catch (error) {
    return Response.json({ error: error.message || "Snapshot failed" }, { status: 500 });
  }
}
