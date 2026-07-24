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
 *   section ∈ "Commander" | "Mainboard" | "Sideboard" | "Companion"
 */

import https from "node:https";

const USER_AGENT =
  "MTG-Tool/0.4.0 (https://github.com/Robak503/mtg-tool; local deck importer)";

// Only these hosts are ever contacted — enforced on the initial URL AND on every
// redirect target, so a provider edge mishap / open-redirect can't bounce the
// request to localhost, a link-local metadata IP, or any other internal host
// (SSRF defense-in-depth).
const ALLOWED_HOSTS = new Set(["api2.moxfield.com", "archidekt.com"]);
// Hard cap on a deck response so a hostile/runaway body can't OOM the bundled
// Node server (a ~5000-card Moxfield deck is well under 5 MB).
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

// ── Moxfield ────────────────────────────────────────────────────────────────
// v3 deck: boards.<name>.cards is a map of cardId -> { quantity, card:{...} }.
const MOXFIELD_SECTIONS = {
  commanders: "Commander",
  mainboard: "Mainboard",
  sideboard: "Sideboard",
  companions: "Companion", // CMD-COMPANION: keep companions distinct so commandersOf/companionOf can split them
};

// Whitelist Moxfield's format string (Archidekt is already mapped from a numeric
// code) so arbitrary upstream text never rides into the deck record.
const KNOWN_FORMATS = new Set([
  "standard", "modern", "legacy", "vintage", "pauper", "pioneer", "historic",
  "commander", "brawl", "oathbreaker", "penny", "duel", "premodern", "oldschool",
  "predh", "pauper-commander", "alchemy", "explorer",
]);

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
    format: KNOWN_FORMATS.has(json?.format) ? json.format : null,
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
  // "PLACEMENT BEATS TYPE": a top-level deck.categories[] entry carries includedInDeck, and a
  // card's OWN categories[] tags can include an excluded bucket ALONGSIDE a real type tag (e.g.
  // both "Creature" and "Tokens & Extras") — Archidekt keeps a card's type category even when it
  // also sits in an excluded board, so a naive per-card type check reads it as in-deck. Verified
  // live 2026-07-23 on a real deck (Zaxara, id 19510972): 8 cards tagged ONLY "Tokens & Extras"
  // (includedInDeck:false) were silently counted as real deck cards, inflating a ~100-card
  // Commander deck to 108 — the exact hollow-count class the vault's separate export tool had
  // already learned to guard against (any excluded-bucket tag means the card is out, whatever
  // else it carries), which this importer never picked up. The literal "Maybeboard" string check
  // stays as a defensive fallback for a response that's missing the deck-level categories array.
  const excludedCategoryNames = new Set(
    (Array.isArray(json?.categories) ? json.categories : [])
      .filter(cat => cat?.includedInDeck === false)
      .map(cat => cat?.name)
      .filter(Boolean),
  );

  const cards = [];
  for (const entry of json?.cards || []) {
    const name = entry?.card?.oracleCard?.name;
    if (!name) continue;
    const categories = Array.isArray(entry.categories) ? entry.categories : [];
    if (categories.includes("Maybeboard") || categories.some(cat => excludedCategoryNames.has(cat))) continue;
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
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return reject(new Error("Malformed provider URL"));
    }
    // Re-checked on every recursion, so a redirect off-allowlist is refused.
    if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) {
      return reject(new Error("Refusing to contact a non-allowlisted host"));
    }

    const req = https.request(
      parsed,
      { method: "GET", headers: { "User-Agent": USER_AGENT, Accept: "application/json" } },
      (res) => {
        const status = res.statusCode || 0;
        // Follow a redirect or two (the deck APIs normally answer 200 directly).
        if (status >= 300 && status < 400 && res.headers.location && depth < 3) {
          res.resume();
          let next;
          try {
            next = new URL(res.headers.location, parsed).toString();
          } catch {
            return reject(new Error("Bad redirect target"));
          }
          resolve(fetchJson(next, depth + 1));
          return;
        }
        const chunks = [];
        let bytes = 0;
        res.on("data", (c) => {
          bytes += c.length;
          if (bytes > MAX_RESPONSE_BYTES) {
            req.destroy(new Error("Deck response too large"));
            return;
          }
          chunks.push(c);
        });
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
