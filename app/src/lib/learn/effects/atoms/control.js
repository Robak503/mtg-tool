/**
 * effects/atoms/control.js — the CONTROL-CHANGE atom (gain-control).
 *
 * ===== GAIN-CONTROL (indefinite) ===== (CR 613.1b layer-2 control-change / 800.4a on-leaving; CR 302.6 summoning-sickness)
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
 *   2. SUMMONING SICKNESS (CR 302.6) — the creature has NOT been under the new controller's control
 *      continuously since their most recent turn began, so it is summoning-sick under its new controller:
 *      `summoningSick:true`. It untaps + loses sickness on the new controller's next untap step (untapAll
 *      clears the flag for the whole battlefield), exactly like a freshly-entered creature — so a stolen
 *      Sliver can't attack / pay a {T} cost the turn it's taken unless it has haste.
 *   3. EVERYTHING ELSE PRESERVED — tapped state, counters, marked damage, and attachments (Auras / Equipment
 *      stay attached; gaining control of a creature does NOT change control of what's attached to it, CR
 *      303.4e / 301.5d). The permanent keeps its identity (same id), so attachments' `attachedTo` back-references stay
 *      valid. The move is a pure array splice (NOT moveCardToZone) precisely because the creature never LEAVES
 *      the battlefield — so no dies/LTB trigger fires and no attachment is detached.
 *
 * A no-op is returned (never a throw) when: the target is already controlled by ctx.controller (redundant
 * grab), the target id can't be found (left the battlefield), or the controller was eliminated
 * mid-resolution (CR 800.4a). Pure data mutation (array moves + a controller-string flip + a boolean) so a
 * game serialized mid-resolution restores byte-identical (no closures).
 */

import { findPermanent, logEvent, updatePermanentSafe } from "../../gameState.js";
import { atomTargets } from "./shared.js";
import { TARGET_SUBTYPES } from "../parseHelpers.js"; // curated creature-subtype allowlist (leaf, cycle-free)
import { addControlEffect, gainControlIndefinitely, controlEffectsOf, UNTIL_END_OF_TURN } from "../../controlMove.js"; // the ONE control move + the control-effect record (CR 613.7), shared with controlAura.js (imports only a zero-import leaf — no cycle)
import { permanentHasCardType } from "../../layers.js"; // GAIN-CONTROL-ALL (Hellkite Tyrant): the card type as it is now — the import removal.js and the other atom modules make (the barrel imports both from the same place, so no new cycle)

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
  // ⭐ THREATEN (Act of Treason / Turn Against / Goatnap — 47 corpus carriers, ZERO of them native before
  // this): the same target, reverting at end of turn. The header above listed this as explicitly NOT built,
  // for two named reasons — "an end-of-turn revert schedule + the untap/haste rider". BOTH now exist:
  //   · the riders were never the problem. splitClauses already yields the three sentences and the parser
  //     already binds "Untap THAT creature" / "IT gains haste" back to this atom's chosen target via
  //     `bindPreviousTargets`. Measured, not assumed.
  //   · the revert is the new half, and it is the SAME control-effect record the control Auras write
  //     (controlMove.js — timestamp order, CR 613.7), its entry ending at the cleanup step under CR 514.2 instead of on detach.
  // Emitted as a DISTINCT flag rather than a separate op so every downstream consumer of "gain-control"
  // (targeting, legality, the event log) keeps working unchanged.
  if (t === "gain control of target creature until end of turn") {
    return { op: "gain-control", targetType: "creature", restrictions: [], untilEndOfTurn: true };
  }
  // "gain control of target <Subtype>" — a CURATED creature subtype only (Sliver, …). An optional trailing
  // " creature" is tolerated ("target Sliver creature"), matching the pump/regen subtype matchers.
  const m = t.match(/^gain control of target ([a-z]+)(?: creature)?$/);
  if (m && TARGET_SUBTYPES.has(m[1]) && m[1] !== "creature") {
    return { op: "gain-control", targetType: "creature", restrictions: [{ kind: "subtype", subtype: m[1] }] };
  }
  // ⭐ THE DAMAGED PLAYER'S ARTIFACTS (play-weighted #745, 2026-10-17 — Hellkite Tyrant: "Whenever this creature deals combat
  // damage to a player, gain control of all artifacts that player controls."). The sentinel phrase is written only by
  // detectTriggers' combat-damage-to-a-player rewrite ("that player" → "the damaged player"); it appears in no printed oracle,
  // and triggerRouting's referent gate pins who:"damagedPlayer" to the combat-damage events (coverage's fence keeps it off
  // spells). A MASS, indefinite, untargeted control change — see applyGainControlAll.
  if (t === "gain control of all artifacts the damaged player controls") {
    return { op: "gain-control-all", cardType: "Artifact", who: "damagedPlayer", targetType: null };
  }
  return null;
}

/**
 * ===== GAIN-CONTROL-ALL (play-weighted #745 — Hellkite Tyrant) =====
 * Every permanent the damaged player (ctx.damagedPlayerId) controls that has the card type (`atom.cardType`) as the effect
 * resolves — the type as it is NOW (layers.permanentHasCardType: an animated or type-changed permanent counts, a removed type
 * doesn't) — moves to the trigger's controller. The set is fixed as the effect begins (CR 611.2c); the change lasts
 * indefinitely (CR 611.2a — no duration printed). Each permanent goes through the one control move (controlMove.moveControl —
 * it never leaves the battlefield: counters, tapped state and attachments ride; an artifact creature is summoning-sick under
 * its new controller, CR 302.6; an Equipment stays on the creature it equips, whose controller doesn't change, CR 301.5d).
 * A later control effect wins over an earlier one (CR 613.7), and this one never ends, so each permanent's control-effect record
 * (a threaten, a control Aura — controlMove.gainControlIndefinitely) is cleared: nothing reverts it at cleanup or when an Aura
 * leaves. No referent (a non-combat event), the controller itself, or a seat that left the game → nothing moves (CR 800.4a).
 */
export function applyGainControlAll(state, atom, ctx) {
  const controller = ctx.controller;
  if (!state.players?.[controller]) return state;
  const from = atom.who === "damagedPlayer" ? ctx.damagedPlayerId : null;
  if (!from || from === controller || !state.players[from]) {
    return logEvent(state, { kind: "spell-effect", effect: "gain-control-all", controller, from: from ?? null, moved: 0 });
  }
  const ids = (state.players[from].battlefield || []).filter((p) => permanentHasCardType(state, p.id, atom.cardType)).map((p) => p.id);
  let next = state;
  for (const id of ids) {
    const perm = (next.players[from]?.battlefield || []).find((p) => p.id === id);
    if (!perm) continue;
    next = gainControlIndefinitely(next, id, controller);
    next = logEvent(next, { kind: "spell-effect", effect: "gain-control", controller, from, permanentId: id, name: perm.card?.name || null });
    // SOULBOND teardown (CR 702.95e) — the same rule as applyGainControl's: another player gaining control unpairs it.
    if (perm.soulbondPartner) {
      next = updatePermanentSafe(next, perm.soulbondPartner, (p) => ({ ...p, soulbondPartner: null }));
      next = updatePermanentSafe(next, id, (p) => ({ ...p, soulbondPartner: null }));
    }
  }
  return logEvent(next, { kind: "spell-effect", effect: "gain-control-all", controller, from, moved: ids.length });
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
    const fromPlayer = next.players[from];
    const toPlayer = next.players[controller];
    if (!fromPlayer || !toPlayer) continue;    // a seat left the game → skip (CR 800.4a)
    const perm = fromPlayer.battlefield.find((p) => p.id === t.id);
    if (!perm) continue;                       // defensive: findPermanent said `from`, so this is always found
    // Already ours: redundant only when no temporary control effect holds it. If one does (we threatened it, or hold it by
    // an Aura that may yet leave), this later effect still applies over it (CR 613.7) — Act of Treason then Sliver
    // Overlord keeps the creature past cleanup.
    if (from === controller && !controlEffectsOf(next, perm).length) continue;
    // ⭐ THE MOVE IS SHARED (controlMove.moveControl) with the while-attached control Auras. It used to be
    // written out here and again in controlAura.js — a deliberate duplication taken to avoid destabilising
    // this atom mid-build, and closed here. Semantics unchanged: an array splice rather than moveCardToZone,
    // so the creature never LEAVES the battlefield (no dies/LTB, identity and attachedTo back-references
    // survive), keeping tapped state / counters / damage / attachments, summoning-sick under its new
    // controller (CR 302.6). What stays LOCAL is what belongs to this atom: the event log and the soulbond
    // teardown below.
    // TIMESTAMPS (CR 613.1b, 613.7 — controlMove.js header). THREATEN (atom.untilEndOfTurn): the effect goes on the end of
    // the permanent's control-effect record, the same record the control Auras write, so the cleanup sweep (CR 514.2)
    // ends it and hands the creature to the latest effect still in force — an earlier Control Magic's controller, or home.
    // ⛔ The revert is scheduled by the RECORD, not by this atom: nothing here has to run again for the creature to go
    // home, which is what makes permanent theft unreachable via this path even if the spell's own resolution is
    // interrupted afterwards. INDEFINITE (Sliver Overlord, CR 611.2a): later than every effect on it and never ending,
    // so the record is cleared — no earlier threaten or Aura can take the creature back.
    next = atom.untilEndOfTurn
      ? addControlEffect(next, t.id, { to: controller, until: UNTIL_END_OF_TURN })
      : gainControlIndefinitely(next, t.id, controller);
    next = logEvent(next, { kind: "spell-effect", effect: "gain-control", controller, from, permanentId: t.id, name: perm.card?.name || null });
    // SOULBOND teardown (BLITZ SL-1, CR 702.95e) — another player gaining control of a paired creature unpairs
    // it. Clear the moved creature's back-reference AND its (still-under-the-old-controller) partner's, so
    // neither soulbond carrier keeps conferring the bond. The layers liveness guard would already suppress the
    // grant on the controller mismatch, but clearing makes the unpairing PERMANENT (they don't re-pair if
    // control later reverts) — never a wrongly-persisting bond. Only when control actually changed hands.
    if (from !== controller && perm.soulbondPartner) {
      next = updatePermanentSafe(next, perm.soulbondPartner, (p) => ({ ...p, soulbondPartner: null }));
      next = updatePermanentSafe(next, t.id, (p) => ({ ...p, soulbondPartner: null }));
    }
  }
  return next;
}

/**
 * ===== REGAIN-OWNED-CREATURES (SG-12, 2026-09-03 — Homeward Path, CR 613.1b / 302.6) =====
 * "Each player gains control of all creatures they own." A MASS control reset: every creature on ANY
 * battlefield whose stamped `owner` differs from its controller goes home through the shared control move
 * (an in-place splice — no leave/enter, no dies, attachments ride). A permanent with no `owner` stamp has
 * never changed hands (the owner-routing convention: absent ⇒ owner === controller) and is left alone.
 * It is an INDEFINITE effect (CR 611.2a), later than every control effect on the creature, so the creature's
 * control-effect record (a threaten, a control Aura — controlMove.js) is CLEARED on the way home: nothing earlier can
 * take it back at cleanup or when an Aura leaves. That includes a creature its owner ALREADY controls through a
 * temporary effect (an owner who threatened it back from a Control Magic keeps it past cleanup, CR 613.7).
 */
export function regainOwnedCreaturesClauseParser(clause) {
  const t = String(clause || "").trim().toLowerCase();
  if (t === "each player gains control of all creatures they own") return { op: "regain-owned-creatures", targetType: null };
  return null;
}

export function applyRegainOwnedCreatures(state, atom, ctx) {
  let next = state;
  const moves = [];
  for (const pid of Object.keys(next.players || {})) {
    for (const perm of next.players[pid]?.battlefield || []) {
      if (!perm?.owner) continue;
      if (perm.owner === pid && !controlEffectsOf(next, perm).length) continue; // home, and nothing temporary holds it
      // A printed creature (type line). A layer-granted creature type (an animated land) is skipped — FN-safe,
      // and it keeps this atom off the layers module (control.js is a leaf under gameState's import order).
      if (!/\bCreature\b/i.test(String(perm.card?.type || perm.card?.type_line || ""))) continue;
      if (!next.players[perm.owner]) continue; // the owner left the game (CR 800.4a) → nothing to go home to
      moves.push({ id: perm.id, from: pid, to: perm.owner, name: perm.card?.name || null });
    }
  }
  for (const m of moves) {
    next = gainControlIndefinitely(next, m.id, m.to);
    next = logEvent(next, { kind: "spell-effect", effect: "regain-owned-creatures", controller: ctx.controller, from: m.from, to: m.to, permanentId: m.id, name: m.name });
  }
  return next;
}

export const controlResolvers = {
  "gain-control": applyGainControl,
  "gain-control-all": applyGainControlAll, // play-weighted #745 — Hellkite Tyrant: every artifact the damaged player controls
  "regain-owned-creatures": applyRegainOwnedCreatures,
};
