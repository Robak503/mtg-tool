/**
 * exertAttack.js — EXERT AS IT ATTACKS (CR 701.43, 508.1g; the play-weighted program, #1007 — Combat Celebrant).
 *
 *   "If this creature hasn't been exerted this turn, you may exert it as it attacks. When you do, <effect>."   (Combat Celebrant)
 *   "You may exert this creature as it attacks. When you do, <effect>."                                       (the Amonkhet template)
 *
 * "You may exert [this creature] as it attacks" is an optional cost to attack (CR 701.43d, 508.1g): chosen as the creature is declared
 * an attacker, never later in combat, and never for a creature put onto the battlefield attacking (its ruling). Exerting it means it
 * won't untap during its controller's next untap step (CR 701.43a — the exerting player's: `doesNotUntapNext` names that player, the
 * Arena of Glory lane in gameState.untapAll). The "When you do" ability printed in the same paragraph is linked to it (CR 701.43d,
 * 607.2h): it triggers as the creature is exerted and goes on the stack with the attack triggers, before blockers are declared (the
 * rulings) — closeAttackDeclaration enqueues it from the declared batch (exertAttackTriggers), so an "untap all other creatures you
 * control" untaps them after every attacker is declared, still attacking (CR 506.4).
 *
 * The OFFER (legalChoices.actionsDeclareAttacker): beside each attack of such a creature, the same attack with `exert: true` — for
 * Celebrant only while it hasn't been exerted this turn (`exertedTurn`). The DISPATCHER re-checks it (actionDispatcher.applyDeclareAttacker),
 * stamps the creature and its attacker entry. The card's text is read through the ability view (a creature that lost its abilities can't
 * exert) over its copiable values (a permanent that became a copy reads the copied card).
 *
 * A leaf over gameState, layers and triggerRouting (whose closure reaches none of this module's importers).
 */
import { findPermanent } from "./gameState.js";
import { withAbilityLoss, boardHasAbilityLoss, copiableBaseOf, boardHasCopyEffect } from "./layers.js";
import { triggerRoutesNatively } from "./triggerRouting.js"; // the classifier's routing test (its closure reaches no importer of this module)

const REMINDER_RE = /\s*\([^)]*\)/g;
const CELEBRANT_RE = /^If this creature hasn't been exerted this turn, you may exert it as it attacks\. When you do, (.+?)\.$/;
const TEMPLATE_RE = /^You may exert (.+?) as it attacks\. When you do, (.+?)\.$/;

/**
 * The exert line of `card`, or null: `{ onceEachTurn, effectClause, line }`. `onceEachTurn` — Celebrant's "If this creature hasn't been
 * exerted this turn". The template's subject must be the card itself ("this creature", or its name). The exact printed line, its reminder
 * text dropped; one exert line only.
 */
export function exertAttackSpec(card) {
  const name = String(card?.name || "").split(" // ")[0];
  const lines = String(card?.oracle ?? card?.oracle_text ?? "").replace(/[’]/g, "'").split("\n");
  let found = null;
  for (const raw of lines) {
    const line = raw.replace(REMINDER_RE, "").trim();
    let m = CELEBRANT_RE.exec(line);
    let spec = m ? { onceEachTurn: true, effectClause: m[1], line: raw } : null;
    if (!spec && (m = TEMPLATE_RE.exec(line)) && (m[1] === "this creature" || (name && m[1] === name))) spec = { onceEachTurn: false, effectClause: m[2], line: raw };
    if (!spec) continue;
    if (found) return null; // two exert lines — not a printed shape this reads
    found = spec;
  }
  return found;
}

/**
 * Does the exert line's linked "When you do" ability route natively (triggerRouting.triggerRoutesNatively over exertDescriptor — the
 * classifier's own test, coverage.js)? An exert whose payoff the engine can't play is never offered: paying the cost (CR 701.43a) for an
 * ability that then does nothing is the false positive the review of pw24 found (F1 — Khenra Scrapper's "it gets +2/+0"). Memoized per
 * effect text (the routing test is pure in it).
 */
const _routesMemo = new Map();
export function exertLinkedAbilityRoutes(spec) {
  if (!spec) return false;
  const key = spec.effectClause;
  if (!_routesMemo.has(key)) _routesMemo.set(key, triggerRoutesNatively(exertDescriptor(spec)));
  return _routesMemo.get(key);
}

/**
 * The exert line of a permanent as it is now — its copiable values (CR 707.2), through the ability view (CR 613.1f) — when its linked
 * ability is one the engine plays (exertLinkedAbilityRoutes); null otherwise. The offer, the dispatcher's check and the declaration's
 * trigger all read this, so an unplayable exert is never offered, accepted or triggered.
 */
export function permanentExertSpec(state, perm) {
  if (!perm) return null;
  const base = boardHasCopyEffect(state) ? copiableBaseOf(state, perm)?.card ?? perm.card : perm.card;
  const spec = exertAttackSpec(boardHasAbilityLoss(state) ? withAbilityLoss(state, perm, base) : base);
  return spec && exertLinkedAbilityRoutes(spec) ? spec : null;
}

/** May `perm` be exerted as it is declared an attacker now? Its exert line, and for Celebrant's not already this turn. */
export function canExertAsItAttacks(state, perm) {
  const spec = permanentExertSpec(state, perm);
  if (!spec) return false;
  return !(spec.onceEachTurn && perm.exertedTurn === (state.turn || 0));
}

/** The linked "When you do" ability, as a trigger descriptor the trigger flush resolves like any printed one (CR 701.43d). */
export function exertDescriptor(spec) {
  return { event: "exerted", scope: "self", whose: "any", effect: null, effectClause: spec.effectClause, optional: false, interveningIf: null,
    effectHasX: false, sourceText: `When you do, ${spec.effectClause}.` };
}

/**
 * The declared batch's exerted attackers each trigger their linked ability (closeAttackDeclaration — beside the attack triggers, before
 * blockers). The creature must still be on the battlefield with its exert line; its controller controls the ability.
 */
export function exertAttackTriggers(state) {
  const fired = [];
  for (const rec of state?.combat?.attackers || []) {
    if (!rec?.exerted) continue;
    const found = findPermanent(state, rec.permanentId);
    if (!found) continue;
    const spec = permanentExertSpec(state, found.permanent);
    if (!spec) continue;
    const perm = found.permanent;
    const context = { triggeringPermanentId: perm.id, triggeringCardName: perm.card?.name, sourcePermanentId: perm.id, defenderId: rec.defender ?? null };
    fired.push({
      event: "exerted",
      source: { permanentId: perm.id, cardId: perm.card?.id ?? null, name: perm.card?.name ?? null },
      controller: found.controller,
      descriptor: exertDescriptor(spec),
      context,
      targets: [],
      optional: false,
      payload: { resolver: "manual", params: { controller: found.controller, targets: [], context, sourcePermanentId: perm.id } },
    });
  }
  return fired.length ? { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] } : state;
}
