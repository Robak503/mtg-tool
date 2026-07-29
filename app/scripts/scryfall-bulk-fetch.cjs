"use strict";
/**
 * scryfall-bulk-fetch.cjs — THE ONE adapter for Scryfall's bulk-data endpoint.
 *
 * ⛔ WHY THIS FILE EXISTS (2026-07-29, release v0.149.13 failed to publish because of it).
 * Scryfall changed the bulk-data payload out from under us, in two ways at once:
 *
 *   was:  download_uri       -> https://.../oracle-cards-<stamp>.json      (a JSON array, uncompressed)
 *   now:  jsonl_download_uri -> https://.../oracle-cards-<stamp>.jsonl.gz  (GZIPPED JSONL)
 *
 * The `size` field is gone too; only `compressed_size` survives. Verified live against
 * https://api.scryfall.com/bulk-data on 2026-07-29: all four types this app reads
 * (oracle_cards / default_cards / unique_artwork / rulings) carry ONLY jsonl_download_uri.
 *
 * ⚠️ THE REAL DEFECT WAS OURS, NOT SCRYFALL'S. sync-scryfall-bulk.cjs looped over the four
 * items and did `if (!item.download_uri) continue;` — so an upstream field rename became a
 * sync that downloaded ZERO of four files, wrote a manifest with `files: []`, and EXITED 0.
 * The CI step went green in one second. The failure surfaced two steps later as
 * build-oracle-index dying on a missing oracle_cards.json, which is a fine error message for
 * the wrong problem. Cost: a 7m29s release that published nothing, and a diagnosis that had
 * to start from the tag rather than from the log.
 *
 * ⭐ SO THIS MODULE HOLDS BOTH HALVES OF THE FIX:
 *   1. THE ADAPTER — gunzip + JSONL→JSON-array, so the format change is contained HERE and
 *      every downstream consumer keeps reading the plain JSON array it always read
 *      (cardIndex.js and build-oracle-index.cjs both do readFileSync + JSON.parse and then
 *      `Array.isArray(parsed) ? parsed : parsed.cards`). Nothing downstream changes.
 *   2. THE FAIL-LOUD CONTRACT — `bulkDownloadUrl` returns "" when no known URL field is
 *      present, and every caller MUST treat that as fatal. Absence of a download is never
 *      success. (THE HOLLOW-GATE LAW: absence ≠ value.)
 *
 * Both field names are accepted, new one first, so an upstream rollback needs no code change.
 *
 * Pure node builtins — no npm deps, which matters because this is staged flat into the
 * .exe's resources/scripts/ (prepare-tauri-resources.cjs syncScripts) and runs there under a
 * portable node with no node_modules beside it.
 */

const fs = require("node:fs/promises");
const zlib = require("node:zlib");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { StringDecoder } = require("node:string_decoder");

const USER_AGENT = "mtg-tool-local-scryfall-bulk-sync/0.1";
const BULK_DATA_ENDPOINT = "https://api.scryfall.com/bulk-data";

/** Smallest plausible bulk payload is ~5 MB compressed; anything under this is an error page. */
const MIN_PLAUSIBLE_BYTES = 1024;

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Fetch failed ${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

/** The bulk-data listing, as `{ type -> item }` plus the raw array. */
async function fetchBulkListing() {
  const bulk = await fetchJson(BULK_DATA_ENDPOINT);
  const items = Array.isArray(bulk?.data) ? bulk.data : [];
  if (!items.length) {
    throw new Error(
      `Scryfall bulk-data returned no items (top-level keys: ${Object.keys(bulk || {}).join(", ") || "none"}). ` +
        "The API shape changed — update scryfall-bulk-fetch.cjs.",
    );
  }
  return items;
}

/**
 * The download URL for a bulk item, or "" if the listing carries no field we understand.
 * ⛔ "" IS FATAL AT EVERY CALL SITE. Never `continue` past it — that is the exact bug this
 * module was written to kill.
 */
function bulkDownloadUrl(item) {
  const url = item?.jsonl_download_uri || item?.download_uri || "";
  return typeof url === "string" ? url : "";
}

function missingUrlError(item) {
  const fields = Object.keys(item || {}).join(", ") || "none";
  return new Error(
    `Scryfall bulk item "${item?.type || "?"}" has no download URL — looked for jsonl_download_uri ` +
      `then download_uri, found neither. Fields present: ${fields}. The bulk-data API shape changed; ` +
      "update bulkDownloadUrl() in scripts/scryfall-bulk-fetch.cjs.",
  );
}

const isGzipped = (url) => /\.gz$/i.test(url);
const isJsonl = (url) => /\.jsonl(\.gz)?$/i.test(url);

/**
 * JSONL → a single JSON array, streaming. One record per line in, `[a,b,c]` out.
 *
 * ⚠️ StringDecoder, NOT chunk.toString(). A gzip chunk boundary lands mid-codepoint sooner or
 * later, and this corpus is full of multi-byte names (Æther Vial, Lim-Dûl's Vault, Jötun Grunt).
 * chunk.toString("utf8") would replace the split character with U+FFFD and corrupt that card
 * silently — a data-integrity bug that no count-based check would ever notice.
 *
 * `counted.records` is set on flush so the caller can assert a non-empty result.
 */
function jsonlToJsonArray(counted) {
  const decoder = new StringDecoder("utf8");
  let pending = "";
  let written = 0;

  function emit(stream, line) {
    // Tolerate a stray wrapper line or a trailing comma so this also survives a plain
    // JSON-array body arriving on a .jsonl URL.
    const record = line.trim().replace(/,$/, "").trim();
    if (!record || record === "[" || record === "]") return;
    stream.push(written === 0 ? `[\n${record}` : `,\n${record}`);
    written += 1;
  }

  return new Transform({
    transform(chunk, _enc, done) {
      try {
        pending += decoder.write(chunk);
        const lines = pending.split("\n");
        pending = lines.pop() || "";
        for (const line of lines) emit(this, line);
        done();
      } catch (error) {
        done(error);
      }
    },
    flush(done) {
      try {
        pending += decoder.end();
        for (const line of pending.split("\n")) emit(this, line);
        this.push(written === 0 ? "[]\n" : "\n]\n");
        if (counted) counted.records = written;
        done();
      } catch (error) {
        done(error);
      }
    },
  });
}

/**
 * Download one bulk item to `outputFile` as a plain JSON array, via a temp file + rename so a
 * torn download can never be mistaken for a good snapshot.
 * Returns `{ url, bytes, records }` — `records` is 0 for a non-JSONL passthrough.
 */
async function downloadBulkFile(item, outputFile) {
  const url = bulkDownloadUrl(item);
  if (!url) throw missingUrlError(item);

  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Download failed ${response.status} ${response.statusText}: ${url}`);
  if (!response.body) throw new Error(`Download response had no body: ${url}`);

  const tmp = `${outputFile}.tmp`;
  const counted = { records: 0 };
  try {
    const handle = await fs.open(tmp, "w");
    const stages = [Readable.fromWeb(response.body)];
    if (isGzipped(url)) stages.push(zlib.createGunzip());
    if (isJsonl(url)) stages.push(jsonlToJsonArray(counted));
    stages.push(handle.createWriteStream());
    await pipeline(...stages);

    const stat = await fs.stat(tmp);
    if (stat.size < MIN_PLAUSIBLE_BYTES) {
      throw new Error(
        `Downloaded ${item.type} is only ${stat.size} bytes from ${url} — too small to be a bulk ` +
          "snapshot. Refusing to install it over the existing data.",
      );
    }
    if (isJsonl(url) && counted.records === 0) {
      throw new Error(`Downloaded ${item.type} from ${url} decoded to ZERO records — refusing to install an empty snapshot.`);
    }

    await fs.rename(tmp, outputFile);
    return { url, bytes: stat.size, records: counted.records };
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw error;
  }
}

/**
 * Stream one bulk item straight into an in-memory array of records, for callers that want the
 * objects rather than a file on disk (sync-scryfall-oracle.cjs compacts as it goes).
 */
async function fetchBulkRecords(item) {
  const url = bulkDownloadUrl(item);
  if (!url) throw missingUrlError(item);

  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Download failed ${response.status} ${response.statusText}: ${url}`);
  if (!response.body) throw new Error(`Download response had no body: ${url}`);

  let source = Readable.fromWeb(response.body);
  if (isGzipped(url)) source = source.pipe(zlib.createGunzip());

  const records = [];
  const decoder = new StringDecoder("utf8");
  let pending = "";

  const take = (line) => {
    const record = line.trim().replace(/,$/, "").trim();
    if (!record || record === "[" || record === "]") return;
    records.push(JSON.parse(record));
  };

  for await (const chunk of source) {
    pending += decoder.write(chunk);
    const lines = pending.split("\n");
    pending = lines.pop() || "";
    for (const line of lines) take(line);
  }
  pending += decoder.end();
  for (const line of pending.split("\n")) take(line);

  if (!records.length) throw new Error(`Scryfall ${item.type} decoded to ZERO records from ${url} — refusing to treat that as a sync.`);
  return records;
}

module.exports = {
  BULK_DATA_ENDPOINT,
  USER_AGENT,
  MIN_PLAUSIBLE_BYTES,
  fetchJson,
  fetchBulkListing,
  bulkDownloadUrl,
  missingUrlError,
  isGzipped,
  isJsonl,
  jsonlToJsonArray,
  downloadBulkFile,
  fetchBulkRecords,
};
