/**
 * build-triage-ledgers.mjs — PHASE 1A raw material: for each of the 15 shelf decks, one row
 * per NON-NATIVE card with everything a disposition needs: tier, mechanism bucket, ladder
 * subsystem matches (the manifest's patterns), and EDHREC rank. The DISPOSITION column
 * starts empty — the build session fills every row BUILD/INTERACTION/PARK (zero untagged).
 *
 *   MTG_APP_ROOT=<root> node scripts/build-triage-ledgers.mjs [--out=<path>]
 */

import fs from "node:fs";
import path from "node:path";
import { lookupCard, publicCard } from "../src/lib/server/cardIndex.js";
import { classifyCard, isNativeTier, mechanismBucket } from "../src/lib/learn/coverage.js";

const stripReminder = (s) => String(s || "").replace(/\([^)]*\)/g, "");

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

const INTERACTION = [
  ["wheels", /each player (discards (their|his or her) hand|shuffles (their|his or her) hand)|discards their hand, then draws/i],
  ["tutors", /search your library for (a|an|up to) (?!.*basic land)/i],
  ["counterspells", /counter target (spell|ability|activated|triggered)/i],
];
const LADDER = [
  ["level-up", /level up \{|\blevel \d|class level/i],
  ["ordeal-cycle", /whenever .{0,40}attacks, put a \+1\/\+1 counter .{0,80}then sacrifice/i],
  ["batch-combat-damage", /whenever one or more creatures? .{0,40}deal combat damage/i],
  ["transform-dfc", /\btransform(s|ed)?\b|daybound|nightbound/i],
  ["cumulative-upkeep", /cumulative upkeep/i],
  ["suspend", /\bsuspend\b|time counter/i],
  ["graft", /\bgraft\b/i],
  ["detain", /\bdetain\b/i],
  ["cascade", /\bcascade\b/i],
];

const profilesDir = path.join(process.env.MTG_APP_ROOT || ".", "data", "profiles");
const ledgers = {};
for (const prof of fs.readdirSync(profilesDir)) {
  const f = path.join(profilesDir, prof, "decks.local.json");
  if (!fs.existsSync(f)) continue;
  const { decks } = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const deck of decks || []) {
    const rows = [];
    for (const slot of deck.cards || []) {
      if (slot.section === "Tokens") continue;
      const c = lookupCard(slot.name);
      if (!c) { rows.push({ card: slot.name, tier: "NOT-IN-INDEX", mechanism: null, matches: [], rank: null, disposition: "" }); continue; }
      const pc = publicCard(c);
      let tier;
      try { tier = classifyCard(pc); } catch { tier = "error"; }
      if (isNativeTier(tier) || /\bLand\b/.test(pc.type || "")) continue;
      const text = stripReminder(pc.oracle || "");
      const isPW = /\bPlaneswalker\b/.test(pc.type || "");
      const inter = INTERACTION.filter(([, re]) => re.test(text)).map(([n]) => n);
      const ladder = LADDER.filter(([, re]) => re.test(text)).map(([n]) => n);
      if (isPW && /^\s*[+−–-]?\d*X?\s*:/m.test(text)) ladder.push("loyalty-activated");
      rows.push({
        card: slot.name,
        tier,
        mechanism: mechanismBucket(pc.oracle || ""),
        interaction: inter,
        ladder,
        rank: Number.isFinite(c.edhrec_rank) ? c.edhrec_rank : null,
        disposition: inter.length ? "INTERACTION" : "", // interaction rows pre-tagged per roadmap 1A
      });
    }
    ledgers[deck.name] = { deckId: deck.id, nonNative: rows.length, rows };
  }
}

const outPath = argv.out || "scripts/triage-ledgers.json";
fs.writeFileSync(outPath, JSON.stringify({ builtAt: new Date().toISOString(), ledgers }, null, 1));
const summary = Object.entries(ledgers).sort((a, b) => b[1].nonNative - a[1].nonNative);
console.log(`TRIAGE LEDGERS → ${outPath}`);
for (const [name, l] of summary) {
  const pre = l.rows.filter((r) => r.disposition === "INTERACTION").length;
  console.log(`  ${name.padEnd(32)} ${String(l.nonNative).padStart(3)} rows (${pre} pre-tagged INTERACTION)`);
}
