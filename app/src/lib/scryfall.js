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

export async function fetchCard(name) {
  if (name in CARD_CACHE) return CARD_CACHE[name];
  const local = await fetchLocalCard(name);
  if (local) return (CARD_CACHE[name] = local);

  try {
    const r = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`);
    if (!r.ok) return (CARD_CACHE[name] = null);
    const d = await r.json();
    // Build oracle text — for DFCs/split, concatenate both faces with a separator
    let oracle = d.oracle_text || "";
    if (!oracle && d.card_faces?.length) {
      oracle = d.card_faces
        .map(f => `${f.name} — ${f.type_line || ""} ${f.mana_cost || ""}\n${f.oracle_text || ""}`)
        .join("\n//\n");
    }
    return (CARD_CACHE[name] = {
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
    });
  } catch { return (CARD_CACHE[name] = null); }
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
    includeRulings = true,
    maxRulingsPerCard = 4,
    heading = "## CARDS REFERENCED (authoritative - use ONLY this text for card behavior)",
  } = options;

  const uniqueNames = [...new Set(
    (names || [])
      .map(name => String(name || "").trim())
      .filter(Boolean)
  )];

  if (!uniqueNames.length) return "";

  const localCards = await fetchLocalCards(uniqueNames, { includeRulings });
  const cards = await Promise.all(uniqueNames.map(async name => {
    if (localCards?.[name]) {
      CARD_CACHE[name] = localCards[name];
      return localCards[name];
    }
    return fetchCard(name);
  }));
  const valid = cards.filter(Boolean);
  if (!valid.length) return "";

  let rulingsByCard = {};
  if (includeRulings) {
    const results = await Promise.all(
      valid.map(card => card.rulings?.length ? card.rulings : fetchCardRulings(card.id, card.rulings_uri, card.oracleId))
    );
    valid.forEach((card, index) => { rulingsByCard[card.id] = results[index] || []; });
  }

  const blocks = valid.map(card => {
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

  return `${heading}\n\n${blocks.join("\n\n---\n\n")}\n\n`;
}

export async function buildCardContext(text, options = {}) {
  const { includeRulings = true, maxRulingsPerCard = 4 } = options;

  // Extract [[Card Name]] mentions — always trusted
  const mentioned = [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1].trim());
  // Strip [[ ]] mentions out before catalog scanning to avoid double-detection
  const textWithoutBrackets = text.replace(/\[\[([^\]]+)\]\]/g, " ");
  // Use Scryfall catalog for accurate bare-name detection (no false positives)
  const catalog = await loadCardCatalog();
  const detected = detectCardNamesInText(textWithoutBrackets, catalog);
  const names = [...new Set([...mentioned, ...detected])];

  if (!names.length) return "";

  // Fetch all cards from the local repository first, then fall back to live Scryfall.
  const localCards = await fetchLocalCards(names, { includeRulings });
  const cards = await Promise.all(names.map(async n => {
    if (localCards?.[n]) {
      CARD_CACHE[n] = localCards[n];
      return localCards[n];
    }
    return fetchCard(n);
  }));
  const valid = cards.filter(Boolean);
  if (!valid.length) return "";

  // Fetch rulings in parallel if enabled
  let rulingsByCard = {};
  if (includeRulings) {
    const results = await Promise.all(
      valid.map(c => c.rulings?.length ? c.rulings : fetchCardRulings(c.id, c.rulings_uri, c.oracleId))
    );
    valid.forEach((c, i) => { rulingsByCard[c.id] = results[i] || []; });
  }

  // Format each card's block
  const blocks = valid.map(c => {
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

  return `## CARDS REFERENCED (authoritative — use ONLY this text for card behavior)\n\n${blocks.join("\n\n---\n\n")}\n\n`;
}

/* ── Banlist post-processor: scans Karn responses for banned cards and flags them ── */
export async function postProcessKarnResponse(text) {
  // Extract all [[Card]] mentions from Karn's response
  const mentioned = [...new Set(
    [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1].trim())
  )];
  if (!mentioned.length) return { text, bannedFlags: [] };

  // Fetch each card (cached) and check Commander legality
  const cards = await Promise.all(mentioned.map(n => fetchCard(n)));
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
    const r = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&order=edhrec&unique=cards`);
    if (!r.ok) return [];
    const d = await r.json();
    return (d.data || []).slice(0, 16).map(c => ({
      name: c.name,
      normal: c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal,
      type: c.type_line || "",
      price: c.prices?.usd ? `$${parseFloat(c.prices.usd).toFixed(2)}` : "—",
    }));
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
      const d = await fetchCard(n);
      if (d) out[n] = d;
    }));
    if (i + 12 < unique.length) await new Promise(r => setTimeout(r, 110));
  }
  return out;
}
