export const runtime = "nodejs";

import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const ORACLE_FILE = path.join(DATA_DIR, "scryfall.oracle.local.json");
const RULINGS_FILE = path.join(DATA_DIR, "scryfall.rulings.local.json");

let oracleCache = null;
let rulingsCache = null;

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function oracleText(card) {
  if (card.oracle_text) return card.oracle_text;
  if (card.card_faces?.length) {
    return card.card_faces
      .map(face => `${face.name} - ${face.type_line || ""} ${face.mana_cost || ""}\n${face.oracle_text || ""}`.trim())
      .join("\n//\n");
  }
  return "";
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
  const current = byName.get(key);
  if (!current || cardRank(card) > cardRank(current)) {
    byName.set(key, card);
  }
}

function publicCard(card, rulings = [], options = {}) {
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
    prices: card.prices || {},
    legalities: card.legalities || {},
    card_faces: card.card_faces || [],
    rulings,
  };
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

function localSearch(repo, query, options = {}) {
  const normalized = normalizeName(query);
  if (!normalized) return [];

  const terms = normalized.split(" ").filter(term => term.length > 1);
  const allowedColors = parseColorIdentity(options.colorIdentity);
  const legal = options.legal || "commander";
  const limit = Math.min(Math.max(Number(options.limit) || 16, 1), 80);

  const scored = uniqueCards(repo.cards)
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
    .slice(0, limit);

  return scored.map(result => result.card);
}

async function loadOracle() {
  if (oracleCache) return oracleCache;

  const raw = await fs.readFile(ORACLE_FILE, "utf8");
  const parsed = JSON.parse(raw);
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
      setBestCard(byName, alias, card);
      names.push(alias);
    }
  }

  oracleCache = {
    generatedAt: parsed.generatedAt,
    scryfallUpdatedAt: parsed.scryfallUpdatedAt,
    count: cards.length,
    cards,
    byName,
    names: [...new Set(names)].sort((a, b) => a.localeCompare(b)),
  };

  return oracleCache;
}

async function loadRulings() {
  if (rulingsCache) return rulingsCache;

  try {
    const raw = await fs.readFile(RULINGS_FILE, "utf8");
    const parsed = JSON.parse(raw);
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

    rulingsCache = { byOracleId, count: rulings?.length || 0, scryfallUpdatedAt: parsed.scryfallUpdatedAt };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    rulingsCache = { byOracleId: new Map(), count: 0, scryfallUpdatedAt: null };
  }

  return rulingsCache;
}

function findCard(repo, name) {
  const exact = repo.byName.get(normalizeName(name));
  if (exact) return exact;

  const normalized = normalizeName(name);
  if (!normalized) return null;

  const candidate = repo.cards.find(card => normalizeName(card.name).includes(normalized));
  return candidate || null;
}

function missingRepositoryResponse() {
  return Response.json(
    {
      error: "Local Oracle repository missing. Run npm.cmd run sync:oracle from the app folder.",
    },
    { status: 404 }
  );
}

export async function GET(request) {
  let repo;
  try {
    repo = await loadOracle();
  } catch (error) {
    if (error.code === "ENOENT") return missingRepositoryResponse();
    return Response.json({ error: error.message || "Could not load local Oracle repository." }, { status: 500 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("catalog") === "1") {
    return Response.json({
      generatedAt: repo.generatedAt,
      scryfallUpdatedAt: repo.scryfallUpdatedAt,
      count: repo.names.length,
      names: repo.names,
    });
  }

  const search = url.searchParams.get("search");
  if (search) {
    const cards = localSearch(repo, search, {
      colorIdentity: url.searchParams.get("colorIdentity"),
      legal: url.searchParams.get("legal") || "commander",
      limit: url.searchParams.get("limit"),
    });
    return Response.json({
      query: search,
      count: cards.length,
      cards: cards.map(card => publicCard(card, [], { source: "local", rulingsSource: "not_requested" })),
      source: "local",
      scryfallUpdatedAt: repo.scryfallUpdatedAt,
    });
  }

  const rulingsFor = url.searchParams.get("rulingsFor");
  if (rulingsFor) {
    const rulings = await loadRulings();
    return Response.json({
      oracleId: rulingsFor,
      rulings: rulings.byOracleId.get(rulingsFor) || [],
      source: "local",
      scryfallUpdatedAt: rulings.scryfallUpdatedAt,
    });
  }

  const name = url.searchParams.get("name");
  if (!name) return Response.json({ error: "Provide ?name=Card Name or ?catalog=1." }, { status: 400 });

  const card = findCard(repo, name);
  if (!card) return Response.json({ error: `Card not found in local Oracle repository: ${name}` }, { status: 404 });

  return Response.json({
    card: publicCard(card, [], { source: "local", rulingsSource: "not_requested" }),
    source: "local",
    scryfallUpdatedAt: repo.scryfallUpdatedAt,
  });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  if (!Array.isArray(body.names)) {
    return Response.json({ error: "Request body must include a names array." }, { status: 400 });
  }

  let repo;
  try {
    repo = await loadOracle();
  } catch (error) {
    if (error.code === "ENOENT") return missingRepositoryResponse();
    return Response.json({ error: error.message || "Could not load local Oracle repository." }, { status: 500 });
  }

  const includeRulings = Boolean(body.includeRulings);
  const rulings = includeRulings ? await loadRulings() : null;
  const cards = {};

  for (const name of body.names) {
    const card = findCard(repo, name);
    if (!card) {
      cards[name] = null;
      continue;
    }

    const cardRulings = includeRulings ? rulings.byOracleId.get(card.oracle_id) || [] : [];
    cards[name] = publicCard(card, cardRulings, {
      source: "local",
      rulingsSource: includeRulings ? "local" : "not_requested",
    });
  }

  return Response.json({
    cards,
    source: "local",
    scryfallUpdatedAt: repo.scryfallUpdatedAt,
  });
}
