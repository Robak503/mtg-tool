/**
 * learnDeckEnrich.js — fill blank learn-session deck cards from the local index.
 *
 * THE PROBLEM THIS SOLVES (found in live QA, 2026-06-06): `LearnView.deckToCardArray`
 * builds session cards from the deck store, whose entries are only `{ name, qty,
 * section }` — no `type`, `mana`, or `oracle`. So every card reached the engine
 * BLANK: zero mana cost (the whole hand castable turn 1 with no lands), no card
 * type (nothing is a creature/land), and no oracle text (so the entire P2.1–P2.4
 * effect interpreter, combat, and mana systems were dark in the real Academy —
 * invisible to the ~1558 unit tests, which construct fully-shaped cards directly).
 *
 * The fix (the long-promised "PR7 server-side cardIndex enrich"): on the server,
 * before `createLearnSession` sees a deck, look each card up by name in the local
 * oracle index and fill the missing engine fields (`type`, `mana`, `oracle`,
 * `power`, `toughness`, `keywords`, `cmc`, `colors`). LOCAL-FIRST: the index is
 * bundled and read via `paths.js` — zero network calls.
 *
 * Fail-safe + idempotent: an already-shaped card (a test fixture, or a re-enriched
 * deck) is returned untouched; an unknown name or an unbuilt index leaves the card
 * BLANK rather than throwing — a blank card resolves as a noop / Arbiter handoff,
 * which is the honest fail mode (never a fabricated card).
 */

import { lookupCard, publicCard } from "./cardIndex.js";

/** True when a card already carries engine shape — don't overwrite a real card. */
function alreadyShaped(card) {
  return Boolean(
    (card.type && String(card.type).length) ||
    (card.oracle && String(card.oracle).length) ||
    (card.mana && String(card.mana).length)
  );
}

/**
 * The default name→full-card resolver: the local oracle index via `cardIndex.js`.
 * Wrapped so a missing/unbuilt index (lookupCard throws) degrades to "no data"
 * instead of 500-ing the start route. Injected in `enrichDeckCard` for testability.
 */
export function defaultCardLookup(name) {
  try {
    const found = lookupCard(name);
    return found ? publicCard(found) : null;
  } catch {
    return null;
  }
}

/** The `colorIdentity` field to add: the card's own when it has one, else the index's; nothing when neither states it. */
function identityOf(deckCard, full) {
  if (Array.isArray(deckCard.colorIdentity)) return {};
  return Array.isArray(full?.colorIdentity) ? { colorIdentity: full.colorIdentity } : {};
}

/**
 * Merge the local index's full card data into a (possibly blank) deck card,
 * preserving the caller's `id` + `name`. Pure — no I/O, unit-testable in isolation.
 * Only fills fields the deck card is missing, so it's idempotent.
 */
export function mergeCardData(deckCard, full) {
  if (!full) return deckCard;
  return {
    ...deckCard,
    type: deckCard.type || full.type || "",
    mana: deckCard.mana || full.mana || "",
    oracle: deckCard.oracle || full.oracle || "",
    // V1 (2026-09-04): Scryfall's layout — the modal-DFC gate (modalDfc.js). A game deck without it never sees the
    // face-choice land drop, which would make the classifier's credit hollow; so it rides along like keywords do.
    layout: deckCard.layout || full.layout || "",
    cmc: deckCard.cmc ?? full.cmc ?? 0,
    power: deckCard.power ?? full.power ?? null,
    toughness: deckCard.toughness ?? full.toughness ?? null,
    keywords: (Array.isArray(deckCard.keywords) && deckCard.keywords.length)
      ? deckCard.keywords
      : (full.keywords || []),
    colors: (Array.isArray(deckCard.colors) && deckCard.colors.length)
      ? deckCard.colors
      : (full.colors || []),
    // CR 903.4 — the color identity. It is not derivable from `colors` (a mana symbol in the rules text counts), and the
    // engine stamps a seat's commander identity from it at game start (commanderIdentity.js). Left off when the index
    // has none, so "unknown" never reads as "colorless".
    ...identityOf(deckCard, full),
  };
}

/** Enrich one deck card by name (no-op when already shaped or name unknown). */
export function enrichDeckCard(card, lookup = defaultCardLookup) {
  if (!card || !card.name) return card;
  if (alreadyShaped(card)) {
    // V1 (2026-09-04): an already-shaped deck card (the app's saved-deck snapshot carries type/oracle/mana from import
    // time, before `layout` existed) is left as it is EXCEPT for a missing layout, which is backfilled from the index so
    // a modal DFC in a saved deck reaches the engine with its gate intact. Nothing else is overwritten.
    // The color identity is backfilled the same way (2026-10-03): a saved commander without it stamped an EMPTY commander
    // identity, and Commander's Plate then gave protection from all five colors.
    if (card.layout != null && Array.isArray(card.colorIdentity)) return card;
    const full = lookup(card.name);
    if (!full) return card;
    const layout = card.layout == null && full.layout ? { layout: full.layout } : null;
    const identity = identityOf(card, full);
    return layout || Object.keys(identity).length ? { ...card, ...layout, ...identity } : card;
  }
  return mergeCardData(card, lookup(card.name));
}

/** Enrich a flat deck (array of cards). Non-arrays pass through unchanged. */
export function enrichDeck(deck, lookup = defaultCardLookup) {
  return Array.isArray(deck) ? deck.map(c => enrichDeckCard(c, lookup)) : deck;
}

/** Enrich an array of decks (Commander pod / per-opponent commander lists). */
export function enrichDecks(decks, lookup = defaultCardLookup) {
  return Array.isArray(decks) ? decks.map(d => enrichDeck(d, lookup)) : decks;
}
