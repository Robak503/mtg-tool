/**
 * damageRedirect.js — "All damage that would be dealt to you is dealt to <enchanted|equipped|this> creature instead."
 * (shelf D42, CR 614.9 — With Great Power . . ., Pariah, Pariah's Shield, Empyrial Archangel, Protector of the Crown).
 *
 * A static redirection effect of the permanent that prints it, read SYNTHESIZED-ON-READ off the board (the damage-doubler
 * model in damageReplacements.js): it exists exactly while that permanent is on the battlefield. "You" is that permanent's
 * controller — the player whose battlefield holds it (a control change moves the permanent). The two damage funnels consult
 * this reader before a player is dealt damage: spellEffects.applyDamageEffect (non-combat) and combatResolution (combat).
 *
 * LEAF: imports the static-line recognizer and the layer-aware creature check; neither imports back.
 */
import { playerDamageRedirectOf } from "./staticAbilityParser.js";
import { permanentIsCreature } from "./layers.js";

/**
 * The creature that damage about to be dealt to `playerId` is dealt to instead, or null. The first redirect on the player's
 * battlefield applies (CR 616.1 — the affected player picks which replacement applies; this is the deterministic pick). Its
 * recipient must be a creature on the battlefield right now, or the effect does nothing (CR 614.9): an Aura's or Equipment's
 * host, or the permanent itself for "this creature".
 */
export function playerDamageRedirectTarget(state, playerId) {
  for (const perm of state?.players?.[playerId]?.battlefield || []) {
    const who = playerDamageRedirectOf(perm.card);
    if (!who) continue;
    const to = who === "this" ? perm.id : perm.attachedTo;
    if (to && permanentIsCreature(state, to)) return to;
  }
  return null;
}
