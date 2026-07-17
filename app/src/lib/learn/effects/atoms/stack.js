/**
 * effects/atoms/stack.js — stack / damage / attach atoms (counter, self-attach, deal-damage).
 * Imports applyControllerRider from removal.js (DAG: removal <- stack) for the soft-counter rider.
 */

import { applyDamageEffect } from "../../spellEffects.js";
import { logEvent, attachPermanent, findPermanent, creaturePower, opponentsOf, mintId, createStackObject, addCounter, recordGraveyardEvents, updatePermanentSafe } from "../../gameState.js";
import { setPendingSoftCounterChoice, setPendingOptionalManaPaymentChoice, setPendingOptionalSacBySubtypeChoice, setPendingOptionalDrawDiscardChoice, setPendingOptionalDiscardPaymentChoice, setPendingSacUnlessPayChoice, setPendingTaxedPaymentChoice } from "../../pendingChoice.js";
import { resolveScaledAmount, countForSpec, isCreatureCard } from "./shared.js";
import { applyControllerRider } from "./removal.js";
import { parseCountSource } from "../parseHelpers.js"; // seam batch 15: shared count-source parser (leaf, cycle-free) for dealDamageScaledClauseParser
import { expandCastChoices } from "../targeting.js"; // STORM-COPY-TARGET: re-enumerate a fresh legal target per copy (CR 707.10c). targeting.js is cycle-safe from here (its closure reaches neither atoms/stack nor parser).
import { snapshotCopiedCard } from "../../cloneCopy.js"; // COPY-A-CREATURE-SPELL (Double Major, CR 707.2): the chosen creature spell's copiable card. cloneCopy is a pure leaf (imports only gameState) — cycle-safe.
import { checkCopyTriggers } from "../../triggers.js"; // MAGECRAFT COPY HALF (BLITZ MC-1, CR 707.10): fire "cast or copy" watchers at the copy-creation site. Cycle-safe — triggers.js's import closure (targeting→spellEffects→triggers, layers, keywords, saga, triggerScheduler) never reaches atoms/stack.js, so this edge adds no cycle; checkCopyTriggers is called only at runtime.

/**
 * P3.1 counter (CR 701.5a) — counter the target spell(s) on the stack. The targeted
 * spell is removed from the stack and put into its controller's graveyard WITHOUT
 * resolving: no atoms run, no permanent enters, no effect, no triggers. This is the
 * stack-removal mechanic — the FIRST atom that mutates the stack rather than the
 * battlefield/players.
 *
 * Fail-safe (CR 608.2b): if the target already left the stack (it resolved, or a
 * higher counter got it first), the counter fizzles for that target — a logged no-op,
 * never an error, never a fabricated effect. A defensive re-check of the SPELL-TYPE
 * filter (creature/noncreature) runs here (it held at cast time + a spell's type can't
 * change on the stack). The on-card "can't be countered" exclusion (CR 701.5e) is
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
  // SOFT-COUNTER-RIDER — Swan Song's 3-way filter (mirrors spellMatchesCounterFilter for enumeration).
  if (filter === "enchantmentInstantSorcery") return /\b(?:Enchantment|Instant|Sorcery)\b/.test(type);
  // CNT-ACP (WAVE 2b) — Strix Serenade's 3-way "artifact, creature, or planeswalker" union (front-face).
  if (filter === "artifactCreaturePlaneswalker") return /\b(?:Artifact|Creature|Planeswalker)\b/.test(type);
  return true; // "any"
}
// CNT-ZONE-REDIRECT (CROSS-COUNTER) — the zone a countered SPELL is put into (CR 701.5a + the card's "instead
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
 * Counter the spell — or ABILITY — with id `spellId` on the stack (CR 701.5a): remove it from the stack,
 * logging the counter (an optional `via` tag, e.g. "soft-counter", records HOW). A SPELL goes to its
 * controller's graveyard by default, or to the zone named by `counterDest` ("exile"/"hand"/"library-top" —
 * the CNT-ZONE-REDIRECT riders: Deny Existence / Remand / Memory Lapse); a countered ACTIVATED/TRIGGERED
 * ABILITY is not a card and goes to no zone — it simply leaves the stack and ceases to exist (CR 701.5a). An
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
  const dest = counterDest || (exileInstead ? "exile" : "graveyard"); // exileInstead → counterDest:"exile" alias
  let next = {
    ...state,
    stack: newStack,
    players: (isSpell && player)
      ? { ...state.players, [controller]: placeCounteredCard(player, card, dest) }
      : state.players,
  };
  // GY-EVENT (SHELF S7): a countered SPELL whose disposition is the default graveyard enters it from the
  // stack (CR 701.5a). A redirected disposition (exile / hand / library-top) never touches a graveyard.
  if (isSpell && player && dest === "graveyard" && card) {
    next = recordGraveyardEvents(next, [{ dir: "enter", card, gyOwner: controller, zone: "stack" }]);
  }
  // Log the destination (`dest`) for any non-graveyard zone; keep the legacy `exiled:true` flag for the exile
  // case so existing log assertions stay green (back-compat with CNT-EXILE-INSTEAD's original log shape).
  return logEvent(next, { kind: "spell-effect", effect: "counter", targetId: spellId, cardName: card?.name, controller, ...(dest !== "graveyard" && { dest }), ...(dest === "exile" && { exiled: true }), ...(via && { via }) });
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
    if ((atom.unlessPay != null || atom.unlessPayX || atom.unlessPayCount) && !next.pendingChoice) {
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
    // Fracture's draw go to whoever's spell was countered, not the caster). The rider only fires when the counter
    // actually happens (a fizzle above skips it).
    const riderController = targetObj.controller;
    next = counterSpellById(next, t.id, { exileInstead: !!atom.exileInstead, counterDest: atom.counterDest || null });
    if (atom.controllerRider && next.players?.[riderController]) {
      next = applyControllerRider(next, atom.controllerRider, { controller: riderController, power: 0 }, ctx);
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
  if (!ctx.sourceId) return state;
  let next = state;
  for (const t of ctx.targets || []) {
    if (!t?.id) continue;
    next = attachPermanent(next, { equipId: ctx.sourceId, targetId: t.id });
    next = logEvent(next, { kind: "spell-effect", effect: "equip-attach", equipId: ctx.sourceId, targetId: t.id, controller: ctx.controller });
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
  // LEGENDARY variant (Mithril Coat, Mjölnir, Storm Hammer): "attach it to target LEGENDARY creature you control".
  // Same self-attach atom + a supertype:legendary target restriction (creatureSatisfiesRestrictions enforces it,
  // so the trigger enumerates ONLY the controller's legendary creatures — a non-legendary board → clean no-op).
  if (/^attach it to target legendary creature you control$/.test(t)) {
    return { op: "self-attach", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }, { kind: "supertype", value: "legendary" }] };
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
    "target player or planeswalker": "playerOrPlaneswalker",
    "target creature or planeswalker": "creatureOrPlaneswalker", "each opponent": "eachOpponent",
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
  // OLD word order: "<source> deals damage TO <target> equal to the number of <count>" (Massive Raid, Spitting Earth).
  const mds = t.match(/^.+? deals? damage to (.+?) equal to the number of (.+)$/);
  if (mds) return build(mds[1], mds[2]);
  // DMG-SCALE-2 — MODERN word order: "<source> deals damage equal to the number of <count> TO <target>"
  // (Cabaretti Charm, Coordinated Maneuver, Bumi Bash modes). The count is non-greedy so the FIRST " to
  // <allowlisted target>" wins; a multi-count ("…plus the number of Equipment…", Slash of Light) or an
  // unmodeled count → parseCountSource null → low → Arbiter. Emits the SAME amountCount atom (resolver shared).
  const mds2 = t.match(/^.+? deals? damage equal to the number of (.+?) to (target creature|any target|target player|target player or planeswalker|target creature or planeswalker|each opponent)$/);
  if (mds2) return build(mds2[2], mds2[1]);
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
  const mds3 = t.match(/^.+? deals? x damage to (target creature|any target|target player|target player or planeswalker|target creature or planeswalker|each opponent),? where x is (?:equal to )?the number of (.+)$/);
  if (mds3) {
    const targetType = TT[mds3[1]];
    const amountCount = parseCountSource(mds3[2]);
    return targetType && amountCount ? { op: "deal-damage", targetType, amountCount } : null;
  }
  return null;
}

/**
 * COUNTER clause parser (CR 701.5a) — co-extracted from parseExtendedAtom (seam batch 28 / Wave C, RIDER-FOLDING).
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
  if (/^counter target spell$/.test(t)) return { op: "counter", spellFilter: "any", targetType: "spell" };
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
 * MASS-FILTERED-DAMAGE clause parser — "<source> deals N damage to each creature <filter>" where the filter
 * is with|without flying (Gale Force / Seismic Shudder) OR you control | your opponents control (Blazing
 * Volley, Scouring Sands). Reuses the eachCreature deal-damage path + a restriction (hasKeyword / controller)
 * that creatureSatisfiesRestrictions filters the mass set with (layer-aware). Whole-clause anchored — a "and
 * each player" / kicker / flashback / threshold rider fails the `$` → low → Arbiter (FN-safe). Registered
 * via registerClauseParser in parser.js.
 */
export function massFilteredDamageClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
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
  const ud = t.match(/^(?:this creature|this permanent|this artifact|this enchantment|it) deals (\d+) damage to the upkeep player$/);
  if (ud) return { op: "deal-damage", amount: parseInt(ud[1], 10), target: "upkeepPlayer", who: "upkeepPlayer", targetType: null };
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
  if (!lk || !isCreatureCard(lk.permanent.card)) {
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
function applyOptionalManaPayment(state, atom, ctx) {
  if (state.pendingChoice) return state; // FIFO — one choice at a time (belt-and-braces; setter re-guards)
  return setPendingOptionalManaPaymentChoice(state, {
    controller: ctx.controller,
    cost: atom.cost,
    effectAtoms: atom.effectAtoms || [],
    sourceName: ctx.cardName || null,
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

// OPTIONAL DRAW-THEN-DISCARD — "you may draw a card. If you do, discard a card." Suspend on the yes/no; the
// [draw, discard] payoff rides on the pause for the settle (resolveOptionalDrawDiscardChoice runs it on yes).
function applyOptionalDrawDiscard(state, atom, ctx) {
  if (state.pendingChoice) return state; // FIFO — one choice at a time
  return setPendingOptionalDrawDiscardChoice(state, {
    controller: ctx.controller,
    effectAtoms: atom.effectAtoms || [],
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
  const available = !!(player?.hand || []).some((c) => !c.token);
  return setPendingOptionalDiscardPaymentChoice(state, {
    controller: ctx.controller,
    available,
    effectAtoms: atom.effectAtoms || [],
    sourceName: ctx.cardName || null,
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
  return setPendingTaxedPaymentChoice(state, {
    payer,
    beneficiary: ctx.controller,
    cost: atom.cost,
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
  return setPendingSacUnlessPayChoice(state, {
    controller: ctx.controller,
    cost: atom.cost,
    sourceId: ctx.sourceId ?? null,
    sourceName: ctx.cardName || null,
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

export const stackResolvers = {
  "copy-spell": applyCopySpell, // STORM (CR 702.40) — copy the storm spell N times (N = spells cast before it this turn)
  "copy-creature-spell": applyCopyCreatureSpell, // COPY-A-CREATURE-SPELL (Double Major, CR 707.10) — a token copy of a chosen own creature spell
  "cdmg-mass-to-damaged-player": applyCdmgMassToDamagedPlayer, // CDMG-MASS-TO-DAMAGED-PLAYER (Balefire Dragon) — deal the combat-damage amount to each creature the damaged player controls
  "cdmg-to-each-other-opponent": applyCdmgToEachOtherOpponent, // CDMG-TO-EACH-OTHER-OPPONENT (Super State) — deal the combat-damage amount to each opponent EXCEPT the one just combat-damaged
  "optional-mana-payment": applyOptionalManaPayment, // OPTIONAL-MANA-PAYMENT (CR 603.7c) — "you may pay {cost}. if you do, <effect>"
  "optional-sac-payment": applyOptionalSacPayment, // REFLEXIVE-SAC-BY-SUBTYPE (CR 603.7c) — "you may sacrifice a <subtype>. if you do, <effect>"
  "optional-draw-discard": applyOptionalDrawDiscard, // OPTIONAL DRAW-THEN-DISCARD — "you may draw a card. if you do, discard a card."
  "optional-discard-payment": applyOptionalDiscardPayment, // OPTIONAL-DISCARD-PAYMENT (CR 603.7c) — "you may discard a card. if you do, <effect>"
  "sac-unless-pay": applyUpkeepSacUnlessPay, // UPKEEP-SAC-UNLESS-PAY (echo-without-the-keyword) — "sacrifice this <noun> unless you pay {cost}"
  "cumulative-upkeep": applyCumulativeUpkeep, // CUMULATIVE UPKEEP (CR 702.24) — add age counter, pay {cost}×age-counters or sacrifice (Mystic Remora)
  "echo": applyEcho, // ECHO (EC-1, CR 702.30) — the one-time first-upkeep pay-or-sacrifice (echoDone-stamped)
  "taxed-draw": applyTaxedDraw, // OPPONENT-PAYS-TO-DENY (CR 603.7c) — "you may draw a card unless that player pays {N}" (Rhystic Study)
  "taxed-treasure": applyTaxedTreasure, // OPPONENT-PAYS-TO-DENY (CR 603.7c) — "an opponent draws → that player may pay {N}, else you create a Treasure" (Smothering Tithe)
  "source-power-fanout": applySourcePowerFanout, // SOURCE-POWER-FANOUT (Chandra's Ignition) — chosen creature deals its power to each other creature + each opponent
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
          : atom.targetType === "defendingPlayer"
            ? (ctx.defenderId && state.players?.[ctx.defenderId] ? [{ type: "player", id: ctx.defenderId }] : [])
            : atom.targetType === "damagedPlayer"
              ? (ctx.damagedPlayerId && state.players?.[ctx.damagedPlayerId] ? [{ type: "player", id: ctx.damagedPlayerId }] : [])
              : ctx.targets;
    // defendingPlayer/damagedPlayer/thatCreature/you/upkeepPlayer resolve via `targets`, not the special targetType
    // switch in applyDamageEffect — pass a bare targetType so each takes the per-target hitPlayer/hitCreature path.
    const targetType = atom.target === "thatCreature" ? "creature"
      : (atom.target === "you" || atom.target === "upkeepPlayer") ? "player"
      : (atom.targetType === "defendingPlayer" || atom.targetType === "damagedPlayer") ? "player" : atom.targetType;
    let next = applyDamageEffect(state, { controller: ctx.controller, amount: resolveScaledAmount(state, atom, ctx), targetType, targets, source: { id: ctx.sourceId }, restrictions: atom.restrictions, exileIfWouldDie: atom.exileIfWouldDie });
    // SELF-HIT (BLITZ OA-1 — Orcish Artillery "and M damage to you"): the printed self-hit lands on the
    // CONTROLLER through the same primitive, after the target damage (one sentence, resolved in print
    // order). Never conditional on the target damage landing — the sentence deals both unconditionally.
    if (atom.selfDamage > 0 && next.players?.[ctx.controller]) {
      next = applyDamageEffect(next, { controller: ctx.controller, amount: atom.selfDamage, targetType: "player", targets: [{ type: "player", id: ctx.controller }], source: { id: ctx.sourceId } });
    }
    return next;
  },
  "counter": applyCounter,
  "self-attach": applySelfAttach, // ETB-EQUIP-ATTACH — auto-attach an Equipment to a creature you control
  "attach-to-self": applyAttachToSelf, // EQUIP-AUTO-ATTACH — attach a chosen Equipment you control onto the source creature
};
