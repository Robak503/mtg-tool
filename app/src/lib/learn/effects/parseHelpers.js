/**
 * effects/parseHelpers.js — shared, pure parse-time helpers for the recognition layer.
 *
 * A LEAF module: imports nothing from sibling engine modules, so both parser.js AND the per-family
 * clause-parser modules (atoms/*.js, the matcher-registry seam) can import these without the TDZ
 * import cycle that forbids an atoms module from importing parser.js. Grows as the parser.js
 * matcher-registry seam migrates families out of parseExtendedAtom and they need a shared dep here.
 */

// Spelled cardinals a..five (with the "a"/"an" article forms). The canonical small-count word map the
// parseExtendedAtom matchers use as `SMALL_NUM[word] ?? parseInt(word, 10)`.
export const SMALL_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

// Spelled cardinals up to ten — mill amounts ("Mill three cards", "Mill ten cards") are spelled out.
export const NUM_WORD = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

// ===== DMG-SCALE / FOR-EACH ===== a board-count SOURCE — the "X" in "equal to the number of X" (and,
// later, "for each X"). Returns a `countSpec` the resolver computes AT RESOLUTION (CR 608.2h — a
// count-derived value is locked as the spell/ability resolves), or null for an unmodeled source (→ low
// → Arbiter). Slice 1 (WALT-DMG-SCALE) admits only CONTROLLER-scoped counts: permanents YOU control by
// card TYPE (creature/land/artifact/enchantment) or basic-land SUBTYPE (the CLOSED set Mountain/Forest/
// Island/Plains/Swamp), cards in YOUR hand, and (FOR-EACH) cards in YOUR graveyard (optionally typed).
// Opponent-scoped counts ("creatures they control", "cards in that player's hand"), creature subtypes
// (Goblins/Elves), and exotic sources (snow / attacking / "in excess of" / devotion) are NOT modeled →
// null → the whole clause routes low. SINGULAR and PLURAL both map to the same count: DMG-SCALE reads
// "the number of creatureS you control"; FOR-EACH reads "for each creature you control".
const COUNT_TYPE = { creature: "creature", creatures: "creature", land: "land", lands: "land", artifact: "artifact", artifacts: "artifact", enchantment: "enchantment", enchantments: "enchantment" };
const COUNT_BASIC_SUBTYPE = { mountain: "Mountain", mountains: "Mountain", forest: "Forest", forests: "Forest", island: "Island", islands: "Island", swamp: "Swamp", swamps: "Swamp", plains: "Plains" };
const COUNT_GY_TYPE = { creature: "creature", artifact: "artifact", land: "land", instant: "instant", sorcery: "sorcery", enchantment: "enchantment", planeswalker: "planeswalker" };
// ===== COUNT SUBTYPES ===== a CURATED allowlist of permanent SUBTYPES that appear in "<X>s you control"
// count sources (tribal "for each Goblin you control" / "number of Elves you control", artifact-token
// counts "for each Treasure", etc.). Keyed on BOTH the singular and plural surface form → the canonical
// singular subtype; countForSpec.countMatches then matches `\b<Subtype>\b` against the permanent's type
// line (exactly like the basic-land subtypes Mountain/Forest). CURATED (not generic) so a non-subtype word
// can never be mis-matched (CREED): every entry is a real MTG subtype, and a qualified count ("tapped
// Goblin you control") still fails the `^…$` anchor → low. The irregular plurals (Elves/Allies/Wolves) are
// listed explicitly so the canonical form fed to countMatches is correct.
const COUNT_SUBTYPE = {
  // creature tribes
  goblin: "Goblin", goblins: "Goblin", elf: "Elf", elves: "Elf", ally: "Ally", allies: "Ally",
  wizard: "Wizard", wizards: "Wizard", cat: "Cat", cats: "Cat", vampire: "Vampire", vampires: "Vampire",
  spider: "Spider", spiders: "Spider", spirit: "Spirit", spirits: "Spirit", zombie: "Zombie", zombies: "Zombie",
  human: "Human", humans: "Human", soldier: "Soldier", soldiers: "Soldier", warrior: "Warrior", warriors: "Warrior",
  knight: "Knight", knights: "Knight", dragon: "Dragon", dragons: "Dragon", beast: "Beast", beasts: "Beast",
  merfolk: "Merfolk", wolf: "Wolf", wolves: "Wolf", bird: "Bird", birds: "Bird", snake: "Snake", snakes: "Snake",
  dog: "Dog", dogs: "Dog", elemental: "Elemental", elementals: "Elemental", rat: "Rat", rats: "Rat",
  pirate: "Pirate", pirates: "Pirate", dinosaur: "Dinosaur", dinosaurs: "Dinosaur", faerie: "Faerie", faeries: "Faerie",
  giant: "Giant", giants: "Giant", saproling: "Saproling", saprolings: "Saproling", insect: "Insect", insects: "Insect",
  boar: "Boar", boars: "Boar", sliver: "Sliver", slivers: "Sliver",
  // artifact subtypes (incl. the named tokens)
  treasure: "Treasure", treasures: "Treasure", clue: "Clue", clues: "Clue", food: "Food", foods: "Food",
  equipment: "Equipment", powerstone: "Powerstone", powerstones: "Powerstone", construct: "Construct", constructs: "Construct",
  // enchantment subtypes
  shrine: "Shrine", shrines: "Shrine", aura: "Aura", auras: "Aura",
  // land subtypes
  gate: "Gate", gates: "Gate", desert: "Desert", deserts: "Desert", locus: "Locus",
};
// `allowTarget` admits the TARGET-scoped "cards in that player's hand" (who:"target") — passed ONLY by the
// DMG-SCALE matcher, which also requires a single-player target. Every other caller (the controller-scoped
// FOR-EACH draw/gain-life/lose-life/create-token matchers) leaves it false, so "that player" — which has no
// referent in a controller effect — routes to the Arbiter instead of silently resolving to 0.
//
// ===== TREASURE-MAKER ===== `allowScopes` (passed ONLY by the create-named-token dynamic matcher) additionally
// admits OPPONENT-scoped ("…your opponents control" — Dockside, who:"opponents", summed over all opponents) and
// TARGET-CONTROLLED ("…that player controls" — Cavern-Hoard, who:"target", the damaged/target player) permanent
// counts. Left false for every legacy caller so those scopes can never widen an existing count source.
// ===== COUNT-OTHER ===== (WALT #365) a leading "other " on a "<X> you control" count EXCLUDES the source
// permanent itself (CR 113.7 — "other" = every object but this one): "draw a card for each OTHER Dinosaur
// you control" (Earthshaker Dreadmaw) counts every Dinosaur you control but itself. Strip "other ", parse
// the base source, and tag `excludeSelf` so countForSpec drops the source from the tally. Gated to a
// CONTROLLER-scoped permanent count (who undefined) — "other" on a hand/graveyard/experience/opponent
// source has no battlefield self to exclude, so it routes to the Arbiter (safe FN) instead of guessing.
// (WAVE-2b DRAW-METRIC unified onto this excludeSelf wrapper — the earlier excludeSource/allowExcludeSource
// path was redundant; "for each other <X>" is exactly this permanentsYouControl-scoped exclusion.)
export function parseCountSource(phrase, opts = {}) {
  const raw = String(phrase).trim().replace(/\.\s*$/, "");
  const om = raw.match(/^other (.+)$/);
  if (!om) return baseCountSource(raw, opts);
  const base = baseCountSource(om[1], opts);
  if (!base || base.kind !== "permanentsYouControl" || base.who) return null;
  return { ...base, excludeSelf: true };
}

function baseCountSource(phrase, { allowTarget = false, allowScopes = false } = {}) {
  const p = String(phrase).trim().replace(/\.\s*$/, "");
  let m;
  const withExclude = (spec) => spec; // "other" exclusion is handled by the parseCountSource wrapper (excludeSelf)
  // ===== TREASURE-MAKER ===== OPPONENT-scoped union "artifacts and enchantments your opponents control"
  // (Dockside Extortionist's X). Curated exact phrase only; countForSpec sums it over every opponent. Checked
  // FIRST so "your opponents control" wins before the controller-scoped "you control" branches.
  if (allowScopes && /^artifacts and enchantments your opponents control$/.test(p)) {
    return withExclude({ kind: "permanentsYouControl", cardTypes: ["artifact", "enchantment"], who: "opponents" });
  }
  // ===== TREASURE-MAKER ===== OPPONENT-scoped single-type "<creatures|lands|artifacts|enchantments> your
  // opponents control" — summed over all opponents (Cavern-Hoard's cast-cost "artifacts an opponent controls"
  // is a separate cost mechanic; this covers the for-each/X token sources). Anchored to the curated card types.
  if (allowScopes && (m = p.match(/^(creatures?|lands?|artifacts?|enchantments?) your opponents control$/))) {
    return withExclude({ kind: "permanentsYouControl", cardType: COUNT_TYPE[m[1]], who: "opponents" });
  }
  // ===== TREASURE-MAKER ===== TARGET-CONTROLLED "<creatures|lands|artifacts|enchantments> that player controls"
  // — the player just dealt combat damage ("create a Treasure token for each artifact that player controls",
  // Cavern-Hoard Dragon). who:"target" → countForSpec reads the spell target or, on a combat-damage trigger,
  // ctx.damagedPlayerId. Curated card types, anchored — "an opponent" / "each player" don't match (→ low).
  if (allowScopes && (m = p.match(/^(creatures?|lands?|artifacts?|enchantments?) that player controls$/))) {
    return withExclude({ kind: "permanentsYouControl", cardType: COUNT_TYPE[m[1]], who: "target" });
  }
  if ((m = p.match(/^(creatures?|lands?|artifacts?|enchantments?) you control$/))) {
    return withExclude({ kind: "permanentsYouControl", cardType: COUNT_TYPE[m[1]] });
  }
  if ((m = p.match(/^(mountains?|forests?|islands?|swamps?|plains) you control$/))) {
    return withExclude({ kind: "permanentsYouControl", subtype: COUNT_BASIC_SUBTYPE[m[1]] });
  }
  if (/^cards? in your hand$/.test(p)) return withExclude({ kind: "cardsInHand" });
  // ===== OPPONENT-SCOPED ===== "cards in that player's hand" — the count is the SPELL'S TARGET player's
  // hand (CR: "that player" = the targeted player), as in "deals damage to target player equal to the
  // number of cards in that player's hand" (Sudden Impact, Gaze of Adamaro, Storm Seeker). who:"target"
  // tells countForSpec to count the target player, not the controller. Only the bare phrase; "a player's"
  // / "an opponent's" / "each player's" don't match (→ low).
  if (allowTarget && /^cards? in that player's hand$/.test(p)) return withExclude({ kind: "cardsInHand", who: "target" });
  // ===== FOR-EACH ===== cards in YOUR graveyard, optionally filtered by ONE card type. Controller-scoped
  // ("your graveyard"); "a graveyard" / "their graveyard" / "that player's graveyard" reject (→ low).
  if ((m = p.match(/^(?:(creature|artifact|land|instant|sorcery|enchantment|planeswalker) )?cards? in your graveyard$/))) {
    return withExclude(m[1] ? { kind: "cardsInGraveyard", cardType: COUNT_GY_TYPE[m[1]] } : { kind: "cardsInGraveyard" });
  }
  // ===== COUNT SUBTYPES ===== "<Subtype>(s) you control" — a single curated permanent subtype (Goblin /
  // Elf / Treasure / Shrine / Gate …). Checked AFTER the card-type + basic-land-subtype branches so those
  // win their words; a single word not in the allowlist → null → low. (A multi-word or qualified subtype
  // count fails the `^…$` anchor → low.)
  if ((m = p.match(/^([a-z]+) you control$/)) && COUNT_SUBTYPE[m[1]]) {
    return withExclude({ kind: "permanentsYouControl", subtype: COUNT_SUBTYPE[m[1]] });
  }
  // ===== OVERRUN-X / DRAW-METRIC ===== a MAX-reduction, not a count: the single greatest layer-resolved
  // power (Overwhelming Stampede "+X/+X where X is the greatest power among creatures you control") or
  // greatest toughness (DRAW-METRIC "draw cards equal to the greatest toughness among creatures you
  // control") among the controller's creatures. countForSpec computes it at resolution; an EMPTY board → 0
  // (a safe 0, never fabricated). A leading "other " on a board MAX is gated out by the parseCountSource
  // wrapper (excludeSelf is restricted to permanentsYouControl), so a "greatest … among other creatures"
  // phrasing routes to the Arbiter rather than silently dropping the flag — a safe FN.
  if (/^greatest power among creatures you control$/.test(p)) return withExclude({ kind: "greatestPowerYouControl" });
  if (/^greatest toughness among creatures you control$/.test(p)) return withExclude({ kind: "greatestToughnessYouControl" });
  // ===== EXPERIENCE ===== the controller's experience counter total. "experience counters you have" is the
  // bare canonical form; "the controller has" is a rare alternate phrasing on non-Toph cards.
  if (/^experience counters? (?:you have|the controller has)$/.test(p)) return withExclude({ kind: "experienceCounters" });
  return null;
}
