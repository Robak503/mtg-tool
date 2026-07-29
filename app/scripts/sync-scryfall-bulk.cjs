"use strict";
/**
 * sync-scryfall-bulk.cjs — pull the Scryfall bulk snapshots this app reads at runtime.
 *
 * ⛔ 2026-07-29: THIS SCRIPT SILENTLY SYNCED NOTHING AND KILLED RELEASE v0.149.13. Scryfall
 * renamed `download_uri` to `jsonl_download_uri` (and moved to gzipped JSONL); the loop below
 * used to say `if (!item.download_uri) continue;`, so all four downloads were skipped, a
 * manifest with `files: []` was written, and the process EXITED 0. CI went green in one second
 * and the release died two steps later on a missing oracle_cards.json.
 *
 * ⭐ THE STRUCTURAL FIX IS THE GUARD, NOT THE RENAME. Every URL/format concern now lives in
 * scryfall-bulk-fetch.cjs (shared with sync-scryfall-oracle.cjs so the two can't drift), and
 * this script asserts that it downloaded EXACTLY the files it set out to download. A sync that
 * moves zero bytes is now a hard, immediate, legible failure. Absence is never success.
 */

const fs = require("node:fs/promises");
const path = require("node:path");

const { fetchBulkListing, bulkDownloadUrl, missingUrlError, downloadBulkFile } = require("./scryfall-bulk-fetch.cjs");

// Writes land in the dev tree by default, but the bundled .exe sets
// MTG_APP_ROOT to %APPDATA%\com.colton.mtg-tool\ so synced files end
// up in the writable user data dir there instead.
const APP_ROOT = (process.env.MTG_APP_ROOT && process.env.MTG_APP_ROOT.trim())
  ? process.env.MTG_APP_ROOT.trim()
  : path.resolve(__dirname, "..");
const BULK_DIR = path.join(APP_ROOT, "data", "scryfall-bulk");
const MANIFEST_FILE = path.join(BULK_DIR, "manifest.json");

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

  const items = await fetchBulkListing();
  const filtered = INCLUDE_ALL ? items : items.filter(item => DEFAULT_TYPES.has(item.type));

  // ⛔ GUARD 1: the wanted types must still exist upstream. Without this, a renamed `type`
  // value would sync zero files and report success — the same class of bug as the URL rename.
  if (!filtered.length) {
    throw new Error(
      `Scryfall bulk-data listed ${items.length} items but none matched the wanted types ` +
        `(${[...DEFAULT_TYPES].join(", ")}). Present types: ${items.map(i => i.type).join(", ") || "none"}. ` +
        "The API shape changed — update DEFAULT_TYPES.",
    );
  }

  // ⛔ GUARD 2: every wanted item must carry a URL we understand, checked BEFORE any download
  // so an upstream field rename fails in one second with the field list in the message.
  const urlless = filtered.filter(item => !bulkDownloadUrl(item));
  if (urlless.length) throw missingUrlError(urlless[0]);

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: "Scryfall bulk-data endpoint",
    count: filtered.length,
    files: [],
  };

  console.log(`Downloading ${filtered.length} of ${items.length} bulk files${INCLUDE_ALL ? "" : " (skipping all_cards — pass --include-all to fetch it too)"}`);
  for (const item of filtered) {
    const fileName = safeName(item);
    const outputFile = path.join(BULK_DIR, fileName);
    console.log(`Downloading ${item.type} -> ${fileName}`);
    const { url, bytes, records } = await downloadBulkFile(item, outputFile);
    console.log(`  ${item.type}: ${bytes.toLocaleString()} bytes${records ? `, ${records.toLocaleString()} records` : ""}`);
    manifest.files.push({
      type: item.type,
      name: item.name,
      description: item.description,
      updatedAt: item.updated_at,
      compressedSize: item.compressed_size,
      size: bytes,
      records,
      sourceUrl: url,
      file: path.relative(APP_ROOT, outputFile).replace(/\\/g, "/"),
    });
  }

  // ⛔ GUARD 3: the belt-and-braces post-condition. Any future `continue` added to the loop
  // above — for any reason — trips this instead of quietly shrinking the snapshot.
  if (manifest.files.length !== filtered.length) {
    throw new Error(
      `Expected to download ${filtered.length} bulk files but wrote ${manifest.files.length}. ` +
        "Refusing to write a manifest that does not describe a complete sync.",
    );
  }

  await fs.writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`Wrote Scryfall bulk manifest to ${MANIFEST_FILE}`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
