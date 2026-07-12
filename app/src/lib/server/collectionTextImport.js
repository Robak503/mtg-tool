/**
 * collectionTextImport.js — PASTE-A-LIST (C5-P1.2). A collector entering a prerelease haul or a box of
 * pulls types plain decklist lines instead of building a CSV in another tool. Each line:
 *
 *     4 Sol Ring (C21) 263 *F*
 *     └qty  └name    └set  └#  └foil
 *
 * qty (optional, `N` or `Nx`, default 1) · name (required) · optional `(SET)` set code · optional collector
 * number · optional foil token (`*F*`, `[foil]`, or a trailing `foil`). Blank lines and `#`/`//` comment
 * lines are ignored.
 *
 * Produces the SAME `{ format, entries, errors }` shape parseCollectionCsv does — entries carry
 * `{ count, name, setCode, condition, finish, language, sourceLineNumber }` — so the whole import pipeline
 * (matchEntries → preview → dry-run → commit, with its 4 modes + guards) is reused verbatim; the route only
 * adds a `body.text` branch. Condition/language aren't in the grammar (a paste-a-list is a quick bulk entry,
 * not a graded inventory), so they default (NM / English) exactly like a Deckbox row that omits them.
 */

// A foil marker anywhere on the line: `*F*` / `*foil*` / `[foil]` / a trailing " foil". Case-insensitive.
const FOIL_TOKEN = /\s*(?:\*f\*|\*foil\*|\[foil\]|\(foil\)|\bfoil\b)\s*$/i;
// A trailing `(SET)` optionally followed by a collector number: "(C21)" or "(C21) 263" or "(C21) 263a".
const SET_COLLECTOR = /\s*\(([A-Za-z0-9]{2,6})\)(?:\s+([A-Za-z0-9★-]+))?\s*$/;
// A leading quantity: "4 " or "4x " or "4× ".
const LEADING_QTY = /^(\d{1,5})\s*[x×]?\s+/i;

/**
 * Parse one text line into an entry, or return `{ error }` / null (blank/comment).
 * `lineNumber` is 1-based for error + source attribution.
 */
export function parseCollectionTextLine(rawLine, lineNumber) {
  const line = String(rawLine || "").trim();
  if (!line) return null;                          // blank
  if (/^(#|\/\/)/.test(line)) return null;         // comment

  let rest = line;
  let finish = "nonfoil";
  // 1) foil token (strip from the end first so it can't be mistaken for a name word).
  if (FOIL_TOKEN.test(rest)) {
    finish = "foil";
    rest = rest.replace(FOIL_TOKEN, "").trim();
  }
  // 2) leading quantity.
  let count = 1;
  const qtyMatch = rest.match(LEADING_QTY);
  if (qtyMatch) {
    count = parseInt(qtyMatch[1], 10);
    rest = rest.slice(qtyMatch[0].length).trim();
  }
  if (!Number.isFinite(count) || count <= 0) {
    return { error: { line: lineNumber, message: `Invalid quantity on "${line}"` } };
  }
  // 3) trailing `(SET)` + optional collector number.
  let setCode = "";
  const setMatch = rest.match(SET_COLLECTOR);
  if (setMatch) {
    setCode = setMatch[1];
    rest = rest.slice(0, setMatch.index).trim();
  }
  // 4) whatever's left is the name.
  const name = rest.trim();
  if (!name) {
    return { error: { line: lineNumber, message: `Line ${lineNumber} has no card name` } };
  }
  return {
    entry: {
      count,
      name,
      setCode,
      condition: "NM",
      finish,
      language: "English",
      sourceLineNumber: lineNumber,
    },
  };
}

/**
 * Parse a whole pasted list. Returns `{ format: "text", entries, errors }` — the exact shape
 * parseCollectionCsv returns, so matchEntries + the import route consume it identically.
 */
export function parseCollectionText(text) {
  const lines = String(text || "").split(/\r?\n/);
  const entries = [];
  const errors = [];
  for (let i = 0; i < lines.length; i++) {
    const result = parseCollectionTextLine(lines[i], i + 1);
    if (!result) continue;           // blank / comment
    if (result.error) { errors.push(result.error); continue; }
    entries.push(result.entry);
  }
  if (entries.length === 0 && errors.length === 0) {
    errors.push({ line: 0, message: "No card lines found. Paste a list like: 4 Sol Ring (C21) 263 *F*" });
  }
  return { format: "text", entries, errors };
}
