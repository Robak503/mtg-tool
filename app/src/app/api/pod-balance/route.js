/**
 * /api/pod-balance — "is this pod fair?"
 *
 * Runs the deterministic local power ranker (lib/server/powerRanker.rankDeckPower)
 * over 1-4 decks and returns each deck's official-WotC bracket (1-5), power
 * level, CRISPI axes, and the Game Changers it runs — plus, for 2+ decks, a
 * balance verdict (bracket/power spread). Surfaces the bracket + Game Changers
 * the app already detects from the bundled Commander Spellbook snapshot; no new
 * data and no network calls.
 */

export const runtime = "nodejs";

import { rankDeckPower } from "../../../lib/server/powerRanker.js";

const MAX_DECKS = 4;

function summarize(deck) {
  const result = rankDeckPower({ cards: Array.isArray(deck?.cards) ? deck.cards : [], maxAlmost: 0 });
  return {
    id: deck?.id ?? null,
    name: (deck?.name || "").trim() || result.commanderNames[0] || "Deck",
    powerLevel: result.powerLevel,
    bracket: result.bracket,
    bracketLabel: result.bracketLabel,
    bracketReason: result.bracketReason,
    confidence: result.confidence,
    axes: result.axes,
    attributeRatings: result.attributeRatings,
    gameChangers: result.spellbook.gameChangers,
    massLandDenial: result.spellbook.massLandDenial,
    extraTurns: result.spellbook.extraTurns,
    commanderColors: result.commanderColors,
    commanderNames: result.commanderNames,
    totalCards: result.totalCards,
    unresolvedCount: result.unresolvedCards.length,
  };
}

function buildComparison(decks) {
  if (decks.length < 2) return null;
  const byPower = [...decks].sort((a, b) => b.powerLevel - a.powerLevel);
  const top = byPower[0];
  const bottom = byPower[byPower.length - 1];
  const brackets = decks.map(d => d.bracket);
  const bracketSpread = Math.max(...brackets) - Math.min(...brackets);
  const powerSpread = Math.round((top.powerLevel - bottom.powerLevel) * 10) / 10;

  let severity;
  let verdict;
  if (bracketSpread === 0 && powerSpread <= 1.2) {
    severity = "balanced";
    verdict = `Well matched — every deck is Bracket ${brackets[0]} and within ${powerSpread} power of the others. This should be a fair table.`;
  } else if (bracketSpread >= 2) {
    severity = "lopsided";
    verdict = `Lopsided — ${top.name} (Bracket ${top.bracket}, power ${top.powerLevel}) outclasses ${bottom.name} (Bracket ${bottom.bracket}, power ${bottom.powerLevel}). Rebalance before playing.`;
  } else {
    severity = "slight";
    verdict = `Mostly even — ${top.name} (Bracket ${top.bracket}) runs a notch ahead of ${bottom.name} (Bracket ${bottom.bracket}, power ${bottom.powerLevel}). Likely still a fair game.`;
  }
  return { bracketSpread, powerSpread, topDeck: top.name, bottomDeck: bottom.name, severity, verdict };
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ready: false, error: "Invalid JSON request body." }, { status: 400 });
  }

  const decks = Array.isArray(body?.decks) ? body.decks.slice(0, MAX_DECKS) : null;
  if (!decks || !decks.length) {
    return Response.json(
      { ready: false, error: "Request body must include a non-empty decks array (max 4)." },
      { status: 400 },
    );
  }

  try {
    const ranked = decks.map(summarize);
    return Response.json({ ready: true, decks: ranked, comparison: buildComparison(ranked) });
  } catch (err) {
    if (err?.code === "ENOENT") {
      return Response.json(
        { ready: false, error: "Card data missing — sync from the Updates panel, then retry." },
        { status: 503 },
      );
    }
    console.error("[/api/pod-balance] Error:", err);
    return Response.json({ ready: false, error: err?.message || "Pod balance failed." }, { status: 500 });
  }
}
