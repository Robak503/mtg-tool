/**
 * deckOverlap.js — the deck-scoped "what you own" signal for collection-aware
 * Karn (G1). Pure: the route resolves card metadata (color identity, EDHREC
 * rank) and the deck's color identity, then this computes:
 *   - how many of the deck's cards you already own
 *   - the upgrade POOL: cards you own that fit the deck's colors but aren't in
 *     it yet (most-played first), capped so the prompt stays bounded
 * and renders a compact block Karn can act on (it already prefers owned cards).
 *
 * Works in normalized-name space (deck cards carry only names; the collection
 * carries names) so no oracleId round-trip is needed.
 */

const WUBRG = ["W", "U", "B", "R", "G"];
const norm = (s) => String(s || "").trim().toLowerCase();

/** Is card color-identity `ci` legal in a deck whose identity is `deckCI`? */
export function ciSubset(ci, deckCI) {
  const allowed = new Set(deckCI || []);
  return (ci || []).filter((c) => WUBRG.includes(c)).every((c) => allowed.has(c));
}

/**
 * @param deckNames        string[]  every card name in the deck
 * @param ownedEntries     {name, colorIdentity, edhrecRank}[]  owned, non-wishlist
 * @param deckColorIdentity string[] WUBRG of the deck (from its commander)
 * @returns { ownedInDeck, deckTotal, pool: string[], deckColorIdentity }
 */
export function computeDeckOverlap(deckNames, ownedEntries, deckColorIdentity, { maxPool = 30 } = {}) {
  const deckSet = new Set((deckNames || []).map(norm));
  const deckCI = (deckColorIdentity || []).filter((c) => WUBRG.includes(c));
  const ownedNameSet = new Set((ownedEntries || []).map((e) => norm(e.name)));

  const ownedInDeck = [...deckSet].filter((n) => ownedNameSet.has(n)).length;

  const seen = new Set();
  const pool = (ownedEntries || [])
    .filter((e) => {
      const n = norm(e.name);
      if (deckSet.has(n) || seen.has(n)) return false; // already in the deck / deduped
      if (!ciSubset(e.colorIdentity, deckCI)) return false; // off-color for this deck
      seen.add(n);
      return true;
    })
    .sort((a, b) => (a.edhrecRank ?? Infinity) - (b.edhrecRank ?? Infinity) || String(a.name).localeCompare(String(b.name)))
    .slice(0, maxPool)
    .map((e) => e.name);

  return { ownedInDeck, deckTotal: deckSet.size, pool, deckColorIdentity: deckCI };
}

/** Render the overlap into a compact system-prompt block for Karn. */
export function renderDeckOverlapBlock(overlap) {
  if (!overlap) return "";
  const { ownedInDeck, deckTotal, pool } = overlap;
  const lines = ["## OWNED — UPGRADES FOR THIS DECK"];
  lines.push(`The user already owns ${ownedInDeck} of the ${deckTotal} cards in this deck.`);
  if (pool.length) {
    lines.push(
      `These cards are already in the user's collection and fit this deck's color identity but are NOT in the deck yet. ` +
      `Strongly prefer suggesting ADDS from this owned pool (the user can add them at no cost); wrap each in [[double brackets]]:`,
    );
    lines.push(pool.map((n) => `[[${n}]]`).join(", "));
  } else {
    lines.push("The user owns no other in-color cards beyond what's already here, so suggest acquisitions as usual.");
  }
  return lines.join("\n");
}
