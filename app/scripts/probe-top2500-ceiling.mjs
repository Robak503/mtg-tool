const B = "file:///C:/Projects/mtg-tool/.claude/worktrees/omnath-40e49c/app/src/lib/";
const { classifyCard, isNativeTier, mechanismBucket } = await import(B + "learn/coverage.js");
const { allCards } = await import(B + "server/cardIndex.js");

const ranked = allCards().filter((c) => typeof c.edhrec_rank === "number").sort((a, b) => a.edhrec_rank - b.edhrec_rank);
const parked = [];
let playable = 0, total = 0;
for (const c of ranked.slice(0, 2500)) {
  const type = String(c.type || c.type_line || "");
  const card = {
    name: c.name, type, oracle: c.oracle || c.oracle_text || "", mana: c.mana || c.mana_cost,
    power: c.power, toughness: c.toughness, keywords: c.keywords || [],
  };
  const t = classifyCard(card);
  total++;
  if (isNativeTier(t) || t === "land") { playable++; continue; }
  parked.push({ name: c.name, rank: c.edhrec_rank, bucket: mechanismBucket(card.oracle), tier: t });
}
console.log(`TOP-2500: ${playable}/${total} playable = ${(100 * playable / total).toFixed(1)}%   parked = ${parked.length}\n`);

const by = new Map();
for (const p of parked) {
  const e = by.get(p.bucket) || { n: 0, ex: [] };
  e.n++; if (e.ex.length < 3) e.ex.push(`${p.name} #${p.rank}`);
  by.set(p.bucket, e);
}
const rows = [...by.entries()].sort((a, b) => b[1].n - a[1].n);
console.log("=== the 1,198 parked top-2500 cards, by MECHANISM bucket ===");
let cum = 0;
rows.forEach(([b, v]) => {
  cum += v.n;
  console.log(`  ${String(v.n).padStart(4)}  (cum ${String(Math.round(100 * cum / parked.length)).padStart(3)}%)  ${b}`);
  console.log(`         ${v.ex.join(" · ")}`);
});

// What would reaching 70% require?
const need70 = Math.ceil(0.70 * total) - playable;
const need80 = Math.ceil(0.80 * total) - playable;
console.log(`\nTo hit 70% of the top 2500: need ${need70} more of the ${parked.length} parked (${(100 * need70 / parked.length).toFixed(0)}% of them).`);
console.log(`To hit 80%: need ${need80} (${(100 * need80 / parked.length).toFixed(0)}% of them).`);
