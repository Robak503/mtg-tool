/**
 * copy-tauri-assets.cjs
 *
 * Runs after `next build` to prepare the .next/standalone directory for
 * Tauri bundling. Next.js standalone mode intentionally omits the static
 * and public directories so the Node server can be deployed anywhere.
 * This script copies them back so the bundled .exe serves everything
 * correctly from the resource directory.
 *
 * Run via: npm run build:tauri-standalone
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const STANDALONE = path.join(ROOT, ".next", "standalone");
const STATIC_SRC = path.join(ROOT, ".next", "static");
const STATIC_DST = path.join(STANDALONE, ".next", "static");
const PUBLIC_SRC = path.join(ROOT, "public");
const PUBLIC_DST = path.join(STANDALONE, "public");

function copyDir(src, dst) {
  if (!fs.existsSync(src)) {
    console.log(`  skip (not found): ${src}`);
    return;
  }
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

if (!fs.existsSync(STANDALONE)) {
  console.error("ERROR: .next/standalone not found. Did `next build` succeed?");
  process.exit(1);
}

console.log("Copying .next/static → .next/standalone/.next/static");
copyDir(STATIC_SRC, STATIC_DST);

console.log("Copying public/ → .next/standalone/public");
copyDir(PUBLIC_SRC, PUBLIC_DST);

console.log("Tauri asset copy done.");
