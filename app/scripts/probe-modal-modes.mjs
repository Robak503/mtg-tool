const B = "file:///C:/Projects/mtg-tool/.claude/worktrees/omnath-40e49c/app/src/lib/";
const { classifyCard } = await import(B + "learn/coverage.js");
const { parseEffectProgram } = await import(B + "learn/effects/parser.js");
const { allCards } = await import(B + "server/cardIndex.js");

// SCOPE: instants/sorceries only, where the WHOLE oracle is the modal spell effect — the exact
// shape parseModal() sees. Permanents carry their modal inside a triggered/activated ability and
// would need that ability extracted first; they are counted but not attributed.
function splitModes(oracle) {
  const stripped = oracle.replace(/\([^)]*\)/g, " ");
  // Lead-ins: "Choose one —", "Choose two —", "Choose one or both —", "Choose one or more —",
  // "Choose three.", "Choose one that hasn't been chosen this turn —", the Akroma's-Will both-form.
  const re = /choose (?:one|two|three|four|any number)(?:\s+or\s+(?:both|more))?(?:\s+that hasn't been chosen this turn)?\s*[.—-]?\s*/i;
  const hit = stripped.match(re);
  if (!hit) return null;
  const rest = stripped.slice(hit.index + hit[0].length).trim();
  if (!rest.includes("\u2022")) return null;
  return rest
    .split("\u2022")
    .map((p) => p.replace(/^[\u2022\s]+/, "").trim().replace(/\.\s*$/, "").trim())
    .filter(Boolean);
}

// A mode parses if, ON ITS OWN AS A SPELL EFFECT, it yields a HIGH non-modal program with atoms.
// Mirrors parser.js:599-601 (parseEffectClauseImpl + the same three conditions).
function modeOk(text) {
  let p;
  try { p = parseEffectProgram({ name: "X", type: "Instant", oracle: text, mana: "{1}{U}" }); } catch { return false; }
  return !!p && p.confidence === "high" && p.structure !== "modal" && Array.isArray(p.atoms) && p.atoms.length > 0;
}

const ranked = allCards().filter((c) => typeof c.edhrec_rank === "number").sort((a, b) => a.edhrec_rank - b.edhrec_rank);
const failing = new Map();
let spellModal = 0, allOk = 0;
const perCard = [];

for (const c of ranked.slice(0, 2500)) {
  const type = String(c.type || c.type_line || "");
  if (!/\b(Instant|Sorcery)\b/.test(type) || type.includes(" // ")) continue;
  const oracle = String(c.oracle || c.oracle_text || "");
  const card = { name: c.name, type, oracle, mana: c.mana || c.mana_cost, keywords: c.keywords || [] };
  if (/^native/.test(classifyCard(card))) continue;
  const modes = splitModes(oracle);
  if (!modes || modes.length < 2) continue;
  spellModal++;
  const bad = modes.filter((t) => !modeOk(t));
  perCard.push({ name: c.name, rank: c.edhrec_rank, bad, total: modes.length });
  if (!bad.length) { allOk++; continue; }
  for (const t of bad) {
    const key = t.split(c.name).join("~").replace(/\b\d+\b/g, "N").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 74);
    const e = failing.get(key) || { n: 0, cards: [] };
    e.n++;
    if (e.cards.length < 4) e.cards.push(`${c.name} #${c.rank}`);
    failing.set(key, e);
  }
}

console.log(`TOP-2500 parked MODAL instants/sorceries: ${spellModal}`);
console.log(`  every mode parses (blocked by something else): ${allOk}`);
console.log(`  blocked by >=1 unparseable mode: ${spellModal - allOk}\n`);
console.log("=== FAILING MODES, ranked — each is one small effect to build ===");
[...failing.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 26)
  .forEach(([t, v], i) => console.log(`${String(i + 1).padStart(3)}. ${String(v.n).padStart(2)}x  ${t}\n          ${v.cards.slice(0, 3).join(" · ")}`));

console.log("\n=== cards ONE failing mode away (cheapest staples) ===");
perCard.filter((c) => c.bad.length === 1).sort((a, b) => a.rank - b.rank)
  .forEach((c) => console.log(`  #${String(c.rank).padStart(4)} ${c.name.padEnd(24)} (${c.total} modes)  ${c.bad[0].slice(0, 58)}`));
