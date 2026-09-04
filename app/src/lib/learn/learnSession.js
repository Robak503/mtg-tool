/**
 * Phase 6 PR6.2 — learnSession.js
 *
 * Top-level lifecycle container for a Learn-to-Play session. Wraps the
 * GameState with metadata (difficulty, decision log, status) and
 * exposes the "user perspective" API the UI consumes:
 *
 *   createLearnSession({ userDeck, opponentDeck, ... })
 *     → fresh session in "active" status with both opening 7s drawn
 *
 *   advanceUntilDecision(session)
 *     → drives the engine forward applying AI decisions and trivial
 *       user auto-passes until the user has a real decision to make
 *       OR the game ends. Returns { session, decision } where
 *       decision is the next thing to render in the UI.
 *
 *   applyChoice(session, choice)
 *     → user picks one of the legal options; dispatcher applies it,
 *       decisionLog appends, returns updated session.
 *
 *   isComplete(session)
 *     → "active" | "user-wins" | "ai-wins" | "abandoned"
 *
 *   abandon(session)
 *     → marks status and returns the final session.
 *
 * Pure: no fetches, no React. The /api/learn routes (PR6.3) wrap
 * this; the UI (PR6.4) consumes the routes.
 */

import { createGameState, loseLife, logEvent, moveCardToZone, MODES } from "./gameState.js";
import { setPendingCommanderReturnChoice, clearPendingChoice } from "./pendingChoice.js";
import { autoPickOptionalLifePayment } from "./landEntersTapped.js"; // LANDS-TIER slice 2 — the shockland auto-policy (pay iff life >= 10)
import { autoPickSylvanLibraryPayment, autoPickTemptingOffer } from "./choicePolicy.js"; // + TEMPTING OFFER (Tempt with Discovery) — the asked opponent's auto-answer // SG-15b — Sylvan Library's per-card pay-or-put-back auto-policy (pay iff ≥8 life would remain)
import { resolveSylvanLibraryChoice, resolveTemptingOfferChoice } from "./effects/runProgram.js"; // + TEMPTING OFFER — the asked opponent's settler // SG-15b — the per-card settler (chains the next card, then resumes)
import {
  startGame,
  prepareStart,
  dealOpeningHands,
  openFirstPriority,
  applyMulliganShip,
  applyMulliganKeep,
  nextStep,
  runStepActions,
  finalizeStackResolution,
  settleCleanupDiscardChoice,
  finishCleanupActions,
} from "./gameEngine.js";

// The human seat id (createGameState always names the player's seat "user"; opponents are
// "ai" / the pod). Used by the interactive human-mulligan phase below.
const HUMAN_SEAT = "user";
// London floor (CR 103.5): once a seat has shipped this many times, a further ship would bottom
// all 7 → a 0-card hand, so no more shipping is allowed. Mirrors gameEngine's STARTING_HAND_SIZE.
const HAND_SIZE = 7;
import { playerCantLoseGame, playerCantWinGame } from "./layers.js"; // CR 104.3a/104.2a — the can't-lose / can't-win statics (layers never imports learnSession, so this edge is one-way and cycle-free)
import { legalActionsForPlayer } from "./legalChoices.js";
import { makeDecision, resolveChoice } from "./decisionGate.js";
import { takeLastCastRanking } from "./opponentAI.js"; // M5.1 — the tick-scoped cast-ranking side-channel (nearTie/top-k rows)
import { stableActionKey as _stableActionKey } from "./actionKey.js";
import { dispatchAction } from "./actionDispatcher.js";
import { isLandCard } from "./effects/atoms/shared.js"; // death capture: count lands stuck in the eliminated player's hand
import { checkAllStateBasedActions } from "./sba.js"; // CR 704.3 (B2) — the comprehensive permanent-SBA fixpoint at the priority checkpoint
import { resolveAtom } from "./effects/effectAtoms.js"; // Arbiter-in-runner: apply a cached verdict's atoms (applyArbiterVerdict)
import { featurizeState } from "./gameFeatures.js";
import {
  autoPickTutorCandidate,
  resolveTutorChoice,
  resolveScryChoice,
  resolveOptionalChoice,
  autoPickHandDiscardCandidate,
  resolveHandDiscardChoice,
  resolveImprintChoice,
  resolveImpulseDigChoice,
  autoPickLookTopTake,
  resolveLookTopTakeChoice,
  autoPickDigLandCandidate,
  resolveDigLandChoice,
  autoPickSacrificeCandidate,
  resolveSacrificeChoice,
  autoPickDiscardCandidate,
  resolveDiscardChoice,
  autoPickHandToLibraryTopCandidate,
  resolveHandToLibraryTopChoice,
  autoPickDivideDistribution,
  resolveDivideChoice,
  autoPickDistributeCounters,
  resolveDistributeChoice,
  autoPickSoftCounterPay,
  resolveSoftCounterChoice,
  autoPickOptionalManaPayment,
  resolveOptionalManaPaymentChoice,
  resolveOptionalLifePaymentChoice,
  autoPickOptionalSac,
  resolveOptionalSacChoice,
  autoPickOptionalDrawDiscard,
  resolveOptionalDrawDiscardChoice,
  autoPickOptionalDiscard,
  resolveOptionalDiscardPaymentChoice,
  resolveOptionalExileSelfChoice,
  resolveMilledPickChoice,
  autoPickSacUnlessPay,
  resolveSacUnlessPayChoice,
  autoPickTaxedPayment,
  resolveTaxedPaymentChoice,
  autoPickEdictMode,
  resolveEdictModeChoice,
  optionalAutoTakeValue,
} from "./effects/runProgram.js";
import { resolveCloneChoice } from "./resolvers.js";
import { autoPickCloneCandidate } from "./cloneCopy.js";

const VALID_DIFFICULTIES = new Set(["beginner", "intermediate", "expert"]);

function generateSessionId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `learn-${globalThis.crypto.randomUUID().slice(0, 12)}`;
  }
  return `learn-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Build a fresh session. Opening 7s drawn for every seat, status
 * "active", decisionLog empty. Caller passes:
 *   userDeck         — array of card objects
 *   mode             — "standard" (1v1) | "commander" (4P FFA); default "standard"
 *   opponentDeck     — Standard: the lone opponent's cards
 *   opponentDecks    — Commander: array of exactly 3 opponent libraries (the pod)
 *   userCommanders   — optional array of commander cards
 *   opponentCommanders — Standard: the lone opponent's commanders;
 *                        Commander: array of 3 per-opponent commander arrays
 *   difficulty       — "beginner" | "intermediate" | "expert"
 *   activePlayer     — optional player id (default "user")
 *   seed             — optional integer; when given, every seat's library is
 *                      shuffled deterministically (same seed ⇒ same game).
 *                      Omitted (default) ⇒ deck-list order, byte-identical to
 *                      the pre-seed engine. Self-play passes a distinct seed
 *                      per game so repeats vary.
 *   mulligan         — OPT-IN London mulligan config (default null ⇒ NO mulligan
 *                      surfaced; the dealt opening 7s are kept, BYTE-IDENTICAL to
 *                      before). When provided as `{ decide, pilots?, recordMulligan? }`,
 *                      each seat runs the London keep/ship phase (CR 103.5) at game
 *                      start via startGame → runMulliganPhaseForSeat. A pilot opts in
 *                      here; the engine never imports a pilot. See startGame's docs.
 *
 * Throws on missing decks, invalid difficulty, invalid mode, or a
 * commander pod that isn't exactly 3 decks.
 */
export function createLearnSession({
  userDeck,
  opponentDeck,
  opponentDecks = null,
  userCommanders = [],
  opponentCommanders = [],
  userCompanion = null,
  opponentCompanions = null, // CMD-COMPANION: commander → array (one per opponent); standard → the lone opponent's companion
  difficulty = "beginner",
  activePlayer = "user",
  mode = "standard",
  seed = null, // opt-in seeded opening shuffle (default null ⇒ deck-list order, byte-identical to before)
  mulligan = null, // opt-in London mulligan (default null ⇒ keep the dealt 7, byte-identical); { decide, pilots?, recordMulligan? }
  // HUMAN LONDON MULLIGAN (opt-in, free-play/Academy human path). true ⇒ deal the opening hands
  // but DON'T open the game: the "user" seat resolves keep/ship/bottom-N INTERACTIVELY via
  // advanceMulligan (the session sits at status "mulligan" until the player finishes), then the
  // game opens. AI/pod seats keep their dealt 7 (no bot mulligan here). Distinct from the `mulligan`
  // config above, which is the synchronous bot/self-play driver. Default false ⇒ byte-identical.
  humanMulligan = false,
  // FFA-SOLE-SURVIVOR (HARNESS-DATA wave 1b; default fixed in CR-remediation B4): when true, a 4P
  // pod plays to the LAST PLAYER STANDING — the user seat dying is an elimination like any other,
  // not the end of the game. DEFAULT (null): resolved to `mode === "commander"` — CR 104.2a says a
  // player wins only when ALL opponents have left, so a HUMAN Academy pod now correctly keeps
  // playing after the user dies instead of ending instantly against an arbitrary "winner" (the
  // /api/learn/start route never passed this flag and was live with the legacy behavior). Standard
  // (1v1) keeps the user-pivot semantics, where they are CR-equivalent anyway. Pass an explicit
  // false to opt a commander session back into the legacy flow (determinism pins).
  ffaSoleSurvivor = null,
} = {}) {
  if (!Array.isArray(userDeck) || userDeck.length === 0) {
    throw new Error("createLearnSession: userDeck must be a non-empty array");
  }
  if (!VALID_DIFFICULTIES.has(difficulty)) {
    throw new Error(
      `createLearnSession: difficulty must be one of ${[...VALID_DIFFICULTIES].join(", ")}`,
    );
  }
  if (!MODES.includes(mode)) {
    throw new Error(`createLearnSession: mode must be one of ${MODES.join(", ")}`);
  }

  let state;
  if (mode === "commander") {
    if (!Array.isArray(opponentDecks) || opponentDecks.length !== 3) {
      throw new Error(
        "createLearnSession: commander mode requires opponentDecks to be an array of exactly 3 decks",
      );
    }
    opponentDecks.forEach((deck, i) => {
      if (!Array.isArray(deck) || deck.length === 0) {
        throw new Error(`createLearnSession: opponentDecks[${i}] must be a non-empty array`);
      }
    });
    state = createGameState({
      userDeck,
      opponentDecks,
      userCommanders,
      opponentCommanders, // array-of-arrays, one per opponent
      userCompanion,
      opponentCompanions, // CMD-COMPANION: array, one companion (or null) per opponent
      activePlayer,
      mode,
    });
  } else {
    if (!Array.isArray(opponentDeck) || opponentDeck.length === 0) {
      throw new Error("createLearnSession: opponentDeck must be a non-empty array");
    }
    state = createGameState({
      userDeck,
      aiDeck: opponentDeck,
      userCommanders,
      aiCommanders: opponentCommanders,
      userCompanion,
      aiCompanion: opponentCompanions, // CMD-COMPANION: the lone opponent's companion
      activePlayer,
      mode,
    });
  }
  let status = "active";
  let mulliganMarker = undefined;
  if (humanMulligan) {
    // Deal opening hands to every seat but STOP before opening the game — the user seat resolves
    // its London mulligan interactively (advanceMulligan) and openFirstPriority runs afterward.
    state = dealOpeningHands(prepareStart(state, { seed }));
    status = "mulligan";
    mulliganMarker = { seat: HUMAN_SEAT, mulligans: 0, phase: "decide" };
  } else {
    state = startGame(state, { seed, mulligan });
  }

  // Carry the FFA rule ON THE STATE so every status surface (recordOutcomeIfChanged here,
  // gameStatus in gameApi.js) reads the same flag and can never drift — and so a serialized
  // save replays under the semantics it was played with. Absent (legacy saves) ⇒ user-pivot.
  // B4: null (the default) resolves to the mode — commander pods play sole-survivor per CR 104.2a.
  if (ffaSoleSurvivor ?? mode === "commander") {
    state = { ...state, rules: { ...(state.rules || {}), ffaSoleSurvivor: true } };
  }

  return {
    id: generateSessionId(),
    createdAt: new Date().toISOString(),
    difficulty,
    mode,
    state,
    decisionLog: [],
    status,
    ...(mulliganMarker ? { mulligan: mulliganMarker } : {}),
  };
}

// ─── Interactive human London mulligan (CR 103.5) ────────────────────────────
// A pre-game phase that lives on the SESSION (status "mulligan" + a `session.mulligan` marker),
// NOT on state.pendingChoice — it happens before the game opens, so it can't ride the in-game
// decision loop. The routes surface `mulliganDecision(session)` and answer it with
// `advanceMulligan(session, action)`, which drives the slice-1 engine step-primitives one step
// per call and, when the player finishes, opens the game and hands off to advanceUntilDecision.

/**
 * The decision view for the current mulligan step (the ask the UI renders).
 *   phase "decide" → the fanned hand + keep/ship options (ship omitted at the CR 103.5 floor).
 *   phase "bottom" → the fanned hand + how many cards to put on the bottom (= the mulligan count).
 * `hand` is the seat's current hand (full card objects; the route slims it for the wire).
 */
export function mulliganDecision(session) {
  const m = session.mulligan || {};
  const seat = m.seat || HUMAN_SEAT;
  const mulligans = m.mulligans || 0;
  const hand = session.state.players[seat]?.hand || [];
  if (m.phase === "bottom") {
    return { kind: "mulligan", phase: "bottom", seat, mulligans, bottomCount: mulligans, hand };
  }
  const options = [{ kind: "mulligan-keep" }];
  if (mulligans < HAND_SIZE) options.push({ kind: "mulligan-ship" });
  return { kind: "mulligan", phase: "decide", seat, mulligans, hand, options };
}

/**
 * Open the game after the human's opening hand is locked, then run to the first real decision.
 * Clears the mulligan marker and flips the session to "active" (advanceUntilDecision requires it).
 */
function openAndAdvance(session, opts) {
  const opened = openFirstPriority(session.state);
  const { mulligan: _drop, ...rest } = session;
  return advanceUntilDecision({ ...rest, state: opened, status: "active" }, opts);
}

/**
 * Answer the current mulligan step. Actions:
 *   { kind: "mulligan-ship" } — reshuffle + redraw 7, count the mulligan, re-ask (decide phase).
 *                               Ignored at the CR 103.5 floor (7 ships) → falls through to keep.
 *   { kind: "mulligan-keep" } — keep the current hand. 0 mulligans ⇒ open the game immediately;
 *                               >0 ⇒ advance to the bottom-pick phase (must bottom `mulligans` cards).
 *   { kind: "mulligan-bottom", cardIds: [...] } — bottom exactly those cards (validated in the
 *                               engine — a bad set silently falls back to the worst-N heuristic),
 *                               then open the game.
 * Returns { session, decision } like every other apply* handler. A call outside the mulligan phase
 * re-derives (double-submit safe): active ⇒ advanceUntilDecision, otherwise a game-over view.
 */
export function advanceMulligan(session, action = {}, opts = {}) {
  if (session.status !== "mulligan" || !session.mulligan) {
    if (session.status === "active") return advanceUntilDecision(session, opts);
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const { seat, mulligans, phase } = session.mulligan;
  const kind = action?.kind;

  if (phase === "bottom") {
    // The player has chosen which `mulligans` cards to put on the bottom (London). A malformed or
    // missing set is validated + heuristic-backstopped inside applyMulliganKeep — never strands setup.
    const cardIds = Array.isArray(action?.cardIds) ? action.cardIds : [];
    const kept = applyMulliganKeep(session.state, seat, {
      ships: mulligans,
      chooseBottom: () => cardIds,
    });
    return openAndAdvance({ ...session, state: kept }, opts);
  }

  // phase === "decide"
  const canShip = mulligans < HAND_SIZE;
  if (kind === "mulligan-ship" && canShip) {
    const shipped = applyMulliganShip(session.state, seat, mulligans);
    const next = {
      ...session,
      state: shipped,
      mulligan: { seat, mulligans: mulligans + 1, phase: "decide" },
    };
    return { session: next, decision: mulliganDecision(next) };
  }

  // KEEP (any non-ship action, or a ship at the floor).
  if (mulligans === 0) {
    // Kept the opening 7 — record the keep (mulligans 0, nothing bottomed) and open the game.
    const kept = applyMulliganKeep(session.state, seat, { ships: 0 });
    return openAndAdvance({ ...session, state: kept }, opts);
  }
  // Kept after ≥1 ship — the player must now choose `mulligans` cards to bottom.
  const next = { ...session, mulligan: { seat, mulligans, phase: "bottom" } };
  return { session: next, decision: mulliganDecision(next) };
}

// ─── Status helpers ──────────────────────────────────────────────────────────

/**
 * A player loses if their life is 0 or less (CR 104.3a / 704.5a), if they have ten or more poison
 * counters (CR 704.5c — KW-POISON), or if they've taken 21+ combat damage from any single commander
 * (CR 903.10a / 704.6c). A player already removed from state.players counts as dead.
 */
function isPlayerDead(state, playerId) {
  const player = state.players[playerId];
  if (!player) return true;
  // ⭐ CAN'T-LOSE (CR 104.3a) — Platinum Angel, Herald of Eternal Dawn, Lich's Mastery, and (aimed at the
  // OPPONENTS) Abyssal Persecutor. Checked FIRST, ahead of every lose condition, because that is what the
  // rule says: the player simply does not lose, however far below 0 their life is.
  // ⛔ A player with no controller left on the battlefield still dies — the guard above returns true before
  // this, so an eliminated seat can't be resurrected by a stale static.
  if (playerCantLoseGame(state, playerId)) return false;
  if (player.lostGame) return true; // UPKEEP-WIN — "target player loses the game" (CR 104.3a, Door to Nothingness)
  if (player.triedToDrawFromEmpty) return true; // DECK-OUT (CR 104.3c / 120.3) — stamped at the drawCards chokepoint
  if (player.life <= 0) return true;
  if ((player.poison || 0) >= 10) return true;
  const dmgFrom = player.commanderDamageFrom || {};
  for (const fromId of Object.keys(dmgFrom)) {
    if (dmgFrom[fromId] >= 21) return true;
  }
  return false;
}

/** UPKEEP-WIN — a player flagged `wonGame` by the win-game atom (Revel in Riches, Felidar Sovereign,
 *  Knuckles the Echidna, a resolved "you win the game" spell). CR 104.2a: that player wins immediately. */
function hasWonGame(state, playerId) {
  // ⛔ CAN'T-WIN (CR 104.2a) — Abyssal Persecutor's drawback, and Platinum Persecutor's symmetric lock.
  // Without this the engine let an Abyssal Persecutor controller win outright, which is the ONE thing that
  // card exists to prevent.
  if (playerCantWinGame(state, playerId)) return false;
  return !!state.players?.[playerId]?.wonGame;
}

/**
 * Remove an eliminated player from the game (CR 800.4a — objects they own
 * leave with them). We drop their whole player record plus the references
 * other state holds to them: their objects on the stack, their combat
 * involvement, and the commander damage they dealt to survivors. turnOrder
 * shrinks so nextInTurnOrder / opponentsOf / the priority-pass threshold
 * all adapt automatically.
 *
 * Two cases:
 *   - Bystander leaves → keep the current turn going; reassign priority
 *     only if they held it (or it now points at a removed seat).
 *   - The ACTIVE player leaves → their turn ends now; we start the next
 *     surviving seat's turn cleanly from untap (via runStepActions) so no
 *     one inherits a half-finished turn.
 */
function removePlayerFromGame(state, playerId) {
  const oldOrder = state.turnOrder || Object.keys(state.players);
  const { [playerId]: _gone, ...players } = state.players;
  const turnOrder = oldOrder.filter((id) => id !== playerId);

  // Strip commander damage the leaving player's commander(s) dealt to survivors (CR 800.4a — their
  // objects leave with them). Damage is keyed PER-COMMANDER, so collect the leaving player's commander
  // card ids across every zone and drop those entries from each survivor's tracker.
  const goneCommanderIds = new Set();
  for (const zone of ["command", "battlefield", "graveyard", "exile", "hand", "library"]) {
    for (const entry of _gone?.[zone] || []) {
      const card = entry?.card || entry; // battlefield holds permanents (entry.card); other zones hold cards
      if (card?.isCommander) goneCommanderIds.add(card.commanderInstanceId || card.id);
    }
  }
  for (const id of turnOrder) {
    const dmg = players[id]?.commanderDamageFrom;
    if (dmg && Object.keys(dmg).some((k) => goneCommanderIds.has(k))) {
      players[id] = {
        ...players[id],
        commanderDamageFrom: Object.fromEntries(
          Object.entries(dmg).filter(([k]) => !goneCommanderIds.has(k)),
        ),
      };
    }
  }

  // Drop their objects on the stack and their combat involvement so later
  // resolution / combat steps never dereference a removed seat.
  const stack = (state.stack || []).filter((obj) => obj.controller !== playerId);
  let combat = state.combat;
  if (combat) {
    combat = {
      ...combat,
      attackers: (combat.attackers || []).filter(
        (a) => a.attackingPlayer !== playerId && a.defender !== playerId,
      ),
      blockers: (combat.blockers || []).filter((b) => b.blockingPlayer !== playerId),
    };
  }

  // EPOCH-2 instrumentation: carry the eliminated player's terminal vitals on the event —
  // read PRE-removal, they're gone after this — so the runner can derive finishRank,
  // eliminatedAtTurn, and the winCondition taxonomy without archaeology.
  const goneVitals = _gone
    ? {
        life: _gone.life ?? null,
        poison: _gone.poison ?? null,
        // The honest CR 120.3 stamp first (set at the drawCards chokepoint); the died-while-empty
        // heuristic stays as the fallback for deaths where the empty library was the real story.
        decked: !!_gone.triedToDrawFromEmpty || (_gone.library || []).length === 0,
        commanderLethal: Object.values(_gone.commanderDamageFrom || {}).some((n) => n >= 21),
        // Source of the lethal blow (loseLife stamped it on the killing damage): true = combat, false =
        // non-combat (burn/ability), null = a non-damage finish (drain/pay-life) → the "damage" win-con
        // stays generic. Lets epochStats split "damage" into combat / burn honestly (CREED — never guessed).
        lethalByCombat: _gone.lethalDamageCombat ?? null,
        // Lands stranded in hand at death — a "true flood" signal (a full grip of lands you never got to use),
        // richer than the by-turn-5 landsByT5 count. Read PRE-removal like the rest of goneVitals.
        landsInHand: (_gone.hand || []).filter(isLandCard).length,
      }
    : {};
  const log = [
    ...state.log,
    { turn: state.turn, kind: "player-eliminated", player: playerId, ...goneVitals },
  ];
  let base = { ...state, players, turnOrder, stack, combat, log };
  // PLAYER-AURA sweep (Fraying Sanity / the Curse class — SHELF S7, CR 704.5n analog): an Aura enchanting
  // the departed player has nothing legal to enchant — it's put into its controller's graveyard. Routed
  // through moveCardToZone so the leave/GY events record normally.
  for (const pid of Object.keys(base.players)) {
    for (const perm of [...(base.players[pid]?.battlefield || [])]) {
      if (perm.enchantedPlayerId === playerId) {
        base = moveCardToZone(base, {
          playerId: pid,
          fromZone: "battlefield",
          toZone: "graveyard",
          cardId: perm.id,
        });
      }
    }
  }

  if (state.activePlayer === playerId) {
    // Active player left mid-turn: end the turn and start the next
    // surviving seat's turn from untap, rather than splicing a survivor
    // into the dead player's phase/step.
    //
    // CR 800.4j (CR-remediation B3, bounded): the rule actually says the turn CONTINUES to completion
    // without an active player. The full null-active-player machinery (priority rotation, step
    // automatics, legality — all anchored on activePlayer today) is a deep rebuild the narrow gap
    // doesn't justify yet; what IS closed here is the truncated turn's END-OF-TURN HOUSEKEEPING:
    // before this fix the jump skipped cleanup outright, so marked damage and "until end of turn"
    // effects LEAKED into the next player's whole turn (creatures dying to stale damage, pumps
    // outliving their turn — wrong-play grade). finishCleanupActions runs damage wear-off, UEOT
    // expiry, and the SBA fixpoint at the truncation point. The 514.1 hand-size discard is correctly
    // NOT run (it belongs to the active player, who is gone). Residual, documented gap vs the full
    // rule: surviving seats still lose their remaining priority windows / end-step triggers of the
    // truncated turn — parked pending the 104.4b loop-detection state-machine work it composes with.
    const idx = oldOrder.indexOf(playerId);
    let nextActive = turnOrder[0] || null;
    for (let k = 1; k <= oldOrder.length; k++) {
      const cand = oldOrder[(idx + k) % oldOrder.length];
      if (cand !== playerId && players[cand]) {
        nextActive = cand;
        break;
      }
    }
    return runStepActions({
      ...finishCleanupActions(base),
      activePlayer: nextActive,
      turn: state.turn + 1,
      phase: "beginning",
      step: "untap",
      priorityHolder: null,
      consecutivePasses: 0,
    });
  }

  // Bystander left — keep the current turn going.
  let priorityHolder = state.priorityHolder;
  if (priorityHolder === playerId || (priorityHolder && !players[priorityHolder])) {
    priorityHolder = players[state.activePlayer] ? state.activePlayer : turnOrder[0] || null;
  }
  return { ...base, priorityHolder, consecutivePasses: 0 };
}

/**
 * State-based win/loss + elimination, run before every priority window.
 * From the user's seat:
 *   - user dead → "ai-wins" (you lost)
 *   - every opponent dead → "user-wins"
 *   - some-but-not-all opponents dead → remove them, keep playing
 *
 * Standard (a single opponent) only ever hits the first two branches, so
 * its board is never mutated mid-game and behavior is unchanged.
 */
function recordOutcomeIfChanged(session) {
  if (session.status !== "active") return session;
  const state = session.state;

  const order = state.turnOrder || Object.keys(state.players);
  const opponents = order.filter((id) => id !== "user");

  // UPKEEP-WIN (CR 104.2a), gated by CR 104.3f (CR-remediation B4): "If a player would both win and
  // lose the game simultaneously, that player LOSES." A win-game effect resolving while its controller
  // is also at lethal is a LOSS — the wonGame flag ends the game only for a player who is not
  // simultaneously dead; a dead "winner" falls through to the death/elimination logic below (their
  // loss, or the 104.4a draw when the table empties). The old code checked the flag first
  // unconditionally and one legacy test encoded that backwards behavior — both fixed in B4.
  if (hasWonGame(state, "user") && !isPlayerDead(state, "user")) {
    return { ...session, status: "user-wins", endedAt: new Date().toISOString() };
  }
  if (opponents.some((id) => hasWonGame(state, id) && !isPlayerDead(state, id))) {
    return { ...session, status: "ai-wins", endedAt: new Date().toISOString() };
  }

  const userDead = isPlayerDead(state, "user");
  const deadOpponents = opponents.filter((id) => isPlayerDead(state, id));
  const allOpponentsDead = opponents.length > 0 && deadOpponents.length === opponents.length;

  // FFA-SOLE-SURVIVOR (state-carried rule; self-play pods): the game ends only when one
  // player remains (they win, whichever seat they are) or none remain (draw, CR 104.4a).
  // A dead USER is an elimination like any other — the pod plays on without them. This is
  // what makes recorded winners REAL winners instead of the legacy turn-order crown.
  if (state.rules?.ffaSoleSurvivor) {
    const liveSeats = order.filter((id) => !isPlayerDead(state, id));
    if (liveSeats.length === 0) {
      return { ...session, status: "draw", endedAt: new Date().toISOString() };
    }
    if (liveSeats.length === 1) {
      return {
        ...session,
        status: liveSeats[0] === "user" ? "user-wins" : "ai-wins",
        endedAt: new Date().toISOString(),
      };
    }
    const deadSeats = order.filter((id) => isPlayerDead(state, id));
    if (deadSeats.length > 0) {
      let cleaned = state;
      for (const id of deadSeats) cleaned = removePlayerFromGame(cleaned, id);
      return { ...session, state: cleaned };
    }
    return session;
  }

  // Simultaneous death — the user AND every remaining opponent die in the same
  // SBA check (mutual lethal in one combat-damage step) → draw, not a user
  // loss (CR 104.4a). Checked before the user-loss branch so it wins the tie.
  if (userDead && allOpponentsDead) {
    return { ...session, status: "draw", endedAt: new Date().toISOString() };
  }

  if (userDead) {
    return { ...session, status: "ai-wins", endedAt: new Date().toISOString() };
  }

  // All opponents gone → win (no board mutation; the game is over).
  if (allOpponentsDead) {
    return { ...session, status: "user-wins", endedAt: new Date().toISOString() };
  }

  // Some opponents fell but others remain (Commander only): drop the
  // eliminated seats and keep playing.
  if (deadOpponents.length > 0) {
    let cleaned = state;
    for (const id of deadOpponents) cleaned = removePlayerFromGame(cleaned, id);
    return { ...session, state: cleaned };
  }

  return session;
}

// ─── Decision loop ───────────────────────────────────────────────────────────

// A real learn game ends long before this. Hitting it means the AI couldn't
// close (or a genuine non-progress bug) — we end as a draw with diagnostics
// rather than spinning to the tick cap.
const MAX_TURNS = 100;

// ─── Self-play time pressure (OPT-IN; NOT a Magic rule) ────────────────────────
//
// THE STALEMATE PROBLEM: the code-AI doesn't reliably CLOSE games, so most Expert
// self-play games drift to MAX_TURNS and end as a DRAW. A draw labels every seat 0.5
// (outcomeLabelForSeat) — useless for learning to WIN. This block adds an OPT-IN
// "game clock" that forces decisive endings so recorded games carry clean W/L labels.
//
// IMPORTANT — this is a SELF-PLAY TRAINING MECHANISM, not real Magic. There is NO CR
// citation here: real MTG has no turn-based life decay and no metric tiebreak. It is
// OFF by default (timePressure null/false), so the Academy / human play and every
// existing test see BYTE-IDENTICAL behavior (the loop still draws at MAX_TURNS). Only
// the offline self-play runner turns it on.
//
// FAIRNESS (CREED): the clock is SYMMETRIC — the SAME rule applies to every seat. Each
// turn past the soft cap, the ACTIVE player (whoever's turn it is) loses escalating
// life. Because turns rotate through all seats, no seat is singled out; the loser is
// simply whoever's life runs out first — a REAL state-based-action death (a true loss),
// not a fabricated call. It is fully DETERMINISTIC (a pure function of turn number), so
// a seeded game replays identically. A game that STILL reaches MAX_TURNS is reported as
// an honest `timeout` (no W/L label, down-weighted) — we NEVER relabel a stall as a win.
const TIME_PRESSURE_DEFAULTS = Object.freeze({
  // Turns of normal, unpenalized play before the clock engages. Deliberately set ABOVE
  // the natural length of a real game so the clock bites only genuine STALLS (a lock, a
  // pure-land board, an AI that can't close) — never a legitimate long, grindy win. In a
  // 288-game self-play sweep of the real decks the longest natural game was turn 49; 60
  // clears that with headroom, honoring the "inevitability / long grindy wins" archetype
  // (we must not flip the winner of a real turn-40 grind). MAX_TURNS (100) stays the
  // generous hard backstop above this.
  softCapTurn: 60,
  // Per-turn escalation step. On turn (softCapTurn + k) the active player loses
  // k * lifeLossStep life at turn start. The cumulative drain grows quadratically, so even
  // a 40-life commander seat is squeezed to a REAL lethal (life ≤ 0 SBA) well before
  // MAX_TURNS — the decisive ending is an honest death, never a fabricated call. 4 is brisk
  // but not a one-turn cliff (a stalled seat still gets a few escalating turns to try to win).
  lifeLossStep: 4,
});

/**
 * Resolve the caller's `timePressure` option into a concrete, validated config — or
 * null when the feature is OFF. Accepts:
 *   - falsy (null/false/undefined)  → null (OFF; default-off path, byte-identical)
 *   - true                          → the defaults above
 *   - an object                     → defaults with any provided overrides
 * Bad numeric overrides fall back to the default (never NaN/negative, which would
 * corrupt the clock). Pure.
 */
function resolveTimePressure(timePressure) {
  if (!timePressure) return null;
  if (timePressure === true) return { ...TIME_PRESSURE_DEFAULTS };
  const softCapTurn =
    Number.isInteger(timePressure.softCapTurn) && timePressure.softCapTurn > 0
      ? timePressure.softCapTurn
      : TIME_PRESSURE_DEFAULTS.softCapTurn;
  const lifeLossStep =
    Number.isFinite(timePressure.lifeLossStep) && timePressure.lifeLossStep > 0
      ? timePressure.lifeLossStep
      : TIME_PRESSURE_DEFAULTS.lifeLossStep;
  return { softCapTurn, lifeLossStep };
}

/**
 * Apply the time-pressure "game clock" to the ACTIVE player at the start of a turn.
 * On turn (softCapTurn + k) for k ≥ 1, the active player loses k * lifeLossStep life;
 * before the soft cap (k ≤ 0) it's a no-op (returns state unchanged → no churn). The
 * loss is logged as a `time-pressure` event so a self-play game's clock damage is
 * auditable (and distinguishable from real combat/spell life loss). PURE: returns a
 * new state, mutates nothing. Symmetric by construction — the SAME formula runs for
 * whichever seat is active, every turn.
 *
 * WHY A LIFE DRAIN AND NOT A FABRICATED WINNER: the loss routes through normal life,
 * so when a seat crosses 0 it dies via the SAME state-based-action path as any other
 * lethal (recordOutcomeIfChanged → life ≤ 0 → that seat loses). The decisive ending is
 * a REAL loss, never a "leader wins at the cap" call. The clock simply pulls the real
 * lethal forward so a stall resolves honestly instead of timing out. A game that still
 * reaches MAX_TURNS is reported as an honest `timeout` (down-weighted), NOT a fake W/L.
 */
function applyTimePressure(state, cfg) {
  if (!cfg) return state;
  const k = state.turn - cfg.softCapTurn;
  if (k <= 0) return state;
  const active = state.activePlayer;
  const player = state.players?.[active];
  if (!player) return state;
  const amount = k * cfg.lifeLossStep;
  const next = loseLife(state, { playerId: active, amount });
  return logEvent(next, { kind: "time-pressure", player: active, turn: state.turn, amount });
}

/**
 * A cheap fingerprint of "meaningful progress." If an actor takes a non-pass
 * action that leaves this unchanged, the action did nothing and the driver
 * would risk spinning — so we force a pass instead. Uses DISTINCT combat
 * permanent counts (not raw lengths) so a re-declare-style loop, which would
 * grow a raw length, is still caught as no-progress.
 *
 * The mid-resolution pending windows (free-cast / cascade / discover) are part
 * of the signature: RESOLVING one (e.g. a free-cast DECLINE, which may change
 * nothing else) IS progress — without these bits the latch would roll a decline
 * back to a force-pass on the pre-decline state, resurrecting the pending flag
 * forever (the livelock this guards against). A pending flag is one-way per
 * window (cleared by exactly one action, re-set only by a new spell that also
 * changes the stack), so it can never make a genuine no-op loop look live.
 */
function progressSignature(state) {
  const active = state.players[state.activePlayer];
  const handCount = active ? active.hand.length : 0;
  const poolTotal = active ? Object.values(active.manaPool).reduce((a, b) => a + b, 0) : 0;
  const bfCount = Object.values(state.players).reduce((sum, p) => sum + p.battlefield.length, 0);
  const distinctAttackers = new Set((state.combat?.attackers || []).map((a) => a.permanentId)).size;
  const distinctBlockers = new Set((state.combat?.blockers || []).map((b) => b.blockerId)).size;
  const pendings =
    (state.pendingFreeCast ? 1 : 0) +
    (state.pendingCascade ? 2 : 0) +
    (state.pendingDiscover ? 4 : 0);
  return [
    state.turn,
    state.phase,
    state.step,
    distinctAttackers,
    distinctBlockers,
    state.stack.length,
    handCount,
    poolTotal,
    bfCount,
    pendings,
  ].join("|");
}

/** Strip the transient P2.1 unresolved→Arbiter flag from a state (pure). */
function clearPendingArbiter(state) {
  if (!state.pendingArbiter) return state;
  const { pendingArbiter: _gone, ...rest } = state;
  return rest;
}

/**
 * Apply a cached Arbiter VERDICT to resolve a gated card in the RUNNER — the Arbiter-in-runner seam
 * (docs/orchestration/ARBITER-IN-RUNNER-SPEC.md). The verdict is a fixed, pre-resolved ruling
 * ({ atoms:[…], source }) from arbiterVerdictStore; the LLM ran OFF-loop into the cache, so this is PURE and
 * DETERMINISTIC (no network here). CREED-SAFE and ALL-OR-NOTHING: apply verdict.atoms via resolveAtom with a
 * minimal ctx (controller + sourceId from the pendingArbiter, NON-targeted), and return NULL — the caller keeps
 * today's honest no-op — unless EVERY atom resolves cleanly. A malformed / targeted / optional / choice-pausing /
 * no-resolver atom REJECTS the whole verdict (never a partial or fabricated effect). On success: clear
 * pendingArbiter + log `arbiter-resolved`. Returns null (reject) or the resolved state.
 */
export function applyArbiterVerdict(state, verdict, pa) {
  const atoms = Array.isArray(verdict?.atoms) ? verdict.atoms : null;
  if (!atoms || atoms.length === 0) return null;
  const controller = pa?.controller ?? null;
  if (!controller) return null; // no controller → can't scope the effect → honest no-op
  const sourceId = pa?.stackObjectId ?? null;
  const cardName = pa?.cardName ?? null;
  let next = state;
  for (const atom of atoms) {
    if (!atom || typeof atom.op !== "string") return null; // malformed atom → reject the whole verdict
    if (atom.optional || atom.targetType) return null; // would pause / needs a chosen target → SAFE FN (reject)
    const ctx = { controller, targets: [], cardName, xValue: null, sourceId };
    const after = resolveAtom(next, atom, ctx);
    if (after == null) return null; // no resolver for this op → reject (never fabricate)
    if (after.pendingChoice) return null; // an atom paused mid-apply → reject (verdict must resolve cleanly)
    next = after;
  }
  next = clearPendingArbiter(next);
  return logEvent(next, {
    kind: "arbiter-resolved",
    cardName,
    source: verdict.source || "arbiter",
    atomCount: atoms.length,
  });
}

/**
 * Settle a tutor's pending choice (apply the fetch + shuffle + resume the suspended
 * program). When the program FULLY completes — not re-paused on a second tutor — run the
 * stack-resolution finalization the spell missed while paused: flush any triggers the
 * resumed post-tutor atoms enqueued (CR 603.3), so they don't sit unflushed past the next
 * priority window. A re-paused program (a second tutor) finalizes when ITS choice settles.
 */
function settleTutorChoice(state, cardId) {
  const next = resolveTutorChoice(state, cardId);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

/**
 * Settle a clone copy-choice: the clone enters (as the chosen copy, or as itself), then
 * finalizeStackResolution flushes the ETB triggers the entry enqueued (CR 603.3) and resets
 * priority — the same finalize the normal stack-resolution path runs, so a copied creature's
 * "when this enters" trigger doesn't sit unflushed past the next priority window.
 */
function settleCloneChoice(state, chosenPermId) {
  return finalizeStackResolution(resolveCloneChoice(state, chosenPermId));
}

/**
 * Settle a scry/surveil choice: apply the keep/move reorder, resume the suspended program (the
 * "draw a card" after "Scry 1, then draw"), then finalizeStackResolution flushes any triggers a
 * resumed atom enqueued — the same finalize the tutor path runs. A re-pause (a second scry) returns
 * as-is for the driver to surface. `keepIds` is the ordered list of top-card ids to keep on top.
 */
function settleScryChoice(state, keepIds) {
  const next = resolveScryChoice(state, keepIds);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

// ===== DIVIDE ===== (MT-1) — settle a divide-damage division then finalize the stack (flush any
// dies-triggers from the damage, continue resolution). Mirrors settleScryChoice.
function settleDivideChoice(state, distribution) {
  const next = resolveDivideChoice(state, distribution);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

// ===== DISTRIBUTE ===== settle a distribute-counters division then finalize the stack. Mirrors settleDivideChoice.
function settleDistributeChoice(state, distribution) {
  const next = resolveDistributeChoice(state, distribution);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

// ===== SOFT-CNT ===== — settle a soft counter's pay-or-be-countered decision (Force Spike / Mana Leak /
// Spell Pierce): the targeted spell's controller pays {N} (spell survives) or it's countered, then the
// caster's program resumes. finalizeStackResolution then continues the stack (the now-uncountered spell
// resolves on its own when reached, or the counter's own program finishes). Mirrors settleDivideChoice.
function settleSoftCounterChoice(state, pay) {
  const next = resolveSoftCounterChoice(state, pay);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

// ===== OPTIONAL-MANA-PAYMENT ===== (CR 603.7c) — settle a "you may pay {cost}. If you do, <effect>" pay-or-
// decline decision: the controller pays the cost (payoff runs) or declines/can't afford (nothing runs), then
// the program resumes — which may itself set ANOTHER choice (a scry payoff), so guard pendingChoice before
// flushing. finalizeStackResolution then flushes any triggers the payoff enqueued (CR 603.3). Mirrors
// settleSoftCounterChoice / settleOptionalChoice.
function settleOptionalManaPaymentChoice(state, pay) {
  const next = resolveOptionalManaPaymentChoice(state, pay);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

// OPTIONAL-LIFE-PAYMENT (LANDS-TIER slice 2; CR 614.1c + 119.4) — settle the shockland pay-or-tap:
// resolveOptionalLifePaymentChoice charges the life through loseLife (only when the player has it — never
// fabricated) or taps the land. Raised by a land PLAY on the play-land path (a special action, CR 116.2a),
// so no stack resolution is in flight and there is nothing to finalize — the choice clears and the driver
// re-derives. Deliberately NOT the settleOptionalManaPaymentChoice shape.
function settleOptionalLifePaymentChoice(state, pay) {
  return resolveOptionalLifePaymentChoice(state, pay);
}

// SYLVAN LIBRARY (SG-15b; CR 603.7c + 121.4) — settle ONE drawn card's pay-or-put-back. The settler chains
// the next card under the same continuation, and after the last one resumes the program — which may itself
// set ANOTHER choice, so guard pendingChoice before flushing — then finalizeStackResolution flushes what the
// resumed program enqueued (CR 603.3). Mirrors settleOptionalSacChoice.
// TEMPTING OFFER (Tempt with Discovery) — settle the asked opponent's answer (accept → their own land search is
// suspended; decline → the offer moves on). The settler returns the next pause, which the driver loop drains.
function settleTemptingOfferChoice(state, accept) {
  return resolveTemptingOfferChoice(state, accept === true);
}

function settleSylvanLibraryChoice(state, pay) {
  const next = resolveSylvanLibraryChoice(state, pay);
  if (next.pendingChoice) return next;
  return finalizeStackResolution(next);
}

// REFLEXIVE-SAC-BY-SUBTYPE (CR 603.7c) — settle the "you may sacrifice a <subtype>. If you do, <effect>" sac-or-
// decline: resolveOptionalSacChoice pitches one matching permanent + runs the payoff (or skips it if declined /
// none available — sacrificeCreatureEffect never fabricates a sac), then resumes — which may itself set ANOTHER
// choice, so guard pendingChoice before flushing — then finalizeStackResolution flushes any triggers the sac /
// payoff enqueued (CR 603.3). Mirrors settleOptionalManaPaymentChoice.
function settleOptionalSacChoice(state, doSac) {
  const next = resolveOptionalSacChoice(state, doSac);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

// OPTIONAL DRAW-THEN-DISCARD — settle "you may draw a card. If you do, discard a card." On draw, the [draw,
// discard] runs (the discard's which-card pause may still be pending, so guard before flushing). Mirrors settleOptionalSacChoice.
function settleOptionalDrawDiscardChoice(state, doDraw) {
  const next = resolveOptionalDrawDiscardChoice(state, doDraw);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

// OPTIONAL-DISCARD-PAYMENT — settle "you may discard a card. If you do, <effect>." On pay, the [discard, ...payoff]
// runs (the cost-discard's which-card pause may still be pending, so guard before flushing). Mirrors settleOptionalSacChoice.
function settleOptionalDiscardChoice(state, doDiscard) {
  const next = resolveOptionalDiscardPaymentChoice(state, doDiscard);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

// OPTIONAL-EXILE-SELF (Undead Butler) — settle "you may exile it. When you do, <payoff>." On pay the exile
// happens + the payoff runs (a payoff pause may still be pending, so guard before flushing). Same shape.
function settleOptionalExileSelfChoice(state, doExile) {
  const next = resolveOptionalExileSelfChoice(state, doExile);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

// MILLED-PICK (Ripples / Six) — settle "put a [land ]card from among those cards into your hand": the
// chosen (or auto-picked) card moves graveyard → hand, then the program resumes. Same flush shape.
function settleMilledPickChoice(state, cardId) {
  const next = resolveMilledPickChoice(state, cardId);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

// UPKEEP-SAC-UNLESS-PAY — settle "sacrifice this <noun> unless you pay {cost}." Pay+afford keeps it; else the source
// sacrifices itself. Neither branch pauses (payManaCost/sacrificeCreatureEffect resolve in one call), so flush.
function settleSacUnlessPayChoice(state, pay) {
  const next = resolveSacUnlessPayChoice(state, pay);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

// OPPONENT-PAYS-TO-DENY (taxed-payment) — settle "you may draw a card unless that player pays {N}." Payer pays+affords
// → beneficiary draws nothing; else beneficiary draws. Neither branch pauses further, so flush the stack.
function settleTaxedPaymentChoice(state, pay) {
  const next = resolveTaxedPaymentChoice(state, pay);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

// ITERATED-EDICT (Torment of Hailfire) — settle ONE opponent's edict mode ({ mode, permId?, cardId? }): apply the
// lose-3 / sac-nonland / discard, then advance the chain. The chain RE-PAUSES for the next opponent/round (guard
// pendingChoice before flushing); when the whole X × opponents queue empties, resumeAfterChoice finishes the spell.
function settleEdictModeChoice(state, choice) {
  const next = resolveEdictModeChoice(state, choice);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

/**
 * Settle an optional "you may <effect>" choice (α2): run-or-skip the paused atom and resume — which
 * may itself set ANOTHER choice ("you may scry 2"), so guard pendingChoice before flushing — then
 * finalizeStackResolution flushes any triggers the resumed atoms enqueued (CR 603.3).
 */
function settleOptionalChoice(state, doIt) {
  const next = resolveOptionalChoice(state, doIt);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

/**
 * CMD-RETURN state-based action (CR 903.9a) — a commander sitting in a graveyard or exile MAY be put into
 * the command zone by its owner. Run after the loss/elimination SBA, before the next priority window. An
 * AI owner AUTO-RETURNS its commander (so it can recast — the correct default for the opponent); the HUMAN
 * owner gets a pending yes/no (903.9 is the owner's choice — NEVER auto for the human). One commander at a
 * time (the setter is FIFO-guarded). A DECLINED commander is marked `_returnHandled` so this SBA won't
 * re-offer it every check (903.9a fires only for a commander put there SINCE the last SBA check). No
 * commander → returns the state unchanged (Standard, with no command zone, is a no-op).
 */
export function returnCommandersToZone(state) {
  for (const pid of Object.keys(state.players || {})) {
    for (const zone of ["graveyard", "exile"]) {
      const card = (state.players[pid]?.[zone] || []).find(
        (c) => c?.isCommander && !c._returnHandled,
      );
      if (!card) continue;
      if (pid === "user") {
        // Human owner → offer the choice (the loop applies the pause / Expert-auto split).
        return setPendingCommanderReturnChoice(state, {
          controller: pid,
          zone,
          cardId: card.id,
          cardName: card.name,
        });
      }
      // AI owner → auto-return so it can recast. The card keeps isCommander; commanderCastCount (the tax,
      // CR 903.8) lives on the player and is untouched, so it persists across the return.
      return moveCardToZone(state, {
        playerId: pid,
        fromZone: zone,
        toZone: "command",
        cardId: card.id,
      });
    }
  }
  return state;
}

/**
 * Settle a commander-return yes/no (CR 903.9). `doReturn` true → move the commander from its dead zone to
 * the command zone (it keeps its owner's commanderCastCount, so the {2} tax persists — 903.8 counts casts,
 * not deaths). false → it stays put, marked `_returnHandled` so the SBA won't keep re-offering it.
 */
export function settleCommanderReturnChoice(state, doReturn) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "commander-return") return state;
  const cleared = clearPendingChoice(state);
  if (doReturn) {
    return moveCardToZone(cleared, {
      playerId: pc.controller,
      fromZone: pc.zone,
      toZone: "command",
      cardId: pc.cardId,
    });
  }
  return {
    ...cleared,
    players: {
      ...cleared.players,
      [pc.controller]: {
        ...cleared.players[pc.controller],
        [pc.zone]: (cleared.players[pc.controller]?.[pc.zone] || []).map((c) =>
          c.id === pc.cardId ? { ...c, _returnHandled: true } : c,
        ),
      },
    },
  };
}

/**
 * Settle a hand-discard choice (δ-1b): move the chosen card from the victim's hand → graveyard, resume
 * the caster's suspended program (Thoughtseize's "lose 2 life", Harsh Scrutiny's "Scry 1" — which may
 * itself re-pause on the scry, so guard pendingChoice before flushing), then finalizeStackResolution
 * flushes any triggers a resumed atom enqueued — the same finalize the tutor path runs.
 */
function settleHandDiscardChoice(state, cardId) {
  const next = resolveHandDiscardChoice(state, cardId);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

/**
 * IMPRINT (CR 207.2c) — settle an imprint pick: exile the chosen card and stamp it onto the imprinting
 * permanent (resolveImprintChoice), then flush anything the resumed program woke, exactly like its siblings.
 * A null `cardId` is a LEGAL DECLINE ("you may"), not a stale pick — the permanent simply stays
 * un-imprinted, which is a real and common board state, not an error.
 */
function settleImprintChoice(state, cardId) {
  const next = resolveImprintChoice(state, cardId);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

/**
 * Settle one CR 514.1 cleanup-discard pick (CR-remediation B3): gameEngine.settleCleanupDiscardChoice
 * discards the chosen card and either re-raises (still over the max) or runs the deferred 514.2 cleanup
 * tail. When the chain completes, finalizeStackResolution drains/flushes anything the discard(s) woke
 * (graveyard-event watchers like Bloodchief Ascension see the discarded card at cleanup, per CR 514.3a).
 */
function settleCleanupDiscardStep(state, cardId) {
  const next = settleCleanupDiscardChoice(state, cardId);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

/**
 * Settle an impulse-dig choice (δ-2): keep the chosen card (→ hand), dispose the rest (bottom/graveyard),
 * resume the suspended program (a "then draw" rider — may re-pause, so guard pendingChoice before
 * flushing), then finalizeStackResolution flushes any triggers a resumed atom enqueued.
 */
function settleImpulseDigChoice(state, cardId) {
  const next = resolveImpulseDigChoice(state, cardId);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

/**
 * TOP-CARD TAKE-OR-LEAVE-ON-TOP (BLITZ LK-2) — settle a look-top-take choice: TAKE the matched top card
 * (→ hand) when `cardId` is its id, else LEAVE it on top (cardId null / stale mismatch → no zone change),
 * then resume the suspended program (an activated ability / trigger has no rider past this, but the seam is
 * uniform — a resumed atom could re-pause, so guard pendingChoice before flushing), then
 * finalizeStackResolution flushes any triggers a resumed atom enqueued.
 */
function settleLookTopTakeChoice(state, cardId) {
  const next = resolveLookTopTakeChoice(state, cardId);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

/**
 * Settle a dig-land-to-battlefield choice (Silverback Elder mode 2): put the chosen land onto the battlefield
 * (firing its ETB/landfall), bottom the rest in a random order, resume the suspended program (no rider on
 * Silverback, but the seam is uniform — a resumed atom could re-pause, so guard pendingChoice before flushing),
 * then finalizeStackResolution flushes any triggers the land's entry enqueued.
 */
function settleDigLandChoice(state, cardId) {
  const next = resolveDigLandChoice(state, cardId);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

/**
 * ===== EDICTS ===== — settle a sacrifice choice (Diabolic Edict / Cruel Edict / Geth's Verdict): the
 * sacrificing player gives up the chosen creature (dies triggers fire), then the caster's riders resume
 * (Geth's Verdict "You lose 1 life" — which may itself re-pause, so guard pendingChoice before flushing).
 * finalizeStackResolution then flushes any triggers the sacrifice + resumed atoms enqueued (CR 603.3) —
 * the same finalize the tutor/hand-discard paths run. `permId` is the chosen creature's permanent id.
 */
function settleSacrificeChoice(state, permId) {
  const next = resolveSacrificeChoice(state, permId);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

/**
 * ===== EACH-PLAYER ===== discard (EP-2) — settle one pick in a discard chain (Mind Rot / Fugue / Delirium
 * Skeins): the discarder pitches the chosen card, then the chain either re-pauses (more cards / the next
 * discarder owes a choice — guard pendingChoice before flushing) or resumes the caster's program (Fill
 * with Fright's "Scry 2", which may itself re-pause). finalizeStackResolution then flushes any triggers a
 * resumed atom enqueued (CR 603.3) — the same finalize the other choice paths run.
 */
function settleDiscardChoice(state, cardId) {
  const next = resolveDiscardChoice(state, cardId);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

/** HAND→LIBRARY-TOP (the Brainstorm put-back) — same settle shape as the discard chain. */
function settleHandToLibraryTopChoice(state, cardId) {
  const next = resolveHandToLibraryTopChoice(state, cardId);
  return next.pendingChoice ? next : finalizeStackResolution(next);
}

// ─── Pluggable decision-maker (Learn-to-Play item #3 — the pilot seam) ──────────
//
// THE KEYSTONE: the self-play loop enumerates a set of `legalActions` at every real
// choice (the priority window — main plays, declare-attackers, declare-blockers,
// X-cost, modal; and the resolution-time DISCOVER choice), then asks a `decide`
// callback to pick ONE of them:
//
//     decide({ state, legalActions, seat, pilot, features }) -> action   (∈ legalActions)
//
// (`features` — the ENGINE-computed featurizeState object, the same one the recorder row
// carries; added 2026-07-10 for the eval-net integration. Older pilots ignore the key.)
// This is the ONE place an external "pilot" module (Omnath's omnath-tools/pilots/
// decide.mjs, NOT in this repo) plugs in. The caller injects it via runSelfPlayGame's
// `decide` option (the documented adapter point); the loop never imports it.
//
// CREED — DEFAULT IS BYTE-IDENTICAL: when no `decide` is supplied, the loop runs the
// EXACT pre-refactor code path (makeDecision → its picked action), so play is byte-for-
// byte unchanged for the Academy, human play, and every existing test. `decide` only
// alters which action is chosen AT an auto-decided window — the engine still advances
// ITSELF (untap/upkeep/draw/stack) and still surfaces a human "ask" exactly as before.
//
// SAFETY: a `decide` return that is NOT in the offered set is rejected and we fall back
// to the default pick (`fallbackAction`) — a learned/garbage pilot can never inject an
// illegal or fabricated move, and never crash the loop.

/** The DEFAULT decider: today's exact pick. `makeDecision` already resolved the action
 *  for this seat (via opponentAI.pickAction for an AI/Expert seat); defaultDecide simply
 *  returns it, so routing through the decide seam with no pilot is a pure pass-through. */
export function defaultDecide({ fallbackAction = null } = {}) {
  return fallbackAction;
}

/**
 * Set-membership validation for a pilot's returned action against the OFFERED set
 * (the exact `legalActions` array handed to `decide` this window — not a recomputed
 * set, so it matches precisely what the pilot saw). Uses the same canonical-key deep
 * compare gameApi.isLegalAction uses (shared via actionKey.js — importing gameApi here
 * would be a cycle). Returns true iff `action` is structurally identical to one offered action.
 */
function actionInOfferedSet(action, offered) {
  if (!action || typeof action !== "object") return false;
  const target = _stableActionKey(action);
  for (const cand of offered) {
    if (_stableActionKey(cand) === target) return true;
  }
  return false;
}

/**
 * Resolve which action to apply at an auto-decided window, honoring the pluggable
 * `decide`. The pre-refactor default (`decide` null) returns `fallbackAction` UNTOUCHED
 * — the exact action makeDecision/pickAction chose — so play is byte-identical. When a
 * `decide` IS supplied, it picks among `offered`; an out-of-set / throwing return falls
 * back to `fallbackAction` (never a fabricated or illegal move, never a crash).
 *
 * Also records a full-trajectory row when `recordDecision` is supplied: one
 * { turn, seat, pilot, features, action } per decide call (the policy-training
 * substrate). Recording is opt-in and pure (featurizeState reads, mutates nothing);
 * default (no recorder) adds zero overhead.
 */
function resolveDecideAction({
  decide,
  state,
  offered,
  seat,
  pilot,
  fallbackAction,
  recordDecision,
}) {
  let chosen = fallbackAction;
  // ENGINE-COMPUTED FEATURES to the pilot (Omnath's eval-net seam ask, 2026-07-10): the SAME
  // featurizeState object the recorder row carries is passed INTO decide — a persona consuming
  // engine-computed features instead of re-deriving them from raw state can't drift from the
  // training substrate (the digest-saga lesson). Computed ONCE per decision and shared with the
  // recorder below (pure read); older pilots ignore the extra key (the additive-options pattern).
  const features =
    typeof decide === "function" || typeof recordDecision === "function"
      ? featurizeState(state, seat)
      : null;
  // PREVIEW-FEATURES (O1 seam, Omnath's eval-net lookahead ask 2026-07-11): a LAZY closure the pilot
  // may call per candidate action — the engine-computed feature vector of the state AFTER applying
  // that action (dispatchAction is pure; nothing here mutates the live state). HONEST SEMANTICS: this
  // is a ONE-DISPATCH preview. A cast lands ON THE STACK un-resolved (the preview sees stack depth,
  // not the spell's outcome); pass-priority MAY resolve the top object (that IS its real effect);
  // combat declarations preview the declaration, not the damage. Any dispatch failure returns null —
  // the caller treats null as a 0-nudge (fail-closed, per the ask). KNOWN-NULL CLASS: `pending-choice`
  // candidates (tutor picks, discard picks, …) are settled by their per-kind settlers, not
  // dispatchAction — previewing one always returns null; the cast/attack/block/activate/pass classes
  // (the decisions the eval net actually nudges) preview cleanly. Cost is caller-controlled: nothing
  // is computed unless invoked.
  const previewFeatures =
    typeof decide === "function"
      ? (action) => {
          try {
            return featurizeState(dispatchAction(state, action), seat);
          } catch {
            return null;
          }
        }
      : null;
  if (typeof decide === "function") {
    let candidate;
    try {
      candidate = decide({ state, legalActions: offered, seat, pilot, features, previewFeatures });
    } catch (err) {
      // A throwing pilot must never abort a real game — fall back to the default pick.
      if (typeof console !== "undefined" && console.warn) {
        console.warn(`[learn] decide() threw (using default pick): ${err?.message || err}`);
      }
      candidate = undefined;
    }
    // Validate against the OFFERED set (not a recomputed set) — exactly what the pilot saw.
    chosen = actionInOfferedSet(candidate, offered) ? candidate : fallbackAction;
  }
  if (typeof recordDecision === "function" && chosen) {
    try {
      // ROWS v2 (EPOCH-2 instrumentation, schemaVersion 3): what was REJECTED matters for
      // policy learning — record the offered set's size + kind histogram, the chosen action's
      // rank in the engine's own ordering, the stack depth, and whether the choice was forced.
      const legalKinds = {};
      for (const a of offered) if (a?.kind) legalKinds[a.kind] = (legalKinds[a.kind] || 0) + 1;
      // M5.1 (featuresV=3 — the nearTie/top-k unpark, Omnath handoff): pickCastAction's ranking
      // rides the tick-scoped side-channel (see opponentAI.takeLastCastRanking). Attached ONLY
      // when the recorded choice IS a cast the ranking covers (kind + cardId guarded), so a
      // pendingChoice window / a pilot's non-cast override never wears a stale ranking. Scores
      // are the chooser's raw ascending scores: scoreGap = runnerUp − best (small gap = near-tie;
      // the threshold is the consumer's call). Non-cast decisions stay null — the honest
      // scored-class scope (combat plans/pending windows have no uniform score).
      const castRanking = takeLastCastRanking();
      const castMatch =
        castRanking &&
        chosen?.kind === "cast-spell" &&
        castRanking.some((r) => r.cardId === chosen.cardId);
      recordDecision({
        turn: state.turn,
        seat,
        pilot: pilot
          ? { playbook: pilot.playbook ?? null, temperament: pilot.temperament ?? null }
          : null,
        features, // the SAME object decide() received — pilot view and training row can't diverge

        action: serializeAction(chosen),
        legal: { n: offered.length, kinds: legalKinds },
        rank: Math.max(0, offered.indexOf(chosen)),
        stackDepth: state.stack?.length ?? 0,
        forced: offered.length === 1,
        castScores: castMatch
          ? castRanking
              .slice(0, 3)
              .map((r) => ({ cardId: r.cardId, name: r.name, score: +Number(r.score).toFixed(3) }))
          : null,
        scoreGap:
          castMatch && castRanking.length > 1
            ? +(castRanking[1].score - castRanking[0].score).toFixed(3)
            : null,
      });
    } catch (err) {
      // Recording is observational — a faulty recorder can never corrupt or abort a game.
      if (typeof console !== "undefined" && console.warn) {
        console.warn(`[learn] recordDecision threw (ignored): ${err?.message || err}`);
      }
    }
  }
  return chosen;
}

/**
 * A STABLE, JSON-serializable descriptor of a chosen action for the trajectory. Actions
 * are already small plain objects (kind + scalar payload, occasional small arrays/nested
 * plain objects — no functions, no cycles), so a structured clone via canonical JSON is
 * exact and append-safe. We never store an engine handle, so a recorded row can't feed
 * back into or mutate the engine. Pure.
 */
export function serializeAction(action) {
  if (!action || typeof action !== "object") return action ?? null;
  return JSON.parse(_stableActionKey(action));
}

// ─── Pluggable DECIDE for resolution-time pendingChoices (YES/NO-UNIFY) ──────────
//
// The enumerated-action seam above (resolveDecideAction) routes a PRIORITY-WINDOW pick
// through the pluggable `decide`. The interactive `state.pendingChoice` (a tutor search,
// a clone copy-pick, an edict sacrifice, a hand-discard, an impulse-dig, an each-player
// discard, an optional "you may", a commander-return, a soft-counter pay) is a SEPARATE
// seam that, for an AI/Expert seat, auto-resolves via autoPick* with no pilot input. This
// unifies them: a pendingChoice's real legal candidates are normalized into a small
// `legalActions` set, handed to the SAME `decide` (so a pilot controls these choices too),
// and the picked candidate is applied via the EXISTING settler.
//
// CREED — DEFAULT BYTE-IDENTICAL: when no `decide` AND no `recordDecision` is supplied (the
// Academy / human / every existing test / default self-play), this returns the auto-pick
// `fallback` UNTOUCHED with zero extra allocation (the offered set is never built). The
// settler then runs on the exact auto-pick value — byte-for-byte the pre-slice path. A
// pilot only alters the choice when it opts in; an out-of-set / deferring / throwing return
// falls back to the auto-pick (resolveDecideAction's set-membership guard), so a learned or
// garbage pilot can never inject an illegal candidate or crash the resolution.
//
// The normalized action's `choiceKind` tags the choice; its payload field carries the chosen
// id/value (`candidateId` for a pick-one, `value` for a yes/no). `buildOffered()` is called
// LAZILY (only when a decide/recorder is present) to produce the real legal-candidate
// actions; `fallbackAction` is the normalized form of the auto-pick (so a no-/bad-pilot path
// resolves to the identical auto-pick value). Returns the chosen normalized action; the
// caller reads `picked.candidateId` / `picked.value` and feeds it to the settler.
function decidePendingChoice({
  decide,
  state,
  seat,
  pilot,
  recordDecision,
  buildOffered,
  fallbackAction,
}) {
  // Pure pass-through when neither a pilot nor a recorder is engaged — the byte-identical
  // default. Skipping buildOffered() here keeps the default path allocation-free.
  if (typeof decide !== "function" && typeof recordDecision !== "function") return fallbackAction;
  const offered = buildOffered();
  return resolveDecideAction({
    decide,
    state,
    offered,
    seat,
    pilot,
    fallbackAction,
    recordDecision,
  });
}

/** Normalized legal-candidate actions for a PICK-ONE pendingChoice (tutor / clone / hand-
 *  discard / impulse-dig / sacrifice / discard): one action per real candidate id, plus an
 *  optional find-nothing/decline action when the choice permits it (a stated-quality tutor —
 *  CR 701.23b — or a "you may" clone copy). The ids come straight from `pc.candidates`, so every offered
 *  action maps to a candidate the settler accepts; nothing is fabricated. */
function pendingPickActions(pc, { allowDecline = false } = {}) {
  const actions = (pc.candidates || []).map((c) => ({
    kind: "pending-choice",
    choiceKind: pc.kind,
    candidateId: c.id,
  }));
  if (allowDecline)
    actions.push({ kind: "pending-choice", choiceKind: pc.kind, candidateId: null });
  return actions;
}

/** Normalized legal actions for a YES/NO pendingChoice (optional-effect / commander-return /
 *  soft-counter): exactly the two legal answers. */
function pendingYesNoActions(pc) {
  return [
    { kind: "pending-choice", choiceKind: pc.kind, value: true },
    { kind: "pending-choice", choiceKind: pc.kind, value: false },
  ];
}

/** ITERATED-EDICT (Torment of Hailfire) — the legal MODE actions for one opponent's edict decision. "life"
 *  is always offered; "sacrifice" fans out to one action per nonland permanent (each carrying its permId);
 *  "discard" fans out to one action per hand card (each carrying its cardId). Every offered action maps to a
 *  legal mode + a real candidate the settler accepts (the ids come from pc.sac / pc.disc), so nothing is
 *  fabricated. A human picker can thus choose the exact permanent / card; the auto-pick uses autoPickEdictMode. */
function pendingEdictModeActions(pc) {
  const actions = [{ kind: "pending-choice", choiceKind: pc.kind, mode: "life" }];
  if ((pc.modes || []).includes("sacrifice")) {
    for (const c of pc.sac || [])
      actions.push({
        kind: "pending-choice",
        choiceKind: pc.kind,
        mode: "sacrifice",
        permId: c.id,
      });
  }
  if ((pc.modes || []).includes("discard")) {
    for (const c of pc.disc || [])
      actions.push({ kind: "pending-choice", choiceKind: pc.kind, mode: "discard", cardId: c.id });
  }
  return actions;
}

/**
 * The driver. Given an active session, advance the engine until the
 * user has a real decision (kind: "ask") OR the game ends. AI
 * decisions auto-apply; trivial user auto-passes also auto-apply.
 *
 * Returns { session, decision }:
 *   decision.kind === "ask"   → UI renders the prompt with options
 *   decision.kind === "game-over" → game ended; session.status reflects
 *
 * A safety cap (1000 ticks) protects against engine bugs that could
 * otherwise spin forever. Hitting the cap surfaces an "engine-stuck"
 * decision so the UI can show a meaningful error.
 *
 * OPT-IN OBSERVER (Learn-to-Play Track-1a): `onTurnStart` is a read-only callback
 * invoked `onTurnStart(state, turnNumber)` once each time the game enters a NEW
 * `state.turn` (the turn boundary — including the first turn), BEFORE that turn's
 * actions are applied. It exists solely to let the self-play trajectory recorder
 * snapshot per-turn features WITHOUT re-implementing the loop. It is `null` by
 * default, so when it is not supplied this function's behavior is BYTE-IDENTICAL to
 * before (no extra work, no state change). The observer is read-only by contract:
 * it never receives a mutable handle that feeds back into the engine, its return
 * value is ignored, and a throw from it is swallowed (logged via console.warn) so a
 * faulty observer can never corrupt or abort a real game.
 *
 * OPT-IN SELF-PLAY TIME PRESSURE (`timePressure`, default null ⇒ OFF): when supplied
 * (the offline self-play runner sets it), a symmetric, deterministic "game clock"
 * drains the active player's life each turn past a soft cap so stalling games reach
 * REAL lethal (a true SBA loss → W/L) instead of drifting to MAX_TURNS as a useless
 * 0.5-labeled draw. It does NOT fabricate a winner: a game that STILL reaches the hard
 * cap ends as a distinct, honest `timeout` (no W/L label, trainingWeight:0 downstream),
 * never a "leader wins at the cap" call. It is NOT a Magic rule (no CR); see the
 * TIME_PRESSURE_DEFAULTS block above. OFF by default ⇒ this function is byte-identical
 * to before for the Academy and every existing test (the loop still draws at the cap).
 *
 * PLUGGABLE DECIDE (`decide`, default null ⇒ the pre-refactor pick — Learn-to-Play item
 * #3, the pilot seam): at every auto-decided priority window (and the resolution-time
 * DISCOVER choice), the loop enumerates `legalActions` and calls
 *   decide({ state, legalActions, seat, pilot, features }) -> action   (∈ legalActions)
 * to pick ONE. NULL ⇒ the loop uses the action makeDecision/pickAction already chose, so
 * play is BYTE-IDENTICAL. An out-of-set / throwing return falls back to that default pick
 * (never an illegal/fabricated move, never a crash). `pilot` (default null) is opaque
 * identity passed straight to decide + recorded ({playbook, temperament}). The human
 * "ask" path is untouched — decide fires only where the engine would auto-decide.
 *
 * FULL-TRAJECTORY RECORDING (`recordDecision`, default null ⇒ off): when supplied, the
 * loop appends one row per decide call —
 *   { turn, seat, pilot:{playbook,temperament}, features: featurizeState(state, seat), action }
 * — the POLICY-training substrate (which action from which state). Append-only + pure
 * (featurizeState reads, mutates nothing); the action is a stable JSON descriptor with no
 * engine handle. Default (no recorder) ⇒ zero overhead, byte-identical.
 *
 * PLAY-POLICY A/B (`policy`, default null ⇒ today's heuristics, SD-5/PS-4): forwarded
 * verbatim into every makeDecision call, which hands it to opponentAI.pickAction /
 * pickAttackPlan / pickBlockPlan (the documented "v1" legacy-vs-current probe seam,
 * opponentAI.js normalizePolicy). It only ever RE-RANKS actions already offered by
 * legalChoices — never a legality gate (THE CREED). null ⇒ normalizePolicy(null) ⇒ the
 * current shipping behavior, byte-identical.
 */
export function advanceUntilDecision(
  session,
  {
    archetype = null,
    onTurnStart = null,
    timePressure = null,
    decide = null,
    pilot = null,
    recordDecision = null,
    policy = null,
    resolveArbiter = null,
    turnTickBudget = 2000,
  } = {},
) {
  // Resolve the opt-in clock once (null ⇒ OFF ⇒ no behavior change anywhere below).
  const timeCfg = resolveTimePressure(timePressure);
  if (session.status !== "active") {
    return {
      session,
      decision: { kind: "game-over", reason: session.status },
    };
  }

  // High cap = a true-infinite-loop backstop only. Normal termination is the
  // game ending or the turn limit; an Expert full-game runs to completion in a
  // single call (it never stops for a user decision), so the cap must clear a
  // long game. The anti-loop latch below + the per-turn budget are the primary guards.
  const SAFETY_CAP = 50000;
  // PER-TURN TICK BUDGET (grind server-hang root fix, 2026-07-14). The anti-loop latch
  // (progressSignature) only force-passes an action that changes NOTHING — a loop that
  // produces mana/tokens each pass (poolTotal/bfCount move) slips past it and grinds a
  // single turn to SAFETY_CAP: ~tens of seconds of blocked event loop + an O(n²)
  // decisionLog balloon that OOM'd the machine. No legit game exceeds 70 turns and no
  // legit TURN comes near this budget, so a turn that burns this many ticks without
  // advancing is definitionally a non-terminating loop → end it engine-stuck at once.
  // `turnTickBudget` (default 2000, injectable for tests) = 6× the busiest legit turn ever
  // measured (max 333 ticks over 80 real games; a whole legit GAME totals <2900 ticks across all
  // ~50 turns), so no real turn approaches it — but it bails a spin ~25× sooner than the 50000
  // backstop. A false trip costs one discarded game (engine-stuck already is); a miss costs a
  // minutes-long hang + an OOM, so the margin is deliberately asymmetric toward catching spins.
  let current = session;
  let ticks = 0;
  let turnForTicks = null; // the state.turn we're counting ticks within
  let ticksThisTurn = 0;
  let maxTurnTicks = 0; // observability: the busiest single turn (recorded on the result)

  // Turn-boundary state (opt-in observer + opt-in time-pressure clock). Starts at null
  // so the FIRST loop iteration fires for the opening turn, then once per subsequent
  // turn increment. Entirely inert when neither the observer nor time pressure is on.
  const observe = typeof onTurnStart === "function";
  // SD-2 — instrumented runs persist the turn-boundary stamp in session STATE
  // (state.observedTurn) so a re-entrant advance (act()/apply* re-entries within
  // the same turn — the SD-1 threaded path) never re-fires the clock/observer for
  // a turn already stamped: a per-call local would double-apply the time-pressure
  // drain on every act() (corrupted W/L labels) and duplicate onTurnStart rows.
  // Uninstrumented runs keep the per-call local and write NO state field — the
  // default path stays byte-identical. A pre-v5 save resumed mid-turn lacks the
  // stamp and fires the boundary once more for the in-flight turn — harmless
  // (resume passes no opts today; worst case one extra drain on an opted-in
  // resume). Save-schema: learnSaveSchema MIGRATIONS[4] (v4→v5, absent-by-default).
  const instrumented = Boolean(timeCfg) || observe;
  let lastTurnBoundary = null;

  while (ticks < SAFETY_CAP) {
    ticks += 1;

    // Per-turn tick budget — the primary spin guard (see TURN_TICK_BUDGET above). Reset the
    // counter whenever state.turn advances; a turn that never advances but keeps ticking is a
    // stall. Ending it here (not at SAFETY_CAP) bounds the event-loop block + decisionLog size.
    const curTurnForTicks = current.state?.turn ?? null;
    if (curTurnForTicks !== turnForTicks) {
      turnForTicks = curTurnForTicks;
      ticksThisTurn = 0;
    }
    ticksThisTurn += 1;
    if (ticksThisTurn > maxTurnTicks) maxTurnTicks = ticksThisTurn;
    if (ticksThisTurn > turnTickBudget) {
      return {
        session: current,
        decision: {
          kind: "engine-stuck",
          reason: `turn stall (${ticksThisTurn} ticks in a single turn — non-terminating loop)`,
          ticks,
          maxTurnTicks,
        },
      };
    }

    // Turn boundary — fires when state.turn first reaches a new value (turn-start,
    // before this turn's actions). Used for BOTH the opt-in observer snapshot AND the
    // opt-in time-pressure clock. `lastTurnBoundary` starts null so it triggers once
    // per turn, including the opening turn. Entirely inert when both are off.
    const boundaryStamp = instrumented ? (current.state?.observedTurn ?? null) : lastTurnBoundary;
    if (current.state && current.state.turn !== boundaryStamp) {
      lastTurnBoundary = current.state.turn;
      if (instrumented) {
        current = { ...current, state: { ...current.state, observedTurn: current.state.turn } };
      }

      // Opt-in time-pressure clock. Applied to the ACTIVE player at turn start so the
      // life loss is in effect for THIS turn and is immediately seen by the SBA check
      // below (a clock kill resolves on the same iteration). Pure + deterministic;
      // a no-op before the soft cap and entirely skipped when timeCfg is null.
      if (timeCfg) {
        current = { ...current, state: applyTimePressure(current.state, timeCfg) };
      }

      // Opt-in observer snapshot. Read-only + crash-isolated: a throw here is swallowed
      // so it can never abort a real game. Fires AFTER the clock so a recorded feature
      // row reflects the post-clock life total (the value the engine will actually act on).
      if (observe) {
        try {
          onTurnStart(current.state, current.state.turn);
        } catch (err) {
          if (typeof console !== "undefined" && console.warn) {
            console.warn(`[learn] onTurnStart observer threw (ignored): ${err?.message || err}`);
          }
        }
      }
    }

    // SBA check before every priority window. CR 704.3 (CR-remediation B2): first the comprehensive
    // PERMANENT-level fixpoint (lethal/0-toughness, 0-loyalty, legend rule, attachment legality,
    // counter annihilation — each firing its owed triggers), THEN the player-loss read below —
    // so an elimination caused by a chain-reaction SBA is seen at this same checkpoint, not a turn late.
    current = { ...current, state: checkAllStateBasedActions(current.state) };
    current = recordOutcomeIfChanged(current);
    if (current.status !== "active") {
      return {
        session: current,
        decision: { kind: "game-over", reason: current.status, ticks, maxTurnTicks },
      };
    }

    // CMD-RETURN (CR 903.9a): a commander in a dead zone is auto-returned (AI) or sets a pending yes/no
    // (human) before the next priority window. The pending-choice handler below surfaces the human's.
    current = { ...current, state: returnCommandersToZone(current.state) };

    // P2.1 — the unresolved→Arbiter seam. A resolver flagged a cast spell it
    // can't model (state.pendingArbiter). Surface it as a teaching moment for
    // the PLAYER'S OWN spells at beginner/intermediate; otherwise (Expert
    // autopilot, or an opponent's unmodeled spell) the `spell-unresolved` log
    // already recorded it honestly — clear the flag and keep playing rather than
    // flooding the modal or stalling the autopilot. The engine never calls the
    // network; the UI invokes the Ollama-only Arbiter on this decision.
    if (current.state.pendingArbiter) {
      const pa = current.state.pendingArbiter;
      const pause = pa.controller === "user" && current.difficulty !== "expert";
      if (pause) {
        return { session: current, decision: { kind: "unresolved", ...pa } };
      }
      // ARBITER-IN-RUNNER (default-off, docs/orchestration/ARBITER-IN-RUNNER-SPEC.md): if a `resolveArbiter`
      // hook is supplied (self-play with a warm verdict cache), try to RESOLVE the gated card deterministically
      // from cache instead of the honest no-op below. The hook is a SYNC in-memory lookup (no network in this
      // loop → the trajectory hash is preserved when frozen; byte-identical when the hook is absent). The applier
      // returns null unless every verdict atom resolves cleanly, so a cache miss / malformed verdict falls
      // through to today's no-op — never a fabricated effect (CREED).
      if (typeof resolveArbiter === "function") {
        const verdict = resolveArbiter(pa, current.state);
        const resolved = verdict ? applyArbiterVerdict(current.state, verdict, pa) : null;
        if (resolved) {
          current = {
            ...current,
            state: resolved, // pendingArbiter already cleared + `arbiter-resolved` logged by the applier
            decisionLog: [
              ...current.decisionLog,
              {
                ts: Date.now(),
                turn: current.state.turn,
                phase: current.state.phase,
                step: current.state.step,
                actor: pa.controller,
                action: { kind: "arbiter-resolved", name: pa.cardName },
                auto: true,
                reasoning: "resolved from Arbiter verdict cache",
              },
            ],
          };
          continue;
        }
      }
      // Expert autopilot, or an opponent's unmodeled spell: don't block, but
      // surface it in the action feed so the player is TOLD the simulator
      // couldn't model the spell (not just the engine record) — the honesty
      // mandate applies to the player, not only Phase-3 logs.
      const feedEntry = {
        ts: Date.now(),
        turn: current.state.turn,
        phase: current.state.phase,
        step: current.state.step,
        actor: pa.controller,
        action: { kind: "spell-unresolved", name: pa.cardName },
        auto: true,
        reasoning: "engine could not model this spell",
      };
      current = {
        ...current,
        state: clearPendingArbiter(current.state),
        decisionLog: [...current.decisionLog, feedEntry],
      };
      continue;
    }

    // DISCOVER (LCI) — a pending discover decision (cast the found card FREE, or put it in HAND) is
    // resolved at the ACTION layer by its CONTROLLER, who may NOT be the current priorityHolder (it's made
    // mid-resolution). Route it through the SAME decisionGate as a normal action: a human beginner/
    // intermediate gets the cast-free + to-hand options surfaced; the AI / Expert auto-decides (pickAction
    // casts a free body / a good-target spell, holds counters, else takes the card to hand). Resolved
    // before the normal priority loop so it never stalls.
    if (current.state.pendingDiscover) {
      const dc = current.state.pendingDiscover.controller;
      const dActions = legalActionsForPlayer(current.state, dc);
      const dDecision = makeDecision(current.state, dc, dActions, {
        difficulty: dc === "user" ? current.difficulty : "expert",
        archetype,
        policy,
      });
      if (dDecision.kind === "ask") {
        return { session: current, decision: dDecision };
      }
      // The pre-refactor default pick (byte-identical when no decide). The pluggable
      // decide may substitute another offered action; an out-of-set return falls back here.
      const dFallback =
        dDecision.action || dActions.find((a) => a.kind === "discover-to-hand") || dActions[0];
      const dAction = resolveDecideAction({
        decide,
        state: current.state,
        offered: dActions,
        seat: dc,
        pilot,
        fallbackAction: dFallback,
        recordDecision,
      });
      current = dAction
        ? { ...current, state: dispatchAction(current.state, dAction) }
        : { ...current, state: (({ pendingDiscover: _drop, ...rest }) => rest)(current.state) }; // defensive: never stall
      continue;
    }

    // Interactive resolution-time choice (a tutor's library search). The player's OWN
    // tutor at beginner/intermediate surfaces a card PICKER; Expert autopilot and an
    // opponent's tutor AUTO-PICK the best candidate with no panel (the same pause-or-
    // auto split as pendingArbiter). The picker resumes via /api/learn/choose.
    if (current.state.pendingChoice) {
      const pc = current.state.pendingChoice;
      const pause = pc.controller === "user" && current.difficulty !== "expert";
      // YES/NO-UNIFY — the seat that OWNS the resolution-time choice (CR: the controller of the
      // tutor / clone / edict-victim / discarder / etc.). It, not the priority holder, is who the
      // pilot routes through and whom the decision is recorded against. The decide router (per-seat
      // pilots) keys off this seat; a null/deferring/garbage pilot return falls back to the auto-pick.
      const choiceSeat = pc.controller;
      // Clone copy-choice (CR 707.9): the player's OWN clone surfaces a copy PICKER; Expert
      // autopilot + an opponent's clone auto-pick the best creature (no panel). A pilot may pick a
      // different legal copy target (or decline a "you may" copy); default = the auto-pick, byte-identical.
      if (pc.kind === "clone-search") {
        if (pause) {
          return { session: current, decision: { kind: "clone-search", ...pc } };
        }
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          // WI-2 (CR 707.9): a MANDATORY clone (optional === false) is never offered the illegal
          // null/decline action — pilots can only pick a real copy target.
          buildOffered: () =>
            pendingPickActions(pc, { allowDecline: pc.resume?.optional !== false }),
          fallbackAction: {
            kind: "pending-choice",
            choiceKind: pc.kind,
            candidateId: autoPickCloneCandidate(current.state, pc),
          },
        });
        current = { ...current, state: settleCloneChoice(current.state, picked.candidateId) };
        continue;
      }
      // Scry / surveil (CR 701.22 / 701.25): the player's OWN reorder surfaces a keep/move picker;
      // Expert autopilot + an opponent's scry KEEP ALL on top (a legal, deterministic default — a
      // board-aware "bin a land when flooded" heuristic is a future refinement).
      // YES/NO-UNIFY DEFERRED (FN-safe): the choice is an ORDERED keep-subset (2^N orderings of the
      // looked-at cards), not a pick-one — it doesn't normalize cleanly into a small legalActions set,
      // so it stays on the auto-pick. A future slice can offer the orderings explicitly.
      if (pc.kind === "scry-surveil") {
        if (pause) {
          return { session: current, decision: { kind: "scry-surveil", ...pc } };
        }
        current = {
          ...current,
          state: settleScryChoice(
            current.state,
            (pc.cards || []).map((c) => c.id),
          ),
        };
        continue;
      }
      // α2 — optional "you may <effect>": the player's OWN optional surfaces a yes/no; Expert
      // autopilot + an opponent AUTO-TAKE it (the modeled optional effects are all beneficial to the
      // controller — draw / token / gain life / etc.; a board-aware decline is a future refinement).
      if (pc.kind === "optional-effect") {
        if (pause) {
          return { session: current, decision: { kind: "optional-effect", ...pc } };
        }
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          buildOffered: () => pendingYesNoActions(pc),
          // QUARTET PHASE 1 slice 4: the autopilot fallback is board-aware behind the flag
          // (optionalAutoTakeValue — take iff taking scores ≥ declining); flag absent ⇒ true, the
          // legacy always-take, byte-identical. A real pilot/human decision is upstream and unaffected.
          fallbackAction: { kind: "pending-choice", choiceKind: pc.kind, value: optionalAutoTakeValue(current.state, pc) },
        });
        current = { ...current, state: settleOptionalChoice(current.state, picked.value) };
        continue;
      }
      // CMD-RETURN (CR 903.9) — a commander in a dead zone: the human's OWN commander surfaces a yes/no
      // (return to the command zone?); Expert autopilot AUTO-RETURNS (keeps it recastable — the right
      // default). An AI's commander never reaches here (returnCommandersToZone auto-returned it directly).
      if (pc.kind === "commander-return") {
        if (pause) {
          return { session: current, decision: { kind: "commander-return", ...pc } };
        }
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          buildOffered: () => pendingYesNoActions(pc),
          fallbackAction: { kind: "pending-choice", choiceKind: pc.kind, value: true },
        });
        current = { ...current, state: settleCommanderReturnChoice(current.state, picked.value) };
        continue;
      }
      // δ-1b — hand disruption (Duress / Thoughtseize / …): the spell already targeted ONE opponent at
      // cast; now the player's OWN disruption surfaces a picker of THAT opponent's revealed, filtered
      // hand (only that one hand — no 4P leak). Expert autopilot + an opponent's disruption auto-pick the
      // highest-mana-value card.
      if (pc.kind === "hand-discard") {
        if (pause) {
          return { session: current, decision: { kind: "hand-discard", ...pc } };
        }
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          buildOffered: () => pendingPickActions(pc),
          fallbackAction: {
            kind: "pending-choice",
            choiceKind: pc.kind,
            candidateId: autoPickHandDiscardCandidate(current.state, pc),
          },
        });
        current = { ...current, state: settleHandDiscardChoice(current.state, picked.candidateId) };
        continue;
      }
      // IMPRINT (CR 207.2c) — "you may exile a <filtered> card from your hand" as an ETB (Chrome Mox,
      // Semblance Anvil, Isochron Scepter). The controller picks from their OWN hand; the pick is EXILED and
      // STAMPED onto the imprinting permanent, and every imprint payoff reads that stamp.
      //
      // OPTIONAL by rule, so a null pick is a legal DECLINE rather than a re-surface — unlike hand-discard
      // directly above, which always strips one. AI/Expert seats auto-imprint their LOWEST-value legal card
      // (autoPickDiscardCandidate — imprint costs you the card, so shed the least), which is also why
      // declining is never auto-chosen: the payoff is strictly better than an unused card in hand.
      if (pc.kind === "imprint-exile") {
        if (pause) {
          return { session: current, decision: { kind: "imprint-exile", ...pc } };
        }
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          buildOffered: () => pendingPickActions(pc),
          fallbackAction: {
            kind: "pending-choice",
            choiceKind: pc.kind,
            candidateId: autoPickDiscardCandidate(current.state, pc),
          },
        });
        current = { ...current, state: settleImprintChoice(current.state, picked.candidateId) };
        continue;
      }
      // CR 514.1 (CR-remediation B3) — the cleanup-step hand-size discard: the ACTIVE player picks a card
      // to discard down to their maximum. Mandatory (no decline); the settler re-raises until the hand is
      // legal, then runs the deferred 514.2 cleanup tail. Human seats get the picker; AI/Expert seats
      // auto-discard their LOWEST-value card (autoPickDiscardCandidate — keep the best, shed the least).
      if (pc.kind === "cleanup-discard") {
        if (pause) {
          return { session: current, decision: { kind: "cleanup-discard", ...pc } };
        }
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          buildOffered: () => pendingPickActions(pc),
          fallbackAction: {
            kind: "pending-choice",
            choiceKind: pc.kind,
            candidateId: autoPickDiscardCandidate(current.state, pc),
          },
        });
        current = {
          ...current,
          state: settleCleanupDiscardStep(current.state, picked.candidateId),
        };
        continue;
      }
      // δ-2 — impulse-dig (Anticipate / Strategic Planning): the player's OWN dig surfaces a pick-one
      // picker (their revealed top N); Expert autopilot + an opponent auto-keep the best card (reuses the
      // tutor's highest-mana-value picker — both keep the most impactful library card from the candidates).
      if (pc.kind === "impulse-dig") {
        if (pause) {
          return { session: current, decision: { kind: "impulse-dig", ...pc } };
        }
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          buildOffered: () => pendingPickActions(pc),
          fallbackAction: {
            kind: "pending-choice",
            choiceKind: pc.kind,
            candidateId: autoPickTutorCandidate(current.state, pc),
          },
        });
        current = { ...current, state: settleImpulseDigChoice(current.state, picked.candidateId) };
        continue;
      }
      // TOP-CARD TAKE-OR-LEAVE-ON-TOP (BLITZ LK-2 — Dryad Greenseeker / Frost Augur / Herald's Horn): the top
      // card matched the quality, so the player's OWN library surfaces a TAKE-or-LEAVE (offer the take AND a
      // real decline — leaving the card ON TOP is a legitimate, non-dominated choice). Expert autopilot + an
      // opponent AUTO-TAKE (autoPickLookTopTake — always take: strict card advantage at zero cost).
      if (pc.kind === "look-top-take") {
        if (pause) {
          return { session: current, decision: { kind: "look-top-take", ...pc } };
        }
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          buildOffered: () => pendingPickActions(pc, { allowDecline: true }), // LEAVE (candidateId null) is legal here
          fallbackAction: {
            kind: "pending-choice",
            choiceKind: pc.kind,
            candidateId: autoPickLookTopTake(current.state, pc),
          },
        });
        current = { ...current, state: settleLookTopTakeChoice(current.state, picked.candidateId) };
        continue;
      }
      // DIG-LAND-TO-BATTLEFIELD (Silverback Elder mode 2): the player's OWN dig surfaces a pick-which-land
      // picker (the LAND cards among their revealed top N); Expert autopilot + an opponent auto-put the best
      // land (reuses the highest-mana-value picker — the most impactful available land goes onto the field).
      if (pc.kind === "dig-land-to-battlefield") {
        if (pause) {
          return { session: current, decision: { kind: "dig-land-to-battlefield", ...pc } };
        }
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          buildOffered: () => pendingPickActions(pc),
          fallbackAction: {
            kind: "pending-choice",
            choiceKind: pc.kind,
            candidateId: autoPickDigLandCandidate(current.state, pc),
          },
        });
        current = { ...current, state: settleDigLandChoice(current.state, picked.candidateId) };
        continue;
      }
      // ===== EDICTS ===== — sacrifice choice (Diabolic Edict / Cruel Edict / Geth's Verdict). pc.controller
      // is the SACRIFICING player (the edict's target), so `pause` already pauses the human and auto-resolves
      // an AI/opponent — the human picks which creature to give up; the AI sacs its least valuable.
      if (pc.kind === "sacrifice-choice") {
        if (pause) {
          return { session: current, decision: { kind: "sacrifice-choice", ...pc } };
        }
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          buildOffered: () => pendingPickActions(pc),
          fallbackAction: {
            kind: "pending-choice",
            choiceKind: pc.kind,
            candidateId: autoPickSacrificeCandidate(current.state, pc),
          },
        });
        current = { ...current, state: settleSacrificeChoice(current.state, picked.candidateId) };
        continue;
      }
      // ===== EACH-PLAYER ===== discard (Mind Rot / Fugue / Delirium Skeins). pc.controller is the
      // DISCARDING player (CR 701.8 — the victim chooses, not the caster), so `pause` already pauses the
      // human and auto-resolves an AI: the human picks which card to pitch; the AI discards its cheapest.
      // N>1 / "each player" re-set the next pick after this settles, so the loop sequences the whole chain.
      if (pc.kind === "discard") {
        if (pause) {
          return { session: current, decision: { kind: "discard", ...pc } };
        }
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          buildOffered: () => pendingPickActions(pc),
          fallbackAction: {
            kind: "pending-choice",
            choiceKind: pc.kind,
            candidateId: autoPickDiscardCandidate(current.state, pc),
          },
        });
        current = { ...current, state: settleDiscardChoice(current.state, picked.candidateId) };
        continue;
      }
      // ===== HAND→LIBRARY-TOP ===== (the Brainstorm put-back): the chooser owns the hand, so a human
      // seat gets the picker and an AI/Expert returns its HIGHEST-mana-value card (keeps the hand
      // castable now). Same chain settle shape as the discard branch above.
      if (pc.kind === "hand-to-library-top") {
        if (pause) {
          return { session: current, decision: { kind: "hand-to-library-top", ...pc } };
        }
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          buildOffered: () => pendingPickActions(pc),
          fallbackAction: {
            kind: "pending-choice",
            choiceKind: pc.kind,
            candidateId: autoPickHandToLibraryTopCandidate(current.state, pc),
          },
        });
        current = { ...current, state: settleHandToLibraryTopChoice(current.state, picked.candidateId) };
        continue;
      }
      // ===== DIVIDE ===== (MT-1) — divide-damage / distribute-counters. pc.controller is the CASTER (the
      // divider), so `pause` pauses a human caster (they assign via the picker) and auto-distributes for an
      // AI / Expert (greedy-kill split). Resolving applies the split + finalizes the stack.
      // YES/NO-UNIFY DEFERRED (FN-safe): the choice is a DISTRIBUTION of N damage/counters across the
      // targets (a multiset partition), not a pick-one — it doesn't normalize into a small legalActions
      // set, so it stays on the auto-pick. A future slice can enumerate candidate distributions.
      if (pc.kind === "divide-damage") {
        if (pause) {
          return { session: current, decision: { kind: "divide-damage", ...pc } };
        }
        current = {
          ...current,
          state: settleDivideChoice(current.state, autoPickDivideDistribution(current.state, pc)),
        };
        continue;
      }
      if (pc.kind === "distribute-counters") {
        if (pause) {
          return { session: current, decision: { kind: "distribute-counters", ...pc } };
        }
        current = {
          ...current,
          state: settleDistributeChoice(
            current.state,
            autoPickDistributeCounters(current.state, pc),
          ),
        };
        continue;
      }
      // ===== SOFT-CNT ===== — soft counter "unless its controller pays {N}" (Force Spike / Mana Leak /
      // Spell Pierce). pc.controller is the TARGETED SPELL'S controller (who decides), so `pause` pauses a
      // human whose spell is under threat (pay/decline) and auto-decides for an AI (pays if it can afford
      // {N}, else the spell is countered). The common case — a human counters an AI's spell — is the AI
      // auto-deciding here. Resolving pays-or-counters then finalizes the stack.
      if (pc.kind === "soft-counter") {
        if (pause) {
          // Enrich with affordability so the picker can disable "Pay" when the human can't cover {N}
          // (the engine still counters a pay-but-unaffordable submit — this is just honest UI).
          const affordable = autoPickSoftCounterPay(current.state, pc);
          return { session: current, decision: { kind: "soft-counter", ...pc, affordable } };
        }
        // Default = pay iff affordable (byte-identical). A pilot may decline an affordable pay (let the
        // spell be countered) or "pay" when broke — settleSoftCounterChoice never fabricates mana, so an
        // unaffordable pay still counters the spell (CR-honest), never an illegal free save.
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          buildOffered: () => pendingYesNoActions(pc),
          fallbackAction: {
            kind: "pending-choice",
            choiceKind: pc.kind,
            value: autoPickSoftCounterPay(current.state, pc),
          },
        });
        current = { ...current, state: settleSoftCounterChoice(current.state, picked.value) };
        continue;
      }
      // ===== OPTIONAL-MANA-PAYMENT ===== (CR 603.7c) — "you may pay {cost}. If you do, <effect>" (Lifecrafter's
      // Bestiary / Mind's Eye / Inheritance / …). pc.controller is the player whose trigger/ability it is (who
      // pays + decides), so `pause` pauses a human and auto-decides an AI (pay-if-able). Default = pay iff
      // affordable (the modeled payoffs — draw a card — are beneficial); a pilot may decline, and an
      // unaffordable "pay" runs no payoff (payManaCost never fabricates mana — CR 119). Resolving pays-or-skips
      // then finalizes the stack.
      if (pc.kind === "optional-mana-payment") {
        if (pause) {
          // Enrich with affordability so the picker can disable "Pay" when the human can't cover the cost.
          const affordable = autoPickOptionalManaPayment(current.state, pc);
          return {
            session: current,
            decision: { kind: "optional-mana-payment", ...pc, affordable },
          };
        }
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          buildOffered: () => pendingYesNoActions(pc),
          fallbackAction: {
            kind: "pending-choice",
            choiceKind: pc.kind,
            value: autoPickOptionalManaPayment(current.state, pc),
          },
        });
        current = {
          ...current,
          state: settleOptionalManaPaymentChoice(current.state, picked.value),
        };
        continue;
      }
      // ===== OPTIONAL-LIFE-PAYMENT ===== (LANDS-TIER slice 2; CR 614.1c + 119.4) — the shockland clause "As
      // this land enters, you may pay N life. If you don't, it enters tapped.", raised by the play-land path
      // (the land is ALREADY on the battlefield, untapped, when this is consulted). pc.controller played it
      // (pays + decides), so `pause` pauses a human and auto-decides an AI through the WRITTEN policy
      // (autoPickOptionalLifePayment — pay iff life >= 10, never a decline-only shortcut). `affordable` is
      // CR 119.4's floor (you may pay down to 0, never below) so the picker can disable "Pay". Resolving
      // charges the life or taps the land; a land play is a special action, so nothing is finalized.
      if (pc.kind === "optional-life-payment") {
        if (pause) {
          const affordable = (current.state.players?.[pc.controller]?.life ?? 0) >= pc.life;
          return { session: current, decision: { kind: "optional-life-payment", ...pc, affordable } };
        }
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          buildOffered: () => pendingYesNoActions(pc),
          fallbackAction: {
            kind: "pending-choice",
            choiceKind: pc.kind,
            value: autoPickOptionalLifePayment(current.state, pc.controller, pc.life),
          },
        });
        current = { ...current, state: settleOptionalLifePaymentChoice(current.state, picked.value) };
        continue;
      }
      // ===== TEMPTING OFFER ===== (Tempt with Discovery) — the asked OPPONENT's "you may search your library for a
      // land card". choiceSeat = pc.controller = the opponent asked; a human decides at the panel, the autopilot by
      // autoPickTemptingOffer (accept iff a land is there to find and it controls no more lands than the offerer).
      if (pc.kind === "tempting-offer") {
        if (pause) {
          return { session: current, decision: { kind: "tempting-offer", ...pc, resume: undefined } };
        }
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          buildOffered: () => pendingYesNoActions(pc),
          fallbackAction: {
            kind: "pending-choice",
            choiceKind: pc.kind,
            value: autoPickTemptingOffer(current.state, pc),
          },
        });
        current = { ...current, state: settleTemptingOfferChoice(current.state, picked.value) };
        continue;
      }
      // ===== SYLVAN LIBRARY ===== (SG-15b; CR 603.7c + 121.4) — one drawn card's "pay L life or put it back on
      // top". A human decides at the panel (with `affordable` — CR 119.4 lets you pay down to 0, never below);
      // the autopilot pays iff at least 8 life would remain (autoPickSylvanLibraryPayment). The settler chains
      // the next card, then resumes the program.
      if (pc.kind === "sylvan-library") {
        if (pause) {
          const affordable = (current.state.players?.[pc.controller]?.life ?? 0) >= (pc.life || 0);
          return { session: current, decision: { kind: "sylvan-library", ...pc, resume: undefined, affordable } };
        }
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          buildOffered: () => pendingYesNoActions(pc),
          fallbackAction: {
            kind: "pending-choice",
            choiceKind: pc.kind,
            value: autoPickSylvanLibraryPayment(current.state, pc.controller, pc.life),
          },
        });
        current = { ...current, state: settleSylvanLibraryChoice(current.state, picked.value) };
        continue;
      }
      // ===== REFLEXIVE-SAC-BY-SUBTYPE ===== (CR 603.7c) — "you may sacrifice a <subtype>. If you do, <effect>"
      // (The Goose Mother, Wedding Security). pc.controller owns the trigger/ability (sacs + decides), so `pause`
      // pauses a human and auto-decides an AI (sac-if-able — the modeled payoffs outvalue a fungible token).
      // `available` (computed at suspend time) tells the picker whether a matching permanent exists to give up;
      // resolving sacs-or-skips then finalizes the stack.
      if (pc.kind === "optional-sac-payment") {
        if (pause) {
          return { session: current, decision: { kind: "optional-sac-payment", ...pc } };
        }
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          buildOffered: () => pendingYesNoActions(pc),
          fallbackAction: {
            kind: "pending-choice",
            choiceKind: pc.kind,
            value: autoPickOptionalSac(current.state, pc),
          },
        });
        current = { ...current, state: settleOptionalSacChoice(current.state, picked.value) };
        continue;
      }
      if (pc.kind === "optional-draw-discard") {
        if (pause) {
          return { session: current, decision: { kind: "optional-draw-discard", ...pc } };
        }
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          buildOffered: () => pendingYesNoActions(pc),
          fallbackAction: {
            kind: "pending-choice",
            choiceKind: pc.kind,
            value: autoPickOptionalDrawDiscard(current.state, pc),
          },
        });
        current = {
          ...current,
          state: settleOptionalDrawDiscardChoice(current.state, picked.value),
        };
        continue;
      }
      if (pc.kind === "optional-discard-payment") {
        if (pause) {
          return { session: current, decision: { kind: "optional-discard-payment", ...pc } };
        }
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          buildOffered: () => pendingYesNoActions(pc),
          fallbackAction: {
            kind: "pending-choice",
            choiceKind: pc.kind,
            value: autoPickOptionalDiscard(current.state, pc),
          },
        });
        current = { ...current, state: settleOptionalDiscardChoice(current.state, picked.value) };
        continue;
      }
      // MILLED-PICK (Ripples / Six) — pick a card from the just-milled set. Auto-pick: the FIRST
      // candidate (deterministic — the same pick the settler's stale-submit fallback makes).
      if (pc.kind === "milled-pick") {
        if (pause) {
          return { session: current, decision: { kind: "milled-pick", ...pc } };
        }
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          // T7: a pause with an `owner` other than the chooser is an opponent's-choice pick (Tasigur) — the chooser GIVES.
          buildOffered: () => (pc.candidates || []).map((c) => ({ kind: "pending-choice", choiceKind: pc.kind, value: c.id, label: pc.owner && pc.owner !== pc.controller ? `Give ${c.name}` : `Take ${c.name}` })),
          fallbackAction: {
            kind: "pending-choice",
            choiceKind: pc.kind,
            value: pc.candidates?.[0]?.id ?? null,
          },
        });
        current = { ...current, state: settleMilledPickChoice(current.state, picked.value) };
        continue;
      }
      // OPTIONAL-EXILE-SELF (Undead Butler) — the dies self-exile payment. Auto-pick: pay iff available
      // (the payoff is upside — the legacy always-take posture every optional-payment auto-pick uses).
      if (pc.kind === "optional-exile-self-payment") {
        if (pause) {
          return { session: current, decision: { kind: "optional-exile-self-payment", ...pc } };
        }
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          buildOffered: () => pendingYesNoActions(pc),
          fallbackAction: {
            kind: "pending-choice",
            choiceKind: pc.kind,
            value: !!pc.available,
          },
        });
        current = { ...current, state: settleOptionalExileSelfChoice(current.state, picked.value) };
        continue;
      }
      if (pc.kind === "sac-unless-pay") {
        if (pause) {
          return { session: current, decision: { kind: "sac-unless-pay", ...pc } };
        }
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          buildOffered: () => pendingYesNoActions(pc),
          fallbackAction: {
            kind: "pending-choice",
            choiceKind: pc.kind,
            value: autoPickSacUnlessPay(current.state, pc),
          },
        });
        current = { ...current, state: settleSacUnlessPayChoice(current.state, picked.value) };
        continue;
      }
      if (pc.kind === "taxed-payment") {
        // The DECISION is the PAYER's (choiceSeat = pc.controller = the opponent who cast). pause routes to that seat.
        if (pause) {
          return { session: current, decision: { kind: "taxed-payment", ...pc } };
        }
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          buildOffered: () => pendingYesNoActions(pc),
          fallbackAction: {
            kind: "pending-choice",
            choiceKind: pc.kind,
            value: autoPickTaxedPayment(current.state, pc),
          },
        });
        current = { ...current, state: settleTaxedPaymentChoice(current.state, picked.value) };
        continue;
      }
      // ITERATED-EDICT (Torment of Hailfire) — one opponent's edict decision (lose 3 / sac a nonland permanent
      // / discard a card). pc.controller is the AFFECTED OPPONENT (the chooser, CR 118.9), so `pause` already
      // pauses a human opponent and auto-picks for an AI. A human picks the exact mode + permanent/card; the AI
      // auto-decides (autoPickEdictMode). The chain re-sets the next opponent/round after this settles, so the
      // loop sequences the whole X × opponents queue.
      if (pc.kind === "edict-mode") {
        if (pause) {
          return { session: current, decision: { kind: "edict-mode", ...pc } };
        }
        const picked = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          buildOffered: () => pendingEdictModeActions(pc),
          fallbackAction: {
            kind: "pending-choice",
            choiceKind: pc.kind,
            ...autoPickEdictMode(current.state, pc),
          },
        });
        current = { ...current, state: settleEdictModeChoice(current.state, picked) };
        continue;
      }
      // Tutor library search. A pilot may fetch a different legal candidate — or find nothing,
      // WHEN that is legal: a stated-quality search "isn't required to find" (CR 701.23b), but a
      // quantity-only search ("a card") "must find that many cards" when they're available
      // (CR 701.23d). Default = the auto-pick (highest-MV), byte-identical.
      //
      // AI-F10 (was the WI-5 KNOWN SOFT SPOT, now fixed): `allowDecline` keys on the
      // `pc.mayFailToFind` flag applyTutor stamps from the atom (true = quality-filtered /
      // "you may" tutor; false = mandatory unfiltered search). A FALSE flag drops the
      // find-nothing action from the offered set, so a pilot can no longer make the off-CR
      // decline; resolveTutorChoice additionally rejects a null pick on the wire when
      // candidates exist. `!== false` keeps old saves / legacy setters (flag null/undefined)
      // on today's decline-allowed behavior — non-breaking. An EMPTY candidates array is
      // still the honest no-find regardless of the flag (the true miss, CR 701.23d's "as many
      // as possible"). autoPickTutorCandidate never declines, so default self-play/Academy
      // behavior is byte-identical either way.
      if (pc.kind === "tutor-search") {
        // NO-FIND SOFT-LOCK (CR 701.23d) — fixed 2026-07-28, found by the playability sweep at scale:
        // 9 of 150 human-path games WEDGED here, every one on `tutor-search (no options/candidates)`.
        //
        // An EMPTY candidate list is not a choice. Searching and finding nothing is a legal, complete
        // outcome — you reveal, shuffle, and carry on. Pausing for a human here asks them to pick from
        // zero options, which no UI can answer and no player can escape: the game is simply over, with no
        // error raised anywhere. The comment on the decline flag below already called an empty array "the
        // honest no-find"; the auto path acted on that and the PAUSE path did not.
        //
        // Settled EXPLICITLY with a null pick rather than by falling through to the auto path, because
        // that path's offered-action list is gated on `mayFailToFind !== false` — a mandatory search with
        // nothing to find would produce zero offered actions and strand the game a second way.
        if ((pc.candidates || []).length === 0) {
          const settled = settleTutorChoice(current.state, null);
          current = { ...current, state: settled };
          continue;
        }
        if (pause) {
          return { session: current, decision: { kind: "tutor-search", ...pc } };
        }
        const tutorPick = decidePendingChoice({
          decide,
          state: current.state,
          seat: choiceSeat,
          pilot,
          recordDecision,
          buildOffered: () => pendingPickActions(pc, { allowDecline: pc.mayFailToFind !== false }),
          fallbackAction: {
            kind: "pending-choice",
            choiceKind: pc.kind,
            candidateId: autoPickTutorCandidate(current.state, pc),
          },
        });
        current = { ...current, state: settleTutorChoice(current.state, tutorPick.candidateId) };
        continue;
      }
      // WI-4 FAILSAFE — an unhandled pendingChoice.kind (a future kind added to PENDING_CHOICE_KINDS
      // without a driver branch above, or state corruption). Previously this silently fell through to
      // the tutor settler, which no-ops on a kind mismatch — an AI seat would spin every tick to the
      // 50,000-tick SAFETY_CAP ("engine-stuck"), and a human seat would surface an unrenderable decision.
      // Fail honestly instead: log it, clear the choice so the driver isn't stuck, and surface a real
      // engine-stuck decision immediately (no spin, no silent no-op).
      {
        const loggedState = logEvent(current.state, {
          kind: "pending-choice-unhandled",
          choiceKind: pc.kind,
          controller: pc.controller ?? null,
        });
        current = { ...current, state: clearPendingChoice(loggedState) };
        return {
          session: current,
          decision: {
            kind: "engine-stuck",
            reason: `no driver branch for pendingChoice kind "${pc.kind}"`,
          },
        };
      }
    }

    // Turn-limit stalemate: end with diagnostics, not a scary "engine stuck". A dev
    // warning fires so a too-long game (the AI never closing) is visible, not silently
    // "normal".
    //
    // OUTCOME DEPENDS ON THE OPT-IN CLOCK:
    //   - time pressure OFF (default): status "draw" — BYTE-IDENTICAL to before. The
    //     Academy / every existing test still draws at the cap.
    //   - time pressure ON: status "timeout" — a DISTINCT, honest fourth outcome. We do
    //     NOT fabricate a W/L by a metric "leader wins at the cap" call (that would inject
    //     the exact label noise this work removes). A timeout is honestly a timeout: it is
    //     mapped to NO value label and carries trainingWeight:0 downstream, so the recorder
    //     down-weights/excludes it. The clock's job is to make games reach REAL lethal
    //     (a true SBA loss) BEFORE the cap; a game that still times out is dropped, not
    //     relabeled. MAX_TURNS stays generous so legitimate long, grindy games finish.
    if (current.state.turn > MAX_TURNS) {
      const status = timeCfg ? "timeout" : "draw";
      if (typeof console !== "undefined" && console.warn) {
        console.warn(
          `[learn] turn limit (${MAX_TURNS}) reached at turn ${current.state.turn} — ending as a ${status}`,
        );
      }
      return {
        session: { ...current, status, endedAt: new Date().toISOString() },
        decision: {
          kind: "game-over",
          reason: timeCfg ? "timeout" : "turn-limit",
          diagnostic: {
            turn: current.state.turn,
            phase: current.state.phase,
            step: current.state.step,
          },
        },
      };
    }

    const state = current.state;

    // No priority holder → advance to next step.
    if (!state.priorityHolder) {
      try {
        current = { ...current, state: nextStep(state) };
        continue;
      } catch (error) {
        return {
          session: current,
          decision: { kind: "engine-stuck", reason: error.message },
        };
      }
    }

    // Priority holder set: ask the decisionGate.
    const actor = state.priorityHolder;
    const actions = legalActionsForPlayer(state, actor);
    const decision = makeDecision(state, actor, actions, {
      difficulty: actor === "user" ? current.difficulty : "expert",
      archetype,
      policy,
    });

    if (decision.kind === "ask") {
      // User has a real decision. Return it.
      return { session: current, decision };
    }

    // Auto-decided — apply and continue.
    if (!decision.action) {
      // No legal action and no auto-pick — defensively pass. BUT: a mid-resolution pending
      // window (free-cast / cascade / discover) offers NO pass-priority, and force-passing
      // would leave the pending flag set forever — legalChoices keeps returning only that
      // window and the game wedges (a timePressure drain would then mint a fake W/L from a
      // wedged game). If the offered set carries the window's safe non-cast resolution
      // (decline / to-hand), dispatch THAT instead: it clears the flag and play proceeds.
      const declineKinds = new Set(["free-cast-decline", "cascade-decline", "discover-to-hand"]);
      const fallback = actions.find((a) => declineKinds.has(a.kind)) || {
        kind: "pass-priority",
        playerId: actor,
      };
      try {
        current = { ...current, state: dispatchAction(state, fallback) };
      } catch {
        return {
          session: current,
          decision: {
            kind: "engine-stuck",
            reason: "no legal action and no pass available",
            ticks,
            maxTurnTicks,
          },
        };
      }
      continue;
    }

    // Pluggable decide: pick among the OFFERED legalActions. With no decide this is the
    // exact action makeDecision/pickAction chose (byte-identical); a pilot may substitute
    // another offered action, and an out-of-set / throwing return falls back to it. Also
    // records the full-trajectory row (when recordDecision is set) for THIS decision.
    const chosenAction = resolveDecideAction({
      decide,
      state,
      offered: actions,
      seat: actor,
      pilot,
      fallbackAction: decision.action,
      recordDecision,
    });

    try {
      const newState = dispatchAction(state, chosenAction);
      // Anti-loop latch (defense-in-depth behind the combat exclusion fix): a
      // non-pass action that leaves the progress signature unchanged did
      // nothing meaningful. Rather than re-applying the same no-op forever,
      // force a pass to move the game forward.
      if (
        chosenAction.kind !== "pass-priority" &&
        progressSignature(newState) === progressSignature(state)
      ) {
        current = {
          ...current,
          state: dispatchAction(state, { kind: "pass-priority", playerId: actor }),
        };
        continue;
      }
      const logEntry = {
        ts: Date.now(),
        turn: state.turn,
        phase: state.phase,
        step: state.step,
        actor,
        action: chosenAction,
        auto: true,
        reasoning: decision.metadata?.reasoning,
      };
      current = {
        ...current,
        state: newState,
        decisionLog: [...current.decisionLog, logEntry],
      };
    } catch (error) {
      // DispatcherError or other — bail with a structured decision so
      // the UI can show what happened.
      return {
        session: current,
        decision: { kind: "dispatch-error", reason: error.message, code: error.code },
      };
    }
  }

  return {
    session: current,
    decision: {
      kind: "engine-stuck",
      reason: `safety cap (${SAFETY_CAP} ticks) hit`,
      ticks,
      maxTurnTicks,
    },
  };
}

// ─── User-choice application ─────────────────────────────────────────────────

/**
 * The user picked an option from a decision.options list. Validate
 * the choice against the legal actions, dispatch, log, then call
 * advanceUntilDecision so the next prompt is ready to render.
 *
 * `opts` (additive, default {}) is the SD-1 instrumentation pass-through: it is
 * forwarded verbatim to the re-advance (advanceUntilDecision's
 * { decide, pilot, recordDecision, timePressure, onTurnStart, archetype } seam)
 * so a caller-driven game stays instrumented across act() boundaries. The HTTP
 * routes pass nothing → {} → the human path is byte-identical. Every apply*
 * settler below threads the same trailing opts.
 *
 * Returns { session, decision } same shape as advanceUntilDecision.
 */
export function applyChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return {
      session,
      decision: { kind: "game-over", reason: session.status },
    };
  }

  // SD-6 — a suspended resolution-time choice (state.pendingChoice) or Arbiter ruling
  // (state.pendingArbiter) owns the session right now: those are answered via
  // applyPendingChoice / continueFromArbiter, NEVER via a priority action. Without this
  // guard, legalActionsForPlayer (which has no pendingChoice short-circuit) computes
  // normal priority actions for the reset priorityHolder, so a stale /step submit (e.g.
  // a racing pass-priority) could resolve the NEXT stack object while the suspended
  // program's spell is mid-resolution. Drop the stale submit and re-surface the live
  // picker/ruling — byte-identical to applyPendingChoice's stale-submit semantics.
  // pendingDiscover/pendingFreeCast/pendingCascade are NOT included: their answers
  // legitimately arrive as actions through applyChoice (see the actor derivation below).
  if (session.state.pendingChoice || session.state.pendingArbiter) {
    return advanceUntilDecision(session, opts);
  }

  // SD-3 (CR 702.85a / 601.2b) — a mid-resolution pending window (discover / free-cast /
  // cascade) belongs to its CONTROLLER, who may NOT be the current priorityHolder:
  // resolveTopOfStack always finalizes (resetPriorityLoop ⇒ priorityHolder = activePlayer),
  // so a user's off-turn discover pauses with priorityHolder = the AI active player.
  // legalChoices short-circuits all three windows to "controller only, [] for everyone
  // else" — validating against the priorityHolder made the human's ask UNANSWERABLE
  // (INVALID_CHOICE forever, a hard wedge). Validate against the window controller.
  const s = session.state;
  const actor =
    s.pendingDiscover?.controller ??
    s.pendingFreeCast?.controller ??
    s.pendingCascade?.controller ??
    s.priorityHolder;
  if (!actor) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: "No priority holder set" },
    };
  }

  const actions = legalActionsForPlayer(session.state, actor);
  const matched = resolveChoice(actions, choice);
  if (!matched) {
    return {
      session,
      decision: {
        kind: "dispatch-error",
        reason: "Choice doesn't match any legal action",
        code: "INVALID_CHOICE",
      },
    };
  }

  let newState;
  try {
    newState = dispatchAction(session.state, matched);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }

  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor,
    action: matched,
    auto: false,
    reasoning: "user-chose",
  };

  const next = {
    ...session,
    state: newState,
    decisionLog: [...session.decisionLog, logEntry],
  };

  return advanceUntilDecision(next, opts);
}

/**
 * P2.1 — the player has seen the Arbiter's ruling for an `unresolved` spell and
 * wants to continue. Clears the `pendingArbiter` flag, records that the ruling
 * was acknowledged (audit trail for Phase-3 records), and resumes the driver.
 *
 * The unresolved spell already left the stack at resolution; its effect was
 * deferred to the player's manual application of the ruling — the engine never
 * fabricates it. Returns { session, decision } like advanceUntilDecision.
 */
export function continueFromArbiter(session, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  if (!session.state.pendingArbiter) {
    // Nothing pending (e.g. a double-submit) — just re-derive the next decision.
    return advanceUntilDecision(session, opts);
  }

  const pa = session.state.pendingArbiter;
  const cleared = clearPendingArbiter(session.state);
  const logged = logEvent(cleared, {
    kind: "arbiter-acknowledged",
    objectId: pa.stackObjectId,
    cardName: pa.cardName,
  });
  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "continue-after-arbiter", name: pa.cardName },
    auto: false,
    reasoning: "arbiter-acknowledged",
  };

  return advanceUntilDecision(
    {
      ...session,
      state: logged,
      decisionLog: [...session.decisionLog, logEntry],
    },
    opts,
  );
}

/**
 * The player picked a card (or chose "find nothing") from a `tutor-search` decision.
 * Validates the pick against the pending candidates, applies the fetch + shuffle, resumes
 * the suspended effect program, then re-derives the next decision. `choice.cardId` is the
 * chosen library card id, or null/absent to find nothing (legal for a stated-quality search,
 * CR 701.23b; a null pick on a mandatory unfiltered search with candidates available is
 * rejected by resolveTutorChoice — CR 701.23d — and the same picker re-surfaces). Returns
 * { session, decision } like advanceUntilDecision.
 */
export function applyTutorChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "tutor-search") {
    // Nothing pending (e.g. a double-submit) — just re-derive the next decision.
    return advanceUntilDecision(session, opts);
  }
  const cardId = choice?.cardId ?? null;
  if (cardId !== null && !pc.candidates.some((c) => c.id === cardId)) {
    // An illegal/stale pick must NOT strand the game: the choice is still pending, so
    // re-surface the SAME picker (advanceUntilDecision re-derives it) instead of a
    // terminal dispatch-error the UI can't recover from.
    return advanceUntilDecision(session, opts);
  }

  let newState;
  try {
    newState = settleTutorChoice(session.state, cardId);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }

  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "tutor-choice", found: cardId !== null },
    auto: false,
    reasoning: "user-chose-tutor",
  };

  return advanceUntilDecision(
    {
      ...session,
      state: newState,
      decisionLog: [...session.decisionLog, logEntry],
    },
    opts,
  );
}

/**
 * The player picked which creature to copy (or declined) from a `clone-search` decision (CR 707).
 * Validates the pick against the pending candidates, then enters the clone as that copy (or as
 * itself on decline/illegal), flushes its ETB triggers, and re-derives the next decision.
 * `choice.permId` is the chosen battlefield permanent id, or null/absent to decline a "you may"
 * clone. Returns { session, decision } like advanceUntilDecision.
 */
export function applyCloneChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "clone-search") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const permId = choice?.permId ?? null;
  if (permId !== null && !pc.candidates.some((c) => c.id === permId)) {
    return advanceUntilDecision(session, opts); // illegal/stale pick → re-surface the same picker.
  }
  // WI-2 (CREED — CR 707.9): a MANDATORY clone cannot be declined — a null submit re-surfaces the
  // picker (the hand-discard null-reject pattern) instead of misplaying the copy as a 0/0.
  if (permId === null && pc.resume?.optional === false) {
    return advanceUntilDecision(session, opts);
  }

  let newState;
  try {
    newState = settleCloneChoice(session.state, permId);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }

  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "clone-choice", copied: permId !== null },
    auto: false,
    reasoning: "user-chose-copy-target",
  };

  return advanceUntilDecision(
    {
      ...session,
      state: newState,
      decisionLog: [...session.decisionLog, logEntry],
    },
    opts,
  );
}

/**
 * The player resolved a `scry-surveil` decision (CR 701.22 / 701.25). `choice.keep` is the ordered
 * list of top-card ids to keep on top; everything else among the looked-at cards goes to the bottom
 * (scry) or the graveyard (surveil). Applies the reorder + resumes, then re-derives the next
 * decision. Returns { session, decision } like advanceUntilDecision.
 */
export function applyScryChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "scry-surveil") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  // Keep only ids that are actually among the looked-at cards, each at most once (defensive
  // against a stale/duplicate-id UI submit — keeps the library mutation + the log count honest).
  const valid = new Set((pc.cards || []).map((c) => c.id));
  const keep = [
    ...new Set((Array.isArray(choice?.keep) ? choice.keep : []).filter((id) => valid.has(id))),
  ];

  let newState;
  try {
    newState = settleScryChoice(session.state, keep);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }

  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: {
      kind: "scry-choice",
      mode: pc.mode,
      kept: keep.length,
      looked: (pc.cards || []).length,
    },
    auto: false,
    reasoning: "user-chose-scry",
  };

  return advanceUntilDecision(
    {
      ...session,
      state: newState,
      decisionLog: [...session.decisionLog, logEntry],
    },
    opts,
  );
}

/**
 * ===== DIVIDE ===== (MT-1) — the player assigned a divide-damage division. `choice.distribution` is
 * `[{ id, type, amount }]`; resolveDivideChoice validates it against the candidates + caps the running
 * total, so a malformed UI submit can never fabricate damage or hit a non-target. Settles + re-derives.
 *
 * WI-5 FULL-ASSIGNMENT GUARD (CR 601.2d — "the source's controller announces the division... the total
 * ... must be assigned"): the LearnView picker already gates its submit button on `remaining === 0`
 * (DivideDamagePanel), but the raw API had no server-side equivalent — a non-UI client (or a client bug)
 * could submit a partial distribution and the engine would silently accept it as the final division. When
 * the candidate set CAN absorb the full amount (≥1 candidate exists) and the submitted distribution's
 * capped sum falls short, reject: re-surface the SAME pending choice (unresolved) instead of settling a
 * partial spend. An empty candidate set (nothing to assign to) still settles at 0 — resolveDivideChoice's
 * own cap already handles that no-op correctly.
 */
export function applyDivideChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "divide-damage") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const distribution = Array.isArray(choice?.distribution) ? choice.distribution : [];
  if ((pc.candidates || []).length > 0) {
    const validIds = new Set(pc.candidates.map((c) => c.id));
    const cappedSum = distribution.reduce((spent, d) => {
      if (!validIds.has(d?.id) || (d.type !== "creature" && d.type !== "player")) return spent;
      return spent + Math.max(0, Math.min(d.amount || 0, (pc.amount || 0) - spent));
    }, 0);
    if (cappedSum < (pc.amount || 0)) {
      return { session, decision: { kind: "divide-damage", ...pc } }; // under-assigned — re-surface the picker
    }
    // SHELF CAP13 — the printed TARGET BOUND (CR 601.2d, "among one, two, or three targets"). The sum guard
    // above catches an under-assignment; this catches the opposite illegal submit — a division spread over
    // MORE targets than the card permits. Same remedy: re-surface the SAME pending choice unresolved rather
    // than settling an illegal division. Counts distinct ids that actually RECEIVE damage, so a zero-amount
    // or duplicate entry can't inflate the count. A null maxTargets (the unbounded forms) skips it entirely.
    if (pc.maxTargets != null) {
      const hit = new Set();
      let spent = 0;
      for (const d of distribution) {
        if (!validIds.has(d?.id) || (d.type !== "creature" && d.type !== "player")) continue;
        const amt = Math.max(0, Math.min(d.amount || 0, (pc.amount || 0) - spent));
        if (amt <= 0) continue;
        spent += amt; hit.add(d.id);
      }
      if (hit.size > pc.maxTargets) {
        return { session, decision: { kind: "divide-damage", ...pc } }; // over-targeted — re-surface
      }
    }
  }
  let newState;
  try {
    newState = settleDivideChoice(session.state, distribution);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }
  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "divide-choice", amount: pc.amount, targets: distribution.length },
    auto: false,
    reasoning: "user-assigned-divide",
  };
  return advanceUntilDecision(
    { ...session, state: newState, decisionLog: [...session.decisionLog, logEntry] },
    opts,
  );
}

/**
 * ===== DISTRIBUTE ===== — the player assigned a distribute-counters division (The Earth Crystal).
 * `choice.distribution` is `[{ id, type, amount }]`; resolveDistributeChoice validates it against the
 * candidates + caps the running sum at pc.amount. Same WI-5 full-assignment guard: a short distribution
 * re-surfaces the picker (CR 601.2d — the whole amount must be assigned). Mirrors applyDivideChoice.
 */
export function applyDistributeChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "distribute-counters") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const distribution = Array.isArray(choice?.distribution) ? choice.distribution : [];
  if ((pc.candidates || []).length > 0) {
    const validIds = new Set(pc.candidates.map((c) => c.id));
    const cappedSum = distribution.reduce((spent, d) => {
      if (!validIds.has(d?.id)) return spent;
      return spent + Math.max(0, Math.min(d.amount || 0, (pc.amount || 0) - spent));
    }, 0);
    // The required total is what is ACTUALLY ASSIGNABLE, not the raw amount. Two different rules shapes
    // share this settler:
    //   - "distribute N counters among one/two/three target creatures" (Armament Corps) — a CR division:
    //     all N must be placed. perTargetCap is null, so assignableMax is unbounded and required === N.
    //   - "put a +1/+1 counter on EACH OF UP TO X target creatures" (The Wise Mothman) — X caps the number
    //     of TARGETS, each getting exactly one counter (perTargetCap 1). Choosing fewer targets than X is
    //     legal: with X=3 and only 2 creatures on board you target 2 and place 2.
    // Demanding the raw amount in the second shape is unsatisfiable, and because this choice is mandatory
    // the picker re-surfaced forever — a genuine SOFT-LOCK for a human seat (found live by
    // scripts/playability-sweep.mjs: amount=3 perTargetCap=1 candidates=2, turn 47).
    const perCap = pc.perTargetCap ?? Infinity;
    const targetSlots = Math.min(
      (pc.candidates || []).length,
      pc.maxTargets ?? (pc.candidates || []).length,
    );
    //   - "move ANY NUMBER of +1/+1 counters …" (Forgotten Ancient, W1) — pc.anyNumber: zero-through-all is
    //     the printed choice (moving nothing IS the "you may" decline), so nothing is required.
    const required = pc.anyNumber ? 0 : Math.min(pc.amount || 0, targetSlots * perCap);
    if (cappedSum < required) {
      return { session, decision: { kind: "distribute-counters", ...pc } }; // under-assigned — re-surface the picker
    }
  }
  let newState;
  try {
    newState = settleDistributeChoice(session.state, distribution);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }
  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "distribute-choice", amount: pc.amount, targets: distribution.length },
    auto: false,
    reasoning: "user-assigned-distribute",
  };
  return advanceUntilDecision(
    { ...session, state: newState, decisionLog: [...session.decisionLog, logEntry] },
    opts,
  );
}

/**
 * ===== SOFT-CNT ===== — the player (whose spell is under a soft counter) chose to pay {N} or not.
 * `choice.pay` is the yes/no. resolveSoftCounterChoice charges the mana + saves the spell (or counters it
 * if declined / unaffordable — payGenericMana never fabricates mana), then resumes + re-derives. A
 * double-submit (nothing pending) re-derives.
 */
export function applySoftCounterChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "soft-counter") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const pay = choice?.pay === true || choice === true;
  let newState;
  try {
    newState = settleSoftCounterChoice(session.state, pay);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }
  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "soft-counter-choice", amount: pc.amount, paid: pay },
    auto: false,
    reasoning: "user-chose-soft-counter-pay",
  };
  return advanceUntilDecision(
    { ...session, state: newState, decisionLog: [...session.decisionLog, logEntry] },
    opts,
  );
}

/**
 * ===== OPTIONAL-MANA-PAYMENT ===== (CR 603.7c) — the player chose to pay {cost} (and run the payoff) or not,
 * for a "you may pay {cost}. If you do, <effect>" (Lifecrafter's Bestiary / Mind's Eye / …). `choice.pay` is
 * the yes/no. resolveOptionalManaPaymentChoice charges the mana + runs the payoff (or skips it if declined /
 * unaffordable — payManaCost never fabricates mana), then resumes + re-derives. A double-submit (nothing
 * pending) re-derives. Mirrors applySoftCounterChoice.
 */
export function applyOptionalManaPaymentChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "optional-mana-payment") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const pay = choice?.pay === true || choice === true;
  let newState;
  try {
    newState = settleOptionalManaPaymentChoice(session.state, pay);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }
  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "optional-mana-payment-choice", paid: pay },
    auto: false,
    reasoning: "user-chose-optional-mana-payment",
  };
  return advanceUntilDecision(
    { ...session, state: newState, decisionLog: [...session.decisionLog, logEntry] },
    opts,
  );
}

/**
 * ===== OPTIONAL-LIFE-PAYMENT ===== (LANDS-TIER slice 2; CR 614.1c + 119.4) — the player chose to pay N life
 * for an untapped shockland or to let it enter tapped ("As this land enters, you may pay N life. If you don't,
 * it enters tapped."). `choice.pay` is the yes/no. resolveOptionalLifePaymentChoice charges the life (or, if
 * the player can't cover it, taps — loseLife never fabricates) or taps the land, then re-derives. A
 * double-submit (nothing pending) re-derives. Mirrors applyOptionalManaPaymentChoice.
 */
export function applyOptionalLifePaymentChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "optional-life-payment") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const pay = choice?.pay === true || choice === true;
  let newState;
  try {
    newState = settleOptionalLifePaymentChoice(session.state, pay);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }
  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "optional-life-payment-choice", paid: pay },
    auto: false,
    reasoning: "user-chose-optional-life-payment",
  };
  return advanceUntilDecision(
    { ...session, state: newState, decisionLog: [...session.decisionLog, logEntry] },
    opts,
  );
}

/**
 * ===== SYLVAN LIBRARY ===== (SG-15b; CR 603.7c + 121.4) — the player answered ONE drawn card's pay-or-put-back.
 * `choice.pay` is the yes/no. The settler charges the life (only with it to spare) or puts the card on top,
 * chains the next card or resumes the program, then re-derives. A double-submit (nothing pending) re-derives.
 * Mirrors applyOptionalLifePaymentChoice.
 */
/**
 * ===== TEMPTING OFFER ===== (Tempt with Discovery) — the asked opponent (a human) answered the offer at the panel.
 * Structurally applySylvanLibraryChoice: a yes/no settle, then re-derive the next decision.
 */
function applyTemptingOfferChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "tempting-offer") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const accept = choice?.accept === true || choice === true;
  let newState;
  try {
    newState = settleTemptingOfferChoice(session.state, accept);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }
  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "tempting-offer-choice", accepted: accept },
    auto: false,
    reasoning: "user-answered-tempting-offer",
  };
  return advanceUntilDecision(
    { ...session, state: newState, decisionLog: [...session.decisionLog, logEntry] },
    opts,
  );
}

function applySylvanLibraryChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "sylvan-library") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const pay = choice?.pay === true || choice === true;
  let newState;
  try {
    newState = settleSylvanLibraryChoice(session.state, pay);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }
  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "sylvan-library-choice", cardId: pc.cardId, paid: pay },
    auto: false,
    reasoning: "user-chose-sylvan-library",
  };
  return advanceUntilDecision(
    { ...session, state: newState, decisionLog: [...session.decisionLog, logEntry] },
    opts,
  );
}

/**
 * ===== REFLEXIVE-SAC-BY-SUBTYPE ===== (CR 603.7c) — the player chose to sacrifice a matching-subtype permanent
 * (and run the payoff) or not, for a "you may sacrifice a <subtype>. If you do, <effect>" (The Goose Mother /
 * Wedding Security). `choice.sac` is the yes/no. resolveOptionalSacChoice pitches one matching permanent + runs
 * the payoff (or skips it if declined / none available — sacrificeCreatureEffect never fabricates a sac), then
 * resumes + re-derives. A double-submit (nothing pending) re-derives. Mirrors applyOptionalManaPaymentChoice.
 */
export function applyOptionalSacChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "optional-sac-payment") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const sac = choice?.sac === true || choice === true;
  let newState;
  try {
    newState = settleOptionalSacChoice(session.state, sac);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }
  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "optional-sac-payment-choice", sacrificed: sac },
    auto: false,
    reasoning: "user-chose-optional-sac-payment",
  };
  return advanceUntilDecision(
    { ...session, state: newState, decisionLog: [...session.decisionLog, logEntry] },
    opts,
  );
}

/**
 * ===== OPTIONAL DRAW-THEN-DISCARD ===== — the player chose to draw (and then discard) or not, for a "you may
 * draw a card. If you do, discard a card." `choice.draw` is the yes/no. resolveOptionalDrawDiscardChoice runs the
 * [draw, discard] on yes (or nothing on decline), then resumes + re-derives. Mirrors applyOptionalSacChoice.
 */
export function applyOptionalDrawDiscardChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "optional-draw-discard") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const doDraw = choice?.draw === true || choice === true;
  let newState;
  try {
    newState = settleOptionalDrawDiscardChoice(session.state, doDraw);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }
  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "optional-draw-discard-choice", drew: doDraw },
    auto: false,
    reasoning: "user-chose-optional-draw-discard",
  };
  return advanceUntilDecision(
    { ...session, state: newState, decisionLog: [...session.decisionLog, logEntry] },
    opts,
  );
}

/**
 * ===== OPTIONAL-DISCARD-PAYMENT ===== — the player chose to pay (discard a card) or not, for a "you may discard a
 * card. If you do, <effect>." `choice.discard` is the yes/no. resolveOptionalDiscardPaymentChoice runs the [discard,
 * ...payoff] on yes (or nothing on decline / empty hand), then resumes + re-derives. Mirrors applyOptionalDrawDiscardChoice.
 */
export function applyOptionalDiscardPaymentChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "optional-discard-payment") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const doDiscard = choice?.discard === true || choice === true;
  let newState;
  try {
    newState = settleOptionalDiscardChoice(session.state, doDiscard);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }
  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "optional-discard-payment-choice", discarded: doDiscard },
    auto: false,
    reasoning: "user-chose-optional-discard-payment",
  };
  return advanceUntilDecision(
    { ...session, state: newState, decisionLog: [...session.decisionLog, logEntry] },
    opts,
  );
}

/**
 * MILLED-PICK (Ripples / Six) — the human submit: `choice.cardId` names the candidate to take to hand.
 * A stale/absent id falls to the settler's first-candidate auto-pick. Mirrors the other apply fns.
 */
export function applyMilledPickChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "milled-pick") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const cardId = choice?.cardId ?? null;
  let newState;
  try {
    newState = settleMilledPickChoice(session.state, cardId);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }
  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "milled-pick-choice", cardId },
    auto: false,
    reasoning: "user-chose-milled-pick",
  };
  return advanceUntilDecision(
    { ...session, state: newState, decisionLog: [...session.decisionLog, logEntry] },
    opts,
  );
}

/**
 * OPTIONAL-EXILE-SELF (Undead Butler) — the human submit for "you may exile it. When you do, <payoff>."
 * `choice.exile` (or a bare boolean) is the yes/no; settleOptionalExileSelfChoice re-scans + pays + runs
 * the payoff. Mirrors applyOptionalDiscardPaymentChoice exactly.
 */
export function applyOptionalExileSelfChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "optional-exile-self-payment") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const doExile = choice?.exile === true || choice === true;
  let newState;
  try {
    newState = settleOptionalExileSelfChoice(session.state, doExile);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }
  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "optional-exile-self-choice", exiled: doExile },
    auto: false,
    reasoning: "user-chose-optional-exile-self",
  };
  return advanceUntilDecision(
    { ...session, state: newState, decisionLog: [...session.decisionLog, logEntry] },
    opts,
  );
}

/**
 * ===== UPKEEP-SAC-UNLESS-PAY ===== — the player chose to pay (keep the permanent) or not (sacrifice it), for a
 * "sacrifice this <noun> unless you pay {cost}." `choice.pay` is the yes/no. resolveSacUnlessPayChoice charges the
 * mana + keeps it on a pay-and-afford, else sacrifices the source, then resumes + re-derives. Mirrors applyOptionalSacChoice.
 */
export function applySacUnlessPayChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "sac-unless-pay") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const pay = choice?.pay === true || choice === true;
  let newState;
  try {
    newState = settleSacUnlessPayChoice(session.state, pay);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }
  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "sac-unless-pay-choice", paid: pay },
    auto: false,
    reasoning: "user-chose-sac-unless-pay",
  };
  return advanceUntilDecision(
    { ...session, state: newState, decisionLog: [...session.decisionLog, logEntry] },
    opts,
  );
}

/**
 * ===== OPPONENT-PAYS-TO-DENY (taxed-payment) ===== — the PAYER (the opponent who cast) chose to pay the tax or let
 * the beneficiary draw, for a "you may draw a card unless that player pays {N}." (Rhystic Study). `choice.pay` is the
 * yes/no. resolveTaxedPaymentChoice charges the payer + suppresses the draw on pay, else the beneficiary draws, then
 * resumes + re-derives. Mirrors applySacUnlessPayChoice (the actor is the PAYER, whose seat == pc.controller).
 */
export function applyTaxedPaymentChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "taxed-payment") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const pay = choice?.pay === true || choice === true;
  let newState;
  try {
    newState = settleTaxedPaymentChoice(session.state, pay);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }
  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "taxed-payment-choice", paid: pay },
    auto: false,
    reasoning: "user-chose-taxed-payment",
  };
  return advanceUntilDecision(
    { ...session, state: newState, decisionLog: [...session.decisionLog, logEntry] },
    opts,
  );
}

/**
 * ===== ITERATED-EDICT (Torment of Hailfire) ===== — the affected OPPONENT resolved one edict decision. `choice`
 * carries { mode, permId?, cardId? } (the picked mode + the specific permanent / card). settleEdictModeChoice applies
 * it (lose 3 / sac / discard), advances the chain to the next opponent/round, then finishes the spell when the whole
 * queue drains. Mirrors applySacUnlessPayChoice (the actor is the affected opponent, whose seat == pc.controller).
 */
export function applyEdictModeChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "edict-mode") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const mode = (pc.modes || []).includes(choice?.mode) ? choice.mode : "life";
  let newState;
  try {
    newState = settleEdictModeChoice(session.state, {
      mode,
      permId: choice?.permId ?? null,
      cardId: choice?.cardId ?? null,
    });
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }
  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "edict-mode-choice", mode },
    auto: false,
    reasoning: "user-chose-edict-mode",
  };
  return advanceUntilDecision(
    { ...session, state: newState, decisionLog: [...session.decisionLog, logEntry] },
    opts,
  );
}

/**
 * The player resolved an `optional-effect` decision ("you may <effect>", α2). `choice.take` is the
 * yes/no. Runs-or-skips the paused atom, resumes the program, then re-derives the next decision.
 * Returns { session, decision } like advanceUntilDecision.
 */
export function applyOptionalChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "optional-effect") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const take = choice?.take === true || choice === true;

  let newState;
  try {
    newState = settleOptionalChoice(session.state, take);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }

  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "optional-choice", op: pc.effectOp, taken: take },
    auto: false,
    reasoning: "user-chose-optional",
  };

  return advanceUntilDecision(
    {
      ...session,
      state: newState,
      decisionLog: [...session.decisionLog, logEntry],
    },
    opts,
  );
}

/**
 * The player answered a `commander-return` yes/no (CR 903.9): `choice.return === true` sends the commander
 * back to the command zone (taxed recast available), false leaves it in the graveyard/exile. Mirrors
 * applyOptionalChoice — settle, log, re-derive the next decision.
 */
export function applyCommanderReturnChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "commander-return") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const doReturn = choice?.return === true || choice === true;

  let newState;
  try {
    newState = settleCommanderReturnChoice(session.state, doReturn);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }

  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "commander-return", cardName: pc.cardName, returned: doReturn },
    auto: false,
    reasoning: doReturn ? "user-returned-commander" : "user-left-commander-in-graveyard",
  };

  return advanceUntilDecision(
    {
      ...session,
      state: newState,
      decisionLog: [...session.decisionLog, logEntry],
    },
    opts,
  );
}

/**
 * The player picked which card to strip from a `hand-discard` decision (δ-1b — Duress / Thoughtseize).
 * Validates the pick against the pending candidates (the targeted opponent's revealed, filtered hand),
 * moves it to their graveyard, resumes the caster's riders, then re-derives the next decision.
 * `choice.cardId` is the chosen opponent-hand card id. Returns { session, decision } like the others.
 */
export function applyHandDiscardChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "hand-discard") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const cardId = choice?.cardId ?? null;
  if (cardId === null || !pc.candidates.some((c) => c.id === cardId)) {
    return advanceUntilDecision(session, opts); // a hand-discard always strips one (no "decline") → illegal/stale pick re-surfaces the picker.
  }

  let newState;
  try {
    newState = settleHandDiscardChoice(session.state, cardId);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }

  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "hand-discard-choice" },
    auto: false,
    reasoning: "user-chose-discard",
  };

  return advanceUntilDecision(
    {
      ...session,
      state: newState,
      decisionLog: [...session.decisionLog, logEntry],
    },
    opts,
  );
}

/**
 * IMPRINT (CR 207.2c) — the player picked which card to exile from their own hand for an `imprint-exile`
 * decision (Chrome Mox, Semblance Anvil, Isochron Scepter). Exiles it and STAMPS it onto the imprinting
 * permanent, then re-derives the next decision.
 *
 * UNLIKE hand-discard, a NULL cardId is a legal DECLINE, not a re-surface: imprint is "you may", and an
 * un-imprinted permanent is a normal board state. An id that isn't among the offered candidates is treated
 * the same way (the resolver refuses it) rather than exiling something that was never offered.
 */
export function applyImprintChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "imprint-exile") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const raw = choice?.cardId ?? null;
  const cardId = raw !== null && pc.candidates.some((c) => c.id === raw) ? raw : null;

  let newState;
  try {
    newState = settleImprintChoice(session.state, cardId);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }

  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "imprint-choice" },
    auto: false,
    reasoning: cardId ? "user-chose-imprint" : "user-declined-imprint",
  };

  return advanceUntilDecision(
    {
      ...session,
      state: newState,
      decisionLog: [...session.decisionLog, logEntry],
    },
    opts,
  );
}

/**
 * The player picked which card to discard for the CR 514.1 cleanup hand-size discard (CR-remediation
 * B3). Validates the pick against the pending candidates (their own hand), discards it, and either the
 * settler re-raises (still over the max) or the deferred 514.2 cleanup tail runs. `choice.cardId` is the
 * chosen hand-card id. Mandatory — an illegal/stale pick re-surfaces the picker, never skips the discard.
 */
export function applyCleanupDiscardChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "cleanup-discard") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const cardId = choice?.cardId ?? null;
  if (cardId === null || !pc.candidates.some((c) => c.id === cardId)) {
    return advanceUntilDecision(session, opts); // mandatory, no decline — an illegal pick re-surfaces the picker.
  }

  let newState;
  try {
    newState = settleCleanupDiscardStep(session.state, cardId);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }

  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "cleanup-discard-choice" },
    auto: false,
    reasoning: "user-chose-cleanup-discard",
  };

  return advanceUntilDecision(
    {
      ...session,
      state: newState,
      decisionLog: [...session.decisionLog, logEntry],
    },
    opts,
  );
}

/**
 * The player picked which looked-at card to keep from an `impulse-dig` decision (δ-2). Validates the
 * pick against the revealed candidates, keeps it (→ hand) + disposes the rest, resumes the program,
 * then re-derives the next decision. `choice.cardId` is the chosen library card id. A null/illegal pick
 * re-surfaces the picker (a dig always keeps one when ≥1 was revealed).
 */
export function applyImpulseDigChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "impulse-dig") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const cardId = choice?.cardId ?? null;
  if (cardId === null || !pc.candidates.some((c) => c.id === cardId)) {
    return advanceUntilDecision(session, opts); // illegal/stale pick → re-surface the same picker.
  }

  let newState;
  try {
    newState = settleImpulseDigChoice(session.state, cardId);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }

  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "impulse-dig-choice" },
    auto: false,
    reasoning: "user-chose-dig",
  };

  return advanceUntilDecision(
    {
      ...session,
      state: newState,
      decisionLog: [...session.decisionLog, logEntry],
    },
    opts,
  );
}

/**
 * TOP-CARD TAKE-OR-LEAVE-ON-TOP (BLITZ LK-2 — Dryad Greenseeker / Frost Augur / Herald's Horn) — the player
 * answered a `look-top-take` decision. `choice.cardId` = the matched top card's id → TAKE it (→ hand);
 * `choice.cardId` null → LEAVE it on top (a LEGAL decline — unlike impulse-dig, declining is offered here and
 * is not dominated). A non-null id that isn't the offered candidate re-surfaces the same choice (stale/illegal).
 * Resumes the suspended ability/trigger server-side and returns the next decision.
 */
export function applyLookTopTakeChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "look-top-take") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const cardId = choice?.cardId ?? null;
  // A null cardId is a LEGAL "leave it on top" decline. A NON-null id must be the offered candidate; anything
  // else is stale/illegal → re-surface the same choice (never misapply an unknown id).
  if (cardId !== null && !pc.candidates.some((c) => c.id === cardId)) {
    return advanceUntilDecision(session, opts);
  }

  let newState;
  try {
    newState = settleLookTopTakeChoice(session.state, cardId);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }

  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "look-top-take-choice", took: cardId !== null },
    auto: false,
    reasoning: cardId !== null ? "user-took-top-card" : "user-left-top-card",
  };

  return advanceUntilDecision(
    {
      ...session,
      state: newState,
      decisionLog: [...session.decisionLog, logEntry],
    },
    opts,
  );
}

/**
 * DIG-LAND-TO-BATTLEFIELD (Silverback Elder mode 2) — the player picked which land to put onto the battlefield
 * from a `dig-land-to-battlefield` decision. Validates the pick against the offered lands, puts it out (ETB +
 * landfall fire) + bottoms the rest in a random order, resumes the program, then re-derives the next decision.
 * `choice.cardId` is the chosen land's library card id. A null/illegal pick re-surfaces the picker (a real land
 * is always available when this pauses — the atom only pauses with ≥1 land candidate). Mirrors applyImpulseDigChoice.
 */
export function applyDigLandChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "dig-land-to-battlefield") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const cardId = choice?.cardId ?? null;
  if (cardId === null || !pc.candidates.some((c) => c.id === cardId)) {
    return advanceUntilDecision(session, opts); // illegal/stale pick → re-surface the same picker.
  }

  let newState;
  try {
    newState = settleDigLandChoice(session.state, cardId);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }

  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "dig-land-choice" },
    auto: false,
    reasoning: "user-chose-dig-land",
  };

  return advanceUntilDecision(
    {
      ...session,
      state: newState,
      decisionLog: [...session.decisionLog, logEntry],
    },
    opts,
  );
}

/**
 * ===== EDICTS ===== — the player picked which creature to sacrifice from a `sacrifice-choice` decision
 * (Diabolic Edict / Cruel Edict / Geth's Verdict). This fires when the HUMAN is the sacrificing player
 * (the edict's target). Validates the pick against the offered creatures, sacrifices it (dies triggers
 * fire), resumes the caster's riders, then re-derives the next decision. `choice.cardId` is the chosen
 * creature's permanent id. A null/illegal pick re-surfaces the picker (an edict always sacs one when ≥2
 * were offered — no decline). Returns { session, decision } like the others.
 */
export function applySacrificeChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "sacrifice-choice") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const cardId = choice?.cardId ?? null;
  if (cardId === null || !pc.candidates.some((c) => c.id === cardId)) {
    return advanceUntilDecision(session, opts); // illegal/stale pick → re-surface the same picker.
  }

  let newState;
  try {
    newState = settleSacrificeChoice(session.state, cardId);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }

  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "sacrifice-choice" },
    auto: false,
    reasoning: "user-chose-sacrifice",
  };

  return advanceUntilDecision(
    {
      ...session,
      state: newState,
      decisionLog: [...session.decisionLog, logEntry],
    },
    opts,
  );
}

/**
 * ===== EACH-PLAYER ===== discard (EP-2) — the player picked which card to pitch from a `discard` decision
 * (Mind Rot / Fugue / Delirium Skeins). This fires when the HUMAN is a discarder (CR 701.8 — the discarding
 * player chooses). Validates the pick against the offered hand, discards it, advances the chain (more cards
 * / the next discarder, or resume the caster's riders), then re-derives the next decision. `choice.cardId`
 * is the chosen hand card id. A null/illegal pick re-surfaces the picker (a discard always pitches one when
 * a real choice exists — no decline). Returns { session, decision } like the others.
 */
/** HAND→LIBRARY-TOP (the Brainstorm put-back) — the applyDiscardChoice shape over the put-back chain. */
export function applyHandToLibraryTopChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "hand-to-library-top") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const cardId = choice?.cardId ?? null;
  if (cardId === null || !pc.candidates.some((c) => c.id === cardId)) {
    return advanceUntilDecision(session, opts); // illegal/stale pick → re-surface the same picker.
  }
  let newState;
  try {
    newState = settleHandToLibraryTopChoice(session.state, cardId);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }
  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "hand-to-library-top-choice" },
    auto: false,
    reasoning: "user-chose-putback-own",
  };
  return advanceUntilDecision(
    {
      ...session,
      state: newState,
      decisionLog: [...session.decisionLog, logEntry],
    },
    opts,
  );
}

export function applyDiscardChoice(session, choice, opts = {}) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "discard") {
    return advanceUntilDecision(session, opts); // nothing pending (double-submit) — re-derive.
  }
  const cardId = choice?.cardId ?? null;
  if (cardId === null || !pc.candidates.some((c) => c.id === cardId)) {
    return advanceUntilDecision(session, opts); // illegal/stale pick → re-surface the same picker.
  }

  let newState;
  try {
    newState = settleDiscardChoice(session.state, cardId);
  } catch (error) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: error.message, code: error.code },
    };
  }

  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "discard-choice" },
    auto: false,
    reasoning: "user-chose-discard-own",
  };

  return advanceUntilDecision(
    {
      ...session,
      state: newState,
      decisionLog: [...session.decisionLog, logEntry],
    },
    opts,
  );
}

/**
 * Dispatch an interactive resolution-time choice (state.pendingChoice) to the right handler by
 * its kind — so the single /api/learn/choose route serves the tutor search, the clone copy-pick,
 * scry/surveil, the optional yes/no, the hand-discard pick, the impulse-dig pick, the edict
 * sacrifice pick, and the each/target-player discard pick. (Named apart from the decision-gate
 * `applyChoice`, which resolves a player ACTION, not a pendingChoice.)
 */
export function applyPendingChoice(session, choice, opts = {}) {
  const kind = session.state?.pendingChoice?.kind;
  // WI-5 KIND ECHO-CHECK — every useLearnSession apply* method stamps its own choice payload with
  // `kind: "<expected-kind>"` (added alongside this guard). A stale/cross-kind submit — e.g. a
  // double-click race that lands a soft-counter's `{pay:false}` after the server already advanced to a
  // DIFFERENT pending choice (say a tutor search) — would otherwise be silently misinterpreted by
  // whichever settler happens to be live now (a `{pay:false}` read as a tutor decline, or worse, a
  // structurally-compatible field misread as consent to something the player never saw). When the
  // submitted choice carries a kind that doesn't match the CURRENT pendingChoice, re-derive instead of
  // dispatching — the client's stale request is silently dropped and the real current decision is
  // returned so the UI can re-sync. Legacy/absent `choice.kind` (e.g. a raw API client, or a body with
  // no kind field) is unaffected — this is purely additive.
  if (choice && typeof choice.kind === "string" && kind && choice.kind !== kind) {
    return advanceUntilDecision(session, opts);
  }
  if (kind === "clone-search") return applyCloneChoice(session, choice, opts);
  if (kind === "scry-surveil") return applyScryChoice(session, choice, opts);
  if (kind === "optional-effect") return applyOptionalChoice(session, choice, opts);
  if (kind === "commander-return") return applyCommanderReturnChoice(session, choice, opts);
  if (kind === "hand-discard") return applyHandDiscardChoice(session, choice, opts);
  if (kind === "imprint-exile") return applyImprintChoice(session, choice, opts);
  if (kind === "cleanup-discard") return applyCleanupDiscardChoice(session, choice, opts);
  if (kind === "impulse-dig") return applyImpulseDigChoice(session, choice, opts);
  if (kind === "look-top-take") return applyLookTopTakeChoice(session, choice, opts);
  if (kind === "dig-land-to-battlefield") return applyDigLandChoice(session, choice, opts);
  if (kind === "sacrifice-choice") return applySacrificeChoice(session, choice, opts);
  if (kind === "discard") return applyDiscardChoice(session, choice, opts);
  if (kind === "hand-to-library-top") return applyHandToLibraryTopChoice(session, choice, opts);
  if (kind === "divide-damage") return applyDivideChoice(session, choice, opts);
  if (kind === "distribute-counters") return applyDistributeChoice(session, choice, opts);
  if (kind === "soft-counter") return applySoftCounterChoice(session, choice, opts);
  if (kind === "optional-mana-payment")
    return applyOptionalManaPaymentChoice(session, choice, opts);
  if (kind === "optional-life-payment") return applyOptionalLifePaymentChoice(session, choice, opts);
  if (kind === "sylvan-library") return applySylvanLibraryChoice(session, choice, opts);
  if (kind === "tempting-offer") return applyTemptingOfferChoice(session, choice, opts); // Tempt with Discovery — the asked opponent's answer
  if (kind === "optional-sac-payment") return applyOptionalSacChoice(session, choice, opts);
  if (kind === "optional-draw-discard")
    return applyOptionalDrawDiscardChoice(session, choice, opts);
  if (kind === "optional-discard-payment")
    return applyOptionalDiscardPaymentChoice(session, choice, opts);
  if (kind === "optional-exile-self-payment")
    return applyOptionalExileSelfChoice(session, choice, opts);
  if (kind === "milled-pick") return applyMilledPickChoice(session, choice, opts);
  if (kind === "sac-unless-pay") return applySacUnlessPayChoice(session, choice, opts);
  if (kind === "taxed-payment") return applyTaxedPaymentChoice(session, choice, opts);
  if (kind === "edict-mode") return applyEdictModeChoice(session, choice, opts);
  if (kind === "tutor-search") return applyTutorChoice(session, choice, opts);
  // WI-4 FAILSAFE — no pendingChoice at all (nothing to answer) re-derives, byte-identical to every
  // apply* function's own "double-submit" guard. A REAL unhandled kind never reaches applyTutorChoice's
  // settler silently — advanceUntilDecision re-derives and its own WI-4 failsafe (the pendingChoice
  // branch's unguarded tail) logs + clears + reports engine-stuck honestly instead of misinterpreting
  // the submitted choice as a tutor pick.
  return advanceUntilDecision(session, opts);
}

// ─── Termination ─────────────────────────────────────────────────────────────

export function abandon(session, reason = "user-abandoned") {
  if (session.status !== "active") return session;
  return {
    ...session,
    status: "abandoned",
    abandonReason: reason,
    endedAt: new Date().toISOString(),
  };
}

export function isComplete(session) {
  // "active" = a game in progress; "mulligan" = the pre-game human London phase (also in
  // progress — the game hasn't opened yet). Every OTHER status is terminal (a win/draw/timeout/
  // abandoned), which is what the routes record + clean up. Excluding "mulligan" is essential:
  // without it the routes would treat a mid-mulligan session as a finished game and delete it.
  return session?.status !== "active" && session?.status !== "mulligan";
}

// N6: kinds an AUTO-DECIDED decisionLog entry can carry that are pure bookkeeping noise — every
// auto-decided action gets appended unconditionally (see advanceUntilDecision's logEntry push above),
// so a "recent activity" tail is frequently dominated by consecutive "(auto) pass-priority" rows with
// zero narrative value. A USER's own choice is never filtered, even if it happens to be a pass — that's
// a deliberate decision worth showing, not noise.
const NOISY_AUTO_ACTION_KINDS = new Set(["pass-priority", "tap-for-mana"]);

/**
 * Filter `session.decisionLog` down to the entries worth showing in a "recent activity" strip, then
 * take the last `limit`. Drops auto-decided pass-priority/tap-for-mana bookkeeping; keeps every
 * user-chosen entry (auto === false) regardless of kind, and every other auto-decided kind (a land
 * drop, a cast, a block) since those ARE meaningful even when the engine picked them for the user.
 */
export function filteredDecisionLogTail(session, limit = 5) {
  const log = session?.decisionLog || [];
  const interesting = log.filter(
    (entry) => !entry.auto || !NOISY_AUTO_ACTION_KINDS.has(entry.action?.kind),
  );
  return interesting.slice(-limit);
}

// ─── Reusable SBA primitives (for the play-API seam) ─────────────────────────
// gameApi.js's gameStatus() derives the over/winner/draw verdict from the SAME
// loss/win rules the session driver uses — so the two can't drift. These are the
// single source of truth for "is this player dead?" (CR 104.3a / 704.5a life≤0,
// 704.5c ten poison, 903.10a / 704.6c 21 commander damage) and "has this player
// won?" (CR 104.2a wonGame flag). Exported, not duplicated.
export { isPlayerDead, hasWonGame };

// ─── Test helpers ────────────────────────────────────────────────────────────

/**
 * Direct life-deduction for test setup. Production code should never
 * call this — it's a shortcut for "force the user to lose this turn"
 * scenarios in integration tests.
 */
export function _forceLifeForTests(session, playerId, life) {
  return {
    ...session,
    state: {
      ...session.state,
      players: {
        ...session.state.players,
        [playerId]: { ...session.state.players[playerId], life },
      },
    },
  };
}

export { loseLife as _loseLifeForTests };
