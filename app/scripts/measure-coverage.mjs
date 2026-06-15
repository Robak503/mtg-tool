/**
 * measure-coverage.mjs — dev dashboard for the Academy engine's native coverage.
 *
 *   npm run coverage            # every saved deck across all local profiles
 *   npm run coverage -- <name>  # only decks whose name includes <name> (case-insensitive)
 *
 * Enriches each deck card via the engine's own card index, classifies it with the
 * shared `coverage.js` module (the SAME logic the runtime uses to decide
 * native-vs-Arbiter), and prints per-deck + aggregate native %, the tier
 * breakdown, and the gap bucketed by mechanism (the roadmap). Local-only: it reads
 * profile decks + the bundled oracle index, so it isn't part of CI.
 */
import fs from "node:fs";
import path from "node:path";
import { lookupCard, publicCard } from "../src/lib/server/cardIndex.js";
import { coverageSummary, classifyCard, isNativeTier, mechanismBucket } from "../src/lib/learn/coverage.js";

const filter = (process.argv[2] || "").toLowerCase();
const profilesDir = path.join("data", "profiles");

function loadDecks() {
  const out = [];
  const seen = new Set();
  let dirs = [];
  try { dirs = fs.readdirSync(profilesDir).filter((d) => d.startsWith("prof_")); } catch { /* no profiles */ }
  for (const dir of dirs) {
    const file = path.join(profilesDir, dir, "decks.local.json");
    if (!fs.existsSync(file)) continue;
    let doc;
    try { doc = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }
    const decks = Array.isArray(doc) ? doc : (doc.decks || Object.values(doc).find(Array.isArray) || []);
    for (const dk of decks) {
      if (!dk?.name || seen.has(dk.name)) continue; // dedupe shared decks across profiles
      if (filter && !dk.name.toLowerCase().includes(filter)) continue;
      seen.add(dk.name);
      out.push(dk);
    }
  }
  return out;
}

function enrich(dk) {
  const cards = [];
  for (const entry of dk.cards || []) {
    if (entry.section === "Sideboard" || entry.section === "Tokens") continue;
    const found = lookupCard(entry.name);
    if (!found) { cards.push({ type: "", oracle: "", mana: "", name: entry.name, qty: entry.qty || 1, _unknown: true }); continue; }
    const c = publicCard(found);
    cards.push({ type: c.type, oracle: c.oracle, mana: c.mana, name: c.name, qty: entry.qty || 1 });
  }
  return cards;
}

const decks = loadDecks();
if (decks.length === 0) {
  console.log(filter ? `No saved decks match "${filter}".` : "No saved decks found under data/profiles/*/decks.local.json.");
  process.exit(0);
}

const perDeck = [];
const tierTotals = {};
const gapTotals = {};
const gapExamples = {};
const unknown = new Set();

for (const dk of decks) {
  const cards = enrich(dk);
  const s = coverageSummary(cards.filter((c) => !c._unknown));
  // Fold unknowns + per-card gap examples in for the dashboard view.
  for (const c of cards) {
    if (c._unknown) { unknown.add(c.name); continue; }
    const tier = classifyCard(c);
    tierTotals[tier] = (tierTotals[tier] || 0) + (c.qty || 1);
    if (!isNativeTier(tier)) {
      const b = mechanismBucket(c.oracle);
      gapTotals[b] = (gapTotals[b] || 0) + (c.qty || 1);
      (gapExamples[b] = gapExamples[b] || new Set()).add(c.name);
    }
  }
  perDeck.push({ name: dk.name, total: s.total, native: s.native, pct: s.pct });
}

console.log("=== PER-DECK NATIVE COVERAGE (native card-slots / total) ===");
for (const d of perDeck.sort((a, b) => b.pct - a.pct)) {
  console.log(`  ${String(d.pct).padStart(3)}%  ${d.name}  (${d.native}/${d.total})`);
}
const grand = perDeck.reduce((a, d) => ({ n: a.n + d.native, t: a.t + d.total }), { n: 0, t: 0 });
console.log(`\n  AGGREGATE: ${grand.t ? Math.round((grand.n / grand.t) * 100) : 0}% native  (${grand.n}/${grand.t} slots across ${decks.length} decks)`);

console.log("\n=== TIER BREAKDOWN (card-slots) ===");
for (const k of ["land", "native-mana", "native-body", "native-spell", "native-trigger", "body-only", "arbiter-spell", "arbiter-pw"]) {
  if (tierTotals[k]) console.log(`  ${String(tierTotals[k]).padStart(4)}  ${k}`);
}

console.log("\n=== THE GAP: unmodeled slots by MECHANISM (the roadmap) ===");
for (const [b, n] of Object.entries(gapTotals).sort((a, c) => c[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${b}\n          e.g. ${[...(gapExamples[b] || [])].slice(0, 6).join(", ")}`);
}
if (unknown.size) console.log(`\n  unknown (not in index): ${[...unknown].slice(0, 12).join(", ")}${unknown.size > 12 ? " …" : ""}`);
