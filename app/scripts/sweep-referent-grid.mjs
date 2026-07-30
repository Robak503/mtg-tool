/**
 * sweep-referent-grid.mjs — WHICH REFERENT FORMS DOES EACH ATOM OP ACTUALLY HAVE?
 *
 * For every atom op the parser emits anywhere in the corpus, records which referent kinds it is ever emitted
 * with: a chosen target, the SOURCE (target:"self"), an Aura host ("enchanted"), or the triggering permanent.
 * An op built for one referent but never another is a candidate EMPTY CELL — the shape that paid three
 * separate slices in one run (self-tuck +5, regenerate-on-permanents +5, self-untap +5). Each of those was
 * not a missing capability but a missing COMBINATION of two that already shipped.
 *
 * ⭐ IT CARRIES ITS OWN POSITIVE CONTROL and exits non-zero when blind. Two versions of this probe reported a
 * confident "tuck/self = 0" ONE SLICE AFTER tuck/self shipped — first because it walked only spell bodies,
 * then because it walked abilities AFTER an early-continue that skips permanents with no spell program. A
 * grid of empty cells is worthless unless the probe can be shown to SEE a filled one, so it says so itself.
 *
 * ⚠️ An empty cell is a CANDIDATE, not a gap: confirm the printed shape exists in the corpus before building.
 * exile/self and destroy/self both read empty and are CORRECT — the corpus prints "Sacrifice this creature"
 * (already built) instead. Local-only, like measure-coverage.
 *
 *   npm run sweep:referent-grid            # print the grid
 *   npm run sweep:referent-grid -- out.json  # also dump it
 */
import fs from "node:fs";
import { allCards, publicCard } from "../src/lib/server/cardIndex.js";
import { parseEffectProgram } from "../src/lib/learn/effects/parser.js";
import { parseActivatedAbilities } from "../src/lib/learn/effects/abilities.js";
import { detectTriggers } from "../src/lib/learn/triggers.js";

// THE REFERENT GRID. For every atom op the parser emits anywhere in the corpus, record WHICH referent
// kinds it is ever emitted with. An op built for one referent but never another is a candidate empty cell —
// the shape that paid self-tuck (+5), regenerate/permanent (+5) and untap-self (+5) in this run.
const KIND = (a) => {
  if (a.target === "self") return "self";
  if (a.target === "enchanted") return "enchanted";
  if (a.target === "thatCreature" || a.target === "thatPermanent") return "triggering";
  if (a.scope) return `scope:${a.scope}`;
  if (a.targetType) return "chosenTarget";
  return "untargeted";
};
const grid = new Map();   // op -> Map(kind -> {n, example})

function walk(atoms, name) {
  for (const a of atoms || []) {
    if (!a || typeof a !== "object" || !a.op) continue;
    const k = KIND(a);
    if (!grid.has(a.op)) grid.set(a.op, new Map());
    const g = grid.get(a.op);
    if (!g.has(k)) g.set(k, { n: 0, example: name });
    g.get(k).n++;
    for (const key of ["effectAtoms", "elseAtoms", "atoms"]) if (Array.isArray(a[key])) walk(a[key], name);
  }
}

for (const c of allCards()) {
  const tl = c.type_line || "";
  if (!tl || /\b(Token|Emblem|Scheme|Plane|Phenomenon|Vanguard|Dungeon|Conspiracy|Sticker|Attraction|Card)\b/.test(tl)) continue;
  const pub = publicCard(c);
  // ACTIVATED + TRIGGERED programs FIRST, and unconditionally. Two bugs lived here, both caught by the
  // positive control rather than by reading the code:
  //   1. the first version walked ONLY the spell body, so self referents (which live almost entirely on
  //      activated abilities and triggers) were invisible;
  //   2. the second version walked them but AFTER `if (!prog) continue` — and a permanent whose text is all
  //      activated abilities has NO spell program, so Sensei's Divining Top was skipped before it was read.
  // Both produced a confident, wrong "tuck/self = 0" one slice after tuck/self shipped.
  try { for (const ab of parseActivatedAbilities(pub) || []) walk(ab?.program?.atoms, c.name); } catch { /* unparseable card */ }
  try { for (const tr of detectTriggers(pub) || []) walk(tr?.program?.atoms || tr?.effectProgram?.atoms, c.name); } catch { /* unparseable card */ }
  let prog;
  try { prog = parseEffectProgram({ type: pub.type, oracle: pub.oracle, mana: pub.mana, name: pub.name }); } catch { continue; }
  if (!prog) continue;
  walk(prog.atoms, c.name);
  if (prog.structure === "modal") for (const m of prog.modes || []) walk(m.atoms, c.name);
}

const KINDS = ["chosenTarget", "self", "enchanted", "triggering"];
// POSITIVE CONTROL -- a grid full of empty cells is worthless unless the probe can SEE a filled one.
// tuck/self shipped one slice ago (Sensei's Divining Top) and pump/self is ancient; if either reads 0 the
// probe is blind, not the engine, and every "empty cell" below is a hollow zero.
const control = [["tuck", "self"], ["pump", "self"]].map(([op, k]) => op + "/" + k + "=" + (grid.get(op)?.get(k)?.n || 0));
const blind = control.some((c) => c.endsWith("=0"));
console.log("POSITIVE CONTROL: " + control.join("  ") + (blind ? "   <<< PROBE IS BLIND — do not trust the gaps below" : "   (probe can see self referents)"));
if (blind) process.exitCode = 1;
const rows = [...grid.entries()]
  .map(([op, g]) => ({ op, has: Object.fromEntries(KINDS.map((k) => [k, g.get(k)?.n || 0])), all: [...g.keys()] }))
  .filter((r) => KINDS.some((k) => r.has[k] > 0));
rows.sort((a, b) => (b.has.chosenTarget + b.has.self) - (a.has.chosenTarget + a.has.self));

if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(rows, null, 1));
console.log("op                        chosen    self  enchanted  triggering   << EMPTY CELLS are candidates");
for (const r of rows) {
  const cells = KINDS.map((k) => String(r.has[k] || "·").padStart(7)).join("  ");
  const gaps = KINDS.filter((k) => !r.has[k]);
  // Only interesting when the op HAS a chosen form and LACKS a fixed referent (or vice versa).
  const interesting = (r.has.chosenTarget > 0 && !r.has.self) || (r.has.self > 0 && !r.has.chosenTarget);
  console.log(`  ${r.op.padEnd(24)}${cells}   ${interesting ? "  <== " + gaps.join(",") : ""}`);
}
