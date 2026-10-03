/**
 * tokenLoopLine.js — the AI's COMBO LINE for a self-scaling token loop (2026-10-03).
 *
 * THE RULE (Colton, 2026-10-03): a combo deck plays to ITS line, not to a generic board evaluation —
 *   1. build the resource only until there is ENOUGH to complete the finish, never "infinite";
 *   2. then forgo every other choice;
 *   3. then execute the finish.
 *
 * THE CASE THAT FORCED IT: The Unbeatable Squirrel Girl ("{1}{G}{G}{G}: Create X 1/1 green Squirrel creature
 * tokens, where X is the number of Squirrels you control") beside a creatures-tap-for-mana effect. The default
 * AI activated the ability in response to its own copy — 59 on the stack, X read on resolution — and kept
 * doubling while it already held lethal; the board reached 1,500+ permanents, every decision slowed, and
 * 26% of her self-play games never returned.
 *
 * THE LINE THIS LEAF KNOWS (slice one): the loop makes creature tokens, the finish is the swing.
 *   - the LOOP is an activated ability whose only cost is mana and whose only effect is "create <N> creature
 *     tokens" with N counted off the permanents its controller has (it feeds itself);
 *   - ENOUGH NOW (own turn, before attackers are declared) = the creatures that can attack this turn kill
 *     EVERY living opponent at once through all their untapped creatures;
 *   - ENOUGH FOR NEXT TURN (any other time, or when the tokens cannot attack yet) = every creature the seat
 *     controls would do that twice over against every creature the opponents control;
 *   - the FINISH is one combat that splits the attackers across all opponents.
 * Other finishes (a sacrifice outlet, a tutor for the finisher) are later slices.
 *
 * EVERYTHING HERE IS RESTRAINT OR TARGET CHOICE over actions the engine already offered: it declines an
 * activation, passes priority, or picks which opponent an offered attacker attacks. It never adds an action.
 * A seat with no loop ability gets `null` from tokenLoopState and plays exactly as before.
 *
 * Pure reads of game state. Imports the ability parser and the layer reads; nothing imports it but opponentAI.
 */
import { parseActivatedAbilities } from "./effects/abilities.js";
import { opponentsOf } from "./gameState.js";
import { permanentIsCreature, permanentPower, permanentHasKeyword, summoningSickNow, goaderControllersOf } from "./layers.js";

/** How many times over the board must be lethal before the loop stops when the swing is a turn away. */
export const NEXT_TURN_MARGIN = 2;

/** A parsed activated ability that is the loop: mana is the whole cost, a self-counted creature token the whole effect. */
export function isTokenLoopAbility(ability) {
  if (!ability || !ability.modeled || !ability.costModeled) return false;
  if (!ability.manaPips) return false;
  if (ability.tapSelf || ability.sacSelf || ability.exileSelf || ability.costX || ability.discardRandom) return false;
  if (ability.payLife || ability.payEnergy || ability.discardCard) return false;
  if (ability.sacOther != null || ability.sacCount != null || ability.sacX != null || ability.removeCounter != null
    || ability.tapCreature != null || ability.exileGyCount != null || ability.discardCardFilter != null
    || ability.returnLand != null || ability.unattachEquipment != null) return false;
  if (ability.activationLimit != null || ability.condition != null) return false;
  const program = ability.program;
  if (!program || program.confidence !== "high" || program.structure !== "sequence") return false;
  const atoms = program.atoms || [];
  if (atoms.length !== 1) return false;
  const atom = atoms[0];
  return atom.op === "create-token" && typeof atom.power === "number" && typeof atom.toughness === "number"
    && atom.countFor?.kind === "permanentsYouControl";
}

/** Map(permanentId → Set(abilityIndex)) of the loop abilities on the seat's battlefield; empty for nearly every seat. */
export function tokenLoopSources(state, playerId) {
  const sources = new Map();
  for (const perm of state?.players?.[playerId]?.battlefield || []) {
    const card = perm.card;
    if (!card || card.token) continue;
    const oracle = String(card.oracle || card.oracle_text || "");
    if (!/create/i.test(oracle) || !oracle.includes(":")) continue; // cheap gate before the parse
    const indexes = parseActivatedAbilities(card).filter(isTokenLoopAbility).map((a) => a.index);
    if (indexes.length) sources.set(perm.id, new Set(indexes));
  }
  return sources;
}

const livingOpponents = (state, playerId) => opponentsOf(state, playerId).filter((id) => (state.players?.[id]?.life ?? 0) > 0);

/** Per living opponent: its life and how many creatures could block — the untapped ones now, all of them a turn from now. */
export function swingNeeds(state, playerId, { nextTurn = false } = {}) {
  return livingOpponents(state, playerId).map((id) => {
    const creatures = (state.players[id].battlefield || []).filter((p) => permanentIsCreature(state, p.id));
    return { id, life: state.players[id].life, blockers: (nextTurn ? creatures : creatures.filter((p) => !p.tapped)).length };
  });
}

const barredFromAttacking = (state, perm) =>
  (permanentHasKeyword(state, perm.id, "Defender") && !permanentHasKeyword(state, perm.id, "attacksIgnoringDefender"))
  || permanentHasKeyword(state, perm.id, "cantAttack");

/** The seat's attackers as { id, power }: the ones able to attack THIS turn, or (nextTurn) every creature it controls. */
export function swingAttackers(state, playerId, { nextTurn = false } = {}) {
  const out = [];
  for (const perm of state?.players?.[playerId]?.battlefield || []) {
    if (!permanentIsCreature(state, perm.id) || barredFromAttacking(state, perm)) continue;
    if (!nextTurn) {
      if (perm.tapped) continue;
      if ((perm.summoningSick || summoningSickNow(state, perm)) && !permanentHasKeyword(state, perm.id, "Haste")) continue;
    }
    out.push({ id: perm.id, power: Math.max(0, permanentPower(state, perm.id) ?? 0) });
  }
  return out;
}

const byPowerThenId = (a, b) => (b.power - a.power) || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
const needOrder = (a, b) => ((a.life + a.blockers) - (b.life + b.blockers)) || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);

/** Damage that gets through when the defender's `blockers` creatures each stop the biggest attacker they can. */
function unavoidableDamage(powers, blockers) {
  const sorted = powers.slice().sort((a, b) => b - a);
  return sorted.slice(blockers).reduce((sum, p) => sum + p, 0);
}

/**
 * Split `attackers` ({ id, power }) across `needs` so every opponent takes lethal, `times` over.
 * `committed` = Map(opponentId → [power]) already attacking. Opponents are filled in order of life + blockers,
 * biggest attackers first. Returns Map(attackerId → opponentId) for the attackers it used, or null when the
 * attackers cannot kill everyone.
 */
export function splitLethal(attackers, needs, { committed = new Map(), times = 1 } = {}) {
  if (!needs.length) return null;
  const pool = attackers.slice().sort(byPowerThenId);
  const assignment = new Map();
  let next = 0;
  for (const need of needs.slice().sort(needOrder)) {
    const powers = [...(committed.get(need.id) || [])];
    while (unavoidableDamage(powers, need.blockers) < need.life * times) {
      if (next >= pool.length) return null;
      const attacker = pool[next++];
      powers.push(attacker.power);
      assignment.set(attacker.id, need.id);
    }
  }
  return assignment;
}

/** Is the seat's own activation of a loop ability still on the stack? (X is read on resolution — let it resolve.) */
function ownLoopActivationOnStack(state, playerId, sources) {
  return (state.stack || []).some((obj) => obj?.kind === "activated-ability" && obj.controller === playerId
    && sources.has(obj.payload?.params?.sourceId));
}

const beforeAttackers = (state, playerId) => state.activePlayer === playerId
  && (state.phase === "precombat-main" || state.step === "beginning-of-combat");

/**
 * The seat's loop line right now, or null when it controls no loop ability (then nothing in the AI changes).
 *   sources      — Map(permanentId → Set(abilityIndex)), the loop abilities
 *   finishNow    — own turn before attackers and the creatures that can attack kill every opponent: go to combat
 *   holdLoop     — do not activate the loop now (its copy is on the stack, the seat's attack is under way, or
 *                  there is already enough)
 */
export function tokenLoopState(state, playerId) {
  const sources = tokenLoopSources(state, playerId);
  if (sources.size === 0) return null;
  const canSwingNow = beforeAttackers(state, playerId);
  const finishNow = canSwingNow
    && splitLethal(swingAttackers(state, playerId), swingNeeds(state, playerId)) !== null;
  const enoughNextTurn = splitLethal(
    swingAttackers(state, playerId, { nextTurn: true }),
    swingNeeds(state, playerId, { nextTurn: true }),
    { times: NEXT_TURN_MARGIN },
  ) !== null;
  // Its own attack is under way: the swing is the line now, and more tokens (they cannot join it) are not part of it.
  const swinging = state.activePlayer === playerId
    && (state.combat?.attackers || []).some((a) => a.attackingPlayer === playerId);
  const holdLoop = ownLoopActivationOnStack(state, playerId, sources) || finishNow || swinging || enoughNextTurn;
  return { sources, finishNow, holdLoop };
}

/** Is this offered activate-ability action one of the seat's loop abilities? */
export function isTokenLoopAction(loop, action) {
  return !!loop && action?.kind === "activate-ability" && !!loop.sources.get(action.permanentId)?.has(action.abilityIndex);
}

/**
 * THE FINISH — the declare-attackers plan that kills every opponent in one combat, or null (then the caller's
 * ordinary plan stands). Used only by a seat with a loop ability. Every offered attacker attacks: the ones the
 * split needs go where it sends them, the rest pile onto the first opponent, so no attack requirement is ever
 * left unmet. A goaded attacker (it must attack someone other than its goader) keeps the ordinary plan.
 * `attackerActions` are the offered declare-attacker actions (one per creature and defender).
 */
export function tokenLoopAttackPlan(state, playerId, attackerActions) {
  if (tokenLoopSources(state, playerId).size === 0) return null;
  const faceActions = attackerActions.filter((a) => a.defenderId && !a.defenderPlaneswalkerId);
  const ids = [...new Set(faceActions.map((a) => a.permanentId))];
  if (ids.some((id) => goaderControllersOf(state, id).size > 0)) return null;
  const committed = new Map();
  for (const a of state.combat?.attackers || []) {
    if (a.attackingPlayer !== playerId) continue;
    if (!committed.has(a.defender)) committed.set(a.defender, []);
    committed.get(a.defender).push(Math.max(0, permanentPower(state, a.permanentId) ?? 0));
  }
  const candidates = ids.map((id) => ({ id, power: Math.max(0, permanentPower(state, id) ?? 0) }));
  const needs = swingNeeds(state, playerId);
  const assignment = splitLethal(candidates, needs, { committed });
  if (assignment === null) return null;
  const fallbackDefender = needs.slice().sort(needOrder)[0].id;
  const plan = [];
  for (const candidate of candidates.slice().sort(byPowerThenId)) {
    const defenderId = assignment.get(candidate.id) ?? fallbackDefender;
    const action = faceActions.find((a) => a.permanentId === candidate.id && a.defenderId === defenderId);
    if (!action) return null; // an attacker that cannot attack the opponent it was sent at — keep the ordinary plan
    plan.push(action);
  }
  return plan;
}
