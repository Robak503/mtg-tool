/**
 * priceAlerts.js — per-card price-target alerts (Vault #1).
 *
 * An alert is a target price + direction on one printing (scryfallId):
 *   - "below": fires when the current price is at or under the target
 *              (a buy signal — "tell me when this grail dips to $X")
 *   - "above": fires when the current price is at or over the target
 *              (a sell / spike signal — "tell me when this owned card hits $X")
 *
 * Stored at data/price-alerts.json:
 *   { version: 1, updatedAt, alerts: [
 *       { scryfallId, name, target, direction, createdAt,
 *         triggeredAt, lastPrice }
 *   ] }
 *
 * `triggeredAt` / `lastPrice` are crossing state, stamped by the daily price
 * snapshot (POST /api/collection/prices): an alert that newly meets its target
 * gets `triggeredAt` set; one that no longer meets it is re-armed (cleared) so
 * a price that dips, recovers, then dips again fires again. This keeps the
 * "flag on snapshot crossing" honest rather than re-firing on every read.
 *
 * Functions are pure — the caller injects current prices and the clock.
 */

export const DIRECTIONS = ["below", "above"];

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/** Coerce an arbitrary stored/POSTed object into one valid alert, or null. */
export function normalizeAlert(raw, nowIso) {
  if (!raw || !raw.scryfallId) return null;
  const target = num(raw.target);
  if (target === null || target <= 0) return null;
  const direction = DIRECTIONS.includes(raw.direction) ? raw.direction : "below";
  return {
    scryfallId: raw.scryfallId,
    name: raw.name || "",
    target: Math.round(target * 100) / 100,
    direction,
    createdAt: raw.createdAt || nowIso,
    triggeredAt: raw.triggeredAt || null,
    lastPrice: num(raw.lastPrice),
  };
}

/** Normalize a whole payload into { version, updatedAt, alerts } (deduped by scryfallId). */
export function normalizeAlerts(payload, nowIso = new Date().toISOString()) {
  const list = Array.isArray(payload?.alerts) ? payload.alerts : [];
  const seen = new Set();
  const alerts = [];
  for (const raw of list) {
    const alert = normalizeAlert(raw, nowIso);
    if (!alert || seen.has(alert.scryfallId)) continue;
    seen.add(alert.scryfallId);
    alerts.push(alert);
  }
  return { version: 1, updatedAt: nowIso, alerts };
}

/** Does `price` satisfy the alert's direction/target? (null price never meets.) */
export function isMet(alert, price) {
  const p = num(price);
  if (p === null) return false;
  return alert.direction === "above" ? p >= alert.target : p <= alert.target;
}

/**
 * Annotate alerts with the current price and whether they're met right now.
 * `priceForId(scryfallId)` returns a number/string price (nonfoil USD) or null.
 * @returns {(alert & { currentPrice: number|null, met: boolean })[]}
 */
export function evaluateAlerts(alerts, priceForId) {
  return (alerts || []).map((alert) => {
    const currentPrice = num(priceForId(alert.scryfallId));
    return { ...alert, currentPrice, met: isMet(alert, currentPrice) };
  });
}

/**
 * Apply a fresh price read to the alert list, updating crossing state:
 *   - newly met (and not already triggered)  → stamp triggeredAt + lastPrice
 *   - no longer met (was triggered)          → clear triggeredAt (re-arm)
 *   - still met / still un-met               → refresh lastPrice only
 *
 * Returns the updated list plus the alerts that fired on THIS read so a caller
 * can surface "3 price alerts hit today".
 *
 * @returns {{ alerts, newlyTriggered }}
 */
export function applyCrossings(alerts, priceForId, nowIso = new Date().toISOString()) {
  const newlyTriggered = [];
  const updated = (alerts || []).map((alert) => {
    const currentPrice = num(priceForId(alert.scryfallId));
    const wasTriggered = !!alert.triggeredAt;
    const next = { ...alert };
    // A missing price this snapshot is NOT a reversal — leave crossing state and
    // lastPrice untouched, so an alert that briefly loses its price doesn't get
    // re-armed and then spuriously re-fire when the price reappears unchanged.
    if (currentPrice === null) return next;

    next.lastPrice = currentPrice;
    const met = isMet(alert, currentPrice);
    if (met && !wasTriggered) {
      next.triggeredAt = nowIso;
      newlyTriggered.push(next);
    } else if (!met && wasTriggered) {
      next.triggeredAt = null; // re-arm only on a real price reversal
    }
    return next;
  });
  return { alerts: updated, newlyTriggered };
}
