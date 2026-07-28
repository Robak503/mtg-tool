/**
 * tier-snapshot.mjs — a per-card TIER snapshot, and the diff between two of them.
 *
 *   MTG_APP_ROOT=<root> node scripts/tier-snapshot.mjs --out=before.json
 *   ...make a change...
 *   MTG_APP_ROOT=<root> node scripts/tier-snapshot.mjs --out=after.json
 *   node scripts/tier-snapshot.mjs --diff=before.json,after.json
 *
 * WHY THIS EXISTS. `measure-coverage` reports TOTALS, and a total can hide a swap: five cards gained
 * and five lost nets zero and looks like "no change". For a change to a SHARED path — the residue
 * chain every tier walks, the layer engine, a splitter — the total is the wrong instrument entirely.
 * What you need is per-card, so that "it only ADDS" is a claim you can actually check.
 *
 * The diff classifies every movement:
 *   GAINED    parked → native            the intended direction
 *   LOST      native → parked            ⛔ a regression, always
 *   RETIERED  native → a DIFFERENT native tier
 *
 * RETIERED is the one that needs reading rather than counting. It is usually benign (a card that used
 * to qualify through one tier now qualifies through a composite) but it is also exactly what a
 * mis-scoped change looks like from the outside, so the diff prints every one rather than tallying them.
 *
 * Local-only dev tool (bundled corpus via MTG_APP_ROOT); not in CI.
 */
import fs from "node:fs";

import { allCards, publicCard } from "../src/lib/server/cardIndex.js";
import { classifyCard, isNativeTier } from "../src/lib/learn/coverage.js";

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

function isRealCard(c) {
  const t = c.type || c.type_line || "";
  if (!t) return false;
  return !/\b(Token|Emblem|Scheme|Plane|Phenomenon|Vanguard|Dungeon|Conspiracy|Sticker|Attraction|Card)\b/.test(t);
}

if (typeof argv.diff === "string") {
  const [beforePath, afterPath] = argv.diff.split(",");
  const before = JSON.parse(fs.readFileSync(beforePath, "utf8"));
  const after = JSON.parse(fs.readFileSync(afterPath, "utf8"));
  const gained = [], lost = [], retiered = [];
  for (const [name, bt] of Object.entries(before.tiers)) {
    const at = after.tiers[name];
    if (at === undefined || at === bt) continue;
    const bn = isNativeTier(bt), an = isNativeTier(at);
    if (!bn && an) gained.push(`${name}: ${bt} → ${at}`);
    else if (bn && !an) lost.push(`${name}: ${bt} → ${at}`);
    else retiered.push(`${name}: ${bt} → ${at}`);
  }
  const newNames = Object.keys(after.tiers).filter((n) => !(n in before.tiers));
  console.log(`GAINED ${gained.length} · LOST ${lost.length} · RETIERED ${retiered.length} · new-to-index ${newNames.length}`);
  if (lost.length) {
    console.log(`\n⛔ LOST — a native card fell out. This is a regression unless every line is understood:`);
    for (const l of lost) console.log(`   ${l}`);
  }
  if (retiered.length) {
    console.log(`\n⚠️  RETIERED — same playability, different tier. Read these; don't tally them:`);
    for (const r of retiered.slice(0, 40)) console.log(`   ${r}`);
    if (retiered.length > 40) console.log(`   … ${retiered.length - 40} more`);
  }
  console.log(`\n✅ GAINED:`);
  for (const g of gained.slice(0, 60)) console.log(`   ${g}`);
  if (gained.length > 60) console.log(`   … ${gained.length - 60} more`);
  process.exit(lost.length ? 1 : 0);
}

const t0 = Date.now();
const tiers = {};
let n = 0;
for (const raw of allCards()) {
  if (!isRealCard(raw)) continue;
  const pc = publicCard(raw);
  tiers[pc.name] = classifyCard(pc);
  n++;
}
const payload = { generatedAtMs: Date.now() - t0, cards: n, tiers };
const out = typeof argv.out === "string" ? argv.out : "tier-snapshot.json";
fs.writeFileSync(out, JSON.stringify(payload));
console.log(`snapshot: ${n} cards → ${out} (${Math.round((Date.now() - t0) / 1000)}s)`);
