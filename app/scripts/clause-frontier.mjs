/**
 * clause-frontier.mjs — the coverage-frontier census (post-seam, picks the next wave with DATA).
 *
 *   MTG_APP_ROOT=<main-tree app> node scripts/clause-frontier.mjs [--spell|--perm] [--min N]
 *
 * For every REAL, NON-native card it runs the engine's own `parseEffectClause` and collects the
 * `unparsedTail` — the exact clause text the EffectProgram could NOT model. It normalizes each tail
 * (digits→N, quotes→"…", the card's own name→~) and ranks the normalized tails by the number of
 * DISTINCT cards they block. A tail that is a SINGLE sentence = a "one clause from native" card: model
 * that one clause and the card flips. The top single-sentence tails are the cleanest next waves.
 *
 * Read-only / local-only (needs MTG_APP_ROOT → a tree carrying the oracle index). Reuses the SAME
 * classify + parse the runtime uses, so the census is faithful.
 */
import { allCards, publicCard } from "../src/lib/server/cardIndex.js";
import { classifyCard, isNativeTier } from "../src/lib/learn/coverage.js";
import { parseEffectClause } from "../src/lib/learn/effects/parser.js";

const args = process.argv.slice(2);
const ONLY = args.includes("--spell") ? "spell" : args.includes("--perm") ? "perm" : "all";
const MIN = (() => { const i = args.indexOf("--min"); return i >= 0 ? parseInt(args[i + 1], 10) || 8 : 8; })();

function isRealCard(c) {
  const t = c.type || "";
  if (!t) return false;
  return !/\b(Token|Emblem|Scheme|Plane|Phenomenon|Vanguard|Dungeon|Conspiracy|Sticker|Attraction|Card)\b/.test(t);
}
const isSpellType = (t) => /\b(Instant|Sorcery)\b/.test(t || "");

function norm(s, name) {
  let x = String(s || "").toLowerCase().replace(/[’]/g, "'");
  if (name) x = x.split(name.toLowerCase()).join("~");          // the card's own name → ~
  x = x
    .replace(/\{[^}]+\}/g, "{M}")                                 // mana / tap symbols
    .replace(/"[^"]*"/g, '"…"')                                   // quoted abilities/names
    .replace(/\b\d+\b/g, "N")                                     // numbers
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.$/, "");
  return x;
}
// crude sentence count on the ORIGINAL tail (before number-norm) — a single modeled clause is the clean flip
function sentenceCount(s) {
  return String(s || "").split(/(?<=[.!])\s+(?=[A-Z(])/).filter((p) => p.trim()).length;
}

const buckets = new Map(); // normTail -> { cards:Set, single:bool, sample:[], spell:0, perm:0 }
let nonNative = 0, withTail = 0, singleTail = 0;

for (const raw of allCards()) {
  let c;
  try { c = publicCard(raw); } catch { continue; }
  if (!isRealCard(c)) continue;
  const t = classifyCard(c);
  if (isNativeTier(t) || t === "land" || t === "playable-pw") continue;
  const spell = isSpellType(c.type);
  if (ONLY === "spell" && !spell) continue;
  if (ONLY === "perm" && spell) continue;
  nonNative++;
  let prog;
  try { prog = parseEffectClause(c.oracle || "", c.type || ""); } catch { continue; }
  const tail = prog && typeof prog.unparsedTail === "string" ? prog.unparsedTail.trim() : "";
  if (!tail) continue;
  withTail++;
  const single = sentenceCount(tail) <= 1;
  if (single) singleTail++;
  const key = norm(tail, c.name);
  if (!key) continue;
  let b = buckets.get(key);
  if (!b) { b = { cards: new Set(), single, sample: [], spell: 0, perm: 0 }; buckets.set(key, b); }
  b.cards.add(c.name);
  if (single) b.single = true;
  if (spell) b.spell++; else b.perm++;
  if (b.sample.length < 6 && !b.sample.includes(c.name)) b.sample.push(c.name);
}

const ranked = [...buckets.entries()]
  .map(([k, b]) => ({ k, n: b.cards.size, single: b.single, spell: b.spell, perm: b.perm, sample: b.sample }))
  .sort((a, b) => b.n - a.n);

console.log(`=== CLAUSE FRONTIER (${ONLY}) — non-native=${nonNative}, with-unparsed-tail=${withTail}, single-sentence-tail=${singleTail} ===\n`);
console.log(`--- TOP single-sentence tails (the "one clause from native" trunk; n = distinct cards), min ${MIN} ---`);
let shown = 0;
for (const r of ranked) {
  if (!r.single || r.n < MIN) continue;
  console.log(`  ${String(r.n).padStart(4)}  [${r.spell ? "S" : ""}${r.perm ? "P" : ""}]  ${r.k}`);
  console.log(`        e.g. ${r.sample.join(", ")}`);
  if (++shown >= 50) break;
}
console.log(`\n--- TOP all tails incl. multi-sentence (context), min ${MIN} ---`);
shown = 0;
for (const r of ranked) {
  if (r.n < MIN) continue;
  console.log(`  ${String(r.n).padStart(4)}  ${r.single ? "1" : "+"}  ${r.k.slice(0, 110)}`);
  if (++shown >= 30) break;
}
