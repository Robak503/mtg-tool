/**
 * build-residue-census.mjs — the "ask the classifier, not the cards" unbuilt-subsystem census
 * (Colton-approved strategy pivot, 2026-07-24: subsystem-first grinding, ranked by real payoff).
 *
 *   MTG_APP_ROOT=<root> node scripts/build-residue-census.mjs [--out=<path>] [--top=30]
 *
 * METHOD — DELETION PROBING (v2; v1's line-level heuristics mis-blamed built subsystems — "enchant
 * creature" ranked #1 with 619 carriers because the extractor imitated the classifier instead of
 * asking it; the aura pipeline credits those lines fine). For every REAL, NON-NATIVE card:
 *
 *   1. SOLE-BLOCKER probe: re-classify the card with each oracle line removed, one at a time. If a
 *      deletion flips the card native, the classifier itself just confessed that line is THE blocker
 *      — fixing that one shape flips the whole card (the whole-card law respected by construction).
 *      These are the census's strong counts: cluster.soleBlockers = "cards this shape alone holds back."
 *   2. CO-BLOCKER probe (multi-blocker cards only — no single deletion flips): probe each line ALONE
 *      on the card's own name/type/mana. A line that stays non-native in isolation is independently
 *      unreadable and gets a weak credit (cluster.coBlockers) — real residue, but fixing it alone
 *      does NOT flip its card.
 *
 * Both probes are classifier-EXACT: no text-pattern proxies anywhere (the slice manifest's pattern
 * method mistagged Vibrance/Pact/Land Tax in one night; v1 of THIS tool face-planted the same way).
 * Clauses normalize (numbers→N, pips→{C}, self-name→~) and cluster by exact normalized shape; ranking
 * is soleBlockers desc (the true +N payoff), popular≤5k-EDHREC as the tiebreak column.
 *
 * HONESTY BOUNDS: one shape = one cluster ≠ automatically one fix (counter-proofing: one theme,
 * three code paths) — the census sizes the candidate list exactly; the build still opens the file.
 * Multi-line interactions (a line that only blocks in combination) surface as co-blockers on every
 * involved line rather than a sole blocker on any. ~5 classifications per non-native card ≈ a few
 * minutes over the full corpus. Local-only dev tool (bundled corpus via MTG_APP_ROOT); not in CI.
 */
import fs from "node:fs";

import { allCards, publicCard } from "../src/lib/server/cardIndex.js";
import { classifyCard, isNativeTier } from "../src/lib/learn/coverage.js";

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const TOP = Number(argv.top) > 0 ? Number(argv.top) : 30;

function isRealCard(c) {
  const t = c.type || "";
  if (!t) return false;
  return !/\b(Token|Emblem|Scheme|Plane|Phenomenon|Vanguard|Dungeon|Conspiracy|Sticker|Attraction|Card)\b/.test(t);
}

const stripReminder = (s) => String(s || "").replace(/\([^)]*\)/g, " ").replace(/[ \t]+/g, " ");
const NUM_WORDS = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty)\b/g;
function normalizeClause(text, cardName) {
  let t = stripReminder(text).toLowerCase().trim();
  const full = String(cardName || "").toLowerCase();
  const short = full.split(",")[0].trim();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (full) t = t.replace(new RegExp(`\\b${esc(full)}\\b`, "g"), "~");
  if (short && short !== full && short.length > 2) t = t.replace(new RegExp(`\\b${esc(short)}\\b`, "g"), "~");
  t = t.replace(/\{[^}]+\}/g, "{C}");
  t = t.replace(NUM_WORDS, "N").replace(/\b\d+\b/g, "N");
  t = t.replace(/[+-]n\/[+-]n/g, "+N/+N");
  return t.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
}
// Coarse KIND label for reporting only (never used for attribution — the probes own that).
function kindOf(line) {
  const l = stripReminder(line).trim();
  if (/^(When|Whenever|At)\b/i.test(l) || /—\s*(When|Whenever|At)\b/i.test(l)) return "trigger";
  if (/^[^:\n"“]{1,80}:\s/.test(l)) return "activated";
  return "static/spell";
}

const clusters = new Map(); // key -> { kind, norm, soleBlockers, coBlockers, popular, examples }
function credit(kindKey, norm, { sole, popular, name }) {
  if (!norm || norm.length < 8) return;
  const key = `${norm}`;
  let c = clusters.get(key);
  if (!c) clusters.set(key, (c = { kind: kindKey, norm, soleBlockers: 0, coBlockers: 0, popular: 0, examples: [] }));
  if (sole) c.soleBlockers += 1; else c.coBlockers += 1;
  if (popular && sole) c.popular += 1;
  if (c.examples.length < 4 && !c.examples.includes(name)) c.examples.push(name);
}

const multiFlip = []; // cards where >1 single-line deletion flips native — a tier-composition failure
const nativeShapes = new Map(); // normalized clause -> how many NATIVE cards carry it
let scanned = 0, nonNative = 0, soleFlips = 0, multiBlocker = 0, probes = 0;
const t0 = Date.now();
for (const raw of allCards()) {
  const pc = publicCard(raw, [], {});
  if (!isRealCard(pc)) continue;
  scanned += 1;
  const base = { name: pc.name, type: pc.type, oracle: pc.oracle, mana: pc.mana, keywords: pc.keywords };
  probes += 1;
  if (isNativeTier(classifyCard(base))) {
    // BUG-SIGNATURE INPUT (2026-07-25): record every clause shape that appears on a card the engine ALREADY
    // plays faithfully. A shape that is simultaneously a sole BLOCKER elsewhere cannot be an unbuilt
    // mechanic — it is built, and something upstream mis-binds it on the blocked cards. Three consecutive
    // slices (14/15/16) were found exactly this way, by eye; this column makes it mechanical.
    for (const line of String(pc.oracle || "").split(/\n/)) {
      const t = line.trim();
      if (!t) continue;
      const shape = normalizeClause(t, pc.name);
      nativeShapes.set(shape, (nativeShapes.get(shape) || 0) + 1);
    }
    continue;
  }
  nonNative += 1;
  const popular = Number.isFinite(raw.edhrec_rank) && raw.edhrec_rank <= 5000;
  const lines = String(pc.oracle || "").split("\n").filter((l) => l.trim());
  if (!lines.length || lines.length > 14) continue; // vanilla-with-no-text (shouldn't be non-native) / degenerate outliers

  // Probe 1 — sole blockers: remove one line, re-classify.
  const flips = [];
  for (let i = 0; i < lines.length; i++) {
    const variant = lines.filter((_, j) => j !== i).join("\n");
    probes += 1;
    if (isNativeTier(classifyCard({ ...base, oracle: variant }))) flips.push(i);
  }
  if (flips.length > 1) {
    // TWO-FLIP SIGNATURE (2026-07-25): more than one single-line deletion flips this card native, so every
    // piece is demonstrably understood in isolation — what's broken is how the TIERS COMPOSE, not a missing
    // mechanic. Slice 20 (the kicker gate hard-coding native-body) came straight off this. Usually a cheaper
    // and more valuable fix than a new lane, so it gets its own report.
    multiFlip.push({ name: pc.name, lines: flips.map((i) => normalizeClause(lines[i], pc.name)) });
  }
  if (flips.length) {
    soleFlips += 1;
    for (const i of flips) credit(kindOf(lines[i]), normalizeClause(lines[i], pc.name), { sole: true, popular, name: pc.name });
    continue;
  }

  // Probe 2 — co-blockers: each line alone on the same body; still-non-native lines are independently unreadable.
  multiBlocker += 1;
  for (const line of lines) {
    probes += 1;
    if (!isNativeTier(classifyCard({ ...base, oracle: line }))) {
      credit(kindOf(line), normalizeClause(line, pc.name), { sole: false, popular, name: pc.name });
    }
  }
}

for (const c of clusters.values()) c.nativeCarriers = nativeShapes.get(c.norm) || 0;
const ranked = [...clusters.values()].sort((a, b) => b.soleBlockers - a.soleBlockers || b.popular - a.popular || b.coBlockers - a.coBlockers);
// THE BUG-SIGNATURE REPORT: a shape that BLOCKS cards while other cards carrying it classify native.
const suspects = [...clusters.values()].filter((c) => c.soleBlockers > 0 && c.nativeCarriers > 0)
  .sort((a, b) => (b.nativeCarriers * b.soleBlockers) - (a.nativeCarriers * a.soleBlockers));
const payload = {
  method: "deletion probing (v2): sole-blocker = removing the line flips the card native (classifier-exact, whole-card law); co-blocker = line independently unreadable on a multi-blocker card",
  scanned, nonNative, soleBlockerCards: soleFlips, multiBlockerCards: multiBlocker, probes,
  elapsedMs: Date.now() - t0,
  clusters: ranked,
  suspects,
};
if (typeof argv.out === "string") fs.writeFileSync(argv.out, JSON.stringify(payload, null, 1));

console.log(`scanned=${scanned} nonNative=${nonNative} soleBlockerCards=${soleFlips} multiBlockerCards=${multiBlocker} probes=${probes} in ${Math.round((Date.now() - t0) / 1000)}s${typeof argv.out === "string" ? ` → ${argv.out}` : ""}`);
console.log(`\nTOP ${TOP} by SOLE-BLOCKER count (sole | pop≤5k | co | kind | shape | examples):`);
for (const c of ranked.slice(0, TOP)) {
  console.log(`${String(c.soleBlockers).padStart(5)} | ${String(c.popular).padStart(4)} | ${String(c.coBlockers).padStart(4)} | ${c.kind.padEnd(12)} | ${c.norm.slice(0, 100)}${c.norm.length > 100 ? "…" : ""}  [${c.examples.slice(0, 2).join(" · ")}]`);
}

// ===== BUG-SIGNATURE REPORT =====
// A shape that BLOCKS some cards while OTHER cards carrying the same shape classify native cannot be an
// unbuilt mechanic — it is built, and something upstream mis-binds it. Read this list BEFORE the ranked
// list: these are defect reports, and they are usually cheaper and more valuable than a new lane.
console.log(`
BUG SIGNATURES — shapes that block cards yet appear on NATIVE cards (native | sole | shape):`);
if (!suspects.length) console.log("   (none — every blocking shape is genuinely unbuilt)");
for (const c of suspects.slice(0, 15)) {
  console.log(`${String(c.nativeCarriers).padStart(6)} | ${String(c.soleBlockers).padStart(4)} | ${c.norm.slice(0, 96)}${c.norm.length > 96 ? "…" : ""}  [${c.examples.slice(0, 2).join(" · ")}]`);
}

console.log(`
TWO-FLIP SIGNATURE — >1 single-line deletion flips these native (tier COMPOSITION failure, not a missing mechanic): ${multiFlip.length}`);
for (const c of multiFlip.slice(0, 12)) {
  console.log(`   ${c.name}`);
  for (const l of c.lines) console.log(`      · ${l.slice(0, 92)}`);
}
