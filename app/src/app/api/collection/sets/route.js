/**
 * /api/collection/sets — the Set Browser (#23).
 *
 *   GET            → every set in the local printings index (newest first),
 *                    each with its printing count + how many you own.
 *   GET ?set=CODE  → every printing in that set as a value list, each flagged
 *                    owned / owned-other-printing, plus owned/total counts.
 *
 * All local: sets + cards come from the bundled printings index, ownership from
 * the collection. No network. 503 if the printings index isn't synced yet.
 */

export const runtime = "nodejs";

import { loadCollection } from "../../../../lib/server/collectionStorage.js";
import { listSets, cardsInSet } from "../../../../lib/server/printingIndex.js";
import { ownedCountsBySet, ownedSets, annotateSetCards } from "../../../../lib/server/setBrowser.js";

export async function GET(request) {
  try {
    const setCode = new URL(request.url).searchParams.get("set");
    const { collection } = await loadCollection();

    if (setCode) {
      const raw = cardsInSet(setCode);
      const { scryfall, oracles } = ownedSets(collection);
      const cards = annotateSetCards(raw, scryfall, oracles);
      return Response.json({
        setCode: String(setCode).toLowerCase(),
        setName: raw[0]?.setName || String(setCode).toUpperCase(),
        total: cards.length,
        owned: cards.filter((c) => c.owned).length,
        cards,
      });
    }

    const owned = ownedCountsBySet(collection);
    const sets = listSets().map((s) => ({ ...s, owned: owned.get(s.setCode) || 0 }));
    return Response.json({ sets });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return Response.json(
        { error: "Card data isn't synced yet — sync Scryfall + the printings index from the Updates panel." },
        { status: 503 },
      );
    }
    return Response.json({ error: error.message || "Failed to load sets." }, { status: 500 });
  }
}
