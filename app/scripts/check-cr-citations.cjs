// check-cr-citations.cjs — every "CR nnn.n[x]" citation in the engine source must name a rule that EXISTS in the
// bundled Comprehensive Rules (knowledge/mtg-judge/data/cr/cr_current.json). CLAUDE.md §1.2: never invent rule numbers.
//
// What it catches: a citation to a rule that is not in the CR at all — a sub-letter past the end of its rule
// (702.88d, 702.30c), a mistyped number. What it cannot catch: a real rule cited for the wrong thing (118.10 for
// the impulse permission). That half is judgment; this script only guarantees the number is real.
//
// Lists after one "CR" are read too ("CR 608.2n / 608.3b", "CR 601.2f, 601.2h"). The CR skips the subrule letters
// l and o by design, so 608.2k → 608.2m is not a gap.
//
// Usage (from app/): node scripts/check-cr-citations.cjs [--json]      exit 1 when any citation names no rule.
const fs = require("node:fs");
const path = require("node:path");

const APP_ROOT = path.resolve(__dirname, "..");
const JUDGE_DIR = (process.env.MTG_JUDGE_DIR && process.env.MTG_JUDGE_DIR.trim())
  ? process.env.MTG_JUDGE_DIR.trim()
  : path.resolve(APP_ROOT, "..", "knowledge", "mtg-judge");
const CR_FILE = path.join(JUDGE_DIR, "data", "cr", "cr_current.json");
const SRC = path.join(APP_ROOT, "src");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walk(full, out);
    } else if (/\.(?:c|m)?jsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const NUM = String.raw`\d{3}\.\d+[a-z]?`;
// "CR <num>" then any run of "/ , + and or &"-separated numbers (an optional repeated "CR" allowed between them).
const CITE = new RegExp(String.raw`\bCR\s+(${NUM}(?:\s*(?:\/|,|\+|&|\band\b|\bor\b)\s*(?:CR\s+)?${NUM})*)`, "g");
const ONE = new RegExp(NUM, "g");

const rules = JSON.parse(fs.readFileSync(CR_FILE, "utf8"));
const missing = [];
let cited = 0;
for (const file of walk(SRC)) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(CITE)) {
      for (const n of m[1].match(ONE) || []) {
        cited += 1;
        if (!rules[n]) missing.push({ file: path.relative(APP_ROOT, file).replace(/\\/g, "/"), line: i + 1, rule: n, text: line.trim().slice(0, 140) });
      }
    }
  });
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ cited, missing }, null, 2));
} else {
  for (const m of missing) console.log(`${m.file}:${m.line}  CR ${m.rule} — not in the bundled CR  ::  ${m.text}`);
  console.log(`${cited} citations checked; ${missing.length} name no rule in ${path.relative(path.resolve(APP_ROOT, ".."), CR_FILE).replace(/\\/g, "/")}`);
}
process.exit(missing.length ? 1 : 0);
