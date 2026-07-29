#!/usr/bin/env node
/**
 * probe-shelf-blockers.mjs — the blocking-sentence view of the REAL DECK SHELF, ranked by how many DECKS a
 * blocker touches rather than how many cards.
 *
 * ⭐ WHY DECK-COUNT AND NOT CARD-COUNT. The 1.0 bar is ">=90% native PER DECK", so the shelf is won deck by
 * deck. A blocker on six cards inside one deck moves one deck; a blocker on six cards spread across six
 * decks moves six. Grinding a single deck's commanders — which is where the last two slices went — has
 * obvious diminishing returns once the cheap ones are gone. This sorts by SPREAD first.
 *
 * It is the shelf-scoped sibling of probe-top2500-blockers.mjs and inherits its hard-won corrections:
 *   • classify a synthetic single-line card with `classifyCard`, never `parseEffectClause` (which misses the
 *     legacy whole-card path and reports plain "draw a card" as a blocker);
 *   • the synthetic card carries the SOURCE CARD'S TYPE (a permanent's static wrapped as an Instant can
 *     never classify native however well modeled);
 *   • drop lines that cannot classify standing alone — the "//" face separator, "Enchant <noun>", the modal
 *     wrapper — and de-bullet modes so each is judged as the spell it is.
 *
 * ⚠️ THREE CLASSES OVER-REPORT. Treat every row as "look here", and confirm against the real card before
 * building — the rule that has caught six false veins in this run:
 *   1. bare KEYWORDS ("Flashback {5}{R}{R}") — modeled, but they cannot classify standing alone;
 *   2. EFFECT FRAGMENTS off a permanent ("Draw a card." judged as a whole Artifact is not an ability);
 *   3. ⭐ MULTI-FACE and SAGA lines. Because each line is judged carrying the SOURCE CARD'S TYPE — a rule
 *      that is load-bearing everywhere else — a back-face line like "Flying" gets judged as though it were
 *      the whole Sorcery/Saga and scores as a blocker. Seen live: "Flying" ranked in the top rows purely
 *      from double-faced cards. The type rule is right; the noise is the price on transforming cards.
 *
 * Usage:
 *   MTG_APP_ROOT=<install> node app/scripts/probe-shelf-blockers.mjs [--owner=joe] [--limit=25]
 */
import fs from "node:fs";
import path from "node:path";
import { lookupCard, publicCard } from "../src/lib/server/cardIndex.js";
import { classifyCard, isNativeTier } from "../src/lib/learn/coverage.js";

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? true];
}));
const LIMIT = parseInt(argv.limit || "25", 10);
const OWNER = (argv.owner || "").toLowerCase();

const APP_ROOT = (process.env.MTG_APP_ROOT && process.env.MTG_APP_ROOT.trim()) ? process.env.MTG_APP_ROOT.trim() : process.cwd();
const profilesDir = path.join(APP_ROOT, "data", "profiles");

const stripReminders = (s) => s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
const deBullet = (s) => s.replace(/^[•·]\s*/, "").trim();
const isStructural = (s) => /^\/\/+$/.test(s) || /^Enchant\b/i.test(s) || /^Choose (one|two|three|up to)\b/i.test(s);
const shapeOf = (s) => s.toLowerCase().replace(/\{[^}]+\}/g, "{M}").replace(/[+-]?\d+\/[+-]?\d+/g, "N/N").replace(/\b\d+\b/g, "N").replace(/\s+/g, " ").trim().slice(0, 78);

// ---- decks ------------------------------------------------------------------------------------------
const decks = [];
if (fs.existsSync(profilesDir)) {
  for (const dir of fs.readdirSync(profilesDir)) {
    const file = path.join(profilesDir, dir, "decks.local.json");
    if (!fs.existsSync(file)) continue;
    let doc;
    try { doc = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }
    const list = Array.isArray(doc) ? doc : (doc.decks || Object.values(doc).find(Array.isArray) || []);
    for (const dk of list) {
      if (!dk?.name || decks.some((d) => d.name === dk.name)) continue;
      decks.push({ name: dk.name, owner: dir, cards: dk.cards || [] });
    }
  }
}

// ---- walk parked slots ------------------------------------------------------------------------------
const shapes = new Map(); // shape -> { sample, decks:Set, cards:Set }
let deckCount = 0;
let parkedCards = 0;

for (const dk of decks) {
  if (OWNER && !String(dk.owner).toLowerCase().includes(OWNER)) continue;
  deckCount++;
  for (const entry of dk.cards) {
    if (entry.section === "Sideboard" || entry.section === "Tokens") continue;
    const found = lookupCard(entry.name);
    if (!found) continue;
    const card = publicCard(found);
    let tier;
    try {
      tier = classifyCard(card);
    } catch {
      continue;
    }
    if (isNativeTier(tier) || tier === "land") continue;
    parkedCards++;
    const seenHere = new Set();
    for (const raw of String(card.oracle || "").split(/\n+/)) {
      const line = deBullet(stripReminders(raw));
      if (!line || isStructural(line)) continue;
      let t;
      try {
        t = classifyCard({ ...card, oracle: line });
      } catch {
        continue;
      }
      if (isNativeTier(t)) continue;
      const shape = shapeOf(line);
      if (!shape || seenHere.has(shape)) continue;
      seenHere.add(shape);
      if (!shapes.has(shape)) shapes.set(shape, { sample: line, decks: new Set(), cards: new Set() });
      shapes.get(shape).decks.add(dk.name);
      shapes.get(shape).cards.add(card.name);
    }
  }
}

const ranked = [...shapes.values()].sort((a, b) => (b.decks.size - a.decks.size) || (b.cards.size - a.cards.size));

console.log(`decks scanned: ${deckCount}${OWNER ? ` (owner filter: ${OWNER})` : ""} · parked card-slots: ${parkedCards}`);
console.log(`distinct blocking shapes: ${ranked.length}\n`);
console.log(`=== RANKED BY DECKS TOUCHED (the 1.0 bar is per-deck, so SPREAD beats volume) ===\n`);

for (const e of ranked.slice(0, LIMIT)) {
  console.log(`${String(e.decks.size).padStart(3)} decks · ${String(e.cards.size).padStart(3)} cards  ${e.sample.slice(0, 86)}`);
  console.log(`        ${[...e.cards].slice(0, 4).join(" · ")}`);
}

const singles = ranked.filter((e) => e.decks.size === 1).length;
console.log(`\n${singles} shapes touch only ONE deck — the per-deck tail.`);
