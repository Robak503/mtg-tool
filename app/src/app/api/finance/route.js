/**
 * /api/finance — the Vault's MTG-finance dashboard.
 *
 * Assembles, from local data only (no network in normal operation):
 *   - value:  collection total + 30/90/365-day value deltas
 *   - owned:  top price risers/fallers among cards you own (30d)
 *   - movers: top risers/fallers across the whole tracked universe (finance plays)
 *   - grails: your watchlist cards with current price + movement
 *   - suggestions: EDHREC staples (overall) you don't own + near-combo pieces
 *
 * Movers come from the daily price history (collection-prices.jsonl), so they
 * start empty on a fresh install and fill in as snapshots accrue. The route
 * surfaces historyDates so the UI can show a "still gathering history" state
 * instead of pretending nothing moved.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";

import { dataPath } from "../../../lib/server/paths.js";
import { loadCollection } from "../../../lib/server/collectionStorage.js";
import { loadWatchlist } from "../../../lib/server/watchlistStorage.js";
import { loadAlerts } from "../../../lib/server/priceAlertStorage.js";
import { evaluateAlerts } from "../../../lib/server/priceAlerts.js";
import { collectionSummary, buildOwnedSet } from "../../../lib/server/collectionContext.js";
import { enrichCollectionPrices, resolvePrices } from "../../../lib/server/priceResolution.js";
import { parseHistory, computeDeltas, computeCardMovers } from "../../../lib/server/collectionPrices.js";
import { lookupById } from "../../../lib/server/printingIndex.js";
import { topStaples, representativePrinting } from "../../../lib/server/financeUniverse.js";
import { findCombos } from "../../../lib/server/spellbook.js";

const STAPLE_SCAN = 80;       // scan top-N staples, surface those not owned
const SUGGESTION_CAP = 24;
const COMBO_CAP = 12;
const MOVER_CAP = 12;

async function loadHistory() {
  try {
    return parseHistory(await fs.readFile(dataPath("collection-prices.jsonl"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function loadDecks() {
  try {
    const parsed = JSON.parse(await fs.readFile(dataPath("decks.local.json"), "utf8"));
    return Array.isArray(parsed) ? parsed : (parsed.decks || []);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

export async function GET() {
  try {
    const now = new Date();
    const { collection } = await loadCollection();
    const { watchlist } = await loadWatchlist();
    const history = await loadHistory();

    // ── name / art resolution (history rows only carry scryfallId) ──
    const nameByScryfall = new Map();
    for (const row of collection.cards || []) {
      if (row.scryfallId && row.name) nameByScryfall.set(row.scryfallId, row.name);
    }
    for (const card of watchlist.cards || []) {
      if (card.scryfallId && card.name) nameByScryfall.set(card.scryfallId, card.name);
    }
    const nameFor = (id) => nameByScryfall.get(id) || lookupById(id)?.name || "Unknown card";
    const artFor = (id) => lookupById(id)?.artCropUrl || null;
    const decorate = (m) => ({ ...m, name: nameFor(m.scryfallId), art: artFor(m.scryfallId) });

    // ── value + deltas (owned only) ──
    const summary = collectionSummary(enrichCollectionPrices(collection));
    const ownedIds = new Set(
      (collection.cards || []).filter(c => !c.wishlist).map(c => c.scryfallId).filter(Boolean),
    );
    const ownedDeltas = computeDeltas(collection, history.filter(h => ownedIds.has(h.scryfallId)), now);

    // ── movers ──
    const movers30 = computeCardMovers(history, null, now, 30);
    const movers7 = computeCardMovers(history, null, now, 7);
    const moverById30 = new Map(movers30.map(m => [m.scryfallId, m]));
    const moverById7 = new Map(movers7.map(m => [m.scryfallId, m]));
    const topRisers = (list) => list.filter(m => m.pctChange > 0).slice(0, MOVER_CAP).map(decorate);
    const topFallers = (list) =>
      list.filter(m => m.pctChange < 0).sort((a, b) => a.pctChange - b.pctChange).slice(0, MOVER_CAP).map(decorate);

    const ownedMovers = movers30.filter(m => ownedIds.has(m.scryfallId));

    // ── grails (watchlist) ──
    const grailIds = new Set((watchlist.cards || []).map(c => c.scryfallId));
    const grails = (watchlist.cards || []).map(card => {
      const prices = resolvePrices(card.scryfallId, null);
      return {
        scryfallId: card.scryfallId,
        name: card.name,
        setCode: card.setCode,
        collectorNumber: card.collectorNumber,
        note: card.note,
        usd: num(prices.usd),
        art: artFor(card.scryfallId),
        mover30d: moverById30.get(card.scryfallId) || null,
        mover7d: moverById7.get(card.scryfallId) || null,
      };
    });

    // ── suggestions: EDHREC staples (overall) not owned ──
    const ownedOracles = buildOwnedSet(collection);
    const staples = [];
    for (const staple of topStaples(STAPLE_SCAN)) {
      if (ownedOracles.has(staple.oracleId)) continue;
      const rep = representativePrinting(staple.name);
      if (!rep) continue;
      staples.push({
        name: staple.name,
        edhrecRank: staple.edhrecRank,
        scryfallId: rep.scryfallId,
        oracleId: rep.oracleId,
        setCode: rep.setCode,
        collectorNumber: rep.collectorNumber,
        usd: num(rep.prices?.usd),
        art: rep.artCropUrl,
        onWatchlist: grailIds.has(rep.scryfallId),
        mover30d: moverById30.get(rep.scryfallId) || null,
      });
      if (staples.length >= SUGGESTION_CAP) break;
    }

    // ── suggestions: near-combo pieces across decks, not owned ──
    let combos = [];
    try {
      const decks = await loadDecks();
      const deckNames = [...new Set(
        decks.flatMap(d => (d.cards || [])
          .filter(c => c.section !== "Tokens" && c.section !== "Sideboard")
          .map(c => c.name)),
      )];
      const { almostIncluded } = findCombos(deckNames, { includeAlmost: true, maxAlmost: 50 });
      const seen = new Set();
      for (const combo of almostIncluded || []) {
        const missing = combo.missingCard;
        if (!missing) continue;
        const rep = representativePrinting(missing);
        if (!rep || ownedOracles.has(rep.oracleId)) continue;
        const key = rep.oracleId || missing;
        if (seen.has(key)) continue;
        seen.add(key);
        combos.push({
          name: missing,
          scryfallId: rep.scryfallId,
          oracleId: rep.oracleId,
          setCode: rep.setCode,
          usd: num(rep.prices?.usd),
          art: rep.artCropUrl,
          onWatchlist: grailIds.has(rep.scryfallId),
          pieces: (combo.cards || []).filter(n => n !== missing),
          produces: combo.produces || [],
          mover30d: moverById30.get(rep.scryfallId) || null,
        });
        if (combos.length >= COMBO_CAP) break;
      }
    } catch (error) {
      console.warn("[/api/finance] combo suggestions skipped:", error.message);
    }

    // ── price alerts (#1): which targets are met right now ──
    let alerts = [];
    try {
      const { store } = await loadAlerts();
      alerts = evaluateAlerts(store.alerts, (id) => resolvePrices(id, null)?.usd ?? null)
        .map(a => ({ ...a, name: a.name || nameFor(a.scryfallId), art: artFor(a.scryfallId) }));
    } catch (error) {
      console.warn("[/api/finance] alerts skipped:", error.message);
    }
    const alertsMet = alerts.filter(a => a.met);

    const historyDates = Array.from(new Set(history.map(h => h.snappedAt))).sort();

    return Response.json({
      ready: true,
      value: { currentUsd: summary.totalValueUsd, deltas: ownedDeltas },
      owned: { risers: topRisers(ownedMovers), fallers: topFallers(ownedMovers) },
      movers: { risers: topRisers(movers30), fallers: topFallers(movers30) },
      grails,
      alerts,
      alertsMetCount: alertsMet.length,
      suggestions: { staples, combos },
      trackedCount: new Set(history.map(h => h.scryfallId)).size,
      historyDates,
      historyAvailable: movers30.length > 0,
    });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return Response.json(
        { ready: false, error: "Card data missing — sync from the Updates panel, then retry." },
        { status: 503 },
      );
    }
    console.error("[/api/finance] Error:", error);
    return Response.json({ ready: false, error: error.message || "Finance load failed." }, { status: 500 });
  }
}
