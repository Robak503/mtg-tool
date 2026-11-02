/**
 * abilityView.js — THE ABILITY VIEW for the modules layers.js itself imports (a zero-import leaf; the ability-loss program's S0b,
 * docs/orchestration/ABILITY-LOSS-PROGRAM.md).
 *
 * A permanent that lost all its abilities (CR 613.1f — layers.js's `loseAllAbilities` op) must read as a permanent with no abilities
 * to every reader of its abilities. layers.withAbilityLoss answers that: the stripped view of the card when the permanent has lost
 * its abilities, else the card itself. The board scanners in staticAbilityParser.js and effects/textNormalize.js read battlefield
 * permanents' text, but layers.js imports those modules, so they cannot import it back. layers.js registers withAbilityLoss and
 * boardHasAbilityLoss here as it loads; those scanners call `abilityViewLossy` once per scan (the board fast path — no per-permanent
 * work on a board without a loss) and `abilityViewOf` for each permanent only when it answers true.
 *
 * Before registration (only a module graph that never loaded layers.js) the printed card is returned — unless the state holds a
 * loss, which only layers.js can put there: then it throws, so a loss is never read past silently.
 */

let _withAbilityLoss = null;
let _boardHasAbilityLoss = null;

/** Called once by layers.js as it loads. */
export function registerAbilityView(fn, boardFn = null) {
  _withAbilityLoss = fn;
  _boardHasAbilityLoss = boardFn;
}

function storedLossWithoutLayers(state) {
  if ((state?.continuousEffects || []).some((e) => e?.op?.layerOp === "loseAllAbilities")) {
    throw new Error("abilityView: a loseAllAbilities effect is on the board but layers.js has not registered the ability view");
  }
  return false;
}

/** Does any permanent on `state`'s board have a loss to read? Asked ONCE per scan, before the loop (layers.boardHasAbilityLoss). */
export function abilityViewLossy(state) {
  return _boardHasAbilityLoss ? _boardHasAbilityLoss(state) : storedLossWithoutLayers(state);
}

/** `card` (default: the permanent's printed card) as the readers of permanent `perm`'s abilities must see it — layers.withAbilityLoss. */
export function abilityViewOf(state, perm, card = perm?.card) {
  if (_withAbilityLoss) return _withAbilityLoss(state, perm, card);
  storedLossWithoutLayers(state);
  return card;
}
