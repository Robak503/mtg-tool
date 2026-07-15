/**
 * lossMiner.js — "Why you lost" (Crucible dream feature, 2026-07-14). Mines a deck's LOSS games from the
 * forever-kept grind headers (gameLogStore) and surfaces the recurring pre-loss patterns, so the Academy
 * can coach off them.
 *
 * HONEST BAR (CREED): these are losses when the SIM AI pilots the deck — a proxy for how the deck loses,
 * sharpening as the model trains, NOT "how you personally lose". Every pattern is a share of REAL recorded
 * losses; a pattern is COUNTED only when its signal is definitively present (the screw/flood/commander
 * flags are null when the game couldn't tell — those are never counted as the pattern), and a cause of
 * death is claimed only when it's attributable (the LAST elimination, whose winCondition the header
 * records). Conservative by construction: the miner under-claims rather than fabricates.
 *
 * Reads only the ~100-byte-per-game headers.jsonl (kept forever, survives raw-file pruning), so it stays
 * fast and works on the whole history. schemaVersion-3 headers carry decks[]/winnerSeat/seatStats/
 * winCondition/turns; older headers without seatStats simply contribute counts but no state patterns.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { grindRoot, loadGrindManifest } from "./gameLogStore.js";

const DECISIVE = new Set(["user-wins", "ai-wins", "draw"]);
const FAST_LOSS_TURN = 8;      // eliminated by this turn = died early, not ground out
const MIN_LOSSES = 10;         // fewer than this and we don't name patterns (too few to be honest)
const MIN_PATTERN_COUNT = 3;   // and a pattern needs at least this many concrete games
const MIN_PATTERN_SHARE = 0.15; // …and this share of losses, to be worth surfacing

function deckSeatInHeader(h, deck) {
  if (!Array.isArray(h?.decks)) return null;
  const e = h.decks.find((d) => (deck.id && d?.id === deck.id) || (deck.name && d?.name === deck.name));
  return e?.seat ?? null;
}

/**
 * PURE miner. `headers` = grind header objects (schemaVersion 3+); `deck` = {id?, name?}. Returns a per-deck
 * loss-pattern summary, or null if the deck never appears / no input. Never throws.
 */
export function mineDeckLosses(headers, deck) {
  if (!deck || (!deck.id && !deck.name) || !Array.isArray(headers)) return null;
  let games = 0, wins = 0;
  const losses = [];
  for (const h of headers) {
    if (!h || !DECISIVE.has(h.result)) continue;
    const seat = deckSeatInHeader(h, deck);
    if (!seat) continue;
    games += 1;
    if (h.winnerSeat === seat) { wins += 1; continue; }
    const stats = h.seatStats?.[seat] || null;
    const mh = stats?.manaHealth || null;
    losses.push({
      screw: mh?.screw ?? null,
      flood: mh?.flood ?? null,
      commanderOnlineTurn: mh?.commanderOnlineTurn ?? null,
      ownTurns: mh?.ownTurns ?? null,
      finishRank: stats?.finishRank ?? null,
      eliminatedAtTurn: stats?.eliminatedAtTurn ?? null,
      winCondition: h.winCondition ?? null,
    });
  }
  if (games === 0) return null;
  const base = { deckId: deck.id ?? null, deckName: deck.name ?? null, games, wins, losses: losses.length, winRate: wins / games };
  if (losses.length < MIN_LOSSES) {
    const s = losses.length === 1 ? "" : "es";
    return { ...base, patterns: [], avgLossTurn: null, note: `Only ${losses.length} recorded loss${s} so far — not enough to name a pattern honestly.` };
  }
  const n = losses.length;
  const present = (pred) => losses.filter(pred).length;
  const raw = [
    { key: "mana-screw", label: "Stuck on too few lands (mana screw)", count: present((l) => l.screw === true) },
    { key: "flood", label: "Flooded — too many lands", count: present((l) => l.flood === true) },
    { key: "no-commander", label: "Commander never came down", count: present((l) => l.commanderOnlineTurn == null && l.ownTurns != null && l.ownTurns >= 3) },
    { key: "died-fast", label: `Died early — gone by turn ${FAST_LOSS_TURN}`, count: present((l) => l.eliminatedAtTurn != null && l.eliminatedAtTurn <= FAST_LOSS_TURN) },
    { key: "commander-damage", label: "Killed by commander damage", count: present((l) => l.winCondition === "commander-damage" && l.finishRank === 2) },
  ];
  const patterns = raw
    .map((p) => ({ ...p, share: p.count / n }))
    .filter((p) => p.count >= MIN_PATTERN_COUNT && p.share >= MIN_PATTERN_SHARE)
    .sort((a, b) => b.share - a.share);
  const elimTurns = losses.map((l) => l.eliminatedAtTurn).filter((t) => t != null);
  const avgLossTurn = elimTurns.length ? elimTurns.reduce((s, t) => s + t, 0) / elimTurns.length : null;
  return { ...base, patterns, avgLossTurn, note: "Losses when the sim AI pilots this deck — a proxy for how it loses, sharpening as the model trains." };
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

export const _internals = { FAST_LOSS_TURN, MIN_LOSSES, MIN_PATTERN_COUNT, MIN_PATTERN_SHARE };
