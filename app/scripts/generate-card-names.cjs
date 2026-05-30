const fs = require("fs");
const path = require("path");

const APP_ROOT = path.resolve(__dirname, "..");
const ENGINE_ROOT = path.resolve(APP_ROOT, "..", "knowledge", "mtg-engine");
const OUTPUT_FILE = path.join(APP_ROOT, "public", "card-names.json");

const SOURCE_FILES = [
  "scryfall_AH.json",
  "scryfall_IP.json",
  "scryfall_QZ.json",
].map((name) => path.join(ENGINE_ROOT, name));

const names = new Set();

for (const file of SOURCE_FILES) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const card of data.cards || []) {
    if (card.name) names.add(card.name.toLowerCase());
    for (const face of card.card_faces || []) {
      if (face.name) names.add(face.name.toLowerCase());
    }
  }
}

const list = [...names].sort();
fs.writeFileSync(
  OUTPUT_FILE,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: "mtg-engine Scryfall Commander card chunks",
      count: list.length,
      names: list,
    },
    null,
    2
  )
);

console.log(`Wrote ${list.length} card names to ${OUTPUT_FILE}`);
