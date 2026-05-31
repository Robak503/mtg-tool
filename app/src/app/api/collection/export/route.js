/**
 * /api/collection/export — download The Vault as a backup (G3).
 *
 * GET ?format=json  → lossless JSON backup (default)
 * GET ?format=csv   → Deckbox-style CSV of owned cards (round-trips back
 *                     through /api/collection/import and Deckbox/Moxfield)
 *
 * Read-only. The collection is user data (not a big synced index), so this
 * works on a fresh install — it just exports an empty collection.
 */

export const runtime = "nodejs";

import { loadCollection } from "../../../../lib/server/collectionStorage.js";
import { collectionToJson, collectionToCsv } from "../../../../lib/server/collectionExport.js";

export async function GET(request) {
  try {
    const { collection } = await loadCollection();
    const format = (new URL(request.url).searchParams.get("format") || "json").toLowerCase();
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === "csv") {
      return new Response(collectionToCsv(collection), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="mtg-collection-${stamp}.csv"`,
        },
      });
    }
    if (format === "json") {
      return new Response(collectionToJson(collection), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="mtg-collection-${stamp}.json"`,
        },
      });
    }
    return Response.json({ error: `Unknown format "${format}". Use "json" or "csv".` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message || "Collection export failed." }, { status: 500 });
  }
}
