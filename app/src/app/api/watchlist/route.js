/**
 * /api/watchlist — the Finance "Grails" list: non-owned cards the user wants
 * to track. GET lists them, POST adds one (deduped by scryfallId), DELETE
 * removes by ?scryfallId=. The daily price snapshot (/api/collection/prices)
 * picks these up so their price movement accrues over time.
 */

export const runtime = "nodejs";

import {
  loadWatchlist,
  addToWatchlist,
  removeFromWatchlist,
} from "../../../lib/server/watchlistStorage.js";

export async function GET() {
  try {
    const { watchlist } = await loadWatchlist();
    return Response.json({ cards: watchlist.cards });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to load watchlist." }, { status: 500 });
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  if (!body?.scryfallId || !body?.name) {
    return Response.json({ error: "scryfallId and name are required." }, { status: 400 });
  }
  try {
    const watchlist = await addToWatchlist({
      scryfallId: body.scryfallId,
      oracleId: body.oracleId || null,
      name: body.name,
      setCode: body.setCode || null,
      collectorNumber: body.collectorNumber || null,
      note: body.note || "",
    });
    return Response.json({ cards: watchlist.cards });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to add to watchlist." }, { status: 500 });
  }
}

export async function DELETE(request) {
  const scryfallId = new URL(request.url).searchParams.get("scryfallId");
  if (!scryfallId) {
    return Response.json({ error: "scryfallId query param required." }, { status: 400 });
  }
  try {
    const watchlist = await removeFromWatchlist(scryfallId);
    return Response.json({ cards: watchlist.cards });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to remove from watchlist." }, { status: 500 });
  }
}
