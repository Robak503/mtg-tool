/**
 * effects/atoms/counters.js — counter atoms (add-counter, proliferate, gain-experience, rad).
 */

import { logEvent, destroyLethalCreatures, opponentsOf, findPermanent, addCounter, removeCounter, addPoison, addExperience, addRadCounters } from "../../gameState.js";
import { checkDiesTriggers, checkCounterPlacedTriggers } from "../../triggers.js";
import { applyCounterDoubling } from "../../replacementEffects.js"; // Wave-3 doubler (leaf): mirror the actual placed amount for the COUNTERS-PLACED watcher count
import { atomTargets, isCreatureCard, countForSpec, resolveScaledAmount } from "./shared.js";
import { SMALL_NUM, parseCountSource, COUNT_SUBTYPE } from "../parseHelpers.js"; // seam batch 3: shared number-word map (leaf, cycle-free) + DYNAMIC-COUNT board-count source + curated MTG-subtype allowlist (filtered mass-counter scope)

/**
 * WAVE 3b COUNTERS-ON-EVENT — the TRIGGERING-PERMANENT referent ("…on that creature" / non-self "…on
 * it", target:"thatCreature"; the pronoun refers to the object the ability triggered on, CR 608.2c;
 * counter placement CR 122.6). The trigger flush threads ctx.triggeringPermanentId (the
 * creature whose event fired the trigger — e.g. the attacker that dealt combat damage for Sphere Grid).
 * Returns a single-creature target list, or [] when the referent is absent (a spell, or the triggering
 * permanent already left the battlefield) — a clean no-op, never a fabricated counter. Mirrors
 * selfTargets: only a CREATURE referent is honored ("that creature" implies a creature).
 */
function triggeringCreatureTargets(state, ctx) {
  const lk = ctx.triggeringPermanentId ? findPermanent(state, ctx.triggeringPermanentId) : null;
  return lk && isCreatureCard(lk.permanent.card)
    ? [{ type: "creature", id: ctx.triggeringPermanentId, controller: lk.controller }]
    : [];
}

/** RAD (CR 728) — give rad counter(s) to the controller / each player / each opponent / a target player /
 * the just-damaged player. Fixed-N grants, OR a `countContext` dynamic count (CDMG-PLAYER-PAYOFF — "they get
 * that many rad counters" = ctx.combatDamageAmount, floored at 0, never forced to 1; the parser still routes
 * "for each" / X / scaled forms to the Arbiter). The inherent radiation ability (gameEngine, at each player's
 * precombat main) does the mill + life-loss + counter-removal. Mirrors applyLoseLife's who-resolution;
 * non-targeted, so identical on a spell or a trigger. A missing / eliminated player is a clean skip.
 *
 * who:"damagedPlayer" (CDMG-PLAYER-PAYOFF — Glowing One "they get four rad counters", Infesting Radroach
 * "they get that many rad counters") reads ctx.damagedPlayerId, the player just dealt combat damage (carried
 * by triggers.checkCombatDamageTriggers). Absent (a spell / non-combat trigger) → a clean no-op (0), never a
 * fabricated grant or a wrong recipient. */
export function applyRad(state, atom, ctx) {
  let next = state;
  // resolveScaledAmount unifies every amount source: countContext (CDMG-PLAYER-PAYOFF "that many" =
  // combatDamageAmount), amountCount (a board count × per), amountX (the cast {X}), and HALF-X (atom.halve
  // floors/ceils the result — Contaminated Drink "you get half X rad counters, rounded up"). Behavior-
  // identical for the existing fixed-N + countContext rad cards (no rad card uses amountCount today), and
  // newly correct for the X / half-X forms. Floored at 0 (a 0 amount is a clean no-op below).
  const amount = Math.max(0, resolveScaledAmount(state, atom, ctx) || 0);
  if (amount === 0) return next;
  if (atom.who === "eachPlayer") {
    for (const pid of Object.keys(next.players)) {
      if (next.players[pid]) next = addRadCounters(next, { playerId: pid, amount });
    }
  } else if (atom.who === "eachOpponent") {
    for (const opp of opponentsOf(next, ctx.controller)) {
      if (next.players[opp]) next = addRadCounters(next, { playerId: opp, amount });
    }
  } else if (atom.who === "target") {
    for (const t of ctx.targets || []) {
      if (t.type === "player" && next.players[t.id]) next = addRadCounters(next, { playerId: t.id, amount });
    }
  } else if (atom.who === "damagedPlayer") {
    // The just-damaged player (CR — the combat-damage trigger's referent). Absent → clean no-op.
    const pid = ctx.damagedPlayerId;
    if (pid && next.players[pid]) next = addRadCounters(next, { playerId: pid, amount });
  } else {
    next = addRadCounters(next, { playerId: ctx.controller, amount });
  }
  return logEvent(next, { kind: "spell-effect", effect: "rad", who: atom.who || "controller", amount });
}

/** Put +1/+1 or -1/-1 counters on the chosen creature(s), or the SOURCE for a self counter
 * ("put a +1/+1 counter on this creature", atom.target "self"; CR 122.1). */
export function applyAddCounter(state, atom, ctx) {
  let next = state;
  // WAVE 3b — the triggering-permanent referent ("…on that creature" / non-self "…on it") resolves to
  // ctx.triggeringPermanentId (CR 608.2c); every other form goes through the shared atomTargets dispatch
  // (self / chosen target / team). Absent referent → [] → a clean no-op (CREED, never a fabricated counter).
  const targets = atom.target === "thatCreature" ? triggeringCreatureTargets(state, ctx) : atomTargets(state, atom, ctx);
  // DYNAMIC-COUNT (keystone): `countFor` is a count resolved AT RESOLUTION (CR 608.2h) via the SHARED
  // countForSpec — a board tally ("put X +1/+1 counters on target creature, where X is the number of lands you
  // control" — Will of the Sultai; "…on each creature you control … the number of Elves you control" — Voja) or
  // a source-stat ("equal to that creature's power"). A 0 count adds NO counters (a clean no-op, never forced to
  // 1); a FIXED count floors at 1. Computed ONCE here (state pre-mutation), then applied to every target. The
  // amount auto-routes through addCounter's central doubler hook, so the Wave-3 counter doubler still composes.
  const amount = atom.countFor ? Math.max(0, countForSpec(state, ctx, atom.countFor)) : (atom.amount || 1);
  // PER-TARGET-DOUBLE (CR 121 — board-wide "double the number of +1/+1 counters on EACH creature you control":
  // Kalonian Hydra's attack trigger, Bristly Bill / She-Hulk / Court of Garenbrig). Unlike the SELF double
  // (countFor:countersOnSource — one global amount read off the source), the board-wide form doubles EACH
  // creature's OWN counters: the amount added to a given target = that target's CURRENT count of `perTargetDouble`
  // counters, read PER target against pre-mutation `next`. Each placement still routes through addCounter's
  // doubler hook, so Doubling Season composes per target (CR 616). Restricted to +1/+1 (the only enforced kind,
  // mirroring the rest of this atom); a target with 0 of that counter gets 0 (a clean no-op, never a fabricated
  // floor). When unset this is a normal fixed/dynamic single `amount` applied uniformly.
  const amountForTarget = (perm) => atom.perTargetDouble
    ? Math.max(0, perm?.counters?.[atom.perTargetDouble] || 0)
    : amount;
  // COUNTERS-PLACED watcher (CR 122.6): tally the ACTUAL number of +1/+1 counters this event places, split by
  // whether the recipient creature is controlled by the PLACER (ctx.controller) or anyone. The placed amount
  // is computed via the SAME applyCounterDoubling addCounter applies (Doubling Season / Hardened Scales /
  // Vorinclex), read against PRE-mutation `next` so every target sees the same replacement world — so the
  // count "that many"/"that much" reflects what actually landed (Terrasymbiosis with Doubling Season draws the
  // DOUBLED count). Only +1/+1 (the wording is "+1/+1 counters"); a -1/-1 placement never feeds this watcher.
  let placedOnYours = 0, placedOnAny = 0;
  for (const t of targets) {
    const lk = findPermanent(next, t.id);
    const addAmt = lk ? amountForTarget(lk.permanent) : 0;
    if (addAmt > 0 && t.type === "creature" && lk) {
      if (atom.counterType === "+1/+1") {
        const placed = applyCounterDoubling(next, t.controller, "+1/+1", addAmt);
        placedOnAny += placed;
        if (t.controller === ctx.controller) placedOnYours += placed;
      }
      next = addCounter(next, { permanentId: t.id, type: atom.counterType, amount: addAmt });
    }
  }
  // -1/-1 counters lower DERIVED toughness — run the lethal SBA so a creature it
  // drops to 0 dies at resolution (the P2.3 negative-pump discipline).
  if (atom.counterType === "-1/-1") {
    const r = destroyLethalCreatures(next);
    next = checkDiesTriggers(r.state, r.dead);
  }
  next = logEvent(next, { kind: "spell-effect", effect: "add-counter", counterType: atom.counterType, amount: atom.perTargetDouble ? "perTargetDouble" : amount, targets: targets.map(t => t.id) });
  // Fire the placer's "Whenever you put one or more +1/+1 counters on a creature [you control]" triggers
  // ONCE for this whole event (CR 122.6), controller-scoped to ctx.controller, "that many" = the placed count.
  // A clean no-op when no +1/+1 landed on a creature (placedOnAny === 0) or no such watcher exists.
  if (placedOnAny > 0) {
    next = checkCounterPlacedTriggers(next, { placingPlayerId: ctx.controller, placedOnYours, placedOnAny });
  }
  return next;
}

// PROLIFERATE (CR 701.27): "choose any number of permanents and/or players that have a counter on them,
// then give each another counter of each kind already there." The "may choose any number" is auto-resolved
// to NEVER-HARMFUL picks (the sim's controller plays to win): a permanent is proliferated only when adding
// to it HELPS ctx.controller — MY permanent that has a GOOD counter and no BAD one, an OPPONENT's that has
// a BAD counter and no good one — plus POISON on opponent players. Per CR one of EACH kind on a chosen
// permanent is added, so the choice is PER-PERMANENT (not per-kind). Ambiguous counters (saga lore, etc.)
// are never the reason to choose a permanent → a safe no-op. (A future interactive choice UI can replace
// the heuristic; this is the rules engine.) Compounds with every counter the engine tracks.
const PROLIF_GOOD = new Set(["+1/+1", "loyalty", "charge", "fade", "time", "level", "oil"]);
const PROLIF_BAD = new Set(["-1/-1", "stun"]);

export function applyProliferate(state, atom, ctx) {
  const me = ctx.controller;
  const times = Math.max(1, atom.times || 1); // "proliferate twice" (Contagion Engine) runs it twice
  let next = state;
  for (let n = 0; n < times; n++) {
    for (const pid of Object.keys(next.players)) {
      const mine = pid === me;
      for (const perm of [...next.players[pid].battlefield]) {
        const kinds = Object.entries(perm.counters || {}).filter(([, v]) => v > 0).map(([k]) => k);
        if (kinds.length === 0) continue;
        const hasGood = kinds.some((k) => PROLIF_GOOD.has(k));
        const hasBad = kinds.some((k) => PROLIF_BAD.has(k));
        const choose = mine ? (hasGood && !hasBad) : (hasBad && !hasGood);
        if (!choose) continue;
        for (const k of kinds) next = addCounter(next, { permanentId: perm.id, type: k, amount: 1 });
      }
      // POISON on opponent players (the player counter whose proliferation is unambiguously good for me).
      if (!mine && (next.players[pid].poison || 0) > 0) next = addPoison(next, { playerId: pid, amount: 1 });
      // RAD (CR 728) on opponent players — same heuristic as poison: more rad on an opponent mills + drains
      // THEM, so it's unambiguously good for me (and bad on myself, so I skip my own). CR 701.34a lets
      // proliferate add a rad counter to any player who already has one.
      if (!mine && (next.players[pid].radCounters || 0) > 0) next = addRadCounters(next, { playerId: pid, amount: 1 });
    }
  }
  // A proliferated -1/-1 may drop an opponent's creature to lethal toughness (CR 704.5g).
  const r = destroyLethalCreatures(next);
  next = checkDiesTriggers(r.state, r.dead);
  return logEvent(next, { kind: "spell-effect", effect: "proliferate", controller: me });
}

/**
 * GAIN-EXPERIENCE (EARTHBEND-PR3, Toph landfall) — "You get an experience counter." Increments the
 * controller's experience counter total (player.experience). Non-targeted, infallible (counter players
 * can't be targeted). PR3 scope: the landfall trigger fires once per land entry, each granting +1.
 */
export function applyGainExperience(state, atom, ctx) {
  const count = Math.max(1, atom.count || 1);
  const pid = ctx.controller;
  if (!state.players?.[pid]) return state;
  return addExperience(state, { playerId: pid, amount: count });
}

/**
 * PROLIFERATE clause parser (CR 701.27) — migrated from parser.js parseExtendedAtom (seam batch 3).
 * A standalone keyword action: "proliferate" / "proliferate again" → one proliferate; "proliferate twice"
 * (Contagion Engine) → times:2. A proliferate with a rider in the same clause keeps the rider via the normal
 * clause split, so the exact-match never silently drops trailing text. Pure (no parser.js import — cycle-safe).
 */
export function proliferateClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  if (/^proliferate twice$/.test(t)) return { op: "proliferate", times: 2, targetType: null };
  if (/^proliferate( again)?$/.test(t)) return { op: "proliferate", targetType: null };
  return null;
}

/**
 * GAIN-EXPERIENCE clause parser (EARTHBEND-PR3, Toph landfall) — migrated from parser.js parseExtendedAtom
 * (seam batch 3). "you get an experience counter" / "you get N experience counters" → the gain-experience
 * atom (increments player.experience). Non-targeted, infallible. Pure; uses the shared SMALL_NUM leaf map.
 */
export function gainExperienceClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  if (/^you get an experience counter$/.test(t)) return { op: "gain-experience", count: 1, targetType: null };
  const m = t.match(/^you get (\d+|one|two|three|four|five) experience counters?$/);
  if (m) return { op: "gain-experience", count: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), targetType: null };
  return null;
}

/**
 * RAD clause parser (CR 728) — migrated from parser.js parseExtendedAtom (seam batch 13 / Wave C). ONLY the
 * contiguous player-grant block: "each player/opponent gets N rad counters" / "you get N rad counters" /
 * "target player/opponent gets N rad counters". Fixed-N only (a/an/one..five/digit). Non-targeted forms carry
 * targetType:null (resolve the same on spell or trigger); the targeted form rides who:"target" + a player
 * targetType (offensive only — atomTargetIntent → "enemy"). A "for each"/X/scaled/"you may"/conditional variant
 * fails the `$` anchor → low → Arbiter (FN-safe). The combat-damage / dies rad variants ("they/that player gets
 * N rad counters", who:"damagedPlayer"; "each opponent gets … equal to its power", who:"eachOpponent") live in
 * cdmgPayoffClauseParser below (seam batch S2 — the whole CDMG-PLAYER-PAYOFF family lifted together; disjoint
 * they/that-player anchors, so the two parsers can never both match a clause). Pure; SMALL_NUM leaf map.
 */
export function radClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  // ===== HALF-X (CR 107.3) ===== "you get half X rad counters, rounded up/down" — the count is HALF the cast
  // {X} with CR-correct rounding (Contaminated Drink: "Draw X cards, then you get half X rad counters, rounded
  // up"). amountX:true → applyRad reads ctx.xValue via resolveScaledAmount; halve:"ceil"/"floor" applies the
  // rounding. The ", rounded up/down" suffix is MANDATORY in the corpus wording (a bare "half X rad counters"
  // with no stated rounding has no corpus card and is ambiguous → not matched → Arbiter, FN-safe). Only the
  // controller "you get" form exists for half-X rad; an each-player/target half-X variant has no corpus card.
  const radHalfXM = t.match(/^you get half x rad counters, rounded (up|down)$/);
  if (radHalfXM) return { op: "rad", amountX: true, halve: radHalfXM[1] === "up" ? "ceil" : "floor", who: "controller", targetType: null };
  const radEachM = t.match(/^each (player|opponent) gets (\d+|a|an|one|two|three|four|five) rad counters?$/);
  if (radEachM) return { op: "rad", amount: SMALL_NUM[radEachM[2]] ?? parseInt(radEachM[2], 10), who: radEachM[1] === "opponent" ? "eachOpponent" : "eachPlayer", targetType: null };
  const radYouM = t.match(/^you get (\d+|a|an|one|two|three|four|five) rad counters?$/);
  if (radYouM) return { op: "rad", amount: SMALL_NUM[radYouM[1]] ?? parseInt(radYouM[1], 10), who: "controller", targetType: null };
  const radTgtM = t.match(/^target (player|opponent) gets (\d+|a|an|one|two|three|four|five) rad counters?$/);
  if (radTgtM) return { op: "rad", amount: SMALL_NUM[radTgtM[2]] ?? parseInt(radTgtM[2], 10), who: "target", targetType: radTgtM[1] };
  return null;
}

/**
 * CDMG-PLAYER-PAYOFF + COUNTERS-PLACED + DIES-RAD clause parser (seam batch S2 — the FINAL parseExtendedAtom
 * drain: these 5 sentinel matchers were all that remained; the function is deleted). Combat-damage-to-a-player
 * payoffs whose ACTOR/COUNT is the trigger referent the combat-damage trigger carries in ctx
 * ({damagedPlayerId, combatDamageAmount} — set by triggers.checkCombatDamageTriggers, flushed into
 * baseParams.context by gameEngine.buildTriggerStack), plus the counters-placed sentinels and the dies-rad
 * power-scaled form. All are NON-targeted (the damaged player / dying creature is the trigger's referent, not
 * a chosen target) so they carry targetType:null and route natively on the trigger flush
 * (programNeedsChosenTarget → false) AND clean-no-op as a spell (no ctx referent → 0, never a fabricated
 * count). All anchored ^…$ — any trailing rider ("…, then discard a card" / "…if they don't have any rad
 * counters" / "…or planeswalker") leaves text past the anchor → low → Arbiter (CREED: never a dropped clause).
 * First-match order preserved from parseExtendedAtom (a → cp → b → c → dies-rad):
 *   (a) "draw that many cards" (Starwinder/Cold-Eyed Selkie "you may"-wrapped, Fear of Failed Tests /
 *       Glint-Eye Nephilim bare): the count is the triggering combat-damage amount. The leading "you may"
 *       wrapper is peeled by parseClauseToAtom's α2 (stamping optional:true); the inner bare form lands
 *       here. Keep the optional anchor too so a raw "you may draw that many cards" passed directly still
 *       stamps optional (the parser is also called clause-first in tests).
 *   (cp) COUNTERS-PLACED — "draw that many counters-placed cards" / "gain that much counters-placed life":
 *       the event-specific sentinels detectTriggers rewrites a counters-placed trigger's payoff to (gated to
 *       the countersPlaced event; a phrase in ZERO printed oracle text). The count is the +1/+1 counters
 *       placed in that event (ctx.countersPlaced). The once-per-turn rider (Terrasymbiosis / Earth Kingdom
 *       General) is handled by parser.js' ONCE-PER-TURN wrapper — draw + gain-life honor the latch.
 *   (b) "they/that player gets N rad counters" (Glowing One) — FIXED-N rad to the just-damaged player.
 *       who:"damagedPlayer" reads ctx.damagedPlayerId (absent → clean no-op). A trailing intervening-if
 *       (Vexing Radgull) keeps its tail and fails the $ → low → Arbiter.
 *   (c) "they/that player gets that many rad counters" (Infesting Radroach) — count = combat-damage amount.
 *   (dies-rad) "each opponent gets a number of rad counters equal to its power" (Feral Ghoul — corpus-verified
 *       unique): a DIES-trigger payoff; "its" = the dying creature, count = ctx.dyingPower (captured at the
 *       look-back BEFORE the permanent left, CR 603.6e). who:"eachOpponent"; absent referent → 0, no-op.
 *       (The draw/gain-life "equal to its power" halves are NOT generic clause matchers — they appear on
 *       ETB/combat-damage cards where "its" is a LIVE source; those parse ONLY inside the dies-specific
 *       matchDiesGainDrawByPower collapsed template, so Prime Speaker Zegana / Gregor are never mis-flipped
 *       to read an absent dyingPower → 0.)
 * Disjoint from radClauseParser above (each/you/target vs they/that-player leads) and from the draw parsers in
 * atoms/misc.js (numeric / for-each / equal-to-number forms — none anchor "that many cards" bare). Pure;
 * SMALL_NUM leaf. Precedent: atoms/hand.js hosts the identical-shape CDMG-DISCARD-SCALED sentinel.
 */
export function cdmgPayoffClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  // (a) combat-damage draw — "draw that many cards"
  const cdmgDrawM = t.match(/^(you may )?draw that many cards$/);
  if (cdmgDrawM) return { op: "draw", countContext: "combatDamageAmount", optional: !!cdmgDrawM[1], targetType: null };
  // (cp) counters-placed sentinels — "draw that many counters-placed cards" / "gain that much counters-placed life"
  const cpDrawM = t.match(/^(you may )?draw that many counters-placed cards$/);
  if (cpDrawM) return { op: "draw", countContext: "countersPlaced", optional: !!cpDrawM[1], targetType: null };
  const cpLifeM = t.match(/^(you may )?gain that much counters-placed life$/);
  if (cpLifeM) return { op: "gain-life", countContext: "countersPlaced", optional: !!cpLifeM[1], targetType: null };
  // (b) fixed-N rad to the damaged player — "they/that player gets N rad counters"
  const cdmgRadFixedM = t.match(/^(?:they|that player) gets? (\d+|a|an|one|two|three|four|five) rad counters?$/);
  if (cdmgRadFixedM) return { op: "rad", who: "damagedPlayer", amount: SMALL_NUM[cdmgRadFixedM[1]] ?? parseInt(cdmgRadFixedM[1], 10), targetType: null };
  // (c) damage-scaled rad — "they/that player gets that many rad counters"
  const cdmgRadDynM = t.match(/^(?:they|that player) gets? that many rad counters$/);
  if (cdmgRadDynM) return { op: "rad", who: "damagedPlayer", countContext: "combatDamageAmount", targetType: null };
  // (dies-rad) power-scaled dies payoff — Feral Ghoul
  if (/^each opponent gets a number of rad counters equal to its power$/.test(t)) {
    return { op: "rad", who: "eachOpponent", countContext: "dyingPower", targetType: null };
  }
  return null;
}

/**
 * ADD-COUNTER (+1/+1 ⇄ -1/-1) clause parser — migrated from parseExtendedAtom (seam batch 25 / Wave C). The
 * five contiguous (now neighbor-free — pump/sac/regen/bounce all migrated) ±1/+1-counter matchers, original
 * first-match order:
 *   "put N +1/+1 counters on target creature"               → targetType:"creature"
 *   "… on target creature you control"                      → targetType:"creatureYouControl" (own-side)
 *   "… on this creature"                                    → target:"self" (the source)
 *   "… on up to one target creature"                        → targetType:"creature", optionalTarget (CR 115.1b)
 *   "… on each creature you control"                        → scope:"youControl" (non-targeted team)
 * Numeric/spelled N only (SMALL_NUM leaf); a filter/variable-X/multi-target leaves trailing text → low → Arbiter.
 * The resolution-time +1/+1 DOUBLER (applyCounterDoubling) and the WAVE-3b "on the triggering creature" parser
 * (counterClausesParser) are SEPARATE — no overlap with these anchors. Pure. Registered via registerClauseParser.
 */
export function addCounterClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  // ===== DYNAMIC-COUNT (keystone) ===== "put X/a number of +1/+1 counters on <target / target you control /
  // each you control>, where X is [equal to] the number of <src>" / "… equal to the number of <src>" — the
  // COUNT is a board tally resolved at resolution via the shared parseCountSource→countForSpec (Will of the
  // Sultai "lands you control", Antarctic Research Base "artifacts you control", Voja "Elves you control" [each],
  // Southern Air Temple "Shrines you control" [each], Lasyd Prowler "land cards in your graveyard", Kratos
  // "experience counters you have"). Checked BEFORE the fixed-N matchers (those are `$`-anchored, so a where-/
  // equal-to clause never reaches them anyway; order is for clarity). An UNMODELED count source (parseCountSource
  // → null) drops the whole clause → low → Arbiter (the `src ? … : null`) — never a fabricated/guessed count.
  // Only +1/+1 (the enforced positive form) — a dynamic -1/-1 count is not in scope (no such clean corpus card),
  // and the regex's `\+1\/\+1` excludes it. The SCOPE is exact: target / target-you-control / each-you-control.
  const SCOPE_FIELD = {
    "target creature": { targetType: "creature" },
    "target creature you control": { targetType: "creatureYouControl" },
    "each creature you control": { scope: "youControl" },
  };
  const dynCounter = (type, scopePhrase, srcPhrase) => {
    const src = parseCountSource(srcPhrase);
    // an UNMODELED count source → null (the whole clause routes low → Arbiter, never a guessed count, CREED)
    return src ? { op: "add-counter", counterType: type, countFor: src, ...SCOPE_FIELD[scopePhrase] } : null;
  };
  // word order A — "where X is [equal to] the number of <src>"; word order B — "equal to the number of <src>".
  // Both lead with the VARIABLE "X" / "a number of" (a literal-N count uses the fixed-N matchers below). Once a
  // dynamic shape matches the regex, the clause is dynamic — so a null count source returns null (Arbiter), it
  // NEVER falls through to a fixed matcher (which would mis-read the leading "X"/"a number of" as a count).
  let dm = t.match(/^put (?:x|a number of) ([+-]1\/[+-]1) counters? on (target creature you control|target creature|each creature you control),? where x is (?:equal to )?the number of (.+)$/);
  if (dm) return dynCounter(dm[1], dm[2], dm[3]);
  dm = t.match(/^put (?:x|a number of) ([+-]1\/[+-]1) counters? on (target creature you control|target creature|each creature you control) equal to the number of (.+)$/);
  if (dm) return dynCounter(dm[1], dm[2], dm[3]);
  // ===== DICE-ROLL multi-target (CR 603.7 reflexive payoff — Ancient Bronze Dragon) ===== "put X +1/+1
  // counters on each of up to two target creatures, where X is the result" — X is the just-rolled d20 value
  // (countFor diceResult, read off state.diceRoll, paired with a preceding roll-d20 by the parser's CREED
  // gate). The "up to two TARGET creatures" cardinality is modeled as a CONTROLLER-SCOPED optimal pick
  // (scope:"upToTwoYouControl"): a +1/+1 counter is purely beneficial, so the controller always puts it on up
  // to two of ITS OWN creatures (targeting an opponent's would only help them — never the play). Resolving as
  // a controller scope rather than the shared chosen-target cartesian — which has no up-to-N cardinality, and
  // extending it would touch every spell's targeting — is faithful for every realistic line AND routes
  // natively non-targeted (no flush chooser, no enumeration). Anchored to the exact diceResult form (a fixed-N
  // or where-X-is-the-number-of variant never reaches here). An unmodeled count source → null → low → Arbiter.
  const drM = t.match(/^put x \+1\/\+1 counters on each of up to two target creatures,? where x is the result$/);
  if (drM) {
    const src = parseCountSource("the result");
    return src ? { op: "add-counter", counterType: "+1/+1", countFor: src, scope: "upToTwoYouControl" } : null;
  }
  let m = t.match(/^put (a|an|one|two|three|four|five|\d+) ([+-]1\/[+-]1) counters? on target creature$/);
  if (m) return { op: "add-counter", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), targetType: "creature" };
  // MULTI-COUNT (CR 601.2c "up to N") — "put <N> <±1/±1> counter(s) on each of up to <K> target creatures[ you
  // control]" → the chosen-target multi-count (applyAddCounter already LOOPS ctx.targets, applying `amount` to EACH;
  // targeting.expandAtoms offers each 0..K subset). maxTargets:K. Distinct from the dice-roll scope:"upToTwoYouControl"
  // auto-pick above, which predates the multi-count infra. A `you control` suffix narrows enumeration to own creatures.
  m = t.match(/^put (a|an|one|two|three|four|five|\d+) ([+-]1\/[+-]1) counters? on each of up to (two|three|four|five) target creatures( you control)?$/);
  if (m) return { op: "add-counter", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), targetType: m[4] ? "creatureYouControl" : "creature", maxTargets: SMALL_NUM[m[3]], minTargets: 0 };
  m = t.match(/^put (a|an|one|two|three|four|five|\d+) ([+-]1\/[+-]1) counters? on target creature you control$/);
  if (m) return { op: "add-counter", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), targetType: "creatureYouControl" };
  m = t.match(/^put (a|an|one|two|three|four|five|\d+) ([+-]1\/[+-]1) counters? on this creature$/);
  if (m) return { op: "add-counter", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), target: "self" };
  m = t.match(/^put (a|an|one|two|three|four|five|\d+) ([+-]1\/[+-]1) counters? on up to one target creature$/);
  if (m) return { op: "add-counter", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), targetType: "creature", optionalTarget: true };
  m = t.match(/^put (a|an|one|two|three|four|five|\d+) ([+-]1\/[+-]1) counters? on each creature you control$/);
  if (m) return { op: "add-counter", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), scope: "youControl" };
  // ===== FILTERED MASS-COUNTER (the youControl team-counter, the two scope narrowings the pump path already
  // models) ===== The resolver is ALREADY built: scope:"youControl" routes through controllerCreatureTargets,
  // which honors excludeSource (CR 113.7) + subtypeFilter (word-bounded \b against the type line) — the SAME
  // gatherer the team-pump "other creatures / <Subtype>s you control" parser feeds. So this only emits those
  // fields; no resolver change. Two clean forms, whole-clause anchored ($) so any rider / variable count /
  // un-curated word fails → null → low → Arbiter (FN-safe, never a wrong partial):
  //   • "each OTHER creature you control"        → excludeSource:true (Ridgescale Tusker, Web-Warriors, The Falcon)
  //   • "each <Subtype>/<artifact|enchantment> creature you control" → subtypeFilter (Cordial Vampire = Vampire;
  //     Steel Overseer = Artifact creature). The subtype/type word maps through the curated COUNT_SUBTYPE
  //     allowlist OR the two single-word card-type qualifiers (artifact/enchantment), so the \b match in
  //     controllerCreatureTargets credits EXACTLY that subtyped/typed set — a non-curated word ("Villain",
  //     "Fractal", "tapped"/"attacking"/"colorless"/"land creature") returns null and stays on the Arbiter (CREED).
  m = t.match(/^put (a|an|one|two|three|four|five|\d+) ([+-]1\/[+-]1) counters? on each other creature you control$/);
  if (m) return { op: "add-counter", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), scope: "youControl", excludeSource: true };
  m = t.match(/^put (a|an|one|two|three|four|five|\d+) ([+-]1\/[+-]1) counters? on each ([a-z]+) creature you control$/);
  if (m && (m[3] === "artifact" || m[3] === "enchantment")) {
    return { op: "add-counter", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), scope: "youControl", subtypeFilter: m[3].charAt(0).toUpperCase() + m[3].slice(1) };
  }
  // "each <Subtype> creature you control" (Avenger of Zendikar — "each Plant creature you control") — the
  // subtype-bearing CREATURE form, distinct from the "each <Subtype> you control" form below (which has no
  // "creature" word, e.g. "each Goblin you control"). The subtype maps through the SAME curated, collision-free
  // COUNT_SUBTYPE allowlist, so controllerCreatureTargets' \b<Subtype>\b type-line match credits EXACTLY the
  // subtyped creatures (CREED — a non-curated word → null → low → Arbiter). Checked AFTER artifact/enchantment
  // (those are card-TYPE qualifiers handled above), BEFORE the no-"creature" subtype form.
  if (m && COUNT_SUBTYPE[m[3]]) {
    return { op: "add-counter", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), scope: "youControl", subtypeFilter: COUNT_SUBTYPE[m[3]] };
  }
  m = t.match(/^put (a|an|one|two|three|four|five|\d+) ([+-]1\/[+-]1) counters? on each ([a-z]+) you control$/);
  if (m && COUNT_SUBTYPE[m[3]]) {
    return { op: "add-counter", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), scope: "youControl", subtypeFilter: COUNT_SUBTYPE[m[3]] };
  }
  return null;
}

/**
 * ADD-NAMED-COUNTER-SELF (CR 122.1) — put one NAMED (non-±1/+1) counter on the SOURCE permanent itself
 * ("put a charge counter on this artifact" — Door of Destinies' cast trigger). The source is read from
 * ctx.sourceId (threaded by the trigger flush, CR 113.7) and may be ANY permanent type (an artifact, an
 * enchantment…), unlike applyAddCounter/selfTargets which honor only a CREATURE self. A named counter
 * (charge/fellowship/…) is never a P/T counter, so no lethal-SBA pass is needed. Absent source → a clean
 * no-op (the artifact already left the battlefield), never a fabricated counter. Goes through
 * gameState.addCounter so a counter doubler (Doubling Season, CR 616) still applies (a +1/+1-only doubler
 * is skipped for a non-+1/+1 counter inside addCounter).
 */
export function applyAddNamedCounterSelf(state, atom, ctx) {
  const lk = ctx.sourceId ? findPermanent(state, ctx.sourceId) : null;
  if (!lk) return state;
  const next = addCounter(state, { permanentId: ctx.sourceId, type: atom.counterType, amount: atom.amount || 1 });
  return logEvent(next, { kind: "spell-effect", effect: "add-named-counter-self", counterType: atom.counterType, amount: atom.amount || 1, targets: [ctx.sourceId] });
}

// ADD-NAMED-COUNTER-SELF parser — "put a <name> counter on this (artifact|permanent|creature)". Anchored
// end-to-end; the counter NAME must be a single bare word that is NOT a ±1/+1 form (those are owned by
// addCounterClauseParser above and route to the creature-only self path). Numeric/spelled N supported.
//
// SELF-NAMED-CREATURE (frontier round 4): a creature self-counter — "put a spore counter on this creature"
// (the Thallid upkeep, CR 122.1; Door of Destinies' "this artifact" is the same atom). The ±1/+1 self form
// stays on addCounter (target:"self", which runs the lethal-SBA / doubler / counters-placed-watcher passes
// a ±1/+1 needs); a NAMED counter is never a P/T counter, so applyAddNamedCounterSelf (sourceId, any
// permanent type — the resolver already creature-agnostic) is exactly right and needs no SBA pass. Adding
// "creature" here only routes the named (non-±1/+1) form, so it can never steal a ±1/+1 self clause from
// addCounter (the [a-z]+ NAME never matches "+1/+1", belt-and-suspenders below). A filter / rider / "on this
// creature for each …" → no match → low → Arbiter (a SAFE false-negative). Pure. Registered via
// registerClauseParser. This is the piece that makes "At the beginning of your upkeep, put a spore counter on
// this creature" (Thallid) — and Door of Destinies' charge-counter cast trigger — resolve natively.
export function addNamedCounterSelfClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  const m = t.match(/^put (a|an|one|two|three|four|five|\d+) ([a-z]+) counters? on this (?:artifact|permanent|creature)$/);
  if (!m) return null;
  // ±1/+1 forms are spelled with digits + slash and never match [a-z]+; this guard is belt-and-suspenders.
  if (/^[+-]?1\/[+-]?1$/.test(m[2])) return null;
  return { op: "add-named-counter-self", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10) };
}

/**
 * REMOVE-NAMED-COUNTER-SELF (CR 122.3) — remove one (or N) NAMED (non-±1/+1) counter from the SOURCE permanent
 * itself ("remove a slumber counter from this creature" — Arixmethes' cast trigger; the mirror of
 * applyAddNamedCounterSelf). The source is read from ctx.sourceId (threaded by the trigger flush, CR 113.7) and
 * may be ANY permanent type. A named counter is never a P/T counter, so no lethal-SBA pass is needed. Absent
 * source (already left the battlefield) OR no counters of that kind present → a clean no-op (never a negative
 * count), matching the CR 122.3 "can't remove a counter that isn't there" reality. Goes through
 * gameState.removeCounter, which floors the pile at 0 and drops it when it hits 0.
 *
 * OPTIONAL ("you may remove …") — the trigger flush already gates an optional trigger's whole effect on the
 * controller's decision (the `optional` flag on the detected trigger), so this atom itself always removes when
 * run; the "may" is honored one level up. For the self-play engine, the fewer slumber counters the better
 * (Arixmethes becomes a creature sooner), so the optional trigger is taken whenever it fires.
 */
export function applyRemoveNamedCounterSelf(state, atom, ctx) {
  const lk = ctx.sourceId ? findPermanent(state, ctx.sourceId) : null;
  if (!lk) return state;
  const have = lk.permanent.counters?.[atom.counterType] || 0;
  if (have <= 0) return state; // nothing to remove — a clean no-op (CR 122.3)
  const amount = Math.min(atom.amount || 1, have);
  const next = removeCounter(state, { permanentId: ctx.sourceId, type: atom.counterType, amount });
  return logEvent(next, { kind: "spell-effect", effect: "remove-named-counter-self", counterType: atom.counterType, amount, targets: [ctx.sourceId] });
}

// REMOVE-NAMED-COUNTER-SELF parser — "remove a <name> counter from this (permanent|creature|artifact|
// enchantment)" (a leading "you may " is stripped by the optional-trigger wrapper before this sees the clause,
// but accept it here too so the bare effect clause parses HIGH for triggerRoutesNatively). The counter NAME
// must be a single bare word that is NOT a ±1/+1 form. Numeric/spelled N supported. Whole-clause anchored;
// a filter / rider / "for each" → no match → low → Arbiter (a SAFE false-negative). Pure; registered via
// registerClauseParser. This is the piece that makes Arixmethes' "Whenever you cast a spell, you may remove a
// slumber counter from Arixmethes" cast trigger resolve natively (the self-name is normalized to "this
// creature" upstream, but the raw "from <cardname>" form is also matched via the trailing-word fallback).
//
// RESERVED-KIND GUARD (CREED): fade / time / loyalty are counters owned by OTHER, more-complete subsystems —
// Vanishing/Fading's "remove a time counter from it" lives inside REMINDER text and is fully handled (with its
// "when the last is removed, sacrifice it" rider) by fading.applyFadeVanishUpkeep, NOT by this bare remove.
// Routing that reminder clause through this atom would let a Vanishing card flip native on the PHANTOM reminder
// trigger while its REAL ability (Keldon Marauders' ETB/LTB damage) stays unmodeled — a forbidden FP. Reject
// those kinds here so those cards stay non-native (safe FN); only genuinely card-specific counters (slumber)
// resolve through this atom.
const _REMOVE_SELF_RESERVED_KINDS = new Set(["time", "fade", "loyalty"]);
export function removeNamedCounterSelfClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'").trim().replace(/^you may\s+/, "");
  const m = t.match(/^remove (a|an|one|two|three|four|five|\d+) ([a-z]+) counters? from (?:this (?:permanent|creature|artifact|enchantment)|it)$/);
  if (!m) return null;
  // ±1/+1 forms are spelled with digits + slash and never match [a-z]+; belt-and-suspenders guard.
  if (/^[+-]?1\/[+-]?1$/.test(m[2])) return null;
  if (_REMOVE_SELF_RESERVED_KINDS.has(m[2])) return null; // owned by fading/PW — see RESERVED-KIND GUARD above
  return { op: "remove-named-counter-self", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10) };
}

/**
 * SHIELD-COUNTER (CR 122.1c) — "Put a shield counter on <a creature you control | target creature>". A shield
 * counter is a REAL protective counter: gameState's destruction sites (destroyLethalCreatures SBA +
 * applyDestroyEffect) and damage sites (applyDamageEffect + combatResolution) each check `hasShieldCounter` and
 * consume one via the CR 122.1c replacement/prevention (damage prevented, destruction replaced). This atom just
 * PLACES it — one shield counter on each resolved target — through gameState.addCounter (so a counter doubler
 * composes; a +1/+1-only doubler like Hardened Scales correctly skips a shield counter, while Doubling Season /
 * Vorinclex double it, CR 616). The target list is the shared atomTargets dispatch: `scope:"oneYouControl"` (the
 * Titan mode — the controller's best own creature, auto-picked, non-targeted) or `targetType:"creature"` (the
 * chosen-target forms — Boon of Safety, Perrie — offered by the targeting enumerator). Absent/empty target → a
 * clean no-op (never a fabricated counter). Only CREATURE targets are shielded here (every modeled form targets
 * a creature); a non-creature target descriptor is skipped defensively. */
export function applyShieldCounter(state, atom, ctx) {
  let next = state;
  const targets = atomTargets(state, atom, ctx);
  const placed = [];
  for (const t of targets) {
    const lk = findPermanent(next, t.id);
    if (!lk || !isCreatureCard(lk.permanent.card)) continue;
    next = addCounter(next, { permanentId: t.id, type: "shield", amount: 1 });
    placed.push(t.id);
  }
  return logEvent(next, { kind: "spell-effect", effect: "shield-counter", targets: placed });
}

// SHIELD-COUNTER parser (CR 122.1c) — the two clean, whole-clause-anchored forms that resolve natively:
//   • "put a shield counter on a creature you control"     → scope:"oneYouControl" (non-targeted, controller's
//                                                            best own creature — Titan of Industry's mode)
//   • "put a shield counter on target creature"            → targetType:"creature" (a chosen target — Boon of
//                                                            Safety, Perrie, the Pulverizer's ETB lead)
// A SINGLE shield counter only ("a shield counter"); a multi-count / multi-target / filtered / permanent-typed
// form ("on each of up to three target creatures", "on target permanent", "on another target creature you
// control", "on target noncommander creature you don't control") is NOT matched here → null → low → Arbiter (an
// FN-safe park — those carry cardinality/scope this atom doesn't model, and a partial model would be an FP).
// The trailing reminder text "(If it would be dealt damage or destroyed, …)" is already stripped by
// stripReminder before clause parsing. Pure; registered via registerClauseParser.
export function shieldCounterClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'").trim();
  if (t === "put a shield counter on a creature you control") return { op: "shield-counter", scope: "oneYouControl" };
  if (t === "put a shield counter on target creature") return { op: "shield-counter", targetType: "creature" };
  return null;
}

export const counterResolvers = {
  "add-counter": applyAddCounter,
  "shield-counter": applyShieldCounter, // SHIELD COUNTER (CR 122.1c) — a protective counter; consumed at the damage/destruction sites in gameState
  "add-named-counter-self": applyAddNamedCounterSelf, // CHOSEN-TYPE cast trigger (Door of Destinies): named counter on the source artifact
  "remove-named-counter-self": applyRemoveNamedCounterSelf, // ARIXMETHES cast trigger: remove a slumber counter from the source permanent
  "gain-experience": applyGainExperience, // EARTHBEND-PR3 — "you get an experience counter" (Toph landfall)
  "rad": applyRad, // RAD (CR 728) — "each/target player gets N rad counter(s)" (The Wise Mothman); engine mills + drains at precombat main
  "proliferate": applyProliferate, // PROLIFERATE (CR 701.27) — add one of each counter kind to never-harmful picks
};
