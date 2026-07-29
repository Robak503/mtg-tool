#!/usr/bin/env node
/**
 * probe-top2500-blockers.mjs — WHERE THE TOP-2500 GAP ACTUALLY IS, by blocking sentence.
 *
 * Every search instrument built earlier in this run asks the same question — "which cards are ONE sentence
 * from flipping?" — and that seam goes quiet long before the WORK does. This one asks a different question:
 *
 *     for the cards that MATTER (top 2500 by edhrec_rank), which SENTENCES are doing the blocking,
 *     and how many of those cards does each sentence shape block?
 *
 * A card blocked by three sentences still counts toward all three. That is deliberate: it means a shape at
 * the top of this list is worth building even when no single card flips from it alone, which is exactly the
 * signal the one-mode-away shortlist cannot produce. Blocker COUNT is not cost (Colton, 2026-07-28) — a card
 * needing two vocabulary fixes is cheaper than one needing a subsystem.
 *
 * ⚠️ TWO CORRECTIONS ARE BAKED IN — both were false-vein sources for the earlier probe, do not undo them:
 *   1. Sentences are classified with `classifyCard` on a SYNTHETIC single-sentence card, never with
 *      `parseEffectClause` — the latter misses the legacy whole-card path and reports plain "draw a card"
 *      as a blocker.
 *   2. The synthetic card carries the SOURCE CARD'S TYPE. Wrapping a permanent's static as an Instant means
 *      it can never classify native however well modeled ("you may play an additional land on each of your
 *      turns" reported as a 4-card vein when it has been modeled all along).
 *
 * Ranks come from the RAW card: `publicCard()` STRIPS `edhrec_rank`, and a probe built on it reads every
 * rank as the fallback and silently reports the whole top-2500 as empty.
 *
 * Usage:
 *   MTG_APP_ROOT=<install> node app/scripts/probe-top2500-blockers.mjs [--limit=40] [--examples=3]
 */
import { allCards, publicCard } from "../src/lib/server/cardIndex.js";
import { classifyCard, isNativeTier } from "../src/lib/learn/coverage.js";

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? true];
}));
const LIMIT = parseInt(argv.limit || "40", 10);
const EXAMPLES = parseInt(argv.examples || "3", 10);

// Reminder text is not rules text (CR 207.2) — a parenthetical never blocks anything.
const stripReminders = (s) => s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();

/**
 * STRUCTURAL lines that are not abilities and must never be counted as blockers. Both were the probe's two
 * loudest "veins" on its first run and both were artifacts:
 *   • "//" — the face separator on split/DFC/adventure cards. It scored 21 top-2500 cards, which looked like
 *     the biggest lever on the board. It is not: multi-face cards in the top 2500 are **72.7% native**
 *     (56/77), well ABOVE the 54.2% baseline. The separator was simply present on every parked multi-face
 *     card, which are parked for their actual text.
 *   • "Enchant <noun>" — CR 702.5 is a targeting restriction handled by the aura path, not an ability. It
 *     scored 19 by appearing on every parked Aura.
 * ⚠️ TWO CLASSES STILL OVER-REPORT — treat their rows as "look here", never as a verdict, and confirm against
 * a real card before building (the ledger's standing rule, which has now caught four false veins):
 *   • KEYWORD-only lines (Spree, Ascend, Convoke, Flashback {4}{W}) — a bare keyword does not classify native
 *     standing alone even when the engine models it fully.
 *   • EFFECT FRAGMENTS off a PERMANENT — "Draw a card." tested as a whole Artifact is not an ability (no
 *     trigger, no activation), so it scores as a blocker for Monument to Endurance while being modeled
 *     everywhere it actually appears. Likewise "Equipped creature gets +3/+2" without its Equip line. The
 *     probe is most trustworthy on INSTANTS and SORCERIES, where a printed line IS the whole spell.
 */
const isStructuralLine = (s) => /^\/\/+$/.test(s.trim())
  || /^Enchant\b/i.test(s.trim())
  // The modal WRAPPER is not a blocker — it is built and works. Verified directly: "Choose one — • Destroy
  // target artifact. • Draw a card." classifies native-spell. It ranked #1 at 11 cards only because the
  // wrapper line cannot classify standing alone. What CAN block a modal card is an individual MODE, which is
  // why modes are de-bulleted and tested as whole spells below instead of being dropped.
  || /^Choose (one|two|three|up to)\b/i.test(s.trim());

/**
 * A MODE line ("• Destroy target artifact.") is a complete effect wearing a bullet. Tested with the bullet
 * attached it is never native — that artifact put four separate mode shapes in the probe's first top-20.
 * Stripped, it is judged exactly as the spell it is, so a mode that ranks here is a REAL gap and names the
 * one piece of a modal staple that is missing.
 */
const deBullet = (s) => s.replace(/^[•·]\s*/, "").trim();

/** Normalize a sentence into a SHAPE so near-identical lines group together. */
function shapeOf(sentence) {
  return sentence
    .toLowerCase()
    .replace(/\{[^}]+\}/g, "{M}")            // mana symbols
    .replace(/\b\d+\b/g, "N")                 // counts
    .replace(/\s+/g, " ")
    .trim();
}

const parked = [];
for (const raw of allCards()) {
  const rank = Number.isInteger(raw.edhrec_rank) ? raw.edhrec_rank : null;
  if (rank == null || rank > 2500) continue;
  const card = publicCard(raw);
  const tier = classifyCard(card);
  if (isNativeTier(tier) || tier === "land") continue;
  parked.push({ card, rank, tier });
}

const shapes = new Map(); // shape -> { count, sample, cards:[{name,rank}] }
let sentencesWalked = 0;

for (const { card, rank } of parked) {
  const lines = String(card.oracle || "").split(/\n+/)
    .map((l) => deBullet(stripReminders(l)))
    .filter((l) => l && !isStructuralLine(l));
  const seenHere = new Set();
  for (const line of lines) {
    // Each printed LINE is judged as its own card, carrying the source card's real type.
    sentencesWalked++;
    let t;
    try {
      t = classifyCard({ ...card, oracle: line });
    } catch {
      continue;
    }
    if (isNativeTier(t)) continue;
    const shape = shapeOf(line);
    if (!shape || seenHere.has(shape)) continue;
    seenHere.add(shape);
    if (!shapes.has(shape)) shapes.set(shape, { count: 0, sample: line, cards: [] });
    const e = shapes.get(shape);
    e.count++;
    e.cards.push({ name: card.name, rank });
  }
}

const ranked = [...shapes.entries()].sort((a, b) => b[1].count - a[1].count);

console.log(`parked top-2500 cards: ${parked.length} · printed lines walked: ${sentencesWalked}`);
console.log(`distinct blocking shapes: ${ranked.length}\n`);
console.log(`=== TOP ${LIMIT} BLOCKING SHAPES (a card blocked by 3 lines counts toward all 3) ===\n`);

for (const [, e] of ranked.slice(0, LIMIT)) {
  const ex = e.cards.sort((a, b) => a.rank - b.rank).slice(0, EXAMPLES)
    .map((c) => `${c.name} #${c.rank}`).join(" · ");
  console.log(`${String(e.count).padStart(4)}x  ${e.sample.slice(0, 96)}`);
  console.log(`       ${ex}`);
}

const singles = ranked.filter(([, e]) => e.count === 1).length;
console.log(`\n${singles} shapes block exactly ONE card — the long tail, not a vein.`);
