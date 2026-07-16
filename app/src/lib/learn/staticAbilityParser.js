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
  // supertype / quality qualifiers
  "token", "nontoken", "legendary", "nonlegendary", "colorless", "multicolored", "monocolored",
  "nonland", "snow", "monstrous", "modified",
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
function selfNormalizeOracle(oracle, name, type) {
  // Strip parenthetical reminder text (CR 207.2 — reminder text is never functional) so a fully-modeled
  // static isn't judged "uncovered" by its own reminder ("Sliver creatures you control have double strike.
  // (They deal both first-strike and regular combat damage.)"). Removing it changes NO behavior — the
  // runtime parser already ignores it (it matches at clause starts) — it only lets the coverage check
  // (staticAbilitiesCoverCard) see that the card's real text is fully modeled. Scoped to static parsing.
  let o = String(oracle || "").replace(/\([^)]*\)/g, " ");
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
  const oracle = String(card?.oracle || card?.oracle_text || "").replace(/\([^)]*\)/g, " ");
  for (const sentence of oracle.split(/(?<=\.)\s+|\n+/)) {
    const m = sentence.match(/enters (?:the battlefield )?with (a|an|one|two|three|four|five|\d+) \+1\/\+1 counters? on it/i);
    if (!m) continue;
    if (/\b(?:if|for each|where|kicked|unless|equal to|plus)\b/i.test(sentence)) return 0; // conditional/variable → not modeled
    return _ENTER_NUM[m[1].toLowerCase()] ?? (parseInt(m[1], 10) || 0);
  }
  return 0;
}

// ENTERS-WITH-NAMED-COUNTERS (CR 614.1c + 122.6a) — the FIXED number of a NAMED (non-P/T) counter a permanent
// "enters with N <name> counters on it", or null. The generic sibling of entersWithPlusCounters, for a
// card-specific counter kind (slumber — Arixmethes; the fading/vanishing fade/time counters have their own
// keyword-driven path in fading.js and are EXCLUDED here to avoid a double-add). ONLY the bare, unconditional,
// literal-N form: a kicker / "for each" / "where X" / conditional variant → null (the variable/gated count
// isn't modeled → left to the Arbiter, never a fabricated count). The counter NAME must be a single bare word
// (not a ±1/+1 P/T form, not loyalty — loyalty enters via the PW starting-loyalty write). Returns
// { type, n } | null. Leaf (no engine import). The resolver adds exactly this at ETB; the SINGLE source of truth.
const _RESERVED_ENTER_COUNTER_KINDS = new Set(["fade", "time", "loyalty"]);
export function entersWithNamedCounters(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "").replace(/\([^)]*\)/g, " ");
  for (const sentence of oracle.split(/(?<=\.)\s+|\n+/)) {
    // "enters [the battlefield ][tapped ]with N <name> counters on it" — Arixmethes' printed text combines the
    // tapped clause and the counter clause in one sentence ("enters tapped with five slumber counters on it"),
    // so tolerate an optional "tapped" between "enters" and "with" (the enters-tapped seam handles the tapped
    // status separately; the coverage tapRe strip removes the tapped mention from the classifier residue).
    const m = sentence.match(/enters (?:the battlefield )?(?:tapped )?with (a|an|one|two|three|four|five|\d+) ([a-z]+) counters? on it/i);
    if (!m) continue;
    const kind = m[2].toLowerCase();
    if (_RESERVED_ENTER_COUNTER_KINDS.has(kind)) return null; // owned by another path (fading/PW) → not this seam
    if (/\b(?:if|for each|where|kicked|unless|equal to|plus)\b/i.test(sentence)) return null; // conditional/variable → not modeled
    const n = _ENTER_NUM[m[1].toLowerCase()] ?? (parseInt(m[1], 10) || 0);
    return n > 0 ? { type: kind, n } : null;
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
  if (e !== "" || (!pt && kws.length === 0)) return; // unconsumed rider, or nothing recognized → LOW (Arbiter)
  if (pt) out.push({ layer: 7, sublayer: "7c", op: { layerOp: "ptModifyGated", power: pt.power, toughness: pt.toughness, gate }, affects: { mode: "self" }, duration: { kind: "permanent" } });
  for (const kw of kws) out.push({ layer: 6, op: { layerOp: "addKeyword", keyword: kw, gate }, affects: { mode: "self" }, duration: { kind: "permanent" } });
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
function parseFlashCastFilter(filter) {
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
  const c = clause.toLowerCase().replace(/^(?:metalcraft|threshold|delirium|unlock ability)\s*[—–-]\s*/, "");

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
  const colorReducer = parseColorCostReduction(c);
  if (colorReducer) {
    out.push({ costReduction: colorReducer });
    return;
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
  const aacrM = c.match(/^activated abilities of creatures you control cost \{(\d+)\} less to activate$/);
  if (aacrM) {
    out.push({ activatedCostReduction: { amount: parseInt(aacrM[1], 10) } });
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
  // Two STATIC uncounterability shapes (CR 701.5e), emitted as coverage MARKERS ({ cantBeCountered } with NO
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
  // CONTROLLER-SCOPE (Chimil, the Inner Sun — "Spells you control can't be countered"): a board static that
  // protects EVERY spell its controller casts (CR 701.5e), not filtered by subtype. Emitted as a coverage +
  // enforcement marker; spellEffects.addStackSpells excludes such a controller's stack spells from counter
  // targets (mirrors the subtype exclusion). The cbcM regex below requires a single subtype word before
  // "spells", so this "spells you control …" form has to be its own branch.
  if (/^spells you control can't be countered$/.test(c)) {
    out.push({ cantBeCountered: { scope: "youControl" } });
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
  if (/^play with the top card of your library revealed$/.test(c)) { out.push({ inertInfo: true }); return; }
  if (/^you may play lands and cast spells from the top of your library$/.test(c)) {
    out.push({ playFromTop: { lands: true, spellFilter: "any" } });
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
        }
      }
      // A quoted-ability grant we matched the SHAPE of but can't fully model (no selector, or a non-mana /
      // unmodeled / triggered quoted ability) produces NO descriptor — the whole clause stays body-only
      // (CREED). Return either way: a "have \"…\"" clause is never ALSO a plain keyword/anthem grant.
      return;
    }
  }

  // ── CDA-SELF-P/T-BY-COUNT: a characteristic-defining ability SETTING self P/T from a live board count ──
  // "[this creature]'s power and toughness are each equal to the number of <X> you control" — a CDA (CR
  // 613.4a / 604.3), layer 7a, that SETS both base power and toughness to a LIVE count (Dakkon Blackblade /
  // Molimo / Flora Colossus — lands; Scion of the Wild / Crusader of Odric — creatures). DISTINCT from the
  // 7c "gets +X/+Y for each" self-buff below (that ADDS to the printed body; this SETS the */* base). The
  // card name was normalized to "this creature" upstream, so "Dakkon Blackblade's power and toughness …"
  // reads "this creature's power and toughness …". The count source must be one parseSelfCountSource models
  // (lands / creatures / artifacts / enchantments / a basic-land subtype) → a serializable
  // { kind:"permanentsYouControl", cardType|subtype } spec that layers.countSelfSpecOnBoard evaluates every
  // P/T computation (recursion-safe — a plain type-line scan, never deriveCharacteristics). An UNMODELED
  // count ("Spirits", "+1/+1 counters on lands", "permanents", a qualified/opponent count) → NO descriptor
  // → the card stays body-only (Arbiter; CREED — a miss is safe, a fabricated/wrong base across 75 such
  // creatures is forbidden). Anchored ^…$ on the whole clause: a trailing rider would break the anchor and
  // fall through to body-only. Placed BEFORE the 7c "for each" block so the SET form is tried first.
  {
    const cdaM = c.match(/^this creature's power and toughness are each equal to the number of (.+) you control$/);
    if (cdaM) {
      const countSpec = parseSelfCountSource(`${cdaM[1]} you control`);
      if (countSpec) {
        out.push({
          layer: 7,
          sublayer: "7a",
          isCDA: true,
          op: { layerOp: "ptSetDynamicCount", countSpec, setPower: true, setToughness: true },
          affects: { mode: "self" },
          duration: { kind: "permanent" },
        });
      }
      return; // a CDA self-P/T clause — handled (or intentionally dropped to body-only on an unmodeled count)
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
    const dt = c.match(/^during your turn, (?:this creature|it) gets ([+-]\d+)\/([+-]\d+)$/);
    if (dt) {
      out.push({ layer: 7, sublayer: "7c", op: { layerOp: "ptModifyGated", power: signed(dt[1]), toughness: signed(dt[2]), gate: { kind: "yourTurn" } }, affects: { mode: "self" }, duration: { kind: "permanent" } });
      return;
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
  if (keywords.length === 0 && protColors.length === 0) return null; // nothing recognized
  return { keywords, protColors };
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
    const ctFlat = c.match(/^creatures?\s+(you control\s+)?of the chosen type\s+(?:gets?|gains?|has|have)\b/);
    if (ctFlat) {
      const controllerScope = ctFlat[1] ? "you" : "each";
      return {
        mode: "dynamic",
        selector: { controllerScope, cardTypes: ["Creature"], chosenTypeOfSource: true },
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
 * 701.5e). Empty when no such static is in play → zero behavior change. Pure; hoisted once per enumeration.
 */
export function uncounterablePlayersOnBattlefield(state) {
  const players = new Set();
  for (const pid of Object.keys(state?.players || {})) {
    for (const perm of state.players[pid]?.battlefield || []) {
      if (perm?.card && parseStaticAbilities(perm.card).some((d) => d.cantBeCountered?.scope === "youControl")) { players.add(pid); break; }
    }
  }
  return players;
}

/**
 * PLAY-FROM-TOP-OF-LIBRARY — the play-permission a player currently has (Future Sight's { playFromTop } marker),
 * or null. Read from a battlefield permanent the player controls (a bare, non-attach-gated permission — the
 * filtered/attach-gated variants aren't emitted by the parser). Consumed by legalChoices.actionsPlayFromTopOf-
 * Library to offer the top library card as a real cast/play action, so the credited static is genuinely enforced.
 */
export function playFromTopPermission(state, playerId) {
  for (const perm of state?.players?.[playerId]?.battlefield || []) {
    if (!perm?.card) continue;
    for (const d of parseStaticAbilities(perm.card)) if (d.playFromTop) return d.playFromTop;
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
  const oracle = selfNormalizeOracle(String(card?.oracle || card?.oracle_text || ""), card?.name, card?.type || card?.type_line); // match the runtime's name-normalized parse
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

  // PACIFISM CLASS (BLITZ PA-1): "can't attack or block" / "can't attack" / "can't block" — layer-6
  // grants of the cantAttack/cantBlock pseudo-keywords, permanent for as long as the attachment holds
  // (the layer engine scopes attached bonuses to the host). Block-side enforcement is the SAME
  // canBlockAttacker read the until-EOT cant-block atom uses; attack-side is actionsDeclareAttacker's
  // cantAttack gate (added with this class). Anchored whole-clause: a compound tail (Arrest's "and its
  // activated abilities can't be activated") fails the match → the whole bonus drops (safe FN).
  const cantM = rest.match(/^can't (attack or block|attack|block)\.?$/);
  if (cantM) {
    if (cantM[1] !== "block") out.push({ layer: 6, op: { layerOp: "addKeyword", keyword: "cantAttack" }, duration: { kind: "permanent" } });
    if (cantM[1] !== "attack") out.push({ layer: 6, op: { layerOp: "addKeyword", keyword: "cantBlock" }, duration: { kind: "permanent" } });
    return out;
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
    const haveMatch = rest.match(/^(?:has|have)\s+(.+)$/);
    if (!haveMatch) return null;                       // residue that isn't a keyword/protection grant
    // EQUIP-PROTECTION: a "protection from <color>…" grant occupies the WHOLE have-tail (protection lists
    // join with "and from", which the keyword splitter would mangle). Detect it first; a non-color/dynamic
    // quality returns null → whole bonus drops (Sword of Wealth and Power stays body-only).
    const protColors = parseAttachedProtectionColors(haveMatch[1].trim());
    if (protColors) {
      out.push({ layer: 6, op: { layerOp: "addProtection", colors: protColors }, duration: { kind: "permanent" } });
      return out.length ? out : null;
    }
    // EQUIP-PROTECTION-DYNAMIC: the SOLE modeled non-color quality — "protection from each color that's not
    // in your commander's color identity" (Commander's Plate, CR 702.16j). The color set is state-dependent
    // (WUBRG minus the controller's commander color identity), so it's emitted as a DYNAMIC addProtection op
    // that layers.permanentProtectionColors resolves at read time. All-or-nothing: it must occupy the WHOLE
    // have-tail (no rider trails), matching every other quality here. Any OTHER non-color quality still → null.
    if (/^protection from each color that's not in your commander's color identity$/i.test(haveMatch[1].trim())) {
      out.push({ layer: 6, op: { layerOp: "addProtection", dynamicColors: "notCommanderIdentity" }, duration: { kind: "permanent" } });
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
  const slot = _cardSlot(card);
  const slotKey = "attached:" + subject;
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
    }
    if (!touchesAttachedCreature(c, subject)) continue;          // the card's own body — ignore
    const parsed = c.startsWith(`${subject} creature`) ? parseAttachedClause(c, subject) : null;
    if (!parsed) { if (slot) slot[slotKey] = []; return []; }     // a creature clause we can't fully model
    out.push(...parsed);
    saw = true;
  }
  const result = saw ? out : [];
  if (slot) slot[slotKey] = result;
  return result;
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
  const oracle = String(card?.oracle || card?.oracle_text || "");
  const out = [];
  for (const clause of abilityClauses(oracle)) {
    const c = clause.toLowerCase().trim();
    if (/^enchant\b/.test(c)) continue;                       // the Enchant keyword line
    // An aura-own TRIGGER sentence starting with When/Whenever/At "touches" the enchanted creature but is NOT
    // a static bonus clause; admit it as non-residue ONLY when it is the modeled aura-own trigger (the runtime
    // fires it), else it stays residue → non-native (CREED). Checked BEFORE the generic touchesAttachedCreature
    // skip so an UNMODELED aura trigger ("Whenever enchanted creature dies, draw a card") is NOT silently
    // admitted — it falls through to `out.push`, keeping the Aura body-only.
    if (/^(?:when|whenever|at)\b/.test(c)) {
      if (isModeledAuraOwnTrigger(c)) continue;               // AURA-OWN-TRIGGER: modeled combat-damage relay (Super State)
      if (isSelfPigReturnClause(c)) continue;                 // SELF-LTB: the modeled Aura self-PiG-return trigger
      out.push(clause);                                       // any other aura-own trigger → residue → non-native
      continue;
    }
    if (isTotemArmorClause(c)) continue;                      // TOTEM ARMOR (Bear Umbra): the modeled destruction-replacement
    if (touchesAttachedCreature(c, "enchanted")) continue;    // a creature-bonus (P/T / keyword) clause
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
  /^whenever enchanted creature deals combat damage to (?:a player|an opponent), it deals that much damage to each other opponent\.?$/i;
function isModeledAuraOwnTrigger(clause) {
  return AURA_OWN_MODELED_TRIGGER_RE.test(String(clause || "").trim());
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
  if (!auraEnchantRestrictions(card)) return false;         // "creature" or "creature you control" only
  if (!parseAuraBonus(card).length) return false;
  return auraResidueClauses(card).length === 0;
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
  const subject = auraEnchantSubject(card);
  if (subject === "creature") return [];
  if (subject === "creature you control") return [{ kind: "controller", who: "you" }];
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
    // The optional " while you're the monarch" condition rides between "for mana" and ", add" (Regal
    // Behemoth — the only monarch-gated tap-augment in the corpus). Captured as condition:"monarch"; the
    // runtime (globalTapManaAugment) adds the extra mana ONLY while `state.monarchId === playerId`.
    const m = clause.trim().toLowerCase().match(
      /^whenever you tap a (land|creature) for mana( while you're the monarch)?, add (?:an additional )?(.+)$/,
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
    .filter((line) => !/^\s*whenever you tap a (?:land|creature) for mana(?: while you're the monarch)?, add /i.test(line))
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
