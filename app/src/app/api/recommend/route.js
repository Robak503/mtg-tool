/**
 * /api/recommend — local "deck doctor" add/cut recommendations.
 *
 * Runs the deterministic power ranker over the deck, then derives role-gap
 * add suggestions (filled with color-identity-legal staples ranked by
 * edhrec_rank), Commander Spellbook "one card away" completions, and cut
 * candidates (lowest-impact + saltiest cards). The lighter-MVP alternative to a
 * full EDHREC sync — no network, no API cost.
 */

export const runtime = "nodejs";

import { searchLocalCards } from "../../../lib/server/cardIndex.js";
import { rankDeckPower } from "../../../lib/server/powerRanker.js";
import { recommendForDeck } from "../../../lib/server/deckRecommendations.js";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ready: false, error: "Invalid JSON request body." }, { status: 400 });
  }

  const cards = Array.isArray(body?.cards) ? body.cards : null;
  if (!cards) {
    return Response.json({ ready: false, error: "Request body must include a cards array." }, { status: 400 });
  }

  try {
    const ranker = rankDeckPower({ cards, maxAlmost: 8 });
    const colorIdentity = (ranker.commanderColors || []).join("");
    const deckNames = cards.map(card => card?.name).filter(Boolean);
    const search = (query, limit) =>
      searchLocalCards(query, {
        colorIdentity,
        legal: "commander",
        limit: Math.min(Math.max(Number(limit) || 5, 1), 12),
      }).map(card => card.name);

    const recs = recommendForDeck({ ranker, deckNames, search });
    return Response.json({
      ...recs,
      bracket: ranker.bracket,
      bracketLabel: ranker.bracketLabel,
      powerLevel: ranker.powerLevel,
      confidence: ranker.confidence,
    });
  } catch (err) {
    if (err?.code === "ENOENT") {
      return Response.json(
        { ready: false, error: "Card data missing — sync from the Updates panel, then retry." },
        { status: 503 },
      );
    }
    console.error("[/api/recommend] Error:", err);
    return Response.json({ ready: false, error: err?.message || "Recommendations failed." }, { status: 500 });
  }
}
