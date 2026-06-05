/**
 * profiles.js — local multi-user profiles (server side).
 *
 * Owns the profiles registry (data/profiles.json) and the one-time migration
 * that splits the legacy single-user data into per-profile namespaces. paths.js
 * only READS the active-profile pointer; all writes live here.
 *
 * Storage:
 *   data/profiles.json                 registry { version, profiles[], activeProfileId }
 *   data/profiles/<id>/                 one folder per profile (writable user data)
 *
 * Local-first: a profile is just a data folder. No cloud, no auth, no passwords.
 */
import path from "node:path";
import {
  existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync, cpSync,
} from "node:fs";
import crypto from "node:crypto";

import { appPath, profilesRegistryPath } from "./paths.js";

// Writable user data that belongs to a single profile. Reference data
// (scryfall*, spellbook-*, edhrec-salt*, rules-index, scryfall-bulk) and
// machine-wide files (model-calls, feedback) deliberately stay at the data root.
const PER_PROFILE_FILES = [
  "decks.local.json",
  "chats.local.json",
  "chats.local.json.v1.bak",
  "collection.json",
  "collection-prices.jsonl",
  "watchlist.json",
  "price-alerts.json",
  "agent-notes.local.json",
];
const PER_PROFILE_DIRS = ["games", "backups"];

function dataRoot() {
  return appPath("data");
}
function profilesRoot() {
  return path.join(dataRoot(), "profiles");
}
function profileDir(id) {
  return path.join(profilesRoot(), id);
}
function nowIso() {
  return new Date().toISOString();
}
function newId() {
  return `prof_${crypto.randomUUID()}`;
}

export function readRegistry() {
  const p = profilesRegistryPath();
  if (!existsSync(p)) return null;
  try {
    const reg = JSON.parse(readFileSync(p, "utf8"));
    if (!reg || !Array.isArray(reg.profiles)) return null;
    return reg;
  } catch {
    return null;
  }
}

function writeRegistry(reg) {
  mkdirSync(dataRoot(), { recursive: true });
  writeFileSync(profilesRegistryPath(), JSON.stringify(reg, null, 2));
}

/** List profiles (running migration first if needed). */
export function listProfiles() {
  ensureMigrated();
  const reg = readRegistry();
  return { profiles: reg.profiles, activeProfileId: reg.activeProfileId };
}

export function createProfile(name) {
  ensureMigrated();
  const reg = readRegistry();
  const clean = (name || "").trim() || "New profile";
  const id = newId();
  mkdirSync(profileDir(id), { recursive: true });
  const profile = { id, name: clean, createdAt: nowIso() };
  reg.profiles.push(profile);
  writeRegistry(reg);
  return profile;
}

export function setActiveProfile(id) {
  ensureMigrated();
  const reg = readRegistry();
  if (!reg.profiles.some(p => p.id === id)) {
    const err = new Error("Unknown profile");
    err.code = "UNKNOWN_PROFILE";
    throw err;
  }
  reg.activeProfileId = id;
  writeRegistry(reg);
  return { activeProfileId: id };
}

export function renameProfile(id, name) {
  ensureMigrated();
  const reg = readRegistry();
  const profile = reg.profiles.find(p => p.id === id);
  if (!profile) {
    const err = new Error("Unknown profile");
    err.code = "UNKNOWN_PROFILE";
    throw err;
  }
  const clean = (name || "").trim();
  if (clean) profile.name = clean;
  writeRegistry(reg);
  return profile;
}

export function deleteProfile(id) {
  ensureMigrated();
  const reg = readRegistry();
  if (reg.profiles.length <= 1) {
    const err = new Error("Cannot delete the last profile");
    err.code = "LAST_PROFILE";
    throw err;
  }
  if (!reg.profiles.some(p => p.id === id)) {
    const err = new Error("Unknown profile");
    err.code = "UNKNOWN_PROFILE";
    throw err;
  }
  reg.profiles = reg.profiles.filter(p => p.id !== id);
  if (reg.activeProfileId === id) reg.activeProfileId = reg.profiles[0].id;
  writeRegistry(reg);
  rmSync(profileDir(id), { recursive: true, force: true });
  return { activeProfileId: reg.activeProfileId };
}

function readDecksFile() {
  const p = path.join(dataRoot(), "decks.local.json");
  if (!existsSync(p)) return null;
  try {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    if (Array.isArray(raw)) return { version: 1, updatedAt: nowIso(), decks: raw };
    if (Array.isArray(raw.decks)) return raw;
    return null;
  } catch {
    return null;
  }
}

const ownerOf = (deck) => ((deck && deck.memory && deck.memory.owner) || (deck && deck.owner) || "").trim();

/**
 * One-time migration: legacy flat data/ -> data/profiles/<id>/.
 * Idempotent: a no-op once data/profiles.json exists.
 *
 * - Groups existing decks by deck.memory.owner into one profile per owner.
 * - The "primary" profile (most decks; "Colton" wins ties when present) also
 *   inherits the ownerless data: collection, chats, games, backups.
 * - Backs the moved originals up to data/.pre-profiles-backup/ first.
 */
export function ensureMigrated() {
  if (existsSync(profilesRegistryPath())) return;
  mkdirSync(profilesRoot(), { recursive: true });

  const decksFile = readDecksFile();
  const decks = decksFile ? decksFile.decks : [];

  // Distinct owners (blank owners collapse into the primary later).
  const owners = [...new Set(decks.map(ownerOf).filter(Boolean))];

  // Decide primary owner: prefer "Colton", else the owner with the most decks,
  // else a single "Player 1" when there is no data at all.
  const countByOwner = {};
  for (const d of decks) {
    const o = ownerOf(d) || "__ownerless__";
    countByOwner[o] = (countByOwner[o] || 0) + 1;
  }
  let primaryName;
  if (owners.includes("Colton")) primaryName = "Colton";
  else if (owners.length) primaryName = owners.slice().sort((a, b) => (countByOwner[b] || 0) - (countByOwner[a] || 0))[0];
  else primaryName = "Player 1";

  // Ensure the primary is in the profile set even if it had zero owned decks.
  const profileNames = owners.length ? [...new Set([primaryName, ...owners])] : [primaryName];

  // Build profiles with stable ids.
  const profiles = profileNames.map(name => ({ id: newId(), name, createdAt: nowIso() }));
  const idByName = Object.fromEntries(profiles.map(p => [p.name, p.id]));
  const primaryId = idByName[primaryName];

  // Back up the originals before we move anything (best-effort, never blocks).
  const backupDir = path.join(dataRoot(), ".pre-profiles-backup");
  try {
    mkdirSync(backupDir, { recursive: true });
    for (const f of [...PER_PROFILE_FILES, ...PER_PROFILE_DIRS]) {
      const src = path.join(dataRoot(), f);
      if (existsSync(src)) cpSync(src, path.join(backupDir, f), { recursive: true });
    }
  } catch {
    /* backup is advisory */
  }

  // Create each profile folder and write its decks file (ownerless -> primary).
  for (const p of profiles) mkdirSync(profileDir(p.id), { recursive: true });
  const decksByProfile = {};
  for (const p of profiles) decksByProfile[p.id] = [];
  for (const deck of decks) {
    const o = ownerOf(deck);
    const targetId = (o && idByName[o]) || primaryId;
    decksByProfile[targetId].push(deck);
  }
  for (const p of profiles) {
    writeFileSync(
      path.join(profileDir(p.id), "decks.local.json"),
      JSON.stringify({ version: decksFile?.version || 1, updatedAt: nowIso(), decks: decksByProfile[p.id] }, null, 2),
    );
  }

  // Move ownerless writable data into the primary profile.
  const moveIntoPrimary = (name) => {
    const src = path.join(dataRoot(), name);
    if (!existsSync(src)) return;
    const dest = path.join(profileDir(primaryId), name);
    try {
      renameSync(src, dest);
    } catch {
      // Cross-device or locked file: fall back to copy + remove.
      try {
        cpSync(src, dest, { recursive: true });
        rmSync(src, { recursive: true, force: true });
      } catch {
        /* leave the original in place; backup still exists */
      }
    }
  };
  // Everything except the decks file (which was split by owner above) plus the
  // per-profile dirs goes to the primary profile.
  const ownerlessFiles = PER_PROFILE_FILES.filter(f => f !== "decks.local.json");
  for (const f of [...ownerlessFiles, ...PER_PROFILE_DIRS]) {
    moveIntoPrimary(f);
  }

  // The legacy flat decks file is now split; remove it so it can't shadow
  // (the backup retains it). profilePath() ignores it once the registry exists.
  try {
    rmSync(path.join(dataRoot(), "decks.local.json"), { force: true });
  } catch {
    /* non-fatal */
  }

  writeRegistry({ version: 1, profiles, activeProfileId: primaryId });
}
