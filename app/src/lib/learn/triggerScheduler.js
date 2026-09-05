/**
 * triggerScheduler.js — PHASE-TRIGGER-FRAMEWORK (Wave 1).
 *
 * Extends the phase/step trigger SPINE (triggers.js classifyCondition handles
 * "your/each upkeep|end step|draw step"; checkStepTriggers emits them) to the
 * FOUR missing step-kinds so their triggers actually fire:
 *
 *   - "At the beginning of combat on your turn"     -> event "combatBegin", whose "yours"
 *   - "At the beginning of each combat"             -> event "combatBegin", whose "any"
 *   - "At the beginning of your first main phase"   -> event "firstMain",   whose "yours"
 *   - "At the beginning of each opponent's upkeep"  -> event "upkeep",      whose "opponents"
 *
 * REGISTRATION: triggers.js imports detectPhaseTrigger at its bottom and calls
 * registerTriggerDetector(detectPhaseTrigger) once — that gives GLOBAL visibility
 * (every importer of triggers.js, runtime AND the coverage metric, sees it). This
 * module NEVER self-registers and NEVER imports triggers.js back: it exports only
 * pure functions and references opponentsOf ONLY inside function bodies (call-time),
 * so triggers.js can import it at load time without a TDZ cycle.
 *
 * CREED (CLAUDE.md §1.2): every matcher is whole-condition anchored (^...$). The
 * condition reaching the detector is the text the keyword regex captured AFTER the
 * leading "At "/"When "/"Whenever " keyword and AFTER splitTriggerSentence peeled
 * the effect/intervening-if clause — empirically "the beginning of combat on your
 * turn" (note the leading "the "). A variant carrying residue past the anchor —
 * "on each of your turns", "your NEXT upkeep" (a delayed trigger), or any extra
 * filter — fails the anchor and stays UNDETECTED -> the card routes to the Arbiter
 * (a SAFE false-negative; we never over-fire on a shape we can't place exactly).
 *
 * This module is PURE detection: it exports only functions, imports nothing back
 * from triggers.js, and the whose:"opponents" gate (which needs opponentsOf) lives
 * in triggers.js' triggersForEvent — so triggers.js can import this at load time
 * with no TDZ cycle.
 */

/**
 * Normalize the condition the detector receives to its bare phase form: lowercase,
 * trim, and drop a single leading "the " (the keyword regex captures "At" and leaves
 * "the beginning of …"). Mirrors classifyCondition's `condRaw.toLowerCase().trim()`
 * so the anchored matchers below see the same canonical text the spine does.
 */
function bareCondition(condition) {
  return String(condition || "").toLowerCase().trim().replace(/^the\s+/, "");
}

/**
 * Detect the FOUR phase/step triggers the spine doesn't. Returns a TriggerDescriptor
 * classification { event, scope, whose } for an ANCHORED match, else null (CREED —
 * any residue past the anchor must NOT match). `cardName`/`typeLine` are accepted to
 * match the registerTriggerDetector contract but aren't needed here (these conditions
 * carry no self-reference). The "yours"/"any" whose values reuse the spine's
 * upkeep/draw/endStep gating in triggersForEvent verbatim; "opponents" is the new
 * branch wired alongside it. The apostrophe in "opponent's" is ASCII U+0027.
 */
export function detectPhaseTrigger(condition /*, cardName, typeLine */) {
  const c = bareCondition(condition);
  if (c === "beginning of combat on your turn") {
    return { event: "combatBegin", scope: "you", whose: "yours" };
  }
  if (c === "beginning of each combat") {
    return { event: "combatBegin", scope: "you", whose: "any" };
  }
  if (c === "beginning of your first main phase"
      // The pre-2021 templating for the SAME phase (CR 505.1a — the first main phase IS the precombat
      // one; this engine has no extra-combat phases, so the equivalence is structural). 3 corpus
      // carriers print it: Radiation, Wrenn and One, Alberix the Trade Planet.
      || c === "beginning of your precombat main phase") {
    return { event: "firstMain", scope: "you", whose: "yours" };
  }
  // The SECOND main phase (CR 505.1b) — the exact sibling of the arm above, and it was simply missing.
  // "Second main phase" and "postcombat main phase" are the same phase under two templatings, the same
  // equivalence firstMain already relies on (this engine has no extra-combat phases, so it is structural).
  // gameState's phase order carries "postcombat-main" with step "main", and gameEngine fires this event at
  // that entry — gated on the PHASE, because both mains share step "main" and a step-only gate would
  // double-fire. Michelangelo, the Heart (Halfshell heroes) is the shelf card behind it.
  if (c === "beginning of your second main phase"
      || c === "beginning of your postcombat main phase") {
    return { event: "secondMain", scope: "you", whose: "yours" };
  }
  // CARPET OF FLOWERS (POD-SIM THREE · KT-10a, 2026-09-05): "at the beginning of each of your main phases" — BOTH mains,
  // yours only. A distinct event the engine fires at each main hook beside firstMain / secondMain.
  if (c === "beginning of each of your main phases") {
    return { event: "anyMain", scope: "you", whose: "yours" };
  }
  if (c === "beginning of each opponent's upkeep") {
    return { event: "upkeep", scope: "you", whose: "opponents" };
  }
  return null;
}
