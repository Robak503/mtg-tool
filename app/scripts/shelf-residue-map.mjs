/**
 * shelf-residue-map.mjs — what, if built, unparks the most DECK SLOTS (composites included).
 *
 *   MTG_APP_ROOT=<root> node scripts/shelf-residue-map.mjs [--top=30] [--json=<path>] [--all-decks]
 *
 * ⭐ WHY THIS EXISTS (Colton, 2026-09-30: "Do my decks" — "make or change any tools you want"). The two shelf tools each
 * leave the biggest bucket dark: shelf-gap-ledger.mjs names a card's blocker only when ONE line accounts for it and prints
 * "(composite)" for the rest — 145 of the 249 blocked slots that day — and probe-shelf-one-line-away.mjs covers 2–4-line
 * cards and ranks by decks touched. Neither can say "these two lines, built together, unpark six slots in four decks".
 *
 * METHOD — the census's DELETION PROBING, extended to the MINIMAL BLOCKING SET. For every blocked card on the shelf, find the
 * smallest k (1, 2 or 3) for which removing some k oracle lines makes the whole card classify native; every k-subset that
 * does is a minimal blocking set. The classifier answers, never a text pattern (the ledger's own header records what the
 * pattern version got wrong). Lines normalize as the residue census does (numbers → N, pips → {C}, the card's name → ~), so
 * a shape shared by several cards aggregates.
 *
 * OUTPUT, all counted in deck SLOTS (a card in three decks is three slots), with "bar" = slots in decks under 90%:
 *   1. SHAPES — each line shape, ranked by the bar slots it unparks ALONE (sole) then with ONE partner shape (paired).
 *   2. PAIRS — two shapes that together unpark a card, ranked the same way.
 *   3. PER DECK — every deck under the bar: its need, and each blocked card with its smallest blocking set.
 *
 * ⚠️ HONESTY BOUNDS (the one-line-away tool's, restated): the probe measures the CLASSIFIER, not the effort — a shape is a
 * sized lead, not a promise, and dropping a line changes a card's meaning. It does not know the standing exclusions (THEFT —
 * never trained; pre-game / hidden-information seams; the CREED refusals — SHELF-85-RUNBOOK §1.2): those rows still read
 * here and are still not built. Cards with more than 12 lines, or no minimal set up to k = 3, report as DEEP. Local-only dev
 * tool (reads the deck store under MTG_APP_ROOT); not in CI.
 */
import fs from "node:fs";
import path from "node:path";

import { lookupCard, publicCard } from "../src/lib/server/cardIndex.js";
import { classifyCard, isNativeTier } from "../src/lib/learn/coverage.js";

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const TOP = Number(argv.top) > 0 ? Number(argv.top) : 30;
const BAR = 0.9;

const appRoot = (process.env.MTG_APP_ROOT || "").trim() || process.cwd();
const profilesDir = path.join(appRoot, "data", "profiles");
if (!fs.existsSync(profilesDir)) {
  console.error(`No profiles dir at ${profilesDir} — set MTG_APP_ROOT to an install's app-data root.`);
  process.exit(1);
}

// The residue census's normalizer (scripts/build-residue-census.mjs), so shapes line up across the two tools.
const stripReminder = (s) => String(s || "").replace(/\([^)]*\)/g, " ").replace(/[ \t]+/g, " ");
const NUM_WORDS = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty)\b/g;
function normalizeClause(text, cardName) {
  let t = stripReminder(text).toLowerCase().trim();
  const full = String(cardName || "").toLowerCase();
  const short = full.split(",")[0].trim();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (full) t = t.replace(new RegExp(`\\b${esc(full)}\\b`, "g"), "~");
  if (short && short !== full && short.length > 2) t = t.replace(new RegExp(`\\b${esc(short)}\\b`, "g"), "~");
  t = t.replace(/\{[^}]+\}/g, "{C}");
  t = t.replace(NUM_WORDS, "N").replace(/\b\d+\b/g, "N");
  t = t.replace(/[+-]n\/[+-]n/g, "+N/+N");
  return t.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
}

const nativeWithout = (card, lines, drop) => {
  const rest = lines.filter((_, i) => !drop.includes(i)).join("\n");
  if (!rest.trim()) return false; // an emptied card says nothing
  return isNativeTier(classifyCard({ ...card, oracle: rest }));
};
function* subsets(n, k, start = 0, acc = []) {
  if (acc.length === k) { yield acc.slice(); return; }
  for (let i = start; i < n; i++) { acc.push(i); yield* subsets(n, k, i + 1, acc); acc.pop(); }
}
/** The smallest k (≤ 3) and every k-subset of line indexes whose removal makes the card native; null → DEEP. */
function minimalBlockingSets(card) {
  const lines = String(card.oracle || "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length || lines.length > 12) return null;
  for (let k = 1; k <= Math.min(3, lines.length); k++) {
    if (k === 3 && lines.length > 9) break; // C(n,3) grows fast; a 10+ line card at k = 3 is a wave, not a slice
    const found = [];
    for (const drop of subsets(lines.length, k)) if (nativeWithout(card, lines, drop)) found.push(drop);
    if (found.length) return { k, sets: found.map((drop) => drop.map((i) => normalizeClause(lines[i], card.name))), raw: found.map((drop) => drop.map((i) => lines[i])) };
  }
  return null;
}

// ── the shelf ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const seen = new Set();
const decks = [];
for (const prof of fs.readdirSync(profilesDir)) {
  const file = path.join(profilesDir, prof, "decks.local.json");
  if (!fs.existsSync(file)) continue;
  let doc;
  try { doc = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { console.error(`skipping unreadable ${file}: ${e.message}`); continue; }
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
      blocked.push({ card: c, qty, tier });
    }
    const need = Math.max(0, Math.ceil(slots * BAR) - native);
    decks.push({ name: dk.name, slots, native, pct: slots ? native / slots : 0, need, blocked });
  }
}
const inScope = argv["all-decks"] ? decks : decks.filter((d) => d.pct < BAR);

// ── probe every distinct blocked card once ────────────────────────────────────────────────────────────────────────────
const probe = new Map(); // name → { k, sets, raw } | null
for (const d of inScope) for (const b of d.blocked) if (!probe.has(b.card.name)) probe.set(b.card.name, minimalBlockingSets(b.card));

// ── aggregate in deck slots ───────────────────────────────────────────────────────────────────────────────────────────
const shapes = new Map(); // shape → { sole, soleBar, paired, pairedBar, decks:Set, cards:Set, partners:Map }
const pairs = new Map();  // "a ⟂ b" → { slots, bar, decks:Set, cards:Set }
const bump = (m, k, init) => { if (!m.has(k)) m.set(k, init()); return m.get(k); };
for (const d of inScope) {
  const underBar = d.pct < BAR;
  for (const b of d.blocked) {
    const p = probe.get(b.card.name);
    if (!p) continue;
    // A card counts once per slot even when several minimal sets exist — credit the FIRST set (its cheapest reading).
    const set = p.sets[0];
    if (p.k === 1) {
      const s = bump(shapes, set[0], () => ({ sole: 0, soleBar: 0, paired: 0, pairedBar: 0, decks: new Set(), cards: new Set(), partners: new Map() }));
      s.sole += b.qty; if (underBar) s.soleBar += b.qty; s.decks.add(d.name); s.cards.add(b.card.name);
    } else if (p.k === 2) {
      const [a, c] = [...set].sort();
      for (const [x, y] of [[a, c], [c, a]]) {
        const s = bump(shapes, x, () => ({ sole: 0, soleBar: 0, paired: 0, pairedBar: 0, decks: new Set(), cards: new Set(), partners: new Map() }));
        s.paired += b.qty; if (underBar) s.pairedBar += b.qty; s.decks.add(d.name); s.cards.add(b.card.name);
        s.partners.set(y, (s.partners.get(y) || 0) + b.qty);
      }
      const pr = bump(pairs, `${a} ⟂ ${c}`, () => ({ slots: 0, bar: 0, decks: new Set(), cards: new Set() }));
      pr.slots += b.qty; if (underBar) pr.bar += b.qty; pr.decks.add(d.name); pr.cards.add(b.card.name);
    }
  }
}

// ── report ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const out = [];
const say = (s = "") => out.push(s);
const totalBlocked = inScope.reduce((n, d) => n + d.blocked.reduce((m, b) => m + b.qty, 0), 0);
const byK = { 1: 0, 2: 0, 3: 0, deep: 0 };
for (const d of inScope) for (const b of d.blocked) { const p = probe.get(b.card.name); byK[p ? p.k : "deep"] += b.qty; }
say(`=== SHELF RESIDUE MAP — ${inScope.length} deck(s)${argv["all-decks"] ? "" : " under 90%"} · ${totalBlocked} blocked slots ===`);
say(`   smallest blocking set: 1 line ${byK[1]} · 2 lines ${byK[2]} · 3 lines ${byK[3]} · DEEP (4+ / 13+ lines) ${byK.deep}`);
say(`   need to reach 90% in every deck: ${inScope.reduce((n, d) => n + d.need, 0)} slots`);
say();
say(`--- SHAPES: bar slots unparked ALONE (sole) / with ONE partner (paired) — top ${TOP}`);
const shapeRows = [...shapes.entries()].sort((x, y) => (y[1].soleBar - x[1].soleBar) || (y[1].pairedBar - x[1].pairedBar) || (y[1].sole - x[1].sole));
for (const [shape, s] of shapeRows.slice(0, TOP)) {
  const partners = [...s.partners.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([p, n]) => `${p.slice(0, 50)} ×${n}`).join(" · ");
  say(`  sole ${String(s.soleBar).padStart(2)}/${String(s.sole).padEnd(2)} paired ${String(s.pairedBar).padStart(2)}/${String(s.paired).padEnd(2)} decks ${String(s.decks.size).padStart(2)} │ ${shape.slice(0, 120)}`);
  say(`        cards: ${[...s.cards].slice(0, 6).join(", ")}${s.cards.size > 6 ? ` +${s.cards.size - 6}` : ""}`);
  if (partners) say(`        with: ${partners}`);
}
say();
say(`--- PAIRS: both built → the card unparks — top ${TOP}`);
for (const [key, p] of [...pairs.entries()].sort((x, y) => (y[1].bar - x[1].bar) || (y[1].slots - x[1].slots)).slice(0, TOP)) {
  say(`  bar ${String(p.bar).padStart(2)} slots ${String(p.slots).padStart(2)} decks ${String(p.decks.size).padStart(2)} │ ${[...p.cards].join(", ")}`);
  for (const half of key.split(" ⟂ ")) say(`        · ${half.slice(0, 140)}`);
}
say();
say("--- PER DECK (closest to the bar first): need · each blocked card's smallest blocking set");
for (const d of [...inScope].sort((a, b) => b.pct - a.pct)) {
  say(`  ${d.name}  ${Math.round(d.pct * 100)}%  needs ${d.need}`);
  const rows = d.blocked.map((b) => ({ b, p: probe.get(b.card.name) })).sort((x, y) => (x.p?.k ?? 9) - (y.p?.k ?? 9));
  for (const { b, p } of rows) {
    const tag = p ? `k=${p.k}` : "DEEP";
    const first = p ? p.raw[0].map((l) => l.slice(0, 70)).join("  ⟂  ") : "";
    say(`    ${tag.padEnd(5)} ${b.card.name.padEnd(34).slice(0, 34)} ${first}`);
  }
}
console.log(out.join("\n"));

if (typeof argv.json === "string") {
  const dump = {
    generatedFrom: appRoot,
    decks: inScope.map((d) => ({ name: d.name, pct: d.pct, need: d.need, blocked: d.blocked.map((b) => ({ name: b.card.name, qty: b.qty, tier: b.tier, probe: probe.get(b.card.name) })) })),
  };
  fs.writeFileSync(argv.json, JSON.stringify(dump, null, 2));
  console.error(`wrote ${argv.json}`);
}
