// Colour-disjunction vein, corpus-wide. REGEX LITERALS ONLY — the first cut built the pattern from a
// template string through a shell heredoc, one backslash level was eaten, `\b` became a literal BACKSPACE
// character, and the probe reported a confident "0 flips" on a vein that is real.
import fs from "node:fs";
const { classifyCard } = await import("file:///C:/Projects/mtg-tool/.claude/worktrees/omnath-9be016/app/src/lib/learn/coverage.js");

const cards = JSON.parse(fs.readFileSync(process.env.ORACLE_PATH, "utf8"));
const DISJ = /\b(white|blue|black|red|green) or (white|blue|black|red|green)\b/i;   // no /g — .test() is stateless
const DISJ_G = /\b(white|blue|black|red|green) or (white|blue|black|red|green)\b/gi;

// SANITY GATE: if the pattern can't match the known carrier, the run is meaningless. Refuse rather than
// report a clean zero.
if (!DISJ.test("Enchant red or green creature")) { console.error("PATTERN BROKEN — refusing to report"); process.exit(1); }

const rows = [];
for (const c of cards) {
  const oracle = String(c.oracle_text || "");
  if (!DISJ.test(oracle)) continue;
  const tl = String(c.type_line || "");
  if (tl.includes(" // ")) continue;
  const card = { name: c.name, type: tl, mana: c.mana_cost, power: c.power, toughness: c.toughness, oracle };
  if (String(classifyCard(card)).startsWith("native")) continue;
  const after = classifyCard({ ...card, oracle: oracle.replace(DISJ_G, "$1") });
  if (String(after).startsWith("native")) rows.push({ name: c.name, type: tl.split(" —")[0].trim(), after });
}
console.log(`carriers probed, FLIPS when the colour disjunction collapses: ${rows.length}`);
const byType = {};
for (const r of rows) (byType[r.type] ||= []).push(`${r.name} -> ${r.after}`);
for (const [t, ns] of Object.entries(byType).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n  ${String(ns.length).padStart(3)}  ${t}`);
  for (const n of ns.slice(0, 12)) console.log(`        ${n}`);
}
