/**
 * effects/atoms/misc.js — misc atoms (draw, fog, create-emblem, divide-damage).
 */

import { applyDrawEffect } from "../../spellEffects.js";
import { logEvent, addEmblem, addMana, holdMana, opponentsOf, grantFlashThisTurn } from "../../gameState.js";
import { parseFlashCastFilter } from "../../staticAbilityParser.js"; // the STATIC grant's own filter parser — reused so the turn-scoped twin cannot drift from it
import { setPendingDivideChoice } from "../../pendingChoice.js";
import { resolveScaledAmount, isCreatureCard, countForSpec } from "./shared.js";
import { findPermanent } from "../../gameState.js"; // ADD-RESTRICTED-MANA — the source card's color identity read (same leaf edge as line 6)
import { NUM_WORD, parseCountSource } from "../parseHelpers.js"; // seam batch 23 (NUM_WORD, each-player draw) + 26 (parseCountSource, for-each draw)
import { parseSpendRestriction } from "../../manaModel.js"; // SARKHAN-FIREBLOOD restricted add — the planner's OWN restriction parser, reused so the arm can't drift from what the spender enforces (read only inside the clause parser — init-safe)

/**
 * Draw (CR 120) — the ACTOR is the atom's `who`:
 *   - undefined / "controller" (the legacy + "draw N cards" form) — the spell's controller draws.
 *   - "eachPlayer" ("Each player draws N cards" — Vision Skeins) — EVERY player draws.
 *   - "target" ("Target player draws N cards" — Opportunity / Ancestral Recall) — the chosen player(s) draw.
 * Each drawing player goes through applyDrawEffect, the SINGLE source of truth for a draw (shared with the
 * legacy cast path), so the each/target forms are byte-identical to a controller draw, just for a different
 * player. amountX (an {X}-draw) reads ctx.xValue for EVERY actor form — controller, each-player, and
 * target ("Target player draws X cards" = Braingeyser/Stroke of Genius; "Each player draws X cards" =
 * Prosperity) — because the parser's amountX path preserves `who` and resolveScaledAmount resolves the
 * bound X regardless of actor. An eliminated/removed player id is skipped (no throw).
 *
 * CDMG-PLAYER-PAYOFF — `countContext` reads a trigger-context number ("draw that many cards" = the combat-
 * damage amount the combat-damage trigger carries as ctx.combatDamageAmount; Starwinder, Glint-Eye Nephilim).
 * It floors at 0 (never forced to 1) and is a clean no-op as a spell / non-combat trigger (no such ctx key →
 * draw 0), never a fabricated count. Mirrors the create-named-token countContext path verbatim.
 */
function applyDrawAtom(state, atom, ctx) {
  // ONCE-PER-TURN gate (COUNTERS-PLACED — Terrasymbiosis "draw that many cards. Do this only once each turn."):
  // if this source already fired its once-per-turn draw this turn, suppress it (a safe no-op — the trigger
  // resolved, but the draw is skipped per CR's frequency restriction). Mirrors applyDiscoverAtom's latch; only
  // the controller-draw form carries oncePerTurn (the corpus once-per-turn draws are all "you draw").
  if (atom.oncePerTurn) {
    const gateKey = `${ctx.sourceId || ""}_draw`;
    if ((state.onceTriggersFiredThisTurn || {})[gateKey]) return state;
  }
  const amount = atom.countContext
    ? Math.max(0, ctx[atom.countContext] || 0) // CDMG-PLAYER-PAYOFF / COUNTERS-PLACED — "draw that many cards", floor 0
    : resolveScaledAmount(state, atom, ctx); // FOR-EACH: count × per (else amountX / printed)
  let next;
  if (atom.who === "eachPlayer") {
    next = state;
    for (const pid of Object.keys(state.players)) {
      if (next.players[pid]) next = applyDrawEffect(next, { controller: pid, amount });
    }
  } else if (atom.who === "target") {
    next = state;
    for (const t of ctx.targets || []) {
      if (t.type === "player" && next.players[t.id]) next = applyDrawEffect(next, { controller: t.id, amount });
    }
  } else if (atom.who === "upkeepPlayer") {
    // UPKEEP-PLAYER DRAW (BLITZ TR-2 — Seizan's "… and draws two cards" half): the player whose upkeep it
    // is, ctx.upkeepPlayerId (threaded by checkStepTriggers). Absent / eliminated referent (a spell, a
    // non-upkeep event) → draw nobody (a clean no-op, never a fabricated or wrong-player draw).
    const pid = ctx.upkeepPlayerId;
    next = pid && state.players?.[pid] ? applyDrawEffect(state, { controller: pid, amount }) : state;
  } else if (atom.who === "triggeringPermanentController") {
    // ITS-CONTROLLER DRAW (IC-1 — Fate Foretold): ctx.triggeringPermanentController. Absent → draw nobody,
    // never the ability's controller (see the parse arm — that fallback is the wrong seat by construction).
    const pid = ctx.triggeringPermanentController;
    next = pid && state.players?.[pid] ? applyDrawEffect(state, { controller: pid, amount }) : state;
  } else {
    next = applyDrawEffect(state, { controller: ctx.controller, amount });
  }
  // Set the once-per-turn latch (regardless of the drawn count — the effect ran, so the gate is consumed).
  if (atom.oncePerTurn) {
    const gateKey = `${ctx.sourceId || ""}_draw`;
    next = { ...next, onceTriggersFiredThisTurn: { ...(next.onceTriggersFiredThisTurn || {}), [gateKey]: true } };
  }
  return next;
}

/**
 * ===== FOG ===== (FOG-1, CR 615 prevention) — "Prevent all combat damage that would be dealt this turn."
 * Stamp the current turn onto state.preventCombatDamageTurn; combatResolution.resolveCombatDamage skips
 * ALL combat damage (both the first-strike and regular steps) while that flag === state.turn, then it
 * SELF-EXPIRES (next turn's number differs, so no cleanup is needed). Non-targeted, no choice; the flag
 * is a plain number so a mid-combat serialize/restore is byte-identical.
 */
function applyFog(state, atom, ctx) {
  // PLAYERS-ONLY scope (BLITZ FOG-1b — Defend the Hearth): stamp the players-fog flag instead; the
  // combat funnel zeroes only player-directed deals (creature-vs-creature combat still lands). The
  // bare whole-turn form keeps the incumbent flag + resolveCombatDamage's whole-step short-circuit.
  const next = atom.scope === "players"
    ? { ...state, preventCombatPlayersTurn: state.turn }
    : { ...state, preventCombatDamageTurn: state.turn };
  return logEvent(next, { kind: "spell-effect", effect: "fog", controller: ctx.controller, turn: state.turn, ...(atom.scope === "players" ? { scope: "players" } : {}) });
}

/**
 * ===== FORCED-ATTACK ===== (FORCE-ATTACK-1, CR 508.1a / 802) — "Creatures your opponents control attack
 * this turn if able." (Bident of Thassa's {1}{U},{T} activated ability). Every creature each opponent of the
 * ACTIVATOR (ctx.controller) controls now carries an ATTACK requirement THIS turn: at their declare-attackers
 * step it must attack (a player or planeswalker) if it's able — untapped, no summoning sickness, not otherwise
 * restricted (CR 508.1a checks the requirement only against creatures that CAN legally attack, so a tapped /
 * defender / can't-attack creature is a clean no-op — it's simply not "able"). Turn-scoped like the Fog latch:
 * stamp `forcedToAttackTurn[opponentId] = state.turn` for each opponent, which self-expires the moment the turn
 * number advances (no cleanup needed) and serializes as a plain number map (a mid-turn save/restore is
 * byte-identical). The ENFORCEMENT lives in opponentAI.pickAttackPlan (the batch attacker picker force-includes
 * every eligible attacker for a seat under an active force this turn), mirroring the self-must-attack path. A
 * removed/eliminated opponent is skipped by opponentsOf's live-seat read. Non-targeted; a removed activator is a
 * clean no-op. The `who` is currently only "opponents" (Bident's exact wording); a broader referent would gate
 * a distinct atom shape (CREED — never over-apply the force to seats the printed text doesn't name).
 */
function applyForceAttack(state, atom, ctx) {
  if (!ctx.controller || !state.players?.[ctx.controller]) return state; // removed/eliminated activator → clean no-op
  const affected = atom.who === "opponents" ? opponentsOf(state, ctx.controller) : [];
  if (affected.length === 0) return state;
  const stamped = { ...(state.forcedToAttackTurn || {}) };
  for (const pid of affected) if (state.players?.[pid]) stamped[pid] = state.turn;
  const next = { ...state, forcedToAttackTurn: stamped };
  return logEvent(next, { kind: "spell-effect", effect: "force-attack", controller: ctx.controller, affected, turn: state.turn });
}

/**
 * ===== ONE-SHOT EXTRA-LAND ===== (CR 505.5b / 305.2) — "You may play [an|up to N] additional land[s] this
 * turn." A RESOLVING effect (Explore, Summer Bloom, Urban Evolution) that RAISES the controller's per-turn
 * land-play budget for THIS turn only. Bumps player.extraLandsThisTurn by atom.amount; legalChoices
 * .landDropAllowance adds that budget (1 + Σ static-extra + extraLandsThisTurn), and resetTurnCounters zeroes
 * it each of the player's turns, so it never persists like the static "each of your turns" form. The "may"
 * is satisfied for free — granting the OPTION to play more lands costs nothing and is never a downside (the
 * player simply chooses whether to use the bigger budget at the land-play step), so no yes/no pause is needed
 * (CR 601.3e — a player isn't forced to play the extra land). Non-targeted; a removed controller is a clean
 * no-op. `atom.amount ?? 1` (not `|| 1`) so a parsed +0 — impossible from the anchored parser, but
 * defensively — would add exactly 0, never a fabricated land.
 */
function applyPlayExtraLandThisTurn(state, atom, ctx) {
  const player = state.players?.[ctx.controller];
  if (!player) return state; // removed/eliminated controller → clean no-op
  const add = atom.amount ?? 1;
  const next = {
    ...state,
    players: {
      ...state.players,
      [ctx.controller]: { ...player, extraLandsThisTurn: (player.extraLandsThisTurn || 0) + add },
    },
  };
  return logEvent(next, { kind: "spell-effect", effect: "play-extra-land-this-turn", controller: ctx.controller, amount: add });
}

/**
 * ===== EMBLEM ===== (PW-5, CR 114) — "You get an emblem with '[ability]'." Give the controller an
 * emblem carrying the quoted ability text (addEmblem). The parser only emits this atom when the
 * ability is a modeled static (a clean anthem the layer engine can apply); the emblem's effect then
 * applies continuously via layers.emblemEffectsOf. Non-targeted; a removed controller is a clean no-op.
 */
function applyCreateEmblem(state, atom, ctx) {
  if (!ctx.controller || !state.players?.[ctx.controller]) return state;
  const next = addEmblem(state, { playerId: ctx.controller, oracle: atom.emblemOracle || "" });
  return logEvent(next, { kind: "spell-effect", effect: "create-emblem", controller: ctx.controller });
}

/**
 * ===== DIVIDE ===== (MT-1) — "deals N damage divided as you choose among any number of target X." Gather
 * the legal target set per `atom.group` (every battlefield's creatures, and/or every player) and PAUSE for
 * the caster's division (setPendingDivideChoice); resolveDivideChoice (runProgram) applies the per-target
 * damage. Non-targeted at cast — the division is a resolution-time choice — so no ctx.targets are consumed.
 * Numeric `atom.amount` only for now (an {X} divide is a fast-follow). EXPORTED for direct testing; it is
 * intentionally NOT in ATOM_RESOLVERS yet (so divide-damage stays low → Arbiter until the picker + driver +
 * UI all land — no native-but-unplayable false positive). 0 amount / no legal target → a logged no-op.
 */
export function applyDivideDamage(state, atom, ctx) {
  const amount = atom.amount || 0;
  const group = atom.group || "anyTarget";
  if (amount <= 0) return logEvent(state, { kind: "spell-effect", effect: "divide-damage", controller: ctx.controller, amount: 0 });
  const candidates = [];
  if (group !== "players") {
    for (const pid of Object.keys(state.players)) {
      for (const perm of state.players[pid].battlefield) {
        if (isCreatureCard(perm.card)) candidates.push({ id: perm.id, name: perm.card?.name, type: "creature", controller: pid });
      }
    }
  }
  if (group !== "creatures") {
    for (const pid of Object.keys(state.players)) candidates.push({ id: pid, name: pid, type: "player", controller: pid });
  }
  if (candidates.length === 0) return logEvent(state, { kind: "spell-effect", effect: "divide-damage", controller: ctx.controller, amount, candidates: 0 });
  return setPendingDivideChoice(state, { controller: ctx.controller, amount, candidates, group, sourceName: ctx.cardName, maxTargets: atom.maxTargets ?? null });
}

/**
 * Misc clause parsers (migrated from parseExtendedAtom, seam batch 8 / Wave A3):
 *   - fog: "prevent all combat damage that would be dealt this turn" (bare whole-turn prevention only; a
 *     filtered/keyword-rider form leaves trailing text → low → Arbiter).
 *   - divide-damage: "<source> deals N damage divided as you choose among <target group>" (N is fixed;
 *     group ∈ creatures / players / anyTarget). divide-damage IS in ATOM_RESOLVERS (resolver+picker wired),
 *     so it routes native; a bounded "one or two targets" or any rider fails `$` → low.
 * Both whole-clause-anchored, mutually exclusive. Pure (no parser.js import — cycle-safe); normalizes the
 * clause exactly as parseExtendedAtom does. Registered via registerClauseParser in parser.js.
 */
export function miscClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  if (/^prevent all combat damage that would be dealt this turn$/.test(t)) return { op: "fog", targetType: null };
  // EXTRA-TURN (BLITZ XT-1, CR 500.7 — Time Walk / Temporal Manipulation / Capture of Jingzhou / Time
  // Warp): "Take an extra turn after this one." The resolver pushes the CONTROLLER onto state.extraTurns;
  // gameEngine.advanceStep's end-of-turn branch POPS the stack (most-recently-created first, CR 500.7)
  // instead of rotating, so the extra turn is a full normal turn and rotation resumes with the normally-
  // scheduled player afterward. Whole-clause anchored ($): a rider in the SAME sentence ("… after this
  // one. Exile ~" is a separate sentence and gates via the whole-card rule; "target player takes an
  // extra turn" / "take two extra turns" / a skip-step rider never matches) → low → Arbiter (FN-safe —
  // an extra turn credited to the wrong player would be a catastrophic FP).
  if (/^take an extra turn after this one$/.test(t)) return { op: "extra-turn", targetType: null };
  // TURN-SCOPED FLASH GRANT (CR 601.3e) — "You may cast [<FILTER>] spells this turn as though they had
  // flash." The STATIC form is modeled in staticAbilityParser (Yeva, Vedalken Orrery) and its matcher
  // comment names this very gap: "Anchored ^…$ so any rider variant ('… this turn') never matches."
  // Same permission, same spec shape, different duration.
  //
  // The "you may " prefix is OPTIONAL in this anchor because the α2 peel strips it before the clause
  // parsers run, so the peeled form must produce the identical atom. The op is listed in that peel's
  // NON-optional allowlist (beside free-cast / play-extra-land-this-turn): a permission is costless
  // upside with no resolution-time decision, so stamping `optional` would add a meaningless yes/no pause.
  //
  // The FILTER is parsed by the static's own parseFlashCastFilter; an unmodeled qualifier returns null
  // there → this clause fails → low → Arbiter (all-or-nothing, CREED).
  const fl = t.match(/^(?:you may )?cast (.*?)spells this turn as though they had flash$/);
  if (fl) {
    const spec = parseFlashCastFilter(fl[1].trim());
    return spec ? { op: "grant-flash-this-turn", spec, targetType: null } : null;
  }
  // EXTRA-COMBAT (CR 500.8 — Aurelia the Warleader #820, Karlach #1039, Genji Glove #1229, Great Train
  // Heist #1118, Lightning Runner, Tifa). "After this phase, there is an additional combat phase" and its
  // reversed word order. The resolver pushes a run onto state.extraPhases; gameEngine.advanceStep pops it
  // when leaving end-of-combat and jumps BACK to beginning-of-combat (increment 1).
  //
  // The optional "followed by an additional main phase" tail is accepted but needs NO modelling: once the
  // queue drains, the normal forward transition already lands on postcombat-main, and CR 505.1a says every
  // main phase after the first IS a postcombat main. So the printed promise is kept by doing nothing.
  //
  // ⛔ THE "AFTER THIS MAIN PHASE" FORM IS NOT THIS ARM and parks deliberately (Aggravated Assault #699,
  // Relentless Assault #1543, Seize the Day, Full Throttle). Those insert after a MAIN phase, which is a
  // different insertion point than end-of-combat — the queue would fire at the wrong moment, granting a
  // combat the card did not. Increment 3 gives the queue entry its own insertion point; until then a
  // safe FN. Full Throttle's "two additional combat phases" is out for the same reason plus its count.
  //
  // "AFTER THIS COMBAT PHASE" is the SAME insertion point spelled out (Raphael, Tag Team Tough — the only
  // corpus printing of it). Every carrier of this wording is a combat trigger, so "this phase" and "this
  // combat phase" name the same phase; it is a synonym, not a second mechanism. Kept as its own alternative
  // rather than an optional `(combat )?` group so the after-MAIN form can never be reached by widening.
  if (/^after this (?:combat )?phase, there is an additional combat phase(, followed by an additional main phase)?$/.test(t)
      || /^there is an additional combat phase after this phase(, followed by an additional main phase)?$/.test(t)) {
    return { op: "extra-combat", targetType: null };
  }
  // ===== EXTRA-COMBAT, AFTER-MAIN INSERTION (Increment 3, 2026-08-12 — Aggravated Assault #699,
  // Relentless Assault #1543, Seize the Day) ===== "After this main phase, there is an additional combat
  // phase[ followed by an additional main phase]." The queue entry carries its OWN insertion point
  // (after:"main") and advanceStep pops it when a MAIN phase ends — the promised additional main is the
  // normal forward transition out of the inserted combat (CR 505.1a: every main after the first is a
  // postcombat main), exactly the argument the after-combat arm above already makes.
  // ⓘ THE PRECOMBAT-ACTIVATION CORNER, stated honestly: activated/resolved BEFORE the normal combat, the
  // model jumps main → extra combat → postcombat main and the turn's NORMAL combat is not replayed — one
  // FEWER combat than CR 500.8 grants in that corner. Under-delivery (FN-safe), never an extra combat the
  // card didn't pay for; the AI line (activate in the postcombat main) is modeled exactly.
  if (/^after this main phase, there is an additional combat phase(,? followed by an additional main phase)?$/.test(t)) {
    return { op: "extra-combat", insertAfter: "main", targetType: null };
  }
  // TAPPED-COUNT DRAW (BLITZ TD-1 — Theft of Dreams / Borrowing 100,000 Arrows): "Draw a card for each
  // tapped creature target opponent controls." The CONTROLLER draws; the chosen OPPONENT target only
  // supplies the count (countForSpec's tappedCreaturesOfTargetOpponent — layer-aware creature read at
  // resolution, CR 608.2h). Whole-clause anchored ($): a different counter ("untapped"), scope ("each
  // opponent"), or drawer never matches → low → Arbiter (FN-safe).
  if (/^draw a card for each tapped creature target opponent controls$/.test(t)) {
    return { op: "draw", who: "controller", targetType: "opponent", amountCount: { kind: "tappedCreaturesOfTargetOpponent" } };
  }
  // THIS-TURN LURE (BLITZ LU-2, CR 509.1c — Alluring Scent / Bloodscent / Taunting Challenge, and
  // Mortipede's activated self form): "All creatures able to block (target creature|this creature) this
  // turn do so." A turn-scoped BLOCK REQUIREMENT stamped on ONE creature (state.lureThisTurn[permId] =
  // turn — self-expiring, the FOG-1/preventCombatDamageTurn latch pattern) and enforced at the SAME
  // versioned bar as the printed lure (LU-1): opponentAI.pickBlockers force-assigns every legal blocker
  // of a lured attacker; the human seat is never hard-gated. Whole-clause anchored ($): the "it"-anaphor
  // form (Declare Dominance), a conditional rider (Roar of Challenge's Ferocious), or any scope variant
  // never matches → low → Arbiter (FN-safe).
  if (/^all creatures able to block target creature this turn do so$/.test(t)) {
    return { op: "lure-this-turn", targetType: "creature" };
  }
  if (/^all creatures able to block this creature this turn do so$/.test(t)) {
    return { op: "lure-this-turn", target: "self", targetType: null };
  }
  // FORCED-ATTACK (FORCE-ATTACK-1, CR 508.1a) — "Creatures your opponents control attack this turn if able."
  // (Bident of Thassa). A turn-scoped combat REQUIREMENT on every creature the activator's opponents control:
  // the force-attack atom stamps forcedToAttackTurn[opponentId] and opponentAI.pickAttackPlan force-declares
  // every ABLE attacker for a forced seat that turn. Whole-clause anchored ($) — a filtered/subtype scope
  // ("nonblue creatures", "creatures target opponent controls") or any rider leaves residue → no match → low
  // → Arbiter (CREED: never widen or narrow the printed "your opponents control" referent).
  if (/^creatures your opponents control attack this turn if able$/.test(t)) return { op: "force-attack", who: "opponents", targetType: null };
  // ONE-SHOT EXTRA-LAND (CR 505.5b) — "[you may] play [an|up to N] additional land[s] this turn." A resolving
  // SELF one-shot land-budget bump (Explore +1, Summer Bloom "up to three" → +3, Urban Evolution +1). The
  // parser's α2 wrapper PEELS the leading "you may" before this runs (and leaves the atom UN-optional — the
  // "may" is realized at the land-play step, where the player chooses whether to use the bigger budget, NOT as
  // a resolution yes/no; granting the option is costless upside), so the canonical match is the PEELED form;
  // the optional leading "you may" is tolerated for a direct clause-first call (tests). Whole-clause anchored
  // ($) — a rider, a "from your graveyard"/"exiled this way" qualifier, or the SYMMETRIC "each player may play
  // …" leaves residue → no match → low → Arbiter (CREED: the budget reader is controller-only, so a symmetric
  // grant must never model as a self-only bump). The variable "X additional lands" form (Nahiri's Lithoforming)
  // has no fixed N → not matched → its whole card stays non-native (safe FN). "an"/"one".."ten" + a numeric "2
  // additional", with or without the "up to" cap (the cap is irrelevant to the budget — you may always play
  // FEWER lands; CR 601.3e), all parse to N.
  const eld = t.match(/^(?:you may )?play (?:up to )?(an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) additional lands? this turn$/);
  if (eld) {
    const W = { an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    const n = /^\d+$/.test(eld[1]) ? parseInt(eld[1], 10) : (W[eld[1]] || 0);
    if (n > 0) return { op: "play-extra-land-this-turn", amount: n, targetType: null };
    return null; // unparsed N → low → Arbiter (never a fabricated 0-land budget)
  }
  // RITUAL-MANA — "Add {C}{C}{C}" (Dark Ritual, Pyretic Ritual, Seething Song, Channel the Suns). A spell that
  // adds basic mana to the controller's pool (applyAddMana → addMana per color). PURE basic symbols only —
  // {X}, hybrid/Phyrexian, snow {S}, or a rider ("Add {R}{R}{R}. Spend this mana only on…") fails the anchor →
  // low → Arbiter (FN-safe; a restricted-use ritual would over-credit if modeled as plain mana).
  // JESKA'S WILL (2026-08-14) — the scaled targeted add: "Add {R} for each card in target opponent's
  // hand". One color symbol × the targeted opponent's hand size (resolved live in applyAddMana);
  // targetType opponent rides the normal enumeration.
  const mth = t.match(/^add \{([wubrgc])\} for each card in target opponent's hand$/);
  if (mth) return { op: "add-mana", manaPerTargetHand: mth[1].toUpperCase(), targetType: "opponent" };
  const rit = t.match(/^add ((?:\{[wubrgc]\})+)$/);
  if (rit) {
    const mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    for (const sym of rit[1].match(/\{([wubrgc])\}/g)) mana[sym.replace(/[{}]/g, "").toUpperCase()]++;
    return { op: "add-mana", mana, targetType: null };
  }
  // ANY-COLOUR MANA (CR 106.1b) — "add one mana of any color" (Lotus Cobra's landfall, Outcaster Trailblazer's
  // ETB, Quirion Sentinel). The MANA-ABILITY side has understood this phrasing forever (Birds of Paradise is
  // native-mana), but a tap source can DEFER the choice — manaSources hands the planner colors:[W,U,B,R,G] and
  // the colour is settled at payment. A resolution-time add has no such luxury: addMana takes one colour and
  // the pool has no wildcard slot, so the colour must be committed here (see applyAddMana).
  //
  // ⚠️ N=1 ONLY, deliberately. "add TWO mana of any ONE color" is a different promise (N of a single chosen
  // colour) and "add two mana of any color" lets the two DIFFER — modelling either as one colour would
  // silently narrow the player's options. At N=1 there is no ambiguity: the two templatings mean the same
  // thing. The corpus prints "one mana of any color" 615 times against 35/23/29 for the multi forms, so the
  // narrow arm is most of the value with none of the guessing; the rest stay LOW → Arbiter (safe FN).
  const anyColorOne = t.match(/^add one mana of any (?:one )?color$/);
  if (anyColorOne) return { op: "add-mana", anyColor: 1, targetType: null };
  // HELD-MANA (CR 500.4's printed exception) — the SAME add, plus the printed promise that it outlives the
  // step that made it: "Add {R}. This mana lasts until end of combat." (firebending, and every other carrier
  // of that sentence — all 30 in the corpus use end-of-combat, so the duration is matched literally rather
  // than parsed into a general timing vocabulary we cannot yet honor). Modeled as a pool CAP via holdMana,
  // NOT as plain mana: crediting the plain form would hand the player mana that evaporates a step early.
  // KLAUTH (QUARTET Phase 4, 2026-08-15) — the three-sentence restricted-mana instruction (splitClauses
  // keeps it folded; splitting would let the add parse alone and mint UNRESTRICTED mana — the laundering
  // FP). One atom: the X add (layer-aware total attacking power) + the @any-spell restriction + the
  // until-end-of-turn hold, minted as a player.restrictedMana entry by applyAddRestrictedMana.
  if (/^add x mana in any combination of colors, where x is the total power of attacking creatures\. spend this mana only to cast spells\. until end of turn, you don't lose this mana as steps and phases end$/.test(t)) {
    return { op: "add-restricted-mana", anyCombination: true, amountCount: { kind: "totalAttackingPower" },
      restriction: { castTypes: ["@any-spell"] }, holdUntilEndOfTurn: true, targetType: null };
  }
  // SARKHAN FIREBLOOD's +1 (2026-08-15) — the FIXED-amount restricted add ("Add two mana in any
  // combination of colors. Spend this mana only to cast Dragon spells."), the two-sentence sibling of
  // the Klauth arm above (splitClauses keeps the pair folded — the same laundering-FP guard: the add
  // alone would mint UNRESTRICTED mana). The restriction is parsed by manaModel.parseSpendRestriction
  // ITSELF — the same vocabulary, conjunctive-phrase, and anti-lossy-tail guards the payment planner
  // enforces, so this arm cannot admit a phrase the spender would refuse; a refused phrase keeps the
  // clause LOW → Arbiter. No hold flag: the mana empties as steps end (CR 500.4) like any pool.
  // (CR 605.1a — a loyalty "Add" is NOT a mana ability, so this atom resolving via the stack is the
  // correct fidelity for its Sarkhan carrier, not a shortcut.)
  const restrictedAdd = t.match(/^add (one|two|three|four|five) mana in any combination of colors\. (spend this mana only to cast [a-z][a-z ]*? spells)$/);
  if (restrictedAdd) {
    const restriction = parseSpendRestriction(`${restrictedAdd[2]}.`);
    if (restriction) return { op: "add-restricted-mana", anyCombination: true, amount: NUM_WORD[restrictedAdd[1]], restriction, targetType: null };
  }
  const held = t.match(/^add ((?:\{[wubrgc]\})+) lasting until end of combat$/);
  if (held) {
    const mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    for (const sym of held[1].match(/\{([wubrgc])\}/g)) mana[sym.replace(/[{}]/g, "").toUpperCase()]++;
    return { op: "add-mana", mana, holdUntilEndOfCombat: true, targetType: null };
  }
  const m = t.match(/^.+ deals (\d+) damage divided as you choose among (any number of target creatures and\/or players|any number of target creatures|any number of targets|any number of target players)$/);
  if (m) {
    const GROUP = { "any number of target creatures and/or players": "anyTarget", "any number of target creatures": "creatures", "any number of targets": "anyTarget", "any number of target players": "players" };
    return { op: "divide-damage", amount: parseInt(m[1], 10), group: GROUP[m[2]] };
  }
  // DIVIDE-BOUNDED — "deals N damage divided as you choose among one or two / one, two, or three TARGETS"
  // (Arc Lightning, Twin Bolt, Forked Bolt, Flames of the Firebrand, Chandra's Pyrohelix). Reuses the SAME
  // divide-damage resolver/picker, no picker change: the printed cap (2 or 3 targets) is enforced FOR FREE
  // because the picker requires ≥1 damage per chosen target and the total is `amount` — so as long as
  // amount ≤ maxTargets, the effective target count can never exceed the printed bound, making it behave
  // identically to the unbounded `any number` group. When amount > maxTargets (Forked Lightning N=4, max 3;
  // Sundering Stroke N=7) the bound WOULD bite and the unbounded picker would over-target → return null →
  // low → Arbiter (CREED: never emit an over-targeting divide). A "… target creatures with flying" (Aerial
  // Volley) leaves residue past `$` → no match → Arbiter (the resolver's `creatures` group can't filter).
  const b = t.match(/^.+ deals (\d+) damage divided as you choose among (one or two|one, two, or three) (targets|target creatures|target players)$/);
  if (b) {
    const amount = parseInt(b[1], 10);
    const maxTargets = b[2] === "one or two" ? 2 : 3;
    const GROUP = { "targets": "anyTarget", "target creatures": "creatures", "target players": "players" };
    // SHELF CAP13 — the bound is now CARRIED and ENFORCED (auto-pick + settle + submit guard) rather than
    // being relied upon to fall out of the per-target >=1 rule. The old arm refused any card whose amount
    // EXCEEDED its target cap (`amount > maxTargets` -> null), because an unbounded picker would then
    // over-target -- a real FP, correctly refused at the time. With the cap threaded, Forked Lightning
    // (4 damage among three targets) and its kin are honestly playable, so the refusal is gone.
    return { op: "divide-damage", amount, group: GROUP[b[3]], maxTargets };
  }
  return null;
}

/**
 * DRAW (each-player slice) clause parser — migrated from parseExtendedAtom (seam batch 23 / Wave C). ONLY the
 * actor-extended forms beyond the controller: "each player draws N cards" (who:"eachPlayer", non-targeted) +
 * "target player draws N cards" (who:"target", targetType:"player"). Numeric/spelled N only; a rider / variable
 * count / trailing text fails the `$` anchor → low → Arbiter. The controller-only "draw N cards" stays on the
 * legacy path, and the combat-damage / for-each / dying-power draw clusters stay inline (different shapes).
 * Pure; uses the NUM_WORD leaf. Registered via registerClauseParser in parser.js.
 */
export function drawEachPlayerClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  let m = t.match(/^each player draws (\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "draw", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "eachPlayer", targetType: null };
  // ⭐ TARGET **OPPONENT** DRAWS (TO-1 — Bargain, Sphinx of Enlightenment): the sibling arm this parser
  // never got. `target (player|opponent) loses N life` (life.js) and the target-opponent discard arm
  // (hand.js) both already carry it; draw and gain-life were the two holdouts, and the wording was the
  // only thing missing. targetType "opponent" NARROWS to non-controller seats — the printed truth, and the
  // safe direction (reusing "player" would let the card be pointed at its own controller).
  m = t.match(/^target (player|opponent) draws (\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "draw", amount: NUM_WORD[m[2]] ?? parseInt(m[2], 10), who: "target", targetType: m[1] };
  // ===== UPKEEP-PLAYER DRAW (BLITZ TR-2, CR 503.1a / 121.1) ===== "the upkeep player draws N cards" — the
  // SENTINEL detectTriggers emits for an "each player's upkeep" trigger's "that player draws …" (Seizan's
  // draw half, split off the drain by the parser's upkeep-player normalizer). Corpus-clean phrase (only the
  // event-gated rewrite produces it); who:"upkeepPlayer" reads ctx.upkeepPlayerId, and the triggerRouting
  // referent gate pins the atom to the upkeep event (any other event → referent unset → clean no-op).
  // "ADDITIONAL" is descriptive, not mechanical (CR 121.1): the ability instructs a draw of N cards, and the
  // word only relates them to the turn-based draw the step already provides — nothing about what resolves
  // changes. Widened here and NOWHERE else because this is the only phrasing the corpus prints: "that player
  // draws N additional cards" is on 12 cards (Kami of the Crescent Moon #1817, Rites of Flourishing #1524,
  // Font of Mythos #2207, Howling Mine #723), while "each player draws N additional" and "target player
  // draws an additional" appear ZERO times. Widening those siblings on symmetry alone would be speculative.
  // ⭐ ITS-CONTROLLER DRAW (IC-1 — Fate Foretold "when enchanted creature dies, its controller draws a
  // card"): the same sentinel discipline as the upkeep arm below, reading ctx.triggeringPermanentController.
  // ⛔ The default draw branch draws for the ABILITY's controller — the wrong seat here by construction,
  // since Fate Foretold is usually YOUR aura on an OPPONENT'S creature, so falling through would hand you
  // the card the card gives them.
  m = t.match(/^the triggering permanent's controller draws (\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "draw", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "triggeringPermanentController", targetType: null };
  m = t.match(/^the upkeep player draws (\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten) (?:additional )?cards?$/);
  if (m) return { op: "draw", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "upkeepPlayer", targetType: null };
  return null;
}

/**
 * DRAW (for-each / count-scaled) clause parser — migrated from parseExtendedAtom (seam batch 26 / Wave C). The
 * non-targeted controller-DRAW count-scaled forms (now a clean contiguous cluster — the life for-each siblings
 * migrated in batch 17), original first-match order:
 *   "draw cards equal to the greatest power/toughness among <src>" (DRAW-METRIC — Soul's Majesty/Garruk) → per:1
 *   "draw N cards for each <src>"                                  → amountCount.per = N (a→1)
 *   "draw cards equal to the number of <src>"                      → per:1
 * The amount is a board count × per, computed at resolution (parseCountSource + resolveScaledAmount). The
 * greatest-among form is checked FIRST (distinct "greatest … among" phrasing). An unmodeled count source
 * (parseCountSource → null) drops the clause → low → Arbiter. Non-targeted (targetType:null). Pure; uses the
 * parseCountSource leaf. Registered via registerClauseParser in parser.js.
 */
export function drawForEachClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  // DRAW-BY-TARGET-POWER — "draw cards equal to the power|toughness of target creature[ you control]" (Soul's
  // Majesty: "Draw cards equal to the power of target creature you control."). A CHOSEN single creature target
  // (targetType:"creature", optional controller:you restriction) whose layer-aware power/toughness AT RESOLUTION
  // (CR 608.2h, via the TARGET-STAT countForSpec branch reading ctx.targets) is the draw count. Whole-clause
  // anchored ($) — a rider ("…, then discard"), a filtered target ("nonland creature"), or a non-target board
  // form leaves residue → no match → low → Arbiter (CREED — never an over/under-count or a mis-targeted draw).
  // The bare "target creature" (no "you control") form is referent-identical and trivially correct if a card
  // ever prints it (none in the corpus today) — a safe FN-free generalization sharing the same resolver path.
  // SACRIFICED REFERENT (CR 608.2h + 603.6e LKI) — "draw cards equal to the sacrificed creature's power"
  // (Life's Legacy #2490, Tom Bert and William, Susur Secundi). The third reader off the one capture
  // actionDispatcher writes at cost-payment time; the permanent is gone by resolution, so it cannot be read
  // from the board. Note this takes NO targetType, unlike the target-creature arm just below it — the
  // referent is the already-paid cost, not a chosen target, so offering a target here would be a wrong cast.
  const sacD = t.match(/^(?:you )?draw cards equal to the sacrificed (?:creature|permanent|artifact)'s (power|toughness|mana value)$/);
  if (sacD) {
    const kind = sacD[1] === "power" ? "sacrificedPower" : sacD[1] === "toughness" ? "sacrificedToughness" : "sacrificedManaValue";
    return { op: "draw", amountCount: { kind, per: 1 }, targetType: null };
  }
  const mtp = t.match(/^(?:you )?draw cards equal to the (power|toughness) of target creature( you control)?$/);
  if (mtp) {
    const kind = mtp[1] === "power" ? "targetCreaturePower" : "targetCreatureToughness";
    return {
      op: "draw", targetType: "creature",
      ...(mtp[2] ? { restrictions: [{ kind: "controller", who: "you" }] } : {}),
      amountCount: { kind, per: 1 },
    };
  }
  let mfe = t.match(/^(?:you )?draw cards equal to the (greatest (?:power|toughness) among .+)$/);
  if (mfe) {
    const src = parseCountSource(mfe[1]);
    return src ? { op: "draw", amountCount: { ...src, per: 1 }, targetType: null } : null;
  }
  mfe = t.match(/^(?:you )?draw (a|\d+) cards? for each (.+)$/);
  if (mfe) {
    const src = parseCountSource(mfe[2]);
    return src ? { op: "draw", amountCount: { ...src, per: mfe[1] === "a" ? 1 : parseInt(mfe[1], 10) }, targetType: null } : null;
  }
  mfe = t.match(/^(?:you )?draw cards equal to the number of (.+)$/);
  if (mfe) {
    const src = parseCountSource(mfe[1]);
    return src ? { op: "draw", amountCount: { ...src, per: 1 }, targetType: null } : null;
  }
  return null;
}

/**
 * SELF-CAST HALF-X (CR 107.3) — the controller-side "gain half X life" / "draw half X cards" magnitudes of a
 * "When you cast this spell" trigger on an {X}-cost spell (Hydroid Krasis: "you gain half X life and draw half
 * X cards. Round down each time."). Each half = floor/ceil(X/2): amountX:true makes applyGainLife / applyDrawAtom
 * read ctx.xValue via resolveScaledAmount, and halve ("floor"/"ceil") rounds it (the resolution machinery —
 * effectiveAmount in shared.js — already supports amountX + halve; this is the missing PARSE side). The cast's X
 * is threaded into the trigger's effect program by the SELF-CAST runtime (checkCastTriggers → context.xValue →
 * buildTriggerStack → params.xValue), so off a spell with no X (ctx.xValue absent) it's a clean 0 — never a
 * fabricated magnitude. CREED: gated on ctx.hasX (an {X} cost) + the EXACT "rounded down/up" suffix the
 * splitClauses fold attaches from the trailing "Round down each time." directive; a bare "half X" with no stated
 * rounding (ambiguous) or a non-X spell leaves the clause unmatched → low → Arbiter. The ", rounded up" inline
 * form (Contaminated Drink's rad) is a DIFFERENT op and unaffected. Registered via registerClauseParser.
 */
export function selfCastHalfXClauseParser(clause, ctx = {}) {
  if (!ctx.hasX) return null;
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'").trim();
  let m = t.match(/^(?:you )?gain half x life rounded (down|up)$/);
  if (m) return { op: "gain-life", amountX: true, halve: m[1] === "up" ? "ceil" : "floor", targetType: null };
  m = t.match(/^(?:you )?draw half x cards? rounded (down|up)$/);
  if (m) return { op: "draw", amountX: true, halve: m[1] === "up" ? "ceil" : "floor", targetType: null };
  return null;
}

/**
 * RITUAL-MANA (CR 605 / 106.4) — a spell that adds basic mana to the controller's pool (Dark Ritual "Add
 * {B}{B}{B}"). Adds each color via addMana; the pool empties at end of step/phase as usual, so the mana is
 * usable for a same-window cast (ramp). Only the BARE add-basic-mana form is modeled (the parser rejects
 * restricted-use riders / {X} / hybrid), so this never over-credits a "spend only on…" ritual.
 */
const WUBRG = ["W", "U", "B", "R", "G"];

/**
 * Which colour does "one mana of any color" actually produce at resolution?
 *
 * CR 106.1b lets the player choose; the pool has no wildcard slot, so the sim must commit. The choice is
 * made from the CONTROLLER'S COMMANDER COLOUR IDENTITY (CR 903.4) — the deck's usable colours, and the
 * closest honest proxy for what a player would pick — falling back to the SOURCE permanent's own colours
 * for a seat with a colourless commander.
 *
 * ⚠️ WHY NOT the source card's colours FIRST: a colourless artifact source ("When this enters, add one mana
 * of any color") would answer nothing, and the deck identity is the better guide anyway. And why the command
 * zone is read INLINE rather than through layers.commanderColorIdentity: that helper is module-local, and
 * exporting it would add a manaModel-adjacent edge into layers — the edge class that crashed module init two
 * slices ago while the suite stayed green. The codebase already prefers a local copy for exactly this reason
 * (see OUTLAW_SUBTYPE_LIST's "kept local to avoid coupling"). It reads plain state, so there is nothing to
 * drift.
 *
 * Returns null when NOTHING is determinable (no coloured commander AND a colourless source). The caller then
 * adds nothing: an honest no-op on a degenerate board, never a fabricated colour.
 */
function anyColorChoice(state, ctx) {
  const identity = new Set();
  for (const c of state?.players?.[ctx.controller]?.command || []) {
    for (const letter of (c?.colorIdentity ?? c?.color_identity ?? [])) identity.add(String(letter).toUpperCase());
  }
  let pick = WUBRG.find((c) => identity.has(c));
  if (pick) return pick;
  for (const p of state?.players?.[ctx.controller]?.battlefield || []) {
    if (p.id !== ctx.sourceId) continue;
    const cols = p.card?.colors ?? p.card?.colorIdentity ?? [];
    pick = WUBRG.find((c) => cols.map((x) => String(x).toUpperCase()).includes(c));
    break;
  }
  return pick || null;
}

export function applyAddMana(state, atom, ctx) {
  let next = state;
  // JESKA'S WILL (2026-08-14) — "Add {R} for each card in target opponent's hand": the amount is the
  // TARGETED opponent's LIVE hand size at resolution (CR 608.2h). A departed/absent target → 0 added
  // (a clean no-op, never a fabricated count).
  if (atom.manaPerTargetHand) {
    const tid = (ctx.targets || []).find((t) => t.type === "player")?.id;
    const n = tid ? (state.players?.[tid]?.hand || []).length : 0;
    if (n > 0) next = addMana(next, { playerId: ctx.controller, color: atom.manaPerTargetHand, amount: n });
    return logEvent(next, { kind: "spell-effect", effect: "add-mana", controller: ctx.controller, mana: { [atom.manaPerTargetHand]: n } });
  }
  // ANY-COLOUR add — the amount is EXACT (one), only the colour is chosen, so a suboptimal pick can only
  // ever be a play-QUALITY loss, never more mana than printed.
  if (atom.anyColor) {
    const color = anyColorChoice(state, ctx);
    if (!color) return next;                       // nothing determinable → add nothing, never a guess
    next = addMana(next, { playerId: ctx.controller, color, amount: atom.anyColor });
    return logEvent(next, { kind: "spell-effect", effect: "add-mana", controller: ctx.controller, mana: { [color]: atom.anyColor } });
  }
  for (const color of Object.keys(atom.mana || {})) {
    if (atom.mana[color] > 0) {
      next = addMana(next, { playerId: ctx.controller, color, amount: atom.mana[color] });
      // HELD-MANA — raise the survival cap alongside the add, so this mana (and only this much of it) is
      // still there for the rest of combat. Cleared at end-of-combat; see gameEngine.emptyManaPools.
      if (atom.holdUntilEndOfCombat) next = holdMana(next, { playerId: ctx.controller, color, amount: atom.mana[color] });
    }
  }
  return logEvent(next, { kind: "spell-effect", effect: "add-mana", controller: ctx.controller, mana: atom.mana });
}

/**
 * EXTRA-TURN (BLITZ XT-1, CR 500.7) — push the controller onto the extra-turn STACK. CR 500.7: extra
 * turns are taken one at a time, and when multiple have been created the MOST RECENTLY created is taken
 * first — so this is a LIFO stack, popped by gameEngine.advanceStep's end-of-turn branch in place of the
 * normal rotation. Rotation then resumes from the extra turn's taker (nextInTurnOrder of the SAME seat),
 * which is exactly the normally-scheduled turn — no bookkeeping of the "skipped" seat is needed. The
 * entry carries only the player id; the extra turn itself is a full normal turn (untap → cleanup).
 */
/**
 * TURN-SCOPED FLASH GRANT (CR 601.3e) — stamp the casting permission on the CONTROLLER for this turn.
 * legalChoices.flashPermissionSpecsFor reads it alongside the battlefield statics;
 * gameState.resetSpellsCastAllPlayers clears it at untap with the other per-turn player state.
 */
export function applyGrantFlashThisTurn(state, atom, ctx) {
  const next = grantFlashThisTurn(state, ctx.controller, atom.spec);
  return logEvent(next, { kind: "spell-effect", effect: "grant-flash-this-turn", controller: ctx.controller });
}

export function applyExtraTurn(state, atom, ctx) {
  const next = { ...state, extraTurns: [...(state.extraTurns || []), { player: ctx.controller }] };
  return logEvent(next, { kind: "spell-effect", effect: "extra-turn", controller: ctx.controller, queued: next.extraTurns.length });
}

/**
 * EXTRA-COMBAT (CR 500.8) — push one combat run onto the extra-phase QUEUE. CR 500.8: extra phases are
 * added directly after the specified phase, and when several are created after the same phase "the most
 * recently created phase will occur first" — the same LIFO the extra-TURN stack above uses, and the reason
 * advanceStep pops from the END.
 *
 * The queue is per-STATE (never the module-level TURN_SEQUENCE, which is shared by every game), and each
 * run is popped as it is taken, so N grants give exactly N extra combats and the turn always terminates.
 */
export function applyExtraCombat(state, atom, ctx) {
  // SIGNATURE FIX (2026-08-12, found adding the after-main arm): this resolver was (state, ctx) while the
  // registry calls (state, atom, ctx) — the atom landed in the ctx slot and the log's `controller` read
  // atom.controller (undefined). The queueing behavior was always right; only the log line lied.
  // AFTER-MAIN (Increment 3): the entry carries its insertion point — advanceStep pops after:"main"
  // entries when a MAIN phase ends, and the classic entries (after absent ⇒ "combat") at end-of-combat.
  const next = { ...state, extraPhases: [...(state.extraPhases || []), { kind: "combat", ...(atom?.insertAfter === "main" ? { after: "main" } : {}) }] };
  return logEvent(next, { kind: "spell-effect", effect: "extra-combat", controller: ctx?.controller, after: atom?.insertAfter || "combat", queued: next.extraPhases.length });
}

/**
 * THIS-TURN LURE (BLITZ LU-2, CR 509.1c) — stamp the turn-scoped lure marker on the chosen creature
 * (or the SOURCE for Mortipede's activated self form). state.lureThisTurn maps permanentId → the turn
 * stamped, and opponentAI.pickBlockers treats a marked attacker exactly like a printed-lure carrier
 * while the turn matches — the marker self-expires (next turn's number differs; the FOG-1 latch
 * pattern, no cleanup needed). A departed target → no stamp (CR 608.2b — atomTargets already skips
 * vanished ids on the chosen path; the self form reads ctx.sourceId, absent → a clean no-op).
 */
export function applyLureThisTurn(state, atom, ctx) {
  const ids = atom.target === "self"
    ? (ctx.sourceId ? [ctx.sourceId] : [])
    : (ctx.targets || []).filter((t) => t.type === "creature").map((t) => t.id);
  if (!ids.length) return logEvent(state, { kind: "spell-effect", effect: "lure-this-turn", lured: 0, controller: ctx.controller });
  const marks = { ...(state.lureThisTurn || {}) };
  for (const id of ids) marks[id] = state.turn;
  return logEvent({ ...state, lureThisTurn: marks }, { kind: "spell-effect", effect: "lure-this-turn", lured: ids.length, controller: ctx.controller });
}

/**
 * ADD-RESTRICTED-MANA (Klauth — QUARTET Phase 4): mint a tagged player.restrictedMana entry of X mana.
 * X = the amountCount read (totalAttackingPower — layer-aware, summed at resolution). ANY-COMBINATION
 * house policy (documented deterministic, the riot discipline): spread X round-robin across the SOURCE
 * card's color identity (color_identity ?? colors ?? the cost's pips — Klauth spreads R/G), falling
 * back to {C} when no identity is derivable. A suboptimal spread is a play-QUALITY loss only — the
 * planner treats the entry's colors as generic-payable too, and the mana can never exceed X (CREED).
 */
function applyAddRestrictedMana(state, atom, ctx) {
  // A FIXED amount (Sarkhan Fireblood's "Add two mana …") reads atom.amount directly; the count-derived
  // form (Klauth's X) keeps its countForSpec read byte-identically.
  const x = atom.amount != null ? Math.max(0, atom.amount) : Math.max(0, countForSpec(state, ctx, atom.amountCount) || 0);
  if (x === 0) return logEvent(state, { kind: "spell-effect", effect: "add-restricted-mana", controller: ctx.controller, amount: 0 });
  const src = ctx.sourceId ? findPermanent(state, ctx.sourceId) : null;
  const card = src?.permanent?.card;
  let colors = Array.isArray(card?.color_identity) && card.color_identity.length ? card.color_identity.map((c) => String(c).toUpperCase())
    : Array.isArray(card?.colors) && card.colors.length ? card.colors.map((c) => String(c).toUpperCase())
    : [...new Set([...(String(card?.mana || card?.mana_cost || "").matchAll(/\{([WUBRG])\}/g))].map((m) => m[1]))];
  // No derivable identity (a SPELL-source mint — Desolation of Smaug — threads no source permanent):
  // an anyCombination atom spreads WUBRG (the printed "any combination of COLORS" can't produce {C},
  // and any spread is a legal player choice); only a non-anyCombination mint keeps the {C} floor.
  if (!colors.length) colors = atom.anyCombination ? ["W", "U", "B", "R", "G"] : ["C"];
  const pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (let i = 0; i < x; i++) pool[colors[i % colors.length]] += 1; // round-robin — deterministic
  const entry = { pool, restriction: atom.restriction, ...(atom.holdUntilEndOfTurn ? { holdUntilEndOfTurn: true } : {}) };
  const player = state.players[ctx.controller];
  if (!player) return state;
  const next = { ...state, players: { ...state.players, [ctx.controller]: { ...player, restrictedMana: [...(player.restrictedMana || []), entry] } } };
  return logEvent(next, { kind: "spell-effect", effect: "add-restricted-mana", controller: ctx.controller, amount: x, pool });
}

export const miscResolvers = {
  "add-restricted-mana": applyAddRestrictedMana, // Klauth — the pool-restricted sub-pool's first minter
  "draw": applyDrawAtom, // ===== EACH-PLAYER ===== who-aware: controller / eachPlayer / target player
  "extra-combat": applyExtraCombat, // ===== EXTRA-COMBAT ===== (CR 500.8) — queue one additional combat phase; advanceStep pops it leaving end-of-combat
  "grant-flash-this-turn": applyGrantFlashThisTurn, // CR 601.3e — the TURN-SCOPED twin of the static flash-cast permission
  "extra-turn": applyExtraTurn, // ===== EXTRA-TURN ===== (XT-1, CR 500.7) — "Take an extra turn after this one": a LIFO stack popped at advanceStep's end-of-turn branch
  "lure-this-turn": applyLureThisTurn, // ===== THIS-TURN LURE ===== (LU-2, CR 509.1c) — a turn-scoped block requirement marker, enforced in opponentAI.pickBlockers at the LU-1 bar
  "add-mana": applyAddMana, // RITUAL-MANA — "Add {C}{C}{C}" adds basic mana to the controller's pool
  "fog": applyFog, // ===== FOG ===== (FOG-1) prevent all combat damage this turn — a turn-scoped latch
  "force-attack": applyForceAttack, // ===== FORCED-ATTACK ===== (FORCE-ATTACK-1, CR 508.1a) — "Creatures your opponents control attack this turn if able" (Bident): a turn-scoped attack requirement enforced in opponentAI.pickAttackPlan
  "play-extra-land-this-turn": applyPlayExtraLandThisTurn, // ===== ONE-SHOT EXTRA-LAND ===== (CR 505.5b) bump the controller's per-turn land budget (Explore/Summer Bloom/Urban Evolution); reset each turn
  "create-emblem": applyCreateEmblem, // ===== EMBLEM ===== (PW-5) "you get an emblem with '[modeled static]'"
  // ===== DIVIDE ===== (MT-1) — split N damage among any number of targets via a resolution-time picker.
  // Wired end-to-end: applyDivideDamage → setPendingDivideChoice → driver (AI auto-distributes /
  // human assigns via the LearnView DivideDamagePanel) → resolveDivideChoice applies it through the
  // deal-damage atom. (distribute-counters reuses this same picker — fast-follow.)
  "divide-damage": applyDivideDamage,
};
