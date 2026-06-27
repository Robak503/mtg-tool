/**
 * effects/atoms/combat.js — combat / P-T / animation atoms (fight, pump, animate, earthbend, tap, untap,
 * regenerate). Hosts applyTapEffect (tap/untap).
 */

import { addContinuousEffect, permanentIsCreature, permanentHasKeyword } from "../../layers.js";
import { logEvent, destroyLethalCreatures, findPermanent, tapPermanent, untapPermanent, addCounter, addRegenShield, creaturePower, markCombatDamage } from "../../gameState.js";
import { checkDiesTriggers } from "../../triggers.js";
import { atomTargets, countForSpec, typeLineStr } from "./shared.js";
import { SMALL_NUM, parseCountSource, parseGrantedKeywords } from "../parseHelpers.js"; // seam batch 5/12c: shared parse helpers (leaf, cycle-free)

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
  if (/^target creature can't block this turn$/.test(t)) return { op: "cant-block", targetType: "creature" };
  if (/^regenerate (?:this creature|this permanent)$/.test(t)) return { op: "regenerate", target: "self" };
  if (/^regenerate target creature$/.test(t)) return { op: "regenerate", targetType: "creature" };
  return null;
}

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

export const combatResolvers = {
  "fight": fightCreature, // ETB-FIGHT (CR 701.12) — source + target creature deal damage = power to each other, simultaneously
  "pump": (state, atom, ctx) => applyPumpEffect(state, atom, ctx),
  "animate": (state, atom, ctx) => applyAnimateEffect(state, atom, ctx),
  "earthbend": applyEarthbend, // EARTHBEND N (Toph) — permanently animate a land you control + N +1/+1 counters
  "regenerate": applyRegenerate, // REGEN (CR 701.15) — set a regeneration shield on self / target creature
  "tap": (state, atom, ctx) => applyTapEffect(state, atom, ctx, true),
  "untap": (state, atom, ctx) => applyTapEffect(state, atom, ctx, false),
  "cant-block": applyCantBlock, // CANT-BLOCK — "target creature can't block this turn" → layer-6 endOfTurn cantBlock grant
};
