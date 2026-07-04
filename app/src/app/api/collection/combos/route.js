/**
 * /api/collection/combos — "what can I assemble from cards I own" (Vault V9).
 *
 * GET → owned card names joined against the bundled Commander Spellbook
 * snapshot: combos whose every piece you already own, plus one-card-away
 * combos with the missing piece priced from the local printings index
 * (cheapest paper printing with a USD price). Read-only; fully local; 200
 * with ready:false when the Spellbook snapshot isn't synced yet.
 */

export const runtime = "nodejs";

import { loadCollection } from "../../../../lib/server/collectionStorage.js";
import { findCombos } from "../../../../lib/server/spellbook.js";
import { lookupByName } from "../../../../lib/server/printingIndex.js";

const ownedRow = (row) => !row.wishlist && (row.stacks || []).some((s) => (s.quantity || 0) > 0);

const MAX_COMPLETE = 40;
const MAX_ONE_AWAY = 25;

// Cheapest USD across a card's paper printings (any finish); null when the
// index has no priced printing — callers surface that honestly.
function cheapestUsd(name) {
  const printings = lookupByName(name) || [];
  let best = null;
  for (const p of printings) {
    for (const v of [p.usd, p.usdFoil, p.usdEtched]) {
      const n = parseFloat(v);
      if (Number.isFinite(n) && (best === null || n < best)) best = n;
    }
  }
  return best;
}

export async function GET() {
  try {
    const { collection } = await loadCollection();
    const names = [];
    const seen = new Set();
    for (const row of collection.cards || []) {
      if (!ownedRow(row) || !row.name) continue;
      const key = row.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(row.name);
    }

    const { included, almostIncluded, ready } = findCombos(names, {
      includeAlmost: true,
      maxAlmost: 200,
    });

    const complete = included.slice(0, MAX_COMPLETE).map((c) => ({
      cards: c.cards || [],
      produces: c.produces || [],
      bracketTag: c.bracketTag || null,
      identity: c.identity || null,
      popularity: c.popularity ?? null,
    }));

    const oneAway = (almostIncluded || [])
      .filter((c) => (c.missing || []).length === 1)
      .slice(0, MAX_ONE_AWAY)
      .map((c) => {
        const missingName = c.missing[0]?.name || c.missing[0];
        return {
          cards: c.cards || [],
          produces: c.produces || [],
          bracketTag: c.bracketTag || null,
          identity: c.identity || null,
          popularity: c.popularity ?? null,
          missingName,
          missingUsd: missingName ? cheapestUsd(missingName) : null,
        };
      })
      .sort((a, b) => (a.missingUsd ?? Infinity) - (b.missingUsd ?? Infinity));

    return Response.json({
      ready,
      ownedCards: names.length,
      completeCount: included.length,
      complete,
      oneAway,
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to compute owned combos." },
      { status: 500 },
    );
  }
}
