// check-cr-citations.cjs — every "CR nnn.n[x]" citation in the engine source must name a rule that EXISTS in the
// bundled Comprehensive Rules (knowledge/mtg-judge/data/cr/cr_current.json). CLAUDE.md §1.2: never invent rule numbers.
//
// What it catches: a citation to a rule that is not in the CR at all — a sub-letter past the end of its rule
// (702.88d, 702.30c), a mistyped number. What it cannot catch: a real rule cited for the wrong thing (118.10 for
// the impulse permission). That half is judgment; this script only guarantees the number is real. (For the keyword
// sections, 701.N / 702.N, check-cr-keywords.cjs checks the cited keyword against the one the comment names.)
//
// Lists after one "CR" are read too ("CR 608.2n / 608.3b", "CR 601.2f, 601.2h", both ends of "CR 706.1-706.2"), as
// is the hyphenated form ("the CR-603.10a look-back"). A citation that a comment wraps across a line break ("… CR" at
// the end of one line, "303.4e)" at the start of the next) is read whole: each file is scanned with its lines joined
// and their comment leaders (//, *, /**) dropped. The CR skips the subrule letters l and o by design, so 608.2k →
// 608.2m is not a gap.
//
// Usage (from app/): node scripts/check-cr-citations.cjs [--json]      exit 1 when any citation names no rule.
// `npm run lint` runs it after eslint.
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
// Up to three lower-case words a list item may carry before a "/" — the keyword it cites ("CR 702.90b infect / 702.80a wither").
// Without it the number after the slash was no citation at all, and "702.180a toxic" (702.180 is Harmonize) passed both gates.
const ITEM_WORDS = String.raw`(?:\s+[a-z][a-z'’-]*(?:\s+[a-z][a-z'’-]*){0,2}(?=\s*\/))?`;
// "CR <num>" or "CR-<num>", then any run of "/ , + & - – and or"-separated numbers (an optional repeated "CR" allowed
// between them).
const CITE = new RegExp(String.raw`\bCR(?:\s+|-)(${NUM}(?:${ITEM_WORDS}\s*(?:\/|,|\+|&|-|–|\band\b|\bor\b)\s*(?:CR\s+)?${NUM})*)`, "g");
const ONE = new RegExp(NUM, "g");
// A line's leading comment marker — dropped when the lines are joined, so a wrapped citation reads as one.
const LEADER = /^\s*(?:\/\/+|\/?\*+\/?)?\s*/;

/** Every rule number cited in `source`: [{ rule, line (1-based, the line the number sits on), text }]. */
function citationsIn(source) {
  const lines = source.split("\n");
  const starts = [];
  let joined = "";
  for (const line of lines) {
    starts.push(joined.length);
    joined += line.replace(LEADER, "") + " ";
  }
  const lineAt = (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
  const out = [];
  for (const m of joined.matchAll(CITE)) {
    const listStart = m.index + m[0].length - m[1].length;
    for (const n of m[1].matchAll(ONE)) {
      const line = lineAt(listStart + n.index);
      out.push({ rule: n[0], line, text: lines[line - 1].trim().slice(0, 140) });
    }
  }
  return out;
}

/** Check `files` against `rules` (the parsed CR JSON, keyed by rule number). */
function findMissing(rules, files) {
  const missing = [];
  let cited = 0;
  for (const file of files) {
    for (const c of citationsIn(fs.readFileSync(file, "utf8"))) {
      cited += 1;
      if (!Object.prototype.hasOwnProperty.call(rules, c.rule)) {
        missing.push({ file: path.relative(APP_ROOT, file).replace(/\\/g, "/"), line: c.line, rule: c.rule, text: c.text });
      }
    }
  }
  return { cited, missing };
}

module.exports = { citationsIn, findMissing };

if (require.main === module) {
  const rules = JSON.parse(fs.readFileSync(CR_FILE, "utf8"));
  const { cited, missing } = findMissing(rules, walk(SRC));
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ cited, missing }, null, 2));
  } else {
    for (const m of missing) console.log(`${m.file}:${m.line}  CR ${m.rule} — not in the bundled CR  ::  ${m.text}`);
    console.log(`${cited} citations checked; ${missing.length} name no rule in ${path.relative(path.resolve(APP_ROOT, ".."), CR_FILE).replace(/\\/g, "/")}`);
  }
  process.exit(missing.length ? 1 : 0);
}
