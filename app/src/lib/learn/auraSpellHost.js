/**
 * auraSpellHost.js — WHAT AN AURA SPELL TARGETS WHEN NO MODELED LANE CASTS IT (2026-10-17).
 *
 * "An Aura spell requires a target, which is defined by its enchant ability." (CR 303.4a) "Aura spells are always targeted. … The
 * target is chosen as the spell is cast" (CR 115.1b, 601.2c), and the enchant ability restricts what an Aura spell can target
 * (CR 702.5a). The modeled Aura lanes each offer one cast per legal target and resolve through AURA_ETB (legalChoices /
 * actionDispatcher): Animate Dead, the native and Ordeal Auras, the mana-boost Auras, the granted-ability Auras, and every Aura
 * that enchants a player. Every other Aura — 600-odd cards whose text the engine doesn't fully model, 420-odd of them "Enchant
 * creature" — fell to the plain no-target permanent cast: offered with NO target, cast that way by the AI, routed to the Arbiter
 * no-op, and gone from every zone when it resolved.
 *
 * Such an Aura is now cast like the rest: one cast per legal host, resolving through AURA_ETB onto that host, where its unmodeled
 * text stays inert — the body-only posture every permanent in the trunk takes, and the one an Aura put onto the battlefield
 * without being cast already had (auraEntry.js). Its tier doesn't move: an Aura attached with its text inert is not a modeled
 * one. Read off the face being cast (CR 712.8a, 712.8c), so a creature front with an Aura back (Accursed Witch, the disturb
 * Spirits) is a creature spell, never one of these.
 *
 *   · isBodyOnlyAuraSpell(card) — is the face being cast such an Aura (an Aura that enchants a permanent, with no modeled lane)?
 *   · bodyOnlyAuraHosts(…) below is empty for one whose Enchant line the engine can't list, so it is never offered — a safe
 *     false negative.
 *   · bodyOnlyAuraHosts(state, card, controller) — its legal targets: the cast enumeration's own (spellEffects.enumerateTargets
 *     over staticAbilityParser.auraSpellHostSpec, with the spell's colours — shroud, hexproof, protection from a colour) narrowed
 *     to the permanents it may enchant at all (auraEntry.mayBeEnchantedBy — protection from enchantments, "can't be enchanted",
 *     CR 303.4). The offer (legalChoices), the dispatcher's refusal of a cast without one, and AURA_ETB's resolution re-check
 *     (resolvers.js, CR 608.2b, 608.3b) all read this one list, so what is offered is what resolves.
 *
 * Imports only modules legalChoices, actionDispatcher and resolvers already reach; none of them imports those three.
 */
import { faceUpView } from "./faceUp.js";
import { isAuraCard, isNativeAura, isNativeManaAura, playerAuraSpellSubject, auraSpellHostSpec } from "./staticAbilityParser.js";
import { isNativeOrdealAura, grantAuraCastHostType } from "./coverage.js";
import { isGraveyardReanimateAura } from "./animateDeadGate.js";
import { enumerateTargets } from "./spellEffects.js";
import { mayBeEnchantedBy } from "./auraEntry.js";
import { findPermanent } from "./gameState.js";
import { permanentPrintedColors } from "./layers.js";

/** An Aura spell with a modeled cast lane of its own (each the gate its lane offers and routes on). */
function hasModeledAuraLane(card) {
  return isGraveyardReanimateAura(card) || isNativeAura(card) || isNativeOrdealAura(card) || isNativeManaAura(card) || !!grantAuraCastHostType(card);
}

/** Is `card`, cast, an Aura spell that enchants a permanent and that no modeled lane casts (see the header)? */
export function isBodyOnlyAuraSpell(card) {
  return isAuraCard(faceUpView(card)) && !playerAuraSpellSubject(card) && !hasModeledAuraLane(card);
}

/**
 * The permanents `card`, cast by `controller`, may target as an Aura spell on the board `state`: `[{ type, id, controller, … }]`
 * in the cast enumeration's order, empty when its Enchant line is unlistable or nothing qualifies. `recheck` marks the
 * resolution re-check (spellEffects.canBeTargetedBy reads a colourless source's shields differently there).
 */
export function bodyOnlyAuraHosts(state, card, controller, { recheck = false } = {}) {
  const spec = auraSpellHostSpec(card);
  if (!spec) return [];
  const face = faceUpView(card);
  // The spell's colours are its front face's (layers.permanentPrintedColors — a transform card's top-level colours are empty).
  const targets = enumerateTargets(state, controller, { targetType: spec.targetType, restrictions: spec.restrictions }, permanentPrintedColors(card), recheck ? { recheck: true } : null);
  return targets.filter((t) => {
    const lk = findPermanent(state, t.id);
    return !!lk && mayBeEnchantedBy(state, lk.permanent, lk.controller, face);
  });
}
