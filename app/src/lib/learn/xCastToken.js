/**
 * xCastToken.js — the X-cast token-maker commander trigger (Zaxara, the Exemplary):
 *   "Whenever you cast a spell with {X} in its mana cost, create a 0/0 green Hydra creature token,
 *    then put X +1/+1 counters on it."
 *
 * The general trigger compiler doesn't model this — detectTriggers AND parseEffectProgram both return
 * nothing for the "create a token, then put X +1/+1 counters" effect — so it's a TARGETED hook fired at
 * cast, reading the X chosen for the cast spell (threaded as the cast action's xValue) so the token
 * enters as a real X/X instead of a 0/0 that dies to the SBA. Self-contained: NO change to the
 * detectTriggers / parseEffectProgram core. Pure (returns a new state).
 */
import { applyCreateToken } from "./effects/effectAtoms.js";

const _NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

// "Whenever you cast a spell with {X} in its mana cost, create <count> <P>/<T> <color+subtype> creature
// token(s), then put X +1/+1 counters on it/them." Anchored to the whole templating so a different X-cast
// trigger (no token, or a non-X-counter rider) doesn't false-match.
const XCAST_TOKEN = /whenever you cast a spell with \{x\} in its mana cost, create (a|an|one|two|three|four|five|\d+) (\d+)\/(\d+) (.+?) creature tokens?, then put x \+1\/\+1 counters? on (?:it|them)/i;

/**
 * Parse a card's "cast a spell with {X} → make a token with X +1/+1 counters" trigger.
 * Returns { count, power, toughness, descriptor } or null. Reminder text is stripped first.
 */
export function parseXCastTokenTrigger(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "").replace(/\([^)]*\)/g, " ");
  const m = oracle.match(XCAST_TOKEN);
  if (!m) return null;
  const count = _NUM[m[1].toLowerCase()] ?? (parseInt(m[1], 10) || 1);
  return { count: Math.max(1, count), power: parseInt(m[2], 10) || 0, toughness: parseInt(m[3], 10) || 0, descriptor: m[4].trim() };
}

/** Does this spell's printed mana cost contain {X}? (the trigger condition — CR 107.3 / 601.2b). */
function spellHasX(spellCard) {
  return /\{x\}/i.test(String(spellCard?.mana ?? spellCard?.mana_cost ?? ""));
}

/**
 * At a cast of a spell with {X} (xValue = the chosen X), each of the caster's X-cast-token-maker
 * permanents creates its token(s) with X +1/+1 counters. Fired directly right after the cast triggers
 * flush — CR-correct timing (the trigger resolves above, and so before, the spell). A non-X cast (no
 * xValue) or a 0/0-with-no-X token is a no-op. Pure.
 */
export function applyXCastTokenTriggers(state, { spellCard, casterId, xValue }) {
  if (!(xValue > 0) || !spellHasX(spellCard)) return state;
  const player = state.players?.[casterId];
  if (!player) return state;
  let next = state;
  for (const perm of [...player.battlefield]) {
    const spec = parseXCastTokenTrigger(perm.card);
    if (!spec) continue;
    const atom = {
      op: "create-token",
      count: spec.count,
      power: spec.power,
      toughness: spec.toughness,
      descriptor: spec.descriptor,
      keywords: [],
      entersWithCounters: { type: "+1/+1", amount: xValue },
    };
    next = applyCreateToken(next, atom, { controller: casterId, xValue });
  }
  return next;
}
