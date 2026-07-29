#!/usr/bin/env node
/**
 * probe-trailing-tail-vein.mjs — every PARKED card that would classify native if its LAST SENTENCE were
 * removed, clustered by that sentence's opening words.
 *
 *   MTG_APP_ROOT=<root> node scripts/probe-trailing-tail-vein.mjs [--top=N] [--cluster=<prefix>]
 *
 * ⭐ WHY THIS EXISTS. Two of the largest slices of the 2026-07-29 run came from a hand-rolled, SHELF-SCOPED
 * version of exactly this question: the "Spend this mana only …" cluster (+34 corpus, four shelf decks) and
 * the "Exile <this>." self-disposition mirror (+7). Both were invisible to every existing instrument, because
 * a card blocked by ONE trailing sentence looks identical in a tier census to a card blocked by its whole
 * body. This generalises that probe to the full corpus and makes it repeatable.
 *
 * THE SIGNAL IT PRODUCES is a ranked list of BLOCKING SENTENCE SHAPES. A cluster of size N means N parked
 * cards are separated from native by one recurring clause — the shape most likely to be a single build.
 *
 * ⚠️ A CLUSTER IS A LEAD, NOT A BUILD, and three failure modes are already known from using it:
 *   1. ⛔ Some clusters are DELIBERATE REFUSALS, not gaps. "Activate only if …" parks its cards because an
 *      IGNORED activation restriction would let the engine activate when it must not — a CREED false
 *      positive. Flipping those requires the condition to become REAL (the spend-restriction slice is the
 *      worked example of doing that properly), never a text-strip. Grep the suite for pins before building.
 *   2. ⛔ A "TRAILING SENTENCE" CAN HIDE TWO GAPS. Valley Floodcaller's blocking line carries both a
 *      multi-subtype list AND an "Untap them." tail; removing the sentence proves the line is the blocker,
 *      never that ONE clause is.
 *   3. ⛔ THE OPENING WORDS UNDER-CLUSTER. A trigger prefix ("When this creature enters, …") groups by the
 *      trigger rather than by the thing that actually parks the card, so a real family can be split across
 *      several rows, and a row can mix unrelated cards.
 *
 * ⭐ THE STRATEGIC READING, recorded 2026-07-29 because it is a planning input and not just a number:
 * 1,074 parked cards are one trailing sentence from native, spread over 397 distinct openings, and after the
 * mana cluster was built the largest remaining row was 44. THE TAIL IS FRAGMENTED. There is no single big
 * lever left in this vein — the corpus is now genuinely per-shape, and slices from here should be sized in
 * single digits unless a probe says otherwise.
 *
 * Local-only dev tool (bundled corpus via MTG_APP_ROOT); not in CI.
 */
import { allCards, publicCard } from "../src/lib/server/cardIndex.js";
import { classifyCard, isNativeTier } from "../src/lib/learn/coverage.js";

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const top = parseInt(arg("top", "25"), 10);
const only = (arg("cluster", "") || "").toLowerCase();

const clusters = new Map();
let walked = 0;
let flips = 0;

for (const raw of allCards()) {
  const card = publicCard(raw);
  const oracle = String(card.oracle || "");
  if (!oracle) continue;
  walked++;
  if (isNativeTier(classifyCard(card))) continue;

  // Drop the LAST sentence of every line that has more than one. A line with a single sentence is left
  // alone: removing it would test "is the whole ability the blocker", which is a different question.
  const stripped = oracle.split(/\n/).map((l) => l.replace(/\.\s+[A-Z(][^.]*\.$/, ".")).join("\n");
  if (stripped === oracle) continue;
  if (!isNativeTier(classifyCard({ ...card, oracle: stripped }))) continue;
  flips++;

  oracle.split(/\n/).forEach((line, i) => {
    const kept = stripped.split(/\n/)[i];
    if (kept === line) return;
    const tail = line.slice(kept.length - 1).trim().replace(/^\.\s*/, "");
    // Normalise the card's own name out so self-referential sentences ("Exile Temporal Mastery.") cluster
    // with each other instead of each minting its own row — that normalisation is what surfaced the
    // self-exile family as a single lead rather than seven singletons.
    const esc = String(card.name || "###").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const key = tail.replace(new RegExp(esc, "g"), "<self>").toLowerCase().split(/\s+/).slice(0, 3).join(" ");
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push({ name: card.name, tail });
  });
}

const rows = [...clusters.entries()].sort((a, b) => b[1].length - a[1].length);
console.log(`walked ${walked} cards · ${flips} parked cards are ONE trailing sentence from native · ${rows.length} distinct openings\n`);

if (only) {
  const hit = rows.find(([k]) => k.startsWith(only));
  if (!hit) { console.log(`no cluster starting "${only}"`); process.exit(0); }
  console.log(`=== cluster "${hit[0]}" — ${hit[1].length} cards ===`);
  for (const c of hit[1]) console.log(`  ${c.name}\n     ${c.tail.slice(0, 140)}`);
  process.exit(0);
}

console.log("=== RANKED BLOCKING-SENTENCE SHAPES (a lead, not a build — see the header's three failure modes) ===");
for (const [key, cards] of rows.slice(0, top)) {
  console.log(`  ${String(cards.length).padStart(4)}  "${key}…"   ${cards.slice(0, 3).map((c) => c.name).join(" · ")}`);
}
console.log(`\n${rows.filter((r) => r[1].length === 1).length} shapes touch exactly ONE card — the per-card tail.`);
console.log(`Re-run with --cluster=<opening words> to list a single cluster's cards and full sentences.`);
