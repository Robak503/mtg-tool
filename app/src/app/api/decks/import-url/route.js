/**
 * /api/decks/import-url — import a deck from a Moxfield / Archidekt URL.
 *
 *   POST { url }  → { deck: { name, format, source, cards[] }, stats, unresolved }
 *
 * Detects the provider, fetches the deck server-side (no CORS, and Moxfield
 * needs a real User-Agent), normalizes it, then resolves every card name
 * against the bundled printings index so misspellings / cards missing from the
 * local snapshot are flagged rather than silently imported. Preview only — the
 * client commits the deck through the normal deck store.
 *
 * Local-first: one user-triggered fetch, result lands in the local deck store.
 */

export const runtime = "nodejs";

import { detectDeckUrl } from "../../../../lib/deck/deckImportUrl.js";
import { fetchDeckFromUrl } from "../../../../lib/server/deckUrlFetch.js";
import {
  lookupById,
  lookupByNameAndSet,
  lookupByName,
} from "../../../../lib/server/printingIndex.js";

// Resolve a normalized import card to a canonical printing.
// Prefers the exact scryfallId, then (name, set), then any printing of the name.
function resolveCard(card) {
  let printing = null;
  if (card.scryfallId) printing = lookupById(card.scryfallId);
  if (!printing && card.set) printing = lookupByNameAndSet(card.name, card.set);
  if (!printing) {
    const all = lookupByName(card.name);
    if (all && all.length) printing = all[0];
  }
  return printing;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const url = String(body?.url || "").trim();
  if (!url) {
    return Response.json({ error: "Provide a Moxfield or Archidekt deck URL." }, { status: 400 });
  }

  const ref = detectDeckUrl(url);
  if (!ref) {
    return Response.json(
      { error: "That doesn't look like a Moxfield or Archidekt deck URL." },
      { status: 400 },
    );
  }

  let normalized;
  try {
    normalized = await fetchDeckFromUrl(ref);
  } catch (error) {
    const status = error.status === 404 ? 404 : 502;
    const where = ref.type === "moxfield" ? "Moxfield" : "Archidekt";
    return Response.json(
      { error: `Couldn't fetch the ${where} deck (${error.message}). Check the link is public.` },
      { status },
    );
  }

  if (!normalized.cards.length) {
    return Response.json(
      { error: "That deck came back empty — is it public and non-empty?" },
      { status: 422 },
    );
  }

  const unresolved = [];
  let cards;
  try {
    cards = normalized.cards.map(card => {
      const printing = resolveCard(card);
      if (!printing) {
        unresolved.push(card.name);
        return { name: card.name, qty: card.qty, section: card.section, resolved: false };
      }
      return {
        name: printing.name,
        qty: card.qty,
        section: card.section,
        oracleId: printing.oracleId,
        resolved: true,
      };
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      return Response.json(
        { error: "Card index is missing — run a data sync from the Updates panel, then retry." },
        { status: 503 },
      );
    }
    // Don't echo raw internals (the index error embeds an absolute path).
    console.error("import-url card resolution failed:", error);
    return Response.json({ error: "Couldn't resolve the deck's cards." }, { status: 500 });
  }

  const totalCards = cards.reduce((sum, c) => sum + (c.qty || 1), 0);
  const resolvedCount = cards.filter(c => c.resolved).length;
  return Response.json({
    deck: {
      name: normalized.name,
      format: normalized.format,
      source: normalized.source,
      cards,
    },
    stats: {
      lines: cards.length,
      totalCards,
      resolved: resolvedCount,
      unresolved: cards.length - resolvedCount,
    },
    unresolved,
  });
}
