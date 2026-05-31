/**
 * /api/games — goldfish run history.
 *
 * POST  body { result }  →  data/games/{deckId}-{ISO-date}-{shortid}.json
 *                          One file per run, atomic write (.tmp + rename).
 * GET   ?deckId=...      →  { entries: [...], count }
 *                          When deckId is provided, only that deck's runs.
 *
 * Pruning: per-deck cap (MAX_GAMES_PER_DECK, default 200), global age cap
 * (MAX_GAMES_DAYS, default 365). Active learning data only — we don't keep
 * runs forever because the deck changes underneath them.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";
import path from "node:path";

import { dataPath } from "../../../lib/server/paths";
import { sanitiseId } from "../../../lib/server/sanitiseId.js";

const GAMES_DIR = dataPath("games");

function envNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
const MAX_GAMES_PER_DECK = envNumber("MAX_GAMES_PER_DECK", 200);
const MAX_GAMES_DAYS = envNumber("MAX_GAMES_DAYS", 365);

function generateShortId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(16).slice(2, 10);
}

function generateFilename(deckId, timestamp) {
  const safeTs = timestamp.replace(/:/g, "-").replace(/\..+Z$/, "Z");
  return `${sanitiseId(deckId)}-${safeTs}-${generateShortId()}.json`;
}

async function atomicWriteJson(filePath, payload) {
  const body = JSON.stringify(payload, null, 2);
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, filePath);
}

function isWithinAgeCap(entry) {
  if (MAX_GAMES_DAYS <= 0) return true;
  const t = Date.parse(entry?.savedAt || entry?.date);
  if (!Number.isFinite(t)) return true; // No date → don't prune.
  const cutoff = Date.now() - MAX_GAMES_DAYS * 86_400_000;
  return t >= cutoff;
}

async function pruneGames() {
  let files;
  try {
    files = await fs.readdir(GAMES_DIR);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  // Read all entries, group by deckId.
  const byDeck = new Map();
  for (const file of files) {
    if (!file.endsWith(".json") || file.endsWith(".tmp.json")) continue;
    const fullPath = path.join(GAMES_DIR, file);
    try {
      const raw = await fs.readFile(fullPath, "utf8");
      const parsed = JSON.parse(raw);
      const deckId = parsed?.deckId || "unknown";
      const list = byDeck.get(deckId) || [];
      list.push({ file, fullPath, entry: parsed });
      byDeck.set(deckId, list);
    } catch {
      // Skip unreadable.
    }
  }

  // Per-deck cap (newest first) + age cap.
  const deletions = [];
  for (const list of byDeck.values()) {
    list.sort((a, b) => String(b.entry?.savedAt || "").localeCompare(String(a.entry?.savedAt || "")));
    let kept = 0;
    for (const item of list) {
      const withinAge = isWithinAgeCap(item.entry);
      const withinCount = MAX_GAMES_PER_DECK <= 0 || kept < MAX_GAMES_PER_DECK;
      if (withinAge && withinCount) {
        kept += 1;
      } else {
        deletions.push(item.fullPath);
      }
    }
  }

  await Promise.all(deletions.map(p => fs.unlink(p).catch(() => {})));
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const result = body?.result;
  if (!result || typeof result !== "object") {
    return Response.json({ error: "Body must include a `result` object." }, { status: 400 });
  }
  if (typeof result.score !== "number") {
    return Response.json({ error: "result.score is required." }, { status: 400 });
  }

  const deckId = sanitiseId(result.deckId || "unknown");
  const savedAt = new Date().toISOString();
  const entry = { ...result, deckId, savedAt };

  try {
    await fs.mkdir(GAMES_DIR, { recursive: true });
    const filename = generateFilename(deckId, savedAt);
    const filePath = path.join(GAMES_DIR, filename);
    await atomicWriteJson(filePath, entry);
    // Prune in the background — don't make the response wait. If the prune
    // fails it's not user-visible, and the next save will try again.
    pruneGames().catch(() => {});
    return Response.json({ ok: true, filename, savedAt, deckId });
  } catch (error) {
    if (error.code === "ENOSPC") {
      return Response.json(
        { error: "Disk full — could not save game record." },
        { status: 507 }
      );
    }
    return Response.json(
      { error: error.message || "Could not save game record." },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  const url = new URL(request.url);
  const filterDeckId = url.searchParams.get("deckId");
  const sanitisedFilter = filterDeckId ? sanitiseId(filterDeckId) : null;
  const limit = Math.max(0, Math.min(500, Number(url.searchParams.get("limit")) || 50));

  let files;
  try {
    files = await fs.readdir(GAMES_DIR);
  } catch (error) {
    if (error.code === "ENOENT") return Response.json({ entries: [], count: 0 });
    return Response.json({ error: error.message }, { status: 500 });
  }

  const entries = [];
  for (const file of files) {
    if (!file.endsWith(".json") || file.endsWith(".tmp.json")) continue;
    try {
      const raw = await fs.readFile(path.join(GAMES_DIR, file), "utf8");
      const parsed = JSON.parse(raw);
      if (sanitisedFilter && parsed?.deckId !== sanitisedFilter) continue;
      entries.push({ filename: file, ...parsed });
    } catch {
      // Skip unreadable.
    }
  }

  entries.sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
  const limited = limit > 0 ? entries.slice(0, limit) : entries;

  return Response.json({ entries: limited, count: entries.length, returned: limited.length });
}
