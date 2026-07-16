/**
 * lossMiner.js — the per-deck dossier miner behind "The Reflecting Pool" (Crucible dream feature,
 * 2026-07-14/15). Mines a deck's decisive grind games from the forever-kept headers (gameLogStore) and
 * surfaces BOTH sides of the mirror: the patterns that show up MORE in its LOSSES than its wins ("why you
 * lost") and the patterns that show up MORE in its WINS than its losses ("why you win" — the R1 negative-
 * lift insight: a winning line is just a loss pattern with the sign flipped). Plus the dossier facts row
 * (avg win turn, win-con mix, commander-online rate, typical game length) so the Pool can show a deck's
 * whole record at a glance.
 *
 * HONEST BAR (CREED): this is the sim AI piloting the deck — a proxy for how the deck wins/loses,
 * sharpening as the model trains, NOT "how you personally play". A pattern is surfaced only when (1) its
 * signal is DEFINITIVELY present (screw/flood/commander/mull flags are null when the game couldn't tell —
 * never counted), (2) it clears a concrete-count + share floor, and (3) it has real LIFT — it's meaningfully
 * more common on its side than the other. Raw share alone LIES: a deck that mulligans aggressively mulligans
 * just as much when it WINS, so "mulliganed in 50% of losses" is a reason only if it isn't also 50% of wins.
 * We gate + rank by lift and report BOTH rates. Cause-of-death is attributed only when the header can name
 * it (per-seat death.cause, else the LAST-eliminated seat's winCondition). Win-con "patterns" describe how
 * the winning GAME ended (the last elimination's cause) — the header never records who dealt it, so the copy
 * never claims the kill. Conservative by construction: under-claim rather than fabricate.
 *
 * Reads only the ~100-byte-per-game headers.jsonl (kept forever, survives raw-file pruning), so it stays
 * fast and works on the whole history. schemaVersion-3 headers carry decks[]/winnerSeat/seatStats/
 * winCondition/turns; older headers without seatStats simply contribute W/L counts but no state patterns.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { grindRoot, loadGrindManifest } from "./gameLogStore.js";

const DECISIVE = new Set(["user-wins", "ai-wins", "draw"]);
const FAST_LOSS_TURN = 8;      // eliminated by this global turn = died early, not ground out
const FAST_WIN_TURN = 32;      // game over by this global turn with this deck on top = a fast close (p10 of real win turns, 24k-game probe 2026-07-15 — quiet unless a deck genuinely races)
const EARLY_COMMANDER_TURN = 4; // commander cast by the seat's OWN turn 4 = online early
const MIN_LOSSES = 10;         // fewer than this and we don't name loss patterns (too few to be honest)
const MIN_WINS = 10;           // …same floor for naming win patterns
const MIN_PATTERN_COUNT = 3;   // a pattern needs at least this many concrete games on its side
const MIN_SHARE = 0.10;        // …and this share of its side, to be worth mentioning at all
const MIN_LIFT = 0.10;         // …and it must be at least this much more common on its side (the real gate)
const MIN_BASELINE = 10;       // fewer games on the OTHER side than this and the lift baseline is too noisy — fall back to share-only
const MIN_FACT_N = 3;          // an averaged fact (avg win turn, mix, …) needs at least this many games behind it
// R4 living-history floors — a version comparison is a strong claim, so it earns stricter gates:
const MIN_DELTA_GAMES = 100;   // BOTH eras need this many games before a win-rate delta is claimed
const MIN_SIDE_N = 30;         // …and this many games on a pattern's side (losses/wins) in BOTH eras for a rate shift
const MIN_SHIFT = 0.05;        // …and the shift must be at least this large to mention
const MAX_SHIFTS = 4;          // top pattern shifts per era transition (skimmable, not exhaustive)

function deckSeatInHeader(h, deck) {
  if (!Array.isArray(h?.decks)) return null;
  const e = h.decks.find((d) => (deck.id && d?.id === deck.id) || (deck.name && d?.name === deck.name));
  return e?.seat ?? null;
}

// ── the LOSS catalog ──────────────────────────────────────────────────────────────────────────────
// One predicate over a per-game record (wins and losses share the shape). A cause of death (killed-*)
// is attributable only when the header can name it: prefer the per-seat death.cause (Tier-2 forward
// capture — precise for ANY eliminated rank); older headers carry no death field, so fall back to the
// game-level winCondition, which names only the LAST elimination — the diedLast gate keeps that
// fallback honest (a finishRank-2 SURVIVOR never died, so eliminatedAtTurn must be real). Winners never
// match a killed-* pred, so those causes are structurally discriminative (winShare 0).
const diedLast = (r) => r.finishRank === 2 && r.eliminatedAtTurn != null;
const causeIs = (r, cause) => (r.death?.cause != null ? r.death.cause === cause : (diedLast(r) && r.winCondition === cause));
const LOSS_CATALOG = [
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

// ── the WIN catalog (R1 — "why you win") ──────────────────────────────────────────────────────────
// The same lift machine with the sign flipped: a pattern more common in WINS than losses is a winning
// line. State patterns (commander early / healthy mana / full seven) fire on either side, so their lift
// is a real comparison. The won-* family describes how the winning GAME ended — winCondition names the
// LAST elimination's cause, and this seat won, so it's the finish that sealed its win (the header never
// records who dealt the blow, so the labels describe the finish, not claim the kill). A loser is never
// finishRank 1, so won-* preds are structurally discriminative (lossShare 0), mirroring killed-*.
// The GENERIC "damage" bucket is deliberately NOT a win pattern (24k-probe finding, 2026-07-15): it means
// drain/pay-life OR an unstamped kill, dominates 80-97% of every deck's wins on real data, and a bucket
// that can mean anything can't coach anything — it lives in the facts-row win-con mix instead, honestly
// labeled. Only SPECIFICALLY stamped finishes earn a pattern here.
const wonBy = (r, cause) => r.finishRank === 1 && r.winCondition === cause;
const WIN_CATALOG = [
  { key: "commander-early", label: `Commander online early — by your turn ${EARLY_COMMANDER_TURN}`, pred: (r) => r.commanderOnlineTurn != null && r.commanderOnlineTurn <= EARLY_COMMANDER_TURN },
  { key: "mana-healthy", label: "Healthy mana — no screw, no flood", pred: (r) => r.screw === false && r.flood === false },
  { key: "kept-seven", label: "Kept a full seven-card hand", pred: (r) => r.finalHandSize === 7 },
  { key: "closed-fast", label: `Closed fast — game over by turn ${FAST_WIN_TURN}`, pred: (r) => r.finishRank === 1 && r.turns != null && r.turns <= FAST_WIN_TURN },
  { key: "won-combat", label: "Wins end in combat damage", pred: (r) => wonBy(r, "combat") },
  { key: "won-commander-damage", label: "Wins end in commander damage", pred: (r) => wonBy(r, "commander-damage") },
  { key: "won-burn", label: "Wins end in burn (noncombat damage)", pred: (r) => wonBy(r, "burn") },
  { key: "won-poison", label: "Wins end in poison", pred: (r) => wonBy(r, "poison") },
  { key: "won-decking", label: "Wins end in decking", pred: (r) => wonBy(r, "decking") },
  { key: "won-effect", label: "Wins end on a win-the-game effect", pred: (r) => wonBy(r, "win-game-effect") },
];

// Human labels for the facts-row win-con mix (the same winCondition taxonomy as epochStats). "damage"
// is the generic bucket — drain/pay-life or an unstamped kill — so its label claims no specific source.
const WINCON_LABELS = {
  "combat": "combat damage", "commander-damage": "commander damage", "burn": "burn",
  "damage": "damage / drains", "poison": "poison", "decking": "decking", "win-game-effect": "a win-the-game effect",
};

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
    turns: h.turns ?? null, // global game length (the closed-fast + facts-row signal)
    finalHandSize: stats?.mull?.finalHandSize ?? null, // London: 7 − bottomed (null on a mulligan-off/legacy game)
    death: stats?.death ?? null, // Tier-2 per-seat {cause, byCombat, landsInHand}; null on pre-Tier-2 headers
    hasState: stats != null, // header carried seatStats for this seat at all (schema-3+)
  };
}

// The ONE lift engine, both directions. `primary` = the side the pattern characterizes (losses for the
// loss catalog, wins for the win catalog); `baseline` = the other side. Returns { share, baseShare, lift }
// per surfaced pattern; the callers map those onto the loss/win field names. Gates: concrete count, share
// floor, and lift ≥ MIN_LIFT — waived (lift null) when the baseline side is too thin to be honest about.
function minePatterns(catalog, primary, baseline) {
  const n = primary.length, nBase = baseline.length;
  const haveBaseline = nBase >= MIN_BASELINE;
  return catalog
    .map(({ key, label, pred }) => {
      const count = primary.filter(pred).length;
      const share = count / n;
      const baseShare = haveBaseline ? baseline.filter(pred).length / nBase : null;
      const lift = baseShare == null ? null : share - baseShare;
      return { key, label, count, share, baseShare, lift };
    })
    .filter((p) => p.count >= MIN_PATTERN_COUNT && p.share >= MIN_SHARE && (p.lift == null || p.lift >= MIN_LIFT))
    .sort((a, b) => (b.lift ?? b.share) - (a.lift ?? a.share));
}

const avg = (xs) => (xs.length >= MIN_FACT_N ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

// The dossier facts row: computed over whatever the headers can honestly support, null otherwise.
// commanderOnline is measured only over games that carried seatStats (schema-3) — on those, a null
// commanderOnlineTurn means "never cast", so the rate is real, not a data artifact.
function computeFacts(wins, losses) {
  const all = wins.concat(losses);
  const withState = all.filter((r) => r.hasState);
  const online = withState.filter((r) => r.commanderOnlineTurn != null);
  const winTurns = wins.map((r) => r.turns).filter((t) => t != null);
  const allTurns = all.map((r) => r.turns).filter((t) => t != null);
  const mixCounts = {};
  for (const r of wins) if (r.winCondition && WINCON_LABELS[r.winCondition]) mixCounts[r.winCondition] = (mixCounts[r.winCondition] || 0) + 1;
  const mixN = Object.values(mixCounts).reduce((s, c) => s + c, 0);
  const winConMix = mixN >= MIN_FACT_N
    ? Object.entries(mixCounts)
        .map(([key, count]) => ({ key, label: WINCON_LABELS[key], count, share: count / mixN }))
        .sort((a, b) => b.count - a.count)
    : null;
  return {
    avgWinTurn: avg(winTurns),      // when this deck wins, the global turn the game ends
    avgGameTurns: avg(allTurns),    // typical game length across all its decisive games
    winConMix,                      // how its wins end, most common first (null under the fact floor)
    commanderOnline: withState.length >= MIN_FACT_N
      ? { rate: online.length / withState.length, avgTurn: avg(online.map((r) => r.commanderOnlineTurn)), n: withState.length }
      : null,
  };
}

/**
 * PURE miner. `headers` = grind header objects (schemaVersion 3+); `deck` = {id?, name?}. Returns the
 * deck's full dossier, or null if the deck never appears / no input. Never throws.
 *  - patterns:    loss side — { key, label, count, lossShare, winShare|null, lift|null }, lift = lossShare − winShare, high first
 *  - winPatterns: win side  — { key, label, count, winShare, lossShare|null, lift|null }, lift = winShare − lossShare, high first
 *  - facts:       { avgWinTurn, avgGameTurns, winConMix, commanderOnline } (each null when too thin to be honest)
 * (Named mineDeckLosses for lineage — the internal id stays, like the `postmortem` view id, while the
 * surface is "The Reflecting Pool".)
 */
// Collect one deck's decisive games off the headers, in store order (header.index when present —
// the append counter, i.e. chronology — else array position, which readAllGrindHeaders keeps
// chronological via manifest shard order). Shared by the dossier miner and the R4 history miner.
function collectDeckGames(headers, deck) {
  const out = [];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (!h || !DECISIVE.has(h.result)) continue;
    const seat = deckSeatInHeader(h, deck);
    if (!seat) continue;
    const entry = h.decks.find((d) => d?.seat === seat);
    out.push({
      rec: recordOf(h, h.seatStats?.[seat] || null),
      isWin: h.winnerSeat === seat,
      deckV: entry?.deckV ?? null, // null = pre-R3 header (before version tracking)
      order: h.index ?? i,
    });
  }
  return out;
}

export function mineDeckLosses(headers, deck) {
  if (!deck || (!deck.id && !deck.name) || !Array.isArray(headers)) return null;
  const collected = collectDeckGames(headers, deck);
  const games = collected.length;
  const wins = collected.filter((g) => g.isWin).map((g) => g.rec);
  const losses = collected.filter((g) => !g.isWin).map((g) => g.rec);
  if (games === 0) return null;
  const base = { deckId: deck.id ?? null, deckName: deck.name ?? null, games, wins: wins.length, losses: losses.length, winRate: wins.length / games };
  const facts = computeFacts(wins, losses);

  // ── loss side ──
  let patterns = [], avgLossTurn = null, note;
  if (losses.length < MIN_LOSSES) {
    const s = losses.length === 1 ? "" : "es";
    note = `Only ${losses.length} recorded loss${s} so far — not enough to name a pattern honestly.`;
  } else {
    patterns = minePatterns(LOSS_CATALOG, losses, wins)
      .map(({ key, label, count, share, baseShare, lift }) => ({ key, label, count, lossShare: share, winShare: baseShare, lift }));
    const elimTurns = losses.map((l) => l.eliminatedAtTurn).filter((t) => t != null);
    avgLossTurn = elimTurns.length ? elimTurns.reduce((s, t) => s + t, 0) / elimTurns.length : null;
    note = wins.length >= MIN_BASELINE
      ? "Patterns more common in this deck's losses than its wins, when the sim AI pilots it — a proxy that sharpens as the model trains."
      : "Too few wins to compare against — these are just the most common patterns in the losses so far (a weak signal).";
  }

  // ── win side (R1) ──
  let winPatterns = [], winNote;
  if (wins.length < MIN_WINS) {
    const s = wins.length === 1 ? "" : "s";
    winNote = `Only ${wins.length} recorded win${s} so far — not enough to name a winning line honestly.`;
  } else {
    winPatterns = minePatterns(WIN_CATALOG, wins, losses)
      .map(({ key, label, count, share, baseShare, lift }) => ({ key, label, count, winShare: share, lossShare: baseShare, lift }));
    winNote = losses.length >= MIN_BASELINE
      ? "Patterns more common in this deck's wins than its losses — the lines worth leaning into."
      : "Too few losses to compare against — these are just the most common patterns in the wins so far (a weak signal).";
  }

  return { ...base, patterns, avgLossTurn, note, winPatterns, winNote, facts };
}

// ── R4: THE LIVING HISTORY ─────────────────────────────────────────────────────────────────────────
// Slice one deck's games by the deckV version stamp (R3) into chronological ERAS, and tell the story
// of each change: the card diff (named via the deck-versions registry), the win-rate move, and the
// pattern-rate shifts — every claim gated (a version comparison is a strong claim; see the MIN_* R4
// floors above). Headers with no stamp form the single honest "before version tracking" era.

// Named card diff between two registry snapshots ({name: copies} maps). Copy-count changes register
// as the net count ("Forest ×2" when two were cut). Commander/companion changes ride the same lists.
function diffVersions(prevEntry, curEntry) {
  if (!prevEntry || !curEntry) return null; // an era without a registry snapshot can't be named — never guess
  const a = prevEntry.cards || {}, b = curEntry.cards || {};
  const added = [], removed = [];
  for (const n of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = (b[n] || 0) - (a[n] || 0);
    if (d > 0) added.push({ name: n, count: d });
    else if (d < 0) removed.push({ name: n, count: -d });
  }
  const cmdA = (prevEntry.commanders || []).join(" + "), cmdB = (curEntry.commanders || []).join(" + ");
  if (cmdA !== cmdB) { if (cmdB) added.push({ name: `Commander: ${cmdB}`, count: 1 }); if (cmdA) removed.push({ name: `Commander: ${cmdA}`, count: 1 }); }
  if ((prevEntry.companion ?? null) !== (curEntry.companion ?? null)) {
    if (curEntry.companion) added.push({ name: `Companion: ${curEntry.companion}`, count: 1 });
    if (prevEntry.companion) removed.push({ name: `Companion: ${prevEntry.companion}`, count: 1 });
  }
  const byName = (x, y) => x.name.localeCompare(y.name);
  return { added: added.sort(byName), removed: removed.sort(byName) };
}

// Rate of one pattern within one side of one era. Returns null when the side is too thin to compare.
const sideRate = (recs, pred) => (recs.length >= MIN_SIDE_N ? recs.filter(pred).length / recs.length : null);

// Two-proportion noise gate: a rate change is claimable only when it exceeds ~2 standard errors of the
// difference — a 6pt wobble on 130-game sides is sampling noise, not a story (CREED: silence over noise).
const beyondNoise = (p1, n1, p2, n2, delta) =>
  Math.abs(delta) >= 2 * Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);

/**
 * PURE history miner. `headers` as in mineDeckLosses; `registry` = the deck-versions registry
 * (gameLogStore.loadDeckVersions()), optional. Returns null unless the deck has ≥2 eras (no history →
 * no section; the surface stays quiet rather than decorative). Eras are chronological; a STAMPED era
 * following another STAMPED era carries its comparison (the pre-tracking era never anchors one):
 *   { deckV, label, games, wins, losses, winRate,
 *     diff: {added,removed}|null,          // named card changes (registry-backed; null = unnameable)
 *     winRateDelta: number|null,           // gated: both eras ≥ MIN_DELTA_GAMES
 *     patternShifts: [{key,label,side,before,after,delta}] }  // gated per MIN_SIDE_N/MIN_SHIFT
 */
export function mineDeckHistory(headers, deck, registry = null) {
  if (!deck || (!deck.id && !deck.name) || !Array.isArray(headers)) return null;
  const collected = collectDeckGames(headers, deck);
  if (!collected.length) return null;

  // Group into eras by stamp, ordered by first appearance (store order = chronology).
  const byV = new Map(); // key: deckV ?? PRE sentinel → { deckV, games:[], firstOrder }
  const PRE = "__pre-tracking__";
  for (const g of collected) {
    const key = g.deckV ?? PRE;
    if (!byV.has(key)) byV.set(key, { deckV: g.deckV, games: [], firstOrder: g.order });
    const e = byV.get(key);
    e.games.push(g);
    if (g.order < e.firstOrder) e.firstOrder = g.order;
  }
  if (byV.size < 2) return null; // one era = no history to tell yet

  const regForDeck = registry?.[deck.id ?? deck.name] || null;
  const eras = [...byV.values()].sort((x, y) => x.firstOrder - y.firstOrder);
  let versionN = 0;
  const out = [];
  for (let i = 0; i < eras.length; i++) {
    const e = eras[i];
    const wins = e.games.filter((g) => g.isWin).map((g) => g.rec);
    const losses = e.games.filter((g) => !g.isWin).map((g) => g.rec);
    const n = e.games.length;
    const label = e.deckV == null ? "Before version tracking" : `Version ${++versionN}`;
    const prev = i > 0 ? out[i - 1] : null;

    // Deltas are claimed ONLY between two STAMPED eras. The pre-tracking era is a mixed bag by
    // construction — many engine versions, pilot eras, and stamp taxonomies — so any "change" against
    // it is confounded (the 24k probe showed 'wins end in combat 0%→93%': the STAMP era changing, not
    // the deck). It still lists with its record; it just never anchors a comparison.
    const comparable = prev != null && prev.deckV != null && e.deckV != null;

    // win-rate delta — both eras carry real weight AND the move clears the noise gate
    const winRate = wins.length / n;
    let winRateDelta = null;
    if (comparable && n >= MIN_DELTA_GAMES && prev.games >= MIN_DELTA_GAMES) {
      const d = winRate - prev.winRate;
      if (beyondNoise(prev.winRate, prev.games, winRate, n, d)) winRateDelta = d;
    }

    // pattern shifts vs the previous era — both catalogs, side-aware, floor- AND noise-gated
    const patternShifts = [];
    if (comparable) {
      const prevWins = prev._wins, prevLosses = prev._losses;
      const compareSide = (catalog, prevSide, curSide, side) => {
        for (const { key, label: plabel, pred } of catalog) {
          const before = sideRate(prevSide, pred), after = sideRate(curSide, pred);
          if (before == null || after == null) continue;
          const delta = after - before;
          // mentionable only if the pattern is REAL in at least one era (count+share floors there)…
          const realSomewhere = [prevSide, curSide].some((s) => { const c = s.filter(pred).length; return c >= MIN_PATTERN_COUNT && c / s.length >= MIN_SHARE; });
          // …big enough to matter, and bigger than sampling noise
          if (Math.abs(delta) >= MIN_SHIFT && realSomewhere && beyondNoise(before, prevSide.length, after, curSide.length, delta)) {
            patternShifts.push({ key, label: plabel, side, before, after, delta });
          }
        }
      };
      compareSide(LOSS_CATALOG, prevLosses, losses, "loss");
      compareSide(WIN_CATALOG, prevWins, wins, "win");
      patternShifts.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).splice(MAX_SHIFTS);
    }

    out.push({
      deckV: e.deckV, label, games: n, wins: wins.length, losses: losses.length, winRate,
      diff: prev ? diffVersions(prev.deckV != null ? regForDeck?.[prev.deckV] : null, e.deckV != null ? regForDeck?.[e.deckV] : null) : null,
      winRateDelta, patternShifts,
      _wins: wins, _losses: losses, // internal — stripped below
    });
  }
  for (const e of out) { delete e._wins; delete e._losses; }
  return { eras: out };
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

/** Glue: mine one deck's dossier straight from the grind store. */
export async function mineDeckLossesFromStore(deck) {
  return mineDeckLosses(await readAllGrindHeaders(), deck);
}

export const _internals = { FAST_LOSS_TURN, FAST_WIN_TURN, EARLY_COMMANDER_TURN, MIN_LOSSES, MIN_WINS, MIN_PATTERN_COUNT, MIN_SHARE, MIN_LIFT, MIN_BASELINE, MIN_FACT_N, MIN_DELTA_GAMES, MIN_SIDE_N, MIN_SHIFT, MAX_SHIFTS };
