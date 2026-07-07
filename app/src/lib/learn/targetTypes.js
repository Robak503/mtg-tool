/**
 * The "non-chosen" (mass / auto-scoped) effect target types — a spell or atom carrying one of these
 * resolves WITHOUT the caster picking a target (it auto-hits a whole set: every creature, every player,
 * every artifact, …). EVERY "does this need a chosen target?" check across the cast / AI / trigger flow
 * must agree on this set, so it lives in ONE place.
 *
 * WHY THIS EXISTS (the drift trap): the set used to be duplicated as inline `["eachOpponent","eachCreature"]`
 * lists in ~5 spots (parser.programNeedsChosenTarget / atomTargetIntent, legalChoices.atomNeedsTarget,
 * targeting.js, spellEffects.effectNeedsTarget). When SYMBURN-1 added `eachCreatureAndPlayer` it was put
 * in only 2 of them — so Inferno/Volcanic Fallout/etc. CLASSIFIED native but were silently UNCASTABLE
 * (the cast flow treated the mass effect as targeted, found no legal target, and dropped the action). A
 * new mass targetType now goes HERE once; nothing can drift.
 *
 * Leaf module: pure strings, no imports → importable everywhere with no cycle risk.
 */
export const NON_CHOSEN_TARGET_TYPES = new Set([
  "eachOpponent",               // "each opponent" — mass player scope
  "eachCreature",               // board wipes — every creature on every battlefield
  "eachCreatureAndPlayer",      // SYMBURN-1 — symmetric burn (every creature AND every player)
  "eachArtifact",               // MASS-NC — "destroy all artifacts"
  "eachEnchantment",            // MASS-NC — "destroy all enchantments"
  "eachLand",                   // MASS-NC — "destroy all lands"
  "eachArtifactOrEnchantment",  // MASS-NC — "destroy all artifacts and enchantments"
  "defendingPlayer",            // ATTACKS-DAMAGE — the attacked player (ctx.defenderId), NOT a chosen target
  "damagedPlayer",              // CDMG-DAMAGE — the just-damaged player (ctx.damagedPlayerId), NOT a chosen target
]);

/** True iff `tt` is a mass / auto-scoped target type that needs NO chosen target. */
export function isNonChosenTargetType(tt) {
  return !!tt && NON_CHOSEN_TARGET_TYPES.has(tt);
}
