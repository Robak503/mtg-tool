/**
 * playerAuraEffect.js — THE CURSE READING (2026-10-16): which player an "Enchant player" Aura belongs on.
 *
 * An Aura on a player has no host to bonus, so staticAbilityParser.parseAuraBonus reads nothing for it and the shared intent
 * reader (auraCastIntent) has no side to give. What the Aura does is in its triggers, and they act on the enchanted player
 * (CR 303.4b — the player an Aura is attached to is "enchanted"). So this reads each trigger the way the trigger runtime fires
 * it — triggers.detectTriggers, then the SAME parse gameEngine.buildTriggerStack runs on the effect clause
 * (parseEffectClause(clause, "Instant", { hasX, sourceScoped: true })) — and looks every resulting atom up in
 * ENCHANTED_PLAYER_EFFECTS: what that op does to the enchanted player, keyed by op.
 *
 * An entry carries `side` — "enemy" (an opponent should be enchanted) or "own" (the controller) — and `rank(state, playerId)`,
 * which orders the players on that side, lowest first, or `compare(state, a, b)`, a comparator in its place (negative: `a` first). A trigger that doesn't parse HIGH, a modal one, or an atom whose op has
 * no entry makes the whole reading null: the Aura's side is unknown and the caller holds it, never guesses. So a player Aura
 * whose trigger is newly modeled needs its op added here before it is cast on anyone. Two different entries on one card read
 * null too (no single ranking).
 *
 * Callers: opponentAI.pickAuraCast (the cast side). Imports triggers.js and effects/parser.js.
 */
import { detectTriggers } from "./triggers.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { compareDefenders } from "./defenderOrder.js";

export const ENCHANTED_PLAYER_EFFECTS = Object.freeze({
  // Fraying Sanity — "enchanted player mills X cards" (effects/atoms/library.applyEnchantedGyMill): an opponent, the one with
  // the fewest cards in library (a player who draws from an empty library loses, CR 704.5b).
  "enchanted-gy-mill": Object.freeze({ side: "enemy", rank: (state, playerId) => (state.players?.[playerId]?.library || []).length }),
  // Curse of Opulence and its siblings — "Whenever enchanted player is attacked, <effect>. Each opponent attacking that player does
  // the same." (effects/effectAtoms.applyYouAndAttackingOpponents): the controller profits every time the enchanted player is
  // attacked, by anyone. An opponent — the one the house AI swings at itself (defenderOrder.compareDefenders: the lowest life,
  // then the fewest untapped creatures), so every one of its own attacks pays it.
  "you-and-attacking-opponents": Object.freeze({ side: "enemy", compare: compareDefenders }),
});

/** The one ENCHANTED_PLAYER_EFFECTS entry every atom of every trigger of a player Aura reads as, or null (unknown — hold). */
export function playerAuraEffect(card) {
  const effects = new Set();
  for (const d of detectTriggers(card)) {
    const program = parseEffectClause(d.effectClause, "Instant", { hasX: !!d.effectHasX, sourceScoped: true });
    if (!program || programConfidence(program) !== "high" || program.structure === "modal") return null;
    for (const atom of program.atoms || []) {
      const effect = ENCHANTED_PLAYER_EFFECTS[atom.op];
      if (!effect) return null;
      effects.add(effect);
    }
  }
  return effects.size === 1 ? [...effects][0] : null;
}
