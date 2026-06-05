/**
 * cardEffects.js — targeted registry of card-specific behaviors.
 *
 * This is the design doc's per-card-resolver pattern (NOT a general
 * oracle-parsing rules engine). Known cards map to explicit effect
 * descriptors; the engine reads them through two narrow hooks:
 *
 *   - manaDoesNotEmpty(state, playerId) → colors that survive step/phase end
 *     (gameEngine.emptyManaPools consults this).
 *   - staticPTModifier(state, permanent) → {p, t} delta from static abilities
 *     (gameState.creaturePower/creatureToughness consult this).
 *
 * Unknown cards get nothing — honest, bounded, extensible one card at a time.
 *
 * PR 10.2 ships the hooks over an EMPTY registry (default behavior unchanged:
 * all mana empties, no P/T modifiers). PR 10.5 populates REGISTRY with
 * Omnath/Kruphix/Horizon Stone/Upwelling.
 *
 * A descriptor:
 *   {
 *     manaDoesNotEmpty?: string[],                 // e.g. ["G"] (Omnath)
 *     staticPT?: (state, permanent) => { p, t },   // delta to printed P/T
 *   }
 *
 * Leaf module: reads card names + live state (pool, battlefield) but imports
 * nothing from the engine, so there's no import cycle.
 */

// Populated in PR 10.5. Keyed by exact card name.
const REGISTRY = {};

/**
 * Colors whose mana should NOT empty for this player at step/phase end,
 * aggregated across every registered permanent they control. Default: none
 * (all mana empties per CR 500.4).
 */
export function manaDoesNotEmpty(state, playerId) {
  const player = state?.players?.[playerId];
  if (!player) return [];
  const keep = new Set();
  for (const perm of player.battlefield || []) {
    const effect = REGISTRY[perm?.card?.name];
    if (effect?.manaDoesNotEmpty) {
      for (const color of effect.manaDoesNotEmpty) keep.add(color);
    }
  }
  return [...keep];
}

/**
 * Static P/T delta for a permanent from a registered static ability, or null.
 * Applied on top of printed value + counters by the single P/T accessor.
 */
export function staticPTModifier(state, permanent) {
  const effect = REGISTRY[permanent?.card?.name];
  if (!effect?.staticPT) return null;
  return effect.staticPT(state, permanent) || null;
}

// Exposed for tests + PR 10.5 to register against.
export const _registry = REGISTRY;
