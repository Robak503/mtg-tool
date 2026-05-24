const fs = require("fs");
const path = require("path");

const APP_ROOT = path.resolve(__dirname, "..");
const OUTPUT_FILE = path.join(APP_ROOT, "public", "token-names.json");
const SEARCH_URL =
  "https://api.scryfall.com/cards/search?unique=prints&order=name&q=" +
  encodeURIComponent("layout:token OR layout:double_faced_token");

async function main() {
  const names = new Set();
  let url = SEARCH_URL;

  while (url) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "MTGToolLocal/0.1",
      },
    });

    if (!response.ok) {
      throw new Error(`Scryfall token fetch failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    for (const card of data.data || []) {
      if (card.name) names.add(card.name.toLowerCase());
      for (const face of card.card_faces || []) {
        if (face.name) names.add(face.name.toLowerCase());
      }
    }

    url = data.has_more ? data.next_page : null;
  }

  const list = [...names].sort();
  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: "Scryfall search: layout:token OR layout:double_faced_token",
        count: list.length,
        names: list,
      },
      null,
      2
    )
  );

  console.log(`Wrote ${list.length} token names to ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
