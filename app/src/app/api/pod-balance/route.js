/**
 * /api/pod-balance — "is this pod fair?"
 *
 * Runs the deterministic local power ranker (lib/server/powerRanker.rankDeckPower)
 * over 1-4 decks and returns each deck's official-WotC bracket (1-5), power
 * level, CRISPI axes, and the Game Changers it runs — plus, for 2+ decks, a
 * balance verdict (bracket/power spread). Surfaces the bracket + Game Changers
 * the app already detects from the bundled Commander Spellbook snapshot; no new
 * data and no network calls.
 *
 * Two request shapes (both POST, both capped at 4 decks — a pod is 4):
 *   { decks: [{ id, name, cards }] }          — legacy: caller ships deck bodies.
 *   { deckIds: [...], allProfiles: true }     — W2: server loads the bodies from
 *     the on-disk profile deck files (loadAllProfileDecks, same pool /api/self-play
 *     resolves from), so the Pod Balance surface can compare decks across EVERY
 *     profile without the client holding other profiles' lists. Each ranked deck
 *     gains a `profile` field (owning profile's display name) on this path.
 */

export const runtime = "nodejs";

import { rankDeckPower } from "../../../lib/server/powerRanker.js";
import {
  decksForActiveProfile,
  listAllProfileDecks,
  loadAllProfileDecks,
  selectDecksByIds,
} from "../../../lib/server/selfPlayDecks.js";

import { evaluateDeckSalt } from "../../../lib/server/edhrecSalt.js";

const MAX_DECKS = 4;

function summarize(deck) {
  const cards = Array.isArray(deck?.cards) ? deck.cards : [];
  const result = rankDeckPower({ cards, maxAlmost: 0 });
  // Misery meter — EDHREC salt over the decklist (ready:false → nulls, the
  // client hides the row until a salt sync has run).
  const salt = evaluateDeckSalt(cards.map((c) => c?.name).filter(Boolean));
  return {
    saltSum: salt.ready ? salt.sum : null,
    saltTop: salt.ready ? salt.topCards.slice(0, 3) : [],
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
  const deckIds = Array.isArray(body?.deckIds)
    ? body.deckIds.filter((id) => typeof id === "string" && id).slice(0, MAX_DECKS)
    : null;
  if ((!decks || !decks.length) && (!deckIds || !deckIds.length)) {
    return Response.json(
      { ready: false, error: "Request body must include a non-empty decks or deckIds array (max 4)." },
      { status: 400 },
    );
  }

  try {
    // W2 path: resolve ids → deck bodies server-side. Cross-profile when asked
    // (mirrors /api/self-play's pool selection), else the active profile only.
    if (!decks?.length) {
      const pool = body?.allProfiles ? await loadAllProfileDecks() : await decksForActiveProfile();
      const chosen = selectDecksByIds(pool, deckIds);
      if (!chosen.length) {
        return Response.json(
          { ready: false, error: "None of the requested deckIds matched a saved deck." },
          { status: 400 },
        );
      }
      // Owning-profile display names (only known on the cross-profile path;
      // decksForActiveProfile deliberately has no registry dependency).
      let profileByDeckId = new Map();
      if (body?.allProfiles) {
        const listing = await listAllProfileDecks();
        profileByDeckId = new Map(listing.map((d) => [d.id, d.profile]));
      }
      const ranked = chosen.map((deck) => ({
        ...summarize(deck),
        profile: profileByDeckId.get(deck.id) ?? null,
      }));
      return Response.json({ ready: true, decks: ranked, comparison: buildComparison(ranked) });
    }

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
