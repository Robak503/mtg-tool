/**
 * effects/atoms/suspect.js — SUSPECT (BLITZ EK-1, CR 701.60): "suspect a creature" marks it with the
 * SUSPECTED designation — "A suspected permanent has menace and 'This creature can't block' for as
 * long as it's suspected" (CR 701.60c). The Murders-at-Karlov-Manor family (Frantic Scapegoat,
 * Person of Interest, Absolving Lammasu, Rune-Brand Juggler's chosen-target form).
 *
 * STATE: a plain serializable boolean flag `suspected` on the permanent. It is NOT an ability and
 * not copiable (CR 701.60b — a flag, not oracle text, is exactly right), lives only while the
 * permanent is on the battlefield (the flag dies with the permanent object — CR 701.60a "until it
 * leaves the battlefield"), and re-suspecting is a no-op (CR 701.60d "can't become suspected again").
 *
 * ENFORCEMENT — through the REAL reads, not a parallel path (the CREED requirement):
 *   - MENACE: layers.permanentHasKeyword seeds menace for a suspected permanent (the keyword-counter
 *     pattern), so attackerHasMenace (the declare-blockers offer gate AND combat resolution's
 *     ≥2-blocker rule) and every other layer-aware menace read see it; a later "loses menace"
 *     layer-6 removeKeyword still wins (last-wins, like a keyword counter).
 *   - CAN'T BLOCK: the same seed on the "cantBlock" pseudo-keyword — the EXACT read
 *     combatEvasion.canBlockAttacker already performs for granted "can't block this turn" effects —
 *     so a suspected creature is never offered as a blocker (legalChoices) and never accepted as one.
 *
 * Only a CREATURE becomes suspected (CR 701.60a — "suspect a creature"); a non-creature referent is
 * a clean no-op, never a fabricated designation.
 */

import { findPermanent, updatePermanentSafe, logEvent } from "../../gameState.js";
import { atomTargets, isCreatureCard } from "./shared.js";

export function applySuspect(state, atom, ctx) {
  let next = state;
  // Self / thatCreature / chosen-target dispatch through the shared resolver ("up to one" forms
  // arrive as a possibly-empty ctx.targets subset — an empty pick is a clean no-op, CR 601.2c).
  const targets = atomTargets(state, atom, ctx);
  for (const t of targets) {
    const lk = findPermanent(next, t.id);
    if (!lk || !isCreatureCard(lk.permanent.card)) continue; // only creatures are suspected (CR 701.60a)
    if (lk.permanent.suspected) continue;                    // can't become suspected again (CR 701.60d)
    next = updatePermanentSafe(next, t.id, (p) => ({ ...p, suspected: true }));
    next = logEvent(next, { kind: "spell-effect", effect: "suspect", permanentId: t.id, name: lk.permanent.card?.name || null, controller: ctx.controller });
  }
  return next;
}

/**
 * UNSUSPECT-ALL (Absolving Lammasu's ETB — "all suspected creatures are no longer suspected", the
 * CR 701.60a "until a spell or ability causes it to no longer be suspected" clearing form). A mass
 * flag clear across EVERY battlefield (all players) — non-targeted, so a trigger routes natively on
 * program confidence alone. A board with no suspected creatures is a clean no-op.
 */
export function applyUnsuspectAll(state, atom, ctx) {
  let next = state;
  for (const pid of Object.keys(next.players || {})) {
    for (const perm of next.players[pid]?.battlefield || []) {
      if (perm.suspected) next = updatePermanentSafe(next, perm.id, (p) => ({ ...p, suspected: false }));
    }
  }
  return logEvent(next, { kind: "spell-effect", effect: "unsuspect-all", controller: ctx.controller });
}

/**
 * SUSPECT clause parser (CR 701.60) — whole-clause `^…$` anchored (CREED fail-closed):
 *   - "suspect this creature"            → the SOURCE (a self ETB trigger, after the detectTriggers
 *     leading-"suspect it" rewrite — Frantic Scapegoat, Barbed Servitor, Person of Interest).
 *   - "suspect target creature …" forms  → chosen targets, with the side-provable pools the trigger
 *     flush intent model can place: "you control" (own — Rune-Brand Juggler), "an opponent controls"
 *     (enemy — Hot Pursuit's clause, Absolving Lammasu's dies rider). The BARE "[up to one] target
 *     creature" (J. Jonah Jameson, Reasonable Doubt, Nelly Borca) parses too — on a SPELL the caster
 *     picks interactively; on a TRIGGER the ambiguous side routes it to the Arbiter (atomTargetIntent
 *     — a safe FN, never a blind mis-target).
 *   - "up to one" variants               → maxTargets:1 + minTargets:0 (the standard subset shape;
 *     choosing zero is legal, CR 601.2c). "other" adds excludeSource (CR 109.5 — Clandestine Meddler).
 *   - "all suspected creatures are no longer suspected" → the mass clear (Absolving Lammasu).
 * DELIBERATELY unmatched → LOW → Arbiter (safe FNs): "suspect that creature" (Snarlfang Vermin's
 * perpetual/combat form), "suspect one of the other creatures" (Frantic Scapegoat's chooser),
 * conditional "If it's suspected …" branches (Agrus Kos, Repeat Offender), enchanted-creature and
 * token anaphors ("… and suspect it" — Case of the Stashed Skeleton's token referent), and every
 * spell-side "Suspect it." anaphor (Caught Red-Handed, It Doesn't Add Up).
 */
export function suspectClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  if (/^suspect this creature$/.test(t)) return { op: "suspect", target: "self", targetType: null };
  if (/^suspect the triggering creature$/.test(t)) return { op: "suspect", target: "thatCreature", targetType: null };
  if (/^suspect target creature$/.test(t)) return { op: "suspect", targetType: "creature" };
  if (/^suspect target creature you control$/.test(t)) return { op: "suspect", targetType: "creatureYouControl" };
  if (/^suspect target creature an opponent controls$/.test(t)) return { op: "suspect", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }] };
  if (/^suspect up to one target creature$/.test(t)) return { op: "suspect", targetType: "creature", maxTargets: 1, minTargets: 0 };
  if (/^suspect up to one target creature you control$/.test(t)) return { op: "suspect", targetType: "creatureYouControl", maxTargets: 1, minTargets: 0 };
  if (/^suspect up to one other target creature you control$/.test(t)) return { op: "suspect", targetType: "creatureYouControl", maxTargets: 1, minTargets: 0, excludeSource: true };
  if (/^suspect up to one target creature an opponent controls$/.test(t)) return { op: "suspect", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }], maxTargets: 1, minTargets: 0 };
  if (/^all suspected creatures are no longer suspected$/.test(t)) return { op: "unsuspect-all" };
  return null;
}

export const suspectResolvers = {
  "suspect": applySuspect,           // SUSPECT (CR 701.60a) — mark the creature suspected (menace + can't block via the layer reads)
  "unsuspect-all": applyUnsuspectAll, // CR 701.60a clearing form — "all suspected creatures are no longer suspected"
};
