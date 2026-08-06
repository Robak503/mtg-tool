// SYSTEMIC NOUN-GAP PROBE. LH-2 found a parser that accepted "target player's hand" but not "target
// opponent's hand" — the atom, resolver and gates were all built and the larger half of the corpus never
// reached them. That is a SHAPE, not a one-off: any parser anchored on one seat noun has the same hole.
// Method: swap the seat noun in a parked card's oracle and see if it flips. A flip means the ENGINE can
// already do the thing and only the wording is unrecognised.
// Regex LITERALS + a sanity gate, per the standing rule (a broken probe reports a clean zero).
import fs from "node:fs";
const { classifyCard } = await import("file:///C:/Projects/mtg-tool/.claude/worktrees/omnath-9be016/app/src/lib/learn/coverage.js");

const cards = JSON.parse(fs.readFileSync(process.env.ORACLE_PATH, "utf8"));

const SWAPS = [
  { name: "target opponent -> target player", find: /target opponent/gi, to: "target player" },
  { name: "target player -> target opponent", find: /target player/gi, to: "target opponent" },
  { name: "an opponent -> a player", find: /\ban opponent\b/gi, to: "a player" },
  { name: "each opponent -> each player", find: /\beach opponent\b/gi, to: "each player" },
  { name: "that player -> target player", find: /\bthat player\b/gi, to: "target player" },
];

// SANITY GATE: every pattern must match its own name's source phrase, or the run refuses to report.
for (const s of SWAPS) {
  const probe = s.name.split(" -> ")[0];
  s.find.lastIndex = 0;
  if (!new RegExp(s.find.source, "i").test(probe)) { console.error(`PATTERN BROKEN for ${s.name} — refusing to report`); process.exit(1); }
}

const results = {};
for (const s of SWAPS) results[s.name] = [];
for (const c of cards) {
  const oracle = String(c.oracle_text || "");
  const tl = String(c.type_line || "");
  if (!oracle || tl.includes(" // ")) continue;
  const card = { name: c.name, type: tl, mana: c.mana_cost, power: c.power, toughness: c.toughness, oracle };
  let before;
  for (const s of SWAPS) {
    s.find.lastIndex = 0;
    if (!s.find.test(oracle)) continue;
    if (before === undefined) { before = classifyCard(card); if (String(before).startsWith("native")) break; }
    const after = classifyCard({ ...card, oracle: oracle.replace(s.find, s.to) });
    if (String(after).startsWith("native")) results[s.name].push(`${c.name} -> ${after}`);
  }
}
for (const [k, v] of Object.entries(results).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n=== ${String(v.length).padStart(4)} flips | ${k}`);
  for (const n of v.slice(0, 14)) console.log(`        ${n}`);
  if (v.length > 14) console.log(`        … and ${v.length - 14} more`);
}
