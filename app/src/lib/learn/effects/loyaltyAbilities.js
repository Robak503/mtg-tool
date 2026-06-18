/**
 * effects/loyaltyAbilities.js — loyalty-ability detection + planeswalker native-coverage (PW-1).
 *
 * A loyalty ability is a special activated ability whose cost is a loyalty adjustment
 * (CR 606.1): `[+N]:`, `[−N]:`, or `[0]:` followed by an effect. This module splits a
 * planeswalker's oracle text into its loyalty-ability lines and parses each one's cost
 * (the signed integer before the colon) and effect (after it). It is the single source of
 * truth both the runtime (`legalChoices.actionsActivateLoyalty` /
 * `actionDispatcher.applyActivateLoyalty`) and the coverage metric
 * (`coverage.classifyCard` → native-planeswalker) read, so the two can never drift.
 *
 * THE FAIL-SAFE (CLAUDE.md §1.2/§8, the CREED): a planeswalker is only `native` when EVERY
 * one of its loyalty abilities parses to a HIGH, non-modal, non-X EffectProgram AND it has
 * NO non-loyalty residual text (a static / triggered ability we don't model). One unmodeled
 * ability — an `−X` ultimate, an emblem maker, a modal mode — drops the WHOLE card to the
 * Ollama-only Arbiter (arbiter-pw). All-or-nothing: a false negative is safe; a partially
 * modeled walker is forbidden.
 *
 * Leaf-ish: imports the effect parser + the pure planeswalker card-shape reads from gameState.
 * No legalChoices / dispatcher (which would cycle).
 */

import { parseEffectClause, programConfidence, programNeedsChosenTarget } from "./parser.js";
import { isPlaneswalker, startingLoyalty } from "../gameState.js";

/**
 * A loyalty-ability line: an optional `[…]`-wrapped signed cost, a colon, then the effect.
 * The cost is `+N`, `−N` (ASCII `-` OR the Unicode minus `−` U+2212 that Scryfall actually
 * prints), or `0`. Anchored to the start of the (trimmed) line so a colon inside an effect
 * sentence never mis-detects. `−X` / `+X` costs deliberately DON'T match (\d+ only) → such a
 * walker keeps an unrecognized line as residue and stays arbiter-pw (CREED-safe).
 */
const LOYALTY_LINE = /^(?:\[\s*)?([+]\d+|[-−]\d+|0)(?:\s*\])?\s*:\s*(.+)$/;

/** Strip reminder text (parens) but preserve newlines so per-line splitting still works. */
function stripReminder(text) {
  return String(text || "").replace(/\([^)]*\)/g, " ").replace(/[ \t]+/g, " ");
}

function oracleOf(card) {
  return stripReminder(card?.oracle || card?.oracle_text || "");
}

/**
 * All loyalty-ability lines on a planeswalker, as serializable descriptors. Each entry:
 *   { index, raw, costDelta, effectClause, program, modeled, needsTarget }
 * `costDelta` is the signed integer (+N / −N / 0). `modeled` is the gate the runtime offers on
 * (effect parses HIGH, non-modal, non-X); the coverage metric reads the full list.
 */
export function parseLoyaltyAbilities(card) {
  const oracle = oracleOf(card);
  if (!oracle.trim()) return [];
  const out = [];
  let index = 0;
  for (const rawLine of oracle.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = LOYALTY_LINE.exec(line);
    if (!m) continue;
    const costDelta = parseInt(m[1].replace("−", "-"), 10);
    const effectClause = m[2].trim();
    // A loyalty ability's effect resolves exactly as a spell would; parse it as Instant text so
    // the spell-effect vocabulary (draw / damage / destroy / token / …) engages off a permanent.
    const program = parseEffectClause(effectClause, "Instant");
    const modeled = !!program && programConfidence(program) === "high" && program.structure !== "modal" && !program.xSpell;
    out.push({
      index: index++,
      raw: line,
      costDelta,
      effectClause,
      program,
      modeled,
      needsTarget: modeled && programNeedsChosenTarget(program),
    });
  }
  return out;
}

/**
 * Is this planeswalker fully modeled — every loyalty ability HIGH, no unmodeled residue — so it
 * plays NATIVELY (the player/AI can deploy it, tick it up/down, and each ability resolves)? This
 * is the all-or-nothing CREED gate coverage.classifyCard reads to flip a walker to
 * `native-planeswalker` instead of `arbiter-pw`.
 *
 * Requires: a planeswalker, a finite starting loyalty, at least one loyalty ability, EVERY loyalty
 * ability modeled, AND no leftover lines after removing the loyalty abilities (a static or
 * triggered ability the engine doesn't model would otherwise be silently dropped). Conservative by
 * design — when in doubt it routes the whole card to the Arbiter.
 */
export function planeswalkerNativelyCovered(card) {
  if (!isPlaneswalker(card)) return false;
  if (startingLoyalty(card) == null) return false;
  const abilities = parseLoyaltyAbilities(card);
  if (abilities.length === 0) return false;
  if (!abilities.every((a) => a.modeled)) return false;
  // No non-loyalty residual text — any line that ISN'T a loyalty ability is a static/triggered
  // ability we don't model here, so the card isn't fully covered (→ Arbiter).
  const residue = oracleOf(card)
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((line) => !LOYALTY_LINE.test(line));
  return residue.length === 0;
}
