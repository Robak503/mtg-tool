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

import { GRANTABLE_STATIC_KEYWORDS, canonicalCombatKeyword } from "./keywords.js";

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
function abilityClauses(oracle) {
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
function normalizeSubtype(word) {
  let w = word.trim();
  // Irregular plurals (else the parsed subtype matches no creature and the buff applies to nobody):
  //   "-ves" → "-f"  (Elves→Elf, Wolves→Wolf, Dwarves→Dwarf);
  //   "Allies" → "Ally"  (the only "-y → -ies" creature subtype; a blanket -ies→y would wrongly turn
  //   Zombies→Zomby / Faeries→Faery, so it's special-cased).
  // Plain "-s" strips to singular (Slivers→Sliver).
  if (/^allies$/i.test(w)) w = "ally";
  else if (/ves$/i.test(w)) w = w.slice(0, -3) + "f";
  else if (w.endsWith("s")) w = w.slice(0, -1);
  return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w;
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
  // supertype / quality qualifiers
  "token", "nontoken", "legendary", "nonlegendary", "colorless", "multicolored", "monocolored",
  "nonland", "snow", "monstrous", "modified",
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
]);

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
  // EQUIP-DYNAMIC-PT: "color(s) among permanents you control" — the count of DISTINCT WUBRG colors among the
  // controller's battlefield (Conqueror's Flail "+1/+1 for each color among permanents you control",
  // CR — a colorless permanent contributes no color). layers.countSelfSpecOnBoard evaluates the Set size.
  if (/^colors? among permanents you control$/.test(p)) return { kind: "colorsAmongPermanents" };
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
  // Must be a {T}: Add … ability — left-of-colon tap cost, right-of-colon "Add" effect. A {Q}/cost-with-mana
  // or sacrifice-cost ability is out of the modeled subset.
  const ci = q.indexOf(":");
  if (ci === -1) return null;
  const cost = q.slice(0, ci);
  const effect = q.slice(ci + 1);
  // The cost must be EXACTLY a {T} tap — nothing else. A rider cost ("{T}, Pay 1 life: Add …" — Forgotten
  // Monument; "{T}, Sacrifice …") is NOT modeled by the granted-tap source, and silently dropping it would
  // grant FREE mana (a CREED FP). Allow only "{t}" + whitespace/commas in the cost.
  if (!/\{t\}/i.test(cost)) return null;                      // require a {T} tap cost
  if (cost.replace(/\{t\}/ig, "").replace(/[\s,]/g, "") !== "") return null; // any extra cost (life/sac/pips) → reject
  if (!/\badd\b/i.test(effect)) return null;                  // must be a mana ("Add …") ability
  if (/\bx\b/i.test(effect) || /\bfor each\b|\bequal to\b/i.test(effect)) return null; // VARIABLE → wrong scope
  // A SPENDING RESTRICTION on the produced mana ("Spend this mana only to cast …" — Clement/Charitable
  // Drafter; "This mana can't be spent to cast …" — Battery Bearer) is NOT modeled (the mana pool is
  // unrestricted), so dropping it would grant unrestricted mana the card actually restricts (a CREED FP).
  // Reject the whole grant — the recipient keeps no fabricated all-purpose mana.
  if (/\bspend this mana\b|\bthis mana can'?t be spent\b|\bcan'?t be spent\b|\bonly to (?:cast|pay|activate)\b/i.test(effect)) return null;
  // "Add N mana of any one color" — N spelled or digit; "Add … mana of any color" — amount 1.
  let mm = effect.match(/\badd\s+(one|two|three|four|five|\d+)\s+mana of any one color\b/i);
  if (mm) {
    const amount = _ENTER_NUM[mm[1].toLowerCase()] ?? parseInt(mm[1], 10);
    if (Number.isFinite(amount) && amount > 0) return { colors: ["W", "U", "B", "R", "G"], amount };
    return null;
  }
  if (/\badd\b[^.]*\bmana of any( one)? color\b/i.test(effect)) {
    return { colors: ["W", "U", "B", "R", "G"], amount: 1 };
  }
  // Fixed pips: "Add {G}" / "Add {C}{C}" (concat = sum) / "Add {W} or {U}" ("or" = choice, amount 1).
  const symbols = [...effect.matchAll(/\{([WUBRGC])\}/gi)].map((x) => x[1].toUpperCase());
  if (symbols.length === 0) return null;
  const unique = [...new Set(symbols)];
  if (/\bor\b/i.test(effect)) return { colors: unique, amount: 1 };
  return { colors: unique, amount: symbols.length };
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
  const t = String(typePhrase).toLowerCase().trim().replace(/\.$/, "");
  if (!t || /\s/.test(t)) return null; // compound / color-qualified / negated → LOW
  let atLeast = 1, excludeSelf = false;
  if (quant === "another") excludeSelf = true;
  else if (quant === "two or more") atLeast = 2;
  else if (quant === "three or more") atLeast = 3;
  else { const mm = quant.match(/^(\d+) or more$/); if (mm) atLeast = parseInt(mm[1], 10); }
  if (SELF_COUNT_CARDTYPE[t]) return { countSpec: { kind: "permanentsYouControl", cardType: SELF_COUNT_CARDTYPE[t] }, atLeast, excludeSelf };
  if (SELF_COUNT_BASIC[t]) return { countSpec: { kind: "permanentsYouControl", subtype: SELF_COUNT_BASIC[t] }, atLeast, excludeSelf };
  // A SUPERTYPE token (legendary/basic/snow/world) would word-bound-match unrelated type lines and OVER-count
  // the gate; "permanent"/"spell"/"token" aren't type-line subtypes at all → reject → LOW → Arbiter (never a
  // fabricated gate). Real subtypes (Equipment, Vehicle, Saga, creature types) fall through to the fallback.
  if (/^(?:legendary|basic|snow|world|ongoing|permanents?|spells?|tokens?)$/.test(t)) return null;
  const sub = t.charAt(0).toUpperCase() + t.slice(1).replace(/s$/, ""); // bare creature-subtype word → Capitalized
  return { countSpec: { kind: "permanentsYouControl", subtype: sub }, atLeast, excludeSelf };
}

/**
 * Replace the card's OWN name with "this creature" so a name-based self-reference ("Nim Lasher gets +1/+0
 * …", common on older cards) reads the same as modern "This creature gets …" templating. Word-bounded on
 * the FULL name only (never a partial), so it can't touch an unrelated card's name in the text.
 */
function selfNormalizeOracle(oracle, name) {
  // Strip parenthetical reminder text (CR 207.2 — reminder text is never functional) so a fully-modeled
  // static isn't judged "uncovered" by its own reminder ("Sliver creatures you control have double strike.
  // (They deal both first-strike and regular combat damage.)"). Removing it changes NO behavior — the
  // runtime parser already ignores it (it matches at clause starts) — it only lets the coverage check
  // (staticAbilitiesCoverCard) see that the card's real text is fully modeled. Scoped to static parsing.
  let o = String(oracle || "").replace(/\([^)]*\)/g, " ");
  if (!name) return o;
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return o.replace(new RegExp(`\\b${esc}\\b`, "g"), "this creature");
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
 * ENTERS-WITH-X (CR 122.1 + the {X} chosen at cast) — does this permanent "enter with X +1/+1 counters on
 * it", where X is the value paid for its {X} mana cost? True for the bare literal-"X" form (Hungering /
 * Lifeblood / Primordial / Hydroid Krasis / Mistcutter / Nyxborn Hydra…). The resolver reads the chosen X
 * (threaded as the cast's xValue) and adds that many +1/+1 counters, so the creature enters at its real P/T
 * instead of a 0/0 that dies to the lethal-toughness SBA. A "for each <thing>" / "equal to" / "plus N"
 * variant is a DIFFERENT magnitude (not the cast X) → false, left for the Arbiter. Leaf (no engine import).
 */
export function entersWithXCounters(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "").replace(/\([^)]*\)/g, " ");
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
];
export function selfCostReductionMetric(card) {
  // Reminder text ("(Artifacts, legendaries, and Sagas are historic.)" — Excalibur) is parenthetical (CR 207.2)
  // and must be stripped before the anchored match, else the trailing reminder breaks the `$` anchor.
  const oracle = String(card?.oracle || card?.oracle_text || "").replace(/\([^)]*\)/g, " ");
  for (const sentence of oracle.split(/(?<=\.)\s+|\n+/)) {
    const s = sentence.trim().toLowerCase().replace(/\.\s*$/, "");
    if (!s.startsWith("this spell costs")) continue;
    for (const [re, metric] of SELF_COST_METRICS) {
      if (re.test(s)) return metric;
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
  if (e !== "" || (!pt && kws.length === 0)) return; // unconsumed rider, or nothing recognized → LOW (Arbiter)
  if (pt) out.push({ layer: 7, sublayer: "7c", op: { layerOp: "ptModifyGated", power: pt.power, toughness: pt.toughness, gate }, affects: { mode: "self" }, duration: { kind: "permanent" } });
  for (const kw of kws) out.push({ layer: 6, op: { layerOp: "addKeyword", keyword: kw, gate }, affects: { mode: "self" }, duration: { kind: "permanent" } });
}

/**
 * Try every supported pattern against one clause; push any descriptor(s) found
 * into `out`. The patterns are intentionally narrow and ordered most-specific
 * first so a tribal/color anthem doesn't also match the generic anthem.
 * `selfName` (the card's name, optional) is threaded only so the EMINENCE
 * cost-reducer can stamp `sourceName` for its excludeSelf ("other ~ spells") guard.
 */
function parseClause(clause, out, selfName) {
  // Strip flavor ability-word labels (CR 207.2c — they carry no rules meaning).
  // Metalcraft/Threshold/Delirium appear on STATIC clauses; the GY path re-strips
  // Threshold/Delirium below (no-op after this) for clarity.
  const c = clause.toLowerCase().replace(/^(?:metalcraft|threshold|delirium)\s*[—–-]\s*/, "");

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
  const colorReducer = parseColorCostReduction(c);
  if (colorReducer) {
    out.push({ costReduction: colorReducer });
    return;
  }

  // ── OPPONENTS-CANT-ACT (Grand Abolisher; Voice of Victory; Conqueror's Flail rider) ────────────────────
  // "Your opponents can't cast spells during your turn." / "During your turn, your opponents can't cast
  // spells or activate abilities of artifacts, creatures, or enchantments." A STATIC restriction (CR 720,
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

  // ── COUNTER-PAYOFF keyword grant (Badgermole/Emil/Training Regimen — "creatures you control with +1/+1
  // counters on them have trample"): generalizes Herald's counter-gated grant to any GRANTABLE keyword(s),
  // same requiresCounter dynamic per-creature gate. ALL-OR-NOTHING — every word in the "have …" phrase must
  // be a grantable (enforced/layer-aware) keyword, else the whole clause is left unmodeled (a rider like
  // "have trample and <unmodeled>" must never drop a keyword while the card flips native). Bare form only:
  // a "During your turn," / "Unlock Ability —" prefix or a trailing qualifier won't match the ^…$ anchor → safe FN.
  const cpKw = c.match(/^(?:each |all )?creatures? you control with (?:a )?\+1\/\+1 counters? on (?:it|them) have (.+)$/);
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
      const selector = parseCreatureSelector(grantQ[1].toLowerCase() + " have");
      const quoted = grantQ[2];
      const manaSpec = selector ? parseGrantedManaSpec(quoted) : null;
      if (selector && manaSpec) {
        out.push({
          layer: 6,
          op: { layerOp: "addAbility", grant: { kind: "mana", spec: manaSpec } },
          affects: selector,
          duration: { kind: "permanent" },
        });
      } else if (selector && !/^(?:when|whenever|at the beginning)/i.test(quoted.trim())) {
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
        // the granter. Triggered bodies (When/Whenever/At) are deferred (group-triggered = a later slice).
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
        }
      }
      // A quoted-ability grant we matched the SHAPE of but can't fully model (no selector, or a non-mana /
      // unmodeled / triggered quoted ability) produces NO descriptor — the whole clause stays body-only
      // (CREED). Return either way: a "have \"…\"" clause is never ALSO a plain keyword/anthem grant.
      return;
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
      return; // an as-long-as self-gate — handled (or dropped to LOW on an unmodeled gate type)
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
      if (gate) out.push({ layer: 7, sublayer: "7c", op: { layerOp: "ptModifyGated", power: signed(gm[3]), toughness: signed(gm[4]), gate }, affects: { mode: "self" }, duration: { kind: "permanent" } });
      return;
    }
    gm = c.match(new RegExp(`^(?:this creature|it) has (.+?) as long as ${GATE}$`));
    if (gm) { emitGatedKeywords(out, gm[1], gm[2], gm[3]); return; }
    gm = c.match(new RegExp(`^as long as ${GATE}, (?:this creature|it) has (.+)$`));
    if (gm) { emitGatedKeywords(out, gm[3], gm[1], gm[2]); return; }
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
      emitGatedEffect(out, eff, gy.gate);
      return;
    }
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

  // ── STATIC-ANTHEM keyword-grant ALL-OR-NOTHING GUARD (CLAUDE.md §1.2) ────────
  // The anthem keyword pass below is NOT all-or-nothing on its own: extractKeywords silently DROPS any
  // segment that isn't a grantable keyword and still emits the grantable ones. So a clause like
  // "Creatures you control have flying, …, and protection from black and from red" (Akroma's Memorial)
  // would grant flying/first-strike/… while DROPPING the protection — a partial flip = a FORBIDDEN false
  // positive (also Avatar of Slaughter / Hellraiser Goblin "attack each combat if able"; Giant Ankheg
  // "ward {2}"). Hoisted ABOVE both the P/T pass and the keyword pass because the P2.10 combined "get
  // +X/+Y and have <tail>" pushes the layer-7c P/T descriptor BEFORE the keyword pass — so a lossy tail
  // must prevent BOTH descriptors, not just the keyword one. If the "have <tail>" carries ANY segment that
  // isn't a grantable keyword, the WHOLE clause stays body-only (a clean false-negative).
  const haveMatch = c.match(/\b(?:have|has)\s+(.+)$/);
  if (haveMatch && parseCreatureSelector(c) && haveTailHasNonGrantable(haveMatch[1])) {
    return;
  }

  // ── P/T anthems / lords (layer 7c, 613.4c) ──────────────────────────────────
  // "get +X/+Y" with explicit signs is the anthem/lord signature.
  const ptMatch = c.match(/\bgets?\s+([+-]\d+)\/([+-]\d+)\b/);
  if (ptMatch) {
    const power = signed(ptMatch[1]);
    const toughness = signed(ptMatch[2]);
    const affects = parseCreatureSelector(c);
    if (affects) {
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

  // ── Keyword grants (layer 6, 613.1f) ────────────────────────────────────────
  // "<selector> have <keyword>[ and <keyword>...]" — the all-or-nothing guard above already returned on a
  // lossy tail, so by here every segment IS a grantable keyword.
  if (haveMatch) {
    const affects = parseCreatureSelector(c);
    if (affects) {
      const kws = extractKeywords(haveMatch[1]);
      for (const kw of kws) {
        out.push({
          layer: 6,
          op: { layerOp: "addKeyword", keyword: kw },
          affects,
          duration: { kind: "permanent" },
        });
      }
    }
  }
}

/**
 * STATIC-ANTHEM all-or-nothing test: split a "have <tail>" into the SAME comma/"and" segments
 * extractKeywords uses, cleaned identically (drop non-[a-z ] chars so "ward {2}" → "ward"). True if ANY
 * non-empty cleaned segment is NOT a grantable keyword — i.e. modeling this clause would silently drop
 * real text ("protection from black", "attack each combat if able", "ward"). The caller then leaves the
 * WHOLE clause body-only. Mirrors extractKeywords' cleaning so good/bad classification can't drift.
 */
function haveTailHasNonGrantable(tail) {
  for (const raw of String(tail).split(/,|\band\b/)) {
    const word = raw.trim().replace(/[^a-z ]/g, "").trim();
    if (!word) continue;
    if (!GRANTABLE_KEYWORDS.has(word)) return true;
  }
  return false;
}

/**
 * Pull granted keyword names out of a "have <...>" tail, validated against the
 * grantable set. "flying and vigilance" → ["Flying","Vigilance"]; unknown words
 * are dropped (never fabricated). Returns canonical-cased keyword names.
 */
function extractKeywords(tail) {
  const found = [];
  // Split on commas / "and" so "flying, first strike, and trample" parses.
  for (const raw of tail.split(/,|\band\b/)) {
    const word = raw.trim().replace(/[^a-z ]/g, "").trim();
    if (!word) continue;
    if (GRANTABLE_KEYWORDS.has(word)) {
      found.push(canonicalKeyword(word));
    }
  }
  return found;
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

  // Tribal / determiner anthem: "(all|other|each) <word> [creatures] [you control] get…"
  let m = c.match(/^(all|other|each)\s+([a-z]+)\s+(?:creatures?\s+)?(?:you control\s+)?(?:gets?|gains?|has|have)\b/);
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
      // A board-STATE / supertype / card-type qualifier (tapped/nontoken/colorless/artifact/…) is NOT a
      // tribal lord — never fabricate a subtype grant that selects nobody yet flips the card native (a
      // CREED FP: Boartusk Liege, Adept Watershaper, Thraben Watcher…). Fall through → clause unmodeled.
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

/**
 * Parse a permanent's oracle into static continuous-effect descriptors (partial:
 * no id/timestamp/source). Bounded — recognizes the anthem/lord grammar above;
 * everything else yields []. Pure.
 */
export function parseStaticAbilities(card) {
  const rawOracle = String(card?.oracle || card?.oracle_text || "");
  if (!rawOracle || isLevelGated(rawOracle)) return [];
  const oracle = selfNormalizeOracle(rawOracle, card?.name); // TRUNK-SELFBUFF: name-based self-ref → "this creature"
  const out = [];
  for (const clause of abilityClauses(oracle)) {
    parseClause(clause, out, card?.name); // name → EMINENCE excludeSelf sourceName
  }
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
    if (r.subtype) {
      if (!typeLine) continue;
      const sub = String(r.subtype).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (sub && new RegExp(`\\b${sub}\\b`).test(typeLine)) total += r.amount || 0;
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

// A spell's colors as WUBRG letters (Scryfall `colors` array, else derived from mana-cost pips). Local mirror
// of layers.colorsOf — kept here so this leaf module needs no engine import (a {W/U} hybrid pip counts both).
const _WUBRG = ["W", "U", "B", "R", "G"];
function colorsOfSpell(card) {
  if (Array.isArray(card?.colors)) return card.colors.map((c) => String(c).toUpperCase());
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
  if (parseStaticAbilities(card).length === 0) return false; // none, or leveler-gated
  const oracle = selfNormalizeOracle(String(card?.oracle || card?.oracle_text || ""), card?.name); // match the runtime's name-normalized parse
  for (const clause of abilityClauses(oracle)) {
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
function parseAttachedClause(c, subject) {
  let rest = c.replace(new RegExp(`^${subject} creature\\s+`), "").trim();
  const out = [];

  // EQUIP-BASE-PT-SET (layer 7b): "has base power and toughness N/N" (literal). A DYNAMIC form
  // ("…N/N, where X is your life total") has trailing residue after the N/N and is NOT matched here, so
  // the all-or-nothing tail check below rejects it (Aettir and Priwen stays body-only — safe FN, no
  // fabricated CDA). Anchored to the whole clause (no other bonus composes with a base-P/T set in the
  // modeled corpus). applyLayer7 already applies sublayer 7b.
  const baseSet = rest.match(/^(?:has|have)\s+base power and toughness\s+(\d+)\/(\d+)$/);
  if (baseSet) {
    return [{ layer: 7, sublayer: "7b", op: { power: parseInt(baseSet[1], 10), toughness: parseInt(baseSet[2], 10) }, duration: { kind: "permanent" } }];
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
  }
  if (rest) {
    const haveMatch = rest.match(/^(?:has|have)\s+(.+)$/);
    if (!haveMatch) return null;                       // residue that isn't a keyword/protection grant
    // EQUIP-PROTECTION: a "protection from <color>…" grant occupies the WHOLE have-tail (protection lists
    // join with "and from", which the keyword splitter would mangle). Detect it first; a non-color/dynamic
    // quality returns null → whole bonus drops (Commander's Plate, Sword of Wealth and Power stay body-only).
    const protColors = parseAttachedProtectionColors(haveMatch[1].trim());
    if (protColors) {
      out.push({ layer: 6, op: { layerOp: "addProtection", colors: protColors }, duration: { kind: "permanent" } });
      return out.length ? out : null;
    }
    const words = haveMatch[1].split(/,|\band\b/).map(w => w.trim().replace(/[^a-z ]/g, "").trim()).filter(Boolean);
    if (words.length === 0) return null;
    for (const w of words) {
      if (!GRANTABLE_KEYWORDS.has(w)) return null;     // an unmodeled keyword/rider → whole bonus drops
      out.push({ layer: 6, op: { layerOp: "addKeyword", keyword: canonicalKeyword(w) }, duration: { kind: "permanent" } });
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
function touchesAttachedCreature(c, subject) {
  return c.includes(`${subject} creature`) || /^it\b/.test(c) || /^that creature\b/.test(c);
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
  const subject = subjectOverride || (/enchanted creature/i.test(oracle) ? "enchanted" : "equipped");
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
    // here can't over-claim. The AURA gate (isNativeAura) has NO such trigger-routing check; it relies on this
    // parse failing to keep a triggered-ability aura non-native (the auras-grant-trigger slice is separate), so
    // for the "enchanted" subject we keep the original all-or-nothing behavior (a trigger line poisons it → []).
    if (subject === "equipped" && /^(?:when|whenever|at)\b/.test(c.trim())) continue;
    if (!touchesAttachedCreature(c, subject)) continue;          // the card's own body — ignore
    const parsed = c.startsWith(`${subject} creature`) ? parseAttachedClause(c, subject) : null;
    if (!parsed) return [];                                       // a creature clause we can't fully model
    out.push(...parsed);
    saw = true;
  }
  return saw ? out : [];
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
 * The subject of an Aura's "Enchant <subject>" keyword ability (CR 702.5), lowercased —
 * "creature", "permanent", "creature you control", "land", "player", … — or null if the
 * card has no Enchant line. The modeled subset is EXACTLY "creature" (any creature, no
 * controller/zone restriction); everything else stays unmodeled.
 */
function auraEnchantSubject(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  for (const clause of abilityClauses(oracle)) {
    const m = clause.trim().match(/^enchant\s+(.+)$/i);
    if (m) return m[1].trim().toLowerCase();
  }
  return null;
}

/**
 * Clauses on an Aura that are NEITHER the "Enchant …" keyword line NOR a clause that
 * touches the enchanted creature (those are the modeled bonus). A non-empty residue means
 * the Aura carries something we DON'T model (a triggered ability, an activated ability, a
 * static effect on the controller) — so attaching it and applying only the P/T/keyword
 * bonus would SILENTLY drop that text. Used to keep `isNativeAura` all-or-nothing.
 */
function auraResidueClauses(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  const out = [];
  for (const clause of abilityClauses(oracle)) {
    const c = clause.toLowerCase().trim();
    if (/^enchant\b/.test(c)) continue;                       // the Enchant keyword line
    if (touchesAttachedCreature(c, "enchanted")) continue;    // a creature-bonus clause
    if (isSelfPigReturnClause(c)) continue;                   // SELF-LTB: the modeled Aura self-PiG-return trigger
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

/**
 * Is this Aura one the engine can play END-TO-END natively? ALL of (no silent gaps):
 *   1. type line is an Aura,
 *   2. it enchants EXACTLY "creature" (no controller/zone restriction, not a non-creature),
 *   3. `parseAuraBonus` yields a non-empty all-or-nothing P/T + keyword bonus, AND
 *   4. there is NO residual clause (no triggered/activated/controller-static text we'd drop).
 * When any fails, the Aura is NOT native — the cast path routes it to the Arbiter seam
 * rather than entering a do-nothing permanent. Single source of truth for the runtime
 * (legalChoices/actionDispatcher) AND the coverage metric, so they can't drift. Pure.
 */
export function isNativeAura(card) {
  if (!isAuraCard(card)) return false;
  if (auraEnchantSubject(card) !== "creature") return false;
  if (!parseAuraBonus(card).length) return false;
  return auraResidueClauses(card).length === 0;
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
    // combination", "of the chosen color" are NOT this form and fall through to null.
    if (/^one mana of any color$/.test(tail)) {
      return { colors: ["W", "U", "B", "R", "G"], amount: 1 };
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
    return null; // an unmodeled boost tail (combination/chosen-color/for-each) — non-native
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
    out.push(clause);
  }
  return out;
}

/**
 * Is this a land-enchant Aura the engine plays END-TO-END natively as a mana boost? ALL of:
 *   1. type line is an Aura,
 *   2. it enchants EXACTLY "land" (bare — a subtype-restricted "Enchant Forest" stays non-native:
 *      Utopia Sprawl also needs an as-enters color choice, deferred),
 *   3. `parseAuraLandManaBonus` yields a modeled fixed/any-color boost, AND
 *   4. there is NO residual clause (no ETB trigger / sac ability / extra land-static we'd drop).
 * Separate from isNativeAura (the creature path) — the creature gate is left BYTE-IDENTICAL. Single
 * source of truth for runtime + metric. Pure.
 */
export function isNativeManaAura(card) {
  if (!isAuraCard(card)) return false;
  if (auraEnchantSubject(card) !== "land") return false;
  if (!parseAuraLandManaBonus(card)) return false;
  return manaAuraResidueClauses(card).length === 0;
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
