/**
 * lossMiner.js — "Why you lost" (Crucible dream feature, 2026-07-14). Mines a deck's decisive grind games
 * from the forever-kept headers (gameLogStore) and surfaces the patterns that show up MORE in its LOSSES
 * than its WINS — the honest definition of "why you lost" — so the Crucible can coach off them.
 *
 * HONEST BAR (CREED): this is the sim AI piloting the deck — a proxy for how the deck loses, sharpening as
 * the model trains, NOT "how you personally lose". A pattern is surfaced only when (1) its signal is
 * DEFINITIVELY present (screw/flood/commander/mull flags are null when the game couldn't tell — never
 * counted), (2) it clears a concrete-count + loss-share floor, and (3) it has real LIFT — it's meaningfully
 * more common in losses than wins. Raw loss-share alone LIES: a deck that mulligans aggressively mulligans
 * just as much when it WINS, so "mulliganed in 50% of losses" is a reason only if it isn't also 50% of wins.
 * We gate + rank by lift and report BOTH rates. Cause-of-death is attributed only to the seat that was LAST
 * eliminated (the header's winCondition names that elimination); earlier per-seat deaths await the forward
 * seatStats.death capture. Conservative by construction: under-claim rather than fabricate.
 *
 * Reads only the ~100-byte-per-game headers.jsonl (kept forever, survives raw-file pruning), so it stays
 * fast and works on the whole history. schemaVersion-3 headers carry decks[]/winnerSeat/seatStats/
 * winCondition/turns; older headers without seatStats simply contribute W/L counts but no state patterns.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { grindRoot, loadGrindManifest } from "./gameLogStore.js";

const DECISIVE = new Set(["user-wins", "ai-wins", "draw"]);
const FAST_LOSS_TURN = 8;      // eliminated by this turn = died early, not ground out
const MIN_LOSSES = 10;         // fewer than this and we don't name patterns (too few to be honest)
const MIN_PATTERN_COUNT = 3;   // a pattern needs at least this many concrete losing games
const MIN_LOSS_SHARE = 0.10;   // …and this share of losses, to be worth mentioning at all
const MIN_LIFT = 0.10;         // …and it must be at least this much more common in losses than wins (the real gate)
const MIN_WINS_FOR_BASELINE = 10; // fewer wins than this and the win-baseline is too noisy — fall back to share-only

function deckSeatInHeader(h, deck) {
  if (!Array.isArray(h?.decks)) return null;
  const e = h.decks.find((d) => (deck.id && d?.id === deck.id) || (deck.name && d?.name === deck.name));
  return e?.seat ?? null;
}

// The pattern catalog — one predicate over a per-game record (both wins and losses share the shape).
// A cause of death (killed-*) is attributable only to the seat LAST eliminated: the header's game-level
// winCondition records THAT elimination's cause (epochStats). A finishRank-2 SURVIVOR (someone else comboed
// off with the deck still alive) never died, so the honest gate is "died AND placed 2nd" — eliminatedAtTurn
// != null, not finishRank === 2 alone. Winners never match a killed-* pred (finishRank 1 / not eliminated),
// so those causes are structurally discriminative (winShare 0). Earlier per-seat deaths await the forward
// seatStats.death capture; until then we under-claim rather than mis-attribute.
const diedLast = (r) => r.finishRank === 2 && r.eliminatedAtTurn != null;
// Prefer the per-seat death.cause (Tier-2 forward capture — precise for ANY eliminated rank). Older headers
// carry no death field, so fall back to the game-level winCondition, which names only the LAST elimination —
// the diedLast gate keeps that fallback honest (a survivor never died to it).
const causeIs = (r, cause) => (r.death?.cause != null ? r.death.cause === cause : (diedLast(r) && r.winCondition === cause));
const PATTERN_CATALOG = [
  { key: "no-commander", label: "Commander never came down", pred: (r) => r.commanderOnlineTurn == null && r.ownTurns != null && r.ownTurns >= 3 },
  { key: "died-fast", label: `Died early — gone by turn ${FAST_LOSS_TURN}`, pred: (r) => r.eliminatedAtTurn != null && r.eliminatedAtTurn <= FAST_LOSS_TURN },
  { key: "mana-screw", label: "Stuck on too few lands (mana screw)", pred: (r) => r.screw === true },
  { key: "flood", label: "Flooded — too many lands", pred: (r) => r.flood === true },
  // Mulligan tax — kept a hand of 5 or fewer (London: finalHandSize = 7 − bottomed, so ≤5 ⇒ mulliganed twice+).
  { key: "mulligan-tax", label: "Mulliganed to 5 or fewer — started down cards", pred: (r) => r.finalHandSize != null && r.finalHandSize <= 5 },
  // Cause of death — per-seat death.cause when present (any rank), else the game winCondition@last-eliminated.
  { key: "killed-commander-damage", label: "Killed by commander damage", pred: (r) => causeIs(r, "commander-damage") },
  { key: "killed-combat", label: "Beaten down in combat", pred: (r) => causeIs(r, "combat") },
  { key: "killed-burn-drain", label: "Burned or drained out", pred: (r) => causeIs(r, "burn") || causeIs(r, "damage") },
  { key: "killed-poison", label: "Poisoned out", pred: (r) => causeIs(r, "poison") },
  { key: "killed-decking", label: "Milled out (decked)", pred: (r) => causeIs(r, "decking") },
];

// Flatten a header's seat entry into the record every predicate reads. Used for BOTH wins and losses.
function recordOf(h, stats) {
  const mh = stats?.manaHealth || null;
  return {
    screw: mh?.screw ?? null,
    flood: mh?.flood ?? null,
    commanderOnlineTurn: mh?.commanderOnlineTurn ?? null,
    ownTurns: mh?.ownTurns ?? null,
    finishRank: stats?.finishRank ?? null,
    eliminatedAtTurn: stats?.eliminatedAtTurn ?? null,
    winCondition: h.winCondition ?? null,
    finalHandSize: stats?.mull?.finalHandSize ?? null, // London: 7 − bottomed (null on a mulligan-off/legacy game)
    death: stats?.death ?? null, // Tier-2 per-seat {cause, byCombat, landsInHand}; null on pre-Tier-2 headers
  };
}

/**
 * PURE miner. `headers` = grind header objects (schemaVersion 3+); `deck` = {id?, name?}. Returns a per-deck
 * loss-pattern summary, or null if the deck never appears / no input. Never throws. Each surfaced pattern:
 * { key, label, count, lossShare, winShare|null, lift|null } — count/lossShare over losses, winShare the
 * same rate over wins, lift = lossShare − winShare (the "why you lost" signal). Ranked by lift, high first.
 */
export function mineDeckLosses(headers, deck) {
  if (!deck || (!deck.id && !deck.name) || !Array.isArray(headers)) return null;
  let games = 0;
  const wins = [], losses = [];
  for (const h of headers) {
    if (!h || !DECISIVE.has(h.result)) continue;
    const seat = deckSeatInHeader(h, deck);
    if (!seat) continue;
    games += 1;
    const rec = recordOf(h, h.seatStats?.[seat] || null);
    if (h.winnerSeat === seat) wins.push(rec); else losses.push(rec);
  }
  if (games === 0) return null;
  const base = { deckId: deck.id ?? null, deckName: deck.name ?? null, games, wins: wins.length, losses: losses.length, winRate: wins.length / games };
  if (losses.length < MIN_LOSSES) {
    const s = losses.length === 1 ? "" : "es";
    return { ...base, patterns: [], avgLossTurn: null, note: `Only ${losses.length} recorded loss${s} so far — not enough to name a pattern honestly.` };
  }

  const nLoss = losses.length, nWin = wins.length;
  const haveBaseline = nWin >= MIN_WINS_FOR_BASELINE; // too few wins → the lift baseline is noise; fall back to share-only
  const patterns = PATTERN_CATALOG
    .map(({ key, label, pred }) => {
      const count = losses.filter(pred).length;
      const lossShare = count / nLoss;
      const winShare = haveBaseline ? wins.filter(pred).length / nWin : null;
      const lift = winShare == null ? null : lossShare - winShare;
      return { key, label, count, lossShare, winShare, lift };
    })
    // Real "why you lost": enough concrete games, a meaningful slice of losses, AND more common in losses
    // than wins (lift). Without a win baseline the lift gate is waived (best-effort on a barely-played deck).
    .filter((p) => p.count >= MIN_PATTERN_COUNT && p.lossShare >= MIN_LOSS_SHARE && (p.lift == null || p.lift >= MIN_LIFT))
    .sort((a, b) => (b.lift ?? b.lossShare) - (a.lift ?? a.lossShare));

  const elimTurns = losses.map((l) => l.eliminatedAtTurn).filter((t) => t != null);
  const avgLossTurn = elimTurns.length ? elimTurns.reduce((s, t) => s + t, 0) / elimTurns.length : null;
  const note = haveBaseline
    ? "Patterns more common in this deck's losses than its wins, when the sim AI pilots it — a proxy that sharpens as the model trains."
    : "Too few wins to compare against — these are just the most common patterns in the losses so far (a weak signal).";
  return { ...base, patterns, avgLossTurn, note };
}

/** Read every forever-kept header line across all grind shards. Never throws — [] on an empty/absent store. */
export async function readAllGrindHeaders() {
  const manifest = await loadGrindManifest().catch(() => null);
  if (!manifest || !Array.isArray(manifest.shards)) return [];
  const out = [];
  for (const s of manifest.shards) {
    const file = path.join(grindRoot(), s.shard, "headers.jsonl");
    let text;
    try { text = await fs.readFile(file, "utf8"); } catch { continue; } // a shard with no header file yet
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try { out.push(JSON.parse(t)); } catch { /* skip a torn last line */ }
    }
  }
  return out;
}

/** Glue: mine one deck's losses straight from the grind store. */
export async function mineDeckLossesFromStore(deck) {
  return mineDeckLosses(await readAllGrindHeaders(), deck);
}

export const _internals = { FAST_LOSS_TURN, MIN_LOSSES, MIN_PATTERN_COUNT, MIN_LOSS_SHARE, MIN_LIFT, MIN_WINS_FOR_BASELINE };
