/**
 * effects/atoms/stack.js — stack / damage / attach atoms (counter, self-attach, deal-damage).
 * Imports applyControllerRider from removal.js (DAG: removal <- stack) for the soft-counter rider.
 */

import { applyDamageEffect, parseCreatureTargetRestrictions } from "../../spellEffects.js"; // the SHARED creature-restriction grammar — massFilteredDamageClauseParser's general arm delegates its recipient phrase to it (no new module edge: applyDamageEffect already came from here)
import { logEvent, attachPermanent, findPermanent, creaturePower, opponentsOf, mintId, createStackObject, addCounter, recordGraveyardEvents, updatePermanentSafe } from "../../gameState.js";
import { setPendingSoftCounterChoice, setPendingOptionalManaPaymentChoice, setPendingOptionalSacBySubtypeChoice, setPendingOptionalDrawDiscardChoice, setPendingOptionalDiscardPaymentChoice, setPendingOptionalExileSelfChoice, setPendingSacUnlessPayChoice, setPendingTaxedPaymentChoice } from "../../pendingChoice.js";
import { resolveScaledAmount, countForSpec, isCreatureCard } from "./shared.js";
import { permanentIsCreature, permanentTypes, equipmentBarredAsCreature } from "../../layers.js"; // CR 613 — an animated permanent is a creature RIGHT NOW; + CR 301.5c at the attach-pair (stage ③ · 33); + the host's live types for the Aura's Enchant line (③ · 34)
import { applyControllerRider } from "./removal.js";
import { parseCountSource } from "../parseHelpers.js"; // seam batch 15: shared count-source parser (leaf, cycle-free) for dealDamageScaledClauseParser
import { expandCastChoices } from "../targeting.js"; // STORM-COPY-TARGET: re-enumerate a fresh legal target per copy (CR 707.10c). targeting.js is cycle-safe from here (its closure reaches neither atoms/stack nor parser).
import { snapshotCopiedCard } from "../../cloneCopy.js"; // COPY-A-CREATURE-SPELL (Double Major, CR 707.2): the chosen creature spell's copiable card. cloneCopy is a pure leaf (imports only gameState) — cycle-safe.
import { checkCopyTriggers } from "../../triggers.js"; // MAGECRAFT COPY HALF (BLITZ MC-1, CR 707.10): fire "cast or copy" watchers at the copy-creation site. Cycle-safe — triggers.js's import closure (targeting→spellEffects→triggers, layers, keywords, saga, triggerScheduler) never reaches atoms/stack.js, so this edge adds no cycle; checkCopyTriggers is called only at runtime.
import { applyScheduleDelayed } from "./delayedTrigger.js"; // MANA DRAIN: schedule the delayed {C} payout on the CR 603.7 queue (leaf module — imports only gameState, cycle-free)
import { applyZoneMove } from "./zones.js"; // VENSER: the permanent half of the spell-or-permanent bounce. Layering {tokens,library,zones} <- removal <- stack sanctions this edge (zones' closure never reaches stack)
import { auraEnchantHostSpec, auraEnchantSubject, stackSpellIsUncounterable } from "../../staticAbilityParser.js"; // ATTACH-ON-ENTER AURAS (Shielded by Faith): the Aura's own Enchant line, honoured at the move (counters.js / zones.js already import this module — cycle-safe); + the shared CR 701.6a predicate for the untargeted counter (the Glasskites)
import { creatureSatisfiesRestrictions } from "../../creatureRestrictions.js"; // the shared restriction satisfier (leaf), for the Enchant line's "you control"
import { evaluateInterveningIf } from "../../interveningIf.js"; // FEROCIOUS HARD-COUNTER (Stubborn Denial): the resolution-time condition read. interveningIf imports only gameState — leaf edge, cycle-free.

/**
 * P3.1 counter (CR 701.6a) — counter the target spell(s) on the stack. The targeted
 * spell is removed from the stack and put into its controller's graveyard WITHOUT
 * resolving: no atoms run, no permanent enters, no effect, no triggers. This is the
 * stack-removal mechanic — the FIRST atom that mutates the stack rather than the
 * battlefield/players.
 *
 * Fail-safe (CR 608.2b): if the target already left the stack (it resolved, or a
 * higher counter got it first), the counter fizzles for that target — a logged no-op,
 * never an error, never a fabricated effect. A defensive re-check of the SPELL-TYPE
 * filter (creature/noncreature) runs here (it held at cast time + a spell's type can't
 * change on the stack). The on-card "can't be countered" exclusion (CR 701.6a) is
 * enforced at ENUMERATION only (spellEffects.enumerateTargets) — sufficient because the
 * engine models no effect that grants uncounterability after a target is chosen, and
 * on-card text is immutable, so an uncounterable spell can never reach this atom.
 */
// Front-face type only (CR 712.4a) — for a split/MDFC spell the enriched type line is the
// combined "Front // Back", so the creature/noncreature filter must read the front half.
const counterTypeLine = (card) => String(card?.type || card?.type_line || "").split(" // ")[0];
// CNT-MV-EXACT (WAVE 2b) — Mental Misstep / Spell Snare: the target spell's mana value must EQUAL
// atom.exactMv (NOT "or less"/"or greater"). A spell with no cmc reads 0 (CR 202.3 — an absent cost is MV 0).
// CNT-MV-CMP (CROSS-COUNTER) — Disdainful Stroke / Minor Misstep / Thoughtbind: "mana value N or greater" /
// "or less" is the INEQUALITY form (atom.minMv / atom.maxMv), checked alongside the exact form. The parser
// emits at most one of {exactMv, minMv, maxMv} per atom, so testing each independently is correct.
const counterMvOk = (card, atom) => {
  if (atom == null) return true;
  const mv = card?.cmc ?? card?.mana_value ?? 0; // CR 202.3 — an absent cost is MV 0
  if (atom.exactMv != null && mv !== atom.exactMv) return false;
  if (atom.minMv != null && !(mv >= atom.minMv)) return false;
  if (atom.maxMv != null && !(mv <= atom.maxMv)) return false;
  return true;
};
// CNT-COLOR (CROSS-COUNTER) — Gainsay / Frazzle / Ceremonious Rejection / Neutralizing Blast: the target's
// COLOR. Reads the FRONT-face colors (CR 712.4a): a DFC's combined "Front // Back" type line signals a DFC, so
// prefer card_faces[0].colors over the (often-stale) top-level field, mirroring spellEffects.colorNeg. FAIL-
// CLOSED when colors are unresolvable (no array) — never offer/resolve a wrong-color counter (an illegal
// target is the cardinal sin; a dropped legal target is a safe false-negative). Shared by both filter funcs.
export function counterColorsOf(card) {
  const isDfc = / \/\/ /.test(String(card?.type || card?.type_line || ""));
  const colors = isDfc ? card?.card_faces?.[0]?.colors : card?.colors;
  return Array.isArray(colors) ? colors : null;
}
function counterColorOk(card, atom) {
  if (atom?.colorFilter == null) return true;
  const cf = atom.colorFilter;
  const colors = counterColorsOf(card);
  if (colors == null) return false; // FAIL-CLOSED — unresolvable colors never match a color-restricted counter
  if (cf.colorless) return colors.length === 0;       // "counter target colorless spell"
  if (cf.multicolored) return colors.length >= 2;     // "counter target multicolored spell"
  if (cf.color) return cf.negate ? !colors.includes(cf.color) : colors.includes(cf.color); // (non)blue, etc.
  return true;
}
export function counterFilterMatches(card, filter, atom = null) {
  const type = counterTypeLine(card);
  if (!counterMvOk(card, atom)) return false; // CNT-MV-EXACT / CNT-MV-CMP — fails the MV test → not a legal target
  if (!counterColorOk(card, atom)) return false; // CNT-COLOR — fails the color test → not a legal target
  if (filter === "noncreature") return !/Creature/.test(type);
  if (filter === "creature") return /Creature/.test(type);
  // CNT-TYPE (CROSS-COUNTER) — single-type / 2-type-union hard counters (Dispel / Envelop / Artifact Blast /
  // Annul / Nullify). Each is a word-bounded front-face type test; mirrored in spellMatchesCounterFilter.
  if (filter === "instant") return /\bInstant\b/.test(type);
  if (filter === "sorcery") return /\bSorcery\b/.test(type);
  if (filter === "artifact") return /\bArtifact\b/.test(type);
  if (filter === "artifactOrEnchantment") return /\b(?:Artifact|Enchantment)\b/.test(type);
  if (filter === "creatureOrAura") return /\bCreature\b/.test(type) || /\bAura\b/.test(type);
  // CNT-IS (Flusterstorm's soft-counter — "instant or sorcery spell") — the 2-type union (front-face).
  if (filter === "instantSorcery") return /\b(?:Instant|Sorcery)\b/.test(type);
  if (filter === "instantOrAura") return /\bInstant\b/.test(type) || /\bAura\b/.test(type); // Avoid Fate (KT-9)
  // SOFT-COUNTER-RIDER — Swan Song's 3-way filter (mirrors spellMatchesCounterFilter for enumeration).
  if (filter === "enchantmentInstantSorcery") return /\b(?:Enchantment|Instant|Sorcery)\b/.test(type);
  // CNT-ACP (WAVE 2b) — Strix Serenade's 3-way "artifact, creature, or planeswalker" union (front-face).
  if (filter === "artifactCreaturePlaneswalker") return /\b(?:Artifact|Creature|Planeswalker)\b/.test(type);
  return true; // "any"
}
// CNT-ZONE-REDIRECT (CROSS-COUNTER) — the zone a countered SPELL is put into (CR 701.6a + the card's "instead
// of into its owner's graveyard" rider). Default "graveyard"; "exile" (Deny Existence), "hand" (Remand —
// returned to its owner's hand), "library-top" (Memory Lapse — put on top of its owner's library). Append for
// graveyard/exile/hand; PREPEND for library-top (index 0 = the TOP of the library, where drawCards slices from).
// A countered cast spell's controller IS its owner (the engine only models normal casts), so the controller is
// the correct zone owner here — matching CR's "its owner's <zone>".
function placeCounteredCard(player, card, dest) {
  switch (dest) {
    case "exile":        return { ...player, exile: [...(player.exile || []), card] };
    case "hand":         return { ...player, hand: [...(player.hand || []), card] };
    case "library-top":  return { ...player, library: [card, ...(player.library || [])] };
    default:             return { ...player, graveyard: [...player.graveyard, card] };
  }
}

/**
 * Counter the spell — or ABILITY — with id `spellId` on the stack (CR 701.6a): remove it from the stack,
 * logging the counter (an optional `via` tag, e.g. "soft-counter", records HOW). A SPELL goes to its
 * controller's graveyard by default, or to the zone named by `counterDest` ("exile"/"hand"/"library-top" —
 * the CNT-ZONE-REDIRECT riders: Deny Existence / Remand / Memory Lapse); a countered ACTIVATED/TRIGGERED
 * ABILITY is not a card and goes to no zone — it simply leaves the stack and ceases to exist (CR 701.6a). An
 * object no longer on the stack (left mid-resolution) is a logged fizzle, never an error. Shared by the hard
 * counter (applyCounter) AND the SOFT-CNT pay-decline path (runProgram.resolveSoftCounterChoice — KW-WARD-PR2
 * also routes a warded ABILITY here) so the paths can't drift. `exileInstead` is kept as a back-compat alias
 * for counterDest:"exile".
 */
export function counterSpellById(state, spellId, { via = null, exileInstead = false, counterDest = null } = {}) {
  const idx = (state.stack || []).findIndex((o) => o.id === spellId);
  if (idx === -1) return logEvent(state, { kind: "spell-effect", effect: "counter-fizzle", targetId: spellId });
  const targetObj = state.stack[idx];
  // GY-3 (CR 715.4): a countered ADVENTURE cast puts the FULL combined card into the graveyard, not
  // the face projection riding as `source` (same id, face-typed). The full card is on the payload
  // only for adventure casts; every other spell is byte-identical.
  const card = targetObj.payload?.params?.adventureExile?.card || targetObj.source;
  const controller = targetObj.controller;
  const isSpell = targetObj.kind === "spell"; // an ability is not a card → no zone change on counter
  const newStack = [...state.stack.slice(0, idx), ...state.stack.slice(idx + 1)];
  const player = state.players[controller];
  // FLASHBACK (CR 702.34a): a spell cast for its flashback cost is exiled — not graveyard'd — when it leaves the
  // stack for ANY reason, including a counter. The `exile:true` rider on the cast's spellToGraveyard disposition
  // rides the stack object's payload, so a countered flashback spell diverts to exile here (else it would return
  // to the graveyard and the flashback offer would re-fire — the infinite-recast FP).
  const flashbackExile = !!targetObj.payload?.params?.spellToGraveyard?.exile;
  const dest = counterDest || (exileInstead ? "exile" : (flashbackExile ? "exile" : "graveyard")); // exileInstead → counterDest:"exile" alias
  let next = {
    ...state,
    stack: newStack,
    players: (isSpell && player)
      ? { ...state.players, [controller]: placeCounteredCard(player, card, dest) }
      : state.players,
  };
  // GY-EVENT (SHELF S7): a countered SPELL whose disposition is the default graveyard enters it from the
  // stack (CR 701.6a). A redirected disposition (exile / hand / library-top) never touches a graveyard.
  if (isSpell && player && dest === "graveyard" && card) {
    next = recordGraveyardEvents(next, [{ dir: "enter", card, gyOwner: controller, zone: "stack" }]);
  }
  // Log the destination (`dest`) for any non-graveyard zone; keep the legacy `exiled:true` flag for the exile
  // case so existing log assertions stay green (back-compat with CNT-EXILE-INSTEAD's original log shape).
  return logEvent(next, { kind: "spell-effect", effect: "counter", targetId: spellId, cardName: card?.name, controller, ...(dest !== "graveyard" && { dest }), ...(dest === "exile" && { exiled: true }), ...(via && { via }) });
}

/**
 * COUNTER, ASKING CR 701.6a AT RESOLUTION — the entry every COUNTER path takes (2026-09-30). counterSpellById is the
 * raw stack-removal primitive; this asks first whether a SPELL can be countered at all (stackSpellIsUncounterable —
 * the same predicate the counter-target enumeration reads). The enumeration alone was never enough: a counter that
 * names no target never passes through it (Kira; the cast-trigger counters — Vexing Bauble, Lunar Force; the ward and
 * group-ward soft-counter decline), and a targeted counter can meet a spell made uncounterable AFTER it was targeted
 * (Vexing Shusher's grant in response). An uncounterable spell stays on the stack and the counter is a logged no-op.
 * An ABILITY is never uncounterable here. Venser's bounce is not a counter and keeps the raw primitive.
 */
export function counterIfCounterable(state, objId, opts = {}) {
  const obj = (state.stack || []).find((o) => o.id === objId);
  if (obj?.kind === "spell" && stackSpellIsUncounterable(state, obj)) {
    return logEvent(state, { kind: "spell-effect", effect: "counter-uncounterable", targetId: objId, cardName: obj.source?.name || null, controller: obj.controller, ...(opts.via && { via: opts.via }) });
  }
  return counterSpellById(state, objId, opts);
}

function applyCounter(state, atom, ctx) {
  let next = state;
  for (const t of ctx.targets || []) {
    if (t.type !== "spell") continue;
    const idx = next.stack.findIndex((o) => o.id === t.id && o.kind === "spell");
    if (idx === -1) {
      // Target already off the stack → illegal target, the counter does nothing here.
      next = logEvent(next, { kind: "spell-effect", effect: "counter-fizzle", targetId: t.id });
      continue;
    }
    const targetObj = next.stack[idx];
    const card = targetObj.source;
    // The atom rides into the filter so CNT-MV-EXACT (Mental Misstep / Spell Snare) can re-check the
    // target spell's mana value here, mirroring the enumeration-time check (spellMatchesCounterFilter).
    if (!counterFilterMatches(card, atom.spellFilter, atom)) {
      next = logEvent(next, { kind: "spell-effect", effect: "counter-fizzle", targetId: t.id });
      continue;
    }
    // SOFT-CNT — "unless its controller pays {N}" (FIXED) or "{X}" (SOFT-CNT-X, the counterspell's own cast
    // {X}, read from ctx.xValue floored at 0 — CR 107.3). Don't counter yet: flag the TARGETED spell's
    // controller's pay-or-be-countered choice (runProgram attaches the resume + suspends; the driver settles
    // it via resolveSoftCounterChoice — pay → spell survives, else countered). The parser produces exactly
    // ONE spell target per counter atom, so set the choice and stop the loop.
    // FEROCIOUS HARD-COUNTER (2026-08-14 — Stubborn Denial): with the printed condition TRUE at
    // resolution (CR 608.2's "instead"), the soft counter is replaced by a HARD one — skip the
    // pay-choice entirely and fall through to counterSpellById. Anything but an affirmative true
    // (false, or a null the parser's spellConditionParseable gate should make impossible) keeps the
    // printed BASE behavior — the soft counter — never a fabricated upgrade.
    const hardUpgrade = atom.hardIfCondition
      && evaluateInterveningIf(next, atom.hardIfCondition, ctx.controller, { sourcePermanentId: ctx.sourceId }) === true;
    // CAN'T BE COUNTERED, ASKED AT RESOLUTION (CR 701.6a; 2026-09-30). The enumeration kept uncounterable spells off
    // the target list when this counter was CAST, but a spell can become uncounterable after it was targeted (Vexing
    // Shusher's grant in response; a Chimil or Root Sliver arriving meanwhile). The target is still LEGAL, so only the
    // counter itself fails — per the rulings on Swan Song, Mana Drain and An Offer You Can't Refuse, and Vexing
    // Shusher's own ("any additional effects of the countering spell or ability will still happen"). A soft counter
    // asks for no payment (there is nothing it could buy); the hard counter's riders below still happen.
    const uncounterableNow = stackSpellIsUncounterable(next, targetObj);
    const softCounter = (atom.unlessPay != null || atom.unlessPayX || atom.unlessPayCount) && !hardUpgrade;
    if (softCounter && uncounterableNow) {
      next = logEvent(next, { kind: "spell-effect", effect: "counter-uncounterable", targetId: t.id, cardName: card?.name || null, controller: targetObj.controller });
      continue;
    }
    if (softCounter && !next.pendingChoice) {
      // SOFT-CNT-COUNT — "pays {N} for each <count source>" (Rakshasa's Disdain {1}/GY card, Override
      // {1}/artifact, Oppressive Will {1}/hand card): the tax is per × a board/zone count resolved HERE via
      // the shared countForSpec (the same primitive the deal-damage-by-count path uses). An unmodeled count
      // source never reaches this (parseCountSource → null → the clause stayed LOW → Arbiter).
      const amount = atom.unlessPayCount
        ? Math.max(0, (atom.unlessPayCount.per || 1) * countForSpec(next, ctx, atom.unlessPayCount.spec))
        : atom.unlessPayX ? Math.max(0, ctx.xValue || 0) : atom.unlessPay;
      return setPendingSoftCounterChoice(next, {
        controller: targetObj.controller,
        amount,
        spellId: t.id,
        spellName: card?.name || null,
        sourceName: ctx.cardName || null,
        // CS-1 (Syncopate / No More Lies): a soft counter with a zone redirect carries the destination
        // ONTO the choice, so the decline path (resolveSoftCounterChoice → counterSpellById) can't drop it.
        counterDest: atom.exileInstead ? "exile" : (atom.counterDest || null),
      });
    }
    // SOFT-COUNTER-RIDER — capture the COUNTERED spell's controller, counter it (CNT-ZONE-REDIRECT routes it to
    // exile / its owner's hand / top of its owner's library instead of the graveyard — Deny Existence / Remand /
    // Memory Lapse), then apply the rider to THAT player (An Offer's Treasures / Swan Song's Bird / Dream
    // Fracture's draw go to whoever's spell was countered, not the caster). The rider fires whenever the target is
    // still LEGAL — countered, or uncounterable and left on the stack (the Swan Song / An Offer rulings: its
    // controller still gets the Bird / the Treasures); a fizzle above skips it.
    const riderController = targetObj.controller;
    // MANA DRAIN — the countered spell's MV, read BEFORE counterSpellById moves it off the stack.
    // CR 202.3b: on the stack an {X} cost counts the chosen X, which rides payload.params.xValue
    // (absent on non-X casts → +0); card.cmc counts X as 0, so the sum is the stack MV.
    const counteredMv = Math.floor(card?.cmc ?? card?.mana_value ?? 0) + Math.max(0, targetObj.payload?.params?.xValue || 0);
    next = uncounterableNow
      ? logEvent(next, { kind: "spell-effect", effect: "counter-uncounterable", targetId: t.id, cardName: card?.name || null, controller: targetObj.controller })
      : counterSpellById(next, t.id, { exileInstead: !!atom.exileInstead, counterDest: atom.counterDest || null });
    if (atom.controllerRider && next.players?.[riderController]) {
      next = applyControllerRider(next, atom.controllerRider, { controller: riderController, power: 0 }, ctx);
    }
    // MANA DRAIN (CR 603.7d) — schedule the {C} payout for the CASTER's next main phase, the clause
    // rewritten CONCRETE with the MV locked here (the sentinel discipline — the fired trigger parses
    // on the ordinary ritual-mana arm, no dead "that spell" referent). MV 0 schedules nothing — an
    // empty add is not a firing. Runs whenever the target was LEGAL — a real counter, or an uncounterable spell
    // left on the stack (the Mana Drain ruling: "you do add mana"); a fizzle above `continue`d away.
    if (atom.delayedManaFromMv && counteredMv > 0 && next.players?.[ctx.controller]) {
      next = applyScheduleDelayed(next, { delayedClause: "add " + "{c}".repeat(counteredMv), fireStep: "main", fireScope: "yours" }, ctx);
    }
  }
  return next;
}

/**
 * ETB-EQUIP-ATTACH — "attach it to target creature you control" (CR 301.5 / 701.3). "It" is the SOURCE
 * Equipment (ctx.sourceId, the permanent whose ETB trigger fired), so this attaches the equipment to the
 * chosen creature via the shared `attachPermanent` helper — the SAME mechanism the Equip activated ability
 * uses, so the equipped-creature static bonus (parseAttachedBonus, applied by the layer engine when
 * `attachedTo` is set) lights up immediately. The target is enumerated as a creature the controller
 * controls (the parser's controller:you restriction), and atomTargetIntent("self-attach")="own" keeps the
 * trigger-flush chooser on the controller's own side. No source / target gone → attachPermanent no-ops
 * (never a fabricated attach).
 */
function applySelfAttach(state, atom, ctx) {
  // NAZAHN-ATTACH (CAP7): attachFrom:"triggering" attaches the TRIGGERING equipment (the one whose entry
  // fired the watcher — ctx.triggeringPermanentId) instead of the source; Hammer of Nazahn stays on the
  // battlefield and moves OTHER entering Equipment onto the chosen creature. An absent referent (the
  // equipment left before resolution) is a clean no-op via the guard, never a fabricated attach.
  const equipId = atom.attachFrom === "triggering" ? ctx.triggeringPermanentId : ctx.sourceId;
  if (!equipId) return state;
  let next = state;
  for (const t of ctx.targets || []) {
    if (!t?.id) continue;
    next = attachPermanent(next, { equipId, targetId: t.id });
    next = logEvent(next, { kind: "spell-effect", effect: "equip-attach", equipId, targetId: t.id, controller: ctx.controller });
  }
  return next;
}

/**
 * EQUIP-AUTO-ATTACH (WAVE 4) — the REVERSE of self-attach: the SOURCE is a CREATURE (Captain America's
 * "Catch" trigger, Cloud, Sokka) and the chosen TARGET is an Equipment the controller controls, attached
 * ONTO the source via the shared `attachPermanent` helper (equipId = the chosen equipment, targetId = the
 * source creature ctx.sourceId). The same mechanism Equip / self-attach use, so the equipped-creature
 * static bonus lights up immediately. The atom is OPTIONAL ("up to one target Equipment") — buildTriggerStack
 * enumerates the controller's equipment, and with NONE on the board the targeted trigger is removed from the
 * stack (CR 603.3c), a clean no-op (never a fabricated attach). No source / target gone → attachPermanent
 * no-ops.
 */
function applyAttachToSelf(state, atom, ctx) {
  if (!ctx.sourceId) return state;
  let next = state;
  for (const t of ctx.targets || []) {
    if (!t?.id) continue;
    next = attachPermanent(next, { equipId: t.id, targetId: ctx.sourceId });
    next = logEvent(next, { kind: "spell-effect", effect: "equip-attach", equipId: t.id, targetId: ctx.sourceId, controller: ctx.controller });
  }
  return next;
}

/**
 * ATTACH-PAIR (SHELF CAP16, CR 701.3a — Codsworth, Handy Helper: "{T}: Attach target Aura or Equipment you
 * control to target creature you control."). The TWO-CHOSEN-TARGET attach, and the third member of the
 * attach family: `self-attach` moves the SOURCE onto a chosen host, `attach-to-self` moves a chosen
 * attachment onto the SOURCE, and this moves a chosen attachment onto a chosen host — the source is not
 * either end.
 *
 * Targets are ROLE-TAGGED (`attachment` / `host`), the same mechanism fightPairRefs uses for its pair, with
 * a positional fallback for an untagged list. Roles matter more here than for a fight: the two ends are
 * DIFFERENT KINDS of object, so a positional mix-up would try to attach a creature to an Aura.
 *
 * A DEPARTED TARGET (CR 608.2b — either end may have left since activation) is a clean no-op, and that is
 * owned by attachPermanent, NOT re-checked here: it bails when either permanent is missing. An earlier draft
 * duplicated the check and its mutation survived, which is the tell — two guards for one invariant is the
 * drift hazard this codebase already documents for the duplicated control-move.
 *
 * The `next === state` short-circuit below is about the LOG, not the board: without it a no-op would still
 * write an "attach-pair" event, i.e. the decision log would claim an attach that never happened. Pinned by
 * test, because a mutation that only changes the log is invisible to every board-shaped assertion.
 *
 * attachPermanent also detaches from any PREVIOUS host, which is the printed behaviour and the whole point
 * of the card — moving an Equipment that is already attached elsewhere is what this ability is for.
 */
/**
 * ATTACH-SOURCE-TO-TRIGGERING (Shielded by Faith / Brilliant Wings, 2026-09-05) — move the SOURCE Aura onto the creature
 * whose entering fired the trigger. Read at resolution (CR 608.2): the source must still be on the battlefield, the
 * creature too (and be a creature right now — CR 613), and the creature must satisfy the Aura's OWN Enchant line
 * (auraMayEnchantCreature below — CR 303.4: an "Enchant creature you control" Aura never lands on an opponent's creature
 * even when its any-creature trigger fired on it). A departed source or newcomer is a clean no-op (CR 608.2b). Logged.
 */
function applyAttachSourceToTriggering(state, atom, ctx) {
  const src = ctx.sourceId ? findPermanent(state, ctx.sourceId) : null;
  const tgt = ctx.triggeringPermanentId ? findPermanent(state, ctx.triggeringPermanentId) : null;
  if (!src || !tgt || src.permanent.id === tgt.permanent.id) return state;
  if (!permanentIsCreature(state, tgt.permanent.id)) return state;
  if (!auraMayEnchantCreature(state, src.permanent.card, tgt, ctx.controller)) return state;
  const next = attachPermanent(state, { equipId: src.permanent.id, targetId: tgt.permanent.id });
  return logEvent(next, { kind: "spell-effect", effect: "aura-attach-to-triggering", auraId: src.permanent.id, targetId: tgt.permanent.id, controller: ctx.controller });
}

/**
 * Can this Aura legally be attached to this CREATURE right now? Its own Enchant line decides — an Aura can't be attached to
 * an object it couldn't enchant, and an effect that tries leaves it where it is (CR 303.4a / 701.3a-b). The creature subjects
 * and their restrictions go through the shared satisfier; the unions that include creatures admit any creature; "permanent"
 * admits anything; "artifact", "land" and "nonland permanent" read the host's types RIGHT NOW (layer-aware — Codsworth is an
 * artifact creature, Dryad Arbor a land one). Every other Enchant line — a player (a Curse), a basic land type, a restriction
 * the engine can't read — refuses: a safe miss, never a guessed attach. One reader for every resolver that moves an Aura onto
 * a creature (attach-source-to-triggering, attach-pair — stage ③ · 34).
 */
const CREATURE_UNION_HOSTS = new Set(["creatureOrArtifact", "creatureOrVehicle", "creatureOrPlaneswalker", "artifactCreatureOrPlaneswalker"]);
function auraMayEnchantCreature(state, auraCard, host, controller) {
  const subject = auraEnchantSubject(auraCard);
  if (subject === "permanent") return true;
  const { types } = permanentTypes(state, host.permanent.id);
  if (subject === "land") return types.includes("Land");
  const spec = auraEnchantHostSpec(auraCard);
  if (!spec) return false;
  if (spec.targetType === "creature") {
    return !(spec.restrictions || []).length || creatureSatisfiesRestrictions(state, host.permanent, host.controller, controller, spec.restrictions);
  }
  if (CREATURE_UNION_HOSTS.has(spec.targetType)) return true;
  if (spec.targetType === "artifact") return types.includes("Artifact");
  if (spec.targetType === "nonlandPermanent") return !types.includes("Land");
  return false;
}

function applyAttachPair(state, atom, ctx) {
  const ts = ctx.targets || [];
  let attachT = ts.find((t) => t?.role === "attachment");
  let hostT = ts.find((t) => t?.role === "host");
  if (!attachT && !hostT) { attachT = ts[0]; hostT = ts[1]; }   // untagged → positional (attachment, then host)
  if (!attachT?.id || !hostT?.id || attachT.id === hostT.id) return state;
  // CR 301.5c — an Equipment that is a creature RIGHT NOW and has no reconfigure (a crewed Rover Blades) can't equip a creature,
  // so the attach does nothing and it stays where it is (CR 701.3b). Stage ③ · 33, with the Equipment-only form below.
  if (equipmentBarredAsCreature(state, attachT.id)) return state;
  // An AURA moves only onto a creature its own Enchant line admits (Codsworth: a Wild Growth never leaves its land for a Bear).
  // A departed host is still attachPermanent's no-op, below.
  const host = findPermanent(state, hostT.id);
  if (host && permanentTypes(state, attachT.id).subtypes.includes("Aura")
      && !auraMayEnchantCreature(state, findPermanent(state, attachT.id)?.permanent?.card, host, ctx.controller)) return state;
  const next = attachPermanent(state, { equipId: attachT.id, targetId: hostT.id });
  if (next === state) return state;                              // nothing moved → don't log an attach
  return logEvent(next, { kind: "spell-effect", effect: "attach-pair", equipId: attachT.id, targetId: hostT.id, controller: ctx.controller });
}

/**
 * Equip-attach clause parsers (migrated from parseExtendedAtom, seam batch 9 / Wave A4):
 *   - self-attach: "attach it to target creature you control" — an Equipment's ETB auto-attach ("it" = the
 *     source Equipment via ctx.sourceId; host enumerated controller:you).
 *   - attach-to-self: "attach up to one target equipment you control to <self>" — a creature attaching a
 *     chosen Equipment onto itself. The destination guard accepts only a self-pronoun (it/him/her/them) OR a
 *     bare proper-name (no target/creature/control/rebel/ally/attacking/that/each/another/other/up-to word);
 *     a NON-self destination DECLINES → returns null so the clause continues to later parsers (preserves the
 *     inline fall-through). optionalTarget — an empty board is a clean no-op.
 * Pure (no parser.js import — cycle-safe); normalizes the clause exactly as parseExtendedAtom does.
 */
export function attachClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  if (/^attach it to target creature you control$/.test(t)) {
    return { op: "self-attach", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }] };
  }
  // NAZAHN-ATTACH sentinel (CAP7): produced ONLY by detectTriggers' equipment-enters rewrite ("attach
  // that equipment …" — zero printed oracle text carries this phrase), so a spell anaphor never reaches
  // it. Same atom, attachFrom:"triggering" — the applier reads ctx.triggeringPermanentId.
  if (/^attach the triggering equipment to target creature you control$/.test(t)) {
    return { op: "self-attach", attachFrom: "triggering", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }] };
  }
  // LEGENDARY variant (Mithril Coat, Mjölnir, Storm Hammer): "attach it to target LEGENDARY creature you control".
  // Same self-attach atom + a supertype:legendary target restriction (creatureSatisfiesRestrictions enforces it,
  // so the trigger enumerates ONLY the controller's legendary creatures — a non-legendary board → clean no-op).
  if (/^attach it to target legendary creature you control$/.test(t)) {
    return { op: "self-attach", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }, { kind: "supertype", value: "legendary" }] };
  }
  // ATTACH-PAIR (SHELF CAP16 — Codsworth, Handy Helper): "attach target Aura or Equipment you control to
  // target creature you control". The third attach shape, and the only one where NEITHER end is the source:
  // self-attach moves the source onto a chosen host, attach-to-self moves a chosen attachment onto the
  // source, this moves a chosen attachment onto a chosen host.
  //
  // Two role-tagged targets on the pump-pair/fight-pair mechanism (targetType + secondaryTargetType +
  // distinct). The roles are not cosmetic here: the ends are DIFFERENT KINDS of object, so an untagged
  // positional mix-up would try to attach a creature to an Aura.
  //
  // Anchored whole ($) — a count ("attach two target …"), an "up to", or an unqualified subject fails and
  // falls through to the later parsers, keeping the all-or-nothing gate (a safe FN → Arbiter).
  // ATTACH-SOURCE-TO-TRIGGERING (SHELF-85 · Light-Paws L4 Shielded by Faith "Whenever a creature enters, you may attach this
  // Aura to that creature"; Brilliant Wings behind "you may pay {1}", 2026-09-05): the FOURTH member of the attach family —
  // the SOURCE Aura moves onto the TRIGGERING creature (ctx.triggeringPermanentId, threaded by the enters watcher). No
  // chosen target; the Aura's own Enchant line is honoured at the move (CR 303.4) in the resolver.
  if (t === "attach this aura to that creature") return { op: "attach-source-to-triggering", targetType: null };
  if (/^attach target aura or equipment you control to target creature you control$/.test(t)) {
    return {
      op: "attach-pair",
      targetType: "auraOrEquipmentYouControl", restrictions: [], role: "attachment",
      secondaryTargetType: "creature", secondaryRestrictions: [{ kind: "controller", who: "you" }], secondaryRole: "host",
      distinct: true,
    };
  }
  // + the EQUIPMENT-only form (the 09-06 plan's stage ③ · 33, 2026-09-30 — Brass Squire, Auriok Windwalker: "{T}: Attach
  // target Equipment you control to target creature you control."). The same atom on the narrower pool: an Aura is NOT a
  // legal attachment here (equipmentYouControl, Captain America's pool); the host slot is unchanged.
  if (/^attach target equipment you control to target creature you control$/.test(t)) {
    return {
      op: "attach-pair",
      targetType: "equipmentYouControl", restrictions: [], role: "attachment",
      secondaryTargetType: "creature", secondaryRestrictions: [{ kind: "controller", who: "you" }], secondaryRole: "host",
      distinct: true,
    };
  }
  const ats = t.match(/^attach up to one target equipment you control to (.+)$/);
  if (ats) {
    const dest = ats[1].trim();
    const SELF_PRONOUN = /^(it|him|her|them)$/.test(dest);
    const NON_SELF = /\b(target|creature|control|rebel|ally|allies|attacking|that|each|another|other|up to)\b/.test(dest);
    if (SELF_PRONOUN || !NON_SELF) {
      return { op: "attach-to-self", targetType: "equipmentYouControl", optionalTarget: true };
    }
  }
  return null;
}

/**
 * DMG-SCALE clause parser (WALT-DMG-SCALE) — migrated from parser.js parseExtendedAtom (seam batch 15 / Wave C).
 * "<source> deals damage to <target> equal to the number of <count source>" — the damage AMOUNT is a board
 * count resolved at resolution (`amountCount`), not a printed number (Massive Raid, Spitting Earth, Outnumber,
 * Feedback Bolt). Reuses the deal-damage atom + targeting verbatim; only the amount is new. TIGHT target
 * ALLOWLIST (the bare, fully-modeled forms) so a restricted target never mis-resolves to the unrestricted set;
 * an unmodeled count source (parseCountSource → null) drops the whole clause → low → Arbiter. The standard
 * printed "N damage" form is NOT here — it stays on the legacyToAtom path. "twice the number of" / "in excess
 * of" don't match the anchor (deliberate deferral — never a half-scaled native). Pure; uses the parseCountSource
 * leaf. Registered via registerClauseParser in parser.js.
 */
export function dealDamageScaledClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  const TT = {
    "any target": "any", "target creature": "creature", "target player": "player",
    // "any OTHER target" (Red Hulk's reflexive) — the any union minus the SOURCE itself (CR 109.5 "other"):
    // rides the same "any" enumeration; the excludeSource flag (stamped in build() off this phrase) drops
    // ctx.sourceId from the creature pool — the Support-N exclusion addCreatures already honors.
    "any other target": "any",
    "target player or planeswalker": "playerOrPlaneswalker",
    "target creature or planeswalker": "creatureOrPlaneswalker", "each opponent": "eachOpponent",
    // MASS-SCALE (BLITZ FE-1 — Gates Ablaze "deals X damage to each creature, where X is the number of Gates you
    // control"): the bare "each creature" board sweep, scaled by a controller board count. NON-targeted (a mass
    // set), so the count must be controller-scoped — a who:"target"/"defendingPlayer" count is rejected by the
    // build() guards below (neither referent exists on a non-targeted mass wipe), so it can never mis-scope.
    "each creature": "eachCreature",
    // DEFENDING-PLAYER (attacks trigger, CR 509.1a) — "it deals damage to DEFENDING PLAYER equal to the number
    // of artifacts they control" (Generous Plunderer). NOT a chosen target: the defender is the player this
    // attacker is attacking (ctx.defenderId, set by checkAttackTriggers). The deal-damage resolver synthesizes
    // the player target from ctx.defenderId; the who:"defendingPlayer" pin (below) restricts this to an attacks
    // event via combatDamageReferentSatisfied (on any other event ctx.defenderId is unset → the clause would
    // silently drop, a FORBIDDEN FP — so it stays on the Arbiter, a SAFE FN).
    "defending player": "defendingPlayer",
    // DAMAGED-PLAYER (combat-damage trigger, CR 603.2) — "this Equipment deals damage to THAT PLAYER equal
    // to the number of cards in their hand" (Sword of War and Peace). NOT a chosen target: "that player" is
    // the player just dealt combat damage, ctx.damagedPlayerId (set by checkCombatDamageTriggers). The
    // resolver synthesizes the player target; the who:"damagedPlayer" pin restricts this to a combat-damage
    // event via combatDamageReferentSatisfied (elsewhere ctx.damagedPlayerId is unset -> the clause would
    // silently drop, a FORBIDDEN FP -> it stays on the Arbiter, a SAFE FN).
    "that player": "damagedPlayer",
  };
  const build = (targetPhrase, countPhrase) => {
    const targetType = TT[String(targetPhrase).trim()];
    // allowScopes admits the "they control" (defending-player) count on top of allowTarget's "that player's hand".
    const amountCount = parseCountSource(countPhrase, { allowTarget: true, allowScopes: true });
    if (!targetType || !amountCount) return null;
    // a "that player's hand" count is only meaningful against a targeted player (CR — "that player")
    if (amountCount.who === "target" && targetType !== "player" && targetType !== "playerOrPlaneswalker" && targetType !== "damagedPlayer") return null;
    // "they control" (who:"defendingPlayer") is only meaningful when the damage is aimed at the defending player
    // (the clause's own "deals damage to defending player … they control"), never at a chosen creature/player.
    if (amountCount.who === "defendingPlayer" && targetType !== "defendingPlayer") return null;
    // Pin who:"defendingPlayer" on the atom so combatDamageReferentSatisfied (triggerRouting.js + coverage's
    // spell guard) keeps this native ONLY off an attacks trigger — the referent gate the DESTROY-defendingPlayer
    // path already relies on. A defendingPlayer TARGET always also needs the pin (the target itself is ctx.defenderId).
    const atom = { op: "deal-damage", targetType, amountCount };
    if (String(targetPhrase).trim() === "any other target") atom.excludeSource = true; // CR 109.5 "other"
    if (targetType === "defendingPlayer" || amountCount.who === "defendingPlayer") atom.who = "defendingPlayer";
    if (targetType === "damagedPlayer") atom.who = "damagedPlayer"; // referent gate: combat-damage events only
    return atom;
  };
  // ===== SOURCE-STAT (DYNAMIC-COUNT keystone) ===== "<source> deals damage equal to the triggering creature's
  // power to <target>" — the AMOUNT is the TRIGGERING (entering) creature's layer-aware power at resolution
  // (Terror of the Peaks: "Whenever another creature you control enters, this creature deals damage equal to
  // that creature's power to any target"). "the triggering creature's power" is the SENTINEL detectTriggers
  // rewrites "that creature's power" to (gated to the ETB entering-creature scopes — see triggers.js), so a
  // SPELL's anaphoric "that creature's power" (Grab the Reins / Rakdos Joins Up — a sacrificed-creature fling,
  // a DIFFERENT referent) never reaches this matcher and stays low → Arbiter (CREED — sentinel gate). Reuses the
  // deal-damage atom + the TIGHT target allowlist verbatim; only the amount source is new (amountCount → the
  // shared countForSpec triggeringPower kind, read off ctx.triggeringPermanentId). who:"target" cards never use
  // this form (the count is a creature's power, not a player's hand), so no who-vs-targetType guard is needed.
  const sst = t.match(/^.+? deals? damage equal to the triggering creature's (power|toughness) to (target creature|any target|target player|target player or planeswalker|target creature or planeswalker|each opponent)$/);
  if (sst) {
    const targetType = TT[sst[2]];
    return targetType ? { op: "deal-damage", targetType, amountCount: { kind: sst[1] === "power" ? "triggeringPower" : "triggeringToughness", per: 1 } } : null;
  }
  // SACRIFICED REFERENT (CR 608.2h + 603.6e LKI) — the exact sibling of the triggering-creature arm above,
  // for the permanent sacrificed to pay this spell's ADDITIONAL COST: "Fling deals damage equal to the
  // sacrificed creature's power to any target" (Fling #1462, Thud, Airdrop Condor, Bloodshot Cyclops).
  // Same deal-damage atom and the same TIGHT target allowlist verbatim — only the amount SOURCE differs, and
  // it resolves through the shared countForSpec sacrificedPower/Toughness kinds, read off the stamp
  // actionDispatcher writes at cost-payment time (the permanent is gone by resolution, so it cannot be read
  // from the board here). An unstamped cast resolves the count to 0 — a clean no-op, never a fabricated amount.
  const sacS = t.match(/^.+? deals? damage equal to the sacrificed (?:creature|permanent|artifact)'s (power|toughness) to (target creature|any target|target player|target player or planeswalker|target creature or planeswalker|each opponent)$/);
  if (sacS) {
    const targetType = TT[sacS[2]];
    return targetType ? { op: "deal-damage", targetType, amountCount: { kind: sacS[1] === "power" ? "sacrificedPower" : "sacrificedToughness", per: 1 } } : null;
  }
  // OLD word order: "<source> deals damage TO <target> equal to the number of <count>" (Massive Raid, Spitting Earth).
  // PER-OPPONENT DRAWN-THIS-TURN damage (Molten Psyche, 2026-09-05 — SHELF-85 Phase 3, Nekusar): "deals damage to each
  // opponent equal to the number of cards THAT PLAYER has drawn this turn" — the amount is read PER opponent at
  // resolution (CR 608.2h), off each seat's own cardsDrawnThisTurn stamp; the resolver threads it as amountPerOpponent.
  // Sits BEFORE the generic `mds` arm, which would otherwise claim the sentence and return null (parseCountSource has
  // no per-player drawn count) — a null from a registered parser ends the clause's parse, it does not fall through.
  // The prefix is COMMA-FREE on purpose: a lazy `.+?` would swallow an unpeeled "If you control …, " condition and
  // hand back an UNCONDITIONAL damage atom (a FORBIDDEN false positive); the source-name reference never has a comma.
  const mdo = t.match(/^[^,]+? deals? damage to each opponent equal to the number of cards that player has drawn this turn$/);
  if (mdo) return { op: "deal-damage", targetType: "eachOpponent", amountPerOpponent: "cardsDrawnThisTurn" };
  const mds = t.match(/^.+? deals? damage to (.+?) equal to the number of (.+)$/);
  if (mds) return build(mds[1], mds[2]);
  // DMG-SCALE-2 — MODERN word order: "<source> deals damage equal to the number of <count> TO <target>"
  // (Cabaretti Charm, Coordinated Maneuver, Bumi Bash modes). The count is non-greedy so the FIRST " to
  // <allowlisted target>" wins; a multi-count ("…plus the number of Equipment…", Slash of Light) or an
  // unmodeled count → parseCountSource null → low → Arbiter. Emits the SAME amountCount atom (resolver shared).
  // ("any other target" joined the alternation 2026-08-14 — Red Hulk's reflexive; build() stamps
  // excludeSource off the phrase, the TT entry maps it onto the same "any" enumeration.)
  // SHELF-85 S10 (2026-09-04 — Surgehacker Mech "it deals damage equal to TWICE the number of Vehicles you control to
  // target creature or planeswalker an opponent controls"): a multiplier on the count (amountCount.per = 2, the same
  // scaled read the for-each arms use) and the OPPONENT-scoped creature-or-planeswalker target (the controller
  // restriction the enumerator already honors on both halves). Placed before the modern-order arm so its wider
  // target phrase is read here; the bare "the number of" form without the scope still falls through unchanged.
  const mdsX = t.match(/^.+? deals? damage equal to (twice )?the number of (.+?) to (target creature or planeswalker|target creature) an opponent controls$/);
  if (mdsX) {
    const amountCount = parseCountSource(mdsX[2], { allowTarget: false, allowScopes: false });
    if (!amountCount || amountCount.who) return null;
    return { op: "deal-damage", targetType: mdsX[3] === "target creature" ? "creature" : "creatureOrPlaneswalker", restrictions: [{ kind: "controller", who: "opponent" }], amountCount: { ...amountCount, per: mdsX[1] ? 2 : 1 } };
  }
  const mds2 = t.match(/^.+? deals? damage equal to the number of (.+?) to (target creature|any target|any other target|target player|target player or planeswalker|target creature or planeswalker|each opponent)$/);
  if (mds2) return build(mds2[2], mds2[1]);
  // TOTAL-MV damage (Summon: Bahamut's Mega Flare, 2026-08-14 — CR 202.3): "deals damage equal to the
  // TOTAL MANA VALUE of [other ]permanents you control to each opponent". Not a "number of" count, so
  // the mds arms can't reach it; the amount rides countForSpec's totalMvPermanentsYouControl reader.
  const mvs = t.match(/^.+? deals? damage equal to the total mana value of (other )?permanents you control to (each opponent)$/);
  if (mvs) return { op: "deal-damage", targetType: "eachOpponent", amountCount: { kind: "totalMvPermanentsYouControl", ...(mvs[1] ? { excludeSource: true } : {}) } };
  // DYING-CREATURE POWER damage (CORPUS ④-B, 2026-09-03 — CR 603.6e LKI): "it deals damage equal to the dying
  // creature's power to each opponent / any target" — the sentinel detectTriggers rewrites a self-dies trigger's
  // "its power" to. countContext (NOT amountCount): the creature has LEFT, so its power exists only as the number
  // the death look-back captured (ctx.dyingPower — the same key the lifegain / rad / token dies-payoffs read, and
  // pinned to the dies event by triggerRouting). "any target" enumerates a chosen target exactly as a fixed-amount
  // deal; "each opponent" needs none.
  const dyd = t.match(/^(?:it|this creature) deals damage equal to the dying creature's power to (each opponent|any target)$/);
  if (dyd) return { op: "deal-damage", countContext: "dyingPower", targetType: dyd[1] === "each opponent" ? "eachOpponent" : "any" };
  // SOURCE-POWER damage to a chosen creature (④-AU, 2026-09-04 — the Laccolith cycle: "Whenever this creature becomes
  // blocked, you may have it deal damage equal to its power to target creature. If you do, this creature assigns no
  // combat damage this turn."). "its power" is the LIVE, layer-aware power of the ability's own permanent at resolution
  // (ctx.sourceId — the same sourcePower reader the scaled counter arms use, CR 608.2h); a becomes-blocked trigger
  // resolves with its creature still on the battlefield, so the read is honest. The "If you do" rider is FOLDED onto the
  // same atom (splitClauses keeps the pair whole): taking the optional damage stamps the source's noCombatDamageTurn,
  // which combatResolution's dealsThisStep gate honors for the rest of the turn (the creature assigns no combat damage;
  // it still receives it — CR 510.1). Declining the "may" skips the whole atom, so the rider never fires alone.
  // "any target" joined in ④-AW (2026-09-04) for the sacrifice-as-cost Fling bodies (Skarrgan Skybreaker, Ghitu
  // Fire-Eater "{1}, Sacrifice this creature: It deals damage equal to its power to any target"): the source is GONE by
  // resolution, and the sourcePower reader now answers from the dispatcher's pre-sacrifice look-back stamp
  // (sacrificedSelfLki.power, id-keyed — CR 608.2h). Before that stamp existed the arm was anchored to `target creature`
  // and the activated lane refused a sourcePower amount under a sacrifice-self cost; both guards are retired together.
  // The Laccolith rider stays a `target creature`-only shape (no printed "any target" form carries it).
  const spd = t.match(/^(?:it|this creature) deals damage equal to its power to (target creature|any target)(\. if you do, this creature assigns no combat damage this turn)?$/);
  if (spd && !(spd[2] && spd[1] === "any target")) {
    return { op: "deal-damage", targetType: spd[1] === "any target" ? "any" : "creature", amountCount: { kind: "sourcePower" }, ...(spd[2] ? { sourceAssignsNoCombatDamage: true } : {}) };
  }
  // DMG-SCALE-3 — "where X is" word order: "<source> deals X damage to <target>, where X is [equal to] the
  // number of <count>" (Scourge of Valkas / Dragon Tempest "…to any target, where X is the number of Dragons
  // you control"; Tribal Flames, Profane Prayers, Sparksmith, Gempalm Incinerator, Tendrils of Corruption).
  // The literal "X damage" (not a printed "N damage") is the anchor that keeps the fixed-N form on the
  // legacyToAtom path; the TARGET is the TIGHT allowlist (so a restricted target never widens), and the count
  // routes through the SAME parseCountSource → an unmodeled source ("colors of mana spent", "permanents with
  // oil counters") → null → low → Arbiter (CREED FN-safe). Emits the SAME amountCount atom (resolver shared).
  // allowTarget stays OFF here: every "where X is" card scales by a board/graveyard count, never "that player's
  // hand" (which only appears in the legacy "deals damage to target player equal to…" word order), so a "that
  // player's hand" referent has no anaphoric player on this form and must route to the Arbiter — not silently 0.
  const mds3 = t.match(/^.+? deals? x damage to (target creature|any target|target player|target player or planeswalker|target creature or planeswalker|each opponent|each creature),? where x is (?:equal to )?the number of (.+)$/);
  if (mds3) {
    const targetType = TT[mds3[1]];
    const amountCount = parseCountSource(mds3[2]);
    return targetType && amountCount ? { op: "deal-damage", targetType, amountCount } : null;
  }
  return null;
}

/**
 * COUNTER clause parser (CR 701.6a) — co-extracted from parseExtendedAtom (seam batch 28 / Wave C, RIDER-FOLDING).
 * The full counter-target-spell family, original first-match order:
 *   bare hard counters: "counter target spell" (any) / noncreature / creature / "enchantment, instant, or
 *     sorcery" (Swan Song) / "artifact, creature, or planeswalker" (Strix Serenade lead)
 *   CNT-MV-EXACT: "counter target spell with mana value N" (Mental Misstep / Spell Snare) — exactMv
 *   SOFT-CNT: "counter target [noncreature|creature] spell unless its controller pays {N}" — unlessPay (fixed)
 *   SOFT-CNT-X: "… pays {X}" — unlessPayX + countX (the counterspell's own X, bound at resolution)
 * All anchored to `$`; a tax/modal/rider/2-way-subset variant fails → low → Arbiter (never a confidently-wrong
 * partial counter). **Rider-folding:** matchCounterControllerRider + matchCounterExileInstead in parser.js resolve
 * their rider-stripped lead via `parseExtendedAtom() || counterClauseParser` (the rider regex only matches a HARD
 * counter lead), so Strix Serenade / Swan Song / An Offer / Deny Existence keep folding. Pure (no helper).
 * Registered via registerClauseParser in parser.js.
 */
export function counterClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  // COUNTER-THAT-SPELL (SG-13, 2026-09-03 — Vexing Bauble's cast trigger "…, counter that spell."): the
  // referent is the CAST spell the trigger fired on (ctx.castStackObjectId), never a chosen target. The
  // phrase matched here is the trigger SPLITTER's rewrite ("counter the cast spell" — printed on no card),
  // produced only for a cast-event condition; a spell's own "counter that spell (instead)" never reaches it
  // (Stubborn Denial's ferocious rider keeps its whole-sentence parse — pinned by that card's test).
  if (t === "counter the cast spell") return { op: "counter-cast-spell", targetType: null };
  // COUNTER-THE-TARGETING-OBJECT (stage ③, 2026-09-30 — the Glasskites' "…becomes the target of a spell or ability for
  // the first time each turn, counter that spell or ability."): the referent is the stack object whose target choice
  // fired the SELF becomes-target trigger (ctx.targetingStackObjectId), never a chosen target. The phrase is the trigger
  // SPLITTER's rewrite ("counter the targeting spell or ability" — printed on no card), made only for that exact sentence.
  if (t === "counter the targeting spell or ability") return { op: "counter-targeting-object", targetType: null };
  // STIFLE-CLASS (CR 701.6a) — countering an ABILITY on the stack, not a spell (Stifle, Trickbind, Bind,
  // Sublime Epiphany #1709). A separate op because the counter applier is spell-shaped throughout: it looks
  // up `o.kind === "spell"`, re-checks a spellFilter against a CARD, and routes the countered object to a
  // graveyard. An ability is none of those — it has no card and simply ceases to exist (CR 701.6a).
  //
  // Mana abilities are unreachable by construction (CR 605.3a — they never use the stack), which is the
  // printed reminder text on Stifle rather than a limitation of this slice.
  //
  // The three-way union that also includes SPELLS ("counter target activated ability, triggered ability, or
  // legendary spell" — Tale's End) is NOT admitted: it needs one atom to span two target classes. Stays low.
  if (/^counter target activated or triggered ability$/.test(t)) return { op: "counter-ability", targetType: "stackAbility", abilityKinds: ["activated-ability", "triggered-ability"] };
  // (parseSpellTargetsFilter is defined below this parser; hoisted function declarations make the forward
  // reference in the CNT-TARGETS-WHAT arm safe.)
  if (/^counter target activated ability$/.test(t)) return { op: "counter-ability", targetType: "stackAbility", abilityKinds: ["activated-ability"] };
  if (/^counter target triggered ability$/.test(t)) return { op: "counter-ability", targetType: "stackAbility", abilityKinds: ["triggered-ability"] };
  // ⭐ RETARGET (CR 115.7) — "[you may] choose new targets for target spell or ability" (Deflecting Swat;
  // Bolt Bend / Ricochet Trap word it the same after their cost lines peel). The target is the full stack
  // union (spell OR activated/triggered ability — targetType "spellOrStackAbility"); the RESOLVER re-picks
  // the targeted object's own targets off the live board. `optional` records the printed "may": CR 115.7d —
  // the player may leave any number of targets unchanged, which is the resolver's decline path.
  if (/^(?:you may )?choose new targets for target spell or ability$/.test(t)) return { op: "retarget", targetType: "spellOrStackAbility", optional: true };
  // RIVAZ RIDER (2026-08-15) — the cast-trigger payoff 'it gains "When this creature dies, exile it."'
  // where "it" is the CAST SPELL (the trigger's castStackObjectId, threaded by checkCastTriggers). The
  // resolver stamps the spell's stack payload; PERMANENT_ETB carries the stamp onto the permanent, and the
  // dies path exiles the card after death processing. Exact printed sentence only.
  // (`\.\s*"` — the trigger-line splitter re-joins the quoted sentence with a space before the closing
  // quote; both the clean and the re-joined form are the same printed text.)
  if (/^it gains "when this creature dies, exile it\.\s*"$/.test(t)) return { op: "grant-dies-exile-to-cast-spell", targetType: null };
  // ⭐⭐ CNT-TARGETS-WHAT (CR 601.2c) — "counter target spell THAT TARGETS <X>": Turn Aside, Keep Safe,
  // Rebuff the Wicked, Intervene, Confound, Hindering Light, Dawn Charm, Hydromorph Gull/Guardian, Fugitive
  // Droid, Vigilant Martyr, Mistfolk. FOURTEEN carriers across nine wordings, and ONE missing capability
  // behind all of them: every counter filter this file knows reads the target SPELL'S OWN characteristics
  // (type, mana value, color) — none could ask what that spell is POINTING AT.
  // ⭐ GATE 20 SATISFIED SEVERAL TIMES OVER: the filters differ (a creature / a permanent you control / an
  // enchantment / you / a player), the card types differ (instants AND sacrifice-activated creatures), and
  // every one of them falls out of this same absent predicate.
  // ⛔ THE HALVES ARE AN **OR**, because "targets you or a permanent you control" (Hindering Light) is one
  // filter with two acceptable answers — a spell pointing at EITHER is a legal target. Modelling it as an
  // AND would make Hindering Light uncastable against everything it exists to stop.
  // ⓘ Enforced at ENUMERATION against the stack object's recorded `targets`, so a spell that points at
  // nothing matching is never offered — the CREED-correct place for a targeting restriction.
  {
    const tw = /^counter target spell that targets (.+)$/.exec(t);
    if (tw) {
      const f = parseSpellTargetsFilter(tw[1]);
      if (f) return { op: "counter", spellFilter: "any", targetType: "spell", targetsFilter: f };
      return null; // an unvetted filter → LOW → Arbiter (CREED: never guess what a spell must point at)
    }
    // AVOID FATE (POD-SIM THREE · KT-9, 2026-09-05): "Counter target instant or Aura spell that targets a permanent you
    // control" — the same targets-what predicate with a spell-TYPE filter in front (a new `instantOrAura` value both
    // evaluators know). A creature spell aimed at your permanent, or an instant aimed elsewhere, is never a target.
    const twTyped = /^counter target instant or aura spell that targets (.+)$/.exec(t);
    if (twTyped) {
      const f = parseSpellTargetsFilter(twTyped[1]);
      if (f) return { op: "counter", spellFilter: "instantOrAura", targetType: "spell", targetsFilter: f };
      return null;
    }
    // NOT OF THIS WORLD (POD-SIM THREE · KT-9b, 2026-09-05): "Counter target spell or ability that targets a permanent you
    // control" — the SPELL-OR-ABILITY union with the same targets-what predicate; the enumerator offers stack objects of
    // either kind whose recorded targets match, and the resolver counters a spell like `counter` and removes an ability
    // like `counter-ability`.
    const twUnion = /^counter target spell or ability that targets (.+)$/.exec(t);
    if (twUnion) {
      const f = parseSpellTargetsFilter(twUnion[1]);
      if (f) return { op: "counter-spell-or-ability", targetType: "spellOrStackAbility", targetsFilter: f };
      return null;
    }
  }
  if (/^counter target spell$/.test(t)) return { op: "counter", spellFilter: "any", targetType: "spell" };
  // MANA DRAIN (2026-08-14) — the splitClauses MANA-DRAIN FOLD delivers the two printed sentences as
  // this ONE folded clause. The rider is resolved at COUNTER RESOLUTION (applyCounter): the countered
  // spell's MV is locked there and the delayed payout is scheduled on the CR 603.7 queue with the
  // clause rewritten CONCRETE ("add {c}…"), so the fired trigger parses on the ordinary ritual-mana
  // arm with no dead "that spell" referent.
  if (/^counter target spell, at the beginning of your next main phase, add an amount of \{c\} equal to that spell's mana value$/.test(t)) {
    return { op: "counter", spellFilter: "any", targetType: "spell", delayedManaFromMv: true };
  }
  if (/^counter target noncreature spell$/.test(t)) return { op: "counter", spellFilter: "noncreature", targetType: "spell" };
  if (/^counter target creature spell$/.test(t)) return { op: "counter", spellFilter: "creature", targetType: "spell" };
  if (/^counter target enchantment, instant, or sorcery spell$/.test(t)) return { op: "counter", spellFilter: "enchantmentInstantSorcery", targetType: "spell" };
  // CNT-TYPE (CROSS-COUNTER) — single-type / 2-type-union HARD counters, no rider (Dispel "instant", Envelop /
  // Extinguish "sorcery", Artifact Blast "artifact", Annul "artifact or enchantment", Nullify "creature or
  // Aura"). spellFilter applied at enumeration (spellMatchesCounterFilter) + resolution (counterFilterMatches),
  // the SAME two-sided discipline as the existing creature/noncreature/3-way filters. Anchored `$` — any tail
  // (rider/mode/unless-pay) fails → low → Arbiter (FN-safe).
  if (/^counter target instant spell$/.test(t)) return { op: "counter", spellFilter: "instant", targetType: "spell" };
  // CNT-IS union HARD counter (Muddle the Mixture / Spell Stutter class) — the same instantSorcery filter
  // the Flusterstorm soft form uses, no rider.
  if (/^counter target instant or sorcery spell$/.test(t)) return { op: "counter", spellFilter: "instantSorcery", targetType: "spell" };
  if (/^counter target sorcery spell$/.test(t)) return { op: "counter", spellFilter: "sorcery", targetType: "spell" };
  if (/^counter target artifact spell$/.test(t)) return { op: "counter", spellFilter: "artifact", targetType: "spell" };
  if (/^counter target artifact or enchantment spell$/.test(t)) return { op: "counter", spellFilter: "artifactOrEnchantment", targetType: "spell" };
  if (/^counter target creature or aura spell$/.test(t)) return { op: "counter", spellFilter: "creatureOrAura", targetType: "spell" };
  const mv = /^counter target spell with mana value (\d+)$/.exec(t);
  if (mv) return { op: "counter", spellFilter: "any", targetType: "spell", exactMv: parseInt(mv[1], 10) };
  // CNT-MV-CMP (CROSS-COUNTER) — "with mana value N or greater" (Disdainful Stroke) / "or less" (Minor Misstep,
  // Thoughtbind). The INEQUALITY MV form (minMv / maxMv), re-checked at enumeration + resolution like exactMv.
  const mvCmp = /^counter target spell with mana value (\d+) or (greater|less)$/.exec(t);
  if (mvCmp) return { op: "counter", spellFilter: "any", targetType: "spell", ...(mvCmp[2] === "greater" ? { minMv: parseInt(mvCmp[1], 10) } : { maxMv: parseInt(mvCmp[1], 10) }) };
  // CNT-COLOR (CROSS-COUNTER) — "counter target <color> spell" (Gainsay), "non<color>" (Frazzle), "colorless"
  // (Ceremonious Rejection), "multicolored" (Neutralizing Blast). colorFilter checked at both sites (FAIL-CLOSED
  // on unresolvable colors). The 5 WUBRG words → their Scryfall color letters; an unlisted color word won't match.
  const COLOR_LETTER = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
  if (/^counter target colorless spell$/.test(t)) return { op: "counter", spellFilter: "any", targetType: "spell", colorFilter: { colorless: true } };
  if (/^counter target multicolored spell$/.test(t)) return { op: "counter", spellFilter: "any", targetType: "spell", colorFilter: { multicolored: true } };
  const col = /^counter target (non)?(white|blue|black|red|green) spell$/.exec(t);
  if (col) return { op: "counter", spellFilter: "any", targetType: "spell", colorFilter: { color: COLOR_LETTER[col[2]], negate: !!col[1] } };
  // TWO-FILTER counter (POD-SIM THREE · KT-2, 2026-09-05 — Guttural Response "counter target blue instant spell"): a
  // colour AND a spell type at once. Both filters are enforced independently by the enumerator (targeting.js) and the
  // resolver (spellEffects.js), so the atom simply carries both; a red instant or a blue creature spell is never a target.
  const colType = /^counter target (white|blue|black|red|green) (instant|sorcery|creature|artifact|enchantment) spell$/.exec(t);
  if (colType) return { op: "counter", spellFilter: colType[2], targetType: "spell", colorFilter: { color: COLOR_LETTER[colType[1]], negate: false } };
  if (/^counter target artifact, creature, or planeswalker spell$/.test(t)) return { op: "counter", spellFilter: "artifactCreaturePlaneswalker", targetType: "spell" };
  const sc = /^counter target (noncreature |creature |instant or sorcery )?spell unless its controller pays \{(\d+)\}$/.exec(t);
  if (sc) return { op: "counter", spellFilter: sc[1] ? (sc[1].trim() === "instant or sorcery" ? "instantSorcery" : sc[1].trim()) : "any", targetType: "spell", unlessPay: parseInt(sc[2], 10) };
  const scx = /^counter target (noncreature |creature )?spell unless its controller pays \{x\}$/.exec(t);
  if (scx) return { op: "counter", spellFilter: scx[1] ? scx[1].trim() : "any", targetType: "spell", unlessPayX: true, countX: true };
  // SOFT-CNT-COUNT — "counter target spell unless its controller pays {N} for each <count source>" (Rakshasa's
  // Disdain / Countervailing Winds / Circular Logic [GY], Override [artifacts], Oppressive Will [hand]). Reuses
  // the soft-counter pendingChoice + the shared parseCountSource/countForSpec. An unmodeled count (color-filtered
  // "blue permanent", Domain, all-battlefield, "revealed/discarded this way") → parseCountSource null → low → Arbiter.
  const scc = /^counter target (noncreature |creature )?spell unless its controller pays \{(\d+)\} for each (.+)$/.exec(t);
  if (scc) {
    const spec = parseCountSource(scc[3]);
    if (!spec) return null;
    return { op: "counter", spellFilter: scc[1] ? scc[1].trim() : "any", targetType: "spell", unlessPayCount: { per: parseInt(scc[2], 10), spec } };
  }
  return null;
}

/**
 * ⭐ CNT-TARGETS-WHAT — parse the "<X>" of "counter target spell that targets <X>" into a predicate the
 * enumerator can run against a stack spell's RECORDED targets. Returns null for anything unvetted, which
 * parks the whole clause (CREED: never guess what a spell must be pointing at).
 *
 * The shape is deliberately an OR of two optional halves, because the printed wordings are:
 *   player half     — "you" (Dawn Charm), "a player" (Mistfolk's sibling wording)
 *   permanent half  — "a permanent you control" (Turn Aside), "a creature" (Intervene), "a creature you
 *                     control" (Hydromorph Gull), "an enchantment" (Vigilant Martyr), "an artifact or
 *                     creature you control" (Fugitive Droid)
 *   and both at once — "you or a permanent you control" (Hindering Light)
 *
 * ⛔ `youControl` is carried on the PERMANENT half only. "targets a creature" (Intervene / Confound) has no
 * controller scope at all and must stay unscoped — narrowing it to your own creatures would make Confound
 * refuse the exact spell it is printed to stop.
 *
 * ⛔ REFUSED (left null → Arbiter): "this creature" (Mistfolk — a self referent this predicate has no lane
 * for), and anything else. Every admitted wording is corpus-verified.
 */
export function parseSpellTargetsFilter(text) {
  const t = String(text || "").trim().toLowerCase().replace(/\.$/, "");
  const PERM = {
    "a permanent": { types: null, youControl: false },
    "a permanent you control": { types: null, youControl: true },
    "a creature": { types: ["creature"], youControl: false },
    "a creature you control": { types: ["creature"], youControl: true },
    "an enchantment": { types: ["enchantment"], youControl: false },
    "an enchantment you control": { types: ["enchantment"], youControl: true },
    "an artifact or creature you control": { types: ["artifact", "creature"], youControl: true },
  };
  if (t === "you") return { player: "you" };
  if (t === "a player") return { player: "any" };
  const both = /^you or (.+)$/.exec(t);
  if (both) {
    const perm = PERM[both[1]];
    return perm ? { player: "you", permanent: perm } : null;
  }
  const perm = PERM[t];
  return perm ? { permanent: perm } : null;
}

/**
 * MASS-FILTERED-DAMAGE clause parser — "<source> deals N damage to each creature <filter>" where the filter
 * is with|without flying (Gale Force / Seismic Shudder) OR you control | your opponents control (Blazing
 * Volley, Scouring Sands). Reuses the eachCreature deal-damage path + a restriction (hasKeyword / controller)
 * that creatureSatisfiesRestrictions filters the mass set with (layer-aware). Whole-clause anchored — a "and
 * each player" / kicker / flashback / threshold rider fails the `$` → low → Arbiter (FN-safe). Registered
 * via registerClauseParser in parser.js.
 */
export function massFilteredDamageClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  // SYMMETRIC SELF-DAMAGE (CR 119.3 — Rakdos Charm, EDHREC #330: "Each creature deals 1 damage to its
  // controller"). Structurally UNLIKE every other matcher in this parser: there is no single source and no
  // creature target. EACH CREATURE is its own source and the target is THAT creature's own controller, so a
  // player takes N per creature THEY control and the totals are asymmetric across the table — it is a
  // per-creature loop, not a board sweep and not a flat player burn. Modelled as its own atom rather than
  // bent onto deal-damage, whose target synthesis assumes one source.
  const scd = t.match(/^each creature deals (\d+) damage to its controller$/);
  if (scd) return { op: "each-creature-damages-controller", amount: parseInt(scd[1], 10), targetType: null };
  const m = t.match(/^.+? deals? (\d+) damage to each creature (with|without) flying$/);
  if (m) return { op: "deal-damage", amount: parseInt(m[1], 10), targetType: "eachCreature", restrictions: [{ kind: "hasKeyword", keyword: "flying", negate: m[2] === "without" }] };
  const cm = t.match(/^.+? deals? (\d+) damage to each creature (you control|your opponents control)$/);
  if (cm) return { op: "deal-damage", amount: parseInt(cm[1], 10), targetType: "eachCreature", restrictions: [{ kind: "controller", who: cm[2] === "you control" ? "you" : "opponent" }] };
  // SOURCE-EXCLUDING BOARD SWEEP (BLITZ ETB-1) — "<source> deals N damage to each OTHER creature" (Chaos Maw's /
  // Raging Swordtooth's / Crater Hellion's ETB): every creature on every battlefield EXCEPT the source itself
  // (CR 113.7 — "other" is relative to the ability's source, ctx.sourceId). Reuses the deal-damage primitive
  // with the eachOtherCreature mass targetType (registered in NON_CHOSEN_TARGET_TYPES → non-chosen, so the
  // trigger routes on confidence and applyDamageEffect's eachOtherCreature branch skips source.id). Whole-clause
  // anchored ($) — a filter/rider ("…with flying", "…and each player", "…you control") fails the anchor and
  // stays LOW → Arbiter (FN-safe; those variants are DELIBERATELY unmodeled here).
  const om = t.match(/^.+? deals? (\d+) damage to each other creature$/);
  if (om) return { op: "deal-damage", amount: parseInt(om[1], 10), targetType: "eachOtherCreature" };
  // ⭐ MASS-DAMAGE RECIPIENT DELEGATION — the general arm, placed LAST so the four exact matchers above stay
  // byte-identical (the ordering rule: a widening gated behind the prior paths' failure can't regress them).
  //
  // THE AXIS THIS CLOSES. The three filtered matchers above hand-roll `with|without flying` and
  // `you control|your opponents control` — two of the SIXTEEN restriction kinds
  // `creatureSatisfiesRestrictions` already enforces on this very sweep (typeNeg, colorNeg, subtype, tapped,
  // combat, power, toughness, manaValue, cardType, …). Single-target removal reaches all of them by
  // delegating its recipient phrase to the shared `parseCreatureTargetRestrictions` grammar; the mass arm
  // never did. So delegate here too and the vocabulary arrives whole rather than one printed phrase at a time.
  //
  // ⛔ `clean` IS THE CREED GATE. The shared parser strips the phrases it models and returns whatever is left;
  // `clean === false` means an unmodeled qualifier survived ("each creature dealt damage this turn", "each
  // creature blocking it", "each creature except for creatures you control with flying") → null → low →
  // Arbiter. A partially-modeled mass sweep would damage the WRONG creatures, which is the forbidden direction.
  //
  // ⛔ AND "OTHER" IS PEELED HERE, NOT DELEGATED. `parseCreatureTargetRestrictions` treats "other" as filler
  // and silently strips it, so handing it "each other creature you control" would come back clean with only a
  // controller restriction — and the source would then damage ITSELF (CR 113.7). The peel below reads "other"
  // off the front and picks the source-excluding scope explicitly, so the exclusion can never be lost.
  // SYMBURN-4 — "deals N damage to each opponent AND each creature[ and planeswalker] THEY CONTROL" (Goblin
  // Chainwhirler, End the Festivities, Tectonic Hazard, Wildfire Cerberus). Anchored BEFORE the general arm
  // because its recipient phrase begins "each opponent …", which the general arm would hand to the creature
  // grammar and correctly reject as residue — so without this it simply parks.
  //
  // The trailing "they control" is load-bearing, not filler: it is what scopes the creatures to the OPPONENTS'
  // boards. A form without it would be a different (symmetric) card, so it is inside the anchor.
  const opp = t.match(/^.+? deals? (\d+) damage to each opponent and each creature( and planeswalker)? they control$/);
  if (opp) {
    return { op: "deal-damage", amount: parseInt(opp[1], 10),
      targetType: opp[2] ? "eachOpponentAndTheirCreaturesPW" : "eachOpponentAndTheirCreatures" };
  }
  const gen = t.match(/^.+? deals? (\d+) damage to (each .+?)( and each (?:player|planeswalker))?$/);
  if (gen) {
    const amount = parseInt(gen[1], 10);
    // The trailing sweep selects the combined scope. Two are modeled, and they are NOT interchangeable:
    //   "and each player"       → every player INCLUDING the caster, no planeswalkers (CR — "each player")
    //   "and each planeswalker" → every planeswalker, NO players; damage becomes loyalty removal (CR 120.3c)
    // "and each opponent" is still NOT peeled — an opponents-only sweep is a third recipient set with no
    // combined targetType, so it fails the `$` anchor here → low → Arbiter (a SAFE FN).
    const tail = (gen[3] || "").trim();
    const withPlayers = tail === "and each player";
    const withWalkers = tail === "and each planeswalker";
    let half = gen[2].replace(/^each /, "");
    const isOther = /^other creature\b/.test(half);
    if (isOther) {
      // A source-excluding sweep that ALSO hits a second recipient set has no modeled scope (Conductor of
      // Cacophony) — refuse rather than invent another combined targetType.
      if (withPlayers || withWalkers) return null;
      half = half.replace(/^other /, "");
    }
    if (!/\bcreature\b/.test(half)) return null;   // a non-creature mass recipient is a different mechanism
    // Probe the recipient phrase through the SHARED grammar. The synthetic "deals 1 damage to …" carrier is
    // what that parser anchors on (its own regex expects a damage/destroy/exile clause), and the amount in the
    // carrier is irrelevant — only the recipient phrase is being classified.
    const { restrictions, clean } = parseCreatureTargetRestrictions({ oracle: `~ deals 1 damage to each ${half}` });
    if (!clean) return null;
    // A BARE creature sweep with a combined tail is NEW here (Star of Extinction's "each creature and each
    // planeswalker" has no filter at all), so the no-restrictions bail applies only to the plain scopes whose
    // bare forms the exact matchers above already own.
    if (!restrictions.length && !withWalkers) return null;
    const targetType = withWalkers ? "eachCreatureAndPlaneswalker"
      : withPlayers ? "eachCreatureAndPlayer"
        : isOther ? "eachOtherCreature" : "eachCreature";
    return { op: "deal-damage", amount, targetType, restrictions };
  }
  // TRIG-PRONOUN damage (BLITZ IE-1 — Inferno Elemental / Ornery Goblin / Ashmouth Hound: "…this creature
  // deals N damage to THAT CREATURE", the blocked/blocking pair partner). detectTriggers rewrites the
  // non-self pronoun to this sentinel (the Toxin-Sliver destroy precedent); the referent is the trigger's
  // OTHER creature (ctx.triggeringPermanentId), never a chosen target — targetType:null routes it on
  // confidence alone, and the deal-damage resolver synthesizes the single creature target from ctx.
  const tp = t.match(/^.+? deals? (\d+) damage to the triggering creature$/);
  if (tp) return { op: "deal-damage", amount: parseInt(tp[1], 10), target: "thatCreature", targetType: null };
  // SELF-DRAIN damage (BLITZ JB-1 — Juzám Djinn / Ravenous Giant / Nettletooth Djinn: "At the beginning of
  // your upkeep, this creature deals N damage to YOU."): the recipient is the CONTROLLER — a fixed referent,
  // never a chosen target (targetType:null → routes on confidence). Real DAMAGE, not life loss (replacement
  // effects / damage watchers apply through the shared per-target hitPlayer path). Whole-clause anchored.
  const sd = t.match(/^(?:this creature|this permanent|it) deals (\d+) damage to you$/);
  if (sd) return { op: "deal-damage", amount: parseInt(sd[1], 10), target: "you", targetType: null };
  // UPKEEP-PLAYER damage (BLITZ TR-2 — Copper Tablet / Barbed Wire / Sulfuric Vortex: "At the beginning of
  // each player's upkeep, this artifact deals N damage to THAT PLAYER"): the recipient is the player whose
  // upkeep it is — "the upkeep player" is the SENTINEL detectTriggers emits for the "that player" anaphor on
  // an each-player's-upkeep trigger (corpus-clean phrase; only the event-gated rewrite produces it). A fixed
  // referent read off ctx.upkeepPlayerId, never a chosen target (targetType:null → routes on confidence);
  // who:"upkeepPlayer" lets the triggerRouting referent gate pin the atom to the upkeep event — anywhere
  // else the referent is unset → no target → 0 dealt (a clean no-op). Real DAMAGE through the shared
  // per-target hitPlayer path (source threaded, so infect/doubler replacements compose). The subject set
  // adds the artifact/enchantment source nouns (Copper Tablet is an artifact; Sulfuric Vortex an enchantment).
  // "this aura" joins the subject set for the ENCHANTED-CONTROLLER'S UPKEEP event (2026-08-12 — Wanderlust,
  // Parasitic Bond, Maddening Wind print "this Aura deals N damage to that player"; the same sentinel
  // rewrite produces "the upkeep player", and that event's firing gate guarantees the referent is the
  // host's controller).
  const ud = t.match(/^(?:this creature|this permanent|this artifact|this enchantment|this aura|it) deals (\d+) damage to the upkeep player$/);
  if (ud) return { op: "deal-damage", amount: parseInt(ud[1], 10), target: "upkeepPlayer", who: "upkeepPlayer", targetType: null };
  // ⭐ CASTING-PLAYER damage (TP-1 — Eidolon of the Great Revel, Pyrostatic Pillar, Aether Sting, Spellshock,
  // Gibbering Fiend): the structural twin of the upkeep arm directly above; only the ctx key differs.
  // "the casting player" is the SENTINEL detectTriggers emits for the "that player" anaphor on a CAST
  // trigger — the phrase appears NOWHERE in printed oracle, so only that event-gated rewrite can reach this
  // matcher, and triggerRouting's referent gate additionally pins who:"castingPlayer" to the cast event.
  // Anywhere else the referent is unset → no target → 0 dealt (a clean no-op, never a guessed victim).
  const cd = t.match(/^(?:this creature|this permanent|this artifact|this enchantment|it) deals (\d+) damage to the casting player$/);
  if (cd) return { op: "deal-damage", amount: parseInt(cd[1], 10), target: "castingPlayer", who: "castingPlayer", targetType: null };
  // DRAWING-PLAYER damage (TP-3 — Fate Unraveler, Underworld Dreams, Kederekt Parasite): same sentinel
  // discipline, reading ctx.drawingPlayerId. The optional "you may have it deal …" wording reaches here
  // with the may-ness already carried by the trigger's `optional` flag, so one matcher covers both forms.
  const dd = t.match(/^(?:this creature|this permanent|this artifact|this enchantment|it) deals (\d+) damage to the drawing player$/);
  if (dd) return { op: "deal-damage", amount: parseInt(dd[1], 10), target: "drawingPlayer", who: "drawingPlayer", targetType: null };
  // ⭐ DEFENDING-PLAYER damage (DP-TAIL — Falkenrath Perforator, Simian Sling): the fourth twin of this
  // matcher, beside upkeep / casting / drawing. ⛔ NO SENTINEL: "defending player" is PRINTED oracle text
  // (CR 508.1), not an anaphor, so unlike its three neighbours there is nothing to rewrite — the phrase
  // reaches here as written. ctx.defenderId is threaded by checkAttackTriggers (attacks/attacksAlone) and
  // checkBlockTriggers (becomesBlocked); triggerRouting's DEFENDING_PLAYER_EVENTS gate keeps the atom off
  // every other event, where the referent would be unset and the clause would silently drop.
  const dfd = t.match(/^(?:this creature|this permanent|this artifact|this enchantment|this equipment|it) deals (\d+) damage to defending player$/);
  if (dfd) return { op: "deal-damage", amount: parseInt(dfd[1], 10), targetType: "defendingPlayer", who: "defendingPlayer" };
  // ⭐ THE PLAYER OR PLANESWALKER IT'S ATTACKING (the 09-06 plan's stage ③ · 25, 2026-09-30 — Hellrider "Whenever a creature you
  // control attacks, this creature deals 1 damage to the player or planeswalker it's attacking"; Scorch Spitter; Rakdos
  // Roustabout's becomes-blocked form): the defending-player twin that also reaches a PLANESWALKER — the attacker's declared
  // defender, threaded per attacker as ctx.defenderId, plus ctx.defenderPlaneswalkerId when the attack is on a planeswalker. "it"
  // is the attacking creature whatever deals the damage (Hellrider deals it; the creature attacking is the trigger's). Printed
  // oracle, no sentinel; who:"defendingPlayer" rides the same DEFENDING_PLAYER_EVENTS routing gate.
  // + "… that creature is attacking" (stage ③ · 26 — Raid Bombardment, Cavalcade of Calamity): the watcher's wording for the same
  // referent — the triggering attacker's declared defender, carried in the same per-attacker context.
  const atd = t.match(/^(?:this creature|this permanent|this artifact|this enchantment|it) deals (\d+) damage to the player or planeswalker (?:it's|that creature is) attacking$/);
  if (atd) return { op: "deal-damage", amount: parseInt(atd[1], 10), targetType: "attackedDefender", who: "defendingPlayer" };
  return null;
}

/**
 * CDMG-MASS-TO-DAMAGED-PLAYER (Balefire Dragon, CR 510 + 119) — the SYNTHETIC effect a combat-damage-to-a-player
 * trigger carries: "<source> deals that much damage to each creature that player controls." "That much" is the
 * combat-damage amount the trigger just dealt (ctx.combatDamageAmount); "that player" is the player just dealt
 * that combat damage (ctx.damagedPlayerId) — BOTH are the trigger's referents (set by triggers.checkCombat-
 * DamageTriggers as triggeringContext = {damagedPlayerId, combatDamageAmount}), NOT chosen targets. So the atom
 * is NON-targeted (targetType:null → programNeedsChosenTarget=false → it routes natively on the trigger flush)
 * and a clean no-op outside a combat-damage trigger (no ctx.damagedPlayerId / combatDamageAmount → 0 / skip,
 * never a fabricated wipe). Whole-clause anchored (^…$, the `^.+? deals?` prefix consumes the source ref "it
 * deals" / "this creature deals" / "Balefire Dragon deals" exactly like massFilteredDamageClauseParser) — any
 * trailing rider fails the `$` → low → Arbiter (CREED FN-safe). The damage is dealt by the source (the Dragon),
 * threaded as source.id so a source-scoped doubler / infect / wither applies through the shared primitive.
 */
export function cdmgMassToDamagedPlayerClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'").replace(/\.$/, "").trim();
  if (/^.+? deals? that much damage to each creature that player controls$/.test(t)) {
    return { op: "cdmg-mass-to-damaged-player", countContext: "combatDamageAmount", targetType: null };
  }
  // CDMG-TO-EACH-OTHER-OPPONENT (Super State, CR 510 + 119) — the SYNTHETIC effect an Aura's combat-damage-to-
  // an-opponent trigger carries: "it deals that much damage to each other opponent." "That much" is the combat-
  // damage amount just dealt (ctx.combatDamageAmount); "other opponent" = every opponent of the source's
  // controller EXCEPT the one just combat-damaged (ctx.damagedPlayerId) — both referents come from the trigger
  // ctx (checkCombatDamageTriggers), NOT chosen targets, so the atom is NON-targeted (routes natively on the
  // combat-damage flush) and a clean no-op outside a combat-damage trigger (no ctx referents → 0 / empty).
  // Whole-clause anchored (^…$ off the "it deals / this creature deals" source prefix); a rider fails the $ →
  // low → Arbiter (CREED FN-safe). In a 1v1 game there IS no other opponent → empty set → clean no-op (never a
  // fabricated self-hit or double-hit on the damaged player). The damage is dealt by the source (source.id).
  if (/^.+? deals? that much damage to each other opponent$/.test(t)) {
    return { op: "cdmg-to-each-other-opponent", countContext: "combatDamageAmount", targetType: null };
  }
  return null;
}

/**
 * STORM (CR 702.40) clause parser — the SYNTHETIC effect clause triggers.detectTriggers emits for the Storm
 * KEYWORD ("copy this spell for each spell cast before it this turn"). It is NOT printed oracle text — Storm's
 * real trigger lives in stripped reminder parens — so this matcher is anchored EXACTLY to the synthesized
 * sentinel and to nothing in the printed corpus (no real card says "copy this spell for each spell cast before
 * it this turn" as parseable text; the printed line is the reminder, stripped before clause parsing). Emits a
 * non-targeted `copy-spell` atom (no targetType → programNeedsChosenTarget=false → the trigger routes natively
 * via the α1 non-targeted path); the runtime count + spell snapshot ride on ctx (threaded at cast). A different
 * shape never matches → no atom → the card stays on the Arbiter (CREED FN-safe). Pure. Registered in parser.js.
 */
/**
 * ===== GRANT UNCOUNTERABILITY (Vexing Shusher) ===== "Target spell can't be countered."
 *
 * The MISSING ARM of a mechanic that is otherwise fully built. Four uncounterability paths already
 * exist and all four are STATIC or ON-CARD: the printed "this spell can't be countered" (read off the
 * stack object's own oracle), the subtype board static (Root Sliver), the controller static (Chimil),
 * and the type-filtered controller static (Prowling Serpopard). spellEffects.js named this gap in a
 * comment for as long as it has existed -- "granted / external 'can't be countered' isn't modeled" --
 * because every existing path answers "is this spell uncounterable?" by RE-DERIVING it from the board,
 * and a one-shot grant leaves nothing on the board to re-derive from. It needs a mark instead.
 *
 * CR 701.6a defines countering; a "can't be countered" effect is a continuous effect that prevents that
 * action, and has no subrule of its own (see the note in spellEffects.js). The grant lasts as long as
 * the spell is on the stack, which is exactly the lifetime of the stack object carrying the mark -- when
 * the spell resolves or leaves, the object goes with it and the mark cannot outlive its subject.
 *
 * `grantNotCounter:true` is the Double-Major precedent read a second way: an atom that TARGETS a spell
 * without trying to counter it must not have the uncounterability exclusions applied to its own target
 * enumeration. Targeting an already-uncounterable spell with this is legal (if pointless) -- CR 601.2c
 * cares only that the target is a spell -- and excluding those would be a false negative on legality.
 * A different wording never matches -> no atom -> the card stays on the Arbiter (CREED FN-safe). Pure.
 */
export function grantUncounterableClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[\u2019]/g, "'").replace(/\.$/, "").trim();
  if (t === "target spell can't be countered") {
    return { op: "make-uncounterable", targetType: "spell", spellFilter: "any", grantNotCounter: true };
  }
  return null;
}

/**
 * ===== NEXT-SPELL UNCOUNTERABLE (Mistrise Village; LANDS-TIER slice 6) ===== "The next spell you cast this
 * turn can't be countered." — a per-player, per-turn FLAG (`nextSpellUncounterable`) rather than a stack
 * mark: nothing is on the stack yet. The cast chokepoint (actionDispatcher.applyCastSpell) consumes it on the
 * player's very next cast and stamps THAT spell's stack object `uncounterable: true` — the same mark the
 * make-uncounterable grant leaves and the counter-target enumeration already honours. The untyped sentence
 * ONLY: "the next creature spell …" / "the next instant or sorcery spell …" need a type gate at the
 * chokepoint this slice does not carry, so they return null and their cards stay parked (CREED FN-safe).
 */
export function nextSpellUncounterableClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'").replace(/\.$/, "").trim();
  if (t === "the next spell you cast this turn can't be countered") {
    return { op: "next-spell-uncounterable" };
  }
  return null;
}

export function copySpellClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'").replace(/\.$/, "").trim();
  if (t === "copy this spell for each spell cast before it this turn") {
    return { op: "copy-spell", stormCopy: true };
  }
  return null;
}

/**
 * ===== COPY-A-CREATURE-SPELL (Double Major, CR 707.10 / 707.12) ===== "Copy target creature spell you control[,
 * except it isn't legendary if the spell is legendary]." The copy is a NEW object put onto the stack; a copy of a
 * PERMANENT spell "becomes a token as it resolves" (CR 707.10a) — so when it resolves it enters the battlefield as
 * a TOKEN creature that is a copy of the chosen spell. This is DISTINCT from `copy-spell` (STORM), which copies THIS
 * spell N times for each spell cast; here it's a SINGLE targeted copy of ANOTHER creature spell on the stack.
 *
 * The atom carries `targetType:"spell"` + `spellFilter:"creature"` (so the shared stack-spell enumerator offers
 * exactly the creature spells) + `spellController:"you"` (own spells only) + `copyNotCounter:true` (a copy is not a
 * counter — uncounterability never restricts a copy target). `stripLegendary` records the "except it isn't legendary"
 * rider (CR 707.12). A different shape never matches → no atom → the card stays on the Arbiter (CREED FN-safe). Pure.
 */
export function copyCreatureSpellClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'").replace(/\.$/, "").trim();
  // ===== COPY AN INSTANT OR SORCERY (CR 707.10) ===== Reverberate #1380, Narset's Reversal #740's first
  // half, the Fork family. Distinct from the creature-spell copy below: an instant/sorcery copy is NOT a
  // token — it resolves its EFFECT and then simply ceases to exist (CR 707.10a, it was never a card), so the
  // applier clones the resolving payload rather than snapshotting a copiable permanent card.
  //
  // "You may choose new targets for the copy" (CR 707.10c) is DECLINED, not modeled: declining is always a
  // legal choice, so copying with the ORIGINAL targets is a faithful SUBSET of the printed card — it can
  // only forgo an option, never play a different card. Same discipline the alt-cost recording uses. The
  // rider is therefore ACCEPTED as text (the card is fully modeled without it) rather than left as residue.
  //
  // Riders that CHANGE the copy ("except that the copy is red" — Fork) are NOT accepted: they alter the
  // copy's characteristics, which this path does not model, so those stay LOW → Arbiter (CREED FN-safe).
  const ci = t.match(/^copy target instant or sorcery spell(\. you may choose new targets for the copy)?$/);
  if (ci) {
    return {
      op: "copy-instant-or-sorcery",
      targetType: "spell",
      // The EXISTING filter name (Flusterstorm's CNT-IS), reused rather than coined: spellMatchesCounterFilter
      // falls through to `return true` — i.e. ANY spell — on an unrecognised filter string, so a near-miss
      // synonym like "instantOrSorcery" would silently let this copy a CREATURE spell. A wrong target, not a
      // missing one, and invisible in the tier. Verified against the filter table before use.
      spellFilter: "instantSorcery",
      copyNotCounter: true,   // a copy is not a counter — uncounterability never restricts a copy target
    };
  }
  // Base form + the Double Major "except it isn't legendary if the spell is legendary" rider (optional).
  const m = t.match(/^copy target creature spell you control(, except it isn't legendary if the spell is legendary)?$/);
  if (m) {
    return {
      op: "copy-creature-spell",
      targetType: "spell",
      spellFilter: "creature",
      spellController: "you",
      copyNotCounter: true,
      ...(m[1] ? { stripLegendary: true } : {}),
    };
  }
  return null;
}

/**
 * ===== SOURCE-POWER-FANOUT (Chandra's Ignition, CR 701) ===== the CHOSEN target creature (you control) deals
 * damage equal to ITS layer-aware power to each OTHER creature (every creature on every battlefield except the
 * source) AND each opponent. All the damage is dealt by the source simultaneously, so it's ONE applyDamageEffect
 * call with the fan-out target list + source:{id:sourceCreatureId} (so a source-scoped damage doubler / infect
 * / wither on the chosen creature applies through the shared primitive, identical to every other damage atom).
 * The source's power is read BEFORE the damage (CR 608.2h — locked as the effect resolves); a source that left
 * the battlefield between cast and resolution, or a non-creature target, is a clean no-op (no fabricated damage).
 * The source EXCLUDES itself from the creature set ("each OTHER creature", CR 113.7) but still hits opponents.
 */
function applySourcePowerFanout(state, atom, ctx) {
  // The chosen target creature is the damage source (a single creature you control — the parser's
  // targetType:"creature" + controller:you restriction; the cast/flush path binds exactly one).
  const chosen = (ctx.targets || []).find((t) => t.type === "creature");
  const lk = chosen?.id ? findPermanent(state, chosen.id) : null;
  // LAYER-AWARE (slice 25): an ANIMATED source still fans out its power rather than silently dealing 0.
  if (!lk || !(isCreatureCard(lk.permanent.card) || permanentIsCreature(state, chosen.id))) {
    return logEvent(state, { kind: "spell-effect", effect: "source-power-fanout", controller: ctx.controller, amount: 0 });
  }
  const sourceId = chosen.id;
  const amount = Math.max(0, creaturePower(lk.permanent, state)); // CR 608.2h — locked at resolution
  // Fan-out targets: every OTHER creature on every battlefield (exclude the source), then every opponent.
  const targets = [];
  for (const pid of Object.keys(state.players)) {
    for (const perm of (state.players[pid].battlefield || [])) {
      if (perm.id !== sourceId && isCreatureCard(perm.card)) targets.push({ type: "creature", id: perm.id });
    }
  }
  for (const opp of opponentsOf(state, ctx.controller)) {
    if (state.players[opp]) targets.push({ type: "player", id: opp });
  }
  // ONE damage event from the source (CR — dealt simultaneously). source:{id} threads the source-scoped
  // damage-replacement / infect / wither hook, exactly like every other deal-damage atom.
  return applyDamageEffect(state, { controller: ctx.controller, amount, targets, source: { id: sourceId } });
}

/**
 * ===== OPTIONAL-MANA-PAYMENT (CR 603.7c) ===== "you may pay {cost}. if you do, <effect>." — flag the
 * controller's pay-or-decline choice instead of resolving the payoff outright (the parser already validated
 * the cost is fixed mana + the payoff is a HIGH, targetless, non-modal program). The CONTROLLER (ctx.controller
 * — the player whose trigger/ability this is) is who pays + decides, so the driver's `pause = pc.controller
 * === "user"` rule pauses a human and auto-decides an AI (pay-if-able). runProgram attaches the resume +
 * suspends; resolveOptionalManaPaymentChoice settles it (PAY → payManaCost + run the payoff atoms; DECLINE →
 * nothing). The payoff atoms ride on the choice as plain JSON (serialize-safe). FIFO-guarded by the setter.
 */
/**
 * CONDITIONED PAYMENT (Springheart Nantuko) — "you may pay {1}{G} IF this permanent is attached to a creature
 * you control". The condition gates whether the payment may be made at all, not what it does.
 *
 * ⭐ THE PAUSE STILL SURFACES WHEN THE CONDITION IS FALSE, carrying `available: false` — the exact pattern
 * the reflexive-sac atom in this same file already uses ("a false-`available` pause still surfaces — the
 * player/AI must decline since you can't sacrifice what you don't have"). Skipping the pause would mean this
 * resolver had to run the ELSE atoms itself, duplicating the settler's WI-3 pause-chaining logic; routing
 * every case through the settler keeps one implementation of that.
 *
 * Only ONE condition kind is modelled, and anything else returns false — an unknown condition must never
 * read as satisfied (that would let the payment be made when the card forbids it).
 */
function optionalPaymentConditionMet(state, atom, ctx) {
  if (!atom.payCondition) return true;                  // unconditional — every pre-existing carrier
  if (atom.payCondition === "attachedToCreatureYouControl") {
    const self = ctx.sourceId ? findPermanent(state, ctx.sourceId)?.permanent : null;
    if (!self?.attachedTo) return false;
    const host = findPermanent(state, self.attachedTo);
    return !!host && host.permanent?.controller === ctx.controller && permanentIsCreature(state, self.attachedTo);
  }
  return false;                                          // unmodelled condition → never satisfied
}

function applyOptionalManaPayment(state, atom, ctx) {
  if (state.pendingChoice) return state; // FIFO — one choice at a time (belt-and-braces; setter re-guards)
  // UPKEEP-PLAYER MAY-PAY (2026-08-12 — Paralyze/Apathy): payerRef re-aims the choice (and the charge,
  // and the payoff's controller) at the player whose upkeep it is — the HOST's controller by the
  // enchanted-controller's-upkeep firing gate. Referent unset (a non-upkeep event) → NO choice at all
  // (a clean no-op, never a choice charged to the wrong seat). The Slow Motion pattern.
  let payController = ctx.controller;
  if (atom.payerRef === "upkeepPlayer") {
    if (!ctx.upkeepPlayerId || !state.players?.[ctx.upkeepPlayerId]) return state;
    payController = ctx.upkeepPlayerId;
  }
  return setPendingOptionalManaPaymentChoice(state, {
    controller: payController,
    cost: atom.cost,
    effectAtoms: atom.effectAtoms || [],
    // FALLBACK (Springheart) — run by the settler when the payment is NOT made, whether declined or
    // impossible. Absent on every other carrier, so their decline path is byte-identical (an empty branch).
    elseAtoms: atom.elseAtoms || [],
    // CONDITION — false makes the payment unpayable; the pause still surfaces so the settler runs the else.
    available: optionalPaymentConditionMet(state, atom, ctx),
    sourceName: ctx.cardName || null,
    // TARGETED PAYOFF: the target was chosen when the ability went on the stack (CR 603.3d), so it already sits
    // in ctx.targets. Carry it ACROSS the pay/decline suspend — the settler had `targets: []` hardcoded, which
    // was correct only while every admitted payoff was targetless. Empty for a targetless payoff (unchanged).
    targets: ctx.targets || [],
  });
}

// REFLEXIVE-SAC-BY-SUBTYPE — true iff `player` controls ≥1 permanent whose TYPE LINE carries `subtype`
// word-bounded (CR 205.3). The SAME match sacScopeMatches uses for the watcher side, so the "can I sacrifice
// one?" test and the "did this sac fire a Treasure watcher?" test never drift. A Food token's type line is
// "Token Artifact — Food" → matches; word-bounded so "Food" never matches a longer word.
export function controllerSacSubtypeMatch(perm, subtype) {
  const ts = String(perm?.card?.type || perm?.card?.type_line || "");
  const esc = String(subtype).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${esc}\\b`).test(ts);
}

// REFLEXIVE-SAC-BY-SUBTYPE (CR 603.7c) — "you may sacrifice a <subtype>. if you do, <effect>". Suspend on the
// sac/decline choice, recording whether the controller actually has a matching permanent to give up (a false-
// `available` pause still surfaces — the player/AI must "decline" since you can't sacrifice what you don't have,
// and resolveOptionalSacChoice runs NO payoff). The payoff atoms ride on the pause for the settle.
function applyOptionalSacPayment(state, atom, ctx) {
  if (state.pendingChoice) return state; // FIFO — one choice at a time (belt-and-braces; setter re-guards)
  const player = state.players?.[ctx.controller];
  const available = !!(player?.battlefield || []).some((p) => controllerSacSubtypeMatch(p, atom.subtype));
  return setPendingOptionalSacBySubtypeChoice(state, {
    controller: ctx.controller,
    subtype: atom.subtype,
    available,
    effectAtoms: atom.effectAtoms || [],
    sourceName: ctx.cardName || null,
  });
}

// SHELF-85 N7 (2026-09-04) — TAXED LIFE LOSS (Phyrexian Tyranny "Whenever a player draws a card, that player loses 2 life
// unless they pay {2}"): the taxed-payment pause aimed at the REFERENT seat (ctx.drawingPlayerId / ctx.castingPlayerId
// by atom.who) with declinePayoff "loseLife" — decline or can't afford → THAT player loses `amount`. Unlike the Rhystic
// lane the payer may be the controller (Tyranny hits every seat, its owner included). Missing referent → no-op.
function applyTaxedLoseLife(state, atom, ctx) {
  if (state.pendingChoice) return state; // FIFO — one choice at a time
  const payer = atom.who === "drawingPlayer" ? ctx.drawingPlayerId : atom.who === "castingPlayer" ? ctx.castingPlayerId : null;
  if (!payer || !state.players?.[payer]) return state;
  return setPendingTaxedPaymentChoice(state, {
    payer,
    beneficiary: ctx.controller,
    cost: atom.cost,
    sourceName: ctx.cardName || null,
    declinePayoff: "loseLife",
    declineAmount: atom.amount,
  });
}

// TAXED EDICT (the 09-06 plan's stage ③, 2026-09-30 — the Rishadan pirates: "each opponent sacrifices a permanent of their
// choice unless they pay {N}"): the taxed-payment pause aimed at the OPPONENT, with the parsed edict riding the choice as
// the decline payoff (resolveTaxedPaymentChoice runs it for exactly that payer). The engine seats two players, so "each
// opponent" is one payer; a vanished opponent is a logged no-op.
function applyTaxedEdict(state, atom, ctx) {
  if (state.pendingChoice) return state; // FIFO — one choice at a time
  const payer = opponentsOf(state, ctx.controller).find((pid) => state.players?.[pid]);
  if (!payer || !atom.edict) return logEvent(state, { kind: "spell-effect", effect: "taxed-edict", payer: null, controller: ctx.controller });
  return setPendingTaxedPaymentChoice(state, {
    payer,
    beneficiary: ctx.controller,
    cost: atom.cost,
    sourceName: ctx.cardName || null,
    declinePayoff: "edict",
    declineEdict: atom.edict,
  });
}

// SHELF-85 N6 (2026-09-04) — LOSE LIFE UNLESS DISCARD (Painful Quandary "Whenever an opponent casts a spell, that player
// loses 5 life unless they discard a card"): the optional-discard-payment pause aimed at the referent seat, with a
// decline penalty of `amount` life (declineLoseLife). `available` counts the referent's non-token hand; an empty hand
// still pauses (the seat must decline) and then pays the life. Missing referent → no-op.
function applyLoseLifeUnlessDiscard(state, atom, ctx) {
  if (state.pendingChoice) return state; // FIFO — one choice at a time
  const payer = atom.who === "drawingPlayer" ? ctx.drawingPlayerId : atom.who === "castingPlayer" ? ctx.castingPlayerId : null;
  if (!payer || !state.players?.[payer]) return state;
  const available = (state.players[payer].hand || []).filter((c) => !c.token).length >= 1;
  return setPendingOptionalDiscardPaymentChoice(state, {
    controller: payer,
    available,
    discardCount: 1,
    effectAtoms: [],
    sourceName: ctx.cardName || null,
    declineLoseLife: atom.amount,
  });
}

// OPTIONAL DRAW-THEN-DISCARD — "you may draw a card. If you do, discard a card." Suspend on the yes/no; the
// [draw, discard] payoff rides on the pause for the settle (resolveOptionalDrawDiscardChoice runs it on yes).
function applyOptionalDrawDiscard(state, atom, ctx) {
  if (state.pendingChoice) return state; // FIFO — one choice at a time
  // MOON-CIRCUIT HACKER (BI-5): "discard a card unless this creature entered this turn" — read the source's entered-this-turn
  // stamp at resolution; when it matches, the pause carries the draw alone (a fresh ninja keeps its card).
  let effectAtoms = atom.effectAtoms || [];
  if (atom.unlessSourceEnteredThisTurn) {
    const src = ctx.sourceId ? findPermanent(state, ctx.sourceId)?.permanent : null;
    if (src && src.enteredOnTurn === (state.turn || 0)) effectAtoms = effectAtoms.filter((a) => a.op !== "discard");
  }
  return setPendingOptionalDrawDiscardChoice(state, {
    controller: ctx.controller,
    effectAtoms,
    sourceName: ctx.cardName || null,
  });
}

// OPTIONAL-DISCARD-PAYMENT — "you may discard a card. If you do, <effect>." The discard is the pausing COST; record
// whether the controller holds a non-token card to pitch (a false-`available` pause still surfaces — the player/AI
// must decline, and resolveOptionalDiscardPaymentChoice runs NO payoff). The payoff atoms ride on the pause for the
// settle. Token filter mirrors hand.js discardControllerCandidates (a token in hand is not a real card, CR 111.7).
function applyOptionalDiscardPayment(state, atom, ctx) {
  if (state.pendingChoice) return state; // FIFO — one choice at a time
  const player = state.players?.[ctx.controller];
  // ⚠️ THE COST CAN BE MORE THAN ONE CARD (Old One Eye discards TWO), so availability must count the hand,
  // not merely test it non-empty. A player holding one card cannot pay a two-card cost — offering the choice
  // anyway would let the payoff run for a price that was never paid, which is a fabricated effect.
  const discardCount = Math.max(1, atom.discardCount || 1);
  const payable = (player?.hand || []).filter((c) => !c.token).length;
  const available = payable >= discardCount;
  return setPendingOptionalDiscardPaymentChoice(state, {
    controller: ctx.controller,
    available,
    discardCount,
    effectAtoms: atom.effectAtoms || [],
    sourceName: ctx.cardName || null,
  });
}

// OPTIONAL-EXILE-SELF PAYMENT (Undead Butler, CR 603.7) — "you may exile it. When you do, <payoff>": the
// dies-trigger self-exile cost. Availability = the dead card (ctx.triggeringCardId, the dies look-back's
// durable key) sits in SOME graveyard right now; a false-`available` pause still surfaces (the player/AI
// must decline — the established pattern). The payoff atoms + the flush-locked target ride the pause.
// No referent threaded (a non-dies caller) → no choice at all, a clean no-op — never a guessed exile.
function applyOptionalExileSelfPayment(state, atom, ctx) {
  if (state.pendingChoice) return state; // FIFO — one choice at a time
  const cardId = ctx?.triggeringCardId;
  if (!cardId) return logEvent(state, { kind: "spell-effect", effect: "optional-exile-self", skipped: "no-referent", controller: ctx?.controller });
  const available = Object.keys(state.players || {}).some((pid) => (state.players[pid]?.graveyard || []).some((c) => c.id === cardId));
  return setPendingOptionalExileSelfChoice(state, {
    controller: ctx.controller,
    available,
    cardId,
    effectAtoms: atom.effectAtoms || [],
    sourceName: ctx.cardName || null,
    targets: ctx.targets || [],
  });
}

// OPPONENT-PAYS-TO-DENY (taxed-draw) — the effect of "Whenever an opponent casts a spell, you may draw a card unless
// that player pays {N}." (Rhystic Study). The PAYER is the opponent who cast — ctx.castingPlayerId, threaded into the
// trigger context by checkCastTriggers and spread into ctx by runEffectProgram. Suspend on the payer's pay-or-let-
// you-draw choice (setPendingTaxedPaymentChoice sets controller=payer, so the driver routes it to the payer's seat).
// A missing/self payer (reached outside an opponent-cast trigger) → no-op: never a fabricated draw (CREED-safe FN).
function applyTaxedDraw(state, atom, ctx) {
  if (state.pendingChoice) return state; // FIFO — one choice at a time
  const payer = ctx.castingPlayerId;
  if (!payer || !state.players?.[payer] || payer === ctx.controller) return state;
  // DYNAMIC TAX (Esper Sentinel) — "{X}, where X is this creature's power". Resolved HERE, as the ability
  // resolves (CR 608.2), against the live source: a grown Sentinel taxes more, which is the card's plan. The
  // same countForSpec `selfPower` metric the mana model reads, so the two can never drift on what "this
  // creature's power" means. `source: perm` matches the mana path's ctx shape; a source no longer on the
  // battlefield resolves to 0 — a free tax, never a fabricated number.
  let cost = atom.cost;
  if (cost?.genericSpec) {
    const lk = ctx.sourceId ? findPermanent(state, ctx.sourceId) : null;
    const n = Math.max(0, countForSpec(state, { controller: ctx.controller, source: lk?.permanent, sourceId: ctx.sourceId }, cost.genericSpec));
    cost = { kind: "mana", mana: { generic: n } };
  }
  return setPendingTaxedPaymentChoice(state, {
    payer,
    beneficiary: ctx.controller,
    cost,
    sourceName: ctx.cardName || null,
  });
}

// OPPONENT-PAYS-TO-DENY (taxed-treasure) — the effect of "Whenever an opponent draws a card, that player may pay {N}.
// If the player doesn't, you create a Treasure token." (Smothering Tithe). Mirrors applyTaxedDraw exactly, EXCEPT the
// PAYER is the opponent who DREW (ctx.drawingPlayerId, threaded into the trigger context by checkCardDrawnTriggers and
// spread into ctx by runEffectProgram) and the decline-payoff is a Treasure the BENEFICIARY (you) creates
// (declinePayoff:"treasure" → resolveTaxedPaymentChoice mints a functional Treasure with its tap-for-mana ability).
// Suspend on the payer's pay-or-let-you-make-a-Treasure choice (controller=payer → the driver routes it to the payer's
// seat). A missing/self payer (reached outside an opponent-draw trigger) → no-op: never a fabricated Treasure (CREED FN).
function applyTaxedTreasure(state, atom, ctx) {
  if (state.pendingChoice) return state; // FIFO — one choice at a time
  const payer = ctx.drawingPlayerId;
  if (!payer || !state.players?.[payer] || payer === ctx.controller) return state;
  return setPendingTaxedPaymentChoice(state, {
    payer,
    beneficiary: ctx.controller,
    cost: atom.cost,
    sourceName: ctx.cardName || null,
    declinePayoff: "treasure",
  });
}

// UPKEEP-SAC-UNLESS-PAY — "Sacrifice this <noun> unless you pay {cost}." Suspend on the pay/decline choice, carrying
// the mana cost AND `sourceId` (the source permanent, ctx.sourceId — the same binding the self-sac edict atom uses)
// so resolveSacUnlessPayChoice can sacrifice THIS permanent on a decline / unaffordable pay. INVERTED polarity: pay
// keeps it, don't-pay sacrifices it.
function applyUpkeepSacUnlessPay(state, atom, ctx) {
  if (state.pendingChoice) return state; // FIFO — one choice at a time
  let controller = ctx.controller;
  let sourceId = ctx.sourceId ?? null;
  let sourceName = ctx.cardName || null;
  // SLOW MOTION (2026-08-12) — the OTHER-PLAYER's pay-or-sacrifice, re-aimed at fire time:
  // payerRef:"upkeepPlayer" puts the choice (and the mana charge) on the player whose upkeep it is —
  // the HOST's controller by the enchanted-controller's-upkeep firing gate — and victimRef:"enchanted"
  // makes the HOST the permanent sacrificed on decline (the aura itself survives either outcome).
  // Referent unset (a non-upkeep event) or a detached aura → NO choice at all (a clean no-op, never a
  // choice charged to the wrong seat or a sacrifice of the wrong permanent). Everything downstream —
  // resolveSacUnlessPayChoice, autoPickSacUnlessPay, the settle — inherits unchanged: pc.controller
  // pays, pc.sourceId dies.
  if (atom.payerRef === "upkeepPlayer") {
    if (!ctx.upkeepPlayerId || !state.players?.[ctx.upkeepPlayerId]) return state;
    controller = ctx.upkeepPlayerId;
  }
  if (atom.victimRef === "enchanted") {
    const src = ctx.sourceId ? findPermanent(state, ctx.sourceId) : null;
    const hostId = src?.permanent?.attachedTo || null;
    const host = hostId ? findPermanent(state, hostId) : null;
    if (!host) return state;
    sourceId = hostId;
    sourceName = host.permanent?.card?.name || null;
  }
  return setPendingSacUnlessPayChoice(state, {
    controller,
    cost: atom.cost,
    sourceId,
    sourceName,
  });
}

// CUMULATIVE UPKEEP (CR 702.24) — the synthesized upkeep trigger of a "Cumulative upkeep {cost}" permanent
// (Mystic Remora, Glacial Chasm). CR 702.24e: "put an age counter on this permanent, then sacrifice it unless
// you pay its upkeep cost for each age counter on it." Resolve in exactly that order: (1) ADD one age counter
// via addCounter (routes through the counter-doubler chokepoint — Doubling Season DOES double age counters,
// CR 122.1, so this is the faithful placement), (2) read the NEW age-counter total on the source, (3) SCALE
// the printed per-counter cost by that total, (4) suspend on the SAME sac-unless-pay pending choice the
// echo-family uses (INVERTED polarity: pay the escalated cost → keep it; decline/can't-afford → sacrifice
// the source). Reusing setPendingSacUnlessPayChoice means the whole resolve/settle/auto-pick chain
// (resolveSacUnlessPayChoice, autoPickSacUnlessPay, learnSession settle) is inherited unchanged — the ONLY
// new behavior is the age-counter placement + the per-counter cost scaling done here at fire time. A stale/
// absent sourceId (the permanent already left the battlefield before the trigger resolved) is a clean no-op:
// findPermanent returns null → no counter, no pending choice, the trigger fizzles (CR 603.4-adjacent).
// ECHO (BLITZ EC-1, CR 702.30) — the ONE-TIME pay-or-sacrifice: at the FIRST of the controller's upkeeps
// after the permanent entered, pay the printed echo cost or sacrifice it; every later upkeep is a clean
// no-op (the echoDone stamp — for a permanent that stays under one controller this is exactly CR 702.30c's
// "came under your control since your most recent upkeep" single payment). Reuses the SHARED sac-unless-pay
// pending choice (the same resolve/settle/auto-pick chain cumulative upkeep inherits), fixed printed cost —
// no scaling. A stale/absent sourceId (the permanent left before the trigger resolved) is a clean no-op.
function applyEcho(state, atom, ctx) {
  if (state.pendingChoice) return state; // FIFO — one choice at a time
  const sourceId = ctx.sourceId ?? null;
  const lk = sourceId ? findPermanent(state, sourceId) : null;
  if (!lk) return state;
  if (lk.permanent.echoDone) return state; // the single echo payment already happened (CR 702.30c)
  let next = updatePermanentSafe(state, sourceId, (p) => ({ ...p, echoDone: true }));
  next = logEvent(next, { kind: "spell-effect", effect: "echo", controller: ctx.controller, sourceName: ctx.cardName || null });
  return setPendingSacUnlessPayChoice(next, {
    controller: ctx.controller,
    cost: atom.cost,
    sourceId,
    sourceName: ctx.cardName || null,
  });
}

function applyCumulativeUpkeep(state, atom, ctx) {
  if (state.pendingChoice) return state; // FIFO — one choice at a time
  const sourceId = ctx.sourceId ?? null;
  const lk = sourceId ? findPermanent(state, sourceId) : null;
  if (!lk) return state; // source gone → the ability does nothing (no counter, no sac, no pay)
  // (1) place ONE age counter (doubler-aware — CR 122.1c), then (2) read the resulting total from the SAME
  // source (findPermanent again — addCounter returned a new state; a placed doubler may have added >1).
  let next = addCounter(state, { permanentId: sourceId, type: "age", amount: 1 });
  const afterLk = findPermanent(next, sourceId);
  const ageCount = Math.max(1, afterLk?.permanent?.counters?.age || 1); // >=1 (we just placed at least one)
  // (3) scale the printed per-counter mana cost by the age-counter total. Base is a pure generic/colored cost
  // (the matcher rejects hybrid/{X}), so multiplying each pip count by ageCount is exact — {1} at N counters
  // owes {N} generic; {1}{U} at N owes {N}{U…} (N generic + N of the color), CR 702.24b "for each age counter".
  const base = atom.cost?.mana || {};
  const scaled = { generic: (base.generic || 0) * ageCount, W: (base.W || 0) * ageCount, U: (base.U || 0) * ageCount, B: (base.B || 0) * ageCount, R: (base.R || 0) * ageCount, G: (base.G || 0) * ageCount, C: (base.C || 0) * ageCount, hybrid: [] };
  next = logEvent(next, { kind: "spell-effect", effect: "cumulative-upkeep", controller: ctx.controller, ageCounters: ageCount, sourceName: ctx.cardName || null });
  return setPendingSacUnlessPayChoice(next, {
    controller: ctx.controller,
    cost: { kind: "mana", mana: scaled },
    sourceId,
    sourceName: ctx.cardName || null,
  });
}

// STORM-COPY-TARGET — the enemy/own SIDE of a chosen target, for the per-copy new-target chooser (CR 707.10c).
// Mirrors gameEngine.chooseTriggerTargets' `sideOf` but is replicated inline so atoms/stack.js stays clear of the
// stack→gameEngine→parser cycle (gameEngine + parser both transitively import this file). A target carries no
// controller for a player (its id IS the player) or a spell (resolve via state.stack); a permanent/graveyard-card
// target carries `.controller`.
function copyTargetSide(state, t) {
  if (t?.type === "player") return t.id;
  if (t?.type === "spell") return (state.stack || []).find((o) => o.id === t.id)?.controller;
  return t?.controller;
}
// STORM-COPY-TARGET — the intended side per chosen-target atom op, a MINIMAL mirror of parser.atomTargetIntent for
// the ops that can reach a targeted storm body (coverage's programTriggerTargetsResolvable gate keeps an AMBIGUOUS
// two-sided-target atom — fight-pair / damage-target-power — off this path entirely (programTriggerTargetsResolvable
// rejects "ambiguous"), so an atom that lands here is single-sided. Returns "enemy" | "own" | null. This is a SUBSET
// MIRROR of parser.atomTargetIntent, replicated inline to keep atoms/stack.js out of the stack→parser cycle (parser
// imports this file). To avoid drift it covers ONLY ops whose side is UNCONDITIONAL (no per-atom restriction/counter-
// sign branch) PLUS the two whose branch is a verbatim copy of atomTargetIntent's (pump's shrink test, tap's
// you-control test). Each is CR-grounded:
//   deal-damage / destroy / exile / counter / fight / lose-life / rad / cant-block → enemy (offensive — you aim
//     these at an opponent; self-targeting would be a wrong play; these have NO own-side targetType variant).
//   return-from-graveyard / untap → own (the target is in/your own — enumeration only ever offers own anyway).
//   pump → enemy iff a SHRINK (negative P or T, e.g. -X/-X), else own (verbatim atomTargetIntent).
//   tap → own only when restricted to "you control", else enemy (verbatim atomTargetIntent).
// DELIBERATELY OMITTED (their side branches in atomTargetIntent are subtle — add-counter keys on counterType sign /
// creatureYouControl; bounce on a youControl/self targetType): for those the chooser falls back to the first LEGAL
// combo (still CR-correct — never a fabricated/illegal target, only side-agnostic). An op NOT listed → null likewise.
function copyAtomIntent(atom) {
  if (!atom?.targetType) return null;
  switch (atom.op) {
    case "deal-damage":
    case "destroy":
    case "exile":
    case "counter":
    case "fight":
    case "lose-life":
    case "rad":
    case "cant-block":
      return "enemy";
    case "pump":
      return (atom.ptDelta && ((atom.ptDelta.p || 0) < 0 || (atom.ptDelta.t || 0) < 0)) ? "enemy" : "own";
    case "tap":
      return atom.restrictions?.some((r) => r.kind === "controller" && r.who === "you") ? "own" : "enemy";
    case "return-from-graveyard":
    case "untap":
      return "own";
    default:
      return null;
  }
}

/**
 * ===== STORM (CR 702.40) ===== — "Storm (When you cast this spell, copy it for each spell cast before it this
 * turn.)". The Storm keyword's triggered ability (synthesized in triggers.detectTriggers as a selfCast trigger,
 * since the real trigger lives in stripped reminder text — the BUSHIDO/RAMPAGE keyword→trigger precedent) copies
 * the storm spell N times, N = the number of spells cast BEFORE it this turn (CR 702.40a). The count + a SNAPSHOT
 * of the storm spell's resolution payload are threaded onto this trigger's context at cast time
 * (triggers.checkCastTriggers, off the player's spellsCastThisTurn-1 and the storm spell's stack object), so the
 * atom is self-contained at resolution and never depends on the original spell still sitting on the stack (it
 * could have been countered in response to the storm trigger — the copies are independent objects, CR 707.10c).
 *
 * Each copy is a NEW stack object carrying a CLONE of the storm spell's frozen EFFECT_PROGRAM payload. A copy is
 * NOT a card (CR 707.10a) — `isCopy`/`token` are stamped so no resolution path tries to move it to a zone; an
 * instant/sorcery copy resolves its program then ceases to exist, exactly like the original except no card
 * disposition (the engine doesn't track resolved instant/sorcery cards to a zone anyway). The copies go on TOP of
 * the stack (above the still-resolving-later original) and resolve FIRST, CR-correct.
 *
 * STORM-COPY-TARGET (CR 707.10c) — "You may choose new targets for the copies." For a TARGETED body (Grapeshot's
 * "deals 1 damage to any target", Tendrils of Agony's "target player loses 2 life") each copy picks its OWN fresh
 * target as it's put on the stack: re-enumerate the body's legal targets HERE off the LIVE board (expandCastChoices,
 * the same enumerator the cast + trigger paths use), prefer the first combo whose every chosen target sits on its
 * atom's intended side (enemy for damage/drain — so copies aim at an opponent, never the caster, and the AI can
 * spread across opponents), else any legal combo, else fall back to the original spell's targets (the CR 707.10c
 * DEFAULT — keep the same targets when no fresh legal pick exists). A copy whose body needs a target but has NO
 * legal target on the board is REMOVED (CR 608.2b — it never goes on the stack), never resolved target-less (which
 * would silently drop the clause — a forbidden FP). A non-targeted body (Empty the Warrens / Weather the Storm)
 * skips all of this (programNeedsChosenTarget false) and the copy carries empty targets exactly as before.
 *
 * N=0 (the storm spell is the first spell of the turn) → zero copies, a logged no-op (the original spell still
 * resolves on its own). A missing snapshot (defensive — never happens off the threaded cast path) → no-op too.
 * `?? 0` (NOT `|| 0`) reads the count so a genuine 0 is honored, never coerced.
 */
function applyCopySpell(state, atom, ctx) {
  const n = Math.max(0, ctx?.stormCount ?? 0);
  const sourcePayload = ctx?.stormSourcePayload;
  if (n <= 0 || !sourcePayload) {
    return logEvent(state, { kind: "spell-effect", effect: "storm-copy", count: 0, controller: ctx?.controller });
  }
  // A copy is not a card (CR 707.10a): flag isCopy + token so no resolution/zone path treats it as a real card.
  const sourceCard = ctx?.stormSourceCard || { name: ctx?.cardName };
  // The body program + the original spell's targets ride on the cloned EFFECT_PROGRAM payload. A targeted body
  // (resolver:"effect-program" with a chosen-target atom) re-picks per copy; everything else keeps empty targets.
  const bodyProgram = sourcePayload?.params?.program || null;
  const originalTargets = sourcePayload?.params?.targets || [];
  // Whether ANY atom in the body takes a chosen target (drives the per-copy re-enumeration). We re-enumerate when
  // the body has a targeting atom OR carried original targets — both signal a targeted spell; a non-targeted body
  // (no targeting atom, no original targets) skips straight to the clone with empty targets (byte-identical to
  // the pre-targeted STORM behavior for Empty the Warrens / Chatterstorm / Weather the Storm).
  const bodyHasChosenTarget = (bodyProgram?.atoms || []).some((a) => !!a.targetType) || originalTargets.length > 0;
  // STORM-COPY-TARGET — pick a fresh legal target combo for one copy off the LIVE state `s`. Prefer all-enemy-side
  // (per copyAtomIntent), else first legal, else the original spell's targets (CR 707.10c default). Returns null
  // when the body needs a target but none is legal (the copy is removed, CR 608.2b).
  const pickCopyTargets = (s) => {
    if (!bodyHasChosenTarget) return [];
    let combos;
    try { combos = expandCastChoices(s, ctx.controller, bodyProgram) || []; } catch { combos = []; }
    if (combos.length === 0) {
      // No fresh legal target. CR 707.10c default = keep the original targets — but only if they're STILL legal-
      // shaped (present). If the original is also empty the copy has no target → remove it (null).
      return originalTargets.length > 0 ? originalTargets : null;
    }
    const sideOk = (combo) => (combo.targets || []).every((t) => {
      const intent = copyAtomIntent((bodyProgram.atoms || [])[t.atomIndex]);
      if (intent === "enemy") { const side = copyTargetSide(s, t); return side != null && side !== ctx.controller; }
      if (intent === "own") return copyTargetSide(s, t) === ctx.controller;
      return true; // null intent (non-side-constrained atom) — any legal target is fine
    });
    const chosen = combos.find(sideOk) || combos[0];
    return chosen?.targets || [];
  };
  // ===== STORM ON A PERMANENT SPELL (CR 707.10f) ===== "Some effects copy a permanent spell. As that copy
  // resolves, it ceases being a copy of a spell and becomes a TOKEN permanent." Stormscale Scion, Aeve, and the
  // storm Auras resolve through PERMANENT_ETB (`params.card`), not through an EFFECT_PROGRAM body, so the
  // program-clone path below produces nothing usable for them: it would push N copies that all share the
  // ORIGINAL card's id (two tokens with one id) and carry no `token` flag, so each would go to a graveyard as a
  // real card when it died. That is why the classifier gated permanent-storm to body-only — the path was never
  // built, not merely mis-tiered.
  //
  // The per-copy snapshot here is the SAME one applyCopyCreatureSpell (Double Major) already uses: copiable card
  // (CR 707.2), `token: true` (CR 707.10f — never a card in any zone), and a FRESH id per copy so two tokens are
  // never one object. The original spell's payload is cloned so the copy enters the same way (xValue/kicked ride
  // along per CR 707.10b), then `params.card` is overwritten with this copy's own snapshot.
  //
  // A permanent spell takes no targets from its body, so the target machinery below is skipped entirely rather
  // than being taught a second shape — an Aura's "enchant" target is a CAST choice the copy re-makes at
  // resolution, not a body atom, so `pickCopyTargets` has nothing to say about it.
  const permanentCard = sourcePayload?.params?.card;
  if (permanentCard && !sourcePayload?.params?.program) {
    let next = state;
    let made = 0;
    for (let i = 0; i < n; i++) {
      const { id, state: s2 } = mintId(next, "stk");
      next = s2;
      const copyCard = { ...snapshotCopiedCard({ card: permanentCard }, undefined, []), token: true, id: `tok-${id}` };
      const clonedPayload = JSON.parse(JSON.stringify(sourcePayload));
      clonedPayload.params.card = copyCard;
      clonedPayload.params.controller = ctx.controller; // you control the copy (CR 707.10)
      delete clonedPayload.params.spellToGraveyard;     // a copy ceases to exist; only the ORIGINAL has a disposition
      const copyObj = createStackObject({
        id, kind: "spell", source: { ...copyCard, token: true, isCopy: true },
        controller: ctx.controller, targets: [], payload: clonedPayload,
      });
      next = { ...next, stack: [...next.stack, { ...copyObj, isCopy: true }] };
      made++;
      // Same chokepoint every copy-creation site funnels through. The copied object is a PERMANENT spell, so
      // magecraft's instantSorcery filter excludes it — this is a no-op here by construction, wired for
      // uniformity (identical to applyCopyCreatureSpell's note).
      next = checkCopyTriggers(next, { copiedSpellCard: copyCard, controllerId: ctx.controller });
    }
    return logEvent(next, { kind: "spell-effect", effect: "storm-copy", count: made, requested: n, controller: ctx.controller, cardName: sourceCard?.name });
  }

  let next = state;
  let made = 0;
  for (let i = 0; i < n; i++) {
    // Re-enumerate against `next` so each copy sees the prior copies (they're on the stack but not yet resolved —
    // the board is unchanged, so each copy independently re-derives the same enemy-side legal set; deterministic).
    const copyTargets = pickCopyTargets(next);
    if (copyTargets === null) {
      // CR 608.2b — a copy that needs a target with none legal is removed (it never goes on the stack). Log + skip.
      next = logEvent(next, { kind: "spell-effect", effect: "storm-copy-removed", controller: ctx.controller, cardName: sourceCard?.name, reason: "no legal target" });
      continue;
    }
    const { id, state: s2 } = mintId(next, "stk");
    next = s2;
    // Clone the frozen payload so the copy resolves the SAME program independently of the original, then OVERWRITE
    // params.targets with this copy's freshly-chosen targets (CR 707.10c) so the interpreter binds them per clause.
    const clonedPayload = JSON.parse(JSON.stringify(sourcePayload));
    if (clonedPayload?.params) {
      clonedPayload.params.targets = copyTargets;
      // GY-1 anti-duplicate guard (CR 707.10a): a COPY ceases to exist on resolution — it must never
      // append another card object (same id!) to the graveyard. Only the ORIGINAL keeps its disposition.
      delete clonedPayload.params.spellToGraveyard;
    }
    const copyObj = createStackObject({
      id,
      kind: "spell",
      source: { ...sourceCard, token: true, isCopy: true },
      controller: ctx.controller,
      targets: copyTargets, // the copy's chosen targets (empty for a non-targeted body)
      payload: clonedPayload,
    });
    next = { ...next, stack: [...next.stack, { ...copyObj, isCopy: true }] };
    made++;
    // MAGECRAFT COPY HALF (BLITZ MC-1, CR 707.10) — each copy of an instant/sorcery is a distinct "copy" event, so
    // a magecraft "cast or copy" watcher fires ONCE PER COPY (CR ruling: storm making N copies triggers magecraft N
    // times, plus once for the original cast which checkCastTriggers already handled). Only firesOnCopy watchers
    // fire — a plain "whenever you cast" never does (a copy is not a cast). sourceCard carries the storm spell's
    // type, so the instantSorcery filter is satisfied for the always-instant/sorcery storm spell.
    next = checkCopyTriggers(next, { copiedSpellCard: sourceCard, controllerId: ctx.controller });
  }
  return logEvent(next, { kind: "spell-effect", effect: "storm-copy", count: made, requested: n, controller: ctx.controller, cardName: sourceCard?.name });
}

/**
 * ===== CDMG-MASS-TO-DAMAGED-PLAYER (Balefire Dragon) ===== the SOURCE deals `ctx.combatDamageAmount` damage to
 * each creature the just-damaged player (`ctx.damagedPlayerId`) controls. Mirrors applySourcePowerFanout's
 * structure (build the target list, then ONE applyDamageEffect with source:{id}) but scoped to a SINGLE player's
 * creatures and with the amount read from the combat-damage referent. Both referents come from the trigger ctx;
 * a missing referent (a spell / non-combat trigger → no ctx.damagedPlayerId or combatDamageAmount) is a clean
 * no-op (empty target list / 0 amount), never a fabricated wipe. source.id (ctx.sourceId — the Dragon) threads
 * the source-scoped damage-replacement / infect / wither hook, identical to every other deal-damage atom.
 */
function applyCdmgMassToDamagedPlayer(state, atom, ctx) {
  const amount = Math.max(0, resolveScaledAmount(state, atom, ctx) || 0);
  const pid = ctx.damagedPlayerId;
  if (amount <= 0 || !pid || !state.players?.[pid]) {
    return logEvent(state, { kind: "spell-effect", effect: "cdmg-mass-to-damaged-player", controller: ctx.controller, amount: 0 });
  }
  const targets = (state.players[pid].battlefield || [])
    .filter((perm) => isCreatureCard(perm.card))
    .map((perm) => ({ type: "creature", id: perm.id }));
  if (targets.length === 0) {
    return logEvent(state, { kind: "spell-effect", effect: "cdmg-mass-to-damaged-player", controller: ctx.controller, amount });
  }
  return applyDamageEffect(state, { controller: ctx.controller, amount, targets, source: { id: ctx.sourceId } });
}

/**
 * ===== CDMG-TO-EACH-OTHER-OPPONENT (Super State, CR 510 + 119) ===== the SOURCE (the Aura, threaded as
 * ctx.sourceId) deals `ctx.combatDamageAmount` damage to each OPPONENT of the controller EXCEPT the one just
 * combat-damaged (ctx.damagedPlayerId). Both referents come from the combat-damage trigger ctx (checkCombat-
 * DamageTriggers → {damagedPlayerId, combatDamageAmount}), NOT chosen targets, so the atom is non-targeted and
 * routes natively on the combat-damage flush. Mirrors applySourcePowerFanout's player fan-out (player targets +
 * ONE applyDamageEffect + source:{id} for the source-scoped damage-replacement/infect/wither hook) but scoped to
 * the OTHER opponents and with the amount read from the combat-damage referent. A missing referent (a spell /
 * non-combat trigger → no ctx.combatDamageAmount) is a clean no-op (0 amount). In a 1v1 game the only opponent
 * IS the damaged player, so the "other opponent" set is empty → a clean no-op (never a fabricated self-hit or a
 * double-hit on the already-damaged player). "each OTHER opponent" excludes ctx.damagedPlayerId (CR 113.7).
 */
function applyCdmgToEachOtherOpponent(state, atom, ctx) {
  const amount = Math.max(0, resolveScaledAmount(state, atom, ctx) || 0);
  if (amount <= 0) {
    return logEvent(state, { kind: "spell-effect", effect: "cdmg-to-each-other-opponent", controller: ctx.controller, amount: 0 });
  }
  const damaged = ctx.damagedPlayerId;
  const targets = opponentsOf(state, ctx.controller)
    .filter((opp) => opp !== damaged && state.players?.[opp])
    .map((opp) => ({ type: "player", id: opp }));
  if (targets.length === 0) {
    return logEvent(state, { kind: "spell-effect", effect: "cdmg-to-each-other-opponent", controller: ctx.controller, amount });
  }
  return applyDamageEffect(state, { controller: ctx.controller, amount, targets, source: { id: ctx.sourceId } });
}

/**
 * ===== COPY-A-CREATURE-SPELL (Double Major, CR 707.10 / 707.12) ===== resolve "Copy target creature spell you
 * control[, except it isn't legendary]." The chosen creature spell (ctx.targets[0], a stack object) is copied as a
 * NEW object put on top of the stack; a copy of a PERMANENT spell "becomes a token as it resolves" (CR 707.10a), so
 * the copy carries the SAME resolver payload the original creature spell carries (PERMANENT_ETB) with a `token:true`
 * snapshot of the copiable card. When it resolves it enters the battlefield as a token creature copy — its own ETB
 * triggers firing for free (enterPermanent detects them off the copied card.oracle), a real playable permanent.
 *
 * CR 707.10b — the copy copies the value of {X} the original was cast for: the original's cast-time xValue rides on
 * its PERMANENT_ETB payload (params.xValue), so cloning the payload preserves it (the copy enters at the same P/T).
 * CR 707.12 — `stripLegendary` removes the Legendary supertype from the copy's type line (Double Major's rider), so
 * two copies of one legend can coexist without the legend rule killing one.
 *
 * A target no longer on the stack (it resolved / was countered first) → a logged fizzle (CR 608.2b), never an error.
 * A target whose payload isn't a permanent-enters copy (defensive — the enumerator only ever offers creature spells,
 * which resolve via PERMANENT_ETB) → a logged no-op, never a fabricated body. The copy is stamped token+isCopy so no
 * zone/disposition path treats it as a real card (CR 707.10a — a copy is not a card).
 */
// Remove the Legendary supertype from a type line (CR 707.12) — word-bounded, both the `type` and (if present)
// `type_line` fields, collapsing the leftover double space. A non-legendary line is returned unchanged.
function stripLegendarySupertype(card) {
  const strip = (s) => String(s || "").replace(/\bLegendary\b\s*/gi, "").replace(/\s{2,}/g, " ").trim();
  const next = { ...card, type: strip(card.type || card.type_line) };
  if (card.type_line) next.type_line = strip(card.type_line);
  return next;
}

/**
 * ===== COPY AN INSTANT OR SORCERY (CR 707.10) ===== Reverberate #1380 and the Fork family.
 *
 * Unlike the creature-spell copy below, there is NO copiable permanent card to snapshot: an instant/sorcery
 * copy resolves its EFFECT and then ceases to exist (CR 707.10a — the copy is not a card, so it goes to no
 * zone). So the copy is the ORIGINAL'S RESOLVING PAYLOAD, deep-cloned, with the controller re-pointed.
 *
 * Deep-cloned, not shared: the payload carries the program, its chosen targets and xValue, and the resolver
 * mutates params as it runs. Sharing the object would let the copy's resolution reach into the original's.
 *
 * TARGETS ARE KEPT (CR 707.10c). "You may choose new targets" is DECLINED — always a legal choice, so this
 * is a faithful SUBSET of the card: it can forgo an option, never play a different one.
 *
 * xValue rides along with the payload (CR 707.10b — a copy copies the value of X). The copy is placed ON TOP
 * of the stack, so it resolves BEFORE the spell it copied — which is the printed behaviour and the reason
 * Reverberate can answer a spell that would otherwise resolve first.
 */
function applyCopyInstantOrSorcery(state, atom, ctx) {
  const t = (ctx.targets || []).find((x) => x?.type === "spell");
  if (!t?.id) return logEvent(state, { kind: "spell-effect", effect: "copy-instant-or-sorcery", controller: ctx.controller, count: 0 });
  const targetObj = (state.stack || []).find((o) => o.id === t.id && o.kind === "spell");
  if (!targetObj) {
    // Target left the stack (resolved / countered in response) — CR 608.2b illegal target, the copy fizzles.
    return logEvent(state, { kind: "spell-effect", effect: "copy-instant-or-sorcery-fizzle", targetId: t.id, controller: ctx.controller });
  }
  if (!targetObj.payload) {
    return logEvent(state, { kind: "spell-effect", effect: "copy-instant-or-sorcery", controller: ctx.controller, count: 0, cardName: targetObj.source?.name });
  }
  const { id, state: s2 } = mintId(state, "stk");
  const clonedPayload = JSON.parse(JSON.stringify(targetObj.payload));
  if (clonedPayload.params) clonedPayload.params.controller = ctx.controller; // you control the copy (CR 707.10)
  const copyObj = createStackObject({
    id,
    kind: "spell",
    source: targetObj.source,
    controller: ctx.controller,
    targets: targetObj.targets || [],
    payload: clonedPayload,
  });
  const next = { ...s2, stack: [...s2.stack, { ...copyObj, isCopy: true }] };
  return logEvent(next, { kind: "spell-effect", effect: "copy-instant-or-sorcery", controller: ctx.controller, count: 1, cardName: targetObj.source?.name });
}

function applyCopyCreatureSpell(state, atom, ctx) {
  const t = (ctx.targets || []).find((x) => x?.type === "spell");
  if (!t?.id) {
    return logEvent(state, { kind: "spell-effect", effect: "copy-creature-spell", controller: ctx.controller, count: 0 });
  }
  const idx = (state.stack || []).findIndex((o) => o.id === t.id && o.kind === "spell");
  if (idx === -1) {
    // Target left the stack (resolved / countered first) — CR 608.2b illegal target, the copy fizzles.
    return logEvent(state, { kind: "spell-effect", effect: "copy-creature-spell-fizzle", targetId: t.id, controller: ctx.controller });
  }
  const targetObj = state.stack[idx];
  const sourcePayload = targetObj.payload;
  const sourceCard = targetObj.source;
  // A creature spell resolves via PERMANENT_ETB (a permanent enters). Its copiable card is params.card (the cast
  // card). Defensive: if the chosen spell isn't a permanent-enters copy, no-op rather than fabricate a body.
  if (!sourcePayload?.params?.card || !isCreatureCard(sourceCard)) {
    return logEvent(state, { kind: "spell-effect", effect: "copy-creature-spell", controller: ctx.controller, count: 0, cardName: sourceCard?.name });
  }
  // CR 707.2 — the copiable card (printed values, fresh object, isCommander stripped). token:true is the load-
  // bearing flag: the resolved permanent is a TOKEN (CR 707.10a) — it never goes to a graveyard/zone as a card.
  let copyCard = snapshotCopiedCard({ card: sourcePayload.params.card }, undefined, []);
  copyCard = { ...copyCard, token: true };
  if (atom.stripLegendary) copyCard = stripLegendarySupertype(copyCard); // CR 707.12 — "except it isn't legendary"
  const { id, state: s2 } = mintId(state, "stk");
  let next = s2;
  // Clone the original's PERMANENT_ETB payload so the copy enters the SAME way (preserving xValue/kicked — CR
  // 707.10b copies the value of X), then overwrite params.card with the token snapshot (a fresh per-copy id so
  // two copies never share one). The copy carries no printed-card disposition (it's a token, not a card).
  const clonedPayload = JSON.parse(JSON.stringify(sourcePayload));
  copyCard = { ...copyCard, id: `tok-${id}` };
  clonedPayload.params.card = copyCard;
  clonedPayload.params.controller = ctx.controller; // you control the copy (CR 707.10)
  const copyObj = createStackObject({
    id,
    kind: "spell",
    source: { ...copyCard, token: true, isCopy: true },
    controller: ctx.controller,
    targets: [],
    payload: clonedPayload,
  });
  next = { ...next, stack: [...next.stack, { ...copyObj, isCopy: true }] };
  // MAGECRAFT COPY HALF (BLITZ MC-1, CR 707.10) — route the copy through the same "cast or copy" watcher check as
  // the storm site. The copied object is a CREATURE spell, so the magecraft instantSorcery filter EXCLUDES it
  // (checkCopyTriggers is a no-op here) — magecraft correctly never fires on a copied creature spell (CR 707.10f).
  // Wired uniformly so every copy-creation site funnels through one chokepoint; the filter guarantees no FP.
  next = checkCopyTriggers(next, { copiedSpellCard: copyCard, controllerId: ctx.controller });
  return logEvent(next, { kind: "spell-effect", effect: "copy-creature-spell", count: 1, controller: ctx.controller, cardName: sourceCard?.name });
}

/**
 * VENSER (2026-08-14) — "return target spell or permanent to its owner's hand": the STACK∪BATTLEFIELD
 * union bounce. A STACK target routes through counterSpellById with counterDest:"hand" — mechanically
 * the exact stack→hand move (CR 701.6a's zone change), labeled via:"return-to-hand"; this is NOT a
 * counter in the rules sense, which is why enumeration (the atom's notCounter flag) does not exclude
 * uncounterable spells, and why no countered-watcher exists to mis-fire (verified: triggers.js has no
 * such event). A BATTLEFIELD target routes through applyZoneMove → hand (the ordinary bounce). A target
 * in neither place fizzled (left the zone before resolution) — a clean no-op per target (CR 608.2b).
 */
function applyBounceSpellOrPermanent(state, atom, ctx) {
  let next = state;
  for (const t of ctx.targets || []) {
    if ((next.stack || []).some((o) => o.id === t.id && o.kind === "spell")) {
      next = counterSpellById(next, t.id, { via: "return-to-hand", counterDest: "hand" });
    } else if (findPermanent(next, t.id)) {
      next = applyZoneMove(next, { ...atom, op: "bounce", targetType: "permanent" }, { ...ctx, targets: [t] }, "hand");
    }
  }
  return next;
}

/**
 * ⭐ RETARGET (Deflecting Swat, CR 115.7) — "you may choose new targets for target spell or ability."
 * The targeted stack object's OWN targets are re-picked here off the LIVE board via expandCastChoices
 * (the same enumerator the cast path and STORM-COPY-TARGET use), run from the TARGETED OBJECT'S
 * controller's perspective (target legality — protection, hexproof, "can't be the target" — is judged
 * for the spell, not for Swat's controller; only the CHOICE among legal combos belongs to Swat's caster).
 *
 * The deterministic house policy (documented like the auto-pick policies, riot discipline):
 *   - DECLINE (keep every target, CR 115.7d — always legal for a printed "may") when the object's
 *     current targets don't touch the retargeter (nothing to deflect), when the object carries no
 *     effect-program (a manual/Arbiter payload we cannot re-enumerate — a safe FN, never a guess),
 *     or when no legal combo avoids the retargeter's own stuff.
 *   - Otherwise DEFLECT: first legal combo (same chosenMode — CR 115.8: a mode is never re-chosen)
 *     none of whose targets is the retargeter or the retargeter's permanent.
 * Both payload.params.targets AND the top-level obj.targets (when present) are rewritten in sync, so
 * resolution (runProgram reads params.targets) and the CR 608.2b fizzle check see the same picture.
 * A target already gone from the stack logs a distinct fizzle line (CR 608.2b), never a silent skip.
 */
function applyRetarget(state, atom, ctx) {
  let next = state;
  const me = ctx?.controller;
  const isMine = (x) => (x?.type === "player" ? x.id === me : x?.controller === me);
  for (const t of ctx?.targets || []) {
    if (t.type !== "spell" && t.type !== "stackAbility") continue;
    const idx = (next.stack || []).findIndex((o) => o.id === t.id);
    if (idx === -1) {
      next = logEvent(next, { kind: "spell-effect", effect: "retarget-fizzle", targetId: t.id });
      continue;
    }
    const obj = next.stack[idx];
    const params = obj.payload?.params;
    const program = params?.program || null;
    const originals = Array.isArray(params?.targets) ? params.targets : [];
    if (!program || originals.length === 0) {
      next = logEvent(next, { kind: "spell-effect", effect: "retarget-decline", targetId: t.id, cardName: obj.source?.name || null, reason: !program ? "no-program" : "no-targets" });
      continue;
    }
    if (!originals.some(isMine)) {
      next = logEvent(next, { kind: "spell-effect", effect: "retarget-decline", targetId: t.id, cardName: obj.source?.name || null, reason: "not-aimed-at-me" });
      continue;
    }
    let combos;
    try { combos = expandCastChoices(next, obj.controller, program) || []; } catch { combos = []; }
    if (params.chosenMode != null) combos = combos.filter((c) => c.chosenMode === params.chosenMode);
    const deflected = combos.find((c) => (c.targets || []).length > 0 && !(c.targets || []).some(isMine));
    if (!deflected) {
      next = logEvent(next, { kind: "spell-effect", effect: "retarget-decline", targetId: t.id, cardName: obj.source?.name || null, reason: "no-safe-combo" });
      continue;
    }
    const newTargets = deflected.targets;
    next = {
      ...next,
      stack: [
        ...next.stack.slice(0, idx),
        { ...obj, ...(Array.isArray(obj.targets) ? { targets: newTargets } : {}), payload: { ...obj.payload, params: { ...params, targets: newTargets } } },
        ...next.stack.slice(idx + 1),
      ],
    };
    next = logEvent(next, {
      kind: "spell-effect", effect: "retarget", targetId: t.id, cardName: obj.source?.name || null, controller: me,
      from: originals.map((x) => x.name || x.id), to: newTargets.map((x) => x.name || x.id),
    });
  }
  return next;
}

/**
 * RIVAZ RIDER — 'it gains "When this creature dies, exile it."' applied to the TRIGGERING CAST SPELL.
 * The grant is recorded on the spell's stack payload (params.grantDiesExile); PERMANENT_ETB threads it
 * onto the permanent exactly like castFromZone, and checkDiesTriggers exiles the card from the graveyard
 * after death processing (the granted trigger is deterministic and choiceless, so it is applied at the
 * dies site rather than as its own stack object — caster-PESSIMAL timing: the dragon exiles
 * unconditionally, which only ever denies its owner recursion, never grants anything extra).
 * The spell already resolved / left the stack → a logged no-op (never a guess at which permanent it became).
 */
function applyGrantDiesExileToCastSpell(state, atom, ctx) {
  const spellId = ctx?.castStackObjectId;
  const idx = spellId ? (state.stack || []).findIndex((o) => o.id === spellId && o.kind === "spell") : -1;
  if (idx === -1) {
    return logEvent(state, { kind: "spell-effect", effect: "grant-dies-exile-fizzle", targetId: spellId || null, controller: ctx?.controller });
  }
  const obj = state.stack[idx];
  const next = {
    ...state,
    stack: [...state.stack.slice(0, idx), { ...obj, payload: { ...obj.payload, params: { ...(obj.payload?.params || {}), grantDiesExile: true } } }, ...state.stack.slice(idx + 1)],
  };
  return logEvent(next, { kind: "spell-effect", effect: "grant-dies-exile", targetId: spellId, cardName: obj.source?.name || null, controller: ctx?.controller });
}

/**
 * COUNTER-THAT-SPELL (SG-13 — Vexing Bauble): counter the spell whose cast fired this trigger. The referent
 * is the trigger context's castStackObjectId; a spell already off the stack (resolved / countered by
 * something else) is a logged no-op (CR 608.2b), never a guess at another object.
 */
function applyCounterCastSpell(state, atom, ctx) {
  const spellId = ctx?.castStackObjectId;
  if (!spellId) return logEvent(state, { kind: "spell-effect", effect: "counter-fizzle", targetId: null, controller: ctx?.controller });
  // CR 603.4's second check (the intervening-if re-evaluated at resolution) is the trigger resolver's job
  // (EFFECT_PROGRAM re-evaluates the bound condition); an UNCONFIRMED (null) condition never reaches this
  // atom natively — the flush routes it to a manual resolution, so an unknown payment never counters.
  // A spell that can't be countered stays (CR 701.6a — counterIfCounterable; 2026-09-30).
  return counterIfCounterable(state, spellId, { via: ctx?.cardName || null });
}

/**
 * COUNTER-THE-TARGETING-OBJECT (stage ③, 2026-09-30 — Shimmering Glasskite, Jetting Glasskite, Glyph Keeper: "Whenever
 * this creature becomes the target of a spell or ability for the first time each turn, counter that spell or ability."):
 * counter the spell OR ability whose target choice fired this trigger — ctx.targetingStackObjectId, threaded by
 * checkBecomesTargetTriggers at all four target-choice sites. The trigger was flushed above that object, so it resolves
 * first (CR 603.3b). An object already off the stack (resolved, or countered by something else — a Kira beside the
 * Glasskite counters synchronously) is a logged no-op (CR 608.2b), never a guess at another object. A SPELL that can't
 * be countered stays on the stack (CR 701.6a — counterIfCounterable, the resolution-time entry every counter path takes).
 * An ability is never uncounterable here, and counterSpellById removes it with no zone change (CR 701.6a).
 */
function applyCounterTargetingObject(state, atom, ctx) {
  const objId = ctx?.targetingStackObjectId ?? null;
  const obj = objId ? (state.stack || []).find((o) => o.id === objId) : null;
  if (!obj) return logEvent(state, { kind: "spell-effect", effect: "counter-fizzle", targetId: objId, controller: ctx?.controller });
  return counterIfCounterable(state, objId, { via: ctx?.cardName || null });
}

/**
 * COPY-ACTIVATED-ABILITY (CAP-BRACERS, 2026-09-03 — CR 707.10): copy the activated ability whose activation fired this
 * trigger. The referent is the trigger context's activatedStackObjectId; the copy is the same stack object under a
 * fresh id, stamped isCopy, controlled by the original's controller, with the original's targets ("you may choose
 * new targets" honoured as a decline — a legal choice; retargeting is a later arm). An ability already off the
 * stack is a logged no-op, never a guess at another object.
 */
function applyCopyActivatedAbility(state, atom, ctx) {
  const abilityId = ctx?.activatedStackObjectId;
  const original = abilityId ? (state.stack || []).find((o) => o.id === abilityId && o.kind === "activated-ability") : null;
  if (!original) return logEvent(state, { kind: "spell-effect", effect: "copy-activated-ability-fizzle", targetId: null, controller: ctx?.controller });
  const { id: copyId, state: s2 } = mintId(state, "stk");
  const copy = { ...original, id: copyId, isCopy: true, payload: { ...original.payload, params: { ...(original.payload?.params || {}) } } };
  const next = { ...s2, stack: [...s2.stack, copy] };
  return logEvent(next, { kind: "copy-ability", controller: original.controller, originalId: abilityId, copyId, sourceName: original.source?.name || null, via: ctx?.cardName || null });
}

/**
 * COPY TARGET ABILITY (SHELF-85 V6, 2026-09-04 — CR 707.10): the CHOSEN-target twin of applyCopyActivatedAbility. The
 * referent is the activation's chosen stack target ({ type: "ability", id }); the copy is the same stack object under
 * a fresh id, stamped isCopy, controlled by the original's controller, with the original's targets ("you may choose
 * new targets" honoured as a decline). A target already off the stack (resolved, countered) is a logged no-op — the
 * ability fizzles under CR 608.2b, never a guess at another object.
 */
function applyCopyTargetAbility(state, atom, ctx) {
  const t = (ctx?.targets || []).find((x) => x?.type === "stackAbility");
  const original = t ? (state.stack || []).find((o) => o.id === t.id && /-ability$/.test(String(o.kind || ""))) : null;
  if (!original) return logEvent(state, { kind: "spell-effect", effect: "copy-ability-fizzle", targetId: t?.id || null, controller: ctx?.controller });
  const { id: copyId, state: s2 } = mintId(state, "stk");
  const copy = { ...original, id: copyId, isCopy: true, payload: { ...original.payload, params: { ...(original.payload?.params || {}) } } };
  const next = { ...s2, stack: [...s2.stack, copy] };
  return logEvent(next, { kind: "copy-ability", controller: original.controller, originalId: original.id, copyId, sourceName: original.source?.name || null, via: ctx?.cardName || null });
}

export const stackResolvers = {
  "copy-ability": applyCopyTargetAbility, // SHELF-85 V6 (Peter Parker's Camera / Strionic Resonator) — copy the CHOSEN stack ability you control
  "copy-activated-ability": applyCopyActivatedAbility, // CAP-BRACERS (Illusionist's Bracers) — copy the ACTIVATED ability the trigger fired on (ctx.activatedStackObjectId)
  "counter-cast-spell": applyCounterCastSpell, // SG-13 (Vexing Bauble) — counter the CAST spell the trigger fired on (ctx.castStackObjectId)
  "counter-targeting-object": applyCounterTargetingObject, // stage ③ (the Glasskites) — counter the spell/ability whose target choice fired the trigger (ctx.targetingStackObjectId)
  retarget: applyRetarget, // ⭐ RETARGET (Deflecting Swat, CR 115.7) — re-pick a stack object's own targets off the live board; decline = keep (CR 115.7d)
  "grant-dies-exile-to-cast-spell": applyGrantDiesExileToCastSpell, // RIVAZ RIDER — stamp the triggering cast spell; the permanent it becomes exiles on death
  "bounce-spell-or-permanent": applyBounceSpellOrPermanent, // VENSER — the STACK∪BATTLEFIELD union bounce ("return target spell or permanent to its owner's hand")
  "copy-spell": applyCopySpell, // STORM (CR 702.40) — copy the storm spell N times (N = spells cast before it this turn)
  "copy-creature-spell": applyCopyCreatureSpell, // COPY-A-CREATURE-SPELL (Double Major, CR 707.10) — a token copy of a chosen own creature spell
  "copy-instant-or-sorcery": applyCopyInstantOrSorcery, // COPY AN INSTANT/SORCERY (Reverberate, CR 707.10) — clones the resolving payload; the copy is no card and goes to no zone
  "cdmg-mass-to-damaged-player": applyCdmgMassToDamagedPlayer, // CDMG-MASS-TO-DAMAGED-PLAYER (Balefire Dragon) — deal the combat-damage amount to each creature the damaged player controls
  "cdmg-to-each-other-opponent": applyCdmgToEachOtherOpponent, // CDMG-TO-EACH-OTHER-OPPONENT (Super State) — deal the combat-damage amount to each opponent EXCEPT the one just combat-damaged
  "optional-mana-payment": applyOptionalManaPayment, // OPTIONAL-MANA-PAYMENT (CR 603.7c) — "you may pay {cost}. if you do, <effect>"
  "optional-sac-payment": applyOptionalSacPayment, // REFLEXIVE-SAC-BY-SUBTYPE (CR 603.7c) — "you may sacrifice a <subtype>. if you do, <effect>"
  "optional-draw-discard": applyOptionalDrawDiscard, // OPTIONAL DRAW-THEN-DISCARD — "you may draw a card. if you do, discard a card."
  "optional-discard-payment": applyOptionalDiscardPayment, // OPTIONAL-DISCARD-PAYMENT (CR 603.7c) — "you may discard a card. if you do, <effect>"
  "optional-exile-self-payment": applyOptionalExileSelfPayment, // OPTIONAL-EXILE-SELF (Undead Butler, CR 603.7) — "you may exile it. when you do, <payoff>" (the dies self-exile cost)
  "sac-unless-pay": applyUpkeepSacUnlessPay, // UPKEEP-SAC-UNLESS-PAY (echo-without-the-keyword) — "sacrifice this <noun> unless you pay {cost}"
  "cumulative-upkeep": applyCumulativeUpkeep, // CUMULATIVE UPKEEP (CR 702.24) — add age counter, pay {cost}×age-counters or sacrifice (Mystic Remora)
  "echo": applyEcho, // ECHO (EC-1, CR 702.30) — the one-time first-upkeep pay-or-sacrifice (echoDone-stamped)
  "taxed-draw": applyTaxedDraw, // OPPONENT-PAYS-TO-DENY (CR 603.7c) — "you may draw a card unless that player pays {N}" (Rhystic Study)
  "taxed-lose-life": applyTaxedLoseLife, // SHELF-85 N7 — "that player loses N life unless they pay {M}" (Phyrexian Tyranny)
  "taxed-edict": applyTaxedEdict, // stage ③ (2026-09-30) — "each opponent sacrifices a permanent of their choice unless they pay {N}" (the Rishadan pirates)
  "lose-life-unless-discard": applyLoseLifeUnlessDiscard, // SHELF-85 N6 — "that player loses N life unless they discard a card" (Painful Quandary)
  "taxed-treasure": applyTaxedTreasure, // OPPONENT-PAYS-TO-DENY (CR 603.7c) — "an opponent draws → that player may pay {N}, else you create a Treasure" (Smothering Tithe)
  "source-power-fanout": applySourcePowerFanout, // SOURCE-POWER-FANOUT (Chandra's Ignition) — chosen creature deals its power to each other creature + each opponent
  // SYMMETRIC SELF-DAMAGE (CR 119.3) — Rakdos Charm's "Each creature deals 1 damage to its controller".
  // Each creature is the SOURCE of its own damage packet (threaded as source.id), which is what keeps
  // lifelink/infect on those creatures behaving correctly rather than attributing every packet to the spell.
  // The battlefield is snapshot per player before the loop: damage here only ever hits PLAYERS, so no
  // creature can leave mid-loop, but the snapshot keeps the iteration independent of state rebuilding.
  // Layer-aware creature-ness (CR 613) so an animated permanent deals its point too.
  "each-creature-damages-controller": (state, atom, ctx) => {
    let next = state;
    for (const pid of Object.keys(next.players || {})) {
      for (const perm of [...(next.players[pid]?.battlefield || [])]) {
        if (!(isCreatureCard(perm.card) || permanentIsCreature(next, perm.id))) continue;
        next = applyDamageEffect(next, {
          controller: ctx.controller, amount: atom.amount, targetType: "player",
          targets: [{ type: "player", id: pid }], source: { id: perm.id },
        });
      }
    }
    return logEvent(next, { kind: "spell-effect", effect: "each-creature-damages-controller", amount: atom.amount, controller: ctx.controller });
  },
  "deal-damage": (state, atom, ctx) => {
    // KW-POISON: thread the SOURCE permanent (ctx.sourceId, set for activated/triggered abilities) so an
    // infect/wither source's non-combat damage routes to -1/-1 counters / poison in applyDamageEffect.
    // MASS-FILTERED-DAMAGE: thread atom.restrictions so an eachCreature wipe can be flying-filtered.
    // EXILE-IF-DIES (subsystem 3): thread atom.exileIfWouldDie so the damaged creature is marked for the
    // dies→exile replacement (Lava Coil / Magma Spray).
    // DEFENDING-PLAYER (attacks trigger, CR 509.1a): the target is NOT chosen — it's the attacked player,
    // ctx.defenderId (set by checkAttackTriggers). Synthesize the single player target here; an absent
    // defenderId (any non-attacks event) yields NO target → 0 damage dealt (a clean no-op — the referent
    // gate keeps this atom off non-attacks events anyway, so this is belt-and-braces).
    // DAMAGED-PLAYER (Sword of War and Peace): same synthesis off ctx.damagedPlayerId (set by
    // checkCombatDamageTriggers) — absent id (non-combat-damage event) -> no target -> 0 damage (a clean
    // no-op; the who:"damagedPlayer" referent gate keeps the atom off those events anyway).
    // TRIG-PRONOUN damage (BLITZ IE-1 — "deals N damage to that creature"): the referent is the trigger's
    // OTHER creature (ctx.triggeringPermanentId — the pair partner checkBlockTriggers threads), never a
    // chosen target. Gone by resolution → no target → 0 dealt (a clean no-op, CR 608.2b-adjacent).
    // UPKEEP-PLAYER (BLITZ TR-2 — Copper Tablet): same synthesis off ctx.upkeepPlayerId (set by
    // checkStepTriggers at every upkeep-step entry) — absent id (any non-upkeep event) → no target →
    // 0 dealt (a clean no-op; the who:"upkeepPlayer" referent gate keeps the atom off those events anyway).
    const targets = atom.target === "thatCreature"
      ? (ctx.triggeringPermanentId && findPermanent(state, ctx.triggeringPermanentId) ? [{ type: "creature", id: ctx.triggeringPermanentId }] : [])
      : atom.target === "you"
        ? (state.players?.[ctx.controller] ? [{ type: "player", id: ctx.controller }] : [])
        : atom.target === "upkeepPlayer"
          ? (ctx.upkeepPlayerId && state.players?.[ctx.upkeepPlayerId] ? [{ type: "player", id: ctx.upkeepPlayerId }] : [])
          // CASTING-PLAYER (TP-1 — Eidolon of the Great Revel): same synthesis off ctx.castingPlayerId, which
          // checkCastTriggers already threads. Absent referent -> EMPTY target list -> 0 dealt, never a
          // guessed victim; the who:"castingPlayer" routing pin keeps the atom off non-cast events anyway.
          : atom.target === "castingPlayer"
            ? (ctx.castingPlayerId && state.players?.[ctx.castingPlayerId] ? [{ type: "player", id: ctx.castingPlayerId }] : [])
          : atom.target === "drawingPlayer"
            ? (ctx.drawingPlayerId && state.players?.[ctx.drawingPlayerId] ? [{ type: "player", id: ctx.drawingPlayerId }] : [])
          : atom.targetType === "defendingPlayer"
            ? (ctx.defenderId && state.players?.[ctx.defenderId] ? [{ type: "player", id: ctx.defenderId }] : [])
            : atom.targetType === "damagedPlayer"
              ? (ctx.damagedPlayerId && state.players?.[ctx.damagedPlayerId] ? [{ type: "player", id: ctx.damagedPlayerId }] : [])
              // DISCARDING-PLAYER (Megrim, CR 701.9a): same synthesis off ctx.discardingPlayerId (set by
              // checkDiscardTriggers) — absent id (any non-discard event) → no target → 0 dealt (a clean
              // no-op; the referent gate keeps the atom off those events anyway).
              : atom.targetType === "discardingPlayer"
                ? (ctx.discardingPlayerId && state.players?.[ctx.discardingPlayerId] ? [{ type: "player", id: ctx.discardingPlayerId }] : [])
                // THE PLAYER OR PLANESWALKER IT'S ATTACKING (stage ③ · 25): the attacked planeswalker when the attack was on
                // one — nothing if it has left the battlefield, never its controller instead — else the defending player.
                : atom.targetType === "attackedDefender"
                  ? (ctx.defenderPlaneswalkerId
                    ? (findPermanent(state, ctx.defenderPlaneswalkerId) ? [{ type: "planeswalker", id: ctx.defenderPlaneswalkerId }] : [])
                    : (ctx.defenderId && state.players?.[ctx.defenderId] ? [{ type: "player", id: ctx.defenderId }] : []))
                  : ctx.targets;
    // defendingPlayer/damagedPlayer/thatCreature/you/upkeepPlayer resolve via `targets`, not the special targetType
    // switch in applyDamageEffect — pass a bare targetType so each takes the per-target hitPlayer/hitCreature path.
    const targetType = atom.target === "thatCreature" ? "creature"
      : (atom.target === "you" || atom.target === "upkeepPlayer") ? "player"
      // ⚠️ discardingPlayer is NOT load-bearing here today — mutation-verified: removing it breaks nothing,
      // because an unrecognized targetType already falls through applyDamageEffect's switch to the same
      // per-target path. It stays because that is correctness by ACCIDENT: the moment the switch grows a
      // case for an unknown type, or its default changes, Megrim would silently deal 0. Declared beside its
      // siblings, this arm is correct by construction instead.
      : (atom.targetType === "defendingPlayer" || atom.targetType === "damagedPlayer" || atom.targetType === "discardingPlayer") ? "player"
      : atom.targetType === "attackedDefender" ? "playerOrPlaneswalker" : atom.targetType;
    let next = applyDamageEffect(state, { controller: ctx.controller, amount: resolveScaledAmount(state, atom, ctx), targetType, amountPerOpponent: atom.amountPerOpponent ?? null, targets, source: { id: ctx.sourceId }, restrictions: atom.restrictions, exileIfWouldDie: atom.exileIfWouldDie });
    // LACCOLITH RIDER (④-AU — "If you do, this creature assigns no combat damage this turn"): the optional damage was
    // taken (a declined "may" never reaches this resolver), so the SOURCE is stamped for the current turn; the combat
    // damage step's dealsThisStep gate reads the stamp. A source already gone is a clean no-op (updatePermanentSafe).
    if (atom.sourceAssignsNoCombatDamage && ctx.sourceId) {
      next = updatePermanentSafe(next, ctx.sourceId, (p) => ({ ...p, noCombatDamageTurn: state.turn }));
    }
    // SELF-HIT (BLITZ OA-1 — Orcish Artillery "and M damage to you"): the printed self-hit lands on the
    // CONTROLLER through the same primitive, after the target damage (one sentence, resolved in print
    // order). Never conditional on the target damage landing — the sentence deals both unconditionally.
    if (atom.selfDamage > 0 && next.players?.[ctx.controller]) {
      next = applyDamageEffect(next, { controller: ctx.controller, amount: atom.selfDamage, targetType: "player", targets: [{ type: "player", id: ctx.controller }], source: { id: ctx.sourceId } });
    }
    return next;
  },
  "counter": applyCounter,
  // GRANT UNCOUNTERABILITY (Vexing Shusher) -- stamp the targeted stack object so the counter-target
  // enumerator skips it. The mark rides the STACK OBJECT, not the card: two copies of the same spell on
  // the stack are separate objects and only the targeted one is protected, and a card that resolves and
  // is later re-cast is a new object with no mark (CR 701.6a is about the object on the stack).
  // The kind is re-verified here (CR 608.2b): the targeted spell may have already resolved or been
  // countered in response, in which case this fizzles rather than marking some unrelated stack object.
  // NEXT-SPELL UNCOUNTERABLE (Mistrise Village) — arm the controller's per-turn flag; the cast chokepoint
  // consumes it (see nextSpellUncounterableClauseParser). Idempotent: arming twice is one shield.
  "next-spell-uncounterable": (state, atom, ctx) => {
    const p = state.players?.[ctx.controller];
    if (!p) return state;
    const armed = { ...state, players: { ...state.players, [ctx.controller]: { ...p, nextSpellUncounterable: true } } };
    return logEvent(armed, { kind: "spell-effect", effect: "next-spell-uncounterable", controller: ctx.controller });
  },
  "make-uncounterable": (state, atom, ctx) => {
    let next = state;
    for (const t of ctx.targets || []) {
      if (t.type !== "spell") continue;
      const idx = (next.stack || []).findIndex((o) => o.id === t.id && o.kind === "spell");
      if (idx === -1) {
        next = logEvent(next, { kind: "spell-effect", effect: "make-uncounterable-fizzle", targetId: t.id });
        continue;
      }
      const obj = next.stack[idx];
      if (obj.uncounterable) continue;   // already marked -> idempotent, and no duplicate log line
      next = {
        ...next,
        stack: [...next.stack.slice(0, idx), { ...obj, uncounterable: true }, ...next.stack.slice(idx + 1)],
      };
      next = logEvent(next, { kind: "spell-effect", effect: "make-uncounterable", targetId: t.id, cardName: obj.source?.name });
    }
    return next;
  },
  // STIFLE-CLASS (CR 701.6a) — countering an ABILITY removes it from the stack and it simply does not
  // resolve. Unlike a countered SPELL there is no card and therefore no graveyard move: an ability is not
  // an object that exists anywhere else, so removing the stack entry IS the whole effect.
  // The kind is re-verified at resolution (CR 608.2b): the targeted ability may have already resolved or
  // been countered in response, in which case this fizzles rather than removing some unrelated stack object.
  "counter-spell-or-ability": (state, atom, ctx) => { // NOT OF THIS WORLD (KT-9b): dispatch on the chosen object's kind
    let next = state;
    for (const t of ctx.targets || []) {
      const obj = (next.stack || []).find((o) => o.id === t.id);
      if (!obj) { next = logEvent(next, { kind: "spell-effect", effect: "counter-fizzle", targetId: t.id }); continue; }
      if (obj.kind === "spell") {
        next = stackResolvers["counter"](next, { op: "counter", spellFilter: "any", targetType: "spell" }, { ...ctx, targets: [{ ...t, type: "spell" }] });
      } else {
        next = stackResolvers["counter-ability"](next, { op: "counter-ability", targetType: "stackAbility" }, { ...ctx, targets: [{ ...t, type: "stackAbility" }] });
      }
    }
    return next;
  },
  "counter-ability": (state, atom, ctx) => {
    let next = state;
    const kinds = new Set(atom.abilityKinds || ["activated-ability", "triggered-ability"]);
    for (const t of ctx.targets || []) {
      if (t.type !== "stackAbility") continue;
      const obj = (next.stack || []).find((o) => o.id === t.id && kinds.has(o.kind));
      if (!obj) {
        next = logEvent(next, { kind: "spell-effect", effect: "counter-ability-fizzle", targetId: t.id });
        continue;
      }
      next = { ...next, stack: next.stack.filter((o) => o.id !== t.id) };
      next = logEvent(next, { kind: "spell-effect", effect: "counter-ability", targetId: t.id, abilityKind: obj.kind, source: obj.source?.name || null, controller: ctx.controller });
    }
    return next;
  },
  "self-attach": applySelfAttach, // ETB-EQUIP-ATTACH — auto-attach an Equipment to a creature you control
  "attach-to-self": applyAttachToSelf, // EQUIP-AUTO-ATTACH — attach a chosen Equipment you control onto the source creature
  "attach-source-to-triggering": applyAttachSourceToTriggering, // ATTACH-ON-ENTER AURAS — the source Aura onto the creature whose entering fired the trigger
  "attach-pair": applyAttachPair, // ATTACH-PAIR (CAP16) — attach a chosen Aura/Equipment onto a chosen creature (neither is the source)
};
