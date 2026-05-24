const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const DECK_FILE = path.join(ROOT, "data", "decks.local.json");
const TOKEN_FILE = path.join(ROOT, "public", "token-names.json");
const GENERIC_TOKEN_NAMES = new Set([
  "beast",
  "bird",
  "blood",
  "clue",
  "copy",
  "food",
  "hydra",
  "koma's coil",
  "kraken",
  "sliver",
  "sliver army",
  "treasure",
  "zombie",
]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function cardCount(deck, includeTokens = false) {
  return (deck.cards || [])
    .filter(card => includeTokens || card.section !== "Tokens")
    .reduce((sum, card) => sum + Number(card.qty || 0), 0);
}

function sectionCount(deck, section) {
  return (deck.cards || [])
    .filter(card => card.section === section)
    .reduce((sum, card) => sum + Number(card.qty || 0), 0);
}

function commanderNames(deck) {
  return (deck.cards || [])
    .filter(card => card.section === "Commander")
    .map(card => card.name);
}

function loadDecks() {
  if (!fs.existsSync(DECK_FILE)) {
    throw new Error(`Missing deck library: ${DECK_FILE}`);
  }

  const parsed = readJson(DECK_FILE);
  const decks = Array.isArray(parsed) ? parsed : parsed.decks;
  if (!Array.isArray(decks)) {
    throw new Error("Deck library must be an array or an object with a decks array.");
  }
  return decks;
}

function loadTokenNames() {
  if (!fs.existsSync(TOKEN_FILE)) return new Set();
  const parsed = readJson(TOKEN_FILE);
  const names = Array.isArray(parsed) ? parsed : parsed.names;
  return new Set((names || []).map(name => String(name).toLowerCase()));
}

function checkDeckLibrary() {
  const decks = loadDecks();
  const tokenNames = loadTokenNames();
  const errors = [];
  const warnings = [];
  const ids = new Set();
  const ownerNames = new Set();
  const owners = new Map();

  for (const deck of decks) {
    const label = `${deck.memory?.owner || "Unknown"} / ${deck.name || "Unnamed deck"}`;
    const ownerName = `${deck.memory?.owner || "Unknown"}:${deck.name || "Unnamed deck"}`.toLowerCase();

    owners.set(deck.memory?.owner || "Unknown", (owners.get(deck.memory?.owner || "Unknown") || 0) + 1);

    if (!deck.id) errors.push(`${label}: missing id`);
    if (deck.id && ids.has(deck.id)) errors.push(`${label}: duplicate id ${deck.id}`);
    if (deck.id) ids.add(deck.id);

    if (!deck.name) errors.push(`${label}: missing name`);
    if (ownerNames.has(ownerName)) warnings.push(`${label}: duplicate owner/name pairing`);
    ownerNames.add(ownerName);

    if (!Array.isArray(deck.cards) || !deck.cards.length) {
      errors.push(`${label}: missing cards`);
      continue;
    }

    const commanders = commanderNames(deck);
    const nonTokenCount = cardCount(deck);
    const tokenCount = sectionCount(deck, "Tokens");
    const badQty = deck.cards.filter(card => !Number.isFinite(Number(card.qty)) || Number(card.qty) <= 0);
    const tokenLikeMain = deck.cards.filter(card => {
      if (card.section === "Tokens") return false;
      const name = String(card.name || "").toLowerCase();
      const qty = Number(card.qty || 0);
      return GENERIC_TOKEN_NAMES.has(name) || (qty > 1 && tokenNames.has(name));
    });

    if (!commanders.length) errors.push(`${label}: no commander section cards`);
    if (badQty.length) errors.push(`${label}: invalid quantities on ${badQty.map(card => card.name).join(", ")}`);
    if (nonTokenCount !== 100) warnings.push(`${label}: ${nonTokenCount} non-token cards`);
    if (tokenLikeMain.length) {
      warnings.push(`${label}: token-like cards outside Tokens section: ${tokenLikeMain.map(card => card.name).slice(0, 8).join(", ")}`);
    }

    console.log(`${label}: ${commanders.join(" / ")} | ${nonTokenCount} cards | ${tokenCount} tokens`);
  }

  console.log("");
  console.log(`Decks: ${decks.length}`);
  console.log(`Owners: ${[...owners.entries()].map(([owner, count]) => `${owner} ${count}`).join(", ")}`);
  console.log(`Warnings: ${warnings.length}`);
  for (const warning of warnings) console.log(`  ! ${warning}`);
  console.log(`Errors: ${errors.length}`);
  for (const error of errors) console.log(`  - ${error}`);

  if (errors.length) process.exitCode = 1;
}

try {
  checkDeckLibrary();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
