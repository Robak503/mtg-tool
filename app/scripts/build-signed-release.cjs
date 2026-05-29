/**
 * build-signed-release.cjs
 *
 * Wrapper around `npx tauri build` that enables the auto-updater
 * artifact (signed .sig file) and loads the signing key + password
 * from ~/.tauri/mtg-tool.{key,password} so we don't have to remember
 * to export env vars before every release build.
 *
 * Usage:
 *   npm run tauri:build:release        (signs and bundles)
 *
 * Generate the key once with:
 *   npx tauri signer generate -w ~/.tauri/mtg-tool.key --password <pw>
 *
 * The default `npm run tauri:build` produces unsigned bundles (no
 * .sig file). That's fine for local testing; only releases shipped via
 * the GitHub Actions workflow need to be signed.
 *
 * CI uses the same code path but sources the secrets from the
 * environment (TAURI_SIGNING_PRIVATE_KEY / _PASSWORD) instead of the
 * local key file.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");

const KEY_FILE = path.join(os.homedir(), ".tauri", "mtg-tool.key");
const PASS_FILE = path.join(os.homedir(), ".tauri", "mtg-tool.password");

function loadKeysFromHome() {
  const env = {};
  let keyFromEnv = false;
  if (process.env.TAURI_SIGNING_PRIVATE_KEY) {
    env.TAURI_SIGNING_PRIVATE_KEY = process.env.TAURI_SIGNING_PRIVATE_KEY;
    keyFromEnv = true;
  } else if (fs.existsSync(KEY_FILE)) {
    env.TAURI_SIGNING_PRIVATE_KEY = fs.readFileSync(KEY_FILE, "utf8");
  } else {
    console.error(`[build-signed-release] No private key found.`);
    console.error(`  - Set TAURI_SIGNING_PRIVATE_KEY in the environment, or`);
    console.error(`  - Place the key at ${KEY_FILE}`);
    console.error(`  - Generate one with: npx tauri signer generate -w ${KEY_FILE} --password <pw>`);
    process.exit(1);
  }

  if (process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD !== undefined) {
    env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD;
  } else if (fs.existsSync(PASS_FILE)) {
    env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = fs.readFileSync(PASS_FILE, "utf8");
  } else if (keyFromEnv) {
    // CI path: the key came from a secret but no password is provided. This
    // project's signing key is password-protected, so an empty password would
    // fail deep inside `tauri build` with an opaque minisign error. Fail fast
    // with a clear message instead of burning the whole build first.
    console.error("[build-signed-release] TAURI_SIGNING_PRIVATE_KEY is set but TAURI_SIGNING_PRIVATE_KEY_PASSWORD is not.");
    console.error("  Set the TAURI_SIGNING_PRIVATE_KEY_PASSWORD secret/env var (the signing key is password-protected).");
    process.exit(1);
  } else {
    // Local path: key file present, no password file. Allow an empty password
    // so a password-less key still works for local release testing.
    env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "";
  }

  return env;
}

const signingEnv = loadKeysFromHome();

console.log("[build-signed-release] Keys loaded — invoking `tauri build` with createUpdaterArtifacts=true");

// Override tauri.conf.json's createUpdaterArtifacts via --config flag
// for this one build only. The on-disk default stays false so unsigned
// dev builds keep working. Writing to a temp file (not passing JSON
// inline) sidesteps two cross-platform pain points: cmd.exe stripping
// quotes when shell:true is used to run npx.cmd, and quoting rules
// differing between pwsh / bash / cmd.
const overrideConfig = {
  bundle: { createUpdaterArtifacts: true },
};
const overridePath = path.join(os.tmpdir(), `tauri-release-config-${process.pid}.json`);
fs.writeFileSync(overridePath, JSON.stringify(overrideConfig));

const args = ["tauri", "build", "--config", overridePath];
// On Windows, npx is a .cmd shim — Node's spawn refuses to run .cmd
// files without shell:true. Setting shell:true makes spawn invoke
// cmd.exe under the hood, which handles the .cmd lookup correctly.
// Because the --config value is now a file path (no spaces, no quotes)
// the shell doesn't mangle anything.
const proc = spawn("npx", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, ...signingEnv },
});

proc.on("error", (err) => {
  try { fs.unlinkSync(overridePath); } catch {}
  console.error(`[build-signed-release] spawn error: ${err.message}`);
  process.exit(1);
});

proc.on("exit", (code) => {
  try { fs.unlinkSync(overridePath); } catch {}
  process.exit(code ?? 1);
});
