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
 * Stone/Upwelling (Kruphix and Horizon Stone retired at stage ③ · 20 — their
 * printed colorless conversion is Oracle-parsed now). Phase-7 PR-11/PR-12 moved the STATIC P/T half (Omnath's
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

// NOTE — not every card-specific behavior lives in THIS registry. cardEffects.js owns only the
// mana-emptying hook. Other targeted whole-card hooks live in their own modules following the #353/#356
// pattern (urDragonAttack.js, and — Wave-5a — wolverine.js, which owns Wolverine, Best
// There Is: the source-scoped double-all-damage replacement via damageReplacements.js, the end-step
// "+1/+1 if dealt damage to another creature" counter, and the {1}{G} regenerate ability).

// Keyed by exact card name. Grows one verified card at a time.
const REGISTRY = {
  // "Green mana doesn't empty from your mana pool as steps and phases end."
  // (Omnath's +1/+1-per-green P/T half lives in layers.js, not here.)
  "Omnath, Locus of Mana": {
    manaDoesNotEmpty: ["G"],
  },

  // RETIRED (the 09-06 plan's stage ③ · 20, 2026-09-30) — Kruphix, God of Horizons and Horizon Stone kept
  // EVERY colour here. Neither card ever did: both print "If you would lose unspent mana, that mana becomes
  // colorless instead." The line is parsed from the Oracle now (staticAbilityParser's
  // lostManaBecomesColorless) and gameEngine.emptyManaPools turns the lost mana into {C}.

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
