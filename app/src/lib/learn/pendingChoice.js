/**
 * pendingChoice.js — the resolution-time interactive-choice seam (leaf module).
 *
 * Mirrors pendingArbiter.js, but for a choice the engine CAN model yet needs the
 * player to make: a tutor's "search your library for a card" (CR 701.19). When a
 * tutor atom resolves, instead of auto-picking it flags `state.pendingChoice` with
 * the legal candidates and pauses the effect program (runProgram records where to
 * resume). The session driver then either surfaces a picker (the player's own tutor,
 * beginner/intermediate) or auto-picks (Expert autopilot / an opponent), exactly the
 * pendingArbiter pause-or-autocontinue split.
 *
 * Plain JSON only (no closures) so a game serialized mid-choice restores intact.
 * Imports only logEvent from gameState — no cycle.
 */

import { logEvent } from "./gameState.js";

/**
 * WI-4 — the canonical, exhaustive list of every state.pendingChoice.kind the engine can set. The
 * advanceUntilDecision driver loop (learnSession.js) and applyPendingChoice's dispatch table must each
 * handle every entry here; a kind added to this array without a matching driver branch + applyPendingChoice
 * branch trips the pendingChoiceKinds.test.js contract test instead of silently soft-locking a human seat
 * (unrenderable decision) or spinning an AI seat to the 50,000-tick SAFETY_CAP (both fall through to the
 * tutor settler today, which no-ops on a kind mismatch). "tutor-search" is the driver's unguarded
 * fall-through case, so it has no explicit `pc.kind === "tutor-search"` branch above it in the loop — it's
 * listed here anyway since it IS a real, handled kind.
 */
export const PENDING_CHOICE_KINDS = [
  "tutor-search",
  "clone-search",
  "scry-surveil",
  "optional-effect",
  "commander-return",
  "hand-discard",
  "impulse-dig",
  "sacrifice-choice",
  "discard",
  "divide-damage",
  "distribute-counters",
  "soft-counter",
  "optional-mana-payment",
  "optional-sac-payment",
  "optional-draw-discard",
  "optional-discard-payment",
  "sac-unless-pay",
  "taxed-payment",
];

/**
 * Flag a tutor search awaiting a card choice. `candidates` is the list of legal
 * library cards as `{ id, name }` (hidden-info safe — names are the searcher's own
 * library). FIFO: one pending choice at a time (the driver settles it before the
 * next atom/spell resolves, so this guard is belt-and-braces).
 */
export function setPendingTutorChoice(state, { controller, candidates, sourceName = null, filterLabel = null, filter = null, destination = "hand", entersTapped = false, remaining = 1, sourceZone = "library", destinations = null }) {
  if (state.pendingChoice) return state;
  // RAMP-SPLIT (Cultivate / Kodama's Reach) — an ORDERED per-fetch destination sequence; its HEAD applies to
  // THIS pick (so the fetch path + picker label read destination/entersTapped unchanged), the tail rides on
  // destinations for the next chained pick. A found-only-one keeps the head (battlefield tapped, per the
  // Cultivate/Kodama rulings). Absent -> the uniform single/multi destination path.
  const destSeq = Array.isArray(destinations) && destinations.length ? destinations : null;
  const destHead = destSeq ? destSeq[0] : null;
  // WAVE-2b FETCH-TO-TOP — the destination is one of three known zones: "battlefield" (+ entersTapped, ramp),
  // "top" (shuffle-then-place-on-top — Vampiric/Mystical/Worldly Tutor), or "hand" (the default P3.2 tutor).
  // A RAMP-SPLIT destSeq head is only ever battlefield/hand (Cultivate/Kodama), so "top" only arrives via the
  // plain `destination` param. Any unrecognized value falls back to "hand" (safe — the most conservative zone).
  const coerce = (d) => (d === "battlefield" ? "battlefield" : d === "top" ? "top" : "hand");
  const effDestination = destHead ? coerce(destHead.zone) : coerce(destination);
  const effTapped = destHead ? !!destHead.tapped : !!entersTapped;
  const next = logEvent(state, { kind: "tutor-search-pending", controller, count: candidates.length, sourceName, destination: effDestination });
  return {
    ...next,
    pendingChoice: {
      kind: "tutor-search",
      controller,
      candidates,
      sourceName,
      filterLabel,
      // WAVE-2b TUTOR — the STRUCTURED filter (`{ groups, mv? }`, plain JSON) carried alongside candidates
      // so autoPickTutorCandidate can DEFENSIVELY re-apply the type/MV gate (Spellseeker MV<=2, Trophy Mage
      // MV=3) — candidates are already filtered upstream by applyTutor, but threading the filter keeps the
      // auto-pick robust if a future caller ever populates candidates without pre-filtering. Null = no filter.
      filter: filter || null,
      // LAND-FROM-HAND — which zone the chosen card comes FROM: "library" (every search; default + shuffles)
      // or "hand" (Growth Spiral's "put a land from your hand onto the battlefield"; no shuffle).
      sourceZone: sourceZone === "hand" ? "hand" : "library",
      // RAMP-1 — where the chosen card goes: "hand" (P3.2 tutor) or "battlefield" (+ entersTapped, ramp). For
      // RAMP-SPLIT these reflect the CURRENT pick (the head of the destinations sequence).
      destination: effDestination,
      entersTapped: effTapped,
      // RAMP-MULTI — how many fetches are still to make (Explosive Vegetation / Skyshroud Claim = 2). The
      // resolver chains the next pick while this is > 1, so the picker surfaces once per fetch.
      remaining: Math.max(1, remaining),
      // RAMP-SPLIT — the remaining ORDERED destination sequence (head = this pick); resolveTutorChoice advances
      // it per chained fetch. Null on the uniform path. Plain JSON (serialize-safe per this module's mandate).
      destinations: destSeq,
    },
  };
}

/**
 * Flag a clone awaiting its "which creature to copy" choice (CR 707.9 — chosen as the permanent
 * enters). `candidates` is the list of legal copy-target battlefield permanents as `{ id, name }`.
 * `resume` carries what's needed to finish the entry once chosen: the clone's own card + its
 * controller + whether the choice is optional (a "you may" clone can decline → enter as itself).
 * Public info (the candidates are visible permanents). FIFO like the tutor choice.
 */
export function setPendingCloneChoice(state, { controller, candidates, sourceName = null, optional = true, resume }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "clone-choice-pending", controller, count: candidates.length, sourceName });
  return {
    ...next,
    pendingChoice: {
      kind: "clone-search",
      controller,
      candidates,
      sourceName,
      // WI-2 (CR 707.9): false = the MANDATORY "~ enters as a copy of …" form — the UI hides the
      // decline button and the settle path auto-picks instead of accepting a decline. Defaults true
      // (declinable) so an old serialized save without the field keeps its historical behavior.
      optional,
      resume,
    },
  };
}

/**
 * Flag a scry/surveil awaiting the player's keep-on-top / move-away decision (CR 701.22 / 701.25).
 * `cards` is the top N of the controller's library, top-first, as `{ id, name }` (public to the
 * controller — they're looking at their own library). `mode` is "scry" (rest → bottom) or
 * "surveil" (rest → graveyard). Like the tutor, `runProgram` records the suspended-program
 * continuation onto `pendingChoice.resume` when it detects the pause. FIFO: one choice at a time.
 */
export function setPendingScryChoice(state, { controller, mode, cards, sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "scry-pending", controller, mode, count: cards.length, sourceName });
  return {
    ...next,
    pendingChoice: {
      kind: "scry-surveil",
      controller,
      mode,
      cards,
      sourceName,
    },
  };
}

/**
 * Flag a hand-disruption awaiting the CASTER's pick of which card to discard (δ-1b, CR 701.8 — Duress
 * / Thoughtseize / …). The spell already targeted ONE opponent (`victim`) at cast; the atom resolved by
 * revealing that opponent's hand and filtering it, so `candidates` is the matching subset as
 * `{ id, name }`. The caster picks one to discard (driver: a picker for the human, auto-pick the best for
 * the AI / Expert). `controller` is the CASTER (who decides); `victim` is the opponent whose hand it is
 * and whose graveyard the card moves to. The candidate names are revealed by the spell — surfacing them
 * to the caster is the "reveal," and ONLY this one opponent's hand is exposed (no 4P leak). FIFO.
 */
export function setPendingHandDiscardChoice(state, { controller, victim, candidates, sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "hand-discard-pending", controller, victim, count: candidates.length, sourceName });
  return {
    ...next,
    pendingChoice: {
      kind: "hand-discard",
      controller,
      victim,
      candidates,
      sourceName,
    },
  };
}

/**
 * Flag an impulse-dig awaiting the player's pick of which looked-at card to keep (δ-2 — Anticipate /
 * Strategic Planning / Impulse). `candidates` is the top N of the controller's OWN library,
 * top-first, as `{ id, name }` (public to the controller — they're looking at their own library). The
 * chosen card goes to HAND; the rest go to `restTo` ("bottom" of the library / "graveyard"). Like the
 * tutor/scry, `runProgram` records the suspended-program continuation onto `pendingChoice.resume` when
 * it detects the pause. FIFO: one choice at a time.
 */
export function setPendingImpulseDigChoice(state, { controller, candidates, restTo, sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "impulse-dig-pending", controller, count: candidates.length, restTo, sourceName });
  return {
    ...next,
    pendingChoice: {
      kind: "impulse-dig",
      controller,
      candidates,
      restTo,
      sourceName,
    },
  };
}

/**
 * ===== EDICTS ===== — flag a sacrifice awaiting the SACRIFICING player's pick of which creature to give
 * up (CR 701.16 — Diabolic Edict / Cruel Edict / Geth's Verdict). The spell targeted ONE player; that
 * target is the sacrificer, and `controller` here is THAT player (not the caster) — so the driver's
 * `pause = pc.controller === "user"` rule pauses for a human sacrificer and auto-sacs an AI one, exactly
 * like the other choices. `candidates` is the sacrificer's creatures as `{ id, name }` (public — on the
 * battlefield, and the chooser is their controller). The caster's continuation rides on `pendingChoice
 * .resume` (attached by runProgram), so a rider — Geth's Verdict "You lose 1 life" — runs after. FIFO.
 */
export function setPendingSacrificeChoice(state, { controller, candidates, queue = null, sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "sacrifice-pending", controller, count: candidates.length, sourceName });
  return {
    ...next,
    pendingChoice: {
      kind: "sacrifice-choice",
      controller,
      candidates,
      // EACH-PLAYER / EACH-OPPONENT edicts resolve as a CHAIN: `queue` is the remaining sacrificers (head =
      // the current one). Single-target edicts (#214) pass no queue → a queue-of-one settles then resumes.
      queue,
      sourceName,
    },
  };
}

/**
 * ===== DIVIDE ===== (MT-1) — flag a divide-damage spell awaiting the CASTER's DIVISION decision (which
 * targets get how much of `amount`; CR 601.2d's division is modeled at RESOLUTION to avoid the cast-time
 * cartesian blow-up of "any number of targets × every split"). `controller` is the caster (the divider);
 * the driver pauses for a human caster and auto-distributes for an AI/Expert (autoPickDivideDistribution).
 * `candidates` is the legal target set as `{ id, name, type }` (creatures on every battlefield + players,
 * per the spell's `group`) — all public, hidden-info safe. `amount` is the total damage to split (each
 * assigned target gets ≥1, CR 601.2d). The caster's continuation rides on `pendingChoice.resume`.
 */
export function setPendingDivideChoice(state, { controller, amount, candidates, group, sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "divide-damage-pending", controller, amount, count: candidates.length, sourceName });
  return {
    ...next,
    pendingChoice: { kind: "divide-damage", controller, amount, candidates, group, sourceName },
  };
}

/**
 * Flag a DISTRIBUTE-COUNTERS choice (The Earth Crystal): the controller allots `amount` +1/+1 counters among
 * up to `maxTargets` of their own creatures (`candidates`), each chosen target getting ≥1 (CR 121.5-shaped,
 * same full-assignment rule as divide-damage). resolveDistributeChoice applies each via the add-counter atom
 * so the controller's counter doublers compose (CR 616). Mirrors setPendingDivideChoice exactly.
 */
export function setPendingDistributeChoice(state, { controller, amount, counterType = "+1/+1", maxTargets = null, candidates, sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "distribute-counters-pending", controller, amount, counterType, count: candidates.length, sourceName });
  return {
    ...next,
    pendingChoice: { kind: "distribute-counters", controller, amount, counterType, maxTargets, candidates, sourceName },
  };
}

/**
 * ===== EACH-PLAYER ===== discard (EP-2) — flag a discard awaiting the DISCARDING player's pick of which
 * card to pitch (CR 701.8 — the discarding player chooses, NOT the caster; the opposite chooser to δ-1b
 * hand disruption). `controller` here is the DISCARDER (Mind Rot's target / each player), so the driver's
 * `pause = pc.controller === "user"` rule pauses for a human discarder and auto-discards an AI one. A
 * discard of N>1 or by several players ("each player discards N") resolves as a CHAIN: this flags the
 * NEXT single-card pick; `remaining` is how many more THIS discarder owes, and `queue` is the remaining
 * discarders (head = the current one, with its own `remaining`). `candidates` is the discarder's hand as
 * `{ id, name }` (public — the chooser owns the hand). The caster's continuation rides on
 * `pendingChoice.resume` (attached by runProgram on the FIRST pause; resolveDiscardChoice carries it
 * forward across the chain). Only flagged when a REAL choice exists (hand > remaining); a hand ≤ remaining
 * is the forced whole-hand discard, resolved inline with no pause. FIFO: one pick at a time.
 */
export function setPendingDiscardChoice(state, { controller, remaining, candidates, queue, sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "discard-pending", controller, remaining, count: candidates.length, sourceName });
  return {
    ...next,
    pendingChoice: {
      kind: "discard",
      controller,
      remaining,
      candidates,
      queue,
      sourceName,
    },
  };
}

/**
 * ===== SOFT-CNT ===== — flag a "soft" counter (Force Spike / Mana Leak / Mana Tithe / Spell Pierce /
 * …) awaiting the TARGETED SPELL'S CONTROLLER's pay-or-be-countered decision (CR 701.5a + the spell's
 * "unless its controller pays {N}" clause). When the counter resolves, instead of countering outright
 * it flags this: `controller` is the controller of the spell on the stack (an opponent in 4P — NOT the
 * counter's caster), so the driver's `pause = pc.controller === "user"` rule pauses for a human whose
 * spell is under threat and auto-decides for an AI. `amount` is the fixed generic {N}; `spellId` is the
 * stack object to counter (re-found by id at settle — it may have moved). If the controller pays {N}
 * (and can afford it), the spell SURVIVES; otherwise it's countered. The caster's continuation rides on
 * `pendingChoice.resume` (attached by runProgram). FIFO: one choice at a time.
 */
export function setPendingSoftCounterChoice(state, { controller, amount, cost = null, spellId, spellName = null, sourceName = null }) {
  if (state.pendingChoice) return state;
  // `amount` is the legacy FIXED-GENERIC cost (Force Spike / Mana Leak / generic-mana ward). `cost` is the
  // KW-WARD-PR2 STRUCTURED cost descriptor ({kind:"mana",mana} | {kind:"life",life}) — when present it
  // overrides `amount` at settle (resolveSoftCounterChoice branches on it). For logging, surface the
  // headline number either way so the banner reads sensibly.
  const logAmount = cost ? wardCostHeadline(cost) : amount;
  const next = logEvent(state, { kind: "soft-counter-pending", controller, amount: logAmount, spellName, sourceName });
  return {
    ...next,
    pendingChoice: {
      kind: "soft-counter",
      controller,
      amount,
      ...(cost ? { cost } : {}),
      spellId,
      spellName,
      sourceName,
    },
  };
}

/**
 * ===== OPTIONAL-MANA-PAYMENT (CR 603.7c) ===== — flag an optional "you may pay {cost}. If you do, <effect>"
 * awaiting the CONTROLLER's pay-or-decline decision (Lifecrafter's Bestiary / Mind's Eye / Inheritance / …).
 * When the atom resolves it flags this instead of running the payoff: `controller` is the player whose
 * trigger/ability it is (the one who pays), so the driver's `pause = pc.controller === "user"` rule pauses a
 * human and auto-decides an AI (pay-if-able). `cost` is the STRUCTURED mana cost descriptor ({kind:"mana",mana}
 * — the same shape KW-WARD-PR2 uses, paid by payManaCost). `effectAtoms` is the parsed payoff program's atoms
 * (plain JSON), run by resolveOptionalManaPaymentChoice ONLY if the controller pays (and can afford it —
 * payManaCost never fabricates mana). The continuation rides on `pendingChoice.resume` (attached by runProgram).
 * FIFO: one choice at a time.
 */
export function setPendingOptionalManaPaymentChoice(state, { controller, cost, effectAtoms = [], sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "optional-mana-payment-pending", controller, amount: wardCostHeadline(cost), sourceName });
  return {
    ...next,
    pendingChoice: {
      kind: "optional-mana-payment",
      controller,
      cost,
      effectAtoms,
      sourceName,
    },
  };
}

/**
 * ===== REFLEXIVE-SAC-BY-SUBTYPE (CR 603.7c) ===== — suspend on a "you may sacrifice a <subtype>. If you do,
 * <effect>" sac-or-decline decision. The driver pauses a human and auto-decides an AI (sac-if-able — the modeled
 * payoffs are beneficial). `subtype` is the capitalized token subtype the controller may sacrifice one of (a
 * Food / Treasure / Blood …); `available` is true iff the controller actually controls ≥1 matching permanent at
 * the time the atom resolves (a false-`available` pause has only the "decline" line — you can't sacrifice what
 * you don't have, and the payoff never runs). `effectAtoms` is the parsed payoff program's atoms (plain JSON),
 * run by resolveOptionalSacChoice ONLY if the controller sacrifices (sacrificeCreatureEffect never fabricates a
 * sacrifice). The continuation rides on `pendingChoice.resume` (attached by runProgram). FIFO: one choice at a time.
 */
export function setPendingOptionalSacBySubtypeChoice(state, { controller, subtype, available, effectAtoms = [], sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "optional-sac-payment-pending", controller, subtype, available, sourceName });
  return {
    ...next,
    pendingChoice: {
      kind: "optional-sac-payment",
      controller,
      subtype,
      available: !!available,
      effectAtoms,
      sourceName,
    },
  };
}

/**
 * ===== OPTIONAL DRAW-THEN-DISCARD ===== — suspend on a "you may draw a card. If you do, discard a card."
 * yes/no. The driver pauses a human and auto-decides an AI (draw — a net-neutral loot is card-selection upside).
 * `effectAtoms` is the [draw, discard] program, run by resolveOptionalDrawDiscardChoice ONLY on yes (the discard's
 * which-card pause chains onto the program continuation). No cost — the yes/no IS the whole gate. FIFO.
 */
export function setPendingOptionalDrawDiscardChoice(state, { controller, effectAtoms = [], sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "optional-draw-discard-pending", controller, sourceName });
  return {
    ...next,
    pendingChoice: { kind: "optional-draw-discard", controller, effectAtoms, sourceName },
  };
}

/**
 * OPTIONAL-DISCARD-PAYMENT (CR 603.7c) — "you may discard a card. If you do, <effect>". The driver pauses a human
 * and auto-decides an AI (pay iff `available`). Unlike draw-then-discard, the DISCARD is the COST (it pauses on a
 * which-card choice); `effectAtoms` is the NON-pausing payoff, run by resolveOptionalDiscardPaymentChoice ONLY after
 * a real discard settles. `available` = the controller holds ≥1 non-token card to pitch. FIFO.
 */
export function setPendingOptionalDiscardPaymentChoice(state, { controller, available, effectAtoms = [], sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "optional-discard-payment-pending", controller, available, sourceName });
  return {
    ...next,
    pendingChoice: { kind: "optional-discard-payment", controller, available, effectAtoms, sourceName },
  };
}

/**
 * UPKEEP-SAC-UNLESS-PAY (echo-without-the-keyword, CR 603.7c) — "Sacrifice this <noun> unless you pay {cost}." The
 * driver pauses a human and auto-decides an AI (pay iff affordable — keep the permanent). INVERTED polarity vs
 * optional-mana-payment: resolveSacUnlessPayChoice charges the mana on a pay-and-afford and the permanent survives;
 * a decline or an unaffordable pay SACRIFICES the source (via `sourceId` = ctx.sourceId, the permanent whose upkeep
 * trigger this is). FIFO.
 */
export function setPendingSacUnlessPayChoice(state, { controller, cost, sourceId = null, sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "sac-unless-pay-pending", controller, amount: wardCostHeadline(cost), sourceName });
  return {
    ...next,
    pendingChoice: { kind: "sac-unless-pay", controller, cost, sourceId, sourceName },
  };
}

/**
 * OPPONENT-PAYS-TO-DENY (taxed-payment, CR 603.7c) — "Whenever an opponent casts a spell, you may draw a card unless
 * that player pays {N}." (Rhystic Study). The DECISION belongs to the `payer` (the opponent who cast), so
 * `controller` IS the payer — the learnSession driver keys the choice SEAT off pc.controller, so this routes the
 * pay/decline to the payer's seat with NO special driver logic. `beneficiary` (the trigger's controller) draws when
 * the payer declines / can't afford. FIFO.
 */
export function setPendingTaxedPaymentChoice(state, { payer, beneficiary, cost, sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "taxed-payment-pending", payer, beneficiary, amount: wardCostHeadline(cost), sourceName });
  return {
    ...next,
    pendingChoice: { kind: "taxed-payment", controller: payer, payer, beneficiary, cost, sourceName },
  };
}

/** A short human number for a structured ward cost, for the pending-choice log banner. */
function wardCostHeadline(cost) {
  if (cost?.kind === "life") return cost.life;
  if (cost?.kind === "mana") {
    const m = cost.mana || {};
    const colored = ["W", "U", "B", "R", "G", "C"].reduce((s, c) => s + (m[c] || 0), 0);
    const hybrid = Array.isArray(m.hybrid) ? m.hybrid.length : 0;
    return (m.generic || 0) + colored + hybrid;
  }
  return cost?.amount ?? null;
}

/**
 * CMD-RETURN (CR 903.9a) — flag a commander sitting in a graveyard/exile awaiting its OWNER's decision:
 * return it to the command zone, or leave it where it is. A binary yes/no (mirrors the soft-counter
 * pay-or-decline). Only ever set for the HUMAN owner ("user") — an AI commander is auto-returned directly
 * by returnCommandersToZone and never pauses. `zone` is where the commander currently is. FIFO (guarded).
 */
export function setPendingCommanderReturnChoice(state, { controller, zone, cardId, cardName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "commander-return-pending", controller, cardName, zone });
  return {
    ...next,
    pendingChoice: {
      kind: "commander-return",
      controller,
      zone,
      cardId,
      cardName,
    },
  };
}

/** Clear the pending choice (after it's resolved). */
export function clearPendingChoice(state) {
  if (!state.pendingChoice) return state;
  const { pendingChoice: _drop, ...rest } = state;
  return rest;
}
