#!/usr/bin/env node
/**
 * probe-ignored-restrictions.mjs — NATIVE cards carrying a RESTRICTION, grouped by phrase.
 *
 * ⭐ WHY THIS IS SHARPER THAN THE TAIL-INJECTION PROBE. That probe asks "is any trailing text ignored?" and
 * its answer is mostly yes-and-harmless: a parser that matches a known pattern and skips the surrounding
 * words UNDER-models, and under-modelling is a safe false negative (the Talismans are read as colorless-only
 * sources — less than printed, never more). Auditing its top five clusters (~110 of 165 cards) turned up
 * exactly one real defect, and that one had a distinguishing quality:
 *
 *     an ignored tail that ADDS an effect  → the engine under-delivers  → FN, safe
 *     an ignored tail that RESTRICTS       → the engine over-delivers   → FP, FORBIDDEN
 *
 * Spend-restricted mana was the second kind: "Spend this mana only to cast your commander" ignored means
 * Jeweled Lotus pays for anything. So this probe skips the additive noise entirely and enumerates the
 * restriction-shaped language on cards the metric already calls NATIVE — the exact population where an
 * unread restriction becomes a card the engine plays better than it is printed.
 *
 * A finding is NOT automatically a defect: many of these restrictions ARE modeled (sorcery-speed gates,
 * once-per-turn latches). The probe produces a prioritized WORKLIST, not a verdict — confirm each group
 * against the engine before building, which is the rule that has now caught five false veins in this run.
 *
 * Usage:
 *   MTG_APP_ROOT=<install> node app/scripts/probe-ignored-restrictions.mjs [--top=2500] [--examples=4]
 */
import { allCards, publicCard } from "../src/lib/server/cardIndex.js";
import { classifyCard, isNativeTier } from "../src/lib/learn/coverage.js";

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? true];
}));
const TOP = parseInt(argv.top || "0", 10);
const EXAMPLES = parseInt(argv.examples || "4", 10);

// Restriction-shaped language. Each entry is a NARROW phrase whose whole job is to take something away —
// a timing window, a legal target, a resource's use, a frequency. Deliberately excludes additive wording.
const RESTRICTIONS = [
  ["spend this mana only", /spend this mana only/i],
  ["can't be spent to", /can't be spent to/i],
  ["activate only as a sorcery", /activate only as a sorcery/i],
  ["activate only if", /activate (?:this ability )?only if/i],
  ["activate only during", /activate (?:this ability )?only during/i],
  ["activate only once each turn", /activate (?:this ability )?only once each turn/i],
  ["cast only if / only during", /cast this spell only (?:if|during)/i],
  ["can't attack unless", /can't attack unless/i],
  ["can't block unless", /can't block unless/i],
  ["can't be blocked except by", /can't be blocked except by/i],
  ["only if you've / only if a", /only if (?:you've|you have|a |an |there)/i],
  ["only once each turn", /only once each turn/i],
  ["only during your turn", /only during your turn/i],
  ["unless you pay", /unless you pay/i],
  ["unless you control", /unless you control/i],
  ["unless you sacrifice", /unless you sacrifice/i],
  ["unless that player", /unless that player/i],
  ["no more than one", /no more than one/i],
  ["can't cause you to draw", /can't cause you to draw/i],
  ["only you may", /only you may/i],
];

const groups = new Map(RESTRICTIONS.map(([label]) => [label, []]));
let nativeScanned = 0;

for (const raw of allCards()) {
  const rank = Number.isInteger(raw.edhrec_rank) ? raw.edhrec_rank : null;
  if (TOP && (rank == null || rank > TOP)) continue;
  const card = publicCard(raw);
  if (!card.oracle) continue;
  let tier;
  try {
    tier = classifyCard(card);
  } catch {
    continue;
  }
  // Lands are credited playable by BEING lands, so their tier says nothing about whether the engine read
  // their text — the same exclusion the tail-injection probe needed.
  if (!isNativeTier(tier) || tier === "land") continue;
  nativeScanned++;
  for (const [label, re] of RESTRICTIONS) {
    if (!re.test(card.oracle)) continue;
    const line = String(card.oracle).split(/\n+/).find((l) => re.test(l)) || "";
    groups.get(label).push({ name: card.name, rank, tier, line: line.replace(/\([^)]*\)/g, "").trim() });
  }
}

const ranked = [...groups.entries()].filter(([, v]) => v.length).sort((a, b) => b[1].length - a[1].length);
const total = new Set(ranked.flatMap(([, v]) => v.map((c) => c.name))).size;

console.log(`native (non-land) cards scanned: ${nativeScanned}`);
console.log(`\n=== NATIVE CARDS CARRYING RESTRICTION LANGUAGE — ${total} cards across ${ranked.length} phrases ===`);
console.log(`(a worklist, NOT a verdict — many of these restrictions are genuinely modeled)\n`);

for (const [label, cards] of ranked) {
  console.log(`${String(cards.length).padStart(4)}x  "${label}"`);
  for (const c of cards.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)).slice(0, EXAMPLES)) {
    console.log(`        ${String(c.rank ?? "-").padStart(6)}  ${c.name} [${c.tier}]`);
    console.log(`                ${c.line.slice(0, 88)}`);
  }
}
