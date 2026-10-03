/**
 * commanderIdentity.js — "your commander's color identity" (CR 903.4), read one way everywhere. A LEAF module (no imports),
 * so layers, legalChoices and gameState can all read it without adding an edge to the engine's import graph.
 *
 * A commander's color identity is established before the game begins and never changes (CR 903.4a), and the commander
 * designation rides the card across zones (CR 903.3). So the identity is stamped onto the seat at game start
 * (createPlayerState → `commanderIdentity`, the union over the seat's commanders — partners and backgrounds included) and
 * read from there, wherever the commander is now: cast to the battlefield, on the stack, stolen. The command zone is read
 * as well, so a hand-built state that only fills the zone still answers (and an older save without the stamp).
 *
 * ⛔ Reading the command zone ALONE was the bug this module fixed (play-weighted P·6, 2026-10-01): once the commander was
 * cast the zone was empty, so Commander's Plate on a mono-green commander gave protection from all five colors — green
 * included.
 *
 * ⛔ A commander card with NO identity field is unknown, not colorless (2026-10-03): the deck enrichment did not carry the
 * field, so every real game stamped [] and the Plate protected from all five colors again — the fixtures of the fix above
 * set the field by hand, so the tests stayed green. Unknown reads as null (the quality does nothing), never as [].
 *
 * null means the seat has no commander (or one whose identity is unknown): CR 903.4f — the quality is undefined; a cost that refers to it is unpayable and the
 * part of an effect that refers to it does nothing. A colorless commander is [] (a defined, empty identity).
 */
const WUBRG = ["W", "U", "B", "R", "G"];

/** The union of the cards' color identities, in WUBRG order (publicCard `colorIdentity` or raw Scryfall `color_identity`). */
export function colorIdentityOfCards(cards) {
  const set = new Set();
  for (const c of cards || []) for (const x of (c?.colorIdentity ?? c?.color_identity ?? [])) set.add(String(x).toUpperCase());
  return WUBRG.filter((c) => set.has(c));
}

/**
 * The cards' color identity when EVERY card states one (an empty array is a stated, colorless identity); null for no cards
 * or when any card carries no identity field at all — a partial union would under-read the identity.
 */
export function knownColorIdentityOfCards(cards) {
  const list = (cards || []).filter(Boolean);
  if (!list.length || !list.every((c) => Array.isArray(c.colorIdentity ?? c.color_identity))) return null;
  return colorIdentityOfCards(list);
}

/** A player's commander color identity (WUBRG letters), or null when they have no commander or it is unknown (CR 903.4f). */
export function commanderColorIdentityOf(state, playerId) {
  const player = state?.players?.[playerId];
  if (!player) return null;
  const stamped = Array.isArray(player.commanderIdentity) ? player.commanderIdentity : null;
  const zone = knownColorIdentityOfCards(player.command);
  if (!stamped && !zone) return null;
  const set = new Set([...(stamped || []), ...(zone || [])]);
  return WUBRG.filter((c) => set.has(c));
}
