/**
 * allowlist-guard.mjs — R2: the self-certifying-allowlist tamper guard.
 *
 * The coverage build credits a keyword native by adding it to COVERED_KEYWORDS
 * (coverage.js); qa-sweep.mjs's over-claim verdict is silenced by adding the keyword to
 * ENFORCED_KEYWORDS / ALLOWED_UNENFORCED / KNOWN_INTERIM_FP. With no human integrator, a
 * builder sub-agent could add a keyword to BOTH in one slice and self-certify "OK" with
 * zero runtime enforcement actually wired — the gate defeats itself.
 *
 * This guard reads each allowlist set from the WORKING tree AND from `git show
 * origin/master:<file>` and reports every member ADDED vs origin/master. The orchestrator
 * runs it at the gate: ANY addition is an AUTOMATIC REFUTE — the orchestrator must
 * independently confirm the keyword is genuinely enforced in runtime code (combatResolution,
 * combatEvasion, resolvers, …), not merely allowlisted, before accepting the slice. Reading
 * the baseline from origin/master (not the branch) is the point: the trusted ref defines
 * "what was already blessed," so a same-slice addition can never bless itself.
 *
 * USAGE (headless, orchestrator-invoked, after `git fetch origin`):
 *   node scripts/allowlist-guard.mjs
 * Exit 0 = no additions; exit 1 = additions found (printed) → auto-refute pending confirm.
 * Pure node builtins (fs via git only) — needs git + a current origin/master.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Repo root, so file reads are cwd-independent (invoked from app/ or the root alike);
// `git show <ref>:<path>` pathspecs are already repo-root-relative regardless of cwd.
const ROOT = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();

// Guarded sets: [constant name, repo-root-relative file].
const GUARDED = [
  ["COVERED_KEYWORDS", "app/src/lib/learn/coverage.js"],
  ["ENFORCED_KEYWORDS", "app/scripts/qa-sweep.mjs"],
  ["ALLOWED_UNENFORCED", "app/scripts/qa-sweep.mjs"],
  ["KNOWN_INTERIM_FP", "app/scripts/qa-sweep.mjs"],
];

// Extract the membership of `const NAME = [ ... ]` / `new Set([ ... ])` from source text.
// Strips // line-comments first so quoted tokens inside comments (e.g. "toxic N") are ignored,
// then collects single/double-quoted string literals up to the block's closing bracket line.
function extractMembers(source, name) {
  const lines = String(source || "").split(/\r?\n/);
  const startIdx = lines.findIndex((l) => new RegExp(`\\b${name}\\s*=`).test(l));
  if (startIdx === -1) return null; // constant absent in this version
  const members = new Set();
  for (let i = startIdx; i < lines.length; i++) {
    const code = lines[i].replace(/\/\/.*$/, ""); // drop line comment
    for (const m of code.matchAll(/["']([^"']+)["']/g)) members.add(m[1]);
    if (/^\s*\]\)?\s*;?\s*$/.test(code) && i > startIdx) break; // closing ] / ]) / ]; line
  }
  return members;
}

function masterVersion(file) {
  try { return execSync(`git show origin/master:${file}`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }); }
  catch { return ""; } // file absent on master (new file) → every member counts as added
}

let additions = 0;
for (const [name, file] of GUARDED) {
  const working = extractMembers(fs.readFileSync(path.join(ROOT, file), "utf8"), name);
  if (!working) { console.log(`  ⚠ ${name} not found in working ${file} — skipped`); continue; }
  const base = extractMembers(masterVersion(file), name) || new Set();
  const added = [...working].filter((k) => !base.has(k));
  if (added.length) {
    additions += added.length;
    console.log(`  *** ${name} (${file}) added vs origin/master: ${added.map((a) => JSON.stringify(a)).join(", ")}`);
  }
}

if (additions === 0) {
  console.log("  OK — no allowlist additions vs origin/master.");
  process.exit(0);
}
console.log(`\n  AUTO-REFUTE: ${additions} allowlist addition(s). Independently confirm each is ENFORCED in runtime code (not just allowlisted) before accepting the slice.`);
process.exit(1);
