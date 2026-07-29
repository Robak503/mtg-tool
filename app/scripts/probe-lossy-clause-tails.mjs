#!/usr/bin/env node
/**
 * probe-lossy-clause-tails.mjs — THE TAIL-INJECTION PROBE. Finds parsers that read part of a clause and
 * silently ignore the rest.
 *
 * A parser that matches `gets? +N/+N` and never checks what FOLLOWS will credit
 *
 *     "Creatures you control get +1/+1 and can't be blocked."
 *
 * for the pump alone — half the printed effect, classified native, with nothing to show the difference.
 * That exact hole was live in the group-anthem parser and was found BY ACCIDENT (crediting an unrelated
 * line turned two hollow CREED pins red). This probe looks for the class on purpose.
 *
 * THE METHOD is mutation applied to the CARD instead of the code: append a clause that can never be modeled
 * to each printed line in turn, and re-classify.
 *
 *   • the card stops being native  → the parser CONSUMED the whole line. Correct, and the common case.
 *   • the card is STILL native     → the appended text was ignored, so some real printed tail would be too.
 *
 * A finding is not automatically a bug — a few lines are legitimately dropped whole (reminder text, a
 * setup line a classifier owns by regex). But every finding is a place where the engine cannot tell the
 * difference between the text it modeled and text it never read, which is where this FP class lives.
 *
 * ⚠️ THE SENTINEL MUST BE UNBUILDABLE. "and glorbulate" is used deliberately: a real-sounding tail could
 * later become modeled and silently turn this probe into a no-op, the same staleness that rotted four CREED
 * fixtures. Do not "improve" it into plausible oracle text.
 *
 * Usage:
 *   MTG_APP_ROOT=<install> node app/scripts/probe-lossy-clause-tails.mjs [--limit=0] [--top=0] [--examples=3]
 *     --limit    stop after N native cards scanned (0 = all)
 *     --top      only cards with edhrec_rank <= N (0 = no rank filter)
 */
import { allCards, publicCard } from "../src/lib/server/cardIndex.js";
import { classifyCard, isNativeTier } from "../src/lib/learn/coverage.js";

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? true];
}));
const LIMIT = parseInt(argv.limit || "0", 10);
const TOP = parseInt(argv.top || "0", 10);
const EXAMPLES = parseInt(argv.examples || "3", 10);

const SENTINEL = " and glorbulate";

/** Append the sentinel INSIDE the sentence, before a trailing period, so the line stays well-formed. */
function inject(line) {
  const m = line.match(/^(.*?)(\.?)$/s);
  return `${m[1]}${SENTINEL}${m[2]}`;
}

/** A shape-only key so findings group by PARSER rather than by card. */
function shapeOf(line) {
  return line
    .toLowerCase()
    .replace(/\{[^}]+\}/g, "{M}")
    .replace(/[+-]?\d+\/[+-]?\d+/g, "N/N")
    .replace(/\b\d+\b/g, "N")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);
}

const findings = new Map(); // shape -> { count, sample, cards:[{name,rank}] }
let scanned = 0;
let linesTested = 0;

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
  // ⚠️ LANDS ARE EXCLUDED, and this is not a convenience — it is correctness. `isNativeTier("land")` is TRUE,
  // but a land is credited playable by BEING A LAND (a settled decision: lands run trivially, which is why
  // Bojuka Bog #24 was never a gap). Its tier does not depend on parsing its text, so injecting a tail can
  // never change it and every land reports as a false finding. On the first run they were 4 of the top 5
  // shapes and ~48% of all cards flagged, burying the real signal. `native-mana` cards (Sol Ring, Birds of
  // Paradise) are KEPT — their tier does come from parsing the mana ability.
  if (!isNativeTier(tier) || tier === "land") continue;
  scanned++;
  if (LIMIT && scanned > LIMIT) break;

  const lines = String(card.oracle).split(/\n+/).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    // Reminder-only lines carry no rules text (CR 207.2) — nothing to consume.
    if (/^\s*\(/.test(lines[i])) continue;
    linesTested++;
    const mutated = lines.map((l, j) => (j === i ? inject(l) : l)).join("\n");
    let mutTier;
    try {
      mutTier = classifyCard({ ...card, oracle: mutated });
    } catch {
      continue;                              // a throw is a different defect, not a silent read
    }
    if (!isNativeTier(mutTier)) continue;    // the parser consumed the line — correct

    const shape = shapeOf(lines[i]);
    if (!findings.has(shape)) findings.set(shape, { count: 0, sample: lines[i], cards: [] });
    const e = findings.get(shape);
    e.count++;
    e.cards.push({ name: card.name, rank });
  }
}

const ranked = [...findings.values()].sort((a, b) => b.count - a.count);
const affected = new Set();
for (const e of ranked) for (const c of e.cards) affected.add(c.name);

console.log(`native cards scanned: ${scanned} · printed lines tested: ${linesTested}`);
console.log(`\n=== LINES WHOSE TAIL IS IGNORED — ${ranked.length} shapes across ${affected.size} cards ===\n`);

for (const e of ranked.slice(0, 30)) {
  const ex = e.cards.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)).slice(0, EXAMPLES)
    .map((c) => `${c.name}${c.rank ? ` #${c.rank}` : ""}`).join(" · ");
  console.log(`${String(e.count).padStart(4)}x  ${e.sample.slice(0, 92)}`);
  console.log(`       ${ex}`);
}

if (!ranked.length) console.log("  (none — every native card's printed lines are fully consumed)");
process.exitCode = ranked.length ? 1 : 0;
