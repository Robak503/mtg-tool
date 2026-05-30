/**
 * deckUrlFetch.js — fetch a deck from Moxfield / Archidekt and normalize it.
 *
 * Local-first note: this is a one-time, user-triggered fetch (the same posture
 * as the Scryfall / EDHREC syncs). The result is written into the local deck
 * store and never polled again — importing a URL does not create an ongoing
 * external dependency.
 *
 * The normalizers are PURE (json -> normalized deck) so they're unit-tested
 * against fixtures captured from the real APIs; only fetchDeckFromUrl touches
 * the network.
 *
 * Normalized deck shape:
 *   { name, format, source, cards: [{ name, qty, section, scryfallId, set, collectorNumber }] }
 *   section ∈ "Commander" | "Mainboard" | "Sideboard"
 */

import https from "node:https";

const USER_AGENT =
  "MTG-Tool/0.4.0 (https://github.com/Robak503/mtg-tool; local deck importer)";

// ── Moxfield ────────────────────────────────────────────────────────────────
// v3 deck: boards.<name>.cards is a map of cardId -> { quantity, card:{...} }.
const MOXFIELD_SECTIONS = {
  commanders: "Commander",
  mainboard: "Mainboard",
  sideboard: "Sideboard",
  companions: "Sideboard",
};

export function normalizeMoxfieldDeck(json) {
  const cards = [];
  const boards = json?.boards || {};
  for (const [boardName, section] of Object.entries(MOXFIELD_SECTIONS)) {
    const entries = boards[boardName]?.cards;
    if (!entries) continue;
    for (const entry of Object.values(entries)) {
      const card = entry?.card;
      if (!card?.name) continue;
      cards.push({
        name: card.name,
        qty: Number(entry.quantity) || 1,
        section,
        scryfallId: card.scryfall_id || null,
        set: card.set ? String(card.set).toLowerCase() : null,
        collectorNumber: card.cn || null,
      });
    }
  }
  return {
    name: json?.name || "Imported deck",
    format: json?.format || null,
    source: "moxfield",
    cards,
  };
}

// ── Archidekt ─────────────────────────────────────────────────────────────--
// deck.cards is an array; each card's `categories` drive its section.
// deckFormat is a numeric code.
const ARCHIDEKT_FORMATS = {
  1: "standard", 2: "modern", 3: "commander", 4: "legacy", 5: "vintage",
  6: "pauper", 7: "custom", 8: "frontier", 9: "future", 10: "pioneer",
  11: "historic", 12: "pauper-commander", 13: "alchemy", 14: "explorer",
  15: "oathbreaker", 16: "premodern", 17: "predh",
};

export function normalizeArchidektDeck(json) {
  const cards = [];
  for (const entry of json?.cards || []) {
    const name = entry?.card?.oracleCard?.name;
    if (!name) continue;
    const categories = Array.isArray(entry.categories) ? entry.categories : [];
    // Maybeboard is a wishlist, not part of the 60/99 — skip it.
    if (categories.includes("Maybeboard")) continue;
    let section = "Mainboard";
    if (categories.includes("Commander")) section = "Commander";
    else if (categories.includes("Sideboard")) section = "Sideboard";
    cards.push({
      name,
      qty: Number(entry.quantity) || 1,
      section,
      scryfallId: entry.card?.uid || null,
      set: entry.card?.edition?.editioncode ? String(entry.card.edition.editioncode).toLowerCase() : null,
      collectorNumber: entry.card?.collectorNumber || null,
    });
  }
  return {
    name: json?.name || "Imported deck",
    format: ARCHIDEKT_FORMATS[json?.deckFormat] || null,
    source: "archidekt",
    cards,
  };
}

// ── Network dispatch ─────────────────────────────────────────────────────────
// Uses node:https directly rather than global fetch: Next.js patches fetch for
// caching/instrumentation, and Moxfield's Cloudflare 403s the patched request
// even with the right headers. node:https gives us full header control and a
// clean TLS handshake that Cloudflare accepts (custom UA + Accept: json). It
// also sidesteps Next caching a transient 403.
function fetchJson(url, depth = 0) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: "GET", headers: { "User-Agent": USER_AGENT, Accept: "application/json" } },
      (res) => {
        const status = res.statusCode || 0;
        // Follow a redirect or two (the deck APIs normally answer 200 directly).
        if (status >= 300 && status < 400 && res.headers.location && depth < 3) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          resolve(fetchJson(next, depth + 1));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          if (status < 200 || status >= 300) {
            const err = new Error(`Provider returned HTTP ${status}`);
            err.status = status;
            return reject(err);
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new Error("Provider returned invalid JSON"));
          }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(20000, () => req.destroy(new Error("request timed out")));
    req.end();
  });
}

/**
 * Fetch + normalize a deck for a detected URL ref ({ type, id }).
 * Throws with a human-readable message on failure.
 */
export async function fetchDeckFromUrl(ref) {
  if (!ref || !ref.type || !ref.id) {
    throw new Error("Not a recognized Moxfield or Archidekt deck URL.");
  }
  if (ref.type === "moxfield") {
    const json = await fetchJson(`https://api2.moxfield.com/v3/decks/all/${encodeURIComponent(ref.id)}`);
    return normalizeMoxfieldDeck(json);
  }
  if (ref.type === "archidekt") {
    const json = await fetchJson(`https://archidekt.com/api/decks/${encodeURIComponent(ref.id)}/`);
    return normalizeArchidektDeck(json);
  }
  throw new Error(`Unsupported deck source: ${ref.type}`);
}
