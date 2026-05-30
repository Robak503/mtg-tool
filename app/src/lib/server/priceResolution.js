/**
 * priceResolution.js — the never-nil price layer for the collection.
 *
 * Scryfall's `prices.usd` is TCGPlayer's computed market price, which is
 * null whenever a printing lacks enough recent sales — even though copies
 * are listed for sale. The Vault can't show nil values, so this module
 * fills gaps from a fallback chain, in order of preference:
 *
 *   1. The price already on the base object (TCGPlayer market, sync-fresh)
 *   2. The printing index's price for that scryfallId (also TCGPlayer, but
 *      refreshed on the latest Scryfall sync — catches a market price that
 *      got computed after the row was first stored)
 *   3. Card Kingdom's retail price for that exact printing (the card IS for
 *      sale somewhere; Card Kingdom reports a real number)
 *
 * Etched is a foil treatment, so a null usdEtched falls back to a foil
 * price before giving up.
 *
 * Lookups are cheap (two in-memory Maps), so callers can resolve per row.
 * Everything here is read-only — callers that want to persist resolved
 * prices copy the result onto their own rows.
 */

import { lookupById } from "./printingIndex.js";
import { cardKingdomPrice } from "./cardKingdomPrices.js";

function firstNonNull(...vals) {
  for (const v of vals) {
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return null;
}

function tryPrintingPrices(scryfallId) {
  try {
    return lookupById(scryfallId)?.prices || null;
  } catch {
    // Printing index not built (dev / pre-sync). No printing-index fallback.
    return null;
  }
}

/**
 * Resolve the best available prices for a printing.
 *
 * @param {string} scryfallId
 * @param {{ usd?, usdFoil?, usd_foil?, usdEtched?, usd_etched? } | null} basePrices
 *   The prices already known (typically the collection row's stored prices).
 * @returns {{ usd, usdFoil, usdEtched, sources: { usd, usdFoil, usdEtched } }}
 *   Each price is a string or null. `sources` tags where each non-null value
 *   came from: "tcgplayer" | "printing-index" | "cardkingdom" | null.
 */
export function resolvePrices(scryfallId, basePrices) {
  const base = basePrices || {};
  const baseUsd = base.usd ?? null;
  const baseFoil = base.usdFoil ?? base.usd_foil ?? null;
  const baseEtched = base.usdEtched ?? base.usd_etched ?? null;

  const printing = tryPrintingPrices(scryfallId);
  const ck = cardKingdomPrice(scryfallId);

  const sources = { usd: null, usdFoil: null, usdEtched: null };

  // Nonfoil: row → printing index → Card Kingdom.
  let usd = baseUsd;
  if (usd != null) sources.usd = "tcgplayer";
  if (usd == null && printing?.usd != null) { usd = printing.usd; sources.usd = "printing-index"; }
  if (usd == null && ck?.usd != null) { usd = ck.usd; sources.usd = "cardkingdom"; }

  // Foil: row → printing index → Card Kingdom.
  let usdFoil = baseFoil;
  if (usdFoil != null) sources.usdFoil = "tcgplayer";
  if (usdFoil == null && printing) {
    const pf = printing.usdFoil ?? printing.usd_foil ?? null;
    if (pf != null) { usdFoil = pf; sources.usdFoil = "printing-index"; }
  }
  if (usdFoil == null && ck?.usdFoil != null) { usdFoil = ck.usdFoil; sources.usdFoil = "cardkingdom"; }

  // Etched: row → printing index → Card Kingdom foil (etched ≈ a foil
  // treatment; Card Kingdom doesn't break etched out separately).
  let usdEtched = baseEtched;
  if (usdEtched != null) sources.usdEtched = "tcgplayer";
  if (usdEtched == null && printing) {
    const pe = printing.usdEtched ?? printing.usd_etched ?? null;
    if (pe != null) { usdEtched = pe; sources.usdEtched = "printing-index"; }
  }
  if (usdEtched == null && ck?.usdFoil != null) { usdEtched = ck.usdFoil; sources.usdEtched = "cardkingdom"; }

  return { usd, usdFoil, usdEtched, sources };
}

/**
 * Cheapest single-copy paper price across all finishes for a printing,
 * after fallback resolution. Used by cost-to-finish so a TCGPlayer-null
 * card still contributes a real number.
 * @returns {number | null}
 */
export function resolvedCheapestUsd(scryfallId, basePrices) {
  const { usd, usdFoil, usdEtched } = resolvePrices(scryfallId, basePrices);
  const candidates = [usd, usdFoil, usdEtched]
    .map(v => (v == null ? null : parseFloat(v)))
    .filter(v => Number.isFinite(v) && v > 0);
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}

/**
 * Return a shallow copy of the collection whose every row carries resolved,
 * never-nil-where-possible prices. Non-mutating: the stored collection on
 * disk is untouched; this is purely for valuing + display.
 *
 * `pricesFallback: true` is stamped on a row when a finish the user
 * actually owns is priced from a non-TCGPlayer source, so the UI can
 * footnote the value it shows. Filling an unowned finish's price (e.g. a
 * foil price on a nonfoil-only card) does NOT raise the flag.
 */
function finishKey(finish) {
  return finish === "foil" ? "usdFoil" : finish === "etched" ? "usdEtched" : "usd";
}

export function enrichCollectionPrices(collection) {
  if (!collection || !Array.isArray(collection.cards)) return collection;
  const cards = collection.cards.map(row => {
    if (!row || !row.scryfallId) return row;
    const resolved = resolvePrices(row.scryfallId, row.prices);
    const ownedFinishes = new Set(
      (row.stacks || []).filter(s => (s.quantity || 0) > 0).map(s => s.finish),
    );
    const usedFallback = ownedFinishes.size > 0
      ? [...ownedFinishes].some(f => {
          const s = resolved.sources[finishKey(f)];
          return s && s !== "tcgplayer";
        })
      : Object.values(resolved.sources).some(s => s && s !== "tcgplayer");
    return {
      ...row,
      prices: {
        ...(row.prices || {}),
        usd: resolved.usd,
        usdFoil: resolved.usdFoil,
        usdEtched: resolved.usdEtched,
      },
      priceSources: resolved.sources,
      pricesFallback: usedFallback,
    };
  });
  return { ...collection, cards };
}
