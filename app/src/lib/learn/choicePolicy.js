/**
 * choicePolicy.js — deterministic auto-choice POLICY for choices this self-play engine has no human to make.
 *
 * WHY A MODULE AND NOT A LOCAL MIRROR. This file exists for exactly one function today, and the codebase's
 * usual answer would be to keep a local copy (enterReplacements.js — the entry replacements, moved out of resolvers.js —
 * says "kept local so this leaf stays leaf-ish" twice over, and that is right for pure FORMATTERS like
 * creatureSubtypesOf). A POLICY is different:
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
 * has no subtype dash or is not a creature. Duplicated deliberately from enterReplacements.js's local copy: it is a
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

/**
 * AUTO-PICK a card type for an "as this enters, choose <card types>" choice (CR 614.12a — made before the permanent enters):
 * Cloud Key's "choose artifact, creature, enchantment, instant, or sorcery", whose payoff discounts spells of the chosen type.
 *
 * The policy: the option naming the MOST cards the controller still has to cast — their HAND and LIBRARY, counted together
 * (the order of the library is never read, only its contents). A card counts once for each option among its card types (an
 * artifact creature counts for both — CR 205.2b), read off every face of its type line that is not a land (a land, even one
 * with another card type, is played and never cast — CR 305.9). Ties break in the order `options` lists them; with nothing
 * to count, the first option. The result is always a member of `options`, and only of `options`.
 *
 * `excludeCardId` leaves the entering card itself out of the count: a Cloud Key searched out of the library or put onto the
 * battlefield from the hand is still in that zone when the choice is made, and it is not a spell still to be cast.
 *
 * The same deliberately-dull discipline as autoPickCreatureType above: a count of the deck, never a read of the board's threats.
 */
export function autoPickCardType(state, controller, options, { excludeCardId = null } = {}) {
  const player = state?.players?.[controller];
  const tally = new Map(options.map((o) => [o, 0]));
  for (const c of [...(player?.hand || []), ...(player?.library || [])]) {
    if (excludeCardId != null && c?.id === excludeCardId) continue;
    const named = new Set();
    for (const face of String(c?.type || c?.type_line || "").split(" // ")) {
      if (/\bLand\b/.test(face)) continue;
      const words = face.split(/\s+/);
      for (const o of options) if (words.includes(o)) named.add(o);
    }
    for (const o of named) tally.set(o, tally.get(o) + 1);
  }
  let best = options[0];
  for (const o of options) if (tally.get(o) > tally.get(best)) best = o; // strict > keeps the earlier option on a tie
  return best;
}

/**
 * PROTECTION-COLOR auto-pick (Mother of Runes / Giver of Runes, SHELF-TAIL vein #3 — CR 702.16).
 * "Protection from the color of your choice" wants the color most likely to threaten the protected
 * creature: the MOST-REPRESENTED color among OPPONENTS' nonland permanents (each permanent counts once
 * per color it has — layers are not consulted; the printed colors are the defensible board read, and this
 * is a leaf module that must not import layers). WUBRG-order deterministic tiebreak; an empty read →
 * "W" (a legal color must be chosen — CR 601.2b — and the fixed fallback keeps replays byte-identical).
 * With `orColorless` (Giver's "from colorless or from the color of your choice"), colorless ("C") joins
 * the tally via opponents' colorless nonland permanents and can win it.
 * The same deliberately-dull discipline as autoPickCreatureType above: board-shaped, never payoff-tuned.
 */
/**
 * SYLVAN LIBRARY (SG-15b) — the autopilot's pay-or-put-back for ONE drawn card: pay L life iff the player
 * would keep at least 8 life afterwards (a deterministic buffer — cards are worth life while life is not
 * the constraint; never below L itself, CR 119.4). A human decides at the panel; this is the fallback only.
 */
/** TAINTED PACT (BI-2) fallback — take the exiled card iff it is a nonland (the pilot decides in the sim; this is the
 *  policy that fires only when no pilot answers). */
export function autoPickTaintedPactTake(state, controller, cardName, cardType) {
  return !/\bLand\b/i.test(String(cardType || ""));
}

export function autoPickSylvanLibraryPayment(state, controller, life) {
  const cur = state?.players?.[controller]?.life ?? 0;
  const l = Math.max(0, life || 0);
  return l > 0 && cur - l >= 8;
}

/**
 * TEMPTING OFFER auto-answer (Tempt with Discovery): the asked opponent accepts iff they have a land card to find AND
 * they control no more lands than the offerer — behind or level, a free land is worth the offerer's extra one;
 * ahead, refuse and deny the ramp. Board-shaped and deterministic (the same dull discipline as the other picks).
 */
export function autoPickTemptingOffer(state, pc) {
  const me = state?.players?.[pc?.controller];
  const offerer = state?.players?.[pc?.offerer];
  if (!me || !offerer) return false;
  const isLand = (c) => /\bLand\b/i.test(String(c?.type || c?.type_line || ""));
  const hasLand = (me.library || []).some(isLand);
  if (!hasLand) return false;
  const lands = (p) => (p.battlefield || []).filter((perm) => isLand(perm.card || {})).length;
  return lands(me) <= lands(offerer);
}

/**
 * The printed colors a permanent's card carries — the DEFAULT color read of autoPickProtectionColor below, for a direct call
 * on a board no color-changing effect touches. This module imports nothing, so it cannot read the layer engine itself.
 */
const printedPermanentColors = (perm) => {
  const card = perm?.card || perm;
  return Array.isArray(card?.colors) ? card.colors : [];
};

/**
 * PROTECTION-COLOR auto-pick (Mother of Runes / Giver of Runes — "the color of your choice"): the most-represented color
 * among OPPONENTS' nonland permanents, WUBRG tiebreak. `colorsOfPermanent(perm)` reads each permanent's colors; the engine's
 * caller (the grant-protection atom) passes the layer-aware read (layers.permanentColors — CR 613.1e), so a creature an
 * effect turned blue is tallied blue. The default is the printed read above.
 */
export function autoPickProtectionColor(state, controller, { orColorless = false, colorsOfPermanent = printedPermanentColors } = {}) {
  const tally = { W: 0, U: 0, B: 0, R: 0, G: 0, ...(orColorless ? { C: 0 } : {}) };
  for (const pid of Object.keys(state?.players || {})) {
    if (pid === controller) continue;
    for (const perm of state.players[pid]?.battlefield || []) {
      const card = perm.card || perm;
      const type = String(card?.type || card?.type_line || "");
      if (/\bLand\b/.test(type) && !/\bCreature\b/.test(type)) continue;
      const colors = colorsOfPermanent(perm) || [];
      if (colors.length === 0) { if (orColorless) tally.C += 1; continue; }
      for (const c of colors) if (c in tally) tally[c] += 1;
    }
  }
  let best = "W";
  let bestN = -1;
  for (const c of Object.keys(tally)) { // insertion order = WUBRG(+C) → deterministic tiebreak
    if (tally[c] > bestN) { best = c; bestN = tally[c]; }
  }
  return best;
}
