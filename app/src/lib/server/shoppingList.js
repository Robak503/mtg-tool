/**
 * shoppingList.js — turn a deck's "missing cards" into an actionable buy list (G2).
 *
 * Input is the `missing` array from deckCost.deckCostToFinish (already excludes
 * basics / sideboard / tokens and is priced cheapest-printing). Pure + no I/O —
 * the route computes `missing` and hands it here.
 *
 * Outputs:
 *   - a structured list (entries + totals)
 *   - plain decklist text ("N Card Name") that pastes straight into
 *     Moxfield / Archidekt / a vendor mass-entry box
 *   - CSV (Quantity, Name, Unit Price, Line Cost)
 */

function csvCell(value) {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * @param missing deckCostToFinish().missing — [{ name, need, unitPrice, lineCost, resolved }]
 * @param opts.excludeUnresolved drop cards we couldn't match to a printing
 */
export function buildShoppingList(missing = [], { excludeUnresolved = false } = {}) {
  const entries = [];
  let totalCards = 0;
  let totalCost = 0;
  let unpricedCount = 0;

  for (const m of missing || []) {
    const qty = m?.need || 0;
    if (qty <= 0) continue;
    if (excludeUnresolved && m.resolved === false) continue;
    totalCards += qty;
    if (m.lineCost != null) totalCost += m.lineCost;
    else unpricedCount += qty;
    entries.push({
      name: m.name,
      qty,
      unitPrice: m.unitPrice ?? null,
      lineCost: m.lineCost ?? null,
    });
  }

  return { entries, totalCards, totalCost: Math.round(totalCost * 100) / 100, unpricedCount };
}

/** Plain decklist ("N Card Name") — importable into Moxfield / Archidekt. */
export function shoppingListText(list) {
  return (list?.entries || []).map(e => `${e.qty} ${e.name}`).join("\n") + ((list?.entries || []).length ? "\n" : "");
}

/** CSV with quantity + pricing. */
export function shoppingListCsv(list) {
  const lines = ["Quantity,Name,Unit Price,Line Cost"];
  for (const e of list?.entries || []) {
    lines.push([
      e.qty,
      csvCell(e.name),
      e.unitPrice ?? "",
      e.lineCost ?? "",
    ].join(","));
  }
  return lines.join("\n") + "\n";
}
