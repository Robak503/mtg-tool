/**
 * collectionStorage.js — single-writer read/write helper for collection.json.
 *
 * Why this exists: writes must be atomic (temp + rename) so partial writes
 * never leave a corrupt file. Routes that touch the collection MUST go
 * through writeCollectionAtomic — do not call fs.writeFile directly.
 *
 * Behaviors:
 *   - loadCollection() returns { collection, recoveryWarning }.
 *     - Missing file → empty collection, no warning.
 *     - Corrupted JSON → file backed up to collection.broken-<stamp>.json,
 *       empty collection returned, warning string surfaces in the UI.
 *     - version > CURRENT_VERSION → throws CollectionVersionMismatch
 *       (UI surfaces "newer file from a future MTG Tool — update").
 *   - writeCollectionAtomic(payload) writes via temp + rename. Refreshes
 *     updatedAt automatically. Normalizes shape (drops unknown top-level
 *     fields, defaults missing arrays).
 */

import fs from "node:fs/promises";
import path from "node:path";

import { dataDir, dataPath } from "./paths.js";

const COLLECTION_FILE_NAME = "collection.json";
export const CURRENT_VERSION = 1;

export class CollectionVersionMismatch extends Error {
  constructor(found, expected) {
    super(
      `Collection file version ${found} is newer than the supported ` +
      `version (${expected}). Update MTG Tool to read this file.`,
    );
    this.code = "COLLECTION_VERSION_MISMATCH";
    this.name = "CollectionVersionMismatch";
    this.found = found;
    this.expected = expected;
  }
}

export function emptyCollection() {
  return {
    version: CURRENT_VERSION,
    updatedAt: new Date().toISOString(),
    cards: [],
  };
}

function collectionFilePath() {
  return dataPath(COLLECTION_FILE_NAME);
}

function brokenBackupPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return dataPath(`collection.broken-${stamp}.json`);
}

export async function loadCollection() {
  const target = collectionFilePath();

  let raw;
  try {
    raw = await fs.readFile(target, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return { collection: emptyCollection(), recoveryWarning: null };
    }
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupted JSON. Back up the broken file and start empty so the user
    // can keep using the app instead of being stuck behind a parse error.
    const backup = brokenBackupPath();
    try {
      await fs.rename(target, backup);
    } catch {
      // If rename fails (permissions, file in use), leave the broken file
      // alone — the empty collection still loads.
    }
    return {
      collection: emptyCollection(),
      recoveryWarning:
        `collection.json was malformed and has been backed up to ` +
        `${path.basename(backup)}. Started with an empty collection.`,
    };
  }

  if (typeof parsed.version === "number" && parsed.version > CURRENT_VERSION) {
    throw new CollectionVersionMismatch(parsed.version, CURRENT_VERSION);
  }

  return {
    collection: {
      version: typeof parsed.version === "number" ? parsed.version : CURRENT_VERSION,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      cards: Array.isArray(parsed.cards) ? parsed.cards : [],
    },
    recoveryWarning: null,
  };
}

export async function writeCollectionAtomic(payload) {
  await fs.mkdir(dataDir(), { recursive: true });

  const normalized = {
    version: CURRENT_VERSION,
    updatedAt: new Date().toISOString(),
    cards: Array.isArray(payload?.cards) ? payload.cards : [],
  };

  const target = collectionFilePath();
  const tmp = `${target}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(normalized, null, 2), "utf8");
  await fs.rename(tmp, target);
  return normalized;
}
