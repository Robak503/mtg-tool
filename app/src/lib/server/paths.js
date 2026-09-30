/**
 * paths.js — centralized resolution of "where on disk does the app live?"
 *
 * Until now, every server-side file did `path.join(process.cwd(), "data", ...)`
 * and the parent-of-cwd `path.join(process.cwd(), "..", "mtg-judge", ...)`.
 * That broke as soon as we wanted to ship a desktop binary, because
 * process.cwd() inside a packaged desktop app points wherever the user
 * launched it from (Program Files, Desktop, anywhere). User data has to
 * live in a writable, user-specific location (%APPDATA%/MTG Tool/data/);
 * read-only bundled resources (the mtg-judge codex) need to live where
 * the binary unpacks them.
 *
 * This module is the one place that knows the answer.
 *
 * Resolution order:
 *
 *   APP_ROOT (writable, user-specific)
 *     1. process.env.MTG_APP_ROOT  ← the Tauri shell sets this (writable app data)
 *     2. process.cwd()             ← dev: cwd is app/, which has data/
 *
 *   MTG_JUDGE_DIR (read-only, bundled)
 *     1. process.env.MTG_JUDGE_DIR ← the Tauri shell sets this (bundled resources)
 *     2. path.join(process.cwd(), "..", "knowledge", "mtg-judge")  ← dev: repo root
 *
 * Tests are unaffected — they call process.chdir() to a tmp dir and the
 * env vars stay unset, so paths.js falls back to the cwd-based behavior
 * the routes had before.
 */

import path from "node:path";
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";

function detectAppRoot() {
  const envOverride = process.env.MTG_APP_ROOT;
  // TEST ISOLATION (GHOST-REGISTRY fix, 2026-07-10): under vitest, an MTG_APP_ROOT pointing at the
  // REAL install data root (the bundle id is unique to it) is a LEAKED env var, never a sandbox —
  // profile tests once ran against the live %APPDATA% registry this way (the "Bob"/"Newname"
  // pollution behind the ghost-profile incident). Fail LOUD so the leak is visible; tests that set
  // MTG_APP_ROOT to a tmp sandbox (gameLogStore, mulligan, paths.test) are untouched.
  if (process.env.VITEST && envOverride && /com\.colton\.mtg-tool/i.test(envOverride)) {
    throw new Error("Refusing to run tests against the REAL app data root (MTG_APP_ROOT leaked into a vitest run) — unset it or point it at a tmp sandbox.");
  }
  if (envOverride && envOverride.trim()) return envOverride;
  // PACKAGED-CONTEXT GUARD (GHOST-REGISTRY fix): MTG_REFERENCE_DIR is set ONLY by the Tauri shell's
  // spawn env (and by tests that sandbox via chdir — exempt under VITEST). If it's present but
  // MTG_APP_ROOT is missing, this node was spawned in a broken context (an updater-relaunch env
  // drop) — a silent cwd fallback would read/WRITE user data at an arbitrary directory (the
  // ghost-registry class). Fail LOUD instead; the placeholder surfaces the error.
  if (process.env.MTG_REFERENCE_DIR && !process.env.VITEST) {
    throw new Error("MTG_APP_ROOT is not set but MTG_REFERENCE_DIR is — refusing the cwd fallback in a packaged context (user data would resolve to an arbitrary directory).");
  }
  return process.cwd();
}

function detectMtgJudgeDir() {
  const envOverride = process.env.MTG_JUDGE_DIR;
  if (envOverride && envOverride.trim()) return envOverride;
  return path.join(process.cwd(), "..", "knowledge", "mtg-judge");
}

function detectMtgEngineDir() {
  const envOverride = process.env.MTG_ENGINE_DIR;
  if (envOverride && envOverride.trim()) return envOverride;
  return path.join(process.cwd(), "..", "knowledge", "mtg-engine");
}

/**
 * Reference data dir — read-only bundled snapshot of Scryfall/Spellbook/
 * EDHREC/etc. data. The Tauri shell sets MTG_REFERENCE_DIR to the
 * resources/data folder. In dev this stays unset and we just fall back
 * to the regular dataPath resolution (since dev tree already has the
 * same files there).
 */
function detectReferenceDir() {
  const envOverride = process.env.MTG_REFERENCE_DIR;
  if (envOverride && envOverride.trim()) return envOverride;
  return null;
}

/**
 * Lazy resolution — computed on every call so tests that call
 * process.chdir() between cases pick up the new cwd. Production cost
 * is one path.join per call which is negligible compared to the disk
 * I/O each route does on the result.
 */
export function appRoot() {
  return detectAppRoot();
}

export function dataDir() {
  return path.join(detectAppRoot(), "data");
}

export function mtgJudgeDir() {
  return detectMtgJudgeDir();
}

/** Resolve a path relative to the app root (typically inside data/). */
export function appPath(...parts) {
  return path.join(detectAppRoot(), ...parts);
}

/* ──────────────────────────────────────────────────────────────────────────
   REFERENCE DATA FRESHNESS (2026-09-29). An in-app sync writes a copy of the
   reference data into appRoot/data, and until this rule that copy won every
   read forever — so each newer bundle an app update brought was shadowed
   (found live: the v0.160.0 app on the build box read its 2026-07-19 sync for
   72 days). Now, for the reference GROUPS below only, a bundled copy whose
   group stamp is STRICTLY newer than the synced copy's is read instead. A
   group decides as one unit (an index never mixes with another generation's
   bulk). Ties, missing stamps, and every file outside these groups — user
   data such as price history, play hints, caches, logs — keep the writable
   copy. Writes are unaffected: every sync script writes appRoot/data itself.
   ────────────────────────────────────────────────────────────────────────── */

const REFERENCE_GROUPS = [
  {
    key: "scryfall-bulk",
    owns: (p) => p.length >= 2 && p[0] === "scryfall-bulk",
    stamp: ["scryfall-bulk", "manifest.json"],
    field: "generatedAt",
  },
  {
    key: "spellbook",
    owns: (p) => p.length === 1 && /^spellbook-(combos|index|cards|meta)\.local\.json$/.test(p[0]),
    stamp: ["spellbook-meta.local.json"],
    field: "syncedAt",
  },
  {
    key: "edhrec-salt",
    owns: (p) => p.length === 1 && /^edhrec-salt(-meta)?\.local\.json$/.test(p[0]),
    stamp: ["edhrec-salt-meta.local.json"],
    field: "syncedAt",
  },
  {
    key: "cardkingdom-prices",
    owns: (p) => p.length === 1 && p[0] === "cardkingdom-prices.json",
    stamp: ["cardkingdom-prices.json"],
    field: "generatedAt",
  },
  {
    // A bare JSON array — no embedded stamp; the file's mtime is its build time
    // (the same source /api/sync-data reports for it).
    key: "rules-index",
    owns: (p) => p.length === 1 && p[0] === "rules-index.json",
    stamp: ["rules-index.json"],
    field: null,
  },
];

// Every group's stamp field sits at the top of its file — the head is enough.
const STAMP_HEAD_BYTES = 8192;
const STAMP_RES = {
  generatedAt: /"generatedAt"\s*:\s*"([^"]+)"/,
  syncedAt: /"syncedAt"\s*:\s*"([^"]+)"/,
};
// Stamp cache keyed by file, invalidated by the file's own (mtime, size) — a
// sync that rewrites a stamp file is picked up on the next read.
const stampCache = new Map();
const announcedBundleWins = new Set();

/** "a/b.json" and ("a", "b.json") name the same file — compare the segments. */
function segmentsOf(parts) {
  return parts.flatMap((p) => String(p).split(/[\\/]+/)).filter(Boolean);
}

/**
 * The group stamp of one copy, in epoch ms: the embedded ISO timestamp when the
 * field is present and parses, else the stamp file's mtime. null = the stamp
 * file doesn't exist (or can't be read — reported, and treated as unprovable).
 */
function readStampMs(file, field) {
  let st;
  try {
    st = statSync(file);
  } catch (e) {
    if (e.code === "ENOENT") return null;
    console.warn(`[paths] cannot stat reference stamp ${file}: ${e.message} — keeping the synced copy`);
    return null;
  }
  const hit = stampCache.get(file);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.ms;

  let ms = null;
  if (field) {
    let head = "";
    try {
      const fd = openSync(file, "r");
      try {
        const buf = Buffer.alloc(Math.min(STAMP_HEAD_BYTES, st.size));
        const n = readSync(fd, buf, 0, buf.length, 0);
        head = buf.toString("utf8", 0, n);
      } finally {
        closeSync(fd);
      }
    } catch (e) {
      console.warn(`[paths] cannot read reference stamp ${file}: ${e.message} — using its mtime`);
    }
    const m = head.match(STAMP_RES[field]);
    const t = m ? Date.parse(m[1]) : NaN;
    if (Number.isFinite(t)) ms = t;
  }
  if (ms === null) ms = st.mtimeMs;
  stampCache.set(file, { mtimeMs: st.mtimeMs, size: st.size, ms });
  return ms;
}

/**
 * True when `segs` belongs to a reference group AND the bundle's group stamp is
 * strictly newer than the synced copy's. Anything unprovable → false (the synced
 * copy keeps winning, exactly as before this rule existed).
 */
function bundleIsNewer(segs, dataRoot, refDir) {
  const group = REFERENCE_GROUPS.find((g) => g.owns(segs));
  if (!group) return false;
  const liveMs = readStampMs(path.join(dataRoot, ...group.stamp), group.field);
  if (liveMs === null) return false;
  const bundledMs = readStampMs(path.join(refDir, ...group.stamp), group.field);
  if (bundledMs === null) return false;
  if (!(bundledMs > liveMs)) return false;
  if (!announcedBundleWins.has(group.key)) {
    announcedBundleWins.add(group.key);
    console.info(
      `[paths] reference data "${group.key}": the bundled copy (${new Date(bundledMs).toISOString()}) is newer ` +
        `than the synced copy (${new Date(liveMs).toISOString()}) — reading the bundle until the next sync.`,
    );
  }
  return true;
}

/**
 * Resolve a path inside the data directory.
 *
 * Read-or-write semantics:
 *   - For files that should be written (decks.local.json, chats, feedback,
 *     telemetry, etc.) the appRoot/data location is always correct.
 *   - For files that are read-only reference data (Scryfall bulk,
 *     Spellbook, EDHREC salt, rules-index, oracle-index, legacy *.local
 *     formats) the caller can let dataPath fall back to the bundled
 *     MTG_REFERENCE_DIR if the file isn't in appRoot/data yet.
 *
 * The fallback triggers when the appRoot copy is missing AND a file with
 * the same relative path exists under MTG_REFERENCE_DIR — or, for the
 * REFERENCE_GROUPS above, when both copies exist and the bundled group is
 * strictly newer (an app update brought fresher data than the last sync).
 * An in-app sync that writes to appRoot/data takes precedence again from
 * then on, because its stamp is newer. In dev (no MTG_REFERENCE_DIR),
 * behavior is unchanged: it always returns the appRoot/data path.
 */
export function dataPath(...parts) {
  const dataRoot = path.join(detectAppRoot(), "data");
  const live = path.join(dataRoot, ...parts);
  const refDir = detectReferenceDir();
  if (!refDir) return live;
  const bundled = path.join(refDir, ...parts);
  if (!existsSync(live)) return existsSync(bundled) ? bundled : live;
  if (existsSync(bundled) && bundleIsNewer(segmentsOf(parts), dataRoot, refDir)) return bundled;
  return live;
}

/**
 * Which copy dataPath(...parts) reads: "bundle" (the read-only MTG_REFERENCE_DIR
 * snapshot) or "appdata" (the writable data root). /api/sync-data reports it so
 * the Updates panel — and a debugging seat — can see which copy is live.
 */
export function dataPathSource(...parts) {
  const refDir = detectReferenceDir();
  if (!refDir) return "appdata";
  return dataPath(...parts) === path.join(refDir, ...parts) ? "bundle" : "appdata";
}

/* ──────────────────────────────────────────────────────────────────────────
   Local profiles (multi-user). Each profile owns a private data namespace under
   data/profiles/<id>/ for the writable user data (decks, chats, collection,
   games). Reference data (Scryfall/rules/spellbook) stays at the data/ root and
   is shared across profiles — keep using dataPath() for those.

   The active profile is a pointer in data/profiles.json (the registry). paths.js
   only READS it; profiles.js owns writes + migration. profilePath() falls back
   to the legacy flat data/ location when no registry exists yet, so the app
   still works in the brief window before first-run migration runs.
   ────────────────────────────────────────────────────────────────────────── */

/** Path to the profiles registry (global, one per install). */
export function profilesRegistryPath() {
  return path.join(detectAppRoot(), "data", "profiles.json");
}

function readRegistrySafe() {
  try {
    const p = profilesRegistryPath();
    if (!existsSync(p)) return null;
    const reg = JSON.parse(readFileSync(p, "utf8"));
    if (!reg || !Array.isArray(reg.profiles) || reg.profiles.length === 0) return null;
    return reg;
  } catch {
    return null;
  }
}

// Profile ids are always server-generated as prof_<uuid v4>. Validate the shape
// before any id reaches path.join(), so a hand-tampered data/profiles.json can
// never turn the active-profile pointer into a path-traversal read/write/delete.
// Defense in depth: no API path can set an arbitrary id (createProfile generates
// it; the mutating routes reject ids not already in the registry) — this guards
// the one remaining vector, a locally-edited registry file.
const VALID_PROFILE_ID = /^prof_[0-9a-f-]{36}$/;

export function isValidProfileId(id) {
  return typeof id === "string" && VALID_PROFILE_ID.test(id);
}

/**
 * Id of the active profile, or null when no registry exists yet (pre-migration).
 * Falls back to the first profile if the stored activeProfileId is stale. Any
 * id that doesn't match the server-generated shape is rejected (returns null →
 * legacy flat path) rather than trusted into a file path.
 */
export function activeProfileId() {
  const reg = readRegistrySafe();
  if (!reg) return null;
  if (
    reg.activeProfileId &&
    isValidProfileId(reg.activeProfileId) &&
    reg.profiles.some(p => p.id === reg.activeProfileId)
  ) {
    return reg.activeProfileId;
  }
  const first = reg.profiles[0]?.id;
  return isValidProfileId(first) ? first : null;
}

/**
 * Resolve a path inside the active profile's data namespace. Before the
 * registry exists, falls back to the legacy flat data/ location so reads keep
 * working until migration moves the files under profiles/<id>/.
 */
export function profilePath(...parts) {
  const id = activeProfileId();
  if (id) return path.join(detectAppRoot(), "data", "profiles", id, ...parts);
  return path.join(detectAppRoot(), "data", ...parts);
}

/**
 * The writable PILOTS directory — where Omnath's persona modules (self-play `decide`/`buildPilots` .mjs files)
 * live so they can be injected into a Sim Center batch WITHOUT a rebuild (drop a file, it appears in the panel).
 * Global (not per-profile). In the packaged .exe this is %APPDATA%/com.colton.mtg-tool/pilots/. The route
 * dynamic-imports a selected file from here server-side (path-guarded to a bare .mjs filename).
 */
export function pilotsDir(...parts) {
  return path.join(detectAppRoot(), "pilots", ...parts);
}

/** Resolve a path inside the mtg-judge codex directory. */
export function mtgJudgePath(...parts) {
  return path.join(detectMtgJudgeDir(), ...parts);
}

export function mtgEngineDir() {
  return detectMtgEngineDir();
}

/** Resolve a path inside the mtg-engine rule-layer directory. */
export function mtgEnginePath(...parts) {
  return path.join(detectMtgEngineDir(), ...parts);
}
