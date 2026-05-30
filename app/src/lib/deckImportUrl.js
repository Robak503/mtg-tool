/**
 * deckImportUrl.js — recognize a Moxfield / Archidekt deck URL and pull its id.
 *
 * Pure and dependency-free so the import UI (client) and the import route
 * (server) share one detector. The id is all the server route needs to hit the
 * provider's API.
 *
 *   Moxfield:  https://www.moxfield.com/decks/AbC123_xyz       (alnum / _ / -)
 *   Archidekt: https://archidekt.com/decks/1234567/my-deck     (numeric id)
 */

// Moxfield deck ids are URL-safe base64-ish: letters, digits, _ and -.
const MOXFIELD_RE = /moxfield\.com\/decks\/([A-Za-z0-9_-]+)/i;
// Archidekt deck ids are numeric; an optional /slug follows.
const ARCHIDEKT_RE = /archidekt\.com\/decks\/(\d+)/i;

/**
 * @param {string} input  A pasted URL (or any text containing one).
 * @returns {{ type: "moxfield" | "archidekt", id: string } | null}
 */
export function detectDeckUrl(input) {
  const text = String(input || "").trim();
  if (!text) return null;

  const mox = text.match(MOXFIELD_RE);
  if (mox) return { type: "moxfield", id: mox[1] };

  const arch = text.match(ARCHIDEKT_RE);
  if (arch) return { type: "archidekt", id: arch[1] };

  return null;
}

/** True when the text looks like a deck URL we can import. */
export function isDeckUrl(input) {
  return detectDeckUrl(input) !== null;
}
