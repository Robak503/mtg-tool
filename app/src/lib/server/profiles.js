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
  existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync, cpSync, readdirSync,
} from "node:fs";
import crypto from "node:crypto";

import { appPath, profilesRegistryPath, isValidProfileId } from "./paths.js";

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
  "collection-roasts.json",
];

// Recovery/corruption backups the data routes write next to their files (via
// profilePath's pre-registry fallback). They use timestamped or variant names
// so they can't be enumerated — match them by pattern during migration so they
// follow their owner's data into the primary profile instead of being orphaned
// at the now-shadowed data root.
const RECOVERY_FILE_PATTERNS = [
  /^decks\.local\.broken-.*\.json$/,
  /^collection\.broken-.*\.json$/,
  /^chats\.local\.json\.corrupted$/,
];
const PER_PROFILE_DIRS = ["games", "backups", "learn-sessions"];

function dataRoot() {
  return appPath("data");
}
function profilesRoot() {
  return path.join(dataRoot(), "profiles");
}
function profileDir(id) {
  // Never path.join an id we didn't generate — a malformed id (only reachable
  // via a hand-edited registry) must not become a traversal write/delete.
  if (!isValidProfileId(id)) {
    const err = new Error(`Refusing to resolve a malformed profile id: ${id}`);
    err.code = "INVALID_PROFILE_ID";
    throw err;
  }
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
  // Write an empty deck file so the profile starts blank — a present-but-empty
  // file stops /api/decks from seeding it with the bundled starter library
  // (only a genuinely missing file gets seeded).
  writeFileSync(
    path.join(profileDir(id), "decks.local.json"),
    JSON.stringify({ version: 1, updatedAt: nowIso(), decks: [] }, null, 2),
  );
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
 * Best-effort removal of the legacy flat decks file. The migration splits it
 * into per-profile copies and deletes it, but on a real Windows install that
 * single delete can lose a race with a transient file lock (AV/indexer/the
 * just-closed session) and leave the original behind. It's inert once the
 * registry exists — profilePath() never reads it — but a stale copy can shadow
 * on a downgrade and confuses diagnostics. Re-attempting on each launch lets the
 * delete succeed once the transient lock clears.
 */
function cleanupLegacyFlatDecks() {
  const flat = path.join(dataRoot(), "decks.local.json");
  if (!existsSync(flat)) return;
  try {
    rmSync(flat, { force: true });
  } catch {
    /* still locked — retry on the next launch */
  }
}

/**
 * One-time migration: legacy flat data/ -> data/profiles/<id>/.
 * Idempotent: a no-op once data/profiles.json exists (beyond self-healing a
 * stale legacy flat decks file the original migration couldn't delete).
 *
 * - Groups existing decks by deck.memory.owner into one profile per owner.
 * - The "primary" profile (most decks; "Colton" wins ties when present) also
 *   inherits the ownerless data: collection, chats, games, backups.
 * - Backs the moved originals up to data/.pre-profiles-backup/ first.
 */
export function ensureMigrated() {
  if (existsSync(profilesRegistryPath())) {
    cleanupLegacyFlatDecks();
    return;
  }
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

  // Sweep any pre-migration recovery/corruption backups into the primary
  // profile too. They're created with timestamped/variant names so they can't
  // be listed in PER_PROFILE_FILES; pattern-match them off the data root so a
  // user can still recover a corrupted file after the layout changes underneath
  // them. Best-effort — never block the migration.
  try {
    for (const name of readdirSync(dataRoot())) {
      if (name === "profiles" || name === ".pre-profiles-backup") continue;
      if (RECOVERY_FILE_PATTERNS.some(re => re.test(name))) moveIntoPrimary(name);
    }
  } catch {
    /* advisory */
  }

  // The legacy flat decks file is now split; remove it so it can't shadow
  // (the backup retains it). profilePath() ignores it once the registry exists.
  // If a transient lock defeats this, the early-return self-heal above retries
  // on the next launch.
  cleanupLegacyFlatDecks();

  writeRegistry({ version: 1, profiles, activeProfileId: primaryId });
}
