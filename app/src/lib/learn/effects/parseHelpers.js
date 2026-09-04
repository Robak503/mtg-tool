/**
 * effects/parseHelpers.js — shared, pure parse-time helpers for the recognition layer.
 *
 * A LEAF module: imports nothing from sibling engine modules, so both parser.js AND the per-family
 * clause-parser modules (atoms/*.js, the matcher-registry seam) can import these without the TDZ
 * import cycle that forbids an atoms module from importing parser.js. Grows as the parser.js
 * matcher-registry seam migrates families out of parseExtendedAtom and they need a shared dep here.
 */

import { GRANTABLE_STATIC_KEYWORDS, canonicalCombatKeyword } from "../keywords.js"; // for parseGrantedKeywords + the token helpers (keywords.js is a zero-import leaf — cycle-safe)

// Spelled cardinals a..five (with the "a"/"an" article forms). The canonical small-count word map the
// parseExtendedAtom matchers use as `SMALL_NUM[word] ?? parseInt(word, 10)`.
export const SMALL_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

// Spelled cardinals up to ten — mill amounts ("Mill three cards", "Mill ten cards") are spelled out.
export const NUM_WORD = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };

// ===== COST-ONLY KEYWORD LINES (CONVOKE / AFFINITY) — strip-before-parse, mirroring the Ninjutsu/Cycling
// metric rationale (coverage.js) =====================================================================
// CONVOKE (CR 702.51) and AFFINITY (CR 702.40) are pure cost-REDUCTION abilities: they change ONLY how much
// the spell costs to cast, never WHAT it does on resolution. Every card carrying one ALSO has a normal printed
// mana cost, so the engine can hard-cast it at full price and resolve its body 100% CORRECTLY — the only
// unmodeled part is the optional discount (tapping creatures for convoke / the per-permanent affinity scaler),
// which can NEVER mis-resolve / mis-count / drop a payoff clause / mis-scope / fabricate (THE CREED). This is
// the SAME safe trade the Ninjutsu and Cycling cost gates already make: an unmodeled optional CASTING-COST
// adjustment is invisible to the effect.
//
// These appear as their OWN leading oracle line, almost always with a reminder-text parenthetical:
//   "Convoke (Your creatures can help cast this spell. …)"          (Harmonized Crescendo, Stoke the Flames)
//   "Affinity for Slivers (This spell costs {1} less to cast …)"    (Thrumming Hivepool; also "Affinity for artifacts")
// Anchored ^…(line)…$ on the bare keyword (+ the "for <noun>" affinity tail) plus an OPTIONAL reminder paren,
// so the strip can ONLY consume a true cost-keyword line — never a sentence that merely mentions the word
// (none exist in the corpus for these two: convoke/affinity are only ever the keyword itself). Leaves the rest
// of the card untouched for the normal parser/classifier, which then sees a clean effect/body.
// SNEAK (Tarkir: Dragonstorm) is an ALTERNATIVE-COST cast keyword ("Sneak {cost}" — cast for the sneak cost if
// you also return an unblocked attacker you control to hand). Like convoke/affinity it is RESOLUTION-INVARIANT:
// it changes only HOW you pay (mana + return a creature), never WHAT the spell does — and its "enters tapped and
// attacking" clause is vacuous for a non-permanent spell. The engine hard-casts at full printed cost (no sneak
// lane), so stripping the line for the spell classifier is CREED-safe, exactly the ninjutsu/morph precedent.
// FLASHBACK (CR 702.34, SHELF Phase 2 — Echo of Eons) joins the class: it changes only WHERE the card may be
// cast from (the graveyard — an option the engine never offers, a safe FN), and its "Then exile it" rider
// applies ONLY to a flashback cast; the normal hard cast + resolution are byte-identical to the printed body.
// TRANSMUTE (CR 702.53, Muddle the Mixture) likewise: a hand-only activated ability (discard this card →
// tutor same-MV) the engine never offers — the normal cast + resolution are untouched.
// IMPROVISE (CR 702.126, census slice 2026-07-24) — convoke's artifact twin, joining on convoke's exact
// basis: pure cost-REDUCTION (tap artifacts to help pay), resolution-invariant, the engine hard-casts at
// full printed cost. The permanent-side mirror (coverage.js reImproviseBare) shipped the same slice.
// Census slice 48 adds three more on the SAME rationale the list already runs on — the engine hard-casts at
// full cost through the printed mode, so an option it never takes cannot change what resolves:
//   • delve (CR 702.66a)     — "Each card you exile from your graveyard while casting this spell pays for
//                              {1}." Pure cost REDUCTION, exactly like convoke/improvise above it.
//   • replicate (CR 702.55a) — an OPTIONAL additional cost; paid zero times, the spell is copied zero times,
//                              which is the printed base spell (kicker's reasoning, on the spell side).
//   • fuse (CR 702.102a)     — "You may cast one or both halves of this card from your hand." The engine
//                              already casts either half (actionsCastSplitFromHand); fuse only adds the
//                              BOTH mode. Declining it leaves a real, complete, legal cast.
// Census slice 51 adds three more, all read off the printed corpus text before crediting:
//   • assist   (CR 702.132a) — "Another player can pay up to {N} of this spell's cost." Cost help from a
//                              player who, in this engine, never offers it; the caster pays full price,
//                              which is the printed spell. Resolution-invariant, convoke's exact basis.
//   • casualty (CR 702.153a) — "As you cast this spell, YOU MAY sacrifice a creature with power N or
//                              greater. When you do, copy this spell." Optional additional cost; declined,
//                              the spell is copied zero times, which is the printed spell.
//   • ripple   (CR 702.60a)  — "When you cast this spell, YOU MAY reveal the top N cards of your library…
//                              Put the rest on the bottom." Declined, the library is untouched and nothing
//                              else on the card changes.
// ④-O (2026-09-03 night) adds REINFORCE (CR 702.71a) — "Reinforce N—{cost} ({cost}, Discard this card: Put N +1/+1
//   counters on target creature.)": a HAND-zone activated option the engine never offers (exactly cycling's basis
//   on the permanent side, reCyclingCost). Declined, the spell is cast and resolves as printed — a real, complete
//   mode; not offering the discard-for-counters is an under-offer, the safe direction. Read off the printed corpus:
//   Break Ties / Fowl Strike / Hunting Triad / Earthbrawn each parked on this line ALONE. The em-dash is load-bearing
//   (the printed form), so reinforce-REFERENCING prose never matches.
const COST_ONLY_KEYWORD_LINE = /^(?:convoke|improvise|delve|fuse|assist|affinity for [a-z]+|casualty \d+|ripple \d+|replicate (?:\{[^}]+\})+|sneak (?:\{[^}]+\})+|flashback (?:\{[^}]+\})+|transmute (?:\{[^}]+\})+|reinforce \d+[—–-](?:\{[^}]+\})+)(?:\s*\([^)]*\))?\s*$/i;

/**
 * Strip standalone CONVOKE / AFFINITY cost-keyword lines from an oracle string (line-anchored). Returns the
 * oracle with those whole lines removed; a no-op when none are present. Pure/leaf — used by the coverage
 * classifier (spellIsNative for convoke spells; the permanent path for affinity permanents) so an
 * otherwise-fully-modeled card isn't dragged to LOW/body-only by a cost-only keyword the runtime ignores
 * (it hard-casts at full cost). CREED-safe per the rationale above.
 */
// PLOT (a cost-only keyword line, same family as convoke/affinity): "Plot {2}{U} (reminder…)".
// ⛔ NOT STRIPPED when the card carries a "becomes plotted" TRIGGER — those cards (Longhorn Sharpshooter,
// Aloe Alchemist) have real plot SEMANTICS beyond the cost keyword, and removing the line would hide an
// unmodeled trigger. That text check reproduces coverage.js's `parsePlotCost` gate EXACTLY: measured across
// all 34 corpus cards whose text matches this anchor, 34 agree / 0 disagree. It is done by text so this file
// stays a leaf (importing abilities.js for parsePlotCost would risk a cycle).
const PLOT_COST_LINE = /^plot\s+(?:\{[^}]+\})+.*$/i;

// CASCADE — the keyword line belongs to the TRIGGER subsystem, not to the spell's own effect program.
// coverage.js strips it before parsing the body (and only credits the card when the cascade TRIGGER itself
// routes natively — verified: detectTriggers yields a cascade descriptor and triggerRoutesNatively is true).
// The runtime did NOT strip it, so the leftover line dragged the body to LOW and six otherwise-native
// cascade spells (Violent Outburst, Demonic Dread, Deny Reality, Captured Sunlight, Forceful Denial,
// Natural Reclamation) routed to the Arbiter while the metric counted them native. The cascade EFFECT is
// unaffected either way — it fires through the trigger, which is where it is modelled.
// ⛔ THE BARE KEYWORD LINE ONLY — after removing reminder parentheses the line must be exactly "cascade".
// coverage.js also matches the reminder sentence ("exile a nonland card that costs less"), but it does so
// INSIDE a branch already gated on the card HAVING cascade. Reusing that matcher here, where the helper runs
// on every card, stripped a real ability off cards that GRANT cascade — "Delirium — This spell has cascade
// as long as …" (Bloodbraid Marauder), "The first spell you cast each turn has cascade" (Maelstrom Nexus) —
// and credited 9 of them native with the granting ability silently gone. Caught by the tier diff: the fix
// was supposed to move ZERO cards, and it moved nine in the forbidden direction.
const CASCADE_LINE = (t) => t.replace(/\([^)]*\)/g, "").trim().toLowerCase() === "cascade";

// STORM (CR 702.40a) — same argument as cascade, one step later. The keyword is a triggered ability
// (detectTriggers synthesizes a `stormCopy` selfCast descriptor; applyCopySpell performs the copies), so it is
// not part of the body. For an INSTANT/SORCERY coverage.js already stripped it inside its own storm branch; a
// PERMANENT never reaches that branch, so the leftover "Storm (…)" line sat as residue and parked every storm
// creature and Aura in the corpus at body-only.
//
// ⛔ THE BARE KEYWORD LINE ONLY — and here that anchor is not theoretical. FIVE corpus cards GRANT storm
// rather than having it: Prismari, the Inspiration and the Ral, Crackling Wit emblem ("Instant and sorcery
// spells you cast have storm"), Storm, Force of Nature and Crackling Spellslinger ("the next instant or
// sorcery spell you cast this turn has storm"). Matching the reminder sentence instead would strip the real
// granting ability off all five and credit them native with the ability silently gone — the exact nine-card
// mistake the cascade note above records, waiting to be repeated. After removing reminder parentheses the
// line must be exactly "storm"; none of the five have such a line.
const STORM_LINE = (t) => t.replace(/\([^)]*\)/g, "").trim().toLowerCase() === "storm";

export function stripCostOnlyKeywordLines(oracle) {
  const raw = String(oracle || "");
  // A becomes-plotted trigger means plot is not cost-only on this card — leave every line alone.
  const plotIsCostOnly = !/becomes plotted/i.test(raw);
  const lines = raw.split("\n");
  const kept = lines.filter((ln) => {
    const t = ln.trim();
    if (COST_ONLY_KEYWORD_LINE.test(t)) return false;
    if (plotIsCostOnly && PLOT_COST_LINE.test(t)) return false;
    if (CASCADE_LINE(t)) return false;
    if (STORM_LINE(t)) return false;
    return true;
  });
  return kept.length === lines.length ? raw : kept.join("\n").trim();
}

/** True iff the oracle carries at least one standalone CONVOKE / AFFINITY cost-keyword line. */
export function hasCostOnlyKeywordLine(oracle) {
  return String(oracle || "").split("\n").some((ln) => COST_ONLY_KEYWORD_LINE.test(ln.trim()));
}

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
// Exported for the TEAM-PUMP-SCOPE parser (atoms/combat.js): a "<Subtype>s you control … until end of
// turn" team pump admits a subtype filter ONLY when it's in this same curated, collision-free allowlist,
// so the pump resolver's `\b<Subtype>\b` type-line match credits exactly the subtyped creatures (CREED —
// a non-subtype word can never be mis-matched). Single source of truth shared with parseCountSource.
export const COUNT_SUBTYPE = {
  // creature tribes
  goblin: "Goblin", goblins: "Goblin", elf: "Elf", elves: "Elf", ally: "Ally", allies: "Ally",
  wizard: "Wizard", wizards: "Wizard", cat: "Cat", cats: "Cat", vampire: "Vampire", vampires: "Vampire",
  spider: "Spider", spiders: "Spider", spirit: "Spirit", spirits: "Spirit", zombie: "Zombie", zombies: "Zombie",
  human: "Human", humans: "Human", soldier: "Soldier", soldiers: "Soldier", warrior: "Warrior", warriors: "Warrior",
  knight: "Knight", knights: "Knight", dragon: "Dragon", dragons: "Dragon", beast: "Beast", beasts: "Beast",
  merfolk: "Merfolk", wolf: "Wolf", wolves: "Wolf", bird: "Bird", birds: "Bird", snake: "Snake", snakes: "Snake",
  dog: "Dog", dogs: "Dog", elemental: "Elemental", elementals: "Elemental", rat: "Rat", rats: "Rat",
  // SHELF-85 S10 (2026-09-04, Surgehacker Mech "twice the number of Vehicles you control"): the artifact subtype counted
  // by the same "<Subtype>s you control" arm — the type-line word test is subtype-agnostic.
  vehicle: "Vehicle", vehicles: "Vehicle",
  // SHELF-85 V9 (2026-09-04, Valley Floodcaller "Birds, Frogs, Otters, and Rats you control"): both words appear only
  // in the creature-subtype half of a type line (no collision with a card type or supertype).
  frog: "Frog", frogs: "Frog", otter: "Otter", otters: "Otter",
  // SG-1 (2026-09-03, The Unbeatable Squirrel Girl — "X is the number of Squirrels you control"): one corpus
  // carrier; "Squirrel" appears only in the creature-subtype half of a type line (no collision, verified).
  squirrel: "Squirrel", squirrels: "Squirrel",
  pirate: "Pirate", pirates: "Pirate", dinosaur: "Dinosaur", dinosaurs: "Dinosaur", faerie: "Faerie", faeries: "Faerie",
  giant: "Giant", giants: "Giant", saproling: "Saproling", saprolings: "Saproling", insect: "Insect", insects: "Insect",
  boar: "Boar", boars: "Boar", sliver: "Sliver", slivers: "Sliver", mutant: "Mutant", mutants: "Mutant",
  plant: "Plant", plants: "Plant",
  // Added 2026-07-29 from the "put a +1/+1 counter on each <Subtype> you control" family (15 corpus cards,
  // 13 parked): the subtype ARM already worked — `each Vampire you control` parses with a subtypeFilter —
  // and the only thing missing was curation. Each was corpus-verified against this list's own CREED
  // criterion before being added: every type-line occurrence sits in the SUBTYPE position, zero left of the
  // dash, so `<Subtype>` against a type line can never mis-match a card type.
  //   Cleric 722 · Advisor 187 · Villain 212 · Ooze 74 · Leech 21 · Wraith 14 · Fractal 8 · Moogle 8
  cleric: "Cleric", clerics: "Cleric", advisor: "Advisor", advisors: "Advisor",
  villain: "Villain", villains: "Villain", ooze: "Ooze", oozes: "Ooze",
  leech: "Leech", leeches: "Leech", wraith: "Wraith", wraiths: "Wraith",
  fractal: "Fractal", fractals: "Fractal", moogle: "Moogle", moogles: "Moogle",
  // Added 2026-08-14 (Hulk, Strongest There Is — "each Gamma creature you control"): corpus-verified
  // 22 type-line occurrences, ALL in the subtype position, zero left of the dash.
  gamma: "Gamma", gammas: "Gamma",
  // artifact subtypes (incl. the named tokens)
  treasure: "Treasure", treasures: "Treasure", clue: "Clue", clues: "Clue", food: "Food", foods: "Food",
  equipment: "Equipment", powerstone: "Powerstone", powerstones: "Powerstone", construct: "Construct", constructs: "Construct",
  // enchantment subtypes
  shrine: "Shrine", shrines: "Shrine", aura: "Aura", auras: "Aura",
  // land subtypes
  gate: "Gate", gates: "Gate", desert: "Desert", deserts: "Desert", locus: "Locus",
};
// ===== SUBTYPE-RESTRICTED TARGETING ===== a CURATED allowlist of CREATURE subtypes that may restrict a
// CHOSEN target ("target Dinosaur gains haste" — Otepec Huntmaster; "Destroy target Human creature" —
// Human Frailty). Keyed on the lowercase SINGULAR surface form → the canonical proper-noun subtype; the
// target enumerator (spellEffects.creatureSatisfiesRestrictions kind:"subtype") then word-bound matches
// `\b<Subtype>\b` against the target's FRONT-FACE type line, so the legal-target set is EXACTLY the
// subtyped creatures — never an arbitrary creature (THE CREED: an un-enforced subtype filter is a
// forbidden target-anything FP). CURATED, not generic: every entry is a real creature subtype that
// appears verbatim ONLY in the subtype portion of a type line (corpus-verified zero left-of-dash and zero
// non-creature collisions), so a NON-subtype word after "target" — a color ("target green creature"), a
// card type ("target artifact creature"), or "permanent" — is never in this set and routes to the Arbiter.
// SINGULAR only: "target <X>" / "target <X> creature" is always singular in the corpus. CREATURE subtypes
// only (this slice targets creatures); the non-creature subtypes in COUNT_SUBTYPE (Treasure/Clue/…) are
// deliberately excluded. Reuses + extends the SAME curated discipline as REGEN_TARGET_SUBTYPES (combat.js).
export const TARGET_SUBTYPES = new Set([
  "dinosaur", "human", "goblin", "elf", "wizard", "vampire", "spirit", "zombie", "soldier", "warrior",
  "knight", "dragon", "beast", "merfolk", "wolf", "bird", "snake", "dog", "elemental", "rat", "pirate",
  "faerie", "giant", "saproling", "insect", "boar", "sliver", "plant", "minotaur", "orc", "barbarian",
  "treefolk", "fungus", "samurai", "shade", "elephant", "golem", "ally", "ninja", "cleric", "angel",
  "phoenix", "rebel", "skeleton", "griffin", "werewolf", "cat", "spider", "eldrazi", "wall",
]);
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

function baseCountSource(phrase, { allowTarget = false, allowScopes = false, allowBattlefield = false } = {}) {
  const p = String(phrase).trim().replace(/\.\s*$/, "");
  let m;
  // SACRIFICED REFERENT (CR 608.2h + 603.6e LKI) — "the sacrificed creature's power / toughness / mana value"
  // (Fling, Tormented Thoughts, Reckoner's Bargain). The permanent is GONE by resolution, so the magnitude is
  // captured at COST-PAYMENT time by actionDispatcher and read from state by countForSpec. Placed in the SHARED
  // count-source parser so every scaling atom family (damage, draw, discard, life) gets it from one edit rather
  // than each re-implementing the phrase.
  //
  // Accepts the permanent nouns the printed cards actually use. An unstamped spell (no sacrifice cost) resolves
  // the count to 0 — a clean no-op, never a fabricated magnitude.
  const sacM = p.match(/^the sacrificed (?:creature|permanent|artifact)'s (power|toughness|mana value)$/);
  if (sacM) {
    return { kind: sacM[1] === "power" ? "sacrificedPower" : sacM[1] === "toughness" ? "sacrificedToughness" : "sacrificedManaValue" };
  }
  // ⭐ CONVERGE COUNT (CR 702.117a) — "the number of colors of mana spent to cast this spell". Lives in the
  // SHARED count parser for the same reason the sacrificed-* referent above does: every scaling atom family
  // (damage, tokens, counters, draw…) picks it up from one edit instead of each re-implementing the phrase.
  // The value is stamped on state at cost-payment time; countForSpec reads it back.
  // ⛔ "COLORS", NOT MANA. Two Forests pay two green mana and one COLOUR — the phrase counts distinct colours,
  // which is exactly what the dispatcher derives from the plan's per-colour spend map.
  // ⓘ BOTH PRINTED SHAPES, and they arrive here differently. "…where X is THE NUMBER OF COLORS of mana
  // spent" hands over the plural phrase whole; "…FOR EACH COLOR of mana spent" is split by its caller and
  // hands over the SINGULAR remainder. Same count either way, so one arm accepts both rather than two arms
  // drifting apart.
  // ⭐ MULTIKICKER COUNT (CR 702.33h) — "for each TIME IT WAS KICKED" (Skitter of Lizards, Quag Vampires,
  // Enclave Elite, Wolfbriar Elemental, Lightkeeper of Emeria, Gnarlid Pack, Apex Hawks). Captured at cast
  // like every other cost-time referent here.
  // ⛔⛔ THIS COUNT IS STRUCTURALLY ZERO TODAY, AND THAT IS SAID OUT LOUD RATHER THAN LEFT TO BE DISCOVERED.
  // `parseKickerCost` refuses multikicker (CR 702.33h, deferred), so legalChoices never offers a multikicked
  // cast and the count is 0 on every cast the engine can make. **That is the CORRECT value for those casts** —
  // Skitter of Lizards hard-cast for {R} is a 1/1 haste with no counters, exactly as printed — which is why
  // this is a count source rather than a strip: it computes the true answer for the plays available, and it
  // goes live automatically the day multikicker is offered. A strip would have to be revisited; this will not.
  // ⓘ The Multikicker LINE itself is already accepted as a covered cost keyword (verified: the keyword plus a
  // vanilla body reads native today), so this rider was the only thing parking these cards.
  if (/^times? it was kicked$/.test(p)) return { kind: "timesKicked" };
  // SPELLS CAST THIS TURN (④-BC — Aetherflux Reservoir): the controller's per-turn cast tally, read by countForSpec.
  if (/^spells? you(?:'ve| have) cast this turn$/.test(p)) return { kind: "spellsCastThisTurn" };
  // CARDS DRAWN THIS TURN (SHELF-85 V5 — Proft's Eidetic Memory "put X +1/+1 counters on target creature you control,
  // where X is the number of cards you've drawn this turn minus one"): the controller's per-turn draw tally, read by
  // countForSpec; the printed "minus one" rides as `minus` and is floored at 0 there (never a negative count).
  m = p.match(/^cards you(?:'ve| have) drawn this turn( minus one)?$/);
  if (m) return { kind: "cardsDrawnThisTurn", ...(m[1] ? { minus: 1 } : {}) };
  // ⭐ COUNTERS ON THE SOURCE (CR 603.6e) — "…for each +1/+1 counter ON IT" (Marketback Walker and
  // Bloodtracker's dies/leaves draw, Hooded Hydra's dies tokens, Embalmed Brawler's attacks life-loss).
  // ⛔⛔ ONE PHRASE, TWO SOURCES, AND THAT IS THE WHOLE DIFFICULTY. On a DIES / LEAVES trigger the permanent
  // is GONE by resolution, so the count must come from the CR 603.10a look-back; reading the live board
  // there silently yields 0 — an under-count that looks exactly like a working card. On an ATTACKS / BLOCKS
  // trigger the permanent is live and the board is the right answer. countForSpec prefers the look-back and
  // falls back to the live permanent, and BOTH paths are pinned — a test that only drives the attacks case
  // passes with the dies path returning zero.
  // ⭐ The look-back value already exists: checkDiesTriggers stamps `triggeringPlusCounterCount` off the
  // death snapshot for MODULAR. This reads the same field rather than threading a second one.
  // "on this creature" — the explicit source self-reference (Red Hulk's reflexive via the gendered-pronoun
  // normalization, 2026-08-14): the SAME referent as "on it" in a source-scoped clause, same reader.
  if (/^\+1\/\+1 counters? on (?:it|this creature)$/.test(p)) return { kind: "plusCountersOnSource" };
  // NAMED-COUNTERS-ON-SOURCE (THE ONE RING, SG-17, 2026-09-03): "for each burden counter on this creature/artifact/…"
  // — the source's own bag of a NAMED counter kind, read live at resolution (CR 608.2h) through the same
  // ctx.sourceId the +1/+1 form uses. The kind word is any lowercase counter name; the ±1/±1 spellings never
  // match [a-z]+ so the +1/+1 arm above keeps its own kind. Source-relative — an absent source reads 0.
  {
    const nc = /^([a-z]+) counters? on (?:it|this (?:creature|artifact|permanent|enchantment|land))$/.exec(p);
    if (nc) return { kind: "namedCountersOnSource", counterType: nc[1] };
  }
  // ⭐ EQUIPMENT-ATTACHED-TO-SOURCE (SHELF CAP2 — Captain America, Liberator: "for each Equipment attached
  // to him, create a 1/1 white Soldier creature token", normalized by the trigger rewrite to the trailing
  // form with "this creature"). Counts the Equipment permanents whose attachedTo is the SOURCE permanent,
  // live at resolution (CR 608.2h). Source-relative like plusCountersOnSource — countForSpec reads
  // ctx.sourceId; an absent source → 0 (a clean no-op, never a fabricated count).
  if (/^equipment attached to this creature$/.test(p)) return { kind: "equipmentAttachedToSource" };
  if (/^(?:the number of )?colors? of mana spent to cast (?:this spell|it)$/.test(p)) {
    return { kind: "colorsSpentThisSpell" };
  }
  const withExclude = (spec) => spec; // "other" exclusion is handled by the parseCountSource wrapper (excludeSelf)
  // ===== RAD-AMONG-PLAYERS (Vault 12 chapter II — SHELF S7) ===== "rad counters among players" — the
  // TOTAL radCounters across every seat, summed live at resolution (countForSpec).
  if (/^rad counters among players$/.test(p)) return withExclude({ kind: "radAmongPlayers" });
  // ===== SUBTYPE-ON-BATTLEFIELD (all seats) ===== "<Subtype>s on the battlefield" — the count of EVERY
  // permanent of one curated creature subtype across ALL players' battlefields, NOT just the controller's
  // (Magma Sliver's granted firebreathing "+X/+0 … where X is the number of Slivers on the battlefield").
  // Distinct from the "<Subtype>s you control" branch below (who undefined → controller-only): this counts
  // the global board. countForSpec sums it over every seat (kind:"subtypeOnBattlefield"). Only reachable via
  // allowBattlefield (passed ONLY by the subtype-target count-pump matcher), so no legacy count consumer can
  // widen to a global scope. CURATED subtype only (COUNT_SUBTYPE) — a non-subtype word ("creatures on the
  // battlefield" would need its own kind) fails the guard → null → low → Arbiter (CREED, safe FN).
  if (allowBattlefield && (m = p.match(/^([a-z]+) on the battlefield$/)) && COUNT_SUBTYPE[m[1]]) {
    return withExclude({ kind: "subtypeOnBattlefield", subtype: COUNT_SUBTYPE[m[1]] });
  }
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
  // ===== DEFENDING-PLAYER-CONTROLLED ===== "<creatures|lands|artifacts|enchantments> they control" — the
  // DEFENDING PLAYER's permanents on an ATTACKS trigger ("Whenever this creature attacks, it deals damage to
  // defending player equal to the number of artifacts they control" — Generous Plunderer). "they" is the
  // defending player named by the SAME clause ("deals damage to defending player … they control"), so
  // who:"defendingPlayer" → countForSpec reads ctx.defenderId (set ONLY by checkAttackTriggers). On any other
  // event ctx.defenderId is unset → 0; but the caller (dealDamageScaledClauseParser) also pins who:"defendingPlayer"
  // on the deal-damage atom, so combatDamageReferentSatisfied keeps the whole clause native ONLY off an attacks
  // trigger (else → Arbiter — a SAFE FN). Curated card types, anchored — never over-matches. Only reachable via
  // allowScopes (the dynamic damage/token matchers); every legacy count consumer leaves it false.
  if (allowScopes && (m = p.match(/^(creatures?|lands?|artifacts?|enchantments?) they control$/))) {
    return withExclude({ kind: "permanentsYouControl", cardType: COUNT_TYPE[m[1]], who: "defendingPlayer" });
  }
  if ((m = p.match(/^(creatures?|lands?|artifacts?|enchantments?) you control$/))) {
    return withExclude({ kind: "permanentsYouControl", cardType: COUNT_TYPE[m[1]] });
  }
  // TAPPED-QUALIFIED (2026-08-14 — Throne of the God-Pharaoh "the number of TAPPED creatures you
  // control"): the same permanentsYouControl count with tappedOnly, honored in countForSpec's main
  // branch off the live perm.tapped at resolution (CR 608.2h) — the same qualifier pattern as
  // powerAtLeast / requiresCounter.
  if ((m = p.match(/^tapped (creatures?|lands?|artifacts?|enchantments?) you control$/))) {
    return withExclude({ kind: "permanentsYouControl", cardType: COUNT_TYPE[m[1]], tappedOnly: true });
  }
  // ===== POWER-QUALIFIED CREATURE COUNT ===== "creatures you control with power N or {greater|more}" — the
  // count of the controller's creatures whose LAYER-AWARE power (read at resolution via creaturePower in
  // countForSpec) is ≥ N (The Boulder, Ready to Rumble: "earthbend X, where X is the number of creatures you
  // control with power 4 or greater"; Dragonhawk's impulse count). A power threshold is layer-aware (counters/
  // anthems count), so it is applied in countForSpec, not the type-line-only countMatches. Only the "with power
  // N or greater/more" form is admitted; any other qualifier ("or less", "with toughness …") fails the anchor
  // → null → low → Arbiter (CREED — never an unmodeled filter silently counted).
  if ((m = p.match(/^creatures? you control with power (\d+) or (?:greater|more)$/))) {
    return withExclude({ kind: "permanentsYouControl", cardType: "creature", powerAtLeast: Number(m[1]) });
  }
  // ===== COUNTER-QUALIFIED CREATURE COUNT ===== "creatures you control with a +1/+1 counter on it" — the
  // count of the controller's creatures that CURRENTLY have ≥1 +1/+1 counter (Inspiring Call, Armorcraft
  // Judge, Hamza). The presence test is read AT RESOLUTION off the live counter bag in countForSpec (CR
  // 608.2h — a count-derived value locks as the effect resolves), not the type-line-only countMatches. Only
  // the exact "+1/+1 counter on it/them" form is admitted; any other counter kind or qualifier ("a counter",
  // "two or more +1/+1 counters") fails the `^…$` anchor → null → low → Arbiter (CREED — never an unmodeled
  // filter silently counted). Mirrors the power-qualified branch above (spec carries a filter; countForSpec applies it).
  if (/^creatures? you control with a \+1\/\+1 counter on (?:it|them)$/.test(p)) {
    return withExclude({ kind: "permanentsYouControl", cardType: "creature", requiresCounter: "+1/+1" });
  }
  if ((m = p.match(/^(mountains?|forests?|islands?|swamps?|plains) you control$/))) {
    return withExclude({ kind: "permanentsYouControl", subtype: COUNT_BASIC_SUBTYPE[m[1]] });
  }
  if (/^cards? in your hand$/.test(p)) return withExclude({ kind: "cardsInHand" });
  // ===== DICE-ROLL (CR 726) ===== "the result" of a just-rolled die (Ancient Gold/Silver/Copper Dragon —
  // "create/draw … equal to the result"). countForSpec reads the rolled value off state.diceRoll, stamped by
  // the preceding roll-d20 atom. The parser only admits this count when a roll-d20 directly precedes the
  // payoff in the same program (CREED gate, parser assembly), so "the result" never binds without a roll.
  if (/^the result$/.test(p)) return withExclude({ kind: "diceResult" });
  // ===== OPPONENT-SCOPED ===== "cards in that player's hand" — the count is the SPELL'S TARGET player's
  // hand (CR: "that player" = the targeted player), as in "deals damage to target player equal to the
  // number of cards in that player's hand" (Sudden Impact, Gaze of Adamaro, Storm Seeker). who:"target"
  // tells countForSpec to count the target player, not the controller. Only the bare phrase; "a player's"
  // / "an opponent's" / "each player's" don't match (→ low).
  // "their hand" is the combat-damage-trigger anaphor for the SAME player ("…deals damage to that player
  // equal to the number of cards in THEIR hand" — Sword of War and Peace): countForSpec's who:"target"
  // already falls back to ctx.damagedPlayerId when no explicit player target exists (the Cavern-Hoard
  // Dragon path), so both spellings share one spec.
  if (allowTarget && /^cards? in (?:that player's|their) hand$/.test(p)) return withExclude({ kind: "cardsInHand", who: "target" });
  // ===== FOR-EACH ===== cards in YOUR graveyard, optionally filtered by ONE card type. Controller-scoped
  // ("your graveyard"); "a graveyard" / "their graveyard" / "that player's graveyard" reject (→ low).
  if ((m = p.match(/^(?:(creature|artifact|land|instant|sorcery|enchantment|planeswalker) )?cards? in your graveyard$/))) {
    return withExclude(m[1] ? { kind: "cardsInGraveyard", cardType: COUNT_GY_TYPE[m[1]] } : { kind: "cardsInGraveyard" });
  }
  // ===== AURA ATTACHED TO A CREATURE (Sage's Reverie — SHELF-TAIL SH4) ===== "aura you control that's
  // attached to a creature" — the Aura subtype count FILTERED to auras whose attachedTo is a CREATURE (an
  // aura on a land / artifact / player is excluded, CR 303.4). countForSpec's permanentsYouControl counter
  // honors `attachedToType`. Both of Sage's Reverie's arms (the ETB draw + the layer-7c static) use this
  // exact phrase, so one count source flips the whole card. Apostrophe normalized to straight by the caller.
  if (p.match(/^aura you control that's attached to a creature$/)) {
    return withExclude({ kind: "permanentsYouControl", subtype: "Aura", attachedToType: "creature" });
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
  // ===== TYPE-NEGATED BOARD MAX (Return of the Wildspeaker) ===== "greatest power|toughness among non-<Subtype>
  // creatures you control" — the same MAX-reduction, but the pool EXCLUDES creatures of one creature subtype
  // ("non-Human"). The subtype must be in the curated TARGET_SUBTYPES allowlist (a real, collision-free creature
  // subtype), so the notSubtype filter (applied at resolution by greatestPtAmong, changeling-aware) credits
  // EXACTLY the non-<Subtype> creatures — never a silently mis-scoped max (THE CREED: an un-enforced type filter
  // is a forbidden partial). A subtype outside the allowlist ("non-Wizard" would need it curated) fails the guard
  // → null → low → Arbiter (safe FN). Canonicalized to Title-Case for the resolution-time \b type-line match.
  let gm = p.match(/^greatest (power|toughness) among non-([a-z]+) creatures you control$/);
  if (gm && TARGET_SUBTYPES.has(gm[2])) {
    const kind = gm[1] === "power" ? "greatestPowerYouControl" : "greatestToughnessYouControl";
    return withExclude({ kind, notSubtype: gm[2].charAt(0).toUpperCase() + gm[2].slice(1) });
  }
  // ===== EXPERIENCE ===== the controller's experience counter total. "experience counters you have" is the
  // bare canonical form; "the controller has" is a rare alternate phrasing on non-Toph cards.
  if (/^experience counters? (?:you have|the controller has)$/.test(p)) return withExclude({ kind: "experienceCounters" });
  // ===== DEATHS-THIS-TURN (CR 700.4) ===== "creature(s) that died this turn" — the count of creatures that
  // DIED (battlefield→graveyard) this turn, read off the per-turn tally maintained at the death chokepoint.
  // TWO scopes, both controller-rooted at resolution:
  //   "creatures that died this turn"                    → scope:"all"  (every seat's deaths summed —
  //                                                         Mahadi "create a Treasure for each creature that
  //                                                         died this turn", Gadrak's nontoken variant aside).
  //   "creatures that died under your control this turn" → controller-only (Body Count "draw a card for each
  //                                                         creature that died under your control this turn").
  // PLURAL form only ("creatures that died") — the SINGULAR "a creature died this turn" is an intervening-if
  // CONDITION (interveningIf.js), never a payoff count. "nontoken creatures that died" (Gadrak/Rise of the
  // Dread Marn) / "Zubera that died" / "under an opponent's control" all fail this exact-anchor → low → Arbiter
  // (CREED — never a silently mis-scoped death count). who is intentionally NOT used (the all/controller split
  // is countForSpec-internal, summing seats vs reading one), so this stays valid for every count consumer.
  if (/^creatures? that died this turn$/.test(p)) return withExclude({ kind: "creaturesDiedThisTurn", scope: "all" });
  if (/^creatures? that died under your control this turn$/.test(p)) return withExclude({ kind: "creaturesDiedThisTurn" });
  return null;
}

/**
 * Parse a granted-keyword phrase ("trample", "flying and vigilance", "deathtouch and indestructible",
 * "trample, hexproof, and indestructible") into canonical keyword names, or null if ANY word is outside the
 * enforced + layer-aware GRANTABLE_STATIC_KEYWORDS set (combat keywords + indestructible + hexproof + shroud
 * — PUMP-STATIC-GRANT — + defender/shadow/flanking/exalted, SLIVER INTERIORS SP-1; see keywords.js for the
 * per-keyword enforcement sites). ALL-OR-NOTHING: one unmodeled keyword (protection/banding/an ability word)
 * drops the whole grant to null → the clause is unmodeled → low → Arbiter, never a fake/partial grant. Shared
 * by the pump + self/team/triggering-creature + activated-grant + animate matchers; every consumer grants via
 * a layer-6 addKeyword, so all four static keywords are honored layer-aware exactly like a printed one.
 */
export function parseGrantedKeywords(phrase) {
  const words = String(phrase).split(/,|\band\b/).map((w) => w.trim()).filter(Boolean);
  if (words.length === 0) return null;
  const out = [];
  for (const w of words) {
    if (!GRANTABLE_STATIC_KEYWORDS.has(w.toLowerCase())) return null;
    out.push(canonicalCombatKeyword(w));
  }
  return out;
}

/**
 * P3.2 tutor filter ALLOWLIST — the type / supertype / land-subtype / curated-creature-subtype words
 * the engine can match against a card's type line by literal containment (each word appears verbatim
 * in a real type line). A filter built only from these words is modeled; ANY other word ("nonland",
 * "permanent", "with", "named", a number, an un-listed subtype) makes the filter unmodeled → the
 * tutor drops to low → Arbiter, so the engine never silently mis-matches a filter it doesn't truly
 * understand.
 *
 * WAVE-2b TUTOR — the curated CREATURE-SUBTYPE block below is admitted for to-HAND / to-TOP
 * tutors, and (BLITZ TUT-1) for the FIXED-MV-CAPPED to-battlefield fetch (bfn), where the printed
 * mana-value cap is the anti-cheat guarantee the LAND-guard provides elsewhere (parseTutorFilter is
 * shared, but the UNCAPPED to-battlefield paths — RAMP-1/MULTI/SPLIT — still require every group be
 * guaranteed-land, which no creature subtype is, so an uncapped subtype tutor can never cheat a
 * non-land into play). Each word appears verbatim as a subtype in the corpus type line
 * ("Creature — Dragon"), so `\bdragon\b` matches exactly the subtyped creatures (CR 205.3m).
 */
const TUTOR_FILTER_WORDS = new Set([
  "basic", "legendary", "snow", "land", "creature", "artifact", "enchantment",
  "instant", "sorcery", "planeswalker", "battle", "plains", "island", "swamp",
  "mountain", "forest", "equipment", "aura",
  // Curated creature subtypes (tribal tutors). Each is a real creature subtype that (a) has at
  // least one "search your library for a <subtype> card" tutor in the corpus and (b) appears
  // verbatim ONLY in the subtype portion of a type line (verified zero collision with any
  // non-subtyped card), so `\b<subtype>\b` containment matches exactly the subtyped creatures.
  // "rebel"/"mercenary" verified 2026-07-16 (BLITZ TUT-1, the recruiter chains): zero corpus type
  // lines carry either word left of the em-dash.
  "dragon", "merfolk", "dinosaur", "goblin", "wizard", "elf", "sliver", "vampire",
  "rebel", "mercenary",
  // ⭐ TF-1 (2026-08-06) — eight more, each held to BOTH of this list's own stated criteria, measured rather
  // than assumed:
  //   (a) at least one "search your library for / reveal a <subtype> card" carrier in the corpus —
  //       giant 4, pirate 2, human 1, soldier 1, zombie 1, angel 1, warrior 1, cleric 1.
  //   (b) the word appears ONLY on the subtype side of the em dash, ZERO occurrences left of it or on a
  //       dashless type line (human 4,808 subtype-side / 0 collisions; giant 251 / 0; the rest likewise).
  // ⛔ I FIRST ADDED EIGHTEEN. Ten of them — beast, spirit, knight, rogue, druid, shaman, dwarf, cat, bird,
  // snake — passed (b) and FAILED (a) with ZERO carriers: pure untested surface in a gate whose whole job is
  // to refuse. Trimmed. Criterion (a) is not decoration; it is what keeps this list from accumulating words
  // no card can exercise.
  // ⛔ THE COLLISION CHECK ALMOST PASSED BROKEN. Its first run reported 0 subtype-side hits for EVERY
  // candidate — impossible, since "Human" is on thousands of type lines — and would have read as "all safe"
  // at a glance. A shell-eaten backslash had turned `\b` into a literal BACKSPACE so nothing matched. The
  // all-zero rule caught it; the probe now lives in a file with a sanity gate that fails loudly if a known
  // type line stops splitting.
  "human", "soldier", "zombie", "angel", "warrior", "cleric", "pirate", "giant",
]);
// ===== RAMP-TYPED ===== the five basic LAND TYPES (CR 305.6). A tutor-filter group naming any of
// these is GUARANTEED to fetch a LAND — verified against the bundled corpus: ZERO non-land cards
// carry a basic land type on their front face — so the battlefield-destination ramp tutor (RAMP-1,
// below) can safely accept a TYPED-BASIC fetch (Nature's Lore "a Forest card", Farseek "a Plains,
// Island, Swamp, or Mountain card") alongside the literal "basic land" phrase, without a non-land
// cheat-into-play ever slipping through the land-guard.
export const BASIC_LAND_SUBTYPES = new Set(["plains", "island", "swamp", "mountain", "forest"]);
// ===== COLOR-QUALIFIED FILTER ===== the five mono-colors a "<color> creature card" tutor/put filter may
// name, plus their "non<color>" negations (Surprise Deployment's "nonwhite creature"). A UNION ("white or
// blue") or a guild word ("Gruul") is NOT modeled — only a single leading color word is peeled. Shared source
// of truth for the hand→battlefield put (Dramatic Entrance) AND the library→battlefield X-tutor (Green Sun's
// Zenith "a green creature card"); cardMatchesTutorFilter's color gate reads the resulting `colors` array.
export const TUTOR_COLOR_WORD = new Set([
  "white", "blue", "black", "red", "green",
  "nonwhite", "nonblue", "nonblack", "nonred", "nongreen",
]);
/**
 * Parse a tutor's filter phrase (the words between "for a/an" and "card") into
 * `{ groups }` — an OR of AND-groups: "instant or sorcery" → [["instant"],["sorcery"]],
 * "basic land" → [["basic","land"]]. Returns null if ANY word is outside the allowlist
 * (→ the tutor is unmodeled → low). A card matches if ANY group's words ALL appear in
 * its type line (effectAtoms.cardMatchesTutorFilter).
 */
export function parseTutorFilter(phrase) {
  // Split a union into AND-groups on " or " AND comma-lists (Oxford comma): "Plains, Island, Swamp,
  // or Mountain" → 4 groups (RAMP-TYPED's typed-basic union, Farseek). The ", or " separator is tried
  // BEFORE a bare ", " so the final Oxford-comma item isn't left with a stray leading "or". Backward-
  // compatible: phrases with no comma ("basic land", "instant or sorcery") split exactly as before.
  let rest = String(phrase).trim();

  // ===== COLOR-QUALIFIED (Natural Order #1594, Summoner's Pact #3114, Magus of the Order) ==============
  // "a GREEN creature card". The color gate (`filter.colors`) already exists in cardMatchesTutorFilter —
  // only the parse was missing, so this is the graveyard-destination shape again: machinery present,
  // vocabulary absent. Peeled BEFORE the union split, because "blue or black creature" would otherwise
  // shatter into ["blue"] + ["black creature"] and validate as neither.
  //
  // ⛔ COLORS MUST NOT BECOME GROUP WORDS. A group word is matched by `\b<word>\b` CONTAINMENT AGAINST THE
  // TYPE LINE, and no type line contains "green" — the tutor would classify native, find nothing, ever, and
  // the tier would never show it. That is the vacuous-subtype-filter FP class the ledger keeps a probe for.
  //
  // ⛔ AND ONLY A SINGLE COLOR IS ADMITTED. `cardMatchesTutorFilter`'s color loop is an AND over the list,
  // but printed text means OR ("blue or black creature" = a creature that is blue OR black). Emitting both
  // would demand a card be BOTH — narrower than printed. Rather than silently under-deliver, a color UNION
  // parks the whole tutor (Kaito Shizuki), which is the honest read until the gate learns OR.
  // ===== NONLEGENDARY (SG-2, 2026-09-03 — Woodland Bellower "a nonlegendary green creature card with mana value 3
  // or less") — a SUPERTYPE exclusion gate (`filter.excludeLegendary`), peeled first so the color peel below
  // still sees "green creature". Like the color and permanent gates it is enforced in cardMatchesTutorFilter;
  // never a group word (no type line contains "nonlegendary" — the vacuous-filter FP).
  let excludeLegendary = false;
  if (/^nonlegendary\s+/i.test(rest)) {
    excludeLegendary = true;
    rest = rest.replace(/^nonlegendary\s+/i, "").trim();
  }
  let colors = null;
  const cm = rest.match(/^((?:white|blue|black|red|green)(?:\s+or\s+(?:white|blue|black|red|green))+)\s+(.+)$/i);
  if (cm) return null; // a color UNION — see above
  const c1 = rest.match(/^(white|blue|black|red|green)\s+(.+)$/i);
  if (c1) {
    colors = [c1[1].toLowerCase()];
    rest = c1[2].trim();
  }

  // ===== PERMANENT-CARD (CR 110.4a) — "a PERMANENT card", "a DRAGON permanent card" ====================
  // Scion of the Ur-Dragon, Dragonstorm, Zirilan of the Claw, Planar Bridge, Tezzeret Artifice Master,
  // Lin Sivvi. `filter.permanentOnly` already exists too (built for Wargate's MV-capped permanent fetch);
  // it requires a POSITIVE permanent-type match on the front face, so an instant/sorcery can never sneak in.
  // A qualifier in front ("dragon permanent") keeps its group word AND the permanent gate — both must hold.
  let permanentOnly = false;
  if (/\bpermanent$/i.test(rest)) {
    permanentOnly = true;
    rest = rest.replace(/\s*\bpermanent$/i, "").trim();
  }

  // ===== HISTORIC (CR 700.6 — "an object that has the legendary supertype, the artifact card type, or the
  // Saga subtype"; LANDS-TIER slice 3, Monumental Henge "reveal a historic card") =========================
  // A GATE (`filter.historic`), never a group word: group words are matched by containment against the
  // type line and no type line contains "historic" — as a group word it would be the vacuous-filter FP
  // this function's own color note warns about. Only the bare word is admitted ("historic card"); a
  // qualified form ("historic creature") is not a printed shape this slice has a carrier for → null.
  let historic = false;
  if (/^historic$/i.test(rest)) {
    historic = true;
    rest = "";
  }

  if (!rest) {
    // A bare "permanent card" / "historic card" (optionally color-qualified) — no type groups to match, just the gates.
    if (!permanentOnly && !historic) return null;
    return { groups: [], ...(permanentOnly ? { permanentOnly } : {}), ...(historic ? { historic } : {}), ...(colors ? { colors } : {}) };
  }

  const groups = rest.split(/,\s*or\s+|,\s*|\s+or\s+/).map((g) => g.trim().split(/\s+/).filter(Boolean));
  if (groups.length === 0 || groups.some((g) => g.length === 0)) return null;
  // ===== TYPED-BASIC UNION (LANDS-TIER slice 8, 2026-09-03) — "basic Plains, Swamp, or Forest card" ========
  // (the MH3 Landscapes, the Panoramas, the SNC Overlook cycle, the Monuments — 26 corpus cards). Printed
  // English distributes the "basic" across the union: the card fetches a BASIC land of one of those types.
  // The split above leaves "basic" in the FIRST group only, and the battlefield-tutor admission rightly
  // refused that half-basic read as ambiguous. Distribute it — and ONLY when the lead group is exactly
  // "basic <basic type>" and every other member is a bare basic land type; "basic Plains or creature" is
  // left as split (still ambiguous, still refused downstream). The shared matcher reads a [basic, swamp]
  // group as "type line contains both", so a nonbasic Swamp is refused and a Snow-Covered Swamp admitted.
  const distribute = groups.length > 1 && groups[0][0] === "basic" && groups[0].length === 2 && BASIC_LAND_SUBTYPES.has(groups[0][1])
    && groups.slice(1).every((g) => g.length === 1 && BASIC_LAND_SUBTYPES.has(g[0]));
  if (distribute) for (let i = 1; i < groups.length; i++) groups[i] = ["basic", ...groups[i]];
  for (const g of groups) for (const w of g) if (!TUTOR_FILTER_WORDS.has(w)) return null;
  return { groups, ...(permanentOnly ? { permanentOnly } : {}), ...(colors ? { colors } : {}), ...(excludeLegendary ? { excludeLegendary } : {}) };
}
// WAVE-2b TUTOR — UP-TO-N word→number for the multi-fetch ramp tutors ("up to two/three/four/five").
export const UP_TO_N_WORD = { two: 2, three: 3, four: 4, five: 5 };
/**
 * WAVE-2b TUTOR — parse a tutor's optional MANA-VALUE constraint clause (the bit AFTER "card":
 * "with mana value 2 or less" → {max:2}; "with mana value 3" → {exact:3}). Returns null when there's
 * no MV clause (an undefined capture group) — a clean "no MV cap". Only "or less" / exact are modeled
 * (Spellseeker MV<=2, Trophy Mage MV=3); a "with mana value N or greater" / "X" / any other comparator
 * never matches the capturing regex, so the whole tutor stays low → Arbiter (CREED — never a mis-cap).
 */
export function parseTutorMv(capture) {
  if (capture === undefined || capture === null) return null;
  const m = String(capture).match(/^(\d+)( or less)?$/);
  if (!m) return null; // an unmodeled comparator → caller drops the tutor to low
  const n = parseInt(m[1], 10);
  return m[2] ? { max: n } : { exact: n };
}

// ===== TOKEN HELPERS (seam batch 19 — moved from parser.js so atoms/tokens.js can import them cycle-free) =====
// The clean inline mana ability a minted creature-token may carry ("{T}: Add {G}", "{T}, Sacrifice this token:
// Add one mana of any color", …). A rider/restriction/non-mana effect fails the regex → null → the token (and
// its whole card) drops to low → Arbiter (CREED: never a mis-resolved native).
const TOKEN_MANA_ABILITY = /^(?:\{t\}(?:, sacrifice this (?:token|creature|artifact))?|sacrifice this (?:token|creature|artifact)): add (\{[wubrgc]\}(?: or \{[wubrgc]\})?|\{([wubrgc])\}\{\2\}|one mana of any color)$/i;
/** Canonical Oracle casing for a (lowercased) clean mana ability — readability only; the mana model
 *  reads it case-insensitively. Uppercases mana pips and the {T} symbol, capitalizes Sacrifice/Add. */
function canonicalizeManaAbility(lower) {
  return lower
    .replace(/\{([wubrgc])\}/gi, (_, c) => `{${c.toUpperCase()}}`)
    .replace(/^\{t\}/i, "{T}")
    .replace(/, sacrifice this/i, ", Sacrifice this")
    .replace(/^sacrifice this/i, "Sacrifice this")
    .replace(/: add /i, ": Add ");
}
/**
 * Parse a token's quoted ability (the text after "with"/"It has", including the surrounding quotes)
 * into the canonical mana-ability oracle string to stamp on the minted token, or null if it isn't a
 * CLEAN mana ability (any rider/restriction/non-mana effect). Tolerates straight or curly quotes and a
 * trailing period.
 */
export function parseTokenManaAbility(quotedWithQuotes) {
  const inner = String(quotedWithQuotes).trim()
    .replace(/^["“'](.*)["”']$/s, "$1")  // strip surrounding quotes (straight or curly)
    .trim().replace(/\.\s*$/, "");        // strip a trailing period
  if (!TOKEN_MANA_ABILITY.test(inner)) return null;
  return canonicalizeManaAbility(inner);
}
// Canonical case for the non-combat keywords a token may carry (combat ones come from canonicalCombatKeyword).
// The SP-1 four are included so a minted token's keywords[]/oracle read in Oracle casing; the minted oracle
// line (tokens.js keywords.join) is what the structural instance counters + hasKeyword scan match on.
const TOKEN_KEYWORD_CANON = { indestructible: "Indestructible", defender: "Defender", shadow: "Shadow", flanking: "Flanking", exalted: "Exalted" };
/**
 * Parse a keyword-token's "with …" phrase ("flying", "flying and vigilance", "first strike, deathtouch, and
 * lifelink") into canonical keyword names, or null if ANY word is outside the enforced+layer-aware GRANTABLE
 * STATIC set (combat keywords + indestructible). ALL-OR-NOTHING: one unmodeled keyword drops the whole token to
 * null → low → Arbiter, never a fake/partial token. A trailing period (single-sentence clause) is tolerated.
 */
export function parseTokenKeywords(phrase) {
  const words = String(phrase).replace(/\.\s*$/, "").split(/,|\band\b/).map((w) => w.trim()).filter(Boolean);
  if (words.length === 0) return null;
  const out = [];
  for (const w of words) {
    const lw = w.toLowerCase();
    if (!GRANTABLE_STATIC_KEYWORDS.has(lw)) return null;
    out.push(TOKEN_KEYWORD_CANON[lw] || canonicalCombatKeyword(w));
  }
  return out;
}

// ===== TOKENS ===== T5 quoted TRIGGERED ability — a minted token may carry a self-DIES triggered ability
// whose trigger event AND payoff are BOTH modeled and runtime-fired end-to-end (a Pest's "When this token dies,
// you gain N life", a Devil's "When this token dies, it deals N damage to any target / to each opponent" —
// SoK/Innistrad-block staples). Stamped as the token's real oracle so checkDiesTriggers detects the self-dies
// descriptor when the token dies (selfRef matches "this token") and the payoff resolves through the normal
// pending-trigger flush — the SAME "mint real oracle text; existing subsystems drive it" pattern as the mana
// ability (T4) and named tokens (T2). CURATED + `^…$`-anchored, FAIL-CLOSED: only the exact runtime-verified
// corpus forms are admitted, each rebuilt into clean canonical Oracle text (the input clause is lowercased
// upstream); any other quoted ability — an unmodeled trigger, or a create-token payoff that could recurse a
// mint — returns null → the whole token (and its card) drops to low → Arbiter (CREED — a token must NEVER carry
// an ability the engine won't actually fire, which would be a forbidden false-positive native).
const TOKEN_TRIGGERED_ABILITY = [
  [/^when this token dies, you gain (\d+) life$/i, (m) => `When this token dies, you gain ${m[1]} life.`],
  [/^when this token dies, it deals (\d+) damage to any target$/i, (m) => `When this token dies, it deals ${m[1]} damage to any target.`],
  [/^when this token dies, it deals (\d+) damage to each opponent$/i, (m) => `When this token dies, it deals ${m[1]} damage to each opponent.`],
];
/**
 * Parse a token's quoted ability (the text after "with"/"It has"/"They have", including the surrounding
 * quotes) into a canonical TRIGGERED-ability oracle string to stamp on the minted token, or null if it isn't
 * one of the curated, runtime-verified self-dies forms above. Tolerates straight or curly quotes and a
 * trailing period. Tried AFTER parseTokenManaAbility in the create-token "with" branch (a quoted ability is a
 * mana ability XOR a triggered ability); both gates return null for anything unmodeled, so the token parks.
 */
export function parseTokenTriggeredAbility(quotedWithQuotes) {
  const inner = String(quotedWithQuotes).trim()
    .replace(/^["“'](.*)["”']$/s, "$1")  // strip surrounding quotes (straight or curly)
    .trim().replace(/\.\s*$/, "");        // strip a trailing period
  for (const [re, canon] of TOKEN_TRIGGERED_ABILITY) {
    const m = inner.match(re);
    if (m) return canon(m);
  }
  return null;
}

/**
 * SHELF-85 S8 / S5 (2026-09-04 — Shorikai, Genesis Engine / Prodigy's Prototype: the Pilot token "with 'This token crews
 * Vehicles as though its power were 2 greater.'"): a token's quoted STATIC ability, canonicalized onto the minted
 * token's oracle so the crew lane reads it (abilities.crewPowerBonus — the offer AND the dispatch add the boost, CR
 * 702.122c "as though its power were N greater"). The one curated static; anything else → null → the token parks.
 */
export function parseTokenStaticAbility(quotedWithQuotes) {
  const inner = String(quotedWithQuotes).trim()
    .replace(/^["“'](.*)["”']$/s, "$1")
    .trim().replace(/\.\s*$/, "");
  const m = inner.match(/^this (?:token|creature) crews vehicles as though its power were (\d+) greater$/i);
  return m ? `This creature crews Vehicles as though its power were ${m[1]} greater.` : null;
}
