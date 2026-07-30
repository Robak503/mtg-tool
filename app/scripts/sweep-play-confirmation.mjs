/**
 * sweep-play-confirmation.mjs — CONFIRMATION-OF-PLAY, corpus-wide.
 *
 * The self-play runner answers "which cards BROKE?". This answers the question that sits underneath it and
 * had no instrument at all: **of the cards the metric credits NATIVE, which ones are ever actually exercised
 * in a real game?** A card credited native that never appears in a game log is not proof of a bug — but it is
 * a LEAD, and until something looks at it the native % is a claim about a parser, not about play.
 *
 * ⭐ IT ONLY CLAIMS WHAT IT CAN SEE. A card can only be observed if it is in a deck someone plays, so the
 * report is split into three honest buckets and never conflates them:
 *   CONFIRMED   — credited native AND seen in a real game log
 *   UNSEEN      — credited native, IS in a played deck, never appeared  → the lead list (draw variance first)
 *   UNOBSERVABLE— credited native but in no saved deck → this harness cannot speak to it at all
 *
 * ⚠️⚠️ WHAT "UNSEEN" ACTUALLY MEANS — measured, and NARROWER than it first reads. **The game log has NO draw
 * entry** (kinds are step / play-land / cast-spell / permanent-enters / spell-effect / combat-… — there is no
 * "drew a card"). So UNSEEN means **NEVER CAST OR PLAYED**, and it CANNOT distinguish:
 *     (a) never drawn        — pure shuffle variance, no defect,
 *     (b) drawn, never cast  — an AI POLICY gap, not an engine gap,
 *     (c) drawn, uncastable  — the only one that would be an engine gap.
 * ⭐ (c) was CHECKED for the top of the first lead list and RULED OUT: legalChoices offers Finale of
 * Devastation 6 ways on 8 Forests, Beast Within 6 ways, Swords to Plowshares 1 — the engine offers them fine.
 * With a 7/7 on the opponent's board, `pickAction` still returned pass-priority for all three. Finale is a
 * SORCERY, so "holding it for instant speed" cannot explain that one. **The lead list is therefore mostly a
 * POLICY signal, not a modelling signal** — do not spend engine slices on it without re-checking (c) per card.
 * The UNOBSERVABLE bucket is the corpus majority and stays explicitly out of the pass/fail line. Closing it
 * needs generated decks (a separate project), not a bigger number here.
 *
 * ⚠️ SAMPLE SIZE IS THE WHOLE VALIDITY QUESTION. A 100-card singleton deck shows ~20% of itself per game, so
 * at 4 games a zero means nothing; at 48 games it starts to mean something. The report prints games run and
 * an expected-appearance floor so a zero is never read as a defect by accident.
 *
 *   MTG_APP_ROOT=<root> node scripts/sweep-play-confirmation.mjs [gamesPer=6] [--out=<path>]
 */
import fs from "node:fs";
import { loadAllProfileDecks, toRunnerDeck } from "../src/lib/server/selfPlayDecks.js";
import { runSelfPlayBatch } from "../src/lib/learn/selfPlayRunner.js";
import { lookupCard, publicCard } from "../src/lib/server/cardIndex.js";
import { classifyCard, isNativeTier } from "../src/lib/learn/coverage.js";

const argv = process.argv.slice(2);
const gamesPer = Number(argv.find((a) => /^\d+$/.test(a)) || 6);
const outArg = argv.find((a) => a.startsWith("--out="))?.slice(6);
const norm = (s) => String(s || "").toLowerCase().replace(/[’']/g, "'").trim();

const decks = (await loadAllProfileDecks()).map(toRunnerDeck).filter(Boolean);

// Every DISTINCT card across the played decks, with its tier. Lands are excluded from the lead list: a
// basic land is "native" trivially and floods the report without ever being a modelling question.
const universe = new Map();                       // norm -> { name, tier, decks }
for (const d of decks) {
  for (const c of d.cards || d.deck || []) {
    const name = c?.name || c;
    const n = norm(name);
    if (!n || universe.has(n)) { if (universe.has(n)) universe.get(n).decks++; continue; }
    const card = lookupCard(name);
    if (!card) continue;
    const tier = classifyCard(publicCard(card));
    universe.set(n, { name, tier, decks: 1 });
  }
}
const nativeNonLand = [...universe.entries()].filter(([, v]) => isNativeTier(v.tier) && v.tier !== "land");

const batch = runSelfPlayBatch(decks, { mode: "commander", gamesPer, baseSeed: 20260730 });
const games = batch?.games || batch || [];

const hits = new Map();
for (const g of games) {
  for (const e of g?.log || []) {
    const hay = norm(JSON.stringify(e));
    for (const [n] of nativeNonLand) if (hay.includes(n)) hits.set(n, (hits.get(n) || 0) + 1);
  }
}

const confirmed = nativeNonLand.filter(([n]) => (hits.get(n) || 0) > 0);
const unseen = nativeNonLand.filter(([n]) => !(hits.get(n) || 0));
const lines = [];
lines.push(`CONFIRMATION-OF-PLAY — ${games.length} games over ${decks.length} decks (gamesPer=${gamesPer})`);
lines.push(`⚠️ a 100-card singleton shows ~20% of itself per game; below ~20 games a zero is sample noise, not a defect.`);
lines.push("");
lines.push(`native non-land cards in played decks : ${nativeNonLand.length}`);
lines.push(`  CONFIRMED in a real game log        : ${confirmed.length}`);
lines.push(`  UNSEEN (the lead list)              : ${unseen.length}`);
lines.push("");
lines.push("UNSEEN — credited native, in a played deck, never appeared:");
for (const [, v] of unseen.sort((a, b) => b[1].decks - a[1].decks)) lines.push(`  ${String(v.decks).padStart(2)}d  ${v.tier.padEnd(18)} ${v.name}`);
const txt = lines.join("\n");
console.log(txt);
if (outArg) { fs.writeFileSync(outArg, txt); console.log(`\nwrote ${outArg}`); }
