/**
 * Phase 6 — Learn-to-Play: opponentAI.js
 *
 * Picks an action for the AI side. NOT trying to be a strong opponent
 * in v1 — just coherent and consistent enough that learning sessions
 * feel like a real game.
 *
 * Strategy: archetype-aware policy reusing goldfish v2's classifier.
 * Per archetype, we have a priority ordering for cast-spell candidates
 * (matching what runGoldfish v2 does internally). For everything else
 * (play-land, declare-attacker, declare-blocker), we use rule-based
 * heuristics tuned for "obvious correct play" — the AI isn't trying
 * to beat the user, just to play coherently.
 *
 * The action picker is deterministic given the same state + same
 * declaredArchetype. Tests pass a fake state and assert specific picks.
 *
 * Deferred:
 *   - Combat math (block-to-trade vs block-to-survive)
 *   - Bluffing / mana-held-up cues
 *   - Target selection on spells (the engine will surface a "pick
 *     target" decision after PR3.5 lands; for now, the AI passes
 *     when it would need to choose)
 *   - Card-specific synergies (Atraxa stacking proliferate triggers,
 *     etc.) — that's Arbiter or PR8+ territory
 */

import { detectArchetype } from "../goldfish.js";
import { filterActions } from "./legalChoices.js";
import { opponentsOf, findPermanent } from "./gameState.js";
import { permanentPower, permanentToughness, permanentHasKeyword, permanentIsCreature } from "./layers.js";
import { chooseAITarget } from "./spellEffects.js";
import { programContainsCounter, programContainsMassRemoval, programContainsTeamPump, programContainsFog, atomTargetIntent } from "./effects/parser.js";

// ─── Cast priority by archetype ──────────────────────────────────────────────

/**
 * Score a cast-spell action for the given archetype. Lower score =
 * cast sooner. Mirrors `buildCastScorer` from lib/goldfish.js (which
 * runGoldfish uses internally), but operating on a cast-spell
 * legal-action object rather than a fully-classified card.
 */
function scoreCastAction(action, card, archetype) {
  // Commander framework — the AI prioritizes casting its commander: a key threat + engine piece, and the
  // path to commander damage / the 21-loss (CR 903.10a). A command-zone cast outranks every other play
  // (lowest score wins), so the AI deploys its commander as soon as it can afford the taxed cost.
  if (action?.fromZone === "command" || card?.isCommander) return -1;
  const type = String(card?.type || card?.type_line || "");
  const oracle = String(card?.oracle || card?.oracle_text || "");
  const isCreature = /Creature/.test(type);
  const cmc = action.cmc || 0;

  // Heuristic flags — very rough versions of what goldfish.js does in
  // depth. Good enough for "play coherently."
  const isRamp = /add \{[WUBRGC]+/i.test(oracle) || /\bcreate.{0,30}treasure\b/i.test(oracle);
  const isDraw = /\bdraw\b/i.test(oracle);
  const isInteraction = /(counter target|destroy target|exile target|deals? \d+ damage)/i.test(oracle);
  const isTokenMaker = /create.+token/i.test(oracle);
  const isEquipment = /Equipment/.test(type);

  switch (archetype) {
    case "aggro":
      if (isCreature && cmc <= 2) return 0;
      if (isCreature && cmc <= 3) return 1;
      if (isInteraction) return 2;
      if (isRamp) return 3;
      return 5;
    case "control":
      if (isInteraction) return 0;
      if (isDraw) return 1;
      if (isRamp) return 2;
      return 4;
    case "combo":
      if (isRamp) return 0;
      if (isDraw) return 1;
      return 3;
    case "voltron":
      if (isRamp) return 0;
      if (isEquipment) return 1;
      return 2;
    case "tokens":
      if (isRamp) return 0;
      if (isTokenMaker) return 1;
      return 2;
    case "aristocrats":
      if (isRamp) return 0;
      if (isTokenMaker) return 1;
      return 2;
    case "ramp":
      if (isRamp) return 0;
      if (isDraw) return 1;
      if (cmc >= 7) return 2;
      return 3;
    case "midrange":
    default:
      if (isRamp) return 0;
      if (isDraw) return 1;
      if (isInteraction) return 2;
      return 3;
  }
}

// ─── Card lookup ─────────────────────────────────────────────────────────────

/**
 * Resolve a card by ID from the AI player's hand. Used to look up
 * full card data (oracle, type, mana) from the action's cardId.
 */
function cardFromHand(state, playerId, cardId) {
  const player = state.players[playerId];
  // CMD-CAST: a commander cast action (fromZone:"command") references a card in the command zone, not
  // the hand — check both so the AI can actually cast its commander (CR 903.8), not sit on it all game.
  return player?.hand.find(c => c.id === cardId)
    || player?.command?.find(c => c.id === cardId)
    || null;
}

// ─── Sub-pickers ──────────────────────────────────────────────────────────────

/**
 * Pick the best play-land action. Preference order:
 *   1. Lands that produce colors the AI needs (vs already has 2+ of)
 *   2. Otherwise: first land in hand alphabetically (stable)
 *
 * v1 doesn't do anything smart about basics-vs-duals or sequencing
 * tap-lands. That's PR8+ territory.
 */
function pickLandAction(state, aiPlayerId, landActions) {
  if (landActions.length === 0) return null;
  // For now, deterministic alphabetical pick. Mana-color-gap logic
  // would need to read the AI's commanders / hand colors which we
  // can revisit when archetype detection sees the full deck context.
  const sorted = [...landActions].sort((a, b) => a.name.localeCompare(b.name));
  return sorted[0];
}

/**
 * Pick the best cast-spell action via archetype-aware scoring. A targeted
 * spell appears once per legal target; we group by card, score each spell
 * once, and for targeted spells choose the AI's best enemy target — skipping
 * a targeted spell entirely when there's no good target (so the AI never
 * burns/destroys its own creatures). Returns null if nothing worth casting.
 */
function pickCastAction(state, aiPlayerId, castActions, archetype) {
  if (castActions.length === 0) return null;

  const byCard = new Map();
  for (const action of castActions) {
    if (!byCard.has(action.cardId)) byCard.set(action.cardId, []);
    byCard.get(action.cardId).push(action);
  }

  const scored = [];
  for (const [cardId, actions] of byCard) {
    const card = cardFromHand(state, aiPlayerId, cardId);
    if (!card) continue; // card vanished
    // The AI HOLDS any counter spell (deferred seam — it doesn't evaluate response
    // windows and must never counter its OWN spell). Explicit rather than relying on the
    // coincidence that a counter atom sorts its spell target first (P3.1 review finding:
    // counter+damage like Suffocating Blast held only by atom ordering). The player can
    // still cast counters normally; the AI simply passes.
    if (programContainsCounter(actions[0].program)) continue;
    // The AI HOLDS a symmetric board wipe (destroy/exile/-X-X all creatures): it can't yet
    // weigh whether the wipe nets out in its favor, and an indiscriminate Wrath into its own
    // board plays terribly. The player casts wipes normally. (Deferred board-state heuristic.)
    if (programContainsMassRemoval(actions[0].program)) continue;
    // The AI HOLDS a controller-scoped TEAM pump (Overrun / Trumpet Blast — "creatures you
    // control get +N/+N until end of turn"): the buff is its OWN, so this is purely a timing
    // call (cast it pre-combat into a profitable attack), which the AI can't make yet — casting
    // it blindly in its main phase wastes it. Holding only costs tempo, never a wrong play.
    // (Deferred "pump my team before a good attack" heuristic; player casts it normally.)
    if (programContainsTeamPump(actions[0].program)) continue;
    // The AI HOLDS a FOG ("prevent all combat damage this turn", FOG-1): it's a purely DEFENSIVE
    // reaction, and the AI can't yet time it — casting it in its own main phase would set the
    // turn-latch and wipe out ITS OWN attackers' damage (actively self-defeating). Holding only
    // costs a defensive option, never a wrong play. (Deferred "fog under lethal attack" heuristic.)
    if (programContainsFog(actions[0].program)) continue;
    // The AI HOLDS Auras (deferred seam): it doesn't yet weigh which creature to enchant
    // (buff its own attacker vs. curse an enemy) and must never hang a beneficial Aura on an
    // opponent. The player casts Auras normally; the AI passes. (Belt-and-suspenders — these
    // also have a null `effect`, so the targeted branch below would hold them anyway.)
    if (actions[0].isAuraSpell) continue;
    const effect = actions[0].effect;
    let chosen = actions[0];
    // KICKER (CR 702.33): a kicker creature is emitted as a normal cast plus — when the kicker mana is also
    // affordable — a `kicked:true` cast (legalChoices only offers the kicked option when payable). For the
    // modeled kicked payoff (enters with extra +1/+1 counters) the kicked creature is strictly bigger with
    // the identical body, so paying the kicker is always the higher-value play — prefer it when offered. This
    // is the AI's "decide yes/no by value": pay when affordable (the kicked action exists), else cast normally.
    const kickedAction = actions.find(a => a.kicked === true);
    if (kickedAction) {
      scored.push({ action: kickedAction, score: scoreCastAction(kickedAction, card, archetype), cmc: kickedAction.cmc || 0 });
      continue;
    }
    // δ-1b hand disruption (Duress / Thoughtseize / …): the target is an OPPONENT (a player), and the
    // card to strip is chosen at RESOLUTION (hand-blind at cast — the faithful flow). The targets are
    // opponents only by construction, so no self-target risk; the AI picks the opponent with the most
    // cards in hand (the most to disrupt), then autoPickHandDiscardCandidate takes their best card when
    // the spell resolves. This bypasses the chooseAITarget hold below (a program-only spell, null legacy
    // `effect`) so the AI actually plays its discard.
    if ((actions[0].program?.atoms || []).some(a => a.op === "discard-chosen")) {
      const handSize = (a) => (state.players?.[a.targets?.[0]?.id]?.hand || []).length;
      chosen = actions.reduce((best, a) => (handSize(a) > handSize(best) ? a : best), actions[0]);
    } else if ((actions[0].program?.atoms || []).some(a => a.op === "sacrifice")) {
      // ===== EDICTS ===== (Diabolic Edict / Cruel Edict): a program-only edict targeting a player. The AI
      // only ever edicts an OPPONENT that controls a creature to lose — never itself, never a creatureless
      // player (the edict would just fizzle) — and picks the opponent with the MOST creatures. The victim
      // creature is chosen at RESOLUTION (autoPickSacrificeCandidate sacs that opponent's least valuable).
      // Restricted to a PURE single-target edict (the player is the only chosen target): a multi-target
      // edict program (e.g. Grave Exchange = graveyard-return + edict) is HELD — the AI doesn't yet pick
      // the extra target — which is safe (a miss only costs tempo). Bypasses the chooseAITarget hold below.
      const creatureCount = (pid) => (state.players?.[pid]?.battlefield || [])
        .filter(p => permanentIsCreature(state, p.id)).length;  // layer-aware: an animated man-land counts
      const oppActions = actions.filter(a => {
        if ((a.targets?.length || 0) !== 1) return false;       // pure single-target edict only
        const tid = a.targets[0]?.id;
        return tid && tid !== aiPlayerId && creatureCount(tid) > 0;
      });
      if (oppActions.length === 0) continue; // no clean opponent target → the edict fizzles / is multi-target; hold
      chosen = oppActions.reduce((best, a) => (creatureCount(a.targets[0].id) > creatureCount(best.targets[0].id) ? a : best), oppActions[0]);
    } else if ((actions[0].program?.atoms || []).some(a => a.op === "fight-pair" || a.op === "damage-target-power")) {
      // TWO-CHOSEN-TARGET fight (Prey Upon / Pounce = fight-pair; Aggressive Instinct / Rabid Bite =
      // one-way damage-target-power): each cast action carries a role-tagged pair — a `fighter` (the AI's
      // own creature, the dealer) + a `target` (the creature it hits). The generic chooser below can't
      // score a two-target program (null legacy `effect`), so pick here. Discipline: the fighter must be
      // the AI's OWN creature and the target an ENEMY (never aim it at our own board), and the fight must
      // KILL the enemy (fighter power ≥ enemy toughness) — and for the two-way fight-pair the fighter must
      // SURVIVE (enemy power < fighter toughness) so we never trade our creature into a worse one. Among
      // qualifying casts, hit the biggest enemy; if none qualifies, HOLD (a miss only costs a card, never a
      // wrong play). CREED — a confidently-bad fight (suicide / friendly-fire) is never offered.
      const oneWay = (actions[0].program.atoms).some(a => a.op === "damage-target-power");
      const enemies = new Set(opponentsOf(state, aiPlayerId));
      const lk = (id) => findPermanent(state, id)?.permanent;
      const good = [];
      for (const a of actions) {
        const fighterT = (a.targets || []).find(t => t.role === "fighter");
        const targetT = (a.targets || []).find(t => t.role === "target");
        if (!fighterT || !targetT) continue;
        if (fighterT.controller !== aiPlayerId) continue;            // our fighter must be ours
        if (!enemies.has(targetT.controller)) continue;              // the victim must be an opponent's
        const fp = lk(fighterT.id), tp = lk(targetT.id);
        if (!fp || !tp) continue;
        const fPow = Math.max(0, permanentPower(state, fighterT.id));
        const tTou = Math.max(0, permanentToughness(state, targetT.id));
        const tPow = Math.max(0, permanentPower(state, targetT.id));
        const fTou = Math.max(0, permanentToughness(state, fighterT.id));
        const fDeath = permanentHasKeyword(state, fighterT.id, "Deathtouch");
        const kills = (fDeath && fPow > 0) || (tTou > 0 && fPow >= tTou); // lethal to the enemy
        if (!kills) continue;
        if (!oneWay && tPow >= fTou) continue;                        // fight-pair: our fighter would die → skip
        good.push({ a, enemyPow: tPow });
      }
      if (good.length === 0) continue;                               // no profitable fight → hold
      chosen = good.sort((x, y) => y.enemyPow - x.enemyPow)[0].a;    // kill the biggest threat
    } else if (actions.some(a => a.targets?.length)) {
      // A targeted spell: only cast on a good ENEMY target. chooseAITarget filters to
      // enemies for the scorable legacy effects (damage/destroy); for spells it can't
      // score yet (effect == null — the P2.7 extended atoms tap/bounce/exile/counters)
      // it returns null, so the AI HOLDS them rather than aim removal at its own board.
      const options = actions.map(a => a.targets?.[0]).filter(Boolean);
      const target = effect ? chooseAITarget(state, aiPlayerId, effect, options) : null;
      if (!target) continue;
      chosen = actions.find(a => a.targets?.[0]?.id === target.id) || actions[0];
    }
    scored.push({ action: chosen, score: scoreCastAction(actions[0], card, archetype), cmc: actions[0].cmc || 0 });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => a.score - b.score || a.cmc - b.cmc);
  return scored[0].action;
}

/**
 * Degenerate fallback: attack with every legal attacker. Used only when the AI
 * can't evaluate the board (no living/identifiable defender — e.g. a bare test
 * state). Defaulting to "swing" here is deliberate: never freezing means the
 * anti-loop latch can't mistake the AI for a stalled game. Real boards go through
 * the profitability heuristic in `selectProfitableAttackers`.
 */
function pickAllAttackers(attackerActions) {
  return attackerActions;
}

/**
 * Pick blocking assignments. v1 policy: block only when the AI has
 * a higher-toughness creature than the attacker's power (no trades,
 * just chumps when forced). For PR4 we keep this minimal — pick one
 * blocker per attacker, preferring the smallest legal blocker.
 * Returns an array of declare-blocker actions.
 */
function pickBlockers(blockerActions, state) {
  if (blockerActions.length === 0) return [];

  // Group by attackerId so each gets at most one blocker.
  const assigned = new Map();
  const sorted = [...blockerActions].sort((a, b) => {
    // Prefer smaller creatures (cheaper-to-lose chump blockers). DERIVED power
    // (anthems/lords applied), so the AI chumps with what's actually smallest (F7a).
    const aPow = Math.max(0, permanentPower(state, a.permanentId));
    const bPow = Math.max(0, permanentPower(state, b.permanentId));
    return aPow - bPow;
  });

  for (const action of sorted) {
    if (!assigned.has(action.attackerId)) {
      assigned.set(action.attackerId, action);
    }
  }
  return [...assigned.values()];
}

// ─── Loyalty-ability piloting (PW-3) ────────────────────────────────────────────

/**
 * The atoms of a modeled loyalty ability's effect program (non-modal — `modeled` requires it).
 */
function loyaltyAtoms(action) {
  return action.program?.atoms || [];
}

/**
 * Is this loyalty action SAFE + on-intent for the AI to activate? A non-targeted ability is always
 * safe. A targeted ability is safe only when every chosen target sits on its atom's intended side —
 * a harmful atom (removal/damage/−X−X, intent "enemy") aimed at an OPPONENT, a beneficial atom
 * (buff/+1/+1/own, intent "own") aimed at the AI's OWN permanent. An ambiguous-intent targeted atom
 * is rejected (don't risk hitting the wrong side) — mirrors the trigger chooser's discipline.
 */
function loyaltyActionSafe(state, aiPlayerId, action) {
  const targets = action.targets || [];
  if (targets.length === 0) return true;
  let enemies;
  try { enemies = new Set(opponentsOf(state, aiPlayerId)); } catch { return false; }
  const atoms = loyaltyAtoms(action);
  const sideOf = (t) => (t.type === "player" ? t.id : t.controller);
  return targets.every((t) => {
    const intent = atomTargetIntent(atoms[t.atomIndex]);
    if (intent === "enemy") return enemies.has(sideOf(t));
    if (intent === "own") return sideOf(t) === aiPlayerId;
    return false; // ambiguous targeted atom → skip rather than risk the wrong side
  });
}

/** Value of activating a loyalty action: removal/damage on an enemy is impactful; otherwise build loyalty. */
function loyaltyActionScore(action) {
  const atoms = loyaltyAtoms(action);
  const harmful = (action.targets || []).some((t) => atomTargetIntent(atoms[t.atomIndex]) === "enemy");
  if (harmful) return 100;                          // an enemy-side removal/damage ability
  return 40 + Math.max(0, action.costDelta || 0);   // build loyalty; prefer a higher +N
}

/**
 * Pick the best MODELED loyalty ability for the AI to activate this turn (the caller pre-filters out
 * Arbiter-routed ones so self-play never stalls). Among safe/on-intent actions, prefer an enemy-side
 * removal, else the highest loyalty-building +N. Returns null when nothing is safe (the AI then
 * leaves that walker alone this turn). Deterministic → serialize-stable.
 */
export function pickLoyaltyAction(state, aiPlayerId, loyaltyActions) {
  const safe = (loyaltyActions || []).filter((a) => loyaltyActionSafe(state, aiPlayerId, a));
  if (safe.length === 0) return null;
  return safe.slice().sort((a, b) => loyaltyActionScore(b) - loyaltyActionScore(a))[0];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Pick a single action from the legal actions list. Returns the chosen
 * action (one of the items in `actions`), or null if no action makes
 * sense (caller should pass priority).
 *
 * Priority order:
 *   1. play-land if available (always — never skip a land drop)
 *   2. cast-spell via archetype scoring
 *   3. declare-attacker — only the first one; engine batches
 *      attackers per step, but the picker is called for the FIRST
 *      decision; downstream the engine reads pickAttackPlan instead.
 *   4. pass-priority (the fallback)
 *
 * For attacks and blocks (which are batch decisions), use the
 * specialized pickers below.
 */
export function pickAction(state, aiPlayerId, actions, { archetype = null } = {}) {
  if (!Array.isArray(actions) || actions.length === 0) return null;

  // DISCOVER (LCI) — a pending discover decision short-circuits everything (legalChoices offers ONLY the
  // free-cast options + put-to-hand). Cast the found card free if pickCastAction likes a cast (a free
  // permanent body, or a spell with a good enemy target); it HOLDS counters / declines a targetless or
  // self-harmful cast → fall through to taking the card to hand. Never returns null (there is no pass here).
  if (state.pendingDiscover && state.pendingDiscover.controller === aiPlayerId) {
    const castOpts = filterActions(actions, "cast-spell");
    const pick = castOpts.length ? pickCastAction(state, aiPlayerId, castOpts, archetype) : null;
    return pick || actions.find(a => a.kind === "discover-to-hand") || actions[0] || null;
  }

  // Combat is a batch decision, but the driver applies one action per tick.
  // We compute the plan and return its first still-legal choice; declared
  // attackers/blockers are excluded from the legal set next tick (attackers
  // tap on declare; blockers are tracked), so each tick drains one and the
  // step empties, after which we fall through to pass.
  if (state.step === "declare-attackers") {
    const attackerActions = filterActions(actions, "declare-attacker");
    if (attackerActions.length > 0) {
      const plan = pickAttackPlan(state, aiPlayerId, attackerActions);
      if (plan.length > 0) return plan[0];
    }
  }
  if (state.step === "declare-blockers") {
    // Only consider attackers we haven't blocked yet (v1: one blocker each),
    // so the AI doesn't pile redundant blockers on the same attacker.
    const blocked = new Set((state.combat?.blockers || []).map(b => b.attackerId));
    const blockerActions = filterActions(actions, "declare-blocker").filter(a => !blocked.has(a.attackerId));
    if (blockerActions.length > 0) {
      const plan = pickBlockPlan(state, aiPlayerId, blockerActions);
      if (plan.length > 0) return plan[0];
    }
  }

  const lands = filterActions(actions, "play-land");
  if (lands.length > 0) {
    const land = pickLandAction(state, aiPlayerId, lands);
    if (land) return land;
  }

  const casts = filterActions(actions, "cast-spell");
  if (casts.length > 0) {
    // Resolve archetype lazily if not supplied. Caller usually passes
    // it for performance — recomputing detectArchetype per priority
    // window is wasteful.
    const aiDeck = { cards: deriveDeckRepresentation(state, aiPlayerId) };
    const detected = archetype || detectArchetype(aiDeck, {}).archetype;
    const cast = pickCastAction(state, aiPlayerId, casts, detected);
    if (cast) return cast;
  }

  // Activate a beneficial loyalty ability (PW-3). Only MODELED abilities (the AI knows what they do);
  // Arbiter-routed ones are skipped so self-play never stalls. After lands + casts so the board is
  // developed first; the once-per-turn rule (enforced in the offer) caps it at one per walker.
  const loyalties = filterActions(actions, "activate-loyalty").filter(a => !a.routeToArbiter);
  if (loyalties.length > 0) {
    const loy = pickLoyaltyAction(state, aiPlayerId, loyalties);
    if (loy) return loy;
  }

  // No active-window action — pass priority. (The engine's combat
  // step pickers below handle declare-attackers/blockers as batch
  // decisions, not via pickAction.)
  return actions.find(a => a.kind === "pass-priority") || null;
}

/** Count an opponent's untapped creatures (rough "how hard to push through"). */
function untappedBlockerCount(state, playerId) {
  const bf = state.players?.[playerId]?.battlefield || [];
  return bf.filter(p => permanentIsCreature(state, p.id) && !p.tapped).length;  // layer-aware (animated man-lands)
}

/**
 * Which opponent should the AI swing at? Heuristic (design §11.5): the
 * lowest-life living opponent; ties broken by who has the fewest untapped
 * blockers (easiest to push damage through). Returns null when there's no
 * living opponent. In Standard this is just the lone opponent.
 */
function chooseDefender(state, aiPlayerId) {
  const living = opponentsOf(state, aiPlayerId).filter(id => (state.players?.[id]?.life ?? 0) > 0);
  if (living.length === 0) return null;
  return living.slice().sort((a, b) => {
    const lifeDiff = state.players[a].life - state.players[b].life;
    if (lifeDiff !== 0) return lifeDiff;
    return untappedBlockerCount(state, a) - untappedBlockerCount(state, b);
  })[0];
}

/** First/double strike on a permanent (layer-aware), guarded against bad ids. */
function hasFirstStrike(state, permanentId) {
  try {
    return permanentHasKeyword(state, permanentId, "First strike") ||
      permanentHasKeyword(state, permanentId, "Double strike");
  } catch { return false; }
}

/** Derived P/T (+ first-strike) of a player's UNTAPPED creatures — its blockers. */
function untappedDefenderBlockers(state, defenderId) {
  const bf = state.players?.[defenderId]?.battlefield || [];
  return bf
    .filter(p => permanentIsCreature(state, p.id) && !p.tapped)  // layer-aware (animated man-lands)
    .map(p => ({
      power: Math.max(0, permanentPower(state, p.id)),
      toughness: permanentToughness(state, p.id),
      firstStrike: hasFirstStrike(state, p.id),
    }));
}

/**
 * Would this attacker die "for nothing"? True when some untapped blocker can kill
 * it (blocker power ≥ attacker toughness) without the attacker getting value back.
 * The defender, not the attacker, picks the block — so one such free-kill blocker
 * is enough to make the swing a bad trade; a competent racer holds these back
 * (unless the whole swing is lethal). Cases, given a blocker that CAN kill it:
 *   - blocker has first/double strike and the attacker doesn't → the attacker dies
 *     in the first-strike step before it can deal, so it dies for nothing.
 *   - otherwise (simultaneous damage): only "for nothing" if the blocker survives
 *     the attacker's hit (blocker toughness > attacker power); an even/ favorable
 *     trade (attacker power ≥ blocker toughness) is allowed.
 */
function attackerDiesForNothing(power, toughness, blockers, attackerHasFS = false) {
  return blockers.some(b => {
    if (b.power < toughness) return false;            // this blocker can't kill the attacker
    if (b.firstStrike && !attackerHasFS) return true; // strikes first → attacker never deals back
    return b.toughness > power;                        // vanilla: blocker outlives the attacker's hit
  });
}

/**
 * Is the swing lethal this turn? The defender blocks optimally to minimize face
 * damage — i.e. it chump-blocks the highest-power attackers — so the unavoidable
 * damage is the sum of the powers of every attacker beyond the defender's blocker
 * count. If that meets or exceeds the defender's life, the alpha strike kills.
 */
function swingIsLethal(attackerPowers, blockerCount, defenderLife) {
  if (defenderLife <= 0) return false;
  const unblocked = [...attackerPowers].sort((a, b) => b - a).slice(blockerCount);
  return unblocked.reduce((s, p) => s + p, 0) >= defenderLife;
}

/**
 * "Competent racer" attack policy: return the SET of attacker permanentIds the AI
 * should commit against `defenderId`. Swing the whole team when it's lethal or the
 * defender has no blockers (free damage); otherwise swing only creatures that
 * won't just die for nothing to a free-kill block. Returns null when the board
 * can't be evaluated (no defender / unknown seat), signalling "attack with all".
 *
 * Lethality is judged over the FULL swing — attackers already declared THIS combat
 * (state.combat.attackers, tapped + excluded from the shrinking legal set) PLUS the
 * still-legal candidates. The driver declares one attacker per tick, so without
 * folding the committed ones back in, a lethal alpha strike would lose its lethal
 * status after the first attacker taps and the rest would (correctly, for a
 * non-lethal swing) be held — fizzling the kill. (Found in adversarial review.)
 */
function selectProfitableAttackers(state, aiPlayerId, attackerActions, defenderId) {
  if (!defenderId || !state.players?.[defenderId]) return null;
  const blockers = untappedDefenderBlockers(state, defenderId);
  const defenderLife = state.players[defenderId].life ?? 0;

  const permIds = [...new Set(attackerActions.map(a => a.permanentId))];
  const stats = new Map(permIds.map(id => [id, {
    power: Math.max(0, permanentPower(state, id)),
    toughness: permanentToughness(state, id),
    firstStrike: hasFirstStrike(state, id),
  }]));

  // Powers of attackers ALREADY committed this combat against this same defender.
  const committedPowers = (state.combat?.attackers || [])
    .filter(a => a.attackingPlayer === aiPlayerId && a.defender === defenderId)
    .map(a => Math.max(0, permanentPower(state, a.permanentId)));
  const candidatePowers = [...stats.values()].map(s => s.power);
  const lethal = swingIsLethal([...committedPowers, ...candidatePowers], blockers.length, defenderLife);

  const chosen = new Set();
  for (const id of permIds) {
    const { power, toughness, firstStrike } = stats.get(id);
    if (lethal || blockers.length === 0 || !attackerDiesForNothing(power, toughness, blockers, firstStrike)) {
      chosen.add(id);
    }
  }
  return chosen;
}

/**
 * Batch-decision picker for declare-attackers: returns the array of attacker
 * actions the AI commits to, after the "competent racer" profitability filter
 * (alpha-strike when lethal / open; hold back creatures that would die for
 * nothing). Engine passes the result to its combat-state tracker.
 *
 * Commander: the legal-action set has one entry per (creature, defender); the AI
 * focuses the chosen target (chooseDefender) and emits one action per surviving
 * attacker. Standard: the actions carry no defenderId (the dispatcher fills the
 * lone opponent), so this returns the profitable subset.
 */
// MUST-ATTACK (subsystem 4, CR 508.1a) — does THIS card carry a self "attacks each combat/turn if able"
// requirement? Normalize the card name → "this creature" (so "Crazed Goblin attacks each combat if able"
// matches), then require the bare self subject — a GROUP form ("creatures you control attack…", "each
// creature attacks…", "attacking creatures…") is excluded (it's not a self requirement on this permanent).
function selfMustAttack(card) {
  const o = String(card?.oracle || card?.oracle_text || "");
  if (!/attacks each (?:combat|turn) if able/i.test(o)) return false;
  const name = String(card?.name || "").split(" //")[0].trim();
  const t = name ? o.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "this creature") : o;
  return /\bthis creature attacks each (?:combat|turn) if able\b/i.test(t);
}

export function pickAttackPlan(state, aiPlayerId, attackerActions) {
  if (!Array.isArray(attackerActions) || attackerActions.length === 0) return [];
  const hasDefenderChoice = attackerActions.some(a => a.defenderId);
  const target = chooseDefender(state, aiPlayerId);
  const chosen = selectProfitableAttackers(state, aiPlayerId, attackerActions, target);
  // MUST-ATTACK (subsystem 4, CR 508.1a) — a creature that "attacks each combat/turn if able" MUST be
  // declared if it can. It's already in attackerActions (the eligible set, i.e. "able"), so force-include
  // it regardless of the profitability filter (the racer would otherwise illegally hold back an
  // unprofitable must-attacker). The chooseDefender/walker focus still picks ITS target below.
  const forced = new Set(
    attackerActions
      .filter(a => selfMustAttack(state.players?.[aiPlayerId]?.battlefield?.find(p => p.id === a.permanentId)?.card))
      .map(a => a.permanentId),
  );

  if (!hasDefenderChoice) {
    // Standard: one action per creature, no defenderId. Can't evaluate → swing all.
    if (chosen === null) return pickAllAttackers(attackerActions);
    return attackerActions.filter(a => chosen.has(a.permanentId) || forced.has(a.permanentId));
  }

  // Commander: focus the chosen target, one action per attacking creature.
  const byPermanent = new Map();
  for (const a of attackerActions) {
    if (chosen !== null && !chosen.has(a.permanentId) && !forced.has(a.permanentId)) continue;
    if (!byPermanent.has(a.permanentId)) byPermanent.set(a.permanentId, []);
    byPermanent.get(a.permanentId).push(a);
  }

  // PW-3: remove an enemy planeswalker when it's a clean, worthwhile kill. Focus the whole chosen
  // swing on the most dangerous enemy walker the AI can kill this combat — but only when the swing
  // isn't lethal on the focused player (kill the player first) and the walker's controller has no
  // untapped blockers (a clean hit, no wasted attack). Overkill is fine for v1.
  const chosenPowers = [...byPermanent.values()].map(opts => Math.max(0, permanentPower(state, opts[0].permanentId)));
  const walkerTarget = chooseWalkerToKill(state, aiPlayerId, attackerActions, target, chosenPowers);

  const plan = [];
  for (const opts of byPermanent.values()) {
    if (walkerTarget) {
      const atWalker = opts.find(o => o.defenderPlaneswalkerId === walkerTarget.walkerId);
      if (atWalker) { plan.push(atWalker); continue; }
    }
    plan.push((target && opts.find(o => o.defenderId === target && !o.defenderPlaneswalkerId)) || opts[0]);
  }
  return plan;
}

/**
 * Pick an enemy planeswalker for the AI to remove this combat (PW-3): the highest-loyalty enemy
 * walker whose controller has NO untapped blockers (a clean hit) and whose loyalty the chosen
 * attackers' total power can cover — UNLESS the swing is already lethal on the focused player (kill
 * the player first). Returns { walkerId, loyalty } or null. Deterministic → serialize-stable.
 */
function chooseWalkerToKill(state, aiPlayerId, attackerActions, targetPlayer, chosenPowers) {
  const totalChosen = chosenPowers.reduce((s, p) => s + p, 0);
  let best = null;
  const seen = new Set();
  for (const a of attackerActions) {
    if (!a.defenderPlaneswalkerId || seen.has(a.defenderPlaneswalkerId)) continue;
    seen.add(a.defenderPlaneswalkerId);
    if (untappedBlockerCount(state, a.defenderId) > 0) continue; // defender could block → not a clean kill
    const walker = state.players?.[a.defenderId]?.battlefield?.find(p => p.id === a.defenderPlaneswalkerId);
    const loy = walker?.counters?.loyalty;
    if (loy != null && loy > 0 && totalChosen >= loy && (!best || loy > best.loyalty)) {
      best = { walkerId: a.defenderPlaneswalkerId, loyalty: loy };
    }
  }
  // Don't divert from a lethal swing on the focused player.
  if (best && targetPlayer && state.players[targetPlayer]) {
    const committed = (state.combat?.attackers || [])
      .filter(x => x.attackingPlayer === aiPlayerId && x.defender === targetPlayer && !x.defenderPlaneswalkerId)
      .map(x => Math.max(0, permanentPower(state, x.permanentId)));
    const blockers = untappedDefenderBlockers(state, targetPlayer);
    if (swingIsLethal([...committed, ...chosenPowers], blockers.length, state.players[targetPlayer].life ?? 0)) return null;
  }
  return best;
}

/**
 * Batch-decision picker for declare-blockers.
 */
export function pickBlockPlan(state, _aiPlayerId, blockerActions) {
  // _aiPlayerId kept for the stable positional API; block sizing now reads
  // derived power straight off `state` (F7a), so the owner id isn't needed.
  return pickBlockers(blockerActions, state);
}

// ─── Deck-context helper ──────────────────────────────────────────────────────

/**
 * Construct a card list shape compatible with detectArchetype() from
 * the AI player's CURRENT zones (library + hand + battlefield + graveyard
 * + command). Used to bias play decisions to the deck's actual shape.
 * Cards in exile/sideboard aren't included — they don't reflect the
 * deck's identity for the rest of the game.
 *
 * Public for tests; consumers should use pickAction.
 */
export function deriveDeckRepresentation(state, playerId) {
  const player = state.players[playerId];
  if (!player) return [];
  const zones = [
    player.library, player.hand, player.battlefield, player.graveyard, player.command,
  ];
  const cards = [];
  for (const zone of zones) {
    for (const item of zone) {
      // Battlefield entries are permanents; unwrap to .card. Other
      // zones contain raw card objects.
      const card = item?.card || item;
      if (card?.name) {
        cards.push({ name: card.name, qty: 1, section: "Mainboard" });
      }
    }
  }
  return cards;
}
