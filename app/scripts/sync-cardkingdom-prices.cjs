/**
 * sync-cardkingdom-prices.cjs — fetch Card Kingdom's public bulk pricelist
 * and build a slim scryfallId → retail-price index.
 *
 * WHY THIS EXISTS
 *   Scryfall's `prices.usd` is TCGPlayer's *computed market price*. It goes
 *   null when a printing hasn't had enough recent sales for TCGPlayer to
 *   compute a market value — even though copies are listed for sale. A
 *   collection can't show nil values, so we need a second price source.
 *
 *   Card Kingdom publishes a free bulk pricelist where every row carries a
 *   `scryfall_id`, so we match to the exact printing with no fuzzy guessing.
 *   This is local-first: one bulk fetch, cached to disk, then every lookup
 *   is local. No per-card live calls.
 *
 * OUTPUT  data/cardkingdom-prices.json
 *   {
 *     generatedAt: ISO-8601,
 *     source: "cardkingdom-v2-pricelist",
 *     count: <distinct scryfall_ids>,
 *     prices: { "<scryfallId>": { usd: "1.23", usdFoil: "4.56" } }
 *   }
 *   Prices are kept as strings (matching Scryfall's `prices.usd` format) so
 *   the value calc's parseFloat works identically on either source. A finish
 *   that Card Kingdom doesn't stock is simply absent (not "0.00").
 *
 * Writes land in cwd/data by default (app/data in dev); the bundled .exe sets
 * MTG_APP_ROOT to %APPDATA%\com.colton.mtg-tool\ so an in-app sync writes to
 * the writable user dir, which paths.js then prefers over the bundled copy.
 */

const fs = require("node:fs");
const path = require("node:path");

const APP_ROOT = (process.env.MTG_APP_ROOT && process.env.MTG_APP_ROOT.trim())
  ? process.env.MTG_APP_ROOT.trim()
  : process.cwd();
const DATA_DIR = path.join(APP_ROOT, "data");
const OUT_FILE = path.join(DATA_DIR, "cardkingdom-prices.json");
const PRICELIST_URL = "https://api.cardkingdom.com/api/v2/pricelist";
const UA = "MTG-Tool/price-sync (https://github.com/Robak503/mtg-tool)";

function log(msg) {
  process.stdout.write(`[cardkingdom] ${msg}\n`);
}

// Keep only a clean positive decimal string; reject "0.00"/empty/garbage so a
// card with no real Card Kingdom price stays absent (and the resolver moves on)
// rather than getting pinned to $0.
function cleanPrice(raw) {
  if (raw == null) return null;
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Normalize to a 2-decimal string, matching Scryfall's "1.23" shape.
  return n.toFixed(2);
}

async function fetchPricelist() {
  log(`fetching ${PRICELIST_URL} …`);
  const res = await fetch(PRICELIST_URL, {
    headers: { "Accept": "application/json", "User-Agent": UA },
  });
  if (!res.ok) {
    throw new Error(`Card Kingdom pricelist returned ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const rows = Array.isArray(json) ? json : (json.data || json.pricelist || []);
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Card Kingdom pricelist had no rows (shape changed?)");
  }
  return rows;
}

function buildIndex(rows) {
  const prices = Object.create(null);
  let foilCount = 0;
  let nonfoilCount = 0;
  for (const row of rows) {
    const sid = row && row.scryfall_id;
    if (!sid || typeof sid !== "string") continue;
    const retail = cleanPrice(row.price_retail);
    if (!retail) continue;
    const isFoil = String(row.is_foil) === "true";
    const entry = prices[sid] || (prices[sid] = {});
    if (isFoil) {
      // Take the lowest retail if multiple foil rows map to one scryfall_id.
      if (entry.usdFoil == null || parseFloat(retail) < parseFloat(entry.usdFoil)) {
        entry.usdFoil = retail;
      }
      foilCount++;
    } else {
      if (entry.usd == null || parseFloat(retail) < parseFloat(entry.usd)) {
        entry.usd = retail;
      }
      nonfoilCount++;
    }
  }
  return { prices, foilCount, nonfoilCount };
}

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(data), "utf8");
  fs.renameSync(tmp, file);
}

async function main() {
  const rows = await fetchPricelist();
  log(`pricelist has ${rows.length} rows`);
  const { prices, foilCount, nonfoilCount } = buildIndex(rows);
  const count = Object.keys(prices).length;
  const out = {
    generatedAt: new Date().toISOString(),
    source: "cardkingdom-v2-pricelist",
    count,
    prices,
  };
  writeAtomic(OUT_FILE, out);
  log(`wrote ${count} priced printings (${nonfoilCount} nonfoil + ${foilCount} foil rows) → ${OUT_FILE}`);
}

main().catch(err => {
  process.stderr.write(`[cardkingdom] FAILED: ${err.message}\n`);
  process.exit(1);
});
