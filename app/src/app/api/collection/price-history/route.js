/**
 * /api/collection/price-history — the daily nonfoil-USD price series for one
 * card (by scryfallId), oldest→newest. Powers the per-card sparkline (#2).
 *
 * Reads the local price history (collection-prices.jsonl; falls back to the
 * bundled seed on a fresh install). Read-only, no API cost.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";

import { dataPath } from "../../../../lib/server/paths.js";
import { parseHistory, cardPriceSeries } from "../../../../lib/server/collectionPrices.js";

export async function GET(request) {
  try {
    const scryfallId = new URL(request.url).searchParams.get("scryfallId");
    if (!scryfallId) {
      return Response.json({ error: "scryfallId query param is required." }, { status: 400 });
    }
    let history = [];
    try {
      history = parseHistory(await fs.readFile(dataPath("collection-prices.jsonl"), "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    return Response.json({ scryfallId, series: cardPriceSeries(history, scryfallId) });
  } catch (error) {
    return Response.json({ error: error.message || "Price history failed." }, { status: 500 });
  }
}
