/**
 * combatRemoval.js — CR 506.4: the one write that takes an ATTACKER out of combat, and the one read of whether a
 * permanent is a BLOCKING creature right now.
 *
 * CR 506.4: "A permanent is removed from combat if it leaves the battlefield, if its controller changes, if it phases
 * out, if an effect specifically removes it from combat, … or if it's an attacking or blocking creature that regenerates
 * (see rule 701.19) … A creature that's removed from combat stops being an attacking, blocking, blocked, and/or unblocked
 * creature."
 *
 * The engine's combat state (state.combat) holds one record per attacking creature — attacking-ness IS membership in
 * `attackers` — and one record per block in `blockers` ({ blockerId, blockingPlayer, attackerId }). The two sides are
 * removed differently, and the difference is the rules':
 *   · An ATTACKER removed from combat loses its record. No block is offered against it, it deals no combat damage, no
 *     "attacking creature" effect or target reads it, and its former blockers block nothing it can be dealt damage by
 *     (CR 510.1d). The writers: the battlefield-exit chokepoint (gameState.detachPermanentFromAll), the control-change
 *     chokepoint (controlMove.moveControl), regeneration (gameState.regeneratePermanent). Phasing out
 *     (gameState.phaseOutPermanents) and the Gustcloak escape (atoms/combat.js) drop the record at their own splices.
 *   · A BLOCKER removed from combat KEEPS its records: the creature it blocked remains blocked (CR 509.1h — "A creature
 *     remains blocked even if all the creatures blocking it are removed from combat") and assigns no combat damage with no
 *     creature blocking it (CR 510.1c), trample aside (CR 702.19d). A blocker that left the battlefield is found by no
 *     reader; one that stays (a control change, a regeneration) carries the `removedFromCombat` stamp — the CR 701.19a
 *     regeneration vehicle, cleared at end of combat — which combat damage already honors and which isBlockingCreature
 *     below reads for every "blocking creature" effect and target.
 *
 * ZERO IMPORTS: controlMove.js (itself zero-import, and called from gameState.js) and gameState.js both use this module,
 * so any import here could close a cycle back into the lowest layer. Pure data in, pure data out.
 */

/** The state without `permanentId`'s attacker record (the state itself when there is no combat record at all). */
export function withoutAttackerRecord(state, permanentId) {
  const attackers = state?.combat?.attackers;
  if (!Array.isArray(attackers)) return state;
  return { ...state, combat: { ...state.combat, attackers: attackers.filter((a) => a?.permanentId !== permanentId) } };
}

/** Was `permanentId` declared as a blocker this combat (whether or not it is still blocking)? */
export function hasBlockerRecord(state, permanentId) {
  return (state?.combat?.blockers || []).some((b) => b?.blockerId === permanentId);
}

/**
 * Is the battlefield permanent `perm` a blocking creature right now: declared as a blocker this combat and not removed
 * from combat since (CR 506.4)? The caller passes the permanent it found on the battlefield, so a blocker that left is
 * never asked about.
 */
export function isBlockingCreature(state, perm) {
  return !perm.removedFromCombat && hasBlockerRecord(state, perm.id);
}
