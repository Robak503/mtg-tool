/**
 * /api/printings/search — substring search over the bundled printings index.
 *
 *   GET /api/printings/search?q=sol+ring&limit=20
 *
 * Returns up to `limit` printings, deduplicated by oracleId. Used by
 * the CollectionAddModal search-to-add flow.
 */

export const runtime = "nodejs";

import { searchPrintings } from "../../../../lib/server/printingIndex.js";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10) || 20));

    if (q.length < 2) {
      return Response.json({ results: [], query: q, message: "Query must be at least 2 characters." });
    }

    const results = searchPrintings(q, limit);
    return Response.json({ results, query: q, count: results.length });
  } catch (error) {
    if (error.code === "ENOENT") {
      return Response.json(
        {
          error:
            "Printings index missing. Run `npm run build:printings-index` " +
            "or trigger a data sync from the Updates panel.",
        },
        { status: 503 },
      );
    }
    return Response.json({ error: error.message || "Search failed." }, { status: 500 });
  }
}
