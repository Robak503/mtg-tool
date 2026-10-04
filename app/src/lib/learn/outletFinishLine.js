/**
 * outletFinishLine.js — the token loop's finishes that are NOT combat (E7.2, 2026-10-03).
 *
 * THE RULE (Colton, 2026-10-03): the Squirrel Girl list does not only win by attacking. "Enough" is lethal by ANY route
 * on the battlefield, and the AI takes that route:
 *   · a SHOT outlet — "{T}, Sacrifice a creature: This artifact deals 1 damage to any target" (Blasting Station, which
 *     untaps whenever a creature enters), or the same with no tap (Goblin Bombardment);
 *   · a MILL outlet — "Sacrifice a creature: Target player mills cards equal to the sacrificed creature's power" (Altar
 *     of Dementia);
 *   · a PASSIVE MILL — "Whenever another permanent you control enters, each opponent mills a card" (Altar of the Brood):
 *     nothing to activate, the loop itself is the finish.
 *
 * WHAT THIS LEAF DOES, for a seat that has a token loop (tokenLoopLine.js asks; no other seat is touched):
 *   - `wantsMore`: an outlet is on the battlefield and no route is complete — the loop keeps going past the combat
 *     threshold, because an outlet kill needs no attack step and cannot be blocked;
 *   - `complete`: there is enough. Either the shots ready and waiting cover every opponent's life, or the tokens' power
 *     covers every opponent's library, or the libraries are (about to be) empty. The loop stops, and the seat does
 *     nothing else: it fires the outlet, one offered activation a tick, and passes priority while its own work resolves.
 * What is already on the stack counts: a shot or a mill the seat has activated, and each passive mill waiting to
 * resolve, is taken off the opponent's life or library before anything more is sacrificed — never more than enough.
 * Only TOKEN creatures are sacrificed, lowest power first for a shot (power is wasted on it), highest first for a mill
 * (at the biggest library left).
 * An opponent who loses to an empty library loses when they next draw; the route is complete when the library is empty.
 *
 * EVERYTHING HERE IS A CHOICE AMONG OFFERED ACTIONS, as in tokenLoopLine.js: it never builds an action.
 *
 * Reads plain state; imports the ability parser, the trigger detector and the layer reads.
 */
import { parseActivatedAbilities } from "./effects/abilities.js";
import { parseEffectClause } from "./effects/parser.js";
import { detectTriggers } from "./triggers.js";
import { opponentsOf } from "./gameState.js";
import { permanentIsCreature, permanentPower } from "./layers.js";

/** Past this many permanents the outlet routes stop asking the loop for more (the combat threshold stands). */
export const OUTLET_BOARD_CAP = 600;

const onlySacrificesACreature = (ability) => !!ability && ability.modeled && ability.costModeled && !ability.manaPips
  && ability.sacOther?.type === "creature" && !ability.sacOther.another
  && !ability.sacSelf && !ability.exileSelf && !ability.costX && !ability.discardRandom && !ability.payLife && !ability.payEnergy
  && !ability.discardCard && ability.sacCount == null && ability.sacX == null && ability.removeCounter == null
  && ability.tapCreature == null && ability.exileGyCount == null && ability.discardCardFilter == null
  && ability.returnLand == null && ability.unattachEquipment == null && ability.activationLimit == null && ability.condition == null;

const soleAtom = (program) => (program && program.confidence === "high" && program.structure === "sequence"
  && (program.atoms || []).length === 1 ? program.atoms[0] : null);

/** "Sacrifice a creature: Target player mills cards equal to the sacrificed creature's power." — free, no tap. */
export function isMillOutletAbility(ability) {
  if (!onlySacrificesACreature(ability) || ability.tapSelf) return false;
  const atom = soleAtom(ability.program);
  return !!atom && atom.op === "mill" && atom.who === "target" && atom.targetType === "player"
    && atom.amountCount?.kind === "sacrificedPower" && atom.amountCount.per === 1;
}

/** "[{T},] Sacrifice a creature: This permanent deals N damage to any target." */
export function isShotOutletAbility(ability) {
  if (!onlySacrificesACreature(ability)) return false;
  const atom = soleAtom(ability.program);
  return !!atom && atom.op === "deal-damage" && atom.targetType === "any" && Number.isInteger(atom.amount) && atom.amount >= 1;
}

const isUntapSelfProgram = (program) => {
  const atom = soleAtom(program);
  return !!atom && atom.op === "untap" && atom.target === "self";
};
const isEachOpponentMillsOne = (program) => {
  const atom = soleAtom(program);
  return !!atom && atom.op === "mill" && atom.who === "eachOpponent" && atom.amount === 1;
};

/** The card's outlet roles, parsed once per card object. */
const ROLES = new WeakMap();
function rolesOf(card) {
  let roles = ROLES.get(card);
  if (roles) return roles;
  const oracle = String(card.oracle || card.oracle_text || "");
  roles = { mills: [], shots: [], entersMill: false };
  if (/sacrifice a creature:/i.test(oracle)) {
    for (const ability of parseActivatedAbilities(card)) {
      if (isMillOutletAbility(ability)) roles.mills.push(ability.index);
      else if (isShotOutletAbility(ability)) roles.shots.push({ abilityIndex: ability.index, tapSelf: !!ability.tapSelf, amount: ability.program.atoms[0].amount });
    }
  }
  if (/mills a card/i.test(oracle)) {
    roles.entersMill = detectTriggers(card).some((t) => t.event === "permanentEnters" && t.scope === "permanentYouControl" && !t.optional
      && !t.interveningIf && isEachOpponentMillsOne(parseEffectClause(String(t.effectClause || ""), String(card.type || ""))));
  }
  ROLES.set(card, roles);
  return roles;
}

/** The outlets on the seat's battlefield: mill and shot abilities by permanent, and the passive mills' permanents. */
export function outletSources(state, playerId) {
  const out = { mills: [], shots: [], entersMill: [] };
  for (const perm of state?.players?.[playerId]?.battlefield || []) {
    const card = perm.card;
    if (!card || card.token) continue;
    const roles = rolesOf(card);
    for (const abilityIndex of roles.mills) out.mills.push({ permanentId: perm.id, abilityIndex });
    for (const shot of roles.shots) out.shots.push({ permanentId: perm.id, tapped: !!perm.tapped, ...shot });
    if (roles.entersMill) out.entersMill.push(perm.id);
  }
  return out;
}

const byId = (a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);

/** The seat's token creatures as { id, power } — the only things an outlet is fed. */
export function fodderOf(state, playerId) {
  const out = [];
  for (const perm of state?.players?.[playerId]?.battlefield || []) {
    if (!perm.card?.token || !permanentIsCreature(state, perm.id)) continue;
    out.push({ id: perm.id, power: Math.max(0, permanentPower(state, perm.id) ?? 0) });
  }
  return out;
}

/**
 * The seat's own outlet work still on the stack:
 *   untaps   — Map(shot outlet id → untap triggers waiting): each is one more shot once it resolves
 *   damage   — Map(opponent id → damage its shots already aimed there will deal)
 *   mill     — Map(opponent id → cards its mill activations already aimed there will mill)
 *   passive  — passive mills waiting: each takes one card from every opponent
 */
function pendingOn(state, sources) {
  const shotById = new Map(sources.shots.map((s) => [s.permanentId, s]));
  const millIds = new Set(sources.mills.map((m) => m.permanentId));
  const passiveIds = new Set(sources.entersMill);
  const pending = { untaps: new Map(), damage: new Map(), mill: new Map(), passive: 0, any: false };
  const add = (map, key, n) => map.set(key, (map.get(key) || 0) + n);
  for (const obj of state.stack || []) {
    const program = obj?.payload?.params?.program; // an ability of the seat's own permanent is the seat's: the source id is the whole test
    if (obj?.kind === "triggered-ability") {
      const id = obj.source?.permanentId;
      if (shotById.has(id) && isUntapSelfProgram(program)) { add(pending.untaps, id, 1); pending.any = true; }
      else if (passiveIds.has(id) && isEachOpponentMillsOne(program)) { pending.passive += 1; pending.any = true; }
    } else if (obj?.kind === "activated-ability") {
      const id = obj.payload?.params?.sourceId;
      const target = (obj.targets || [])[0];
      if (target?.type !== "player") continue;
      if (shotById.has(id) && soleAtom(program)?.op === "deal-damage") { add(pending.damage, target.id, shotById.get(id).amount); pending.any = true; }
      else if (millIds.has(id) && soleAtom(program)?.op === "mill") { add(pending.mill, target.id, Math.max(0, obj.payload.params.context?.sacrificedForCost?.power ?? 0)); pending.any = true; }
    }
  }
  return pending;
}

/**
 * The seat's outlet line right now, or null when it controls no outlet.
 *   shot — { live, ready: [outlets usable this tick], target, victim } : `live` = shots ready and waiting cover all life
 *   mill — { live, outlet, target, victim }                            : `live` = token power covers every library
 *   done — every living opponent's library is empty, counting what is already on the stack
 *   pending — the seat's own outlet work is on the stack
 *   complete — a route is live, or a mill route has emptied every library: there is enough
 *   wantsMore — no route is complete and the board is under the cap: the loop should keep going
 */
export function outletState(state, playerId) {
  const sources = outletSources(state, playerId);
  if (!sources.mills.length && !sources.shots.length && !sources.entersMill.length) return null;
  const pending = pendingOn(state, sources);
  const opponents = opponentsOf(state, playerId)
    .filter((id) => (state.players?.[id]?.life ?? 0) > 0)
    .map((id) => ({
      id,
      life: Math.max(0, state.players[id].life - (pending.damage.get(id) || 0)),
      library: Math.max(0, (state.players[id].library || []).length - (pending.mill.get(id) || 0) - pending.passive),
    }));
  if (!opponents.length) return null;
  const fodder = fodderOf(state, playerId);

  // SHOTS — each outlet fires once per untap (or freely with no tap), each shot one token.
  let shot = { live: false, ready: [], target: null, victim: null };
  if (sources.shots.length) {
    const standing = opponents.filter((o) => o.life > 0).sort((a, b) => (a.life - b.life) || byId(a, b));
    const lifeTotal = standing.reduce((sum, o) => sum + o.life, 0);
    let damage = 0;
    let tokensLeft = fodder.length;
    const ready = [];
    for (const outlet of sources.shots) {
      const uses = outlet.tapSelf ? (outlet.tapped ? 0 : 1) + (pending.untaps.get(outlet.permanentId) || 0) : tokensLeft;
      const used = Math.min(uses, tokensLeft);
      tokensLeft -= used;
      damage += used * outlet.amount;
      if (used > 0 && (!outlet.tapSelf || !outlet.tapped)) ready.push(outlet);
    }
    const victim = fodder.slice().sort((a, b) => (a.power - b.power) || byId(a, b))[0] || null;
    shot = { live: damage >= lifeTotal, ready, target: standing[0]?.id ?? null, victim: victim?.id ?? null };
  }

  // MILL — the biggest tokens to the biggest library first (the small tokens then fit the small libraries with least
  // waste); `live` only when every library is covered.
  const stocked = opponents.filter((o) => o.library > 0).sort((a, b) => (b.library - a.library) || byId(a, b));
  const done = stocked.length === 0;
  let mill = { live: false, outlet: null, target: null, victim: null };
  if (sources.mills.length && !done) {
    const pool = fodder.slice().sort((a, b) => (b.power - a.power) || byId(a, b)); // a 0-power token sorts last and covers nothing
    let next = 0;
    let covered = true;
    for (const opponent of stocked) {
      let milled = 0;
      while (milled < opponent.library) {
        if (next >= pool.length) { covered = false; break; }
        milled += pool[next++].power;
      }
      if (!covered) break;
    }
    mill = { live: covered, outlet: sources.mills[0], target: stocked[0].id, victim: pool[0]?.id ?? null };
  }

  // A shot-only board has no use for `done`; a board with any mill route is complete once the libraries are empty.
  const complete = shot.live || mill.live || (done && (sources.mills.length > 0 || sources.entersMill.length > 0));
  const boardSize = (state.players[playerId].battlefield || []).length;
  return { shot, mill, done, pending: pending.any, complete, wantsMore: !complete && boardSize < OUTLET_BOARD_CAP };
}

/**
 * THE FINISH — the offered action that advances a complete outlet route, or null.
 * A live shot route fires a ready outlet at the opponent with the least life left to deal; a live mill route sacrifices
 * its biggest token to the outlet, aimed at the biggest library left. Shots first: they end the game now, a mill a
 * draw later. With nothing to fire and its own outlet work still on the stack (the next untap, a shot, a mill), the seat
 * passes priority so that work resolves — and does nothing else meanwhile.
 */
export function outletFinishAction(outlet, actions) {
  if (!outlet || !outlet.complete) return null;
  const offered = (permanentId, abilityIndex, victim, target) => actions.find((a) => a.kind === "activate-ability"
    && a.permanentId === permanentId && a.abilityIndex === abilityIndex && a.sacCreatureId === victim
    && (a.targets || []).length === 1 && a.targets[0].type === "player" && a.targets[0].id === target);
  if (outlet.shot.live && outlet.shot.target != null) {
    for (const ready of outlet.shot.ready) {
      const action = offered(ready.permanentId, ready.abilityIndex, outlet.shot.victim, outlet.shot.target);
      if (action) return action;
    }
  } else if (!outlet.shot.live && outlet.mill.live) {
    const action = offered(outlet.mill.outlet.permanentId, outlet.mill.outlet.abilityIndex, outlet.mill.victim, outlet.mill.target);
    if (action) return action;
  }
  return outlet.pending ? (actions.find((a) => a.kind === "pass-priority") || null) : null;
}
