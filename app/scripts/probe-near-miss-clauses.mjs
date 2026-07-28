/**
 * probe-near-miss-clauses.mjs — THE MISSING-CROSS FINDER.
 *
 *   MTG_APP_ROOT=<root> node scripts/probe-near-miss-clauses.mjs [--maxRank=5000] [--distance=3] [--top=40]
 *
 * WHY THIS EXISTS. Two slices in a row (2026-07-28) were the same shape and neither was a new mechanic:
 *
 *   Mirari's Wake   "Whenever YOU tap a LAND for mana, add one mana of any type that land produced"
 *   Mana Flare      "Whenever a PLAYER taps a LAND for mana, that player adds …"        ← native
 *   Kinnan          "Whenever YOU tap a NONLAND PERMANENT for mana, add …"              ← native
 *
 *   Courser         "You may play LANDS from the top of your library"
 *   Future Sight    "You may play LANDS AND CAST SPELLS from the top of your library"   ← native
 *
 * Both were CORNERS OF A GRID whose other cells were already built. The runtime handled every axis; only
 * the parser lacked the cell. Both were found by eye, and the second only because the first made me look.
 * That is not a search strategy, so this is the mechanical version.
 *
 * METHOD. Classify every real card. Collect the clause shapes carried by NATIVE cards (the engine
 * demonstrably reads these). Then, for every PARKED card, deletion-probe for its SOLE BLOCKER clauses —
 * remove one line, re-classify, and if the card flips, that line is the blocker (the residue census's
 * probe, reused). For each blocker shape NOT in the native set, find the nearest NATIVE shape by
 * word-level edit distance. A blocker sitting 1–3 words from something the engine already reads is a
 * missing CROSS, not a missing mechanic — and usually cheap.
 *
 * ⚠️ NEAR ≠ EASY, and the ranking cannot tell you which. "Destroy target creature" and "Exile target
 * creature" are one word apart and different subsystems; "target opponent" vs "each opponent" is one word
 * and a different targeting model. The probe sizes the CANDIDATE list exactly; the build still opens the
 * file. Read the pair, then decide.
 *
 * Candidates are bucketed by their first-3 and last-3 words before comparison, so the scan stays linear-ish
 * instead of quadratic. That does mean a pair differing in BOTH its head and its tail is missed — an
 * accepted blind spot, since a cross that far apart is rarely one edit of work anyway.
 *
 * Local-only dev tool (bundled corpus via MTG_APP_ROOT); not in CI.
 */
import { allCards, publicCard } from "../src/lib/server/cardIndex.js";
import { classifyCard, isNativeTier } from "../src/lib/learn/coverage.js";

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const MAX_RANK = Number(argv.maxRank) > 0 ? Number(argv.maxRank) : 5000;
const MAX_DIST = Number(argv.distance) > 0 ? Number(argv.distance) : 3;
const TOP = Number(argv.top) > 0 ? Number(argv.top) : 40;

function isRealCard(c) {
  const t = c.type || c.type_line || "";
  if (!t) return false;
  return !/\b(Token|Emblem|Scheme|Plane|Phenomenon|Vanguard|Dungeon|Conspiracy|Sticker|Attraction|Card)\b/.test(t);
}

/** Normalize a clause the way the residue census does: reminder text out, numbers → N, pips → {C}, name → ~. */
function normalize(line, name) {
  let s = String(line).replace(/\([^)]*\)/g, " ");
  if (name) s = s.split(name).join("~");
  return s.toLowerCase()
    .replace(/\{[^}]*\}/g, "{c}")
    .replace(/\b\d+\b/g, "N")
    .replace(/[.,;:]+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const words = (s) => s.split(" ").filter(Boolean);

/** Word-level Levenshtein, bailed out once it exceeds `cap` (we only care about near misses). */
function wordDistance(a, b, cap) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
      if (cur[j] < best) best = cur[j];
    }
    if (best > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

const t0 = Date.now();
const cards = allCards().filter(isRealCard).map(publicCard);

// Pass 1 — the shapes the engine demonstrably reads, and the shapes that BLOCK a card.
const nativeShapes = new Map();  // shape → example card name
const parked = [];
for (const pc of cards) {
  const t = classifyCard(pc);
  const lines = String(pc.oracle || "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) continue;
  if (isNativeTier(t)) {
    for (const line of lines) {
      const shape = normalize(line, pc.name);
      if (shape && !nativeShapes.has(shape)) nativeShapes.set(shape, pc.name);
    }
  } else if (lines.length <= 14) {
    parked.push({ pc, lines });
  }
}

// Pass 2 — deletion-probe the parked cards for SOLE blockers, keeping only the popular ones.
const rankOf = new Map(allCards().map((c) => [c.name, c.edhrec_rank]));
const blockers = new Map(); // shape → { count, hot: [{name, rank}] }
for (const { pc, lines } of parked) {
  const rank = rankOf.get(pc.name);
  if (!Number.isFinite(rank) || rank > MAX_RANK) continue; // null <= N is TRUE in JS — an unranked card would sail through
  for (let i = 0; i < lines.length; i++) {
    const variant = lines.filter((_, j) => j !== i).join("\n");
    if (!isNativeTier(classifyCard({ ...pc, oracle: variant }))) continue;
    const shape = normalize(lines[i], pc.name);
    if (!shape || nativeShapes.has(shape)) continue; // already-read shapes are the census's bug-signature report, not this one
    const e = blockers.get(shape) || { count: 0, hot: [] };
    e.count++;
    if (e.hot.length < 4) e.hot.push({ name: pc.name, rank });
    blockers.set(shape, e);
  }
}

// Pass 3 — bucket the native shapes by head and tail, then find each blocker's nearest neighbour.
const buckets = new Map();
const key = (w, side) => (side === "head" ? `H:${w.slice(0, 3).join(" ")}` : `T:${w.slice(-3).join(" ")}`);
for (const shape of nativeShapes.keys()) {
  const w = words(shape);
  if (w.length < 3) continue;
  for (const side of ["head", "tail"]) {
    const k = key(w, side);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push({ shape, w });
  }
}

const finds = [];
for (const [shape, info] of blockers) {
  const w = words(shape);
  if (w.length < 3) continue;
  let best = null;
  const seen = new Set();
  for (const side of ["head", "tail"]) {
    for (const cand of buckets.get(key(w, side)) || []) {
      if (seen.has(cand.shape)) continue;
      seen.add(cand.shape);
      const d = wordDistance(w, cand.w, MAX_DIST);
      if (d <= MAX_DIST && (!best || d < best.d)) best = { d, shape: cand.shape, via: nativeShapes.get(cand.shape) };
    }
  }
  if (best) finds.push({ blocker: shape, ...info, ...best });
}

finds.sort((a, b) => a.d - b.d || b.count - a.count || Math.min(...a.hot.map((h) => h.rank)) - Math.min(...b.hot.map((h) => h.rank)));

const probed = parked.filter((p) => { const r = rankOf.get(p.pc.name); return Number.isFinite(r) && r <= MAX_RANK; }).length;
console.log(`native shapes: ${nativeShapes.size} · parked cards probed (rank<=${MAX_RANK}): ${probed} · near-miss blockers: ${finds.length} · ${Math.round((Date.now() - t0) / 1000)}s\n`);
console.log(`=== BLOCKER shapes within ${MAX_DIST} words of something the engine ALREADY reads ===`);
for (const f of finds.slice(0, TOP)) {
  console.log(`\ndist ${f.d} · blocks ${f.count} card(s)`);
  console.log(`  ✗ ${f.blocker}`);
  console.log(`  ✓ ${f.shape}   [native on: ${f.via}]`);
  console.log(`    ${f.hot.map((h) => `${h.name} #${h.rank}`).join(" · ")}`);
}
