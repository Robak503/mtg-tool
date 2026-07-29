const fs = require("node:fs/promises");
const path = require("node:path");

// ⛔ 2026-07-29: Scryfall replaced `download_uri` (a plain JSON array) with
// `jsonl_download_uri` (gzipped JSONL), which broke this script and killed release
// v0.149.13 via its sibling. All URL/format handling lives in ONE shared adapter so the two
// sync scripts cannot drift apart the next time upstream moves.
const { fetchBulkListing, fetchBulkRecords } = require("./scryfall-bulk-fetch.cjs");

const APP_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(APP_ROOT, "data");
const ORACLE_FILE = path.join(DATA_DIR, "scryfall.oracle.local.json");
const RULINGS_FILE = path.join(DATA_DIR, "scryfall.rulings.local.json");
const CARD_NAMES_FILE = path.join(APP_ROOT, "public", "card-names.json");

function compactCard(card) {
  return {
    id: card.id,
    oracle_id: card.oracle_id,
    name: card.name,
    lang: card.lang,
    layout: card.layout,
    mana_cost: card.mana_cost || "",
    type_line: card.type_line || "",
    oracle_text: card.oracle_text || "",
    cmc: card.cmc ?? 0,
    colors: card.colors || [],
    color_identity: card.color_identity || [],
    keywords: card.keywords || [],
    legalities: card.legalities || {},
    prices: card.prices || {},
    power: card.power ?? null,
    toughness: card.toughness ?? null,
    loyalty: card.loyalty ?? null,
    defense: card.defense ?? null,
    edhrec_rank: card.edhrec_rank ?? null,
    scryfall_uri: card.scryfall_uri,
    rulings_uri: card.rulings_uri,
    image_uris: card.image_uris ? { normal: card.image_uris.normal, small: card.image_uris.small } : null,
    card_faces: (card.card_faces || []).map(face => ({
      name: face.name,
      mana_cost: face.mana_cost || "",
      type_line: face.type_line || "",
      oracle_text: face.oracle_text || "",
      power: face.power ?? null,
      toughness: face.toughness ?? null,
      loyalty: face.loyalty ?? null,
      defense: face.defense ?? null,
      image_uris: face.image_uris ? { normal: face.image_uris.normal, small: face.image_uris.small } : null,
    })),
  };
}

function cardNameSet(cards) {
  const names = new Set();
  for (const card of cards) {
    if (card.name) names.add(card.name.toLowerCase());
    if (card.name?.includes(" // ")) names.add(card.name.split(" // ")[0].toLowerCase());
    for (const face of card.card_faces || []) {
      if (face.name) names.add(face.name.toLowerCase());
    }
  }
  return [...names].sort();
}

function compactRuling(ruling) {
  return {
    oracle_id: ruling.oracle_id,
    source: ruling.source,
    published_at: ruling.published_at,
    comment: ruling.comment,
  };
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const items = await fetchBulkListing();
  const oracleBulk = items.find(item => item.type === "oracle_cards");
  const rulingsBulk = items.find(item => item.type === "rulings");

  // The URL-field check now lives in fetchBulkRecords, which throws with the full field list
  // rather than a bare "could not find" — so a rename upstream names itself.
  const present = () => items.map(item => item.type).join(", ") || "none";
  if (!oracleBulk) throw new Error(`Could not find Scryfall oracle_cards bulk data. Types present: ${present()}`);
  if (!rulingsBulk) throw new Error(`Could not find Scryfall rulings bulk data. Types present: ${present()}`);

  console.log(`Downloading Oracle cards updated ${oracleBulk.updated_at}`);
  const oracleCards = await fetchBulkRecords(oracleBulk);
  const compactCards = oracleCards
    .filter(card => card.lang === "en")
    .map(compactCard);

  const oraclePayload = {
    version: 1,
    source: "Scryfall oracle_cards bulk data",
    generatedAt: new Date().toISOString(),
    scryfallUpdatedAt: oracleBulk.updated_at,
    count: compactCards.length,
    cards: compactCards,
  };

  await fs.writeFile(ORACLE_FILE, JSON.stringify(oraclePayload, null, 2), "utf8");

  const names = cardNameSet(compactCards);
  await fs.writeFile(
    CARD_NAMES_FILE,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: "Scryfall oracle_cards bulk data",
      scryfallUpdatedAt: oracleBulk.updated_at,
      count: names.length,
      names,
    }, null, 2),
    "utf8"
  );

  console.log(`Downloading rulings updated ${rulingsBulk.updated_at}`);
  const rulings = await fetchBulkRecords(rulingsBulk);
  const compactRulings = rulings
    .filter(ruling => ruling.oracle_id && ruling.comment)
    .map(compactRuling);

  await fs.writeFile(
    RULINGS_FILE,
    JSON.stringify({
      version: 1,
      source: "Scryfall rulings bulk data",
      generatedAt: new Date().toISOString(),
      scryfallUpdatedAt: rulingsBulk.updated_at,
      count: compactRulings.length,
      rulings: compactRulings,
    }, null, 2),
    "utf8"
  );

  console.log(`Wrote ${compactCards.length} cards to ${ORACLE_FILE}`);
  console.log(`Wrote ${names.length} names to ${CARD_NAMES_FILE}`);
  console.log(`Wrote ${compactRulings.length} rulings to ${RULINGS_FILE}`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
