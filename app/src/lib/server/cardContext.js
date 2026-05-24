import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const ORACLE_FILE = path.join(DATA_DIR, "scryfall-bulk", "oracle_cards.json");
const RULINGS_FILE = path.join(DATA_DIR, "scryfall-bulk", "rulings.json");

let oracleCache = null;
let rulingsCache = null;

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u2018\u2019]/g, "'")
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

  return repo.cards.find(card => normalizeName(card.name).includes(normalized)) || null;
}

function detectCardNamesInText(text, catalog) {
  if (!catalog?.size) return [];

  const found = new Set();
  const tokens = String(text || "")
    .split(/(\s+|[.,;!?()[\]{}:"`])/)
    .filter(token => /\S/.test(token));

  for (let i = 0; i < tokens.length; i++) {
    for (let n = Math.min(6, tokens.length - i); n >= 1; n--) {
      const candidate = tokens.slice(i, i + n).join(" ").replace(/[.,;!?]+$/, "");
      const cardName = catalog.get(normalizeName(candidate));
      if (cardName) {
        found.add(cardName);
        i += n - 1;
        break;
      }
    }
  }

  return [...found];
}

function formatCardBlock(card, rulings = [], maxRulingsPerCard = 3) {
  const stat = card.power != null ? ` | ${card.power}/${card.toughness}`
    : card.loyalty != null ? ` | Loyalty ${card.loyalty}`
    : "";
  const keywords = card.keywords?.length ? `\nKeywords: ${card.keywords.join(", ")}` : "";
  let block = `[${card.name}] | ${card.mana_cost || card.card_faces?.[0]?.mana_cost || "-"} | ${card.type_line || "Card"}${stat}${keywords}\n${oracleText(card) || "(no Oracle text)"}`;

  if (rulings.length && maxRulingsPerCard > 0) {
    const rulingsText = rulings
      .slice(0, maxRulingsPerCard)
      .map(ruling => `- (${ruling.published_at}) ${ruling.comment}`)
      .join("\n");
    block += `\n\nWOTC RULINGS:\n${rulingsText}`;
  }

  return block;
}

export async function buildServerCardContext(text, options = {}) {
  const {
    includeRulings = true,
    maxCardNames = 10,
    maxRulingsPerCard = 3,
    heading = "## CARDS REFERENCED - LOCAL ORACLE DATA (authoritative; use ONLY this text for card behavior)",
  } = options;

  let repo;
  try {
    repo = await loadOracle();
  } catch {
    return "";
  }

  const bracketed = [...String(text || "").matchAll(/\[\[([^\]]+)\]\]/g)].map(match => match[1].trim());
  const catalog = new Map(repo.names.map(name => [normalizeName(name), name]));
  const detected = detectCardNamesInText(String(text || "").replace(/\[\[([^\]]+)\]\]/g, " "), catalog);
  const requestedNames = [...new Set([...bracketed, ...detected])].slice(0, maxCardNames);
  if (!requestedNames.length) return "";

  const pairs = requestedNames.map(name => ({ requested: name, card: findCard(repo, name) }));
  const validPairs = pairs.filter(pair => pair.card);
  if (!validPairs.length) return "";

  const rulingsRepo = includeRulings ? await loadRulings() : null;
  const localCount = validPairs.length;
  const missingNames = pairs.filter(pair => !pair.card).map(pair => pair.requested);
  const receipt = [
    `Source receipt: ${localCount} local card(s), 0 live Scryfall fallback card(s), ${missingNames.length} unresolved card(s).`,
    missingNames.length ? `Unresolved cards: ${missingNames.map(name => `[[${name}]]`).join(", ")}` : "",
  ].filter(Boolean).join("\n");

  const blocks = validPairs.map(({ card }) => {
    const rulings = includeRulings ? rulingsRepo.byOracleId.get(card.oracle_id) || [] : [];
    return formatCardBlock(card, rulings, maxRulingsPerCard);
  });

  return `${heading}\n\n${receipt}\n\n${blocks.join("\n\n---\n\n")}\n\n`;
}
