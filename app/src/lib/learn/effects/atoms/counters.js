/**
 * effects/atoms/counters.js — counter atoms (add-counter, proliferate, gain-experience, rad).
 */

import { logEvent, destroyLethalCreatures, opponentsOf, findPermanent, addCounter, addPoison, addExperience, addRadCounters } from "../../gameState.js";
import { checkDiesTriggers } from "../../triggers.js";
import { atomTargets, isCreatureCard, countForSpec } from "./shared.js";
import { SMALL_NUM, parseCountSource } from "../parseHelpers.js"; // seam batch 3: shared number-word map (leaf, cycle-free) + DYNAMIC-COUNT board-count source

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
  const amount = atom.countContext
    ? Math.max(0, ctx[atom.countContext] || 0) // CDMG-PLAYER-PAYOFF — "that many" = combatDamageAmount, floor 0
    : Math.max(0, atom.amount || 0);
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
  for (const t of targets) {
    if (amount > 0 && t.type === "creature" && findPermanent(next, t.id)) {
      next = addCounter(next, { permanentId: t.id, type: atom.counterType, amount });
    }
  }
  // -1/-1 counters lower DERIVED toughness — run the lethal SBA so a creature it
  // drops to 0 dies at resolution (the P2.3 negative-pump discipline).
  if (atom.counterType === "-1/-1") {
    const r = destroyLethalCreatures(next);
    next = checkDiesTriggers(r.state, r.dead);
  }
  return logEvent(next, { kind: "spell-effect", effect: "add-counter", counterType: atom.counterType, amount, targets: targets.map(t => t.id) });
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
 * N rad counters", who:"damagedPlayer"; "each opponent gets … equal to its power", who:"eachOpponent") stay in
 * parseExtendedAtom with the rest of the CDMG-PLAYER-PAYOFF family. Pure; uses the shared SMALL_NUM leaf map.
 */
export function radClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  const radEachM = t.match(/^each (player|opponent) gets (\d+|a|an|one|two|three|four|five) rad counters?$/);
  if (radEachM) return { op: "rad", amount: SMALL_NUM[radEachM[2]] ?? parseInt(radEachM[2], 10), who: radEachM[1] === "opponent" ? "eachOpponent" : "eachPlayer", targetType: null };
  const radYouM = t.match(/^you get (\d+|a|an|one|two|three|four|five) rad counters?$/);
  if (radYouM) return { op: "rad", amount: SMALL_NUM[radYouM[1]] ?? parseInt(radYouM[1], 10), who: "controller", targetType: null };
  const radTgtM = t.match(/^target (player|opponent) gets (\d+|a|an|one|two|three|four|five) rad counters?$/);
  if (radTgtM) return { op: "rad", amount: SMALL_NUM[radTgtM[2]] ?? parseInt(radTgtM[2], 10), who: "target", targetType: radTgtM[1] };
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
  m = t.match(/^put (a|an|one|two|three|four|five|\d+) ([+-]1\/[+-]1) counters? on target creature you control$/);
  if (m) return { op: "add-counter", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), targetType: "creatureYouControl" };
  m = t.match(/^put (a|an|one|two|three|four|five|\d+) ([+-]1\/[+-]1) counters? on this creature$/);
  if (m) return { op: "add-counter", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), target: "self" };
  m = t.match(/^put (a|an|one|two|three|four|five|\d+) ([+-]1\/[+-]1) counters? on up to one target creature$/);
  if (m) return { op: "add-counter", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), targetType: "creature", optionalTarget: true };
  m = t.match(/^put (a|an|one|two|three|four|five|\d+) ([+-]1\/[+-]1) counters? on each creature you control$/);
  if (m) return { op: "add-counter", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), scope: "youControl" };
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

// ADD-NAMED-COUNTER-SELF parser — "put a <name> counter on this (artifact|permanent)". Anchored end-to-end;
// the counter NAME must be a single bare word that is NOT a ±1/+1 form (those are owned by addCounterClauseParser
// above and route to the creature-only self path). Numeric/spelled N supported. A different subject ("on this
// creature" → addCounter), a filter, or a rider → no match → low → Arbiter (a SAFE false-negative). This is the
// piece that makes Door of Destinies' "Whenever you cast a spell of the chosen type, put a charge counter on
// this artifact" trigger resolve natively. Pure. Registered via registerClauseParser.
export function addNamedCounterSelfClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  const m = t.match(/^put (a|an|one|two|three|four|five|\d+) ([a-z]+) counters? on this (?:artifact|permanent)$/);
  if (!m) return null;
  // ±1/+1 forms are spelled with digits + slash and never match [a-z]+; this guard is belt-and-suspenders.
  if (/^[+-]?1\/[+-]?1$/.test(m[2])) return null;
  return { op: "add-named-counter-self", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10) };
}

export const counterResolvers = {
  "add-counter": applyAddCounter,
  "add-named-counter-self": applyAddNamedCounterSelf, // CHOSEN-TYPE cast trigger (Door of Destinies): named counter on the source artifact
  "gain-experience": applyGainExperience, // EARTHBEND-PR3 — "you get an experience counter" (Toph landfall)
  "rad": applyRad, // RAD (CR 728) — "each/target player gets N rad counter(s)" (The Wise Mothman); engine mills + drains at precombat main
  "proliferate": applyProliferate, // PROLIFERATE (CR 701.27) — add one of each counter kind to never-harmful picks
};
