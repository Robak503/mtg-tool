/**
 * /api/spellbook — Server-side Commander Spellbook lookup endpoint.
 *
 * Client-side hooks cannot import spellbook.js (it uses fs).
 * This route bridges that gap: call it from useChatSessions.js for Karn.
 *
 * POST body:
 *   { cardNames: string[], commanderNames?: string[], type?: "combos"|"bracket"|"full" }
 *
 * "combos"  → { included, almostIncluded, ready, formatted }
 * "bracket" → { bracketTag, bracketLabel, gameChangers, massLandDenial, extraTurns, combosFound, ready }
 * "full"    → both, merged
 */

export const runtime = "nodejs";

import {
  findCombos,
  estimateBracket,
  formatCombosForPrompt,
  formatBracketForPrompt,
  spellbookReady,
  getSpellbookMeta,
} from "../../../lib/server/spellbook.js";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ready: false, error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  try {
    const {
      cardNames = [],
      commanderNames = [],
      type = "full",
      maxIncluded = 5,
      maxAlmost = 20,
    } = body || {};

    if (!spellbookReady()) {
      return Response.json(
        { ready: false, error: "Spellbook data not loaded. Run: node scripts/sync-spellbook.cjs" },
        { status: 503 }
      );
    }

    if (type === "bracket") {
      const result = estimateBracket(cardNames, commanderNames);
      return Response.json({
        ...result,
        formatted: formatBracketForPrompt(result),
      });
    }

    if (type === "combos") {
      const result = findCombos(cardNames, { maxAlmost });
      return Response.json({
        ...result,
        formatted: formatCombosForPrompt(result, { maxIncluded, maxAlmost }),
      });
    }

    // type === "full" — return both
    const comboResult = findCombos(cardNames, { maxAlmost });
    const bracketResult = estimateBracket(cardNames, commanderNames);

    return Response.json({
      ready: true,
      combos: {
        ...comboResult,
        formatted: formatCombosForPrompt(comboResult, { maxIncluded, maxAlmost }),
      },
      bracket: {
        ...bracketResult,
        formatted: formatBracketForPrompt(bracketResult),
      },
      meta: getSpellbookMeta(),
    });
  } catch (err) {
    console.error("[/api/spellbook] Error:", err.message);
    return Response.json({ ready: false, error: err.message }, { status: 500 });
  }
}

export async function GET() {
  const ready = spellbookReady();
  const meta = getSpellbookMeta();
  return Response.json({ ready, meta });
}
