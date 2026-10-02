/**
 * enterReplacements.js — the replacement effects that modify how a permanent enters the battlefield (CR 614.1c, 614.1d,
 * 614.12), read in ONE place for EVERY entry path:
 *   · the resolving permanent spell — resolvers.enterPermanent (the cast entry; also the clone copy, the Aura spell, the
 *     graveyard self-return and the command-zone visit, which enter through it);
 *   · every permanent put onto the battlefield without being cast — effects/atoms/zones.enterCardFromZone (reanimation,
 *     put-from-hand, put-from-library, blink returns, Living Death, Rise of the Dark Realms, undying / persist returns).
 * Before this module the non-cast path carried only the imposition (Kismet) and the planeswalker loyalty, so a reanimated
 * Diregraf Ghoul ("This creature enters tapped.") entered untapped and a reanimated Spike Feeder ("This creature enters with
 * two +1/+1 counters on it.") entered with none and died to the next state-based check. One function, two callers: the
 * paths cannot drift.
 *
 * WHAT DIFFERS BY PATH is only what the caller knows about HOW the permanent arrived, passed as `opts`: the cast's {X}
 * (opts.xValue), its kicks (opts.kicked / opts.timesKicked), the colours spent (opts.colorsSpent), the zone it was cast from
 * (opts.castFromZone) and a clone copy's extra counter (opts.extraCounter). A permanent that wasn't cast passes none of them:
 *   · its {X} is 0 (CR 107.3g — a card in any zone other than the stack has X = 0; CR 107.3m — X in an enters replacement is
 *     the spell's X only when a spell became the permanent), so "enters with X +1/+1 counters" adds nothing — a reanimated
 *     Walking Ballista or Hangarback Walker is a 0/0;
 *   · no kick, no colour spent, not cast from a hand — the kicker, sunburst / converge and cast-from-hand counters add nothing.
 * Every other replacement reads the card and the board, so it applies however the permanent arrives (CR 614.12).
 *
 * THE BOARD the replacements read (`state`) is the board as the permanent enters: it is not on the battlefield, so no
 * "other" count sees it and it never doubles its own counters (CR 616). The cast entry's card is the resolving spell; a
 * non-cast entry's card is still in the zone it is leaving (zones.enterCardFromZone) — a Golgari Grave-Troll returned from
 * the graveyard counts itself (its bundled ruling). When several cards enter in ONE event (zones.enterCardsTogether, the
 * mass returns), every one of them reads the board as that event began: a replacement applies only if its effect already
 * exists (CR 614.12), so a newcomer's static never modifies another newcomer's entry — a creature entering at the same time
 * as Renata, Called to the Hunt gets no counter from her, and Squad Captain counts only the creatures already on the
 * battlefield (both bundled rulings).
 *
 * Leaf over the readers both callers already import (staticAbilityParser, landEntersTapped, layers, triggers, the keyword
 * leaves); it imports neither resolvers.js nor any effect atom that reaches it, so zones.js (under effectAtoms → parser)
 * imports it statically without the resolvers → runProgram → effectAtoms cycle.
 */

import { castsAsPlaneswalker, planeswalkerEntryLoyalty, opponentsOf, loseLife, logEvent } from "./gameState.js";
import { othersEnterWithCounters, entersWithPlusCounters, entersWithMinusCounters, entersWithXCounters, sunburstCounterKind, convergeEntersCounters, entersWithMetricCounters, entersWithNamedCounters, entersWithCountersPerKick, entersWithCastFromHandCounters, choosesColorOnEnter, entersWithConditionalCounters, entersWithChoiceCounters, entersTapped, impositionEntersTapped, auraChoosesColorOnEnter, riotKeywordCount } from "./staticAbilityParser.js"; // TRUNK-ENTERSCOUNTERS (CR 614.1c + 122.6a) + TRUNK-ENTERSTAPPED (CR 614.1c) + ENTERS-WITH-X + ETB-XCOUNTERS-FROM-METRIC + ENTERS-WITH-NAMED-COUNTERS (Arixmethes slumber) + ENTERS-WITH-CONDITIONAL/CHOICE (BLITZ EW-1: Morbid/Raid counters; Ikoria keyword-counter choice) + CHOSEN-COLOR (Utopia Sprawl) + KW-RIOT (CR 702.136 — enters-with-choice: counter or haste)
import { addContinuousEffect, permanentPower, permanentToughness, permIsEveryCreatureType } from "./layers.js"; // KW-RIOT haste branch — a layer-6 permanent-duration addKeyword Haste grant scoped to the entering permanent (the earthbend/animate precedent); layers imports no atoms and not resolvers
import { conditionalEntersTapped, paysLifeOrEntersTapped, autoPickOptionalLifePayment, revealLandEntersTapped } from "./landEntersTapped.js"; // LANDS-TIER — "enters tapped unless <condition>"; a leaf over interveningIf
import { cardIsEveryCreatureType } from "./everyCreatureType.js"; // P·39b — the entering creature is every creature type (Changeling, its controller's Maskwood Nexus) for "each other Elf enters with a counter"; a leaf over keywords.js
import { autoPickCreatureType } from "./choicePolicy.js"; // CR 614.12 auto-choice policy — a zero-import LEAF, shared with the effect atoms. One copy, so an ETB choice and an activated choice can never diverge on the same board.
import { chosenCardTypeOnEnter } from "./chosenCardType.js"; // CLOUD KEY (CR 614.12a) — the card-type choice made as a permanent enters; a leaf over choicePolicy only
import { entersWithFadeCounters } from "./fading.js"; // KW-FADING / KW-VANISHING — enters with N fade/time counters
import { parseFabricate, decideFabricate, applyFabricateServos } from "./fabricate.js"; // KW-FABRICATE — ETB choice: N +1/+1 counters OR N 1/1 Servo tokens
import { entersWithKickedCounters } from "./kicker.js"; // KICKER (CR 702.33e) — "If this creature was kicked, it enters with N +1/+1 counters"; added only when opts.kicked
import { parseTribute, decideTribute, tributeIfNotClause } from "./tribute.js"; // TRIBUTE (CR 702.104a) — opponent's as-enters choice: pay N +1/+1 counters OR the "if tribute wasn't paid" effect fires (leaf)
import { applyCounterDoubling } from "./replacementEffects.js"; // Wave-3 doubler (leaf): enters-with-counters bypasses addCounter, so double here
import { countForSpec } from "./effects/atoms/shared.js"; // ETB-XCOUNTERS-FROM-METRIC: resolve a board-metric counter count (shared → gameState / layers / interveningIf only)
import { evaluateInterveningIf } from "./interveningIf.js";
import { modularKeywordValues, checkSagaChapterTriggers } from "./triggers.js";
import { parseSagaChapters } from "./saga.js"; // SAGA (CR 714 — Vault 12, SHELF S7): entry lore counter + sagaFinal stamp; a pure leaf

// CHOSEN-TYPE state primitive (Kindred Discovery family) — does this card say "As <it> enters, choose a
// creature type"? Anchored to the bare creature-type chooser (CR 614.12 — a choose-a-type-as-it-enters
// replacement). NOT "choose a card type / land type / planeswalker type" (a different chooser the engine
// doesn't model), and NOT an activated/spell-level "Choose a creature type" (those carry no "as ~ enters").
const CHOOSE_CREATURE_TYPE_ETB_RE = /\bas\b[^.]*\benters\b[^.]*,\s*choose a creature type\b/i;
export function choosesCreatureTypeOnEnter(card) { // exported for the play-land drop (actionDispatcher.applyPlayLand — CAP-CAVERN), through resolvers.js
  return CHOOSE_CREATURE_TYPE_ETB_RE.test(String(card?.oracle || card?.oracle_text || ""));
}

// The creature subtypes printed on a card's type line (the words after the "—", CR 205.3a). [] for a card
// with no subtype dash. Lower-level than layers.subtypesOf (kept local so this leaf stays leaf-ish).
function creatureSubtypesOf(card) {
  const ts = String(card?.type || card?.type_line || "");
  if (!/Creature/.test(ts)) return [];
  const dash = ts.indexOf("—");
  if (dash === -1) return [];
  return ts.slice(dash + 1).trim().split(/\s+/).filter(Boolean);
}

// CHOSEN-TYPE membership (CR 614.12) — does a permanent's `card` carry the creature type `chosenType`?
// Subtype word-bounded on the type line. Mirrors triggers.permHasChosenType + layers.permHasChosenTypeLayer (kept local so
// this leaf stays leaf-ish). Unset chosenType → false. Every creature type (a changeling, CR 702.73a; Mirror Entity's activation)
// is the caller's layers.permIsEveryCreatureType OR (P·39).
function cardHasChosenType(card, chosenType) {
  if (!chosenType || !card) return false;
  return creatureSubtypesOf(card).some((s) => s.toLowerCase() === String(chosenType).toLowerCase());
}

// CHOSEN-TYPE ETB COUNTER (CR 614.1c + 122.6a) — Banner of Kinship: "This artifact enters with a
// <name> counter on it for each creature you control of the chosen type." Detects the exact bare clause
// and returns the counter NAME, or null. Anchored to "for each creature you control of the chosen type" so
// only Banner's shape (and any future twin) matches; a different metric/counter → null → no counter (a SAFE
// false-negative — the card would then not classify native and route to the Arbiter). Pairs with the
// CHOSEN-TYPE COUNT-ANTHEM static (Banner's other clause).
const CHOSEN_TYPE_ETB_COUNTER_RE = /enters (?:the battlefield )?with (?:a|an|one) ([a-z]+) counter on it for each creature you control of the chosen type/i;
function entersWithChosenTypeCounter(card) {
  const m = String(card?.oracle || card?.oracle_text || "").match(CHOSEN_TYPE_ETB_COUNTER_RE);
  return m ? { counterType: m[1].toLowerCase() } : null;
}

// AUTO-PICK the color for a "choose a color as it enters" Aura (CR 614.12b — Utopia Sprawl) in this
// SELF-PLAY engine (no interactive picker). Heuristic: the color the controller's remaining spells most
// NEED — tally the colored pips ({W}/{U}/{B}/{R}/{G}, hybrid counted for each side) across the mana costs
// of cards in the controller's HAND then LIBRARY (what still has to be cast), and pick the most-frequent.
// Ties break in WUBRG order for determinism (serialize-stable — no Map-iteration reliance). Falls back to
// "G" when nothing has a colored pip: the enchanted Forest already produces {G}, so doubling green is the
// safe, always-useful default (and keeps the stamp well-formed so the boost is never dropped). Pure — reads
// the PRE-entry `state` (the Aura isn't on the battlefield yet; it has no mana cost pips of interest anyway).
const CHOOSE_COLOR_WUBRG = ["W", "U", "B", "R", "G"];
export function autoPickManaColor(state, controller, exclude = null) {
  const player = state.players[controller];
  const tally = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const add = (cards) => {
    for (const c of cards || []) {
      const cost = String(c?.card?.mana_cost ?? c?.card?.mana ?? c?.mana_cost ?? c?.mana ?? "");
      for (const m of cost.matchAll(/\{([^}]+)\}/g)) {
        for (const sym of m[1].toUpperCase().split("/")) {
          if (sym in tally) tally[sym] += 1;
        }
      }
    }
  };
  add(player?.hand);
  add(player?.library);
  let best = null;
  let bestN = 0;
  for (const c of CHOOSE_COLOR_WUBRG) {
    if (exclude && c === exclude) continue; // LANDS-12: "choose a color other than <X>" (the Thriving lands, the Gates)
    if (tally[c] > bestN) { best = c; bestN = tally[c]; }
  }
  return best || "G";
}

/**
 * The +1/+1 counters OTHER permanents' "each other creature you control enters with …" statics add to `card` as it enters.
 * "Other" needs no explicit self-check here: the entering permanent is not on the battlefield in the board this reads (a
 * self-exclusion written first was unreachable under mutation and was removed, not kept).
 */
function othersEnterWithCountersFor(state, controller, card) {
  if (!card) return 0;
  const tl = String(card.type || card.type_line || "");
  if (!/\bCreature\b/i.test(tl)) return 0;
  // P·39b — the entering creature as it would exist on the battlefield (CR 614.12): every creature type when it is a changeling or
  // its controller's Maskwood Nexus already applies to the creatures they control. The subtype is a creature type (TARGET_SUBTYPES).
  const entersEvery = cardIsEveryCreatureType(state, card, controller);
  let n = 0;
  for (const p of state?.players?.[controller]?.battlefield || []) {
    if (!p) continue;
    const d = othersEnterWithCounters(p.card);
    if (!d) continue;
    if (d.subject === "planeswalker") continue; // Oath of Gideon's loyalty shape — a creature never reads it (othersEnterWithLoyaltyFor)
    if (d.subtype && !new RegExp(`\\b${d.subtype}\\b`).test(tl) && !entersEvery) continue;
    const metric = d.metric === "sourceToughness" ? permanentToughness(state, p.id)
      : d.metric === "sourcePower" ? permanentPower(state, p.id) : 0;
    n += Math.max(0, d.fixed + metric);
  }
  return n;
}

// GRANTED RIOT (CR 702.136a) — how many battlefield sources give the ENTERING card riot. Rhythm of the Wild
// (#211) and Uncivil Unrest print "Nontoken creatures you control have riot."
//
// ⭐ WHY A BATTLEFIELD SCAN AND NOT A GRANTED KEYWORD. Riot is an AS-ENTERS replacement, so it has to be known
// BEFORE the permanent is on the battlefield — and a layer-6 addKeyword only exists AFTER. Granting it as a
// keyword would leave it sitting on the permanent meaning nothing, with the card reading native: the
// "classifies native, does nothing" trap. So this mirrors applyCounterDoubling instead, which reads printed
// doubler text off the battlefield at the moment counters are placed, for exactly the same reason.
//
// ⛔ CREED gates, all three load-bearing:
//   • the ENTERING card must be a nontoken CREATURE — the printed grant says "Nontoken creatures", and a
//     token or a non-creature permanent must not be handed riot's counter/haste,
//   • the granting permanent must be controlled by the SAME player (the grant reads "you control"),
//   • the clause is matched by the SAME anchored predicate the classifier credits, so metric and runtime
//     cannot drift apart — a card whose text this scan does not recognise is not credited either.
// CR 702.136b (multiple instances work separately) falls out for free: each grant counts once.
function grantedRiotCount(state, controller, card) {
  if (!card || card.token) return 0;
  const tl = String(card.type || card.type_line || "");
  if (!/\bCreature\b/i.test(tl)) return 0;
  let n = 0;
  for (const p of state?.players?.[controller]?.battlefield || []) {
    const oracle = String(p?.card?.oracle || p?.card?.oracle_text || "").replace(/\([^)]*\)/g, " ");
    for (const line of oracle.split("\n")) {
      if (/^\s*nontoken creatures you control have riot\s*\.?\s*$/i.test(line)) n++;
    }
  }
  return n;
}

// KW-RIOT (CR 702.136a) — the DETERMINISTIC, DOCUMENTED house auto-pick for riot's enters-with choice
// ("an additional +1/+1 counter" vs "gains haste"). The controller chooses AS the permanent enters
// (CR 702.136a — its controller chooses), so the pick is decided here against the PRE-entry state.
// POLICY: choose HASTE when the permanent could still attack THIS turn — it enters on its controller's
// OWN turn at or before the declare-attackers step (the beginning / precombat-main phases, or combat's
// beginning-of-combat step). Once declare-attackers has passed, or on any other player's turn, haste can
// no longer buy a swing this turn, so take the durable +1/+1 counter instead. Deterministic + pure over
// (activePlayer, phase, step) — BOTH branches are pinned in riot.test.js. Mirrors the sacCount / oneYouControl
// house auto-pick discipline (a documented policy at the choice site, no per-card hacks).
function riotPicksHaste(state, controller) {
  if (state?.activePlayer !== controller) return false;      // not your turn → can't attack this turn → counter
  const phase = state?.phase;
  if (phase === "beginning" || phase === "precombat-main") return true; // before combat on your turn → could swing
  if (phase === "combat" && state?.step === "beginning-of-combat") return true; // combat, attackers not yet declared
  return false;                                              // declare-attackers passed / postcombat / ending → counter
}

/**
 * Apply every replacement effect that modifies how `base` enters (CR 614.1c, 614.1d, 614.12) — the tapped status, the counters
 * it enters with, and the choices made as it enters (CR 614.12a — made before it enters) — and return
 * `{ perm, settle }`: the permanent as it enters, and what settleEnterReplacements finishes once it is on the battlefield.
 *   · `state` — the board the replacements read (see the module header): pre-entry, the permanent not on the battlefield.
 *   · `base` — the permanent the entry path built (createPermanent + its own stamps). `base.tapped` is the EFFECT's own
 *     instruction ("put it onto the battlefield tapped"); the replacements can only add to it.
 *   · `opts` — the cast facts (xValue, kicked, timesKicked, colorsSpent, castFromZone, extraCounter); a permanent that
 *     wasn't cast passes none.
 * Pure: returns a new permanent object; `state` is only read.
 */
export function applyEnterReplacements(state, base, opts = {}) {
  const card = base.card;
  const controller = base.controller;
  const permId = base.id;
  // THE SHOCKLAND CLAUSE (LANDS-TIER slice 2): decided BEFORE the tapped flag so the tapped flag and the life payment are one
  // decision — the policy pays only when it can (life ≥ N and the written ≥10 floor), and a decision to pay is CHARGED by
  // settleEnterReplacements right after the land joins the battlefield, never left as a free untapped dual. An entry the
  // EFFECT already taps ("put it onto the battlefield tapped" — Farseek) pays nothing: the payment would buy nothing.
  // A shockland entering inside an effect's resolution has no land-entry pause to resume, so the WRITTEN policy decides for
  // every seat (autoPickOptionalLifePayment: pay iff life ≥ 10) and the outcome is logged as an auto-decision. The play-land
  // path (the 95% case) gives a human the real choice. A documented limit, not a hidden one: see
  // landEntersTapped.paysLifeOrEntersTapped.
  const shock = paysLifeOrEntersTapped(card);
  const shockPay = !!(shock && !base.tapped && autoPickOptionalLifePayment(state, controller, shock.life));
  const perm = {
    ...base,
    // TRUNK-ENTERSTAPPED (CR 614.1d — "[This permanent] enters tapped") + KM-1 (an opposing Kismet forces the entry tapped,
    // CR 614.1d) + LANDS-TIER (the CONDITIONAL "enters tapped unless <condition>", read with the entering permanent's own id
    // so an "other lands" count excludes it) + the shockland decided above + the reveal-lands (CR 614.1c).
    tapped: base.tapped || entersTapped(card) || impositionEntersTapped(state, card, controller) || conditionalEntersTapped(state, card, controller, permId) || (shock ? !shockPay : false) || revealLandEntersTapped(state, card, controller),
  };
  // A planeswalker enters with its starting loyalty as loyalty counters (CR 306.5b). Stored under
  // the generic counters map (`counters.loyalty`) so the 0-loyalty SBA + loyalty costs read it the
  // same way +1/+1 counters work. A non-finite printed loyalty (X/*) gets no counter — it never
  // classifies native and the SBA only kills walkers that entered with one. Use castsAsPlaneswalker
  // (front-face) so a creature-front DFC entering as its creature side never gets a spurious loyalty
  // counter from its planeswalker back face.
  // Wave-3 doubler (CR 616): enters-with-counter writes bypass gameState.addCounter (the permanent is not yet
  // on the battlefield), so each routes through applyCounterDoubling directly. `state` here is pre-entry — it
  // has the controller's doublers (Doubling Season etc.) but NOT this permanent (a permanent never doubles its
  // OWN entry counters, CR 616 — the replacement must already exist). Recipient = the entering permanent's
  // controller. A "+1/+1"-only doubler is skipped for loyalty/fade; Doubling Season (any counter) doubles them.
  if (castsAsPlaneswalker(card)) {
    // ONE reader for every entry path (gameState.planeswalkerEntryLoyalty): the printed loyalty + Oath of Gideon's extra
    // counter, doubled once.
    const loy = planeswalkerEntryLoyalty(state, controller, card);
    if (loy != null) perm.counters = { ...perm.counters, loyalty: loy };
  }
  // CLONE CONDITIONAL ENTERS-WITH-COUNTER (Spark Double, CR 707.9a + 614.1c + 122.6a) — an ADDITIONAL counter
  // the clone-resolution path resolved against the copy's type (+1/+1 for a creature copy, loyalty for a
  // planeswalker copy). Applied here so it's on the permanent BEFORE the lethal SBA + before ETB triggers fire,
  // exactly like the other enters-with-counter replacements. Like them it bypasses gameState.addCounter (the
  // permanent isn't on the battlefield yet), so it routes through applyCounterDoubling (CR 616 — a counter
  // doubler like Doubling Season multiplies it; a "+1/+1"-only doubler is skipped for loyalty). Layers on TOP
  // of the starting-loyalty write above for a PW copy (an additional loyalty counter beyond its base loyalty).
  if (opts.extraCounter && opts.extraCounter.n > 0) {
    const { type, n } = opts.extraCounter;
    perm.counters = { ...perm.counters, [type]: (perm.counters[type] || 0) + applyCounterDoubling(state, controller, type, n) };
  }
  // CR 614.1c + 122.6a: "~ enters with N +1/+1 counters on it" — a replacement that adds the counters AS the
  // permanent enters, so its P/T is correct from turn 1 (Kavu Primarch, Avatar of the Resolute…). Only the
  // bare, unconditional, literal-N form (entersWithPlusCounters guards out kicker / "for each" / "where X").
  const plusCounters = entersWithPlusCounters(card);
  if (plusCounters > 0) perm.counters = { ...perm.counters, "+1/+1": (perm.counters["+1/+1"] || 0) + applyCounterDoubling(state, controller, "+1/+1", plusCounters) };
  // ⭐ THE −1/−1 TWIN (CR 614.1c) — Shrewd Hatchling, Bloodied Ghost, Carnifex Demon, Grim Poppet and
  // ~30 more. Same replacement, opposite sign, and the runtime was ALREADY finished: ptPrimitive's
  // counterPtDelta subtracts counters["-1/-1"], so the layer engine has always priced these correctly.
  // Only the parse step was missing, which is why "+1/+1" was native on 28 carriers and "-1/-1" on ZERO.
  // ⛔ NOT run through applyCounterDoubling. Doubling Season and its kin read "if one or more counters
  // WOULD BE PUT ON a permanent YOU CONTROL" — CR 614 doubling applies to counters generally, but this
  // engine's doubler profile is built for the BENEFICIAL +1/+1 case and doubling a drawback the card prints
  // would make these creatures WORSE than printed. A doubler that genuinely doubles −1/−1 counters is a
  // separate, measurable question; silently inheriting the plus twin's call would have answered it by
  // accident. Fail-closed: the printed number, exactly.
  const minusCounters = entersWithMinusCounters(card);
  if (minusCounters > 0) perm.counters = { ...perm.counters, "-1/-1": (perm.counters["-1/-1"] || 0) + minusCounters };
  // MODULAR (BLITZ MOD-1, CR 702.43a) — "Modular N" is (in part) an enters-with-N-+1/+1-counters replacement,
  // but that sentence lives ONLY in the keyword's REMINDER parens (entersWithPlusCounters strips parens →
  // returns 0 for a modular card), so read the count from the keyword itself. modularKeywordValues is the SAME
  // recognizer detectTriggers uses for the dies half, so the two halves can't drift; DIGIT-only, so the variable
  // "Modular—Sunburst" (Arcbound Wanderer) adds nothing here (its per-color count is unmodeled → the card parks).
  // Summed across instances (CR 702.43b — each works separately), through applyCounterDoubling (Doubling Season
  // doubles them too, CR 616), exactly like the unconditional enters-with-counters write above.
  const modularN = modularKeywordValues(card?.oracle || card?.oracle_text || "").reduce((a, b) => a + b, 0);
  if (modularN > 0) perm.counters = { ...perm.counters, "+1/+1": (perm.counters["+1/+1"] || 0) + applyCounterDoubling(state, controller, "+1/+1", modularN) };
  // KICKER (CR 702.33e + 614.1c + 122.6a): "If this creature was kicked, it enters with N +1/+1 counters on
  // it" — a replacement GATED on the was-kicked flag (opts.kicked, threaded from the kicked cast). Added AS
  // the creature enters, so its P/T is right from turn 1, exactly like the unconditional enters-with-counters
  // write above (and through the SAME applyCounterDoubling — Doubling Season doubles the kicked counters too,
  // CR 616). Only when kicked AND the card carries the modeled kicked-counters clause; a normal cast (opts.kicked
  // undefined) adds nothing → the base body enters as printed. entersWithKickedCounters returns null for any
  // non-counter kicked payoff, so this never fabricates a counter for a card whose kicked effect we don't model.
  if (opts.kicked) {
    const kickedCtr = entersWithKickedCounters(card);
    if (kickedCtr && kickedCtr.n > 0) perm.counters = { ...perm.counters, "+1/+1": (perm.counters["+1/+1"] || 0) + applyCounterDoubling(state, controller, "+1/+1", kickedCtr.n) };
    // KICKER keyword grant (CR 702.33e + 614.12): "…and with <keyword>" rides the same kicked enters-with
    // replacement (Benalish Lancer = first strike, Kavu Titan = trample, Duskwalker = fear …). Stamp the
    // granted combat keywords DURABLY on the permanent (a plain string array — serializes like wasKicked,
    // Phase-7). permanentHasKeyword (layers.js) seeds from perm.kickedKeywords (fromKicked), so every combat /
    // evasion / summoning-sickness read honors the grant EXACTLY like a printed keyword (a later "loses <kw>"
    // layer-6 effect still wins). Only keywords entersWithKickedCounters admitted (all GRANTABLE_COMBAT_KEYWORDS).
    if (kickedCtr && kickedCtr.keywords && kickedCtr.keywords.length) {
      perm.kickedKeywords = [...new Set([...(perm.kickedKeywords || []), ...kickedCtr.keywords.map((k) => String(k).toLowerCase())])];
    }
  }
  // ENTERS-WITH-X: "this creature enters with X +1/+1 counters on it" — X is the value paid for the {X}
  // cost (threaded as opts.xValue from the cast). A hydra cast for X=5 enters as a real 5/5+, not a 0/0
  // that dies to the lethal-toughness SBA. Guarded by entersWithXCounters so only the literal-X form gets it.
  // A permanent that wasn't cast has no opts.xValue: its X is 0 (CR 107.3g, 107.3m), so it enters with none.
  if (opts.xValue > 0 && entersWithXCounters(card)) {
    perm.counters = { ...perm.counters, "+1/+1": (perm.counters["+1/+1"] || 0) + applyCounterDoubling(state, controller, "+1/+1", opts.xValue) };
  }
  // ⭐ SUNBURST (CR 702.44a) — a counter for each COLOUR of mana spent to cast it. The count is threaded
  // from the payment plan (opts.colorsSpent, stamped by the cast entry); the KIND comes from the card's own type line,
  // because sunburst puts +1/+1 counters on a creature and CHARGE counters on a non-creature artifact.
  // Routed through applyCounterDoubling like every other enters-with write, so a Doubling Season entry
  // doubles it exactly as it doubles the X-counter form directly above.
  // ⛔ ZERO COLOURS IS A REAL ANSWER and writes nothing — a spell paid entirely with colourless mana gets no
  // counters, which is what the card says. Guarded by `> 0` so no empty counter key is minted. A permanent that
  // wasn't cast spent no mana at all (CR 702.44b — only an object entering from the stack as a resolving spell).
  {
    const sbKind = sunburstCounterKind(card);
    if (sbKind && opts.colorsSpent > 0) {
      perm.counters = { ...perm.counters, [sbKind]: (perm.counters[sbKind] || 0) + applyCounterDoubling(state, controller, sbKind, opts.colorsSpent) };
    }
    // ⭐ CONVERGE (an ability word, CR 207.2c) — the same colour count, written longhand instead of as a keyword, and with
    // a per-colour MULTIPLIER (Glinting Creeper takes two counters per colour). Always +1/+1; the reader
    // refuses any other wording rather than guessing a kind.
    // ⛔ MUTUALLY EXCLUSIVE WITH SUNBURST BY CONSTRUCTION — no corpus card prints both, and the two readers
    // anchor on disjoint text (a bare keyword vs a "Converge —" sentence), so neither can double-count.
    const conv = convergeEntersCounters(card);
    if (conv && opts.colorsSpent > 0) {
      const n = conv.per * opts.colorsSpent;
      perm.counters = { ...perm.counters, "+1/+1": (perm.counters["+1/+1"] || 0) + applyCounterDoubling(state, controller, "+1/+1", n) };
    }
  }
  // SAGA (CR 714.3a — Vault 12, SHELF S7): a Saga enters with a lore counter (through the doubler — a
  // Doubling Season entry correctly fires chapters I AND II via the transition range, sagaEntryChapterTriggers).
  // `sagaFinal` is stamped durably so the draw-step lore hook + the finished-Saga sweep (CR 714.4) key on it without
  // re-parsing. Only a FULLY-parsed Saga stamps (parseSagaChapters is all-or-nothing) — an unmodeled Saga
  // enters as an inert enchantment exactly as before (its chapters are Arbiter territory, never half-fired).
  const sagaParse = parseSagaChapters(card);
  if (sagaParse) {
    perm.sagaFinal = sagaParse.final;
    perm.counters = { ...perm.counters, lore: (perm.counters.lore || 0) + applyCounterDoubling(state, controller, "lore", 1) };
  }
  // KW-FADING (CR 702.32a) / KW-VANISHING (CR 702.63a): enters with N fade / time counters; the upkeep
  // remove-or-sacrifice runs in gameEngine (applyFadeVanishUpkeep).
  const fade = entersWithFadeCounters(card);
  if (fade && fade.n > 0) perm.counters = { ...perm.counters, [fade.type]: (perm.counters[fade.type] || 0) + applyCounterDoubling(state, controller, fade.type, fade.n) };
  // KW-FABRICATE (CR 702.123a): "When this creature enters, put N +1/+1 counters on it OR create N 1/1 Servo
  // tokens." A modal ETB choice (decideFabricate — deterministic, defaults to counters). The COUNTERS branch is
  // applied here AS the creature enters (before the lethal SBA + before ETB watchers), so its P/T is right from
  // turn 1 — exactly like the enters-with-+1/+1 replacement above — routed through applyCounterDoubling (CR 616).
  // The SERVO branch mints its tokens AFTER the source is on the battlefield (settleEnterReplacements), so their ETB watchers fire.
  const fabricate = parseFabricate(card);
  const fabricateChoice = fabricate && fabricate.n > 0 ? decideFabricate(state, controller, card) : null;
  if (fabricateChoice === "counters") perm.counters = { ...perm.counters, "+1/+1": (perm.counters["+1/+1"] || 0) + applyCounterDoubling(state, controller, "+1/+1", fabricate.n) };
  // ENTERS-WITH-NAMED-COUNTERS (CR 614.1c + 122.6a): "~ enters with N <name> counters on it" for a card-specific
  // NAMED counter (slumber — Arixmethes enters with five slumber counters and is a land until they're removed).
  // The bare literal-N form only (entersWithNamedCounters guards out fade/time/loyalty + conditional/variable),
  // added AS the permanent enters — before the type-changing static reads the count and before ETB triggers fire
  // — exactly like the fade/plus writes above. Bypasses gameState.addCounter (not on the battlefield yet), so it
  // routes through applyCounterDoubling (a +1/+1-only doubler correctly skips a slumber counter; Doubling Season
  // would double it, CR 616). No lethal-SBA concern — a named non-P/T counter never changes toughness.
  const namedCtr = entersWithNamedCounters(card);
  if (namedCtr && namedCtr.n > 0) perm.counters = { ...perm.counters, [namedCtr.type]: (perm.counters[namedCtr.type] || 0) + applyCounterDoubling(state, controller, namedCtr.type, namedCtr.n) };
  // ENTERS WITH A NAMED COUNTER PER KICK (P·15 — Everflowing Chalice: "This artifact enters with a charge counter on it for each
  // time it was kicked"; CR 614.1c + 122.6a + 702.33c): per × the kicks this cast paid (opts.timesKicked, threaded from the
  // cast — 0 for a permanent that wasn't cast kicked). The same doubling route as the fixed-N write above.
  const perKickCtr = entersWithCountersPerKick(card);
  const kicks = Math.max(0, Number(opts.timesKicked) || 0);
  if (perKickCtr && kicks > 0) perm.counters = { ...perm.counters, [perKickCtr.type]: (perm.counters[perKickCtr.type] || 0) + applyCounterDoubling(state, controller, perKickCtr.type, perKickCtr.per * kicks) };
  // ENTERS-WITH-CONDITIONAL-COUNTERS (BLITZ EW-1; CR 614.1c + 122.6a) — "~ enters with N +1/+1 counters on it
  // if <condition>" (Morbid — Gravetiller Wurm; Raid — War-Name Aspirant; Ferocious — Frontier Mastodon…).
  // The condition is evaluated HERE against the PRE-entry `state` (CR 614.1c — a replacement's condition is
  // read as the permanent enters; the entering creature is not on the battlefield yet, so it never satisfies
  // its own condition — the Ferocious ruling), through the SAME evaluateInterveningIf vocabulary the trigger
  // pipeline uses (the metric⇄runtime shared gate: coverage credits only spellConditionParseable conditions).
  // TRUE → the counters are added AS it enters (before the lethal SBA + ETB watchers), through
  // applyCounterDoubling (CR 616 — Doubling Season doubles a Morbid entry counter too). FALSE **or NULL**
  // (condition outside the vocabulary — e.g. Patient Turtle's "you didn't go first this game") → NO counters,
  // the printed body enters unchanged — the FN-safe direction, and exactly the pre-EW-1 behavior.
  const condCtr = entersWithConditionalCounters(card);
  if (condCtr && condCtr.n > 0 && evaluateInterveningIf(state, condCtr.condition, controller, {}) === true) {
    perm.counters = { ...perm.counters, "+1/+1": (perm.counters["+1/+1"] || 0) + applyCounterDoubling(state, controller, "+1/+1", condCtr.n) };
  }
  // ENTERS-WITH-COUNTERS IF CAST FROM HAND (stage ③ · 47 — the Myojin's divinity / indestructible counter): only the spell
  // cast from its owner's hand brings it. `opts.castFromZone` is stamped by the cast resolvers only, so a reanimated,
  // blinked or put-in permanent — or one cast from the command zone — enters bare (CR 614.1c). Placed as it enters,
  // through applyCounterDoubling like the named-counter write above.
  const handCtr = opts.castFromZone === "hand" ? entersWithCastFromHandCounters(card) : null;
  if (handCtr) perm.counters = { ...perm.counters, [handCtr.type]: (perm.counters[handCtr.type] || 0) + applyCounterDoubling(state, controller, handCtr.type, handCtr.n) };
  // ENTERS-WITH-CHOICE-COUNTERS (BLITZ EW-1; CR 614.1c + 122.1b + 122.6a) — the Ikoria keyword-counter choice
  // ("~ enters with your choice of a deathtouch counter or a lifelink counter on it" — Boot Nipper; "two
  // different counters … from among menace, deathtouch, and lifelink" — Grimdancer). HOUSE AUTO-PICK (the
  // riotPicksHaste / autoPickCreatureType discipline — a deterministic, documented policy at the choice site):
  // take the FIRST `pick` options in PRINTED order. Any legal pick is correct play; printed order is stable,
  // serialize-safe, and matches the card's own emphasis. Each keyword counter is placed AS the permanent
  // enters, through applyCounterDoubling (CR 616 — Doubling Season doubles a keyword counter too; two flying
  // counters are legal + redundant per CR 122.1b, and permanentHasKeyword reads ≥1). The parser fails closed
  // (every option must be an enforced 122.1b kind), so an option the runtime wouldn't honor never gets here.
  const choiceCtr = entersWithChoiceCounters(card);
  if (choiceCtr) {
    for (const kind of choiceCtr.options.slice(0, choiceCtr.pick)) {
      const cn = applyCounterDoubling(state, controller, kind, 1);
      if (cn > 0) perm.counters = { ...perm.counters, [kind]: (perm.counters[kind] || 0) + cn };
    }
  }
  // ETB-XCOUNTERS-FROM-METRIC (CR 614.1c + 122.6a + 608.2h): enters with +1/+1 counters whose count is a BOARD
  // METRIC — Squad Captain / Sheriff of Safe Passage ("for each other creature you control"), Prime Speaker
  // Zegana ("X = greatest power among other creatures"). The metric is resolved AT THIS MOMENT against the
  // PRE-ENTRY state (the permanent isn't on the battlefield yet, so "other" excludes it naturally; sourceId is
  // threaded for CR 113.7 correctness regardless). Like the fixed-N / enters-with-X writes above, this bypasses
  // gameState.addCounter, so it routes the result through applyCounterDoubling (the Wave-3 doubler) explicitly.
  // A 0-metric leaves a 0/0 that correctly dies to the lethal-toughness SBA (no fabricated floor).
  const metricCtr = entersWithMetricCounters(card);
  if (metricCtr) {
    // timesKicked: THIS cast's kick count (P·15) — never the state-wide stamp a spell cast in response would have overwritten.
    const ctx = { controller, sourceId: permId, timesKicked: Math.max(0, Number(opts.timesKicked) || 0) };
    const raw = metricCtr.fixed + metricCtr.perUnit * countForSpec(state, ctx, metricCtr.metric);
    if (raw > 0) perm.counters = { ...perm.counters, "+1/+1": (perm.counters["+1/+1"] || 0) + applyCounterDoubling(state, controller, "+1/+1", raw) };
  }
  // KW-RIOT (CR 702.136a + 614.1c) — "Riot" is an ENTERS-WITH-CHOICE replacement: as the permanent enters,
  // its controller chooses an additional +1/+1 counter OR haste (riotPicksHaste — the deterministic house
  // auto-pick above). COUNTER branch handled HERE, on `perm`, BEFORE it's on the battlefield + before the
  // lethal SBA — exactly like every other enters-with-counter write above — through applyCounterDoubling
  // (CR 616 — Doubling Season doubles riot's entry counter too). CR 702.136b: multiple riot instances each
  // work separately, so N instances add N counters. The HASTE branch is a durable layer-6 addKeyword grant
  // applied AFTER the permanent is on the battlefield (settleEnterReplacements). A non-riot permanent leaves both untouched.
  // OTHERS-ENTER-WITH (CR 614.1c — SHELF-85 H8, 2026-09-04): another permanent's static ("Each other creature you control
  // enters with an additional +1/+1 counter on it" — Arwen / Renata / Bramblewood Paragon) adds counters as THIS one
  // enters. Read from the controller's battlefield through the same reader coverage credits; the source never counts itself.
  const othersExtra = othersEnterWithCountersFor(state, controller, card);
  if (othersExtra > 0) perm.counters = { ...perm.counters, "+1/+1": (perm.counters["+1/+1"] || 0) + applyCounterDoubling(state, controller, "+1/+1", othersExtra) };
  const riotCount = riotKeywordCount(card) + grantedRiotCount(state, controller, card);
  const riotHaste = riotCount > 0 && riotPicksHaste(state, controller);
  if (riotCount > 0 && !riotHaste) {
    perm.counters = { ...perm.counters, "+1/+1": (perm.counters["+1/+1"] || 0) + applyCounterDoubling(state, controller, "+1/+1", riotCount) };
  }
  // CHOSEN-TYPE state primitive (CR 614.12, Kindred Discovery family) — "As ~ enters, choose a creature
  // type": the self-play engine auto-picks the controller's most-common creature subtype (autoPickCreatureType
  // reads the PRE-entry `state`) and stores it DURABLY on the permanent as `chosenType`. Plain string, so it
  // serializes with the trivial JSON pass-through (serialization.js) and PERSISTS — set ONCE here at ETB, never
  // re-picked. Read by the chosenTypeYouControl trigger scope (triggers.js). An interactive picker is a future
  // refinement; the deterministic auto-pick is correct + sufficient for self-play.
  if (choosesCreatureTypeOnEnter(card)) perm.chosenType = autoPickCreatureType(state, controller);
  // CHOSEN-COLOR state primitive (CR 614.12b — Utopia Sprawl) — "As this Aura enters, choose a color": the
  // self-play engine auto-picks the controller's most-needed casting color (autoPickManaColor reads the
  // PRE-entry `state`) and stores it DURABLY on the Aura permanent as `chosenColor` (a single WUBRG letter).
  // Plain string → serializes via the trivial JSON pass-through, set ONCE here at ETB, never re-picked. Read
  // back by manaModel.landAuraManaBonus to resolve the "additional one mana of the chosen color" boost when
  // the enchanted Forest taps. Mirrors chosenType. A non-choosing Aura leaves chosenColor undefined.
  if (auraChoosesColorOnEnter(card)) perm.chosenColor = autoPickManaColor(state, controller);
  // LANDS-12 — a LAND that chooses a color as it enters (the Thriving lands, the Gates, Night Market …): the
  // same durable `chosenColor` stamp, honouring a printed "other than <color>" exclusion. Read back by the mana
  // model's "one mana of the chosen color" leg (manaSources resolves it against THIS permanent).
  const landCC = choosesColorOnEnter(card);
  if (landCC) perm.chosenColor = autoPickManaColor(state, controller, landCC.exclude);
  // CHOSEN CARD TYPE (Cloud Key — CR 614.1c + 614.12a): "As this artifact enters, choose artifact, creature, enchantment,
  // instant, or sorcery." Stored in its OWN field, `chosenCardType`, never in `chosenType` (whose readers take it for a
  // creature type) — see chosenCardType.js. `state` is pre-entry (on a non-cast entry the card is still in its source zone;
  // chosenCardTypeOnEnter leaves it out of its own count). Read by the cast lane's chosen-card-type reducer
  // (staticAbilityParser.collectCostReducers). A card without the chooser gets nothing. Token copies make their own choice
  // in tokens.js.
  Object.assign(perm, chosenCardTypeOnEnter(state, card, controller));
  // CHOSEN-TYPE ETB COUNTER (CR 614.1c + 122.6a) — Banner of Kinship enters with a <name> counter for each
  // creature the controller controls of the chosen type. Runs AFTER the chosenType auto-pick above so the
  // metric uses the just-picked type; `state` is pre-entry (the artifact isn't a creature, so it's never
  // self-counted regardless). Like the other enters-with-counter writes, the permanent isn't on the
  // battlefield yet, so this bypasses gameState.addCounter and routes the count through applyCounterDoubling
  // (a non-"+1/+1" counter is skipped by a +1/+1-only doubler; Doubling Season would double it, CR 616).
  const chosenCtr = entersWithChosenTypeCounter(card);
  if (chosenCtr && perm.chosenType) {
    const n = (state.players[controller]?.battlefield || []).filter((p) => cardHasChosenType(p.card, perm.chosenType) || permIsEveryCreatureType(state, p.id)).length; // P·39 — every creature type counts
    if (n > 0) perm.counters = { ...perm.counters, [chosenCtr.counterType]: (perm.counters[chosenCtr.counterType] || 0) + applyCounterDoubling(state, controller, chosenCtr.counterType, n) };
  }
  // TRIBUTE (CR 702.104a) — "As this creature enters, an opponent of your choice may put N +1/+1 counters on
  // it." The controller's chosen opponent decides AS the creature enters (decideTribute — a deterministic
  // value heuristic: pay to deny a HARMFUL "if tribute wasn't paid" effect, decline to deny the controller
  // free counters when that effect is pure upside). The decision is stamped DURABLY on the permanent as a
  // boolean `tributePaid` (plain JSON → serializes via the trivial pass-through), read back by the
  // "tribute wasn't paid"/"tribute was paid" intervening-if (interveningIf.js, keyed on ctx.triggeringPermanentId)
  // so the "if tribute wasn't paid" ETB trigger fires its payoff
  // at BOTH the flush check and the resolution re-check (CR 603.4) EXACTLY when tribute wasn't paid — the same
  // way KICKER's wasKicked flag drives "it was kicked". When PAID, N +1/+1 counters are added AS the creature
  // enters (its bigger P/T is correct from turn 1), through applyCounterDoubling like every other enters-with-
  // counter write (Doubling Season doubles the tribute counters too, CR 616). With NO opponent to decide (a
  // solitaire/test board), tribute can't be paid → declined (CR 702.104a — "choose an opponent"; none
  // exists → the if-not effect runs), the safe default. A non-tribute permanent leaves tributePaid undefined.
  const trib = parseTribute(card);
  if (trib) {
    const hasOpponent = opponentsOf(state, controller).some((oid) => state.players?.[oid]);
    const paid = hasOpponent ? decideTribute(tributeIfNotClause(card)) : false;
    perm.tributePaid = paid;
    if (paid && trib.n > 0) perm.counters = { ...perm.counters, "+1/+1": (perm.counters["+1/+1"] || 0) + applyCounterDoubling(state, controller, "+1/+1", trib.n) };
  }
  // ETB-XVALUE THREADING (HALF-X-CREATE-TOKENS): durably store the chosen {X} paid for this permanent's
  // {X} cost (opts.xValue, threaded from the cast — same source the enters-with-X-counters write above reads)
  // on the permanent itself, mirroring chosenType. A plain number, so it serializes via the JSON pass-through.
  // Read back by triggers.checkEnterTriggers, which threads it into the SELF-ETB trigger's context (CR 608.2h —
  // a {X} value is locked at resolution) so a "create half X Food tokens" ETB resolves at the real X. Only a
  // positive paid X is stamped (a non-X permanent, or one that wasn't cast, has xValue undefined → X reads 0).
  if (opts.xValue > 0) perm.xValue = opts.xValue;
  return { perm, settle: { shockLife: shockPay ? shock.life : 0, riotHaste, fabricateServos: fabricateChoice === "servos" } };
}

/**
 * Finish what applyEnterReplacements decided, now that `perm` is on the battlefield in `state` (pure; returns the new state):
 * the shockland's life payment, the CR 122.6 counter events, riot's haste, Fabricate's Servos.
 */
export function settleEnterReplacements(state, perm, settle) {
  let next = state;
  const controller = perm.controller;
  // THE SHOCKLAND CLAUSE — the policy decided to PAY, so charge it now through loseLife (the one
  // life sink: "whenever you lose life" watchers and the 0-life SBA both see it) and log it as an
  // auto-decision. An untapped shockland with no life charged is the fabricated-effect FP, so the two
  // halves are never separable: the payment decision set the tapped flag AND drives this deduction.
  if (settle.shockLife > 0) {
    next = loseLife(next, { playerId: controller, amount: settle.shockLife });
    next = logEvent(next, { kind: "spell-effect", effect: "optional-life-payment", controller, paid: true, amount: settle.shockLife, permanentId: perm.id, auto: true });
  }
  // ENTERS-WITH-COUNTERS half (CR 122.6): "counters being put on an object … refers to putting counters on
  // that object while it's on the battlefield AND ALSO to an object that's given counters as it enters."
  // Recorded HERE, the single point where the finished permanent joins the battlefield, rather than at each
  // enters-with site (loyalty / typed / plus / modular / kicked). One row per counter KIND. Deliberately the
  // OPPOSITE of the becomes-tapped sibling, which skips enters-tapped — the CR treats the two entry cases
  // differently, and getting it backwards would mis-play every carrier.
  const enteredCounters = Object.entries(perm.counters || {}).filter(([, n]) => (n || 0) > 0);
  if (enteredCounters.length) {
    next = { ...next, pendingCounterEvents: [
      ...(next.pendingCounterEvents || []),
      ...enteredCounters.map(([type, n]) => ({ id: perm.id, type, amount: n, controller, fromEnter: true })),
    ] };
  }
  // KW-RIOT (CR 702.136a) HASTE branch — when the auto-pick chose haste, the permanent "gains haste": a
  // layer-6 addKeyword Haste continuous effect scoped to THIS permanent with a permanent duration (the exact
  // earthbend/animate shape), added now that it's on the battlefield. permanentHasKeyword("Haste") reads it,
  // so every summoning-sick gate that pairs summoningSick with a Haste check (legalChoices declare-attacker /
  // {T}-ability, opponentAI attack plan) lets it act the turn it enters. Persists until it leaves (its id is
  // monotonic + never reused, so the effect is inert the instant the permanent is gone). One grant regardless
  // of instance count (CR 702.136b — extra haste is redundant). The counter branch already ran on `perm`.
  if (settle.riotHaste) {
    next = addContinuousEffect(next, {
      layer: 6,
      op: { layerOp: "addKeyword", keyword: "Haste" },
      affects: { mode: "fixed", permanentIds: [perm.id] },
      duration: { kind: "permanent" },
      source: { kind: "resolution", permanentId: perm.id, cardName: perm.card?.name || null },
    }).state;
  }
  // KW-FABRICATE (CR 702.123a) SERVO branch — when decideFabricate chose "servos", mint N 1/1 colorless Servo
  // artifact creature tokens now that the source is on the battlefield, firing each Servo's ETB watchers (the
  // shared fireTokenEnterTriggers seam) + applying the CR 616 token multiplier. Runs BEFORE the source's own ETB
  // triggers (consistent with how the Living Weapon token enters + fires in enterPermanent); the counters branch
  // was already applied on `perm`, pre-entry. A "counters" choice / non-Fabricate card is a no-op.
  if (settle.fabricateServos) next = applyFabricateServos(next, perm.card, controller);
  return next;
}

/**
 * SAGA (CR 714.3a + 714.2b; CR 122.6 — entering with counters is counters being put on it): the lore counter(s) a Saga entered
 * with fire every chapter crossed from 0 — chapter I normally; I AND II under a Doubling Season entry. Called by every entry
 * path once the Saga's enters triggers are checked; a permanent without a `sagaFinal` stamp is a no-op.
 */
export function sagaEntryChapterTriggers(state, perm) {
  if (!perm?.sagaFinal) return state;
  return checkSagaChapterTriggers(state, perm.id, 0, perm.counters?.lore || 0);
}
