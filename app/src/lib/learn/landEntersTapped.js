/**
 * landEntersTapped.js — CONDITIONAL enters-tapped for lands (CR 614.1c), the "enters tapped unless
 * <condition>" family (LANDS-TIER slice 1, 2026-09-02; 107 corpus lands censused: 99 print "This land
 * enters tapped unless …", 6 print their own name, 0 print "the battlefield").
 *
 * WHY A LEAF, AND WHY NOT INSIDE staticAbilityParser. The bare `entersTapped(card)` is a pure text read and
 * lives beside its parser kin; this one must EVALUATE a board condition, which means importing
 * interveningIf — and interveningIf → layers → staticAbilityParser, so putting the evaluation in
 * staticAbilityParser would close a cycle. This module imports only interveningIf and is imported by the
 * two enter sites (actionDispatcher's play-land path, resolvers.enterPermanent) and by coverage — the same
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
 * policy, never a decline-only shortcut), and resolvers.enterPermanent — which runs INSIDE an effect's
 * resolution (a tutored shockland) where a land-entry pause has no resume seam — applies that same policy
 * for every seat and logs it as an auto-decision. That second limit is deliberate and recorded, not hidden.
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
