/**
 * attackRequirements.js — ATTACK REQUIREMENTS (CR 508.1d): the one check every seat's attack declaration goes through.
 *
 * CR 508.1d: the active player checks each creature for requirements ("attacks if able", "attacks a player other than X
 * if able"); a declaration that obeys fewer than the maximum possible number of requirements without disobeying a
 * restriction is illegal, and the player is never required to pay a cost to obey one. Read here:
 *   · "attacks each combat if able" — a printed self requirement (selfMustAttack, less its "unless" release), the layer-6
 *     `mustAttack` grant (an Aura, goad, Kardur, Doomscourge's rule) or a forced-attack turn (Bident of Thassa);
 *   · "attacks a player other than X if able" — goad (CR 701.15b–d) and Kardur's rule, one X per requirement
 *     (layers.attackOtherThanRequirementsOf). A planeswalker is not a player, so an attack on one obeys none of them.
 *
 * The engine takes the declaration one attacker at a time (legalChoices offers each (creature, defender) pair). The
 * requirements are kept there, for every seat, by offering only what a legal declaration can contain:
 *   · obeyingAttackOptions — a creature's defenders, narrowed to those that obey the most of its "other than" requirements.
 *     An option that costs mana (an attack tax, CR 508.1h) never raises the bar — its controller isn't forced to pay
 *     (CR 508.1d; the goad rulings) — but stays offered when it obeys as many as the best free one;
 *   · requiredAttackerIds — the creatures that must still be declared: a live "attacks each combat if able" and at least
 *     one offered attack that costs nothing. While any remains, the declaration can't close (legalChoices withholds the
 *     pass and every other action), and under a "no more than N creatures can attack" cap the slots go to them first.
 * Requirements are additive and each creature's defender choice is independent of the others' (no modelled restriction
 * ties one creature's defender to another's), so narrowing creature by creature never forbids a legal declaration.
 * Known under-enforcement (a safe miss, never a false refusal): a required creature that isn't offered yet ("can't attack
 * alone", until a teammate is declared) does not hold the declaration open, and under a cap the required creatures are
 * not ranked against each other by how many requirements each obeys.
 *
 * The AI's attack planner (opponentAI.pickAttackPlan) reads the same functions.
 */
import { permanentHasKeyword, attackOtherThanRequirementsOf } from "./layers.js";
import { mustAttackUnlessOf, controllerMeetsBoardPredicate } from "./combatEvasion.js";
import { attackTaxDetail } from "./attackTax.js";
import { opponentsOf } from "./gameState.js";

// MUST-ATTACK (subsystem 4, CR 508.1a) — does THIS card carry a self "attacks each combat/turn if able"
// requirement? Normalize the card name → "this creature" (so "Crazed Goblin attacks each combat if able"
// matches), then require the bare self subject — a GROUP form ("creatures you control attack…", "each
// creature attacks…", "attacking creatures…") is excluded (it's not a self requirement on this permanent).
export function selfMustAttack(card) {
  const o = String(card?.oracle || card?.oracle_text || "");
  if (!/attacks each (?:combat|turn) if able/i.test(o)) return false;
  // ATTACK-RESTRICTION RIDER (skeptic-flagged): a must-attacker that ALSO carries a "can't attack …"
  // restriction (Xantcha "…can't attack its owner…", Alexios) would be force-declared at a target the
  // restriction forbids — the offer models no such per-player restriction. Don't force those (the pre-slice
  // status quo for them; an under-enforced requirement is the safe direction, a forbidden attack is not).
  if (/can't attack/i.test(o)) return false;
  const name = String(card?.name || "").split(" //")[0].trim();
  let t = name ? o.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "this creature") : o;
  // LEGENDARY SHORT NAME: a comma-carrying legend self-references by its pre-comma short name ("Toski
  // attacks each combat if able" on "Toski, Bearer of Secrets") — normalize that form too, mirroring
  // coverage.isKeywordOnly so recognition and ENFORCEMENT flip together (the subsystem's own both-halves
  // rule). The group forms stay excluded (plural "attack" never matches the singular anchor).
  const shortName = name.split(",")[0].trim();
  if (shortName && shortName !== name) t = t.replace(new RegExp(`\\b${shortName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), "this creature");
  return /\bthis creature attacks each (?:combat|turn) if able\b/i.test(t);
}

/**
 * Does `permanent` (controlled by `seat`) have to attack this combat if able? FORCED-ATTACK (CR 508.1a): an external
 * turn-scoped requirement on the whole seat (Bident of Thassa — forcedToAttackTurn, self-expiring by the turn compare);
 * GRANTED (the layer-6 `mustAttack` — Bloodshed Fever, goad, Kardur's rule), read layer-aware so it lifts when its
 * source goes; PRINTED (selfMustAttack), released while its "unless you control <predicate>" holds (CR 508.1d — Reckless
 * Cohort, Marauding Maulhorn). The granted form has no unless: no Aura in the corpus grants a conditional requirement.
 */
export function mustAttackNow(state, seat, permanent) {
  if ((state.forcedToAttackTurn || {})[seat] === state.turn) return true;
  if (!permanent) return false;
  if (permanentHasKeyword(state, permanent.id, "mustAttack")) return true;
  // "ATTACKS THIS COMBAT IF ABLE" (Legion Warboss, Howlsquad Heavy — the created token's stamp, applyCreateToken): a requirement
  // for the one combat it names, by its place in the turn (gameEngine's combatsThisTurn tally). An additional combat later in
  // the turn is another combat and carries no requirement from it.
  const stamp = permanent.mustAttackCombat;
  if (stamp && stamp.turn === state.turn && state.combatsThisTurn?.turn === state.turn && state.combatsThisTurn.count === stamp.combat) return true;
  if (!selfMustAttack(permanent.card)) return false;
  const unless = mustAttackUnlessOf(permanent.card);
  return !(unless && controllerMeetsBoardPredicate(state, seat, permanent.id, unless));
}

/** The defending player an attack option names (a lone opponent's option carries none — the dispatcher fills it, CR 506.2). */
function defenderOf(state, seat, option) {
  return option.defenderId || opponentsOf(state, seat)[0];
}

/**
 * Can a creature attack `defenderId` — or, with `defenderPlaneswalkerId`, that planeswalker they control — without paying an
 * attack tax (CR 508.1h)? Per target: a "can't attack you" tax leaves the planeswalker free (attackTax.attackTaxDetail).
 */
export function attackCostsNothing(state, defenderId, defenderPlaneswalkerId = null) {
  const detail = attackTaxDetail(state, defenderId, defenderPlaneswalkerId);
  return detail.generic <= 0 && detail.phyrexian.length === 0;
}

/** How many of `otherThan` ("attacks a player other than X") an attack on `option` obeys: none at a planeswalker. */
function otherThanObeyed(otherThan, option, defender) {
  if (option.defenderPlaneswalkerId) return 0;
  let n = 0;
  for (const x of otherThan) if (x !== defender) n++;
  return n;
}

/**
 * The attack options (actions or targets: { defenderId?, defenderPlaneswalkerId? }) of the creature `permanentId`,
 * narrowed to those a legal declaration may use: the ones obeying the most of its "attacks a player other than X"
 * requirements that any option costing nothing obeys. A creature with no such requirement, or whose every option costs
 * mana, keeps every option. Order is kept.
 */
export function obeyingAttackOptions(state, seat, permanentId, options) {
  if (!Array.isArray(options) || options.length <= 1) return options;
  const otherThan = attackOtherThanRequirementsOf(state, permanentId);
  if (otherThan.length === 0) return options;
  const free = new Map();
  const costsNothing = (d, o) => {
    const key = `${d}${o.defenderPlaneswalkerId ? ":planeswalker" : ""}`; // the tax reads the target kind, never which walker
    if (!free.has(key)) free.set(key, attackCostsNothing(state, d, o.defenderPlaneswalkerId));
    return free.get(key);
  };
  let most = -1;
  for (const o of options) {
    const d = defenderOf(state, seat, o);
    if (costsNothing(d, o)) most = Math.max(most, otherThanObeyed(otherThan, o, d));
  }
  if (most < 0) return options;
  return options.filter((o) => otherThanObeyed(otherThan, o, defenderOf(state, seat, o)) >= most);
}

/**
 * The creatures among `attackActions` (offered declare-attacker actions) that must still be declared: a live
 * "attacks each combat if able" (mustAttackNow) and at least one offered attack that costs nothing. Returns a Set of
 * permanent ids.
 */
export function requiredAttackerIds(state, seat, attackActions) {
  const out = new Set();
  const byPermanent = new Map();
  for (const a of attackActions || []) {
    if (a?.kind !== "declare-attacker") continue;
    if (!byPermanent.has(a.permanentId)) byPermanent.set(a.permanentId, []);
    byPermanent.get(a.permanentId).push(a);
  }
  const battlefield = state.players?.[seat]?.battlefield || [];
  for (const [id, opts] of byPermanent) {
    if (!mustAttackNow(state, seat, battlefield.find((p) => p.id === id))) continue;
    if (opts.some((o) => attackCostsNothing(state, defenderOf(state, seat, o), o.defenderPlaneswalkerId))) out.add(id);
  }
  return out;
}

/**
 * The declaration's offer after the requirements: `actions` (this seat's declare-attacker actions, each creature's
 * defenders already narrowed by obeyingAttackOptions) and the creatures still owed (`required`). Under an attack cap
 * (`cap` — "no more than N creatures can attack each combat"; `declaredCount` already declared) with no more slots left
 * than owed creatures, only the owed creatures are offered: a slot spent on any other creature obeys fewer requirements
 * (the CR 508.1d example).
 */
export function attackDeclarationOffer(state, seat, actions, { cap = null, declaredCount = 0 } = {}) {
  const required = requiredAttackerIds(state, seat, actions);
  if (cap != null && required.size > 0 && required.size >= cap - declaredCount) {
    return { actions: actions.filter((a) => required.has(a.permanentId)), required };
  }
  return { actions, required };
}
