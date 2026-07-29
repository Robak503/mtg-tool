#!/usr/bin/env node
/**
 * probe-shelf-one-line-away.mjs — SHELF cards that are ONE ORACLE LINE from native, ranked by decks touched.
 *
 * ⭐ WHY THIS AND NOT probe-shelf-blockers. That one ranks blocking SENTENCES by spread, which repeatedly
 * surfaced rows that were worth ~1 card because the sentence was not the card's ONLY blocker (Teamwork
 * ranked #1 at 3 cards / 3 decks and was worth one; the "another target creature" bite row was worth zero on
 * the shelf). This asks the sharper question directly: **drop exactly one line — does the card go native?**
 * If yes, that line IS the whole blocker, and the row is a real build target rather than a lead.
 *
 * Output is ranked by DECKS touched, because the 1.0 bar is >=90% PER DECK: a blocker on one card in three
 * decks moves three decks.
 *
 * ⚠️ READ BEFORE BUILDING — a row is a SIZED target, not a promise:
 *   1. "One line away" measures the CLASSIFIER, not the effort. Level Up sits at the top of this list and is
 *      a four-piece build; the single line hides a granted trigger, a compound and a self-power threshold.
 *   2. Some rows are DELIBERATE REFUSALS and must stay parked — Hexing Squelcher's "Ward—Pay 2 life" is the
 *      life-cost ward the layer op cannot represent. Check the ledger's REFUSED list before starting.
 *   3. Dropping a line changes semantics. The probe proves the line is the blocker; it does NOT prove the
 *      line can be modelled CREED-safely. That judgement is still per-card.
 *
 * Scope: cards with 2..4 oracle lines (a 1-line card has nothing to drop; a 5+ line card is a wave, not a
 * slice) that currently classify non-native and non-land.
 *
 * Local-only (needs the installed profiles AND the oracle index); not in CI.
 *
 * Usage:
 *   MTG_APP_ROOT="C:/Users/colto/AppData/Roaming/com.colton.mtg-tool" node app/scripts/probe-shelf-one-line-away.mjs [--limit=25]
 *
 * ⚠️ THE APPDATA ROOT IS REQUIRED. Pointing MTG_APP_ROOT at the repo's app/ reads ZERO decks and prints an
 * empty, entirely convincing table (banked 2026-07-28 after it cost a run).
 */
import fs from "node:fs";
import path from "node:path";
import { lookupCard } from "../src/lib/server/cardIndex.js";
import "../src/lib/learn/coverage.js";
import { classifyCard } from "../src/lib/learn/coverage.js";

const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) || "").split("=")[1]) || 25;
const root = process.env.MTG_APP_ROOT;
const profilesDir = path.join(root || "", "data", "profiles");
if (!fs.existsSync(profilesDir)) {
  console.error(`No profiles at ${profilesDir} — point MTG_APP_ROOT at the INSTALLED app (see usage).`);
  process.exit(1);
}

// name -> set of deck names
const shelf = new Map();
for (const prof of fs.readdirSync(profilesDir)) {
  const f = path.join(profilesDir, prof, "decks.local.json");
  if (!fs.existsSync(f)) continue;
  for (const d of JSON.parse(fs.readFileSync(f, "utf8")).decks || []) {
    for (const e of d.cards || []) {
      if (!shelf.has(e.name)) shelf.set(e.name, new Set());
      shelf.get(e.name).add(d.name);
    }
  }
}
if (!shelf.size) {
  console.error("ZERO deck cards read — refusing to print a clean-looking empty result.");
  process.exit(1);
}

const rows = [];
for (const [name, decks] of shelf) {
  const c = lookupCard(name);
  if (!c) continue;
  const oracle = c.oracle_text || "";
  const lines = oracle.split("\n");
  if (lines.length < 2 || lines.length > 4) continue;
  const base = { name: c.name, type: c.type_line, mana: c.mana_cost, oracle };
  const tier = classifyCard(base);
  if (tier.startsWith("native") || tier === "land") continue;
  for (let i = 0; i < lines.length; i++) {
    const probe = lines.filter((_, j) => j !== i).join("\n");
    if (classifyCard({ ...base, oracle: probe }).startsWith("native")) {
      rows.push({ name, decks: [...decks], blocker: lines[i].trim(), tier });
      break;
    }
  }
}

rows.sort((a, b) => b.decks.length - a.decks.length || a.name.localeCompare(b.name));
console.log(`shelf cards ONE LINE from native: ${rows.length} (showing ${Math.min(LIMIT, rows.length)})\n`);
for (const r of rows.slice(0, LIMIT)) {
  console.log(`${String(r.decks.length).padStart(2)} deck(s) · ${r.name}  [${r.tier}]`);
  console.log(`            ${r.decks.join(" · ")}`);
  console.log(`   BLOCKER: ${r.blocker.slice(0, 110)}`);
}
const tail = rows.length - LIMIT;
if (tail > 0) console.log(`\n(+${tail} more single-deck rows — the long tail this shelf has had all run)`);
