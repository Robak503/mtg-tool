/**
 * landEntersTapped.js — CONDITIONAL enters-tapped for lands (CR 614.1c), the "enters tapped unless
 * <condition>" family (LANDS-TIER slice 1, 2026-09-02; 107 corpus lands censused: 99 print "This land
 * enters tapped unless …", 6 print their own name, 0 print "the battlefield").
 *
 * WHY A LEAF, AND WHY NOT INSIDE staticAbilityParser. The bare `entersTapped(card)` is a pure text read and
 * lives beside its parser kin; this one must EVALUATE a board condition, which means importing
 * interveningIf — and interveningIf → layers → staticAbilityParser, so putting the evaluation in
 * staticAbilityParser would close a cycle. This module imports only interveningIf and is imported by the
 * two enter sites (actionDispatcher's play-land path; enterReplacements, which every other entry — the cast
 * resolvers.enterPermanent and the non-cast zones.enterCardFromZone — reads) and by coverage — the same
 * shape every other feature leaf here takes (seedbornUntap.js, wolverine.js …).
 *
 * ONE VOCABULARY, TWO CONSUMERS — the CAP12 discipline. The runtime evaluates the condition through
 * `evaluateInterveningIf`, and the classifier admits the printed line ONLY when `interveningIfParseable`
 * says that same evaluator can read it. A land whose condition is outside the vocabulary (the reveal-lands:
 * "you revealed a Dragon card this way or …") gets NO condition here → the runtime leaves it UNTAPPED (the
 * CREED-safe direction `entersTapped`'s own doc names: a false negative hands the player a land they can tap,
 * never denies mana they're owed) AND the classifier leaves it land-partial. The metric can never claim a
 * gate the engine does not run.
 *
 * THE "OTHER" EXCLUSION IS LOAD-BEARING. On the play-land path the entering land is ALREADY on the
 * battlefield when this is consulted, so "unless you control two or more OTHER lands" must not count it —
 * the entering permanent's id is threaded as context.sourcePermanentId and the evaluator's "other" arm
 * excludes it. Without that a fast land would enter tapped one turn late and a slow land one turn early.
 */
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { cardIsEveryCreatureType } from "./everyCreatureType.js"; // P·39b — a hand card that is every creature type (the reveal lands); a leaf over keywords.js
import { CR_CREATURE_TYPES } from "./effects/creatureTypes.js"; // P·39b — every creature type answers for a creature type only (CR 205.3d); a zero-import leaf

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The printed "enters tapped unless <condition>" sentence's CONDITION, or null. Whole-sentence anchored
 * over each line: the subject must be "this land" or the card's own (legendary short) name, and the
 * sentence must END at the condition — a rider or a compound falls out. Returns the condition ONLY when
 * the shared evaluator can read it (interveningIfParseable), so this single function is both the
 * runtime's and the classifier's gate. Pure text; no state.
 */
export function entersTappedUnlessCondition(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "").replace(/\([^)]*\)/g, " ");
  if (!/tapped unless/i.test(oracle)) return null;
  const name = String(card?.name || "").trim();
  const short = name.split(",")[0].trim();
  const subjects = ["this land"];
  if (short) subjects.push(escapeRe(short));
  if (name && name !== short) subjects.push(escapeRe(name));
  const re = new RegExp(`^(?:${subjects.join("|")}) enters tapped unless (.+?)\\.?$`, "i");
  for (const raw of oracle.split("\n")) {
    const line = raw.trim();
    const m = line.match(re);
    if (!m) continue;
    const condition = m[1].trim().toLowerCase();
    // The reveal-lands print a PRECEDING "As this land enters, you may reveal …" sentence whose choice this
    // gate cannot see; their condition also names that reveal ("you revealed a … this way or …"), which is
    // outside the vocabulary → null. Anything else is admitted iff the evaluator can read it.
    return interveningIfParseable(condition) ? condition : null;
  }
  return null;
}

/**
 * Should this land enter TAPPED right now under its printed "unless" gate? True iff the card carries a
 * readable condition AND that condition is FALSE on the live board (CR 614.1c — it enters tapped unless
 * the condition holds). `enteringPermId` is the land's own id, excluded from any "other" count.
 *
 * FAIL-SAFE DIRECTION: no readable condition → false (enters untapped), an evaluator null → false. Both are
 * the false-negative side — a player is handed an untapped land the printed gate might have tapped, never
 * denied one it owed them. Pure: reads state, never mutates.
 */
export function conditionalEntersTapped(state, card, controller, enteringPermId = null) {
  const condition = entersTappedUnlessCondition(card);
  if (!condition) return false;
  const holds = evaluateInterveningIf(state, condition, controller, { sourcePermanentId: enteringPermId ?? undefined });
  if (holds === null) return false;   // cannot confirm on this board → untapped (FN-safe)
  return !holds;
}

/**
 * THE SHOCKLAND CLAUSE (LANDS-TIER slice 2, 2026-09-02; CR 614.1c + 119.4): "As this land enters, you may
 * pay N life. If you don't, it enters tapped." — the ten shocklands (all N = 2), and Cap America's three
 * (Sacred Foundry · Hallowed Fountain · Steam Vents — one arm, three slots). Returns { life: N } or null.
 *
 * Unlike the "unless" gate this is a PLAYER CHOICE, not a board read, so the reader only recognises the
 * line; the two enter sites decide HOW the choice is made: the play-land path raises a real pause for a
 * human seat (an AI seat auto-decides through autoPickOptionalLifePayment — pay iff life ≥ 10, a written
 * policy, never a decline-only shortcut), and the shared entry replacements (enterReplacements — the entry a
 * tutored or put-onto-the-battlefield shockland takes, INSIDE an effect's resolution, where a land-entry pause
 * has no resume seam) apply that same policy for every seat and log it as an auto-decision; an entry the effect
 * itself taps pays nothing. That second limit is deliberate and recorded, not hidden.
 *
 * Whole-line anchored: the exact printed sentence and nothing more. A rider or a different subject leaves
 * the line as residue (the card stays partial), never a partial credit.
 */
export function paysLifeOrEntersTapped(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "").replace(/\([^)]*\)/g, " ");
  if (!/pay \d+ life/i.test(oracle)) return null;
  for (const raw of oracle.split("\n")) {
    const m = raw.trim().match(/^as this land enters, you may pay (\d+) life\. if you don't, it enters tapped\.?$/i);
    if (m) return { life: parseInt(m[1], 10) };
  }
  return null;
}

/**
 * The AI / autopilot policy for the shockland payment — WRITTEN DOWN, so nobody mistakes it for a rule:
 * pay the life iff the controller has at least 10 afterwards-still-comfortable life (life ≥ 10). Paying
 * is always legal down to 0 (CR 119.4), and an untapped dual on the turn it is played is worth two life
 * in every position except a low-life one — the same "pay-if-able" default the optional-mana-payment
 * auto-pick uses, with the resource swapped. A board-aware refinement (don't pay on turn one with no
 * play; pay at lower life when the mana is lethal) is a future enhancement; this default is never
 * ILLEGAL and never silently declines. `null` cost → false.
 */
export function autoPickOptionalLifePayment(state, controller, life) {
  const pl = state?.players?.[controller];
  if (!pl || !(life > 0)) return false;
  return (pl.life ?? 0) >= 10 && (pl.life ?? 0) >= life;
}

/**
 * THE REVEAL-LANDS (LANDS-TIER slice 7, 2026-09-03; CR 614.1c): "As this land enters, you may reveal a
 * <Type> [or <Type>] card from your hand. If you don't, this land enters tapped." — the Snarls, the SOI
 * "shadow" lands (Game Trail, Port Town …), the Lorwyn tribal lands (Secluded Glen "a Faerie card", Gilt-Leaf
 * Palace "an Elf card", Murmuring Bosk "a Treefolk card"). 19 corpus lands print exactly this sentence; the
 * two whose sentence continues into an "unless" ("…this land enters tapped unless you revealed … or you
 * control a Dragon", Temple of the Dragon Queen / Haven of the Spirit Dragon) are a different shape and stay
 * outside (null — they park honestly, as LANDS-1 recorded).
 *
 * Returns the lowercased type words, e.g. ["mountain", "forest"] — or null. Whole-line anchored: the exact
 * printed sentence, one or two type words, nothing more. Both a basic land type and a creature type are
 * matched the same way at read time: `\b<Type>\b` against the hand card's FRONT-face type line.
 */
export function revealLandTypes(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "").replace(/\([^)]*\)/g, " ");
  if (!/may reveal/i.test(oracle)) return null;
  for (const raw of oracle.split("\n")) {
    const m = raw.trim().match(/^as this land enters, you may reveal an? ([a-z]+)(?: or ([a-z]+))? card from your hand\. if you don't, (?:this land|it) enters tapped\.?$/i);
    if (m) return [m[1].toLowerCase(), ...(m[2] ? [m[2].toLowerCase()] : [])];
  }
  return null;
}

/**
 * Does this reveal-land enter TAPPED right now? True iff the card carries the printed reveal clause AND the
 * controller's hand holds NO card of a named type. THE WRITTEN POLICY (both seats): a matching card is
 * always revealed. Revealing is free (no cost, no zone change — CR 701.15a), the only price is information,
 * and an untapped land on the turn it is played is worth more than hiding one card's identity in every
 * position this engine models; so the reveal is automatic rather than a pause. The hidden-information side
 * is NOT modeled (no opponent ever "sees" the revealed card) — a documented limit, never a fabricated gate.
 *
 * The play-land path has already moved the entering land out of the hand; a land PUT from the hand (Growth Spiral) is
 * still there as its replacement applies (zones.enterCardFromZone reads the board as the land enters), but no
 * reveal land carries a type it names, so it can never reveal itself — the scan is in effect the rest of the
 * hand. No printed clause → false (untapped, FN-safe).
 */
export function revealLandEntersTapped(state, card, controller) {
  const types = revealLandTypes(card);
  if (!types) return false;
  const hand = state?.players?.[controller]?.hand || [];
  // P·39b — a hand card that is every creature type (a changeling, or a creature card under its owner's Maskwood Nexus) is an Elf
  // card for Gilt-Leaf Palace; a basic land type (a Snarl's "Mountain or Forest") is never one of its types (CR 205.3d).
  const has = hand.some((c) => {
    const front = String(c?.type || c?.type_line || "").split(" // ")[0].toLowerCase();
    return types.some((t) => new RegExp(`\\b${t}\\b`).test(front) || (CR_CREATURE_TYPES.has(t) && cardIsEveryCreatureType(state, c, controller)));
  });
  return !has;
}
