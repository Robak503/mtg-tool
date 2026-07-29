#!/usr/bin/env node
/**
 * probe-vacuous-subtype-filters.mjs — THE VACUOUS-FILTER PROBE.
 *
 * A trigger descriptor may carry `subtypeFilter: "Goblin"`, and the runtime gate (subtypeFilterMatches)
 * enforces it as a SUBSTRING of the triggering permanent's type line. That is faithful when the string is
 * a real subtype. When it is NOT — "Elve" from a naive de-pluralization of "Elves" — the gate can never
 * be satisfied by any card in existence, so:
 *
 *     the card classifies NATIVE  ·  the trigger never fires  ·  no test and no tier can see it
 *
 * That is the forbidden false-positive class (a runtime-vacuous native), and it is invisible to the
 * per-card tier diff because nothing MOVES — the card was already native and stays native.
 *
 * This probe closes that hole the only way it can be closed: it builds the set of subtypes that actually
 * OCCUR in the corpus's type lines, then reports every minted subtypeFilter that is absent from it.
 *
 * A finding here is always a real defect. There is no benign way for the engine to gate on a subtype no
 * printed card carries.
 *
 * Usage:
 *   MTG_APP_ROOT=<install> node app/scripts/probe-vacuous-subtype-filters.mjs
 */
import { allCards, publicCard } from "../src/lib/server/cardIndex.js";
import { detectTriggers } from "../src/lib/learn/triggers.js";

const raws = [...allCards()];

// ---- The vocabulary: every word that appears ANYWHERE in a real type line. ---------------------------
// ⚠️ It must be the WHOLE line, not just the post-dash subtypes. `subtypeFilterMatches` tests
// `typeStr(card).includes(filter)` — an unanchored substring of the entire line — so a filter of
// "Artifact" legitimately matches "Artifact — Equipment" and a filter of "Creature" matches every
// creature. Scoping this vocabulary to post-dash words reported 72 such filters as vacuous on the
// probe's first run: the INSTRUMENT was wrong, not the engine. Derived from the DATA, never typed
// from memory.
const vocab = new Set();
for (const raw of raws) {
  for (const w of String(raw.type_line || "").split(/[\s—/]+/)) {
    const clean = w.replace(/[^A-Za-z'-]/g, "");
    if (clean) vocab.add(clean);
  }
}

// ---- Walk every card's descriptors and collect the subtype filters each one mints. --------------------
const findings = [];
let cardsWalked = 0;
let filtersSeen = 0;

for (const raw of raws) {
  const card = publicCard(raw);
  if (!card.oracle) continue;
  cardsWalked++;
  let descs;
  try {
    descs = detectTriggers(card);
  } catch {
    continue; // a parser throw is a different defect; this probe only judges minted filters
  }
  for (const d of descs || []) {
    const f = d.subtypeFilter;
    if (!f) continue;
    const list = Array.isArray(f) ? f : [f];
    for (const s of list) {
      filtersSeen++;
      if (!vocab.has(s)) {
        findings.push({
          name: card.name,
          rank: Number.isInteger(raw.edhrec_rank) ? raw.edhrec_rank : null,
          filter: s,
          event: d.event,
          scope: d.scope,
        });
      }
    }
  }
}

findings.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));

console.log(`corpus subtype vocabulary: ${vocab.size} distinct words (derived from real type lines)`);
console.log(`cards walked: ${cardsWalked} · subtype filters minted: ${filtersSeen}`);
console.log(`\n=== VACUOUS FILTERS (gate can never match any printed card) — ${findings.length} ===`);

const byFilter = new Map();
for (const f of findings) {
  if (!byFilter.has(f.filter)) byFilter.set(f.filter, []);
  byFilter.get(f.filter).push(f);
}
for (const [filter, rows] of [...byFilter.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n  "${filter}" — ${rows.length} card(s)`);
  for (const r of rows.slice(0, 8)) {
    console.log(`      ${String(r.rank ?? "-").padStart(6)}  ${r.name}   (${r.event} / ${r.scope})`);
  }
  if (rows.length > 8) console.log(`      … and ${rows.length - 8} more`);
}

if (!findings.length) console.log("  (none — every minted subtype filter names a real printed subtype)");
process.exitCode = findings.length ? 1 : 0;
