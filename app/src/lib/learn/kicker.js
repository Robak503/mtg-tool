/**
 * kicker.js — KICKER (CR 702.33) as a modeled OPTIONAL additional cast cost.
 *
 * "Kicker {cost} (You may pay an additional {cost} as you cast this spell.)" lets the caster pay an
 * extra cost while casting; a spell so paid is "kicked" (CR 702.33b). A clause "If this spell/creature
 * was kicked, [effect]" (CR 702.33e) then runs an EXTRA effect that reads the kicked flag.
 *
 * SCOPE (this slice — the cleanest, highest-confidence shape, whole-card per THE CREED):
 *   a CREATURE with a vanilla/keyword-only base body whose ONLY non-keyword text is a single
 *   "If this creature was kicked, it enters with N +1/+1 counters on it." replacement. The base body
 *   is already native (native-body); the kicked payoff reuses the SAME enters-with-+1/+1-counters
 *   replacement the engine already resolves (resolvers.enterPermanent) — only now GATED on the
 *   was-kicked flag instead of being unconditional. So both halves are modeled atoms.
 *
 * RUNTIME (the cast-flag path):
 *   1. legalChoices.castActionsFromZone emits TWO cast actions for a kicker card — the normal cast and
 *      (when the kicker cost is also affordable) a `kicked:true` cast whose `cost` has the kicker pips
 *      folded in.
 *   2. actionDispatcher.applyCastSpell pays the folded cost (the kicker mana is part of action.cost, so
 *      the normal mana plan pays it) and threads `kicked` onto the PERMANENT_ETB payload params.
 *   3. resolvers.enterPermanent reads `opts.kicked` and adds the kicked counters AS the permanent enters
 *      (CR 614.1c + 122.6a) — exactly like the unconditional enters-with-counters replacement.
 *   The AI pays the kicker when it can afford it (opponentAI.pickCastAction prefers the kicked variant —
 *   a strictly-bigger creature with the identical body is always the higher-value play here).
 *
 * EXPLICITLY DEFERRED (stay body-only → Arbiter, never a fabricated credit):
 *   - Multikicker (CR 702.33h — "pay any number of times") and "Kicker {a} and/or {b}" (two kickers).
 *   - Any kicked payoff that is NOT the enters-with-N-+1/+1-counters replacement (an ETB trigger
 *     "When this creature enters, if it was kicked, destroy target …"; a kicked SPELL effect like
 *     "If this spell was kicked, draw two cards"). Those need the trigger / spell-effect pipelines to
 *     read the flag — a later slice. parseKickerCounterCreature returns null for them.
 *   - A kicker COST the cost parser can't represent cleanly (an {X} kicker, a non-mana kicker).
 *
 * Leaf module: no engine import (mirrors staticAbilityParser / fading). The coverage classifier and the
 * runtime BOTH call these pure functions, so the metric credits EXACTLY the cards the engine plays.
 */

import { stripCostOnlyKeywordLines } from "./effects/parseHelpers.js"; // CONVOKE/AFFINITY are cost-only keyword lines (the runtime hard-casts at full cost — CR-safe); strip them from the body so coverage + runtime agree (parseHelpers imports only keywords.js → acyclic)

const stripReminder = (s) => String(s || "").replace(/\([^)]*\)/g, " ");

const _ENTER_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

// A clean single-Kicker line: "Kicker {cost}" at the start of a line, the cost one-or-more mana pips, and
// NOTHING else on the line after the reminder strip (so "Kicker {2} and/or {R}" / "Multikicker {1}" / a
// "Kicker {X}" all fail). The {X}/{Y}/{Z} guard keeps a variable kicker (whose magnitude the cost path
// can't enumerate) out. Anchored to line start so a mid-text "kicker" mention can never match.
const KICKER_LINE_RE = /^kicker\s+((?:\{[^}]+\})+)\s*$/im;

/**
 * The parsed mana pips of a card's single Kicker cost as a RAW pip string ("{1}{G}"), or null.
 * null for: no kicker, multikicker, an "and/or" double kicker, a variable {X} kicker, or any pip the cost
 * parser would drop. CONSERVATIVE — a miss is a safe false-negative (the card stays on the Arbiter).
 */
export function parseKickerCost(card) {
  const oracle = stripReminder(card?.oracle || card?.oracle_text || "");
  if (/\bmultikicker\b/i.test(oracle)) return null;            // CR 702.33h — pay any number of times (deferred)
  const m = KICKER_LINE_RE.exec(oracle);
  if (!m) return null;
  const pips = m[1];
  // "Kicker {2} and/or {R}" survives the line regex only if written as two pip groups with no "and/or"
  // (it isn't — the connector sits between the groups), but guard the variable-cost case explicitly: an
  // {X}/{Y}/{Z} kicker pip is a magnitude the affordable-cost enumeration can't bound → defer.
  if (/\{[XYZ]\}/i.test(pips)) return null;
  return pips;
}

/**
 * The kicked "enters with N +1/+1 counters" payoff for a CREATURE, or null.
 * Matches the single modeled kicked shape: "If this creature was kicked, it enters with N +1/+1 counters
 * on it." (N a small word or digit). Returns `{ n }`. null for any other kicked clause (an ETB trigger, a
 * spell effect, a "for each time it was kicked" multikicker scaler). Leaf — pure text.
 */
export function entersWithKickedCounters(card) {
  const oracle = stripReminder(card?.oracle || card?.oracle_text || "");
  // Self-clause may be printed with the card name; normalize to "this creature" so a name-printed form
  // ("If Foo was kicked, …") also matches. Mirrors isKeywordOnly's name-normalization.
  let t = oracle;
  const nm = String(card?.name || "").trim();
  if (nm) {
    const esc = nm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`\\b${esc}\\b`, "g"), "this creature");
  }
  const m = t.match(/\bif this creature was kicked, it enters (?:the battlefield )?with (a|an|one|two|three|four|five|\d+) \+1\/\+1 counters? on it\b/i);
  if (!m) return null;
  // A "for each time it was kicked" magnitude is a multikicker scaler, not a fixed N — exclude (defensive;
  // multikicker is already rejected by parseKickerCost, but entersWithKickedCounters is called independently).
  if (/\bfor each\b/i.test(t)) return null;
  const n = _ENTER_NUM[m[1].toLowerCase()] ?? (parseInt(m[1], 10) || 0);
  return n > 0 ? { n } : null;
}

/**
 * KICKER-COUNTER-CREATURE — the whole-card gate. Returns `{ kickerCost, kicked: { counters } }` when the
 * card is a CREATURE with (a) a clean single Kicker cost, (b) the modeled kicked enters-with-counters
 * payoff, AND (c) a base body (Kicker line + kicked sentence stripped) that is keyword-only/vanilla per
 * the supplied `isKeywordOnly` predicate (injected to avoid a coverage.js import cycle). Otherwise null.
 *
 * All-or-nothing (THE CREED): any extra unmodeled clause in the body, a non-counter kicked payoff, or a
 * multikicker / variable cost → null → the card stays body-only (Arbiter). The SINGLE source of truth for
 * both the coverage credit and the runtime (legalChoices/dispatcher/resolver read the same fns).
 */
export function parseKickerCounterCreature(card, isKeywordOnly) {
  const type = String(card?.type || card?.type_line || "").toLowerCase();
  if (!/\bcreature\b/.test(type)) return null;
  const kickerCost = parseKickerCost(card);
  if (!kickerCost) return null;
  const kicked = entersWithKickedCounters(card);
  if (!kicked) return null;
  // Strip the Kicker line AND the kicked sentence; the remaining body must be keyword-only/vanilla. Also
  // strip any cost-only keyword line (Convoke / Affinity — Kavu Primarch's Convoke): the runtime hard-casts
  // at full cost so the unmodeled scaler can never mis-resolve (the same precedent the coverage dispatch
  // applies before the seam). Doing it HERE means coverage (which passes the already-cost-stripped card) and
  // the runtime legalChoices path (which passes the RAW card) reach the identical keyword-only verdict.
  const body = stripCostOnlyKeywordLines(stripKickerText(card?.oracle || card?.oracle_text || ""));
  if (typeof isKeywordOnly === "function" && !isKeywordOnly(body, card?.name)) return null;
  return { kickerCost, kicked: { counters: kicked.n } };
}

/**
 * Remove the "Kicker {cost}" line and the "If this creature was kicked, …" sentence from an oracle, leaving
 * the bare base body. Used by the coverage gate (residue check) and reusable by any caller that needs the
 * non-kicker body. Conservative: only strips when parseKickerCost matched (so a card without a clean kicker
 * line is returned unchanged).
 */
export function stripKickerText(oracle) {
  let t = String(oracle || "");
  // Drop the whole "Kicker {cost} (reminder…)" line (line-anchored, reminder and all).
  t = t.replace(/(?:^|\n)[^\n]*\bkicker\s+(?:\{[^}]+\})+[^\n]*(?=\n|$)/i, "\n");
  // Drop the kicked enters-with-counters sentence (the modeled payoff).
  t = t.replace(/[^.\n]*\bif this creature was kicked, it enters (?:the battlefield )?with [^.\n]*\+1\/\+1 counters? on it\.?/i, " ");
  return t.trim();
}

/**
 * Remove ONLY the "Kicker {cost} (reminder…)" line from an oracle, leaving the rest of the body intact (a
 * kicked ETB trigger / any keyword line stays). Line-anchored, reminder parens and all — mirrors stripPlot/
 * stripEmergeLine. Used by parseKickerEtbCreature so the bare body re-classifies on its own merits (the
 * trigger machinery reads the "if it was kicked" intervening-if). Conservative: a card without a clean kicker
 * line is returned unchanged.
 */
export function stripKickerLineOnly(oracle) {
  return String(oracle || "")
    .replace(/(?:^|\n)[^\n]*\bkicker\s+(?:\{[^}]+\})+[^\n]*(?=\n|$)/i, "\n")
    .trim();
}

// A kicked ETB trigger ("When this creature enters, if it was kicked, <effect>") — the payoff shape this gate
// owns. Name-printed self-references ("When Foo enters …") are normalized to "this creature" by the caller
// before the test, mirroring entersWithKickedCounters. Anchored to the "if it was kicked," intervening-if so
// it can ONLY match the genuine kicked-ETB shape (not an unconditional ETB, and not the enters-with-counters
// replacement, which carries no When/Whenever lead). The effect itself is validated downstream (the body must
// re-classify native — the trigger's effect program must route HIGH), so this is just the shape detector.
const KICKED_ETB_TRIGGER_RE = /\b(?:when|whenever) this creature enters(?:\s+the battlefield)?,\s*if it was kicked,/i;

/**
 * Does this card carry a kicked ETB-trigger payoff ("When this creature enters, if it was kicked, <effect>")?
 * Normalizes the printed name to "this creature" first (like entersWithKickedCounters) so a name-printed
 * self-reference also matches. Pure text shape check — the effect's modeled-ness is gated separately by the
 * body re-classification in parseKickerEtbCreature.
 */
export function hasKickedEtbTrigger(card) {
  const oracle = stripReminder(card?.oracle || card?.oracle_text || "");
  let t = oracle;
  const nm = String(card?.name || "").trim();
  if (nm) {
    const esc = nm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`\\b${esc}\\b`, "g"), "this creature");
  }
  return KICKED_ETB_TRIGGER_RE.test(t);
}

/**
 * KICKER-ETB-CREATURE — the whole-card gate for a CREATURE whose kicked payoff is an ETB TRIGGER (not the
 * enters-with-counters replacement parseKickerCounterCreature owns). Returns `{ kickerCost }` when the card is
 * a CREATURE with (a) a clean single Kicker cost, (b) a kicked ETB trigger ("When this creature enters, if it
 * was kicked, <effect>"), (c) NO enters-with-counters kicked payoff (that's the other classifier — avoid a
 * double claim), AND (d) a body — the Kicker LINE stripped — that the injected `classifyStripped` predicate
 * classifies into a NATIVE tier. Otherwise null.
 *
 * `classifyStripped` is `(strippedCard) => tier` (classifyCard, injected to keep kicker.js a leaf); `isNative`
 * is `(tier) => boolean` (isNativeTier). The stripped card re-runs the FULL native cascade on its bare body —
 * the kicked ETB trigger is credited iff its effect routes HIGH AND the "it was kicked" intervening-if is in
 * the strict vocabulary (triggerRouting → interveningIfParseable). So the metric credits EXACTLY the cards the
 * runtime plays: legalChoices emits the kicked cast, enterPermanent stamps `wasKicked`, the ETB trigger fires
 * its payoff only when kicked. The recursion is bounded — the stripped body has no Kicker line, so this gate
 * returns null on the inner classifyCard call (mirrors parseEmergeCard's bounded self-recursion).
 *
 * All-or-nothing (THE CREED): an unmodeled body clause / an unmodeled kicked effect / a multikicker / a
 * variable cost → null → the card stays body-only (the engine still hard-casts it; the unmodeled kicked
 * payoff routes to the Arbiter only when actually kicked). SINGLE source of truth for the coverage credit AND
 * the runtime (legalChoices reads parseKickerEtbCreature too).
 */
export function parseKickerEtbCreature(card, classifyStripped, isNative) {
  const type = String(card?.type || card?.type_line || "").toLowerCase();
  if (!/\bcreature\b/.test(type)) return null;
  const kickerCost = parseKickerCost(card);
  if (!kickerCost) return null;
  if (!hasKickedEtbTrigger(card)) return null;                 // not the ETB-trigger payoff shape
  if (entersWithKickedCounters(card)) return null;             // the counters payoff is parseKickerCounterCreature's
  if (typeof classifyStripped !== "function" || typeof isNative !== "function") return null;
  const stripped = { ...card, oracle: stripKickerLineOnly(card?.oracle || card?.oracle_text || "") };
  const bodyTier = classifyStripped(stripped);
  if (!isNative(bodyTier)) return null;                         // the bare body (keyword + kicked ETB trigger) must be native
  return { kickerCost, bodyTier };
}
