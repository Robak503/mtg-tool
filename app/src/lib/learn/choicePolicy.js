/**
 * choicePolicy.js — deterministic auto-choice POLICY for choices this self-play engine has no human to make.
 *
 * WHY A MODULE AND NOT A LOCAL MIRROR. This file exists for exactly one function today, and the codebase's
 * usual answer would be to keep a local copy (resolvers.js says "kept local so resolvers stays leaf-ish"
 * three times over, and that is right for pure FORMATTERS like creatureSubtypesOf). A POLICY is different:
 * if "which creature type does the engine pick" is written twice, a future tune to one copy makes the sim
 * choose one type at an ETB and a different one at an activation, on the same board, with every test still
 * green. That is a silent behavioural fork, not a duplicated formatter.
 *
 * ⛔ THIS MODULE MUST IMPORT NOTHING. It is reachable from BOTH resolvers.js and the effect atoms, which sit
 * on opposite sides of the runProgram cycle (resolvers → runProgram → effectAtoms → atoms/*), so an atom can
 * never import resolvers back. A leaf with zero imports is the only shape that can be shared by both without
 * an import edge, and it also cannot participate in a module-init ordering fault.
 *
 * Every function here is PURE and DETERMINISTIC — no Math.random, no Date. Self-play training data is only
 * worth anything if the same board always produces the same choice.
 */

/**
 * The creature subtypes printed on a card's type line (the words after the "—", CR 205.3a); [] when the card
 * has no subtype dash or is not a creature. Duplicated deliberately from resolvers.js's local copy: it is a
 * six-line pure formatter, and importing it here would give this leaf an edge it must not have.
 */
function printedCreatureSubtypes(card) {
  const ts = String(card?.type || card?.type_line || "");
  if (!/Creature/.test(ts)) return [];
  const dash = ts.indexOf("—");
  if (dash === -1) return [];
  return ts.slice(dash + 1).trim().split(/\s+/).filter(Boolean);
}

/**
 * AUTO-PICK a creature type for a "choose a creature type" choice (CR 614.12) in this self-play engine,
 * which has no interactive picker.
 *
 * The policy (carried over verbatim from resolvers.js, where it lived while the ETB chooser was its only
 * caller): the MOST-COMMON creature subtype among the controller's creatures, in priority order —
 *   1. the controller's BATTLEFIELD creatures (the board the chooser is actually paying off),
 *   2. else the controller's LIBRARY/deck creatures (what the deck is built around — the right pick when
 *      the chooser lands before the tribe does),
 *   3. else a safe FALLBACK ("Human", the single most-common creature type in Magic; a non-null type keeps
 *      the stored state well-formed so a future tribal entry can still match, never an over-fire by itself).
 * Ties break ALPHABETICALLY so the pick is deterministic + serialize-stable (no Map-iteration-order
 * reliance).
 *
 * ⚠️ CALLER CONTRACT ON `state`: the ETB caller passes the PRE-entry state, so a chooser never counts its
 * own (not-yet-entered) subtype. An ACTIVATED caller passes the LIVE state, where the source is already on
 * the battlefield — and counting itself is actively wrong there, which is why `excludePermanentId` exists:
 * a lone Mistform Dreamer would tally one Illusion, pick Illusion, and REPLACE its Illusion type with
 * Illusion. A legal choice that does nothing whatsoever. Pass the source's id to leave it out of the tally.
 * ⚠️ Found by an empty-board assertion, not by reasoning about it — the two-Goblin cases were all green.
 *
 * ⛔ IT IS A HEURISTIC, AND A DELIBERATELY DULL ONE. Picking the type that would maximize some payoff needs
 * a read of what the choice is FOR, which differs per card; a board-shaped default is defensible everywhere
 * and never silently favours the engine. Callers that need a smarter pick should say so at their own site
 * rather than tuning this — see the module header on why a second copy of this policy is the failure mode.
 */
export function autoPickCreatureType(state, controller, { excludePermanentId = null } = {}) {
  const player = state?.players?.[controller];
  const tally = new Map();
  const add = (cards) => {
    for (const c of cards || []) {
      if (excludePermanentId != null && c?.id === excludePermanentId) continue;
      for (const sub of printedCreatureSubtypes(c.card || c)) tally.set(sub, (tally.get(sub) || 0) + 1);
    }
  };
  add(player?.battlefield);
  if (tally.size === 0) add(player?.library);
  if (tally.size === 0) return "Human";
  let best = null;
  let bestN = -1;
  for (const sub of [...tally.keys()].sort()) {   // alphabetical scan → deterministic tiebreak
    const n = tally.get(sub);
    if (n > bestN) { best = sub; bestN = n; }
  }
  return best;
}
