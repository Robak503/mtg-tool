/**
 * effects/atoms/combat.js — combat / P-T / animation atoms (fight, pump, animate, earthbend, tap, untap,
 * regenerate). Hosts applyTapEffect (tap/untap).
 */

import { addContinuousEffect, permanentIsCreature, permanentHasKeyword } from "../../layers.js";
import { logEvent, destroyLethalCreatures, findPermanent, tapPermanent, untapPermanent, addCounter, addRegenShield, creaturePower, markCombatDamage } from "../../gameState.js";
import { checkDiesTriggers } from "../../triggers.js";
import { atomTargets, countForSpec, typeLineStr } from "./shared.js";
import { SMALL_NUM, parseCountSource, parseGrantedKeywords, COUNT_SUBTYPE } from "../parseHelpers.js"; // seam batch 5/12c: shared parse helpers (leaf, cycle-free)
import { GRANTABLE_STATIC_KEYWORDS, canonicalCombatKeyword } from "../../keywords.js"; // GROUP-KEYWORD-GRANT vocab (keywords.js is a zero-import leaf — cycle-safe)

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
  const wantsPermanent = atom?.targetType === "permanent";
  const wantsBasicSubtype = BASIC_SUBTYPE_TARGET.has(atom?.targetType);
  for (const t of ctx.targets || []) {
    const lk = findPermanent(next, t.id);
    if (!lk) continue;
    const tl = typeLineStr(lk.permanent.card);
    const isLand = /\bland\b/i.test(tl);
    // UNTAP-LAND: only act on a land target (verified live). UNTAP-BASIC-SUBTYPE: only a land of the named
    // basic subtype (verified live). TAP-PERMANENT: act on ANY live permanent. CREATURE form: a creature.
    const ok = wantsBasicSubtype
      ? isLand && new RegExp(`\\b${cap(atom.targetType)}\\b`).test(tl)
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
  }
  return logEvent(next, { kind: "spell-effect", effect: tap ? "tap" : "untap", targets: (ctx.targets || []).map(t => t.id) });
}

/** REGEN (CR 701.15) — give the SOURCE (self) or the chosen creature a regeneration shield. The shield is
 * consumed at the next would-destroy (the lethal-damage SBA / the destroy effect), which clears damage + taps
 * the creature so it survives. No magnitude (one clause → one shield per target); atomTargets resolves "self"
 * to the source creature and "creature" to ctx.targets, exactly like the +1/+1-counter atom. */
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
  // X-pump ("+X/+X until end of turn") binds both pips to the chosen X (ctx.xValue);
  // a fixed pump reads its printed ptDelta.
  const x = ctx.xValue || 0;
  // OVERRUN-X — a count-scaled team pump locks +X/+X to a BOARD COUNT at resolution (CR 608.2h), e.g.
  // Overwhelming Stampede's "greatest power among creatures you control". Computed from `state` (pre-pump,
  // before the loop below adds any P/T effect), so X reads the un-buffed board. Takes precedence over the
  // X-cost pump (amountX → ctx.xValue) and the printed ptDelta; 0 (empty board) is a valid +0/+0, not null.
  const scaled = atom.ptDeltaCount ? Math.max(0, countForSpec(state, ctx, atom.ptDeltaCount)) : null;
  // amountX → the chosen X (ctx.xValue) scales the pump. amountXSlot ("p"/"t") marks WHICH stat is the
  // +X for an ASYMMETRIC X-pump ("+X/+0" → slot "p", "+0/+X" → slot "t"); the OTHER stat reads its
  // printed ptDelta. An absent slot = symmetric +X/+X (both stats = X) — the original behavior.
  const xP = atom.amountX && (!atom.amountXSlot || atom.amountXSlot === "p");
  const xT = atom.amountX && (!atom.amountXSlot || atom.amountXSlot === "t");
  const power = scaled != null ? scaled : (xP ? x : atom.ptDelta?.p || 0);
  const toughness = scaled != null ? scaled : (xT ? x : atom.ptDelta?.t || 0);
  // Chosen targets for a single-creature pump (Giant Growth), EVERY creature for a mass
  // "All creatures get -X/-X until end of turn" (atom.targetType "eachCreature" — Infest /
  // Languish), or the controller's creatures for a TEAM pump (atom.scope "youControl" — Overrun
  // / Trumpet Blast; the set locked at resolution, CR 611.2c). Each becomes a per-creature fixed
  // layer effect below, so the keyword-grant + lethal-SBA machinery is shared across all three.
  const targets = atomTargets(state, atom, ctx);
  const src = { kind: "resolution", permanentId: null, cardName: ctx.cardName || null };
  const dur = () => ({ kind: "endOfTurn", turn: next.turn });
  for (const target of targets) {
    if (target.type !== "creature") continue;
    if (power !== 0 || toughness !== 0) {
      next = addContinuousEffect(next, {
        layer: 7, sublayer: "7c",
        op: { layerOp: "ptModify", power, toughness },
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
    if (atom.untap) next = untapPermanent(next, target.id);
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
 * SBA so the 0/0 survives as a real N/N attacker. The "return it when it dies or is exiled" rider is a
 * delayed trigger left to the Arbiter — a safe FN (the land animates + attacks, it just doesn't recur).
 * The sim picks a land the controller controls that isn't already a creature (it stays a land → still
 * ramps, never lost). atom.countSource uses the count engine (e.g. experience counters) at resolution.
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
  const lethal = destroyLethalCreatures(next);
  next = checkDiesTriggers(lethal.state, lethal.dead);
  return logEvent(next, { kind: "spell-effect", effect: "earthbend", count: n, targets: [land.id] });
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
  const { fighter, target } = fightPairRefs(state, ctx);
  if (!fighter || !target) {
    return logEvent(state, { kind: "spell-effect", effect: "fight-pair", targets: [] });
  }
  const aPow = Math.max(0, creaturePower(fighter.permanent, state)); // CR 701.12a — read at resolution
  const bPow = Math.max(0, creaturePower(target.permanent, state));
  const deathtouched = new Set();
  // Deathtouch read PRE-fight (a fighter killed by the simultaneous damage still dealt its damage); layer-aware.
  if (permanentHasKeyword(state, fighter.permanent.id, "Deathtouch")) deathtouched.add(target.permanent.id);
  if (permanentHasKeyword(state, target.permanent.id, "Deathtouch")) deathtouched.add(fighter.permanent.id);
  let next = state;
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
 * clean no-op. (The trample-excess rider of Ram Through is NOT modeled here — that card stays Arbiter.)
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
  const deathtouched = new Set();
  if (permanentHasKeyword(state, fighter.permanent.id, "Deathtouch")) deathtouched.add(target.permanent.id);
  let next = markCombatDamage(state, { permanentId: target.permanent.id, amount: pow });
  const lethal = destroyLethalCreatures(next, deathtouched);
  next = checkDiesTriggers(lethal.state, lethal.dead);
  return logEvent(next, { kind: "spell-effect", effect: "damage-target-power", targets: [target.permanent.id] });
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
  const ids = atom.scope === "permanentsYouControl"
    ? bf.map((p) => p.id)                                            // ALL your permanents (Heroic Intervention)
    : bf.filter((p) => permanentIsCreature(state, p.id)).map((p) => p.id); // creaturesYouControl
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
  const tapPermM = t.match(/^tap target permanent( and its activated abilities can't be activated this turn)?\.?$/);
  if (tapPermM) {
    return { op: "tap", targetType: "permanent", restrictions: [], ...(tapPermM[1] ? { lockActivated: true } : {}) };
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
  // UNTAP-LAND (Voyaging Satyr "{T}: Untap target land") — a single chosen land. targetType "land" routes
  // through PERMANENT_PREDICATES.land in enumerateTargets (so any land on any battlefield is a legal target),
  // and applyTapEffect re-verifies the live permanent is a land before untapping. Whole-clause anchored ($) so
  // a qualified form ("untap target land you control", "untap X target lands") stays Arbiter (a safe FN).
  if (/^untap target land$/.test(t)) return { op: "untap", targetType: "land" };
  // UNTAP-BASIC-SUBTYPE (Arbor Elf "{T}: Untap target Forest"; Voyaging Satyr's typed kin) — a single chosen
  // land of a basic SUBTYPE (CR 305.6). targetType is the lowercased subtype; enumerateTargets routes it
  // through PERMANENT_PREDICATES.<subtype> (any land of that subtype on any battlefield is legal), and
  // applyTapEffect re-verifies the live permanent carries the subtype before untapping. Whole-clause anchored
  // ($) so "untap target basic land" / "untap target Forest you control" / "untap two target Forests" stays
  // Arbiter (a safe FN). Only the five basic land subtypes (never a creature subtype — a non-land "Forest"
  // doesn't exist, and the predicate also requires a Land type line).
  const us = t.match(/^untap target (forest|island|swamp|mountain|plains)$/);
  if (us) return { op: "untap", targetType: us[1] };
  if (/^target creature can't block this turn$/.test(t)) return { op: "cant-block", targetType: "creature" };
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
  // SUBTYPE-REGEN (CR 205.3 / 701.15) — "regenerate target <Subtype>" (Crypt/Poultice Sliver's group-granted
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
  let m = t.match(/^(?:all creatures|each creature) gets? ([+-]\d+)\/([+-]\d+) until end of turn$/);
  if (m) return { op: "pump", targetType: "eachCreature", ptDelta: { p: parseInt(m[1], 10), t: parseInt(m[2], 10) } };
  let tp = t.match(/^creatures you control get ([+-]\d+)\/([+-]\d+) and gain (.+) until end of turn$/);
  if (tp) {
    const kws = parseGrantedKeywords(tp[3]);
    return kws ? { op: "pump", scope: "youControl", ptDelta: { p: parseInt(tp[1], 10), t: parseInt(tp[2], 10) }, grantKeywords: kws } : null;
  }
  tp = t.match(/^creatures you control get ([+-]\d+)\/([+-]\d+) until end of turn$/);
  if (tp) return { op: "pump", scope: "youControl", ptDelta: { p: parseInt(tp[1], 10), t: parseInt(tp[2], 10) } };
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
  let ts = t.match(/^([a-z]+) you control(?: (other than this creature))? get ([+-]\d+)\/([+-]\d+)(?: and gain (.+))? until end of turn$/);
  if (ts) {
    const subtype = COUNT_SUBTYPE[ts[1]];
    if (!subtype) return null; // a non-curated word ("creatures" handled above; anything else → low/Arbiter)
    const kws = ts[5] ? parseGrantedKeywords(ts[5]) : null;
    if (ts[5] && !kws) return null;
    return { op: "pump", scope: "youControl", subtypeFilter: subtype, ...(ts[2] ? { excludeSource: true } : {}), ptDelta: { p: parseInt(ts[3], 10), t: parseInt(ts[4], 10) }, ...(kws ? { grantKeywords: kws } : {}) };
  }
  // COMBAT-TEAM-PUMP — "attacking|blocking creatures get +N/+N until end of turn" (Trumpet Blast, Hold the
  // Line). scope:attackingCreatures/blockingCreatures → applyPumpEffect over the current combatants (atomTargets);
  // whole-clause anchored, so a filtered/rider form fails the `$` → low → Arbiter (FN-safe).
  const cmb = t.match(/^(attacking|blocking) creatures get ([+-]\d+)\/([+-]\d+) until end of turn$/);
  if (cmb) return { op: "pump", scope: cmb[1] === "attacking" ? "attackingCreatures" : "blockingCreatures", ptDelta: { p: parseInt(cmb[2], 10), t: parseInt(cmb[3], 10) } };
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
  return null;
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
  const kws = parseGroupGrantKeywords(m[2]);
  if (!kws) return null;
  return { op: "grant-keywords-group", scope: m[1] === "permanents" ? "permanentsYouControl" : "creaturesYouControl", grantKeywords: kws };
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
  const anm = t.match(/^(until end of turn, )?target land becomes a (\d+)\/(\d+)(?: ([a-z]+))? creature(?: with ([a-z, ]+?))?(?: in addition to its other types)?( until end of turn)?$/);
  if (anm) {
    if (!anm[1] && !anm[6]) return null;  // a PERMANENT animate (no until-end-of-turn) is not modeled → Arbiter
    const COLOR_WORDS = new Set(["white", "blue", "black", "red", "green", "colorless", "multicolored"]);
    if (anm[4] && COLOR_WORDS.has(anm[4])) return null;  // "becomes a black creature" SETS color (layer 5) — not modeled → Arbiter
    const grantKeywords = anm[5] ? parseGrantedKeywords(anm[5]) : [];
    if (anm[5] && !grantKeywords) return null;  // an un-grantable rider keyword drops the whole clause → Arbiter
    const subtypes = anm[4] ? [anm[4].charAt(0).toUpperCase() + anm[4].slice(1)] : [];
    return { op: "animate", targetType: "land", power: parseInt(anm[2], 10), toughness: parseInt(anm[3], 10), subtypes, grantKeywords, duration: "endOfTurn" };
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

export const combatResolvers = {
  "fight": fightCreature, // ETB-FIGHT (CR 701.12) — source + target creature deal damage = power to each other, simultaneously
  "set-base-pt-team": applySetBasePtTeam, // SET-BASE-PT-TEAM (Biomass Mutation) — team layer-7b base-P/T set to X/X until end of turn
  "pump": (state, atom, ctx) => applyPumpEffect(state, atom, ctx),
  "animate": (state, atom, ctx) => applyAnimateEffect(state, atom, ctx),
  "earthbend": applyEarthbend, // EARTHBEND N (Toph) — permanently animate a land you control + N +1/+1 counters
  "regenerate": applyRegenerate, // REGEN (CR 701.15) — set a regeneration shield on self / target creature
  "tap": (state, atom, ctx) => applyTapEffect(state, atom, ctx, true),
  "untap": (state, atom, ctx) => applyTapEffect(state, atom, ctx, false),
  "cant-block": applyCantBlock, // CANT-BLOCK — "target creature can't block this turn" → layer-6 endOfTurn cantBlock grant
  "cant-be-blocked": applyCantBeBlocked, // CANT-BE-BLOCKED — "target creature can't be blocked this turn" → layer-6 endOfTurn unblockable grant
  "switch-pt": applySwitchPT, // SWITCH-PT — "switch ~ power and toughness until end of turn" → layer-7 sublayer-7d endOfTurn swap
  "grant-keywords-group": applyGrantKeywordsGroup, // GROUP-KEYWORD-GRANT — "(creatures|permanents) you control gain KW until end of turn"
  "damage-self-power": applyDamageSelfPower, // SELF-DAMAGE-BY-POWER — "target/each creature deals damage to itself equal to its power"
  "fight-pair": applyFightPair, // FIGHT-PAIR (CR 701.12) — two CHOSEN creatures (fighter + target) deal damage = power to each other, simultaneously
  "damage-target-power": applyDamageTargetPower, // DAMAGE-TARGET-POWER (CR 119) — one-way: only the chosen fighter deals damage = its power to the chosen target
};
