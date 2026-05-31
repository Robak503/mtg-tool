/**
 * /api/combos — "what combos are in (or one card away from) this deck?"
 *
 * Thin wrapper over the local Commander Spellbook integration
 * (lib/server/spellbook.findCombos). The matching logic + "almost included"
 * detection already live in spellbook.js; this route just exposes them to the
 * client so the RightPanel Combos tab can surface them. Read-only, zero network
 * calls in normal operation (the bundled/synced combo snapshot is local).
 */

export const runtime = "nodejs";

import {
  findCombos,
  getSpellbookMeta,
  spellbookReady,
} from "../../../lib/server/spellbook.js";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ready: false, error: "Invalid JSON request body." },
      { status: 400 },
    );
  }

  const cardNames = Array.isArray(body?.cardNames)
    ? body.cardNames.filter(name => typeof name === "string" && name.trim())
    : null;

  if (!cardNames) {
    return Response.json(
      { ready: false, error: "Request body must include a cardNames array." },
      { status: 400 },
    );
  }

  try {
    const result = findCombos(cardNames, {
      includeAlmost: true,
      maxAlmost: Math.min(Math.max(Number(body.maxAlmost) || 30, 1), 100),
    });
    return Response.json(result);
  } catch (err) {
    console.error("[/api/combos] Error:", err);
    return Response.json(
      { ready: false, error: err?.message || "Combo lookup failed." },
      { status: 500 },
    );
  }
}

export async function GET() {
  return Response.json({
    ready: spellbookReady(),
    meta: getSpellbookMeta() || null,
  });
}
