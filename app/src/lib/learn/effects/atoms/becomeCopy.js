/**
 * effects/atoms/becomeCopy.js — "~ becomes a copy of <target> until end of turn" (CR 613.1a / 707.9).
 *
 * The TEMPORARY twin of the entering clone. An existing permanent's copiable values are replaced for the
 * rest of the turn; every later layer then applies on top of the new base, so counters and anthems ride
 * along (CR 613.1a). 34 corpus cards print this family — Tilonalli's Skinshifter, Impossible Man, Cephalid
 * Facetaker, Hulkling, Vesuvan Drifter, Sarkhan Soul Aflame, Scion of the Ur-Dragon…
 *
 * WHAT THIS MODULE OWNS: the SELF-becomes-a-copy-of-a-CHOSEN-TARGET shape. Everything else in the family is
 * deliberately out of scope and parks:
 *   • a REFERENT source ("a copy of THAT CARD" — Vesuvan Drifter's reveal, Scion's tutored graveyard card;
 *     "a copy of IT" — Sarkhan's triggering Dragon). The binding, not the copy, is the missing piece.
 *   • a non-self SUBJECT (Shuri's "target artifact becomes a copy of a SECOND target artifact"; Naga
 *     Fleshcrafter's "each other creature you control").
 * Both are increment 3; the layer and the riders they need are already here.
 *
 * ⛔ RIDERS REUSE parseCloneRider — the SAME vocabulary the entering clone reads, deliberately. A second
 * rider parser would drift the moment one gained an arm the other lacked, and the "except …" text on these
 * cards is word-for-word the entering-clone text. An unmodelled rider returns null and the whole clause
 * parks (CREED all-or-nothing) — that is what keeps Sarkhan (legendary-in-addition), Hulkling ("this
 * ability") and Cephalid Facetaker (a non-modelled quoted grant) honestly out until their riders are real.
 *
 * Leaf-safe: imports gameState + layers + cloneCopy + shared, never effects/parser.js or the atoms barrel.
 */

import { findPermanent, logEvent } from "../../gameState.js";
import { addContinuousEffect } from "../../layers.js";
import { parseCloneRider, snapshotCopiedCard } from "../../cloneCopy.js";
import { atomTargets } from "./shared.js";

// The target nouns this shape accepts, mapped to the engine's targetType vocabulary. Restricted to nouns the
// enumerator already offers, so a parsed atom can always be given a legal target.
const TARGET_NOUNS = {
  "another target creature": "creature",
  "another target nonlegendary creature": "creature",
  "another target attacking creature": "creature",
  "another target nonlegendary attacking creature": "creature",
  "another target permanent": "permanent",
  "target creature": "creature",
  "target permanent": "permanent",
};

/**
 * PURE clause parser. Anchored ^…$ on the whole clause so a trailing rider outside the "except" tail fails
 * the anchor rather than being silently dropped.
 *
 * The SUBJECT must be the source itself — "~" (the name-elided self), "this creature", or "it". A named
 * non-self subject is a different shape (increment 3) and must not ride this atom, because the effect would
 * then be applied to the wrong permanent.
 */
export function becomeCopyClauseParser(clause) {
  const t = String(clause || "").trim().toLowerCase().replace(/\.$/, "");
  const m = t.match(/^(?:you may have )?(?:~|this creature|it) becomes? a copy of ([a-z ]+?) until end of turn(?:, except (.+))?$/);
  if (!m) return null;
  const targetType = TARGET_NOUNS[m[1].trim()];
  if (!targetType) return null; // an unlisted noun → LOW → Arbiter (never a guessed target class)

  // ⛔ ALL-OR-NOTHING RIDERS (CR 707.9a). Every "except …" sub-clause must parse to a modelled atom or the
  // whole clause parks — a copy applied with a rider silently dropped is a body the card never printed.
  let riders = [];
  if (m[2]) {
    for (const s of m[2].split(/,\s*and\s+|,\s+|\s+and\s+/).map((x) => x.trim()).filter(Boolean)) {
      const atom = parseCloneRider(s);
      if (!atom) return null;
      riders.push(atom);
    }
  }
  return { op: "become-copy", targetType, riders, optional: /^you may have\b/.test(t) };
}

/**
 * applyBecomeCopy — snapshot the chosen target's copiable values (CR 707.2) and store ONE layer-1 continuous
 * effect on the SOURCE permanent for the rest of the turn.
 *
 * The snapshot is taken AT RESOLUTION, so the copy is what the target was then; the target changing or
 * leaving afterwards never mutates the copy (CR 707.2). `snapshotCopiedCard` is the same snapshotter the
 * entering clone uses — the riders are applied by it, so both paths produce byte-identical copies.
 *
 * ⛔ CR 608.2b — a departed target (killed in response) stores NOTHING: a logged fizzle, never a dangling
 * layer-1 effect pointing at a card that is no longer there. Likewise a missing source: the effect would
 * have nothing to apply to.
 */
export function applyBecomeCopy(state, atom, ctx) {
  const sourceId = ctx.sourceId;
  if (!sourceId || !findPermanent(state, sourceId)) {
    return logEvent(state, { kind: "spell-effect", effect: "become-copy", copied: 0, reason: "no source", controller: ctx.controller });
  }
  const target = (atomTargets(state, atom, ctx) || []).find((t) => t?.id && findPermanent(state, t.id));
  if (!target) {
    return logEvent(state, { kind: "spell-effect", effect: "become-copy", copied: 0, reason: "no legal target", controller: ctx.controller });
  }
  const lookup = findPermanent(state, target.id);
  // The copying card is the SOURCE's own card — that is what a name rider's `~` resolves against.
  const selfCard = findPermanent(state, sourceId)?.permanent?.card || null;
  const copiableCard = snapshotCopiedCard(lookup.permanent, selfCard, atom.riders || []);
  const { state: s2 } = addContinuousEffect(state, {
    layer: 1,
    op: "copy",
    copiableCard,
    affects: { mode: "self", permanentId: sourceId },
    duration: { kind: "endOfTurn", turn: state.turn },
    source: { kind: "resolution", permanentId: sourceId, cardName: ctx.cardName || null },
  });
  return logEvent(s2, {
    kind: "spell-effect", effect: "become-copy", copied: 1,
    controller: ctx.controller, cardName: ctx.cardName || null, copiedName: copiableCard?.name || null,
  });
}

export const becomeCopyResolvers = {
  "become-copy": applyBecomeCopy,
};
