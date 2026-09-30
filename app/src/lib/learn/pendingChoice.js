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
  "hand-to-library-top",
  "imprint-exile",
  "impulse-dig",
  "look-top-take",
  "dig-land-to-battlefield",
  "sacrifice-choice",
  "discard",
  "divide-damage",
  "distribute-counters",
  "soft-counter",
  "optional-mana-payment",
  "optional-sac-payment",
  "optional-draw-discard",
  "optional-discard-payment",
  "optional-exile-self-payment",
  "milled-pick",
  "sac-unless-pay",
  "taxed-payment",
  "edict-mode",
  "cleanup-discard",
  "each-player-may", // K9 (Step Between Worlds) — a per-seat yes/no, raised seat by seat; the effect applies to the seats that said yes
  "change-target", // shelf D14 (Misdirection) — the redirector picks which other legal target a single-target spell or ability moves to
];

/**
 * EACH-PLAYER-MAY (SHELF-85 K9 — Step Between Worlds "Each player may shuffle their hand and graveyard into their library.
 * Each player who does draws seven cards."): a yes/no pause for ONE seat at a time. `controller` is the seat deciding
 * NOW; `seatsRemaining` the seats still to ask (APNAP order); `accepted` the seats that said yes so far; `effect` names
 * what the yes-seats get (the settler applies it once every seat has answered). `resume` rides every re-raise so the
 * program continues after the last seat. Fields are listed explicitly — an unlisted field is a silent drop.
 */
export function setPendingEachPlayerMayChoice(state, { controller, seatsRemaining = [], accepted = [], effect, draw = 7, lifePerDrawer = 0, sourceName = null, resume = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "each-player-may-pending", controller, effect, sourceName });
  return {
    ...next,
    pendingChoice: {
      kind: "each-player-may",
      controller,
      seatsRemaining: [...seatsRemaining],
      accepted: [...accepted],
      effect,
      draw,
      ...(lifePerDrawer ? { lifePerDrawer } : {}), // Kwain (2026-09-05) — the "draw" effect's per-drawer life gain; unlisted = dropped
      sourceName,
      ...(resume ? { resume } : {}),
    },
  };
}

/**
 * Flag the CR 514.1 cleanup-step hand-size discard (CR-remediation B3): the active player's hand
 * exceeds their maximum hand size at cleanup, and they must choose a card to discard — no stack, no
 * priority, mandatory (no decline). `candidates` is the player's OWN full hand as `{ id, name }`
 * (hidden-info safe — it's their hand). `count` is how many discards remain INCLUDING this one; the
 * settler (gameEngine.settleCleanupDiscardChoice) re-raises until the hand is at the maximum, then
 * runs the deferred 514.2 cleanup tail. FIFO like every kind.
 */
export function setPendingCleanupDiscardChoice(state, { controller, candidates, count }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "cleanup-discard-pending", controller, count });
  return {
    ...next,
    pendingChoice: {
      kind: "cleanup-discard",
      controller,
      candidates,
      count,
    },
  };
}

/**
 * Flag a tutor search awaiting a card choice. `candidates` is the list of legal
 * library cards as `{ id, name }` (hidden-info safe — names are the searcher's own
 * library). FIFO: one pending choice at a time (the driver settles it before the
 * next atom/spell resolves, so this guard is belt-and-braces).
 */
export function setPendingTutorChoice(state, { controller, candidates, sourceName = null, filterLabel = null, filter = null, destination = "hand", entersTapped = false, remaining = 1, sourceZone = "library", sourceZones = null, destinations = null, mayFailToFind = null, fetchedGrants = null, fetchedGrantsUntil = null, landToBattlefieldTapped = false, temptingOffer = null, consultation = false }) {
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
  // "graveyard" joins them for the reanimator family (Entomb / Buried Alive, CR 701.19a).
  //
  // ⚠️ THIS IS THE THIRD PLACE A DESTINATION MUST BE NAMED — the parser emits it, applyTutor whitelists it
  // onto the choice, and this coerces it. Miss any one and the fetch silently lands in the HAND with every
  // other part of the path looking correct. The fallback is deliberately the most conservative zone, so a
  // miss under-delivers rather than fabricating a zone change; that is exactly why it fails quietly.
  const coerce = (d) => (d === "battlefield" ? "battlefield" : d === "top" ? "top" : d === "graveyard" ? "graveyard" : "hand");
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
      ...(consultation ? { consultation: true, mayFailToFind: true } : {}), // DEMONIC CONSULTATION (BI-2): the pick is a NAME; declining names a card not in the library
      // WAVE-2b TUTOR — the STRUCTURED filter (`{ groups, mv? }`, plain JSON) carried alongside candidates
      // so autoPickTutorCandidate can DEFENSIVELY re-apply the type/MV gate (Spellseeker MV<=2, Trophy Mage
      // MV=3) — candidates are already filtered upstream by applyTutor, but threading the filter keeps the
      // auto-pick robust if a future caller ever populates candidates without pre-filtering. Null = no filter.
      filter: filter || null,
      // ARCHDRUID'S CHARM (2026-09-03) — a LAND pick enters the battlefield tapped; anything else takes `destination`.
      ...(landToBattlefieldTapped ? { landToBattlefieldTapped: true } : {}),
      // TEMPTING OFFER (Tempt with Discovery, 2026-09-03) — the offer's running state rides every search it chains
      // (offerer / opponents still to ask / how many accepted / which stage); the settler advances it.
      ...(temptingOffer ? { temptingOffer } : {}),
      // SAVAGE ORDER (2026-08-14) — the fetched-permanent UEOT/next-turn keyword grants, threaded through
      // this FOURTH naming site (the destination comment above warns exactly this: miss one and the path
      // silently under-delivers — the fetched Dino entered WITHOUT its printed indestructible until listed).
      ...(fetchedGrants ? { fetchedGrants, fetchedGrantsUntil: fetchedGrantsUntil || "endOfTurn" } : {}),
      // LAND-FROM-HAND — which zone the chosen card comes FROM: "library" (every search; default + shuffles)
      // or "hand" (Growth Spiral's "put a land from your hand onto the battlefield"; no shuffle).
      sourceZone: sourceZone === "hand" ? "hand" : "library",
      // MULTI-ZONE (bfxg — Finale's "library and/or graveyard") — the UNION of source zones the search drew
      // from. When present, each candidate carries its own `zone` (set in applyTutor) and resolveTutorChoice
      // moves the chosen card FROM that candidate's zone; `sourceZone` above is then only the shuffle-decision
      // fallback. Null on every single-zone tutor (the original path). Plain JSON (serialize-safe).
      sourceZones: Array.isArray(sourceZones) && sourceZones.length
        ? sourceZones.map((z) => (z === "hand" ? "hand" : z === "graveyard" ? "graveyard" : "library"))
        : null,
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
      // AI-F10 — MAY the searcher legally FAIL TO FIND? CR 701.23b: a stated-quality search
      // ("a basic land card", an MV-capped card) isn't required to find; CR 701.23d: a
      // quantity-only search ("a card") MUST find. Stamped tri-state by applyTutor:
      //   true  → the decline/find-nothing option is legal (quality-filtered or "you may" tutor)
      //   false → declining with candidates available is an ILLEGAL pass — the offer side drops
      //           the decline and resolveTutorChoice rejects a null pick on the wire
      //   null  → legacy caller / an old save without the flag — keeps today's decline-allowed
      //           behavior (non-breaking).
      mayFailToFind: mayFailToFind === true ? true : mayFailToFind === false ? false : null,
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
export function setPendingScryChoice(state, { controller, mode, cards, sourceName = null, reorder = false, mayShuffle = false }) {
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
      // REORDER-TOP (Ponder) — a "put them back in ANY order" dig: NONE of the looked-at cards leave the top, so
      // the settle keeps every card on top (the "moved → bottom/graveyard" partition is forced empty). Absent /
      // false on every ordinary scry/surveil (the original keep-subset behavior is byte-for-byte unchanged).
      ...(reorder ? { reorder: true } : {}),
      // Ponder's OPTIONAL "You may shuffle." — honored by resolveScryChoice when the settle opts in. Only ever
      // set alongside reorder; a plain scry/surveil never carries it.
      ...(mayShuffle ? { mayShuffle: true } : {}),
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
 * IMPRINT (CR 207.2c) — flag an imprint ETB awaiting the controller's pick of which card to exile from their
 * OWN hand ("Imprint — When this artifact enters, you may exile a nonartifact, nonland card from your hand."
 * — Chrome Mox). `candidates` is the already-FILTERED legal subset of the controller's hand as `{id, name}`;
 * the filter belongs to the caller because each imprint card names a different one (nonartifact-nonland,
 * instant with mana value ≤2, artifact, creature…), and `filterLabel` is what the seat is shown.
 *
 * `sourceId` is the IMPRINTING PERMANENT — the stamp's destination. It is carried on the choice rather than
 * re-derived at settle time because the permanent can leave between the pause and the pick, and a stamp
 * applied to whatever happens to be there instead would be a fabricated imprint.
 *
 * OPTIONAL by rule ("you MAY"): passing a null cardId at settle is a legal decline, and an imprint card with
 * nothing exiled must go on producing NOTHING. Hidden-info safe — the controller is looking at their own hand.
 */
export function setPendingImprintChoice(state, { controller, candidates, sourceId, sourceName = null, filterLabel = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "imprint-pending", controller, count: candidates.length, sourceName });
  return {
    ...next,
    pendingChoice: {
      kind: "imprint-exile",
      controller,
      candidates,
      sourceId,
      sourceName,
      filterLabel,
      optional: true,
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
export function setPendingImpulseDigChoice(state, { controller, candidates, restTo, sourceName = null, keep = 1, chosenIds = [], lookedAt = null, chosenTo = "hand", restOrder = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "impulse-dig-pending", controller, count: candidates.length, restTo, sourceName, keep });
  return {
    ...next,
    pendingChoice: {
      kind: "impulse-dig",
      controller,
      candidates,
      restTo,
      sourceName,
      // MULTI-KEEP: `keep` is how many cards go to hand in total, `chosenIds` those picked so far, and
      // `lookedAt` the ORIGINAL top-N size. The choice RE-RAISES until enough are picked, which is why
      // lookedAt must be carried: the final applyImpulseDig has to dispose the whole original set, not
      // just what is left in the shrinking candidate list. keep=1 leaves every existing caller unchanged.
      keep,
      chosenIds,
      lookedAt: lookedAt ?? candidates.length,
      // CORPUS ④-C (Kinnan): where the pick goes ("hand" | "battlefield") and how the rest are bottomed (null = printed
      // order | "random" = a seeded shuffle). Threaded explicitly — an unlisted field is a silent drop.
      // K7 (Make Your Own Luck): "plotExile" — the pick leaves for exile carrying the plot stamp (runProgram settles it).
      chosenTo: chosenTo === "battlefield" ? "battlefield" : chosenTo === "plotExile" ? "plotExile" : chosenTo === "freeCastExile" ? "freeCastExile" : chosenTo === "top" ? "top" : "hand", // + "top" (Thassa's Oracle, KN-1): the pick STAYS on top
      restOrder: restOrder === "random" ? "random" : null,
    },
  };
}

/**
 * TOP-CARD TAKE-OR-LEAVE-ON-TOP (BLITZ LK-2) — flag a "look at the top card of your library. If it's a
 * <quality> card, you may reveal it and put it into your hand." awaiting the controller's TAKE-or-LEAVE
 * decision (Dryad Greenseeker / Frost Augur / Herald's Horn). Only ever set when the top card ACTUALLY
 * matches the quality (applyLookTopTakeAtom resolves a non-match inline, with no pause and no surfacing —
 * hidden-zone honesty), so `candidate` is always the single matched top card as `{ id, name }` — the
 * controller's OWN library card (hidden-info safe, like the impulse-dig / scry candidates). Stored as a
 * one-element `candidates` array so the shared decisionWire whitelist + the driver's pending-pick offer
 * treat it uniformly with the other pick kinds. `restTo: "top"` records the DEFINING trait: a declined
 * card STAYS ON TOP (no disposal) — distinct from impulse-dig's bottom/graveyard. The driver PAUSES a
 * human (a real, non-dominated choice) and AUTO-TAKES for an AI (always take — strict card advantage;
 * autoPickLookTopTake). FIFO: one choice at a time. Plain JSON (serialize-safe).
 */
export function setPendingLookTopTakeChoice(state, { controller, candidate, sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "look-top-take-pending", controller, cardName: candidate?.name || null, sourceName });
  return {
    ...next,
    pendingChoice: {
      kind: "look-top-take",
      controller,
      candidates: candidate ? [candidate] : [],
      restTo: "top", // the declined / non-taken card STAYS ON TOP (no disposal) — the defining trait
      sourceName,
    },
  };
}

/**
 * DIG-LAND-TO-BATTLEFIELD (Silverback Elder mode 2) — flag a "look at the top
 * N of your library, put a LAND from among them onto the battlefield [tapped], the rest to the bottom in a
 * random order" awaiting the controller's pick of WHICH land to put out. This is a DIFFERENT effect from
 * impulse-dig (which keeps a card to HAND): here the chosen land enters the BATTLEFIELD (firing its ETB), and
 * the rest of the looked-at set (including any non-chosen lands + all nonland cards) go to the BOTTOM of the
 * library in a RANDOM order. `candidates` is ONLY the LAND cards among the top N as `{ id, name }` (the "you
 * may put a LAND card" gate — nonland cards are never puttable, so they're not candidates); an empty candidate
 * list means the whole looked-at set just bottoms with no put (resolved inline by the atom, no pause). `restIds`
 * is the FULL looked-at set's ids (top N, ordered) so the settler can dispose everything-but-the-chosen to the
 * bottom without re-reading the library (which the enter-battlefield move would have already mutated). The put
 * is OPTIONAL ("you may"), but since a land to the battlefield strictly dominates that land going to the bottom
 * (no cost, ramp), the modeled line always puts the best available land — an explicit decline is a future
 * refinement (like impulse-dig's dominated "you may reveal" decline). Public to the controller (own library).
 * FIFO: one choice at a time. Plain JSON (serialize-safe).
 */
export function setPendingDigLandChoice(state, { controller, candidates, restIds, entersTapped = false, sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "dig-land-pending", controller, count: candidates.length, entersTapped, sourceName });
  return {
    ...next,
    pendingChoice: {
      kind: "dig-land-to-battlefield",
      controller,
      candidates,
      restIds,
      entersTapped: !!entersTapped,
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
export function setPendingDivideChoice(state, { controller, amount, candidates, group, sourceName = null, maxTargets = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "divide-damage-pending", controller, amount, count: candidates.length, sourceName });
  return {
    ...next,
    // maxTargets (SHELF CAP13 — the printed "among one, two, or three targets" bound, CR 601.2d). null = the
    // unbounded "any number of target" forms. Mirrors setPendingDistributeChoice's maxTargets exactly, and
    // is honored in all three consumers: the auto-pick, the settle, and the session-level submit guard.
    pendingChoice: { kind: "divide-damage", controller, amount, candidates, group, sourceName, maxTargets },
  };
}

/**
 * Flag a DISTRIBUTE-COUNTERS choice (The Earth Crystal): the controller allots `amount` +1/+1 counters among
 * up to `maxTargets` of their own creatures (`candidates`), each chosen target getting ≥1 (CR 121.5-shaped,
 * same full-assignment rule as divide-damage). resolveDistributeChoice applies each via the add-counter atom
 * so the controller's counter doublers compose (CR 616). Mirrors setPendingDivideChoice exactly.
 */
export function setPendingDistributeChoice(state, { controller, amount, counterType = "+1/+1", maxTargets = null, perTargetCap = null, candidates, sourceName = null, moveFromId = null, anyNumber = false }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "distribute-counters-pending", controller, amount, counterType, count: candidates.length, sourceName });
  return {
    ...next,
    // perTargetCap (SHELF M1c — Mothman's "a counter on EACH of up to X"): each chosen target may receive at
    // most this many; the auto-pick and the settle both honor it, so a surplus is under-spent, never stacked.
    // moveFromId + anyNumber (Forgotten Ancient, W1 — CR 122.5): a MOVE removes the spent total from this
    // source at settle, and "any number" makes ZERO a legal assignment (the full-assignment rule is waived).
    pendingChoice: { kind: "distribute-counters", controller, amount, counterType, maxTargets, perTargetCap, candidates, sourceName, moveFromId, anyNumber },
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
/**
 * ===== HAND→LIBRARY-TOP ===== — flag the Brainstorm-class put-back ("put two cards from your hand
 * on top of your library in any order"): the controller picks ONE card per settle; the chain
 * re-raises until `remaining` are placed. Each settled card goes on TOP at that moment, so later
 * picks stack above earlier ones — the player controls the final order pick by pick, which is what
 * "in any order" grants (CR 401.4 — library order is the owner's choice when an effect says so).
 * NOT a discard: no graveyard, no discard triggers. Plain JSON — serialize-safe.
 */
export function setPendingHandToLibraryTopChoice(state, { controller, remaining, candidates, sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "hand-to-library-top-pending", controller, remaining, count: candidates.length, sourceName });
  return {
    ...next,
    pendingChoice: { kind: "hand-to-library-top", controller, remaining, candidates, sourceName },
  };
}

export function setPendingDiscardChoice(state, { controller, remaining, candidates, queue, sourceName = null, connive = null }) {
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
      // CONNIVE rider (BLITZ EK-1, CR 701.50a) — `{ permanentId, controller }` of the conniving permanent.
      // resolveDiscardChoice checks the settled card's landness and places the +1/+1 counter. Null for every
      // non-connive discard (byte-identical behavior). Plain JSON — serialize-safe.
      connive,
    },
  };
}

/**
 * ===== SOFT-CNT ===== — flag a "soft" counter (Force Spike / Mana Leak / Mana Tithe / Spell Pierce /
 * …) awaiting the TARGETED SPELL'S CONTROLLER's pay-or-be-countered decision (CR 701.6a + the spell's
 * "unless its controller pays {N}" clause). When the counter resolves, instead of countering outright
 * it flags this: `controller` is the controller of the spell on the stack (an opponent in 4P — NOT the
 * counter's caster), so the driver's `pause = pc.controller === "user"` rule pauses for a human whose
 * spell is under threat and auto-decides for an AI. `amount` is the fixed generic {N}; `spellId` is the
 * stack object to counter (re-found by id at settle — it may have moved). If the controller pays {N}
 * (and can afford it), the spell SURVIVES; otherwise it's countered. The caster's continuation rides on
 * `pendingChoice.resume` (attached by runProgram). FIFO: one choice at a time.
 */
export function setPendingSoftCounterChoice(state, { controller, amount, cost = null, spellId, spellName = null, sourceName = null, counterDest = null }) {
  if (state.pendingChoice) return state;
  // `amount` is the legacy FIXED-GENERIC cost (Force Spike / Mana Leak / generic-mana ward). `cost` is the
  // KW-WARD-PR2 STRUCTURED cost descriptor ({kind:"mana",mana} | {kind:"life",life}) — when present it
  // overrides `amount` at settle (resolveSoftCounterChoice branches on it). `counterDest` (CS-1 —
  // Syncopate / No More Lies) is the decline path's zone redirect ("exile"), threaded through to
  // counterSpellById so the suspend can't drop it. For logging, surface the headline number either way.
  const logAmount = cost ? wardCostHeadline(cost) : amount;
  const next = logEvent(state, { kind: "soft-counter-pending", controller, amount: logAmount, spellName, sourceName });
  return {
    ...next,
    pendingChoice: {
      kind: "soft-counter",
      controller,
      amount,
      ...(cost ? { cost } : {}),
      ...(counterDest ? { counterDest } : {}),
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
/**
 * TEMPTING OFFER (Tempt with Discovery, 2026-09-03 — CR 701 "tempting offer" ability word): the OPPONENT's
 * "you may search your library for a land card and put it onto the battlefield". controller = the opponent asked
 * (the driver routes the pause to that seat — a human decides at the panel, the AI by autoPickTemptingOffer). The
 * offer's running state (offerer, opponents still to ask, accepted count) rides the choice; the settler either
 * suspends the opponent's own land search (accept) or asks the next opponent / pays the offerer (decline).
 * `hasLand` is read here for the panel; accepting with no land still counts as having searched (CR 701.19c).
 */
export function setPendingTemptingOfferChoice(state, { controller, offerer, accepted = 0, opponents = [], sourceName = null, resume = null }) {
  if (state.pendingChoice) return state;
  const hasLand = (state.players?.[controller]?.library || []).some((c) => /\bLand\b/i.test(String(c.type || c.type_line || "")));
  const next = logEvent(state, { kind: "tempting-offer-pending", controller, offerer, sourceName });
  return {
    ...next,
    pendingChoice: {
      kind: "tempting-offer",
      controller,
      offerer,
      accepted,
      opponents: [...opponents],
      hasLand,
      sourceName,
      ...(resume ? { resume } : {}),
    },
  };
}

export function setPendingOptionalManaPaymentChoice(state, { controller, cost, effectAtoms = [], sourceName = null, targets = [], elseAtoms = [], available = true }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "optional-mana-payment-pending", controller, amount: wardCostHeadline(cost), sourceName });
  return {
    ...next,
    pendingChoice: {
      kind: "optional-mana-payment",
      controller,
      cost,
      effectAtoms,
      // FALLBACK + CONDITION (Springheart Nantuko). `elseAtoms` runs when the payment is NOT made — declined
      // or impossible. `available: false` means the card's own condition forbids paying at all, so the pause
      // surfaces only to be declined (the reflexive-sac pattern in the same family). Both default so every
      // other carrier's choice object is byte-identical.
      elseAtoms,
      available,
      sourceName,
      // The chosen targets, locked at announcement (CR 603.3d) and replayed into the payoff on settle.
      targets,
    },
  };
}

/**
 * ===== OPTIONAL-LIFE-PAYMENT (CR 614.1c + 119.4 — the SHOCKLAND clause, LANDS-TIER slice 2) ===== — flag
 * "As this land enters, you may pay N life. If you don't, it enters tapped." awaiting the CONTROLLER's
 * pay-or-decline. Raised by the PLAY-LAND path AFTER the land is on the battlefield UNTAPPED: on settle,
 * paying deducts the life and leaves it untapped; declining taps it (fromEnter — CR 701.26a, entering
 * tapped is not "becoming tapped"). Nothing else can act while the pause is open, so "enter untapped,
 * decide, tap on decline" is observably identical to the replacement it models.
 *
 * NO `resume` — this pause is raised outside any effect program (a land drop), so the settler must not
 * call resumeAfterChoice; it finalizes the stack (SBA + trigger flush) directly. `permanentId` is the
 * entered land; `life` the printed N. FIFO: one choice at a time (the family rule).
 */
/**
 * ===== SYLVAN LIBRARY (SG-15b, CR 603.7c + 121.4) ===== — suspend on ONE drawn card's "pay L life or put
 * the card on top of your library" decision. Raised inside an effect program (the sylvan-library atom), so
 * runProgram attaches the continuation as `.resume`; the settler chains the next card (`remaining`) under
 * the SAME resume, and resumes the program after the last one. `cardId` is the card in hand this decision
 * is about; `cardName` for the picker. FIFO: one choice at a time (the family rule).
 */
/** TAINTED PACT (POD-SIM THREE · BI-2, 2026-09-05) — the exiled top card: take it into hand, or continue (exile the next).
 *  `exiledNames` carries every name exiled this way so far (the duplicate stop rule). Mirrors the Sylvan chain. */
export function setPendingTaintedPactChoice(state, { controller, cardId, cardName = null, cardType = "", exiledNames = [], sourceName = null, resume = undefined }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "tainted-pact-pending", controller, cardId, cardName, exiled: exiledNames.length, sourceName });
  return {
    ...next,
    pendingChoice: { kind: "tainted-pact", controller, cardId, cardName, cardType, exiledNames: [...exiledNames], sourceName, ...(resume !== undefined ? { resume } : {}) },
  };
}

export function setPendingSylvanLibraryChoice(state, { controller, cardId, cardName = null, life, remaining = [], sourceName = null, resume = undefined }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "sylvan-library-pending", controller, cardId, cardName, amount: life, sourceName });
  return {
    ...next,
    pendingChoice: { kind: "sylvan-library", controller, cardId, cardName, life, remaining: [...remaining], sourceName, ...(resume !== undefined ? { resume } : {}) },
  };
}

export function setPendingOptionalLifePaymentChoice(state, { controller, permanentId, life, sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "optional-life-payment-pending", controller, amount: life, sourceName });
  return {
    ...next,
    pendingChoice: { kind: "optional-life-payment", controller, permanentId, life, sourceName },
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
export function setPendingOptionalSacBySubtypeChoice(state, { controller, subtype, available, effectAtoms = [], sourceName = null, candidates = null }) {
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
      // CHOSEN (shelf D13): the non-fungible form lists what may be sacrificed — `{ id, name, manaValue, token }` — and
      // the settle takes the chosen id. The value-token form carries none and keeps its any-one-of-them settle.
      ...(Array.isArray(candidates) ? { candidates } : {}),
    },
  };
}

/**
 * ===== CHANGE THE TARGET (shelf D14, CR 115.7a) ===== — suspend while the redirector (`controller`) picks which other legal
 * target a single-target spell or ability moves to (Misdirection and kin). There is no decline: the target stays only when
 * there is NO other legal target, which never pauses. `stackObjectId` is the redirected object; `candidates` are the target
 * objects changeTargetAlternatives built (plain JSON — the settler writes the picked one back as-is); `from` names the current
 * target and `spellName` the object, for the panel. The continuation rides on `pendingChoice.resume` (attached by runProgram).
 */
export function setPendingChangeTargetChoice(state, { controller, stackObjectId, spellName = null, from = null, candidates, sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "change-target-pending", controller, stackObjectId, count: candidates.length, sourceName });
  return {
    ...next,
    pendingChoice: { kind: "change-target", controller, stackObjectId, spellName, from, candidates, sourceName },
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
export function setPendingOptionalDiscardPaymentChoice(state, { controller, available, effectAtoms = [], sourceName = null, discardCount = 1, declineLoseLife = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "optional-discard-payment-pending", controller, available, sourceName, discardCount, ...(declineLoseLife != null && { declineLoseLife }) });
  return {
    ...next,
    // discardCount defaults to 1, so every existing caller is byte-identical; only the cost-bearing
    // graveyard self-return (Old One Eye, two cards) passes anything else.
    // N6 (2026-09-04): `declineLoseLife` — "loses N life unless they discard a card" (Painful Quandary): declining, or an
    // empty hand, costs the chooser N life at settle. Absent on every prior pause.
    pendingChoice: { kind: "optional-discard-payment", controller, available, effectAtoms, sourceName, discardCount, ...(declineLoseLife != null && { declineLoseLife }) },
  };
}

/**
 * OPTIONAL-EXILE-SELF PAYMENT (Undead Butler, CR 603.7) — "you may exile it. When you do, <payoff>": the
 * dies-trigger self-exile cost. `cardId` is the dead card's durable id (diesCtx.triggeringCardId);
 * `available` = the card sits in a graveyard NOW (re-checked at settle, CR 603.6e — it may have been
 * recurred/exiled during the pause). `targets` = the payoff's flush-locked target (CR 603.3d), replayed at
 * settle. The driver pauses a human and auto-decides an AI (pay iff available — the payoff is upside). FIFO.
 */
/**
 * MILLED-PICK (Ripples of Undeath / Six — 2026-08-15) — "put a [land ]card from among those cards into
 * your hand": pick ONE of the candidate cards (the _lastMilledIds ∩ live-graveyard set, computed by the
 * applier). The driver pauses a human and auto-picks the FIRST candidate for an AI (deterministic).
 * resolveMilledPickChoice moves the chosen card graveyard → hand. FIFO.
 */
export function setPendingMilledPickChoice(state, { controller, candidates = [], sourceName = null, toZone = "hand", owner = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "milled-pick-pending", controller, count: candidates.length, sourceName, toZone, ...(owner && owner !== controller && { owner }) });
  return {
    ...next,
    // ④-P: `toZone` — "hand" (the milled-pick's own return) or "exile" (a target player's forced graveyard exile,
    // Relic of Progenitus); the settler moves the pick there. Absent on a legacy pause → "hand".
    // T7 (2026-09-04): `owner` — whose graveyard the candidates sit in and whose hand receives the pick, when that is
    // NOT the chooser (Tasigur "a nonland card of an opponent's choice": the opponent chooses, the controller
    // receives). Absent → the chooser's own zones, every prior pause unchanged.
    pendingChoice: { kind: "milled-pick", controller, candidates, sourceName, toZone, ...(owner && owner !== controller && { owner }) },
  };
}

export function setPendingOptionalExileSelfChoice(state, { controller, available, cardId, effectAtoms = [], sourceName = null, targets = [] }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "optional-exile-self-pending", controller, available, sourceName, cardId });
  return {
    ...next,
    pendingChoice: { kind: "optional-exile-self-payment", controller, available, cardId, effectAtoms, sourceName, targets },
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
export function setPendingTaxedPaymentChoice(state, { payer, beneficiary, cost, sourceName = null, declinePayoff = "draw", declineAmount = null, declineEdict = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "taxed-payment-pending", payer, beneficiary, amount: wardCostHeadline(cost), sourceName, declinePayoff, ...(declineAmount != null && { declineAmount }) });
  return {
    ...next,
    // declinePayoff — what the BENEFICIARY gets when the payer declines / can't afford: "draw" (Rhystic Study —
    // draw a card) or "treasure" (Smothering Tithe — create a Treasure token). resolveTaxedPaymentChoice branches
    // on it. Defaults to "draw" so every existing taxed-draw caller is byte-for-byte unchanged.
    // N7 (2026-09-04): "loseLife" — the decline lands on the PAYER as `declineAmount` life loss (Phyrexian Tyranny
    // "loses 2 life unless they pay {2}"); the beneficiary gets nothing.
    // 2026-09-30: "edict" — the decline lands on the PAYER as the parsed edict atom `declineEdict` (the Rishadan pirates:
    // "each opponent sacrifices a permanent of their choice unless they pay {1}"); the beneficiary gets nothing.
    pendingChoice: { kind: "taxed-payment", controller: payer, payer, beneficiary, cost, sourceName, declinePayoff, ...(declineAmount != null && { declineAmount }), ...(declineEdict && { declineEdict }) },
  };
}

/**
 * ===== ITERATED-EDICT ===== (Torment of Hailfire, CR 118.9) — flag ONE per-opponent edict decision awaiting
 * the AFFECTED OPPONENT's mode pick: lose 3 life, sacrifice a nonland permanent, or discard a card. The
 * `controller` here is the OPPONENT making the choice (the driver's `pause = pc.controller === "user"` rule
 * pauses a human opponent and auto-picks for an AI), NOT the caster. `modes` is the legal-mode list ("life"
 * always, plus "sacrifice"/"discard" when the pools are non-empty) and `sac`/`disc` are the corresponding
 * candidate pools as `{ id, name }` — all public (the opponent's board + hand size), and the sac permanent /
 * discard card are chosen by the opponent, so it's hidden-info safe. The chain resolves as a sequence of
 * these picks: `queue` is the remaining per-opponent decisions (head = the current one). The caster's
 * continuation rides on `pendingChoice.resume` (attached by runProgram on the first pause; resolveEdictMode-
 * Choice carries it forward across the chain). Only flagged when a REAL choice exists (≥2 modes); a life-only
 * opponent is the forced inline loss with no pause. FIFO (guarded).
 */
export function setPendingEdictModeChoice(state, { controller, modes, sac = [], disc = [], queue = null, sourceName = null }) {
  if (state.pendingChoice) return state;
  const next = logEvent(state, { kind: "edict-mode-pending", controller, modes, sourceName });
  return {
    ...next,
    pendingChoice: { kind: "edict-mode", controller, modes, sac, disc, queue, sourceName },
  };
}

/** A short human number for a structured ward cost, for the pending-choice log banner. */
function wardCostHeadline(cost) {
  if (cost?.kind === "life") return cost.life;
  // NON-MANA sac-unless-pay kinds (2026-08-12) — a count, not a pip total; without these arms the log
  // banner's amount was null (discard) / would be null (sacrifice).
  if (cost?.kind === "discard" || cost?.kind === "sacrifice" || cost?.kind === "return-land") return cost.count || 1;
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
