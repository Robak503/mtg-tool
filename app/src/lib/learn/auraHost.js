/**
 * auraHost.js — can this Aura card legally be attached to this creature right now (CR 303.4a / 701.3a-b)?
 *
 * MOVED VERBATIM from effects/atoms/stack.js (shelf D41, 2026-10-01) so a second atoms module can share it: zones.js
 * (Mantle of the Ancients' return-attached-from-graveyard) needs the same reader, and stack.js already imports zones.js,
 * so zones.js could not import it back from stack.js without a cycle. Only `export` was added; the body is unchanged.
 *
 * LEAF: imports staticAbilityParser (which imports only parse leaves), layers and creatureRestrictions, none of which
 * import an atoms module.
 */
import { auraEnchantHostSpec, auraEnchantSubject } from "./staticAbilityParser.js";
import { permanentTypes } from "./layers.js";
import { creatureSatisfiesRestrictions } from "./creatureRestrictions.js";

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
export function auraMayEnchantCreature(state, auraCard, host, controller) {
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
