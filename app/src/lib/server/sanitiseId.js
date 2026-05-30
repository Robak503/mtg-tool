/**
 * sanitiseId.js — make a user-supplied id safe to use as a filename segment.
 *
 * Replaces anything outside [a-zA-Z0-9._-] with "_", strips leading dots (so
 * the result can never become a hidden file or a path-traversal segment), caps
 * the length at 64, and falls back to "unknown" for empty input. `path.join`
 * keeps callers safe regardless, but this is defense in depth.
 *
 * Shared by the games routes: /api/games derives the on-disk filename from a
 * deckId, and /api/games-summary derives the filter key. Using one
 * implementation guarantees the save key and the query key sanitise
 * identically — previously games saved empty deckIds as "unknown" while
 * games-summary queried "", so such runs could never be summarised back.
 */
export function sanitiseId(value) {
  const stripped = String(value || "unknown")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^\.+/, "");
  const trimmed = stripped.slice(0, 64);
  return trimmed || "unknown";
}
