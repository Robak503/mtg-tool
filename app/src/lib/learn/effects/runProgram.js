/**
 * effects/runProgram.js — the `effect-program` resolver (Phase-2 P2.2 keystone).
 *
 * `runEffectProgram(state, stackObject)` reads the frozen `{ program, controller,
 * targets }` off the stack object's payload params and executes the program's
 * atoms in printed order (CR 608.2c).
 *
 * ALL-OR-NOTHING confidence boundary (the fail-safe core): a `high`-confidence
 * program runs EVERY atom; a `low`-confidence program runs ZERO and hands the
 * card to the Arbiter seam (`markPendingArbiter`) — never a partial execution,
 * never a fabricated effect, never a silent no-op (CLAUDE.md §1.2/§8). A defensive
 * per-atom null check routes to the same seam if an atom somehow lacks a resolver.
 *
 * INTERACTIVE PAUSE (tutor): an atom may set `state.pendingChoice` instead of acting
 * (a tutor's library search needs the player to pick a card). The loop detects it,
 * records WHERE to resume (`pendingChoice.resume`), and returns — the program is
 * suspended mid-resolution. The session driver surfaces a picker or auto-picks, then
 * `resolveTutorChoice` applies the fetch + shuffle and re-enters the loop at the
 * recorded `nextAtomIndex`. The pause data is plain JSON, so a game serialized
 * mid-choice restores intact.
 *
 * Pure + serialize-safe: imports the leaf seam markers + the atom table + helpers.
 * Does NOT import resolvers.js (resolvers imports THIS), so the edge never cycles.
 */

import { markPendingArbiter } from "../pendingArbiter.js";
import { clearPendingChoice, setPendingTutorChoice, setPendingImpulseDigChoice, setPendingSylvanLibraryChoice } from "../pendingChoice.js"; // + SG-15b: the Sylvan Library per-card pause is chained by its own settler
import { updatePermanentSafe } from "../gameState.js"; // IMPRINT (CR 207.2c): the stamp is written onto the imprinting permanent
import { moveCardToZone, logEvent, applyScrySurveil, applyImpulseDig, findPermanent, creatureToughness, creaturePower, loseLife, drawCards, hasEnergy, spendEnergy, recordGraveyardEvents, getCounter, removeCounter, destroyLethalCreatures, tapPermanent } from "../gameState.js"; // tapPermanent — the shockland decline (LANDS-TIER slice 2) taps the entered land with fromEnter
import { resolveAtom, shuffleControllerLibrary, tutorManaValue, cardMatchesTutorFilter, sacrificeCreatureEffect, sacrificePoolMatch, advanceDiscardChain, advanceHandToLibraryTopChain, advanceSacrificeChain, counterSpellById, enterCardFromZone, controllerSacSubtypeMatch, bottomLibraryCardsByIds, advanceEdictChain, applyEdictMode, EDICT_LIFE_LOSS, applyConniveCounter, pitchRandomDiscard } from "./effectAtoms.js";
import { evalLeastValuableCmp, evalLeastValuableCardCmp, evaluateBoard, policyEvalEnabledFor } from "../boardEval.js"; // QUARTET PHASE 1 — the shared evaluator rankings (boardEval imports only leaves; one-way edge, cycle-free)
import { programConfidence } from "./parser.js";
import { checkDiscardTriggers, checkDiesTriggers } from "../triggers.js"; // TRIG-DISCARD (CR 701.9a) — both pending-choice discard settles fire the event; checkDiesTriggers — the move-from-self settle's lethal sweep (W1)
import { isLandCard } from "./atoms/shared.js"; // SAC-UNLESS-RETURN-LAND — shared.js is a strict leaf, so this edge is DAG-safe

// SAC-UNLESS-RETURN-LAND (2026-08-12) — the ONE pool predicate for a return-a-land upkeep cost
// (Waterspout Djinn "an untapped Island", Living Tsunami "a land"), used by BOTH autoPickSacUnlessPay
// and resolveSacUnlessPayChoice so offer and payment cannot disagree. Word-anchored subtype read
// (a nonbasic Island qualifies); the untapped requirement is the Djinn's printed gate.
const returnLandPoolMatch = (cost, p) =>
  isLandCard(p.card)
  && (!cost.subtype || new RegExp(`\\b${cost.subtype}\\b`, "i").test(String(p.card?.type || p.card?.type_line || "")))
  // LANDS-13 — the lairs' "a non-Lair land": a land carrying the excluded subtype cannot pay.
  && (!cost.notSubtype || !new RegExp(`\\b${cost.notSubtype}\\b`, "i").test(String(p.card?.type || p.card?.type_line || "")))
  && (!cost.untapped || !p.tapped);
import { evaluateInterveningIf } from "../interveningIf.js"; // CONDITIONAL SPELL RIDER (BLITZ CD-1) — the shared board-condition readers; runProgram → interveningIf → gameState is a leaf edge (no cycle)
import { addContinuousEffect } from "../layers.js"; // SAVAGE ORDER — the fetched-permanent UEOT keyword grants; layers never imports runProgram (gameState itself imports layers), so this edge is cycle-free
import { canAfford, manaSources, payGenericMana, payManaCost } from "../manaModel.js";

/**
 * The targets that belong to the atom at `atomIndex`. P2.5 multi-clause / modal /
 * X programs bind each chosen target to its atom (`ResolvedTarget.atomIndex`), so
 * clause 0 can target a creature and clause 1 a player. The runner filters by
 * that tag. Legacy single-atom casts pass UNTAGGED targets (no `atomIndex`) — for
 * those we apply every target to the atom (the degenerate single-atom case), which
 * preserves every pre-P2.5 cast path byte-for-byte.
 */
function targetsForAtom(targets, atomIndex) {
  const tagged = targets.some(t => typeof t?.atomIndex === "number");
  return tagged ? targets.filter(t => t.atomIndex === atomIndex) : targets;
}

/**
 * The atom index a REFERENT binds to (CR 608.2) — the nearest PRECEDING atom that actually has targets,
 * skipping any referents in between.
 *
 * ⭐ THE SKIP IS THE WHOLE POINT, AND WITHOUT IT A CHAIN SILENTLY DOES NOTHING. A referent atom is emitted
 * with NO targetType, so the cast-time enumerator never allocates it a slice. In "Gain control of target
 * creature until end of turn. Untap THAT creature. IT gains haste until end of turn." (Act of Treason) the
 * third atom's antecedent at a literal i-1 is the SECOND atom — which owns no targets — so it would read an
 * EMPTY slice and resolve as a clean no-op. The card would look fully modeled and quietly drop its haste.
 * Every referent in a chain refers to the SAME original target, so they all read that one atom's slice.
 *
 * Byte-identical for the single-referent case that has always worked: atoms[i-1] is a targeting atom there,
 * so the loop exits immediately and this returns i-1.
 */
function referentSourceIndex(atoms, i) {
  let j = i - 1;
  while (j >= 0 && atoms[j]?.bindPreviousTargets) j -= 1;
  return j;
}

/**
 * The atoms a program runs (the chosen modal mode(s), or the sequence). `chosenMode` is either a single
 * mode index ("Choose one") OR an ARRAY of indices (MODAL-2 "Choose two" / "one or both"). For an array,
 * every chosen mode's atoms are concatenated IN ASCENDING MODE ORDER — the same order the cast-time
 * enumerator (targeting.expandCastChoices) tagged the per-atom targets with, so `targetsForAtom`'s global
 * atomIndex lines up and NO mode is dropped (the MODAL-2 executor half of the gate+executor invariant).
 */
function programAtoms(program, chosenMode) {
  if (program.structure !== "modal") return program.atoms;
  const modes = program.modal?.modes || [];
  if (Array.isArray(chosenMode)) return chosenMode.flatMap((k) => modes[k]?.atoms || []);
  return modes[chosenMode]?.atoms || [];
}

/**
 * GY-1 (CR 608.2m): as the FINAL step of a natively-resolved instant/sorcery, put the spell card
 * into its owner's graveyard. `disposition` = { playerId, card } threaded from applyCastSpell via
 * the payload (and via pendingChoice.resume across suspensions). Guards: no disposition -> no-op;
 * a token/copy card ceases to exist instead (CR 707.10a); an eliminated owner (CR 800.4a) -> no-op.
 * The card is ZONELESS here (it left its zone at cast), so this is a direct append like
 * placeCounteredCard — moveCardToZone can't move a card that is in no zone.
 */
export function finishSpellResolution(state, disposition, { selfExile = false, selfShuffle = false } = {}) {
  const playerId = disposition?.playerId;
  const card = disposition?.card;
  if (!playerId || !card) return state;
  if (card.token || card.isCopy) return state;
  const player = state.players?.[playerId];
  if (!player) return state;
  // SELF-EXILE (Finale of Revelation "Exile <this>.") — the resolving spell exiles ITSELF instead of the default
  // graveyard disposition (CR 608.2m is replaced by the printed "Exile ~"). The card is ZONELESS here (it left
  // its zone at cast), so this is a direct append to the exile zone (a token/copy already returned above — it
  // ceases to exist, never exiled). Everything else about GY-1 (no disposition → no-op; eliminated owner → no-op)
  // is identical.
  // FLASHBACK (CR 702.34a): `disposition.exile` (set by applyCastSpell for a flashback cast) diverts the SAME
  // way — the card leaves the stack to EXILE, not the graveyard, whether it resolved or fizzled (this function is
  // the disposition site for BOTH). The flag rides the disposition object, so it survives every resume across a
  // resolution-time choice (the resume threads spellToGraveyard verbatim). Prevents the recast-from-graveyard FP.
  if (selfExile || disposition?.exile) {
    const next = {
      ...state,
      players: { ...state.players, [playerId]: { ...player, exile: [...(player.exile || []), card] } },
    };
    return logEvent(next, { kind: "spell-to-exile", playerId, cardName: card.name || null });
  }
  // SELF-SHUFFLE (Green Sun's Zenith + the Sun's Zenith / Beacon family "Shuffle <this> into its owner's
  // library.") — the resolving spell shuffles ITSELF into its OWNER's library instead of the graveyard (CR
  // 608.2m replaced by the printed "Shuffle ~ into its owner's library"). The ZONELESS card is appended to the
  // owner's library, then the library is shuffled deterministically (the same threaded-seed shuffle every other
  // library shuffle uses — serialize-stable, CR 701.19e). A token/copy already returned above (ceases to exist,
  // never shuffled in). Everything else about GY-1 (no disposition / eliminated owner → no-op) is identical.
  if (selfShuffle) {
    const withCard = {
      ...state,
      players: { ...state.players, [playerId]: { ...player, library: [...(player.library || []), card] } },
    };
    const shuffled = shuffleControllerLibrary(withCard, playerId);
    return logEvent(shuffled, { kind: "spell-to-library-shuffled", playerId, cardName: card.name || null });
  }
  let next = {
    ...state,
    players: { ...state.players, [playerId]: { ...player, graveyard: [...(player.graveyard || []), card] } },
  };
  // GY-EVENT (SHELF S7): the resolved spell card enters its owner's graveyard from the stack (CR 608.2m).
  next = recordGraveyardEvents(next, [{ dir: "enter", card, gyOwner: playerId, zone: "stack" }]);
  return logEvent(next, { kind: "spell-to-graveyard", playerId, cardName: card.name || null });
}

export function runEffectProgram(state, stackObject, { startIndex = 0 } = {}) {
  const params = stackObject?.payload?.params || {};
  const { program, controller, targets = [], xValue = null, sourceId = null, context = {}, kicked = false } = params;

  // Low confidence (or absent program) → ZERO atoms, route to the Arbiter seam.
  if (programConfidence(program) === "low") {
    return markPendingArbiter(state, stackObject, "effect-program (low confidence — unmodeled effect)");
  }

  const atoms = programAtoms(program, params.chosenMode);

  let next = state;
  // MODE-MEMORY (Teval's Judgment, 2026-08-15): stamp the resolved mode into the per-source per-turn
  // ledger (the once-latch convention — cleared at untap) so the flush chooser never re-offers it this
  // turn. Stamped at RESOLUTION, matching the printed "hasn't been CHOSEN" as closely as the engine's
  // flush/resolve split allows (two same-batch stack copies could both pick one mode pre-resolution — a
  // sequential-flush rarity for a once-per-batch watcher; the repeat would be an extra pick of a mode
  // the card allows only once, accepted and documented rather than hidden).
  if (program.modal?.modeMemoryPerTurn && params.sourceId != null && params.chosenMode != null && !Array.isArray(params.chosenMode)) {
    next = { ...next, onceTriggersFiredThisTurn: { ...(next.onceTriggersFiredThisTurn || {}), [`${params.sourceId}_mode${params.chosenMode}`]: true } };
  }
  const cardName = stackObject?.source?.name || null;
  // CR 608.2b (CR-remediation B4) — if EVERY target the spell/ability had when it was put on the
  // stack is now ABSENT, it doesn't resolve at all: no atom runs. Before this gate, only the
  // per-atom missing-target no-op existed, so a trailing NON-targeted rider ("Destroy target
  // creature. You gain 2 life.") still executed on a fully-fizzled spell — a wrong play. Checked at
  // ENTRY only (startIndex 0; a resumed program already began resolving legally). Existence-based:
  // the target left its zone (battlefield / stack / that graveyard) or the game. A target that still
  // EXISTS but is now untargetable (gained protection/hexproof) keeps today's per-atom handling —
  // under-enforcing the fizzle is the safe direction; over-fizzling a legal spell is not (CREED).
  // Per the rule, SOME targets still present ⇒ the spell resolves and does as much as it can.
  if (startIndex === 0 && targets.length > 0) {
    const checkable = targets.filter((t) => t && typeof t === "object" && t.id != null && typeof t.type === "string");
    const stillPresent = (t) => {
      if (t.type === "creature" || t.type === "permanent") return !!findPermanent(state, t.id)?.permanent;
      if (t.type === "player") return !!state.players?.[t.id];
      if (t.type === "spell") return (state.stack || []).some((o) => o.id === t.id);
      if (t.type === "graveyardCard") {
        const owners = t.controller ? [t.controller] : Object.keys(state.players || {});
        return owners.some((pid) => (state.players?.[pid]?.graveyard || []).some((c) => c.id === t.id));
      }
      return true; // an unrecognized target shape is never grounds to fizzle (CREED)
    };
    if (checkable.length > 0 && !checkable.some(stillPresent)) {
      const fizzled = logEvent(state, { kind: "spell-fizzle", source: cardName, reason: "all targets illegal (CR 608.2b)", controller });
      // The fizzled card reaches its owner's graveyard (CR 608.2b) — printed self-exile/self-shuffle
      // dispositions are resolution effects and a fizzled spell never resolves, so they do NOT apply.
      return finishSpellResolution(fizzled, params.spellToGraveyard);
    }
  }
  for (let i = startIndex; i < atoms.length; i++) {
    const atom = atoms[i];
    // CONDITIONAL SPELL RIDER (BLITZ CD-1, CR 608.2) — a `condition`-gated rider ("If you control a Wizard,
    // draw a card") applies ONLY when the board condition holds AS this instruction resolves (CR 608.2, in
    // written order — so `next`, the state after earlier atoms, is the correct read). Reuses the intervening-if
    // board readers verbatim (evaluateInterveningIf). The parser attaches `condition` ONLY for spell-readable
    // board queries, so a real game state yields true/false here; a defensive null (never expected) is treated
    // as not-met → SKIP (the false-negative-safe direction — a rider is dropped, never fabricated; CREED).
    if (atom.condition && evaluateInterveningIf(next, atom.condition, controller, context) !== true) continue;
    // KICKED-SPELL-EFFECT (CR 702.33e) — a `kickedOnly` atom (the "If this spell was kicked, <extra>" payoff)
    // runs ONLY when the spell was cast kicked (params.kicked). On a normal cast it's SKIPPED — never resolved,
    // never a fabricated effect (the cardinal CREED guarantee for the not-kicked path). The base atoms (no
    // `kickedOnly`) always run. On a kicked cast it falls through and resolves like any other atom.
    if (atom.kickedOnly && !kicked) continue;
    // ⭐ THE COMPLEMENT — `nonKickedOnly`, for the REPLACEMENT payoff ("… deals 3 damage. If this spell was
    // kicked, it deals 5 damage INSTEAD" — Roil Eruption, Shivan Fire, Burst Lightning, Cinderclasm, Might of
    // Murasa, Explosive Growth). An additive payoff appends an atom and needs only `kickedOnly`; a
    // REPLACEMENT payoff needs BOTH halves to be conditional, because the base must NOT resolve on a kicked
    // cast — otherwise the spell deals 3 damage AND 5 damage. The two flags are exact mirrors and exactly one
    // of the pair resolves on any given cast, which is what "instead" means (CR 614 replacement, expressed
    // here as mutually exclusive atoms rather than a modification of the base).
    if (atom.nonKickedOnly && kicked) continue;
    // α2 — an OPTIONAL atom ("you may <effect>"): suspend so the controller decides whether to take
    // it (a real player yes/no, or AI/Expert auto-decide). resolveOptionalChoice runs-or-skips this
    // atom then resumes. Mirror the tutor/scry pause — plain JSON, serialize-safe; never resolve a
    // "may" as mandatory (that would be a forbidden mis-apply).
    if (atom.optional) {
      // TARGET-FACING "MAY" (`optionalDeciderIsTarget`, CR 702.124j) — almost every printed optional reads
      // "YOU may", so the controller decides and the plain `controller` below is right. Partner-with reads
      // "TARGET PLAYER may search their library…", and the choice is that player's, not the caster's.
      //
      // Overriding ONLY pendingChoice.controller is what makes this safe: `resume.controller` (a separate
      // field, set just below) still carries the effect's real controller, and resolveOptionalChoice reads
      // the resume for the atom's context and its logging. The one other thing pc.controller drives there is
      // the eliminated-player bail-out — which under this flag correctly asks whether the DECIDER is still in
      // the game, since a departed target means the ability does nothing.
      //
      // No legal player target → skip the atom outright rather than fall back to the controller: asking the
      // caster a question the card addressed to someone else would let them take an effect that was never
      // theirs to take.
      const decider = atom.optionalDeciderIsTarget
        ? (targetsForAtom(targets, i).find((tg) => tg.type === "player" && next.players?.[tg.id])?.id ?? null)
        : controller;
      if (decider == null) continue;
      return {
        ...next,
        pendingChoice: {
          kind: "optional-effect", controller: decider, atomIndex: i, effectOp: atom.op, cardName,
          // `context` MUST ride along — a context-dependent atom (discover X = the triggering creature's
          // toughness, via ctx.triggeringPermanentId) loses its trigger context on resume otherwise → X=0.
          // `kicked` rides along so a kicked spell whose BASE atom paused (scry/tutor) still runs its kickedOnly tail on resume.
          resume: { program, controller, targets, xValue, sourceId, context, kicked, chosenMode: params.chosenMode ?? null, nextAtomIndex: i, cardName, spellToGraveyard: params.spellToGraveyard ?? null },
        },
      };
    }
    // REFERENT BINDING (CR 608.2) — "It gains flying until end of turn" acts on whatever the PREVIOUS
    // atom targeted, so it reads that atom's slice instead of its own (it has none: the parse arm emits no
    // targetType, so the cast-time enumerator never allocated it one). programConfidence has already
    // guaranteed a targeting atom sits at i-1; if its target is gone by now the slice is empty and the
    // grant is a clean no-op rather than a fabricated grant on some other permanent.
    let atomTargets = atoms[i]?.bindPreviousTargets ? targetsForAtom(targets, referentSourceIndex(atoms, i)) : targetsForAtom(targets, i);
    // PLAYER PROJECTION (CR 608.2) — "… ITS CONTROLLER discards a card." The bound slice holds the PERMANENT
    // the previous atom targeted; the payload wants a PLAYER. Projecting HERE, once, means every player
    // payload resolver keeps seeing an ordinary {type:"player"} target and needs no change at all.
    // `t.controller` comes off the enumerated target object, so this still works when the previous atom
    // destroyed the permanent — which is the canonical carrier ("Destroy target creature. Its controller…").
    if (atoms[i]?.playerFrom === "controller") {
      atomTargets = atomTargets.map((t) => (t?.controller ? { type: "player", id: t.controller } : null)).filter(Boolean);
    }
    // OWNER PROJECTION — the that-player rebind's bounce arm ("Return target permanent to ITS
    // OWNER'S hand. Then THAT PLAYER discards" — Recoil). `owner` is recorded on the enumerated
    // target (spellEffects.enumerateTargets) for the same left-the-battlefield reason as
    // `controller`; a target enumerated before the owner field existed falls back to controller,
    // which is the owner everywhere except a stolen/reanimated permanent (those stamp `owner`).
    else if (atoms[i]?.playerFrom === "owner") {
      atomTargets = atomTargets.map((t) => { const pid = t?.owner || t?.controller; return pid ? { type: "player", id: pid } : null; }).filter(Boolean);
    }
    const ctx = { ...context, controller, targets: atomTargets, cardName, xValue, sourceId };
    const after = resolveAtom(next, atom, ctx);
    if (after == null) {
      // Belt-and-braces: an atom with no resolver. programConfidence should have
      // already forced this program to `low`, but if it didn't, never fabricate —
      // route to the Arbiter seam.
      return markPendingArbiter(next, stackObject, `effect-program (no resolver for atom "${atom?.op}")`);
    }
    next = after;
    // An atom set a resolution-time CHOICE (tutor search) — suspend the program and
    // record where to resume. The driver settles the choice, then resolveTutorChoice
    // re-enters at nextAtomIndex.
    if (next.pendingChoice && !next.pendingChoice.resume) {
      return {
        ...next,
        pendingChoice: {
          ...next.pendingChoice,
          resume: { program, controller, targets, xValue, sourceId, context, kicked, chosenMode: params.chosenMode ?? null, nextAtomIndex: i + 1, cardName, spellToGraveyard: params.spellToGraveyard ?? null },
        },
      };
    }
  }
  // GY-1: program complete — every atom ran; the spell card reaches its owner's graveyard NOW
  // (after the last atom, before finalizeStackResolution's trigger flush — CR 608.2m). A `selfExile` program
  // (Finale of Revelation "Exile <this>.") exiles the spell instead of the graveyard.
  return finishSpellResolution(next, params.spellToGraveyard, { selfExile: !!program?.selfExile, selfShuffle: !!program?.selfShuffle });
}

/**
 * Deterministically auto-pick a tutor candidate (Expert autopilot / an opponent — no
 * picker shown): the highest-mana-value match, locale-free codepoint tie-break by name
 * then id (serialize-stable). Returns the chosen card id, or null when there's no
 * candidate (a search that finds nothing, CR 701.19f).
 */
export function autoPickTutorCandidate(state, pendingChoice) {
  // LAND-FROM-HAND — read the candidate cards from the choice's source zone (hand for Growth Spiral, the
  // library for every search). The pick heuristic (highest MV) is identical.
  // MULTI-ZONE (bfxg — Finale's "library and/or graveyard") — resolve each candidate against EVERY source
  // zone (a card lives in exactly one), so a graveyard candidate is found too. Single-zone tutors read their
  // one zone exactly as before.
  const player = state.players?.[pendingChoice.controller] || {};
  const zones = Array.isArray(pendingChoice.sourceZones) && pendingChoice.sourceZones.length
    ? pendingChoice.sourceZones
    : [pendingChoice.sourceZone === "hand" ? "hand" : "library"];
  const byId = new Map();
  for (const z of zones) for (const c of (player[z] || [])) byId.set(c.id, c);
  // WAVE-2b TUTOR — DEFENSIVELY re-apply the structured filter (type groups + MV cap — Spellseeker MV<=2,
  // Trophy Mage MV=3). Candidates are already filtered upstream by applyTutor, so this is a belt-and-braces
  // guard that the auto-pick can never select an off-filter card even if a future caller skips pre-filtering.
  const cards = (pendingChoice.candidates || [])
    .map((c) => byId.get(c.id))
    .filter(Boolean)
    .filter((c) => cardMatchesTutorFilter(c, pendingChoice.filter));
  if (cards.length === 0) return null;
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return [...cards].sort((a, b) =>
    tutorManaValue(b) - tutorManaValue(a) ||
    cmp(String(a.name || ""), String(b.name || "")) ||
    cmp(String(a.id || ""), String(b.id || "")),
  )[0].id;
}

/**
 * Settle a pending tutor choice: move the chosen card library→hand (or find nothing if
 * `cardId` is null), shuffle (CR 701.19e, threaded deterministic seed), clear the choice,
 * then RESUME the suspended program from where it paused. Hidden-info safe — the log
 * records the controller + found-ness, never the fetched card's name.
 */
export function resolveTutorChoice(state, cardId) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "tutor-search") return state;
  // AI-F10 — an ILLEGAL DECLINE on a mandatory quantity-only search (CR 701.23d: "a card" /
  // "three cards" must be found when available) is rejected at the settler, the same no-op
  // pattern as the kind mismatch above, so it can't slip in via the wire even though the
  // offer side already drops the find-nothing action (learnSession gates allowDecline on
  // pc.mayFailToFind). The choice stays pending — the driver re-derives the same picker.
  // Old saves / legacy callers carry mayFailToFind null → unchanged behavior (non-breaking).
  if (cardId == null && pc.mayFailToFind === false && (pc.candidates || []).length > 0) return state;
  let next = clearPendingChoice(state);

  // Apply the fetch (cardId null = the player chose to find nothing, or no candidate). LAND-FROM-HAND —
  // `sourceZone` is the zone the card moves FROM: "hand" (Growth Spiral) or "library" (every search).
  // MULTI-ZONE (bfxg — Finale's "library and/or graveyard") — the chosen candidate carries its own `zone`
  // (library or graveyard); the card moves FROM that zone. Fall back to `pc.sourceZone` for a single-zone
  // tutor (whose candidates carry no `zone`), so the existing library/hand paths are byte-identical.
  const chosenCand = cardId ? (pc.candidates || []).find((c) => c.id === cardId) : null;
  const sourceZone = (chosenCand && chosenCand.zone)
    ? (chosenCand.zone === "hand" ? "hand" : chosenCand.zone === "graveyard" ? "graveyard" : "library")
    : (pc.sourceZone === "hand" ? "hand" : "library");
  const inSource = cardId && (next.players?.[pc.controller]?.[sourceZone] || []).some((c) => c.id === cardId);
  // WAVE-2b FETCH-TO-TOP — three destinations: "battlefield" (ramp), "top" (Vampiric/Mystical Tutor —
  // shuffle FIRST, then place the chosen card on top, CR 701.19e, so it survives the shuffle), "hand" (default).
  // GRAVEYARD joins them (CR 701.19a — the search's destination is whatever the card says): Entomb, Buried
  // Alive, Unmarked Grave, Vile Entomber and the reanimator family put the found card straight into the
  // graveyard. It is the SAME moveCardToZone the hand branch uses with a different toZone, so the fetch,
  // the CR 701.19e shuffle, the multi-pick chain and the find-nothing path are all unchanged.
  const destination = pc.destination === "battlefield" ? "battlefield"
    : pc.destination === "top" ? "top"
      : pc.destination === "graveyard" ? "graveyard" : "hand";
  let topAlreadyShuffled = false;
  if (inSource) {
    if (destination === "battlefield") {
      // RAMP-1 — the fetched card enters the battlefield (tapped per the card), firing ETB triggers.
      next = enterCardFromZone(next, { playerId: pc.controller, cardId, fromZone: sourceZone, tapped: !!pc.entersTapped }).state;
      // SAVAGE ORDER (2026-08-14) — the fetched-permanent UEOT keyword grants ("It gains indestructible
      // until end of turn"): find the just-entered permanent by its card id (the newest such entry) and
      // attach one layer-6 addKeyword effect per granted keyword, endOfTurn duration (CR 611.2c).
      if (pc.fetchedGrants?.length) {
        const bf = next.players[pc.controller]?.battlefield || [];
        const entered = [...bf].reverse().find((p) => p.card?.id === cardId);
        if (entered) {
          for (const kw of pc.fetchedGrants) {
            next = addContinuousEffect(next, {
              layer: 6,
              op: { layerOp: "addKeyword", keyword: kw },
              affects: { mode: "fixed", permanentIds: [entered.id] },
              duration: pc.fetchedGrantsUntil === "untilOwnersNextTurn"
                ? { kind: "untilOwnersNextTurn", owner: pc.controller, turn: next.turn }
                : { kind: "endOfTurn", turn: next.turn },
              source: { kind: "resolution", permanentId: null, cardName: pc.sourceName || null },
            }).state;
          }
        }
      }
    } else if (destination === "top") {
      // FETCH-TO-TOP (CR 701.19e — "shuffle and put that card on top"): SHUFFLE the library FIRST (the chosen
      // card is still in it), THEN reposition it to index 0 (the top) so it lands on top AFTER the shuffle
      // (never shuffled back into the deck). A from-hand "to top" is never printed (sourceZone is always
      // "library" here). `topAlreadyShuffled` suppresses the trailing CR-701.19e shuffle below, which would
      // otherwise re-randomize the card off the top. (moveCardToZone can't do a SAME-zone library→library
      // move — the spread would re-add the card — so the reposition is an explicit splice-to-front here.)
      next = shuffleControllerLibrary(next, pc.controller);
      const shuffledLib = next.players[pc.controller].library;
      const chosen = shuffledLib.find((c) => c.id === cardId);
      next = {
        ...next,
        players: {
          ...next.players,
          [pc.controller]: {
            ...next.players[pc.controller],
            library: [chosen, ...shuffledLib.filter((c) => c.id !== cardId)],
          },
        },
      };
      topAlreadyShuffled = true;
    } else {
      // hand (default) or graveyard — the same move, a different destination zone.
      next = moveCardToZone(next, { playerId: pc.controller, fromZone: sourceZone, toZone: destination === "graveyard" ? "graveyard" : "hand", cardId });
    }
  }
  // RAMP-MULTI — "up to two": after a SUCCESSFUL fetch with fetches still remaining, re-suspend for the next
  // pick from the still-legal candidates (the just-fetched card removed), carrying the same program resume —
  // WITHOUT shuffling yet (Explosive Vegetation / Skyshroud Claim shuffle once, after the last fetch). A
  // declined/empty fetch ends the search here (the player chose to take fewer). The driver loop drains the
  // re-suspended choice (settleTutorChoice returns it; the AI auto-picks again, a human gets a second picker).
  const remaining = (pc.remaining || 1) - 1;
  if (inSource && remaining >= 1 && next.players?.[pc.controller]) {
    // DISTINCT NAMES (Tiamat "up to five Dragon cards THAT EACH HAVE DIFFERENT NAMES") — a chained pick
    // already drops the just-fetched CARD by id; this drops every remaining candidate sharing its NAME, so
    // the constraint is enforced across the whole search rather than assumed away.
    //
    // ⛔ THE SINGLETON ARGUMENT IS NOT GOOD ENOUGH. In a Commander deck every library name is unique, so
    // ignoring the rider would pass every realistic test and still be a search wider than the card allows
    // the moment a non-singleton library exists. Enforced, not reasoned around.
    const fetchedName = String((pc.candidates || []).find((c) => c.id === cardId)?.name || "").toLowerCase();
    const rest = (pc.candidates || []).filter((c) => c.id !== cardId
      && !(pc.filter?.distinctNames && fetchedName && String(c.name || "").toLowerCase() === fetchedName));
    next = setPendingTutorChoice(next, {
      controller: pc.controller, candidates: rest, sourceName: pc.sourceName, filterLabel: pc.filterLabel,
      filter: pc.filter, // WAVE-2b — carry the structured filter so chained picks keep the auto-pick gate
      mayFailToFind: pc.mayFailToFind, // AI-F10 — the find-optionality carries to every chained pick
      // (multi-fetch tutors are all quality-filtered today, but the flag must never silently reset)
      // MULTI-ZONE — carry the source-zone set (bfxg) so a chained pick still moves from the right per-candidate
      // zone; `sourceZone` (this pick's chosen zone) rides along as the single-zone shuffle-decision fallback.
      destination: pc.destination, entersTapped: pc.entersTapped, remaining, sourceZone, sourceZones: pc.sourceZones || null,
      // RAMP-SPLIT — advance the ordered destination sequence so the NEXT pick uses the next destination
      // (Cultivate: pick 1 -> battlefield tapped, pick 2 -> hand). Null on the uniform single/multi path.
      destinations: Array.isArray(pc.destinations) ? pc.destinations.slice(1) : null,
    });
    return { ...next, pendingChoice: { ...next.pendingChoice, resume: pc.resume } };
  }
  // A library search shuffles afterward (CR 701.19e); a from-HAND put (LAND-FROM-HAND) doesn't touch the
  // library; a FETCH-TO-TOP already shuffled-then-placed above, so re-shuffling would knock the card off top.
  // MULTI-ZONE (bfxg) — the library was searched whenever "library" is in the source-zone set, even if the
  // chosen card came from the graveyard (so `sourceZone` is "graveyard"); shuffle in that case too.
  const searchedLibrary = Array.isArray(pc.sourceZones) && pc.sourceZones.length
    ? pc.sourceZones.includes("library")
    : sourceZone === "library";
  if (searchedLibrary && !topAlreadyShuffled) next = shuffleControllerLibrary(next, pc.controller);
  next = logEvent(next, { kind: "spell-effect", effect: "tutor", controller: pc.controller, found: !!inSource, destination });

  return resumeAfterChoice(next, pc);
}

/**
 * Deterministically auto-pick the card a hand-disruption strips (δ-1b — the AI/Expert caster, no picker):
 * the highest-mana-value match (the most valuable card to take), codepoint tie-break by name then id
 * (serialize-stable). Returns the chosen card id from the REVEALED victim hand, or null if none remain.
 */
export function autoPickHandDiscardCandidate(state, pendingChoice) {
  const hand = state.players?.[pendingChoice.victim]?.hand || [];
  const byId = new Map(hand.map((c) => [c.id, c]));
  const cards = (pendingChoice.candidates || []).map((c) => byId.get(c.id)).filter(Boolean);
  if (cards.length === 0) return null;
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return [...cards].sort((a, b) =>
    tutorManaValue(b) - tutorManaValue(a) ||
    cmp(String(a.name || ""), String(b.name || "")) ||
    cmp(String(a.id || ""), String(b.id || "")),
  )[0].id;
}

/**
 * Settle a pending hand-discard choice (δ-1b): move the chosen card from the VICTIM's hand → their
 * graveyard (or nothing if `cardId` is null / the victim was eliminated mid-pause), clear the choice,
 * then RESUME the caster's suspended program (its riders — Thoughtseize "lose 2 life", Harsh Scrutiny
 * "Scry 1"). The card move is on the VICTIM's zones; the resumed riders are the CASTER's. Hidden-info
 * safe — the card was revealed by the spell.
 */
export function resolveHandDiscardChoice(state, cardId) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "hand-discard") return state;
  let next = clearPendingChoice(state);
  const inHand = cardId && (next.players?.[pc.victim]?.hand || []).some((c) => c.id === cardId);
  if (inHand) {
    next = moveCardToZone(next, { playerId: pc.victim, fromZone: "hand", toZone: "graveyard", cardId });
  }
  next = logEvent(next, { kind: "spell-effect", effect: "discard-chosen", controller: pc.controller, victim: pc.victim, discarded: !!inHand });
  // TRIG-DISCARD across the PAUSE: the discard happens here, at the settle — not when the chain started —
  // so this is where the event fires. Only when a card actually left the hand (a stale settle discards
  // nothing and must fire nothing).
  if (inHand) next = checkDiscardTriggers(next, pc.victim, 1);
  // The CASTER can be eliminated between the pause and the settle (CR 800.4a) — the riders that resume
  // are THEIRS (Thoughtseize "lose 2 life"), so bail without resuming if they're gone (mirrors the
  // resolveScryChoice / resolveOptionalChoice guard; the victim's discard above already applied). Belt-
  // and-braces — unreachable in normal play (the discard atom precedes any rider, so the caster is alive
  // at the pause, and pendingChoice is transient/non-persisted) — but it keeps the shared seam uniform.
  if (!next.players?.[pc.controller]) return next;
  return resumeAfterChoice(next, pc);
}

/**
 * IMPRINT (CR 207.2c) — settle a pending imprint choice: EXILE the chosen card from the controller's hand and
 * STAMP it onto the imprinting permanent as `imprinted`, then resume the suspended program.
 *
 * ⚠️ THE STAMP IS THE WHOLE POINT, and it is what every imprint payoff reads. Two refusals are load-bearing,
 * both in the same direction:
 *
 *   • `cardId` null (the player DECLINES — imprint is "you MAY") → no exile, NO stamp. An un-imprinted
 *     Chrome Mox must produce NOTHING. Modeling a bare Mox as "any color" would be a turn-one ritual out of a
 *     card that should be dead — the forbidden false-positive direction, and the exact shape already refused
 *     for condition-gated mana (Mox Opal) elsewhere in this engine.
 *   • the imprinting permanent is GONE by settle time (it can be removed during the pause) → the card is
 *     still exiled (the exile already happened as part of the ability, CR 207.2c) but there is nothing to
 *     stamp. Stamping whatever occupies that slot instead would be a fabricated imprint.
 *
 * The card is exiled FACE UP and stays public — imprint's exile is not a hidden zone, so no hidden-info
 * handling is needed beyond the controller reading their own hand.
 */
export function resolveImprintChoice(state, cardId) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "imprint-exile") return state;
  let next = clearPendingChoice(state);
  if (!next.players?.[pc.controller]) return next; // controller eliminated mid-pause → clean no-op
  // Only a card the choice actually OFFERED can be picked; a stale/foreign id is a decline, never a
  // free exile of some other card.
  const chosen = (pc.candidates || []).some((c) => c.id === cardId)
    ? (next.players[pc.controller].hand || []).find((c) => c.id === cardId) || null
    : null;
  if (chosen) {
    next = moveCardToZone(next, { playerId: pc.controller, fromZone: "hand", toZone: "exile", cardId });
    // The stamp records the CARD (not just its id) so a payoff can read its characteristics — colors for
    // Chrome Mox, card types for Semblance Anvil — without a zone lookup that would break once the exile
    // zone is filtered or the card moves again.
    next = updatePermanentSafe(next, pc.sourceId, (p) => ({ ...p, imprinted: chosen }));
  }
  next = logEvent(next, { kind: "spell-effect", effect: "imprint", controller: pc.controller, sourceName: pc.sourceName, imprinted: chosen ? chosen.name : null });
  return resumeAfterChoice(next, pc);
}

/**
 * Settle a pending impulse-dig choice (δ-2): the chosen looked-at card goes to the controller's HAND
 * and the rest to `restTo` (bottom of library / graveyard) via applyImpulseDig, then RESUME the
 * suspended program (a "Look at the top N … then draw" rider). A `cardId` not among the revealed
 * candidates (stale) keeps nothing but still disposes the rest. Eliminated-controller guard (the pause
 * can outlive the SBA that removes them), mirroring resolveScryChoice. Hidden-info safe (the controller's
 * own library).
 */
export function resolveImpulseDigChoice(state, cardId) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "impulse-dig") return state;
  let next = clearPendingChoice(state);
  if (!next.players?.[pc.controller]) return next; // controller eliminated mid-pause → clean no-op
  const chosenId = (pc.candidates || []).some((c) => c.id === cardId) ? cardId : null;
  const keep = pc.keep ?? 1;
  const picked = [...(pc.chosenIds || []), ...(chosenId ? [chosenId] : [])];
  const lookedAt = pc.lookedAt ?? (pc.candidates || []).length;
  // MULTI-KEEP: RE-RAISE until `keep` cards are picked (or the pool runs dry). Doing it as repeated
  // single-picks rather than a multi-select means every driver that already settles an impulse-dig in a
  // loop — learnSession, the tests, the UI — handles it unchanged; nothing downstream had to learn a new
  // choice shape. A DECLINE (chosenId null) ends the picking immediately: the player kept what they kept.
  const remaining = (pc.candidates || []).filter((c) => c.id !== chosenId);
  if (chosenId && picked.length < keep && remaining.length) {
    return setPendingImpulseDigChoice(next, {
      controller: pc.controller, candidates: remaining, restTo: pc.restTo,
      sourceName: pc.sourceName, keep, chosenIds: picked, lookedAt,
    });
  }
  // ⚠️ `n` is the ORIGINAL look size, never the shrunken candidate list — the disposal must cover every card
  // looked at, including the ones already moved to hand on earlier passes.
  next = applyImpulseDig(next, { playerId: pc.controller, n: lookedAt, chosenIds: picked, restTo: pc.restTo });
  next = logEvent(next, { kind: "spell-effect", effect: "impulse-dig", controller: pc.controller, kept: picked.length, restTo: pc.restTo });
  return resumeAfterChoice(next, pc);
}

/**
 * TOP-CARD TAKE-OR-LEAVE-ON-TOP (BLITZ LK-2) — the AI / Expert auto-pick: ALWAYS TAKE. The documented,
 * deterministic policy — a matched top card into hand is strict card advantage at zero cost (you draw a
 * fresh card next; the taken card is a net +1), and declining only leaves it on top to be drawn anyway, so
 * taking is never worse. Returns the single candidate's id (the matched top card), or null if none (defensive).
 */
export function autoPickLookTopTake(state, pendingChoice) {
  const cand = (pendingChoice.candidates || [])[0];
  return cand ? cand.id : null;
}

/**
 * Settle a pending look-top-take choice (BLITZ LK-2): TAKE (`cardId` = the matched top card's id → move it
 * library→hand) or LEAVE (`cardId` null / a stale mismatch → the card STAYS ON TOP, a literal no-op, per the
 * printed absence of any disposal). A take moves the card only if it is STILL the library top (a defensive
 * stale-guard — a top-1 look never disturbs it, but the pause can outlive intervening state). Eliminated-
 * controller guard (the pause can outlive the SBA that removes them), mirroring resolveImpulseDigChoice. Then
 * RESUME the suspended program (an activated ability / trigger has no rider past this, but the seam is uniform).
 * Hidden-info safe (the controller's own library).
 */
export function resolveLookTopTakeChoice(state, cardId) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "look-top-take") return state;
  let next = clearPendingChoice(state);
  if (!next.players?.[pc.controller]) return resumeAfterChoice(next, pc); // controller eliminated mid-pause
  const cand = (pc.candidates || [])[0];
  const take = !!cand && cardId === cand.id;
  if (take) {
    const lib = next.players[pc.controller].library || [];
    if (lib[0]?.id === cand.id) {
      next = moveCardToZone(next, { playerId: pc.controller, fromZone: "library", toZone: "hand", cardId: cand.id });
    }
  }
  next = logEvent(next, { kind: "spell-effect", effect: "look-top-take", controller: pc.controller, took: take });
  return resumeAfterChoice(next, pc);
}

/**
 * DIG-LAND-TO-BATTLEFIELD (Silverback Elder mode 2) — deterministically auto-pick which land an AI / Expert
 * puts onto the battlefield (no picker): the highest-mana-value land (a fetchland / dual > a basic), codepoint
 * tie-break by name then id (serialize-stable, no Math.random). Returns the chosen LAND's id from the candidate
 * set (already lands-only, gathered by applyDigLandToBattlefieldAtom), or null if none remain. Mirrors
 * autoPickTutorCandidate's highest-MV heuristic — the AI puts out its most impactful available land.
 */
export function autoPickDigLandCandidate(state, pendingChoice) {
  const lib = state.players?.[pendingChoice.controller]?.library || [];
  const byId = new Map(lib.map((c) => [c.id, c]));
  const cards = (pendingChoice.candidates || []).map((c) => byId.get(c.id)).filter(Boolean);
  if (cards.length === 0) return null;
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return [...cards].sort((a, b) =>
    tutorManaValue(b) - tutorManaValue(a) ||
    cmp(String(a.name || ""), String(b.name || "")) ||
    cmp(String(a.id || ""), String(b.id || "")),
  )[0].id;
}

/**
 * Settle a pending dig-land-to-battlefield choice (Silverback Elder mode 2): the chosen LAND enters the
 * controller's battlefield (via enterCardFromZone — firing its ETB + landfall, entersTapped per the card),
 * then the REST of the looked-at set (the full restIds minus the chosen land) go to the BOTTOM of the library
 * in a RANDOM order (bottomLibraryCardsByIds — deterministic). A `cardId` not among the offered land
 * candidates (stale) puts NOTHING but still bottoms the whole looked-at set (a legal decline). An
 * eliminated-controller guard (the pause can outlive the SBA that removes them). Then RESUME the suspended
 * program (Silverback's modal has no rider past this mode, but the shared seam is uniform). Hidden-info safe
 * (the controller's own library).
 */
export function resolveDigLandChoice(state, cardId) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "dig-land-to-battlefield") return state;
  let next = clearPendingChoice(state);
  if (!next.players?.[pc.controller]) return next; // controller eliminated mid-pause → clean no-op
  const chosenId = (pc.candidates || []).some((c) => c.id === cardId) ? cardId : null;
  let put = false;
  if (chosenId) {
    const r = enterCardFromZone(next, { playerId: pc.controller, cardId: chosenId, fromZone: "library", tapped: !!pc.entersTapped });
    next = r.state;
    put = r.entered;
  }
  // Bottom the REST of the looked-at set — the frozen top-N ids minus the land that went to the battlefield
  // (if none was put, the whole looked-at set bottoms). bottomLibraryCardsByIds ignores ids no longer in the
  // library (the chosen land already left), so passing the full restIds is correct either way.
  const restIds = (pc.restIds || []).filter((id) => id !== chosenId);
  next = bottomLibraryCardsByIds(next, pc.controller, restIds);
  next = logEvent(next, { kind: "spell-effect", effect: "dig-land-to-battlefield", controller: pc.controller, put });
  return resumeAfterChoice(next, pc);
}

/**
 * ===== EDICTS ===== — deterministically auto-pick the creature an AI sacrifices to an edict (CR 701.16,
 * no picker for the AI / Expert): its LEAST valuable creature = lowest mana value, tie-break lowest
 * printed power, then codepoint name then id (serialize-stable, no Math.random). Returns the permanent id
 * from the SACRIFICER's battlefield, or null if none remain. Mirrors autoPickTutorCandidate's shape but
 * picks the cheapest (a token / mana-dork) rather than the priciest — the AI gives up its weakest body.
 */
export function autoPickSacrificeCandidate(state, pendingChoice) {
  const bf = state.players?.[pendingChoice.controller]?.battlefield || [];
  const byId = new Map(bf.map((p) => [p.id, p]));
  const perms = (pendingChoice.candidates || []).map((c) => byId.get(c.id)).filter(Boolean);
  if (perms.length === 0) return null;
  // QUARTET PHASE 1 (2026-08-14): behind `state.usePolicyEval` the pick consults the shared board
  // evaluator (a mana dork outvalues a vanilla body — the AC-1 site's exact discipline; the two
  // policies stay mirrors on BOTH sides of the flag). Flag absent ⇒ legacy MV-then-power, byte-identical.
  if (policyEvalEnabledFor(state, pendingChoice.controller)) return [...perms].sort(evalLeastValuableCmp(state))[0].id;
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const pwr = (p) => Number(p.card?.power) || 0;
  return [...perms].sort((a, b) =>
    tutorManaValue(a.card) - tutorManaValue(b.card) ||
    pwr(a) - pwr(b) ||
    cmp(String(a.card?.name || ""), String(b.card?.name || "")) ||
    cmp(String(a.id || ""), String(b.id || "")),
  )[0].id;
}

/**
 * Settle ONE pick in the sacrifice chain (edicts — Diabolic Edict / Innocent Blood / Liliana's Triumph):
 * sacrifice the chosen creature from the SACRIFICER's battlefield (pc.controller) → their graveyard, firing
 * dies triggers via the shared helper, then ADVANCE the chain (advanceSacrificeChain) — which either pauses
 * again (the next each-player/each-opponent sacrificer owes a real choice) or, when the queue empties,
 * RESUMES the CASTER's program (a rider like Geth's Verdict "You lose 1 life", which is the CASTER's, not the
 * sacrificer's). A `permId` not among the offered candidates / no longer on the battlefield (stale) is a
 * logged no-op (the sacrifice still "resolved"). Eliminated-player guards (the pause can outlive an SBA, CR
 * 800.4a): a removed SACRIFICER skips their sac; when the chain re-pauses the original caster-resume is
 * carried forward; a removed CASTER skips the final resume. Hidden-info safe (the sacrificer's own board).
 */
export function resolveSacrificeChoice(state, permId) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "sacrifice-choice") return state;
  let next = clearPendingChoice(state);
  if (next.players?.[pc.controller]) {
    const isCandidate = (pc.candidates || []).some((c) => c.id === permId);
    if (isCandidate && findPermanent(next, permId)) {
      next = sacrificeCreatureEffect(next, pc.controller, permId);
    } else {
      next = logEvent(next, { kind: "spell-effect", effect: "sacrifice", controller: pc.controller, sacrificed: null });
    }
  } else {
    // The sacrificer left the game mid-pause (CR 800.4a) — log the no-op for decision-log parity with the
    // stale-permId case, then advance the chain (the next sacrificer / the caster's riders still settle).
    next = logEvent(next, { kind: "spell-effect", effect: "sacrifice", controller: pc.controller, sacrificed: null });
  }
  // Advance the chain — drop the settled head sacrificer, then continue (each-player / each-opponent forms).
  const queue = (pc.queue || []).slice(1);
  const r = advanceSacrificeChain(next, { queue, sourceName: pc.sourceName });
  if (r.pendingChoice) {
    // The chain re-paused (the next sacrificer owes a real choice). Carry the original caster-resume forward
    // so the program resumes once the whole chain settles (advanceSacrificeChain never sets a resume itself).
    return r.pendingChoice.resume || !pc.resume
      ? r
      : { ...r, pendingChoice: { ...r.pendingChoice, resume: pc.resume } };
  }
  // Chain done → resume the caster's suspended program (its riders).
  const casterId = pc.resume?.controller;
  if (casterId && !r.players?.[casterId]) return r; // caster eliminated mid-pause → no resume
  return resumeAfterChoice(r, pc);
}

/**
 * ===== DIVIDE ===== (MT-1) — auto-distribute a divide-damage spell's total for an AI / Expert caster (no
 * picker). Greedy KILL: give each ENEMY creature (a candidate the caster doesn't control) just-lethal damage
 * cheapest-first (toughness asc, serialize-stable id tie-break), spending the budget to kill as many as
 * possible; dump any remainder on an enemy player (reach), falling back to the last creature if there's no
 * enemy player. Returns a distribution `[{ id, type, amount }]` (sum ≤ pc.amount) — correct + never wastes
 * damage on the caster's own board; not provably optimal (a later heuristic can refine).
 */
export function autoPickDivideDistribution(state, pc) {
  let remaining = pc.amount || 0;
  const enemies = (pc.candidates || []).filter((c) => c.controller && c.controller !== pc.controller);
  const dist = [];
  const creatures = enemies
    .filter((c) => c.type === "creature")
    .map((c) => ({ c, t: Math.max(1, creatureToughness(findPermanent(state, c.id)?.permanent, state) || 1) }))
    .sort((a, b) => a.t - b.t || (a.c.id < b.c.id ? -1 : 1));
  // SHELF CAP13 — the printed target BOUND ("among one, two, or three targets", CR 601.2d). null = the
  // unbounded "any number of target" forms, so `cap` is Infinity there and every line below behaves exactly
  // as it did. The bound counts DISTINCT chosen targets, not damage, so the greedy kill loop stops opening
  // new ones once it is full and the leftover is folded onto a target already chosen.
  const cap = pc.maxTargets == null ? Infinity : Math.max(0, pc.maxTargets);
  for (const { c, t } of creatures) {
    if (remaining <= 0 || dist.length >= cap) break;
    const give = Math.min(remaining, t);
    if (give > 0) { dist.push({ id: c.id, type: "creature", amount: give }); remaining -= give; }
  }
  if (remaining > 0) {
    const player = enemies.find((c) => c.type === "player") || (pc.candidates || []).find((c) => c.type === "player");
    // Opening the PLAYER as a new target is legal only while the bound has room; otherwise the remainder
    // rides on a target already chosen. CR 601.2d requires the whole amount be assigned, and a bounded
    // divide must not exceed its printed target count to do it.
    if (player && dist.length < cap) dist.push({ id: player.id, type: "player", amount: remaining });
    else if (dist.length) dist[dist.length - 1].amount += remaining; // bound full / no player → last target
  }
  return dist;
}

/**
 * ===== DIVIDE ===== (MT-1) — settle a divide-damage division: apply `distribution` ([{id,type,amount}], from
 * the human picker or autoPickDivideDistribution) as single-target damage events through the SAME registered
 * `deal-damage` atom (so the lethal SBA / lifelink / dies-triggers are identical to any burn), then RESUME
 * the caster's program. Guards: only candidate ids count; the running sum is capped at pc.amount (never
 * fabricated extra damage); an eliminated caster skips the damage and just resumes (CR 800.4a); a stale/dead
 * creature target is a no-op via the atom's own findPermanent guard.
 */
export function resolveDivideChoice(state, distribution) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "divide-damage") return state;
  let next = clearPendingChoice(state);
  // WI-6 — bail WITHOUT resuming when the caster is eliminated mid-pause (CR 800.4a): a dead caster's
  // riders shouldn't run. Mirrors resolveHandDiscardChoice / resolveScryChoice / resolveImpulseDigChoice's
  // guard (previously this called resumeAfterChoice, the odd one out — harmless today since no divide-
  // damage program carries a rider past the pause, but inconsistent with the shared seam).
  if (!next.players?.[pc.controller]) return next; // caster eliminated mid-pause → no damage, no resume
  const validIds = new Set((pc.candidates || []).map((c) => c.id));
  let spent = 0;
  // SHELF CAP13 — enforce the printed target bound HERE too, not only at the session submit guard. Defence
  // in depth for exactly the reason the running `spent` cap already is: a malformed or non-UI submit must
  // not be able to hit more targets than the card allows. The legal path never trips it (applyDivideChoice
  // re-surfaces an over-target submit before it reaches here). DISTINCT ids are counted, so two entries
  // naming one target consume a single slot.
  const cap = pc.maxTargets == null ? Infinity : Math.max(0, pc.maxTargets);
  const chosen = new Set();
  for (const d of distribution || []) {
    if (!validIds.has(d.id) || (d.type !== "creature" && d.type !== "player")) continue;
    if (!chosen.has(d.id) && chosen.size >= cap) continue; // bound full → ignore further NEW targets
    const amt = Math.max(0, Math.min(d.amount || 0, (pc.amount || 0) - spent));
    if (amt <= 0) continue;
    chosen.add(d.id);
    next = resolveAtom(next, { op: "deal-damage", amount: amt, targetType: d.type }, { controller: pc.controller, targets: [{ type: d.type, id: d.id }] });
    spent += amt;
  }
  next = logEvent(next, { kind: "spell-effect", effect: "divide-damage", controller: pc.controller, amount: pc.amount, spent });
  return resumeAfterChoice(next, pc);
}

/**
 * ===== DISTRIBUTE ===== auto-pick a beneficial +1/+1-counter distribution for self-play (no human): spread
 * `pc.amount` counters 1-at-a-time (round-robin) across the top `min(maxTargets, amount)` of the controller's
 * OWN creatures by power — a simple, no-waste default (every counter lands on a real candidate, strictly
 * beneficial, never fabricated). Not provably optimal (a later heuristic can refine). Mirrors autoPickDivideDistribution.
 */
export function autoPickDistributeCounters(state, pc) {
  const amount = pc.amount || 0;
  // MOVE-FROM-SELF (Forgotten Ancient, W1): the candidate pool spans EVERY battlefield (the printed "other
  // creatures"), so the AI policy filters to the controller's OWN side and moves the WHOLE pile onto its
  // strongest own creature — the card's real line (bank counters, dump them on the best attacker), never a
  // decline-only hollow credit. No own-side candidate → move nothing ([] — legal, pc.anyNumber).
  if (pc.moveFromId) {
    const own = (pc.candidates || [])
      .filter((c) => c.controller === pc.controller)
      .map((c) => ({ c, p: creaturePower(findPermanent(state, c.id)?.permanent, state) || 0 }))
      .sort((a, b) => b.p - a.p || (a.c.id < b.c.id ? -1 : 1));
    if (own.length === 0 || amount <= 0) return [];
    return [{ id: own[0].c.id, type: "creature", amount }];
  }
  const pool = (pc.candidates || [])
    .map((c) => ({ c, p: creaturePower(findPermanent(state, c.id)?.permanent, state) || 0 }))
    .sort((a, b) => b.p - a.p || (a.c.id < b.c.id ? -1 : 1));
  if (pool.length === 0 || amount <= 0) return [];
  const n = Math.max(1, Math.min(pc.maxTargets || amount, pool.length, amount));
  const dist = pool.slice(0, n).map(({ c }) => ({ id: c.id, type: "creature", amount: 0 }));
  // perTargetCap (SHELF M1c — Mothman "a counter on EACH of up to X"): each target takes at most the cap;
  // once every eligible target is full the surplus is NOT placed ("up to" — an under-spend, never stacked).
  const cap = pc.perTargetCap || Infinity;
  for (let i = 0, placed = 0; placed < amount && i < n * (cap === Infinity ? amount : cap); i++) {
    if (dist[i % n].amount < cap) { dist[i % n].amount += 1; placed++; }
  }
  return dist.filter((d) => d.amount > 0);
}

/**
 * ===== DISTRIBUTE ===== settle a distribute-counters division: apply `distribution` ([{id,type,amount}], from
 * the human picker or autoPickDistributeCounters) as add-counter events through the SAME registered add-counter
 * atom — so the controller's +1/+1 doublers compose (CR 616) exactly like any counter placement. Guards mirror
 * resolveDivideChoice: only candidate ids count, the running sum is capped at pc.amount (never fabricated), an
 * eliminated controller skips the counters and just resumes.
 */
export function resolveDistributeChoice(state, distribution) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "distribute-counters") return state;
  let next = clearPendingChoice(state);
  if (!next.players?.[pc.controller]) return next;             // controller eliminated mid-pause → no counters, no resume
  const validIds = new Set((pc.candidates || []).map((c) => c.id));
  // MOVE-FROM-SELF (Forgotten Ancient, W1 — CR 122.5): a move can only place what the SOURCE actually holds
  // RIGHT NOW — cap the budget at its live pile (defensive; the pause blocks intervening actions, so this
  // normally equals pc.amount). Never fabricate a counter the source doesn't have.
  const budget = pc.moveFromId ? Math.min(pc.amount || 0, getCounter(next, pc.moveFromId, pc.counterType || "+1/+1")) : (pc.amount || 0);
  let spent = 0;
  for (const d of distribution || []) {
    if (!validIds.has(d.id) || spent >= budget) continue;
    // perTargetCap (SHELF M1c): a human distribution can never stack past the printed per-target cap either.
    const amt = Math.max(0, Math.min(d.amount || 0, budget - spent, pc.perTargetCap || Infinity));
    if (amt <= 0) continue;
    next = resolveAtom(next, { op: "add-counter", counterType: pc.counterType || "+1/+1", amount: amt }, { controller: pc.controller, targets: [{ type: "creature", id: d.id }] });
    spent += amt;
  }
  // The REMOVE half of the move (CR 122.5): the source loses exactly the CHOSEN total — placement-side
  // doublers (CR 616) inflate what lands, never what leaves. Removing +1/+1 counters can be lethal under a
  // debuff static (a 0/3 alive only through its counters), so sweep SBAs right here (CR 704.5g).
  if (pc.moveFromId && spent > 0) {
    next = removeCounter(next, { permanentId: pc.moveFromId, type: pc.counterType || "+1/+1", amount: spent });
    const r = destroyLethalCreatures(next);
    next = checkDiesTriggers(r.state, r.dead);
  }
  next = logEvent(next, { kind: "spell-effect", effect: "distribute-counters", controller: pc.controller, amount: pc.amount, spent, ...(pc.moveFromId ? { movedFrom: pc.moveFromId } : {}) });
  return resumeAfterChoice(next, pc);
}

/**
 * ===== EACH-PLAYER ===== discard (EP-2) — deterministically auto-pick the card an AI discards (CR 701.8,
 * no picker for the AI / Expert): its LEAST valuable card = lowest mana value, tie-break lowest power,
 * then codepoint name then id (serialize-stable, no Math.random). Returns the card id from the DISCARDER's
 * current hand, or null if none remain. Mirrors autoPickSacrificeCandidate (cheapest-first — pitch the
 * weakest card); a board-aware "keep cheap interaction, bin flood" heuristic is a future refinement.
 */
export function autoPickDiscardCandidate(state, pendingChoice) {
  const hand = (state.players?.[pendingChoice.controller]?.hand || []).filter((c) => !c.token);
  const byId = new Map(hand.map((c) => [c.id, c]));
  const cards = (pendingChoice.candidates || []).map((c) => byId.get(c.id)).filter(Boolean);
  if (cards.length === 0) return null;
  // QUARTET PHASE 1 (2026-08-14): the card twin — flag on ⇒ cardValue ranking (keep the ramp/draw
  // piece, bin the vanilla body); flag absent ⇒ legacy MV-then-power, byte-identical.
  if (policyEvalEnabledFor(state, pendingChoice.controller)) return [...cards].sort(evalLeastValuableCardCmp())[0].id;
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const pwr = (c) => Number(c.power) || 0;
  return [...cards].sort((a, b) =>
    tutorManaValue(a) - tutorManaValue(b) ||
    pwr(a) - pwr(b) ||
    cmp(String(a.name || ""), String(b.name || "")) ||
    cmp(String(a.id || ""), String(b.id || "")),
  )[0].id;
}

/**
 * ===== EACH-PLAYER ===== discard (EP-2) — settle ONE pick in the discard chain (Mind Rot / Fugue / Delirium
 * Skeins): move the chosen card from the DISCARDER's hand (pc.controller) → their graveyard, decrement that
 * discarder's `remaining`, then ADVANCE the chain (advanceDiscardChain) — which either pauses again (more
 * cards / the next discarder owes a real choice) or, when the queue empties, RESUMES the caster's program
 * (a rider like "Scry 2" on Fill with Fright). A `cardId` not in the discarder's hand (stale) is a logged
 * no-op but still counts against `remaining` (the discard "happened"). Guards: a discarder removed mid-pause
 * (CR 800.4a) skips their move; when the chain re-pauses, the original caster-resume is carried forward; a
 * caster removed before the final resume skips it. Hidden-info safe (the discarder owns the hand).
 */
export function resolveDiscardChoice(state, cardId) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "discard") return state;
  let next = clearPendingChoice(state);
  const discarder = pc.controller;
  if (next.players?.[discarder]) {
    // Capture the card object BEFORE the move — the CONNIVE rider needs its landness (CR 701.50a).
    const discardedCard = cardId ? (next.players[discarder].hand || []).find((c) => c.id === cardId) : null;
    const inHand = !!discardedCard;
    if (inHand) {
      next = moveCardToZone(next, { playerId: discarder, fromZone: "hand", toZone: "graveyard", cardId });
    }
    next = logEvent(next, { kind: "spell-effect", effect: "discard", controller: discarder, discarded: inHand ? 1 : 0 });
    if (inHand) next = checkDiscardTriggers(next, discarder, 1);   // fires per settled card, across the pause
    // CONNIVE rider (BLITZ EK-1, CR 701.50a): a NONLAND card discarded this way puts a +1/+1 counter on
    // the conniving permanent — routed through applyConniveCounter (doublers CR 616 + counters-placed
    // watchers CR 122.6 compose; the permanent having left the battlefield is a clean no-op). A LAND
    // discard or a stale/no-op settle places nothing (only a card actually "discarded this way" counts).
    if (pc.connive && inHand && !/\bLand\b/.test(String(discardedCard.type || discardedCard.type_line || ""))) {
      next = applyConniveCounter(next, pc.connive.permanentId, pc.connive.controller || discarder);
    }
  }
  // Decrement the head discarder's owed count, then advance the chain.
  const queue = (pc.queue || []).map((e, i) => (i === 0 ? { ...e, remaining: e.remaining - 1 } : e));
  const r = advanceDiscardChain(next, { queue, sourceName: pc.sourceName });
  if (r.pendingChoice) {
    // The chain re-paused (more picks). Carry the original caster-resume onto the new choice so the
    // program resumes once the whole chain settles (advanceDiscardChain never sets a resume itself).
    return r.pendingChoice.resume || !pc.resume
      ? r
      : { ...r, pendingChoice: { ...r.pendingChoice, resume: pc.resume } };
  }
  // Chain done → resume the caster's suspended program (its riders).
  const casterId = pc.resume?.controller;
  if (casterId && !r.players?.[casterId]) return r; // caster eliminated mid-pause → no resume
  return resumeAfterChoice(r, pc);
}

/**
 * ===== HAND→LIBRARY-TOP ===== (the Brainstorm put-back) — settle one pick of the chain: place the
 * chosen card on TOP of the chooser's library (later picks stack above it — the player controls the
 * final order pick by pick), decrement, re-raise until `remaining` are placed, then resume the
 * suspended program. NOT a discard: no graveyard, no discard triggers. Mirrors resolveDiscardChoice's
 * chain-resume discipline exactly (the carried caster-resume; the eliminated-chooser guard).
 */
export function resolveHandToLibraryTopChoice(state, cardId) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "hand-to-library-top") return state;
  let next = clearPendingChoice(state);
  const owner = pc.controller;
  let placed = false;
  if (next.players?.[owner]) {
    const inHand = cardId && (next.players[owner].hand || []).some((c) => c.id === cardId);
    if (inHand) {
      next = moveCardToZone(next, { playerId: owner, fromZone: "hand", toZone: "library", cardId, toTop: true });
      placed = true;
    }
    next = logEvent(next, { kind: "spell-effect", effect: "hand-to-library-top", controller: owner, placed: placed ? 1 : 0 });
  }
  const remaining = (pc.remaining || 1) - 1;
  const r = advanceHandToLibraryTopChain(next, { playerId: owner, remaining, sourceName: pc.sourceName });
  if (r.pendingChoice) {
    return r.pendingChoice.resume || !pc.resume
      ? r
      : { ...r, pendingChoice: { ...r.pendingChoice, resume: pc.resume } };
  }
  const casterId = pc.resume?.controller;
  if (casterId && !r.players?.[casterId]) return r; // caster eliminated mid-pause → no resume
  return resumeAfterChoice(r, pc);
}

/**
 * Auto-pick for the put-back (Expert autopilot / an AI seat): return the HIGHEST-mana-value card —
 * keeps the hand castable now; deterministic (mv desc, then name, then id — the shared tie-break).
 */
export function autoPickHandToLibraryTopCandidate(state, pendingChoice) {
  const hand = state.players?.[pendingChoice.controller]?.hand || [];
  const byId = new Map(hand.map((c) => [c.id, c]));
  const cards = (pendingChoice.candidates || []).map((c) => byId.get(c.id)).filter(Boolean);
  if (cards.length === 0) return null;
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return [...cards].sort((a, b) =>
    tutorManaValue(b) - tutorManaValue(a) ||
    cmp(String(a.name || ""), String(b.name || "")) ||
    cmp(String(a.id || ""), String(b.id || "")),
  )[0].id;
}

/**
 * ===== ITERATED-EDICT ===== (Torment of Hailfire) — deterministically pick the mode an AI opponent takes for
 * ONE edict decision (no picker for the AI / Expert), returning `{ mode, permId?, cardId? }`. Heuristic (a
 * LEGAL choice always — CR 601, never wrong): if life is LOW (≤ the 3-life loss, so losing it risks death),
 * PRESERVE life — discard the least-valuable card if the pool has one, else sacrifice the least-valuable
 * nonland permanent (lowest MV, serialize-stable tie-break); otherwise (comfortable life total) LOSE the 3
 * life and keep the board + hand intact. Only ever returns a mode the pool supports (the fallbacks re-check
 * pool emptiness), so the settler never applies an illegal mode; a board-aware refinement is a future slice.
 */
export function autoPickEdictMode(state, pc) {
  const player = state.players?.[pc?.controller];
  if (!player) return { mode: "life" };
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const cheapestCard = () => {
    const hand = (player.hand || []).filter((c) => !c.token);
    const byId = new Map(hand.map((c) => [c.id, c]));
    const cards = (pc.disc || []).map((c) => byId.get(c.id)).filter(Boolean);
    if (!cards.length) return null;
    return [...cards].sort((a, b) =>
      tutorManaValue(a) - tutorManaValue(b) || cmp(String(a.name || ""), String(b.name || "")) || cmp(String(a.id || ""), String(b.id || "")),
    )[0].id;
  };
  const cheapestPerm = () => {
    const perms = (pc.sac || [])
      .map((c) => ({ c, mv: tutorManaValue(findPermanent(state, c.id)?.permanent?.card) }))
      .filter((x) => findPermanent(state, x.c.id));
    if (!perms.length) return null;
    return [...perms].sort((a, b) => a.mv - b.mv || cmp(String(a.c.name || ""), String(b.c.name || "")) || cmp(String(a.c.id || ""), String(b.c.id || "")))[0].c.id;
  };
  const lifeLow = (player.life ?? 0) <= EDICT_LIFE_LOSS;
  if (lifeLow) {
    const cardId = pc.modes.includes("discard") ? cheapestCard() : null;
    if (cardId) return { mode: "discard", cardId };
    const permId = pc.modes.includes("sacrifice") ? cheapestPerm() : null;
    if (permId) return { mode: "sacrifice", permId };
  }
  return { mode: "life" };
}

/**
 * ===== ITERATED-EDICT ===== (Torment of Hailfire) — settle ONE pick in the edict chain: apply the chosen
 * `choice` ({ mode, permId?, cardId? }) for the AFFECTED opponent (pc.controller) via applyEdictMode — "life"
 * loses 3, "sacrifice" gives up the chosen nonland permanent (dies triggers fire), "discard" pitches the
 * chosen card — then ADVANCE the chain (advanceEdictChain), which either pauses again (the next opponent /
 * round owes a real choice) or, when the queue empties, RESUMES the caster's suspended program. An eliminated
 * opponent mid-pause (CR 800.4a) is a logged no-op that still advances the chain; a stale/illegal permId or
 * cardId falls back to the mandatory life loss inside applyEdictMode (never a fabricated sac/discard). The
 * caster-resume rides forward across each re-pause. Hidden-info safe (the affected opponent is the chooser).
 */
export function resolveEdictModeChoice(state, choice) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "edict-mode") return state;
  let next = clearPendingChoice(state);
  if (next.players?.[pc.controller]) {
    const mode = pc.modes.includes(choice?.mode) ? choice.mode : "life";
    next = applyEdictMode(next, { playerId: pc.controller, mode, permId: choice?.permId ?? null, cardId: choice?.cardId ?? null, sac: pc.sac || [] });
  } else {
    next = logEvent(next, { kind: "spell-effect", effect: "iterated-edict-skip", controller: pc.controller });
  }
  // Advance the chain — drop the settled head, then continue (the next opponent / round).
  const queue = (pc.queue || []).slice(1);
  const r = advanceEdictChain(next, { queue, sourceName: pc.sourceName });
  if (r.pendingChoice) {
    // The chain re-paused (the next decision owes a real choice). Carry the original caster-resume forward
    // so the program resumes once the whole chain settles (advanceEdictChain never sets a resume itself).
    return r.pendingChoice.resume || !pc.resume
      ? r
      : { ...r, pendingChoice: { ...r.pendingChoice, resume: pc.resume } };
  }
  // Chain done → resume the caster's suspended program (its riders, if any).
  const casterId = pc.resume?.controller;
  if (casterId && !r.players?.[casterId]) return r; // caster eliminated mid-pause → no resume
  return resumeAfterChoice(r, pc);
}

/**
 * Settle a scry/surveil choice (CR 701.22 / 701.25): apply the reorder — `keepIdsOrdered` stay on
 * top in that order, the rest of the looked-at cards go to the bottom (scry) / graveyard (surveil)
 * — then RESUME the suspended program. A null/empty keep list moves everything away; an omitted
 * decision (the auto-keep-all default is supplied by the driver) keeps all on top. Hidden-info safe.
 *
 * REORDER-TOP (Ponder) — when the pending choice is a `reorder` one ("put them back in ANY order"),
 * NONE of the looked-at cards leave the top: the keep-list is completed to the FULL looked-at set (the
 * caller's order first, then any looked-at id the caller omitted, appended in library order) so nothing
 * is bottomed — a pure reorder. If the choice `mayShuffle` (Ponder's optional "You may shuffle.") and the
 * settle opts in (`opts.shuffle`), the library is shuffled AFTER the reorder. The auto/deterministic path
 * passes no shuffle (declining keeps the deliberate ordering — the strictly stronger legal line).
 */
export function resolveScryChoice(state, keepIdsOrdered, opts = {}) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "scry-surveil") return state;
  let next = clearPendingChoice(state);
  // The controller can be ELIMINATED between the pause and the settle (an opponent dying to
  // "You lose 2 life. Scry 2." — SBA removes them on the next driver tick). The scry and the rest
  // of its program then do nothing; clear the choice and bail so the game never wedges on a removed
  // player's pending decision (CR 800.4a). No resume — the remaining atoms are that player's too.
  if (!next.players?.[pc.controller]) return next;
  // Dedupe the keep-list once: only valid in-top-N ids, each at most once (matches the dedup the
  // library mutation does, so the kept/moved log is honest under a malformed/duplicate input).
  const valid = new Set((pc.cards || []).map((c) => c.id));
  const seen = new Set();
  let keep = (keepIdsOrdered || []).filter((id) => valid.has(id) && !seen.has(id) && seen.add(id));
  // REORDER-TOP — put ALL looked-at cards back on top: complete the keep-list to the full set so the
  // "moved → bottom/graveyard" partition is empty (Ponder never bottoms a looked-at card). Any card the
  // caller didn't name is appended in its original library order (a legal put-back of the untouched cards).
  if (pc.reorder) {
    for (const c of pc.cards || []) if (!seen.has(c.id)) { keep.push(c.id); seen.add(c.id); }
  }
  next = applyScrySurveil(next, { playerId: pc.controller, n: (pc.cards || []).length, keepIdsOrdered: keep, mode: pc.mode });
  // REORDER-TOP optional shuffle (Ponder's "You may shuffle.") — only when the choice permits it AND the
  // settle opts in. A plain scry/surveil never shuffles (no mayShuffle flag), so this is a no-op there.
  const shuffled = pc.mayShuffle && opts.shuffle === true;
  if (shuffled) next = shuffleControllerLibrary(next, pc.controller);
  next = logEvent(next, { kind: "spell-effect", effect: pc.reorder ? "reorder-top" : pc.mode, controller: pc.controller, looked: (pc.cards || []).length, moved: (pc.cards || []).length - keep.length, shuffled });
  return resumeAfterChoice(next, pc);
}

/**
 * Settle an optional-effect choice ("you may <effect>", α2): if `doIt`, run the atom that paused
 * (with its `optional` flag stripped so it can't re-suspend), then resume the rest; if not, skip it
 * and resume. Mirrors the tutor/scry settle. Eliminated-controller guard (the pause can outlive the
 * SBA that removes the controller). The taken/declined outcome is logged either way.
 */
/**
 * QUARTET PHASE 1 slice 4 (2026-08-14) — the board-aware MAY decision. The legacy autopilot ALWAYS
 * takes an optional effect ("the modeled optionals are all beneficial" — true when written, no longer
 * guaranteed as the corpus grows: an optional self-sacrifice or symmetric effect can hurt). Behind
 * `state.usePolicyEval`, decide by the SCORE-CHOICE pattern the plan names: resolve BOTH worlds
 * through the real settle (resolveOptionalChoice is a pure state transform), diff evaluateBoard for
 * the DECIDER, take iff taking is at least as good. Deterministic (the resolvers are), and the same
 * comparison the decision log (phase 2) will record. Flag absent ⇒ true (legacy always-take,
 * byte-identical). Never consulted for a HUMAN's choice — only the autopilot fallback reads it.
 */
export function optionalAutoTakeValue(state, pc) {
  const who = pc?.controller;
  // ATTACH-TO-LAST-TOKEN (Cori-Steel Cutter, W9): the legacy always-take would YANK the Cutter off its
  // current host every trigger — confidently wrong, the exact class the always-take comment warns about.
  // The deterministic default: attach iff the Equipment is currently UNATTACHED (pure upside then; a
  // Cutter already on a wearer holds). The policy evaluator below refines this when enabled — this guard
  // only replaces the blind always-take on the legacy path.
  if (pc?.effectOp === "attach-source-to-last-token" && (!who || !policyEvalEnabledFor(state, who))) {
    const srcId = pc?.resume?.sourceId;
    const src = srcId ? findPermanent(state, srcId) : null;
    return !!src && !src.permanent.attachedTo;
  }
  if (!who || !policyEvalEnabledFor(state, who)) return true;
  const taken = resolveOptionalChoice(state, true);
  const declined = resolveOptionalChoice(state, false);
  return evaluateBoard(taken, who) >= evaluateBoard(declined, who);
}

export function resolveOptionalChoice(state, doIt) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "optional-effect") return state;
  let next = clearPendingChoice(state);
  if (!next.players?.[pc.controller]) return next; // controller eliminated mid-pause → bail, no resume
  const r = pc.resume;
  const i = pc.atomIndex;
  const atom = programAtoms(r.program, r.chosenMode)[i];
  if (doIt) {
    const ctx = { ...(r.context || {}), controller: r.controller, targets: targetsForAtom(r.targets, i), cardName: r.cardName, xValue: r.xValue, sourceId: r.sourceId };
    const after = resolveAtom(next, { ...atom, optional: false }, ctx);
    if (after == null) return markPendingArbiter(next, { source: { name: r.cardName }, payload: { params: r } }, `optional atom "${atom?.op}" had no resolver`);
    next = logEvent(after, { kind: "spell-effect", effect: "optional", controller: r.controller, op: atom?.op, taken: true });
    // The optional atom may ITSELF set a choice ("you may scry 2") — chain its resume to ours.
    if (next.pendingChoice && !next.pendingChoice.resume) {
      return { ...next, pendingChoice: { ...next.pendingChoice, resume: { ...r, nextAtomIndex: i + 1 } } };
    }
  } else {
    next = logEvent(next, { kind: "spell-effect", effect: "optional", controller: r.controller, op: atom?.op, taken: false });
    // ===== OPTIONAL-PRIMARY REFLEXIVE (CR 603.7) ===== the optional was DECLINED, so any immediately-following
    // `reflexiveGate` atoms (the "When you do, <reflexive>" payoff) must NOT fire — per CR 603.7 the reflexive
    // ability doesn't even trigger when the primary action didn't happen (Generous Plunderer: a declined "may
    // create a Treasure" makes NO opponent Treasure). Skip the contiguous run of reflexiveGate atoms so the
    // program resumes AFTER them. (On the TAKEN branch above we fall through to nextAtomIndex = i+1, so the
    // gated atoms run normally.)
    const progAtoms = programAtoms(r.program, r.chosenMode);
    let skipTo = i + 1;
    while (progAtoms[skipTo] && progAtoms[skipTo].reflexiveGate) skipTo += 1;
    return resumeAfterChoice(next, { resume: { ...r, nextAtomIndex: skipTo } });
  }
  return resumeAfterChoice(next, { resume: { ...r, nextAtomIndex: i + 1 } });
}

/**
 * KW-WARD-PR2 — can `playerId` afford the soft-counter's STRUCTURED ward cost? Mirrors the affordability
 * half of settleSoftCounterCost (below) without mutating, so autoPick and settle never disagree.
 */
function canAffordWardCost(state, playerId, cost) {
  const player = state.players?.[playerId];
  if (!player) return false;
  if (cost.kind === "life") return (player.life ?? 0) >= cost.life; // CR 119.4 — pay life only if you have it
  if (cost.kind === "mana") return canAfford(player.manaPool, manaSources(state, playerId), cost.mana);
  // ⛔ DISCARD ward — an EMPTY hand is "CAN'T PAY", so the spell is countered rather than waved through.
  // Tokens are excluded to match advanceDiscardChain, which filters them from the discardable hand: an
  // affordability check that counted them would promise a payment the chain then couldn't make.
  if (cost.kind === "discard") return (player.hand || []).filter((c) => !c.token).length >= (cost.n || 1);
  return false;
}

/**
 * KW-WARD-PR2 — pay the soft-counter's STRUCTURED ward cost, returning { state, paid }. Mana → payManaCost
 * (taps sources / cracks Treasures, full colored+hybrid shape). Life → loseLife when life >= N (CR 119.4),
 * else unpaid (state UNCHANGED — never fabricated). Same contract as payGenericMana.
 */
function settleSoftCounterCost(state, playerId, cost) {
  if (cost.kind === "mana") return payManaCost(state, playerId, cost.mana);
  if (cost.kind === "life") {
    const player = state.players?.[playerId];
    if (!player || (player.life ?? 0) < cost.life) return { state, paid: false };
    return { state: loseLife(state, { playerId, amount: cost.life }), paid: true };
  }
  // ⭐ DISCARD ward — the cards do NOT move here. Affordability is confirmed (non-empty hand), which is
  // enough to settle the SPELL'S fate: a discard with cards in hand always succeeds, so the spell is saved
  // and the remaining question is only WHICH card. resolveSoftCounterChoice hands that to
  // advanceDiscardChain immediately after the paid log, so the pick happens through the ordinary discard
  // pause the player already understands — and discard TRIGGERS fire from that settled path (CR 701.9a)
  // rather than from a bespoke move here.
  if (cost.kind === "discard") {
    const player = state.players?.[playerId];
    const hand = (player?.hand || []).filter((c) => !c.token);
    return hand.length >= (cost.n || 1) ? { state, paid: true } : { state, paid: false };
  }
  return { state, paid: false };
}

/**
 * ===== SOFT-CNT ===== — decide whether an AI / Expert (no picker) pays the cost to save its spell from a
 * soft counter. Heuristic: PAY IF ABLE (the controller protects its own spell when it can). For a plain
 * generic soft counter (Force Spike / Mana Leak / generic-mana ward) the cost is the fixed `amount`; for a
 * KW-WARD-PR2 structured `cost` (colored mana / life) it's the descriptor. If unaffordable, return false
 * (the spell is countered). A board-aware "decline to save a worthless spell / don't tap out / don't pay 5
 * life" refinement is a future enhancement; pay-if-able is always a LEGAL choice (CR 601), never wrong.
 */
export function autoPickSoftCounterPay(state, pc) {
  const player = state.players?.[pc?.controller];
  if (!player) return false; // controller gone → can't pay → countered
  if (pc.cost) return canAffordWardCost(state, pc.controller, pc.cost);
  return canAfford(player.manaPool, manaSources(state, pc.controller), { generic: pc.amount || 0 });
}

/**
 * ===== SOFT-CNT ===== — settle a soft counter's pay-or-be-countered decision: if `pay` AND the targeted
 * spell's controller can afford {N}, charge the mana (payGenericMana — taps their sources) and the spell
 * SURVIVES; otherwise COUNTER it (counterSpellById, the shared hard-counter path). Then RESUME the caster's
 * program. Guards: a spell that left the stack mid-pause is a logged fizzle; a controller eliminated mid-
 * pause can't pay → countered (CR 800.4a); a `pay` the controller can't actually afford falls through to the
 * counter (payGenericMana returns paid:false, state unchanged — never fabricated mana).
 */
export function resolveSoftCounterChoice(state, pay) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "soft-counter") return state;
  let next = clearPendingChoice(state);
  // The threatened object may be a SPELL (counterspell soft-counter / cast-path ward) or, for a
  // KW-WARD-PR2 ability-targeting ward, an activated/triggered ABILITY — both are countered by id.
  const onStack = (next.stack || []).some((o) => o.id === pc.spellId && (o.kind === "spell" || o.kind === "activated-ability" || o.kind === "triggered-ability"));
  if (!onStack) {
    next = logEvent(next, { kind: "spell-effect", effect: "soft-counter-fizzle", spellId: pc.spellId });
    return resumeAfterChoice(next, pc);
  }
  let paid = false;
  if (pay && next.players?.[pc.controller]) {
    // KW-WARD-PR2: a structured `cost` (colored mana / life ward) is paid by settleSoftCounterCost; the
    // legacy fixed-generic soft counter (Force Spike / Mana Leak / generic-mana ward) stays on payGenericMana.
    const r = pc.cost ? settleSoftCounterCost(next, pc.controller, pc.cost) : payGenericMana(next, pc.controller, pc.amount);
    next = r.state;
    paid = r.paid;
  }
  if (paid) {
    next = logEvent(next, { kind: "spell-effect", effect: "soft-counter-paid", controller: pc.controller, amount: pc.amount, cost: pc.cost || null, spellName: pc.spellName });
    // ⭐ DISCARD WARD — the spell is already SAVED (paid above); only the card pick remains, and it cannot
    // change the outcome. Hand it to the ordinary discard chain, which discards inline when the hand is
    // small enough to leave no real decision and pauses for a pick otherwise.
    // ⛔ WHEN IT PAUSES WE MUST NOT RESUME HERE. The soft-counter's own `resume` is carried ONTO the discard
    // choice, so the suspended caster program fires exactly once — after the discard settles — instead of
    // twice or not at all. resolveDiscardChoice already implements that carry for chained discards; this
    // reuses it rather than inventing a second resume path.
    if (pc.cost?.kind === "discard") {
      next = advanceDiscardChain(next, { queue: [{ playerId: pc.controller, remaining: pc.cost.n || 1 }], sourceName: pc.sourceName || pc.spellName || null });
      if (next.pendingChoice) {
        return pc.resume ? { ...next, pendingChoice: { ...next.pendingChoice, resume: pc.resume } } : next;
      }
      // No pause (the whole hand was forced) — fall through to the normal resume below.
    }
  } else {
    // CS-1: a soft counter with a zone redirect (Syncopate / No More Lies) exiles on the decline —
    // pc.counterDest rides the choice from applyCounter so the redirect survives the suspend.
    next = counterSpellById(next, pc.spellId, { via: "soft-counter", counterDest: pc.counterDest || null });
  }
  return resumeAfterChoice(next, pc);
}

/**
 * ===== OPTIONAL-LIFE-PAYMENT (CR 614.1c + 119.4 — the SHOCKLAND clause, LANDS-TIER slice 2) ===== — settle
 * "you may pay N life. If you don't, it enters tapped." for a land that entered UNTAPPED on the play-land
 * path and is waiting on the controller. PAY → deduct the life through loseLife (the one life sink — so a
 * "whenever you lose life" watcher and the 0-life SBA both see it; CR 119.4 permits paying down to exactly
 * 0, so the gate is life >= N, not > N) and the land stays untapped. DECLINE — or an unaffordable pay —
 * → tap it with fromEnter (CR 701.26a: entering tapped is NOT "becoming tapped"; no becomes-tapped event).
 *
 * NO RESUME: this pause was raised outside any effect program, so resumeAfterChoice is deliberately not
 * called — the settler returns the board and the learnSession wrapper finalizes the stack (SBA + flush),
 * exactly as the mana sibling does after its own resume. A vanished land (it left the battlefield during
 * the pause) or an eliminated controller → clear the pause and do nothing, never a phantom tap or charge.
 */
/**
 * ===== SYLVAN LIBRARY (SG-15b, CR 603.7c + 121.4) ===== — settle ONE drawn card's pay-or-put-back: `pay`
 * with the life to spare → lose L life and keep the card; otherwise (declined, or life below L — CR 119.4
 * lets you pay down to 0, never below) the card goes from hand to the TOP of its owner's library. Then
 * chain the next card under the same continuation, or resume the program after the last one. A card that
 * already left the hand (a mid-pause effect) is skipped — never a phantom move, never a charge for nothing.
 */
export function resolveSylvanLibraryChoice(state, pay) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "sylvan-library") return state;
  let next = clearPendingChoice(state);
  const player = next.players?.[pc.controller];
  if (!player) return next;
  const life = pc.life || 0;
  const inHand = (player.hand || []).some((c) => c.id === pc.cardId);
  if (inHand) {
    if (pay && life > 0 && (player.life ?? 0) >= life) {
      next = loseLife(next, { playerId: pc.controller, amount: life });
      next = logEvent(next, { kind: "spell-effect", effect: "sylvan-library-card", controller: pc.controller, cardId: pc.cardId, cardName: pc.cardName, paid: true, amount: life });
    } else {
      next = moveCardToZone(next, { playerId: pc.controller, fromZone: "hand", toZone: "library", cardId: pc.cardId, toTop: true });
      next = logEvent(next, { kind: "spell-effect", effect: "sylvan-library-card", controller: pc.controller, cardId: pc.cardId, cardName: pc.cardName, paid: false, putBack: true });
    }
  } else {
    next = logEvent(next, { kind: "spell-effect", effect: "sylvan-library-card", controller: pc.controller, cardId: pc.cardId, cardName: pc.cardName, skipped: "not in hand" });
  }
  const remaining = Array.isArray(pc.remaining) ? pc.remaining : [];
  if (remaining.length > 0) {
    const [id, ...rest] = remaining;
    const card = (next.players[pc.controller]?.hand || []).find((c) => c.id === id);
    return setPendingSylvanLibraryChoice(next, { controller: pc.controller, cardId: id, cardName: card?.name || null, life, remaining: rest, sourceName: pc.sourceName || null, resume: pc.resume });
  }
  return pc.resume ? resumeAfterChoice(next, pc) : next;
}

export function resolveOptionalLifePaymentChoice(state, pay) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "optional-life-payment") return state;
  let next = clearPendingChoice(state);
  const player = next.players?.[pc.controller];
  if (!player) return next;
  const lk = findPermanent(next, pc.permanentId);
  if (!lk?.permanent) return next;
  const life = pc.life || 0;
  if (pay && (player.life ?? 0) >= life && life > 0) {
    next = loseLife(next, { playerId: pc.controller, amount: life });
    return logEvent(next, { kind: "spell-effect", effect: "optional-life-payment", controller: pc.controller, paid: true, amount: life, permanentId: pc.permanentId });
  }
  next = tapPermanent(next, pc.permanentId, { fromEnter: true });
  return logEvent(next, { kind: "spell-effect", effect: "optional-life-payment", controller: pc.controller, paid: false, amount: life, permanentId: pc.permanentId });
}

/**
 * ===== OPTIONAL-MANA-PAYMENT (CR 603.7c) ===== — decide whether an AI / Expert (no picker) takes the optional
 * "you may pay {cost}. If you do, <effect>" payment. Heuristic: PAY IF ABLE (the modeled payoffs — draw a card
 * — are beneficial, so paying is the sensible default). Affordability is checked via the SAME planPayment the
 * settle uses (canAfford over pool + sources), so autoPick and settle never disagree. A board-aware "decline
 * when the card isn't worth the mana / don't tap out" refinement is a future enhancement; pay-if-able is always
 * a LEGAL choice (CR 601), never wrong. Returns false when the controller is gone or can't afford the cost.
 */
export function autoPickOptionalManaPayment(state, pc) {
  const player = state.players?.[pc?.controller];
  if (!player) return false;
  const cost = pc?.cost;
  if (cost?.kind === "energy") return hasEnergy(state, pc.controller, cost.amount || 0); // pay-if-able (energy is a stored resource; spending a beneficial payoff is the sensible default)
  // DISCARD-RANDOM (2026-08-12, Apathy) — pay iff a non-token card is in hand (the SAME before-check the
  // settle's cost arm gates on, so auto-pick and settle cannot disagree — the Masticore lesson). Untapping
  // your own creature for one random card is the pay-if-able default; a hand-value refinement is future.
  if (cost?.kind === "discard-random") return (player.hand || []).filter((c) => !c.token).length >= (cost.count || 1);
  if (cost?.kind !== "mana") return false; // only the modeled mana / energy forms pay
  return canAfford(player.manaPool, manaSources(state, pc.controller), cost.mana || {});
}

/**
 * ===== REFLEXIVE-SAC-BY-SUBTYPE (CR 603.7c) ===== — decide whether an AI / Expert (no picker) takes the
 * optional "you may sacrifice a <subtype>. If you do, <effect>" sacrifice. Heuristic: SAC IF ABLE (the modeled
 * payoffs — draw a card, +1/+1 counter — outvalue a fungible Food/Treasure/Blood token, so cashing one in is the
 * sensible default; the goose's Food made it, the value is the draw). `available` is computed at suspend time
 * (the controller controls ≥1 matching permanent), so autoPick and the settle never disagree. A board-aware
 * "hold the Treasure for mana" refinement is a future enhancement; sac-if-able is always a LEGAL choice (CR 601),
 * never a rules error. Returns false when the controller is gone or has no matching permanent to sacrifice.
 */
export function autoPickOptionalSac(state, pc) {
  if (!state.players?.[pc?.controller]) return false;
  return !!pc?.available; // sac iff a matching permanent exists (you can't sacrifice what you don't control)
}

/**
 * ===== OPTIONAL-MANA-PAYMENT (CR 603.7c) ===== — settle a "you may pay {cost}. If you do, <effect>" pay-or-
 * decline decision: if `pay` AND the controller can afford the cost, charge the mana (payManaCost — taps their
 * sources, full colored shape) and RUN the payoff atoms (the parser validated them HIGH + targetless); else do
 * NOTHING (declined, or unaffordable — payManaCost never fabricates mana, CR 119 — so the payoff never runs on
 * a failed pay, the cardinal CREED guarantee). Then RESUME the suspended program. A payoff atom that itself
 * sets a choice (a "scry"/"draw then scry" payoff) chains its resume onto ours (mirrors resolveOptionalChoice).
 * Eliminated-controller guard (the pause can outlive the SBA that removes them, CR 800.4a). Logged either way.
 */
export function resolveOptionalManaPaymentChoice(state, pay) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "optional-mana-payment") return state;
  let next = clearPendingChoice(state);
  if (!next.players?.[pc.controller]) return next; // controller eliminated mid-pause → bail, no resume
  let paid = false;
  // CONDITIONED PAYMENT (Springheart Nantuko): `available: false` means the card's own condition was not met,
  // so the payment CANNOT be made however the seat answers — the pause exists only so the settler can run the
  // fallback. Every other carrier omits the field and defaults to true, so their path is unchanged.
  const canPay = pc.available !== false;
  if (canPay && pay && pc.cost?.kind === "mana") {
    // LIFE RIDER (Ripples of Undeath "pay {1} and 3 life", 2026-08-15): the WHOLE compound must be
    // payable or NOTHING is charged (CR 601.2h — a cost is paid in full or not at all): the life gate
    // runs FIRST (CR 119.4 — you can't pay more life than you have; paying down to exactly 0 is
    // legal), then the mana; the life is only deducted when the mana half also paid, so a failed
    // payManaCost can never half-charge the life. Absent rider (every pre-existing carrier) → the
    // life gate passes vacuously and the branch is byte-identical.
    const lifeOwed = pc.cost.life || 0;
    if ((next.players[pc.controller]?.life ?? 0) >= lifeOwed) {
      const r = payManaCost(next, pc.controller, pc.cost.mana || {});
      next = r.state;
      paid = r.paid;
      if (paid && lifeOwed > 0) next = loseLife(next, { playerId: pc.controller, amount: lifeOwed });
    }
  } else if (canPay && pay && pc.cost?.kind === "energy") {
    // ENERGY (CR 122.1e): pay iff the controller actually has the energy — spendEnergy never drives it negative,
    // and an unaffordable "pay" runs NO payoff (mirrors payManaCost's no-fabrication guarantee, the CREED bar).
    if (hasEnergy(next, pc.controller, pc.cost.amount || 0)) {
      next = spendEnergy(next, { playerId: pc.controller, amount: pc.cost.amount || 0 });
      paid = true;
    }
  } else if (canPay && pay && pc.cost?.kind === "discard-random") {
    // DISCARD-RANDOM cost (2026-08-12, Apathy "may discard a card at random. If the player does, untap…"):
    // a REAL random discard through the SEEDED pitchRandomDiscard — CR 701.9b picks the card, discard
    // watchers fire, serialize-stable. The before-check is the paid gate: an empty (non-token) hand pays
    // NOTHING and `paid` stays false → no payoff (the CREED no-fabrication bar, same as an unaffordable
    // payManaCost).
    const nontoken = (next.players[pc.controller]?.hand || []).filter((c) => !c.token);
    if (nontoken.length >= (pc.cost.count || 1)) {
      next = pitchRandomDiscard(next, { discarders: [pc.controller], amount: pc.cost.count || 1, sourceName: pc.sourceName || null });
      paid = true;
    }
  }
  next = logEvent(next, { kind: "spell-effect", effect: "optional-mana-payment", controller: pc.controller, paid, sourceName: pc.sourceName || null });
  // PAID → the payoff atoms. DECLINED → the ELSE atoms, when the card prints a fallback (Springheart Nantuko:
  // "If you didn't create a token this way, create a 1/1 green Insect creature token"). Both run through the
  // SAME helper: the loop below carries real pause-chaining logic (WI-3), and two copies of it would drift.
  const branch = paid ? (pc.effectAtoms || []) : (pc.elseAtoms || []);
  const ran = runOptionalPaymentBranch(next, branch, pc, paid);
  if (ran.halted) return ran.state;
  next = ran.state;
  return resumeAfterChoice(next, pc);
}

/**
 * Run one branch of an optional-payment settle (the paid payoff, or the declined fallback) in printed order.
 * Each atom is HIGH + non-modal (parser-validated). The parser admits at most ONE chosen target type, whose
 * target was locked when the ability went on the stack (CR 603.3d) and rides the choice as `pc.targets` —
 * replayed here. A targetless branch carries [].
 *
 * Returns { state, halted }. `halted` means the caller must return `state` AS IS — the branch either routed
 * to the Arbiter or chained a pause onto the program's resume, and in both cases resuming again would be
 * wrong. Extracted from the paid path so the ELSE branch inherits the same WI-3 mid-branch-pause guard
 * instead of a second copy of it.
 */
function runOptionalPaymentBranch(state, atoms, pc, paid) {
  const r = pc.resume || {};
  const label = paid ? "payoff" : "fallback";
  let next = state;
  for (let i = 0; i < atoms.length; i++) {
    const ctx = { ...(r.context || {}), controller: pc.controller, targets: pc.targets || [], cardName: r.cardName ?? pc.sourceName ?? null, xValue: r.xValue ?? null, sourceId: r.sourceId ?? null };
    const after = resolveAtom(next, atoms[i], ctx);
    if (after == null) {
      return { halted: true, state: markPendingArbiter(next, { source: { name: pc.sourceName }, payload: { params: r } }, `optional-mana-payment ${label} atom "${atoms[i]?.op}" had no resolver`) };
    }
    next = after;
    // A branch atom set a resolution-time choice (scry/surveil) — chain its resume onto the program's, so the
    // choice settles into the PROGRAM continuation (nextAtomIndex). That chain is only correct for the LAST
    // atom: a mid-branch pause would drop atoms i+1.. (the chained resume skips the tail).
    if (next.pendingChoice && !next.pendingChoice.resume) {
      // WI-3 belt-and-braces: the parser gate (PAUSING_ATOM_OPS in matchOptionalManaPayment) makes a NON-LAST
      // pausing atom unreachable for native programs — if one pauses anyway, NEVER drop the remaining atoms.
      // Clear the inner choice and route to the Arbiter with an honest reason (CREED-safe FN: the card is
      // handed off rather than half-resolved).
      if (i < atoms.length - 1) {
        return { halted: true, state: markPendingArbiter(
          clearPendingChoice(next),
          { source: { name: pc.sourceName }, payload: { params: r } },
          `optional-mana-payment ${label} atom "${atoms[i]?.op}" paused mid-${label} — resuming would drop ${atoms.length - 1 - i} remaining atom(s)`,
        ) };
      }
      return { halted: true, state: { ...next, pendingChoice: { ...next.pendingChoice, resume: pc.resume } } };
    }
  }
  return { halted: false, state: next };
}

/**
 * ===== REFLEXIVE-SAC-BY-SUBTYPE (CR 603.7c) ===== — settle a "you may sacrifice a <subtype>. If you do,
 * <effect>" sac-or-decline decision: if `doSac` AND the controller still controls a matching-subtype permanent,
 * SACRIFICE one (sacrificeCreatureEffect — moves it to the graveyard, fires its dies + TRIG-SACRIFICE watchers,
 * CR 701.21) and RUN the payoff atoms (the parser validated them HIGH + targetless); else do NOTHING (declined,
 * or none available — sacrificeCreatureEffect never fabricates a sacrifice, so the payoff never runs on a non-
 * sac, the cardinal CREED guarantee). Then RESUME the suspended program. The board is re-scanned HERE (not trusted
 * from the suspend-time `available`) so a matching permanent removed during the pause can't be sacrificed — and a
 * stale "decline" can't suppress an payoff (there is none on decline anyway). A payoff atom that itself sets a
 * choice chains its resume onto ours (mirrors resolveOptionalManaPaymentChoice). Eliminated-controller guard
 * (the pause can outlive the SBA that removes them, CR 800.4a). Logged either way.
 */
export function resolveOptionalSacChoice(state, doSac) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "optional-sac-payment") return state;
  let next = clearPendingChoice(state);
  const player = next.players?.[pc.controller];
  if (!player) return next; // controller eliminated mid-pause → bail, no resume
  // Re-scan the board NOW (CR 603.6e) — a matching permanent may have left during the pause.
  const victim = doSac ? (player.battlefield || []).find((p) => controllerSacSubtypeMatch(p, pc.subtype)) : null;
  let sacrificed = false;
  if (victim) {
    next = sacrificeCreatureEffect(next, pc.controller, victim.id); // pitch it + fire dies/TRIG-SACRIFICE watchers
    sacrificed = true;
  }
  next = logEvent(next, { kind: "spell-effect", effect: "optional-sac-payment", controller: pc.controller, subtype: pc.subtype, sacrificed, sourceName: pc.sourceName || null });
  if (sacrificed) {
    // Run the payoff atoms in printed order. Each is HIGH + targetless (parser-validated), so an empty targets
    // list is correct; thread the resume's context/sourceId so a context/self-dependent payoff resolves (e.g.
    // "put a +1/+1 counter on this creature" → ctx.sourceId is the attacking source permanent).
    const r = pc.resume || {};
    const atoms = pc.effectAtoms || [];
    for (let i = 0; i < atoms.length; i++) {
      const ctx = { ...(r.context || {}), controller: pc.controller, targets: pc.targets || [], cardName: r.cardName ?? pc.sourceName ?? null, xValue: r.xValue ?? null, sourceId: r.sourceId ?? null };
      const after = resolveAtom(next, atoms[i], ctx);
      if (after == null) {
        return markPendingArbiter(next, { source: { name: pc.sourceName }, payload: { params: r } }, `optional-sac-payment payoff atom "${atoms[i]?.op}" had no resolver`);
      }
      next = after;
      // A payoff atom set a resolution-time choice (scry/surveil) — chain its resume onto the program's so the
      // choice settles into the PROGRAM continuation (mirrors the mana-payment path). Only correct for the
      // LAST payoff atom: a mid-payoff pause would drop atoms i+1.. (the chained resume skips the payoff tail).
      if (next.pendingChoice && !next.pendingChoice.resume) {
        // WI-3 belt-and-braces: the parser gate (PAUSING_ATOM_OPS in matchOptionalSacBySubtype) makes a
        // NON-LAST pausing payoff unreachable for native programs — if one pauses anyway, NEVER drop the
        // remaining payoff atoms. Clear the inner choice and route to the Arbiter with an honest reason
        // (CREED-safe FN: the card is handed off rather than half-resolved).
        if (i < atoms.length - 1) {
          return markPendingArbiter(
            clearPendingChoice(next),
            { source: { name: pc.sourceName }, payload: { params: r } },
            `optional-sac-payment payoff atom "${atoms[i]?.op}" paused mid-payoff — resuming would drop ${atoms.length - 1 - i} remaining payoff atom(s)`,
          );
        }
        return { ...next, pendingChoice: { ...next.pendingChoice, resume: pc.resume } };
      }
    }
  }
  return resumeAfterChoice(next, pc);
}

/**
 * ===== OPTIONAL DRAW-THEN-DISCARD ===== — auto-pick for self-play: DRAW (a net-neutral loot is card-selection
 * upside — you trade your worst card for a fresh look). Returns false only when the controller is gone.
 */
export function autoPickOptionalDrawDiscard(state, pc) {
  return !!state.players?.[pc?.controller];
}

/**
 * ===== OPTIONAL-DISCARD-PAYMENT ===== — auto-pick for self-play: PAY (discard) iff a non-token card is available.
 * Trading one card for a draw/token/pump payoff is card-neutral-or-better filtering; a board-aware "hold the card"
 * refinement is a future enhancement, and discard-if-able is always a LEGAL choice (CR 601). Returns false when the
 * controller is gone or has no non-token card to pitch (mirrors autoPickOptionalSac's available-gate).
 */
export function autoPickOptionalDiscard(state, pc) {
  if (!state.players?.[pc?.controller]) return false;
  return !!pc?.available;
}

/**
 * ===== UPKEEP-SAC-UNLESS-PAY ===== — auto-pick for self-play: PAY iff the controller can afford the cost (keep the
 * permanent — the sensible default; a board-aware "let it die" refinement is future). Returns false (→ sacrifice)
 * when the controller is gone or can't afford. CRASH-FIX: canAfford's arity is (pool, sources, cost) — the design's
 * two-arg call threw `sources.map is not a function` on every AI-resolved instance. Mirrors autoPickSoftCounterPay.
 */
export function autoPickSacUnlessPay(state, pc) {
  const player = state.players?.[pc?.controller];
  if (!player) return false; // controller gone → can't pay → sacrificed
  // SAC-UNLESS-DISCARD (2026-08-07) — pay iff a card is in hand. ⛔ THE KIND ARM IS NOT OPTIONAL: without
  // it a discard cost fell through to canAfford(pool, sources, {}), which is TRUE for an empty mana cost —
  // so the auto-pick said "pay", the settle's mana-only arm could not pay, and the creature DIED with a
  // full hand. An auto-pick and a settle that disagree about payability is the same offer/payment split
  // the cast lane guards against, one layer down.
  if (pc.cost?.kind === "discard") return (player.hand || []).length >= (pc.cost.count || 1);
  // SAC-UNLESS-SACRIFICE (2026-08-12) — pay iff enough pool-matching permanents are on the controller's
  // battlefield (same predicate the settle uses, so offer and payment cannot disagree about payability).
  if (pc.cost?.kind === "sacrifice") {
    return (player.battlefield || []).filter((p) => sacrificePoolMatch(pc.cost.type, p.card)).length >= (pc.cost.count || 1);
  }
  // SAC-UNLESS-RETURN-LAND (2026-08-12) — pay iff a pool-matching land is on the battlefield (the
  // Djinn's untapped gate lives in the shared predicate, so a fully-tapped board honestly refuses).
  if (pc.cost?.kind === "return-land") {
    return (player.battlefield || []).some((p) => returnLandPoolMatch(pc.cost, p));
  }
  return canAfford(player.manaPool, manaSources(state, pc.controller), pc.cost?.mana || {});
}

/**
 * ===== OPTIONAL DRAW-THEN-DISCARD ===== — settle "you may draw a card. If you do, discard a card.": on `doDraw`
 * run the [draw, discard] payoff in order (parser-validated HIGH + targetless); on decline do NOTHING (hand &
 * library untouched — the cardinal CREED guarantee). The discard is the LAST atom, so its which-card pause chains
 * onto the program continuation (mirrors resolveOptionalSacChoice's payoff loop; no cost to pay). Eliminated-
 * controller guard (the pause can outlive the SBA that removes them, CR 800.4a).
 */
export function resolveOptionalDrawDiscardChoice(state, doDraw) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "optional-draw-discard") return state;
  let next = clearPendingChoice(state);
  if (!next.players?.[pc.controller]) return next; // controller eliminated mid-pause → bail, no resume
  next = logEvent(next, { kind: "spell-effect", effect: "optional-draw-discard", controller: pc.controller, drew: !!doDraw, sourceName: pc.sourceName || null });
  if (doDraw) {
    const r = pc.resume || {};
    const atoms = pc.effectAtoms || [];
    for (let i = 0; i < atoms.length; i++) {
      const ctx = { ...(r.context || {}), controller: pc.controller, targets: pc.targets || [], cardName: r.cardName ?? pc.sourceName ?? null, xValue: r.xValue ?? null, sourceId: r.sourceId ?? null };
      const after = resolveAtom(next, atoms[i], ctx);
      if (after == null) {
        return markPendingArbiter(next, { source: { name: pc.sourceName }, payload: { params: r } }, `optional-draw-discard payoff atom "${atoms[i]?.op}" had no resolver`);
      }
      next = after;
      // The discard (last atom) sets a which-card pendingChoice — chain its resume onto the program continuation.
      // A NON-LAST pause is unreachable per the parser gate, but WI-3 belt-and-braces routes to the Arbiter
      // rather than dropping the payoff tail if one ever occurs (CREED-safe FN).
      if (next.pendingChoice && !next.pendingChoice.resume) {
        if (i < atoms.length - 1) {
          return markPendingArbiter(clearPendingChoice(next), { source: { name: pc.sourceName }, payload: { params: r } }, `optional-draw-discard payoff atom "${atoms[i]?.op}" paused mid-payoff — resuming would drop ${atoms.length - 1 - i} remaining atom(s)`);
        }
        return { ...next, pendingChoice: { ...next.pendingChoice, resume: pc.resume } };
      }
    }
  }
  return resumeAfterChoice(next, pc);
}

/**
 * ===== OPTIONAL-DISCARD-PAYMENT ===== — settle "you may discard a card. If you do, <effect>": on `doDiscard` AND a
 * non-token card in hand (re-scanned NOW, CR 603.6e — the hand may have emptied during the pause), run the synthetic
 * program [discard-a-card, ...payoff]. The cost-discard is a PAUSING atom, so runEffectProgram sets up its which-card
 * choice and stores the resume; the payoff (parser-gated NON-pausing) runs as the program continuation once the
 * discard settles (via resolveDiscardChoice's resumeAfterChoice), then finishSpellResolution closes the spell with
 * the threaded spellToGraveyard. On decline / empty hand do NOTHING — the payoff NEVER runs without a paid cost (the
 * cardinal CREED guarantee: no fabricated draw). Eliminated-controller guard (CR 800.4a). Logged either way.
 */
export function resolveOptionalDiscardPaymentChoice(state, doDiscard) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "optional-discard-payment") return state;
  let next = clearPendingChoice(state);
  if (!next.players?.[pc.controller]) return next; // controller eliminated mid-pause → bail, no resume
  // ⚠️ THE COST IS COUNTED, NOT MERELY TESTED NON-EMPTY. This check is INDEPENDENT of the availability gate
  // at the offer site (stack.js), and a `.some()` here let a two-card cost be "paid" with one card in hand:
  // the program pitched what it could and the payoff ran anyway — a fabricated effect for an unpaid cost.
  // Caught by a runtime probe, not by reading. For the singular cards (discardCount 1) `>= 1` is exactly
  // equivalent to the old `.some()`, so their behaviour is unchanged.
  const owed = pc.discardCount ?? 1;
  const canPay = !!doDiscard && (next.players[pc.controller].hand || []).filter((c) => !c.token).length >= owed;
  next = logEvent(next, { kind: "spell-effect", effect: "optional-discard-payment", controller: pc.controller, discarded: canPay, sourceName: pc.sourceName || null });
  if (canPay) {
    const r = pc.resume || {};
    // [cost-discard, ...payoff] as ONE program: the discard pauses (which-card), the payoff runs on resume. The
    // discard atom is the canonical controller-discard shape (hand.js discardClauseParser). Availability was gated
    // above, so the discard ALWAYS pitches exactly one card → the payoff runs iff (and only iff) the cost was paid.
    // amount = pc.discardCount (default 1). Availability was gated on the SAME number upstream, so the
    // discard always pitches exactly the printed cost and the payoff runs iff the full cost was paid.
    const program = { atoms: [{ op: "discard", amount: pc.discardCount ?? 1, who: "controller", targetType: null }, ...(pc.effectAtoms || [])] };
    const obj = {
      source: { name: pc.sourceName ?? null },
      payload: { params: {
        program, controller: pc.controller, targets: [],
        xValue: r.xValue ?? null, sourceId: r.sourceId ?? null, context: r.context || {},
        kicked: r.kicked ?? false, chosenMode: null, spellToGraveyard: r.spellToGraveyard ?? null,
      } },
    };
    return runEffectProgram(next, obj);
  }
  return resumeAfterChoice(next, pc);
}

/**
 * ===== MILLED-PICK ===== — settle "put a [land ]card from among those cards into your hand" (Ripples /
 * Six): move the CHOSEN candidate graveyard → hand. The chosen id is re-validated against the pause's
 * candidate list AND the live graveyard (CR 608.2b — gone → fall through to the first still-present
 * candidate; none left → a logged no-op). A null/stale submit auto-picks the first candidate, the same
 * deterministic pick the AI driver uses.
 */
export function resolveMilledPickChoice(state, cardId) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "milled-pick") return state;
  let next = clearPendingChoice(state);
  if (!next.players?.[pc.controller]) return next; // controller eliminated mid-pause → bail
  const gy = next.players[pc.controller].graveyard || [];
  const stillThere = (id) => gy.some((c) => c.id === id);
  const valid = (pc.candidates || []).filter((c) => stillThere(c.id));
  const pick = valid.find((c) => c.id === cardId) || valid[0] || null;
  if (!pick) {
    next = logEvent(next, { kind: "spell-effect", effect: "milled-pick", picked: null, controller: pc.controller });
    return resumeAfterChoice(next, pc);
  }
  next = moveCardToZone(next, { playerId: pc.controller, fromZone: "graveyard", toZone: "hand", cardId: pick.id });
  next = logEvent(next, { kind: "spell-effect", effect: "milled-pick", picked: pick.name, controller: pc.controller });
  return resumeAfterChoice(next, pc);
}

/**
 * ===== OPTIONAL-EXILE-SELF PAYMENT ===== — settle "you may exile it. When you do, <payoff>" (Undead
 * Butler): on `doExile`, the dead card is RE-SCANNED across every graveyard NOW (CR 603.6e — it may have
 * been recurred/exiled during the pause; the offer-site availability is not trusted here, the same
 * independence the discard settler documents) and moved graveyard → exile; ONLY a real move runs the
 * payoff (with the flush-locked pc.targets replayed — CR 603.3d). Decline, or the card gone → NOTHING:
 * the payoff never runs without the paid cost (the cardinal CREED guarantee). Logged either way.
 */
export function resolveOptionalExileSelfChoice(state, doExile) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "optional-exile-self-payment") return state;
  let next = clearPendingChoice(state);
  if (!next.players?.[pc.controller]) return next; // controller eliminated mid-pause → bail, no resume
  let paid = false;
  if (doExile && pc.cardId) {
    for (const pid of Object.keys(next.players || {})) {
      const gy = next.players[pid]?.graveyard || [];
      const gi = gy.findIndex((c) => c?.id === pc.cardId);
      if (gi === -1) continue;
      const card = gy[gi];
      next = { ...next, players: { ...next.players, [pid]: { ...next.players[pid], graveyard: [...gy.slice(0, gi), ...gy.slice(gi + 1)], exile: [...(next.players[pid].exile || []), card] } } };
      paid = true;
      break;
    }
  }
  next = logEvent(next, { kind: "spell-effect", effect: "optional-exile-self", controller: pc.controller, paid, sourceName: pc.sourceName || null });
  if (paid && (pc.effectAtoms || []).length) {
    const r = pc.resume || {};
    const obj = {
      source: { name: pc.sourceName ?? null },
      payload: { params: {
        program: { atoms: pc.effectAtoms }, controller: pc.controller, targets: pc.targets || [],
        xValue: r.xValue ?? null, sourceId: r.sourceId ?? null, context: r.context || {},
        kicked: r.kicked ?? false, chosenMode: null, spellToGraveyard: r.spellToGraveyard ?? null,
      } },
    };
    return runEffectProgram(next, obj);
  }
  return resumeAfterChoice(next, pc);
}

/**
 * ===== UPKEEP-SAC-UNLESS-PAY ===== — settle "sacrifice this <noun> unless you pay {cost}": INVERTED polarity vs
 * optional-mana-payment. If `pay` AND the controller can afford it, charge the mana (payManaCost — taps their sources)
 * and the permanent SURVIVES; otherwise (declined, OR an unaffordable pay — payManaCost never fabricates mana, CR 119,
 * so `paid` is false) SACRIFICE the source permanent (sacrificeCreatureEffect via pc.sourceId — fires its dies +
 * TRIG-SACRIFICE watchers). A stale/absent sourceId is a clean no-op inside sacrificeCreatureEffect (never a
 * fabrication). Then RESUME the suspended program. Eliminated-controller guard (CR 800.4a). Logged either way.
 */
export function resolveSacUnlessPayChoice(state, pay) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "sac-unless-pay") return state;
  let next = clearPendingChoice(state);
  if (!next.players?.[pc.controller]) return next; // controller eliminated mid-pause → bail, no resume
  let paid = false;
  if (pay && pc.cost?.kind === "mana") {
    const r = payManaCost(next, pc.controller, pc.cost.mana || {});
    next = r.state;
    paid = r.paid;
  } else if (pay && pc.cost?.kind === "discard") {
    // SAC-UNLESS-DISCARD (2026-08-07, the Masticore cycle) — discard the first hand card (the auto-pick
    // precedent the additional-cost discard set), as a REAL discard: hand → graveyard through
    // moveCardToZone, then checkDiscardTriggers so madness/discard watchers see it (CR 701.9a). An empty
    // hand pays nothing and `paid` stays false → the source sacrifices, which is the printed outcome.
    const hand = next.players[pc.controller]?.hand || [];
    if (hand.length >= (pc.cost.count || 1)) {
      const cid = hand[0].id;
      next = moveCardToZone(next, { playerId: pc.controller, fromZone: "hand", toZone: "graveyard", cardId: cid });
      next = checkDiscardTriggers(next, pc.controller, 1);
      paid = true;
    }
  } else if (pay && pc.cost?.kind === "sacrifice") {
    // SAC-UNLESS-SACRIFICE (2026-08-12, Bog Elemental / Cosmic Larva / Endless Wurm) — pay by sacrificing
    // `count` permanents from the printed pool, re-scanned NOW (CR 603.6e — the board may have changed during
    // the pause). Pool = sacrificePoolMatch, the SAME word-anchored edict predicate offered at auto-pick, so
    // the two sides cannot disagree. A cost is all-or-nothing: fewer than `count` matches pays NOTHING and
    // `paid` stays false → the source sacrifices (the printed outcome). Victim policy mirrors the edict
    // chain's: lowest power+toughness, id tie-break — each dies through sacrificeCreatureEffect so dies +
    // TRIG-SACRIFICE watchers fire per victim.
    const pool = (next.players[pc.controller]?.battlefield || []).filter((p) => sacrificePoolMatch(pc.cost.type, p.card));
    const count = pc.cost.count || 1;
    if (pool.length >= count) {
      const score = (p) => (Number(p.card?.power) || 0) + (Number(p.card?.toughness) || 0);
      const victims = pool.slice().sort((a, b) => score(a) - score(b) || String(a.id).localeCompare(String(b.id))).slice(0, count);
      for (const vic of victims) next = sacrificeCreatureEffect(next, pc.controller, vic.id);
      paid = true;
    }
  } else if (pay && pc.cost?.kind === "return-land") {
    // SAC-UNLESS-RETURN-LAND (2026-08-12, Waterspout Djinn / Living Tsunami) — pay by BOUNCING one
    // pool-matching land, re-scanned NOW (CR 603.6e). The return is the bounce convention applyZoneMove
    // uses: moveCardToZone battlefield → hand under the controller-as-owner proxy, NO dies/sacrifice
    // watchers (a bounce is not dying, CR 700.4). Victim policy: prefer a TAPPED land when the cost
    // allows one (least mana access lost — strictly dominant, unlike the sacrifice arm's fungible
    // pools), id tie-break; the Djinn's untapped-only pool makes the preference inert there.
    const pool = (next.players[pc.controller]?.battlefield || []).filter((p) => returnLandPoolMatch(pc.cost, p));
    if (pool.length) {
      const vic = pool.slice().sort((a, b) => (a.tapped === b.tapped ? String(a.id).localeCompare(String(b.id)) : a.tapped ? -1 : 1))[0];
      next = moveCardToZone(next, { playerId: pc.controller, fromZone: "battlefield", toZone: "hand", cardId: vic.id });
      paid = true;
    }
  }
  next = logEvent(next, { kind: "spell-effect", effect: "sac-unless-pay", controller: pc.controller, paid, sourceName: pc.sourceName || null });
  if (!paid) {
    next = sacrificeCreatureEffect(next, pc.controller, pc.sourceId); // couldn't/wouldn't pay → the source sacrifices itself
  }
  return resumeAfterChoice(next, pc);
}

/**
 * ===== OPPONENT-PAYS-TO-DENY (taxed-payment) ===== — auto-pick for the PAYER (the opponent who cast): pay iff they
 * can afford the tax (deny the beneficiary the draw — the self-interested default; always a LEGAL choice, CR 601).
 * Returns false (→ the beneficiary draws) when the payer is gone or can't afford. pc.payer is the seat (== pc.controller).
 */
export function autoPickTaxedPayment(state, pc) {
  const player = state.players?.[pc?.payer];
  if (!player) return false; // payer gone → can't pay → beneficiary draws
  return canAfford(player.manaPool, manaSources(state, pc.payer), pc.cost?.mana || {});
}

/**
 * ===== OPPONENT-PAYS-TO-DENY (taxed-payment, CR 603.7c) ===== — settle "that player may pay {N}, else <payoff>"
 * (Rhystic Study: you draw a card; Smothering Tithe: you create a Treasure token). If `pay` AND the PAYER (the
 * opponent who cast/drew — pc.payer, bound at fire time) can afford it, charge the payer's mana (payManaCost) and the
 * beneficiary gets NOTHING; else (declined or unaffordable — payManaCost fabricates no mana, CR 119) the BENEFICIARY
 * (the trigger's controller — pc.beneficiary) gets the decline-payoff: a card draw (declinePayoff "draw") or a
 * functional Treasure token (declinePayoff "treasure" — the create-named-token atom mints one for the beneficiary,
 * carrying its "{T}, Sacrifice: Add one mana of any color" so the mana model can tap it). Then RESUME the trigger's
 * program. Eliminated-seat guards on BOTH payer and beneficiary (either can leave mid-pause, CR 800.4a).
 */
export function resolveTaxedPaymentChoice(state, pay) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "taxed-payment") return state;
  let next = clearPendingChoice(state);
  let paid = false;
  if (pay && pc.cost?.kind === "mana" && next.players?.[pc.payer]) {
    const r = payManaCost(next, pc.payer, pc.cost.mana || {});
    next = r.state;
    paid = r.paid;
  }
  next = logEvent(next, { kind: "spell-effect", effect: "taxed-payment", payer: pc.payer, beneficiary: pc.beneficiary, paid, declinePayoff: pc.declinePayoff || "draw", sourceName: pc.sourceName || null });
  if (!paid && next.players?.[pc.beneficiary]) {
    if (pc.declinePayoff === "treasure") {
      // Smothering Tithe — the BENEFICIARY creates one functional Treasure token (create-named-token mints it under
      // ctx.controller = the beneficiary, with the printed tap-for-mana ability; fireTokenEnterTriggers runs inside).
      next = resolveAtom(next, { op: "create-named-token", token: "treasure", count: 1, targetType: null }, { controller: pc.beneficiary, cardName: pc.sourceName || null, targets: [] });
    } else {
      next = drawCards(next, { playerId: pc.beneficiary, count: 1 }); // payer declined / couldn't pay → beneficiary draws
    }
  }
  return resumeAfterChoice(next, pc);
}

/**
 * Resume a suspended effect program after a resolution-time choice settled (shared by the tutor +
 * scry/surveil + optional paths): re-enter the program at the recorded `nextAtomIndex` so the atoms
 * AFTER the choice run (e.g. the "draw a card" in "Scry 1, then draw a card").
 */
function resumeAfterChoice(state, pc) {
  const r = pc.resume;
  if (r?.program && Array.isArray(programAtoms(r.program, r.chosenMode)) && r.nextAtomIndex < programAtoms(r.program, r.chosenMode).length) {
    const obj = {
      source: { name: r.cardName ?? pc.sourceName ?? null },
      payload: { params: { program: r.program, controller: r.controller, targets: r.targets, xValue: r.xValue, sourceId: r.sourceId, context: r.context, kicked: r.kicked ?? false, chosenMode: r.chosenMode, spellToGraveyard: r.spellToGraveyard ?? null } },
    };
    return runEffectProgram(state, obj, { startIndex: r.nextAtomIndex });
  }
  // GY-1 terminal: no atoms remain after the settle — the re-entered program can't finish the spell,
  // so finish it here (the two completion points are mutually exclusive per settle: exactly one fires).
  // Honor the program's self-disposition flags (selfExile — Finale of Revelation; selfShuffle — Green Sun's
  // Zenith, whose ONLY atom is the tutor, so this terminal path is the one that disposes it). Without this,
  // a tutor-that-is-the-last-atom self-shuffle spell would fall to the graveyard instead of the library.
  return finishSpellResolution(state, pc?.resume?.spellToGraveyard, {
    selfExile: !!r?.program?.selfExile,
    selfShuffle: !!r?.program?.selfShuffle,
  });
}
