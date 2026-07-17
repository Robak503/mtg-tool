/**
 * effects/atoms/roll.js — DICE-ROLL primitive (CR 726, "Rolling a Die") + the result-scaled payoff seam.
 *
 * Models "roll a d20" (the Forgotten Realms / Companion-era dice mechanic) as a two-atom sequence the
 * existing dynamic-count payoff machinery scales off of:
 *
 *   [ {op:"roll-d20"},  {op:"create-token"/"create-named-token"/"draw", countFor/amountCount:{kind:"diceResult"}} ]
 *
 * THE SEQUENCE CONTRACT: the `roll-d20` atom picks a uniform 1–20 result via the engine's THREADED
 * deterministic PRNG (state.rngSeed — the SAME seam shuffleControllerLibrary uses; NO Math.random, so a
 * game serialized mid-resolution restores byte-identical) and stamps it on `state.diceRoll`. The FOLLOWING
 * payoff atom's count source `{kind:"diceResult"}` reads `state.diceRoll` at resolution (countForSpec), so
 * the scaled amount (tokens / cards) IS the rolled value. The parser GATES `diceResult` to a clause that
 * directly follows a `roll-d20` in the same program (see parser assembly), so a `diceResult` read can never
 * occur without its roll first writing the value — and the value is overwritten by the next roll, never
 * read stale. CREED: a missing roll → 0 (a clean no-op, never a fabricated count).
 *
 * CIRCULAR-IMPORT HAZARD (Wave-0): this module must NOT import from effects/parser.js (parser.js imports the
 * atoms barrel → importing parser back is a load-time TDZ cycle). It exports pure clause parsers referencing
 * only the leaf helpers; the integrator wires registerClauseParser at parser.js-bottom.
 */

import { logEvent } from "../../gameState.js";
import { parseCountSource } from "../parseHelpers.js";
import { nextRandomInt } from "../../seedMath.js"; // THE canonical seeded single-integer draw (leaf; no cycle)

// CR 726 — a "d20" is a twenty-sided die; rolling it yields a uniform integer result in [1, 20].
const D20_SIDES = 20;

/**
 * ROLL-D20 (CR 726.2-726.4) — pick a uniform result in [1, sides] from the threaded seed via the canonical
 * nextRandomInt primitive (which reads state.rngSeed, maps ONE mulberry32 output into [0, sides), and ADVANCES
 * the seed by the shared LCG step so consecutive rolls differ AND a serialized game restores to byte-identical
 * future rolls) — then stamp the result on `state.diceRoll` for the following payoff atom to read. Drawing
 * through nextRandomInt keeps the die on the SAME serialize-stable seam as every other in-game random draw
 * (no Math.random anywhere in game-state mutation); the result is byte-identical to the pre-primitive inline
 * draw (nextRandomInt's mulberry32 + LCG step are the exact ops this atom used to inline). The roll resolves
 * for `ctx.controller` (CR 726.2a — "you roll"). Pure + serialize-safe (state.diceRoll is a plain number).
 *
 * `atom.sides` defaults to 20 (the only printed die for these cards); a non-20 die would be a future slice.
 */
export function applyRollDie(state, atom, ctx) {
  const sides = atom.sides || D20_SIDES;
  // Uniform [1, sides]: nextRandomInt returns [0, sides-1]; +1 shifts to [1, sides]. The returned state
  // carries the advanced seed (the single source of the seed-advance discipline).
  const { value, state: advanced } = nextRandomInt(state, sides);
  const result = value + 1;
  const next = { ...advanced, diceRoll: result };
  return logEvent(next, { kind: "spell-effect", effect: "roll-die", sides, result, controller: ctx.controller });
}

export const rollResolvers = { "roll-d20": applyRollDie };

// ─── Clause parsers (pure; wired via registerClauseParser by the integrator / in-test) ───────────────

/**
 * ROLL-D20 clause parser — the bare "roll a d20" sentence (its own clause after the multi-clause split).
 * ANCHORED whole-clause: any qualified form ("roll two d20s", "roll a d20. If you roll…", a non-d20 die)
 * leaves residue / a different shape → no match → the whole program stays LOW → Arbiter (CREED — a die
 * mechanic we don't fully model never half-resolves). The result-bucket "If you roll N–M" forms (the
 * Forgotten Realms outcome tables) are deliberately NOT matched here — only the SCALED-result payoffs
 * (Ancient Dragons: "create/draw … equal to the result") are modeled, via the diceResult count source.
 */
export function rollDieClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'").trim().replace(/\.$/, "");
  if (/^roll a d20$/.test(t)) return { op: "roll-d20", sides: 20, targetType: null };
  return null;
}

/**
 * RESULT-SCALED payoff clause parser — the count-scaled effects whose amount is "the result" of a just-rolled
 * d20 (Ancient Gold/Copper Dragon tokens, Ancient Silver Dragon draw). The count source is the dice result
 * (kind:"diceResult" via parseCountSource's "the result" form), resolved at resolution from state.diceRoll.
 * Two shapes, original-text order:
 *   (a) "you create a number of <P/T> <descriptor> creature tokens [with KW] equal to the result"   (Gold)
 *   (b) "you create a number of <Treasure|Clue|Food|Gold> tokens equal to the result"               (Copper)
 *   (c) "draw cards equal to the result"                                                             (Silver)
 * Token shapes route through the SAME typed/named token atoms (createTokenClauseParser / createNamedToken-
 * ClauseParser families) by reusing parseCountSource; here we emit the atom directly with countFor/amountCount
 * set to the diceResult spec. CREED: a toughness<1 token or a LAND creature token → null (the token would die
 * to the lethal SBA / its intrinsic mana would drop) → low → Arbiter. An unrecognized token descriptor /
 * keyword (the typed-token guards) → null. Whole-clause anchored: any rider fails the `$` → low. Pure; uses
 * the parseCountSource + parseTokenKeywords leaves.
 */
export function resultScaledPayoffClauseParser(clause, _ctx, helpers = {}) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'").trim().replace(/\.$/, "");
  const diceSrc = parseCountSource("the result");
  if (!diceSrc) return null; // defensive — parseCountSource models "the result" (added alongside this slice)

  // (c) draw — "draw cards equal to the result" (Ancient Silver Dragon).
  if (/^(?:you )?draw cards equal to the result$/.test(t)) {
    return { op: "draw", amountCount: { ...diceSrc, per: 1 }, targetType: null };
  }

  // (b) named artifact token — "you create a number of <Treasure|Clue|Food|Gold> tokens equal to the result"
  // (Ancient Copper Dragon). Reuses the create-named-token atom's countFor path (countForSpec → diceResult).
  let m = t.match(/^(?:you )?create a number of (treasure|clue|food|gold) tokens equal to the result$/);
  if (m) return { op: "create-named-token", token: m[1], countFor: diceSrc, targetType: null };

  // (a) typed creature token — "you create a number of <P/T> <descriptor> creature tokens [with <KW>] equal
  // to the result" (Ancient Gold Dragon: "1/1 blue Faerie Dragon creature tokens with flying"). Mirrors
  // createTokenClauseParser's guards (toughness<1 / LAND → null) and keyword handling.
  m = t.match(/^(?:you )?create a number of (\d+)\/(\d+) ([a-z/ ]+?) creature tokens(?: with (.+?))? equal to the result$/);
  if (m) {
    const power = parseInt(m[1], 10);
    const toughness = parseInt(m[2], 10);
    if (toughness < 1) return null;            // a 0-toughness token dies to the lethal SBA → incomplete → Arbiter
    if (/\bland\b/.test(m[3])) return null;    // a LAND creature token's intrinsic mana would be dropped → Arbiter
    const atom = { op: "create-token", power, toughness, descriptor: m[3].trim(), countFor: diceSrc, targetType: null };
    if (m[4] !== undefined) {
      // Only the keyword form is in scope here (the dragons' "with flying"); a quoted inline ability would
      // need the typed-token ability path — not printed on a result-scaled token, so reject it → Arbiter.
      const parseTokenKeywords = helpers.parseTokenKeywords;
      const kws = parseTokenKeywords ? parseTokenKeywords(m[4]) : null;
      if (!kws) return null;
      atom.keywords = kws;
    }
    return atom;
  }
  return null;
}
