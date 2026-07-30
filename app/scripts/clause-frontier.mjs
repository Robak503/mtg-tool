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
import fs from "node:fs";
import path from "node:path";
import { allCards, publicCard, lookupCard } from "../src/lib/server/cardIndex.js";
import { classifyCard, isNativeTier } from "../src/lib/learn/coverage.js";
import { parseEffectClause } from "../src/lib/learn/effects/parser.js";

const args = process.argv.slice(2);
const ONLY = args.includes("--spell") ? "spell" : args.includes("--perm") ? "perm" : "all";
const DECKS = args.includes("--decks"); // census ONLY cards in the saved profile decks (the deck-targeted phase-1 frontier)
const MIN = (() => { const i = args.indexOf("--min"); return i >= 0 ? parseInt(args[i + 1], 10) || 8 : (DECKS ? 2 : 8); })();

// Deck-card source (mirrors measure-coverage loadDecks/enrich): every distinct card across saved profile decks,
// with which deck names use it — so the frontier can rank clauses by DECK-card leverage.
function deckCards() {
  // ⛔ 2026-07-30: this read a RELATIVE "data/profiles", so from a worktree (where profiles live only in the
  // install's AppData root) readdirSync threw, the catch returned [], and --decks reported
  // "non-native=0, with-unparsed-tail=0" — which reads as "the shelf is perfect" instead of "I found no
  // decks". Same class as the Scryfall sync that synced nothing and exited 0: absence presented as a result.
  // Now honours MTG_APP_ROOT (like shelf-gap-ledger.mjs) and FAILS LOUD rather than returning an empty list.
  const appRoot = (process.env.MTG_APP_ROOT || "").trim() || process.cwd();
  const profilesDir = path.join(appRoot, "data", "profiles");
  const byName = new Map(); // name -> { type, oracle, name, decks:Set }
  let dirs;
  try {
    dirs = fs.readdirSync(profilesDir).filter((d) => d.startsWith("prof_"));
  } catch (error) {
    throw new Error(`--decks: no profiles at ${profilesDir} (${error.code || error.message}). Set MTG_APP_ROOT to an install's app-data root.`);
  }
  if (!dirs.length) throw new Error(`--decks: ${profilesDir} contains no prof_* directories — refusing to report an empty frontier as a clean one.`);
  for (const dir of dirs) {
    const file = path.join(profilesDir, dir, "decks.local.json");
    if (!fs.existsSync(file)) continue;
    let doc; try { doc = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }
    const decks = Array.isArray(doc) ? doc : (doc.decks || Object.values(doc).find(Array.isArray) || []);
    for (const dk of decks) {
      for (const entry of dk.cards || []) {
        if (entry.section === "Sideboard" || entry.section === "Tokens") continue;
        const found = lookupCard(entry.name); if (!found) continue;
        const c = publicCard(found);
        let e = byName.get(c.name);
        // ⛔ 2026-07-30: this used to rebuild the card as { type, oracle, name } — DROPPING mana, power and
        // toughness. classifyCard reads all three, so every {X} card (the cost IS the X value) and every
        // creature was mis-classified, and --decks reported 300 "non-native" deck cards that are in fact
        // native: Gelatinous Genesis, Mistcutter Hydra, Steelbane Hydra, Stonecoil Serpent, Biomass Mutation,
        // Braingeyser, Pull from Tomorrow, Nature's Rhythm … all already native, all listed as blocked.
        // The frontier's "X-value cluster" was an artifact of the stripped object, nothing more.
        // Carry the WHOLE publicCard; only `decks` is ours to add.
        if (!e) { e = { ...c, decks: new Set() }; byName.set(c.name, e); }
        if (dk.name) e.decks.add(dk.name);
      }
    }
  }
  return [...byName.values()];
}

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

function* candidates() {
  if (DECKS) { for (const c of deckCards()) yield c; return; }
  for (const raw of allCards()) { let c; try { c = publicCard(raw); } catch { continue; } if (isRealCard(c)) yield c; }
}

const buckets = new Map(); // normTail -> { cards:Set, single:bool, sample:[], spell:0, perm:0, decks:Set }
let nonNative = 0, withTail = 0, singleTail = 0;

for (const c of candidates()) {
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
  if (!b) { b = { cards: new Set(), single, sample: [], spell: 0, perm: 0, decks: new Set() }; buckets.set(key, b); }
  b.cards.add(c.name);
  if (single) b.single = true;
  if (spell) b.spell++; else b.perm++;
  for (const d of (c.decks || [])) b.decks.add(d);
  if (b.sample.length < 6 && !b.sample.includes(c.name)) b.sample.push(c.name);
}

const ranked = [...buckets.entries()]
  .map(([k, b]) => ({ k, n: b.cards.size, single: b.single, spell: b.spell, perm: b.perm, sample: b.sample, decks: [...b.decks] }))
  .sort((a, b) => b.n - a.n);

console.log(`=== CLAUSE FRONTIER (${ONLY}${DECKS ? " · DECKS" : ""}) — non-native=${nonNative}, with-unparsed-tail=${withTail}, single-sentence-tail=${singleTail} ===\n`);
console.log(`--- TOP single-sentence tails (the "one clause from native" trunk; n = distinct cards), min ${MIN} ---`);
let shown = 0;
for (const r of ranked) {
  if (!r.single || r.n < MIN) continue;
  console.log(`  ${String(r.n).padStart(4)}  [${r.spell ? "S" : ""}${r.perm ? "P" : ""}]  ${r.k}`);
  console.log(`        e.g. ${r.sample.join(", ")}${DECKS ? `   « ${r.decks.length} deck(s): ${r.decks.slice(0, 6).join(", ")}` : ""}`);
  if (++shown >= 50) break;
}
console.log(`\n--- TOP all tails incl. multi-sentence (context), min ${MIN} ---`);
shown = 0;
for (const r of ranked) {
  if (r.n < MIN) continue;
  console.log(`  ${String(r.n).padStart(4)}  ${r.single ? "1" : "+"}  ${r.k.slice(0, 110)}`);
  if (++shown >= 30) break;
}
