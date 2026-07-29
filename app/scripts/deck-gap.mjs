/**
 * deck-gap.mjs — the per-CARD gap list for a saved deck. The shelf target's working instrument.
 *
 *   MTG_APP_ROOT=<root> node scripts/deck-gap.mjs <deck-name-substring>
 *
 * WHY THIS EXISTS. `measure-coverage` answers "how far is this deck from the 90% bar" — a percentage and a
 * mechanism histogram. It does not answer the only question that leads to a build: WHICH CARDS, and what is
 * each one actually blocked on. Every shelf session was re-deriving that by hand from the histogram's
 * three-card `e.g.` samples, which name the biggest buckets rather than the deck in front of you.
 *
 * Prints every non-native, non-land slot with its tier and mechanism bucket, sorted so same-blocker cards
 * sit together — that adjacency is the point, because two cards on one clause is what makes a slice worth
 * building. Reads the same profiles/decks.local.json + classifyCard path measure-coverage does, so the two
 * cannot disagree about what "native" means.
 *
 * Local-only dev tool (bundled corpus via MTG_APP_ROOT); not in CI.
 */
import fs from "node:fs";
import path from "node:path";

import { lookupCard, publicCard } from "../src/lib/server/cardIndex.js";
import { classifyCard, isNativeTier, mechanismBucket } from "../src/lib/learn/coverage.js";

const want = (process.argv[2] || "").toLowerCase();
const appRoot = (process.env.MTG_APP_ROOT || "").trim() || process.cwd();
const profilesDir = path.join(appRoot, "data", "profiles");
if (!fs.existsSync(profilesDir)) {
  console.error(`No profiles dir at ${profilesDir} — set MTG_APP_ROOT to an install's app-data root.`);
  process.exit(1);
}

const seen = new Set();
let matched = 0;
for (const prof of fs.readdirSync(profilesDir)) {
  const file = path.join(profilesDir, prof, "decks.local.json");
  if (!fs.existsSync(file)) continue;
  let doc;
  try { doc = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }
  const decks = Array.isArray(doc) ? doc : (doc.decks || Object.values(doc).find(Array.isArray) || []);
  for (const dk of decks) {
    if (!dk?.name || seen.has(dk.name)) continue;          // dedupe decks shared across profiles
    if (want && !dk.name.toLowerCase().includes(want)) continue;
    seen.add(dk.name);
    matched++;
    const rows = [];
    let slots = 0;
    let missing = 0;
    for (const entry of dk.cards || []) {
      if (entry.section === "Sideboard" || entry.section === "Tokens") continue;
      // QTY-WEIGHTED, matching measure-coverage's denominator exactly. Counting distinct ENTRIES instead
      // reports a different percentage for any deck running a duplicate (basics aside) — and a tool whose
      // headline disagrees with the shelf number it is meant to explain is worse than no tool.
      const qty = entry.qty || 1;
      slots += qty;
      const found = lookupCard(entry.name);
      if (!found) { rows.push(["NOT-IN-INDEX", "", entry.name, qty]); missing += qty; continue; }
      const pc = publicCard(found);
      const tier = classifyCard(pc);
      if (isNativeTier(tier) || tier === "land") continue;
      missing += qty;
      rows.push([tier, mechanismBucket(pc, tier) || "", pc.name, qty]);
    }
    // Sort by bucket then tier so cards sharing a blocker are adjacent — the whole point of the listing.
    rows.sort((a, b) => (a[1] + a[0] + a[2]).localeCompare(b[1] + b[0] + b[2]));
    // `missing`, not rows.length: a deck running two copies of an unmodeled card is TWO slots off the bar
    // but ONE row. They coincide only when no unmodeled card is duplicated, which is most decks — which is
    // exactly why getting it wrong would have gone unnoticed.
    const pct = slots ? Math.round(((slots - missing) / slots) * 100) : 0;
    console.log(`\n=== ${dk.name}  —  ${pct}% native (${slots - missing}/${slots})`);
    for (const [tier, bucket, name, qty] of rows) console.log(`  ${tier.padEnd(13)} ${bucket.padEnd(24)} ${name}${qty > 1 ? ` x${qty}` : ""}`);
    console.log(`  --- ${missing} unmodeled slots (${rows.length} distinct)`);
  }
}
if (!matched) console.log(want ? `No saved decks match "${want}".` : `No saved decks under ${profilesDir}/*/decks.local.json.`);
