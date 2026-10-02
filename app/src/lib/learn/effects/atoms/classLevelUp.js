/**
 * effects/atoms/classLevelUp.js — the class level bar's ACTIVATED half (CR 716.2a, restated as 107.16a):
 * "[Cost]: This Class's level becomes N. Activate only if this Class is level N-1 and only as a sorcery."
 *
 * effects/abilities.js rewrites each printed bar ("{2}{U}: Level 2") into that rules text and parses it through the
 * ordinary activated-ability loop, so the cost, the stack and the payment are the same as any printed ability (the
 * leveler lane's precedent). Of the two activation restrictions, "only as a sorcery" is part of the rewritten text (the
 * loop's own timing rider → `sorceryOnly`), and "only if this Class is level N-1" — a property of the permanent — is
 * stamped as `classLevelUp: N` for the offer gate (legalChoices). This module owns the EFFECT: the clause parser for
 * the rewritten sentence and its resolver.
 *
 * Resolution sets the SOURCE permanent's level designation (perm.classLevel, CR 716.2b) and, when the level actually
 * changed, fires its "When this Class becomes level N" triggers (triggers.checkClassLevelTriggers, CR 603.2e). A source
 * that left the battlefield is gone — a Class that comes back is a new object (CR 400.7) — so the ability does nothing.
 */

import { logEvent, findPermanent, updatePermanentSafe } from "../../gameState.js";
import { checkClassLevelTriggers } from "../../triggers.js";
import { classLevelOf } from "../../classLevels.js";

// Whole-clause anchored on the CR 716.2a wording the abilities lane writes; no printed card carries this sentence.
const CLASS_LEVEL_BECOMES_RE = /^this class's level becomes (\d+)$/;

/** Clause parser (registered in parser.js): "This Class's level becomes N." → { op: "class-level-become", level }. */
export function classLevelBecomeClauseParser(clause) {
  const t = String(clause || "").trim().toLowerCase().replace(/[’]/g, "'").replace(/\.$/, "").trim();
  const m = t.match(CLASS_LEVEL_BECOMES_RE);
  if (!m) return null;
  return { op: "class-level-become", level: parseInt(m[1], 10), targetType: null };
}

/**
 * CR 716.2a — the source's level becomes N; a real change fires its becomes-level-N triggers. A level that is ALREADY
 * N (a copy of the ability resolving after the original — Peter Parker's Camera) is no event: "becomes" triggers only
 * on the change (CR 603.2e). A source that left the battlefield is gone; the returned card is a new object (CR 400.7).
 */
export function applyClassLevelBecome(state, atom, ctx) {
  const lk = findPermanent(state, ctx.sourceId);
  if (!lk) return logEvent(state, { kind: "spell-effect", effect: "class-level", level: null, targets: [] });
  const from = classLevelOf(lk.permanent);
  const to = atom.level;
  if (from === to) return logEvent(state, { kind: "spell-effect", effect: "class-level", level: to, targets: [ctx.sourceId] });
  const next = updatePermanentSafe(state, ctx.sourceId, (p) => ({ ...p, classLevel: to }));
  return logEvent(checkClassLevelTriggers(next, { ...lk.permanent, classLevel: to }, to),
    { kind: "spell-effect", effect: "class-level", from, level: to, targets: [ctx.sourceId] });
}

export const classLevelUpResolvers = {
  "class-level-become": applyClassLevelBecome,
};
