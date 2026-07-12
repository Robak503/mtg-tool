/**
 * winClassifier.js — the honest combo win-condition tag, sourced from the bundled Commander
 * Spellbook combos (Colton 2026-07-11: ship the full 99MB file; load it lazily + derive a bounded
 * in-memory lookup so runtime RAM stays sane).
 *
 * CREED (false-positive FORBIDDEN): a "combo" tag fires ONLY when BOTH hold —
 *   1. the winner CAST every card of a catalogued combo (from the game log's cast-spell events), and
 *   2. that combo's `produces` maps to the ACTUAL win-condition the game ended on (consistency).
 * "Assembled the pieces" alone is NOT enough (a deck can hold combo pieces incidentally); an enabling
 * combo (infinite tokens/counters/mana) that merely SET UP a combat kill is NOT tagged combo — the win
 * was combat. Ambiguous `produces` → no tag (false-negative SAFE). So the tag never over-claims.
 *
 * The pure detection (classifyComboWin, producesToWincons, buildComboLookup) is unit-tested with small
 * fixtures; loadComboData is the thin lazy reader over the bundled snapshot.
 */

import { dataPath } from "../server/paths.js";

/**
 * Map a combo's free-text `produces` results to the engine's win-condition tokens — CONSERVATIVELY.
 * Only results that DIRECTLY end a game map; enabling results (counters/tokens/mana/ETB loops) return
 * nothing, so a combo that merely built a board never gets credited with the kill. Returns a Set.
 *
 * Engine win-cons (epochStats): "damage" (combat OR burn OR life-loss/drain), "decking", "poison",
 * "win-game-effect", "commander-damage".
 */
export function producesToWincons(produces) {
  const text = (Array.isArray(produces) ? produces.join(" · ") : String(produces || "")).toLowerCase();
  const wincons = new Set();
  if (/\bwins? the game\b|\bwin the game\b/.test(text)) wincons.add("win-game-effect");
  if (/infinite damage|deals? .*infinite|infinite .*damage|infinite burn/.test(text)) wincons.add("damage");
  if (/infinite (life ?loss|drain)|lose(s)? .*life|life ?loss|infinite drain|drain .*life/.test(text)) wincons.add("damage");
  if (/infinite mill|mill .*(library|cards)|empt(y|ies) .*library|deck(s|ing) out/.test(text)) wincons.add("decking");
  if (/poison|infect|toxic|\bproliferate\b.*poison/.test(text)) wincons.add("poison");
  return wincons;
}

/**
 * Derive the bounded lookup from the raw combos array (the parsed 99MB file). Keeps ONLY what the
 * classifier needs — each combo's lowercase card-name set, a display name, and its mapped win-cons —
 * plus a card-name → combo-index inverted index for candidate lookup. The heavy raw records are dropped.
 */
export function buildComboLookup(rawCombos) {
  const combos = [];
  const byCard = new Map(); // cardNameLower → array of combo indices
  const list = Array.isArray(rawCombos) ? rawCombos : [];
  for (const rec of list) {
    const cards = Array.isArray(rec?.cards) ? rec.cards.filter(Boolean) : [];
    if (cards.length < 2) continue; // a "combo" is ≥2 cards
    const cardsLower = cards.map((c) => String(c).toLowerCase());
    const wincons = producesToWincons(rec?.produces);
    if (wincons.size === 0) continue; // no DIRECT win result → can never be a consistent combo tag → drop it
    const idx = combos.length;
    combos.push({ cardsLower, cardsSet: new Set(cardsLower), name: cards.join(" + "), wincons, popularity: rec?.popularity ?? 0 });
    for (const c of cardsLower) {
      const arr = byCard.get(c);
      if (arr) arr.push(idx); else byCard.set(c, [idx]);
    }
  }
  return { combos, byCard };
}

/** Collect the LOWERCASE card names the winning seat CAST during the game (the assembled-pieces signal). */
function winnerCastCards(log, winnerSeat) {
  const set = new Set();
  for (const e of (Array.isArray(log) ? log : [])) {
    if (e?.kind === "cast-spell" && e.playerId === winnerSeat && e.cardName) set.add(String(e.cardName).toLowerCase());
  }
  return set;
}

/**
 * Decide whether a decisive game was a COMBO win. Pure. Returns { isCombo, name } — isCombo true only
 * when the winner cast every card of a catalogued combo AND that combo's produces is consistent with
 * `winCondition`. Picks the most-popular fully-assembled+consistent combo (a stable, meaningful choice).
 */
export function classifyComboWin({ comboData, log, winnerSeat, winCondition }) {
  if (!comboData || !winnerSeat || !winCondition) return { isCombo: false };
  const cast = winnerCastCards(log, winnerSeat);
  if (cast.size < 2) return { isCombo: false };
  // Candidate combos: those sharing at least one card with the winner's cast list.
  const candidates = new Set();
  for (const c of cast) {
    const arr = comboData.byCard.get(c);
    if (arr) for (const idx of arr) candidates.add(idx);
  }
  let best = null;
  for (const idx of candidates) {
    const combo = comboData.combos[idx];
    if (!combo.wincons.has(winCondition)) continue; // consistency: the combo must produce THIS win-con
    let all = true;
    for (const c of combo.cardsLower) { if (!cast.has(c)) { all = false; break; } }
    if (!all) continue; // every piece must have been cast
    if (!best || combo.popularity > best.popularity) best = combo;
  }
  return best ? { isCombo: true, name: best.name } : { isCombo: false };
}

// ── lazy loader over the bundled snapshot (server-side) ──
let _cache = null;
let _loading = null;

/**
 * Load + cache the combo lookup from the bundled Spellbook snapshot. Lazy (first call parses the 99MB
 * file, derives the bounded lookup, drops the raw), cached thereafter. Returns null if the snapshot is
 * absent (e.g. a dev tree without it) — the caller then simply skips combo tagging (no fabrication).
 */
export async function loadComboData() {
  if (_cache !== null) return _cache || null;
  if (_loading) return _loading;
  _loading = (async () => {
    try {
      const fs = await import("node:fs/promises");
      const raw = await fs.readFile(dataPath("spellbook-combos.local.json"), "utf8");
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : (parsed.combos || parsed.variants || Object.values(parsed).find(Array.isArray) || []);
      _cache = buildComboLookup(arr);
    } catch {
      _cache = false; // absent/unreadable → cache the miss so we don't retry every game
    }
    _loading = null;
    return _cache || null;
  })();
  return _loading;
}

/** Reset the loader cache (tests). */
export function _resetComboCacheForTests() { _cache = null; _loading = null; }
