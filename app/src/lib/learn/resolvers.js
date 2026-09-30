/**
 * resolvers.js — the serializable, data-driven stack/trigger resolver registry.
 *
 * THE Phase-7 keystone. Stack objects and triggers no longer carry a live
 * `payload.onResolve` closure (un-serializable — the save/resume blocker).
 * Instead `payload = { resolver: <key>, params: <plain data> }`, and the engine
 * resolves by looking the key up here. `state` stays pure JSON, so a game can be
 * serialized mid-stack and restored to byte-identical behavior.
 *
 * Leaf-ish module: imports only from gameState (pure data helpers) and
 * spellEffects (pure resolution). Imports NOTHING from gameEngine or
 * actionDispatcher, so gameEngine can import this without a cycle.
 *
 * Extensibility: built-ins live in the frozen RESOLVERS map; the triggers and
 * Phase-2 effect-interpreter subsystems add keys via registerResolver (a
 * separate mutable EXTENSIONS map) rather than editing this core.
 *
 * Wiring status (Phase-7 PR-1): every resolver is implemented and unit-tested,
 * but NOTHING calls this yet — `resolveTopOfStack` swaps to the registry in
 * PR-2 and the cast path emits these payloads in PR-3.
 */

import { createPermanent, mintId, logEvent, findPermanent, attachPermanent, destroyLethalCreatures, castsAsPlaneswalker, planeswalkerEntryLoyalty, opponentsOf, moveCardToZone, tapPermanent, recordGraveyardEvents, updatePermanentSafe, loseLife } from "./gameState.js";
import { queueEvokeSacrifice, checkDiesTriggers, checkEnterTriggers, checkPermanentEntersTriggers, checkSagaChapterTriggers, modularKeywordValues } from "./triggers.js";
import { parseSagaChapters } from "./saga.js"; // SAGA (CR 714 — Vault 12, SHELF S7): entry lore counter + sagaFinal stamp; a pure leaf
import { markPendingArbiter } from "./pendingArbiter.js";
import { runEffectProgram, finishSpellResolution } from "./effects/runProgram.js";
import { evaluateInterveningIf } from "./interveningIf.js";
import { isCloneCard, parseCloneSpec, cloneCandidates, cloneMvCap, snapshotCopiedCard, autoPickCloneCandidate, cloneWidenedCopiable } from "./cloneCopy.js"; // + cloneWidenedCopiable (KN-2)
import { setPendingCloneChoice, clearPendingChoice } from "./pendingChoice.js";
import { othersEnterWithCounters, entersWithPlusCounters, entersWithMinusCounters, entersWithXCounters, sunburstCounterKind, convergeEntersCounters, entersWithMetricCounters, entersWithNamedCounters, choosesColorOnEnter, entersWithConditionalCounters, entersWithChoiceCounters, entersTapped, impositionEntersTapped, isNativeManaAura, auraChoosesColorOnEnter, riotKeywordCount, parseSoulbondBond } from "./staticAbilityParser.js"; // TRUNK-ENTERSCOUNTERS (CR 614.1c + 122.6a) + TRUNK-ENTERSTAPPED (CR 614.1c) + ENTERS-WITH-X + ETB-XCOUNTERS-FROM-METRIC + ENTERS-WITH-NAMED-COUNTERS (Arixmethes slumber) + ENTERS-WITH-CONDITIONAL/CHOICE (BLITZ EW-1: Morbid/Raid counters; Ikoria keyword-counter choice) + AURA-LAND-MANA-BOOST + CHOSEN-COLOR (Utopia Sprawl) + KW-RIOT (CR 702.136 — enters-with-choice: counter or haste)
import { addContinuousEffect, permanentPower, permanentToughness, equipmentBarredAsCreature } from "./layers.js"; // KW-RIOT haste branch — a layer-6 permanent-duration addKeyword Haste grant scoped to the entering permanent (the earthbend/animate precedent); acyclic (layers imports only ptPrimitive/keywords/staticAbilityParser/protection, none of which reach resolvers)
import { conditionalEntersTapped, paysLifeOrEntersTapped, autoPickOptionalLifePayment, revealLandEntersTapped } from "./landEntersTapped.js"; // LANDS-TIER — "enters tapped unless <condition>"; a leaf over interveningIf (interveningIf → layers → staticAbilityParser, none reach resolvers) — acyclic
import { autoPickCreatureType } from "./choicePolicy.js"; // CR 614.12 auto-choice policy — a zero-import LEAF, shared with the effect atoms (which cannot import resolvers: resolvers → runProgram → effectAtoms). One copy, so an ETB choice and an activated choice can never diverge on the same board.
import { entersWithFadeCounters } from "./fading.js"; // KW-FADING / KW-VANISHING — enters with N fade/time counters
import { parseFabricate, decideFabricate, applyFabricateServos } from "./fabricate.js"; // KW-FABRICATE (CR 702.111a) — ETB choice: N +1/+1 counters OR N 1/1 Servo tokens
import { entersWithKickedCounters } from "./kicker.js"; // KICKER (CR 702.33e) — "If this creature was kicked, it enters with N +1/+1 counters"; added only when opts.kicked
import { parseTribute, decideTribute, tributeIfNotClause } from "./tribute.js"; // TRIBUTE (CR 702.96) — opponent ETB choice: pay N +1/+1 counters OR the "if tribute wasn't paid" effect fires (leaf, acyclic)
import { applyCounterDoubling } from "./replacementEffects.js"; // Wave-3 doubler (leaf): enters-with-counters bypasses addCounter, so double here
import { countForSpec } from "./effects/atoms/shared.js"; // ETB-XCOUNTERS-FROM-METRIC: resolve a board-metric counter count (leaf: shared → gameState only)
import { hasKeyword } from "./keywords.js"; // CHOSEN-TYPE ETB counter (Banner of Kinship): changeling counts as the chosen type (leaf module)

// Re-export the P2.1 seam marker from its leaf module (it moved out of this file
// in P2.2 so the effect interpreter can share it without an import cycle).
export { markPendingArbiter } from "./pendingArbiter.js";

/**
 * The canonical resolver-key contract. Frozen + exported so every producer
 * (cast path, triggers, effect interpreter) references the same strings.
 * W5: the dead Phase-1 lanes were DELETED — SPELL_EFFECT ("spell.effect", the
 * single-descriptor legacy spell resolver) and ACTIVATED_EFFECT
 * ("activated.effect", a never-emitted stub) had ZERO production emitters;
 * everything live resolves via EFFECT_PROGRAM / PERMANENT_ETB / AURA_ETB /
 * ATTACH / SPELL_NOOP / MANUAL. (parseSpellEffect — the PARSE half — stays: the
 * AI scorer and the parser's legacyToAtom fallback still consume it.)
 */
export const RESOLVER_KEYS = Object.freeze({
  PERMANENT_ETB: "spell.permanent",     // a permanent spell entering the battlefield
  SPELL_NOOP: "spell.noop",             // a recognized-but-unhandled instant/sorcery — log + pop
  TRIGGER_EFFECT: "trigger.effect",     // DEPRECATED (W4): retired zombie lane — resolves as manual; key kept for serialized saves
  MANUAL: "manual",                     // Arbiter escape valve — surfaces an "unresolved" log
  EFFECT_PROGRAM: "effect-program",     // the P2.2 multi-atom interpreter (the live spell/trigger/ability lane)
  ATTACH: "attach",                     // Equip/Aura attach — sets attachedTo + attachments
  AURA_ETB: "spell.aura",               // an Aura spell resolving: enter + attach to its target
  GY_SELF_RETURN: "gy.self-return",     // GY-1 — "Return this card from your graveyard to your hand / the battlefield [tapped]"
});

/**
 * Put a permanent on its controller's battlefield, minting a deterministic id
 * from `state.idSeq` and stamping `enteredOnTurn`. Extracted from the old
 * `actionDispatcher.defaultSpellResolver` closure (which used a
 * non-deterministic Date.now/Math.random id and bypassed `createPermanent`) —
 * now pure and serialize-stable.
 *
 * NOTE: this is the resolution-time "permanent enters" mechanic only. The ETB
 * trigger + layer-timestamp stamps ride through `gameEngine.enterBattlefield`
 * in PR-6 (the three-way integration seam); PR-1 deliberately keeps this minimal.
 */
/**
 * LIVING WEAPON (CR 702.92) / FOR MIRRODIN! (CR 702.163) — the Equipment's built-in ETB: create a token,
 * then attach this Equipment to it. The token is fixed by the keyword (a 0/0 black Phyrexian Germ for living
 * weapon; a 2/2 red Rebel for For Mirrodin!), so we don't parse it — we mint the exact token. Returns the token
 * card spec or null. A 0/0 Germ survives because the Equipment's +X/+Y is attached the same instant (CR 613 —
 * the layer engine reads the attached bonus), so it's never a 0-toughness SBA casualty before it's buffed.
 */
function livingWeaponToken(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  if (/\bliving weapon\b/i.test(oracle)) return { name: "Germ", type: "Creature — Phyrexian Germ", power: 0, toughness: 0, colors: ["B"], token: true };
  if (/\bfor mirrodin!/i.test(oracle)) return { name: "Rebel", type: "Creature — Rebel", power: 2, toughness: 2, colors: ["R"], token: true };
  return null;
}

// CHOSEN-TYPE state primitive (Kindred Discovery family) — does this card say "As <it> enters, choose a
// creature type"? Anchored to the bare creature-type chooser (CR 614.12 — a choose-a-type-as-it-enters
// replacement). NOT "choose a card type / land type / planeswalker type" (a different chooser the engine
// doesn't model), and NOT an activated/spell-level "Choose a creature type" (those carry no "as ~ enters").
const CHOOSE_CREATURE_TYPE_ETB_RE = /\bas\b[^.]*\benters\b[^.]*,\s*choose a creature type\b/i;
export function choosesCreatureTypeOnEnter(card) { // exported for the play-land drop (actionDispatcher.applyPlayLand — CAP-CAVERN)
  return CHOOSE_CREATURE_TYPE_ETB_RE.test(String(card?.oracle || card?.oracle_text || ""));
}

// The creature subtypes printed on a card's type line (the words after the "—", CR 205.3a). [] for a card
// with no subtype dash. Lower-level than layers.subtypesOf (kept local so resolvers stays leaf-ish).
function creatureSubtypesOf(card) {
  const ts = String(card?.type || card?.type_line || "");
  if (!/Creature/.test(ts)) return [];
  const dash = ts.indexOf("—");
  if (dash === -1) return [];
  return ts.slice(dash + 1).trim().split(/\s+/).filter(Boolean);
}

// CHOSEN-TYPE membership (CR 614.12) — does a permanent's `card` carry the creature type `chosenType`?
// Subtype word-bounded on the type line OR a changeling (CR 702.73a). Mirrors triggers.permHasChosenType +
// layers.permHasChosenTypeLayer (kept local so resolvers stays leaf-ish). Unset chosenType → false.
function cardHasChosenType(card, chosenType) {
  if (!chosenType || !card) return false;
  if (hasKeyword(card, "changeling")) return true;
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
/**
 * The +1/+1 counters OTHER permanents' "each other creature you control enters with …" statics add to `card` as it enters.
 * "Other" needs no explicit self-check here: the entering permanent is built AFTER this scan and is not on the battlefield
 * yet (a self-exclusion written first was unreachable under mutation and was removed, not kept).
 */
function othersEnterWithCountersFor(state, controller, card) {
  if (!card) return 0;
  const tl = String(card.type || card.type_line || "");
  if (!/\bCreature\b/i.test(tl)) return 0;
  let n = 0;
  for (const p of state?.players?.[controller]?.battlefield || []) {
    if (!p) continue;
    const d = othersEnterWithCounters(p.card);
    if (!d) continue;
    if (d.subject === "planeswalker") continue; // Oath of Gideon's loyalty shape — a creature never reads it (othersEnterWithLoyaltyFor)
    if (d.subtype && !new RegExp(`\\b${d.subtype}\\b`).test(tl)) continue;
    const metric = d.metric === "sourceToughness" ? permanentToughness(state, p.id)
      : d.metric === "sourcePower" ? permanentPower(state, p.id) : 0;
    n += Math.max(0, d.fixed + metric);
  }
  return n;
}

// (The Oath of Gideon loyalty helper moved to gameState.planeswalkerEntryLoyalty so the non-cast entry path shares it.)

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

export function enterPermanent(state, card, controller, opts = {}) {
  const player = state.players[controller];
  if (!player) return state;
  const { id: permId, state: s2 } = mintId(state, "perm");
  // Stamp the CR 613.7e layer timestamp at ETB (Phase-7 PR-9), alongside the
  // deterministic id, and advance the monotonic counter. Layers reads
  // `permanent.timestamp` to order anthems/lords; threading it through state keeps
  // it serialize-stable. (The three-way ETB stamp seam, D5.)
  const ts = s2.timestampCounter || 0;
  const s3 = { ...s2, timestampCounter: ts + 1 };
  const typeStr = String(card?.type || card?.type_line || "");
  // THE SHOCKLAND CLAUSE at THIS site (LANDS-TIER slice 2): decided BEFORE the permanent is built so the
  // tapped flag and the life payment are one decision — the policy pays only when it can (life ≥ N and the
  // written ≥10 floor), and a decision to pay is CHARGED below right after the land joins the battlefield,
  // never left as a free untapped dual.
  const shock = paysLifeOrEntersTapped(card);
  const shockPay = !!(shock && autoPickOptionalLifePayment(s3, controller, shock.life));
  const perm = {
    // LANDS-TIER (2026-09-02): the CONDITIONAL "enters tapped unless <condition>" read joins the two here
    // (a tutored / put-onto-the-battlefield land runs through this site, not the play-land path). The
    // permanent is not on the battlefield yet, so an "other lands" count is already correct; its id is
    // threaded anyway so both sites read the evaluator identically.
    // THE SHOCKLAND CLAUSE at THIS site (LANDS-TIER slice 2): a tutored / put-onto-the-battlefield shockland
    // enters INSIDE an effect's resolution, where a land-entry pause has no resume seam — so the WRITTEN
    // policy decides for every seat here (autoPickOptionalLifePayment: pay iff life ≥ 10) and the outcome is
    // logged as an auto-decision. The play-land path (the 95% case) gives a human the real choice. This is a
    // documented limit, not a hidden one: see landEntersTapped.paysLifeOrEntersTapped.
    ...createPermanent({ id: permId, card, controller, tapped: entersTapped(card) || impositionEntersTapped(s3, card, controller) || conditionalEntersTapped(s3, card, controller, permId) || (shock ? !shockPay : false) || revealLandEntersTapped(s3, card, controller), summoningSick: /Creature/.test(typeStr) }), // KM-1: an opposing Kismet forces the entry tapped (CR 614.1c)
    enteredOnTurn: s3.turn,
    timestamp: ts,
    // A clone enters carrying a `card` that's the COPIED creature's copiable values, while its
    // ORIGINAL card is stashed here and restored when it leaves the battlefield (CR 707.2 — off
    // the battlefield it's the original card, not the copy). moveCardToZone reads printedCard.
    ...(opts.printedCard ? { printedCard: opts.printedCard } : {}),
    // BESTOW (CR 702.103): a card cast for its bestow cost enters as an Aura flagged `bestowed`. The flag
    // (a) drives the layer-4 Creature-type removal in layers.staticEffectsOf while it's attached, and (b)
    // exempts it from the Aura falls-off-to-graveyard SBA (gameState.detachPermanentFromAll) — it stays on
    // the battlefield and becomes a creature again when its host leaves. A non-bestow permanent omits it.
    ...(opts.bestowed ? { bestowed: true } : {}),
    // PLAYER-AURA (Fraying Sanity — SHELF S7, CR 303.4): the enchanted PLAYER's id, stamped durably (the
    // attachments machinery is untouched — no host permanent). Read by the enchanted-player effect
    // referents and swept to the graveyard by the elimination pass when that player leaves the game.
    ...(opts.enchantedPlayerId ? { enchantedPlayerId: opts.enchantedPlayerId } : {}),
    // KICKER (CR 702.33b/e): stamp the was-kicked flag DURABLY on the permanent when this cast paid the kicker
    // (opts.kicked, threaded from the kicked cast). Mirrors how `xValue` / `chosenType` persist — a plain
    // boolean that serializes via the JSON pass-through. Read back by the "it was kicked" intervening-if
    // (interveningIf.js, keyed on ctx.triggeringPermanentId) so a kicked ETB trigger ("When this creature
    // enters, if it was kicked, <effect>" — Goblin Ruinblaster) fires its payoff at BOTH the flush check and
    // the resolution re-check (CR 603.4). The enters-with-+1/+1-counters kicked payoff still reads opts.kicked
    // directly below — this flag is the ADDITIONAL hook the trigger/spell pipelines need. A normal cast omits it.
    ...(opts.kicked ? { wasKicked: true } : {}),
    // CAST-vs-PUT (CR 603.2) — stamp HOW this permanent arrived, for the "if you cast it" intervening-if
    // (Tiamat, Zacama, Primal Calamity). Set ONLY by the two CAST resolvers (PERMANENT_ETB / AURA_ETB);
    // every other entry route — reanimation, put-onto-the-battlefield, blink, a token copy — leaves it
    // unset, so the condition reads false and the trigger correctly does not fire. Mirrors `wasKicked`
    // exactly: a per-permanent fact about the cast, durable on the object, JSON-serializable.
    ...(opts.wasCast ? { wasCast: true } : {}),
    // CAST-DURING-MAIN-PHASE (SHELF-85 · Light-Paws L4 Sentinel's Mark, 2026-09-05 — the Addendum "if you cast it during your
    // main phase"): stamped by the cast chokepoint beside castFromZone, carried here by the two CAST resolvers; every other
    // entry route leaves it unset, so the look-back reads false.
    ...(opts.castDuringMainPhase ? { castDuringMainPhase: true } : {}),
    ...(opts.castForNoMana ? { castForNoMana: true } : {}), // SATORU (BI-5): cast, but for no mana (free / pitch / alt cost)
    ...(opts.evoked ? { evoked: true } : {}), // EVOKE (Solitude): its evoke cost was paid — the sacrifice trigger is queued as it enters
    // CAST-FROM-ZONE (CR 601.2 / 400.7) — WHICH zone this permanent's spell was cast from, for the
    // "if you cast it from your hand" ETB rider (Furnace Dragon, Reiver Demon, Angel of the Dire Hour,
    // Wakening Sun's Avatar, Coal Stoker). A per-PERMANENT fact about HOW the object arrived, so it lives
    // beside wasCast for exactly the same reason.
    // ⛔ STAMPED ONLY BY THE CAST RESOLVERS. A permanent put onto the battlefield any other way —
    // reanimated, blinked, cheated in with Show and Tell — never gets it, so the rider reads false and the
    // trigger correctly does not fire. Defaulting an absent value to "hand" would hand every reanimation
    // effect the payoff the printed rider exists to deny.
    ...(opts.castFromZone ? { castFromZone: opts.castFromZone } : {}),
    // ⭐ COLOURS SPENT (CR 702.43 sunburst / converge) — how many COLOURS of mana paid for this permanent's
    // spell, captured off the payment plan at cast time. Lives beside wasCast/castFromZone for the same
    // reason: a per-permanent fact about HOW the object arrived, JSON-serializable, read at ETB.
    // ⛔ `!= null` RATHER THAN TRUTHY, and the difference is a real card. A mono-coloured-cost spell paid
    // entirely with generic-eating colourless mana spends ZERO colours, and `0` is the CORRECT answer —
    // a truthy check would drop the stamp and leave the rider reading "unknown" instead of "none".
    ...(opts.colorsSpent != null ? { colorsSpent: opts.colorsSpent } : {}),
    // GRANTED DIES-EXILE (RIVAZ, 2026-08-15) — the cast-trigger grant 'it gains "When this creature dies,
    // exile it."' stamped on the SPELL's stack payload rides here onto the permanent (the castFromZone
    // pattern exactly). Read by the dies path: the card exiles from the graveyard after death processing.
    ...(opts.grantDiesExile ? { grantDiesExile: true } : {}),
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
    // counter, doubled once — the non-cast entry (zones.enterCardFromZone) reads the same helper.
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
  if (opts.xValue > 0 && entersWithXCounters(card)) {
    perm.counters = { ...perm.counters, "+1/+1": (perm.counters["+1/+1"] || 0) + applyCounterDoubling(state, controller, "+1/+1", opts.xValue) };
  }
  // ⭐ SUNBURST (CR 702.43a) — a counter for each COLOUR of mana spent to cast it. The count is threaded
  // from the payment plan (opts.colorsSpent, stamped above); the KIND comes from the card's own type line,
  // because sunburst puts +1/+1 counters on a creature and CHARGE counters on a non-creature artifact.
  // Routed through applyCounterDoubling like every other enters-with write, so a Doubling Season entry
  // doubles it exactly as it doubles the X-counter form directly above.
  // ⛔ ZERO COLOURS IS A REAL ANSWER and writes nothing — a spell paid entirely with colourless mana gets no
  // counters, which is what the card says. Guarded by `> 0` so no empty counter key is minted.
  {
    const sbKind = sunburstCounterKind(card);
    if (sbKind && opts.colorsSpent > 0) {
      perm.counters = { ...perm.counters, [sbKind]: (perm.counters[sbKind] || 0) + applyCounterDoubling(state, controller, sbKind, opts.colorsSpent) };
    }
    // ⭐ CONVERGE (CR 702.117a) — the same colour count, written longhand instead of as a keyword, and with
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
  // Doubling Season entry correctly fires chapters I AND II via the transition range below). `sagaFinal`
  // is stamped durably so the draw-step lore hook + the finished-Saga sweep (CR 714.4) key on it without
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
  // KW-FABRICATE (CR 702.111a): "When this creature enters, put N +1/+1 counters on it OR create N 1/1 Servo
  // tokens." A modal ETB choice (decideFabricate — deterministic, defaults to counters). The COUNTERS branch is
  // applied here AS the creature enters (before the lethal SBA + before ETB watchers), so its P/T is right from
  // turn 1 — exactly like the enters-with-+1/+1 replacement above — routed through applyCounterDoubling (CR 616).
  // The SERVO branch mints its tokens AFTER the source is on the battlefield (below), so their ETB watchers fire.
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
    const ctx = { controller, sourceId: permId };
    const raw = metricCtr.fixed + metricCtr.perUnit * countForSpec(state, ctx, metricCtr.metric);
    if (raw > 0) perm.counters = { ...perm.counters, "+1/+1": (perm.counters["+1/+1"] || 0) + applyCounterDoubling(state, controller, "+1/+1", raw) };
  }
  // KW-RIOT (CR 702.136a + 614.1c) — "Riot" is an ENTERS-WITH-CHOICE replacement: as the permanent enters,
  // its controller chooses an additional +1/+1 counter OR haste (riotPicksHaste — the deterministic house
  // auto-pick above). COUNTER branch handled HERE, on `perm`, BEFORE it's on the battlefield + before the
  // lethal SBA — exactly like every other enters-with-counter write above — through applyCounterDoubling
  // (CR 616 — Doubling Season doubles riot's entry counter too). CR 702.136b: multiple riot instances each
  // work separately, so N instances add N counters. The HASTE branch is a durable layer-6 addKeyword grant
  // applied AFTER the permanent is on the battlefield (below). A non-riot permanent leaves both untouched.
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
  // CHOSEN-TYPE ETB COUNTER (CR 614.1c + 122.6a) — Banner of Kinship enters with a <name> counter for each
  // creature the controller controls of the chosen type. Runs AFTER the chosenType auto-pick above so the
  // metric uses the just-picked type; `state` is pre-entry (the artifact isn't a creature, so it's never
  // self-counted regardless). Like the other enters-with-counter writes, the permanent isn't on the
  // battlefield yet, so this bypasses gameState.addCounter and routes the count through applyCounterDoubling
  // (a non-"+1/+1" counter is skipped by a +1/+1-only doubler; Doubling Season would double it, CR 616).
  const chosenCtr = entersWithChosenTypeCounter(card);
  if (chosenCtr && perm.chosenType) {
    const n = (player.battlefield || []).filter((p) => cardHasChosenType(p.card, perm.chosenType)).length;
    if (n > 0) perm.counters = { ...perm.counters, [chosenCtr.counterType]: (perm.counters[chosenCtr.counterType] || 0) + applyCounterDoubling(state, controller, chosenCtr.counterType, n) };
  }
  // TRIBUTE (CR 702.96a) — "As this creature enters, an opponent of your choice may put N +1/+1 counters on
  // it." The controller's chosen opponent decides AS the creature enters (decideTribute — a deterministic
  // value heuristic: pay to deny a HARMFUL "if tribute wasn't paid" effect, decline to deny the controller
  // free counters when that effect is pure upside). The decision is stamped DURABLY on the permanent as a
  // boolean `tributePaid` (plain JSON → serializes via the trivial pass-through), read back by the
  // "tribute wasn't paid"/"tribute was paid" intervening-if (interveningIf.js, keyed on ctx.triggeringPermanentId)
  // so the "if tribute wasn't paid" ETB trigger (checkEnterTriggers → buildTriggerStack below) fires its payoff
  // at BOTH the flush check and the resolution re-check (CR 603.4) EXACTLY when tribute wasn't paid — the same
  // way KICKER's wasKicked flag drives "it was kicked". When PAID, N +1/+1 counters are added AS the creature
  // enters (its bigger P/T is correct from turn 1), through applyCounterDoubling like every other enters-with-
  // counter write (Doubling Season doubles the tribute counters too, CR 616). With NO opponent to decide (a
  // solitaire/test board), tribute can't be paid → declined (CR 702.96a — "an opponent of your choice"; none
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
  // Read back by checkEnterTriggers below, which threads it into the SELF-ETB trigger's context (CR 608.2h —
  // a {X} value is locked at resolution) so a "create half X Food tokens" ETB resolves at the real X. Only a
  // positive paid X is stamped (a non-X permanent has xValue undefined → the FIXED/for-each resolvers, intact).
  if (opts.xValue > 0) perm.xValue = opts.xValue;
  let next = {
    ...s3,
    players: {
      ...s3.players,
      [controller]: { ...player, battlefield: [...player.battlefield, perm] },
    },
  };
  next = logEvent(next, { kind: "permanent-enters", cardName: card?.name, controller });
  // THE SHOCKLAND CLAUSE — the policy decided to PAY above, so charge it now through loseLife (the one
  // life sink: "whenever you lose life" watchers and the 0-life SBA both see it) and log it as an
  // auto-decision. An untapped shockland with no life charged is the fabricated-effect FP, so the two
  // halves are never separable: `shockPay` set the tapped flag AND drives this deduction.
  if (shockPay) {
    next = loseLife(next, { playerId: controller, amount: shock.life });
    next = logEvent(next, { kind: "spell-effect", effect: "optional-life-payment", controller, paid: true, amount: shock.life, permanentId: permId, auto: true });
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
  // of instance count (CR 702.136b — extra haste is redundant). The counter branch already ran on `perm` above.
  if (riotHaste) {
    next = addContinuousEffect(next, {
      layer: 6,
      op: { layerOp: "addKeyword", keyword: "Haste" },
      affects: { mode: "fixed", permanentIds: [permId] },
      duration: { kind: "permanent" },
      source: { kind: "resolution", permanentId: permId, cardName: card?.name || null },
    }).state;
  }
  // KW-FABRICATE (CR 702.111a) SERVO branch — when decideFabricate chose "servos", mint N 1/1 colorless Servo
  // artifact creature tokens now that the source is on the battlefield, firing each Servo's ETB watchers (the
  // shared fireTokenEnterTriggers seam) + applying the CR 616 token multiplier. Runs BEFORE the source's own ETB
  // triggers below (consistent with how the Living Weapon token enters + fires just below); the counters branch
  // was already applied above (on `perm`, pre-entry). A "counters" choice / non-Fabricate card is a no-op.
  if (fabricateChoice === "servos") next = applyFabricateServos(next, card, controller);
  // Aura attach (CR 303.4f): an Aura attaches to the object it's enchanting AS it enters —
  // the freshly-minted permanent's `attachedTo` is wired bidirectionally to its host so the
  // layer engine applies the bonus from the same turn. Guarded: the host must still be on a
  // battlefield (the resolver already re-checked legality, but a no-op stays safe).
  if (opts.attachTo && findPermanent(next, opts.attachTo)) {
    next = attachPermanent(next, { equipId: permId, targetId: opts.attachTo });
  }
  // LIVING WEAPON / FOR MIRRODIN! — the Equipment makes its own token and attaches to it (CR 702.92/702.163).
  // Mint the fixed token, put it on the controller's battlefield, then attach THIS Equipment via the shared
  // attachPermanent (the same mechanism Equip / Aura use), so the layer engine buffs the token from this turn.
  const lwToken = livingWeaponToken(card);
  let lwTokenId = null;
  if (lwToken) {
    const { id: tokId, state: ts2 } = mintId(next, "perm");
    const tokPerm = { ...createPermanent({ id: tokId, card: lwToken, controller, summoningSick: true }), enteredOnTurn: ts2.turn, timestamp: ts2.timestampCounter || 0 };
    const ts3 = { ...ts2, timestampCounter: (ts2.timestampCounter || 0) + 1 };
    next = { ...ts3, players: { ...ts3.players, [controller]: { ...ts3.players[controller], battlefield: [...ts3.players[controller].battlefield, tokPerm] } } };
    next = attachPermanent(next, { equipId: permId, targetId: tokId });
    lwTokenId = tokId;
  }
  // Fire ETB triggers now that the permanent is on the battlefield (CR 603.6a). They land in
  // pendingTriggers and flushTriggers puts them on the stack at the next priority-grant checkpoint
  // (which resolveTopOfStack runs after this). `checkEnterTriggers` (triggers.js) is the SINGLE ETB-fire
  // helper, shared with the reanimation atom (β-3b) — so the cast/clone/aura and non-cast entry paths
  // can't drift.
  let afterEtb = checkEnterTriggers(next, perm);
  if (opts.evoked) afterEtb = queueEvokeSacrifice(afterEtb, perm); // EVOKE (CR 702.74): queued UNDER the card's own ETB (resolves after it)
  // LIVING WEAPON — the Germ token ALSO entered (CR 702.92), so it fires creature-ETB watchers too (Soul
  // Warden / Cathars' Crusade / subtype-ETB off the Germ). Without this the LW token bypassed every ETB
  // trigger — the same gap the create-token atom had (#345). Fire it after the equipment's own ETB.
  if (lwTokenId) {
    const tok = findPermanent(afterEtb, lwTokenId);
    if (tok?.permanent) afterEtb = checkEnterTriggers(afterEtb, tok.permanent);
  }
  // SAGA (CR 714.3a): the entry lore counter(s) fire every chapter crossed from 0 — chapter I normally;
  // I AND II under a Doubling Season entry (the counter write above routed through the doubler).
  if (perm.sagaFinal) {
    afterEtb = checkSagaChapterTriggers(afterEtb, perm.id, 0, perm.counters?.lore || 0);
  }
  // SOULBOND auto-pair (BLITZ SL-1, CR 702.95a) — after every creature entry, attempt the deterministic pairing.
  return maybeAutoPairSoulbond(checkPermanentEntersTriggers(afterEtb, perm), perm.id);
}

// SOULBOND auto-pair (BLITZ SL-1, CR 702.95a) — the two soulbond triggered abilities, modeled as a DETERMINISTIC
// ETB pairing (the bond is beneficial, so auto-pairing when able is a safe policy; a human-interactive "you may
// pair" choice is a deferred PLAY-API change). Fired at EVERY creature ETB. POLICY: pair the entering creature
// with the FIRST eligible unpaired creature the SAME controller controls, in battlefield iteration order —
// where AT LEAST ONE of the pair is a soulbond creature whose bond we MODEL (parseSoulbondBond non-null). A
// soulbond carrier whose bond we can't model (Doom Weaver's quoted trigger) never pairs, so its whole card
// stays Arbiter's (no half-modeled state). Both must be unpaired (CR 702.95d — one partner only). Pure.
function isCreaturePerm(p) {
  return /\bCreature\b/.test(String(p?.card?.type || p?.card?.type_line || ""));
}
function modelableSoulbondPerm(p) {
  return isCreaturePerm(p) && !!parseSoulbondBond(p?.card);
}
function maybeAutoPairSoulbond(state, enteredPermId) {
  const lk = findPermanent(state, enteredPermId);
  if (!lk) return state;
  const entered = lk.permanent;
  if (entered.soulbondPartner || !isCreaturePerm(entered)) return state; // already paired (CR 702.95d) or not a creature
  const bf = state.players[entered.controller]?.battlefield || [];
  let partnerId = null;
  if (modelableSoulbondPerm(entered)) {
    // The entrant is a modelable soulbond creature → pair it with the first unpaired creature it controls.
    const cand = bf.find((p) => p.id !== entered.id && isCreaturePerm(p) && !p.soulbondPartner);
    if (cand) partnerId = cand.id;
  } else {
    // The entrant is a plain creature → pair it with the controller's first unpaired MODELABLE soulbond creature.
    const cand = bf.find((p) => p.id !== entered.id && !p.soulbondPartner && modelableSoulbondPerm(p));
    if (cand) partnerId = cand.id;
  }
  if (!partnerId) return state;
  let next = updatePermanentSafe(state, entered.id, (p) => ({ ...p, soulbondPartner: partnerId }));
  next = updatePermanentSafe(next, partnerId, (p) => ({ ...p, soulbondPartner: entered.id }));
  return logEvent(next, { kind: "soulbond-paired", controller: entered.controller, a: entered.id, b: partnerId, cardName: entered.card?.name || null });
}

/**
 * Type-line predicate: does this spell resolve as a permanent entering the
 * battlefield? Matches the original `defaultSpellResolver` set exactly (Creature
 * / Artifact / Enchantment / Planeswalker) so the PR-3 swap is behavior-identical.
 */
export function isPermanentSpell(card) {
  const typeLine = String(card?.type || card?.type_line || "");
  return /Creature|Artifact|Enchantment|Planeswalker/.test(typeLine);
}

/**
 * ADVENTURE (CR 715.3d): put the just-resolved adventure card into its owner's exile, flagged `_onAdventure`
 * so legalChoices offers the CREATURE half as a cast from exile. `card` is the FULL combined card (it left
 * hand at cast and lived only on the stack object); we clear any prior _onAdventure stamp defensively and add
 * it. Idempotent on the flag. Pure (returns new state). No SBA/trigger fires from this move (it's a spell
 * leaving the stack to exile, not a permanent leaving the battlefield).
 */
export function applyAdventureExile(state, { playerId, card }) {
  if (!card || !playerId) return state;
  const player = state.players?.[playerId];
  if (!player) return state;
  const exiledCard = { ...card, _onAdventure: true };
  const next = {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...player, exile: [...(player.exile || []), exiledCard] },
    },
  };
  return logEvent(next, { kind: "adventure-exile", playerId, cardName: card.name });
}

/**
 * Settle a pending clone copy-choice (CR 707): the clone enters the battlefield. With a chosen
 * creature still on the battlefield, it enters AS A COPY — its `card` becomes the source's
 * copiable values (CR 707.2) and its ORIGINAL card is stashed as `printedCard` (restored on
 * leave). With no/illegal/declined choice (a "you may" clone, or the target left — CR 707.9c),
 * it enters AS ITSELF: a 0/0 with no copy, which the lethal SBA then kills (CR 704.5f). Either
 * way the entry fires ETB triggers (enterPermanent reads the now-current card.oracle). The
 * caller (learnSession.settleCloneChoice) runs finalizeStackResolution to flush them.
 */
export function resolveCloneChoice(state, chosenPermId) {
  const pc = state.pendingChoice;
  if (!pc || pc.kind !== "clone-search") return state;
  const { cloneCard, controller, riders = [], optional, scope, printedCard } = pc.resume || {}; // printedCard: V1 slice 3 (Glasspool Mimic's real two-face card)
  let next = clearPendingChoice(state);
  if (!cloneCard || !controller) return next;

  // A clone with the "creature or planeswalker" scope (Spark Double) may copy a PLANESWALKER too (front-face,
  // CR 712.4a). A copied planeswalker enters with its starting loyalty via enterPermanent's castsAsPlaneswalker
  // path, so it's a real, non-dying permanent (NOT a 0/0). Front-face only: a creature-front DFC copies as its
  // creature side. (creature-clones still copy creatures; this only WIDENS what a PW-scope clone accepts.)
  // A clone with the "artifact or creature" scope (Phyrexian Metamorph) may copy a NON-creature ARTIFACT too
  // (front-face, CR 712.4a) — the resolution-time re-check (CR 707.9c) must accept an artifact source for that
  // scope, else a valid artifact pick would be treated as illegal and the clone would wrongly enter as a 0/0
  // (a forbidden FP). Scope-gated so a creature-only / PW clone still rejects an artifact source.
  // Resolution-time source re-check (CR 707.9c), SCOPE-GATED so it exactly mirrors cloneCandidates (defense-in-
  // depth: production callers already constrain the pick to the enumerated candidates, but a re-check looser than
  // enumeration is a latent footgun — a future unvalidated caller could copy an illegal source). Per scope:
  //   anyEquipment — ONLY an Equipment artifact (Masterwork of Ingenuity); a bare artifact/creature is illegal.
  //   anyArtifact  — ONLY an artifact (Sculpting Steel / Copy Artifact); a non-artifact creature is illegal.
  //   anyArtifactOrCreature — an artifact OR a creature (Phyrexian Metamorph).
  //   creature / PW scopes — a creature, plus a planeswalker for the youControlCreatureOrPw scope (Spark Double).
  const copiable = (c) => {
    if (!c) return false;
    const tl = String(c?.permanent?.card?.type || c?.permanent?.card?.type_line || "").split(" // ")[0];
    if (scope === "anyEquipment") return /Artifact/.test(tl) && /\bEquipment\b/.test(tl);
    if (scope === "anyArtifact") return /Artifact/.test(tl);
    if (scope === "anyEnchantment" || scope === "anyNonlandPermanent") return cloneWidenedCopiable(c.permanent.card, scope); // KN-2
    if (scope === "opponentCreature") return /Creature/.test(tl) && c.permanent.controller !== controller; // KN-3 (Imposter Mech): never your own
    return /Creature/.test(tl) || (scope === "youControlCreatureOrPw" && /Planeswalker/.test(tl)) || (scope === "anyArtifactOrCreature" && /Artifact/.test(tl));
  };
  let chosen = chosenPermId ? findPermanent(next, chosenPermId) : null;
  // WI-2 (CREED — CR 707.9): a MANDATORY clone ("~ enters as a copy of …", no "you may") cannot
  // decline. A null/stale submit while at least one OFFERED candidate is still on the battlefield
  // falls back to the deterministic auto-pick — entering a mandatory clone as an illegal 0/0 would
  // be playing the card wrong (a forbidden FP). Genuinely-empty candidates keep the enters-as-itself
  // path below (CR 707.9c: nothing to copy). `optional === false` only — an old serialized save
  // (no `optional` on the resume) keeps the historical declinable behavior.
  if (optional === false && !copiable(chosen)) {
    const fallbackId = autoPickCloneCandidate(next, pc);
    if (fallbackId) chosen = findPermanent(next, fallbackId);
  }
  const chosenIsCopiable = copiable(chosen);
  if (chosen && chosenIsCopiable) {
    // Snapshot the copiable values + apply the CARD-LEVEL "except …" copy modifications (CR 707.9): added
    // subtype, granted keyword, set P/T, conditional vanishing all bake into the copy's card. The
    // entersWithCounterIf / noop riders are NOT card-level (a counter lives on the permanent; isn't-legendary is
    // unenforced) — they're filtered out here so snapshotCopiedCard only sees card riders.
    const cardRiders = riders.filter((r) => r.kind !== "entersWithCounterIf" && r.kind !== "noop");
    const copied = snapshotCopiedCard(chosen.permanent, cloneCard, cardRiders);
    // CONDITIONAL ENTERS-WITH-COUNTER (Spark Double, CR 707.9a + 614.1c) — resolve the gate against the COPIED
    // card's resulting type (creature copy → +1/+1; planeswalker copy → loyalty) and pass the concrete counter
    // to enterPermanent so it's applied AS the permanent enters (before the lethal SBA + before ETB triggers
    // see it), exactly like every other enters-with-counter replacement. A non-matching condition adds nothing.
    const extraCounter = resolveCloneEntersCounter(riders, copied);
    next = enterPermanent(next, copied, controller, { printedCard: printedCard || cloneCard, extraCounter });
  } else {
    // Declined, or the target is gone/illegal — the clone enters as itself (a 0/0).
    next = enterPermanent(next, cloneCard, controller, printedCard ? { printedCard } : {});
  }
  // A clone that copied nothing is a 0/0 and dies immediately (CR 704.5f) — run the lethal SBA
  // (the copy case finds nothing lethal, so this is a no-op for it).
  const lethal = destroyLethalCreatures(next);
  return checkDiesTriggers(lethal.state, lethal.dead);
}

/**
 * CONDITIONAL ENTERS-WITH-COUNTER (Spark Double, CR 707.9a + 614.1c) — given the clone's riders and the
 * COPIED card, return the single { type, n } counter the matching condition adds (a creature copy gets the
 * "+1/+1 if it's a creature" rider, a planeswalker copy the "loyalty if it's a planeswalker" rider), or null
 * when no condition matches. The gate reads the copy's FRONT face (CR 712.4a) via castsAsPlaneswalker /
 * the Creature type line, so a creature-front DFC copy is treated as a creature. At most one rider matches
 * (the copy is one type), so the first match wins. Pure card read.
 */
function resolveCloneEntersCounter(riders, copiedCard) {
  const isPw = castsAsPlaneswalker(copiedCard);
  const isCreature = /\bCreature\b/.test(String(copiedCard?.type || copiedCard?.type_line || "").split(" // ")[0]);
  for (const r of riders || []) {
    if (r.kind !== "entersWithCounterIf") continue;
    if (r.ifType === "creature" && isCreature) return { type: r.counterType, n: r.n };
    if (r.ifType === "planeswalker" && isPw) return { type: r.counterType, n: r.n };
  }
  return null;
}

/**
 * A "no resolver / unknown key" resolution: log it and pop. This is the Arbiter
 * escape valve — the engine couldn't resolve natively, so it surfaces an
 * "unresolved" log the UI can hand to the Arbiter. Never throws, never fabricates.
 */
function resolveManual(state, obj) {
  return logEvent(state, {
    kind: "stack-resolve",
    objectId: obj.id,
    kindOfObject: obj.kind,
    source: obj.source?.name || obj.source,
    manual: true,
  });
}

/**
 * Built-in resolvers. Each is `(state, stackObject) => newState`. PURE — reads
 * only `stackObject.payload.params` + `state`; never closes over cast-time data.
 */
export const RESOLVERS = Object.freeze({

  [RESOLVER_KEYS.PERMANENT_ETB]: (state, obj) => {
    // `printedCard` (V1 slice 3): the REAL two-face card behind a modal-DFC FACE cast — stamped on the entering permanent
    // so every zone move restores the whole card (moveCardToZone reads printedCard; the clone precedent).
    const { card, controller, xValue, kicked, castFromZone, colorsSpent, grantDiesExile, printedCard, manaSpent, evoked, castDuringMainPhase } = obj.payload?.params || {}; // + manaSpent (Satoru, BI-5) + evoked (Solitude) + castDuringMainPhase (Sentinel's Mark)
    if (!card || !controller) return resolveManual(state, obj);
    // Clone (CR 707.9): the permanent enters AS A COPY of a creature chosen as it enters. Suspend
    // on a resolution-time choice (the player picks which creature; Expert/AI auto-pick) — the
    // same pendingChoice seam the tutor uses. With no legal target (no creatures), a clone just
    // enters as itself (a 0/0 → dies), so we only pause when there's something to copy.
    if (isCloneCard(card)) {
      const spec = parseCloneSpec(card);
      // MV-LIMITED clone (Mockingbird): "copy any creature with mana value ≤ the mana spent to cast
      // this". The cap = the clone's fixed pips + the value paid for {X} (threaded as xValue). null
      // for an unrestricted clone. The candidate list is filtered here so the picker only ever offers
      // legal targets; the riders ride in the resume so resolveCloneChoice applies them to the copy.
      const mvCap = cloneMvCap(card, spec, xValue);
      const candidates = cloneCandidates(state, controller, spec.scope, mvCap);
      if (candidates.length > 0) {
        // WI-2 (CR 707.9): thread the parsed mandatory-ness. `optional:false` ("~ enters as a copy
        // of …", no "you may") means the copy choice CANNOT be declined — the pilot seam drops the
        // null action, the UI hides the decline button, and resolveCloneChoice auto-picks on a
        // null/stale submit. Top-level for the UI panel; on the resume for the settle path.
        return setPendingCloneChoice(state, {
          controller,
          candidates,
          sourceName: card?.name || null,
          optional: spec.optional,
          resume: { cloneCard: card, controller, riders: spec.riders, optional: spec.optional, scope: spec.scope, ...(printedCard ? { printedCard } : {}) },
        });
      }
      // No creature to copy: the clone enters as itself (a 0/0) and dies (CR 704.5f).
      const entered = enterPermanent(state, card, controller, printedCard ? { printedCard } : {});
      const lethal = destroyLethalCreatures(entered);
      return checkDiesTriggers(lethal.state, lethal.dead);
    }
    return enterPermanent(state, card, controller, { xValue, kicked, wasCast: true, castFromZone, castDuringMainPhase: !!castDuringMainPhase, colorsSpent, grantDiesExile, castForNoMana: manaSpent === false, evoked: !!evoked, ...(printedCard ? { printedCard } : {}) });
  },

  // Aura spell resolving (CR 303.4f): the Aura enters the battlefield attached to the
  // creature it targeted at cast. Re-check legality at resolution (CR 608.2b): the target
  // must still be a creature on a battlefield. If it's gone/illegal, the Aura spell doesn't
  // resolve — it's put into its owner's graveyard by game rules (CR 608.3b) and never
  // enters (logged, never fabricated). The targetId is a battlefield permanent id.
  [RESOLVER_KEYS.AURA_ETB]: (state, obj) => {
    const { card, controller, targetId, bestowed, enchantsPlayer, hostType, kicked, printedCard, castDuringMainPhase } = obj.payload?.params || {}; // printedCard: V1 slice 3 (a modal-DFC Aura front — Glasswing Grace); castDuringMainPhase: Sentinel's Mark's Addendum look-back
    if (!card || !controller) return resolveManual(state, obj);
    // PLAYER-AURA (Fraying Sanity / the Curse class — SHELF S7, CR 303.4): the target is a PLAYER.
    // Re-check at resolution (CR 608.2b — the player may have been eliminated); gone → the Aura card
    // reaches its owner's graveyard (CR 608.3b, the same fizzle as a vanished creature target). Enters
    // UNATTACHED to any permanent, with `enchantedPlayerId` stamped for the enchanted-player referents.
    if (enchantsPlayer) {
      if (!state.players?.[targetId]) {
        return logEvent(finishSpellResolution(state, { playerId: controller, card }), { kind: "spell-fizzle", source: card?.name, reason: "enchanted player gone", controller });
      }
      return enterPermanent(state, card, controller, { enchantedPlayerId: targetId, ...(printedCard ? { printedCard } : {}) });
    }
    const tgt = findPermanent(state, targetId);
    const tgtType = String(tgt?.permanent?.card?.type || tgt?.permanent?.card?.type_line || "");
    // AURA-LAND-MANA-BOOST: a land-enchant mana Aura (Wild Growth / Overgrowth / Fertile Ground) must
    // still be attached to a LAND at resolution; every other native Aura enchants a Creature. The
    // required target type follows the card (single source of truth — isNativeManaAura), so the
    // creature path stays byte-identical.
    // CHOSEN-COLOR (Utopia Sprawl) enchants the FOREST subtype specifically, so its resolution re-check
    // requires a Forest (CR 303.4h — an Aura whose enchant restriction its target no longer meets isn't put
    // onto the battlefield). A bare land-mana Aura requires any Land; a creature Aura requires a Creature.
    // GRANT-AURA CAST (BLITZ TS-1): a grant-family Aura cast stamps its host type onto the SERIALIZABLE
    // payload (actionDispatcher, from the shared grantAuraCastHostType gate) — the CR 608.2b re-check
    // requires that type ("Enchant land" must still point at a Land). Legacy payloads carry no hostType
    // and keep the original mana-aura/creature derivation byte-identical.
    // ES-1 (2026-08-05): the NON-CREATURE host types. This re-check defaulted to /Creature/ for every
    // hostType it didn't recognise, so the moment an "Enchant artifact" Aura became native its cast would
    // have FIZZLED here — spell to the graveyard, nothing on the battlefield, and the coverage metric
    // claiming the card plays. That is the silent-do-nothing the CREED forbids, and it is why this seam
    // was mapped before the parser was touched rather than discovered afterwards.
    // ⛔ A LOOKUP, NOT A NINTH TERNARY. This started as two branches and reached eight; at that depth the
    // `else` tail is genuinely hard to see, and the tail is the DANGEROUS part — it is the /Creature/
    // default that silently fizzled every non-creature host before ES-1. A miss here still falls to that
    // default, so the table keeps ONE key per targetType auraEnchantHostSpec can emit and nothing else.
    // nonlandPermanent is a NEGATIVE requirement, hence a lookahead rather than a type name; `.test()`
    // against the host's type line is the same contract either way.
    const HOST_TYPE_RE = {
      land: /Land/, creature: /Creature/, artifact: /Artifact/,
      creatureOrArtifact: /Creature|Artifact/, creatureOrVehicle: /Creature|Vehicle/,
      nonlandPermanent: /^(?!.*\bLand\b)/, creatureOrPlaneswalker: /Creature|Planeswalker/,
      artifactCreatureOrPlaneswalker: /Artifact|Creature|Planeswalker/,
    };
    const requiredType = HOST_TYPE_RE[hostType]
      || (isNativeManaAura(card) ? (auraChoosesColorOnEnter(card) ? /Forest/ : /Land/) : /Creature/);
    if (!tgt || !requiredType.test(tgtType)) {
      // BESTOW (CR 702.103g): a bestow spell whose creature target is gone at resolution doesn't enter as
      // an unattached Aura — it isn't put onto the battlefield at all → owner's graveyard. Same fizzle as
      // a printed Aura (the spell never resolves into a permanent), so no special case is needed here.
      // GY-2 (CR 608.3b): the fizzled Aura CARD reaches its owner's graveyard (it used to vanish).
      return logEvent(finishSpellResolution(state, { playerId: controller, card }), { kind: "spell-fizzle", source: card?.name, reason: "aura target illegal", controller });
    }
    // BESTOW: thread `bestowed` so enterPermanent flags the permanent (layer-4 Creature-type removal while
    // attached + the falls-off SBA exemption). A printed Aura passes bestowed=undefined → identical path.
    // ④-J KICKER (CR 702.33b/e): a kicked Aura cast stamps wasKicked on the entering Aura (enterPermanent), so
    // its own "When this Aura enters, if it was kicked, …" trigger fires (Bubble Snare taps the host).
    // wasCast + castDuringMainPhase (Sentinel's Mark, 2026-09-05): an Aura spell resolving IS a cast (CR 303.4f) — stamp it like
    // the permanent resolver does, so the Aura's own ETB look-backs can read how and when it arrived.
    return enterPermanent(state, card, controller, { attachTo: targetId, bestowed, wasCast: true, ...(castDuringMainPhase ? { castDuringMainPhase: true } : {}), ...(kicked ? { kicked: true } : {}), ...(printedCard ? { printedCard } : {}) });
  },

  // P2.1: a recognized-but-unparseable instant/sorcery. No longer a silent
  // no-op — flag it for the Arbiter seam (structured `spell-unresolved` log +
  // `state.pendingArbiter`) so the player gets a verified ruling instead of the
  // spell quietly doing nothing.
  [RESOLVER_KEYS.SPELL_NOOP]: (state, obj) => {
    const { reason } = obj.payload?.params || {};
    return markPendingArbiter(state, obj, reason || "instant-or-sorcery (no recognized effect)");
  },

  // W4 (DEPRECATED lane — retired): the naive TRIGGER_EFFECT vocabulary was deleted (it drew without
  // firing draw-triggers and resolved damage as plain loseLife — CREED-divergent from the atoms).
  // makePendingTrigger now emits a manual payload directly and the flush stage upgrades faithful
  // triggers to EFFECT_PROGRAM. The key is KEPT for one release so a serialized mid-stack save (or a
  // stray legacy payload) still resolves SAFELY as the Arbiter no-op instead of crashing the registry.
  [RESOLVER_KEYS.TRIGGER_EFFECT]: (state, obj) => resolveManual(state, obj),

  // P2.2: the EffectProgram interpreter — THE live resolution lane. Runs an ordered
  // Atom[] in printed order when the program is high-confidence; a low-confidence
  // (unmodeled) program runs ZERO atoms and routes to the Arbiter seam (all-or-nothing).
  //
  // INTERVENING-IF (CR 603.4 resolution re-check) — a conditional trigger bound its interveningIf onto
  // `params.condition` (gameEngine.buildTriggerStack, the general board-query path). Re-evaluate it HERE at
  // resolution: false (condition no longer met, e.g. the artifact was sacrificed in response) OR null
  // (unresolved) → the ability does nothing (CR 603.4 — "if false at resolution, it has no effect"). A win-
  // game atom carries its own condition + re-check inside applyWinGame, so only the GENERAL path sets
  // params.condition; both re-checks are strict (never fail-open).
  [RESOLVER_KEYS.EFFECT_PROGRAM]: (state, obj) => {
    const params = obj.payload?.params;
    if (params?.condition != null) {
      // Pass params.context (the bound trigger context) so a per-PERMANENT condition (SAME-NAME ETB —
      // Guardian Project) re-reads the entering permanent at resolution (CR 603.4 second check).
      const ok = evaluateInterveningIf(state, params.condition, params.controller, params.context);
      if (ok !== true) {
        // ADVENTURE: even a condition-not-met adventure spell still EXILES the card (CR 715.3d — the card is
        // exiled as the spell finishes resolving regardless of whether the effect did anything). Apply the
        // exile before returning so the creature half stays castable from exile.
        const skipped = logEvent(state, { kind: "trigger-effect", effect: "intervening-if-not-met", controller: params.controller, condition: params.condition });
        return params.adventureExile ? applyAdventureExile(skipped, params.adventureExile) : skipped;
      }
    }
    const next = runEffectProgram(state, obj);
    // ADVENTURE (CR 715.3d): the adventure spell's card goes to EXILE (not the graveyard like a normal
    // instant/sorcery), flagged `_onAdventure` so the creature half is castable from exile. We append the FULL
    // card (params.adventureExile.card) to the controller's exile here, after the program ran. The card left
    // hand at cast and lives only on the stack object, so this is the move into exile — there's no graveyard
    // disposition to redirect (the engine doesn't track resolved instant/sorcery cards into the graveyard).
    // NOTE: if the program SUSPENDED on a resolution-time choice (a tutor — Fertile Footsteps), `next` carries
    // a pendingChoice and the rest of the atoms run on resume; the exile is applied now regardless. That's safe
    // for the whole clean adventure set — no clean adventure effect targets/references its own card, so the
    // card sitting in exile during the pause changes nothing (verified by the corpus audit).
    return params?.adventureExile ? applyAdventureExile(next, params.adventureExile) : next;
  },

  // Equip/Aura attach (CR 701.3): move the equipment onto the target creature. Re-checks
  // legality at resolution (CR 608.2b) — the source + target must still be on the
  // battlefield, both controlled by the activating player, the target a creature; an
  // illegal target makes the ability do nothing (logged, never fabricated).
  [RESOLVER_KEYS.ATTACH]: (state, obj) => {
    const { sourceId, targetId, controller, aura = false } = obj.payload?.params || {};
    const src = findPermanent(state, sourceId);
    const tgt = findPermanent(state, targetId);
    const tgtType = String(tgt?.permanent?.card?.type || tgt?.permanent?.card?.type_line || "");
    // SHELF-85 V15 (Detainment Spell): an AURA re-attach ("Attach this Aura to target creature") may land on an
    // opponent's creature — Equip's own-creature rule (CR 702.6a) is Equip's alone. The Aura still must be the
    // activator's, and the target a creature (the printed "Enchant creature").
    if (!src || !tgt || src.controller !== controller || (!aura && tgt.controller !== controller) || !/Creature/.test(tgtType)) {
      return resolveManual(state, obj);
    }
    // CR 301.5c — an Equipment that is a creature RIGHT NOW and has no reconfigure (a crewed Rover Blades paying its own
    // Equip) can't equip a creature: the ability does nothing and the Equipment stays where it is (CR 701.3b). Logged as
    // refused, never as an "attach" — the log narrator reads that kind as one. Reconfigure (Lizard Blades) is the exception.
    // The 09-06 plan's stage ③ · 34, the attach-pair's guard (③ · 33) on the Equip lane.
    if (!aura && equipmentBarredAsCreature(state, sourceId)) {
      return logEvent(state, { kind: "attach-refused", rule: "CR 301.5c", source: src.permanent.card?.name, target: tgt.permanent.card?.name, controller });
    }
    return logEvent(attachPermanent(state, { equipId: sourceId, targetId }), {
      kind: "attach", source: src.permanent.card?.name, target: tgt.permanent.card?.name, controller,
    });
  },

  // GY SELF-RECURSION (BLITZ GY-1, CR 602.2 — Reassembling Skeleton / Sanitarium Skeleton class): the
  // graveyard-activated "Return this card from your graveyard to <your hand | the battlefield [tapped]>".
  // Re-checks the card is STILL in the controller's graveyard at resolution — removed in response, the
  // ability does nothing (a logged fizzle, never a fabricated return). The hand path rides moveCardToZone
  // (its graveyard-LEAVE event fires the gy-event watchers); the battlefield path splices the card, records
  // the same leave event, then enters through the SAME enterPermanent a resolved permanent spell uses (ETB
  // replacements + triggers fire identically), tapping the fresh permanent when the ability says "tapped".
  [RESOLVER_KEYS.GY_SELF_RETURN]: (state, obj) => {
    const { cardId, controller, dest, entersTapped: tapIt } = obj.payload?.params || {};
    const player = state.players?.[controller];
    const card = (player?.graveyard || []).find((c) => c.id === cardId);
    if (!card) return logEvent(state, { kind: "spell-effect", effect: "gy-self-return", controller, fizzled: true });
    if (dest === "hand") {
      const next = moveCardToZone(state, { playerId: controller, fromZone: "graveyard", toZone: "hand", cardId });
      return logEvent(next, { kind: "spell-effect", effect: "gy-self-return", controller, dest: "hand", cardName: card.name });
    }
    const gy = player.graveyard.filter((c) => c.id !== cardId);
    let next = { ...state, players: { ...state.players, [controller]: { ...player, graveyard: gy } } };
    next = recordGraveyardEvents(next, [{ dir: "leave", card, gyOwner: controller, zone: "battlefield" }]);
    next = enterPermanent(next, card, controller);
    if (tapIt) {
      const bf = next.players[controller].battlefield;
      if (bf.length) next = tapPermanent(next, bf[bf.length - 1].id, { fromEnter: true }); // CR 701.26a: re-enters tapped ≠ "becomes tapped" — suppress the event
    }
    return logEvent(next, { kind: "spell-effect", effect: "gy-self-return", controller, dest: "battlefield", cardName: card.name, tapped: !!tapIt });
  },

  [RESOLVER_KEYS.MANUAL]: resolveManual,
});

// Extension registry: triggers / the Phase-2 interpreter (and tests) register
// here rather than mutating the frozen built-ins.
const EXTENSIONS = new Map();

/** Register a resolver for a key not in the built-in set (static registration). */
export function registerResolver(key, fn) {
  if (typeof fn !== "function") throw new Error(`registerResolver: fn for "${key}" must be a function`);
  EXTENSIONS.set(key, fn);
}

/** Resolve a key to its function: built-ins win, then extensions, then null. */
export function getResolver(key) {
  if (key && Object.prototype.hasOwnProperty.call(RESOLVERS, key)) return RESOLVERS[key];
  return (key && EXTENSIONS.get(key)) || null;
}

/** Test-only: drop all registered extensions (call in beforeEach). */
export function _clearExtensionsForTests() {
  EXTENSIONS.clear();
}

// CZ-COMMANDER-VISIT injection (Hellkite Courser, 2026-08-14): hand the atoms leaf the two cross-layer
// doors it must not import statically (zones.js sits under effectAtoms → parser; a static import of this
// module from there TDZ-crashed 56 suites). resolvers.js already imports zones-ward safely at runtime via
// the resolver registry, and layers.js is imported here transitively — registering at THIS module's load
// guarantees the doors exist before any game resolves an atom.
import { registerCzEnterPermanent, registerCzAddContinuousEffect } from "./effects/atoms/zones.js";
import { addContinuousEffect as _czAddContinuousEffect } from "./layers.js";
registerCzEnterPermanent(enterPermanent);
registerCzAddContinuousEffect(_czAddContinuousEffect);
