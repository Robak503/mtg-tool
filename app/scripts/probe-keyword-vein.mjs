#!/usr/bin/env node
/**
 * probe-keyword-vein.mjs — which single PRINTED KEYWORD LINE, dropped, makes a parked card native?
 *
 *   MTG_APP_ROOT=<root> node scripts/probe-keyword-vein.mjs [--top=N]
 *
 * ⭐ WHY THIS EXISTS. It found three slices in a row that no other instrument could see, because the gap it
 * detects is invisible to a tier census: a card blocked by ONE keyword line looks exactly like a card blocked
 * by its whole body. AFTERMATH (+7) and OUTLAST (+8) were both cases where the MECHANISM WAS ALREADY BUILT and
 * delivering nothing — the keyword line was simply never turned into the ability or flag that already existed.
 * ESCALATE (+4) came off the same ranking.
 *
 * ⚠️ A CLUSTER IS A LEAD, NOT A BUILD. Most rows are REAL mechanics needing real work (cipher, ingest,
 * specialize, double team, sunburst, phasing). The three that paid were the ones whose machinery already
 * existed elsewhere — so the question to ask of a row is "is this keyword DEFINED as something already
 * modeled?", never "can I delete this line?".
 *
 * ⛔ AND DELETING A LINE IS SOMETIMES A FALSE POSITIVE. Escalate looked like another cost-shaped keyword until
 * the modal was measured: "Choose one or both" parses to chooseCount 2, so the cast path could pick BOTH modes
 * without paying the escalate cost. It was admitted only once the multi-mode option was WITHHELD. Whenever a
 * keyword grants an OPTION, check what the engine does with that option before crediting the card.
 *
 * Local-only dev tool (bundled corpus via MTG_APP_ROOT); not in CI.
 */
import { allCards, publicCard } from "../src/lib/server/cardIndex.js";
import { classifyCard, isNativeTier } from "../src/lib/learn/coverage.js";

const topArg = process.argv.find((a) => a.startsWith("--top="));
const top = topArg ? parseInt(topArg.slice(6), 10) : 24;

// A keyword LINE: short, no sentence punctuation beyond a trailing reminder paren, no ":" (not an ability).
const isKeywordLine = (l) => {
  const t = l.trim().replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (!t || t.length > 40) return false;
  if (/[:.]/.test(t)) return false;
  return /^[A-Za-z][A-Za-z'’\- ]*(?:\s\d+)?(?:\s*\{[^}]+\})*$/.test(t);
};

const clusters = new Map();
let walked = 0;
let flips = 0;

for (const raw of allCards()) {
  const card = publicCard(raw);
  const oracle = String(card.oracle || "");
  if (!oracle) continue;
  walked++;
  if (isNativeTier(classifyCard(card))) continue;
  const lines = oracle.split(/\n/);
  const kwIdx = lines.map((l, i) => (isKeywordLine(l) ? i : -1)).filter((i) => i >= 0);
  if (!kwIdx.length) continue;
  for (const i of kwIdx) {
    const alt = lines.filter((_, j) => j !== i).join("\n");
    if (!alt.trim()) continue;
    if (!isNativeTier(classifyCard({ ...card, oracle: alt }))) continue;
    const key = lines[i].trim()
      .replace(/\s*\([^)]*\)\s*$/, "")
      .replace(/\s*\{[^}]+\}/g, " {N}")
      .toLowerCase().trim();
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(card.name);
    flips++;
    break;
  }
}

const rows = [...clusters.entries()].sort((a, b) => b[1].length - a[1].length);
console.log(`walked ${walked} · ${flips} parked cards unblock by dropping ONE keyword line · ${rows.length} distinct keywords\n`);
console.log("=== RANKED (a lead, not a build — see the header's two warnings) ===");
for (const [k, v] of rows.slice(0, top)) {
  console.log(`  ${String(v.length).padStart(4)}  "${k}"   ${v.slice(0, 3).join(" · ")}`);
}
console.log(`\n${rows.filter((r) => r[1].length === 1).length} keywords touch exactly ONE card.`);
