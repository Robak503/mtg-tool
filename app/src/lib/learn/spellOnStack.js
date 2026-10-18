/**
 * spellOnStack.js — what an effect reads off a SPELL ON THE STACK: its mana value (CR 202.3) and whether it passes a
 * counterspell's filter.
 *
 * A leaf (it imports only faceUp.js, itself a leaf), so every place that asks gets ONE answer and none can drift: the counter's target
 * enumeration (spellEffects.enumerateTargets), the counter's resolution re-check (effects/atoms/stack.applyCounter),
 * the delayed mana and life loss sized by "that spell's mana value" (Mana Drain, Imp's Mischief), the cast and copy
 * watchers (triggers.checkCastTriggers / checkCopyTriggers — "whenever a player casts a spell with mana value 3 or
 * less", Kellan's "equal or lesser mana value", cascade's cap) and the forced trigger-target pick
 * (gameEngine.pickForcedTriggerCandidate).
 *
 * Until 2026-10-17 the counter filters and the cast watchers read the CARD's printed `cmc`: Hungering Hydra cast for
 * X = 5 (mana value 6 on the stack) was a legal target for Thoughtbind ("mana value 4 or less") and not for Disdainful
 * Stroke ("4 or greater"), and Fire cast from Fire // Ice read as the whole card's 4.
 */
import { characteristicColors } from "./faceUp.js"; // a spell's colours — the face being cast (CR 712.8c); a leaf

/**
 * The mana value of a mana cost string (CR 202.3): a generic number counts its value, a hybrid symbol its largest component
 * (CR 202.3f), a Phyrexian symbol 1 (CR 202.3g), every other symbol 1, and {X} / {Y} / {Z} 0 — the value they have off the
 * stack (CR 202.3e); `spellManaValue` adds the announced X.
 */
export function manaCostValue(cost) {
  let mv = 0;
  for (const sym of String(cost || "").matchAll(/\{([^}]+)\}/g)) {
    const s = sym[1];
    if (/^\d+$/.test(s)) mv += parseInt(s, 10);
    else if (/^[XYZ]$/i.test(s)) mv += 0;
    else {
      const lead = s.match(/^(\d+)/); // {2/W} — the largest component is the 2
      mv += lead ? parseInt(lead[1], 10) : 1;
    }
  }
  return mv;
}

/**
 * THE MANA VALUE OF A SPELL (CR 202.3), from the characteristics it has on the stack (`face` — a stack object's `source`)
 * and the X announced for it (CR 107.3a).
 *  - A face that rides the stack as one half of a multi-faced card keeps the WHOLE card's `cmc`, so its own mana cost is
 *    summed instead: a split card's half (CR 202.3d — "while a split card is on the stack, the mana value of the spell is
 *    determined by the mana cost of the half that was chosen to be cast"; CR 709.3 — the half is chosen before the card is
 *    put on the stack, and only its characteristics exist there, CR 709.3b) and an Adventure (CR 715.3 — chosen as the
 *    card is played; on the stack as an Adventure it has only its alternative characteristics, CR 715.3b). A cost that
 *    still names both halves ("{1}{R} // {1}{U}") is the whole card on the stack — a fused split spell, whose mana value is
 *    its combined costs' (CR 202.3d), or an adventurer cast normally, which has only its normal characteristics
 *    (CR 715.4) — and reads its `cmc`.
 *  - Every other spell reads its `cmc` (or `mana_value`): a modal double-faced face carries its own (modalDfc.js); a
 *    kicked, bestowed or flashback cast keeps the printed value — additional and alternative costs don't change a spell's
 *    mana cost (CR 118.8d, 118.9c). A card that carries neither number sums its mana cost.
 *  - {X} is the announced value while the spell is on the stack (CR 202.3e), once per {X} in the mana cost; the printed
 *    part reads X as 0. An X paid in life, not in the mana cost, adds nothing.
 */
const FACE_COSTED_LAYOUTS = new Set(["split", "adventure"]);
export function spellManaValue(face, xValue = null) {
  const cost = String(face?.mana ?? face?.mana_cost ?? "");
  const printedNumber = face?.cmc ?? face?.mana_value;
  const ownHalf = FACE_COSTED_LAYOUTS.has(face?.layout) && !cost.includes("//");
  const printed = ownHalf || !Number.isFinite(printedNumber) ? manaCostValue(cost) : Math.floor(printedNumber);
  return printed + (cost.match(/\{X\}/gi) || []).length * Math.max(0, Number(xValue) || 0);
}

/**
 * The mana value of the spell `obj` on the stack. X rides the payload's params where its resolver reads it (an effect program,
 * a permanent spell — and every copy, which clones that payload: CR 707.10 copies "the value of X"), else the stack object
 * itself (actionDispatcher.applyCastSpell stamps it for an Aura, a planeswalker and the Arbiter's no-op).
 */
export function stackSpellManaValue(obj) {
  return spellManaValue(obj?.source, obj?.payload?.params?.xValue ?? obj?.xValue);
}

// A double-faced spell's combined "Front // Back" type line: a nonmodal double-faced spell has its front face up on the
// stack and only that face's characteristics (CR 712.8c). A face the engine projected (a split half, an Adventure, a modal
// face) carries no "//".
const frontTypeLine = (card) => String(card?.type || card?.type_line || "").split(" // ")[0];

/**
 * A counter's COLOR read (Gainsay, Frazzle, Ceremonious Rejection, Neutralizing Blast): the spell's colours — the face being
 * cast's (faceUp.characteristicColors: a double-faced spell's front face, CR 712.8c, whose top-level field is Scryfall's empty
 * placeholder). Null when unresolvable (no colours array at all), and a null never matches a colour-restricted counter: an
 * illegal target is the cardinal sin, a dropped legal one a safe false negative. Before 2026-10-18 the front face was read off
 * `card_faces` only, which the enriched game deck does not carry: Gainsay could not target Delver of Secrets in a game.
 */
export function counterColorsOf(card) {
  return Array.isArray(card?.colors) ? characteristicColors(card) : null;
}

/**
 * Does the spell `stackObj` pass a counter's filter — the spell type (`filter`) and the atom's mana value (`exactMv` —
 * Spell Snare, Mental Misstep; `minMv` / `maxMv` — Disdainful Stroke, Minor Misstep, Thoughtbind) and colour
 * (`colorFilter`)? THE ONE READ for both sides of a counter: the enumeration ("is it a legal target?", CR 601.2c) and the
 * resolution re-check ("is it still legal?", CR 608.2b). The mana value is the spell's on the stack (stackSpellManaValue).
 * The parser emits at most one of exactMv / minMv / maxMv per atom, so each is tested on its own.
 */
export function spellMatchesCounterFilter(stackObj, filter, atom = null) {
  const card = stackObj?.source;
  const type = frontTypeLine(card);
  if (atom?.exactMv != null || atom?.minMv != null || atom?.maxMv != null) {
    const mv = stackSpellManaValue(stackObj);
    if (atom.exactMv != null && mv !== atom.exactMv) return false;
    if (atom.minMv != null && !(mv >= atom.minMv)) return false;
    if (atom.maxMv != null && !(mv <= atom.maxMv)) return false;
  }
  if (atom?.colorFilter != null) {
    const cf = atom.colorFilter;
    const colors = counterColorsOf(card);
    if (colors == null) return false; // FAIL-CLOSED — unresolvable colours never match a colour-restricted counter
    if (cf.colorless && colors.length !== 0) return false;       // "counter target colorless spell"
    if (cf.multicolored && colors.length < 2) return false;      // "counter target multicolored spell"
    if (cf.color && (cf.negate ? colors.includes(cf.color) : !colors.includes(cf.color))) return false; // (non)blue, etc.
  }
  if (filter === "noncreature") return !/Creature/.test(type);
  if (filter === "creature") return /Creature/.test(type);
  // CNT-TYPE — single-type and two-type-union hard counters (Dispel, Envelop, Artifact Blast, Annul, Nullify).
  if (filter === "instant") return /\bInstant\b/.test(type);
  if (filter === "sorcery") return /\bSorcery\b/.test(type);
  if (filter === "artifact") return /\bArtifact\b/.test(type);
  if (filter === "artifactOrEnchantment") return /\b(?:Artifact|Enchantment)\b/.test(type);
  if (filter === "creatureOrAura") return /\bCreature\b/.test(type) || /\bAura\b/.test(type);
  if (filter === "instantSorcery") return /\b(?:Instant|Sorcery)\b/.test(type);              // Flusterstorm, Quash
  if (filter === "instantOrAura") return /\bInstant\b/.test(type) || /\bAura\b/.test(type);  // Avoid Fate
  if (filter === "enchantmentInstantSorcery") return /\b(?:Enchantment|Instant|Sorcery)\b/.test(type); // Swan Song
  if (filter === "artifactCreaturePlaneswalker") return /\b(?:Artifact|Creature|Planeswalker)\b/.test(type); // Strix Serenade
  return true; // "any"
}
