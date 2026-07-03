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
import { clearPendingChoice, setPendingTutorChoice } from "../pendingChoice.js";
import { moveCardToZone, logEvent, applyScrySurveil, applyImpulseDig, findPermanent, creatureToughness, creaturePower, loseLife, drawCards } from "../gameState.js";
import { resolveAtom, shuffleControllerLibrary, tutorManaValue, cardMatchesTutorFilter, sacrificeCreatureEffect, advanceDiscardChain, advanceSacrificeChain, counterSpellById, enterCardFromZone, controllerSacSubtypeMatch, bottomLibraryCardsByIds } from "./effectAtoms.js";
import { programConfidence } from "./parser.js";
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
export function finishSpellResolution(state, disposition) {
  const playerId = disposition?.playerId;
  const card = disposition?.card;
  if (!playerId || !card) return state;
  if (card.token || card.isCopy) return state;
  const player = state.players?.[playerId];
  if (!player) return state;
  const next = {
    ...state,
    players: { ...state.players, [playerId]: { ...player, graveyard: [...(player.graveyard || []), card] } },
  };
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
  const cardName = stackObject?.source?.name || null;
  for (let i = startIndex; i < atoms.length; i++) {
    const atom = atoms[i];
    // KICKED-SPELL-EFFECT (CR 702.33e) — a `kickedOnly` atom (the "If this spell was kicked, <extra>" payoff)
    // runs ONLY when the spell was cast kicked (params.kicked). On a normal cast it's SKIPPED — never resolved,
    // never a fabricated effect (the cardinal CREED guarantee for the not-kicked path). The base atoms (no
    // `kickedOnly`) always run. On a kicked cast it falls through and resolves like any other atom.
    if (atom.kickedOnly && !kicked) continue;
    // α2 — an OPTIONAL atom ("you may <effect>"): suspend so the controller decides whether to take
    // it (a real player yes/no, or AI/Expert auto-decide). resolveOptionalChoice runs-or-skips this
    // atom then resumes. Mirror the tutor/scry pause — plain JSON, serialize-safe; never resolve a
    // "may" as mandatory (that would be a forbidden mis-apply).
    if (atom.optional) {
      return {
        ...next,
        pendingChoice: {
          kind: "optional-effect", controller, atomIndex: i, effectOp: atom.op, cardName,
          // `context` MUST ride along — a context-dependent atom (discover X = the triggering creature's
          // toughness, via ctx.triggeringPermanentId) loses its trigger context on resume otherwise → X=0.
          // `kicked` rides along so a kicked spell whose BASE atom paused (scry/tutor) still runs its kickedOnly tail on resume.
          resume: { program, controller, targets, xValue, sourceId, context, kicked, chosenMode: params.chosenMode ?? null, nextAtomIndex: i, cardName, spellToGraveyard: params.spellToGraveyard ?? null },
        },
      };
    }
    const ctx = { ...context, controller, targets: targetsForAtom(targets, i), cardName, xValue, sourceId };
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
  // (after the last atom, before finalizeStackResolution's trigger flush — CR 608.2m).
  return finishSpellResolution(next, params.spellToGraveyard);
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
  const destination = pc.destination === "battlefield" ? "battlefield" : pc.destination === "top" ? "top" : "hand";
  let topAlreadyShuffled = false;
  if (inSource) {
    if (destination === "battlefield") {
      // RAMP-1 — the fetched card enters the battlefield (tapped per the card), firing ETB triggers.
      next = enterCardFromZone(next, { playerId: pc.controller, cardId, fromZone: sourceZone, tapped: !!pc.entersTapped }).state;
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
      next = moveCardToZone(next, { playerId: pc.controller, fromZone: sourceZone, toZone: "hand", cardId });
    }
  }
  // RAMP-MULTI — "up to two": after a SUCCESSFUL fetch with fetches still remaining, re-suspend for the next
  // pick from the still-legal candidates (the just-fetched card removed), carrying the same program resume —
  // WITHOUT shuffling yet (Explosive Vegetation / Skyshroud Claim shuffle once, after the last fetch). A
  // declined/empty fetch ends the search here (the player chose to take fewer). The driver loop drains the
  // re-suspended choice (settleTutorChoice returns it; the AI auto-picks again, a human gets a second picker).
  const remaining = (pc.remaining || 1) - 1;
  if (inSource && remaining >= 1 && next.players?.[pc.controller]) {
    const rest = (pc.candidates || []).filter((c) => c.id !== cardId);
    next = setPendingTutorChoice(next, {
      controller: pc.controller, candidates: rest, sourceName: pc.sourceName, filterLabel: pc.filterLabel,
      filter: pc.filter, // WAVE-2b — carry the structured filter so chained picks keep the auto-pick gate
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
  // The CASTER can be eliminated between the pause and the settle (CR 800.4a) — the riders that resume
  // are THEIRS (Thoughtseize "lose 2 life"), so bail without resuming if they're gone (mirrors the
  // resolveScryChoice / resolveOptionalChoice guard; the victim's discard above already applied). Belt-
  // and-braces — unreachable in normal play (the discard atom precedes any rider, so the caster is alive
  // at the pause, and pendingChoice is transient/non-persisted) — but it keeps the shared seam uniform.
  if (!next.players?.[pc.controller]) return next;
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
  next = applyImpulseDig(next, { playerId: pc.controller, n: (pc.candidates || []).length, chosenId, restTo: pc.restTo });
  next = logEvent(next, { kind: "spell-effect", effect: "impulse-dig", controller: pc.controller, kept: !!chosenId, restTo: pc.restTo });
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
  for (const { c, t } of creatures) {
    if (remaining <= 0) break;
    const give = Math.min(remaining, t);
    if (give > 0) { dist.push({ id: c.id, type: "creature", amount: give }); remaining -= give; }
  }
  if (remaining > 0) {
    const player = enemies.find((c) => c.type === "player") || (pc.candidates || []).find((c) => c.type === "player");
    if (player) dist.push({ id: player.id, type: "player", amount: remaining });
    else if (dist.length) dist[dist.length - 1].amount += remaining; // no player target → onto the last creature
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
  for (const d of distribution || []) {
    if (!validIds.has(d.id) || (d.type !== "creature" && d.type !== "player")) continue;
    const amt = Math.max(0, Math.min(d.amount || 0, (pc.amount || 0) - spent));
    if (amt <= 0) continue;
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
  const pool = (pc.candidates || [])
    .map((c) => ({ c, p: creaturePower(findPermanent(state, c.id)?.permanent, state) || 0 }))
    .sort((a, b) => b.p - a.p || (a.c.id < b.c.id ? -1 : 1));
  if (pool.length === 0 || amount <= 0) return [];
  const n = Math.max(1, Math.min(pc.maxTargets || amount, pool.length, amount));
  const dist = pool.slice(0, n).map(({ c }) => ({ id: c.id, type: "creature", amount: 0 }));
  for (let i = 0; i < amount; i++) dist[i % n].amount += 1;    // 1 at a time — the total is exactly `amount`
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
  let spent = 0;
  for (const d of distribution || []) {
    if (!validIds.has(d.id) || spent >= (pc.amount || 0)) continue;
    const amt = Math.max(0, Math.min(d.amount || 0, (pc.amount || 0) - spent));
    if (amt <= 0) continue;
    next = resolveAtom(next, { op: "add-counter", counterType: pc.counterType || "+1/+1", amount: amt }, { controller: pc.controller, targets: [{ type: "creature", id: d.id }] });
    spent += amt;
  }
  next = logEvent(next, { kind: "spell-effect", effect: "distribute-counters", controller: pc.controller, amount: pc.amount, spent });
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
    const inHand = cardId && (next.players[discarder].hand || []).some((c) => c.id === cardId);
    if (inHand) {
      next = moveCardToZone(next, { playerId: discarder, fromZone: "hand", toZone: "graveyard", cardId });
    }
    next = logEvent(next, { kind: "spell-effect", effect: "discard", controller: discarder, discarded: inHand ? 1 : 0 });
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
 * Settle a scry/surveil choice (CR 701.22 / 701.25): apply the reorder — `keepIdsOrdered` stay on
 * top in that order, the rest of the looked-at cards go to the bottom (scry) / graveyard (surveil)
 * — then RESUME the suspended program. A null/empty keep list moves everything away; an omitted
 * decision (the auto-keep-all default is supplied by the driver) keeps all on top. Hidden-info safe.
 */
export function resolveScryChoice(state, keepIdsOrdered) {
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
  const keep = (keepIdsOrdered || []).filter((id) => valid.has(id) && !seen.has(id) && seen.add(id));
  next = applyScrySurveil(next, { playerId: pc.controller, n: (pc.cards || []).length, keepIdsOrdered: keep, mode: pc.mode });
  next = logEvent(next, { kind: "spell-effect", effect: pc.mode, controller: pc.controller, looked: (pc.cards || []).length, moved: (pc.cards || []).length - keep.length });
  return resumeAfterChoice(next, pc);
}

/**
 * Settle an optional-effect choice ("you may <effect>", α2): if `doIt`, run the atom that paused
 * (with its `optional` flag stripped so it can't re-suspend), then resume the rest; if not, skip it
 * and resume. Mirrors the tutor/scry settle. Eliminated-controller guard (the pause can outlive the
 * SBA that removes the controller). The taken/declined outcome is logged either way.
 */
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
  } else {
    next = counterSpellById(next, pc.spellId, { via: "soft-counter" });
  }
  return resumeAfterChoice(next, pc);
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
  if (cost?.kind !== "mana") return false; // only the modeled mana form pays
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
  if (pay && pc.cost?.kind === "mana") {
    const r = payManaCost(next, pc.controller, pc.cost.mana || {});
    next = r.state;
    paid = r.paid;
  }
  next = logEvent(next, { kind: "spell-effect", effect: "optional-mana-payment", controller: pc.controller, paid, sourceName: pc.sourceName || null });
  if (paid) {
    // Run the payoff atoms in printed order. Each is HIGH + targetless (parser-validated), so an empty
    // targets list is correct; thread the resume's context/sourceId so a context-dependent payoff resolves.
    const r = pc.resume || {};
    const atoms = pc.effectAtoms || [];
    for (let i = 0; i < atoms.length; i++) {
      const ctx = { ...(r.context || {}), controller: pc.controller, targets: [], cardName: r.cardName ?? pc.sourceName ?? null, xValue: r.xValue ?? null, sourceId: r.sourceId ?? null };
      const after = resolveAtom(next, atoms[i], ctx);
      if (after == null) {
        return markPendingArbiter(next, { source: { name: pc.sourceName }, payload: { params: r } }, `optional-mana-payment payoff atom "${atoms[i]?.op}" had no resolver`);
      }
      next = after;
      // A payoff atom set a resolution-time choice (scry/surveil) — chain its resume onto the program's, so
      // the choice settles into the PROGRAM continuation (nextAtomIndex). That chain is only correct for the
      // LAST payoff atom: a mid-payoff pause would drop atoms i+1.. (the chained resume skips the payoff tail).
      if (next.pendingChoice && !next.pendingChoice.resume) {
        // WI-3 belt-and-braces: the parser gate (PAUSING_ATOM_OPS in matchOptionalManaPayment) makes a
        // NON-LAST pausing payoff unreachable for native programs — if one pauses anyway, NEVER drop the
        // remaining payoff atoms. Clear the inner choice and route to the Arbiter with an honest reason
        // (CREED-safe FN: the card is handed off rather than half-resolved).
        if (i < atoms.length - 1) {
          return markPendingArbiter(
            clearPendingChoice(next),
            { source: { name: pc.sourceName }, payload: { params: r } },
            `optional-mana-payment payoff atom "${atoms[i]?.op}" paused mid-payoff — resuming would drop ${atoms.length - 1 - i} remaining payoff atom(s)`,
          );
        }
        return { ...next, pendingChoice: { ...next.pendingChoice, resume: pc.resume } };
      }
    }
  }
  return resumeAfterChoice(next, pc);
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
      const ctx = { ...(r.context || {}), controller: pc.controller, targets: [], cardName: r.cardName ?? pc.sourceName ?? null, xValue: r.xValue ?? null, sourceId: r.sourceId ?? null };
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
      const ctx = { ...(r.context || {}), controller: pc.controller, targets: [], cardName: r.cardName ?? pc.sourceName ?? null, xValue: r.xValue ?? null, sourceId: r.sourceId ?? null };
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
  const canPay = !!doDiscard && (next.players[pc.controller].hand || []).some((c) => !c.token);
  next = logEvent(next, { kind: "spell-effect", effect: "optional-discard-payment", controller: pc.controller, discarded: canPay, sourceName: pc.sourceName || null });
  if (canPay) {
    const r = pc.resume || {};
    // [cost-discard, ...payoff] as ONE program: the discard pauses (which-card), the payoff runs on resume. The
    // discard atom is the canonical controller-discard shape (hand.js discardClauseParser). Availability was gated
    // above, so the discard ALWAYS pitches exactly one card → the payoff runs iff (and only iff) the cost was paid.
    const program = { atoms: [{ op: "discard", amount: 1, who: "controller", targetType: null }, ...(pc.effectAtoms || [])] };
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
 * ===== OPPONENT-PAYS-TO-DENY (taxed-payment, CR 603.7c) ===== — settle "you may draw a card unless that player pays
 * {N}" (Rhystic Study). If `pay` AND the PAYER (the opponent who cast — pc.payer, bound at fire time) can afford it,
 * charge the payer's mana (payManaCost) and the beneficiary draws NOTHING; else (declined or unaffordable — payManaCost
 * fabricates no mana, CR 119) the BENEFICIARY (the trigger's controller — pc.beneficiary) draws ONE card. Then RESUME
 * the trigger's program. Eliminated-seat guards on BOTH payer and beneficiary (either can leave mid-pause, CR 800.4a).
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
  next = logEvent(next, { kind: "spell-effect", effect: "taxed-payment", payer: pc.payer, beneficiary: pc.beneficiary, paid, sourceName: pc.sourceName || null });
  if (!paid && next.players?.[pc.beneficiary]) {
    next = drawCards(next, { playerId: pc.beneficiary, count: 1 }); // payer declined / couldn't pay → beneficiary draws
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
  return finishSpellResolution(state, pc?.resume?.spellToGraveyard);
}
