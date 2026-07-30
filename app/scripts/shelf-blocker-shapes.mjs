/**
 * shelf-blocker-shapes.mjs — WHICH SINGLE FIX MOVES THE MOST SHELF CARDS?
 *
 * shelf-gap-ledger.mjs groups each blocker by how many CORPUS cards share it. That answers "is this a
 * slice?" but not "does it move Colton's shelf" — and I misread it that way once already (Pyrohemia is
 * shared×2 corpus-wide and sits on Hulk Smash, not the cdh deck I was aiming at).
 *
 * So this groups blockers across the SHELF: for every sub-90 deck, every blocked card, attribute the blocker
 * BY REMOVAL, normalise it, and count how many shelf cards + how many DECKS each shape touches.
 *   - many cards on ONE deck  -> the fastest route to pushing that deck over 90
 *   - fewer cards on MANY decks -> broad lift, better for the whole shelf
 * Both are printed because the target (>=90% per deck) rewards concentration, while total progress rewards spread.
 */
import fs from "node:fs";
import path from "node:path";

const APP = "C:/Projects/mtg-tool/.claude/worktrees/omnath-40e49c/app";
const { allCards, lookupCard, publicCard } = await import(`file:///${APP}/src/lib/server/cardIndex.js`);
const { classifyCard, isNativeTier } = await import(`file:///${APP}/src/lib/learn/coverage.js`);

const appRoot = process.env.MTG_APP_ROOT;
const profilesDir = path.join(appRoot, "data", "profiles");

const normalise = (line, name) => {
  const short = String(name || "###").split(",")[0];
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(line)
    .replace(new RegExp(esc(name || "###"), "gi"), "<self>")
    .replace(new RegExp(esc(short), "gi"), "<self>")
    .replace(/\{[^}]+\}/g, "{M}")
    .replace(/\b\d+\b/g, "N")
    .toLowerCase().trim();
};

const blockerOf = (card) => {
  const lines = String(card.oracle || "").split(/\n+/).filter(Boolean);
  if (lines.length <= 1) return lines[0] || "";
  for (const l of lines) {
    const rest = lines.filter((x) => x !== l).join("\n");
    if (!rest.trim()) continue;
    if (isNativeTier(classifyCard({ ...card, oracle: rest }))) return l;
  }
  return "";
};

// corpus-wide count, for context only
const corpusReasons = new Map();
for (const raw of allCards()) {
  const c = publicCard(raw);
  if (!c.oracle || isNativeTier(classifyCard(c))) continue;
  const key = normalise(blockerOf(c), c.name);
  if (key) corpusReasons.set(key, (corpusReasons.get(key) || 0) + 1);
}

const shapes = new Map(); // key -> { cards:[{deck,name}], decks:Set, sample:line }
const seen = new Set();
const decks = [];
for (const prof of fs.readdirSync(profilesDir)) {
  const file = path.join(profilesDir, prof, "decks.local.json");
  if (!fs.existsSync(file)) continue;
  let doc;
  try { doc = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }
  const list = Array.isArray(doc) ? doc : (doc.decks || Object.values(doc).find(Array.isArray) || []);
  for (const dk of list) {
    if (!dk?.name || seen.has(dk.name)) continue;
    seen.add(dk.name);
    let slots = 0, native = 0;
    const blocked = [];
    for (const entry of dk.cards || []) {
      if (entry.section === "Sideboard" || entry.section === "Tokens") continue;
      const qty = entry.qty || 1;
      slots += qty;
      const found = lookupCard(entry.name);
      if (!found) continue;
      const c = publicCard(found);
      const tier = classifyCard(c);
      if (isNativeTier(tier) || tier === "land") { native += qty; continue; }
      blocked.push(c);
    }
    const pct = slots ? Math.round((native / slots) * 100) : 0;
    if (pct >= 90) continue;
    decks.push({ name: dk.name, pct, need: Math.max(0, Math.ceil(slots * 0.9) - native) });
    for (const c of blocked) {
      const line = blockerOf(c);
      const key = line ? normalise(line, c.name) : `__composite__${c.name}`;
      if (!shapes.has(key)) shapes.set(key, { cards: [], decks: new Set(), sample: line || "(composite)", composite: !line });
      const s = shapes.get(key);
      s.cards.push({ deck: dk.name, name: c.name });
      s.decks.add(dk.name);
    }
  }
}

console.log(`${decks.length} decks below the bar:`);
for (const d of decks.sort((a, b) => b.pct - a.pct)) console.log(`   ${String(d.pct).padStart(3)}%  needs ${String(d.need).padStart(2)}  ${d.name}`);

const rows = [...shapes.entries()].filter(([, s]) => !s.composite)
  .sort((a, b) => b[1].cards.length - a[1].cards.length || b[1].decks.size - a[1].decks.size);

console.log(`\n=== BLOCKER SHAPES BY SHELF-CARD COUNT (non-composite) ===`);
for (const [key, s] of rows.slice(0, 22)) {
  const corpus = corpusReasons.get(key) || 1;
  console.log(`${String(s.cards.length).padStart(3)} shelf cards · ${s.decks.size} deck(s) · corpus×${corpus}`);
  console.log(`     ${s.sample.slice(0, 104)}`);
  console.log(`     ${s.cards.slice(0, 6).map((c) => `${c.name} [${c.deck}]`).join(" · ")}`);
}
const multi = rows.filter(([, s]) => s.cards.length > 1);
console.log(`\n${rows.length} distinct non-composite shapes · ${multi.length} cover MORE THAN ONE shelf card`);
