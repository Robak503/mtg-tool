/**
 * subtypeFamilies.js — WHICH CARD TYPE A SUBTYPE BELONGS TO (CR 205.3c: "each subtype is correlated to its appropriate card
 * type"). The layer-4 `setCardTypes` op (layers.js) needs it: when an effect sets an object's card types, "the subtypes correlated
 * with that card type will remain if they are also the subtypes of a card type the object currently has; otherwise, they are also
 * removed" (CR 205.1a) — an Equipment creature that becomes only a creature is no Equipment, a Dryad Arbor that becomes only a land
 * is still a Forest and no Dryad.
 *
 * The lists are transcribed from knowledge/mtg-judge/data/cr/cr_current.json — 205.3g (artifact types), 205.3h (enchantment types),
 * 205.3i (land types), 205.3j (planeswalker types), 205.3k (spell types), 205.3q (the battle type) — and the creature types are
 * effects/creatureTypes.js's CR 205.3m vocabulary (creatures and kindreds share it). subtypeFamilies.test.js re-reads the rules and
 * holds each list equal to its rule. Lowercase; the CR's curly apostrophe is the straight one the type lines print ("Urza's").
 *
 * LEAF MODULE: imports only the creature-type vocabulary leaf.
 */
import { CR_CREATURE_TYPES } from "./effects/creatureTypes.js";

export const ARTIFACT_TYPES = new Set([
  "attraction", "blood", "bobblehead", "book", "clue", "contraption", "equipment", "food", "fortification", "gold", "incubator",
  "infinity", "junk", "lander", "map", "mutagen", "powerstone", "spacecraft", "stone", "treasure", "vehicle",
]);

export const ENCHANTMENT_TYPES = new Set([
  "aura", "background", "cartouche", "case", "class", "curse", "role", "room", "rune", "saga", "shard", "shrine",
]);

export const LAND_TYPES = new Set([
  "cave", "desert", "forest", "gate", "island", "lair", "locus", "mine", "mountain", "plains", "planet", "power-plant", "sphere",
  "swamp", "tower", "town", "urza's",
]);

export const PLANESWALKER_TYPES = new Set([
  "ajani", "aminatou", "angrath", "arlinn", "ashiok", "bahamut", "basri", "bolas", "calix", "chandra", "comet", "dack", "dakkon",
  "daretti", "davriel", "dellian", "dihada", "domri", "dovin", "ellywick", "elminster", "elspeth", "estrid", "freyalise", "garruk",
  "gideon", "grist", "guff", "huatli", "jace", "jared", "jaya", "jeska", "kaito", "karn", "kasmina", "kaya", "kiora", "koth",
  "liliana", "lolth", "lukka", "minsc", "mordenkainen", "nahiri", "narset", "niko", "nissa", "nixilis", "oko", "quintorius", "ral",
  "rowan", "saheeli", "samut", "sarkhan", "serra", "sivitri", "sorin", "szat", "tamiyo", "tasha", "teferi", "teyo", "tezzeret",
  "tibalt", "tyvar", "ugin", "urza", "venser", "vivien", "vraska", "vronos", "will", "windgrace", "wrenn", "xenagos", "yanggu",
  "yanling", "zariel",
]);

export const SPELL_TYPES = new Set(["adventure", "arcane", "lesson", "omen", "trap"]);

export const BATTLE_TYPES = new Set(["siege"]);

/**
 * The card types a subtype word is correlated to (CR 205.3c), capitalized as the type line prints them: ["Creature", "Kindred"] for a
 * creature type (CR 205.3m — the two share the list; "Tribal" is Kindred's former name), ["Artifact"], ["Enchantment"], ["Land"],
 * ["Planeswalker"], ["Battle"], ["Instant", "Sorcery"]. An empty array for a word no rule lists — the caller decides what an
 * unplaceable subtype does (layers.js removes it whenever a card type is removed: never kept on a guess).
 */
export function subtypeFamilyOf(word) {
  const w = String(word || "").toLowerCase().replace(/’/g, "'");
  if (CR_CREATURE_TYPES.has(w)) return ["Creature", "Kindred", "Tribal"];
  if (ARTIFACT_TYPES.has(w)) return ["Artifact"];
  if (ENCHANTMENT_TYPES.has(w)) return ["Enchantment"];
  if (LAND_TYPES.has(w)) return ["Land"];
  if (PLANESWALKER_TYPES.has(w)) return ["Planeswalker"];
  if (BATTLE_TYPES.has(w)) return ["Battle"];
  if (SPELL_TYPES.has(w)) return ["Instant", "Sorcery"];
  return [];
}
