/**
 * Phase 6 §11.9 — formatDetection.js
 *
 * Infer which play format a saved deck belongs to, so the Learn-to-Play
 * session can pick the right mode automatically instead of making the
 * user declare it.
 *
 * Product rule (Colton, 2026-05-28):
 *   "100 card decks are for commander, and 60 card decks with or without
 *    a sideboard are for standard."
 *
 * We support exactly two modes — there is no abstract N-player concept:
 *   - "standard"  → Standard (1v1)
 *   - "commander" → Commander (4-player free-for-all)
 *
 * The returned `format` string is intentionally identical to the engine's
 * `state.mode` value (see §11.2), so callers can use it directly:
 *   const { format } = detectDeckFormat(deck);
 *   createLearnSession({ mode: format, ... });
 *
 * Pure: no fetches, no React. Reads only the deck's parsed `cards` array
 * (shape from deckMemory.js: { qty, name, section }).
 */

// Maindeck count at or above this resolves to Commander; below it,
// Standard. 80 is the midpoint between the two legal deck sizes (60 and
// 100), so an off-count deck still snaps to whichever format it's nearer.
const COMMANDER_SIZE_THRESHOLD = 80;

const VALID_FORMATS = new Set(["standard", "commander"]);

/**
 * Count cards per zone the way format rules care about. Tokens never
 * count toward deck size (they're not deck cards); sideboard is tracked
 * separately because its size is irrelevant to the 60/100 maindeck
 * distinction but its mere presence is a Standard tell.
 */
function tallyDeck(deck) {
  const cards = Array.isArray(deck?.cards) ? deck.cards : [];
  let commander = 0;
  let mainboard = 0;
  let sideboard = 0;
  for (const c of cards) {
    const qty = Number.isFinite(c?.qty) ? c.qty : 1;
    switch (c?.section) {
      case "Commander":
        commander += qty;
        break;
      case "Sideboard":
        sideboard += qty;
        break;
      case "Tokens":
        // Not a deck card — excluded from every size signal.
        break;
      default:
        // "Mainboard" or any unrecognized section counts as maindeck.
        mainboard += qty;
        break;
    }
  }
  return { commander, mainboard, sideboard, maindeck: commander + mainboard };
}

/**
 * Detect the play format from deck composition.
 *
 * Signals, in priority order:
 *   1. A designated Commander section → "commander". Only EDH/Brawl decks
 *      name a commander, and those are 100-card singleton, so this is the
 *      strongest signal and overrides size (handles a deck whose 99 is
 *      mid-build and not yet at 100).
 *   2. Maindeck size ≥ 80 → "commander" (≈100); otherwise → "standard"
 *      (≈60). Catches decks pasted as a flat 100 lines with no commander
 *      tag.
 *   3. A sideboard with no commander reinforces "standard" (Commander has
 *      no sideboard) — already implied by size, surfaced in `reason`.
 *
 * @param {{ cards?: Array<{ qty?: number, name?: string, section?: string }> }} deck
 * @returns {{
 *   format: "standard" | "commander",
 *   reason: string,
 *   counts: { commander: number, mainboard: number, sideboard: number, maindeck: number },
 * }}
 */
export function detectDeckFormat(deck) {
  const counts = tallyDeck(deck);
  const { commander, mainboard, sideboard, maindeck } = counts;

  if (commander > 0) {
    return {
      format: "commander",
      reason: `Designated commander (${commander}) + ${mainboard}-card deck`,
      counts,
    };
  }

  if (maindeck >= COMMANDER_SIZE_THRESHOLD) {
    return {
      format: "commander",
      reason: `${maindeck}-card singleton deck (no sideboard)`,
      counts,
    };
  }

  return {
    format: "standard",
    reason:
      sideboard > 0
        ? `${mainboard}-card maindeck + ${sideboard}-card sideboard`
        : `${mainboard}-card deck`,
    counts,
  };
}

/**
 * How many opponents a format implies for a Learn session:
 *   standard  → 1 (heads-up)
 *   commander → 3 (4-player free-for-all: you + 3)
 */
export function opponentCountForFormat(format) {
  return format === "commander" ? 3 : 1;
}

export function isValidFormat(format) {
  return VALID_FORMATS.has(format);
}

export { COMMANDER_SIZE_THRESHOLD };
