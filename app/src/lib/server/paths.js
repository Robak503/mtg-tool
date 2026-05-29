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
 *     2. path.join(process.cwd(), "..", "mtg-judge")  ← dev: repo root sibling
 *
 * Tests are unaffected — they call process.chdir() to a tmp dir and the
 * env vars stay unset, so paths.js falls back to the cwd-based behavior
 * the routes had before.
 */

import path from "node:path";
import { existsSync } from "node:fs";

function detectAppRoot() {
  const envOverride = process.env.MTG_APP_ROOT;
  if (envOverride && envOverride.trim()) return envOverride;
  return process.cwd();
}

function detectMtgJudgeDir() {
  const envOverride = process.env.MTG_JUDGE_DIR;
  if (envOverride && envOverride.trim()) return envOverride;
  return path.join(process.cwd(), "..", "mtg-judge");
}

function detectMtgEngineDir() {
  const envOverride = process.env.MTG_ENGINE_DIR;
  if (envOverride && envOverride.trim()) return envOverride;
  return path.join(process.cwd(), "..", "MTG ENGINE");
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
 * The fallback only triggers when the appRoot copy is missing AND a
 * file with the same relative path exists under MTG_REFERENCE_DIR.
 * That means an in-app data refresh that writes to appRoot/data
 * transparently takes precedence going forward — no need to delete
 * the bundled snapshot. In dev (no MTG_REFERENCE_DIR), behavior is
 * unchanged: it always returns the appRoot/data path.
 */
export function dataPath(...parts) {
  const live = path.join(detectAppRoot(), "data", ...parts);
  const refDir = detectReferenceDir();
  if (refDir && !existsSync(live)) {
    const bundled = path.join(refDir, ...parts);
    if (existsSync(bundled)) return bundled;
  }
  return live;
}

/** Resolve a path inside the mtg-judge codex directory. */
export function mtgJudgePath(...parts) {
  return path.join(detectMtgJudgeDir(), ...parts);
}

export function mtgEngineDir() {
  return detectMtgEngineDir();
}

/** Resolve a path inside the MTG ENGINE directory. */
export function mtgEnginePath(...parts) {
  return path.join(detectMtgEngineDir(), ...parts);
}
