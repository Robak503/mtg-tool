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

// ── COST-INTEGRITY GUARD ────────────────────────────────────────────────────
// A card with a positive mana value (cmc > 0) must carry a castable cost SOMEWHERE — the top-level
// mana_cost, OR a card_faces[] entry (a DFC/MDFC/transform card leaves mana_cost "" and stores the
// cost on its front face). A consumer that derives a cast cost from an empty mana_cost without
// falling back to the face would treat the card as FREE TO CAST. Scryfall ships some legitimately
// costless cmc>0 entries: meld RESULTS (layout "meld" — formed by melding, never cast, so excluded
// by layout) and B.F.M. (not commander-legal). The guard is therefore restricted to commander-legal,
// castable-type, non-meld cards. That yields a ZERO-false-positive tripwire: it passes on today's
// data and fires only if a sync regression drops real costs from playable cards (the "Llanowar Elves
// reads as a 0-cost dork" failure mode this guard exists to catch).
const CASTABLE_TYPES = ["creature", "instant", "sorcery", "artifact", "enchantment", "planeswalker", "battle"];

function hasCastableCost(card) {
  if (card.mana_cost && card.mana_cost !== "") return true;
  return (card.card_faces || []).some(face => face && face.mana_cost && face.mana_cost !== "");
}

/**
 * Commander-legal, castable-type cards with cmc > 0 that carry NO cost on the card or any face.
 * Pure (no I/O) so it's unit-testable against fixtures. Returns the offending cards.
 */
function findCostlessCastableCards(cards) {
  return (cards || []).filter(card => {
    if (card.layout === "meld") return false;                          // meld results: formed, never cast
    const typeLine = String(card.type_line || "").toLowerCase();
    if (typeLine.includes("land")) return false;                       // lands have no cost by rule
    if (!CASTABLE_TYPES.some(t => typeLine.includes(t))) return false; // tokens/planes/schemes/etc.
    const commander = card.legalities && card.legalities.commander;
    if (!commander || commander === "not_legal") return false;         // Un-cards / non-legal oddities
    if (!(Number(card.cmc) > 0)) return false;                         // suspend-only / true 0-cost cards
    return !hasCastableCost(card);
  });
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

  const costless = findCostlessCastableCards(cards);
  for (const card of costless) {
    errors.push(`${card.name} (cmc ${card.cmc}) has no mana cost on the card or any face — sync may have dropped it`);
  }

  console.log(`Oracle cards: ${cards.length}`);
  console.log(`Oracle updated: ${oracle.scryfallUpdatedAt || "unknown"}`);
  console.log(`Rulings: ${(rulings.rulings || []).length}`);
  console.log(`Rulings updated: ${rulings.scryfallUpdatedAt || "unknown"}`);
  console.log(`Required cards checked: ${required.length}`);
  console.log(`Commander-legal castable cards missing a cost: ${costless.length}`);

  if (errors.length) {
    for (const error of errors) console.log(`  - ${error}`);
    process.exitCode = 1;
  } else {
    console.log("Local Oracle repository looks healthy.");
  }
}

// Exported for unit tests; only run the file's checks when invoked directly (`node check-local-oracle.cjs`),
// so requiring it from a test doesn't trigger a 165MB read or process.exitCode side effects.
module.exports = { findCostlessCastableCards, hasCastableCost, normalizeName, oracleText };

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}
