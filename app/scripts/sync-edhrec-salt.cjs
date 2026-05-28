const fs = require("node:fs");
const path = require("node:path");

// Writes land in cwd/data by default (which is app/data in dev), but the
// bundled .exe sets MTG_APP_ROOT to %APPDATA%\com.colton.mtg-tool\ so
// synced files end up in the writable user data dir there instead.
const APP_ROOT = (process.env.MTG_APP_ROOT && process.env.MTG_APP_ROOT.trim())
  ? process.env.MTG_APP_ROOT.trim()
  : process.cwd();
const DATA_DIR = path.join(APP_ROOT, "data");
const OUT_FILE = path.join(DATA_DIR, "edhrec-salt.local.json");
const META_FILE = path.join(DATA_DIR, "edhrec-salt-meta.local.json");
const BASE_URL = "https://json.edhrec.com/pages/";
const START_PATH = "top/salt.json";
const args = new Set(process.argv.slice(2));
const maxPagesArg = process.argv.find(arg => arg.startsWith("--max-pages="));
const maxPages = args.has("--all")
  ? Infinity
  : Number(maxPagesArg?.split("=")[1] || process.env.EDHREC_SALT_MAX_PAGES || 35);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function saltFromCard(card) {
  if (Number.isFinite(card.salt)) return Number(card.salt);
  const match = String(card.label || "").match(/Salt Score:\s*([0-9.]+)/i);
  return match ? Number(match[1]) : null;
}

function cardViewsFromPayload(payload) {
  if (Array.isArray(payload.cardviews)) return payload.cardviews;
  const lists = payload.container?.json_dict?.cardlists || [];
  return lists.flatMap(list => list.cardviews || []);
}

function nextPathFromPayload(payload) {
  if (payload.more) return payload.more;
  const lists = payload.container?.json_dict?.cardlists || [];
  return lists.map(list => list.more).find(Boolean) || null;
}

function normalizeEntry(card, rank) {
  const salt = saltFromCard(card);
  return {
    rank,
    id: card.id || null,
    name: card.name,
    names: card.names || card.cards?.map(face => face.name) || [card.name],
    sanitized: card.sanitized || null,
    salt,
    numDecks: Number(card.num_decks || card.inclusion || 0),
    url: card.url || null,
    scryfallUri: card.scryfall_uri || null,
  };
}

async function fetchJson(pathName) {
  const url = new URL(pathName, BASE_URL).toString();
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "MTG-Tool local salt sync",
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} while fetching ${url}`);
  }
  return response.json();
}

(async () => {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  let entries = [];
  let meta = null;
  if (fs.existsSync(OUT_FILE)) {
    entries = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
  }
  if (fs.existsSync(META_FILE)) {
    meta = JSON.parse(fs.readFileSync(META_FILE, "utf8"));
  }

  const seen = new Set(entries.map(entry => String(entry.name || "").toLowerCase()));
  let pathName = args.has("--restart") ? START_PATH : (meta?.complete ? START_PATH : meta?.nextPath || START_PATH);
  if (args.has("--restart")) {
    entries = [];
    seen.clear();
  }
  let page = 0;

  while (pathName && page < maxPages) {
    page += 1;
    console.log(`[edhrec-salt] Fetching page ${page}: ${pathName}`);
    const payload = await fetchJson(pathName);
    const cards = cardViewsFromPayload(payload);

    for (const card of cards) {
      if (!card?.name) continue;
      const key = String(card.name).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(normalizeEntry(card, entries.length + 1));
    }

    pathName = nextPathFromPayload(payload);
    entries.sort((a, b) => (b.salt || 0) - (a.salt || 0));
    entries.forEach((entry, index) => { entry.rank = index + 1; });
    fs.writeFileSync(OUT_FILE, JSON.stringify(entries, null, 2));
    fs.writeFileSync(META_FILE, JSON.stringify({
      source: "https://json.edhrec.com/pages/top/salt.json",
      syncedAt: new Date().toISOString(),
      count: entries.length,
      complete: !pathName,
      nextPath: pathName,
      lastRunPages: page,
      maxPages,
    }, null, 2));
    if (pathName) await sleep(650);
  }

  entries.sort((a, b) => (b.salt || 0) - (a.salt || 0));
  entries.forEach((entry, index) => { entry.rank = index + 1; });

  fs.writeFileSync(OUT_FILE, JSON.stringify(entries, null, 2));
  fs.writeFileSync(META_FILE, JSON.stringify({
    source: "https://json.edhrec.com/pages/top/salt.json",
    syncedAt: new Date().toISOString(),
    count: entries.length,
    complete: !pathName,
    nextPath: pathName,
    lastRunPages: page,
    maxPages,
  }, null, 2));

  console.log(`[edhrec-salt] Wrote ${entries.length.toLocaleString()} salt entries to ${OUT_FILE}`);
  if (pathName) console.log(`[edhrec-salt] Not complete yet. Next chunk starts at ${pathName}`);
})().catch(error => {
  console.error("[edhrec-salt] Failed:", error);
  process.exit(1);
});
