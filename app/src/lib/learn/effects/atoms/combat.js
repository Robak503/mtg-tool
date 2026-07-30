/**
 * effects/atoms/combat.js — combat / P-T / animation atoms (fight, pump, animate, earthbend, tap, untap,
 * regenerate). Hosts applyTapEffect (tap/untap).
 */

import { addContinuousEffect, permanentIsCreature, permanentHasKeyword } from "../../layers.js";
import { applyDamageEffect } from "../../spellEffects.js"; // TRAMPLE-EXCESS (Ram Through) — the shared player-damage path (removal.js precedent; call-time binding, cycle-safe)
import { logEvent, destroyLethalCreatures, findPermanent, tapPermanent, untapPermanent, addCounter, addRegenShield, creaturePower, creatureToughness, markCombatDamage, setDoesNotUntapNext, updatePermanentSafe, addPreventionShield } from "../../gameState.js";
import { checkDiesTriggers, checkUntapTriggers } from "../../triggers.js";
import { atomTargets, countForSpec, typeLineStr } from "./shared.js";
import { autoPickCreatureType } from "../../choicePolicy.js"; // BECOME-CREATURE-TYPE (CR 614.12) — the shared auto-choice policy; choicePolicy.js imports NOTHING, which is the only shape an atom can share with resolvers (resolvers -> runProgram -> effectAtoms -> here)
import { NON_CHOSEN_TARGET_TYPES } from "../../targetTypes.js"; // MASS-TAP — targetTypes.js is a zero-import leaf (cycle-safe)
import { SMALL_NUM, NUM_WORD, parseCountSource, parseGrantedKeywords, COUNT_SUBTYPE, TARGET_SUBTYPES } from "../parseHelpers.js"; // seam batch 5/12c: shared parse helpers (leaf, cycle-free)
import { GRANTABLE_STATIC_KEYWORDS, canonicalCombatKeyword } from "../../keywords.js"; // GROUP-KEYWORD-GRANT vocab (keywords.js is a zero-import leaf — cycle-safe)
import { evaluateInterveningIf } from "../../interveningIf.js"; // INSTEAD-AMOUNT (BLITZ INST-1) — the shared board-condition readers for a condition-gated ptUpgrade; interveningIf → gameState is a leaf edge (no cycle)

/** Tap / untap target creature(s), land(s), OR any permanent (CR 701.26). The CREATURE form is the original
 * (a chosen `type:"creature"` target). UNTAP-LAND (Voyaging Satyr "{T}: Untap target land") targets a LAND;
 * TAP-PERMANENT (Koma "Tap target permanent.") targets ANY permanent — both enumerate targets tagged
 * `type:"permanent"` (spellEffects.addPermanents tags every non-creature permanent "permanent"; a creature is
 * tagged "creature"), so for the land form we re-verify the LIVE permanent is actually a land by its type line
 * before acting (never untap a non-land for an untap-land atom — CREED: a mis-applied effect is a forbidden
 * FP). A creature/permanent that has left the battlefield (findPermanent → null) is skipped (CR 608.2b fizzle).
 *
 * LOCK-ACTIVATED (Koma mode 1 — "Its activated abilities can't be activated this turn"): when atom.lockActivated
 * is set, the tapped permanent ALSO gets a layer-6 keyword grant ("activatedAbilitiesLocked", duration
 * end-of-turn) that legalChoices.actionsActivateAbility checks to suppress its activated abilities for the rest
 * of the turn (the same continuous-effect + auto-expire pattern as cant-block). Folded into the tap atom (one
 * target, "Its" = the just-tapped permanent), so there's no cross-atom "it" reference to resolve. */
// UNTAP-BASIC-SUBTYPE (Arbor Elf "{T}: Untap target Forest") — the targetType is a basic land SUBTYPE
// (forest/island/swamp/mountain/plains, CR 305.6), so re-verify the LIVE permanent carries that subtype in
// its type line before acting (mirrors the land re-verify; never untap a non-matching permanent — CREED).
const BASIC_SUBTYPE_TARGET = new Set(["forest", "island", "swamp", "mountain", "plains"]);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export function applyTapEffect(state, atom, ctx, tap) {
  let next = state;
  const wantsLand = atom?.targetType === "land";
  // UNTAP-BASIC-LAND (Earthcraft): the target must be a land carrying the Basic supertype — re-verify the
  // LIVE type line (a Land WITH "Basic") before acting, mirroring the land re-verify (never untap a nonbasic
  // land / non-land for a basic-land atom — CREED).
  const wantsBasicLand = atom?.targetType === "basicLand";
  // TAP-PERMANENT ("Tap target permanent", Koma) AND TAP-NONLAND-PERMANENT ("Tap target nonland permanent an
  // opponent controls", Junk Winder) both act on any live permanent that the restriction-aware enumerator
  // already surfaced (the nonlandPermanent predicate + controller restriction were enforced at target time),
  // so the resolver acts on whatever it's handed — enumerateTargets never offers a land / own permanent here.
  // `target:"thatPermanent"` (Amulet of Vigor's triggering referent) is permanent-wide by construction —
  // atomTargets hands back exactly the one entering permanent, whatever its type — so it joins the
  // any-live-permanent branch. Without this the `t.type === "creature"` fallback would drop an entering LAND
  // and the untap would no-op while the card read native.
  const wantsPermanent = atom?.targetType === "permanent" || atom?.targetType === "nonlandPermanent" || atom?.target === "thatPermanent";
  const wantsBasicSubtype = BASIC_SUBTYPE_TARGET.has(atom?.targetType);
  // AURA-OWN-ENCHANTED (Freed from the Real "{U}: Tap/Untap enchanted creature.") — a FIXED referent, not a
  // chosen target: atomTargets resolves target:"enchanted" to the Aura's host (ctx.sourceId→attachedTo) at
  // resolution (CR 303.4a). Every other tap/untap form carries a `targetType` (no `target`) and reads the
  // chosen ctx.targets byte-for-byte as before. atomTargets returns [{type:"creature", id}] for a live host,
  // [] for a detached/gone Aura (a clean no-op, never a fabricated tap).
  // MASS TAP (Cryptic Command "Tap all creatures your opponents control") — a NON-CHOSEN scope has no chosen
  // targets to read, so it must resolve through atomTargets like the fixed-referent form above. Without this
  // it would read an empty ctx.targets and silently tap NOTHING while the classifier credited the card native
  // — the exact "classifies native but does nothing" trap ATOM_TARGETS_MASS_HANDLED exists to catch.
  // Gated on NON_CHOSEN_TARGET_TYPES rather than a hand-listed scope so a future mass tap can't miss the seam.
  // Byte-identical for every shipped tap atom: they all carry creature/permanent/nonlandPermanent/land
  // targetTypes, none of which is a non-chosen scope (verified across the file before this change).
  const list = (atom?.target || NON_CHOSEN_TARGET_TYPES.has(atom?.targetType)) ? atomTargets(next, atom, ctx) : (ctx.targets || []);
  for (const t of list) {
    const lk = findPermanent(next, t.id);
    if (!lk) continue;
    const tl = typeLineStr(lk.permanent.card);
    const isLand = /\bland\b/i.test(tl);
    // UNTAP-LAND: only act on a land target (verified live). UNTAP-BASIC-SUBTYPE: only a land of the named
    // basic subtype (verified live). TAP-PERMANENT: act on ANY live permanent. CREATURE form: a creature.
    const ok = wantsBasicSubtype
      ? isLand && new RegExp(`\\b${cap(atom.targetType)}\\b`).test(tl)
      : wantsBasicLand ? (isLand && /\bbasic\b/i.test(tl))
      : wantsLand ? isLand : wantsPermanent ? true : t.type === "creature";
    if (!ok) continue;
    next = tap ? tapPermanent(next, t.id) : untapPermanent(next, t.id);
    if (tap && atom?.lockActivated) {
      next = addContinuousEffect(next, {
        layer: 6,
        op: { layerOp: "addKeyword", keyword: "activatedAbilitiesLocked" },
        affects: { mode: "fixed", permanentIds: [t.id] },
        duration: { kind: "endOfTurn", turn: next.turn },
        source: { kind: "resolution", permanentId: ctx.sourceId || null, cardName: ctx.cardName || null },
      }).state;
    }
    // NO-UNTAP LOCKDOWN (Junk Winder — "It doesn't untap during its controller's next untap step"): flag the
    // tapped permanent so untapAll (gameState.js) SKIPS it exactly once (clearing the flag as it skips, so only
    // the NEXT untap step is affected — CR 302.6 / a self-clearing one-shot restriction). Folded into the SAME
    // tap atom ("It" = the just-tapped permanent), like lockActivated above — no cross-atom "it" to resolve.
    if (tap && atom?.noUntapNext) {
      next = setDoesNotUntapNext(next, t.id, true);
    }
    // STUN (CR 122.1c): put N stun counter(s) on the just-tapped creature. untapAll then skips its next untap
    // (removing one stun counter) per counter — the enforced tap-lock. Folded onto the SAME tap atom ("it/them").
    if (tap && atom?.stunCounter) {
      next = addCounter(next, { permanentId: t.id, type: "stun", amount: atom.stunCounter });
    }
  }
  if (!tap) next = checkUntapTriggers(next); // BECOMES-UNTAPPED (Mesmeric Orb): drain the recorded transitions
  return logEvent(next, { kind: "spell-effect", effect: tap ? "tap" : "untap", targets: list.map(t => t.id) });
}

/**
 * UNTAP-UP-TO-N-LANDS (Finale of Revelation "untap up to five lands") — a NON-targeted, CONTROLLER-scoped
 * untap of up to `atom.uptoN` of the controller's OWN tapped lands (CR 701.20). Untapping is never a downside
 * and the controller would always untap the MAXIMUM available (up to the cap), so this is a deterministic
 * greedy auto-untap (min(cap, tapped lands)) — no interactive choice needed and no CREED risk (over-untapping
 * an opponent's land / a non-land is impossible; only the controller's tapped lands, in battlefield order, are
 * touched). condX-gated: when atom.condX is set, the untap only happens once the chosen X reaches the threshold
 * (a below-threshold cast is a logged no-op — the "If X is N or more, …instead…" branch simply isn't met, CR).
 * `?? 0` treats a missing xValue as 0 (never "condition met"). Mirrors the applyPumpEffect condX gate exactly.
 * UNTAP-ALL-LANDS (`atom.all`, Bear Umbra's granted attack trigger): the SAME resolver with NO cap — every one
 * of the controller's tapped lands is untapped (cap = Infinity), still only the controller's own live-verified
 * lands, so the CREED-safety is identical (never an opponent's land, never a non-land).
 */
export function applyUntapLands(state, atom, ctx) {
  if (atom?.condX && (ctx.xValue ?? 0) < atom.condX.min) {
    return logEvent(state, { kind: "spell-effect", effect: "untap", targets: [] });
  }
  const controller = ctx.controller;
  const player = state.players?.[controller];
  if (!player) return state;
  // `all:true` (untap ALL lands you control) has no cap; the up-to-N form caps at atom.uptoN. A missing count
  // (neither) untaps nothing (cap 0) — the resolver never mis-fires without an explicit count.
  const cap = atom?.all ? Infinity : (Number.isFinite(atom?.uptoN) ? atom.uptoN : 0);
  // The controller's OWN tapped lands, in stable battlefield order (serialize-deterministic — no sort needed;
  // battlefield order is already stable). Re-verify the LIVE type line is a land before untapping (CREED —
  // never untap a non-land). Take the first `cap` of them.
  const ids = [];
  for (const perm of player.battlefield || []) {
    if (ids.length >= cap) break;
    if (!perm.tapped) continue;
    // WHICH permanent type this untap is scoped to. Lands by default (every pre-existing caller);
    // scope:"creature" is the mass-own-creatures form (Aggravated Assault, Aurelia, Moraug, Great Train
    // Heist — 43 corpus cards). The LIVE type is re-verified either way (CREED — never untap the wrong
    // permanent type), and creature-ness is read LAYER-AWARE so an animated land counts exactly as the
    // board sees it, not as its printed line reads.
    if (atom?.scope === "creature") {
      if (!(/\bcreature\b/i.test(typeLineStr(perm.card)) || permanentIsCreature(state, perm.id))) continue;
    } else if (atom?.scope === "attacking") {
      // ATTACKING-ONLY (CR 506.3) — Karlach #1039, Hellkite Charger #2125, Scourge of the Throne #1277,
      // Najeela. A strict SUBSET of the creature scope: the permanent must be in the live attacker set.
      // Read from state.combat.attackers (entries are { permanentId, … }) rather than a flag on the
      // permanent, so it is exactly the set the combat system is currently resolving.
      //
      // ⛔ OUTSIDE COMBAT THIS UNTAPS NOTHING. Every carrier is an attack trigger, so the set is non-empty
      // when it fires; a stale or absent combat object yields an empty list and a clean no-op, never a
      // fallback to "all creatures" — which would untap the whole board off a card that promised only the
      // attackers.
      if (!(state.combat?.attackers || []).some((a) => a?.permanentId === perm.id)) continue;
    } else if (!/\bland\b/i.test(typeLineStr(perm.card))) continue;
    ids.push(perm.id);
  }
  let next = state;
  for (const id of ids) next = untapPermanent(next, id);
  next = checkUntapTriggers(next); // BECOMES-UNTAPPED (Mesmeric Orb): drain the recorded transitions
  return logEvent(next, { kind: "spell-effect", effect: "untap", targets: ids });
}

/** REGEN (CR 701.19) — give the SOURCE (self) or the chosen creature a regeneration shield. The shield is
 * consumed at the next would-destroy (the lethal-damage SBA / the destroy effect), which clears damage + taps
 * the creature so it survives. No magnitude (one clause → one shield per target); atomTargets resolves "self"
 * to the source creature and "creature" to ctx.targets, exactly like the +1/+1-counter atom. */
/**
 * BECOME-CREATURE-TYPE (CR 205.1b + 613.1d + 614.12) — the source becomes a single chosen creature type
 * until end of turn (the Mistform cycle). A layer-4 continuous effect with an endOfTurn duration, so every
 * reader that already asks the layer engine for a type line — tribal anthems, subtype-scoped pumps, the
 * chosen-type gates, changeling checks — sees the change without any of them knowing this atom exists.
 *
 * ⛔ REPLACES rather than ADDS. The op carries `replaces`: the source's PRINTED creature subtypes,
 * snapshotted here at resolution, which the layer pass deletes before adding the chosen one. Snapshotting
 * at resolution (not at derive time) is what keeps the effect a fixed, timestamped thing per CR 613.1d
 * instead of something that re-reads a type line the effect itself is changing.
 *
 * The type is auto-picked by the SHARED policy (choicePolicy.autoPickCreatureType), the same function the
 * ETB choosers use — one policy, so the engine cannot pick two different types on one board. Note the ETB
 * callers pass a PRE-entry state while this one passes the live state, so the source counts ITSELF here;
 * that is correct (it is on the battlefield) and is stated in the policy's caller contract.
 */
export function applyBecomeCreatureType(state, atom, ctx) {
  const lk = ctx?.sourceId == null ? null : findPermanent(state, ctx.sourceId);
  if (!lk?.permanent) return state;                       // source already gone (CR 608.2b) — clean no-op
  // EXCLUDE THE SOURCE from the tally: it is precisely the permanent whose type is being replaced, so
  // counting its own soon-to-be-gone subtype makes the pick self-defeating (a lone Mistform Dreamer would
  // choose Illusion and replace Illusion with Illusion — a legal activation that does nothing).
  const chosen = autoPickCreatureType(state, lk.permanent.controller, { excludePermanentId: lk.permanent.id });
  if (!chosen) return state;
  const printed = String(lk.permanent.card?.type || lk.permanent.card?.type_line || "");
  const dash = printed.indexOf("—");
  const replaces = /Creature/.test(printed) && dash !== -1
    ? printed.slice(dash + 1).trim().split(/\s+/).filter(Boolean)
    : [];
  const next = addContinuousEffect(state, {
    layer: 4,
    op: { layerOp: "setCreatureSubtypes", subtypes: [chosen], replaces },
    affects: { mode: "fixed", permanentIds: [lk.permanent.id] },
    duration: { kind: "endOfTurn", turn: state.turn },
    source: { kind: "resolution", permanentId: lk.permanent.id, cardName: ctx?.cardName || null },
  }).state;
  return logEvent(next, { kind: "spell-effect", effect: "become-creature-type", targets: [lk.permanent.id], chosenType: chosen });
}

export function applyRegenerate(state, atom, ctx) {
  let next = state;
  const targets = atomTargets(state, atom, ctx);
  for (const t of targets) {
    if (t.type === "creature" && findPermanent(next, t.id)) next = addRegenShield(next, t.id);
  }
  return logEvent(next, { kind: "spell-effect", effect: "regenerate", targets: targets.map(t => t.id) });
}

/**
 * P2.3 pump — "+X/+X until end of turn" (Giant Growth family). Does NOT mutate
 * P/T directly: it registers a CR 613.4c (layer 7c) continuous effect into the
 * layer engine for each targeted creature, with an endOfTurn duration so it wears
 * off at the cleanup step (CR 514.2 — `expireContinuousEffects`, already wired in
 * gameEngine). Derived P/T (combat, SBAs, the AI) reads through layers, so the
 * pump shows up everywhere. The mechanism was built + tested in Phase 1; this
 * atom just emits the record.
 */
export function applyPumpEffect(state, atom, ctx) {
  let next = state;
  // COND-X GATE (Finale of Devastation — "If X is N or more, …"): the pump applies ONLY when the chosen X
  // reaches the threshold. Below it, the whole pump is a logged no-op — NO continuous effects, NO grants —
  // exactly as printed (the "If X is N or more" condition simply isn't met, CR). `?? 0` treats a missing
  // xValue as 0 (never as "condition met"), so the gate is never silently skipped.
  if (atom.condX && (ctx.xValue ?? 0) < atom.condX.min) {
    return logEvent(next, { kind: "spell-effect", effect: "pump", power: 0, toughness: 0, targets: [] });
  }
  // X-pump ("+X/+X until end of turn") binds both pips to the chosen X (ctx.xValue);
  // a fixed pump reads its printed ptDelta.
  const x = ctx.xValue || 0;
  // OVERRUN-X — a count-scaled team pump locks +X/+X to a BOARD COUNT at resolution (CR 608.2h), e.g.
  // Overwhelming Stampede's "greatest power among creatures you control". Computed from `state` (pre-pump,
  // before the loop below adds any P/T effect), so X reads the un-buffed board. Takes precedence over the
  // X-cost pump (amountX → ctx.xValue) and the printed ptDelta; 0 (empty board) is a valid +0/+0, not null.
  const scaled = atom.ptDeltaCount ? Math.max(0, countForSpec(state, ctx, atom.ptDeltaCount) * (atom.ptDeltaCount.per ?? 1)) : null;
  // amountX → the chosen X (ctx.xValue) scales the pump. amountXSlot ("p"/"t") marks WHICH stat is the
  // +X for an ASYMMETRIC X-pump ("+X/+0" → slot "p", "+0/+X" → slot "t"); the OTHER stat reads its
  // printed ptDelta. An absent slot = symmetric +X/+X (both stats = X) — the original behavior.
  // amountXNeg → a NEGATIVE symmetric X-pump ("-X/-X", Grim Hireling's sac-X debuff): both pips subtract X.
  // amountXTimes → a MULTIPLIED X-pump ("twice -X/-X", Nuclear Fallout — SHELF S7): both pips scale by N·X.
  const xSigned = (atom.amountXNeg ? -x : x) * (atom.amountXTimes || 1);
  const xP = atom.amountX && (!atom.amountXSlot || atom.amountXSlot === "p");
  const xT = atom.amountX && (!atom.amountXSlot || atom.amountXSlot === "t");
  // COUNT-SCALED SLOT (Magma Sliver's granted "+X/+0 … where X is the number of Slivers on the battlefield"):
  // ptDeltaCountSlot ("p"/"t") marks WHICH stat gets the board-count-scaled X for an ASYMMETRIC count pump;
  // the OTHER stat reads its printed ptDelta. Absent slot = symmetric (both stats = the count, the original
  // Overrun-X behavior). Mirrors amountXSlot exactly but for the board-count (`scaled`) magnitude, not ctx.xValue.
  const cP = scaled != null && (!atom.ptDeltaCountSlot || atom.ptDeltaCountSlot === "p");
  const cT = scaled != null && (!atom.ptDeltaCountSlot || atom.ptDeltaCountSlot === "t");
  // CONDITION-GATED P/T UPGRADE (BLITZ INST-1, CR 608.2 + 614 "instead") — the ability-word pump swap (Mirran
  // Mettle "gets +4/+4 instead if you control three or more artifacts"; Tragic Slip's Morbid -13/-13): the
  // board condition is read at RESOLUTION via the shared intervening-if evaluator; when it holds, the printed
  // base ptDelta is replaced by the upgraded pair. `ptUpgrade` is a NEW field only the INSTEAD matcher emits
  // (and it never co-occurs with the X / board-count pump paths), so every existing pump is byte-identical;
  // a false/null read keeps the base ptDelta (false-negative safe — the curated parser gate blocks a wrongly
  // applied upgrade, CREED).
  const pt = (atom.ptUpgrade?.condition && evaluateInterveningIf(state, atom.ptUpgrade.condition, ctx.controller, ctx) === true)
    ? atom.ptUpgrade.ptDelta : atom.ptDelta;
  const power = cP ? scaled : (scaled != null && !cP ? (pt?.p || 0) : (xP ? xSigned : pt?.p || 0));
  const toughness = cT ? scaled : (scaled != null && !cT ? (pt?.t || 0) : (xT ? xSigned : pt?.t || 0));
  // Chosen targets for a single-creature pump (Giant Growth), EVERY creature for a mass
  // "All creatures get -X/-X until end of turn" (atom.targetType "eachCreature" — Infest /
  // Languish), or the controller's creatures for a TEAM pump (atom.scope "youControl" — Overrun
  // / Trumpet Blast; the set locked at resolution, CR 611.2c). Each becomes a per-creature fixed
  // layer effect below, so the keyword-grant + lethal-SBA machinery is shared across all three.
  const targets = atomTargets(state, atom, ctx);
  const src = { kind: "resolution", permanentId: null, cardName: ctx.cardName || null };
  const dur = () => ({ kind: "endOfTurn", turn: next.turn });
  for (const target of targets) {
    // A creature that has LEFT the battlefield before this pump resolves (killed in response, an SBA, a
    // bounce) is skipped — CR 608.2b fizzle. Without this guard the untap tail (untapPermanent → updatePermanent)
    // THROWS "Permanent <id> not found" on a departed target of any pump-untap / untap-then-pump combat trick
    // (Vines of the Recluse, Ornamental Courage, …). Mirrors the findPermanent(next,…) guard every sibling
    // resolver in this file already carries (tap / regenerate / fight).
    if (target.type !== "creature" || !findPermanent(next, target.id)) continue;
    // DOUBLE-P/T (Unnatural Growth / Reckless Amplimancer / Tifa Lockhart) — "double the power [and toughness]"
    // is a PER-TARGET one-shot doubling (CR 701.10b — the bonus modifies, doesn't set; X = the creature's power/
    // toughness as the effect resolves): snapshot THIS target's current layer-aware P/T at resolution and add
    // +that as a fixed layer-7c bonus, so the P/T becomes 2×. atom.doublePt "pt" doubles both, "p" doubles power
    // only (toughness untouched). The bonus is the SIGNED current value — a NEGATIVE power adds that same
    // negative (CR 701.10c — a creature with power < 0 gets -X/-0 when doubled), so NO 0-floor here (flooring
    // under-doubled a debuffed creature: a 3/3 at -2 power must become -4, not -2). Each target gets its OWN
    // delta (distinct from the uniform ptDelta pumps above).
    let addP = power, addT = toughness;
    if (atom.doublePt) {
      const lp = findPermanent(next, target.id).permanent;
      addP = creaturePower(lp, next);
      addT = atom.doublePt === "p" ? 0 : creatureToughness(lp, next);
    }
    if (addP !== 0 || addT !== 0) {
      next = addContinuousEffect(next, {
        layer: 7, sublayer: "7c",
        op: { layerOp: "ptModify", power: addP, toughness: addT },
        affects: { mode: "fixed", permanentIds: [target.id] },
        duration: dur(), source: src,
      }).state;
    }
    // Combat-trick keyword grant ("…and gains trample until end of turn"): a layer-6 addKeyword
    // for each granted keyword, same endOfTurn duration as the pump (wears off at cleanup, CR
    // 514.2). Granted via the layer engine, so combat reads it exactly like a printed keyword.
    for (const kw of atom.grantKeywords || []) {
      next = addContinuousEffect(next, {
        layer: 6,
        op: { layerOp: "addKeyword", keyword: kw },
        affects: { mode: "fixed", permanentIds: [target.id] },
        duration: dur(), source: src,
      }).state;
    }
    // PUMP-UNTAP — a combat trick that also untaps its target ("…until end of turn. Untap it." — Vines of
    // the Recluse, Acrobatic Leap, ambush tricks). The untap is part of the SAME single-target atom (no
    // second target), so it lands on the pumped creature; a one-shot untap, not a continuous effect.
    if (atom.untap) {
      next = untapPermanent(next, target.id);
      next = checkUntapTriggers(next); // BECOMES-UNTAPPED (Mesmeric Orb): drain the recorded transition
    }
  }
  // A negative pump (-X/-Y, e.g. Disfigure / Last Gasp / Dismember) can drop a
  // creature's DERIVED toughness to <= 0 — run the lethal SBA so it dies at
  // resolution (CR 704.5f), exactly as the damage atom does. A positive pump
  // (Giant Growth) finds nothing lethal, so this is a no-op for it. Without this
  // the creature would silently survive at 0 toughness until the next combat step.
  const lethal = destroyLethalCreatures(next);
  next = checkDiesTriggers(lethal.state, lethal.dead);
  return logEvent(next, { kind: "spell-effect", effect: "pump", power, toughness, targets: targets.map(t => t.id) });
}

/**
 * WALT-ANIMATE PR2: "Until end of turn, target land becomes a [subtype] N/N creature [with KW…].
 * It's still a land." Layers three CR-613 continuous effects onto the chosen permanent, all until
 * end of turn (worn off at cleanup by expireContinuousEffects, CR 514.2):
 *   - layer 4: ADD the Creature card type (+ any printed creature subtype like Elemental/Dinosaur).
 *     Additive — the Land type is never stripped, so "it's still a land" is honored for free.
 *   - layer 7b: SET base power/toughness to the printed N/N. power/toughness sit at the op TOP LEVEL
 *     because the 7b handler reads `op.power`/`op.toughness` directly and ignores layerOp.
 *   - layer 6: GRANT each rider keyword (flying/haste/trample/…); combat reads it layer-aware exactly
 *     like a printed keyword (granted Haste already lets a just-animated land attack — PR1 framework).
 * PR1's framework already makes the now-creature permanent attack/block/take+deal combat damage/die to
 * the SBA. A 0/0 animate (none in the clean spell subset) has toughness 0 → dies to CR 704.5f via the
 * lethal SBA below, mirroring applyPumpEffect.
 */
export function applyAnimateEffect(state, atom, ctx) {
  let next = state;
  // A man-land's activated ability animates ITSELF (PR3): target:"self" → the activating permanent via
  // ctx.sourceId. Resolved directly, NOT through selfTargets — that gates on a PRINTED creature (CR 113.7
  // self-pump) and would reject a land that is BECOMING a creature. A spell's animate targets a chosen
  // land (type:"permanent", enumerateTargets land path); skip a chosen target that left the battlefield
  // between cast and resolution (a missing-id effect is inert; filtering keeps the log honest).
  const targets = atom.target === "self"
    ? ((ctx.sourceId && findPermanent(next, ctx.sourceId)) ? [{ type: "permanent", id: ctx.sourceId }] : [])
    : atomTargets(state, atom, ctx).filter(t => t.type === "permanent" && findPermanent(next, t.id));
  const src = { kind: "resolution", permanentId: ctx.sourceId || null, cardName: ctx.cardName || null };
  const dur = () => ({ kind: "endOfTurn", turn: next.turn });
  // Layer-4 types: Creature plus any printed card type the animate adds — a man-land that becomes an
  // "artifact creature" (Mishra's Factory). Additive: the Land type is never stripped (still a land).
  const animateTypes = ["Creature", ...(atom.cardTypes || [])];
  for (const target of targets) {
    next = addContinuousEffect(next, {
      layer: 4,
      op: { types: animateTypes, subtypes: atom.subtypes || [] },
      affects: { mode: "fixed", permanentIds: [target.id] },
      duration: dur(), source: src,
    }).state;
    // Layer 5 — SET color when the animate gives one ("becomes a 3/3 GREEN Ape creature"; Creeping Tar
    // Pit "blue and black"). An animate with no color leaves the printed color (a land is colorless).
    if (atom.colors && atom.colors.length) {
      next = addContinuousEffect(next, {
        layer: 5,
        op: { layerOp: "setColor", colors: atom.colors },
        affects: { mode: "fixed", permanentIds: [target.id] },
        duration: dur(), source: src,
      }).state;
    }
    next = addContinuousEffect(next, {
      layer: 7, sublayer: "7b",
      op: { layerOp: "ptSet", power: atom.power || 0, toughness: atom.toughness || 0 },
      affects: { mode: "fixed", permanentIds: [target.id] },
      duration: dur(), source: src,
    }).state;
    for (const kw of atom.grantKeywords || []) {
      next = addContinuousEffect(next, {
        layer: 6,
        op: { layerOp: "addKeyword", keyword: kw },
        affects: { mode: "fixed", permanentIds: [target.id] },
        duration: dur(), source: src,
      }).state;
    }
  }
  // A 0/0 animate has toughness 0 → CR 704.5f puts it into the graveyard at resolution.
  const lethal = destroyLethalCreatures(next);
  next = checkDiesTriggers(lethal.state, lethal.dead);
  return logEvent(next, { kind: "spell-effect", effect: "animate", power: atom.power, toughness: atom.toughness, targets: targets.map(t => t.id) });
}

/**
 * EARTHBEND N (Toph, Earthbending Master deck) — "Target land you control becomes a 0/0 creature with
 * haste that's still a land. Put N +1/+1 counters on it." A PERMANENT land-animation reusing the same
 * layer machinery as applyAnimateEffect (layer-4 ADD Creature+Elemental — Land kept, "still a land"; 7b
 * SET base 0/0; 6 GRANT Haste) but `duration:permanent`, plus N +1/+1 counters applied BEFORE the lethal
 * SBA so the 0/0 survives as a real N/N attacker. The "return it when it dies or is exiled" rider (CR 603.7
 * delayed triggered ability) IS enforced: the animated land is tagged `earthbendReturn` here, and
 * triggers.checkLeavesTriggers synthesizes a delayed trigger (→ zones.applyEarthbendReturn) that returns it
 * TAPPED as a plain land when it leaves to a graveyard (dies) or exile — firing landfall on the re-entry.
 * The sim picks a land the controller controls that isn't already a creature (it stays a land → still
 * ramps). atom.countSource uses the count engine (e.g. experience counters) at resolution.
 */
export function applyEarthbend(state, atom, ctx) {
  const me = ctx.controller;
  const n = atom.countSource
    ? Math.max(0, countForSpec(state, ctx, atom.countSource))
    : Math.max(0, atom.count || 0);
  const player = state.players?.[me];
  if (!player) return state;
  const land = player.battlefield.find((p) => /\bland\b/i.test(typeLineStr(p.card)) && !permanentIsCreature(state, p.id));
  if (!land) return logEvent(state, { kind: "spell-effect", effect: "earthbend", count: n, targets: [] });
  const src = { kind: "resolution", permanentId: ctx.sourceId || null, cardName: ctx.cardName || null };
  const dur = { kind: "permanent" };
  let next = state;
  next = addContinuousEffect(next, { layer: 4, op: { types: ["Creature"], subtypes: ["Elemental"] }, affects: { mode: "fixed", permanentIds: [land.id] }, duration: dur, source: src }).state;
  next = addContinuousEffect(next, { layer: 7, sublayer: "7b", op: { layerOp: "ptSet", power: 0, toughness: 0 }, affects: { mode: "fixed", permanentIds: [land.id] }, duration: dur, source: src }).state;
  next = addContinuousEffect(next, { layer: 6, op: { layerOp: "addKeyword", keyword: "Haste" }, affects: { mode: "fixed", permanentIds: [land.id] }, duration: dur, source: src }).state;
  if (n > 0) next = addCounter(next, { permanentId: land.id, type: "+1/+1", amount: n }); // → a real N/N before the SBA
  // EARTHBEND-RETURN (CR 603.7 delayed triggered ability) — tag the animated land so its "when it dies or is
  // exiled, return it to the battlefield tapped" rider fires (triggers.checkLeavesTriggers synthesizes the return
  // off this flag when the land leaves to a graveyard/exile). Set BEFORE the lethal SBA so an X=0 earthbend (a
  // 0/0 with no counters) that dies to the immediate SBA below still returns.
  next = updatePermanentSafe(next, land.id, (p) => ({ ...p, earthbendReturn: true }));
  const lethal = destroyLethalCreatures(next);
  next = checkDiesTriggers(lethal.state, lethal.dead);
  // EARTHBEND REFERENT — stamp WHICH land was animated so a following "…, then untap that land" can act on
  // it (Avatar Kyoshi, Earthbender). Same mid-resolution value-capture the corpus already uses for Yuriko's
  // revealedCardMV and roll-d20's diceResult: the atom records, the NEXT atom reads. Stamped even when the
  // land died to the SBA above — the follow-up resolver re-verifies the permanent is still on the
  // battlefield, so a dead referent is a clean no-op rather than a stale write.
  next = { ...next, earthbendLandId: land.id };
  return logEvent(next, { kind: "spell-effect", effect: "earthbend", count: n, targets: [land.id] });
}

/**
 * UNTAP-THE-EARTHBENT-LAND — the "…, then untap that land" tail of an earthbend (Avatar Kyoshi,
 * Earthbender: "At the beginning of combat on your turn, earthbend 8, then untap that land").
 *
 * "That land" is the land the PRECEDING earthbend animated, so this reads the `earthbendLandId` stamp rather
 * than choosing one itself — picking a land here would untap the wrong permanent whenever the controller has
 * more than one. Absent stamp, a stamp pointing at a permanent that has since left, or a referent that is no
 * longer a land → a clean no-op. Never a fabricated untap (CREED).
 */
export function applyUntapEarthbentLand(state, atom, ctx) {
  const id = state?.earthbendLandId;
  if (!id) return state;
  const perm = (state.players?.[ctx.controller]?.battlefield || []).find((p) => p.id === id);
  if (!perm || !/\bland\b/i.test(typeLineStr(perm.card))) return state;
  const next = updatePermanentSafe(state, id, (p) => ({ ...p, tapped: false }));
  return logEvent(next, { kind: "spell-effect", effect: "untap", targets: [id] });
}

/**
 * ETB-FIGHT (CR 701.12) — "[this creature|it] fights (up to one) target creature you don't control."
 * Two creatures fight: each deals damage EQUAL TO ITS POWER to the other, SIMULTANEOUSLY (CR 701.12a).
 * The SOURCE is the fighting creature (ctx.sourceId, threaded from the ETB/Enrage trigger flush — these
 * are all triggered abilities in the corpus, never a spell). The chosen creature is the single target.
 *
 * SIMULTANEITY is the cardinal invariant: both damage amounts are LOCKED from the PRE-fight (layer-aware,
 * at-resolution) power BEFORE any damage is marked, then both marks are stamped, and a SINGLE lethal SBA
 * pass runs. Calling applyDamageEffect twice in sequence would run the SBA between the two hits — a
 * source killed by the first hit would never deal back, breaking the two-way "each deals damage to the
 * other" (CR 701.12c — a creature that has left the battlefield still dealt its locked-in damage).
 *
 * Deathtouch (CR 702.2c): any damage from a deathtouch source is lethal — we collect both fighters into
 * the `deathtouched` Set passed to destroyLethalCreatures (the same arg pattern combat damage uses), so a
 * deathtouch source kills any-toughness target (and vice versa) on the single SBA pass. Power floors at 0
 * (a 0-power fighter marks nothing — markCombatDamage is a no-op at 0 and CR 701.12b deals no damage).
 *
 * "up to one target" / no legal target on the battlefield → the loop never runs → a clean no-op (never a
 * fabricated fight). The source having left the battlefield between trigger and resolution leaves srcPow
 * unreadable → no-op (CR 701.12: nothing fights). Single-target in the corpus; the loop is general.
 */
export function fightCreature(state, atom, ctx) {
  const sourceLk = ctx.sourceId ? findPermanent(state, ctx.sourceId) : null;
  const source = sourceLk?.permanent;
  const targets = atomTargets(state, atom, ctx);
  let next = state;
  let acted = false;
  const deathtouched = new Set();
  const hitIds = [];
  for (const t of targets) {
    if (t.type !== "creature") continue;
    if (t.id === ctx.sourceId) continue; // "another target creature" (CR 701.12) — a creature never fights itself
    const targetLk = findPermanent(next, t.id);
    if (!source || !targetLk) continue; // source/target left the battlefield → nothing fights (CR 701.12)
    // Lock BOTH amounts from the PRE-fight, layer-aware power (CR 701.12a, read at resolution), floored at 0.
    const srcPow = Math.max(0, creaturePower(source, next));
    const tgtPow = Math.max(0, creaturePower(targetLk.permanent, next));
    // Deathtouch is read PRE-fight too (a fighter killed by the simultaneous damage still dealt its damage
    // deathtouch-flagged); reuse the layer-aware keyword read so a GRANTED deathtouch counts.
    if (permanentHasKeyword(next, ctx.sourceId, "Deathtouch")) deathtouched.add(t.id);
    if (permanentHasKeyword(next, t.id, "Deathtouch")) deathtouched.add(ctx.sourceId);
    // Mark BOTH hits before any SBA runs — simultaneity (CR 701.12a). markCombatDamage is a no-op at 0.
    if (srcPow > 0) next = markCombatDamage(next, { permanentId: t.id, amount: srcPow });
    if (tgtPow > 0) next = markCombatDamage(next, { permanentId: ctx.sourceId, amount: tgtPow });
    hitIds.push(t.id, ctx.sourceId);
    acted = true;
  }
  if (acted) {
    // A SINGLE lethal SBA pass over BOTH fighters (deathtouch honored), then dies-triggers once.
    const lethal = destroyLethalCreatures(next, deathtouched);
    next = checkDiesTriggers(lethal.state, lethal.dead);
  }
  return logEvent(next, { kind: "spell-effect", effect: "fight", source: ctx.sourceId || null, targets: hitIds });
}

/**
 * Resolve the TWO chosen creatures of a two-target fight / one-way-damage atom from ctx.targets. Unlike
 * the source-bound `fight` (fighter = ctx.sourceId), the SPELL/activated forms — "Target creature you
 * control fights target creature you don't control" (Prey Upon, Pounce) and "Target creature you control
 * deals damage equal to its power to target creature you don't control" (Aggressive Instinct, Rabid Bite)
 * — pick BOTH creatures as targets. The cast-time enumerator (targeting.expandAtoms) tags them with a
 * `role`: the controller's creature is `"fighter"` (the dealer), the enemy is `"target"` (the dealee).
 * Returns { fighter, target } LiveRefs ({ permanent, controller }) or nulls. Falls back to positional order
 * (fighter first) for an untagged target list — defensive; the live paths always role-tag.
 */
function fightPairRefs(state, ctx) {
  const ts = (ctx.targets || []).filter(t => t.type === "creature");
  let fighterT = ts.find(t => t.role === "fighter");
  let targetT = ts.find(t => t.role === "target");
  if (!fighterT && !targetT) { fighterT = ts[0]; targetT = ts[1]; } // untagged → positional (fighter, then dealee)
  // CR 701.12 / "another target creature": the two must be DISTINCT objects. If a malformed input gave the
  // same id for both, drop the second so we never make a creature fight itself (a no-op on the missing half).
  if (fighterT && targetT && fighterT.id === targetT.id) targetT = undefined;
  return {
    fighter: fighterT ? findPermanent(state, fighterT.id) : null,
    target: targetT ? findPermanent(state, targetT.id) : null,
  };
}

/**
 * FIGHT-PAIR (CR 701.12) — the TWO-CHOSEN-TARGET fight: "Target creature you control fights target creature
 * you don't control" (Prey Upon, Pounce, Khalni Ambush) and the any-side "Target creature fights another
 * target creature" (Clash of Titans, Blood Feud). Both chosen creatures deal damage EQUAL TO THEIR POWER to
 * each other SIMULTANEOUSLY — identical invariant to source-bound `fight` (CR 701.12a): lock both layer-aware
 * powers at resolution (floored at 0), read deathtouch pre-fight, mark BOTH hits before any SBA, then a SINGLE
 * lethal SBA pass + dies-triggers once. The ONLY difference from `fight` is that the first fighter comes from
 * a chosen target (role "fighter"), not ctx.sourceId. A missing/illegal half (a target left the battlefield,
 * "up to one" declined) → clean no-op (CR 701.12: nothing fights), never fabricated damage.
 */
export function applyFightPair(state, atom, ctx) {
  let base = state;
  // FIGHTER-PUMP (Epic Confrontation / Savage Smash / Swift Kick / Wild Instincts / Ruthless Predation /
  // Chelonian Tackle) — "Target creature you control gets +X/+Y until end of turn. It fights target creature
  // you don't control." The chosen fighter gets +X/+Y until end of turn (CR 611.2c), applied HERE before the
  // powers are locked, so the pumped power deals more AND the pumped toughness lets it survive the return
  // damage. A real layer-7c ptModify (identical to applyPumpEffect) → creaturePower/destroyLethalCreatures
  // read it layer-aware below. The buff persists to end of turn, matching the printed duration.
  if (atom.fighterPump && (atom.fighterPump.power || atom.fighterPump.toughness)) {
    const pre = fightPairRefs(base, ctx);
    if (pre.fighter) {
      base = addContinuousEffect(base, {
        layer: 7, sublayer: "7c",
        op: { layerOp: "ptModify", power: atom.fighterPump.power || 0, toughness: atom.fighterPump.toughness || 0 },
        affects: { mode: "fixed", permanentIds: [pre.fighter.permanent.id] },
        duration: { kind: "endOfTurn", turn: base.turn },
        source: { kind: "resolution", permanentId: null, cardName: ctx.cardName || null },
      }).state;
    }
  }
  // FIGHTER-COUNTER (Ancient Animus — SHELF W3) — "Put a +1/+1 counter on target creature you control if it's
  // legendary. Then it fights target creature an opponent controls." The chosen fighter gets a PERSISTENT
  // +1/+1 counter BEFORE the powers are locked (the counter raises the locked power, exactly the fighterPump
  // ordering), gated by the printed condition: onlyIfLegendary reads the fighter's live type line at
  // resolution — a non-legendary fighter just fights, no counter (a deterministic state read, not a no-op).
  if (atom.fighterCounter) {
    const pre = fightPairRefs(base, ctx);
    const legendaryOk = !atom.fighterCounter.onlyIfLegendary || /\bLegendary\b/i.test(typeLineStr(pre.fighter?.permanent?.card));
    if (pre.fighter && legendaryOk) {
      base = addCounter(base, { permanentId: pre.fighter.permanent.id, type: atom.fighterCounter.counterType || "+1/+1", amount: atom.fighterCounter.amount || 1 });
    }
  }
  const { fighter, target } = fightPairRefs(base, ctx);
  if (!fighter || !target) {
    return logEvent(base, { kind: "spell-effect", effect: "fight-pair", targets: [] });
  }
  const aPow = Math.max(0, creaturePower(fighter.permanent, base)); // CR 701.12a — read at resolution (buffed)
  const bPow = Math.max(0, creaturePower(target.permanent, base));
  const deathtouched = new Set();
  // Deathtouch read PRE-fight (a fighter killed by the simultaneous damage still dealt its damage); layer-aware.
  if (permanentHasKeyword(base, fighter.permanent.id, "Deathtouch")) deathtouched.add(target.permanent.id);
  if (permanentHasKeyword(base, target.permanent.id, "Deathtouch")) deathtouched.add(fighter.permanent.id);
  let next = base;
  if (aPow > 0) next = markCombatDamage(next, { permanentId: target.permanent.id, amount: aPow });
  if (bPow > 0) next = markCombatDamage(next, { permanentId: fighter.permanent.id, amount: bPow });
  const lethal = destroyLethalCreatures(next, deathtouched); // SINGLE simultaneous SBA pass (CR 701.12a)
  next = checkDiesTriggers(lethal.state, lethal.dead);
  return logEvent(next, { kind: "spell-effect", effect: "fight-pair", targets: [fighter.permanent.id, target.permanent.id] });
}

/**
 * DAMAGE-TARGET-POWER (CR 119) — the ONE-WAY "fight": "Target creature you control deals damage equal to its
 * power to target creature you don't control" (Aggressive Instinct, Rabid Bite). ONLY the `fighter` (the
 * dealer, role "fighter") deals — the dealee (role "target") does NOT deal back (the asymmetry vs fight-pair).
 * Lock the dealer's layer-aware power at resolution (floored at 0), mark that much on the dealee (non-combat
 * damage — markCombatDamage only adds damageMarked, fires no combat triggers), then a lethal SBA + dies once.
 * Deathtouch from the dealer makes any nonzero damage lethal (CR 702.2c). A 0-power dealer / a missing half →
 * clean no-op.
 *
 * TRAMPLE-EXCESS rider (Ram Through — SHELF W2): "If the creature you control has trample, excess damage is
 * dealt to that creature's controller instead." With atom.trampleExcess and a TRAMPLING dealer (layer-aware,
 * read at resolution), the dealee is assigned only LETHAL damage — its remaining toughness, or 1 if the dealer
 * has deathtouch (CR 702.19b) — and the excess goes to the dealee's CONTROLLER through the shared
 * applyDamageEffect player path (prevention/replacement/watchers all apply). A non-trampling dealer deals the
 * whole amount to the creature exactly as before — the rider simply doesn't apply.
 */
export function applyDamageTargetPower(state, atom, ctx) {
  const { fighter, target } = fightPairRefs(state, ctx);
  if (!fighter || !target) {
    return logEvent(state, { kind: "spell-effect", effect: "damage-target-power", targets: [] });
  }
  const pow = Math.max(0, creaturePower(fighter.permanent, state)); // CR 608.2 — read at resolution
  if (pow <= 0) {
    return logEvent(state, { kind: "spell-effect", effect: "damage-target-power", targets: [target.permanent.id] });
  }
  // BITE-PW (BLITZ JB-1, CR 120.3c) — a PLANESWALKER dealee (the creature-or-planeswalker union): route the
  // locked power through the shared applyDamageEffect pw path (damage → loyalty loss, zero-loyalty SBA).
  // Deathtouch/trample are creature-combat concepts — irrelevant here (the union form carries no trampleExcess).
  if (/\bPlaneswalker\b/i.test(String(target.permanent.card?.type || target.permanent.card?.type_line || ""))) {
    const afterPw = applyDamageEffect(state, { controller: ctx.controller, amount: pow, targetType: "planeswalker", targets: [{ type: "planeswalker", id: target.permanent.id }], source: { id: ctx.sourceId } });
    return logEvent(afterPw, { kind: "spell-effect", effect: "damage-target-power", targets: [target.permanent.id] });
  }
  const deathtouched = new Set();
  if (permanentHasKeyword(state, fighter.permanent.id, "Deathtouch")) deathtouched.add(target.permanent.id);
  let toCreature = pow, excess = 0;
  if (atom.trampleExcess && permanentHasKeyword(state, fighter.permanent.id, "Trample")) {
    const remaining = Math.max(0, creatureToughness(target.permanent, state) - (target.permanent.damageMarked || 0));
    const lethalNeed = deathtouched.has(target.permanent.id) ? Math.min(1, remaining) : remaining; // CR 702.19b
    excess = Math.max(0, pow - lethalNeed);
    toCreature = pow - excess;
  }
  let next = toCreature > 0 ? markCombatDamage(state, { permanentId: target.permanent.id, amount: toCreature }) : state;
  const lethal = destroyLethalCreatures(next, deathtouched);
  next = checkDiesTriggers(lethal.state, lethal.dead);
  if (excess > 0) {
    next = applyDamageEffect(next, { controller: ctx.controller, amount: excess, targets: [{ type: "player", id: target.controller }], source: { id: ctx.sourceId } });
  }
  return logEvent(next, { kind: "spell-effect", effect: "damage-target-power", targets: [target.permanent.id] });
}

/**
 * PUMP-PAIR (two-chosen-target buff / debuff) — "Target creature gets +X/+Y until end of turn. Another target
 * creature gets -X/-Y until end of turn." (Leeching Bite, Consume Strength, Schismotivate). Two DISTINCT chosen
 * creatures (CR 601.2c "another", enforced by targeting.expandAtoms' pairAtomIdx): the role-"fighter" creature
 * gets the +buff, the role-"target" creature gets the -debuff — both endOfTurn layer-7c P/T effects, locked at
 * resolution (CR 611.2c). The AI two-target chooser (opponentAI) assigns fighter=OWN / target=ENEMY so the buff
 * lands on our board and the debuff on an opponent's — never friendly-fire (the CREED bar). A -toughness debuff
 * can drop the enemy to <= 0 → the single lethal SBA below kills it (CR 704.5f), mirroring applyPumpEffect. A
 * missing / declined half is a clean no-op.
 */
export function applyPumpPair(state, atom, ctx) {
  const { fighter, target } = fightPairRefs(state, ctx);
  let next = state;
  const src = { kind: "resolution", permanentId: null, cardName: ctx.cardName || null };
  const dur = { kind: "endOfTurn", turn: next.turn };
  const buff = atom.buffDelta || { p: 0, t: 0 };
  const debuff = atom.debuffDelta || { p: 0, t: 0 };
  if (fighter && (buff.p || buff.t)) {
    next = addContinuousEffect(next, { layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: buff.p, toughness: buff.t }, affects: { mode: "fixed", permanentIds: [fighter.permanent.id] }, duration: dur, source: src }).state;
  }
  if (target && (debuff.p || debuff.t)) {
    next = addContinuousEffect(next, { layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: debuff.p, toughness: debuff.t }, affects: { mode: "fixed", permanentIds: [target.permanent.id] }, duration: dur, source: src }).state;
  }
  const lethal = destroyLethalCreatures(next); // a -toughness debuff can drop the debuffed creature to lethal
  next = checkDiesTriggers(lethal.state, lethal.dead);
  return logEvent(next, { kind: "spell-effect", effect: "pump-pair", targets: [fighter?.permanent.id, target?.permanent.id].filter(Boolean) });
}

/**
 * CANT-BLOCK — "target creature can't block this turn" (Goblin Shortcutter, Crossway Vampire, Mardu
 * Roughrider, …). A layer-6 endOfTurn grant of the "cantBlock" keyword; combatEvasion.canBlockAttacker
 * reads it via permanentHasKeyword (layer-aware) and refuses the block, so it wears off at cleanup (CR
 * 514.2) exactly like a combat-trick keyword grant. ENEMY-side (you disable an opponent's blocker to push
 * damage), so atomTargetIntent → "enemy" and the trigger-flush chooser picks an opponent's creature.
 */
export function applyCantBlock(state, atom, ctx) {
  const targets = atomTargets(state, atom, ctx);
  let next = state;
  const src = { kind: "resolution", permanentId: ctx.sourceId || null, cardName: ctx.cardName || null };
  const dur = { kind: "endOfTurn", turn: next.turn };
  for (const target of targets) {
    if (target.type !== "creature" || !findPermanent(next, target.id)) continue;
    next = addContinuousEffect(next, {
      layer: 6, op: { layerOp: "addKeyword", keyword: "cantBlock" },
      affects: { mode: "fixed", permanentIds: [target.id] },
      duration: dur, source: src,
    }).state;
  }
  return logEvent(next, { kind: "spell-effect", effect: "cant-block", targets: targets.map(t => t.id) });
}

/**
 * CANT-BE-BLOCKED — "target creature can't be blocked this turn" (Infiltrate, Artful Dodge, Trailblazer,
 * Slip Through Space). The MIRROR of CANT-BLOCK: a layer-6 endOfTurn grant of the "unblockable" keyword.
 * combatEvasion.canBlockAttacker already refuses EVERY block of a creature with a granted "unblockable"
 * (the Herald of Secret Streams precedent), read layer-aware so it wears off at cleanup (CR 514.2). OWN-side
 * (you make YOUR attacker unblockable to push damage); the optional "you control" form restricts targeting.
 */
export function applyCantBeBlocked(state, atom, ctx) {
  const targets = atomTargets(state, atom, ctx);
  let next = state;
  const src = { kind: "resolution", permanentId: ctx.sourceId || null, cardName: ctx.cardName || null };
  const dur = { kind: "endOfTurn", turn: next.turn };
  for (const target of targets) {
    if (target.type !== "creature" || !findPermanent(next, target.id)) continue;
    next = addContinuousEffect(next, {
      layer: 6, op: { layerOp: "addKeyword", keyword: "unblockable" },
      affects: { mode: "fixed", permanentIds: [target.id] },
      duration: dur, source: src,
    }).state;
  }
  return logEvent(next, { kind: "spell-effect", effect: "cant-be-blocked", targets: targets.map(t => t.id) });
}

/**
 * MASS-BLOCK-LOCK (BLITZ FT-1, the Falter class) — "Creatures [without flying] can't block this turn"
 * (Falter, Magmatic Chasm, Seismic Stomp; Seismic Elemental's ETB carries the same clause). NOT a
 * characteristic change on a locked set: the clause modifies the RULES of the game, so per CR 611.2c it
 * "can affect objects that weren't affected when that continuous effect began" — a creature that enters
 * (or loses flying) later this turn is also stopped, and one granted flying escapes the filtered form.
 * Modeled as ONE layer-6 endOfTurn `addKeyword cantBlock` whose affects is a DYNAMIC selector (every
 * creature, any controller; `withoutKeyword: "flying"` for the filtered form) — matchesSelector re-reads
 * membership at every block-legality query via the layer-aware permanentHasKeyword, which is exactly the
 * CR 509.1b restriction check, and canBlockAttacker already refuses any blocker carrying cantBlock.
 * Wears off at cleanup (CR 514.2). No targets, no snapshot — storing the rule IS the resolution.
 */
export function applyMassBlockLock(state, atom, ctx) {
  const selector = { cardTypes: ["Creature"], ...(atom.withoutKeyword ? { withoutKeyword: atom.withoutKeyword } : {}) };
  const next = addContinuousEffect(state, {
    layer: 6, op: { layerOp: "addKeyword", keyword: "cantBlock" },
    affects: { mode: "dynamic", selector },
    duration: { kind: "endOfTurn", turn: state.turn },
    source: { kind: "resolution", permanentId: ctx.sourceId || null, cardName: ctx.cardName || null },
  }).state;
  return logEvent(next, { kind: "spell-effect", effect: "mass-block-lock", controller: ctx.controller || null, withoutKeyword: atom.withoutKeyword || null });
}

/**
 * MASS-BLOCK-LOCK clause parser — exactly the two evidenced whole clauses: "Creatures without flying
 * can't block this turn" (Falter / Magmatic Chasm / Seismic Stomp / Fire of Orthanc / Tectonic Rift)
 * and the bare "Creatures can't block this turn" (Order // Chaos's Chaos half). Whole-clause anchored:
 * every other filter (power N or less — Temur Charm; monocolored — Awe for the Guilds; color pairs —
 * Flash of Defiance; nonartifact — Ruthless Invasion; Cowards — Pyrophobia; "your opponents control" —
 * Cosmotronic Wave) and every conditional carrier (Ferocious/Threshold/monarch riders arrive as ONE
 * un-split sentence) fails the anchor → null → Arbiter (CREED, FN-safe). Emits a no-target atom
 * (no targetType → non-targeting). Pure. Registered via registerClauseParser in parser.js.
 */
export function massBlockLockClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  const m = t.match(/^creatures( without flying)? can't block this turn$/);
  if (!m) return null;
  return m[1] ? { op: "mass-block-lock", withoutKeyword: "flying" } : { op: "mass-block-lock" };
}

/**
 * SWITCH-PT (CR 613.7e, the engine's layer-7 "7d" sublayer) — "switch [target / this / the triggering]
 * creature's power and toughness until end of turn" (Twisted Image, Transmutation, About Face; plus the
 * {T} / ETB / attack-trigger / self forms on permanents — Dwarven Thaumaturgist, Crookclaw Transmuter,
 * Aquamoeba). A layer-7 sublayer-7d endOfTurn continuous effect; layers.computeDerivedPT already SWAPS
 * power⇄toughness for every 7d effect, so this atom just records the marker. Wears off at cleanup (CR 514.2)
 * like every other endOfTurn layer effect. target:"self" / "thatCreature" resolve through atomTargets.
 */
export function applySwitchPT(state, atom, ctx) {
  const targets = atomTargets(state, atom, ctx);
  let next = state;
  const src = { kind: "resolution", permanentId: ctx.sourceId || null, cardName: ctx.cardName || null };
  const dur = { kind: "endOfTurn", turn: next.turn };
  for (const target of targets) {
    if (target.type !== "creature" || !findPermanent(next, target.id)) continue;
    next = addContinuousEffect(next, {
      layer: 7, sublayer: "7d", op: { layerOp: "switchPT" },
      affects: { mode: "fixed", permanentIds: [target.id] },
      duration: dur, source: src,
    }).state;
  }
  return logEvent(next, { kind: "spell-effect", effect: "switch-pt", targets: targets.map(t => t.id) });
}

/**
 * SELF-DAMAGE-BY-POWER (CR 119, a "self-fight") — "Target creature deals damage to itself equal to its
 * power" (Justice Strike, Repentance, Wrack with Madness, Inner Struggle, Kiku's Shadow; Kiku, Night's
 * Flower's activated ability) and the MASS form "Each creature deals damage to itself equal to its power"
 * (Solar Blaze, Wave of Reckoning). Mirrors fightCreature's proven shape: lock each creature's LAYER-AWARE
 * power at resolution (CR 608.2, floored at 0), mark that much damage on it (markCombatDamage only adds to
 * damageMarked — no triggers fired, so this is non-combat damage exactly like fight), then a SINGLE lethal
 * SBA pass + dies-triggers over the whole set (mass = simultaneous, CR 704.7). A creature with deathtouch
 * dealing damage to itself dies regardless of toughness (CR 702.2e); 0 power = no damage, a clean no-op.
 * Real damage (not "destroy"), so indestructible survives, prevention/regeneration apply, and the lethal
 * SBA reads derived toughness — the correct model. EXPORTED + registered as "damage-self-power".
 */
export function applyDamageSelfPower(state, atom, ctx) {
  const targets = atomTargets(state, atom, ctx);
  let next = state;
  const deathtouched = new Set();
  let acted = false;
  for (const t of targets) {
    if (t.type !== "creature") continue;
    const lk = findPermanent(next, t.id);
    if (!lk) continue; // left the battlefield between cast and resolution → nothing happens to it
    const pow = Math.max(0, creaturePower(lk.permanent, next));
    if (pow <= 0) continue; // a 0-power creature deals no damage to itself (CR 120.8) — clean no-op
    if (permanentHasKeyword(next, t.id, "Deathtouch")) deathtouched.add(t.id); // self-deathtouch is lethal
    next = markCombatDamage(next, { permanentId: t.id, amount: pow });
    acted = true;
  }
  if (acted) {
    const lethal = destroyLethalCreatures(next, deathtouched);
    next = checkDiesTriggers(lethal.state, lethal.dead);
  }
  return logEvent(next, { kind: "spell-effect", effect: "damage-self-power", targets: targets.map((t) => t.id) });
}

/**
 * GROUP-KEYWORD-GRANT (CR 611.2c, layer 6) — a ONE-SHOT spell that grants keyword(s) to a GROUP until end
 * of turn: "Creatures you control gain trample/indestructible until end of turn" (Crash Through, Unbreakable
 * Formation) and "Permanents you control gain hexproof and indestructible until end of turn" (Heroic
 * Intervention). The set is LOCKED at resolution (CR 611.2c) — a permanent that enters later this turn does
 * NOT gain the keyword — so we snapshot the controller's permanents NOW and grant via a layer-6 `addKeyword`
 * with `affects.mode:"fixed"` over that frozen id list (a later-entering creature is excluded for free).
 * `creaturesYouControl` → only creatures (membership read at resolution, permanentIsCreature); `permanents-
 * YouControl` → ALL permanents (so indestructible protects your lands/artifacts from a wipe — Heroic). Each
 * granted keyword is enforced LAYER-AWARE by the same readers a printed keyword uses (canBeTargetedBy for
 * hexproof/shroud, isIndestructible for indestructible, combatEvasion for the combat keywords), so a granted
 * instance behaves exactly like a printed one. Wears off at cleanup via expireContinuousEffects (CR 514.2).
 */
export function applyGrantKeywordsGroup(state, atom, ctx) {
  const ctrl = ctx.controller;
  if (!ctrl || !state.players?.[ctrl]) return state;
  const bf = state.players[ctrl].battlefield || [];
  let sel = atom.scope === "permanentsYouControl"
    ? bf                                                             // ALL your permanents (Heroic Intervention)
    : bf.filter((p) => permanentIsCreature(state, p.id));           // creaturesYouControl
  // COUNTER-FILTERED ("those creatures" — the +1/+1-counter creatures the preceding draw counted; Inspiring
  // Call). Read at resolution off the live counter bag (CR 611.2c snapshot), so a creature that loses its
  // counter before this resolves is excluded — faithful. Absent → no filter (the plain group grant).
  if (atom.requiresCounter) sel = sel.filter((p) => (p.counters?.[atom.requiresCounter] || 0) > 0);
  const ids = sel.map((p) => p.id);
  let next = state;
  const src = { kind: "resolution", permanentId: ctx.sourceId || null, cardName: ctx.cardName || null };
  const dur = { kind: "endOfTurn", turn: next.turn };
  for (const kw of atom.grantKeywords || []) {
    if (!ids.length) break;
    next = addContinuousEffect(next, {
      layer: 6, op: { layerOp: "addKeyword", keyword: kw },
      affects: { mode: "fixed", permanentIds: ids },                // fixed-set array — effectAffects matches by includes()
      duration: dur, source: src,
    }).state;
  }
  // PROTECTION-FROM-EACH-COLOR (Akroma's Will mode B, CR 702.16): ONE layer-6 addProtection carrying all
  // five colors over the same frozen set — layers.permanentProtectionColors unions it with printed
  // protection at the three enforcement sites (targeting/block/damage), and it wears off at cleanup with
  // the keyword grants (same endOfTurn duration).
  if (atom.grantProtectionAllColors && ids.length) {
    next = addContinuousEffect(next, {
      layer: 6, op: { layerOp: "addProtection", colors: ["W", "U", "B", "R", "G"] },
      affects: { mode: "fixed", permanentIds: ids },
      duration: dur, source: src,
    }).state;
  }
  return logEvent(next, { kind: "spell-effect", effect: "grant-keywords-group", controller: ctrl, scope: atom.scope, keywords: atom.grantKeywords, targets: ids });
}

/**
 * EARTHBEND clause parser (WALT, Toph) — migrated from parser.js parseExtendedAtom (seam batch 5).
 * "earthbend N" — a keyword action: permanently animate a land you control into a 0/0 Elemental with haste
 * (still a land) + N +1/+1 counters (applyEarthbend). Two forms: Literal-N ("earthbend 2" → atom.count) and
 * Count-source ("earthbend X, where X is the number of <count source>" → atom.countSource, read at resolution
 * via countForSpec, EARTHBEND-PR3). Pure (no parser.js import); uses the shared SMALL_NUM + parseCountSource leaf.
 */
export function earthbendClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  const ebM = t.match(/^earthbend (\d+|a|an|one|two|three|four|five)$/);
  if (ebM) return { op: "earthbend", count: SMALL_NUM[ebM[1]] ?? parseInt(ebM[1], 10), targetType: null };
  const ebXM = t.match(/^earthbend x,?\s+where x is (?:equal to )?(?:the number of )?(.+)$/);
  if (ebXM) {
    const src = parseCountSource(ebXM[1]);
    if (src) return { op: "earthbend", countSource: src, targetType: null };
  }
  return null;
}

/**
 * Combat keyword clause parsers (migrated from parseExtendedAtom, seam batch 7 / Wave A2):
 *   - tap target creature [+ controller/power/toughness/mana-value/flying restriction] (anchored to $ so a
 *     rider like "…, then return" or "unless its controller pays" falls through → low → Arbiter).
 *   - untap target creature · target creature can't block this turn (cant-block) · regenerate self/target.
 * All whole-clause-anchored, mutually exclusive. Pure (no parser.js import — cycle-safe); normalizes the clause
 * exactly as parseExtendedAtom does. Registered via registerClauseParser in parser.js.
 */
export function combatKeywordClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  // TAP-PERMANENT (Koma "Tap target permanent. Its activated abilities can't be activated this turn.") — a
  // single chosen permanent of ANY type. The bare form taps it; the Koma rider ALSO locks its activated
  // abilities for the turn (a layer-6 keyword grant the runtime enforces in legalChoices + auto-expires at
  // cleanup). The lock is folded into the SAME tap atom (one target, "Its" = the tapped permanent), exactly
  // like the pump+untap combined atom — no cross-atom "it" reference. Whole-clause anchored ($) so any other
  // rider falls through → low → Arbiter (CREED: model the whole clause or nothing).
  // The bare form OR the lock rider (splitClauses folds Koma's ". Its activated abilities can't be activated
  // this turn." into "… and its activated abilities can't be activated this turn", so it arrives as one clause).
  // MULTI-COUNT (CR 601.2c "up to N") — "tap up to <N> target creatures|permanents" (each tapped; applyTapEffect
  // already loops ctx.targets). Same tap resolver + a maxTargets count → targeting.expandAtoms offers each 0..N
  // subset. BARE forms only — a per-target restriction ("… you control") stays LOW → Arbiter (FN-safe; the
  // restriction would need wiring the single-target path has but this slice keeps minimal). minTargets:0.
  // TAP-FREEZE rider (BLITZ TP-1 — Frost Breath class): splitClauses folds "Those creatures don't untap
  // during their controller('s|s') next untap step(s)." onto the multi-tap sentence in the canonical joined
  // form matched here; noUntapNext rides the SAME atom, so applyTapEffect flags EACH tapped creature and
  // untapAll skips each one's next untap step once (CR 302.6, self-clearing — the Junk Winder machinery).
  const multiTapM = t.match(/^tap up to (two|three|four|five) target (creatures|permanents)( and they don't untap during their controllers' next untap step)?$/);
  if (multiTapM) {
    const n = SMALL_NUM[multiTapM[1]];
    if (n >= 2) return { op: "tap", targetType: multiTapM[2] === "creatures" ? "creature" : "permanent", restrictions: [], maxTargets: n, minTargets: 0, ...(multiTapM[3] ? { noUntapNext: true } : {}) };
  }
  // MASS TAP, OPPONENT-SCOPED (CR 701.21a — Cryptic Command, EDHREC #1617: "Tap all creatures your opponents
  // control"). Reuses the shipped eachOpponentCreature mass scope (the Scourge-of-Fleets bounce set) — a
  // NON-CHOSEN, layer-aware, opponents-only creature set — so nothing new is enumerated. Only the opponent
  // form is admitted: a symmetric "tap all creatures" would need the eachCreature scope AND would tap the
  // caster's own board, which is a different card, so it stays low → Arbiter (FN-safe).
  if (/^tap all creatures your opponents control$/.test(t)) {
    return { op: "tap", targetType: "eachOpponentCreature" };
  }
  const tapPermM = t.match(/^tap target permanent( and its activated abilities can't be activated this turn)?\.?$/);
  if (tapPermM) {
    return { op: "tap", targetType: "permanent", restrictions: [], ...(tapPermM[1] ? { lockActivated: true } : {}) };
  }
  // TAP-NONLAND-PERMANENT-LOCKDOWN (Junk Winder — "Tap target nonland permanent an opponent controls. It
  // doesn't untap during its controller's next untap step.") — a single chosen NONLAND permanent an opponent
  // controls (the nonlandPermanent predicate + controller-opponent restriction enforced by enumerateTargets),
  // tapped with a one-shot no-untap lockdown. The rider is FOLDED onto this SAME tap atom (splitClauses joins
  // the two sentences with " and " — the same fold as Koma's lockActivated), so "It" = the just-tapped
  // permanent with no cross-atom reference. The rider is REQUIRED ($ anchor): a bare "tap target nonland
  // permanent an opponent controls" without the lockdown, or any other rider, stays LOW → Arbiter (a SAFE
  // false-negative — model the WHOLE clause or nothing). noUntapNext → applyTapEffect flags the permanent so
  // untapAll skips its NEXT untap step once (CR 302.6, self-clearing).
  if (/^tap target nonland permanent an opponent controls and it doesn't untap during its controller's next untap step$/.test(t)) {
    return { op: "tap", targetType: "nonlandPermanent", restrictions: [{ kind: "controller", who: "opponent" }], noUntapNext: true };
  }
  // TAP-CREATURE-LOCKDOWN (CR 302.6) — the single-target creature sibling of the nonland-permanent form above
  // (Ojutai's Breath / Crippling Chill as a bare spell; Frost Lynx / Frost Trickster / Spire Patrol off an ETB
  // trigger). splitClauses folds the rider sentence on with " and it …" (normalizing the ETB shape's "That
  // creature" pronoun to "it"), so the lockdown rides the SAME tap atom — no cross-atom "it" to resolve —
  // and applyTapEffect flags each tapped target via setDoesNotUntapNext. untapAll then skips exactly ONE untap
  // step and clears the flag as it skips (self-clearing, verified in gameState.untapAll), so this cannot
  // freeze a creature permanently. Restriction set mirrors the stun sibling below. Whole-clause anchored ($):
  // a bare tap without the rider, or any other rider, falls through → low → Arbiter (CREED: whole clause or
  // nothing) — which is what keeps the conditional variants (Guardian of Tazeem, Celestial Regulator) out.
  const tapLockM = t.match(/^tap target creature(?:\s+(an opponent controls|you don't control|defending player controls))? and it doesn't untap during its controller's next untap step$/);
  if (tapLockM) {
    return { op: "tap", targetType: "creature", restrictions: tapLockM[1] ? [{ kind: "controller", who: "opponent" }] : [], noUntapNext: true };
  }
  // STUN (CR 122.1c) — "tap target creature [an opponent controls] and put a stun counter on it" (Gilded
  // Scuttler, Grappling Kraken, Frostfist Strider) / "tap up to N target creature and put a stun counter on
  // it" (Splash Lasher, Utrom Scientists). The stun rider FOLDS onto the SAME tap atom (splitClauses joins the
  // sentences with " and "; "it/them" = the just-tapped creature(s), no cross-atom reference), so stunCounter:1
  // rides along — applyTapEffect adds a stun counter to each tapped target and untapAll enforces the tap-lock
  // (the creature skips its next untap, removing one stun counter, CR 122.1c). Whole-clause anchored ($).
  // ⭐ THE COUNT IS PARSED, not fixed at one. "put THREE stun counters on it" (Freeze in Place, Dreamdew
  // Entrancer, Kitnap, Out Cold) is the same clause with a different number, and applyTapEffect already
  // passes `amount: atom.stunCounter` straight to addCounter — so the resolver has always been able to
  // place N. Only this matcher said "a". Nine corpus cards carry a multi-count stun.
  //
  // N counters = N skipped untaps, which is exactly CR 122.1c: untapAll removes ONE per untap step
  // (untapOrConsumeStun), so three counters keep the creature down for three of its controller's untap
  // steps and then it untaps normally. No new runtime behaviour is being claimed here.
  const stunM = t.match(/^tap (?:up to (one|two|three|four|five) target creatures?|target creature(?:\s+(an opponent controls|you don't control|defending player controls))?) and put (a|one|two|three) stun counters? on (?:it|them)$/);
  if (stunM) {
    const stunCounter = SMALL_NUM[stunM[3]] ?? 1; // "a" → 1 via SMALL_NUM
    if (stunM[1]) { // "up to N" — up-to-one is a single optional target; up-to-≥2 is a multi-target subset
      const n = SMALL_NUM[stunM[1]];
      if (n === 1) return { op: "tap", targetType: "creature", restrictions: [], optionalTarget: true, stunCounter };
      if (n >= 2) return { op: "tap", targetType: "creature", restrictions: [], maxTargets: n, minTargets: 0, stunCounter };
    } else {
      return { op: "tap", targetType: "creature", restrictions: stunM[2] ? [{ kind: "controller", who: "opponent" }] : [], stunCounter };
    }
  }
  const tapM = t.match(/^tap target creature(?:\s+(an opponent controls|defending player controls|you don't control|you control|with power (\d+) or less|with power (\d+) or (?:greater|more)|with toughness (\d+) or less|with mana value (\d+) or (?:greater|more)|without flying|with flying))?\.?$/);
  if (tapM) {
    const qual = tapM[1];
    const restrictions = [];
    if (qual === "an opponent controls" || qual === "defending player controls" || qual === "you don't control")
      restrictions.push({ kind: "controller", who: "opponent" });
    else if (qual === "you control")
      restrictions.push({ kind: "controller", who: "you" });
    else if (tapM[2]) restrictions.push({ kind: "power", op: "<=", value: parseInt(tapM[2], 10) });
    else if (tapM[3]) restrictions.push({ kind: "power", op: ">=", value: parseInt(tapM[3], 10) });
    else if (tapM[4]) restrictions.push({ kind: "toughness", op: "<=", value: parseInt(tapM[4], 10) });
    else if (tapM[5]) restrictions.push({ kind: "manaValue", op: ">=", value: parseInt(tapM[5], 10) });
    else if (qual === "without flying") restrictions.push({ kind: "hasKeyword", keyword: "flying", negate: true });
    else if (qual === "with flying") restrictions.push({ kind: "hasKeyword", keyword: "flying", negate: false });
    // qual undefined → bare "tap target creature" → no restrictions (any creature)
    return { op: "tap", targetType: "creature", restrictions };
  }
  if (/^untap target creature$/.test(t)) return { op: "untap", targetType: "creature" };
  // UNTAP-ANOTHER-TARGET-PERMANENT (Formidable Speaker "{1}, {T}: Untap another target permanent.") — a single
  // chosen permanent of ANY type, OTHER than the source (CR 109.5, "another" = not this permanent). The
  // `permanent` targetType routes through PERMANENT_PREDICATES.permanent (any permanent on any battlefield is
  // legal), the `notSource` restriction excludes the source permanent (ctx.sourceId, threaded from the activated
  // ability's expandCastChoices), and applyTapEffect untaps the live target. Both the "another" (notSource) and
  // the bare "target permanent"/"target creature" forms are accepted; a qualified/rider/multi-target form
  // ("untap X target permanents", "untap target permanent you control") is not anchored here → stays LOW →
  // Arbiter (a SAFE false-negative — model the whole clause or nothing).
  //
  // ⭐ THE TYPE LIST IS THE MISSING CELL, not the machinery. "untap target creature", "…land" and
  // "…permanent" all parsed; "untap target ARTIFACT" — Voltaic Key #1776, Clock of Omens #1743, Aphetto
  // Alchemist — did not, purely because the word wasn't in this alternation. Every type here already has
  // its own PERMANENT_PREDICATES entry driving enumerateTargets, so this widens the vocabulary and adds no
  // new targeting behaviour. (The basic-land subtypes and the numeric "up to N lands" forms keep their own
  // matchers below; those carry counts this one deliberately doesn't.)
  {
    const upM = t.match(/^untap (another )?target (permanent|creature|artifact|enchantment|nonland permanent)$/);
    if (upM) {
      const restrictions = upM[1] ? [{ kind: "notSource" }] : [];
      return { op: "untap", targetType: upM[2] === "nonland permanent" ? "nonlandPermanent" : upM[2], restrictions };
    }
  }
  // AURA-OWN-ENCHANTED (Freed from the Real "{U}: Tap enchanted creature." / "{U}: Untap enchanted creature.";
  // Pemmin's Aura, Kasimir the Lone Wolf's kin) — an activated ability PRINTED ON THE AURA that taps/untaps
  // "enchanted creature". This is a FIXED (non-chosen) referent, NOT a chosen target: the affected creature is
  // whatever the Aura is attached to (its host, resolved at resolution time off ctx.sourceId→attachedTo via
  // atomTargets' target:"enchanted" case — CR 303.4a, the Aura affects the enchanted permanent). No player
  // choice, so no `targetType` (it never enters targeting/enumerateTargets); applyTapEffect resolves the host
  // through atomTargets. Whole-clause anchored ($) so any qualified/rider form falls through → low → Arbiter.
  if (/^tap enchanted creature$/.test(t)) return { op: "tap", target: "enchanted" };
  if (/^untap enchanted creature$/.test(t)) return { op: "untap", target: "enchanted" };
  // AURA-OWN PUMP (BLITZ AF-1 — Armor of Faith / Stonehands / Firebreathing kin: "{M}: Enchanted creature
  // gets +N/+M until end of turn."): the enchanted host as a FIXED referent (atomTargets target:"enchanted"
  // → the Aura's attachedTo at resolution), an until-EOT pump — DISJOINT from the layer-engine static bonus
  // ("Enchanted creature gets +N/+M" with NO tail, parseAttachedClause's), which never carries the EOT tail.
  {
    const aep = t.match(/^enchanted creature gets ([+-]\d+)\/([+-]\d+) until end of turn$/);
    if (aep) return { op: "pump", target: "enchanted", ptDelta: { p: parseInt(aep[1], 10), t: parseInt(aep[2], 10) } };
  }
  // GRANTED-SELF-UNTAP (BLITZ UT-1 — Singing Bell Strike / Ringing Strike Mastery / Immobilizing Ink /
  // Sinking Feeling: the tap-lock escape valve 'Enchanted creature has "{cost}: Untap this creature."').
  // "This creature" is the SOURCE the granted ability is enumerated on (the host — CR 113.7), the same
  // fixed self referent the pump/regenerate atoms use: atomTargets' target:"self" case resolves
  // ctx.sourceId at resolution (live creature verified; gone → [] no-op). Whole-clause anchored ($) so
  // any rider stays LOW → Arbiter (a safe FN).
  if (/^untap this creature$/.test(t)) return { op: "untap", target: "self" };
  // AMULET-UNTAP (#1301) — "untap the triggering permanent", the SENTINEL detectTriggers rewrites a
  // permanentEnters trigger's bare "untap IT" into. The sentinel appears in ZERO printed oracle text, so a
  // SPELL reading "untap it" can never reach this arm (the same guarantee the "the triggering creature"
  // sentinels rely on). Fixed referent → atomTargets' thatPermanent case → ctx.triggeringPermanentId.
  if (/^untap the triggering permanent$/.test(t)) return { op: "untap", target: "thatPermanent" };
  // GUSTCLOAK ESCAPE (BLITZ GC-1, CR 506.4 / 510.1c-d) — "untap (it|this creature) and remove (it|this
  // creature) from combat", the becomes-blocked escape's effect (Gustcloak Runner / Sentinel / Harrier /
  // Skirmisher: "Whenever this creature becomes blocked, you may untap it and remove it from combat."; the
  // Cavalier printing writes "untap this creature"). The internal " and " is kept whole by a splitClauses
  // guard in parser.js; the leading "you may" is peeled by α2 (optional:true → the runProgram yes/no pause;
  // human seat decides, AI/Expert auto-take — the house optional-effect policy). SELF referent only (the
  // trigger's source, ctx.sourceId — atomTargets target:"self"): the TARGETED spell/ability forms ("Remove
  // target attacking creature … from combat" — Reconnaissance / Labyrinth of Skophos) and every
  // blocker-side/rewrite variant (Ydwen Efreet, False Orders, Balduvian Warlord) fail this anchor →
  // low → Arbiter (safe FNs). Resolver: applyUntapRemoveFromCombat.
  if (/^untap (?:it|this creature) and remove (?:it|this creature) from combat$/.test(t)) {
    return { op: "untap-remove-from-combat", target: "self" };
  }
  // UNTAP-LAND (Voyaging Satyr "{T}: Untap target land") — a single chosen land. targetType "land" routes
  // through PERMANENT_PREDICATES.land in enumerateTargets (so any land on any battlefield is a legal target),
  // and applyTapEffect re-verifies the live permanent is a land before untapping. Whole-clause anchored ($) so
  // a qualified form ("untap target land you control", "untap X target lands") stays Arbiter (a safe FN).
  if (/^untap target land$/.test(t)) return { op: "untap", targetType: "land" };
  // UNTAP-UP-TO-N-TARGET-LANDS (Pip-Boy's "Check Map" mode — "Untap up to two target lands"): the
  // multi-count family (CR 601.2c "up to N") on the untap-land atom. maxTargets + minTargets:0 ride the
  // SAME subset machinery return-from-graveyard uses (targeting.expandAtoms enumerates the 0..N subsets,
  // largest-first auto-pick; the trigger flush is subset-proven since the v0.106.0 generalization).
  // applyTapEffect loops ctx.targets and re-verifies each LIVE permanent is a land before untapping.
  // atomTargetIntent(untap) = "own", so the flush chooser picks the controller's own lands.
  {
    const upLandsM = t.match(/^untap up to (one|two|three|four|five) target lands?$/);
    if (upLandsM) return { op: "untap", targetType: "land", maxTargets: SMALL_NUM[upLandsM[1]], minTargets: 0 };
  }
  // UNTAP-N-TARGET-LANDS (BLITZ PW-1 — Garruk Wildspeaker "+1: Untap two target lands"; Ley Weaver / Hope
  // Tender / Argothian Elder / Enhancement Stickers — 5 corpus carriers): the EXACT-count sibling of the "up
  // to N" form above. CR 601.2c requires exactly N targets, so minTargets:N = maxTargets:N (NOT the minTargets:0
  // "up to" shape) — fewer than N legal lands ⇒ the ability can't be activated. Rides the SAME applyTapEffect
  // resolver (loops ctx.targets, re-verifying each LIVE permanent is a land before untapping — CR 701.26b) + the
  // SAME targetSubsets machinery (expandAtoms offers only size-N subsets). Plural "lands" only (an exact count
  // is ≥2); a scoped/qualified form ("two target lands you control", a subtype) stays Arbiter (a safe FN).
  {
    const exactLandsM = t.match(/^untap (two|three|four|five) target lands$/);
    if (exactLandsM) { const n = SMALL_NUM[exactLandsM[1]]; return { op: "untap", targetType: "land", maxTargets: n, minTargets: n }; }
  }
  // UNTAP-BASIC-LAND (Earthcraft "Tap an untapped creature you control: Untap target basic land") — a single
  // chosen land carrying the Basic supertype (CR 205.4a). targetType "basicLand" routes through
  // PERMANENT_PREDICATES.basicLand in enumerateTargets (any BASIC land on any battlefield is a legal target),
  // and applyTapEffect re-verifies the LIVE permanent is a basic land before untapping (never a nonbasic land
  // / non-land — CREED). Whole-clause anchored ($) so "untap target basic land you control" / an X form stays
  // Arbiter (a safe FN). Distinct from the bare "land" form (which accepts nonbasics) and the subtype forms.
  if (/^untap target basic land$/.test(t)) return { op: "untap", targetType: "basicLand" };
  // UNTAP-X-TARGET-LANDS (Candelabra of Tawnos "{X}, {T}: Untap X target lands.") — a MULTI-COUNT chosen-target
  // untap whose target count IS the paid {X} (CR 601.2c). Reuses the SAME applyTapEffect resolver as single-target
  // untap (it already loops ctx.targets) + the SAME targetCountX enumeration Curse of the Swine's exile uses
  // (targeting.expandAtoms picks EXACTLY x distinct legal lands, bound from ctx.xValue). BARE "X target lands"
  // only — a qualified form ("X target lands you control", a subtype, a rider) doesn't match this anchor and stays
  // LOW → Arbiter (a safe false-negative). Whole-clause anchored via the caller's $ boundary.
  if (/^untap x target lands$/.test(t)) return { op: "untap", targetType: "land", targetCountX: true };
  // UNTAP-BASIC-SUBTYPE (Arbor Elf "{T}: Untap target Forest"; Voyaging Satyr's typed kin) — a single chosen
  // land of a basic SUBTYPE (CR 305.6). targetType is the lowercased subtype; enumerateTargets routes it
  // through PERMANENT_PREDICATES.<subtype> (any land of that subtype on any battlefield is legal), and
  // applyTapEffect re-verifies the live permanent carries the subtype before untapping. Whole-clause anchored
  // ($) so "untap target basic land" / "untap target Forest you control" / "untap two target Forests" stays
  // Arbiter (a safe FN). Only the five basic land subtypes (never a creature subtype — a non-land "Forest"
  // doesn't exist, and the predicate also requires a Land type line).
  const us = t.match(/^untap target (forest|island|swamp|mountain|plains)$/);
  if (us) return { op: "untap", targetType: us[1] };
  // UNTAP-UP-TO-N-LANDS (Cloud of Faeries / Peregrine Drake "untap up to N lands"; Treachery, Snap, Frantic
  // Search, et al.) — a NON-targeted, CONTROLLER-scoped untap of up to N of the controller's OWN tapped lands
  // (CR 701.20). This is the SAME atom Finale of Revelation's anchor already emits (op:"untap-lands", uptoN,
  // targetType:null) and the SAME applyUntapLands resolver plays: a deterministic greedy auto-untap of up to
  // the cap, no chosen target and no CREED risk (only the controller's own tapped lands, in battlefield order,
  // are touched — never an opponent's land, never a non-land, verified live). The optional "you control" is
  // redundant (the resolver already scopes to the controller's own lands) but accepted so both printed forms
  // (bare + "you control") route identically. Whole-clause anchored ($): a "target"/"of your"/qualified form
  // ("untap up to N target lands" — Krosan Restorer, Pip-Boy; "up to N of your lands") stays LOW → Arbiter (a
  // SAFE false-negative — those are a chosen-target family this bare-scope resolver doesn't model). N≥1.
  const upN = t.match(/^untap up to (one|two|three|four|five) lands(?: you control)?$/);
  if (upN) {
    const n = SMALL_NUM[upN[1]];
    if (n >= 1) return { op: "untap-lands", uptoN: n, targetType: null };
  }
  // UNTAP-ALL-LANDS (Bear Umbra's granted attack trigger "untap all lands you control"; Sword of Feast and
  // Famine's rider; Nature's Will) — a NON-targeted, CONTROLLER-scoped untap of EVERY one of the controller's
  // OWN tapped lands (CR 701.20 — no cap). The SAME applyUntapLands resolver plays it via `all:true` (an
  // unbounded greedy auto-untap of the controller's own tapped lands, in battlefield order, live-verified as
  // lands — never an opponent's land, never a non-land, no chosen target, no CREED risk). Whole-clause anchored
  // ($): a qualified form ("untap all lands" without "you control" is accepted since the resolver already scopes
  // to the controller; but "untap all Forests you control" / a target/subtype form stays LOW → Arbiter, FN-safe).
  // The optional leading "you " is the second-conjunct form of an and-compound trigger effect ("that
  // player discards a card and YOU untap all lands you control" — Sword of Feast and Famine): the split
  // hands this parser "you untap all lands you control". The subject is redundant (the resolver already
  // scopes to the controller — CR 701.20), so both forms route to the identical atom.
  if (/^(?:you )?untap all lands(?: you control)?$/.test(t)) return { op: "untap-lands", all: true, targetType: null };
  // MASS-OWN-CREATURE UNTAP (CR 701.20) — "untap all/each creature(s) you control" (Aggravated Assault #699,
  // Aurelia #820, Moraug #995, Great Train Heist #1118, Port Razer, Savage Beating, Anzrag). The SAME
  // applyUntapLands resolver plays it with scope:"creature": a deterministic greedy untap of the
  // CONTROLLER'S OWN tapped creatures, no chosen target, no cap. Untapping your own board is never a
  // downside, so there is no decision to model and no CREED risk — an opponent's permanent is never reached
  // (the loop only walks the controller's battlefield) and the live type check keeps a non-creature out.
  //
  // ⛔ "untap all creatures" WITHOUT "you control" is NOT this atom — that is a symmetric untap that also
  // untaps opponents' blockers, which is a different effect and a real downside. It falls through to LOW.
  if (/^(?:you )?untap (?:all|each) creatures? you control$/.test(t)) return { op: "untap-lands", all: true, scope: "creature", targetType: null };
  // ATTACKING-ONLY mass untap (CR 506.3) — "untap all attacking creatures" (Karlach #1039, Hellkite
  // Charger #2125, Scourge of the Throne #1277, Najeela, Take the Bait). The same resolver with a narrower
  // scope: only permanents in the LIVE attacker set. Every carrier is an attack trigger, so the set is
  // populated when it fires; outside combat it untaps nothing rather than falling back to the whole board.
  if (/^untap all attacking creatures$/.test(t)) return { op: "untap-lands", all: true, scope: "attacking", targetType: null };
  // CANT-BE-BLOCKED SELF (BLITZ SC-1 — Sword Coast Sailor's granted trigger effect: "this creature can't
  // be blocked this turn"): the SOURCE as the fixed referent (atomTargets target:"self" → ctx.sourceId);
  // the same layer-6 endOfTurn unblockable grant as the targeted form. Whole-clause anchored.
  if (/^(?:this creature|it) can't be blocked this turn$/.test(t)) return { op: "cant-be-blocked", target: "self", targetType: null };
  if (/^target creature can't block this turn$/.test(t)) return { op: "cant-block", targetType: "creature" };
  // CANT-BLOCK with the printed "an opponent controls" restriction (Clamor Shaman / Plasma Jockey / Smelt-Ward
  // Minotaur) — the same offensive layer-6 cantBlock grant, but the restriction narrows the legal targets to
  // opponents' creatures (matching the print, and aligning with cant-block's existing enemy intent so the
  // trigger flush already picks an opponent's blocker). applyCantBlock is targetType-agnostic → lifts the runtime.
  if (/^target creature an opponent controls can't block this turn$/.test(t)) return { op: "cant-block", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }] };
  // PREVENT-NEXT-DAMAGE (BLITZ PV-1, CR 615 — the Samite Healer / Bandage / Healing Salve frame):
  // "prevent the next N damage that would be dealt to any target this turn" (chosen target) and the
  // non-targeted self form "…that would be dealt to you this turn". The resolver pushes a FLOATING
  // this-turn shield (gameState.addPreventionShield); BOTH damage paths consume it before a hit lands
  // (applyDamageEffect per hit; combatResolution via its local pool at the consultCombat funnel).
  // Anchored ^…$: a rider / "all damage" / a source-scoped form falls through → LOW → Arbiter.
  const pvd = t.match(/^prevent the next (\d+|one|two|three|four|five|six|seven|eight|nine|ten) damage that would be dealt to any target this turn$/);
  if (pvd) return { op: "prevent-next-damage", amount: NUM_WORD[pvd[1]] ?? parseInt(pvd[1], 10), targetType: "any" };
  const pvy = t.match(/^prevent the next (\d+|one|two|three|four|five|six|seven|eight|nine|ten) damage that would be dealt to you this turn$/);
  if (pvy) return { op: "prevent-next-damage", amount: NUM_WORD[pvy[1]] ?? parseInt(pvy[1], 10), who: "you", targetType: null };
  // PLAYERS-ONLY FOG (BLITZ FOG-1b — Defend the Hearth / Commencement of Festivities): "prevent all
  // combat damage that would be dealt to players this turn". Rides the incumbent "fog" op (misc.applyFog
  // owns the family — so programContainsFog + the AI-F5 fog hold policy cover this form automatically)
  // with scope:"players": the resolver stamps preventCombatPlayersTurn and the combat funnel zeroes only
  // the player-directed deals (creature-vs-creature combat still lands). The bare whole-turn form is
  // misc's, untouched. Anchored; any rider falls through.
  if (/^prevent all combat damage that would be dealt to players this turn$/.test(t)) return { op: "fog", scope: "players", targetType: null };
  // CANT-BE-BLOCKED, POWER-CAPPED (BLITZ GT-1 — Goblin Tunneler / Dwarven Warriors class): "target
  // creature with power N or less can't be blocked this turn". The SAME layer-6 endOfTurn unblockable
  // grant, with the printed power cap as a target restriction (creatureSatisfiesRestrictions' existing
  // layer-aware power branch — a pumped creature moves out of the pool live at enumeration). Tried
  // BEFORE the bare form (more specific first); the `$` anchor still rejects "…except by <X>" riders.
  const cbbP = t.match(/^target creature with power (\d+) or less can't be blocked this turn$/);
  if (cbbP) return { op: "cant-be-blocked", targetType: "creature", restrictions: [{ kind: "power", op: "<=", value: parseInt(cbbP[1], 10) }] };
  // CANT-BE-BLOCKED — "target creature[ you control] can't be blocked this turn" (Infiltrate, Artful Dodge).
  // The `$` anchor rejects a qualified "…except by <X>" / conditional form (those stay Arbiter, FN-safe).
  const cbb = t.match(/^target creature( you control)? can't be blocked this turn$/);
  if (cbb) return { op: "cant-be-blocked", targetType: "creature", ...(cbb[1] ? { restrictions: [{ kind: "controller", who: "you" }] } : {}) };
  // SWITCH-PT — "switch [target / this / the triggering] creature's power and toughness until end of turn"
  // → a layer-7 sublayer-7d endOfTurn swap (the layer engine already swaps for every 7d effect). The three
  // referents mirror the pump family: a chosen target, the source ("this creature"), the triggering creature.
  if (/^switch target creature's power and toughness until end of turn$/.test(t)) return { op: "switch-pt", targetType: "creature" };
  if (/^switch this creature's power and toughness until end of turn$/.test(t)) return { op: "switch-pt", target: "self" };
  if (/^switch the triggering creature's power and toughness until end of turn$/.test(t)) return { op: "switch-pt", target: "thatCreature" };
  // SELF-DAMAGE-BY-POWER (a "self-fight") — whole-clause anchored; a rider ("If that creature has flying…"
  // — Cut Propulsion) leaves residue → fails the `$` → low → Arbiter (CREED, FN-safe).
  if (/^target creature deals damage to itself equal to its power$/.test(t)) return { op: "damage-self-power", targetType: "creature" };
  if (/^each creature deals damage to itself equal to its power$/.test(t)) return { op: "damage-self-power", targetType: "eachCreature" };
  if (/^regenerate (?:this creature|this permanent)$/.test(t)) return { op: "regenerate", target: "self" };
  if (/^regenerate target creature$/.test(t)) return { op: "regenerate", targetType: "creature" };
  // MASS-OWN-BOARD REGEN (CR 701.19 — Golgari Charm, EDHREC #1603): a regeneration shield on EVERY creature
  // the controller has. applyRegenerate already routes through atomTargets and shields whatever it returns,
  // so this is the parser half only — the mass scope does the rest. Scoped by targetType rather than by a
  // controller restriction: massCreatureTargets has no controller predicate, so a restriction would be
  // silently dropped and the shields would land on the opponents' creatures too (a wrong effect).
  if (/^regenerate each creature you control$/.test(t)) return { op: "regenerate", targetType: "eachCreatureYouControl" };
  // AURA-OWN-REGEN (CR 701.19) — "regenerate enchanted creature" on an Aura that PRINTS a "{cost}: Regenerate
  // enchanted creature." ability (Regeneration, Keldon Mantle). The fixed target:"enchanted" referent is the
  // SAME one the aura-own tap/untap/pump atoms use: atomTargets → enchantedTargets resolves it to the Aura's
  // host (ctx.sourceId→attachedTo) at resolution, and applyRegenerate already accepts that type:"creature"
  // target. So no resolver change — only isNativeOwnActivatedAura widens its allowed op-set to include this.
  // A spell context has no aura source, so enchantedTargets → [] (a clean no-op, never a fabricated shield).
  if (/^regenerate enchanted creature$/.test(t)) return { op: "regenerate", target: "enchanted" };
  // SUBTYPE-REGEN (CR 205.3 / 701.19) — "regenerate target <Subtype>" (Crypt/Poultice Sliver's group-granted
  // "{T}: Regenerate target Sliver"; printed Black Poplar Shaman "Regenerate target Treefolk", etc.). A
  // CURATED creature-subtype word only (REGEN_TARGET_SUBTYPES) — so a color ("regenerate target green
  // creature"), a card type ("artifact"/"permanent"), or a control rider ("creature you control") never
  // matches here (those stay → low → Arbiter, FN-safe, as before). The subtype rides as a target restriction
  // (enumerateTargets → creatureSatisfiesRestrictions kind:"subtype"), so the runtime offers + regenerates
  // ONLY the matching subtype — never a fabricated/illegal target. addRegenShield already handles the
  // resulting targetType:"creature" target list, so no resolver change is needed.
  const rsM = t.match(/^regenerate target ([a-z]+)$/);
  if (rsM && REGEN_TARGET_SUBTYPES.has(rsM[1])) {
    return { op: "regenerate", targetType: "creature", restrictions: [{ kind: "subtype", subtype: rsM[1] }] };
  }
  return null;
}

// SUBTYPE-REGEN — the CURATED creature subtypes that appear after "regenerate target <X>" in the corpus
// (verified: each appears verbatim ONLY in the subtype portion of a type line — zero left-of-dash collisions —
// so a `\b<subtype>\b` containment match in creatureSatisfiesRestrictions hits exactly the subtyped creatures,
// CR 205.3m). CURATED (not generic) per the CREED: a non-subtype word (a color/card-type) can never reach the
// restriction. Singular surface form only — "regenerate target <X>" is always singular in the corpus.
const REGEN_TARGET_SUBTYPES = new Set([
  "sliver", "samurai", "fungus", "zombie", "treefolk", "insect", "beast", "elephant", "golem", "shade",
]);

/**
 * PUMP clause parser (migrated from parseExtendedAtom, seam batch 12c / Wave B1b) — the most fragmented op.
 * All `^…$`-anchored pump forms, in the SAME first-match order as the inline chain (mutually exclusive, but
 * order preserved for safety): target-creature [+kw], target-creature-you-control/opponent [+kw], each-creature
 * mass, creatures-you-control TEAM [+kw], OVERRUN-X (count-scaled), self [+kw / kw-only], triggering-creature
 * [+kw / kw-only]. Granted keywords ALL-OR-NOTHING via parseGrantedKeywords (leaf); OVERRUN-X count via
 * parseCountSource (leaf). Pure (no parser.js import — cycle-safe); normalizes the clause exactly as
 * parseExtendedAtom does. Registered via registerClauseParser in parser.js.
 */
export function pumpClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  // PUMP-UNTAP — splitClauses folds a trailing "Untap it." sentence onto a combat-trick pump as
  // "…until end of turn and untap it" (the untap targets the SAME pumped creature — "it"). Strip the tail,
  // re-parse the pure pump, and stamp untap:true so applyPumpEffect untaps the target. Only a SINGLE-target
  // "target creature[ you control/an opponent controls]" pump carries this (a team/self/mass form never does).
  const um = t.match(/^(target creature(?: you control| an opponent controls)? gets [+-]\d+\/[+-]\d+ and gains .+ until end of turn) and untap it$/);
  if (um) {
    const base = pumpClauseParser(um[1]);
    return base && base.op === "pump" ? { ...base, untap: true } : null;
  }
  // CAUSATIVE single-target pump (CR 608) — "have target creature get ±N/±N [and gain KW] until end of turn".
  // The inner of "you may have target creature get …" after α2 (parser.js) peels the "you may" wrapper and
  // stamps optional:true — Fourth Bridge Prowler / Undead Executioner / Battle-Rattle Shaman / Blightcaster /
  // Caustic Crawler / Dreamspoiler Witches / Painsmith etc. (a triggered-ability family the bare "target
  // creature gets …" spell form — parseSpellEffect — never covered, because a creature trigger's effect uses
  // the causative "have … get", not the spell-voice "… gets"). Resolves through the SAME applyPumpEffect
  // target-id path (atomTargets → ctx.targets, targetType:"creature") as Giant Growth / Festering Goblin, so
  // no resolver change. Whole-clause anchored ($); a mana-spent conditional prefix ("If {B} was spent, …" —
  // Cankerous Thirst) or any rider leaves residue → fails the anchor → null → low → Arbiter (CREED, FN-safe).
  let cg = t.match(/^have target creature get ([+-]\d+)\/([+-]\d+) and gain (.+) until end of turn$/);
  if (cg) {
    const kws = parseGrantedKeywords(cg[3]);
    return kws ? { op: "pump", targetType: "creature", ptDelta: { p: parseInt(cg[1], 10), t: parseInt(cg[2], 10) }, grantKeywords: kws } : null;
  }
  cg = t.match(/^have target creature get ([+-]\d+)\/([+-]\d+) until end of turn$/);
  if (cg) return { op: "pump", targetType: "creature", ptDelta: { p: parseInt(cg[1], 10), t: parseInt(cg[2], 10) } };
  let pg = t.match(/^target creature gets ([+-]\d+)\/([+-]\d+) and gains (.+) until end of turn$/);
  if (pg) {
    const kws = parseGrantedKeywords(pg[3]);
    return kws ? { op: "pump", targetType: "creature", ptDelta: { p: parseInt(pg[1], 10), t: parseInt(pg[2], 10) }, grantKeywords: kws } : null;
  }
  pg = t.match(/^target creature gains (.+) until end of turn$/);
  if (pg) {
    const kws = parseGrantedKeywords(pg[1]);
    return kws ? { op: "pump", targetType: "creature", ptDelta: { p: 0, t: 0 }, grantKeywords: kws } : null;
  }
  // ⭐ BOUND REFERENT keyword grant — "It gains flying until end of turn." / "That creature gains
  // indestructible until end of turn." The SAME grant as the targeted arm directly above, except the
  // recipient is not chosen here: it is whatever the PRECEDING clause already targeted (CR 608.2 — the
  // pronoun refers to the object the spell has already acted on).
  //
  // The parser has refused unbound referents everywhere until now, on the correct instinct that a
  // mis-bound "it" is a confident wrong grant on the wrong permanent. That instinct is preserved by
  // structure rather than by refusal: this atom carries NO targetType, so it never enumerates a target of
  // its own, and `referentBindingOk` (parser.js) forces the WHOLE program LOW unless the atom immediately
  // before it actually chose one. The binding itself happens at resolution in runProgram.
  //
  // "them"/"those creatures" bind to a PLURAL antecedent and resolve through the identical path — the
  // previous atom's target list is a list either way, so no separate plural handling exists or is needed.
  pg = t.match(/^(?:it|they|them|that creature|those creatures) gains? (.+) until end of turn$/);
  if (pg) {
    const kws = parseGrantedKeywords(pg[1]);
    return kws ? { op: "pump", ptDelta: { p: 0, t: 0 }, grantKeywords: kws, bindPreviousTargets: true } : null;
  }
  // BOUND REFERENT, P/T form — "It gets +2/+0 until end of turn." / "… gets +1/+1 and gains trample …"
  // (Duel Tactics, Mugging, Blindblast, Moment of Valor). Same binding as the grant arm above; the payload
  // is the ordinary pump the explicit-target twin already emits, so nothing new resolves.
  // NO "and gains <kw>" alternative here, deliberately: splitClauses breaks that conjunction, so the
  // compound form never reaches this arm through the sequence path, and a mutation proved its guard
  // untestable. The one printed card needing it (Moment of Valor) is MODAL and does not flip on this
  // alone. Bare P/T only — an arm that cannot be exercised is an arm that cannot be trusted.
  pg = t.match(/^(?:it|they|them|that creature|those creatures) gets ([+-]\d+)\/([+-]\d+) until end of turn$/);
  if (pg) {
    return { op: "pump", ptDelta: { p: parseInt(pg[1], 10), t: parseInt(pg[2], 10) }, grantKeywords: [], bindPreviousTargets: true };
  }
  // BOUND REFERENT, CANT-BLOCK form — "It can't block this turn." (Sparkmage's Gambit, Merciless
  // Javelineer). The `cant-block` op is unchanged; only the recipient is bound rather than chosen.
  // ⚠️ "must be blocked this turn if able" is deliberately NOT here: it is unmodeled even for an EXPLICIT
  // target, so it is a separate mechanic rather than a referent arm. Adding it would credit cards whose
  // payload nothing can resolve — the exact false positive the binding gate exists to prevent.
  if (/^(?:it|they|them|that creature|those creatures) can't block this turn$/.test(t)) {
    return { op: "cant-block", bindPreviousTargets: true };
  }
  // ENCHANTED-SUBJECT keyword grant (census slice 36) — "Enchanted creature gains hexproof until end of
  // turn", the effect of an Aura's own ETB trigger (Starlit Mantle, Accelerated Evolution). Identical to the
  // targeted form above except the referent: no target is CHOSEN, it is the Aura's host, resolved at
  // resolution by shared.enchantedTargets off the source's `attachedTo`. That referent already existed (and
  // was made layer-aware earlier the same day), so this is a subject widening rather than new machinery.
  // A detached Aura, or a host that has left, resolves to [] — a clean no-op, never a fabricated grant.
  pg = t.match(/^enchanted creature gains (.+) until end of turn$/);
  if (pg) {
    const kws = parseGrantedKeywords(pg[1]);
    return kws ? { op: "pump", target: "enchanted", targetType: null, ptDelta: { p: 0, t: 0 }, grantKeywords: kws } : null;
  }
  let pctrl = t.match(/^target creature (you control|an opponent controls) gets ([+-]\d+)\/([+-]\d+)(?: and gains (.+))? until end of turn$/);
  if (pctrl) {
    const who = pctrl[1] === "you control" ? "you" : "opponent";
    const kws = pctrl[4] ? parseGrantedKeywords(pctrl[4]) : null;
    if (pctrl[4] && !kws) return null;
    return { op: "pump", targetType: "creature", restrictions: [{ kind: "controller", who }], ptDelta: { p: parseInt(pctrl[2], 10), t: parseInt(pctrl[3], 10) }, ...(kws ? { grantKeywords: kws } : {}) };
  }
  pctrl = t.match(/^target creature (you control|an opponent controls) gains (.+) until end of turn$/);
  if (pctrl) {
    const who = pctrl[1] === "you control" ? "you" : "opponent";
    const kws = parseGrantedKeywords(pctrl[2]);
    return kws ? { op: "pump", targetType: "creature", restrictions: [{ kind: "controller", who }], ptDelta: { p: 0, t: 0 }, grantKeywords: kws } : null;
  }
  // ANOTHER-TARGET-YOU-CONTROL keyword grant (CR 109.5) — "another target creature you control gains KW until
  // end of turn" (Flesh Burrower / Starling / Trained Condor / Heavenly Qilin attack/etc. triggers). The chosen
  // own creature may NOT be the source; targetType "creatureYouControl" + excludeSource drops ctx.sourceId at
  // enumeration (mirrors the add-counter "another … you control" shape). A pure grant (ptDelta 0/0); an
  // un-grantable keyword → parseGrantedKeywords null → the whole clause drops (CREED — no fabricated grant).
  const anotherKw = t.match(/^another target creature you control gains (.+) until end of turn$/);
  if (anotherKw) {
    const kws = parseGrantedKeywords(anotherKw[1]);
    return kws ? { op: "pump", targetType: "creatureYouControl", excludeSource: true, ptDelta: { p: 0, t: 0 }, grantKeywords: kws } : null;
  }
  // ANOTHER-TARGET-YOU-CONTROL pt bonus (CR 109.5) — "another target creature you control gets +P/+T[ and gains
  // KW] until end of turn" (Gladiolus Amicitia's landfall, Hardened Escort / Imperial Aerosaur / Yotian
  // Frontliner attack triggers). The P/T sibling of the keyword-grant shape above: same "creatureYouControl" +
  // excludeSource targeting (the source permanent is never a legal target — enumerateTargets drops ctx.sourceId),
  // and the SAME applyPumpEffect target-id path (atomTargets → ctx.targets) as the plain "target creature you
  // control gets …" form (pctrl above), so no resolver change. POSITIVE deltas only (\+): a buff you point at
  // your OWN creature is unambiguously own-side (atomTargetIntent pump → "own"); a negative "another … you
  // control" is not a real printed shape and would fight the own-only enumeration, so it isn't credited. A
  // present-but-ungrantable keyword → parseGrantedKeywords null → the whole clause drops (CREED — no fabricated
  // grant), exactly like the keyword-only and pctrl forms.
  const anotherPt = t.match(/^another target creature you control gets (\+\d+)\/(\+\d+)(?: and gains (.+))? until end of turn$/);
  if (anotherPt) {
    const kws = anotherPt[3] ? parseGrantedKeywords(anotherPt[3]) : null;
    if (anotherPt[3] && !kws) return null;
    return { op: "pump", targetType: "creatureYouControl", excludeSource: true, ptDelta: { p: parseInt(anotherPt[1], 10), t: parseInt(anotherPt[2], 10) }, ...(kws ? { grantKeywords: kws } : {}) };
  }
  // ===== MULTI-COUNT PUMP (VERIFY PROTOTYPE) ===== "up to N target creatures[ you control] each get ±P/±T[ and gain KW] until end of turn"
  let mc = t.match(/^up to (two|three|four|five) target creatures(?: (you control))? each get ([+-]\d+)\/([+-]\d+)(?: and gain (.+))? until end of turn$/);
  if (mc) {
    const kws = mc[5] ? parseGrantedKeywords(mc[5]) : null;
    if (mc[5] && !kws) return null;
    return { op: "pump", targetType: "creature", maxTargets: SMALL_NUM[mc[1]], minTargets: 0, ptDelta: { p: parseInt(mc[3], 10), t: parseInt(mc[4], 10) }, ...(mc[2] ? { restrictions: [{ kind: "controller", who: "you" }] } : {}), ...(kws ? { grantKeywords: kws } : {}) };
  }
  // ===== SUBTYPE-RESTRICTED TARGETING (CR 205.3 / 115) ===== a single chosen target restricted to a creature
  // SUBTYPE — "target <Subtype>[ creature] gets +X/+Y[ and gains KW] until end of turn" / "target <Subtype>[
  // creature] gains KW until end of turn" (Otepec Huntmaster "{T}: Target Dinosaur gains haste until end of
  // turn"; the bare "<Subtype>" form omits the "creature" noun — all matching permanents ARE creatures). The
  // subtype rides as a target restriction (enumerateTargets → creatureSatisfiesRestrictions kind:"subtype"),
  // so the runtime offers + pumps ONLY the matching subtype — never an arbitrary creature (THE CREED: an
  // un-enforced subtype filter is a forbidden target-anything FP). targetType stays "creature" so the existing
  // creature enumeration + applyPumpEffect (target-id based, atomTargets→ctx.targets) handle it with NO resolver
  // change. CURATED subtype only (TARGET_SUBTYPES) — a color ("target green creature"), a card type, or
  // "permanent" is NOT in the set → null → low → Arbiter (FN-safe). Checked AFTER the bare/controller-scoped
  // single-target forms above (a plain "target creature" has no subtype word, so it never reaches here) and
  // BEFORE the mass/team forms. NO "another"/"you control" here: "another" (CR 113.7) needs source-exclusion the
  // targeting seam can't yet enforce (→ self-target FP), and a controller clause is a separate restriction — both
  // forms fall through to low (Anaba/Balthor/Advocate PARK), so only the bare subtype-target shape is credited.
  let sg = t.match(/^target ([a-z]+)(?: creature)? gets ([+-]\d+)\/([+-]\d+)(?: and gains (.+))? until end of turn$/);
  if (sg && TARGET_SUBTYPES.has(sg[1])) {
    const kws = sg[4] ? parseGrantedKeywords(sg[4]) : null;
    if (sg[4] && !kws) return null;
    return { op: "pump", targetType: "creature", restrictions: [{ kind: "subtype", subtype: sg[1] }], ptDelta: { p: parseInt(sg[2], 10), t: parseInt(sg[3], 10) }, ...(kws ? { grantKeywords: kws } : {}) };
  }
  sg = t.match(/^target ([a-z]+)(?: creature)? gains (.+) until end of turn$/);
  if (sg && TARGET_SUBTYPES.has(sg[1])) {
    const kws = parseGrantedKeywords(sg[2]);
    return kws ? { op: "pump", targetType: "creature", restrictions: [{ kind: "subtype", subtype: sg[1] }], ptDelta: { p: 0, t: 0 }, grantKeywords: kws } : null;
  }
  // ===== SUBTYPE-TARGET COUNT-SCALED PUMP (Magma Sliver's granted firebreathing) ===== "target <Subtype>[
  // creature] gets +X/+0 [or +0/+X, or +X/+X] until end of turn, where X is <count source>". The count is
  // resolved AT RESOLUTION off the board (CR 608.2h) via ptDeltaCount → applyPumpEffect's count-scaled path;
  // the X slot marks WHICH stat scales (ptDeltaCountSlot "p"/"t" for the asymmetric +X/+0 / +0/+X; absent =
  // symmetric +X/+X). The subtype rides as a target restriction (enumerateTargets → creatureSatisfiesRestrictions
  // kind:"subtype"), so the runtime offers + pumps ONLY the matching subtype (THE CREED). CURATED subtype only
  // (TARGET_SUBTYPES); the count source must be one parseCountSource models under allowBattlefield (the all-seats
  // "<Subtype>s on the battlefield" or any legacy source) — an unmodeled count → null → low → Arbiter (safe FN).
  // The "+0/+0" degenerate (both fixed 0) never matches because at least one pip must be the literal x. Whole-
  // clause anchored ($); a rider fails the anchor → Arbiter. Magma Sliver grants THIS quoted body to all Slivers.
  const scg = t.match(/^target ([a-z]+)(?: creature)? gets (\+x|\+\d+)\/(\+x|\+\d+) until end of turn, where x is (?:the )?(.+)$/);
  if (scg && TARGET_SUBTYPES.has(scg[1])) {
    const pIsX = scg[2] === "+x";
    const tIsX = scg[3] === "+x";
    if (!pIsX && !tIsX) return null;                                    // needs at least one X pip (else it's a fixed pump — handled above)
    const countSpec = parseCountSource(scg[4].replace(/^number of /, ""), { allowBattlefield: true });
    if (!countSpec) return null;                                        // unmodeled count → low → Arbiter (CREED)
    const slot = pIsX && tIsX ? null : (pIsX ? "p" : "t");             // asymmetric → which stat scales; symmetric → both
    const fixed = { p: pIsX ? 0 : parseInt(scg[2], 10), t: tIsX ? 0 : parseInt(scg[3], 10) }; // the non-X stat's printed value
    return {
      op: "pump",
      targetType: "creature",
      restrictions: [{ kind: "subtype", subtype: scg[1] }],
      ptDeltaCount: countSpec,
      ...(slot ? { ptDeltaCountSlot: slot } : {}),
      ptDelta: fixed,
    };
  }
  // SAME-NAME MASS PUMP (BLITZ BB-1, CR 611.2c) — "target creature and all other creatures with the same name as
  // that creature get ±N/±N until end of turn" (Bile Blight -3/-3, Echoing Decay -2/-2, Echoing Courage +2/+2).
  // ONE chosen target (targetType:"creature" → the normal single-creature enumeration; the internal " and " is
  // kept whole by a splitClauses guard in parser.js). The nameFanout flag makes atomTargets read the chosen
  // creature's NAME AT RESOLUTION and fan the ±N/±N endOfTurn layer-7c effect out to every battlefield creature
  // sharing that card name (all players; tokens count — the fixed set, CR 611.2c). applyPumpEffect's lethal SBA
  // already kills a creature dropped to <=0 toughness (the -3/-3 debuff case). Whole-clause anchored ($): a
  // controller-scoped ("its controller controls" — Declaration in Stone / Legion's End) or rider variant, or a
  // damage/exile fanout (Homing Lightning / Sever the Bloodline), never matches → low → Arbiter (FN-safe).
  const nf = t.match(/^target creature and all other creatures with the same name as that creature get ([+-]\d+)\/([+-]\d+) until end of turn$/);
  if (nf) return { op: "pump", targetType: "creature", nameFanout: true, ptDelta: { p: parseInt(nf[1], 10), t: parseInt(nf[2], 10) } };
  let m = t.match(/^(?:all creatures|each creature) gets? ([+-]\d+)\/([+-]\d+) until end of turn$/);
  if (m) return { op: "pump", targetType: "eachCreature", ptDelta: { p: parseInt(m[1], 10), t: parseInt(m[2], 10) } };
  let tp = t.match(/^creatures you control get ([+-]\d+)\/([+-]\d+) and gain (.+) until end of turn$/);
  if (tp) {
    const kws = parseGrantedKeywords(tp[3]);
    return kws ? { op: "pump", scope: "youControl", ptDelta: { p: parseInt(tp[1], 10), t: parseInt(tp[2], 10) }, grantKeywords: kws } : null;
  }
  tp = t.match(/^creatures you control get ([+-]\d+)\/([+-]\d+) until end of turn$/);
  if (tp) return { op: "pump", scope: "youControl", ptDelta: { p: parseInt(tp[1], 10), t: parseInt(tp[2], 10) } };
  // TYPE-NEGATED TEAM PUMP (Return of the Wildspeaker mode 2) — "non-<Subtype> creatures you control get ±P/±T[ and
  // gain KW] until end of turn". The negated subtype is credited via subtypeNegate → controllerCreatureTargets keeps
  // only creatures NOT of that subtype (changeling-aware, CR 702.73a). CURATED subtype only (TARGET_SUBTYPES) — a
  // non-allowlisted word fails the guard → null → low → Arbiter (FN-safe). Optional "and gain <KW>…" grant is
  // all-or-nothing via parseGrantedKeywords. Whole-clause anchored ($); checked AFTER the plain youControl forms so
  // "non-<X>" never collides with them. subtypeNegate is a Title-Cased word for the resolution \b type-line match.
  let tn = t.match(/^non-([a-z]+) creatures you control get ([+-]\d+)\/([+-]\d+)(?: and gain (.+))? until end of turn$/);
  if (tn && TARGET_SUBTYPES.has(tn[1])) {
    const kws = tn[4] ? parseGrantedKeywords(tn[4]) : null;
    if (tn[4] && !kws) return null;
    return { op: "pump", scope: "youControl", subtypeNegate: tn[1].charAt(0).toUpperCase() + tn[1].slice(1), ptDelta: { p: parseInt(tn[2], 10), t: parseInt(tn[3], 10) }, ...(kws ? { grantKeywords: kws } : {}) };
  }
  // TEAM-PUMP-SCOPE — the two scoped variants of the youControl team pump, sharing applyPumpEffect's
  // controllerCreatureTargets gatherer (set locked at resolution, CR 611.2c; endOfTurn → cleanup wear-off):
  //   • "OTHER creatures you control get …"  → excludeSource:true (CR 113.7 — every creature but the source)
  //   • "<Subtype>s you control [other than this creature] get …" → subtypeFilter (curated COUNT_SUBTYPE only)
  // Both honor an optional "and gain <KW>…" grant. Whole-clause anchored ($) so a rider / unmodeled scope /
  // un-grantable keyword / non-curated subtype fails → null → low → Arbiter (FN-safe, never a wrong partial).
  let to = t.match(/^other creatures you control get ([+-]\d+)\/([+-]\d+)(?: and gain (.+))? until end of turn$/);
  if (to) {
    const kws = to[3] ? parseGrantedKeywords(to[3]) : null;
    if (to[3] && !kws) return null;
    return { op: "pump", scope: "youControl", excludeSource: true, ptDelta: { p: parseInt(to[1], 10), t: parseInt(to[2], 10) }, ...(kws ? { grantKeywords: kws } : {}) };
  }
  // The LEADING "other" is the SAME exclusion this arm already models as the trailing "other than this
  // creature" — and it is the word order the corpus actually prints (Hamlet Captain, Belle of the Brawl,
  // Perimeter Sergeant, Heron's Grace Champion all read "other <Subtype>s you control get …"; nothing in the
  // corpus prints the trailing form with a subtype). Both halves already existed — the generic arm above
  // takes a leading "other", this arm takes the subtype — and only their COMBINATION was missing, so every
  // card printing it parked. Either spelling sets the same excludeSource flag; CR 113.7 draws no distinction.
  let ts = t.match(/^(?:(other) )?([a-z]+) you control(?: (other than this creature))? get ([+-]\d+)\/([+-]\d+)(?: and gain (.+))? until end of turn$/);
  if (ts) {
    const subtype = COUNT_SUBTYPE[ts[2]];
    if (!subtype) return null; // a non-curated word ("creatures" handled above; anything else → low/Arbiter)
    const kws = ts[6] ? parseGrantedKeywords(ts[6]) : null;
    if (ts[6] && !kws) return null;
    return { op: "pump", scope: "youControl", subtypeFilter: subtype, ...(ts[1] || ts[3] ? { excludeSource: true } : {}), ptDelta: { p: parseInt(ts[4], 10), t: parseInt(ts[5], 10) }, ...(kws ? { grantKeywords: kws } : {}) };
  }
  // COMBAT-TEAM-PUMP — "attacking|blocking creatures get +N/+N until end of turn" (Trumpet Blast, Hold the
  // Line). scope:attackingCreatures/blockingCreatures → applyPumpEffect over the current combatants (atomTargets);
  // whole-clause anchored, so a filtered/rider form fails the `$` → low → Arbiter (FN-safe).
  const cmb = t.match(/^(attacking|blocking) creatures get ([+-]\d+)\/([+-]\d+) until end of turn$/);
  if (cmb) return { op: "pump", scope: cmb[1] === "attacking" ? "attackingCreatures" : "blockingCreatures", ptDelta: { p: parseInt(cmb[2], 10), t: parseInt(cmb[3], 10) } };
  // BATTLE CRY (BLITZ BC-1, CR 702.90a) — "each other attacking creature gets +N/+M until end of turn":
  // the Trumpet-Blast team pump EXCLUDING the source (excludeSource → atomTargets drops ctx.sourceId).
  // Fired from the keyword's synthesized attacks trigger; whole-clause anchored (a rider → LOW).
  const boc = t.match(/^each other attacking creature gets ([+-]\d+)\/([+-]\d+) until end of turn$/);
  if (boc) return { op: "pump", scope: "attackingCreatures", excludeSource: true, ptDelta: { p: parseInt(boc[1], 10), t: parseInt(boc[2], 10) } };
  // MASS-DEBUFF — "Creatures your opponents control get -N/-N until end of turn" (Make Obsolete, Suffocating
  // Fumes, Cower in Fear, Turn the Tide, Hysterical Blindness, Hampering Snare). The opponent-side mirror of the
  // youControl TEAM pump: scope:"eachOpponentCreature" → applyPumpEffect over opponentCreatureTargets, the SAME
  // per-creature fixed-effect + lethal-SBA path the eachCreature/-X-X wipe uses. Whole-clause anchored — a filter
  // ("creatures your opponents control with flying"), a rider, or a non-opponent scope fails the `$` → low → Arbiter.
  const od = t.match(/^creatures your opponents control get ([+-]\d+)\/([+-]\d+) until end of turn$/);
  if (od) return { op: "pump", scope: "eachOpponentCreature", ptDelta: { p: parseInt(od[1], 10), t: parseInt(od[2], 10) } };
  const ox = t.match(/^(?:until end of turn, )?creatures you control gain (.+?) and get \+x\/\+x(?: until end of turn)?, where x is (.+?)$/);
  if (ox) {
    const kws = parseGrantedKeywords(ox[1]);
    const countSpec = parseCountSource(ox[2].replace(/^the /, "").replace(/^number of /, ""));
    return (kws && countSpec) ? { op: "pump", scope: "youControl", ptDeltaCount: countSpec, grantKeywords: kws } : null;
  }
  // SELF FOR-EACH PUMP (TRIG-PUMP-COUNT) — a count-scaled self-pump: "this creature gets +N/+N until end of
  // turn for each <count source>" (Rampaging Brontodon "+1/+1 … for each land you control"). The detector's
  // SELF_PUMP_IT_RE rewrote the leading "it" → "this creature" (self scope) before this runs. SYMMETRIC +N/+N
  // ONLY (the per-unit multiplier is the SAME for power + toughness): the count × N feeds applyPumpEffect's
  // ptDeltaCount.per path (countForSpec resolves the board count at resolution — CR 608.2h — and the layer-7c
  // pump reads it). An ASYMMETRIC "+2/+0 for each …" (distinct per-stat multipliers) fails this anchor → null →
  // low → Arbiter (a SAFE false-negative — never a mis-scaled stat). count source via parseCountSource (leaf):
  // an unmodeled source ("for each card type among …") → null → low. NEGATIVE per (-N/-N for each) is admitted
  // symmetrically; the lethal-SBA in applyPumpEffect already covers a debuff to 0 toughness.
  m = t.match(/^this creature gets ([+-]\d+)\/([+-]\d+) until end of turn for each (.+)$/);
  if (m && m[1] === m[2]) {
    const countSpec = parseCountSource(m[3]);
    return countSpec ? { op: "pump", target: "self", ptDeltaCount: { ...countSpec, per: parseInt(m[1], 10) } } : null;
  }
  m = t.match(/^this creature gets ([+-]\d+)\/([+-]\d+) until end of turn$/);
  if (m) return { op: "pump", target: "self", ptDelta: { p: parseInt(m[1], 10), t: parseInt(m[2], 10) } };
  m = t.match(/^this creature gets ([+-]\d+)\/([+-]\d+) and gains (.+) until end of turn$/);
  if (m) {
    const kws = parseGrantedKeywords(m[3]);
    return kws ? { op: "pump", target: "self", ptDelta: { p: parseInt(m[1], 10), t: parseInt(m[2], 10) }, grantKeywords: kws } : null;
  }
  m = t.match(/^this creature gains (.+) until end of turn$/);
  if (m) {
    const kws = parseGrantedKeywords(m[1]);
    return kws ? { op: "pump", target: "self", ptDelta: { p: 0, t: 0 }, grantKeywords: kws } : null;
  }
  m = t.match(/^the triggering creature gets ([+-]\d+)\/([+-]\d+) until end of turn$/);
  if (m) return { op: "pump", target: "thatCreature", ptDelta: { p: parseInt(m[1], 10), t: parseInt(m[2], 10) } };
  m = t.match(/^the triggering creature gets ([+-]\d+)\/([+-]\d+) and gains (.+) until end of turn$/);
  if (m) {
    const kws = parseGrantedKeywords(m[3]);
    return kws ? { op: "pump", target: "thatCreature", ptDelta: { p: parseInt(m[1], 10), t: parseInt(m[2], 10) }, grantKeywords: kws } : null;
  }
  m = t.match(/^the triggering creature gains (.+) until end of turn$/);
  if (m) {
    const kws = parseGrantedKeywords(m[1]);
    return kws ? { op: "pump", target: "thatCreature", ptDelta: { p: 0, t: 0 }, grantKeywords: kws } : null;
  }
  // DOUBLE-P/T (CR 701.10 — doubling modifies a value by an amount equal to itself, it doesn't set). A PER-TARGET
  // one-shot doubling: each affected creature gains +its-own-current-power / +its-own-current-toughness (snapshot at
  // resolution), so its P/T becomes 2×. Modeled as a pump atom carrying doublePt ("pt" = both stats, "p" = power
  // only); applyPumpEffect reads each target's LIVE layer-aware P/T inside its loop (distinct from the uniform
  // ptDelta path — every target gets its own delta). Two self-normalized referents reach here cleanly:
  //   • TEAM — "double the power and toughness of each creature you control until end of turn" (Unnatural Growth,
  //     Zopandrel's combat trigger) → scope:"youControl" (controllerCreatureTargets, set locked at resolution).
  //   • SELF — "double this creature's power [and toughness] until end of turn" (Reckless Amplimancer) → target:"self".
  // Whole-clause anchored ($). A "double its …"/"double <Name>'s …" pronoun/name referent (Grunn, Tifa) is NOT
  // self-normalized upstream yet, an "and it gains trample" rider (World War Hulk III), or an "{X} times" form
  // (Exponential Growth) all fail the anchor → null → low → Arbiter (FN-safe, CREED — never a wrong partial).
  if (/^double the power and toughness of each creature you control until end of turn$/.test(t))
    return { op: "pump", scope: "youControl", doublePt: "pt" };
  // BECOME-CREATURE-TYPE (CR 205.1b + 614.12 — the Mistform cycle, 13 corpus carriers): "{1}: This creature
  // becomes the creature type of your choice until end of turn." A layer-4 type change on the SOURCE, not a
  // pump — it REPLACES the printed creature types (Mistform Sliver's "in addition to its other types" is a
  // different sentence and is NOT this arm; it fails the anchor and stays on the Arbiter).
  //
  // The "of your choice" is auto-picked by the shared deterministic policy (choicePolicy.autoPickCreatureType
  // — the same one the ETB choosers use, so the engine can never pick two different types on one board).
  // Whole-clause anchored ($): an "in addition to" variant, an ENCHANTED-creature subject (Mistform Mask) or
  // any rider fails → null → low → Arbiter (FN-safe).
  if (/^this creature becomes the creature type of your choice until end of turn$/.test(t))
    return { op: "become-creature-type", target: "self", targetType: null };
  if (/^double this creature's power and toughness until end of turn$/.test(t))
    return { op: "pump", target: "self", doublePt: "pt" };
  if (/^double this creature's power until end of turn$/.test(t))
    return { op: "pump", target: "self", doublePt: "p" };
  return null;
}

/**
 * COND-X TEAM PUMP clause parser (Finale of Devastation) — "If X is N or more, creatures you control get
 * +X/+X and gain KW until end of turn". The team pump (scope youControl, amountX → ctx.xValue scales BOTH
 * pips) is GATED on the chosen X reaching the threshold: applyPumpEffect no-ops the whole pump (adds NO
 * continuous effects) when ctx.xValue < condX.min — so an X below the threshold does exactly nothing, exactly
 * as printed (CR — the conditional simply isn't met). The " and gain <KW>…" grant is optional and ALL-OR-
 * NOTHING via parseGrantedKeywords (leaf); an un-grantable keyword → null → low → Arbiter. Only "+X/+X" (the
 * spell's chosen {X}, symmetric both pips) is admitted here — a FIXED "+N/+N" or a BOARD-scaled "where X is …"
 * form is NOT this shape (never reaches this anchor). Whole-clause anchored ($): any rider / non-youControl
 * scope fails → null → low → Arbiter (CREED, FN-safe — never a wrong partial). Pure (no parser.js import).
 * Registered via registerClauseParser in parser.js AFTER pumpClauseParser (disjoint anchors — the "if x is …"
 * prefix never matches a bare pump).
 */
export function condPumpXClauseParser(clause, ctx = {}) {
  if (!ctx.hasX) return null; // "+X/+X" scales with the spell's {X} — only meaningful on an {X}-cost spell
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  const m = t.match(/^if x is (\d+) or more, creatures you control get \+x\/\+x(?: and gain (.+))? until end of turn$/);
  if (!m) return null;
  const kws = m[2] ? parseGrantedKeywords(m[2]) : null;
  if (m[2] && !kws) return null; // an un-grantable keyword drops the whole clause → low → Arbiter
  return {
    op: "pump",
    scope: "youControl",
    amountX: true, // +X/+X — both pips = ctx.xValue (applyPumpEffect)
    condX: { min: parseInt(m[1], 10) }, // gate: applied only when ctx.xValue >= min (CR — the "If X is N or more" condition)
    ...(kws ? { grantKeywords: kws } : {}),
    targetType: null,
  };
}

/**
 * GROUP-KEYWORD-GRANT keyword vocab — the shared static-grant set (combat keywords + indestructible +
 * hexproof + shroud; STATIC-HEXPROOF-SHROUD admitted those last two once their enforcement was proven
 * complete + layer-aware). ALL-OR-NOTHING: one unmodeled word (protection from …, an ability word, a
 * non-keyword) drops the whole clause → Arbiter (FN-safe).
 */
const GROUP_GRANTABLE_KEYWORDS = GRANTABLE_STATIC_KEYWORDS;
const GROUP_KEYWORD_CANON = { indestructible: "Indestructible", hexproof: "Hexproof", shroud: "Shroud" };
function parseGroupGrantKeywords(phrase) {
  const words = String(phrase).split(/,|\band\b/).map((w) => w.trim()).filter(Boolean);
  if (words.length === 0) return null;
  const out = [];
  for (const w of words) {
    const lw = w.toLowerCase();
    if (!GROUP_GRANTABLE_KEYWORDS.has(lw)) return null;
    out.push(GROUP_KEYWORD_CANON[lw] || canonicalCombatKeyword(lw));
  }
  return out;
}

/**
 * GROUP-KEYWORD-GRANT clause parser — "(creatures|permanents) you control gain <keyword[ and keyword]> until
 * end of turn" (Crash Through, Unbreakable Formation, Heroic Intervention). Whole-clause anchored: a rider
 * (Addendum/populate/2nd sentence), a color-choice (protection from the chosen color), a filter (white/Sliver
 * creatures you control), or an un-grantable keyword fails the `$` / the keyword gate → null → Arbiter (CREED,
 * FN-safe). Emits a scope-bearing atom (no targetType → non-targeting → no chosen target). Pure (no parser.js
 * import). Registered via registerClauseParser in parser.js.
 */
export function groupGrantClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  const m = t.match(/^(creatures|permanents) you control gains? (.+) until end of turn$/);
  if (!m) return null;
  // PROTECTION-FROM-EACH-COLOR tail (Akroma's Will mode B — "… gain lifelink, indestructible, and
  // protection from each color until end of turn", CR 702.16 + 702.16j "each color" = all five): peel the
  // EXACT trailing phrase, then the remaining list must still be all-grantable keywords. Granted via a
  // layer-6 addProtection (colors WUBRG) in the resolver — the SAME live readers printed protection uses
  // (targeting CR 702.16b · block 702.16f · damage prevention 702.16e), so the grant is enforced, not
  // parse-only. A "protection from the chosen color"/single-color variant doesn't match the anchor →
  // null → Arbiter (CREED).
  let protAllColors = false;
  let phrase = m[2];
  const pm = phrase.match(/^(.+?),? and protection from each color$/);
  if (pm) { protAllColors = true; phrase = pm[1]; }
  const kws = parseGroupGrantKeywords(phrase);
  if (!kws) return null;
  return {
    op: "grant-keywords-group",
    scope: m[1] === "permanents" ? "permanentsYouControl" : "creaturesYouControl",
    grantKeywords: kws,
    ...(protAllColors && { grantProtectionAllColors: true }),
  };
}

/**
 * ANIMATE clause parser (WALT-ANIMATE) — migrated from parser.js parseExtendedAtom (seam batch 14 / Wave C),
 * verbatim. TWO adjacent blocks, order preserved:
 *   anm — "[until end of turn,] target land becomes a N/N [subtype] creature [with KW[ and KW]]" (Animate
 *         Land / Hydroform / Vivify). layer-4 type-ADD + layer-7b P/T-SET + layer-6 grants, all endOfTurn.
 *         REQUIRES until-end-of-turn (prefix or suffix); a permanent animate / color-set / un-grantable
 *         keyword fails → null → Arbiter.
 *   anmSelf — MAN-LAND self-animate "[until end of turn,] this land becomes a N/N <colors/subtypes/types>
 *         creature [with KW[ and KW]] [until end of turn]" (Treetop Village, the Restless cycle). The middle
 *         tokens are colors (layer 5) / artifact|enchantment (layer 4) / creature subtypes (layer 4); an
 *         unrecognized middle token, un-grantable keyword, or permanent animate → null → Arbiter.
 * Both REQUIRE until-end-of-turn (the modeled subset). Pure; uses parseGrantedKeywords from the leaf.
 * Registered via registerClauseParser in parser.js.
 */
export function animateClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  // The "you control" qualifier (Kamahl, Heart of Krosa "{1}{G}: Until end of turn, target land you
  // control becomes a 1/1 Elemental creature with …") RESTRICTS the target to the controller's own lands
  // (CR 601.2c). Captured as anm[2] and emitted as a controller:"you" restriction so the enumerator
  // (enumerateTargets → creatureSatisfiesRestrictions) only offers your OWN lands — never an opponent's,
  // which would be an illegal target (a forbidden FP). The unqualified "target land" (Animate Land) keeps
  // its any-land targeting (no restriction).
  const anm = t.match(/^(until end of turn, )?target land( you control)? becomes a (\d+)\/(\d+)(?: ([a-z]+))? creature(?: with ([a-z, ]+?))?(?: in addition to its other types)?( until end of turn)?$/);
  if (anm) {
    if (!anm[1] && !anm[7]) return null;  // a PERMANENT animate (no until-end-of-turn) is not modeled → Arbiter
    const COLOR_WORDS = new Set(["white", "blue", "black", "red", "green", "colorless", "multicolored"]);
    if (anm[5] && COLOR_WORDS.has(anm[5])) return null;  // "becomes a black creature" SETS color (layer 5) — not modeled → Arbiter
    const grantKeywords = anm[6] ? parseGrantedKeywords(anm[6]) : [];
    if (anm[6] && !grantKeywords) return null;  // an un-grantable rider keyword drops the whole clause → Arbiter
    const subtypes = anm[5] ? [anm[5].charAt(0).toUpperCase() + anm[5].slice(1)] : [];
    const atom = { op: "animate", targetType: "land", power: parseInt(anm[3], 10), toughness: parseInt(anm[4], 10), subtypes, grantKeywords, duration: "endOfTurn" };
    if (anm[2]) atom.restrictions = [{ kind: "controller", who: "you" }]; // "land you control" — enumerate own lands only
    return atom;
  }
  const anmSelf = t.match(/^(until end of turn, )?this land becomes a (\d+)\/(\d+) (.*?)creature(?: with ([a-z, ]+?))?(?: in addition to its other types)?( until end of turn)?$/);
  if (anmSelf) {
    if (!anmSelf[1] && !anmSelf[6]) return null;  // a PERMANENT animate (no until-end-of-turn) → Arbiter
    const COLOR_MAP = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
    const capHyphen = (w) => w.split("-").map(p => p.charAt(0).toUpperCase() + p.slice(1)).join("-");
    const colors = [], subtypes = [], cardTypes = [];
    let ok = true;
    for (const w of (anmSelf[4] || "").trim().split(/\s+/).filter(x => x && x !== "and")) {
      if (COLOR_MAP[w]) colors.push(COLOR_MAP[w]);
      else if (w === "artifact" || w === "enchantment") cardTypes.push(capHyphen(w));
      else if (/^[a-z][a-z-]*$/.test(w)) subtypes.push(capHyphen(w));  // a creature subtype (Ape / Faerie / Assembly-Worker)
      else { ok = false; break; }  // an unrecognized middle token — don't risk a mis-model → Arbiter
    }
    if (!ok) return null;
    const grantKeywords = anmSelf[5] ? parseGrantedKeywords(anmSelf[5]) : [];
    if (anmSelf[5] && !grantKeywords) return null;  // un-grantable rider (menace/infect/"all creature types") → Arbiter
    return { op: "animate", target: "self", power: parseInt(anmSelf[2], 10), toughness: parseInt(anmSelf[3], 10), colors, subtypes, cardTypes, grantKeywords, duration: "endOfTurn" };
  }
  return null;
}

/**
 * ===== SET-BASE-PT-TEAM (Biomass Mutation) ===== "Creatures you control have base power and toughness X/X
 * until end of turn." A layer-7b base-P/T SET (CR 613.4b — overwrites base P/T, BELOW +1/+1 counters in 7c
 * and switches in 7d) applied to EVERY creature the controller controls, value = the chosen X (ctx.xValue).
 * The set is per-creature fixed AT RESOLUTION (CR 611.2c — the affected set is locked when the one-shot
 * begins, not re-evaluated as creatures enter later), so it mirrors the team-pump gatherer. endOfTurn → worn
 * off at cleanup (CR 514.2). A 0/0 set (X=0) drops every creature's toughness to 0 → the lethal SBA wipes the
 * controller's board (CR 704.5f) — faithful (Biomass Mutation for X=0 is a one-sided board wipe). Reuses the
 * SAME layer machinery + lethal SBA as applyAnimateEffect's 7b set.
 */
export function applySetBasePtTeam(state, atom, ctx) {
  let next = state;
  const value = Math.max(0, atom.amountX ? (ctx.xValue || 0) : (atom.value || 0));
  const player = next.players?.[ctx.controller];
  if (!player) return next;
  // The controller's creatures, locked at resolution (CR 611.2c). Read the type line directly (a base-P/T set
  // hits every creature you control — no subtype/other filter for the modeled forms).
  const targets = (player.battlefield || []).filter((perm) => /\bCreature\b/.test(typeLineStr(perm.card))).map((perm) => perm.id);
  const src = { kind: "resolution", permanentId: null, cardName: ctx.cardName || null };
  const dur = () => ({ kind: "endOfTurn", turn: next.turn });
  for (const id of targets) {
    next = addContinuousEffect(next, {
      layer: 7, sublayer: "7b",
      op: { layerOp: "ptSet", power: value, toughness: value },
      affects: { mode: "fixed", permanentIds: [id] },
      duration: dur(), source: src,
    }).state;
  }
  // A 0/0 set (X=0) is lethal → run the SBA so those creatures die at resolution (CR 704.5f), mirroring pump/animate.
  const lethal = destroyLethalCreatures(next);
  next = checkDiesTriggers(lethal.state, lethal.dead);
  return logEvent(next, { kind: "spell-effect", effect: "set-base-pt-team", value, targets });
}

/**
 * SET-BASE-PT-TEAM clause parser — "creatures you control have base power and toughness X/X until end of turn"
 * (Biomass Mutation). The {X} cost spell's chosen X sets every controlled creature's base P/T (layer 7b). Only
 * the X/X form is modeled (a literal "N/N" team base-set is a fast-follow, not in the breakage set); a filter
 * ("nonland creatures you control"), a different scope, or a rider fails the `$` anchor → null → low → Arbiter
 * (CREED). hasX-gated by the caller (the clause carries the literal "x/x"). Pure. Registered via registerClauseParser.
 */
export function setBasePtTeamClauseParser(clause, ctx = {}) {
  if (!ctx.hasX) return null; // only an {X}-cost spell sets X/X here (the literal "x/x" comes from the cost)
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  if (/^creatures you control have base power and toughness x\/x until end of turn$/.test(t)) {
    return { op: "set-base-pt-team", scope: "youControl", amountX: true };
  }
  return null;
}

/**
 * ===== SET-BASE-PT-TARGET (BLITZ SU-1 — Diminish 1/1, Square Up 4/4) ===== "Target creature has base
 * power and toughness N/N until end of turn." The single-CHOSEN-TARGET twin of the team form above: the
 * SAME layer-7b base-P/T SET (CR 613.3b/613.4a — overwrites the printed base, BELOW +1/+1 counters and
 * anthems in 7c and switches in 7d, so a Diminished 1/1 with a +1/+1 counter is a 2/2), fixed to the one
 * chosen creature, endOfTurn (worn off at cleanup, CR 514.2). The target resolves through the standard
 * atomTargets/ctx.targets path (the pump precedent), a departed target fizzles (CR 608.2b), and the
 * lethal SBA runs at resolution — already-MARKED damage can turn lethal against the new base (a 5/5
 * carrying 3 damage set to 1/1 dies on the spot, CR 704.5g).
 */
export function applySetBasePtTarget(state, atom, ctx) {
  let next = state;
  const src = { kind: "resolution", permanentId: null, cardName: ctx.cardName || null };
  const applied = [];
  for (const target of atomTargets(next, atom, ctx)) {
    if (target.type !== "creature" || !findPermanent(next, target.id)) continue; // CR 608.2b — a departed target fizzles
    next = addContinuousEffect(next, {
      layer: 7, sublayer: "7b",
      op: { layerOp: "ptSet", power: atom.power, toughness: atom.toughness },
      affects: { mode: "fixed", permanentIds: [target.id] },
      duration: { kind: "endOfTurn", turn: next.turn },
      source: src,
    }).state;
    applied.push(target.id);
  }
  const lethal = destroyLethalCreatures(next); // marked damage ≥ the new toughness kills at resolution (CR 704.5g)
  next = checkDiesTriggers(lethal.state, lethal.dead);
  return logEvent(next, { kind: "spell-effect", effect: "set-base-pt-target", power: atom.power, toughness: atom.toughness, targets: applied });
}

/**
 * SET-BASE-PT-TARGET clause parser — the literal-N/N single-target form ONLY ("Target creature has base
 * power and toughness 1/1 until end of turn"). A scope variant ("…you don't control"), a rider ("…and
 * loses all abilities" — Turn to Frog class), or a missing duration fails the `$`/exact anchor → null →
 * low → Arbiter (CREED: ability-losing variants must never half-apply as a bare P/T set). Pure.
 * Registered via registerClauseParser next to the team form.
 */
export function setBasePtTargetClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  const m = t.match(/^target creature has base power and toughness (\d+)\/(\d+) until end of turn$/);
  if (m) return { op: "set-base-pt-target", targetType: "creature", power: parseInt(m[1], 10), toughness: parseInt(m[2], 10) };
  return null;
}

/**
 * FIGHT-FAMILY clause parser (seam batch S1 — migrated verbatim out of parseClauseToAtom's inline dispatch;
 * the resolvers fightCreature / applyFightPair / applyDamageTargetPower / applyDamageSelfPower already live in
 * THIS module). FIRST-MATCH ORDER preserved from the inline blocks: bare source-bound → source-bound "another"
 * → the two-chosen-target fight-pair forms (a/b/c/d) → source-power-fanout. Each form is whole-clause anchored
 * (`$`) so any rider leaves residue → null → low → Arbiter (CREED — never a mis-wired or half-modeled fight).
 *
 * ===== ETB-FIGHT (CR 701.12) ===== "[this creature|it] fights (up to one) target creature you don't
 * control" (Kogla, Apex Altisaur, Kogla and Yidaro modal). The SOURCE creature and the chosen creature
 * each deal damage equal to their power to the other, simultaneously (resolver fightCreature). The head
 * is accepted DIRECTLY here ("it" / "this creature") — triggers.js' it→this-creature rewrite is NOT
 * touched. ANCHORED to the bare "creature you don't control" form: "another target creature" (Ulvenwald
 * Tracker — needs a SECOND chosen creature, not the source), a "target creature you control" (Prey
 * Upon's own-side half), or any rider leaves residue → fails the `$` anchor → low → Arbiter, never a
 * mis-wired one-sided fight. restrictions:{controller:opponent} so atomTargets/enumeration only offers
 * an enemy creature; optionalTarget for "up to one" (0-or-1, declinable → clean no-op).
 *
 * ===== ETB-FIGHT — SOURCE-BOUND "ANOTHER" (CR 701.12) ===== "[this creature|it] fights another target
 * creature" (Brash Taunter's activated ability, Territorial Allosaurus' kicked-ETB, Atzocan Archer's
 * "you may have it fight …", Nessian Wilds Ravager's tribute if-not). DISTINCT shape from the fight-pair
 * forms: the subject is the SOURCE ("this creature"|"it" → fighter = ctx.sourceId, resolver
 * fightCreature), NOT a chosen "target creature you control" (the fight-pair (d) Ulvenwald Tracker case,
 * which starts with "target creature" and can never reach this source-anchored head). "another" (CR
 * 701.12) means the dealee must be DISTINCT from the source — modeled by restrictions:{controller:opponent}
 * (the source is the controller's, so an opponent-only enumeration EXCLUDES it; the cast/flush chooser
 * also aims an enemy via atomTargetIntent→"enemy"). Narrowing the dealee to enemies is a SAFE
 * false-negative vs the strict CR "any other creature" (you'd never choose to fight your own creature),
 * and fightCreature additionally skips a source==target id (defense in depth). The causative head
 * "have [this creature|it] fight another target creature" is the inner of "you may have it fight …" after
 * α2 peels the "you may" wrapper (parseClauseToAtom recurses; α2 then stamps optional:true) — Atzocan
 * Archer / Nessian Wilds Ravager. fightAtomMisplaced still forces the WHOLE program LOW unless this fight
 * is the SOLE atom (no half-resolve).
 *
 * ===== FIGHT-PAIR / DAMAGE-TARGET-POWER (CR 701.12 / 119) ===== the TWO-CHOSEN-TARGET forms — the
 * SPELL/activated shape where the FIGHTER (the dealer) is itself a chosen target, NOT the source:
 *   "Target creature you control fights target creature you don't control"            (Prey Upon, Pounce)
 *   "Target creature you control deals damage equal to its power to target creature you don't control"
 *                                                                                       (Aggressive Instinct, Rabid Bite)
 *   "Target creature fights another target creature"  (any-side, distinct)             (Clash of Titans, Blood Feud)
 * The atom carries TWO target specs: the PRIMARY (the enemy "you don't control" — role "target") plus a
 * `secondaryTargetType`/`secondaryRestrictions`/`secondaryRole:"fighter"` for the dealer ("you control").
 * expandAtoms enumerates BOTH (cartesian, DISTINCT ids), the AI cast-path aims a real fighter at a killable
 * enemy, and the resolver (applyFightPair / applyDamageTargetPower) reads the fighter from the role-tagged
 * target. The enemy half is worded "you don't control" OR the equivalent "an opponent controls" — both pin
 * the target to an opponent's creature (CR 109.5 / 702 — same controller restriction). The optional "up to
 * one" (Smell Fear) makes the ENEMY a 0-or-1 target (CR 115.1b) — the controller's creature (the secondary
 * fighter) is still mandatory; applyFightPair treats a declined enemy as a clean no-op.
 *
 * ===== SOURCE-POWER-FANOUT (Chandra's Ignition) ===== "Target creature you control deals damage equal to
 * its power to each other creature and each opponent." The CHOSEN target creature (you control) is the
 * damage SOURCE; the amount is THAT creature's layer-aware power at resolution; the damage fans out to every
 * OTHER creature on every battlefield (excluding the source — "each other creature") AND every opponent (CR
 * — "each opponent"). One chosen target (the source) + an auto fan-out, so targetType:"creature" (a chosen
 * target) with the controller:you restriction; the resolver reads the chosen creature's power and hits the
 * rest. A rider / a different scope ("each other creature and each player", "any target") leaves residue →
 * no match → low → Arbiter (CREED — never a mis-scoped or fixed-amount fan-out).
 */
export function fightClauseParser(clause) {
  const s = String(clause || "");
  // (1) bare source-bound: "[this creature|it] fights (up to one) target creature you don't control"
  {
    const fm = s.toLowerCase().replace(/[’]/g, "'")
      .match(/^(?:this creature|it) fights (up to one )?target creature you don't control$/);
    if (fm) return { op: "fight", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }], optionalTarget: !!fm[1] };
  }
  // (2) source-bound "another": "[have ]?[this creature|it] fight(s) another target creature"
  {
    const fa = s.toLowerCase().replace(/[’]/g, "'")
      .match(/^(?:have (?:this creature|it) fight|(?:this creature|it) fights) another target creature$/);
    if (fa) return { op: "fight", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }], optionalTarget: false, distinct: true };
  }
  // (3) the two-chosen-target forms (a/b/c/d — first-match order preserved from the inline dispatch)
  {
    const t = s.toLowerCase().replace(/[’]/g, "'").replace(/\.$/, "");
    const ENEMY = "target creature (?:you don't control|an opponent controls)";
    // (a) "target creature you control fights [up to one] target creature you don't control / an opponent controls"
    let m = t.match(new RegExp(`^target creature you control fights (up to one )?${ENEMY}$`));
    if (m) return {
      op: "fight-pair", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }], role: "target",
      secondaryTargetType: "creature", secondaryRestrictions: [{ kind: "controller", who: "you" }], secondaryRole: "fighter",
      ...(m[1] ? { optionalTarget: true } : {}),
    };
    // (a2) THE MIRROR OF (a) — "UP TO ONE target creature YOU CONTROL fights target creature an opponent
    // controls" (Earth Rumble's reflexive half). (a) already reads "up to one" on the ENEMY; the same
    // qualifier on the FIGHTER had no arm, so the whole card fell to LOW. Another instance of the
    // missing-sibling shape: a modifier supported on one side of a pair and never applied to the other.
    //
    // The optionality rides on the SECONDARY (fighter) half here, so it needs its own flag —
    // `optionalTarget` is wired to the primary in targeting.js and reusing it would make the ENEMY
    // declinable instead, which is a different card. applyFightPair already no-ops symmetrically on a
    // missing fighter OR target, so a declined fighter needs nothing further.
    m = t.match(new RegExp(`^up to one target creature you control fights ${ENEMY}$`));
    if (m) return {
      op: "fight-pair", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }], role: "target",
      secondaryTargetType: "creature", secondaryRestrictions: [{ kind: "controller", who: "you" }], secondaryRole: "fighter",
      secondaryOptionalTarget: true,
    };
    // (b) "target creature you control deals damage equal to its power to target creature you don't control" (one-way)
    m = t.match(new RegExp(`^target creature you control deals damage equal to its power to ${ENEMY}$`));
    if (m) return {
      op: "damage-target-power", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }], role: "target",
      secondaryTargetType: "creature", secondaryRestrictions: [{ kind: "controller", who: "you" }], secondaryRole: "fighter",
    };
    // (b2) the BITE union (BLITZ JB-1 — Bite Down / Hard-Hitting Question / Master's Rebuke): the dealee may
    // be a creature OR planeswalker. Same one-way resolver; a planeswalker dealee routes through the shared
    // applyDamageEffect pw path (damage → loyalty loss, CR 120.3c).
    m = t.match(/^target creature you control deals damage equal to its power to target creature or planeswalker (?:you don't control|an opponent controls)$/);
    if (m) return {
      op: "damage-target-power", targetType: "creatureOrPlaneswalker", restrictions: [{ kind: "controller", who: "opponent" }], role: "target",
      secondaryTargetType: "creature", secondaryRestrictions: [{ kind: "controller", who: "you" }], secondaryRole: "fighter",
    };
    // (c) "target creature fights another target creature"  (any-side, the two must be DISTINCT — CR 701.12)
    m = t.match(/^target creature fights another target creature$/);
    if (m) return {
      op: "fight-pair", targetType: "creature", restrictions: [], role: "target",
      secondaryTargetType: "creature", secondaryRestrictions: [], secondaryRole: "fighter", distinct: true,
    };
    // (d) "target creature you control fights another target creature" (Ulvenwald Tracker) — the FIGHTER is
    // yours; the dealee is ANY OTHER creature ("another" → distinct, CR 701.12). The dealee carries no
    // controller restriction (it may legally be your own), but the cast-path AI still aims it at an enemy
    // (its two-target chooser only offers the enemy as the `target` role) and a human picks interactively.
    m = t.match(/^target creature you control fights another target creature$/);
    if (m) return {
      op: "fight-pair", targetType: "creature", restrictions: [], role: "target",
      secondaryTargetType: "creature", secondaryRestrictions: [{ kind: "controller", who: "you" }], secondaryRole: "fighter", distinct: true,
    };
  }
  // (4) source-power-fanout: "target creature you control deals damage equal to its power to each other creature and each opponent"
  {
    const fo = s.toLowerCase().replace(/[’]/g, "'").replace(/\.$/, "");
    if (/^target creature you control deals damage equal to its power to each other creature and each opponent$/.test(fo)) {
      return { op: "source-power-fanout", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }] };
    }
  }
  return null;
}

/**
 * PREVENT-NEXT-DAMAGE (BLITZ PV-1, CR 615) — push a floating this-turn prevention shield for the chosen
 * target (any target: creature / player / planeswalker) or the controller ("…dealt to you"). The shield
 * lives in state.preventionShields (plain JSON, self-expiring by turn stamp); the two damage paths
 * consume it before a hit lands. A vanished target shields nobody (a clean no-op, never fabricated).
 */
function applyPreventNextDamage(state, atom, ctx) {
  let next = state;
  const entries = [];
  if (atom.who === "you") {
    if (next.players?.[ctx.controller]) entries.push({ targetKind: "player", targetId: ctx.controller });
  } else {
    for (const t of ctx.targets || []) {
      if (t.type === "player" && next.players?.[t.id]) entries.push({ targetKind: "player", targetId: t.id });
      else if ((t.type === "creature" || t.type === "planeswalker") && findPermanent(next, t.id)) entries.push({ targetKind: t.type, targetId: t.id });
    }
  }
  for (const e of entries) next = addPreventionShield(next, { ...e, amount: atom.amount, turn: next.turn });
  return logEvent(next, { kind: "spell-effect", effect: "prevent-next-damage", controller: ctx.controller, amount: atom.amount, shielded: entries.map((e) => e.targetId) });
}

/**
 * GUSTCLOAK ESCAPE (BLITZ GC-1, CR 506.4 / 510.1c-d) — untap the trigger's SOURCE creature and remove it
 * from combat. Fired by the becomes-blocked trigger's resolution (declare-blockers step — the trigger
 * resolves BEFORE any combat-damage step, CR 603.3b). Removal is TWO coordinated writes, both faithful to
 * this engine's combat model:
 *   • the `removedFromCombat` flag (the CR 701.19 regeneration vehicle, cleared at end-of-combat by
 *     clearRemovedFromCombatFlags) — combatResolution's `combatant()` gate then skips the creature as a
 *     damage dealer AND receiver;
 *   • its record is dropped from state.combat.attackers — so it stops being an ATTACKING creature for every
 *     scope read (CR 506.4: "stops being an attacking … creature"; an "attacking creatures get …" team pump
 *     resolving after the escape must not include it), and combatResolution's blocker-deals-back loop
 *     (which iterates combat.attackers) never lets its former blockers deal damage — exactly CR 510.1d
 *     ("a blocking creature … not currently blocking any creatures … assigns no combat damage").
 * Its BLOCKER records are deliberately KEPT: CR 506.4 removes only THIS creature from combat — the creatures
 * that were blocking it remain blocking creatures (a "blocking creatures get +0/+5" team pump still includes
 * them); with the attacker record gone they simply never deal or take combat damage. A source that already
 * LEFT the battlefield (killed in response) → atomTargets' self referent is [] → clean no-op (CR 608.2b);
 * one no longer among the attackers (combat already ended/blanked) → untap only, "remove from combat" is
 * vacuous — never a stray flag outside combat.
 */
export function applyUntapRemoveFromCombat(state, atom, ctx) {
  let next = state;
  const escaped = [];
  for (const t of atomTargets(state, atom, ctx)) {
    if (!findPermanent(next, t.id)) continue;
    next = untapPermanent(next, t.id);
    if ((next.combat?.attackers || []).some((a) => a?.permanentId === t.id)) {
      next = updatePermanentSafe(next, t.id, (p) => ({ ...p, removedFromCombat: true }));
      next = { ...next, combat: { ...next.combat, attackers: next.combat.attackers.filter((a) => a?.permanentId !== t.id) } };
    }
    escaped.push(t.id);
  }
  if (escaped.length) next = checkUntapTriggers(next); // BECOMES-UNTAPPED (Mesmeric Orb): drain the recorded transitions
  return logEvent(next, { kind: "spell-effect", effect: "untap-remove-from-combat", targets: escaped });
}

export const combatResolvers = {
  "untap-earthbent-land": applyUntapEarthbentLand, // the ", then untap that land" tail of an earthbend (Avatar Kyoshi) — reads the earthbendLandId stamp
  "fight": fightCreature, // ETB-FIGHT (CR 701.12) — source + target creature deal damage = power to each other, simultaneously
  "prevent-next-damage": applyPreventNextDamage, // PV-1 (CR 615) — floating this-turn prevent-the-next-N shield
  "set-base-pt-team": applySetBasePtTeam, // SET-BASE-PT-TEAM (Biomass Mutation) — team layer-7b base-P/T set to X/X until end of turn
  "set-base-pt-target": applySetBasePtTarget, // SET-BASE-PT-TARGET (BLITZ SU-1 — Diminish / Square Up) — chosen-target layer-7b base-P/T set to N/N until end of turn
  "pump": (state, atom, ctx) => applyPumpEffect(state, atom, ctx),
  "animate": (state, atom, ctx) => applyAnimateEffect(state, atom, ctx),
  "earthbend": applyEarthbend, // EARTHBEND N (Toph) — permanently animate a land you control + N +1/+1 counters
  "become-creature-type": applyBecomeCreatureType, // BECOME-CREATURE-TYPE (CR 205.1b, the Mistform cycle) — layer-4 endOfTurn type REPLACE on the source, chosen by the shared auto-pick policy
  "regenerate": applyRegenerate, // REGEN (CR 701.19) — set a regeneration shield on self / target creature
  "tap": (state, atom, ctx) => applyTapEffect(state, atom, ctx, true),
  "untap": (state, atom, ctx) => applyTapEffect(state, atom, ctx, false),
  "untap-lands": applyUntapLands, // UNTAP-UP-TO-N-LANDS (Finale of Revelation) — deterministic greedy untap of up to N of the controller's own tapped lands, condX-gated
  "untap-remove-from-combat": applyUntapRemoveFromCombat, // GUSTCLOAK ESCAPE (GC-1, CR 506.4/510.1c-d) — untap the trigger source + remove it from combat (flag + attacker-record drop; blockers stay in combat, deal nothing)
  "cant-block": applyCantBlock, // CANT-BLOCK — "target creature can't block this turn" → layer-6 endOfTurn cantBlock grant
  "cant-be-blocked": applyCantBeBlocked, // CANT-BE-BLOCKED — "target creature can't be blocked this turn" → layer-6 endOfTurn unblockable grant
  "mass-block-lock": applyMassBlockLock, // MASS-BLOCK-LOCK (FT-1) — "creatures [without flying] can't block this turn" → ONE dynamic-selector layer-6 endOfTurn cantBlock rule (CR 611.2c)
  "switch-pt": applySwitchPT, // SWITCH-PT — "switch ~ power and toughness until end of turn" → layer-7 sublayer-7d endOfTurn swap
  "grant-keywords-group": applyGrantKeywordsGroup, // GROUP-KEYWORD-GRANT — "(creatures|permanents) you control gain KW until end of turn"
  "damage-self-power": applyDamageSelfPower, // SELF-DAMAGE-BY-POWER — "target/each creature deals damage to itself equal to its power"
  "fight-pair": applyFightPair, // FIGHT-PAIR (CR 701.12) — two CHOSEN creatures (fighter + target) deal damage = power to each other, simultaneously
  "damage-target-power": applyDamageTargetPower, // DAMAGE-TARGET-POWER (CR 119) — one-way: only the chosen fighter deals damage = its power to the chosen target
  "pump-pair": applyPumpPair, // PUMP-PAIR — two chosen creatures: fighter gets +buff, target gets -debuff (Leeching Bite / Consume Strength / Schismotivate)
};
