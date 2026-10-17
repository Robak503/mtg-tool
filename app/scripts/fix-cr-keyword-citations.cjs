// fix-cr-keyword-citations.cjs — rewrite the CR citations whose intent is unambiguous but whose number is wrong.
// Touches comments and test titles only (the prose units of check-cr-keywords.cjs), never code. Idempotent: on a
// tree it has already fixed it finds nothing to change, so it can be re-run after merging other work.
//
// Two passes:
//   1. KEYWORD SECTIONS — every hit of check-cr-keywords.cjs (a 701.N / 702.N citation whose comment names a
//      different keyword, by name, by corroborated remap, or by its file's own remap) moves to the named keyword's
//      section. A cited "a" subrule — the keyword's definition — moves to the new section's "a" subrule; any other
//      subrule letter moves to the bare section, because the sections' subrule orders differ between CR editions
//      ("BOAST (CR 702.135b) — only if THIS CREATURE attacked" is 702.142a's text; 702.142b is something else).
//   2. CR 712.4a FOR A FRONT FACE — 712.4a is the meld rule; the front-face rules are 712.8's. A comment that cites
//      712.4a for a double-faced card's front face (and is not about meld) moves to the subrule its sentence names:
//      712.8a for a card outside the battlefield (graveyard, library, hand, tutor, discard, mill, reveal), 712.8d for
//      a permanent (battlefield, copy, "right now"), 712.11 for casting it, or the whole rule 712.8 ("each face …
//      has its own set of characteristics") when the sentence names no zone or speaks of "the face that is up".
// A rewrite that would repeat a number already in the same citation list drops it instead ("CR 701.16/701.21" →
// "CR 701.21", "CR 712.4a / 712.8a" → "CR 712.8a").
//
// Usage (from app/): node scripts/fix-cr-keyword-citations.cjs [--dry-run] [--json]
//   prints one line per rewrite; writes the files unless --dry-run; exit 0.
const fs = require("node:fs");
const path = require("node:path");
const { findKeywordMismatches, proseUnits, citesIn, sentenceAround, walk, CR_FILE, SRC, APP_ROOT } = require("./check-cr-keywords.cjs");

/** The rule a keyword hit moves to: the "a" definition subrule keeps its letter, anything else is the bare section. */
function keywordTarget(hit, rules) {
  const letter = hit.rule.slice(hit.section.length);
  return letter === "a" && rules[`${hit.correct}a`] ? `${hit.correct}a` : hit.correct;
}

// Zone words for pass 2, read in the citation's sentence (other parentheticals dropped: "mirrors the front-face
// discipline used for counter/tutor/graveyard targets" describes elsewhere, not here).
const OFF_FIELD = /\b(?:graveyards?|librar(?:y|ies)|hands?|tutors?|discard(?:s|ed)?|mill(?:s|ed)?|reveal(?:s|ed)?|outside the battlefield)\b|[a-z](?:Graveyard|Library)/i;
const ON_FIELD = /\b(?:battlefield|permanents?|cop(?:y|ies|ied)|clones?|right now|as it is now|face that is up|lands)\b/i;
const CASTING = /\bcast(?:s|ing)?\b/i;

/** The 712.8-family rule for a sentence that cites 712.4a for a front face, or null when it is not about a front face. */
function frontFaceTarget(sentence) {
  if (!/\bfaces?\b|front/i.test(sentence) || /\bmeld/i.test(sentence)) return null;
  if (!/front/i.test(sentence)) return "712.8"; // "its face that is up" — whichever face: the whole rule
  const off = OFF_FIELD.test(sentence);
  const on = ON_FIELD.test(sentence.replace(/outside the battlefield/gi, ""));
  if (off && !on) return "712.8a";
  if (on && !off) return "712.8d";
  if (!off && !on && CASTING.test(sentence)) return "712.11";
  return "712.8";
}

/** `sentence` with every parenthetical that does not hold the citation at [from, to) blanked. */
function ownClause(text, s, e, from, to) {
  const chars = text.slice(s, e).split("");
  const stack = [];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === "(") stack.push(i);
    else if (chars[i] === ")" && stack.length) {
      const open = stack.pop();
      if (!(s + open < from && s + i >= to)) for (let j = open; j <= i; j++) chars[j] = " ";
    }
  }
  return chars.join("");
}

/** Every rewrite for `files`: [{ file, line, offset, from, to, kind, sentence }] (offset = file offset of `from`). */
function plan(rules, files) {
  const out = [];
  const { hits } = findKeywordMismatches(rules, files);
  for (const h of hits) {
    out.push({ file: h.file, line: h.line, offset: h.offset, from: h.rule, to: keywordTarget(h, rules), kind: `keyword-${h.tier}`, sentence: h.sentence });
  }
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    if (!source.includes("712.4a")) continue;
    const rel = path.relative(APP_ROOT, file).split(path.sep).join("/");
    for (const u of proseUnits(source, file)) {
      for (const c of citesIn(u.text)) {
        for (const n of c.nums) {
          if (n.rule !== "712.4a") continue;
          const [s, e] = sentenceAround(u.text, c.start, c.end);
          const to = frontFaceTarget(ownClause(u.text, s, e, c.start, c.end));
          if (!to) continue;
          const offset = u.start + n.start;
          out.push({ file: rel, line: source.slice(0, offset).split("\n").length, offset, from: n.rule, to, kind: "front-face", sentence: u.text.slice(s, e).replace(/\s+/g, " ").trim() });
        }
      }
    }
  }
  return out;
}

/** Apply the rewrites for one file's source; a number that would repeat one already in its list is dropped. */
function applyToSource(source, file, rewrites) {
  const byOffset = new Map(rewrites.map((r) => [r.offset, r]));
  const edits = [];
  for (const u of proseUnits(source, file)) {
    for (const c of citesIn(u.text)) {
      const finals = c.nums.map((n) => (byOffset.get(u.start + n.start) || { to: n.rule }).to);
      c.nums.forEach((n, i) => {
        const r = byOffset.get(u.start + n.start);
        if (!r) return;
        if (source.slice(u.start + n.start, u.start + n.end) !== r.from) throw new Error(`${file}: expected ${r.from} at offset ${r.offset}`);
        // already in the list: as a number this pass leaves alone, or as an earlier rewrite to the same rule
        const dupe = finals.some((x, j) => j !== i && x === r.to && (j < i || !byOffset.has(u.start + c.nums[j].start)));
        if (dupe) {
          // drop this number with the separator that joins it to its list neighbour
          r.dropped = true;
          if (i > 0) edits.push({ start: u.start + c.nums[i - 1].end, end: u.start + n.end, text: "" });
          else edits.push({ start: u.start + n.start, end: u.start + c.nums[i + 1].start, text: "" });
        } else {
          edits.push({ start: u.start + n.start, end: u.start + n.end, text: r.to });
        }
      });
    }
  }
  edits.sort((a, b) => b.start - a.start);
  let out = source;
  for (const ed of edits) out = out.slice(0, ed.start) + ed.text + out.slice(ed.end);
  return out;
}

module.exports = { plan, applyToSource, keywordTarget, frontFaceTarget };

if (require.main === module) {
  const rules = JSON.parse(fs.readFileSync(CR_FILE, "utf8"));
  const files = walk(SRC);
  const rewrites = plan(rules, files);
  const byFile = new Map();
  for (const r of rewrites) {
    if (!byFile.has(r.file)) byFile.set(r.file, []);
    byFile.get(r.file).push(r);
  }
  const dry = process.argv.includes("--dry-run");
  for (const [rel, rs] of byFile) {
    const file = path.join(APP_ROOT, rel);
    const before = fs.readFileSync(file, "utf8");
    const after = applyToSource(before, file, rs);
    if (!dry && after !== before) fs.writeFileSync(file, after);
  }
  rewrites.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.offset - b.offset));
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(rewrites, null, 2));
  } else {
    for (const r of rewrites) {
      console.log(`${r.file}:${r.line}  CR ${r.from} → ${r.dropped ? `(dropped — CR ${r.to} already cited)` : `CR ${r.to}`}  [${r.kind}]  ::  ${r.sentence.slice(0, 110)}`);
    }
    const kinds = {};
    for (const r of rewrites) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
    console.log(`${rewrites.length} citation(s) ${dry ? "would be " : ""}rewritten in ${byFile.size} file(s)${rewrites.length ? ` — ${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(", ")}` : ""}`);
  }
}
