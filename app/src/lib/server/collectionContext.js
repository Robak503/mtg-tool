/**
 * collectionContext.js — pure helpers over a loaded Collection.
 *
 * Aggregates across stacks (nonfoil / foil / etched) and across printings
 * (rows with the same oracleId but different scryfallId). Callers — API
 * routes and agent prompt builders — work in oracle-id space; this module
 * is the one place that knows the schema underneath.
 *
 * Functions are pure. No I/O. No state. The caller passes in the
 * collection (and decks, where relevant) loaded from storage.
 *
 * For color breakdown and other oracle-keyed metadata that isn't in
 * the collection rows themselves, the caller injects a lookup function.
 * That keeps this module decoupled from cardIndex.js / printingIndex.js
 * and makes it trivial to unit-test with synthetic data.
 */

/**
 * Sum quantity by finish across every printing of an oracle id.
 * Wishlist rows (quantity 0, wishlist: true) are excluded.
 *
 * @returns {{ nonfoil: number, foil: number, etched: number, total: number }}
 */
export function ownedCount(collection, oracleId) {
  let nonfoil = 0, foil = 0, etched = 0;
  if (!collection || !Array.isArray(collection.cards) || !oracleId) {
    return { nonfoil: 0, foil: 0, etched: 0, total: 0 };
  }
  for (const row of collection.cards) {
    if (row.oracleId !== oracleId) continue;
    if (row.wishlist) continue;
    for (const stack of row.stacks || []) {
      const qty = stack.quantity || 0;
      if (stack.finish === "nonfoil") nonfoil += qty;
      else if (stack.finish === "foil") foil += qty;
      else if (stack.finish === "etched") etched += qty;
    }
  }
  return { nonfoil, foil, etched, total: nonfoil + foil + etched };
}

export function isOwned(collection, oracleId, minQty = 1) {
  return ownedCount(collection, oracleId).total >= minQty;
}

/**
 * Set of oracleIds where the user owns at least one copy (any finish).
 * Excludes wishlist rows. Used by Karn "build from collection" mode to
 * pre-filter suggestions.
 */
export function buildOwnedSet(collection) {
  const set = new Set();
  if (!collection || !Array.isArray(collection.cards)) return set;
  for (const row of collection.cards) {
    if (row.wishlist) continue;
    if (!row.oracleId) continue;
    const total = (row.stacks || []).reduce((s, st) => s + (st.quantity || 0), 0);
    if (total > 0) set.add(row.oracleId);
  }
  return set;
}

/**
 * Cross-deck usage map. For each oracleId referenced by any deck, returns
 * how many copies are used vs owned and which decks include the card.
 *
 * decks: array of decks with shape { id, name, cards: [{ oracleId, quantity }] }
 *
 * @returns {Map<string, { ownedQty: number, usedQty: number, deckIds: string[] }>}
 */
export function crossDeckUsage(collection, decks) {
  const usage = new Map();
  if (!Array.isArray(decks)) return usage;

  const ownedByOracle = new Map();
  if (collection && Array.isArray(collection.cards)) {
    for (const row of collection.cards) {
      if (row.wishlist) continue;
      if (!row.oracleId) continue;
      const total = (row.stacks || []).reduce((s, st) => s + (st.quantity || 0), 0);
      if (total > 0) {
        ownedByOracle.set(row.oracleId, (ownedByOracle.get(row.oracleId) || 0) + total);
      }
    }
  }

  for (const deck of decks) {
    if (!deck || !Array.isArray(deck.cards)) continue;
    for (const card of deck.cards) {
      const oracleId = card?.oracleId;
      if (!oracleId) continue;
      const qty = card.quantity || 1;
      const entry = usage.get(oracleId) || {
        ownedQty: ownedByOracle.get(oracleId) || 0,
        usedQty: 0,
        deckIds: [],
      };
      entry.usedQty += qty;
      if (deck.id != null && !entry.deckIds.includes(deck.id)) {
        entry.deckIds.push(deck.id);
      }
      usage.set(oracleId, entry);
    }
  }

  return usage;
}

/**
 * Cards used across decks beyond what the user owns.
 * Each conflict: { oracleId, ownedQty, usedQty, deckIds }.
 */
export function conflicts(collection, decks) {
  const usage = crossDeckUsage(collection, decks);
  const out = [];
  for (const [oracleId, entry] of usage.entries()) {
    if (entry.usedQty > entry.ownedQty) {
      out.push({
        oracleId,
        ownedQty: entry.ownedQty,
        usedQty: entry.usedQty,
        deckIds: entry.deckIds,
      });
    }
  }
  return out;
}

/**
 * High-level rollup for agent prompts and the Collection home stat block.
 *
 * lookupOracleColors(oracleId): optional callback returning an array of
 *   color identity letters (e.g. ["U", "B"]) or null. When omitted, the
 *   color breakdown is all zeros — the caller is responsible for wiring
 *   this up via oracle-index data.
 *
 * Output cap: topByCount is sliced to the top 20 entries so the rendered
 * agent prompt block stays under the 400-token budget (Step 8 of the
 * design doc — see "Agent Integration").
 */
export function collectionSummary(collection, lookupOracleColors = null) {
  const out = {
    totalCards: 0,
    uniqueOracles: 0,
    colorBreakdown: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    topByCount: [],
    totalValueUsd: 0,
  };

  if (!collection || !Array.isArray(collection.cards)) return out;

  const uniqueOracles = new Set();
  const oracleCounts = new Map();
  const nameByOracle = new Map();
  let totalValue = 0;

  for (const row of collection.cards) {
    if (row.wishlist) continue;
    let rowQty = 0;
    let rowValue = 0;
    for (const stack of row.stacks || []) {
      const qty = stack.quantity || 0;
      if (qty <= 0) continue;
      rowQty += qty;
      const priceKey = stack.finish === "foil"
        ? "usdFoil"
        : stack.finish === "etched"
          ? "usdEtched"
          : "usd";
      const price = parseFloat(row.prices?.[priceKey] || 0);
      if (Number.isFinite(price)) rowValue += price * qty;
    }
    if (rowQty <= 0) continue;
    out.totalCards += rowQty;
    if (row.oracleId) {
      uniqueOracles.add(row.oracleId);
      oracleCounts.set(row.oracleId, (oracleCounts.get(row.oracleId) || 0) + rowQty);
      if (row.name && !nameByOracle.has(row.oracleId)) {
        nameByOracle.set(row.oracleId, row.name);
      }
    }
    totalValue += rowValue;

    if (lookupOracleColors && row.oracleId) {
      const colors = lookupOracleColors(row.oracleId);
      if (Array.isArray(colors)) {
        if (colors.length === 0) {
          out.colorBreakdown.C += rowQty;
        } else {
          for (const c of colors) {
            if (c in out.colorBreakdown) out.colorBreakdown[c] += rowQty;
          }
        }
      }
    }
  }

  out.uniqueOracles = uniqueOracles.size;
  out.totalValueUsd = Math.round(totalValue * 100) / 100;
  out.topByCount = Array.from(oracleCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([oracleId, qty]) => ({
      oracleId,
      name: nameByOracle.get(oracleId) || "Unknown",
      qty,
    }));

  return out;
}
