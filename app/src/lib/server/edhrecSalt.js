import fs from "node:fs";

import { normalizeName } from "./cardIndex.js";
import { dataPath } from "./paths.js";

let saltIndex = null;
let saltMeta = null;
let attempted = false;

function loadSaltData() {
  if (attempted) return Boolean(saltIndex);
  attempted = true;

  // Resolve here (not at import time) so dataPath's MTG_REFERENCE_DIR / AppData
  // fallback reflects the current on-disk state: an in-app sync that writes a
  // fresher copy to the writable data dir is picked up on first use, and the
  // packaged .exe no longer reads relative to the bundled source file.
  const saltFile = dataPath("edhrec-salt.local.json");
  const metaFile = dataPath("edhrec-salt-meta.local.json");

  if (!fs.existsSync(saltFile)) return false;

  const entries = JSON.parse(fs.readFileSync(saltFile, "utf8"));
  const byName = new Map();
  for (const entry of entries) {
    const names = [entry.name, ...(entry.names || [])].filter(Boolean);
    for (const name of names) byName.set(normalizeName(name), entry);
  }

  saltIndex = { entries, byName };
  if (fs.existsSync(metaFile)) {
    saltMeta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
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
