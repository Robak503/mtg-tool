/**
 * effects/atoms/control.js — the CONTROL-CHANGE atom (gain-control).
 *
 * ===== GAIN-CONTROL (indefinite) ===== (CR 720 / 800.4a control-change; CR 702.10c summoning-sickness)
 * "Gain control of target <Subtype>. (This effect lasts indefinitely.)" — Sliver Overlord's second activated
 * ability ("Gain control of target Sliver"). A ONE-SHOT, NON-reverting control change: the target permanent is
 * physically moved from its current controller's battlefield array into ctx.controller's battlefield, and its
 * `controller` field is reassigned. Because the printed duration is "indefinitely" (NOT "until end of turn"),
 * there is no revert to schedule and no dependency on the source — the effect keeps going even if the source
 * Overlord later leaves the battlefield (CR: a one-shot control change from a resolved ability is permanent).
 *
 * FAITHFUL WHOLE-EFFECT (no clause dropped, THE CREED):
 *   1. The subtype restriction is ENFORCED at target time — the atom carries targetType:"creature" +
 *      restrictions:[{kind:"subtype", subtype}], so enumerateTargets → creatureSatisfiesRestrictions offers
 *      ONLY a creature of the named subtype (a "target Sliver" ability can never pick a non-Sliver). The
 *      resolver re-reads the LIVE permanent by id, so a target that left the battlefield between announce and
 *      resolution is a clean no-op (CR 608.2b), never a fabricated control grab.
 *   2. SUMMONING SICKNESS (CR 702.10c) — the creature has NOT been under the new controller's control
 *      continuously since their most recent turn began, so it is summoning-sick under its new controller:
 *      `summoningSick:true`. It untaps + loses sickness on the new controller's next untap step (untapAll
 *      clears the flag for the whole battlefield), exactly like a freshly-entered creature — so a stolen
 *      Sliver can't attack / pay a {T} cost the turn it's taken unless it has haste.
 *   3. EVERYTHING ELSE PRESERVED — tapped state, counters, marked damage, and attachments (Auras / Equipment
 *      stay attached; gaining control of a creature does NOT change control of what's attached to it, CR
 *      702.10e). The permanent keeps its identity (same id), so attachments' `attachedTo` back-references stay
 *      valid. The move is a pure array splice (NOT moveCardToZone) precisely because the creature never LEAVES
 *      the battlefield — so no dies/LTB trigger fires and no attachment is detached.
 *
 * A no-op is returned (never a throw) when: the target is already controlled by ctx.controller (redundant
 * grab), the target id can't be found (left the battlefield), or the controller was eliminated
 * mid-resolution (CR 800.4a). Pure data mutation (array moves + a controller-string flip + a boolean) so a
 * game serialized mid-resolution restores byte-identical (no closures).
 */

import { findPermanent, logEvent } from "../../gameState.js";
import { atomTargets } from "./shared.js";
import { TARGET_SUBTYPES } from "../parseHelpers.js"; // curated creature-subtype allowlist (leaf, cycle-free)

/**
 * ===== GAIN-CONTROL clause parser ===== "Gain control of target <Subtype>." / "Gain control of target
 * creature." — an INDEFINITE (non-reverting) control change (Sliver Overlord's "Gain control of target
 * Sliver."). The "(This effect lasts indefinitely.)" reminder is already stripped by the parser before this
 * runs, so the clause arrives as the bare sentence.
 *
 * TWO faithful surface forms, both emitting op:"gain-control" targetType:"creature":
 *   - "gain control of target creature" — a plain single creature target (no restriction).
 *   - "gain control of target <Subtype>" — a curated creature SUBTYPE (Sliver, …), riding as a
 *     restrictions:[{kind:"subtype", subtype}] so enumerateTargets offers ONLY that subtype (CR 205.3).
 *
 * THE CREED (all-or-nothing) — every OTHER form stays LOW → Arbiter, because each needs machinery this slice
 * does NOT build:
 *   - "until end of turn" (Threaten / Act of Treason) — a REVERTING control change needs an end-of-turn
 *     revert schedule + the untap/haste rider; NOT modeled here (indefinite only). Any duration word →
 *     no match.
 *   - "you control" / "an opponent controls" / "another" — a controller/self-exclusion restriction the bare
 *     subtype matcher deliberately does not fold (mirrors the pump/regen subtype matchers' CREED gate).
 *   - a non-curated word after "target" (a color like "green", a card type like "artifact", "permanent") is
 *     NOT in TARGET_SUBTYPES → no fabricated subtype filter (never a target-anything FP).
 * Whole-clause anchored (^…$) on the bare sentence, so any trailing rider drops the whole clause → LOW.
 */
export function gainControlClauseParser(clause) {
  const t = String(clause || "").trim().toLowerCase().replace(/[’]/g, "'").replace(/\.$/, "").trim();
  // Bare "gain control of target creature" — a plain single creature target, no restriction.
  if (t === "gain control of target creature") {
    return { op: "gain-control", targetType: "creature", restrictions: [] };
  }
  // "gain control of target <Subtype>" — a CURATED creature subtype only (Sliver, …). An optional trailing
  // " creature" is tolerated ("target Sliver creature"), matching the pump/regen subtype matchers.
  const m = t.match(/^gain control of target ([a-z]+)(?: creature)?$/);
  if (m && TARGET_SUBTYPES.has(m[1]) && m[1] !== "creature") {
    return { op: "gain-control", targetType: "creature", restrictions: [{ kind: "subtype", subtype: m[1] }] };
  }
  return null;
}

export function applyGainControl(state, atom, ctx) {
  const controller = ctx.controller;
  if (!state.players?.[controller]) return state; // controller eliminated mid-resolution → clean no-op (CR 800.4a)
  const targets = atomTargets(state, atom, ctx); // chosen creature target(s); ctx.targets for a targetType atom
  let next = state;
  for (const t of targets) {
    if (t?.type !== "creature") continue; // gain-control only models a creature target (Sliver = a creature subtype)
    const lk = findPermanent(next, t.id);
    if (!lk) continue;                         // target left the battlefield → clean no-op (CR 608.2b)
    const from = lk.controller;
    if (from === controller) continue;         // already ours → redundant, nothing to do
    const fromPlayer = next.players[from];
    const toPlayer = next.players[controller];
    if (!fromPlayer || !toPlayer) continue;    // a seat left the game → skip (CR 800.4a)
    const idx = fromPlayer.battlefield.findIndex((p) => p.id === t.id);
    if (idx === -1) continue;                  // defensive: findPermanent said `from`, so this is always found
    const perm = fromPlayer.battlefield[idx];
    // The permanent keeps its identity + every piece of state (tapped, counters, damageMarked, attachments,
    // attachedTo) — only its controller flips, and it becomes summoning-sick under the new controller (CR
    // 702.10c). Move it out of the old controller's battlefield and append to the new controller's.
    const moved = { ...perm, controller, summoningSick: true };
    next = {
      ...next,
      players: {
        ...next.players,
        [from]: { ...fromPlayer, battlefield: fromPlayer.battlefield.filter((p) => p.id !== t.id) },
        [controller]: { ...toPlayer, battlefield: [...toPlayer.battlefield, moved] },
      },
    };
    next = logEvent(next, { kind: "spell-effect", effect: "gain-control", controller, from, permanentId: t.id, name: perm.card?.name || null });
  }
  return next;
}

export const controlResolvers = {
  "gain-control": applyGainControl,
};
