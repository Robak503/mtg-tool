/**
 * defenderOrder.js — the house AI's order of opponents to swing at, as ONE comparator (design §11.5): the lowest life first, then
 * the fewest untapped creatures (the easiest to push damage through). opponentAI.chooseDefender attacks the first opponent in this
 * order, and the curse reading (playerAuraEffect — Curse of Opulence, whose controller profits whenever the enchanted player is
 * attacked) enchants the same one, so the AI's attacks feed its own Curse. Two readers of one judgement, one definition.
 *
 * A leaf: layers.js only (the creature test is layer-aware — an animated man-land counts). Pure.
 */
import { permanentIsCreature } from "./layers.js";

/** A player's untapped creatures — a rough "how hard to push through". */
export function untappedCreatureCount(state, playerId) {
  const bf = state.players?.[playerId]?.battlefield || [];
  return bf.filter((p) => permanentIsCreature(state, p.id) && !p.tapped).length;
}

/** The defender order: negative when `a` is attacked before `b` (lower life, then fewer untapped creatures). */
export function compareDefenders(state, a, b) {
  const lifeDiff = (state.players?.[a]?.life ?? 0) - (state.players?.[b]?.life ?? 0);
  if (lifeDiff !== 0) return lifeDiff;
  return untappedCreatureCount(state, a) - untappedCreatureCount(state, b);
}
