/**
 * triggerRouting.js — the SINGLE source of truth for "does ONE detected trigger route natively?".
 *
 * Extracted from coverage.js so BOTH the coverage classifier (the metric) AND the runtime
 * group-triggered-grant validator (registered on the trigger-firing path via gameEngine.js) consult the
 * EXACT same routing gate — a copy in either place would risk drift, and a mis-classified trigger is a CREED
 * false positive. A leaf relative to the trigger system: it imports only the effect-program parser
 * (effects/parser.js) + the two strict condition vocabularies (interveningIf.js, winGame.js), NONE of which
 * import coverage.js, so this module can be imported by coverage.js AND by gameEngine.js without a cycle.
 *
 * `triggerRoutesNatively(d)` mirrors gameEngine.buildTriggerStack's α1 ALLOWLIST EXACTLY (see the inline
 * notes) — a HIGH, non-modal, target-resolvable program, with the intervening-if (CR 603.4) and upkeep-win
 * (Wave 3b) carve-outs. Pure.
 */

import { parseEffectClause, programConfidence, programNeedsChosenTarget, programTriggerTargetsResolvable } from "./effects/parser.js";
import { winConditionParseable } from "./effects/atoms/winGame.js";
import { interveningIfParseable } from "./interveningIf.js";
import { detectTriggers } from "./triggers.js";

/**
 * Does ONE detected trigger route natively through the flush stage? HIGH, non-modal,
 * non-intervening-if EffectProgram — the exact gate `gameEngine.buildTriggerStack` uses.
 * The single source of truth for `permanentTriggersCovered`, the composite classifier, AND the
 * runtime group-triggered-grant validator, so the trigger-routing rule can't drift between them.
 */
export function triggerRoutesNatively(d) {
  if (!d.effectClause) return false;
  if (d.interveningIf) {
    const cp = parseEffectClause(d.effectClause, "Instant");
    const a = cp?.atoms?.length === 1 ? cp.atoms[0] : null;
    // UPKEEP-WIN (Wave 3b, CR 603.4) — a single win-game atom ("you win the game") whose threshold is in
    // the strict win evaluator's vocabulary (Revel in Riches / Felidar Sovereign / Knuckles). A win is
    // modeled exactly (never fail-open) — see winGame.evaluateWinThreshold.
    if (a && a.op === "win-game" && a.who === "controller"
      && programConfidence(cp) === "high" && winConditionParseable(d.interveningIf)) return true;
    // INTERVENING-IF (CR 603.4) — a GENERAL conditional trigger routes natively when (a) its effect program
    // is HIGH + non-modal + target-resolvable (the same α1 allowlist the non-conditional path uses) AND
    // (b) its condition is in the strict board-query vocabulary (interveningIfParseable). gameEngine.
    // buildTriggerStack evaluates the condition at flush (drop if false) and resolvers re-check at
    // resolution (CR 603.4 second check), so the metric mirrors a routing the runtime actually performs.
    // An unparseable condition stays body-only (false-negative SAFE — a mis-evaluated condition is an FP).
    return !!cp && programConfidence(cp) === "high" && cp.structure !== "modal"
      && (!programNeedsChosenTarget(cp) || programTriggerTargetsResolvable(cp))
      && interveningIfParseable(d.interveningIf);
  }
  const p = parseEffectClause(d.effectClause, "Instant");
  // Mirror buildTriggerStack's α1 ALLOWLIST EXACTLY: a HIGH non-modal trigger routes natively only
  // when every chosen-target atom is intent-resolvable (the enemy/own chooser can place it on a
  // correct side). An AMBIGUOUS targeting atom (bounce) stays in the gap, not native — so the metric
  // never claims a routing the runtime won't perform.
  return !!p && programConfidence(p) === "high" && p.structure !== "modal"
    && (!programNeedsChosenTarget(p) || programTriggerTargetsResolvable(p));
}

/**
 * GROUP-TRIGGERED grant body validator (Tempered Sliver). A quoted group-grant body ("Whenever this creature
 * deals combat damage to a player, put a +1/+1 counter on it.") is a FULLY-MODELED triggered grant iff it
 * parses to one-or-more triggers (the SAME detectTriggers a printed trigger uses) that ALL route natively
 * (triggerRoutesNatively above — the same gate the Aura/Equipment granted-triggered classifier uses). This is
 * the function registered into staticAbilityParser's group-triggered emission gate by BOTH coverage.js (the
 * classification path) and gameEngine.js (the runtime trigger-firing path) — a single shared definition so the
 * metric and the runtime can't drift. Pure.
 */
export function isModeledGroupTriggeredBody(quoted) {
  const dets = detectTriggers({ name: "GroupGranted", type: "Creature", oracle: String(quoted || "") });
  return dets.length > 0 && dets.every(triggerRoutesNatively);
}
