/**
 * effects/atoms/combat.js — combat / P-T / animation atoms (fight, pump, animate, earthbend, tap, untap,
 * regenerate). Hosts applyTapEffect (tap/untap).
 */

import { addContinuousEffect, permanentIsCreature, permanentHasKeyword } from "../../layers.js";
import { logEvent, destroyLethalCreatures, findPermanent, tapPermanent, untapPermanent, addCounter, addRegenShield, creaturePower, markCombatDamage } from "../../gameState.js";
import { checkDiesTriggers } from "../../triggers.js";
import { atomTargets, countForSpec, typeLineStr } from "./shared.js";

/** Tap / untap target creature(s) (CR 701.26). */
export function applyTapEffect(state, atom, ctx, tap) {
  let next = state;
  for (const t of ctx.targets || []) {
    if (t.type === "creature" && findPermanent(next, t.id)) next = tap ? tapPermanent(next, t.id) : untapPermanent(next, t.id);
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
  const power = scaled != null ? scaled : (atom.amountX ? x : atom.ptDelta?.p || 0);
  const toughness = scaled != null ? scaled : (atom.amountX ? x : atom.ptDelta?.t || 0);
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

export const combatResolvers = {
  "fight": fightCreature, // ETB-FIGHT (CR 701.12) — source + target creature deal damage = power to each other, simultaneously
  "pump": (state, atom, ctx) => applyPumpEffect(state, atom, ctx),
  "animate": (state, atom, ctx) => applyAnimateEffect(state, atom, ctx),
  "earthbend": applyEarthbend, // EARTHBEND N (Toph) — permanently animate a land you control + N +1/+1 counters
  "regenerate": applyRegenerate, // REGEN (CR 701.15) — set a regeneration shield on self / target creature
  "tap": (state, atom, ctx) => applyTapEffect(state, atom, ctx, true),
  "untap": (state, atom, ctx) => applyTapEffect(state, atom, ctx, false),
};
