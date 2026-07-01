const fs = require("node:fs");
const path = require("node:path");

// In dev mode app/ is the cwd, knowledge/mtg-judge sits in the parent dir.
// In the .exe MTG_JUDGE_DIR points at the bundled codex and MTG_APP_ROOT at
// the user data dir so the rebuilt index lands somewhere writable.
const APP_ROOT = (process.env.MTG_APP_ROOT && process.env.MTG_APP_ROOT.trim())
  ? process.env.MTG_APP_ROOT.trim()
  : path.resolve(__dirname, "..");
const JUDGE_DIR = (process.env.MTG_JUDGE_DIR && process.env.MTG_JUDGE_DIR.trim())
  ? process.env.MTG_JUDGE_DIR.trim()
  : path.resolve(__dirname, "..", "..", "knowledge", "mtg-judge");
const CR_FILE = path.join(JUDGE_DIR, "data", "cr", "cr_current.json");
const OUT_FILE = path.join(APP_ROOT, "data", "rules-index.json");

const STOP_WORDS = new Set([
  "the", "and", "for", "are", "was", "that", "this", "with", "from", "they",
  "have", "been", "will", "would", "its", "not", "but", "you", "your", "can",
  "may", "one", "two", "all", "any", "each", "than", "then", "into", "onto",
  "only", "same", "also", "see", "rule", "rules",
]);

const MTG_ALLOWLIST = new Set([
  "tap", "pay", "add", "put", "die", "cast", "copy", "dies", "draw", "hand",
  "zone", "card", "mana", "spell", "stack", "turn", "step", "phase", "life",
]);

function tokenize(text) {
  const tokens = String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean);

  return [...new Set(tokens.filter(token => {
    if (STOP_WORDS.has(token)) return false;
    return token.length >= 3 || MTG_ALLOWLIST.has(token);
  }))].sort();
}

function normalizeRuleEntry(key, entry) {
  const ruleNumber = String(entry?.ruleNumber || entry?.number || key || "").trim();
  const text = String(entry?.ruleText || entry?.text || "").trim();
  if (!ruleNumber || !text) return null;

  const examples = entry?.examples == null || entry.examples === "" ? null : entry.examples;
  const keywordText = [
    ruleNumber,
    text,
    Array.isArray(examples) ? examples.join(" ") : examples,
  ].filter(Boolean).join(" ");

  return {
    ruleNumber,
    text,
    keywords: tokenize(keywordText),
    examples,
  };
}

function ruleSort(a, b) {
  return a.ruleNumber.localeCompare(b.ruleNumber, undefined, { numeric: true, sensitivity: "base" });
}

function main() {
  if (!fs.existsSync(CR_FILE)) {
    throw new Error(`Missing Comprehensive Rules JSON: ${CR_FILE}`);
  }

  const raw = JSON.parse(fs.readFileSync(CR_FILE, "utf8"));
  const rules = Object.entries(raw || {})
    .map(([key, entry]) => normalizeRuleEntry(key, entry))
    .filter(Boolean)
    .sort(ruleSort);

  if (rules.length < 3000) {
    throw new Error(`Rules index looks too small (${rules.length}). Expected roughly 3138 entries.`);
  }

  for (const required of ["616.1", "616.1a", "614.6", "608.2", "700.4"]) {
    if (!rules.some(rule => rule.ruleNumber === required)) {
      throw new Error(`Rules index missing required CR ${required}.`);
    }
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(rules, null, 2)}\n`);

  const sample = rules.find(rule => rule.ruleNumber === "616.1");
  console.log(`Rules indexed: ${rules.length}`);
  console.log(`Output: ${path.relative(APP_ROOT, OUT_FILE)}`);
  console.log(`Sample 616.1: ${sample?.text?.slice(0, 90) || "missing"}`);
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
