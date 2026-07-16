/**
 * showpiece.js — what counts as Vault treasure (C5-P2.1).
 *
 * A row is a SHOWPIECE when the collector flagged it: signed, artist proof,
 * altered, or showcase-pinned (the ★ toggle in the card drawer). The shelf
 * that opens The Stacks shows every flagged row plus the collection's top few
 * unflagged cards by value — the $50 floor matches the Finance grail floor so
 * bulk never sneaks onto the shelf. Shared by the shelf and the grid's
 * elevated-cell treatment so "treasure" means one thing everywhere.
 */

export function isShowpiece(row) {
  return !!(row && (row.signed || row.artistProof || row.altered || row.showcase));
}

const FINISH_PRICE_KEY = { foil: "usdFoil", etched: "usdEtched" };

// Highest per-copy price among the row's OWNED finishes (qty > 0 stacks only).
export function rowUnitValue(row) {
  let best = 0;
  for (const stack of row?.stacks || []) {
    if ((stack.quantity || 0) <= 0) continue;
    const price = parseFloat(row.prices?.[FINISH_PRICE_KEY[stack.finish] || "usd"] || 0);
    if (Number.isFinite(price) && price > best) best = price;
  }
  return best;
}

/**
 * The shelf: every provenance-flagged row (value-sorted), then up to
 * `valuePicks` unflagged owned rows at or above `valueFloor`, value-sorted.
 * Returns [{ row, value, flagged }] — empty array when the collection has no
 * treasure yet (the shelf simply doesn't render).
 */
export function buildShelf(cards, { valuePicks = 5, valueFloor = 50 } = {}) {
  const flagged = [];
  const rest = [];
  for (const row of cards || []) {
    if (isShowpiece(row)) flagged.push({ row, value: rowUnitValue(row), flagged: true });
    else if (!row.wishlist) rest.push({ row, value: rowUnitValue(row), flagged: false });
  }
  flagged.sort((a, b) => b.value - a.value);
  const byValue = rest
    .filter((e) => e.value >= valueFloor)
    .sort((a, b) => b.value - a.value)
    .slice(0, valuePicks);
  return [...flagged, ...byValue];
}
