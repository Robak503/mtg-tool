/**
 * /api/collection/artists — the Gallery (V7): your collection grouped by the
 * artist of the exact printing you own.
 *
 * GET → { ready, artistsAvailable, artists: [{ artist, count,
 *         cards: [{ scryfallId, name }] }], unmatched }
 *
 * Fully local: ownership from collection.json, artists from the bundled
 * printings index (V5 fields). Three honest degradations:
 *   - index missing            → ready:false (sync from the Updates panel)
 *   - index predates V5        → ready:true, artistsAvailable:false
 *   - a row's printing unknown → counted in `unmatched`, never guessed
 */

export const runtime = "nodejs";

import { loadCollection } from "../../../../lib/server/collectionStorage.js";
import { lookupById } from "../../../../lib/server/printingIndex.js";

const ownedRow = (row) => !row.wishlist && (row.stacks || []).some((s) => (s.quantity || 0) > 0);

export async function GET() {
  try {
    const { collection } = await loadCollection();
    const byArtist = new Map();
    let unmatched = 0;
    let sawArtistField = false;
    let sawPrinting = false;

    for (const row of collection.cards || []) {
      if (!ownedRow(row) || !row.scryfallId) continue;
      let printing = null;
      try {
        printing = lookupById(row.scryfallId);
      } catch (error) {
        if (error?.code === "ENOENT") {
          return Response.json({ ready: false, artistsAvailable: false, artists: [], unmatched: 0 });
        }
        throw error;
      }
      if (!printing) { unmatched += 1; continue; }
      sawPrinting = true;
      if ("artist" in printing) sawArtistField = true;
      const artist = printing.artist;
      if (!artist) { unmatched += 1; continue; }
      const entry = byArtist.get(artist) || { artist, count: 0, cards: [] };
      entry.count += 1;
      if (entry.cards.length < 12) entry.cards.push({ scryfallId: row.scryfallId, name: row.name });
      byArtist.set(artist, entry);
    }

    const artists = [...byArtist.values()].sort((a, b) => b.count - a.count || a.artist.localeCompare(b.artist));
    return Response.json({
      ready: true,
      // Distinguish "old index without artist data" from "no owned cards".
      artistsAvailable: sawPrinting ? sawArtistField : true,
      artists,
      unmatched,
    });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to group by artist." }, { status: 500 });
  }
}
