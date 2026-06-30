/**
 * tribute.js — TRIBUTE (CR 702.96) as a modeled ETB opponent-choice keyword.
 *
 * "Tribute N (As this creature enters, an opponent of your choice may put N +1/+1 counters on it.)" — an
 * ETB replacement-style decision (CR 702.96a). The chosen opponent EITHER pays tribute (puts N +1/+1
 * counters on the creature → it's a strictly bigger body for the controller) OR declines, in which case a
 * separate "When this creature enters, if tribute wasn't paid, [effect]" triggered ability (CR 702.96e)
 * runs its payoff. The creature's controller picks WHICH opponent decides; that opponent then decides.
 *
 * SCOPE (whole-card per THE CREED): a CREATURE with a vanilla/keyword-only base body whose ONLY non-keyword
 * text is the "Tribute N" line plus a single "When this creature enters, if tribute wasn't paid, <effect>"
 * triggered ability whose <effect> is fully modeled. Both halves are modeled atoms:
 *   - the COUNTERS half rides the SAME enters-with-+1/+1-counters replacement path the engine already
 *     resolves (resolvers.enterPermanent → applyCounterDoubling), now GATED on the opponent's decision;
 *   - the "if tribute wasn't paid" trigger rides the EXISTING ETB-trigger pipeline, gated on the
 *     "tribute wasn't paid" intervening-if (CR 603.4, interveningIf.js) reading the per-permanent
 *     `tributePaid` flag — exactly the way KICKER's "it was kicked" trigger reads `wasKicked`.
 *
 * RUNTIME (the decision path, resolvers.enterPermanent):
 *   1. As the creature enters, the controller's opponent decides via `decideTribute` (a deterministic
 *      value heuristic — pay to deny a HARMFUL if-not effect, decline to deny the controller free counters
 *      when the if-not effect is pure upside for the controller). A genuine resolution of CR 702.96a.
 *   2. If paid → N +1/+1 counters are added AS the creature enters (the bigger P/T is correct from turn 1,
 *      through applyCounterDoubling like every other enters-with-counter write) and `perm.tributePaid=true`.
 *   3. If declined → no counters; `perm.tributePaid=false`, and the "if tribute wasn't paid" ETB trigger
 *      fires its payoff through the normal checkEnterTriggers → buildTriggerStack path (the intervening-if
 *      evaluates true).
 *
 * EXPLICITLY DEFERRED (stay body-only → Arbiter, never a fabricated credit):
 *   - Any if-not effect that isn't a fully-modeled HIGH program: gain control of a creature (Siren of the
 *     Fanged Coast), grant a quoted dies-trigger ability (Flame-Wreathed Phoenix) — parseTributeCreature
 *     returns null for these because the bare body fails to re-classify native. (Nessian Wilds Ravager's
 *     optional "you may have this creature fight another target creature" if-not is NOW modeled as a
 *     source-bound ETB-FIGHT (CR 701.12), so it re-classifies native and the whole card is credited.)
 *
 * Leaf module: no engine import (mirrors kicker.js / fading.js). The coverage classifier and the runtime
 * BOTH call these pure functions, so the metric credits EXACTLY the cards the engine plays.
 */

const stripReminder = (s) => String(s || "").replace(/\([^)]*\)/g, " ");

// A clean "Tribute N" line: the keyword at a line start, an integer count, nothing else after the reminder
// strip. Anchored to a line so a mid-text "tribute" mention (none in the real corpus) can never match. The
// capture is N. Reminder text is stripped first (CR 207.2) so the reminder's own "put N +1/+1 counters"
// copy can never be confused for a second clause.
const TRIBUTE_LINE_RE = /^tribute\s+(\d+)\s*$/im;

/**
 * The parsed Tribute count `{ n }` (n ≥ 1), or null when the card has no clean Tribute keyword. Reminder
 * text is stripped first. CONSERVATIVE — a miss is a safe false-negative (the card stays on the Arbiter).
 */
export function parseTribute(card) {
  const oracle = stripReminder(card?.oracle || card?.oracle_text || "");
  const m = TRIBUTE_LINE_RE.exec(oracle);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? { n } : null;
}

/**
 * Remove ONLY the "Tribute N (reminder…)" line from an oracle, leaving the rest of the body intact (the
 * "if tribute wasn't paid" ETB trigger + any keyword line stays). Line-anchored, reminder parens and all —
 * mirrors kicker.stripKickerLineOnly. Used by parseTributeCreature so the bare body re-classifies on its
 * own merits (the trigger machinery reads the "tribute wasn't paid" intervening-if). Conservative: a card
 * without a clean Tribute line is returned unchanged.
 */
export function stripTributeLine(oracle) {
  return String(oracle || "")
    .replace(/(?:^|\n)[^\n]*\btribute\s+\d+[^\n]*(?=\n|$)/i, "\n")
    .trim();
}

/**
 * TRIBUTE-CREATURE — the whole-card gate. Returns `{ n, bodyTier }` when the card is a CREATURE with (a) a
 * clean "Tribute N" keyword AND (b) a base body — the Tribute LINE stripped — that the injected
 * `classifyStripped` predicate classifies into a NATIVE tier. Otherwise null.
 *
 * `classifyStripped` is `(strippedCard) => tier` (classifyCard, injected to keep tribute.js a leaf); `isNative`
 * is `(tier) => boolean` (isNativeTier). The stripped card re-runs the FULL native cascade on its bare body —
 * the "if tribute wasn't paid" ETB trigger is credited iff its effect routes HIGH AND "tribute wasn't paid"
 * is in the strict intervening-if vocabulary (triggerRouting → interveningIfParseable). So the metric credits
 * EXACTLY the cards the runtime plays: enterPermanent resolves the opponent's choice (counters vs effect), and
 * the ETB trigger fires its payoff only when tribute wasn't paid. The recursion is bounded — the stripped body
 * has no Tribute line, so this gate returns null on the inner classifyCard call (mirrors parseKickerEtbCreature).
 *
 * All-or-nothing (THE CREED): an unmodeled body clause / an unmodeled if-not effect → the bare body isn't
 * native → null → body-only (the engine still hard-casts; the unmodeled if-not payoff routes to the Arbiter
 * only when tribute wasn't paid). SINGLE source of truth for the coverage credit AND the runtime
 * (resolvers.enterPermanent reads parseTribute too).
 */
export function parseTributeCreature(card, classifyStripped, isNative) {
  const type = String(card?.type || card?.type_line || "").toLowerCase();
  if (!/\bcreature\b/.test(type)) return null;
  const trib = parseTribute(card);
  if (!trib) return null;
  if (typeof classifyStripped !== "function" || typeof isNative !== "function") return null;
  const stripped = { ...card, oracle: stripTributeLine(card?.oracle || card?.oracle_text || "") };
  const bodyTier = classifyStripped(stripped);
  if (!isNative(bodyTier)) return null; // the bare body (keyword + the if-not ETB trigger) must be native
  return { n: trib.n, bodyTier };
}

/**
 * The chosen opponent's tribute DECISION (CR 702.96a) — true = PAY (put N +1/+1 counters on the entering
 * creature), false = DECLINE (the "if tribute wasn't paid" effect runs instead). A deterministic, defensible
 * value heuristic, NOT a fabricated outcome: the opponent pays iff the if-not effect would be WORSE for the
 * opponents than handing the controller a +N/+N-bigger body — i.e. the if-not effect HARMS an opponent
 * (deals damage to each opponent, forces an opponent to sacrifice, gains control of / destroys an opponent's
 * permanent). When the if-not effect is pure UPSIDE for the controller (gain life, make tokens, pump itself),
 * the opponent DECLINES to deny the free counters (the smaller benefit is the lesser of two evils). This
 * genuinely resolves the choice; it is intentionally simple (self-play AI quality, not a solver).
 *
 * `ifNotClause` is the raw "if tribute wasn't paid, <effect>" effect text (the controller-harming shapes are
 * matched by keyword). A clause we don't recognize as harmful → DECLINE (deny the counters), the safe default
 * that never fabricates a "pay" the heuristic can't justify. Pure (text + no state read needed for v1).
 */
export function decideTribute(ifNotClause) {
  const c = String(ifNotClause || "").toLowerCase();
  // HARMFUL-to-opponents if-not effects → the opponent PAYS tribute to avoid them (a bigger enemy creature is
  // the lesser evil vs. taking damage / losing a creature / a permanent). Matched by the modeled atom's verb.
  const harmsOpponent =
    /\bdamage to each opponent\b/.test(c) ||              // Pharagax Giant — 5 damage to each opponent
    /\bopponent\b[^.]*\bsacrifices?\b/.test(c) ||         // Shrike Harpy — target opponent sacrifices a creature
    /\bgain control of\b/.test(c) ||                      // (deferred shape, defensive) steal a creature
    /\bdestroy target\b/.test(c);                         // Nessian Demolok — destroy target noncreature permanent
  return harmsOpponent === true; // pay to deny a harmful effect; otherwise decline (deny the controller free counters)
}

/**
 * The raw "if tribute wasn't paid, <effect>" effect clause of a tribute card, or "" when absent. Used by the
 * runtime to feed decideTribute. Reminder text is stripped; the clause is everything after "if tribute wasn't
 * paid," on its line (straight + curly apostrophe tolerated). Pure text.
 */
export function tributeIfNotClause(card) {
  const oracle = stripReminder(card?.oracle || card?.oracle_text || "");
  const m = oracle.match(/if tribute wasn['’]t paid,\s*([^\n]*)/i);
  return m ? m[1].trim() : "";
}
