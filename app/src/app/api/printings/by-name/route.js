/**
 * /api/printings/by-name — every printing of a single card.
 *
 *   GET /api/printings/by-name?name=Sliver+Hivelord[&oracleId=...]
 *
 * Returns all printings of the named card (set, collector #, finishes,
 * prices, art), sorted newest-first by release date when available. The
 * search route deliberately dedupes to one printing per name; this is the
 * companion that lists the rest so the Add flow can pick the exact print
 * owned (e.g. Commander Masters vs the Secret Lair). When oracleId is given
 * it filters to that exact card (guards against distinct cards sharing a name).
 */

export const runtime = "nodejs";

import { lookupByName } from "../../../../lib/server/printingIndex.js";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const name = (url.searchParams.get("name") || "").trim();
    const oracleId = (url.searchParams.get("oracleId") || "").trim();

    if (!name) {
      return Response.json({ results: [], message: "name is required" });
    }

    let results = lookupByName(name);
    if (oracleId) results = results.filter(p => p.oracleId === oracleId);

    // Group by set, then collector number, so a card's printings list reads in
    // a predictable order (the index has no release date to sort on).
    results = [...results].sort((a, b) => {
      const setCmp = String(a.set || "").localeCompare(String(b.set || ""));
      if (setCmp !== 0) return setCmp;
      return String(a.collectorNumber || "").localeCompare(String(b.collectorNumber || ""), undefined, { numeric: true });
    });

    return Response.json({ results, count: results.length });
  } catch (error) {
    if (error.code === "ENOENT") {
      return Response.json(
        { error: "Printings index missing. Run `npm run build:printings-index` or sync data." },
        { status: 503 },
      );
    }
    return Response.json({ error: error.message || "Lookup failed." }, { status: 500 });
  }
}
