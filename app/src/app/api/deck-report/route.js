/**
 * /api/deck-report — one complete, local, deterministic deck report.
 *
 * Composes the pieces the app already computes separately — power ranker
 * (power/bracket/CRISPI/roles/curve/combos/salt/game-changers), Commander
 * legality + color-identity, cost-to-finish from the collection, and add/cut
 * recommendations — into a single structured report plus a Markdown export.
 * No API cost; everything runs off the local indexes. (master-plan F1.)
 */

export const runtime = "nodejs";

import { searchLocalCards, lookupCard } from "../../../lib/server/cardIndex.js";
import { rankDeckPower } from "../../../lib/server/powerRanker.js";
import { recommendForDeck } from "../../../lib/server/deckRecommendations.js";
import { deckCostToFinish } from "../../../lib/server/deckCost.js";
import { lookupByName } from "../../../lib/server/printingIndex.js";
import { loadCollection } from "../../../lib/server/collectionStorage.js";
import {
  assessDeckLegality,
  buildDeckReport,
  renderDeckReportMarkdown,
} from "../../../lib/server/deckReport.js";

// Sections that don't count toward legality (the commander defines the color
// identity; sideboard/tokens aren't part of the 99).
const NON_DECK_SECTION = /commander|sideboard|token/i;

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
  const deckName = typeof body?.deckName === "string" ? body.deckName : "Untitled deck";

  try {
    const ranker = rankDeckPower({ cards, maxAlmost: 12 });
    const colorIdentity = (ranker.commanderColors || []).join("");

    // Legality — resolve each mainboard card and flag bans / off-color cards.
    const legalityNames = [...new Set(
      cards.filter(c => c?.name && !NON_DECK_SECTION.test(c.section || "")).map(c => c.name),
    )];
    const resolved = legalityNames
      .map(name => {
        const card = lookupCard(name);
        return card
          ? { name: card.name, commanderLegal: card.legalities?.commander, colorIdentity: card.color_identity || [] }
          : null;
      })
      .filter(Boolean);
    const legality = assessDeckLegality(resolved, ranker.commanderColors || []);

    // Recommendations — same wiring as /api/recommend.
    const search = (query, limit) =>
      searchLocalCards(query, {
        colorIdentity,
        legal: "commander",
        limit: Math.min(Math.max(Number(limit) || 5, 1), 12),
      }).map(card => card.name);
    const recs = recommendForDeck({
      ranker,
      deckNames: cards.map(card => card?.name).filter(Boolean),
      search,
    });

    // Cost-to-finish — best-effort; null if there's no collection or no
    // printings index yet (the report is still useful without it).
    let cost = null;
    try {
      const { collection } = await loadCollection();
      cost = deckCostToFinish({ id: body?.deckId || "report", name: deckName, cards }, collection, lookupByName);
    } catch {
      cost = null;
    }

    const report = buildDeckReport({ deckName, ranker, legality, cost, recs });
    const markdown = renderDeckReportMarkdown(report);
    return Response.json({ ...report, markdown });
  } catch (err) {
    if (err?.code === "ENOENT") {
      return Response.json(
        { ready: false, error: "Card data missing — sync from the Updates panel, then retry." },
        { status: 503 },
      );
    }
    console.error("[/api/deck-report] Error:", err);
    return Response.json({ ready: false, error: err?.message || "Deck report failed." }, { status: 500 });
  }
}
