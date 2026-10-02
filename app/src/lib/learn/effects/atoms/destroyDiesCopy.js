/**
 * effects/atoms/destroyDiesCopy.js — DESTROY + "IF THAT CREATURE DIES THIS WAY, its controller creates two tokens that are
 * copies of that creature, except their power is half that creature's power and their toughness is half that creature's
 * toughness. Round up each time." (Saw in Half).
 *
 * A PURE whole-oracle matcher (leaf: imports nothing; parser.js calls it beside parseDestroyTokenRider, the Pongify family's
 * matcher). It emits ONE destroy atom carrying a `diesCopyRider`, which removal.js's destroy resolver hands to
 * applyDestroyDiesCopy:
 *   - the destroy runs through the SHARED applyDestroyEffect, so indestructible / shield counter / regeneration / umbra armor
 *     and the dies triggers are the ones every destroy uses;
 *   - the rider is CONDITIONAL, unlike Pongify's token (CR 608.2c — "if that creature dies this way" reads what the destroy
 *     actually did): a creature that was not destroyed, or was destroyed but sent elsewhere by a replacement, makes nothing
 *     (CR 700.4 — dies means put into a graveyard from the battlefield; the 2025-09-19 rulings);
 *   - the copies are made from the creature's last known information (CR 608.2h): its copiable values and its controller,
 *     and its power and toughness as it last existed on the battlefield (the ruling), halved and rounded up as part of the
 *     copy effect (CR 707.9b), so a characteristic-defining P/T ability is not copied (CR 707.9d).
 *
 * EXACT anchor over the whole oracle: Saw in Half is the only card printing this sentence pair. Any other count, rounding,
 * subject or trailing rider fails the anchor → null → the spell stays LOW → Arbiter (CREED: never a confident partial).
 */

const DESTROY_DIES_COPY_RE =
  /^destroy target creature\. if that creature dies this way, its controller creates two tokens that are copies of that creature, except their power is half that creature's power and their toughness is half that creature's toughness\. round up each time\.$/i;

/** Parse the Saw in Half oracle into ONE destroy atom carrying the dies-this-way copy rider, or null. */
export function parseDestroyDiesCopy(oracle) {
  return DESTROY_DIES_COPY_RE.test(oracle) ? { op: "destroy", targetType: "creature", restrictions: [], diesCopyRider: { count: 2 } } : null;
}
