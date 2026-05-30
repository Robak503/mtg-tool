/**
 * strip-standalone-bloat.cjs
 *
 * Next.js standalone output traces references to local files and copies
 * them into .next/standalone/. In this project that pulls in the entire
 * data/ tree — including all_cards.json (2.4GB), default_cards.json
 * (514MB), and other Scryfall bulk files — even with
 * outputFileTracingExcludes configured. (The exclude option doesn't
 * always cover everything @vercel/nft picks up.)
 *
 * None of those files belong in the production .exe bundle:
 *   - Bulk Scryfall data is gitignored and refreshed via npm scripts.
 *   - User data (decks/chats/feedback) lives in %APPDATA% at runtime.
 *   - The slim oracle-index.json is staged separately into resources/.
 *
 * This script removes the entire .next/standalone/data/ directory after
 * `next build`. The Tauri Rust shell sets MTG_APP_ROOT/MTG_JUDGE_DIR/
 * MTG_ENGINE_DIR env vars (see paths.js) so the server never tries to
 * read from .next/standalone/data/ at runtime.
 *
 * Run via: npm run build:tauri-standalone
 */

"use strict";

const fs = require("fs");
const path = require("path");

const APP_ROOT = path.resolve(__dirname, "..");
const STANDALONE = path.join(APP_ROOT, ".next", "standalone");
const TARGETS = [
  path.join(STANDALONE, "data"),
  path.join(STANDALONE, "knowledge"),
];

if (!fs.existsSync(STANDALONE)) {
  console.error("ERROR: .next/standalone not found. Did `next build` run?");
  process.exit(1);
}

for (const dir of TARGETS) {
  if (fs.existsSync(dir)) {
    const sizeMB = dirSizeMB(dir);
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`Stripped ${path.relative(APP_ROOT, dir)} (${sizeMB} MB)`);
  }
}

function dirSizeMB(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += bytesIn(p);
    } else {
      try {
        total += fs.statSync(p).size;
      } catch {}
    }
  }
  return (total / 1024 / 1024).toFixed(1);
}

function bytesIn(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) total += bytesIn(p);
    else {
      try {
        total += fs.statSync(p).size;
      } catch {}
    }
  }
  return total;
}
