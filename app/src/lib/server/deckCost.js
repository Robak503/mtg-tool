/**
 * deckCost.js — "what would it cost to finish this deck from my collection?"
 *
 * For each mainboard/commander card in a deck: resolve it against the bundled
 * printings (for its oracleId + cheapest paper price), compare the deck's
 * required quantity to how many you own (collectionContext.ownedCount, which
 * already excludes wishlist rows), and total the cheapest price of the copies
 * you still need. Basic lands are treated as free/owned; sideboard + tokens are
 * ignored.
 *
 * Pure: the printing lookup (name -> printing rows) is injected, so the route
 * passes printingIndex.lookupByName and tests pass a stub.
 */

import { ownedCount } from "./collectionContext.js";

const BASIC_LANDS = new Set([
  "Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes",
  "Snow-Covered Plains", "Snow-Covered Island", "Snow-Covered Swamp",
  "Snow-Covered Mountain", "Snow-Covered Forest", "Snow-Covered Wastes",
]);

const COUNTED_SECTIONS = new Set(["Mainboard", "Commander"]);

/** Cheapest non-null paper (nonfoil) price across a card's printings, or null. */
export function cheapestPaperPrice(printings) {
  let best = null;
  for (const p of printings || []) {
    const usd = parseFloat(p?.prices?.usd);
    if (Number.isFinite(usd) && (best === null || usd < best)) best = usd;
  }
  return best;
}

/**
 * @param {object} deck        { id, name, cards: [{ qty, name, section }] }
 * @param {object} collection  loaded collection ({ cards: [...] })
 * @param {(name:string)=>Array} lookupByName  printingIndex.lookupByName
 * @returns summary { deckId, deckName, totalCards, ownedCards, neededCards,
 *   ownedPct, costToFinish, unpricedCount, complete, missing: [...] }
 */
export function deckCostToFinish(deck, collection, lookupByName) {
  const cards = Array.isArray(deck?.cards) ? deck.cards : [];
  const missing = [];
  let totalCards = 0;
  let ownedCards = 0;
  let neededCards = 0;
  let costToFinish = 0;
  let unpricedCount = 0;

  for (const card of cards) {
    if (!COUNTED_SECTIONS.has(card.section)) continue;
    const qty = card.qty || 1;
    totalCards += qty;

    // Basics are effectively free / always available.
    if (BASIC_LANDS.has(card.name)) {
      ownedCards += qty;
      continue;
    }

    const printings = lookupByName(card.name) || [];
    const oracleId = printings[0]?.oracleId || null;
    const owned = oracleId ? ownedCount(collection, oracleId).total : 0;
    ownedCards += Math.min(owned, qty);

    const need = Math.max(0, qty - owned);
    if (need <= 0) continue;
    neededCards += need;

    const unit = cheapestPaperPrice(printings);
    if (unit === null) {
      unpricedCount += need;
    } else {
      costToFinish += unit * need;
    }
    missing.push({
      name: card.name,
      oracleId,
      deckQty: qty,
      owned,
      need,
      unitPrice: unit,
      lineCost: unit !== null ? Math.round(unit * need * 100) / 100 : null,
      resolved: oracleId !== null,
    });
  }

  return {
    deckId: deck?.id || null,
    deckName: deck?.name || "Deck",
    totalCards,
    ownedCards,
    neededCards,
    ownedPct: totalCards > 0 ? Math.round((ownedCards / totalCards) * 100) : 100,
    costToFinish: Math.round(costToFinish * 100) / 100,
    unpricedCount,
    complete: neededCards === 0,
    missing: missing.sort((a, b) => (b.lineCost || 0) - (a.lineCost || 0)),
  };
}
