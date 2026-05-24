const fs = require("node:fs");
const path = require("node:path");

const APP_ROOT = path.resolve(__dirname, "..");
const ORACLE_FILE = path.join(APP_ROOT, "data", "scryfall.oracle.local.json");
const RULINGS_FILE = path.join(APP_ROOT, "data", "scryfall.rulings.local.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

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
  return (card.card_faces || []).map(face => face.oracle_text || "").filter(Boolean).join("\n//\n");
}

function buildIndex(cards) {
  const index = new Map();
  for (const card of cards) {
    const names = [card.name, ...(card.card_faces || []).map(face => face.name)];
    for (const name of names) {
      if (!name) continue;
      const key = normalizeName(name);
      const current = index.get(key);
      const currentHasText = current && oracleText(current);
      if (!current || (!currentHasText && oracleText(card))) index.set(key, card);
    }
  }
  return index;
}

function main() {
  if (!fs.existsSync(ORACLE_FILE)) {
    throw new Error(`Missing local Oracle file. Run npm.cmd run sync:oracle`);
  }
  if (!fs.existsSync(RULINGS_FILE)) {
    throw new Error(`Missing local rulings file. Run npm.cmd run sync:oracle`);
  }

  const oracle = readJson(ORACLE_FILE);
  const rulings = readJson(RULINGS_FILE);
  const cards = oracle.cards || [];
  const index = buildIndex(cards);
  const required = ["Sol Ring", "Sliver Hivelord", "Swords to Plowshares", "Thassa's Oracle"];
  const errors = [];

  for (const name of required) {
    const card = index.get(normalizeName(name));
    if (!card) {
      errors.push(`Missing ${name}`);
      continue;
    }
    if (!oracleText(card)) errors.push(`${name} has no Oracle text`);
  }

  console.log(`Oracle cards: ${cards.length}`);
  console.log(`Oracle updated: ${oracle.scryfallUpdatedAt || "unknown"}`);
  console.log(`Rulings: ${(rulings.rulings || []).length}`);
  console.log(`Rulings updated: ${rulings.scryfallUpdatedAt || "unknown"}`);
  console.log(`Required cards checked: ${required.length}`);

  if (errors.length) {
    for (const error of errors) console.log(`  - ${error}`);
    process.exitCode = 1;
  } else {
    console.log("Local Oracle repository looks healthy.");
  }
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
