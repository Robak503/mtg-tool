/**
 * /api/collection/shopping-list — the cards you still need for a deck, as an
 * actionable buy list (G2).
 *
 * POST { cards: [{ qty, name, section }], deckName? } → resolve missing cards
 * against the collection + printings (deckCostToFinish), then return the
 * structured list plus paste-ready decklist text and CSV.
 *
 * Read-only. Needs the printings index (503 until a data sync).
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";

import { loadCollection } from "../../../../lib/server/collectionStorage.js";
import { deckCostToFinish } from "../../../../lib/server/deckCost.js";
import { lookupByName } from "../../../../lib/server/printingIndex.js";
import { buildShoppingList, shoppingListText, shoppingListCsv } from "../../../../lib/server/shoppingList.js";
import { profilePath } from "../../../../lib/server/paths.js";
import { loadAlerts } from "../../../../lib/server/priceAlertStorage.js";

/**
 * GET → the UNIVERSAL buy list (V11): one deduped list merging cards missing
 * across ALL saved decks + wishlist rows + price alerts set "below" a target,
 * each tagged with WHY. Priced from the printings index (cheapest paper).
 */
export async function GET() {
  try {
    const { collection } = await loadCollection();
    const byName = new Map(); // lowerName -> { name, qty, unitPrice, reasons:Set }
    const cheapest = (name) => {
      let best = null;
      for (const p of lookupByName(name) || []) {
        const n = parseFloat(p.usd);
        if (Number.isFinite(n) && (best === null || n < best)) best = n;
      }
      return best;
    };
    const add = (name, qty, reason) => {
      if (!name || qty <= 0) return;
      const key = name.toLowerCase();
      const e = byName.get(key) || { name, qty: 0, unitPrice: cheapest(name), reasons: new Set() };
      e.qty = Math.max(e.qty, qty); // decks each need copies; take the real max need
      e.reasons.add(reason);
      byName.set(key, e);
    };

    let indexMissing = false;
    let decks = [];
    try {
      const parsed = JSON.parse(await fs.readFile(profilePath("decks.local.json"), "utf8"));
      decks = Array.isArray(parsed) ? parsed : (parsed.decks || []);
    } catch { /* no decks file yet */ }

    for (const deck of decks) {
      try {
        const summary = deckCostToFinish(deck, collection, lookupByName);
        for (const m of summary.missing || []) add(m.name, m.need || 0, `needed in ${deck.name}`);
      } catch (error) {
        if (error?.code === "ENOENT") { indexMissing = true; break; }
        throw error;
      }
    }

    for (const row of collection.cards || []) {
      if (row.wishlist && row.name) add(row.name, 1, "wishlist");
    }

    try {
      const { store } = await loadAlerts();
      for (const a of store?.alerts || []) {
        if (a?.name && a?.direction === "below") add(a.name, 1, "price alert");
      }
    } catch { /* alerts advisory */ }

    const entries = [...byName.values()]
      .map((e) => ({
        name: e.name,
        qty: e.qty,
        unitPrice: e.unitPrice,
        lineCost: Number.isFinite(e.unitPrice) ? Math.round(e.unitPrice * e.qty * 100) / 100 : null,
        reasons: [...e.reasons],
      }))
      .sort((a, b) => (b.lineCost ?? -1) - (a.lineCost ?? -1) || a.name.localeCompare(b.name));

    return Response.json({
      indexMissing,
      entries,
      totalCards: entries.reduce((s, e) => s + e.qty, 0),
      totalCost: Math.round(entries.reduce((s, e) => s + (e.lineCost || 0), 0) * 100) / 100,
      unpriced: entries.filter((e) => e.lineCost === null).length,
    });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to build the shopping list." }, { status: 500 });
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const cards = Array.isArray(body?.cards) ? body.cards : null;
  if (!cards) {
    return Response.json({ error: "Request body must include a cards array." }, { status: 400 });
  }
  const deckName = typeof body?.deckName === "string" ? body.deckName : "Deck";

  try {
    const { collection } = await loadCollection();
    let summary;
    try {
      summary = deckCostToFinish({ id: body?.deckId || "shopping", name: deckName, cards }, collection, lookupByName);
    } catch (error) {
      if (error?.code === "ENOENT") {
        return Response.json(
          { error: "Printings index missing — sync data from the Updates panel, then retry." },
          { status: 503 },
        );
      }
      throw error;
    }

    const list = buildShoppingList(summary.missing, { excludeUnresolved: Boolean(body?.excludeUnresolved) });
    return Response.json({
      deckName: summary.deckName,
      ownedPct: summary.ownedPct,
      complete: summary.complete,
      totalCards: list.totalCards,
      totalCost: list.totalCost,
      unpricedCount: list.unpricedCount,
      entries: list.entries,
      text: shoppingListText(list),
      csv: shoppingListCsv(list),
    });
  } catch (error) {
    return Response.json({ error: error.message || "Shopping list failed." }, { status: 500 });
  }
}
