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
      // C5-P1.6: the card index isn't synced yet. A USER-facing, actionable message (the dev
      // `npm run build:printings-index` path is noise for the app user) — the Add modal renders this
      // verbatim as `searchError`, so the search never silently "goes quiet". `indexUnavailable` lets
      // the client style it as the distinct sync affordance rather than a generic search failure.
      return Response.json(
        {
          error: "Card index not synced yet — open the Updates panel and run a sync, then search again.",
          indexUnavailable: true,
        },
        { status: 503 },
      );
    }
    return Response.json({ error: error.message || "Search failed." }, { status: 500 });
  }
}
