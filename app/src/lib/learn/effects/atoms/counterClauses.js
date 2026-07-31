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

// COMBAT-DAMAGE-SCALED on the triggering creature (Necropolis Regent — "Whenever a creature you control deals
// combat damage to a player, put that many +1/+1 counters on it"). "that many" = the combat damage that creature
// just dealt (ctx.combatDamageAmount, threaded by triggers.checkCombatDamageTriggers); combatDamageReferentSatisfied
// gates this countContext to the combatDamageToPlayer/dealtDamage events, so a spell / non-combat trigger (absent
// referent → 0) is a clean no-op. The recipient is the TRIGGERING permanent (target:"thatCreature" →
// ctx.triggeringPermanentId), reached ONLY via detectTriggers' non-self rewrite to the sentinel "the triggering
// creature" (a phrase in ZERO printed oracle text) — a raw "on it" in a spell never matches here (CREED). +1/+1
// only (the enforced kind); anchored ^…$ so a rider leaves residue → null → LOW → Arbiter.
const TRIGGERING_CREATURE_COUNTER_CDMG = /^put that many (\+1\/\+1) counters? on the triggering creature$/;

// DOUBLE-COUNTERS (CR 121) — "double the number of +1/+1 counters on this creature" (Voracious Hydra's
// modal ETB; Primordial/Kalonian/Mossborn upkeep/attack/landfall doublers). Doubling = adding THIS-MANY
// more counters of the same kind, where the magnitude is read AT RESOLUTION off the SOURCE's live counter
// bag (countForSpec kind:"countersOnSource"). Modeled as a self-targeted add-counter with that dynamic
// count: the recipient is the ability's own permanent (target:"self" → ctx.sourceId, selfTargets), and the
// placement routes through addCounter's central doubler hook so an external counter-doubler (Doubling
// Season) further multiplies per CR 616. Restricted to +1/+1 (the only fully layer-enforced kind, mirroring
// the rest of this file); the recipient phrase is restricted to "this creature" (the source self-referent —
// "on each creature you control" is a DIFFERENT, board-wide doubling that this single-target atom can't
// model, so it stays LOW → Arbiter, an FN-safe park). Anchored start-to-end: a rider leaves residue → null.
const DOUBLE_COUNTERS_SELF = /^double the number of (\+1\/\+1) counters on this creature$/;

// DOUBLE-COUNTERS-EACH (CR 121 + 122.6) — the BOARD-WIDE form: "double the number of +1/+1 counters on EACH
// creature you control" (Kalonian Hydra's attack trigger; Bristly Bill, She-Hulk, Court of Garenbrig). Unlike
// the SELF double (one global amount read off the source), this doubles EACH creature's OWN counters — so it
// can't be a single countForSpec read; it's modeled as a youControl-scoped add-counter carrying a
// `perTargetDouble` marker, which counters.applyAddCounter resolves PER target (the amount added to a creature
// = that creature's current +1/+1 count, read pre-mutation, routed through addCounter's doubler hook so
// Doubling Season composes per target, CR 616). Restricted to +1/+1 (the only fully layer-enforced kind,
// mirroring the rest of this file). Anchored start-to-end: any rider leaves residue → null → LOW → Arbiter.
const DOUBLE_COUNTERS_EACH = /^double the number of (\+1\/\+1) counters on each creature you control$/;

// DOUBLE-COUNTERS-TRIGGERING (CR 121) — "Whenever a creature you control with a +1/+1 counter on it attacks,
// double the number of +1/+1 counters ON IT" (Byrke; Seismic Tutelage's enchanted-creature attack trigger).
// ⛔ THE SUBJECT IS THE TRIGGERING CREATURE, NOT THE SOURCE. Reusing DOUBLE_COUNTERS_SELF's shape here would
// have read the count off — and added it to — Byrke itself, doubling the wrong creature's counters on a card
// whose whole point is pumping the attacker. So this binds target:"thatCreature" and uses `perTargetDouble`
// (the field the board-wide form already carries): applyAddCounter computes the amount PER RECIPIENT off that
// recipient's own pre-mutation counter bag, which is exactly a double of the right permanent. countersOnSource
// would have been wrong for the same reason — it reads ctx.sourceId.
// Only the sentinel phrase detectTriggers writes ("on it" → "on the triggering creature", a string in ZERO
// printed oracle text), never a raw spell anaphor — the same CREED gate the sibling clauses above use.
// +1/+1 only (the enforced kind); anchored ^…$ so a rider leaves residue → null → LOW → Arbiter.
const DOUBLE_COUNTERS_TRIGGERING = /^double the number of (\+1\/\+1) counters on the triggering creature$/;

/**
 * Pure clause parser for the WAVE 3b non-self triggering-permanent counter referent. `clause` arrives
 * reminder-stripped from parseClauseToAtom; we lowercase + normalize the curly apostrophe for robustness.
 * Returns an add-counter atom bound to `target:"thatCreature"`, or null for anything outside the anchored
 * sentinel shape (CREED — never a fabricated / mis-bound counter on a spell's anaphoric pronoun).
 */
export function counterClausesParser(clause) {
  const t = String(clause).toLowerCase().replace(/[’]/g, "'").trim();
  const m = t.match(TRIGGERING_CREATURE_COUNTER);
  if (m) {
    return {
      op: "add-counter",
      counterType: m[2],
      amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10),
      target: "thatCreature",
    };
  }
  // COMBAT-DAMAGE-SCALED on the triggering creature (Necropolis Regent) — count = ctx.combatDamageAmount.
  const cdm = t.match(TRIGGERING_CREATURE_COUNTER_CDMG);
  if (cdm) {
    return {
      op: "add-counter",
      counterType: cdm[1],
      countContext: "combatDamageAmount",
      target: "thatCreature",
    };
  }
  // POWER-SCALED on the triggering creature (Railway Brawler — "Whenever another creature you control
  // enters, put X +1/+1 counters on it, where X is its power"): X = the ENTERING creature's live power,
  // read at resolution via countForSpec's triggeringCreaturePower (CR 608.2h — before these counters land).
  // Only the sentinel form detectTriggers writes (the "on it" → "on the triggering creature" rewrite),
  // never a raw spell anaphor. Anchored ^…$.
  if (/^put x \+1\/\+1 counters on the triggering creature, where x is its power$/.test(t)) {
    return {
      op: "add-counter",
      counterType: "+1/+1",
      target: "thatCreature",
      countFor: { kind: "triggeringCreaturePower" },
    };
  }
  // DOUBLE-COUNTERS — net-double the source's own +1/+1 counters via a self-targeted dynamic-count add.
  const dm = t.match(DOUBLE_COUNTERS_SELF);
  if (dm) {
    return {
      op: "add-counter",
      counterType: dm[1],
      target: "self",
      countFor: { kind: "countersOnSource", counterType: dm[1] },
    };
  }
  // DOUBLE-COUNTERS-TRIGGERING — net-double the TRIGGERING creature's own +1/+1 counters. perTargetDouble
  // (not countFor:countersOnSource) so the amount is read off the RECIPIENT, which here is not the source.
  const dtm = t.match(DOUBLE_COUNTERS_TRIGGERING);
  if (dtm) {
    return {
      op: "add-counter",
      counterType: dtm[1],
      target: "thatCreature",
      perTargetDouble: dtm[1],
    };
  }
  // DOUBLE-COUNTERS-EACH — board-wide: net-double EVERY creature-you-control's OWN +1/+1 counters. The
  // youControl scope gathers the controller's creatures at resolution; perTargetDouble tells applyAddCounter
  // to add each one's current +1/+1 count to ITSELF (a per-target double, never a single global amount).
  const dem = t.match(DOUBLE_COUNTERS_EACH);
  if (dem) {
    return {
      op: "add-counter",
      counterType: dem[1],
      scope: "youControl",
      perTargetDouble: dem[1],
    };
  }
  return null;
}
