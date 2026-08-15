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
import { logEvent, findPermanent, getCounter } from "../../gameState.js";
import { setPendingDistributeChoice } from "../../pendingChoice.js";
import { isCreatureCard } from "./shared.js";

export function applyDistributeCounters(state, atom, ctx) {
  // MILLED-COUNT (The Wise Mothman, SHELF M1c): countContext reads a TRIGGER-context magnitude
  // (ctx.nonlandMilledCount, threaded by checkMilledTriggers). Absent → 0 → a clean logged no-op,
  // never a fabricated count. A fixed distribution (Earth Crystal family) is unchanged.
  const amount = atom.countContext ? Math.max(0, ctx[atom.countContext] || 0) : (atom.amount || 0);
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
  // perTargetCap (Mothman — "a +1/+1 counter on EACH of up to X target creatures"): each chosen target gets
  // EXACTLY that many (1), so with fewer creatures than X the surplus is simply not placed (the "up to" —
  // a clean under-spend, never a stacked fabrication). maxTargets defaults to the amount for the capped form.
  return setPendingDistributeChoice(state, { controller: ctx.controller, amount, counterType, maxTargets: atom.maxTargets ?? (atom.perTargetCap ? amount : null), perTargetCap: atom.perTargetCap ?? null, candidates, sourceName: ctx.cardName });
}

/**
 * MOVE-COUNTERS-FROM-SELF (Forgotten Ancient, SHELF-TAIL W1 — CR 122.5): "you may move any number of +1/+1
 * counters from this creature onto other creatures." A move = remove from the source + put on the recipient
 * (CR 122.5 — both halves must happen); modeled as the SAME distribute-counters pause with two extensions
 * carried on the pendingChoice: `moveFromId` (resolveDistributeChoice removes the spent total from the source
 * after placing — placement still routes through add-counter so recipient-side doublers compose, CR 616/121.5,
 * while the REMOVED side is the literal chosen count, never the doubled one) and `anyNumber` (the printed "any
 * number" makes ZERO a legal choice — the settler's full-assignment rule is waived, which is also how the
 * trigger's "you may" is realized: declining = moving nothing, the free-cast convention, so the atom stays
 * UN-optional and never double-prompts).
 *
 * CREED / FP guards: amount is the source's LIVE +1/+1 pile at resolution (getCounter — never a cached count);
 * source absent (left the battlefield before resolution, CR 608.2b) or an empty pile → a logged no-op, no
 * pause. Candidates are every OTHER creature on EVERY battlefield (the printed "other creatures" has no
 * controller restriction), each stamped with its REAL controller so the AI policy can stay own-side. "+1/+1"
 * only + "this creature" only (whole-clause anchored) — any other counter kind / referent leaves residue →
 * null → LOW → Arbiter.
 */
export function applyMoveCountersFromSelf(state, atom, ctx) {
  const src = ctx?.sourceId ? findPermanent(state, ctx.sourceId) : null;
  if (!src) return logEvent(state, { kind: "spell-effect", effect: "move-counters-from-self", controller: ctx.controller, moved: 0, reason: "source-gone" });
  const amount = getCounter(state, src.permanent.id, "+1/+1");
  if (amount <= 0) return logEvent(state, { kind: "spell-effect", effect: "move-counters-from-self", controller: ctx.controller, moved: 0, reason: "no-counters" });
  const candidates = [];
  for (const [pid, player] of Object.entries(state.players || {})) {
    for (const perm of player.battlefield || []) {
      if (perm.id !== src.permanent.id && isCreatureCard(perm.card)) candidates.push({ id: perm.id, name: perm.card?.name, type: "creature", controller: pid });
    }
  }
  if (candidates.length === 0) return logEvent(state, { kind: "spell-effect", effect: "move-counters-from-self", controller: ctx.controller, moved: 0, reason: "no-other-creatures" });
  return setPendingDistributeChoice(state, { controller: ctx.controller, amount, counterType: "+1/+1", maxTargets: null, perTargetCap: null, candidates, sourceName: ctx.cardName, moveFromId: src.permanent.id, anyNumber: true });
}

const DISTRIBUTE_SMALL_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

export function distributeCountersClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'").replace(/\.$/, "");
  const m = t.match(/^distribute (a|an|one|two|three|four|five|\d+) \+1\/\+1 counters? among (one or two|one, two, or three) target creatures you control$/);
  if (m) {
    const amount = DISTRIBUTE_SMALL_NUM[m[1]] ?? parseInt(m[1], 10);
    const maxTargets = m[2] === "one or two" ? 2 : 3;
    if (!amount || amount > maxTargets) return null;               // over-targeting / unparsed N → LOW (mirror divide-bounded)
    return { op: "distribute-counters", counterType: "+1/+1", amount, maxTargets, group: "creaturesYouControl" };
  }
  // MILLED "each of up to X" (The Wise Mothman, SHELF M1c) — "put a +1/+1 counter on each of up to X target
  // creatures, where X is the number of nonland cards milled this way": a milled-trigger payoff whose target
  // COUNT is the event magnitude and each chosen creature gets exactly ONE counter. Routed through the same
  // distribute-counters pause (perTargetCap:1) so the human picker and the auto path share one seam. The
  // countContext referent is gated to the MILLED event on BOTH paths (triggerRouting for triggers; the
  // coverage spell guards park any spell carrying this wording — ctx would be absent → dropped clause).
  const mm = t.match(/^put a \+1\/\+1 counter on each of up to x target creatures, where x is the number of nonland cards milled this way$/);
  if (mm) return { op: "distribute-counters", counterType: "+1/+1", countContext: "nonlandMilledCount", perTargetCap: 1, group: "creatures" };
  // MOVE-FROM-SELF (Forgotten Ancient, W1 — CR 122.5): the clause reaching here is the α2-peeled inner of
  // "you may move any number of …" (the atom stays un-optional — see applyMoveCountersFromSelf's header).
  // "this creature" is a permanent-ability-only referent (an instant/sorcery body never prints it), so the
  // ctx.sourceId read follows the REMOVE-NAMED-COUNTER-SELF precedent: absent source → logged no-op, FN-safe.
  if (/^move any number of \+1\/\+1 counters from this creature onto other creatures$/.test(t)) {
    return { op: "move-counters-from-self", counterType: "+1/+1", anyNumber: true };
  }
  return null;
}

export const distributeCountersResolvers = { "distribute-counters": applyDistributeCounters, "move-counters-from-self": applyMoveCountersFromSelf };
