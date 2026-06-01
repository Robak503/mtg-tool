/**
 * /api/collection/deck-overlap — the deck-scoped "what you own" signal for
 * collection-aware Karn (G1).
 *
 * POST { cardNames: string[], commanderNames?: string[] }
 *   → { block, ownedInDeck, deckTotal, pool, deckColorIdentity }
 *
 * Joins the deck against the collection: how many of the deck's cards the user
 * owns, plus the in-color upgrade pool they already own (most-played first).
 * `block` is a compact prompt fragment the chat appends to Karn's system prompt
 * so he prefers suggesting cards the user can add at no cost. All local; if the
 * card index isn't synced it returns an empty block rather than failing.
 */

export const runtime = "nodejs";

import { loadCollection } from "../../../../lib/server/collectionStorage.js";
import { lookupCard } from "../../../../lib/server/cardIndex.js";
import { computeDeckOverlap, renderDeckOverlapBlock } from "../../../../lib/server/deckOverlap.js";

const ownedRow = (row) => !row.wishlist && (row.stacks || []).some((s) => (s.quantity || 0) > 0);
const ci = (name) => {
  const c = lookupCard(name);
  const id = c?.color_identity?.length ? c.color_identity : (c?.card_faces?.flatMap((f) => f.color_identity || f.colors || []) || []);
  return Array.isArray(id) ? id : [];
};

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  const cardNames = Array.isArray(body?.cardNames) ? body.cardNames : [];
  const commanderNames = Array.isArray(body?.commanderNames) ? body.commanderNames : [];

  try {
    const { collection } = await loadCollection();
    const ownedEntries = (collection.cards || [])
      .filter(ownedRow)
      .map((row) => {
        const card = lookupCard(row.name);
        return {
          name: row.name,
          colorIdentity: card?.color_identity || [],
          edhrecRank: typeof card?.edhrec_rank === "number" ? card.edhrec_rank : null,
        };
      });

    // Deck color identity = union of the commanders' identities (Commander rule);
    // fall back to the union across all deck cards when no commander is given.
    const sourceForCI = commanderNames.length ? commanderNames : cardNames;
    const deckColorIdentity = [...new Set(sourceForCI.flatMap(ci))];

    const overlap = computeDeckOverlap(cardNames, ownedEntries, deckColorIdentity);
    return Response.json({ ...overlap, block: renderDeckOverlapBlock(overlap) });
  } catch (error) {
    // No card index / data not synced → degrade to an empty signal (Karn just
    // doesn't get the owned-pool hint) rather than break the chat send.
    if (error?.code === "ENOENT") return Response.json({ block: "", ownedInDeck: 0, deckTotal: cardNames.length, pool: [], deckColorIdentity: [] });
    return Response.json({ error: error.message || "Failed to compute deck overlap." }, { status: 500 });
  }
}
