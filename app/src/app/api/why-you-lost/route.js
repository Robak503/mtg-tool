/**
 * /api/why-you-lost — "Why you lost". Mines the grind history for a deck's recurring LOSS patterns so the
 * Academy can coach off them. GET ?deck=<id|name> returns one deck's summary; GET with no param returns a
 * summary for every deck in the active profile (the shelf-wide ledger). Reads the forever-kept headers ONCE
 * and mines each deck against them, so the all-decks call is one store read, not one-per-deck.
 *
 * Honest by construction (lossMiner.js): patterns are shares of REAL recorded losses, a cause of death is
 * claimed only when attributable, and the whole thing is framed as "losses when the sim AI pilots the deck"
 * — a proxy that sharpens as the model trains. Fully offline.
 */
export const runtime = "nodejs";

import { readAllGrindHeaders, mineDeckLosses } from "../../../lib/learn/lossMiner.js";
import { decksForActiveProfile } from "../../../lib/server/selfPlayDecks.js";

export async function GET(request) {
  let url;
  try { url = new URL(request.url); } catch { return Response.json({ error: "bad request url" }, { status: 400 }); }
  const deckParam = url.searchParams.get("deck");

  let headers;
  try {
    headers = await readAllGrindHeaders();
  } catch (error) {
    return Response.json({ error: error?.message || "Couldn't read the grind history." }, { status: 500 });
  }

  // Single deck — deckParam may be an id OR a name; the miner matches either against each header's decks[].
  if (deckParam) {
    const deck = mineDeckLosses(headers, { id: deckParam, name: deckParam });
    return Response.json({ deck, totalGames: headers.length });
  }

  // Shelf-wide: mine every active-profile deck against the same headers.
  let pool;
  try {
    pool = await decksForActiveProfile();
  } catch (error) {
    return Response.json({ error: error?.message || "Couldn't load the active profile's decks." }, { status: 500 });
  }
  const decks = pool
    .map((d) => mineDeckLosses(headers, { id: d.id, name: d.name }))
    .filter(Boolean)
    .sort((a, b) => b.losses - a.losses); // most-lost decks first — the ones that most need coaching
  return Response.json({ decks, totalGames: headers.length });
}
