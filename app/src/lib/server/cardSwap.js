/**
 * cardSwap.js — the A/B card bench's swap engine. Produce a VARIANT of a runner deck with exactly one
 * card swapped, guarded so the bench can only ever test a LEGAL deck:
 *   1. BANLIST / legality — the added card must be Commander-legal (Mana Crypt, Dockside, … bounce).
 *   2. COLOR IDENTITY — it must fit the deck's commander colors (else it's an illegal deck card).
 *   3. SINGLETON — it can't be a card the deck already runs (also catches a swap-for-itself no-op).
 *
 * The swap is POSITIONAL: the new card takes the removed card's EXACT slot, so replaying the same seed
 * shuffles identically and the baseline/variant games share the longest possible prefix — they only
 * diverge once the swapped card is drawn and first changes a decision. That's what makes the paired A/B
 * (same seeds both ways) the tightest read there is.
 *
 * Pure aside from the local oracle-index lookups (commanderLegality / lookupCard / enrichDeck). No network.
 * CREED: the banlist + color identity come from Scryfall's bundled data, never hand-authored here.
 */

import { commanderLegality, lookupCard } from "./cardIndex.js";
import { enrichDeck } from "./learnDeckEnrich.js";

/** Union of the deck's commander color identities (Scryfall color_identity, from the local index). */
function deckColorIdentity(runnerDeck) {
  const colors = new Set();
  for (const cmd of runnerDeck?.commanders || []) {
    const c = lookupCard(cmd?.name);
    for (const col of c?.color_identity || []) colors.add(col);
  }
  return colors;
}

/**
 * @param {object} runnerDeck  an enriched runner deck ({ id, name, cards, commanders, companion })
 * @param {{ remove: string, add: string }} swap  card to pull (by name) + card to bench in (by name)
 * @returns {{ ok: true, deck, removed, added } | { ok: false, reason: string, error: string }}
 */
export function buildSwappedDeck(runnerDeck, { remove, add } = {}) {
  if (!runnerDeck || !Array.isArray(runnerDeck.cards)) return { ok: false, reason: "no-deck", error: "No deck to bench." };
  const removeN = String(remove || "").trim().toLowerCase();
  const addRaw = String(add || "").trim();
  if (!removeN || !addRaw) return { ok: false, reason: "incomplete", error: "Pick a card to pull and a card to bench in." };

  // 1. BANLIST / legality guardrail — a banned, not-legal, or unknown card never enters the bench.
  const legal = commanderLegality(addRaw);
  if (!legal.ok) return { ok: false, reason: legal.reason, error: legal.message };
  const addName = legal.card.name; // canonical name from the index

  // 2. COLOR-IDENTITY guardrail — the add must fit the deck's commander colors.
  const allowed = deckColorIdentity(runnerDeck);
  const offColor = (legal.card.color_identity || []).filter((c) => !allowed.has(c));
  if (offColor.length) return { ok: false, reason: "color-identity", error: `${addName} is outside ${runnerDeck.name}'s color identity ({${offColor.join("}{")}}).` };

  // 3. SINGLETON — refuse a card the deck already runs (also catches a swap-for-itself no-op).
  if (runnerDeck.cards.some((c) => String(c?.name || "").toLowerCase() === addName.toLowerCase()))
    return { ok: false, reason: "duplicate", error: `${addName} is already in ${runnerDeck.name}.` };

  // 4. POSITIONAL swap — the add takes the removed card's EXACT slot (shared shuffle prefix under one seed).
  const idx = runnerDeck.cards.findIndex((c) => String(c?.name || "").toLowerCase() === removeN);
  if (idx < 0) return { ok: false, reason: "not-in-deck", error: `"${remove}" isn't in ${runnerDeck.name}.` };

  const addCard = enrichDeck([{ id: `swap-${runnerDeck.id || "deck"}-${idx}`, name: addName }])[0];
  if (!addCard || !addCard.type) return { ok: false, reason: "unresolved", error: `Couldn't resolve ${addName} from the card index.` };

  const cards = runnerDeck.cards.slice();
  const removedName = cards[idx]?.name || remove;
  cards[idx] = addCard;
  return { ok: true, deck: { ...runnerDeck, cards }, removed: removedName, added: addName };
}
