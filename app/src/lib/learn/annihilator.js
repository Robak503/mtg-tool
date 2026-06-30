/**
 * annihilator.js — KW-ANNIHILATOR (CR 702.86a).
 *
 *   "Annihilator N" = "Whenever this creature attacks, defending player sacrifices N permanents."
 *
 * The defending player CHOOSES which N permanents to give up (CR 701.16 — a sacrifice; the sacrificing
 * player picks). This is the Eldrazi keyword (Ulamog/Kozilek/the legacy Eldrazi titans + the cheaper
 * Annihilator 1/2 bodies); the attack trigger has no "draw"/"deal"/etc. payoff — it is purely the forced
 * mass sacrifice, so it can't ride the generic trigger compiler (parseTriggerEffect has no
 * "defending player sacrifices N permanents" atom, and the count is keyword-derived). A targeted #319-style
 * runtime hook, fired synchronously at the declare-blockers transition alongside checkAttackTriggers /
 * applyUrDragonAttackTriggers — the same combat-trigger seam, reusing the SHIPPED edict sacrifice chain.
 *
 * WHY REUSE advanceSacrificeChain (effects/atoms/removal.js) RATHER THAN A NEW EFFECT:
 *   The edict chain already models EXACTLY "player(s) each sacrifice a permanent of their choice" — the
 *   forced-when-1 / pause-or-auto-when-≥2 split, dies-trigger firing (sacrificeCreatureEffect),
 *   sacrifice-trigger firing, eliminated-player guards, and hidden-info safety (the chooser is the
 *   permanent's own controller). "Annihilator N" = the defending player as a sacrificer N TIMES with the
 *   any-permanent pool (what:"permanent"). So this hook builds a queue of N { playerId: defender,
 *   what:"permanent" } entries per attacking annihilator and calls advanceSacrificeChain ONCE — the human
 *   defender gets a real picker (driven by the existing learnSession sacrifice-choice loop), the AI defender
 *   auto-sacs its least-valuable permanents. ZERO new effect/resolver code; ZERO change to detectTriggers /
 *   parseEffectClause.
 *
 * FIFO-SAFE MULTI-ATTACKER: setPendingSacrificeChoice guards `if (state.pendingChoice) return state` (one
 * choice at a time). Two attacking annihilators would otherwise collide — the second's chain would silently
 * no-op against the first's live pendingChoice, DROPPING sacrifices (a forbidden FP). So ALL attackers'
 * sacrifice obligations are pooled into ONE combined queue and the chain is walked ONCE. CR-faithfully, each
 * annihilator trigger is a separate ability, but the defender's net obligation (and their free choice of
 * victims) is identical whether resolved as one pooled chain or N sequential ones — and pooling is the only
 * shape compatible with the single-pendingChoice seam.
 *
 * CR: 702.86a (annihilator triggers on attack; the defending player sacrifices N permanents of their choice);
 * 702.86b (multiple instances trigger separately — summed per attacker here); 508.3a (an attack trigger fires
 * when attackers are declared — the full batch is in state.combat.attackers at declare-blockers); 701.16 (the
 * sacrificing player chooses what to sacrifice).
 *
 * Pure: regex + board reads; returns a new state (possibly carrying state.pendingChoice for a human picker).
 */

import { advanceSacrificeChain } from "./effects/atoms/removal.js";

// Keyword-position match (line start / keyword-list separator) so a reminder-text or a granted/printed
// mention buried mid-sentence can't false-fire. Mirrors fading.js's keyword anchor discipline. The capture
// is the count N. Reminder text is stripped first (CR 207.2) before matching, so the reminder's own
// "defending player sacrifices N permanents" copy can never be the match.
const ANNIHILATOR = /(?:^|\n|, |; )annihilator\s+(\d+)/gi;

/**
 * Total annihilator count on a card (summed across instances — CR 702.86b: each instance triggers
 * separately, so a creature with two "Annihilator 1" lines makes the defender sacrifice 2 per attack).
 * Returns { n } with n ≥ 1, or null when the card has no annihilator keyword. Reminder text is stripped first.
 */
export function parseAnnihilator(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "").replace(/\([^)]*\)/g, " ");
  let total = 0;
  let m;
  // Fresh lastIndex per call (the regex is module-level + global): reset so repeated calls are deterministic.
  ANNIHILATOR.lastIndex = 0;
  while ((m = ANNIHILATOR.exec(oracle)) !== null) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > 0) total += n;
  }
  return total > 0 ? { n: total } : null;
}

/**
 * At the declare-blockers transition (the full attacker batch is in state.combat.attackers), each attacking
 * creature with "Annihilator N" obligates ITS defending player to sacrifice N permanents of their choice.
 * Pools every attacker's obligation into one sacrifice chain (FIFO-safe — see the module header) and walks it
 * once: a defender with ≤1 permanent per pending pick has it forced; with ≥2 a real choice pauses for a human
 * (the learnSession sacrifice-choice loop surfaces the picker) and auto-sacs the least-valuable for an AI.
 *
 * `attacker.defender` is the defending PLAYER id, set by applyDeclareAttacker (actionDispatcher.js:
 * action.defenderId || opponentsOf(...)[0]). An attacker with no annihilator, or whose defender already left
 * the game, contributes nothing. No attackers / no annihilators → the untouched state (byte-identical no-op).
 * Pure (returns a new state; may carry state.pendingChoice for the human picker).
 */
export function applyAnnihilatorTriggers(state) {
  const attackers = state.combat?.attackers || [];
  if (!attackers.length) return state;
  const queue = [];
  const sources = [];
  for (const a of attackers) {
    const defender = a?.defender;
    if (!defender || !state.players?.[defender]) continue; // no defending player / left the game → skip
    const perm = (state.players?.[a.attackingPlayer]?.battlefield || []).find((p) => p.id === a.permanentId);
    const spec = parseAnnihilator(perm?.card);
    if (!spec) continue;
    sources.push(perm?.card?.name || "creature");
    // The defending player sacrifices N permanents of their choice — N queue entries (one permanent apiece),
    // each with the any-permanent pool. advanceSacrificeChain re-reads the board per pick, so N entries for
    // the same defender sacrifice N distinct permanents one at a time (CR 701.16 — their choice each time).
    for (let i = 0; i < spec.n; i++) queue.push({ playerId: defender, what: "permanent" });
  }
  if (!queue.length) return state;
  // ONE chain for the whole batch (FIFO-safe). sourceName for the decision log: the attacking annihilator(s).
  return advanceSacrificeChain(state, { queue, sourceName: sources.join(", ") });
}
