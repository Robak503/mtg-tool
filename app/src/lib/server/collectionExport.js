/**
 * collectionExport.js — serialize The Vault for backup / portability (G3).
 *
 * Two formats, both pure (no I/O — the route loads the collection and hands it
 * here):
 *   - JSON: a lossless backup of the whole collection (stacks, wishlist, tags,
 *     notes, prices) — the escape hatch / migration format.
 *   - CSV: a Deckbox-style sheet (Count, Name, Edition, Condition, Foil,
 *     Language) of OWNED stacks only. Deliberately mirrors the columns
 *     collectionCsvImport.parseCollectionCsv reads, so an export round-trips
 *     back through the app's own importer (and into Deckbox/Moxfield).
 */

const CSV_HEADER = ["Count", "Name", "Edition", "Condition", "Foil", "Language"];

function csvCell(value) {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function finishToFoil(finish) {
  if (finish === "foil") return "foil";
  if (finish === "etched") return "etched";
  return ""; // nonfoil / unknown
}

/**
 * Lossless JSON backup. `exportedAt` lets the caller stamp it; defaults to now.
 */
export function collectionToJson(collection, exportedAt = new Date().toISOString()) {
  return JSON.stringify(
    {
      kind: "mtg-tool-collection",
      version: collection?.version || 1,
      exportedAt,
      cardCount: (collection?.cards || []).length,
      cards: collection?.cards || [],
    },
    null,
    2,
  );
}

/**
 * Deckbox-style CSV of owned stacks (one row per finish, qty > 0). Wishlist
 * rows and zero-qty stacks are excluded so a re-import doesn't mark unowned
 * cards as owned. Round-trips through parseCollectionCsv (format "deckbox").
 */
export function collectionToCsv(collection) {
  const lines = [CSV_HEADER.join(",")];
  for (const card of collection?.cards || []) {
    if (card?.wishlist) continue;
    for (const stack of card?.stacks || []) {
      const qty = stack?.quantity || 0;
      if (qty <= 0) continue;
      lines.push([
        qty,
        csvCell(card.name),
        csvCell(card.setCode || card.set || ""),
        csvCell(stack.condition || "NM"),
        finishToFoil(stack.finish),
        csvCell(card.language || "English"),
      ].join(","));
    }
  }
  return lines.join("\n") + "\n";
}
