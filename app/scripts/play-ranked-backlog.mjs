/**
 * play-ranked-backlog.mjs — the PLAY-IMPACT build-priority list.
 *
 * Sorts every card by real Commander play (Scryfall edhrec_rank, lower = more played),
 * takes the most-played bands, drops the ones we already cover (native or land), and
 * buckets the REMAINDER by the SYSTEM each card needs — so a builder can build the system
 * that unblocks the most-played cards next (frequency x buildability), instead of grinding
 * the corpus in print order. This is the corpus-wide successor to the 13-decks brief.
 *
 * Output: docs/orchestration/play-ranked-backlog.md (regenerable — re-run as coverage climbs).
 * Data comes from the active card index (respects MTG_APP_ROOT, like measure-coverage).
 *
 *   MTG_APP_ROOT=<main-tree>/app node scripts/play-ranked-backlog.mjs
 */
import fs from "node:fs";
import { publicCard, allCards } from "../src/lib/server/cardIndex.js";
import { classifyCard, isNativeTier, mechanismBucket } from "../src/lib/learn/coverage.js";

// SYSTEM classifier. PRIMARY = mechanismBucket (the maintained root-cause classifier coverage.js +
// measure-coverage use — "what mechanism is unmodeled"). mechanismBucket lumps every instant/sorcery
// into one spell grab-bag, so we REFINE that one bucket (and the unclassified tail) into actionable
// spell systems (ritual / wipe / removal / draw / …) on the literal oracle text. Everything else keeps
// mechanismBucket's root-cause label, so this backlog stays consistent with the corpus gap analysis.
function refineSpell(c) {
  const o = String(c.oracle || "").toLowerCase();
  const t = String(c.type || "").toLowerCase();
  const isSpell = t.includes("instant") || t.includes("sorcery");
  if (t.includes("equipment")) return "EQUIPMENT (equip + granted abilities/stats)";
  if (t.includes("aura")) return "AURA (attach + static grant)";
  if (t.includes("planeswalker")) return "PLANESWALKER (loyalty abilities)";
  if (t.includes("battle")) return "BATTLE / SIEGE subsystem";
  if (isSpell && /\badd \{|\badd (one|two|three|four|five|x|that much)\b/.test(o)) return "RITUAL (one-shot mana burst)";
  if (/destroy all|exile all|destroy each|exile each|all creatures? .* (get|gets) -|each creature gets -|deals? \d+ damage to each/.test(o)) return "BOARD WIPE / MASS REMOVAL";
  if (/counter target (spell|ability|activated|triggered)/.test(o)) return "COUNTERSPELL";
  if (/from .*graveyard.* (to|onto) the battlefield/.test(o)) return "REANIMATION (graveyard -> battlefield)";
  if (/search your library for/.test(o)) return "TUTOR (library search)";
  if (/destroy target|exile target/.test(o)) return "TARGETED REMOVAL (destroy/exile)";
  if (/deals? \d+ damage to (target|any target)/.test(o)) return "BURN (targeted damage)";
  if (/return target .*to (its owner|their owner)('s|s)? hand/.test(o)) return "BOUNCE (return to hand)";
  if (isSpell && /draw (a|one|two|three|x|\w+) cards?/.test(o)) return "CARD DRAW / FILTER (spell)";
  if (/create .*token/.test(o)) return "TOKEN MAKER (spell)";
  if (/(spells you cast cost|cost \{?\d\}? less)/.test(o)) return "COST REDUCER (static)";
  if (/proliferate|\+1\/\+1 counter/.test(o)) return "+1/+1 COUNTERS / PROLIFERATE";
  if (/take an extra turn|additional combat phase|extra combat/.test(o)) return "EXTRA TURN / COMBAT";
  return null;
}
function systemOf(c) {
  const base = mechanismBucket(c.oracle) || "Other / unclassified";
  if (/spell effect|other|unclassified/i.test(base)) return refineSpell(c) || base;
  return base;
}

const BANDS = [1000, 2500, 5000];
const PRIMARY_BAND = 5000;

// collect uncovered ranked cards
const ranked = [];
for (const raw of allCards()) {
  let c;
  try { c = publicCard(raw); } catch { continue; }
  if (!c.type || !c.name) continue;
  if (c.layout === "art_series" || c.layout === "token" || c.layout === "emblem") continue;
  if (/\bScheme\b|\bPlane —|\bVanguard\b|\bConspiracy\b/.test(c.type)) continue;
  if (!Number.isInteger(raw.edhrec_rank)) continue;
  const t = classifyCard(c);
  const covered = isNativeTier(t) || t === "land";
  ranked.push({ rank: raw.edhrec_rank, name: c.name, type: c.type, oracle: c.oracle, tier: t, covered });
}
ranked.sort((a, b) => a.rank - b.rank);

// bucket the uncovered in the primary band
const band = ranked.filter((c) => c.rank <= PRIMARY_BAND);
const uncovered = band.filter((c) => !c.covered);
const buckets = new Map();
for (const c of uncovered) {
  const s = systemOf(c);
  if (!buckets.has(s)) buckets.set(s, []);
  buckets.get(s).push(c);
}
const sorted = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length);

// play-weighted coverage per band (for the header)
const covLine = BANDS.map((n) => {
  const b = ranked.slice(0, n);
  const cov = b.filter((x) => x.covered).length;
  return `top ${n} = **${(100 * cov / b.length).toFixed(1)}%** (${cov}/${b.length})`;
}).join(" · ");

// ─── emit markdown ───
const L = [];
L.push("# Play-ranked build backlog — coverage by real-deck impact");
L.push("");
L.push("> **Regenerable** (`MTG_APP_ROOT=<main>/app node app/scripts/play-ranked-backlog.mjs`). Sorts the");
L.push("> corpus by Commander play (Scryfall `edhrec_rank`), drops what we already cover, and buckets the");
L.push("> rest by the SYSTEM each card needs. **Build the top bucket first** — it unblocks the most");
L.push("> most-played cards per unit work. This is the corpus-wide successor to `thirteen-decks-to-100.md`.");
L.push("");
L.push(`**Play-weighted coverage today:** ${covLine}.`);
L.push("");
L.push(`**Scope below:** the **${uncovered.length}** uncovered cards inside the **top ${PRIMARY_BAND} most-played**, bucketed by system (largest = highest play-impact).`);
L.push("");
L.push("| # | System to build | Uncovered cards | Top-played examples (rank) |");
L.push("|---|---|--:|---|");
sorted.forEach(([sys, cards], i) => {
  const ex = cards.slice(0, 6).map((c) => `${c.name} (#${c.rank})`).join(", ");
  L.push(`| ${i + 1} | ${sys} | ${cards.length} | ${ex} |`);
});
L.push("");
L.push("## Per-system detail (top 12 buckets)");
L.push("");
sorted.slice(0, 12).forEach(([sys, cards], i) => {
  L.push(`### ${i + 1}. ${sys} — ${cards.length} cards`);
  const ex = cards.slice(0, 12).map((c) => `\`#${c.rank}\` ${c.name}`).join(" · ");
  L.push(ex);
  L.push("");
});
L.push("---");
L.push("");
L.push("_Heuristic bucketing (oracle-text + type-line first-match); the OTHER bucket needs manual triage._");
L.push("_Card text is bundled Scryfall data; ranks are `edhrec_rank`. Re-run to refresh after coverage lands._");

const outUrl = new URL("../../docs/orchestration/play-ranked-backlog.md", import.meta.url);
fs.writeFileSync(outUrl, L.join("\n") + "\n");
console.log(`wrote docs/orchestration/play-ranked-backlog.md`);
console.log(`uncovered in top ${PRIMARY_BAND}: ${uncovered.length}`);
console.log("top buckets:");
sorted.slice(0, 12).forEach(([s, c]) => console.log(`  ${String(c.length).padStart(4)}  ${s}`));
