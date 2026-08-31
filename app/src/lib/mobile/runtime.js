/**
 * The only approved WebView-facing engine entrypoint for the initial phone
 * boundary proof. Keep this file declarative: it re-exports upstream behavior
 * without wrapping, replacing, or weakening it.
 */
export { classifyCard, isNativeTier } from "../learn/coverage.js";
export { createGameState, createPermanent } from "../learn/gameState.js";
export { legalActionsForPlayer, filterActions } from "../learn/legalChoices.js";
export { dispatchAction } from "../learn/actionDispatcher.js";
export { resolveCombatDamage } from "../learn/combatResolution.js";
export { checkAllStateBasedActions } from "../learn/sba.js";
export { permanentPower, permanentToughness } from "../learn/layers.js";
export { applyCounterDoubling } from "../learn/replacementEffects.js";
export { checkLandfallTriggers } from "../learn/triggers.js";
export { flushTriggers } from "../learn/gameEngine.js";
