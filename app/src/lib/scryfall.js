/* ── Scryfall ── */
export const CARD_CACHE = {};

async function fetchLocalCard(name) {
  try {
    const response = await fetch(`/api/cards?name=${encodeURIComponent(name)}`, { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    return data.card || null;
  } catch {
    return null;
  }
}

async function fetchLocalCards(names, options = {}) {
  try {
    const response = await fetch("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names, includeRulings: Boolean(options.includeRulings) }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.cards || null;
  } catch {
    return null;
  }
}

async function searchLocalCards(query, options = {}) {
  const params = new URLSearchParams({
    search: query,
    limit: String(options.limit || 12),
    legal: options.legal || "commander",
  });
  if (options.colorIdentity?.length) params.set("colorIdentity", options.colorIdentity.join(""));

  try {
    const response = await fetch(`/api/cards?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) return [];
    const data = await response.json();
    return data.cards || [];
  } catch {
    return [];
  }
}

export async function fetchCard(name, options = {}) {
  const allowLiveFallback = options.allowLiveFallback !== false;
  const cacheKey = `${allowLiveFallback ? "live" : "local"}:${name}`;
  if (cacheKey in CARD_CACHE) return CARD_CACHE[cacheKey];
  if (CARD_CACHE[name]) return CARD_CACHE[name];

  const local = await fetchLocalCard(name);
  if (local) {
    CARD_CACHE[name] = local;
    CARD_CACHE[cacheKey] = local;
    return local;
  }

  if (!allowLiveFallback) return (CARD_CACHE[cacheKey] = null);

  try {
    const r = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`);
    if (!r.ok) return (CARD_CACHE[cacheKey] = null);
    const d = await r.json();
    // Build oracle text — for DFCs/split, concatenate both faces with a separator
    let oracle = d.oracle_text || "";
    if (!oracle && d.card_faces?.length) {
      oracle = d.card_faces
        .map(f => `${f.name} — ${f.type_line || ""} ${f.mana_cost || ""}\n${f.oracle_text || ""}`)
        .join("\n//\n");
    }
    const card = {
      source: "live",
      rulingsSource: "not_requested",
      id: d.id,
      rulings_uri: d.rulings_uri,
      name: d.name,
      image: d.image_uris?.normal || d.card_faces?.[0]?.image_uris?.normal || null,
      url: d.scryfall_uri,
      mana: d.mana_cost || d.card_faces?.[0]?.mana_cost || "",
      type: d.type_line || "",
      cmc: d.cmc ?? 0,
      oracle: oracle,
      power: d.power ?? d.card_faces?.[0]?.power ?? null,
      toughness: d.toughness ?? d.card_faces?.[0]?.toughness ?? null,
      loyalty: d.loyalty ?? d.card_faces?.[0]?.loyalty ?? null,
      keywords: d.keywords || [],
      prices: d.prices || {},
      legalities: d.legalities || {},
      oracleId: d.oracle_id,
    };
    CARD_CACHE[name] = card;
    CARD_CACHE[cacheKey] = card;
    return card;
  } catch { return (CARD_CACHE[cacheKey] = null); }
}

/* ── Scryfall rulings (WOTC Gatherer clarifications) ── */
const _R = {};
async function fetchCardRulings(cardId, rulingsUri, oracleId) {
  if (!cardId) return [];
  if (cardId in _R) return _R[cardId];
  if (oracleId) {
    try {
      const local = await fetch(`/api/cards?rulingsFor=${encodeURIComponent(oracleId)}`, { cache: "no-store" });
      if (local.ok) {
        const data = await local.json();
        if (Array.isArray(data.rulings)) return (_R[cardId] = data.rulings);
      }
    } catch {}
  }

  try {
    const url = rulingsUri || `https://api.scryfall.com/cards/${cardId}/rulings`;
    const r = await fetch(url);
    if (!r.ok) return (_R[cardId] = []);
    const d = await r.json();
    // Prefer WOTC-sourced rulings (official); fall back to all if none
    const wotc = (d.data || []).filter(r => r.source === "wotc");
    return (_R[cardId] = wotc.length ? wotc : (d.data || []));
  } catch { return (_R[cardId] = []); }
}

async function promptRulingsForCard(card, options = {}) {
  if (!card) return [];
  if (Array.isArray(card.rulings) && card.rulingsSource === "local") return card.rulings;
  if (Array.isArray(card.rulings) && card.rulings.length) return card.rulings;
  if (!options.allowLiveRulingsFallback) return [];
  return fetchCardRulings(card.id, card.rulings_uri, card.oracleId);
}

/* ── Scryfall card-name catalog (loaded once per session) ── */
let _CATALOG = null;
let _CATALOG_LOADING = null;
export async function loadCardCatalog() {
  if (_CATALOG) return _CATALOG;
  if (_CATALOG_LOADING) return _CATALOG_LOADING;
  _CATALOG_LOADING = (async () => {
    try {
      const local = await fetch("/api/cards?catalog=1", { cache: "no-store" });
      if (local.ok) {
        const data = await local.json();
        const map = new Map();
        for (const name of (data.names || [])) {
          map.set(name.toLowerCase(), name);
          if (name.includes(" // ")) {
            const front = name.split(" // ")[0];
            map.set(front.toLowerCase(), name);
          }
        }
        _CATALOG = map;
        return map;
      }
    } catch {}

    try {
      const publicCatalog = await fetch("/card-names.json", { cache: "no-store" });
      if (publicCatalog.ok) {
        const data = await publicCatalog.json();
        const map = new Map();
        for (const name of (data.names || [])) {
          map.set(name.toLowerCase(), name);
          if (name.includes(" // ")) {
            const front = name.split(" // ")[0];
            map.set(front.toLowerCase(), name);
          }
        }
        _CATALOG = map;
        return map;
      }
    } catch {}

    try {
      const r = await fetch("https://api.scryfall.com/catalog/card-names");
      if (!r.ok) return (_CATALOG = new Map());
      const d = await r.json();
      const map = new Map();
      for (const name of (d.data || [])) {
        map.set(name.toLowerCase(), name);
        if (name.includes(" // ")) {
          const front = name.split(" // ")[0];
          map.set(front.toLowerCase(), name);
        }
      }
      _CATALOG = map;
      return map;
    } catch {
      return (_CATALOG = new Map());
    } finally {
      _CATALOG_LOADING = null;
    }
  })();
  return _CATALOG_LOADING;
}

function detectCardNamesInText(text, catalog) {
  if (!catalog || catalog.size === 0) return [];
  const found = new Set();
  const words = text.split(/(\s+|[.,;!?])/);
  const tokens = words.filter(w => /\S/.test(w));
  for (let i = 0; i < tokens.length; i++) {
    for (let n = Math.min(6, tokens.length - i); n >= 1; n--) {
      const candidate = tokens.slice(i, i + n).join(" ").replace(/[.,;!?]+$/, "");
      const lower = candidate.toLowerCase();
      if (catalog.has(lower)) {
        found.add(catalog.get(lower));
        i += n - 1;
        break;
      }
    }
  }
  return [...found];
}

/* ── Card context builder for API prompts ── */
export async function buildCardContextForNames(names, options = {}) {
  const {
    allowLiveFallback = false,
    allowLiveRulingsFallback = allowLiveFallback,
    includeRulings = true,
    maxRulingsPerCard = 4,
    includeSourceReceipt = true,
    heading = "## CARDS REFERENCED (authoritative - use ONLY this text for card behavior)",
  } = options;

  const uniqueNames = [...new Set(
    (names || [])
      .map(name => String(name || "").trim())
      .filter(Boolean)
  )];

  if (!uniqueNames.length) return "";

  const localCards = await fetchLocalCards(uniqueNames, { includeRulings });
  const pairs = await Promise.all(uniqueNames.map(async name => {
    if (localCards?.[name]) {
      CARD_CACHE[name] = localCards[name];
      return { requested: name, card: localCards[name] };
    }
    const card = allowLiveFallback ? await fetchCard(name, { allowLiveFallback: true }) : null;
    return { requested: name, card };
  }));
  const validPairs = pairs.filter(pair => pair.card);
  if (!validPairs.length) return "";

  let rulingsByCard = {};
  if (includeRulings) {
    const results = await Promise.all(
      validPairs.map(({ card }) => promptRulingsForCard(card, { allowLiveRulingsFallback }))
    );
    validPairs.forEach(({ card }, index) => { rulingsByCard[card.id] = results[index] || []; });
  }

  const blocks = validPairs.map(({ card }) => {
    const stat = card.power !== null ? ` | ${card.power}/${card.toughness}`
               : card.loyalty !== null ? ` | Loyalty ${card.loyalty}`
               : "";
    const keywords = card.keywords?.length ? `\nKeywords: ${card.keywords.join(", ")}` : "";
    let block = `[${card.name}] | ${card.mana || "-"} | ${card.type}${stat}${keywords}\n${card.oracle || "(no Oracle text)"}`;

    const rulings = rulingsByCard[card.id] || [];
    if (rulings.length && maxRulingsPerCard > 0) {
      const top = rulings.slice(0, maxRulingsPerCard);
      const rulingsText = top.map(ruling => `- (${ruling.published_at}) ${ruling.comment}`).join("\n");
      block += `\n\nWOTC RULINGS:\n${rulingsText}`;
    }
    return block;
  });

  const localCount = validPairs.filter(({ card }) => card.source !== "live").length;
  const liveNames = validPairs
    .filter(({ card }) => card.source === "live")
    .map(({ requested, card }) => card.name || requested);
  const missingNames = pairs
    .filter(pair => !pair.card)
    .map(pair => pair.requested);

  const receipt = includeSourceReceipt ? [
    `Source receipt: ${localCount} local card(s), ${liveNames.length} live Scryfall fallback card(s), ${missingNames.length} unresolved card(s).`,
    liveNames.length ? `Live fallback used for: ${liveNames.map(name => `[[${name}]]`).join(", ")}` : "",
    missingNames.length ? `Unresolved cards: ${missingNames.map(name => `[[${name}]]`).join(", ")}` : "",
  ].filter(Boolean).join("\n") : "";

  return `${heading}\n${receipt ? `\n${receipt}\n` : ""}\n${blocks.join("\n\n---\n\n")}\n\n`;
}

function compactOracle(text, limit = 190) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 3).trim()}...`;
}

function colorIdentityFromCards(cards) {
  return [...new Set((cards || []).flatMap(card => card?.colorIdentity || []))].sort();
}

function shouldAttachKarnSearchContext(prompt) {
  const text = String(prompt || "");
  const asksForCuts = /\b(cut|cuts|remove|trim)\b/i.test(text);
  const asksForExternalCards = /\b(add|adds|upgrade|upgrades|improve|improvement|recommend|replace|swap|alternative|alternatives|budget|package|ramp|draw|removal|interaction|protection|wincon|win condition|mana base|fix|build|optimize|tune)\b/i.test(text);
  if (asksForCuts && !asksForExternalCards) return false;
  return asksForExternalCards;
}

function karnSearchQueries(prompt, deckOracleText = "") {
  const text = `${prompt}\n${deckOracleText}`.toLowerCase();
  const queries = [];
  const add = (role, query) => {
    if (!queries.some(entry => entry.query === query)) queries.push({ role, query });
  };

  if (/\b(ramp|mana|fix|fixing|rock|treasure)\b/.test(text)) add("Ramp / Fixing", "add mana");
  if (/\b(draw|card advantage|refill|hand)\b/.test(text)) add("Card Advantage", "draw a card");
  if (/\b(removal|interaction|kill|destroy|exile|answer)\b/.test(text)) add("Interaction", "destroy target");
  if (/\b(protection|protect|hexproof|indestructible|safe|boots)\b/.test(text)) add("Protection", "hexproof indestructible");
  if (/\b(token|tokens|treasure|treasures|artifact)\b/.test(text)) add("Token / Artifact Synergy", "create treasure token");
  if (/\b(sacrifice|aristocrat|dies|death|graveyard)\b/.test(text)) add("Aristocrats / Sacrifice", "whenever a creature dies");
  if (/\b(equipment|equip|aura|voltron)\b/.test(text)) add("Voltron / Equipment", "attach equipment");
  if (/\b(counter|counters|\+1\/\+1|proliferate)\b/.test(text)) add("Counters", "proliferate counter");
  if (/\b(tribal|kindred|sliver|dragon|dinosaur|ninja|hydra)\b/.test(text)) add("Kindred Support", "choose a creature type");

  if (!queries.length) {
    add("Ramp / Fixing", "add mana");
    add("Card Advantage", "draw a card");
    add("Interaction", "destroy target");
    add("Protection", "hexproof indestructible");
  }

  return queries.slice(0, 6);
}

function formatCandidate(card) {
  const ci = card.colorIdentity?.length ? card.colorIdentity.join("") : "C";
  const rank = card.edhrecRank ? ` | EDHREC #${card.edhrecRank}` : "";
  return `- [[${card.name}]] | ${card.mana || "-"} | ${card.type || "Card"} | CI: ${ci}${rank}\n  ${compactOracle(card.oracle) || "(no Oracle text)"}`;
}

export async function buildKarnScryfallSearchContext(prompt, options = {}) {
  if (!shouldAttachKarnSearchContext(prompt)) return "";

  const commanderNames = (options.commanderNames || []).filter(Boolean);
  const commanderCards = commanderNames.length
    ? Object.values(await fetchLocalCards(commanderNames, { includeRulings: false }) || {}).filter(Boolean)
    : [];
  const colorIdentity = colorIdentityFromCards(commanderCards);
  const queries = karnSearchQueries(prompt, options.deckOracleText || "");
  const sections = [];

  for (const { role, query } of queries) {
    const cards = await searchLocalCards(query, {
      colorIdentity,
      limit: options.limitPerRole || 5,
      legal: "commander",
    });
    if (!cards.length) continue;
    sections.push(`### ${role}\nLocal query: ${query}\n${cards.map(formatCandidate).join("\n")}`);
  }

  if (!sections.length) return "";

  const colorLine = colorIdentity.length ? `Color identity filter: ${colorIdentity.join("")}` : "Color identity filter: unavailable; results may need manual color-identity review.";
  return [
    "## LOCAL SCRYFALL SEARCH RESULTS FOR KARN",
    "These candidates came from the local Scryfall Oracle repository. Treat them as searchable card facts, not mandatory recommendations. Use only legal, color-identity-appropriate cards for final add suggestions.",
    colorLine,
    "",
    sections.join("\n\n"),
    "",
  ].join("\n");
}

export async function buildCardContext(text, options = {}) {
  const {
    allowLiveFallback = false,
    allowLiveRulingsFallback = allowLiveFallback,
    includeRulings = true,
    maxRulingsPerCard = 4,
  } = options;

  // Extract [[Card Name]] mentions — always trusted
  const mentioned = [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1].trim());
  // Strip [[ ]] mentions out before catalog scanning to avoid double-detection
  const textWithoutBrackets = text.replace(/\[\[([^\]]+)\]\]/g, " ");
  // Use Scryfall catalog for accurate bare-name detection (no false positives)
  const catalog = await loadCardCatalog();
  const detected = detectCardNamesInText(textWithoutBrackets, catalog);
  const names = [...new Set([...mentioned, ...detected])];

  if (!names.length) return "";

  // Fetch all cards from the local repository. Live fallback is opt-in.
  const localCards = await fetchLocalCards(names, { includeRulings });
  const pairs = await Promise.all(names.map(async n => {
    if (localCards?.[n]) {
      CARD_CACHE[n] = localCards[n];
      return { requested: n, card: localCards[n] };
    }
    const card = allowLiveFallback ? await fetchCard(n, { allowLiveFallback: true }) : null;
    return { requested: n, card };
  }));
  const validPairs = pairs.filter(pair => pair.card);
  if (!validPairs.length) return "";

  // Fetch rulings in parallel if enabled
  let rulingsByCard = {};
  if (includeRulings) {
    const results = await Promise.all(
      validPairs.map(({ card }) => promptRulingsForCard(card, { allowLiveRulingsFallback }))
    );
    validPairs.forEach(({ card }, i) => { rulingsByCard[card.id] = results[i] || []; });
  }

  // Format each card's block
  const blocks = validPairs.map(({ card: c }) => {
    const stat = c.power !== null ? ` | ${c.power}/${c.toughness}`
               : c.loyalty !== null ? ` | Loyalty ${c.loyalty}`
               : "";
    const kw = c.keywords?.length ? `\nKeywords: ${c.keywords.join(", ")}` : "";
    let block = `[${c.name}] | ${c.mana || "—"} | ${c.type}${stat}${kw}\n${c.oracle || "(no Oracle text)"}`;

    const rulings = rulingsByCard[c.id] || [];
    if (rulings.length) {
      const top = rulings.slice(0, maxRulingsPerCard);
      const rulingsText = top.map(r => `• (${r.published_at}) ${r.comment}`).join("\n");
      block += `\n\nWOTC RULINGS:\n${rulingsText}`;
    }
    return block;
  });

  const localCount = validPairs.filter(({ card }) => card.source !== "live").length;
  const liveNames = validPairs
    .filter(({ card }) => card.source === "live")
    .map(({ requested, card }) => card.name || requested);
  const missingNames = pairs
    .filter(pair => !pair.card)
    .map(pair => pair.requested);
  const receipt = [
    `Source receipt: ${localCount} local card(s), ${liveNames.length} live Scryfall fallback card(s), ${missingNames.length} unresolved card(s).`,
    liveNames.length ? `Live fallback used for: ${liveNames.map(name => `[[${name}]]`).join(", ")}` : "",
    missingNames.length ? `Unresolved cards: ${missingNames.map(name => `[[${name}]]`).join(", ")}` : "",
  ].filter(Boolean).join("\n");

  return `## CARDS REFERENCED (authoritative — use ONLY this text for card behavior)\n\n${receipt}\n\n${blocks.join("\n\n---\n\n")}\n\n`;
}

/* ── Banlist post-processor: scans Karn responses for banned cards and flags them ── */
export async function postProcessKarnResponse(text) {
  // Extract all [[Card]] mentions from Karn's response
  const mentioned = [...new Set(
    [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1].trim())
  )];
  if (!mentioned.length) return { text, bannedFlags: [] };

  // Fetch each card (cached) and check Commander legality
  const cards = await Promise.all(mentioned.map(n => fetchCard(n, { allowLiveFallback: false })));
  const banned = [];
  cards.forEach((c, i) => {
    if (!c) return;
    const status = c.legalities?.commander;
    if (status === "banned") banned.push({ name: c.name, mentionedAs: mentioned[i] });
  });

  if (!banned.length) return { text, bannedFlags: [] };

  // Append a flag block at the end of the response (preserves Karn's organization)
  const flagBlock = `\n\n---\n⚠ **BANLIST CHECK:** ${banned.length === 1 ? "This card is" : "These cards are"} currently banned in Commander per Scryfall data:\n${banned.map(b => `• [[${b.name}]]`).join("\n")}\n\nVerify on the official Commander RC site before including in your deck.`;

  return { text: text + flagBlock, bannedFlags: banned };
}

export async function searchCards(q) {
  if (!q.trim()) return [];
  try {
    const local = await searchLocalCards(q, { limit: 16, legal: "commander" });
    if (local.length) {
      return local.map(c => ({
        name: c.name,
        normal: c.image,
        type: c.type || "",
        price: c.prices?.usd ? `$${parseFloat(c.prices.usd).toFixed(2)}` : "-",
      }));
    }

    return [];
  } catch { return []; }
}

export async function fetchDeckData(cards) {
  const unique = [...new Set(cards.filter(c => c.section !== "Tokens").map(c => c.name))];
  const out = {};
  const localCards = await fetchLocalCards(unique);
  if (localCards) {
    for (const [name, card] of Object.entries(localCards)) {
      if (card) {
        CARD_CACHE[name] = card;
        out[name] = card;
      }
    }
  }

  for (let i = 0; i < unique.length; i += 12) {
    const missing = unique.slice(i, i + 12).filter(n => !out[n]);
    await Promise.all(missing.map(async n => {
      const d = await fetchCard(n, { allowLiveFallback: false });
      if (d) out[n] = d;
    }));
    if (i + 12 < unique.length) await new Promise(r => setTimeout(r, 110));
  }
  return out;
}
