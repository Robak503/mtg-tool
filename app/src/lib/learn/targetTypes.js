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
 *
 * PARTITIONED (2026-07-18): NON_CHOSEN_TARGET_TYPES is now BUILT from two exported halves, so a new
 * mass targetType cannot be added without deciding its AI-hold classification — the residual drift the
 * central set didn't close. MASS_WIPE_SCOPES had lived as a hardcoded twin in parser.js:4352; a new
 * permanent-class scope added there-not-here (or here-not-there) meant the AI would blind-cast a
 * symmetric wipe — a play-quality regression NO classifier FP guard can catch. Same guard idiom as
 * effectAtoms.js's PAUSING_OPS_LIST: validate at module load, throw on drift.
 */

/** Permanent-class MASS WIPES — the AI HOLDS these (parser.programContainsMassRemoval → opponentAI
 * pickCastAction): the engine resolves a symmetric wipe correctly, but the AI can't yet weigh whether
 * nuking the board helps or hurts it. Mass DAMAGE / player scopes are intentionally NOT here (small
 * symmetric burn is often a fine aggressive play — see parser.js's programContainsMassRemoval doc). */
export const MASS_WIPE_SCOPES = new Set([
  "eachCreature",               // board wipes — every creature on every battlefield
  "eachArtifact",               // MASS-NC — "destroy all artifacts"
  "eachEnchantment",            // MASS-NC — "destroy all enchantments"
  "eachLand",                   // MASS-NC — "destroy all lands"
  "eachArtifactOrEnchantment",  // MASS-NC — "destroy all artifacts and enchantments"
]);

/** Non-chosen scopes that are NOT AI-held wipes — player scopes, context-bound players, and
 * opponent-only / source-excluding sweeps (asymmetric: they never nuke the caster's own board). */
export const NON_WIPE_MASS_SCOPES = new Set([
  "eachOpponent",               // "each opponent" — mass player scope
  "eachOtherCreature",          // ETB-1 — source-excluding board sweep ("it deals N damage to each OTHER
  //                               creature" — Chaos Maw / Crater Hellion / Raging Swordtooth). Every creature
  //                               EXCEPT the source (ctx.sourceId); non-chosen, so the trigger flush routes it
  //                               on confidence (no target pick) exactly like eachCreature.
  "eachCreatureAndPlayer",      // SYMBURN-1 — symmetric burn (every creature AND every player)
  "eachCreatureYouControl",     // MASS-OWN-BOARD — "regenerate each creature you control" (Golgari Charm).
  //                               The mirror of eachOpponentCreature. A NON-wipe on purpose: it BUFFS the
  //                               caster's own board, so the AI must not hold it the way it holds a wipe.
  "eachOpponentCreature",       // R1.2 (audit 2026-07-09) — mass bounce over every OPPONENT creature
  //                               (Scourge-of-Fleets class, zones.js). Was emitted but missing here, so
  //                               "needs a chosen target?" checks treated it as targeted and the live
  //                               trigger flush silently DROPPED the effect while the classifier credited
  //                               native — the documented drift trap made real.
  "defendingPlayer",            // ATTACKS-DAMAGE — the attacked player (ctx.defenderId), NOT a chosen target
  "damagedPlayer",              // CDMG-DAMAGE — the just-damaged player (ctx.damagedPlayerId), NOT a chosen target
]);

export const NON_CHOSEN_TARGET_TYPES = new Set([...MASS_WIPE_SCOPES, ...NON_WIPE_MASS_SCOPES]);

// Load-time drift guard — the two halves must PARTITION (an entry in both means someone classified a
// scope twice with different intents; fail loud at import, not silently at play time).
for (const tt of MASS_WIPE_SCOPES) {
  if (NON_WIPE_MASS_SCOPES.has(tt)) throw new Error(`targetTypes: "${tt}" is in BOTH MASS_WIPE_SCOPES and NON_WIPE_MASS_SCOPES — pick one`);
}

/** True iff `tt` is a mass / auto-scoped target type that needs NO chosen target. */
export function isNonChosenTargetType(tt) {
  return !!tt && NON_CHOSEN_TARGET_TYPES.has(tt);
}
