/**
 * collectionCsvImport.js — parse Deckbox + Moxfield CSV exports.
 *
 * Both formats are very similar (Count, Name, Edition, Condition,
 * Language, Foil — plus format-specific extras). We auto-detect by
 * header signature and produce a normalized list of entries.
 *
 * After parsing, callers match each entry against the printings index
 * via lookupByNameAndSet and produce a preview of matched + unmatched
 * rows for the import modal UI.
 *
 * Server-side (Node) module. Pure functions; no I/O.
 */

import { lookupByNameAndSet } from "./printingIndex.js";

/**
 * Minimal CSV parser. Handles quoted fields with embedded commas,
 * escaped quotes ("" inside quoted fields), and CRLF / LF line
 * endings. Returns an array of rows, each row an array of strings.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  const src = String(text || "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cur);
        cur = "";
      } else if (ch === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else if (ch === "\r") {
        // ignore — newline handler covers it
      } else {
        cur += ch;
      }
    }
  }
  // Trailing partial row
  if (cur !== "" || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  // Strip BOM from first cell of first row if present
  if (rows.length > 0 && rows[0].length > 0 && rows[0][0].charCodeAt(0) === 0xfeff) {
    rows[0][0] = rows[0][0].slice(1);
  }
  return rows;
}

/**
 * Detect the source format from the header row. Returns "deckbox",
 * "moxfield", or "unknown".
 */
export function detectFormat(header) {
  if (!Array.isArray(header)) return "unknown";
  const lc = header.map(h => String(h || "").trim().toLowerCase());
  if (lc.includes("tags") && lc.includes("last modified")) return "moxfield";
  if (lc.includes("foil") && lc.includes("edition")) return "deckbox";
  return "unknown";
}

const CONDITION_MAP = [
  [/^near\s*mint$|^nm/, "NM"],
  [/^mint$|^m$/, "NM"],
  [/^lightly\s*played$|^lp/, "LP"],
  [/^excellent$|^good$/, "LP"],
  [/^moderately\s*played$|^mp/, "MP"],
  [/^played$/, "MP"],
  [/^heavily\s*played$|^hp/, "HP"],
  [/^damaged$|^dmg|^poor$/, "DMG"],
];

export function normalizeCondition(raw) {
  const c = String(raw || "").trim().toLowerCase();
  if (!c) return "NM";
  for (const [pattern, code] of CONDITION_MAP) {
    if (pattern.test(c)) return code;
  }
  return "NM";
}

export function normalizeFinish(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "foil") return "foil";
  if (v === "etched") return "etched";
  if (v === "non-foil" || v === "nonfoil" || v === "") return "nonfoil";
  return "nonfoil";
}

function columnIndex(header, name) {
  const lc = name.toLowerCase();
  return header.findIndex(h => String(h || "").trim().toLowerCase() === lc);
}

function getField(header, row, name) {
  const idx = columnIndex(header, name);
  return idx >= 0 ? (row[idx] ?? "") : "";
}

/**
 * Parse the full CSV text into normalized entries. Each entry:
 *   { count, name, setCode, condition, finish, language, sourceLineNumber }
 *
 * Returns { format, entries, errors }. Rows that can't be parsed
 * (missing required fields) get a row in `errors` and are skipped.
 */
export function parseCollectionCsv(text) {
  const rows = parseCsv(text).filter(r => r.length > 0 && r.some(c => c && c.trim()));
  if (rows.length < 2) {
    return { format: "unknown", entries: [], errors: [{ line: 0, message: "CSV has no data rows" }] };
  }
  const header = rows[0];
  const format = detectFormat(header);
  if (format === "unknown") {
    return {
      format,
      entries: [],
      errors: [{ line: 1, message: "Unrecognized CSV format. Expected Deckbox or Moxfield export." }],
    };
  }

  const entries = [];
  const errors = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = getField(header, row, "Name").trim();
    if (!name) {
      errors.push({ line: i + 1, message: "Row missing card name" });
      continue;
    }
    const countRaw = getField(header, row, "Count").trim();
    const count = parseInt(countRaw, 10);
    if (!Number.isFinite(count) || count <= 0) {
      errors.push({ line: i + 1, message: `Row "${name}" has invalid count "${countRaw}"` });
      continue;
    }

    entries.push({
      count,
      name,
      setCode: getField(header, row, "Edition").trim(),
      condition: normalizeCondition(getField(header, row, "Condition")),
      finish: normalizeFinish(getField(header, row, "Foil")),
      language: getField(header, row, "Language").trim() || "English",
      sourceLineNumber: i + 1,
    });
  }

  return { format, entries, errors };
}

/**
 * Match parsed entries against the bundled printings index. Returns
 * { matched, unmatched } where matched entries carry the resolved
 * scryfallId / oracleId / canonical name / art crop, and unmatched
 * entries are returned verbatim with their source line number.
 *
 * Doesn't write anything. Callers use this to preview the import.
 */
export function matchEntries(entries) {
  const matched = [];
  const unmatched = [];
  for (const entry of entries) {
    const printing = lookupByNameAndSet(entry.name, entry.setCode);
    if (!printing) {
      unmatched.push(entry);
      continue;
    }
    matched.push({
      entry,
      printing,
      row: {
        scryfallId: printing.id,
        oracleId: printing.oracleId,
        name: printing.name,
        setCode: printing.set,
        collectorNumber: printing.collectorNumber,
        stacks: [{
          finish: entry.finish,
          quantity: entry.count,
          condition: entry.condition,
        }],
        addedAt: new Date().toISOString(),
        notes: "",
        wishlist: false,
        prices: printing.prices,
        artCropUrl: printing.artCropUrl,
      },
    });
  }
  return { matched, unmatched };
}

/**
 * Update modes for importing into an existing collection (G4):
 *   - "merge"     — sum quantities by finish (the original behavior; "I bought more")
 *   - "add-only"  — add new cards/finishes; never change an existing quantity
 *   - "replace"   — set each imported printing's stacks to exactly the import's
 *                   (cards NOT in the import are untouched)
 *   - "reconcile" — like replace, AND remove owned (non-wishlist) printings that
 *                   aren't in the import — i.e. make the collection match the file
 *                   ("mark-absent"). Destructive; gated behind the diff preview.
 */
export const IMPORT_MODES = ["merge", "add-only", "replace", "reconcile"];
const normalizeMode = (m) => (IMPORT_MODES.includes(m) ? m : "merge");
const stackQtyTotal = (stacks) => (stacks || []).reduce((s, st) => s + (st.quantity || 0), 0);

// Apply one import row's stacks onto an existing printing's stacks per `mode`.
function applyStacks(existingStacks, newStacks, mode) {
  if (mode === "replace" || mode === "reconcile") {
    return (newStacks || []).map((s) => ({ ...s }));
  }
  const stacks = [...(existingStacks || [])];
  for (const ns of newStacks || []) {
    const i = stacks.findIndex((s) => s.finish === ns.finish);
    if (i < 0) {
      stacks.push({ ...ns }); // new finish — added under every mode
    } else if (mode === "merge") {
      stacks[i] = {
        ...stacks[i],
        quantity: (stacks[i].quantity || 0) + (ns.quantity || 0),
        condition: ns.condition || stacks[i].condition,
      };
    }
    // add-only on an existing finish: leave the existing quantity untouched.
  }
  return stacks;
}

/**
 * Merge a list of import rows into an existing collection under `mode` (above).
 * Returns { merged: collection, stats: { added, mergedCount, removed } }.
 */
export function mergeImportRows(collection, importRows, mode = "merge") {
  const useMode = normalizeMode(mode);
  const merged = {
    version: collection.version || 1,
    updatedAt: new Date().toISOString(),
    cards: [...(collection.cards || [])],
  };
  let added = 0;
  let mergedCount = 0;
  let removed = 0;
  const importIds = new Set((importRows || []).map((r) => r.scryfallId));

  for (const row of importRows || []) {
    const idx = merged.cards.findIndex((c) => c.scryfallId === row.scryfallId);
    if (idx < 0) {
      merged.cards.push({ ...row });
      added += 1;
    } else {
      const existing = merged.cards[idx];
      const stacks = applyStacks(existing.stacks, row.stacks, useMode);
      const anyOwned = stacks.some((s) => (s.quantity || 0) > 0);
      merged.cards[idx] = {
        ...existing,
        stacks,
        wishlist: anyOwned ? false : existing.wishlist,
      };
      mergedCount += 1;
    }
  }

  if (useMode === "reconcile") {
    const kept = merged.cards.filter((c) => {
      if (c.wishlist) return true;                 // never touch the wishlist
      if (importIds.has(c.scryfallId)) return true; // present in the import
      if (stackQtyTotal(c.stacks) === 0) return true; // already empty
      return false;                                 // owned, absent from import → drop
    });
    removed = merged.cards.length - kept.length;
    merged.cards = kept;
  }

  return { merged, stats: { added, mergedCount, removed } };
}

/**
 * Compute what an import would change WITHOUT writing, for the confirm-preview.
 * @returns { mode, newCards:[{name,qty}], changed:[{name,from,to}],
 *            removed:[{name,qty}], unchangedCount }
 */
export function diffImport(collection, importRows, mode = "merge") {
  const useMode = normalizeMode(mode);
  const byId = new Map((collection.cards || []).map((c) => [c.scryfallId, c]));
  const importIds = new Set((importRows || []).map((r) => r.scryfallId));
  const newCards = [];
  const changed = [];
  const removed = [];
  let unchangedCount = 0;

  for (const row of importRows || []) {
    const existing = byId.get(row.scryfallId);
    if (!existing) {
      newCards.push({ name: row.name, qty: stackQtyTotal(row.stacks) });
      continue;
    }
    const fromQty = stackQtyTotal(existing.stacks);
    const toQty = stackQtyTotal(applyStacks(existing.stacks, row.stacks, useMode));
    if (toQty !== fromQty) changed.push({ name: existing.name, from: fromQty, to: toQty });
    else unchangedCount += 1;
  }

  if (useMode === "reconcile") {
    for (const c of collection.cards || []) {
      if (c.wishlist || importIds.has(c.scryfallId)) continue;
      const q = stackQtyTotal(c.stacks);
      if (q > 0) removed.push({ name: c.name, qty: q });
    }
  }

  return { mode: useMode, newCards, changed, removed, unchangedCount };
}
