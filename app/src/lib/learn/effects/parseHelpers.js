/**
 * effects/parseHelpers.js — shared, pure parse-time helpers for the recognition layer.
 *
 * A LEAF module: imports nothing from sibling engine modules, so both parser.js AND the per-family
 * clause-parser modules (atoms/*.js, the matcher-registry seam) can import these without the TDZ
 * import cycle that forbids an atoms module from importing parser.js. Grows as the parser.js
 * matcher-registry seam migrates families out of parseExtendedAtom and they need a shared dep here.
 */

// Spelled cardinals a..five (with the "a"/"an" article forms). The canonical small-count word map the
// parseExtendedAtom matchers use as `SMALL_NUM[word] ?? parseInt(word, 10)`.
export const SMALL_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

// Spelled cardinals up to ten — mill amounts ("Mill three cards", "Mill ten cards") are spelled out.
export const NUM_WORD = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
