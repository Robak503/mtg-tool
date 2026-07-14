import fs from "node:fs";

import { dataPath } from "./paths.js";
import { readJsonOrNull } from "./jsonFile.js";

// Source files, resolved PER CALL (not captured at module load): dataPath()
// prefers the writable app root and only falls back to the read-only bundle
// (MTG_REFERENCE_DIR) while the app-root copy does not exist. In the packaged
// .exe a fresh install resolves to the bundle; an in-app sync then writes the
// %APPDATA% copy, and the next (re)build must pick THAT up — a path captured
// once at import would keep re-reading the frozen bundled file even after
// invalidateCachesFor() drops the in-memory index. Mirrors printingIndex.js
// and the same fix note in spellbook.js.
//
// The slim pre-built index (~10-20MB) is preferred when present. Build via
// `npm run build:oracle-index` after every oracle_cards.json refresh.
function oracleIndexFile() {
  return dataPath("scryfall-bulk", "oracle-index.json");
}
function oracleFile() {
  return dataPath("scryfall-bulk", "oracle_cards.json");
}
function legacyOracleFile() {
  return dataPath("scryfall.oracle.local.json");
}
function rulingsFile() {
  return dataPath("scryfall-bulk", "rulings.json");
}
function legacyRulingsFile() {
  return dataPath("scryfall.rulings.local.json");
}

let cardIndex = null;
let rulingsIndex = null;

const COMMON_SINGLE_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "can", "do", "does",
  "for", "from", "has", "have", "how", "if", "in", "is", "it", "of", "on",
  "or", "see", "that", "the", "then", "this", "to", "what", "when", "where",
  "who", "why", "with", "work",
]);

export function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function oracleText(card) {
  if (card?.oracle_text) return card.oracle_text;
  if (card?.card_faces?.length) {
    return card.card_faces
      .map(face => `${face.name} - ${face.type_line || ""} ${face.mana_cost || ""}\n${face.oracle_text || ""}`.trim())
      .filter(Boolean)
      .join("\n//\n");
  }
  return "";
}

function readJson(preferredFile, fallbackFile, missingHint) {
  const file = fs.existsSync(preferredFile) ? preferredFile : fallbackFile;
  if (!fs.existsSync(file)) {
    const error = new Error(missingHint);
    error.code = "ENOENT";
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new Error(
      `Local Oracle repository at ${file} is corrupt JSON. ` +
        `Re-run npm run sync:oracle (or build:oracle-index).`,
    );
  }
  return { file, parsed };
}

function cardRank(card) {
  let score = 0;
  if (card.oracle_text) score += 20;
  if (card.type_line && card.type_line !== "Card" && card.type_line !== "Card // Card") score += 15;
  if (card.legalities?.commander && card.legalities.commander !== "not_legal") score += 12;
  if (card.layout === "normal" || card.layout === "transform" || card.layout === "modal_dfc") score += 8;
  if (card.image_uris?.normal || card.card_faces?.some(face => face.image_uris?.normal)) score += 2;
  if (card.layout === "art_series") score -= 50;
  return score;
}

function setBestCard(byName, alias, card) {
  const key = normalizeName(alias);
  if (!key) return;
  const current = byName.get(key);
  if (!current || cardRank(card) > cardRank(current)) {
    byName.set(key, card);
  }
}

// Synchronous by design. Two cold-start requests cannot race because Node's
// event loop blocks until readFileSync + JSON.parse returns. The first caller
// to enter buildCardIndex() will populate `cardIndex` before any other handler
// resumes. Do NOT convert to fs.promises without adding a loadPromise guard.
function buildCardIndex() {
  // Prefer the slim pre-built index (~10-20MB) when present. Falls through to
  // the full 165MB oracle file if the user has not yet run
  // `npm run build:oracle-index` (or if oracle_cards.json was refreshed but
  // the index is stale — the script is fast enough to re-run on every sync).
  // Prefer the slim index. If it's present but CORRUPT, fall through to the
  // full oracle file instead of 500-ing; a missing/corrupt full file is fatal.
  let file;
  let parsed = null;
  const oracleIndex = oracleIndexFile();
  if (fs.existsSync(oracleIndex)) {
    parsed = readJsonOrNull(oracleIndex, { label: "oracle-index" });
    if (parsed != null) file = oracleIndex;
  }
  if (parsed == null) {
    ({ file, parsed } = readJson(
      oracleFile(),
      legacyOracleFile(),
      "Local Oracle repository missing. Run npm.cmd run sync:oracle from the app folder.",
    ));
  }
  const cards = Array.isArray(parsed) ? parsed : parsed.cards;
  if (!Array.isArray(cards)) throw new Error("Local Oracle repository does not include a cards array.");

  const byName = new Map();
  const names = [];

  for (const card of cards) {
    const aliases = new Set([card.name]);
    if (card.name?.includes(" // ")) aliases.add(card.name.split(" // ")[0]);
    for (const face of card.card_faces || []) aliases.add(face.name);

    for (const alias of aliases) {
      if (!alias) continue;
      if (!normalizeName(alias)) continue;
      setBestCard(byName, alias, card);
      names.push(alias);
    }
  }

  return {
    file,
    generatedAt: parsed.generatedAt,
    scryfallUpdatedAt: parsed.scryfallUpdatedAt,
    count: cards.length,
    cards,
    byName,
    names: [...new Set(names)].sort((a, b) => a.localeCompare(b)),
  };
}

export function getCardIndex() {
  if (!cardIndex) cardIndex = buildCardIndex();
  return cardIndex;
}

/**
 * Every card in the active index (the raw oracle entries, deduped by the index
 * build). Used by the coverage dashboard + autopilot corpus sweeps to classify
 * all of Magic, not just the cards in a saved deck. Returns the live array — do
 * not mutate it.
 */
export function allCards() {
  return getCardIndex().cards;
}

function buildRulingsIndex() {
  try {
    const { file, parsed } = readJson(rulingsFile(), legacyRulingsFile(), "Local rulings repository missing.");
    const rulings = Array.isArray(parsed) ? parsed : parsed.rulings;
    const byOracleId = new Map();

    for (const ruling of rulings || []) {
      if (!ruling.oracle_id) continue;
      const current = byOracleId.get(ruling.oracle_id) || [];
      current.push({
        source: ruling.source,
        published_at: ruling.published_at,
        comment: ruling.comment,
      });
      byOracleId.set(ruling.oracle_id, current);
    }

    return { file, byOracleId, count: rulings?.length || 0, scryfallUpdatedAt: parsed.scryfallUpdatedAt };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { file: null, byOracleId: new Map(), count: 0, scryfallUpdatedAt: null };
  }
}

export function getRulingsIndex() {
  if (!rulingsIndex) rulingsIndex = buildRulingsIndex();
  return rulingsIndex;
}

export function lookupCard(name) {
  const repo = getCardIndex();
  const exact = repo.byName.get(normalizeName(name));
  if (exact) return exact;

  const normalized = normalizeName(name);
  if (!normalized) return null;

  return repo.cards.find(card => normalizeName(card.name).includes(normalized)) || null;
}

export function lookupRulingsForCard(card) {
  if (!card?.oracle_id) return [];
  return getRulingsIndex().byOracleId.get(card.oracle_id) || [];
}

export function detectCardNamesInText(text, maxWords = 6) {
  const repo = getCardIndex();
  const found = new Set();
  const tokens = String(text || "").match(/[A-Za-z0-9\u2018\u2019']+/g) || [];

  for (let i = 0; i < tokens.length; i++) {
    for (let n = Math.min(maxWords, tokens.length - i); n >= 1; n--) {
      const candidate = tokens.slice(i, i + n).join(" ").replace(/[.,;!?]+$/, "");
      if (n === 1 && COMMON_SINGLE_WORDS.has(normalizeName(candidate))) continue;
      const card = repo.byName.get(normalizeName(candidate));
      if (card) {
        found.add(card.name);
        i += n - 1;
        break;
      }
    }
  }

  return [...found];
}

export function extractBracketedCardNames(text) {
  return [...String(text || "").matchAll(/\[\[([^\]]+)\]\]/g)]
    .map(match => match[1].trim())
    .filter(Boolean);
}

function uniqueCards(cards) {
  const seen = new Set();
  const unique = [];
  for (const card of cards) {
    const key = card.oracle_id || card.name;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(card);
  }
  return unique;
}

function parseColorIdentity(value) {
  return new Set(
    String(value || "")
      .toUpperCase()
      .split(/[^WUBRG]+/)
      .filter(Boolean)
  );
}

function commanderLegal(card) {
  return card.legalities?.commander === "legal";
}

/**
 * Banlist / legality guardrail for the A/B card bench (and any deck-edit path): given a card NAME, is it
 * legal to run in Commander? Reads the bundled Scryfall `legalities.commander` — the authoritative, local,
 * per-sync-current source (e.g. Mana Crypt / Dockside Extortionist / Jeweled Lotus = banned). EXACT name
 * match only (a swap picks a specific card), so a banned card can never fuzzy-match its way in. Returns
 * { ok, reason?, card?, message }. CREED: the banlist is NEVER hand-authored here — it's Scryfall's data.
 */
export function commanderLegality(name) {
  const repo = getCardIndex();
  const card = repo.byName.get(normalizeName(name));
  if (!card) return { ok: false, reason: "unknown", message: `"${name}" isn't a card I recognize.` };
  const status = card.legalities?.commander || "not_legal";
  if (status === "legal") return { ok: true, card, message: `${card.name} is Commander-legal.` };
  if (status === "banned") return { ok: false, reason: "banned", card, message: `${card.name} is banned in Commander — can't bench it.` };
  return { ok: false, reason: "not-legal", card, message: `${card.name} isn't Commander-legal.` };
}

function withinColorIdentity(card, allowedColors) {
  if (!allowedColors?.size) return true;
  return (card.color_identity || []).every(color => allowedColors.has(color));
}

function searchHaystack(card) {
  return normalizeName([
    card.name,
    card.type_line,
    oracleText(card),
    ...(card.keywords || []),
  ].filter(Boolean).join(" "));
}

export function searchLocalCards(query, options = {}) {
  const repo = getCardIndex();
  const normalized = normalizeName(query);
  if (!normalized) return [];

  const terms = normalized.split(" ").filter(term => term.length > 1);
  const allowedColors = parseColorIdentity(options.colorIdentity);
  const legal = options.legal || "commander";
  const limit = Math.min(Math.max(Number(options.limit) || 16, 1), 80);

  return uniqueCards(repo.cards)
    .filter(card => card.layout !== "art_series")
    .filter(card => legal !== "commander" || commanderLegal(card))
    .filter(card => withinColorIdentity(card, allowedColors))
    .map(card => {
      const name = normalizeName(card.name);
      const haystack = searchHaystack(card);
      let score = 0;

      if (name === normalized) score += 1000;
      if (name.startsWith(normalized)) score += 450;
      if (name.includes(normalized)) score += 220;
      if (haystack.includes(normalized)) score += 140;

      const matchedTerms = terms.filter(term => haystack.includes(term));
      if (!matchedTerms.length) return null;
      score += matchedTerms.length * 55;
      if (matchedTerms.length === terms.length) score += 80;
      if (card.edhrec_rank) score += Math.max(0, 90 - Math.log10(card.edhrec_rank) * 18);
      score += cardRank(card);

      return { card, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || (a.card.edhrec_rank || 999999) - (b.card.edhrec_rank || 999999))
    .slice(0, limit)
    .map(result => result.card);
}

export function publicCard(card, rulings = [], options = {}) {
  if (!card) return null;
  return {
    source: options.source || "local",
    rulingsSource: options.rulingsSource || "not_requested",
    id: card.id,
    oracleId: card.oracle_id,
    rulings_uri: card.rulings_uri,
    name: card.name,
    image: card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || null,
    url: card.scryfall_uri,
    mana: card.mana_cost || card.card_faces?.[0]?.mana_cost || "",
    type: card.type_line || "",
    cmc: card.cmc ?? 0,
    colors: card.colors || card.card_faces?.flatMap(face => face.colors || []) || [],
    colorIdentity: card.color_identity || [],
    edhrecRank: card.edhrec_rank ?? null,
    rarity: card.rarity || "",
    set: card.set || "",
    setName: card.set_name || "",
    producedMana: card.produced_mana || [],
    oracle: oracleText(card),
    power: card.power ?? card.card_faces?.[0]?.power ?? null,
    toughness: card.toughness ?? card.card_faces?.[0]?.toughness ?? null,
    loyalty: card.loyalty ?? card.card_faces?.[0]?.loyalty ?? null,
    keywords: card.keywords || [],
    // K9 flavor + K4 token/meld parts (display-only; "" / [] when the bundle predates the sync
    // that adds them, so every consumer degrades gracefully).
    flavor: card.flavor_text || card.card_faces?.[0]?.flavor_text || "",
    allParts: Array.isArray(card.all_parts) ? card.all_parts : [],
    prices: card.prices || {},
    legalities: card.legalities || {},
    card_faces: card.card_faces || [],
    rulings,
  };
}

export function resetCardIndexForTests() {
  cardIndex = null;
  rulingsIndex = null;
}
