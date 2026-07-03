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
  MANA_COLORS,
  loseLife,
  removeCounter,
  addCounter,
  destroyLethalCreatures,
  mintId,
  isPlaneswalker,
  castsAsPlaneswalker,
  adjustLoyalty,
  markLoyaltyActivated,
  destroyZeroLoyaltyPlaneswalkers,
  recordSpellCast,
  clearRemovedFromCombatFlags,
} from "./gameState.js";
import { passPriority, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { manaSources, planPayment, sourcesExcludingOneShotVictim, commitPaymentPlan, commitManaTap } from "./manaModel.js";
import { parseEffectProgram } from "./effects/parser.js";
import { RESOLVER_KEYS, isPermanentSpell } from "./resolvers.js";
import { isAuraCard, isNativeAura, isNativeManaAura, entersTapped } from "./staticAbilityParser.js";
import { landDropAllowance } from "./legalChoices.js"; // EXTRA-LAND-DROPS: shared per-turn land allowance (CR 305.2/505.5b) — same reader the action gate uses
import { planeswalkerPlayable } from "./effects/loyaltyAbilities.js";
import { permanentHasKeyword } from "./layers.js";
import { checkCastTriggers, checkDiesTriggers, checkPlaneswalkerDiesTriggers, checkSacrificeTriggers, checkLandfallTriggers, checkEnterTriggers, checkLeavesTriggers } from "./triggers.js";
import { setPendingSoftCounterChoice } from "./pendingChoice.js";
import { wardTaxForSpell, wardTaxForStackObject } from "./ward.js";
import { groupWardTaxForSpell, groupWardTaxForStackObject } from "./groupWard.js";
import { entersWithFadeCounters } from "./fading.js";
import { applyXCastTokenTriggers } from "./xCastToken.js";

export class DispatcherError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "DispatcherError";
    this.code = code;
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function findCreatureOnBattlefield(state, playerId, permanentId) {
  const player = state.players[playerId];
  return player?.battlefield.find(p => p.id === permanentId) || null;
}

// W2: the old pool-only `deductManaCost` heuristic was DELETED — it diverged from the live planner
// (C-first generic, smaller-pool-side hybrid) and had zero production callers (test-only export).
// Every payment routes through manaModel.planPayment + commitPaymentPlan (the plan's own spend
// breakdown IS the deduction, so "affordable" and "actually paid" can never disagree).

// W1: the mana-commit implementation (tap loop + plan spend-deduction) lives in ONE place —
// manaModel.commitPaymentPlan / commitManaTap — shared with payManaCost (the resolution layer's
// payment) and applyTapForMana, so tap-for-mana semantics (one-shot Treasure cracks, sacrifice
// triggers, the CR 603.3b leave-drain, boost-Aura bonus mana) can never drift between paths.

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
  // EXTRA-LAND-DROPS (CR 305.2 / 505.5b): the allowance is 1 + every "play an additional land" static the
  // player controls (Exploration → 2, Azusa → 3). Same reader the action gate (legalChoices) uses, so the two
  // sites can't drift (the CREED two-sites invariant) — a turbo-land board can legally play its extra lands.
  if (player.landsPlayedThisTurn >= landDropAllowance(state, action.playerId)) {
    throw new DispatcherError("Already played a land this turn", "LAND_PER_TURN");
  }
  // IMPULSE-EXILE (CR 118.10): a land impulse-exiled this turn is played FROM EXILE (action.fromZone === "exile"),
  // not from hand — the same land-drop rules apply, only the source zone differs. Default "hand" keeps every
  // existing play-land call byte-identical. The card is found in whichever zone the action names.
  const fromZone = action.fromZone === "exile" ? "exile" : "hand";
  const card = (state.players[action.playerId]?.[fromZone] || []).find(c => c.id === action.cardId) || null;
  if (!card) throw new DispatcherError(`Card ${action.cardId} not in ${fromZone}`, "CARD_NOT_IN_ZONE");

  let next = moveCardToZone(state, {
    playerId: action.playerId,
    fromZone,
    toZone: "battlefield",
    cardId: action.cardId,
    becomePermanent: true,
  });
  // TRUNK-ENTERSTAPPED (CR 614.1c): a tapland (Temple / Triome / karoo / bounce land / tapped dual) enters
  // tapped, so it can't be tapped for mana the turn it's played. The freshly-minted land is the last
  // permanent on the battlefield (moveCardToZone pushes it). Only the BARE, unconditional form (entersTapped)
  // — a check/fast/reveal/shock land's gated tap is left untapped (the gate isn't evaluated; CREED-safe).
  if (entersTapped(card)) {
    const bf = next.players[action.playerId].battlefield;
    const entered = bf[bf.length - 1];
    if (entered) next = tapPermanent(next, entered.id);
  }
  // KW-FADING / KW-VANISHING (CR 702.32a / 702.63a): a fading/vanishing LAND enters with N fade/time
  // counters via the play-land path too (the PERMANENT_ETB resolver only covers cast creature/artifact
  // permanents). The upkeep remove-or-sacrifice (gameEngine) then ticks it down like any other.
  const fade = entersWithFadeCounters(card);
  if (fade && fade.n > 0) {
    const bf = next.players[action.playerId].battlefield;
    const entered = bf[bf.length - 1];
    if (entered) next = addCounter(next, { permanentId: entered.id, type: fade.type, amount: fade.n });
  }
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
  // LANDFALL (CR 603 — a triggered ability via the landfall ability word, CR 207.2c; not a replacement
  // effect) — the land just entered under this player's control, so fire any landfall watchers
  // ("Landfall — Whenever a land you control enters …"). The freshly-played land is the last permanent on
  // the battlefield. The pending triggers flush on the next priority pass like every other trigger.
  {
    const bf = next.players[action.playerId].battlefield;
    const enteredLand = bf[bf.length - 1];
    next = checkLandfallTriggers(next, enteredLand);
    // ETB on the play-land path (CR 603.6a) — a played land also fires "enters" triggers, NOT just
    // landfall. Without this a land's OWN ETB (Bojuka Bog "exile a graveyard", a Temple's "scry 1",
    // Radiant Fountain "gain 2 life") silently never fired when PLAYED (the cast path's enterPermanent
    // fires ETB, but lands are played, not cast). Additive + type-gated: creature-/artifact-/enchantment-
    // ETB watchers don't match a plain land (scopeMatches' isCreaturePerm / type checks), and landfall
    // descriptors are a distinct event, so this never double-fires landfall nor wrong-fires a creature
    // watcher. An unmodeled land ETB still routes to the Arbiter via buildTriggerStack (never fabricated).
    next = checkEnterTriggers(next, enteredLand);
  }
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

  // ADVENTURE (CR 715): when casting an Adventure card's FACE (`action.faceCard` — the adventure
  // instant/sorcery half from hand, or the creature half from adventure-exile), every cast-as-this-card
  // decision below (the `program` parse fallback, isPermanentSpell / isAura / castsAsPlaneswalker payload
  // routing, the stack `source`) must reflect the FACE, not the combined card the zone holds (whose type line
  // mixes Creature + Instant/Sorcery and would mis-route). The card is still spliced out of its zone by id.
  // For a normal cast faceCard is undefined and castCard === card (byte-identical behavior).
  const castCard = action.faceCard || card;

  // DISCOVER / free-cast (CR 601.2b — "cast without paying its mana cost"): skip the mana plan + payment
  // entirely when `action.freeCast` is set. ONLY the mana cost is waived — the ADDITIONAL costs below
  // (sacrifice / pay-life / discard) still apply, exactly as CR requires. Otherwise pay normally.
  let working;
  if (action.freeCast) {
    working = state;
  } else {
    // Plan payment from the current pool PLUS untapped mana sources. planPayment
    // is pool-first, so a pre-filled pool pays with zero taps (preserving the
    // old behavior + tests); otherwise we auto-tap lands/rocks/dorks to cover.
    const pool = state.players[action.playerId].manaPool;
    // EMERGE (CR 702.97): the creature being SACRIFICED to emerge can't ALSO tap for mana to pay the reduced
    // cost — exclude it from the sources (the γ1 double-spend guard, matching legalChoices' affordability
    // check and the activated-ability sac path). Plain casts (no emerge) keep every source.
    // W3 (two-sites invariant): an additional-cost sacrifice victim that is a ONE-SHOT mana source
    // (Treasure/Gold/Spawn) is likewise excluded — planPayment must never crack the very permanent the
    // cost sacrifice below re-finds (PERM_NOT_FOUND on an offered action). Emerge keeps its stricter
    // always-exclude (documented conservative FN); a repeatable victim still taps first legally.
    const castSources = sourcesExcludingOneShotVictim(
      action.emerge && action.sacCreatureId
        ? manaSources(state, action.playerId).filter((s) => s.permanentId !== action.sacCreatureId)
        : manaSources(state, action.playerId),
      action.sacCreatureId,
    );
    const plan = planPayment(pool, castSources, action.cost);
    if (!plan) {
      throw new DispatcherError("Cannot pay the spell's mana cost", "MANA_SHORT");
    }

    // Commit the plan (manaModel.commitPaymentPlan): add each source's mana and tap it — OR sacrifice
    // a one-shot Treasure/Gold — then deduct EXACTLY what the plan spent. Any surplus from an
    // over-producing source (Sol Ring on a single generic) floats — the floating-mana behavior we want.
    working = commitPaymentPlan(state, action.playerId, plan);
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
  // ADVENTURE: parse the FACE (castCard), not the combined card — a creature face has no program (null), so
  // the payload routes through isPermanentSpell; an adventure-spell face carries action.program already.
  const program = action.program || parseEffectProgram(castCard);
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

  // 2c. EMERGE (CR 702.97a) — the alt-cast's REQUIRED sacrifice (a creature, or an artifact for "Emerge from
  // artifact"), paid at cast before the spell goes on the stack (CR 601.2h). The reduced mana was already paid
  // above with the victim excluded from the sources, so the victim is still untapped here. sacrificePermanent-
  // ForCost moves it battlefield→graveyard and fires its dies + sacrifice watchers. FAIL-FAST: an emerge cast
  // with no chosen victim is an upstream bug — THROW rather than cast for free (silently skipping the sacrifice
  // is the cardinal false-positive failure, CLAUDE.md §1.2). The emerge keyword carries no effect-program, so
  // this is NOT folded into the additionalCosts loop above (that loop is for parser-attached spell costs).
  if (action.emerge) {
    if (!action.sacCreatureId) throw new DispatcherError("Emerge cast requires a sacrifice but no victim was chosen", "EMERGE_UNPAID");
    const victim = working.players[action.playerId]?.battlefield.find((p) => p.id === action.sacCreatureId);
    if (!victim) throw new DispatcherError(`Emerge sacrifice victim ${action.sacCreatureId} not on battlefield`, "PERM_NOT_FOUND");
    working = sacrificePermanentForCost(working, action.playerId, victim);
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
  if (action.bestow) {
    // BESTOW (CR 702.103): the card was cast for its bestow cost as an AURA enchanting the targeted
    // creature. Same AURA_ETB resolver as a printed Aura, but `bestowed: true` is threaded onto the
    // entering permanent so (a) layers.staticEffectsOf removes its Creature type while attached and (b)
    // the falls-off SBA exempts it (it stays on the battlefield + becomes a creature again when its host
    // leaves). The enchanted-creature bonus is the SAME parseAuraBonus descriptor layers already applies.
    const targetId = targets[0]?.id;
    payload = { resolver: RESOLVER_KEYS.AURA_ETB, params: { card: castCard, controller: action.playerId, targetId, bestowed: true } };
  } else if (isNativeAura(castCard)) {
    // Aura (CR 303.4f): resolve via the AURA_ETB resolver — enter the battlefield attached
    // to the targeted creature. The target id is the battlefield permanent chosen at cast.
    const targetId = targets[0]?.id;
    payload = { resolver: RESOLVER_KEYS.AURA_ETB, params: { card: castCard, controller: action.playerId, targetId } };
  } else if (isNativeManaAura(castCard)) {
    // AURA-LAND-MANA-BOOST (Wild Growth / Overgrowth / Fertile Ground): an Aura enchanting a LAND. Same
    // AURA_ETB resolver, but the target is a LAND (the resolver re-checks the type per the card). Once
    // attached, manaModel.landAuraManaBonus adds the extra mana inline when the land taps (CR 605.1b).
    const targetId = targets[0]?.id;
    payload = { resolver: RESOLVER_KEYS.AURA_ETB, params: { card: castCard, controller: action.playerId, targetId } };
  } else if (isAuraCard(castCard)) {
    // An Aura we can't model end-to-end (enchants a non-creature / restricted subject, or
    // carries an unmodeled bonus/ability). Route to the Arbiter seam rather than entering a
    // do-nothing unattached permanent — honest about the gap, never a silent no-op.
    payload = { resolver: RESOLVER_KEYS.SPELL_NOOP, params: { cardName: castCard.name, reason: "aura (unmodeled enchant or bonus)" } };
  } else if (castsAsPlaneswalker(castCard)) {
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
    payload = planeswalkerPlayable(castCard)
      ? { resolver: RESOLVER_KEYS.PERMANENT_ETB, params: { card: castCard, controller: action.playerId } }
      : { resolver: RESOLVER_KEYS.SPELL_NOOP, params: { cardName: castCard.name, reason: "planeswalker (unmodeled static/triggered ability)" } };
  } else if (program) {
    // P2.5: thread the cast-time choices (chosenMode for modal, xValue for X-spells)
    // frozen onto the action so resolution is deterministic + serializable.
    const params = { program, controller: action.playerId, targets, cardId: card.id };
    if (action.chosenMode != null) params.chosenMode = action.chosenMode;
    if (action.xValue != null) params.xValue = action.xValue;
    // KICKED-SPELL-EFFECT (CR 702.33e): a kicked cast threads the was-kicked flag so runEffectProgram runs the
    // `kickedOnly` atoms (the "If this spell was kicked, <extra>" payoff). A normal cast leaves it unset and the
    // kicked atoms are skipped (base-only). The kicker mana is already folded into action.cost by legalChoices.
    if (action.kicked) params.kicked = true;
    // ADVENTURE (CR 715.3d): after the adventure spell's effect resolves, the card is EXILED (not put into
    // the graveyard like a normal instant/sorcery). Stash the FULL card + its owner on the payload so the
    // EFFECT_PROGRAM resolver appends it to exile flagged `_onAdventure` (the creature half is then castable
    // from exile). Only set on an adventure cast — a normal spell carries no adventureExile and is unaffected.
    if (action.adventureCast) {
      params.adventureExile = { playerId: action.playerId, card };
    } else if (/\b(?:Instant|Sorcery)\b/.test(String(castCard?.type || castCard?.type_line || "").split(" // ")[0])) {
      // GY-1 (CR 608.2m): a natively-resolved instant/sorcery goes to its owner's GRAVEYARD as the
      // final resolution step — previously the card just vanished off the stack (every GY-count
      // consumer under-read). The disposition rides the payload; runEffectProgram applies it at its
      // two program-completion points (after ALL atoms — a spell never counts ITSELF in its graveyard).
      // Arbiter-routed spells (SPELL_NOOP / low-confidence) keep vanishing — the Arbiter owns their
      // disposition (a blanket GY would FP on unparsed self-exile riders). Storm copies strip the
      // param at clone (applyCopySpell) — a copy ceases to exist instead (CR 707.10a).
      params.spellToGraveyard = { playerId: action.playerId, card };
    }
    payload = { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params };
  } else if (isPermanentSpell(castCard)) {
    // ENTERS-WITH-X: a hydra cast for {X} threads its chosen X so PERMANENT_ETB adds X +1/+1 counters
    // (it enters at its real P/T, not a 0/0 that dies to the SBA).
    const params = { card: castCard, controller: action.playerId };
    if (action.xValue != null) params.xValue = action.xValue;
    // KICKER (CR 702.33b/e): a kicked cast threads the was-kicked flag so PERMANENT_ETB adds the kicked
    // "enters with N +1/+1 counters" replacement (resolvers.enterPermanent reads opts.kicked). The kicker
    // mana was already folded into action.cost and paid by the mana plan above — this only records that it
    // was paid. Omitted (undefined) on a normal cast, so the base body enters with no extra counters.
    if (action.kicked) params.kicked = true;
    payload = { resolver: RESOLVER_KEYS.PERMANENT_ETB, params };
  } else {
    payload = { resolver: RESOLVER_KEYS.SPELL_NOOP, params: { cardName: castCard.name, reason: "instant-or-sorcery (no recognized effect)" } };
  }

  // Mint a deterministic stack id; thread the advanced state (working2) so idSeq
  // persists onto the result.
  const { id: stkId, state: working2 } = mintId(working, "stk");
  const stackObject = createStackObject({
    id: stkId,
    kind: "spell",
    source: castCard, // ADVENTURE: the FACE being cast (its name drives cast-trigger matching + the log)
    controller: action.playerId,
    targets,
    cost: action.cost,
    payload,
  });

  // CMD-CAST: a cast FROM the command zone bumps the commander's cast count → the {2} tax grows on each
  // recast (CR 903.8 counts casts from the zone, so the cast counts even if it's later countered).
  const bumpCount = fromZone === "command"
    ? { commanderCastCount: { ...(player.commanderCastCount || {}), [card.commanderInstanceId || action.cardId]: (player.commanderCastCount?.[card.commanderInstanceId || action.cardId] || 0) + 1 } }
    : {};
  let next = {
    ...working2,
    players: {
      ...working2.players,
      [action.playerId]: {
        ...player, // W1: `player` re-reads `working` AFTER commitPaymentPlan, so it already carries the deducted pool
        [fromZone]: nextSrc,
        ...bumpCount,
      },
    },
    stack: [...working2.stack, stackObject],
  };
  next = logEvent(next, {
    kind: "cast-spell",
    playerId: action.playerId,
    cardName: castCard.name, // ADVENTURE: log the face being cast (the adventure or the creature half)
    cost: action.cost,
  });
  // Cast-spell triggers (CR 603.2): the spell is now on the stack, so "whenever you/an
  // opponent casts a … spell" watchers trigger and go on the stack ABOVE it (flush here,
  // not at a later checkpoint, so they resolve BEFORE the spell — correct order, and the
  // right thing for any future referential effect).
  next = recordSpellCast(next, { playerId: action.playerId }); // TRIG-CAST2: count this cast BEFORE firing, so "your second spell each turn" sees the running total
  next = checkCastTriggers(next, { spellCard: castCard, casterId: action.playerId, targets, xValue: action.xValue, stackObjectId: stkId }); // SELF-CAST: thread the chosen X so a "When you cast this spell" half-X/X payoff (Hydroid Krasis) resolves at the real X; STORM: thread the spell's stack id so the storm trigger can snapshot its payload to copy; ADVENTURE: the FACE cast (so "cast an Adventure spell" matches)
  next = flushTriggers(next, { chooseTargets: chooseTriggerTargets });
  // ZAXARA X-CAST: casting a spell with {X} → each of the caster's "cast a spell with {X} → make a token
  // with X +1/+1 counters" permanents makes its Hydra token (a real X/X). The general trigger compiler
  // doesn't model the token-with-X effect, so it's a targeted hook reading the chosen X (action.xValue).
  next = applyXCastTokenTriggers(next, { spellCard: card, casterId: action.playerId, xValue: action.xValue });
  // KW-WARD (CR 702.21): if this spell targets a single opponent-controlled ward permanent, the ward
  // triggers — counter the spell unless the caster pays the ward cost. Reuses the SOFT-COUNTER
  // pay-or-be-countered machinery (the pendingChoice decision + AI settle + UI + counter already exist),
  // raised "above" the spell after the cast triggers. Skipped if a trigger already set a pendingChoice
  // (setPendingSoftCounterChoice no-ops on an occupied slot — a safe FN for that rare overlap).
  // WI-6 REACHABILITY NOTE: state.pendingChoice is FIFO-guarded and the advanceUntilDecision driver
  // settles any pending choice BEFORE the next priority window (a pause blocks dispatchAction from being
  // called again until it clears), so within a single driver-run game this "occupied slot" branch is
  // ~unreachable — a normal cast-triggers flush can't itself already be paused when this code runs on the
  // SAME dispatch. It's real defense against a hand-built/malformed state (a test fixture, a future
  // caller invoking applyCastSpell directly with a pre-existing pendingChoice) rather than a live gap in
  // driver-run play. Documented rather than silently relied upon (§6-style).
  const wardTax = wardTaxForSpell(next, stackObject);
  if (wardTax) {
    next = setPendingSoftCounterChoice(next, {
      controller: action.playerId,
      cost: wardTax.cost, // KW-WARD-PR2: structured cost (mana | life); settle pays it by kind
      spellId: stkId,
      spellName: card.name,
      sourceName: wardTax.wardName,
    });
  }
  // DIFFUSION SLIVER (group-ward analogue): an opponent's spell targeting a single Sliver creature the
  // Diffusion controller controls raises the SAME pay-{2}-or-be-countered soft-counter (groupWard.js).
  // setPendingSoftCounterChoice no-ops on an occupied slot, so a ward tax already raised above takes
  // precedence (the rarer overlap under-applies one tax — a safe FN). No-op when no Diffusion is in play.
  // This IS reachable within a single dispatch (the ward tax above may already have occupied the slot on
  // the SAME call) — the FN is real, just rare (both a printed ward AND a controlled Diffusion Sliver
  // simultaneously targeted by one spell).
  const diffusionTax = groupWardTaxForSpell(next, stackObject);
  if (diffusionTax) {
    next = setPendingSoftCounterChoice(next, {
      controller: action.playerId,
      cost: diffusionTax.cost,
      spellId: stkId,
      spellName: card.name,
      sourceName: diffusionTax.wardName,
    });
  }
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

  // W1: commit through the ONE shared tap implementation (manaModel.commitManaTap) — add the mana (plus
  // any inline boost-Aura bonus, CR 605.1b), then TAP a repeatable source or SACRIFICE a one-shot
  // Treasure/Gold (action.sacrifices, set by legalChoices.actionsTapForMana; the crack fires sacrifice
  // watchers, CR 701.21, and drains its leave event at cost time, CR 603.3b — no stack push here, so the
  // trigger waits in pendingTriggers for the next priority flush, CR 603.3a). The action carries the same
  // { color, amount, bonus, sacrifices, permanentId } shape a payment-plan tap does.
  let next = commitManaTap(state, action.playerId, action);
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
 * DOUBLE-MANA-POOL (Doubling Cube — "{3}, {T}: Double the amount of each type of unspent mana you have.").
 * A MANA ability (CR 605.1a) — it resolves immediately, WITHOUT using the stack (CR 605.3a), exactly like
 * tap-for-mana. Pays the `{3}` mana (planPayment + auto-tap, with the source excluded so it never taps for
 * mana AND pays its own {T}) then taps the source for the `{T}`, then DOUBLES the activator's pool: for each
 * mana color, add another copy of the current amount (so N → 2N). The doubling reads the pool AFTER the {3}
 * has been spent (CR 605.3a — the cost is paid before the ability's effect applies), which is the correct
 * Oracle behavior: any mana still floating after paying {3} is what gets doubled.
 */
function applyDoubleManaPool(state, action) {
  const player = state.players[action.playerId];
  if (!player) throw new DispatcherError(`Unknown player ${action.playerId}`, "BAD_PLAYER");
  const perm = player.battlefield.find((p) => p.id === action.permanentId);
  if (!perm) throw new DispatcherError(`Permanent ${action.permanentId} not on battlefield`, "PERM_NOT_FOUND");
  if (action.tapSelf && perm.tapped) throw new DispatcherError("Ability source is already tapped", "ALREADY_TAPPED");

  // Pay the {mana} cost. The source paying its own {T} can't also tap for mana — exclude it (mirrors
  // legalChoices.actionsDoubleManaPool + applyActivateAbility exactly, the two-sites invariant).
  const sources = manaSources(state, action.playerId).filter(
    (s) => !(action.tapSelf && s.permanentId === action.permanentId),
  );
  const plan = planPayment(player.manaPool, sources, action.cost);
  if (!plan) throw new DispatcherError("Cannot pay the ability's mana cost", "MANA_SHORT");
  let working = commitPaymentPlan(state, action.playerId, plan);
  if (action.tapSelf) working = tapPermanent(working, action.permanentId);

  // Double the pool AFTER the cost is paid (CR 605.3a). addMana(color, amount = current) turns N into 2N per
  // color; addMana rejects negatives/non-integers, and every pool amount is a non-negative integer, so a 0
  // color is a harmless no-op (0 → 0). No stack push — a mana ability resolves as it's activated.
  const pool = working.players[action.playerId].manaPool;
  for (const color of MANA_COLORS) {
    const amount = pool[color] || 0;
    if (amount > 0) working = addMana(working, { playerId: action.playerId, color, amount });
  }
  return logEvent(working, {
    kind: "double-mana-pool",
    playerId: action.playerId,
    permanentId: action.permanentId,
    cardName: perm.card?.name,
    abilityText: action.abilityText,
  });
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
  } else {
    // LEAVE-DRAIN (CR 603.3b): a NON-creature cost sacrifice (Blood/Clue/artifact) has no dies path —
    // drain its leave event now so permanentLeaves watchers stack above the ability (the creature
    // branch drains via checkDiesTriggers' own first-line drain; re-draining is an idempotent no-op).
    next = checkLeavesTriggers(next);
  }
  // TRIG-SACRIFICE: a sac-as-cost is a sacrifice → fire "Whenever you sacrifice a <permanent|creature|
  // artifact>" for the sacrificing player (the perm has left, so its type rides on the lookBack card).
  next = checkSacrificeTriggers(next, playerId, { id: permObj.id, controller: playerId, card: permObj.card });
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
  // γ1d — the N fungible victims sacrificed for a "Sacrifice N <subtype>" cost are likewise excluded: a
  // Treasure cracked to pay the sac can't ALSO be cracked for the {mana} part (the double-spend that would
  // otherwise leave the victim already gone when the sac runs below).
  const pool = player.manaPool;
  const sacCountExcluded = new Set(action.sacCountIds || []);
  // W3: the γ1b chosen victim, when a ONE-SHOT mana source, is excluded exactly like legalChoices'
  // per-victim affordability (the two-sites invariant — offered ⇒ payable without cracking the victim).
  // γ1f: a creature TAPPED for a "Tap an untapped creature you control" cost can't ALSO tap for mana —
  // exclude it from the mana sources (mirrors legalChoices' per-victim affordability filter exactly).
  const sources = sourcesExcludingOneShotVictim(
    manaSources(state, action.playerId).filter(s =>
      !((action.tapSelf || action.sacSelf || action.exileSelf) && s.permanentId === action.permanentId) &&
      !(action.tapCreatureId && s.permanentId === action.tapCreatureId) &&
      // γ1g: a LAND returned to hand for a "Return a land you control" cost (Oboro) can't ALSO tap for mana —
      // it's gone before the {mana} is paid. Exclude it from the mana sources (mirrors legalChoices exactly).
      !(action.returnLandId && s.permanentId === action.returnLandId) &&
      !sacCountExcluded.has(s.permanentId)),
    action.sacCreatureId,
  );
  const plan = planPayment(pool, sources, action.cost);
  if (!plan) throw new DispatcherError("Cannot pay the ability's mana cost", "MANA_SHORT");

  let working = commitPaymentPlan(state, action.playerId, plan);

  // Pay the `{T}` part of the cost by tapping the source (after the mana taps, so the
  // source was already excluded from the mana plan above and can't be double-tapped).
  if (action.tapSelf) working = tapPermanent(working, action.permanentId);

  // Pay the non-mana cost items, all BEFORE the ability is put on the stack (CR 602.2b): life first
  // (γ1, CR 119.4), then the self-sacrifice (γ1) and/or the chosen-victim sacrifice (γ1b), then the
  // self-exile (γ1c) and/or a self counter removal (γ1c).
  if (action.payLife) working = loseLife(working, { playerId: action.playerId, amount: action.payLife });
  // γ1f — pay a "Tap an untapped creature you control" cost by TAPPING the chosen creature (CR 602.1b). The
  // victim is re-resolved against the LIVE battlefield; a missing / already-tapped victim is a hard error so we
  // never silently under-pay the cost (tapping is not a zone change, so no dies/leave triggers fire — a clean
  // cost payment). Done BEFORE the ability goes on the stack, like every other cost item.
  if (action.tapCreatureId) {
    const tv = working.players[action.playerId]?.battlefield.find((p) => p.id === action.tapCreatureId);
    if (!tv) throw new DispatcherError(`Tap-cost creature ${action.tapCreatureId} not on battlefield`, "PERM_NOT_FOUND");
    if (tv.tapped) throw new DispatcherError("Tap-cost creature is already tapped", "ALREADY_TAPPED");
    working = tapPermanent(working, action.tapCreatureId);
  }
  // γ1g — pay a "Return a land you control to its owner's hand" cost by moving the chosen land battlefield →
  // its OWNER's hand (CR 118 / 601.2b). The land is re-resolved against the LIVE battlefield; a missing victim
  // is a hard error so we never silently under-pay the cost (CREED — never activate without paying the full
  // cost). Returning a land is a battlefield EXIT, so — like the sacrifice-for-cost path — drain its leave
  // event (checkLeavesTriggers) so any modeled "leaves the battlefield" watcher stacks above the ability
  // (CR 603.3b). The offer-gate already excluded a land carrying an UNMODELED leaves/LTB trigger
  // (sacrificeDropsTrigger), so nothing is silently dropped here. Done BEFORE the ability goes on the stack,
  // like every other cost item. The engine uses controller as the owner proxy (consistent with the bounce
  // resolver's "owner's hand"), and the cost returns a land YOU control, so the activating player is correct.
  if (action.returnLandId) {
    const land = working.players[action.playerId]?.battlefield.find((p) => p.id === action.returnLandId);
    if (!land) throw new DispatcherError(`Return-cost land ${action.returnLandId} not on battlefield`, "PERM_NOT_FOUND");
    working = moveCardToZone(working, { playerId: action.playerId, fromZone: "battlefield", toZone: "hand", cardId: action.returnLandId });
    working = checkLeavesTriggers(working);
  }
  if (action.sacSelf) working = sacrificePermanentForCost(working, action.playerId, perm);
  if (action.sacCreatureId) {
    const victim = working.players[action.playerId]?.battlefield.find((p) => p.id === action.sacCreatureId);
    if (!victim) throw new DispatcherError(`Sacrifice victim ${action.sacCreatureId} not on battlefield`, "PERM_NOT_FOUND");
    working = sacrificePermanentForCost(working, action.playerId, victim);
  }
  // γ1d — pay a "Sacrifice N <fungible subtype>" cost: sacrifice each of the N chosen victims (battlefield →
  // graveyard, firing their dies + sacrifice watchers via sacrificePermanentForCost — cracking value tokens is
  // a real sacrifice, CR 701.21). Each id is re-resolved against the LIVE battlefield as the prior sacrifices
  // mutate it; a missing victim (already gone) is a hard error so we never silently under-pay the cost.
  if (action.sacCountIds?.length) {
    for (const vid of action.sacCountIds) {
      const v = working.players[action.playerId]?.battlefield.find((p) => p.id === vid);
      if (!v) throw new DispatcherError(`Sacrifice victim ${vid} not on battlefield`, "PERM_NOT_FOUND");
      working = sacrificePermanentForCost(working, action.playerId, v);
    }
  }
  if (action.exileSelf) {
    // Exile the source from the battlefield (CR 406). Exile is NOT "dies" (CR 700.4 — dies = to the
    // graveyard), so NO dies triggers fire; the offer-gate's leave-trigger fail-safe already excluded a
    // source with an LTB/exile trigger we couldn't fire, so nothing is silently dropped here.
    working = moveCardToZone(working, { playerId: action.playerId, fromZone: "battlefield", toZone: "exile", cardId: perm.id });
    // LEAVE-DRAIN (CR 603.3b): the self-exile is a battlefield EXIT — drain at cost time (see the
    // sacrifice sites above; exile is not "dies", so only the leave watchers fire).
    working = checkLeavesTriggers(working);
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
    // γ1e — a "Sacrifice X <subtype>" ability threads the chosen X into resolution (ctx.xValue), so an X-scaled
    // effect (Grim Hireling's "-X/-X") applies the SAME X the player paid in sacrificed Treasures. Only the sac-X
    // path sets action.xValue on an activated ability, so every other ability keeps its prior X-free params shape.
    if (action.xValue != null) params.xValue = action.xValue;
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
  // KW-WARD-PR2 (CR 702.21a): ward triggers on a spell OR an ABILITY an opponent controls — so an
  // opponent's activated/triggered ability targeting a single ward permanent raises the same pay-or-be-
  // countered choice as the cast path. An Equip ability targets the activator's OWN creature (controller
  // == caster), so wardTaxForStackObject returns null there — no false ward on equipping your own creature.
  // Skipped if a trigger above already set a pendingChoice (no-ops on an occupied slot — safe FN).
  // WI-6 REACHABILITY NOTE: same as the cast path above — advanceUntilDecision settles any pendingChoice
  // before the next dispatch, so a pre-existing occupied slot from an EARLIER action is ~unreachable
  // within driver-run play; the real (rarer) overlap is ward + Diffusion Sliver on the SAME dispatch (see
  // below), not a stale leftover choice from a prior turn.
  const abilityWardTax = wardTaxForStackObject(next, stackObject);
  if (abilityWardTax) {
    next = setPendingSoftCounterChoice(next, {
      controller: action.playerId,
      cost: abilityWardTax.cost,
      spellId: stkId,
      spellName: perm.card?.name,
      sourceName: abilityWardTax.wardName,
    });
  }
  // DIFFUSION SLIVER (group-ward analogue) — an opponent's ABILITY targeting a single Sliver the Diffusion
  // controller controls raises the same soft-counter (CR: Diffusion fires on a spell OR ability). Same
  // occupied-slot no-op precedence as the cast path. No-op when no Diffusion is in play.
  const abilityDiffusionTax = groupWardTaxForStackObject(next, stackObject);
  if (abilityDiffusionTax) {
    next = setPendingSoftCounterChoice(next, {
      controller: action.playerId,
      cost: abilityDiffusionTax.cost,
      spellId: stkId,
      spellName: perm.card?.name,
      sourceName: abilityDiffusionTax.wardName,
    });
  }
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
  let working = commitPaymentPlan(state, action.playerId, plan);

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
  const pwSba = destroyZeroLoyaltyPlaneswalkers(next);
  next = pwSba.state;
  // PLANESWALKER-DIES (CR 700.4) — a walker that paid itself to 0 loyalty also "dies"; fire its dies-watchers
  // so a creature-or-planeswalker drain (Cruel Celebrant) fires. creatureOrPwYouControl is the only scope that
  // responds; creature-only scopes skip a PW death.
  next = checkPlaneswalkerDiesTriggers(next, pwSba.dead);
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
    // RAID (CR 508.1): stamp the attacking player's per-turn attack flag — the sole attack chokepoint, idempotent
    // across multiple declared attackers. Read by the "you attacked this turn" intervening-if; reset at untap.
    players: { ...next.players, [action.playerId]: { ...next.players[action.playerId], attackedThisTurn: true } },
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
  let working = commitPaymentPlan(state, action.playerId, plan);
  const w = working.players[action.playerId]; // already carries the deducted pool (W1)
  let next = {
    ...working,
    players: { ...working.players, [action.playerId]: { ...w, hand: [...w.hand, companion], companion: null } },
  };
  next = logEvent(next, { kind: "companion-to-hand", playerId: action.playerId, cardName: companion.name });
  // The actor keeps priority and the pass-in-succession chain resets: a special action doesn't pass
  // priority (CR 116.2g / 117.3c), so a stale consecutivePasses must not end the step early. This mirrors
  // every sibling active-window handler (applyPlayLand / applyCastSpell / applyActivateAbility / -Loyalty).
  return { ...next, priorityHolder: state.activePlayer, consecutivePasses: 0 };
}

// DISCOVER (LCI) — resolve the cast-or-hand decision for a card found by discover (parked in exile,
// state.pendingDiscover). A free-cast routes through applyCastSpell (freeCast skips mana; additional costs
// still apply; the card goes on the stack to resolve normally) then clears the pending flag. For a NORMAL
// cast (no pending discover) this is a transparent pass-through.
function applyCastSpellMaybeDiscover(state, action) {
  const next = applyCastSpell(state, action);
  if (state.pendingDiscover && action.fromZone === "exile") {
    const { pendingDiscover: _drop, ...rest } = next;
    return rest;
  }
  // FREE-CAST (CR 601.2b) — a free-cast cast resolving a pendingFreeCast decision clears the flag (the "may"
  // was taken). The short-circuit in legalActionsForPlayer guarantees that while pendingFreeCast is set the
  // ONLY cast actions offered are the free-cast ones (action.freeCast), so this never clears the flag on an
  // unrelated cast. The card was cast FROM HAND, so no fromZone gate is needed beyond the freeCast marker.
  if (state.pendingFreeCast && action.freeCast) {
    const { pendingFreeCast: _drop, ...rest } = next;
    return rest;
  }
  // CASCADE (CR 702.85a) — a free-cast cast resolving a pendingCascade decision clears the flag (the "may" was
  // taken; the found card left exile onto the stack). The legalActionsForPlayer short-circuit guarantees that
  // while pendingCascade is set the ONLY cast actions offered are the free-cast-from-exile ones, so this never
  // clears the flag on an unrelated cast. Mirrors the discover free-cast-from-exile clear above.
  if (state.pendingCascade && action.freeCast && action.fromZone === "exile") {
    const { pendingCascade: _drop, ...rest } = next;
    return rest;
  }
  return next;
}

// FREE-CAST (CR 601.2b) — decline the optional free-cast ("you may cast …"): clear the pendingFreeCast flag,
// casting nothing. A no-op beyond clearing the decision (the controller chose not to take the "may"). The
// actor keeps priority and the pass chain resets, mirroring discover-to-hand (a non-stack decision resolution).
function applyFreeCastDecline(state, action) {
  if (!state.pendingFreeCast || state.pendingFreeCast.controller !== action.playerId) {
    const { pendingFreeCast: _drop, ...rest } = state; // defensive: stale/foreign decline → just clear
    return rest;
  }
  const { pendingFreeCast: _drop, ...rest } = state;
  return logEvent(rest, { kind: "free-cast-decline", playerId: action.playerId });
}
// DISCOVER — put the parked (exiled) found card into the controller's hand; clear the pending decision.
function applyDiscoverToHand(state, action) {
  let next = state;
  if ((state.players[action.playerId]?.exile || []).some((c) => c.id === action.cardId)) {
    next = moveCardToZone(state, { playerId: action.playerId, fromZone: "exile", toZone: "hand", cardId: action.cardId });
  }
  const { pendingDiscover: _drop, ...rest } = next;
  return logEvent(rest, { kind: "discover-to-hand", playerId: action.playerId, cardName: action.name || null });
}

// CASCADE (CR 702.85a) — decline the optional cascade cast ("You may cast it …"): the parked (exiled) found
// card joins "the rest" on the BOTTOM of the library (moveCardToZone exile→library appends, i.e. bottom), then
// clear the pending decision. This is the ONE behavioral difference from discover-to-hand (which puts the found
// card in hand): cascade bottoms it. A vanished card (defensive) just clears the flag. The actor keeps priority
// and the pass chain resets (a non-stack decision resolution), mirroring discover-to-hand / free-cast-decline.
function applyCascadeDecline(state, action) {
  if (!state.pendingCascade || state.pendingCascade.controller !== action.playerId) {
    const { pendingCascade: _drop, ...rest } = state; // defensive: stale/foreign decline → just clear
    return rest;
  }
  let next = state;
  const cardId = action.cardId ?? state.pendingCascade.cardId;
  if ((state.players[action.playerId]?.exile || []).some((c) => c.id === cardId)) {
    next = moveCardToZone(state, { playerId: action.playerId, fromZone: "exile", toZone: "library", cardId }); // → bottom (CR 702.85a)
  }
  const { pendingCascade: _drop, ...rest } = next;
  return logEvent(rest, { kind: "cascade-decline", playerId: action.playerId });
}

// PLOT (CR 702.171a) — the plot SPECIAL ACTION: pay the plot mana cost, then exile the card FACE-UP from
// hand ("plotted"). A special action does NOT use the stack (CR 116.2g) and does NOT pass priority. The
// plotted card is stamped `_plotted` + `_plottedTurn` (the turn it was plotted) so legalChoices won't offer
// it for a free cast until a LATER turn (CR 702.171b). No discard/sacrifice — the card exiles ITSELF as the
// action's effect (legalChoices only offered this for a plotPlayable card, so the card it becomes when later
// cast is fully modeled — no unmodeled text is silently parked in exile).
function applyPlot(state, action) {
  const player = state.players[action.playerId];
  if (!player) throw new DispatcherError(`Unknown player ${action.playerId}`, "BAD_PLAYER");
  const card = player.hand.find(c => c.id === action.cardId);
  if (!card) throw new DispatcherError(`Plot card ${action.cardId} not in hand`, "CARD_NOT_IN_HAND");

  // Pay the plot MANA cost (CR 702.171a — the plot cost is paid as the special action is taken).
  const plan = planPayment(player.manaPool, manaSources(state, action.playerId), action.cost);
  if (!plan) throw new DispatcherError("Cannot pay the plot cost", "MANA_SHORT");
  let working = commitPaymentPlan(state, action.playerId, plan);

  // Exile the card face-up (hand → exile), then stamp the plotted markers onto the exiled copy. The turn
  // stamp is what enforces "not the turn it was plotted" — legalChoices.actionsCastPlottedFromExile compares
  // `_plottedTurn !== state.turn`, so the same monotonic turn counter gates the delayed cast (no per-turn
  // reset flag to wire). moveCardToZone carries the same card object, so we re-find it in exile and flag it.
  working = moveCardToZone(working, { playerId: action.playerId, fromZone: "hand", toZone: "exile", cardId: action.cardId });
  const exile = working.players[action.playerId].exile;
  const idx = exile.findIndex(c => c.id === action.cardId);
  const flaggedExile = [...exile];
  flaggedExile[idx] = { ...exile[idx], _plotted: true, _plottedTurn: state.turn };
  working = { ...working, players: { ...working.players, [action.playerId]: { ...working.players[action.playerId], exile: flaggedExile } } };

  let next = logEvent(working, { kind: "plot", playerId: action.playerId, cardName: card.name, cost: action.cost });
  // A special action doesn't use the stack or pass priority (CR 116.2g / 117.3c) — the actor keeps priority
  // and the pass-in-succession chain resets (a stale consecutivePasses must not end the step early). Mirrors
  // applyCompanionToHand / applyPlayLand (the other non-stack active-window actions).
  return { ...next, priorityHolder: state.activePlayer, consecutivePasses: 0 };
}

const HANDLERS = {
  "pass-priority": applyPassPriority,
  "play-land": applyPlayLand,
  "cast-spell": applyCastSpellMaybeDiscover, // DISCOVER: clears pendingDiscover after a free-cast from exile
  "tap-for-mana": applyTapForMana,
  "double-mana-pool": applyDoubleManaPool, // DOUBLE-MANA-POOL (Doubling Cube): a no-stack mana ability that doubles the pool
  "activate-ability": applyActivateAbility,
  "cycle": applyCycle, // KW-CYCLING: discard a hand card to draw
  "plot": applyPlot,   // PLOT (CR 702.171a): exile a hand card face-up for the plot cost (special action)
  "activate-loyalty": applyActivateLoyalty,
  "declare-attacker": applyDeclareAttacker,
  "declare-blocker": applyDeclareBlocker,
  "companion-to-hand": applyCompanionToHand, // CMD-COMPANION (CR 702.139)
  "discover-to-hand": applyDiscoverToHand,   // DISCOVER: take the found card instead of casting it free
  "free-cast-decline": applyFreeCastDecline, // FREE-CAST (CR 601.2b): decline the optional "you may cast …"
  "cascade-decline": applyCascadeDecline,    // CASCADE (CR 702.85a): decline the free cast → found card to the bottom of the library
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
  // REGEN (CR 701.15a): a creature removed from combat by regeneration clears that transient flag when combat
  // ends, so it attacks/blocks normally next combat. Shared helper — the engine's end-of-combat reset uses it too.
  return { ...clearRemovedFromCombatFlags(state), combat: { attackers: [], blockers: [] } };
}
