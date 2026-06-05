/**
 * deckImportUrl.js — recognize a Moxfield / Archidekt deck URL and pull its id.
 *
 * Pure and dependency-free so the import UI (client) and the import route
 * (server) share one detector. The id is all the server route needs to hit the
 * provider's API.
 *
 *   Moxfield:  https://www.moxfield.com/decks/AbC123_xyz       (alnum / _ / -)
 *   Archidekt: https://archidekt.com/decks/1234567/my-deck     (numeric id)
 *
 * Detection is HOST-ANCHORED: the text must parse as a URL whose hostname is the
 * provider's domain. So `evil.com/moxfield.com/decks/x` is rejected — a trusted
 * domain appearing in the path of a hostile URL never counts as a match.
 */

// Pathname id patterns (the host is validated separately via URL parsing).
const MOXFIELD_PATH = /^\/decks\/([A-Za-z0-9_-]+)/;   // base64-ish id
const ARCHIDEKT_PATH = /^\/decks\/(\d+)/;             // numeric id

function hostMatches(hostname, domain) {
  const h = hostname.toLowerCase();
  return h === domain || h.endsWith(`.${domain}`);
}

function parseUrlish(text) {
  // Accept bare "archidekt.com/decks/123" by supplying a scheme for the parser.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

/**
 * @param {string} input  A pasted deck URL.
 * @returns {{ type: "moxfield" | "archidekt", id: string } | null}
 */
export function detectDeckUrl(input) {
  const text = String(input || "").trim();
  if (!text) return null;

  const url = parseUrlish(text);
  if (!url) return null;

  if (hostMatches(url.hostname, "moxfield.com")) {
    const m = url.pathname.match(MOXFIELD_PATH);
    if (m) return { type: "moxfield", id: m[1] };
  }
  if (hostMatches(url.hostname, "archidekt.com")) {
    const m = url.pathname.match(ARCHIDEKT_PATH);
    if (m) return { type: "archidekt", id: m[1] };
  }
  return null;
}

/** True when the text looks like a deck URL we can import. */
export function isDeckUrl(input) {
  return detectDeckUrl(input) !== null;
}
