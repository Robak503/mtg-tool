#!/usr/bin/env node
/**
 * shelf-gap-ledger.mjs — the SIZED, per-deck, per-card list of what the shelf actually needs.
 *
 *   MTG_APP_ROOT=<root> node scripts/shelf-gap-ledger.mjs [--md]
 *
 * ⭐ WHY THIS EXISTS. Every other instrument answers "where is a vein?" — and by 2026-07-29 the honest answer
 * is "there isn't one". Measured that day: the corpus trailing-sentence tail is 397 shapes with 246 singletons;
 * the removal-rider family is 116 cards over 77 shapes, largest cluster 5; the mana-cost guard's spendable
 * kinds are exhausted; the keyword vein paid three times and the rest are real mechanisms. The shelf is now
 * PER-CARD, and "10 decks need ~150 cards" is not a plan.
 *
 * So this reports the work as work: for every sub-90 deck, every blocked card, and for each card WHY it is
 * blocked and HOW MANY OTHER CARDS share that reason. A card whose reason is shared is a slice; a card whose
 * reason is unique is a one-card build, and worth knowing as such BEFORE starting it.
 *
 * ⛔ THE SHARED-REASON COUNT IS CORPUS-WIDE, NOT SHELF-WIDE, and deliberately so: a blocker on one shelf card
 * and nine other corpus cards is a better slice than a blocker on two shelf cards and nothing else. Sizing on
 * the shelf alone is how a run ends up building single cards without noticing.
 *
 * The reason key is the card's first non-native ORACLE LINE, normalised (self-name, numbers, mana symbols) so
 * cards that differ only in those details group together. It is a grouping heuristic, not a diagnosis — read
 * the printed line before believing the bucket.
 *
 * Local-only dev tool (bundled corpus via MTG_APP_ROOT); not in CI.
 */
import fs from "node:fs";
import path from "node:path";

import { allCards, lookupCard, publicCard } from "../src/lib/server/cardIndex.js";
import { classifyCard, isNativeTier } from "../src/lib/learn/coverage.js";

const asMd = process.argv.includes("--md");
const appRoot = (process.env.MTG_APP_ROOT || "").trim() || process.cwd();
const profilesDir = path.join(appRoot, "data", "profiles");
if (!fs.existsSync(profilesDir)) {
  console.error(`No profiles dir at ${profilesDir} — set MTG_APP_ROOT to an install's app-data root.`);
  process.exit(1);
}

const normalise = (line, name) => {
  const short = String(name || "###").split(",")[0];
  return String(line)
    .replace(new RegExp(String(name || "###").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "<self>")
    .replace(new RegExp(short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "<self>")
    .replace(/\{[^}]+\}/g, "{M}")
    .replace(/\b\d+\b/g, "N")
    .toLowerCase().trim();
};

// The first line of a card that does not classify native on its own = its lead blocker.
const blockerOf = (card) => {
  const lines = String(card.oracle || "").split(/\n+/).filter(Boolean);
  for (const l of lines) if (!isNativeTier(classifyCard({ ...card, oracle: l }))) return l;
  return lines[0] || "";
};

// ── corpus-wide reason census, so each shelf blocker can be sized honestly.
const corpusReasons = new Map();
for (const raw of allCards()) {
  const c = publicCard(raw);
  if (!c.oracle || isNativeTier(classifyCard(c))) continue;
  const key = normalise(blockerOf(c), c.name);
  if (!key) continue;
  corpusReasons.set(key, (corpusReasons.get(key) || 0) + 1);
}

// ── the shelf.
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
      const line = blockerOf(c);
      blocked.push({ name: c.name, tier, line, shared: corpusReasons.get(normalise(line, c.name)) || 1 });
    }
    const pct = slots ? Math.round((native / slots) * 100) : 0;
    if (pct >= 90) continue;
    decks.push({ name: dk.name, pct, need: Math.max(0, Math.ceil(slots * 0.9) - native), blocked });
  }
}
decks.sort((a, b) => b.pct - a.pct);   // closest to the bar first — that is the build order

const out = [];
const say = (s) => out.push(s);
say(asMd ? "# Shelf gap ledger — sized, per deck, per card" : "=== SHELF GAP LEDGER (closest to the bar first) ===");
say("");
let oneCard = 0, shared = 0;
for (const d of decks) {
  say(asMd ? `## ${d.name} — ${d.pct}% (needs ${d.need})` : `--- ${d.name}  ${d.pct}%  needs ${d.need}`);
  for (const b of d.blocked.sort((x, y) => y.shared - x.shared)) {
    if (b.shared > 1) shared++; else oneCard++;
    const tag = b.shared > 1 ? `shared×${b.shared}` : "ONE-CARD";
    say(`  ${tag.padEnd(11)} ${b.name.padEnd(38)} ${b.line.slice(0, 84)}`);
  }
  say("");
}
say(asMd ? "---" : "");
say(`${decks.length} decks below the bar · ${shared} blocked cards share a blocker with other corpus cards · ${oneCard} are one-card builds`);
say("A shared blocker is a SLICE. A one-card blocker is a one-card build — size it before starting it.");
console.log(out.join("\n"));
