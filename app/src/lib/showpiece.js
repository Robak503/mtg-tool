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

/**
 * The DAILY grail case (Colton's spec, 2026-07-19): ONE hero — the big-dollar
 * chase, rendered large — plus up to 4 supporting picks that favor provenance
 * (signed / altered / showcase) over raw price. Both slots ROTATE DAILY so the
 * case reads fresh each morning:
 *   - hero rotates through the top `heroPool` cards by value;
 *   - supporting rotates through flagged rows first, then unflagged rows at or
 *     above `supportFloor`, in a wrapping daily window.
 * Same day → same case (deterministic on the UTC day index); thin collections
 * degrade to whatever exists — never padded, never fabricated.
 * Returns { hero, supporting } with buildShelf-shaped entries (hero null when
 * the collection holds no treasure).
 */
export function buildDailyShelf(cards, { now = new Date(), heroPool = 3, heroFloor = 50, supportPicks = 4, supportFloor = 20 } = {}) {
  const flagged = [];
  const rest = [];
  for (const row of cards || []) {
    if (row?.wishlist) continue;
    if (isShowpiece(row)) flagged.push({ row, value: rowUnitValue(row), flagged: true });
    else rest.push({ row, value: rowUnitValue(row), flagged: false });
  }
  flagged.sort((a, b) => b.value - a.value);
  rest.sort((a, b) => b.value - a.value);

  const dayIndex = Math.floor(now.getTime() / 86400000);

  // Hero: the chase — top cards at or above the grail floor, one per day. Bulk never
  // headlines just because the collection is thin; when nothing clears the floor,
  // provenance pieces (treasure regardless of price, matching buildShelf) take the slot.
  let chases = [...flagged, ...rest]
    .filter((e) => e.value >= heroFloor)
    .sort((a, b) => b.value - a.value)
    .slice(0, heroPool);
  if (chases.length === 0) chases = flagged.slice(0, heroPool);
  if (chases.length === 0) return { hero: null, supporting: [] };
  const hero = chases[dayIndex % chases.length];

  // Supporting: provenance first, then medium-money, minus the hero; a wrapping
  // daily window over the pool so the small slots swap too.
  const pool = [...flagged, ...rest.filter((e) => e.value >= supportFloor)]
    .filter((e) => e.row !== hero.row);
  let supporting;
  if (pool.length <= supportPicks) {
    supporting = pool;
  } else {
    const offset = (dayIndex * supportPicks) % pool.length;
    supporting = Array.from({ length: supportPicks }, (_, i) => pool[(offset + i) % pool.length]);
  }
  return { hero, supporting };
}
