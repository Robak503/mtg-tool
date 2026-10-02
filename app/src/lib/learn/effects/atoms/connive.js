/**
 * effects/atoms/connive.js — CONNIVE (BLITZ EK-1, CR 701.50 / 701.50a): "draws a card, then discards a
 * card. If a nonland card is discarded this way, that player puts a +1/+1 counter on the conniving
 * permanent." The Streets-of-New-Capenna ETB/attack family (Red Room Recruit, Raffine's Informant,
 * Atlantean Skirmisher, Mob Lookout's chosen-target form).
 *
 * SEQUENCE (exact, CR 701.50a): (1) the conniving permanent's CONTROLLER draws 1; (2) that player
 * discards 1 CHOSEN card (the interactive pending-choice seam — kind "discard", the SAME chain the
 * each-player discard uses, carrying a `connive` rider); (3) if the discarded card is a NONLAND, a
 * +1/+1 counter lands on the conniving permanent — routed through applyAddCounter (target:
 * "thatCreature") so counter DOUBLERS (CR 616) and the COUNTERS-PLACED watchers (CR 122.6) compose
 * exactly like any other placement. The landness check is on the ACTUAL discarded card, resolved
 * AFTER the choice settles (runProgram.resolveDiscardChoice consumes the rider) — the seam whose
 * absence parked connive before this slice (see bolsterEndureKeywords.test.js's old park note).
 *
 * EDGES (all CR-pinned):
 *   - Empty hand after the draw → the discard is impossible; the permanent still "connives"
 *     (CR 701.50b — the process completes even when actions are impossible) and NO counter lands.
 *   - Exactly ONE non-token card in hand → a FORCED discard (no real choice): pitched inline with no
 *     pause (advanceDiscardChain's forced-branch discipline), landness checked immediately.
 *   - The conniving permanent left the battlefield before resolution → the draw + discard STILL
 *     happen for the trigger's controller (CR 701.50c last-known information); the counter simply
 *     can't be placed (applyAddCounter's absent-referent no-op).
 *   - "connive N" / "connives X" (variable draw-discard counts) are NOT modeled — no printed fixed-N
 *     form exists in the corpus (verified 2026-07-17: every non-plain form is "connives X, where X…"),
 *     and the parser deliberately leaves them unmatched → LOW → Arbiter (a SAFE false-negative).
 *
 * Subject resolution mirrors applyExplore exactly: "self" → ctx.sourceId; "thatCreature" →
 * ctx.triggeringPermanentId; "targetCreature" → the chosen ctx.targets creature (Mob Lookout's
 * "target creature you control connives" — targetType creatureYouControl, an OWN-side pool, so the
 * trigger flush routes it natively). Pure data mutation — serialize-safe (the pending choice is
 * plain JSON; the rider is `{ permanentId, controller }`).
 */

import { moveCardToZone, findPermanent, logEvent } from "../../gameState.js";
import { checkDiscardTriggers } from "../../triggers.js"; // TRIG-DISCARD (CR 701.9a) — a connive discard is a discard
import { applyDrawEffect } from "../../spellEffects.js"; // THE shared draw path — fires the card-drawn/second-draw watchers (CR 121.2; the hand.js handCardMatches edge, cycle-safe)
import { setPendingDiscardChoice } from "../../pendingChoice.js";
import { isLandCard } from "./shared.js";
import { applyAddCounter } from "./counters.js";

/**
 * The CR 701.50a counter step, shared by the inline forced-discard path (below) and the interactive
 * settle path (runProgram.resolveDiscardChoice): a NONLAND card was discarded this way → put ONE
 * +1/+1 counter on the conniving permanent. Routed through applyAddCounter's thatCreature referent so
 * doublers (CR 616) + counters-placed watchers (CR 122.6) compose; an absent/non-creature referent
 * (the permanent left the battlefield mid-process) is applyAddCounter's clean no-op — never a
 * fabricated counter, never a skipped draw/discard.
 */
export function applyConniveCounter(state, permanentId, placerId) {
  if (!permanentId || !placerId) return state;
  return applyAddCounter(
    state,
    { op: "add-counter", counterType: "+1/+1", amount: 1, target: "thatCreature" },
    { controller: placerId, targets: [], triggeringPermanentId: permanentId },
  );
}

export function applyConnive(state, atom, ctx) {
  // Subject resolution (the applyExplore pattern): which permanent connives?
  const subjectId = atom.target === "thatCreature"
    ? ctx.triggeringPermanentId
    : atom.target === "targetCreature"
      ? (ctx.targets?.find((t) => t.type === "creature")?.id ?? ctx.targets?.[0]?.id ?? null)
      : ctx.sourceId;
  // The acting player: the conniving permanent's CURRENT controller (a stolen creature connives for
  // its thief); left-the-battlefield → the trigger's controller (CR 701.50c last-known information).
  const lk = subjectId ? findPermanent(state, subjectId) : null;
  const controller = lk ? lk.controller : ctx.controller;
  if (!state.players?.[controller]) {
    return logEvent(state, { kind: "spell-effect", effect: "connive", controller, drew: false });
  }
  // (1) Draw a card (CR 701.50a — the draw always happens, even if the permanent has left). Through the
  // SHARED applyDrawEffect so the card-drawn / second-draw watchers fire (CR 121.2 — Kang's and Madame
  // Masque's own "draw your second card each turn" triggers must count connive's draw).
  let next = applyDrawEffect(state, { controller, amount: 1 });
  next = logEvent(next, { kind: "spell-effect", effect: "connive", controller, permanentId: subjectId, drew: true });
  // (2) Discard a card — the DISCARDING player chooses (CR 701.8).
  const hand = (next.players[controller]?.hand || []).filter((c) => !c.token);
  if (hand.length === 0) {
    // Impossible discard — the connive still completes (CR 701.50b); no counter (nothing discarded).
    return logEvent(next, { kind: "spell-effect", effect: "connive-discard", controller, discarded: 0 });
  }
  if (hand.length === 1) {
    // FORCED — the whole (one-card) hand goes; no real choice, no pause (the advanceDiscardChain
    // forced-branch discipline). Landness checked inline on the pitched card.
    const c = hand[0];
    next = moveCardToZone(next, { playerId: controller, fromZone: "hand", toZone: "graveyard", cardId: c.id });
    next = logEvent(next, { kind: "spell-effect", effect: "discard", controller, discarded: 1, forced: true });
    next = checkDiscardTriggers(next, controller, [c.id]);
    if (!isLandCard(c)) next = applyConniveCounter(next, subjectId, controller);
    return next;
  }
  // A REAL choice: pause on the shared "discard" pending-choice kind (the driver pauses a human,
  // auto-picks an AI's cheapest), carrying the connive rider for resolveDiscardChoice's landness step.
  // runProgram attaches the program resume to this pause exactly like every other pausing atom.
  const candidates = hand.map((c) => ({ id: c.id, name: c.name }));
  return setPendingDiscardChoice(next, {
    controller,
    remaining: 1,
    candidates,
    queue: [{ playerId: controller, remaining: 1 }],
    sourceName: ctx.cardName || null,
    connive: { permanentId: subjectId, controller },
  });
}

/**
 * CONNIVE clause parser (CR 701.50a) — the PLAIN (draw 1 / discard 1 / conditional single counter)
 * forms only, whole-clause `^…$` anchored (CREED fail-closed):
 *   - "this creature connives"           → the SOURCE (a self ETB/attack trigger, after the
 *     detectTriggers it/he/she + self-name rewrites — Red Room Recruit, Tiger Shark, Pharaoh Rama-Tut).
 *   - "the triggering creature connives" → the TRIGGERING creature (a non-self watcher's rewritten
 *     pronoun — Swordsman, Sharp Scoundrel's equipped-attacker form; the Path-of-Discovery pattern).
 *   - "target creature you control connives" → the CHOSEN own-side target (Mob Lookout, Namor,
 *     Scorpion's end-step form — the EX-1 chosen-target explore pattern; own pool → flush-routable).
 * DELIBERATELY unmatched → LOW → Arbiter (safe FNs): "connives X" (variable count — Raffine, Mask of
 * the Schemer), subtype-restricted targets ("target Villain/Hero you control connives" — the target
 * enumerator has no subtype pool for those), bare "target creature connives" (Obscura Confluence's
 * modal bullet — an ANY-side pool the flush intent model can't place), "you may have it connive"
 * (Baron Strucker's optional + once-each-turn rider), and every anaphoric mid-program "It connives"
 * (Kamiz, Doctor Doom — the pronoun binds a PRIOR clause's target, unmodeled).
 */
export function conniveClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  if (/^this creature connives$/.test(t)) return { op: "connive", target: "self", targetType: null };
  if (/^the triggering creature connives$/.test(t)) return { op: "connive", target: "thatCreature", targetType: null };
  if (/^target creature you control connives$/.test(t)) return { op: "connive", target: "targetCreature", targetType: "creatureYouControl" };
  return null;
}

export const conniveResolvers = {
  "connive": applyConnive, // CONNIVE (CR 701.50a) — draw 1 → chosen discard (pause) → +1/+1 on nonland
};
