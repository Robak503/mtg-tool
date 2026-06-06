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
 * all mana empties). PR 10.5 populated REGISTRY with Omnath/Kruphix/Horizon
 * Stone/Upwelling. Phase-7 PR-11/PR-12 moved the STATIC P/T half (Omnath's
 * +1/+1 per unspent green) into the CR 613 layer engine (layers.js
 * STATIC_REGISTRY → layer-7c ptModifyDynamic); the old `staticPTModifier` hook
 * is deleted. This module now owns ONLY mana-emptying behavior.
 *
 * A descriptor:
 *   {
 *     manaDoesNotEmpty?: string[],   // e.g. ["G"] (Omnath)
 *   }
 *
 * Leaf module: reads card names + live state (pool, battlefield) but imports
 * nothing from the engine, so there's no import cycle.
 */

// Keyed by exact card name. Grows one verified card at a time.
const REGISTRY = {
  // "Green mana doesn't empty from your mana pool as steps and phases end."
  // (Omnath's +1/+1-per-green P/T half lives in layers.js, not here.)
  "Omnath, Locus of Mana": {
    manaDoesNotEmpty: ["G"],
  },

  // "You don't lose unspent mana as steps and phases end." (Controller only —
  // matches the per-controller hook. Kruphix's other abilities aren't modeled.)
  "Kruphix, God of Horizons": {
    manaDoesNotEmpty: ["W", "U", "B", "R", "G", "C"],
  },

  // "If unused mana would empty from your mana pool, that mana becomes
  // colorless instead." v1 approximates by PRESERVING the mana (same total
  // available); the color→colorless conversion is a future refinement.
  "Horizon Stone": {
    manaDoesNotEmpty: ["W", "U", "B", "R", "G", "C"],
  },

  // NOTE — Upwelling ("Mana doesn't empty from players' mana pools…") is a
  // SYMMETRIC effect (helps every player), which the per-controller hook
  // doesn't express. Deferred until manaDoesNotEmpty scans all battlefields.
};

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

// Exposed for tests + future card registrations to register against.
export const _registry = REGISTRY;
