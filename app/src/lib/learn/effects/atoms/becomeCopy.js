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

// The target nouns this shape accepts: "[another] target [nonlegendary] [attacking] <creature|permanent|land|artifact>",
// mapped to the engine's targetType vocabulary (nouns the enumerator already offers) PLUS each qualifier as the restriction
// the shared satisfier enforces. ⛔ The qualifiers used to be flattened away (shelf D29 found it): "another target
// nonlegendary attacking creature" read as a bare creature target, so the source itself, a legend and a creature not
// attacking were all offered — illegal targets the printed card forbids. Land / artifact are shelf D29's (Thespian's Stage,
// Mizzium Transreliquat); the qualifiers ride only on the creature / permanent nouns they were printed with.
const TARGET_NOUN_RE = /^(another )?target (nonlegendary )?(attacking )?(creature|permanent|land|artifact)$/;
function parseTargetNoun(noun) {
  // P·26 (Shifting Woodland): "target permanent card in your graveyard" — a CARD, the graveyard target the reanimate family uses
  // (the controller's own graveyard, any permanent card type). applyBecomeCopy copies the card itself.
  if (noun === "target permanent card in your graveyard") return { targetType: "graveyardCard", cardFilter: "permanent" };
  const m = noun.match(TARGET_NOUN_RE);
  if (!m || ((m[2] || m[3]) && m[4] !== "creature")) return null;
  const restrictions = [
    ...(m[1] ? [{ kind: "notSource" }] : []),
    ...(m[2] ? [{ kind: "supertype", value: "legendary", negate: true }] : []),
    ...(m[3] ? [{ kind: "combat", value: "attacking" }] : []),
  ];
  return { targetType: m[4], ...(restrictions.length ? { restrictions } : {}) };
}

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
  // LASTING (shelf D29 — Thespian's Stage, Mizzium Transreliquat): with no "until end of turn" the copy has no stated
  // duration, so it lasts (CR 611.2a) — for as long as the permanent does. The subject may be "this land" / "this artifact".
  const m = t.match(/^(?:you may have )?(?:~|this creature|this land|this artifact|it) becomes? a copy of ([a-z ]+?)( until end of turn)?(?:, except (.+))?$/);
  if (!m) return null;
  const noun = parseTargetNoun(m[1].trim());
  if (!noun) return null; // an unlisted noun → LOW → Arbiter (never a guessed target class)

  // ⛔ ALL-OR-NOTHING RIDERS (CR 707.9a). Every "except …" sub-clause must parse to a modelled atom or the
  // whole clause parks — a copy applied with a rider silently dropped is a body the card never printed.
  let riders = [];
  if (m[3]) {
    for (const s of m[3].split(/,\s*and\s+|,\s+|\s+and\s+/).map((x) => x.trim()).filter(Boolean)) {
      // "EXCEPT IT HAS THIS ABILITY" (shelf D29): the copy keeps the very ability that made it — a marker the resolver fills
      // with the source's printed line. Read HERE, never in the shared clone vocabulary: an entering clone printing it would
      // otherwise parse it as a silent no-op.
      if (/^it has this ability$/.test(s)) { riders.push({ kind: "hasThisAbility" }); continue; }
      const atom = parseCloneRider(s);
      if (!atom) return null;
      riders.push(atom);
    }
  }
  return { op: "become-copy", ...noun, riders, optional: /^you may have\b/.test(t), ...(m[2] ? {} : { lasting: true }) };
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
  const targets = atomTargets(state, atom, ctx) || [];
  // P·26 — a graveyard CARD target (Shifting Woodland) copies the card itself, which must still be in that graveyard as the
  // ability resolves (CR 608.2b). Every other noun is a permanent on the battlefield.
  let copiedFrom;
  if (atom.targetType === "graveyardCard") {
    const card = targets.map((t) => (state.players?.[t?.controller]?.graveyard || []).find((c) => c.id === t?.id)).find(Boolean);
    copiedFrom = card ? { card } : null;
  } else {
    const target = targets.find((t) => t?.id && findPermanent(state, t.id));
    copiedFrom = target ? findPermanent(state, target.id).permanent : null;
  }
  if (!copiedFrom) {
    return logEvent(state, { kind: "spell-effect", effect: "become-copy", copied: 0, reason: "no legal target", controller: ctx.controller });
  }
  // The copying card is the SOURCE's own card — that is what a name rider's `~` resolves against.
  const selfCard = findPermanent(state, sourceId)?.permanent?.card || null;
  // "EXCEPT IT HAS THIS ABILITY" (shelf D29): the ability is the source's printed line that says so — the one resolving now
  // (every carrier prints exactly one). It rides as the same retainOwnAbilities rider Sakashima's "it has ~'s other abilities"
  // uses, so the copy carries it as a printed instance and can copy again. No such line → no copy at all, never a copy that
  // silently lost the ability (CREED).
  let riders = atom.riders || [];
  if (riders.some((r) => r.kind === "hasThisAbility")) {
    const line = String(selfCard?.oracle || selfCard?.oracle_text || "").split("\n").find((l) => /except it has this ability/i.test(l));
    if (!line) return logEvent(state, { kind: "spell-effect", effect: "become-copy", copied: 0, reason: "no printed ability to keep", controller: ctx.controller });
    riders = riders.map((r) => (r.kind === "hasThisAbility" ? { kind: "retainOwnAbilities", oracle: line.trim() } : r));
  }
  const copiableCard = snapshotCopiedCard(copiedFrom, selfCard, riders);
  const { state: s2 } = addContinuousEffect(state, {
    layer: 1,
    op: "copy",
    copiableCard,
    affects: { mode: "self", permanentId: sourceId },
    // LASTING (shelf D29): no stated duration → for as long as the permanent is on the battlefield (CR 611.2a).
    duration: atom.lasting ? { kind: "permanent" } : { kind: "endOfTurn", turn: state.turn },
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
