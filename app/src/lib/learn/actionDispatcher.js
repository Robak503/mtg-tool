/**
 * Phase 6 PR6.1 — actionDispatcher.js
 *
 * Given a GameState and a legal action (from legalChoices.js),
 * produce the new GameState after applying that action. The
 * decisionGate + opponentAI together pick WHICH action to take;
 * this module applies the chosen action's effects.
 *
 * Pure: no fetches, no React, no engine-internal mutation. Every
 * function returns a new state.
 *
 * Scope (PR6.1):
 *   - pass-priority   → passPriority
 *   - play-land       → moveCardToZone + landsPlayedThisTurn + priority reset
 *   - cast-spell      → spend mana + move card to stack + priority reset
 *   - declare-attacker / declare-blocker → tracked combat state (engine
 *                       reads back via state.combat.* until combat ends)
 *
 * Deferred:
 *   - Ability activation (no ability schema yet)
 *   - Target selection (engine surfaces it post-action; PR7+)
 *   - Sacrifice / discard / other non-mana costs (Arbiter case)
 *
 * Errors are thrown as `DispatcherError` with a `code` field so
 * callers (API route, UI) can render them precisely.
 */

import {
  createStackObject,
  moveCardToZone,
  logEvent,
  opponentsOf,
  tapPermanent,
  addMana,
  loseLife,
  removeCounter,
  destroyLethalCreatures,
  mintId,
  isPlaneswalker,
  castsAsPlaneswalker,
  adjustLoyalty,
  markLoyaltyActivated,
  destroyZeroLoyaltyPlaneswalkers,
} from "./gameState.js";
import { passPriority, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { manaSources, planPayment } from "./manaModel.js";
import { parseEffectProgram } from "./effects/parser.js";
import { RESOLVER_KEYS, isPermanentSpell } from "./resolvers.js";
import { isAuraCard, isNativeAura } from "./staticAbilityParser.js";
import { planeswalkerPlayable } from "./effects/loyaltyAbilities.js";
import { permanentHasKeyword } from "./layers.js";
import { checkCastTriggers, checkDiesTriggers } from "./triggers.js";

export class DispatcherError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "DispatcherError";
    this.code = code;
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function findCardInHand(state, playerId, cardId) {
  const player = state.players[playerId];
  return player?.hand.find(c => c.id === cardId) || null;
}

function findCreatureOnBattlefield(state, playerId, permanentId) {
  const player = state.players[playerId];
  return player?.battlefield.find(p => p.id === permanentId) || null;
}

/**
 * Subtract the parsed cost from the player's mana pool. Mirrors the
 * affordability check in legalChoices.canPayManaCost: colored pips
 * first, then hybrid (prefer cheapest payable side), then generic
 * from whatever's left. Throws if the cost can't be paid — callers
 * must have already validated via canPayManaCost.
 */
function deductManaCost(manaPool, cost) {
  let pool = { ...manaPool };

  for (const color of ["W", "U", "B", "R", "G", "C"]) {
    const need = cost[color] || 0;
    if (need > 0) {
      if (pool[color] < need) {
        throw new DispatcherError(`Cannot deduct ${need} ${color} (pool has ${pool[color]})`, "MANA_SHORT");
      }
      pool = { ...pool, [color]: pool[color] - need };
    }
  }

  // Hybrid pips: pay from whichever side is available, preferring the
  // smaller pool (so we don't drain a color we might need later).
  for (const options of cost.hybrid || []) {
    const colored = options.filter(o => !/^\d+$/.test(o));
    let paid = false;
    // Prefer the option where the pool has the LEAST mana (preserves
    // flexibility for future casts).
    colored.sort((a, b) => (pool[a] || 0) - (pool[b] || 0));
    for (const opt of colored) {
      if ((pool[opt] || 0) > 0) {
        pool = { ...pool, [opt]: pool[opt] - 1 };
        paid = true;
        break;
      }
    }
    if (!paid) throw new DispatcherError("Cannot pay hybrid pip", "MANA_SHORT");
  }

  // Generic: drain remaining pool. Spend C first (it can only pay
  // generic), then the colors with the most available so we don't
  // strand a color we needed elsewhere.
  if ((cost.generic || 0) > 0) {
    let need = cost.generic;
    const order = ["C", "W", "U", "B", "R", "G"];
    order.sort((a, b) => (pool[b] || 0) - (pool[a] || 0));  // most-available first for the colored fallback
    // But always spend C before colored.
    if (pool.C > 0) {
      const take = Math.min(pool.C, need);
      pool = { ...pool, C: pool.C - take };
      need -= take;
    }
    for (const color of order) {
      if (color === "C") continue;
      if (need <= 0) break;
      const take = Math.min(pool[color], need);
      pool = { ...pool, [color]: pool[color] - take };
      need -= take;
    }
    if (need > 0) {
      throw new DispatcherError(`Not enough mana for ${cost.generic} generic`, "MANA_SHORT");
    }
  }

  return pool;
}

/**
 * Commit a payment plan's mana taps (manaModel.planPayment). For each tapped source: add its mana to
 * the pool, then either TAP it (a repeatable land/rock/dork) or — for a one-shot sacrifice-for-mana
 * source (Treasure / Gold / Lotus Petal, `tap.sacrifices`) — SACRIFICE it (battlefield → graveyard) so
 * it can't ramp again (the TOK-2 correctness invariant). Those sources are non-creatures, so no dies
 * trigger fires; routing the removal through moveCardToZone keeps it on the one shared zone-move path.
 * Shared by the cast-spell + activate-ability auto-pay loops so the two can't drift.
 */
function commitManaTaps(state, playerId, taps) {
  let working = state;
  for (const tap of taps || []) {
    working = addMana(working, { playerId, color: tap.color, amount: tap.amount });
    working = tap.sacrifices
      ? moveCardToZone(working, { playerId, fromZone: "battlefield", toZone: "graveyard", cardId: tap.permanentId })
      : tapPermanent(working, tap.permanentId);
  }
  return working;
}

// ─── Combat-state helper ──────────────────────────────────────────────────────

/**
 * Ensure state.combat exists and reset it if we just entered a new
 * combat phase. The structure:
 *   state.combat = {
 *     attackers: [{ permanentId, attackingPlayer, defender }],
 *     blockers:  [{ blockerId, attackerId }],
 *   }
 */
function ensureCombat(state) {
  if (state.combat) return state;
  return { ...state, combat: { attackers: [], blockers: [] } };
}

// ─── Individual action handlers ──────────────────────────────────────────────

function applyPassPriority(state) {
  return passPriority(state);
}

function applyPlayLand(state, action) {
  const player = state.players[action.playerId];
  if (!player) throw new DispatcherError(`Unknown player ${action.playerId}`, "BAD_PLAYER");
  if (player.landsPlayedThisTurn >= 1) {
    throw new DispatcherError("Already played a land this turn", "LAND_PER_TURN");
  }
  const card = findCardInHand(state, action.playerId, action.cardId);
  if (!card) throw new DispatcherError(`Card ${action.cardId} not in hand`, "CARD_NOT_IN_HAND");

  let next = moveCardToZone(state, {
    playerId: action.playerId,
    fromZone: "hand",
    toZone: "battlefield",
    cardId: action.cardId,
    becomePermanent: true,
  });
  next = {
    ...next,
    players: {
      ...next.players,
      [action.playerId]: {
        ...next.players[action.playerId],
        landsPlayedThisTurn: next.players[action.playerId].landsPlayedThisTurn + 1,
      },
    },
  };
  next = logEvent(next, {
    kind: "play-land",
    playerId: action.playerId,
    cardName: card.name,
  });
  // Sorcery-speed action restarts the priority loop at the active player.
  return {
    ...next,
    priorityHolder: state.activePlayer,
    consecutivePasses: 0,
  };
}

function applyCastSpell(state, action) {
  // CMD-CAST: a commander is cast FROM the command zone (action.fromZone === "command"); default "hand".
  const fromZone = action.fromZone || "hand";
  const card = (state.players[action.playerId]?.[fromZone] || []).find(c => c.id === action.cardId) || null;
  if (!card) throw new DispatcherError(`Card ${action.cardId} not in ${fromZone}`, "CARD_NOT_IN_ZONE");

  // Plan payment from the current pool PLUS untapped mana sources. planPayment
  // is pool-first, so a pre-filled pool pays with zero taps (preserving the
  // old behavior + tests); otherwise we auto-tap lands/rocks/dorks to cover.
  const pool = state.players[action.playerId].manaPool;
  const plan = planPayment(pool, manaSources(state, action.playerId), action.cost);
  if (!plan) {
    throw new DispatcherError("Cannot pay the spell's mana cost", "MANA_SHORT");
  }

  // 1. Commit the taps: add each source's mana to the pool and tap it — OR sacrifice a one-shot
  // Treasure/Gold (commitManaTaps). Any surplus from an over-producing source (Sol Ring on a single
  // generic) floats — the floating-mana behavior we want.
  let working = commitManaTaps(state, action.playerId, plan.taps);

  // 2. Deduct EXACTLY what the plan spent. Using the plan's own breakdown (not
  // a second payment heuristic) guarantees the deduction always succeeds — no
  // divergence that could strand a hybrid pip and throw MANA_SHORT after the
  // spell was already deemed castable.
  const toppedPool = working.players[action.playerId].manaPool;
  const nextPool = {};
  for (const c of Object.keys(toppedPool)) {
    nextPool[c] = (toppedPool[c] || 0) - (plan.spend?.[c] || 0);
  }

  // 2b. Pay any ADDITIONAL COSTS (CR 601.2f) — paid at cast, before the spell finishes going on the stack.
  // The parser attaches the cost(s) to `program.additionalCosts` and legalChoices.actionsCastSpell freezes
  // the chosen way-to-pay onto the action. Kinds:
  //   sacrifice — γ1b `sacrificePermanentForCost` (battlefield→graveyard + the victim's dies trigger; the
  //               legalChoices filter already excluded any victim whose leave-trigger the dies path can't fire).
  //   payLife   — deduct N life (CR 119.4; legalChoices gated life >= N).
  //   discard   — move the CHOSEN hand card → graveyard (same mechanism as EP-2's discard). The spell itself
  //               is still in hand here but was excluded as a discard candidate at enumeration.
  // FAIL-FAST: a program that REQUIRES a cost but arrived without the matching choice is an upstream bug —
  // THROW rather than cast cost-free (silently skipping a cost is the cardinal false-positive failure,
  // CLAUDE.md §1.2). `program` is hoisted here and reused for the payload below (single parse).
  const program = action.program || parseEffectProgram(card);
  for (const ac of program?.additionalCosts || []) {
    if (ac.kind === "sacrifice") {
      if (!action.sacCreatureId) throw new DispatcherError("Spell requires an additional sacrifice cost but no victim was chosen", "ADDCOST_UNPAID");
      const victim = working.players[action.playerId]?.battlefield.find(p => p.id === action.sacCreatureId);
      if (!victim) throw new DispatcherError(`Sacrifice victim ${action.sacCreatureId} not on battlefield`, "PERM_NOT_FOUND");
      working = sacrificePermanentForCost(working, action.playerId, victim);
    } else if (ac.kind === "payLife") {
      working = loseLife(working, { playerId: action.playerId, amount: ac.amount });
    } else if (ac.kind === "discard") {
      if (!action.discardCardId) throw new DispatcherError("Spell requires an additional discard cost but no card was chosen", "ADDCOST_UNPAID");
      if (!working.players[action.playerId]?.hand.some(c => c.id === action.discardCardId)) {
        throw new DispatcherError(`Discard card ${action.discardCardId} not in hand`, "CARD_NOT_IN_HAND");
      }
      working = moveCardToZone(working, { playerId: action.playerId, fromZone: "hand", toZone: "graveyard", cardId: action.discardCardId });
    } else {
      throw new DispatcherError(`Unsupported additional cost kind: ${ac.kind}`, "ADDCOST_UNSUPPORTED");
    }
  }

  // 3. Move the card out of its source zone (hand, or the command zone for CMD-CAST). We splice
  // manually because the stack is shared (top-level state), not per-player.
  const player = working.players[action.playerId];
  const srcIndex = player[fromZone].findIndex(c => c.id === action.cardId);
  const nextSrc = [...player[fromZone].slice(0, srcIndex), ...player[fromZone].slice(srcIndex + 1)];

  // 4. Build a plain-data, SERIALIZABLE payload (Phase-7 PR-3) — no closure.
  // An instant/sorcery resolves via the P2.2 effect-program interpreter (an
  // ordered Atom[]; a low-confidence/unmodeled program runs zero atoms and routes
  // to the Arbiter seam at resolution); a permanent spell enters via spell.permanent;
  // a card with no oracle text we can't classify logs via spell.noop (→ Arbiter
  // seam too). resolveTopOfStack dispatches on payload.resolver through the
  // registry. Because state carries zero functions, a game serializes mid-stack
  // and restores to byte-identical behavior.
  const targets = action.targets || [];

  let payload;
  if (isNativeAura(card)) {
    // Aura (CR 303.4f): resolve via the AURA_ETB resolver — enter the battlefield attached
    // to the targeted creature. The target id is the battlefield permanent chosen at cast.
    const targetId = targets[0]?.id;
    payload = { resolver: RESOLVER_KEYS.AURA_ETB, params: { card, controller: action.playerId, targetId } };
  } else if (isAuraCard(card)) {
    // An Aura we can't model end-to-end (enchants a non-creature / restricted subject, or
    // carries an unmodeled bonus/ability). Route to the Arbiter seam rather than entering a
    // do-nothing unattached permanent — honest about the gap, never a silent no-op.
    payload = { resolver: RESOLVER_KEYS.SPELL_NOOP, params: { cardName: card.name, reason: "aura (unmodeled enchant or bonus)" } };
  } else if (castsAsPlaneswalker(card)) {
    // A card that casts AS a planeswalker (front face — so a creature-front DFC falls through to the
    // permanent/creature path and enters as its creature side, PW-1 review P2.1). Only a FULLY-
    // modeled walker (every loyalty ability HIGH, no unmodeled static/trigger residue) enters the
    // native battlefield via PERMANENT_ETB (with its starting loyalty, set in enterPermanent). A
    // partially-modeled walker routes to the Arbiter seam rather than entering and silently dropping
    // its unmodeled text — the all-or-nothing CREED. Checked before the generic `program` branch,
    // which would otherwise parse the first loyalty line and mis-route it.
    //
    // HYBRID (PW-2): a PLAYABLE walker (no unmodeled static/trigger residue) enters natively — its
    // loyalty abilities resolve natively if modeled, else route to the Arbiter AT ACTIVATION. Only a
    // walker with unmodeled static/triggered text (which can't be hybrid-routed) goes whole-card to
    // the Arbiter at cast.
    payload = planeswalkerPlayable(card)
      ? { resolver: RESOLVER_KEYS.PERMANENT_ETB, params: { card, controller: action.playerId } }
      : { resolver: RESOLVER_KEYS.SPELL_NOOP, params: { cardName: card.name, reason: "planeswalker (unmodeled static/triggered ability)" } };
  } else if (program) {
    // P2.5: thread the cast-time choices (chosenMode for modal, xValue for X-spells)
    // frozen onto the action so resolution is deterministic + serializable.
    const params = { program, controller: action.playerId, targets, cardId: card.id };
    if (action.chosenMode != null) params.chosenMode = action.chosenMode;
    if (action.xValue != null) params.xValue = action.xValue;
    payload = { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params };
  } else if (isPermanentSpell(card)) {
    payload = { resolver: RESOLVER_KEYS.PERMANENT_ETB, params: { card, controller: action.playerId } };
  } else {
    payload = { resolver: RESOLVER_KEYS.SPELL_NOOP, params: { cardName: card.name, reason: "instant-or-sorcery (no recognized effect)" } };
  }

  // Mint a deterministic stack id; thread the advanced state (working2) so idSeq
  // persists onto the result.
  const { id: stkId, state: working2 } = mintId(working, "stk");
  const stackObject = createStackObject({
    id: stkId,
    kind: "spell",
    source: card,
    controller: action.playerId,
    targets,
    cost: action.cost,
    payload,
  });

  // CMD-CAST: a cast FROM the command zone bumps the commander's cast count → the {2} tax grows on each
  // recast (CR 903.8 counts casts from the zone, so the cast counts even if it's later countered).
  const bumpCount = fromZone === "command"
    ? { commanderCastCount: { ...(player.commanderCastCount || {}), [action.cardId]: (player.commanderCastCount?.[action.cardId] || 0) + 1 } }
    : {};
  let next = {
    ...working2,
    players: {
      ...working2.players,
      [action.playerId]: {
        ...player,
        [fromZone]: nextSrc,
        manaPool: nextPool,
        ...bumpCount,
      },
    },
    stack: [...working2.stack, stackObject],
  };
  next = logEvent(next, {
    kind: "cast-spell",
    playerId: action.playerId,
    cardName: card.name,
    cost: action.cost,
  });
  // Cast-spell triggers (CR 603.2): the spell is now on the stack, so "whenever you/an
  // opponent casts a … spell" watchers trigger and go on the stack ABOVE it (flush here,
  // not at a later checkpoint, so they resolve BEFORE the spell — correct order, and the
  // right thing for any future referential effect).
  next = checkCastTriggers(next, { spellCard: card, casterId: action.playerId });
  next = flushTriggers(next, { chooseTargets: chooseTriggerTargets });
  // Restart priority loop at active player after the spell goes on
  // the stack (per CR 117.1c).
  return {
    ...next,
    priorityHolder: state.activePlayer,
    consecutivePasses: 0,
  };
}

/**
 * Tap a mana source for mana. Mana abilities don't use the stack and don't
 * change priority (CR 605.3) — the player keeps priority. Surfaced as an
 * explicit action for Beginner teaching and floating-mana plays; casting
 * auto-taps without needing this.
 */
function applyTapForMana(state, action) {
  const player = state.players[action.playerId];
  if (!player) throw new DispatcherError(`Unknown player ${action.playerId}`, "BAD_PLAYER");
  const perm = player.battlefield.find(p => p.id === action.permanentId);
  if (!perm) throw new DispatcherError(`Permanent ${action.permanentId} not on battlefield`, "PERM_NOT_FOUND");
  if (perm.tapped) throw new DispatcherError("Mana source is already tapped", "ALREADY_TAPPED");

  // Add the mana, then TAP a repeatable source or SACRIFICE a one-shot Treasure/Gold (action.sacrifices,
  // set by legalChoices.actionsTapForMana) — the same one-shot discipline as the auto-pay commit path.
  let next = addMana(state, { playerId: action.playerId, color: action.color, amount: action.amount || 1 });
  next = action.sacrifices
    ? moveCardToZone(next, { playerId: action.playerId, fromZone: "battlefield", toZone: "graveyard", cardId: action.permanentId })
    : tapPermanent(next, action.permanentId);
  next = logEvent(next, {
    kind: "tap-for-mana",
    playerId: action.playerId,
    permanentId: action.permanentId,
    color: action.color,
    amount: action.amount || 1,
    sacrificed: !!action.sacrifices,
    cardName: perm.card?.name,
  });
  return next;
}

/**
 * Activate an activated ability (`{cost}: effect`, CR 602.1) — P2.9. Pays the cost
 * (mana via planPayment + auto-tap, plus tapping the source for a `{T}` cost), then
 * puts the ability on the stack with the SAME serializable `effect-program` payload a
 * spell uses, so it resolves through the P2.x interpreter with its chosen targets. The
 * source stays on the battlefield (an activated ability isn't the permanent leaving).
 * Mana abilities never reach here — they resolve via `applyTapForMana` (no stack).
 */
/**
 * Sacrifice a permanent `playerId` controls as part of paying an activated-ability cost (γ1 self-sac /
 * γ1b chosen-victim): move it battlefield→graveyard and, if it's a CREATURE, fire its + watchers' dies
 * triggers (CR 700.4 — the aristocrats payoff). A non-creature sacrifice leaves no dies trigger. The
 * dispatch's flushTriggers then stacks these ABOVE the ability so they resolve first (CR 603.3b). The
 * type read mirrors typeLineOf's DFC front-face fallthrough (single-source-of-truth with legalChoices).
 */
function sacrificePermanentForCost(state, playerId, permObj) {
  const typeLine = String(permObj.card?.type || permObj.card?.type_line || permObj.card?.card_faces?.[0]?.type_line || permObj.card?.card_faces?.[0]?.type || "");
  let next = moveCardToZone(state, { playerId, fromZone: "battlefield", toZone: "graveyard", cardId: permObj.id });
  if (/Creature/.test(typeLine)) {
    next = checkDiesTriggers(next, [{ controller: playerId, id: permObj.id, name: permObj.card?.name || "creature", card: permObj.card }]);
  }
  return next;
}

function applyActivateAbility(state, action) {
  const player = state.players[action.playerId];
  if (!player) throw new DispatcherError(`Unknown player ${action.playerId}`, "BAD_PLAYER");
  const perm = player.battlefield.find(p => p.id === action.permanentId);
  if (!perm) throw new DispatcherError(`Permanent ${action.permanentId} not on battlefield`, "PERM_NOT_FOUND");
  if (action.tapSelf && perm.tapped) {
    throw new DispatcherError("Ability source is already tapped", "ALREADY_TAPPED");
  }

  // Plan + commit mana payment. A source paying its own cost by tapping ({T}), being sacrificed, OR being
  // exiled can't ALSO tap for mana — exclude it from the available sources (matches legalChoices exactly).
  const pool = player.manaPool;
  const sources = manaSources(state, action.playerId).filter(s => !((action.tapSelf || action.sacSelf || action.exileSelf) && s.permanentId === action.permanentId));
  const plan = planPayment(pool, sources, action.cost);
  if (!plan) throw new DispatcherError("Cannot pay the ability's mana cost", "MANA_SHORT");

  let working = commitManaTaps(state, action.playerId, plan.taps);
  const toppedPool = working.players[action.playerId].manaPool;
  const nextPool = {};
  for (const c of Object.keys(toppedPool)) nextPool[c] = (toppedPool[c] || 0) - (plan.spend?.[c] || 0);
  working = {
    ...working,
    players: { ...working.players, [action.playerId]: { ...working.players[action.playerId], manaPool: nextPool } },
  };

  // Pay the `{T}` part of the cost by tapping the source (after the mana taps, so the
  // source was already excluded from the mana plan above and can't be double-tapped).
  if (action.tapSelf) working = tapPermanent(working, action.permanentId);

  // Pay the non-mana cost items, all BEFORE the ability is put on the stack (CR 602.2b): life first
  // (γ1, CR 119.4), then the self-sacrifice (γ1) and/or the chosen-victim sacrifice (γ1b), then the
  // self-exile (γ1c) and/or a self counter removal (γ1c).
  if (action.payLife) working = loseLife(working, { playerId: action.playerId, amount: action.payLife });
  if (action.sacSelf) working = sacrificePermanentForCost(working, action.playerId, perm);
  if (action.sacCreatureId) {
    const victim = working.players[action.playerId]?.battlefield.find((p) => p.id === action.sacCreatureId);
    if (!victim) throw new DispatcherError(`Sacrifice victim ${action.sacCreatureId} not on battlefield`, "PERM_NOT_FOUND");
    working = sacrificePermanentForCost(working, action.playerId, victim);
  }
  if (action.exileSelf) {
    // Exile the source from the battlefield (CR 406). Exile is NOT "dies" (CR 700.4 — dies = to the
    // graveyard), so NO dies triggers fire; the offer-gate's leave-trigger fail-safe already excluded a
    // source with an LTB/exile trigger we couldn't fire, so nothing is silently dropped here.
    working = moveCardToZone(working, { playerId: action.playerId, fromZone: "battlefield", toZone: "exile", cardId: perm.id });
  }
  if (action.removeCounter) {
    working = removeCounter(working, { permanentId: action.permanentId, type: action.removeCounter.type, amount: 1 });
    // Removing a +1/+1 counter lowers derived toughness — a creature it drops to <= 0 dies as an SBA
    // (CR 704.5f). Run the lethal sweep + its dies triggers so that's never left until the next combat.
    const lethal = destroyLethalCreatures(working);
    working = checkDiesTriggers(lethal.state, lethal.dead);
  }

  // Build the serializable payload. An Equip ability ATTACHES (the ATTACH resolver moves
  // the equipment onto the target creature); every other activated ability runs its effect
  // program (same shape as a cast spell).
  const targets = action.targets || [];
  let payload;
  if (action.isEquipAbility) {
    payload = { resolver: RESOLVER_KEYS.ATTACH, params: { sourceId: action.permanentId, targetId: targets[0]?.id, controller: action.playerId } };
  } else {
    // sourceId = the activating permanent — lets a "this creature gets …" self atom in an
    // activated ability ("{T}: This creature gets +1/+1 until end of turn") resolve to the source.
    const params = { program: action.program, controller: action.playerId, targets, cardId: perm.card?.id, sourceId: action.permanentId };
    if (action.chosenMode != null) params.chosenMode = action.chosenMode;
    payload = { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params };
  }

  const { id: stkId, state: working2 } = mintId(working, "stk");
  const stackObject = createStackObject({
    id: stkId,
    kind: "activated-ability",
    source: perm.card,
    controller: action.playerId,
    targets,
    cost: action.cost,
    payload,
  });

  let next = { ...working2, stack: [...working2.stack, stackObject] };
  next = logEvent(next, {
    kind: "activate-ability",
    playerId: action.playerId,
    permanentId: action.permanentId,
    cardName: perm.card?.name,
    abilityText: action.abilityText,
  });
  // γ1 — a self-sacrifice cost (above) enqueues dies triggers in pendingTriggers; flush them onto
  // the stack now (ABOVE the ability, so they resolve first — CR 603.3b), exactly as the cast path
  // flushes cast triggers. A no-op when nothing triggered (the pre-γ1 common case).
  next = flushTriggers(next, { chooseTargets: chooseTriggerTargets });
  // Activating a (non-mana) ability uses the stack — restart the priority loop at the
  // active player (CR 117.1c), exactly like casting a spell.
  return { ...next, priorityHolder: state.activePlayer, consecutivePasses: 0 };
}

/**
 * KW-CYCLING (CR 702.29a) — cycling is an activated ability usable from HAND. Its cost is the cycling
 * mana cost PLUS "Discard this card"; its effect is "Draw a card". Costs are paid BEFORE the ability
 * goes on the stack (CR 602.2b): pay the mana, then discard the card (hand → graveyard). The "draw a
 * card" then goes on the stack and resolves through the SAME EffectProgram interpreter a spell uses
 * (a draw-1 atom). A card carrying a "when you cycle" / "cycles or discards" trigger is never offered
 * this action (legalChoices' parseCyclingCost returns null for it), so no cycle trigger is ever dropped.
 */
function applyCycle(state, action) {
  const player = state.players[action.playerId];
  if (!player) throw new DispatcherError(`Unknown player ${action.playerId}`, "BAD_PLAYER");
  const card = player.hand.find(c => c.id === action.cardId);
  if (!card) throw new DispatcherError(`Cycling card ${action.cardId} not in hand`, "CARD_NOT_IN_HAND");

  // Pay the cycling MANA cost (CR 602.2b — before the ability is on the stack).
  const plan = planPayment(player.manaPool, manaSources(state, action.playerId), action.cost);
  if (!plan) throw new DispatcherError("Cannot pay the cycling cost", "MANA_SHORT");
  let working = commitManaTaps(state, action.playerId, plan.taps);
  const toppedPool = working.players[action.playerId].manaPool;
  const nextPool = {};
  for (const c of Object.keys(toppedPool)) nextPool[c] = (toppedPool[c] || 0) - (plan.spend?.[c] || 0);
  working = { ...working, players: { ...working.players, [action.playerId]: { ...working.players[action.playerId], manaPool: nextPool } } };

  // Pay the DISCARD part of the cost — the card itself, hand → graveyard.
  working = moveCardToZone(working, { playerId: action.playerId, fromZone: "hand", toZone: "graveyard", cardId: action.cardId });

  // Put "Draw a card" on the stack — resolves via the EffectProgram interpreter (a draw-1 atom).
  const program = { version: 1, source: "cycling", confidence: "high", structure: "sequence", atoms: [{ op: "draw", amount: 1, targetType: null }], modal: null, xSpell: false, unparsedTail: null };
  const { id: stkId, state: working2 } = mintId(working, "stk");
  const stackObject = createStackObject({
    id: stkId, kind: "activated-ability",
    source: { name: `${card.name} — cycling`, oracle: "" },
    controller: action.playerId, targets: [], cost: action.cost,
    payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program, controller: action.playerId, targets: [] } },
  });
  let next = { ...working2, stack: [...working2.stack, stackObject] };
  next = logEvent(next, { kind: "cycle", playerId: action.playerId, cardName: card.name });
  // Cycling uses the stack — restart priority at the active player (CR 117.1c), like an activated ability.
  return { ...next, priorityHolder: state.activePlayer, consecutivePasses: 0 };
}

/**
 * Activate a loyalty ability (`[+N]/[−N]/[0]: effect`, CR 606) — PW-1. The cost is a loyalty
 * adjustment, paid by changing the planeswalker's loyalty counters BEFORE the ability goes on the
 * stack (CR 602.2b), and the controller is marked as having used a loyalty ability of this walker
 * this turn (CR 606.3). The effect then resolves through the SAME serializable effect-program
 * interpreter a spell/activated ability uses, with sourceId = the planeswalker so a self ("this")
 * atom resolves to it. A `−N` cost that drops loyalty to 0 puts the walker into the graveyard as an
 * SBA (CR 704.5i) — but the ability is already on the stack and still resolves.
 */
function applyActivateLoyalty(state, action) {
  const player = state.players[action.playerId];
  if (!player) throw new DispatcherError(`Unknown player ${action.playerId}`, "BAD_PLAYER");
  const perm = player.battlefield.find((p) => p.id === action.permanentId);
  if (!perm) throw new DispatcherError(`Permanent ${action.permanentId} not on battlefield`, "PERM_NOT_FOUND");
  if (!isPlaneswalker(perm.card)) throw new DispatcherError("Not a planeswalker", "NOT_PLANESWALKER");
  if (perm.loyaltyActivatedThisTurn) throw new DispatcherError("A loyalty ability of this planeswalker was already activated this turn", "LOYALTY_USED");
  const loyalty = perm.counters?.loyalty ?? 0;
  if (!Number.isInteger(action.costDelta)) throw new DispatcherError("Loyalty cost delta missing", "BAD_ACTION");
  if (action.costDelta < 0 && loyalty + action.costDelta < 0) {
    throw new DispatcherError("Not enough loyalty to pay this cost", "LOYALTY_SHORT");
  }

  // Pay the loyalty cost (CR 602.2b — before the ability is put on the stack) + mark it used.
  let working = adjustLoyalty(state, { permanentId: perm.id, delta: action.costDelta });
  working = markLoyaltyActivated(working, perm.id);

  // Build the resolution payload. HYBRID (PW-2): a MODELED ability resolves natively through the
  // effect-program interpreter (sourceId = the planeswalker); an UNMODELED ability (routeToArbiter)
  // has its loyalty cost paid above, then routes the EFFECT to the Arbiter seam (markPendingArbiter
  // via SPELL_NOOP) — adjudicated, never fabricated or silently dropped.
  const targets = action.targets || [];
  let payload;
  if (action.routeToArbiter || !action.program) {
    const costLabel = `${action.costDelta >= 0 ? "+" : ""}${action.costDelta}`;
    payload = { resolver: RESOLVER_KEYS.SPELL_NOOP, params: { cardName: `${perm.card?.name} — loyalty ${costLabel}`, reason: `planeswalker loyalty ability (unmodeled effect): ${action.abilityText || costLabel}` } };
  } else {
    const params = { program: action.program, controller: action.playerId, targets, cardId: perm.card?.id, sourceId: perm.id };
    if (action.chosenMode != null) params.chosenMode = action.chosenMode;
    payload = { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params };
  }

  const { id: stkId, state: working2 } = mintId(working, "stk");
  const stackObject = createStackObject({
    id: stkId,
    kind: "activated-ability",
    source: perm.card,
    controller: action.playerId,
    targets,
    cost: null,
    payload,
  });

  let next = { ...working2, stack: [...working2.stack, stackObject] };
  next = logEvent(next, {
    kind: "activate-loyalty",
    playerId: action.playerId,
    permanentId: perm.id,
    cardName: perm.card?.name,
    costDelta: action.costDelta,
    abilityText: action.abilityText,
  });
  // SBA (CR 704.5i): paying a −N cost down to 0 puts the walker into the graveyard. The ability is
  // already on the stack (above) and still resolves — putting it there before the sweep is what
  // preserves that ordering.
  next = destroyZeroLoyaltyPlaneswalkers(next).state;
  // A loyalty ability uses the stack — restart the priority loop at the active player (CR 117.1c).
  return { ...next, priorityHolder: state.activePlayer, consecutivePasses: 0 };
}

function applyDeclareAttacker(state, action) {
  const creature = findCreatureOnBattlefield(state, action.playerId, action.permanentId);
  if (!creature) throw new DispatcherError(`Permanent ${action.permanentId} not on battlefield`, "PERM_NOT_FOUND");

  // Attacking taps the creature (CR 508.1f) unless it has vigilance. Read vigilance through
  // the LAYER ENGINE (permanentHasKeyword), not the printed card — a creature GRANTED
  // vigilance by an Aura/Equipment/anthem must also stay untapped, or the granted keyword
  // is silently dropped (the engine would claim the grant is modeled yet tap anyway). This
  // is what self-dedups attackers (a tapped creature is no longer a legal attacker) and
  // stops a creature that attacked from also blocking before its next untap.
  // combatResolution reads power regardless of tapped state.
  let next = ensureCombat(state);
  if (!permanentHasKeyword(state, action.permanentId, "Vigilance")) {
    next = tapPermanent(next, action.permanentId);
  }

  // defenderId picks which opponent this attacker targets (Commander). In
  // Standard the dispatcher fills the lone opponent.
  const defender = action.defenderId || opponentsOf(state, action.playerId)[0];
  const attackerEntry = {
    permanentId: action.permanentId,
    attackingPlayer: action.playerId,
    defender,
    // PW-1: when attacking a planeswalker, combat damage is removed as loyalty from THIS walker
    // (not the player's life) — combatResolution reads defenderPlaneswalkerId. `defender` still
    // names the defending player (who declares blockers).
    ...(action.defenderPlaneswalkerId ? { defenderPlaneswalkerId: action.defenderPlaneswalkerId } : {}),
  };
  return {
    ...next,
    combat: {
      ...next.combat,
      attackers: [...next.combat.attackers, attackerEntry],
    },
    log: [
      ...next.log,
      { turn: state.turn, kind: "attack-declared", attackerId: action.permanentId, attackingPlayer: action.playerId },
    ],
  };
}

function applyDeclareBlocker(state, action) {
  const blocker = findCreatureOnBattlefield(state, action.playerId, action.permanentId);
  if (!blocker) throw new DispatcherError(`Permanent ${action.permanentId} not on battlefield`, "PERM_NOT_FOUND");

  const withCombat = ensureCombat(state);
  const blockerEntry = {
    blockerId: action.permanentId,
    blockingPlayer: action.playerId,
    attackerId: action.attackerId,
  };
  return {
    ...withCombat,
    combat: {
      ...withCombat.combat,
      blockers: [...withCombat.combat.blockers, blockerEntry],
    },
    log: [
      ...withCombat.log,
      { turn: state.turn, kind: "block-declared", blockerId: action.permanentId, attackerId: action.attackerId },
    ],
  };
}

// ─── Public dispatch ─────────────────────────────────────────────────────────

// CMD-COMPANION (CR 702.139) — resolve the "{3}: put this card from outside the game into your hand"
// action: pay {3}, move the companion → hand, and clear the `companion` field (once per game). The card is
// then a normal hand card; casting it is the ordinary cast-spell path (no commander tax — it's not a commander).
function applyCompanionToHand(state, action) {
  const player = state.players[action.playerId];
  const companion = player?.companion;
  if (!companion || companion.id !== action.cardId) {
    throw new DispatcherError("Companion is not available outside the game", "COMPANION_UNAVAILABLE");
  }
  const plan = planPayment(player.manaPool, manaSources(state, action.playerId), action.cost);
  if (!plan) throw new DispatcherError("Cannot pay {3} for the companion", "MANA_SHORT");
  let working = commitManaTaps(state, action.playerId, plan.taps);
  const toppedPool = working.players[action.playerId].manaPool;
  const nextPool = {};
  for (const c of Object.keys(toppedPool)) nextPool[c] = (toppedPool[c] || 0) - (plan.spend?.[c] || 0);
  const w = working.players[action.playerId];
  let next = {
    ...working,
    players: { ...working.players, [action.playerId]: { ...w, manaPool: nextPool, hand: [...w.hand, companion], companion: null } },
  };
  next = logEvent(next, { kind: "companion-to-hand", playerId: action.playerId, cardName: companion.name });
  // The actor keeps priority and the pass-in-succession chain resets: a special action doesn't pass
  // priority (CR 116.2g / 117.3c), so a stale consecutivePasses must not end the step early. This mirrors
  // every sibling active-window handler (applyPlayLand / applyCastSpell / applyActivateAbility / -Loyalty).
  return { ...next, priorityHolder: state.activePlayer, consecutivePasses: 0 };
}

const HANDLERS = {
  "pass-priority": applyPassPriority,
  "play-land": applyPlayLand,
  "cast-spell": applyCastSpell,
  "tap-for-mana": applyTapForMana,
  "activate-ability": applyActivateAbility,
  "cycle": applyCycle, // KW-CYCLING: discard a hand card to draw
  "activate-loyalty": applyActivateLoyalty,
  "declare-attacker": applyDeclareAttacker,
  "declare-blocker": applyDeclareBlocker,
  "companion-to-hand": applyCompanionToHand, // CMD-COMPANION (CR 702.139)
};

/**
 * Apply a single action to a state, returning the new state.
 *
 * Errors thrown:
 *   - DispatcherError(BAD_ACTION) — action is null or unknown kind
 *   - DispatcherError(...) — see individual handlers
 *
 * Callers should catch and surface to the user (typically: log the
 * error, leave state unchanged, ask the user for another choice).
 */
export function dispatchAction(state, action) {
  if (!action) {
    throw new DispatcherError("Cannot dispatch null action", "BAD_ACTION");
  }
  const handler = HANDLERS[action.kind];
  if (!handler) {
    throw new DispatcherError(`Unknown action kind: ${action.kind}`, "BAD_ACTION");
  }
  return handler(state, action);
}

/**
 * Convenience: clear the per-turn combat state. Called by the engine
 * at end-of-combat. Pure function.
 */
export function clearCombat(state) {
  if (!state.combat) return state;
  return { ...state, combat: { attackers: [], blockers: [] } };
}

// Re-export deductManaCost for tests that want to assert mana
// arithmetic directly without going through dispatchAction.
export { deductManaCost as _deductManaCostForTests };
