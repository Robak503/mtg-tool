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

// Also wipe any previously-built target resources. Tauri's cargo build
// copies src-tauri/resources/ INTO target/{debug,release}/resources/ but
// doesn't remove stale files there, so files we no longer stage stick
// around forever and end up in the raw .exe's working tree. (The NSIS
// installer reads only from the staging dir so it's already clean, but
// the raw mtg-tool.exe people run from target/release sees the stale
// copy unless we nuke it here.)
for (const profile of ["debug", "release"]) {
  const targetRes = path.join(
    APP_ROOT,
    "src-tauri",
    "target",
    profile,
    "resources",
  );
  if (fs.existsSync(targetRes)) {
    rmRf(targetRes);
    console.log(`  also wiped ${path.relative(APP_ROOT, targetRes)}`);
  }
}

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

// 3. Full reference data bundle. Ships every JSON the app might want
// at runtime so the .exe is functional on a clean machine — no npm
// sync scripts required. The only Scryfall file we deliberately skip
// is all_cards.json (2.4 GB) — it's a per-printing-per-language dump
// with ~80 duplicate entries per card name. default_cards covers the
// printing-specific use cases we'd actually build (set codes, alt-art
// lists, prices), and unique_artwork covers art browsing.
//
// User-modifiable files (decks/chats/feedback/games/backups/agent-notes)
// are NOT bundled — those come from the first-launch import wizard so
// the user keeps ownership.
console.log("Copying reference data files...");
const dataFiles = [
  // Card data — oracle_cards is read by every code path today; default_cards
  // and unique_artwork are bundled for future alt-art / set-info features
  // (~755 MB combined, but installer LZMA brings it way down)
  ["data/scryfall-bulk/oracle-index.json",     "slim card index — preferred at runtime"],
  ["data/scryfall-bulk/oracle_cards.json",     "full Scryfall bulk Oracle data"],
  ["data/scryfall-bulk/default_cards.json",    "one printing per card with set codes, prices, alt-art metadata"],
  ["data/scryfall-bulk/unique_artwork.json",   "every distinct artwork — needed for alt-art browsing"],
  ["data/scryfall-bulk/rulings.json",          "Scryfall card rulings"],
  ["data/scryfall-bulk/tier-manifest.json",    "sync metadata"],
  ["data/scryfall-bulk/manifest.json",         "Scryfall API manifest"],
  ["data/scryfall.oracle.local.json",          "legacy Oracle (cardIndex fallback)"],
  ["data/scryfall.rulings.local.json",         "legacy rulings (cardIndex fallback)"],
  // Rules
  ["data/rules-index.json",                    "rules retrieval index"],
  // Combo interactions
  ["data/spellbook-combos.local.json",         "Commander Spellbook combos"],
  ["data/spellbook-cards.local.json",          "Spellbook card name index"],
  ["data/spellbook-index.local.json",          "Spellbook lookup index"],
  ["data/spellbook-meta.local.json",           "Spellbook sync metadata"],
  // EDHREC power signals
  ["data/edhrec-salt.local.json",              "EDHREC salt scores"],
  ["data/edhrec-salt-meta.local.json",         "EDHREC sync metadata"],
];

let bundledBytes = 0;
let bundledCount = 0;
for (const [rel, label] of dataFiles) {
  const src = path.join(APP_ROOT, rel);
  if (!fs.existsSync(src)) {
    console.warn(`  - ${rel} (missing in dev tree — ${label})`);
    continue;
  }
  const size = fs.statSync(src).size;
  copyFile(src, path.join(RESOURCES, rel));
  bundledBytes += size;
  bundledCount += 1;
  const mb = (size / 1024 / 1024).toFixed(1);
  console.log(`  + ${rel} (${mb} MB — ${label})`);
}
console.log(`  Total: ${bundledCount} files, ${(bundledBytes / 1024 / 1024).toFixed(1)} MB`);

// 4. Bundle the sync + index-rebuild scripts. /api/sync-data spawns
// these at runtime to refresh card / combo / salt data and rebuild
// the slim indexes. They honor MTG_APP_ROOT / MTG_JUDGE_DIR /
// MTG_REFERENCE_DIR env vars (set by the Tauri shell) so writes land
// in %APPDATA% and reads can fall back to the bundled snapshot.
console.log("Copying sync/build scripts...");
const syncScripts = [
  "sync-scryfall-bulk.cjs",
  "sync-spellbook.cjs",
  "sync-edhrec-salt.cjs",
  "sync-scryfall-oracle.cjs",
  "build-oracle-index.cjs",
  "build-rules-index.cjs",
];
for (const name of syncScripts) {
  const src = path.join(APP_ROOT, "scripts", name);
  if (fs.existsSync(src)) {
    copyFile(src, path.join(RESOURCES, "scripts", name));
    console.log(`  + scripts/${name}`);
  } else {
    console.warn(`  - scripts/${name} (not found)`);
  }
}

// 5. Portable node.exe. Downloaded earlier in the pipeline by
// scripts/download-portable-node.cjs. Lets the Tauri shell spawn the
// Next.js server without depending on the user having Node installed.
const portableNodeSrc = path.join(APP_ROOT, "src-tauri", "node", "node.exe");
if (fs.existsSync(portableNodeSrc)) {
  copyFile(portableNodeSrc, path.join(RESOURCES, "node", "node.exe"));
  const size = fs.statSync(portableNodeSrc).size;
  console.log(`Bundled portable node.exe (${(size / 1024 / 1024).toFixed(1)} MB)`);
} else {
  console.warn("  (no src-tauri/node/node.exe — run `npm run download:node`)");
}

// 6. Next.js standalone server (populated by copy-tauri-assets.cjs which
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
