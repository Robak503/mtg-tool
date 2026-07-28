/**
 * probe-residue-artifacts.mjs — cards whose every ABILITY is individually understood, that park anyway.
 *
 *   MTG_APP_ROOT=<root> node scripts/probe-residue-artifacts.mjs [--maxRank=5000] [--top=40]
 *
 * WHY. The residue-chain wave (2026-07-28) found ~50 cards parked not because anything was unmodeled but
 * because the chain's trigger strip guessed wrong about where a trigger ended, and its leftovers read as
 * unmodeled text. The lesson it left: **a residue check that parks a card for the WRONG reason looks
 * exactly like one that parks it for the right reason.** There is no way to tell from the tier.
 *
 * So ask the sub-gates directly instead. For every parked card:
 *   • does EVERY detected trigger route natively?
 *   • is EVERY parsed activated ability modeled?
 * When both hold and the card still parks, nothing it does is unknown — what stops it is a STATIC clause
 * or an artifact of the residue chain. Those are the candidates, and the leftover text is printed so the
 * two can be told apart by eye.
 *
 * ⚠️ THIS IS A LEAD LIST, NOT A BUG LIST. A card here may legitimately park on a genuinely unmodeled
 * STATIC — that is the honest majority. The find is the OTHER kind: leftovers that are visibly part of an
 * ability the engine already understands. Read the residue column; don't count the rows.
 *
 * Local-only dev tool (bundled corpus via MTG_APP_ROOT); not in CI.
 */
import { allCards, publicCard } from "../src/lib/server/cardIndex.js";
import { classifyCard, isNativeTier } from "../src/lib/learn/coverage.js";
import { detectTriggers, stripTriggerAbilityLabel } from "../src/lib/learn/triggers.js";
import { triggerRoutesNatively } from "../src/lib/learn/triggerRouting.js";
import { parseActivatedAbilities } from "../src/lib/learn/effects/abilities.js";

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const MAX_RANK = Number(argv.maxRank) > 0 ? Number(argv.maxRank) : 5000;
const TOP = Number(argv.top) > 0 ? Number(argv.top) : 40;

function isRealCard(c) {
  const t = c.type || c.type_line || "";
  if (!t) return false;
  return !/\b(Token|Emblem|Scheme|Plane|Phenomenon|Vanguard|Dungeon|Conspiracy|Sticker|Attraction|Card)\b/.test(t);
}

const rows = [];
for (const raw of allCards()) {
  if (!isRealCard(raw)) continue;
  const rank = raw.edhrec_rank;
  if (!Number.isFinite(rank) || rank > MAX_RANK) continue;
  const pc = publicCard(raw);
  const tier = classifyCard(pc);
  if (isNativeTier(tier)) continue;                       // includes `land`, credited by type — not ours

  const trigs = detectTriggers(pc);
  const acts = parseActivatedAbilities(pc);
  if (trigs.length + acts.length === 0) continue;         // a pure-static park is a different question
  if (!trigs.every(triggerRoutesNatively)) continue;      // a real unmodeled trigger — correctly parked
  if (!acts.every((a) => a.modeled)) continue;            // a real unmodeled activated ability — correctly parked
  // ⚠️ AND EVERY TRIGGER-SHAPED SENTENCE MUST HAVE BEEN DETECTED. Without this the probe's first run
  // reported Archaeomancer's Map as a candidate: its ETB routes fine, but its SECOND trigger ("Whenever a
  // land an opponent controls enters, if that player controls more lands than you…") isn't detected at
  // all, so `trigs.every(routes)` passed vacuously on the one that was. An UNDETECTED trigger is the most
  // dangerous thing to overlook here — it is invisible to every per-descriptor check.
  const shaped = (stripTriggerAbilityLabel(String(pc.oracle || "")).replace(/\([^)]*\)/g, " ")
    .match(/(?:^|[\n.;]\s*)(?:When|Whenever|At)\b/gi) || []).length;
  if (shaped > trigs.length) continue;                    // a trigger sentence nobody detected — correctly parked

  // What's left once every UNDERSTOOD ability is removed. If this reads like part of one of them, the
  // residue chain is the problem; if it reads like a separate static, the card is honestly parked.
  const leftover = stripTriggerAbilityLabel(String(pc.oracle || ""))
    .replace(/\([^)]*\)/g, " ")
    .replace(/(?:^|[\n.;]\s*)(When|Whenever|At)\b[^.]+\./gi, "\n")
    .split("\n").map((l) => l.trim())
    .filter((l) => l && !acts.some((a) => l.startsWith(String(a.raw || "").trim().slice(0, 24))))
    .join(" | ")
    .replace(/\s+/g, " ")
    .slice(0, 150);
  rows.push({ rank, name: pc.name, tier, nt: trigs.length, na: acts.length, leftover });
}

rows.sort((a, b) => a.rank - b.rank);
console.log(`parked cards (rank<=${MAX_RANK}) whose every ability is individually understood: ${rows.length}\n`);
for (const r of rows.slice(0, TOP)) {
  console.log(`#${String(r.rank).padStart(5)} ${r.tier.padEnd(14)} trig=${r.nt} act=${r.na}  ${r.name}`);
  console.log(`        leftover: ${r.leftover || "(none — the chain itself is what parks it)"}`);
}
