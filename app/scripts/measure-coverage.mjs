/**
 * measure-coverage.mjs — dev dashboard for the Academy engine's native coverage.
 *
 *   npm run coverage            # CORPUS-wide native % (the primary headline) + every saved deck
 *   npm run coverage -- <name>  # only decks whose name includes <name> (skips the corpus pass)
 *   npm run coverage -- --played=1000
 *                               # the PLAY-WEIGHTED WORKLIST: the top-N most-played cards (edhrec_rank) that are not
 *                               # covered, in rank order, each with the lines that alone hold it back (the
 *                               # play-weighted program, Colton 2026-10-01: top 1,000 to 90%, then top 2,500, then reassess)
 *
 * Enriches each card via the engine's own card index, classifies it with the
 * shared `coverage.js` module (the SAME logic the runtime uses to decide
 * native-vs-Arbiter), and prints:
 *   1. CORPUS-WIDE native % over all ~33k real cards — the project's north-star
 *      metric (the goal is to play almost ALL of Magic natively, not just the
 *      sample decks; the Arbiter is the permanent home for the irreducible tail).
 *   2. Per-deck + aggregate native % on the saved decks — the realism gate ("does
 *      a real game actually play"), plus the gap bucketed by mechanism.
 * Local-only: reads profile decks + the bundled oracle index, so it isn't part of CI.
 */
import fs from "node:fs";
import path from "node:path";
import { lookupCard, publicCard, allCards } from "../src/lib/server/cardIndex.js";
import { coverageSummary, classifyCard, isNativeTier, mechanismBucket, ALL_TIERS } from "../src/lib/learn/coverage.js";

const args = process.argv.slice(2);
const filter = (args.find((a) => !a.startsWith("--")) || "").toLowerCase();
const playedArg = args.find((a) => a.startsWith("--played"));
const playedTop = playedArg ? Number(playedArg.split("=")[1]) : null;
if (playedArg && !(Number.isInteger(playedTop) && playedTop > 0)) throw new Error(`--played needs a positive count (got "${playedArg}")`);
// Mirrors the MTG_APP_ROOT-with-cwd-fallback convention every sync script uses (sync-edhrec-salt.cjs,
// sync-scryfall-bulk.cjs, ...): allCards()/lookupCard() below already resolve through cardIndex.js,
// which DOES respect MTG_APP_ROOT, so the corpus-wide pass worked regardless — but this bare
// path.join("data", "profiles") silently only found decks when CWD itself had a data/profiles/
// dir, which is true for the dev tree but not a worktree pointed at a real install's AppData. Found
// live 2026-07-23: real saved decks existed at MTG_APP_ROOT/data/profiles/*/decks.local.json and the
// per-deck pass reported "No saved decks found" anyway.
const APP_ROOT = (process.env.MTG_APP_ROOT && process.env.MTG_APP_ROOT.trim())
  ? process.env.MTG_APP_ROOT.trim()
  : process.cwd();
const profilesDir = path.join(APP_ROOT, "data", "profiles");

// A "real" playable card for the corpus denominator — excludes tokens, emblems,
// and the various non-deck supplemental card types that aren't part of normal play.
function isRealCard(c) {
  const t = c.type || "";
  if (!t) return false;
  return !/\b(Token|Emblem|Scheme|Plane|Phenomenon|Vanguard|Dungeon|Conspiracy|Sticker|Attraction|Card)\b/.test(t);
}

// PLAY-COVERED — the play-weighted blocks' one definition: a native tier, or a plain land (lands run trivially).
const playCovered = (t) => isNativeTier(t) || t === "land";

// ---- CORPUS-WIDE native coverage: the PRIMARY headline (skipped when a deck filter is given) ----
function reportCorpus() {
  const tier = {};
  const gap = {};
  const gapExamples = {};
  let total = 0;
  let native = 0;
  const ranked = []; // PLAY-WEIGHTED: {rank, covered} per card carrying an edhrec_rank (Commander popularity)
  for (const raw of allCards()) {
    let c;
    try { c = publicCard(raw); } catch { continue; }
    if (!isRealCard(c)) continue;
    total++;
    const t = classifyCard(c);
    tier[t] = (tier[t] || 0) + 1;
    if (isNativeTier(t)) native++;
    else {
      const b = mechanismBucket(c.oracle);
      gap[b] = (gap[b] || 0) + 1;
      (gapExamples[b] = gapExamples[b] || new Set()).add(c.name);
    }
    if (Number.isInteger(raw.edhrec_rank)) ranked.push({ rank: raw.edhrec_rank, covered: playCovered(t) });
  }
  const pct = total ? Math.round((native / total) * 1000) / 10 : 0;
  console.log("=== CORPUS-WIDE NATIVE COVERAGE (the north-star metric) ===");
  console.log(`  CORPUS: ${pct}% native  (${native}/${total} real cards in the active index)`);
  console.log("\n  TIER BREAKDOWN (corpus):");
  for (const k of ALL_TIERS) {
    if (tier[k]) console.log(`  ${String(tier[k]).padStart(6)}  ${k}`);
  }
  console.log("\n  CORPUS GAP: unmodeled cards by mechanism (the corpus-primary roadmap signal)");
  for (const [b, n] of Object.entries(gap).sort((a, c) => c[1] - a[1])) {
    console.log(`  ${String(n).padStart(6)}  ${b}\n            e.g. ${[...(gapExamples[b] || [])].slice(0, 5).join(", ")}`);
  }
  console.log("");

  // PLAY-WEIGHTED COVERAGE — "do the cards people actually PLAY work?" The flat corpus % treats a
  // never-played junk card the same as Sol Ring; this weights by real Commander play (edhrec_rank,
  // lower = more played). "playable" = native OR land (lands run trivially). This is the number that
  // tracks whether real decks function — the practical finish line for a usable tool.
  ranked.sort((a, b) => a.rank - b.rank);
  console.log("=== PLAY-WEIGHTED COVERAGE (top-N most-played by edhrec_rank — the real-deck signal) ===");
  for (const n of [1000, 2500, 5000, 10000]) {
    const band = ranked.slice(0, n);
    const cov = band.filter((x) => x.covered).length;
    const p = band.length ? Math.round((cov / band.length) * 1000) / 10 : 0;
    console.log(`  top ${String(n).padStart(5)} played: ${String(p).padStart(4)}% playable  (${cov}/${band.length})`);
  }
  console.log("");
}

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
      if (!dk?.name || seen.has(dk.name)) continue; // dedupe shared decks across profiles
      if (filter && !dk.name.toLowerCase().includes(filter)) continue;
      seen.add(dk.name);
      out.push(dk);
    }
  }
  return out;
}

function enrich(dk) {
  const cards = [];
  for (const entry of dk.cards || []) {
    if (entry.section === "Sideboard" || entry.section === "Tokens") continue;
    const found = lookupCard(entry.name);
    if (!found) { cards.push({ type: "", oracle: "", mana: "", name: entry.name, qty: entry.qty || 1, _unknown: true }); continue; }
    const c = publicCard(found);
    // `loyalty` MUST ride along (2026-08-15): planeswalkerPlayable/-NativelyCovered read
    // startingLoyalty(card), and the slim shape silently dropped it — every walker in the DECK
    // measure classified arbiter-pw regardless of its real tier (caught when Sarkhan, Fireblood
    // went native in the tier snapshot but not here). power/toughness ride for the same
    // shape-fidelity reason.
    // V1 (2026-09-04): `keywords` and `layout` ride along — the classifier's modal-DFC gate reads `layout` (a projection
    // that dropped it made this instrument disagree with deck-gap.mjs on the very same deck: 70% vs 73% on Kellan).
    cards.push({ type: c.type, oracle: c.oracle, mana: c.mana, name: c.name, loyalty: c.loyalty, power: c.power, toughness: c.toughness, keywords: c.keywords, layout: c.layout, qty: entry.qty || 1 });
  }
  return cards;
}

// ---- PLAY-WEIGHTED WORKLIST (--played=N): the top-N most-played cards that are NOT covered, in rank order ----
// The same card set and the same covered test as the play-weighted block above (isRealCard, an edhrec_rank, playCovered),
// so its header always equals that block's line for N. Each uncovered card gets a sole-blocker probe — re-classify with each
// oracle line removed; a line whose removal makes the card covered holds it back alone — and the lines are printed as
// written. A one-line card prints its line as the blocker; a card no single deletion covers prints "multi-line" with its
// oracle. Rank order IS the program's selection rule.
function reportPlayedWorklist(top) {
  const ranked = [];
  for (const raw of allCards()) {
    if (!Number.isInteger(raw.edhrec_rank)) continue;
    let c;
    try { c = publicCard(raw); } catch { continue; }
    if (!isRealCard(c)) continue;
    ranked.push({ rank: raw.edhrec_rank, card: c });
  }
  ranked.sort((a, b) => a.rank - b.rank);
  const band = ranked.slice(0, top);
  const misses = [];
  for (const { rank, card } of band) {
    const t = classifyCard(card);
    if (playCovered(t)) continue;
    const lines = String(card.oracle || "").split("\n").filter((l) => l.trim());
    const sole = lines.filter((_, i) => playCovered(classifyCard({ ...card, oracle: lines.filter((__, j) => j !== i).join("\n") })));
    misses.push({ rank, name: card.name, type: card.type, tier: t, sole, lines });
  }
  const covered = band.length - misses.length;
  const pct = band.length ? Math.round((covered / band.length) * 1000) / 10 : 0;
  console.log(`=== PLAY-WEIGHTED WORKLIST — top ${top} most-played (edhrec_rank), uncovered in rank order ===`);
  console.log(`  covered ${covered}/${band.length} (${pct}%) · to 90%: +${Math.max(0, Math.ceil(band.length * 0.9) - covered)}`);
  for (const m of misses) {
    console.log(`  #${String(m.rank).padEnd(6)} ${m.name} [${m.tier}] ${String(m.type).split(" // ")[0]}`);
    if (m.sole.length) for (const l of m.sole) console.log(`           sole: ${l}`);
    else if (m.lines.length === 1) console.log(`           blocker: ${m.lines[0]}`); // a one-line card: the line is the whole blocker
    else console.log(`           multi-line: ${m.lines.join(" / ").slice(0, 300)}`);
  }
}

if (playedTop) {
  reportPlayedWorklist(playedTop);
  process.exit(0);
}

// Corpus headline first (the north star). A deck filter narrows to specific decks, so skip it.
if (!filter) reportCorpus();

const decks = loadDecks();
if (decks.length === 0) {
  console.log(filter ? `No saved decks match "${filter}".` : `No saved decks found under ${profilesDir}/*/decks.local.json.`);
  process.exit(0);
}

const perDeck = [];
const tierTotals = {};
const gapTotals = {};
const gapExamples = {};
const unknown = new Set();

for (const dk of decks) {
  const cards = enrich(dk);
  const s = coverageSummary(cards.filter((c) => !c._unknown));
  // Fold unknowns + per-card gap examples in for the dashboard view.
  for (const c of cards) {
    if (c._unknown) { unknown.add(c.name); continue; }
    const tier = classifyCard(c);
    tierTotals[tier] = (tierTotals[tier] || 0) + (c.qty || 1);
    if (!isNativeTier(tier)) {
      const b = mechanismBucket(c.oracle);
      gapTotals[b] = (gapTotals[b] || 0) + (c.qty || 1);
      (gapExamples[b] = gapExamples[b] || new Set()).add(c.name);
    }
  }
  perDeck.push({ name: dk.name, total: s.total, native: s.native, pct: s.pct });
}

console.log("=== PER-DECK NATIVE COVERAGE (the realism gate — does a real game play?) ===");
for (const d of perDeck.sort((a, b) => b.pct - a.pct)) {
  console.log(`  ${String(d.pct).padStart(3)}%  ${d.name}  (${d.native}/${d.total})`);
}
const grand = perDeck.reduce((a, d) => ({ n: a.n + d.native, t: a.t + d.total }), { n: 0, t: 0 });
console.log(`\n  AGGREGATE: ${grand.t ? Math.round((grand.n / grand.t) * 100) : 0}% native  (${grand.n}/${grand.t} slots across ${decks.length} decks)`);

// ── OWNER SPLIT (Omnath's call, 2026-07-28) ─────────────────────────────────────────────────────────────
// The single aggregate AVERAGES TWO DIFFERENT QUESTIONS and hides which one is failing:
//   the OWNER's decks gate PLAYABILITY  — can the one actual user play his own decks against the engine?
//   the POD's decks gate POD REALISM    — can he sim his real playgroup in the Crucible?
// Both are real bars and neither is the other, so one number reading "79%" can mean "one deck from done" or
// "ten decks out" and you cannot tell which. Same honest-label rule the UI follows, applied to the metric.
//
// OWNERSHIP IS NOT DERIVABLE FROM THE DATA — verified: every deck lives in ONE profile on this box, so
// profile structure says nothing. Rather than hard-code deck names into the repo, the split reads an
// OPTIONAL config file and stays silent when it is absent (output byte-identical to before). Create
// `<MTG_APP_ROOT>/data/deck-owners.json` as { "Deck Name": "owner-label", … } to switch it on.
//
// A deck the file does not mention is reported under "(unassigned)" rather than dropped — a silently
// shrinking denominator is exactly how a split metric starts lying.
const ownersFile = path.join(APP_ROOT, "data", "deck-owners.json");
let owners = null;
try { owners = JSON.parse(fs.readFileSync(ownersFile, "utf8")); } catch { /* absent → single aggregate only */ }
if (owners && typeof owners === "object") {
  const buckets = new Map();
  for (const d of perDeck) {
    const who = owners[d.name] || "(unassigned)";
    const b = buckets.get(who) || { n: 0, t: 0, decks: 0, below: [] };
    b.n += d.native; b.t += d.total; b.decks += 1;
    if (d.pct < 90) b.below.push(`${d.name} ${d.pct}%`);
    buckets.set(who, b);
  }
  console.log(`\n=== SHELF BY OWNER (the 1.0 bar is >=90% PER DECK, so the tail is what matters) ===`);
  for (const [who, b] of [...buckets.entries()].sort((a, b2) => b2[1].t - a[1].t)) {
    const pct = b.t ? Math.round((b.n / b.t) * 100) : 0;
    console.log(`  ${String(pct).padStart(3)}%  ${who}  (${b.n}/${b.t} across ${b.decks} decks)`);
    console.log(`         below the bar: ${b.below.length ? b.below.join(" · ") : "none — every deck is at 90%+"}`);
  }
}

console.log("\n=== TIER BREAKDOWN (deck card-slots) ===");
for (const k of ALL_TIERS) {
  if (tierTotals[k]) console.log(`  ${String(tierTotals[k]).padStart(4)}  ${k}`);
}

console.log("\n=== THE GAP: unmodeled deck slots by MECHANISM (the roadmap) ===");
for (const [b, n] of Object.entries(gapTotals).sort((a, c) => c[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${b}\n          e.g. ${[...(gapExamples[b] || [])].slice(0, 6).join(", ")}`);
}
if (unknown.size) console.log(`\n  unknown (not in index): ${[...unknown].slice(0, 12).join(", ")}${unknown.size > 12 ? " …" : ""}`);
