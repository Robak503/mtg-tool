/**
 * boardEval.js — THE CHOICE-EVALUATION LAYER, phase 1 of the SUBSYSTEM QUARTET (Colton-ordered
 * 2026-08-14; the plan + gates live in docs/orchestration/SUBSYSTEM-QUARTET-PLAN.md).
 *
 * THE GAP: every choice site carries its own hardcoded house policy (least-valuable-by-MV victims,
 * first-legal commanders, always-take-the-may). Rules-correct, strategically blind — the MV ranking
 * happily sacrifices a Sol Ring to keep a vanilla bear. This module is the ONE shared valuation those
 * sites consult instead, so play strength upgrades everywhere at once and the decision log (phase 2)
 * gets its scores for free.
 *
 * ⛔ POLICY, NEVER RULES (THE CREED): nothing here decides what is LEGAL — the chokepoints do. This
 * layer only re-ranks choices among legal options, exactly like cardPlayHints' ranking-only contract.
 * ⛔ DEFAULT-OFF: consumers gate on `state.usePolicyEval` (the cardPlayHints/resolveArbiter
 * precedent) — absent flag ⇒ every converted site runs its legacy policy byte-identically, so frozen
 * self-play trajectory hashes are untouched until the phase gate (flag-on beats flag-off over ≥100
 * seeded games) passes and the default flips.
 *
 * PURITY CONTRACT: every function is a pure read of (state, …) — no Math.random, no Date, no
 * mutation — so scores are serialize-stable and a replay (phase 3) reproduces them bit-for-bit.
 *
 * V1 WEIGHTS (documented policy, deliberately simple — the learning loop tunes them later):
 *   permanentValue = manaValue                       (the sunk cost / replacement cost proxy)
 *                  + 0.3 × (power + toughness)       (layer-aware — an anthem'd token is worth more)
 *                  + role bonus                      (mana engines compound; draw engines snowball)
 *                  + 3 if commander                  (losing the commander costs tempo + tax)
 *                  × 0.6 if a token                  (replaceable — CR 111.1 it ceases to exist)
 *   evaluateBoard = Σ permanentValue + 0.25 × life + 0.5 × handSize + 0.5 × untappedManaSources
 */

import { creaturePower, creatureToughness } from "./gameState.js";
import { tutorManaValue } from "./effects/atoms/library.js"; // leaf — the same MV reader the legacy policies use
import { deriveCardRole } from "./cardPlayHints.js";         // pure text→role; a zero-engine-import leaf

// Role bonuses — what a permanent DOES beyond its stats. Keyed on cardPlayHints' role vocabulary so a
// curated hints ledger (phase 1 step 4) can steer these through the same single vocabulary.
const ROLE_BONUS = Object.freeze({
  "ramp": 2,          // a mana engine compounds every later turn (the Sol Ring lesson)
  "card-draw": 1.5,   // draw engines snowball
  "tutor": 1,
  "anthem": 1,        // team-wide value multiplies with board width
  "token-maker": 1,
  "wipe": 0.5, "counterspell": 0.5, "spot-removal": 0.5, "protection": 0.5,
  "recursion": 0.5, "finisher": 1, "equipment": 0.5, "lifegain": 0.25,
  "utility": 0, "curve": 0,
});

/** The valuation of ONE battlefield permanent — pure, deterministic, layer-aware for P/T. */
export function permanentValue(perm, state = null) {
  const card = perm?.card;
  if (!card) return 0;
  let v = Math.max(0, tutorManaValue(card));
  if (/\bCreature\b/.test(String(card.type || card.type_line || ""))) {
    v += 0.3 * (Math.max(0, creaturePower(perm, state) || 0) + Math.max(0, creatureToughness(perm, state) || 0));
  }
  v += ROLE_BONUS[deriveCardRole(card).role] || 0;
  if (card.isCommander) v += 3;
  if (card.token) v *= 0.6;
  return v;
}

/** Is this permanent an untapped mana source right now? (A cheap development proxy — lands + rocks/dorks.) */
function isUntappedManaSource(perm) {
  if (perm.tapped) return false;
  const t = String(perm.card?.type || perm.card?.type_line || "");
  if (/\bLand\b/.test(t)) return true;
  return /\{T\}[^:]*:\s*Add\b/i.test(String(perm.card?.oracle || perm.card?.oracle_text || ""));
}

/**
 * ONE player's position as a number. Bigger = better. Comparable ONLY between evaluations of the same
 * player across candidate futures (the scoreChoice pattern) or between players on the same state.
 */
export function evaluateBoard(state, playerId) {
  const p = state?.players?.[playerId];
  if (!p) return 0;
  let score = 0;
  for (const perm of p.battlefield || []) score += permanentValue(perm, state);
  score += 0.25 * Math.max(0, p.life ?? 0);
  score += 0.5 * (p.hand?.length || 0);
  score += 0.5 * (p.battlefield || []).filter(isUntappedManaSource).length;
  return score;
}

/**
 * The evaluator's least-valuable ranking — the phase-1 replacement for the MV-then-power house policy
 * at the converted sites. Ascending permanentValue; ties fall through to the LEGACY ordering (MV →
 * power → name → id) so the sort stays serialize-stable and flag-on runs are deterministic.
 */
export function evalLeastValuableCmp(state) {
  const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return (a, b) =>
    permanentValue(a, state) - permanentValue(b, state) ||
    tutorManaValue(a.card) - tutorManaValue(b.card) ||
    (Number(a.card?.power) || 0) - (Number(b.card?.power) || 0) ||
    cmpStr(String(a.card?.name || ""), String(b.card?.name || "")) ||
    cmpStr(String(a.id || ""), String(b.id || ""));
}

/** A HAND card's valuation (the discard picker's read) — no battlefield state, so MV + role + stats. */
export function cardValue(card) {
  if (!card) return 0;
  let v = Math.max(0, tutorManaValue(card));
  if (/\bCreature\b/.test(String(card.type || card.type_line || ""))) {
    v += 0.3 * ((Number(card.power) || 0) + (Number(card.toughness) || 0));
  }
  v += ROLE_BONUS[deriveCardRole(card).role] || 0;
  return v;
}

/** The card twin of evalLeastValuableCmp — same legacy fallthrough, over bare cards (hands). */
export function evalLeastValuableCardCmp() {
  const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return (a, b) =>
    cardValue(a) - cardValue(b) ||
    tutorManaValue(a) - tutorManaValue(b) ||
    (Number(a.power) || 0) - (Number(b.power) || 0) ||
    cmpStr(String(a.name || ""), String(b.name || "")) ||
    cmpStr(String(a.id || ""), String(b.id || ""));
}
