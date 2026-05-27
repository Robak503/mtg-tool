export const runtime = "nodejs";

import fs from "node:fs/promises";
import path from "node:path";

const APP_ROOT = process.cwd();
const TOOL_ROOT = path.resolve(APP_ROOT, "..");
const SCRYFALL_ROOT = path.join(APP_ROOT, "data", "scryfall-bulk");
const MANIFEST_PATH = path.join(SCRYFALL_ROOT, "tier-manifest.json");
const ORACLE_PATH = path.join(SCRYFALL_ROOT, "oracle_cards.json");
const RULINGS_PATH = path.join(SCRYFALL_ROOT, "rulings.json");
const CR_PATH = path.join(TOOL_ROOT, "mtg-judge", "data", "cr", "cr_current.json");
const SPELLBOOK_META_PATH = path.join(APP_ROOT, "data", "spellbook-meta.local.json");
const SALT_META_PATH = path.join(APP_ROOT, "data", "edhrec-salt-meta.local.json");

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
// Models that need to be present for the app to work correctly.
const REQUIRED_MODELS = [
  process.env.OLLAMA_AGENT_MODEL || "qwen2.5:14b",
  process.env.OLLAMA_MODEL || "qwen2.5:32b",
];

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function fileFingerprint(file, label) {
  try {
    const stat = await fs.stat(file);
    return {
      label,
      path: path.relative(TOOL_ROOT, file).replace(/\\/g, "/"),
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      version: `${label}:${stat.size}:${Math.floor(stat.mtimeMs)}`,
    };
  } catch {
    return {
      label,
      path: path.relative(TOOL_ROOT, file).replace(/\\/g, "/"),
      missing: true,
      version: `${label}:missing`,
    };
  }
}

function staleDays(syncedAt) {
  if (!syncedAt) return null;
  const diffMs = Date.now() - new Date(syncedAt).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

async function checkOllama() {
  const baseUrl = (process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, "");
  try {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 3000);
    const resp = await fetch(`${baseUrl}/api/tags`, { signal: ac.signal }).finally(() => clearTimeout(tid));
    if (!resp.ok) return { available: false, models: [], missingModels: REQUIRED_MODELS };
    const data = await resp.json();
    const pulledNames = (data.models || []).map(m => String(m.name || "").split(":")[0] + ":" + (String(m.name || "").split(":")[1] || "latest"));
    const pulledSet = new Set((data.models || []).map(m => String(m.name || "")));
    const missingModels = REQUIRED_MODELS.filter(model => {
      // Accept exact match or base name match (qwen2.5:32b matches qwen2.5:32b-instruct-q4_k_m, etc.)
      const base = model.split(":")[0];
      return !pulledSet.has(model) && !pulledNames.some(n => n.startsWith(base + ":"));
    });
    return { available: true, models: pulledNames, missingModels };
  } catch {
    return { available: false, models: [], missingModels: REQUIRED_MODELS };
  }
}

export async function GET() {
  const [manifest, spellbookMeta, saltMeta] = await Promise.all([
    readJson(MANIFEST_PATH),
    readJson(SPELLBOOK_META_PATH),
    readJson(SALT_META_PATH),
  ]);

  const [oracle, rulings, rules, ollama] = await Promise.all([
    fileFingerprint(ORACLE_PATH, "scryfall-oracle"),
    fileFingerprint(RULINGS_PATH, "scryfall-rulings"),
    fileFingerprint(CR_PATH, "cr-current"),
    checkOllama(),
  ]);

  const spellbookStaleDays = staleDays(spellbookMeta?.syncedAt);
  const saltStaleDays = staleDays(saltMeta?.syncedAt);

  return Response.json({
    version: 1,
    generatedAt: new Date().toISOString(),
    manifestGeneratedAt: manifest?.generatedAt || null,
    cardDataVersion: [
      manifest?.generatedAt ? `manifest:${manifest.generatedAt}` : "manifest:unknown",
      oracle.version,
      rulings.version,
    ].join("|"),
    rulesVersion: rules.version,
    sources: { oracle, rulings, rules },
    spellbook: {
      ready: Boolean(spellbookMeta?.variants > 0),
      variants: spellbookMeta?.variants || 0,
      syncedAt: spellbookMeta?.syncedAt || null,
      staleDays: spellbookStaleDays,
      stale: spellbookStaleDays !== null && spellbookStaleDays > 30,
    },
    salt: {
      ready: Boolean(saltMeta?.count > 0),
      count: saltMeta?.count || 0,
      syncedAt: saltMeta?.syncedAt || null,
      staleDays: saltStaleDays,
      stale: saltStaleDays !== null && saltStaleDays > 30,
    },
    ollama: ollama,
  });
}
