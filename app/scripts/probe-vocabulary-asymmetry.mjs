#!/usr/bin/env node
/**
 * probe-vocabulary-asymmetry.mjs — find clause TWINS whose vocabularies have drifted apart.
 *
 * ⭐ WHY THIS EXISTS. Three slices in a row (+6, +6, +13) landed on the same shape: a subsystem where the
 * machinery was already built and only the VOCABULARY was absent on one arm. The sharpest instance was
 * inside a single function, fifteen lines apart —
 *
 *     "return target <X> card WITH MANA VALUE N OR LESS from your graveyard to the battlefield"
 *          → any permanent-compatible filter, via parseGraveyardFilter
 *     "return target <X> card from your graveyard to the battlefield"
 *          → hardcoded "creature"
 *
 * — and ~50 corpus cards parked on a filter the file could already parse one branch away. That is not a
 * thing a card-by-card search finds; it is a thing you find by diffing two templates that differ in exactly
 * one dimension. So this probe does that mechanically.
 *
 * HOW IT WORKS. Each FAMILY below is a set of clause templates that differ in ONE dimension (destination,
 * verb, cardinality, an MV rider) plus a shared vocabulary of filler words. Every word is substituted into
 * every variant and parsed. A word that parses in at least one variant and fails in another is an
 * ASYMMETRY — one arm of the family can say something its twin cannot.
 *
 * ⚠️ AN ASYMMETRY IS A LEAD, NOT A DEFECT. Read every row before building:
 *   1. Some are RULES-CORRECT. "instant" parses to-hand and must NOT parse to-the-battlefield: a card
 *      entering the battlefield has to be a permanent (CR 110.4a). Those rows are the probe working.
 *   2. Some are DELIBERATE REFUSALS with a reason recorded in the ledger.
 *   3. Parsing is not flipping. The reanimate slice widened ~50 cards' worth of filter and moved 13 — the
 *      rest had other blockers. Size with the tier diff, never with this row count.
 *
 * Pure + hermetic: parser-only, no card index, no MTG_APP_ROOT. Runs anywhere, in or out of CI.
 *
 * Usage:
 *   node app/scripts/probe-vocabulary-asymmetry.mjs [--family=<name>]
 */

import { parseEffectClause } from "../src/lib/learn/effects/parser.js";

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? true];
}));

// Filter/noun vocabularies, kept small and real — every word below appears in printed corpus text.
const CARD_TYPES = ["creature", "artifact", "enchantment", "land", "instant", "sorcery", "planeswalker", "permanent", "card"];
const UNIONS = ["artifact or creature", "instant or sorcery", "artifact or enchantment"];
const QUALIFIED = ["basic land", "legendary creature", "nonland permanent", "green creature"];
const REMOVAL_NOUNS = ["creature", "artifact", "enchantment", "land", "permanent", "planeswalker",
  "creature or planeswalker", "artifact or enchantment", "nonland permanent"];

const FAMILIES = [
  {
    name: "tutor-destination",
    note: "search destinations — the axis that produced the graveyard slice",
    vocab: [...CARD_TYPES, ...UNIONS, ...QUALIFIED],
    variants: {
      hand: (w) => `search your library for a ${w} card, put it into your hand, then shuffle`,
      graveyard: (w) => `search your library for a ${w} card, put it into your graveyard, then shuffle`,
      battlefield: (w) => `search your library for a ${w} card, put it onto the battlefield, then shuffle`,
    },
  },
  {
    name: "graveyard-return",
    note: "return-to-hand vs reanimate vs the MV-capped reanimate twin",
    vocab: [...CARD_TYPES, ...UNIONS, ...QUALIFIED],
    variants: {
      toHand: (w) => `return target ${w} card from your graveyard to your hand`,
      toBattlefield: (w) => `return target ${w} card from your graveyard to the battlefield`,
      toBattlefieldMv: (w) => `return target ${w} card with mana value 3 or less from your graveyard to the battlefield`,
    },
  },
  {
    name: "removal-verb",
    note: "destroy vs exile vs bounce — the same target noun should be sayable to each",
    vocab: REMOVAL_NOUNS,
    variants: {
      destroy: (n) => `destroy target ${n}`,
      exile: (n) => `exile target ${n}`,
      bounce: (n) => `return target ${n} to its owner's hand`,
    },
  },
  {
    name: "cardinality",
    note: "single vs up-to-N — a matcher often gains a filter on one and not the other",
    vocab: [...CARD_TYPES, ...UNIONS],
    variants: {
      single: (w) => `search your library for a ${w} card, put it into your hand, then shuffle`,
      upToThree: (w) => `search your library for up to three ${w} cards, put them into your hand, then shuffle`,
    },
  },
];

const parses = (clause) => {
  try {
    const p = parseEffectClause(clause, "Sorcery", { hasX: false });
    return !!(p && (p.atoms || []).length && p.confidence === "high");
  } catch { return false; }
};

let totalRows = 0;
for (const fam of FAMILIES) {
  if (argv.family && argv.family !== fam.name) continue;
  const keys = Object.keys(fam.variants);
  const rows = [];
  for (const w of fam.vocab) {
    const got = keys.map((k) => [k, parses(fam.variants[k](w))]);
    const yes = got.filter(([, ok]) => ok).map(([k]) => k);
    const no = got.filter(([, ok]) => !ok).map(([k]) => k);
    if (yes.length && no.length) rows.push({ w, yes, no });
  }
  console.log(`\n=== ${fam.name} — ${fam.note}`);
  console.log(`    variants: ${keys.join(" · ")}`);
  if (!rows.length) { console.log("    ✅ no asymmetry — every word parses in all variants or none"); continue; }
  for (const r of rows) {
    console.log(`    ⚠️  "${r.w}"`.padEnd(42) + `parses: ${r.yes.join(",")}   MISSING: ${r.no.join(",")}`);
  }
  totalRows += rows.length;
}
console.log(`\nasymmetric rows: ${totalRows}`);
console.log("⚠️  A row is a LEAD, not a defect — some asymmetries are rules-correct (an instant cannot enter");
console.log("    the battlefield) or deliberate refusals. Read the header before building any of them.");
