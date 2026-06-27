/**
 * effects/atoms/stack.js — stack / damage / attach atoms (counter, self-attach, deal-damage).
 * Imports applyControllerRider from removal.js (DAG: removal <- stack) for the soft-counter rider.
 */

import { applyDamageEffect } from "../../spellEffects.js";
import { logEvent, attachPermanent } from "../../gameState.js";
import { setPendingSoftCounterChoice } from "../../pendingChoice.js";
import { resolveScaledAmount } from "./shared.js";
import { applyControllerRider } from "./removal.js";
import { parseCountSource } from "../parseHelpers.js"; // seam batch 15: shared count-source parser (leaf, cycle-free) for dealDamageScaledClauseParser

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
const counterMvOk = (card, atom) =>
  atom == null || atom.exactMv == null || (card?.cmc ?? card?.mana_value ?? 0) === atom.exactMv;
export function counterFilterMatches(card, filter, atom = null) {
  const type = counterTypeLine(card);
  if (!counterMvOk(card, atom)) return false; // CNT-MV-EXACT — fails the MV test → not a legal counter target
  if (filter === "noncreature") return !/Creature/.test(type);
  if (filter === "creature") return /Creature/.test(type);
  // SOFT-COUNTER-RIDER — Swan Song's 3-way filter (mirrors spellMatchesCounterFilter for enumeration).
  if (filter === "enchantmentInstantSorcery") return /\b(?:Enchantment|Instant|Sorcery)\b/.test(type);
  // CNT-ACP (WAVE 2b) — Strix Serenade's 3-way "artifact, creature, or planeswalker" union (front-face).
  if (filter === "artifactCreaturePlaneswalker") return /\b(?:Artifact|Creature|Planeswalker)\b/.test(type);
  return true; // "any"
}
/**
 * Counter the spell — or ABILITY — with id `spellId` on the stack (CR 701.5a): remove it from the stack,
 * logging the counter (an optional `via` tag, e.g. "soft-counter", records HOW). A SPELL goes to its
 * controller's graveyard (or exile, exileInstead); a countered ACTIVATED/TRIGGERED ABILITY is not a card
 * and goes to no zone — it simply leaves the stack and ceases to exist (CR 701.5a). An object no longer on
 * the stack (left mid-resolution) is a logged fizzle, never an error. Shared by the hard counter
 * (applyCounter) AND the SOFT-CNT pay-decline path (runProgram.resolveSoftCounterChoice — KW-WARD-PR2 also
 * routes a warded ABILITY here) so the paths can't drift.
 */
export function counterSpellById(state, spellId, { via = null, exileInstead = false } = {}) {
  const idx = (state.stack || []).findIndex((o) => o.id === spellId);
  if (idx === -1) return logEvent(state, { kind: "spell-effect", effect: "counter-fizzle", targetId: spellId });
  const targetObj = state.stack[idx];
  const card = targetObj.source;
  const controller = targetObj.controller;
  const isSpell = targetObj.kind === "spell"; // an ability is not a card → no zone change on counter
  const newStack = [...state.stack.slice(0, idx), ...state.stack.slice(idx + 1)];
  const player = state.players[controller];
  // CNT-EXILE-INSTEAD (WAVE 2b) — Deny Existence et al. route the countered spell to its owner's EXILE zone
  // instead of the graveyard (CR 701.5a + the card's "exile it instead" rider). Otherwise it's the graveyard.
  const next = {
    ...state,
    stack: newStack,
    players: (isSpell && player)
      ? { ...state.players, [controller]: exileInstead
          ? { ...player, exile: [...(player.exile || []), card] }
          : { ...player, graveyard: [...player.graveyard, card] } }
      : state.players,
  };
  return logEvent(next, { kind: "spell-effect", effect: "counter", targetId: spellId, cardName: card?.name, controller, ...(exileInstead && { exiled: true }), ...(via && { via }) });
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
    if ((atom.unlessPay != null || atom.unlessPayX) && !next.pendingChoice) {
      const amount = atom.unlessPayX ? Math.max(0, ctx.xValue || 0) : atom.unlessPay;
      return setPendingSoftCounterChoice(next, {
        controller: targetObj.controller,
        amount,
        spellId: t.id,
        spellName: card?.name || null,
        sourceName: ctx.cardName || null,
      });
    }
    // SOFT-COUNTER-RIDER — capture the COUNTERED spell's controller, counter it (CNT-EXILE-INSTEAD routes it to
    // exile not the graveyard), then apply the rider to THAT player (An Offer's Treasures / Swan Song's Bird go
    // to whoever's spell was countered, not the caster). The rider only fires when the counter actually happens
    // (a fizzle above skips it).
    const riderController = targetObj.controller;
    next = counterSpellById(next, t.id, { exileInstead: !!atom.exileInstead });
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
  const mds = t.match(/^.+? deals? damage to (.+?) equal to the number of (.+)$/);
  if (mds) {
    const TT = {
      "any target": "any", "target creature": "creature", "target player": "player",
      "target player or planeswalker": "playerOrPlaneswalker",
      "target creature or planeswalker": "creatureOrPlaneswalker", "each opponent": "eachOpponent",
    };
    const targetType = TT[mds[1].trim()];
    const amountCount = parseCountSource(mds[2], { allowTarget: true });
    if (!targetType || !amountCount) return null;
    if (amountCount.who === "target" && targetType !== "player" && targetType !== "playerOrPlaneswalker") return null;
    return { op: "deal-damage", targetType, amountCount };
  }
  return null;
}

export const stackResolvers = {
  "deal-damage": (state, atom, ctx) =>
    // KW-POISON: thread the SOURCE permanent (ctx.sourceId, set for activated/triggered abilities) so an
    // infect/wither source's non-combat damage routes to -1/-1 counters / poison in applyDamageEffect.
    applyDamageEffect(state, { controller: ctx.controller, amount: resolveScaledAmount(state, atom, ctx), targetType: atom.targetType, targets: ctx.targets, source: { id: ctx.sourceId } }),
  "counter": applyCounter,
  "self-attach": applySelfAttach, // ETB-EQUIP-ATTACH — auto-attach an Equipment to a creature you control
  "attach-to-self": applyAttachToSelf, // EQUIP-AUTO-ATTACH — attach a chosen Equipment you control onto the source creature
};
