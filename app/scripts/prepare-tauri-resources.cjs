/**
 * prepare-tauri-resources.cjs
 *
 * Builds src-tauri/resources/ — the clean staging directory that ships
 * inside the .exe bundle. Hand-picked because:
 *
 *   - mtg-judge/ contains a Forge git submodule (44MB) and a RulesGuru
 *     repo with node_modules (316MB) that we never read at runtime.
 *     The Forge .git/objects/pack/ files also cause "Access is denied"
 *     when Tauri's build.rs walks them for rerun-if-changed directives.
 *
 *   - MTG ENGINE/ contains stale scryfall_*.json (~46MB), the
 *     plaintext API-key remnant THE KEY.txt, and the DOCX comprehensive
 *     rules — none needed at runtime.
 *
 * What we keep:
 *   resources/mtg-judge/META_test_cases_rulesguru.md  (RulesGuru retrieval)
 *   resources/mtg-judge/data/cr/cr_current.json       (CR JSON, knowledge-status + engine)
 *   resources/MTG ENGINE/L*.md, META_*.md             (rules codex)
 *   resources/data/scryfall-bulk/oracle-index.json    (slim 29MB card index)
 *   resources/server/                                  (Next.js standalone, populated by copy-tauri-assets.cjs)
 *
 * Total expected: ~10MB for rules codex + ~29MB oracle index + standalone bundle.
 *
 * Run via: npm run build:tauri-standalone
 */

"use strict";

const fs = require("fs");
const path = require("path");

const APP_ROOT = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(APP_ROOT, "..");
const RESOURCES = path.join(APP_ROOT, "src-tauri", "resources");

function rmRf(p) {
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
  }
}

function mkdirP(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyFile(src, dst) {
  mkdirP(path.dirname(dst));
  fs.copyFileSync(src, dst);
}

function copyMatching(srcDir, dstDir, predicate) {
  if (!fs.existsSync(srcDir)) {
    console.warn(`  (missing source: ${srcDir})`);
    return 0;
  }
  mkdirP(dstDir);
  let count = 0;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.isFile() && predicate(entry.name)) {
      copyFile(path.join(srcDir, entry.name), path.join(dstDir, entry.name));
      count += 1;
    }
  }
  return count;
}

console.log(`Preparing ${RESOURCES}`);
rmRf(RESOURCES);
mkdirP(RESOURCES);

// 1. mtg-judge — only RulesGuru cases + the CR JSON.
console.log("Copying mtg-judge runtime files...");
const judgeDst = path.join(RESOURCES, "mtg-judge");
const rulesGuru = path.join(PROJECT_ROOT, "mtg-judge", "META_test_cases_rulesguru.md");
if (fs.existsSync(rulesGuru)) {
  copyFile(rulesGuru, path.join(judgeDst, "META_test_cases_rulesguru.md"));
  console.log("  + META_test_cases_rulesguru.md");
}
const crJson = path.join(PROJECT_ROOT, "mtg-judge", "data", "cr", "cr_current.json");
if (fs.existsSync(crJson)) {
  copyFile(crJson, path.join(judgeDst, "data", "cr", "cr_current.json"));
  console.log("  + data/cr/cr_current.json");
}

// 2. MTG ENGINE — keep only the markdown rule layers and META indexes.
console.log("Copying MTG ENGINE rule files...");
const engineSrc = path.join(PROJECT_ROOT, "MTG ENGINE");
const engineDst = path.join(RESOURCES, "MTG ENGINE");
const engineCount = copyMatching(engineSrc, engineDst, (name) => {
  if (!name.endsWith(".md")) return false;
  if (name.endsWith(".bak")) return false;
  return name.startsWith("L") || name.startsWith("META_");
});
console.log(`  + ${engineCount} markdown files`);

// 3. Slim Scryfall oracle index — runtime card lookups depend on it.
console.log("Copying slim oracle index...");
const oracleIdx = path.join(APP_ROOT, "data", "scryfall-bulk", "oracle-index.json");
if (fs.existsSync(oracleIdx)) {
  copyFile(
    oracleIdx,
    path.join(RESOURCES, "data", "scryfall-bulk", "oracle-index.json"),
  );
  console.log("  + data/scryfall-bulk/oracle-index.json");
} else {
  console.warn("  (oracle-index.json missing — run `npm run build:oracle-index` first)");
}

// 4. Next.js standalone server (populated by copy-tauri-assets.cjs which
// runs after `next build` in the build:tauri-standalone pipeline).
const standaloneSrc = path.join(APP_ROOT, ".next", "standalone");
const standaloneDst = path.join(RESOURCES, "server");
if (fs.existsSync(standaloneSrc)) {
  console.log("Copying .next/standalone → resources/server/");
  copyDirRecursive(standaloneSrc, standaloneDst);
}

console.log(`Done. Staged at ${RESOURCES}`);

function copyDirRecursive(src, dst) {
  if (!fs.existsSync(src)) return;
  mkdirP(dst);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(s, d);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}
