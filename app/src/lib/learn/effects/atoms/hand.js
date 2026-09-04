/**
 * effects/atoms/hand.js — hand-disruption atoms (discard, discard-chosen).
 */

import { handCardMatches } from "../../spellEffects.js";
import { checkDiscardTriggers } from "../../triggers.js"; // TRIG-DISCARD (CR 701.9a) — fired at every discard site
import { logEvent, opponentsOf, moveCardToZone, drawCards } from "../../gameState.js";
import { setPendingHandDiscardChoice, setPendingDiscardChoice, setPendingImprintChoice, setPendingHandToLibraryTopChoice } from "../../pendingChoice.js";
import { resolveScaledAmount } from "./shared.js";
import { NUM_WORD } from "../parseHelpers.js"; // seam batch 23: shared number-word map (leaf, cycle-free) for the discard family
import { nextRandomInt } from "../../seedMath.js"; // RD-1: THE canonical seeded uniform draw for random discard (leaf; no cycle)

/**
 * δ-1b targeted hand disruption (CR 701.8 discard) — Duress / Thoughtseize / Inquisition / Coercion /
 * Despise / Divest / Harsh Scrutiny. The spell targeted an OPPONENT at cast (a player target, chosen
 * WITHOUT seeing their hand — the faithful Duress flow). NOW it resolves: REVEAL that opponent's hand,
 * keep only the cards matching the atom's handFilter, and set a `pendingChoice` for the CASTER to pick
 * which one to discard (the driver surfaces a picker for the human, auto-picks the best card for the AI
 * / Expert — mirroring the tutor/scry/clone pause-or-autopick). The chosen card moves from the OPPONENT'S
 * hand to their graveyard in resolveHandDiscardChoice. Modeling the card pick at resolution (not cast)
 * is what makes 4P faithful: the caster commits to ONE opponent first and only ever sees THAT hand — no
 * cross-opponent cherry-pick, no leak of the other opponents' hands. An empty/no-match revealed hand is a
 * clean no-op (revealed nothing to take, CR 701.8 — no pause). Eliminated-target guard: a target that
 * left the game is skipped.
 */
export function applyDiscardChosen(state, atom, ctx) {
  const victim = (ctx.targets || []).find((t) => t.type === "player");
  if (!victim || !state.players[victim.id]) {
    return logEvent(state, { kind: "spell-effect", effect: "discard-chosen", controller: ctx.controller, victim: victim?.id ?? null, candidates: 0 });
  }
  const hf = atom.handFilter || {};
  const candidates = (state.players[victim.id].hand || [])
    .filter((c) => !c.token && handCardMatches(c, hf))
    .map((c) => ({ id: c.id, name: c.name }));
  // Revealed but nothing the spell can take → a clean no-op (no picker, the program continues).
  if (candidates.length === 0) {
    return logEvent(state, { kind: "spell-effect", effect: "discard-chosen", controller: ctx.controller, victim: victim.id, candidates: 0 });
  }
  // Pause for the caster's pick (driver surfaces a picker / auto-picks). runProgram attaches the resume.
  return setPendingHandDiscardChoice(state, { controller: ctx.controller, victim: victim.id, candidates, sourceName: ctx.cardName });
}

/**
 * IMPRINT (CR 207.2c) — "Imprint — When this artifact enters, you may exile a <filtered> card from your
 * hand." (Chrome Mox, Semblance Anvil, Isochron Scepter, Soul Foundry, Spellbinder, Prototype Portal).
 * Pauses for the CONTROLLER's pick from their OWN hand; resolveImprintChoice exiles it and STAMPS it onto
 * the imprinting permanent, which is what every imprint payoff reads.
 *
 * `ctx.sourceId` is the imprinting permanent and is REQUIRED: with no source there is nothing to stamp, so
 * pausing would strand the player on a choice that could not pay off. That case is a clean no-op.
 *
 * An empty/no-match hand is likewise a clean no-op — no picker, the program continues, and the permanent
 * stays UN-imprinted. That is the correct end state, not a failure: an un-imprinted Chrome Mox produces
 * nothing, and the mana source is gated on the stamp precisely so it can never fabricate a color.
 */
export function applyImprint(state, atom, ctx) {
  const hf = atom.handFilter || {};
  const noop = (reason) => logEvent(state, { kind: "spell-effect", effect: "imprint", controller: ctx.controller, sourceName: ctx.cardName, imprinted: null, reason });
  if (!ctx.sourceId) return noop("no-source");
  const candidates = (state.players?.[ctx.controller]?.hand || [])
    .filter((c) => !c.token && handCardMatches(c, hf))
    .map((c) => ({ id: c.id, name: c.name }));
  if (candidates.length === 0) return noop("no-legal-card");
  return setPendingImprintChoice(state, { controller: ctx.controller, candidates, sourceId: ctx.sourceId, sourceName: ctx.cardName, filterLabel: atom.filterLabel || null });
}

// ===== EACH-PLAYER ===== discard (EP-2)
/**
 * Walk the discard CHAIN (CR 701.8 — the DISCARDING player chooses which cards). `queue` is the remaining
 * discarders, head-first, each `{ playerId, remaining }`. For each in turn:
 *   - eliminated / empty hand / nothing left to discard → drop and move on (no-op).
 *   - hand ≤ remaining → a FORCED whole-hand discard (no real choice): pitch every card inline, move on.
 *   - hand > remaining → a REAL choice: pause via setPendingDiscardChoice for THIS discarder (the driver
 *     pauses a human, auto-discards an AI's cheapest), carrying the current queue so resolveDiscardChoice
 *     can decrement + re-enter. Returns the paused state immediately.
 * When the queue empties with no pause, returns the advanced state (the program continues / resumes).
 * Hidden-info safe: the discarder is the chooser of their own hand. Shared by applyDiscard (the atom's
 * first entry) and runProgram.resolveDiscardChoice (each subsequent pick), so ONE implementation drives
 * both the inline and the interactive paths.
 */
export function advanceDiscardChain(state, { queue, sourceName = null }) {
  let next = state;
  let q = queue || [];
  while (q.length) {
    const head = q[0];
    const player = next.players?.[head.playerId];
    if (!player) { q = q.slice(1); continue; } // discarder left the game (CR 800.4a) → skip
    const hand = (player.hand || []).filter((c) => !c.token);
    if (head.remaining <= 0 || hand.length === 0) { q = q.slice(1); continue; }
    if (hand.length <= head.remaining) {
      // Forced — the whole hand goes (no card left to keep, so no decision). Pitch inline, no pause.
      for (const c of hand) {
        next = moveCardToZone(next, { playerId: head.playerId, fromZone: "hand", toZone: "graveyard", cardId: c.id });
      }
      next = logEvent(next, { kind: "spell-effect", effect: "discard", controller: head.playerId, discarded: hand.length, forced: true });
      next = checkDiscardTriggers(next, head.playerId, hand.length);   // one event per card (CR 603.2)
      q = q.slice(1);
      continue;
    }
    // A real choice (hand > remaining): pause for this discarder's single-card pick.
    const candidates = hand.map((c) => ({ id: c.id, name: c.name }));
    return setPendingDiscardChoice(next, { controller: head.playerId, remaining: head.remaining, candidates, queue: q, sourceName });
  }
  return next;
}

/**
 * ===== RANDOM DISCARD ===== (RD-1, CR 701.9b — "Some effects... require a random discard") — "discards N
 * cards at random" (Hymn to Tourach / Specter's Wail / Mind Knives; Hypnotic Specter's combat trigger; the
 * self-discard "discard a card at random"). CR 701.9b removes the discarding player's CHOICE: the engine
 * picks uniformly at random, so there is NO pause for ANY seat (human or AI) — the card is chosen by the
 * SEEDED primitive (nextRandomInt over state.rngSeed) and pitched inline. Distinct from the chooser chain
 * (advanceDiscardChain) precisely because there's no decision to surface.
 *
 * Per discarder, in the given (APNAP-stable) order: draw min(amount, |non-token hand|) DISTINCT cards by
 * repeatedly picking a uniform index over the CURRENT hand and moving it hand→graveyard (CR 701.9a). Without
 * replacement (each pick shrinks the hand) — the correct reading of "N cards at random" (N distinct cards,
 * each equally likely). An empty hand is a clean no-op (nothing to pitch, no seed consumed). HIDDEN-INFO
 * HONEST: the pick reveals NOTHING about the rest of the hand — only the discarded card is named, and it's
 * public the moment it reaches the graveyard (a public zone, CR 400.2); no hand-reveal event is emitted
 * (contrast the δ-1b Duress reveal). The seed threads through EVERY pick (nextRandomInt returns the advanced
 * state), so the sequence is serialize-stable: a game saved mid-discard restores the identical picks.
 */
export function pitchRandomDiscard(state, { discarders, amount, sourceName = null }) {
  let next = state;
  for (const pid of discarders) {
    let remaining = amount;
    while (remaining > 0) {
      const hand = (next.players?.[pid]?.hand || []).filter((c) => !c.token);
      if (hand.length === 0) break; // empty / exhausted hand → discard as many as possible, no seed consumed
      const { value: idx, state: advanced } = nextRandomInt(next, hand.length);
      next = advanced;
      const chosen = hand[idx];
      next = moveCardToZone(next, { playerId: pid, fromZone: "hand", toZone: "graveyard", cardId: chosen.id });
      // Log names ONLY the discarded card (public in the graveyard) — never the rest of the hand.
      next = logEvent(next, { kind: "spell-effect", effect: "discard", controller: pid, discarded: 1, atRandom: true, card: chosen.name, sourceName });
      next = checkDiscardTriggers(next, pid, 1);   // a RANDOM discard is still a discard (CR 701.9b)
      remaining -= 1;
    }
  }
  return next;
}

/**
 * ===== EACH-PLAYER ===== discard (EP-2) — "Target player discards N cards" (Mind Rot / Fugue — the
 * VICTIM chooses) and "Each player discards N cards" (Delirium Skeins — every player chooses their own).
 * CR 701.8: the discarding player picks the cards, so this routes through the resolution-time pending-
 * choice CHAIN (advanceDiscardChain) — a human discarder gets a picker, an AI discards its cheapest, and
 * N>1 / multiple discarders resolve as a sequence of single-card picks. who:"target" reads the player
 * target(s) chosen at cast; who:"eachPlayer" enumerates every player, the controller first (APNAP-stable,
 * deterministic). A zero/empty amount or no live target is a clean logged no-op.
 */
export function applyDiscard(state, atom, ctx) {
  // DISCARD-HAND — "discards their hand" / "discard your hand" (atom.all): the WHOLE hand goes, no choice.
  // Routed through the SAME chain with remaining = Infinity, so advanceDiscardChain's "hand.length <= remaining"
  // branch pitches every card inline (no pause — there's nothing to keep). The fixed-amount guard is skipped.
  // resolveScaledAmount handles the fixed-N / X-spell paths (effectiveAmount) AND the dynamic
  // countContext path (CDMG-DISCARD-SCALED — "that player discards that many cards" = ctx.combat-
  // DamageAmount, floored at 0 / clean no-op when absent). The atom.all whole-hand discard skips it.
  const amount = atom.all ? Infinity : resolveScaledAmount(state, atom, ctx);
  if (!atom.all && (!Number.isFinite(amount) || amount <= 0)) {
    return logEvent(state, { kind: "spell-effect", effect: "discard", who: atom.who || "target", amount: 0 });
  }
  let discarders;
  if (atom.who === "controller") {
    // LOOT-1 — the caster discards (draw-then-discard loot). A single discarder; the chain pauses for the
    // human to pick which cards / auto-discards the AI's cheapest, exactly like the each/target forms.
    discarders = state.players?.[ctx.controller] ? [ctx.controller] : [];
  } else if (atom.who === "eachPlayer") {
    const seen = new Set();
    discarders = [ctx.controller, ...opponentsOf(state, ctx.controller)]
      .filter((pid) => state.players?.[pid] && !seen.has(pid) && seen.add(pid));
  } else if (atom.who === "eachOpponent") {
    discarders = opponentsOf(state, ctx.controller).filter((pid) => state.players?.[pid]);
  } else if (atom.who === "damagedPlayer") {
    // CDMG-DISCARD (Chilling Apparition / Blazing Specter / Dimir Cutpurse) — the player the source just dealt
    // combat damage to (ctx.damagedPlayerId, carried by checkCombatDamageTriggers, the SAME referent the mill /
    // rad / token-factory damagedPlayer resolvers read). Absent / eliminated referent (a spell, a non-combat
    // trigger, a player who left the game) → discard nobody (a clean logged no-op, never a fabrication — mirrors
    // applyMill's damagedPlayer guard). The discarder chooses their own card via the chain (CR 701.8).
    const pid = ctx.damagedPlayerId;
    discarders = pid && state.players?.[pid] ? [pid] : [];
  } else if (atom.who === "upkeepPlayer") {
    // UPKEEP-PLAYER DISCARD (BLITZ TR-2 — Necrogen Mists "At the beginning of each player's upkeep, that
    // player discards a card"; Bottomless Pit's at-random twin): the player whose upkeep it is
    // (ctx.upkeepPlayerId, threaded by checkStepTriggers at every upkeep-step entry). Absent / eliminated
    // referent (a spell, a non-upkeep event, a player who left the game) → discard nobody (a clean logged
    // no-op, never a fabrication — the exact damagedPlayer mirror). The discarder chooses (CR 701.9b).
    const pid = ctx.upkeepPlayerId;
    discarders = pid && state.players?.[pid] ? [pid] : [];
  } else if (atom.who === "defendingPlayer") {
    // DEFENDING-PLAYER DISCARD (DP-DISC — Abyssal Nightstalker / Alley Grifters / Corrupt Official): the
    // player being attacked, ctx.defenderId (threaded by checkAttackTriggers on attacks/attacksAlone and
    // checkBlockTriggers on becomesBlocked — the SAME referent the defendingPlayer edict and life-loss
    // resolvers read). Absent / eliminated referent → discard nobody: the exact damagedPlayer and
    // upkeepPlayer mirror, a clean logged no-op rather than a fabricated discard. The discarder chooses
    // their own card via the chain (CR 701.9b).
    const pid = ctx.defenderId;
    discarders = pid && state.players?.[pid] ? [pid] : [];
  } else {
    discarders = (ctx.targets || [])
      .filter((t) => t.type === "player" && state.players?.[t.id])
      .map((t) => t.id);
  }
  if (discarders.length === 0) {
    // WINDFALL — no discarders → the greatest-discarded count is 0 (a clean no-op, never a fabricated draw).
    const s0 = atom.recordMaxDiscarded ? { ...state, maxDiscardedThisWay: 0 } : state;
    return logEvent(s0, { kind: "spell-effect", effect: "discard", who: atom.who || "target", amount, discarders: 0 });
  }
  // RANDOM DISCARD (RD-1, CR 701.9b) — no chooser: pitch uniformly at random inline (no pause for any seat),
  // threading the seeded primitive. `atom.all` never combines with atRandom (no printed "discard your hand at
  // random"), so `amount` here is the resolved fixed/spelled count. Handled before the chooser chain.
  if (atom.atRandom) {
    return pitchRandomDiscard(state, { discarders, amount, sourceName: ctx.cardName || null });
  }
  // WINDFALL (record-max) — "then draws cards equal to the GREATEST number of cards a player discarded this way"
  // (CR 118.10): a following draw atom reads state.maxDiscardedThisWay via amountCount:{kind:"maxDiscardedThisWay"}.
  // This whole-hand discard (atom.all) pitches EVERY player's entire non-token hand with NO choice (advance-
  // DiscardChain's forced-inline branch — remaining = Infinity — never pauses), so each discarder's discarded
  // count IS its current non-token hand size, known deterministically HERE before the pitch. Stamp the greatest
  // over the discarders (0 for an all-empty-hands board — never a fabricated count) BEFORE running the chain, so
  // the value is present for the draw regardless of the chain's move-order. Mirrors Yuriko's revealedCardMV /
  // the dice-roll diceResult inter-atom state channel (a plain number → serialize-safe). Only set on the
  // recordMaxDiscarded form (Windfall); every other discard is byte-identical.
  let next = state;
  if (atom.recordMaxDiscarded) {
    let max = 0;
    for (const pid of discarders) {
      const n = (state.players?.[pid]?.hand || []).filter((c) => !c.token).length;
      if (n > max) max = n;
    }
    next = { ...state, maxDiscardedThisWay: max };
  }
  const queue = discarders.map((pid) => ({ playerId: pid, remaining: amount }));
  return advanceDiscardChain(next, { queue, sourceName: ctx.cardName || null });
}

/**
 * DISCARD clause parser — migrated from parseExtendedAtom (seam batch 23 / Wave C). The full who-scoped discard
 * family, original first-match order: target player (who:"target", targetType:"player") / each player
 * (who:"eachPlayer") / each opponent (who:"eachOpponent") / controller ("[you] discard N cards"). Numeric/spelled
 * N only — "at random" / "X" / "their hand" / "half" / any trailing rider fails the `$` anchor → low → Arbiter
 * (the victim chooses, CR 701.8 — the resolver walks the discard chain). Pure; uses the NUM_WORD leaf. Registered
 * via registerClauseParser in parser.js.
 */
/**
 * ===== HAND→LIBRARY-TOP ===== (the Brainstorm put-back — "Draw three cards, then put two cards
 * from your hand on top of your library in any order."): the controller returns N chosen cards
 * from hand to the TOP of their library. NOT a discard (no graveyard, no discard triggers). A
 * hand of ≤ N is forced (every card goes back, no decision); otherwise the chain pauses for one
 * pick per settle (kind "hand-to-library-top"), each settled card placed on top at that moment —
 * later picks stack above earlier ones, so the player controls the final order pick by pick.
 */
export function applyHandToLibraryTop(state, atom, ctx) {
  const amount = atom.amount || 0;
  const pid = ctx.controller;
  const player = state.players?.[pid];
  if (!player || amount <= 0) return state;
  return advanceHandToLibraryTopChain(state, { playerId: pid, remaining: amount, sourceName: ctx.cardName || null });
}

/** One implementation drives the inline (forced) and interactive paths — the discard-chain shape. */
export function advanceHandToLibraryTopChain(state, { playerId, remaining, sourceName = null }) {
  let next = state;
  const player = next.players?.[playerId];
  if (!player) return next; // owner left the game (CR 800.4a) — nothing to place
  const hand = (player.hand || []).filter((c) => !c.token);
  if (remaining <= 0 || hand.length === 0) return next;
  if (hand.length <= remaining) {
    // Forced — the whole hand goes back (no card left to keep, so no decision). Top placement in
    // hand order: each successive card goes on top, so the LAST hand card ends up topmost.
    for (const c of hand) {
      next = moveCardToZone(next, { playerId, fromZone: "hand", toZone: "library", cardId: c.id, toTop: true });
    }
    return logEvent(next, { kind: "spell-effect", effect: "hand-to-library-top", controller: playerId, placed: hand.length, forced: true, sourceName });
  }
  const candidates = hand.map((c) => ({ id: c.id, name: c.name }));
  return setPendingHandToLibraryTopChoice(next, { controller: playerId, remaining, candidates, sourceName });
}

export function discardClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  // ===== HAND→LIBRARY-TOP ===== "put N cards from your hand on top of your library[ in any order]"
  // (Brainstorm's second sentence; the leading "then" is peeled by the connective handling upstream
  // or matched here). `$`-anchored: a different destination ("on the bottom"), another owner's hand,
  // or any rider fails → low → Arbiter (safe FN).
  {
    const pm = t.match(/^(?:then )?put (a|one|two|three|four|five) cards? from your hand on top of your library(?: in any order)?$/);
    if (pm) return { op: "hand-to-library-top", amount: NUM_WORD[pm[1]] ?? parseInt(pm[1], 10), targetType: null };
  }
  // ===== RANDOM DISCARD (RD-1, CR 701.9b) ===== — the SAME who-scoped family, but "at random" removes the
  // chooser: the resolver picks uniformly via the seeded primitive (atom.atRandom), no pause. Whole-clause
  // anchored, FIXED numeric/spelled N only — an "X cards at random" (Mind Twist / Mind Shatter) or any rider
  // ("...unless they pay {1}" Flay; "...then discards a card" Stupor) fails the `$` anchor → low → Arbiter
  // (a safe FN — never a dropped clause). Matched BEFORE the non-random forms; the distinct " at random"
  // suffix makes the anchors disjoint, so the chooser forms below are byte-for-byte unchanged. The count
  // count-word set is identical to the chooser family (NUM_WORD covers "a"/"one".."ten").
  const RN = "(\\d+|a|one|two|three|four|five|six|seven|eight|nine|ten)";
  let rm;
  if ((rm = t.match(new RegExp(`^target player discards ${RN} cards? at random$`))))
    return { op: "discard", amount: NUM_WORD[rm[1]] ?? parseInt(rm[1], 10), who: "target", targetType: "player", atRandom: true };
  if ((rm = t.match(new RegExp(`^target opponent discards ${RN} cards? at random$`))))
    return { op: "discard", amount: NUM_WORD[rm[1]] ?? parseInt(rm[1], 10), who: "target", targetType: "opponent", atRandom: true };
  if ((rm = t.match(new RegExp(`^each player discards ${RN} cards? at random$`))))
    return { op: "discard", amount: NUM_WORD[rm[1]] ?? parseInt(rm[1], 10), who: "eachPlayer", targetType: null, atRandom: true };
  if ((rm = t.match(new RegExp(`^each opponent discards ${RN} cards? at random$`))))
    return { op: "discard", amount: NUM_WORD[rm[1]] ?? parseInt(rm[1], 10), who: "eachOpponent", targetType: null, atRandom: true };
  // "that player discards N cards at random" — the just-combat-damaged player (Hypnotic Specter class). who:
  // "damagedPlayer" reads ctx.damagedPlayerId; combatDamageReferentSatisfied (triggerRouting.js) admits it
  // ONLY on a combat/damage event, so a bare spell or an upkeep "that player discards a card at random"
  // (Bottomless Pit's per-upkeep referent) can NEVER route here and mis-scope — it stays parked (safe FN).
  if ((rm = t.match(new RegExp(`^that player discards ${RN} cards? at random$`))))
    return { op: "discard", amount: NUM_WORD[rm[1]] ?? parseInt(rm[1], 10), who: "damagedPlayer", targetType: null, atRandom: true };
  // "[you] discard N cards at random" — the controller self-discards at random (draw-then-discard-random loot:
  // Goblin Lore / Desperate Ravings / Burning Inquiry's self half). who:"controller".
  if ((rm = t.match(new RegExp(`^(?:you )?discard ${RN} cards? at random$`))))
    return { op: "discard", amount: NUM_WORD[rm[1]] ?? parseInt(rm[1], 10), who: "controller", targetType: null, atRandom: true };
  // ===== UPKEEP-PLAYER DISCARD (BLITZ TR-2, CR 503.1a) ===== "the upkeep player discards N cards[ at
  // random]" — the SENTINEL detectTriggers emits for an "each player's upkeep" trigger's "that player
  // discards …" (Necrogen Mists; Bottomless Pit's at-random form). The phrase appears NOWHERE in printed
  // oracle (corpus-verified), so only the event-gated rewrite can produce it; who:"upkeepPlayer" reads
  // ctx.upkeepPlayerId and the triggerRouting referent gate pins the atom to the upkeep event (a spell /
  // any other event leaves the referent unset → clean no-op → never native there). NON-targeted
  // (targetType:null — the referent is the event's, not a chosen target). The discarder chooses via the
  // chain (CR 701.9b); the at-random form pitches via the seeded primitive like every other atRandom.
  if ((rm = t.match(new RegExp(`^the upkeep player discards ${RN} cards?( at random)?$`))))
    return { op: "discard", amount: NUM_WORD[rm[1]] ?? parseInt(rm[1], 10), who: "upkeepPlayer", targetType: null, ...(rm[2] ? { atRandom: true } : {}) };
  // ⭐⭐ DEFENDING-PLAYER DISCARD (DP-DISC, 2026-08-05 — Abyssal Nightstalker, The Haunt of Hightower,
  // Shrieking Specter on ATTACKS; Alley Grifters, Slate Street Ruffian on BECOMES-BLOCKED; Corrupt
  // Official's at-random twin). The third referent arm of this same matcher, beside damagedPlayer and
  // upkeepPlayer — same shape, same all-or-nothing anchor, only the ctx key differs.
  // ⛔ NO SENTINEL REWRITE, and unlike the upkeep arm this phrase is PRINTED: "defending player" is real
  // oracle text (CR 508.1), not an anaphor, so there is nothing to disambiguate and nothing to rewrite.
  // who:"defendingPlayer" reads ctx.defenderId — threaded by checkAttackTriggers on attacks/attacksAlone
  // and by checkBlockTriggers on becomesBlocked, which is exactly the two events these six cards use — and
  // triggerRouting's DEFENDING_PLAYER_EVENTS gate keeps the atom off every other event, where the referent
  // would be unset and the clause would silently drop.
  if ((rm = t.match(new RegExp(`^defending player discards ${RN} cards?( at random)?$`))))
    return { op: "discard", amount: NUM_WORD[rm[1]] ?? parseInt(rm[1], 10), who: "defendingPlayer", targetType: null, ...(rm[2] ? { atRandom: true } : {}) };
  let m = t.match(/^target player discards (\d+|a|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "discard", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "target", targetType: "player" };
  // TARGET-OPPONENT discard (Ravenous Rats / Dirty Rat / Deadbridge Shaman ETB) — the same targeted discard as
  // "target player", but the printed "opponent" narrows the legal targets to opponents (targetType "opponent" →
  // atomTargetSpec enumerates opponents; the discard is already enemy-intent, so the trigger flush never picks
  // the controller). The discarding player still chooses which card (CR 701.8). Distinct anchor from "target
  // player"; the resolver reads the chosen victim regardless of targetType, so it lifts the "player" runtime.
  m = t.match(/^target opponent discards (\d+|a|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "discard", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "target", targetType: "opponent" };
  m = t.match(/^each player discards (\d+|a|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "discard", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "eachPlayer", targetType: null };
  m = t.match(/^each opponent discards (\d+|a|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "discard", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "eachOpponent", targetType: null };
  // ===== CDMG-PLAYER-PAYOFF ===== "that player discards N cards" — the just-combat-damaged player (the
  // damagedPlayer referent the combat-damage trigger carries in ctx.damagedPlayerId, set by triggers.check-
  // CombatDamageTriggers). Mirrors the rad/mill damagedPlayer subjects (Sword of Body and Mind's mill; the rad
  // CDMG payoffs): NON-targeted (targetType:null → routes natively on the combat-damage trigger flush,
  // programNeedsChosenTarget → false) and a clean no-op outside a combat-damage event (applyDiscard's damaged-
  // Player branch discards nobody when ctx.damagedPlayerId is absent — never a fabrication). The routing gate's
  // combatDamageReferentSatisfied (triggerRouting.js) admits this ONLY on combatDamageToPlayer/dealtDamage, so
  // an upkeep "that player discards a card" (Necrogen Mists' upkeep referent) can NEVER route here and mis-scope.
  // Anchored ^…$ — "that player discards THAT card" (the reveal-then-discard discard-chosen family, Gix's Caress)
  // wants "that card" not "a/N cards" and never matches; a rider ("…and you untap all lands", Sword of Feast and
  // Famine) keeps its tail → low → Arbiter (CREED: never a dropped clause). Discarder chooses (CR 701.8 chain).
  m = t.match(/^that player discards (\d+|a|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "discard", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "damagedPlayer", targetType: null };
  // CDMG-DISCARD-SCALED — "that player discards that many cards" / "they discard that many cards" (Dreamstealer,
  // Needle Specter): the count IS the combat-damage amount (ctx.combatDamageAmount). Mirrors the rad "that many"
  // damagedPlayer sibling EXACTLY (counters.js countContext path) — NON-targeted (targetType:null → routes on the
  // combat-damage trigger flush) and a clean no-op outside a combat-damage event (resolveScaledAmount → 0 when
  // ctx.combatDamageAmount is absent; applyDiscard's amount<=0 guard logs a no-op, never a fabricated discard).
  // combatDamageReferentSatisfied (triggerRouting.js) admits countContext:"combatDamageAmount" ONLY on the
  // combatDamageToPlayer/dealtDamage events, so a non-combat "they discard that many cards" can never mis-scope.
  if (/^(?:that player|they) discards? that many cards?$/.test(t)) {
    return { op: "discard", countContext: "combatDamageAmount", who: "damagedPlayer", targetType: null };
  }
  m = t.match(/^(?:you )?discard (\d+|a|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "discard", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "controller", targetType: null };
  // DISCARD-HAND — "discards their hand" / "discard your hand" (the WHOLE hand, no count). The chain pitches
  // it all (atom.all → remaining Infinity). Unlocks the wheel (Wheel of Fortune / Reforge the Soul) when paired
  // with the existing each-player draw, and "discard your hand, then draw N" (Dangerous Wager). A rider
  // ("unless they pay 7 life" Tyrannize / "for each card discarded …") fails the `$` anchor → low → Arbiter.
  // EACH-PLAYER WHEEL BY OWN COUNT (SHELF-85 N10, 2026-09-04 — Dark Deal "Each player discards all the cards in their
  // hand, then draws that many cards minus one"; Incendiary Command's fourth mode, no minus): Tolarian Winds' composite
  // (count BEFORE the discard, pitch through the shared discard-all path so watchers fire, then draw) for EVERY seat —
  // each player's own count, all discards before any draw (CR 608.2c, the written order). `minus` floors at zero.
  {
    const wm = t.match(/^each player discards all the cards in their hand, then draws that many cards( minus one)?$/);
    if (wm) return { op: "discard-hand-draw-same", who: "eachPlayer", minus: wm[1] ? 1 : 0, targetType: null };
  }
  if (/^each player discards their hand$/.test(t)) return { op: "discard", who: "eachPlayer", targetType: null, all: true };
  if (/^target player discards their hand$/.test(t)) return { op: "discard", who: "target", targetType: "player", all: true };
  if (/^(?:you )?discard your hand$/.test(t)) return { op: "discard", who: "controller", targetType: null, all: true };
  return null;
}

/**
 * TOLARIAN WINDS (BLITZ TW-1): "Discard [all the cards in] your hand, then draw that many cards." —
 * ONE composite atom (count the hand BEFORE the discard, pitch it all through the shared discard-all
 * path so discard watchers fire, then draw exactly that count). A composite because "that many" is the
 * DISCARDED count — binding it cross-atom would ride the combat-damage countContext (the wrong referent,
 * a latent mis-draw); one atom needs no bridge. Matched UP FRONT on the whole (reminder-stripped) oracle
 * (parser.matchDiscardHandDrawSame — the cumulative-upkeep dispatch pattern), so a flashback/retrace line
 * (Shattered Perception / Decaying Time Loop) breaks the match and the card stays parked (those alt-cost
 * keywords are unmodeled — a safe FN). An empty hand → discard nothing, draw nothing (a logged no-op).
 */
export function applyDiscardHandDrawSame(state, atom, ctx) {
  // N10 — the EVERY-SEAT form (Dark Deal / Incendiary Command's mode): each player's own hand count is read first, every
  // hand is pitched (the shared each-player discard-all, so discard watchers fire), then each player draws their own
  // count less `minus`, floored at zero. An empty hand draws nothing (a logged zero, never a fabricated draw).
  if (atom.who === "eachPlayer") {
    const pids = Object.keys(state.players || {});
    const counts = Object.fromEntries(pids.map((p) => [p, (state.players[p]?.hand || []).length]));
    let next = applyDiscard(state, { op: "discard", who: "eachPlayer", targetType: null, all: true }, ctx);
    const drawn = {};
    for (const p of pids) {
      const k = Math.max(0, counts[p] - (atom.minus || 0));
      drawn[p] = k;
      if (k > 0 && next.players?.[p]) next = drawCards(next, { playerId: p, count: k });
    }
    return logEvent(next, { kind: "spell-effect", effect: "discard-hand-draw-same", controller: ctx.controller, who: "eachPlayer", minus: atom.minus || 0, drawn });
  }
  const n = (state.players?.[ctx.controller]?.hand || []).length;
  let next = applyDiscard(state, { op: "discard", who: "controller", targetType: null, all: true }, ctx);
  if (n > 0) next = drawCards(next, { playerId: ctx.controller, count: n });
  return logEvent(next, { kind: "spell-effect", effect: "discard-hand-draw-same", controller: ctx.controller, amount: n });
}

/**
 * ===== LOOK AT A HAND (CR 701.20e) ===== "Look at target player's hand." — Peek, Gitaxian Probe,
 * Clairvoyance, Ingenious Thief, Glasses of Urza.
 *
 * ⭐ THE ONLY EFFECT IN THIS FAMILY WITH NO BOARD CONSEQUENCE. CR 701.20e: *"Some effects instruct a
 * player to look at one or more cards. Looking at a card follows the same rules as revealing a card,
 * except that the card is shown only to the specified player."* No zone changes, no state changes — the
 * information IS the whole effect, so DELIVERING the information is the whole implementation.
 *
 * ⛔ WHICH IS EXACTLY WHY THIS COULD HAVE BEEN HOLLOW. A resolver that logged `effect:"look-at-hand"`
 * and nothing else would let five cards classify native while conveying nothing — an empty gesture that
 * every test asserting "an atom was produced" would happily pass. So the log entry carries the ACTUAL
 * card names read off the target's hand, and the gates assert the logged list EQUALS that hand. If the
 * contents could not be logged truthfully this arm would not be worth building.
 *
 * The log is a consumed surface, not a debug artifact — /api/why-you-lost, /api/self-play and /api/grind
 * all read the game log, so a looked-at hand genuinely reaches a reader.
 *
 * `looker` is the ability's controller (the "specified player" of 701.20e), `player` the hand's owner.
 * Those are DIFFERENT seats and the wrong-owner class of bug is the one this project keeps re-learning,
 * so both are recorded and both are pinned in the gates.
 */
export function applyLookAtHand(state, atom, ctx) {
  const seats = (ctx.targets || [])
    .filter((t) => t.type === "player" && state.players?.[t.id])
    .map((t) => t.id);
  // No legal target (countered on resolution / an eliminated seat) → a clean no-op, never a fabricated peek.
  if (seats.length === 0) return logEvent(state, { kind: "spell-effect", effect: "look-at-hand", looker: ctx.controller, player: null, cards: [] });
  let next = state;
  for (const pid of seats) {
    const cards = (state.players[pid].hand || []).map((c) => c?.name).filter(Boolean);
    next = logEvent(next, { kind: "spell-effect", effect: "look-at-hand", looker: ctx.controller, player: pid, cards });
  }
  return next;
}

/**
 * "Look at target player's hand" — whole-clause anchored, so every richer shape in this vein keeps its
 * tail and stays LOW → Arbiter (a SAFE FN, never a dropped clause). Those are real cards and they are
 * deliberately NOT covered here: Agonizing Memories / Mind Warp / Extortion / Thrull Surgeon / Vendilion
 * Clique / Oildeep Gearhulk all continue "…and choose N cards from it", which is a CHOICE plus a
 * material consequence — a different build, not a longer regex.
 *
 * ⭐⭐ THE **OPPONENT** WORDING (LH-2, 2026-08-05) — BUILT ENGINE, NO IGNITION, and the count says it plainly:
 * 15 cards in the corpus say "look at target OPPONENT's hand" and 14 say "target PLAYER's hand". This parser
 * accepted only the second, so the atom, the resolver, the truthful log and its gates were all in place while
 * the larger half of the vein never reached any of it. Nothing here was broken — one noun was missing.
 * ⛔ THE ANCHOR AND ITS DOCUMENTED REASON ARE UNCHANGED. The narrow whole-clause match exists to keep the
 * "…and choose N cards from it" family (Agonizing Memories, Vendilion Clique, Thrull Surgeon) on the Arbiter,
 * because a CHOICE with a material consequence is a different build. That still holds — only the noun widened.
 * ⛔ "opponent" IS NARROWER THAN "player", NOT WIDER: it emits targetType "opponent", which enumerateTargets
 * restricts to non-controller seats. Reusing "player" here would have let the card target its OWN controller
 * — a legal-target set larger than printed, the forbidden direction. (Both stamp `type:"player"` on the
 * target object, which is what applyLookAtHand's seat filter reads, so the resolver needs no change.)
 */
export function lookAtHandClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  if (/^look at target player's hand$/.test(t)) return { op: "look-at-hand", targetType: "player" };
  if (/^look at target opponent's hand$/.test(t)) return { op: "look-at-hand", targetType: "opponent" };
  return null;
}

export const handResolvers = {
  "discard-chosen": applyDiscardChosen,
  "hand-to-library-top": applyHandToLibraryTop, // Brainstorm put-back — top placement, NOT a discard

  "imprint": applyImprint, // IMPRINT (CR 207.2c) — the ETB exile-from-hand that STAMPS the permanent
  "discard": applyDiscard, // ===== EACH-PLAYER ===== target/each player discards N — victim chooses (CR 701.8)
  "discard-hand-draw-same": applyDiscardHandDrawSame, // TW-1 — Tolarian Winds' whole-hand cycle
  "look-at-hand": applyLookAtHand, // LOOK (CR 701.20e) — information only; the log carries the real contents
};
