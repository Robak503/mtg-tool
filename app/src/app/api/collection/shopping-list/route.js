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

import { loadCollection } from "../../../../lib/server/collectionStorage.js";
import { deckCostToFinish } from "../../../../lib/server/deckCost.js";
import { lookupByName } from "../../../../lib/server/printingIndex.js";
import { buildShoppingList, shoppingListText, shoppingListCsv } from "../../../../lib/server/shoppingList.js";

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
