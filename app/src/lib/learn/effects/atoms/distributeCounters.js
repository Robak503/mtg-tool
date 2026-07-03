/**
 * effects/atoms/distributeCounters.js — DISTRIBUTE-COUNTERS (mirrors misc.js's DIVIDE-DAMAGE, MT-1).
 *
 * "Distribute N +1/+1 counters among one or two / one, two, or three target creatures you control"
 * (The Earth Crystal's activated ability; Elven Rite; Armament Corps family). The division is a
 * resolution-time choice, exactly like divide-damage: gather the controller's own creatures as
 * candidates and PAUSE on `state.pendingChoice` (setPendingDistributeChoice); resolveDistributeChoice
 * (runProgram) applies the per-target counters via the ALREADY-REGISTERED add-counter atom, so every
 * placement routes through addCounter's central doubler hook (CR 616) — The Earth Crystal's own +1/+1
 * doubler composes for free. Non-targeted at cast/activation (no `targetType` → no ctx.targets consumed;
 * `programNeedsChosenTarget` is false), so no cartesian target-expansion at the cast layer.
 *
 * CREED / FP guards (see distributeCounters.test.js): ONLY the "+1/+1" kind (the only counter whose P/T is
 * fully layer-enforced), ONLY "target creatures you control" (own-side; a bare "target creatures" or a
 * non-targeted "creatures you control" is a wider/different recipient), ONLY the bounded "one or two" /
 * "one, two, or three" count-target shapes (an "any number of" / "up to N" / an {X}-amount is a distinct
 * fast-follow), amount ≤ maxTargets (never emit an over-targeting distribution — the divide-damage guard),
 * and a whole-clause `^…$` anchor so any rider leaves residue → null → LOW → Arbiter. Pure leaf (no
 * parser.js import — cycle-safe).
 */
import { logEvent } from "../../gameState.js";
import { setPendingDistributeChoice } from "../../pendingChoice.js";
import { isCreatureCard } from "./shared.js";

export function applyDistributeCounters(state, atom, ctx) {
  const amount = atom.amount || 0;
  const counterType = atom.counterType || "+1/+1";
  if (amount <= 0) return logEvent(state, { kind: "spell-effect", effect: "distribute-counters", controller: ctx.controller, amount: 0 });
  const candidates = [];
  const player = state.players?.[ctx.controller];
  if (player) {
    for (const perm of player.battlefield) {
      if (isCreatureCard(perm.card)) candidates.push({ id: perm.id, name: perm.card?.name, type: "creature", controller: ctx.controller });
    }
  }
  if (candidates.length === 0) return logEvent(state, { kind: "spell-effect", effect: "distribute-counters", controller: ctx.controller, amount, candidates: 0 });
  return setPendingDistributeChoice(state, { controller: ctx.controller, amount, counterType, maxTargets: atom.maxTargets ?? null, candidates, sourceName: ctx.cardName });
}

const DISTRIBUTE_SMALL_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

export function distributeCountersClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'").replace(/\.$/, "");
  const m = t.match(/^distribute (a|an|one|two|three|four|five|\d+) \+1\/\+1 counters? among (one or two|one, two, or three) target creatures you control$/);
  if (!m) return null;
  const amount = DISTRIBUTE_SMALL_NUM[m[1]] ?? parseInt(m[1], 10);
  const maxTargets = m[2] === "one or two" ? 2 : 3;
  if (!amount || amount > maxTargets) return null;                 // over-targeting / unparsed N → LOW (mirror divide-bounded)
  return { op: "distribute-counters", counterType: "+1/+1", amount, maxTargets, group: "creaturesYouControl" };
}

export const distributeCountersResolvers = { "distribute-counters": applyDistributeCounters };
