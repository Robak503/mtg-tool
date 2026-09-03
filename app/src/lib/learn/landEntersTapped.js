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
