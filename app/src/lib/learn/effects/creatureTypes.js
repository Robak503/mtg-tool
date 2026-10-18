/**
 * effects/creatureTypes.js — the CLOSED creature-subtype vocabulary, extracted to a LEAF module.
 *
 * ⚠️ IT LIVES ALONE FOR A LOAD-BEARING REASON. It used to sit in effects/targeting.js, which is inside the
 * targeting → spellEffects → triggers → gameState import cycle. Every consumer therefore had to read it
 * lazily, and even that is not enough: adding the IMPORT EDGE alone (from staticAbilityParser, reading the
 * constant only inside a function) reordered module init and produced
 *
 *     ReferenceError: Cannot access '_lifeLossWatcher' before initialization
 *
 * on a plain `import` of legalChoices.js — a real crash the vitest suite did NOT reproduce, because vitest
 * resolves modules in a different order than node does. It was caught by importing the module directly.
 *
 * A pure data constant belongs in a leaf. targeting.js re-exports it so every existing importer is
 * unchanged. **New consumers must import it FROM HERE** — reaching through targeting.js restores the edge.
 */

// ─── SHARED-CREATURE-TYPE subset constraint (BLITZ MG-1) ─────────────────────────────────────────
// The complete CR 205.3m creature-type vocabulary (transcribed from knowledge/mtg-judge/data/cr/
// cr_current.json; lowercase, curly apostrophe normalized — "c'tan"). REQUIRED as an ALLOWLIST because a
// creature card's after-dash type-line words are NOT all creature types: artifact/enchantment/land subtypes
// ride the same dash on artifact/enchantment/land creature cards (corpus-probed: Gingerbrute "Artifact
// Creature — Food Golem", Bronzeplate Boar "Artifact Creature — Equipment Boar", Go-Shintai "Enchantment
// Creature — Shrine", Dryad Arbor "Land Creature — Forest Dryad"), so a bare word intersection would offer
// an ILLEGAL pair sharing only "Food"/"Equipment"/"Shrine" — a forbidden FP. Allowlist direction per the
// CREED: a word NOT listed here is never treated as a creature type, so an unlisted (future set / Universes
// Beyond) type can only SUPPRESS a legal pair (FN, safe), never admit an illegal one.
export const CR_CREATURE_TYPES = new Set([
  "advisor", "aetherborn", "alien", "ally", "angel", "antelope", "ape", "archer", "archon",
  "armadillo", "army", "artificer", "assassin", "assembly-worker", "astartes", "atog", "aurochs",
  "avatar", "azra", "badger", "balloon", "barbarian", "bard", "basilisk", "bat", "bear", "beast",
  "beaver", "beeble", "beholder", "berserker", "bird", "bison", "blinkmoth", "boar", "bringer",
  "brushwagg", "c'tan", "camarid", "camel", "capybara", "caribou", "carrier", "cat", "centaur",
  "child", "chimera", "citizen", "cleric", "clown", "cockatrice", "construct", "coward", "coyote",
  "crab", "crocodile", "custodes", "cyberman", "cyclops", "dalek", "dauthi", "demigod", "demon",
  "deserter", "detective", "devil", "dinosaur", "djinn", "doctor", "dog", "dragon", "drake",
  "dreadnought", "drix", "drone", "druid", "dryad", "dwarf", "echidna", "efreet", "egg", "elder",
  "eldrazi", "elemental", "elephant", "elf", "elk", "employee", "eye", "faerie", "ferret", "fish",
  "flagbearer", "fox", "fractal", "frog", "fungus", "gamer", "gargoyle", "germ", "giant", "giraffe",
  "gith", "glimmer", "gnoll", "gnome", "goat", "goblin", "god", "golem", "gorgon", "graveborn",
  "gremlin", "griffin", "guest", "hag", "halfling", "hamster", "harpy", "hedgehog", "hellion",
  "hero", "hippo", "hippogriff", "homarid", "homunculus", "horror", "horse", "human", "hydra",
  "hyena", "illusion", "imp", "incarnation", "inkling", "inquisitor", "insect", "jackal",
  "jellyfish", "juggernaut", "kangaroo", "kavu", "kirin", "kithkin", "knight", "kobold", "kor",
  "kraken", "lamia", "lammasu", "leech", "lemur", "leviathan", "lhurgoyf", "licid", "lizard",
  "llama", "lobster", "manticore", "masticore", "mercenary", "merfolk", "metathran", "minion",
  "minotaur", "mite", "mole", "monger", "mongoose", "monk", "monkey", "moogle", "moonfolk", "mount",
  "mouse", "mutant", "myr", "mystic", "nautilus", "necron", "nephilim", "nightmare", "nightstalker",
  "ninja", "noble", "noggle", "nomad", "nymph", "octopus", "ogre", "ooze", "orb", "orc", "orgg",
  "otter", "ouphe", "ox", "oyster", "pangolin", "peasant", "pegasus", "pentavite", "performer",
  "pest", "phelddagrif", "phoenix", "phyrexian", "pilot", "pincher", "pirate", "plant", "platypus",
  "porcupine", "possum", "praetor", "primarch", "prism", "processor", "qu", "rabbit", "raccoon",
  "ranger", "rat", "rebel", "reflection", "rhino", "rigger", "robot", "rogue", "sable", "salamander",
  "samurai", "sand", "saproling", "satyr", "scarecrow", "scientist", "scion", "scorpion", "scout",
  "sculpture", "seal", "serf", "serpent", "servo", "shade", "shaman", "shapeshifter", "shark",
  "sheep", "siren", "skeleton", "skunk", "slith", "sliver", "sloth", "slug", "snail", "snake",
  "soldier", "soltari", "sorcerer", "spawn", "specter", "spellshaper", "sphinx", "spider", "spike",
  "spirit", "splinter", "sponge", "squid", "squirrel", "starfish", "surrakar", "survivor",
  "symbiote", "synth", "tentacle", "tetravite", "thalakos", "thopter", "thrull", "tiefling",
  "time lord", "toy", "treefolk", "trilobite", "triskelavite", "troll", "turtle", "tyranid",
  "unicorn", "utrom", "vampire", "varmint", "vedalken", "villain", "volver", "wall", "walrus",
  "warlock", "warrior", "weasel", "weird", "werewolf", "whale", "wizard", "wolf", "wolverine",
  "wombat", "worm", "wraith", "wurm", "yeti", "zombie", "zubera",
]);

/**
 * A plural (or already-singular) creature-type word → the REAL CR subtype, or null.
 *
 * ⚠️ WHY THIS EXISTS INSTEAD OF `word.replace(/s$/, "")`. That naive strip was the shipped behaviour and it
 * is wrong for every irregular plural in the game: "Allies" → "Allie", "Elves" → "Elve", "Oxen" → "Oxen".
 * None of those is a printed subtype, so the resulting filter is a gate NO CARD CAN SATISFY — the card
 * classifies native and the trigger silently never fires. Invasion Tactics #13305 shipped exactly that way
 * ("Allie"), found by `probe-vacuous-subtype-filters.mjs`.
 *
 * The fix is NOT a hand-written plural dictionary — that would just move the fabrication. Candidate
 * singular forms are GENERATED and then VALIDATED against `CR_CREATURE_TYPES`, the closed 317-word
 * vocabulary (ENGINE-SCAFFOLD §6: validate against a closed set, never a loose word). A word that resolves
 * to nothing in that set returns null, and every caller treats null as "don't build a filter" → the trigger
 * stays with the Arbiter (a SAFE false-negative). So an unrecognised or newly-printed type degrades to
 * undetected rather than to a vacuous native.
 *
 * Order matters only in that the first hit wins; the candidates are disjoint in practice ("wolves" → "wolf"
 * via -ves→-f, "knives" → "knife" via -ves→-fe, "allies" → "ally" via -ies→-y, "oxen" → "ox" via -en).
 */
export function singularCreatureType(word) {
  const w = String(word).toLowerCase();
  if (CR_CREATURE_TYPES.has(w)) return w; // already singular ("merfolk", "dinosaur")
  const candidates = [
    w.replace(/ies$/, "y"),   // allies → ally
    w.replace(/ves$/, "f"),   // elves → elf · wolves → wolf · dwarves → dwarf
    w.replace(/ves$/, "fe"),  // knives → knife
    w.replace(/en$/, ""),     // oxen → ox
    w.replace(/es$/, ""),     // foxes → fox
    w.replace(/s$/, ""),      // goblins → goblin (the regular case)
  ];
  for (const cand of candidates) if (cand !== w && CR_CREATURE_TYPES.has(cand)) return cand;
  return null;
}
