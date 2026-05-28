/**
 * /api/collection/conflicts — cross-deck overflow detection.
 *
 * Joins collection + decks (loaded from decks.local.json), maps deck
 * card names to oracleIds via cardIndex, and surfaces every oracleId
 * where deck usage exceeds owned quantity. The math itself lives in
 * collectionContext.conflicts(); this route adds the joins + the
 * UI-friendly enrichment (deck names, card names).
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";

import { dataPath } from "../../../../lib/server/paths.js";
import { loadCollection } from "../../../../lib/server/collectionStorage.js";
import { conflicts as computeConflicts } from "../../../../lib/server/collectionContext.js";
import { lookupCard } from "../../../../lib/server/cardIndex.js";

async function loadDecks() {
  try {
    const raw = await fs.readFile(dataPath("decks.local.json"), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : (parsed.decks || []);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function enrichDecksWithOracleIds(decks) {
  return decks.map(deck => {
    const cards = (deck.cards || [])
      .filter(c => c && c.section !== "Sideboard" && c.section !== "Tokens" && c.name)
      .map(c => {
        let oracleId = c.oracleId || null;
        if (!oracleId) {
          try {
            const card = lookupCard(c.name);
            if (card?.oracle_id) oracleId = card.oracle_id;
          } catch {
            // cardIndex unavailable (no oracle data synced yet). Skip.
          }
        }
        return { name: c.name, oracleId, quantity: c.qty || 1 };
      })
      .filter(c => c.oracleId); // Can't conflict-match without an oracleId
    return { id: deck.id, name: deck.name, cards };
  });
}

export async function GET() {
  try {
    const { collection } = await loadCollection();
    const decks = await loadDecks();

    if (decks.length === 0) {
      return Response.json({ conflicts: [], totalDecks: 0, collectionCount: collection.cards.length });
    }

    const enriched = enrichDecksWithOracleIds(decks);
    const raw = computeConflicts(collection, enriched);

    // Decorate each conflict with a card name + deck names for display.
    const out = raw.map(c => {
      const collectionRow = collection.cards.find(r => r.oracleId === c.oracleId);
      let name = collectionRow?.name;
      if (!name) {
        for (const deck of enriched) {
          const card = deck.cards.find(card => card.oracleId === c.oracleId);
          if (card?.name) { name = card.name; break; }
        }
      }
      const deckNames = c.deckIds.map(id => {
        const d = decks.find(deck => deck.id === id);
        return d?.name || id;
      });
      return {
        oracleId: c.oracleId,
        name: name || c.oracleId,
        ownedQty: c.ownedQty,
        usedQty: c.usedQty,
        overflow: c.usedQty - c.ownedQty,
        deckIds: c.deckIds,
        deckNames,
      };
    });

    return Response.json({
      conflicts: out,
      totalDecks: decks.length,
      collectionCount: collection.cards.length,
    });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to compute conflicts" }, { status: 500 });
  }
}
