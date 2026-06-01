/**
 * /api/price-alerts — per-card price-target alerts (Vault #1).
 *
 *   GET    → every alert, annotated with its current price + whether it's met
 *            right now (live prices via the printing index; no network).
 *   POST   → upsert one alert { scryfallId, name, target, direction }
 *            (direction defaults to "below"). Replaces any existing alert for
 *            the same printing.
 *   DELETE → remove by ?scryfallId=.
 *
 * Crossing state (triggeredAt) is stamped by the daily snapshot
 * (POST /api/collection/prices), not here — GET just reflects the current
 * price against the target.
 */

export const runtime = "nodejs";

import {
  loadAlerts,
  upsertAlert,
  removeAlert,
} from "../../../lib/server/priceAlertStorage.js";
import { evaluateAlerts, normalizeAlert, DIRECTIONS } from "../../../lib/server/priceAlerts.js";
import { resolvePrices } from "../../../lib/server/priceResolution.js";

const priceForId = (scryfallId) => resolvePrices(scryfallId, null)?.usd ?? null;

export async function GET() {
  try {
    const { store } = await loadAlerts();
    return Response.json({ alerts: evaluateAlerts(store.alerts, priceForId) });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to load price alerts." }, { status: 500 });
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  const alert = normalizeAlert(body, new Date().toISOString());
  if (!alert) {
    return Response.json(
      { error: "scryfallId and a positive target price are required." },
      { status: 400 },
    );
  }
  if (body.direction && !DIRECTIONS.includes(body.direction)) {
    return Response.json(
      { error: `direction must be one of: ${DIRECTIONS.join(", ")}.` },
      { status: 400 },
    );
  }
  try {
    const store = await upsertAlert(alert);
    return Response.json({ alerts: evaluateAlerts(store.alerts, priceForId) });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to save price alert." }, { status: 500 });
  }
}

export async function DELETE(request) {
  const scryfallId = new URL(request.url).searchParams.get("scryfallId");
  if (!scryfallId) {
    return Response.json({ error: "scryfallId query param required." }, { status: 400 });
  }
  try {
    const store = await removeAlert(scryfallId);
    return Response.json({ alerts: evaluateAlerts(store.alerts, priceForId) });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to remove price alert." }, { status: 500 });
  }
}
