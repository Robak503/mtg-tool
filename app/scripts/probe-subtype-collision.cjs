const fs = require("fs");
const cards = JSON.parse(fs.readFileSync(process.env.APPDATA + "/com.colton.mtg-tool/data/scryfall-bulk/oracle_cards.json", "utf8"));
const DASH = String.fromCharCode(8212); // em dash, U+2014

// SANITY GATE: a known type line must split, and a known subtype must be found on the subtype side.
const probe = cards.find((c) => c.name === "Courageous Outrider");
const parts = String(probe.type_line).split(DASH);
if (parts.length !== 2 || !/\bHuman\b/i.test(parts[1])) {
  console.error("SANITY GATE FAILED — the split or the word-boundary match is broken:", JSON.stringify(parts));
  process.exit(1);
}
console.log("sanity gate OK:", JSON.stringify(parts));

// Candidates from the command line (`node scripts/probe-subtype-collision.cjs hero spacecraft`), else the TF-1 list.
const CANDIDATES = process.argv.slice(2).length ? process.argv.slice(2).map((w) => w.toLowerCase())
  : ["human", "soldier", "zombie", "angel", "beast", "spirit", "warrior", "knight",
    "cleric", "rogue", "druid", "shaman", "pirate", "dwarf", "cat", "bird", "snake", "giant"];
console.log("\nCOLLISION CHECK — the word must appear ONLY on the subtype side of the em dash:");
for (const w of CANDIDATES) {
  const re = new RegExp("\\b" + w + "\\b", "i");
  let left = 0, right = 0, noDash = 0;
  const leftEx = [];
  for (const c of cards) {
    const tl = String(c.type_line || "");
    if (/^Token\b/.test(tl)) continue;
    const p = tl.split(DASH);
    if (p.length < 2) { if (re.test(tl)) { noDash++; if (leftEx.length < 2) leftEx.push(c.name + " [" + tl + "]"); } continue; }
    if (re.test(p[0])) { left++; if (leftEx.length < 2) leftEx.push(c.name + " [" + tl + "]"); }
    if (re.test(p[1])) right++;
  }
  const bad = left + noDash;
  console.log("  " + w.padEnd(9) + "subtype-side=" + String(right).padStart(5)
    + "  collisions=" + String(bad).padStart(3) + "  " + (bad === 0 ? "SAFE" : "COLLIDES: " + leftEx.join(" | ")));
}
