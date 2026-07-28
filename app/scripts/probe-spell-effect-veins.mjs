const B = "file:///C:/Projects/mtg-tool/.claude/worktrees/omnath-40e49c/app/src/lib/";
const { classifyCard, isNativeTier, mechanismBucket } = await import(B + "learn/coverage.js");
const { allCards } = await import(B + "server/cardIndex.js");

const ranked = allCards().filter((c) => typeof c.edhrec_rank === "number").sort((a, b) => a.edhrec_rank - b.edhrec_rank);
const pool = [];
for (const c of ranked.slice(0, 2500)) {
  const type = String(c.type || c.type_line || "");
  const oracle = String(c.oracle || c.oracle_text || "");
  const card = { name: c.name, type, oracle, mana: c.mana || c.mana_cost, power: c.power, toughness: c.toughness, keywords: c.keywords || [] };
  const t = classifyCard(card);
  if (isNativeTier(t) || t === "land") continue;
  if (mechanismBucket(oracle) !== "Spell effect (other)") continue;
  pool.push({ name: c.name, rank: c.edhrec_rank, oracle, type, mana: card.mana, power: card.power, toughness: card.toughness });
}
console.log(`parked top-2500 "Spell effect (other)": ${pool.length}\n`);

// Split each card into sentences and keep the ones that DON'T parse — those are the real blockers.
function sentences(o) {
  return o.replace(/\([^)]*\)/g, " ").split(/\n|(?<=\.)\s+/).map((s) => s.trim()).filter((s) => s.length > 8);
}
// A sentence counts as MODELED if, standing alone as the WHOLE text of a card OF ITS OWN TYPE, it
// classifies native. Two corrections learned the hard way, both of which produced false veins:
//   1. parseEffectClause alone misses the legacy whole-card path (parseSpellEffect), so plain
//      "destroy target creature" / "draw a card" read as blockers. Use classifyCard.
//   2. The wrapper must carry the SOURCE CARD'S TYPE. Wrapping everything as an Instant means a
//      PERMANENT'S STATIC can never classify native however well modeled — which reported
//      "you may play an additional land on each of your turns" as a 4-card vein when
//      extraLandDropsOf has modeled it all along (Exploration/Azusa are native-static today).
const ok = (s, card) => {
  const t = s.replace(/\.$/, "").trim();
  const type = /\b(Instant|Sorcery)\b/.test(card.type) ? card.type : card.type;
  try {
    return /^native/.test(classifyCard({
      name: "Probe", type, mana: card.mana || "{1}{U}", keywords: [],
      power: card.power, toughness: card.toughness, oracle: `${t}.`,
    }));
  } catch { return false; }
};
const shape = (s, name) => s.split(name).join("~")
  .replace(/\{[^}]+\}/g, "{C}").replace(/\b\d+\b/g, "N")
  .replace(/\s+/g, " ").trim().toLowerCase().replace(/\.$/, "");

const blockers = new Map();
for (const c of pool) {
  for (const s of sentences(c.oracle)) {
    if (ok(s, c)) continue;
    const k = shape(s, c.name).slice(0, 70);
    const e = blockers.get(k) || { n: 0, ex: [] };
    e.n++; if (e.ex.length < 3) e.ex.push(`${c.name} #${c.rank}`);
    blockers.set(k, e);
  }
}
console.log("=== most common UNPARSED sentences in that pile (the veins) ===");
[...blockers.entries()].filter(([, v]) => v.n >= 3).sort((a, b) => b[1].n - a[1].n).slice(0, 30)
  .forEach(([k, v], i) => console.log(`${String(i + 1).padStart(3)}. ${String(v.n).padStart(3)}x  ${k}\n          ${v.ex.join(" · ")}`));
