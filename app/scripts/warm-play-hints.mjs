/**
 * warm-play-hints.mjs — materialize the PLAY-HINTS LEDGER for every saved deck (2026-08-12, Colton's
 * order: the AI must not be blind to cards it can't route). Design: docs/orchestration/PLAY-HINTS-LEDGER.md.
 *
 *   MTG_APP_ROOT=<root> node scripts/warm-play-hints.mjs           # warm + report
 *   MTG_APP_ROOT=<root> node scripts/warm-play-hints.mjs vihaan    # report one deck's hints (still warms all)
 *
 * For every unique card across all saved decks: derive its play role (cardPlayHints.deriveCardRole —
 * pure printed-text signals, total), stamp its coverage tier, and write the ledger to
 * <APP_ROOT>/data/card-play-hints.json. The session loader threads this map into opponentAI via
 * pol.playHints, so parked cards carry a play identity instead of falling to the "else" score.
 *
 * ⭐ CURATED ENTRIES SURVIVE: an existing entry with source "curated" (hand-written) or "arbiter"
 * (LLM-enriched, a future pass) is NEVER overwritten by a derived one — derivation only fills gaps and
 * refreshes its own. Local-only (reads profile decks + the bundled oracle index); not part of CI.
 */
import fs from "node:fs";
import path from "node:path";

import { lookupCard, publicCard } from "../src/lib/server/cardIndex.js";
import { classifyCard, isNativeTier } from "../src/lib/learn/coverage.js";
import { deriveCardRole } from "../src/lib/learn/cardPlayHints.js";

const APP_ROOT = (process.env.MTG_APP_ROOT && process.env.MTG_APP_ROOT.trim())
  ? process.env.MTG_APP_ROOT.trim()
  : process.cwd();
const profilesDir = path.join(APP_ROOT, "data", "profiles");
const ledgerPath = path.join(APP_ROOT, "data", "card-play-hints.json");
const filter = (process.argv[2] || "").toLowerCase() || null;

function loadDecks() {
  const out = [];
  const seen = new Set();
  let dirs = [];
  try { dirs = fs.readdirSync(profilesDir).filter((d) => d.startsWith("prof_")); } catch { /* no profiles */ }
  for (const dir of dirs) {
    const file = path.join(profilesDir, dir, "decks.local.json");
    if (!fs.existsSync(file)) continue;
    let doc;
    try { doc = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }
    const decks = Array.isArray(doc) ? doc : (doc.decks || Object.values(doc).find(Array.isArray) || []);
    for (const dk of decks) {
      if (!dk?.name || seen.has(dk.name)) continue;
      seen.add(dk.name);
      out.push(dk);
    }
  }
  return out;
}

const decks = loadDecks();
if (!decks.length) {
  console.error(`No saved decks found under ${profilesDir}/*/decks.local.json — nothing to warm.`);
  process.exit(1);
}

// Existing ledger: curated/arbiter entries survive; derived ones refresh below.
let existing = {};
try {
  const doc = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
  existing = doc?.hints && typeof doc.hints === "object" ? doc.hints : {};
} catch { /* first warm */ }

const hints = {};
const perDeckParked = new Map();
const roleHistogram = {};
let totalCards = 0, parkedCount = 0, curatedKept = 0;

for (const dk of decks) {
  for (const entry of dk.cards || []) {
    if (entry.section === "Sideboard" || entry.section === "Tokens") continue;
    const found = lookupCard(entry.name);
    if (!found) continue; // unknown to the index → nothing derivable, and the sim can't cast it anyway
    const c = publicCard(found);
    if (hints[c.name]) {
      // already processed via another deck — still record per-deck parked rows
      if (hints[c.name].parked) {
        (perDeckParked.get(dk.name) || perDeckParked.set(dk.name, []).get(dk.name)).push(c.name);
      }
      continue;
    }
    totalCards++;
    const tier = classifyCard(c);
    const parked = !isNativeTier(tier) && tier !== "land";
    const kept = existing[c.name] && (existing[c.name].source === "curated" || existing[c.name].source === "arbiter");
    const base = kept ? existing[c.name] : { ...deriveCardRole(c), source: "derived" };
    if (kept) curatedKept++;
    hints[c.name] = { role: base.role, timing: base.timing, ...(base.note ? { note: base.note } : {}), source: base.source, tier, parked };
    roleHistogram[base.role] = (roleHistogram[base.role] || 0) + 1;
    if (parked) {
      parkedCount++;
      (perDeckParked.get(dk.name) || perDeckParked.set(dk.name, []).get(dk.name)).push(c.name);
    }
  }
}

fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
fs.writeFileSync(ledgerPath, JSON.stringify({ version: 1, generated: new Date().toISOString(), hints }, null, 2));

console.log(`=== PLAY-HINTS LEDGER warmed → ${ledgerPath} ===`);
console.log(`  ${totalCards} unique cards across ${decks.length} decks · ${parkedCount} parked (now hinted) · ${curatedKept} curated/arbiter entries preserved`);
console.log("\n  ROLES:");
for (const [r, n] of Object.entries(roleHistogram).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${r}`);
}
console.log("\n  PARKED-BUT-HINTED, per deck (the cards the AI now has a play identity for):");
for (const [name, list] of [...perDeckParked.entries()].sort((a, b) => b[1].length - a[1].length)) {
  if (filter && !name.toLowerCase().includes(filter)) continue;
  console.log(`  ${name} (${list.length}): ${list.slice(0, 8).map((n) => `${n}[${hints[n].role}]`).join(", ")}${list.length > 8 ? ", …" : ""}`);
}
