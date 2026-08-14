/**
 * saga.js — SAGAS (CR 714, SHELF S7 — Vault 12: The Necropolis).
 *
 * A Saga is an enchantment whose oracle is a numbered CHAPTER list:
 *   "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)"
 *   "I — <effect>"  /  "II — <effect>"  /  "I, II — <shared effect>" (CR 714.2c)
 * The engine model:
 *   - enterPermanent stamps `sagaFinal` (the highest chapter) and adds the FIRST lore counter, firing
 *     chapter I (CR 714.3a — as it enters).
 *   - the controller's draw step adds a lore counter to each of their Sagas and fires every chapter the
 *     count just crossed (gameEngine.runStepActions → checkSagaChapterTriggers, CR 714.3b — transitions
 *     only, so a chapter never re-fires).
 *   - a Saga whose lore count ≥ sagaFinal with NONE of its chapter abilities pending or on the stack is
 *     SACRIFICED (gameEngine.sweepFinishedSagas — CR 714.4; fires the sacrifice watchers like any other
 *     non-creature sacrifice).
 * Chapter descriptors are synthesized by detectTriggers (the keyword-synthesis precedent) so coverage and
 * the runtime read the SAME parse — a Saga is native ONLY when every chapter effect routes natively.
 *
 * CREED: parseSagaChapters is all-or-nothing — ANY non-chapter residue line, a non-contiguous chapter
 * list, or an unrecognized numeral returns null and the whole card stays body-only (Arbiter). Read-only
 * helpers here; the runtime hooks live in resolvers/gameEngine.
 */

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };

import { COMBAT_KEYWORDS } from "./keywords.js"; // zero-import leaf — cycle-free
import { stripAbilityWordLabel } from "./effects/textNormalize.js"; // zero-import leaf — the CR 207.2c label strip
// A pure combat-keyword line on an enchantment CREATURE Saga (Summon: Bahamut's "Flying") is NOT chapter
// residue — the body's keyword machinery credits it exactly as on any creature; parking the whole Saga on
// it was the FF-Summon class's only blocker. Every comma token must be a listed keyword (else the line
// still parks the card — an unmodeled ability line stays all-or-nothing).
const COMBAT_KW_SET = new Set(COMBAT_KEYWORDS.map((k) => k.toLowerCase()));
const isPureKeywordLine = (line) => line.split(/,\s*/).every((t) => COMBAT_KW_SET.has(t.trim().toLowerCase()));

export function isSagaCard(card) {
  return /\bSaga\b/.test(String(card?.type || card?.type_line || ""));
}

/**
 * Parse a Saga's chapter list → { chapters: [{ n, effect }...] (ascending, one entry per chapter number),
 * final } or null. Reminder text is stripped first (the lore-counter rule text is parenthetical). A
 * multi-numeral line ("I, II — <effect>", CR 714.2c) expands to one entry per listed chapter. Chapters
 * must cover 1..final with no gaps and no duplicates.
 */
export function parseSagaChapters(card) {
  if (!isSagaCard(card)) return null;
  const oracle = String(card?.oracle || card?.oracle_text || "").replace(/\([^)]*\)/g, " ");
  const byChapter = new Map();
  for (const rawLine of oracle.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (isPureKeywordLine(line)) continue; // a creature Saga's keyword line — credited by the body machinery, never chapter residue
    const m = line.match(/^((?:[IV]+)(?:\s*,\s*[IV]+)*)\s*—\s*(.+)$/);
    if (!m) return null; // a non-chapter line on a Saga → unmodeled residue → park the whole card
    // A FLAVOR-LABELED chapter ("IV — Mega Flare — This creature deals …", the FF Summons): the label
    // carries no rules meaning (CR 207.2c) — strip it through the SAME single-source list every other
    // path uses, so an un-listed label keeps the raw text and the chapter parses LOW (FN-safe).
    const effect = stripAbilityWordLabel(m[2].trim()).trim();
    for (const numeral of m[1].split(/\s*,\s*/)) {
      const n = ROMAN[numeral.trim().toLowerCase()];
      if (!n || byChapter.has(n)) return null; // unknown numeral / duplicate chapter → park
      byChapter.set(n, effect);
    }
  }
  if (byChapter.size === 0) return null;
  const final = Math.max(...byChapter.keys());
  for (let n = 1; n <= final; n++) if (!byChapter.has(n)) return null; // a gap → park
  return { chapters: Array.from({ length: final }, (_, i) => ({ n: i + 1, effect: byChapter.get(i + 1) })), final };
}
