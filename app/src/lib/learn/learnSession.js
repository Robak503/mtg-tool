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

import {
  createGameState,
  loseLife,
  logEvent,
  moveCardToZone,
  MODES,
} from "./gameState.js";
import { setPendingCommanderReturnChoice, clearPendingChoice } from "./pendingChoice.js";
import {
  startGame,
  nextStep,
  runStepActions,
  finalizeStackResolution,
} from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { makeDecision, resolveChoice } from "./decisionGate.js";
import { stableActionKey as _stableActionKey } from "./actionKey.js";
import { dispatchAction } from "./actionDispatcher.js";
import { featurizeState } from "./gameFeatures.js";
import { autoPickTutorCandidate, resolveTutorChoice, resolveScryChoice, resolveOptionalChoice, autoPickHandDiscardCandidate, resolveHandDiscardChoice, resolveImpulseDigChoice, autoPickSacrificeCandidate, resolveSacrificeChoice, autoPickDiscardCandidate, resolveDiscardChoice, autoPickDivideDistribution, resolveDivideChoice, autoPickDistributeCounters, resolveDistributeChoice, autoPickSoftCounterPay, resolveSoftCounterChoice, autoPickOptionalManaPayment, resolveOptionalManaPaymentChoice, autoPickOptionalSac, resolveOptionalSacChoice, autoPickOptionalDrawDiscard, resolveOptionalDrawDiscardChoice } from "./effects/runProgram.js";
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
} = {}) {
  if (!Array.isArray(userDeck) || userDeck.length === 0) {
    throw new Error("createLearnSession: userDeck must be a non-empty array");
  }
  if (!VALID_DIFFICULTIES.has(difficulty)) {
    throw new Error(`createLearnSession: difficulty must be one of ${[...VALID_DIFFICULTIES].join(", ")}`);
  }
  if (!MODES.includes(mode)) {
    throw new Error(`createLearnSession: mode must be one of ${MODES.join(", ")}`);
  }

  let state;
  if (mode === "commander") {
    if (!Array.isArray(opponentDecks) || opponentDecks.length !== 3) {
      throw new Error("createLearnSession: commander mode requires opponentDecks to be an array of exactly 3 decks");
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
  state = startGame(state, { seed, mulligan });

  return {
    id: generateSessionId(),
    createdAt: new Date().toISOString(),
    difficulty,
    mode,
    state,
    decisionLog: [],
    status: "active",
  };
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
  if (player.lostGame) return true; // UPKEEP-WIN — "target player loses the game" (CR 104.3a, Door to Nothingness)
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
    for (const entry of (_gone?.[zone] || [])) {
      const card = entry?.card || entry; // battlefield holds permanents (entry.card); other zones hold cards
      if (card?.isCommander) goneCommanderIds.add(card.commanderInstanceId || card.id);
    }
  }
  for (const id of turnOrder) {
    const dmg = players[id]?.commanderDamageFrom;
    if (dmg && Object.keys(dmg).some((k) => goneCommanderIds.has(k))) {
      players[id] = { ...players[id], commanderDamageFrom: Object.fromEntries(Object.entries(dmg).filter(([k]) => !goneCommanderIds.has(k))) };
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

  const log = [...state.log, { turn: state.turn, kind: "player-eliminated", player: playerId }];
  const base = { ...state, players, turnOrder, stack, combat, log };

  if (state.activePlayer === playerId) {
    // Active player left mid-turn: end the turn and start the next
    // surviving seat's turn from untap, rather than splicing a survivor
    // into the dead player's phase/step.
    const idx = oldOrder.indexOf(playerId);
    let nextActive = turnOrder[0] || null;
    for (let k = 1; k <= oldOrder.length; k++) {
      const cand = oldOrder[(idx + k) % oldOrder.length];
      if (cand !== playerId && players[cand]) { nextActive = cand; break; }
    }
    return runStepActions({
      ...base,
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
    priorityHolder = players[state.activePlayer] ? state.activePlayer : (turnOrder[0] || null);
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

  // UPKEEP-WIN (CR 104.2a) — a player who has WON ends the game immediately, BEFORE the life/poison/
  // elimination death checks below (a card can win you the game even while you're also at lethal — the
  // win is checked first). The user winning → "user-wins"; ANY opponent winning → "ai-wins" (the user
  // lost). Checked here so the win-game atom's `wonGame` flag becomes a real game end via the SAME SBA
  // path every other outcome flows through.
  if (hasWonGame(state, "user")) {
    return { ...session, status: "user-wins", endedAt: new Date().toISOString() };
  }
  if (opponents.some((id) => hasWonGame(state, id))) {
    return { ...session, status: "ai-wins", endedAt: new Date().toISOString() };
  }

  const userDead = isPlayerDead(state, "user");
  const deadOpponents = opponents.filter((id) => isPlayerDead(state, id));
  const allOpponentsDead = opponents.length > 0 && deadOpponents.length === opponents.length;

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
  const softCapTurn = Number.isInteger(timePressure.softCapTurn) && timePressure.softCapTurn > 0
    ? timePressure.softCapTurn
    : TIME_PRESSURE_DEFAULTS.softCapTurn;
  const lifeLossStep = Number.isFinite(timePressure.lifeLossStep) && timePressure.lifeLossStep > 0
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
  const distinctAttackers = new Set((state.combat?.attackers || []).map(a => a.permanentId)).size;
  const distinctBlockers = new Set((state.combat?.blockers || []).map(b => b.blockerId)).size;
  const pendings = (state.pendingFreeCast ? 1 : 0) + (state.pendingCascade ? 2 : 0) + (state.pendingDiscover ? 4 : 0);
  return [
    state.turn, state.phase, state.step,
    distinctAttackers, distinctBlockers, state.stack.length,
    handCount, poolTotal, bfCount, pendings,
  ].join("|");
}

/** Strip the transient P2.1 unresolved→Arbiter flag from a state (pure). */
function clearPendingArbiter(state) {
  if (!state.pendingArbiter) return state;
  const { pendingArbiter: _gone, ...rest } = state;
  return rest;
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
      const card = (state.players[pid]?.[zone] || []).find((c) => c?.isCommander && !c._returnHandled);
      if (!card) continue;
      if (pid === "user") {
        // Human owner → offer the choice (the loop applies the pause / Expert-auto split).
        return setPendingCommanderReturnChoice(state, { controller: pid, zone, cardId: card.id, cardName: card.name });
      }
      // AI owner → auto-return so it can recast. The card keeps isCommander; commanderCastCount (the tax,
      // CR 903.8) lives on the player and is untouched, so it persists across the return.
      return moveCardToZone(state, { playerId: pid, fromZone: zone, toZone: "command", cardId: card.id });
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
    return moveCardToZone(cleared, { playerId: pc.controller, fromZone: pc.zone, toZone: "command", cardId: pc.cardId });
  }
  return {
    ...cleared,
    players: {
      ...cleared.players,
      [pc.controller]: {
        ...cleared.players[pc.controller],
        [pc.zone]: (cleared.players[pc.controller]?.[pc.zone] || []).map((c) => (c.id === pc.cardId ? { ...c, _returnHandled: true } : c)),
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
 * Settle an impulse-dig choice (δ-2): keep the chosen card (→ hand), dispose the rest (bottom/graveyard),
 * resume the suspended program (a "then draw" rider — may re-pause, so guard pendingChoice before
 * flushing), then finalizeStackResolution flushes any triggers a resumed atom enqueued.
 */
function settleImpulseDigChoice(state, cardId) {
  const next = resolveImpulseDigChoice(state, cardId);
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

// ─── Pluggable decision-maker (Learn-to-Play item #3 — the pilot seam) ──────────
//
// THE KEYSTONE: the self-play loop enumerates a set of `legalActions` at every real
// choice (the priority window — main plays, declare-attackers, declare-blockers,
// X-cost, modal; and the resolution-time DISCOVER choice), then asks a `decide`
// callback to pick ONE of them:
//
//     decide({ state, legalActions, seat, pilot }) -> action   (∈ legalActions)
//
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
function resolveDecideAction({ decide, state, offered, seat, pilot, fallbackAction, recordDecision }) {
  let chosen = fallbackAction;
  if (typeof decide === "function") {
    let candidate;
    try {
      candidate = decide({ state, legalActions: offered, seat, pilot });
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
      recordDecision({
        turn: state.turn,
        seat,
        pilot: pilot ? { playbook: pilot.playbook ?? null, temperament: pilot.temperament ?? null } : null,
        features: featurizeState(state, seat),
        action: serializeAction(chosen),
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
function decidePendingChoice({ decide, state, seat, pilot, recordDecision, buildOffered, fallbackAction }) {
  // Pure pass-through when neither a pilot nor a recorder is engaged — the byte-identical
  // default. Skipping buildOffered() here keeps the default path allocation-free.
  if (typeof decide !== "function" && typeof recordDecision !== "function") return fallbackAction;
  const offered = buildOffered();
  return resolveDecideAction({ decide, state, offered, seat, pilot, fallbackAction, recordDecision });
}

/** Normalized legal-candidate actions for a PICK-ONE pendingChoice (tutor / clone / hand-
 *  discard / impulse-dig / sacrifice / discard): one action per real candidate id, plus an
 *  optional find-nothing/decline action when the choice permits it (tutor & clone — CR
 *  701.19f / a "you may" copy). The ids come straight from `pc.candidates`, so every offered
 *  action maps to a candidate the settler accepts; nothing is fabricated. */
function pendingPickActions(pc, { allowDecline = false } = {}) {
  const actions = (pc.candidates || []).map((c) => ({ kind: "pending-choice", choiceKind: pc.kind, candidateId: c.id }));
  if (allowDecline) actions.push({ kind: "pending-choice", choiceKind: pc.kind, candidateId: null });
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
 *   decide({ state, legalActions, seat, pilot }) -> action   (∈ legalActions)
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
 */
export function advanceUntilDecision(
  session,
  { archetype = null, onTurnStart = null, timePressure = null, decide = null, pilot = null, recordDecision = null } = {},
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
  // long game. The anti-loop latch below is the primary guard.
  const SAFETY_CAP = 50000;
  let current = session;
  let ticks = 0;

  // Turn-boundary state (opt-in observer + opt-in time-pressure clock). Starts at null
  // so the FIRST loop iteration fires for the opening turn, then once per subsequent
  // turn increment. Entirely inert when neither the observer nor time pressure is on.
  const observe = typeof onTurnStart === "function";
  let lastTurnBoundary = null;

  while (ticks < SAFETY_CAP) {
    ticks += 1;

    // Turn boundary — fires when state.turn first reaches a new value (turn-start,
    // before this turn's actions). Used for BOTH the opt-in observer snapshot AND the
    // opt-in time-pressure clock. `lastTurnBoundary` starts null so it triggers once
    // per turn, including the opening turn. Entirely inert when both are off.
    if (current.state && current.state.turn !== lastTurnBoundary) {
      lastTurnBoundary = current.state.turn;

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

    // SBA check before every priority window.
    current = recordOutcomeIfChanged(current);
    if (current.status !== "active") {
      return {
        session: current,
        decision: { kind: "game-over", reason: current.status },
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
      });
      if (dDecision.kind === "ask") {
        return { session: current, decision: dDecision };
      }
      // The pre-refactor default pick (byte-identical when no decide). The pluggable
      // decide may substitute another offered action; an out-of-set return falls back here.
      const dFallback = dDecision.action || dActions.find((a) => a.kind === "discover-to-hand") || dActions[0];
      const dAction = resolveDecideAction({
        decide, state: current.state, offered: dActions, seat: dc, pilot,
        fallbackAction: dFallback, recordDecision,
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
          decide, state: current.state, seat: choiceSeat, pilot, recordDecision,
          // WI-2 (CR 707.9): a MANDATORY clone (optional === false) is never offered the illegal
          // null/decline action — pilots can only pick a real copy target.
          buildOffered: () => pendingPickActions(pc, { allowDecline: pc.resume?.optional !== false }),
          fallbackAction: { kind: "pending-choice", choiceKind: pc.kind, candidateId: autoPickCloneCandidate(current.state, pc) },
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
        current = { ...current, state: settleScryChoice(current.state, (pc.cards || []).map((c) => c.id)) };
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
          decide, state: current.state, seat: choiceSeat, pilot, recordDecision,
          buildOffered: () => pendingYesNoActions(pc),
          fallbackAction: { kind: "pending-choice", choiceKind: pc.kind, value: true },
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
          decide, state: current.state, seat: choiceSeat, pilot, recordDecision,
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
          decide, state: current.state, seat: choiceSeat, pilot, recordDecision,
          buildOffered: () => pendingPickActions(pc),
          fallbackAction: { kind: "pending-choice", choiceKind: pc.kind, candidateId: autoPickHandDiscardCandidate(current.state, pc) },
        });
        current = { ...current, state: settleHandDiscardChoice(current.state, picked.candidateId) };
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
          decide, state: current.state, seat: choiceSeat, pilot, recordDecision,
          buildOffered: () => pendingPickActions(pc),
          fallbackAction: { kind: "pending-choice", choiceKind: pc.kind, candidateId: autoPickTutorCandidate(current.state, pc) },
        });
        current = { ...current, state: settleImpulseDigChoice(current.state, picked.candidateId) };
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
          decide, state: current.state, seat: choiceSeat, pilot, recordDecision,
          buildOffered: () => pendingPickActions(pc),
          fallbackAction: { kind: "pending-choice", choiceKind: pc.kind, candidateId: autoPickSacrificeCandidate(current.state, pc) },
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
          decide, state: current.state, seat: choiceSeat, pilot, recordDecision,
          buildOffered: () => pendingPickActions(pc),
          fallbackAction: { kind: "pending-choice", choiceKind: pc.kind, candidateId: autoPickDiscardCandidate(current.state, pc) },
        });
        current = { ...current, state: settleDiscardChoice(current.state, picked.candidateId) };
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
        current = { ...current, state: settleDivideChoice(current.state, autoPickDivideDistribution(current.state, pc)) };
        continue;
      }
      if (pc.kind === "distribute-counters") {
        if (pause) {
          return { session: current, decision: { kind: "distribute-counters", ...pc } };
        }
        current = { ...current, state: settleDistributeChoice(current.state, autoPickDistributeCounters(current.state, pc)) };
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
          decide, state: current.state, seat: choiceSeat, pilot, recordDecision,
          buildOffered: () => pendingYesNoActions(pc),
          fallbackAction: { kind: "pending-choice", choiceKind: pc.kind, value: autoPickSoftCounterPay(current.state, pc) },
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
          return { session: current, decision: { kind: "optional-mana-payment", ...pc, affordable } };
        }
        const picked = decidePendingChoice({
          decide, state: current.state, seat: choiceSeat, pilot, recordDecision,
          buildOffered: () => pendingYesNoActions(pc),
          fallbackAction: { kind: "pending-choice", choiceKind: pc.kind, value: autoPickOptionalManaPayment(current.state, pc) },
        });
        current = { ...current, state: settleOptionalManaPaymentChoice(current.state, picked.value) };
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
          decide, state: current.state, seat: choiceSeat, pilot, recordDecision,
          buildOffered: () => pendingYesNoActions(pc),
          fallbackAction: { kind: "pending-choice", choiceKind: pc.kind, value: autoPickOptionalSac(current.state, pc) },
        });
        current = { ...current, state: settleOptionalSacChoice(current.state, picked.value) };
        continue;
      }
      if (pc.kind === "optional-draw-discard") {
        if (pause) {
          return { session: current, decision: { kind: "optional-draw-discard", ...pc } };
        }
        const picked = decidePendingChoice({
          decide, state: current.state, seat: choiceSeat, pilot, recordDecision,
          buildOffered: () => pendingYesNoActions(pc),
          fallbackAction: { kind: "pending-choice", choiceKind: pc.kind, value: autoPickOptionalDrawDiscard(current.state, pc) },
        });
        current = { ...current, state: settleOptionalDrawDiscardChoice(current.state, picked.value) };
        continue;
      }
      // Tutor library search. A pilot may fetch a different legal candidate (or find nothing — CR
      // 701.19f); default = the auto-pick (highest-MV), byte-identical.
      //
      // WI-5 KNOWN SOFT SPOT (documented, not fixed): `allowDecline: true` here unconditionally offers a
      // "find nothing" action for EVERY tutor, including an unfiltered ("search your library for A CARD")
      // mandatory search. CR 701.19d requires a mandatory search to find a card IF one is available — the
      // engine can't currently tell "no legal candidates" (a true miss) apart from "candidates exist but
      // the picker declined" (an illegal pass on a mandatory search). pc.candidates is already the FULL
      // legal set at the moment the atom paused, so an empty array is the only case CR-honestly permits a
      // no-find; a non-empty candidates + decline on a NON-"you may" tutor is technically off-CR but
      // currently unenforced (the human picker and the AI/pilot decline path both allow it). Left as a
      // soft gap rather than removing the decline entirely, since some tutors ARE genuinely optional
      // ("you may search...") and share this same code path — pc doesn't yet carry an `optional` flag for
      // tutors the way clone-search does (see WI-2 in the recon).
      if (pc.kind === "tutor-search") {
        if (pause) {
          return { session: current, decision: { kind: "tutor-search", ...pc } };
        }
        const tutorPick = decidePendingChoice({
          decide, state: current.state, seat: choiceSeat, pilot, recordDecision,
          buildOffered: () => pendingPickActions(pc, { allowDecline: true }),
          fallbackAction: { kind: "pending-choice", choiceKind: pc.kind, candidateId: autoPickTutorCandidate(current.state, pc) },
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
          kind: "pending-choice-unhandled", choiceKind: pc.kind, controller: pc.controller ?? null,
        });
        current = { ...current, state: clearPendingChoice(loggedState) };
        return {
          session: current,
          decision: { kind: "engine-stuck", reason: `no driver branch for pendingChoice kind "${pc.kind}"` },
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
        console.warn(`[learn] turn limit (${MAX_TURNS}) reached at turn ${current.state.turn} — ending as a ${status}`);
      }
      return {
        session: { ...current, status, endedAt: new Date().toISOString() },
        decision: {
          kind: "game-over",
          reason: timeCfg ? "timeout" : "turn-limit",
          diagnostic: { turn: current.state.turn, phase: current.state.phase, step: current.state.step },
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
      const fallback = actions.find(a => declineKinds.has(a.kind)) || { kind: "pass-priority", playerId: actor };
      try {
        current = { ...current, state: dispatchAction(state, fallback) };
      } catch {
        return {
          session: current,
          decision: { kind: "engine-stuck", reason: "no legal action and no pass available" },
        };
      }
      continue;
    }

    // Pluggable decide: pick among the OFFERED legalActions. With no decide this is the
    // exact action makeDecision/pickAction chose (byte-identical); a pilot may substitute
    // another offered action, and an out-of-set / throwing return falls back to it. Also
    // records the full-trajectory row (when recordDecision is set) for THIS decision.
    const chosenAction = resolveDecideAction({
      decide, state, offered: actions, seat: actor, pilot,
      fallbackAction: decision.action, recordDecision,
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
    decision: { kind: "engine-stuck", reason: `safety cap (${SAFETY_CAP} ticks) hit` },
  };
}

// ─── User-choice application ─────────────────────────────────────────────────

/**
 * The user picked an option from a decision.options list. Validate
 * the choice against the legal actions, dispatch, log, then call
 * advanceUntilDecision so the next prompt is ready to render.
 *
 * Returns { session, decision } same shape as advanceUntilDecision.
 */
export function applyChoice(session, choice) {
  if (session.status !== "active") {
    return {
      session,
      decision: { kind: "game-over", reason: session.status },
    };
  }
  if (!session.state.priorityHolder) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: "No priority holder set" },
    };
  }

  const actor = session.state.priorityHolder;
  const actions = legalActionsForPlayer(session.state, actor);
  const matched = resolveChoice(actions, choice);
  if (!matched) {
    return {
      session,
      decision: { kind: "dispatch-error", reason: "Choice doesn't match any legal action", code: "INVALID_CHOICE" },
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

  return advanceUntilDecision(next);
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
export function continueFromArbiter(session) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  if (!session.state.pendingArbiter) {
    // Nothing pending (e.g. a double-submit) — just re-derive the next decision.
    return advanceUntilDecision(session);
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

  return advanceUntilDecision({
    ...session,
    state: logged,
    decisionLog: [...session.decisionLog, logEntry],
  });
}

/**
 * The player picked a card (or chose "find nothing") from a `tutor-search` decision.
 * Validates the pick against the pending candidates, applies the fetch + shuffle, resumes
 * the suspended effect program, then re-derives the next decision. `choice.cardId` is the
 * chosen library card id, or null/absent to find nothing (CR 701.19f). Returns
 * { session, decision } like advanceUntilDecision.
 */
export function applyTutorChoice(session, choice) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "tutor-search") {
    // Nothing pending (e.g. a double-submit) — just re-derive the next decision.
    return advanceUntilDecision(session);
  }
  const cardId = choice?.cardId ?? null;
  if (cardId !== null && !pc.candidates.some((c) => c.id === cardId)) {
    // An illegal/stale pick must NOT strand the game: the choice is still pending, so
    // re-surface the SAME picker (advanceUntilDecision re-derives it) instead of a
    // terminal dispatch-error the UI can't recover from.
    return advanceUntilDecision(session);
  }

  let newState;
  try {
    newState = settleTutorChoice(session.state, cardId);
  } catch (error) {
    return { session, decision: { kind: "dispatch-error", reason: error.message, code: error.code } };
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

  return advanceUntilDecision({
    ...session,
    state: newState,
    decisionLog: [...session.decisionLog, logEntry],
  });
}

/**
 * The player picked which creature to copy (or declined) from a `clone-search` decision (CR 707).
 * Validates the pick against the pending candidates, then enters the clone as that copy (or as
 * itself on decline/illegal), flushes its ETB triggers, and re-derives the next decision.
 * `choice.permId` is the chosen battlefield permanent id, or null/absent to decline a "you may"
 * clone. Returns { session, decision } like advanceUntilDecision.
 */
export function applyCloneChoice(session, choice) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "clone-search") {
    return advanceUntilDecision(session); // nothing pending (double-submit) — re-derive.
  }
  const permId = choice?.permId ?? null;
  if (permId !== null && !pc.candidates.some((c) => c.id === permId)) {
    return advanceUntilDecision(session); // illegal/stale pick → re-surface the same picker.
  }
  // WI-2 (CREED — CR 707.9): a MANDATORY clone cannot be declined — a null submit re-surfaces the
  // picker (the hand-discard null-reject pattern) instead of misplaying the copy as a 0/0.
  if (permId === null && pc.resume?.optional === false) {
    return advanceUntilDecision(session);
  }

  let newState;
  try {
    newState = settleCloneChoice(session.state, permId);
  } catch (error) {
    return { session, decision: { kind: "dispatch-error", reason: error.message, code: error.code } };
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

  return advanceUntilDecision({
    ...session,
    state: newState,
    decisionLog: [...session.decisionLog, logEntry],
  });
}

/**
 * The player resolved a `scry-surveil` decision (CR 701.22 / 701.25). `choice.keep` is the ordered
 * list of top-card ids to keep on top; everything else among the looked-at cards goes to the bottom
 * (scry) or the graveyard (surveil). Applies the reorder + resumes, then re-derives the next
 * decision. Returns { session, decision } like advanceUntilDecision.
 */
export function applyScryChoice(session, choice) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "scry-surveil") {
    return advanceUntilDecision(session); // nothing pending (double-submit) — re-derive.
  }
  // Keep only ids that are actually among the looked-at cards, each at most once (defensive
  // against a stale/duplicate-id UI submit — keeps the library mutation + the log count honest).
  const valid = new Set((pc.cards || []).map((c) => c.id));
  const keep = [...new Set((Array.isArray(choice?.keep) ? choice.keep : []).filter((id) => valid.has(id)))];

  let newState;
  try {
    newState = settleScryChoice(session.state, keep);
  } catch (error) {
    return { session, decision: { kind: "dispatch-error", reason: error.message, code: error.code } };
  }

  const logEntry = {
    ts: Date.now(),
    turn: session.state.turn,
    phase: session.state.phase,
    step: session.state.step,
    actor: "user",
    action: { kind: "scry-choice", mode: pc.mode, kept: keep.length, looked: (pc.cards || []).length },
    auto: false,
    reasoning: "user-chose-scry",
  };

  return advanceUntilDecision({
    ...session,
    state: newState,
    decisionLog: [...session.decisionLog, logEntry],
  });
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
export function applyDivideChoice(session, choice) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "divide-damage") {
    return advanceUntilDecision(session); // nothing pending (double-submit) — re-derive.
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
  }
  let newState;
  try {
    newState = settleDivideChoice(session.state, distribution);
  } catch (error) {
    return { session, decision: { kind: "dispatch-error", reason: error.message, code: error.code } };
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
  return advanceUntilDecision({ ...session, state: newState, decisionLog: [...session.decisionLog, logEntry] });
}

/**
 * ===== DISTRIBUTE ===== — the player assigned a distribute-counters division (The Earth Crystal).
 * `choice.distribution` is `[{ id, type, amount }]`; resolveDistributeChoice validates it against the
 * candidates + caps the running sum at pc.amount. Same WI-5 full-assignment guard: a short distribution
 * re-surfaces the picker (CR 601.2d — the whole amount must be assigned). Mirrors applyDivideChoice.
 */
export function applyDistributeChoice(session, choice) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "distribute-counters") {
    return advanceUntilDecision(session); // nothing pending (double-submit) — re-derive.
  }
  const distribution = Array.isArray(choice?.distribution) ? choice.distribution : [];
  if ((pc.candidates || []).length > 0) {
    const validIds = new Set(pc.candidates.map((c) => c.id));
    const cappedSum = distribution.reduce((spent, d) => {
      if (!validIds.has(d?.id)) return spent;
      return spent + Math.max(0, Math.min(d.amount || 0, (pc.amount || 0) - spent));
    }, 0);
    if (cappedSum < (pc.amount || 0)) {
      return { session, decision: { kind: "distribute-counters", ...pc } }; // under-assigned — re-surface the picker
    }
  }
  let newState;
  try {
    newState = settleDistributeChoice(session.state, distribution);
  } catch (error) {
    return { session, decision: { kind: "dispatch-error", reason: error.message, code: error.code } };
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
  return advanceUntilDecision({ ...session, state: newState, decisionLog: [...session.decisionLog, logEntry] });
}

/**
 * ===== SOFT-CNT ===== — the player (whose spell is under a soft counter) chose to pay {N} or not.
 * `choice.pay` is the yes/no. resolveSoftCounterChoice charges the mana + saves the spell (or counters it
 * if declined / unaffordable — payGenericMana never fabricates mana), then resumes + re-derives. A
 * double-submit (nothing pending) re-derives.
 */
export function applySoftCounterChoice(session, choice) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "soft-counter") {
    return advanceUntilDecision(session); // nothing pending (double-submit) — re-derive.
  }
  const pay = choice?.pay === true || choice === true;
  let newState;
  try {
    newState = settleSoftCounterChoice(session.state, pay);
  } catch (error) {
    return { session, decision: { kind: "dispatch-error", reason: error.message, code: error.code } };
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
  return advanceUntilDecision({ ...session, state: newState, decisionLog: [...session.decisionLog, logEntry] });
}

/**
 * ===== OPTIONAL-MANA-PAYMENT ===== (CR 603.7c) — the player chose to pay {cost} (and run the payoff) or not,
 * for a "you may pay {cost}. If you do, <effect>" (Lifecrafter's Bestiary / Mind's Eye / …). `choice.pay` is
 * the yes/no. resolveOptionalManaPaymentChoice charges the mana + runs the payoff (or skips it if declined /
 * unaffordable — payManaCost never fabricates mana), then resumes + re-derives. A double-submit (nothing
 * pending) re-derives. Mirrors applySoftCounterChoice.
 */
export function applyOptionalManaPaymentChoice(session, choice) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "optional-mana-payment") {
    return advanceUntilDecision(session); // nothing pending (double-submit) — re-derive.
  }
  const pay = choice?.pay === true || choice === true;
  let newState;
  try {
    newState = settleOptionalManaPaymentChoice(session.state, pay);
  } catch (error) {
    return { session, decision: { kind: "dispatch-error", reason: error.message, code: error.code } };
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
  return advanceUntilDecision({ ...session, state: newState, decisionLog: [...session.decisionLog, logEntry] });
}

/**
 * ===== REFLEXIVE-SAC-BY-SUBTYPE ===== (CR 603.7c) — the player chose to sacrifice a matching-subtype permanent
 * (and run the payoff) or not, for a "you may sacrifice a <subtype>. If you do, <effect>" (The Goose Mother /
 * Wedding Security). `choice.sac` is the yes/no. resolveOptionalSacChoice pitches one matching permanent + runs
 * the payoff (or skips it if declined / none available — sacrificeCreatureEffect never fabricates a sac), then
 * resumes + re-derives. A double-submit (nothing pending) re-derives. Mirrors applyOptionalManaPaymentChoice.
 */
export function applyOptionalSacChoice(session, choice) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "optional-sac-payment") {
    return advanceUntilDecision(session); // nothing pending (double-submit) — re-derive.
  }
  const sac = choice?.sac === true || choice === true;
  let newState;
  try {
    newState = settleOptionalSacChoice(session.state, sac);
  } catch (error) {
    return { session, decision: { kind: "dispatch-error", reason: error.message, code: error.code } };
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
  return advanceUntilDecision({ ...session, state: newState, decisionLog: [...session.decisionLog, logEntry] });
}

/**
 * ===== OPTIONAL DRAW-THEN-DISCARD ===== — the player chose to draw (and then discard) or not, for a "you may
 * draw a card. If you do, discard a card." `choice.draw` is the yes/no. resolveOptionalDrawDiscardChoice runs the
 * [draw, discard] on yes (or nothing on decline), then resumes + re-derives. Mirrors applyOptionalSacChoice.
 */
export function applyOptionalDrawDiscardChoice(session, choice) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "optional-draw-discard") {
    return advanceUntilDecision(session); // nothing pending (double-submit) — re-derive.
  }
  const doDraw = choice?.draw === true || choice === true;
  let newState;
  try {
    newState = settleOptionalDrawDiscardChoice(session.state, doDraw);
  } catch (error) {
    return { session, decision: { kind: "dispatch-error", reason: error.message, code: error.code } };
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
  return advanceUntilDecision({ ...session, state: newState, decisionLog: [...session.decisionLog, logEntry] });
}

/**
 * The player resolved an `optional-effect` decision ("you may <effect>", α2). `choice.take` is the
 * yes/no. Runs-or-skips the paused atom, resumes the program, then re-derives the next decision.
 * Returns { session, decision } like advanceUntilDecision.
 */
export function applyOptionalChoice(session, choice) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "optional-effect") {
    return advanceUntilDecision(session); // nothing pending (double-submit) — re-derive.
  }
  const take = choice?.take === true || choice === true;

  let newState;
  try {
    newState = settleOptionalChoice(session.state, take);
  } catch (error) {
    return { session, decision: { kind: "dispatch-error", reason: error.message, code: error.code } };
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

  return advanceUntilDecision({
    ...session,
    state: newState,
    decisionLog: [...session.decisionLog, logEntry],
  });
}

/**
 * The player answered a `commander-return` yes/no (CR 903.9): `choice.return === true` sends the commander
 * back to the command zone (taxed recast available), false leaves it in the graveyard/exile. Mirrors
 * applyOptionalChoice — settle, log, re-derive the next decision.
 */
export function applyCommanderReturnChoice(session, choice) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "commander-return") {
    return advanceUntilDecision(session); // nothing pending (double-submit) — re-derive.
  }
  const doReturn = choice?.return === true || choice === true;

  let newState;
  try {
    newState = settleCommanderReturnChoice(session.state, doReturn);
  } catch (error) {
    return { session, decision: { kind: "dispatch-error", reason: error.message, code: error.code } };
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

  return advanceUntilDecision({
    ...session,
    state: newState,
    decisionLog: [...session.decisionLog, logEntry],
  });
}

/**
 * The player picked which card to strip from a `hand-discard` decision (δ-1b — Duress / Thoughtseize).
 * Validates the pick against the pending candidates (the targeted opponent's revealed, filtered hand),
 * moves it to their graveyard, resumes the caster's riders, then re-derives the next decision.
 * `choice.cardId` is the chosen opponent-hand card id. Returns { session, decision } like the others.
 */
export function applyHandDiscardChoice(session, choice) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "hand-discard") {
    return advanceUntilDecision(session); // nothing pending (double-submit) — re-derive.
  }
  const cardId = choice?.cardId ?? null;
  if (cardId === null || !pc.candidates.some((c) => c.id === cardId)) {
    return advanceUntilDecision(session); // a hand-discard always strips one (no "decline") → illegal/stale pick re-surfaces the picker.
  }

  let newState;
  try {
    newState = settleHandDiscardChoice(session.state, cardId);
  } catch (error) {
    return { session, decision: { kind: "dispatch-error", reason: error.message, code: error.code } };
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

  return advanceUntilDecision({
    ...session,
    state: newState,
    decisionLog: [...session.decisionLog, logEntry],
  });
}

/**
 * The player picked which looked-at card to keep from an `impulse-dig` decision (δ-2). Validates the
 * pick against the revealed candidates, keeps it (→ hand) + disposes the rest, resumes the program,
 * then re-derives the next decision. `choice.cardId` is the chosen library card id. A null/illegal pick
 * re-surfaces the picker (a dig always keeps one when ≥1 was revealed).
 */
export function applyImpulseDigChoice(session, choice) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "impulse-dig") {
    return advanceUntilDecision(session); // nothing pending (double-submit) — re-derive.
  }
  const cardId = choice?.cardId ?? null;
  if (cardId === null || !pc.candidates.some((c) => c.id === cardId)) {
    return advanceUntilDecision(session); // illegal/stale pick → re-surface the same picker.
  }

  let newState;
  try {
    newState = settleImpulseDigChoice(session.state, cardId);
  } catch (error) {
    return { session, decision: { kind: "dispatch-error", reason: error.message, code: error.code } };
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

  return advanceUntilDecision({
    ...session,
    state: newState,
    decisionLog: [...session.decisionLog, logEntry],
  });
}

/**
 * ===== EDICTS ===== — the player picked which creature to sacrifice from a `sacrifice-choice` decision
 * (Diabolic Edict / Cruel Edict / Geth's Verdict). This fires when the HUMAN is the sacrificing player
 * (the edict's target). Validates the pick against the offered creatures, sacrifices it (dies triggers
 * fire), resumes the caster's riders, then re-derives the next decision. `choice.cardId` is the chosen
 * creature's permanent id. A null/illegal pick re-surfaces the picker (an edict always sacs one when ≥2
 * were offered — no decline). Returns { session, decision } like the others.
 */
export function applySacrificeChoice(session, choice) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "sacrifice-choice") {
    return advanceUntilDecision(session); // nothing pending (double-submit) — re-derive.
  }
  const cardId = choice?.cardId ?? null;
  if (cardId === null || !pc.candidates.some((c) => c.id === cardId)) {
    return advanceUntilDecision(session); // illegal/stale pick → re-surface the same picker.
  }

  let newState;
  try {
    newState = settleSacrificeChoice(session.state, cardId);
  } catch (error) {
    return { session, decision: { kind: "dispatch-error", reason: error.message, code: error.code } };
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

  return advanceUntilDecision({
    ...session,
    state: newState,
    decisionLog: [...session.decisionLog, logEntry],
  });
}

/**
 * ===== EACH-PLAYER ===== discard (EP-2) — the player picked which card to pitch from a `discard` decision
 * (Mind Rot / Fugue / Delirium Skeins). This fires when the HUMAN is a discarder (CR 701.8 — the discarding
 * player chooses). Validates the pick against the offered hand, discards it, advances the chain (more cards
 * / the next discarder, or resume the caster's riders), then re-derives the next decision. `choice.cardId`
 * is the chosen hand card id. A null/illegal pick re-surfaces the picker (a discard always pitches one when
 * a real choice exists — no decline). Returns { session, decision } like the others.
 */
export function applyDiscardChoice(session, choice) {
  if (session.status !== "active") {
    return { session, decision: { kind: "game-over", reason: session.status } };
  }
  const pc = session.state.pendingChoice;
  if (!pc || pc.kind !== "discard") {
    return advanceUntilDecision(session); // nothing pending (double-submit) — re-derive.
  }
  const cardId = choice?.cardId ?? null;
  if (cardId === null || !pc.candidates.some((c) => c.id === cardId)) {
    return advanceUntilDecision(session); // illegal/stale pick → re-surface the same picker.
  }

  let newState;
  try {
    newState = settleDiscardChoice(session.state, cardId);
  } catch (error) {
    return { session, decision: { kind: "dispatch-error", reason: error.message, code: error.code } };
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

  return advanceUntilDecision({
    ...session,
    state: newState,
    decisionLog: [...session.decisionLog, logEntry],
  });
}

/**
 * Dispatch an interactive resolution-time choice (state.pendingChoice) to the right handler by
 * its kind — so the single /api/learn/choose route serves the tutor search, the clone copy-pick,
 * scry/surveil, the optional yes/no, the hand-discard pick, the impulse-dig pick, the edict
 * sacrifice pick, and the each/target-player discard pick. (Named apart from the decision-gate
 * `applyChoice`, which resolves a player ACTION, not a pendingChoice.)
 */
export function applyPendingChoice(session, choice) {
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
    return advanceUntilDecision(session);
  }
  if (kind === "clone-search") return applyCloneChoice(session, choice);
  if (kind === "scry-surveil") return applyScryChoice(session, choice);
  if (kind === "optional-effect") return applyOptionalChoice(session, choice);
  if (kind === "commander-return") return applyCommanderReturnChoice(session, choice);
  if (kind === "hand-discard") return applyHandDiscardChoice(session, choice);
  if (kind === "impulse-dig") return applyImpulseDigChoice(session, choice);
  if (kind === "sacrifice-choice") return applySacrificeChoice(session, choice);
  if (kind === "discard") return applyDiscardChoice(session, choice);
  if (kind === "divide-damage") return applyDivideChoice(session, choice);
  if (kind === "distribute-counters") return applyDistributeChoice(session, choice);
  if (kind === "soft-counter") return applySoftCounterChoice(session, choice);
  if (kind === "optional-mana-payment") return applyOptionalManaPaymentChoice(session, choice);
  if (kind === "optional-sac-payment") return applyOptionalSacChoice(session, choice);
  if (kind === "optional-draw-discard") return applyOptionalDrawDiscardChoice(session, choice);
  if (kind === "tutor-search") return applyTutorChoice(session, choice);
  // WI-4 FAILSAFE — no pendingChoice at all (nothing to answer) re-derives, byte-identical to every
  // apply* function's own "double-submit" guard. A REAL unhandled kind never reaches applyTutorChoice's
  // settler silently — advanceUntilDecision re-derives and its own WI-4 failsafe (the pendingChoice
  // branch's unguarded tail) logs + clears + reports engine-stuck honestly instead of misinterpreting
  // the submitted choice as a tutor pick.
  return advanceUntilDecision(session);
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
  return session?.status !== "active";
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
  const interesting = log.filter((entry) => !entry.auto || !NOISY_AUTO_ACTION_KINDS.has(entry.action?.kind));
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
