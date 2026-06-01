/**
 * /api/collection/buildable — "what can I build now" (Vault #20).
 *
 * GET → the legendary creatures (and commander-eligible planeswalkers) you OWN,
 * each ranked by how many other owned cards are legal in its color identity —
 * i.e. how much of a Commander deck you could already build around it.
 *
 * All local: candidates + pool come from the collection joined with the bundled
 * card index. 503 if the card index isn't synced yet.
 */

export const runtime = "nodejs";

import { loadCollection } from "../../../../lib/server/collectionStorage.js";
import { lookupCard } from "../../../../lib/server/cardIndex.js";
import { computeBuildableCommanders } from "../../../../lib/server/buildableCommanders.js";

const ownedRow = (row) => !row.wishlist && (row.stacks || []).some((s) => (s.quantity || 0) > 0);

export async function GET() {
  try {
    const { collection } = await loadCollection();

    // Dedupe owned cards by name, resolve oracle metadata once each.
    const seen = new Set();
    const ownedEntries = [];
    for (const row of collection.cards || []) {
      if (!ownedRow(row) || !row.name) continue;
      const key = row.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const card = lookupCard(row.name);
      ownedEntries.push({
        name: row.name,
        typeLine: card?.type_line || "",
        colorIdentity: card?.color_identity || [],
        oracleText: card?.oracle_text || "",
        edhrecRank: typeof card?.edhrec_rank === "number" ? card.edhrec_rank : null,
      });
    }

    const commanders = computeBuildableCommanders(ownedEntries);
    return Response.json({ commanders, ownedCards: ownedEntries.length });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return Response.json(
        { error: "Card data isn't synced yet — sync from the Updates panel, then retry." },
        { status: 503 },
      );
    }
    return Response.json({ error: error.message || "Failed to compute buildable commanders." }, { status: 500 });
  }
}
