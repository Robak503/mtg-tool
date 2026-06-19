/**
 * qa-sweep.mjs — Hans's adversarial false-positive hunter (committed QA dev tool; salvaged from Rod).
 *
 * Runs the REAL classifier (the same coverage.js the runtime uses) over the whole
 * corpus, enumerates the native (HIGH) set, and surfaces FALSE-POSITIVE CANDIDATES
 * via structural heuristics. Candidates are NOT findings — read each one and confirm
 * a dropped/wrong behavior before filing. The point is to narrow ~6k native cards
 * down to a readable suspect list. Local-only (reads the bundled oracle index), so
 * it isn't part of CI — like scripts/measure-coverage.mjs.
 *
 *   MTG_APP_ROOT=<repo>/app/src-tauri/resources node scripts/qa-sweep.mjs [tiers|spells|hardspells|triggers|keywords]
 *
 * Heuristics:
 *   - SPELL verb-coverage: an effect verb present in the oracle that NO program atom
 *     covers → a clause the program may have silently dropped.
 *   - SPELL shape: HIGH program with a non-null unparsedTail, or oracle-sentence-count
 *     > atom-count → a possible dropped sentence.
 *   - TRIGGER compound-collapse: a native-trigger/mixed card whose single trigger
 *     sentence carries TWO events ("enters or leaves", "... and whenever ...") —
 *     detectTriggers may keep one and drop the rest (known backlog hazard).
 *   - KEYWORD enforcement: every keyword in COVERED_KEYWORDS the runtime does NOT
 *     actually enforce (via permanentHasKeyword / an SBA / attack-legality) is a
 *     false positive — a body claimed native on its basis mis-resolves. The audit
 *     flags any COVERED_KEYWORD outside the ENFORCED allowlist (Hans cycle-1 finding).
 */
import { allCards, publicCard } from "../src/lib/server/cardIndex.js";
import { classifyCard, isNativeTier, COVERED_KEYWORDS, isKeywordOnly } from "../src/lib/learn/coverage.js";
import { parseEffectProgram } from "../src/lib/learn/effects/parser.js";
import { detectTriggers } from "../src/lib/learn/triggers.js";

const arg = (process.argv[2] || "").toLowerCase();

// The keywords the runtime ACTUALLY enforces (grep: permanentHasKeyword / SBA / attack-legality).
const ENFORCED_KEYWORDS = new Set([
  "flying", "reach", "first strike", "double strike", "trample", "deathtouch",
  "lifelink", "vigilance", "haste", "indestructible",
]);
const ALLOWED_UNENFORCED = new Set(["flash", "changeling", "devoid"]); // safe: timing/identity, never mis-resolve a body
// INTERIM-FP: unenforced TODAY but knowingly KEPT claimed native while enforcement is built (enforce-don't-drop
// policy, retired-fp-ledger.md). These are expected, tracked live FPs — NOT an alarm. Only a COVERED_KEYWORD
// that is none of {enforced, safe, interim-tracked} is a NEW untracked over-claim worth flagging.
const KNOWN_INTERIM_FP = new Set([
  "menace", "skulk", "intimidate", "fear", "horsemanship", "defender", // → EVADE / attack-legality
  "hexproof", "shroud", "ward", "protection",                          // → TARGET-RESTRICT
  "prowess",                                                           // → PROWESS cast-trigger
]);

function isRealCard(c) {
  const t = c.type || "";
  if (!t) return false;
  return !/\b(Token|Emblem|Scheme|Plane|Phenomenon|Vanguard|Dungeon|Conspiracy|Sticker|Attraction|Card)\b/.test(t);
}

const strip = (s) => String(s || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();

// An atom op → the oracle phrase(s) it legitimately "consumes". Used to decide whether
// an effect verb in the oracle is accounted for by SOME atom in the program.
const OP_COVERS = {
  "deal-damage": [/\bdeals?\b[^.]*\bdamage\b/],
  "destroy": [/\bdestroy\b/],
  "draw": [/\bdraws?\b/],
  "pump": [/\bgets?\s*[+-]\d/, /\bgains?\b/],
  "gain-life": [/\bgains?\s+\d+\s+life\b/, /\bgain\s+life\b/],
  "lose-life": [/\bloses?\s+\d+\s+life\b/, /\blose\s+life\b/, /\bloses?\s+life\b/],
  "tap": [/\btaps?\b/],
  "untap": [/\buntaps?\b/],
  "bounce": [/\breturns?\b/],
  "exile": [/\bexiles?\b/],
  "add-counter": [/\bcounters?\b/, /\bdistributes?\b/],
  "return-from-graveyard": [/\breturns?\b/],
  "reanimate": [/\breturns?\b/],
  "discard-chosen": [/\bdiscards?\b/],
  "sacrifice": [/\bsacrifices?\b/],
  "create-token": [/\bcreates?\b/, /\btokens?\b/],
  "counter": [/\bcounter\b[^.]*\bspell\b/, /\bcounters?\s+target\b/],
  "tutor": [/\bsearch\b/, /\bshuffles?\b/],
  "shuffle": [/\bshuffles?\b/],
  "scry": [/\bscry\b/],
  "surveil": [/\bsurveils?\b/],
  "impulse-dig": [/\blook at the top\b/],
  "mill": [/\bmills?\b/],
};

// Effect verbs that, if present in oracle, demand a covering atom. (Riders the parser
// intentionally treats as vacuous are excluded so they don't raise false alarms.)
const ORACLE_VERBS = [
  ["damage", /\bdeals?\b[^.]*\bdamage\b/],
  ["destroy", /\bdestroy\b/],
  ["draw", /\bdraws?\b/],
  ["exile", /\bexile\b/],
  ["create", /\bcreates?\b/],
  ["token", /\btokens?\b/],
  ["return", /\breturns?\b/],
  ["counterspell", /\bcounter target\b/],
  ["tap", /\btaps?\b/],
  ["untap", /\buntaps?\b/],
  ["gain-life", /\bgains?\s+\d+\s+life\b/],
  ["lose-life", /\bloses?\s+\d+\s+life\b/],
  ["search", /\bsearch\b/],
  ["scry", /\bscry\b/],
  ["surveil", /\bsurveil\b/],
  ["mill", /\bmills?\b/],
  ["discard", /\bdiscards?\b/],
  ["sacrifice", /\bsacrifices?\b/],
  ["counters", /\b(?:\+1\/\+1|\-1\/\-1) counter|put (?:a|one|two|three|\d+|x) [^.]*counters?\b/],
  ["shuffle", /\bshuffle\b/],
  ["gainctrl", /\bgains? control\b/],
  ["copy", /\bcopy\b/],
];

function flattenAtoms(program) {
  const atoms = [];
  const walk = (list) => {
    for (const a of list || []) {
      atoms.push(a);
      if (a.atoms) walk(a.atoms);
      if (a.modes) for (const m of a.modes) walk(m.atoms || []);
    }
  };
  walk(program.atoms || []);
  if (program.modal?.modes) for (const m of program.modal.modes) walk(m.atoms || []);
  return atoms;
}

function spellCandidate(c) {
  const program = parseEffectProgram({ type: c.type, oracle: c.oracle, mana: c.mana, name: c.name });
  if (!program) return null;
  const atoms = flattenAtoms(program);
  const ops = atoms.map((a) => a.op);
  const oracle = strip(c.oracle).toLowerCase().replace(/[’]/g, "'");
  const flags = [];

  // Verb coverage: an oracle effect-verb not consumed by any atom op present.
  for (const [verb, re] of ORACLE_VERBS) {
    if (!re.test(oracle)) continue;
    const covered = ops.some((op) => (OP_COVERS[op] || []).some((r) => r.test(oracle)));
    // Verb is present; is there an atom whose op-coverage regex matches THIS verb region?
    const verbCoveredByAnAtom = ops.some((op) => {
      const covs = OP_COVERS[op] || [];
      return covs.some((r) => r.test(oracle)) && opMatchesVerb(op, verb);
    });
    if (!verbCoveredByAnAtom && !covered) flags.push(`verb:${verb}`);
    else if (!verbCoveredByAnAtom) flags.push(`verb?:${verb}`);
  }

  if (program.unparsedTail) flags.push("unparsedTail");
  // Sentence vs atom count (rough — riders/strips can legitimately reduce it).
  const sentences = strip(c.oracle).split(/(?:\.\s+|;\s*)/).map((s) => s.replace(/\.\s*$/, "").trim()).filter(Boolean);
  if (sentences.length > atoms.length + 0) flags.push(`sent${sentences.length}>atoms${atoms.length}`);

  return { ops, flags };
}

// Loose op↔verb association so a verb is "covered" only by a plausibly-related atom.
function opMatchesVerb(op, verb) {
  const map = {
    damage: ["deal-damage"], destroy: ["destroy"], draw: ["draw"], exile: ["exile"],
    create: ["create-token"], token: ["create-token"], return: ["bounce", "return-from-graveyard", "reanimate"],
    counterspell: ["counter"], tap: ["tap"], untap: ["untap"], "gain-life": ["gain-life"],
    "lose-life": ["lose-life"], search: ["tutor"], scry: ["scry"], surveil: ["surveil"],
    mill: ["mill"], discard: ["discard-chosen"], sacrifice: ["sacrifice"], counters: ["add-counter"],
    shuffle: ["shuffle", "tutor"], gainctrl: [], copy: [],
  };
  return (map[verb] || []).includes(op);
}

// ===== run =====
const tierCounts = {};
const spellSuspects = [];
const triggerSuspects = [];
const nativeBodyCards = [];

const COMPOUND_TRIGGER = /\b(enters[^.]*\bor\b[^.]*\b(?:leaves|dies)|or leaves the battlefield|dies[^.]*\bor\b[^.]*enters|attacks or blocks?[^.]*,|and whenever|or whenever)\b/i;

for (const raw of allCards()) {
  let c;
  try { c = publicCard(raw); } catch { continue; }
  if (!isRealCard(c)) continue;
  const tier = classifyCard(c);
  tierCounts[tier] = (tierCounts[tier] || 0) + 1;
  if (!isNativeTier(tier)) continue;
  if (tier === "native-body") nativeBodyCards.push(c);

  if (tier === "native-spell") {
    const r = spellCandidate(c);
    if (r && r.flags.length) spellSuspects.push({ name: c.name, ...r, oracle: strip(c.oracle) });
  }
  if (tier === "native-trigger" || tier === "native-mixed") {
    const oracle = strip(c.oracle);
    const triggerSentences = (oracle.match(/(?:^|[.;]\s*)(?:When|Whenever|At)\b[^.]+\./gi) || []);
    const detected = detectTriggers(c);
    const compound = triggerSentences.some((s) => COMPOUND_TRIGGER.test(s) || (/\band\b/.test(s.replace(/^[^A-Za-z]*(?:when|whenever|at)\b[^,]*,/i, "")) && /\b(then|also|and (?:draw|create|destroy|exile|put|deal|gain|each|target|return|sacrifice))\b/i.test(s)));
    if (compound) triggerSuspects.push({ name: c.name, tier, detected: detected.length, oracle });
  }
}

if (!arg || arg === "tiers") {
  console.log("=== TIER COUNTS (corpus) ===");
  let nat = 0, tot = 0;
  for (const [k, n] of Object.entries(tierCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(6)}  ${k}`);
    tot += n; if (isNativeTier(k)) nat += n;
  }
  console.log(`  native ${nat}/${tot} = ${(100 * nat / tot).toFixed(1)}%`);
  console.log(`\n  spell suspects: ${spellSuspects.length} · trigger compound-collapse suspects: ${triggerSuspects.length}`);
}

if (arg === "spells") {
  // Sort: hard uncovered verb first, then unparsedTail, then sentence-gap.
  const rank = (s) => (s.flags.some((f) => f.startsWith("verb:")) ? 0 : s.flags.includes("unparsedTail") ? 1 : 2);
  for (const s of spellSuspects.sort((a, b) => rank(a) - rank(b))) {
    console.log(`\n[${s.flags.join(",")}]  ${s.name}  ops=[${s.ops.join(",")}]`);
    console.log(`   ${s.oracle}`);
  }
  console.log(`\nTOTAL spell suspects: ${spellSuspects.length}`);
}

if (arg === "hardspells") {
  const hard = spellSuspects.filter((s) => s.flags.some((f) => f.startsWith("verb:")));
  for (const s of hard) {
    console.log(`\n[${s.flags.join(",")}]  ${s.name}  ops=[${s.ops.join(",")}]`);
    console.log(`   ${s.oracle}`);
  }
  console.log(`\nTOTAL hard-uncovered-verb spell suspects: ${hard.length}`);
}

if (arg === "triggers") {
  for (const s of triggerSuspects) {
    console.log(`\n${s.name}  [${s.tier}, detected=${s.detected}]`);
    console.log(`   ${s.oracle}`);
  }
  console.log(`\nTOTAL trigger compound-collapse suspects: ${triggerSuspects.length}`);
}

if (arg === "keywords") {
  // isKeywordOnly's exact rule, but with one keyword removed — to count native-body
  // bodies that rest SOLELY on a given covered keyword (i.e. drop if it's de-listed).
  const reminderStripped = (s) => String(s || "").replace(/\([^)]*\)/g, " ").toLowerCase().replace(/[’']/g, "'");
  const keywordOnlyWithout = (oracle, drop) => {
    const kws = COVERED_KEYWORDS.filter((k) => k !== drop);
    const t = reminderStripped(oracle);
    if (!t.trim()) return true;
    return t.split(/[,;.!?\n]|\band\b/).map((c) => c.trim()).filter(Boolean)
      .every((c) => kws.some((k) => c === k || c === `${k}.` || c.startsWith(`${k} `)));
  };
  console.log("=== COVERED_KEYWORDS enforcement audit ===");
  console.log("  (enforce-don't-drop: interim-FP keywords are KEPT native while enforcement is built — tracked,");
  console.log("   not an alarm; only a keyword that is none of {enforced, safe, interim-tracked} is a NEW over-claim)\n");
  let newRisk = 0;
  for (const kw of COVERED_KEYWORDS) {
    const enforced = ENFORCED_KEYWORDS.has(kw);
    const safe = ALLOWED_UNENFORCED.has(kw);
    const interim = KNOWN_INTERIM_FP.has(kw);
    const dependents = nativeBodyCards.filter((c) => !keywordOnlyWithout(c.oracle, kw) && isKeywordOnly(c.oracle)).length;
    const tag = enforced ? "enforced" : safe ? "safe (timing/identity)"
      : interim ? "interim-FP (enforcement queued — retired-fp-ledger.md)" : "*** NEW UNTRACKED OVER-CLAIM ***";
    if (!enforced && !safe && !interim) newRisk++;
    console.log(`  ${String(dependents).padStart(4)} native-body  ${kw.padEnd(14)} ${tag}`);
  }
  console.log(`\n  ${newRisk === 0
    ? "OK — every COVERED_KEYWORD is enforced, a safe non-resolving keyword, or a tracked interim FP."
    : `${newRisk} COVERED_KEYWORD(s) are NEW untracked over-claims → confirm + either enforce or add to the ledger.`}`);
}
