/**
 * effects/atoms/counterClauses.js — WAVE 3b COUNTERS-ON-EVENT clause parser.
 *
 * A PURE clause-parser export (`counterClausesParser`) wired into the additive parser seam
 * (parser.js: registerClauseParser, at the file bottom — done by the integrator). Per the leaf-DAG
 * discipline this module MUST NOT import effects/parser.js (that back-edge would TDZ-crash
 * CLAUSE_PARSERS at load); it exports a pure `(clause, ctx) => Atom | null` the integrator registers.
 *
 * THE GAP THIS CLOSES — the NON-SELF TRIGGERING-PERMANENT referent for a counter-put effect. The
 * inline parseExtendedAtom already models the SELF ("…on this creature", target:"self" → ctx.sourceId),
 * the chosen TARGET ("…on target creature[ you control]"), and the TEAM ("…on each creature you
 * control", scope:"youControl"). What stays LOW is the NON-SELF triggering referent:
 *
 *   "Whenever a creature you control deals combat damage to a player, put a +1/+1 counter on THAT
 *    CREATURE." (Sphere Grid)
 *   "Whenever a creature you control attacks, put a +1/+1 counter on IT."
 *
 * Here "that creature" / non-self "it" is the TRIGGERING permanent (CR 608.2c — a pronoun in later
 * text refers to the object the ability triggered on), NOT the source. The trigger flush threads it as
 * ctx.triggeringPermanentId
 * (triggers.makePendingTrigger). We emit an add-counter atom bound to a `target:"thatCreature"`
 * referent (NO targetType — so programNeedsChosenTarget stays false and it routes natively on the
 * non-targeted trigger path, never a chosen-target mis-pick). counters.applyAddCounter reads
 * ctx.triggeringPermanentId for it.
 *
 * CREED — the SENTINEL gate. A SPELL uses "it" / "that creature" ANAPHORICALLY (Big Play "Target
 * creature gets +2/+2 … Put a +1/+1 counter on it", Puncture Bolt "… Put a -1/-1 counter on that
 * creature", Miraculous Recovery) where the pronoun is the EARLIER target, NOT a triggering permanent —
 * binding those to ctx.triggeringPermanentId (undefined in a spell) would silently DROP the counter, a
 * FORBIDDEN false positive. The parser sees only the clause text (no trigger/spell context — gameEngine
 * even passes cardType "Instant" for a trigger's effect clause), so it CANNOT self-distinguish. The fix
 * mirrors the IT-COUNTER precedent: detectTriggers rewrites the NON-SELF triggering referent → the
 * canonical sentinel "the triggering creature" (gated to the non-self attacks / combat-damage scopes
 * where the referent is unambiguously the triggering permanent) BEFORE the clause reaches the parser.
 * This parser matches ONLY that sentinel — a phrase that appears in ZERO printed oracle text — so a raw
 * "on it" / "on that creature" in a SPELL never matches here and stays LOW → Arbiter (CREED-safe).
 *
 * Counter TYPE is restricted to +1/+1 and -1/-1, the ONLY kinds the engine fully enforces (layer-resolved
 * P/T + the lethal SBA on -1/-1). A stun/charge/etc. counter would LOOK native but do nothing (no enforced
 * replacement) — so any non-±1/±1 counter leaves this null → LOW → Arbiter. The amount auto-routes through
 * gameState.addCounter (the central doubler hook), so NO doubling is applied here.
 */

const SMALL_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

// Canonical sentinel emitted by detectTriggers' non-self triggering-referent rewrite (see triggers.js,
// near SELF_COUNTER_IT_RE): "put a/N +1/+1 (or -1/-1) counter(s) on the triggering creature". ANCHORED
// start-to-end — a rider / filter / non-±1/±1 counter leaves residue or fails the alternation → null →
// LOW. "the triggering creature" is NOT a printed-oracle phrase, so only the gated trigger rewrite
// produces it; a spell's raw "it" / "that creature" never reaches this matcher (CREED — sentinel gate).
const TRIGGERING_CREATURE_COUNTER = /^put (a|an|one|two|three|four|five|\d+) ([+-]1\/[+-]1) counters? on the triggering creature$/;

/**
 * Pure clause parser for the WAVE 3b non-self triggering-permanent counter referent. `clause` arrives
 * reminder-stripped from parseClauseToAtom; we lowercase + normalize the curly apostrophe for robustness.
 * Returns an add-counter atom bound to `target:"thatCreature"`, or null for anything outside the anchored
 * sentinel shape (CREED — never a fabricated / mis-bound counter on a spell's anaphoric pronoun).
 */
export function counterClausesParser(clause) {
  const t = String(clause).toLowerCase().replace(/[’]/g, "'").trim();
  const m = t.match(TRIGGERING_CREATURE_COUNTER);
  if (!m) return null;
  return {
    op: "add-counter",
    counterType: m[2],
    amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10),
    target: "thatCreature",
  };
}
