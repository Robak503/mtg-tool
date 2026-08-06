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
  updatePermanentSafe,
  addMana,
  MANA_COLORS,
  loseLife,
  spendEnergy,
  creaturePower,
  creatureToughness,   // SACRIFICED REFERENT — layer-aware toughness of the cost victim, captured pre-sacrifice
  creatureBasePower,
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
  recordGraveyardEvents,
  findPermanent,
} from "./gameState.js";
import { passPriority, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { manaSources, planPayment, sourcesExcludingOneShotVictim, commitPaymentPlan, commitManaTap, payManaCost } from "./manaModel.js";
import { attackTaxToDeclare } from "./attackTax.js"; // ATTACK TAX (CR 508.1g) — the payment half; legalChoices holds the restriction half
import { parseEffectProgram, parseEffectClause, programConfidence } from "./effects/parser.js";
import { stripCostOnlyKeywordLines } from "./effects/parseHelpers.js"; // CONVOKE/AFFINITY are cost-only — strip before the cast-effect parse so the runtime resolves the body natively (matches the classifier; fixes a classifier↔runtime pendingArbiter mismatch)
import { RESOLVER_KEYS, isPermanentSpell } from "./resolvers.js";
import { isAuraCard, isNativeAura, isNativeManaAura, isPlayerAuraCard, entersTapped, impositionEntersTapped, auraEnchantHostSpec } from "./staticAbilityParser.js";
// ORDEAL (BLITZ OC-1): the Theros Ordeal cast lane — the SAME gate legalChoices offers on and the metric
// awards (single source of truth, no drift). Acyclic: coverage.js never imports actionDispatcher.js.
import { isNativeOrdealAura, grantAuraCastHostType } from "./coverage.js";
import { landDropAllowance } from "./legalChoices.js"; // EXTRA-LAND-DROPS: shared per-turn land allowance (CR 305.2/505.5b) — same reader the action gate uses
import { planeswalkerPlayable } from "./effects/loyaltyAbilities.js";
import { permanentHasKeyword, permanentIsCreature, addContinuousEffect } from "./layers.js";
import { parseCrewCost, parseDiscardCostAbility } from "./effects/abilities.js"; // CREW (VH-1) — re-verified from the live card at dispatch
import { checkCastTriggers, checkDiesTriggers, checkPlaneswalkerDiesTriggers, checkSacrificeTriggers, checkLandfallTriggers, checkEnterTriggers, checkPermanentEntersTriggers, checkLeavesTriggers, checkBecomesTargetTriggers, checkDiscardTriggers } from "./triggers.js";
import { setPendingSoftCounterChoice } from "./pendingChoice.js";
import { wardTaxForSpell, wardTaxForStackObject } from "./ward.js";
import { groupWardTaxForSpell, groupWardTaxForStackObject } from "./groupWard.js";
import { applyKiraTargetCounter } from "./kiraTargetCounter.js";
import { entersWithFadeCounters } from "./fading.js";
import { applyXCastTokenTriggers } from "./xCastToken.js";
import { applyElseLandFromHand } from "./effects/atoms/freeCast.js"; // KELLAN else-arm: decline the free cast → the optional land put (CR 601.2b "If you don't, …")
import { extractAdditionalCosts } from "./effects/castModifiers.js"; // AC-PERMANENT — a permanent's cost lives beside its (null) program

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
  // not from hand — the same land-drop rules apply, only the source zone differs. PLAY-FROM-TOP (Future Sight,
  // CR 118.6): a land played from the TOP of the library (action.fromZone === "library"). Default "hand" keeps
  // every existing play-land call byte-identical. The card is found in whichever zone the action names.
  // PLAY-LANDS-FROM-GRAVEYARD (CR 118.6, census slice 44): a land played from the GRAVEYARD under the
  // Crucible of Worlds permission (action.fromZone === "graveyard"). Joins exile/library on the same
  // zone-parameterized path — the card is looked up in, and removed from, whichever zone it came from.
  const fromZone = action.fromZone === "exile" ? "exile"
    : action.fromZone === "library" ? "library"
      : action.fromZone === "graveyard" ? "graveyard" : "hand";
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
  if (entersTapped(card) || impositionEntersTapped(next, card, action.playerId)) { // KM-1: an opposing Kismet taxes the land drop too (CR 614.1c)
    const bf = next.players[action.playerId].battlefield;
    const entered = bf[bf.length - 1];
    if (entered) next = tapPermanent(next, entered.id, { fromEnter: true }); // CR 701.26a: entering tapped is NOT "becoming tapped" — suppress the becomes-tapped event
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
    // ⚠️ THE MISSING FIRE SITE. `permanentEnters` watchers ("Whenever a PERMANENT you control enters…" —
    // Amulet of Vigor #1301) were fired from exactly three places: token mint (tokens.js), zone-enter
    // (zones.js) and the cast/resolve path (resolvers.js). A land is PLAYED, not cast, so a land drop
    // reached NONE of them — and untapping lands that entered tapped is Amulet's entire purpose. Wiring the
    // subject/filter/referent without this would have produced a card that classifies native and never fires
    // on its signature use: a runtime-vacuous native.
    //
    // Additive and self-gating: a `permanentEnters` descriptor carries its own subject scope
    // (artifactYouControl / enchantmentYouControl / tokenYouControl / permanentYouControl), and scopeMatches
    // rejects a land for every one of those except the permanent-wide subject — so this cannot wrong-fire an
    // artifact or enchantment watcher, and landfall stays a distinct event that is unaffected.
    next = checkPermanentEntersTriggers(next, enteredLand);
  }
  // CR 117.3c (CR-remediation B4): the ACTOR retains priority after taking an action (a land play is
  // active-player-only, so actor === activePlayer here — stated in the uniform actor form regardless).
  return {
    ...next,
    priorityHolder: action.playerId,
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
  // ALT-COST (CR 601.2b / 118.9): a printed-alternative-cost cast (`action.altCost`, the legalChoices twin
  // post-pass) likewise pays NO mana — its own payment (life / pitch / sac / return-lands) is applied
  // atomically in step 2b' below, before the card leaves its zone. Deliberately a SEPARATE marker from
  // freeCast: the pendingFreeCast/pendingCascade clears further down are keyed off action.freeCast under a
  // single-producer invariant an overloaded flag would silently corrupt.
  let working;
  // ⭐ COLOURS SPENT (CR 202.2 / 105.1) — SUNBURST (CR 702.43) and CONVERGE both ask "how many COLOURS of
  // mana were spent to cast this?", and the answer has always existed here and been discarded: planPayment
  // returns `spend: {W,U,B,R,G,C}`, the exact per-colour tally the payment then deducts. Captured beside the
  // commit and threaded onto the spell's params, the same way `castFromZone` is a few hundred lines down.
  // ⛔ C IS NOT A COLOUR (CR 105.1) — colourless mana is excluded from the count. Counting it would give
  // every Sol-Ring-funded sunburst creature a free counter.
  // ⛔ A FREE / ALT-COST CAST SPENDS NO MANA, so this stays 0 — which is CR-correct (sunburst counts mana
  // actually spent, and a cascade or "without paying its mana cost" cast spends none), and it is also the
  // safe direction: an under-count can only ever under-size the payoff.
  let colorsSpent = 0;
  if (action.freeCast || action.altCost) {
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
    let castBaseSources = action.emerge && action.sacCreatureId
      ? manaSources(state, action.playerId).filter((s) => s.permanentId !== action.sacCreatureId)
      : manaSources(state, action.playerId);
    // AC-1 (count-of-N sacrifice, CR 601.2f): none of the N frozen `sacCountIds` victims that are ONE-SHOT mana
    // sources (Treasure/Gold/Spawn) may ALSO be cracked to pay the mana — planPayment must never spend a
    // permanent the additional-cost loop below re-finds to sacrifice (PERM_NOT_FOUND on an offered action).
    // Mirrors legalChoices' per-N affordability filter + the activated-ability sacCountExcluded path. No
    // sacCountIds (every N=1 / non-sac cast) → the original sources array, byte-identical.
    if (action.sacCountIds?.length) {
      const sacCountSet = new Set(action.sacCountIds);
      castBaseSources = castBaseSources.filter((s) => !(s.sacrifices && sacCountSet.has(s.permanentId)));
    }
    const castSources = sourcesExcludingOneShotVictim(castBaseSources, action.sacCreatureId);
    // SPEND-RESTRICTED (CR 106.6): tell the planner what this payment is FOR, so a source printed
    // "Spend this mana only to cast a creature spell" is offered here and nowhere else. Must MATCH the
    // affordability context in legalChoices exactly — an offer the payment then refuses is a MANA_SHORT
    // throw on a legal-looking action.
    const plan = planPayment(pool, castSources, action.cost, { castCard, isCommander: action.fromZone === "command" });
    if (!plan) {
      throw new DispatcherError("Cannot pay the spell's mana cost", "MANA_SHORT");
    }

    // Commit the plan (manaModel.commitPaymentPlan): add each source's mana and tap it — OR sacrifice
    // a one-shot Treasure/Gold — then deduct EXACTLY what the plan spent. Any surplus from an
    // over-producing source (Sol Ring on a single generic) floats — the floating-mana behavior we want.
    working = commitPaymentPlan(state, action.playerId, plan);
    // Read off the SAME plan the commit just deducted, so "counted" and "spent" can never drift apart.
    colorsSpent = ["W", "U", "B", "R", "G"].filter((c) => (plan.spend?.[c] || 0) > 0).length;
  }
  // ⭐ CONVERGE — stamp the count on STATE, the same inter-atom channel `sacrificedForCost` uses, so a SPELL's
  // scaling atoms can read it at resolution (countForSpec's colorsSpentThisSpell kind). The permanent-ETB path
  // gets its own copy through params below; a spell has no permanent to stamp, which is why both exist.
  // ⛔ STAMPED EVEN WHEN ZERO — an alt/free cast spends no mana, and 0 is the right answer, not "unknown".
  working = { ...working, colorsSpentForCast: colorsSpent };
  // ⭐ MULTIKICKER COUNT (CR 702.33h) — the same inter-atom channel. `action.kickCount` is honoured when a
  // caller supplies one; otherwise a kicked cast is one kick and an unkicked cast is zero.
  // ⛔ ZERO IS THE TRUE ANSWER TODAY, NOT A PLACEHOLDER: legalChoices never offers a multikicked cast
  // (parseKickerCost refuses multikicker), so every cast the engine can make really was kicked zero times.
  working = { ...working, timesKickedForCast: Number(action.kickCount) > 0 ? Number(action.kickCount) : (action.kicked ? 1 : 0) };

  // 2b. Pay any ADDITIONAL COSTS (CR 601.2f) — paid at cast, before the spell finishes going on the stack.
  // The parser attaches the cost(s) to `program.additionalCosts` and legalChoices.actionsCastSpell freezes
  // the chosen way-to-pay onto the action. Kinds:
  //   sacrifice — γ1b `sacrificePermanentForCost` (battlefield→graveyard + the victim's dies trigger; the
  //               legalChoices filter already excluded any victim whose leave-trigger the dies path can't fire).
  //               AC-1 count-of-N (`ac.count > 1`, "sacrifice two creatures"): sacrifice each of the N frozen
  //               `sacCountIds` (a policy-picked least-valuable set from legalChoices).
  //   payLife   — deduct N life (CR 119.4; legalChoices gated life >= N).
  //   discard   — move the CHOSEN hand card → graveyard (same mechanism as EP-2's discard). The spell itself
  //               is still in hand here but was excluded as a discard candidate at enumeration. AC-1 count-of-N
  //               (`ac.count > 1`, "discard two cards"): discard each of the N frozen `discardIds`.
  // FAIL-FAST: a program that REQUIRES a cost but arrived without the matching choice is an upstream bug —
  // THROW rather than cast cost-free (silently skipping a cost is the cardinal false-positive failure,
  // CLAUDE.md §1.2). `program` is hoisted here and reused for the payload below (single parse).
  // ADVENTURE: parse the FACE (castCard), not the combined card — a creature face has no program (null), so
  // the payload routes through isPermanentSpell; an adventure-spell face carries action.program already.
  // Strip cost-only keyword lines (Convoke/Affinity) before parsing the EFFECT — they carry no atom of their own,
  // and the CLASSIFIER already strips them (coverage.spellIsNative), so without this the runtime parses a bare
  // "Convoke" line to LOW → pendingArbiter while the classifier calls the card native (the Harmonized Crescendo
  // mismatch, Omnath breakage #4). No-op for any card without a cost-only keyword line.
  const program = action.program || parseEffectProgram({ ...castCard, oracle: stripCostOnlyKeywordLines(castCard?.oracle || "") });
  // AC-OR (CR 601.2f) — when the cost was an OR, legalChoices stamped the OPTION this cast chose onto the
  // action. Charge THAT, never `additionalCosts[0]`: the alternative is billing a player for the artifact
  // sacrifice when they chose to discard. A non-choice cost is unaffected (no stamp → the program's own
  // list, byte-identical). ⛔ The stamp is only ever trusted when the program really carries a choice cost,
  // so a forged/stale action field cannot swap in a cheaper cost than the card prints.
  // AC-PERMANENT (CR 601.2f) — a permanent spell has NO effect program (a creature body yields no atom), so
  // `program` is null here and this list was empty: the cost was silently skipped and the spell cast for free.
  // The vetted cost is re-derived from the card, exactly as legalChoices derived it when it offered the cast,
  // so the offer and the charge read the same source. Non-permanents are untouched (their program is truthy
  // even at LOW confidence, so this fallback never fires for them).
  const programCosts = program?.additionalCosts
    || (isPermanentSpell(castCard) ? (extractAdditionalCosts(String(castCard?.oracle ?? "")).costs || []) : []);
  const isChoiceCost = programCosts[0]?.kind === "choice";
  // ⭐ `pips` joins the identity comparison (AC-MANA, 2026-08-07). Every other distinguishing field of a
  // vetted cost kind was already compared; payMana's is `pips`, and without it two payMana options on one
  // card would be indistinguishable to this matcher. No printed card prints "pay {A} or pay {B}" today, so
  // this is closing the gap while it is still theoretical rather than after a card exposes it.
  const chosenSpec = isChoiceCost && action.addCostSpec
    && programCosts[0].options.some((o) => o.kind === action.addCostSpec.kind
      && o.sacType === action.addCostSpec.sacType && o.count === action.addCostSpec.count
      && o.amount === action.addCostSpec.amount && o.cardType === action.addCostSpec.cardType
      && o.pips === action.addCostSpec.pips)
    ? [action.addCostSpec] : null;
  if (isChoiceCost && !chosenSpec) {
    // A choice cost reached the dispatcher without a valid stamp — refuse rather than cast it cost-free.
    throw new DispatcherError("Spell has an OR additional cost but no valid option was chosen", "ADDCOST_UNPAID");
  }
  for (const ac of chosenSpec || programCosts) {
    if (ac.kind === "sacrifice" && (ac.count ?? 1) > 1) {
      // AC-1 (count-of-N, CR 701.21a) — sacrifice EACH of the N frozen victims (battlefield→graveyard + dies
      // triggers). legalChoices froze exactly N legal ids on `sacCountIds`; a short/missing list is an upstream
      // bug — THROW rather than cast having sacrificed fewer than N (paying N-1 is the cardinal false positive).
      if (!Array.isArray(action.sacCountIds) || action.sacCountIds.length < ac.count) {
        throw new DispatcherError(`Spell requires sacrificing ${ac.count} but ${action.sacCountIds?.length || 0} were chosen`, "ADDCOST_UNPAID");
      }
      for (const vid of action.sacCountIds) {
        const victim = working.players[action.playerId]?.battlefield.find(p => p.id === vid);
        if (!victim) throw new DispatcherError(`Sacrifice victim ${vid} not on battlefield`, "PERM_NOT_FOUND");
        working = sacrificePermanentForCost(working, action.playerId, victim);
      }
    } else if (ac.kind === "sacrifice") {
      if (!action.sacCreatureId) throw new DispatcherError("Spell requires an additional sacrifice cost but no victim was chosen", "ADDCOST_UNPAID");
      const victim = working.players[action.playerId]?.battlefield.find(p => p.id === action.sacCreatureId);
      if (!victim) throw new DispatcherError(`Sacrifice victim ${action.sacCreatureId} not on battlefield`, "PERM_NOT_FOUND");
      // SACRIFICED REFERENT (CR 608.2h + 603.6e last-known-info) — a spell whose effect scales off "the
      // sacrificed creature's power / toughness / mana value" (Fling, Tormented Thoughts, Reckoner's Bargain,
      // Eldritch Evolution) reads the victim as it LAST EXISTED on the battlefield. Captured HERE, before the
      // sacrifice, which is the only moment the permanent is still there — the effect resolves later, when it
      // is long gone. Mirrors the revealedCardMV stamp the reanimate-drain chain uses.
      //
      // Power/toughness are read LAYER-AWARE (a pumped creature sacrificed gives its CURRENT power, CR 613);
      // mana value comes off the printed cost (CR 202.3b — no layer alters it). `?? 0` for a permanent with
      // no P/T (an artifact sacrificed to an "artifact or creature" cost) → a clean 0, never a fabricated
      // magnitude. Only the SINGLE-victim branch stamps: the count-of-N form has no singular referent to name.
      working = {
        ...working,
        sacrificedForCost: {
          power: Math.max(0, creaturePower(victim, working) ?? 0),
          toughness: Math.max(0, creatureToughness(victim, working) ?? 0),
          manaValue: Math.max(0, victim.card?.cmc ?? 0),
        },
      };
      working = sacrificePermanentForCost(working, action.playerId, victim);
    } else if (ac.kind === "payLife") {
      working = loseLife(working, { playerId: action.playerId, amount: ac.amount });
    } else if (ac.kind === "discard" && (ac.count ?? 1) > 1) {
      // AC-1 (count-of-N) — discard EACH of the N frozen hand cards (hand→graveyard). Same fail-fast: a
      // short/missing `discardIds` means the offer was malformed — THROW rather than discard fewer than N.
      if (!Array.isArray(action.discardIds) || action.discardIds.length < ac.count) {
        throw new DispatcherError(`Spell requires discarding ${ac.count} but ${action.discardIds?.length || 0} were chosen`, "ADDCOST_UNPAID");
      }
      for (const cid of action.discardIds) {
        if (!working.players[action.playerId]?.hand.some(c => c.id === cid)) {
          throw new DispatcherError(`Discard card ${cid} not in hand`, "CARD_NOT_IN_HAND");
        }
        working = moveCardToZone(working, { playerId: action.playerId, fromZone: "hand", toZone: "graveyard", cardId: cid });
        // A discard paid as a COST is still a discard (CR 701.9a) — Liliana's Caress does not care why.
        // ⛔⛔ THE ASSIGNMENT IS THE WHOLE POINT, AND IT WAS MISSING AT ALL SIX DISPATCHER SITES UNTIL
        // 2026-08-05. checkDiscardTriggers is PURE — it returns a new state with the fired triggers appended
        // to pendingTriggers. Called as a bare statement, its result was thrown away, so **every discard that
        // goes through the dispatcher fired nothing**: both additional-cost discards, the activated-ability
        // discard cost, cycling, and the alt-cost path. Liliana's Caress / Megrim / Raiders' Wake read native
        // and did nothing on the most common discard routes in the game. Every OTHER call site in the
        // codebase already assigned the result, which is what made the omission invisible.
        working = checkDiscardTriggers(working, action.playerId, 1);
      }
    } else if (ac.kind === "discard") {
      if (!action.discardCardId) throw new DispatcherError("Spell requires an additional discard cost but no card was chosen", "ADDCOST_UNPAID");
      if (!working.players[action.playerId]?.hand.some(c => c.id === action.discardCardId)) {
        throw new DispatcherError(`Discard card ${action.discardCardId} not in hand`, "CARD_NOT_IN_HAND");
      }
      working = moveCardToZone(working, { playerId: action.playerId, fromZone: "hand", toZone: "graveyard", cardId: action.discardCardId });
      working = checkDiscardTriggers(working, action.playerId, 1);
    } else if (ac.kind === "exileFromGraveyard" && (ac.count ?? 1) > 1) {
      // ADDCOST-3b (count-of-N) — exile EACH of the N frozen graveyard cards. A short or missing list is an
      // upstream bug: THROW rather than cast having exiled fewer than N (paying N-1 is the cardinal FP).
      if (!Array.isArray(action.exileGyCardIds) || action.exileGyCardIds.length < ac.count) {
        throw new DispatcherError(`Spell requires exiling ${ac.count} graveyard cards but ${action.exileGyCardIds?.length || 0} were chosen`, "ADDCOST_UNPAID");
      }
      for (const gid of action.exileGyCardIds) {
        if (!working.players[action.playerId]?.graveyard.some((c) => c.id === gid)) {
          throw new DispatcherError(`Exile-cost card ${gid} not in graveyard`, "CARD_NOT_IN_GRAVEYARD");
        }
        working = moveCardToZone(working, { playerId: action.playerId, fromZone: "graveyard", toZone: "exile", cardId: gid });
      }
    } else if (ac.kind === "exileFromGraveyard") {
      // ADDCOST-3 (CR 601.2h) — the chosen graveyard card is EXILED as the cost is paid. legalChoices froze
      // the id on the action; re-check membership here so a stale id can never exile something else.
      if (!action.exileGyCardId) throw new DispatcherError("Spell requires an additional graveyard-exile cost but no card was chosen", "ADDCOST_UNPAID");
      if (!working.players[action.playerId]?.graveyard.some(c => c.id === action.exileGyCardId)) {
        throw new DispatcherError(`Exile-cost card ${action.exileGyCardId} not in graveyard`, "CARD_NOT_IN_GRAVEYARD");
      }
      working = moveCardToZone(working, { playerId: action.playerId, fromZone: "graveyard", toZone: "exile", cardId: action.exileGyCardId });
    } else if (ac.kind === "returnToHand") {
      // AC-BOUNCE (CR 601.2f/h) — the chosen permanent is returned to its owner's hand as the cost is paid.
      // legalChoices froze the id; re-check membership against the LIVE battlefield so a stale id can never
      // bounce something else. Mirrors the return-land ACTIVATION cost below, including draining the leave
      // event (checkLeavesTriggers) so a modeled "leaves the battlefield" watcher stacks above the spell
      // (CR 603.3b) — the offer gate already excluded a permanent whose leave trigger we cannot fire.
      if (!action.returnPermId) throw new DispatcherError("Spell requires an additional return-to-hand cost but no permanent was chosen", "ADDCOST_UNPAID");
      const retPerm = working.players[action.playerId]?.battlefield.find((p) => p.id === action.returnPermId);
      if (!retPerm) throw new DispatcherError(`Return-cost permanent ${action.returnPermId} not on battlefield`, "PERM_NOT_FOUND");
      working = moveCardToZone(working, { playerId: action.playerId, fromZone: "battlefield", toZone: "hand", cardId: action.returnPermId });
      working = checkLeavesTriggers(working);
    } else if (ac.kind === "payMana") {
      // ⭐⭐ AC-MANA (2026-08-07) — ALREADY PAID, and deliberately so. legalChoices stamps the MERGED cost
      // (printed + these pips) as `action.cost`, and the mana-payment block above pays `action.cost` through
      // planPayment. So there is exactly ONE cost object and ONE payment; offer and charge cannot drift.
      // ⛔ THIS ARM IS NOT DEAD CODE — it is the acknowledgement the fail-closed `else` below demands. That
      // guard threw ADDCOST_UNSUPPORTED for this kind until now, which is precisely how it should behave for
      // an unrecognised cost: refuse the cast rather than skip the cost. Skipping is a FREE SPELL.
      // ⛔ DO NOT charge the pips again here. `action.cost` already includes them; a second payment would
      // double-charge, which is the safe direction but still wrong — and it would silently diverge from the
      // affordability check that offered the cast.
      // (A free-cast never reaches this block at all: the mana branch above is skipped for it.)
    } else {
      // ⛔⛔ THE FAIL-CLOSED GUARD. An additional cost this dispatcher does not recognise must REFUSE the
      // cast, never silently skip it — skipping is cheaper-than-printed, i.e. a FREE SPELL. I deleted this
      // line by accident while adding the payMana arm above and caught it before the tree was gated; it is
      // the single most load-bearing line in this block.
      throw new DispatcherError(`Unsupported additional cost kind: ${ac.kind}`, "ADDCOST_UNSUPPORTED");
    }
  }

  // 2b'. ALT-COST payment (CR 601.2b / 118.9) — the printed-alternative cost chosen at the offer
  // (action.altCost, carrying the frozen payment fields), applied atomically BEFORE the card leaves its
  // zone (CR 601.2h). The offer only ever emits payable variants (enumerateAltPayments), so every throw
  // here is a true upstream bug — FAIL-FAST rather than resolve a spell whose cost was never paid
  // (silently skipping a cost is the cardinal false-positive failure, CLAUDE.md §1.2). Each resource is
  // re-resolved against the LIVE state at payment time.
  if (action.altCost) {
    const alt = action.altCost;
    if (alt.kind === "free") {
      // No payment — the offer gate verified the printed condition (controlCommander / submergeGate).
    } else if (alt.kind === "payLife") {
      if (!(alt.payLife > 0)) throw new DispatcherError("Alt-cost cast requires a life payment but none was chosen", "ALTCOST_UNPAID");
      working = loseLife(working, { playerId: action.playerId, amount: alt.payLife });
    } else if (alt.kind === "payLifeExilePitch" || alt.kind === "exileColorCard") {
      if (!alt.exilePitchId) throw new DispatcherError("Alt-cost cast requires an exiled pitch card but none was chosen", "ALTCOST_UNPAID");
      if (!working.players[action.playerId]?.hand.some((c) => c.id === alt.exilePitchId)) {
        throw new DispatcherError(`Alt-cost pitch card ${alt.exilePitchId} not in hand`, "CARD_NOT_IN_HAND");
      }
      working = moveCardToZone(working, { playerId: action.playerId, fromZone: "hand", toZone: "exile", cardId: alt.exilePitchId });
      if (alt.kind === "payLifeExilePitch") {
        if (!(alt.payLife > 0)) throw new DispatcherError("Alt-cost cast requires a life payment but none was chosen", "ALTCOST_UNPAID");
        working = loseLife(working, { playerId: action.playerId, amount: alt.payLife });
      }
    } else if (alt.kind === "sacrificeCreature") {
      if (!alt.sacId) throw new DispatcherError("Alt-cost cast requires a sacrifice but no victim was chosen", "ALTCOST_UNPAID");
      const victim = working.players[action.playerId]?.battlefield.find((p) => p.id === alt.sacId);
      if (!victim) throw new DispatcherError(`Alt-cost sacrifice victim ${alt.sacId} not on battlefield`, "PERM_NOT_FOUND");
      working = sacrificePermanentForCost(working, action.playerId, victim);
    } else if (alt.kind === "returnLandsToHand") {
      if (!Array.isArray(alt.returnLandIds) || alt.returnLandIds.length === 0) {
        throw new DispatcherError("Alt-cost cast requires returned lands but none were chosen", "ALTCOST_UNPAID");
      }
      // Same mechanism as the γ1g return-cost: battlefield → hand per land, draining each land's leave
      // event (checkLeavesTriggers) so modeled leave watchers stack correctly (CR 603.3b); the offer gate
      // already excluded lands with an unmodeled leaves/LTB trigger (sacrificeDropsTrigger).
      for (const lid of alt.returnLandIds) {
        const land = working.players[action.playerId]?.battlefield.find((p) => p.id === lid);
        if (!land) throw new DispatcherError(`Alt-cost return land ${lid} not on battlefield`, "PERM_NOT_FOUND");
        working = moveCardToZone(working, { playerId: action.playerId, fromZone: "battlefield", toZone: "hand", cardId: lid });
        working = checkLeavesTriggers(working);
      }
    } else {
      throw new DispatcherError(`Unsupported alt cost kind: ${alt.kind}`, "ALTCOST_UNSUPPORTED");
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
  } else if (isNativeAura(castCard) || isNativeOrdealAura(castCard)) {
    // Aura (CR 303.4f): resolve via the AURA_ETB resolver — enter the battlefield attached
    // to the targeted creature. The target id is the battlefield permanent chosen at cast.
    // ORDEAL (BLITZ OC-1): the fully-modeled trigger-only Ordeal Aura rides the SAME lane (enter +
    // attach; its triggers fire off the attached linkage) — the gate mirrors legalChoices' offer.
    // ES-1: `hostType` rides the SERIALIZABLE payload (the grant lane's proven pattern, one branch down)
    // so the resolver's CR 608.2b re-check demands the type the card actually enchants. It is read from
    // auraEnchantHostSpec — the SAME function legalChoices enumerated with — so offer and re-check cannot
    // drift. Absent for an Ordeal (not a host-spec card) → the re-check keeps its /Creature/ default,
    // which is exactly right for it.
    const targetId = targets[0]?.id;
    const hostSpec = auraEnchantHostSpec(castCard);
    payload = { resolver: RESOLVER_KEYS.AURA_ETB, params: { card: castCard, controller: action.playerId, targetId, ...(hostSpec && { hostType: hostSpec.targetType }) } };
  } else if (action.enchantsPlayer && isPlayerAuraCard(castCard)) {
    // PLAYER-AURA (Fraying Sanity / the Curse class — SHELF S7, CR 303.4): the target is a PLAYER id;
    // AURA_ETB's player branch re-checks the player is still in the game at resolution and enters the
    // permanent with enchantedPlayerId stamped (no host permanent, attachments untouched).
    const targetId = targets[0]?.id;
    payload = { resolver: RESOLVER_KEYS.AURA_ETB, params: { card: castCard, controller: action.playerId, targetId, enchantsPlayer: true } };
  } else if (isNativeManaAura(castCard)) {
    // AURA-LAND-MANA-BOOST (Wild Growth / Overgrowth / Fertile Ground): an Aura enchanting a LAND. Same
    // AURA_ETB resolver, but the target is a LAND (the resolver re-checks the type per the card). Once
    // attached, manaModel.landAuraManaBonus adds the extra mana inline when the land taps (CR 605.1b).
    const targetId = targets[0]?.id;
    payload = { resolver: RESOLVER_KEYS.AURA_ETB, params: { card: castCard, controller: action.playerId, targetId } };
  } else if (grantAuraCastHostType(castCard)) {
    // GRANT-AURA CAST (BLITZ TS-1): a GRANT-family Aura (granted-activated / granted-mana / granted-
    // triggered / aura-own-activated — Squirrel Nest, Tin Street Market, Hermetic Study, Settlement, Gift
    // of Paradise, Sixth Sense, Freed from the Real) resolves via AURA_ETB attached to the host chosen at
    // cast, exactly like the branches above. `hostType` rides the SERIALIZABLE payload so the resolver's
    // CR 608.2b re-check requires the right host type (a LAND-enchant Aura must still point at a Land at
    // resolution; the legacy creature/mana derivations stay byte-identical when hostType is absent). Gated
    // on the SAME grantAuraCastHostType legalChoices offered with, so offer and resolution can't drift.
    const targetId = targets[0]?.id;
    payload = { resolver: RESOLVER_KEYS.AURA_ETB, params: { card: castCard, controller: action.playerId, targetId, hostType: grantAuraCastHostType(castCard).host } };
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
      // FLASHBACK (CR 702.34a): a spell cast for its flashback cost (action.flashbackCast) is EXILED as it
      // leaves the stack instead of hitting the graveyard — the `exile:true` rider rides the disposition
      // object, so finishSpellResolution (resolution/fizzle/resume) and counterSpellById (counter) all divert
      // it to exile. Without this the card would return to the graveyard → the flashback offer would re-fire
      // (an infinite-recast false positive — the cardinal forbidden bug for this mechanic).
      params.spellToGraveyard = { playerId: action.playerId, card, ...(action.flashbackCast ? { exile: true } : {}) };
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
    // CAST-FROM-ZONE (CR 601.2 / 400.7): record WHICH zone this spell was cast from so an
    // "if you cast it from your hand" ETB rider can read it (resolvers.enterPermanent stamps it onto the
    // permanent beside wasCast). Same `action.fromZone || "hand"` default the cast-trigger thread above
    // uses — safe HERE for the same reason: this branch only runs for an actual CAST, and a cast always
    // has a source zone. A permanent that arrives any other way never reaches this line at all, so it
    // stays unstamped and the rider reads false.
    params.castFromZone = action.fromZone || "hand";
    // ⭐ COLOURS SPENT — the sunburst / converge count, captured off the payment plan above and threaded the
    // same way castFromZone is. resolvers.enterPermanent stamps it onto the entering permanent so an ETB
    // rider can read it. Always a number on a cast (0 for a free/alt-cost cast); a permanent that arrives
    // any other way never reaches this line and stays unstamped.
    params.colorsSpent = colorsSpent;
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
  // GY-EVENT (SHELF S7): a spell cast FROM the graveyard (flashback / the Raul milled-GY permission /
  // any graveyard cast lane) LEAVES it for the stack (CR 601.2a).
  if (fromZone === "graveyard") {
    next = recordGraveyardEvents(next, [{ dir: "leave", card, gyOwner: action.playerId, zone: "stack" }]);
  }
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
  next = recordSpellCast(next, { playerId: action.playerId, spellCard: castCard }); // TRIG-CAST2: count this cast BEFORE firing, so "your second spell each turn" sees the running total
  next = checkCastTriggers(next, { spellCard: castCard, casterId: action.playerId, targets, xValue: action.xValue, stackObjectId: stkId, castFromZone: action.fromZone || "hand" }); // SELF-CAST: thread the chosen X so a "When you cast this spell" half-X/X payoff (Hydroid Krasis) resolves at the real X; STORM: thread the spell's stack id so the storm trigger can snapshot its payload to copy; ADVENTURE: the FACE cast (so "cast an Adventure spell" matches); CAST-FROM-NONHAND (Vega, K1): the action's source zone gates the from-anywhere-but-hand watchers
  next = flushTriggers(next, { chooseTargets: chooseTriggerTargets });
  // BECOMES-TARGET (CR 603.2 — the Phantasmal Illusion family): if this spell targets one or more permanents
  // that carry a "When this creature becomes the target of a spell or ability, sacrifice it." trigger, fire it
  // now — enqueued then flushed ABOVE the spell (it resolves FIRST, CR 603.3b: the creature is sacrificed, then
  // the now-targetless spell is countered on resolution if it lost its only legal target, CR 608.2b). Fires for
  // ANY caster's spell (no controller distinction, CR 603.2 — a Giant Growth on your OWN Phantasmal Bear
  // sacrifices it too), unlike ward/Heroic. A no-op when no targeted permanent carries the trigger.
  next = checkBecomesTargetTriggers(next, stackObject);
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
  // KIRA, GREAT GLASS-SPINNER (a HARD-counter group-ward analogue, kiraTargetCounter.js): if this spell
  // targets a creature whose controller controls a Kira source AND that creature has not become a target yet
  // this turn (CR 603.2 — "for the first time each turn"), COUNTER the spell outright (no pay). Marks every
  // targeted creature as having-become-a-target this turn. Placed LAST — after the ward/Diffusion soft-counter
  // taxes — because Kira is unconditional: on the (astronomically rare) overlap where the SAME single-target
  // spell also raised a soft-counter above, countering the spell here removes it; the soft-counter settle then
  // fizzles harmlessly on the missing stack id (counterSpellById logs counter-fizzle). No-op when no Kira is in
  // play / the spell targets no eligible-and-fresh creature.
  next = applyKiraTargetCounter(next, stackObject);
  // CR 117.3c (CR-remediation B4): after casting, the CASTER retains priority — a non-active player
  // casting an instant in response keeps the window to act again (a second spell, another response)
  // instead of priority snapping back to the turn player. (The old code cited 117.1c, which governs
  // who gets priority after a spell RESOLVES — not the moment of casting.)
  return {
    ...next,
    priorityHolder: action.playerId,
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
  // Power + base power captured BEFORE the move (CR 603.6e — the layer-aware read needs the permanent
  // still on the battlefield) so a dies-payoff reading either LKI (dyingPower / the Jason-Bright
  // power-differed intervening-if) resolves off a cost-sacrifice too.
  const sfcPw = creaturePower(permObj, state);
  const sfcBpw = creatureBasePower(permObj, state);
  let next = moveCardToZone(state, { playerId, fromZone: "battlefield", toZone: "graveyard", cardId: permObj.id });
  if (/Creature/.test(typeLine)) {
    next = checkDiesTriggers(next, [{ controller: playerId, id: permObj.id, name: permObj.card?.name || "creature", card: permObj.card, counters: { ...(permObj.counters || {}) }, power: Number.isFinite(sfcPw) ? sfcPw : null, basePower: Number.isFinite(sfcBpw) ? sfcBpw : null }]);
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

/**
 * GY SELF-RECURSION (BLITZ GY-1, CR 602.2): activate "Return this card from your graveyard to <your
 * hand | the battlefield [tapped]>" FROM the graveyard. Mana-only cost (paid through the same
 * planPayment/commitPaymentPlan every ability uses); the ability goes ON THE STACK (kind
 * "activated-ability", the GY_SELF_RETURN resolver) so responses work — the resolver re-checks the
 * card is still in the graveyard and fizzles cleanly if it left.
 */
function applyActivateGyRecursion(state, action) {
  const player = state.players[action.playerId];
  if (!player) throw new DispatcherError(`Unknown player ${action.playerId}`, "BAD_PLAYER");
  const card = (player.graveyard || []).find((c) => c.id === action.cardId);
  if (!card) throw new DispatcherError(`Card ${action.cardId} not in graveyard`, "CARD_NOT_FOUND");
  const plan = planPayment(player.manaPool, manaSources(state, action.playerId), action.cost);
  if (!plan) throw new DispatcherError("Cannot pay the ability's mana cost", "MANA_SHORT");
  let working = commitPaymentPlan(state, action.playerId, plan);
  // GR-1 — the ", Discard N cards" cost rider (Stitchwing Skaab kin, CR 601.2h — costs pay BEFORE the
  // ability stacks): re-verify each enumerated victim is still in hand, then discard it. A vanished
  // victim (hand changed between enumeration and dispatch) aborts — an underpaid cost must never stack.
  for (const did of action.discardIds || []) {
    const inHand = (working.players[action.playerId]?.hand || []).some((c) => c.id === did);
    if (!inHand) throw new DispatcherError(`Discard victim ${did} not in hand`, "COST_UNPAYABLE");
    working = moveCardToZone(working, { playerId: action.playerId, fromZone: "hand", toZone: "graveyard", cardId: did });
    working = checkDiscardTriggers(working, action.playerId, 1);
  }
  // GR-2 — the exile-from-graveyard cost rider. Same re-verification posture as the discard loop above:
  // the victim must still be in the graveyard at dispatch, and it must not be the card being returned.
  for (const xid of action.exileGyIds || []) {
    if (xid === action.cardId) throw new DispatcherError("Exile-cost victim is the card being returned", "COST_UNPAYABLE");
    const inGy = (working.players[action.playerId]?.graveyard || []).some((c) => c.id === xid);
    if (!inGy) throw new DispatcherError(`Exile victim ${xid} not in graveyard`, "COST_UNPAYABLE");
    working = moveCardToZone(working, { playerId: action.playerId, fromZone: "graveyard", toZone: "exile", cardId: xid });
  }
  const { id: stkId, state: working2 } = mintId(working, "stk");
  const stackObject = createStackObject({
    id: stkId,
    kind: "activated-ability",
    source: card,
    controller: action.playerId,
    targets: [],
    cost: action.cost,
    payload: {
      resolver: RESOLVER_KEYS.GY_SELF_RETURN,
      params: { cardId: action.cardId, controller: action.playerId, dest: action.dest, entersTapped: !!action.entersTapped },
    },
  });
  let next = { ...working2, stack: [...working2.stack, stackObject] };
  return logEvent(next, {
    kind: "activate-ability",
    playerId: action.playerId,
    permanentId: null,
    cardName: card.name,
    abilityText: action.abilityText,
  });
}

/**
 * CREW (BLITZ VH-1, CR 702.121c) — a special activation with NO stack object in this engine (the tap is
 * the cost; the animation is the effect — modeled as an immediate resolution, the same simplification every
 * no-stack special action here uses). Re-verified live at dispatch (CREED — the action payload is untrusted):
 * the Vehicle must be a live, un-animated Vehicle with a printed Crew N; every tapped creature must be a
 * live, UNTAPPED creature the player controls; their total layer-aware power must still be ≥ N. Then: tap
 * them all (no untap events — tapping fires nothing here), add the layer-4 endOfTurn Creature type-add
 * (printed P/T + printed keyword lines apply once the type is on — no 7b/6 effects needed), and stamp
 * summoning sickness per CR 302.6: a Vehicle that entered THIS turn hasn't been controlled since the turn
 * began, so it can't attack even crewed (summoningSick true); an older Vehicle crews into a ready attacker.
 */
function applyCrewVehicle(state, action) {
  const player = state.players[action.playerId];
  if (!player) throw new DispatcherError(`Unknown player ${action.playerId}`, "BAD_PLAYER");
  const lk = findPermanent(state, action.permanentId);
  if (!lk || lk.controller !== action.playerId) throw new DispatcherError(`Vehicle ${action.permanentId} not found`, "CARD_NOT_FOUND");
  const vehicle = lk.permanent;
  if (!/\bVehicle\b/.test(String(vehicle.card?.type || ""))) throw new DispatcherError("Not a Vehicle", "BAD_TARGET");
  if (permanentIsCreature(state, vehicle.id)) throw new DispatcherError("Vehicle is already a creature", "BAD_TARGET");
  const n = parseCrewCost(vehicle.card);
  if (n == null) throw new DispatcherError("No crew cost", "BAD_TARGET");
  let power = 0;
  for (const id of action.tapIds || []) {
    const c = findPermanent(state, id);
    if (!c || c.controller !== action.playerId || c.permanent.tapped || !permanentIsCreature(state, id)) {
      throw new DispatcherError(`Crew member ${id} is not a live untapped creature you control`, "BAD_TARGET");
    }
    power += Math.max(0, creaturePower(c.permanent, state));
  }
  if (power < n) throw new DispatcherError(`Crew total power ${power} < ${n}`, "CREW_SHORT");
  let next = state;
  for (const id of action.tapIds) next = tapPermanent(next, id);
  // CR 301.5c — an EQUIPMENT-Vehicle (Rover Blades) that becomes a creature can't stay attached:
  // detach in place (it remains on the battlefield; only the attachment link clears).
  if (vehicle.attachedTo) {
    const hostId = vehicle.attachedTo;
    next = updatePermanentSafe(next, hostId, (p) => ({ ...p, attachments: (p.attachments || []).filter((id) => id !== vehicle.id) }));
    next = updatePermanentSafe(next, vehicle.id, (p) => ({ ...p, attachedTo: null }));
  }
  next = addContinuousEffect(next, {
    layer: 4,
    op: { types: ["Creature"], subtypes: [] },
    affects: { mode: "fixed", permanentIds: [vehicle.id] },
    duration: { kind: "endOfTurn", turn: next.turn },
    source: { kind: "resolution", permanentId: vehicle.id, cardName: vehicle.card?.name || null },
  }).state;
  next = updatePermanentSafe(next, vehicle.id, (p) => ({ ...p, summoningSick: p.enteredOnTurn === next.turn }));
  return logEvent(next, { kind: "crew-vehicle", playerId: action.playerId, permanentId: vehicle.id, cardName: vehicle.card?.name, tapped: action.tapIds });
}

/**
 * GY EXILE-COST ABILITY (BLITZ GY-2, CR 602.2): activate "<mana>, Exile this card from your
 * graveyard: <effect>". Mana paid through the shared planner; the EXILE is a COST item — the card
 * leaves the graveyard to exile BEFORE the ability goes on the stack (CR 602.2b; moveCardToZone
 * fires the graveyard-LEAVE watchers), which also makes the ability structurally once-per-copy.
 * The effect rides the normal EFFECT_PROGRAM resolver (v1 programs are non-targeted, non-modal,
 * non-X by the recognizer's gate).
 */
function applyActivateGyExile(state, action) {
  const player = state.players[action.playerId];
  if (!player) throw new DispatcherError(`Unknown player ${action.playerId}`, "BAD_PLAYER");
  const card = (player.graveyard || []).find((c) => c.id === action.cardId);
  if (!card) throw new DispatcherError(`Card ${action.cardId} not in graveyard`, "CARD_NOT_FOUND");
  const plan = planPayment(player.manaPool, manaSources(state, action.playerId), action.cost);
  if (!plan) throw new DispatcherError("Cannot pay the ability's mana cost", "MANA_SHORT");
  let working = commitPaymentPlan(state, action.playerId, plan);
  // The exile-self cost item (CR 602.2b — costs are paid before the ability is put on the stack).
  working = moveCardToZone(working, { playerId: action.playerId, fromZone: "graveyard", toZone: "exile", cardId: action.cardId });
  const { id: stkId, state: working2 } = mintId(working, "stk");
  const stackObject = createStackObject({
    id: stkId,
    kind: "activated-ability",
    source: card,
    controller: action.playerId,
    targets: [],
    cost: action.cost,
    payload: {
      resolver: RESOLVER_KEYS.EFFECT_PROGRAM,
      params: { program: action.program, controller: action.playerId, targets: [], cardId: card.id, sourceId: null },
    },
  });
  let next = { ...working2, stack: [...working2.stack, stackObject] };
  return logEvent(next, {
    kind: "activate-ability",
    playerId: action.playerId,
    permanentId: null,
    cardName: card.name,
    abilityText: action.abilityText,
  });
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
  // γ1e — pay a "Pay {E}…" energy cost (CR 122.1e): spend N energy from the activator's pool. legalChoices
  // already gated on player.energy >= payEnergy, so this never drives energy negative (spendEnergy floors at 0).
  if (action.payEnergy) working = spendEnergy(working, { playerId: action.playerId, amount: action.payEnergy });
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
  // γ1h (BLITZ DC-1) — pay a "Discard a card" cost by moving the CHOSEN hand card to the graveyard
  // (CR 601.2h / 701.8 — a discard from a cost is still a discard; the graveyard-entry event records via
  // moveCardToZone's chokepoint). The card is re-resolved against the LIVE hand; a missing card is a hard
  // error so we never silently under-pay (CREED). Done BEFORE the ability goes on the stack.
  if (action.discardCardId) {
    const inHand = (working.players[action.playerId]?.hand || []).some((c) => c.id === action.discardCardId);
    if (!inHand) throw new DispatcherError(`Discard-cost card ${action.discardCardId} not in hand`, "CARD_NOT_FOUND");
    working = moveCardToZone(working, { playerId: action.playerId, fromZone: "hand", toZone: "graveyard", cardId: action.discardCardId });
    working = checkDiscardTriggers(working, action.playerId, 1);
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
    // γ1c/CC-2 — remove EXACTLY the parsed count (1 for the singular form; N for a "Remove N <type>
    // counters" cost — the Thallid / Lux Cannon class) of the named kind from the SOURCE, at activation
    // time (CR 601.2h via 602.2b — the cost is paid before the ability goes on the stack). The offer gate
    // guaranteed ≥N exist (CR 118.3), so this never under-pays; `count` defaults to 1 for a pre-CC-2
    // serialized action. The removal mutates the same per-permanent counter pile the layer system reads,
    // so a +1/+1-counter payment drops derived P/T immediately.
    working = removeCounter(working, { permanentId: action.permanentId, type: action.removeCounter.type, amount: action.removeCounter.count || 1 });
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
  // PER-TURN ACTIVATION LIMIT (BLITZ ONCE-1, generalized to a count): stamp the activation ledger the
  // moment the ability is on the stack — keyed permId:rawLine, recording { turn, n } so a limit above one
  // ("Activate no more than twice each turn.") can be counted rather than merely latched. A record from an
  // earlier turn restarts at 1, which is what makes the ledger self-expiring; legalChoices' offer gate
  // reads the same shape. (The state key keeps its historical `activatedOncePerTurn` name — renaming a
  // serialized game-state field would break saved self-play trajectories for no behavioral gain.)
  if (action.oncePerTurnKey) {
    const prev = next.activatedOncePerTurn?.[action.oncePerTurnKey];
    // ⚠️ POWER-UP (game-scoped limits) NEEDS NOTHING HERE, and I verified that rather than assuming it. I
    // first made this line accumulate across turns for `action.oncePerGame` — and the mutation reverting it
    // SURVIVED the whole suite. The reason is that every game-scoped limit in the corpus is exactly 1: the
    // OFFER GATE blocks the second activation, so this stamp is only ever written once and the turn-reset it
    // performs is unreachable. Dead code that looks load-bearing is worse than no code, so it is gone.
    // ⛔ If a game-scoped limit ABOVE 1 is ever added ("activate only twice per game"), this line must
    // accumulate for it — the gate would let a second activation through and this would reset the count.
    const n = (prev && prev.turn === next.turn ? prev.n : 0) + 1;
    next = { ...next, activatedOncePerTurn: { ...(next.activatedOncePerTurn || {}), [action.oncePerTurnKey]: { turn: next.turn, n } } };
  }
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
  // BECOMES-TARGET (CR 603.2 — the Phantasmal Illusion family): an activated ability targeting a permanent that
  // carries the sac trigger fires it too — the event is any spell OR ability, CR 603.2. Enqueued + flushed ABOVE
  // the ability so it resolves first (CR 603.3b). Fires regardless of who activated (a player pinging their own
  // Phantasmal Bear sacrifices it). No-op when no targeted permanent carries the trigger.
  next = checkBecomesTargetTriggers(next, stackObject);
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
  // KIRA (kiraTargetCounter.js): an ABILITY targeting an eligible-and-fresh Kira-protected creature is countered
  // outright too (CR 603.2 — "a spell or ability"; an ability off the stack has no zone change on counter). Same
  // last-placement / rare-overlap reasoning as the cast path. No-op when no Kira source is in play.
  next = applyKiraTargetCounter(next, stackObject);
  // CR 117.3c (B4): the ACTIVATOR retains priority after the ability goes on the stack,
  // exactly like casting a spell.
  return { ...next, priorityHolder: action.playerId, consecutivePasses: 0 };
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

  // Pay the cycling cost (CR 602.2b — before the ability is on the stack). LIFE-COST CYCLING
  // (Street Wraith, SHELF S7): a life cost routes through loseLife — paying life IS losing life
  // (CR 118.8), so life-loss watchers (Mindcrank) fire exactly as printed. Never payable below the
  // cost (CR 118.4; legalChoices additionally never offers it at ≤ the cost).
  let working;
  if (action.lifeCost != null) {
    if ((player.life ?? 0) < action.lifeCost) throw new DispatcherError("Cannot pay the cycling life cost", "LIFE_SHORT");
    working = loseLife(state, { playerId: action.playerId, amount: action.lifeCost });
  } else {
    const plan = planPayment(player.manaPool, manaSources(state, action.playerId), action.cost);
    if (!plan) throw new DispatcherError("Cannot pay the cycling cost", "MANA_SHORT");
    working = commitPaymentPlan(state, action.playerId, plan);
  }

  // Pay the DISCARD part of the cost — the card itself, hand → graveyard.
  working = moveCardToZone(working, { playerId: action.playerId, fromZone: "hand", toZone: "graveyard", cardId: action.cardId });
  working = checkDiscardTriggers(working, action.playerId, 1);

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
  // Cycling uses the stack — the CYCLER retains priority (CR 117.3c, B4), like any activated ability.
  return { ...next, priorityHolder: action.playerId, consecutivePasses: 0 };
}

/**
 * DISCARD-COST HAND ABILITY — "<mana>, Discard this card: <effect>". Cycling with an arbitrary effect, so
 * this is applyCycle's body with ONE difference: the program comes from the card's own parsed effect text
 * instead of a hard-coded draw. Everything else is deliberately identical — pay the mana, move the card
 * hand -> graveyard as the rest of the cost, fire discard triggers, push an effect-program stack object,
 * retain priority (CR 117.3c, an activated ability like any other).
 *
 * ⛔ THE COST IS PAID BEFORE THE ABILITY GOES ON THE STACK (CR 601.2h/602.2b), which is why the discard
 * happens here and not in the resolver: the card is in the graveyard while the ability resolves, exactly as
 * printed. legalChoices already refused anything whose program is low-confidence or needs a chosen target,
 * so by this point the program is known-resolvable with no targets.
 */
function applyDiscardAbility(state, action) {
  const player = state.players[action.playerId];
  const card = (player?.hand || []).find((c) => c.id === action.cardId);
  if (!card) throw new DispatcherError("Card is not in hand", "NOT_IN_HAND");
  const ab = parseDiscardCostAbility(card);
  if (!ab) throw new DispatcherError("Card has no discard-cost ability", "NO_ABILITY");
  // ⚠️ PARSED UNDER A LITERAL "Instant", NOT the card's own type — the SAME correction
  // matchOptionalDiscardPayment already carries. Several atoms (pump, deal-damage) are
  // type-gated to Instant/Sorcery and return LOW for a Creature, so passing the card's real
  // type refused abilities that are perfectly modeled (Harvester of Misery, Mjolnir).
  // The atoms resolve type-agnostically, so this is behaviour-identical and correct.
  const program = parseEffectClause(ab.effectText, "Instant");
  if (!program || programConfidence(program) !== "high") throw new DispatcherError("Ability effect is not modeled", "UNMODELED_EFFECT");

  const plan = planPayment(player.manaPool, manaSources(state, action.playerId), action.cost);
  if (!plan) throw new DispatcherError("Cannot pay the ability cost", "MANA_SHORT");
  let working = commitPaymentPlan(state, action.playerId, plan);

  working = moveCardToZone(working, { playerId: action.playerId, fromZone: "hand", toZone: "graveyard", cardId: action.cardId });
  working = checkDiscardTriggers(working, action.playerId, 1);

  const { id: stkId, state: working2 } = mintId(working, "stk");
  const stackObject = createStackObject({
    id: stkId, kind: "activated-ability",
    source: { name: card.name, oracle: "" },
    controller: action.playerId, targets: [], cost: action.cost,
    payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program, controller: action.playerId, targets: [] } },
  });
  let next = { ...working2, stack: [...working2.stack, stackObject] };
  next = logEvent(next, { kind: "discard-ability", playerId: action.playerId, cardName: card.name });
  return { ...next, priorityHolder: action.playerId, consecutivePasses: 0 };
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
  // BECOMES-TARGET (CR 603.2 — the Phantasmal Illusion family): a loyalty ability that TARGETS a permanent
  // carrying the sac trigger fires it too — a loyalty ability IS an activated ability (CR 606.1), so "a spell or
  // ability" covers it. Enqueued + flushed ABOVE the loyalty ability so it resolves first (CR 603.3b). No-op
  // when the loyalty ability targets nothing / no targeted permanent carries the trigger. Placed BEFORE the
  // zero-loyalty SBA sweep so the sac trigger sits atop the loyalty ability regardless of the walker's fate.
  next = checkBecomesTargetTriggers(next, stackObject);
  next = flushTriggers(next, { chooseTargets: chooseTriggerTargets });
  // KIRA (kiraTargetCounter.js): a loyalty ability IS an activated ability (CR 606.1), so "a spell or ability"
  // covers it — a loyalty ability targeting an eligible-and-fresh Kira-protected creature is countered outright.
  // Placed BEFORE the zero-loyalty SBA sweep (like the becomes-target flush above) so the counter lands while
  // the loyalty ability is on the stack regardless of the walker's fate. No-op when no Kira source is in play.
  next = applyKiraTargetCounter(next, stackObject);
  // SBA (CR 704.5i): paying a −N cost down to 0 puts the walker into the graveyard. The ability is
  // already on the stack (above) and still resolves — putting it there before the sweep is what
  // preserves that ordering.
  const pwSba = destroyZeroLoyaltyPlaneswalkers(next);
  next = pwSba.state;
  // PLANESWALKER-DIES (CR 700.4) — a walker that paid itself to 0 loyalty also "dies"; fire its dies-watchers
  // so a creature-or-planeswalker drain (Cruel Celebrant) fires. creatureOrPwYouControl is the only scope that
  // responds; creature-only scopes skip a PW death.
  next = checkPlaneswalkerDiesTriggers(next, pwSba.dead);
  // A loyalty ability uses the stack — the ACTIVATOR retains priority (CR 117.3c, B4; loyalty is
  // sorcery-speed so actor === activePlayer today, stated in the uniform actor form).
  return { ...next, priorityHolder: action.playerId, consecutivePasses: 0 };
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

  // ATTACK TAX (CR 508.1g — Propaganda / Ghostly Prison / Windborn Muse): pay {N} per taxing permanent the
  // defender controls, for THIS attacker. Declaration here is sequential, so N attackers pay N × {2} —
  // the printed total, one step at a time (see attackTax.js).
  //
  // PAID FROM `next`, i.e. AFTER the tap above, and that ordering is CR 508.1 f→h rather than a detail:
  // attackers tap before mana abilities are activated, so a non-vigilance attacker is already tapped and
  // is not among its own funding sources. A vigilance attacker is still untapped here and may pay with
  // itself, which is correct and is why the read happens on the post-tap state instead of a filter.
  //
  // legalChoices withholds the action when the tax is unaffordable, so an unpayable tax here means the
  // board moved between enumeration and dispatch. That THROWS rather than declaring a free attack — an
  // unfunded attacker is exactly the false positive this whole slice exists to prevent, and swallowing it
  // would put it back.
  const attackTax = attackTaxToDeclare(next, defender);
  if (attackTax > 0) {
    const { state: taxed, paid } = payManaCost(next, action.playerId, { generic: attackTax });
    if (!paid) {
      throw new DispatcherError(
        `Can't declare ${creature.card?.name || action.permanentId} as an attacker: the {${attackTax}} attack tax is unpayable`,
        "ATTACK_TAX_UNPAID",
      );
    }
    next = logEvent(taxed, { turn: state.turn, kind: "attack-tax-paid", attackerId: action.permanentId, playerId: action.playerId, generic: attackTax });
  }
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
    players: {
      ...next.players,
      [action.playerId]: {
        ...next.players[action.playerId],
        attackedThisTurn: true,
        // BOAST (CR 702.135b) needs PER-PERMANENT attack history, not per-player: "only if THIS CREATURE
        // attacked this turn". Reading the seat flag would offer boast whenever ANY of your creatures
        // attacked, which is a different and much looser card. Stamped at the same sole chokepoint, and
        // cleared beside the seat flag at untap so the two can never drift out of step.
        battlefield: (next.players[action.playerId].battlefield || []).map((pm) =>
          pm.id === action.permanentId ? { ...pm, attackedThisTurn: true } : pm),
      },
    },
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
  // DEFENDER-IDENTITY GATE (CR 509.1a) — hard check mirroring canBlockAttacker's enumeration gate: the
  // blocking player must BE the seat this attacker was declared against (covers the planeswalker/battle
  // cases too — the entry's `defender` is that permanent's controller). A stray or replayed action from
  // another seat must never slip a cross-seat block past enumeration. Blocking a creature with no combat
  // entry at all is equally illegal (there is nothing attacking to block).
  const attackerEntry = (state.combat?.attackers || []).find((a) => a.permanentId === action.attackerId);
  if (!attackerEntry) throw new DispatcherError(`Attacker ${action.attackerId} is not in combat`, "ATTACKER_NOT_IN_COMBAT");
  if (attackerEntry.defender !== action.playerId) {
    throw new DispatcherError(
      `${action.playerId} cannot block attacker ${action.attackerId} — it attacks ${attackerEntry.defender} (CR 509.1a)`,
      "CROSS_SEAT_BLOCK",
    );
  }

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
  return { ...next, priorityHolder: action.playerId, consecutivePasses: 0 };
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
  // SINGLE-PRODUCER INVARIANT: an ALT-COST cast (a printed alternative cost — Fierce Guardianship free,
  // Force of Will pitch) carries `action.altCost` and NEVER `action.freeCast`, and the alt-cost dual offer
  // is suppressed inside every freeCast enumeration — so this clear (and the pendingCascade one below) can
  // never be tripped, nor starved, by the alt-cost subsystem.
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
  // MILLED-GY CAST (Raul, Trouble Shooter — "Once during each of your turns…"): a cast offered by
  // actionsCastMilledFromGraveyard carries the permission SOURCE's id; latch it in
  // onceTriggersFiredThisTurn (per source, cleared at the untap step like every once-latch) so the
  // printed "once" is enforced — no second offer this turn.
  if (action.milledGyCastSourceId) {
    return {
      ...next,
      onceTriggersFiredThisTurn: { ...(next.onceTriggersFiredThisTurn || {}), [`${action.milledGyCastSourceId}_milledGyCast`]: true },
    };
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
  const elseLand = state.pendingFreeCast.elseLandFromHand === true;
  const { pendingFreeCast: _drop, ...rest } = state;
  let next = logEvent(rest, { kind: "free-cast-decline", playerId: action.playerId });
  // ELSE-LAND arm (Kellan, the Kid — "If you don't, you may put a land card from your hand onto the
  // battlefield"): declining the free cast IS "you don't", so the optional land put fires here (auto-taken —
  // pure upside; applyTutor's hand-source pick, the Growth-Spiral machinery). No land in hand → clean no-op.
  if (elseLand) next = applyElseLandFromHand(next, action.playerId);
  return next;
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
  return { ...next, priorityHolder: action.playerId, consecutivePasses: 0 };
}

// KW-SUSPEND (CR 702.62a) — the suspend SPECIAL ACTION for the no-mana-cost trio: pay the suspend
// cost, exile the card face-up from hand with N time counters (`_suspendCounters`, the plot stamp
// pattern). Does not use the stack, does not pass priority (CR 116.2g). The countdown lives in
// fading.applySuspendUpkeep; the zero-counter free cast is offered by legalChoices through the real
// cast machinery.
function applySuspend(state, action) {
  const player = state.players[action.playerId];
  if (!player) throw new DispatcherError(`Unknown player ${action.playerId}`, "BAD_PLAYER");
  const card = player.hand.find(c => c.id === action.cardId);
  if (!card) throw new DispatcherError(`Suspend card ${action.cardId} not in hand`, "CARD_NOT_IN_HAND");

  const plan = planPayment(player.manaPool, manaSources(state, action.playerId), action.cost);
  if (!plan) throw new DispatcherError("Cannot pay the suspend cost", "MANA_SHORT");
  let working = commitPaymentPlan(state, action.playerId, plan);

  working = moveCardToZone(working, { playerId: action.playerId, fromZone: "hand", toZone: "exile", cardId: action.cardId });
  const exile = working.players[action.playerId].exile;
  const idx = exile.findIndex(c => c.id === action.cardId);
  const flaggedExile = [...exile];
  flaggedExile[idx] = { ...exile[idx], _suspendCounters: action.suspendCounters };
  working = { ...working, players: { ...working.players, [action.playerId]: { ...working.players[action.playerId], exile: flaggedExile } } };

  let next = logEvent(working, { kind: "suspend", playerId: action.playerId, cardName: card.name, counters: action.suspendCounters, cost: action.cost });
  return { ...next, priorityHolder: action.playerId, consecutivePasses: 0 };
}

const HANDLERS = {
  "pass-priority": applyPassPriority,
  "suspend": applySuspend, // KW-SUSPEND (CR 702.62a) — exile with time counters; ticked at fading.applySuspendUpkeep
  "play-land": applyPlayLand,
  "cast-spell": applyCastSpellMaybeDiscover, // DISCOVER: clears pendingDiscover after a free-cast from exile
  "tap-for-mana": applyTapForMana,
  "double-mana-pool": applyDoubleManaPool, // DOUBLE-MANA-POOL (Doubling Cube): a no-stack mana ability that doubles the pool
  "activate-ability": applyActivateAbility,
  "activate-gy-recursion": applyActivateGyRecursion, // GY-1 (CR 602.2): "Return this card from your graveyard …" activated from the graveyard
  "activate-gy-exile": applyActivateGyExile, // GY-2 (CR 602.2): "<mana>, Exile this card from your graveyard: <effect>"
  "crew-vehicle": applyCrewVehicle, // CREW (VH-1, CR 702.121c): tap creatures totaling power ≥ N → the Vehicle animates until EOT
  "cycle": applyCycle, // KW-CYCLING: discard a hand card to draw
  "discard-ability": applyDiscardAbility, // "<mana>, Discard this card: <effect>" — cycling generalized
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
  // REGEN (CR 701.19a): a creature removed from combat by regeneration clears that transient flag when combat
  // ends, so it attacks/blocks normally next combat. Shared helper — the engine's end-of-combat reset uses it too.
  return { ...clearRemovedFromCombatFlags(state), combat: { attackers: [], blockers: [] } };
}
