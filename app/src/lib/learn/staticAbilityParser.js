/**
 * staticAbilityParser.js — bounded oracle → static continuous-effect interpreter
 * (Phase-7 PR-9). Recognizes a small, SAFE, high-confidence grammar of static
 * P/T-boost and keyword-grant abilities (anthems + tribal lords — the owner
 * plays Slivers) and emits partial `ContinuousEffect` descriptors (sans
 * id/timestamp/source — `layers.staticEffectsOf` fills those).
 *
 * Anti-fabrication discipline (CLAUDE.md §1.2), mirroring keywords.js:
 *   - Match only at ABILITY-LINE positions (clause starts), so reminder text and
 *     conditional / "can't be blocked by creatures with flying" clauses never
 *     false-match.
 *   - A miss yields NO effect (the creature just doesn't get the buff) — never a
 *     fabricated one. False negatives are safe; false positives are forbidden.
 *   - Granted keywords are validated against a known set; unknown words are
 *     ignored, never granted.
 *
 * CR grounding: static abilities create continuous effects (CR 604.2, 611.3);
 * P/T boosts apply in layer 7c (CR 613.4c); granted keywords in layer 6
 * (CR 613.1f). Phase-2 grows THIS grammar; the layer engine itself is general.
 *
 * Pure; imports only the keyword vocabulary. Returns plain JSON descriptors.
 */

import { stripFlashPermissionLine } from "./effects/textNormalize.js"; // leaf module, no cycle — shared self-flash strip
import { GRANTABLE_STATIC_KEYWORDS, canonicalCombatKeyword, hasKeyword } from "./keywords.js";
import { isLevelerFrame } from "./leveler.js"; // LV-1 — the leveler frame detector (leaf module, no cycle)
import { isAttackTaxClause, parseAttackTax } from "./attackTax.js"; // ATTACK TAX (CR 508.1g) — a pure leaf, shared with the runtime so metric and game agree
import { CR_CREATURE_TYPES } from "./effects/creatureTypes.js"; // the closed creature-subtype vocabulary, imported from the LEAF (never through targeting.js — that edge crashes module init; see creatureTypes.js)
// COUNT_SUBTYPE — the ONE curated, collision-free permanent-subtype allowlist (parseCountSource and the
// team-pump scope already share it). Imported straight from parseHelpers, which imports only keywords.js —
// a zero-import leaf this file ALREADY imports — so the edge adds no new module-init ordering (verified with
// the mandatory `node -e "import './src/lib/learn/legalChoices.js'"` graph check, per the run ledger).
import { COUNT_SUBTYPE } from "./effects/parseHelpers.js";

// The closed vocabulary a "cast <X> spells from the top of your library" filter word must belong to. Card
// types (CR 205.2a) plus every printed creature type; anything else parks the clause. Built LAZILY on first
// use — CR_CREATURE_TYPES must never be read at module-init time or the import cycle bites.
const CAST_FROM_TOP_CARD_TYPES = ["creature", "artifact", "enchantment", "instant", "sorcery", "land", "planeswalker", "battle"];
let castFromTopVocab = null;
function castFromTopTypeWords() {
  if (!castFromTopVocab) castFromTopVocab = new Set([...CAST_FROM_TOP_CARD_TYPES, ...CR_CREATURE_TYPES]);
  return castFromTopVocab;
}

// GROUP-ACTIVATED grant validator (injected — CR 113.7). Whether a quoted group-grant body ("All Slivers
// have \"{2}: Regenerate this permanent.\"") is a FULLY-MODELED activated ability is decided by
// parseActivatedAbilities, which lives in effects/abilities.js → effects/parser.js → (back to this module):
// a STATIC import would form a load-time cycle through the atoms registry and crash module eval. So the
// check is REGISTERED at load by the modules that own it (coverage.js for classification, legalChoices.js
// for the runtime), mirroring registerCoverageClassifier. Until registered the emission is skipped (a group
// grant simply stays body-only — a safe FN), so a parseClause caller that loads neither consumer is never
// given a half-modeled grant.
let _groupActivatedBodyValidator = null;
export function registerGroupActivatedBodyValidator(fn) {
  _groupActivatedBodyValidator = typeof fn === "function" ? fn : null;
}

// GROUP-TRIGGERED grant validator (injected — CR 113.7). Whether a quoted group-grant body that is a
// TRIGGERED ability ("Sliver creatures you control have \"Whenever this creature deals combat damage to a
// player, put a +1/+1 counter on it.\"" — Tempered Sliver) is FULLY MODELED is decided by detectTriggers +
// the same triggerRoutesNatively gate the Aura/Equipment granted-triggered path uses. Same cycle-avoidance
// as the activated validator: registered at load by coverage.js (which owns triggerRoutesNatively). Until
// registered the emission is skipped (the grant stays body-only — a safe FN). The runtime that FIRES the
// granted trigger (triggers.grantedTriggersForGroup) is independent of this gate; this only governs whether
// the static EMITS a grant descriptor at all, keeping classifier + runtime from over-claiming an unmodeled body.
let _groupTriggeredBodyValidator = null;
export function registerGroupTriggeredBodyValidator(fn) {
  _groupTriggeredBodyValidator = typeof fn === "function" ? fn : null;
}

// LEVELER validator (injected — BLITZ LV-1, CR 702.87 / 711). Whether a leveler card is WHOLLY
// modeled (frame + every band line + the level-up ability) is decided by effects/abilities.js
// `modeledLeveler`, which lives behind effects/parser.js → (back to this module): a STATIC import
// would form the same load-time cycle as the group-grant validators above, so it's REGISTERED at
// load by coverage.js / legalChoices.js. Until registered, a leveler emits NO band statics (it
// stays the pre-slice vanilla body — a safe FN). The validator returns the parsed bundle
// ({ bands: [{atLeast, atMost, power, toughness, keywords[]}] }) or null.
let _levelerCardValidator = null;
export function registerLevelerCardValidator(fn) {
  _levelerCardValidator = typeof fn === "function" ? fn : null;
}

// The grantable-keyword set + canonical-caser live in keywords.js as the SINGLE source of truth,
// so a granted keyword can never be one the engine doesn't enforce. The STATIC path (this module:
// anthems/lords + attached Equipment/Auras) uses the static superset — the combat keywords PLUS
// indestructible (now enforced by the destroy effect + lethal SBA). The combat-trick grant path
// (effects/parser.js) keeps the combat-only set, so the two can't drift. Menace is excluded from
// both (unenforced).
const GRANTABLE_KEYWORDS = GRANTABLE_STATIC_KEYWORDS;

// Permanent-type subject words → the cardTypes the layer selector filters on. "permanents" → no
// type filter (any permanent). Used by the indestructible-grant branch below; layers.matchesSelector
// applies cardTypes generally, so this is NOT creature-restricted like the anthem path.
const PERMANENT_TYPE_CARD_TYPES = {
  artifact: ["Artifact"], artifacts: ["Artifact"],
  enchantment: ["Enchantment"], enchantments: ["Enchantment"],
  land: ["Land"], lands: ["Land"],
  permanent: [], permanents: [],
};

// Color words → WUBRG letters (for "white creatures you control get +1/+1").
const COLOR_WORDS = { white: "W", blue: "U", black: "B", red: "R", green: "G" };

/**
 * Split oracle text into ability clauses, anchored on sentence / line / clause
 * boundaries (period, semicolon, newline). Each clause is matched independently
 * at its start, so a buff pattern can't match mid-sentence.
 */
export function abilityClauses(oracle) {
  // QUOTE-AWARE split: a granted QUOTED ability ("All Slivers have \"{T}: Add one mana of any color.\"")
  // carries sentence punctuation (./;) INSIDE the quotes that must NOT split the clause — otherwise the
  // grant is shredded into "… have \"{T}: Add …" + a dangling "\"". Walk the text, tracking double-quote
  // depth (straight " and curly “ ”), and only break on \n / . / ; when OUTSIDE a quote. Behavior-identical
  // to the old `/[\n.;]+/` split for any text with no quotes (the common case).
  const text = String(oracle);
  const out = [];
  let buf = "";
  let inQuote = false;
  let parenDepth = 0;
  for (const ch of text) {
    // QUOTE-AWARE (see above): a quoted granted ability keeps its internal punctuation. Checked FIRST so a
    // paren INSIDE a quote (rare) is treated as quoted text, not reminder.
    if (ch === '"' || ch === "“" || ch === "”") { inQuote = ch === "”" ? false : (ch === "“" ? true : !inQuote); buf += ch; continue; }
    // PAREN-AWARE reminder drop (CR 207.2). Reminder text is parenthetical and must be removed BEFORE the
    // sentence split — a MULTI-sentence reminder ("…your opponents control. It can attack and {T}…" —
    // Swiftfoot Boots) has internal periods that would otherwise shred the clause and orphan the 2nd reminder
    // sentence as fake residue (a false-negative that left Swiftfoot Boots / Whispersilk Cloak body-only while
    // single-sentence-reminder twins like Lightning Greaves flipped). Drop all chars while inside parens and
    // never split there. This realizes abilityClauses' documented intent ("drops parenthetical reminders").
    if (!inQuote && ch === "(") { parenDepth++; continue; }
    if (!inQuote && ch === ")") { if (parenDepth > 0) parenDepth--; continue; }
    if (parenDepth > 0) continue;
    if (!inQuote && (ch === "\n" || ch === "." || ch === ";")) { if (buf.trim()) out.push(buf.trim()); buf = ""; continue; }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** Parse a signed integer like "+1" / "-1" / "+2". */
function signed(str) {
  return parseInt(str, 10) || 0;
}

/**
 * Normalize a captured plural subtype word into its canonical proper-noun form
 * ("slivers" → "Sliver"). Creature subtypes are proper nouns; matching is
 * case-insensitive downstream, but the canonical case keeps descriptors readable
 * for the explain panel.
 */
// Creature subtypes whose plural is IRREGULAR or INVARIANT — a naive trailing-"s" strip mangles them
// (Pegasus→"Pegasu", Mice→"Mice", Heroes→"Heroe", Detectives→"Detectif"), producing a selector that matches
// NO creature (the buff silently applies to nobody while the card may still count native). Keyed by the
// lowercased plural as it appears in oracle text → canonical singular subtype.
const IRREGULAR_SUBTYPE_PLURALS = {
  allies: "Ally",
  mice: "Mouse", oxen: "Ox", heroes: "Hero", detectives: "Detective",
  // "-uses" plurals of an "-us" singular (Octopus → Octopuses): the naive trailing-"s" strip yields
  // "Octopuse", matching NO creature. Map the plural explicitly (Serpent of Yawning Depths names Octopuses).
  octopuses: "Octopus",
  // invariant "-us" subtypes (singular === plural): a trailing-s strip would wrongly cut them
  pegasus: "Pegasus", fungus: "Fungus", homunculus: "Homunculus", locus: "Locus", jellyfish: "Jellyfish",
};
function normalizeSubtype(word) {
  let w = word.trim();
  const lc = w.toLowerCase();
  if (IRREGULAR_SUBTYPE_PLURALS[lc]) return IRREGULAR_SUBTYPE_PLURALS[lc];
  //   "-ves" → "-f"  (Elves→Elf, Wolves→Wolf, Dwarves→Dwarf);
  //   Plain "-s" strips to singular (Slivers→Sliver); invariant "-us" nouns are handled above.
  if (/ves$/i.test(w)) w = w.slice(0, -3) + "f";
  else if (w.endsWith("s")) w = w.slice(0, -1);
  return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w;
}

// ── GROUP-BLOCK-RESTRICTION parse (Shifting Sliver / Serpent of Yawning Depths) — the SINGLE SOURCE OF TRUTH.
// Both the classifier (the `blockRestriction` static marker below) and the runtime block-legality chokepoint
// (combatEvasion.canBlockAttacker via groupBlockRestrictionOf) call this ONE pure function, so the metric and
// the enforcement can never drift. A subtype-list token is one-or-more comma-separated plural words, with an
// optional "and"/"or" before the last ("krakens, leviathans, and serpents"). Anchored ^…$ on the whole clause.
const RE_SUBTYPE_LIST = "([a-z]+s(?:\\s*,\\s*[a-z]+s)*(?:,?\\s+(?:and|or)\\s+[a-z]+s)?)";
const RE_GROUP_BLOCK_RESTRICTION = new RegExp(
  `^${RE_SUBTYPE_LIST}(\\s+you control)? can't be blocked except by ${RE_SUBTYPE_LIST}$`,
);

// Split a matched subtype-list token into canonical singular subtypes (via normalizeSubtype), de-duped and
// sorted (order-independent set compare).
function _subtypeListToCanon(token) {
  return [...new Set(
    String(token)
      // Split on commas (incl. the Oxford ", and"/", or") and bare "and"/"or" joiners.
      .split(/\s*,\s*(?:and\s+|or\s+)?|\s+and\s+|\s+or\s+/)
      .map((w) => w.trim())
      .filter(Boolean)
      .map(normalizeSubtype),
  )].sort();
}

/**
 * Parse the SYMMETRIC group "…can't be blocked except by <same subtype set>" static from raw oracle text.
 * Returns `{ subtypes: [canonical…], controllerScope: "you" | "any" }` when the attacker-side and
 * allowed-blocker-side subtype SETS are IDENTICAL (the modeled tribal shape), else null (safe FN).
 *   • controllerScope "you"  — the "…you control…" form (Serpent): the restriction applies only to
 *                              those-subtype attackers the static's controller controls.
 *   • controllerScope "any"  — board-wide (Shifting Sliver): every controller's such attacker is restricted.
 * Reminder text is stripped, the card name normalized to "this creature" (a harmless no-op — the subject is a
 * bare plural), and the text lowercased. Pure; no game-state dependency. `name` is optional.
 */
export function parseGroupBlockRestriction(oracle, name) {
  const norm = selfNormalizeOracle(String(oracle || ""), name).toLowerCase().replace(/[’']/g, "'");
  for (const clause of norm.split(/(?:^|[\n.;])\s*/)) {
    const m = clause.trim().match(RE_GROUP_BLOCK_RESTRICTION);
    if (!m) continue;
    const atk = _subtypeListToCanon(m[1]);
    const blk = _subtypeListToCanon(m[3]);
    // SYMMETRIC only: attacker set === allowed-blocker set (order-independent); else safe FN.
    if (atk.length === 0 || atk.length !== blk.length) continue;
    if (atk.some((s, i) => s !== blk[i])) continue;
    return { subtypes: atk, controllerScope: m[2] ? "you" : "any" };
  }
  return null;
}

// Leading words in "<word> creatures you control …" that are NOT creature subtypes — board STATE
// ("attacking"/"tapped"…), supertype/quality qualifiers ("token"/"legendary"/"colorless"…), or
// determiners handled by the path above. The no-determiner tribal-anthem matcher excludes these so a
// state-conditional anthem ("Attacking creatures you control get +1/+0" — Lovisa) is never parsed as a
// subtype grant that selects nobody yet flips the card native (a CREED false positive). Real subtypes
// (Sliver, Dragon, Goblin, Outlaw…) are never in this set.
const NON_SUBTYPE_ANTHEM_WORDS = new Set([
  // board state
  "attacking", "blocking", "blocked", "unblocked", "tapped", "untapped", "enchanted", "equipped",
  // supertype / quality qualifiers ("premium" = the foil/Un-card quality — Super Secret Tech's "Premium
  // creatures get +1/+1"; NOT a creature subtype, so it must never fabricate a subtype grant that selects
  // nobody — yet a changeling would spuriously match it — while flipping the card native, a CREED FP).
  "token", "nontoken", "legendary", "nonlegendary", "colorless", "multicolored", "monocolored",
  "nonland", "snow", "monstrous", "modified", "premium",
  // colour qualifiers ("Nonblack creatures you control …" — Angel of Jubilation): not subtypes
  "nonwhite", "nonblue", "nonblack", "nonred", "nongreen",
  // CARD TYPES — "Artifact/Enchantment/Land/Commander creatures you control …" reads on the LEFT of the
  // em-dash, so it's a card-TYPE filter, NOT a subtype (subtypesOf reads only the right side). Treating
  // it as a subtype selects ZERO creatures while flipping the card native — a CREED false positive
  // (Tempered Steel, Thopter Engineer, Bastion Protector, Bloodsworn Steward). These stay body-only
  // until a card-type-selector anthem is built.
  "artifact", "enchantment", "land", "planeswalker", "battle", "commander",
  // determiners (handled by the path above) + bare nouns + "target" (a spell's "target creature you
  // control gets …" is not a permanent anthem — and a Sorcery never becomes a permanent anyway).
  "other", "another", "all", "each", "this", "your", "target", "creature", "creatures",
]);

// SUBJECT-QUALITY anthem filters (BLITZ SF-1) — a leading word in "<word> creatures you control get/have …"
// that is NOT a creature subtype but a SUPERTYPE / COLOR-QUALITY / TAP-STATE the derive-time selector can
// evaluate EXACTLY (layers.matchesSelector: `legendary`/`notLegendary` via effectiveTypeIdentity's supertype
// set — CR 205.4; the layer-aware color set `colorless`/`multicolored`/`notColors` via permanentColors — CR
// 105/202; `tapped`/`untapped` via the live candidate.tapped flag). Each maps to a partial selector fragment
// merged into the anthem's { controllerScope, cardTypes:["Creature"] } selector. These words are ALSO in
// NON_SUBTYPE_ANTHEM_WORDS (so the tribal-lord path never fabricates a zero-selecting subtype grant); this map
// is consulted FIRST in each anthem branch, so a MODELED quality anthem flips native while any OTHER quality
// word still falls through to body-only (CREED-safe FN). notColors letters follow COLOR_WORDS (WUBRG).
const SUBJECT_QUALITY_SELECTORS = {
  legendary: { legendary: true },
  nonlegendary: { notLegendary: true },
  colorless: { colorless: true },
  multicolored: { multicolored: true },
  untapped: { untapped: true },
  tapped: { tapped: true },
  nonwhite: { notColors: ["W"] },
  nonblue: { notColors: ["U"] },
  nonblack: { notColors: ["B"] },
  nonred: { notColors: ["R"] },
  nongreen: { notColors: ["G"] },
};

// STATIC-COST-REDUCTION: leading words in "<word> spells you cast cost {N} less to cast" that are NOT a
// permanent/spell SUBTYPE and never appear as a TYPE-LINE token — a color (also caught via COLOR_WORDS),
// a negated/category word ("noncreature"/"historic"), or an over-broad noun ("permanent"/"spell"). A
// word-bound type-line match for these would NEVER fire, so claiming the reducer native while it silently
// reduces nothing is a CREED false positive. Excluded → no descriptor → the card stays body-only (safe
// FN). Card-TYPE filters (Artifact/Enchantment/…) and supertypes/qualities are already in
// NON_SUBTYPE_ANTHEM_WORDS, which the cost-reduction recognizer reuses alongside this set.
const NON_SUBTYPE_COST_FILTER_WORDS = new Set(["noncreature", "historic", "permanent", "spell", "spells"]);

// GROUP-KEYWORD-GRANT (Wave 4): NON-CREATURE permanent/token SUBTYPES. The bare-subtype anthem selector
// ("<Subtype>s you control have <keyword>") restricts to cardTypes:["Creature"], so granting a keyword to a
// NON-creature subtype (Vehicles/Foods/Treasures/Equipment/Clues) selects ZERO creatures at runtime (crew is
// not modeled, and Food/Treasure/Clue/Equipment are never creatures) — claiming the card native would be a
// CREED false positive (Aeronaut Admiral "Vehicles you control have flying"). Excluded here → no descriptor →
// the card stays body-only (safe FN). Singular forms (the guard de-pluralizes the subject before testing).
const NON_CREATURE_SUBTYPES = new Set([
  "vehicle", "food", "treasure", "equipment", "clue", "aura", "powerstone", "blood", "gold", "map", "junk",
  "incubator", "saga", "fortification", "contraption", "attraction", "role", "case", "class", "lesson",
  "background", "dungeon", "shard", "sticker", "plane", "phenomenon", "scheme", "conspiracy",
  // ⚠️ LAND SUBTYPES, added 2026-07-29 — this set had covered only artifact/enchantment subtypes, and the
  // hole was found by AUDITING A GAINED ROW rather than by reasoning: the multi-subtype list arm flipped
  // Timber Protector ("Other Treefolk and Forests you control have indestructible") native, because "forest"
  // passed every guard here. Under the Creature-restricted selector the Forests half selects nothing, so the
  // card would have claimed native while granting indestructible to the Treefolk only — the same shape as the
  // Aeronaut Admiral FP this set already existed to stop, one card type over. No creature subtype collides
  // with any of these words, so excluding them can never park a real tribal grant.
  "plains", "island", "swamp", "mountain", "forest", "wastes",
  "cave", "desert", "gate", "lair", "locus", "mine", "tower", "sphere",
]);

// ===== MULTI-SUBTYPE LIST SUBJECT ("Skeletons, Vampires, and Zombies you control get +1/+1") =====
// ⭐ A MISSING PARSE ARM, NOT A MISSING MECHANIC. `selector.subtypes` has ALWAYS been an array and
// matchesSelector has ALWAYS ORed it — its own comment there reads "OR semantics, same as a multi-subtype
// list". The runtime was built for lists; nothing upstream ever PRODUCED one, so every printed list parked
// while its one-word sibling ("Zombies you control get +1/+1") went native. The same axis shape as the last
// four slices: the capability present on one arm of a function and absent on its neighbour.
//
// ⛔ EVERY ELEMENT MUST PASS OR THE WHOLE CLAUSE PARKS, and that all-or-nothing is the CREED, not caution. A
// list containing a NON-creature subtype is the dangerous case: "Mounts and Vehicles you control get +1/+1"
// (Cloudspire Captain) under the Creature-restricted selector would quietly grant to the Mounts only, flip the
// card native, and under-deliver on the Vehicles half forever. That is exactly the Aeronaut Admiral FP the
// one-word branch's NON_CREATURE_SUBTYPES guard exists to stop, so this reuses the identical trio of guards
// rather than inventing a second, weaker standard for lists.
//
// ⚠️ IT DOES NOT VERIFY THAT A WORD IS A REAL SUBTYPE, deliberately — matching its one-word sibling, which
// treats any unrecognized word as a subtype because a bogus one selects no creature (a safe FN, never a
// fabricated grant). Curation would be the WRONG gate here, and that was MEASURED rather than assumed:
// "Skeletons / Robots / Servos / Thopters / Orcs you control get +1/+1" all classify native TODAY with none
// of those words in any allowlist, so requiring one would park cards that already work.
//
// Accepts the separators as actually printed: "A and B", "A, B, and C" (Oxford comma), and the comma-less
// "A, B and C". Returns the normalized subtypes, or null when ANY element fails a guard.
function parseSubtypeListSubject(phrase) {
  const parts = String(phrase).split(/\s*,\s*and\s+|\s+and\s+|\s*,\s*/).map((w) => w.trim()).filter(Boolean);
  if (parts.length < 2) return null;                        // a single word is the one-word branch's job
  for (const word of parts) {
    if (word === "creature" || word === "creatures") return null;
    // De-pluralize against the SINGULAR exclusion sets exactly as the bare-plural one-word branch does.
    const candidates = [word];
    if (word.endsWith("ies")) candidates.push(word.slice(0, -3) + "y");
    if (word.endsWith("ves")) candidates.push(word.slice(0, -3) + "f");
    if (word.endsWith("s")) candidates.push(word.slice(0, -1));
    if (candidates.some((w) => NON_SUBTYPE_ANTHEM_WORDS.has(w) || NON_CREATURE_SUBTYPES.has(w))) return null;
    if (PERMANENT_TYPE_CARD_TYPES[word]) return null;
  }
  return parts.map(normalizeSubtype);
}

// STATIC-COST-REDUCTION (card-TYPE reducers): the card-type words that ARE real type-line tokens, so a
// "<word> spells you cast cost {N} less to cast" reducer (Foundry Inspector → "Artifact"; Marauding Raptor
// → "Creature") DOES reduce — the emitted "Artifact"/"Creature" feeds costReductionForSpell's word-bounded
// \b<word>\b type-line match (every card's type line starts with its card type). This is a SEPARATE additive
// allow-set scoped ONLY to the cost-reduction recognizers (crM/emM): "artifact"/"creature"/"enchantment"
// live in NON_SUBTYPE_ANTHEM_WORDS to block them on the ANTHEM/lord path (a card-TYPE anthem selects zero
// creatures — Tempered Steel FP), but for cost reduction the type-line match is correct. "instant"/"sorcery"
// already passed the guard (not in any exclusion set); listing them here is explicit, not a behavior change.
// DELIBERATELY EXCLUDES "permanent"/"noncreature"/"historic"/"spell" — those are NOT type-line tokens, so a
// word-bound match would reduce nothing (a false positive) → they stay in NON_SUBTYPE_COST_FILTER_WORDS.
const COST_REDUCTION_CARDTYPE_WORDS = new Set(["artifact", "creature", "enchantment", "instant", "sorcery"]);

// COLOR-COST-REDUCTION — parse a color cost-reducer clause into { colors:[WUBRG…], amount } | null. Two shapes:
//   • "each spell you cast that's <color>[ or <color>]… costs {N} less to cast"  (Goblin Anarchomancer — red or green)
//   • "<color> spells you cast cost {N} less to cast"                            (Ruby Medallion — single color)
// The color list is a UNION (a spell is reduced if ANY listed color matches, CR 105.2). DELIBERATELY rejects a
// mixed quality ("that's red or an artifact"), a "noncreature"/"historic" filter, or a "{X}/colored mana"
// amount → null → the clause stays body-only (CREED FN-safe). Pure; the WUBRG letters feed costReductionForSpell.
function parseColorCostReduction(clause) {
  const c = String(clause);
  // Shape A — "each spell you cast that's <colorlist> costs {N} less to cast"; else
  // Shape B — "<colorlist> spells you cast cost {N} less to cast" (single or "X or Y" color).
  const m = c.match(/^each spell you cast that's ([a-z ,]+?) costs \{(\d+)\} less to cast$/)
    || c.match(/^([a-z ,]+?) spells you cast cost \{(\d+)\} less to cast$/);
  if (!m) return null;
  const colorPhrase = m[1];
  const amount = parseInt(m[2], 10);
  // The color phrase must reduce to ONLY recognized color words joined by "or"/","/spaces — a single non-color
  // token (a subtype, "noncreature", "artifact") means it's not a pure color reducer → reject (the subtype path
  // already handles a real subtype/card-type; this path is ONLY for colors).
  const tokens = colorPhrase.split(/\bor\b|,/).map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) return null;
  const colors = [];
  for (const t of tokens) {
    const letter = COLOR_WORDS[t];
    if (!letter) return null;          // a non-color token → not a pure color reducer
    if (!colors.includes(letter)) colors.push(letter);
  }
  return { colors, amount };
}

// ─── TRUNK-SELFBUFF: count-scaled self static buff ──────────────────────────────
// A continuous (layer-7c) self-buff whose magnitude is a board count — "this creature gets +X/+Y for each
// <countsource>" (Nim Lasher, Benalish Honor Guard…). The layer engine re-evaluates the count each P/T
// computation. The count phrase is parsed to a SERIALIZABLE spec here; layers.js evaluates it (cycle-safe:
// parser.js's richer parseCountSource isn't importable — parser.js imports THIS module).
const SELF_COUNT_CARDTYPE = { creature: "Creature", creatures: "Creature", artifact: "Artifact", artifacts: "Artifact", land: "Land", lands: "Land", enchantment: "Enchantment", enchantments: "Enchantment" };
const SELF_COUNT_BASIC = { plains: "Plains", island: "Island", islands: "Island", swamp: "Swamp", swamps: "Swamp", mountain: "Mountain", mountains: "Mountain", forest: "Forest", forests: "Forest" };

/**
 * Parse the count phrase of a self "for each <X>" into a `{ kind:"permanentsYouControl", cardType|subtype }`
 * spec, or null. DELIBERATELY NARROW + allowlist-free: only "<card type> you control" and "<basic land>
 * you control" — the dup-free, unambiguous sources. A subtype ("Goblin"), "other", graveyard, hand, or any
 * opponent/qualified count → null → the clause produces NO descriptor → the card stays LOW (Arbiter, never a
 * fabricated buff). CREED: a miss is safe; a wrong count across 100s of cards is forbidden.
 */
function parseSelfCountSource(phrase) {
  const p = phrase.toLowerCase().trim().replace(/\.\s*$/, "");
  let m;
  if ((m = p.match(/^(creatures?|artifacts?|lands?|enchantments?) you control$/))) return { kind: "permanentsYouControl", cardType: SELF_COUNT_CARDTYPE[m[1]] };
  if ((m = p.match(/^(plains|islands?|swamps?|mountains?|forests?) you control$/))) return { kind: "permanentsYouControl", subtype: SELF_COUNT_BASIC[m[1]] };
  // NON-BASIC SUBTYPE you control — "+1/+1 for each Equipment you control" (Swordsman's Steel, Improvised
  // Arsenal), "for each Gate you control", "for each Goblin you control". ⭐ THE EVALUATOR ALREADY EXISTED:
  // layers.countSelfSpecOnBoard's permanentsYouControl branch reads `spec.cardType || spec.subtype` and does a
  // word-bounded type-line scan — the SAME wire the basic-land arm one line up has always used. Only this
  // vocabulary refused to produce the spec, so a count the runtime computes exactly was unreachable.
  // CREED: gated on COUNT_SUBTYPE, the curated allowlist whose own criterion is corpus-verified — every entry
  // is a real MTG subtype appearing ONLY in the subtype position of a type line, so `\b<Subtype>\b` can never
  // mis-match a card type. An UNCURATED word ("for each token you control") returns null → the card parks.
  // Placed AFTER the card-type arm so creature/artifact/land/enchantment keep their cardType wire byte-for-byte.
  if ((m = p.match(/^([a-z][a-z' -]*[a-z]) you control$/)) && COUNT_SUBTYPE[m[1]]) {
    return { kind: "permanentsYouControl", subtype: COUNT_SUBTYPE[m[1]] };
  }
  // COUNTERS ON A GROUP — "+1/+1 counters on lands you control" (Toph, the Blind Bandit). Only the +1/+1 kind
  // and only the card-type groups above, because layers.countSelfSpecOnBoard sums EXACTLY that; any other
  // counter kind or a qualified group has no evaluator → null → the card parks (safe FN).
  if ((m = p.match(/^\+1\/\+1 counters on (creatures?|artifacts?|lands?|enchantments?) you control$/))) {
    return { kind: "countersOnPermanentsYouControl", cardType: SELF_COUNT_CARDTYPE[m[1]], counterType: "+1/+1" };
  }
  // EQUIP-DYNAMIC-PT: "color(s) among permanents you control" — the count of DISTINCT WUBRG colors among the
  // controller's battlefield (Conqueror's Flail "+1/+1 for each color among permanents you control",
  // CR — a colorless permanent contributes no color). layers.countSelfSpecOnBoard evaluates the Set size.
  if (/^colors? among permanents you control$/.test(p)) return { kind: "colorsAmongPermanents" };
  // AURAS ATTACHED TO THIS CREATURE (Kor Spiritdancer, Graceblade Artisan). ⭐ THE EVALUATOR IS THE COUNT
  // TWIN OF A PREDICATE THAT ALREADY SHIPPED: layers.gateMet's `isEnchanted` gate has always asked "is any
  // Aura on any battlefield attached to perm.id"; countSelfSpecOnBoard's new arm asks the same question and
  // tallies instead of short-circuiting. So this reads live `attachedTo` back-pointer state the runtime
  // already maintains — exact, never inferred, and a creature wearing nothing counts the printed 0.
  // Self-referential, hence the layer-7c "for each" lane rather than a CDA: it ADDS to the printed body.
  // ⛔ "IT" ONLY — "attached to THIS CREATURE" is deliberately NOT accepted, and this is a MEASURED FALSE
  // POSITIVE, not caution. The evaluator counts against the AFFECTED permanent (which is what makes the
  // Equipment lane read the host correctly). In a self-buff the affected IS the source, so "it" is exact.
  // But a GROUP anthem names its source explicitly — Armament Master, "Other Kor creatures you control get
  // +2/+2 for each Equipment attached to THIS CREATURE" (the card name is normalized to "this creature"
  // upstream, so the phrase arrives looking self-referential). There the count source is the MASTER while
  // the buff lands on the OTHER Kor, and counting against the affected inverts the card exactly: measured
  // 2/2 where the Kor should read 6/6 (two Equipment on the Master), and 6/6 where it should read 2/2 (two
  // on the Kor itself). Both wrong, in both directions. Kellan, the Fae-Blooded is the same shape.
  // Costs nothing: every real carrier of the self lane prints "attached to it". Pinned both ways.
  if (/^aura attached to it$/.test(p)) return { kind: "aurasAttachedToSelf" };
  // The two siblings, admitted on the same evidence: `isEquipped` is the boolean twin of the Equipment count
  // exactly as `isEnchanted` is of the Aura count, so all three read the same live `attachedTo` back-pointer
  // the runtime maintains. The combined phrase is one scan with a wider type test, not two counts summed.
  if (/^equipment attached to it$/.test(p)) return { kind: "equipmentAttachedToSelf" };
  if (/^aura and equipment attached to it$/.test(p)) return { kind: "aurasAndEquipmentAttachedToSelf" };
  // ── ZONE COUNTS (hand / graveyard) — Empyrial Plate, Empyrial Armor, Wight of the Reliquary, Liliana's
  // Elite, Salvage Slasher, Glamdring.
  // ⭐ ADMITTED ON THE CDA VOCABULARY'S OWN EVIDENCE, WHICH IS A STRICTLY STRONGER BAR. parseCdaCountSource
  // documents its criterion as "admit only what an evaluator computes EXACTLY", and a CDA *sets* the base
  // P/T — a count that silently returned 0 there is a fabricated 0/0 on the battlefield. These sources
  // cleared THAT bar. A layer-7c self-buff only ADDS to the printed body, so anything safe for a CDA is
  // safe here a fortiori. This is not a new permission; it is two vocabularies that disagreed.
  // The counterpart half is at the eval site: the self-buff branch now calls countForSpec (the dispatcher
  // that owns the zone kinds) rather than countSelfSpecOnBoard (which never saw them). Vocabulary without
  // that call buys nothing, and that call without vocabulary buys nothing.
  // ⛔ ENUMERATED, NOT DELEGATED WHOLESALE. Sources with no exact evaluator in EITHER vocabulary still park:
  // "noncreature, nonland card in your graveyard", "card with cycling in your graveyard". Handing the whole
  // CDA parser through would credit whatever it grows next without anyone re-arguing it here.
  if ((m = p.match(/^(creature|land|artifact|enchantment|instant|sorcery|planeswalker) cards? in your graveyard$/))) return { kind: "cardsInGraveyard", cardType: m[1] };
  if (/^instant and sorcery cards? in your graveyard$/.test(p)) return { kind: "cardsInGraveyard", cardType: "instantOrSorcery" };
  if (/^card types? among cards in your graveyard$/.test(p)) return { kind: "cardTypesInGraveyard" };
  if ((m = p.match(/^(creature|land|artifact|enchantment|instant|sorcery|planeswalker) cards? in all graveyards$/))) return { kind: "cardsInAllGraveyards", cardType: m[1] };
  if (/^cards? in your hand$/.test(p)) return { kind: "cardsInHand" };
  if (/^cards? in all players' hands$/.test(p)) return { kind: "cardsInAllHands" };
  // ── MULTI-NEEDLE TYPE-LINE COUNTS — the same word-bounded scan the single-needle arm above has always
  // used, with an explicit join. Benalish Honor Guard ("for each LEGENDARY CREATURE you control") is named
  // in this function's own doc comment as a shape the lane was written for, and it has been parking all
  // along because one needle could not express a supertype qualifier. All That Glitters and Nettlecyst want
  // the OR form. Each permanent counts at most ONCE — a card that is both an artifact and an enchantment
  // contributes 1, which is what the printed card means.
  // ⛔ Deliberately narrow: only the supertype+cardtype AND-form and the artifact/enchantment OR-form. An
  // arbitrary qualifier ("nonlegendary", "tapped artifact") has no evaluator here and still parks.
  if ((m = p.match(/^legendary (creatures?|artifacts?|lands?|enchantments?) you control$/))) {
    return { kind: "permanentsYouControlMulti", allOf: ["Legendary", SELF_COUNT_CARDTYPE[m[1]]] };
  }
  if (/^artifacts? and\/or enchantments? you control$/.test(p)) {
    return { kind: "permanentsYouControlMulti", anyOf: ["Artifact", "Enchantment"] };
  }
  // ── COUNTERS ON THE PERMANENT ITSELF — "for each oil counter on it" (Necrosquito, Trawler Drake,
  // Exuberant Fuseling). A direct read of the live counters map, exact by construction.
  // NO COUNTER-KIND ALLOWLIST IS NEEDED, and that is a consequence of the whole-card law rather than an
  // omission: if the line that PLACES the counters is unmodeled, that line is residue and the card parks
  // regardless of this entry. A card only reaches the evaluator when every line models, placement included,
  // so a zero count means the permanent really has no counters. Verified on the real enter path —
  // Necrosquito lands with {oil: 2}, so its printed 0/0 body becomes the 2/2 the card describes.
  // ⛔ Named kinds only, and NOT the +1/+1 / -1/-1 kinds: those are already applied to P/T by
  // `counterPtDelta` at the top of the 7c pass, so reading them here would DOUBLE-count them.
  if ((m = p.match(/^([a-z][a-z' -]*[a-z]) counters? on it$/)) && !/^[+-]\d/.test(m[1])) {
    return { kind: "countersOnSelfSubject", counterType: m[1] };
  }
  // SUBTYPE on the battlefield (ALL controllers, no "you control") — "(other )?<Subtype> on the battlefield"
  // (Sliver Legion "for each other Sliver on the battlefield"). "other" → excludeSelf (each counter excludes
  // itself). A LIVE board count (never zero-by-default) — so it's non-hollow, unlike a "counter on this
  // permanent" source whose counter-placement may be unmodeled. "creature on the battlefield" counts every
  // creature (the \b match on "Creature" in the type line); a real creature subtype counts that tribe.
  if ((m = p.match(/^(other )?([a-z][a-z]+) on the battlefield$/))) {
    return { kind: "subtypeOnBattlefield", subtype: m[2].charAt(0).toUpperCase() + m[2].slice(1), excludeSelf: !!m[1] };
  }
  return null;
}

// CDA COUNT VOCABULARY (BLITZ CDP-1) — the count sources a characteristic-defining self-P/T may read. This is
// a CURATED, EXACT-EVALUATOR-ONLY allowlist, DELIBERATELY DISTINCT from parseSelfCountSource (the layer-7c
// "for each" self-buff vocabulary): a CDA SETS the base, so an over-count is a wrong printed P/T on the
// battlefield — the CREED forbids it. Every branch here maps to an evaluator layers.countForSpec computes
// EXACTLY (metric⇄runtime lockstep), so a phrase with no exact evaluator returns null → NO descriptor → the
// card parks (Arbiter; a false-negative is safe). NOT admitted (each parks): the plural "…on the battlefield"
// subtype sources (countSelfSpecOnBoard would test a PLURAL needle "Clerics"/"Zombies" against a SINGULAR
// type line → count 0 → a fabricated 0/0, forbidden), and any qualified / opponent / mana-symbol count
// (Adamaro's "opponent with the most cards", Umbra Stalker's "black mana symbols") — no exact evaluator, so
// they stay body-only.
//
// ⭐ "+1/+1 counters on <group> you control" (Toph, the Blind Bandit) WAS in that excluded list, for exactly
// the stated reason — "no exact evaluator". One now exists (countSelfSpecOnBoard's countersOnPermanentsYouControl
// branch, written FIRST), so the reason no longer applies and the source is admitted below. The rule this
// allowlist encodes is unchanged and is what made the order matter: admit only what an evaluator computes
// exactly, because a CDA SETS the base P/T and a count that silently returned 0 is a fabricated 0/0.
function parseCdaCountSource(phrase) {
  const p = phrase.toLowerCase().trim().replace(/\.\s*$/, "");
  let m;
  // BOARD — "<card type>s you control" / "<basic land>s you control" (plural handled via the count tables so
  // "creatures"→Creature; countForSpec → countSelfSpecOnBoard's word-bounded type-line scan, exact).
  if ((m = p.match(/^(creatures?|artifacts?|lands?|enchantments?) you control$/))) return { kind: "permanentsYouControl", cardType: SELF_COUNT_CARDTYPE[m[1]] };
  if ((m = p.match(/^(plains|islands?|swamps?|mountains?|forests?) you control$/))) return { kind: "permanentsYouControl", subtype: SELF_COUNT_BASIC[m[1]] };
  // COUNTERS ON A GROUP — admitted only because countSelfSpecOnBoard sums it EXACTLY (see the note above).
  if ((m = p.match(/^\+1\/\+1 counters on (creatures?|artifacts?|lands?|enchantments?) you control$/))) {
    return { kind: "countersOnPermanentsYouControl", cardType: SELF_COUNT_CARDTYPE[m[1]], counterType: "+1/+1" };
  }
  // BOARD — distinct WUBRG colors among the controller's permanents (Opulent Clomper; countSelfSpecOnBoard
  // evaluates the Set size — exact, devoid-safe via colorsOf).
  if (/^colors? among permanents you control$/.test(p)) return { kind: "colorsAmongPermanents" };
  // ZONE — cards in hand (Maro / Psychosis Crawler — "cards in your hand"; Multani, Maro-Sorcerer — "cards in
  // all players' hands"). Live zone-length read; the CDA permanent is on the battlefield, so its own card is
  // never in the counted hand (no self-inclusion issue).
  if (/^cards in your hand$/.test(p)) return { kind: "cardsInHand" };
  if (/^cards in all players' hands$/.test(p)) return { kind: "cardsInAllHands" };
  // GRAVEYARD (your) — typed count (Revenant/Boneyard Wurm — creature cards; Uurg — land cards; Haughty Djinn/
  // Enigma Drake — instant and sorcery cards) or distinct DELIRIUM card-types (Nethergoyf/Ooze). countForSpec
  // → countGraveyardSpec, the SAME exact evaluator the graveyard-count GATES already use.
  if ((m = p.match(/^(creature|land|artifact|enchantment|instant|sorcery|planeswalker) cards? in your graveyard$/))) return { kind: "cardsInGraveyard", cardType: m[1] };
  if (/^instant and sorcery cards in your graveyard$/.test(p)) return { kind: "cardsInGraveyard", cardType: "instantOrSorcery" };
  if (/^card types among cards in your graveyard$/.test(p)) return { kind: "cardTypesInGraveyard" };
  // GRAVEYARD (all players) — the Lhurgoyf/Tarmogoyf family: typed count in ALL graveyards (Lhurgoyf/Mortivore
  // — creature cards; Cognivore — instant; Magnivore — sorcery; Slag Fiend — artifact; Cantivore — enchantment)
  // or distinct card-types in ALL graveyards (Tarmogoyf/Polygoyf). countForSpec → countGraveyardSpec's
  // all-graveyards path (every player's graveyard).
  if ((m = p.match(/^(creature|land|artifact|enchantment|instant|sorcery|planeswalker) cards? in all graveyards$/))) return { kind: "cardsInAllGraveyards", cardType: m[1] };
  if (/^instant and sorcery cards in all graveyards$/.test(p)) return { kind: "cardsInAllGraveyards", cardType: "instantOrSorcery" };
  if (/^card types among cards in all graveyards$/.test(p)) return { kind: "cardTypesInAllGraveyards" };
  return null;
}

/**
 * GROUP-GRANT — parse the QUOTED text of a granted ability into a serializable, FIXED-amount mana spec
 * `{ colors, amount }`, or null. The modeled subset MIRRORS manaModel.parseAddClause's fixed (non-variable)
 * branches EXACTLY so a granted ability taps for the same thing a printed one would (CREED #17 — the granted
 * ability must itself be fully modeled). Requires a `{T}:` (tap) cost and an `Add …` effect:
 *   "{T}: Add one mana of any color."        → { colors:["W","U","B","R","G"], amount:1 }   (Gemhide/Manaweft)
 *   "{T}: Add N mana of any one color."      → { colors:[5 colors], amount:N }
 *   "{T}: Add {G}." / "{T}: Add {W} or {U}." → fixed pips ("or" = a choice ⇒ amount 1)
 * DELIBERATELY EXCLUDED (→ null → grant stays non-native, a safe FN): any VARIABLE/X amount ("Add X mana …",
 * "for each"/"equal to" — those resolve against the GRANTER's board, wrong scope for a recipient), a
 * sacrifice-for-mana cost, or any non-mana / triggered / activated-non-mana quoted ability. The recipient is
 * a real permanent that taps the granted ability, so a {T} cost is correct; a non-{T} mana grant is rare and
 * left unmodeled. Pure; no engine import (manaModel reads this spec, not vice-versa, so no cycle).
 */
function parseGrantedManaSpec(quoted) {
  const q = String(quoted || "");
  // Must be a "<cost>: Add … " ability — left-of-colon cost, right-of-colon "Add" effect.
  const ci = q.indexOf(":");
  if (ci === -1) return null;
  const cost = q.slice(0, ci);
  const effect = q.slice(ci + 1);
  // The cost must reduce to EXACTLY a {T} tap and/or a SELF-SACRIFICE — nothing else. Two modeled shapes:
  //   (a) "{T}" — a repeatable tap source (Gemhide/Manaweft "{T}: Add one mana of any color").
  //   (b) "{T}, Sacrifice this artifact/token/permanent" — a ONE-SHOT sac source (Goldspan's granted
  //       Treasure ability "{T}, Sacrifice this artifact: Add two mana of any one color"). The self-sac binds
  //       to the RECIPIENT (the Treasure it's granted to), so the runtime cracks the Treasure on use — the
  //       same tap+sac the Treasure's OWN ability has. `sacrifices:true` is flagged so manaModel/legalChoices
  //       sacrifice it (never a phantom repeatable source). A bare "Sacrifice this …: Add …" (Gold, no {T}) is
  //       ALSO accepted (tap-less one-shot sac). Any OTHER rider cost ("{T}, Pay 1 life", a mana pip, a
  //       "Sacrifice ANOTHER …") stays UNmodeled — dropping it would grant cheaper/free mana (a CREED FP).
  const selfSacRe = /\bsacrifice this (?:artifact|token|permanent)\b/i;
  const sacrifices = selfSacRe.test(cost);
  const bareCost = cost
    .replace(/\{t\}/ig, "")
    .replace(selfSacRe, "")
    .replace(/[\s,.]/g, "");
  if (bareCost !== "") return null;                           // any extra cost (life/sac-other/pips) → reject
  // At least one real cost token must remain: a {T} tap OR a self-sacrifice (an empty cost is not a mana
  // ability we model here — every printed granted source in the corpus taps and/or self-sacs).
  if (!/\{t\}/i.test(cost) && !sacrifices) return null;
  if (!/\badd\b/i.test(effect)) return null;                  // must be a mana ("Add …") ability
  if (/\bx\b/i.test(effect) || /\bfor each\b|\bequal to\b/i.test(effect)) return null; // VARIABLE → wrong scope
  // A SPENDING RESTRICTION on the produced mana ("Spend this mana only to cast …" — Clement/Charitable
  // Drafter; "This mana can't be spent to cast …" — Battery Bearer) is NOT modeled (the mana pool is
  // unrestricted), so dropping it would grant unrestricted mana the card actually restricts (a CREED FP).
  // Reject the whole grant — the recipient keeps no fabricated all-purpose mana.
  if (/\bspend this mana\b|\bthis mana can'?t be spent\b|\bcan'?t be spent\b|\bonly to (?:cast|pay|activate)\b/i.test(effect)) return null;
  // `sac` rides onto every returned spec so a self-sacrifice granted source is cracked (never a phantom
  // repeatable). An omitted/false flag leaves the spec identical to the pre-existing tap-only shape.
  const sac = sacrifices ? { sacrifices: true } : {};
  // "Add N mana of any one color" — N spelled or digit; "Add … mana of any color" — amount 1.
  let mm = effect.match(/\badd\s+(one|two|three|four|five|\d+)\s+mana of any one color\b/i);
  if (mm) {
    const amount = _ENTER_NUM[mm[1].toLowerCase()] ?? parseInt(mm[1], 10);
    if (Number.isFinite(amount) && amount > 0) return { colors: ["W", "U", "B", "R", "G"], amount, ...sac };
    return null;
  }
  if (/\badd\b[^.]*\bmana of any( one)? color\b/i.test(effect)) {
    return { colors: ["W", "U", "B", "R", "G"], amount: 1, ...sac };
  }
  // Fixed pips: "Add {G}" / "Add {C}{C}" (concat = sum) / "Add {W} or {U}" ("or" = choice, amount 1).
  const symbols = [...effect.matchAll(/\{([WUBRGC])\}/gi)].map((x) => x[1].toUpperCase());
  if (symbols.length === 0) return null;
  const unique = [...new Set(symbols)];
  if (/\bor\b/i.test(effect)) return { colors: unique, amount: 1, ...sac };
  return { colors: unique, amount: symbols.length, ...sac };
}

/**
 * GATED-SELFBUFF — parse the "you control <quant> <type>" gate of an "as long as you control …" self static
 * into { countSpec, atLeast, excludeSelf } | null. quant ∈ a|an|another|two/three or more|N or more. The type
 * must be a SINGLE bare word — a card type, a basic-land subtype, or a creature subtype (matched word-bounded
 * on the type line by layers.countSelfSpecOnBoard). A color / compound / qualified phrase ("a blue creature",
 * "no untapped lands", "another multicolored permanent") contains a space → null → the clause stays LOW
 * (Arbiter). A bare word that isn't a real type counts 0 permanents → the gate never opens → the buff never
 * applies (false-negative, SAFE — never a fabricated buff). "another" excludes the source (CR — "another").
 */
function parseControlGateSource(quant, typePhrase) {
  let t = String(typePhrase).toLowerCase().trim().replace(/\.$/, "");
  // PLANESWALKER-TYPE gate (BLITZ CA-2 — "you control a Liliana planeswalker": Arisen Gorgon / Charging
  // War Boar / Moon-Eating Dog): the ONE admitted two-word phrase. The planeswalker TYPE is a word-bounded
  // type-line token ("Legendary Planeswalker — Liliana") carried only by that planeswalker, so the subtype
  // scan is exact. A qualifier word that is NOT a planeswalker type (a color / supertype / "historic")
  // would make the gate unopenable → fail closed (CREED — a never-opening gate is a mis-model, not a FN).
  const pw = t.match(/^([a-z]+) planeswalkers?$/);
  if (pw) {
    if (/^(?:white|blue|black|red|green|colorless|multicolored|monocolored|colored|legendary|basic|snow|world|historic|nontoken|token|tapped|untapped|another|other)$/.test(pw[1])) return null;
    t = pw[1];
  }
  if (!t || /\s/.test(t)) return null; // compound / color-qualified / negated → LOW
  let atLeast = 1, excludeSelf = false;
  if (quant === "another") excludeSelf = true;
  else if (quant === "two or more") atLeast = 2;
  else if (quant === "three or more") atLeast = 3;
  else {
    // WORD-NUMBER quants (BLITZ CA-1 — Jetmir "six/nine or more creatures", Fecund Greenshell "ten or more
    // lands"): the group-anthem gate regex admits any "<word> or more", so an unrecognized number word must
    // FAIL CLOSED (null → no gate → body-only), never silently degrade to atLeast 1 (an over-open gate = FP).
    const mm = quant.match(/^(\w+) or more$/);
    if (mm) {
      const n = /^\d+$/.test(mm[1]) ? parseInt(mm[1], 10) : GY_NUMWORD[mm[1]];
      if (!Number.isInteger(n) || n < 1) return null;
      atLeast = n;
    } else if (quant !== "a" && quant !== "an") return null; // unknown quant → fail closed
  }
  if (SELF_COUNT_CARDTYPE[t]) return { countSpec: { kind: "permanentsYouControl", cardType: SELF_COUNT_CARDTYPE[t] }, atLeast, excludeSelf };
  if (SELF_COUNT_BASIC[t]) return { countSpec: { kind: "permanentsYouControl", subtype: SELF_COUNT_BASIC[t] }, atLeast, excludeSelf };
  // A SUPERTYPE token (legendary/basic/snow/world) would word-bound-match unrelated type lines and OVER-count
  // the gate; "permanent"/"spell"/"token" aren't type-line subtypes at all → reject → LOW → Arbiter (never a
  // fabricated gate). Real subtypes (Equipment, Vehicle, Saga, creature types) fall through to the fallback.
  if (/^(?:legendary|basic|snow|world|ongoing|permanents?|spells?|tokens?)$/.test(t)) return null;
  const sub = t.charAt(0).toUpperCase() + t.slice(1).replace(/s$/, ""); // bare creature-subtype word → Capitalized
  return { countSpec: { kind: "permanentsYouControl", subtype: sub }, atLeast, excludeSelf };
}

// FIRST-WORD self-ref stopwords (mirror of triggers.FIRST_WORD_SELF_STOPWORDS) — a leading article/conjunction
// is never a legend's self-reference first word ("The Ur-Dragon" → self-ref is the full name), so it must not be
// rewritten to "this creature" and over-match unrelated text.
const FIRST_WORD_SELF_STOPWORDS_STATIC = new Set(["the", "a", "an", "of", "and"]);

/**
 * Replace the card's OWN name with "this creature" so a name-based self-reference ("Nim Lasher gets +1/+0
 * …", common on older cards) reads the same as modern "This creature gets …" templating. Word-bounded on
 * the FULL name (never a partial), so it can't touch an unrelated card's name in the text.
 *
 * SHORT-NAME / FIRST-WORD self-ref (CR 201.4) — a LEGENDARY card refers to itself by the part of its name
 * before the first comma ("Molimo" for "Molimo, Maro-Sorcerer") or, when its name has no comma but does have
 * a space, by its first word ("Braulios" for "Braulios of Pheres Band"). The full-name rewrite alone misses
 * those, so a self-static templated with the short/first-word form (the standard for legends — every CDA-self
 * creature is templated this way) stays UNNORMALIZED → unrecognized → body-only. Apply the SAME guards the
 * trigger path uses (triggers.classifyCondition): legendary-only; short name ≥ 3 chars; first word ≥ 4 chars
 * and not a leading stopword. Word-bounded + longest-first (full name before short before first word), so it
 * only ever rewrites the literal self-name (never a substring of another word). Conservative by design — a
 * non-legendary card, or a too-short name, is left to the full-name rewrite only (a safe false-negative).
 *
 * TRIBE-WORD GUARD (CREED, CLAUDE.md §1.2): a candidate short/first-word form that is ALSO the card's own
 * creature SUBTYPE is a TRIBE reference, NOT a self-reference — "Sliver Legion" ("All Sliver creatures get
 * +1/+1 …") and "Sliver Hivelord" ("Sliver creatures you control have indestructible") use "Sliver" as the
 * tribe, so rewriting it to "this creature" would SHRED the anthem ("All this creature creatures …") and DROP
 * those tribal lords from native (a regression the full corpus flip-diff caught). Skip any candidate form
 * that appears as a subtype on the card's own type line; the full name is always still rewritten.
 */
// Exported (census slice 21) so coverage.permanentFullyCovered can normalize its residue EXACTLY the way
// staticAbilitiesCoverCard does. The composite tier was passing RAW clauses to clauseProducesStatic, whose
// CDA anchor is "^this creature's power and toughness …" — so a legacy printing that names itself
// ("Mortivore's power and toughness …", CR 201.4) read as unmodeled residue in the composite while the
// single-mechanism static tier credited it fine. Two paths, one grammar: they must normalize identically.
export function selfNormalizeOracle(oracle, name, type) {
  // Strip parenthetical reminder text (CR 207.2 — reminder text is never functional) so a fully-modeled
  // static isn't judged "uncovered" by its own reminder ("Sliver creatures you control have double strike.
  // (They deal both first-strike and regular combat damage.)"). Removing it changes NO behavior — the
  // runtime parser already ignores it (it matches at clause starts) — it only lets the coverage check
  // (staticAbilitiesCoverCard) see that the card's real text is fully modeled. Scoped to static parsing.
  let o = stripFlashPermissionLine(String(oracle || "")).replace(/\([^)]*\)/g, " ");
  // SELF-FLASH PERMISSION dropped on the way in, from the SAME regex the spell path and the residue walk use.
  // This is the permanent side's chokepoint: parseGroupBlockRestriction, parseStaticAbilities and
  // staticAbilitiesCoverCard all normalize through here, and the line parked six Auras plus Parapet by
  // sitting in front of an otherwise fully-modeled body. It contributes no static ability, so removing it
  // changes nothing the runtime reads - see FLASH_PERMISSION_LINE in textNormalize.js for the board-verified
  // reason it is vacuous (the engine only ever offers these at sorcery speed).
  if (!name) return o;
  // Candidate self-name forms, longest first so the full name is consumed before any short prefix.
  const forms = [name];
  const isLegendary = /legendary/i.test(String(type || ""));
  if (isLegendary) {
    // The card's OWN creature subtypes (right of the em-dash), lowercased — a candidate form matching one of
    // these is a tribe word, never a self-reference (TRIBE-WORD GUARD above).
    const tl = String(type || "");
    const dash = tl.indexOf("—");
    const ownSubtypes = new Set(dash === -1 ? [] : tl.slice(dash + 1).trim().toLowerCase().split(/\s+/).filter(Boolean));
    const short = name.split(",")[0].trim();
    if (short.length >= 3 && short !== name && !ownSubtypes.has(short.toLowerCase())) forms.push(short);
    // First-word form only when the name has NO comma but DOES have a space (the "<First> the <Epithet>" /
    // "<First> of <Place>" style) — gated ≥4 chars + stopword guard + tribe-word guard, matching the trigger path.
    if (!name.includes(",") && /\s/.test(name)) {
      const firstWord = name.split(/\s+/)[0];
      if (firstWord.length >= 4 && firstWord !== name
          && !FIRST_WORD_SELF_STOPWORDS_STATIC.has(firstWord.toLowerCase())
          && !ownSubtypes.has(firstWord.toLowerCase())) {
        forms.push(firstWord);
      }
    }
  }
  forms.sort((a, b) => b.length - a.length);
  for (const f of forms) {
    o = o.replace(new RegExp(`\\b${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), "this creature");
  }
  return o;
}

const _ENTER_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
/**
 * TRUNK-ENTERSCOUNTERS (CR 614.1c + 122.6a; static per 603.6d) — the FIXED number of +1/+1 counters a permanent "enters with N +1/+1
 * counters on it", or 0. ONLY the bare, unconditional, literal-N form: a kicker / "for each" / "where X" /
 * conditional ("if …") variant returns 0 (the variable/gated magnitude isn't modeled → the permanent enters
 * as its printed body and the card stays body-only → Arbiter; never a fabricated counter count). The SINGLE
 * source of truth: the resolver adds exactly this many on enter, and the coverage classifier credits exactly
 * these cards — so the metric can never over-claim a card the engine plays wrong. Leaf (no engine import).
 */
export function entersWithPlusCounters(card) {
  // ⭐ GRAFT N (CR 702.57a) — the count lives ONLY in the KEYWORD, never in a rules sentence: "Graft 2 (This
  // creature enters with two +1/+1 counters on it. Whenever another creature enters, you may move…)". The
  // reminder strip on the very next line removes that sentence, so the generic matcher below can never see
  // it and every graft creature read 0.
  // ⛔ THAT ZERO IS NOT A HARMLESS MISS — every graft carrier is printed 0/0, so its whole body IS these
  // counters. Reading 0 puts a 0/0 on the battlefield that dies to the SBA immediately, which is a wrong
  // board state rather than a missed option. Same hazard the Phyrexian oil 0/0s had, and it is driven on a
  // real enter path in graft.test.js rather than assumed.
  // Digit- or word-anchored on the keyword itself, so graft-REFERENCING prose can never supply a count.
  const graft = String(card?.oracle || card?.oracle_text || "").match(/^graft (a|an|one|two|three|four|five|six|\d+)\b/im);
  if (graft) return _ENTER_NUM[graft[1].toLowerCase()] ?? (parseInt(graft[1], 10) || 0);
  const oracle = String(card?.oracle || card?.oracle_text || "").replace(/\([^)]*\)/g, " ");
  for (const sentence of oracle.split(/(?<=\.)\s+|\n+/)) {
    const m = sentence.match(/enters (?:the battlefield )?with (a|an|one|two|three|four|five|\d+) \+1\/\+1 counters? on it/i);
    if (!m) continue;
    if (/\b(?:if|for each|where|kicked|unless|equal to|plus)\b/i.test(sentence)) return 0; // conditional/variable → not modeled
    return _ENTER_NUM[m[1].toLowerCase()] ?? (parseInt(m[1], 10) || 0);
  }
  return 0;
}

/**
 * ⭐ The SELF-SCOPED maximum-hand-size lines this engine models — the SINGLE source of truth, shared by the
 * parser arm that emits the op and by gameEngine.cleanupDiscardExcess, which must know whether a permanent's
 * hand-size text is one it can READ before deciding to suspend enforcement. Two copies of this pattern would
 * drift, and a drift here means either a silently-unapplied maximum or a wrongly-suspended cleanup.
 */
export const MODELLED_MAX_HAND_RE = /^your maximum hand size is (?:(increased|reduced) by )?(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)$/;

/**
 * ⭐ ENTERS-WITH −1/−1 COUNTERS (CR 614.1c) — the exact SIGN-FLIPPED twin of entersWithPlusCounters above.
 * Shrewd Hatchling, Noxious Hatchling, Bloodied Ghost, Carnifex Demon, Grim Poppet, Wickerbough Elder and
 * ~30 more.
 *
 * ⭐ FOUND BY SPLITTING THE SHAPE BY TIER, and the split could not be starker: "enters with N +1/+1
 * counters" is native on **28** carriers; "enters with N −1/−1 counters" was native on **ZERO**, with 35
 * parked. The SIGN was the entire difference.
 *
 * ⓘ PURE IGNITION — the runtime was already finished. ptPrimitive.counterPtDelta reads `counters["-1/-1"]`
 * and SUBTRACTS it, so the layer engine has always priced these correctly; the resolver already writes
 * arbitrary counter kinds at ETB. Only this parse step was missing, so every carrier parked on a line the
 * engine could already have honoured.
 *
 * ⛔ The same conditional/variable guard as the plus twin, for the same reason: "for each", "if", "unless",
 * "where X" and kicker forms (Canker Abomination — "for each creature that opponent controls"; Patched
 * Plaything — "if you cast it from your hand") are a VARIABLE count this doesn't model, and guessing one
 * would put the wrong body on the battlefield. Those park.
 * ⛔ Returns a POSITIVE magnitude — the caller adds it as "-1/-1" counters. Keeping the sign in the counter
 * KIND rather than in the number means a caller can never accidentally add negative counters.
 */
export function entersWithMinusCounters(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "").replace(/\([^)]*\)/g, " ");
  for (const sentence of oracle.split(/(?<=\.)\s+|\n+/)) {
    const m = sentence.match(/enters (?:the battlefield )?with (a|an|one|two|three|four|five|six|seven|\d+) -1\/-1 counters? on it/i);
    if (!m) continue;
    if (/\b(?:if|for each|where|kicked|unless|equal to|plus)\b/i.test(sentence)) return 0; // conditional/variable → not modeled
    return _ENTER_NUM[m[1].toLowerCase()] ?? (parseInt(m[1], 10) || 0);
  }
  return 0;
}

// ENTERS-WITH-NAMED-COUNTERS (CR 614.1c + 122.6a) — the FIXED number of a NAMED (non-P/T) counter a permanent
// "enters with N <name> counters on it", or null. The generic sibling of entersWithPlusCounters, for a
// card-specific counter kind (slumber — Arixmethes; charge — the Trigons; oil / shield / stun — BLITZ EW-1;
// the fading/vanishing fade/time counters have their own keyword-driven path in fading.js and are EXCLUDED
// here to avoid a double-add). ONLY the bare, unconditional, literal-N form: a kicker / "for each" /
// "where X" / conditional variant → null (the variable/gated count isn't modeled → left to the Arbiter,
// never a fabricated count). WHOLE-SENTENCE ANCHORED (BLITZ EW-1, fail-closed): the trimmed sentence must
// END at "counters on it/him/her" — a trailing rider ("… on it and can't block") would otherwise be
// silently dropped by the coverage strip (a forbidden FP), so the anchor rejects it and the card parks.
// The counter NAME must be a single bare word (not a ±1/+1 P/T form, not loyalty — loyalty enters via the
// PW starting-loyalty write). Returns { type, n } | null. Leaf (no engine import). The resolver adds
// exactly this at ETB; the coverage strip credits exactly this — the SINGLE source of truth.
const _RESERVED_ENTER_COUNTER_KINDS = new Set(["fade", "time", "loyalty"]);
export function entersWithNamedCounters(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "").replace(/\([^)]*\)/g, " ");
  for (const sentence of oracle.split(/(?<=\.)\s+|\n+/)) {
    // "enters [the battlefield ][tapped ]with N <name> counters on it" — Arixmethes' printed text combines the
    // tapped clause and the counter clause in one sentence ("enters tapped with five slumber counters on it"),
    // so tolerate an optional "tapped" between "enters" and "with" (the enters-tapped seam handles the tapped
    // status separately; the coverage tapRe strip removes the tapped mention from the classifier residue).
    // "on him/her" — a named legend's pronoun (Captain America "…a shield counter on him") is the same clause.
    const m = sentence.trim().match(/^[^.]*?\benters (?:the battlefield )?(?:tapped )?with (a|an|one|two|three|four|five|\d+) ([a-z]+) counters? on (?:it|him|her)\.?$/i);
    if (!m) continue;
    const kind = m[2].toLowerCase();
    if (_RESERVED_ENTER_COUNTER_KINDS.has(kind)) return null; // owned by another path (fading/PW) → not this seam
    if (/\b(?:if|for each|where|kicked|unless|equal to|plus)\b/i.test(sentence)) return null; // conditional/variable → not modeled
    const n = _ENTER_NUM[m[1].toLowerCase()] ?? (parseInt(m[1], 10) || 0);
    return n > 0 ? { type: kind, n } : null;
  }
  return null;
}

// ─── ENTER-COUNTER KIND HONESTY (BLITZ EW-1) — which named counter kinds may the COVERAGE strip credit? ────
// The resolver places ANY single-word named counter (honest state either way), but the TIER claim ("this card
// plays correctly natively") additionally requires the counter's SEMANTICS to be honored by the runtime:
//   • INERT kinds (CR 122.1 — "a counter … interacts with a rule, ability, or effect": these interact with
//     NOTHING intrinsically; only printed readers consume them, and an unmodeled reader clause is residue that
//     parks the card under the whole-card law anyway). The audited, census-measured vocabulary — charge (the
//     Trigons/Shriekhorn), oil (Phyrexia: All Will Be One), javelin (Icatian Javelineers), brick (Sunset
//     Pyramid), shell (Roc Hatchling), wish (Ring of Three Wishes), and the long single-card tail.
//   • MODELED-SEMANTICS kinds — shield (CR 122.1c: the destroy-replacement + damage-prevention pair, enforced
//     at gameState.hasShieldCounter/consumeShieldCounter by the destroy SBA, applyDestroyEffect,
//     applyDamageEffect and combatResolution) and stun (CR 122.1d: the untap replacement, enforced at
//     gameState.untapOrConsumeStun + the untap-step filter).
//   • ENFORCED KEYWORD counters (CR 122.1b: a keyword counter grants its keyword; 613.1f) — ONLY the 122.1b
//     legal kinds whose runtime enforcement is COMPLETE and layer-aware via permanentHasKeyword's counter read
//     (layers.js — printed ∪ counter ∪ layer-6 grants). Excluded from 122.1b's list: "decayed" (its can't-block
//     + attack-sacrifice machinery is unmodeled) and "exalted" (the fire site counts instances via
//     keywordInstanceCount, which reads printed + grants but NOT counters — an exalted counter would never fire).
// Everything else — fade/time/loyalty (reserved paths), finality (dies→exile replacement unmodeled), level/
// lore/defense (leveler/Saga/battle machinery), and any unlisted kind — fails CLOSED → no coverage credit
// (the card parks; a shield that doesn't shield or a finality counter that doesn't exile is a forbidden FP).
const _INERT_ENTER_COUNTER_KINDS = new Set([
  "charge", "oil", "javelin", "brick", "shell", "wish", "healing", "tide", "omen", "net", "ice",
  "page", "hour", "task", "dream", "soul", "credit", "ore", "arrowhead", "sleight", "polyp", "growth",
  "doom", "eyestalk", "cage", "reprieve", "film", "intervention", "resonance", "stroopwafel",
]);
// CR 122.1b legal keyword-counter kinds ∩ runtime-enforced (see keywords.js GRANTABLE_STATIC_KEYWORDS +
// permanentHasKeyword). Two-word kinds ("first strike", "double strike") are reachable only via the CHOICE
// parser below (the single-word named regex can't match them) but are listed here so both seams share ONE set.
// EXPORTED 2026-07-30 so the counter-PLACEMENT parser (effects/atoms/counters.js) gates on the SAME set
// the grant reads. A duplicated list would drift, and the failure mode is silent: a counter placed for a
// keyword nobody enforces looks correct on the board and does nothing.
export const ENFORCED_KEYWORD_COUNTER_KINDS = new Set([
  "flying", "first strike", "double strike", "deathtouch", "haste", "hexproof", "indestructible",
  "lifelink", "menace", "reach", "shadow", "trample", "vigilance",
]);
export function isHonestEnterCounterKind(kind) {
  const k = String(kind || "").toLowerCase();
  return _INERT_ENTER_COUNTER_KINDS.has(k) || k === "shield" || k === "stun" || ENFORCED_KEYWORD_COUNTER_KINDS.has(k);
}

/**
 * ENTERS-WITH-CONDITIONAL-COUNTERS (BLITZ EW-1; CR 614.1c + 122.6a) — "~ enters with N +1/+1 counters on it
 * if <condition>." — the Morbid (Gravetiller Wurm — "if a creature died this turn"), Raid (War-Name Aspirant —
 * "if you attacked this turn"), opponent-lost-life (Cindering Cutthroat) and Ferocious (Frontier Mastodon —
 * "if you control a creature with power 4 or greater") family. Returns { n, condition } | null with the RAW
 * condition text; the resolver evaluates it via evaluateInterveningIf against the PRE-entry state (CR 614.1c —
 * the replacement's condition is checked as the permanent enters; the entering creature is not yet on the
 * battlefield, so it never satisfies its own condition — the Ferocious ruling), and the coverage strip credits
 * ONLY when interveningIf.spellConditionParseable confirms the condition is in the modeled vocabulary — the
 * metric⇄runtime shared gate (an unreadable condition → evaluateInterveningIf null → NO counters, FN-safe, and
 * NO credit → Arbiter). WHOLE-SENTENCE ANCHORED (fail-closed): an ability-word prefix ("Morbid — ") is
 * tolerated inside the [^.]*? subject slop; a leading-if form (Adamant — "If at least three white mana was
 * spent…, this creature enters with…"), a kicked form ("If this creature was kicked, it enters with…" — owned
 * by kicker.js; no trailing "if"), or any trailing rider fails the anchor → null → park. Leaf (no engine import).
 */
export function entersWithConditionalCounters(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "").replace(/\([^)]*\)/g, " ");
  // KW-BLOODTHIRST (CR 702.54, 2026-07-25) — the keyword IS this exact shape, but its text lives entirely
  // in reminder parens ("Bloodthirst N (If an opponent was dealt damage this turn, this creature enters
  // with N +1/+1 counters on it.)"), which the strip above removes before the sentence matcher ever runs.
  // Synthesizing the {n, condition} pair here — rather than in a separate lane — means the EXISTING
  // machinery on both sides picks it up unchanged: coverage's condEnterCtr gate credits it, and
  // resolvers.js's condCtr applies the counters at enter time. The condition string is the one
  // interveningIf.js now reads off the damage-only ledger.
  for (const line of oracle.split("\n")) {
    const bt = line.trim().match(/^bloodthirst (\d+)$/i);
    if (bt) return { n: parseInt(bt[1], 10), condition: "an opponent was dealt damage this turn" };
  }
  for (const sentence of oracle.split(/(?<=\.)\s+|\n+/)) {
    const m = sentence.trim().match(/^[^.]*?\benters with (a|an|one|two|three|four|five|\d+) \+1\/\+1 counters? on (?:it|him|her) if ([^.]+?)\.?$/i);
    if (!m) continue;
    const n = _ENTER_NUM[m[1].toLowerCase()] ?? (parseInt(m[1], 10) || 0);
    return n > 0 ? { n, condition: m[2].trim() } : null;
  }
  return null;
}

/**
 * ENTERS-WITH-CHOICE-COUNTERS (BLITZ EW-1; CR 614.1c + 122.1b + 122.6a) — the Ikoria keyword-counter choice:
 *   "~ enters with your choice of a <kw> counter or a <kw> counter on it."          (pick 1 of 2 — Boot Nipper)
 *   "~ enters with your choice of two different counters on it from among <a>, <b>, and <c>."  (pick 2 of 3 — Grimdancer)
 * Returns { pick, options } | null — options in PRINTED order. EVERY option must be an ENFORCED keyword-counter
 * kind (ENFORCED_KEYWORD_COUNTER_KINDS — the CR 122.1b legal list ∩ what permanentHasKeyword's counter read
 * actually honors); ONE unenforced option means the auto-pick could owe a keyword the runtime ignores, so the
 * WHOLE clause fails closed → null → park (CREED). A "+1/+1" option (Denry Klin's three-way comma form) or a
 * quoted-grant wrapper (Champions of Tyr) fails the anchors → null. WHOLE-SENTENCE ANCHORED. Leaf (no engine
 * import): the resolver auto-picks (first `pick` options in printed order — a deterministic, documented house
 * policy like riotPicksHaste) and places via applyCounterDoubling; the coverage strip credits the same shape.
 */
export function entersWithChoiceCounters(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "").replace(/\([^)]*\)/g, " ");
  for (const sentence of oracle.split(/(?<=\.)\s+|\n+/)) {
    const s = sentence.trim();
    let m = s.match(/^[^.]*?\benters with your choice of an? ([a-z][a-z ]*?) counter or an? ([a-z][a-z ]*?) counter on it\.?$/i);
    if (m) {
      const options = [m[1].toLowerCase(), m[2].toLowerCase()];
      return options.every((k) => ENFORCED_KEYWORD_COUNTER_KINDS.has(k)) ? { pick: 1, options } : null;
    }
    m = s.match(/^[^.]*?\benters with your choice of two different counters on it from among ([a-z][a-z ]*?), ([a-z][a-z ]*?), and ([a-z][a-z ]*?)\.?$/i);
    if (m) {
      const options = [m[1].toLowerCase(), m[2].toLowerCase(), m[3].toLowerCase()];
      return options.every((k) => ENFORCED_KEYWORD_COUNTER_KINDS.has(k)) ? { pick: 2, options } : null;
    }
  }
  return null;
}

/**
 * ENTERS-WITH-X (CR 122.1 + the {X} chosen at cast) — does this permanent "enter with X +1/+1 counters on
 * it", where X is the value paid for its {X} mana cost? True for the bare literal-"X" form (Hungering /
 * Lifeblood / Primordial / Hydroid Krasis / Mistcutter / Nyxborn Hydra…). The resolver reads the chosen X
 * (threaded as the cast's xValue) and adds that many +1/+1 counters, so the creature enters at its real P/T
 * instead of a 0/0 that dies to the lethal-toughness SBA. A "for each <thing>" / "equal to" / "plus N"
 * variant is a DIFFERENT magnitude (not the cast X) → false, left for the Arbiter. Leaf (no engine import).
 */
/**
 * ⭐ SUNBURST (CR 702.43) — "This permanent enters with a +1/+1 counter on it for each color of mana spent
 * to cast it." (Spinal Parasite, Sawtooth Thresher, Solarion, Skyrider Elf, Woodland Wanderer, Radiant
 * Epicure, the Archaic cycle…). Like ravenous above, the keyword's whole rule lives in REMINDER parens, so
 * the reminder-strip erases it and no sentence matcher can see it — the keyword itself is detected instead.
 *
 * ⛔ THE COUNTER KIND IS PART OF THE ANSWER, not an assumption. Sunburst puts +1/+1 counters on a CREATURE
 * and CHARGE counters on a non-creature artifact (CR 702.43a). Returning the kind rather than a boolean
 * keeps the resolver honest — a bare `true` would have quietly given Solarion +1/+1 counters it doesn't get.
 *
 * ⛔ ARTIFACT CREATURES TAKE +1/+1 (CR 702.43a — "if it's a creature", checked first), which is why the
 * creature test precedes the artifact one.
 *
 * Returns "+1/+1" | "charge" | null.
 */
export function sunburstCounterKind(card) {
  const raw = String(card?.oracle || card?.oracle_text || "");
  if (!/(?:^|[\n.;]\s*)sunburst\b/i.test(raw)) return null;
  const tl = String(card?.type || card?.type_line || "").split(" // ")[0];
  if (/\bCreature\b/i.test(tl)) return "+1/+1";
  if (/\bArtifact\b/i.test(tl)) return "charge";
  return null; // neither — outside CR 702.43a's two cases, so refuse rather than guess
}

/**
 * ⭐ CONVERGE ENTERS-WITH (CR 702.117a) — "Converge — This creature enters with a +1/+1 counter on it for
 * each color of mana spent to cast it." (Skyrider Elf, Woodland Wanderer, Tajuru Stalwart, Crystalline
 * Crawler, the Archaic cycle) and the DOUBLED form, "…with TWO +1/+1 counters on it for each color…"
 * (Glinting Creeper).
 *
 * ⭐ THE SAME QUESTION AS SUNBURST, WRITTEN OUT LONGHAND. Converge is an ability WORD (CR 207.2c) with no
 * rules meaning — the sentence after the dash carries everything — where sunburst is a keyword whose rule
 * lives in reminder parens. Both read the colour count captured off the payment plan; only the DETECTION
 * differs, which is why this is a sibling reader rather than a widened sunburst one.
 *
 * ⛔ THE PER-COLOUR MULTIPLIER IS PARSED, NOT ASSUMED. Glinting Creeper gets TWO counters per colour, and a
 * hard-coded 1 would silently halve it — the same class of error as assuming sunburst's counter kind, and
 * invisible for the same reason (the card still enters with *some* counters).
 *
 * ⛔ +1/+1 ONLY. Every corpus carrier of this sentence puts +1/+1 counters on a creature; a different kind
 * would need its own evidence, so the anchor names the counter explicitly rather than accepting any word.
 *
 * Returns { per } | null — `per` counters per colour of mana spent.
 */
export function convergeEntersCounters(card) {
  const raw = String(card?.oracle || card?.oracle_text || "").replace(/\([^)]*\)/g, " ");
  for (const line of raw.split("\n")) {
    const m = line.trim().toLowerCase().replace(/[’]/g, "'")
      .match(/^converge\s*[—–-]\s*this creature enters with (a|one|two|three) \+1\/\+1 counters? on it for each color of mana spent to cast it\.?$/);
    if (m) return { per: _ENTER_NUM[m[1]] ?? 1 };
  }
  return null;
}

export function entersWithXCounters(card) {
  const rawOracle = String(card?.oracle || card?.oracle_text || "");
  // KW-RAVENOUS (Edge of Eternities / Warhammer 40k — CR keyword) — the keyword's enters-with-X mechanic
  // lives ENTIRELY in REMINDER parens ("Ravenous (This creature enters with X +1/+1 counters on it. If X is
  // 5 or more, draw a card when it enters.)"), so the reminder-strip below erases it and the literal-X regex
  // never matches. Ravenous is ALWAYS the bare cast-{X} form (canonical fixed reminder — never a "for each"/
  // "where X is" board metric), so the {X} pip feeds the counters through the SAME resolver the printed
  // enters-with-X form uses (resolvers.enterPermanent, opts.xValue → applyCounterDoubling). Detect the printed
  // keyword directly (line-initial or after another keyword, reminder parens right after) so the resolver adds
  // the X counters. The "If X is 5 or more, draw a card" half is a SEPARATE synthesized ETB trigger
  // (triggers.detectTriggers) — this function only owns the counters. Every Ravenous card carries a real {X}
  // pip in its cost, so the classifier's xPipCount>=1 gate is always satisfied (no over-claim on a bare form).
  if (/\bravenous\b\s*\(this creature enters with x \+1\/\+1 counters? on it\b/i.test(rawOracle)) return true;
  const oracle = rawOracle.replace(/\([^)]*\)/g, " ");
  for (const sentence of oracle.split(/(?<=\.)\s+|\n+/)) {
    if (!/\benters (?:the battlefield )?with x \+1\/\+1 counters? on it/i.test(sentence)) continue;
    // A "where X is <board count>" / "for each" / "equal to" / "plus N" magnitude is NOT the cast {X}
    // (Inferno Project, Stag Beetle, Voracious Wurm, Cryptborn Horror…) — the engine can't compute it, so
    // it's left to the Arbiter. Only the bare cast-X form (the {X} pip feeds the counters) is modeled.
    if (/\b(?:for each|equal to|plus|times|double|where)\b/i.test(sentence)) return false;
    return true;
  }
  return false;
}

/**
 * KW-RIOT (CR 702.136) — the number of PRINTED riot instances on this card. Riot is a static ability
 * ("You may have this permanent enter with an additional +1/+1 counter on it. If you don't, it gains
 * haste." — CR 702.136a), an ENTERS-WITH-CHOICE replacement; CR 702.136b: multiple instances each work
 * separately, so the counter branch adds N counters for N instances. STRUCTURAL like undyingKeywordCount /
 * flankingKeywordCount: a whole comma-segment of a (reminder-stripped) line must be exactly "riot", so a
 * GRANT ("Nontoken creatures you control have riot" — Rhythm of the Wild / Uncivil Unrest; "Other Spiders
 * you control have riot" — Spider-Punk's grant clause) or Domri's "it gains riot" never counts as a
 * printed instance (those grant forms are NOT modeled — they stay body-only, a safe FN). Falls back to the
 * Scryfall `keywords` array ONLY when the structural scan finds nothing (test-shaped cards that carry the
 * keyword array but a bare oracle) — never double-counts. Returns an integer ≥ 0. Leaf (no engine import).
 * The resolver applies exactly this at ETB; coverage strips exactly this line — the SINGLE source of truth.
 */
export function riotKeywordCount(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "").replace(/\([^)]*\)/g, " ");
  let n = 0;
  for (const line of oracle.split("\n")) {
    for (const seg of line.split(",")) if (seg.trim().toLowerCase() === "riot") n++;
  }
  if (n === 0 && Array.isArray(card?.keywords) && card.keywords.some((k) => String(k).toLowerCase() === "riot")) n = 1;
  return n;
}

// ─── ETB-XCOUNTERS-FROM-METRIC: enters-with-counters where the count is a BOARD METRIC ───
// Map the "for each <X>" tail of a metric enters-with clause to a SERIALIZABLE countForSpec spec, or null.
// DELIBERATELY NARROW: only the dup-free, unambiguous board sources countForSpec already resolves —
//   "[other ]<card type> you control"   → permanentsYouControl cardType (other → excludeSelf, CR 113.7)
//   "[other ]<basic land> you control"  → permanentsYouControl subtype
// A creature subtype ("Goblin"), opponent/qualified/graveyard/hand count, or any multi-word phrase → null →
// NO spec → the card stays body-only (Arbiter, never a fabricated count). CREED: a miss is safe, a wrong
// count across many cards is forbidden.
function parseMetricCountSource(phrase) {
  let p = String(phrase).toLowerCase().trim().replace(/\.\s*$/, "");
  let excludeSelf = false;
  const om = p.match(/^other\s+(.+)$/); // "other creature you control" — exclude the entering permanent
  if (om) { excludeSelf = true; p = om[1]; }
  let m;
  if ((m = p.match(/^(creatures?|artifacts?|lands?|enchantments?) you control$/))) {
    return { kind: "permanentsYouControl", cardType: SELF_COUNT_CARDTYPE[m[1]], excludeSelf };
  }
  if ((m = p.match(/^(plains|islands?|swamps?|mountains?|forests?) you control$/))) {
    return { kind: "permanentsYouControl", subtype: SELF_COUNT_BASIC[m[1]], excludeSelf };
  }
  // ⭐ MULTIKICKER COUNT (CR 702.33h) — "…enters with a +1/+1 counter on it FOR EACH TIME IT WAS KICKED"
  // (Skitter of Lizards, Quag Vampires, Enclave Elite, Gnarlid Pack, Apex Hawks). Not a board metric like its
  // neighbours but a CAST-TIME one, stamped on state by the dispatcher and read back by countForSpec's
  // `timesKicked` kind — the same channel the colours-spent and sacrificed-* referents use.
  // ⛔ IT READS ZERO TODAY AND THAT IS THE TRUE ANSWER, not a placeholder: legalChoices never offers a
  // multikicked cast (parseKickerCost refuses multikicker, CR 702.33h), so every cast the engine can make
  // really was kicked zero times, and Skitter of Lizards hard-cast for {R} is a 1/1 haste with no counters —
  // exactly as printed. Modelled as a COUNT rather than stripped so it goes live automatically if
  // multikicker is ever offered.
  if (/^times? it was kicked$/.test(p)) return { kind: "timesKicked", excludeSelf };
  return null;
}

/**
 * ETB-XCOUNTERS-FROM-METRIC (CR 614.1c + 122.6a) — does this permanent enter with +1/+1 counters whose COUNT
 * is a board metric (not a fixed N, not the cast {X})? Returns a serializable descriptor
 *   { fixed, perUnit, metric }   (counters added at ETB = fixed + perUnit * countForSpec(state, ctx, metric))
 * or null. The resolver resolves `metric` via countForSpec AT RESOLUTION (CR 608.2h — the board is read as the
 * permanent enters), so the creature enters at its real P/T instead of a 0/0 that dies to the lethal SBA. Two
 * STRICT, fully-reducible shapes (every other variant → null → body-only → Arbiter, never a fabricated count):
 *
 *   "enters with <N> +1/+1 counter(s) on it [plus an additional +1/+1 counter on it ]for each <metric>"
 *      — Squad Captain (fixed 0, 1-per other creature), Sheriff of Safe Passage (fixed 1 + 1-per other creature).
 *        The leading number is the FIXED part; the per-each is always exactly one counter per matched permanent.
 *
 *   "enters with X +1/+1 counters on it, where X is the greatest power|toughness among [other ]creatures you control"
 *      — Prime Speaker Zegana (greatest power among OTHER creatures). metric = greatestPowerYouControl /
 *        greatestToughnessYouControl with excludeSelf; perUnit 1, fixed 0.
 *
 * Leaf (no engine import): the parser emits a spec; resolvers.js computes it through countForSpec.
 */
export function entersWithMetricCounters(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "").replace(/\([^)]*\)/g, " ");
  for (const sentence of oracle.split(/(?<=\.)\s+|\n+/)) {
    const s = sentence.trim();
    if (!/\benters (?:the battlefield )?with /i.test(s)) continue;

    // Shape B — "where X is the greatest power|toughness among [other ]creatures you control".
    let m = s.match(/^[^.]*?\benters (?:the battlefield )?with x \+1\/\+1 counters? on it,? where x is the greatest (power|toughness) among (other )?creatures you control\.?$/i);
    if (m) {
      const kind = m[1].toLowerCase() === "power" ? "greatestPowerYouControl" : "greatestToughnessYouControl";
      return { fixed: 0, perUnit: 1, metric: { kind, excludeSelf: !!m[2] } };
    }

    // Shape A — "<N> +1/+1 counter(s) on it [plus an additional +1/+1 counter on it ]for each <metric>".
    m = s.match(/^[^.]*?\benters (?:the battlefield )?with (a|an|one|two|three|four|five|\d+) \+1\/\+1 counters? on it(?: plus an additional \+1\/\+1 counter on it)? for each (.+?)\.?$/i);
    if (m) {
      const metric = parseMetricCountSource(m[2]);
      if (!metric) return null; // unmodeled count source → body-only (Arbiter)
      // "<N> … for each X" = N counters per matched permanent (Squad Captain: "a … for each" = 1 each, fixed 0).
      // "<N> … plus an additional +1/+1 counter on it for each X" = N FIXED + 1 each (Sheriff: 1 fixed + 1 each).
      const n = _ENTER_NUM[m[1].toLowerCase()] ?? (parseInt(m[1], 10) || 0);
      const hasPlus = /plus an additional \+1\/\+1 counter on it for each/i.test(s);
      return hasPlus ? { fixed: n, perUnit: 1, metric } : { fixed: 0, perUnit: n, metric };
    }
  }
  return null;
}

// ─── SELF-METRIC-COST-REDUCTION (CR 601.2f) — "This spell costs {X} less to cast, where X is <metric>" ───
// A spell that reduces its OWN cast cost by a live board metric, read at cast announce (CR 601.2f); the spell's
// mana value is UNCHANGED (CR 202.3 — MV is the printed mana cost). The {X} here is NOT an {X} in the mana cost
// (Ghalta is {10}{G}{G}); it's the magnitude of the generic-only reduction. legalChoices reads this descriptor
// at the cast site, computes the metric against the LIVE board, and floors the generic at {0} (the colored pips
// are NEVER reduced). The serializable `metric` is one of FOUR fully-reducible board sources — every other
// "where X is …" phrasing → null → the card stays body-only (Arbiter; never an unknown/fabricated reduction):
//   • "the total power of creatures you control"                 → { kind: "totalPowerYouControl" }      (Ghalta)
//   • "the greatest power among creatures you control"           → { kind: "greatestPowerYouControl" }   (The Great Henge — reuses countForSpec)
//   • "the greatest number of artifacts an opponent controls"    → { kind: "greatestArtifactsAnOpponentControls" } (Cavern-Hoard Dragon)
//   • "the total mana value of historic permanents you control"  → { kind: "totalManaValueHistoricYouControl" } (Excalibur; historic = artifact/legendary/Saga, CR 702.149a)
// Anchored ^…$ on the (reminder-stripped) sentence so a rider / "for each" / unmodeled metric stays non-native
// (FN-safe). Leaf (no engine import): legalChoices.selfCostReductionForSpell evaluates the metric.
const SELF_COST_METRICS = [
  [/^this spell costs \{x\} less to cast, where x is the total power of creatures you control$/, { kind: "totalPowerYouControl" }],
  [/^this spell costs \{x\} less to cast, where x is the greatest power among creatures you control$/, { kind: "greatestPowerYouControl" }],
  [/^this spell costs \{x\} less to cast, where x is the greatest number of artifacts an opponent controls$/, { kind: "greatestArtifactsAnOpponentControls" }],
  [/^this spell costs \{x\} less to cast, where x is the total mana value of historic permanents you control$/, { kind: "totalManaValueHistoricYouControl" }],
  // LIFE-BELOW-START (Shadow of Mortality, SHELF S7): the leading condition is REDUNDANT with the metric
  // (X = the difference is 0 exactly when life ≥ starting), so the whole sentence reduces to one metric.
  [/^if your life total is less than your starting life total, this spell costs \{x\} less to cast, where x is the difference$/, { kind: "lifeBelowStart" }],
];
export function selfCostReductionMetric(card) {
  // Reminder text ("(Artifacts, legendaries, and Sagas are historic.)" — Excalibur) is parenthetical (CR 207.2)
  // and must be stripped before the anchored match, else the trailing reminder breaks the `$` anchor.
  const oracle = String(card?.oracle || card?.oracle_text || "").replace(/\([^)]*\)/g, " ");
  for (const sentence of oracle.split(/(?<=\.)\s+|\n+/)) {
    const s = sentence.trim().toLowerCase().replace(/\.\s*$/, "");
    if (!s.startsWith("this spell costs") && !s.startsWith("if your life total is less than your starting life total, this spell costs")) continue;
    for (const [re, metric] of SELF_COST_METRICS) {
      if (re.test(s)) return metric;
    }
    // PER-EACH form — "This spell costs {1} less to cast FOR EACH creature card in your graveyard" (Karador,
    // Ghost Chieftain; Nemesis of Mortals; Hollow Marauder). Structurally different from every entry in the
    // table above: those are all "{X} less, where X is <metric>" (one number), this is a per-unit times a
    // COUNT. The table had no per-each shape at all, so the clause fell straight to null.
    // ⭐ REUSES parseSelfCountSource RATHER THAN GROWING A SECOND COUNT VOCABULARY. Every source it admits
    // already carries an exactness argument, and the evaluator this metric reaches (countForSpec, already
    // imported at the cost site for greatestPowerYouControl) is the same dispatcher the P/T lane uses. An
    // UNMODELED source returns null and the card parks — "for each creature in your PARTY" has no evaluator
    // and stays parked, pinned.
    const fe = s.match(/^this spell costs \{(\d+)\} less to cast for each (.+)$/);
    if (fe) {
      const feSpec = parseSelfCountSource(fe[2]);
      return feSpec ? { kind: "perEachCount", per: Number(fe[1]), countSpec: feSpec } : null;
    }
    return null; // a "This spell costs …" clause we couldn't reduce to a modeled metric → body-only (Arbiter)
  }
  return null;
}

/**
 * TRUNK-ENTERSTAPPED (CR 614.1c; static per 603.6d) — does this permanent enter the battlefield tapped, unconditionally? True
 * ONLY for the bare "~ enters tapped" with NO condition/choice in the same sentence: a check-/fast-land
 * ("enters tapped unless you control …"), a reveal-land ("if you don't, ~ enters tapped"), or any
 * may/choose/instead form returns false (the gate isn't evaluated → the permanent enters UNTAPPED, the
 * current behavior — the CREED-safe direction: a false negative leaves the player a land they can tap, never
 * the false positive of denying mana they're owed). Temples / Triomes / bounce- & karoo-lands / tapped duals
 * all match the bare form. Leaf (no engine import).
 */
export function entersTapped(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "").replace(/\([^)]*\)/g, " ");
  for (const sentence of oracle.split(/(?<=\.)\s+|\n+/)) {
    const m = /\benters (?:the battlefield )?tapped\b/i.exec(sentence);
    if (!m) continue;
    // Any conditionality / choice / alternative in the SAME sentence → not the bare form → leave untapped.
    if (/\b(?:unless|if|may|choose|reveal|instead|could|would|rather|or|as long as|you control|you don't|you do)\b/i.test(sentence)) return false;
    // A TRAILING rider after "tapped" ("…tapped AND attacking", "…tapped, THEN you draw a card") carries
    // additional, possibly-unmodeled text that the coverage tapRe strip would silently drop along with the
    // tapped clause → an over-credit. Reject it (CREED: a false negative is safe; the card stays body-only
    // until the rider is modeled too). Only "and"/"then" AFTER "tapped" count — a leading multi-subject
    // join ("X and Y enter tapped") is left to the conditional denylist above.
    if (/\b(?:and|then)\b/i.test(sentence.slice(m.index + m[0].length))) return false;
    return true;
  }
  return false;
}

/**
 * GATED-KEYWORD — emit a layer-6 gated keyword grant for each keyword in `kwPhrase`, gated on the
 * "you control <quant> <type>" threshold, or nothing. STRICT: EVERY comma/"and"-segment of kwPhrase must be a
 * grantable keyword — a single leftover non-keyword segment ("trample and is a 4/4") means dropping real text,
 * so the WHOLE clause is left LOW (CREED: a partial keyword grant that silently drops other text is a false
 * positive). An unmodeled gate type likewise yields nothing → LOW → Arbiter.
 */
function emitGatedKeywords(out, kwPhrase, quant, typePhrase) {
  const gate = parseControlGateSource(quant, typePhrase);
  if (!gate) return;
  const segs = String(kwPhrase).split(/,|\band\b/).map(s => s.trim().replace(/[^a-z ]/g, "").trim()).filter(Boolean);
  if (segs.length === 0 || !segs.every(s => GRANTABLE_KEYWORDS.has(s))) return;
  for (const s of segs) {
    out.push({ layer: 6, op: { layerOp: "addKeyword", keyword: canonicalKeyword(s), gate }, affects: { mode: "self" }, duration: { kind: "permanent" } });
  }
}

const GY_NUMWORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
/**
 * GATED-GY / GATED-GY-EXT — recognize a graveyard-COUNT gate in a (label-stripped, lowercased)
 * clause; return { gate, match } | null.
 *   "as long as there are <N> or more card types among cards in your graveyard" → cardTypesInGraveyard (delirium)
 *   "as long as there are <N> or more cards in your graveyard"                  → cardsInGraveyard   (threshold)
 *   "as long as there are <N> or more permanent cards in your graveyard"        → cardsInGraveyard + cardType:"Permanent" (Descend 4)
 *   "as long as there are <N> or more instant and/or sorcery cards in your graveyard" → cardsInGraveyard + cardType:"instantOrSorcery"
 * Delirium is tried FIRST (its string also ends in "cards in your graveyard"). Typed forms before the
 * bare threshold so "permanent cards" / "instant and/or sorcery cards" don't spuriously match the bare
 * "cards" anchor. `match` is the exact gate substring; the caller strips it and keeps the effect text.
 */
function parseGraveyardGate(clause) {
  let m = clause.match(/as long as there (?:are|is) (\w+) or more card types? among cards in your graveyard/);
  if (m) { const n = GY_NUMWORD[m[1]] ?? parseInt(m[1], 10); if (n > 0) return { gate: { countSpec: { kind: "cardTypesInGraveyard" }, atLeast: n, excludeSelf: false }, match: m[0] }; }
  m = clause.match(/as long as there (?:are|is) (\w+) or more permanent cards in your graveyard/);
  if (m) { const n = GY_NUMWORD[m[1]] ?? parseInt(m[1], 10); if (n > 0) return { gate: { countSpec: { kind: "cardsInGraveyard", cardType: "Permanent" }, atLeast: n, excludeSelf: false }, match: m[0] }; }
  m = clause.match(/as long as there (?:are|is) (\w+) or more instant (?:and\/or|or) sorcery cards in your graveyard/);
  if (m) { const n = GY_NUMWORD[m[1]] ?? parseInt(m[1], 10); if (n > 0) return { gate: { countSpec: { kind: "cardsInGraveyard", cardType: "instantOrSorcery" }, atLeast: n, excludeSelf: false }, match: m[0] }; }
  m = clause.match(/as long as there (?:are|is) (\w+) or more cards in your graveyard/);
  if (m) { const n = GY_NUMWORD[m[1]] ?? parseInt(m[1], 10); if (n > 0) return { gate: { countSpec: { kind: "cardsInGraveyard" }, atLeast: n, excludeSelf: false }, match: m[0] }; }
  return null;
}

/**
 * SELF-COUNTER-GATE — recognize a "as long as it has <N> or more +1/+1 counters on it" gate in a
 * (label-stripped, lowercased, self-name-normalized) clause; return { gate, match } | null. The card's own
 * name was rewritten to "this creature" upstream (selfNormalizeOracle), so the self-reference is always "it"
 * here (the clause is "this creature has <kw> as long as it has N or more +1/+1 counters on it" — the leading
 * subject is consumed by the caller's `(?:this creature|it) has (.+?)` capture, leaving "it" inside the gate).
 *   "as long as it has <N> or more +1/+1 counters on it" → countersOnSelf "+1/+1" ≥ N
 * Primordial Hydra (trample at 10), Taborax, Hope's Demise (lifelink at 5). gateMet reads the permanent's own
 * +1/+1 pile and re-evaluates live (CR 613.7), so the keyword appears/disappears as the count crosses N.
 * Only the bare +1/+1 form is modeled — any other counter kind / qualified threshold → null → LOW (safe FN).
 */
function parseSelfCounterGate(clause) {
  const m = String(clause).match(/as long as it has (\w+) or more \+1\/\+1 counters on it/);
  if (!m) return null;
  const n = GY_NUMWORD[m[1]] ?? parseInt(m[1], 10);
  if (!(n > 0)) return null;
  return { gate: { countSpec: { kind: "countersOnSelf", counterType: "+1/+1" }, atLeast: n, excludeSelf: false }, match: m[0] };
}

/**
 * SELF-NAMED-COUNTER-PRESENCE GATE (ARIXMETHES) — recognize an "as long as it has a <name> counter on it"
 * PRESENCE gate (threshold 1, a NAMED non-P/T counter) in a (lowercased, self-name-normalized) clause; return
 * { gate, counterType } | null. The card's own name was rewritten to "this creature"/"it" upstream. Distinct
 * from parseSelfCounterGate (a "<N> or more +1/+1" THRESHOLD): this is the bare "has a <name> counter" presence
 * used by a counter-gated type-change (Arixmethes: "As long as ~ has a slumber counter on it, it's a land").
 * gateMet reads the permanent's own <name> pile and re-evaluates live (CR 613.7), so the effect turns off the
 * instant the last counter is removed. Only a single bare non-±1/+1 counter word is admitted — a qualified /
 * multi / P-T-counter form → null → the type-change stays unmodeled (safe FN). Pure; feeds a layer-4 gate.
 */
function parseSelfNamedCounterPresenceGate(clause) {
  const m = String(clause).match(/as long as (?:this creature|it) has (?:a|an|one) ([a-z]+) counter on it/);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  if (/^[+-]?1$/.test(kind) || kind === "loyalty") return null; // ±1/+1 (P/T) or loyalty → not this presence gate
  return { gate: { countSpec: { kind: "countersOnSelf", counterType: kind }, atLeast: 1, excludeSelf: false }, counterType: kind, match: m[0] };
}

/**
 * COUNTER-GATED TYPE-CHANGE (ARIXMETHES, CR 613.4b layer 4 + 305.7) — recognize the "it's a land (not a
 * creature)" (or "it's not a creature") TYPE-CHANGING effect body of a counter-gated static, and emit the
 * gated layer-4 op(s). Called with the effect text AFTER the gate has been stripped (so `eff` is e.g. "it's a
 * land" / "it's a land. it's not a creature" / "it's not a creature"). Two type deltas are modeled, each carried
 * with the SAME gate object so they flip together under layers.gateMet:
 *   • "it's a land"        → layer-4 addCardType "Land"        (gains the Land type — CR 305.7 a land that's also
 *                            a creature, but here paired with the creature removal so it's a pure land)
 *   • "it's not a creature"/"(not a creature)" → layer-4 removeCardType "Creature"
 * Arixmethes' printed text is "it's a land. (It's not a creature.)" — the parenthetical is reminder-ish but
 * FUNCTIONAL here (it's the actual rules text on the card: a land that would otherwise still be a Creature), so
 * BOTH deltas are emitted. STRICT: the effect must reduce EXACTLY to these type deltas (any other leftover text
 * → nothing emitted → LOW, CREED). Returns true iff at least one delta was emitted (caller returns after).
 */
function emitCounterGatedTypeChange(out, effRaw, gate, card) {
  // Normalize: drop the leading "it's"/"it is", collapse the paren'd "(not a creature)" reminder to plain text.
  let e = String(effRaw).toLowerCase().trim()
    .replace(/[().]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Split on the two recognized deltas; anything else remaining means unmodeled text → emit nothing (CREED).
  let wantsLand = false, wantsNonCreature = false;
  // "it's a land" / "it is a land"
  if (/\bit(?:'s| is) a land\b/.test(e)) { wantsLand = true; e = e.replace(/\bit(?:'s| is) a land\b/g, " "); }
  // "it's not a creature" / "not a creature" (the parenthetical reminder, if it survived to here)
  if (/\b(?:it(?:'s| is) )?not a creature\b/.test(e)) { wantsNonCreature = true; e = e.replace(/\b(?:it(?:'s| is) )?not a creature\b/g, " "); }
  e = e.replace(/\s+/g, " ").trim();
  if (e !== "" || (!wantsLand && !wantsNonCreature)) return false; // leftover text or nothing recognized → LOW
  if (wantsLand) out.push({ layer: 4, op: { layerOp: "addCardType", types: ["Land"], gate }, affects: { mode: "self" }, duration: { kind: "permanent" } });
  // PAIRED CREATURE-REMOVAL (CR 305.7 + the card's own "(It's not a creature.)" clarification): when a PRINTED
  // CREATURE gains the Land type via this gated static, it is a land and NOT a creature while gated (Arixmethes'
  // definitive Oracle). The parenthetical reminder is stripped upstream (selfNormalizeOracle removes parens), so
  // the removal is inferred from the printed Creature type + the land grant — NOT fabricated: it's the card's
  // own printed reminder. Gated identically, so combat / the lethal-damage SBA / "creatures you control"
  // selectors all treat gated-Arixmethes as the non-creature land it is, and it flips back to a creature the
  // instant the last slumber counter is removed. Not emitted twice if the text already said "not a creature".
  const printedCreature = /\bcreature\b/i.test(String(card?.type || card?.type_line || ""));
  if (wantsNonCreature || (wantsLand && printedCreature)) {
    out.push({ layer: 4, op: { layerOp: "removeCardType", removeType: "Creature", gate }, affects: { mode: "self" }, duration: { kind: "permanent" } });
  }
  return true;
}

/**
 * Emit the descriptor(s) for a gated SELF effect — "[this creature] gets +X/+Y[ and has <kw>…]" or
 * "[this creature] has <kw>…" — gated on `gate`. Gate-SOURCE-AGNOSTIC: the same emitter serves the GATED-GY
 * graveyard-count gate (and could serve the control gate). STRICT (CREED): the effect must reduce EXACTLY to a
 * P/T buff and/or grantable keyword(s); ANY leftover text (a quoted triggered ability, "is black", "can't
 * block", a quoted trigger/activated ability) means real text would be silently dropped, so the WHOLE clause
 * emits nothing and the card stays LOW. P/T → layer-7c ptModifyGated; each keyword → layer-6 gated addKeyword;
 * all carry the SAME gate object so they turn on/off together under layers.gateMet.
 */
function emitGatedEffect(out, effRaw, gate) {
  if (!gate) return;
  let e = String(effRaw).toLowerCase().trim().replace(/\.$/, "").replace(/^[,\s]+/, "").replace(/^(?:this creature|it)\s+/, "");
  let pt = null;
  const ptm = e.match(/^gets ([+-]\d+)\/([+-]\d+)/);
  if (ptm) { pt = { power: signed(ptm[1]), toughness: signed(ptm[2]) }; e = e.slice(ptm[0].length); }
  e = e.replace(/^\s*(?:,\s*and|,|and)\s+/, "").trim(); // connector between the P/T and the keyword(s)
  const kws = [];
  if (e.startsWith("has ")) {
    const segs = e.slice(4).split(/,|\band\b/).map(s => s.trim().replace(/[^a-z ]/g, "").trim()).filter(Boolean);
    if (segs.length && segs.every(s => GRANTABLE_KEYWORDS.has(s))) { for (const s of segs) kws.push(canonicalKeyword(s)); e = ""; }
  }
  // ⭐ COMBAT-RESTRICTION RIDERS — "gets +2/+2 AND CAN'T BLOCK" (Childhood Horror). Pure ignition: both
  // pseudo-keywords below are already modelled and enforced layer-aware, and this emitter already knows how
  // to attach a gate to an addKeyword. The rider simply had no entry point, so the whole clause fell to the
  // unconsumed-rider return below and parked the card.
  //   · "can't block"      → cantBlock   — read by combatEvasion.canBlockAttacker (permanentHasKeyword)
  //   · "can't be blocked" → unblockable — read by the same function's attacker-side check
  //   · "can't attack"     → cantAttack  — read at the attack-declaration enumeration sites
  // ⛔ WHOLE-ANCHORED, AND THAT IS THE ENTIRE SAFETY ARGUMENT. "can't be blocked EXCEPT by artifact
  // creatures" (fear) and "can't be blocked BY creatures with flying" are FILTERED evasion, a different and
  // much weaker ability; mapping either onto bare `unblockable` would make the creature unblockable by
  // everything — a forbidden false positive, and one Frightcrawler would have triggered on its own first
  // line. The `$` anchor is what keeps them out; do not relax it into a prefix match.
  // ⓘ "can attack as though it didn't have defender" is NOT here on purpose. It is an as-though effect
  // (CR 609.4b), not a keyword removal — emitting removeKeyword:defender would be observably wrong to
  // everything else that reads defender ("creatures with defender you control get …", Wall tribal). It
  // needs its own pseudo-keyword honored at the attack gates; a separate slice, 8 carriers.
  if (e !== "") {
    const restriction = e.replace(/[‘’']/g, "'");
    const RIDERS = { "can't block": ["cantBlock"], "can't attack": ["cantAttack"], "can't be blocked": ["unblockable"], "can't attack or block": ["cantAttack", "cantBlock"],
      // The as-though defender escape (CR 609.4b) — its own pseudo-keyword, honored ONLY at the two
      // attack-declaration enumeration sites, so the creature keeps defender for every other reader.
      "can attack as though it didn't have defender": ["attacksIgnoringDefender"] };
    if (Object.hasOwn(RIDERS, restriction)) { for (const k of RIDERS[restriction]) kws.push(k); e = ""; }
  }
  if (e !== "" || (!pt && kws.length === 0)) return; // unconsumed rider, or nothing recognized → LOW (Arbiter)
  if (pt) out.push({ layer: 7, sublayer: "7c", op: { layerOp: "ptModifyGated", power: pt.power, toughness: pt.toughness, gate }, affects: { mode: "self" }, duration: { kind: "permanent" } });
  for (const kw of kws) out.push({ layer: 6, op: { layerOp: "addKeyword", keyword: kw, gate }, affects: { mode: "self" }, duration: { kind: "permanent" } });
}

/**
 * CONDITION-GATED GROUP ANTHEM (BLITZ CA-1, CR 611.3a/611.3b) — parse the "<condition>" text of a GROUP
 * anthem's "as long as <condition>" into a serializable gate layers.gateMet can evaluate LIVE at every
 * derive pass, or null if the condition has no exact evaluator (the whole clause then stays body-only —
 * CREED: a condition that evaluates wrong at any phase is a forbidden FP; a park is safe). Two SCOPES,
 * kept distinct and exact:
 *   • PER-SOURCE conditions carry gateOn:"source" — layers.gatePermForEffect swaps the gate's subject to
 *     the effect's SOURCE permanent, so "your graveyard" / "you control" / "this creature is equipped"
 *     read the ANTHEM's controller/source state while the buff lands on each selected candidate:
 *       - "you control <quant> <type>"                → the parseControlGateSource board count
 *       - "there are <N> or more … in your graveyard" → the parseGraveyardGate count (threshold/delirium/…)
 *       - "this creature is equipped"                 → isEquipped (source carries the Equipment)
 *       - "this creature is untapped"                 → untapped (the source's live tapped flag)
 *       - "this enchantment has <N> or more <name> counters on it" (+ the "there are/is …" and
 *         "exactly <N>" phrasings)                    → countersOnSelf on the SOURCE's counter pile
 *       - "you have <N> or fewer cards in hand"       → cardsInHand (the source controller's hand size)
 *   • PER-CANDIDATE conditions carry NO gateOn — the gate reads each AFFECTED creature's own state:
 *       - "it's not attacking"                        → notAttacking (state.combat.attackers membership)
 * Every alternative is whole-anchored (^…$) over the condition text, so a compound/rider condition
 * ("… and it's your turn") matches nothing and fails closed. Pure text → spec; no game state read here.
 */
function parseAsLongAsGate(condText) {
  const t = String(condText).trim().replace(/\.$/, "");
  // Board-count control gate ("you control three or more artifacts" / "an equipment" / "ten or more
  // lands" / — BLITZ CA-2 — "a Liliana planeswalker", the one two-word phrase parseControlGateSource
  // admits as a planeswalker-TYPE subtype scan).
  let m = t.match(/^you control (a|an|another|\w+ or more) ([a-z]+(?: planeswalkers?)?)$/);
  if (m) {
    const g = parseControlGateSource(m[1], m[2]);
    return g ? { ...g, gateOn: "source" } : null;
  }
  // COLOR-OR control gate (BLITZ AU-1 — the Runemark cycle: "you control a black or green permanent"): a
  // permanent of EITHER named color on the SOURCE controller's board (gateOn:"source" — CR 109.5 "you" = the
  // aura/anthem controller, which the enchanted creature need NOT be). Only a WUBRG color-word pair maps; any
  // other word pair ("an artifact or enchantment permanent" — a type-OR this slice doesn't model) → null →
  // fail closed. layers.countSelfSpecOnBoard counts the printed-color matches; presence (atLeast 1) opens it.
  m = t.match(/^you control (?:a|an) (\w+) or (\w+) permanent$/);
  if (m) {
    const cA = COLOR_WORDS[m[1]], cB = COLOR_WORDS[m[2]];
    return cA && cB ? { countSpec: { kind: "colorPermanentsYouControl", colors: [cA, cB] }, atLeast: 1, gateOn: "source" } : null;
  }
  // ⭐ SINGLE-COLOR control gate — the Cohort and Scarecrow cycles ("as long as you control ANOTHER blue
  // creature" — Briarberry Cohort; "as long as you control a white creature" — Watchwing Scarecrow;
  // "as long as you control a green permanent" — Toxic Iguanar). The single-colour sibling of the
  // colour-OR Runemark arm directly above, on the SAME countSelfSpecOnBoard branch and the same
  // presence test (atLeast 1), so the colour vocabulary can't fork.
  // ⛔ "ANOTHER" MUST CARRY excludeSelf. Ballynock Cohort IS a white creature; without it the card would
  // satisfy its own gate on an empty board and buff itself permanently — turning a conditional +1/+1 into
  // an unconditional one. A false positive, and the reason "a" and "another" are captured separately.
  m = t.match(/^you control (a|an|another) (white|blue|black|red|green) (creature|permanent)$/);
  if (m) {
    const col = COLOR_WORDS[m[2]];
    if (!col) return null;
    return { countSpec: { kind: "colorPermanentsYouControl", colors: [col],
      ...(m[3] === "creature" ? { cardType: "Creature" } : {}),
      ...(m[1] === "another" ? { excludeSelf: true } : {}) }, atLeast: 1, gateOn: "source" };
  }
  // Graveyard-count gate — reuse parseGraveyardGate and require it to consume the WHOLE condition.
  const gy = parseGraveyardGate(`as long as ${t}`);
  if (gy) return gy.match === `as long as ${t}` ? { ...gy.gate, gateOn: "source" } : null;
  // Source attachment / tap state ("this creature" — the self-name was normalized upstream).
  if (/^(?:this creature|it) is equipped$/.test(t)) return { kind: "isEquipped", gateOn: "source" };
  if (/^(?:this creature|it) is untapped$/.test(t)) return { kind: "untapped", gateOn: "source" };
  // MONSTROUS (CR 701.32d) — the untapped gate's sibling; layers.gateMet reads the `monstrous` latch the
  // monstrosity atom sets. gateOn:"source" like the tap read, which is a no-op for these SELF clauses
  // (source == affected) and correct if the shape ever appears on a group anthem.
  if (/^(?:this creature|it) is monstrous$/.test(t)) return { kind: "monstrous", gateOn: "source" };
  // PER-CANDIDATE: the affected creature is not a declared attacker (Arcades Sabboth).
  if (/^it's not attacking$/.test(t)) return { kind: "notAttacking" };
  // Source counter-pile thresholds (Beastmaster Ascension / Obscura Ascendancy / Tidal Influence forms).
  const SELF_PERM = "this (?:enchantment|artifact|creature|permanent)";
  m = t.match(new RegExp(`^(?:${SELF_PERM}|it) has (\\w+) or more ([a-z]+) counters on it$`));
  if (!m) {
    const mm = t.match(new RegExp(`^there (?:are|is) (\\w+) or more ([a-z]+) counters? on ${SELF_PERM}$`));
    if (mm) m = mm;
  }
  if (m) {
    const n = GY_NUMWORD[m[1]] ?? (/^\d+$/.test(m[1]) ? parseInt(m[1], 10) : NaN);
    return Number.isInteger(n) && n > 0
      ? { countSpec: { kind: "countersOnSelf", counterType: m[2] }, atLeast: n, gateOn: "source" }
      : null;
  }
  m = t.match(new RegExp(`^there (?:are|is) exactly (\\w+) ([a-z]+) counters? on ${SELF_PERM}$`));
  if (m) {
    const n = GY_NUMWORD[m[1]] ?? (/^\d+$/.test(m[1]) ? parseInt(m[1], 10) : NaN);
    return Number.isInteger(n) && n > 0
      ? { countSpec: { kind: "countersOnSelf", counterType: m[2] }, atLeast: n, atMost: n, gateOn: "source" }
      : null;
  }
  // Hand-size ceiling (Neheb, the Worthy — "you have one or fewer cards in hand").
  m = t.match(/^you have (\w+) or fewer cards? in hand$/);
  if (m) {
    const n = GY_NUMWORD[m[1]] ?? (/^\d+$/.test(m[1]) ? parseInt(m[1], 10) : NaN);
    return Number.isInteger(n) && n >= 0 ? { kind: "cardsInHand", atMost: n, gateOn: "source" } : null;
  }
  // ── BLITZ CA-2 — the SELF-subject slice's gate-kind expansion. Every alternative stays whole-anchored
  // (^…$) and maps to an exact PURE-STATE evaluator in layers.gateMet (plain zone/flag/ledger reads — no
  // derived characteristics, no event reconstruction). The SELF lane strips gateOn (its subject IS the
  // source); in a GROUP clause the printed grammar decides the scope: "this creature is <X>" names the
  // SOURCE (the card's own name was normalized upstream) → gateOn:"source", while the bare contraction
  // "it's <X>" refers to each affected candidate (the Arcades notAttacking precedent) → per-candidate.
  // Turn-phase (the DT-1/ST-2 yourTurn evaluator, new phrasing): "as long as it's your turn" (Faithful
  // Pikemaster / Maarika). "Your" = the gate subject's controller → per-source in a group clause.
  if (/^it(?:'s| is) your turn$/.test(t)) return { kind: "yourTurn", gateOn: "source" };
  // Combat state (the notAttacking mirror): Adanto Vanguard / Kitesail Corsair / Kor Scythemaster.
  if (/^this creature is attacking$/.test(t)) return { kind: "attacking", gateOn: "source" };
  if (/^it(?:'s| is) attacking$/.test(t)) return { kind: "attacking" };
  // Tap state contraction ("as long as it's untapped" — Giant Tortoise / Dragonlord Ojutai; the full
  // "this creature is untapped" per-source form is matched above).
  if (/^it's untapped$/.test(t)) return { kind: "untapped" };
  // Attachment state (isEquipped is matched above; isEnchanted is its Aura twin — Fledgling Osprey).
  if (/^this creature is enchanted$/.test(t)) return { kind: "isEnchanted", gateOn: "source" };
  if (/^it(?:'s| is) enchanted$/.test(t)) return { kind: "isEnchanted" };
  if (/^it's equipped$/.test(t)) return { kind: "isEquipped" };
  // Hellbent / hand-size floor (extends the CA-1 cardsInHand band): "you have no cards in hand" (Demon's
  // Jester / Gathan Raiders); "you have seven or more cards in hand" (Akki Underling / Kiyomaro's four).
  if (/^you have no cards in hand$/.test(t)) return { kind: "cardsInHand", atMost: 0, gateOn: "source" };
  m = t.match(/^you have (\w+) or more cards in hand$/);
  if (m) {
    const n = GY_NUMWORD[m[1]] ?? (/^\d+$/.test(m[1]) ? parseInt(m[1], 10) : NaN);
    return Number.isInteger(n) && n > 0 ? { kind: "cardsInHand", atLeast: n, gateOn: "source" } : null;
  }
  if (/^an opponent has no cards in hand$/.test(t)) return { kind: "opponentCardsInHandAtMost", atMost: 0, gateOn: "source" };
  if (/^you have more cards in hand than each opponent$/.test(t)) return { kind: "moreCardsInHandThanEachOpponent", gateOn: "source" };
  // Life totals (printed as digits — 25/30 or more, 10 or less): Divinity of Pride / Serra Ascendant;
  // Ruthless Cullblade / Bloodghast. Pure per-seat life reads.
  m = t.match(/^you have (\d+) or more life$/);
  if (m) { const n = parseInt(m[1], 10); return n > 0 ? { kind: "lifeAtLeast", atLeast: n, gateOn: "source" } : null; }
  m = t.match(/^an opponent has (\d+) or less life$/);
  if (m) { const n = parseInt(m[1], 10); return n > 0 ? { kind: "opponentLifeAtMost", atMost: n, gateOn: "source" } : null; }
  // Opponent graveyard size / poison (exists-quantified over live opponents): Tenured Oilcaster /
  // Jace's Phantasm; Corrupted (Bonepicker Skirge / Apostle of Invasion) / "is poisoned" (Viridian
  // Betrayers — CR 122.1f: a player is "poisoned" if they have one or more poison counters).
  m = t.match(/^an opponent has (\w+) or more cards in their graveyard$/);
  if (m) {
    const n = GY_NUMWORD[m[1]] ?? (/^\d+$/.test(m[1]) ? parseInt(m[1], 10) : NaN);
    return Number.isInteger(n) && n > 0 ? { kind: "opponentGraveyardAtLeast", atLeast: n, gateOn: "source" } : null;
  }
  m = t.match(/^an opponent has (\w+) or more poison counters$/);
  if (m) {
    const n = GY_NUMWORD[m[1]] ?? (/^\d+$/.test(m[1]) ? parseInt(m[1], 10) : NaN);
    return Number.isInteger(n) && n > 0 ? { kind: "opponentPoisonAtLeast", atLeast: n, gateOn: "source" } : null;
  }
  if (/^an opponent is poisoned$/.test(t)) return { kind: "opponentPoisonAtLeast", atLeast: 1, gateOn: "source" };
  // Per-turn ledgers the engine already maintains exactly (each has a single increment chokepoint and the
  // shared per-game-turn reset): spellsCastThisTurn (TRIG-CAST2), lifeGainedThisTurn (LG-1),
  // lifeLostThisTurn, and cardsDrawnThisTurn.
  // ⚠️ THIS COMMENT USED TO SAY "you've drawn N or more cards this turn" HAS NO LEDGER — it was wrong, and
  // it kept 10 cards parked behind a refusal that had stopped being true. `cardsDrawnThisTurn` is a real
  // per-seat counter: incremented at gameState's single draw chokepoint and reset for EVERY seat at untap
  // (resetTurnCounters — all seats, deliberately, because instants let a player draw on someone else's
  // turn). A stale "we can't do this" note is more expensive than no note at all.
  m = t.match(/^you've drawn (\w+) or more cards this turn$/);
  if (m) {
    const n = GY_NUMWORD[m[1]] ?? (/^\d+$/.test(m[1]) ? parseInt(m[1], 10) : NaN);
    return Number.isInteger(n) && n > 0 ? { kind: "cardsDrawnThisTurnAtLeast", atLeast: n, gateOn: "source" } : null;
  }
  m = t.match(/^you've cast (\w+) or more spells this turn$/);
  if (m) {
    const n = GY_NUMWORD[m[1]] ?? (/^\d+$/.test(m[1]) ? parseInt(m[1], 10) : NaN);
    return Number.isInteger(n) && n > 0 ? { kind: "spellsCastThisTurnAtLeast", atLeast: n, gateOn: "source" } : null;
  }
  if (/^you gained life this turn$/.test(t)) return { kind: "gainedLifeThisTurn", gateOn: "source" };
  if (/^you've lost life this turn$/.test(t)) return { kind: "lostLifeThisTurn", gateOn: "source" };
  // Permanent's own entry stamp (perm.enteredOnTurn vs the live turn counter): Crew Captain / Thrasta.
  if (/^it entered this turn$/.test(t)) return { kind: "enteredThisTurn" };
  // Opponent board presence ("an opponent controls a/an <single word>" — Wu Admiral's Island, Night
  // Revelers' Human, Syr Ginger's planeswalker): the same closed type-word vocabulary as the "you
  // control" gate (parseControlGateSource's tail), counted over every live opponent's battlefield.
  m = t.match(/^an opponent controls (?:a|an) ([a-z]+)$/);
  if (m) {
    const g = parseControlGateSource("a", m[1]);
    return g ? { countSpec: { ...g.countSpec, kind: "opponentsControl" }, atLeast: 1, gateOn: "source" } : null;
  }
  // Typed graveyard presence / threshold ("a land card is in your graveyard" — Murasa Behemoth /
  // Windwright Mage; "there are two or more creature cards in your graveyard" — Killmonger): a closed
  // card-TYPE vocabulary maps to the countGraveyardSpec head test; any other single word is admitted only
  // as a real SUBTYPE (Warrior / Desert / Lesson — a word-bounded full-type-line test), with the same
  // supertype/qualifier rejects as the board gate PLUS the defined-characteristic words a type-line test
  // cannot evaluate (historic; color words) — those fail closed (Havi's "historic cards" parks).
  m = t.match(/^there (?:is|are) (?:a|an) ([a-z]+) card in your graveyard$/)
    || t.match(/^(?:a|an) ([a-z]+) card is in your graveyard$/);
  if (m) {
    const spec = graveyardTypeWordSpec(m[1]);
    return spec ? { countSpec: spec, atLeast: 1, gateOn: "source" } : null;
  }
  m = t.match(/^there are (\w+) or more ([a-z]+) cards in your graveyard$/);
  if (m) {
    const n = GY_NUMWORD[m[1]] ?? (/^\d+$/.test(m[1]) ? parseInt(m[1], 10) : NaN);
    const spec = graveyardTypeWordSpec(m[2]);
    return Number.isInteger(n) && n > 0 && spec ? { countSpec: spec, atLeast: n, gateOn: "source" } : null;
  }
  // Empty graveyard (Gorilla Titan "as long as there are no cards in your graveyard"): the zero band.
  if (/^there are no cards in your graveyard$/.test(t)) {
    return { countSpec: { kind: "cardsInGraveyard" }, atLeast: 0, atMost: 0, gateOn: "source" };
  }
  // Untapped-lands zero band (Spur Grappler / Scoria Cat / Vintara Snapper "as long as you control no
  // untapped lands"): the untappedOnly-filtered controller count must be exactly zero.
  if (/^you control no untapped lands$/.test(t)) {
    return { countSpec: { kind: "permanentsYouControl", cardType: "Land", untappedOnly: true }, atLeast: 0, atMost: 0, gateOn: "source" };
  }
  // Self counter-pile presence / absence / totals (extends the CA-1 threshold forms above; all read the
  // subject's OWN pile — countersOnSelf):
  //   "it has a +1/+1 counter on it" (Lightwalker / Chaos Imps) — P/T-counter presence, threshold 1;
  //   the -1/-1 twin (Thunderblust). The counter NAME is the pile key ("+1/+1" / "-1/-1").
  m = t.match(new RegExp(`^(?:${SELF_PERM}|it) has (?:a|an|one) ([+-]1\\/[+-]1) counter on it$`));
  if (m) return { countSpec: { kind: "countersOnSelf", counterType: m[1] }, atLeast: 1, gateOn: "source" };
  //   "this creature has four or more +1/+1 counters on it" (Voice of the Blessed / Vadmir, New Blood) —
  //   the P/T-counter THRESHOLD twin of the CA-1 named-counter threshold above (whose `[a-z]+` counter
  //   word can't spell "+1/+1"). The self block's parseSelfCounterGate only sees the "…as long as it has…"
  //   suffix order, so the prefix order lands here.
  m = t.match(new RegExp(`^(?:${SELF_PERM}|it) has (\\w+) or more ([+-]1\\/[+-]1) counters on it$`));
  if (m) {
    const n = GY_NUMWORD[m[1]] ?? (/^\d+$/.test(m[1]) ? parseInt(m[1], 10) : NaN);
    return Number.isInteger(n) && n > 0 ? { countSpec: { kind: "countersOnSelf", counterType: m[2] }, atLeast: n, gateOn: "source" } : null;
  }
  //   "it has a <name> counter on it" (the Myojin divinity presence; Rhox Pummeler's shield) — a NAMED
  //   pile, threshold 1. Loyalty is a planeswalker resource, not a gate pile → fail closed.
  m = t.match(new RegExp(`^(?:${SELF_PERM}|it) has (?:a|an|one) ([a-z]+) counter on it$`));
  if (m) return m[1] === "loyalty" ? null : { countSpec: { kind: "countersOnSelf", counterType: m[1] }, atLeast: 1, gateOn: "source" };
  //   "it has no <name> counters on it" (Roc Hatchling's shell) — the zero band over a named pile.
  m = t.match(new RegExp(`^(?:${SELF_PERM}|it) has no ([a-z]+) counters on it$`));
  if (m) return { countSpec: { kind: "countersOnSelf", counterType: m[1] }, atLeast: 0, atMost: 0, gateOn: "source" };
  //   "it has three or more counters on it" (Warden of the Inner Sky) — the ALL-KINDS total (counterType
  //   null → gateMet sums every pile).
  m = t.match(new RegExp(`^(?:${SELF_PERM}|it) has (\\w+) or more counters on it$`));
  if (m) {
    const n = GY_NUMWORD[m[1]] ?? (/^\d+$/.test(m[1]) ? parseInt(m[1], 10) : NaN);
    return Number.isInteger(n) && n > 0 ? { countSpec: { kind: "countersOnSelf", counterType: null }, atLeast: n, gateOn: "source" } : null;
  }
  return null; // no exact evaluator → the caller emits nothing (body-only — a safe FN)
}

// BLITZ CA-2 — resolve the single type-word of a typed-graveyard gate ("a <word> card is in your
// graveyard") into a countGraveyardSpec, or null. Closed CARD-TYPE vocabulary first (the head-of-type-line
// test); otherwise the word is admitted as a SUBTYPE (full-type-line word-bounded test) unless it's a
// supertype / qualifier / defined-characteristic word a type-line token test cannot faithfully evaluate
// (historic = artifact ∪ legendary ∪ Saga; color words are characteristics, not type-line tokens) — those
// return null so the clause fails closed (CREED: a gate that can never open is a mis-model, not a FN).
const GY_TYPE_WORDS = new Set(["creature", "artifact", "enchantment", "land", "instant", "sorcery", "planeswalker", "battle"]);
function graveyardTypeWordSpec(word) {
  const w = String(word).toLowerCase();
  if (GY_TYPE_WORDS.has(w)) return { kind: "cardsInGraveyard", cardType: w };
  if (/^(?:legendary|basic|snow|world|ongoing|historic|permanent|token|spell|card|white|blue|black|red|green|colorless|multicolored|monocolored|colored|nonland|noncreature|nontoken|tribal|kindred)$/.test(w)) return null;
  return { kind: "cardsInGraveyard", subtype: w.charAt(0).toUpperCase() + w.slice(1) };
}

/**
 * CONDITION-GATED GROUP ANTHEM emitter (BLITZ CA-1) — the GROUP twin of emitGatedEffect: reduce the anthem's
 * effect text ("gets +X/+Y[ and has|have <kw>[, <kw>…]]" or a bare "have <kw>…") to gated descriptors over a
 * caller-supplied dynamic selector. ALL-OR-NOTHING (CREED): any unconsumed rider, or a non-grantable keyword
 * segment, emits NOTHING (the whole clause stays body-only — never a partial flip). The P/T rides the SAME
 * layer-7c ptModifyGated lane the self control-gates use (CR 613.4c; gateMet re-evaluated every derive); each
 * keyword rides a gated layer-6 addKeyword (CR 613.1f) that keywordSet/permanentHasKeyword resolve through
 * gatePermForEffect, so a gateOn:"source" gate reads the SOURCE at both the P/T and the keyword seams.
 */
function emitGatedGroupEffect(out, effRaw, gate, affects) {
  if (!gate || !affects) return;
  let e = String(effRaw).trim().replace(/\.$/, "");
  let pt = null;
  const ptm = e.match(/^gets? ([+-]\d+)\/([+-]\d+)/);
  if (ptm) { pt = { power: signed(ptm[1]), toughness: signed(ptm[2]) }; e = e.slice(ptm[0].length); }
  e = e.replace(/^\s*(?:,\s*and|,|and)\s+/, "").trim(); // connector between the P/T and the keyword(s)
  const kws = [];
  if (/^(?:has|have)\s/.test(e)) {
    const segs = e.replace(/^(?:has|have)\s+/, "").split(/,|\band\b/).map(s => s.trim().replace(/[^a-z ]/g, "").trim()).filter(Boolean);
    if (segs.length && segs.every(s => GRANTABLE_KEYWORDS.has(s))) { for (const s of segs) kws.push(canonicalKeyword(s)); e = ""; }
  }
  if (e !== "" || (!pt && kws.length === 0)) return; // unconsumed rider, or nothing recognized → body-only (CREED)
  if (pt) out.push({ layer: 7, sublayer: "7c", op: { layerOp: "ptModifyGated", power: pt.power, toughness: pt.toughness, gate }, affects, duration: { kind: "permanent" } });
  for (const kw of kws) out.push({ layer: 6, op: { layerOp: "addKeyword", keyword: kw, gate }, affects, duration: { kind: "permanent" } });
}

// ─── FLASH-CAST-PERMISSION filter vocabulary (CR 601.3e — cast a class of your spells at instant speed) ───
// The CLOSED set of card-TYPE words a flash-cast filter may name — each is a real type-line token, so a
// word-bounded type-line test faithfully decides membership at the cast site. "noncreature"/"colorless" are
// SPECIAL negations handled separately below (not type-line tokens). Nothing else (a supertype, "permanent",
// "spell") is admitted here.
const FLASH_FILTER_CARDTYPES = new Set(["creature", "sorcery", "instant", "artifact", "enchantment", "land", "planeswalker", "battle"]);

/**
 * Parse ONE qualifier phrase of a flash-cast filter (e.g. "green creature", "sorcery", "colorless", "artifact",
 * "spirit", "aura", "historic") into a serializable predicate, or null if it names anything we can't faithfully
 * evaluate against a spell's public characteristics (type line + colors). A qualifier is a space-joined run of
 * words; every word must be one of:
 *   • a color (white/blue/black/red/green) → adds a required color (WUBRG); OR
 *   • a card TYPE in FLASH_FILTER_CARDTYPES → adds a required type-line token; OR
 *   • the special "colorless" → requires the spell has NO colors; OR
 *   • the special "noncreature" → requires the spell's type line has NO "Creature"; OR
 *   • a lone SUBTYPE word (spirit/faerie/merfolk/hero/dragon/ally/aura/equipment/historic/…) → a word-bounded
 *     type-line token. A single unrecognized word is admitted ONLY as a subtype (a proper-noun tribe / spell
 *     type on the type line); combined with any OTHER constraint it would risk an unmodeled compound, so a
 *     subtype may only appear ALONE in its qualifier.
 * Returns { types?:[…], colors?:[…], subtype?, colorless?:true, nonCreature?:true } — ALL listed constraints
 * must hold for the spell to match this qualifier (an AND within the qualifier: "green creature" = green AND
 * Creature). A qualifier mixing a subtype with a type/color, or naming an unknown special, → null.
 */
function parseFlashQualifier(phrase) {
  const words = String(phrase).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const spec = {};
  const subtypeCandidates = [];
  for (const w of words) {
    if (w === "colorless") { spec.colorless = true; continue; }
    if (w === "noncreature") { spec.nonCreature = true; continue; }
    if (COLOR_WORDS[w]) { (spec.colors ||= []).push(COLOR_WORDS[w]); continue; }
    if (FLASH_FILTER_CARDTYPES.has(w)) { (spec.types ||= []).push(w[0].toUpperCase() + w.slice(1)); continue; }
    // "historic" is a defined characteristic (CR 702.149a — artifact / legendary / Saga) that a plain type-line
    // token test can NOT faithfully evaluate (legendary is a supertype; Saga is a subtype; a legendary NON-artifact
    // spell qualifies) → treat as unmodeled so a "historic spells" card (Raff Capashen) stays body-only (safe FN).
    if (w === "historic" || w === "permanent" || w === "legendary") return null;
    // Anything else is a candidate SUBTYPE (a proper-noun tribe or spell type on the type line — Spirit, Faerie,
    // Merfolk, Hero, Dragon, Ally, Aura, Equipment). Only admissible as a SOLE constraint (below).
    subtypeCandidates.push(w);
  }
  if (subtypeCandidates.length > 0) {
    // A subtype must stand ALONE (no color/type/special alongside it) — a mixed "dragon artifact" qualifier is an
    // unmodeled compound → null. A multi-word subtype ("secret lair") is likewise not a single type-line token → null.
    if (subtypeCandidates.length > 1 || spec.types || spec.colors || spec.colorless || spec.nonCreature) return null;
    return { subtype: subtypeCandidates[0][0].toUpperCase() + subtypeCandidates[0].slice(1) };
  }
  // A "colorless"/"noncreature" special may pair with a type ("colorless artifact" is redundant but valid); but a
  // lone unqualified special is fine too. Require at least one constraint.
  if (!spec.types && !spec.colors && !spec.colorless && !spec.nonCreature) return null;
  return spec;
}

/**
 * FLASH-CAST-PERMISSION — parse the FILTER of "You may cast <FILTER> spells as though they had flash" into a
 * serializable spec, or null when any part is not faithfully evaluable (→ the card stays body-only, a safe FN).
 * The empty filter ("" — Vedalken Orrery / Leyline of Anticipation: "cast spells as though they had flash") is
 * the ALL-SPELLS grant → { any: true }. Otherwise the filter is a "<qualifier> and <qualifier> …" list where a
 * spell matches if it satisfies ANY qualifier (the corpus "X and Y spells" wording = an X-spell OR a Y-spell:
 * Sigarda's Aid "Aura and Equipment", Gandalf "legendary spells and artifact" — legendary is unmodeled so that
 * one nulls out). Returns { any:true } | { qualifiers:[{…},…] }. A single unmodeled qualifier → null (whole grant
 * dropped, all-or-nothing per CREED). The subject before "spells" carries a trailing "spells " token when the
 * filter is compound ("aura and equipment spells" → the inner "spells" from "aura spells and equipment"); strip
 * any "spells" token so "legendary spells and artifact" → ["legendary", "artifact"].
 */
// EXPORTED so the TURN-SCOPED twin (effects/atoms/misc.js) builds its spec from the SAME parser. A second
// filter parser would drift, and the drift would be invisible: the permission would apply to a different
// set of spells than the identical printed words do on a permanent.
export function parseFlashCastFilter(filter) {
  const f = String(filter).trim();
  if (f === "") return { any: true };
  // Split the "<q> and <q> …" list; drop a stray "spells" token that rides inside a compound filter.
  const parts = f.split(/,|\band\b/).map((p) => p.replace(/\bspells?\b/g, "").trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const qualifiers = [];
  for (const p of parts) {
    const q = parseFlashQualifier(p);
    if (!q) return null;                 // one unmodeled qualifier → the whole grant is unmodeled (safe FN)
    qualifiers.push(q);
  }
  return { qualifiers };
}

/**
 * Try every supported pattern against one clause; push any descriptor(s) found
 * into `out`. The patterns are intentionally narrow and ordered most-specific
 * first so a tribal/color anthem doesn't also match the generic anthem.
 * `selfName` (the card's name, optional) is threaded only so the EMINENCE
 * cost-reducer can stamp `sourceName` for its excludeSelf ("other ~ spells") guard.
 * `selfType` (the card's type line, optional) is threaded only so the COUNTER-GATED
 * TYPE-CHANGE (Arixmethes) knows whether the source is a printed Creature (→ pair the
 * "it's a land" grant with the implied "not a creature" removal).
 */
// COLORED-PIP COST-REDUCTION (CR 601.2f) — "{W}{B}" → { W: 1, B: 1 }. Repeats accumulate ("{R}{R}" → 2),
// which no printed card does today but costs nothing to get right.
function parseColorPips(str) {
  const out = {};
  for (const m of String(str || "").matchAll(/\{([wubrg])\}/gi)) { const col = m[1].toUpperCase(); out[col] = (out[col] || 0) + 1; }
  return out;
}

/**
 * The pip-shaped twin of costReductionForSpell. Returns a per-color map of pips to subtract from the
 * spell's COLORED columns (never from generic — that is the whole distinction, CR 601.2f). `{}` when no
 * pip reducer matches, so the cast site can skip the work entirely in the common case.
 *
 * Filter semantics are IDENTICAL to costReductionForSpell's — the same subtype word-bound type-line test
 * and the same chosenType pairing — because the two run over the same reducer list and disagreeing about
 * which spells match would be a drift bug that only shows up on one card.
 */
export function coloredPipReductionForSpell(reducers, spellCard) {
  if (!reducers?.length || !spellCard) return {};
  const typeLine = String(spellCard?.type || spellCard?.type_line || "").toLowerCase();
  const spellName = spellCard?.name;
  const out = {};
  for (const r of reducers) {
    if (!r.pips) continue;
    if (r.excludeSelf && r.sourceName && spellName && r.sourceName === spellName) continue;
    if (r.subtype) {
      if (!typeLine) continue;
      const sub = String(r.subtype).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!sub || !new RegExp(`\\b${sub}\\b`).test(typeLine)) continue;
    } else if (r.chosenType) {
      if (!spellHasChosenType(spellCard, r.sourceChosenType)) continue;
    } else {
      continue; // an unfiltered pip reducer is not a shape any printed card has — never apply one blind
    }
    for (const [color, n] of Object.entries(r.pips)) out[color] = (out[color] || 0) + n;
  }
  return out;
}

function parseClause(clause, out, selfName, selfType) {
  // Strip flavor ability-word labels (CR 207.2c — they carry no rules meaning).
  // Metalcraft/Threshold/Delirium appear on STATIC clauses; the GY path re-strips
  // Threshold/Delirium below (no-op after this) for clarity. "Unlock Ability" is the
  // FF set's CR 207.2c ability word on Sphere Grid's static ("Unlock Ability — Creatures
  // you control with +1/+1 counters on them have reach and trample.") — pure flavor (the
  // ruling refers to "Sphere Grid's last ability"; the static is unconditional, the label
  // is not a functional gate), so stripping it lets the bare static match. Enumerated (not
  // an open-ended "<Word> —" strip) for the same reason the trigger-side strip is: a blanket
  // strip would mis-normalize the 337 real ability-word labels that carry conditions.
  // BLITZ CA-2 adds Hellbent ("Hellbent — … as long as you have no cards in hand", Demon's Jester),
  // Corrupted ("Corrupted — … as long as an opponent has three or more poison counters", Bonepicker
  // Skirge) and Infusion ("Infusion — … as long as you gained life this turn", Tenured Concocter) — like
  // every CR 207.2c ability word, the CONDITION is always restated in the rules text that follows, so
  // the label itself is pure flavor and stripping it is universally safe.
  // "The Will of the Hive Mind" (Winged Hive Tyrant) — CR 207.2c flavor over the SAME counter-gated group
  // keyword shape as "Unlock Ability" above ("…Other creatures you control with counters on them have
  // flying and haste."); pure label, the static itself is unconditional. Verified against the bundled
  // oracle text, not guessed.
  const c = clause.toLowerCase().replace(/^(?:metalcraft|threshold|delirium|hellbent|corrupted|infusion|unlock ability|the will of the hive mind)\s*[—–-]\s*/, "");

  // ── FLASH-CAST-PERMISSION (Yeva; Vedalken Orrery; Leyline of Anticipation; Prophet of Kruphix; …) ──────
  // "You may cast <FILTER> spells as though they had flash." A STATIC casting-permission (CR 601.3e / 702.8f
  // — a static ability that lets the controller cast a class of THEIR OWN spells at instant speed). Emitted
  // as a coverage MARKER ({ castFlashPermission } with NO `affects`/`op`, so the layer engine ignores it —
  // effectAffects bails on a missing `affects`); legalChoices reads it at the cast timing gate
  // (flashPermissionSpecsFor / spellMatchesFlashFilter) so a matching sorcery-speed spell is offered at
  // instant speed while the source is on the battlefield. SELF-CONTROLLER ONLY ("You may cast …"): the
  // symmetric "Any player may cast …" / "Players may cast …" (Tidal Barracuda, Vernal Equinox, Quick Sliver)
  // grants the permission to OPPONENTS too, which the controller-only cast reader doesn't model → dropping
  // that half would be a CREED false positive → those stay body-only (a safe FN). "this spell" (an Aura / a
  // conditional self-cast — Necromancy, Harbinger of the Tides) is NOT a board static and never matches the
  // "<FILTER> spells" shape. The FILTER must reduce to a FULLY-EVALUABLE spec (parseFlashCastFilter — a
  // closed vocabulary of card types / colors / the noncreature+colorless specials / a single subtype, with
  // "X and Y" unions); an unmodeled filter → NO descriptor → the card stays body-only (Arbiter, never a
  // fabricated timing grant). Anchored ^…$ so any rider variant ("… if you pay {2} more", "… this turn")
  // never matches. The STATIC-ONLY guard below never fires on this shape (no trigger/activated/for-each/
  // as-long-as marker), but matching here first keeps it away from the cost-reduction / anthem matchers.
  const flashM = c.match(/^you may cast (.*?)spells as though they had flash$/);
  if (flashM) {
    const spec = parseFlashCastFilter(flashM[1].trim());
    if (spec) out.push({ castFlashPermission: spec });
    return; // a flash-cast-permission clause — handled (or intentionally dropped to body-only on an unmodeled filter)
  }

  // ── DIES-TRIGGER MULTIPLIER (Teysa Karlov) ─────────────────────────────────────────────────────────
  // "If a creature dying causes a triggered ability of a permanent you control to trigger, that ability
  // triggers an additional time." A rule-modifying STATIC (CR 603.x — it changes HOW MANY TIMES a
  // creature-death-caused triggered ability fires, like Panharmonicon does for ETB), NOT a layer-6/7 grant.
  // Emitted as a self-affecting continuous effect carrying op.layerOp:"diesTriggerMultiplier" so
  // collectContinuousEffects picks it up while the source is on the battlefield; layers.diesTriggerMultiplierCount
  // counts these per controller, and checkDiesTriggers / checkSacrificeTriggers (triggers.js) enqueue each
  // creature-death-caused trigger one ADDITIONAL time per multiplier the trigger's controller has. affects:self
  // (no candidate is buffed — the effect scopes to its controller, resolved from the source permanent), so the
  // P/T-and-keyword layer engine treats it as an inert board static (effectAffects.self matches only the source,
  // and no layer-6/7 op reads it). Anchored to the exact printed clause — no variant of this sentence exists.
  if (/^if a creature dying causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time$/.test(c)) {
    out.push({
      layer: 6,
      op: { layerOp: "diesTriggerMultiplier" },
      affects: { mode: "self" },
      duration: { kind: "permanent" },
    });
    return; // handled — a modeled rule-modifying static (the coverage residue check credits it via `produced.length`)
  }

  // ── ATTACK-TRIGGER MULTIPLIER (Isshin, Two Heavens as One #1456) ──────────────────────────────────
  // "If a creature attacking causes a triggered ability of a permanent you control to trigger, that
  // ability triggers an additional time." Teysa Karlov's twin — the SAME rule-modifying shape, one word
  // apart on the card ("dying" → "attacking") and one layerOp apart here. Emitted the same way (a
  // self-affecting continuous effect, inert in the P/T + keyword layers), counted by
  // layers.attackTriggerMultiplierCount, and applied at the attack-trigger enqueue site.
  //
  // The subject is a creature ATTACKING, not a creature YOU control attacking: an opponent's attack that
  // fires your "whenever a creature attacks you" permanent doubles too. That falls out correctly because
  // the multiplier keys on the ABILITY's controller, not the attacker's.
  if (/^if a creature attacking causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time$/.test(c)) {
    out.push({
      layer: 6,
      op: { layerOp: "attackTriggerMultiplier" },
      affects: { mode: "self" },
      duration: { kind: "permanent" },
    });
    return; // handled — a modeled rule-modifying static
  }

  // ── ENTERS-TRIGGER MULTIPLIER (Panharmonicon #261, Yarok #2530, Ancient Greenwarden #681) ──────────
  // "If <filter> entering [the battlefield] causes a triggered ability of a permanent you control to
  // trigger, that ability triggers an additional time." The third member of the multiplier family, and
  // the first that needs a FILTER on the entering object — Panharmonicon doubles an artifact or creature
  // entering, Greenwarden a land, Yarok anything. Carried on the op so the counter can test the entering
  // card at fire time; the layer engine ignores the op either way (the diesTriggerMultiplier precedent).
  //
  // Both printed spellings of the event are accepted ("entering" and "entering the battlefield") — they
  // are the same event, only the templating era differs. A CONTROLLER-qualified or SUBTYPE filter
  // ("a Wizard you control" — Naban; "a land or Bird you control" — Traveling Chocobo) is NOT claimed:
  // those need a controller/subtype read this filter set doesn't carry, and doubling on the wrong entry
  // is a forbidden FP. They stay body-only.
  // ── CAST-TRIGGER MULTIPLIER (Veyran, Voice of Duality #1487) ──────────────────────────────────────
  // "If you casting or copying an instant or sorcery spell causes a triggered ability of a permanent you
  // control to trigger, that ability triggers an additional time." The FOURTH member of the multiplier
  // family and one word apart from Isshin's on the card ("a creature attacking" → "you casting or copying
  // an instant or sorcery spell"): same rule-modifying shape, same self-affecting continuous effect, same
  // inertness in the P/T + keyword layers, counted by layers.castTriggerMultiplierCount and applied at
  // the CAST-trigger enqueue site.
  //
  // ⛔ THE SCOPE IS THE SITE, exactly as it is for the other three. This op is consulted ONLY where cast
  // triggers are enqueued (checkCastTriggers), so it can never double a dies / attack / ETB trigger — the
  // card's "causes a triggered ability … to trigger" is scoped by WHAT CAUSED IT, and the enqueue site is
  // precisely that fact. Whole-sentence anchored: the subject must be the exact printed one, so a
  // narrower or wider variant stays unclaimed rather than doubling the wrong event (a doubled trigger the
  // card doesn't grant is a forbidden FP, and it is invisible to a P/T-shaped gate).
  if (/^if you casting or copying an instant or sorcery spell causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time$/.test(c)) {
    out.push({
      layer: 6,
      op: { layerOp: "castTriggerMultiplier" },
      affects: { mode: "self" },
      duration: { kind: "permanent" },
    });
    return; // handled — a modeled rule-modifying static
  }

  const etbMultM = c.match(/^if (a permanent|an artifact or creature|a creature|an artifact|a land) entering(?: the battlefield)? causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time$/);
  if (etbMultM) {
    out.push({
      layer: 6,
      op: { layerOp: "etbTriggerMultiplier", entering: etbMultM[1].replace(/^an? /, "") },
      affects: { mode: "self" },
      duration: { kind: "permanent" },
    });
    return; // handled — a modeled rule-modifying static
  }

  // ── ASSIGNS-COMBAT-DAMAGE-BY-TOUGHNESS (BLITZ DN-1 — Doran, the Siege Tower; Belligerent Brontodon;
  //    Ancient Lumberknot) ────────────────────────────────────────────────────────────────────────────
  // "<subject> assigns combat damage equal to its toughness rather than its power" (modifies CR 510.1a —
  // combat damage is otherwise assigned equal to POWER) — a rule-modifying STATIC that changes the AMOUNT of
  // combat damage a creature assigns (its LAYER-AWARE effective toughness in place of its power), NOT a
  // layer-6/7 P/T or keyword grant. Emitted as a
  // continuous effect carrying op.layerOp:"assignsCombatDamageWithToughness"; collectContinuousEffects picks
  // it up while the source is on the battlefield and combatResolution.resolveCombatDamage reads
  // layers.assignsCombatDamageWithToughness(state, id) at the damage-amount site, substituting
  // creatureToughness for creaturePower for every affected dealing creature. The op is INERT in the layer
  // engine (l6IndexOf skips any op whose layerOp isn't add/removeKeyword/Protection/Ward — the exact
  // diesTriggerMultiplier precedent), so P/T + keyword derivation are byte-identical.
  //
  // ONLY the UNCONDITIONAL board-static scopes flip: GLOBAL ("each creature"), CONTROLLER ("each creature
  // you control" / plural "creatures you control … assign …"), a per-creature TOUGHNESS>POWER predicate
  // ("… with toughness greater than its power …"), and SELF ("this creature"). PARKED as residue → body-only
  // (a safe FN): the "during your turn" gated form (Baldin), the "… and can attack as though it didn't have
  // defender" / "with defender" compounds (Arcades/High Alert/Felothar), the ATTACHED "enchanted/equipped
  // creature …" grants (the parseAttachedClause path, not this splitter), and the TEMPORARY "target creature
  // … this turn" activated/triggered grants — none is an unconditional board static, so none is matched here.
  // ⭐ PLAYER HEXPROOF (CR 702.11d) — "You have hexproof." Leyline of Sanctity, Witchbane Orb, Aegis of the
  // Gods, Orbs of Warding, Metropolis Reformer, Keen-Eared Sentry, Spirit of the Hearth, Crystal Barricade.
  // The FIRST player-scoped static in the engine: every continuous effect before this affected a PERMANENT,
  // so this family had nowhere to live and parked wholesale.
  // ⛔ EMITTED AS AN INERT LAYER-6 OP, the assignsCombatDamageWithToughness pattern directly below. The layer
  // engine skips it entirely (l6IndexOf only processes add/removeKeyword/Protection/Ward), so P/T and keyword
  // derivation are byte-identical; ONE consumer reads it — layers.playerHasHexproof, called from the single
  // target-enumeration seam. Inventing a player-affects mode instead would have forced every collector and
  // selector in the file to learn a scope they have no use for.
  // ⓘ `affects: self` is the SOURCE permanent, and the reader resolves the grant to that permanent's
  // CONTROLLER — the op never affects the permanent it rides on.
  // ⛔ WHOLE-CLAUSE ANCHORED. "You have hexproof from black" / "you have hexproof as long as …" are NOT this
  // (a qualified or conditional grant), and "target player gains hexproof until end of turn" is a one-shot
  // the spell path owns. Any of those leaves residue → the card stays body-only (a safe FN).
  // ⭐ LEGEND-RULE EXEMPTION (CR 704.5j) — Mirror Gallery, Mirror Box, Council of Reeds, Cadric Soul Kindler.
  // ⛔⛔ THESE CARDS DID NOTHING. `sba.js` enforces the legend rule, but nothing ever read the exemption, so
  // MIRROR GALLERY — whose ENTIRE printed text is "The 'legend rule' doesn't apply." — was an inert 5-mana
  // artifact. The fourth expired-refusal bug from the same sweep, and cloneCopy.js still carried the note
  // that caused it ("the legend rule is UNENFORCED by the engine ... a harmless inert line").
  // ⓘ Same INERT layer-6 op the player-scoped statics use (playerHexproof / cantGainLife): the layer engine
  // skips it, and exactly one consumer — gameState.applyLegendRule — reads it.
  // ⛔ THE SCOPE IS CAPTURED, NOT FLATTENED. "doesn't apply" (global, every player) and "doesn't apply to
  // <X> you control" are different cards; collapsing them would hand a controller a global exemption they
  // never paid for. A subtype-scoped form ("to Spiders you control" — Spider-Verse) is NOT matched and
  // parks: it needs a subtype test this op doesn't carry, and guessing would over-exempt.
  {
    const lr = c.match(/^the "legend rule" doesn't apply(?: to (permanents|creatures|tokens) you control)?$/);
    if (lr) {
      out.push({ layer: 6, op: { layerOp: "legendRuleOff", scope: lr[1] ? `${lr[1]}YouControl` : "all" }, affects: { mode: "self" }, duration: { kind: "permanent" } });
      return;
    }
  }
  // ⭐ MAXIMUM HAND SIZE, SELF-SCOPED (CR 402.2): "Your maximum hand size is two." (Null Profusion,
  // Recycle, Doctor Octopus) and the delta forms "increased by N" / "reduced by N" (Trusted Advisor,
  // Minamo Scrollkeeper, Thought Eater).
  // ⛔⛔ THE BUG THIS FIXES IS NOT THE PARK — IT IS A GLOBAL FAIL-OPEN. gameEngine.cleanupDiscardExcess
  // suspends the cleanup discard for EVERY PLAYER the moment ANY permanent anywhere prints "maximum hand
  // size" text it can't read. So a single Cursed Rack handed its OWN controller an unlimited hand for the
  // rest of the game. Modelling the self-scoped forms lets that suspension narrow to the shapes that really
  // are unreadable.
  // ⓘ Same INERT layer-6 op as playerHexproof / cantGainLife / legendRuleOff: the layer engine skips it and
  // one consumer reads it.
  // ⛔ SELF-SCOPED ONLY. "The chosen player's …" (Cursed Rack) and "Each opponent's …" (Locust Miser) target
  // someone else and need a chosen-player/opponent binding this op does not carry; they still park AND
  // still suspend, which is the honest fail-open for a number the engine can't place.
  {
    const mh = c.match(MODELLED_MAX_HAND_RE);
    if (mh) {
      const n = _ENTER_NUM[mh[2]] ?? (/^\d+$/.test(mh[2]) ? parseInt(mh[2], 10) : NaN);
      if (Number.isInteger(n)) {
        const op = mh[1] ? { layerOp: "maxHandSize", mode: "delta", n: mh[1] === "reduced" ? -n : n } : { layerOp: "maxHandSize", mode: "set", n };
        out.push({ layer: 6, op, affects: { mode: "self" }, duration: { kind: "permanent" } });
        return;
      }
    }
  }
  // ⭐ CAN'T-LOSE / CAN'T-WIN (CR 104.3a/104.2a) — Platinum Angel, Herald of Eternal Dawn, Darksteel Angel,
  // Lich's Mastery, Platinum Persecutor, and the DRAWBACK side, Abyssal Persecutor.
  // ⛔⛔ PLATINUM ANGEL DID NOTHING. learnSession.isPlayerDead enforces losing (life ≤ 0, poison ≥ 10,
  // commander damage ≥ 21) and hasWonGame enforces winning, but NOTHING read the exemption — so the most
  // iconic "you can't lose" card in the game was an 7-mana 4/4 flier. Abyssal Persecutor is the mirror and
  // is worse than inert: its whole DRAWBACK was missing, so the engine let its controller win outright.
  // ⓘ Sixth find from the runtime-refusal sweep, same shape every time: a rule the engine DOES enforce
  // whose off-switch was never modelled. Same INERT layer-6 op as playerHexproof / legendRuleOff.
  // ⛔ THE SUBJECT IS CAPTURED PER-CLAUSE, never assumed. "You can't lose" and "your opponents can't lose"
  // are opposite cards; Abyssal Persecutor prints BOTH halves inverted relative to Platinum Angel, so a
  // parser that assumed "you = good" would hand its controller a win it must never get.
  {
    const half = (txt) => {
      const m = String(txt).trim().match(/^(you|your opponents|players) can'?t (lose|win) the game$/);
      if (!m) return null;
      return { layerOp: m[2] === "lose" ? "cantLoseGame" : "cantWinGame", who: m[1] === "players" ? "all" : m[1] === "you" ? "you" : "opponents" };
    };
    // "Players can't lose the game or win the game." — one sentence, both rules, every player.
    if (/^players can'?t lose the game or win the game$/.test(c)) {
      out.push({ layer: 6, op: { layerOp: "cantLoseGame", who: "all" }, affects: { mode: "self" }, duration: { kind: "permanent" } });
      out.push({ layer: 6, op: { layerOp: "cantWinGame", who: "all" }, affects: { mode: "self" }, duration: { kind: "permanent" } });
      return;
    }
    const parts = c.split(/\s+and\s+/);
    const ops = parts.map(half);
    if (ops.length && ops.every(Boolean)) {
      for (const op of ops) out.push({ layer: 6, op, affects: { mode: "self" }, duration: { kind: "permanent" } });
      return;
    }
  }
  if (/^you have hexproof$/.test(c)) {
    out.push({ layer: 6, op: { layerOp: "playerHexproof" }, affects: { mode: "self" }, duration: { kind: "permanent" } });
    return;
  }
  // ⭐ CAN'T-GAIN-LIFE (CR 614 prevention) — the second player-scoped static, same inert-op shape.
  // ⛔ THE SYMMETRIC FORM IS SYMMETRIC ON PURPOSE. "Players can't gain life" stops the CONTROLLER too
  // (Rampaging Ferocidon, Forsaken Wastes, Havoc Festival); reading it as opponents-only would hand its
  // controller a one-sided prison the card does not print — a false positive in the player's favour, which
  // is still a false positive. The two printed scopes are captured explicitly rather than conflated.
  // ⓘ Enforced in replacementEffects.applyLifeGainReplacement, which gameState.gainLife applies at the
  // single life-gain chokepoint — so spell, trigger, lifelink and drain are all covered by one check.
  {
    const cgl = c.match(/^(players|each player|your opponents|each opponent|opponents) can't gain life$/);
    if (cgl) {
      const scope = /player/.test(cgl[1]) ? "all" : "opponents";
      out.push({ layer: 6, op: { layerOp: "cantGainLife", scope }, affects: { mode: "self" }, duration: { kind: "permanent" } });
      return;
    }
  }
  {
    const TAIL = "assigns? combat damage equal to (?:its|their) toughness rather than (?:its|their) power";
    if (new RegExp(`^each creature ${TAIL}$`).test(c)) {
      out.push({ layer: 6, op: { layerOp: "assignsCombatDamageWithToughness" }, affects: { mode: "dynamic", selector: { cardTypes: ["Creature"] } }, duration: { kind: "permanent" } });
      return;
    }
    if (new RegExp(`^(?:each creature you control|creatures you control) ${TAIL}$`).test(c)) {
      out.push({ layer: 6, op: { layerOp: "assignsCombatDamageWithToughness" }, affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"] } }, duration: { kind: "permanent" } });
      return;
    }
    if (new RegExp(`^(?:each creature you control|creatures you control) with toughness greater than (?:its|their) power ${TAIL}$`).test(c)) {
      out.push({ layer: 6, op: { layerOp: "assignsCombatDamageWithToughness" }, affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"], toughnessGreaterThanPower: true } }, duration: { kind: "permanent" } });
      return;
    }
    if (new RegExp(`^this creature ${TAIL}$`).test(c)) {
      out.push({ layer: 6, op: { layerOp: "assignsCombatDamageWithToughness" }, affects: { mode: "self" }, duration: { kind: "permanent" } });
      return;
    }
  }

  // ── STATIC-COST-REDUCTION (Dragonspeaker Shaman → The Ur-Dragon; Gargos → Zaxara) ──────────────────
  // "<Subtype> spells you cast cost {N} less to cast" reduces the GENERIC portion of the matching spell's
  // cost (CR 601.2f — effects may reduce the cost to pay), floored at {0} when the cost is applied at the
  // cast site; the spell's mana value is UNCHANGED (CR 202.3 — MV is the printed mana cost). Emitted as a
  // coverage MARKER descriptor with NO `affects`/`op`, so the layer engine ignores it entirely
  // (layers.effectAffects bails on a missing `affects`); legalChoices reads it at the cast site via
  // collectCostReducers / costReductionForSpell. SUBTYPE-FILTERED ONLY: a color ("Red spells" — Ruby
  // Medallion), a negated/category word ("Noncreature"), a card type (Artifact/Enchantment), or a
  // supertype (Legendary) is EXCLUDED — its word-bound type-line match would never fire, so claiming the
  // card native while it never reduces is a false positive. Those (and chosen-type / colored / compound
  // "X and Y spells" reducers) stay body-only as a safe false-negative. "you cast" is optional (a rare
  // symmetric reducer under-applies to opponents — still safe). The subject before "spells" is always
  // singular, so normalizeSubtype just canonicalizes case ("dragon" → "Dragon").
  // ── COLORED-PIP COST-REDUCTION (CR 601.2f) — Edgewalker "{W}{B}", Ragemonger "{B}{R}", Nekrataal Avatar
  // "{B}", Morophon "{W}{U}{B}{R}{G}" ────────────────────────────────────────────────────────────────────
  // These reduce COLORED pips, not generic: Edgewalker makes a {1}{W} Cleric cost {1}, NOT {W}. Every
  // reducer above this point returns a scalar that the cast site subtracts from `generic`, which is why the
  // whole family was left body-only — routing them through that channel would shave the WRONG part of the
  // cost and usually make the spell far too cheap (Morophon at 5 generic off a {4}{R}{R} Dragon leaves
  // {R}{R}; the printed card leaves {4}{R}). So the descriptor carries a per-color `pips` map and the cast
  // site subtracts it from the coloured columns, flooring each at 0 (CR 601.2f); MV is untouched (CR 202.3).
  //
  // The SUBTYPE arm reuses the same word-vetting guard as the generic reducer directly below — an unvetted
  // word would match no type line, so the card would classify native while never reducing.
  const pipCrM = c.match(/^([a-z]+) spells (?:you cast )?cost ((?:\{[wubrg]\})+) less to cast$/i);
  if (pipCrM) {
    const word = pipCrM[1];
    if (COST_REDUCTION_CARDTYPE_WORDS.has(word) ||
        (!NON_SUBTYPE_ANTHEM_WORDS.has(word) && !COLOR_WORDS[word] && !NON_SUBTYPE_COST_FILTER_WORDS.has(word))) {
      out.push({ costReduction: { subtype: normalizeSubtype(word), pips: parseColorPips(pipCrM[2]) } });
    }
    return; // handled (or intentionally dropped to body-only, same terms as the generic arm)
  }
  // MOROPHON — "Spells of the chosen type you cast cost {W}{U}{B}{R}{G} less to cast." The generic
  // chosen-type reducer further down requires a "Creature spells" lead so Cloud Key's CARD-type chooser
  // can't match it; Morophon prints the bare "Spells" lead, and no other corpus card uses this wording
  // (measured: 1 card here, 0 on the generic "Spells of the chosen type" form).
  //
  // ⛔ THE CHOOSER GUARD IS STRUCTURAL, NOT RESTATED HERE — deliberately. parseClause receives the card's
  // TYPE LINE, not its oracle, so it cannot check for the chooser. It does not need to: the reduction only
  // ever fires against a SOURCE permanent's stored `chosenType` (CR 614.12 — set by the modelled
  // "choose a creature type" ETB, resolvers.autoPickCreatureType). A card carrying this reducer WITHOUT a
  // modelled chooser still has that chooser line as unmatched residue, so it parks there instead — the
  // classifier never credits it. Pinned in morophonPipCostReduction.test.js rather than argued.
  const pipChosenM = c.match(/^spells of the chosen type you cast cost ((?:\{[wubrg]\})+) less to cast$/i);
  if (pipChosenM) {
    out.push({ costReduction: { chosenType: true, pips: parseColorPips(pipChosenM[1]) } });
    return;
  }
  // ⭐ TWO-SUBTYPE UNION (the Banneret cycle — "Elemental spells and Warrior spells you cast cost {1}
  // less to cast": Brighthearth / Ballyrush / Frogtosser / Stonybrook / Bosk). A spell matching EITHER
  // subtype is reduced, and the reduction applies ONCE (the runtime union below, not two stacked
  // reducers — a Goblin Rogue must not get {2} off a card that says {1}).
  //
  // Placed BEFORE the single-word arm: its `[a-z]+` anchor cannot match this shape, but ordering it
  // first keeps the intent explicit rather than relying on that.
  const crUnionM = c.match(/^([a-z]+) spells and ([a-z]+) spells (?:you cast )?cost \{(\d+)\} less to cast$/);
  if (crUnionM) {
    const ok = (w) => COST_REDUCTION_CARDTYPE_WORDS.has(w)
      || (!NON_SUBTYPE_ANTHEM_WORDS.has(w) && !COLOR_WORDS[w] && !NON_SUBTYPE_COST_FILTER_WORDS.has(w));
    // BOTH words must be admissible — a union is only as safe as its weaker half, and a half that can
    // never match would silently make the reducer narrower than printed.
    if (ok(crUnionM[1]) && ok(crUnionM[2])) {
      out.push({ costReduction: { subtypes: [normalizeSubtype(crUnionM[1]), normalizeSubtype(crUnionM[2])], amount: parseInt(crUnionM[3], 10) } });
      return;
    }
    // ⛔ FALL THROUGH when the guard rejects — do NOT consume the clause. The first cut returned
    // unconditionally and REGRESSED the Familiar cycle (Nightscape/Stormscape/Sunscape/Thornscape/
    // Thunderscape: "Blue spells and red spells you cast cost {1} less"), whose words are COLOURS and are
    // therefore rejected by ok() — but which a LATER arm already handles natively. A widening must be gated
    // behind the prior paths' failure; swallowing the clause on rejection inverts that and silently narrows
    // the engine. Caught by the flip-diff's LOST column, which is exactly what it is for.
  }
  // ⭐ NEGATED CARD TYPE — "Noncreature spells you cast cost {1} less to cast" (Longshot, Rebel Bowman;
  // Valeria Richards; Iron Lad). `noncreature` sits in NON_SUBTYPE_COST_FILTER_WORDS, and that exclusion's
  // own comment states the reason as a CAPABILITY gap, not a rules objection: "A word-bound type-line
  // match for these would NEVER fire, so claiming the reducer native while it silently reduces nothing is
  // a CREED false positive." Exactly right — so this emits a real NEGATION predicate (notCardType) rather
  // than a word scan, and the word stays excluded from the scan-based arm below.
  const crNegM = c.match(/^non(creature|artifact|enchantment|land) spells (?:you cast )?cost \{(\d+)\} less to cast$/);
  if (crNegM) {
    out.push({ costReduction: { notCardType: crNegM[1], amount: parseInt(crNegM[2], 10) } });
    return;
  }
  const crM = c.match(/^([a-z]+) spells (?:you cast )?cost \{(\d+)\} less to cast$/);
  if (crM) {
    const word = crM[1];
    // A card-TYPE reducer (Foundry Inspector "Artifact …", Marauding Raptor "Creature …") reduces via the
    // type-line match, so it's allowed even though card-type words are blocked on the anthem path. A real
    // creature/spell subtype (Dragon/Hydra/Goblin) still passes the original guard; a supertype /
    // non-type-line word stays body-only.
    if (COST_REDUCTION_CARDTYPE_WORDS.has(word) ||
        (!NON_SUBTYPE_ANTHEM_WORDS.has(word) && !COLOR_WORDS[word] && !NON_SUBTYPE_COST_FILTER_WORDS.has(word))) {
      out.push({ costReduction: { subtype: normalizeSubtype(word), amount: parseInt(crM[2], 10) } });
    } else if (COLOR_WORDS[word]) {
      // COLOR-COST-REDUCTION (single color — "Red spells you cast cost {1} less", Ruby Medallion): no longer a
      // safe-FN drop — emitted as a color reducer keyed on WUBRG (costReductionForSpell tests the spell's
      // colors). The "you cast" form only is matched here (a "you cast"-less symmetric color reducer is rarer
      // and stays body-only). A non-color excluded word (supertype/noncreature/permanent) still drops to body-only.
      if (/\byou cast\b/.test(crM[0])) out.push({ costReduction: { colors: [COLOR_WORDS[word]], amount: parseInt(crM[2], 10) } });
    }
    return; // a cost-reduction clause — handled (or intentionally dropped to body-only)
  }
  // STATIC-COST-TAX (CR 601.2f — the INCREASE twin of the reducer above): "[<filter> ]spells [your
  // opponents cast ]cost {N} more to cast". Modeled filters: bare (Sphere of Resistance — every spell),
  // "noncreature" (Thalia, Guardian of Thraben / Thorn of Amethyst / Vryn Wingmare — a NEGATED type-line
  // check, modelable here even though the reducer path can't use it as a positive token), a card TYPE
  // (artifact/creature/enchantment/instant/sorcery — word-bound type-line match), or a true SUBTYPE.
  // "your opponents cast" scopes the tax to casters other than the source's controller (stamped at
  // collection). DELIBERATELY UNMODELED (clause stays body-only, safe FN): color filters, supertypes,
  // "for each …" dynamic amounts, "spells that target …", per-turn ("first spell"), and activated-ability
  // taxes — each needs machinery this recognizer can't honestly claim.
  const ctxM = c.match(/^(?:([a-z]+) )?spells (your opponents cast )?cost \{(\d+)\} more to cast$/);
  if (ctxM) {
    const word = ctxM[1] || null;
    const oppOnly = !!ctxM[2];
    const amount = parseInt(ctxM[3], 10);
    const negM = word && word.match(/^non(creature|artifact|enchantment|instant|sorcery)$/);
    if (!word) out.push({ costTax: { amount, oppOnly } });
    else if (negM) out.push({ costTax: { amount, oppOnly, notCardType: negM[1] } }); // Thalia "noncreature", Lodestone Golem "nonartifact" — a NEGATED word-bound type-line check
    else if (COST_REDUCTION_CARDTYPE_WORDS.has(word)) out.push({ costTax: { amount, oppOnly, cardType: normalizeSubtype(word) } });
    else if (!/^non/.test(word) && !NON_SUBTYPE_ANTHEM_WORDS.has(word) && !COLOR_WORDS[word] && !NON_SUBTYPE_COST_FILTER_WORDS.has(word)) out.push({ costTax: { amount, oppOnly, subtype: normalizeSubtype(word) } });
    // else: a color / supertype / category / unmodeled "non…" word → intentionally dropped (body-only —
    // a "non<X>" that fell through to the subtype branch would mint a filter matching NO type line: a tax
    // that never fires while the card claims native, the exact runtime-vacuous FP this guard exists for
    // (caught live on Lodestone Golem before ship).
    return; // a cost-tax clause — handled (or intentionally dropped to body-only)
  }

  // ── EMINENCE COST-REDUCTION (The Ur-Dragon; Efteekay, Flame of the Kav) ─────────────────────────────
  // "Eminence — As long as <this> is in the command zone or on the battlefield, other <Subtype> spells you
  // cast cost {N} less to cast." EMINENCE is an ABILITY WORD (CR 207.2c — italic, no rules meaning); the
  // reach-from-the-command-zone is the clause's OWN literal text, not a keyword rule. Per CR 113.6 a
  // permanent's abilities normally function only on the battlefield "except as [the ability's] wording
  // specifies" — and this wording specifies the command zone, the normal commander pattern. Same
  // { costReduction } marker + cost math as the base shape above (CR 601.2f reduces the cost to pay; CR
  // 202.3 leaves the mana value untouched), plus three runtime flags:
  //   • fromCommandZone — legalChoices ALSO scans the command zone for these (a commander usually sits there).
  //   • excludeSelf + sourceName — the literal "OTHER" Dragon spells: it must NOT shave the source's own cast.
  //     Without this, casting The Ur-Dragon (a Dragon) from the command zone would wrongly get {1} off — a
  //     false positive. costReductionForSpell skips a reducer whose sourceName === the spell being cast.
  // The self-reference is `.+` (not a fixed "this creature") because selfNormalizeOracle only rewrites a
  // card's FULL name (Efteekay's text uses the bare "Efteekay", which stays). SUBTYPE-ONLY, same filter as
  // the base shape — a color/type/supertype word is excluded as a safe false-negative. "other playtest cards
  // you cast" (The Unknown Wizard) has no "<subtype> spells" and never matches.
  const emM = c.match(/^eminence\s*[—–-]\s*as long as .+ is in the command zone or on the battlefield, other ([a-z]+) spells you cast cost \{(\d+)\} less to cast$/);
  if (emM) {
    const word = emM[1];
    // Same card-TYPE allow-set as the base reducer above, for consistency (an eminence card-type reducer
    // reduces via the type-line match too); a real subtype still passes the original guard.
    if (COST_REDUCTION_CARDTYPE_WORDS.has(word) ||
        (!NON_SUBTYPE_ANTHEM_WORDS.has(word) && !COLOR_WORDS[word] && !NON_SUBTYPE_COST_FILTER_WORDS.has(word))) {
      out.push({ costReduction: { subtype: normalizeSubtype(word), amount: parseInt(emM[2], 10), fromCommandZone: true, excludeSelf: true, sourceName: selfName || null } });
    }
    return; // an eminence cost-reduction clause — handled (or intentionally dropped to body-only)
  }

  // ── CHOSEN-TYPE COST-REDUCTION (Urza's Incubator; Herald's Horn) ────────────────────────────────────
  // "Creature spells [you cast] of the chosen type cost {N} less to cast" — reduces the GENERIC portion (CR
  // 601.2f), floored at {0}; MV unchanged (CR 202.3). Matches a spell that carries the SOURCE permanent's
  // stored chosenType (CR 614.12 — picked at ETB, resolvers.autoPickCreatureType → perm.chosenType). Emitted
  // as a { costReduction } marker with `chosenType: true` so collectCostReducers can pair it with its SOURCE
  // permanent's chosenType at the cast site (the type isn't known at parse time). REQUIRES the "Creature
  // spells" lead — every modeled chosen-type *creature* reducer is creature-typed (Incubator/Herald), and
  // permHasChosenType tests a CREATURE subtype, so a "Spells … of the chosen type" (Cloud Key — CARD-type
  // chooser, NOT a creature type) must NOT match here (its chooser is unmodeled → it stays body-only, a safe
  // FN). "you cast" is optional (Incubator omits it; Herald includes it). Anchored ^…$.
  const ctcrM = c.match(/^creature spells (?:you cast )?of the chosen type cost \{(\d+)\} less to cast$/);
  if (ctcrM) {
    out.push({ costReduction: { chosenType: true, amount: parseInt(ctcrM[1], 10) } });
    return;
  }

  // ── COLOR COST-REDUCTION (Goblin Anarchomancer; Goblin Electromancer is instant/sorcery-only, not here) ──
  // "Each spell you cast that's <color>[ or <color>]… costs {N} less to cast" (Anarchomancer = red OR green).
  // Reduces the GENERIC portion (CR 601.2f), floored at {0}; MV unchanged (CR 202.3). Matches a spell whose
  // colors (layers.colorsOf — Scryfall colors, CR 105) intersect the listed colors. A SPELL is "red or green"
  // if it is red OR green (the colors are a union, CR 105.2 — a card can be multiple colors). Emitted as a
  // { costReduction } marker carrying the WUBRG letters; costReductionForSpell tests the spell's colors.
  // SUPPORTS the "<Color> spells you cast cost {N} less" form too (Ruby Medallion — previously excluded as a
  // safe FN; now MODELED). Anchored ^…$; a non-color quality ("noncreature", "historic") never matches.
  // ── ⭐ COLOR + CARD-TYPE COST-REDUCTION (the Monument cycle: Bontu's #664, Oketra's #1009, Hazoret's
  //    #1879, Rhonas's #2151, Kefnet's #5041) ──────────────────────────────────────────────────────────
  // "<Color> <cardtype> spells you cast cost {N} less to cast." Both qualities must hold — this is the one
  // reducer shape that is an AND rather than an OR, and that distinction is the entire safety argument.
  // Every existing descriptor carries EITHER `subtype` OR `colors`, and costReductionForSpell's dispatch is
  // a matching if/else-if chain, so a descriptor carrying both would have silently degraded to the FIRST
  // branch and reduced every creature spell regardless of color — Bontu's Monument shaving a white
  // creature. The AND is enforced in costReductionForSpell alongside this emission.
  //
  // Placed ABOVE parseColorCostReduction deliberately: that matcher's shape B captures "[a-z ,]+? spells",
  // so "black creature" reaches it as a colorlist, fails the color parse, and returns null (a safe FN, and
  // exactly why this cycle sat parked). Card-TYPE word only, from the same allow-set the single reducer
  // uses — a color + SUBTYPE cross ("green Elf spells") has no printed carrier and isn't claimed.
  const ctcM = c.match(/^(white|blue|black|red|green) ([a-z]+) spells you cast cost \{(\d+)\} less to cast$/);
  if (ctcM && COST_REDUCTION_CARDTYPE_WORDS.has(ctcM[2])) {
    out.push({ costReduction: { colors: [COLOR_WORDS[ctcM[1]]], subtype: normalizeSubtype(ctcM[2]), amount: parseInt(ctcM[3], 10) } });
    return;
  }

  const colorReducer = parseColorCostReduction(c);
  if (colorReducer) {
    out.push({ costReduction: colorReducer });
    return;
  }

  // ── COMPOUND-COLOR COST-REDUCTION (BLITZ ST-2 — the Familiar cycle: Thornscape "Red spells and white
  // spells you cast cost {1} less", Thunderscape/Sunscape/Stormscape) ─────────────────────────────────────
  // The two-color twin of the single/"X or Y" color reducer above. parseColorCostReduction handles the
  // "<colorlist> spells you cast cost {N} less" shape where the colors are joined by "or"/","; this REPEATED-
  // "spells" wording ("<color> spells and <color> spells …") isn't a single color list, so it needs its own
  // matcher. Emitted as ONE { costReduction: { colors:[both WUBRG], amount } } marker — costReductionForSpell
  // tests colors with OR (.some), so a spell that is BOTH colors (a Boros spell under "red and white") is
  // reduced ONCE, never twice. That single-descriptor-with-a-color-list shape is the exact CREED over-reduction
  // guard: two SEPARATE color reducers would double-count a dual-color spell. "you cast" is mandatory (the
  // printed framing on the whole cycle); a symmetric form (none in the corpus) stays body-only (a safe FN).
  const ccrM = c.match(/^(white|blue|black|red|green) spells and (white|blue|black|red|green) spells you cast cost \{(\d+)\} less to cast$/);
  if (ccrM) {
    const colors = [...new Set([COLOR_WORDS[ccrM[1]], COLOR_WORDS[ccrM[2]]])];
    out.push({ costReduction: { colors, amount: parseInt(ccrM[3], 10) } });
    return; // a compound-color cost-reduction clause — handled
  }

  // ── COMPOUND CARD-TYPE COST-REDUCTION (BLITZ ST-2 — Goblin Electromancer / Mocking Sprite "Instant and
  // sorcery spells you cast cost {1} less"; Mana Matrix "Instant and enchantment …"; Stormcatch Mentor) ────
  // "<A> and <B> spells you cast cost {N} less to cast" where A and B are card TYPES. Emitted as TWO
  // { costReduction: { subtype } } markers — the SAME card-type-as-subtype shape the single reducer uses (the
  // base crM branch above pushes { subtype } for a COST_REDUCTION_CARDTYPE_WORDS word), which costReductionForSpell
  // word-matches against the spell's TYPE LINE and SUMS. Over-reduction guard (CREED): two descriptors double-
  // count a spell whose type line carries BOTH tokens, so the compound is admitted ONLY when the pair is
  // PROVABLY DISJOINT — one side must be `instant` or `sorcery`. A spell cast as an instant/sorcery is never a
  // permanent (CR 110.4 — "Instant and sorcery cards can't enter the battlefield and thus can't be permanents"),
  // so it can't ALSO be artifact/creature/
  // enchantment, and no printed card is both instant AND sorcery. That makes {Instant,X} / {Sorcery,X} descriptor
  // pairs match disjoint spell sets → each spell is reduced by exactly {N}. The dual-permanent pairs ("artifact
  // and enchantment", "artifact and creature", "creature and enchantment") are NOT admitted — a card can carry
  // both types, so two descriptors would over-reduce it → those stay body-only (a safe FN, e.g. Starnheim Courser).
  // A compound SUBTYPE reducer ("Elemental spells and Warrior spells" — the Banneret cycle) is likewise NOT
  // admitted here (the single-`subtype` enforcement can't express an OR over two subtypes, and a dual-subtype
  // creature spell would double-reduce) — it stays body-only. Both words must be recognized card types.
  const cctM = c.match(/^([a-z]+) and ([a-z]+) spells you cast cost \{(\d+)\} less to cast$/);
  if (cctM) {
    const a = cctM[1], b = cctM[2];
    if (COST_REDUCTION_CARDTYPE_WORDS.has(a) && COST_REDUCTION_CARDTYPE_WORDS.has(b) &&
        (a === "instant" || a === "sorcery" || b === "instant" || b === "sorcery")) {
      const amount = parseInt(cctM[3], 10);
      out.push({ costReduction: { subtype: normalizeSubtype(a), amount } });
      out.push({ costReduction: { subtype: normalizeSubtype(b), amount } });
    }
    return; // a compound card-type cost-reduction clause — handled (or dropped to body-only on a non-disjoint / non-card-type pair)
  }

  // ── ACTIVATED-ABILITY COST-REDUCTION (Training Grounds; Biomancer's Familiar) ───────────────────────────
  // "Activated abilities of creatures you control cost {N} less to activate." A STATIC cost-reducer that
  // trims the GENERIC portion of an ACTIVATED ABILITY's cost (CR 118.9 / 601.2f — an effect may reduce the
  // cost to pay), NOT a cast cost — a DISTINCT lever from the "<subtype> spells you cast cost less" cast
  // reducers above. Emitted as a coverage MARKER ({ activatedCostReduction } with NO `affects`/`op`, so the
  // layer engine ignores it — effectAffects bails on a missing `affects`); legalChoices reads it at the
  // activated-ability enumeration site via collectActivatedCostReducers / activatedCostReductionForCost,
  // shaving the generic mana of a creature-you-control's activated ability (with the floor rider below).
  //
  // MODELED SCOPE — DELIBERATELY NARROW (a miss is a safe FN; over-claiming is a CREED FP):
  //   • "creatures you control" ONLY — the self-scoped subject the reader supports (Training Grounds,
  //     Biomancer's Familiar). The SYMMETRIC "Activated abilities of creatures cost {N} less" (Heartstone —
  //     all players' creatures) grants the discount to OPPONENTS too, which the you-control-only reader does
  //     NOT model → dropping that half is a CREED FP → Heartstone stays body-only (safe FN). Zirda's
  //     "Abilities you activate that aren't mana abilities cost {2} less" is a different subject (all your
  //     abilities, not creatures') and never matches this anchor → body-only (safe FN).
  //   • The floor rider ("This effect can't reduce the mana in that cost to less than one mana") is the
  //     STANDARD companion sentence on every printed card in this family; the runtime ALWAYS enforces the
  //     one-mana floor (activatedCostReductionForCost), and the rider is recognized as a modeled no-op below
  //     so it isn't seen as residue by staticAbilitiesCoverCard.
  // Anchored ^…$ so any variant (a cost-cap other than "{N} less", a non-mana rider) stays body-only.
  // The SUBJECT is a filter, not decoration: Forensic Gadgeteer #1374 reads "artifacts you control" and
  // Training Grounds reads "creatures you control". They must not share a descriptor — an artifact reducer
  // credited under the creature gate discounts the wrong abilities, which is a wrong PRICE rather than a
  // missing effect. "creatures" stays the unmarked default so every existing descriptor is byte-identical.
  const aacrM = c.match(/^activated abilities of (creatures|artifacts) you control cost \{(\d+)\} less to activate$/);
  if (aacrM) {
    out.push({ activatedCostReduction: { amount: parseInt(aacrM[2], 10), ...(aacrM[1] === "artifacts" ? { subject: "artifact" } : {}) } });
    return;
  }
  // EQUIP-ONLY variant (Bureau Headmaster — "Equip abilities you activate cost {1} less to activate.",
  // SHELF S7): same marker family with `equipOnly` — the apply site gates it to isEquipAbility instead
  // of isCreaturePerm (an Equipment isn't a creature, so the Training-Grounds gate would never fire).
  const eqcrM = c.match(/^equip abilities you activate cost \{(\d+)\} less to activate$/);
  if (eqcrM) {
    out.push({ activatedCostReduction: { amount: parseInt(eqcrM[1], 10), equipOnly: true } });
    return;
  }
  // NINJUTSU-ONLY variant (Silver-Fur Master + its Alchemy rebalance A-Silver-Fur Master — the ONLY two cards
  // in the index with this clause). ⭐ It gets a BENIGN MARKER, not an activatedCostReduction descriptor, and
  // the distinction is the whole point: this discount can only ever apply to a ninjutsu ACTIVATION, and the
  // engine has no ninjutsu lane at all (grepped — legalChoices offers none, no apply site exists). A price cut
  // on an ability that can never be activated cannot change any price, so recognizing the clause is exactly as
  // vacuous as crediting the bare "Ninjutsu {cost}" line itself (coverage.js KW-NINJUTSU), and rests on the
  // IDENTICAL premise. Emitting a real reducer instead would fabricate a runtime hook for an ability that does
  // not exist — a wrong PRICE waiting to happen — so it stays a marker with no affects/op.
  // ⚠️ THE TWO CREDITS ARE COUPLED: if ninjutsu is ever offered, this marker and reNinjutsuCost must BOTH be
  // revisited, because both die on the same premise. Anchored ^…$ so only this exact printed sentence matches.
  // GRANTED COST-ONLY KEYWORD (Chief Engineer "Artifact spells you cast have convoke" · Inspiring Statuary
  // "Nonartifact spells you cast have improvise" · Hunting Velociraptor "Dinosaur spells you cast have
  // prowl {2}{R}"). ⭐ VACUOUS ON EXACTLY THE PREMISE THAT ALREADY CREDITS THE PRINTED FORM: parseHelpers'
  // COST_ONLY_KEYWORD_LINE credits convoke / improvise / delve ON A SPELL because "the runtime hard-casts at
  // full printed cost, so an option it never takes cannot change what resolves", and coverage's
  // reVacuousAltCastCost credits prowl for the same reason. GRANTING one of those keywords to a class of
  // spells adds the SAME never-taken option to other cards — so the grant is vacuous iff the print is, and
  // the two credits stand or fall together. Benign marker, no layer op, no runtime.
  //
  // ⛔ THE ALLOWLIST IS THE WHOLE GUARD, AND IT IS SHORT ON PURPOSE. The corpus grants ten other keywords
  // through this exact sentence shape and NONE of them may be credited — each changes what happens rather
  // than offering a cheaper route: cascade (The First Sliver — free spells off the top) · storm (Ral,
  // Prismari — copies) · demonstrate (copy + an opponent draws) · sticker · and ⚠️ FLASH (Chea, Friend to
  // Maybe Too Many), which changes TIMING and is the easiest of the ten to wave through by accident.
  // A generic "\w+" here would credit all ten. Verified against the corpus before writing the list.
  if (/^[a-z]+ spells you cast have (?:convoke|improvise|delve|prowl (?:\{[^}]+\})+)$/.test(c)) {
    out.push({ grantedCostOnlyKeywordNoop: true });
    return;
  }
  if (/^ninjutsu abilities you activate cost \{\d+\} less to activate$/.test(c)) {
    out.push({ ninjutsuCostReductionNoop: true });
    return;
  }
  // The floor rider that accompanies every activated-ability cost-reducer in this family — a modeled no-op
  // (the one-mana floor is inherent to activatedCostReductionForCost). Recognized so it doesn't read as
  // unmodeled residue on Training Grounds / Biomancer's Familiar. Emits a benign marker; carries no runtime.
  if (/^this effect can't reduce the mana in that cost to less than one mana$/.test(c)) {
    out.push({ activatedCostReductionFloor: true });
    return;
  }
  // RADIATION LIFE-GAIN REPLACEMENT (Strong, the Brutish Thespian — SHELF S7): the runtime lives at the ONE
  // radiation chokepoint (gameState.applyRadiation checks the exact printed phrase on the radiated player's
  // battlefield and gains instead of losing; rad counters still removed). This marker only tells coverage
  // the clause is modeled (no affects/op → the layer engine ignores it).
  if (/^you gain life rather than lose life from radiation$/.test(c)) {
    out.push({ radiationLifeGain: true });
    return;
  }
  // GRANTED RIOT (CR 702.136a — Rhythm of the Wild #211, Uncivil Unrest). "Riot" is an AS-ENTERS replacement:
  // *"You may have this permanent enter with an additional +1/+1 counter on it. If you don't, it gains haste."*
  // ⭐⛔ SO IT IS DELIBERATELY **NOT** ADDED TO GRANTABLE_STATIC_KEYWORDS. A layer-6 addKeyword lands on a
  // permanent that is ALREADY on the battlefield — after its own entry replacement has been and gone — so the
  // keyword would sit there meaning nothing while the card read native: exactly the "classifies native, does
  // nothing" trap the non-creature-target drift guard was just built for.
  // The runtime hook is an ENTRY-TIME BATTLEFIELD SCAN instead (resolvers.grantedRiotCount), mirroring
  // applyCounterDoubling — which reads printed doubler text off the battlefield at the moment counters are
  // placed, for the same reason. This marker only tells coverage the clause is modeled; it carries no layer op.
  // ⛔ THIS EXACT CLAUSE ONLY. Spider-Punk's "Other Spiders you control have riot" is subtype-scoped and does
  // NOT match — it stays unmodeled (a safe FN) rather than being over-credited by a looser anchor.
  if (/^nontoken creatures you control have riot$/.test(c)) {
    out.push({ grantedRiotNontokenYouControl: true });
    return;
  }

  // ── OPPONENTS-CANT-ACT (Grand Abolisher; Voice of Victory; Conqueror's Flail rider) ────────────────────
  // "Your opponents can't cast spells during your turn." / "During your turn, your opponents can't cast
  // spells or activate abilities of artifacts, creatures, or enchantments." A STATIC restriction (CR 604.2 static-ability continuous effect,
  // CR 116) keyed off the CONTROLLER'S turn that suppresses each OPPONENT'S actions — NOT a cost, NOT a
  // layer effect. Emitted as a coverage MARKER ({ cantCast } with NO `affects`/`op`), so the layer engine
  // ignores it (layers.effectAffects bails on a missing `affects`); legalChoices reads it at the action
  // -enumeration site via the opponent scan. Two forms (the order of the "during your turn" clause varies):
  //   • cast-only  → includeActivated:false (Voice of Victory, Conqueror's Flail rider).
  //   • cast + activated abilities OF ARTIFACTS/CREATURES/ENCHANTMENTS → includeActivated:true (Grand
  //     Abolisher). CRITICAL CR scope: it does NOT stop mana abilities of LANDS, loyalty abilities, or
  //     abilities of other permanent types — modeling only the cast half would silently DROP the activated
  //     -ability half (a CREED partial flip), so the descriptor must carry includeActivated and the gate
  //     must enforce it. The "during your turn" window is mandatory (a windowless "opponents can't cast"
  //     is a different, far rarer card — Teferi's Protection tier — and stays UNDETECTED here, safe FN).
  // ANCHORED ^…$ on the whole clause so any rider variant stays body-only (Arbiter).
  const cantActM = c.match(
    /^(?:during your turn,\s*)?your opponents can't cast spells(?: or activate abilities of artifacts, creatures,? (?:and|or) enchantments)?(?:\s+during your turn)?$/,
  );
  if (cantActM) {
    // Require the "during your turn" window to appear on exactly one side (prefix or suffix), never neither.
    if (/during your turn/.test(c)) {
      out.push({ cantCast: { window: "yourTurn", includeActivated: /activate abilities of/.test(c) } });
    }
    return;
  }

  // ── OPPONENTS-CANT-ACT, attachment-gated (Conqueror's Flail) ───────────────────────────────────────────
  // "As long as this Equipment is attached to a creature, your opponents can't cast spells during your turn."
  // Same restriction, but ACTIVE only while the Equipment is attached (attachedGated). legalChoices re-checks
  // the source permanent's attachedTo at evaluation time (NOT parse time) — an UNATTACHED Flail must not lock
  // opponents out. selfNormalizeOracle rewrites the card's own name, but "this Equipment" is the templated
  // self-reference here, matched literally. Cast-only (no activated-ability half on the attachment-gated form).
  if (/^as long as this equipment is attached to a creature, your opponents can't cast spells during your turn$/.test(c)) {
    out.push({ cantCast: { window: "yourTurn", includeActivated: false, attachedGated: true } });
    return;
  }

  // ── EXTRA-LAND-DROPS (Exploration; Azusa, Lost but Seeking) ────────────────────────────────────────────
  // "You may play [an additional|N additional] land[s] on each of your turns." A static that RAISES the
  // controller's per-turn land-play allowance (CR 305.2 — normally one; CR 505.5b lets an effect grant more).
  // Emitted as a coverage MARKER ({ extraLandDrops: N } with NO `affects`/`op`), so the layer engine ignores
  // it (layers.effectAffects bails on a missing `affects`); legalChoices.actionsPlayLand + the dispatcher's
  // applyPlayLand read it (extraLandDropsForPlayer) and compute the allowance = 1 + Σ extraLandDrops across the
  // controller's battlefield + command zone. SELF-ONLY ("your turns") is the modeled scope — the SYMMETRIC
  // "each player may play an additional land on each of their turns" (Rites of Flourishing, Ghirapur Orrery)
  // grants the allowance to OPPONENTS too, which the player-only allowance reader doesn't model, so it stays
  // body-only (safe FN). "any number of lands" (Fastbond — its own damage rider) and the one-shot SORCERY
  // "up to three additional lands this turn" (Summer Bloom — not a permanent static) also stay non-native.
  // Anchored ^…$ so a card carrying ANY other clause (Aesi's landfall draw, Oracle of Mul Daya's top-of-
  // library, Dryad's type-changing static, Wayward Swordtooth's ascend) lands here for ITS extra-land clause
  // but the OTHER clause is unmodeled residue → staticAbilitiesCoverCard returns false → the whole card stays
  // body-only (CREED all-or-nothing). "an"/"one".."ten" + a numeric "2 additional" are all parsed to N.
  const eldM = c.match(/^you may play (an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) additional lands? on each of your turns$/);
  if (eldM) {
    const w = eldM[1];
    const NWORDS = { an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    const n = /^\d+$/.test(w) ? parseInt(w, 10) : (NWORDS[w] || 0);
    if (n > 0) out.push({ extraLandDrops: n });
    return; // an extra-land-drop clause — handled (or intentionally dropped to body-only when n is unparsed)
  }

  // ── CANT-BE-COUNTERED (Root Sliver; Dosan the Falling Leaf-style) ──────────────────────────────────────
  // Two STATIC uncounterability shapes (CR 701.6a), emitted as coverage MARKERS ({ cantBeCountered } with NO
  // `affects`/`op`, so the layer engine ignores them — effectAffects bails on a missing `affects`); the
  // counter-target enumeration (spellEffects.enumerateTargets) reads them at the stack so a protected spell is
  // never offered as a counter target.
  //   • SELF — "this spell can't be countered" (Root Sliver clause 1; the name was normalized to "this
  //     creature" upstream, but this clause uses the literal "this spell", untouched). Marker scope:"self".
  //     The RUNTIME for the source's OWN cast is already handled by enumerateTargets' substring check on the
  //     spell's own oracle (Root Sliver's text contains "can't be countered"); this marker exists only so the
  //     CLAUSE classifies as a modeled static (not residue) when the card is on the battlefield.
  //   • SUBTYPE — "<Subtype> spells can't be countered" (Root Sliver clause 2). A BOARD static: while the
  //     source is on the battlefield, any spell whose TYPE LINE carries that subtype is uncounterable.
  //     SUBTYPE-ONLY (same filter family as cost-reduction): a color / supertype / non-type-line word would
  //     never word-match a type line, so claiming native while protecting nothing is a CREED FP → those stay
  //     body-only (safe FN). "Creature"/"instant"/… ARE type-line tokens (allowed); the subject before
  //     "spells" is singular, so normalizeSubtype just canonicalizes case.
  if (/^this spell can't be countered$/.test(c)) {
    out.push({ cantBeCountered: { scope: "self" } });
    return;
  }

  // ── ATTACK TAX (CR 508.1g — Propaganda / Ghostly Prison / Windborn Muse) ────────────────────────────
  // "Creatures can't attack you unless their controller pays {N} for each creature they control that's
  // attacking you." A coverage MARKER only (no `affects`/`op`, so the layer engine ignores it — the
  // cantBeCountered precedent directly above). The enforcement is NOT here and must not be: legalChoices
  // withholds the attack action when the tax is unaffordable, and actionDispatcher actually PAYS it at
  // declaration. Both read attackTax.js' parser, the same one gating this marker, so the metric can never
  // claim a card the runtime doesn't charge for. Emitting the marker WITHOUT that pair would be the worst
  // outcome available: a card that classifies native and lets the attacker swing for free.
  if (isAttackTaxClause(c)) {
    out.push({ attackTax: { generic: parseAttackTax({ oracle: c })?.generic ?? 0 } });
    return;
  }
  // CONTROLLER-SCOPE (Chimil, the Inner Sun — "Spells you control can't be countered"): a board static that
  // protects EVERY spell its controller casts (CR 701.6a), not filtered by subtype. Emitted as a coverage +
  // enforcement marker; spellEffects.addStackSpells excludes such a controller's stack spells from counter
  // targets (mirrors the subtype exclusion). The cbcM regex below requires a single subtype word before
  // "spells", so this "spells you control …" form has to be its own branch.
  if (/^spells you control can't be countered$/.test(c)) {
    out.push({ cantBeCountered: { scope: "youControl" } });
    return;
  }
  // ⭐ CONTROLLER × CARD-TYPE (Prowling Serpopard #3581, Surrak Dragonclaw #3186): "CREATURE spells you
  // control can't be countered." An AND of the two axes the family already had separately — the Monument
  // cost-reducer's exact shape, one slice earlier. Read as an OR it would protect every spell the
  // controller casts, which is Chimil, a materially different card.
  const cbcTypeM = c.match(/^(creature|artifact|enchantment|instant|sorcery) spells you control can't be countered$/);
  if (cbcTypeM) {
    out.push({ cantBeCountered: { scope: "youControl", cardType: cbcTypeM[1].charAt(0).toUpperCase() + cbcTypeM[1].slice(1) } });
    return;
  }
  const cbcM = c.match(/^([a-z]+) spells can't be countered$/);
  if (cbcM) {
    const word = cbcM[1];
    if (COST_REDUCTION_CARDTYPE_WORDS.has(word) ||
        (!NON_SUBTYPE_ANTHEM_WORDS.has(word) && !COLOR_WORDS[word] && !NON_SUBTYPE_COST_FILTER_WORDS.has(word))) {
      out.push({ cantBeCountered: { subtype: normalizeSubtype(word) } });
    }
    return; // a cant-be-countered clause — handled (or intentionally dropped to body-only)
  }

  // PLAY-FROM-TOP-OF-LIBRARY (Future Sight / The Reality Chip / One with the Multiverse) — a static play-
  // PERMISSION letting the controller play lands and cast spells from the TOP card of their library (CR 118.6 /
  // 601.3e). Emitted as a coverage + enforcement MARKER ({ playFromTop }); the RUNTIME enforcement is in
  // legalChoices.actionsPlayFromTopOfLibrary, which offers the top card as a real cast/play action — so an
  // unmodeled permission can never be a claimed-native no-op (the Dracogenesis "does nothing" FP). "You may look
  // at the top card of your library any time" and "Play with the top card of your library revealed" are INERT in
  // the perfect-information sim (no hidden info) → recognized as no-op markers so a card whose only OTHER text is
  // the permission (Future Sight) is fully covered. FILTERED variants (Mystic Forge "artifact/colorless spells",
  // Eladamri "creature spells", Traveling Chocobo "Bird spells", Bolas's Citadel's life-cost rider) stay
  // body-only for now — they carry a spellFilter / alt-cost this bare-form matcher intentionally doesn't credit.
  // Only "play with the top card … revealed" is credited inert — the broader "you may look at the top card any
  // time" is left uncredited: it's also inert in the perfect-info sim, but an existing pin (topCardRouter's Iron
  // Lad) deliberately keeps such cards body-only, so crediting it is a conservative FN we decline. Future Sight
  // still flips on its play-from-top permission line below (the enforced one that actually matters).
  // ⭐ BOTH top-card INFORMATION statics are credited inert. "Play with the top card of your library revealed"
  // (public info) and "You may look at the top card of your library any time" (private info) are the same
  // class: looking at a card changes NO game state, and this sim is perfect-information, so neither grants
  // the engine anything it lacks. Crediting one and not the other was an inconsistency, not a principle.
  //
  // ⚠️ THIS OVERTURNS A DELIBERATE PIN, so the reasoning is recorded rather than assumed. The old comment
  // declined the "look" line because "an existing pin (topCardRouter's Iron Lad) deliberately keeps such
  // cards body-only" — which is circular: Iron Lad was parked ONLY by this line. Measured directly, its
  // activated ability ("{T}: Reveal the top card… if it's an artifact card, draw a card") classifies
  // native-activated on its own, and flying/vigilance are native body. Nothing else held it.
  //
  // This is NOT the transformed-text trap: no effect is being credited on rewritten text. The line is
  // credited because it genuinely does nothing to the board, which is also why it can never be a
  // claimed-native no-op — there is no effect being dropped. The PLAY/CAST permissions that usually
  // accompany it are separate lines with their own markers and their own runtime enforcement, so this
  // credits the information half only and never the permission half.
  if (/^play with the top card of your library revealed$/.test(c)
    || /^you may look at the top card of your library any time$/.test(c)) { out.push({ inertInfo: true }); return; }

  // ETB CHOSEN-TYPE CHOOSER (CR 614.12) — "As this <permanent> enters, choose a creature type." A genuine
  // setup REPLACEMENT that the engine implements (resolvers.autoPickCreatureType stores perm.chosenType), so
  // it is explained text, not residue. Every chosen-type COMPOSITE classifier already drops this line by its
  // own regex; emitting a descriptor here lets the GENERAL path account for it too, which is what kept cards
  // outside those composites parked on a line the engine actually runs (Realmwalker #607).
  //
  // ⚠️ It carries no layer/affects on purpose — it changes nothing continuous. Crediting it cannot become a
  // claimed-native no-op, because the thing it sets up is consumed by SEPARATE lines that must each earn
  // their own credit: an unmodeled "of the chosen type" payoff is still residue and still parks the card.
  if (/^as (?:this [a-z]+|[a-z' ,]+) enters(?: the battlefield)?, choose a creature type$/.test(c)) {
    out.push({ chosenTypeChooser: true });
    return;
  }

  // SELF CHOSEN-TYPE ADD (CR 205.1b / 613.1d, layer 4) — "This creature is the chosen type in addition to its
  // other types." (Metallic Mimic #1055, Adaptive Automaton #1755, Roaming Throne #133). A MARKER, not a
  // finished effect, because the subtype it adds is `permanent.chosenType` — per-PERMANENT state that does
  // not exist at parse time. layers.staticEffectsOf turns it into the real layer-4 effect once it has the
  // permanent in hand; until a type has been chosen it emits nothing (a clean no-op, never a guessed type).
  if (/^this (?:creature|artifact|permanent) is the chosen type in addition to its other types$/.test(c)) {
    out.push({ selfChosenTypeAdd: true });
    return;
  }
  if (/^you may play lands and cast spells from the top of your library$/.test(c)) {
    out.push({ playFromTop: { lands: true, spellFilter: "any" } });
    return;
  }
  // ⭐ LANDS-ONLY (Oracle of Mul Daya #499 / Courser of Kruphix #1232) — the same permission with the SPELL
  // half absent. `spellFilter: null` is the load-bearing field, not a formality: without a gate on it,
  // actionsPlayFromTopOfLibrary offers the top NONLAND as a cast, and Courser of Kruphix starts casting
  // spells off the library — a far bigger card than the one printed, and a false positive on a top-2500
  // staple. The gate ships in this same change.
  if (/^you may play lands from the top of your library$/.test(c)) {
    out.push({ playFromTop: { lands: true, spellFilter: null } });
    return;
  }
  // ⭐ TYPE-FILTERED CAST-FROM-TOP — the biggest wording in this family: "you may cast CREATURE spells from the
  // top of your library" alone is 9 cards, every one parked (Augur of Autumn #1124, Elven Chorus #1376,
  // Eladamri #2093), and the filtered forms together outnumber the two bare forms already modeled above.
  // Both the lands-and-cast and cast-only shapes are matched, so the marker's `lands` half stays honest.
  //
  // The filter is a LIST OF TYPE WORDS matched word-boundary against the top card's type line — the same
  // shape uncounterableCoversSpell already uses, so card types ("creature", "instant and sorcery") and
  // creature subtypes ("dragon", "angel and human", "cleric, rogue, warrior, and wizard") all work through
  // one path with no per-word special casing.
  //
  // ⚠️ EVERY WORD IS VALIDATED AGAINST A CLOSED SET — card types plus CR_CREATURE_TYPES — and an unlisted
  // word parks the whole clause. That is the direct lesson of the vacuous-subtype-filter class: a filter no
  // type line can satisfy would make the card claim native while the permission never offers anything, and
  // no tier could see it. It costs a real card to hold this line — Galea #12094's "aura and equipment
  // spells" parks, because Aura and Equipment are non-creature SUBTYPES outside both sets — and that is the
  // correct trade (a safe FN) rather than widening the vocabulary on a guess.
  // CHOSEN-TYPE cast-from-top (Realmwalker #607) — the same permission whose filter is DYNAMIC: the type is
  // whatever this permanent chose on entry, so it cannot be a word list at parse time. Marked here and
  // resolved in playFromTopPermission, where the permanent is in hand — the same split the layer-4 self
  // type-add uses. Until a type is chosen the granter permits nothing (never a guessed type).
  if (/^you may cast creature spells of the chosen type from the top of your library$/.test(c)) {
    out.push({ playFromTop: { lands: false, spellFilter: { chosenTypeOfSource: true } } });
    return;
  }
  {
    const ft = c.match(/^you may (play lands and )?cast ([a-z, ]+?) spells from the top of your library$/);
    if (ft) {
      const words = ft[2].split(/,|\band\b|\bor\b/).map((w) => w.trim()).filter(Boolean);
      const valid = words.length > 0 && words.every((w) => castFromTopTypeWords().has(w));
      if (valid) {
        out.push({ playFromTop: { lands: !!ft[1], spellFilter: words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)) } });
        return;
      }
    }
  }

  // PLAY-LANDS-FROM-GRAVEYARD (Crucible of Worlds / Ramunap Excavator / Icetill Explorer — 9 carriers, census
  // slice 44) — the graveyard sibling of the play-from-top permission above, and modeled the same way: a
  // coverage + enforcement MARKER whose runtime is legalChoices.actionsPlayLandFromGraveyard, so the credited
  // static can never be a claimed-native no-op. The land still costs a land drop and still needs sorcery
  // timing; the permission changes the ZONE, nothing else (CR 118.6).
  //
  // BARE FORM ONLY. Every richer printed variant stays body-only → Arbiter, deliberately:
  //   • "…play lands AND CAST SPELLS from your graveyard" (Yawgmoth's Agenda / Gaea's Will) — the spell half
  //     is a whole separate permission this marker does not grant, and crediting the card would silently
  //     drop it.
  //   • "…and cast Insect spells" / "…creature spells" / surveil- or life-gated forms — same reason.
  //   • "Your opponents can't play land cards from graveyards" (Tomik) — a RESTRICTION, not a permission.
  if (/^you may play lands from your graveyard$/.test(c)) {
    out.push({ playLandFromGraveyard: true });
    return;
  }

  // ── GROUP-BLOCK-RESTRICTION (Shifting Sliver / Serpent of Yawning Depths) — the SYMMETRIC tribal
  // "<subtypes> [you control] can't be blocked except by <same subtypes>" static (CR 509.1b). Emitted as
  // a coverage MARKER ({ blockRestriction } with NO `affects`/`op`, so the layer engine ignores it —
  // effectAffects bails on a missing `affects`). The RUNTIME enforcement is entirely in
  // combatEvasion.canBlockAttacker (which reads the SAME parseGroupBlockRestriction), so this marker exists
  // only so the CLAUSE classifies as a modeled static (not residue) — the two can't drift (one parser).
  // parseGroupBlockRestriction returns null for an ASYMMETRIC / "N or more" / conditional variant → NO
  // descriptor → the card stays body-only (Arbiter, never a half-modeled evasion). Single-subtype board-wide
  // Shifting Sliver ALSO flips through isKeywordOnly's isEnforcedEvasionClause route; emitting the marker here
  // too is harmless (both paths agree the card is native) and makes the multi-subtype list — which the
  // comma-splitting isKeywordOnly gate can't credit — natively classified.
  {
    const restriction = parseGroupBlockRestriction(clause, selfName);
    if (restriction) {
      out.push({ blockRestriction: restriction });
      return;
    }
  }

  // ── BLANKET COMBAT RESTRICTION (BLITZ ST-1 — Bedlam "Creatures can't block"; Peacekeeper "Creatures
  // can't attack"; Light of Day "Black creatures can't attack or block"; Razorjaw Oni / Magistrate's
  // Veto — color-filtered) — a BOARD-WIDE static barring a class of creatures from attacking and/or
  // blocking OUTRIGHT (CR 508.1a attack restriction / 509.1b block restriction; no cost, no player
  // scope, no attacker subset). Emitted as layer-6 addKeyword grant(s) of the cantAttack / cantBlock
  // pseudo-keywords over a DYNAMIC selector (all creatures, or a color-filtered subset), read
  // LAYER-AWARE at the two declaration gates — legalChoices.actionsDeclareAttacker's cantAttack filter
  // and combatEvasion.canBlockAttacker's cantBlock read (permanentHasKeyword) — the SAME enforcement
  // the PACIFISM attach class (parseAttachedClause) uses, so the metric and the runtime can't drift.
  // The grant lifts LIVE when the source leaves (statics are re-collected per state; effectAffects's
  // dynamic branch drops the effect once the source permanent is gone).
  //
  // STRICTLY BLANKET ONLY (CREED — a scoped/conditional restriction the selector/keyword can't express
  // is a forbidden FP, so it stays body-only, a safe FN). The ^…$ anchor after "attack"/"block" is what
  // rejects the unmodeled cousins, all confirmed against the corpus:
  //   • PLAYER-SCOPED "…can't attack YOU / …planeswalkers you control [unless …]" (Blazing Archon,
  //     Ghostly Prison / Propaganda family) — cantAttack is a BLANKET keyword (barred from attacking
  //     ANY defender). There is no player-scoped attack-restriction machinery, so using it here would
  //     over-bar attacks on OTHER players — the anchor rejects any "you"/"planeswalkers…"/"unless…" tail.
  //   • ATTACKER-SUBSET "…can't block creatures you control" (Heat Wave) — those creatures CAN still
  //     block other players' attackers; the anchor rejects the trailing subject.
  //   • STATE-CONDITIONAL "untapped/attacking/tapped creatures …" (Siege Elemental) — not a color word,
  //     so the subject never matches (no tapped/attacking-state cantBlock selector exists).
  //   • NEGATED colors ("nonblack creatures …"), supertypes, or a P/T predicate ("power N or less can't
  //     attack you") — not in the color set and/or carry a "you" tail → body-only (safe FN).
  // "White creatures and blue creatures" is a color UNION (CR 105.2 — a creature that's white OR blue is
  // restricted), matched by the selector's colors[] under matchesSelector's `.some` (OR) semantics.
  {
    const crRestrictM = c.match(/^(creatures|(?:white|blue|black|red|green) creatures(?: and (?:white|blue|black|red|green) creatures)*) can't (attack or block|attack|block)$/);
    if (crRestrictM) {
      const subject = crRestrictM[1];
      const which = crRestrictM[2];
      const selector = { cardTypes: ["Creature"] };
      if (subject !== "creatures") {
        // Color-filtered subject — collect each named color (de-duped) into a WUBRG selector; matchesSelector
        // ORs them, so a creature of ANY listed color is restricted (never an over-narrow AND intersection).
        const colors = [...new Set([...subject.matchAll(/\b(white|blue|black|red|green)\b/g)].map((m) => COLOR_WORDS[m[1]]))];
        selector.colors = colors;
      }
      if (which !== "block") out.push({ layer: 6, op: { layerOp: "addKeyword", keyword: "cantAttack" }, affects: { mode: "dynamic", selector }, duration: { kind: "permanent" } });
      if (which !== "attack") out.push({ layer: 6, op: { layerOp: "addKeyword", keyword: "cantBlock" }, affects: { mode: "dynamic", selector }, duration: { kind: "permanent" } });
      return;
    }
  }

  // ── CAST-LIMIT (BLITZ RL-1 — Rule of Law / Arcane Laboratory / Eidolon of Rhetoric, CR 604.2):
  // "Each player can't cast more than one spell each turn." Emitted as a coverage MARKER (the
  // blockRestriction pattern — no `affects`/`op`, the layer engine ignores it). The RUNTIME enforcement
  // lives in legalChoices (the cantCast gate consults castsPerTurnLimitOf across all battlefields and the
  // acting player's spellsCastThisTurn), reading the SAME line via castsPerTurnLimitOf — one parser, no
  // drift. Only the EXACT symmetric one-spell form; any variant (per-player asymmetric, "two spells",
  // "only one spell during your own turn") leaves residue → body-only (a safe FN).
  if (/^each player can't cast more than one spell each turn$/.test(c)) {
    out.push({ castLimit: 1 });
    return;
  }

  // ── ARTIFACT-ACTIVATION LOCK (BLITZ NR-1 — Null Rod / Stony Silence / Collector Ouphe, CR 604.2):
  // "Activated abilities of artifacts can't be activated." Emitted as a coverage MARKER (the castLimit
  // pattern — no `affects`/`op`, the layer engine ignores it). The RUNTIME enforcement lives at every
  // artifact-activation enumeration site (legalChoices tap-for-mana/double-mana-pool/activate-ability/
  // crew/loyalty + manaModel.manaSources — the one affordability/payment gatherer), each keyed on the SAME
  // line via artifactActivationsLocked below — one parser, no drift. CR scope enforced there: symmetric
  // ("artifacts", CR 109.2 — battlefield artifact permanents of EVERY player), covers MANA abilities
  // (CR 605.1a — a mana ability is an activated ability), crew (CR 702.122a), equip (CR 702.6a), and
  // loyalty of artifact planeswalkers (CR 606.2); does NOT touch casting (CR 601.2), triggered (CR 603.2)
  // or static (CR 604.1) abilities, or activated abilities functioning outside the battlefield (cycling
  // from hand, graveyard recursion — those cards are not "artifacts" per CR 109.2). Exact line only; any
  // variant ("…your opponents control", "…lose all abilities") leaves residue → body-only (a safe FN).
  if (/^activated abilities of artifacts can't be activated$/.test(c)) {
    out.push({ artifactActivationLock: true });
    return;
  }

  // ── MASS LAND ANIMATION (BLITZ NV-1 — Nature's Revolt "All lands are 2/2 creatures that are still
  // lands." / Living Plane "…1/1…"): TWO real layer descriptors on a dynamic selector over EVERY land,
  // every player (no controller scope — the line names no "you"):
  //   • layer 4 — ADD Creature (CR 613.1d; "still lands" = additive, Land is kept). Selectors see the
  //     animated type via effectiveTypeIdentity's dynamic-add branch (an anthem's cardTypes ["Creature"]
  //     matches an animated land — the CR 613 layer-4-before-6/7 dependency); combat / the lethal SBA
  //     read it through deriveCharacteristics.
  //   • layer 7b — SET base P/T to N/N (CR 613.3b/613.4a); counters and anthems then apply ON TOP (7c).
  // The animation lifts LIVE (statics are re-collected per state — the carrier leaving removes both).
  // CR 302.6 is enforced by layers.summoningSickNow at the attack/{T}-ability/mana gates: a land played
  // while a carrier is out can't attack or tap for mana that turn. EXACT all-lands line only: the
  // COLOR-carrying cousin (Kormus Bell "All Swamps are 1/1 black creatures that are still lands") is NOT
  // admitted — its layer-5 color set has no delivery into selector color reads (matchesSelector reads
  // printed colors), so admitting it would silently drop the "black" half (a CREED half-enforcement);
  // it stays body-only (a safe FN).
  const mlaM = c.match(/^all lands are (\d+)\/(\d+) creatures that are still lands$/);
  if (mlaM) {
    out.push({ layer: 4, op: { types: ["Creature"] }, affects: { mode: "dynamic", selector: { cardTypes: ["Land"] } }, duration: { kind: "permanent" } });
    out.push({ layer: 7, sublayer: "7b", op: { layerOp: "ptSet", power: parseInt(mlaM[1], 10), toughness: parseInt(mlaM[2], 10) }, affects: { mode: "dynamic", selector: { cardTypes: ["Land"] } }, duration: { kind: "permanent" } });
    return;
  }

  // ── KISMET (BLITZ KM-1, CR 614.1c) — the opponents-enter-tapped imposition, a coverage MARKER (the
  // castLimit pattern): the RUNTIME lives at every entry chokepoint via impositionEntersTapped.
  //
  // Slice 45 widened this from the exact three-type line to ANY bare type list, because the narrower
  // printings are the SAME rule (Imposing Sovereign / Authority of the Consuls / Urabrask the Hidden;
  // Manglehorn / Dauntless Dismantler). Credit is read from the SAME parser the runtime uses
  // (opponentsEnterTappedTypesOf), so a card is credited exactly when its type set is enforced — the two
  // can't drift. A QUALIFIED subject ("nonbasic lands", "snow lands", "played by your opponents") returns
  // null there, leaves residue here, and stays body-only → Arbiter (safe FN).
  if (opponentsEnterTappedTypesOf({ oracle: c })) {
    out.push({ entersTappedImposition: true });
    return;
  }

  // ── COUNTER-PAYOFF (Herald of Secret Streams): "(each|all) creature(s) you control with a +1/+1 counter
  // on it/them can't be blocked" → a layer-6 unblockable grant, gated PER-CREATURE (dynamic) on having a
  // +1/+1 counter via the selector's requiresCounter; combat reads the granted "unblockable". Only the bare
  // form — a trailing "by …" / "except …" qualifier doesn't match, so a partial evasion is never claimed.
  if (/^(?:each |all )?creatures? you control with (?:a )?\+1\/\+1 counters? on (?:it|them) can't be blocked$/.test(c)) {
    out.push({
      layer: 6,
      op: { layerOp: "addKeyword", keyword: "unblockable" },
      affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"], requiresCounter: "+1/+1" } },
      duration: { kind: "permanent" },
    });
    return;
  }

  // ── MILLED-THIS-TURN GRAVEYARD CAST PERMISSION (Raul, Trouble Shooter — SHELF S6, CR 601.3e): "Once
  // during each of your turns, you may cast a spell from among cards in your graveyard that were milled
  // this turn." A coverage MARKER (no affects/op — the layer engine ignores it); legalChoices'
  // actionsCastMilledFromGraveyard enforces it (once-per-your-turn latch + the millCards ledger gate), so
  // crediting it native is honest. Exact printed sentence only.
  if (/^once during each of your turns, you may cast a spell from among cards in your graveyard that were milled this turn$/.test(c)) {
    out.push({ castMilledGraveyardPermission: true });
    return;
  }

  // ── COUNTER-GATED GROUP WARD (Cathedral Acolyte — SHELF S7, CR 702.21): "Each creature you control
  // with a counter on it has ward {N}." A layer-6 addWard grant over the ANY-counter dynamic selector
  // (requiresAnyCounter — any kind, re-read per query so a counter arriving/leaving moves a creature in or
  // out live). ONLY the fixed-generic pip is emitted (a colored/{X}/life ward grant → unparsed → Arbiter);
  // ward.js unions the granted cost with printed ward at the tax site, so the grant is ENFORCED, not
  // parse-only. Bare form anchored ^…$.
  {
    const gwM = c.match(/^each creature you control with a counter on it has ward \{(\d+)\}$/);
    if (gwM) {
      out.push({
        layer: 6,
        op: { layerOp: "addWard", generic: parseInt(gwM[1], 10) },
        affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"], requiresAnyCounter: true } },
        duration: { kind: "permanent" },
      });
      return;
    }
    // ── COUNTER-GATED GROUP KEYWORD (Nev, the Practical Dean — "Creatures you control with counters on
    // them have trample."; Tesak, Judith's Hellhound — "…have haste."; Winged Hive Tyrant — "OTHER
    // creatures you control with counters on them have flying and haste."): the keyword-grant
    // generalization of the ward grant just above — the SAME requiresAnyCounter dynamic selector (re-read
    // live, so a counter arriving/leaving moves a creature in or out), any GRANTABLE_KEYWORDS keyword(s)
    // instead of only ward. Plural "creatures...have" (vs. the ward grant's singular "each creature...has")
    // — CR draws no distinction, both read the same live counter-presence query. Optional leading "other"
    // maps to excludeSelf (matchesSelector's generic self-exclusion field — Winged Hive Tyrant is itself a
    // creature that could carry counters, so it must not buff itself). ALL-OR-NOTHING (CREED, mirrors the
    // your-turn keyword grant's own guard): every segment must be a grantable keyword or nothing is
    // emitted — a P/T-set or non-keyword rider (Rishkar's granted mana ability) stays residue →
    // body-only, never a fabricated grant.
    const cgkM = c.match(/^(other )?creatures? you control with (?:a counter on it|counters on them) (?:has|have) (.+)$/);
    if (cgkM) {
      const segs = cgkM[2].split(/,|\band\b/).map((s) => s.trim().replace(/[^a-z ]/g, "").trim()).filter(Boolean);
      if (segs.length && segs.every((s) => GRANTABLE_KEYWORDS.has(s))) {
        const selector = { controllerScope: "you", cardTypes: ["Creature"], requiresAnyCounter: true, ...(cgkM[1] && { excludeSelf: true }) };
        for (const s of segs) {
          out.push({
            layer: 6,
            op: { layerOp: "addKeyword", keyword: canonicalKeyword(s) },
            affects: { mode: "dynamic", selector },
            duration: { kind: "permanent" },
          });
        }
        return;
      }
    }
  }

  // ── P/T-PREDICATE EVASION (Tetsuko Umezawa, Fugitive — SHELF S7): "Creatures you control with power or
  // toughness N or less can't be blocked." The Herald-of-Secret-Streams unblockable grant with a LAYER-AWARE
  // P/T predicate instead of a counter gate: the selector's powerOrToughnessAtMost is re-evaluated at every
  // keyword query (matchesSelector reads the candidate's LIVE layer-7 power/toughness), so a creature pumped
  // above the bound loses the evasion mid-turn and a debuffed one gains it — exactly the printed static
  // (CR 509.1b, checked at declare-blockers). Bare form only — a trailing "by …"/"except …" qualifier
  // doesn't match the ^…$ anchor, so a partial evasion is never claimed (CREED).
  {
    const ptEv = c.match(/^creatures you control with power or toughness (\d+) or less can't be blocked$/);
    if (ptEv) {
      out.push({
        layer: 6,
        op: { layerOp: "addKeyword", keyword: "unblockable" },
        affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"], powerOrToughnessAtMost: parseInt(ptEv[1], 10) } },
        duration: { kind: "permanent" },
      });
      return;
    }
  }

  // ── COUNTER-PAYOFF keyword grant (Badgermole/Emil/Training Regimen — "creatures you control with +1/+1
  // counters on them have trample"): generalizes Herald's counter-gated grant to any GRANTABLE keyword(s),
  // same requiresCounter dynamic per-creature gate. ALL-OR-NOTHING — every word in the "have …" phrase must
  // be a grantable (enforced/layer-aware) keyword, else the whole clause is left unmodeled (a rider like
  // "have trample and <unmodeled>" must never drop a keyword while the card flips native). Bare form only:
  // a "During your turn," / "Unlock Ability —" prefix or a trailing qualifier won't match the ^…$ anchor → safe FN.
  const cpKw = c.match(/^(?:each |all )?creatures? you control with (?:a )?\+1\/\+1 counters? on (?:it|them) (?:has|have) (.+)$/);
  if (cpKw) {
    // The non-alpha strip drops any numeric tail; that's safe ONLY because every GRANTABLE_KEYWORDS entry is
    // non-parameterized (flying/trample/first strike/…). If a parameterized keyword (toxic N / ward N) were
    // ever added to the static grantable set, guard the count here so "have toxic 2" can't drop the "2".
    const words = cpKw[1].split(/,|\band\b/).map((w) => w.trim().replace(/[^a-z ]/g, "").trim()).filter(Boolean);
    if (words.length && words.every((w) => GRANTABLE_KEYWORDS.has(w))) {
      for (const w of words) {
        out.push({
          layer: 6,
          op: { layerOp: "addKeyword", keyword: canonicalKeyword(w) },
          affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"], requiresCounter: "+1/+1" } },
          duration: { kind: "permanent" },
        });
      }
      return;
    }
  }

  // ── GROUP-GRANT granted quoted MANA ability (Gemhide/Manaweft Sliver, Enduring Vitality) ────────────
  // "<selector> have \"{T}: Add <mana>\"" mints a MANA ability onto every matching permanent (CR 113.7 — a
  // granted ability functions on the recipient). The ONLY granted-ability kind modeled here is a MANA
  // ability whose quoted "Add …" text resolves through the SAME parser the real mana system uses
  // (parseGrantedManaSpec, mirroring manaModel.parseAddClause's modeled subset) — so a granted instance taps
  // for EXACTLY what a printed one would (CREED #17: the granted ability must itself be fully modeled, or
  // the whole grant stays non-native). A quoted TRIGGERED / ACTIVATED-non-mana / regenerate / X-scaling
  // ability does NOT match → no descriptor → the card stays body-only (a safe FN). The selector reuses
  // parseCreatureSelector ("All Slivers"/"Sliver creatures you control"/"creatures you control" + the
  // determiner self in/exclude). The emitted op carries a serializable {colors, amount} spec; layers exposes
  // the matched descriptors and manaModel reads the spec — manaModel never re-parses the text, so the
  // classification gate and the runtime production can't drift. Anchored on the quoted-string shape, so a
  // creature-bonus / aura "has \"…\"" tail elsewhere never false-matches.
  {
    const grantQ = clause.match(/^(.+?)\s+(?:has|have)\s+["“]([^"”]+)["”]\s*\.?$/i);
    if (grantQ) {
      const creatureSelector = parseCreatureSelector(grantQ[1].toLowerCase() + " have");
      const quoted = grantQ[2];
      const isTriggeredBody = /^(?:when|whenever|at)\b/i.test(quoted.trim());
      // NON-CREATURE TOKEN-MANA GRANT (Goldspan Dragon — "Treasures you control have \"{T}, Sacrifice this
      // artifact: Add two mana of any one color.\""). A grant to a mana-relevant ARTIFACT token subtype
      // (Treasure/Gold/…) is modeled ONLY for a MANA ability — the recipient (a Treasure) gains a tap/sac-
      // for-mana source through the SAME grantedManaSpecsFor → manaSources runtime a creature group-grant uses.
      // The token selector is tried ONLY when the creature selector didn't match AND the quoted body is a
      // modeled mana spec: a token can't take a Creature-restricted keyword/anthem grant (crew unmodeled), so
      // a keyword/triggered/activated grant to a token stays UNMODELED → body-only (the CREED FN, matching the
      // parseCreatureSelector NON_CREATURE_SUBTYPES exclusion). `upgrade:true` marks the spec so
      // manaModel.applyAuraManaGrantSupplement lets it DOMINATE the token's own printed production (Goldspan's
      // "two" replaces the Treasure's own "one" — a single tap, never a double-tap): the granter (a Dragon) is
      // never itself a Treasure, so it can't self-include and mis-upgrade its own source.
      const tokenManaSelector = creatureSelector ? null : parseTokenArtifactManaSelector(grantQ[1].toLowerCase() + " have");
      const selector = creatureSelector || tokenManaSelector;
      const manaSpec = selector ? parseGrantedManaSpec(quoted) : null;
      if (selector && manaSpec) {
        out.push({
          layer: 6,
          op: { layerOp: "addAbility", grant: { kind: "mana", spec: tokenManaSelector ? { ...manaSpec, upgrade: true } : manaSpec } },
          affects: selector,
          duration: { kind: "permanent" },
        });
      } else if (creatureSelector && isTriggeredBody) {
        // GROUP-GRANT granted quoted TRIGGERED ability ("Sliver creatures you control have \"Whenever this
        // creature deals combat damage to a player, put a +1/+1 counter on it.\"" — Tempered Sliver). The
        // quoted body must parse to FULLY-MODELED, natively-routing trigger(s) through detectTriggers +
        // triggerRoutesNatively — the SAME gate the Aura/Equipment granted-triggered path uses (CREED #17:
        // model the whole quoted ability or emit nothing). The emitted op carries the quoted TEXT
        // (serializable); triggers.grantedTriggersForGroup parses it (the SAME detectTriggers) and fires it
        // ON EACH affected permanent — so "this creature"/source bind to the RECIPIENT, never the granter.
        // Unregistered validator or an unmodeled body → NO descriptor → the card stays body-only (a safe FN).
        if (_groupTriggeredBodyValidator && _groupTriggeredBodyValidator(quoted)) {
          out.push({
            layer: 6,
            op: { layerOp: "addAbility", grant: { kind: "triggered", quoted } },
            affects: creatureSelector,
            duration: { kind: "permanent" },
          });
        }
      } else if (creatureSelector && !isTriggeredBody) {
        // GROUP-GRANT granted quoted ACTIVATED ability ("All Slivers have \"{2}: Regenerate this permanent.\""
        // — Clot Sliver; "\"{2}, Sacrifice this permanent: Draw a card.\"" — Mnemonic; "\"Sacrifice this
        // permanent: You gain 3 life.\"" — Darkheart). The quoted body must parse to a FULLY-MODELED, non-mana
        // activated ability through parseActivatedAbilities — the SAME parser a PRINTED ability uses — so a
        // granted instance behaves identically (CREED #17: model the whole quoted ability or emit nothing).
        // A TARGETED / X-scaling / otherwise-unmodeled body (Telekinetic "{T}: Tap target permanent", Magma's
        // X-pump) parses modeled=false → NO descriptor → the whole card stays body-only (a safe FN → Arbiter).
        // The emitted op carries the quoted TEXT (serializable); layers.grantedActivatedQuotedFor returns it
        // to legalChoices, which parses it (the SAME parser) and enumerates the ability ON EACH affected
        // permanent — so "this permanent"/"this creature"/the {T}/sacrifice cost bind to the RECIPIENT, never
        // the granter. Triggered bodies (When/Whenever/At) are handled by the dedicated branch above.
        // The injected validator (see registerGroupActivatedBodyValidator) confirms the quoted body parses to
        // a fully-modeled, non-mana activated ability via parseActivatedAbilities — the SAME parser a printed
        // ability uses (CREED #17). Unregistered or unmodeled → NO descriptor → the card stays body-only (FN).
        if (_groupActivatedBodyValidator && _groupActivatedBodyValidator(quoted)) {
          out.push({
            layer: 6,
            op: { layerOp: "addAbility", grant: { kind: "activated", quoted } },
            affects: selector,
            duration: { kind: "permanent" },
          });
        } else {
          // ⭐ QUOTED **KEYWORD** GRANT — 'Other creatures you control have "Ward—Pay 2 life."'
          // (Hexing Squelcher, Hag of Mage's Doom) and the same shape for a plain keyword ("Flying.").
          //
          // The closing comment below used to assert that a `have "…"` clause is never ALSO a plain
          // keyword/anthem grant. That is false: quoting is a printing convention, not a rules distinction
          // (CR 702.21 — a granted keyword ability is the same ability quoted or not), and the corpus prints
          // it both ways. The unquoted twin has always worked; the quoted one died here, which is why
          // 'have "Flying."' was body-only while 'have flying.' was native-static.
          //
          // Delegated to parseAnthemHaveTail — the SAME all-or-nothing oracle the unquoted path uses — so a
          // quoted body that is anything other than a fully-modeled keyword / protection / ward-pay-life list
          // returns null and NOTHING is emitted, exactly as before. This can only widen to bodies the
          // unquoted path would already have accepted.
          // LOWERCASED before delegating: the unquoted path receives an already-lowercased clause, and
          // parseAnthemHaveTail's keyword loop strips every non-[a-z ] character — so a printed-case body
          // ("Flying.") would be scrubbed to "lying" and rejected. Cost the quoted keyword grant entirely
          // until this line existed; the ward arm only survived because its own regex is case-insensitive.
          const quotedTail = creatureSelector ? parseAnthemHaveTail(quoted.toLowerCase()) : null;
          if (quotedTail) {
            for (const kw of quotedTail.keywords) {
              out.push({ layer: 6, op: { layerOp: "addKeyword", keyword: kw }, affects: creatureSelector, duration: { kind: "permanent" } });
            }
            if (quotedTail.protColors.length) {
              out.push({ layer: 6, op: { layerOp: "addProtection", colors: quotedTail.protColors }, affects: creatureSelector, duration: { kind: "permanent" } });
            }
            if (quotedTail.wardLife) {
              out.push({ layer: 6, op: { layerOp: "addWard", life: quotedTail.wardLife }, affects: creatureSelector, duration: { kind: "permanent" } });
            }
          }
        }
      }
      // A quoted-ability grant we matched the SHAPE of but can't fully model (no selector, or a non-mana /
      // unmodeled / triggered quoted ability) produces NO descriptor — the whole clause stays body-only
      // (CREED). Return either way: a "have \"…\"" clause is never ALSO a plain keyword/anthem grant.
      return;
    }
  }

  // ── CDA-SELF-P/T-BY-COUNT: a characteristic-defining ability SETTING self P/T from a LIVE count ──
  // A CDA (CR 613.4a / 604.3), layer 7a, that SETS the base power/toughness from a count re-read every P/T
  // computation. DISTINCT from the 7c "gets +X/+Y for each" self-buff below (that ADDS to the printed body;
  // this SETS the `*` base, so 7c counters/pumps then stack ON TOP — CR 613.4 sublayer order). The card name
  // was normalized to "this creature" upstream. parseCdaCountSource must recognize the count source (a
  // curated exact-evaluator allowlist — you-control board counts, cards-in-hand, typed/card-types graveyard
  // counts in your or ALL graveyards); an UNMODELED count → NO descriptor → the card stays body-only
  // (Arbiter; CREED — a miss is safe, a fabricated base is forbidden). THREE printed P/T shapes, each
  // whole-clause `^…$`-anchored so a trailing rider falls through to body-only; the Lhurgoyf/Tarmogoyf GOYF
  // form is tried FIRST (its "…plus 1" tail is a suffix a bare power-only match would otherwise swallow):
  //   • GOYF   "…power is equal to the number of <X> and its toughness is equal to that number plus 1"
  //            → set power = N, toughness = N + 1 (`*/1+*`). (Tarmogoyf, Lhurgoyf, Nethergoyf, Consuming Blob)
  //   • BOTH   "…power and toughness are each equal to the [total ]number of <X>" → set both = N.
  //   • POWER  "…power is equal to the [total ]number of <X>" → set power = N (printed toughness stands).
  {
    let cdaM;
    if ((cdaM = c.match(/^this creature's power is equal to the (?:total )?number of (.+) and its toughness is equal to that number plus (\d+)$/))) {
      const countSpec = parseCdaCountSource(cdaM[1]);
      if (countSpec) {
        out.push({
          layer: 7, sublayer: "7a", isCDA: true,
          op: { layerOp: "ptSetDynamicCount", countSpec, setPower: true, setToughness: true, toughnessOffset: parseInt(cdaM[2], 10) },
          affects: { mode: "self" }, duration: { kind: "permanent" },
        });
      }
      return; // a GOYF-form CDA — handled (or dropped to body-only on an unmodeled count)
    }
    if ((cdaM = c.match(/^this creature's power and toughness are each equal to the (?:total )?number of (.+)$/))) {
      const countSpec = parseCdaCountSource(cdaM[1]);
      if (countSpec) {
        out.push({
          layer: 7, sublayer: "7a", isCDA: true,
          op: { layerOp: "ptSetDynamicCount", countSpec, setPower: true, setToughness: true },
          affects: { mode: "self" }, duration: { kind: "permanent" },
        });
      }
      return; // a symmetric CDA — handled (or dropped to body-only on an unmodeled count)
    }
    if ((cdaM = c.match(/^this creature's power is equal to the (?:total )?number of (.+)$/))) {
      const countSpec = parseCdaCountSource(cdaM[1]);
      if (countSpec) {
        out.push({
          layer: 7, sublayer: "7a", isCDA: true,
          op: { layerOp: "ptSetDynamicCount", countSpec, setPower: true, setToughness: false },
          affects: { mode: "self" }, duration: { kind: "permanent" },
        });
      }
      return; // a power-only CDA — handled (or dropped to body-only on an unmodeled count)
    }
  }

  // ── TRUNK-SELFBUFF: a STATIC self-buff scaled by a board count (layer 7c dynamic) ──
  // "This creature gets +X/+Y for each <countsource>" (Nim Lasher, Benalish Honor Guard…). A CONTINUOUS
  // effect, so it's exempt from the `for each` guard below — but ONLY this exact self-referential static
  // shape, with a MODELED count source. Tight: whole-clause anchored, self subject, no trigger/activated/
  // one-shot prefix, and parseSelfCountSource must recognize the source (else NO descriptor → the card
  // stays LOW → Arbiter, never a fabricated buff). The card name was normalized to "this creature" upstream.
  if (!/^(?:when|whenever|at)\b/.test(c) && !/\bwhenever\b/.test(c) && !c.includes(":") && !/\b(?:until end of turn|this turn)\b/.test(c)) {
    const feM = c.match(/^(?:this creature|it) gets ([+-]\d+)\/([+-]\d+) for each (.+)$/);
    if (feM) {
      const countSpec = parseSelfCountSource(feM[3]);
      if (countSpec) {
        out.push({
          layer: 7,
          sublayer: "7c",
          op: { layerOp: "ptModifyDynamicCount", countSpec, perPower: signed(feM[1]), perToughness: signed(feM[2]) },
          affects: { mode: "self" },
          duration: { kind: "permanent" },
        });
      }
      return; // a self-for-each clause — handled (or intentionally dropped to LOW on an unmodeled source)
    }
    // ── YOUR-TURN GATED-SELFBUFF (BLITZ DT-1 — Hardy Veteran / Wildwood Geist / Skophos Reaver frame):
    // "During your turn, this creature gets +N/+M." The same ptModifyGated lane with a turn-phase gate
    // ({kind:"yourTurn"} — layers.gateMet reads state.activePlayer === controller, re-evaluated every
    // derive pass so the buff flips exactly at the turn boundary). Whole-clause anchored: a keyword or
    // rider tail falls through → LOW (safe FN).
    // ⭐ IS-ALL-COLORS (CR 105.2 / layer 5) — "~ is all colors." (Transguild Courier, Sphinx of the
    // Guildpact, Fallaji Wayfarer, O-Kagachi Made Manifest, Awaken the Maelstrom). ZERO native.
    // ⭐ BUILT ENGINE, NO IGNITION: the `setColor` layer-5 op ships and `permanentColors` reads it — two
    // spell atoms already emit it. The STATIC parser simply had no arm, so a permanent that IS all colors by
    // its own printed text was read at its printed colors by every colour-sensitive check (protection,
    // non<color> removal, colour-matters counts).
    // ⛔ SELF SCOPE ONLY. Leyline of the Guildpact's "EACH NONLAND PERMANENT YOU CONTROL is all colors" is a
    // group static with a different affects-mode; it stays residue → body-only (safe FN), rather than being
    // quietly applied to the Leyline itself.
    // ⓘ The colour-identity disclaimer some carriers print ("This ability doesn't affect its color
    // identity.") is a DECK-CONSTRUCTION note with no in-game effect; it is its own sentence and is handled
    // by the ordinary residue path, so it neither blocks nor is credited here.
    if (/^(?:this creature|this permanent|it) is all colors$/.test(c)) {
      out.push({ layer: 5, op: { layerOp: "setColor", colors: ["W", "U", "B", "R", "G"] }, affects: { mode: "self" }, duration: { kind: "permanent" } });
      return;
    }
    const dt = c.match(/^during your turn, (?:this creature|it) gets ([+-]\d+)\/([+-]\d+)$/);
    if (dt) {
      out.push({ layer: 7, sublayer: "7c", op: { layerOp: "ptModifyGated", power: signed(dt[1]), toughness: signed(dt[2]), gate: { kind: "yourTurn" } }, affects: { mode: "self" }, duration: { kind: "permanent" } });
      return;
    }
    // ── YOUR-TURN GATED KEYWORD GRANT (BLITZ ST-2 — Fresh-Faced Recruit / Pouncing Lynx "During your turn,
    // this creature has first strike"; Daggersail Aeronaut / Hookblade Veteran "…has flying"; Leech Fanatic /
    // Blood Burglar "…has lifelink"): the keyword twin of the DT-1 your-turn P/T buff above. Each grantable
    // keyword → a layer-6 gated addKeyword carrying the SAME {kind:"yourTurn"} gate (layers.gateMet reads
    // state.activePlayer === controller; permanentHasKeyword / keywordSet BOTH honor e.op.gate — the same
    // enforcement the LV-1 leveler + emitGatedKeywords control-gate grants ride), so the keyword switches ON
    // exactly during the controller's turn and OFF otherwise, read live at every combat/keyword query.
    // ALL-OR-NOTHING (CREED): every segment after "has" must be an enforced/layer-aware grantable keyword
    // (GRANTABLE_KEYWORDS — the SAME set emitGatedKeywords validates), else NOTHING is emitted and the whole
    // clause stays residue → body-only. A P/T-set rider ("…has base power and toughness 5/2" — Snowmelt Stag)
    // or any non-keyword tail fails the allowlist → safe FN, never a fabricated grant. Whole-clause anchored;
    // a trailing "…, and <unmodeled>" splits into a non-grantable segment and drops the whole clause (CREED).
    // ── YOUR-TURN GATED **GROUP** KEYWORD GRANT (Anara, Wolvid Familiar "During your turn, commanders you
    // control have indestructible"; Bedrock Tortoise "During your turn, creatures you control have hexproof").
    // ⭐ BOTH HALVES ALREADY EXISTED AND HAD NEVER MET: the group grant emits a `dynamic` selector descriptor,
    // and `gate:{kind:"yourTurn"}` is the same gate the SELF arms right below have used since BLITZ ST-2
    // (layers.gateMet reads state.activePlayer === controller; permanentHasKeyword / keywordSet both honour
    // op.gate). Only the combination was unreachable. So this does NO new parsing and invents NO new gate — it
    // strips the time prefix, runs the clause through the EXISTING group-grant parser, and stamps the EXISTING
    // gate onto whatever that parser produced.
    // ⛔ ALL-OR-NOTHING (CREED): the inner parse must yield ≥1 descriptor and EVERY one must be an ungated
    // layer-6 addKeyword, else NOTHING is emitted → residue → body-only.
    // ⚠️ THE `every(...)` HALF IS DEFENSIVE AND UNEXERCISABLE TODAY — say so rather than let a green mutation
    // imply otherwise. The anchor already requires "have|has", and EVERY "…you control have <X>" clause that
    // parses at all currently yields addKeyword descriptors (a "get +N/+N" buff is a different lane the anchor
    // never admits; "have base power and toughness 5/5" and a quoted-ability grant both parse to []). So
    // removing the type check moves nothing and its mutation does not fail. It is kept because the inner
    // parser is shared and free to grow a new descriptor kind — at which point this is the line that stops it
    // being silently mis-gated. The `inner.length` half IS live (an unparseable inner clause emits nothing).
    const dtg = c.match(/^during your turn, .+ you control (?:have|has) .+$/);
    if (dtg) {
      const inner = [];
      parseClause(clause.replace(/^\s*during your turn,\s*/i, ""), inner, selfName, selfType);
      if (inner.length && inner.every((d) => d?.layer === 6 && d?.op?.layerOp === "addKeyword" && !d.op.gate)) {
        for (const d of inner) out.push({ ...d, op: { ...d.op, gate: { kind: "yourTurn" } } });
      }
      return; // handled, or intentionally dropped to body-only on a non-keyword inner parse
    }
    const dtk = c.match(/^during your turn, (?:this creature|it) (?:has|have) (.+)$/);
    if (dtk) {
      const segs = dtk[1].split(/,|\band\b/).map((s) => s.trim().replace(/[^a-z ]/g, "").trim()).filter(Boolean);
      if (segs.length && segs.every((s) => GRANTABLE_KEYWORDS.has(s))) {
        for (const s of segs) {
          out.push({ layer: 6, op: { layerOp: "addKeyword", keyword: canonicalKeyword(s), gate: { kind: "yourTurn" } }, affects: { mode: "self" }, duration: { kind: "permanent" } });
        }
      }
      return; // a your-turn keyword grant — handled (or intentionally dropped to body-only on a non-grantable tail)
    }
    // ── GATED-SELFBUFF: a STATIC self P/T buff GATED on a board threshold ("this creature gets +X/+Y as long
    // as you control a/another/N <type>") — Mire Kavu, Loam Lion, Grixis Grimblade. Same self-static family as
    // the for-each above (continuous, so exempt from the static-only "as long as" bail below), but the
    // magnitude is FIXED and applied only WHILE the gate holds; layers.js re-evaluates the gate every P/T
    // computation. parseControlGateSource must recognize the type (else NO descriptor → LOW → Arbiter).
    const gateM = c.match(/^(?:this creature|it) gets ([+-]\d+)\/([+-]\d+) as long as you control (a|an|another|two or more|three or more|\d+ or more) (.+)$/);
    if (gateM) {
      const gate = parseControlGateSource(gateM[3], gateM[4]);
      if (gate) {
        out.push({
          layer: 7,
          sublayer: "7c",
          op: { layerOp: "ptModifyGated", power: signed(gateM[1]), toughness: signed(gateM[2]), gate },
          affects: { mode: "self" },
          duration: { kind: "permanent" },
        });
      }
      // ⛔ FALL THROUGH when parseControlGateSource couldn't read the condition. This used to `return`
      // unconditionally, which SWALLOWED the clause before the fuller parseAsLongAsGate lane below ever saw
      // it — so "you control a blue creature" and even the already-shipped colour-OR form ("a black or
      // green permanent") died here, because this arm's type group is `(.+)` and matches anything while
      // parseControlGateSource only reads a single-word type. The clause still fails closed if nothing
      // downstream parses it; the only change is that something downstream now gets the chance.
      if (gate) return;
    }
    // ── GATED-SELFBUFF (prefix form) + GATED-KEYWORD (both forms) ─────────────────────────────────────────
    // Same control-threshold gate as the suffix P/T above, but (a) the "as long as" can LEAD the clause ("As
    // long as you control a Mountain, this creature has menace." — Summit Apes), and (b) the gated effect can
    // be a KEYWORD grant (layer 6, strictly validated). All reuse parseControlGateSource; a keyword gate and a
    // P/T gate share layers.gateMet, so they can never diverge.
    const GATE = "you control (a|an|another|two or more|three or more|\\d+ or more) (.+)";
    let gm = c.match(new RegExp(`^as long as ${GATE}, (?:this creature|it) gets ([+-]\\d+)\\/([+-]\\d+)$`));
    if (gm) {
      const gate = parseControlGateSource(gm[1], gm[2]);
      if (gate) {
        out.push({ layer: 7, sublayer: "7c", op: { layerOp: "ptModifyGated", power: signed(gm[3]), toughness: signed(gm[4]), gate }, affects: { mode: "self" }, duration: { kind: "permanent" } });
        return;
      }
      // else: fall through to the general lane (see the note on the suffix arm above)
    }
    gm = c.match(new RegExp(`^(?:this creature|it) has (.+?) as long as ${GATE}$`));
    if (gm) { const before = out.length; emitGatedKeywords(out, gm[1], gm[2], gm[3]); if (out.length > before || parseControlGateSource(gm[2], gm[3])) return; }
    gm = c.match(new RegExp(`^as long as ${GATE}, (?:this creature|it) has (.+)$`));
    if (gm) { const before = out.length; emitGatedKeywords(out, gm[3], gm[1], gm[2]); if (out.length > before || parseControlGateSource(gm[1], gm[2])) return; }
    // ── GATED-ARTIFACT / COMBINED: "gets P/T and has kw as long as you control …" ─────────────────────────
    // The PURE-P/T and PURE-KEYWORD forms above fall through to here on the COMBINED clause (they each
    // demand either "gets" OR "has" alone). emitGatedEffect handles the P/T-THEN-keyword parsing and
    // drops any non-grantable keyword or rider → LOW (CREED). parseControlGateSource rejects multi-word
    // types ("multicolored permanent", "red or white") → null → nothing emitted → safe false-negative.
    gm = c.match(new RegExp(`^(?:this creature|it) (gets .+? and has .+?) as long as ${GATE}$`));
    if (gm) {
      const gate = parseControlGateSource(gm[2], gm[3]);
      if (gate) emitGatedEffect(out, gm[1], gate);
      return;
    }
    gm = c.match(new RegExp(`^as long as ${GATE}, (?:this creature|it) (gets .+ and has .+)$`));
    if (gm) {
      const gate = parseControlGateSource(gm[1], gm[2]);
      if (gate) emitGatedEffect(out, gm[3], gate);
      return;
    }
    // ── EQUIPPED GATE: "as long as this creature is equipped, it gets/has …" ────────────────────────────
    // Equipment attachment is tracked per-permanent (permanent.attachedTo); gateMet handles { kind:"isEquipped" }
    // by scanning the battlefield for an Equipment whose attachedTo === this permanent's id. emitGatedEffect
    // applies the same CREED guard: menace/non-grantable keywords → nothing emitted → card stays LOW.
    gm = c.match(/^as long as (?:this creature|it) is equipped, (?:this creature|it) (.+)$/);
    if (gm) { emitGatedEffect(out, gm[1], { kind: "isEquipped" }); return; }
    // ── GATED-GY: a self P/T buff and/or keyword grant gated on a GRAVEYARD count (threshold / delirium) ──
    // Strip the flavor ability-word label first (CR 207.2c — "Threshold —" / "Delirium —" / "Descend N —"
    // carry no rules meaning), find the graveyard-count gate, then emit via the shared emitter (a rider →
    // nothing → LOW). Both clause orders work: the gate can trail or lead. The control-gate matchers above
    // never fire here (they need "you control"). GATED-GY-EXT: "Descend N" added to the strip.
    const gyClause = c.replace(/^(?:threshold|delirium|descend \d+)\s*[—–-]\s*/, "");
    const gy = parseGraveyardGate(gyClause);
    if (gy) {
      const eff = gyClause.replace(gy.match, "").replace(/^[\s,]+|[\s,]+$/g, "");
      // SELF shapes only (CA-1): a GROUP subject ("White creatures / Other creatures you control / All
      // Squirrels get … as long as … in your graveyard" — Divine Sacrament, Silver Seraph, Nut Collector)
      // falls THROUGH to the condition-gated GROUP anthem branch below, which scopes the same gate to the
      // SOURCE (gateOn:"source") over a dynamic selector. emitGatedEffect can only consume a self-subject
      // effect anyway (any other shape emitted nothing and parked), so this fall-through changes no self
      // card's behavior — it only stops the lane from swallowing group clauses it never modeled.
      if (/^(?:this creature\b|it\b|gets?\b|ha(?:s|ve)\b)/.test(eff)) {
        emitGatedEffect(out, eff, gy.gate);
        return;
      }
    }
    // ── SELF-COUNTER-GATE: a self P/T buff and/or keyword grant gated on THIS permanent's own +1/+1 counter
    // count ("this creature has trample as long as it has ten or more +1/+1 counters on it" — Primordial Hydra;
    // "…has lifelink as long as it has five or more +1/+1 counters on it" — Taborax). Same shared emitter as the
    // control/graveyard gates (a P/T-or-keyword effect + a strict rider guard → nothing → LOW). gateMet reads
    // the permanent's own counters and re-evaluates live. The control-gate matchers above never fire here (they
    // need "you control"); the line-1190 "as long as" catch-all bail is BELOW this, so the clause is handled here.
    const scg = parseSelfCounterGate(c);
    if (scg) {
      const eff = c.replace(scg.match, "").replace(/^[\s,]+|[\s,]+$/g, "");
      emitGatedEffect(out, eff, scg.gate);
      return;
    }
    // ── COUNTER-GATED TYPE-CHANGE (ARIXMETHES): a layer-4 type swap gated on THIS permanent's own NAMED counter
    // ("as long as it has a slumber counter on it, it's a land" — Arixmethes is a land, not a creature, until its
    // five slumber counters are removed). The gate is a bare PRESENCE of a named counter (threshold 1);
    // emitCounterGatedTypeChange models "it's a land" → gated addCardType Land + removeCardType Creature (the
    // printed "(It's not a creature.)" reminder is the card's own clarification, stripped upstream but functional
    // — a gated land is not a creature per the card). gateMet re-reads the slumber pile live, so the instant the
    // last counter is removed the type effect turns off and Arixmethes is a creature again (CR 613.7). STRICT:
    // any effect text other than the two modeled type deltas → nothing emitted → LOW (safe FN). The control /
    // graveyard / +1-+1 gates above never fire here (this is a named-counter PRESENCE gate, not "you control" /
    // "N or more +1/+1"), so the clause is handled here before the "as long as" catch-all bail below.
    const sncg = parseSelfNamedCounterPresenceGate(c);
    if (sncg) {
      const eff = c.replace(sncg.match, "").replace(/^[\s,]+|[\s,]+$/g, "");
      if (emitCounterGatedTypeChange(out, eff, sncg.gate, { type: selfType })) return;
    }
  }

  // ── SELF AS-LONG-AS GATES (BLITZ CA-2, CR 611.3a/b; layers 613.4c 7c P/T + 613.1f layer-6 keywords) ──
  // The SELF-subject twin of the CA-1 condition-gated GROUP anthems below: "[this creature] gets +X/+Y
  // [and has <kw>…] as long as <condition>" / "As long as <condition>, [this creature] gets/has …". The
  // SPECIFIC self lanes above (control-gate / equipped-prefix / graveyard / +1+1-counter threshold)
  // already returned on their shapes; every REMAINING self conditional routes through the SAME
  // parseAsLongAsGate the group branch uses — ONE shared condition vocabulary, so classifier credit and
  // layer enforcement can never diverge — and reduces through the SAME all-or-nothing emitGatedEffect
  // (any unconsumed rider → NOTHING emitted → body-only; CREED: FN-safe, FP-forbidden). gateOn is
  // STRIPPED: a self effect's gate subject IS the affected permanent (== the source), so every gate reads
  // the self permanent directly at every seam, including the layer-4 sites that call gateMet without
  // gatePermForEffect. Sits OUTSIDE the self block above because a per-turn-ledger condition ("you've
  // cast two or more spells this turn" — Brightspear Zealot) legitimately contains "this turn", which
  // that block's guard excludes; the effect side needs no duration guard here — emitGatedEffect emits
  // nothing unless the effect reduces COMPLETELY to a P/T delta and/or grantable keywords, which no
  // "until end of turn" / triggered / activated text can survive.
  if (!/^(?:when|whenever|at)\b/.test(c) && !/\bwhenever\b/.test(c) && !c.includes(":")) {
    // ⭐ THE EFFECT SIDE IS `.+`, NOT `(?:gets|has) .+`, AND THAT WAS A REAL BUG. Every gated lane in this
    // file — this one and the three control-gate arms above — demanded the effect open with "gets" or
    // "has", so a gate carrying a BARE permission or restriction ("As long as you control a Gate, this
    // creature CAN ATTACK as though it didn't have defender" — Ogre Jailbreaker; "As long as you control
    // another creature, ~ CAN'T ATTACK OR BLOCK" — Ethrimik) matched NO lane and parked. emitGatedEffect
    // knows those riders; nothing routed them to it. A pure path accident, and it cost ~10 cards.
    // ⛔ THE RETURN IS CONDITIONAL NOW, and the asymmetry is deliberate. For a "gets"/"has" effect the
    // return stays UNCONDITIONAL — that is this lane's documented contract (an unconsumed rider parks the
    // whole clause here, a safe FN) and later branches never handled those shapes anyway. For the newly
    // admitted shapes it returns ONLY on a real emission, because the widened regex now matches clauses
    // this lane has never owned, and swallowing them on a no-match would silently starve the branches
    // below. emitGatedEffect stays the CREED guard either way: an unrecognized rider emits nothing.
    const consumed = (eff, gate) => {
      const { gateOn: _gOn, ...selfGate } = gate;
      const before = out.length;
      emitGatedEffect(out, eff, selfGate);
      return out.length > before || /^(?:gets|has)\b/.test(eff);
    };
    let sm = c.match(/^(?:this creature|it) (.+?) as long as (.+)$/);
    let sg = sm && parseAsLongAsGate(sm[2]);
    if (sm && sg && consumed(sm[1], sg)) return;
    sm = c.match(/^as long as (.+?), (?:this creature|it) (.+)$/);
    sg = sm && parseAsLongAsGate(sm[1]);
    if (sm && sg && consumed(sm[2], sg)) return;
  }

  // ── CHOSEN-TYPE COUNT-ANTHEM (layer 7c dynamic) — Banner of Kinship / Door of Destinies ──────────────
  // "Creatures you control of the chosen type get +1/+1 for each <name> counter on this artifact." The
  // anthem applies to creatures the SOURCE's controller controls that carry the source's stored chosenType
  // (CR 614.12 — picked at ETB, resolvers.autoPickCreatureType; subtype OR changeling, layers.matchesSelector
  // chosenTypeOfSource), scaled by the number of <name> counters on the SOURCE artifact itself (layers'
  // ptModifyDynamicCount countersOnSource branch reads e.source's counters live). Both halves re-evaluate
  // every P/T computation, so the buff tracks the counter and the chosen type with NO ETB snapshot. The
  // counter NAME is captured (fellowship / charge) so the count reads the exact counter the card uses.
  // Whole-clause anchored end-to-end ("…on this artifact"); a rider or a different count source → no match →
  // the clause falls through (NO descriptor here) and the card stays Arbiter (CREED: a magnitude we can't
  // evaluate would over/under-buff). Placed BEFORE the static-only "for each" guard and the generic group
  // count-anthem (whose parseCreatureSelector/parseSelfCountSource don't recognize the chosen-type subject
  // or the counter-on-source magnitude). The card-name was normalized to "this artifact" only if it equals
  // the printed name; the printed text already says "this artifact", so the literal anchor is correct.
  // ── HANCOCK-CLASS dynamic anthem (SHELF S7): "each other creature you control that's a <A> or <B>
  // gets +X/+X, where X is the number of counters on this creature" — a subtype-UNION anthem whose
  // magnitude is the TOTAL counters on the SOURCE (any kind — countersOnSource with counterType null),
  // re-read every P/T computation so the buff tracks the counters live. excludeSelf per the printed
  // "other". The self-name was normalized to "this creature" upstream (selfNormalizeOracle). Whole-
  // clause anchored; any other subject/magnitude shape falls through → body-only (CREED).
  {
    const huM = c.match(/^each other creature you control that's an? ([a-z]+) or (?:an? )?([a-z]+) gets \+x\/\+x, where x is the number of counters on this creature$/);
    if (huM) {
      out.push({
        layer: 7,
        sublayer: "7c",
        op: { layerOp: "ptModifyDynamicCount", countSpec: { kind: "countersOnSource", counterType: null }, perPower: 1, perToughness: 1 },
        affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"], subtypes: [huM[1], huM[2]], excludeSelf: true } },
        duration: { kind: "permanent" },
      });
      return;
    }
  }

  {
    const ctM = c.match(/^creatures you control of the chosen type get \+(\d+)\/\+(\d+) for each ([a-z]+) counter on this artifact$/);
    if (ctM) {
      out.push({
        layer: 7,
        sublayer: "7c",
        op: {
          layerOp: "ptModifyDynamicCount",
          countSpec: { kind: "countersOnSource", counterType: ctM[3] },
          perPower: parseInt(ctM[1], 10),
          perToughness: parseInt(ctM[2], 10),
        },
        affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"], chosenTypeOfSource: true } },
        duration: { kind: "permanent" },
      });
      return;
    }
  }

  // ── GROUP COUNT-ANTHEM (layer 7c dynamic) — "<group> get +N/+N for each <live-board count-source>" ──
  // Sliver Legion ("All Sliver creatures get +1/+1 for each other Sliver on the battlefield") + tribal
  // count-lords. The SAME dynamic-count layer the SELF count-buff (above) uses, applied to a GROUP
  // (affects: selector) and re-evaluated per affected creature. Placed BEFORE the static-only guard (which
  // bails on "for each"); guarded here against triggered/activated/one-shot so only a STATIC anthem flips.
  // parseSelfCountSource must recognize the source as a LIVE-BOARD count (subtype on the battlefield) — a
  // counter-on-source / unmodeled source → NO descriptor → body-only (CREED: a magnitude we can't evaluate,
  // or whose counter-placement isn't modeled, would over/under-buff). The SELECTOR's excludeSelf (who is
  // buffed) and the COUNT's excludeSelf (the "other" magnitude) are independent: Sliver Legion buffs ALL
  // Slivers incl. itself, each by (#Slivers − 1). Whole-clause anchored; a rider after the count → no match
  // → body-only. RETURN after (handled or dropped) so the flat-anthem pass never emits a WRONG fixed buff.
  if (
    !/^(?:when|whenever|at)\b/.test(c) && !/\bwhenever\b/.test(c) && !c.includes(":") &&
    !/\buntil end of turn\b/.test(c) && !/\bthis turn\b/.test(c)
  ) {
    const caM = c.match(/^(.+?) gets? ([+-]\d+)\/([+-]\d+) for each (.+)$/);
    if (caM && !/^(?:this creature|it)\b/.test(caM[1])) {   // the self form is handled above
      const affects = parseCreatureSelector(c);
      const countSpec = parseSelfCountSource(caM[4]);
      if (affects && countSpec) {
        out.push({
          layer: 7,
          sublayer: "7c",
          op: { layerOp: "ptModifyDynamicCount", countSpec, perPower: signed(caM[2]), perToughness: signed(caM[3]) },
          affects,
          duration: { kind: "permanent" },
        });
      }
      return;
    }
  }

  // ── GOD-DEVOTION conditional creature-type gate (layer 4, CR 613.1d type-changing; CR 700.5 devotion) ──
  // "As long as your devotion to <color>[ and <color>] is less than N, [this God] isn't a creature." (the
  // Theros Gods — Nylea, Heliod, Purphoros, Thassa, Karametra, …). Devotion to a color = the number of mana
  // symbols of that color among the mana costs of the permanents the controller controls (CR 700.5); a
  // two-color clause sums BOTH colors' symbols. While that count is BELOW the threshold the God loses its
  // Creature type (a layer-4 REMOVAL — it stays an Enchantment but isn't a creature, so it can't attack/block
  // and isn't a valid creature target); at/above the threshold it's a creature again. The reminder text "(Each
  // {G} … counts toward your devotion …)" was already dropped by abilityClauses (paren-aware). The self-subject
  // is matched as EITHER the selfNormalizeOracle-rewritten "this creature" OR the printed God's own bare name (a
  // lowercased name-like run, optional comma-clauses for "Nylea, God of the Hunt") — because the composite
  // residue check (coverage.permanentFullyCovered) re-parses the RAW, un-normalized oracle, so the subject there
  // is still the literal name (e.g. "nylea"). The devotion-gate template is only ever printed on a God referring
  // to ITSELF (no card uses "as long as your devotion … X isn't a creature" about a DIFFERENT permanent), so
  // accepting any name-like subject is CREED-safe — it can never fabricate a gate on the wrong permanent.
  // Emitted as a SELF-affecting layer-4 descriptor; layers.applyTypeColorLayers / effectiveTypeIdentity remove
  // "Creature" when the live devotion (a board scan of the controller's permanents' pips) is < atLeast. This is
  // a genuine model of the whole clause (NOT a drop), so it must run BEFORE the "as long as" static-only guard
  // below (which would otherwise bail on the conditional). A non-devotion "as long as" clause doesn't match
  // here and still falls through to that guard (CREED: a miss is a safe body-only, never a fabricated gate).
  const devoM = c.match(/^as long as your devotion to (white|blue|black|red|green)(?: and (white|blue|black|red|green))? is less than (one|two|three|four|five|six|seven|eight|nine|ten|\d+), (?:this creature|[a-z][a-z' -]*(?:, [a-z][a-z' -]*)*) isn't a creature$/);
  if (devoM) {
    const colors = [COLOR_WORDS[devoM[1]]];
    if (devoM[2]) colors.push(COLOR_WORDS[devoM[2]]);
    const atLeast = GY_NUMWORD[devoM[3]] ?? (parseInt(devoM[3], 10) || 0);
    if (atLeast > 0) {
      out.push({
        layer: 4,
        op: { layerOp: "removeTypeWhileDevotionBelow", removeType: "Creature", colors, atLeast },
        affects: { mode: "self" },
        duration: { kind: "permanent" },
      });
    }
    return; // the devotion gate is fully modeled (or, on a malformed threshold, a safe body-only) — handled
  }

  // ── CONDITION-GATED GROUP ANTHEMS (BLITZ CA-1, CR 611.3a/b continuous statics; layers 613.4c / 613.1f) ──
  // The "as long as <board condition>" GROUP anthem family the SF-1/GA-1 slices parked behind the "as long
  // as" static-only bail below: "White creatures get an additional +1/+1 as long as there are seven or more
  // cards in your graveyard" (Divine Sacrament), "Metalcraft — Creatures you control get +3/+0 as long as
  // you control three or more artifacts" (Jor Kadeen), "As long as [this creature] is equipped, Cat
  // creatures you control get +2/+2 and have double strike" (Raksha Golden Cub), "Each untapped creature
  // you control gets +0/+2 as long as it's not attacking" (Arcades Sabboth). The condition becomes a
  // serializable GATE (parseAsLongAsGate — only conditions with an existing exact evaluator; per-source
  // gates carry gateOn:"source", per-candidate gates read the affected creature) that layers.gateMet
  // re-evaluates LIVE at every P/T derive and keyword read (CR 611.3a — never locked in), so the anthem
  // flips exactly when the graveyard crosses seven, the third artifact leaves, the Equipment unattaches,
  // or the creature is declared an attacker. The de-conditioned remainder must reduce COMPLETELY to a
  // recognized creature selector + "get ±X/±Y" and/or all-grantable keywords (emitGatedGroupEffect,
  // all-or-nothing); the "also get" / "get an additional" stacking markers (Jetmir / Divine Sacrament —
  // each line is an independent additive 7c effect, CR 613.7 commuting) are normalized away first. A SELF
  // subject ("this creature…" — the self gated lanes above already returned on their matches) is rejected
  // so an unmodeled self conditional (hellbent / celebration / infusion …) can never leak into a bogus
  // group selector. An unrecognized condition or an unconsumed rider emits NOTHING → the clause parks →
  // body-only (CREED: false-negative SAFE, false-positive FORBIDDEN).
  {
    // EXACTLY-ONE-CREATURE bind (Homicidal Seclusion / Deadly Wanderings): "As long as you control exactly
    // one creature, that creature gets …". While the gate holds, "creatures you control" IS "that creature"
    // (the set has exactly one member), so a your-creatures selector + an atLeast:1/atMost:1 board-count
    // gate is EXACT at every board size: 0 creatures → gate closed (nobody buffed), 1 → that creature
    // buffed, 2+ → gate closed. Whole-clause anchored on the printed template.
    const exM = c.match(/^as long as you control exactly one creature, that creature ((?:gets|has) .+)$/);
    if (exM) {
      emitGatedGroupEffect(
        out, exM[1],
        { countSpec: { kind: "permanentsYouControl", cardType: "Creature" }, atLeast: 1, atMost: 1, gateOn: "source" },
        { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"] } },
      );
      return; // handled (or an unconsumed rider parked the clause — safe FN)
    }
    // ANIMATED-LAND anthem (Earth Surge): "Each land gets +X/+Y as long as it's a creature." The condition
    // IS a type test the selector already evaluates exactly — matchesSelector's cardTypes gate ANDs over the
    // candidate's EFFECTIVE (printed ∪ layer-4 animated) types, so cardTypes ["Creature","Land"] selects
    // precisely the lands that are creatures right now, live at every derive (no gate object needed).
    const esM = c.match(/^each land gets ([+-]\d+)\/([+-]\d+) as long as it's a creature$/);
    if (esM) {
      out.push({
        layer: 7, sublayer: "7c",
        op: { layerOp: "ptModify", power: signed(esM[1]), toughness: signed(esM[2]) },
        affects: { mode: "dynamic", selector: { controllerScope: "each", cardTypes: ["Creature", "Land"] } },
        duration: { kind: "permanent" },
      });
      return;
    }
    // GENERAL FORM — trailing "<subject+effect> as long as <cond>" (greedy split: the LAST "as long as"),
    // else leading "As long as <cond>, <subject+effect>". The gate must parse AND the remainder must fully
    // reduce, or nothing is emitted.
    let gate = null, rest = null;
    let m = c.match(/^(.+) as long as (.+)$/);
    if (m && (gate = parseAsLongAsGate(m[2]))) rest = m[1];
    if (!rest) {
      m = c.match(/^as long as (.+?), (.+)$/);
      if (m && (gate = parseAsLongAsGate(m[1]))) rest = m[2];
    }
    if (rest) {
      // Stacking markers: "Creatures you control ALSO get …" (Jetmir lines 2-3) / "get AN ADDITIONAL +1/+1"
      // (Divine Sacrament) — each line is its own additive layer-7c effect, so the markers carry no extra
      // rules meaning here; normalize them away so the selector/effect anchors see the plain anthem shape.
      rest = rest.replace(/\balso (gets?|has|have)\b/, "$1").replace(/\b(gets?) an additional (?=[+-]\d)/, "$1 ");
      // SELF/BOUND subjects park: the self gated lanes above own "this creature/it"; an aura's
      // "enchanted creature" and an Equipment's "equipped creature" belong to the attachment lanes.
      const em = rest.match(/^(.+?)\s+(gets? [+-]\d+\/[+-]\d+.*|(?:has|have)\s+.+)$/);
      if (em && !/^(?:this\b|that\b|it\b|it's\b|its\b|enchanted\b|equipped\b)/.test(em[1])) {
        const affects = parseCreatureSelector(rest);
        if (affects) emitGatedGroupEffect(out, em[2], gate, affects);
      }
      return; // an as-long-as group clause — handled, or parked with NO descriptor (body-only, CREED-safe)
    }
  }

  // ── STATIC-ONLY GUARD (CLAUDE.md §1.2: a miss is safe; a false grant is forbidden) ──
  // A continuous effect is created only by a STATIC ability. Bail on any marker of a
  // triggered / activated / one-shot / variable / conditional ability so we never
  // fabricate a PERMANENT board buff the oracle doesn't grant statically. Examples
  // this rejects (each verified to formerly false-match): "Whenever ~ attacks, other
  // creatures you control get +1/+1 until end of turn." (triggered), "{G}: Creatures
  // you control get +1/+1 until end of turn." (activated), "Other Sliver creatures
  // get +1/+1 for each other Sliver" (variable — can't quantify), "...get +2/+2 as
  // long as you control a Forest." (conditional — can't evaluate).
  if (
    /^(?:when|whenever|at)\b/.test(c) ||      // triggered ability (leading keyword)
    /\bwhenever\b/.test(c) ||                 // embedded trigger (comma-joined clause)
    c.includes(":") ||                        // activated ability ("cost: effect")
    /\buntil end of turn\b/.test(c) ||        // one-shot duration, not static
    /\bthis turn\b/.test(c) ||                // one-shot duration, not static
    /\bfor each\b/.test(c) ||                 // variable magnitude we can't quantify
    /\bas long as\b/.test(c)                  // conditional we can't evaluate
  ) {
    return;
  }

  // ── Non-creature indestructible grant (layer 6, 613.1f) ─────────────────────
  // "<Artifacts|Enchantments|Lands|Permanents> [you control] are/have indestructible" —
  // the linking-verb ("are/is indestructible") + permanent-type templating the creature
  // selector below can't express. Grants indestructible (the one modeled non-combat keyword)
  // to the matching permanents; the layer engine's selector applies the cardTypes filter, so a
  // grant-to-self ("Artifacts you control are indestructible" → Darksteel Forge protects itself)
  // and a broad "permanents you control" (Avacyn) both resolve correctly. ALL-OR-NOTHING: the
  // tail must reduce EXACTLY to "indestructible" (a combined "indestructible and hexproof" we
  // can't fully model drops out → Arbiter, never a silent partial grant). Creature "<creatures>
  // … have <kw>" grants stay on the anthem path below (it also handles combat-keyword combos).
  // The symmetric "<type>s are indestructible" (no "you control") → controllerScope "each" is
  // intentional and corpus-validated: the only real card it hits is Terra Eternal ("All lands
  // have indestructible"), for which an all-players grant IS correct.
  const grantM = c.match(/^(all|other|each)?\s*(artifacts?|enchantments?|lands?|permanents?)\s+(?:you control\s+)?(?:are|is|have|has)\s+(.+)$/);
  if (grantM) {
    const tail = grantM[3].replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
    if (tail === "indestructible") {
      out.push({
        layer: 6,
        op: { layerOp: "addKeyword", keyword: "indestructible" },
        affects: {
          mode: "dynamic",
          selector: {
            controllerScope: /\byou control\b/.test(c) ? "you" : "each",
            cardTypes: PERMANENT_TYPE_CARD_TYPES[grantM[2]],
            excludeSelf: grantM[1] === "other",
          },
        },
        duration: { kind: "permanent" },
      });
      return; // a non-creature type subject never also carries a creature anthem
    }
  }

  // ── GROUP-AFFLICT GRANT (CR 702.131) — "<selector> have afflict N" ──────────────────────
  // Afflict is a TRIGGERED-ability keyword ("Whenever this creature becomes blocked, defending player loses
  // N life"), NOT a static-characteristic keyword — so it is NOT in GRANTABLE_KEYWORDS (a plain layer-6
  // addKeyword would make permanentHasKeyword report it but NEVER fire the trigger). Instead grant it exactly
  // like a QUOTED triggered-ability group grant (the Tempered Sliver path below): emit a layer-6 addAbility
  // whose grant.quoted is the CANONICAL afflict sentence. At runtime grantedTriggersForGroup re-runs
  // detectTriggers on that quoted body → a becomesBlocked descriptor → checkBlockTriggers fires it on each
  // matching creature that becomes blocked (with the defending player threaded). The bare "afflict N" tail is
  // anchored WHOLE (no combo with other keywords exists in the corpus — Lazotep Sliver, Cyberman Patrol, Lost
  // Monarch of Ifnir are all bare "have afflict N"); a combined tail would fall through to the all-or-nothing
  // guard below and stay body-only (CREED-safe FN). parseCreatureSelector supplies the same subtype/card-type/
  // color-scoped `affects` the quoted-triggered path uses, so the grant reaches exactly the selected creatures.
  {
    const afflictM = c.match(/^(.+?)\s+(?:have|has)\s+afflict (\d+)$/);
    if (afflictM) {
      const affects = parseCreatureSelector(c);
      if (affects) {
        out.push({
          layer: 6,
          op: { layerOp: "addAbility", grant: { kind: "triggered", quoted: `Whenever this creature becomes blocked, defending player loses ${afflictM[2]} life.` } },
          affects,
          duration: { kind: "permanent" },
        });
      }
      return; // an afflict group grant — handled (or intentionally dropped to body-only on an unparsed selector)
    }
  }

  // ── STATIC-ANTHEM keyword/protection-grant ALL-OR-NOTHING GUARD (CLAUDE.md §1.2) ────────
  // The anthem grant pass below is NOT all-or-nothing on its own: a naive extractor silently DROPS any
  // segment that isn't a grantable keyword and still emits the grantable ones. So a clause like
  // "Creatures you control have flying, …, and protection from black and from red" (Akroma's Memorial)
  // would grant flying/first-strike/… while DROPPING the protection — a partial flip = a FORBIDDEN false
  // positive (also Avatar of Slaughter / Hellraiser Goblin "attack each combat if able"; Giant Ankheg
  // "ward {2}"). parseAnthemHaveTail is the SINGLE all-or-nothing oracle: it returns the modeled
  // { keywords, protColors } ONLY if EVERY segment is a grantable keyword OR a pure protection-from-COLOR
  // span (CR 702.16 — the same layer-6 addProtection the EQUIP/Aura path emits, enforced layer-aware by
  // layers.permanentProtectionColors over the dynamic anthem `affects`). null ⇒ a lossy/unmodeled tail.
  // Hoisted ABOVE both the P/T pass and the keyword pass because the P2.10 combined "get +X/+Y and have
  // <tail>" pushes the layer-7c P/T descriptor BEFORE the grant pass — so a lossy tail must prevent BOTH
  // descriptors, not just the grant one. A lossy "have <tail>" leaves the WHOLE clause body-only (clean FN).
  // ── GROUP AS-THOUGH DEFENDER ESCAPE (CR 609.4b) — "Creatures you control can attack as though they
  // didn't have defender." (High Alert, Felothar the Steadfast, Rolling Stones). The GROUP twin of the self
  // form; same pseudo-keyword, honored at the two attack-declaration enumeration sites, so the creatures
  // keep defender for every other reader — including this card's OWN other line, which usually reads
  // "each creature you control WITH DEFENDER assigns combat damage equal to its toughness".
  // ⛔ PLACED ABOVE THE have-TAIL LANE ON PURPOSE, and this is not a style preference. That lane matches
  // `have (.+)$` — and this clause ENDS in "…didn't have DEFENDER". If it ever reached there, the tail
  // "defender" is a grantable keyword and the card would GRANT DEFENDER to every creature you control:
  // the exact opposite of what it says, from a card whose whole purpose is letting Walls attack. It emits
  // nothing today only because the selector parse happens to fail on the full clause — luck, not a
  // guarantee. The anti-FP is pinned in attacksIgnoringDefender.test.js; keep this lane first.
  {
    const gd = c.match(/^(.+?) can attack as though (?:they|it) did\s?n[‘’']?t have defender$/);
    const affects = gd && parseCreatureSelector(`${gd[1]} have`);
    if (affects) {
      out.push({ layer: 6, op: { layerOp: "addKeyword", keyword: "attacksIgnoringDefender" }, affects, duration: { kind: "permanent" } });
      return;
    }
  }
  const haveMatch = c.match(/\b(?:have|has)\s+(.+)$/);
  const anthemGrant = haveMatch && parseCreatureSelector(c) ? parseAnthemHaveTail(haveMatch[1]) : null;
  if (haveMatch && parseCreatureSelector(c) && !anthemGrant) {
    return;
  }

  // ── P/T anthems / lords (layer 7c, 613.4c) ──────────────────────────────────
  // "get +X/+Y" with explicit signs is the anthem/lord signature.
  const ptMatch = c.match(/\bgets?\s+([+-]\d+)\/([+-]\d+)\b/);
  if (ptMatch) {
    const power = signed(ptMatch[1]);
    const toughness = signed(ptMatch[2]);
    const affects = parseCreatureSelector(c);
    // ⛔ LOSSY-TAIL GUARD — the missing twin of the have-tail guard above, and its absence was a live FP:
    // "Creatures you control get +1/+1 and can't be blocked." emitted ONLY the pump and classified
    // native-static, silently dropping the restriction. So did "…and glorbulate" — any tail at all.
    // The have-tail path is validated by parseAnthemHaveTail; ANY OTHER trailing text means the clause says
    // more than the descriptors carry, so the whole clause must drop (a clean FN → Arbiter) rather than
    // credit a card for half its printed effect.
    //
    // ⚠️ HOW IT WAS FOUND, because the lesson generalizes: two CREED pins claimed to cover this and passed
    // for the WRONG REASON — an unrelated unaccounted line (the ETB chosen-type chooser) was parking their
    // fixtures, not the consumption check they named. The moment that line became explained, both pins went
    // red and the pre-existing hole was visible. A pin that passes is not evidence it is testing what it says.
    if (affects) {
      const tail = c.slice(c.indexOf(ptMatch[0]) + ptMatch[0].length)
        .replace(/^\s*and\s+/, "").replace(/[.\s]+$/, "").trim();
      if (tail && !(haveMatch && anthemGrant)) return;
      out.push({
        layer: 7,
        sublayer: "7c",
        op: { layerOp: "ptModify", power, toughness },
        affects,
        duration: { kind: "permanent" },
      });
      // P2.10: do NOT return — a clause can grant a buff AND a keyword in one breath
      // ("creatures you control get +1/+1 and have vigilance"). Fall through so the
      // keyword-grant pass below also fires (it no-ops when there's no "have <kw>").
    }
  }

  // ── Keyword + protection grants (layer 6, 613.1f / CR 702.16) ────────────────
  // "<selector> have <keyword>[ and <keyword>…][ and protection from <color>…]" — the all-or-nothing guard
  // above already returned on a lossy tail, so `anthemGrant` here holds the FULLY-modeled { keywords,
  // protColors } (every segment was a grantable keyword or a pure protection-from-COLOR span). Each keyword
  // → a layer-6 addKeyword; the protection colors → ONE layer-6 addProtection — both carrying the SAME
  // anthem `affects` selector, so layers.permanentProtectionColors (which reads addProtection through the
  // identical effectAffects the keyword ops use) confers the protection to exactly the selected creatures
  // (yours only for "you control"; symmetric for "all/each"). Akroma's Memorial / Righteous War /
  // Absolute Grace+Law all flip here; the protection is enforced at the same three sites a printed/Equipment
  // protection is (combat damage / block / targeting).
  if (haveMatch && anthemGrant) {
    const affects = parseCreatureSelector(c);
    if (affects) {
      for (const kw of anthemGrant.keywords) {
        out.push({ layer: 6, op: { layerOp: "addKeyword", keyword: kw }, affects, duration: { kind: "permanent" } });
      }
      if (anthemGrant.protColors.length) {
        out.push({ layer: 6, op: { layerOp: "addProtection", colors: anthemGrant.protColors }, affects, duration: { kind: "permanent" } });
      }
      // GRANTED WARD (CR 702.21) — the SAME layer-6 addWard op the counter-gated grant (Cathedral Acolyte)
      // and the Equipment rider (Lavaspur Boots) already emit, carrying a LIFE cost instead of generic pips.
      // ward.js unions it with any printed ward at the tax site, so this is ENFORCED, not parse-only.
      if (anthemGrant.wardLife) {
        out.push({ layer: 6, op: { layerOp: "addWard", life: anthemGrant.wardLife }, affects, duration: { kind: "permanent" } });
      }
    }
  }
}

/**
 * STATIC-ANTHEM all-or-nothing tail parser (CLAUDE.md §1.2). Reduce an anthem "have <tail>" to the
 * FULLY-modeled { keywords:[canonical…], protColors:[WUBRG…] }, or null if ANY part is unmodeled (so the
 * caller leaves the WHOLE clause body-only — a clean false-negative, never a partial flip). Two modeled
 * segment kinds, in one pass so the good/bad decision and the emitted descriptors can't drift:
 *   1. a grantable KEYWORD (flying, trample, indestructible, …) — comma/"and"-separated;
 *   2. a single PROTECTION-FROM-COLOR span ("protection from black", "… and from red" — CR 702.16g),
 *      validated via parseAttachedProtectionColors (the SAME pure-color parser the EQUIP/Aura path uses,
 *      which rejects a non-color/dynamic quality → null → whole tail unmodeled).
 * The protection span always trails (every corpus anthem — Akroma's Memorial / Righteous War / Absolute
 * Grace+Law — ends in it), and its internal "and from"/"and" must NOT be read as keyword separators, so
 * it's sliced off FIRST (anchored at "protection from") and the REMAINDER is the keyword list. A leftover
 * non-keyword segment (a quoted ability, "ward {2}", "attack each combat if able", a NON-color protection)
 * ⇒ null. At most ONE protection span is modeled (a second "protection from …" elsewhere ⇒ null).
 */
function parseAnthemHaveTail(tail) {
  let s = String(tail).trim();
  let protColors = [];
  // ── GRANTED WARD-PAY-LIFE (Hexing Squelcher, Hag of Mage's Doom — CR 702.21) ───────────────
  // '<selector> have "Ward—Pay N life."' Peeled here, BEFORE the keyword list, for the same reason
  // the protection span is: the segment splitter would hand "ward—pay 2 life" to the grantable-keyword
  // check as one word-ish blob, fail it, and null the WHOLE tail. The comment above this function already
  // named a ward have-tail (Giant Ankheg) as a deliberate rejection — this graduates the LIFE form only.
  //
  // The printed quotes are optional in the match but meaningless to the rules (CR 702.21 — a granted
  // keyword ability is the same ability whether or not the grant quotes it), so both spellings parse.
  // ONLY "pay N life" is modeled, mirroring ward.parseWardCost exactly: a granted Ward—Sacrifice
  // (Mishra, Tamer of Mak Fawa) or Ward—Discard has no payer-choice model, so it must stay unparsed and
  // null the tail rather than be silently dropped from a card that still gets credited. Mana-cost ward
  // grants keep their own `generic` channel (Cathedral Acolyte) and are not routed through here.
  let wardLife = 0;
  {
    const wm = s.match(/"?\bward\s*[\u2014-]\s*pay\s+(\d+)\s+life\.?"?/i);
    if (wm) {
      wardLife = parseInt(wm[1], 10);
      s = (s.slice(0, wm.index) + s.slice(wm.index + wm[0].length))
        .replace(/\s*,\s*and\s*/gi, ", ").replace(/^[,\s]+|[,\s]+$/g, "").replace(/\s+and$/i, "").trim();
    }
    // NOTE: no explicit "reject any other ward span" guard here. I wrote one, and a mutation proved it
    // dead — the keyword loop below already rejects "ward—sacrifice a permanent" / "ward {2}" (it strips
    // to a non-grantable word), so the line could be disabled without a single test noticing. Belt-and-
    // braces that no mutation can kill is dead code justified by a hypothetical; the refusal is pinned by
    // the grantable-keyword check instead, and grantedWardLife.test.js asserts it for sacrifice, discard
    // and the mana form. If "ward" is ever ADDED to GRANTABLE_KEYWORDS, re-read this: a bare "Ward." would
    // then parse as a costless keyword grant, and that is the change that needs the guard, not this one.
  }
  const pm = s.match(/\bprotection from\b/i);
  if (pm) {
    // Everything from "protection from" onward is the protection span (it runs to the clause end). Validate
    // it as a PURE color list; a non-color/dynamic quality → null (whole tail unmodeled, CREED-safe FN).
    const protSpan = s.slice(pm.index).trim().replace(/[,\s]+$/, "");
    const parsed = parseAttachedProtectionColors(protSpan);
    if (!parsed) return null;
    protColors = parsed;
    // The keyword remainder is the text BEFORE the protection span, minus the trailing ", and"/"and"/","
    // connector that joined it ("flying, …, haste, and protection from …" → "flying, …, haste").
    s = s.slice(0, pm.index).replace(/[,\s]+$/, "").replace(/\s+and$/i, "").replace(/[,\s]+$/, "").trim();
    // A SECOND "protection from …" inside the remainder is not modeled (only one span) → bail.
    if (/\bprotection from\b/i.test(s)) return null;
  }
  // Whatever remains must be exactly a grantable-keyword list; ANY other segment ⇒ null (the WHOLE tail is
  // unmodeled). An empty remainder is fine when a protection span was present (a protection-only grant).
  const keywords = [];
  for (const raw of s.split(/,|\band\b/)) {
    const word = raw.trim().replace(/[^a-z ]/g, "").trim();
    if (!word) continue;
    if (!GRANTABLE_KEYWORDS.has(word)) return null;
    keywords.push(canonicalKeyword(word));
  }
  if (keywords.length === 0 && protColors.length === 0 && !wardLife) return null; // nothing recognized
  return { keywords, protColors, ...(wardLife > 0 && { wardLife }) };
}

const canonicalKeyword = canonicalCombatKeyword;

/**
 * Build the AffectSpec selector for a creature-buff clause, or null if the clause
 * isn't a recognized "<creatures> [you control]" target. Always restricts to
 * Creatures (cardTypes:["Creature"]) so a non-creature is never buffed by a
 * creature anthem, and recognizes:
 *   - "(all|other|each) <Subtype>s [creatures] you control" → tribal lord
 *   - "<color> creatures you control"                       → color anthem
 *   - "creatures you control"                               → generic anthem
 *   - "all/other <Subtype>s" (no "you control")             → symmetric tribal
 * "other" sets excludeSelf (the lord doesn't pump itself); "you control" scopes
 * to the source's controller, otherwise the effect is symmetric ("each").
 */
function parseCreatureSelector(c) {
  const youControl = /\byou control\b/.test(c);
  const controllerScope = youControl ? "you" : "each";

  // Every pattern is ANCHORED to the clause start (^): the buffed set must be the
  // SUBJECT of the clause. This is what stops a comma-joined effect body (e.g. the
  // tail of a trigger after the static guard) from matching as an anthem.

  // ATTACKING anthem (BLITZ AT-1 — Orcish/Goblin Oriflamme, War Horn: "Attacking creatures you control
  // get +1/+0"): a combat-state-scoped anthem. The selector's `attacking` gate reads state.combat.attackers
  // — NON-layered state (the requiresCounter class, no layer recursion) — re-evaluated per query, so the
  // pump appears the moment a creature is declared and vanishes when combat clears.
  if (/^attacking creatures?\s+(?:you control\s+)?(?:gets?|gains?|has|have)\b/.test(c)) {
    return { mode: "dynamic", selector: { controllerScope: youControl ? "you" : "each", cardTypes: ["Creature"], attacking: true } };
  }

  // OPPONENT-DEBUFF anthem (BLITZ OD-1 — Cumber Stone / Haunter of Nightveil / Elesh Norn's second line /
  // Ethereal Absolution: "Creatures your opponents control get -N/-M"): matchesSelector's "opponents"
  // scope (candidate.controller !== the source's) — the exact mirror of the you-control anthem. The
  // negative P/T rides the same 7c ptModify; the lethal SBA reads layer-aware toughness, so a -2/-2
  // Elesh Norn board genuinely kills opposing X/2s.
  if (/^creatures your opponents control (?:gets?|gains?|has|have)\b/.test(c)) {
    return { mode: "dynamic", selector: { controllerScope: "opponents", cardTypes: ["Creature"] } };
  }

  // WITH-KEYWORD anthem (BLITZ WD-1 — Windstorm Drake / Empyrean Eagle / Spirit of the Spires: "Other
  // creatures you control with flying get +N/+M"): a keyword-property-filtered anthem. The selector's
  // withKeyword gate is enforced LAYER-AWARE in layers.matchesSelector (permanentHasKeyword — printed ∪
  // counter ∪ layer-6 grants), so an aura-granted flyer is buffed exactly like a printed one and drops
  // out when its grant expires. CURATED keyword (flying — the only ≥3-carrier evidence) and "you control"
  // scope only; any other property word falls through unmodeled (FN-safe). The verb anchor accepts the
  // anthem verbs, but a keyword-granting tail rides the SAME all-or-nothing machinery as every anthem —
  // matchesSelector's re-entry guard makes even a pathological keyword-reads-keyword pair terminate.
  const withKwM = c.match(/^(all|other|each)?\s*creatures? you control with (flying) (?:gets?|gains?|has|have)\b/);
  if (withKwM) {
    return { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"], withKeyword: withKwM[2], excludeSelf: withKwM[1] === "other" } };
  }

  // ===== NONTOKEN anthem (Always Watching, Thraben Watcher) — CR 111.1 ==========================
  // "Nontoken creatures you control get +1/+1 and have vigilance" and the "OTHER nontoken …" spelling.
  //
  // ⭐ THE MISSING HALF OF A PAIR. The TOKEN direction has shipped since Teysa Karlov ("Creature tokens you
  // control have vigilance and lifelink" → a `token: true` selector, enforced in layers.matchesSelector),
  // while `nontoken` existed ONLY as an EXCLUSION in NON_SUBTYPE_ANTHEM_WORDS — correctly blocked from the
  // tribal-lord path (a "Nontoken"-SUBTYPE grant selects zero creatures, a CREED FP) but never given a path
  // of its own. So both spellings parked while their mirror image was native.
  //
  // ⛔ THE EXCLUSION IS RIGHT AND STAYS. This does not relax NON_SUBTYPE_ANTHEM_WORDS; it matches the word
  // EXPLICITLY and emits a real `nontoken` selector predicate. The word is honoured as a FILTER, never
  // smuggled through as a fake subtype.
  //
  // ⛔ AND IT MUST FILTER AT RUNTIME, NOT MERELY PARSE. Crediting the card without the gate would pump the
  // tokens it explicitly excludes — the forbidden direction — so `matchesSelector`'s `nontoken` gate
  // (layers.js, the exact inverse of its token twin, same `card.token` stamp) ships in the same slice.
  //
  // ⛔ POSITION IS LOAD-BEARING, AND THIS IS WHY IT SITS *HERE* RATHER THAN BESIDE THE TOKEN ANTHEM BELOW:
  // the determiner arm just below ("(all|other|each) <word> [creatures] you control …") matches
  // "OTHER nontoken creatures you control …" with word="nontoken", hits the exclusion set, and RETURNS NULL —
  // pre-empting anything later. Placed beside its token twin, only the bare spelling worked and Thraben
  // Watcher stayed body-only. Verified by probe, not assumed. The regex demands the literal word "nontoken"
  // immediately before "creatures you control", so it cannot shadow any arm above or below it.
  //
  // Only "you control" is modeled — a symmetric "nontoken creatures have …" (none in the corpus) falls
  // through to null, a SAFE false-negative.
  const ntAnthem = c.match(/^(other\s+)?nontoken\s+creatures?\s+you control\s+(?:gets?|gains?|has|have)\b/);
  if (ntAnthem) {
    return {
      mode: "dynamic",
      selector: { controllerScope: "you", cardTypes: ["Creature"], nontoken: true, ...(ntAnthem[1] ? { excludeSelf: true } : {}) },
    };
  }

  // ===== MODIFIED anthem (CR 700.9) ==============================================================
  // "[Other] modified creatures you control have <keywords>" — Kodama of the West Tree, Artillery Enthusiast,
  // Envoy of the Ancestors, Invigorating Hot Spring, Temperamental Oozewagg, Red XIII ("Other …"), Towashi.
  // Every carrier prints the reminder "(Equipment, Auras you control, and counters are modifications.)", which
  // is exactly CR 700.9's three clauses and has no rules meaning of its own (CR 207.2).
  //
  // ⭐ SAME GRADUATION TEST `nontoken` JUST PASSED: a quality word earns a selector once it has a live,
  // carrier-backed field. `modified` has three, all already tracked — the counters map, and the `attachedTo`
  // back-pointers that gateMet's `isEquipped` walk already reads for Equipment and Auras.
  //
  // ⛔ THE CONTROLLER SCOPE ON THE AURA CLAUSE IS LOAD-BEARING: CR 700.9 counts an Aura only when the
  // permanent's OWN controller controls it, so an opponent's Aura must NOT make your creature modified.
  // Enforced in layers.isModifiedPermanent, which owns the whole definition in one place.
  //
  // Placed with its nontoken sibling ABOVE the determiner arms for the same reason: that arm matches
  // "OTHER modified creatures you control …" with word="modified", hits the exclusion set, and returns null.
  const modAnthem = c.match(/^(other\s+)?modified\s+creatures?\s+you control\s+(?:gets?|gains?|has|have)\b/);
  if (modAnthem) {
    return {
      mode: "dynamic",
      selector: { controllerScope: "you", cardTypes: ["Creature"], modified: true, ...(modAnthem[1] ? { excludeSelf: true } : {}) },
    };
  }

  // Determiner anthem with a LIST subject: "(all|other|each) <A> and <B> [creatures] [you control] get…"
  // (Warg Rider — "Other Orcs and Goblins you control have menace"). Sits before its one-word sibling for
  // legibility only; the two cannot collide, because the sibling's `[a-z]+` is followed by "and" rather than
  // by "creatures" / "you control" / the verb, so it already fails to match a list.
  let m = c.match(/^(all|other|each)\s+([a-z]+(?:\s*,\s*[a-z]+)*(?:\s*,)?\s+and\s+[a-z]+)\s+(?:creatures?\s+)?(?:you control\s+)?(?:gets?|gains?|has|have)\b/);
  if (m) {
    const listSubs = parseSubtypeListSubject(m[2]);
    if (listSubs) {
      return {
        mode: "dynamic",
        selector: { controllerScope, cardTypes: ["Creature"], subtypes: listSubs, excludeSelf: m[1] === "other" },
      };
    }
  }

  // Tribal / determiner anthem: "(all|other|each) <word> [creatures] [you control] get…"
  m = c.match(/^(all|other|each)\s+([a-z]+)\s+(?:creatures?\s+)?(?:you control\s+)?(?:gets?|gains?|has|have)\b/);
  if (m) {
    const determiner = m[1];
    const word = m[2];
    const excludeSelf = determiner === "other";
    if (word !== "creature" && word !== "creatures") {
      // A COLOR word → a color anthem ("Other red creatures you control get +1/+1" — the Liege cycle),
      // NOT a subtype. Enforce it via a color selector so the buff actually applies.
      if (COLOR_WORDS[word]) {
        return { mode: "dynamic", selector: { controllerScope, cardTypes: ["Creature"], colors: [COLOR_WORDS[word]], excludeSelf } };
      }
      // SUBJECT-QUALITY anthem (BLITZ SF-1): a supertype / color-quality / tap-state word → the corresponding
      // exact selector fragment (matchesSelector honors each). Checked BEFORE the card-type / tribal-lord /
      // NON_SUBTYPE_ANTHEM_WORDS branches so "Other legendary/colorless/nonblack/untapped/tapped/multicolored
      // creatures you control …" (Rising of the Day, Ruination Guide, Angel of Jubilation, Saryth, Rienne) flips
      // native instead of being dropped as a non-subtype word. `excludeSelf` rides the "other" determiner.
      if (SUBJECT_QUALITY_SELECTORS[word]) {
        return { mode: "dynamic", selector: { controllerScope, cardTypes: ["Creature"], ...SUBJECT_QUALITY_SELECTORS[word], excludeSelf } };
      }
      // CARD-TYPE-qualified creature anthem: "(all|other|each) <Artifact|Enchantment|Land> creatures you
      // control …". The qualifier reads on the LEFT of the type-line em-dash, so it's a card-TYPE filter
      // (NOT a subtype). matchesSelector's cardTypes gate is AND-semantics over the candidate's effective
      // (printed ∪ layer-4-animated) types, so cardTypes:["Creature", X] selects exactly the permanents that
      // are BOTH a Creature and an X — e.g. an earthbended/animated Land that became a 0/0 creature, or an
      // Artifact creature. Runtime-honored (effectiveTypeIdentity unions animation grants), so this is NOT a
      // metric-only flip. "permanent(s)" maps to [] (no extra type) and would degenerate to the generic
      // "creatures you control" anthem, so it's excluded here and falls through to the generic path below.
      const detTypeFilter = PERMANENT_TYPE_CARD_TYPES[word];
      if (detTypeFilter && detTypeFilter.length === 1) {
        return {
          mode: "dynamic",
          selector: { controllerScope, cardTypes: ["Creature", ...detTypeFilter], excludeSelf },
        };
      }
      // ALL-PERMANENTS anthem ("(all|other|each) permanents you control have …" — Privileged Position's
      // hexproof grant, Sigarda's). PERMANENT_TYPE_CARD_TYPES["permanent(s)"] is [] — no card-TYPE filter, so
      // the grant reaches EVERY permanent the controller owns (creatures AND non-creatures). cardTypes:[]
      // passes matchesSelector's vacuous every()-gate and a granted keyword is read layer-aware by
      // permanentHasKeyword regardless of type (verified end-to-end). This word was previously mis-routed to
      // the tribal-lord branch → subtypes:["Permanent"], which matched NOBODY while the card still counted
      // native — a test-certified CREED false positive, now corrected.
      if (detTypeFilter && detTypeFilter.length === 0) {
        return { mode: "dynamic", selector: { controllerScope, cardTypes: [], excludeSelf } };
      }
      // A board-STATE / supertype / card-type qualifier (tapped/nontoken/colorless/artifact/…) is NOT a
      // tribal lord — never fabricate a subtype grant that selects nobody yet flips the card native (a
      // CREED FP: Boartusk Liege, Adept Watershaper, Thraben Watcher…). Fall through → clause unmodeled.
      // (Card-TYPE qualifiers Artifact/Enchantment/Land are handled by the card-type branch just above; the
      // rest of NON_SUBTYPE_ANTHEM_WORDS — board state, supertypes, qualities — stay unmodeled.)
      if (NON_SUBTYPE_ANTHEM_WORDS.has(word)) return null;
      // Tribal lord: "(all|other|each) <Subtype>s [creatures] [you control] …".
      return {
        mode: "dynamic",
        selector: { controllerScope, cardTypes: ["Creature"], subtypes: [normalizeSubtype(word)], excludeSelf },
      };
    }
    // P2.10: determiner + bare "creatures": "(all|other|each) creatures [you control] …".
    // The generic regex below only matches a LITERAL "creatures you control" start, so the
    // common LORD anthem "Other creatures you control get +1/+1" and "Each creature you
    // control gets …" would otherwise fall through unmatched. "other" excludes the source
    // (a lord doesn't pump itself); all/each include it.
    return {
      mode: "dynamic",
      selector: { controllerScope, cardTypes: ["Creature"], excludeSelf },
    };
  }

  // Color anthem: "<color> creatures you control"
  m = c.match(/^(white|blue|black|red|green)\s+creatures?\s+you control\b/);
  if (m) {
    return {
      mode: "dynamic",
      selector: {
        controllerScope: "you",
        cardTypes: ["Creature"],
        colors: [COLOR_WORDS[m[1]]],
      },
    };
  }

  // COMMANDER-qualified creature selector (BLITZ BG-1 — Bastion Protector "Commander creatures you
  // control get +2/+2 and have indestructible"; the Background cycle "Commander creatures you own
  // have \"…\""). "Commander" is neither a card type nor a subtype — it's a game-STATE quality
  // (card.isCommander, stamped at seat build), so it gets its own selector field (commanderOnly),
  // gated at the matchesSelector chokepoint. OWN vs CONTROL: this engine has no native
  // control-changing effect and permanents carry no owner field — controller IS owner, an engine
  // invariant — so both printed scopes map to controllerScope "you". If native theft ever ships,
  // this equivalence must be revisited (grep commanderOnly).
  m = c.match(/^commander creatures?\s+you (?:own|control)\s+(?:gets?|gains?|has|have)\b/);
  if (m) {
    return { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"], commanderOnly: true } };
  }
  // Bare "Commanders you own/control …" (Guardian Augmenter's hexproof line): NO creature restriction —
  // a planeswalker commander is a commander too (cardTypes []), the commanderOnly gate does the work.
  m = c.match(/^commanders\s+you (?:own|control)\s+(?:gets?|gains?|has|have)\b/);
  if (m) {
    return { mode: "dynamic", selector: { controllerScope: "you", cardTypes: [], commanderOnly: true } };
  }

  // No-determiner CARD-TYPE creature anthem: "<Artifact|Enchantment|Land> creatures you control
  // get|gain|has|have …" — the bare card-type-qualified anthem ("Land creatures you control have vigilance"
  // — Earthbending Student; "Artifact creatures you control get +1/+1" — Tempered Steel). The qualifier is a
  // card-TYPE filter (LEFT of the em-dash), modeled as cardTypes:["Creature", X] (AND-semantics in
  // matchesSelector over the candidate's effective printed∪animated types). Checked BEFORE the subtype
  // anthem below (which would reject these via NON_SUBTYPE_ANTHEM_WORDS). Runtime-honored, not metric-only.
  m = c.match(/^([a-z]+)\s+creatures?\s+you control\s+(?:gets?|gains?|has|have)\b/);
  if (m) {
    const typeFilter = PERMANENT_TYPE_CARD_TYPES[m[1]];
    if (typeFilter && typeFilter.length === 1) {
      return {
        mode: "dynamic",
        selector: { controllerScope: "you", cardTypes: ["Creature", ...typeFilter] },
      };
    }
  }

  // No-determiner SUBJECT-QUALITY anthem (BLITZ SF-1): "<legendary|nonlegendary|colorless|multicolored|
  // non<color>|tapped|untapped> creatures you control get|gain|has|have …" — Rising of the Day ("Legendary
  // creatures you control get +1/+0"), Ruination Guide, Forsaken Monument, Glass of the Guildpact, Builder's
  // Blessing, Castle. Checked BEFORE the subtype anthem below (which would reject these via
  // NON_SUBTYPE_ANTHEM_WORDS). No excludeSelf: a determiner-less quality anthem includes the source if it
  // qualifies, matching the printed "Untapped creatures you control get …" all-inclusive reach.
  m = c.match(/^([a-z]+)\s+creatures?\s+you control\s+(?:gets?|gains?|has|have)\b/);
  if (m && SUBJECT_QUALITY_SELECTORS[m[1]]) {
    return {
      mode: "dynamic",
      selector: { controllerScope: "you", cardTypes: ["Creature"], ...SUBJECT_QUALITY_SELECTORS[m[1]] },
    };
  }

  // No-determiner tribal anthem: "<Subtype> creatures you control get|gain|has|have …" — the modern
  // lord templating ("Sliver creatures you control have flying", "Dragon creatures you control get
  // +1/+1"). The "(all|other|each) <subtype>" determiner form + color + generic forms are handled
  // above/below; a state/quality qualifier (attacking/tapped/nontoken/colorless/…) is excluded so it's
  // never claimed native while granting to nobody. An unrecognized word IS treated as a subtype; a
  // genuinely-bogus one simply selects no creatures (a safe FN, not a fabricated grant).
  m = c.match(/^([a-z]+)\s+creatures?\s+you control\s+(?:gets?|gains?|has|have)\b/);
  if (m && !NON_SUBTYPE_ANTHEM_WORDS.has(m[1])) {
    return {
      mode: "dynamic",
      selector: { controllerScope: "you", cardTypes: ["Creature"], subtypes: [normalizeSubtype(m[1])] },
    };
  }

  // ── GLOBAL "each creature" anthems/debuffs (BLITZ GA-1) ────────────────────────────────────────────
  // The FILTERED anthem/debuff with NO "you control" — the SF-1 filtered forms parked their GLOBAL sibling
  // (SF-1 hardcoded "you control" in every no-determiner branch). controllerScope "each" (matchesSelector's
  // default: candidate.controller unrestricted) reaches EVERY player's matching creatures — the printed
  // all-players reach of Bad Moon ("Black creatures get +1/+1"), Crusade, Dread of Night ("White creatures get
  // -1/-1"), Ascendant Evincar ("Nonblack creatures get -1/-1" — genuinely hits the OPPONENT's nonblack X/1s
  // too, which is the whole point), Anaba Spirit Crafter ("Minotaur creatures get +1/+0"), Akroma's Devoted
  // ("Cleric creatures have vigilance"). Each branch mirrors its "you control" sibling ABOVE byte-for-byte,
  // differing ONLY in the absent "you control" → "each" scope: the scope is read STRICTLY from the presence/
  // absence of "you control", so a you-control anthem NEVER becomes global and a global one NEVER becomes
  // you-control. The regexes ANCHOR the anthem verb IMMEDIATELY after "creatures", so a "creatures your
  // opponents control …" / "creatures you don't control …" subject (the verb isn't next) fails to match here
  // and parks (a safe FN — the bare-opponents form is the OD-1 branch at the top; a FILTERED opponents/
  // don't-control debuff stays unmodeled rather than mis-scoped to all-players). NO determiner (all/other/each
  // → the determiner branch at the top of this fn already emits "each" scope for those). NO excludeSelf — a
  // determiner-less GLOBAL filter includes the source when it qualifies (Anaba Spirit Crafter, itself a
  // Minotaur, pumps itself; a non-black Ascendant Evincar debuffs no one since it's black — the -1/-1 skips it
  // via the notColors gate, not an excludeSelf). The SF-1 selector gates (color/notColors/legendary/colorless/
  // multicolored/tap-state/subtype) are scope-agnostic — matchesSelector applies the SAME filter after the
  // controllerScope switch — so reusing them at "each" scope is exact and layer-aware. The negative debuff
  // rides the SAME layer-7c ptModify (signed deltas) the you-control/opponent anthems use; the lethal SBA reads
  // layer-aware toughness (CR 704), so a global -1/-1 genuinely kills every player's nonblack X/1.

  // GLOBAL color anthem — "<color> creatures get|have …" (Bad Moon, Crusade, Dread of Night, Gauntlet of Might).
  m = c.match(/^(white|blue|black|red|green)\s+creatures?\s+(?:gets?|gains?|has|have)\b/);
  if (m) {
    return { mode: "dynamic", selector: { controllerScope: "each", cardTypes: ["Creature"], colors: [COLOR_WORDS[m[1]]] } };
  }
  // GLOBAL card-type creature anthem — "<Artifact|Enchantment|Land> creatures get|have …" (cardTypes AND-gate
  // over effective printed∪animated types, exactly like the "you control" card-type sibling above).
  m = c.match(/^([a-z]+)\s+creatures?\s+(?:gets?|gains?|has|have)\b/);
  if (m) {
    const typeFilter = PERMANENT_TYPE_CARD_TYPES[m[1]];
    if (typeFilter && typeFilter.length === 1) {
      return { mode: "dynamic", selector: { controllerScope: "each", cardTypes: ["Creature", ...typeFilter] } };
    }
  }
  // GLOBAL subject-quality anthem — "<legendary|nonlegendary|colorless|multicolored|non<color>|tapped|untapped>
  // creatures get|have …" (Ascendant Evincar / Crovax, Ascendant Hero: "Nonblack/Nonwhite creatures get -1/-1").
  m = c.match(/^([a-z]+)\s+creatures?\s+(?:gets?|gains?|has|have)\b/);
  if (m && SUBJECT_QUALITY_SELECTORS[m[1]]) {
    return { mode: "dynamic", selector: { controllerScope: "each", cardTypes: ["Creature"], ...SUBJECT_QUALITY_SELECTORS[m[1]] } };
  }
  // GLOBAL tribal anthem — "<Subtype> creatures get|have …" (Anaba Spirit Crafter, Akroma's Devoted). Same
  // NON_SUBTYPE_ANTHEM_WORDS guard as the "you control" sibling (board-state/quality/card-type/determiner words
  // never fabricate a zero-selecting subtype grant); a genuinely-bogus subtype selects no creature (safe FN).
  m = c.match(/^([a-z]+)\s+creatures?\s+(?:gets?|gains?|has|have)\b/);
  if (m && !NON_SUBTYPE_ANTHEM_WORDS.has(m[1])) {
    return { mode: "dynamic", selector: { controllerScope: "each", cardTypes: ["Creature"], subtypes: [normalizeSubtype(m[1])] } };
  }

  // GROUP-GRANT subtype-without-"creatures": "<Subtype> you control (get|gain|has|have) …" — the bare-plural
  // tribal templating with NO "creatures" word ("Dragons you control have indestructible" — Call the Spirit
  // Dragons; "Slivers you control have double strike and haste" — Thrumming Hivepool). The "<Subtype>
  // creatures you control" form is caught just above; the "(all|other|each) <Subtype> you control"
  // determiner form (which makes "creatures" optional) is caught at the top of this fn. This branch fills the
  // remaining hole: a determiner-less bare subtype. STILL Creature-restricted (cardTypes:["Creature"]) so a
  // word that happens to be a card-type ("Artifacts you control have …") routes to the non-creature
  // indestructible grant, not here. NON_SUBTYPE_ANTHEM_WORDS excludes board-state/quality/type/determiner
  // words (so "Attacking … " / "Token … " / "Artifact … " never fabricate a subtype grant that selects
  // nobody). A genuinely-bogus subtype simply selects no creatures (a safe FN). No excludeSelf: a bare
  // (determiner-less) subtype includes the source if it shares the type ("Slivers you control" includes a
  // Sliver granter); the "Other <Subtype>" exclusion is the determiner form above.
  // BARE-PLURAL LIST subject: "<A>, <B>, and <C> you control get|have …" (Death-Priest of Myrkul —
  // "Skeletons, Vampires, and Zombies you control get +1/+1"; The Swarmweaver; Master Trinketeer; Ultron,
  // Machine Overlord). Same guards as the one-word sibling below, applied to EVERY element — see
  // parseSubtypeListSubject. No excludeSelf: a determiner-less subject includes the source when it shares a
  // type, exactly as the one-word branch documents.
  m = c.match(/^([a-z]+(?:\s*,\s*[a-z]+)*(?:\s*,)?\s+and\s+[a-z]+)\s+you control\s+(?:gets?|gains?|has|have)\b/);
  if (m) {
    const listSubs = parseSubtypeListSubject(m[1]);
    if (listSubs) {
      return { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"], subtypes: listSubs } };
    }
  }

  m = c.match(/^([a-z]+)\s+you control\s+(?:gets?|gains?|has|have)\b/);
  if (m) {
    const word = m[1];
    // NON_SUBTYPE_ANTHEM_WORDS lists SINGULAR forms (token/nontoken/legendary/artifact/…); a bare-plural
    // subject ("Tokens you control" / "Artifacts you control") must be excluded too, so test the word AND
    // its de-pluralized form. PERMANENT_TYPE_CARD_TYPES catches the plural card-type words directly
    // (artifacts/enchantments/lands/permanents) — those route to the non-creature indestructible grant, not
    // a (zero-selecting) creature-subtype grant. Without this guard "Tokens you control have haste" would
    // fabricate a "Token"-subtype grant that selects no creature yet flips the card native (a CREED FP).
    // Exclude a non-subtype subject by testing the word AND its de-pluralized forms against the SINGULAR
    // exclusion set — "-ies"→"-y" (legendaries→legendary), "-ves"→"-f", and plain "-s" (tokens→token). A
    // real creature subtype (Sliver/Dragon/Ally/Wolf) is never in NON_SUBTYPE_ANTHEM_WORDS, so the
    // de-pluralized candidates can never wrongly exclude one.
    const candidates = [word];
    if (word.endsWith("ies")) candidates.push(word.slice(0, -3) + "y");
    if (word.endsWith("ves")) candidates.push(word.slice(0, -3) + "f");
    if (word.endsWith("s")) candidates.push(word.slice(0, -1));
    // Also exclude NON-creature permanent/token subtypes (Vehicle/Food/Treasure/…): a Creature-restricted grant
    // on them selects zero creatures (crew unmodeled) → a false native (Aeronaut Admiral). Stays body-only.
    if (!candidates.some((w) => NON_SUBTYPE_ANTHEM_WORDS.has(w) || NON_CREATURE_SUBTYPES.has(w)) && !PERMANENT_TYPE_CARD_TYPES[word]) {
      return {
        mode: "dynamic",
        selector: { controllerScope: "you", cardTypes: ["Creature"], subtypes: [normalizeSubtype(word)] },
      };
    }
  }

  // CHOSEN-TYPE FLAT ANTHEM (CR 614.12) — "creatures [you control] of the chosen type get|have …". The flat
  // (fixed-magnitude) sibling of the COUNT-anthem branch above (Banner/Door's "… for each <name> counter on
  // this artifact"), this is the bare lord the ETB chooser sets up: Rally the Ranks ("Creatures you control
  // of the chosen type get +1/+1"), Obelisk of Urd (+2/+2), Shared Triumph ("Creatures of the chosen type get
  // +1/+1" — ALL players, no "you control"), Steely Resolve ("… have shroud"). The selector carries
  // chosenTypeOfSource:true so layers.matchesSelector pairs the buffed creature against the SOURCE permanent's
  // stored chosenType (subtype OR changeling, CR 702.73a) — picked at ETB by resolvers.autoPickCreatureType.
  // controllerScope is "you" only when the clause says "you control" (Rally/Obelisk); the determiner-less "…
  // of the chosen type" (Shared Triumph) is symmetric ("each"), matching the printed all-players reach. Placed
  // BEFORE the generic "creatures you control" / bare-"creatures" patterns: those would NOT match (the "of the
  // chosen type" span sits between "creatures[ you control]" and the verb, so their anchors fail), and even if
  // one did it would emit a WRONG all-creatures anthem with no chosen-type restriction (a CREED over-buff). An
  // unset chosenType on the source → matchesSelector returns false for everyone → a SAFE no-op (CLAUDE.md §1.2).
  {
    // ⭐ THE OPTIONAL LEADING "OTHER" is a MISSING CELL, not a missing mechanic: `excludeSelf` is already a
    // modeled selector ("Other creatures you control get +1/+1" is native today) and `chosenTypeOfSource` is
    // already a modeled selector — only their COMBINATION had no parse, which is what kept Adaptive Automaton
    // #1755 parked. matchesSelector applies both predicates independently, so composing them needs no new
    // runtime. It became correct to add only once the selector went LAYER-AWARE: before that, the source's own
    // "is the chosen type" line did nothing, so an exclude-self chosen-type anthem was reasoning about a
    // tribe the engine could not see.
    const ctFlat = c.match(/^(other\s+)?creatures?\s+(you control\s+)?of the chosen type\s+(?:gets?|gains?|has|have)\b/);
    if (ctFlat) {
      const controllerScope = ctFlat[2] ? "you" : "each";
      return {
        mode: "dynamic",
        selector: { controllerScope, cardTypes: ["Creature"], chosenTypeOfSource: true, ...(ctFlat[1] ? { excludeSelf: true } : {}) },
      };
    }
  }

  // TOKEN anthem (Teysa Karlov — "Creature tokens you control have vigilance and lifelink"): a static
  // keyword/P/T grant restricted to CREATURE TOKENS the controller owns. Anchored ^"creature tokens you
  // control …" so it never overlaps the generic "creatures you control" anthem below (which the intervening
  // "tokens" word prevents matching anyway). The `token: true` selector predicate is honored by
  // matchesSelector (layers.js) — a candidate matches only when its card carries token:true (CR 111.1 —
  // set at every token-mint chokepoint, incl. token COPIES). cardTypes:["Creature"] keeps it creature-only
  // (a non-creature Treasure/Clue token is never buffed by a creature-keyword anthem). Only "you control" is
  // modeled here (every corpus token anthem is controller-scoped); a symmetric "creature tokens have …" form
  // (none in the corpus) falls through to null — a SAFE false-negative, never a fabricated symmetric grant.
  if (/^creatures?\s+tokens?\s+you control\s+(?:gets?|gains?|has|have)\b/.test(c)) {
    return {
      mode: "dynamic",
      selector: { controllerScope: "you", cardTypes: ["Creature"], token: true },
    };
  }

  // Generic anthem: "creatures you control [get|have]"
  if (/^creatures?\s+you control\s+(?:gets?|gains?|has|have)\b/.test(c)) {
    return {
      mode: "dynamic",
      selector: { controllerScope: "you", cardTypes: ["Creature"] },
    };
  }

  // P2.10 symmetric anthem: bare "creatures get|gain|have …" (no "you control") buffs EVERY
  // controller's creatures (a global static, e.g. "Creatures get +1/+1"). Anchored so
  // "creatures you control get …" (caught above) and "creatures with flying get …" (a
  // qualified subset we don't model) never reach here.
  if (/^creatures?\s+(?:gets?|gains?|has|have)\b/.test(c)) {
    return {
      mode: "dynamic",
      selector: { controllerScope: "each", cardTypes: ["Creature"] },
    };
  }

  return null;
}

// NON-CREATURE ARTIFACT-TOKEN SUBTYPES that a mana-grant static can target ("Treasures you control have
// \"{T}, Sacrifice this artifact: Add …\"" — Goldspan Dragon). Each is an ARTIFACT subtype, so the selector
// gates cardTypes:["Artifact"] + the subtype (matchesSelector honors both). These NEVER carry a Creature
// grant (crew unmodeled — that's why they're excluded from parseCreatureSelector's NON_CREATURE_SUBTYPES);
// the mana-grant path is the ONLY place a grant to them is modeled. Singular, lowercase.
const TOKEN_ARTIFACT_MANA_SUBTYPES = new Set(["treasure", "gold", "clue", "food", "powerstone", "blood", "map", "junk", "incubator"]);

/**
 * NON-CREATURE mana-grant selector — "<Token-subtype>s you control [have]" where the subtype is a mana-
 * relevant ARTIFACT token (Treasure/Gold/…). Returns a dynamic selector { cardTypes:["Artifact"],
 * subtypes:[Subtype] } scoped to the controller, or null if the subject is not a bare token-artifact-subtype
 * "you control" phrase. Used ONLY by the MANA-grant branch (the recipient gains a tap/sac-for-mana source the
 * grantedManaSpecsFor → manaSources runtime already offers), NEVER for keyword/anthem grants (a Creature-
 * restricted keyword grant on a Treasure selects nobody — the parseCreatureSelector exclusion stands). Bare
 * subject only: a determiner ("all"/"other"), a rider, or a non-token subtype leaves residue → null (safe FN).
 */
function parseTokenArtifactManaSelector(c) {
  const m = String(c).match(/^([a-z]+)\s+you control(?:\s+have)?$/i);
  if (!m) return null;
  let word = m[1].toLowerCase();
  if (word.endsWith("s")) word = word.slice(0, -1);           // Treasures → treasure
  if (!TOKEN_ARTIFACT_MANA_SUBTYPES.has(word)) return null;   // not a mana-relevant token subtype → safe FN
  return {
    mode: "dynamic",
    selector: { controllerScope: "you", cardTypes: ["Artifact"], subtypes: [normalizeSubtype(word)] },
  };
}

/**
 * LEVEL-GATED card guard (CLAUDE.md §1.2). On a leveler ("Level up {cost}" + "LEVEL
 * N-M" bands) or a Class ("{cost}: Level N"), a buff line like "Creatures you control
 * get +1/+1" is only active at the right LEVEL — but it sits on its own (colon-less)
 * line, so per-clause parsing can't tell which band it belongs to and would fabricate
 * an always-on anthem. We can't model levels, so we parse NO static abilities from
 * these cards (→ Arbiter/body-only). Conservative: a miss is safe, a false grant isn't.
 */
function isLevelGated(oracle) {
  return /\blevel up\b/i.test(oracle) ||      // Rise-of-Eldrazi levelers
    /\bLEVEL \d+(?:-\d+|\+)?\b/.test(oracle) || // their "LEVEL 1-3" band headers
    /:\s*Level \d/i.test(oracle);              // Class "{cost}: Level N"
}

// ─── Per-card parse memoization (overhaul perf wave 1) ────────────────────────
// A card object's oracle/type/name are immutable for its lifetime (the engine
// never mutates `card` — clones/adventures project NEW card objects; runtime
// flags live on the PERMANENT). The CR-613 layer derive re-runs per state, so
// every action re-parsed every battlefield permanent's statics from scratch —
// ~30% of self-play CPU (P1 profile). Cache each parse per CARD OBJECT (WeakMap,
// the detectTriggers pattern). Results are treated as read-only by every
// consumer (staticEffectsOf copies before stamping; verified no-mutation).
const _cardParseCache = new WeakMap(); // card -> { [slotKey]: parseResult }
function _cardSlot(card) {
  if (typeof card !== "object" || card === null) return null; // WeakMap keys must be objects
  let slot = _cardParseCache.get(card);
  if (!slot) { slot = {}; _cardParseCache.set(card, slot); }
  return slot;
}

/**
 * Parse a permanent's oracle into static continuous-effect descriptors (partial:
 * no id/timestamp/source). Bounded — recognizes the anthem/lord grammar above;
 * everything else yields []. Pure; memoized per card object (results read-only).
 */
export function parseStaticAbilities(card) {
  const slot = _cardSlot(card);
  if (slot && "statics" in slot) return slot.statics;
  const rawOracle = String(card?.oracle || card?.oracle_text || "");
  let out = [];
  if (rawOracle && !isLevelGated(rawOracle)) {
    const oracle = selfNormalizeOracle(rawOracle, card?.name, card?.type || card?.type_line); // TRUNK-SELFBUFF: name-based self-ref → "this creature"
    for (const clause of abilityClauses(oracle)) {
      parseClause(clause, out, card?.name, card?.type || card?.type_line); // name → EMINENCE excludeSelf sourceName; type → ARIXMETHES type-change
    }
    // ⛔ CHOSEN-TYPE WITHOUT A CHOOSER IS A RUNTIME-VACUOUS NATIVE. Every chosenType descriptor resolves
    // against the SOURCE permanent's stored `chosenType` (CR 614.12), which only exists because the card
    // carries the modelled "choose a creature type" ETB (resolvers.autoPickCreatureType). Strip the
    // descriptor when that line is absent: the clause then counts as unmatched residue, so the card PARKS
    // instead of classifying native while the reduction can never once apply.
    //
    // Found by a pin, not by reasoning. The colored-pip slice argued this was structurally impossible —
    // "a card with the reducer but no chooser still has the chooser line as residue" — which is circular:
    // a card that never prints the chooser has no such line to park on. A Morophon fixture stripped to its
    // reduction sentence classified native-static with a reduction that could never fire. **The tier is not
    // evidence about a board.** The generic chosen-type reducers (Urza's Incubator, Herald's Horn) both
    // print the chooser, so this closes the same latent hole on that older path at zero cost.
    if (out.some((d) => d?.costReduction?.chosenType) && !/choose a creature type/i.test(rawOracle)) {
      out = out.filter((d) => !d?.costReduction?.chosenType);
    }
  } else if (rawOracle) {
    // LEVEL UP (BLITZ LV-1, CR 711.2a/b): a WHOLLY-MODELED leveler's band symbols ARE static
    // abilities — "as long as this creature has at least N1 (at most N2) level counters on it, it
    // has base power and toughness [P/T] and has [abilities]". Emit, per band, a level-counter-gated
    // layer-7b base-P/T set + a gated layer-6 addKeyword per validated keyword (both re-evaluated
    // live by layers.gateMet — the counter crossing a boundary flips the band on/off, CR 613.7;
    // below the first band's N1 no gate is open and the printed P/T stands, CR 711.5). Gated on the
    // injected whole-card validator: a leveler with ANY unmodeled piece emits NOTHING here (it
    // stays the pre-slice vanilla body — safe FN). Class cards ("{cost}: Level N") have no
    // "Level up" frame → the validator returns null → nothing emitted, exactly as before.
    if (_levelerCardValidator) {
      const lv = _levelerCardValidator(card);
      if (lv) {
        for (const b of lv.bands) {
          const gate = {
            countSpec: { kind: "countersOnSelf", counterType: "level" },
            atLeast: b.atLeast,
            ...(b.atMost != null ? { atMost: b.atMost } : {}),
            excludeSelf: false,
          };
          out.push({ layer: 7, sublayer: "7b", op: { layerOp: "ptSet", power: b.power, toughness: b.toughness, gate }, affects: { mode: "self" }, duration: { kind: "permanent" } });
          for (const kw of b.keywords) {
            out.push({ layer: 6, op: { layerOp: "addKeyword", keyword: canonicalKeyword(kw), gate }, affects: { mode: "self" }, duration: { kind: "permanent" } });
          }
          // SOURCE-GATED GROUP ANTHEM (BLITZ SG-1, CR 711.2a; live recompute 613.7-adjacent): a band anthem — "Other [<Subtype> ]
          // creatures you control get +X/+Y" — is a layer-7c fixed P/T buff over the controller's OTHER
          // creatures, but its gate reads THE SOURCE (this leveler's level counters), NOT each affected
          // permanent. `gateOn: "source"` tells layers.gatePermForEffect to swap the gate's subject to the
          // effect's source before gateMet, so the anthem flips ON/OFF live as the SOURCE crosses the band
          // boundary while buffing the OTHERS. The dynamic selector (controllerScope you, cardTypes Creature,
          // excludeSelf) resolves against the source's controller via effectAffects; an optional subtype
          // (Coralhelm's "Merfolk") narrows it. source.permanentId is stamped at collect (staticEffectsOf).
          for (const a of b.anthems || []) {
            out.push({
              layer: 7, sublayer: "7c",
              op: { layerOp: "ptModifyGated", power: a.power, toughness: a.toughness, gate: { ...gate, gateOn: "source" } },
              affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"], excludeSelf: true, ...(a.subtype ? { subtypes: [a.subtype] } : {}) } },
              duration: { kind: "permanent" },
            });
          }
        }
      }
    } else if (isLevelerFrame(rawOracle)) {
      // Validator not registered yet (a consumer loaded this module alone) — don't memoize the
      // empty result, so a later fully-wired caller isn't stuck with a stale park.
      return out;
    }
  }
  if (slot) slot.statics = out;
  return out;
}

/**
 * STATIC-COST-REDUCTION: gather the active subtype cost-reducers among a set of cards —
 * `[{ subtype, amount, … }, …]` — from each card's "<Subtype> spells you cast cost {N} less to cast"
 * static (parsed via parseStaticAbilities → the `costReduction` marker). Pure; hoisted ONCE per
 * castActionsFromZone so each zone is parsed a single time, not per castable card.
 *
 * `commandZone: true` filters to ONLY the EMINENCE reducers (`fromCommandZone`) — when scanning the
 * command zone, a plain battlefield-only reducer that happens to be in the command zone (it can't really
 * be, but the guard keeps the contract honest) must not apply. The default (battlefield) scan keeps EVERY
 * reducer: an eminence reducer also functions on the battlefield (CR 113.6 — "command zone OR on the
 * battlefield"), so it isn't filtered out there.
 */
/**
 * STATIC-COST-TAX collection: the tax descriptors on EVERY battlefield — a tax names no "you", so it
 * applies to every caster (Sphere of Resistance) or to "your opponents" relative to ITS controller
 * (stamped here so costTaxForSpell can compare against the caster). Mirrors collectCostReducers; input is
 * [{ controller, battlefield }] for all players.
 */
export function collectCostTaxers(players) {
  const taxers = [];
  for (const p of players || []) {
    for (const perm of p?.battlefield || []) {
      const card = perm?.card || perm;
      for (const d of parseStaticAbilities(card)) {
        if (d.costTax) taxers.push({ ...d.costTax, controller: p.controller });
      }
    }
  }
  return taxers;
}

/**
 * STATIC-COST-TAX pricing: the total GENERIC-mana increase `taxers` impose on `spellCard` cast by
 * `casterId` (CR 601.2f — applied with the reducers at the cast site; increases then decreases, generic
 * floored by the caller's reduction step; the mana value is never touched, CR 202.3). A "your opponents
 * cast" tax skips the taxer's own controller. Filter matching mirrors costReductionForSpell (word-bound
 * type line); "noncreature" is the negated check. Pure; 0 when nothing applies.
 */
export function costTaxForSpell(taxers, spellCard, casterId) {
  if (!taxers?.length || !spellCard) return 0;
  const typeLine = String(spellCard?.type || spellCard?.type_line || "").toLowerCase();
  let total = 0;
  for (const t of taxers) {
    if (t.oppOnly && t.controller === casterId) continue;
    if (t.notCardType) {
      // NEGATED filter (Thalia "noncreature", Lodestone Golem "nonartifact"): skip when the type IS present.
      if (new RegExp(`\\b${t.notCardType}\\b`).test(typeLine)) continue;
    } else if (t.cardType || t.subtype) {
      const w = String(t.cardType || t.subtype).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!typeLine || !new RegExp(`\\b${w}\\b`).test(typeLine)) continue;
    }
    total += t.amount || 0;
  }
  return total;
}

export function collectCostReducers(permanents, { commandZone = false } = {}) {
  const reducers = [];
  for (const entry of permanents || []) {
    // An entry is either a battlefield PERMANENT ({ card, chosenType, … }) or a BARE card (command zone). A
    // chosen-type reducer needs the SOURCE permanent's stored chosenType (set at ETB), captured here so the
    // type — unknown at parse time — pairs with the reducer at the cast site.
    const card = entry?.card || entry;
    const chosenType = entry?.chosenType || null;
    for (const d of parseStaticAbilities(card)) {
      if (!d.costReduction) continue;
      if (commandZone && !d.costReduction.fromCommandZone) continue; // only eminence reaches from the command zone
      // Stamp the source's chosenType onto a chosen-type reducer so costReductionForSpell can match the spell's
      // type line against it. A chosen-type reducer whose source has NO chosenType (never resolved its ETB
      // chooser) is INERT — keep it (the match guard returns 0), never fabricate a type.
      reducers.push(d.costReduction.chosenType ? { ...d.costReduction, sourceChosenType: chosenType } : d.costReduction);
    }
  }
  return reducers;
}

// CHOSEN-TYPE membership (CR 614.12, mirrors triggers.permHasChosenType / resolvers.cardHasChosenType — kept
// local so this module stays a leaf). A spell carries the chosen type if its type line has that creature
// subtype (word-bounded) OR it's a changeling (CR 702.73a — every creature type). Unset type → false.
function spellHasChosenType(spellCard, chosenType) {
  if (!chosenType || !spellCard) return false;
  const kws = Array.isArray(spellCard.keywords) ? spellCard.keywords.map((k) => String(k).toLowerCase()) : [];
  if (kws.includes("changeling") || /\bchangeling\b/i.test(String(spellCard.oracle || spellCard.oracle_text || ""))) return true;
  const ts = String(spellCard.type || spellCard.type_line || "");
  const dash = ts.indexOf("—");
  if (dash === -1) return false;
  const esc = String(chosenType).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${esc}\\b`, "i").test(ts.slice(dash + 1));
}

/**
 * STATIC-COST-REDUCTION: the total GENERIC-mana reduction a set of `reducers` (from collectCostReducers)
 * grant `spellCard`, summed across every reducer that matches the spell. A reducer matches by:
 *   • subtype     — its `subtype` appears (word-bounded) in the spell's TYPE LINE (Dragonspeaker → a Dragon).
 *   • colors      — any of its WUBRG `colors` is a color of the spell (Goblin Anarchomancer → a red OR green
 *                   spell; Ruby Medallion → a red spell). CR 105.2 — the spell's colors are a set.
 *   • chosenType  — the SOURCE permanent's stored `sourceChosenType` (CR 614.12) appears in the spell's type
 *                   line, or the spell is a changeling (Urza's Incubator → a creature of the chosen type).
 * Matching the type line (not the name) means a creature/Tribal spell of that subtype matches while an off-type
 * spell that merely NAMES the subtype (e.g. "Beast Within") never does. Generic-only and floored by the caller
 * at the cast site (CR 601.2f); the mana value is never touched (CR 202.3). Pure; 0 when nothing applies.
 */
export function costReductionForSpell(reducers, spellCard) {
  if (!reducers?.length || !spellCard) return 0;
  const typeLine = String(spellCard?.type || spellCard?.type_line || "").toLowerCase();
  const spellName = spellCard?.name;
  let spellColors = null; // lazily derived only when a color reducer is present
  let total = 0;
  for (const r of reducers) {
    // EMINENCE "OTHER <subtype> spells": never reduce the source card's own cast (The Ur-Dragon casting itself).
    if (r.excludeSelf && r.sourceName && spellName && r.sourceName === spellName) continue;
    // ⭐ SUBTYPE UNION (the Banneret cycle — "Goblin spells and Rogue spells you cast cost {1} less"): the
    // spell is reduced if it carries EITHER subtype, and reduced ONCE. Emitting two separate reducers instead
    // would give a Goblin Rogue {2} off a card that says {1} — a cheaper spell than the card allows, which is
    // the forbidden direction for a cost effect.
    if (Array.isArray(r.subtypes)) {
      if (!typeLine) continue;
      const hit = r.subtypes.some((sub) => {
        const esc = String(sub).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return esc && new RegExp(`\\b${esc}\\b`).test(typeLine);
      });
      if (!hit) continue;
      total += r.amount || 0;
      continue;
    }
    // ⭐ NEGATED CARD TYPE ("Noncreature spells you cast cost {1} less" — Longshot, Valeria Richards, Iron Lad).
    // A real predicate rather than a word scan, which is exactly what NON_SUBTYPE_COST_FILTER_WORDS' own comment
    // says was missing: "A word-bound type-line match for these would NEVER fire, so claiming the reducer native
    // while it silently reduces nothing is a CREED false positive." FAIL-CLOSED on an unreadable type line — no
    // reduction beats a wrong discount, since an over-applied reducer makes spells cheaper than the card allows.
    if (r.notCardType) {
      if (!typeLine) continue;
      if (new RegExp(`\\b${r.notCardType}\\b`).test(typeLine)) continue;
      total += r.amount || 0;
      continue;
    }
    if (r.subtype) {
      if (!typeLine) continue;
      const sub = String(r.subtype).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!sub || !new RegExp(`\\b${sub}\\b`).test(typeLine)) continue;
      // COLOR + TYPE (the Monument cycle) — a descriptor carrying BOTH qualities is an AND, unlike the
      // colors-only branch below, which is a union across the listed colors. Without this the if/else-if
      // dispatch would take the subtype branch alone and Bontu's Monument would shave WHITE creatures too.
      if (Array.isArray(r.colors)) {
        if (spellColors === null) spellColors = colorsOfSpell(spellCard);
        if (!r.colors.some((col) => spellColors.includes(col))) continue;
      }
      total += r.amount || 0;
    } else if (Array.isArray(r.colors)) {
      if (spellColors === null) spellColors = colorsOfSpell(spellCard);
      if (r.colors.some((col) => spellColors.includes(col))) total += r.amount || 0;
    } else if (r.chosenType) {
      // The reducer applies only to its CONTROLLER's spells (the "you cast" framing); the cast site only ever
      // passes the casting player's own reducers, so no controller re-check is needed here.
      if (spellHasChosenType(spellCard, r.sourceChosenType)) total += r.amount || 0;
    }
  }
  return total;
}

/**
 * ACTIVATED-ABILITY COST-REDUCTION: collect the { amount } reducers a controller's battlefield grants to the
 * ACTIVATED abilities of their creatures (Training Grounds, Biomancer's Familiar). Scans the permanents' parsed
 * static descriptors for the `activatedCostReduction` marker; returns the raw { amount } list (stacked at the
 * activation site by activatedCostReductionForCost). Mirrors collectCostReducers for the cast-cost family; only
 * the CASTING/ACTIVATING player's own battlefield is ever passed (the modeled scope is "creatures you control").
 * Pure.
 */
export function collectActivatedCostReducers(permanents) {
  const reducers = [];
  for (const entry of permanents || []) {
    const card = entry?.card || entry;
    for (const d of parseStaticAbilities(card)) {
      if (d.activatedCostReduction) reducers.push(d.activatedCostReduction);
    }
  }
  return reducers;
}

/**
 * ACTIVATED-ABILITY COST-REDUCTION: apply the collected `reducers` to a parsed activated-ability `cost` (from
 * legalChoices.parseManaCost), returning a NEW cost object with a reduced generic component — or the SAME cost
 * unchanged when nothing applies. Only the GENERIC portion is reduced (CR 118.9 — colored/hybrid/phyrexian pips
 * are never shaved), summed across every reducer. THE FLOOR (the printed rider, "can't reduce the mana in that
 * cost to less than one mana"): the reduction can never bring the cost's TOTAL fixed mana below 1 — so a
 * fully-colored ability ({U}: …) is untouched, and a {2}: … under a {2}-reducer floors to {1}, never {0}.
 * `nonGenericMana` = every fixed mana pip that ISN'T generic (colored + C + hybrid + phyrexian); the max generic
 * we may remove is `generic - max(0, 1 - nonGenericMana)` capped at the summed reduction. Never mutates the
 * input (a fresh spread is returned only when a reduction actually applies). Pure — no state.
 */
export function activatedCostReductionForCost(reducers, cost) {
  if (!reducers?.length || !cost) return cost;
  const amount = reducers.reduce((s, r) => s + (r.amount || 0), 0);
  if (amount <= 0) return cost;
  const generic = cost.generic || 0;
  if (generic <= 0) return cost; // nothing generic to shave
  // Fixed non-generic mana already in the cost keeps the total ≥ that many; the floor only bites when the
  // WHOLE cost is generic (or generic + colored summing below 1 after the shave). Colored/C count 1 each; a
  // hybrid/phyrexian pip is payable with 1 mana, so it counts toward the ≥1 floor too (conservative: it can
  // always be paid with a mana, satisfying "at least one mana remains").
  const nonGenericMana =
    (cost.W || 0) + (cost.U || 0) + (cost.B || 0) + (cost.R || 0) + (cost.G || 0) + (cost.C || 0) +
    (cost.hybrid?.length || 0) + (cost.phyrexian?.length || 0);
  // Minimum generic that must remain so the total fixed mana is ≥ 1 (the printed floor rider).
  const minGeneric = Math.max(0, 1 - nonGenericMana);
  const removable = Math.max(0, generic - minGeneric);
  const applied = Math.min(amount, removable);
  if (applied <= 0) return cost;
  return { ...cost, generic: generic - applied };
}

// A spell's colors as WUBRG letters (Scryfall `colors` array, else derived from mana-cost pips). Local mirror
// of layers.colorsOf — kept here so this leaf module needs no engine import (a {W/U} hybrid pip counts both).
const _WUBRG = ["W", "U", "B", "R", "G"];
function colorsOfSpell(card) {
  if (Array.isArray(card?.colors)) return card.colors.map((c) => String(c).toUpperCase());
  // DEVOID (CR 702.114, BLITZ DV-1) — a characteristic-defining ability makes the card colorless in EVERY zone
  // regardless of its mana-cost pips. Real cards carry Scryfall's baked colors:[] (returned above); this guards
  // only a fixture lacking a colors array so a devoid {2}{R} spell isn't mis-derived as red. Colorless is always
  // correct for a devoid card — this can only REMOVE a wrong color, never add one (the CREED). Anchored to a
  // WHOLE "Devoid" keyword line (or the Scryfall keyword), so a devoid REFERENCE is never matched.
  if ((card?.keywords || []).some((k) => String(k).toLowerCase() === "devoid")
      || /^[ \t]*devoid\b[ \t]*(?:\([^)]*\))?[ \t]*$/im.test(String(card?.oracle || card?.oracle_text || ""))) {
    return [];
  }
  const cost = String(card?.mana || card?.mana_cost || "");
  const out = [];
  for (const pip of cost.match(/\{[^}]+\}/g) || []) {
    for (const part of pip.slice(1, -1).split("/")) {
      const up = part.toUpperCase();
      if (_WUBRG.includes(up) && !out.includes(up)) out.push(up);
    }
  }
  return out;
}

/**
 * OPPONENTS-CANT-ACT: the cant-act restriction a single card grants its controller, or null. Reads the
 * card's `{ cantCast }` static marker (parsed via parseStaticAbilities). At most one cant-act clause per
 * card in the modeled corpus, so the FIRST match wins. Pure — the attachment / turn-window gating lives in
 * the legalChoices scan (it needs the live permanent + state), this just exposes the parsed descriptor.
 */
export function cantCastDescriptorOf(card) {
  for (const d of parseStaticAbilities(card)) {
    if (d.cantCast) return d.cantCast;
  }
  return null;
}

/**
 * EXTRA-LAND-DROPS — the number of ADDITIONAL land plays this one card grants its controller (Exploration → 1,
 * Azusa → 2), or 0. Reads the card's `{ extraLandDrops }` static markers (parsed via parseStaticAbilities) and
 * sums them (a card has at most one such clause in the modeled corpus, but summing is harmless + future-proof).
 * Pure — the per-player allowance (1 + Σ across the battlefield + command zone) is computed at the land-play
 * site (legalChoices.actionsPlayLand + actionDispatcher.applyPlayLand), this just exposes the per-card delta.
 */
export function extraLandDropsOf(card) {
  let n = 0;
  for (const d of parseStaticAbilities(card)) {
    if (typeof d.extraLandDrops === "number") n += d.extraLandDrops;
  }
  return n;
}

/**
 * FLASH-CAST-PERMISSION — the flash-cast-permission specs this ONE card grants its controller (a card has at
 * most one such clause in the corpus, but returning all is harmless + future-proof). Each spec is the
 * serializable `{ any } | { qualifiers }` filter from parseFlashCastFilter. Pure — the per-player gather (scan
 * the battlefield) + the per-spell match live at the cast timing gate (legalChoices), this just exposes the
 * parsed descriptor. Reads the card's `{ castFlashPermission }` static markers (via parseStaticAbilities).
 */
export function flashCastPermissionsOf(card) {
  const specs = [];
  for (const d of parseStaticAbilities(card)) {
    if (d.castFlashPermission) specs.push(d.castFlashPermission);
  }
  return specs;
}

/**
 * FLASH-CAST-PERMISSION — does a single flash-cast filter `spec` cover `spellCard`? A spell matches if the spec
 * is the ALL grant ({ any }) or if it satisfies ANY of the spec's qualifiers (CR 105 colors; CR 205 type line).
 * Each qualifier is an AND of its constraints:
 *   • types      — EVERY listed card type appears (word-bounded) in the spell's type line ("green creature" needs
 *                  Creature; a lone type needs just that type);
 *   • colors     — EVERY listed color is a color of the spell (Yeva's "green" — CR 105.2, a spell may be several
 *                  colors, so "is green" = green ∈ its colors);
 *   • colorless  — the spell has NO colors;
 *   • nonCreature — the spell's type line has NO "Creature";
 *   • subtype    — the subtype appears (word-bounded, after the em dash) in the spell's type line.
 * Pure; no engine import (reuses the leaf colorsOfSpell). CREED: a spec that ever failed to reduce to a modeled
 * filter is null upstream (never reaches here), so this only ever tests a faithfully-evaluable predicate.
 */
export function spellMatchesFlashFilter(spec, spellCard) {
  if (!spec || !spellCard) return false;
  if (spec.any) return true;
  const typeLine = String(spellCard?.type || spellCard?.type_line || "");
  const typeLineLc = typeLine.toLowerCase();
  const dash = typeLine.indexOf("—");
  const subtypeStr = (dash >= 0 ? typeLine.slice(dash + 1) : "").toLowerCase();
  let spellColors = null; // lazily derived only when a color / colorless qualifier is present
  const colorsOf = () => (spellColors ??= colorsOfSpell(spellCard));
  for (const q of spec.qualifiers || []) {
    let ok = true;
    if (q.types) {
      for (const t of q.types) {
        if (!new RegExp(`\\b${t.toLowerCase()}\\b`).test(typeLineLc)) { ok = false; break; }
      }
    }
    if (ok && q.colors) {
      const cols = colorsOf();
      for (const col of q.colors) { if (!cols.includes(col)) { ok = false; break; } }
    }
    if (ok && q.colorless && colorsOf().length > 0) ok = false;
    if (ok && q.nonCreature && /\bcreature\b/.test(typeLineLc)) ok = false;
    if (ok && q.subtype && !new RegExp(`\\b${q.subtype.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(subtypeStr)) ok = false;
    if (ok) return true; // matched a qualifier (the qualifiers are OR-joined)
  }
  return false;
}

/**
 * CANT-BE-COUNTERED — the SUBTYPE uncounterability statics among a set of permanent cards (each card's
 * "<Subtype> spells can't be countered" → the `cantBeCountered.subtype` marker). Returns a lowercase Set of
 * subtypes whose spells are uncounterable while these permanents are on the battlefield. The SELF-scope
 * "this spell can't be countered" marker is NOT a battlefield static (it only mattered while the source was a
 * spell), so it's excluded here. Pure; hoisted ONCE per counter-target enumeration. Used by
 * spellEffects.enumerateTargets to keep a protected Sliver spell off the counter-target list.
 */
export function uncounterableSubtypesOnBattlefield(permanentCards) {
  const subs = new Set();
  for (const card of permanentCards || []) {
    for (const d of parseStaticAbilities(card)) {
      if (d.cantBeCountered?.subtype) subs.add(String(d.cantBeCountered.subtype).toLowerCase());
    }
  }
  return subs;
}

/**
 * CANT-BE-COUNTERED — the CONTROLLER-scope uncounterability (Chimil, the Inner Sun — "Spells you control can't
 * be countered", cantBeCountered.scope==="youControl"). Returns a Set of player-ids that control at least one
 * such battlefield permanent, so ALL of that player's stack spells are excluded from counter targets (CR
 * 701.6a). Empty when no such static is in play → zero behavior change. Pure; hoisted once per enumeration.
 */
export function uncounterablePlayersOnBattlefield(state) {
  // A MAP now, not a Set: the controller-scoped static comes in two breadths and they must not collapse.
  // playerId → Set of card-type filters, where `null` means EVERY spell that player casts (Chimil) and a
  // type string means only that type (Prowling Serpopard's creatures). A player controlling both keeps both
  // entries, so the broad one wins for free without special-casing.
  const players = new Map();
  for (const pid of Object.keys(state?.players || {})) {
    for (const perm of state.players[pid]?.battlefield || []) {
      if (!perm?.card) continue;
      for (const d of parseStaticAbilities(perm.card)) {
        if (d.cantBeCountered?.scope !== "youControl") continue;
        if (!players.has(pid)) players.set(pid, new Set());
        players.get(pid).add(d.cantBeCountered.cardType ?? null);
      }
    }
  }
  return players;
}

/** Does `playerId`'s uncounterable-static coverage protect a spell with this type line? */
export function uncounterableCoversSpell(uncounterablePlayers, playerId, typeLine) {
  const filters = uncounterablePlayers?.get?.(playerId);
  if (!filters) return false;
  if (filters.has(null)) return true;                     // the unfiltered Chimil form covers everything
  const tl = String(typeLine || "");
  for (const t of filters) if (t && new RegExp(`\\b${t}\\b`, "i").test(tl)) return true;
  return false;
}

/**
 * PLAY-FROM-TOP-OF-LIBRARY — the play-permission a player currently has (Future Sight's { playFromTop } marker),
 * or null. Read from a battlefield permanent the player controls (a bare, non-attach-gated permission — the
 * filtered/attach-gated variants aren't emitted by the parser). Consumed by legalChoices.actionsPlayFromTopOf-
 * Library to offer the top library card as a real cast/play action, so the credited static is genuinely enforced.
 */
/**
 * Merge two cast-from-top spell filters. `null` = no spell permission, `"any"` = unfiltered, an ARRAY = the
 * type words a castable top card's type line must carry.
 *
 * ⚠️ The old merge was `a || b`, which was correct only while the two values were "any" and null. With type
 * filters it silently DROPS the second permission: an Eladamri ("creature") plus a Mystic Forge ("artifact")
 * on the same battlefield would grant creature-only, because the first truthy value won. Two permissions
 * UNION — each independently permits its own spells (CR 118.6) — and "any" absorbs everything.
 */
function mergeSpellFilters(a, b) {
  if (a === "any" || b === "any") return "any";
  if (!a) return b || null;
  if (!b) return a;
  return [...new Set([...a, ...b])];
}

/**
 * Does a card's type line satisfy a cast-from-top spell filter? `"any"` permits every spell; an ARRAY permits
 * a card carrying ANY of its words (CR 118.6 grants each permission independently, so the words are a union,
 * not an intersection — "angel spells and human spells" lets an Angel through even if it is not a Human).
 * Word-boundary matched so "Elf" never matches "Elfball" and "Art" never matches "Artifact".
 */
export function castFromTopFilterAllows(spellFilter, card) {
  if (!spellFilter) return false;
  if (spellFilter === "any") return true;
  const tl = `${card?.type || card?.type_line || ""}`;
  return spellFilter.some((w) => new RegExp(`\\b${w}\\b`, "i").test(tl));
}

export function playFromTopPermission(state, playerId) {
  // MERGED across every granting permanent, not first-wins. Two permissions of DIFFERENT breadth can be on
  // the battlefield at once (Courser of Kruphix grants lands only, Future Sight grants lands and spells),
  // and returning whichever the scan happened to reach first would silently drop the broader one.
  let merged = null;
  for (const perm of state?.players?.[playerId]?.battlefield || []) {
    if (!perm?.card) continue;
    for (const d of parseStaticAbilities(perm.card)) {
      if (!d.playFromTop) continue;
      // A DYNAMIC chosen-type filter resolves HERE, where the granting permanent is in hand: its word list is
      // whatever that permanent chose on entry (Realmwalker #607). Unchosen → the granter permits no spells at
      // all, rather than permitting everything — the safe direction, and never a guessed type.
      const raw = d.playFromTop.spellFilter;
      const resolved = raw?.chosenTypeOfSource ? (perm.chosenType ? [perm.chosenType] : null) : raw;
      const grant = { lands: d.playFromTop.lands, spellFilter: resolved };
      merged = merged
        ? { lands: merged.lands || grant.lands, spellFilter: mergeSpellFilters(merged.spellFilter, grant.spellFilter) }
        : grant;
    }
  }
  return merged;
}

/**
 * PLAY-LANDS-FROM-GRAVEYARD — true when the player controls a permanent granting the bare "You may play
 * lands from your graveyard" permission (Crucible of Worlds and kin). Read live off the battlefield, exactly
 * like playFromTopPermission above, so the permission ends the moment the source leaves.
 */
export function playLandFromGraveyardPermission(state, playerId) {
  for (const perm of state?.players?.[playerId]?.battlefield || []) {
    if (!perm?.card) continue;
    for (const d of parseStaticAbilities(perm.card)) if (d.playLandFromGraveyard) return true;
  }
  return false;
}

/**
 * True when EVERY ability clause of the card is a modeled static effect or keyword-only
 * text — i.e. the static parser covers the WHOLE (non-body) card, so a pure anthem
 * ("Glorious Anthem") or a vanilla-body lord ("Benalish Marshal") plays fully natively
 * (body + layer anthem). The coverage metric (`coverage.permanentStaticCovered`) calls
 * this. `isKeywordOnlyClause` is INJECTED (coverage owns the keyword vocabulary) so this
 * module stays a leaf — no coverage→static→coverage import cycle.
 *
 * Conservative: a leveler (parseStaticAbilities already returns []) or ANY unmodeled
 * clause (a trigger/activated/conditional next to the anthem) → false. Mirrors the
 * runtime exactly (the same parseClause the layer engine consumes).
 */
export function staticAbilitiesCoverCard(card, isKeywordOnlyClause) {
  const descriptors = parseStaticAbilities(card);
  if (descriptors.length === 0) return false; // none, or leveler-gated
  // COLORED-PIP QUALIFIER (CR 601.2f) — "This effect reduces only the amount of colored mana you pay." is a
  // rules CLARIFICATION printed alongside every pip reducer (Morophon, Edgewalker, Ragemonger, Nekrataal
  // Avatar). It is not an effect, and it states exactly what the `pips` descriptor already encodes, so it
  // carries no information the model is missing.
  //
  // ⛔ SKIPPED ONLY WHEN A PIP REDUCER WAS ACTUALLY RECOGNIZED, and that check has to live HERE rather than
  // in parseClause: the loop below hands parseClause a FRESH array per clause, so a gate written there
  // could never see the reducer emitted by the previous sentence — it would be dead code that reads like a
  // guard. Card-level context is what the decision needs, and this is where it exists.
  //
  // The gate is what keeps the two unmodellable members of the family parked: Vorthos, Steward of Myth
  // ("with the chosen character in its name, flavor text, or art") and Head of the Class (a per-turn
  // targeting filter) print the SAME qualifier, and swallowing it unconditionally would shed their only
  // residue and classify them native with the reduction silently absent.
  const hasPipReducer = descriptors.some((d) => d?.costReduction?.pips);
  const oracle = selfNormalizeOracle(String(card?.oracle || card?.oracle_text || ""), card?.name, card?.type || card?.type_line); // match the runtime's name-normalized parse
  for (const clause of abilityClauses(oracle)) {
    if (hasPipReducer && /^this effect reduces only the amount of colored mana you pay$/i.test(clause.trim())) continue;
    const produced = [];
    parseClause(clause, produced, card?.name);
    if (produced.length > 0) continue;          // a modeled static clause
    if (isKeywordOnlyClause(clause)) continue;   // keyword-only / vanilla line
    return false;                                // unmodeled residue (trigger/activated/…)
  }
  return true;
}

// EQUIP-PROTECTION: parse a "protection from <color>[ and from <color>]…" grant tail (the Captain America
// Swords' STATIC protection). Returns the WUBRG color letters, or null if the quality is NON-COLOR
// ("protection from instants and from sorceries" — Sword of Wealth and Power) or DYNAMIC ("from each color
// that's not in your commander's color identity" — Commander's Plate). CREED: a non-color/dynamic quality
// returns null so the whole attached bonus drops (all-or-nothing) — never a half-modeled grant. Only a
// pure static color list flips. Anchored on "protection from …" through the end of the (already
// clause-split, already reminder-free) tail.
function parseAttachedProtectionColors(tail) {
  const m = String(tail).match(/^protection from (.+)$/);
  if (!m) return null;
  const colors = [];
  // The quality list is "<q> and from <q>" / "<q> and <q>"; keep only single recognized color words.
  for (const part of m[1].split(/\band from\b|\band\b/)) {
    const q = part.trim().replace(/[^a-z ]/g, "").trim();
    if (!q) continue;
    if (!COLOR_WORDS[q]) return null;                  // non-color / dynamic quality → whole bonus drops (safe FN)
    colors.push(COLOR_WORDS[q]);
  }
  return colors.length ? colors : null;
}

/**
 * Parse one "<subject> creature gets +X/+Y [and has KW…]" / "<subject> creature has KW…"
 * clause (subject = "equipped" for Equipment, "enchanted" for an Aura) into layer
 * descriptors, or null if the clause carries ANYTHING we don't model. ALL-OR-NOTHING (the
 * clause must reduce EXACTLY to a +N/+N P/T mod and/or grantable keywords/granted protection)
 * so a rider ("can't be blocked", "is a 4/4") is never silently dropped.
 *
 * Beyond the fixed "+N/+N and has <keyword>" form this also models:
 *   - EQUIP-DYNAMIC-PT  "gets +X/+Y for each <metric>" (Conqueror's Flail → ptModifyDynamicCount, 7c);
 *   - EQUIP-BASE-PT-SET "has base power and toughness N/N" (literal CDA-style set, layer 7b);
 *   - EQUIP-LOSES-KW    "gets +N/+N and loses <combat keyword>" (Colossus Hammer → layer-6 removeKeyword);
 *   - EQUIP-PROTECTION  "has protection from <color>…" (Captain America Swords → layer-6 addProtection).
 */
/**
 * ⭐ GOAD TAIL (CR 701.38) — a WRAPPER, not a ninth regex. "Enchanted creature is goaded" appears bolted
 * onto almost every other attached shape in the corpus: bare, "+2/+2 and is goaded" (Psychic Impetus),
 * "has indestructible and is goaded" (Redemption Arc), "+1/+1, has deathtouch, and is goaded" (Ghoulish
 * Impetus). Matching each of those separately would fork the parser eight ways and drift from the plain
 * forms. Instead the tail is stripped, the HEAD goes through the ordinary reducer unchanged, and the goad
 * grants are appended to whatever it produced.
 *
 * Goad is TWO grants because it is two rules:
 *   · `mustAttack` — "attacks each combat if able". The SAME pseudo-keyword the granted-must-attack slice
 *     shipped, already enforced layer-aware in the AI's attack planner. Nothing new.
 *   · `goaded`     — "and attacks a player other than YOU if able", where YOU is the GOADER. Carried as its
 *     own keyword so the planner can resolve the goader from the effect's SOURCE controller.
 *
 * ⛔ ALL-OR-NOTHING IS PRESERVED: if the head carries anything the reducer can't model, it returns null and
 * the WHOLE bonus drops (Eye of Nidhogg's type-change, The Sound of Drums' damage redirection). Appending
 * goad to a half-parsed head would be exactly the silent partial this file refuses everywhere else.
 */
function parseAttachedClause(c, subject, noun = "creature") {
  const gm = String(c).match(/^(.*?)(?:,?\s+and)?\s+is goaded\.?$/i);
  if (gm) {
    const head = gm[1].trim().replace(/,$/, "");
    const goad = [
      { layer: 6, op: { layerOp: "addKeyword", keyword: "mustAttack" }, duration: { kind: "permanent" } },
      { layer: 6, op: { layerOp: "addKeyword", keyword: "goaded" }, duration: { kind: "permanent" } },
    ];
    // The bare form ("Enchanted creature is goaded.") leaves no head to reduce.
    if (new RegExp(`^${subject} ${noun}$`, "i").test(head)) return goad;
    // ⛔ NO trailing period re-added: clauses reach here already stripped, and the reducer's tail checks
    // treat a lone "." as unmodeled residue and drop the whole bonus.
    const inner = parseAttachedClauseCore(head, subject, noun);
    return inner === null ? null : [...inner, ...goad];
  }
  return parseAttachedClauseCore(c, subject, noun);
}

function parseAttachedClauseCore(c, subject, noun = "creature") {
  let rest = c.replace(new RegExp(`^${subject} ${noun}\\s+`), "").trim();
  const out = [];

  // PACIFISM CLASS (BLITZ PA-1): "can't attack or block" / "can't attack" / "can't block" — layer-6
  // grants of the cantAttack/cantBlock pseudo-keywords, permanent for as long as the attachment holds
  // (the layer engine scopes attached bonuses to the host). Block-side enforcement is the SAME
  // canBlockAttacker read the until-EOT cant-block atom uses; attack-side is actionsDeclareAttacker's
  // cantAttack gate.
  //
  // ARREST TAIL (BLITZ AU-2, CR 602.5 — "a player can't begin to activate an ability that's prohibited
  // from being activated"): the pacifism clause may carry the compound restriction tail
  // ", and its activated abilities can't be activated" (Arrest / Lawmage's Binding / Demotion). The tail is
  // a layer-6 grant of the "activatedAbilitiesLocked" pseudo-keyword — the SAME keyword Koma's mode-1 lock
  // grants (effects/atoms/combat.js applyTapEffect) — enforced at BOTH activation chokepoints: stack-activated
  // abilities (legalChoices' activatedAbilitiesLocked gate) AND mana abilities (manaModel.manaSources gates on
  // it too, added with this class, since a mana ability IS an activated ability — CR 605.1a — so a locked
  // mana-dork produces nothing). Scoped to the host by staticEffectsOf exactly like cantAttack/cantBlock.
  // Anchored whole-clause ($): any OTHER rider leaves residue → the whole bonus drops (safe FN).
  const cantM = rest.match(/^can't (attack or block|attack|block)(, and its activated abilities can't be activated)?\.?$/);
  if (cantM) {
    if (cantM[1] !== "block") out.push({ layer: 6, op: { layerOp: "addKeyword", keyword: "cantAttack" }, duration: { kind: "permanent" } });
    if (cantM[1] !== "attack") out.push({ layer: 6, op: { layerOp: "addKeyword", keyword: "cantBlock" }, duration: { kind: "permanent" } });
    if (cantM[2]) out.push({ layer: 6, op: { layerOp: "addKeyword", keyword: "activatedAbilitiesLocked" }, duration: { kind: "permanent" } });
    return out;
  }
  // ⭐ GRANTED MUST-ATTACK (CR 508.1a) — "Enchanted creature attacks each combat if able" (Bloodshed Fever,
  // Lust for War, Skin Invasion) and the combined "gets +N/+N and attacks each combat if able" (Furor of
  // the Bitten, Guise of Fire, Uncontrollable Anger). The pacifism twin: a layer-6 grant of the `mustAttack`
  // pseudo-keyword, scoped to the host by staticEffectsOf exactly like cantAttack/cantBlock, so the
  // requirement lifts the instant the Aura leaves.
  // ⛔ WHY A PSEUDO-KEYWORD AND NOT THE EXISTING READER: opponentAI.selfMustAttack matches the CARD's
  // PRINTED oracle, so it structurally cannot see a granted requirement — the enchanted creature's own text
  // says nothing. The grant is read layer-aware beside it at the force-declare site.
  // ⓘ ENFORCEMENT PARITY, stated plainly rather than implied: this requirement is enforced in the AI's
  // attack planner only, which is exactly where the PRINTED form (Juggernaut, native today) is enforced.
  // The granted form makes no broader claim than the printed one already does.
  // ⛔ GOAD IS NOT THIS (CR 701.38) and must not be folded in — "is goaded" adds "and attacks a player
  // other than you if able", a DEFENDER restriction the planner would also have to honor. 8 aura carriers
  // wait on that; crediting them here would over-claim.
  {
    const ptThen = rest.match(/^gets ([+-]\d+)\/([+-]\d+) and attacks each (?:combat|turn) if able\.?$/);
    const bare = /^attacks each (?:combat|turn) if able\.?$/.test(rest);
    if (ptThen || bare) {
      if (ptThen) out.push({ layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: signed(ptThen[1]), toughness: signed(ptThen[2]) }, duration: { kind: "permanent" } });
      out.push({ layer: 6, op: { layerOp: "addKeyword", keyword: "mustAttack" }, duration: { kind: "permanent" } });
      return out;
    }
  }
  // ARREST POSSESSIVE (BLITZ AU-2 — Stupefying Touch / Detainment Spell): the bare "<subject> creature's
  // activated abilities can't be activated" form. Matched on the ORIGINAL clause `c` because the possessive
  // "'s" defeats the `${subject} creature ` subject-strip above (no whitespace after "creature"), so `rest`
  // still holds the whole clause. Same activatedAbilitiesLocked grant, same dual-chokepoint enforcement.
  if (new RegExp(`^${subject} ${noun}'s activated abilities can't be activated\\.?$`).test(c)) {
    return [{ layer: 6, op: { layerOp: "addKeyword", keyword: "activatedAbilitiesLocked" }, duration: { kind: "permanent" } }];
  }

  // EQUIP-BASE-PT-SET (layer 7b): "has base power and toughness N/N" (literal), OPTIONALLY composed with a
  // trailing "and has <grantable keyword>…" list (Super State "…9/9 and has flying, first strike, trample,
  // and haste"; Almost Perfect "…9/10 and has indestructible"; Gigantiform "…8/8 and has trample"). The
  // base-set is consumed, then `rest` advances past it (dropping the joining "and") so the SHARED
  // have-keyword tail below models the keyword grant — no second keyword parser, so a base-set + keyword
  // aura can't drift from a plain keyword aura. A DYNAMIC form ("…N/N, where X is your life total") has a
  // trailing clause that is NOT a "has <keyword>" grant, so the have-tail's GRANTABLE_KEYWORDS check rejects
  // it → null → whole bonus drops (Aettir and Priwen stays body-only — safe FN, no fabricated CDA). Without
  // a keyword tail (the bare "…N/N" form) `rest` becomes "" and the function returns the lone 7b op below.
  // applyLayer7 already applies sublayer 7b, layered after the layer-6 keyword grants.
  const baseSet = rest.match(/^(?:has|have)\s+base power and toughness\s+(\d+)\/(\d+)\b/);
  if (baseSet) {
    out.push({ layer: 7, sublayer: "7b", op: { power: parseInt(baseSet[1], 10), toughness: parseInt(baseSet[2], 10) }, duration: { kind: "permanent" } });
    rest = rest.slice(baseSet[0].length).trim().replace(/^and\s+/, "").trim(); // "…9/9 and has flying" → "has flying"
    if (!rest) return out;                              // bare base-P/T set, no keyword tail
  }

  // EQUIP-DYNAMIC-PT (layer 7c): "gets +X/+Y for each <metric>" (Conqueror's Flail). The metric must be a
  // modeled count source (parseSelfCountSource); an unmodeled metric → null → whole bonus drops (safe FN).
  // Matched BEFORE the fixed +N/+N so the "for each" tail isn't truncated. The dynamic count is evaluated in
  // applyLayer7 against the ATTACHED creature, whose controller == the equipment controller (ATTACH forbids
  // attaching to another player's creature, resolvers.js), so "you control" reads the right player.
  const dynPt = rest.match(/^gets?\s+([+-]\d+)\/([+-]\d+)\s+for each\s+(.+)$/);
  if (dynPt) {
    const countSpec = parseSelfCountSource(dynPt[3]);
    if (!countSpec) return null;                       // unmodeled metric → whole bonus drops
    // A subtypeOnBattlefield ("for each [other] X on the battlefield") count is evaluated against the ATTACHED
    // CREATURE, but its "other" excludes the AURA/EQUIPMENT SOURCE — which the creature-scoped count eval can't
    // see, so it would over-count the source itself (Ancestral Mask "+2/+2 for each OTHER enchantment" counted
    // the Mask → 6/6 not 4/4). Drop it → body-only → Arbiter (safe FN). This source is correct only on the
    // SELF / GROUP-anthem paths, where the counting permanent IS a candidate member.
    if (countSpec.kind === "subtypeOnBattlefield") return null;
    return [{ layer: 7, sublayer: "7c", op: { layerOp: "ptModifyDynamicCount", countSpec, perPower: signed(dynPt[1]), perToughness: signed(dynPt[2]) }, duration: { kind: "permanent" } }];
  }

  const ptMatch = rest.match(/^gets?\s+([+-]\d+)\/([+-]\d+)\b/);
  if (ptMatch) {
    out.push({ layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: signed(ptMatch[1]), toughness: signed(ptMatch[2]) }, duration: { kind: "permanent" } });
    rest = rest.slice(ptMatch[0].length).trim().replace(/^and\s+/, "").trim(); // "+1/+1 and has flying"
    // PUMP + RESTRICTION (BLITZ AU-2): "gets +X/+Y and can't attack/block" (Cagemail / Maniacal Rage /
    // Crippling Blight / Cast into Darkness / Undying Rage). The pump rides layer-7c above; the tail is the
    // SAME cantAttack/cantBlock layer-6 grant the PA-1 standalone class emits (enforced at the declare gates,
    // scoped to the host). Anchored whole-clause — any other tail falls through to the have-keyword check (safe
    // FN). Placed before losesMatch so a "can't" tail is never mistaken for a keyword removal.
    const pumpCantM = rest.match(/^can't (attack or block|attack|block)\.?$/);
    if (pumpCantM) {
      if (pumpCantM[1] !== "block") out.push({ layer: 6, op: { layerOp: "addKeyword", keyword: "cantAttack" }, duration: { kind: "permanent" } });
      if (pumpCantM[1] !== "attack") out.push({ layer: 6, op: { layerOp: "addKeyword", keyword: "cantBlock" }, duration: { kind: "permanent" } });
      return out;
    }
    // EQUIP-LOSES-KW (layer 6 removeKeyword): "+N/+N and loses <combat keyword>" (Colossus Hammer "loses
    // flying"). Only a known combat keyword removes; an unknown/ungrantable word leaves residue → the tail
    // check below rejects the whole clause (CREED). keywordSet applies removeKeyword (last-wins, 613.9).
    const losesMatch = rest.match(/^loses\s+(.+)$/);
    if (losesMatch) {
      const kw = losesMatch[1].trim().replace(/[^a-z ]/g, "").trim();
      if (!GRANTABLE_KEYWORDS.has(kw)) return null;    // only a modeled combat keyword may be removed
      out.push({ layer: 6, op: { layerOp: "removeKeyword", keyword: canonicalKeyword(kw) }, duration: { kind: "permanent" } });
      rest = "";
    }
    // COMBINED GRANT-TRIGGER (Bear Umbra "+2/+2 and has \"Whenever this creature attacks, untap all lands you
    // control.\""; Snake Umbra "+1/+1 and has \"…draw a card.\"") — after the P/T bonus, a "has \"<quoted
    // triggered ability>\"" tail is NOT a static keyword grant; it's a TRIGGERED ability the trigger system
    // fires on the host (triggers.parseGrantedTriggeredAbilities → grantedTriggersForHost, the SAME line the
    // combined GRANTED_ABILITY_LINE now matches). Emit ONLY the P/T bonus here (the trigger applies
    // independently), exactly like the equipment path skips trigger sentences — no double-count, no dropped
    // clause. CREED-gated: only when the quoted body is a FULLY-MODELED triggered ability (every trigger routes
    // natively, via the injected group-triggered validator that owns triggerRoutesNatively). If it isn't
    // modeled — or the validator isn't registered — fall through to the have-tail keyword check, which returns
    // null on a quoted trigger → the whole bonus drops → the Aura stays Arbiter (safe FN). Anchored to the
    // WHOLE quoted-ability tail ($) so any trailing rider leaves residue and keeps the card Arbiter.
    const quotedTrigM = rest.match(/^(?:has|have)\s+["“]([^"”]+)["”]\s*\.?$/);
    if (quotedTrigM) {
      const quoted = quotedTrigM[1].trim();
      if (/^(?:when|whenever|at)\b/i.test(quoted)
        && _groupTriggeredBodyValidator && _groupTriggeredBodyValidator(quoted)) {
        return out.length ? out : null;                // P/T bonus applies; the trigger fires via the trigger system
      }
      // COMBINED GRANT-ACTIVATED (BLITZ AC-1 — Deviant Glee "+2/+1 and has \"{R}: This creature gains
      // trample until end of turn.\""; Trollhide, Arcane Teachings, Mortarpod, Screaming Shield): the
      // quoted-ACTIVATED twin of the Bear Umbra fold. Emit ONLY the P/T here — the granted ability is
      // enumerated on the HOST by legalChoices.grantedActivatedForHost (GRANTED_ACTIVATED_LINE's compound
      // form extracts the same quoted body), so nothing is double-applied and nothing dropped. CREED-gated
      // on the SAME group-activated validator: a TARGETED body is fine (the host enumeration expands
      // targets exactly like a printed ability — Arcane Teachings' ping, Screaming Shield's mill), but an
      // UNMODELED body fails it → the whole bonus drops → body-only (a safe FN).
      if (!/^(?:when|whenever|at)\b/i.test(quoted)
        && _groupActivatedBodyValidator && _groupActivatedBodyValidator(quoted)) {
        return out.length ? out : null;                // P/T bonus applies; the ability enumerates on the host
      }
    }
  }
  if (rest) {
    // COMPOUND KEYWORD + GRANT-TRIGGER TAIL (Power Fist "has trample and \"Whenever this creature deals
    // combat damage to a player, put that many +1/+1 counters on it.\""): a trailing quoted TRIGGERED
    // ability after a keyword segment is fired by the trigger system on the host (the keyword-form
    // GRANTED_ABILITY_LINE → grantedTriggersForHost), NOT a static grant — strip it so the keyword half
    // parses as a normal grant below. CREED-gated exactly like the P/T+quote branch above: only a
    // validator-approved fully-modeled trigger body strips; an unmodeled or ACTIVATED quote ("{T}: …")
    // stays in place → the have-tail keyword check rejects it → the whole bonus drops (safe FN).
    const kwQuoteTail = rest.match(/^(.*?\S)\s+and\s+["“]([^"”]+)["”]\s*\.?$/);
    if (kwQuoteTail && /^(?:when|whenever|at)\b/i.test(kwQuoteTail[2].trim())
      && _groupTriggeredBodyValidator && _groupTriggeredBodyValidator(kwQuoteTail[2].trim())) {
      rest = kwQuoteTail[1].trim();
    }
  }
  if (rest) {
    // CONDITIONAL-KEYWORD grant (BLITZ AU-1 — the Runemark cycle: "has <keyword> as long as you control a
    // <colorA> or <colorB> permanent"). The keyword grant is GATED: layers.gateMet re-evaluates <condition>
    // live every derive pass, and gateOn:"source" (baked into the parseAsLongAsGate specs) reads the AURA/
    // EQUIPMENT controller's board — the enchanted/equipped creature may be an OPPONENT's, and CR 109.5 makes
    // "you" the source's controller, never the host's. Reuses the SAME parseAsLongAsGate the group-anthem /
    // self-static gated grants call (ONE condition vocabulary — classifier credit and runtime gate can't
    // drift); an unmodeled condition → null → the whole bonus drops (CREED all-or-nothing, a safe FN). ONLY
    // plain grantable keywords are gated below — a conditional protection/ward tail is out of this slice and
    // returns null rather than emit an UNGATED protection/ward (never a wrong-scope FP).
    let condGate = null;
    const alaM = rest.match(/^((?:has|have)\s+.+?)\s+as long as\s+(.+)$/);
    if (alaM) {
      condGate = parseAsLongAsGate(alaM[2].trim());
      if (!condGate) return null;                      // an unmodeled "as long as" condition → whole bonus drops
      rest = alaM[1].trim();
    }
    const haveMatch = rest.match(/^(?:has|have)\s+(.+)$/);
    if (!haveMatch) return null;                       // residue that isn't a keyword/protection grant
    // EQUIP-PROTECTION: a "protection from <color>…" grant occupies the WHOLE have-tail (protection lists
    // join with "and from", which the keyword splitter would mangle). Detect it first; a non-color/dynamic
    // quality returns null → whole bonus drops (Sword of Wealth and Power stays body-only).
    const protColors = parseAttachedProtectionColors(haveMatch[1].trim());
    if (protColors) {
      if (condGate) return null;                       // a GATED protection is out of this slice — never an ungated FP
      out.push({ layer: 6, op: { layerOp: "addProtection", colors: protColors }, duration: { kind: "permanent" } });
      return out.length ? out : null;
    }
    // EQUIP-PROTECTION-DYNAMIC: the SOLE modeled non-color quality — "protection from each color that's not
    // in your commander's color identity" (Commander's Plate, CR 702.16j). The color set is state-dependent
    // (WUBRG minus the controller's commander color identity), so it's emitted as a DYNAMIC addProtection op
    // that layers.permanentProtectionColors resolves at read time. All-or-nothing: it must occupy the WHOLE
    // have-tail (no rider trails), matching every other quality here. Any OTHER non-color quality still → null.
    if (/^protection from each color that's not in your commander's color identity$/i.test(haveMatch[1].trim())) {
      if (condGate) return null;                       // a GATED dynamic-protection is out of this slice
      out.push({ layer: 6, op: { layerOp: "addProtection", dynamicColors: "notCommanderIdentity" }, duration: { kind: "permanent" } });
      return out.length ? out : null;
    }
    // Split the have-tail into RAW segments (before the non-alpha strip, so a ward cost's "{N}" survives),
    // each of which must be a grantable keyword OR a fixed-generic "ward {N}" grant.
    const segs = haveMatch[1].split(/,|\band\b/).map((s) => s.trim()).filter(Boolean);
    if (segs.length === 0) return null;
    for (const seg of segs) {
      // EQUIP-WARD (BLITZ EQ-1, CR 702.21): "ward {N}" (Lavaspur Boots, Crystal Carapace) — a layer-6 addWard
      // grant scoped to the attached creature by staticEffectsOf; ward.js unions the granted generic cost with
      // any printed ward at the soft-counter tax site (permanentGrantedWardCosts), so the grant is ENFORCED,
      // not parse-only. ONLY a fixed-generic pip is modeled — the sole granted-ward cost the runtime enforces
      // (permanentGrantedWardCosts reads `generic` only). A colored / {X} / life / discard ward grant falls
      // through to null below → the whole bonus drops → body-only, a safe FN (never a costless/wrong-cost ward).
      const wardM = seg.match(/^ward \{(\d+)\}$/);
      if (wardM) {
        if (condGate) return null;                       // a GATED ward is out of this slice
        out.push({ layer: 6, op: { layerOp: "addWard", generic: parseInt(wardM[1], 10) }, duration: { kind: "permanent" } });
        continue;
      }
      const w = seg.replace(/[^a-z ]/g, "").trim();
      if (!w || !GRANTABLE_KEYWORDS.has(w)) return null;   // an unmodeled keyword/rider → whole bonus drops
      out.push({ layer: 6, op: { layerOp: "addKeyword", keyword: canonicalKeyword(w), ...(condGate ? { gate: condGate } : {}) }, duration: { kind: "permanent" } });
    }
  }
  return out.length ? out : null;
}

/**
 * A clause that touches the ATTACHED CREATURE — the granted abilities are templated as
 * "Equipped/Enchanted creature …" or, in condensed text, a leading pronoun ("It can't be
 * blocked.") or a conditional ("As long as enchanted creature is …, it …"). The
 * equipment/aura's OWN body (a self-keyword, the "Equip {cost}" line) is NOT about the
 * creature. Used to make the bonus ALL-OR-NOTHING over every creature clause.
 */
function touchesAttachedCreature(c, subject, noun = "creature") {
  return c.includes(`${subject} ${noun}`) || /^it\b/.test(c) || /^that creature\b/.test(c);
}

/**
 * THE ATTACHED BODY NOUN (AN-1, CR 303.4) — the noun an attachment's body uses for its host.
 *
 * An Aura that may enchant a NON-creature can't say "enchanted creature" in its body, so it says
 * "Enchanted PERMANENT doesn't untap during its controller's untap step" (Ice Over, Coma Veil) or
 * "Enchanted ARTIFACT can't attack or block…" (Stasis Cocoon). The entire attached-bonus parser was
 * written against the literal "<subject> creature", which is why every one of those cards parked
 * regardless of whether its EFFECT was modeled — and each of these effects already is.
 *
 * "creature" is checked FIRST and is the default, so every card that parses today keeps its exact
 * noun and this is additive by construction. A card printing BOTH nouns resolves to "creature" and
 * its "permanent" clause becomes residue → the card parks (a safe FN, never a silent half-apply).
 */
const ATTACHED_BODY_NOUNS = ["creature", "permanent", "artifact"];
export function attachedBodyNoun(card, subject = "enchanted") {
  const oracle = String(card?.oracle || card?.oracle_text || "").toLowerCase();
  for (const noun of ATTACHED_BODY_NOUNS) if (oracle.includes(`${subject} ${noun}`)) return noun;
  return "creature";
}

/**
 * The static bonus an Equipment ("equipped creature") or Aura ("enchanted creature") grants
 * the creature it's attached to — "gets +X/+Y" and/or "has [keyword]" — as partial
 * continuous-effect descriptors (no `affects`; `layers.staticEffectsOf` scopes them to the
 * attached creature ONLY when `attachedTo` is set). ALL-OR-NOTHING per the "no silent gaps"
 * rule: if ANY clause that TOUCHES the attached creature isn't a clean "+X/+Y and/or
 * grantable keywords" grant — a separate-sentence rider, a conditional, a triggered ability —
 * the WHOLE bonus drops to [] (a clean false-negative → body-only, never a misleading partial
 * buff). The card's own body keywords / Equip line are ignored. `subject` defaults to the one
 * the card uses. Pure.
 */
export function parseAttachedBonus(card, subjectOverride) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  // AN-1: the sniff reads the SUBJECT off any modeled body noun. Before this it tested only
  // "enchanted creature", so an Aura whose body says "Enchanted permanent …" (Ice Over) fell through to
  // "equipped" and was parsed as an EQUIPMENT — a latent misfile that was inert only because every such
  // card was parked. The noun is then resolved once per card and threaded into every clause helper.
  const subject = subjectOverride || (/enchanted (?:creature|permanent|artifact)/i.test(oracle) ? "enchanted" : "equipped");
  const noun = attachedBodyNoun(card, subject);
  const slot = _cardSlot(card);
  const slotKey = `attached:${subject}:${noun}`;
  if (slot && slotKey in slot) return slot[slotKey];
  const out = [];
  let saw = false;
  for (const clause of abilityClauses(oracle)) {
    const c = clause.toLowerCase();
    // A TRIGGER sentence about the equipped creature ("Whenever equipped creature attacks/deals combat
    // damage, …" — Argentum Armor, Goldvein Pick, the Swords) is NOT a static bonus clause: it touches the
    // creature but is handled entirely by the trigger system (detectTriggers + the equippedCreature scope).
    // Skip it here so it doesn't poison the all-or-nothing static parse — the runtime applies the P/T/keyword
    // bonus via the layer engine AND fires the trigger independently. This mirrors coverage.permanentEquipment-
    // Covered, which strips trigger sentences before parsing the bonus, so the metric and runtime can't drift.
    // (A GRANTED quoted ability — "Equipped creature … has \"Whenever …\"" — starts with the SUBJECT, not a
    // bare When/Whenever/At, so it is NOT skipped: parseAttachedClause returns null on it → the whole bonus
    // still drops, keeping The Reaver Cleaver body-only.)
    // EQUIPMENT-ONLY: equipment nativeness is gated by coverage.permanentEquipmentCovered, which independently
    // requires every trigger sentence to ROUTE natively (allTriggerSentencesModeled) — so skipping the trigger
    // here can't over-claim.
    if (subject === "equipped" && /^(?:when|whenever|at)\b/.test(c.trim())) continue;
    // AURA (SUPER STATE): the aura's OWN trigger sentence poisons the bonus parse (it "touches" the enchanted
    // creature but isn't a "<subject> creature has/gets" static clause → parseAttachedClause returns null → the
    // bonus drops to []). Skip it ONLY when it is a KNOWN-MODELED aura-own trigger (isModeledAuraOwnTrigger) —
    // the same shape isNativeAura's residue gate admits — so the runtime attaches + fires it while the layer
    // engine applies the P/T/keyword bonus independently. An UNMODELED aura trigger is NOT skipped → the bonus
    // still drops to [] → non-native (CREED: an aura trigger the engine can't fire keeps the whole card off
    // native, never a silent drop). Mirrors the equipment trigger-skip, gated to the modeled shape for auras.
    if (subject === "enchanted" && /^(?:when|whenever|at)\b/.test(c.trim())) {
      if (isModeledAuraOwnTrigger(c)) continue;
      // PZ-1/LA-1: a validator-approved aura-own ETB (fires at enterPermanent) isn't a bonus clause —
      // skip it so a compound aura keeps its P/T/keyword half (mirrors the residue admission).
      if (_auraOwnEtbValidator && _auraOwnEtbValidator(c)) continue;
      // ⭐ AU-TRIG+BONUS — a validator-approved aura-own NON-ETB trigger is not a bonus clause either: the
      // Aura is the trigger SOURCE (CR 603.2) and the trigger system fires it off triggerSourcesOf (plus the
      // orphaned-aura look-back for the host-dies case, CR 603.10a), entirely independently of the layer
      // engine that applies the P/T/keyword bonus. Before this it fell through and dropped the WHOLE bonus.
      // Same validator gating as every skip above: an UNMODELED aura trigger is not vouched for, still
      // poisons the parse, and keeps the card off native (CREED).
      if (_auraOwnTriggerValidator && _auraOwnTriggerValidator(c)) continue;
    }
    // ⭐ AU-GRANT+BONUS — a GRANTED QUOTED ABILITY ("Enchanted creature has \"At the beginning of your
    // upkeep, …\"") is not a bonus clause either: the HOST gains it, and the runtime delivers it through the
    // grant lane (triggersForEvent / grantedActivatedForHost / grantedManaSpecsFor) entirely independently of
    // the layer engine. Before this it fell through to parseAttachedClause, returned null, and **dropped the
    // WHOLE bonus to []** — so Pillory of the Sleepless's "can't attack or block" silently stopped applying
    // the moment the grant line was present. That was measured, not theorised (auraGrantPlusStatic.test.js
    // pins the before/after with a positive control), and it is why the classification composite built on top
    // of it was reverted a slice ago rather than shipped.
    // ⛔ GATED ON THE VALIDATOR, exactly like the aura-own trigger skip above: only a grant coverage.js can
    // vouch for is skipped. An UNMODELED grant still poisons the parse → bonus [] → the card stays non-native
    // (CREED — The Reaver Cleaver, whose granted body is unmodeled, is unchanged). AURAS ONLY: the equipment
    // path keeps the note above it, since permanentEquipmentCovered gates equipment nativeness separately.
    if (subject === "enchanted" && _auraGrantedAbilityValidator && _auraGrantedAbilityValidator(c)) continue;
    // PZ-1: the attached tap-lock line is enforced in gameState.untapAll, not as a layer bonus — skip it
    // (the AP-1 wall-skip pattern) so a compound aura keeps its other half.
    if (subject === "enchanted" && ATT_NO_UNTAP_CLAUSE_RE.test(c.trim())) continue;
    // AF-1: a validator-approved AURA-OWN ACTIVATED line ("{W}: Enchanted creature gets +0/+3 until end of
    // turn") is the runtime's (legalChoices enumerates it on the Aura; the pump resolves onto the host via
    // the enchanted referent) — skip it so the compound carrier keeps its static half.
    // The pre-filter is "a line with a COST before a colon" — mana or otherwise. It used to demand a mana
    // SYMBOL, which silently excluded Dark Privilege's "Sacrifice a creature: Regenerate enchanted
    // creature." and so poisoned that card's bonus parse (credited native, +1/+1 never applied). The
    // VALIDATOR does the real work — one fully modeled ability whose atoms all target the enchanted host;
    // this only decides what gets handed to it.
    if (subject === "enchanted" && /^[^:\n]+:/.test(c.trim())
      && _auraOwnActivatedValidator && _auraOwnActivatedValidator(clause)) continue;
    if (!touchesAttachedCreature(c, subject, noun)) continue;    // the card's own body — ignore
    // AP-1 (CR 615): a modeled prevention wall ("Prevent all [combat] damage that would be dealt to /
    // and dealt by / by enchanted creature") is enforced at the DAMAGE PATHS (attachedDamagePrevention),
    // not as a layer bonus — skip it so a compound aura (Ghostly Possession's flying + wall) keeps its
    // keyword half instead of dropping the whole bonus.
    if (subject === "enchanted" && ATT_PREV_CLAUSE_RE.test(c.trim())) continue;
    // ⭐⭐ DURING-YOUR-TURN ATTACHMENT BONUS (Javelin of Lightning, Hook Swords, Knife, Quick-Draw Katana,
    // Hookblade, Dragoon's Lance, Jousting Lance, Hexgold Halberd, Bilbo's Ring): "During your turn, equipped
    // creature gets +2/+0 and has first strike." ELEVEN carriers, ZERO native — the attachment-bonus parser
    // had no lane for a time gate at all.
    // ⭐ BOTH HALVES ALREADY EXISTED AND HAD NEVER MET — the same shape as the your-turn GROUP grant a few
    // hundred lines up, and this arm is deliberately built the same way: strip the time prefix, run the
    // clause through the EXISTING attached-clause parser, and stamp the EXISTING `{kind:"yourTurn"}` gate
    // (layers.gateMet reads state.activePlayer === controller, re-evaluated every derive pass) onto whatever
    // that parser produced. No new parsing, no new gate.
    // ⛔ THE P/T OP MUST BE SWAPPED, NOT JUST STAMPED. `ptModify` has no gate lane — the gated twin is a
    // DIFFERENT op (`ptModifyGated`), which is exactly what the self arm emits. Stamping a gate onto
    // `ptModify` would produce a descriptor the layer engine applies UNCONDITIONALLY: the bonus would be
    // live on every player's turn, strictly better than printed. Keyword grants take the gate directly.
    // ⛔ ALL-OR-NOTHING (CREED): every inner descriptor must be one of those two known shapes, else NOTHING
    // is emitted and the clause stays residue → body-only. A form this can't gate honestly must not be
    // silently ungated.
    const dtAttached = /^during your turn, /i.test(c) ? c.replace(/^during your turn,\s*/i, "") : null;
    if (dtAttached && dtAttached.startsWith(`${subject} ${noun}`)) {
      const inner = parseAttachedClause(dtAttached, subject, noun);
      const gateable = inner && inner.length && inner.every((d) =>
        (d?.layer === 6 && d?.op?.layerOp === "addKeyword" && !d.op.gate)
        || (d?.layer === 7 && d?.op?.layerOp === "ptModify"));
      // ⭐ THE `every(...)` HALF IS LIVE, unlike the your-turn GROUP arm's equivalent — and the case is a
      // base-P/T SET ("During your turn, equipped creature has base power and toughness 5/5"). That descriptor
      // is layer-7b with NO `layerOp`, so a stamped gate would not be honoured and the set would apply on
      // every turn. Refusing it is the only honest answer, and the mutation that drops this check flips that
      // wording to native-equipment. Pinned in duringYourTurnEquipment.test.js.
      if (!gateable) { if (slot) slot[slotKey] = []; return []; }
      for (const d of inner) {
        out.push(d.op.layerOp === "ptModify"
          ? { ...d, op: { layerOp: "ptModifyGated", power: d.op.power, toughness: d.op.toughness, gate: { kind: "yourTurn" } } }
          : { ...d, op: { ...d.op, gate: { kind: "yourTurn" } } });
      }
      saw = true;
      continue;
    }
    const parsed = c.startsWith(`${subject} ${noun}`) ? parseAttachedClause(c, subject, noun) : null;
    if (!parsed) { if (slot) slot[slotKey] = []; return []; }     // a creature clause we can't fully model
    out.push(...parsed);
    saw = true;
  }
  const result = saw ? out : [];
  if (slot) slot[slotKey] = result;
  return result;
}

/**
 * SOULBOND (BLITZ SL-1, CR 702.95a/b) — the BOND ability a paired soulbond creature confers on BOTH itself
 * and its partner: "As long as this creature is paired with another creature, both creatures have <keyword>."
 * / "…each of those creatures gets +N/+N." Parsed into the SAME layer descriptors an Equipment/Aura bonus
 * yields (reusing parseAttachedClause via a normalized "equipped creature <effect>" rewrite), so the metric
 * (coverage.soulbondCardTier) and the runtime (layers.staticEffectsOf, which scopes these to BOTH paired ids)
 * read ONE parse and can't drift. Returns the descriptor array, or null when the bond is anything we don't
 * model as a static +N/+N-or-grantable-keyword grant — a quoted triggered/activated ability (Tandem Lookout,
 * Deadeye Navigator), protection from a subtype (Diregraf Escort's "protection from Zombies"), or any other
 * rider — which PARKS the whole carrier (CR whole-card-or-park). A non-soulbond card → null. Pure.
 */
const SOULBOND_BOND_RE = /^as long as this creature is paired with another creature,\s+(?:both creatures|each of those creatures)\s+(.+)$/im;
function normalizeSelfName(oracle, name) {
  let out = String(oracle || "").replace(/[’]/g, "'");
  const nm = String(name || "").replace(/[’]/g, "'");
  if (!nm) return out;
  out = out.replace(new RegExp(`\\b${nm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), "this creature");
  const short = nm.split(",")[0];
  if (short && short !== nm) out = out.replace(new RegExp(`\\b${short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), "this creature");
  return out;
}
export function parseSoulbondBond(card) {
  if (!hasKeyword(card, "soulbond")) return null;
  // Normalize the card's (short) name → "this creature" so a bond line that names the card matches (mirrors
  // coverage.isKeywordOnly's self-normalization). FN-safe: a mangled non-self clause just fails the RE below.
  const oracle = normalizeSelfName(String(card?.oracle || card?.oracle_text || ""), card?.name);
  const m = oracle.match(SOULBOND_BOND_RE);
  if (!m) return null;
  // Strip any same-line parenthetical reminder ("both creatures have hexproof. (They can't be the targets…)")
  // before parsing, then the trailing period, then lowercase → "have vigilance" / "gets +1/+1" / "have hexproof".
  const effect = m[1].replace(/\([^)]*\)/g, "").trim().replace(/\.\s*$/, "").toLowerCase();
  return parseAttachedClause(`equipped creature ${effect}`, "equipped");
}

/**
 * SOULBOND residual (BLITZ SL-1) — the card's oracle with the modeled soulbond text removed: the BOND sentence
 * ("As long as … is paired …, …") and the "soulbond" keyword word itself (its reminder is a parenthetical that
 * coverage.isKeywordOnly's stripReminder drops). What remains (a printed keyword like Flying/Reach, or nothing)
 * is judged keyword-only to decide the whole card is native. Pure; a non-soulbond card is returned unchanged
 * (harmless — the caller only invokes this once parseSoulbondBond has confirmed a modeled soulbond carrier).
 */
export function stripSoulbondText(card) {
  return normalizeSelfName(String(card?.oracle || card?.oracle_text || ""), card?.name)
    .replace(SOULBOND_BOND_RE, "")   // drop the whole bond sentence (line)
    .replace(/\bsoulbond\b/gi, "");  // drop the keyword word (reminder paren handled by stripReminder)
}

/** Back-compat alias — the equipment bonus is the attached bonus with the "equipped" subject. */
export const parseEquipmentBonus = (card) => parseAttachedBonus(card, "equipped");
/** An Aura's "Enchanted creature gets/has …" bonus (same machinery, "enchanted" subject). */
export const parseAuraBonus = (card) => parseAttachedBonus(card, "enchanted");

/** Split oracle into ability clauses (period / semicolon / newline). Exported for coverage. */
export function equipmentAbilityClauses(oracle) {
  return abilityClauses(oracle);
}

/** True when the card's TYPE line marks it an Aura (CR 303.4). */
export function isAuraCard(card) {
  return /\bAura\b/.test(String(card?.type || card?.type_line || ""));
}

/**
 * PLAYER-AURA (Fraying Sanity / the Curse class — SHELF S7, CR 303.4 + 702.5): an Aura whose Enchant
 * subject is exactly "player". Cast targeting a PLAYER; the permanent enters with `enchantedPlayerId`
 * stamped (no host permanent — the attachments machinery is untouched); the enchanted player's
 * elimination sweeps it to its owner's graveyard (CR 704.5n analog). The bare subject only — an
 * "enchant opponent" / restricted subject stays unmodeled → Arbiter (FN-safe).
 */
export function isPlayerAuraCard(card) {
  return isAuraCard(card) && auraEnchantSubject(card) === "player";
}

/**
 * The subject of an Aura's "Enchant <subject>" keyword ability (CR 702.5), lowercased —
 * "creature", "permanent", "creature you control", "land", "player", … — or null if the
 * card has no Enchant line. The modeled subset is EXACTLY "creature" (any creature, no
 * controller/zone restriction); everything else stays unmodeled.
 */
export function auraEnchantSubject(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  for (const clause of abilityClauses(oracle)) {
    const m = clause.trim().match(/^enchant\s+(.+)$/i);
    if (m) return m[1].trim().toLowerCase();
  }
  return null;
}

// CHOSEN-COLOR ON ENTER (CR 614.12b) — the EXACT "As this Aura enters, choose a color" cast-time color
// choice (Utopia Sprawl). Anchored whole-clause so a color choice with a rider ("…choose a color other
// than green", "…choose two colors") does NOT match → the card stays non-native (safe FN). Exported so
// resolvers.enterPermanent stamps the auto-picked `chosenColor` on the Aura permanent under the SAME gate
// the native-mana-aura path uses — the metric + runtime can't drift.
const AURA_CHOOSE_COLOR_ETB_RE = /^as this aura enters, choose a color$/i;
export function auraChoosesColorOnEnter(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  return abilityClauses(oracle).some((c) => AURA_CHOOSE_COLOR_ETB_RE.test(c.trim()));
}

/**
 * Clauses on an Aura that are NEITHER the "Enchant …" keyword line NOR a clause that
 * touches the enchanted creature (those are the modeled bonus). A non-empty residue means
 * the Aura carries something we DON'T model (a triggered ability, an activated ability, a
 * static effect on the controller) — so attaching it and applying only the P/T/keyword
 * bonus would SILENTLY drop that text. Used to keep `isNativeAura` all-or-nothing.
 */
function auraResidueClauses(card) {
  // SELF-FLASH PERMISSION removed before the split — the SENTENCE form of the bare "Flash" keyword already
  // admitted a dozen lines below, on the identical argument: the engine hard-casts at the main-phase window
  // and the flash speed simply goes unused. Board-verified rather than assumed (see FLASH_PERMISSION_LINE in
  // textNormalize.js). It must go as a LINE, not a clause: the sacrifice rider is a second sentence with its
  // own commas, so abilityClauses would shred it into fragments that no clause pattern could ever admit.
  const oracle = stripFlashPermissionLine(String(card?.oracle || card?.oracle_text || ""));
  const out = [];
  for (const clause of abilityClauses(oracle)) {
    const c = clause.toLowerCase().trim();
    if (/^enchant\b/.test(c)) continue;                       // the Enchant keyword line
    // FLASH (BLITZ FA-1 — Tiger Claws / Frantic Strength / Epic Proportions): the Aura's own cast-timing
    // keyword is NOT residue — the engine hard-casts at the main-phase window (the flash speed simply goes
    // unused: the card still does exactly its printed thing at sorcery speed, the bloodrush-inverse — an
    // FN-safe timing simplification, never a wrong resolution).
    if (c === "flash") continue;
    // CYCLING (BLITZ TS-1 — Savage Hunger / Sicken / Improvised Armor / Sigil of the Nayan Gods, CR 702.29a):
    // the Aura's own "Cycling {cost}" line is a HAND-zone alternative action the runtime already offers for
    // any card type (legalChoices.actionsCycleFromHand is type-agnostic — discard the card, draw a card);
    // once the Aura is on the battlefield the line is meaningless, so it is NOT residue. Anchored to the
    // plain brace-cost form only: typecycling ("Islandcycling {2}") doesn't match (its library search is
    // unmodeled → residue, safe FN), and a "when you cycle …" TRIGGER is its own When/Whenever clause that
    // falls to the trigger branch below → residue → the card stays body-only (CREED all-or-nothing).
    if (/^cycling (?:\{[^}]+\})+$/.test(c)) continue;
    // SELF-SHROUD (BLITZ TS-1 — Diplomatic Immunity): "Shroud" printed on the Aura ITSELF is enforced at the
    // canBeTargetedBy chokepoint (permanentHasKeyword reads the PRINTED keyword of any permanent type), the
    // same allowlist reasoning as the equipment gate's SELF-KEYWORD admit (Mithril Coat) — so the line is a
    // MODELED clause, not residue. Only the bare keyword line matches; any rider stays residue.
    if (c === "shroud") continue;
    // MADNESS (BLITZ MA-1 — Senseless Rage / Strength of Isolation / Strength of Lunacy): the Aura's own
    // "Madness {cost}" line is a DISCARD-window cast option (CR 702.35), vacuous for the normal hard-cast —
    // the SAME versioned trade MD-1 shipped for every other permanent (coverage.reMadnessCost; the engine
    // never offers the discard-window cast, so a discarded madness card just goes to the graveyard — an
    // FN-safe alternative-entry simplification, never a wrong resolution; see commit 6b23d689 for the full
    // ninjutsu/morph rationale). Cost-pips-only anchor: a madness-REFERENCING static/trigger never matches.
    if (/^madness (?:\{[^}]+\})+$/.test(c)) continue;
    // DREDGE N (CR 702.52 — Moldervine Cloak) — the aura-side twin of the credit coverage.isKeywordOnly
    // already carries (`reDredgeCost`), on that gate's own recorded argument: dredge is a REPLACEMENT
    // OPTION on a draw while the card is in the GRAVEYARD, the engine never offers it, so every draw stays
    // a normal draw and the resolution is faithful. Nothing about the Aura's battlefield behaviour changes.
    // Verified rather than assumed: `isKeywordOnly("Dredge 2")` is true and a vanilla dredge creature is
    // already native-body, so this lane was simply disagreeing with a call the project had settled.
    //
    // ⛔ ADDED AS ITS OWN ANCHORED LINE, not by admitting every covered keyword wholesale. Each entry in
    // this list carries a SEPARATE vacuity argument (flash = timing unused, cycling = a hand-zone action
    // the runtime does offer, madness = an alternative entry, escape = a recast window) and a blanket
    // isKeywordOnly admission here would credit keywords whose aura-side behaviour nobody has checked.
    // DIGIT tail, matching coverage's own anchor — a dredge-REFERENCING static or trigger never matches.
    if (/^dredge \d+$/.test(c)) continue;
    // RIPPLE N (CR 702.19 — Surging Might) — the same admission as dredge directly above, on the same
    // settled call: `isKeywordOnly("Ripple 4")` is true and a vanilla ripple creature is already
    // native-body. Ripple is a CAST-time bonus ("when you cast this spell, you may reveal the top N and
    // cast free copies") that the engine never offers, so the spell simply resolves as printed — an
    // FN-safe alternative-value simplification, never a wrong resolution, exactly like madness/escape.
    // The Aura's battlefield behaviour is untouched either way. Digit-anchored so ripple-REFERENCING text
    // never matches. Added as its own line, for the reason spelled out on the dredge entry above.
    if (/^ripple \d+$/.test(c)) continue;
    // ESCAPE (CR 702.138a) — the aura-side twin of the credit coverage.isKeywordOnly carries for creatures.
    // A GRAVEYARD re-cast window the runtime never offers, so the from-hand cast puts the identical Aura
    // onto the battlefield; the line is vacuous residue for the only cast the engine performs. Every aura
    // carrier has a real printed mana cost (Sentinel's Eyes {W}, Escape Velocity {R}, Mogis's Favor {B}) —
    // checked, because the vacuity argument collapses on a card that can ONLY be cast via the keyword (the
    // suspend-only artifacts are refused for exactly that reason).
    //
    // ⭐ ONE CLAUSE HERE, A WHOLE LINE THERE. abilityClauses keeps "Escape—{W}, Exile two other cards…"
    // INTACT (it does not split that comma), so a single clause pattern is enough — whereas isKeywordOnly
    // splits on commas and needed the line removed before its split. Same keyword, two different shapes,
    // because the two residue paths tokenize differently.
    //
    // The dash is load-bearing: a clause beginning with the card NAME "Escape Velocity …" has no dash after
    // the keyword and can never match.
    if (/^escape\s*[—–-]/.test(c)) continue;
    // An aura-own TRIGGER sentence starting with When/Whenever/At "touches" the enchanted creature but is NOT
    // a static bonus clause; admit it as non-residue ONLY when it is the modeled aura-own trigger (the runtime
    // fires it), else it stays residue → non-native (CREED). Checked BEFORE the generic touchesAttachedCreature
    // skip so an UNMODELED aura trigger ("Whenever enchanted creature dies, draw a card") is NOT silently
    // admitted — it falls through to `out.push`, keeping the Aura body-only.
    if (/^(?:when|whenever|at)\b/.test(c)) {
      if (isModeledAuraOwnTrigger(c)) continue;               // AURA-OWN-TRIGGER: modeled combat-damage relay (Super State)
      if (isSelfPigReturnClause(c)) continue;                 // SELF-LTB: the modeled Aura self-PiG-return trigger
      // PZ-1/LA-1: an aura-own ETB whose effect routes natively (injected validator — "When this Aura
      // enters, tap enchanted creature / draw a card / you gain 3 life"): fired at the enterPermanent
      // chokepoint like any permanent's ETB, so it is NOT residue. Unregistered → residue (safe FN).
      if (_auraOwnEtbValidator && _auraOwnEtbValidator(clause)) continue;
      out.push(clause);                                       // any other aura-own trigger → residue → non-native
      continue;
    }
    if (isTotemArmorClause(c)) continue;                      // TOTEM ARMOR (Bear Umbra): the modeled destruction-replacement
    // AN-1: read the touch against the Aura's OWN body noun, so "Enchanted permanent doesn't untap…"
    // counts as a host-bonus clause rather than falling through to residue. auraTouchClausesAllModeled
    // (the PZ-1 hardening) independently re-checks every clause admitted here, so widening the touch
    // heuristic cannot on its own let an unmodeled clause through.
    if (touchesAttachedCreature(c, "enchanted", attachedBodyNoun(card, "enchanted"))) continue;
    out.push(clause);
  }
  return out;
}

// SELF-LTB (Wave 4) — the EXACT Aura self-PiG-return trigger the engine now plays end-to-end (Rancor:
// "When this Aura is put into a graveyard from the battlefield, return it to its owner's hand."). When the
// Aura's host leaves (or the Aura is destroyed) gameState records a leave event, triggers.checkLeavesTriggers
// fires the self-return atom, and the Aura goes from its owner's graveyard back to hand. So this clause is no
// longer residue. Anchored EXACTLY to the modeled shape (mirrors selfReturn.js's detector + clause parser) —
// a rider ("…at the beginning of the next end step" = a delayed return, "…and draw a card") leaves residue and
// keeps the Aura body-only (CREED all-or-nothing). The optional leading "(reminder)" was stripped by the
// caller's lowercase/trim only; abilityClauses already drops parenthetical reminders.
const SELF_PIG_RETURN_CLAUSE_RE =
  /^when this aura is put into a graveyard from the battlefield, return it to its owner's hand\.?$/i;
function isSelfPigReturnClause(clause) {
  return SELF_PIG_RETURN_CLAUSE_RE.test(String(clause || "").trim());
}

// TOTEM ARMOR (CR 702.116 — "Umbra armor" is the older functional-reminder name; both are the SAME ability).
// "If enchanted creature would be destroyed, instead remove all damage from it and destroy this Aura." A
// destruction-REPLACEMENT effect on the Aura (CR 614): the NEXT time the enchanted permanent would be
// destroyed, the Aura is destroyed instead and all damage is removed from the creature (it survives). Modeled
// end-to-end by the runtime at BOTH destruction sites (gameState.destroyLethalCreatures — the lethal-damage
// SBA — and spellEffects.applyDestroyEffect — the targeted-destroy effect), which walk the creature's
// attachments for a totem-armor Aura and consume it instead of killing. abilityClauses already dropped the
// parenthetical reminder text, so the whole clause reduces to the bare keyword name. Anchored exactly ($) —
// only the printed keyword line ("Umbra armor" / "Totem armor") matches; any rider stays residue (CREED).
const TOTEM_ARMOR_CLAUSE_RE = /^(?:umbra|totem) armor$/i;
function isTotemArmorClause(clause) {
  return TOTEM_ARMOR_CLAUSE_RE.test(String(clause || "").trim());
}

/**
 * Does this Aura (or token-Aura) carry TOTEM ARMOR / Umbra armor (CR 702.116)? The single source of truth
 * shared by the coverage classifier (crediting the keyword line as modeled) AND the two runtime destruction
 * sites (which consume the Aura instead of destroying the creature). Detected from the Aura's own oracle text
 * so no per-permanent flag needs stamping at attach time. Pure; card-based; false for a non-Aura.
 */
export function auraHasTotemArmor(card) {
  if (!isAuraCard(card)) return false;
  const oracle = String(card?.oracle || card?.oracle_text || "");
  return abilityClauses(oracle).some((c) => isTotemArmorClause(c));
}

// AURA-OWN-TRIGGER (SUPER STATE) — the EXACT aura-own combat-damage trigger the engine now plays end-to-end:
// "Whenever enchanted creature deals combat damage to a player/an opponent, it deals that much damage to each
// other opponent." The Aura is a live trigger SOURCE while attached; triggers.checkCombatDamageTriggers fires
// its printed trigger (detected via the "enchanted creature deals combat damage" → equippedCreature-scope
// path) and the cdmg-to-each-other-opponent atom deals the combat-damage amount to each OTHER opponent. So
// this clause is no longer residue AND must not poison the P/T bonus parse. Anchored EXACTLY to the modeled
// shape (the trigger condition + the sole modeled effect); any OTHER aura-own trigger (a different effect, a
// rider, a "to a player or planeswalker" qualifier) does NOT match → it stays residue → the Aura is body-only
// (CREED all-or-nothing: an aura trigger the engine can't fire end-to-end keeps the whole card off native).
const AURA_OWN_MODELED_TRIGGER_RE =
  // (1) the Super-State combat relay · (2) SL-1: the attached dealt-by lifegain link (Spirit Link /
  // Vampiric Link / Armadillo Cloak's line — fired by triggers.checkDealtByTriggers via the attachment
  // walk at both damage paths; the AURA's controller gains).
  /^whenever enchanted creature deals combat damage to (?:a player|an opponent), it deals that much damage to each other opponent\.?$|^whenever enchanted creature deals (?:combat )?damage, you gain that much life\.?$/i;
function isModeledAuraOwnTrigger(clause) {
  return AURA_OWN_MODELED_TRIGGER_RE.test(String(clause || "").trim());
}

// ATTACHED DAMAGE-PREVENTION (BLITZ AP-1, CR 615 — Gaseous Form / Sandskin / Inviolability / Defang):
// the four exact printed wall shapes on a creature Aura. "to" walls zero damage the HOST would take;
// "by" walls zero damage the host would deal; the combat forms bind only combat damage. Lives HERE so
// the aura NATIVE gate below (which the CAST paths consult directly) and the runtime damage paths
// (combatEvasion.attachedDamagePrevention) read the SAME shapes — metric, cast, and enforcement can't
// drift. Conditional / cost-bearing variants never match (residue → body-only, a safe FN).
const reAttPrevToAndByCombat = /(?:^|[\n.;])\s*prevent all combat damage that would be dealt to and dealt by enchanted creature\s*(?:\.|$)/i;
const reAttPrevToAndByAll = /(?:^|[\n.;])\s*prevent all damage that would be dealt to and dealt by enchanted creature\s*(?:\.|$)/i;
const reAttPrevToCombat = /(?:^|[\n.;])\s*prevent all combat damage that would be dealt to enchanted creature\s*(?:\.|$)/i;
const reAttPrevToAll = /(?:^|[\n.;])\s*prevent all damage that would be dealt to enchanted creature\s*(?:\.|$)/i;
const reAttPrevByCombat = /(?:^|[\n.;])\s*prevent all combat damage that would be dealt by enchanted creature\s*(?:\.|$)/i;
const reAttPrevByAll = /(?:^|[\n.;])\s*prevent all damage that would be dealt by enchanted creature\s*(?:\.|$)/i;
const ATT_PREV_CLAUSE_RE = /^prevent all (?:combat )?damage that would be dealt (?:to(?: and dealt by)?|by) enchanted creature\.?$/i;
// PARALYZE-CLASS attached tap-lock (BLITZ PZ-1 — Waterknot / Bonds of Quicksilver): "Enchanted
// creature doesn't untap during its controller's untap step." Enforced continuously in
// gameState.untapAll (the attachment read); admitted here so the aura gates treat the line as a
// modeled attached static, exactly like the AP-1 walls.
// AN-1: the noun widens to match gameState's RUNTIME matcher (RE_ATTACHED_NO_UNTAP), which already
// admitted "enchanted permanent". The metric was the NARROWER of the two — a documented false negative
// (Ice Over / Coma Veil parked while untapAll would have honored the lock correctly). Widening the metric
// to exactly the runtime's noun set closes the asymmetry in the safe direction: the gates now agree.
const ATT_NO_UNTAP_CLAUSE_RE = /^enchanted (?:creature|permanent|artifact) doesn't untap during its controller's untap step\.?$/i;
/** Does this Aura print the modeled attached tap-lock line? (gameState.untapAll enforces it.) */
export function attachedNoUntapOf(card) {
  const o = String(card?.oracle || card?.oracle_text || "");
  return /(?:^|[\n.;])\s*enchanted (?:creature|permanent) doesn't untap during its controller's untap step\s*(?:\.|$)/i.test(o);
}
/** Single-LINE form of the tap-lock check (UT-1) — for coverage residue walks over oracle lines. */
export function isAttachedNoUntapLine(line) {
  return ATT_NO_UNTAP_CLAUSE_RE.test(String(line || "").trim());
}

/** CAST-LIMIT (BLITZ RL-1) — does this card print the exact symmetric one-spell-per-turn line?
 * Returns 1 (the limit) or null. The legalChoices cantCast gate and the parseStaticAbilities marker
 * both key on this one reader (no drift). */
export function castsPerTurnLimitOf(card) {
  const o = String(card?.oracle || card?.oracle_text || "");
  return /(?:^|[\n.;])\s*each player can't cast more than one spell each turn\s*(?:\.|$)/i.test(o) ? 1 : null;
}

// ── ARTIFACT-ACTIVATION LOCK (BLITZ NR-1 — Null Rod / Stony Silence / Collector Ouphe) ──────────────
/** Does this card print the exact symmetric artifact lockdown line? The parseStaticAbilities marker and
 * every runtime gate key on this one reader (no drift). Raw-oracle regex (the castsPerTurnLimitOf
 * pattern) so the board query below stays cheap enough for the manaSources hot path. */
export function artifactActivationLockOf(card) {
  const o = String(card?.oracle || card?.oracle_text || "");
  return /(?:^|[\n.;])\s*activated abilities of artifacts can't be activated\s*(?:\.|$)/i.test(o);
}
/**
 * Is the artifact-activation lock live on ANY battlefield right now? A LIVE board query (never a stored
 * flag — the lock lifts the moment the carrier leaves), scanning EVERY player's battlefield: the line
 * names "artifacts" with no controller scope, so it is symmetric (CR 109.2 — all artifact permanents on
 * the battlefield, whoever controls them, and whoever controls the carrier). Consumers gate the ACTED-ON
 * permanent with a layer-aware Artifact type read (layers.permanentTypes — an animated artifact creature
 * is still an artifact); this query only answers "is a carrier on the battlefield".
 */
export function artifactActivationsLocked(state) {
  for (const pl of Object.values(state?.players || {})) {
    for (const perm of (pl.battlefield || [])) {
      if (artifactActivationLockOf(perm.card)) return true;
    }
  }
  return false;
}

// ── KISMET (BLITZ KM-1, CR 614.1c — Kismet / Frozen Aether / Loxodon Gatekeeper): "Artifacts,
// creatures, and lands your opponents control enter [the battlefield] tapped." ──────────────────────
// GENERALIZED to a TYPE SET (census slice 45). The line was hard-coded to Kismet's three-type form, which
// left the NARROWER printings of the identical imposition parked: "Creatures your opponents control enter
// tapped" (Imposing Sovereign / Authority of the Consuls / Urabrask the Hidden) and "Artifacts your opponents
// control enter tapped" (Manglehorn / Dauntless Dismantler). Same rule, same chokepoint, smaller type list.
//
// BARE TYPE WORDS ONLY, which is what keeps this safe. A QUALIFIED subject is a different rule and must not
// match, because the qualifier would be silently dropped and the imposition would over-apply:
//   • "creatures and NONBASIC lands …"  (Thalia, Heretic Cathar) — basics must still enter untapped
//   • "SNOW lands …"                    (Reidane) — non-snow lands must still enter untapped
//   • "creatures PLAYED BY your opponents" (Uphill Battle) — a different subject clause entirely
// The alternation admits only artifacts/creatures/lands, so each of those fails closed → body-only.
const RE_OPP_ENTER_TAPPED = /(?:^|[\n.;])\s*((?:artifacts|creatures|lands)(?:,?\s+(?:and\s+)?(?:artifacts|creatures|lands))*) your opponents control enter (?:the battlefield )?tapped\s*(?:\.|$)/i;
const ENTER_TAPPED_TYPE_WORD = { artifacts: "Artifact", creatures: "Creature", lands: "Land" };

/**
 * The TYPE SET an opponents-enter-tapped imposition covers, or null when the card prints none.
 * e.g. Kismet → {Artifact, Creature, Land}; Imposing Sovereign → {Creature}; Manglehorn → {Artifact}.
 */
export function opponentsEnterTappedTypesOf(card) {
  const m = RE_OPP_ENTER_TAPPED.exec(String(card?.oracle || card?.oracle_text || ""));
  if (!m) return null;
  const words = m[1].toLowerCase().match(/artifacts|creatures|lands/g) || [];
  const types = new Set(words.map((w) => ENTER_TAPPED_TYPE_WORD[w]));
  return types.size > 0 ? types : null;
}

/** Does this card print an opponents-enter-tapped imposition at all? (Any width — see the type reader.) */
export function opponentsEnterTappedOf(card) {
  return opponentsEnterTappedTypesOf(card) !== null;
}
/**
 * Does an opposing Kismet-class static force this entering card in TAPPED? Scans every OTHER player's
 * battlefield for the imposition and matches the entering card's type line against the printed
 * artifact/creature/land triple (CR 614.1c — the replacement applies as the permanent enters). ALL
 * entry paths consult this one reader (cast/enter, play-land, reanimate/ramp/detain-return), so the
 * imposition can't be dodged through a side door.
 */
export function impositionEntersTapped(state, card, controller) {
  const tl = String(card?.type || card?.type_line || "");
  if (!/\b(?:Artifact|Creature|Land)\b/i.test(tl)) return false;
  for (const [pid, pl] of Object.entries(state?.players || {})) {
    if (pid === controller) continue; // "your opponents" — the controller's own Kismet never taxes them
    for (const perm of (pl.battlefield || [])) {
      // Match the entering card against THIS imposition's own type set (slice 45). Previously any
      // imposition tapped anything artifact/creature/land, which was correct only because the sole
      // recognized printing happened to cover all three; a creature-only Imposing Sovereign must NOT
      // tap an entering land.
      const types = opponentsEnterTappedTypesOf(perm.card);
      if (!types) continue;
      for (const t of types) {
        if (new RegExp(`\\b${t}\\b`, "i").test(tl)) return true;
      }
    }
  }
  return false;
}
// AURA-OWN-ETB validator (BLITZ PZ-1/LA-1 — injected from coverage, the group-validator pattern:
// this module can't import detectTriggers without a load cycle). When registered, an aura-own
// "When this Aura enters, <effect>" line whose single descriptor routes natively is admitted as
// non-residue in auraResidueClauses — the runtime fires it through the enterPermanent chokepoint.
let _auraOwnEtbValidator = null;
export function registerAuraOwnEtbValidator(fn) { _auraOwnEtbValidator = fn; }
// AU-GRANT+BONUS — the validator for a GRANTED QUOTED ABILITY clause ("Enchanted creature has \"…\"").
// coverage.js registers it (it owns the grant gates); staticAbilityParser cannot import coverage (cycle), so
// this is the same registry seam _auraOwnEtbValidator / _auraOwnActivatedValidator already use.
let _auraGrantedAbilityValidator = null;
export function registerAuraGrantedAbilityValidator(fn) { _auraGrantedAbilityValidator = fn; }
// ⭐ AU-TRIG+BONUS — the validator for the AURA'S OWN NON-ETB TRIGGER ("When enchanted creature dies, …",
// "At the beginning of your upkeep, …"). The sibling of _auraOwnEtbValidator above, registered from
// coverage.js for the same reason: coverage owns the trigger-routing gates and this module cannot import it.
//
// ⛔ WHY A VALIDATOR AND NOT A WIDER REGEX. AURA_OWN_MODELED_TRIGGER_RE hard-codes exactly TWO printed
// shapes, so every other aura-own trigger poisoned the bonus parse and dropped the Aura's ENTIRE static
// bonus — measured, not theorised: Elephant Guide's host reads 2/2 where a pure-bonus control reads 5/5.
// Widening the regex would re-state which triggers route natively, i.e. duplicate the gate; asking the gate
// means the two cannot drift.
let _auraOwnTriggerValidator = null;
export function registerAuraOwnTriggerValidator(fn) { _auraOwnTriggerValidator = fn; }
// AURA-OWN-ACTIVATED validator (BLITZ AF-1 — the same injection pattern): whether a "{cost}: <effect>"
// line PRINTED ON THE AURA is a fully-modeled ability whose program is exclusively enchanted-referent
// atoms (tap/untap/pump target:"enchanted" — Armor of Faith's "{W}: Enchanted creature gets +0/+3 until
// end of turn"). Registered from coverage; unregistered → the line stays residue (a safe FN).
let _auraOwnActivatedValidator = null;
export function registerAuraOwnActivatedValidator(fn) { _auraOwnActivatedValidator = fn; }
/** The prevention walls one AURA CARD prints: { to: "all"|"combat"|null, by: "all"|"combat"|null }. */
export function attachedPreventionOf(card) {
  const o = String(card?.oracle || card?.oracle_text || "");
  let to = null, by = null;
  if (reAttPrevToAndByAll.test(o)) { to = "all"; by = "all"; }
  else if (reAttPrevToAndByCombat.test(o)) { to = "combat"; by = "combat"; }
  if (!to && reAttPrevToAll.test(o)) to = "all";
  if (!to && reAttPrevToCombat.test(o)) to = "combat";
  if (!by && reAttPrevByAll.test(o)) by = "all";
  if (!by && reAttPrevByCombat.test(o)) by = "combat";
  return { to, by };
}

/**
 * Is this Aura one the engine can play END-TO-END natively? ALL of (no silent gaps):
 *   1. type line is an Aura,
 *   2. it enchants EXACTLY "creature" (no controller/zone restriction, not a non-creature),
 *   3. `parseAuraBonus` yields a non-empty all-or-nothing P/T + keyword bonus — OR the card prints a
 *      modeled PREVENTION wall (AP-1: attachedPreventionOf; enforced at both damage paths), AND
 *   4. there is NO residual clause (no triggered/activated/controller-static text we'd drop).
 * When any fails, the Aura is NOT native — the cast path routes it to the Arbiter seam
 * rather than entering a do-nothing permanent. Single source of truth for the runtime
 * (legalChoices/actionDispatcher) AND the coverage metric, so they can't drift. Pure.
 */
export function isNativeAura(card) {
  if (!isAuraCard(card)) return false;
  if (!auraEnchantHostSpec(card)) return false;             // a subject the cast lane can enumerate
  const prev = attachedPreventionOf(card);
  // The MODELED-HALF gate: an aura must carry at least one modeled payload — a layer bonus, an AP-1 wall,
  // the PZ-1 lock, or (SL-1) a modeled AURA-OWN TRIGGER (Spirit Link / Vampiric Link — a trigger-ONLY aura
  // whose whole body is the admitted own-watcher is fully modeled: enter + attach + the trigger fires).
  if (!parseAuraBonus(card).length && !prev.to && !prev.by && !attachedNoUntapOf(card)
    && !auraHasModeledOwnTrigger(card) && !auraGrantsControl(card)) return false;
  if (!auraTouchClausesAllModeled(card)) return false;       // PZ-1 hardening — see below
  return auraResidueClauses(card).length === 0;
}

/** CONTROL AURA — does this Aura print the modeled "You control enchanted creature." payload? */
export function auraGrantsControl(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  return abilityClauses(oracle).some((cl) => AURA_CONTROL_CLAUSE_RE.test(cl.toLowerCase().trim()));
}

/** SL-1 — does the aura print at least one line the modeled own-trigger allowlist admits? */
function auraHasModeledOwnTrigger(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  for (const clause of abilityClauses(oracle)) {
    if (isModeledAuraOwnTrigger(clause.toLowerCase().trim())) return true;
  }
  return false;
}

/**
 * PZ-1 HARDENING (the Bind-the-Monster catch): every clause that "touches" the enchanted creature —
 * which the residue walk SKIPS as presumed-bonus text — must actually be one of the explicitly-modeled
 * shapes or PARSE as an attached bonus clause. Without this, a pronoun-referencing follow-up sentence
 * ("It deals damage to you equal to its power" — glued to the ETB's descriptor at runtime, routing the
 * whole trigger LOW) would slip the walk on the touch heuristic while the runtime Arbiters the trigger:
 * the exact metric-over-claims-runtime FP the CREED forbids. The pre-widening gate was implicitly
 * backstopped by parseAuraBonus nulling on such a clause; the wall/no-untap bypass removed that
 * backstop, so the strictness is restored here explicitly.
 */
// CONTROL AURA (CR 613.1b) — "You control enchanted creature." Mind Control / Control Magic / Treachery.
// ENFORCED at runtime by controlAura.js, hung off the two verified chokepoints (attachPermanent moves the
// host; detachPermanentFromAll sends it home by every route the Aura can leave). Admitted here so the
// classifier credits a card the engine actually plays — never the other way round.
// ⛔ EXACT LINE ONLY: a rider, a duration ("until end of turn"), or a different subject leaves it
// unrecognised → the card keeps its Arbiter routing (safe FN), because none of those are modelled.
const AURA_CONTROL_CLAUSE_RE = /^you control enchanted creature\.?$/i;

function auraTouchClausesAllModeled(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  for (const clause of abilityClauses(oracle)) {
    const c = clause.toLowerCase().trim();
    if (/^enchant\b/.test(c)) continue;
    if (/^(?:when|whenever|at)\b/.test(c)) continue;          // trigger lines gate in auraResidueClauses
    if (ATT_PREV_CLAUSE_RE.test(c)) continue;                 // AP-1 wall — enforced at the damage paths
    if (ATT_NO_UNTAP_CLAUSE_RE.test(c)) continue;             // PZ-1 tap-lock — enforced in untapAll
    if (isTotemArmorClause(c)) continue;                      // totem armor — enforced at destruction
    if (AURA_CONTROL_CLAUSE_RE.test(c)) continue;             // CONTROL AURA — enforced in controlAura.js
    // AF-1: a validator-approved aura-own activated line — enumerated on the Aura, resolved on the host.
    if (/^[^:\n]+:/.test(c)      // any cost before the colon — the validator gates what it actually is
      && _auraOwnActivatedValidator && _auraOwnActivatedValidator(clause)) continue;
    const noun = attachedBodyNoun(card, "enchanted");          // AN-1 — the host noun this Aura's body uses
    if (!touchesAttachedCreature(c, "enchanted", noun)) continue; // non-touch residue → auraResidueClauses catches it
    if (!(c.startsWith(`enchanted ${noun}`) && parseAttachedClause(c, "enchanted", noun))) return false;
  }
  return true;
}

/**
 * The MODELED enchant-subject restrictions for a creature Aura, or null if the subject isn't one the engine
 * targets natively. Exactly two modeled subjects (CR 702.5):
 *   "creature"             → [] (any creature on any battlefield, no controller restriction)
 *   "creature you control" → [{ kind:"controller", who:"you" }] (only the caster's own creatures — the aura
 *                            targeting reuses the proven creatureSatisfiesRestrictions "you" filter, so the
 *                            aura can NEVER attach to an opponent's creature — CR 303.4a + CREED FP-forbidden).
 * Any other subject (a zone/type restriction, "creature an opponent controls", a color/subtype qualifier) →
 * null → the Aura is not native (routes to the Arbiter). Single source of truth shared by isNativeAura (both
 * runtime + metric) AND legalChoices' aura target enumeration, so nativeness and the legal-target set can't
 * drift. Pure.
 */
export function auraEnchantRestrictions(card) {
  // ⭐ THE CREATURE-ONLY ACCESSOR, and it must STAY creature-only. Its two remaining callers —
  // grantAuraCastHostType (which turns a non-null return into `{ host: "creature" }`) and coverage's
  // qualified-subject branch — both mean "this is a CREATURE host whose filter rides the restriction
  // list". Widening this to the non-creature subjects auraEnchantHostSpec now expresses would have made
  // an "Enchant artifact" Aura enumerate CREATURES in the grant lane: the cardinal CREED sin, reached by
  // a one-line convenience. The host spec below is the widened source; this stays the narrow view of it.
  const spec = auraEnchantHostSpec(card);
  return spec && spec.targetType === "creature" ? spec.restrictions : null;
}

/**
 * THE HOST SPEC (ES-1, CR 303.4a) — `{ targetType, restrictions }` for an Aura whose "Enchant <subject>"
 * line the engine can enumerate natively, or null. THE SINGLE SOURCE for all five seams that must agree:
 *   ① isNativeAura's gate           ② legalChoices' cast enumeration    ③ the AURA_ETB payload's hostType
 *   ④ the resolver's CR 608.2b re-check                                 ⑤ sba.js's CR 704.5n fall-off sweep
 * Any one of them disagreeing is a card credited native that the engine cannot actually attach — or worse,
 * one that attaches and is then killed by the sweep on the next SBA pass. Both were live before this slice
 * (④ defaulted to /Creature/, so an "Enchant artifact" cast FIZZLED at resolution; ⑤ read "Enchant creature
 * or Vehicle" as bare "creature" and would have fallen the Aura off an uncrewed Vehicle instantly).
 *
 * ⛔ THE NON-CREATURE SUBJECTS ARE TYPE UNIONS, WHICH IS WHY THEY WAITED. The restriction list is ANDed and
 * says nothing about TYPE, so "artifact or creature" cannot be expressed against a fixed targetType —
 * it needs a targetType of its own. Each one below maps onto a PERMANENT_PREDICATES entry the removal
 * lanes already enumerate with, so this is wiring rather than new targeting machinery.
 */
export function auraEnchantHostSpec(card) {
  const restrictions = creatureEnchantRestrictions(card);
  if (restrictions) return { targetType: "creature", restrictions };
  const subject = auraEnchantSubject(card);
  // ⭐ NON-CREATURE HOSTS (2026-08-05). The BODY of each of these cards already parses: attachedBodyNoun
  // (AN-1) resolved "enchanted permanent" / "enchanted artifact" a slice ago, and every effect they print
  // — the no-untap lock (untapAll), the pacifism pair + the Arrest activation lock (legalChoices +
  // manaModel, both keyed on permanentHasKeyword, which is type-agnostic), the shroud grant — is enforced
  // on ANY permanent, not just creatures. The subject line was the whole blocker.
  //   "artifact"            → Stasis Cocoon, Relic Ward
  //   "artifact or creature"→ Ice Over, Coma Veil, Secure Detention, Petrify
  //   "creature or vehicle" → Aether Meltdown, Mists of Littjara
  if (subject === "artifact") return { targetType: "artifact", restrictions: [] };
  if (subject === "artifact or creature") return { targetType: "creatureOrArtifact", restrictions: [] };
  if (subject === "creature or vehicle") return { targetType: "creatureOrVehicle", restrictions: [] };
  // ⭐ THE WIDER UNIONS (ES-2, same day, same machinery). All three print the IDENTICAL body to Petrify —
  // "Enchanted permanent can't attack or block, and its activated abilities can't be activated" — so the
  // subject really is the only difference between them and a card that already works. Each maps onto a
  // targetType enumerateTargets ALREADY offers (nonlandPermanent and creatureOrPlaneswalker are shipped
  // predicates; the triple union is one new type-line OR beside its siblings).
  //   "nonland permanent"                  → Suppression Bonds
  //   "creature or planeswalker"           → Nahiri's Binding
  //   "artifact, creature, or planeswalker"→ Planar Disruption
  if (subject === "nonland permanent") return { targetType: "nonlandPermanent", restrictions: [] };
  if (subject === "creature or planeswalker") return { targetType: "creatureOrPlaneswalker", restrictions: [] };
  if (subject === "artifact, creature, or planeswalker") return { targetType: "artifactCreatureOrPlaneswalker", restrictions: [] };
  // ⛔ STILL NULL, AND EACH FOR ITS OWN REASON — these are NOT wiring and must not be added as if they were:
  //   · "red or green creature" (Controlled Instincts, Encase in Ice) needs a DISJUNCTIVE restriction kind;
  //     restrictions are ANDed, so listing two colors would demand a creature be both. +2 waiting.
  //   · "creature with another Aura attached to it" (Daybreak Coronet) and "modified creature" (Lion Umbra)
  //     need new board-reading predicates. +1 each.
  return null;
}

/** The CREATURE-subject half of the host spec (every subject that yields targetType "creature"). */
function creatureEnchantRestrictions(card) {
  const subject = auraEnchantSubject(card);
  if (subject === "creature") return [];
  if (subject === "creature you control") return [{ kind: "controller", who: "you" }];
  // QUALIFIED SUBJECTS (CR 303.4a) — three more restrictions, admitted because each maps EXACTLY onto a
  // restriction creatureSatisfiesRestrictions already enforces, layer-aware and fail-closed. No new
  // targeting machinery: this is wiring, which is why it can't introduce a wrongly-legal target.
  //   "tapped creature"           → Entangling Vines, Glimmerdust Nap
  //   "creature without flying"   → Roots, Trapped in the Tower
  //   "creature with power N or less" → Runner's Bane
  //
  // FALL-OFF, stated plainly: these are enforced at CAST. The CR 704.5n sweep in sba.js checks only
  // "Enchant creature|land|permanent" and treats any qualified subject as host-existence-only, so an Aura
  // does NOT fall off if its host later stops matching (a pumped creature keeps Runner's Bane). That is the
  // module's EXISTING, documented policy — "a missed fall-off is the safe direction; a wrong kill is the
  // forbidden one" — and it already applies to the shipped "creature you control" subject. Followed here
  // rather than reversed: widening the sweep would trade a safe miss for the forbidden failure mode.
  //
  // Everything else still returns null → the Aura is NOT native (Arbiter): type unions ("creature or
  // vehicle") can't be expressed against a fixed targetType:"creature", and the exotic subjects
  // ("modified creature", "creature with another Aura attached to it") have no predicate at all.
  // (Positive COLOUR subjects were once listed here too; they gained a restriction kind — see below.)
  if (subject === "tapped creature") return [{ kind: "tapped", value: true }];
  if (subject === "creature without flying") return [{ kind: "hasKeyword", keyword: "flying", negate: true }];
  const pw = subject && subject.match(/^creature with power (\d+) or less$/);
  if (pw) return [{ kind: "power", op: "<=", value: parseInt(pw[1], 10) }];
  // ⭐ THREE MORE ON THE SAME TERMS (2026-08-03) — each maps EXACTLY onto a restriction
  // creatureSatisfiesRestrictions ALREADY enforces, so this stays wiring and cannot mint a wrongly-legal
  // target. Measured rather than assumed: a substitution probe over every non-native Aura (swap the
  // Enchant line for "Enchant creature", keep every other line byte-identical) found 16 cards blocked
  // SOLELY by their subject — not the 120 that merely carry a qualified one, which is why the count came
  // from the probe and not from grouping.
  //   "nonblack creature"                  → colorNeg   (Armor of Thorns)
  //   "green creature"                     → color      (Wurmweaver Coil)
  //   "creature with mana value N or less" → manaValue  (Threads of Disloyalty)
  // ⚠️ THE PARAGRAPH BELOW USED TO SAY POSITIVE COLOUR SUBJECTS HAVE NO RESTRICTION KIND. That was true
  // when it was written and is not true now: creatureRestrictions grew a layer-aware `color` branch
  // (CR 105.2 — it reads permanentColors, so a creature turned green IS a legal host and a printed-green
  // one turned white is not). Corrected in place rather than left to mislead the next reader.
  const nonColor = subject && subject.match(/^non(white|blue|black|red|green) creature$/);
  if (nonColor) return [{ kind: "colorNeg", color: COLOR_WORDS[nonColor[1]] }];
  const posColor = subject && subject.match(/^(white|blue|black|red|green) creature$/);
  if (posColor) return [{ kind: "color", color: COLOR_WORDS[posColor[1]] }];
  const mv = subject && subject.match(/^creature with mana value (\d+) or less$/);
  if (mv) return [{ kind: "manaValue", op: "<=", value: parseInt(mv[1], 10) }];
  // Everything else still returns null here → either a NON-creature targetType in auraEnchantHostSpec
  // above, or the Arbiter. A colour DISJUNCTION ("red or green creature" — Controlled Instincts, Encase
  // in Ice) is deliberately NOT here: restrictions are ANDed, so it needs a new disjunctive kind rather
  // than wiring, and that slice still hasn't been done.
  // ⚠️ THE LINE THAT USED TO END THIS COMMENT SAID TYPE UNIONS WERE "A BIGGER JOB, BANKED". They were,
  // and the job is done — but NOT by relaxing anything here. A union is not a creature restriction, so it
  // could never be expressed in this function; it needed a targetType, which is why it lives one level up.
  return null;
}

// ─── AURA-LAND-MANA-BOOST ───────────────────────────────────────────────────────
//
// A second, SEPARATE native gate for land-enchant Auras whose ONLY effect is a mana boost
// (Wild Growth / Overgrowth / Fertile Ground). These enchant a LAND, not a creature, so they
// fall outside isNativeAura (which requires the "creature" subject + a P/T/keyword bonus). The
// boost is a TRIGGERED MANA ABILITY (CR 605.1b) — it resolves INLINE when the land taps for mana,
// never on the stack — so the runtime hooks the MANA-PRODUCTION path (manaModel.landAuraManaBonus),
// NOT triggers.js. This gate + parseAuraLandManaBonus are the single source of truth shared by the
// runtime (legalChoices/actionDispatcher/manaModel) and the coverage metric, so they can't drift.
//
// The grammar is deliberately NARROW (a self-contained micro-parser so this module stays a leaf —
// it must NOT import manaModel): exactly the verified template
//   "Whenever enchanted land is tapped for mana, its controller adds an additional <X>"
// where <X> is fixed colored pips ({G}, {G}{G}, {C}…) or "one mana of any color". Anything else —
// "two mana in any combination of colors" (Market Festival), "of the chosen color" (Utopia Sprawl /
// Shimmerwilds), "for each …" (Elvish Guidance), a subtype-restricted "enchanted Forest" — returns
// null → the Aura stays NON-native (a clean false-negative, never a fabricated/partial boost).

const MANA_AURA_COLOR_LETTERS = new Set(["W", "U", "B", "R", "G", "C"]);

/**
 * The mana an "Enchant land" Aura adds WHEN THE ENCHANTED LAND TAPS FOR MANA, as
 * `{ colors: string[], amount: number }`, or null if the Aura isn't a (modeled) land mana boost.
 *   "…adds an additional {G}"                    → { colors: ["G"], amount: 1 }
 *   "…adds an additional {G}{G}"                 → { colors: ["G"], amount: 2 }  (same color, concat)
 *   "…adds an additional one mana of any color"  → { colors: ["W","U","B","R","G"], amount: 1 }
 * `colors` is the SET of colors the bonus can be; `amount` is how many of ONE chosen color it adds
 * (the any-color form lets the controller choose at tap time — modeled in manaModel). Pure; anchored
 * whole-clause. NOTE: only the bare-"land" enchant subject flows native (manaAuraEnchantSubject);
 * this fn parses the boost clause regardless of subject so a caller can inspect it.
 */
export function parseAuraLandManaBonus(card) {
  if (!isAuraCard(card)) return null;
  const oracle = String(card?.oracle || card?.oracle_text || "");
  for (const clause of abilityClauses(oracle)) {
    const m = clause.trim().toLowerCase().match(
      /^whenever enchanted (?:land|forest) is tapped for mana, its controller adds an additional (.+)$/,
    );
    if (!m) continue;
    const tail = m[1].trim();
    // Any-color form (fixed amount 1). "one mana of any color" only — "X mana", "two mana in any
    // combination" fall through to null.
    if (/^one mana of any color$/.test(tail)) {
      return { colors: ["W", "U", "B", "R", "G"], amount: 1 };
    }
    // CHOSEN-COLOR form (Utopia Sprawl) — "one mana of the chosen color". The color is fixed at cast
    // time by the Aura's "As this Aura enters, choose a color" line (CR 614.12b), stored DURABLY on the
    // Aura permanent as `chosenColor` (resolvers.enterPermanent). This static parser can't know the
    // runtime pick, so it returns a MARKER (`chosenColor:true`, no fabricated color) that the mana-read
    // site (manaModel.landAuraManaBonus) resolves against the attached Aura's stored `chosenColor`. The
    // gate (isNativeManaAura) separately requires that as-enters choice line, so this tail only ever
    // flows native on a card that actually stamps the color — never a fabricated boost color.
    if (/^one mana of the chosen color$/.test(tail)) {
      return { chosenColor: true, amount: 1 };
    }
    // Fixed colored/colorless pips ("{g}", "{g}{g}", "{c}"). The clause must be EXACTLY the pip run —
    // any extra word ("two mana…", "{g} for each…") leaves residue → null.
    const pipOnly = tail.replace(/\s+/g, "");
    if (/^(?:\{[wubrgc]\})+$/.test(pipOnly)) {
      const symbols = [...pipOnly.matchAll(/\{([wubrgc])\}/g)].map((x) => x[1].toUpperCase());
      const unique = [...new Set(symbols)];
      // A multi-color fixed run ("{G}{U}") isn't this slice's single-chosen-color model → leave non-native.
      if (unique.length === 1 && unique.every((c) => MANA_AURA_COLOR_LETTERS.has(c))) {
        return { colors: unique, amount: symbols.length };
      }
      return null;
    }
    return null; // an unmodeled boost tail (combination/for-each) — non-native
  }
  return null;
}

/**
 * Clauses on a land-enchant mana Aura that are NEITHER the "Enchant …" line NOR the modeled
 * "tapped for mana" boost line. A non-empty residue means the Aura carries something we DON'T model
 * (an ETB trigger — Verdant Haven; a sac ability — Wolfwillow Haven; an extra static on the land —
 * Trace of Abundance "has shroud"), so isNativeManaAura must reject it (all-or-nothing, safe FN).
 */
function manaAuraResidueClauses(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  const out = [];
  for (const clause of abilityClauses(oracle)) {
    const c = clause.toLowerCase().trim();
    if (/^enchant\b/.test(c)) continue;                                   // the Enchant keyword line
    if (/^whenever enchanted (?:land|forest) is tapped for mana,/.test(c)) continue; // the modeled boost line
    if (AURA_CHOOSE_COLOR_ETB_RE.test(c)) continue;                       // CHOSEN-COLOR: the modeled cast-time color choice (Utopia Sprawl)
    // LA-2 (Verdant Haven): a validator-approved AURA-OWN ETB line ("When this Aura enters, you gain 2
    // life") is modeled end-to-end — an Aura enters through the same enterPermanent chokepoint every
    // permanent uses (LA-1's runtime proof, landAuraEtbRider.test.js), entirely independent of the
    // mana-boost read site. Same validator gating as the mana-GRANT frame one lane over
    // (isNativeManaGrantAuraWithEtb): an UNMODELED/unroutable ETB is not vouched for and stays residue
    // → the card stays non-native (CREED; Wolfwillow's sac line and Trace's "has shroud" never match).
    if (_auraOwnEtbValidator && _auraOwnEtbValidator(c)) continue;
    out.push(clause);
  }
  return out;
}

/**
 * Is this a land-enchant Aura the engine plays END-TO-END natively as a mana boost? ALL of:
 *   1. type line is an Aura,
 *   2. it enchants EXACTLY "land" (bare) OR — CHOSEN-COLOR (Utopia Sprawl) — the "Forest" basic-land
 *      SUBTYPE, which the runtime honors by offering only the caster's OWN Forests as targets and
 *      attaching there (the boost only ever rides a Forest, faithful to the "enchant Forest" restriction),
 *   3. `parseAuraLandManaBonus` yields a modeled boost (fixed pips / any-color / chosen-color marker), AND
 *   4. there is NO residual clause. For the chosen-color form the "As this Aura enters, choose a color"
 *      line is MODELED (auraChoosesColorOnEnter — resolvers.enterPermanent auto-picks + stamps the color),
 *      so it's exempt from residue; any OTHER extra clause (Shimmerwilds Growth's "Enchanted land is the
 *      chosen color" color-changing static) survives as residue → the card stays non-native (safe FN).
 * The chosen-color boost is ONLY native when the card actually carries the color-choice line — otherwise
 * the marker would resolve to no stamped color, so the gate requires it (never a fabricated boost color).
 * Separate from isNativeAura (the creature path) — the creature gate is left BYTE-IDENTICAL. Single
 * source of truth for runtime + metric. Pure.
 */
export function isNativeManaAura(card) {
  if (!isAuraCard(card)) return false;
  const subject = auraEnchantSubject(card);
  const bonus = parseAuraLandManaBonus(card);
  if (!bonus) return false;
  if (subject === "land") {
    // Bare "Enchant land" (Wild Growth / Overgrowth / Fertile Ground) — a fixed/any-color boost only.
    // A chosen-color boost on a bare-land Aura is NOT this slice (no such printed card; would need the
    // color-choice line handled too) → non-native.
    if (bonus.chosenColor) return false;
    return manaAuraResidueClauses(card).length === 0;
  }
  if (subject === "forest" && bonus.chosenColor) {
    // CHOSEN-COLOR (Utopia Sprawl): "Enchant Forest" + the as-enters color choice + the chosen-color boost.
    if (!auraChoosesColorOnEnter(card)) return false; // the boost color must be stamped at cast — no choice line, no native
    return manaAuraResidueClauses(card).length === 0;
  }
  return false;
}

// ─── GLOBAL TAP-FOR-MANA AUGMENT (CR 605.1b) ─────────────────────────────────────
//
// A PERMANENT (not an Aura) with the controller-scoped triggered mana ability
//   "Whenever you tap a <land|creature> for mana, add [an additional] <fixed single-color pips>"
// (Groundchuck & Dirtbag "tap a land … add {G}"; the mana clause of Leyline of Abundance / Badgermole
// Cub "tap a creature … add an additional {G}"). Mechanically this is the SAME inline triggered-mana
// boost as the land-enchant Aura (parseAuraLandManaBonus) — it resolves alongside the source's own
// mana, CR 605.1b — except the boost is sourced by a SEPARATE permanent the controller owns and rides
// on EVERY land/creature THAT CONTROLLER taps, not just one attached land. The runtime hooks the
// mana-production path (manaModel.globalTapManaAugment), NOT triggers.js, exactly like the Aura boost.
//
// Grammar is deliberately NARROW (a self-contained leaf parser — no manaModel import):
//   • subject is bare "a land" OR bare "a creature" (a subtype-gated "a Forest"/"a Swamp" — Nissa,
//     Nirkana Revenant — is NOT this form: the tap site can't faithfully check the tapped land's
//     subtype here, so those return null → the card stays non-native, a clean false-negative);
//   • the boost is FIXED single-color pips ({G}, {G}{G}) — "one mana of any type that <perm> produced"
//     (the doubler form — Mirari's Wake) and "any color" (a choice) are NOT this slice → null;
//   • "add" and "add an additional" are both accepted (the additional vs. replace wording is identical
//     mechanically — both ADD the boost mana on top of the source's own production, CR 605.1b).
const TAP_AUGMENT_COLOR_LETTERS = new Set(["W", "U", "B", "R", "G", "C"]);

/**
 * The fixed-color mana a "Whenever you tap a <land|creature> for mana, add …" permanent adds when its
 * controller taps a matching source, as `{ subject: "land"|"creature", colors: string[], amount: number }`,
 * or null. `colors` is a single-element set (the chosen color is fixed); `amount` is how many of that
 * color the boost adds per qualifying tap. Pure; anchored whole-clause (reminder-stripped, trailing
 * period removed by abilityClauses). Parses the clause regardless of the rest of the card so a caller
 * (coverage) can inspect it; the all-or-nothing residue gate lives in isGlobalTapManaAugment.
 */
export function parseGlobalTapManaAugment(card) {
  const slot = _cardSlot(card);
  if (slot && "tapAugment" in slot) return slot.tapAugment;
  const result = parseGlobalTapManaAugmentImpl(card);
  if (slot) slot.tapAugment = result;
  return result;
}

function parseGlobalTapManaAugmentImpl(card) {
  // An Aura describes effects on its enchanted permanent, not a self-controlled "you tap" augment, so it's
  // never this card (its boost is parseAuraLandManaBonus). Excluding it keeps the two parsers disjoint.
  if (isAuraCard(card)) return null;
  const oracle = String(card?.oracle || card?.oracle_text || "");
  for (const clause of abilityClauses(oracle)) {
    // MANA FLARE (BLITZ MF-1, CR 605.1b) — the ALL-PLAYERS, LANDS-ONLY, SAME-TYPE additive cousin: "Whenever
    // a player taps a land for mana, that player adds one mana of any type that land produced." (Mana Flare /
    // Heartbeat of Spring / Zhur-Taa Ancient / Dictate of Karametra — the exact template). The extra mana's
    // TYPE is the type the land produced, expressed as sameAsProduced: the consumers credit +1 of the PRIMARY
    // chosen color of that very tap (planPayment's sameAsProduced component pick; actionsTapForMana's
    // per-action color), so a dual/any-color land never mints an off-type pip (the FP direction — e.g. W+U
    // off one Adarkar Wastes tap is impossible). allPlayers: the TAPPING player benefits regardless of who
    // controls the carrier (symmetric, "a player … that player" — manaModel scans every battlefield). Anchored
    // whole-clause: Overabundance's damage rider, Barbflare Gremlin's "if this creature is tapped" condition,
    // and Vorinclex's you-scoped line all leave residue → no match → the fixed-pip branch below also rejects
    // them → null → body-only (a SAFE FN, CREED).
    if (/^whenever a player taps a land for mana, that player adds one mana of any type that land produced$/.test(clause.trim().toLowerCase())) {
      return { subject: "land", allPlayers: true, sameAsProduced: true, amount: 1 };
    }
    // NONLAND MANA DOUBLER (BLITZ MD-1, CR 605.1b) — the CONTROLLER-scoped, NONLAND-permanent, SAME-TYPE
    // additive cousin: "Whenever you tap a nonland permanent for mana, add one mana of any type that
    // permanent produced." (Kinnan, Bonder Prodigy — the sole carrier of this exact template). The extra
    // mana's TYPE (CR 106.1b) is the type the tapped nonland permanent produced, so the consumers credit +1
    // of the PRIMARY chosen color of that very tap (the SAME sameAsProduced pathway MF-1 built for lands —
    // reused UNCHANGED), never an off-type pip. Controller-scoped ("you tap", NOT "a player") → allPlayers
    // is absent (falsy), so globalTapManaAugment's controller gate keeps it on the tapper's own carriers. The
    // subject "nonland-permanent" gates the runtime to a NON-land tap — a LAND tapped under this doubler adds
    // NOTHING (the whole point of the subject: Kinnan doubles a mana ROCK / mana DORK, never a Command Tower).
    // Anchored whole-clause + $-anchored, so any variant with a rider leaves residue → the fixed-pip branch
    // below rejects it too → null → body-only (a SAFE FN, CREED).
    if (/^whenever you tap a nonland permanent for mana, add one mana of any type that permanent produced$/.test(clause.trim().toLowerCase())) {
      return { subject: "nonland-permanent", sameAsProduced: true, amount: 1 };
    }
    // ⭐ THE MISSING CROSS — CONTROLLER-scoped, LANDS-ONLY, SAME-TYPE (Mirari's Wake / Zendikar Resurgent /
    // Vorinclex): "Whenever you tap a land for mana, add one mana of any type that land produced." Every
    // PIECE of this was already built — MF-1 above models allPlayers × land × sameAsProduced, MD-1 models
    // controller × nonland × sameAsProduced, and globalTapManaAugment's runtime handles all three axes
    // independently (the controller gate, the land subject test, the sameAsProduced credit). What was
    // missing was only this CORNER of the grid, which is why the comment above still lists Mirari's Wake as
    // out of scope: the doubler form WAS out of scope when that comment was written, and MF-1/MD-1 brought
    // it in without anyone coming back to close the last cell. A missing cross, not a missing mechanic.
    // Anchored whole-clause on the same terms as its two siblings — Vorinclex's second line (an opponent's
    // land not untapping) is a DIFFERENT clause and survives as residue, so that card stays body-only.
    if (/^whenever you tap a land for mana, add one mana of any type that land produced$/.test(clause.trim().toLowerCase())) {
      return { subject: "land", sameAsProduced: true, amount: 1 };
    }
    // The optional " while you're the monarch" condition rides between "for mana" and ", add" (Regal
    // Behemoth — the only monarch-gated tap-augment in the corpus). Captured as condition:"monarch"; the
    // runtime (globalTapManaAugment) adds the extra mana ONLY while `state.monarchId === playerId`.
    // ⭐ THE BASIC-LAND SUBTYPES ARE IN NOW (Crypt Ghast #525, Nirkana Revenant #2848, Nissa #1604), and the
    // note above that excluded them — "the tap site can't faithfully check the tapped land's subtype here" —
    // was simply WRONG about the runtime. globalTapManaAugment receives the tapped source PERMANENT and
    // already reads its type line for the land/creature/nonland gates; a subtype word costs one more test on
    // the same string. The refusal was a stale guess about a sibling function, not a rules problem, which is
    // exactly the kind of banked "can't" that stops being true and never gets re-read.
    const m = clause.trim().toLowerCase().match(
      /^whenever you tap a (land|creature|forest|island|swamp|mountain|plains) for mana( while you're the monarch)?, add (?:an additional )?(.+)$/,
    );
    if (!m) continue;
    const subject = m[1];
    const condition = m[2] ? "monarch" : null;
    const spec = m[3].trim();
    // ANY-COLOR: "one mana of any color" → all five colors, amount 1 (the auto-pay planner picks the pip it
    // needs; the mana model already produces this shape for a printed "Add one mana of any color").
    if (/^one mana of any color$/.test(spec)) {
      return { subject, colors: ["W", "U", "B", "R", "G"], amount: 1, ...(condition ? { condition } : {}) };
    }
    const pipOnly = spec.replace(/\s+/g, "");
    // Fixed colored/colorless pips ONLY ("{g}", "{g}{g}"). Any OTHER extra word ("one mana of any type that
    // land produced", "{g} for each …") leaves residue → null (non-native).
    if (!/^(?:\{[wubrgc]\})+$/.test(pipOnly)) return null;
    const symbols = [...pipOnly.matchAll(/\{([wubrgc])\}/g)].map((x) => x[1].toUpperCase());
    const unique = [...new Set(symbols)];
    // A multi-color fixed run ("{G}{U}") isn't this slice's single-color boost model → leave non-native.
    if (unique.length !== 1 || !unique.every((c) => TAP_AUGMENT_COLOR_LETTERS.has(c))) return null;
    return { subject, colors: unique, amount: symbols.length, ...(condition ? { condition } : {}) };
  }
  return null;
}

/**
 * The boost clause stripped from a card's oracle, leaving the residual text (the keyword body, etc.) for
 * the caller (coverage) to validate keyword-only via its own isKeywordOnly. Removing the WHOLE matched
 * line — "Whenever you tap a <land|creature> for mana, add …" — so a card whose only other text is a
 * modeled keyword (Groundchuck's "Trample") reduces to keyword-only and flips native, while any non-
 * keyword rider survives the strip and keeps the card non-native (all-or-nothing, CREED). Returns the
 * original oracle unchanged when the card isn't an augment (no match). Pure leaf.
 */
export function stripGlobalTapManaAugment(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  if (!parseGlobalTapManaAugment(card)) return oracle;
  return oracle
    .split(/\n+/)
    // ⚠️ THIS SUBJECT LIST MUST TRACK parseGlobalTapManaAugment'S. It is not cosmetic: the coverage tier
    // re-classifies the STRIPPED card, so a subject the parser matches but the strip doesn't leaves the line
    // in place, the stripped card parses as an augment again, and classifyCard recurses until the stack
    // blows. Adding the basic-land subtypes to the parser without adding them here did exactly that —
    // RangeError on the first Crypt Ghast, which is the good failure mode; a silent one would have been a
    // hang. Also why the you-scoped LAND doubler below needs its own $-anchored line.
    .filter((line) => !/^\s*whenever you tap a (?:land|creature|forest|island|swamp|mountain|plains) for mana(?: while you're the monarch)?, add /i.test(line)
      // The you-scoped land doubler (Mirari's Wake / Zendikar Resurgent): the subject-list regex above DOES
      // match its lead, so it is already stripped — this comment marks it deliberate, not incidental.
      // MANA FLARE (MF-1): the all-players line strips ONLY in its exact rider-free form ($-anchored), so
      // Overabundance's "…, and this enchantment deals 1 damage to the player." survives as residue (its
      // parse is null anyway — belt on top of the parse gate).
      && !/^\s*whenever a player taps a land for mana, that player adds one mana of any type that land produced\.?\s*$/i.test(line)
      // NONLAND MANA DOUBLER (MD-1): Kinnan's controller-scoped nonland doubler line, $-anchored so only its
      // exact rider-free form strips (the "you tap a (?:land|creature)" regex above never matches "nonland
      // permanent"). Kinnan's OTHER line — the {5}{G}{U} look-at-top-five activated ability — survives → not
      // keyword-only → the card stays body-only (a SAFE FN; Kinnan parks on its unmodeled activated ability).
      && !/^\s*whenever you tap a nonland permanent for mana, add one mana of any type that permanent produced\.?\s*$/i.test(line))
    .join("\n");
}

// ─── BESTOW (CR 702.103) ─────────────────────────────────────────────────────────
//
// A bestow creature (Theros block) is an Enchantment Creature with a "Bestow {cost}" alternative
// cast cost. Cast for its bestow cost, it's an AURA spell with "enchant creature" that grants the
// enchanted creature "+X/+X" (and/or a keyword) — and BECOMES A CREATURE AGAIN if it ever stops
// being attached (CR 702.103e). The "enchanted creature gets …" bonus uses the SAME grammar a
// printed Aura uses, so parseAuraBonus already models it — no second parser. parseBestowCost only
// extracts the alt-cost; the dual-mode nativeness gate (creature body + aura bonus, both clean) is
// coverage.isNativeBestow, and the runtime offer + attach reuse the existing Aura cast/attach path.

/**
 * The "Bestow {cost}" alternative cast cost of a bestow creature, as the raw cost STRING
 * ("{3}{W}", "{X}{G}{G}"), or null if the card has no bestow line. The clause's reminder text
 * was already dropped by abilityClauses (paren-aware). Anchored to the EXACT keyword-then-cost
 * shape so a card merely mentioning "bestow" in other text (none in the real corpus) never
 * false-matches. Pure leaf — the runtime parses the returned string via legalChoices.parseManaCost.
 */
export function parseBestowCost(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  for (const clause of abilityClauses(oracle)) {
    const m = clause.trim().match(/^bestow\s+((?:\{[^}]+\})+)$/i);
    if (m) return m[1];
  }
  return null;
}

/** True when the card's type line marks it an Enchantment Creature (the bestow body — CR 702.103a). */
export function isEnchantmentCreature(card) {
  const ty = String(card?.type || card?.type_line || "");
  return /\bEnchantment\b/i.test(ty) && /\bCreature\b/i.test(ty);
}

/**
 * GRANTED-MANA-ABILITY AURA (creature OR land host) — an Aura that grants the enchanted CREATURE or LAND a
 * fully-modeled tap-for-mana ability ("Enchanted creature has \"{T}: Add one mana of any color.\"" — Multani's
 * Harmony; "Enchanted land has \"{T}: Add two mana of any one color.\"" — Settlement / Sheltered Aerie).
 * Returns the `{colors, amount}` spec (via the CREED-guarded parseGrantedManaSpec) or null.
 *   - CREATURE host: the creature has no own mana production → manaSources grants the tap through the
 *     EXISTING grantedManaSpecsFor runtime (the `if (!prod)` fallback, the same path group grants use).
 *   - LAND host: a land already produces its own mana, so the grant SUPPLEMENTS — manaSources upgrades the
 *     land's single-tap output to the granted spec when it strictly dominates (any-color ⊇ one own color,
 *     amount ≥). The emitted layer-6 effect is marked `via:"attached"` so the supplement applies ONLY to a
 *     genuinely-distinct aura ability, never to a group grant (Gemhide self-include must not double-tap).
 */
export function parseAuraGrantedManaAbility(card) {
  const slot = _cardSlot(card);
  if (slot && "auraGrantMana" in slot) return slot.auraGrantMana;
  const result = parseAuraGrantedManaAbilityImpl(card);
  if (slot) slot.auraGrantMana = result;
  return result;
}

function parseAuraGrantedManaAbilityImpl(card) {
  // EQUIPMENT host (phase 1a — Paradise Mantle, SHELF W4): "Equipped creature has \"{T}: Add …\"" is the
  // same granted-mana shape on an Equipment. The layers.js attachment block fires for ANY attachedTo (aura
  // or equipment), so widening the parse here is the whole runtime change — the host gains the tap through
  // the identical grantedManaSpecsFor → manaSources path. Coverage gates it separately
  // (coverage.isNativeManaGrantEquipment walks the Equip-line residue; isNativeManaGrantAura stays aura-only).
  if (/\bEquipment\b/i.test(String(card?.type || card?.type_line || ""))) {
    const oracle = String(card?.oracle || card?.oracle_text || "");
    for (const clause of abilityClauses(oracle)) {
      const m = clause.trim().match(/^equipped creature (?:has|have)\s+["“]([^"”]+)["”]\s*\.?$/i);
      if (!m) continue;
      const spec = parseGrantedManaSpec(m[1]);
      if (spec) return spec;
    }
    return null;
  }
  if (!isAuraCard(card)) return null;
  const subj = auraEnchantSubject(card);
  if (subj !== "creature" && subj !== "land") return null;
  const oracle = String(card?.oracle || card?.oracle_text || "");
  for (const clause of abilityClauses(oracle)) {
    const m = clause.trim().match(/^enchanted (?:creature|land) (?:has|have)\s+["“]([^"”]+)["”]\s*\.?$/i);
    if (!m) continue;
    const spec = parseGrantedManaSpec(m[1]);
    if (spec) return spec;
  }
  return null;
}

// Residue for a granted-mana Aura: every body clause that ISN'T the Enchant line or the modeled grant
// clause. A rider (an ETB trigger — Karametra's Favor "draw a card"; a restriction — Utopia Vow "can't
// attack or block"; Unbridled Growth's "Sacrifice this Aura: draw") leaves residue → the card stays
// non-native (all-or-nothing, CREED).
function manaGrantResidueClauses(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  const out = [];
  for (const clause of abilityClauses(oracle)) {
    const c = clause.toLowerCase().trim();
    if (/^enchant\b/.test(c)) continue;                                                              // Enchant keyword line
    if (/^enchanted (?:creature|land) (?:has|have)\s+["“][^"”]*\{t\}[^"”]*add[^"”]*["”]\s*\.?$/.test(c)) continue; // the modeled grant
    out.push(clause);
  }
  return out;
}

export function isNativeManaGrantAura(card) {
  if (!parseAuraGrantedManaAbility(card)) return false;
  return manaGrantResidueClauses(card).length === 0;
}

/**
 * Granular helpers for the COMPOSITE coverage classifier (coverage.permanentFullyCovered),
 * which subtracts trigger + activated clauses itself before checking the static residue —
 * so it needs the per-clause static test + the leveler guard, not the whole-card wrapper.
 */
export function clauseProducesStatic(clause) {
  const out = [];
  parseClause(String(clause || ""), out);
  return out.length > 0;
}
export function isLevelGatedOracle(oracle) {
  return isLevelGated(String(oracle || ""));
}
