import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeName } from "./cardIndex.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../../data");
const SALT_FILE = path.join(DATA_DIR, "edhrec-salt.local.json");
const META_FILE = path.join(DATA_DIR, "edhrec-salt-meta.local.json");

let saltIndex = null;
let saltMeta = null;
let attempted = false;

function loadSaltData() {
  if (attempted) return Boolean(saltIndex);
  attempted = true;

  if (!fs.existsSync(SALT_FILE)) return false;

  const entries = JSON.parse(fs.readFileSync(SALT_FILE, "utf8"));
  const byName = new Map();
  for (const entry of entries) {
    const names = [entry.name, ...(entry.names || [])].filter(Boolean);
    for (const name of names) byName.set(normalizeName(name), entry);
  }

  saltIndex = { entries, byName };
  if (fs.existsSync(META_FILE)) {
    saltMeta = JSON.parse(fs.readFileSync(META_FILE, "utf8"));
  }
  return true;
}

export function edhrecSaltReady() {
  return loadSaltData();
}

export function getEdhrecSaltMeta() {
  loadSaltData();
  return saltMeta;
}

export function lookupSalt(name) {
  if (!loadSaltData()) return null;
  return saltIndex.byName.get(normalizeName(name)) || null;
}

export function evaluateDeckSalt(cardNames = []) {
  if (!loadSaltData()) {
    return {
      ready: false,
      count: 0,
      sum: 0,
      average: 0,
      topCards: [],
      meta: null,
    };
  }

  const seen = new Set();
  const hits = [];
  for (const name of cardNames) {
    const key = normalizeName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const entry = lookupSalt(name);
    if (!entry || !Number.isFinite(entry.salt)) continue;
    hits.push({
      name: entry.name,
      salt: Math.round(entry.salt * 100) / 100,
      rank: entry.rank,
      numDecks: entry.numDecks,
    });
  }

  hits.sort((a, b) => b.salt - a.salt || a.rank - b.rank);
  const sum = hits.reduce((total, entry) => total + entry.salt, 0);
  return {
    ready: true,
    count: hits.length,
    sum: Math.round(sum * 10) / 10,
    average: hits.length ? Math.round((sum / hits.length) * 100) / 100 : 0,
    topCards: hits.slice(0, 10),
    meta: saltMeta,
  };
}
