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
import { clearPendingChoice } from "../pendingChoice.js";
import { moveCardToZone, logEvent, applyScrySurveil, applyImpulseDig, findPermanent } from "../gameState.js";
import { resolveAtom, shuffleControllerLibrary, tutorManaValue, sacrificeCreatureEffect } from "./effectAtoms.js";
import { programConfidence } from "./parser.js";

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

/** The atoms a program runs (the chosen modal mode, or the sequence). */
function programAtoms(program, chosenMode) {
  return program.structure === "modal"
    ? (program.modal?.modes?.[chosenMode]?.atoms || [])
    : program.atoms;
}

export function runEffectProgram(state, stackObject, { startIndex = 0 } = {}) {
  const params = stackObject?.payload?.params || {};
  const { program, controller, targets = [], xValue = null, sourceId = null } = params;

  // Low confidence (or absent program) → ZERO atoms, route to the Arbiter seam.
  if (programConfidence(program) === "low") {
    return markPendingArbiter(state, stackObject, "effect-program (low confidence — unmodeled effect)");
  }

  const atoms = programAtoms(program, params.chosenMode);

  let next = state;
  const cardName = stackObject?.source?.name || null;
  for (let i = startIndex; i < atoms.length; i++) {
    const atom = atoms[i];
    // α2 — an OPTIONAL atom ("you may <effect>"): suspend so the controller decides whether to take
    // it (a real player yes/no, or AI/Expert auto-decide). resolveOptionalChoice runs-or-skips this
    // atom then resumes. Mirror the tutor/scry pause — plain JSON, serialize-safe; never resolve a
    // "may" as mandatory (that would be a forbidden mis-apply).
    if (atom.optional) {
      return {
        ...next,
        pendingChoice: {
          kind: "optional-effect", controller, atomIndex: i, effectOp: atom.op, cardName,
          resume: { program, controller, targets, xValue, sourceId, chosenMode: params.chosenMode ?? null, nextAtomIndex: i, cardName },
        },
      };
    }
    const ctx = { controller, targets: targetsForAtom(targets, i), cardName, xValue, sourceId };
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
          resume: { program, controller, targets, xValue, sourceId, chosenMode: params.chosenMode ?? null, nextAtomIndex: i + 1, cardName },
        },
      };
    }
  }
  return next;
}

/**
 * Deterministically auto-pick a tutor candidate (Expert autopilot / an opponent — no
 * picker shown): the highest-mana-value match, locale-free codepoint tie-break by name
 * then id (serialize-stable). Returns the chosen card id, or null when there's no
 * candidate (a search that finds nothing, CR 701.19f).
 */
export function autoPickTutorCandidate(state, pendingChoice) {
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
 * Settle a pending tutor choice: move the chosen card library→hand (or find nothing if
 * `cardId` is null), shuffle (CR 701.19e, threaded deterministic seed), clear the choice,
 * then RESUME the suspended program from where it paused. Hidden-info safe — the log
 * records the controller + found-ness, never the fetched card's name.
 */
export function resolveTutorChoice(state, cardId) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "tutor-search") return state;
  let next = clearPendingChoice(state);

  // Apply the fetch (cardId null = the player chose to find nothing, or no candidate).
  const inLibrary = cardId && (next.players?.[pc.controller]?.library || []).some((c) => c.id === cardId);
  if (inLibrary) {
    next = moveCardToZone(next, { playerId: pc.controller, fromZone: "library", toZone: "hand", cardId });
  }
  next = shuffleControllerLibrary(next, pc.controller);
  next = logEvent(next, { kind: "spell-effect", effect: "tutor", controller: pc.controller, found: !!inLibrary, destination: "hand" });

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
 * Settle a pending sacrifice choice (edicts — Diabolic Edict / Cruel Edict / Geth's Verdict): sacrifice
 * the chosen creature from the SACRIFICER's battlefield (pc.controller) → their graveyard, firing dies
 * triggers via the shared helper, then RESUME the CASTER's program (a rider like Geth's Verdict "You lose
 * 1 life", which is the CASTER's, not the sacrificer's). A `permId` not among the offered candidates / no
 * longer on the battlefield (stale) is a logged no-op (the edict still resolved). Two eliminated-player
 * guards (the pause can outlive an SBA, CR 800.4a): a removed SACRIFICER skips the sac but still resumes
 * the caster's riders; a removed CASTER skips the resume. Hidden-info safe (the sacrificer's own board).
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
    // stale-permId case, then still resume the CASTER's riders below (the rider is theirs, not the victim's).
    next = logEvent(next, { kind: "spell-effect", effect: "sacrifice", controller: pc.controller, sacrificed: null });
  }
  const casterId = pc.resume?.controller;
  if (casterId && !next.players?.[casterId]) return next; // caster eliminated mid-pause → no resume
  return resumeAfterChoice(next, pc);
}

/**
 * Settle a scry/surveil choice (CR 701.18 / 701.43): apply the reorder — `keepIdsOrdered` stay on
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
    const ctx = { controller: r.controller, targets: targetsForAtom(r.targets, i), cardName: r.cardName, xValue: r.xValue, sourceId: r.sourceId };
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
 * Resume a suspended effect program after a resolution-time choice settled (shared by the tutor +
 * scry/surveil + optional paths): re-enter the program at the recorded `nextAtomIndex` so the atoms
 * AFTER the choice run (e.g. the "draw a card" in "Scry 1, then draw a card").
 */
function resumeAfterChoice(state, pc) {
  const r = pc.resume;
  if (r?.program && Array.isArray(programAtoms(r.program, r.chosenMode)) && r.nextAtomIndex < programAtoms(r.program, r.chosenMode).length) {
    const obj = {
      source: { name: r.cardName ?? pc.sourceName ?? null },
      payload: { params: { program: r.program, controller: r.controller, targets: r.targets, xValue: r.xValue, sourceId: r.sourceId, chosenMode: r.chosenMode } },
    };
    return runEffectProgram(state, obj, { startIndex: r.nextAtomIndex });
  }
  return state;
}
