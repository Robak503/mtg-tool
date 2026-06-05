/**
 * /api/collection/deck-costs — "cost to finish each deck from my collection."
 *
 * Joins the collection with every saved deck and, per deck, totals the cheapest
 * paper price of the cards you still need (deckCost.deckCostToFinish). Surfaces
 * each deck's owned % + $-to-finish so the Vault can show planned-but-unowned
 * decks and a shopping list. Read-only.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";

import { profilePath } from "../../../../lib/server/paths.js";
import { loadCollection } from "../../../../lib/server/collectionStorage.js";
import { deckCostToFinish } from "../../../../lib/server/deckCost.js";
import { lookupByName } from "../../../../lib/server/printingIndex.js";

async function loadDecks() {
  try {
    const raw = await fs.readFile(profilePath("decks.local.json"), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : (parsed.decks || []);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function GET(request) {
  try {
    const deckId = request?.url ? new URL(request.url).searchParams.get("deckId") : null;
    const { collection } = await loadCollection();
    const decks = await loadDecks();

    let summaries;
    try {
      // ?deckId= → just that deck's summary (used by the deck view's
      // cost-to-finish line); otherwise every deck (the Vault's decks list).
      const targets = deckId ? decks.filter(d => d.id === deckId) : decks;
      summaries = targets.map(deck => deckCostToFinish(deck, collection, lookupByName));
    } catch (error) {
      if (error.code === "ENOENT") {
        return Response.json(
          { error: "Printings index missing — sync data from the Updates panel, then retry." },
          { status: 503 },
        );
      }
      throw error;
    }

    if (deckId) {
      return Response.json({ summary: summaries[0] || null });
    }

    // Unfinished decks first (priciest to finish at the top), completed last.
    summaries.sort((a, b) => {
      if (a.complete !== b.complete) return a.complete ? 1 : -1;
      return b.costToFinish - a.costToFinish;
    });

    return Response.json({
      decks: summaries,
      totalDecks: decks.length,
      collectionCount: collection.cards.length,
    });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to compute deck costs." }, { status: 500 });
  }
}
