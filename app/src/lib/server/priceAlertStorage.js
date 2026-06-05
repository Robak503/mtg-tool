/**
 * priceAlertStorage.js — persistence for per-card price alerts (Vault #1).
 *
 * Stored at data/price-alerts.json. Atomic write (temp + rename, unique temp
 * name) mirrors watchlistStorage/collectionStorage so a crash mid-write can't
 * corrupt the file. Small personal list — no cross-process lock.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { profilePath } from "./paths.js";
import { normalizeAlerts } from "./priceAlerts.js";

const FILE = () => profilePath("price-alerts.json");

let tmpSeq = 0;

export async function loadAlerts() {
  try {
    const raw = await fs.readFile(FILE(), "utf8");
    return { store: normalizeAlerts(JSON.parse(raw)) };
  } catch (error) {
    if (error.code === "ENOENT") return { store: { version: 1, updatedAt: null, alerts: [] } };
    throw error;
  }
}

export async function writeAlertsAtomic(payload) {
  const normalized = normalizeAlerts(payload);
  await fs.mkdir(path.dirname(FILE()), { recursive: true });
  const target = FILE();
  const tmp = `${target}.tmp.${process.pid}.${Date.now()}.${tmpSeq++}`;
  await fs.writeFile(tmp, JSON.stringify(normalized, null, 2), "utf8");
  await fs.rename(tmp, target);
  return normalized;
}

/** Upsert one alert (replaces any existing alert for the same scryfallId). */
export async function upsertAlert(alert) {
  const { store } = await loadAlerts();
  const without = store.alerts.filter((a) => a.scryfallId !== alert.scryfallId);
  return writeAlertsAtomic({ alerts: [{ ...alert }, ...without] });
}

export async function removeAlert(scryfallId) {
  const { store } = await loadAlerts();
  return writeAlertsAtomic({ alerts: store.alerts.filter((a) => a.scryfallId !== scryfallId) });
}
