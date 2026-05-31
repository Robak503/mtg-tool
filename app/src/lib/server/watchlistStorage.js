/**
 * watchlistStorage.js — the "Grails" watchlist: cards the user is hunting
 * but doesn't own yet, tracked so the Finance section can chart their price.
 *
 * Stored at data/watchlist.json:
 *   { version: 1, updatedAt, cards: [
 *       { scryfallId, oracleId, name, setCode, collectorNumber, note, addedAt }
 *   ] }
 *
 * Deduped by scryfallId (a specific printing — finance is printing-specific).
 * Atomic write (temp + rename) mirrors collectionStorage so a crash mid-write
 * can't corrupt the file. Small personal list, so no cross-process lock.
 */

import fs from "node:fs/promises";

import { dataDir, dataPath } from "./paths.js";

const FILE = () => dataPath("watchlist.json");

function normalize(payload) {
  const cards = Array.isArray(payload?.cards) ? payload.cards : [];
  const seen = new Set();
  const out = [];
  for (const card of cards) {
    if (!card || !card.scryfallId || seen.has(card.scryfallId)) continue;
    seen.add(card.scryfallId);
    out.push({
      scryfallId: card.scryfallId,
      oracleId: card.oracleId || null,
      name: card.name || "",
      setCode: card.setCode || null,
      collectorNumber: card.collectorNumber || null,
      note: card.note || "",
      addedAt: card.addedAt || new Date().toISOString(),
    });
  }
  return { version: 1, updatedAt: new Date().toISOString(), cards: out };
}

export async function loadWatchlist() {
  try {
    const raw = await fs.readFile(FILE(), "utf8");
    return { watchlist: normalize(JSON.parse(raw)) };
  } catch (error) {
    if (error.code === "ENOENT") return { watchlist: { version: 1, updatedAt: null, cards: [] } };
    throw error;
  }
}

export async function writeWatchlistAtomic(payload) {
  const normalized = normalize(payload);
  await fs.mkdir(dataDir(), { recursive: true });
  const target = FILE();
  const tmp = `${target}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(normalized, null, 2), "utf8");
  await fs.rename(tmp, target);
  return normalized;
}

export async function addToWatchlist(card) {
  const { watchlist } = await loadWatchlist();
  const without = watchlist.cards.filter(c => c.scryfallId !== card.scryfallId);
  return writeWatchlistAtomic({ cards: [{ ...card, addedAt: new Date().toISOString() }, ...without] });
}

export async function removeFromWatchlist(scryfallId) {
  const { watchlist } = await loadWatchlist();
  return writeWatchlistAtomic({ cards: watchlist.cards.filter(c => c.scryfallId !== scryfallId) });
}
