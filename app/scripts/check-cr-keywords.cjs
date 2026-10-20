// check-cr-keywords.cjs — a "CR 701.N" / "CR 702.N" citation must cite the keyword its comment names.
//
// check-cr-citations.cjs guarantees a cited rule EXISTS. It cannot see a real rule cited for the wrong mechanic — and
// the keyword sections are where that happens most: the CR inserts and re-sorts keyword sections between editions, so
// a number remembered from an older CR lands on a neighbour ("AFFLICT (CR 702.131)" — 702.131 is Ascend, afflict is
// 702.130; "ETB-FIGHT (CR 701.12)" — 701.12 is Exchange, fight is 701.14).
//
// The keyword map is read from the bundled CR, never typed: every 701.N (keyword action) and 702.N (keyword ability)
// whose rule text is its title ("702.130  Afflict") names that keyword; a "Tap and Untap" title names both words, and
// a subrule "Megamorph is a variant of the morph ability" adds the variant's name to its section.
//
// What is read: comments, and the title string of it()/test()/describe() in *.test.* files. For each keyword-section
// citation, the comment SENTENCE around it (or the title) is read:
//   * if the sentence names the cited section's own keyword anywhere (any inflection; "regeneration" counts for
//     Regenerate), the citation is accepted;
//   * otherwise a keyword of the SAME family (701 or 702) is looked for where a comment names what it cites: right
//     before the citation ("AFFLICT (CR …", "devour N (CR …", "the HOST fights (CR …"), right after it ("CR 701.8
//     discard", "(CR 701.16 — sacrifice a permanent"), as an upper-case label in the citation's clause ("ETB-FIGHT —
//     SOURCE-BOUND 'ANOTHER' (CR …"), or as the sentence's capitalised first word ("Mill ONE player (CR …").
//     One such keyword → a NAMED hit (the citation should be that keyword's section). Two different ones → ambiguous.
//   * a keyword that is merely nearby in lower case ("each player's mill is its own event (CR 701.13a)") is a WEAK
//     reading: ordinary words collide with keyword names ("the partner gains it too", "offering a recast"), so a weak
//     reading counts only when the same remap (cited section → named section) is ALSO a named hit somewhere in the
//     tree — the systematic off-by-N shift, corroborated by a citation that names its keyword outright.
// Never read as the intended keyword: one the cited section's own rules text mentions ("deathtouch" beside a
// trample-assignment citation), one whose section the same sentence also cites, one from the other family, and one
// followed by a project slice code ("BLITZ BC-1").
//
// Usage (from app/): node scripts/check-cr-keywords.cjs [--json] [--all]
//   exit 1 when any named or corroborated hit exists; --all also lists the ambiguous and uncorroborated readings
//   (advisory, never failing). `npm run lint` runs it after check-cr-citations.cjs. The fixer that rewrites the
//   unambiguous hits is scripts/fix-cr-keyword-citations.cjs. Comments are found with espree, the parser eslint
//   already installs (no dependency of its own).
const fs = require("node:fs");
const path = require("node:path");
const espree = require("espree");

const APP_ROOT = path.resolve(__dirname, "..");
const JUDGE_DIR = (process.env.MTG_JUDGE_DIR && process.env.MTG_JUDGE_DIR.trim())
  ? process.env.MTG_JUDGE_DIR.trim()
  : path.resolve(APP_ROOT, "..", "knowledge", "mtg-judge");
const CR_FILE = path.join(JUDGE_DIR, "data", "cr", "cr_current.json");
const SRC = path.join(APP_ROOT, "src");

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── the keyword map, from the CR ─────────────────────────────────────────────────────────────────────────────────

/** Every inflection of a keyword name the source writes: fight/fights/fought/fighting, tap/tapped, mill/milled. */
function namePattern(name) {
  const words = name.split(/[\s-]+/);
  const last = words.pop();
  const forms = new Set([last, `${last}s`, `${last}es`, `${last}ed`, `${last}ing`]);
  if (last.endsWith("e")) { forms.add(`${last}d`); forms.add(`${last.slice(0, -1)}ing`); }
  if (/[^aeiou][aeiou][bdgmnprt]$/.test(last) && last.length <= 4) { forms.add(`${last}${last.slice(-1)}ed`); forms.add(`${last}${last.slice(-1)}ing`); }
  if (last === "fight") forms.add("fought");
  const tail = [...forms].sort((a, b) => b.length - a.length).map(esc).join("|");
  const head = words.map(esc).join("[\\s-]+");
  return `(?<![\\w])${head ? `${head}[\\s-]+` : ""}(?:${tail})(?![\\w])`;
}

/**
 * { sections: { "702.130": { num, title, names, text } }, lexicon: [{ section, name, re, one }] } — the lexicon is
 * longest name first, so "double strike" is read before "double" and "manifest dread" before "manifest".
 */
function keywordMap(rules) {
  const sections = {};
  for (const num of Object.keys(rules)) {
    const m = num.match(/^70[12]\.(\d+)$/);
    if (!m || m[1] === "1") continue; // 701.1 / 702.1 are the chapter introductions
    sections[num] = { num, title: rules[num].ruleText, names: [], text: rules[num].ruleText.toLowerCase(), subs: [], subText: {} };
  }
  for (const num of Object.keys(rules)) {
    const m = num.match(/^(70[12]\.\d+)([a-z])$/);
    if (m && sections[m[1]]) {
      const s = sections[m[1]];
      // a cited subrule is read whole ("Regenerate [permanent]" means "… remove all damage marked on it and tap it");
      // a bare section is its words minus the card text it quotes as an example (701.18c's “Play with the top card
      // of your library revealed.” is not the Play section talking about revealing)
      s.subText[m[2]] = `${s.title} ${rules[num].ruleText}`.toLowerCase();
      s.text += ` ${rules[num].ruleText.replace(/“[^”]*”/g, " ").toLowerCase()}`;
      s.subs.push(rules[num].ruleText);
    }
  }
  for (const s of Object.values(sections)) {
    const title = s.title.replace(/!/g, "").replace(/\s*\([^)]*\)\s*$/, "").trim(); // "Start Your Engines!", "∞ (Infinity)"
    if (!/[a-z]/i.test(title) || /\.$/.test(title) || title.split(/\s+/).length > 6) continue; // not a title line
    s.names = (/ and /.test(title) ? title.split(/ and /) : [title]).map((n) => n.toLowerCase());
    for (const sub of s.subs) {
      const v = sub.match(/^“?([A-Z][a-z]+)”? is a variant of (?:the )?([a-z]+)/); // Megamorph, Multikicker
      if (v && v[2] === s.names[0] && v[1].toLowerCase() !== v[2]) s.names.push(v[1].toLowerCase());
    }
  }
  const lexicon = [];
  for (const s of Object.values(sections)) {
    for (const name of s.names) {
      const src = namePattern(name);
      lexicon.push({ section: s.num, name, re: new RegExp(src, "gi"), one: new RegExp(src, "i") });
    }
  }
  lexicon.sort((a, b) => b.name.length - a.name.length);
  return { sections, lexicon };
}

// ── what the source says ─────────────────────────────────────────────────────────────────────────────────────────

const NUM = String.raw`\d{3}\.\d+[a-z]?`;
// A list item may carry up to three lower-case words before a "/" — the keyword it cites ("CR 702.90b infect / 702.164c toxic").
const ITEM_WORDS = String.raw`(?:\s+[a-z][a-z'’-]*(?:\s+[a-z][a-z'’-]*){0,2}(?=\s*\/))?`;
// The citation grammar of check-cr-citations.cjs: "CR <num>" / "CR-<num>", then a "/ , + & - – and or" list.
const CITE = new RegExp(String.raw`\bCR(?:\s+|-)(${NUM}(?:${ITEM_WORDS}\s*(?:\/|,|\+|&|-|–|\band\b|\bor\b)\s*(?:CR\s+)?${NUM})*)`, "g");
const ONE = new RegExp(NUM, "g");

/** [{ start, end, nums: [{ rule, start, end }] }] — each citation (list) in `text`, offsets into `text`. */
function citesIn(text) {
  const out = [];
  for (const m of text.matchAll(CITE)) {
    const listStart = m.index + m[0].length - m[1].length;
    const nums = [...m[1].matchAll(ONE)].map((n) => ({ rule: n[0], start: listStart + n.index, end: listStart + n.index + n[0].length }));
    out.push({ start: m.index, end: m.index + m[0].length, nums });
  }
  return out;
}

function parse(source) {
  const opts = { ecmaVersion: "latest", range: true, comment: true, ecmaFeatures: { jsx: true } };
  try {
    return espree.parse(source, { ...opts, sourceType: "module" });
  } catch {
    return espree.parse(source, { ...opts, sourceType: "script", ecmaFeatures: { jsx: true, globalReturn: true } });
  }
}

const blank = (s) => s.replace(/[^\n]/g, " ");

/**
 * The prose of a file: each block comment, each run of consecutive line comments, and (in a *.test.* file) each
 * it/test/describe title literal — [{ kind, start, end, text }], `text` the same length as source[start, end) with
 * its comment markers (//, /*, *, *\/, the title's quotes) blanked, so an offset into `text` is an offset into the file.
 */
function proseUnits(source, file) {
  const ast = parse(source);
  const units = [];
  let run = null;
  for (const c of ast.comments) {
    const [a, b] = c.range;
    if (c.type === "Line") {
      if (run && /^[ \t]*\r?\n[ \t]*$/.test(source.slice(run.end, a))) { run.end = b; continue; }
      run = { kind: "line", start: a, end: b };
      units.push(run);
    } else {
      run = null;
      units.push({ kind: "block", start: a, end: b });
    }
  }
  if (/\.test\.(?:c|m)?jsx?$/.test(file)) {
    const visit = (node) => {
      if (!node || typeof node.type !== "string") return;
      if (node.type === "CallExpression" && node.arguments.length) {
        let callee = node.callee;
        while (callee.type === "CallExpression") callee = callee.callee; // describe.each(rows)("title")
        let base = callee;
        while (base.type === "MemberExpression") base = base.object; // it.skip / describe.only
        const a0 = node.arguments[0];
        const isTitle = (a0.type === "Literal" && typeof a0.value === "string") || a0.type === "TemplateLiteral";
        if (base.type === "Identifier" && /^(?:it|test|describe|suite)$/.test(base.name) && isTitle) {
          units.push({ kind: "title", start: a0.range[0], end: a0.range[1] });
        }
      }
      for (const key of Object.keys(node)) {
        const v = node[key];
        if (Array.isArray(v)) v.forEach(visit);
        else if (v && typeof v.type === "string") visit(v);
      }
    };
    visit(ast);
  }
  for (const u of units) {
    const raw = source.slice(u.start, u.end);
    if (u.kind === "line") u.text = raw.replace(/(^|\n)([ \t]*)(\/\/+)/g, (m0, nl, ws, sl) => nl + ws + blank(sl));
    else if (u.kind === "block") u.text = raw.replace(/^\/\*+/, blank).replace(/\*+\/$/, blank).replace(/(\n[ \t]*)(\*+)/g, (m0, nl, st) => nl + blank(st));
    else u.text = ` ${raw.slice(1, -1)} `;
  }
  return units.sort((x, y) => x.start - y.start);
}

// A sentence ends at a period before whitespace ("702.130a." ends one, "702.130" does not), at ; ! ?, at a blank line,
// before a JSDoc tag, and at a "=====" / "─────" rule.
const BOUND = /[.!?;](?=\s)|\n\s*\n|\n\s*(?=@)|={3,}|─{3,}/g;
function sentenceAround(text, from, to) {
  let s = 0;
  let e = text.length;
  for (const m of text.matchAll(BOUND)) {
    if (m.index < from) s = m.index + m[0].length;
    else if (m.index >= to) { e = m.index; break; }
  }
  return [s, e];
}

/** Keyword mentions in text[from, to): longest name first, each span read once. A word before a slice code is a label. */
function mentionsIn(text, from, to, lexicon) {
  const seg = text.slice(from, to);
  const taken = new Uint8Array(seg.length);
  const out = [];
  for (const l of lexicon) {
    l.re.lastIndex = 0;
    for (const m of seg.matchAll(l.re)) {
      const a = m.index;
      const b = a + m[0].length;
      if (taken.subarray(a, b).some((x) => x)) continue;
      taken.fill(1, a, b);
      const next = seg.slice(b);
      const prev = text.slice(0, from + a);
      if (/^\s+[A-Z]{1,3}-?\d/.test(next)) continue; // "BLITZ BC-1", "SHELF S7" — a project slice label
      // part of a card name: after a capitalised possessive ("Teferi's Protection", "TEFERI'S PROTECTION"), or a
      // Title-case word beside another one ("Surging Might", "Frantic Search", "Sylvan Echoes")
      if (/[A-Z][\w-]*['’][sS] $/.test(prev)) continue;
      const title = (w) => /^[A-Z][a-z]/.test(w);
      if (title(m[0]) && (/^ [A-Z][a-z]/.test(next) || /(?:^|[^.!?;:—–(]\s)[A-Z][a-z][\w'’-]* $/.test(prev))) continue;
      out.push({ section: l.section, name: l.name, word: m[0], start: from + a, end: from + b, lex: l });
    }
  }
  return out.sort((x, y) => x.start - y.start);
}

/** Does the sentence name section S at all? Any inflection, or a longer word on its stem ("regeneration"). */
function namesSection(sentence, S, lexicon) {
  if (lexicon.some((l) => l.section === S.num && l.one.test(sentence))) return true;
  const lower = sentence.toLowerCase();
  return S.names.some((n) => {
    const stem = n.replace(/(?:ing|es|s|e)$/, "");
    return stem.length >= 5 && lower.includes(stem);
  });
}

const sectionOf = (rule) => (rule.match(/^(\d{3}\.\d+)/) || [])[1];
const familyOf = (num) => num.slice(0, 3);

// Gap between a keyword and the citation after it: "AFFLICT (CR", "devour N (CR", "BATTLE CRY (BLITZ BC-1, CR",
// "(toxic — CR", "(KW-UNDYING, CR", "fights (CR", "Mill's (CR".
const GAP_BEFORE = /^(?:['’]s)?(?:\s+(?:N|X|\d+|(?:\{[^{}]*\})+))*\s*(?:[—–:,-]\s*)?(?:\(\s*(?:[^()]*?[,—–:]\s*)?)?$/;
// Gap between the citation and a keyword after it: "CR 701.8 discard", "(CR 701.16 — sacrifice", "CR 702.131b: Ascend",
// "(CR 701.8 — the discarding player".
const GAP_AFTER = /^\s*(?:[—–:-]\s*)?(?:(?:the|a|an|each|every|its|this|that)\s+)?$/i;

/** Offset where the last `n` words of text[from, to) begin. */
function lastWordsFrom(text, from, to, n) {
  let i = to;
  for (let w = 0; w < n; w++) {
    while (i > from && /\s/.test(text[i - 1])) i--;
    if (i <= from) return from;
    while (i > from && !/\s/.test(text[i - 1])) i--;
  }
  return i;
}

/** Offset where the first `n` words of text[from, to) end. */
function firstWordsTo(text, from, to, n) {
  let i = from;
  for (let w = 0; w < n; w++) {
    while (i < to && /\s/.test(text[i])) i++;
    if (i >= to) return to;
    while (i < to && !/\s/.test(text[i])) i++;
  }
  return i;
}

/**
 * Every keyword-section citation in `source` whose comment names a different keyword:
 * [{ offset, line, kind, rule, section, citedKeyword, tier: "named"|"weak", ambiguous, correct, named, word,
 *    candidates, sentence }]. `offset` is the file offset of the cited number. `near`, when given, is a Map that
 * receives every keyword-section citation's offset → the sections of the keywords named where it is read.
 */
function keywordFindings(source, file, kw, near = null) {
  const { sections, lexicon } = kw;
  const out = [];
  for (const u of proseUnits(source, file)) {
    const text = u.text;
    const cites = citesIn(text);
    for (const c of cites) {
      const nums = c.nums.filter((n) => sections[sectionOf(n.rule)]);
      if (!nums.length) continue;
      const [s, e] = sentenceAround(text, c.start, c.end);
      const sentence = text.slice(s, e);
      // the citation's own parenthesis, if any
      let open = -1;
      for (let i = c.start - 1, depth = 0; i >= s; i--) {
        if (text[i] === ")") depth++;
        else if (text[i] === "(") { if (depth === 0) { open = i; break; } depth--; }
      }
      let close = e;
      if (open >= 0) {
        for (let i = c.end, depth = 0; i < e; i++) {
          if (text[i] === "(") depth++;
          else if (text[i] === ")") { if (depth === 0) { close = i; break; } depth--; }
        }
      }
      // the clause the citation closes: back from its parenthesis (or the CR) to ; : ( ) or the sentence start, 8 words
      const pre = open >= 0 ? open : c.start;
      let clause = s;
      for (let i = pre - 1; i >= s; i--) if (/[;:()]/.test(text[i])) { clause = i + 1; break; }
      for (const o of cites) if (o.end <= pre && o.end > clause) clause = o.end;
      const clauseFrom = lastWordsFrom(text, clause, pre, 8);
      // what follows: to the paren's close, or (unparenthesized) to the next delimiter, at most 6 words
      let after = close;
      if (open < 0) {
        let stop = e;
        for (let i = c.end; i < e; i++) if (/[();,+/]/.test(text[i])) { stop = i; break; }
        after = firstWordsTo(text, c.end, stop, 6);
      }
      for (const o of cites) if (o.start >= c.end && o.start < after) after = o.start;
      const firstWord = s + text.slice(s).match(/^\s*/)[0].length;
      const mentions = mentionsIn(text, s, e, lexicon).filter((m) => {
        // a keyword right after ANOTHER citation names that one ("CR 701.18 reveal, CR 701.16 …")
        const owner = cites.filter((o) => o.end <= m.start).pop();
        return !owner || owner === c || !GAP_AFTER.test(text.slice(owner.end, m.start));
      }).map((m) => {
        const before = m.end <= c.start ? text.slice(m.end, c.start) : null;
        const following = m.start >= c.end ? text.slice(c.end, m.start) : null;
        const inClause = (m.start >= clauseFrom && m.end <= pre) || (open >= 0 && m.start > open && m.end <= c.start);
        const inAfter = m.start >= c.end && m.end <= after;
        const upper = /[A-Z]{2}/.test(m.word) && m.word === m.word.toUpperCase();
        const strong = (before !== null && GAP_BEFORE.test(before))
          || (following !== null && inAfter && GAP_AFTER.test(following))
          || (upper && (inClause || inAfter))
          || (m.start === firstWord && /^[A-Z]/.test(m.word) && m.start >= clauseFrom && m.end <= pre);
        return { ...m, strong, near: strong || inClause || inAfter };
      });
      const citedHere = new Set(cites.filter((o) => o.start >= s && o.end <= e).flatMap((o) => o.nums.map((n) => sectionOf(n.rule))));
      for (const n of nums) {
        const sec = sectionOf(n.rule);
        const S = sections[sec];
        if (near) near.set(u.start + n.start, mentions.filter((m) => m.near).map((m) => m.section));
        if (namesSection(sentence, S, lexicon)) continue;
        const own = S.subText[n.rule.slice(sec.length)] || S.text; // the cited rule's own words
        const cands = mentions.filter((m) => m.near && m.section !== sec && familyOf(m.section) === familyOf(sec)
          && !citedHere.has(m.section) && !m.lex.one.test(own));
        if (!cands.length) continue;
        const strong = [...new Set(cands.filter((m) => m.strong).map((m) => m.section))];
        const pick = strong.length ? strong : [...new Set(cands.map((m) => m.section))];
        const offset = u.start + n.start;
        out.push({
          offset,
          line: source.slice(0, offset).split("\n").length,
          kind: u.kind,
          rule: n.rule,
          section: sec,
          citedKeyword: S.title,
          tier: strong.length ? "named" : "weak",
          ambiguous: pick.length > 1,
          correct: pick.length === 1 ? pick[0] : null,
          named: pick.length === 1 ? sections[pick[0]].title : null,
          word: pick.length === 1 ? cands.find((m) => m.section === pick[0]).word : null,
          candidates: pick.map((x) => `${sections[x].title} (${x})`),
          sentence: sentence.replace(/\s+/g, " ").trim(),
        });
      }
    }
  }
  return out;
}

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

/**
 * Check `files` against `rules` (the parsed CR JSON). Returns { checked, hits, advisory }: `hits` are the named,
 * unambiguous findings plus the weak ones a named finding corroborates (same cited section → same named section);
 * `advisory` is the rest (ambiguous, or weak and uncorroborated). Each finding carries `file` (relative to `root`).
 */
function findKeywordMismatches(rules, files, root = APP_ROOT) {
  const kw = keywordMap(rules);
  const all = [];
  const sources = new Map();
  let checked = 0;
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    if (!/70[12]\.\d/.test(source)) continue;
    const rel = path.relative(root, file).split(path.sep).join("/");
    sources.set(rel, { file, source });
    for (const u of proseUnits(source, file)) {
      for (const c of citesIn(u.text)) checked += c.nums.filter((n) => kw.sections[sectionOf(n.rule)]).length;
    }
    const near = new Map();
    for (const f of keywordFindings(source, file, kw, near)) all.push({ file: rel, ...f });
    sources.get(rel).near = near;
  }
  const remaps = new Set(all.filter((f) => f.tier === "named" && !f.ambiguous).map((f) => `${f.section}>${f.correct}`));
  const hits = [];
  const advisory = [];
  for (const f of all) {
    if (!f.ambiguous && (f.tier === "named" || remaps.has(`${f.section}>${f.correct}`))) hits.push(f);
    else advisory.push(f);
  }
  // The same file's other citations of a remapped section: where a file's hits move section X to one section Y, a
  // citation of X in that file with no other same-family keyword where a comment names what it cites, under prose
  // that names Y and never X (the comments and titles from 40 lines above it through its own comment — "the source's
  // hit landed even as it died (CR 701.12c)" inside fight.test.js's ETB-FIGHT test), is the same author's same stale
  // number: it moves with them. Prose that names X's own keyword keeps X; a citation that already has a finding (or
  // an advisory reading) is not touched here.
  const byFile = new Map();
  for (const h of hits) {
    if (!byFile.has(h.file)) byFile.set(h.file, new Map());
    const m = byFile.get(h.file);
    m.set(h.section, m.has(h.section) && m.get(h.section) !== h.correct ? null : h.correct);
  }
  const seen = new Set(all.map((f) => `${f.file}@${f.offset}`));
  for (const [rel, moves] of byFile) {
    const { file, source, near } = sources.get(rel);
    const units = proseUnits(source, file);
    const starts = [0];
    for (let i = source.indexOf("\n"); i >= 0; i = source.indexOf("\n", i + 1)) starts.push(i + 1);
    const lineAt = (offset) => {
      let lo = 0;
      let hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
      }
      return lo + 1;
    };
    for (const u of units) {
      for (const c of citesIn(u.text)) {
        const [s, e] = sentenceAround(u.text, c.start, c.end);
        const sentence = u.text.slice(s, e);
        for (const n of c.nums) {
          const sec = sectionOf(n.rule);
          const to = moves.get(sec);
          const offset = u.start + n.start;
          if (!to || seen.has(`${rel}@${offset}`)) continue;
          const line = lineAt(offset);
          const context = units.filter((o) => o.start <= u.start && lineAt(o.end) >= line - 40).map((o) => o.text).join(" ");
          if (namesSection(context, kw.sections[sec], kw.lexicon) || !namesSection(context, kw.sections[to], kw.lexicon)) continue;
          if ((near.get(offset) || []).some((x) => familyOf(x) === familyOf(sec) && x !== to)) continue;
          hits.push({
            file: rel, offset, line: source.slice(0, offset).split("\n").length, kind: u.kind, rule: n.rule, section: sec,
            citedKeyword: kw.sections[sec].title, tier: "file", ambiguous: false, correct: to, named: kw.sections[to].title,
            word: null, candidates: [`${kw.sections[to].title} (${to})`], sentence: sentence.replace(/\s+/g, " ").trim(),
          });
        }
      }
    }
  }
  hits.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.offset - b.offset));
  return { checked, hits, advisory };
}

module.exports = { keywordMap, proseUnits, citesIn, sentenceAround, keywordFindings, findKeywordMismatches, walk, CR_FILE, SRC, APP_ROOT };

if (require.main === module) {
  const rules = JSON.parse(fs.readFileSync(CR_FILE, "utf8"));
  const { checked, hits, advisory } = findKeywordMismatches(rules, walk(SRC));
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ checked, hits, advisory }, null, 2));
  } else {
    for (const h of hits) {
      console.log(`${h.file}:${h.line}  CR ${h.rule} is ${h.citedKeyword}; the comment names ${h.named} (CR ${h.correct})  ::  ${h.sentence.slice(0, 120)}`);
    }
    if (process.argv.includes("--all")) {
      for (const h of advisory) {
        const why = h.ambiguous ? `names ${h.candidates.join(" and ")}` : `nearby ${h.named} (CR ${h.correct}), uncorroborated`;
        console.log(`  advisory ${h.file}:${h.line}  CR ${h.rule} is ${h.citedKeyword}; ${why}  ::  ${h.sentence.slice(0, 120)}`);
      }
    }
    console.log(`${checked} keyword-section citations checked; ${hits.length} cite a different keyword than their comment names${advisory.length ? ` (${advisory.length} advisory, --all lists them)` : ""}`);
  }
  process.exit(hits.length ? 1 : 0);
}
