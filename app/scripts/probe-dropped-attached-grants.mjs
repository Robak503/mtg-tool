/**
 * probe-dropped-attached-grants.mjs — Auras/Equipment credited NATIVE whose printed grant never applies.
 *
 *   MTG_APP_ROOT=<root> node scripts/probe-dropped-attached-grants.mjs [--top=40]
 *
 * ⭐ THIS ASKS THE RUNTIME, NOT THE PARSER, and that distinction is the whole reason it exists. Every
 * static instrument on this board — the tier, the residue chain, even the per-card tier diff — reports
 * on what the CLASSIFIER believes. None of them can see a card that is credited native while its grant
 * is silently dropped on a real battlefield. Only building the board and reading the host's derived
 * characteristics can.
 *
 * It was written after exactly that happened twice in one hour (2026-07-28):
 *   • an attached-unblockable slice measured GAINED 4 · LOST 0 · RETIERED 0 and was still wrong —
 *     Aqueous Form went native while permanentHasKeyword(host, "unblockable") stayed FALSE;
 *   • chasing that seam turned up **Dark Privilege #11269**, a PRE-EXISTING instance with nothing to do
 *     with the change: credited `native-activated`, prints "Enchanted creature gets +1/+1", and leaves
 *     its host at 2/2.
 *
 * METHOD. For every Aura/Equipment that classifies native and prints a P/T grant on its attached
 * creature, attach it to a 2/2 on a real board and compare the host's LAYER-DERIVED power/toughness
 * against the printed bonus. A mismatch is a card the metric counts and the game doesn't play.
 *
 * SCOPE: fixed "+N/+N" grants only — the shape whose expected value is unambiguous. A dynamic grant
 * ("+1/+1 for each artifact you control") is skipped rather than guessed at; a wrong EXPECTED value
 * would manufacture false alarms, which for an FP-hunting tool is the failure that matters.
 *
 * Local-only dev tool (bundled corpus via MTG_APP_ROOT); not in CI.
 */
import { allCards, publicCard } from "../src/lib/server/cardIndex.js";
import { classifyCard, isNativeTier } from "../src/lib/learn/coverage.js";
import { permanentPower, permanentToughness } from "../src/lib/learn/layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "../src/lib/learn/gameState.js";

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const TOP = Number(argv.top) > 0 ? Number(argv.top) : 40;

/** Attach `card` to a vanilla 2/2 and return the host's live power/toughness. */
function hostPT(card) {
  _resetIdsForTests();
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const bear = createPermanent({ id: "bear", card: { id: "b", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
  const gear = createPermanent({ id: "gear", card, controller: "user" });
  gear.attachedTo = "bear";
  bear.attachments = ["gear"];
  const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [bear, gear] } } };
  return [permanentPower(s, "bear"), permanentToughness(s, "bear")];
}

const rows = [];
for (const raw of allCards()) {
  const ty = String(raw.type || raw.type_line || "");
  if (!/\b(Aura|Equipment)\b/.test(ty)) continue;
  const pc = publicCard(raw);
  const tier = classifyCard(pc);
  if (!isNativeTier(tier)) continue;                       // an already-parked card is not the question
  const oracle = String(pc.oracle || "");
  // FIXED "+N/+N" only — a dynamic grant has no unambiguous expected value, and guessing one would
  // manufacture false alarms in a tool whose entire job is finding false positives.
  const m = oracle.match(/^(?:enchanted|equipped) creature gets \+(\d+)\/\+(\d+)\.?$/im);
  if (!m) continue;
  if (/for each|as long as|where x is/i.test(oracle)) continue;
  const wantP = 2 + parseInt(m[1], 10);
  const wantT = 2 + parseInt(m[2], 10);
  const [gotP, gotT] = hostPT(pc);
  if (gotP === wantP && gotT === wantT) continue;
  rows.push({ rank: raw.edhrec_rank ?? 1e9, name: pc.name, tier, want: `${wantP}/${wantT}`, got: `${gotP}/${gotT}`, oracle: oracle.replace(/\n/g, " | ").slice(0, 130) });
}

rows.sort((a, b) => a.rank - b.rank);
console.log(`⛔ credited NATIVE but the printed grant does NOT apply: ${rows.length}\n`);
for (const r of rows.slice(0, TOP)) {
  console.log(`#${String(r.rank === 1e9 ? "-" : r.rank).padStart(6)} ${r.tier.padEnd(18)} ${r.name}   want ${r.want}, got ${r.got}`);
  console.log(`        ${r.oracle}`);
}
if (!rows.length) console.log("(none — every fixed-bonus attachment the metric credits actually applies)");
