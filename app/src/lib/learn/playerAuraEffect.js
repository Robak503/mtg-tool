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
 * no entry makes the whole reading null: the curse reading has no side, and the caller falls to the printed reading below. So a
 * newly modeled op needs its entry here before this reading ranks it (until then a Curse goes on the opponent the AI attacks,
 * and anything else the printed reading can't tell is held). Two different entries on one card read null too (no single
 * ranking).
 *
 * THE PRINTED READING (2026-10-17, printedPlayerAuraSide): every player Aura is now cast on a player, whatever its tier, and one
 * whose text the engine doesn't model sits on that player inert. Where the curse reading has nothing (a trigger it can't read,
 * or no trigger), the side comes from what is printed — the face being cast, the face that is up (CR 712.8a):
 *   · a Curse (the enchantment type, CR 205.3h — it has no rules meaning of its own) → an opponent, the one the house AI attacks
 *     (compareDefenders): every printed Curse burdens the player it enchants, or rewards whoever attacks that player;
 *   · an Aura whose every line past its Enchant line gives the enchanted player an additional step or phase (Paradox Haze's extra
 *     upkeep, Shadow of the Second Sun's extra beginning phase) → the controller itself;
 *   · an Aura whose every line is one of Grievous Wound's — the enchanted player can't gain life, or loses half their life when
 *     dealt damage → an opponent, the one the AI attacks;
 *   · anything else → null, held: Wheel of Sun and Moon (it can protect or punish), Psychic Possession (its "Skip your draw step"
 *     is the line the engine plays; the draw that pays for it is not), Archnemesis, Tenuous Truce, Overencumbered.
 * playerAuraSide reads the curse reading first, then this.
 *
 * Callers: opponentAI.pickAuraCast (the cast side). Imports triggers.js, effects/parser.js, faceUp.js and staticAbilityParser.js.
 */
import { detectTriggers } from "./triggers.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { compareDefenders } from "./defenderOrder.js";
import { faceUpView } from "./faceUp.js";
import { isAuraCard, auraEnchantSubject } from "./staticAbilityParser.js";

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

// PRINTED READING entries (see the header). The Curse rule and the Grievous Wound lines go on an opponent, the one the house AI
// attacks; the extra-step lines on the controller (`rank` 0 — the controller is the only player on its own side).
const PRINTED_ENEMY = Object.freeze({ side: "enemy", compare: compareDefenders });
const PRINTED_OWN = Object.freeze({ side: "own", rank: () => 0 });
// "At the beginning of [each of] enchanted player's <step or phase>, that player gets an additional <step> after this step." /
// "…, there is an additional <phase> after this phase." — Paradox Haze, Shadow of the Second Sun (reminder text stripped first).
const EXTRA_STEP_LINE = /^at the beginning of (?:each of )?enchanted player's [a-z ]+, (?:that player gets an additional [a-z]+ step after this step|there is an additional [a-z]+ phase after this phase)\.?$/;
// Grievous Wound's two lines.
const ENEMY_LINES = [/^enchanted player can't gain life\.?$/, /^whenever enchanted player is dealt damage, they lose half their life, rounded up\.?$/];

/** The printed side of an Aura that enchants a player (header: THE PRINTED READING), or null (hold). */
export function printedPlayerAuraSide(card) {
  const face = faceUpView(card);
  if (!isAuraCard(face)) return null;
  const subject = auraEnchantSubject(face);
  if (subject !== "player" && subject !== "opponent") return null;
  if (/\bCurse\b/.test(String(face.type || face.type_line || ""))) return PRINTED_ENEMY;
  const lines = String(face.oracle || face.oracle_text || "")
    .split("\n")
    .map((l) => l.replace(/\([^)]*\)/g, "").trim().toLowerCase())
    .filter((l) => l && !/^enchant (?:player|opponent)$/.test(l));
  if (lines.length === 0) return null;
  if (lines.every((l) => EXTRA_STEP_LINE.test(l))) return PRINTED_OWN;
  if (lines.every((l) => ENEMY_LINES.some((re) => re.test(l)))) return PRINTED_ENEMY;
  return null;
}

/** The side an Aura that enchants a player goes on: the curse reading (its triggers, as the runtime fires them), else the printed reading. */
export function playerAuraSide(card) {
  return playerAuraEffect(card) || printedPlayerAuraSide(card);
}
