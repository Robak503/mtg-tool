/**
 * collectionPrices.js — price-history snapshotting, compaction, and delta
 * computation for the Collection value-over-time feature.
 *
 * History lives in collection-prices.jsonl (one JSON object per line):
 *   { snappedAt: "YYYY-MM-DD", scryfallId, usd, usdFoil, usdEtched }
 *
 * Snapshots are written at most once per calendar day (idempotent — the
 * POST /api/collection/prices route refuses a second write for the same
 * day). Entries older than COMPACT_AFTER_DAYS are rolled up to one entry
 * per scryfallId per month so the file stays bounded over years of use.
 *
 * Deltas value CURRENT holdings at historical prices: "the cards you own
 * now are worth $X more than they were 30 days ago" (price movement, not
 * portfolio-size change). This needs a snapshot at or before the lookback
 * date; when none exists the delta is null and the UI shows nothing
 * rather than a misleading $0.
 *
 * Functions are pure — the route injects the price lookup and the clock.
 */

export const COMPACT_AFTER_DAYS = 90;

const DAY_MS = 86_400_000;

export function todayStamp(now = new Date()) {
  return new Date(now).toISOString().slice(0, 10);
}

function shiftDays(now, days) {
  return new Date(new Date(now).getTime() - days * DAY_MS);
}

export function parseHistory(raw) {
  if (!raw) return [];
  return raw
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function serializeHistory(entries) {
  return entries.map(e => JSON.stringify(e)).join("\n") + (entries.length ? "\n" : "");
}

export function hasSnapshotForDate(history, dateStamp) {
  return history.some(e => e.snappedAt === dateStamp);
}

/**
 * Build today's snapshot entries for every owned (non-wishlist) printing.
 *
 * priceFor(scryfallId, row) returns { usd, usdFoil, usdEtched } — the
 * route wires this to the printing index (freshest prices) with a
 * fallback to the row's stored prices.
 */
export function buildSnapshotEntries(collection, dateStamp, priceFor) {
  const entries = [];
  if (!collection || !Array.isArray(collection.cards)) return entries;

  const seen = new Set();
  for (const row of collection.cards) {
    if (row.wishlist) continue;
    if (!row.scryfallId) continue;
    const owned = (row.stacks || []).some(s => (s.quantity || 0) > 0);
    if (!owned) continue;
    if (seen.has(row.scryfallId)) continue;
    seen.add(row.scryfallId);

    const prices = (priceFor && priceFor(row.scryfallId, row)) || row.prices || {};
    entries.push({
      snappedAt: dateStamp,
      scryfallId: row.scryfallId,
      usd: prices.usd ?? null,
      usdFoil: prices.usdFoil ?? prices.usd_foil ?? null,
      usdEtched: prices.usdEtched ?? prices.usd_etched ?? null,
    });
  }
  return entries;
}

/**
 * Roll up entries older than compactAfterDays to one (latest) entry per
 * scryfallId per calendar month. Recent entries keep daily granularity.
 */
export function compactHistory(history, now = new Date(), compactAfterDays = COMPACT_AFTER_DAYS) {
  const cutoff = todayStamp(shiftDays(now, compactAfterDays));
  const recent = [];
  const oldByKey = new Map();

  for (const e of history) {
    if (!e || !e.snappedAt) continue;
    if (e.snappedAt >= cutoff) {
      recent.push(e);
    } else {
      const ym = e.snappedAt.slice(0, 7); // YYYY-MM
      const key = `${ym}:${e.scryfallId}`;
      const existing = oldByKey.get(key);
      if (!existing || e.snappedAt > existing.snappedAt) oldByKey.set(key, e);
    }
  }

  return [...oldByKey.values(), ...recent].sort((a, b) =>
    a.snappedAt.localeCompare(b.snappedAt),
  );
}

/**
 * Build snapshot entries for an explicit list of price targets (grails, staple
 * representative printings) so per-card movers accrue beyond just owned cards.
 *
 * targets: [{ scryfallId, prices: { usd, usdFoil, usdEtched } }] — prices
 * already resolved by the caller. excludeIds skips scryfallIds already
 * snapshotted (e.g. owned cards) so the day's history has one row per card.
 */
export function buildExtraSnapshotEntries(targets, dateStamp, excludeIds = new Set()) {
  const entries = [];
  const seen = new Set(excludeIds);
  for (const target of targets || []) {
    if (!target?.scryfallId || seen.has(target.scryfallId)) continue;
    seen.add(target.scryfallId);
    const prices = target.prices || {};
    entries.push({
      snappedAt: dateStamp,
      scryfallId: target.scryfallId,
      usd: prices.usd ?? null,
      usdFoil: prices.usdFoil ?? prices.usd_foil ?? null,
      usdEtched: prices.usdEtched ?? prices.usd_etched ?? null,
    });
  }
  return entries;
}

/**
 * Per-card price movers over a lookback window (nonfoil USD).
 *
 * For each scryfallId (optionally restricted to `scryfallIds`), compares the
 * latest snapshot's price to the nearest snapshot on or before now-windowDays.
 * Returns movers (nonzero change, valid past price) sorted by % change
 * descending — risers first, fallers last. Empty until history spans the
 * window, which is the honest local-first state on a fresh install.
 *
 * @returns {{ scryfallId, current, past, asOf, absChange, pctChange }[]}
 */
export function computeCardMovers(history, scryfallIds = null, now = new Date(), windowDays = 30) {
  const byDate = groupByDate(history);
  const dates = Array.from(byDate.keys()).sort();
  if (dates.length === 0) return [];

  const currentDate = dates[dates.length - 1];
  const target = todayStamp(shiftDays(now, windowDays));
  const pastDate = nearestOnOrBefore(dates, target);
  if (!pastDate || pastDate === currentDate) return [];

  const currentMap = byDate.get(currentDate);
  const pastMap = byDate.get(pastDate);
  const ids = scryfallIds ? new Set(scryfallIds) : null;
  const movers = [];

  for (const [scryfallId, entry] of currentMap) {
    if (ids && !ids.has(scryfallId)) continue;
    const current = parseFloat(entry.usd);
    const pastEntry = pastMap.get(scryfallId);
    const past = pastEntry ? parseFloat(pastEntry.usd) : NaN;
    if (!Number.isFinite(current) || !Number.isFinite(past) || past <= 0) continue;
    const absChange = Math.round((current - past) * 100) / 100;
    if (absChange === 0) continue;
    const pctChange = Math.round(((current - past) / past) * 1000) / 10;
    movers.push({ scryfallId, current, past, asOf: pastDate, absChange, pctChange });
  }

  movers.sort((a, b) => b.pctChange - a.pctChange);
  return movers;
}

/**
 * The nonfoil-USD price series for a single card, oldest→newest, one point per
 * day (last write per day wins). For per-card sparklines. Skips entries with no
 * parseable USD. `maxPoints` keeps only the most recent N points.
 * @returns {{ snappedAt: string, usd: number }[]}
 */
export function cardPriceSeries(history, scryfallId, { maxPoints = 90 } = {}) {
  if (!scryfallId) return [];
  const byDate = new Map();
  for (const e of history || []) {
    if (!e || e.scryfallId !== scryfallId || !e.snappedAt) continue;
    const usd = parseFloat(e.usd);
    if (!Number.isFinite(usd)) continue;
    byDate.set(e.snappedAt, usd); // last write for a date wins
  }
  const series = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([snappedAt, usd]) => ({ snappedAt, usd }));
  return maxPoints > 0 && series.length > maxPoints ? series.slice(-maxPoints) : series;
}

/**
 * Value the collection's CURRENT holdings at each snapshot date's prices,
 * oldest→newest. Answers "what would the cards I own now have been worth back
 * then" — price movement of the current portfolio, the same basis as
 * computeDeltas (we don't store historical holdings, only price history).
 * Dates with no usable prices value to 0. `maxPoints` keeps the most recent N.
 * @returns {{ snappedAt: string, value: number }[]}
 */
export function collectionValueSeries(collection, history, { maxPoints = 90 } = {}) {
  const byDate = groupByDate(history || []);
  const dates = Array.from(byDate.keys()).sort();
  const series = dates.map((d) => ({
    snappedAt: d,
    value: valueCollectionAtPrices(collection, byDate.get(d)),
  }));
  return maxPoints > 0 && series.length > maxPoints ? series.slice(-maxPoints) : series;
}

/**
 * Deal radar (#8): cards currently sitting at/near their low over a window AND
 * meaningfully down from the window high — i.e. "buy-the-dip" candidates among
 * the cards you care about. Restrict to `scryfallIds` (owned + grails) when
 * given. Empty until history spans the window (honest day-1 state).
 *
 * A card qualifies when, over the last `windowDays`:
 *   - current price is within `nearPct`% of the window minimum (near the low)
 *   - current is at least `minDipPct`% below the window maximum (it actually dipped)
 *
 * @returns {{ scryfallId, current, low, high, pctAboveLow, dipPct }[]}  (biggest dip first)
 */
export function computeDeals(
  history,
  scryfallIds = null,
  now = new Date(),
  { windowDays = 90, nearPct = 5, minDipPct = 10 } = {},
) {
  const byDate = groupByDate(history || []);
  const dates = Array.from(byDate.keys()).sort();
  if (dates.length === 0) return [];

  const currentDate = dates[dates.length - 1];
  const cutoff = todayStamp(shiftDays(now, windowDays));
  const windowDates = dates.filter((d) => d >= cutoff);
  if (windowDates.length < 2) return [];

  const currentMap = byDate.get(currentDate);
  const ids = scryfallIds ? new Set(scryfallIds) : null;
  const deals = [];

  for (const [scryfallId, entry] of currentMap) {
    if (ids && !ids.has(scryfallId)) continue;
    const current = parseFloat(entry.usd);
    if (!Number.isFinite(current) || current <= 0) continue;

    let low = Infinity;
    let high = -Infinity;
    for (const d of windowDates) {
      const e = byDate.get(d).get(scryfallId);
      const p = e ? parseFloat(e.usd) : NaN;
      if (!Number.isFinite(p) || p <= 0) continue;
      if (p < low) low = p;
      if (p > high) high = p;
    }
    if (!Number.isFinite(low) || low <= 0 || high <= low) continue;

    const pctAboveLow = ((current - low) / low) * 100;
    const dipPct = ((high - current) / high) * 100;
    if (pctAboveLow <= nearPct && dipPct >= minDipPct) {
      deals.push({
        scryfallId,
        current,
        low: Math.round(low * 100) / 100,
        high: Math.round(high * 100) / 100,
        pctAboveLow: Math.round(pctAboveLow * 10) / 10,
        dipPct: Math.round(dipPct * 10) / 10,
      });
    }
  }

  deals.sort((a, b) => b.dipPct - a.dipPct);
  return deals;
}

function priceForFinish(priceObj, finish) {
  if (!priceObj) return 0;
  const key = finish === "foil" ? "usdFoil" : finish === "etched" ? "usdEtched" : "usd";
  const v = parseFloat(priceObj[key]);
  return Number.isFinite(v) ? v : 0;
}

/**
 * Value the collection's CURRENT holdings using a per-scryfallId price map
 * (as captured in a single day's snapshot).
 */
export function valueCollectionAtPrices(collection, priceMap) {
  if (!collection || !Array.isArray(collection.cards)) return 0;
  let total = 0;
  for (const row of collection.cards) {
    if (row.wishlist) continue;
    const prices = priceMap.get(row.scryfallId);
    if (!prices) continue;
    for (const stack of row.stacks || []) {
      const qty = stack.quantity || 0;
      if (qty <= 0) continue;
      total += priceForFinish(prices, stack.finish) * qty;
    }
  }
  return Math.round(total * 100) / 100;
}

function groupByDate(history) {
  const byDate = new Map();
  for (const e of history) {
    if (!e || !e.snappedAt || !e.scryfallId) continue;
    if (!byDate.has(e.snappedAt)) byDate.set(e.snappedAt, new Map());
    byDate.get(e.snappedAt).set(e.scryfallId, e);
  }
  return byDate;
}

function nearestOnOrBefore(sortedDates, targetStamp) {
  let best = null;
  for (const d of sortedDates) {
    if (d <= targetStamp) best = d;
    else break;
  }
  return best;
}

/**
 * Compute 30 / 90 / 365-day value deltas for current holdings.
 * Returns { d30, d90, d365 } where each is null (no snapshot that old)
 * or { asOf, pastValue, currentValue, delta }.
 */
export function computeDeltas(collection, history, now = new Date()) {
  const result = { d30: null, d90: null, d365: null };
  const byDate = groupByDate(history);
  const dates = Array.from(byDate.keys()).sort();
  if (dates.length === 0) return result;

  const currentDate = dates[dates.length - 1];
  const currentValue = valueCollectionAtPrices(collection, byDate.get(currentDate));

  for (const [key, days] of [["d30", 30], ["d90", 90], ["d365", 365]]) {
    const target = todayStamp(shiftDays(now, days));
    const snapDate = nearestOnOrBefore(dates, target);
    // Don't compare today against today — needs a genuinely older snapshot.
    if (!snapDate || snapDate === currentDate) {
      result[key] = null;
      continue;
    }
    const pastValue = valueCollectionAtPrices(collection, byDate.get(snapDate));
    result[key] = {
      asOf: snapDate,
      pastValue,
      currentValue,
      delta: Math.round((currentValue - pastValue) * 100) / 100,
    };
  }
  return result;
}
