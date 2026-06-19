/**
 * ward.js — KW-WARD enforcement (CR 702.21).
 *
 * "Ward [cost]" is a triggered ability: whenever the permanent becomes the target of a spell or
 * ability an OPPONENT controls, counter that spell or ability unless that player pays [cost]. It is a
 * TAX, not an exclusion — the permanent IS a legal target (unlike hexproof/shroud, which gate
 * targetability in enumerateTargets). So ward never touches `canBeTargetedBy`; it fires AFTER a
 * target is chosen.
 *
 * REUSE: the "counter unless its controller pays {N}" machinery already exists as the SOFT-COUNTER
 * path (effectAtoms.applyCounter `unlessPay` → pendingChoice "soft-counter" → resolveSoftCounterChoice
 * + the driver/AI settle + the UI). Ward is a thin trigger that raises the SAME pendingChoice with the
 * spell's controller as the payer and the ward cost as the amount — so the decision, the AI heuristic,
 * the UI panel, and the counter are all inherited, not rebuilt.
 *
 * SCOPE (PR1): mana ward costs whose pips are ALL generic ({2}, {1}, {3}, {4} — ~142 of the 213 ward
 * cards), because the soft-counter `amount` is a generic number. A colored/hybrid ward ({1}{U}) or a
 * non-mana ward (—Pay 3 life / —Discard a card / —Sacrifice) parses to null here and is left
 * UNENFORCED (a safe false-negative — ward stays a partial interim-FP for those, never mis-resolved).
 * A spell targeting 2+ opponent ward permanents is also left unenforced (each ward is its own trigger,
 * CR 702.21c; summing them would be an approximation) — the single-ward case is the overwhelming norm.
 * Abilities/triggered-ability targeting (vs spell targeting) is PR2.
 *
 * Pure: regex + board reads, no mutation.
 */

import { findPermanent } from "./gameState.js";
import { permanentHasKeyword } from "./layers.js";

/**
 * The ward cost printed on a card, as a generic-mana amount — or null when it isn't an all-generic
 * mana ward (colored/hybrid mana and non-mana costs are out of PR1 scope, returned as null = unenforced).
 * "Ward {2}" → { generic: 2 }; "Ward {1}{U}" / "Ward—Pay 3 life" → null.
 */
export function parseWardCost(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "");
  // The mana form is "Ward {…}"; the non-mana forms use an em-dash ("Ward—Pay 3 life") and won't match.
  // Pips must be DIRECTLY adjacent ({1}{U}) — no `\s*` between them, or a greedy match would cross the
  // newline after "Ward {2}" and swallow the NEXT ability's mana ("{1}{R}{G}, Exile…" → a false colored
  // read on Wilson, Ardent Bear / Pippin). A mana cost never has whitespace inside it, so this is exact.
  const m = oracle.match(/\bward\s+(\{[^}]+\}(?:\{[^}]+\})*)/i);
  if (!m) return null;
  const pips = (m[1].match(/\{([^}]+)\}/g) || []).map((p) => p.slice(1, -1));
  if (pips.length && pips.every((p) => /^\d+$/.test(p))) {
    return { generic: pips.reduce((sum, p) => sum + parseInt(p, 10), 0) };
  }
  return null; // colored / hybrid / {X} ward — PR2 (the soft-counter amount is generic-only)
}

/**
 * If `spellObj` (a stack object) targets EXACTLY ONE permanent that (a) is controlled by an opponent of
 * the spell's controller and (b) has ward with an all-generic mana cost, return { amount, wardName };
 * otherwise null. Used to raise a soft-counter (pay-or-be-countered) against the caster.
 */
export function wardTaxForSpell(state, spellObj) {
  const caster = spellObj?.controller;
  if (!caster) return null;
  const wardTargets = (spellObj.targets || []).filter((t) => {
    if (!t || (t.type !== "creature" && t.type !== "permanent" && t.type !== "planeswalker")) return false;
    const lk = findPermanent(state, t.id);
    return lk && lk.controller !== caster && permanentHasKeyword(state, t.id, "Ward");
  });
  if (wardTargets.length !== 1) return null; // 0 → no ward; 2+ → PR2 (separate triggers), safe FN
  const lk = findPermanent(state, wardTargets[0].id);
  const cost = parseWardCost(lk?.permanent?.card);
  if (!cost) return null;
  return { amount: cost.generic, wardName: lk.permanent.card?.name || null };
}
