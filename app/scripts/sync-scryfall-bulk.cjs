const fs = require("node:fs/promises");
const path = require("node:path");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

// Writes land in the dev tree by default, but the bundled .exe sets
// MTG_APP_ROOT to %APPDATA%\com.colton.mtg-tool\ so synced files end
// up in the writable user data dir there instead.
const APP_ROOT = (process.env.MTG_APP_ROOT && process.env.MTG_APP_ROOT.trim())
  ? process.env.MTG_APP_ROOT.trim()
  : path.resolve(__dirname, "..");
const BULK_DIR = path.join(APP_ROOT, "data", "scryfall-bulk");
const MANIFEST_FILE = path.join(BULK_DIR, "manifest.json");

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "mtg-tool-local-scryfall-bulk-sync/0.1" },
  });
  if (!response.ok) throw new Error(`Fetch failed ${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function downloadFile(url, outputFile) {
  const response = await fetch(url, {
    headers: { "User-Agent": "mtg-tool-local-scryfall-bulk-sync/0.1" },
  });
  if (!response.ok) throw new Error(`Download failed ${response.status} ${response.statusText}: ${url}`);
  if (!response.body) throw new Error(`Download response had no body: ${url}`);

  const tmp = `${outputFile}.tmp`;
  await pipeline(Readable.fromWeb(response.body), (await fs.open(tmp, "w")).createWriteStream());
  await fs.rename(tmp, outputFile);
}

function safeName(item) {
  return `${item.type}.json`.replace(/[^a-z0-9_.-]/gi, "_");
}

// Bulk types this app actually reads at runtime. all_cards is the 2.4 GB
// per-printing-per-language giant — no code path touches it, so we skip
// it to save ~20 min of download time and ~2 GB of disk in CI.
// Pass --include-all to fetch every type (e.g. for archival).
const DEFAULT_TYPES = new Set([
  "oracle_cards",
  "default_cards",
  "unique_artwork",
  "rulings",
]);
const INCLUDE_ALL = process.argv.includes("--include-all");

async function main() {
  await fs.mkdir(BULK_DIR, { recursive: true });

  const bulk = await fetchJson("https://api.scryfall.com/bulk-data");
  const items = bulk.data || [];
  const filtered = INCLUDE_ALL ? items : items.filter(item => DEFAULT_TYPES.has(item.type));
  const manifest = {
    generatedAt: new Date().toISOString(),
    source: "Scryfall bulk-data endpoint",
    count: filtered.length,
    files: [],
  };

  console.log(`Downloading ${filtered.length} of ${items.length} bulk files${INCLUDE_ALL ? "" : " (skipping all_cards — pass --include-all to fetch it too)"}`);
  for (const item of filtered) {
    if (!item.download_uri) continue;
    const fileName = safeName(item);
    const outputFile = path.join(BULK_DIR, fileName);
    console.log(`Downloading ${item.type} -> ${fileName}`);
    await downloadFile(item.download_uri, outputFile);
    const stat = await fs.stat(outputFile);
    manifest.files.push({
      type: item.type,
      name: item.name,
      description: item.description,
      updatedAt: item.updated_at,
      compressedSize: item.compressed_size,
      size: stat.size,
      file: path.relative(APP_ROOT, outputFile).replace(/\\/g, "/"),
    });
  }

  await fs.writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`Wrote Scryfall bulk manifest to ${MANIFEST_FILE}`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
