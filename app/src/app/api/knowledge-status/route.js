export const runtime = "nodejs";

import fs from "node:fs/promises";
import path from "node:path";
import { appRoot, dataPath, mtgJudgePath } from "../../../lib/server/paths";

// All paths resolve lazily via paths.js so the same code works whether
// cwd is the dev tree (`app/`) or the bundled Tauri standalone server
// (with MTG_APP_ROOT and MTG_JUDGE_DIR env vars set).
const MANIFEST_PATH = () => dataPath("scryfall-bulk", "tier-manifest.json");
const ORACLE_PATH = () => dataPath("scryfall-bulk", "oracle_cards.json");
const ORACLE_INDEX_PATH = () => dataPath("scryfall-bulk", "oracle-index.json");
const RULINGS_PATH = () => dataPath("scryfall-bulk", "rulings.json");
const CR_PATH = () => mtgJudgePath("data", "cr", "cr_current.json");
const SPELLBOOK_META_PATH = () => dataPath("spellbook-meta.local.json");
const SALT_META_PATH = () => dataPath("edhrec-salt-meta.local.json");

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

function displayPath(file) {
  // Show the path relative to the app root so the response stays useful
  // for both dev (cwd = app/) and the packaged .exe (where roots differ).
  // path.relative still returns an absolute path if `file` lives outside
  // appRoot — that's fine, it just doesn't get trimmed.
  return path.relative(appRoot(), file).replace(/\\/g, "/");
}

async function fileFingerprint(file, label) {
  try {
    const stat = await fs.stat(file);
    return {
      label,
      path: displayPath(file),
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      version: `${label}:${stat.size}:${Math.floor(stat.mtimeMs)}`,
    };
  } catch {
    return {
      label,
      path: displayPath(file),
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
    readJson(MANIFEST_PATH()),
    readJson(SPELLBOOK_META_PATH()),
    readJson(SALT_META_PATH()),
  ]);

  // The bundled .exe ships the slim oracle-index but not the bulk
  // oracle_cards.json; if the bulk file is missing, fall back to the
  // slim index for the fingerprint so the status banner doesn't scream
  // "missing" when the app is actually usable.
  let oracle = await fileFingerprint(ORACLE_PATH(), "scryfall-oracle");
  if (oracle.missing) {
    const slim = await fileFingerprint(ORACLE_INDEX_PATH(), "scryfall-oracle-index");
    if (!slim.missing) oracle = slim;
  }

  const [rulings, rules, ollama] = await Promise.all([
    fileFingerprint(RULINGS_PATH(), "scryfall-rulings"),
    fileFingerprint(CR_PATH(), "cr-current"),
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
