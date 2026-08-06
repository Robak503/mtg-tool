// CONTROL-SCOPE noun gap. triggers.js/atoms carry `(?:you don't control|an opponent controls)` as a
// SETTLED alternation in three places — so a matcher accepting only one side parks the other wording.
// The same instrument that found CD-OPP (seven siblings with an alternation, one holdout without).
// Regex LITERALS, sanity gate, and CARRIER COUNTS beside flips (a zero without carriers is not a negative).
import fs from "node:fs";
const { classifyCard } = await import("file:///C:/Projects/mtg-tool/.claude/worktrees/omnath-9be016/app/src/lib/learn/coverage.js");

const cards = JSON.parse(fs.readFileSync(process.env.ORACLE_PATH, "utf8"));

const SWAPS = [
  { name: "you don't control -> an opponent controls", find: /\byou don't control\b/gi, to: "an opponent controls", probe: "target creature you don't control" },
  { name: "an opponent controls -> you don't control", find: /\ban opponent controls\b/gi, to: "you don't control", probe: "target creature an opponent controls" },
  { name: "defending player -> target player", find: /\bdefending player\b/gi, to: "target player", probe: "defending player loses 2 life" },
  { name: "its controller -> target player", find: /\bits controller\b/gi, to: "target player", probe: "its controller sacrifices it" },
];
for (const s of SWAPS) {
  if (!new RegExp(s.find.source, "i").test(s.probe)) { console.error(`PATTERN BROKEN for ${s.name} — refusing to report`); process.exit(1); }
}

const results = {}, carriers = {};
for (const s of SWAPS) { results[s.name] = []; carriers[s.name] = { total: 0, parked: 0 }; }
for (const c of cards) {
  const oracle = String(c.oracle_text || "");
  const tl = String(c.type_line || "");
  if (!oracle || tl.includes(" // ")) continue;
  // TOKENS ARE NOT IN THE MEASURED CORPUS — see probe-noun-gap.mjs for the measurement that forced this.
  // tier-snapshot.mjs excludes them, so counting them here over-promises a vein.
  if (/^Token\b/.test(tl)) continue;
  const card = { name: c.name, type: tl, mana: c.mana_cost, power: c.power, toughness: c.toughness, oracle };
  let before;
  for (const s of SWAPS) {
    s.find.lastIndex = 0;
    if (!s.find.test(oracle)) continue;
    carriers[s.name].total++;
    if (before === undefined) before = classifyCard(card);
    if (String(before).startsWith("native")) continue;
    carriers[s.name].parked++;
    const after = classifyCard({ ...card, oracle: oracle.replace(s.find, s.to) });
    if (String(after).startsWith("native")) results[s.name].push(`${c.name} -> ${after}`);
  }
}
for (const [k, v] of Object.entries(results).sort((a, b) => b[1].length - a[1].length)) {
  const c = carriers[k];
  const verdict = c.total === 0 ? "  ⛔ NO CARRIERS — empty axis, not a negative"
    : v.length === 0 ? "  ⓘ real negative" : "";
  console.log(`\n=== ${String(v.length).padStart(3)} flips | ${String(c.parked).padStart(4)} parked of ${String(c.total).padStart(4)} carriers | ${k}${verdict}`);
  for (const n of v.slice(0, 14)) console.log(`        ${n}`);
  if (v.length > 14) console.log(`        … and ${v.length - 14} more`);
}
