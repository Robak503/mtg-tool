/**
 * /api/collection/ownership — per-card ownership tags for Karn's suggestions (G1).
 *
 * POST { names: string[] } → { statuses: { [name]: { status, inDecks } } }
 * where status is "owned" | "wishlist" | "missing". Resolves by card name against
 * the collection (Karn suggests by name, not printing); `inDecks` counts how many
 * saved decks already use an owned card. All local.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";

import { profilePath } from "../../../../lib/server/paths.js";
import { loadCollection } from "../../../../lib/server/collectionStorage.js";
import { cardOwnershipStatuses } from "../../../../lib/server/collectionContext.js";
import { lookupCard } from "../../../../lib/server/cardIndex.js";

async function loadDecks() {
  try {
    const raw = await fs.readFile(profilePath("decks.local.json"), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : (parsed.decks || []);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

// Map deck cards → oracleIds so crossDeckUsage can count owned cards' deck usage.
function enrichDecks(decks) {
  return decks.map((deck) => ({
    id: deck.id,
    name: deck.name,
    cards: (deck.cards || [])
      .filter((c) => c && c.section !== "Sideboard" && c.section !== "Tokens" && c.name)
      .map((c) => {
        let oracleId = c.oracleId || null;
        if (!oracleId) {
          try {
            const card = lookupCard(c.name);
            if (card?.oracle_id) oracleId = card.oracle_id;
          } catch { /* cardIndex unavailable — skip */ }
        }
        return { oracleId, quantity: c.qty || 1 };
      })
      .filter((c) => c.oracleId),
  }));
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  const names = Array.isArray(body?.names) ? body.names.filter((n) => typeof n === "string") : null;
  if (!names) {
    return Response.json({ error: "Request must include a `names` array" }, { status: 400 });
  }
  // A3 (cross-deck commitments): when the caller asks on behalf of a specific deck, exclude that
  // deck from the join so `inDecks` means "OTHER decks already running this card" — the number
  // Karn needs for "what have I already committed elsewhere". Without it, every card in a saved
  // locked deck reads as committed at least once, by itself.
  const excludeDeckId = typeof body?.excludeDeckId === "string" ? body.excludeDeckId : null;

  try {
    const { collection } = await loadCollection();
    let decks = [];
    try {
      decks = enrichDecks(await loadDecks());
      if (excludeDeckId) decks = decks.filter((d) => d.id !== excludeDeckId);
    } catch {
      // Deck join is best-effort; ownership status still resolves without it.
    }
    return Response.json({ statuses: cardOwnershipStatuses(collection, decks, names) });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to resolve ownership" }, { status: 500 });
  }
}
