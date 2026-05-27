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

const BASE_URL = "https://backend.commanderspellbook.com";
const DATA_DIR = path.join(__dirname, "../data");
const COMBOS_FILE = path.join(DATA_DIR, "spellbook-combos.local.json");
const CARDS_FILE = path.join(DATA_DIR, "spellbook-cards.local.json");
const INDEX_FILE = path.join(DATA_DIR, "spellbook-index.local.json");
const META_FILE = path.join(DATA_DIR, "spellbook-meta.local.json");

const args = process.argv.slice(2);
const COMBOS_ONLY = args.includes("--combos-only");
const CARDS_ONLY = args.includes("--cards-only");
const FRESH = args.includes("--fresh");
const PAGE_SIZE = numberArg("--page-size", 100);
const DELAY_MS = numberArg("--delay-ms", CARDS_ONLY ? 1000 : 750);
const RETRY_LIMIT = numberArg("--retries", 10);
const REQUEST_TIMEOUT_MS = numberArg("--request-timeout-ms", 15000);

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
  await fs.writeFile(filePath, JSON.stringify(value, null, pretty ? 2 : 0));
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

async function writeMeta() {
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
    source: BASE_URL,
    pageSize: PAGE_SIZE,
    delayMs: DELAY_MS,
  };

  await writeJson(META_FILE, meta, true);
  return meta;
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  if (!CARDS_ONLY) {
    await downloadVariants();
  }

  if (!COMBOS_ONLY) {
    await downloadCards();
  }

  const meta = await writeMeta();
  console.log("\nDone.");
  console.log(`  Variants: ${meta.variants.toLocaleString()}`);
  console.log(`  Cards: ${meta.cards.toLocaleString()}`);
  console.log(`  Synced: ${meta.syncedAt}`);
}

main().catch(err => {
  console.error("\nSync failed:", err.message);
  process.exit(1);
});
