/**
 * paths.js — centralized resolution of "where on disk does the app live?"
 *
 * Until now, every server-side file did `path.join(process.cwd(), "data", ...)`
 * and the parent-of-cwd `path.join(process.cwd(), "..", "mtg-judge", ...)`.
 * That broke as soon as we wanted to ship a desktop binary, because
 * process.cwd() inside a packaged Electron app points wherever the user
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
 *     1. process.env.MTG_APP_ROOT  ← Electron main sets this to userData
 *     2. process.cwd()             ← dev: cwd is app/, which has data/
 *
 *   MTG_JUDGE_DIR (read-only, bundled)
 *     1. process.env.MTG_JUDGE_DIR ← Electron main sets this to extraResources
 *     2. path.join(process.cwd(), "..", "mtg-judge")  ← dev: repo root sibling
 *
 * Tests are unaffected — they call process.chdir() to a tmp dir and the
 * env vars stay unset, so paths.js falls back to the cwd-based behavior
 * the routes had before.
 */

import path from "node:path";

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

/** Resolve a path inside the data directory. */
export function dataPath(...parts) {
  return path.join(detectAppRoot(), "data", ...parts);
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
