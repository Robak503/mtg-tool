#!/usr/bin/env node
/**
 * Local Commander Spellbook sync.
 *
 * Downloads Commander Spellbook combo variants and card flags into app/data.
 * The sync is intentionally slow, resumable, and checkpointed because the API
 * will rate-limit bursty pagination.
 *
 * Outputs:
 *   data/spellbook-combos.local.json
 *   data/spellbook-index.local.json
 *   data/spellbook-cards.local.json
 *   data/spellbook-meta.local.json
 *
 * Usage from app/:
 *   npm run sync:spellbook
 *   npm run sync:spellbook -- --fresh
 *   npm run sync:spellbook -- --combos-only
 *   npm run sync:spellbook-cards
 *   node scripts/sync-spellbook.cjs --fresh --delay-ms 1200
 */

const fs = require("node:fs/promises");
const path = require("node:path");
const zlib = require("node:zlib");
const { Readable } = require("node:stream");

const BASE_URL = "https://backend.commanderspellbook.com";
// BULK EXPORT (overhaul P4): Commander Spellbook publishes the FULL dataset nightly as a single
// gzipped JSON (S3+CloudFront; the official site + CubeCobra consume it). One download replaces
// the 429-throttled paged crawl that capped runs at ~10% of the dataset. LOAD-BEARING: the
// DECOMPRESSED document (~540 MB) exceeds Node's max string length (2^29-24 bytes), so this file
// must be STREAM-parsed record-by-record — never fs.readFile + JSON.parse.
const BULK_URL = "https://json.commanderspellbook.com/variants.json.gz";
// Writes land in the dev tree by default, but the bundled .exe sets
// MTG_APP_ROOT to %APPDATA%\com.colton.mtg-tool\ so synced files end
// up in the writable user data dir there instead.
const APP_ROOT = (process.env.MTG_APP_ROOT && process.env.MTG_APP_ROOT.trim())
  ? process.env.MTG_APP_ROOT.trim()
  : path.resolve(__dirname, "..");
const DATA_DIR = path.join(APP_ROOT, "data");
const COMBOS_FILE = path.join(DATA_DIR, "spellbook-combos.local.json");
const CARDS_FILE = path.join(DATA_DIR, "spellbook-cards.local.json");
const INDEX_FILE = path.join(DATA_DIR, "spellbook-index.local.json");
const META_FILE = path.join(DATA_DIR, "spellbook-meta.local.json");

const args = process.argv.slice(2);
const COMBOS_ONLY = args.includes("--combos-only");
const CARDS_ONLY = args.includes("--cards-only");
const FRESH = args.includes("--fresh");
const PAGED = args.includes("--paged"); // force the legacy paged crawl (skip the bulk export)
const PAGE_SIZE = numberArg("--page-size", 100);
const DELAY_MS = numberArg("--delay-ms", CARDS_ONLY ? 1000 : 750);
const RETRY_LIMIT = numberArg("--retries", 10);
const REQUEST_TIMEOUT_MS = numberArg("--request-timeout-ms", 15000);
// EXIT 75 (EX_TEMPFAIL, "try again later"): Spellbook's rate limit stopped a card crawl that had already saved pages THIS
// run. The progress is on disk and the next run resumes from it, so sync-spellbook.yml reports a warning rather than a
// failure. Any other error, or a 429 before a single page landed, still exits 1 — a stalled crawl must stay red.
const EXIT_RATE_LIMITED_WITH_PROGRESS = 75;
let cardPagesSavedThisRun = 0;

function numberArg(flag, fallback) {
  const index = args.indexOf(flag);
  if (index === -1 || index === args.length - 1) return fallback;
  const value = Number(args[index + 1]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value, pretty = false) {
  // Atomic: write a temp file then rename (atomic on one volume) so a mid-write kill (the Tauri
  // Job-Object KILL_ON_JOB_CLOSE on app quit) can never leave a truncated file that paths.js prefers.
  const tmp = `${filePath}.tmp.${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(value, null, pretty ? 2 : 0));
  await fs.rename(tmp, filePath);
}

function normalizeName(name) {
  return String(name || "").toLowerCase().trim()
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"');
}

async function fetchJSON(url, attempt = 0) {
  let res;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (attempt < RETRY_LIMIT) {
      const waitMs = Math.min(60000, 2000 * (attempt + 1));
      console.log(`\n  Request failed (${err.message}). Waiting ${(waitMs / 1000).toFixed(1)}s before retry...`);
      await sleep(waitMs);
      return fetchJSON(url, attempt + 1);
    }
    throw err;
  }

  const text = await res.text();

  if (res.status === 429) {
    if (attempt >= RETRY_LIMIT) {
      throw new Error(`HTTP 429 after ${RETRY_LIMIT} retries from ${url}`);
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(60000, 2000 * (attempt + 1));
    console.log(`\n  Rate limited. Waiting ${(waitMs / 1000).toFixed(1)}s before retry...`);
    await sleep(waitMs);
    return fetchJSON(url, attempt + 1);
  }

  if (!res.ok) {
    if (attempt < RETRY_LIMIT) {
      const waitMs = Math.min(30000, 1000 * (attempt + 1));
      await sleep(waitMs);
      return fetchJSON(url, attempt + 1);
    }
    throw new Error(`HTTP ${res.status} from ${url}`);
  }

  if (!text.trim()) {
    if (attempt < RETRY_LIMIT) {
      const waitMs = Math.min(30000, 1000 * (attempt + 1));
      await sleep(waitMs);
      return fetchJSON(url, attempt + 1);
    }
    throw new Error(`Empty JSON response from ${url}`);
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    if (attempt < RETRY_LIMIT) {
      const waitMs = Math.min(30000, 1000 * (attempt + 1));
      await sleep(waitMs);
      return fetchJSON(url, attempt + 1);
    }
    throw new Error(`Invalid JSON from ${url}: ${err.message}`);
  }
}

function stripVariant(v) {
  return {
    id: v.id,
    cards: (v.uses || []).map(u => u.card.name),
    cardIds: (v.uses || []).map(u => ({
      name: u.card.name,
      oracleId: u.card.oracleId,
    })),
    produces: (v.produces || []).map(p =>
      typeof p === "string" ? p : (p.feature?.name || p.description || "")
    ).filter(Boolean),
    // K5: the combo's step-by-step "how it works" text. Bounded so 95k combos don't bloat the
    // bundle unreasonably; "" when Spellbook omits it. Consumers degrade gracefully (older
    // bundles predating this sync simply won't carry it).
    description: (v.description || "").slice(0, 500),
    bracketTag: v.bracketTag || null,
    manaValueNeeded: v.manaValueNeeded ?? null,
    identity: v.identity || null,
    popularity: v.popularity ?? null,
  };
}

function stripCard(c) {
  return {
    id: c.id,
    name: c.name,
    oracleId: c.oracleId,
    identity: c.identity,
    variantCount: c.variantCount ?? 0,
    color: c.color || null,
    typeLine: c.typeLine || "",
    manaValue: c.manaValue ?? null,
    gameChanger: Boolean(c.gameChanger),
    tutor: Boolean(c.tutor),
    massLandDenial: Boolean(c.massLandDenial),
    extraTurn: Boolean(c.extraTurn),
  };
}

function comboStartOffset(existingCombos) {
  if (FRESH || !existingCombos.length) return 0;
  return Math.max(0, Math.floor(existingCombos.length / PAGE_SIZE) * PAGE_SIZE);
}

function cardStartOffset(existingCards) {
  if (FRESH) return 0;
  const count = new Set(
    Object.values(existingCards || {})
      .filter(card => card && typeof card === "object")
      .map(card => card.id)
  ).size;
  return Math.max(0, Math.floor(count / PAGE_SIZE) * PAGE_SIZE);
}

function buildIndex(variants) {
  const index = {};
  for (const variant of variants) {
    for (const cardName of variant.cards || []) {
      const key = normalizeName(cardName);
      if (!index[key]) index[key] = [];
      index[key].push(variant.id);
    }
  }
  return index;
}

function normalizeCardMap(rawCards) {
  const cards = {};
  const seenIds = new Set();
  for (const card of Object.values(rawCards || {})) {
    if (!card || typeof card !== "object" || seenIds.has(card.id)) continue;
    seenIds.add(card.id);
    cards[card.name] = card;
    cards[normalizeName(card.name)] = card;
  }
  return cards;
}

/**
 * Stream the bulk export: fetch → gunzip → a brace/bracket-depth record splitter that yields each
 * depth-3 object (a variant record inside the top-level "variants"/"aliases" arrays) as its own
 * ~6 KB JSON string for a normal JSON.parse. Alias stubs ({id, variant:null}) and non-"OK"
 * variants are dropped by SHAPE (rec.uses must be an array), so the splitter doesn't need to know
 * which array it is in. The doc header's timestamp/version are captured from the raw text before
 * the first array opens. Accumulates STRIPPED variants only (~95k × ~600 B ≈ 50 MB — fine), then
 * writes ONCE via the existing atomic writeJson. Throws on any failure — main() falls back to the
 * paged crawl.
 */
async function downloadVariantsBulk() {
  console.log(`Downloading the Spellbook BULK export (${BULK_URL})...`);
  const started = Date.now();
  const res = await fetch(BULK_URL, { headers: { "accept-encoding": "identity" } });
  if (!res.ok || !res.body) throw new Error(`bulk fetch failed: HTTP ${res.status}`);

  // CloudFront serves the .gz with Content-Encoding: gzip, so Node's fetch AUTO-decompresses it
  // (feeding an explicit gunzip then dies with "incorrect header check"); a raw S3 serving hands us
  // gzip bytes. Detect by the gzip magic (1f 8b) on the first chunk and route accordingly.
  const nodeStream = Readable.fromWeb(res.body);
  const it = nodeStream[Symbol.asyncIterator]();
  const first = await it.next();
  if (first.done) throw new Error("bulk fetch: empty body");
  const firstChunk = Buffer.isBuffer(first.value) ? first.value : Buffer.from(first.value);
  const isGzip = firstChunk.length >= 2 && firstChunk[0] === 0x1f && firstChunk[1] === 0x8b;
  async function* rawChunks() {
    yield firstChunk;
    while (true) {
      const r = await it.next();
      if (r.done) return;
      yield r.value;
    }
  }
  const stream = isGzip ? Readable.from(rawChunks()).pipe(zlib.createGunzip()) : Readable.from(rawChunks());
  console.log(`  (transfer: ${isGzip ? "raw gzip — local gunzip" : "server-decompressed JSON stream"})`);
  const decoder = new TextDecoder("utf-8");

  const byId = new Map();
  let header = "";          // raw pre-array text — carries {"timestamp": "...", "version": "..."}
  let headerDone = false;
  let depth = 0;            // counts { } and [ ] together; records are objects opening at depth 2→3
  let inString = false;
  let escaped = false;
  let record = null;        // accumulating record text when non-null
  let seen = 0;

  const feed = (text) => {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (!headerDone && header.length < 4096) header += ch; // raw capture incl. string contents
      if (record !== null) record += ch;
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === "{" || ch === "[") {
        depth += 1;
        if (ch === "{" && depth === 3 && record === null) record = "{";
        if (ch === "[" && depth === 2) headerDone = true;
        continue;
      }
      if (ch === "}" || ch === "]") {
        depth -= 1;
        if (ch === "}" && depth === 2 && record !== null) {
          seen += 1;
          let rec;
          try { rec = JSON.parse(record); } catch { rec = null; }
          record = null;
          if (rec === null) throw new Error(`bulk parse: record ${seen} is not valid JSON`);
          // Shape filter: alias stubs have no uses[]; anything not status OK is skipped.
          if (Array.isArray(rec.uses) && rec.status === "OK") {
            const v = stripVariant(rec);
            byId.set(v.id, v);
          }
          if (seen % 10000 === 0) {
            process.stdout.write(`\r  ${byId.size.toLocaleString()} variants parsed (${seen.toLocaleString()} records, ${((Date.now() - started) / 1000).toFixed(1)}s)   `);
          }
        }
      }
    }
  };

  for await (const chunk of stream) feed(decoder.decode(chunk, { stream: true }));
  feed(decoder.decode());

  if (byId.size === 0) throw new Error("bulk parse yielded zero variants");
  const bulkTimestamp = (header.match(/"timestamp":\s*"([^"]+)"/) || [])[1] || null;
  const bulkVersion = (header.match(/"version":\s*"([^"]+)"/) || [])[1] || null;

  const variants = Array.from(byId.values());
  await writeJson(COMBOS_FILE, variants);
  await writeJson(INDEX_FILE, buildIndex(variants));
  process.stdout.write(`\r  ${variants.length.toLocaleString()} variants saved from the bulk export (${((Date.now() - started) / 1000).toFixed(1)}s)              \n`);
  return { variants, bulkTimestamp, bulkVersion };
}

async function downloadVariants() {
  console.log(`Downloading variants from Commander Spellbook (${FRESH ? "fresh" : "resume"}, delay ${DELAY_MS}ms)...`);

  const existing = FRESH ? [] : await readJson(COMBOS_FILE, []);
  const byId = new Map(existing.map(combo => [combo.id, combo]));
  let offset = comboStartOffset(existing);
  let done = false;
  const started = Date.now();

  while (!done) {
    const url = `${BASE_URL}/variants?limit=${PAGE_SIZE}&offset=${offset}`;
    const page = await fetchJSON(url);
    const results = page.results || [];

    for (const variant of results.map(stripVariant)) {
      byId.set(variant.id, variant);
    }

    const variants = Array.from(byId.values());
    await writeJson(COMBOS_FILE, variants);
    await writeJson(INDEX_FILE, buildIndex(variants));

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    process.stdout.write(
      `\r  ${variants.length.toLocaleString()} variants saved; last page ${results.length} at offset ${offset.toLocaleString()} (${elapsed}s)   `
    );

    done = results.length < PAGE_SIZE || !page.next;
    offset += PAGE_SIZE;
    if (!done) await sleep(DELAY_MS);
  }

  process.stdout.write("\n");
  return Array.from(byId.values());
}

async function downloadCards() {
  console.log(`Downloading card flags from Commander Spellbook (${FRESH ? "fresh" : "resume"}, delay ${DELAY_MS}ms)...`);

  const existing = FRESH ? {} : await readJson(CARDS_FILE, {});
  const cards = existing && typeof existing === "object" && !Array.isArray(existing)
    ? normalizeCardMap(existing)
    : {};
  let offset = cardStartOffset(cards);
  let done = false;
  const started = Date.now();

  while (!done) {
    const url = `${BASE_URL}/cards?limit=${PAGE_SIZE}&offset=${offset}`;
    const page = await fetchJSON(url);
    const results = page.results || [];

    for (const raw of results) {
      const card = stripCard(raw);
      cards[card.name] = card;
      cards[normalizeName(card.name)] = card;
    }

    await writeJson(CARDS_FILE, cards);
    cardPagesSavedThisRun += 1;

    const displayCount = new Set(Object.values(cards).map(card => card.id)).size;
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    process.stdout.write(
      `\r  ${displayCount.toLocaleString()} cards saved; last page ${results.length} at offset ${offset.toLocaleString()} (${elapsed}s)   `
    );

    done = results.length < PAGE_SIZE || !page.next;
    offset += PAGE_SIZE;
    if (!done) await sleep(DELAY_MS);
  }

  process.stdout.write("\n");
  return cards;
}

async function writeMeta(bulkInfo = null) {
  const combos = await readJson(COMBOS_FILE, []);
  const cards = await readJson(CARDS_FILE, {});
  const uniqueCardIds = new Set(
    Object.values(cards || {})
      .filter(card => card && typeof card === "object")
      .map(card => card.id)
  );

  const meta = {
    syncedAt: new Date().toISOString(),
    variants: Array.isArray(combos) ? combos.length : 0,
    cards: uniqueCardIds.size,
    // Additive keys only (getSpellbookMeta consumers read syncedAt/variants/cards).
    source: bulkInfo ? BULK_URL : BASE_URL,
    pageSize: PAGE_SIZE,
    delayMs: DELAY_MS,
    ...(bulkInfo ? { bulkTimestamp: bulkInfo.bulkTimestamp, bulkVersion: bulkInfo.bulkVersion } : {}),
  };

  await writeJson(META_FILE, meta, true);
  return meta;
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  let bulkInfo = null;
  if (!CARDS_ONLY) {
    if (PAGED) {
      await downloadVariants();
    } else {
      // BULK-FIRST: one CloudFront download gets the complete dataset in ~2 min. Any failure is
      // logged honestly and falls back to the legacy resumable paged crawl (which still checkpoints
      // per page), so a bulk outage can never make the sync WORSE than before.
      try {
        bulkInfo = await downloadVariantsBulk();
      } catch (err) {
        console.warn(`\nBulk export failed (${err.message}) — falling back to the paged crawl.`);
        await downloadVariants();
      }
    }
  }

  if (!COMBOS_ONLY) {
    await downloadCards();
  }

  const meta = await writeMeta(bulkInfo);
  console.log("\nDone.");
  console.log(`  Variants: ${meta.variants.toLocaleString()}`);
  console.log(`  Cards: ${meta.cards.toLocaleString()}`);
  console.log(`  Synced: ${meta.syncedAt}`);
}

main().catch(err => {
  console.error("\nSync failed:", err.message);
  const rateLimited = /^HTTP 429 after \d+ retries/.test(err.message);
  if (rateLimited && cardPagesSavedThisRun > 0) {
    console.error(`  Rate-limited after saving ${cardPagesSavedThisRun} page(s) this run; the next run resumes from the saved offset.`);
    process.exit(EXIT_RATE_LIMITED_WITH_PROGRESS);
  }
  process.exit(1);
});
