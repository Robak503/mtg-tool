/**
 * build-slice-manifest.mjs — PHASE 0's star deliverable (cindy-corpus-roadmap): THE SLICE
 * MANIFEST. For each ladder subsystem: (a) the exact card list, (b) most-played weighting
 * (EDHREC-rank buckets), (c) transitive multi-clause yield — summed to an honest projected
 * end-number against the ONE corpus denominator.
 *
 *   MTG_APP_ROOT=<root> node scripts/build-slice-manifest.mjs [--out=<path>]
 *
 * METHOD (stated so the numbers are reproducible):
 * - Denominator = measure-coverage's isRealCard corpus (all bundled oracle cards minus
 *   tokens/emblems/schemes/etc.) — the SAME denominator the census headline uses.
 * - A non-native card is pattern-matched against the LADDER subsystem signatures below.
 *   DIRECT = it matches exactly ONE subsystem (that subsystem is plausibly its only
 *   blocker). TRANSITIVE = it matches ≥2 (flips only when its LAST blocker lands; counted
 *   once, at its first-listed subsystem, in the projection sum — never double-counted).
 * - Pattern-hits are a PROXY for the real blocker (the classifier's reasons aren't
 *   enumerable per-card); the manifest is a plan, the flip-diff is the truth at build time.
 * - Unmatched non-native cards fall to mechanismBucket groups (the bespoke/parser tail).
 */

import fs from "node:fs";
import { allCards, publicCard } from "../src/lib/server/cardIndex.js";
import { classifyCard, isNativeTier, mechanismBucket } from "../src/lib/learn/coverage.js";

const stripReminder = (s) => String(s || "").replace(/\([^)]*\)/g, "");

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

function isRealCard(c) {
  const t = c.type || "";
  if (!t) return false;
  return !/\b(Token|Emblem|Scheme|Plane|Phenomenon|Vanguard|Dungeon|Conspiracy|Sticker|Attraction|Card)\b/.test(t);
}

// ── THE LADDER SIGNATURES (roadmap Phase 2 + Phase 3 classes + Phase-1 subsystem slices) ──
// Order matters: a multi-match card is COUNTED at its first-listed match (projection dedupe).
const LADDER = [
  // Phase 2 — interaction (greenlit)
  ["wheels", /each player (discards (their|his or her) hand|shuffles (their|his or her) hand)|discards their hand, then draws/i],
  ["tutors", /search your library for (a|an|up to) (?!.*basic land)/i],
  ["counterspells", /counter target (spell|ability|activated|triggered)/i],
  // Phase 1 subsystem slices
  ["level-up", /level up \{|\blevel \d|class level/i],
  ["ordeal-cycle", /whenever .{0,40}attacks, put a \+1\/\+1 counter .{0,80}then sacrifice/i],
  ["loyalty-activated", /^\s*[+−–-]?\d*X?\s*:/m], // loyalty-shaped ability lines (PW type checked below)
  ["batch-combat-damage", /whenever one or more creatures? .{0,40}deal combat damage/i],
  // Phase 3 ladder
  ["transform-dfc", /\btransform(s|ed)?\b|daybound|nightbound|\/\/ /i],
  ["cumulative-upkeep", /cumulative upkeep/i],
  ["suspend", /\bsuspend\b|time counter/i],
  ["self-bounce", /return (a|another|target) (permanent|creature|land) you (own or )?control to (its owner's|your) hand/i],
  ["graft", /\bgraft\b/i],
  ["token-copies", /create a token that's a copy of|token copy of/i],
  ["bite-to-planeswalker", /deals? damage equal to (its|their) power to target .{0,20}planeswalker/i],
  ["target-player-mill", /target (player|opponent) mills?/i],
  ["detain", /\bdetain\b/i],
  ["cascade", /\bcascade\b/i],
  ["venture-dungeon", /venture into the dungeon|completed a dungeon/i],
  ["initiative", /take the initiative/i],
  ["incubate", /\bincubate\b/i],
  ["spore-counters", /spore counter/i],
];

const t0 = Date.now();
const corpus = [];
for (const c of allCards()) {
  const pc = publicCard(c);
  if (isRealCard(pc)) corpus.push({ pc, raw: c });
}

let native = 0;
const nonNative = [];
for (const { pc, raw } of corpus) {
  let tier;
  try { tier = classifyCard(pc); } catch { tier = "error"; }
  if (isNativeTier(tier)) { native += 1; continue; }
  nonNative.push({ pc, raw, tier });
}

// bucket helper over edhrec_rank (lower = more played)
const bucketOf = (rank) => (Number.isFinite(rank) ? (rank <= 1000 ? "top1k" : rank <= 2500 ? "top2500" : rank <= 5000 ? "top5k" : "tail") : "unranked");

const manifest = {}; // name -> { direct: [], transitive: [], buckets: {}, projected }
for (const [name] of LADDER) manifest[name] = { direct: [], transitive: [], buckets: { top1k: 0, top2500: 0, top5k: 0, tail: 0, unranked: 0 }, countedHere: 0 };
const fallback = {}; // mechanismBucket tail
let counted = new Set();

for (const { pc, raw } of nonNative) {
  const text = stripReminder(pc.oracle || "");
  const isPW = /\bPlaneswalker\b/.test(pc.type || "");
  const matches = [];
  for (const [name, re] of LADDER) {
    if (name === "loyalty-activated" && !isPW) continue;
    if (re.test(text) || (name === "transform-dfc" && /\/\//.test(pc.name || ""))) matches.push(name);
  }
  if (!matches.length) {
    const b = mechanismBucket(pc.oracle || "");
    fallback[b] = (fallback[b] || 0) + 1;
    continue;
  }
  const rank = raw.edhrec_rank ?? pc.edhrec_rank;
  const entry = { name: pc.name, rank: Number.isFinite(rank) ? rank : null };
  const home = matches[0];
  for (const m of matches) {
    if (m === home) {
      manifest[m][matches.length === 1 ? "direct" : "transitive"].push({ ...entry, alsoBlockedBy: matches.slice(1) });
      manifest[m].buckets[bucketOf(rank)] += 1;
      manifest[m].countedHere += 1;
      counted.add(pc.name);
    } else {
      manifest[m].transitive.push({ ...entry, countedAt: home });
    }
  }
}

const denominator = corpus.length;
const projectedFlips = counted.size;
const out = {
  builtAt: new Date().toISOString(),
  method: "pattern-proxy over the isRealCard corpus; multi-match counted once at first-listed subsystem; flip-diff is truth at build time",
  denominator,
  native,
  nativePct: +(100 * native / denominator).toFixed(1),
  nonNative: nonNative.length,
  ladderMatched: projectedFlips,
  projectedNative: native + projectedFlips,
  projectedPct: +(100 * (native + projectedFlips) / denominator).toFixed(1),
  unmatchedTail: nonNative.length - projectedFlips,
  fallbackBuckets: Object.fromEntries(Object.entries(fallback).sort((a, b) => b[1] - a[1])),
  subsystems: Object.fromEntries(Object.entries(manifest).map(([k, v]) => [k, {
    countedHere: v.countedHere,
    buckets: v.buckets,
    directN: v.direct.length,
    transitiveN: v.transitive.length,
    topCards: [...v.direct, ...v.transitive.filter((c) => !c.countedAt)].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)).slice(0, 15).map((c) => c.name + (c.rank ? ` (#${c.rank})` : "")),
    cards: v.direct.map((c) => c.name),
  }])),
};

const outPath = argv.out || "scripts/slice-manifest.json";
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`SLICE MANIFEST → ${outPath} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
console.log(`denominator=${denominator} native=${native} (${out.nativePct}%) | ladder-matched=${projectedFlips} → projected ${out.projectedNative} (${out.projectedPct}%) | unmatched tail=${out.unmatchedTail}`);
for (const [k, v] of Object.entries(out.subsystems).sort((a, b) => b[1].countedHere - a[1].countedHere)) {
  if (v.countedHere) console.log(`  ${k.padEnd(24)} ${String(v.countedHere).padStart(5)} counted (top1k=${v.buckets.top1k} top2.5k=${v.buckets.top1k + v.buckets.top2500} top5k=${v.buckets.top1k + v.buckets.top2500 + v.buckets.top5k})`);
}
