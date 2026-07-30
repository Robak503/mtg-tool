/**
 * sweep-noncreature-target-gates.mjs — the DISCOVERY half of the non-creature-target drift guard.
 *
 * Enumerates every (op, targetType) pair the parser emits with a NON-CREATURE permanent targetType across the
 * whole corpus. Each pair is a place where a resolver whose loop ends in `t.type === "creature"` would
 * SILENTLY DO NOTHING while the card classifies native — a bug class that bit three times in one run
 * (untap-self, regenerate, pump/keyword-grant) and that no classification test can see.
 *
 * Workflow: run this after teaching a parser a new non-creature noun. Any pair it prints that is NOT already
 * covered in src/lib/learn/nonCreatureTargetResolvers.test.js needs a case added there — that test is the
 * ratchet, this is the discovery tool. Local-only (reads the bundled oracle index), like measure-coverage.
 *
 *   npm run sweep:noncreature-gates            # print the table
 *   npm run sweep:noncreature-gates -- out.json  # also dump it
 */
import fs from "node:fs";
import { allCards, publicCard } from "../src/lib/server/cardIndex.js";
import { parseEffectProgram } from "../src/lib/learn/effects/parser.js";
import { classifyCard } from "../src/lib/learn/coverage.js";

// Which (op, targetType) pairs does the PARSER actually emit with a NON-CREATURE permanent targetType?
// Those are the only places a creature-gated resolver can silently drop a real target.
const NONCREATURE = new Set(["permanent", "artifact", "enchantment", "land", "nonlandPermanent", "planeswalker",
  "artifactOrEnchantment", "creatureOrArtifact", "artifactCreatureOrLand", "basicLand", "nonbasicLand"]);
const pairs = new Map();   // "op|targetType" -> { count, natives, examples[] }

function walk(atoms, sink) {
  for (const a of atoms || []) {
    if (!a || typeof a !== "object") continue;
    if (a.op && a.targetType && NONCREATURE.has(a.targetType)) sink.push(`${a.op}|${a.targetType}`);
    for (const k of ["effectAtoms", "elseAtoms", "atoms", "modes"]) if (Array.isArray(a[k])) walk(a[k], sink);
  }
}

for (const c of allCards()) {
  const tl = c.type_line || "";
  if (!tl || /\b(Token|Emblem|Scheme|Plane|Phenomenon|Vanguard|Dungeon|Conspiracy|Sticker|Attraction|Card)\b/.test(tl)) continue;
  const pub = publicCard(c);
  let prog;
  try { prog = parseEffectProgram({ type: pub.type, oracle: pub.oracle, mana: pub.mana, name: pub.name }); } catch { continue; }
  if (!prog) continue;
  const sink = [];
  walk(prog.atoms, sink);
  if (prog.structure === "modal") for (const m of prog.modes || []) walk(m.atoms, sink);
  if (!sink.length) continue;
  const tier = classifyCard(pub);
  const isNat = /^native/.test(tier) || tier === "land";
  for (const key of new Set(sink)) {
    if (!pairs.has(key)) pairs.set(key, { count: 0, natives: 0, examples: [] });
    const e = pairs.get(key);
    e.count++;
    if (isNat) { e.natives++; if (e.examples.length < 4) e.examples.push(c.name); }
  }
}

const rows = [...pairs.entries()].map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.natives - a.natives);
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(rows, null, 1));
console.log("(op, non-creature targetType) pairs the parser emits:", rows.length);
console.log("op                      targetType            cards  NATIVE  examples");
for (const r of rows) {
  const [op, tt] = r.key.split("|");
  console.log(`  ${op.padEnd(22)} ${tt.padEnd(20)} ${String(r.count).padStart(5)} ${String(r.natives).padStart(6)}  ${r.examples.join(", ")}`);
}
