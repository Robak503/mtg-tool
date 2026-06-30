/**
 * effects/atoms/destroyTokenRider.js — DESTROY + "can't be regenerated" + a SECOND sentence that makes the
 * destroyed creature's controller a vanilla creature token (Pongify, Rapid Hybridization).
 *
 * This is a CLOSE COUSIN of parser.js's RIDER-REMOVAL (matchRemovalControllerRider, "Destroy target X. Its
 * controller creates a N/N <color> <subtype> creature token." — Beast Within / Generous Gift). Two reasons the
 * existing matcher can't fold these cards:
 *   1. A "Destroy target creature." LEAD is NOT recognized by the matcher's lead resolver (parseExtendedAtom /
 *      destroyExileClauseParser both return null for "destroy target creature" — that bare form is produced by
 *      the legacy compileEffect path, unreachable from the matcher). Only "destroy target permanent / artifact
 *      or enchantment / …" resolve there. So a creature-destroy + token-rider card silently falls to LOW.
 *   2. A MIDDLE "It can't be regenerated." sentence sits between the destroy and the rider, and the matcher's
 *      `^(destroy target …)\.\s+its controller …$` anchor (no slot for an intervening sentence) can't span it.
 *   3. The rider subject is "That creature's controller" (Rapid Hybridization), not only "Its controller".
 *   4. The token subtype is multi-word ("Frog Lizard"), which the matcher's single-word `([a-z]+)` rejects.
 *
 * Rather than widen the shared matcher (regression risk to Beast Within & co.), this is a SELF-CONTAINED,
 * ADDITIVE whole-clause matcher invoked just before matchRemovalControllerRider. It emits the SAME atom shape
 * the existing rider machinery already resolves end-to-end — `{ op:"destroy", targetType:"creature",
 * cannotRegenerate?, controllerRider:{ kind:"createToken", power, toughness, color, subtype } }` — so the
 * runtime path is the proven applyRemovalWithRider → applyControllerRider (Beast Within's exact code), no new
 * resolver. CREED whole-card: the destroy is the LEAD (the token rider is unconditional — CR, the second
 * sentence resolves even if the destroy fails on an indestructible creature), the "can't be regenerated" is
 * carried as cannotRegenerate (applyDestroyEffect honors it), and the token enters under the destroyed
 * creature's controller (captured pre-removal). ALL-OR-NOTHING: anything outside this exact shape → null →
 * the spell stays LOW → Arbiter (never a confident partial that drops a clause).
 */

const stripReminder = (s) => String(s || "").replace(/\([^)]*\)/g, " ");

// "Destroy target creature." [optionally "It can't be regenerated."] then
// "(Its|That creature's) controller creates a N/N <color> <subtype…> creature token."
// Anchored ^…$ over the WHOLE oracle (after reminder strip + whitespace collapse): the lead is EXACTLY
// "destroy target creature" (the only lead these two cards use); the subtype allows multiple words
// (Frog Lizard) but no other tokens; a single color word from the five; an integer P/T. A trailing rider
// beyond the token (a keyword "with …", a second sentence) fails the anchor → null → Arbiter.
const DESTROY_TOKEN_RIDER_RE =
  /^destroy target creature\.\s*(it can't be regenerated\.\s*)?(?:its|that creature's) controller creates a (\d+)\/(\d+) (white|blue|black|red|green) ([a-z]+(?: [a-z]+)*) creature token\.?$/i;

/**
 * Parse a "Destroy target creature[. It can't be regenerated]. <controller> creates a N/N <color> <subtype>
 * creature token." spell into ONE destroy atom carrying a createToken controllerRider. Returns the atom or null.
 */
export function parseDestroyTokenRider(oracle) {
  const t = stripReminder(oracle).replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
  const m = t.match(DESTROY_TOKEN_RIDER_RE);
  if (!m) return null;
  const toughness = parseInt(m[3], 10);
  if (toughness < 1) return null; // a 0-toughness token dies to the lethal SBA → incomplete capture → Arbiter
  const atom = {
    op: "destroy",
    targetType: "creature",
    restrictions: [],
    controllerRider: { kind: "createToken", power: parseInt(m[2], 10), toughness, color: m[4].toLowerCase(), subtype: m[5].trim() },
  };
  if (m[1]) atom.cannotRegenerate = true;
  return atom;
}
