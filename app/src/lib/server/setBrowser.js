/**
 * setBrowser.js — pure helpers for the Set Browser (#23).
 *
 * The printing index supplies the sets and their cards; these functions
 * cross-reference the user's collection to flag what's owned. Pure — the route
 * injects the collection and the index data.
 */

const ownedRow = (row) => !row.wishlist && (row.stacks || []).some((s) => (s.quantity || 0) > 0);

/** Distinct owned printings per set code (lowercased), from the collection. */
export function ownedCountsBySet(collection) {
  const counts = new Map();
  for (const row of collection?.cards || []) {
    if (!ownedRow(row) || !row.setCode) continue;
    const code = String(row.setCode).toLowerCase();
    counts.set(code, (counts.get(code) || 0) + 1);
  }
  return counts;
}

/** Owned scryfallId + oracleId sets (non-wishlist) for owned-flagging. */
export function ownedSets(collection) {
  const scryfall = new Set();
  const oracles = new Set();
  for (const row of collection?.cards || []) {
    if (!ownedRow(row)) continue;
    if (row.scryfallId) scryfall.add(row.scryfallId);
    if (row.oracleId) oracles.add(row.oracleId);
  }
  return { scryfall, oracles };
}

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Project raw printing-index rows into Set Browser cards, flagging ownership:
 *   owned               — you own this exact printing
 *   ownedOtherPrinting  — you own this card, but a different printing
 */
export function annotateSetCards(cards, ownedScryfall, ownedOracles) {
  return (cards || []).map((c) => ({
    scryfallId: c.id,
    oracleId: c.oracleId || null,
    name: c.name || "Unknown card",
    collectorNumber: c.collectorNumber || "",
    rarity: c.rarity || null,
    setCode: c.set || null,
    usd: num(c.prices?.usd),
    usdFoil: num(c.prices?.usdFoil),
    art: c.artCropUrl || null,
    owned: !!c.id && ownedScryfall.has(c.id),
    ownedOtherPrinting: !!c.oracleId && !ownedScryfall.has(c.id) && ownedOracles.has(c.oracleId),
  }));
}
