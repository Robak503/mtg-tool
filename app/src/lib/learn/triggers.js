/**
 * triggers.js — triggered-ability detection + resolution (Phase-7 PR-5).
 *
 * Leaf module: imports ONLY gameState reads, so gameEngine/combat can import it
 * without a cycle (this file must never import resolvers.js back). Detects
 * triggered abilities from a card's oracle text (the When/Whenever/At grammar,
 * CR 603.1) and matches them to game events; the flush stage (gameEngine.
 * buildTriggerStack) parses each descriptor's effectClause into a rich
 * EffectProgram. Anything unmodeled keeps the manual payload → the engine
 * resolves it through the no-op/Arbiter path, never a fabricated effect
 * (CLAUDE.md §1.2). (W4: the old Phase-1 naive effect vocabulary was deleted.)
 *
 * PR-5 ships detection + matching + application, all unit-tested, but NOTHING is
 * enqueued in a real game yet — the ETB/dies/step/attack hooks that call
 * triggersForEvent + enqueueTrigger land in PR-6..8.
 */

import {
  opponentsOf,
  findPermanent,
  creaturePower,
  recordCreatureDeaths,
  registerLifeLossWatcher, // LIFE-LOSS-ON-EVENT (SHELF M3) — the loseLife chokepoint's registry seam
  logEvent, // GRANTED DIES-EXILE (Rivaz) — the graveyard→exile move logs at the dies chokepoint
} from "./gameState.js";
import { hasKeyword, COMBAT_KEYWORDS } from "./keywords.js";
import { grantedTriggeredQuotedFor, permanentHasKeyword, keywordInstanceCount, permanentColors, permanentTypes, diesTriggerMultiplierCount, attackTriggerMultiplierCount, etbTriggerMultiplierCount, castTriggerMultiplierCount, colorsOf } from "./layers.js";
import { parseSagaChapters } from "./saga.js"; // SAGA chapter synthesis (CR 714 — Vault 12, SHELF S7); a pure leaf
import { applyLifeGainReplacement } from "./replacementEffects.js"; // LIFE-GAIN replacement (CR 614.1) — read by checkLifegainTriggers so a trigger sees the life ACTUALLY gained. replacementEffects imports nothing at all, so this edge is one-way and cycle-free.
import { interveningIfParseable, evaluateInterveningIf } from "./interveningIf.js"; // STATE TRIGGERS (CR 603.8): the shared condition reader/evaluator. interveningIf imports ONLY gameState, so this edge is one-way and cycle-free.
import { ABILITY_WORD_LABEL_RE } from "./effects/textNormalize.js"; // CR 207.2c label list — the SINGLE copy, shared with the spell path (textNormalize is a zero-import leaf, so no cycle)
import { CR_CREATURE_TYPES } from "./effects/targeting.js"; // BC-1: closed creature-subtype vocabulary for the NEGATED-SUBTYPE batch filter (read ONLY inside parseBatchSubjectFilter — a function — so the triggers→targeting→spellEffects→triggers cycle stays init-safe: CR_CREATURE_TYPES is never referenced at module-init time)

function oracleOf(card) {
  return String(card?.oracle || card?.oracle_text || "");
}
function typeStr(card) {
  return String(card?.type || card?.type_line || "");
}

// SUBTYPE filter — a single creature subtype ("Dinosaur") OR a list ("Kraken, Leviathan, Octopus, or
// Serpent"). Parses "<A>, <B>, … or/and <C>" → array of capitalized subtypes; a single word → that word
// (back-compatible with the existing single-subtype scope). Rejects (→ null → the trigger stays Arbiter) a
// list containing a card-TYPE word (creature/permanent/artifact/…) since those would match every permanent
// (an over-fire); a real subtype list never includes them. Used so a multi-subtype tribal trigger (Spawning
// Kraken — "a Kraken, Leviathan, Octopus, or Serpent you control deals combat damage") matches ANY member.
// ⚠️ EVERY WORD HERE IS ONE THAT WOULD MINT A **VACUOUS FILTER** — a gate `subtypeFilterMatches` can never
// satisfy, so the card classifies NATIVE and the trigger never fires. That is the forbidden FP class, and it
// is invisible to the per-card tier diff (nothing MOVES — the card was already native and stays native).
// `probe-vacuous-subtype-filters.mjs` is the instrument that finds them: it derives the real subtype
// vocabulary from printed type lines and reports any minted filter absent from it. Run it after touching
// any path that mints a subtypeFilter.
//   • "commander" / "outlaw" are CR-defined qualities, NOT type-line words (CR 903.3 designation, CR 203.4c
//     umbrella). Both were live FPs found by that probe: Norn's Choirmaster #3286 and Keleth #6637 classified
//     native-trigger and fired ZERO on a board. Each now has a POSITIVE route below (commanderYouControl for
//     the first, the five-subtype expansion for the second) — the denylist is the backstop, not the fix.
const NON_SUBTYPE_FILTER_WORDS = new Set(["creature", "creatures", "permanent", "permanents", "artifact", "artifacts", "enchantment", "enchantments", "land", "lands", "token", "tokens", "spell", "spells", "player", "players", "card", "cards", "commander", "commanders", "outlaw", "outlaws"]);
// FIRST-WORD SELF-REF stopwords (classifyCondition) — a legendary "<First> the <Epithet>" name self-refers by
// its first word, but a name LEADING with one of these isn't using it as the self-name ("The Ur-Dragon" →
// "the" self-refers by the full name, already matched). Articles only; a real first-word self-name (Smaug,
// Gandalf, Atraxa-style space names) is never one of these. Lowercased (the candidate is lowercased upstream).
const FIRST_WORD_SELF_STOPWORDS = new Set(["the", "a", "an", "of", "and"]);
function parseSubtypeList(s) {
  const parts = String(s).split(/,|\bor\b|\band\b/).map((w) => w.trim()).filter(Boolean);
  if (!parts.length) return null;
  if (parts.some((w) => !/^[a-z]{3,}$/i.test(w) || NON_SUBTYPE_FILTER_WORDS.has(w.toLowerCase()))) return null;
  const caps = parts.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return caps.length === 1 ? caps[0] : caps;
}
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
function singularCreatureType(word) {
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

/**
 * A BATCHED trigger subject ("one or more <X>") → the equivalent SINGULAR subject phrase, or null.
 *
 *   "other Elves you control"        → "another elf you control"
 *   "artifacts you control"          → "an artifact you control"
 *   "tokens your opponents control"  → "a token your opponents control"
 *   "nontoken creatures"             → "a nontoken creature"
 *
 * The point is to let a batch arm REUSE the singular matchers rather than grow a parallel set of them, so
 * the batch form inherits the singular form's refusals as well as its capabilities. Callers must still
 * apply the batch's own gate (the once-per-turn rider) — this function only rewrites the noun phrase.
 *
 * A trailing CONTROLLER phrase is preserved verbatim: it is not part of the noun being singularized, and
 * "your opponents control" must not become "your opponent control".
 *
 * The head noun is de-pluralized through `singularCreatureType` (the closed-vocabulary singularizer) with a
 * short list of common CARD-TYPE nouns handled first — those are plain English plurals of words the engine
 * already names elsewhere (NON_SUBTYPE_FILTER_WORDS), not a guessed vocabulary. Anything whose head does not
 * resolve returns null → the caller builds nothing → Arbiter (a SAFE false-negative). A subject carrying a
 * LIST ("Humans and/or Warriors") returns null too: the singular matchers take one noun.
 */
const BATCH_HEAD_NOUNS = {
  creatures: "creature", tokens: "token", permanents: "permanent", artifacts: "artifact",
  enchantments: "enchantment", lands: "land", planeswalkers: "planeswalker", cards: "card",
};
function singularizeBatchSubject(subject) {
  const raw = String(subject).trim();
  // A subject LIST ("Humans and/or Warriors") — the singular matchers take one noun. ⚠️ MEASURED INERT:
  // mutating this line away changes NOTHING, because the delegated singular clause is refused downstream
  // anyway. Kept as an explicit early-out that states the intent at the point of rewriting, NOT sold as the
  // guard — the containment comes from the delegation, and the pin for it belongs to the downstream refusal.
  if (/\b(?:and|or)\b/.test(raw)) return null;
  const ctrlM = raw.match(/( you control| your opponents control| an opponent controls| you don't control)$/);
  const controller = ctrlM ? ctrlM[1] : "";
  let head = ctrlM ? raw.slice(0, -controller.length).trim() : raw;
  const other = /^other /.test(head);
  if (other) head = head.slice("other ".length);
  const words = head.split(/\s+/);
  const lastLc = words[words.length - 1].toLowerCase();
  const singularHead = BATCH_HEAD_NOUNS[lastLc] || singularCreatureType(lastLc);
  if (!singularHead) return null;
  const noun = [...words.slice(0, -1), singularHead].join(" ").toLowerCase();
  const article = other ? "another" : (/^[aeiou]/.test(noun) ? "an" : "a");
  return `${article} ${noun}${controller}`;
}

// Does a card's type line carry the subtype filter (single string OR any of a list)?
function subtypeFilterMatches(card, filter) {
  if (!filter) return false;
  const ts = typeStr(card);
  return Array.isArray(filter) ? filter.some((s) => ts.includes(s)) : ts.includes(filter);
}

// OUTLAW META-TYPE (CR 203.4c — "outlaw" is the umbrella for these five creature subtypes; NOT a type-line
// word). Mirrors layers.js's OUTLAW_SUBTYPES (kept local to avoid coupling triggers→layers beyond the existing
// import surface). Capitalized so it composes with subtypeFilterMatches' type-line substring check.
const OUTLAW_SUBTYPE_LIST = ["Assassin", "Mercenary", "Pirate", "Rogue", "Warlock"];

/**
 * SUBTYPE/PROPERTY-FILTERED BATCH combat-damage subject → a descriptor fragment the runtime can faithfully
 * gate on, or null (→ the trigger stays Arbiter, a SAFE false-negative). The subject is the text between
 * "one or more" and "you control" in a batch combat-damage condition. Returns AT MOST ONE of:
 *   - { subtypeFilter }      a creature SUBTYPE or list — "outlaws" expands to its five constituents (CR 203.4c);
 *                            a single/plural subtype word ("Goblins", "Dinosaur") → that capitalized subtype.
 *   - { batchArtifact: true }  "artifact creatures" — checked via "Artifact" in the type line (CR 205.2).
 *   - { batchEnchantment: true } "enchantment creatures" — checked via "Enchantment" in the type line.
 *   - { batchNontoken: true }  "(other) nontoken creatures" — checked via !card.token.
 * REJECTS (→ null) anything the engine can't reliably check: a color qualifier ("colorless creatures" — no
 * per-permanent color), a token qualifier ("creature tokens" — the connecting-creature set isn't tracked by
 * token-ness in the batch gate), or any unrecognized phrase. Pure; case-insensitive on the leading qualifier.
 */
function parseBatchSubjectFilter(subjectRaw) {
  const s = String(subjectRaw || "").trim().toLowerCase();
  // ARTIFACT / ENCHANTMENT creature batches (type-line containment, like the artifactYouControl ETB scope).
  if (s === "artifact creatures") return { batchArtifact: true };
  if (s === "enchantment creatures") return { batchEnchantment: true };
  // NONTOKEN creature batch (Rooftop Bypass; "other nontoken creatures" — Vodalian — the "other" is a no-op
  // for the batch gate since the source's own connection still satisfies "one or more"). Gated on !card.token.
  if (s === "nontoken creatures" || s === "other nontoken creatures") return { batchNontoken: true };
  // NEGATED-SUBTYPE creature batch (Keeper of Fables — "non-Human creatures you control deal combat damage
  // to a player, draw a card"): a creature that is NOT of the named subtype. Gated to a REAL creature type
  // (CR_CREATURE_TYPES — the closed vocabulary, per ENGINE-SCAFFOLD §6: validate against a closed set, never
  // a loose word). This is the load-bearing FP guard: a supertype / card-type word ("non-legendary",
  // "non-artifact") is NOT in CR_CREATURE_TYPES → null → Arbiter — because permanentTypes' subtypes never
  // carry a supertype, its negation would match EVERY creature (a runtime-vacuous, always-true filter — the
  // forbidden over-fire class). The runtime gate (batchDealerMatches) reads the dealer's subtypes layer-aware
  // and is changeling-aware (a changeling IS every creature type → EXCLUDED from "non-<subtype>"), reusing the
  // notSubtypeOrChangeling discipline (BLITZ BT-2). "nontoken" is handled above, so it never reaches here.
  const nonSubM = s.match(/^non-?([a-z]+) creatures?$/);
  if (nonSubM && CR_CREATURE_TYPES.has(nonSubM[1])) return { batchNotSubtype: nonSubM[1] };
  // OUTLAW meta-type (Olivia) — expand to the five constituent subtypes (OR semantics via subtypeFilterMatches).
  if (s === "outlaws" || s === "outlaw") return { subtypeFilter: OUTLAW_SUBTYPE_LIST };
  // COMMANDER batch subject (CR 903.3) — a DESIGNATION, so it needs its own gate rather than a subtypeFilter:
  // "Commander" appears in no type line, and minting it as a subtype produced a filter nothing could satisfy.
  // batchDealerMatches reads the dealer's isCommander stamp, the same field the per-attacker
  // commanderYouControl scope reads, so a CLONE of a commander correctly fails both (a copy is not a
  // commander, CR 707.2). No printed card carries this subject today; it exists so the plural form degrades
  // to a CORRECT batch rather than to a vacuous one, which is what it used to do.
  if (s === "commanders" || s === "commander") return { batchCommander: true };
  // BARE creature SUBTYPE(S) — a single word ("goblins"/"dinosaur") or a comma/or list, de-pluralized. Reuses
  // parseSubtypeList (which rejects card-TYPE words like "creatures" so the bare-creatures form never reaches
  // here — it's matched by the dedicated regex above). Singularize a trailing 's' per word so "goblins" →
  // "Goblin"; parseSubtypeList re-capitalizes and validates. A multi-word qualifier the regex below can't shape
  // (e.g. "colorless creatures", "creature tokens", "tapped creatures") falls through to null → Arbiter.
  // A trailing bare "creatures" after a MULTI-subtype list ("Ninja or Rogue creatures" — Prosperous Thief)
  // is redundant subject noise (the subtypes are creature subtypes); strip it so the list parses. Gated to
  // subjects that actually contain a list separator: a single qualifier + "creatures" ("colorless
  // creatures" — Glitch Interpreter, "tapped creatures") must stay UNSTRIPPED so the space-separated shape
  // test below rejects it exactly as before (the suite's uncheckable-filter guards pin this — a stripped
  // "colorless" would ride the single-word path into a subtype filter that can never match a type line:
  // a runtime-vacuous native, the forbidden FP class). AND the list words must not be color/state
  // QUALIFIERS: parseSubtypeList validates by blacklist, so a stripped "red or green creatures" /
  // "attacking or blocking creatures" would otherwise mint a subtype filter (["Red","Green"]) that can
  // never match a type line — the same vacuous-filter FP, one card away (skeptic-flagged; only
  // "Ninja or Rogue creatures" exists in the current corpus). Any qualifier word in the list → no strip
  // → the space-separated shape test rejects the subject → Arbiter (FN-safe).
  const NON_SUBTYPE_QUALIFIERS = /\b(?:white|blue|black|red|green|colorless|multicolored|monocolored|attacking|blocking|tapped|untapped|token|nontoken|legendary|enchanted|equipped|modified|snow|face-up|face-down)\b/;
  const listSubject = (/,| or | and /.test(s) && !NON_SUBTYPE_QUALIFIERS.test(s))
    ? s.replace(/\s+creatures$/, "")
    : s;
  if (/^[a-z]+(?:s)?(?:(?:,| or | and )[a-z]+(?:s)?)*$/.test(listSubject)) {
    const depluralized = listSubject.replace(/\b([a-z]{3,})\b/g, (w) => singularCreatureType(w) || w);
    const filter = parseSubtypeList(depluralized);
    if (filter) return { subtypeFilter: filter };
  }
  return null;
}

// Does a CONNECTING creature (a batch combat-damage dealer) match a subtype/property-filtered batch descriptor?
// `descriptor` carries exactly one of subtypeFilter / batchArtifact / batchEnchantment / batchNontoken (see
// parseBatchSubjectFilter). A bare batch descriptor (none of these set) matches ANY creature — the unfiltered
// "one or more creatures you control" form. Pure; reads only the dealer permanent's card.
function batchDealerMatches(descriptor, dealerPerm, state = null) {
  if (!dealerPerm?.card) return false;
  if (descriptor.subtypeFilter) return subtypeFilterMatches(dealerPerm.card, descriptor.subtypeFilter);
  if (descriptor.batchArtifact) return /Artifact/.test(typeStr(dealerPerm.card));
  if (descriptor.batchEnchantment) return /Enchantment/.test(typeStr(dealerPerm.card));
  if (descriptor.batchNontoken) return !dealerPerm.card.token;
  if (descriptor.batchCommander) return !!dealerPerm.card.isCommander; // CR 903.3 designation, not a type line word
  // NEGATED-SUBTYPE batch (Keeper of Fables — "non-Human creatures") — layer-4-aware subtypes UNIONED with
  // the changeling gate (CR 702.73a: a changeling IS every creature type, so it IS a Human and "non-Human"
  // EXCLUDES it — the widest exclusion; missing it would be the FP direction). Without state (defensive) the
  // dealer can't be verified → no match (an under-fire, never an over-fire). Identical shape to the
  // basilisk-touch notSubtypeOrChangeling partner gate.
  if (descriptor.batchNotSubtype) {
    if (!state) return false;
    if (permanentHasKeyword(state, dealerPerm.id, "changeling")) return false;
    const subs = (permanentTypes(state, dealerPerm.id)?.subtypes || []).map((x) => String(x).toLowerCase());
    return !subs.includes(descriptor.batchNotSubtype);
  }
  // WITH-KEYWORD batch (Quartzwood) — layer-aware, so an equipment/anthem-granted keyword counts, exactly
  // like the qualified-ETB keyword filter. Without state (defensive) the dealer can't be verified → no match
  // (an under-fire, never an over-fire).
  if (descriptor.batchKeyword) return state ? permanentHasKeyword(state, dealerPerm.id, descriptor.batchKeyword) : false;
  return true; // unfiltered bare batch — any connecting creature qualifies
}

// QUALIFIED-ETB KEYWORD-FILTER (Dragon Tempest "a creature you control with flying enters"; Waterkin Shaman;
// Arcades "with defender") — the SET of keywords the ETB filter may gate on. Restricted to keywords whose
// presence on the entering creature is RELIABLY checkable via permanentHasKeyword (printed at an ability-word
// position + layer-6 addKeyword grants + counters): the modeled combat keywords (COMBAT_KEYWORDS — the single
// source of truth) PLUS "defender" (a real, ability-word-position keyword permanentHasKeyword reads exactly;
// Arcades is the only live filter on it). The filter only needs to faithfully ANSWER "does the entering
// creature have <kw>?" — it does NOT enforce the keyword's gameplay — so any keyword permanentHasKeyword reads
// correctly is admissible. A scope-INEXPRESSIBLE quality ("with power equal to its toughness", "with the
// chosen rarity/name/border", "with flavor text" — the Ineffable Blessing / Symmetry Matrix family) is NOT in
// this set, so it never matches the keyword-filter parser below → the trigger stays UNDETECTED → Arbiter
// (CREED FN-safe — never an over-fire on a quality the engine can't check).
const FILTERABLE_ETB_KEYWORDS = new Set([...COMBAT_KEYWORDS.map((k) => k.toLowerCase()), "defender"]);
// Parse the keyword token from "a creature you control with <kw> enters" — returns the canonical lowercase
// keyword iff it's a single admissible keyword, else null (so a multi-word / inexpressible quality falls
// through to the FIX-TRIG-CONDITION "with …" reject → Arbiter). Anchored to the EXACT subject shape.
function parseEtbKeywordFilter(subject) {
  const m = String(subject).match(/^a creature you control with ([a-z' ]+)$/i);
  if (!m) return null;
  const kw = m[1].trim().toLowerCase();
  return FILTERABLE_ETB_KEYWORDS.has(kw) ? kw : null;
}
function isCreaturePerm(perm) {
  return /Creature/.test(typeStr(perm?.card));
}
// PLANESWALKER look-back gate (CR 700.4 / 704.5i) — used by the creatureOrPwYouControl dies scope so a
// dead PLANESWALKER (fed to the dies dispatch via checkPlaneswalkerDiesTriggers) matches a "a creature or
// planeswalker you control dies" watcher (Cruel Celebrant). Reads the look-back card's type line, like
// isCreaturePerm. A creature-front DFC with a PW back face is a CREATURE on the battlefield (it dies as a
// creature), so the broad /Planeswalker/ test here is only ever reached for a TRUE planeswalker dead-entry
// (checkPlaneswalkerDiesTriggers is fed only destroyZeroLoyaltyPlaneswalkers' output) — no DFC mis-gate.
function isPlaneswalkerPerm(perm) {
  return /Planeswalker/.test(typeStr(perm?.card));
}

// CHOSEN-TYPE membership (Kindred Discovery's "of the chosen type") — does `card` carry the chosen creature
// type? True when its type line includes the subtype word-bounded (CR 205.3 — subtypes live after the "—")
// OR the card is a Changeling (CR 702.73a — every creature type, so it ALWAYS counts). `chosenType` is the
// durable type picked at ETB and stored on the watching permanent; an unset/empty chosenType yields false
// (a SAFE no-op — never an over-fire on an unknown type, CLAUDE.md §1.2). Word-bounded so "Elf" matches
// "Creature — Elf Warrior" but not a substring; escaped for any regex-special subtype text.
function permHasChosenType(card, chosenType) {
  if (!chosenType || !card) return false;
  if (hasKeyword(card, "changeling")) return true;
  const ts = typeStr(card);
  const dash = ts.indexOf("—");
  const subtypes = dash === -1 ? "" : ts.slice(dash + 1);
  const esc = String(chosenType).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${esc}\\b`).test(subtypes);
}

function isLandPerm(perm) {
  return /Land/.test(typeStr(perm?.card));
}

// EQUIP-RIDER / Marvel-flavor labels (WAVE 4) — crossover-set flavor names that sit in the ability-word
// slot ("Genius Industrialist — Whenever Iron Man attacks, …"; "... Catch — At the beginning of combat …").
// They have NO rules meaning (like a CR 207.2c ability word), but unlike landfall/constellation/etc. they
// are arbitrary card-specific names, so they're enumerated EXPLICITLY rather than by an open-ended
// "<Word> — " strip — the corpus has 337 distinct real ability-word labels (Raid, Delirium, Metalcraft, …)
// many of which carry an intervening-if condition, so a blanket strip would mis-normalize hundreds of cards
// and drift the metric. Each label here is verified against oracle-index.json to be pure flavor with the
// trigger's condition written out in full after it. Stripping the label lets the boundary-anchored trigger
// regex see the bare "Whenever/At …" so the auto-attach (Catch) fires; cards whose RIDER is unmodeled
// (Iron Man's compound sac-tutor, Knuckles, Cap's Throw) still stay body-only (the effect, not the label,
// gates nativeness). Lowercased (the strip runs case-insensitively).
const FLAVOR_TRIGGER_LABELS = [
  "catch", "genius industrialist", "treasure hunter",
  // "heavy power hammer" is Aberrant's (Warhammer 40k) flavor ability-word label on its combat-damage
  // trigger ("Heavy Power Hammer — Whenever this creature deals combat damage to a player, destroy target
  // artifact or enchantment that player controls."). Pure CR 207.2c flavor with no rules meaning; unique to
  // Aberrant in the corpus (verified). Stripping it lets the boundary-anchored trigger regex see the bare
  // "Whenever" so the combat-damage destroy is detected; the effect's coverage is judged separately.
  "heavy power hammer",
];
const FLAVOR_LABEL_RE = new RegExp(
  // optional leading "... " (Cap's "... Catch"), then a flavor label, then the dash before a trigger keyword.
  `^(?:\\.\\.\\.\\s*)?(?:${FLAVOR_TRIGGER_LABELS.join("|")})\\s*[—–-]\\s*(?=(?:when|whenever|at)\\b)`,
  "gim",
);

/**
 * Strip a leading ability-word label that precedes a trigger keyword ("Landfall — Whenever …"). Ability
 * words (CR 207.2c) are flavor with no rules meaning; the label otherwise sits between the line start and
 * "Whenever", so the boundary-anchored trigger regex (here AND coverage.js's TRIGGER_SENTENCE_RE / residue
 * strip) never matches. Exported so the coverage metric normalizes IDENTICALLY — the shaped-sentence count
 * and the detected-trigger count must agree, or a landfall card mis-classifies. Handles the standard CR
 * 207.2c words PLUS an explicit set of crossover-set flavor labels (FLAVOR_LABEL_RE), each anchored on a
 * trailing trigger-keyword lookahead so it can only consume a true label, never real rules text.
 */
export function stripTriggerAbilityLabel(oracle) {
  // "treasure hunter" is Knuckles the Echidna's flavor ability-word label on its upkeep-win trigger
  // ("Treasure Hunter — At the beginning of your upkeep, …"). Like the others it's CR 207.2c flavor with
  // no rules meaning; stripping it lets the boundary-anchored trigger regex see the bare "At the beginning".
  // "enrage" (CR 207.2c, like landfall) is the ability-word label on the DAMAGE-RECEIVED family
  // ("Enrage — Whenever this creature is dealt damage, …"). Stripping it lets the boundary-anchored
  // trigger regex see the bare "Whenever". SHARED with coverage.js so the shaped-sentence count and the
  // detected-trigger count agree (else an enrage card mis-classifies).
  // "raid" (CR 207.2c) is the ability-word label on the attacked-this-turn family ("Raid — At end of combat
  // on your turn, if you attacked this turn, …" — Rose, Cutthroat Raider; "Raid — When this enters, if you
  // attacked …"). Stripping it lets the boundary-anchored shaped-sentence counter SEE the Raid trigger
  // sentence — load-bearing for CREED: without it, a Raid trigger whose event/effect is UNMODELED (Rose's
  // end-of-combat create-Junk-per-opponent-attacked) is hidden from the shaped count, so a SEPARATE modeled
  // ability (Rose's "sacrifice a Junk → add {R}") could mis-credit the whole card native while the Raid
  // ability silently does nothing. Stripping can only RAISE the shaped count toward the true total (it never
  // hides a trigger), so it's strictly FN-safe + closes the false-positive. A Raid trigger that IS modeled
  // (a bare ETB/upkeep effect) stays native exactly as before — the strip only reveals it to the counter.
  // "flurry" (CR 207.2c) is the ability-word label on the SECOND-SPELL family ("Flurry — Whenever you cast
  // your second spell each turn, …" — Cori Mountain Stalwart, Devoted Duelist, Wingblade Disciple). Every one
  // of the 14 corpus "Flurry —" cards writes the full "cast your second spell each turn" trigger after the
  // label with NO intervening-if (BLITZ CC-1 corpus scan), so stripping lets the boundary-anchored regex see
  // the bare "Whenever" and the existing castSecond detector routes it. "flurry of blows" (Monk of the Open
  // Hand) and "eukrasia" (Alphinaud Leveilleur, FIN) are the same second-spell label under card-specific /
  // newer-set flavor names — not in this CR snapshot's 207.2c list, but corpus-verified pure flavor (the
  // trigger is written out in full after each), so they strip on the same FN-safe + FP-closing basis. Ordered
  // longest-first so "flurry of blows" is consumed whole before the bare "flurry" alternative can partial-match.
  // "opus" (CR 207.2c) is the ability-word label on the cast-a-spell family ("Opus — Whenever you cast an
  // instant or sorcery spell, …" — Molten-Core Maestro). Stripping it reveals the cast trigger to the shaped
  // count — same FN-safe + FP-closing basis: without it, Molten-Core Maestro's UNMODELED Opus trigger (the
  // "if five or more mana was spent … add {R} equal to power" conditional) was hidden, and its lone "add {R}"
  // clause got MIS-READ as a standing mana source → a phantom-mana native-mana false positive. Revealing the
  // trigger drops the card to body-only (correct); a modeled Opus trigger would stay native, revealed to the
  // counter. (Director FP-removal, 2026-07-17 — CC-1 census surfaced it, deferred to keep its slice LOST=0.)
  // "lieutenant" (CR 207.2c, 2018 Commander cycle) is the ability-word label on the commander-control family
  // ("Lieutenant — At the beginning of combat on your turn, if you control your commander, …" — Loyal Drake/
  // Subordinate/Apprentice/Guardian, Siege-Gang Lieutenant, Ironwill Forger; also gates the "as long as"
  // continuous-static half of the same cycle, unrelated to THIS trigger-detection strip). Stripping it lets
  // the boundary-anchored trigger regex see the bare "At the beginning" so YOU_CONTROL_YOUR_COMMANDER_RE
  // (interveningIf.js, added the same slice) can evaluate the condition.
  return String(oracle || "")
    // The OPTIONAL PARENTHETICAL is a flavour name attached to the label itself — "Raid (the Fridge) —"
    // (Michelangelo, the Heart). It is still CR 207.2c flavour with no rules meaning, and the lookahead
    // structure is unchanged: the strip only ever consumes label-then-dash, never rules text. Corpus-checked
    // before widening — exactly ONE card in the index prints this shape, so the risk of swallowing something
    // meaningful is not hypothetical-but-unknown, it is enumerated.
    // "imprint" is in the SAME CR 207.2c ability-word list as landfall/enrage/raid/flurry/opus/lieutenant
    // above — verified in knowledge/mtg-judge/data/cr/cr_current.json, which lists it by name in 207.2c.
    // (It is NOT a keyword ability; I had it wrong as 702.61, which is Split Second.) Unstripped, the label
    // sat between the line start and "When", so the boundary-anchored trigger regex never matched and ALL 29
    // corpus imprint cards had their ETB invisible — measured: even "Imprint — When this artifact enters,
    // draw a card." detected nothing. Same FN-safe + FP-closing basis as its siblings.
    // ALLIANCE · DELIRIUM · METALCRAFT · THRESHOLD (added 2026-07-30) — the same CR 207.2c basis as every
    // sibling above, verified by reading the rule out of knowledge/mtg-judge/data/cr/cr_current.json rather
    // than from memory: 207.2c names them explicitly and states ability words "have no special rules meaning".
    //
    // ⛔ THE CONDITION IS ALWAYS WRITTEN OUT, WHICH IS WHY THIS IS LOSSLESS — checked on the carriers, not
    // assumed from the rule: "Delirium — IF THERE ARE FOUR OR MORE CARD TYPES among cards in your graveyard,
    // …" · "Metalcraft — When this creature enters, IF YOU CONTROL THREE OR MORE ARTIFACTS, …" · "Threshold —
    // IF THERE ARE SEVEN OR MORE CARDS in your graveyard, …". A label that CARRIED its condition would be
    // dropped by this strip and the effect would apply unconditionally — an over-claim. None do.
    // "corrupted" is deliberately ABSENT: it is not in 207.2c in the bundled CR, so it is not claimed.
    //
    // ⭐ SECOND PASS (same day) — rally · morbid · ferocious · survival · descend 4 · formidable · paradox ·
    // fateful hour · hellbent · undergrowth · infusion · vivid · void. Same 207.2c basis, same check applied
    // card-by-card rather than assumed: every carrier writes its own gate out ("Morbid — …IF A CREATURE DIED
    // THIS TURN…", "Hellbent — …IF YOU HAVE NO CARDS IN HAND…", "Fateful hour — IF YOU HAVE 5 OR LESS LIFE…",
    // "Rally — WHENEVER this creature or another Ally you control ENTERS…"), so the label carries nothing.
    // ⛔ ONLY LABELS WITH MEASURED FLIPS WERE ADDED. 32 more 207.2c words are in the corpus and measured ZERO
    // (adamant, battalion, channel, coven, domain, converge …). Adding them would be FN-safe but UNTESTED —
    // untested additions to a strip that can only ever loosen are how a list grows past what anyone checked.
    //
    // ⭐ RE-MEASURED 2026-08-01 AND THE ZERO HELD. Every remaining CR 207.2c label that reaches a trigger word
    // in this corpus, with its carrier count: Domain 64 · Converge 28 · Battalion 22 · Coven 20 · Inspired 19
    // · Revolt 18 · Adamant 18 · Repartee 14 · Celebration 12 · Kinship 12 · Will of the council 12 ·
    // Addendum 10 · Chroma 9 · Council's dilemma 9 · Disappear 9 · Eminence 9 · Parley 9 · Pack tactics 8 ·
    // Tempting offer 8 · Fathomless descent 7 · Join forces 5 · Secret council 5. **TOTAL FLIPS: 0.**
    //
    // ⚠️ THE TRAP THAT ALMOST TURNED THIS INTO A SLICE, written down because the headline number is seductive:
    // 469 parked cards sit behind an unstripped label, and that figure means nothing by itself. Stripping a
    // label only REVEALS a trigger to the counter; a revealed trigger whose event or effect is unmodeled
    // leaves the card exactly as parked as it was. PARKED-BEHIND-A-LABEL IS NOT WOULD-FLIP-IF-STRIPPED.
    // Measure the flip, never the carrier count.
    //
    // The label vein is therefore EXHAUSTED for gains — these cards are parked on their TRIGGERS, not their
    // labels. A future slice that models one of those trigger families should add the matching label in the
    // SAME slice, with its flips measured there.
    //
    // ⛔ AND THE REJECTS ARE NOT CANDIDATES, they are hazards: "Max speed", "Solved", "Corrupted" and Saga
    // chapter markers ("III —") all LOOK like ability-word labels and all carry REAL rules meaning. None
    // appear in 207.2c. Stripping one would apply a gated effect unconditionally — a forbidden false
    // positive. The rule list in the bundled CR is the gate; a label that looks flavourful is not enough.
    .replace(ABILITY_WORD_LABEL_RE, "")  // ⭐ THE SHARED CR 207.2c list (effects/textNormalize.js) — one copy, so the trigger path and the spell path cannot drift
    .replace(FLAVOR_LABEL_RE, "");
}

// ─── Detection ────────────────────────────────────────────────────────────────

/**
 * Is `sentence` a FOLLOW-UP that belongs to the trigger just matched (vs a separate ability)? A
 * triggered ability's WHOLE effect lives on ONE oracle line — "each opponent loses 2 life. You gain
 * 2 life and draw a card." (Shroudstomper), "create a 0/0 token. Put a +1/+1 counter on it."
 * (Recon Craft Theta), "mill a card. If a land card was milled this way, you gain 2 life." (Loafing
 * Giant) — while DISTINCT abilities are newline-delimited. So on the SAME line, every sentence after
 * the trigger's first IS part of its effect; the caller walks only up to the first newline. The
 * sole same-line sentences that are NOT this trigger's effect are a SECOND trigger (When/Whenever/At)
 * or an activated ability (`{cost}: …`), which we exclude here. Appending the whole effect lets the
 * all-or-nothing parser see it all: a modeled follow-up resolves too; an unmodeled one drops the
 * WHOLE program to low → Arbiter. Never a partial (CR-faithful: a trigger does all of its effect or,
 * when we can't model it, none of it — routed to the Arbiter).
 */
function isFollowupSentence(sentence) {
  const t = String(sentence).trim().toLowerCase();
  if (!t) return false;
  if (/^(when|whenever|at)\b/.test(t)) return false; // a SECOND trigger, not this one's effect
  // A SEQUENTIAL / CONDITIONAL continuation ("Then if it has eight or more …, remove all … and create eight …
  // tokens … with \"{T}: Add …\"" — Replicating Ring) is part of THIS trigger's effect even though it embeds a
  // quoted (token-)ability whose colon would otherwise look like a separate activated ability. Appending it
  // lets the all-or-nothing parser see the WHOLE compound effect → it parses LOW (the conditional token-maker
  // is unmodeled) → the trigger stays body-only, instead of routing the truncated lead ("put a counter …")
  // natively and SILENTLY DROPPING the payoff (a CREED FP). A "then"/"if"-led sentence is never itself a
  // card-level activated ability (those never begin with then/if), so this can't swallow a real one.
  if (/^(then|if)\b/.test(t)) return true;
  // TOKEN GRANT (TK-1, 2026-07-18) — "It has \"<ability>\"" / "They have \"<ability>\"" grants the ability
  // to the token THIS effect just created, so it is part of this trigger's effect. The colon INSIDE the
  // quoted ability tripped the generic activated-ability guard below, which dropped the sentence and left
  // the trigger claiming HIGH while minting a VANILLA token — a live false positive, not a safe park
  // (Incubator Drone's Eldrazi Scion and Dread Drone's Spawn could never be sacrificed for mana, so the AI
  // never ramped off them). The parser already models the whole shape (create-token + tokenOracle, verified
  // HIGH), so appending it either binds the ability correctly or re-gates LOW → Arbiter. Anchored to the
  // grant shape, so a genuine card-level activated ability (never led by "it has"/"they have") still breaks
  // the loop below.
  if (/^(it has|they have)\s+"/.test(t)) return true;
  if (t.includes(":")) return false;                  // an activated ability (or a quoted granted-ability descriptor — modeled by its own atom)
  return true;                                         // any other same-line sentence continues the effect
}

/**
 * REFLEXIVE TRIGGER fold (CR 603.7 — a delayed/reflexive ability created by the resolution of a prior
 * effect). Recognize a "When you do[ this/so], <effect>" sentence whose reflexive SOURCE is a just-resolved
 * "roll a d20" (Ancient Bronze/Brass Dragon: "…roll a d20. When you do, <payoff>, where X is the result").
 * Returns the bare <effect> (the "When you do," prefix stripped) to FOLD into the rolling trigger's program,
 * or null when the accumulated effect doesn't END in a roll.
 *
 * Why gated to the roll source (CREED, CLAUDE.md §1.2): the roll is MANDATORY and choice-free, so the
 * reflexive ALWAYS fires — folding <effect> as the next clause of a sequential program (the roll stamps
 * state.diceRoll; the payoff reads it via the diceResult count) is faithful. An OPTIONAL / cost-gated
 * reflexive ("you may pay {1}{R}. When you do, …"; "you may sacrifice a creature. When you do, …") must
 * NOT be folded — a sequential fold would fire the payoff even after the action is declined/failed, a
 * confident WRONG play. Those keep returning false here (the accumulated effect ends in the optional action,
 * not a roll) → the sentence is treated as a separate trigger (isFollowupSentence rejects it) and the whole
 * card stays body-only / Arbiter (a SAFE false-negative). Whole-card safety also holds downstream: the
 * parser re-gates the folded program (an unmodeled <effect> → LOW → Arbiter) and the diceResult CREED gate
 * (parser.diceRollSequenceOk) independently pairs every roll with its payoff. The single corpus cards this
 * folds today are the two reflexive Ancient Dragons (verified by a "roll a d20. when you do" sweep).
 */
const ROLL_REFLEXIVE_SOURCE_RE = /roll a d20\.?\s*$/i;
function reflexiveEffectAfterRoll(accumulatedEffect, sentence) {
  if (!ROLL_REFLEXIVE_SOURCE_RE.test(String(accumulatedEffect).trim())) return null;
  const m = String(sentence).trim().match(/^when you do(?:\s+this|\s+so)?\s*,?\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * MODAL TRIGGER effect extraction (CR 700.2). A modal triggered ability's effect is a "choose one/two/
 * one or more/… —" lead-in FOLLOWED by bulleted (•) mode lines. The main trigger regex captures only up
 * to the FIRST period, which falls INSIDE the first bullet — so the naive effectClause keeps just mode 0
 * and silently drops the rest (a forbidden partial). When the trigger's effect begins with a modal
 * lead-in, re-extract the WHOLE block from the raw oracle: the lead line + every consecutive `•` line.
 * The block ends at the first line that isn't a bullet (a separate ability) or end-of-text. parseEffectClause
 * then sees all modes, so the parser's all-or-nothing modal gate (every mode modeled → HIGH, else LOW)
 * applies to the COMPLETE card — never a half-resolved modal. Returns the full block, or null if the effect
 * isn't a modal lead-in (caller keeps the naive clause). Pure.
 */
const MODAL_LEAD_RE = /^choose (?:one|two|three|four|five|one or more|one or both|up to (?:one|two|three|four|five))\b\s*[—-]/i;
const MODAL_LEAD_SCAN_RE = /\bchoose (?:one|two|three|four|five|one or more|one or both|up to (?:one|two|three|four|five))\b\s*[—-]/i;
function extractModalEffectBlock(oracle, searchFrom, effectClause) {
  if (!MODAL_LEAD_RE.test(String(effectClause || "").trim())) return null;
  const tail = oracle.slice(searchFrom);
  const m = MODAL_LEAD_SCAN_RE.exec(tail);
  if (!m) return null;
  const start = searchFrom + m.index;
  const lines = oracle.slice(start).split("\n");
  const block = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim().startsWith("•")) block.push(lines[i]);
    else break;
  }
  // Need at least one bullet line — a bare "choose one —" with no modes isn't a modal effect we can resolve.
  return block.length > 1 ? block.join("\n") : null;
}

/**
 * Split "<condition>, <effect>" (the text after the leading keyword, sans the
 * trailing period) into its parts, peeling off an "if <cond>," intervening
 * clause (CR 603.4) when present.
 */
function splitTriggerSentence(inner) {
  // EVENT_VERBS: verbs that appear in trigger CONDITIONS. If the text before the first comma
  // lacks one, that comma is inside a card name ("Pantlaza, Sun's Vanguard or another Dinosaur
  // you control enters …") — advance to the next comma that yields an event-verb condition.
  // MILL-ON-EVENT (Wave 3b): "milled"/"mills" are condition verbs ("one or more nonland cards are milled",
  // "a player mills a nonland card"). Without them, the advance-past-name-commas loop below would wrongly
  // skip the real condition boundary — for "one or more nonland cards are milled, draw a card, …" the FIRST
  // comma's left side lacks a (pre-mill) event verb, so the loop would advance to the comma after "draw a
  // card" (matching "draws? a"), swallowing the first effect sentence INTO the condition. Listing the mill
  // verbs anchors the split at the correct comma.
  // "dealt" (ENRAGE / DAMAGE-RECEIVED: "this creature is dealt damage") is a CONDITION verb — without it
  // the advance-past-name-commas loop would skip the real "…is dealt damage," boundary and swallow the
  // first effect sentence into the condition. (Distinct from "deals" — that's the SOURCE-side event.)
  const hasEventVerb = (s) => /\b(?:enters|dies|attacks|blocks|deals|dealt|casts?|sacrifice[sd]?|gain(?:s)? life|draws? (?:a|your)|beginning|milled|mills)\b/.test(s);
  let splitIdx = inner.indexOf(",");
  if (splitIdx === -1) return null;
  if (!hasEventVerb(inner.slice(0, splitIdx))) {
    let pos = splitIdx + 1;
    while (pos < inner.length) {
      const next = inner.indexOf(",", pos);
      if (next === -1) break;
      if (hasEventVerb(inner.slice(0, next))) { splitIdx = next; break; }
      pos = next + 1;
    }
  }
  // COMBAT-EVENT-LIST guard (CR 603.2) — a comma/or list of combat-and-target events ("attacks, blocks, or
  // becomes the target of a spell, …" — Giggling Skitterspike) puts the first comma right after "attacks",
  // so the loop above stops there and TRUNCATES the list — leaving condition "…attacks" and swallowing the
  // remaining events ("blocks, or becomes the target of a spell") into the effect. classifyCondition would
  // then read it as a bare "attacks" trigger and SILENTLY DROP the other event(s) — a confident WRONG partial
  // (THE CREED). Advance splitIdx to the END of the event list so the WHOLE compound condition reaches
  // classifyCondition, where the "attacks or blocks" / "attacks or becomes the target of a spell" compound
  // guards leave it UNDETECTED → Arbiter (a SAFE false-negative). Gated to the case where the truncated
  // prefix ends on a bare combat verb AND the text after the comma continues with another combat/target
  // event token ("blocks" / "becomes the target"), optionally after "or"/"," — so a normal "…attacks, draw a
  // card" (effect after the event) is untouched. Advances one list element at a time until the continuation
  // stops. Placed before the cast-list guard so the two never contend (a combat list has no "cast"/"spell").
  {
    const CONT_RE = /^\s*(?:,?\s*(?:or\s+)?)(?:blocks|becomes\s+blocked|becomes\s+the\s+target\s+of\s+a\s+spell)\b/i;
    while (splitIdx !== -1 && /\b(?:attacks|blocks|becomes\s+the\s+target\s+of\s+a\s+spell)\s*$/i.test(inner.slice(0, splitIdx).trim())
           && CONT_RE.test(inner.slice(splitIdx + 1))) {
      const next = inner.indexOf(",", splitIdx + 1);
      if (next === -1) break;
      splitIdx = next;
    }
  }
  // TYPED-CAST-LIST guard — a "cast a <A>, <B>, or <C> spell" condition (Sram: "cast an Aura, Equipment, or
  // Vehicle spell") puts a comma INSIDE the condition, before the word "spell". The prefix "you cast an
  // Aura" already has the "cast" event verb, so the loop above stops at that first comma and TRUNCATES the
  // type list — leaving a partial condition + a garbled effect. The cast condition only ends at "…spell", so
  // when the chosen split prefix is a cast clause that hasn't reached "spell" yet, advance to the first
  // comma AFTER "spell". Gated to the cast case (prefix has "cast", lacks "spell"); other triggers unchanged.
  if (/\bcasts?\b/.test(inner.slice(0, splitIdx)) && !/\bspell\b/.test(inner.slice(0, splitIdx))) {
    const spellIdx = inner.search(/\bspell\b/);
    if (spellIdx !== -1) {
      const afterSpell = inner.indexOf(",", spellIdx);
      if (afterSpell !== -1) splitIdx = afterSpell;
    }
  }
  const condition = inner.slice(0, splitIdx).trim();
  let rest = inner.slice(splitIdx + 1).trim();
  let interveningIf = null;
  if (/^if\b/i.test(rest)) {
    const nextComma = rest.indexOf(",");
    if (nextComma !== -1) {
      interveningIf = rest.slice(0, nextComma).replace(/^if\s+/i, "").trim();
      rest = rest.slice(nextComma + 1).trim();
    }
  }
  return { condition, effectClause: rest, interveningIf };
}

/** The subject phrase before an event verb ("a creature", "another creature you control"). */
function subjectBefore(condition, verb) {
  return String(condition).split(new RegExp(`\\b${verb}\\b`))[0].trim();
}

/**
 * Map an etb/dies subject phrase to a creature-scope `scopeMatches` ENFORCES, or null. Only the
 * shapes the matcher can faithfully restrict are modeled — bare ("a creature" / "another
 * creature") + the controller restriction ("you control" / "an opponent controls" / "you don't
 * control"). A subject carrying anything else (a keyword/type/power filter, "named", "token",
 * "nontoken") returns null → the trigger is left UNDETECTED → safe no-op (never an over-fire on a
 * restriction we can't check, CLAUDE.md §1.2). "another … an opponent controls" === the opponent
 * scope (an opponent's creature is never the source, so "another" is redundant there).
 */
function creatureSubjectScope(subj) {
  switch (subj) {
    case "a creature": return "eachCreature";
    case "another creature": return "eachOtherCreature";
    case "a creature you control": return "creatureYouControl";
    case "another creature you control": return "otherCreatureYouControl";
    // All four spell the SAME set: a creature controlled by any player who is your opponent. "your opponents
    // control" is the plural templating of "an opponent controls" — in a game with N opponents a creature
    // satisfies one phrasing exactly when it satisfies the other, so they share a scope rather than
    // sprouting a second one. It was the only member of this family with no route at all (found by the
    // one-diff probe: the singular sibling was modeled and this was not), which is what parked
    // Spiteful Banditry #2356.
    case "a creature an opponent controls":
    case "another creature an opponent controls":
    case "a creature your opponents control":
    case "another creature your opponents control":
    case "a creature you don't control": return "creatureOpponentControls";
    default: return null;
  }
}

/**
 * Classify a trigger condition into { event, scope, whose } or null. selfRef is
 * "this <permanent>" or the card's own name. The CR 603.6d static guard makes
 * "enters tapped / enters with / as ~ enters" NOT an etb trigger.
 */
function classifyCondition(condRaw, cardName, cardType) {
  const c = condRaw.toLowerCase().trim();
  // TURNED-FACE-UP (morph / megamorph / disguise flip, CR 707.9) — a PURE "…is turned face up" trigger fires
  // ONLY when a FACE-DOWN permanent is turned face up, an event the engine never reaches (it hard-casts every
  // card face UP, never face-down-then-flip). So on the engine's play the effect never happens; detecting it
  // would MODEL an effect that can't fire. Worse, a "…is turned face up, until end of turn, whenever <X>, <Y>"
  // DELAYED-SETUP wrapper is mis-split by splitTriggerSentence (the "turned face up" + "until end of turn"
  // clauses carry no event verb, so the split skips past them to the INNER "<X>" event) — so the inner trigger
  // would be read as a PERMANENT one, a CREED false positive (Mistway Spy: "…whenever a creature you control
  // deals combat damage to a player, investigate"). Leave it UNDETECTED (return null): the shaped trigger
  // sentence then out-runs the detected count in allTriggerSentencesModeled → the card stays body-only. The
  // COMPOUND "enters or is turned face up" (Gadget Technician, Rakish Scoundrel) has "enters" in its lead clause
  // and is EXCLUDED — it routes as a normal ETB, which DOES fire on the face-up hard cast (correctly modeled).
  const firstCondClause = c.split(",")[0].trim();
  if (/\bis turned face up$/.test(firstCondClause) && !/\benters?\b/.test(firstCondClause)) return null;
  // BECOMES-MONSTROUS (CR 701.32d — SHELF S7, the Alpha Deathclaw lift): the event now EXISTS —
  // applyMonstrosity fires checkBecomesMonstrousTriggers on the real transition, and the compound
  // "enters or becomes monstrous" splits via DISJUNCTION_MONSTROUS into two sentences pre-detection.
  // Handled below (after selfRef is computed): the SELF form detects; every other monstrous shape
  // (another-creature watchers etc.) still parks via the explicit null there.
  const nameL = String(cardName || "").toLowerCase();
  // SHORT-NAME SELF-REF (CR 201.4) — a LEGENDARY card refers to itself by the portion of its name before
  // the first comma ("Pantlaza" for "Pantlaza, Sun-Favored"). The full-name match below misses that, so a
  // self-trigger templated with the short name (the standard for legends) goes UNDETECTED → the whole card
  // wrongly routes to the Arbiter. Match the short name word-bounded (len >= 3), gated to legendary to keep
  // a common-word first name (rare on non-legends) from over-matching unrelated condition text. Exposed by
  // Pantlaza, Sun-Favored ("Whenever Pantlaza or another Dinosaur you control enters …").
  const isLegendary = /legendary/i.test(String(cardType || ""));
  const shortName = isLegendary ? nameL.split(",")[0].trim() : "";
  const shortNameRef = shortName.length >= 3 && shortName !== nameL
    && new RegExp(`\\b${shortName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(c);
  // FIRST-WORD SELF-REF (CR 201.4) — a LEGENDARY whose name has NO comma but DOES have a space (the
  // "<First> the <Epithet>" style — "Smaug the Magnificent", "Gandalf the Grey") refers to itself by its
  // FIRST word ("Whenever Smaug attacks, he deals …"). The comma-short-name branch above can't see it (its
  // split is comma-only, so shortName === full name → no match), so such a self-trigger goes UNDETECTED →
  // the whole card wrongly routes to the Arbiter. Take the first whitespace token, gated tightly to keep an
  // article / common word from over-matching unrelated condition text: legendary, ≥4 chars, NOT a leading
  // stopword (so "The Ur-Dragon" → "the" never matches — its self-ref is the full name, already handled),
  // distinct from the full name, and present word-bounded in the condition. Conservative by design (a false
  // negative is SAFE; a false positive is forbidden — CLAUDE.md §1.2).
  const firstWord = isLegendary && !nameL.includes(",") && /\s/.test(nameL) ? nameL.split(/\s+/)[0] : "";
  // "<Word> the <Epithet>" names (Zur the Enchanter — BLITZ TUT-1) admit a THREE-letter first word: the
  // " the " infix is the canonical WotC short-name style, so the over-match risk the ≥4 gate guards
  // against (an arbitrary short common first word) doesn't apply — the stopword gate still holds (so
  // "The Ur-Dragon" → "the" never matches). Every other no-comma name keeps the ≥4 gate unchanged.
  const theEpithetName = /^\S+\s+the\s+\S/.test(nameL);
  const firstWordRef = firstWord.length >= (theEpithetName ? 3 : 4) && firstWord !== nameL && !FIRST_WORD_SELF_STOPWORDS.has(firstWord)
    && new RegExp(`\\b${firstWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(c);
  const selfRef = /\bthis\b/.test(c) || (nameL && c.includes(nameL)) || shortNameRef || firstWordRef;

  // ===== DEALT-BY LIFEGAIN LINK (BLITZ SL-1 — Zebra Unicorn / Sunhome Enforcer) ===== the SELF forms
  // "this creature deals [combat] damage" (payoff "you gain that much life"). COVERAGE-ONLY like rampage:
  // checkDealtByTriggers is the sole firing site (reading dealtByLinkOf per damage event at BOTH damage
  // paths); this descriptor exists so the sentence counts + routes. The combat-only variant is honored at
  // the fire sites (combatOnly rides the reader, not this descriptor).
  if (/^this creature deals (?:combat )?damage$/.test(c)) {
    return { event: "dealtBy", scope: "self", whose: "any" };
  }

  // ===== LEAVES-SELF (BLITZ LV-1, CR 603.6c "leaves the battlefield" — ANY exit) ===== the SELF form
  // only ("this creature/artifact/enchantment/permanent leaves the battlefield" — the split half of
  // "enters or leaves the battlefield"). Fired by checkLeavesTriggers off the leave look-back for EVERY
  // exit (graveyard, exile, bounce, tuck) — unlike the graveyard-gated "ltb" self-PiG event. A watcher
  // form ("another creature you control leaves …") or a restricted subject stays UNDETECTED → Arbiter.
  // ⓘ THE RE-WORDED SELF FORM ("this leaves the battlefield", no noun) IS DELIBERATELY NOT ACCEPTED HERE,
  // and this note exists so the next reader doesn't "fix" it without re-measuring. Scryfall's templating
  // update drops the noun from self-references, and the other self anchors in this file (enters / dies /
  // attacks / deals combat damage) already take both forms — only this one and becomes-tapped below do not.
  // ⛔ BUT A CORPUS SWEEP ON 2026-08-05 FOUND **ZERO** REAL CARRIERS: strip every parenthetical first and
  // the short form appears on NO card's rules text. Its only occurrences are inside champion REMINDER text
  // (stripped at the head of detectTriggers). Widening the anchor would therefore be code no card can
  // exercise — unverifiable against the corpus — and the miss it guards is a SAFE false-negative, which the
  // CREED tolerates. Ship it when a carrier exists, not before.
  // THE PATCH, when that day comes: /^this(?: creature| artifact| enchantment| permanent)? leaves the
  // battlefield$/ here, and `|| subj === "this"` in the becomes-tapped self-subject test below. Re-run the
  // sweep after any bulk Scryfall refresh — 121 long-form carriers migrate as sets are re-printed.
  if (/^this (?:creature|artifact|enchantment|permanent) leaves the battlefield$/.test(c)) {
    return { event: "leavesSelf", scope: "self", whose: "any" };
  }

  // ===== BECOMES-MONSTROUS (CR 701.32d — SHELF S7) ===== the SELF form only ("this creature / <name>
  // becomes monstrous", incl. the split half of "enters or becomes monstrous" — Alpha Deathclaw).
  // applyMonstrosity fires checkBecomesMonstrousTriggers exactly once, on the not-yet-monstrous
  // transition. ANY other monstrous shape (a watcher scoped to other creatures, a restricted subject)
  // stays UNDETECTED → Arbiter (a SAFE FN, never a partial fire).
  if (/\bbecomes monstrous\b/.test(c)) {
    const subj = c.replace(/\s+becomes monstrous\s*$/, "").trim();
    const isSelfSubj = subj === "this creature" || (nameL && subj === nameL)
      || (shortName && subj === shortName) || (firstWord && subj === firstWord);
    if (selfRef && isSelfSubj) return { event: "becomesMonstrous", scope: "self", whose: "any" };
    return null;
  }

  // ===== COMPOUND self-event guard (CREED, CLAUDE.md §1.2) ===== A condition that names TWO trigger
  // events — "enters or leaves the battlefield" (Brandywine Farmer), "enters or dies" (Vinereap Mentor),
  // "enters or attacks" (Grave Titan — makes its Zombies on ETB only, never on attack), "enters or is put
  // into a graveyard" (Ichor Wellspring / Servo Schematic — the artifact-recursion family), or an embedded
  // second when-clause "dies and when you discard this card" (Bartered Cow) — would be TRUNCATED by the
  // single-event branches below to just the FIRST verb, silently DROPPING the other half (the trigger
  // would fire on only one of the two events — a confident WRONG partial). Until compound trigger events
  // are modeled, leave it UNDETECTED: the trigger-sentence count then mismatches in
  // allTriggerSentencesModeled and the whole card routes to the Arbiter (a SAFE false-negative), mirroring
  // the attacks-or-blocks / becomes-blocked guards below. FIX-TRIG-COMPOUND (Rod QA #1): the original tally
  // counted only enters/dies/leaves, so "enters or attacks" (Grave Titan) and "enters or is put into a
  // graveyard" slipped through (eventVerbs==1) — attacks/blocks/put-into-graveyard are now counted too. A
  // single-event "attacks"/"blocks"/etc. stays at eventVerbs==1 and resolves normally below.
  // BECOMES-TAPPED (BLITZ TR-1) joins the compound tally: a "becomes tapped" half compounded with ANY other
  // event verb ("attacks or becomes tapped", "enters or becomes tapped") must PARK — the single-event branches
  // would detect only the first verb and silently drop the tap half (a CREED false positive). A bare
  // single-event "becomes tapped" stays at eventVerbs==1 and reaches the SELF detector below.
  const eventVerbs = [/\benters\b/, /\bdies\b/, /leaves the battlefield/, /\battacks\b/, /\bblocks\b/, /put into a graveyard/, /\bbecomes tapped\b/]
    .filter((re) => re.test(c)).length;
  if (eventVerbs >= 2) return null;
  if (/\b(?:and|or)\s+when(?:ever)?\b/i.test(c)) return null; // an embedded second trigger clause

  // ===== DEATH-DRAIN — compound self-subject, creature UNION (carve-out BEFORE the "or another" rejects) =====
  // "this creature/<name> or another creature [you control] dies" is the union { self } ∪ { other creatures
  // [you control] } = EXACTLY the bare "a creature [you control] dies" event (CR 603.6e) — so it maps to the
  // very scope+effect path Bastion of Remembrance / Dictate of Erebos already resolve natively (aristocrats
  // drains: Blood Artist, Zulaport Cutthroat, Butcher of Malakir, …). The general guards below reject all
  // "or another" (a partial-fire risk in the open-ended case); this recognizes ONLY the clean creature-only
  // union and maps it to the equivalent enforceable scope. CREED: the subject must reduce EXACTLY to the
  // creature union — ANY extra type ("or planeswalker"/"or artifact"), keyword, power, or named/with/while/
  // during restriction falls through to the reject and stays on the Arbiter (Cruel Celebrant's "or
  // planeswalker" half is intentionally NOT modeled here). Dies only — the etb union stays deferred.
  if (selfRef && /\bdies\b/.test(c) && /\bor another creature\b/.test(c)) {
    const subj = subjectBefore(c, "dies");
    if (/^(?:this [a-z]+|[a-z0-9',. -]+?) or another creature(?: you control)?$/.test(subj)
        && !/\b(?:or planeswalker|or artifact|or enchantment|or land|named|with|while|during|token|nontoken|that)\b/.test(subj)) {
      return { event: "dies", scope: /you control$/.test(subj) ? "creatureYouControl" : "eachCreature", whose: "any" };
    }
  }

  // ===== DEATH-DRAIN — creature-OR-PLANESWALKER union (Cruel Celebrant) ===== "this creature or another
  // creature OR PLANESWALKER you control dies" is the union { self } ∪ { other creatures you control } ∪
  // { planeswalkers you control }. The self ("this creature") is itself a creature you control, so the union
  // reduces EXACTLY to { a creature you control } ∪ { a planeswalker you control } — the new
  // creatureOrPwYouControl scope, which a creature death (checkDiesTriggers) AND a planeswalker death
  // (checkPlaneswalkerDiesTriggers) both route through. The drain EFFECT ("each opponent loses 1 life and you
  // gain 1 life") already parses HIGH (Bastion / Zulaport are native), so detecting the condition is the only
  // missing piece. CREED — anchored EXACTLY: the subject must be the bare creature+planeswalker union scoped
  // "you control"; ANY further type ("or artifact"), keyword, power, named/with/while/during/token restriction,
  // or a MISSING "you control" (an unscoped "or planeswalker" would need an each-PW scope we don't model)
  // fails the anchor → falls through to the rejects below → Arbiter (SAFE false-negative). Dies only.
  if (selfRef && /\bdies\b/.test(c) && /\bor another creature or planeswalker\b/.test(c)) {
    const subj = subjectBefore(c, "dies");
    if (/^(?:this [a-z]+|[a-z0-9',. -]+?) or another creature or planeswalker you control$/.test(subj)
        && !/\b(?:or artifact|or enchantment|or land|named|with|while|during|token|nontoken|that)\b/.test(subj)) {
      return { event: "dies", scope: "creatureOrPwYouControl", whose: "any" };
    }
  }

  // ===== SUBTYPE-ETB-SELF (Pantlaza family) — "NAME or another SUBTYPE you control enters" =====
  // "Pantlaza, Sun's Vanguard or another Dinosaur you control enters the battlefield" = the union
  // { self } ∪ { other SUBTYPEs you control } where self IS always a SUBTYPE (Pantlaza is a Dinosaur).
  // That union = "a SUBTYPE you control enters" — so the scope maps faithfully to a type-filtered
  // controller-scoped ETB. The subtype MUST be a single-word creature subtype checkable via typeStr;
  // any multi-word, keyword, power, or named restriction falls through to the rejects below (Arbiter).
  // ETB only — the DEATH-DRAIN carve-out above handles the dies analog.
  if (selfRef && /\bor another\b/.test(c) && /\benters(?:\s+the battlefield)?\s*$/.test(c)) {
    const subtypeM = subjectBefore(c, "enters").match(/\bor another ([a-z]+) you control\s*$/);
    if (subtypeM) {
      const sub = subtypeM[1];
      return { event: "etb", scope: "subtypeYouControl", whose: "any", subtypeFilter: sub.charAt(0).toUpperCase() + sub.slice(1) };
    }
  }

  // ===== POWER-THRESHOLD ETB (Garruk's Uprising, Elemental Bond, Temur Ascendancy) ===== "a creature you
  // control with power N or greater enters" — the "with" here is a SCOPE-EXPRESSIBLE restriction (the
  // entering creature's layer-resolved power ≥ N, checked at ETB), UNLIKE the generic unmodeled "with <…>"
  // (a +1/+1 counter / keyword) the FIX-TRIG-CONDITION guard below rejects. Carved out BEFORE that guard.
  // "a creature" → creature-only (no land-entry concern). scopeMatches reads creaturePower(perm, state).
  //
  // SELF-OR-OTHER form (Vaultborn Tyrant — "this creature or another creature you control with power 4 or
  // greater enters"): the "with power N or greater" qualifier modifies the WHOLE "creature you control" noun
  // phrase after the disjunction, so it applies to BOTH the self and the other (per the printed templating —
  // mirrors the creatureOrPwYouControl reasoning above). The union { this creature } ∪ { another creature you
  // control with power ≥ N } therefore reduces EXACTLY to { a creature you control with power ≥ N } — "this
  // creature" IS a creature you control, and the qualifier gates both halves. So it maps to the SAME
  // creatureYouControlPower scope with NO scope change: the entering creature (self or other) must be a
  // controller-owned creature whose layer-resolved power ≥ N. When the source itself enters below its own
  // threshold (a power-reducing static), it correctly does NOT fire — which is the CR-faithful reading of the
  // qualifier applying to the self too.
  if (/\benters(?:\s+the battlefield)?\s*$/.test(c)) {
    const subj = subjectBefore(c, "enters");
    const powM = subj.match(/^a creature you control with power (\d+) or greater$/)
      || subj.match(/^this creature or another creature you control with power (\d+) or greater$/);
    if (powM) return { event: "etb", scope: "creatureYouControlPower", whose: "any", powerThreshold: parseInt(powM[1], 10) };
    // "ANOTHER" (CR 109.5 — Garruk's Packleader #2014, Outcaster Trailblazer #2968, Paleoloth): the SAME
    // power-filtered scope, minus the source itself. The union form directly above deliberately INCLUDES
    // the self ("this creature or another …"), so the two are opposite readings of neighbouring templating
    // and can't share a descriptor. Emitting the union's shape here would give Packleader an extra draw
    // when Packleader itself enters — a fabricated trigger, not a missing one.
    const powAnotherM = subj.match(/^another creature you control with power (\d+) or greater$/);
    if (powAnotherM) return { event: "etb", scope: "creatureYouControlPower", whose: "any", powerThreshold: parseInt(powAnotherM[1], 10), etbExcludeSelf: true };
  }

  // ===== KEYWORD-FILTER ETB (Dragon Tempest "a creature you control with flying enters, it gains haste …";
  // Waterkin Shaman; Arcades "with defender") ===== Like the POWER-THRESHOLD carve-out above, the "with <kw>"
  // here is a SCOPE-EXPRESSIBLE restriction the engine can faithfully CHECK at ETB (permanentHasKeyword reads
  // the entering creature's printed + layer-6-granted + counter keywords), so it's admitted BEFORE the generic
  // FIX-TRIG-CONDITION "with …" reject below. parseEtbKeywordFilter gates the keyword to FILTERABLE_ETB_KEYWORDS
  // (the modeled combat keywords + defender) — a scope-INEXPRESSIBLE quality ("with the chosen name", "with
  // power equal to its toughness", "with flavor text" — Ineffable Blessing / Symmetry Matrix) returns null →
  // the trigger falls through to the reject → Arbiter (CREED FN-safe; never an over-fire on an uncheckable
  // quality). scopeMatches gates creatureYouControlKeyword on hasKeyword(entering) + controller; the effect's
  // entering-creature pronoun ("it gains haste …") is bound via TRIG-PRONOUN-IT (the scope is in both
  // NONSELF_TRIGGERING_SCOPES and ETB_ENTERING_CREATURE_SCOPES).
  if (/\benters(?:\s+the battlefield)?\s*$/.test(c)) {
    const kwFilter = parseEtbKeywordFilter(subjectBefore(c, "enters"));
    if (kwFilter) return { event: "etb", scope: "creatureYouControlKeyword", whose: "any", keywordFilter: kwFilter };
  }

  // ===== COMPOUND-SUBJECT guard (CREED, CLAUDE.md §1.2; Rod QA #1 FIX-TRIG-CONDITION, the "or another"
  // sub-case) ===== A single-event condition that names a SECOND subject after the self — "this creature
  // OR ANOTHER creature you control dies/enters" (Butcher of Malakir, Zulaport Cutthroat, Cruel Celebrant)
  // — is read as a BARE SELF trigger by the selfRef branches below (selfRef matches "this"), silently
  // DROPPING the "or another creature you control" half so the ability fires ONLY on the source's own
  // event — a confident WRONG partial. Leave it UNDETECTED → the whole card routes to the Arbiter (a SAFE
  // false-negative), mirroring the compound-event guard above. Exposed by the ED-2 each-player/each-opponent
  // edict slice (the sacrifice EFFECT became modeled, flipping these toward native). The BROADER
  // FIX-TRIG-CONDITION sub-case (scope-inexpressible restrictions) remains Rod/Erin's lane.
  // ===== SELF-OR-ANOTHER dies (SHELF S7 — The Ghoul, Gunslinger "Whenever The Ghoul or another nontoken
  // Zombie or Mutant you control dies"; the Zulaport-class shape "this creature or another creature you
  // control dies") ===== The FIX-TRIG-CONDITION reject below parks the whole or-another family because the
  // single-subject scopes drop the second half. This carve-out models the ONE clean dies shape exactly:
  // a SELF lead ("this creature" / the full or short printed name) + "or another [nontoken]
  // <creature|Subtype[ or Subtype]> you control dies" → the selfOrAnotherYouControl scope, whose matcher
  // fires on (a) the SOURCE's own death unconditionally (CR 603.2 — the printed name means the source
  // object itself, token-copy or not) OR (b) another creature of the SAME controller passing the optional
  // nontoken + subtype gates. Any other lead / a rider / an unparseable filter falls through to the reject
  // → Arbiter (a SAFE FN, never a dropped half).
  {
    const soa = c.match(/^(.+?) or another (nontoken )?(.+?) you control dies$/);
    if (soa) {
      const lead = soa[1].trim();
      const leadIsSelf = lead === "this creature" || (nameL && lead === nameL) || (shortName && lead === shortName);
      if (leadIsSelf) {
        const filterWord = soa[3].trim();
        const base = { event: "dies", scope: "selfOrAnotherYouControl", whose: "any", ...(soa[2] && { nontokenFilter: true }) };
        if (filterWord === "creature") return base;
        const filter = parseSubtypeList(filterWord);
        if (filter) return { ...base, subtypeFilter: filter };
      }
    }
  }
  if (selfRef && /\bor another\b/.test(c)) return null;

  // ===== FIX-TRIG-CONDITION (Rod QA #1, CREED CLAUDE.md §1.2) ===== Reject conditions whose SUBJECT or
  // RESTRICTION the scope system can't faithfully represent — the single-event branches below would map
  // them to a bare self / controller scope and silently DROP the restriction or a second subject, then
  // over- or under-fire (a confident WRONG partial). All route to the Arbiter (safe false-negative):
  //  - an alternate 2nd subject — "this/<name> OR ANOTHER creature you control dies/enters" (Zulaport
  //    Cutthroat, Cruel Celebrant, Rotlung Reanimator, Headless Rider, the Rally tribe) — only the leading
  //    subject is modeled, so the "or another …" half would be dropped (drains/recurs only on self-death).
  //  - "dealt damage by <…>" (Sengir Vampire / Sengir Bats / Vampiric Dragon / Blood Cultist) — a
  //    restriction the broad selfRef misreads as a bare self-dies (fires when the SOURCE dies, never works).
  //  - a scope-inexpressible restriction: "with <…>" (a "-1/-1 counter on it" quality; the "+1/+1 counter on
  //    it" attacks/dies predicate is now the CNT-1 carve-out below, BEFORE this reject), "while <…>" (Seasoned
  //    Warrenguard), "the player with <…>" (Preacher of the Schism), "named <…>",
  //    "during <…>" (Mongrel Pack "dies during combat"). The modeled clean forms (this/<name>/a-creature-
  //    you-control + bare enters/dies/attacks/blocks, upkeep/end/draw step, cast-a-spell) carry NONE of
  //    these tokens, so this is purely additive (confirmed collateral-free by the corpus A/B sweep).
  if (/\bor another\b/.test(c)) return null;
  // DEALT-DAMAGE-BY-ME CARVE-OUT (Sengir Vampire, Zurgo Helmsmasher, Abattoir Ghoul, Predator Ooze, Blood
  // Cultist, Soul Collector, Vampiric Dragon, Wight and more) — "Whenever a creature dealt damage by ~ this
  // turn dies, <effect>". Placed AHEAD of the reject directly below, on the exact precedent the CNT-1
  // "+1/+1 counter on it" carve-out set: that reject exists because the restriction USED to be
  // scope-inexpressible, and it no longer is. gameState now records the SOURCE of every hit in a
  // per-permanent `damagedBy` list (markCombatDamage / recordDamageSource) and the death constructors
  // snapshot it onto the CR 603.6e look-back — without that snapshot the dead creature is gone before the
  // watcher sweep runs and the condition genuinely cannot be answered, which is what the reject was for.
  //
  // Scope `eachCreature` is the printed subject: "a creature", any controller, gated by requiresDamagedBySource
  // in scopeMatches (a pre-switch filter, mirroring requiresCounter). ⛔ ANCHORED to "by this creature" — the
  // self-normalized form of the card's own name — so a card watching for damage dealt by something ELSE
  // falls through to the reject below and on to the Arbiter (CREED FN-safe). "this turn" needs no separate
  // modeling: CR 514.2 clears damagedBy at cleanup along with the damage, so the list only ever holds THIS
  // turn's sources.
  if (/^a creature dealt damage by this creature this turn dies$/.test(c)) {
    return { event: "dies", scope: "eachCreature", whose: "any", requiresDamagedBySource: true };
  }
  if (/\bdealt damage by\b/.test(c)) return null;   // <- everything the carve-out above did not admit
  if (/\bthe player with\b/.test(c)) return null;
  // The "with …" rejection guards scope-INEXPRESSIBLE restrictions ("with a +1/+1 counter on it"). Two cast
  // shapes use "with" but are PRECISELY checkable on the cast spell itself — "cast a spell with {X} in its
  // mana cost" (printed-cost test) and "cast a spell with mana value N or greater/less" (CR 202.3). Exempt
  // ONLY those exact anchored shapes here so they reach the cast matchers below; everything else "with …"
  // still routes to the Arbiter (a SAFE false-negative). The shapes are re-anchored at their matchers.
  // WITH-KEYWORD BATCH combat-damage (Quartzwood Crasher — "one or more creatures you control WITH TRAMPLE
  // deal combat damage to a player") — carved out BEFORE the "with …" reject below, exactly like the
  // qualified-ETB keyword filter: this "with" is a PRECISELY-checkable keyword restriction, gated to
  // FILTERABLE_ETB_KEYWORDS (the permanentHasKeyword-checkable set — layer-aware, so an equipment-granted
  // trample counts, matching real rules). perDefender: per the card's ruling this shape triggers once for
  // EACH damaged player, and its payload reads "the amount of damage THOSE creatures dealt to THAT player"
  // — checkBatchCombatDamageTriggers fires it once per (controller, defender) pair with ctx
  // {damagedPlayerId, combatDamageAmount} summed over MATCHING dealers only (the same ctx keys the singular
  // combat-damage path sets, so payload atoms are shared). An INADMISSIBLE keyword/quality on this exact
  // shape returns null HERE (the guard's intent — a restriction the engine can't check → Arbiter, FN-safe).
  {
    const kwBatchM = c.match(/^one or more creatures you control with ([a-z' ]+) deal combat damage to (?:a player|an opponent)$/);
    if (kwBatchM) {
      const kw = kwBatchM[1].trim();
      if (FILTERABLE_ETB_KEYWORDS.has(kw)) {
        return { event: "combatDamageBatch", scope: "you", whose: "any", batchKeyword: kw, perDefender: true };
      }
      return null; // the batch shape with a keyword the engine can't check — Arbiter (never an over-fire)
    }
  }
  // WITH-KEYWORD ATTACKS (BLITZ AT-1 — "Whenever a creature you control WITH <combat-kw> attacks, <effect>":
  // Stonebrow "with trample" → it gets +2/+2; Ognis "with haste" → create a tapped Treasure; Hooded Blightfang
  // "with deathtouch" → each opponent loses 1 life). Carved out BEFORE the generic "with …" reject below, exactly
  // like the qualified-ETB keyword filter and the keyword-batch combat-damage shape above: the "with <kw>" is a
  // PRECISELY-checkable keyword restriction (parseEtbKeywordFilter → FILTERABLE_ETB_KEYWORDS, the
  // permanentHasKeyword-checkable combat keywords + defender — layer-aware, so an equipment-granted trample
  // counts). The creatureYouControlKeyword scope is event-agnostic in scopeMatches (gates on the ATTACKER's
  // permanentHasKeyword + controller) and in NONSELF_TRIGGERING_SCOPES (so the attacker pronoun "it gets/gains …"
  // binds via TRIG-PRONOUN-IT → target:"thatCreature"). Fires for EVERY attacker the player controls that HAS the
  // keyword, INCLUDING the source itself when it carries it (CR — "a creature you control" includes the source;
  // checkAttackTriggers' per-attacker fire matches the scope). A scope-INEXPRESSIBLE quality ("with power equal to
  // its toughness", "with a +1/+1 counter on it") → parseEtbKeywordFilter returns null → falls through to the
  // reject → Arbiter (CREED FN-safe — never an over-fire on an uncheckable quality). Anchored to the exact
  // subject; the effect is re-gated all-or-nothing by triggerRoutesNatively downstream.
  if (/\battacks\s*$/.test(c) && !/\balone\b/.test(c)) {
    const atkKw = parseEtbKeywordFilter(subjectBefore(c, "attacks"));
    if (atkKw) return { event: "attacks", scope: "creatureYouControlKeyword", whose: "any", keywordFilter: atkKw };
  }
  // COUNTER-PREDICATE SCOPE (BLITZ CNT-1 — "Whenever a creature you control WITH A +1/+1 COUNTER ON IT
  // dies/attacks, <effect>": Meltstrider Eulogist / Tributary Instructor draw on such a death; Tenured
  // Inkcaster drains on such an attack). The "with a +1/+1 counter on it" is a LIVE-STATE predicate
  // scopeMatches CAN faithfully enforce — it reads the triggering creature's own +1/+1 counter bag (the
  // attacker LIVE on the battlefield; the dead creature's CR-603.10a look-back `counters` snapshot, threaded
  // by checkDiesTriggers). Carved out BEFORE the generic "with …" reject below, exactly like the WITH-KEYWORD
  // ATTACKS carve-out above. requiresCounter:"+1/+1" is enforced as a pre-switch filter in scopeMatches
  // (mirrors nontokenFilter/attachedOnly), composing with the creatureYouControl controller scope; the
  // "nontoken" qualifier (Rayblade Trooper / Alharu) ALSO sets nontokenFilter (CR 111.1). ONLY +1/+1, the
  // bare "you control" controller scope, and the attacks/dies verbs are admitted — an "another" self-exclusion
  // (needs an id gate + the effect's "that creature" pronoun binding, out of this slice), a "deals combat
  // damage"/"leaves the battlefield" verb, or any other counter kind fails the `^…$` anchor → falls to the
  // reject → Arbiter (CREED FN-safe). The effect is re-gated all-or-nothing by triggerRoutesNatively downstream.
  {
    const cpm = c.match(/^(a|a nontoken) creature you control with a \+1\/\+1 counter on it (attacks|dies)$/);
    if (cpm) {
      const desc = { event: cpm[2], scope: "creatureYouControl", whose: "any", requiresCounter: "+1/+1" };
      if (cpm[1] === "a nontoken") desc.nontokenFilter = true;
      return desc;
    }
  }
  // ===== BATCHED ETB WITH A CHECKABLE FILTER (CR 603.1) ===== "Whenever ONE OR MORE [other] creatures you
  // control WITH POWER N OR LESS / WITH MANA VALUE N OR LESS enter" (Welcoming Vampire #428, Enduring
  // Innocence #785, Tocasia's Welcome #866). Carved out BEFORE the blanket "with …" reject below, on the
  // same grounds as the keyword-batch and cast-with-mana-value exemptions above it: printed power and mana
  // value are PRECISELY checkable, unlike the scope-inexpressible qualities that reject guards against.
  //
  // ⭐ MAPPED ONTO THE SINGULAR `etb` EVENT, NOT A BATCH EVENT — and this is the whole trick. Both corpus
  // carriers print "This ability triggers only once each turn", and that rider is ENFORCED at the flush
  // chokepoint (gameEngine, keyed per source+event, cleared at untap). So:
  //     batch-once,  then rider-capped  ->  once per turn
  //     per-creature, then rider-capped ->  once per turn      ← observably IDENTICAL
  // The printed rider does the capping either way, so no entry queue, no drain, and no per-entry cost is
  // needed. (An earlier attempt built exactly that machinery and was reverted; see the run ledger.)
  //
  // ⚠️ VALID ONLY WITH THE RIDER. A rider-less batched ETB mapped this way would fire once per TOKEN — the
  // over-fire this family exists to avoid. `requiresOncePerTurn` carries that demand to the descriptor
  // builder, which DROPS the descriptor when the rider is absent, so the unsafe case cannot be emitted.
  {
    const ebf = c.match(/^one or more (other )?creatures you control with (power|mana value) (\d+) or less enter$/);
    if (ebf) {
      const scopeF = creatureSubjectScope(`${ebf[1] ? "another" : "a"} creature you control`);
      if (scopeF) {
        return {
          event: "etb", scope: scopeF, whose: "any", requiresOncePerTurn: true,
          ...(ebf[2] === "power" ? { etbMaxPower: parseInt(ebf[3], 10) } : { etbMaxMv: parseInt(ebf[3], 10) }),
        };
      }
    }
  }
  // ===== BATCHED ETB, ANY SUBJECT THE SINGULAR ARM CAN ENFORCE (CR 603.1) ===== the general form of the
  // power/mana-value arm directly above. Same licence, same rider requirement — the ONLY thing that differs
  // is which subject filter is in play, so this must NOT grow a second subject parser.
  //
  // ⭐ IT DELEGATES. The plural subject is singularized and the resulting clause is handed straight back to
  // classifyCondition, whose result is decorated with requiresOncePerTurn. That inherits every scope the
  // SINGULAR etb path can enforce (subtypeYouControl / otherSubtypeYouControl / permanentEnters filters /
  // nontokenFilter / tokenFilter) **and every refusal it makes** — an unenforceable subject returns null
  // there and therefore null here, so the batch form can never be more permissive than the singular form it
  // is built on. That containment IS the safety argument; duplicating the matchers would destroy it.
  //
  // ⚠️ VALID ONLY WITH THE RIDER, for the same reason as the arm above: mapping a batch onto the singular
  // event fires once per ENTERING PERMANENT, and only the printed "this ability triggers only once each
  // turn" collapses that back to once. requiresOncePerTurn carries the demand to the descriptor builder,
  // which drops the descriptor when the rider is absent — so the over-firing case cannot be emitted.
  // Excludes scope "self" (a source's own entry is not a batch of others) and any inner descriptor that
  // already carries a once-per-turn demand of its own.
  {
    const oomEtb = c.match(/^one or more (.+) enter$/);
    const singularSubject = oomEtb ? singularizeBatchSubject(oomEtb[1]) : null;
    if (singularSubject) {
      const inner = classifyCondition(`${singularSubject} enters`, cardName, cardType);
      // BOTH entry events are admitted. The singular path splits "something entered" across two: `etb` for
      // creature-shaped subjects and `permanentEnters` for the card-type ones ("an artifact you control" →
      // artifactYouControl, "a token you control" → tokenYouControl). The rider argument is identical for
      // both — per-entry firing, collapsed to once by the printed rider — and gating on `etb` alone silently
      // dropped the artifact and token carriers, which are most of this family.
      if (inner && (inner.event === "etb" || inner.event === "permanentEnters") && inner.scope !== "self" && !inner.requiresOncePerTurn) {
        return { ...inner, requiresOncePerTurn: true };
      }
    }
  }
  // FIRST-TAP-EACH-OF-YOUR-TURNS (Tale of Katara and Toph — the ONLY corpus card with this wording).
  // "<self> becomes tapped FOR THE FIRST TIME DURING EACH OF YOUR TURNS". Both halves of the qualifier are
  // load-bearing, and BOTH already have machinery — this arm only composes them, it invents nothing:
  //   • "during each of YOUR TURNS" → whose:"yours", the existing activePlayer gate in triggersForEvent.
  //     Dropping it would fire on opponents' turns too, an over-fire (the forbidden direction).
  //   • "for the FIRST TIME" → oncePerTurnTrigger, whose latch is keyed per SOURCE PERMANENT + event.
  //     That keying is exactly right here with no change: the ability is GROUP-GRANTED to each creature
  //     ("Creatures you control have \"…\""), so each creature is its own source and gets its own latch —
  //     one counter per creature per turn, NOT one across the whole board.
  //
  // ⚠️ PLACED HERE, immediately above the blanket `with|while|during|named` reject, and that placement is the
  // whole reason it works: the reject is a deliberate CREED catch-all for unenforceable qualifiers, and this
  // arm sat BELOW it for its first draft and was simply never reached (measured — the bare form detected and
  // every qualified form returned []). A specific, enforceable carve-out belongs beside `castWithExempt`
  // rather than weakening the reject.
  {
    const ft = c.match(/^(.+?) becomes tapped for the first time during each of your turns$/);
    if (ft) {
      const subj = ft[1].trim();
      const isSelfSubj = subj === "this creature" || subj === "this permanent" || subj === "this artifact"
        || (nameL && subj === nameL) || (shortName && subj === shortName) || (firstWord && subj === firstWord);
      if (selfRef && isSelfSubj) return { event: "becomesTapped", scope: "self", whose: "yours", oncePerTurnTrigger: true };
    }
  }
  // MANA-VALUE FLOOR ETB (Dragon Fangs / Scales / Breath / Wings / Shadow) — "a creature with mana value N
  // or greater enters". Carved out HERE, above the reject, and NOT further down beside the other ETB
  // subject arms — the note a dozen lines up records that a previous arm was written down there, was never
  // reached, and had to be moved: the reject eats every "with …" before those arms ever run.
  //
  // Admitted on the same grounds castWithExempt is: printed mana value is PRECISELY checkable (CR 202.3),
  // unlike the scope-inexpressible qualities ("with a -1/-1 counter on it") the reject exists to catch.
  // Scope `eachCreature` is the printed subject — "a creature", ANY controller, which is what these Auras
  // say. (Smoke Shroud's "a Ninja YOU CONTROL" is a different sentence, already served by the subtype arm
  // below; do not conflate them.) The floor rides as etbMinMv, enforced in scopeMatches, where an unknown
  // mana value deliberately FAILS the gate rather than passing it.
  {
    const etbMvM = c.match(/^a creature with mana value (\d+) or greater enters$/);
    if (etbMvM) return { event: "etb", scope: "eachCreature", whose: "any", etbMinMv: parseInt(etbMvM[1], 10) };
  }
  // ATTACK-COUNT (Military Intelligence — "Whenever you attack with N or more creatures, …"). Placed ABOVE
  // the qualifier guard below, and the ORDER is the whole point: that guard rejects ANY condition containing
  // "with", so this form was never reached no matter how it was anchored. The battalion twin (further down,
  // near the other youAttack arms) needs no such move — its wording carries no "with".
  //
  // Whole-string anchored, so moving it earlier cannot widen anything: it claims exactly this sentence and
  // nothing else, and every other "with" condition still hits the guard unchanged. Same once-per-combat
  // `youAttack` lane and the same `minAttackers` gate as battalion; NO requireSelfAttacking, because this
  // wording never names the source as an attacker (an enchantment carries it — Military Intelligence is not
  // a creature and cannot attack at all).
  {
    const atkCountEarly = c.match(/^you attack with (\d+|one|two|three|four|five|six) or more creatures$/);
    if (atkCountEarly) {
      const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
      const n = words[atkCountEarly[1]] ?? parseInt(atkCountEarly[1], 10);
      if (Number.isFinite(n)) return { event: "youAttack", scope: "you", whose: "any", minAttackers: n };
    }
  }
  const castWithExempt = /^(?:you|an opponent|a player|each player) casts? an? spell with (?:\{x\} in its mana cost|mana value \d+ or (?:greater|more|less|fewer))$/.test(c);
  // The DURING-EACH-OPPONENT'S-TURN exemption (2026-08-14 — Wavebreak Hippocamp): the blanket qualifier
  // refusal below ate this rider before the castNth arm could see it. Exempted by the EXACT phrase only —
  // every other "during" qualifier stays refused wholesale (safe FN, as before).
  const castDuringExempt = /spell during each opponent's turn$/.test(c);
  // KISHLA SKIMMER (2026-08-14) — the UNFILTERED leave with the turn rider: "Whenever a card leaves
  // your graveyard DURING YOUR TURN, draw a card. This ability triggers only once each turn." The
  // duringYourTurn flag is the Wavebreak duringOpponentsTurn's mirror — gated at the fire loop
  // (checkGraveyardEventTriggers) against the ACTIVE player; the once-per-turn latch rides the
  // standard trailing-sentence stamp. TF-1: only the during-form is emitted (Kishla is the carrier);
  // the bare unfiltered "a card leaves your graveyard" stays unmatched → Arbiter.
  if (/^a card leaves your graveyard during your turn$/.test(c)) {
    return { event: "gyLeave", scope: "gyWatcher", whose: "any", gyCardType: null, gyOwnerScope: "you", duringYourTurn: true };
  }

  // ATTACKS-WHILE (2026-08-14 — Pugnacious Hammerskull "Whenever this creature attacks while you don't
  // control another Dinosaur, …"): the while-part is a FIRE-TIME-ONLY event condition — part of the
  // trigger EVENT per the printed wording, checked at declaration and NOT re-checked at resolution,
  // which is why it is deliberately NOT stamped interveningIf (that would over-suppress on a board that
  // changes between flush and resolution — an FP in the player's favour is still an FP). Admitted ONLY
  // when interveningIf.js can read the condition (the shared strict vocabulary; anything else falls to
  // the blanket reject below → Arbiter, FN-safe). Placed above the qualifier guard for the Military
  // Intelligence reason: that guard eats every "while".
  {
    const awM = c.match(/^this creature attacks while (.+)$/);
    if (awM && interveningIfParseable(awM[1])) {
      return { event: "attacks", scope: "self", whose: "any", attacksWhileIf: awM[1] };
    }
  }
  if (!castWithExempt && !castDuringExempt && /\b(?:with|while|during|named)\b/.test(c)) return null;

  // The subject is mapped ONLY to a scope scopeMatches can ENFORCE (bare, or the controller
  // restriction); any other restriction (keyword/type/power/named/token) → null → UNDETECTED, so
  // we never over-fire on a restriction we can't check (CLAUDE.md §1.2). `subjectBefore` is the
  // exact text before the event verb.
  if (/\benters\b/.test(c) && !/\benters (the battlefield )?(tapped|with|as)\b/.test(c)) {
    if (selfRef) return { event: "etb", scope: "self", whose: "any" };
    // NONTOKEN-SUBJECT ETB (wave3b) — "a nontoken creature you control enters" (Guardian Project / The
    // Great Henge / Blessed Sanctuary) and "a nontoken <Subtype> you control enters" (Sosuke's Summons —
    // "create a 1/1 green Snake"). Same scope-expressible nontoken restriction (CR 111.1) as the dies
    // analog above: nontokenFilter:true GATES on the entering permanent's token-ness in scopeMatches, so
    // a TOKEN of the matching kind entering does NOT fire. Controller-scoped only; the bare "enters" is
    // matched (the tapped/with/as guard above already excluded the static-replacement shapes). Checked
    // BEFORE the another-subtype / creatureSubjectScope matchers, which don't recognize "nontoken".
    const etbSubjRaw = subjectBefore(c, "enters");
    if (etbSubjRaw === "a nontoken creature you control") return { event: "etb", scope: "creatureYouControl", whose: "any", nontokenFilter: true };
    // ⭐ THE TOKEN MIRROR (Securitron Squadron, Anointer Priest, Nesting Dovehawk). The nontoken side has
    // been modeled for a long time; this is the same qualifier read the other way, and it needs its own
    // filter rather than a negated flag — a descriptor carrying neither must keep firing on BOTH, which is
    // every unqualified "a creature you control enters" on the board.
    if (etbSubjRaw === "a creature token you control") return { event: "etb", scope: "creatureYouControl", whose: "any", tokenFilter: true };
    // "ANOTHER nontoken creature you control enters" (Surrak and Goreclaw) — the OTHER-creature analog of the
    // line above (excludes the source). Same scope-expressible nontoken restriction (CR 111.1); the bare
    // "another nontoken creature" (no subtype) falls through the another-subtype matcher below because
    // "creature" is in NON_SUBTYPE_ETB_WORDS, and creatureSubjectScope returns null for "nontoken" — so it is
    // carved out HERE. nontokenFilter:true + scope otherCreatureYouControl are both already enforced by
    // scopeMatches (a token entering does NOT fire; the source's own entry is excluded by the id check).
    if (etbSubjRaw === "another nontoken creature you control") return { event: "etb", scope: "otherCreatureYouControl", whose: "any", nontokenFilter: true };
    const ntSubEtb = etbSubjRaw.match(/^a nontoken ([a-z]{3,}) you control$/);
    if (ntSubEtb && !NON_SUBTYPE_ETB_WORDS.has(ntSubEtb[1])) {
      return { event: "etb", scope: "subtypeYouControl", whose: "any", subtypeFilter: ntSubEtb[1].charAt(0).toUpperCase() + ntSubEtb[1].slice(1), nontokenFilter: true };
    }
    // ANOTHER-SUBTYPE ETB — "another [nontoken] <type/subtype> [you control] enters" (Elvish Vanguard /
    // Youthful Valkyrie / Arcbound Crusher families; the NONTOKEN form is Miirym, Sentinel Wyrm — "another
    // nontoken Dragon you control enters"). A single-word type that typeStr can enforce; NON_SUBTYPE_ETB_WORDS
    // rejects supertypes, meta words, and colors whose typeStr check would silently never fire (CREED FP guard).
    // "creature" stays in the denylist → falls through to creatureSubjectScope below (existing handling).
    // "artifact" / "enchantment" / "land" are NOT in the denylist — typeStr includes them literally. The OPTIONAL
    // "nontoken" qualifier sets nontokenFilter:true (CR 111.1 — gated on the entering permanent's token-ness in
    // scopeMatches), which is ALSO the load-bearing non-recurse guard for Miirym's token-copy (its own minted
    // token copy is token:true → the gate skips it → no infinite loop).
    const etbSubj = subjectBefore(c, "enters");
    // The UNION list rides the "another" determiner too — "Whenever ANOTHER Frog, Rabbit, Raccoon, or Squirrel
    // you control enters" (Valley Mightcaller). Same `parseSubtypeList` gate as the bare-subject arm below and
    // the dies arm; a card-TYPE word anywhere in the list returns null → undetected → Arbiter.
    // ⚠️ NON_SUBTYPE_ETB_WORDS is still checked on the SINGLE-word path: it is a DIFFERENT, ETB-specific
    // denylist from the one parseSubtypeList consults, so dropping it here would widen the single form as a
    // side effect of widening the list form. Both gates run.
    const anotherSubM = etbSubj.match(/^another (nontoken )?([a-z]+(?:(?:,\s*[a-z]{3,})*,?\s*(?:or|and)\s+[a-z]{3,})?)(?: you control)?$/);
    if (anotherSubM && (/(?:or|and)\s/.test(anotherSubM[2]) || !NON_SUBTYPE_ETB_WORDS.has(anotherSubM[2]))) {
      const sub = /(?:or|and)\s/.test(anotherSubM[2])
        ? parseSubtypeList(anotherSubM[2])
        : anotherSubM[2].charAt(0).toUpperCase() + anotherSubM[2].slice(1);
      if (!sub) return null;   // a list containing a card-TYPE word → never a fabricated grant
      const youControl = /you control$/.test(etbSubj.trim());
      const desc = { event: "etb", scope: youControl ? "otherSubtypeYouControl" : "otherSubtypeAnywhere", whose: "any", subtypeFilter: sub };
      if (anotherSubM[1]) desc.nontokenFilter = true; // "another nontoken <Subtype>" (Miirym)
      return desc;
    }
    // BARE-SUBTYPE ETB — "a/an <Subtype> you control enters" (Bishop of Wings "an Angel you control enters",
    // the tribal ETB payoffs — Cleric/Soldier/Goblin gain-life/draw/token). The DIES analog ("a <Subtype> you
    // control dies", line ~496) already exists; this is the symmetric ETB form. Maps to subtypeYouControl, whose
    // runtime gate (scopeMatches) fires only when the ENTERING permanent's type line carries the subtype AND it's
    // controlled by the source's controller — so the metric credits EXACTLY the cards the runtime plays. The
    // single subtype word is gated by NON_SUBTYPE_FILTER_WORDS (stricter than the ETB denylist: excludes
    // artifact/enchantment/land/creature/etc., whose .includes-substring match would over-fire), so only a real
    // single-word subtype passes; a card-TYPE word, a multi-word/restricted subject, or "another …" (handled
    // above) fails → UNDETECTED → Arbiter (CREED FN-safe). Checked AFTER another-subtype + before the bare
    // creatureSubjectScope (which doesn't recognize a subtype word).
    // COMMANDER-SCOPED ETB (CR 903.3) — "Whenever a commander you control enters" (Norn's Choirmaster #3286).
    // Commander-ness is a DESIGNATION stamped on the card, not a word in the type line, so it must NOT ride
    // the subtype path: a subtypeFilter of "Commander" is a gate no printed card can satisfy (verified on a
    // board — the card fired zero and still classified native-trigger). `commanderYouControl` is the scope
    // that already enforces this correctly for combat damage (Kediss); this reuses it rather than adding a
    // second commander gate. A PLANESWALKER commander entering does not fire it (scopeMatches requires a
    // creature permanent) — an accepted FN, not an over-fire.
    if (etbSubj === "a commander you control") return { event: "etb", scope: "commanderYouControl", whose: "any" };
    // UNION list — "a Mutant, Ninja, or Turtle you control enters" (April O'Neil, Live on the Scene, SHELF;
    // Valley Mightcaller; Moria Marauder).
    //
    // ⭐ THE LIST WAS ALREADY SAYABLE ON THE **dies** SIBLING TWENTY LINES BELOW, through this same
    // `parseSubtypeList` helper and into this same `subtypeFilter` descriptor field — `subtypeFilterMatches`
    // has always accepted a string OR an array and matched ANY member. Only the ETB arm still read a single
    // `[a-z]{3,}`, so the identical sentence fired on death and was invisible on entry. The regex below is the
    // dies arm's, verbatim except for the trailing verb.
    //
    // ⛔ parseSubtypeList IS THE GATE, not a convenience: it returns null if ANY element is a card-TYPE word
    // (creature/permanent/token/…), which would mint a filter matching every permanent — an over-fire — and
    // null if any element fails the shape check. Null → undetected → Arbiter, a safe FN. That is also why the
    // whole list must parse or none of it does: a partially-honored list would fire on some members and
    // silently miss the rest while the card still read native.
    const etbSubM = etbSubj.match(/^an? ([a-z]{3,}(?:(?:,\s*[a-z]{3,})*,?\s*(?:or|and)\s+[a-z]{3,})?) you control$/);
    if (etbSubM) {
      const filter = parseSubtypeList(etbSubM[1]);
      if (filter) return { event: "etb", scope: "subtypeYouControl", whose: "any", subtypeFilter: filter };
    }
    const scope = creatureSubjectScope(subjectBefore(c, "enters"));
    if (scope) return { event: "etb", scope, whose: "any" };
  }
  if (/\bdies\b/.test(c)) {
    if (selfRef) return { event: "dies", scope: "self", whose: "any" };
    // AURA HOST DIES — "When enchanted creature dies, <effect>" (Elephant Guide, Griffin Guide, Bequeathal,
    // Dying Wail, Most Wanted, Failed Conversion). The sibling of the "enchanted creature attacks" /
    // "…deals combat damage" arms already here, and it reuses the SAME `equippedCreature` attached-linkage
    // scope those use — Auras and Equipment attach through the identical `attachedTo`/`attachments` fields.
    //
    // That scope ALREADY handles the death case correctly, which is why this is a detector arm and not a
    // mechanism: on the host's death the Aura is already detached (`attachedTo` is null by the time
    // checkDiesTriggers runs), so scopeMatches reads the linkage from the dead creature's CR-603.10a
    // look-back `attachments`, captured before the detach.
    //
    // NOT gated on the effect, unlike the SELF-LTB "equipped creature dies → return it to its owner's hand"
    // detector below. That one needs its narrow gate because its effect names the DEAD OBJECT ("it", CR
    // 608.2c) and mis-binding that referent would return the wrong card. Every effect this arm actually
    // frees is self-contained (create a token / draw / discard / surveil) and names nothing — and an effect
    // that DOES reference the dead creature ("return that card…") simply fails to parse and keeps its card
    // parked, so the referent hazard is closed by construction rather than by a gate.
    if (/^enchanted creature dies$/.test(c)) return { event: "dies", scope: "equippedCreature", whose: "any" };
    // NONTOKEN-SUBJECT dies (wave3b) — "a nontoken creature you control dies" (Remembrance / Open the
    // Graves / Ulvenwald Mysteries — the token-recursion family) and "a nontoken <Subtype> you control
    // dies" (Lazotep Sliver — "amass Slivers 2"). The "nontoken" qualifier is a SCOPE-EXPRESSIBLE
    // restriction (the dead permanent must NOT be a token, CR 111.1 — checked via card.token in
    // scopeMatches), so it's carved out HERE rather than rejected. nontokenFilter:true GATES firing on
    // the dead permanent's token-ness; without the gate a token of the matching kind dying would fire
    // (the #1 FP — Lazotep's own amass-minted Sliver Army token dying would re-fire its amass). Anchored
    // controller-scoped ONLY ("you control"): the scope below enforces both the controller AND the
    // nontoken gate; a no-controller form ("a nontoken creature dies", Mimic Vat) stays UNDETECTED (its
    // eachCreature scope can't carry the controller-agnostic nontoken check cleanly) → Arbiter (SAFE FN).
    // Checked BEFORE the bare creatureSubjectScope / subtype matchers because those don't see "nontoken".
    const ntCreatureDies = c.match(/^a nontoken creature you control dies$/);
    if (ntCreatureDies) return { event: "dies", scope: "creatureYouControl", whose: "any", nontokenFilter: true };
    // "ANOTHER nontoken creature you control dies" (Sek'Kuar, Grim Haruspex, Agent Venom, the aristocrats
    // "another nontoken creature" payoffs) — the source-EXCLUDING analog of the line above, the DIES mirror of
    // the "another nontoken creature you control enters" ETB carve-out. Same scope-expressible nontoken
    // restriction (CR 111.1): otherCreatureYouControl gates on same-controller + not-self + isCreaturePerm, and
    // the pre-switch nontokenFilter gate excludes a token death — so the source's own token minted by the payoff
    // (Sek'Kuar's Graveborn, Agent Venom's… none) can never re-fire, and the "another" id-check excludes the
    // source itself. Checked BEFORE creatureSubjectScope (which returns null for the "nontoken"-carrying subject).
    if (subjectBefore(c, "dies") === "another nontoken creature you control")
      return { event: "dies", scope: "otherCreatureYouControl", whose: "any", nontokenFilter: true };
    // The NON_SUBTYPE_ETB_WORDS denylist (shared with the ETB path) rejects a meta-word subject
    // ("permanent"/"planeswalker"/a color) whose typeStr-substring scope check would silently never fire —
    // claiming native on a do-nothing trigger is a CREED FP. "artifact"/"enchantment" are NOT denylisted
    // (real type-line tokens — Replication Specialist's "nontoken artifact"). Zero live corpus hits today;
    // the guard keeps the path robust against future additions, matching the ETB matcher's hygiene.
    const ntSubDies = c.match(/^a nontoken ([a-z]{3,}) you control dies$/);
    if (ntSubDies && !NON_SUBTYPE_ETB_WORDS.has(ntSubDies[1])) {
      return { event: "dies", scope: "subtypeYouControl", whose: "any", subtypeFilter: ntSubDies[1].charAt(0).toUpperCase() + ntSubDies[1].slice(1), nontokenFilter: true };
    }
    const scope = creatureSubjectScope(subjectBefore(c, "dies"));
    if (scope) return { event: "dies", scope, whose: "any" };
    // SUBTYPE dies (tribal payoffs — Laid to Rest / Slimefoot / Crossway Troublemakers). Single-word
    // subtype filter reusing subtypeYouControl; checkDiesTriggers threads the dead creature as
    // triggeringPermanent. The with/while/during/named/or-another guards above already rejected the
    // restricted shapes, so this only captures the clean "a <Subtype> you control dies" form.
    // UNION list (Jason Bright — "a Zombie or Mutant you control dies", SHELF S7): the same
    // parseSubtypeList the combat-damage subject uses (string for one word — byte-identical to the old
    // single form — or an array; subtypeFilterMatches checks ANY member). A non-subtype word anywhere in
    // the list → null → undetected → Arbiter (never an over-fire).
    // OUTLAW dies (CR 203.4c) — "Whenever an outlaw you control dies" (Rakish Crew). "Outlaw" is an UMBRELLA
    // term, not a type-line word, so it expands to its five constituent subtypes exactly as the batch
    // combat-damage subject parser already does; subtypeFilterMatches accepts a list and matches ANY member.
    // Without this it minted the literal "Outlaw" — a gate no type line satisfies (found by the vacuous-filter
    // probe) — and NON_SUBTYPE_FILTER_WORDS now blocks that spelling outright.
    if (/^an outlaw you control dies$/.test(c)) return { event: "dies", scope: "subtypeYouControl", whose: "any", subtypeFilter: OUTLAW_SUBTYPE_LIST };
    const diesSub = c.match(/^an? ([a-z]{3,}(?:(?:,\s*[a-z]{3,})*,?\s*(?:or|and)\s+[a-z]{3,})?) you control dies$/);
    if (diesSub) {
      const filter = parseSubtypeList(diesSub[1]);
      if (filter) return { event: "dies", scope: "subtypeYouControl", whose: "any", subtypeFilter: filter };
    }
  }
  // ===== BATCHED DEATHS (CR 603.1) ===== "Whenever ONE OR MORE … die" (Morbid Opportunist, Soul Shredder,
  // G'raha Tia). This fires ONCE for a batch of simultaneous deaths, where the singular "whenever a creature
  // dies" fires once PER creature — they are NOT synonyms, and mapping the plural onto the singular detector
  // would over-fire (a board wipe drawing 5 cards instead of 1), the forbidden direction.
  //
  // Modelled as its OWN EVENT with its own check function, exactly like the shipped `combatDamageBatch`
  // (Grim Hireling / Olivia) — NOT as a flag on `dies`. That is what keeps the singular path untouched BY
  // CONSTRUCTION: a batched descriptor has no route into the per-object fire loop at all, so the over-fire
  // is unrepresentable rather than merely gated.
  //
  // The subject is normalised to its SINGULAR form and handed to the SAME creatureSubjectScope switch the
  // singular arm uses, so scope semantics are shared rather than duplicated. Anchored whole-clause: any
  // rider or restricted subject ("…die during your turn", a subtype list) fails the `$` → undetected →
  // Arbiter (SAFE FN). Subtype/nontoken batch variants are deliberately left for a later pass.
  {
    // ⭐ DELEGATED, like the batched-entry arm — the plural subject is singularized and handed back to
    // classifyCondition, and only the EVENT is rewritten to `diesBatch`. So every subject the singular
    // `dies` arm can enforce (nontoken — The Skullspore Nexus #1591; a subtype; the opponent-controlled
    // scope — Spiteful Banditry #2356) comes along with its filters, and every subject it REFUSES is
    // refused here too. The hand-rolled subject regex this replaces admitted only the three bare
    // controller scopes and silently dropped the rest of the family.
    //
    // ⚠️ UNLIKE the entry arm, this needs NO once-per-turn rider, and the difference is the point:
    // `diesBatch` is its OWN event with its own check function, which fires ONCE per call no matter how
    // many members of the batch match. Deaths arrive as an array (the SBA batches them), so the batching
    // is real rather than simulated, and the singular `dies` path is untouched BY CONSTRUCTION — a
    // diesBatch descriptor has no route into the per-object fire loop at all.
    const batchDies = c.match(/^one or more (.+) die$/);
    const singularDies = batchDies ? singularizeBatchSubject(batchDies[1]) : null;
    if (singularDies) {
      const inner = classifyCondition(`${singularDies} dies`, cardName, cardType);
      if (inner && inner.event === "dies" && inner.scope !== "self") return { ...inner, event: "diesBatch" };
    }
  }
  // ===== GY-EVENT conditions (Syr Konrad / Bloodchief Ascension — SHELF S7) ===== card-scoped graveyard
  // traffic watchers, fired per moved card by checkGraveyardEventTriggers off the gameState
  // pendingGraveyardEvents queue. ANCHORED EXACT — a filter this vocabulary can't express ("from your
  // library", "creature card leaves an OPPONENT'S graveyard", "one or more … leave" batch shapes) stays
  // undetected → Arbiter (SAFE FN; the batch form ESPECIALLY must never map to a per-card fire).
  // Konrad clause 2: any player's graveyard, creature cards only, every origin EXCEPT the battlefield
  // (his "another creature dies" clause covers those — the printed union is disjoint by construction).
  if (/^a creature card is put into a graveyard from anywhere other than the battlefield$/.test(c)) {
    return { event: "gyEnter", scope: "gyWatcher", whose: "any", gyCardType: "Creature", gyOwnerScope: "any", excludeFromBattlefield: true };
  }
  // Konrad clause 3: a creature card leaving YOUR graveyard (cast out / reanimated / shuffled in / exiled).
  if (/^a creature card leaves your graveyard$/.test(c)) {
    return { event: "gyLeave", scope: "gyWatcher", whose: "any", gyCardType: "Creature", gyOwnerScope: "you" };
  }
  // BATCHED GY-LEAVE (CR 603.1) — "Whenever ONE OR MORE [creature] cards leave your graveyard" (Desecrated
  // Tomb #4196, Quintorius #9596, Fang #6282, Skeleton Crew — 28 corpus carriers, the largest single
  // sub-family of the one-or-more vein). Fires ONCE per event batch where the singular gyLeave above fires
  // once PER CARD, so mass graveyard exile (Bojuka Bog on a full yard) would otherwise mint a token per card
  // instead of one — the same over-fire diesBatch exists to prevent.
  //
  // A DEDICATED EVENT NAME for the same reason: a batched descriptor then has no route into the per-card
  // fire loop at all. The gyCardType / gyOwnerScope filter fields are IDENTICAL to the singular's, so the
  // batch pass reuses the very same predicates rather than restating them.
  const gyLeaveBatch = c.match(/^one or more (creature )?cards leave your graveyard$/);
  if (gyLeaveBatch) {
    return { event: "gyLeaveBatch", scope: "gyWatcher", whose: "any", gyCardType: gyLeaveBatch[1] ? "Creature" : null, gyOwnerScope: "you" };
  }
  // BATCHED GY-ENTER (CR 603.1) — the inbound mirror: "Whenever ONE OR MORE <type> cards are put into your
  // graveyard from anywhere / from your library" (The Gitrog Monster #897, Titania #5153, Turntimber Sower
  // #7336, Sidisi #3513). Fires ONCE per batch, so a mill of five lands is one trigger, not five.
  //
  // The ORIGIN ZONE is part of the trigger condition, not decoration: "from your library" (a mill payoff)
  // must NOT fire on a creature dying into the yard from the battlefield. gyFromZone carries it and the
  // batch pass filters on `ev.zone`; the "from anywhere" form omits it entirely and matches any origin.
  const gyEnterBatch = c.match(/^one or more (creature|land|artifact|enchantment) cards are put into your graveyard from (anywhere|your library)$/);
  if (gyEnterBatch) {
    const kind = gyEnterBatch[1];
    return {
      event: "gyEnterBatch", scope: "gyWatcher", whose: "any",
      gyCardType: kind.charAt(0).toUpperCase() + kind.slice(1), gyOwnerScope: "you",
      ...(gyEnterBatch[2] === "your library" ? { gyFromZone: "library" } : {}),
    };
  }
  // Bloodchief Ascension trigger 2: ANY card entering an OPPONENT's graveyard from ANY zone (battlefield
  // included — "from anywhere" has no exclusion).
  if (/^a card is put into an opponent's graveyard from anywhere$/.test(c)) {
    return { event: "gyEnter", scope: "gyWatcher", whose: "any", gyCardType: null, gyOwnerScope: "opponent" };
  }
  // EVOLVES-EVENT (Watchful Radstag — SHELF S7, CR 702.100f): "this creature evolves" — fires exactly when
  // the SOURCE's own evolve ability places its +1/+1 counter (the evolve-counter-self resolver calls
  // checkEvolvesTriggers). Self-scope only — the printed form is always the evolving creature's own rider.
  if (selfRef && /\bevolves\s*$/.test(c) && /^(?:this creature|[a-z0-9',. -]+?) evolves$/.test(c)) {
    return { event: "evolves", scope: "self", whose: "any" };
  }
  // ===== BECOMES-TAPPED SELF (BLITZ TR-1, CR 701.26a) ===== the SELF form only ("this creature / this
  // permanent / this artifact / <name> becomes tapped"). CR 701.26a: a permanent "becomes tapped" ONLY on an
  // untapped→tapped transition — NOT when it enters tapped (the ETB-tap sites pass fromEnter to
  // gameState.tapPermanent, which suppresses the event). checkTapTriggers fires the SOURCE's own watcher off
  // the pendingTapEvents queue (recorded by tapPermanent / regeneratePermanent for every real transition — the
  // checkUntapTriggers / pendingUntapEvents mirror; both taps of attacking, mana, crew, and cost payment funnel
  // through tapPermanent). Self-scope ONLY (the becomes-monstrous / evolves discipline): a watcher form ("a
  // creature an opponent controls becomes tapped" — Gideon's Avenger; "enchanted land becomes tapped") or any
  // filtered / compound subject ("becomes tapped or untapped") stays UNDETECTED → Arbiter (a SAFE
  // false-negative, never a mis-scoped or partial fire). The "it deals … / put a +1/+1 counter on it" payoff
  // pronouns bind the source through the existing scope:"self" SELF_PUMP_IT / SELF_COUNTER_IT rewrites.
  if (/\bbecomes tapped\s*$/.test(c)) {
    const subj = c.replace(/\s+becomes tapped\s*$/, "").trim();
    // ⓘ Bare "this" (the re-worded self form) is NOT in this list on purpose — see the leaves-self note
    // above: zero real carriers in the corpus as of 2026-08-05, so it would be unverifiable code.
    const isSelfSubj = subj === "this creature" || subj === "this permanent" || subj === "this artifact"
      || (nameL && subj === nameL) || (shortName && subj === shortName) || (firstWord && subj === firstWord);
    if (selfRef && isSelfSubj) return { event: "becomesTapped", scope: "self", whose: "any" };
  }
  // COUNTERS-PUT-ON SELF (CR 122.6) — "Whenever one or more +1/+1 counters are put on <this creature>".
  // PLURAL FORM ONLY, deliberately: "one or more … are put on" fires ONCE for the whole placement however
  // many counters land. The older SINGULAR wording ("a +1/+1 counter is put on ~" — Fathom Mage) may fire
  // once PER COUNTER and the bundled CR does not settle it; rather than guess a firing COUNT it stays
  // undetected → Arbiter (2 cards, a safe false-negative). CLAUDE.md §1.2 — never invent card behavior.
  // Counter TYPE rides the descriptor so a -1/-1 placement never trips a +1/+1 watcher.
  if (/\bone or more ([+-]\d\/[+-]\d) counters are put on\b/.test(c)) {
    const m = /^whenever one or more ([+-]\d\/[+-]\d) counters are put on (.+)$/.exec(c)
      || /^one or more ([+-]\d\/[+-]\d) counters are put on (.+)$/.exec(c);
    if (m) {
      const subj = m[2].trim().replace(/,$/, "");
      const isSelfSubj = subj === "this creature" || subj === "this permanent" || subj === "this artifact"
        || (nameL && subj === nameL) || (shortName && subj === shortName) || (firstWord && subj === firstWord);
      if (isSelfSubj) return { event: "countersPut", scope: "self", whose: "any", counterType: m[1] };
      // SCOPED COUNTERS-PUT (the "later slice" this comment used to defer) — "one or more +1/+1 counters are
      // put on A CREATURE YOU CONTROL" (Simic Ascendancy #1259, The Powerful Dragon, A-Moss-Pit Skeleton).
      // Routed through the SHARED creatureSubjectScope switch, so it reuses the identical scope vocabulary
      // the dies/etb watchers use rather than inventing one.
      //
      // DISTINCT FROM the active `countersPlaced` form ("whenever YOU PUT one or more…"): this PASSIVE
      // wording fires no matter WHO placed the counters, including an opponent's effect. They are different
      // triggers and must not be folded together — mapping this onto countersPlaced would silently miss every
      // opponent-placed counter.
      //
      // NO BATCHING NEEDED, unlike the dies/gy-leave arms: one addCounter event places N counters on ONE
      // permanent, so the "one or more" is already satisfied per event, and a spell putting counters on three
      // creatures correctly fires three times (the plural counts COUNTERS, not creatures).
      const scopedCounters = creatureSubjectScope(subj);
      if (scopedCounters) return { event: "countersPut", scope: scopedCounters, whose: "any", counterType: m[1] };
    }
    return null;
  }
  // BECOMES-UNTAPPED (Mesmeric Orb — SHELF S6): "a permanent becomes untapped". ANY player's permanent,
  // fired per transition by checkUntapTriggers off the gameState pendingUntapEvents queue (tapped→untapped
  // only; a stun/no-untap skip never fires). The bare form only — a filtered subject ("a Forest", "a
  // permanent you control") stays undetected → Arbiter (never a mis-scoped fire).
  if (/^a permanent becomes untapped$/.test(c)) {
    return { event: "untapped", scope: "anyPermanent", whose: "any" };
  }
  // ⭐ INSPIRED (CR 702.108a — "Inspired — Whenever this creature becomes untapped, …"): King Macar,
  // Disciple of Deceit, Pheres-Band Raiders, Servant of Tymaret and the rest of the Born of the Gods cycle.
  // THE EXACT MIRROR of the becomes-TAPPED self arm above, and it needs NO new runtime: the `untapped` event
  // and its firing site already exist (checkUntapTriggers drains gameState's pendingUntapEvents and threads
  // the untapped permanent as triggeringPermanent), and scope:"self" already gates on
  // `triggeringPermanent.id === sourcePermanent.id`. Only the DETECTOR was missing, so the whole cycle sat
  // on the Arbiter while the machinery to run it was already shipped and tested.
  //
  // The "Inspired —" ability-word label is decorative (CR 207.2c) and is stripped upstream, exactly like
  // "Landfall —" — MEASURED, not assumed: with the label removed the sentence still detected nothing, which
  // is what proved the CONDITION and not the label was the gap.
  //
  // SELF-SCOPE ONLY, mirroring the becomes-tapped discipline verbatim: a watcher form ("a creature you
  // control becomes untapped") or any filtered/compound subject stays UNDETECTED → Arbiter, a safe
  // false-negative rather than a mis-scoped fire. Untapped-only (CR 701.27a): the untap-step and any
  // stun/no-untap skip never record an event, so a creature that was never tapped cannot fire this.
  if (/\bbecomes untapped\s*$/.test(c)) {
    const usubj = c.replace(/\s+becomes untapped\s*$/, "").trim();
    const uIsSelf = usubj === "this creature" || usubj === "this permanent" || usubj === "this artifact"
      || (nameL && usubj === nameL) || (shortName && usubj === shortName) || (firstWord && usubj === firstWord);
    if (selfRef && uIsSelf) return { event: "untapped", scope: "self", whose: "any" };
  }
  // LANDFALL (CR 603 — landfall is an ability word, CR 207.2c, for a TRIGGERED ability; NOT a replacement
  // effect, so not CR 614) — "Landfall — Whenever a land you control enters" /
  // "… a land enters the battlefield under your control" (Tatyova, Lotus Cobra, Rampaging Baloths, Jaddi
  // Offshoot, the Zendikar landfall payoffs). A NEW land-entry event fired by the play-land path
  // (checkLandfallTriggers). Controller-scoped ONLY — the entering land is YOURS. The "Landfall —" ability-word
  // label (CR 207.2c, flavor) is stripped upstream in detectTriggers so the bare condition reaches here. Only
  // the anchored bare forms: a filtered subject ("a basic land", "another land", "a land an opponent controls")
  // or an added "enters tapped" rider fails the anchor → UNDETECTED → Arbiter (never an over-fire we can't scope).
  if (/^a land you control enters$/.test(c) || /^a land enters(?: the battlefield)? under your control$/.test(c)) {
    return { event: "landfall", scope: "landYouControl", whose: "any" };
  }
  // PERM-ENTERS — "Whenever an artifact you control enters" (affinity/improvise payoffs — Reckless
  // Fireweaver, Salivating Gremlins, Thopter Architect) and "Whenever an enchantment you control
  // enters" (Constellation payoffs — Setessan Champion, Nexus Wardens, Favored of Iroas). The
  // "Constellation —" / "Eerie —" ability-word labels are stripped by stripTriggerAbilityLabel before
  // classifyCondition sees them. Controller-scoped ONLY: bare "an artifact enters" (without "you
  // control") covers the opponent's artifacts too — a scope the engine cannot enforce without knowing
  // who controls the entering permanent → UNDETECTED → Arbiter (SAFE false-negative; CLAUDE.md §1.2).
  // Artifact Creature spells match the "artifact" filter (type-line substring, matching CR 205.2).
  if (/^an artifact you control enters(?: the battlefield)?$/.test(c)) {
    return { event: "permanentEnters", permanentFilter: "artifact", scope: "artifactYouControl", whose: "any" };
  }
  if (/^an enchantment you control enters(?: the battlefield)?$/.test(c)) {
    return { event: "permanentEnters", permanentFilter: "enchantment", scope: "enchantmentYouControl", whose: "any" };
  }
  // PERMANENT-WIDE ENTERS — "Whenever a permanent you control enters [TAPPED]" (Amulet of Vigor #1301, Fire
  // Lord Zuko). The missing member of a family that already had artifact / enchantment / token / creature /
  // land; every OTHER subject is a type-narrowed version of this one, so the scope is the same controller
  // gate with no type predicate.
  //
  // The optional "tapped" qualifier is a live-state read on the ENTERING permanent, checkable at exactly the
  // moment the event fires — the play path taps a land BEFORE it fires enter triggers, and the cast/token/
  // zone paths mint untapped unless something taps them first. Same controller-scoped-only rule as its
  // siblings: a bare "a permanent enters" (no "you control") covers opponents' permanents too and stays
  // UNDETECTED → Arbiter.
  {
    const pm = c.match(/^a permanent you control enters(?: the battlefield)?( tapped)?$/);
    if (pm) {
      const desc = { event: "permanentEnters", scope: "permanentYouControl", whose: "any" };
      if (pm[1]) desc.enteredTapped = true;
      return desc;
    }
  }
  // TOKEN-ENTERS — "Whenever a token you control enters" (Junk Winder — the token-swarm tap payoff). Fires the
  // permanentEnters event (checkPermanentEntersTriggers is called on every minted token from tokens.js's
  // fireTokenEnterTriggers, and on ANY permanent entry). scopeMatches' tokenYouControl gates it to the entering
  // permanent's `card.token` flag (the token-factory convention) AND the controller ("you control") — a
  // NONTOKEN entry never fires (no over-fire). Controller-scoped ONLY: a bare "a token enters" (without "you
  // control") would cover an opponent's token, a scope the engine can't enforce → UNDETECTED → Arbiter (SAFE
  // false-negative), mirroring the artifact/enchantment perm-enters discipline above.
  if (/^a token you control enters(?: the battlefield)?$/.test(c)) {
    return { event: "permanentEnters", permanentFilter: "token", scope: "tokenYouControl", whose: "any" };
  }
  // ===== LTB / PiG WATCHER (CR 700.4 / 603.6e) — "a <filter> you control is put into a graveyard from the
  // battlefield" / "a token you control leaves the battlefield" ===== The aristocrats LTB drains (Marionette
  // Apprentice / Master, Nadier's Nightblade). The leaving permanent is the TRIGGERING permanent; the WATCHER
  // (source) drains. checkLeavesTriggers fires the event off the gameState `pendingLeaveEvents` look-back
  // (recorded at the single moveCardToZone chokepoint, so EVERY battlefield exit — death/sac/destroy/bounce —
  // is seen). Each scope below is controller-gated ("you control"); a no-controller form (an opponent's, or a
  // bare "a creature is put into a graveyard") stays UNDETECTED → Arbiter (the engine can't faithfully scope
  // it), mirroring the dies/etb controller-only discipline. The SELF form ("when THIS is put into a graveyard"
  // — Rancor's Aura self-PiG-return) is detected separately by the selfReturn.js registry detector, NOT here,
  // so these watcher shapes never collide with it. CREED: each is END-anchored; any rider / extra type / power
  // restriction beyond the modeled shapes leaves residue → null → Arbiter (a SAFE false-negative).
  //
  // PiG (graveyard-only): "is put into a graveyard from the battlefield". The drain EFFECT ("each opponent
  // loses 1 life", "target opponent loses life equal to this creature's power") already parses HIGH.
  if (/\bis put into a graveyard from the battlefield$/.test(c)) {
    const pigSubj = c.replace(/\s+is put into a graveyard from the battlefield$/, "").trim();
    // SELF-PiG (BLITZ TR-3, CR 700.4 + 603.6c) — "when THIS <artifact|creature|enchantment|permanent> is put
    // into a graveyard from the battlefield, <effect>" (Nutrient Block / Implement of Examination "draw a
    // card"). Fires the SELF "ltb" event checkLeavesTriggers already enqueues for EVERY graveyard exit of the
    // source (source === triggering === the leave look-back; toGraveyard-gated, so a bounce/exile never fires
    // it — CR 700.4). "this aura" is DELIBERATELY excluded from the alternation so the Aura self-PiG-return
    // (Rancor) still reaches the selfReturn.js registry detector, which adds the selfReturnKind rewrite the
    // bare "return it to its owner's hand" needs — classifyCondition has priority over the registry, so
    // matching "this aura" HERE would strip that rewrite and break it (CREED). The effect routes through the
    // normal pipeline; a bare self-return (Spine of Ish Sah) or a cost/optional effect ("you may pay {G}") is
    // NOT a modeled atom on this event → triggerRoutesNatively false → the card stays body-only → Arbiter (a
    // SAFE false-negative, whole-card law). A creature form fires via "ltb" (checkLeavesTriggers), NOT "dies"
    // (checkDiesTriggers) — one descriptor, one event, so a spelled-out creature self-PiG never double-fires.
    // ⭐ "this aura" JOINED THE ALTERNATION (Role tokens phase 3 — the Wicked Role's
    // "…, each opponent loses 1 life."). It was excluded because classifyCondition has priority over the
    // selfReturn.js registry, so matching it here USED to strip the `selfReturnKind` rewrite that Rancor's bare
    // "return it to its owner's hand" needs. The fix is to carry that marker rather than avoid the subject:
    // this branch now returns the SAME descriptor the registry returned for an Aura, so Rancor is
    // byte-identical, while every OTHER payoff finally reaches the normal effect pipeline.
    //
    // ⛔ THE DISCRIMINATION LIVES WHERE THE EFFECT IS IN SCOPE, WHICH IS NOT HERE. classifyCondition sees only
    // the condition, so it cannot tell Rancor from Wicked. It doesn't have to: the caller already gates the
    // rewrite on `cls.selfReturnKind && SELF_RETURN_IT_RE.test(effectClause)`. Rancor's effect matches and gets
    // the rewrite; Wicked's does not and routes normally. Marking the aura subject is therefore free.
    //
    // ⚠️ The marker is set ONLY for the aura subject. Setting it for artifact/creature/enchantment/permanent
    // would newly hand the rewrite to their bare self-returns (Spine of Ish Sah), which is an unmeasured
    // widening — those stay exactly as they were.
    if (/^this (?:artifact|creature|enchantment|permanent|aura)$/.test(pigSubj)
        || (selfRef && nameL && (pigSubj === nameL || (shortName && pigSubj === shortName)))) {
      return pigSubj === "this aura"
        ? { event: "ltb", scope: "self", whose: "any", selfReturnKind: "self" }
        : { event: "ltb", scope: "self", whose: "any" };
    }
    // Marionette Apprentice — "another creature or artifact you control" (the "another" excludes the source).
    if (pigSubj === "another creature or artifact you control")
      return { event: "permanentLeaves", scope: "creatureOrArtifactYouControlPiG", whose: "any" };
    // The non-"another" union (no live corpus card, but the symmetric form) — "a creature or artifact you control".
    if (pigSubj === "a creature or artifact you control")
      return { event: "permanentLeaves", scope: "creatureOrArtifactYouControlPiG", whose: "any", includeSelf: true };
    // The REVERSED word order (Agent of the Iron Throne — "an artifact or creature you control"), granted onto
    // Commander creatures by a Background enchantment. Same union, same scope — CR draws no distinction between
    // "creature or artifact" and "artifact or creature"; only the printed word order differs.
    if (pigSubj === "an artifact or creature you control")
      return { event: "permanentLeaves", scope: "creatureOrArtifactYouControlPiG", whose: "any", includeSelf: true };
    if (pigSubj === "another artifact or creature you control")
      return { event: "permanentLeaves", scope: "creatureOrArtifactYouControlPiG", whose: "any" };
    // Marionette Master — "an artifact you control" (the source is a creature, never an artifact → never self-fires).
    if (pigSubj === "an artifact you control")
      return { event: "permanentLeaves", scope: "artifactYouControlPiG", whose: "any" };
    // "another artifact you control" — the source-excluding artifact form (Disciple of the Vault-style).
    if (pigSubj === "another artifact you control")
      return { event: "permanentLeaves", scope: "artifactYouControlPiG", whose: "any", excludeSelf: true };
    // ===== BROAD ARTIFACT-PiG (BLITZ TR-3, CR 700.4 / 603.6e) ===== "an artifact is put into a graveyard from
    // the battlefield" — ANY player's artifact, NOT controller-scoped (Molder Beast, Fangren Marauder, Moriok
    // Rigger, Disciple of the Vault). The typed sibling of "a creature dies": for artifacts there is no "dies"
    // keyword (CR 700.4 is creature-only), so the event is spelled out. The dedicated artifactAnyPiG scope
    // drops the controller gate the "you control" PiG scopes carry — the sole non-controller PiG scope — and
    // fires off the SAME checkLeavesTriggers permanentLeaves path (self-source + battlefield-watcher scan), so
    // an artifact-typed watcher (Summoning Station) firing on its own death is CR-correct (an artifact IS put
    // into a graveyard). Bare "an artifact" ONLY: a controlled/filtered variant is handled above or parks.
    if (pigSubj === "an artifact")
      return { event: "permanentLeaves", scope: "artifactAnyPiG", whose: "any" };
    // "a creature you control" PiG (the dies-equivalent LTB wording — fires on a graveyard exit only).
    if (pigSubj === "a creature you control")
      return { event: "permanentLeaves", scope: "creatureYouControlPiG", whose: "any" };
    // "an enchantment you control is put into a graveyard from the battlefield" (Wicked Visitor, Ashiok's
    // Reaper, Knight of Doves, Savior of the Sleeping — the enchantment-death aristocrats) — the ENCHANTMENT
    // analog of the artifact/creature PiG scopes above. Graveyard exit only (CR 700.4). No "another" here → the
    // source self-includes (an enchantment-typed source dying fires its own PiG, CR-correct); the current corpus
    // sources are all creatures (never enchantments), so self never matches in practice. The payoffs ("each
    // opponent loses 1 life" / "draw a card" / "create a token" / "put a +1/+1 counter on this creature") parse
    // HIGH and reference the SOURCE, not the leaving enchantment — no pronoun binding needed.
    if (pigSubj === "an enchantment you control")
      return { event: "permanentLeaves", scope: "enchantmentYouControlPiG", whose: "any" };
  }
  // LEAVES (any zone): "a token you control leaves the battlefield" (Nadier's Nightblade) — fires on a token's
  // exit to ANY zone (death, sac, bounce, exile), CR 111.7. The token gate is on the leaving permanent's
  // card.token flag (set by the token factory), so a NONTOKEN leaving never fires (no over-fire).
  if (/\bleaves the battlefield$/.test(c)) {
    const ltbSubj = c.replace(/\s+leaves the battlefield$/, "").trim();
    if (ltbSubj === "a token you control")
      return { event: "permanentLeaves", scope: "tokenYouControlLeaves", whose: "any" };
    // "another creature you control leaves the battlefield" (Ninth Bridge Patrol, Flaming Fist Officer) — the
    // CREATURE any-exit LEAVES analog of the token form above: fires on EVERY exit of another creature you
    // control (death, sac, bounce, exile, tuck — CR 603.6c has no zone gate, unlike the graveyard-only PiG
    // scopes). otherCreatureYouControlLeaves gates on isCreaturePerm + same-controller + not-self (the "another"
    // id-check, so the source's own leave never self-fires). The clean corpus payoff is a self-pump ("put a
    // +1/+1 counter on this creature") — references the SOURCE, no leaving-creature pronoun binding. A
    // self-or-another / leaves-without-dying / intervening-if variant leaves residue → stays UNDETECTED → Arbiter.
    if (ltbSubj === "another creature you control")
      return { event: "permanentLeaves", scope: "otherCreatureYouControlLeaves", whose: "any" };
  }
  // "Leaves the battlefield" (LTB) for OTHER subjects is intentionally NOT detected here: a self-LTB / un-scoped
  // form whose effect the engine can't fire would be a false positive (the whole ability silently does nothing,
  // e.g. City Pigeon's "When this leaves the battlefield, create a Food token"). Those stay UNDETECTED → Arbiter.
  // The self-PiG Aura-return (Rancor) is handled by the selfReturn.js registry detector. NOTE: the self-sac
  // fail-safe (abilities.sacrificeDropsTrigger) independently detects "leaves the battlefield" to keep self-sac
  // costs safe — that path is unaffected.

  // ===== EACH-PLAYER'S UPKEEP (BLITZ TR-2, CR 603.2b + 503.1a) ===== "At the beginning of EACH PLAYER'S
  // upkeep, <effect>" — fires at the beginning of EVERY upkeep step (once per player per turn cycle),
  // controller-independent, exactly like the bare "each upkeep" wording below (whose:"any" — checkStepTriggers
  // fires the "upkeep" event once per upkeep-step entry, so the once-per-upkeep guarantee is structural; the
  // whose:"yours" gate is what it deliberately does NOT carry). The eachPlayersUpkeep flag gates the
  // "that player" → "the upkeep player" SENTINEL rewrite in detectTriggers (the gyOwner precedent): "that
  // player" in this trigger's effect is the player WHOSE UPKEEP IT IS (ctx.upkeepPlayerId = the active
  // player, threaded by checkStepTriggers), NOT the combat-damaged player the bare "that player" atoms bind
  // (who:"damagedPlayer" — whose referent gate correctly keeps those off upkeep events). Whole-clause
  // anchored ^…$ — a rider on the condition leaves it UNDETECTED → Arbiter (a SAFE false-negative).
  if (/^the beginning of each player[’']s upkeep$/.test(c)) {
    return { event: "upkeep", scope: "you", whose: "any", eachPlayersUpkeep: true };
  }
  // ===== ENCHANTED-CONTROLLER'S UPKEEP (2026-08-12, CR 603.2b — Stab Wound, Soul Bleed, One Thousand
  // Lashes, Wanderlust, Parasitic Bond, Super Intelligence class; 21 parked carriers on this ONE event) =====
  // "At the beginning of the upkeep of ENCHANTED CREATURE'S CONTROLLER, <effect>" — an Aura trigger that
  // fires on the HOST's controller's upkeep. The aura's own controller is usually an OPPONENT (Stab Wound
  // is MY aura on YOUR creature, firing on YOUR upkeep), which is exactly why whose:"yours" is wrong here.
  // event:"upkeep" whose:"any" rides the step machinery unchanged; the enchantedControllersUpkeep flag
  // (a) adds the host-controller firing gate in the step-descriptor loop — fire ONLY when the aura is
  // attached and its host's controller IS the player whose upkeep it is — and (b) gates the same
  // "that player" → "the upkeep player" sentinel rewrite the each-player's arm uses: by construction of
  // the gate, the upkeep player IS the host's controller, so every existing who:"upkeepPlayer" atom
  // (lose-life, damage, draw, discard…) binds the right seat. "that creature" (the host) has NO sentinel
  // yet — those clauses stay unbound → LOW → Arbiter (safe FN; the Unstable Mutation counter trio parks).
  if (/^the beginning of the upkeep of enchanted creature[’']s controller$/.test(c)) {
    return { event: "upkeep", scope: "you", whose: "any", enchantedControllersUpkeep: true };
  }
  // ===== EACH-PLAYER'S DRAW STEP (CR 504.1 + 603.2b) ===== "At the beginning of EACH PLAYER'S draw step,
  // <effect>" (Rites of Flourishing #1524, Kami of the Crescent Moon #1817, Dictate of Kruphix #1907). The
  // exact structural twin of the upkeep arm above, and it reuses that arm's machinery rather than growing a
  // parallel set: `checkStepTriggers` fires the "draw" event once per draw-step ENTRY, so "once per player
  // per turn cycle" is structural here for the same reason it is there, and the player whose draw step it is
  // IS the active player (CR 504.1) — the same identity the upkeep referent relies on.
  //
  // ⚠️ THE FLAG IS SEPARATE, THE SENTINEL IS SHARED. `eachPlayersDrawStep` gates the same "that player" →
  // "the upkeep player" rewrite, so all of the existing who:"upkeepPlayer" atoms bind correctly with no
  // duplication. The ctx field and sentinel keep their historical UPKEEP names because renaming them means
  // touching 47 call sites across 9 files for cosmetics; read them as "the player whose STEP it is". Both
  // gates that pin the referent (checkStepTriggers' threading and triggerRouting's event check) are widened
  // to the draw step in lockstep — leaving either one behind makes the clause silently no-op, which is the
  // dropped-clause FP this double gate exists to prevent.
  if (/^the beginning of each player[’']s draw step$/.test(c)) {
    return { event: "draw", scope: "you", whose: "any", eachPlayersDrawStep: true };
  }
  // ===== "THE END STEP" (BLITZ TR-3, CR 513.1/513.2 + 603.2b) ===== "At the beginning of THE end step, …"
  // (Ball Lightning, Impetuous Devils, Glitterfang, Underworld Breach) — the OLD unqualified end-step
  // templating. Per CR 513.2 (which quotes this exact wording) and the printed ruling (Glitterfang "triggers
  // at the beginning of each end step, no matter whose turn it is"), "the end step" = the end step of EVERY
  // turn — so whose:"any" (identical firing to "each end step" below), NOT whose:"yours". The distinction is
  // load-bearing: a self-sacrifice / self-bounce that fires only on the controller's end step would UNDER-fire
  // on an off-turn survival — CR-wrong. checkStepTriggers fires the "endStep" event once per end-step entry, so
  // whose:"any" gives exactly one fire per turn's end step. Whole-clause ^…$ anchored — the delayed
  // "your NEXT end step" (a one-shot delayed trigger, CR 603.7b), the Aura "end step of enchanted creature's
  // controller" wording, and any rider all fail the anchor → UNDETECTED → Arbiter (a SAFE false-negative).
  if (/^the beginning of the end step$/.test(c)) {
    return { event: "endStep", scope: "you", whose: "any" };
  }
  if (/beginning of (your|each) (upkeep|end step|draw step)/.test(c)) {
    const whose = /\beach\b/.test(c) ? "any" : "yours";
    const event = /end step/.test(c) ? "endStep" : /draw step/.test(c) ? "draw" : "upkeep";
    return { event, scope: "you", whose };
  }
  // (The "beginning of your first main phase" timing is owned by the REGISTERED detector —
  // triggerScheduler.detectPhaseTrigger → event "firstMain", fired at gameEngine's precombat-main entry.
  // It is deliberately NOT duplicated here: classifyCondition has priority over the registry, so an
  // inline copy would shadow the canonical event name. Lesson re-learned 2026-07-24: grep for the
  // existing mechanism before adding a timing.)
  // TRIG-LIFEGAIN — the lifegain event (CR 119.3, a player gaining life). BARE "you gain life" only,
  // anchored: a conditional ("…for the first time each turn") or compound ("…gain or lose life") leaves
  // residue and stays UNDETECTED → Arbiter (a SAFE false-negative). whose:"any" NOT "yours" — life gain
  // isn't tied to the active player's turn (lifelink / an instant resolve on ANY turn), and the activePlayer
  // gate on "yours" (triggersForEvent) would wrongly drop an off-turn gain. checkLifegainTriggers instead
  // scans ONLY the gaining player's sources, so "you gain life" still fires for the gainer alone.
  // STATE TRIGGER (CR 603.8) — "When you control no <X>, <effect>." (Seasinger's "no Islands", Barbarian
  // Outcast's "no Swamps"; 19 corpus carriers, all one shape). Unlike every other event here this is not a
  // discrete happening: the condition is CHECKED continuously and the ability triggers whenever it is true,
  // at the same cadence as state-based actions (checkStateTriggers, fired from the CR 704.3 fixpoint).
  // CREED: detected ONLY when interveningIf.js can actually READ the condition — the "you control no
  // <filter>" vocabulary it already owns — so a shape the evaluator can't judge stays undetected → Arbiter.
  // The latch that stops it re-firing every SBA pass lives in the checker (CR 603.8: it triggers again only
  // after the condition stops being true), exactly like renown's flag rather than a fail-open board read.
  if (/^you control no /.test(c) && interveningIfParseable(c)) {
    return { event: "stateTrigger", scope: "self", whose: "any", stateCondition: c };
  }
  if (/^you gain life$/.test(c)) return { event: "lifegain", scope: "you", whose: "any" };
  // TRIG-DRAW — the card-draw event (CR 121.1, drawing a card). BARE "you draw a card" only, anchored: a
  // conditional ("…your second card each turn"), scaled, or compound variant leaves residue and stays
  // UNDETECTED → Arbiter (a SAFE false-negative). Like lifegain, whose:"any" + checkCardDrawnTriggers scans
  // ONLY the drawing player's sources (drawing is turn-agnostic — an instant draws on any player's turn).
  if (/^you draw a card$/.test(c)) return { event: "cardDrawn", scope: "you", whose: "any" };
  // TRIG-DRAW-OPPONENT (Smothering Tithe) — "Whenever an opponent draws a card, …". The DRAWING player is an
  // opponent of the source's controller, and (for the taxed-treasure payoff) that opponent is the PAYER. Shares
  // the "cardDrawn" event with the "you draw" form above, distinguished by scope:"opponentDraw" + whose:"opponent"
  // (the milled/cast precedent). checkCardDrawnTriggers scans the drawer's OPPONENTS' sources for this descriptor
  // and threads drawingPlayerId as the payer. BARE form ONLY ("an opponent draws a card"); a scaled/conditional/
  // filtered variant leaves residue → null → Arbiter (SAFE false-negative). scope:"opponentDraw" matches in
  // scopeMatches like "milled"/"you" (returns true — the whose:"opponent" gate lives in the dedicated checker).
  if (/^an opponent draws a card$/.test(c)) return { event: "cardDrawn", scope: "opponentDraw", whose: "opponent" };
  // ===== OPPONENT DISCARD (CR 701.9a) ===== "Whenever an opponent discards a card, …" — Liliana's Caress,
  // Raiders' Wake, Fell Specter, Megrim, Sangromancer, Geth's Grimoire, Tourach, Abyssal Nocturnus. The
  // structural twin of the opponentDraw arm directly above, and fired the same way: checkDiscardTriggers
  // scans the DISCARDER's opponents' watchers, so the whose gate is the scan itself. Whole-clause anchored —
  // a filtered variant ("an opponent discards a nonland card") leaves residue → null → Arbiter (SAFE FN).
  if (/^an opponent discards a card$/.test(c)) return { event: "discarded", scope: "opponentDiscard", whose: "opponent" };
  // ⭐⭐ SELF DISCARD (CR 701.9a) — "Whenever you discard a card, …" / "Whenever you cycle or discard [an]other
  // card, …" (Grisly Survivor, Hekma Sentinels, Ruthless Sniper, Curator of Mysteries, Archfiend of Ifnir,
  // Drannith Healer, Pitiless Vizier, …). **The event and its fire sites have shipped all along** — the
  // dispatcher already calls checkDiscardTriggers from every discard path, cost sites included (CR 701.9a:
  // "a discard paid as a COST is still a discard"). What was missing is that the checker only ever scanned
  // the discarder's OPPONENTS, so a self-scoped watcher could not exist. Both halves built, never met.
  // ⭐ "CYCLE OR DISCARD" COLLAPSES TO THE DISCARD EVENT HERE, and that is CR-correct rather than a
  // shortcut: cycling discards the card (CR 702.29a), and the dispatcher's cycling path already calls
  // checkDiscardTriggers. One cycle = one discard = one fire, so the compound wording needs no second event.
  // ⛔ A CYCLE-ONLY FORM IS REFUSED ("whenever you cycle a card" — and the "a player cycles" variants,
  // Stoic Champion / Warped Researcher). Routing those through the discard event would fire them on an
  // ordinary discard, which is strictly more than printed. They stay UNDETECTED → Arbiter (safe FN) until
  // there is a real cycling event to hang them on.
  // ⓘ "ANOTHER card" (Archfiend of Ifnir, Curator of Mysteries) is admitted: the watcher is a permanent on
  // the battlefield and the discarded card is in hand, so "another" is satisfied by construction — there is
  // no case where the source could be the discarded card.
  if (/^you (?:cycle or discard|discard) (?:a|another) card$/.test(c)) return { event: "discarded", scope: "youDiscard", whose: "any" };
  // TRIG-DRAW2 — "draw your second card each turn" (the draw-doubler payoff). Anchored to the BARE
  // second-card form (each/this turn); a different ordinal ("first/third"), scaled, or rider variant stays
  // UNDETECTED → Arbiter. Same whose:"any" + scan-only-the-drawer as cardDrawn; fires ONCE when the draw
  // crosses the 2nd card of the turn (checkCardDrawnTriggers reads cardsDrawnThisTurn, reset for all seats).
  if (/^you draw your second card (?:each|this) turn$/.test(c)) return { event: "drawSecond", scope: "you", whose: "any" };
  // TRIG-DRAW2-OPP — "an opponent draws their second card each turn" (Faerie Mastermind). Same drawSecond event
  // as the "you" form above, but whose:"opponent" — the DRAWING player must be an opponent of the watcher's
  // controller. checkCardDrawnTriggers gates it exactly like checkMilledTriggers' opponent-milled path
  // (opponentsOf(watcher.controller).includes(drawingPlayer)), scanning EVERY player's watchers (not just the
  // drawer's) so a defender's Faerie Mastermind fires when an OPPONENT crosses their 2nd draw. The payoff
  // resolves for the SOURCE's controller ("you draw a card" = the watcher's controller, makePendingTrigger's
  // default controller — the drawer is the opponent, "you" is the Faerie's owner). BARE second-card form only;
  // "their" is the only possessive (the drawer is the opponent). A rider/scaled/other-ordinal variant leaves
  // residue and stays UNDETECTED → Arbiter (a SAFE false-negative). CREED: no partial — the whole card routes
  // to the Arbiter if any clause is unmodeled.
  if (/^an opponent draws (?:their|his or her) second card (?:each|this) turn$/.test(c)) return { event: "drawSecond", scope: "you", whose: "opponent" };
  // TRIG-SACRIFICE — "Whenever you sacrifice a <permanent|creature|artifact>" (the sac'd thing is always
  // YOURS, so the scope is an EXACT type-predicate on the sacrificed permanent, checked in
  // checkSacrificeTriggers — NOT a scopeMatches scope). The three type-checkable card-TYPE subjects classify
  // with sacScope = the type word; a "creature you control"-style restriction subject → null → Arbiter (SAFE
  // — a restriction the engine can't check exactly, CLAUDE.md §1.2). "another" excludes the source permanent.
  const sacM = c.match(/^you sacrifice (a|an|another) (permanent|creature|artifact)$/);
  if (sacM) return { event: "sacrifice", scope: "you", whose: "any", sacScope: sacM[2], sacAnother: sacM[1] === "another" };
  // TRIG-SACRIFICE ANY-PLAYER (Mayhem Devil, Carmen/Mazirek/Zodiark/Thraximundar/Mortician Beetle/Fumulus/
  // Merchant of Venom — 8 real corpus carriers) — "Whenever A PLAYER sacrifices a <X>", as opposed to "you
  // sacrifice" above: this fires off ANY player's sacrifice, including the watcher's own controller's (the
  // subject is a generic player, not "you"). scope:"anyPlayerSac" is a distinct value from "you" so
  // checkSacrificeTriggers can scan every player's battlefield for it (mirrors the dies-trigger cross-player
  // scan at checkDiesTriggers), not just the sacrificer's own side. Optional "nontoken" filter (Fumulus,
  // "sacrifices a nontoken creature") — checked in sacScopeMatches alongside the existing type predicate.
  const sacAnyM = c.match(/^a player sacrifices (a|an|another) (nontoken )?(permanent|creature|artifact)$/);
  if (sacAnyM) {
    return {
      event: "sacrifice", scope: "anyPlayerSac", whose: "any",
      sacScope: sacAnyM[3], sacAnother: sacAnyM[1] === "another", nontokenFilter: !!sacAnyM[2],
    };
  }
  // TRIG-SELF-SACRIFICE (BLITZ OC-1, the Ordeal cycle) — "When YOU SACRIFICE THIS Aura/enchantment,
  // <payoff>". A zone-change trigger that LOOKS BACK IN TIME (CR 603.10a — abilities that trigger when a
  // player sacrifices a permanent), on the sacrificed permanent ITSELF: by the time it fires the source has
  // already left the battlefield, so the battlefield watcher scan can never see it. It is fired directly
  // from the sacrifice chokepoint (checkSacrificeTriggers reads the SACRIFICED card's own descriptors off
  // the look-back), which every sacrifice path funnels through — the effect/edict sac, the cost sac, the
  // Treasure-crack, the Saga sweep, and the Ordeal threshold-sac atom. "You" is satisfied by construction:
  // only a permanent's controller can sacrifice it (CR 701.21a), and the chokepoint gates on it anyway.
  // CRITICALLY this event NEVER fires on a non-sacrifice exit — an Aura put into the graveyard by the
  // state-based action (host died, CR 704.5m) or destroyed/bounced is NOT sacrificed, and none of those
  // paths call the sacrifice chokepoint. BARE self form only ("this aura"/"this enchantment"); any other
  // subject ("you sacrifice it" mid-compound, a named subject) stays UNDETECTED → Arbiter (SAFE FN).
  if (/^you sacrifice this (?:aura|enchantment)$/.test(c)) return { event: "youSacrificeThis", scope: "self", whose: "any" };
  // TRIG-SACRIFICE SUBTYPE — "Whenever you sacrifice a <Subtype>" (Captain Lannery Storm "sacrifice a
  // Treasure"; the artifact-token subtypes Clue/Food/Gold; tribal "sacrifice a Goblin/Saproling"). The sac'd
  // permanent's TYPE LINE is checked for the subtype word in checkSacrificeTriggers (sacScopeMatches' subtype
  // branch) — an EXACT word-bounded predicate, so a non-matching sac never fires (no over-fire). Carried as
  // sacSubtype (a capitalized single-word subtype) distinct from the card-TYPE sacScope above. A multi-word /
  // restricted subject ("a Treasure you control", "a creature token") leaves residue → fails the `$` anchor →
  // null → Arbiter. NON_SUBTYPE_ETB_WORDS rejects a meta/supertype/color word (those are card-TYPE or
  // un-type-line-checkable; "creature"/"permanent"/"artifact" are handled by the card-TYPE matcher above), so
  // a subject the type-line scan can't faithfully restrict stays on the Arbiter (CREED FP guard).
  // NAMED-TOKEN SUFFIX (Gluttonous Guest — "Whenever you sacrifice a Blood TOKEN"). The optional trailing
  // " token" is the same subject as the bare form: a Blood token's type line is "Token Artifact — Blood",
  // so the existing sacSubtype word-bounded scan already matches it — only the `$` anchor was rejecting the
  // extra word (this arm's own comment named "a creature token" as a casualty of that anchor).
  // ⚠️ The SAME NON_SUBTYPE_ETB_WORDS guard still runs, which is what keeps "a CREATURE token" refused:
  // "creature" is a card TYPE, and admitting it here would silently duplicate the card-TYPE matcher above
  // with a different (and wrong) predicate. No new allowlist — reusing the existing guard means the two
  // spellings cannot drift apart.
  const sacSubM = c.match(/^you sacrifice (a|an|another) ([a-z]{3,})(?: token)?$/);
  if (sacSubM && !NON_SUBTYPE_ETB_WORDS.has(sacSubM[2])) {
    return { event: "sacrifice", scope: "you", whose: "any", sacSubtype: sacSubM[2].charAt(0).toUpperCase() + sacSubM[2].slice(1), sacAnother: sacSubM[1] === "another" };
  }
  // ===== TOKEN-CHANGE (CR 111 / 701.7) ===== "Whenever you create a token", "Whenever you sacrifice a
  // token", or the compound "Whenever you create or sacrifice a token" (Mirkwood Bats, Marionette Master-
  // style payoffs). Modeled as ONE descriptor (event:"tokenChange") carrying which sub-events it responds to
  // (onCreate / onSacrifice) — so a single shaped trigger sentence maps to ONE detected descriptor (the
  // coverage tally stays 1:1) yet can fire from BOTH the token-mint chokepoint (checkTokenCreatedTriggers)
  // and the sac chokepoint (checkTokenSacrificedTriggers). Each token created/sacrificed is a SEPARATE event
  // (CR 111.1 — each token is its own object), so the dedicated checkers fire the descriptor ONCE PER token.
  // BARE form ONLY ("a token", no type/subtype/"nontoken" filter) — a filtered variant ("a creature token",
  // "an artifact token", "a Treasure") leaves residue → null → Arbiter (a SAFE false-negative; the engine
  // can't faithfully scope which tokens count). "you" subject only (the controller's own create/sac).
  if (/^you create or sacrifice a token$/.test(c)) return { event: "tokenChange", scope: "you", whose: "any", onCreate: true, onSacrifice: true };
  if (/^you create a token$/.test(c)) return { event: "tokenChange", scope: "you", whose: "any", onCreate: true, onSacrifice: false };
  if (/^you sacrifice a token$/.test(c)) return { event: "tokenChange", scope: "you", whose: "any", onCreate: false, onSacrifice: true };
  // ===== COUNTERS-PLACED (CR 122.1 / 121.6) ===== "Whenever you put one or more +1/+1 counters on a
  // creature you control" (Terrasymbiosis, Stocking the Pantry, Casey Jones) / "…on a creature" (Earth
  // Kingdom General — ANY creature, not just yours). The TRIGGERING player is YOU (the source's controller),
  // and the event fires ONCE per counter-placement EVENT (CR 122.6 — counters are placed as one event),
  // NOT once per counter, with "that many"/"that much" = the NUMBER of +1/+1 counters placed in that event.
  // Fired at the +1/+1 placement chokepoint (applyAddCounter → checkCounterPlacedTriggers), controller-scoped
  // (only the placer's watchers are scanned — exactly like the token-mint hook). The "that many" referent is
  // threaded as ctx.countersPlaced; the draw/gain-life payoffs read it via countContext (resolveScaledAmount).
  //
  // BARE +1/+1 form ONLY. CREED — a RESTRICTED subject leaves residue → null → Arbiter (a SAFE false-negative;
  // the engine can't faithfully scope it): "on ANOTHER creature" (Knight of Wundagore — source-exclusion),
  // "on another COLORLESS creature" (Omarthis), "on this creature" (Exemplar — that's the self IT-COUNTER path),
  // "on one or more other Heroes" (Invisible Woman — subtype filter). Also EXACTLY "one or more" / fixed
  // count word — a SINGULAR "put a +1/+1 counter on a creature" (Ant-Man) would fire on a 1-counter event but
  // its "that many"-less payoff (create a token) is a SEPARATE slice, so it's left out here (no over-claim).
  // scope:"creatureYouControl" = count only counters on creatures the placer controls; scope:"creature" = any.
  if (/^you put one or more \+1\/\+1 counters on a creature you control$/.test(c)) return { event: "countersPlaced", scope: "creatureYouControl", whose: "any" };
  if (/^you put one or more \+1\/\+1 counters on a creature$/.test(c)) return { event: "countersPlaced", scope: "creature", whose: "any" };
  // ===== YOU ATTACK ===== "you attack" (the bare condition for "Whenever you attack, …" — fires ONCE
  // per combat when the controller declares any attacker). Different from "attacks" (per-attacker scope):
  // "you attack" is a controller-scoped once-per-combat event (Toph, Earthbending Master's second trigger).
  // Must be checked BEFORE the \battacks\b guard since both words are in "you attack".
  if (/^you attack$/.test(c)) return { event: "youAttack", scope: "you", whose: "any" };
  // BATCHED ATTACK (CR 508.1) — "Whenever ONE OR MORE creatures you control attack" is the OLDER TEMPLATING
  // for the identical trigger condition Wizards now words as "Whenever you attack": both fire exactly ONCE
  // per combat in which the controller declared at least one attacker. So it maps onto the SAME youAttack
  // event and needs no new machinery — checkAttackTriggers' once-per-combat pass already handles it, which
  // is also what makes it safe (routing it through the per-attacker `attacks` event instead would fire once
  // per attacker: a 3-creature alpha strike drawing 3 cards, the over-fire this family exists to avoid).
  //
  // DEFENDER-SIDE IS EXCLUDED: "one or more creatures attack YOU" is an opponent attacking, a different
  // event entirely, and the anchored "you control" requirement keeps it out. A variant with an OBJECT
  // ("…attack a player", "…attack an opponent") is likewise not claimed — the bare form only (safe FN).
  if (/^one or more creatures you control attack$/.test(c)) return { event: "youAttack", scope: "you", whose: "any" };
  // ===== BATTALION (CR 702.101a) + THE ATTACK-COUNT FAMILY =====
  // "Battalion — Whenever THIS CREATURE and at least two other creatures attack, …" (Legion Loyalist,
  // Boros Strike-Captain, Ordruun Veteran, 19 sole-blocked carriers) and its unlabelled sibling
  // "Whenever you attack with N or more creatures, …" (Military Intelligence).
  //
  // BOTH are the once-per-combat `youAttack` event with a MINIMUM ATTACKER COUNT — not a new event. That
  // matters for correctness, not just economy: routing them through the PER-ATTACKER `attacks` event would
  // fire once per attacker (a 3-creature alpha strike drawing 3 cards), which is exactly the over-fire the
  // batched-attack note directly above exists to prevent.
  //
  // The ability-word label was never the blocker — a `Landfall —` prefix already detects fine. The
  // CONDITION was: nothing here could express "and at least two other creatures attack". Measured before
  // building, with the label removed, so the diagnosis isn't guessed.
  //
  // TWO FIELDS, and battalion needs both:
  //   minAttackers        — total attacking creatures the controller must have declared.
  //   requireSelfAttacking— battalion says "THIS CREATURE and …", so the source must be among them. Without
  //                         it, a battalion creature sitting at home would trigger off three OTHER attackers,
  //                         which is strictly better than printed — the forbidden direction.
  // "you attack with N or more creatures" carries NO self requirement (the source needn't attack), so it
  // sets only minAttackers. Both are enforced in checkAttackTriggers' once-per-combat pass.
  // The subject is matched loosely and then required to be a SELF reference via the shared `selfRef` flag —
  // battalion prints the card's own name ("Whenever Ordruun Veteran and at least two other creatures
  // attack"), and `selfRef` is the same name/short-name/first-word recognizer every other self-scope
  // condition in this function already trusts. A non-self subject falls through undetected (safe FN).
  const ATTACK_COUNT_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  const battalion = c.match(/^.+ and at least (\d+|one|two|three|four|five) other creatures attack$/);
  if (battalion && selfRef) {
    const other = ATTACK_COUNT_WORDS[battalion[1]] ?? parseInt(battalion[1], 10);
    if (Number.isFinite(other)) return { event: "youAttack", scope: "you", whose: "any", minAttackers: other + 1, requireSelfAttacking: true };
  }
  // ⓘ The "you attack with N or more creatures" twin lives EARLIER in this function, above the qualifier
  // guard that rejects every condition containing "with" — a copy here would be dead code, because that
  // guard returns before this point. Measured, not assumed: a debug dump showed this line was never
  // reached for Military Intelligence's condition.
  // ===== EACH-PLAYER (compound-combat-trigger guard) ===== A condition that names BOTH "attacks" and
  // "blocks" is a COMPOUND combat event. The STANDARD "attacks or blocks" form is now SPLIT upstream
  // (DISJUNCTION_BLOCKS_SRC, BLITZ OR-1) into two single-verb sentences before this detector runs, so it
  // never reaches this guard. Anything that still names both verbs here is an UNSPLIT variant ("blocks or
  // becomes blocked" — bushido's reminder; an exotic phrasing) — detecting it as just one verb would
  // silently DROP the other half, a confident WRONG partial (CLAUDE.md §1.2). Leave it UNDETECTED: the
  // card's trigger-sentence count then mismatches in allTriggerSentencesModeled and the whole card routes
  // to the Arbiter (a SAFE false-negative).
  if (/\battacks\b/.test(c) && /\bblocks\b/.test(c)) return null;
  // ===== ATTACKS-OR-BECOMES-TARGET (compound event, CR 603.2 / CR 115.1) ===== A condition naming BOTH
  // "attacks" and "becomes the target of a spell" ("Whenever this creature attacks or becomes the target of
  // a spell, …" — Goldspan Dragon) is a COMPOUND event firing on TWO distinct sites: (a) when THIS creature
  // is declared as an attacker (checkAttackTriggers), and (b) when THIS permanent becomes the target of ANY
  // spell any player casts (checkCastTriggers, per CR 115.1 — the target is chosen at cast). Modeled as ONE
  // self-scope descriptor `event:"attacksOrBecomesTarget"` that BOTH runtime sites fire (so neither half is
  // ever silently dropped — the CREED all-sites requirement): the attack site enqueues it for the attacking
  // permanent, the cast site enqueues it for each targeted permanent regardless of controller. The
  // effectClause routes through the SAME buildTriggerStack flush a printed trigger uses (Goldspan's "create a
  // Treasure token" parses HIGH). GATED to the UNRESTRICTED bare self form: a "…of a spell AN OPPONENT
  // CONTROLS" restriction (Tectonic Giant — no per-caster gate at the cast site) or a NON-self subject leaves
  // residue → falls through UNDETECTED → Arbiter (a SAFE false-negative). Anchored ^…$ so any rider is caught.
  if (/\battacks\b/.test(c) && /\bbecomes the target of a spell\b/.test(c)) {
    if (selfRef && /^this creature attacks or becomes the target of a spell$/.test(c)) {
      return { event: "attacksOrBecomesTarget", scope: "self", whose: "any" };
    }
    return null; // restricted ("an opponent controls") / non-self form stays UNDETECTED → Arbiter (SAFE FN)
  }
  // ===== ATTACKS-ALONE (BLITZ TR-2, CR 506.5 / 702.83b) ===== "attacks alone" = it's the ONLY creature
  // declared as an attacker. The sole-attacker gate now EXISTS at the runtime: checkAttackTriggers fires the
  // dedicated "attacksAlone" event ONLY when attackers.length === 1 (the KW-EXALTED seam — the same
  // structural gate exalted's aggregated fire rides), so a multi-attacker declaration can never fire it (the
  // over-fire FP the old blanket guard existed to prevent — Black Panther / Agent 13 firing on every
  // attacker). Exactly TWO subject shapes classify, both whole-clause anchored:
  //   - "this creature attacks alone" / the card's own name (Rogue Kavu, Lunk Errant, Ma Chao) → scope
  //     "self" (the source must BE the sole attacker — scopeMatches' id check).
  //   - "a creature you control attacks alone" (Battlegrace Angel, Black Panther, Peggy Carter, Agents of
  //     S.H.I.E.L.D.) → scope "creatureYouControl" (the sole attacker is the triggering permanent; the
  //     watcher is any of the attacking player's permanents — the watcher itself included, per the bare
  //     "a creature you control" reading).
  // ANY other form — "a Samurai or Warrior you control attacks alone" (a two-subtype filter the scope
  // vocabulary can't express), "equipped creature attacks alone" (Bilbo's Ring / S.H.I.E.L.D. Spy Kit) —
  // stays UNDETECTED → Arbiter (a SAFE false-negative). Exalted's "attacks alone" REMINDER text is stripped
  // before detection, so only real printed sentences reach this branch.
  if (/\battacks\b/.test(c) && /\balone\b/.test(c)) {
    const aaM = c.match(/^(.+?) attacks alone$/);
    if (aaM) {
      const subj = aaM[1].trim();
      const isSelfSubj = subj === "this creature" || subj === "this permanent"
        || subj === nameL || (shortNameRef && subj === shortName) || (firstWordRef && subj === firstWord);
      if (isSelfSubj) return { event: "attacksAlone", scope: "self", whose: "any" };
      if (subj === "a creature you control") return { event: "attacksAlone", scope: "creatureYouControl", whose: "any" };
    }
    return null;
  }
  if (/\battacks\b/.test(c)) {
    if (selfRef) return { event: "attacks", scope: "self", whose: "any" };
    // ANCHORED bare form (was a non-anchored substring test — any "a creature you control <restriction>
    // attacks" matched it and silently DROPPED the restriction: a latent over-fire the moment such a card's
    // payload parses. Now: the bare form matches exactly; the one CHECKABLE restriction below is modeled
    // explicitly; anything else stays UNDETECTED → Arbiter, the same safe-FN posture as every other guard).
    if (/^a creature you control attacks$/.test(c)) return { event: "attacks", scope: "creatureYouControl", whose: "any" };
    // ANY-CREATURE attacks (Caltrops — "Whenever a creature attacks, this artifact deals 1 damage to it.").
    // The watcher can sit on ANY battlefield (a defender's Caltrops fires on the attacker's declaration), so
    // the fire site adds a non-attacking-players scan gated to exactly this scope (the subtypeGlobal
    // de-dup pattern) — see checkAttackTriggers. Anchored bare form, same posture as the you-control arm.
    if (/^a creature attacks$/.test(c)) return { event: "attacks", scope: "anyCreature", whose: "any" };
    // ATTACHED-ONLY attacks (Reyav, Master Smith — "Whenever a creature you control that's enchanted or
    // equipped attacks"): "enchanted or equipped" ⇔ the attacker has ≥1 attachment (attachments are only
    // ever Auras/Equipment in this engine, so the OR-form reduces to a length check — scopeMatches enforces
    // it on the triggering attacker). ONLY the or-form is modeled: a bare "that's equipped" / "that's
    // enchanted" would need an attachment-TYPE check → stays undetected → Arbiter (safe FN).
    if (/^a creature you control that's (?:enchanted or equipped|equipped or enchanted) attacks$/.test(c)) {
      return { event: "attacks", scope: "creatureYouControl", whose: "any", attachedOnly: true };
    }
    // EQUIP-RIDER attacks (WAVE 4) — "Whenever EQUIPPED CREATURE attacks, <effect>" (Argentum Armor /
    // Ultima Weapon / Mjolnir attack payloads). The watcher is the EQUIPMENT; the attacker is the
    // triggering permanent, so the scope fires ONLY when the attacker IS this equipment's attached
    // creature (scopeMatches "equippedCreature": triggeringPermanent.id === sourcePermanent.attachedTo).
    // EXACTLY anchored to the bare form: a rider variant ("attacks alone" — Bilbo's Ring / Sigil of Valor;
    // "attacks the player with the most life" — Seraphic Greatsword; "attacks or blocks" — already caught
    // by the attacks-or-blocks guard above) leaves residue → UNDETECTED → Arbiter (a SAFE false-negative,
    // never an over-fire across the 57 corpus "equipped creature attacks" cards). whose:"any" — combat is
    // not turn-scoped here; checkAttackTriggers only sources the active player's permanents anyway.
    if (/^equipped creature attacks$/.test(c)) return { event: "attacks", scope: "equippedCreature", whose: "any" };
    // AURA-RIDER attacks (BLITZ OC-1, the Ordeal cycle) — "Whenever ENCHANTED CREATURE attacks, <effect>"
    // (CR 508.3a — the enchanted creature being declared as an attacker). The watcher is the AURA; the
    // attacker is the triggering permanent, so the SAME "equippedCreature" attached-linkage scope fires
    // ONLY when the attacker IS this Aura's host (triggeringPermanent.id === sourcePermanent.attachedTo) —
    // the exact precedent of the "enchanted creature deals combat damage to a player" descriptor below,
    // which already shares the scope (Auras and Equipment attach through the identical `attachedTo` field).
    // EXACTLY anchored to the bare form: any rider variant ("attacks alone", "attacks or blocks" — caught
    // upstream) leaves residue → UNDETECTED → Arbiter (a SAFE false-negative). whose:"any" like the
    // equipped form (checkAttackTriggers only scans the attacking player's watchers anyway).
    if (/^enchanted creature attacks$/.test(c)) return { event: "attacks", scope: "equippedCreature", whose: "any" };
    // ANOTHER-CREATURE attacks (BLITZ AT-1) — "Whenever ANOTHER creature you control attacks, <effect>"
    // (Glory Bearers "it gets +0/+1 until end of turn"; Stonehoof Chieftain "it gains trample and
    // indestructible until end of turn"). The otherCreatureYouControl scope (already in scopeMatches +
    // NONSELF_TRIGGERING_SCOPES) fires for every OTHER creature the attacking player controls
    // (checkAttackTriggers' other-watchers loop threads the attacker as triggeringPermanent), NEVER the
    // source's own attack (the scope's id check). The attacker pronoun in the effect ("it gets/gains … until
    // end of turn") binds via TRIG-PRONOUN-IT (target:"thatCreature" → the triggering attacker). Anchored ^…$
    // so any rider/compound stays UNDETECTED → Arbiter (a SAFE false-negative), mirroring the bare forms above.
    if (/^another creature you control attacks$/.test(c)) return { event: "attacks", scope: "otherCreatureYouControl", whose: "any" };
    // SUBTYPE attacks (tribal payoffs — Utvara Hellkite / Sanctum Seeker / Grolnok). Single-word subtype
    // filter reusing subtypeYouControl; checkAttackTriggers threads the attacker as triggeringPermanent.
    // COMMANDER-SCOPED attacks (CR 903.3) — "Whenever a commander you control attacks" (Keleth #6637;
    // Norn's Choirmaster's second half). Same reasoning as the ETB sibling above: a designation, not a
    // type-line word, so it takes commanderYouControl instead of a subtypeFilter that can never match.
    if (/^a commander you control attacks$/.test(c)) return { event: "attacks", scope: "commanderYouControl", whose: "any" };
    // ⚠️ This matcher is otherwise UNVALIDATED — any 3+ letter word becomes a filter. NON_SUBTYPE_FILTER_WORDS
    // is what keeps a card-type or CR-umbrella word from minting a gate no type line satisfies.
    const atkSub = c.match(/^a ([a-z]{3,}) you control attacks$/);
    if (atkSub && !NON_SUBTYPE_FILTER_WORDS.has(atkSub[1])) return { event: "attacks", scope: "subtypeYouControl", whose: "any", subtypeFilter: atkSub[1].charAt(0).toUpperCase() + atkSub[1].slice(1) };
  }
  // ===== BLOCKS compound / restricted-block guard (CREED, CLAUDE.md §1.2) ===== The only modeled block
  // trigger is the BARE self-block ("Whenever this creature blocks, …"). A COMPOUND condition that also
  // names "becomes blocked" (Serra Inquisitors / Raging Gorilla / Assembled Alphas — "blocks or becomes
  // blocked by one or more X creatures") names a SECOND event; a RESTRICTED block ("blocks a creature
  // with flying" — Snarespinner / Skystinger; "blocks … by one or more <type/color> creatures") carries
  // a restriction the engine can't enforce. The bare-blocks branch below would DROP both and fire the
  // (modeled) self-pump on ANY plain block — a confident WRONG partial. Leave any non-bare self-block
  // UNDETECTED → Arbiter, mirroring the attacks-or-blocks guard. A self-pump on a plain block stays native.
  if (/\bbecomes blocked\b/.test(c)) {
    // ===== BLOCKS-OR-BECOMES-BLOCKED (BLITZ TR-2, CR 509.1a + 509.1h) ===== the BARE compound self form
    // "Whenever this creature blocks or becomes blocked, <effect>" (Chub Toad / Raging Gorilla / Brushwagg /
    // Jukai Trainee / Karn, Silver Golem). ONE detected descriptor for the ONE printed sentence, riding the
    // EXISTING "blocksOrBecomesBlocked" runtime event (checkBlockTriggers' bushido loop — CR 702.45a
    // precedent): it fires ONCE for a creature declared as a blocker AND ONCE for an attacker that becomes
    // blocked, deduped per creature per declaration (blocking two attackers is still one "blocks" event —
    // CR 509.3c's once-per-combat reading). SUBJECT-EXACT: only the pure self subjects ("this creature" /
    // "this permanent" / the card's own full/short/first-word name per CR 201.4) classify — a restricted
    // ("…by a creature" → the blocksOrBlockedByCreature contact family; "…by one or more X creatures" —
    // Serra Inquisitors; "equipped/enchanted creature blocks or becomes blocked" — Dead-Iron Sledge/Ferocity,
    // whose attached-watcher fire site doesn't exist at the block seam) or compound-subject form falls
    // through → UNDETECTED → Arbiter (a SAFE false-negative, never a mis-scoped fire).
    const bobM = c.match(/^(.+?) blocks or becomes blocked$/);
    if (bobM) {
      const subj = bobM[1].trim();
      const isSelfSubj = subj === "this creature" || subj === "this permanent"
        || subj === nameL || (shortNameRef && subj === shortName) || (firstWordRef && subj === firstWord);
      if (isSelfSubj) return { event: "blocksOrBecomesBlocked", scope: "self", whose: "any" };
      return null;
    }
    // BECOMES-BLOCKED (subsystem 2): the BARE self form "Whenever this creature becomes blocked, …" is
    // modeled — checkBlockTriggers fires it for each attacker that got blocked. A COMPOUND ("blocks or
    // becomes blocked" — bushido; names the SECOND "blocks" event) or a RESTRICTED form ("becomes blocked
    // by one or more X creatures" — rampage; an unenforceable per-blocker restriction) does NOT end on the
    // bare phrase and/or also names "blocks" → stays UNDETECTED → Arbiter (SAFE FN), mirroring bare-blocks.
    if (selfRef && /\bbecomes blocked\s*$/.test(c.trim()) && !/\bblocks\b/.test(c)) return { event: "becomesBlocked", scope: "self", whose: "any" };
    return null;
  }
  // ⭐ BLOCKS-A-CREATURE (CR 509.1a) — "Whenever this creature blocks A CREATURE, …" (Wall of Frost,
  // Labyrinth Minotaur, Illusion, Cleric of Chill Depths, Wall of Tears, Aether Membrane, …). NOT the same
  // event as the bare "blocks" branch below, and the difference is load-bearing in TWO ways:
  //   · MULTIPLICITY — the bare wording is once per combat (CR 509.3c); "a creature" fires ONCE PER CREATURE
  //     blocked, exactly like the becomesBlockedByCreature sibling (CR 509.3d).
  //   · REFERENT — it binds "that creature" to the BLOCKED ATTACKER, so source ≠ triggering permanent. That
  //     is why this carries its own scope rather than riding scope:"self", whose contract is source ===
  //     triggering; the fire site pairs blocker (source) with blocked attacker (triggering).
  // ⛔ WHY THIS WAS 0-NATIVE ACROSS 14 CARDS: the guard below rejects anything not ending on "blocks", so the
  // trailing " a creature" alone sent the whole family to Arbiter. Measured before building: swapping the
  // event for the modelled per-creature sibling flipped ZERO cards, so the event is necessary but NOT
  // sufficient — each card also needs its effect. Only the no-untap effect is modelled today.
  if (/^(?:this creature|it) blocks a creature$/.test(c.trim()) && selfRef) return { event: "blocksCreature", scope: "blocksCreature", whose: "any" };
  if (/\bblocks\b/.test(c) && selfRef && !/\bblocks\s*$/.test(c.trim())) return null;
  if (/\bblocks\b/.test(c) && selfRef) return { event: "blocks", scope: "self", whose: "any" };

  // ===== BECOMES THE TARGET (CR 603.2 — the becomes-target event; the Phantasmal Illusion family) =====
  // "When[ever] this <permanent> becomes the target of a spell or ability, <effect>" (Phantasmal Bear /
  // Dragon / Dreadmaw, Frost Walker, Illusionary Servant, Gossamer Phantasm, Skulking Ghost/Fugitive, Phantom
  // Beast, Tar Pit Warrior, Phantasmal Abomination/Shieldback, …). A NEW event fired at EVERY target-choice
  // site (checkBecomesTargetTriggers, wired at the spell-cast / activated-ability / loyalty-ability / triggered-
  // ability target chokepoints) — the permanent enters the event the instant it is CHOSEN as a target, by ANY
  // controller's spell or ability (CR 603.2 makes no controller distinction, unlike Heroic/Ward). SELF SCOPE
  // ONLY: the source IS the targeted permanent, so "it" in the effect ("sacrifice it") is the SOURCE (CR
  // 608.2c) — the effect-rewrite chain below normalizes "sacrifice it" → "sacrifice this creature" (target:
  // "self" → ctx.sourceId) exactly like the self-pump/self-counter "it" rewrites.
  //
  // CREED — anchored to the BARE self form ending on "a spell or ability" ONLY. A COMPOUND ("attacks or becomes
  // the target of a spell", caught by the guard above) or a RESTRICTED variant — "becomes the target of a spell
  // or ability an opponent controls" (a group-ward tax, a different lane), "becomes the target of a spell"
  // (spell-only — Heroic's lane; no bare-ability runtime here), or any trailing rider ("…, sacrifice it unless
  // you discard a land card" — Cursed Monstrosity; the effect stays LOW → body-only) — does NOT match this
  // exact anchor → UNDETECTED → Arbiter (a SAFE false-negative). The effect faithfulness is re-gated by
  // triggerRoutesNatively: only when the whole effect parses HIGH (a plain self-sac does) is the card credited.
  if (selfRef && /\bbecomes the target of a spell or ability\s*$/.test(c.trim())) {
    return { event: "becomesTarget", scope: "self", whose: "any" };
  }
  // ===== VALIANT (CR 702.xx keyword label; 13 corpus carriers, Bloomburrow's mouse cycle) ===== The same
  // self event NARROWED to a spell or ability the creature's OWN CONTROLLER controls: "Whenever this
  // creature becomes the target of a spell or ability YOU CONTROL…". Every printing pairs it with "for the
  // first time each turn", which the dispatch strips into the once-per-turn latch before we get here — so
  // by this point the condition reads as the bare narrowed form.
  //
  // ⛔ THE NARROWING IS THE WHOLE CARD AND IT IS ENFORCED AT THE FIRING SITE, not here. Valiant exists so
  // that YOUR pump spell grows the creature and an OPPONENT'S removal spell does not; firing on any
  // targeter would hand these creatures a trigger off every opposing Shock — the over-fire direction, and
  // the one that would make them look stronger than printed. checkBecomesTargetTriggers compares the
  // targeting stack object's controller against the targeted permanent's controller (which for this SELF
  // scope IS the watcher's controller) and drops the trigger when they differ.
  //
  // DISTINCT from the ward-tax lane ("…of a spell or ability AN OPPONENT controls"), which is still
  // unmatched → Arbiter: that one needs the opposite comparison AND a tax, not just a gate.
  if (selfRef && /\bbecomes the target of a spell or ability you control\s*$/.test(c.trim())) {
    return { event: "becomesTarget", scope: "self", whose: "any", targeterIsController: true };
  }
  // ===== GROUP BECOMES-TARGET (CR 603.2 — a creature YOU CONTROL becomes the target of a SPELL) ===== The
  // controller-scoped sibling of the self form above (Gargos, Vicious Watcher — "Whenever a creature you
  // control becomes the target of a spell, Gargos fights up to one target creature you don't control";
  // Venerated Rotpriest). UNLIKE the self form the WATCHER is a DIFFERENT permanent (Gargos) than the
  // targeted creature — so the effect subject is the SOURCE NAME (rewriteSelfNameToThisCreature normalizes
  // "Gargos fights …" → "this creature fights …", scope-independently) and the runtime fans out to the
  // targeted creature's controller's watchers (checkBecomesTargetTriggers, gated on stackObj.kind==="spell").
  //
  // CREED — anchored to the BARE "a creature you control" subject + a SPELL-ONLY event (ends on "of a spell"),
  // no rider. This is a DISTINCT event ("becomesTargetGroup") from the self form because it fires ONLY on a
  // SPELL (CR 115.1 — the target is chosen at cast; Gargos's text is "of a spell", not "of a spell or ability"),
  // whereas the self form fires at all four target-choice sites incl. abilities. A RESTRICTED subject ("a Dragon
  // you control", "a permanent you control", "another creature you control"), a WARD-TAX rider ("…of a spell or
  // ability an opponent controls"), an "instant or sorcery"/"a spell or ability" variant, or ANY trailing effect
  // rider leaves residue → does NOT match this exact anchor → UNDETECTED → Arbiter (a SAFE false-negative). The
  // effect faithfulness is re-gated by triggerRoutesNatively (the fight parses HIGH only after the self-name rewrite).
  if (/^a creature you control becomes the target of a spell$/.test(c.trim())) {
    return { event: "becomesTargetGroup", scope: "creatureYouControl", whose: "any" };
  }

  // Combat-damage-to-a-player (CR 510.2 — combat damage dealt). "Whenever <self> deals combat damage to a player" (self) /
  // "Whenever a creature you control deals combat damage to a player" (creatureYouControl). BARE form
  // only — END-anchored on "a player" so a qualified variant ("…to a player or planeswalker", "…to a
  // creature", "one or more creatures you control deal…", or any trailing rider) stays UNDETECTED →
  // Arbiter (a SAFE false-negative). combatResolution fires it off the real per-attacker player-damage.
  // COMBAT-DAMAGE-TO-YOU (CR 510.2) — the RECIPIENT-side twin of the whole to-a-player family below.
  // "Whenever a creature deals combat damage to you, <effect>" (The Cabbage Merchant, Hixus, Palace
  // Sentinel). Every arm below is written from the DEALER's side; this one belongs to the player being
  // hit, so the watcher is controlled by the DAMAGED player and the triggering permanent is the attacker.
  // Bare form only, END-anchored: a qualified variant ("… to you or a planeswalker you control") stays
  // undetected → Arbiter (a SAFE false-negative, never an over-fire on a scope the engine can't check).
  if (/^a creature deals combat damage to you$/.test(c)) {
    // scope "eachCreature" — ANY creature dealing the damage, which is what the card says. I first wrote
    // scope:"any", which is not a scope scopeMatches knows: the switch fails closed on an unknown scope, so
    // the descriptor was detected, the trigger never fired, and only the POSITIVE runtime test caught it.
    // The negative half ("does not fire for the attacker's controller") passed the whole time on nothing
    // firing at all — a paired positive is the only reason that was visible.
    return { event: "combatDamageToYou", scope: "eachCreature", whose: "any" };
  }
  // ⭐⭐ "TO AN OPPONENT" IS THE SAME EVENT (CD-OPP, 2026-08-05 — Coastal Piracy, Hydra Omnivore, Mindscour
  // Dragon, Joven and Chandler). The guard was END-ANCHORED on the literal "a player", so the opponent
  // wording was not merely mis-scoped, it was **UNDETECTED ENTIRELY** — detectTriggers returned [] and the
  // whole card parked. Nothing about these effects was unmodelled; one noun was.
  // ⛔ WHY whose:"any" IS EXACTLY RIGHT HERE RATHER THAN A NARROWER NEW VALUE. In combat the player dealt
  // damage is the DEFENDING player, who is by construction an opponent of the attacking creature's
  // controller (CR 506.2) — including the stolen-creature case, where the thief is the controller and the
  // original owner is their opponent. So "a player" and "an opponent" name the same reachable set for this
  // event, and the two wordings genuinely are one descriptor.
  // ⛔⛔ AND INVENTING A NEW `whose` WOULD BE THE DANGEROUS CHOICE, per the warning written into the
  // combatDamageToYou arm a few lines above: scopeMatches FAILS CLOSED on a value it does not know, so a
  // made-up scope detects fine and then never fires — a descriptor that reads modelled and does nothing.
  // Reusing the proven value keeps these four on the same runtime path every existing carrier uses.
  if (/\bdeals combat damage to (?:a player|an opponent)$/.test(c)) {
    if (selfRef) return { event: "combatDamageToPlayer", scope: "self", whose: "any" };
    // TOKEN-FILTERED (Curiosity Crafter #1734) — checked BEFORE the bare creature form, whose /a creature
    // you control/ test is a SUBSTRING match and would otherwise swallow "a creature token you control" and
    // drop the qualifier entirely. That is the over-fire direction: every creature connecting would draw.
    if (/^a creature token you control deals combat damage to (?:a player|an opponent)$/.test(c)) return { event: "combatDamageToPlayer", scope: "creatureYouControl", whose: "any", tokenFilter: true };
    if (/a creature you control/.test(c)) return { event: "combatDamageToPlayer", scope: "creatureYouControl", whose: "any" };
    // EQUIP-RIDER combat-damage (WAVE 4) — "Whenever EQUIPPED CREATURE deals combat damage to a player,
    // <effect>" (Goldvein Pick / The Reaver Cleaver Treasure riders, the Swords' combat-damage payloads).
    // The watcher is the EQUIPMENT; the attacker that connected is the triggering permanent, so the
    // "equippedCreature" scope fires ONLY when that attacker IS this equipment's attached creature. The
    // outer guard is already END-anchored on "a player", so the qualified "…to a player or planeswalker"
    // (The Reaver Cleaver's GRANTED ability, Beamtown Beatstick "…or battle") never enters this block →
    // UNDETECTED → Arbiter (a SAFE false-negative, never an over-fire). whose:"any" like the per-attacker
    // self/creatureYouControl forms above.
    if (/^equipped creature deals combat damage to (?:a player|an opponent)$/.test(c)) return { event: "combatDamageToPlayer", scope: "equippedCreature", whose: "any" };
    // AURA-RIDER combat-damage (SUPER STATE) — "Whenever ENCHANTED CREATURE deals combat damage to a player,
    // <effect>". An Aura's OWN triggered ability keyed off its host: the watcher is the AURA, the connecting
    // attacker is the triggering permanent, so the SAME "equippedCreature" attached-linkage scope fires ONLY
    // when the attacker IS this Aura's host (sourcePermanent.attachedTo). Auras and Equipment attach through
    // the identical `attachedTo` field, and the per-host correctness relies on ATTACH permitting only an
    // own-creature host (resolvers.js), exactly like the Equipment rider above. The "to an opponent" object is
    // handled in the sibling block below (the outer guard here is END-anchored on "a player"). whose:"any".
    if (/^enchanted creature deals combat damage to (?:a player|an opponent)$/.test(c)) return { event: "combatDamageToPlayer", scope: "equippedCreature", whose: "any" };
    // SUBTYPE combat-damage (tribal payoffs — Curious Altisaur "Whenever a Dinosaur you control deals
    // combat damage to a player, draw a card"). A single-word creature SUBTYPE filter, reusing the
    // subtypeYouControl scope (controller + type-line substring; the attacker is threaded as
    // triggeringPermanent by combatResolution). Anchored single word, len >= 3 — "creature" is already
    // handled above; any other shape leaves residue → undetected → Arbiter (never an over-fire).
    // Single subtype (Curious Altisaur) OR a multi-subtype LIST (Spawning Kraken — "a Kraken, Leviathan,
    // Octopus, or Serpent you control deals combat damage to a player"). parseSubtypeList returns a string
    // for one word (unchanged) or an array for a list; the subtypeYouControl matcher checks ANY member.
    // ⚠️ THE OLD ANCHOR ONLY ACCEPTED A **COMMA**-SEPARATED LIST. `(?:[a-z]+,\s*)*(?:or\s+|and\s+)?[a-z]{3,}`
    // requires a comma before ever reaching the "or", so Spawning Kraken ("a Kraken, Leviathan, Octopus, or
    // Serpent …") matched while the bare TWO-element union ("a Goblin or Orc you control …" — Moria Marauder)
    // did not. The list support was real but half-shaped, which is harder to spot than an absent feature: the
    // comment above says "OR a multi-subtype LIST" and it was true for the form that happened to be tested.
    // Now the same anchor the dies and both ETB arms use, so all four constructions read one grammar.
    const cdSub = c.match(/^a ([a-z]{3,}(?:(?:,\s*[a-z]{3,})*,?\s*(?:or|and)\s+[a-z]{3,})?) you control deals combat damage to a player$/);
    if (cdSub) {
      const filter = parseSubtypeList(cdSub[1]);
      if (filter) return { event: "combatDamageToPlayer", scope: "subtypeYouControl", whose: "any", subtypeFilter: filter };
    }
  }
  // BATCH combat-damage (CR 510.4 — all combat damage is dealt as ONE event). "Whenever one or more
  // creatures you control deal combat damage to a player, <effect>" fires ONCE per combat regardless of
  // how many creatures connected (Grim Hireling, Professional Face-Breaker, the treasure/investigate/Food
  // payoffs) — distinct from the per-attacker combatDamageToPlayer above. checkBatchCombatDamageTriggers
  // fires it exactly once per controller who dealt player damage this combat. Anchored: a qualified variant
  // ("…to a player or planeswalker", a rider) leaves residue → undetected → Arbiter (a SAFE false-negative).
  if (/^one or more creatures you control deal combat damage to a player$/.test(c)) {
    return { event: "combatDamageBatch", scope: "you", whose: "any" };
  }
  // SUBTYPE/PROPERTY-FILTERED BATCH combat-damage (CR 510.4) — "Whenever one or more <FILTER> you control
  // deal combat damage to a player/an opponent, <effect>" where <FILTER> is a creature SUBTYPE (Olivia,
  // Opulent Outlaw — "outlaws"; a tribal "Goblins"/"Dinosaurs"), an ARTIFACT-creature qualifier (Thopter Spy
  // Network), an ENCHANTMENT-creature qualifier, or a NONTOKEN qualifier (Rooftop Bypass). Like the bare batch
  // it fires ONCE per combat per controller — but ONLY when at least one CONNECTING creature that controller
  // controls matches the FILTER (checkBatchCombatDamageTriggers gates on the actual dealers, so a non-matching
  // attacker connecting alone never fires it — CREED: no over-fire). The "an opponent" object is equivalent to
  // "a player" here: you only ever deal combat damage to opponents, and a combat-damage-player event's defender
  // is always an opponent of the attacking player (CR 509.1a). Anchored to the bare FILTER + bare effect-object
  // only; a qualified object ("…to a player or planeswalker") or any rider leaves residue → undetected →
  // Arbiter (a SAFE false-negative, never an over-fire). A color filter ("colorless creatures" — Glitch
  // Interpreter) is NOT modeled (the engine has no reliable per-permanent color), so parseBatchSubjectFilter
  // returns null for it → that card stays body-only (CREED FP-safe).
  {
    const batchM = c.match(/^one or more (.+?) you control deal combat damage to (?:a player|an opponent)$/);
    if (batchM) {
      const f = parseBatchSubjectFilter(batchM[1]);
      if (f) return { event: "combatDamageBatch", scope: "you", whose: "any", ...f };
    }
  }
  // TRIG-DMG-TO-OPPONENT — "Whenever <self> deals damage to a player / an opponent" without "combat".
  // Cards like Vedalken Heretic, Thieving Magpie, Reef Pirates: in the simulator all creature damage
  // is combat damage, so the combatDamageToPlayer event fires correctly when this creature attacks and
  // connects. BARE end-anchored form only; a trailing qualifier ("…to a player or planeswalker",
  // "…to an opponent who controls…") leaves residue → UNDETECTED → Arbiter (safe false-negative).
  if (/\bdeals? damage to (?:a player|an opponent)$/.test(c) && selfRef) {
    return { event: "combatDamageToPlayer", scope: "self", whose: "any" };
  }
  // AURA-RIDER damage-to-a-player WITHOUT "combat" (BLITZ SB-1 — Sigil of Sleep "Whenever enchanted creature
  // deals damage to a player, return target creature that player controls to its owner's hand"). The same
  // in-simulator equivalence as the self form directly above (all creature damage to a player is combat
  // damage here), routed through the SAME "equippedCreature" attached-linkage scope as the aura/equipment
  // combat-damage riders (the watcher is the AURA; the trigger fires ONLY when the connecting attacker IS
  // this aura's host — sourcePermanent.attachedTo). Anchored bare-object; a qualifier ("…or planeswalker",
  // a rider) leaves residue → UNDETECTED → Arbiter (a SAFE false-negative, never an over-fire).
  if (/^enchanted creature deals damage to (?:a player|an opponent)$/.test(c)) {
    return { event: "combatDamageToPlayer", scope: "equippedCreature", whose: "any" };
  }
  // AURA-RIDER combat-damage TO AN OPPONENT (SUPER STATE) — "Whenever ENCHANTED CREATURE deals combat damage
  // to an opponent, <effect>". The "to an opponent" object is equivalent to "to a player" for this event: the
  // defender of a combat-damage-player event is ALWAYS an opponent of the attacking player (CR 509.1a), and
  // the Aura's controller IS the attacking player (ATTACH forbids a non-own host), so the just-damaged player
  // is always an opponent — the same equivalence the SUBTYPE-BATCH block above relies on. Reuses the
  // "equippedCreature" attached-linkage scope; the per-host correctness is identical to the "to a player"
  // sibling above. Anchored bare-object ("…to an opponent$"); a qualifier leaves residue → undetected → Arbiter.
  if (/^enchanted creature deals combat damage to an opponent$/.test(c)) return { event: "combatDamageToPlayer", scope: "equippedCreature", whose: "any" };
  // COMMANDER combat-damage (CR 903.3) — "Whenever a commander you control deals combat damage to an
  // opponent, <effect>" (Kediss, Emberclaw Familiar). Reuses the per-attacker combatDamageToPlayer event
  // that combatResolution already fires off real player damage; the ONLY new thing is the subject scope,
  // which requires the connecting attacker to carry the isCommander designation.
  //
  // "To an opponent" is equivalent to "to a player" for THIS event, on the same argument the aura sibling
  // above makes: the damaged player in a combat-damage-to-player event is always an opponent of the
  // attacking player (CR 509.1a), and the watcher's controller is that attacking player. So no separate
  // object check is needed — but it is anchored on the printed object anyway rather than loosened, so a
  // future "to a player or planeswalker" variant leaves residue → undetected → Arbiter.
  //
  // Both printed subjects are matched ("a commander you control" — Kediss; "your commander" — the sibling
  // shape). A PLURAL batch form ("one or more commanders you control deal…") fires once per combat rather
  // than per attacker and is a DIFFERENT event, so it stays unmatched → Arbiter (a safe false-negative).
  if (/^(?:a commander you control|your commander) deals combat damage to (?:a player|an opponent)$/.test(c)) {
    return { event: "combatDamageToPlayer", scope: "commanderYouControl", whose: "any" };
  }

  // ===== ENRAGE / DAMAGE-RECEIVED (CR 603.2 trigger condition, the ENRAGE family) ===== "Whenever this creature is dealt
  // damage, …" / "Whenever <name> is dealt damage, …". The SOURCE permanent IS the creature that took the
  // damage (scope:self) — the "Enrage —" ability-word label (CR 207.2c) is stripped upstream by
  // stripTriggerAbilityLabel so the bare condition reaches here. checkDealtDamageTriggers emits the event
  // (combatResolution + applyDamageEffect) ONCE per creature per damage EVENT with the total amount (CR
  // 510.2 — combat damage is dealt simultaneously, so multiple simultaneous blockers trigger it exactly once; CR 120.8 — no event on 0 damage),
  // threading ctx.dealtDamageAmount for an amount-scaled payoff (e.g. "add that much mana").
  // The "is dealt damage BY <…>" form (Sengir family — a DIFFERENT event, the source's own death) is a
  // distinct shape already rejected by the FIX-TRIG-CONDITION `dealt damage by` guard above, so it never
  // reaches here. Anchored to the bare self form (END on "damage"): a rider stays UNDETECTED → Arbiter.
  if (/\bis dealt damage$/.test(c) && selfRef) {
    return { event: "dealtDamage", scope: "self", whose: "any" };
  }
  // CONTROLLER-SCOPE dealt-damage (Rite of Passage — "Whenever a creature you control is dealt damage, put a
  // +1/+1 counter on it"): the WATCHER is a DIFFERENT permanent than the damaged creature (an enchantment, not
  // the creature that took damage). checkDealtDamageTriggers scans the damaged creature's controller's trigger
  // sources and fires this descriptor with triggeringPermanent = the damaged creature; scopeMatches gates
  // creatureYouControl (the damaged creature must be a creature the watcher's controller controls). The
  // effect's "it" / "that creature" → the triggering (damaged) creature via the ETB_ENTERING_PRONOUN rewrite
  // arm below (extended to dealtDamage). Whole-clause anchored ($) so a filtered/rider form stays Arbiter.
  if (/^a creature you control is dealt damage$/.test(c)) return { event: "dealtDamage", scope: "creatureYouControl", whose: "any" };

  // HEROIC (CR 702.35) — "Whenever you cast a spell that targets this creature, <effect>".
  // Fires when the controller casts any spell that has this permanent as a chosen target. The
  // scope is "self" (this permanent only); the engine fires it in checkCastTriggers by scanning
  // the cast spell's targets array for permanents with heroic descriptors. Anchored: a rider
  // ("that targets this creature and another target", a creature-type restriction) stays
  // UNDETECTED → Arbiter (a safe false-negative; never an over-fire).
  if (/^you cast a spell that targets this creature$/.test(c))
    return { event: "heroic", scope: "self", whose: "you" };

  // MAGECRAFT (CR 207.2c ability word — no individual 702 keyword entry) — "Whenever you cast or copy an
  // instant or sorcery spell, <effect>". Routes to the existing cast event + instantSorcery filter; the CAST
  // half fires for free via checkCastTriggers (event:"cast" whose:"you" spellFilter:"instantSorcery"). The
  // "copy" half is a SEPARATE CR 707.10 event ("a copy of a spell isn't cast") that the cast chokepoint does
  // NOT observe — so magecraft ALONE among cast triggers carries `firesOnCopy:true`, the marker checkCopyTriggers
  // gates on at the copy-creation sites (storm's copy-spell / Double Major's copy-creature-spell, effects/atoms/
  // stack.js). A plain "whenever you cast a[n] … spell" descriptor lacks the flag, so it NEVER fires on a copy
  // (a copy is not a cast — the forbidden FP). BLITZ MC-1: the copy half is now wired; the instantSorcery filter
  // keeps a copied CREATURE spell (Double Major) from firing magecraft. Anchored bare form only.
  if (/^you cast or copy an instant or sorcery spell$/.test(c))
    return { event: "cast", scope: "castWatcher", whose: "you", spellFilter: "instantSorcery", firesOnCopy: true };

  // Cast-spell triggers (CR 603.2, the spell-cast event). The WHOLE condition must reduce
  // to "(you|an opponent|a player|each player) cast(s) a[n] <filter> spell" — ANCHORED, so a
  // trailing rider ("… spell that targets …", "… spell from your graveyard", "… spell during
  // your turn", "… your first/second spell each turn") leaves residue and is NOT detected
  // (→ Arbiter), never an over-fire. `whose` = which caster; `spellFilter` = which types —
  // only the modeled filters (any / instant-or-sorcery / creature / noncreature) classify; a
  // color/subtype/historic/timing filter returns null → undetected. ("an?" greedily takes the
  // "n" of "an" but stops at the space of a bare "a".)
  // TRIG-CAST2 — "cast your second spell each turn" (the magecraft-second-spell payoff). Checked BEFORE the
  // generic cast matcher below (which is anchored to "…spell$" and so deliberately leaves this for the
  // Arbiter). BARE second-spell form only; a different ordinal ("first/third"), a spell-type rider, or any
  // other trailing text stays UNDETECTED → Arbiter. Fires via checkCastTriggers when the caster's
  // spellsCastThisTurn reaches 2 (reset for all seats at untap); whose:"any" + scan only the caster.
  if (/^you cast your second spell (?:each|this) turn$/.test(c)) return { event: "castSecond", scope: "you", whose: "any" };
  // TRIG-CASTNTH — "cast your <ordinal> spell each turn" generalized to the off-by-one-safe Nth-per-turn
  // event (CR 601, spells cast one at a time → spellsCastThisTurn equals N exactly once per turn). Covers the
  // controller form ("you cast your first/third spell each turn" — Rashmi), the opponent form ("an
  // opponent casts their first spell each turn" — Mind's Dilation), AND the ANY-player form ("a player casts
  // their second spell each turn" — Lotho, Corrupt Shirriff → whose:"any", which the checkCastTriggers castNth
  // handler fires for every seat's watcher regardless of caster, so Lotho's controller's watcher fires on each
  // player's Nth spell — CR-correct for the "a player" subject). BARE form ONLY — a spell-type rider
  // ("…first noncreature spell") fails the `$` anchor → UNDETECTED → Arbiter (never an over-fire). The
  // PAYOFF still has to parse HIGH to fire (Rashmi's reveal/free-cast does not → stays non-native; the
  // detection is correct but the whole card routes to the Arbiter, a SAFE false-negative). checkCastTriggers
  // reads the CASTER's count. (The bare "you … second" form stays its own castSecond event for stable identity.)
  const nthM = c.match(/^(you|an opponent|a player) casts? (?:your|their) (first|second|third) spell (?:(?:each|this) turn|(during each opponent's turn))$/);
  if (nthM) {
    const nth = nthM[2] === "first" ? 1 : nthM[2] === "second" ? 2 : 3;
    const whose = nthM[1] === "you" ? "you" : nthM[1] === "an opponent" ? "opponent" : "any";
    // DURING-EACH-OPPONENT'S-TURN rider (2026-08-14 — Wavebreak Hippocamp "Whenever you cast your first
    // spell during each opponent's turn, draw a card"): the same per-caster count (spellsCastThisTurn
    // zeroes at untap, so "first" is per TURN as printed), gated at fire time to turns where the ACTIVE
    // player is an opponent of the watcher's controller. The fire handler calls detectTriggers directly,
    // so the flag needs no descriptor-threading entry.
    return { event: "castNth", scope: "castWatcher", whose, nth, ...(nthM[3] ? { duringOpponentsTurn: true } : {}) };
  }
  // X-SPELL cast trigger — "cast a spell with {X} in its mana cost" (CR 107.3 / 601.2b). The {X} and "mana
  // cost" land AFTER "spell", so this never matches the generic "…spell$" matcher; it's its own anchored
  // form. spellFilter:{ kind:"hasX" } → spellMatchesFilter inspects the cast spell's printed mana cost.
  // (Zaxara's token-with-X-counters PAYOFF is owned by the xCastToken.js targeted hook; here a non-HIGH
  // payoff just no-ops through buildTriggerStack — no double token. A simple payoff like "draw a card" fires.)
  const xCastM = c.match(/^(you|an opponent|a player|each player) casts? an? spell with \{x\} in its mana cost$/);
  if (xCastM) {
    const whose = /you/.test(xCastM[1]) ? "you" : /opponent/.test(xCastM[1]) ? "opponent" : "any";
    return { event: "cast", scope: "castWatcher", whose, spellFilter: { kind: "hasX" } };
  }
  // MANA-VALUE-THRESHOLD cast trigger — "cast a spell with mana value N or greater/less" (CR 202.3). Like
  // the X form, the "with mana value …" rider is AFTER "spell", so it's an anchored standalone form. The
  // comparison reads the cast spell's mana value at cast time. "or more"/"or greater" → >= N; "or
  // less"/"or fewer" → <= N. An "exactly N" or unbounded variant isn't in this shape → UNDETECTED.
  const mvCastM = c.match(/^(you|an opponent|a player|each player) casts? an? spell with mana value (\d+) or (greater|more|less|fewer)$/);
  if (mvCastM) {
    const whose = /you/.test(mvCastM[1]) ? "you" : /opponent/.test(mvCastM[1]) ? "opponent" : "any";
    const op = /greater|more/.test(mvCastM[3]) ? "gte" : "lte";
    return { event: "cast", scope: "castWatcher", whose, spellFilter: { kind: "manaValue", op, value: parseInt(mvCastM[2], 10) } };
  }
  // CAST-FROM-NONHAND (Vega, the Watcher / Kellan's cluster A — "you cast a spell from anywhere other than
  // your hand", SHELF K1): the same cast event with a SOURCE-ZONE gate — checkCastTriggers threads the cast
  // action's fromZone and drops the descriptor when the cast came from hand (or the zone is unknown — an
  // unthreaded legacy path must under-fire, never over-fire). Anchored: any other zone qualifier is unmodeled.
  if (/^you cast a spell from anywhere other than your hand$/.test(c)) {
    return { event: "cast", scope: "castWatcher", whose: "you", spellFilter: "any", castNotFromHand: true };
  }
  // RIVAZ OF THE CLAW (Dragons shelf, 2026-08-15) — "you cast a Dragon creature spell from your graveyard":
  // the cast event with a CONJUNCTIVE type filter (typedAll — the spell's line must carry BOTH words; the
  // existing "typed" kind is ANY-of, which would fire on every creature) and a POSITIVE source-zone gate
  // (castFromZoneOnly — the Vega castNotFromHand seam's exact-zone sibling; an unthreaded caller under-fires,
  // never over-fires, CREED). Exact printed sentence only.
  if (/^you cast a dragon creature spell from your graveyard$/.test(c)) {
    return { event: "cast", scope: "castWatcher", whose: "you", spellFilter: { kind: "typedAll", words: ["Dragon", "Creature"] }, castFromZoneOnly: "graveyard" };
  }
  // ===== FIRST-<KIND>-SPELL-EACH-TURN (CR 603.2) ===== "Whenever an opponent casts their FIRST noncreature
  // spell EACH TURN" — Esper Sentinel, Shadow in the Warp, The Queen of Dale, The Frightful Four, and the
  // unfiltered five (Pain Distributor, Mind's Dilation, The Lord of Pain, Jace's emblem). The generic cast
  // matcher below is `$`-anchored on "… spell", so "spell each turn" never matched it at all — these cards
  // produced NO trigger descriptor whatsoever.
  //
  // ⛔ THE GATE IS PER PLAYER, NOT PER SOURCE. This is not the source's once-per-turn: with three opponents
  // it fires up to three times a turn, once for each opponent's own first matching spell. So it rides on the
  // CASTER's per-turn counters (checkCastTriggers), not on any per-permanent flag.
  //
  // Only the two filters the engine can count are admitted — bare (spellsCastThisTurn) and "noncreature"
  // (noncreatureSpellsCastThisTurn). Zenith Chronicler's "first MULTICOLORED spell each turn" has no
  // counter, so it falls through to the generic matcher, fails its `$` anchor, and stays parked: a safe
  // false negative rather than a first-spell gate that silently ignores the word "multicolored".
  const firstCastM = c.match(/^(you|an opponent|a player|each player) casts? (?:their|his or her|your) first (noncreature )?spell each turn$/);
  if (firstCastM) {
    const whose = /you/.test(firstCastM[1]) ? "you" : /opponent/.test(firstCastM[1]) ? "opponent" : "any";
    return { event: "cast", scope: "castWatcher", whose, spellFilter: firstCastM[2] ? "noncreature" : "any", firstEachTurn: firstCastM[2] ? "noncreature" : "any" };
  }

  const castM = c.match(/^(you|an opponent|a player|each player) casts?\s+(?:an?|your|its|their)?\s*([a-z,\- ]*?)\s*spell$/);
  if (castM) {
    const whose = /you/.test(castM[1]) ? "you" : /opponent/.test(castM[1]) ? "opponent" : "any";
    const spellFilter = castSpellFilter(castM[2].trim());
    if (spellFilter) return { event: "cast", scope: "castWatcher", whose, spellFilter };
  }
  // ===== MILL-ON-EVENT (Wave 3b, CR 701.13a — milling cards is a SINGLE game event) ===== Two corpus
  // templates, both classified to the shared "milled" event (fired by checkMilledTriggers off the real
  // mill chokepoints — the mill effect atom + the inherent radiation ability):
  //   BATCH ("one or more [nonland] cards are milled") — fires ONCE per mill event regardless of how many
  //     cards were milled (Mirelurk Queen, Screeching Scorchbeast, The Wise Mothman). perCard:false.
  //   PER-CARD ("a player|an opponent mills a [nonland] card") — fires once per MATCHING card milled (CR
  //     701.13a — each milled card is a distinct object, so a payoff phrased per-card fires per-card;
  //     Glowing One "you gain 1 life" per nonland, Infesting Radroach). perCard:true.
  // `milledFilter` = "nonland" gates on the milled card's FRONT-face type (checkMilledTriggers), null = any
  // card. `whose` = "any" ("a player") or "opponent" (the milling player must be an opponent of the
  // watcher's controller — Infesting Radroach). Anchored end-to-end: a TYPE-filtered variant ("one or more
  // CREATURE cards are milled", "mills one or more cards" rider) or any other shape leaves residue → null →
  // Arbiter (a SAFE false-negative; CLAUDE.md §1.2). This is the trigger BIND only — the milled-card payoffs
  // (rad/draw/counter/token) already exist; an effect that can't parse HIGH (a "once each turn"/scaling
  // rider) still routes the WHOLE trigger to the Arbiter at flush (buildTriggerStack), never a partial.
  // LIFE-LOST (SHELF M3 — Mindcrank): "an opponent loses life" / "a player loses life". The event fires
  // from the loseLife chokepoint (gameState registry → checkLifeLossTriggers), so DAMAGE-caused loss
  // (CR 119.3) fires it too. `whose:"opponent"` gates the LOSING player against the watcher's controller.
  // The amount rides ctx.lifeLostAmount; the loser rides ctx.lifeLostPlayerId. Anchored end-to-end — any
  // qualifier ("for the first time", "2 or more life") leaves residue → null → Arbiter (CREED).
  let lifeLostM = c.match(/^(an opponent|a player) loses life$/);
  if (lifeLostM) return { event: "lifeLost", scope: "lifeLost", whose: /opponent/.test(lifeLostM[1]) ? "opponent" : "any" };
  let milledM = c.match(/^one or more (nonland )?cards are milled$/);
  if (milledM) return { event: "milled", scope: "milled", whose: "any", perCard: false, milledFilter: milledM[1] ? "nonland" : null };
  milledM = c.match(/^(a player|an opponent) mills (?:a|an|one) (nonland )?card$/);
  if (milledM) {
    return { event: "milled", scope: "milled", whose: /opponent/.test(milledM[1]) ? "opponent" : "any", perCard: true, milledFilter: milledM[2] ? "nonland" : null };
  }
  return null;
}

// CAST-SUBTYPE: single bare words in "cast a[n] <word> spell" that are NOT a permanent/spell SUBTYPE — a
// type/supertype/category/ordinal/color that a word-bounded type-line match would NEVER fire on (claiming
// native while the trigger silently never fires = a CREED false positive). Mirrors staticAbilityParser's
// merged denylist convention (#338, NON_SUBTYPE_COST_FILTER_WORDS). Real subtypes (Elf, Dog, Dragon,
// Adventure, Aura, Knight…) are never here. Kept local so triggers.js stays a leaf module.
const NON_SUBTYPE_CAST_WORDS = new Set([
  "instant", "sorcery", "artifact", "enchantment", "creature", "noncreature", "land", "planeswalker", "battle",
  "historic", "legendary", "permanent", "spell", "colorless", "multicolored", "monocolored", "snow",
  "nonland", "kindred", "tribal", "first", "second", "third", "another", "your", "this",
  // COLORS — "cast a red/white/… spell" is a COLOR filter, never a type-line token, so subtype:Red would
  // never fire → claiming native = FP (Dragon's Claw, the Gnarr/Duo cycles, Sol'kanar, Titania's Chosen).
  // Caught by the corpus flip-diff. Color cast-triggers stay body-only → Arbiter until a color filter exists.
  "white", "blue", "black", "red", "green",
  // CAST-MODIFIERS / DEFINED TERMS — "a kicked spell" (kicker, Merfolk Falconer), "a LOUD spell" (a defined
  // term, The Karfell Rocker) describe HOW a spell was cast / a named property, never a type-line subtype →
  // would never fire → FP. Also flip-diff-caught. (The denylist is the codebase convention, #338; a future
  // subtype-allowlist would make this airtight — deferred as infra.)
  "kicked", "loud",
  // UN-SET DEFINED TERM — "an alliterative spell" (Treacherous Trapezist) is a name-based joke property
  // (two+ same-initial capitalized words in the name), NOT a type-line subtype → subtype:Alliterative would
  // never fire → a do-nothing native = FP (Hans, cycle 44 — the denylist leaked; concrete proof the
  // subtype-allowlist infra is worth building).
  "alliterative",
]);

// ANOTHER-SUBTYPE ETB: words that are NOT a creature subtype or permanents type — type/supertype/meta words
// whose typeStr inclusion check would never fire (claiming native while the trigger silently never fires = FP).
// "artifact", "enchantment", "land" are intentionally OMITTED — typeStr covers them faithfully
// ("Artifact", "Enchantment", "Land" appear literally in type lines). "creature" routes via creatureSubjectScope.
const NON_SUBTYPE_ETB_WORDS = new Set([
  "creature", "permanent", "spell", "planeswalker", "battle",
  "historic", "legendary", "colorless", "snow", "nonland", "noncreature",
  "nontoken", "token", "nonlegendary",
  "white", "blue", "black", "red", "green", // colors (never in type line)
  "another", "your", "this", "that", "each", "every",
  // CR-defined umbrella terms — not type-line tokens; typeStr check would silently never fire (FP).
  "outlaw", // CR 203.4c: {Assassin, Mercenary, Pirate, Rogue, Warlock}
]);

/** Map the words between "cast a[n]" and "spell" to a MODELED spell filter, or null. */
// Colour words admissible as a CAST-SPELL quality filter (CR 105.1). Kept beside castSpellFilter rather than
// imported so the cast lane's vocabulary stays readable in one place; the letters match colorsOf()'s output.
const SPELL_COLOR_LETTER = { white: "W", blue: "U", black: "B", red: "R", green: "G" };

function castSpellFilter(text) {
  const f = String(text).trim();
  if (f === "") return "any";                                  // "casts a spell"
  if (/^(?:instant|sorcery|instant or sorcery)$/.test(f)) return "instantSorcery";
  if (f === "artifact") return "artifact";       // "Whenever you cast an artifact spell" (improvise/affinity payoffs)
  if (f === "enchantment") return "enchantment"; // "Whenever you cast an enchantment spell" (enchantress payoffs)
  if (f === "creature") return "creature";
  if (f === "noncreature") return "noncreature";
  // HISTORIC (BLITZ TR-3, CR 700.6) — "the term historic refers to an object that has the legendary
  // supertype, the artifact card type, or the Saga subtype." A whole-object QUALITY, not a subtype: the
  // NON_SUBTYPE_CAST_WORDS denylist (checked below) rejects "historic" as a subtype (a "\bHistoric\b" type-
  // line scan would never fire → a do-nothing native = FP), so it's carved out HERE as an exact quality
  // filter spellMatchesFilter enforces on the cast spell's type line (Legendary ∨ Artifact ∨ Saga). Cabal
  // Paladin, Serra Disciple, the Dominaria historic-matters payoffs.
  if (f === "historic") return "historic";
  // MULTICOLORED (BLITZ TR-3, CR 105.2b) — "a multicolored object is two or more of the five colors." Like
  // historic, a COLOR-count quality, not a subtype/type-line token (the denylist rejects it below), so it's
  // an exact filter enforced on the cast spell's colorsOf() (≥2 colors). Mana Cannons, Hero of Precinct One,
  // the multicolor-matters payoffs. The color of a spell is fixed by its mana cost / color indicator at cast
  // (CR 105.2b + 500.4-agnostic), so the printed colorsOf reading is CR-faithful for the cast event.
  if (f === "multicolored") return "multicolored";
  // ⭐ SINGLE COLOUR + COLORLESS (CR 105.2 / 105.2c) — the missing siblings of `multicolored` directly above,
  // and its rationale applies verbatim: a colour is a whole-object QUALITY, not a type-line token, so the
  // subtype denylist below rejects it and it must be carved out here. That comment already establishes the
  // CR-faithfulness of the reading — "the color of a spell is fixed by its mana cost / color indicator at
  // cast, so the printed colorsOf reading is CR-faithful for the cast event" — and nothing about single
  // colours differs. 13 corpus carriers: red (Cinder Pyromancer, Iron Man), colorless (Kozilek's Sentinel,
  // Molten Nursery, Nettle Drone), green, blue, white.
  //
  // ⛔ COLORLESS IS THE ABSENCE OF COLOUR, NOT A SIXTH COLOUR (CR 105.2c) — a separate filter with an
  // empty-colors test, exactly as the condition grammar and the mass-damage grammar both model it. Folding it
  // into the colour list would make every colourless spell match every colour.
  if (SPELL_COLOR_LETTER[f]) return `color:${SPELL_COLOR_LETTER[f]}`;
  if (f === "colorless") return "colorless";
  // CAST-SUBTYPE — a single bare word that's a real subtype (not in the denylist) → match the cast spell's
  // type line (Elf/Dog/Dragon/Adventure/Aura spells; tribal cast payoffs). A multi-word phrase, color, or
  // denylisted word → null → undetected → Arbiter (a SAFE false-negative). Serialized as "subtype:Name".
  if (/^[a-z]+$/.test(f) && !NON_SUBTYPE_CAST_WORDS.has(f)) return `subtype:${f.charAt(0).toUpperCase() + f.slice(1)}`;
  // TYPED-LIST — an "A, B, or C" list of type words ("Aura, Equipment, or Vehicle" — Sram). Split on
  // commas / "or" / "and", strip a leftover leading "or "/"and " (the Oxford comma ", or" leaves "or
  // vehicle" when the comma split fires first), and require EVERY word to be a real type/subtype token (NOT
  // denylisted — same NON_SUBTYPE_CAST_WORDS gate as the single-word path, so a color/category word in the
  // list rejects the whole filter → null → Arbiter). The cast spell matches if its type line carries ANY
  // listed word (CR 205.2), exactly how "Aura, Equipment, or Vehicle" reads. Serialized as a typed object.
  const words = f
    .split(/\s*,\s*|\s+or\s+|\s+and\s+/)
    .map((w) => w.trim().replace(/^(?:or|and)\s+/, ""))
    .filter(Boolean);
  if (words.length >= 2 && words.every((w) => /^[a-z]+$/.test(w) && !NON_SUBTYPE_CAST_WORDS.has(w))) {
    return { kind: "typed", words: words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)) };
  }
  return null; // color / multi-word non-type / denylisted category → unmodeled
}

// W4: the Phase-1 `parseTriggerEffect` naive substring vocabulary was DELETED with the TRIGGER_EFFECT
// zombie lane. Trigger effects resolve ONLY through the rich effect-program pipeline (gameEngine.
// buildTriggerStack parses descriptor.effectClause → EFFECT_PROGRAM) or fall to the Arbiter no-op —
// the naive lane drew without firing draw-triggers and resolved damage as plain loseLife (no infect/
// wither/enrage/replacement), so reviving it would be a CREED false-positive factory.

const _detectCache = new WeakMap();

/**
 * CASCADE (CR 702.85) — count the number of STACKED cascade keyword instances on a card ("Cascade" = 1,
 * "Cascade, cascade" = 2, "Cascade, cascade, cascade, cascade" = 4). The reminder ("Multiple instances of
 * cascade each trigger separately") makes each instance a SEPARATE trigger that digs independently. Match ONLY
 * the run of comma-separated "cascade" keyword tokens IMMEDIATELY preceding the canonical self-cascade reminder
 * (CR 702.85a), so a GRANT — "Sliver spells you cast have cascade" (The First Sliver) — whose "cascade" is NOT
 * followed by that reminder is NEVER counted (the card's OWN single Cascade line is; the grant is judged
 * separately). Returns 0 when the card has no self-cascade keyword. Shared by detectTriggers (emits N cascade
 * descriptors) and coverage (bumps the shaped count by N so shaped === detected holds).
 */
export function cascadeInstanceCount(oracle) {
  const o = String(oracle || "");
  const m = o.match(/\b(cascade(?:\s*,\s*cascade)*)\s*\((?=when you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less)/i);
  if (!m) return 0;
  return (m[1].match(/cascade/gi) || []).length;
}

/**
 * KW-UNDYING (CR 702.92a, SHELF S7) — is the PRINTED undying keyword on this card? 1/0 (multiple printed
 * instances don't exist; a hypothetical double would still return 1 — each extra instance's trigger is a
 * strict-superset no-op after the first returns the card, so 1 is the honest count). The keyword line is
 * matched STRUCTURALLY, not by word-lookbehind: after reminder-strip, split each oracle LINE on commas and
 * require a whole segment to be exactly "undying" — the shape of a printed keyword list ("Undying",
 * "Haste\nUndying", "Vigilance, trample, undying"). This excludes, by construction:
 *   - GRANTS ("target creature gains undying until end of turn" — Undying Evil; "…you control has undying"
 *     — Mikaeus): the segment carries the grant verb, never bare "undying".
 *   - OLD-WORDING SELF-NAMES ("When Undying Beast dies, put it on top …"): the name rides inside a longer
 *     segment. No lookbehind list to maintain, no false self-synthesis (CREED).
 * Shared by detectTriggers (synthesizes the dies-return descriptor) and coverage.allTriggerSentencesModeled
 * (bumps the shaped count so shaped === detected holds — the keyword's trigger sentence lives in stripped
 * reminder text and never counts as a shaped sentence, the bushido/afflict/cascade precedent exactly).
 */
/**
 * KW-EVOLVE (CR 702.100, SHELF S7) — is the PRINTED evolve keyword on this card? 1/0. STRUCTURAL like
 * undyingKeywordCount: a whole comma-segment of a line must be exactly "evolve", so a GRANT ("…creatures
 * you control have evolve" — Vorel-adjacent grants) or a sentence merely containing the word never
 * self-synthesizes (CREED — those stay body-only/Arbiter, a safe FN).
 */
export function evolveKeywordCount(oracle) {
  const stripped = String(oracle || "").replace(/\([^)]*\)/g, " "); // reminder text off (the undying idiom)
  for (const line of stripped.split("\n")) {
    if (line.split(",").some((seg) => seg.trim().toLowerCase() === "evolve")) return 1;
  }
  return 0;
}

/**
 * KW-RENOWN (CR 702.111) — "Renown N" on its own line (reminder text stripped, the undying/evolve idiom).
 * Returns N (the counter count), or 0 when the card doesn't carry a printed renown keyword. A GRANTED
 * renown ("creatures you control have renown 1") is a different shape and never matches the anchor, so it
 * contributes 0 here and 0 to the detected count — the pair stays reconciled.
 */
export function renownKeywordValue(oracle) {
  const stripped = String(oracle || "").replace(/\([^)]*\)/g, " ");
  for (const line of stripped.split("\n")) {
    for (const seg of line.split(",")) {
      const m = seg.trim().toLowerCase().match(/^renown (\d+)$/);
      if (m) return parseInt(m[1], 10);
    }
  }
  return 0;
}

/**
 * MOBILIZE N (CR 702.174) — "Whenever this creature attacks, create N tapped and attacking 1/1 red Warrior
 * creature tokens. Sacrifice them at the beginning of the next end step." Like renown, the whole ability
 * lives in reminder parens (and one printing omits the reminder entirely — "Mobilize 1" bare), so the
 * boundary-anchored trigger regex can never see it. Reminder text is stripped before matching so both
 * printings read the same. A GRANTED mobilize would not match this self-anchored form.
 */
export function mobilizeKeywordValue(oracle) {
  const stripped = String(oracle || "").replace(/\([^)]*\)/g, " ");
  for (const line of stripped.split("\n")) {
    for (const seg of line.split(",")) {
      const m = seg.trim().toLowerCase().match(/^mobilize (\d+)$/);
      if (m) return parseInt(m[1], 10);
    }
  }
  return 0;
}

/**
 * BACKUP N (CR 702.166) — "When this creature enters, put N +1/+1 counters on target creature. If that's
 * another creature, it gains the following ability until end of turn." The whole ability is in reminder
 * parens, so it is synthesized like renown / mobilize.
 *
 * MODELED AS THE SELF-TARGET LINE ONLY, and that is a deliberate, stated narrowing. Self-target is one of
 * the card's own legal choices (and the FORCED one when it is your only creature), and choosing it makes the
 * "if that's another creature" grant vacuous — so the engine plays a real, legal line faithfully. What it
 * does NOT do is offer backup on a DIFFERENT creature, because "the following ability" is card-specific text
 * that would have to be threaded onto another permanent. That is an under-offer: safe, and the same shape as
 * not offering an awaken or bestow mode. Never the reverse.
 */
/**
 * Returns N for a printed numeric "Firebending N", else 0.
 *
 * "Firebending 1 (Whenever this creature attacks, add {R}. This mana lasts until end of combat.)" — like
 * renown / mobilize / backup, the whole ability lives in reminder parens where the boundary-anchored trigger
 * regex cannot reach it, so it is synthesized from the keyword line.
 *
 * NUMERIC ONLY, on purpose. The corpus also prints "Firebending X, where X is this creature's power" (and X =
 * experience counters / creatures you control). Those need a dynamic amount the add-mana atom has no shape
 * for, and guessing a fixed number would print the WRONG amount of mana every time — so they fail the anchor
 * and stay on the Arbiter. False-negative safe, per the creed.
 */
export function firebendingKeywordValue(oracle) {
  // Reminder parens stripped FIRST, exactly like renownKeywordValue — the keyword line is printed as
  // "Firebending 1 (Whenever this creature attacks, …)", and the comma inside those parens would otherwise
  // leave the first segment as "firebending 1 (whenever this creature attacks", which matches nothing.
  const stripped = String(oracle || "").replace(/\([^)]*\)/g, " ");
  for (const line of stripped.split("\n")) {
    for (const seg of line.split(",")) {
      const m = seg.trim().toLowerCase().match(/^firebending (\d+)$/);
      if (m) return parseInt(m[1], 10);
    }
  }
  return 0;
}

/**
 * KW-DETHRONE (CR 702.104a) — does the card print the bare keyword? Parens stripped first, like renown /
 * firebending, because the whole ability lives inside the reminder text.
 *
 * Excluded on purpose: Dack's Duplicate ("…enter as a copy of any creature, except it has haste and
 * dethrone"), where dethrone is GRANTED to a copy rather than printed as this creature's own keyword — the
 * comma-segment anchor never matches that sentence, so it stays on the Arbiter.
 */
export function hasDethrone(oracle) {
  const stripped = String(oracle || "").replace(/\([^)]*\)/g, " ");
  for (const line of stripped.split("\n")) {
    for (const seg of line.split(",")) {
      if (seg.trim().toLowerCase() === "dethrone") return true;
    }
  }
  return false;
}

/**
 * KW-TRAINING (CR 702.148a) — does the card print the bare keyword? Parens stripped first, like dethrone.
 * Unlike the optional-mode family, training is a MANDATORY trigger with a real condition, so it is credited
 * by being modeled (synthesized descriptor + intervening-if), never by being declined.
 */
/**
 * KW-SOULSHIFT (CR 702.46) — how many soulshift descriptors detectTriggers will synthesize from this card.
 *
 * Exists so coverage.js's shaped/detected reconciliation counts soulshift the SAME way the synthesis does,
 * rather than restating the pattern. Uses the identical reminder-strip + matchAll as the synthesis site, so a
 * DOUBLE soulshift (Forked-Branch Garami, "Soulshift 4, soulshift 4" — CR 702.46b, two separate dies
 * triggers) counts 2 in both places and cannot drift.
 */
export function soulshiftKeywordCount(oracle) {
  return [...String(oracle || "").replace(/\([^)]*\)/g, " ").matchAll(/\bsoulshift\s+(\d+)\b/gi)].length;
}

export function hasTraining(oracle) {
  const stripped = String(oracle || "").replace(/\([^)]*\)/g, " ");
  for (const line of stripped.split("\n")) {
    for (const seg of line.split(",")) {
      if (seg.trim().toLowerCase() === "training") return true;
    }
  }
  return false;
}

export function backupKeywordValue(oracle) {
  const stripped = String(oracle || "").replace(/\([^)]*\)/g, " ");
  for (const line of stripped.split("\n")) {
    for (const seg of line.split(",")) {
      const m = seg.trim().toLowerCase().match(/^backup (\d+)$/);
      if (m) return parseInt(m[1], 10);
    }
  }
  return 0;
}

/**
 * KW-PARTNER-WITH (CR 702.124j) — the NAME a "Partner with [name]" line points at, or null.
 *
 * CR 702.124j: "'Partner with [name]' represents TWO abilities. It means 'You may designate two legendary
 * cards as your commander rather than one if each has a "partner with [name]" ability with the other's name'
 * AND 'When this permanent enters, target player may search their library for a card named [name], reveal it,
 * put it into their hand, then shuffle.'"
 *
 * ⚠️ THE PRINTED REMINDER TEXT UNDERSTATES THE ABILITY, so it is not the source of truth here. The card's own
 * parens say "put [name] into their hand from their library" — no "search", no "reveal". The CR says both. The
 * SEARCH wording is what makes the existing tutor machinery the honest model rather than a bare zone move.
 *
 * ⚠️ AND THE REMINDER USES A SHORT NAME while the keyword line uses the FULL one — Silvar prints "Partner with
 * Trynn, Champion of Freedom" but reminds "put Trynn into their hand". The library holds the FULL printed name,
 * so the name is taken from the KEYWORD LINE only. Reading the reminder would search for a card that does not
 * exist and silently find nothing forever.
 *
 * ⛔ "PARTNER WITH ITSELF" IS REFUSED (Mothers Yamazaki). Its line names no other card — the searched name is
 * the card's OWN — and it carries a second deck-construction clause besides. Returning "itself" here would hand
 * the tutor a search for a card literally named "itself": zero candidates, forever, with every test green and
 * the tier reading native. A false negative (the card parks) is the creed-safe direction; it parks on other
 * clauses today regardless.
 *
 * WHOLE-LINE anchored (not the comma-segment convention the neighbours use) for two reasons: partner names
 * routinely CONTAIN commas ("Trynn, Champion of Freedom" — 28 of the 54 corpus lines), so segmenting would
 * truncate the name; and a whole-line anchor means a QUOTED grant ('… have "Partner with X"') never
 * self-synthesizes, the same guarantee undying/evolve get from their structural match.
 *
 * ⛔ NOT MODELED — THE DECK-CONSTRUCTION HALF. The first of 702.124j's two abilities (designating two
 * commanders) "function[s] before the game begins" per CR 702.124a; it is a deck-construction rule with no
 * battlefield surface, and this engine models battlefield play. It is DECLARED unmodeled here rather than
 * skipped silently: a card credited by this synthesis is credited for its ETB half ONLY.
 */
export function partnerWithName(oracle) {
  const stripped = String(oracle || "").replace(/\([^)]*\)/g, " ");
  for (const line of stripped.split("\n")) {
    const m = line.trim().match(/^partner with (.+)$/i);
    if (!m) continue;
    const name = m[1].trim();
    if (!name || /^itself$/i.test(name)) return null; // see the Mothers Yamazaki note above
    return name;
  }
  return null;
}

export function undyingKeywordCount(oracle) {
  const stripped = String(oracle || "").replace(/\([^)]*\)/g, " ");
  for (const line of stripped.split("\n")) {
    if (line.split(",").some((seg) => seg.trim().toLowerCase() === "undying")) return 1;
  }
  return 0;
}

/**
 * KW-ENGINES structural counter (CR 702.179) — a whole line (reminder stripped) that IS
 * "start your engines!". Structural like undying/afterlife: a grant ("… gains start your
 * engines!") or a mid-sentence mention never counts, so only the printed keyword self-
 * synthesizes (CREED — a granted copy stays unmodeled, a safe FN).
 */
export function startYourEnginesKeywordCount(oracle) {
  const stripped = String(oracle || "").replace(/\([^)]*\)/g, " ");
  for (const line of stripped.split("\n")) {
    if (line.trim().toLowerCase() === "start your engines!") return 1;
  }
  return 0;
}

/** AFTERLIFE (BLITZ AF-2, CR 702.135b) — the printed keyword's N values, one entry per printed instance
 * (CR 702.135b — multiples each trigger separately). STRUCTURAL like undyingKeywordCount: a whole
 * comma-segment of a line must be EXACTLY "afterlife N", so a GRANT ("creatures you control gain
 * afterlife 1 until end of turn" — Afterlife Insurance; "…and has afterlife 1" — Indebted Spirit's
 * enchanted-creature buff line) or any mid-sentence use never counts (CREED — a layer-6 keyword grant
 * would never self-synthesize). Shared by the detectTriggers synthesis and coverage's shaped-count bump. */
export function afterlifeKeywordValues(oracle) {
  const stripped = String(oracle || "").replace(/\([^)]*\)/g, " ");
  const out = [];
  for (const line of stripped.split("\n")) {
    for (const seg of line.split(",")) {
      const m = seg.trim().toLowerCase().match(/^afterlife (\d+)$/);
      if (m) out.push(parseInt(m[1], 10));
    }
  }
  return out;
}

/** MODULAR (BLITZ MOD-1, CR 702.43a) — the printed keyword's N values, one entry per printed instance
 * (CR 702.43b — multiple instances each work separately). STRUCTURAL like afterlifeKeywordValues: a whole
 * comma-segment of a reminder-stripped line must be EXACTLY "modular N" (a literal DIGIT). This is the
 * SINGLE recognizer shared by (a) the detectTriggers dies-payoff synthesis, (b) resolvers.enterPermanent's
 * enters-with-N-+1/+1-counters replacement (CR 702.43a first half), and (c) coverage's shaped-count bump —
 * so they can NEVER drift on which instances count. Deliberately DIGIT-only so the two non-fixed-count
 * variants PARK (CREED — never a fabricated/wrong count):
 *   - "Modular—Sunburst" (Arcbound Wanderer) — enters with a counter PER color of mana spent (variable),
 *     no space+digit after "modular" → no match → the whole card stays body-only (Sunburst is unmodeled).
 *   - "Poison Modular N" (Arcbound Mamba) — its dies payoff targets a PLAYER or artifact creature and makes
 *     poison counters, a DIFFERENT effect; the segment is "poison modular n" (leads with "poison"), so the
 *     `^modular` anchor rejects it and the variant is never modeled as plain modular (a dropped-rider FP).
 * A mid-sentence use ("each creature you control with modular" — Arcbound Overseer) is never a bare
 * "modular N" segment either, so it contributes 0. */
export function modularKeywordValues(oracle) {
  const stripped = String(oracle || "").replace(/\([^)]*\)/g, " ");
  const out = [];
  for (const line of stripped.split("\n")) {
    for (const seg of line.split(",")) {
      const m = seg.trim().toLowerCase().match(/^modular (\d+)$/);
      if (m) out.push(parseInt(m[1], 10));
    }
  }
  return out;
}

/** MENTOR (BLITZ MN-1, CR 702.134b) — the STRUCTURAL instance counter (the battle-cry matcher: a whole
 * comma-segment must be exactly "mentor"; multiples each trigger separately per CR 702.134b). A GRANT
 * ("…and has mentor" — Aegis of the Legion / Nyxborn Unicorn's enchanted-creature line) or any mid-sentence
 * use never counts (CREED — a keyword grant would never self-synthesize). Shared by the detectTriggers
 * synthesis and coverage's shaped-count bump so the two can't drift. */
export function mentorKeywordCount(oracle) {
  const stripped = String(oracle || "").replace(/\([^)]*\)/g, " ");
  let n = 0;
  for (const line of stripped.split("\n")) {
    for (const seg of line.split(",")) if (seg.trim().toLowerCase() === "mentor") n++;
  }
  return n;
}

/** KW-PERSIST (BLITZ PS-1, CR 702.79a) — the STRUCTURAL matcher, undying's exact mirror: a whole
 * comma-segment must be exactly "persist", so a grant ("…gains persist" — Cauldron of Souls) or a
 * mid-sentence use never counts. Shared by the synthesis and coverage's shaped bump. */
export function persistKeywordCount(oracle) {
  const stripped = String(oracle || "").replace(/\([^)]*\)/g, " ");
  for (const line of stripped.split("\n")) {
    if (line.split(",").some((seg) => seg.trim().toLowerCase() === "persist")) return 1;
  }
  return 0;
}

/** BATTLE CRY (BLITZ BC-1, CR 702.90) — the STRUCTURAL instance counter (the flanking matcher: a whole
 * comma-segment must be exactly "battle cry"; multiples stack per CR 702.90b — each instance pumps the
 * team +1/+0 again). A grant ("…creatures have battle cry") never counts. Shared by the synthesis and
 * coverage's shaped bump. */
export function battleCryKeywordCount(oracle) {
  const stripped = String(oracle || "").replace(/\([^)]*\)/g, " ");
  let n = 0;
  for (const line of stripped.split("\n")) {
    for (const seg of line.split(",")) if (seg.trim().toLowerCase() === "battle cry") n++;
  }
  return n;
}

/**
 * FLANKING (BLITZ FL-1, CR 702.25) — the STRUCTURAL instance counter (the undying matcher, counting
 * MULTIPLES: CR 702.25b — each flanking instance triggers separately, so "Flanking, flanking" debuffs
 * -2/-2 total). A whole comma-segment of a line must be exactly "flanking" — a GRANT ("…creatures have
 * flanking") or the phrase inside another card's condition ("a creature without flanking") never counts.
 * Shared by the detectTriggers synthesis, the checkBlockTriggers fire site, and coverage's shaped bump,
 * so the three can't drift.
 */
export function flankingKeywordCount(oracle) {
  const stripped = String(oracle || "").replace(/\([^)]*\)/g, " ");
  let n = 0;
  for (const line of stripped.split("\n")) {
    for (const seg of line.split(",")) if (seg.trim().toLowerCase() === "flanking") n++;
  }
  return n;
}

/**
 * EXALTED (SLIVER INTERIORS, BLITZ SP-1 — CR 702.83) — the STRUCTURAL instance counter, the exact
 * flanking pattern: a whole comma-segment of a (reminder-stripped) line must be exactly "exalted", so a
 * GRANT line ("Sliver creatures you control have exalted" — First Sliver's Chosen, Sublime Archangel)
 * or a reference inside another ability never counts as an OWN printed instance. Replaces the old loose
 * `\bexalted\b` scan at the checkAttackTriggers fire site (which over-counted a granter's own
 * instances); the granted instances re-enter per-permanent through layers.keywordInstanceCount.
 */
export function exaltedKeywordCount(oracle) {
  const stripped = String(oracle || "").replace(/\([^)]*\)/g, " ");
  let n = 0;
  for (const line of stripped.split("\n")) {
    for (const seg of line.split(",")) if (seg.trim().toLowerCase() === "exalted") n++;
  }
  return n;
}

/**
 * TRIG-PUMP-1 (the trigger-effect compiler pilot) — a SELF-scope trigger states the pump on its OWN
 * source with the pronoun "it": "Whenever this creature attacks, IT gets +2/+0 until end of turn"
 * (Brazen Wolves), "…, IT gains trample until end of turn" (the combat-buff family). The modeled
 * self-pump atom keys off the literal subject "this creature" (target:"self" → ctx.sourceId in the
 * parser), so the effectClause "it gets/gains … until end of turn" must be normalized "it" →
 * "this creature" for the parser to model it. This regex is the CREED guard on WHEN to do that: it
 * matches ONLY the WHOLE-clause self-pump shapes the parser accepts (pure ±P/±T, ±P/±T + keyword
 * grant, or keyword-grant only — anchored start-to-end). A rider/compound ("it gets +2/+0 until end
 * of turn. Draw a card") leaves residue past `until end of turn$` → no match → no rewrite → stays
 * LOW → Arbiter (a SAFE false-negative). It mirrors parser.js's three self-pump matchers exactly;
 * the parser still re-gates the keyword set (an unmodeled keyword → LOW), so this only GIVES the
 * parser the chance to model it — it never asserts coverage on its own.
 */
// FOR-EACH tail (TRIG-PUMP-COUNT) — a count-scaled self-pump states a per-unit ±P/±P that multiplies by a
// board count AFTER "until end of turn": "it gets +1/+1 until end of turn FOR EACH land you control"
// (Rampaging Brontodon). The pronoun-rewrite branches below operate on the LEADING "it" only (tail-agnostic
// `^it ` replace), and the parser re-gates the whole clause (the for-each pump matcher demands a parseable
// count source + a symmetric per-unit delta, else LOW → Arbiter), so admitting the optional tail here only
// GIVES the parser the chance to model it — never asserts coverage. A pump-grant ("and gains KW") form has no
// "for each" tail in printed text, so the optional tail rides the pure ±P/±P branch only.
const SELF_PUMP_IT_RE = /^it (?:gets [+-]\d+\/[+-]\d+(?: and gains .+?)?|gains .+?) until end of turn(?: for each .+)?$/i;

// THAT-CREATURE PUMP (BLITZ TR-2 — Agents of S.H.I.E.L.D. "Whenever a creature you control attacks alone,
// THAT CREATURE gets +1/+1 until end of turn"): the NON-self pronoun-subject pump with "that creature"
// instead of "it" — the SAME whole-clause pump/grant shapes SELF_PUMP_IT_RE admits, the same referent
// (the TRIGGERING creature, CR 608.2c). Rewritten (NONSELF_TRIGGERING_SCOPES-gated, alongside the "it"
// branch) to the "the triggering creature …" sentinel the parser models as target:"thatCreature". A
// rider/compound fails the whole-clause anchor → no rewrite → LOW → Arbiter (a SAFE false-negative).
const THAT_CREATURE_PUMP_RE = /^that creature (?:gets [+-]\d+\/[+-]\d+(?: and gains .+?)?|gains .+?) until end of turn(?: for each .+)?$/i;

// IT-COUNTER — the self-COUNTER analogue of SELF_PUMP_IT_RE: a SELF-scope trigger states its +1/+1 (or
// -1/-1) counter on its own source with the pronoun "it" — "Whenever this creature attacks, put a +1/+1
// counter on it" (the firebreathing-counter family). Mirrors the parser's self-counter shape
// (parser.js: "…counters? on this creature$", target:"self") with "it"; whole-clause anchored, so a
// rider/compound ("…on it. Draw a card") leaves it untouched → LOW → Arbiter (a SAFE false-negative).
// "that many" (ENRAGE / DAMAGE-RECEIVED self-scaled, Hungering Hydra) is admitted alongside the fixed-N count:
// a self-scope dealt-damage trigger's "put that many +1/+1 counters on it" rewrites to "…on this creature" here,
// then the add-counter self parser (counters.js, countContext:"combatDamageAmount") binds the count to the damage.
const SELF_COUNTER_IT_RE = /^put (?:a|an|one|two|three|four|five|\d+|that many) [+-]1\/[+-]1 counters? on it$/i;

// IT-DOUBLE — the DOUBLING sibling of SELF_COUNTER_IT_RE (Level Up's granted body: "Whenever this creature
// attacks, DOUBLE the number of +1/+1 counters on it"). The parser already models the same clause written
// "…on THIS CREATURE" (countFor:countersOnSource, target:"self", HIGH — measured); only the pronoun was
// missing, which is the same one-word gap the pump and counter siblings above were built to close.
//
// Same two guards as its siblings, and both are load-bearing: SELF-SCOPE ONLY (for a non-self trigger "it"
// is the OTHER triggering creature, so doubling the SOURCE's counters would be a confidently wrong target),
// and WHOLE-CLAUSE anchored (Level Up's real text continues "Then if it has power 10 or greater, draw a
// card." — that compound does NOT match here, so the card keeps routing to the Arbiter until the threshold
// half is modelled: a safe FN, never a partial fire).
const SELF_DOUBLE_IT_RE = /^double the number of [+-]1\/[+-]1 counters on it$/i;

// IT-DOUBLE, LEADING form — the same clause as the SENTENCE that OPENS a compound: Level Up's granted body
// is "Whenever this creature attacks, double the number of +1/+1 counters on it. THEN IF it has power 10 or
// greater, draw a card." The comment above used to say that compound "keeps routing to the Arbiter until the
// threshold half is modelled" — but the threshold half IS modelled (parser.js's CD-1 "then if <cond>, <effect>"
// peel reads "it has power N or greater" in a self-scoped trigger). ONLY the whole-clause anchor was in the
// way: it refused to rewrite the pronoun when anything followed the sentence.
//
// ⛔ THE ANCHOR IS NOT WEAKENED, IT IS RELOCATED. This rewrites ONLY the pronoun inside the FIRST sentence and
// leaves every following sentence byte-identical, so the remainder must still parse on its own merits — an
// unmodelled rider ("…on it. Then flurgle the wumpus.") still parks the whole card. Whole-card safety is
// preserved by the parser, not by refusing to look. Self-scope gate unchanged (for a NON-self trigger "it" is
// the OTHER triggering creature, which the thatCreature lane owns).
const SELF_DOUBLE_IT_LEAD_RE = /^double the number of [+-]1\/[+-]1 counters on it\.\s+\S/i;

// SELF-SAC-IT (BECOMES-TARGET, the Phantasmal Illusion family) — a SELF-scope trigger sacrifices its OWN
// source with the pronoun "it": "When this creature becomes the target of a spell or ability, sacrifice it."
// For a self-scope trigger "it" is the SOURCE (CR 608.2c — the object the ability triggered on = the targeted
// permanent = the source), so rewrite "sacrifice it" → "sacrifice this creature" (the parser's self-sac atom,
// target:"self" → ctx.sourceId). Whole-clause anchored; a rider ("sacrifice it unless you discard a land card"
// — Cursed Monstrosity) leaves residue → no rewrite → LOW → Arbiter (a SAFE false-negative). Gated on
// cls.scope === "self" at the rewrite site (a NON-self trigger's "it" is the OTHER triggering permanent — the
// NONSELF_SAC_REF_RE → thatCreature lane handles those), so this never mis-binds.
const SELF_SAC_IT_RE = /^sacrifice it$/i;

// COUNTERS-PLACED — the EXACT "that many"/"that much" payoff shapes a counters-placed trigger rewrites to an
// event-specific sentinel (so the count binds ctx.countersPlaced, not combatDamageAmount). Anchored to the
// bare payoff (with the optional "you may" wrapper) OR that payoff followed ONLY by the modeled "Do this only
// once each turn." rider — the effectClause already has the same-line follow-up appended by the time this runs
// (Terrasymbiosis / Earth Kingdom General both carry it). A DIFFERENT trailing rider ("draw that many cards,
// then discard") leaves residue → no match → no rewrite → LOW → Arbiter (a SAFE false-negative).
const COUNTERS_PLACED_PAYOFF_RE = /^(?:you may )?(?:draw that many cards|gain that much life)(?:\.\s*do this only once each turn)?\.?$/i;

// LIFEGAIN-SCALED SELF COUNTERS (BLITZ EC-1b — Sunbond / Light of Promise): "Whenever you gain life, put
// that many +1/+1 counters on this creature." — "that many" is the amount of life just gained
// (ctx.lifegainAmount, threaded by checkLifegainTriggers), NOT a combat-damage amount. The raw clause is
// byte-identical to the ENRAGE payoff (Hungering Hydra's dealtDamage form binds the SAME words to
// countContext:"combatDamageAmount"), so the clause parser alone cannot disambiguate — the rewrite (below,
// gated to the lifegain EVENT) inserts the event-specific sentinel ("lifegain +1/+1 counters") the counter
// parser maps to countContext:"lifegainAmount"; combatDamageReferentSatisfied then pins that countContext
// to the lifegain event (the counters-placed/milled discipline exactly). Whole-clause anchored — a rider
// ("…, then you gain 2 life") leaves residue → no rewrite → LOW → Arbiter (a SAFE false-negative).
const LIFEGAIN_SELF_COUNTER_PAYOFF_RE = /^put that many \+1\/\+1 counters? on this creature\.?$/i;

// ===== THE DRAIN MIRROR (CR 118.4 / 119.3) — the two halves of Sanguine Bond ⇄ Exquisite Blood =====
// LIFEGAIN → LOSS (Sanguine Bond, Vito, Enduring Tenacity, Defiant Bloodlord): "Whenever you gain life,
// target/each opponent loses that much life." The magnitude is the life JUST GAINED (ctx.lifegainAmount).
// This phrase currently parses to NOTHING at all, so the rewrite is what makes it reachable.
const LIFEGAIN_DRAIN_PAYOFF_RE = /^(?:target|each) opponent loses that much life\.?$/i;
// LOSS → LIFEGAIN (Exquisite Blood, Bloodthirsty Conqueror): "Whenever an opponent loses life, you gain
// that much life." This one is the OPPOSITE hazard — the bare phrase ALREADY parses, but to
// countContext:"combatDamageAmount" (the Essence Sliver reading). On a lifeLost trigger that referent is
// never set, so the atom would silently gain 0. The referent gate is what catches it today (which is
// exactly why these cards sit at body-only rather than shipping a broken native), and the rewrite is what
// re-points the magnitude at ctx.lifeLostAmount instead of merely unblocking the words.
const LIFELOST_GAIN_PAYOFF_RE = /^you gain that much life\.?$/i;

// MILLED "that many" TOKEN PAYOFF (Screeching Scorchbeast, SHELF M1b) — "you may create that many 2/2 black
// Zombie Mutant creature tokens[. Do this only once each turn]" on a MILLED trigger: "that many" is the count
// of milled cards matching the trigger's filter, so the rewrite (below) inserts the event-specific sentinel
// ("that many milled[-nonland]") the token clause parser maps to countContext. Anchored to the bare payoff or
// payoff + the modeled once-per-turn rider ONLY — any other trailing rider leaves residue → no rewrite → LOW
// → Arbiter (a SAFE false-negative).
const MILLED_TOKEN_PAYOFF_RE = /^(?:you may )?create that many \d+\/\d+ [a-z/ ]+? creature tokens?(?:\.\s*do this only once each turn)?\.?$/i;

// SELF-LTB (Wave 4) — the EXACT "return it to its owner's hand" effect clause for the self-LTB family
// (Rancor Aura PiG-return + Sword of the Realms equipped-creature-dies-return). Whole-clause anchored, so a
// rider ("…at the beginning of the next end step" = a DELAYED return, Resurrection Orb; "…draw a card") leaves
// residue → the marker isn't applied → the program stays LOW → Arbiter (a SAFE false-negative).
const SELF_RETURN_IT_RE = /^return it to its owner's hand$/i;

// SELF-DIES-RETURN-AS-ENCHANTMENT (the "Enduring"/Glimmer cycle — Enduring Curiosity, Tenacity, Vitality,
// Innocence, Courage, …) — the EXACT self-dies effect "return it to the battlefield under its owner's control.
// It's an enchantment." (the "(It's not a creature.)" reminder is stripped in detectTriggers before the
// effect is assembled). Whole-clause anchored ($): a rider ("…tapped", a delayed "at the beginning of the
// next end step") leaves residue → the marker isn't applied → the program stays LOW → Arbiter (a SAFE
// false-negative). Gated (at the rewrite site) to a self-scope dies trigger, so "it" (CR 608.2c) is the dead
// SOURCE now in its owner's graveyard — exactly the object applySelfReturnBattlefieldEnchantment re-enters.
const SELF_RETURN_BF_ENCHANTMENT_RE = /^return it to the battlefield under its owner's control\. it's an enchantment$/i;

// WAVE 3b COUNTERS-ON-EVENT — the NON-SELF triggering-referent counter. A NON-self attack / combat-damage
// trigger ("Whenever a creature you control deals combat damage to a player, put a +1/+1 counter on THAT
// CREATURE" — Sphere Grid; "…attacks, put a +1/+1 counter on IT") names the TRIGGERING permanent (CR
// 608.2c — a pronoun in later text refers to the object the ability triggered on), NOT the source — so
// the self "it"→"this creature" rewrite above is WRONG here (it would target
// the source). Instead, for a NON-self scope ONLY, normalize the referent → the canonical sentinel "the
// triggering creature", which the WAVE-3b clause parser (effects/atoms/counterClauses.js) binds to
// ctx.triggeringPermanentId. The sentinel is a phrase that appears in ZERO printed oracle text, so a
// SPELL's anaphoric "it"/"that creature" (Big Play / Puncture Bolt / Miraculous Recovery) is NEVER
// rewritten (it isn't a non-self trigger) and stays LOW → Arbiter (CREED — no fabricated/mis-bound counter).
// ±1/±1 only (the enforced counter kinds); whole-clause anchored, so a rider/compound leaves it untouched.
// "that many" (combat-damage-scaled, Necropolis Regent — "Whenever a creature you control deals combat damage to
// a player, put that many +1/+1 counters on it") is admitted alongside the fixed-N count: the non-self referent
// rewrites to "…on the triggering creature", which the WAVE-3b thatCreature parser binds with the same
// countContext:"combatDamageAmount" (the count is the combat damage that creature dealt). CR 608.2c: "it" = the
// triggering permanent, not the source — so this MUST route through the thatCreature lane, never the self path.
const NONSELF_COUNTER_REF_RE = /^put (?:a|an|one|two|three|four|five|\d+|that many) [+-]1\/[+-]1 counters? on (?:it|that creature)$/i;
// DOUBLE-COUNTERS on the same referent (Byrke, Long Ear of the Law — "Whenever a creature you control with a
// +1/+1 counter on it attacks, DOUBLE the number of +1/+1 counters on it"). Identical referent question as
// the PUT form above — "it" is the TRIGGERING creature (CR 608.2c) — and it takes the identical sentinel
// rewrite; only the verb differs. It lived outside the gate purely because the gate was written around "put",
// so the doubling clause reached the clause parser with a raw "on it" it is forbidden to bind and parked.
const NONSELF_DOUBLE_COUNTER_REF_RE = /^double the number of [+-]1\/[+-]1 counters? on (?:it|that creature)$/i;
// The NON-self scopes for which a bare "it"/"that creature" referent is the TRIGGERING permanent: the
// "a creature you control" / "a <Subtype> you control" attack + combat-damage watchers (Sphere Grid family).
// otherCreatureYouControl (Railway Brawler — "Whenever ANOTHER creature you control enters, put X +1/+1
// counters on IT") joins the set: its "it" is the triggering (entering) creature exactly like the others.
// `commanderYouControl` belongs here for the same reason every sibling does: the pronoun's referent is the
// TRIGGERING permanent (CR 608.2c), and this scope threads one exactly as the others do. It was added when
// commander-scoped etb/attacks stopped riding the (vacuous) subtype path — Keleth #6637's "put a +1/+1
// counter on it" routes through this set, so omitting it would have swapped one silent failure for another:
// the card would classify body-only rather than firing. The tier diff caught it as a LOST card.
const NONSELF_TRIGGERING_SCOPES = new Set(["creatureYouControl", "subtypeYouControl", "creatureYouControlKeyword", "otherCreatureYouControl", "commanderYouControl"]);

// ===== SOURCE-STAT (DYNAMIC-COUNT keystone) ===== an ETB trigger whose payoff MAGNITUDE is "that creature's
// power/toughness" — the ENTERING creature's stat (CR 608.2c — the object the ability triggered on): Terror of
// the Peaks "deals damage equal to that creature's power", Verdant Sun's Avatar "gain life equal to that
// creature's toughness". On an `etb` event the `triggeringPermanent` IS the entering creature for every scope
// below (checkEnterTriggers threads enteredPerm), so "that creature" is unambiguously ctx.triggeringPermanentId.
// We rewrite "that creature's <stat>" → the SENTINEL "the triggering creature's <stat>" (a phrase in ZERO
// printed oracle text) which the damage/life clause parsers map to the shared countForSpec triggering-stat kind.
// CREED — the gate is (etb event) AND (an entering-creature scope): a SPELL's "that creature's power" (Grab the
// Reins / Rakdos Joins Up — a SACRIFICED-creature fling, a different referent) is not an etb trigger, so it is
// NEVER rewritten and stays LOW → Arbiter. A non-etb trigger (combat-damage / dies, where "that creature" may be
// the damaged/dying creature) is excluded too — only the proven entering-creature referent is admitted here.
// SURGICAL — the regex matches ONLY the two payoff shapes this keystone models (DEALS DAMAGE = / GAIN LIFE =
// "that creature's <stat>"), never a blanket "that creature's stat": "discover X, where X is that creature's
// toughness" (Pantlaza — handled natively by its OWN library.js exact-match parser that reads the RAW phrase)
// must be left untouched, so the rewrite is anchored to the deal-damage / gain-life verbs that precede the stat.
const STAT_PAYOFF_REF_RE = /\bdeals? damage equal to that creature's (?:power|toughness)\b|\bgain life equal to that creature's (?:power|toughness)\b/i;
// ===== "ITS POWER" LIFEGAIN ===== the SELF-referential sibling of STAT_PAYOFF_REF_RE above. Whole-clause
// anchored: any rider leaves residue → no rewrite → body-only (a SAFE FN), exactly like the sentinels below.
const ITS_POWER_LIFEGAIN_RE = /^you gain life equal to its power$/i;
const ETB_ENTERING_CREATURE_SCOPES = new Set([
  "creatureYouControl", "otherCreatureYouControl", "subtypeYouControl",
  "eachCreature", "eachOtherCreature", "creatureOpponentControls",
  "creatureYouControlKeyword",  // KEYWORD-FILTER ETB (Waterkin Shaman counter-on-it; Dragon Tempest "it gains haste")
]);

// ETB-ENTERING-PRONOUN — the COUNTER + PUMP-KEYWORD pronoun referent for an ETB enters-watcher. On an `etb`
// event the triggering permanent IS the entering creature for every scope in ETB_ENTERING_CREATURE_SCOPES
// above (checkEnterTriggers threads enteredPerm — the SAME guarantee the SOURCE-STAT etb rewrite relies on),
// so "it" / "that creature" in such a trigger's effect is unambiguously the entering creature =
// ctx.triggeringPermanentId. UNLIKE the single-clause attack/combat-damage forms (whole-clause anchored), an
// ENTERS-counter effect is often COMPOUND — "Whenever another nontoken creature you control enters, put a
// +1/+1 counter on it. It gains haste until end of turn." (Surrak and Goreclaw) — so we rewrite per-SENTENCE,
// applying the same anchored counter / pump-keyword pronoun rewrites to each clause and rejoining. The
// sentinel "the triggering creature" appears in ZERO printed oracle text, so the WAVE-3b parser binds it to
// target:"thatCreature"; a SPELL's anaphoric "it" never reaches here (it isn't an etb enters-watcher) →
// stays LOW → Arbiter (CREED — sentinel gate). All-or-nothing: a clause the anchored patterns can't rewrite
// is left verbatim, so its raw "it" stays unmodeled → the parser fails the HIGH gate → body-only (never a
// fabricated / mis-bound effect). Reuses the SAME ±1/±1 counter + pump-keyword cores as the non-self forms.
const ETB_COUNTER_ON_IT_CLAUSE = /^put (?:a|an|one|two|three|four|five|\d+) [+-]1\/[+-]1 counters? on (?:it|that creature)$/i;
// COMPOUND-LEADING counter (The Great Henge — "put a +1/+1 counter on it AND draw a card"). The counter is the
// LEADING conjunct of an "and"-joined single sentence (no "." split), so the whole-clause anchor above can't
// see it. Anchor the counter phrase at the START with the referent immediately FOLLOWED by " and " — the "it"
// is still unambiguously the entering creature (CR 608.2c), and rewriting ONLY that leading referent leaves the
// rest of the compound verbatim for the parser to model (all-or-nothing: an unmodeled follow-up keeps the whole
// program LOW → body-only, CREED-safe). Referent-anchored (not whole-clause) so it can't consume a mid-clause
// "on it" that refers to something else — the counter must be the sentence lead. Only matched inside the ETB
// enters-watcher branch (the gate below), so a SPELL's anaphoric "counter on it and …" is never rewritten.
const ETB_COUNTER_ON_IT_LEADING = /^(put (?:a|an|one|two|three|four|five|\d+) [+-]1\/[+-]1 counters? on )(?:it|that creature)( and )/i;
const ETB_IT_PUMP_CLAUSE = /^it (?:gets [+-]\d+\/[+-]\d+(?: and gains .+)?|gains .+) until end of turn$/i;
function rewriteEtbEnteringPronoun(effectClause) {
  return String(effectClause)
    .split(/\.\s+/)
    .map((sentence) => {
      const s = sentence.replace(/\.\s*$/, "").trim();
      if (ETB_COUNTER_ON_IT_CLAUSE.test(s)) return s.replace(/ on (?:it|that creature)$/i, " on the triggering creature");
      // COMPOUND-LEADING: rewrite ONLY the leading counter referent, keep the "and <follow-up>" tail verbatim.
      if (ETB_COUNTER_ON_IT_LEADING.test(s)) return s.replace(ETB_COUNTER_ON_IT_LEADING, "$1the triggering creature$2");
      if (ETB_IT_PUMP_CLAUSE.test(s)) return s.replace(/^it /i, "the triggering creature ");
      // "THAT CREATURE gets/gains …" — the same triggering-permanent referent spelled out (Reyav "that
      // creature gains double strike until end of turn"; CR 608.2c). Normalize to the "it" form and reuse
      // the SAME pump-clause gate, so exactly the shapes the "it" arm models are rewritten — nothing looser.
      if (/^that creature (?:gets|gains)\b/i.test(s) && ETB_IT_PUMP_CLAUSE.test(s.replace(/^that creature /i, "it "))) {
        return s.replace(/^that creature /i, "the triggering creature ");
      }
      return s; // a clause we don't model is left verbatim → its raw "it" keeps the program LOW (CREED)
    })
    .join(". ");
}
// True iff the ETB effect carries at least one entering-creature pronoun clause we can rewrite (so we only
// take this branch when there's something to do — otherwise the chain falls through to SOURCE-STAT etc.). The
// "counter on it" substring matches whether the counter is a standalone sentence or the leading conjunct of an
// "and"-joined compound (The Great Henge), so this gate already admits the compound-leading form.
const ETB_ENTERING_PRONOUN_RE = /(?:put (?:a|an|one|two|three|four|five|\d+) [+-]1\/[+-]1 counters? on (?:it|that creature)|^(?:it|that creature) (?:gets|gains)\b|\.\s+(?:it|that creature) (?:gets|gains)\b)/i;

// TRIG-PRONOUN-IT — the NON-SELF pronoun referent for the OTHER effect families (the non-self analogues of
// the SELF "it" forms): "Whenever a creature you control attacks, IT gets/gains … until end of turn /
// sacrifice IT / return IT to its owner's hand". "it" is the TRIGGERING permanent (CR 608.2c), not the
// source — so, exactly like COUNTERS-ON-EVENT above, detectTriggers normalizes the referent → the sentinel
// "the triggering creature" (which parser.js models as target:"thatCreature" → ctx.triggeringPermanentId).
// Gated to the non-self triggering scopes + whole-clause anchored, so a SPELL's anaphoric "it" is NEVER
// rewritten and stays LOW → Arbiter (CREED — sentinel gate). The pump/return shapes reuse the SELF regexes
// (same clause text under a different scope gate); only "sacrifice it" needs its own anchor.
const NONSELF_SAC_REF_RE = /^sacrifice it$/i;

// EXPLORE (CR 701.44) — "it explores" / "it explores, then it explores again". "it" is the SOURCE for a
// SELF trigger (Merfolk Branchwalker's ETB, Emperor's Vanguard's combat-damage) and the TRIGGERING creature
// for a non-self enters-watcher (Path of Discovery's "Whenever a creature you control enters, it explores").
// Whole-clause anchored, so a SPELL's anaphoric "it" or any rider/compound (Deepfathom Echo's "…Then you may
// have it become a copy…") is never rewritten → stays LOW → Arbiter (CREED). The parser maps "this creature
// explores" → target:"self" and "the triggering creature explores" → target:"thatCreature".
const EXPLORE_IT_RE = /^it explores(?:, then it explores again)?$/i;

// CONNIVE (BLITZ EK-1, CR 701.50a) — "it connives" / "he connives" / "she connives" (the SNC/Marvel
// families print gendered pronouns for legendary sources: Tiger Shark "he connives", Madame Masque "she
// connives"). "it/he/she" is the SOURCE for a SELF trigger and the TRIGGERING creature for a non-self
// watcher (Swordsman, Sharp Scoundrel's equipped-attacker form) — the EXPLORE pattern verbatim.
// Whole-clause anchored: a variable "it connives X…" (Mask of the Schemer), an anaphoric mid-program
// "It connives." (Kamiz), or "you may have it connive" (Baron Strucker) is never rewritten → LOW →
// Arbiter (CREED). The parser maps "this creature connives" → target:"self" and "the triggering
// creature connives" → target:"thatCreature".
const CONNIVE_IT_RE = /^(?:it|he|she) connives$/i;

// SUSPECT (BLITZ EK-1, CR 701.60a) — a LEADING "suspect it" sentence on a SELF trigger ("When this
// creature enters, suspect it." — Frantic Scapegoat, Barbed Servitor; Person of Interest's "suspect it.
// Create a 2/2 …"). At the effect's HEAD, "it" can only be the object the ability triggered on — the
// SOURCE (CR 608.2c) — so the rewrite is referent-safe. Anchored to the FIRST sentence exactly ("suspect
// it" followed by end-of-clause or a sentence break): a compound "create a … token and suspect it" (Case
// of the Stashed Skeleton — "it" is the TOKEN, a different referent) or a spell's anaphoric "Suspect it."
// never matches → stays LOW → Arbiter (CREED — the exact FP this anchor exists to forbid).
const SUSPECT_IT_LEAD_RE = /^suspect it(?=\.|$)/i;

// SELF-NAME-REF (CR 201.4) — a SELF-scope trigger that names its OWN source by name in the effect rather than
// the pronoun "it" ("Whenever you sacrifice a Treasure, Captain Lannery Storm gets +1/+0 until end of turn";
// "Whenever this creature attacks, <Name> gets +2/+2 …"). The full name AND the legendary short name (the
// portion before the first comma, CR 201.4) both refer to the source. detectTriggers rewrites a LEADING
// self-name → "this creature" so the parser's self atom (target:"self") models it, exactly like the "it"
// rewrite. SELF SCOPE ONLY — a non-self trigger never names the SOURCE in this slot. Anchored on a leading
// name + a self-effect VERB (gets/gains/deals/fights — the modeled self-effect shapes), so a name appearing
// mid-clause or before an unmodeled verb is left untouched → the program stays LOW → Arbiter (CREED — no
// mis-bound effect). "fights" is the GROUP-BECOMES-TARGET payoff (Gargos, Vicious Watcher — "Gargos fights up
// to one target creature you don't control"): the named subject IS the source (the watcher), so rewriting →
// "this creature fights …" binds the fight's own-side to the source (the parser's fight atom re-gates the tail).
// Returns null when the effect doesn't begin with the source's name (the common case — most effects use "it"
// or have no self-subject), making this a pure promotion.
// "connives$" (BLITZ EK-1): the bare named-self connive ("Whenever you cast a noncreature spell, Pharaoh
// Rama-Tut connives." / "Whenever another Villain you control enters, Prowler connives.") — END-anchored so
// a variable "…connives X, where…" tail never matches (CREED; the parser re-gates the rewritten clause).
const SELF_NAME_EFFECT_VERB_RE = /^(?:gets [+-]\d+\/[+-]\d+|gains |deals |fights |connives$)/i;
// TRAILING self-name (ARIXMETHES) — a counter REMOVAL whose SOURCE-permanent referent trails the verb:
// "[you may ]remove a slumber counter from <Name>". The self-name sits at the END of the clause (unlike the
// leading "<Name> gets +1/+1" shape above), so it's rewritten to "this creature" only when the whole clause
// matches this exact remove-counter-on-self grammar — a "remove" verb + a single-word non-±1/+1 counter kind +
// a "from <Name>" tail. Whole-clause anchored, so a coincidental name prefix elsewhere never mis-binds (CREED).
// The captured group excludes the name; the caller substitutes "this creature" for it, yielding the parseable
// self form. SCOPED TO "remove … from" ONLY (not "put … on <Name>"): the remove-named-counter-self atom rejects
// the reserved fade/time/loyalty kinds, so the only cards this newly flips are genuinely-modeled ones; a
// broader "put … on <Name>" rewrite would let a card whose OWN mana/other ability is mis-modeled (Famous Museum
// — a "for each art counter" scaled mana source read as a flat amount) slip through the leaky mana gate — an FP.
// Two trailing-self-name head grammars: the Arixmethes remove-from form, and the Strong-class
// "[<lead conjunct> and ]put N +1/+1 counters on <Name>" form (SHELF S7 — a self-name in the SECOND
// conjunct of a compound payoff; CR 201.4 makes the name unambiguous, and the parser re-gates the
// rewritten compound anyway — an unmodeled lead conjunct still drops the whole program LOW).
// ("that many" joined the put-counter number slot 2026-08-14 — Abomination, Irradiated Brute "put THAT
// MANY +1/+1 counters on Abomination" off a combat-damage batch; the amount sentinel re-gates downstream.)
const SELF_NAME_TRAILING_COUNTER_RE = /^((?:you may )?remove (?:a|an|one|two|three|four|five|\d+) [a-z]+ counters? from |(?:[^.]+ and )?put (?:a|an|one|two|three|four|five|\d+|that many) \+1\/\+1 counters? on )$/i;
function rewriteSelfNameToThisCreature(effectClause, cardName) {
  const eff = String(effectClause || "");
  const fullName = String(cardName || "").trim();
  if (!fullName) return effectClause;
  // Candidate self-references, longest first (so the full name wins over the short name when both lead).
  const shortName = fullName.split(",")[0].trim();
  const candidates = shortName && shortName !== fullName ? [fullName, shortName] : [fullName];
  for (const nm of candidates) {
    if (nm.length < 3) continue; // a 1-2 char "name" is too ambiguous to anchor on (never a real legend short name)
    const esc = nm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = eff.match(new RegExp(`^${esc}\\s+(.+)$`, "i"));
    // Only rewrite when what FOLLOWS the name is a modeled self-effect verb — otherwise the name might be a
    // coincidental prefix of unrelated text and rewriting could mis-bind (CREED). The parser re-gates anyway.
    if (m && SELF_NAME_EFFECT_VERB_RE.test(m[1])) return `this creature ${m[1]}`;
    // TRAILING self-name (ARIXMETHES) — "[you may ]remove/put a <name> counter from/on <Name>". The name is at
    // the clause END; rewrite it to "this creature" only when the leading text is the exact counter-on-self
    // grammar (SELF_NAME_TRAILING_COUNTER_RE). Whole-clause anchored on the head + the bare name tail, so it
    // can't consume a filtered/multi-target counter clause or a coincidental trailing name (CREED). The parser
    // re-gates the rewritten form anyway (a non-modeled counter kind fails there → the card stays non-native).
    const tm = eff.match(new RegExp(`^(.+?)\\s*${esc}$`, "i"));
    if (tm && SELF_NAME_TRAILING_COUNTER_RE.test(tm[1].trim() + " ")) return `${tm[1].trim()} this creature`;
    // MID-CLAUSE counter-on-name + CONTINUATION (2026-08-14 — Korvold "put a +1/+1 counter on KORVOLD
    // and draw a card"; Trelasarra "…and scry 1"; Neva "…, then scry 1"; Abomination Irradiated Brute
    // "put THAT MANY +1/+1 counters on Abomination"): the Strong-class trailing arm above requires the
    // name at the clause END, so a conjoined tail parked seventeen watcher legends. Same discipline —
    // whole-clause anchored on the exact counter grammar, the tail restricted to an " and …"/", then …"
    // continuation the parser re-gates. A name inside ANY other grammar (a token name, a tutor filter)
    // can never match this head+tail shape (the blanket-pass lesson, learned at the gate).
    const cm = eff.match(new RegExp(`^((?:you may )?put (?:a|an|one|two|three|four|five|\\d+|that many) \\+1\\/\\+1 counters? on )${esc}((?: and | then |, then ).+)$`, "i"));
    if (cm) return `${cm[1]}this creature${cm[2]}`;
    // POSSESSIVE self-name (Tifa Lockhart — Landfall "double <Name>'s power until end of turn"): the card
    // names ITSELF in a mid-clause possessive. Rewrite "<Name>'s" → "this creature's" ONLY inside the exact
    // double-own-P/T grammar (whole-clause anchored on "double … power[ and toughness] until end of turn"),
    // so it can never consume a possessive that names a DIFFERENT permanent or any other effect (CREED). The
    // pump parser re-gates the rewritten "double this creature's power …" form (→ doublePt self atom).
    if (new RegExp(`^double ${esc}['’]s power(?: and toughness)? until end of turn$`, "i").test(eff))
      return eff.replace(new RegExp(`${esc}['’]s`, "i"), "this creature's");
    // X-BY-OWN-POWER COUNTER GIFT (2026-08-12 — Halana and Alena, Partners: "put X +1/+1 counters on
    // another target creature you control, where X is <Name>'s power. That creature gains haste until
    // end of turn."): the SAME mid-clause possessive discipline as the Tifa arm directly above —
    // rewritten ONLY inside this exact whole-clause grammar (optional haste rider included), so no
    // other possessive can ever be consumed (CREED). The counter parser re-gates the rewritten form
    // (→ the sourcePower scaled arm + the proven two-sentence haste fold).
    if (new RegExp(`^put x \\+1/\\+1 counters on another target creature you control, where x is ${esc}['’]s power(?:\\. that creature gains haste until end of turn)?\\.?$`, "i").test(eff))
      return eff.replace(new RegExp(`${esc}['’]s`, "i"), "this creature's");
    // UPKEEP DOUBLE-OR-RESET (Lily Bowen, SHELF S7 — "double the number of +1/+1 counters on <Name> if its
    // power is N or less. Otherwise, remove all but one +1/+1 counter from it, then you gain 1 life for each
    // +1/+1 counter removed this way"): the self-name sits MID-clause. Rewrite it to "this creature" ONLY
    // inside this exact whole-clause grammar (both sentences anchored end-to-end), so a coincidental name or
    // any rider variant never mis-binds (CREED). The parser re-gates the rewritten form (the
    // double-or-reset-counters collapse matcher) anyway.
    if (new RegExp(`^double the number of \\+1\\/\\+1 counters on ${esc} if its power is \\d+ or less\\.\\s*otherwise, remove all but one \\+1\\/\\+1 counter from it, then you gain 1 life for each \\+1\\/\\+1 counter removed this way$`, "i").test(eff))
      return eff.replace(new RegExp(`\\b${esc}\\b`, "i"), "this creature");
    // ⭐ SACRIFICE-SELF-UNLESS-PAY (the Elder Dragons — Palladia-Mors, Chromium, Vaevictis Asmadi, Arcades
    // Sabboth, Nicol Bolas, Piru, Eldest Dragon Highlander; plus Kuro, Pitlord). The self-name sits MID-
    // clause, right after the verb: "sacrifice <Name> unless you pay {R}{G}{W}."
    // ⛔ THE SUBSYSTEM WAS ALREADY BUILT AND SIMPLY UNREACHABLE. `sac-unless-pay` exists and the byte-
    // identical "sacrifice THIS CREATURE unless you pay {R}{G}{W}" has parsed HIGH for ages — only the
    // printed proper noun stood between these cards and a finished mechanism.
    // ⛔ WHY THIS IS ONE MORE ANCHORED ARM AND NOT A GLOBAL RENAME: rewriting the self-name across the whole
    // trigger oracle was tried TWICE (2026-08-05) and measured −25 then −29. The first pass stripped the
    // reminder text storm and cascade are read from; the second produced the wrong noun on paths where the
    // type wasn't in hand, dropping 29 epithet legendaries. This file's design is an ALLOWLIST of exact
    // grammars for exactly that reason, and the arm below keeps it: whole-clause anchored, mana-cost-only
    // tail, and the parser re-gates the rewritten form anyway.
    // ⓘ "this creature" is right for every carrier — all 8 in the corpus are Legendary Creatures (censused
    // 2026-08-05), so the noun cannot be wrong here the way it was in the global attempt.
    if (new RegExp(`^sacrifice ${esc} unless you pay (?:\\{[^}]+\\})+\\.?$`, "i").test(eff))
      return eff.replace(new RegExp(`\\b${esc}\\b`, "i"), "this creature");
  }
  return effectClause;
}

// GLOBAL SUBTYPE combat-damage-to-a-player (Synapse Sliver / Brood Sliver) — "Whenever a <Subtype> deals
// combat damage to a player, ITS CONTROLLER may <effect>". DISTINCT from the subtypeYouControl form (Spawning
// Kraken — "a … you control deals …") in TWO ways modeled by this detector:
//   1. GLOBAL subject — NO "you control": the trigger fires off ANY player's matching-subtype creature, so
//      scope:"subtypeGlobal" omits the controller gate (scopeMatches + the all-players scan in
//      checkCombatDamageTriggers).
//   2. "its controller" beneficiary — the effect resolves for the DEALING creature's controller, threaded as
//      the pending trigger's beneficiary override; the effectClause's leading "its controller" is rewritten
//      to "you" so the payoff parser binds to that controller.
// CREED: this detector ONLY fires the descriptor when (a) the condition is the bare global form (END-anchored
// on "a player"; a rider/qualifier — "…or planeswalker", "…you control", "…an opponent controls" — fails the
// anchor and the whole card stays non-native, a SAFE false-negative) AND (b) the effect BEGINS with "its
// controller" (the only beneficiary shape this scope models). A global subject with a different beneficiary
// ("you draw", "each player draws") falls through to non-native rather than mis-resolve. parseSubtypeList
// rejects a card-TYPE word ("a creature deals …") → null → no over-fire. Returned descriptor carries
// itsController:true so triggersForEvent applies the beneficiary override (every other scope passes null).
function detectSubtypeGlobalCombatDamage(condRaw, _cardName, _typeLine, effectRaw) {
  const c = String(condRaw || "").toLowerCase().trim();
  const eff = String(effectRaw || "").toLowerCase().trim();
  const m = c.match(/^a ([a-z]{3,}(?:(?:,\s*[a-z]{3,})*,?\s*(?:or|and)\s+[a-z]{3,})?) deals combat damage to a player$/);
  if (!m) return null;
  if (/\byou control\b/.test(c)) return null;          // the you-control form is handled inline (subtypeYouControl)
  if (!/^its controller\b/.test(eff)) return null;     // only the dealer-controller beneficiary shape (CREED gate)
  const filter = parseSubtypeList(m[1]);
  if (!filter) return null;                            // a card-TYPE word / non-subtype → Arbiter (no over-fire)
  return { event: "combatDamageToPlayer", scope: "subtypeGlobal", whose: "any", subtypeFilter: filter, itsController: true };
}

// GLOBAL SUBTYPE combat-damage-TO-A-CREATURE (Toxin Sliver) — "Whenever a <Subtype> deals combat damage to
// a CREATURE, destroy that creature[. It can't be regenerated]". DISTINCT from the to-a-PLAYER form
// (Synapse/Brood) in TWO ways:
//   1. The triggering EVENT is combat damage dealt to a CREATURE (a source→creature-target pairing), fired by
//      checkCombatDamageToCreatureTriggers off combatResolution's per-pair creature-damage events.
//   2. The effect ("destroy THAT creature") acts on the DAMAGED creature, not the dealing creature's
//      controller — so the trigger threads the DAMAGED creature as the triggering permanent (→
//      ctx.triggeringPermanentId → "destroy the triggering creature" → thatCreature target), while the SUBTYPE
//      check is on the DEALING creature (scope:"subtypeGlobalToCreature" reads ctx.dealingPermanentId).
// CREED: fires ONLY when (a) the condition is the bare GLOBAL form (END-anchored on "a creature"; "you control"
// — Sosuke / Quest for the Gemblades — or any rider fails the anchor, a SAFE false-negative) AND (b) the effect
// BEGINS with "destroy that creature" (the only effect this scope models; "destroy that creature at end of
// combat" — Sosuke's delayed form — is left to the same all-or-nothing follow-up gate that drops an unmodeled
// rider to the Arbiter). parseSubtypeList rejects a card-TYPE word ("a creature deals …" — Quest) → no
// over-fire. The "destroyThatCreature" flag is recognition-only; the actual destroy rides the rewritten effect
// clause + the existing cannotRegenerate re-stamp (CANT_REGEN_TEST matches "that creature can't be regenerated").
function detectSubtypeGlobalCombatDamageToCreature(condRaw, _cardName, _typeLine, effectRaw) {
  const c = String(condRaw || "").toLowerCase().trim();
  const eff = String(effectRaw || "").toLowerCase().trim();
  const m = c.match(/^a ([a-z]{3,}(?:(?:,\s*[a-z]{3,})*,?\s*(?:or|and)\s+[a-z]{3,})?) deals combat damage to a creature$/);
  if (!m) return null;
  if (/\byou control\b/.test(c)) return null;          // the you-control form (Sosuke / Quest) is a different scope, not modeled here
  if (!/^destroy that creature\b/.test(eff)) return null; // only the destroy-that-creature effect shape (CREED gate)
  const filter = parseSubtypeList(m[1]);
  if (!filter) return null;                            // a card-TYPE word / non-subtype → Arbiter (no over-fire)
  return { event: "combatDamageToCreature", scope: "subtypeGlobalToCreature", whose: "any", subtypeFilter: filter, destroyThatCreature: true };
}

/**
 * ⭐ THE SELF TWIN (Voracious Cobra, Mephitic Ooze, Bane of the Living's kin) — "Whenever THIS CREATURE
 * deals combat damage to a creature, destroy that creature."
 *
 * The GLOBAL-subtype form directly above already builds the entire pipeline: the event, the per-pair firing
 * site (checkCombatDamageToCreatureTriggers off combatResolution's creature-damage events), the
 * "destroy that creature" → "destroy the triggering creature" rewrite, and the cannotRegenerate re-stamp.
 * Only the SELF scope was missing, so a two-line card sat on the Arbiter while the machinery to run it was
 * already shipped and tested.
 *
 * The subtype gate is what the global form uses to pick the dealer; the self form's gate is simply
 * "the dealer IS this watcher", which is why it carries NO subtypeFilter and is matched on identity at the
 * firing site instead.
 *
 * CREED, mirroring the global arm verbatim: the condition must be the bare self form (a rider or a
 * "you control" variant fails the anchor → Arbiter), and the effect must BEGIN with "destroy that
 * creature" — the only effect shape this scope models. A delayed "…at end of combat" or any other payoff
 * drops to the Arbiter as a safe false-negative.
 */
function detectSelfCombatDamageToCreatureDestroy(condRaw, cardName, _typeLine, effectRaw) {
  const c = String(condRaw || "").toLowerCase().trim();
  const eff = String(effectRaw || "").toLowerCase().trim();
  // ⛔ WHOLE-EFFECT ANCHORED, NOT A PREFIX, and a pin caught the difference. A bare `^destroy that
  // creature\b` prefix also matches "destroy that creature AT END OF COMBAT" (Sosuke's delayed form) and
  // would resolve it IMMEDIATELY — strictly stronger than printed, the forbidden direction. The only tail
  // admitted is the regeneration rider, which the shared parseEffectClause wrapper re-detects and stamps
  // onto the destroy atom (CANT_REGEN_TEST), so it is modeled rather than dropped.
  if (!/^destroy that creature\.?(?:\s+(?:it|that creature) can'?t be regenerated\.?)?$/.test(eff)) return null;
  const m = c.match(/^(.+) deals combat damage to a creature$/);
  if (!m) return null;
  if (/\byou control\b/.test(c)) return null;
  const subj = m[1].trim();
  const nm = String(cardName || "").toLowerCase();
  const isSelf = subj === "this creature" || subj === "this permanent" || (nm && subj === nm)
    || (nm && subj === nm.split(",")[0].trim());
  if (!isSelf) return null;
  return { event: "combatDamageToCreature", scope: "selfDealerToCreature", whose: "any", destroyThatCreature: true };
}

/**
 * ⭐ SELF combat-damage-to-a-creature TAP-AND-LOCK (CR 510.2 / 302.6) — "Whenever this creature deals combat
 * damage to a creature, tap that creature and it doesn't untap during its controller's next untap step."
 * The Kashi-Tribe / Orochi Snake Warrior family (Kashi-Tribe Warriors, Kashi-Tribe Reaver, Kashi-Tribe Elite,
 * Orochi Ranger, Matsu-Tribe Birdstalker, Matsu-Tribe Decoy) plus Frostwalk Bastion.
 *
 * ⭐ BUILT ENGINE, NO IGNITION — every piece was already here. The `combatDamageToCreature` event, the
 * `selfDealerToCreature` scope, the fire site that threads the DAMAGED creature as the triggering permanent,
 * and the tap+noUntapNext atom all ship today. The ONLY thing gating this family was that the sibling
 * detector is anchored to the DESTROY effect, so a second payoff shape had no way in. This adds exactly that
 * shape and nothing else: same event, same scope, same fire site, same referent.
 *
 * ⛔ WHOLE-EFFECT ANCHORED for the same reason the destroy twin is: a prefix match would also admit a delayed
 * or conditional variant and resolve it immediately — strictly stronger than printed.
 *
 * ⓘ "this land" IS admitted alongside "this creature", unlike the destroy twin. Frostwalk Bastion animates
 * itself and deals combat damage as a land; refusing the subject would leave its printed trigger silently
 * dead at runtime. It costs no coverage either way (it already reads native through the land tier), so this
 * is a runtime-correctness admission, not a metric one.
 */
function detectSelfCombatDamageToCreatureTapLock(condRaw, cardName, _typeLine, effectRaw) {
  const c = String(condRaw || "").toLowerCase().trim();
  const eff = String(effectRaw || "").toLowerCase().trim();
  if (!/^tap that creature and it doesn't untap during its controller's next untap step\.?$/.test(eff)) return null;
  const m = c.match(/^(.+) deals combat damage to a creature$/);
  if (!m) return null;
  if (/\byou control\b/.test(c)) return null; // a you-control watcher is a different scope, not modeled here
  const subj = m[1].trim();
  const nm = String(cardName || "").toLowerCase();
  const isSelf = subj === "this creature" || subj === "this permanent" || subj === "this land"
    || (nm && subj === nm) || (nm && subj === nm.split(",")[0].trim());
  if (!isSelf) return null;
  return { event: "combatDamageToCreature", scope: "selfDealerToCreature", whose: "any", tapLockThatCreature: true };
}

// GLOBAL SUBTYPE damage → controller-lifegain (Essence Sliver) — "Whenever a <Subtype> deals damage, ITS
// CONTROLLER gains that much life." A Sliver-wide TRIGGERED grant: every Sliver on the battlefield (any
// controller) has a damage→lifegain trigger, and the LIFE goes to the DEALING creature's controller, scaled to
// the damage amount. Reuses the SAME subtypeGlobal + itsController machinery as detectSubtypeGlobalCombatDamage
// (Synapse/Brood) — the ONLY differences are (1) the bare "deals damage" condition (NO "combat", NO "to a
// player") and (2) the amount-scaled "gains that much life" effect. The engine's checkCombatDamageTriggers
// subtypeGlobal scan fires this on combat damage to a player, threading ctx.combatDamageAmount (which the
// "gain that much life" sentinel reads) + the dealer's controller as the beneficiary override. Slivers dealing
// combat damage to a CREATURE or non-combat damage under-fire (that path carries no amount) — a SAFE
// false-negative (the controller gains LESS life, never a wrong/fabricated amount), the same accepted
// approximation as the TRIG-DMG-TO-OPPONENT self form ("deals damage" ≈ combat damage in the simulator).
// CREED gates, mirroring the sibling detectors: fires ONLY when (a) the condition is the BARE global "deals
// damage" form (END-anchored; NO "you control" — a you-control form is a different scope; NO "combat"/"to a
// player" rider — those match the sibling detector instead) AND (b) the effect is EXACTLY "its controller gains
// that much life" (the sole beneficiary+amount shape this scope models; a fixed-N "gains 2 life" or a different
// beneficiary leaves residue → non-native). parseSubtypeList rejects a card-TYPE word ("a creature deals damage")
// → null → no over-fire. itsController:true threads the dealer-controller beneficiary override.
function detectSubtypeGlobalDamageLifegain(condRaw, _cardName, _typeLine, effectRaw) {
  const c = String(condRaw || "").toLowerCase().trim();
  const eff = String(effectRaw || "").toLowerCase().trim();
  const m = c.match(/^a ([a-z]{3,}(?:(?:,\s*[a-z]{3,})*,?\s*(?:or|and)\s+[a-z]{3,})?) deals damage$/);
  if (!m) return null;
  if (/\byou control\b/.test(c)) return null;          // a you-control form is a different scope, not modeled here
  if (!/^its controller gains that much life$/.test(eff)) return null; // only the dealer-controller amount-scaled lifegain (CREED gate)
  const filter = parseSubtypeList(m[1]);
  if (!filter) return null;                            // a card-TYPE word / non-subtype → Arbiter (no over-fire)
  return { event: "combatDamageToPlayer", scope: "subtypeGlobal", whose: "any", subtypeFilter: filter, itsController: true };
}

// ADDITIVE registry seam (WAVE 0): module-level list of extra trigger-condition detectors. A detector
// is `(condition, cardName, typeLine, effectClause) => TriggerDescriptorClassification | null` and is
// consulted by detectTriggers ONLY after the inline classifyCondition returns falsy (inline matchers keep
// priority). `effectClause` (4th arg, added by SELF-LTB) is the trigger's first same-line effect sentence,
// so a detector can gate on BOTH condition and effect; a condition-only detector ignores it.
// Empty by default — a no-op until a slice registers one — so existing classification is untouched.
const _triggerDetectors = [];
export function registerTriggerDetector(fn) {
  if (typeof fn !== "function") throw new Error("detector must be a function");
  _triggerDetectors.push(fn);
}

// COMPOUND TRIGGER (CR 603.1) — "When <A> and whenever <B>, <effect>." (Up the Beanstalk: "When this enchantment
// enters and whenever you cast a spell with mana value 5 or greater, draw a card.") is TWO INDEPENDENT triggered
// abilities that SHARE one effect — each fires on its OWN event. That is DISTINCT from a single multi-event condition
// ("enters or dies" — still parked at classifyCondition's compound-event guard): there one ability fires on either
// event; here there are two abilities. Rewriting the one sentence to two ("When A, E. Whenever B, E.") is FAITHFUL,
// not a partial — the per-sentence detector then handles each independently. Only the "and when(ever)" second-TRIGGER
// connective (a fresh When/Whenever) splits; an "and" joining a condition/effect has no trailing When and is untouched.
// SAFETY: coverage.allTriggerSentencesModeled bumps its shaped count by compoundTriggerCount (mirroring the Storm/
// Cascade keyword bumps), so if EITHER half's event is unmodeled the detected count under-runs shaped → the whole
// card routes to the Arbiter (a SAFE false-negative) — an unmodeled half is NEVER silently dropped (the cardinal FP).
const COMPOUND_TRIGGER_SRC = "\\b(When|Whenever)\\s+(.+?)\\s+and\\s+when(?:ever)?\\s+(.+?),\\s+(.+?\\.)";
// "When A and AT THE BEGINNING OF B, E" (Crack in Time / Mystic Barrier / Noble Heritage — 53 corpus
// carriers, most of them Planechase planes outside the real-card denominator): the SAME two-abilities-
// sharing-one-effect shape as the "and when(ever)" connective above, with a phase/step timing as the
// second trigger. Split to "When A, E\nAt B, E" so each half detects independently — CRITICAL, because
// before this split existed the unsplit compound leaked through the UNANCHORED `\benters\b` self-ETB
// containment check as a bare etb descriptor: the card CLASSIFIED native on the ETB half alone while the
// runtime silently never fired the recurring half (a live CREED FP, masked on Crack in Time by the
// vanishing-reminder phantom until 2026-07-24). Same safety contract as every split here: coverage bumps
// shaped by compoundTriggerCount, so an unmodeled half under-runs detected → the whole card parks (FN-safe).
const COMPOUND_AT_BEGINNING_SRC = "\\b(When|Whenever)\\s+(.+?)\\s+and\\s+at\\s+(the\\s+beginning\\s+of\\s+[^,\\n]+?),\\s+(.+?\\.)";
// ===== EVENT-DISJUNCTION SPLIT (SHELF C1 — "enters or attacks", CR 603.2b: an ability can trigger on
// either of two events) ===== "When[ever] <subject> enters[ the battlefield] or attacks, <effect…>" →
// TWO sentences, one per event, each carrying the WHOLE same-line effect (riders/follow-up sentences
// included — capturing to END OF LINE is load-bearing: a first half cut at the first period would fire
// its lead effect WITHOUT the rider, the cardinal FP). Fire-behavior is EXACT: the ability fires on
// entry and fires on attack; each half then classifies through the normal per-sentence machinery and
// an unmodeled half keeps the card on the Arbiter via the shaped-count reconciliation (see SAFETY above).
// Grave Titan / The Wise Mothman / Inferno Titan / the 139-card self-subject class. EXCLUDED: the
// "of the chosen type" form (Kindred Discovery) — it has its own dedicated compound EVENT
// (chosenTypeEntersOrAttacks, exact-matched on the UNSPLIT sentence) which the split would break.
const DISJUNCTION_TRIGGER_SRC = "\\b(When|Whenever)\\s+([^.\\n]+?)\\s+enters(?: the battlefield)? or attacks(,\\s*[^\\n]+)";
// "enters or dies" (Vinereap Mentor class) — the SAME split, second event pair. The dies-half phrasing
// ("<subject> dies") classifies standalone (dies/self — verified); the ARTIFACT wording ("is put into a
// graveyard from the battlefield") does NOT classify and is NOT split — the Ichor Wellspring family
// stays under the compound guard (splitting it would detect an ETB half while the dies-half never
// dispatches; the triggers.test guards still assert it).
const DISJUNCTION_DIES_SRC = "\\b(When|Whenever)\\s+([^.\\n]+?)\\s+enters(?: the battlefield)? or dies(,\\s*[^\\n]+)";
// "enters or becomes monstrous" (Alpha Deathclaw — SHELF S7): the SAME split, third event pair. The
// monstrous half classifies standalone (becomesMonstrous/self — fired by applyMonstrosity's transition).
const DISJUNCTION_MONSTROUS_SRC = "\\b(When|Whenever)\\s+([^.\\n]+?)\\s+enters(?: the battlefield)? or becomes monstrous(,\\s*[^\\n]+)";
// "attacks or blocks" (BLITZ OR-1 — Hamlet Captain / Adventurer's Airship kin / the 49-card self class,
// CR 603.2b): the SAME split, fourth event pair. Both halves classify standalone (attacks/self via
// checkAttackTriggers; the BARE blocks/self via checkBlockTriggers — a FILTERED blocks half like "blocks
// a creature with flying" stays undetected after the split, so the count reconciliation parks the card:
// the split itself can never over-fire a restricted form). This retires the old blanket attacks+blocks
// null guard for the split shape; the guard below still catches any unsplit compound leak (belt).
const DISJUNCTION_BLOCKS_SRC = "\\b(When|Whenever)\\s+([^.\\n]+?)\\s+attacks or blocks(,\\s*[^\\n]+)";
// "enters or leaves the battlefield" (BLITZ LV-1 — Brandywine Farmer / Experimental Synthesizer /
// Aven Riftwatcher, CR 603.2b): the SAME split, fifth event pair. The enters half rides the normal etb;
// the leaves half detects as the leavesSelf event (ANY exit — graveyard, exile, bounce, tuck), fired by
// checkLeavesTriggers off the same look-back every leave already records.
const DISJUNCTION_LTB_SRC = "\\b(When|Whenever)\\s+([^.\\n]+?)\\s+enters(?: the battlefield)? or leaves the battlefield(,\\s*[^\\n]+)";
// GY-TRAFFIC TRIPLE (Syr Konrad, the Grim — SHELF S7, CR 603.2b): the printed three-event disjunction
// "Whenever another creature dies, or a creature card is put into a graveyard from anywhere other than
// the battlefield, or a creature card leaves your graveyard, <effect>" → THREE sentences, one per event,
// each carrying the whole same-line effect. The three event sets are DISJOINT by construction (dies =
// from the battlefield; clause 2 excludes the battlefield; clause 3 is exits), so the split fires exactly
// as printed — never twice for one event. ANCHORED to the exact printed phrase triple (subject variations
// stay under the compound-event guard → Arbiter).
const DISJUNCTION_GY_TRIPLE_SRC = "\\b(When|Whenever)\\s+another creature dies, or a creature card is put into a graveyard from anywhere other than the battlefield, or a creature card leaves your graveyard(,\\s*[^\\n]+)";
// QUOTE MASK (BLITZ BG-2 — Candlekeep Sage's "Commander creatures you own have \"When this creature
// enters or leaves the battlefield, draw a card.\""): a QUOTED granted ability is NOT the granter's own
// trigger — it fires on the RECIPIENT via grantedTriggersForGroup, which re-runs detection on the bare
// quoted body. The compound/disjunction rewrites' \b anchors match INSIDE quotes, and the newline a
// rewrite inserts PROMOTES the quoted tail past the sentence-boundary anchor — minting a phantom
// self-trigger on the GRANTER (the Sage drew a card on its own leave). Mask quoted spans (straight or
// curly) with index placeholders before rewriting, restore verbatim after — quoted text can never be
// split, and text OUTSIDE quotes rewrites exactly as before. compoundTriggerCount applies the SAME mask,
// so the shaped===detected reconciliation counts what detection sees (one mask, no drift).
const QUOTE_MASK_NUL = String.fromCharCode(0); // placeholder delimiter: NUL cannot appear in oracle text
function maskQuotedSpans(s) {
  const spans = [];
  const masked = String(s || "").replace(/"[^"]*"|“[^”]*”/g, (q) => { spans.push(q); return QUOTE_MASK_NUL + (spans.length - 1) + QUOTE_MASK_NUL; });
  return { masked, restore: (t) => t.replace(new RegExp(QUOTE_MASK_NUL + "(\\d+)" + QUOTE_MASK_NUL, "g"), (_, i) => spans[+i]) };
}
function splitCompoundTriggerSentences(oracle) {
  // Separate the two rewritten sentences with a NEWLINE (not ". ") — the trigger regex anchors each match on a
  // preceding [\n.;] and consumes its own trailing period, so a same-line "…card. Whenever…" would leave the second
  // sentence without a boundary. Abilities are newline-separated on real cards, so this matches the detector's grammar.
  const { masked, restore } = maskQuotedSpans(oracle);
  return restore(masked
    .replace(new RegExp(COMPOUND_TRIGGER_SRC, "gi"), (_, kw, condA, condB, eff) => `${kw} ${condA}, ${eff}\nWhenever ${condB}, ${eff}`)
    .replace(new RegExp(COMPOUND_AT_BEGINNING_SRC, "gi"), (_, kw, condA, condB, eff) => `${kw} ${condA}, ${eff}\nAt ${condB}, ${eff}`)
    .replace(new RegExp(DISJUNCTION_TRIGGER_SRC, "gi"), (m, _kw, subj, eff) =>
      /of the chosen type/i.test(subj) ? m : `Whenever ${subj} enters${eff}\nWhenever ${subj} attacks${eff}`)
    .replace(new RegExp(DISJUNCTION_DIES_SRC, "gi"), (_m, _kw, subj, eff) =>
      `Whenever ${subj} enters${eff}\nWhenever ${subj} dies${eff}`)
    .replace(new RegExp(DISJUNCTION_MONSTROUS_SRC, "gi"), (_m, _kw, subj, eff) =>
      `Whenever ${subj} enters${eff}\nWhenever ${subj} becomes monstrous${eff}`)
    .replace(new RegExp(DISJUNCTION_BLOCKS_SRC, "gi"), (_m, _kw, subj, eff) =>
      `Whenever ${subj} attacks${eff}\nWhenever ${subj} blocks${eff}`)
    .replace(new RegExp(DISJUNCTION_LTB_SRC, "gi"), (_m, _kw, subj, eff) =>
      `Whenever ${subj} enters${eff}\nWhenever ${subj} leaves the battlefield${eff}`)
    .replace(new RegExp(DISJUNCTION_GY_TRIPLE_SRC, "gi"), (_m, _kw, eff) =>
      `Whenever another creature dies${eff}\nWhenever a creature card is put into a graveyard from anywhere other than the battlefield${eff}\nWhenever a creature card leaves your graveyard${eff}`));
}
/** Number of compound second-trigger connectives ("…and whenever…" + the "enters or attacks"/"enters or
 *  dies" disjunctions) — each adds ONE extra trigger sentence when split. coverage.js adds this to its
 *  shaped-sentence count so `shaped === detected` holds for a successfully-split compound. */
export function compoundTriggerCount(oracle) {
  // QUOTE MASK: count on the SAME masked text splitCompoundTriggerSentences rewrites — a disjunction
  // inside a quoted grant is neither split nor detected, so it must not be counted either (else the
  // shaped===detected reconciliation would park every granter of a quoted compound body).
  const s = maskQuotedSpans(String(oracle || "")).masked;
  const andJoins = (s.match(new RegExp(COMPOUND_TRIGGER_SRC, "gi")) || []).length
    + (s.match(new RegExp(COMPOUND_AT_BEGINNING_SRC, "gi")) || []).length;
  const disjunctions = (s.match(new RegExp(DISJUNCTION_TRIGGER_SRC, "gi")) || [])
    .filter((m) => !/of the chosen type/i.test(m)).length;
  const diesDisjunctions = (s.match(new RegExp(DISJUNCTION_DIES_SRC, "gi")) || []).length;
  const monstrousDisjunctions = (s.match(new RegExp(DISJUNCTION_MONSTROUS_SRC, "gi")) || []).length;
  const blocksDisjunctions = (s.match(new RegExp(DISJUNCTION_BLOCKS_SRC, "gi")) || []).length; // OR-1 "attacks or blocks"
  const ltbDisjunctions = (s.match(new RegExp(DISJUNCTION_LTB_SRC, "gi")) || []).length; // LV-1 "enters or leaves the battlefield"
  // The GY-traffic triple adds TWO extra sentences per match (1 → 3).
  const gyTriples = (s.match(new RegExp(DISJUNCTION_GY_TRIPLE_SRC, "gi")) || []).length;
  return andJoins + disjunctions + diesDisjunctions + monstrousDisjunctions + blocksDisjunctions + ltbDisjunctions + gyTriples * 2;
}

/**
 * All triggered abilities printed on a card, as serializable TriggerDescriptors.
 * Cached by card identity (the regex pass runs once per distinct card object).
 */
/**
 * ⭐ TWO-TRIGGER DETAIN FOLD (CR 610.3) — Journey to Nowhere, Oblivion Ring, Fiend Hunter, Faceless
 * Butcher, Detention Sphere and ~14 more.
 *
 * The MODERN templating says it in one sentence — "exile target creature an opponent controls UNTIL THIS
 * CREATURE LEAVES THE BATTLEFIELD" (Banisher Priest) — and that form is fully modeled: removal.js stamps
 * `untilSourceLeaves`, zones.applyExileUntilLeaves links the card to the source as a `detainedExile`, and
 * checkLeavesTriggers synthesizes the return on ANY exit.
 *
 * The OLDER templating splits the identical effect across two triggers:
 *     "When this enchantment enters, exile another target nonland permanent."
 *     "When this enchantment leaves the battlefield, return that card to the battlefield …"
 * Same rules meaning, different printing — and nothing recognised it, so nineteen cards sat on the Arbiter
 * beside a mechanism built to run them.
 *
 * THE FOLD REWRITES PRINTING, NOT SEMANTICS: the enters-clause gains the "until this <type> leaves the
 * battlefield" tail so the EXISTING detain parser claims it, and the leaves-clause is DROPPED because the
 * detain mechanism already synthesizes exactly that return. Keeping it would return the card TWICE.
 *
 * ⛔ ALL-OR-NOTHING, AND BOTH HALVES MUST MATCH. The fold fires only when the card has BOTH an
 * enters-exile and a matching leaves-return; either alone is left completely untouched (a lone
 * enters-exile is a permanent exile — folding it would silently hand the card back). The leaves-clause must
 * be the bare return with no rider, so a conditional or transformed return never folds.
 */
export function foldTwoTriggerDetain(oracle, card) {
  const text = String(oracle || "");
  if (!/leaves the battlefield/i.test(text) || !/\bexile\b/i.test(text)) return text;
  const lines = text.split("\n");
  const enterIdx = lines.findIndex((l) => /^when [^.]*enters[^.]*, (?:you may )?exile [^.]*\.?$/i.test(l.trim()));
  const leaveIdx = lines.findIndex((l) => /^when [^.]*leaves the battlefield, return (?:that|the exiled) card to the battlefield(?: under (?:its|their) owner'?s? control)?\.?$/i.test(l.trim()));
  if (enterIdx < 0 || leaveIdx < 0 || enterIdx === leaveIdx) return text;
  const enter = lines[enterIdx].trim().replace(/\.$/, "");
  if (/\buntil\b/i.test(enter) || /\byou may\b/i.test(enter)) return text; // already the modern form / an optional exile — leave it alone
  // The source's own noun, so the rewritten tail matches the detain parser's alternation exactly.
  const typeLine = String(card?.type || card?.type_line || "");
  const noun = /\bEnchantment\b/i.test(typeLine) ? "enchantment"
    : /\bCreature\b/i.test(typeLine) ? "creature"
      : /\bArtifact\b/i.test(typeLine) ? "artifact" : "permanent";
  const folded = lines.slice();
  folded[enterIdx] = `${enter} until this ${noun} leaves the battlefield.`;
  folded.splice(leaveIdx, 1);
  return folded.join("\n");
}

export function detectTriggers(card) {
  if (!card || typeof card !== "object") return [];
  if (_detectCache.has(card)) return _detectCache.get(card);
  // Strip the leading "Landfall —" ability-word label (CR 207.2c — flavor, no rules meaning) so the trigger
  // regex below, which anchors "Whenever" at a line/sentence boundary, sees the bare "Whenever a land you
  // control enters …". Without this, "Landfall — Whenever …" puts "Whenever" mid-line and never matches.
  // Then split compound "When A and whenever B, E" → two sentences (see COMPOUND TRIGGER above), so each half is
  // detected independently. SHARED with coverage.js (the trigger-sentence count + residue strip see the same text).
  // FADING/VANISHING reminder strip (BLITZ LV-1): the keyword's reminder parens carry REAL trigger
  // sentences ("At the beginning of your upkeep, remove a time counter…"), which would parse as phantom
  // UNROUTABLE descriptors and park every vanishing+trigger card (Aven Riftwatcher) — while the keyword
  // itself is engine-enforced (fading.applyFadeVanishUpkeep) and keyword-credited. Strip EXACTLY that
  // reminder shape before detection; every other reminder is left as-is (Ravenous deliberately keys on its
  // reminder signature — see the KW-RAVENOUS synthesis).
  // Subject alternation covers every wording the corpus actually prints (censused 2026-07-24: creature 23 ·
  // enchantment 8 · artifact 2 · aura 1 · land 1 — "this enchantment" was MISSING, so every vanishing
  // ENCHANTMENT's reminder leaked through as a phantom unroutable upkeep descriptor, parking Four Knocks).
  // SQUAD reminder strip (CR 702.157a) — the SAME failure mode as fading/vanishing above, found 2026-07-29.
  // "Squad {3} (As an additional cost to cast this spell, you may pay {3} any number of times. When this
  // creature enters, create that many tokens that are copies of it.)" — that second sentence starts with
  // "When" at a sentence boundary INSIDE the paren, so the anchor below caught it and every squad creature
  // grew a PHANTOM ETB trigger whose effect clause was the malformed "create that many tokens that are copies
  // of it. )" — stray paren included, which is the tell that reminder text was being read as rules text.
  //
  // ⛔ IT IS A PHANTOM IN THE RUNTIME, NOT ONLY IN THE METRIC. The descriptor routes UNNATIVELY, so a squad
  // creature sent its ETB to the Arbiter for an ability it does not have — reminder text is never rules text
  // (CR 207.2). And the trigger it describes only exists when the optional squad cost was PAID; the engine
  // never pays optional additional costs, so "that many" is always zero and its absence is faithful, which is
  // the same reasoning coverage.js already credits the squad LINE under.
  //
  // ⚠️ FOUND BY A PATH ACCIDENT: squad was credited on the STATIC residue path and refused on the TRIGGER one,
  // so an identical card flipped or parked purely on what its other line happened to be. This file has fixed
  // exactly that shape before (the self-no-untap static, "a pure path accident" — see coverage.js).
  const oracle = foldTwoTriggerDetain(splitCompoundTriggerSentences(stripTriggerAbilityLabel(
    String(oracleOf(card) || "")
      // Number-word alternation censused against the corpus 2026-08-05 (three 12 · two 7 · four 6 · five 5 ·
      // a 2 · one 1 · seven 1 · twelve 1) — "seven" and "twelve" were MISSING, so Saproling Burst's and
      // Regenerations Restored's reminders leaked the usual stray-paren phantom. Padded past the printed
      // range so the next high-count printing doesn't re-open it.
      .replace(/\((?:this (?:creature|permanent|enchantment|artifact|aura|land) enters (?:the battlefield )?with (?:a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+) (?:time|fade) counters? on it\.[^)]*)\)/gi, "")
      // ⭐ IMPENDING REMINDER STRIP — the SAME failure mode as the fading/vanishing strip directly above and
      // the squad one below, and it announced itself the same way: the descriptor came out as an unroutable
      // endStep whose effectClause was "remove a time counter from it. )" — STRAY PAREN INCLUDED, which is
      // the tell that reminder text is being read as rules text.
      // "Impending 4—{1}{U}{U} (If you cast this spell for its impending cost, it enters with four time
      // counters and isn't a creature until the last is removed. At the beginning of your end step, remove a
      // time counter from it.)" — that second sentence starts with "At" at a sentence boundary INSIDE the
      // paren, so the trigger anchor caught it and every impending card grew a phantom upkeep-shaped
      // descriptor that routes UNNATIVELY, parking the card.
      // ⛔ It belongs ONLY to the impending CAST MODE, which the engine never takes (the keyword is credited
      // as an untaken alternative cast mode), so there is no real trigger to lose. Anchored to the exact
      // reminder shape — an impending-REFERENCING sentence in rules text is untouched.
      .replace(/\(if you cast this spell for its impending cost[^)]*\)/gi, "")
      // ⭐ GRAFT REMINDER STRIP (CR 702.57a) — the FIFTH instance of this exact failure, and it was found by
      // sweeping for the signature the previous four left behind rather than by tripping over a card: a
      // descriptor whose effectClause carries an unbalanced ')'.
      // "Graft 2 (This creature enters with two +1/+1 counters on it. Whenever another creature enters, you
      // may move a +1/+1 counter from this creature onto it.)" — that second sentence starts with "Whenever"
      // at a sentence boundary INSIDE the paren, so the trigger anchor caught it and all 12 graft carriers
      // grew a phantom descriptor reading "you may move a +1/+1 counter from this creature onto it. )".
      // It routed UNNATIVELY (0 of 12), which is what parked them.
      // ⛔ THE MOVE ABILITY IS A GENUINE OPTIONAL: "you MAY move a +1/+1 counter". Declining leaves the
      // counters where they are — a real, complete, legal play — so nothing is lost by not offering it. The
      // MANDATORY half of graft (entering with N +1/+1 counters) is NOT dropped: entersWithPlusCounters now
      // reads the count off the keyword, because these carriers are 0/0 and would otherwise die on arrival.
      .replace(/\(this (?:creature|permanent) enters (?:the battlefield )?with [^)]*\+1\/\+1 counters? on it\. whenever another creature enters[^)]*\)/gi, "")
      // ⭐ CHAMPION REMINDER STRIP (CR 702.71a) — the SIXTH instance, and it is here for a REASON THE
      // OTHERS DID NOT HAVE: it is a PREREQUISITE for the leaves-self anchor widening below.
      // "Champion an Elf (When this creature enters, sacrifice it unless you exile another Elf you control.
      // When this creature leaves the battlefield, that card returns to the battlefield.)" — the second
      // sentence starts at a sentence boundary INSIDE the paren, and Wren's Run Packmaster grew the usual
      // stray-paren phantom off it ("that card returns to the battlefield. )").
      // ⛔ THE OTHER CHAMPION CARDS ONLY LOOKED CLEAN. Scryfall re-worded most champion reminders from
      // "When this creature leaves" to "When this leaves", and the short form matched NO anchor — so their
      // phantom was invisible rather than absent. Widening the anchor below without this strip would have
      // manufactured the phantom on Thoughtweft Trio, Nova Chaser and Mistbind Clique and LOST them.
      // That is gate 20 exactly: before loosening a shared gate, ask what else reads it.
      // The champion trigger itself is not lost — the KEYWORD→TRIGGER synthesis owns the enters half, and
      // applyExileUntilLeaves' detainedExile link already returns the card on any exit (CR 610.3a), which
      // IS the leaves half. Synthesizing it again here would return the card TWICE.
      .replace(/\(when this(?: creature)? enters(?: the battlefield)?, sacrifice it unless you exile another [^)]*\)/gi, "")
      .replace(/\(as an additional cost to cast this spell, you may pay [^)]*any number of times\.[^)]*\)/gi, ""),
  )), card);
  const out = [];
  if (oracle) {
    // Anchored at start / after a sentence boundary, like keywords.js — so a
    // mid-sentence "when" never false-matches.
    const re = /(?:^|[\n.;]\s*)(When|Whenever|At)\b\s+([^.]+)\./gi;
    let m;
    while ((m = re.exec(oracle)) !== null) {
      const inner = m[2].trim();
      const split = splitTriggerSentence(inner);
      if (!split) continue;
      // ===== "…FOR THE FIRST TIME EACH TURN" (CR 603.2) — the limiter baked into the EVENT WORDING =====
      // The same once-per-turn latch the trailing sentence "This ability triggers only once each turn."
      // stamps (see the descriptor build below), reached by the other printed spelling. Stripped HERE,
      // before classification, for two reasons that are really one: the qualifier is not part of the event
      // (an `attacks` trigger is an `attacks` trigger), and leaving it in makes every condition arm choose
      // between ignoring it — which is what happened — or failing to match.
      //
      // ⛔ IGNORING IT WAS AN OVER-FIRE, THE FORBIDDEN DIRECTION. Aurelia, the Warleader was detected as a
      // plain `attacks` trigger with the latch OFF, so she fired on EVERY attack — and her payoff grants an
      // ADDITIONAL COMBAT PHASE, so she attacked again, fired again, and queued another. A turn that never
      // ends. The extra-combat mechanism's own tests proved one grant drains; nothing proved the grant
      // couldn't be re-issued, because that lived in the join. firstTimeEachTurnTrigger.test.js drives both
      // attacks through flushTriggers and asserts the second one puts nothing on the stack.
      //
      // TRAILING-ANCHORED on the condition. "for the first time DURING EACH OF YOUR TURNS" (Tale of Katara
      // and Toph) is a per-your-turn window, NOT this one, and does not match — it keeps its own handling.
      // A non-trailing occurrence (no corpus case) leaves the condition untouched → unmatched → Arbiter.
      // ⛔ SUBJECT GATE — THE LATCH IS KEYED PER SOURCE PERMANENT + EVENT, so it can only express a window
      // that belongs to the SOURCE or to its CONTROLLER: "this creature attacks…", "~ deals combat damage…",
      // "you gain life…", "you investigate…". A condition whose subject is some OTHER player ("whenever an
      // opponent loses life for the first time each turn") gives each of them their own first time, and one
      // shared per-source latch would suppress the second opponent's — an UNDER-fire. Those keep parking
      // (Arbiter, a SAFE false-negative) until the latch can be keyed per player; lifeLossTrigger.test.js
      // pins that case. Every corpus carrier of this wording is self- or you-subject (censused 2026-07-29:
      // 45 cards, dominated by "this creature becomes the target of a spell or ability…").
      let condText = split.condition;
      let firstTimeEachTurn = false;
      // ONE match, one strip — deliberately not a test-then-replace pair. Two copies of the same anchor are
      // the same guard written twice, and a mutation dropping either one survives because the other still
      // holds; the capture is what makes the anchor load-bearing exactly once.
      const ftetM = String(split.condition).trim().match(/^(.*\S)\s+for the first time each turn$/i);
      if (ftetM) {
        const stripped = ftetM[1];
        const subj = stripped.toLowerCase();
        const nm = String(card.name || "").toLowerCase();
        const shortNm = /legendary/i.test(String(card.type || card.type_line || "")) ? nm.split(",")[0].trim() : "";
        const ownWindow = /^(?:this|you)\b/.test(subj)
          || (nm.length >= 3 && subj.startsWith(nm))
          || (shortNm.length >= 3 && subj.startsWith(`${shortNm} `));
        if (ownWindow) {
          condText = stripped;
          firstTimeEachTurn = true;
        }
      }
      let cls = classifyCondition(condText, card.name, card.type || card.type_line);
      // ADDITIVE registry seam (WAVE 0): a future slice registers a condition detector instead of
      // editing this dispatch body. The inline classifyCondition keeps priority — the registry runs
      // ONLY when it returns falsy, and the first detector to return a truthy descriptor wins. An
      // empty registry is an exact no-op (the loop body never runs). Each detector gets the same
      // inputs classifyCondition does (condition text, card name, type line).
      if (!cls) {
        for (const d of _triggerDetectors) {
          // The 4th arg (the trigger's effect text) lets an effect-sensitive detector gate on BOTH the
          // condition AND the effect — e.g. SELF-LTB classifies "equipped creature dies" ONLY when the
          // effect is "return it to its owner's hand", so "equipped creature dies, draw a card" stays
          // unmatched (CREED). Pre-existing condition-only detectors simply ignore the extra arg.
          // The STRIPPED condition, same as the inline classifier above — a registered detector must not
          // have to know about a qualifier that isn't part of its event either.
          const r = d(condText, card.name, card.type || card.type_line, split.effectClause);
          if (r) { cls = r; break; }
        }
      }
      if (!cls) continue;
      // Stamp the latch onto the classified descriptor. Mutating `cls` is this dispatch's established idiom
      // (see cls.functionsFromGraveyard below), and the descriptor build's `|| !!cls.oncePerTurnTrigger` —
      // documented there as load-bearing — is what carries it through.
      if (firstTimeEachTurn) cls.oncePerTurnTrigger = true;
      // Extend the effect with the trigger's remaining SAME-LINE sentences (reminder text stripped)
      // so the parser sees its WHOLE effect. A triggered ability's effect is one oracle line, so we
      // stop at the first newline — that avoids swallowing a separate ability on the next line. An
      // unmodeled follow-up then drops the whole program to low → Arbiter, instead of firing the
      // first effect natively and dropping the rest (a forbidden partial application).
      let effectClause = split.effectClause;
      // MODAL TRIGGER (CR 700.2): when the effect is a "choose one/two/… —" lead-in, the naive clause holds
      // only mode 0 (the regex stopped at the first bullet's period). Re-extract the FULL bulleted block so
      // parseEffectClause sees every mode and its all-or-nothing modal gate covers the WHOLE card. The block
      // is self-contained (lead + all bullets), so it bypasses BOTH the same-line follow-up loop (which would
      // mis-append bullet text) AND the leading-sentence referent rewrites below (which target a non-modal
      // clause's pronouns; modal modes carry their own self/that referents the parser handles).
      const modalBlock = extractModalEffectBlock(oracle, m.index, effectClause);
      if (modalBlock !== null) {
        effectClause = modalBlock;
        // (Mode flavor labels — "• Sort Inventory — Draw a card…" — are stripped by the PARSER's own
        // modal-mode handling; no strip here, so label handling has exactly one owner and can't drift.
        // The pronoun REWRITE below runs on the label-carrying bullet text; the rewriter's per-sentence
        // anchors tolerate the "<Label> — " prefix on the counter form via the leading-conjunct pattern,
        // and any bullet it can't rewrite keeps its raw pronoun → the parser gate decides.)
        // MODAL ENTERING/ATTACKING PRONOUN (Pip-Boy "• Put a +1/+1 counter on that creature."): a bullet's
        // "it"/"that creature" refers to the SAME triggering permanent a non-modal clause's would — the
        // referent guarantee lives in the trigger's (event, scope), which the parser can't see. Run each
        // BULLET through the SAME per-sentence rewriter the non-modal arm uses, under the SAME gates (etb
        // entering scopes; attacks on creatureYouControl/equippedCreature — the attacker IS the triggering
        // permanent, per checkAttackTriggers / the equippedCreature scopeMatches). A bullet the anchored
        // patterns can't rewrite keeps its raw pronoun → the parser's modal all-or-nothing gate fails →
        // body-only (CREED — never a mis-bound referent).
        if ((cls.event === "etb" && ETB_ENTERING_CREATURE_SCOPES.has(cls.scope))
          || (cls.event === "attacks" && (cls.scope === "creatureYouControl" || cls.scope === "equippedCreature"))) {
          effectClause = effectClause.split("\n").map((l) => {
            const t = l.trim();
            if (!t.startsWith("•")) return l;
            // Peel an optional "<Label> — " flavor prefix off the body FIRST (the rewriter's per-sentence
            // anchors are ^-bound); the label is dropped from the rewritten bullet — harmless, the parser
            // strips labels itself either way.
            const body = t.replace(/^•\s*/, "").replace(/\.\s*$/, "").replace(/^[A-Z][\w'’!,. -]{0,30}?\s+—\s+(?=[A-Z])/, "");
            return l.replace(t.replace(/^•\s*/, "").replace(/\.\s*$/, ""), rewriteEtbEnteringPronoun(body));
          }).join("\n");
        }
      } else {
      const sameLine = oracle.slice(re.lastIndex).split("\n")[0].replace(/\([^)]*\)/g, " ");
      for (const sent of sameLine.split(/\.\s+|\.\s*$|;\s+/)) {
        const s = sent.trim();
        if (!s) continue;
        // REFLEXIVE TRIGGER (CR 603.7) — a "When you do, <effect>" right after a "roll a d20" is the
        // delayed/reflexive ability the roll's resolution creates. Fold its <effect> into THIS trigger's
        // program (the roll stamps state.diceRoll; the diceResult payoff reads it). Gated to the roll source,
        // so an optional-action reflexive is never mis-folded (see reflexiveEffectAfterRoll). Checked BEFORE
        // isFollowupSentence (which rejects any "When…"-led sentence), so the reflexive payoff is no longer
        // dropped. An unmodeled <effect> still drops the whole program LOW → Arbiter (parser re-gate).
        const reflexive = reflexiveEffectAfterRoll(effectClause, s);
        if (reflexive !== null) { effectClause += `. ${reflexive}`; continue; }
        // GENERAL REFLEXIVE (CR 603.7) — a "When you do[ this/so], …" sentence that is NOT the roll case
        // (handled above). Append it RAW (keep the "When you do" connective) so the parser's whole-shape
        // matchReflexiveTrigger gate decides whether to fold it: it folds ONLY when the primary is MANDATORY
        // (so the reflexive always fires) and both halves parse HIGH + self-contained — else the whole
        // program stays LOW → Arbiter. Appending raw (vs. stripping like the roll path) lets the parser see
        // "<primary>. When you do, <reflexive>" and apply that gate; an OPTIONAL primary (Generous Plunderer's
        // "you may create a Treasure token") is rejected there, so the reflexive never fires after a declined
        // "may". Checked BEFORE isFollowupSentence (which would otherwise break the loop on the "When"-led
        // sentence and silently drop the reflexive — the latent FP this closes).
        if (/^when you do(?:\s+this|\s+so)?\b/i.test(s)) { effectClause += `. ${s}`; continue; }
        if (!isFollowupSentence(s)) break;
        effectClause += `. ${s}`;
      }
      }
      // (A blanket selfNormalizeOracle pass sat here for one probe cycle on 2026-08-14 and was REMOVED:
      // it corrupted token NAMES ("Koma's Coil"), tutor filters ("a card named Screaming Seahawk"), and
      // trampled rewriteSelfNameToThisCreature's pure-promotion verb discipline — seven witness files
      // failed at the gate. Self-names in trigger payloads go through THAT machinery's anchored grammars,
      // extended per shape; see the counter-on-name arm added for Korvold below it.)
      // The leading-sentence referent rewrites below operate on a single non-modal effect sentence's
      // pronouns; a modal block's modes carry their own self/that/triggering referents (handled inside
      // the parser per mode), so skip the whole chain when the effect is the re-extracted modal block.
      if (modalBlock === null) {
      // ===== ORDEAL CYCLE (BLITZ OC-1) ===== the exact Theros Ordeal attack line: "Whenever enchanted
      // creature attacks, put a +1/+1 counter on it. Then if it has three or more +1/+1 counters on it,
      // sacrifice this Aura." Both pronouns are the ENCHANTED creature — on an attacks/equippedCreature
      // trigger the triggering permanent IS the attacker = this Aura's host (checkAttackTriggers +
      // scopeMatches' attached linkage), so "it" = ctx.triggeringPermanentId. The instructions run IN THE
      // ORDER WRITTEN (CR 608.2c): counter first, THEN the threshold check ("Then if …" is a mid-effect
      // conditional read at that point of the resolution, NOT a CR 603.4 intervening if — it is checked
      // AFTER the counter lands, counting ALL +1/+1 counters on the host). Rewrite the WHOLE two-sentence
      // pair (anchored ^…$ — any variant/rider fails the anchor and keeps its raw pronouns → LOW → Arbiter)
      // into: the standard triggering-creature counter sentinel + the [ordeal-threshold-sac] marker ONLY
      // the ordealThresholdSacClauseParser models (threshold read live off the host; the sacrifice is the
      // SOURCE Aura via ctx.sourceId → sacrificeCreatureEffect, whose chokepoint then fires the Aura's own
      // "when you sacrifice this Aura" payoff — CR 603.10a).
      if (cls.event === "attacks" && cls.scope === "equippedCreature"
        && /^put a \+1\/\+1 counter on it\.\s*then if it has three or more \+1\/\+1 counters on it, sacrifice this aura$/i.test(effectClause)) {
        effectClause = "put a +1/+1 counter on the triggering creature. [ordeal-threshold-sac] sacrifice this aura if the triggering creature has three or more +1/+1 counters on it";
      }
      // TRIG-PUMP-1: for a SELF-scope trigger only, normalize a leading "it" → "this creature" when
      // the WHOLE effect is the self-pump shape (SELF_PUMP_IT_RE), so the parser's self-pump atom
      // (target:"self") models it. Gated on `cls.scope === "self"`: in a NON-self trigger
      // ("Whenever a creature you control attacks, it gets…") the "it" is the OTHER triggering
      // creature, not the source — rewriting there would mis-pump the source, a forbidden false
      // positive. The whole-clause anchor leaves any rider/compound untouched (→ stays LOW → Arbiter).
      // SELF-NAME-REF (CR 201.4) — the source names ITSELF in the effect ("Whenever you sacrifice a Treasure,
      // Captain Lannery Storm gets +1/+0 …"; "Whenever this creature attacks, <Name> gets +2/+2 …"). UNLIKE the
      // pronoun "it" (whose referent depends on scope — the SOURCE for a self trigger, the TRIGGERING permanent
      // otherwise), a literal self-NAME is UNAMBIGUOUS: it always refers to the named permanent = the SOURCE,
      // for ANY trigger scope. So this rewrite is scope-INDEPENDENT (it runs for the sacrifice/attack/etc.
      // triggers whose scope isn't "self"). Rewrite a leading full/short self-name → "this creature" so the
      // parser's self atom (target:"self" → sourceId) binds it. A pure promotion (clause unchanged unless it
      // leads with the source's name + a modeled self-effect verb). Run BEFORE the "it" chain — a name and "it"
      // are different leading tokens, so they never conflict. The parser re-gates the effect (LOW → Arbiter).
      effectClause = rewriteSelfNameToThisCreature(effectClause, card.name);
      // GY-OWNER REFERENT (Bloodchief Ascension — SHELF S7, CR 603.2): on a gyEnter trigger, "that player"
      // is the player whose graveyard received the card (ctx.gyOwnerId, threaded by
      // checkGraveyardEventTriggers). Rewrite to the SENTINEL "the graveyard's owner" so the parser's
      // gy-owner atoms bind it — and so a spell's / another event's anaphoric "that player" (a DIFFERENT
      // referent — damagedPlayer on combat damage, a chosen target elsewhere) never reaches those matchers.
      // The triggering-power sentinel precedent, event-gated exactly.
      if (cls.event === "gyEnter") {
        effectClause = effectClause.replace(/\bthat player\b/gi, "the graveyard's owner");
      }
      // UPKEEP-PLAYER REFERENT (BLITZ TR-2 — CR 603.2b + 503.1a): on an "each player's upkeep" trigger,
      // "that player" is the player WHOSE UPKEEP IT IS (ctx.upkeepPlayerId = the active player, threaded by
      // checkStepTriggers at every upkeep-step entry). Rewrite to the SENTINEL "the upkeep player" so the
      // dedicated who:"upkeepPlayer" atoms bind it — and so the bare "that player" matchers (who:
      // "damagedPlayer", the combat-damage referent) never see this trigger's anaphor. The sentinel phrase
      // appears NOWHERE in printed oracle (corpus-verified), so no spell/other-event clause can reach those
      // atoms; the triggerRouting referent gate additionally pins who:"upkeepPlayer" to the upkeep event.
      // Gated on the eachPlayersUpkeep flag (set ONLY by the anchored "each player's upkeep" condition) —
      // a "your upkeep" / bare "each upkeep" trigger's effect is byte-identical. The gyOwner precedent.
      // The DRAW-STEP twin shares this rewrite: at a draw-step entry the player whose step it is is likewise
      // the active player (CR 504.1), so "that player" has the identical referent and the identical
      // who:"upkeepPlayer" atoms bind it. Sharing the sentinel is what keeps the two arms from drifting.
      // ⭐⭐ EACH **OPPONENT'S** UPKEEP RIDES THE SAME SENTINEL (TP-2, 2026-08-05 — Gibbering Fiend,
      // Sheoldred, Manic Scribe, Sorin's emblem). The wording differs by one noun from the arm above and
      // the REFERENT IS IDENTICAL: ctx.upkeepPlayerId is the player whose upkeep it is (the active player,
      // threaded by checkStepTriggers), and on an opponent's upkeep that active player IS that opponent.
      // The `whose:"opponents"` filter decides WHICH upkeeps fire; it never changes who "that player" is.
      // These triggers were already fully DETECTED — event, whose and intervening-if all correct — and
      // parked solely because the anaphor never became a sentinel, so no atom could bind it. The existing
      // who:"upkeepPlayer" arms (damage, mill, sacrifice, discard, draw, lose-life) then cover them with no
      // new parser at all.
      // ⛔ whose:"yours" is deliberately NOT included: on your own upkeep no second player is established,
      // so "that player" has no antecedent there — a rewrite would be inventing one.
      if (cls.eachPlayersUpkeep || cls.eachPlayersDrawStep || cls.enchantedControllersUpkeep
        || (cls.event === "upkeep" && (cls.whose === "opponents" || cls.whose === "any"))) {
        effectClause = effectClause.replace(/\bthat player\b/gi, "the upkeep player");
      }
      // THE KARLACH FOLD (Increment 3b, 2026-08-12 — "untap all attacking creatures. They gain first
      // strike until end of turn."): "They" is the attacker batch the preceding sentence just untapped.
      // Grammar-anchored to DIRECTLY follow the exact untap sentence (the Surrak follow-up discipline),
      // so no other "They …" anaphor is ever consumed; the rewritten subject ("attacking creatures gain
      // …") is a SENTINEL only this fold produces — groupGrantClauseParser's attacking arm binds it to
      // the LIVE attacker set (any controller, matching "ALL attacking creatures").
      effectClause = effectClause.replace(/(untap all attacking creatures\.)\s+they gain /i, "$1 attacking creatures gain ");
      // ATTACKS-WHILE SELF-REFERENT (2026-08-14 — Pugnacious Hammerskull "put a stun counter on IT"):
      // on the attacks-self event "it" is the attacking source itself — rewritten to the "this creature"
      // the self counter arms already bind (add-named-counter-self). Gated to the attacksWhileIf lane
      // (its only carrier) so no other "on it" anaphor is ever consumed.
      if (cls.attacksWhileIf && cls.scope === "self") {
        effectClause = effectClause.replace(/\bon it\b/gi, "on this creature");
      }
      // ENCHANTED-HOST REFERENT (2026-08-12 — Unstable Mutation "put a -1/-1 counter on THAT CREATURE"):
      // on the enchanted-controller's-upkeep event, "that creature" is the ENCHANTED CREATURE named in the
      // trigger condition — the aura's host — so the rewrite hands it to the existing target:"enchanted"
      // atoms (Level Up's counter arm, the tap/pump family), which resolve the host via attachedTo. Gated
      // on THIS event only: any other trigger's "that creature" anaphor keeps no antecedent here and stays
      // unbound → LOW → Arbiter. Essence Flare / Takklemaggot rewrite too but their "-0/-1"/"-0/-1"
      // counters fail the counter arm's ±1/±1 shape — only ±1/±1 carries P/T weight in ptPrimitive — so
      // they stay parked rather than crediting a counter that would apply NOTHING (the free-spell shape).
      if (cls.enchantedControllersUpkeep) {
        // "(that|the) creature" both rewrite: Apathy prints "untap THAT creature", Paralyze "untap THE
        // creature" — on this event both anaphors have the same single antecedent (the enchanted host).
        // "enchanted creature" itself never matches (no "that/the" directly before "creature" there).
        effectClause = effectClause.replace(/\b(?:that|the) creature\b/gi, "enchanted creature");
      }
      // ⭐⭐ CASTING-PLAYER REFERENT (TP-1, CR 603.2 — Eidolon of the Great Revel, Pyrostatic Pillar, Aether
      // Sting, Spellshock, Kambal, Yawgmoth's Edict, Memory Erosion): on a CAST trigger, "that player" is the
      // player who CAST the spell — ctx.castingPlayerId, already threaded by checkCastTriggers for Rhystic
      // Study's taxed draw. The fifth arm of the same event-gated rewrite the gyOwner / upkeep-player /
      // discarding-player arms above established, and triggerRouting's own header names this exact case as
      // the documented safe-FN it was waiting on.
      // ⛔⛔ EVENT-GATED, NEVER A CLAUSE MATCHER, for the reason written at the discarding-player arm: the
      // bare words "that player" are corpus-AMBIGUOUS — upkeep player, damaged player, milled player,
      // discarder or caster depending ENTIRELY on the event overhead. A matcher that read the words alone
      // would bind the wrong seat, and a wrong-seat bug is invisible: the ability resolves, someone takes
      // the damage, and only the identity is wrong.
      // ⛔ `whose` DOESN'T MATTER HERE and that is worth stating: whether the trigger watches "a player"
      // (Eidolon, whose:"any") or "an opponent" (Kambal, whose:"opponent"), the referent is the SAME seat —
      // the one that cast. The whose-filter decides IF the trigger fires, never WHO it points at.
      if (cls.event === "cast") {
        effectClause = effectClause.replace(/\bthat player\b/gi, "the casting player");
      }
      // DRAWING-PLAYER REFERENT (TP-3 — Fate Unraveler, Underworld Dreams, Kederekt Parasite, Scrawling
      // Crawler): on a card-drawn trigger, "that player" is the player who DREW — ctx.drawingPlayerId,
      // already threaded by checkCardDrawnTriggers. The structural twin of the cast arm directly above;
      // only the event and the ctx key differ. Same event-gated discipline, and for the same reason.
      if (cls.event === "cardDrawn") {
        effectClause = effectClause.replace(/\bthat player\b/gi, "the drawing player");
      }
      // ⭐⭐ DAMAGED-PLAYER **CONTROLS** SENTINEL (DT-2, 2026-08-06 — Snapping Thragg, Skirk Commando,
      // Spark Mage: "you may have it deal N damage to target creature THAT PLAYER controls").
      // ⛔⛔ THE REFUSAL THIS CLEARS IS DELIBERATE, NOT A BUG. parser.js's UNMODELED_MARKERS lists
      // `that (player|creature|…)`, and the damage/destroy fold requires isCleanClause(cleanedOracle) on
      // top of the restriction parse — so a leftover bare ANAPHOR is rejected on purpose. "Defending
      // player controls" parses precisely because it is an unambiguous PRINTED phrase and is not in that
      // list. The sentinel turns this anaphor into the same kind of unambiguous phrase; **widening
      // UNMODELED_MARKERS instead would admit every unresolved anaphor**, which is the class this run has
      // twice caught silently doing nothing or hitting the wrong seat.
      // ⛔ Gated to the combat-damage event, the only one that binds ctx.damagedPlayerId. The EACH-creature
      // lane (DT-1) already ships on the raw phrase and does not pass through this gate, so the scope arm
      // accepts both spellings — same "one vocabulary" rule the taxed-draw matchers needed.
      // ⛔⛔ NARROWED TO `target creature that player controls` — MEASURED, NOT GUESSED. A global swap of
      // "that player controls" on this event read **+4 / 8 LOST**: removal.js's PERMANENT lane matches that
      // phrase LITERALLY in three places, so "destroy target artifact that player controls" (Joven and
      // Chandler, Trygon Predator, Caustic Wasps, Cavern-Hoard Dragon …) lost its matcher and parked.
      // **"A rewrite is a rename", fourth occurrence this run** — and the fix is a narrower anchor rather
      // than teaching yet another matcher a second spelling, because only the CREATURE-target form is
      // refused by isCleanClause in the first place. The each-creature and permanent lanes keep the raw
      // phrase they already parse.
      if (cls.event === "combatDamageToPlayer") {
        // ⛔⛔ ANCHORED ON `target creature that player controls` AND DELIBERATELY NO WIDER — three
        // successive widenings were measured and each one broke a different LITERAL reader of this phrase:
        //   · global swap                     → +4 / **8 LOST** (removal.js's permanent lane, ×3 sites)
        //   · `target creature …`             → +3 / 0, but Arm with Aether needed the bounce matcher
        //                                       taught the second spelling (zones.js)
        //   · `creature that player controls` → +4 / **1 LOST** (Balefire Dragon's dedicated
        //                                       CDMG-MASS-TO-DAMAGED-PLAYER matcher, stack.js)
        // **Every widening finds another reader**, so this stops at the narrowest anchor that clears the
        // isCleanClause refusal. Throat Slitter ("target NONBLACK creature that player controls") is the
        // known cost — a safe FN, and cheaper than the whack-a-mole.
        effectClause = effectClause.replace(/\btarget creature that player controls\b/gi, "target creature the damaged player controls");
      }
      // ⭐⭐ ITS-CONTROLLER REFERENT (IC-1, 2026-08-06 — Poisonbelly Ogre, Fate Foretold, Parasitic Impetus,
      // Smoke Blessing). "Its controller" names the controller of the object that TRIGGERED the ability, and
      // `triggeringPermanentController` has been bound in makePendingTrigger's generic context all along
      // with NO consumer. This rewrite is what lets an atom own it.
      // ⛔⛔ A REWRITE IS REQUIRED, NOT OPTIONAL — measured. A parser arm matching the RAW pronoun returns
      // the right atom when called directly and still yields [] through parseEffectClause, while its
      // sibling "the upkeep player loses 1 life" passes the same pipeline. The pipeline deliberately does
      // not trust a bare pronoun as a clause subject; the sentinel is how every sibling referent earns that
      // trust (gyOwner / upkeep / discarding / casting / drawing all do exactly this).
      // ⛔ SCOPE-GATED, and `scope !== "self"` is the load-bearing half. On a SELF trigger "its" is the
      // source itself, whose controller IS the ability's controller — the default path is already right and
      // rewriting would only add a referent that can go unbound. The carriers that need this are precisely
      // the ones where the triggering object is SOMEONE ELSE'S: eachOtherCreature (Poisonbelly Ogre's
      // entering creature) and equippedCreature (an Aura on an opponent's creature).
      // ⛔ THE THREE EVENTS ARE LISTED EXPLICITLY rather than defaulted, so an event that binds no
      // triggering permanent can never reach the sentinel — a safe FN for anything unlisted.
      // ⛔⛔ ANCHORED TO THE CLAUSE SUBJECT (`^its controller`), NOT A FREE REPLACE — and a real collision
      // is why. A free `\bits controller\b` swap also rewrites the phrase INSIDE "it doesn't untap during
      // ITS CONTROLLER's next untap step", which combat.js's tap-lock matchers key on LITERALLY. That is
      // the "a rewrite is a rename" hazard this run has already paid for twice (the Rhystic Study family
      // and Smothering Tithe), caught here by a pre-existing scope-gate pin rather than by the flip-diff,
      // which read 0 lost because the affected card parks for other reasons anyway.
      // Every carrier names the referent as its SUBJECT ("its controller loses/draws …"), so the anchor
      // costs nothing and removes the whole class of collision.
      if ((cls.event === "etb" || cls.event === "dies" || cls.event === "attacks") && cls.scope !== "self") {
        effectClause = effectClause.replace(/^its controller\b/i, "the triggering permanent's controller");
      }
      if (cls.scope === "self" && SELF_PUMP_IT_RE.test(effectClause)) {
        effectClause = effectClause.replace(/^it /i, "this creature ");
      }
      if (cls.scope === "self" && SELF_COUNTER_IT_RE.test(effectClause)) {
        // IT-COUNTER: "…put a +1/+1 counter on IT" — "it" is the source (CR 113.7). Same self-scope gate
        // as the pump (a NON-self trigger's "it" is the OTHER triggering creature, never the source) +
        // the whole-clause anchor, so the parser's self-counter atom (target:"self") models it.
        effectClause = effectClause.replace(/ on it$/i, " on this creature");
      }
      if (cls.scope === "self" && SELF_DOUBLE_IT_RE.test(effectClause)) {
        // IT-DOUBLE: "double the number of +1/+1 counters on IT" — same self-scope + whole-clause rules as
        // the counter rewrite directly above; the parser's countersOnSource atom models the rewritten form.
        effectClause = effectClause.replace(/ on it$/i, " on this creature");
      } else if (cls.scope === "self" && SELF_DOUBLE_IT_LEAD_RE.test(effectClause)) {
        // IT-DOUBLE, LEADING (Level Up's granted body) — rewrite the pronoun in the FIRST sentence only and
        // leave the rest untouched for the parser's "then if <cond>, <effect>" peel. `else if` so the
        // whole-clause form above still wins when there is no rider (byte-identical for every existing card).
        // ⚠️ A mutation replacing this with a GLOBAL `/ on it/gi` rewrite SURVIVES the suite (verified): no
        // printed card in this family carries a second " on it" in the rider, so nothing distinguishes them
        // today. The anchored form is kept deliberately as the narrower change — it cannot touch a sentence
        // it was never reasoned about — but the gate here is honest about being untested, not silently strong.
        effectClause = effectClause.replace(/^(double the number of [+-]1\/[+-]1 counters) on it\./i, "$1 on this creature.");
      }
      if (cls.event === "becomesTarget" && cls.scope === "self" && SELF_SAC_IT_RE.test(effectClause)) {
        // SELF-SAC-IT (BECOMES-TARGET, the Phantasmal Illusion family) — "…sacrifice it" where "it" is the
        // SOURCE (CR 608.2c — the targeted permanent = the trigger source). Rewrite → "sacrifice this creature"
        // so the parser's self-sac atom (target:"self" → ctx.sourceId) models it. Self-scope + whole-clause
        // anchored (a rider leaves residue → LOW → Arbiter). The checker (checkBecomesTargetTriggers) fires this
        // trigger at every target-choice site with sourceId = the targeted permanent, so the self-sac resolves it.
        effectClause = "sacrifice this creature";
      }
      if (cls.event === "dies" && cls.scope === "self" && SELF_RETURN_IT_RE.test(effectClause)) {
        // SELF-DIES-RETURN (frontier round 4, the Phoenix shape) — "When this creature dies, return it to its
        // owner's hand." (Shivan Phoenix, Immortal Phoenix, Mortus Strider, Weatherseed Treefolk). The
        // creature DIED, so "it" (CR 608.2c — the object the ability triggered on) is the dead creature, now
        // sitting in its owner's graveyard — exactly the graveyard→hand self-return the applySelfReturn
        // resolver already performs for the Aura-PiG / equipped-creature-dies cases (it reads ctx.triggering-
        // CardId + ctx.triggeringController, which checkDiesTriggers threads as the DEAD creature). So reuse
        // the SAME kind-tagged marker as "self".
        //
        // CRITICAL GATE — event === "dies": a self-scope "return it" on a LIVE event (Zephyr Spirit's "When
        // this creature BLOCKS, return it to its owner's hand"; an attacks-trigger) is a battlefield→hand
        // BOUNCE (the creature is still on the battlefield), NOT a graveyard return — routing THAT here would
        // look for the card in the graveyard and no-op (a dropped clause, a forbidden FP). Restricting to the
        // dies event (the only self event where the source is already in the graveyard) keeps this correct;
        // the live self-bounce stays unrewritten → LOW → Arbiter (a SAFE false-negative). The whole-clause
        // SELF_RETURN_IT_RE anchor ($) means a rider on the return ("…tapped", "…then draw") never matches →
        // body-only (CREED all-or-nothing).
        effectClause = `[self-return:self] ${effectClause}`;
      } else if (cls.event === "dies" && cls.scope === "self" && SELF_RETURN_BF_ENCHANTMENT_RE.test(effectClause)) {
        // SELF-DIES-RETURN-AS-ENCHANTMENT (the "Enduring"/Glimmer cycle — Enduring Curiosity et al) —
        // "When this creature dies, if it was a creature, return it to the battlefield under its owner's
        // control. It's an enchantment. (It's not a creature.)" The creature DIED, so "it" (CR 608.2c) is
        // the dead SOURCE, now in its owner's graveyard. The intervening-if "it was a creature" is enforced
        // by interveningIf.js (evaluated at flush AND resolution against ctx.triggeringWasCreature). Rewrite
        // the effect to the kind-tagged marker ONLY the selfReturnClauseParser models → the
        // self-return-bf-enchantment atom (graveyard → battlefield under owner's control, type stripped to a
        // non-creature enchantment). SAME self-scope + dies-event gate as the return-to-hand branch above (a
        // LIVE-event self "return it to the battlefield" doesn't exist in the corpus, and the dies-event
        // restriction guarantees the source is already in the graveyard). The whole-clause anchor means any
        // rider on the return keeps its raw text → the parser fails HIGH → body-only (CREED all-or-nothing).
        // REPLACE (not prepend) with a single-sentence marker: parseEffectClause splits the effect on ". " so
        // an internal period ("…owner's control. It's an enchantment") would split the marker into two
        // sentences that neither clause parser matches → LOW. The "It's an enchantment" semantics are captured
        // by the marker tag itself (the resolver strips the creature type), so the collapsed sentence is faithful.
        effectClause = "[self-return-bf:enchantment] return it to the battlefield under its owner's control as an enchantment";
      } else if (cls.event === "dies" && cls.scope === "self" && /^return it to the battlefield( tapped)? under its owner's control( with a \+1\/\+1 counter on it)?$/i.test(effectClause)) {
        // DIES-RETURN-TO-BATTLEFIELD (BLITZ TG-1 — the Feign Death frame, reached via the until-EOT quoted
        // grants: "When this creature dies, return it to the battlefield [tapped] under its owner's control
        // [with a +1/+1 counter on it]."). The creature DIED, so "it" (CR 608.2c) is the dead source in its
        // owner's graveyard — undying's zone mechanics with tapped/counter knobs re-read from the preserved
        // printed text by selfReturnClauseParser. SAME dies+self gate as the branches above; CRITICALLY this
        // stays a dies-only SENTINEL because the bare wording also appears in FLICKER spell halves ("Exile
        // target creature you control, then return it to the battlefield under its owner's control" —
        // Momentary Blink): a bare clause-parser match there would classify the blink native and silently
        // DROP the return (ctx.triggeringCardId unset on the spell path → resolver no-op — a forbidden
        // dropped-clause FP). The marker only ever exists on a dies/self descriptor, so the spell path can
        // never reach the atom. Whole-clause anchored ($) — a rider never matches → body-only (CREED).
        effectClause = `[dies-return-bf] ${effectClause}`;
      } else if (cls.selfReturnKind && SELF_RETURN_IT_RE.test(effectClause)) {
        // SELF-LTB (Wave 4) — "return it to its owner's hand" where the returned object has ALREADY LEFT the
        // battlefield (it's in a graveyard): the Aura self-PiG-return (Rancor — "it" = the Aura) or the
        // equipped-creature-dies-return (Sword of the Realms — "it" = the dead creature). DISTINCT from the
        // live self-bounce (Zephyr Spirit's "When this creature blocks, return it …" — the source is still on
        // the battlefield), so it must NOT collapse to the existing bounce. Rewrite to a kind-tagged marker
        // phrase that ONLY the selfReturnClauseParser models → the self-return atom (graveyard → owner's hand).
        // Gated on cls.selfReturnKind (set ONLY by the two narrow detectors), so no other trigger is touched.
        effectClause = `[self-return:${cls.selfReturnKind}] ${effectClause}`;
      } else if (NONSELF_TRIGGERING_SCOPES.has(cls.scope) && /^put x \+1\/\+1 counters on it, where x is its power$/i.test(effectClause)) {
        // POWER-SCALED triggering-creature counters (Railway Brawler — "Whenever another creature you
        // control enters, put X +1/+1 counters on IT, where X is ITS power"): both pronouns are the
        // TRIGGERING (entering) creature (CR 608.2c). Rewrite to the sentinel counterClauses models
        // (target:"thatCreature" + countFor triggeringCreaturePower — X read live at resolution,
        // CR 608.2h). Whole-clause anchored; a rider → unrewritten → LOW → Arbiter.
        effectClause = "put x +1/+1 counters on the triggering creature, where x is its power";
      } else if (cls.event === "blocksCreature" && /^that creature doesn't untap during its controller's next untap step$/i.test(effectClause)) {
        // ⭐ BLOCKS-A-CREATURE REFERENT (CR 608.2c) — "that creature" is the BLOCKED ATTACKER, which the
        // blocksCreature fire site threads as the triggering permanent. Rewrite to the shared "the triggering
        // creature" sentinel so the existing target:"thatCreature" lane binds it — no new referent kind, and
        // no other family's binding moves.
        // ⛔ EVENT-GATED, not scope-gated like its neighbours, because this event has exactly one scope and
        // the gate must be the narrower of the two. Whole-clause anchored: Vertigo Spawn's two-sentence
        // "tap that creature. That creature doesn't untap…" leaves residue → unrewritten → LOW → Arbiter
        // (a safe FN), and every other "that creature" effect in this family (destroy, bounce-at-end-of-
        // combat, can't-attack-next-turn) is untouched and still parks.
        effectClause = "the triggering creature doesn't untap during its controller's next untap step";
      } else if (cls.scope === "permanentYouControl" && /^untap it$/i.test(effectClause)) {
        // AMULET-UNTAP (#1301) — "Whenever a permanent you control enters tapped, untap IT". "It" is the
        // ENTERING permanent (CR 608.2c), which is usually a LAND, so this cannot ride the creature-only
        // "the triggering creature" sentinel the pump/counter families use. Rewrite to the permanent-wide
        // sentinel combat.js parses into target:"thatPermanent" → ctx.triggeringPermanentId.
        //
        // Scope-gated to permanentYouControl and whole-clause anchored: no other trigger family reaches this
        // branch, and any rider on the clause stays unrewritten → LOW → Arbiter (a safe FN).
        effectClause = "untap the triggering permanent";
      } else if (NONSELF_TRIGGERING_SCOPES.has(cls.scope)
        && (NONSELF_COUNTER_REF_RE.test(effectClause) || NONSELF_DOUBLE_COUNTER_REF_RE.test(effectClause))) {
        // WAVE 3b COUNTERS-ON-EVENT: a NON-self attack/combat-damage trigger's "…put a +1/+1 counter on IT
        // / on THAT CREATURE" — the referent is the TRIGGERING permanent (CR 608.2c), not the source.
        // Normalize → the sentinel "the triggering creature" so the WAVE-3b clause parser binds it to
        // ctx.triggeringPermanentId. Gated to the non-self triggering scopes (the spell anaphor never
        // reaches here) + the whole-clause anchor (a rider stays untouched → LOW → Arbiter), CREED-safe.
        effectClause = effectClause.replace(/ on (?:it|that creature)$/i, " on the triggering creature");
      } else if (NONSELF_TRIGGERING_SCOPES.has(cls.scope) && SELF_PUMP_IT_RE.test(effectClause)) {
        // TRIG-PRONOUN-IT: a NON-self trigger's "IT gets/gains … until end of turn" (Battlegrace Angel —
        // "Whenever a creature you control attacks, it gains lifelink until end of turn") — "it" is the
        // TRIGGERING permanent. Sentinel-rewrite the leading "it" so the parser models it as
        // target:"thatCreature". Same scope gate + whole-clause anchor as COUNTERS-ON-EVENT (a spell
        // anaphor never reaches here; a rider stays LOW). The parser re-gates the keyword set.
        effectClause = effectClause.replace(/^it /i, "the triggering creature ");
      } else if (NONSELF_TRIGGERING_SCOPES.has(cls.scope) && THAT_CREATURE_PUMP_RE.test(effectClause)) {
        // THAT-CREATURE PUMP (BLITZ TR-2): the same non-self pump with the "that creature" subject
        // (Agents of S.H.I.E.L.D. — "Whenever a creature you control attacks alone, that creature gets
        // +1/+1 until end of turn"; exalted's printed long-form). Identical referent (the TRIGGERING
        // creature, CR 608.2c) and identical whole-clause shapes as the "it" branch above — rewrite the
        // leading "that creature" to the same target:"thatCreature" sentinel. The parser re-gates.
        effectClause = effectClause.replace(/^that creature /i, "the triggering creature ");
      } else if (NONSELF_TRIGGERING_SCOPES.has(cls.scope) && NONSELF_SAC_REF_RE.test(effectClause)) {
        // TRIG-PRONOUN-IT: "sacrifice IT" → sacrifice the TRIGGERING permanent (CR 608.2c).
        effectClause = "sacrifice the triggering creature";
      } else if (NONSELF_TRIGGERING_SCOPES.has(cls.scope) && SELF_RETURN_IT_RE.test(effectClause)) {
        // TRIG-PRONOUN-IT: "return IT to its owner's hand" → bounce the TRIGGERING permanent (CR 608.2c).
        // DISTINCT from the SELF-LTB graveyard-return marker (that path is gated on cls.selfReturnKind,
        // checked earlier in this chain) — here the triggering creature is still on the battlefield.
        effectClause = "return the triggering creature to its owner's hand";
      } else if (cls.scope === "self" && EXPLORE_IT_RE.test(effectClause)) {
        // EXPLORE: "it explores" / "it explores, then it explores again" — "it" is the SOURCE (CR 113.7).
        // Repeat the SOURCE subject so the sequence parser sees two "this creature explores" clauses (each →
        // explore self). Same self-scope gate + whole-clause anchor as the pump/counter forms.
        effectClause = /again/i.test(effectClause)
          ? "this creature explores, then this creature explores"
          : "this creature explores";
      } else if (NONSELF_TRIGGERING_SCOPES.has(cls.scope) && EXPLORE_IT_RE.test(effectClause)) {
        // EXPLORE non-self (Path of Discovery — "Whenever a creature you control enters, it explores"): "it"
        // is the TRIGGERING creature (CR 608.2c) → the sentinel the parser maps to target:"thatCreature".
        effectClause = effectClause.replace(/^it /i, "the triggering creature ");
      } else if (cls.scope === "self" && CONNIVE_IT_RE.test(effectClause)) {
        // CONNIVE (BLITZ EK-1, CR 701.50a): "it/he/she connives" on a SELF trigger — the pronoun is the
        // SOURCE (CR 113.7). Same self-scope gate + whole-clause anchor as the EXPLORE branch above.
        effectClause = "this creature connives";
      } else if (NONSELF_TRIGGERING_SCOPES.has(cls.scope) && CONNIVE_IT_RE.test(effectClause)) {
        // CONNIVE non-self (Swordsman, Sharp Scoundrel — "Whenever an equipped creature you control
        // attacks, it connives"): the pronoun is the TRIGGERING creature (CR 608.2c) → the sentinel the
        // parser maps to target:"thatCreature" (the Path-of-Discovery explore pattern verbatim).
        effectClause = "the triggering creature connives";
      } else if (cls.scope === "self" && SUSPECT_IT_LEAD_RE.test(effectClause)) {
        // SUSPECT (BLITZ EK-1, CR 701.60a): a LEADING "suspect it" sentence on a SELF trigger — "it" is
        // the SOURCE (CR 608.2c; at the effect's head no other referent exists). Rewrite ONLY that first
        // sentence → "suspect this creature" (the parser's target:"self" suspect atom); any follow-up
        // sentences (Person of Interest's "Create a 2/2 …") ride along verbatim for the sequence parser.
        effectClause = effectClause.replace(SUSPECT_IT_LEAD_RE, "suspect this creature");
      } else if (cls.scope === "subtypeGlobal" && cls.itsController) {
        // GLOBAL SUBTYPE "its controller" (Synapse/Brood Sliver — "Whenever a Sliver deals combat damage to a
        // player, ITS CONTROLLER may draw / create …"; Essence Sliver — "…its controller GAINS that much life").
        // The beneficiary is the DEALING creature's controller (CR 608.2c — "its controller" refers to the object
        // the ability triggered on), threaded as the pending trigger's `controller` by checkCombatDamageTriggers'
        // beneficiary override. Rewrite the leading "its controller" → "you" so the effect parser models the
        // payoff against that controller (the same draw/create/gain-life atoms the YOU-control forms use). The
        // detector already gated nativeness on this exact "its controller" prefix, so a different beneficiary
        // phrase never reaches this rewrite. VERB AGREEMENT: the may-forms ("its controller may …") need no fix
        // ("may" is invariant → "you may …"), but the bare present-tense "its controller GAINS" would become the
        // ungrammatical "you gains", which the second-person "gain that much life" sentinel can't match — so
        // normalize the leading third-person "gains" → "gain" in the same rewrite (anchored to the exact
        // Essence-shape lead so no other clause is touched).
        effectClause = effectClause.replace(/^its controller gains /i, "you gain ").replace(/^its controller /i, "you ");
      } else if (cls.event === "attacks" && cls.scope === "self"
        && /^(?:it|this creature) doesn't untap during (?:its controller's|your) next untap step$/i.test(effectClause)) {
        // ⭐ SELF NEXT-UNTAP LOCK on attack (CR 302.6) — "Whenever this creature attacks, IT doesn't untap
        // during its controller's next untap step" (Lead Golem, Apes of Rath; Spectral Force / Spectral Bears
        // carry the same line behind an intervening-if and still park). "It" is the SOURCE — a self-scoped
        // attacks trigger has exactly one referent.
        // ⛔ SENTINEL-GATED RATHER THAN MATCHED DIRECTLY, and the reason is a real FP: a bare "it doesn't
        // untap during its controller's next untap step" clause reaching the parser from a SPELL would be an
        // anaphor for the spell's target, and a self-target atom would silently lock the SOURCE instead. The
        // folded tap-and-lock spells are joined by splitClauses so they never arrive bare — but an unfolded
        // wording (a future "Tap target artifact. It doesn't untap…") would, so the gate is the scope, not
        // the sentence. "the source creature" appears in ZERO printed oracle text.
        // ⓘ "your next untap step" is accepted alongside "its controller's": on a SELF attacks trigger the
        // controller IS "you", so the two wordings name the same untap step.
        effectClause = "the source creature doesn't untap during its controller's next untap step";
      } else if (cls.event === "combatDamageToCreature" && cls.tapLockThatCreature) {
        // ⭐ SELF combat-damage TAP-AND-LOCK — the destroy twin's sibling rewrite, and identical in shape:
        // "that creature" is the DAMAGED creature, threaded by checkCombatDamageToCreatureTriggers as the
        // triggering permanent, so the shared "the triggering creature" sentinel binds it. The detector gates
        // on the exact whole-effect text, so no other clause can reach this branch.
        effectClause = "tap the triggering creature and it doesn't untap during its controller's next untap step";
      } else if (cls.event === "combatDamageToCreature" && cls.destroyThatCreature) {
        // Widened from `scope === "subtypeGlobalToCreature"` to the EVENT + flag pair so the SELF twin
        // (Voracious Cobra) shares this rewrite verbatim. "that creature" is the DAMAGED creature in BOTH
        // scopes — the firing site threads it as the triggering permanent either way — so the rewrite is
        // scope-independent by construction. The detectors gate nativeness on the exact "destroy that
        // creature" prefix, so no other effect can reach here.
        // GLOBAL SUBTYPE combat-damage-to-a-creature (Toxin Sliver — "Whenever a Sliver deals combat damage to
        // a creature, destroy THAT creature. It can't be regenerated."). "that creature" is the DAMAGED creature
        // (CR 608.2c — the object the ability triggered on), threaded as the pending trigger's triggering
        // permanent by checkCombatDamageToCreatureTriggers (→ ctx.triggeringPermanentId). Rewrite the leading
        // "destroy that creature" → the canonical "destroy the triggering creature" sentinel so the destroy
        // clause parser binds it to thatCreature (the same path TRIG-PRONOUN sac/bounce use). The trailing "It
        // can't be regenerated." follow-up is appended verbatim above; the parseEffectClause wrapper re-detects
        // CANT_REGEN_TEST on the full oracle and stamps cannotRegenerate on the destroy atom. The detector
        // gated nativeness on this exact "destroy that creature" prefix, so no other effect reaches this rewrite.
        effectClause = effectClause.replace(/^destroy that creature/i, "destroy the triggering creature");
      } else if ((cls.event === "etb" && ETB_ENTERING_CREATURE_SCOPES.has(cls.scope) || cls.event === "attacks" && (cls.scope === "creatureYouControl" || cls.scope === "equippedCreature") || cls.event === "dealtDamage" && cls.scope === "creatureYouControl") && ETB_ENTERING_PRONOUN_RE.test(effectClause)) {
        // (The `dealtDamage`/creatureYouControl arm — Rite of Passage "put a +1/+1 counter on it": on
        // dealtDamage the triggering permanent IS the damaged creature (checkDealtDamageTriggers threads it as
        // triggeringPermanent), the same referent guarantee as the entering creature on etb, so the identical
        // "it" → "the triggering creature" sentinel rewrite is sound.)
        // (The `attacks`/creatureYouControl arm — Reyav "that creature gains double strike until end of
        // turn": on `attacks` the triggering permanent IS the attacker (checkAttackTriggers threads
        // attackerPerm as triggeringPermanent), the same referent guarantee as the entering creature on
        // etb, so the identical sentinel rewrite is sound. Gated to the one scope that needs it.)
        // ===== ETB-ENTERING-PRONOUN ===== an ETB enters-watcher whose effect puts a +1/+1 counter on / pumps
        // the ENTERING creature via "it" / "that creature" (Surrak and Goreclaw — "put a +1/+1 counter on it.
        // It gains haste until end of turn."; The Great Henge — "put a +1/+1 counter on it and draw a card").
        // On `etb` the triggering permanent IS the entering creature for these scopes (checkEnterTriggers, the
        // SAME guarantee SOURCE-STAT below relies on), so "it" = ctx.triggeringPermanentId. Rewrite per-sentence
        // → the sentinel "the triggering creature" the WAVE-3b parser binds to target:"thatCreature" (counter)
        // / pump target:"thatCreature". Gated to the etb event + an entering-creature scope + an actual pronoun
        // clause (a SPELL anaphor / a non-enters trigger never reaches here), CREED-safe. All-or-nothing: any
        // clause the anchored patterns can't rewrite keeps its raw "it" → the parser fails HIGH → body-only.
        effectClause = rewriteEtbEnteringPronoun(effectClause);
      } else if (cls.event === "discarded" && /\bthat player\b/i.test(effectClause)) {
        // ===== DISCARDING-PLAYER SENTINEL ===== "Whenever an opponent discards a card, THAT PLAYER loses 2
        // life" (Liliana's Caress, Raiders' Wake, Fell Specter). "That player" is the one who just discarded
        // — ctx.discardingPlayerId, threaded by checkDiscardTriggers — and NOT the ability's controller, who
        // is the discarder's opponent. Rewrite to the sentinel the life parser binds to who:"discardingPlayer",
        // exactly as the upkeep-player arm does for Seizan's identically-worded clause.
        //
        // ⛔ The bare words "that player" are corpus-AMBIGUOUS — they mean the upkeep player, the damaged
        // player, the milled player or the discarder depending entirely on the event overhead. That is why
        // this is an event-gated rewrite and not a clause matcher, and why triggerRouting pins the resulting
        // referent back to this same event.
        effectClause = effectClause.replace(/\bthat player\b/gi, "the discarding player");
      } else if (cls.scope === "self" && ITS_POWER_LIFEGAIN_RE.test(effectClause)
                 && (cls.event === "dies" || cls.event === "etb")) {
        // ===== "ITS POWER" LIFEGAIN ===== "you gain life equal to its power" — four DIES carriers (Bottle
        // Golems, Willow Geist, Conclave Mentor, Packsong Pup) and the ETB pair (Boulderbranch Golem,
        // Sunscourge Champion). The clause text is BYTE-IDENTICAL across both, but "its" resolves to a
        // different object with a different READ PATH, so the event picks the sentinel:
        //
        //   dies → the creature is GONE by resolution. Its power must come from the CR 603.6e look-back
        //          (ctx.dyingPower, stamped by checkDiesTriggers). A live-board read returns 0 here.
        //   etb  → the creature is ON the battlefield as its own ETB resolves, so the existing triggering-
        //          creature sentinel (→ ctx.triggeringPermanentId, layer-aware) is exactly right.
        //
        // ⛔ THE WHOLE POINT OF THE EVENT GATE: binding one context-free "its power" arm would silently
        // resolve the OTHER half to 0 — the precise forbidden FP templateMatchers.matchDiesGainDrawByPower
        // documents. Five more corpus carriers sit on shapes with yet other referents (Chastise / Infernal
        // Reckoning / Rashida Scalebane = the SPELL's destroyed-or-exiled TARGET; Syr Ginger = the permanent
        // sacrificed to pay a cost; Captain Marvel = an exiled-creature watcher). None reach this rewrite —
        // a spell never carries a trigger descriptor, and the other two fail the event gate — so they stay
        // body-only (SAFE FNs), never mis-bound.
        //
        // scope:"self" is required on BOTH arms: only a trigger about the SOURCE ITSELF makes "its"
        // unambiguous. A hypothetical watcher ("whenever a creature dies, you gain life equal to its power")
        // has no carrier today and stays body-only rather than being guessed at.
        effectClause = cls.event === "dies"
          ? "you gain life equal to the dying creature's power"
          : "you gain life equal to the triggering creature's power";
      } else if (cls.event === "etb" && ETB_ENTERING_CREATURE_SCOPES.has(cls.scope) && STAT_PAYOFF_REF_RE.test(effectClause)) {
        // ===== SOURCE-STAT (DYNAMIC-COUNT keystone) ===== an ETB trigger paying off "that creature's
        // power/toughness" — the ENTERING creature's stat (Terror of the Peaks damage, Verdant Sun's Avatar
        // life). On `etb` the triggering permanent IS the entering creature, so "that creature" is unambiguously
        // ctx.triggeringPermanentId. Rewrite → the sentinel "the triggering creature's <stat>" the damage/life
        // clause parsers map to the shared triggeringPower/triggeringToughness count kind. Gated to the etb event
        // + an entering-creature scope (a SPELL fling's "that creature's power" / a non-etb referent never reaches
        // here), so this only GIVES the parser the chance to model it — the parser still re-gates the whole shape.
        // The replace is verb-anchored (deals damage = / gain life =) so it touches ONLY the payoff stat, never a
        // co-occurring discover-X "that creature's toughness" (Pantlaza keeps its own native exact-match parse).
        effectClause = effectClause.replace(/\b(deals? damage equal to|gain life equal to) that creature's (power|toughness)\b/gi, "$1 the triggering creature's $2");
      } else if (cls.event === "etb" && ETB_ENTERING_CREATURE_SCOPES.has(cls.scope) && /\bdeals? \d+ damage to it\b/i.test(effectClause)) {
        // ===== DAMAGE-RIDER (2026-08-14 — Marauding Raptor) ===== "this creature deals 2 damage to IT.
        // If a Dinosaur is dealt damage this way, this creature gets +2/+0…": on an entering-creature ETB,
        // "it" is unambiguously the ENTERING creature (the same referent logic as the SOURCE-STAT branch
        // above) → "the triggering creature", which the fixed-amount damage arm already binds
        // (target:"thatCreature"). The rider's "a <Subtype> is dealt damage this way" is rewritten to the
        // SENTINEL condition the parser's DAMAGE-RIDER arm + interveningIf's damagedBy predicate read —
        // honest against prevention because the damage path stamps damagedBy only when damage actually
        // landed. Both rewrites are gated to this event+scope; a spell's anaphora never reaches them.
        effectClause = effectClause
          .replace(/\b(deals? \d+ damage) to it\b/gi, "$1 to the triggering creature")
          .replace(/\bif an? ([a-z]+) is dealt damage this way\b/gi, "if the triggering creature is a $1 dealt damage by this source");
      } else if (cls.scope === "self" && /\bon (?:him|her)\b/i.test(effectClause)) {
        // ===== GENDERED SELF-REFERENT (2026-08-14 — Red Hulk "put a +1/+1 counter on HIM … equal to the
        // number of +1/+1 counters on HIM"; Mockingbird "on HER") ===== Marvel legends print him/her where
        // classic templating prints it/this creature. On a scope-SELF trigger the gendered pronoun is
        // unambiguously the SOURCE (the same referent "it" carries on Enrage — CR 603.2), so normalize the
        // OBJECT form to "on this creature" (the counter-put arm's self target AND parseCountSource's
        // plusCountersOnSource both accept it). The SUBJECT form ("he deals …") deliberately has NO
        // rewrite — a mutation proved it dead: every damage arm this can reach takes a WILDCARD source
        // phrase (`^.+? deals?`), so the pronoun subject already parses; an anchored future arm that needs
        // it should add its own rewrite WITH a witness. Every rewritten clause still re-gates through the
        // parsers — a shape they don't model stays LOW (FN-safe).
        effectClause = effectClause.replace(/\bon (?:him|her)\b/gi, "on this creature");
      } else if (cls.event === "attacks" && cls.scope === "anyCreature" && /\bdeals? \d+ damage to it\b/i.test(effectClause)) {
        // ===== ATTACKER DAMAGE-PRONOUN (2026-08-14 — Caltrops "Whenever a creature attacks, this artifact
        // deals 1 damage to IT.") ===== on the anyCreature attacks event "it" is unambiguously the
        // DECLARED ATTACKER — the same sentinel rewrite the entering-creature ETB branch above uses; the
        // TRIG-PRONOUN damage arm binds it to ctx.triggeringPermanentId (target:"thatCreature").
        effectClause = effectClause.replace(/\b(deals? \d+ damage) to it\b/gi, "$1 to the triggering creature");
      } else if (cls.event === "milled" && MILLED_TOKEN_PAYOFF_RE.test(effectClause)) {
        // ===== MILLED "that many" TOKENS (Screeching Scorchbeast, SHELF M1b) ===== the magnitude is the
        // number of milled cards matching THIS trigger's filter (ctx.nonlandMilledCount for a nonland-filtered
        // batch, ctx.milledCount otherwise — both threaded by checkMilledTriggers). Rewrite → the event-specific
        // sentinel so the token parser maps countContext and it never collides with the combat-damage or
        // counters-placed "that many" forms. The "you may" wrapper + the "Do this only once each turn." rider
        // survive untouched (α2 peels the may; the ONCE-PER-TURN wrapper latches create-token).
        effectClause = effectClause.replace(/\bcreate that many\b/i, cls.milledFilter === "nonland" ? "create that many milled-nonland" : "create that many milled");
      } else if (cls.event === "countersPlaced" && COUNTERS_PLACED_PAYOFF_RE.test(effectClause)) {
        // ===== COUNTERS-PLACED "that many" / "that much" ===== a "Whenever you put one or more +1/+1 counters
        // …" trigger's "you may draw that many cards" (Terrasymbiosis) / "you may gain that much life" (Earth
        // Kingdom General) — the magnitude is the NUMBER OF COUNTERS placed in the event (ctx.countersPlaced),
        // NOT a combat-damage amount. Rewrite the bare phrase → an event-specific sentinel the parser maps to
        // countContext:"countersPlaced", so it never collides with the combat-damage "draw that many cards"
        // (which binds combatDamageAmount). Gated to the countersPlaced event + a whole-clause anchor (a rider
        // leaves residue → the sentinel doesn't match → LOW → Arbiter), so this only GIVES the parser the
        // chance to model it; the parser still re-gates the optional/once-per-turn shape. The optional "you may"
        // wrapper survives untouched (it's peeled by the parser's α2 / honored by the once-per-turn gate).
        effectClause = effectClause
          .replace(/\bdraw that many cards\b/i, "draw that many counters-placed cards")
          .replace(/\bgain that much life\b/i, "gain that much counters-placed life");
      } else if (cls.event === "lifegain" && LIFEGAIN_SELF_COUNTER_PAYOFF_RE.test(effectClause)) {
        // ===== LIFEGAIN-SCALED SELF COUNTERS (BLITZ EC-1b — Sunbond / Light of Promise) ===== "Whenever you
        // gain life, put that many +1/+1 counters on this creature." — "that many" = the life just gained
        // (ctx.lifegainAmount, threaded per gain event by checkLifegainTriggers — each gain triggers
        // separately with its own amount, CR 603.2). The raw clause is byte-identical to the ENRAGE payoff
        // (which binds combatDamageAmount), so rewrite → the event-specific sentinel the counter parser maps
        // to countContext:"lifegainAmount"; the referent gate (combatDamageReferentSatisfied) pins it to the
        // lifegain event so no other event/spell can ever read an absent referent (the counters-placed
        // discipline exactly). Whole-clause anchored — a rider leaves residue → no rewrite → LOW → Arbiter.
        effectClause = "put that many lifegain +1/+1 counters on this creature";
      } else if (cls.event === "lifegain" && LIFEGAIN_DRAIN_PAYOFF_RE.test(effectClause)) {
        // ===== DRAIN HALF 1 — LIFEGAIN → OPPONENT LOSS ===== Sanguine Bond / Vito / Enduring Tenacity /
        // Defiant Bloodlord. "that much" = ctx.lifegainAmount, threaded PER GAIN EVENT by
        // checkLifegainTriggers (CR 603.2 — each separate gain is its own event with its own amount, so a
        // 3-life gain drains 3 once, never 1 three times). Rewrite → the event-specific sentinel the
        // cdmgPayoffClauseParser maps to countContext:"lifegainAmount"; combatDamageReferentSatisfied then
        // pins that countContext to the lifegain event, so no other event can read an absent referent and
        // silently drain 0. Whole-clause anchored — a rider leaves residue → no rewrite → LOW → Arbiter.
        effectClause = effectClause.replace(/\bloses that much life\b/i, "loses that much lifegain life");
      } else if (cls.event === "lifeLost" && LIFELOST_GAIN_PAYOFF_RE.test(effectClause)) {
        // ===== DRAIN HALF 2 — OPPONENT LOSS → LIFEGAIN ===== Exquisite Blood / Bloodthirsty Conqueror.
        // "that much" = ctx.lifeLostAmount (checkLifeLossTriggers, fired from the loseLife chokepoint itself
        // — so DAMAGE-caused loss counts too, CR 119.3, which is the whole point of the card). The bare
        // phrase is byte-identical to Essence Sliver's combat-damage payoff, so the rewrite is a RE-POINT,
        // not an unblock: without it the atom carries combatDamageAmount and gains 0 on this event.
        effectClause = "you gain that much life-lost life";
      } else if (cls.event === "milled"
        && String(split.interveningIf || "").toLowerCase().trim() === "this creature is in your graveyard"
        && /^you may return it to your hand$/i.test(effectClause.trim())) {
        // ===== GRAVEYARD-FUNCTIONING milled trigger (Infesting Radroach — SHELF S7; the Bloodghast-class
        // zone shape) ===== "Whenever an opponent mills a nonland card, if this creature is in your
        // graveyard, you may return it to your hand." The intervening-if IS the zone statement (CR 603.3d —
        // the ability functions from the graveyard), so the descriptor is stamped functionsFromGraveyard and
        // checkMilledTriggers' GRAVEYARD scan fires it with the graveyard card as source (sourceCardId on the
        // context; battlefield watchers never carry this descriptor — the same detectTriggers cache serves
        // both scans, the flag routes them). "it" (CR 608.2c) = this card in your graveyard → the kind-tagged
        // marker ONLY selfReturnClauseParser models (graveyard → hand; optional "may" auto-taken — returning
        // your own card is pure upside). The zone check re-evaluates at flush AND resolution (CR 603.4) via
        // interveningIf.js's sourceCardId graveyard scan. EXACT anchors on all three pieces (condition shape
        // already gated to milled; a rider on the return / a different zone wording → unmatched → Arbiter).
        effectClause = "[gy-self-return:hand] return it to your hand";
        cls.functionsFromGraveyard = true;
      } else if (cls.event === "etb"
        && /^you may return this card from your graveyard to the battlefield attached to that creature$/i.test(effectClause.trim())) {
        // ===== GRAVEYARD-FUNCTIONING AURA SELF-RETURN (Dragon Fangs / Scales / Breath / Wings / Shadow, and
        // Smoke Shroud on the subtype scope) ===== "When a creature with mana value 6 or greater enters, you
        // may return this card from your graveyard to the battlefield attached to that creature."
        //
        // ⭐ THIS IS THE AURA-RETURN CASE THAT IS ACTUALLY SAFE, and the distinction is the whole slice.
        // applyMassReanimate deliberately SKIPS Auras because CR 303.4f makes their controller choose a host
        // as they enter, and a non-targeted mass return has no choice mechanism — an Aura entering attached
        // to nothing is a fabricated permanent CR 704.5m would immediately bin. These cards NAME their host:
        // "attached to THAT CREATURE", the one that just entered. Nothing is chosen, so nothing is missing.
        // If the host is gone by resolution the Aura simply stays in the graveyard, which is exactly what
        // CR 303.4g says to do.
        //
        // The rewritten effect carries ctx.sourceCardId (the Aura, stamped by the graveyard scan) and reads
        // ctx.triggeringPermanentId (the entering creature) — both already threaded; see applyGySelfAttachReturn.
        // EXACT anchor: a different destination, a rider, or a host that is not "that creature" (Reins of the
        // Vinesteed's type-matching choice) falls through unmatched → Arbiter, FN-safe.
        effectClause = "[gy-self-attach-return] return it to the battlefield attached to that creature";
        cls.functionsFromGraveyard = true;
      } else if (cls.event === "firstMain"
        && /^you may discard (a|one|two|three|four) cards?\. if you do, return this card from your graveyard to your hand$/i.test(effectClause.trim())) {
        // ===== GRAVEYARD-FUNCTIONING SELF-RETURN WITH A COST (Old One Eye, "Fast Healing") =====
        // "At the beginning of your first main phase, you may discard two cards. If you do, return this card
        // from your graveyard to your hand." Third member of the family after the milled (Radroach) and cast
        // (Eidolon) forms, and the first one that CHARGES for the return.
        //
        // The zone statement is in the effect ("from your graveyard"), same as the Eidolon form, so the same
        // stamp applies. The sentinel carries the COUNT so the cost is charged as printed; downstream it
        // becomes an optional-discard-payment atom whose payoff is the ordinary gy-self-return-hand, which
        // means the pause chaining and the actual move are both code that already existed.
        const n = effectClause.trim().match(/discard (a|one|two|three|four) cards?/i)[1].toLowerCase();
        const count = { a: 1, one: 1, two: 2, three: 3, four: 4 }[n];
        effectClause = `[gy-self-return:hand-discard${count}] discard ${n} cards then return it to your hand`;
        cls.functionsFromGraveyard = true;
      } else if (cls.event === "cast"
        && /^you may return this card from your graveyard to your hand$/i.test(effectClause.trim())) {
        // ===== GRAVEYARD-FUNCTIONING cast trigger (the Eidolon cycle — Enigma / Aurora / Sandstorm /
        // Verdant / Sunscape Eidolon) ===== "Whenever you cast a multicolored spell, you may return this
        // card from your graveyard to your hand."
        //
        // ⭐ THE ZONE STATEMENT IS IN THE EFFECT HERE, NOT IN AN INTERVENING-IF, which is the one real
        // difference from the Radroach branch directly above — "return THIS CARD FROM YOUR GRAVEYARD" says
        // where the ability functions (CR 603.3d) just as plainly as Radroach's "if this creature is in your
        // graveyard" does. Same conclusion, different sentence position, so the same stamp applies and
        // checkCastTriggers' GRAVEYARD scan fires it with the graveyard card as source.
        //
        // The zone RE-CHECK is not lost by having no intervening-if to carry it: applyGySelfReturnHand keys
        // on the exact sourceCardId and no-ops when the card is no longer there (CR 608.2b), so a card that
        // left the graveyard between trigger and resolution returns nothing rather than reappearing from
        // wherever it went.
        //
        // EXACT anchor. A rider on the return, a different destination, or "return it" without the zone
        // (which would NOT state where the ability functions) all fall through unmatched → Arbiter, FN-safe.
        effectClause = "[gy-self-return:hand] return it to your hand";
        cls.functionsFromGraveyard = true;
      }
      } // end if (modalBlock === null) — modal blocks skip the leading-sentence referent rewrites
      // ONCE-PER-TURN TRIGGER ("This ability triggers only once each turn." — Mirelurk Queen, SHELF M1a):
      // this wording limits the TRIGGERING itself (the ability literally does not trigger a second time in
      // a turn), unlike "Do this only once each turn" (an effect-frequency rider owned by the atom latch).
      // Strip the sentence from the payoff and stamp the descriptor — gameEngine.flushTriggers enforces the
      // latch (state.onceTriggersFiredThisTurn, per-source key, cleared each untap step), so the payoff can
      // parse HIGH and the tier claim is runtime-honored. Trailing-sentence anchored: the wording anywhere
      // else (no corpus case) leaves the clause untouched → LOW → Arbiter (CREED).
      // COMPOUND GUARD (MACH-1 — "When … enters AND whenever you gain life, surveil 1. This ability triggers
      // only once each turn."): a compound trigger's two split halves share ONE printed ability and therefore
      // ONE latch, but the splitter leaves the limiter sentence on only the SECOND half's line (the first
      // half would fire un-latched → an over-fire, the forbidden FP). Until the halves share a key, leave a
      // compound-with-limiter card un-stripped → LOW → Arbiter (a SAFE false-negative).
      const compoundLimiter = /\band whenever\b[^\n]*this ability triggers only once each turn/i.test(oracleOf(card));
      let oncePerTurnTrigger = false;
      if (!compoundLimiter && /\bThis ability triggers only once each turn\.?\s*$/i.test(effectClause)) {
        effectClause = effectClause.replace(/\.?\s*This ability triggers only once each turn\.?\s*$/i, "").trim();
        oncePerTurnTrigger = true;
      }
      // BATCHED-ETB SAFETY GATE — a descriptor that demands the once-per-turn rider (the "one or more …
      // with power/mana value N or less enter" carve-out) is only CR-equivalent to its batch semantics
      // BECAUSE the printed rider caps it. Without the rider it would fire once per entering token — the
      // over-fire this family exists to avoid — so the descriptor is DROPPED entirely and the card stays on
      // the Arbiter (a safe false-negative). Checked here because this is where the rider is known.
      if (cls.requiresOncePerTurn && !oncePerTurnTrigger) continue;
      out.push({
        // ONCE-PER-TURN TRIGGER (M1a): flushTriggers drops re-fires within a turn.
        // ⚠️ THE `|| cls.oncePerTurnTrigger` IS LOAD-BEARING, not defensive. The local above is derived ONLY
        // from the printed sentence "This ability triggers only once each turn."; a descriptor whose limiter
        // is baked into the EVENT wording instead ("becomes tapped FOR THE FIRST TIME during each of your
        // turns" — Tale of Katara and Toph) sets the flag on `cls` and had it silently overwritten to false
        // here. Caught by reading the built descriptor rather than the arm's return: detection looked
        // correct and the latch was gone, so the trigger fired on EVERY tap instead of the first — an
        // over-fire, the forbidden direction. A classifier check alone would never have shown it.
        oncePerTurnTrigger: oncePerTurnTrigger || !!cls.oncePerTurnTrigger,
        event: cls.event,
        scope: cls.scope,
        whose: cls.whose,
        spellFilter: cls.spellFilter,         // cast triggers only (undefined otherwise)
        firesOnCopy: cls.firesOnCopy,         // MAGECRAFT COPY HALF (BLITZ MC-1): magecraft's "cast OR copy" descriptor alone carries this; checkCopyTriggers fires ONLY firesOnCopy watchers at a copy site (a plain "whenever you cast" never fires on a copy — CR 707.10)
        castNotFromHand: cls.castNotFromHand, // CAST-FROM-NONHAND (Vega, K1): checkCastTriggers gates on the cast's source zone
        castFromZoneOnly: cls.castFromZoneOnly, // CAST-FROM-EXACT-ZONE (Rivaz): fires ONLY when the cast's threaded source zone equals this. ⚠️ Unlisted here = dropped = the descriptor fires on EVERY matching cast from anywhere — an over-fire, the forbidden direction.
        nth: cls.nth,                         // TRIG-CASTNTH: 1|2|3 ("cast your Nth spell each turn"); else undefined
        firstEachTurn: cls.firstEachTurn,     // FIRST-<KIND>-SPELL-EACH-TURN (CR 603.2, Esper Sentinel): "any"|"noncreature", gating checkCastTriggers on the CASTER's per-turn count. ⚠️ Unlisted here = dropped = the descriptor keeps only its spellFilter and fires on EVERY matching spell — an OVER-FIRE. That is exactly what happened on the first attempt at this slice, and the trigger looked correctly detected while it did.
        permanentFilter: cls.permanentFilter, // PERM-ENTERS: "artifact"|"enchantment" (permanentEnters triggers only)
        enteredTapped: cls.enteredTapped,     // PERM-ENTERS "…enters TAPPED" (Amulet of Vigor) — scopeMatches gates on the entering permanent's live `tapped`. Unlisted here = dropped = fires on EVERY entry, an over-fire.
        subtypeFilter: cls.subtypeFilter,     // SUBTYPE-ETB-SELF + SUBTYPE/outlaw BATCH combat-damage (e.g. "Dinosaur" for Pantlaza; outlaw list for Olivia)
        batchArtifact: cls.batchArtifact,     // SUBTYPE/PROPERTY BATCH combat-damage only — "artifact creatures" (Thopter Spy Network)
        batchEnchantment: cls.batchEnchantment, // SUBTYPE/PROPERTY BATCH combat-damage only — "enchantment creatures"
        batchNontoken: cls.batchNontoken,     // SUBTYPE/PROPERTY BATCH combat-damage only — "(other) nontoken creatures" (Rooftop Bypass)
        batchNotSubtype: cls.batchNotSubtype, // NEGATED-SUBTYPE BATCH combat-damage only — lowercase creature type NOT to match (Keeper of Fables "non-Human"); layer-aware + changeling-aware dealer gate
        batchCommander: cls.batchCommander,   // COMMANDER BATCH combat-damage only (CR 903.3) — gated on the dealer's isCommander stamp, never a subtypeFilter ("Commander" is in no type line)
        batchKeyword: cls.batchKeyword,       // WITH-KEYWORD BATCH combat-damage only (Quartzwood — lowercase keyword; layer-aware dealer gate)
        perDefender: cls.perDefender,         // WITH-KEYWORD BATCH only — fires once per damaged player with that pair's damage total in ctx
        attachedOnly: cls.attachedOnly,       // ATTACHED-ONLY attacks (Reyav) — the triggering attacker must carry ≥1 attachment
        minAttackers: cls.minAttackers,       // BATTALION (CR 702.101a) + "you attack with N or more creatures" — the minimum DECLARED attacker count, gated in checkAttackTriggers' once-per-combat pass. ⚠️ Unlisted here = dropped = the descriptor decays to a bare "whenever you attack" and fires off a SINGLE attacker — an over-fire, and exactly what happened on the first attempt at this slice (the trigger detected as youAttack with minAttackers undefined while looking perfectly correct).
        requireSelfAttacking: cls.requireSelfAttacking, // BATTALION only — "THIS CREATURE and at least two others attack", so the source must be among the declared attackers. Unlisted = dropped = a battalion creature sitting at home triggers off three OTHER attackers, strictly better than printed.
        attacksWhileIf: cls.attacksWhileIf,    // ATTACKS-WHILE (Pugnacious Hammerskull) — the FIRE-TIME-ONLY event condition, evaluated in checkAttackTriggers at declaration (never interveningIf — no resolution re-check). Unlisted = dropped = the self-stun fires with a second Dinosaur out, strictly WORSE than printed for the player, but an over-fire all the same.
        itsController: cls.itsController,      // GLOBAL SUBTYPE combat-damage only ("its controller may …") — beneficiary = dealer's controller
        destroyThatCreature: cls.destroyThatCreature, // GLOBAL SUBTYPE combat-damage-to-CREATURE only (Toxin) — "destroy that creature"
        tapLockThatCreature: cls.tapLockThatCreature, // SELF combat-damage-to-CREATURE tap-and-lock (Kashi-Tribe family) — "tap that creature and it doesn't untap…". ⚠️ Unlisted here = dropped = the rewrite below never fires, the clause stays an unbindable "tap that creature and…" → LOW, and the card silently parks while the detector looks correct.
        nontokenFilter: cls.nontokenFilter,   // NONTOKEN-SUBJECT dies/enters only (Lazotep Sliver) — gate on !card.token
        targeterIsController: cls.targeterIsController, // VALIANT becomesTarget only — "…a spell or ability YOU CONTROL"; checkBecomesTargetTriggers drops the trigger when the targeting stack object's controller isn't the targeted permanent's. ⚠️ Unlisted here = dropped = fires off an OPPONENT'S removal spell too, an over-fire, with the trigger looking correctly detected the whole time.
        requiresCounter: cls.requiresCounter, // COUNTER-PREDICATE dies/attacks scope only (BLITZ CNT-1 — "with a +1/+1 counter on it") — scopeMatches gate reads the triggering creature's live counter bag
        requiresDamagedBySource: cls.requiresDamagedBySource, // DEALT-DAMAGE-BY-ME dies scope only (Sengir Vampire) — scopeMatches gate reads the dead creature's damagedBy look-back. ⚠️ Unlisted here = dropped = the trigger fires on EVERY creature death anywhere, the widest possible over-fire, while still looking correctly detected.
        counterType: cls.counterType,         // COUNTERS-PUT-ON (CR 122.6) — the counter KIND the watcher listens for; checkCounterTriggers fires only on a matching placement
        powerThreshold: cls.powerThreshold,   // POWER-THRESHOLD ETB only (N for "power N or greater")
        keywordFilter: cls.keywordFilter,     // KEYWORD-FILTER ETB only (lowercase keyword for "with <kw>" — Dragon Tempest "flying")
        stateCondition: cls.stateCondition,   // STATE TRIGGER (CR 603.8) — the continuously-checked board condition string, read by checkStateTriggers via the shared interveningIf evaluator
        sacScope: cls.sacScope,               // TRIG-SACRIFICE: "permanent"|"creature"|"artifact" (sacrifice triggers only)
        sacSubtype: cls.sacSubtype,           // TRIG-SACRIFICE SUBTYPE: capitalized subtype (e.g. "Treasure") — type-line scan
        sacAnother: cls.sacAnother,           // TRIG-SACRIFICE: true for "another <subject>" — excludes the source
        onCreate: cls.onCreate,               // TOKEN-CHANGE: responds to a token being created (Mirkwood Bats)
        onSacrifice: cls.onSacrifice,         // TOKEN-CHANGE: responds to a token being sacrificed
        selfReturnKind: cls.selfReturnKind,   // SELF-LTB: "self" (Aura PiG) | "attached" (equipped-creature-dies)
        perCard: cls.perCard,                 // MILL-ON-EVENT: true = per-card ("mills a card"), false = once-per-event ("one or more … are milled")
        milledFilter: cls.milledFilter,       // MILL-ON-EVENT: "nonland" | null (which milled cards count)
        functionsFromGraveyard: cls.functionsFromGraveyard, // GY-FUNCTIONING milled trigger (Radroach) — fired by checkMilledTriggers' graveyard scan, never the battlefield scan
        eachPlayersUpkeep: cls.eachPlayersUpkeep, // EACH-PLAYER'S UPKEEP (BLITZ TR-2): gates the "that player" → "the upkeep player" sentinel rewrite; whose:"any" carries the fire-on-every-upkeep semantics
        eachPlayersDrawStep: cls.eachPlayersDrawStep, // EACH-PLAYER'S DRAW STEP (CR 504.1): the structural twin, sharing that sentinel and its atoms
        enchantedControllersUpkeep: cls.enchantedControllersUpkeep, // ENCHANTED-CONTROLLER'S UPKEEP (2026-08-12): host-controller firing gate + the same sentinel. ⚠️ Unlisted here = dropped = the aura would fire on EVERY upkeep — an over-fire, not a miss.
        duringOpponentsTurn: cls.duringOpponentsTurn, // CAST-NTH's turn-scope rider (2026-08-14, Wavebreak Hippocamp). ⚠️ Unlisted here = dropped = the watcher fires on its controller's OWN turn too — an over-fire (and it WAS dropped for one probe run; this list's warnings mean it).
        duringYourTurn: cls.duringYourTurn,    // GY-LEAVE's turn-scope rider (2026-08-14, Kishla Skimmer) — the mirror of the line above, gated in checkGraveyardEventTriggers. Unlisted = dropped = fires on opponents' turns too, the same over-fire.
        gyCardType: cls.gyCardType,           // GY-EVENT (SHELF S7): front-face type gate on the moved card ("Creature" | null = any)
        gyOwnerScope: cls.gyOwnerScope,       // GY-EVENT: whose graveyard — "you" | "opponent" | "any"
        excludeFromBattlefield: cls.excludeFromBattlefield, // GY-EVENT gyEnter only: skip from-battlefield entries (the dies clause covers those)
        gyFromZone: cls.gyFromZone,           // GY-ENTER-BATCH: the ORIGIN zone the printed trigger names ("library" — Sidisi's mill payoff; absent = "from anywhere"). MUST be listed here or it is silently dropped and the trigger fires on EVERY origin — a live over-fire, not a missed one.
        etbMaxPower: cls.etbMaxPower,         // BATCHED-ETB FILTER: printed power cap ("with power 2 or less" — Welcoming Vampire). Same warning as gyFromZone: unlisted here = silently dropped = the filter never applies.
        etbMaxMv: cls.etbMaxMv,               // BATCHED-ETB FILTER: printed mana-value cap ("with mana value 3 or less" — Tocasia's Welcome).
        etbMinMv: cls.etbMinMv,               // ETB FILTER: printed mana-value FLOOR ("with mana value 6 or greater" — Dragon Fangs). ⚠️ Unlisted here = dropped = the Aura returns on ANY creature entering, which is the whole restriction gone while the trigger still looks correctly detected.
        tokenFilter: cls.tokenFilter,         // "a CREATURE TOKEN you control …" (Curiosity Crafter, Anointer Priest). Unlisted here = silently dropped = the trigger fires on every creature, token or not.
        etbExcludeSelf: cls.etbExcludeSelf,   // "ANOTHER creature you control with power N or greater" (Garruk's Packleader). Unlisted here = silently dropped = the source fires on its OWN entry — a fabricated draw, the over-fire direction.
        optional: /\bmay\b/.test(effectClause.toLowerCase()),
        interveningIf: split.interveningIf,
        // SELF-CAST (CR 603.2): an {X}-cost spell's "When you cast this spell" trigger pays off the cast's X
        // (Hydroid Krasis "gain half X life and draw half X cards"). The effect-clause parsers gate X-amount
        // shapes on hasX (an {X} cost), but the trigger-effect parse sites (triggerRoutesNatively + the flush
        // buildTriggerStack) parse the bare clause with no card context. Stamp effectHasX off the card's printed
        // mana cost so BOTH sites pass hasX:true → the half-X gain/draw clauses parse HIGH. Gated to selfCast so
        // no other trigger's effect parse changes (additive; every other descriptor leaves effectHasX undefined).
        // ETB joined selfCast (2026-08-12 — Triceraton Commander "{X}{X}{W}{W} … When this creature
        // enters, create X 2/2 … tokens"): the entering permanent CARRIES its cast X (enteredPerm.xValue,
        // threaded into the self-ETB context), so an X-shaped ETB effect parses AND resolves honestly —
        // a blinked/uncast re-entry has xValue 0 and the effect does nothing, the CR 601.2b answer.
        effectHasX: (cls.event === "selfCast" || cls.event === "etb") && /\{x\}/i.test(String(card.mana || card.mana_cost || "")),
        // Raw effect text so the flush stage (gameEngine, which can import the parser
        // without the triggers→parser→effectAtoms→triggers cycle) can parse it into a
        // full EffectProgram. P2.8 routes the rich-parsed program through the
        // EFFECT_PROGRAM resolver; `effect` stays the small fallback.
        effectClause,
        sourceText: `${m[1]} ${inner}`,
      });
    }
  }
  // BUSHIDO (subsystem 2) — KEYWORD→TRIGGER synthesis. "Bushido N" is a keyword whose triggered ability
  // lives in REMINDER parens (CR 702.46a — "Whenever this creature blocks or becomes blocked, it gets
  // +N/+N until end of turn."), which the boundary-anchored regex above can't match (a "(" isn't a
  // sentence boundary). Synthesize the descriptor directly off the keyword so it FIRES (checkBlockTriggers
  // fires the combined "blocksOrBecomesBlocked" event for both the blocker and the blocked-attacker role)
  // and coverage counts it (allTriggerSentencesModeled bumps the shaped count for the keyword to match).
  const bushido = oracle.match(/\bbushido (\d+)\b/i);
  if (bushido) {
    const n = parseInt(bushido[1], 10);
    out.push({
      event: "blocksOrBecomesBlocked", scope: "self", whose: "any",
      effect: null, effectClause: `this creature gets +${n}/+${n} until end of turn`,
      optional: false, sourceText: `Bushido ${n}`,
    });
  }
  // AFFLICT (CR 702.131) — KEYWORD→TRIGGER synthesis, the BUSHIDO precedent exactly. "Afflict N" is a keyword
  // whose triggered ability lives in REMINDER parens ("(Whenever this creature becomes blocked, defending
  // player loses N life.)"), which the boundary-anchored When/Whenever/At regex above can't reach (the "("
  // before "Whenever" isn't a sentence boundary). Synthesize the real "becomesBlocked" descriptor off the
  // keyword so the runtime FIRES it (checkBlockTriggers fires the becomesBlocked event for each blocked
  // attacker, threading the defending player) and coverage counts it (allTriggerSentencesModeled bumps the
  // shaped count for the keyword to match). The effectClause is the CANONICAL afflict sentence's effect
  // ("defending player loses N life"), which parseEffectClause maps HIGH to the lose-life atom (who:
  // defendingPlayer) — so triggerRoutesNatively gates it HIGH. UNLIKE rampage the amount is FIXED (N), so this
  // descriptor is the authoritative one (no separate dynamic fire in checkBlockTriggers). scope:"self"/
  // whose:"any" matches the modeled becomes-blocked contract. This also drives the GROUP-GRANT case (Lazotep
  // Sliver "Sliver creatures you control have afflict 2"): grantedTriggersForGroup re-runs detectTriggers on
  // the granted quoted afflict sentence, which the NORMAL grammar detects (the quoted body has no reminder
  // parens) — so the group path never reaches this keyword branch and there's no double-detection.
  // GUARD (CREED — no false self-synthesis): match ONLY the printed KEYWORD form (a bare "Afflict N" line),
  // never a GROUP GRANT ("Sliver creatures you control have afflict N" — Lazotep Sliver, Cyberman Patrol) where
  // the afflict belongs to the GRANTED creatures, not this permanent. Two exclusions, both required:
  //   (a) STRIP REMINDER first — afflict's reminder REPEATS the keyword ("(Whenever a creature with afflict N
  //       becomes blocked, …)"), and that inner "afflict N" is NOT preceded by "have"/"has", so it would defeat
  //       the lookbehind and cause a false self-synthesis on Lazotep/Cyberman. (bushido/rampage reminders don't
  //       repeat their keyword, so they never needed this.)
  //   (b) NEGATIVE-LOOKBEHIND on "have/has " — the grant signature; the printed keyword is always line-initial
  //       or after another keyword (Khenra "Afflict 1", Spellweaver "Prowess\nAfflict 2"), never after "have".
  // The grant form is handled by the static group-grant path (staticAbilityParser → grantedTriggersForGroup),
  // which fires afflict on each RECIPIENT — so it must NOT also self-synthesize here.
  const afflict = oracle.replace(/\([^)]*\)/g, " ").match(/(?<!\bhave\s)(?<!\bhas\s)\bafflict (\d+)\b/i);
  if (afflict) {
    const n = parseInt(afflict[1], 10);
    out.push({
      event: "becomesBlocked", scope: "self", whose: "any",
      effect: null, effectClause: `defending player loses ${n} life`,
      optional: false, sourceText: `Afflict ${n}`,
    });
  }
  // ⭐ INGEST (CR 702.114a) — KEYWORD→TRIGGER synthesis, the same shape as afflict directly above:
  // "Ingest (Whenever this creature deals combat damage to a player, that player exiles the top card of
  // their library.)" The keyword line carries no rules text of its own, so without this the whole Battle
  // for Zendikar processor shell sits on the Arbiter.
  //
  // The synthesized effectClause is the CANONICAL ingest sentence, which the normal grammar now parses to
  // the `exile-top-of-library` atom (who:"damagedPlayer" — the same non-targeted referent the CDMG-MILL
  // twin uses, threaded by checkCombatDamageTriggers).
  //
  // ⛔ REMINDER TEXT IS STRIPPED FIRST, for the reason afflict documents: ingest's reminder REPEATS the
  // canonical sentence, so an unstripped match would synthesize the descriptor AND let the grammar detect
  // the reminder as a second, real trigger — a double fire. `oracle` here is already reminder-stripped by
  // the caller, and the word-boundary anchor keeps "ingest" from matching inside other text.
  // ⭐ CHAMPION (CR 702.71a) — KEYWORD→TRIGGER synthesis, the ingest/afflict shape. "Champion a Kithkin
  // (When this enters, sacrifice it unless you exile another Kithkin you control. When this leaves the
  // battlefield, that card returns to the battlefield.)"
  //
  // ⛔ ONE descriptor, the ENTERS half only. The leaves half is NOT synthesized because
  // applyExileUntilLeaves' `detainedExile` link already makes checkLeavesTriggers return the card on any
  // exit (CR 610.3a) — that IS champion's second sentence. A second descriptor here would return it TWICE,
  // the same trap the two-trigger detain fold documents.
  //
  // The effectClause is a SENTINEL the champion clause parser owns; the printed "sacrifice it unless you
  // exile…" wording is a CHOICE the resolver makes at resolution (pick the weakest eligible, else
  // sacrifice), which no clause grammar models.
  const championKw = oracle.match(/\bchampion an? ([A-Za-z][A-Za-z' -]*?)(?:\s*\(|$|\n)/i);
  if (championKw) {
    const subtype = championKw[1].trim();
    out.push({
      event: "etb", scope: "self", whose: "any",
      effect: null, effectClause: `[champion:${subtype.toLowerCase()}] champion a ${subtype.toLowerCase()}`,
      optional: false, sourceText: `Champion a ${subtype}`,
    });
  }
  if (/\bingest\b/i.test(oracle)) {
    out.push({
      event: "combatDamageToPlayer", scope: "self", whose: "any",
      effect: null, effectClause: "that player exiles the top card of their library",
      optional: false, sourceText: "Ingest",
    });
  }
  // RAMPAGE (subsystem 2) — KEYWORD→TRIGGER synthesis (CR 702.23a — "Whenever this creature becomes blocked,
  // it gets +N/+N until end of turn for each creature blocking it beyond the first."). This descriptor is for
  // COVERAGE/recognition only — a REPRESENTATIVE +N/+N pump that routes natively; the RUNTIME amount is
  // DYNAMIC (N × blockers-beyond-the-first) and is computed + fired in checkBlockTriggers (never via this
  // descriptor / triggersForEvent), so there is no double-fire.
  const rampage = oracle.match(/\brampage (\d+)\b/i);
  if (rampage) {
    const n = parseInt(rampage[1], 10);
    out.push({
      event: "rampage", scope: "self", whose: "any",
      effect: null, effectClause: `this creature gets +${n}/+${n} until end of turn`,
      optional: false, sourceText: `Rampage ${n}`,
    });
  }
  // PER-BLOCKER PUMP (BLITZ RE-1 — Rabid Elephant / Sparring Golem class, the rampage sibling):
  // "Whenever this creature becomes blocked, it gets +N/+M until end of turn for each creature blocking
  // it." The amount is DYNAMIC (N × blockerCount — counting ALL blockers, where rampage counts beyond
  // the first), so like rampage this descriptor is COVERAGE-ONLY: the "perBlockerPump" event has no
  // generic runtime firing site; checkBlockTriggers computes the real amount at fire time and pushes a
  // parsed self-pump directly. The effectClause here is the representative fixed pump so
  // triggerRoutesNatively gates it HIGH honestly (the fire-time clause has the same shape).
  // SELF-subject ONLY ("Whenever THIS CREATURE becomes blocked …"): a group watcher ("Whenever a
  // creature you control / a Beast becomes blocked, IT gets …" — General Marhault Elsdragon, Berserk
  // Murlodont) pumps the BLOCKED creature, not this card — the fire loop reads the attacker's own
  // card, so a group form synthesized here would fire on the WRONG scope (a CREED FP, caught in the
  // OA/RE flip-diff audit). Group forms stay undetected → body-only (safe FN).
  const pbp = oracle.replace(/\([^)]*\)/g, " ").match(/(?:^|[\n.;]\s*)whenever this creature becomes blocked, (?:it|this creature) gets \+(\d+)\/\+(\d+) until end of turn for each creature blocking it\b/i);
  if (pbp) {
    // The SAME printed sentence also detects through the normal When/Whenever path as a becomesBlocked
    // descriptor whose for-each effect parses LOW — evict that twin (this synthesis owns the sentence),
    // else the LOW twin blocks the card while the runtime would fire BOTH (a double pump).
    const twinTail = /for each creature blocking it/i;
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i].event === "becomesBlocked" && twinTail.test(out[i].effectClause || "")) out.splice(i, 1);
    }
    out.push({
      event: "perBlockerPump", scope: "self", whose: "any",
      effect: null, effectClause: `this creature gets +${pbp[1]}/+${pbp[2]} until end of turn`,
      optional: false, sourceText: `becomes blocked per-blocker pump +${pbp[1]}/+${pbp[2]}`,
    });
  }
  // BLOCKS-A-FLYER PUMP (BLITZ BF-1 — Netcaster Spider / Woolly Spider / High-Rise Sawjack / Ezuri's
  // Archers, the reach-wall payoff): "Whenever this creature blocks a creature with flying, it/this
  // creature gets +N/+M until end of turn." The FILTER (the blocked attacker has flying) is unenforceable
  // through the generic blocks event, so like rampage this descriptor is COVERAGE-ONLY — checkBlockTriggers
  // checks the blocked attacker's LIVE flying (layer-aware) per block pair at fire time and pushes the
  // parsed self-pump directly. No twin eviction needed: the filtered-blocks guard already leaves the raw
  // sentence UNDETECTED through the normal path (this synthesis owns it; the shaped count reconciles).
  const bfp = oracle.replace(/\([^)]*\)/g, " ").match(/(?:^|[\n.;]\s*)whenever this creature blocks a creature with flying, (?:it|this creature) gets \+(\d+)\/\+(\d+) until end of turn\b/i);
  if (bfp) {
    out.push({
      event: "blocksFlyerPump", scope: "self", whose: "any",
      effect: null, effectClause: `this creature gets +${bfp[1]}/+${bfp[2]} until end of turn`,
      optional: false, sourceText: `blocks-a-flyer pump +${bfp[1]}/+${bfp[2]}`,
    });
  }
  // CUMULATIVE UPKEEP (CR 702.24) — KEYWORD→TRIGGER synthesis, the BUSHIDO/AFFLICT precedent. "Cumulative upkeep
  // {cost}" is a keyword whose triggered ability lives entirely in REMINDER parens ("(At the beginning of your
  // upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age
  // counter on it.)"), which the boundary-anchored When/Whenever/At regex above can't reach (the "(" isn't a
  // sentence boundary). Synthesize a "your upkeep" descriptor off the keyword so the runtime fires it
  // (checkStepTriggers fires "upkeep" for each of the controller's permanents; whose:"yours" gates it to the
  // controller's own turn — CR 702.24a) and coverage counts it (allTriggerSentencesModeled bumps the shaped
  // count). The effectClause is the SENTINEL "cumulative upkeep {cost}" the parser's matchCumulativeUpkeep maps
  // to the single `cumulative-upkeep` atom (add an age counter → scale the per-counter cost → pay-or-sacrifice),
  // so triggerRoutesNatively gates it HIGH. Match ONLY the printed keyword's brace cost — capture the cost pips
  // right after "cumulative upkeep " (curly-brace group). A {X}/hybrid cost is passed through verbatim; the
  // parser matcher rejects it (→ LOW → the whole card stays on the Arbiter, a SAFE FN). Reminder-stripped first
  // so the parenthetical "…upkeep cost…" text never interferes with the keyword capture.
  const cumUpkeep = oracle.replace(/\([^)]*\)/g, " ").match(/\bcumulative upkeep\s+(\{[^}]+\}(?:\{[^}]+\})*)/i);
  if (cumUpkeep) {
    out.push({
      event: "upkeep", scope: "you", whose: "yours",
      effect: null, effectClause: `cumulative upkeep ${cumUpkeep[1]}`,
      optional: false, sourceText: `Cumulative upkeep ${cumUpkeep[1]}`,
    });
  }
  // ECHO (BLITZ EC-1, CR 702.30) — KEYWORD→TRIGGER synthesis, the cumulative-upkeep precedent exactly. "Echo
  // {cost}"'s triggered ability lives entirely in reminder parens. Synthesize the "your upkeep" descriptor with
  // the "echo {cost}" sentinel (parser.matchEcho → the `echo` pausing atom: a ONE-TIME pay-or-sacrifice at the
  // first of your upkeeps after it entered, echoDone-stamped so later upkeeps no-op — CR 702.30c's single
  // payment). LINE-anchored (the printed keyword line, never a mid-sentence "echo" word); the brace cost is
  // captured verbatim — an {X}/hybrid cost is rejected by the parser matcher (→ LOW → body-only, a SAFE FN).
  const echoKw = oracle.replace(/\([^)]*\)/g, " ").match(/(?:^|[\n.;])\s*echo\s+(\{[^}]+\}(?:\{[^}]+\})*)/i);
  if (echoKw) {
    out.push({
      event: "upkeep", scope: "you", whose: "yours",
      effect: null, effectClause: `echo ${echoKw[1]}`,
      optional: false, sourceText: `Echo ${echoKw[1]}`,
    });
  }
  // FLANKING (BLITZ FL-1, CR 702.25a) — KEYWORD→TRIGGER synthesis, the BF-1 fire-time family: "Whenever a
  // creature without flanking blocks this creature, the blocking creature gets -1/-1 until end of turn."
  // The ability lives in reminder parens; synthesize ONE descriptor PER printed instance (CR 702.25b —
  // "Flanking, flanking" debuffs twice; the structural flankingKeywordCount never counts a grant or the
  // "without flanking" phrase). COVERAGE-ONLY like rampage: checkBlockTriggers checks the block pair at
  // fire time (attacker prints flanking; the BLOCKER lacks it, layer-aware) and fires with the blocker as
  // the triggering permanent — "the triggering creature" resolves the -1/-1 onto the blocker.
  for (let i = flankingKeywordCount(oracle); i > 0; i--) {
    out.push({
      event: "flanking", scope: "self", whose: "any",
      effect: null, effectClause: "the triggering creature gets -1/-1 until end of turn",
      optional: false, sourceText: "Flanking",
    });
  }
  // BATTLE CRY (BLITZ BC-1, CR 702.90a) — KEYWORD→TRIGGER synthesis (the reminder-parens keyword, the
  // bushido precedent): "Whenever this creature attacks, each other attacking creature gets +1/+0 until
  // end of turn." One descriptor PER printed instance (CR 702.90b — multiples stack); the effect is the
  // Trumpet-Blast team pump with excludeSource, fired through the normal attacks event (checkAttackTriggers
  // threads ctx.sourceId, so "each OTHER" drops the crier itself). A grant never self-synthesizes
  // (battleCryKeywordCount — structural).
  for (let i = battleCryKeywordCount(oracle); i > 0; i--) {
    out.push({
      event: "attacks", scope: "self", whose: "any",
      effect: null, effectClause: "each other attacking creature gets +1/+0 until end of turn",
      optional: false, sourceText: "Battle cry",
    });
  }
  // MENTOR (BLITZ MN-1, CR 702.134a) — KEYWORD→TRIGGER synthesis (the reminder-parens keyword, battle cry's
  // attacks-event precedent): "Whenever this creature attacks, put a +1/+1 counter on target attacking creature
  // with lesser power." One descriptor PER printed instance (CR 702.134b — multiples trigger separately). The
  // effectClause parses to the add-counter atom carrying restrictions [combat:"attacking", powerVsSource:"<"] —
  // the DYNAMIC comparison (target power STRICTLY below the source's, layer-aware, CR 702.134a: equal power is
  // NOT lesser), enforced at enumeration by creatureSatisfiesRestrictions (it reads ctx.sourceId's current power
  // and fail-closes when the source is unresolvable → no legal target, never a wrong/illegal pick). A +1/+1
  // counter is own-intent, so the enemy/own flush chooser (chooseTriggerTargets) only ever picks the
  // controller's OWN attacking creature of lesser power; a mentor attacking ALONE has no OTHER attacking
  // creature of lesser power (its own power is not < itself), so the trigger is removed with no legal target
  // (CR 603.3c — it fires nothing). Fired by checkAttackTriggers, which threads the attacker as the source
  // permanent → buildTriggerStack passes ctx.sourceId into the enumerator. A grant ("…and has mentor" — Aegis
  // of the Legion / Nyxborn Unicorn) never self-synthesizes (mentorKeywordCount — structural, CREED).
  for (let i = mentorKeywordCount(oracle); i > 0; i--) {
    out.push({
      event: "attacks", scope: "self", whose: "any",
      effect: null, effectClause: "put a +1/+1 counter on target attacking creature with lesser power",
      optional: false, sourceText: "Mentor",
    });
  }
  // CONTACT DAMAGE (BLITZ IE-1 — Inferno Elemental / Ornery Goblin / Ashmouth Hound: "Whenever this
  // creature blocks or becomes blocked by a creature, this creature deals N damage to that creature.")
  // Fires once PER CREATURE in either role (unlike bushido's once-per-event "blocks or becomes blocked"),
  // so like rampage this descriptor is COVERAGE-ONLY: checkBlockTriggers fires per block PAIR in both
  // directions with the OTHER creature as the triggering permanent; the sentinel effectClause routes the
  // damage through the deal-damage thatCreature referent. The normal When/Whenever path NULLS this
  // condition (the becomes-blocked compound guard), so there is no twin to evict.
  // SENTENCE-END anchored (the audit catch): a trailing rider ("… and 3 damage to that creature's
  // controller" — Assembled Alphas; "… at end of combat" — Sawtooth Ogre) must NOT be silently eaten.
  const ie = oracle.replace(/\([^)]*\)/g, " ").match(/(?:^|[\n.;]\s*)whenever this creature blocks or becomes blocked by a creature, (?:it|this creature) deals (\d+) damage to that creature(?=\s*(?:\.|\n|$))/i);
  if (ie) {
    out.push({
      event: "blocksOrBlockedByCreature", scope: "self", whose: "any",
      effect: null, effectClause: `this creature deals ${ie[1]} damage to the triggering creature`,
      optional: false, sourceText: `blocks-or-blocked contact damage ${ie[1]}`,
    });
  }
  // BASILISK TOUCH (BLITZ DG-1 + BT-2 — Deathgazer kin: "Whenever this creature blocks or becomes
  // blocked by <filter> creature, destroy that creature at end of combat.") The IE-1 contact family
  // with TWO twists enforced at the fire site: the PARTNER filter (BASILISK_FILTERS — nonblack /
  // non-Wall / green-or-white / bare, each read layer-aware) and the CR 511 DELAY (the sentinel routes
  // to the destroy-at-end-of-combat atom, whose resolver enqueues onto state.endOfCombatEffects —
  // combatResolution drains it after the last damage sub-step). Coverage-only descriptor like IE-1
  // (checkBlockTriggers fires per pair, both directions, the OTHER creature as the triggering
  // permanent); the normal When/Whenever path nulls this compound condition, so no twin to evict.
  // The anchored regex + filter table (shared with the fire site) live above checkBlockTriggers.
  const dg = basiliskTouchOf(oracle);
  if (dg) {
    out.push({
      event: "blocksOrBlockedByCreature", scope: "self", whose: "any",
      effect: null, effectClause: "destroy the triggering creature at end of combat",
      optional: false, sourceText: `blocks-or-blocked ${dg.tag} delayed destroy`,
    });
  }
  // BECOMES-BLOCKED-BY-A-CREATURE self-pump (BLITZ CT-1 — Cave Tiger / Rabid Wolverines / Viashino
  // Weaponsmith / Pygmy Troll; Retaliation grants the same line). CR 509.3d: the "by a creature" wording
  // triggers ONCE FOR EACH BLOCKING CREATURE — unlike the bare "becomes blocked" (509.3c, once per
  // combat) — so the event is DISTINCT ("becomesBlockedByCreature") and checkBlockTriggers fires it per
  // block PAIR through triggersForEvent (printed AND granted lines ride — the Retaliation group grant).
  // The effect is the printed self-pump, passed through verbatim (the rampage sentinel vocabulary).
  // SENTENCE-END anchored: a rider ("for each creature blocking it" — the perBlockerPump form, which
  // also lacks "by a creature") never matches (CREED, FN-safe).
  const cbp = oracle.replace(/\([^)]*\)/g, " ").match(/(?:^|[\n.;]\s*)whenever this creature becomes blocked by a creature, (?:it|this creature) gets \+(\d+)\/\+(\d+) until end of turn(?=\s*(?:\.|\n|$))/i);
  if (cbp) {
    out.push({
      event: "becomesBlockedByCreature", scope: "self", whose: "any",
      effect: null, effectClause: `this creature gets +${cbp[1]}/+${cbp[2]} until end of turn`,
      optional: false, sourceText: `becomes-blocked-by-a-creature pump +${cbp[1]}/+${cbp[2]}`,
    });
  }
  // SOULSHIFT (CR 702.46a — BLITZ SS-1) — KEYWORD→TRIGGER synthesis, the CU/BUSHIDO precedent. "Soulshift N"
  // is a keyword whose triggered ability lives entirely in REMINDER parens ("(When this creature dies, you
  // may return target Spirit card with mana value N or less from your graveyard to your hand.)"). Synthesize
  // the dies descriptor with the printed reminder wording as its effectClause — the "you may" rides the α2
  // optional-effect wrapper exactly like printed text (the atom pauses for its yes/no), and the target (a
  // Spirit MV≤N in the CONTROLLER'S OWN graveyard) is own-side for the flush chooser (return-from-graveyard
  // → atomTargetIntent "own"). matchAll: a DOUBLE soulshift (Forked-Branch Garami "Soulshift 4, soulshift 4")
  // synthesizes TWO descriptors — two separate dies triggers, each returning a card (CR 702.46b).
  for (const ss of oracle.replace(/\([^)]*\)/g, " ").matchAll(/\bsoulshift\s+(\d+)\b/gi)) {
    const n = parseInt(ss[1], 10);
    out.push({
      event: "dies", scope: "self", whose: "any",
      effect: null, effectClause: `you may return target spirit card with mana value ${n} or less from your graveyard to your hand`,
      optional: false, sourceText: `Soulshift ${n}`,
    });
  }
  // KW-UNDYING (CR 702.92a, SHELF S7) — KEYWORD→TRIGGER synthesis, the BUSHIDO/AFFLICT precedent. "Undying"
  // is a keyword whose triggered ability lives entirely in REMINDER parens ("(When this creature dies, if it
  // had no +1/+1 counters on it, return it to the battlefield under its owner's control with a +1/+1 counter
  // on it.)"), which the boundary-anchored When/Whenever/At regex above can't reach. Synthesize the SELF-DIES
  // descriptor off the keyword so the runtime fires it (checkDiesTriggers — the Enduring-cycle dies-return
  // pipeline exactly) and coverage counts it (allTriggerSentencesModeled bumps the shaped count via
  // undyingKeywordCount). Three CR-honest pieces ride the existing machinery:
  //   - the intervening-if "it had no +1/+1 counters on it" (CR 603.4 — checked at flush AND resolution)
  //     reads the dying object's LAST-KNOWN counters (CR 603.6e) off ctx.triggeringHadNoPlusCounters, stamped
  //     by checkDiesTriggers from the death look-back's `counters` snapshot — so the loop terminates (the
  //     returned body carries a +1/+1 counter; its NEXT death reads "had counters" → no second return).
  //   - the effectClause is the kind-tagged sentinel ONLY selfReturnClauseParser models → the undying-return
  //     atom (graveyard → battlefield under owner's control + one +1/+1 counter through the doubling
  //     replacement, CR 614.1c/702.92a — Doubling Season doubles it per the official ruling).
  //   - a TOKEN never returns (CR 111.7 — it ceases to exist; guarded in the resolver via
  //     ctx.triggeringCardIsToken, the applySelfReturn precedent).
  // Matched STRUCTURALLY (undyingKeywordCount — a whole comma-segment of a line must be exactly "undying"),
  // so a GRANT ("target creature gains undying" — Undying Evil; Mikaeus) or an old-wording self-NAME ("When
  // Undying Beast dies, …") NEVER self-synthesizes here (CREED — those stay body-only/Arbiter, a safe FN).
  if (undyingKeywordCount(oracle) > 0) {
    out.push({
      event: "dies", scope: "self", whose: "any",
      effect: null,
      effectClause: "[undying] return it to the battlefield under its owner's control with a +1/+1 counter on it",
      interveningIf: "it had no +1/+1 counters on it",
      optional: false, sourceText: "Undying",
    });
  }
  // KW-ENGINES (Aetherdrift, CR 702.179b) — "Start your engines!" synthesizes the self-ETB descriptor
  // that gives its controller speed 1 if they have none (the undying/afterlife synthesis pattern; the
  // [start-your-engines] sentinel is read ONLY by atoms/speed.startEnginesClauseParser). The rest of
  // the keyword — the once-per-your-turn increase on opponent life loss, the max of 4 — is a PLAYER
  // property handled at gameState.loseLife; the "Max speed —" ability gate lives in manaModel.
  // Structural counter: a grant never self-synthesizes (safe FN).
  if (startYourEnginesKeywordCount(oracle) > 0) {
    out.push({
      event: "etb", scope: "self", whose: "any",
      effect: null,
      effectClause: "[start-your-engines] if you have no speed, your speed becomes 1",
      interveningIf: null,
      optional: false, sourceText: "Start your engines!",
    });
  }
  // KW-PERSIST (BLITZ PS-1, CR 702.79a) — undying's -1/-1 MIRROR, synthesized identically: the SELF-DIES
  // descriptor with the "it had no -1/-1 counters on it" intervening-if (LKI off the death snapshot,
  // ctx.triggeringHadNoMinusCounters) and the [persist] sentinel → the persist-return atom (graveyard →
  // battlefield under owner + one -1/-1 counter). The returned body carries the counter, so its next death
  // reads "had counters" → no second return (the loop terminates, CR 702.79a exactly). Structural matcher —
  // a grant ("…gains persist" — Cauldron of Souls) never self-synthesizes (safe FN).
  if (persistKeywordCount(oracle) > 0) {
    out.push({
      event: "dies", scope: "self", whose: "any",
      effect: null,
      effectClause: "[persist] return it to the battlefield under its owner's control with a -1/-1 counter on it",
      interveningIf: "it had no -1/-1 counters on it",
      optional: false, sourceText: "Persist",
    });
  }
  // AFTERLIFE (BLITZ AF-2, CR 702.135a) — KEYWORD→TRIGGER synthesis, the UNDYING/PERSIST precedent: the
  // keyword's dies-trigger lives entirely in REMINDER parens ("(When this creature dies, create N 1/1 white
  // and black Spirit creature tokens with flying.)"), which the boundary-anchored When/Whenever/At regex can't
  // reach. Synthesize the SELF-DIES descriptor whose effectClause is the reminder's create-token wording — it
  // parses to the existing create-token atom (colors + subtype + flying + count all modeled), no new effect
  // vocabulary. The count is emitted in DIGIT form for N>1 (the token regex's `\d+` alternation accepts ANY N,
  // where the word alternation stops at "five") so EVERY printed value parses HIGH and routes — required because
  // the "afterlife" COVERED_KEYWORDS entry makes a keyword-only carrier read native via isKeywordOnly WITHOUT
  // re-checking trigger routing: a skipped/unparseable N would be a claimed-native card whose death mints NOTHING
  // (a forbidden FP). Fired by the normal dies flush; the tokens enter under the DEAD creature's controller
  // (makePendingTrigger's controller = the death look-back's controller — CR 702.135a "its controller creates").
  // One descriptor PER printed instance (CR 702.135b). afterlifeKeywordValues is STRUCTURAL (a whole comma-segment
  // must be exactly "afterlife N"), so a GRANT ("creatures you control gain afterlife 1 until end of turn" —
  // Afterlife Insurance; "…has afterlife 1" — Indebted Spirit's enchanted line) never self-synthesizes (CREED).
  for (const n of afterlifeKeywordValues(oracle)) {
    out.push({
      event: "dies", scope: "self", whose: "any",
      effect: null,
      effectClause: `create ${n === 1 ? "a" : String(n)} 1/1 white and black Spirit creature token${n === 1 ? "" : "s"} with flying`,
      optional: false, sourceText: `Afterlife ${n}`,
    });
  }
  // MODULAR (BLITZ MOD-1, CR 702.43a) — KEYWORD→TRIGGER synthesis, the SOULSHIFT precedent exactly (a "you may"
  // dies payoff whose ability lives entirely in REMINDER parens: "(This creature enters with N +1/+1 counters
  // on it. When it dies, you may put its +1/+1 counters on target artifact creature.)"). The ENTERS half is a
  // replacement modeled by resolvers.enterPermanent (reads the SAME modularKeywordValues); THIS synthesizes the
  // DIES half. The effectClause is the printed reminder wording — the leading "you may" rides the α2 optional
  // wrapper (the atom pauses for a yes/no, CR 702.43a "you may"), and the inner "put its +1/+1 counters on
  // target artifact creature" parses to the add-counter atom carrying countContext:"triggeringPlusCounterCount"
  // (the DYING creature's last-known +1/+1 total, CR 603.6e LKI — stamped by checkDiesTriggers, so a creature
  // that grew via added counters — Arcbound Ravager's sac — moves ALL of them) + restriction cardType:"artifact"
  // (the target must be an artifact creature, enforced at enumeration by creatureSatisfiesRestrictions). A +1/+1
  // counter is own-intent (atomTargetIntent → "own"), so the flush chooser only ever picks the controller's OWN
  // artifact creature; with no own artifact-creature target the "you may" simply declines (CR 603.3c drop). One
  // descriptor PER printed instance (CR 702.43b — each modular works separately). modularKeywordValues is
  // STRUCTURAL/DIGIT-only, so "Modular—Sunburst" and "Poison Modular N" never self-synthesize (their differing
  // effects would be dropped-rider FPs) — they stay body-only/Arbiter (CREED, a safe FN).
  for (const n of modularKeywordValues(oracle)) {
    out.push({
      event: "dies", scope: "self", whose: "any",
      effect: null,
      effectClause: "you may put its +1/+1 counters on target artifact creature",
      optional: false, sourceText: `Modular ${n}`,
    });
  }
  // KW-EVOLVE (CR 702.100a, SHELF S7) — KEYWORD→TRIGGER synthesis, the UNDYING precedent exactly. "Evolve"
  // is a keyword whose triggered ability lives entirely in REMINDER parens ("(Whenever a creature you
  // control enters, if that creature has greater power or toughness than this creature, put a +1/+1
  // counter on this creature.)"), unreachable by the boundary-anchored trigger regex. Synthesize the
  // creature-you-control ETB descriptor: checkEnterTriggers fires it (the source's OWN entry included —
  // CR-faithful: comparing itself to itself is never greater, so it correctly never evolves off itself);
  // the comparative intervening-if (LAYER-AWARE P/T of the entering creature vs the source, re-read at
  // flush AND resolution per CR 603.4 / 702.100d) is enforced by interveningIf.js; the effectClause is the
  // kind-tagged sentinel ONLY evolveCounterSelfClauseParser models → the evolve-counter-self atom places
  // the +1/+1 counter through the standard doubling/watcher path AND fires the "this creature evolves"
  // watchers (CR 702.100f — a creature evolves exactly when the evolve ability's counter is placed).
  if (evolveKeywordCount(oracle) > 0) {
    out.push({
      event: "etb", scope: "creatureYouControl", whose: "any",
      effect: null,
      effectClause: "[evolve] put a +1/+1 counter on this creature",
      interveningIf: "that creature has greater power or toughness than this creature",
      optional: false, sourceText: "Evolve",
    });
  }
  // KW-RENOWN (CR 702.111, census slice 2026-07-25) — the SAME keyword→trigger synthesis as evolve above.
  // "Renown N (When this creature deals combat damage to a player, if it isn't renowned, put N +1/+1
  // counters on it and it becomes renowned.)" — the ability lives entirely in reminder parens, unreachable
  // by the boundary-anchored trigger regex. The "isn't renowned" gate is a LATCH, not a board query, so it
  // is NOT expressed as an intervening-if (interveningIf.js has no per-permanent renown vocabulary and a
  // fail-open there would re-renown every combat): the latch lives INSIDE the atom, exactly like
  // monstrosity's `monstrous` flag, which is the same shape (check flag → counters → set flag).
  {
    const renownN = renownKeywordValue(oracle);
    if (renownN > 0) {
      out.push({
        event: "combatDamageToPlayer", scope: "self", whose: "any",
        effect: null,
        effectClause: `[renown] put ${renownN} +1/+1 counters on this creature`,
        interveningIf: null,
        optional: false, sourceText: `Renown ${renownN}`,
      });
    }
  }
  // KW-BACKUP (CR 702.166) — synthesized from the printed keyword like renown/mobilize. The effectClause is
  // ORDINARY MODELED TEXT, not a kind-tagged sentinel: "put N +1/+1 counters on this creature" already parses
  // HIGH to the existing self-scoped add-counter atom, so this keyword needs no new resolver and inherits a
  // runtime path that is already proven. See backupKeywordValue for why the SELF target is the modeled line.
  {
    const backupN = backupKeywordValue(oracle);
    if (backupN > 0) {
      out.push({
        event: "etb", scope: "self", whose: "any",
        effect: null,
        effectClause: `put ${backupN} +1/+1 counters on this creature`,
        interveningIf: null,
        optional: false, sourceText: `Backup ${backupN}`,
      });
    }
  }
  // KW-PARTNER-WITH (CR 702.124j) — synthesized from the printed keyword like backup above, with an ORDINARY
  // modeled effectClause rather than a kind-tagged sentinel: the clause is the CR's own wording, and the arm
  // that recognizes it (atoms/library.js `ptm`) is a general named-card tutor, so a card that ever PRINTS this
  // sentence in full gets the same correct model instead of a second private path.
  //
  // The "may" is REAL and belongs to the TARGET, not the controller (702.124j: "target player MAY search"),
  // which is why the atom carries optionalDeciderIsTarget — see the note on that flag in effects/runProgram.js.
  // scope "self" on the etb event; the target is allocated by the ordinary targetType:"player" machinery.
  {
    const partnerName = partnerWithName(oracle);
    if (partnerName) {
      out.push({
        event: "etb", scope: "self", whose: "any",
        effect: null,
        effectClause: `target player may search their library for a card named ${partnerName}, reveal it, put it into their hand, then shuffle`,
        interveningIf: null,
        optional: false, sourceText: `Partner with ${partnerName}`,
      });
    }
  }
  // KW-MOBILIZE (CR 702.174) — the printed keyword's ability is entirely inside reminder parens, so it is
  // synthesized here exactly like renown above. The effect is a kind-tagged sentinel only one clause parser
  // models, so no printed text can route into it. Scoped SELF on the attacks event, which is what threads
  // ctx.defenderId — the minted tokens must join the SAME combat against the SAME defender, and without
  // that referent they would be inert (see the dead-field warning in atoms/tokens.js).
  {
    const mobilizeN = mobilizeKeywordValue(oracle);
    if (mobilizeN > 0) {
      out.push({
        event: "attacks", scope: "self", whose: "any",
        effect: null,
        effectClause: `[mobilize] create ${mobilizeN} tapped attacking warrior tokens`,
        interveningIf: null,
        optional: false, sourceText: `Mobilize ${mobilizeN}`,
      });
    }
  }
  // KW-DETHRONE (CR 702.104a, census slice 46) — "Whenever this creature attacks the player with the most
  // life or tied for most life, put a +1/+1 counter on it." Synthesized from the printed keyword like renown
  // / firebending, with an ORDINARY modeled effectClause (the self-scoped add-counter atom, backup's
  // precedent) so no new resolver is needed.
  //
  // HONEST NOTE ON THE TIMING. In the printed rule the life comparison is part of the trigger EVENT, so it
  // is checked once, at declaration. Expressed here as an intervening-if, it is checked at declaration AND
  // re-checked on resolution (CR 603.4). The divergence only shows if the attacked player's life changes in
  // response to the trigger, and it can only ever REMOVE a counter that should have been placed — never add
  // one that shouldn't. A false negative, which the creed permits; the false-positive direction would not
  // have been acceptable, and this lane cannot produce it.
  if (hasDethrone(oracle)) {
    out.push({
      event: "attacks", scope: "self", whose: "any",
      effect: null,
      effectClause: "put a +1/+1 counter on this creature",
      interveningIf: "that player has the most life or is tied for most life",
      optional: false, sourceText: "Dethrone",
    });
  }
  // KW-TRAINING (CR 702.148a, census slice 52) — "Whenever this creature attacks with another creature with
  // greater power, put a +1/+1 counter on this creature." Same synthesis shape as dethrone: an ordinary
  // modeled effectClause plus a condition. The condition compares against the OTHER ATTACKERS, not the
  // board, so a bigger creature staying home trains nothing.
  //
  // Same honest timing note as dethrone: printed, the comparison belongs to the trigger EVENT; here it is an
  // intervening-if, so it is re-checked on resolution (CR 603.4). It can only ever REMOVE a counter that
  // should have been placed — a false negative, which the creed permits.
  if (hasTraining(oracle)) {
    out.push({
      event: "attacks", scope: "self", whose: "any",
      effect: null,
      effectClause: "put a +1/+1 counter on this creature",
      interveningIf: "another attacking creature has greater power",
      optional: false, sourceText: "Training",
    });
  }
  // KW-FIREBENDING (census slice 41) — synthesized from the printed keyword like renown / mobilize / backup.
  // Following BACKUP's precedent the effectClause is ORDINARY MODELED TEXT, not a kind-tagged sentinel: the
  // sentence it emits is the one actually printed inside the reminder, and misc.js parses it to the add-mana
  // atom with the end-of-combat hold. That means the same lane also credits any non-keyword card printing the
  // same sentence, instead of a sentinel only this keyword can reach.
  {
    const firebendingN = firebendingKeywordValue(oracle);
    if (firebendingN > 0) {
      out.push({
        event: "attacks", scope: "self", whose: "any",
        effect: null,
        effectClause: `add ${"{R}".repeat(firebendingN)}. this mana lasts until end of combat`,
        interveningIf: null,
        optional: false, sourceText: `Firebending ${firebendingN}`,
      });
    }
  }
  // SAGA CHAPTERS (CR 714 — Vault 12, SHELF S7): a Saga's numbered chapters are triggered abilities that
  // fire as the lore count crosses each number. Synthesize ONE descriptor per chapter (the keyword-synthesis
  // precedent) — coverage and the runtime read the SAME parse: classifyCard requires every chapter to route
  // natively; checkSagaChapterTriggers fires exactly the crossed range (transitions only, CR 714.3 — a
  // chapter can never re-fire). parseSagaChapters is all-or-nothing (any non-chapter residue → null → no
  // descriptors → body-only), so a partially-modeled Saga never half-fires.
  {
    const sagaParse = parseSagaChapters(card);
    if (sagaParse) {
      for (const ch of sagaParse.chapters) {
        out.push({
          event: "sagaChapter", chapter: ch.n, scope: "self", whose: "any",
          effect: null, effectClause: ch.effect.replace(/\.\s*$/, ""),
          optional: /\byou may\b/i.test(ch.effect), sourceText: `Chapter ${ch.n}`,
        });
      }
    }
  }
  // STORM (CR 702.40) — KEYWORD→TRIGGER synthesis. "Storm" is a keyword whose triggered ability lives in
  // REMINDER parens ("(When you cast this spell, copy it for each spell cast before it this turn. …)"), which
  // the boundary-anchored When/Whenever/At regex above can't match (the "(" before "When" isn't a sentence
  // boundary) — the BUSHIDO/RAMPAGE precedent. Synthesize a SELF-CAST descriptor off the keyword so the runtime
  // fires it (checkCastTriggers' self-cast block, threading the storm count + spell snapshot into context) and
  // coverage counts it (allTriggerSentencesModeled bumps the shaped count for the keyword to match). The
  // effectClause is the synthetic sentinel the copySpellClauseParser maps to the non-targeted `copy-spell` atom,
  // so triggerRoutesNatively gates it HIGH + non-targeted. Anchored on the keyword's reminder signature (the
  // canonical CR 702.40a text) — robust against a card merely NAMED "…Storm" (Crow Storm, Storm of Memories),
  // which carries the SAME reminder line and so is correctly detected too (its body coverage is judged
  // separately). `stormCopy:true` is a marker the cast-path threading keys on. scope:"self"/whose:"you" matches
  // the existing self-cast contract (the spell is always on the stack under the caster).
  if (/\bcopy it for each spell cast before it this turn\b/i.test(oracle)) {
    out.push({
      event: "selfCast", scope: "self", whose: "you", stormCopy: true,
      effect: null, effectClause: "copy this spell for each spell cast before it this turn",
      optional: false, sourceText: "Storm",
    });
  }
  // CASCADE (CR 702.85) — KEYWORD→TRIGGER synthesis, the STORM precedent exactly. "Cascade" is a keyword whose
  // triggered ability lives in REMINDER parens ("(When you cast this spell, exile cards from the top of your
  // library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put
  // the exiled cards on the bottom in a random order.)"), so the boundary-anchored When/Whenever/At regex above
  // can't reach it (the "(" before "When" isn't a sentence boundary). Synthesize a SELF-CAST descriptor off the
  // keyword's CANONICAL reminder signature (CR 702.85a) so the runtime fires it (checkCastTriggers' self-cast
  // block, threading the cascading spell's mana value into context.cascadeSpellMv) and coverage counts it
  // (allTriggerSentencesModeled bumps the shaped count for the keyword). The effectClause is the synthetic
  // sentinel cascadeClauseParser maps to the non-targeted `cascade` atom, so triggerRoutesNatively gates it
  // HIGH + non-targeted. `cascade:true` is the marker the cast-path threading keys on; scope:"self"/whose:"you"
  // matches the existing self-cast contract (the spell is always on the stack under the caster).
  //
  // MULTI-INSTANCE cascade (CR 702.85, reminder — "Multiple instances of cascade each trigger separately"). A
  // "Cascade, cascade, cascade, cascade" (Apex Devastator, N=4) / "Cascade, cascade" (Maelstrom Wanderer, N=2)
  // card carries N stacked instances of the keyword; each triggers SEPARATELY and digs INDEPENDENTLY, every dig
  // capping at the SAME cascading spell's mana value (ctx.cascadeSpellMv, snapshotted once at cast). Emit ONE
  // selfCast cascade descriptor PER instance — checkCastTriggers pushes them all above the spell, and the
  // pendingCascade action gate resolves them one at a time (each dig → its own cast-free/decline decision → the
  // next dig), which is exactly N independent cascades, never a partial. cascadeInstanceCount matches the run of
  // comma-separated "cascade" keyword tokens IMMEDIATELY preceding the canonical reminder, so it counts ONLY the
  // stacked keyword, not a "cascade" that appears in a GRANT sentence: a GRANT — "the next/first spell you cast …
  // has cascade" (The First Sliver, Imoti, Maelstrom Nexus) — has its own single Cascade line whose reminder says
  // "When you cast THIS spell", and its grant "have cascade" is NOT followed by that reminder, so N stays 1 (its
  // own cascade) and the grant's coverage is judged separately. The keyword can sit on a creature, an
  // instant/sorcery, an artifact, or an enchantment.
  if (/\bwhen you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less\b/i.test(oracle)) {
    const n = cascadeInstanceCount(oracle) || 1; // ≥1 guaranteed by the reminder signature above; default defensively
    for (let i = 0; i < n; i++) {
      out.push({
        event: "selfCast", scope: "self", whose: "you", cascade: true,
        effect: null, effectClause: "cascade through your library",
        optional: false, sourceText: "Cascade",
      });
    }
  }
  // KW-RAVENOUS (Edge of Eternities / Warhammer 40k) — KEYWORD→TRIGGER synthesis, the CASCADE/CUMULATIVE-UPKEEP
  // precedent. "Ravenous" is a keyword whose ability lives entirely in REMINDER parens ("Ravenous (This creature
  // enters with X +1/+1 counters on it. If X is 5 or more, draw a card when it enters.)"). It has TWO halves:
  //   (1) enters-with-X +1/+1 counters — a REPLACEMENT (not a trigger), modeled by staticAbilityParser
  //       .entersWithXCounters (which now recognizes the reminder form) + resolvers.enterPermanent (opts.xValue
  //       → the counters). NOT synthesized here — it's not a triggered ability.
  //   (2) "If X is 5 or more, draw a card when it enters" — a genuine ETB triggered ability GATED on X≥5.
  //       Synthesize a self ETB descriptor for it. The effectClause is the bare "draw a card" (parses HIGH to
  //       the draw atom, non-targeted → triggerRoutesNatively HIGH); the intervening-if "x is 5 or more" is
  //       evaluated by interveningIf.js against ctx.xValue (checkEnterTriggers threads enteredPerm.xValue into
  //       the self-ETB context — CR 608.2h). effectHasX:true so the parse sites treat the {X} card as X-bearing.
  // The boundary-anchored When/Whenever/At regex above can't reach either half (the "(" isn't a sentence
  // boundary, and "draw a card when it enters" isn't a When-led sentence), so synthesizing here is required.
  // allTriggerSentencesModeled bumps the shaped count by 1 for the keyword (ravenousTriggerCount) so
  // shaped === detected holds. Anchored on the canonical Ravenous reminder signature so a card merely NAMED
  // "Ravenous …" (Ravenous Rats, Ravenous Chupacabra) without the keyword+reminder is untouched.
  if (/\bravenous\b\s*\(this creature enters with x \+1\/\+1 counters? on it\. if x is (\d+) or more, draw a card when it enters\.?\)/i.test(oracleOf(card))) {
    const thresh = oracleOf(card).match(/if x is (\d+) or more, draw a card when it enters/i);
    out.push({
      event: "etb", scope: "self", whose: "any",
      effect: null, effectClause: "draw a card",
      interveningIf: `x is ${thresh[1]} or more`,
      effectHasX: true,
      optional: false, sourceText: "Ravenous",
    });
  }
  _detectCache.set(card, out);
  return out;
}

/**
 * RAVENOUS (Edge of Eternities / Warhammer 40k) — the count of synthesized Ravenous ETB draw triggers on a
 * card (0 or 1). The keyword's "If X is 5 or more, draw a card when it enters" half is a triggered ability
 * that lives in REMINDER parens (never a When/Whenever/At sentence), so it's absent from the shaped-sentence
 * count in coverage.allTriggerSentencesModeled — this bumps that count so shaped === detected holds, exactly
 * like cascadeInstanceCount does for the cascade keyword. Anchored on the canonical Ravenous reminder.
 */
export function ravenousTriggerCount(oracle) {
  return /\bravenous\b\s*\(this creature enters with x \+1\/\+1 counters? on it\. if x is \d+ or more, draw a card when it enters\.?\)/i.test(String(oracle || "")) ? 1 : 0;
}

/** Convenience: does this card have any trigger for the given event? */
export function hasTriggerFor(card, event) {
  return detectTriggers(card).some(d => d.event === event);
}

// ─── Matching ──────────────────────────────────────────────────────────────────

function scopeMatches(descriptor, sourcePermanent, triggeringPermanent, state) {
  // NONTOKEN-SUBJECT gate (wave3b, CR 111.1) — "a nontoken creature/<Subtype> you control dies/enters"
  // (Lazotep Sliver, Remembrance, Guardian Project). The "nontoken" qualifier EXCLUDES token permanents:
  // a token of the matching kind triggering must NOT fire. A created token's card carries `token: true`
  // (tokenFactory / amass / resolvers convention); a real card has no such flag. This gate runs BEFORE the
  // scope switch so it composes with whichever scope (creatureYouControl / subtypeYouControl) the descriptor
  // chose. Load-bearing FP guard: without it Lazotep's OWN amass-minted Sliver Army token (a Sliver, so the
  // subtypeYouControl scope would match it) dying would re-fire its amass — a confident wrong fire.
  if (descriptor.nontokenFilter && triggeringPermanent?.card?.token) return false;
  // TOKEN filter — the exact mirror, and separate from nontokenFilter on purpose: a descriptor with NEITHER
  // flag must keep firing on both kinds, so this cannot be one boolean.
  if (descriptor.tokenFilter && !triggeringPermanent?.card?.token) return false;
  // ENTERED-TAPPED gate (Amulet of Vigor "whenever a permanent you control enters TAPPED"). Read off the
  // entering permanent's LIVE tapped state, which is why the fire site's ORDER is load-bearing: every path
  // that can make a permanent enter tapped (the play-land path's tapped-land rule, resolvers' enters-tapped
  // riders) must set `tapped` BEFORE calling checkPermanentEntersTriggers. It does — verified on the land
  // path, which is Amulet's signature use. A permanent that entered untapped simply doesn't match; no
  // descriptor without this flag is affected, same shape as nontokenFilter/tokenFilter above.
  if (descriptor.enteredTapped && !triggeringPermanent?.tapped) return false;
  // BATCHED-ETB CHARACTERISTIC gate (Welcoming Vampire "with power 2 or less"; Tocasia's Welcome "with mana
  // value 3 or less"). Runs BEFORE the scope switch so it composes with whichever controller scope the
  // descriptor chose, exactly like nontokenFilter above.
  //
  // Read off the entering permanent's card, not the layer-derived board value: these fire AS the permanent
  // enters, and the printed characteristics are what the filter names. `?? 0` for a missing power keeps a
  // non-creature entry from passing a "power 2 or less" gate by accident on undefined comparison.
  // Load-bearing: without this the trigger fires for ANY entering creature — a confident wrong fire on every
  // big creature, and invisible in the tier because the card would still classify native.
  if (descriptor.etbMaxPower != null && !(Number(triggeringPermanent?.card?.power ?? 0) <= descriptor.etbMaxPower)) return false;
  if (descriptor.etbMaxMv != null && !((triggeringPermanent?.card?.cmc ?? 0) <= descriptor.etbMaxMv)) return false;
  // The MIRROR of the cap directly above — "a creature with mana value N OR GREATER enters" (the Dragon
  // Fangs cycle). ⚠️ THE `?? 0` DEFAULT FLIPS MEANING BETWEEN THE TWO: on the cap it is safe (an unknown MV
  // reads 0 and passes a "3 or less" gate, which is the permissive direction for a card that has no cmc),
  // but on a FLOOR an unknown MV reading 0 FAILS the gate — which is the direction the creed wants, since
  // firing on a creature whose mana value we cannot read would be a guess. Same expression, opposite
  // safety, and that asymmetry is the reason this is a separate line rather than a shared helper.
  if (descriptor.etbMinMv != null && !((triggeringPermanent?.card?.cmc ?? 0) >= descriptor.etbMinMv)) return false;
  // ATTACHED-ONLY gate (Reyav — "a creature you control that's enchanted or equipped attacks"): the
  // triggering creature must carry ≥1 attachment (attachments are only ever Auras/Equipment here, so the
  // or-form reduces to a length check). Runs BEFORE the scope switch so it composes with the scope the
  // descriptor chose, like nontokenFilter. An un-attached attacker must NOT fire (the restriction the old
  // non-anchored subject match silently dropped).
  if (descriptor.attachedOnly && !(Array.isArray(triggeringPermanent?.attachments) && triggeringPermanent.attachments.length > 0)) return false;
  // COUNTER-PREDICATE gate (BLITZ CNT-1, CR 122.1) — "a creature you control WITH A +1/+1 COUNTER ON IT
  // dies/attacks": the triggering creature must currently carry ≥1 of the named counter, read off its LIVE
  // counter bag (the attacker on-battlefield; the dead creature's CR-603.10a look-back `counters` snapshot,
  // threaded onto the dies look-back by checkDiesTriggers). Runs BEFORE the scope switch so it composes with
  // the creatureYouControl controller scope (mirrors nontokenFilter/attachedOnly). A triggering permanent
  // with 0 of the counter must NOT fire (the restriction the reject would otherwise drop).
  if (descriptor.requiresCounter && !((triggeringPermanent?.counters?.[descriptor.requiresCounter] || 0) > 0)) return false;
  // DEALT-DAMAGE-BY-ME gate — the dying creature must carry THIS source's id in its damagedBy look-back.
  // Fails CLOSED: a look-back with no snapshot (an unmodeled death path) reads [] and the trigger drops,
  // which is a false negative and permitted. Firing on an unproven "it probably hit that one" would be a
  // false positive, which is not — and on this family the payoff is a permanent +1/+1 counter, so a wrong
  // fire would compound for the rest of the game rather than wash out.
  if (descriptor.requiresDamagedBySource && !(triggeringPermanent?.damagedBy || []).includes(sourcePermanent?.id)) return false;
  switch (descriptor.scope) {
    case "self":
      return !triggeringPermanent || triggeringPermanent.id === sourcePermanent.id;
    // ⭐ BLOCKS-A-CREATURE — the ONE scope where source and triggering permanent are deliberately DIFFERENT
    // objects: the source is the blocker whose card prints the ability, the triggering permanent is the
    // attacker it blocked (the "that creature" referent, CR 608.2c). The pairing is established by the fire
    // site (checkBlockTriggers walks real block pairs), so the only thing to assert here is that a triggering
    // permanent was threaded at all — a bare fire with none would otherwise bind the referent to nothing and
    // the effect would silently no-op while the card read native.
    case "blocksCreature":
      return !!triggeringPermanent;
    // ANY-CREATURE (Caltrops' "a creature attacks") — every fire site that emits this scope threads a
    // DECLARED ATTACKER as the triggering permanent (a creature by CR 508.1a), so like blocksCreature the
    // only assertion left is that one was threaded at all; the controller is deliberately unconstrained.
    case "anyCreature":
      return !!triggeringPermanent;
    case "equippedCreature":
      // EQUIP (WAVE 4) — the source is the EQUIPMENT; the trigger fires ONLY when the triggering permanent IS
      // this equipment's host. TWO linkages, unified (both Wave-4 equippedCreature descriptors share this scope):
      //   (a) EQUIP-RIDER (attack / combat-damage): while ATTACHED the host is sourcePermanent.attachedTo.
      //   (b) SELF-LTB equipped-creature-dies-return (Sword of the Realms): on the host's DEATH the equipment is
      //       ALREADY detached (attachedTo null by the time checkDiesTriggers runs), so the linkage is read from
      //       the dead creature's CR-603.10a look-back `attachments` (captured before the detach).
      // Never fires when unattached off an unrelated attacker (attachedTo null AND not in its attachments). The
      // per-equipped-creature correctness relies on ATTACH permitting only an own-creature host (resolvers.js).
      return !!triggeringPermanent
        && (triggeringPermanent.id === sourcePermanent.attachedTo
            || (Array.isArray(triggeringPermanent.attachments) && triggeringPermanent.attachments.includes(sourcePermanent.id)));
    case "you":
      return true; // step / lifegain / cardDrawn / youAttack triggers — `whose` gates ownership
    case "milled":
      // MILL-ON-EVENT — a player-mill event has NO triggering PERMANENT (the milled cards are library
      // objects, not permanents); the milling-player `whose` gate is applied in checkMilledTriggers, which
      // scans ALL players' watchers directly. Always matches here (like "you"): the event already proved a
      // mill happened, and the filter (nonland) + whose gate are enforced at the checkMilledTriggers site.
      return true;
    case "opponentDraw":
      // TRIG-DRAW-OPPONENT (Smothering Tithe) — a card-draw event has NO triggering PERMANENT (the drawn card
      // is a library/hand object). The whose:"opponent" gate (the drawer must be an opponent of the source's
      // controller) is applied in checkCardDrawnTriggers, which scans the drawer's opponents' watchers directly.
      // Always matches here (like "milled"/"you"): the event already proved a draw happened.
      return true;
    case "youDiscard":
      // ⭐ SELF DISCARD — same contract as opponentDiscard directly below: a discard event has no triggering
      // PERMANENT to match against, and the "you" gate is the SCAN (checkDiscardTriggers consults the
      // discarding player's own sources for this scope only). Reaching here already proves a discard happened.
      return true;
    case "opponentDiscard":
      // TRIG-DISCARD (CR 701.9a) — a discard event has NO triggering PERMANENT (the discarded card is a
      // hand/graveyard object), so there is nothing here to match against. The whose:"opponent" gate — the
      // discarder must be an opponent of the source's controller — is applied in checkDiscardTriggers, which
      // scans the DISCARDER's opponents' watchers directly. Always matches here, exactly like opponentDraw
      // above: reaching this point already proves a discard happened.
      return true;
    case "lifeLost":
      // LIFE-LOSS-ON-EVENT (Mindcrank, SHELF M3) — a life-loss event has NO triggering permanent; the
      // whose:"opponent" gate (the LOSER must be an opponent of the watcher's controller) is applied in
      // checkLifeLossTriggers directly. Always matches here (the milled/opponentDraw precedent).
      return true;
    case "eachCreature":
      return !!triggeringPermanent && isCreaturePerm(triggeringPermanent);
    case "eachOtherCreature":
      return !!triggeringPermanent && triggeringPermanent.id !== sourcePermanent.id && isCreaturePerm(triggeringPermanent);
    case "creatureYouControl":
      return !!triggeringPermanent && isCreaturePerm(triggeringPermanent) && triggeringPermanent.controller === sourcePermanent.controller;
    case "commanderYouControl":
      // COMMANDER-SCOPED subject (CR 903.3) — "a commander you control deals combat damage to an opponent"
      // (Kediss, Emberclaw Familiar). Narrower than creatureYouControl in exactly one way: the triggering
      // permanent must carry the isCommander designation, which gameState stamps at seat setup and which a
      // COPY of a commander deliberately does not inherit (a copy is not a commander, CR 707.2) — so a
      // cloned commander connecting must NOT fire this, and it doesn't, for free.
      //
      // "A commander YOU control" is the controller check, not an ownership one: a commander an opponent
      // owns but you have gained control of IS a commander you control and does fire (CR 903.3 designates
      // the card; control is read live). Same controller comparison creatureYouControl uses.
      return !!triggeringPermanent
        && isCreaturePerm(triggeringPermanent)
        && triggeringPermanent.controller === sourcePermanent.controller
        && !!triggeringPermanent.card?.isCommander;
    case "otherCreatureYouControl":
      return !!triggeringPermanent && triggeringPermanent.id !== sourcePermanent.id && isCreaturePerm(triggeringPermanent) && triggeringPermanent.controller === sourcePermanent.controller;
    case "creatureOrPwYouControl":
      // CREATURE-OR-PLANESWALKER dies (Cruel Celebrant — "this creature or another creature OR PLANESWALKER you
      // control dies"). The subject union is { a creature you control } ∪ { a planeswalker you control } (the
      // self "this creature" is subsumed by the creature half — Cruel Celebrant IS a creature it controls). A
      // creature death arrives via checkDiesTriggers; a planeswalker death via checkPlaneswalkerDiesTriggers —
      // BOTH route through this one scope. Fires when the dead permanent is a creature OR a planeswalker AND was
      // controlled by the source's controller. isCreaturePerm / isPlaneswalkerPerm read the CR-603.10a look-back
      // type line. A non-controlled or wrong-type death does NOT match (no over-fire); an opponent's PW dying
      // never fires this (controller gate), matching CR 603.6e.
      return !!triggeringPermanent
        && (isCreaturePerm(triggeringPermanent) || isPlaneswalkerPerm(triggeringPermanent))
        && triggeringPermanent.controller === sourcePermanent.controller;
    // ===== LTB / PiG WATCHER scopes (CR 700.4 / 603.6e) ===== The triggeringPermanent is the LEAVING permanent
    // (a CR-603.10a look-back from checkLeavesTriggers, carrying `leftToGraveyard`). All are controller-gated.
    // The PiG scopes require a GRAVEYARD exit (leftToGraveyard); the LEAVES scope fires on any exit.
    case "creatureOrArtifactYouControlPiG":
      // Marionette Apprentice — "another creature or artifact you control is put into a graveyard". Excludes the
      // source (the "another") UNLESS includeSelf is set (the symmetric non-"another" form). Graveyard exit only.
      return !!triggeringPermanent && triggeringPermanent.leftToGraveyard
        && triggeringPermanent.controller === sourcePermanent.controller
        && (descriptor.includeSelf || triggeringPermanent.id !== sourcePermanent.id)
        && (isCreaturePerm(triggeringPermanent) || /Artifact/.test(typeStr(triggeringPermanent.card)));
    case "artifactYouControlPiG":
      // Marionette Master — "an artifact you control is put into a graveyard". The "another"-form sets excludeSelf
      // (Disciple-of-the-Vault style); the bare form's source is a creature (never an artifact), so self never matches.
      return !!triggeringPermanent && triggeringPermanent.leftToGraveyard
        && triggeringPermanent.controller === sourcePermanent.controller
        && (!descriptor.excludeSelf || triggeringPermanent.id !== sourcePermanent.id)
        && /Artifact/.test(typeStr(triggeringPermanent.card));
    case "creatureYouControlPiG":
      // "a creature you control is put into a graveyard from the battlefield" — the dies-equivalent LTB wording,
      // graveyard exit only (CR 700.4). isCreaturePerm + controller gate, mirroring creatureYouControl (dies).
      return !!triggeringPermanent && triggeringPermanent.leftToGraveyard
        && triggeringPermanent.controller === sourcePermanent.controller
        && isCreaturePerm(triggeringPermanent);
    case "artifactAnyPiG":
      // BLITZ TR-3 (CR 700.4 / 603.6e) — "an artifact is put into a graveyard from the battlefield" (Molder
      // Beast, Fangren Marauder, Moriok Rigger, Disciple of the Vault). ANY player's artifact, so NO controller
      // gate (the ONLY non-"you control" PiG scope). Graveyard exit only (leftToGraveyard, so a bounce/exile
      // never fires); type-line substring (CR 205.2 — an Artifact Creature dying matches too). The source
      // self-includes: an artifact-typed watcher (Summoning Station) firing on its OWN death is CR-correct.
      return !!triggeringPermanent && triggeringPermanent.leftToGraveyard
        && /Artifact/.test(typeStr(triggeringPermanent.card));
    case "enchantmentYouControlPiG":
      // "an enchantment you control is put into a graveyard from the battlefield" (Wicked Visitor, Ashiok's
      // Reaper, Knight of Doves, Savior of the Sleeping) — the ENCHANTMENT analog of artifactYouControlPiG.
      // Graveyard exit only; type-line substring (CR 205.2 — an Enchantment Creature / Aura matches too) +
      // controller gate. No excludeSelf: the bare "an enchantment you control" self-includes (a source that is
      // itself an enchantment fires on its own PiG, CR-correct), matching the creature/artifact bare forms.
      return !!triggeringPermanent && triggeringPermanent.leftToGraveyard
        && triggeringPermanent.controller === sourcePermanent.controller
        && /Enchantment/.test(typeStr(triggeringPermanent.card));
    case "tokenYouControlLeaves":
      // Nadier's Nightblade — "a token you control leaves the battlefield". ANY exit (no graveyard gate), CR 111.7.
      // The token gate is the leaving permanent's card.token flag (the token-factory convention); a nontoken never fires.
      return !!triggeringPermanent && !!triggeringPermanent.card?.token
        && triggeringPermanent.controller === sourcePermanent.controller;
    case "otherCreatureYouControlLeaves":
      // "another creature you control leaves the battlefield" (Ninth Bridge Patrol, Flaming Fist Officer) — the
      // CREATURE any-exit LEAVES analog of tokenYouControlLeaves: fires on EVERY exit (no leftToGraveyard gate,
      // CR 603.6c). isCreaturePerm + same-controller + not-self (the "another" exclusion, so the source's own
      // leave — arriving via the self look-back with source===triggering — never self-fires).
      return !!triggeringPermanent && triggeringPermanent.id !== sourcePermanent.id
        && isCreaturePerm(triggeringPermanent)
        && triggeringPermanent.controller === sourcePermanent.controller;
    case "creatureOpponentControls":
      return !!triggeringPermanent && isCreaturePerm(triggeringPermanent) && triggeringPermanent.controller !== sourcePermanent.controller;
    case "landYouControl":
      // LANDFALL — the entering land must be controlled by the watcher's controller. checkLandfallTriggers
      // only fires on a land entry (triggeringPermanent is a land), but the isLandPerm guard keeps it exact.
      return !!triggeringPermanent && isLandPerm(triggeringPermanent) && triggeringPermanent.controller === sourcePermanent.controller;
    case "artifactYouControl":
      // PERM-ENTERS artifact — type-line substring (CR 205.2) catches Artifact Creature; controller gate.
      return !!triggeringPermanent && /Artifact/.test(triggeringPermanent.card?.type || triggeringPermanent.card?.type_line || "") && triggeringPermanent.controller === sourcePermanent.controller;
    case "enchantmentYouControl":
      // PERM-ENTERS enchantment — Enchantment Creature / Aura matches too; controller gate.
      return !!triggeringPermanent && /Enchantment/.test(triggeringPermanent.card?.type || triggeringPermanent.card?.type_line || "") && triggeringPermanent.controller === sourcePermanent.controller;
    case "permanentYouControl":
      // PERM-ENTERS permanent-wide (Amulet of Vigor) — the same controller gate as its siblings with NO type
      // predicate, because every permanent qualifies. The optional "entered TAPPED" narrowing is enforced as
      // a descriptor filter (enteredTapped) rather than here, so this scope stays a pure controller check and
      // composes with the filter the same way nontokenFilter/tokenFilter do.
      return !!triggeringPermanent && triggeringPermanent.controller === sourcePermanent.controller;
    case "tokenYouControl":
      // TOKEN-ENTERS (Junk Winder — "a token you control enters") — the entering permanent must be a TOKEN
      // (card.token, the token-factory convention, same gate as tokenYouControlLeaves) AND controlled by the
      // source's controller. A nontoken entry never matches (no over-fire); an opponent's token never matches.
      return !!triggeringPermanent && !!triggeringPermanent.card?.token
        && triggeringPermanent.controller === sourcePermanent.controller;
    case "selfDealerToCreature":
      // SELF-DEALER combat-damage-to-a-creature (Voracious Cobra, Ohran Viper, Serpentine Basilisk,
      // Stinkweed Imp — "Whenever THIS CREATURE deals combat damage to a creature, destroy that creature").
      // ⛔ THIS CANNOT USE scope:"self", AND THAT IS THE WHOLE REASON IT EXISTS. `self` asks
      // "triggeringPermanent === sourcePermanent", but here the triggering permanent is deliberately the
      // DAMAGED creature (it is the destroy target, threaded so "that creature" binds). The dealer is the
      // watcher. Under `self` those two ids are never equal, so the trigger classified native and then
      // NEVER FIRED — measured on a real board before this scope was split out, which is exactly the hollow
      // gain a flip-diff alone would have shipped.
      // The DEALER identity is checked at the firing site (checkCombatDamageToCreatureTriggers compares
      // ev.dealerId to the watcher). Here we confirm only that the triggering object is a creature, which is
      // the same division of labour the subtypeGlobal twin below uses.
      return !!triggeringPermanent;
    case "anyPermanent":
      // BECOMES-UNTAPPED (Mesmeric Orb) — ANY permanent's transition fires the watcher; the triggering
      // permanent is the one that untapped (checkUntapTriggers threads it). No controller/type gate — the
      // printed subject is the bare "a permanent".
      return !!triggeringPermanent;
    case "selfOrAnotherYouControl":
      // SELF-OR-ANOTHER dies (The Ghoul "The Ghoul or another nontoken Zombie or Mutant you control dies";
      // the Zulaport class "this creature or another creature you control dies"). The SELF half is
      // unconditional (CR 603.2 — the printed name refers to the source object itself; a token copy's own
      // death fires its own copy's trigger); the ANOTHER half gates on same-controller + not-self + the
      // optional nontoken and subtype filters. No subtypeFilter ⇒ "another creature" (isCreaturePerm).
      if (!triggeringPermanent || !sourcePermanent) return false;
      if (triggeringPermanent.id === sourcePermanent.id) return true;
      if (triggeringPermanent.controller !== sourcePermanent.controller) return false;
      if (descriptor.nontokenFilter && triggeringPermanent.card?.token) return false;
      if (descriptor.subtypeFilter) return subtypeFilterMatches(triggeringPermanent.card, descriptor.subtypeFilter);
      return isCreaturePerm(triggeringPermanent);
    case "subtypeYouControl":
      // SUBTYPE scope — shared by FOUR events: SUBTYPE-ETB-SELF ("NAME or another SUBTYPE you control
      // enters", Pantlaza — #330), SUBTYPE combat-damage (#333), and SUBTYPE attacks / dies (#335). Fires
      // when the triggering permanent CARRIES the subtype in its type line AND is controlled by the source's
      // controller. The ETB-SELF "NAME" half is subsumed by the subtype check because that NAME is ALWAYS
      // the subtype (Pantlaza IS a Dinosaur), so self-inclusion is only valid when the SOURCE ITSELF carries
      // the subtype — a robustness hedge for the source's own entry. GATING self-inclusion on the source's
      // subtype is load-bearing across ALL these events: without it a non-SUBTYPE creature whose trigger
      // watches a SUBTYPE ("a Saproling you control dies" on Slimefoot, a Fungus — LIVE P0; "a Vehicle you
      // control deals combat damage" on Setzer, a Human) would over-fire on its OWN non-matching
      // death / damage / attack — a forbidden false positive (Hans, cycle 42; widened to attacks/dies #335).
      return !!triggeringPermanent
        && triggeringPermanent.controller === sourcePermanent.controller
        && (subtypeFilterMatches(triggeringPermanent.card, descriptor.subtypeFilter)
            || (triggeringPermanent.id === sourcePermanent.id
                && subtypeFilterMatches(sourcePermanent.card, descriptor.subtypeFilter)));
    case "subtypeGlobal":
      // GLOBAL SUBTYPE combat-damage (Synapse Sliver / Brood Sliver — "Whenever a Sliver deals combat damage
      // to a player, its controller may …"). UNLIKE subtypeYouControl there is NO "you control": the subject
      // is ANY player's matching-subtype creature, so the controller gate is intentionally ABSENT — the
      // trigger fires off an opponent's Sliver too (the beneficiary is then that opponent, threaded as the
      // pending trigger's controller by checkCombatDamageTriggers via the dealer-controller override). Fires
      // when the triggering permanent carries the subtype, with the same source self-inclusion hedge as
      // subtypeYouControl (the source's OWN matching damage). The subtypeFilter is exact (parseSubtypeList
      // rejects a card-TYPE word), so a non-member creature dealing damage does NOT fire — no over-fire.
      return !!triggeringPermanent
        && (subtypeFilterMatches(triggeringPermanent.card, descriptor.subtypeFilter)
            || (triggeringPermanent.id === sourcePermanent.id
                && subtypeFilterMatches(sourcePermanent.card, descriptor.subtypeFilter)));
    case "subtypeGlobalToCreature":
      // GLOBAL SUBTYPE combat-damage-TO-A-CREATURE (Toxin Sliver — "Whenever a Sliver deals combat damage to a
      // creature, destroy that creature"). UNLIKE every other combat-damage scope, the `triggeringPermanent`
      // here is the DAMAGED creature (the destroy target → ctx.triggeringPermanentId), NOT the subtype-bearing
      // dealer. The authoritative SUBTYPE check is on the DEALING creature and is done in the scan
      // (checkCombatDamageToCreatureTriggers) BEFORE firing — so this scope only confirms the destroy target
      // (the damaged creature) still exists as a creature. A null/non-creature triggering permanent → no fire
      // (a clean no-op; never a fabricated destroy). The scan's subtype gate (parseSubtypeList exact) is what
      // prevents an over-fire on a non-member dealer; this guards the target side.
      return !!triggeringPermanent && isCreaturePerm(triggeringPermanent);
    case "otherSubtypeYouControl":
      // "another <SUBTYPE> you control enters" (Youthful Valkyrie / Champion of the Perished family).
      // Fires when a non-self permanent the source's controller controls carries the subtype in its type line.
      // Unlike subtypeYouControl (Pantlaza — "NAME or another SUBTYPE"), this NEVER self-triggers (id check).
      return !!triggeringPermanent
        && triggeringPermanent.id !== sourcePermanent.id
        && triggeringPermanent.controller === sourcePermanent.controller
        && typeStr(triggeringPermanent.card).includes(descriptor.subtypeFilter || "");
    case "otherSubtypeAnywhere":
      // "another <SUBTYPE> enters" — no controller restriction (Elvish Vanguard / Kavu Monarch / Arcbound Crusher).
      // Fires when any permanent from any controller carries the subtype, excluding the source itself.
      return !!triggeringPermanent
        && triggeringPermanent.id !== sourcePermanent.id
        && typeStr(triggeringPermanent.card).includes(descriptor.subtypeFilter || "");
    case "creatureYouControlPower":
      // POWER-THRESHOLD ETB — the entering creature you control with LAYER-RESOLVED power ≥ N (counters +
      // anthems included; checkEnterTriggers fires after the permanent + its enters-with counters are on
      // the battlefield, so creaturePower is accurate at ETB). `state` threaded through scopeMatches for this.
      // etbExcludeSelf: the "another creature you control with power N or greater" form (Garruk's
      // Packleader) must NOT fire on the source's own entry. Without this the card draws an extra card
      // for itself — a fabricated trigger the tier can't see, since it classifies native either way.
      return !!triggeringPermanent && isCreaturePerm(triggeringPermanent)
        && triggeringPermanent.controller === sourcePermanent.controller
        && !(descriptor.etbExcludeSelf && triggeringPermanent.id === sourcePermanent.id)
        && creaturePower(triggeringPermanent, state) >= (descriptor.powerThreshold || 0);
    case "creatureYouControlKeyword":
      // KEYWORD-FILTER ETB (Dragon Tempest "a creature you control with flying enters …"; Waterkin Shaman;
      // Arcades "with defender") — the entering creature you control that HAS the filter keyword. Mirrors the
      // power-threshold scope but gates on permanentHasKeyword (LAYER-AWARE — printed at an ability-word
      // position + layer-6 addKeyword grants + counters), so a creature GRANTED flying by an anthem/equipment
      // and then entering fires it exactly like a printed flier, and a non-matching creature's entry does NOT
      // fire (the forbidden FP this gate prevents). checkEnterTriggers fires after the permanent + its
      // enters-with effects settle, so the keyword read is accurate at ETB; `state` is threaded through
      // scopeMatches. The controller gate keeps it to the source controller's creatures ("you control").
      return !!triggeringPermanent && isCreaturePerm(triggeringPermanent)
        && triggeringPermanent.controller === sourcePermanent.controller
        && permanentHasKeyword(state, triggeringPermanent.id, descriptor.keywordFilter);
    case "chosenTypeYouControl":
      // CHOSEN-TYPE scope (Kindred Discovery) — the DYNAMIC analogue of subtypeYouControl: the subtype is
      // NOT printed on the card; it's the creature type chosen AT ETB and stored durably on the SOURCE
      // permanent (`sourcePermanent.chosenType`, set by resolvers.enterPermanent's auto-pick, serialized as
      // plain data). Fires when the triggering creature is controlled by the source's controller AND carries
      // the chosen type — by type-line subtype OR Changeling (CR 702.73a — every creature type). CREED FP
      // guard: if chosenType was never set (a malformed/look-back source), permHasChosenType is false → the
      // trigger never fires (a SAFE no-op, never an over-fire on an unknown type). A non-chosen-type creature
      // entering/attacking does NOT match (the subtype check is exact). Self-inclusion is natural — the source
      // is an Enchantment, never a creature of the chosen type, so it never self-fires.
      return !!triggeringPermanent && isCreaturePerm(triggeringPermanent)
        && triggeringPermanent.controller === sourcePermanent.controller
        && permHasChosenType(triggeringPermanent.card, sourcePermanent.chosenType);
    default:
      return false;
  }
}

function makePendingTrigger(descriptor, sourcePermanent, triggeringPermanent, triggeringContext, beneficiary = null) {
  // BENEFICIARY OVERRIDE (subtypeGlobal — Synapse/Brood Sliver "its controller may …"): the effect resolves
  // for the DEALING creature's controller, NOT the watcher's controller. The `controller` field is what
  // buildTriggerStack threads into the effect program's `controller` (the "you" the rewritten effect binds
  // to) — so overriding it here makes "its controller
  // may draw" / "its controller may create" resolve for the dealer's controller. Defaults to the source's
  // controller (every other scope), so this is a no-op except where checkCombatDamageTriggers passes one.
  const controller = beneficiary || sourcePermanent.controller;
  const context = {
    triggeringPermanentId: triggeringPermanent?.id,
    triggeringCardName: triggeringPermanent?.card?.name,
    triggeringController: triggeringPermanent?.controller,
    // SELF-LTB (Wave 4): the triggering object's CARD id + token-ness, so a self-return resolver can locate
    // the exact card now sitting in a graveyard (the perm id is stale once it left the battlefield) and skip
    // a token (CR 111.7 — a token ceases to exist, never returns to a hand). Harmless extra fields otherwise.
    triggeringCardId: triggeringPermanent?.card?.id,
    triggeringCardIsToken: !!triggeringPermanent?.card?.token,
    // DIES-COPY (Vaultborn Tyrant / Ochre Jelly) — the triggering object's copiable CARD (CR 707.2 uses the
    // creature's last-known printed characteristics). For a self-dies "…copy of it" the source has ALREADY
    // left the battlefield, so findPermanent(triggeringPermanentId) fails; the copy resolver falls back to a
    // synthetic permanent built from this look-back card so the dead creature is still faithfully copied.
    // Plain-data (the same card object the death look-back carried) — serializes trivially, ignored by every
    // other resolver.
    triggeringCard: triggeringPermanent?.card,
    // The triggering object's controller — for a self-dies copy the token enters under the DYING creature's
    // last controller (the ability's controller, already threaded as the trigger controller); carried for
    // parity with the id/name/token trio.
    triggeringPermanentController: triggeringPermanent?.controller,
    // The SOURCE permanent (the watcher itself) — a per-SOURCE intervening-if (Bloodchief Ascension's
    // "this enchantment has three or more quest counters on it") reads its live counters at flush AND
    // resolution (CR 603.4) via this id. Additive plain data; every other consumer ignores it.
    sourcePermanentId: sourcePermanent?.id,
    ...triggeringContext,
  };
  return {
    event: descriptor.event,
    source: { permanentId: sourcePermanent.id, cardId: sourcePermanent.card?.id, name: sourcePermanent.card?.name },
    controller,
    descriptor,
    context,
    targets: [],
    optional: descriptor.optional,
    // Serializable payload for flushTriggers -> stack. W4: the DEFAULT is the Arbiter-safe manual no-op
    // (RESOLVER_KEYS.MANUAL, written as a literal so triggers.js stays a leaf) — the flush stage
    // (gameEngine.buildTriggerStack) parses descriptor.effectClause into a rich EffectProgram and
    // OVERRIDES this payload for every faithfully-resolvable trigger; anything it can't model keeps
    // the manual payload (false-negative SAFE, never the old naive substring vocabulary).
    // MUST-FIX 3: sourcePermanentId threads the SOURCE permanent (the ability's own permanent — the one
    // DEALING damage) so a damage trigger can route through the damage-replacement consult source-scoped.
    payload: {
      resolver: "manual",
      params: { controller, targets: [], context, sourcePermanentId: sourcePermanent.id },
    },
  };
}

// A granted quoted ability line. Three shapes, all ending in the quoted ability:
//   bare:     "Enchanted creature has \"<ability>\""                          (Sixth Sense)
//   combined: "Enchanted creature gets +2/+2 and has \"<ability>\""          (Bear Umbra, Snake Umbra)
//   keyword:  "Equipped creature has trample and \"<ability>\""              (Power Fist)
// The optional "gets +X/+Y and " P/T prefix and the optional bare-keyword segment are applied by the LAYER
// engine (parseAttachedBonus), so here we only reach past them to the quoted ability. The keyword segment is
// EXTRACTION-only permissive: whether it is a modeled grant is judged where it matters (parseAttachedClause
// models/rejects the static half all-or-nothing; coverage's grant classifier requires that parse to succeed
// before crediting the card). Anchored whole-line ($) — a trailing rider after the quote ("… and has \"…\"
// and gets +1/+1") leaves residue and does NOT match, keeping such a card Arbiter (CREED).
const GRANTED_ABILITY_LINE = /^(?:enchanted|equipped) creature\s+(?:gets?\s+[+-]\d+\/[+-]\d+\s+and\s+)?(?:has|have)\s+(?:[a-z][a-z ,]*?\s+and\s+)?["“]([^"”]+)["”]\s*\.?$/i;

/**
 * GRANTED triggered abilities (subsystem 1 phase 1c) — an Aura/Equipment that grants the enchanted/equipped
 * CREATURE a triggered ability: "Enchanted creature has \"Whenever this creature deals combat damage to a
 * player, you may draw a card.\"" (Sixth Sense), "\"At the beginning of your upkeep, create a 1/1 …\""
 * (Commander's Authority). The QUOTED trigger text is parsed through the SAME detectTriggers path as a
 * printed trigger, so event / scope / whose / effectClause are identical — the runtime fires it and coverage
 * gates it without drift. Merged onto the HOST in triggersForEvent (sourcePermanent = host), so the trigger
 * fires on the host's event and "this creature"/source bind to the host. Pure; card-based; [] for non-grant.
 */
export function parseGrantedTriggeredAbilities(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  if (!oracle.trim()) return [];
  const out = [];
  for (const rawLine of oracle.split(/\n+/)) {
    // Strip reminder text BEFORE the whole-line anchor — a trailing parenthetical ("… counter on this
    // creature." (Damage dealt by a creature with lifelink …) — Eternal Thirst) otherwise defeats the $
    // anchor, so the classifier (which strips reminders) credits the grant while THIS extraction returns
    // nothing and the runtime never fires it: a silent drop. Local copy of the stripReminder shape the
    // other leaf modules replicate (triggers.js stays a leaf — no coverage import / cycle).
    const line = rawLine.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    const m = line.match(GRANTED_ABILITY_LINE);
    if (!m) continue;
    const quoted = m[1].trim();
    if (!/^(?:when|whenever|at)\b/i.test(quoted)) continue;             // only a TRIGGERED quoted ability
    for (const d of detectTriggers({ name: "Granted", type: "Creature", oracle: quoted })) {
      out.push({ ...d, granted: true });
    }
  }
  return out;
}

// The granted triggered descriptors an Aura/Equipment confers on its host (walks the host's attachments,
// mirroring grantedActivatedForHost). Each is treated as if printed on the host by triggersForEvent.
function grantedTriggersForHost(state, hostPerm) {
  if (!hostPerm?.attachments?.length) return [];
  const out = [];
  for (const attId of hostPerm.attachments) {
    const lk = findPermanent(state, attId);
    if (lk?.permanent?.card) out.push(...parseGrantedTriggeredAbilities(lk.permanent.card));
  }
  return out;
}

// GROUP-GRANT (Tempered Sliver) — the triggered descriptors a board static GRANTS this permanent ("Sliver
// creatures you control have \"Whenever this creature deals combat damage to a player, put a +1/+1 counter on
// it.\""). layers.grantedTriggeredQuotedFor returns the raw quoted bodies that AFFECT this permanent (selector
// -matched); each is parsed via the SAME detectTriggers a printed trigger uses, so event/scope/effectClause
// are identical. Fired on the RECIPIENT (sourcePermanent) — "this creature"/source bind to it, never the
// granter. Empty when no group grant applies (the common case). Mirrors grantedTriggersForHost.
function grantedTriggersForGroup(state, perm) {
  // `perm` doubles as the DEAD-LOOK-BACK candidate (BLITZ BG-2, CR 603.10a): on the leave/dies paths the
  // checkers pass the departed permanent's look-back { id, card, controller }, which findPerm can't resolve
  // — the third argument lets the layers walk evaluate a DYNAMIC grant's selector against last-known
  // information, so a granted "…or leaves the battlefield" half fires like a printed one. Live permanents
  // resolve by id exactly as before (the extra argument is unread on that path).
  const quoted = grantedTriggeredQuotedFor(state, perm.id, perm);
  if (!quoted.length) return [];
  const out = [];
  for (const q of quoted) {
    for (const d of detectTriggers({ name: perm.card?.name || "GroupGranted", type: "Creature", oracle: q })) {
      out.push({ ...d, granted: true });
    }
  }
  return out;
}

/**
 * The PendingTriggers that fire for `event` from `sourcePermanent`, given the
 * object that caused the event (`triggeringPermanent`, may === source for
 * self-triggers) and any event extras (e.g. { defenderId }). Pure — returns data,
 * does not enqueue.
 */
export function triggersForEvent(state, { event, sourcePermanent, triggeringPermanent = null, triggeringContext = {}, beneficiary = null, scopeFilter = null, descriptorFilter = null }) {
  if (!sourcePermanent?.card) return [];
  const printed = detectTriggers(sourcePermanent.card).filter(d => d.event === event);
  // GRANTED-TRIGGERED (subsystem 1 phase 1c): an Aura/Equipment on this permanent confers a triggered
  // ability. Merge the host's granted descriptors so they fire on the host's event exactly like printed
  // ones (source = host → "this creature"/source bind to the host). Additive — the printed path is untouched.
  const granted = grantedTriggersForHost(state, sourcePermanent).filter(d => d.event === event);
  // GROUP-GRANT (Tempered Sliver): a board static grants this permanent a triggered ability. Merge those
  // descriptors too so they fire on the recipient's event exactly like printed/attached ones. Additive.
  const groupGranted = grantedTriggersForGroup(state, sourcePermanent).filter(d => d.event === event);
  let descriptors = (granted.length || groupGranted.length) ? [...printed, ...granted, ...groupGranted] : printed;
  // SCOPE FILTER (subtypeGlobal de-dup): checkCombatDamageTriggers fires the per-attacker self + the
  // attacking-player watcher paths EXCLUDING subtypeGlobal, then runs a single all-players scan that
  // INCLUDES only subtypeGlobal — so a global watcher controlled by the attacking player fires exactly
  // once (via the global scan, with the dealer-controller beneficiary), never twice. Inert when unset.
  if (typeof scopeFilter === "function") descriptors = descriptors.filter(d => scopeFilter(d.scope));
  // DESCRIPTOR FILTER (subtype/property BATCH combat-damage): checkBatchCombatDamageTriggers passes a predicate
  // that keeps a filtered-batch descriptor ONLY when at least one CONNECTING creature matched its subtype/
  // property filter this combat (a bare unfiltered batch descriptor always passes). Inert when unset, so every
  // other event path is untouched. This is the load-bearing CREED gate: a non-matching attacker connecting alone
  // (e.g. a non-outlaw beside Olivia) must NOT fire the filtered batch — no over-fire.
  if (typeof descriptorFilter === "function") descriptors = descriptors.filter(descriptorFilter);
  if (!descriptors.length) return [];
  const out = [];
  for (const d of descriptors) {
    if (!scopeMatches(d, sourcePermanent, triggeringPermanent, state)) continue;
    if (d.whose === "yours" && sourcePermanent.controller !== state.activePlayer) continue;
    // PHASE-TRIGGER (Wave 1): "At the beginning of each opponent's upkeep" — fire ONLY on an OPPONENT's
    // upkeep, never the source controller's own (CR 603.2b). The shared "upkeep" event also carries
    // whose:"yours" ("your upkeep") and whose:"any" ("each upkeep"); this branch excludes the
    // controller's own upkeep, the #1 false positive for the each-opponent shape (Viseling, Davriel,
    // Price of Knowledge). When the active player isn't an opponent of the source's controller (i.e. it
    // IS the controller, or a non-opponent in some future multiplayer wrinkle), skip.
    if (d.whose === "opponents" && !opponentsOf(state, sourcePermanent.controller).includes(state.activePlayer)) continue;
    // ENCHANTED-CONTROLLER'S UPKEEP (2026-08-12 — Stab Wound class): fire ONLY when this Aura is attached
    // and its HOST's controller is the player whose upkeep it is (state.activePlayer, the same identity
    // the whose-gates above read). Unattached or wrong-seat upkeep → skip. This is the gate that makes the
    // sentinel rewrite honest: the upkeep player IS the host's controller whenever the trigger fires.
    if (d.enchantedControllersUpkeep) {
      const host = sourcePermanent.attachedTo ? findPermanent(state, sourcePermanent.attachedTo) : null;
      if (!host || host.controller !== state.activePlayer) continue;
    }
    // BENEFICIARY OVERRIDE: only the subtypeGlobal "its controller" descriptors carry one (set by
    // checkCombatDamageTriggers = the dealing creature's controller). Every other descriptor passes null →
    // makePendingTrigger falls back to the source's controller, so this is inert for all existing scopes.
    const ben = (d.scope === "subtypeGlobal" && d.itsController) ? beneficiary : null;
    out.push(makePendingTrigger(d, sourcePermanent, triggeringPermanent, triggeringContext, ben));
  }
  return out;
}

/**
 * PW-8: an EMBLEM as a trigger SOURCE. An emblem has no battlefield permanent, but its triggered
 * abilities still fire (CR 114.2 — an emblem has the listed ability). Shaped like a permanent so
 * triggersForEvent / detectTriggers / makePendingTrigger treat it uniformly (its `card.oracle` is the
 * emblem's ability text; its `controller` scopes "you control" / "your upkeep").
 */
function emblemAsSource(emblem, controller) {
  return { id: emblem.id, controller, card: { oracle: emblem.oracle, name: "Emblem", type: "Emblem" }, isEmblem: true };
}

/** Every trigger SOURCE a player has: battlefield permanents + emblems (PW-8). */
function triggerSourcesOf(state, pid) {
  const p = state.players[pid];
  if (!p) return [];
  return [...(p.battlefield || []), ...(p.emblems || []).map((e) => emblemAsSource(e, pid))];
}

/**
 * Enqueue dies triggers for a batch of creatures that just died (CR 603.6c).
 * `dead` is destroyLethalCreatures' return — [{ id, controller, name, card }],
 * the look-back snapshot (CR 603.10a), since the permanents are already in the
 * graveyard. For each death we fire its own "when this dies" trigger plus every
 * surviving battlefield watcher ("whenever a creature dies"). Pure — appends to
 * pendingTriggers and returns new state.
 *
 * Phase-1 limitation: simultaneously-dying watchers don't see each other's
 * deaths (a dead Blood Artist won't drain off another creature that died in the
 * same batch). The common case — a death + a surviving drain — is covered.
 */
/**
 * Fire ETB ("enters the battlefield") triggers for a permanent that just entered (β-3b reanimation,
 * and reusable for any non-cast entry). `enteredPerm` is already ON the battlefield, so iterating every
 * battlefield watcher covers BOTH its own "when this enters" trigger AND others' "whenever a creature
 * enters" — mirrors enterPermanent's inline ETB loop. Pure — appends to pendingTriggers.
 */
export function checkEnterTriggers(state, enteredPerm) {
  if (!enteredPerm) return state;
  // (The Wise Mothman's ETB rad hook is GONE — SHELF C1's "enters or attacks" disjunction split binds the
  // trigger generically through detectTriggers, so both halves ride the normal etb/attacks fire paths.
  // Keeping the hook would double-fire the rad — the coordination note mothmanRad.js carried from day one.)
  const s = state;
  let fired = [];
  // ETB-XVALUE THREADING (HALF-X-CREATE-TOKENS): the entering permanent's own "when this enters" trigger
  // (sourcePermanent === enteredPerm) is the ONLY ETB trigger that owns the entering object's paid {X} — so
  // thread enteredPerm.xValue into THAT trigger's context (and nowhere else: a bystander "whenever a creature
  // enters" watcher's effect must NOT read the entering creature's X). buildTriggerStack reads context.xValue
  // into params.xValue, so a "create half X Food tokens, rounded up" ETB resolves at the real X. Undefined for
  // a non-X entry → the {} spread adds nothing → every existing ETB trigger is byte-identical.
  const etbSelfContext = enteredPerm.xValue > 0 ? { xValue: enteredPerm.xValue } : {};
  for (const pid of Object.keys(s.players)) {
    for (const watcher of triggerSourcesOf(s, pid)) {
      const selfCtx = watcher.id === enteredPerm.id ? etbSelfContext : {};
      // A GY-FUNCTIONING descriptor is excluded from the BATTLEFIELD fire: its own text says it works from
      // the graveyard (CR 603.3d), so a Dragon Fangs already on the battlefield must not re-return itself.
      // Fired only by the graveyard scan below — same flag-routes-the-scan shape as checkMilledTriggers and
      // checkCastTriggers. (On the cast path the equivalent line turned out to be a PRE-FILTER rather than
      // the safety gate — a mutation deleting it survived, because the effect keys on a sourceCardId only
      // the graveyard scan stamps. Expect the same here, and pin what it actually buys: no phantom trigger.)
      fired = fired.concat(triggersForEvent(s, { event: "etb", sourcePermanent: watcher, triggeringPermanent: enteredPerm, triggeringContext: selfCtx, descriptorFilter: (d) => !d.functionsFromGraveyard }));
      // CHOSEN-TYPE (Kindred Discovery) — the "enters" half of its "of the chosen type enters or attacks"
      // trigger. The entering permanent is the triggering creature; the chosenTypeYouControl scope gates on
      // the watcher's stored chosenType + the entering creature's subtype/changeling. Same ETB chokepoint
      // as the etb fire, so it shares the single-fire guarantee (CR 603.6a). A no-op for any non-watcher.
      fired = fired.concat(triggersForEvent(s, { event: "chosenTypeEntersOrAttacks", sourcePermanent: watcher, triggeringPermanent: enteredPerm }));
    }
    // ===== GY-FUNCTIONING ETB triggers (the Dragon Fangs cycle + Smoke Shroud, CR 603.3d) ===== scan this
    // player's GRAVEYARD for Auras whose ETB-watcher functions from there. The source is the graveyard CARD
    // (the checkMilledTriggers / checkCastTriggers precedent), and sourceCardId rides the context so
    // applyGySelfAttachReturn moves the exact card rather than one matched by name. triggeringPermanent is
    // the entering creature, which makePendingTrigger turns into ctx.triggeringPermanentId — the host the
    // Aura attaches to.
    //
    // ⚠️ THE SCOPE GATES STILL APPLY, and they differ across this small family: the Dragons say "a creature"
    // (any controller, plus a mana-value floor), Smoke Shroud says "a Ninja YOU CONTROL". Both run through
    // triggersForEvent, so scopeMatches enforces each card's own printed subject rather than this loop
    // assuming one shape for all six.
    for (const gyCard of s.players[pid]?.graveyard || []) {
      fired = fired.concat(triggersForEvent(s, {
        event: "etb",
        sourcePermanent: { id: `gy-${gyCard.id}`, controller: pid, card: gyCard },
        triggeringPermanent: enteredPerm,
        triggeringContext: { sourceCardId: gyCard.id },
        descriptorFilter: (d) => !!d.functionsFromGraveyard,
      }));
    }
  }
  if (!fired.length) return s;
  // ENTERS-TRIGGER MULTIPLIER (Panharmonicon / Yarok / Ancient Greenwarden, CR 603.x): every ability here
  // fired because THIS permanent entered, so each is repeated once per matching multiplier its controller
  // controls. The filter is tested against the entering card, which is why the counter is closed over it
  // rather than taking only a controller like its two siblings.
  fired = multiplyTriggers(s, fired, (st, ctrl) => etbTriggerMultiplierCount(st, ctrl, enteredPerm.card));
  return { ...s, pendingTriggers: [...(s.pendingTriggers || []), ...fired] };
}

/**
 * LANDFALL — fire "landfall" triggers for a LAND that just entered (`enteredLand`, already on the
 * battlefield). Every battlefield/emblem watcher is checked; scopeMatches' `landYouControl` keeps it to
 * watchers controlled by the land's controller. Mirrors checkEnterTriggers/checkDiesTriggers. Pure —
 * appends to pendingTriggers. Called from the play-land path (applyPlayLand); a future slice fires it on
 * the ramp/fetch land-entry path too (a missed landfall there is a SAFE under-fire, never a wrong fire).
 */
export function checkLandfallTriggers(state, enteredLand) {
  if (!enteredLand) return state;
  let fired = [];
  for (const pid of Object.keys(state.players)) {
    for (const watcher of triggerSourcesOf(state, pid)) {
      fired = fired.concat(triggersForEvent(state, { event: "landfall", sourcePermanent: watcher, triggeringPermanent: enteredLand }));
    }
  }
  if (!fired.length) return state;
  // ENTERS-TRIGGER MULTIPLIER applies HERE TOO, and forgetting it would be the quiet half of the bug: a
  // landfall trigger is a triggered ability that triggered because a permanent entered, so Ancient
  // Greenwarden (land filter) and Yarok (any permanent) double it exactly as they double an ETB.
  fired = multiplyTriggers(state, fired, (st, ctrl) => etbTriggerMultiplierCount(st, ctrl, enteredLand.card));
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * PERM-ENTERS — fire "permanentEnters" triggers for a permanent that just entered the battlefield
 * (`enteredPerm`, already on the battlefield). Handles artifact-ETB ("whenever an artifact you
 * control enters") and enchantment-ETB ("whenever an enchantment you control enters") watchers.
 * scopeMatches' `artifactYouControl` / `enchantmentYouControl` gates each watcher to only fire when
 * the entering permanent is the right type AND controlled by the watcher's controller. Called from
 * enterPermanent (resolvers.js) immediately after checkEnterTriggers. Pure — appends to pendingTriggers.
 */
export function checkPermanentEntersTriggers(state, enteredPerm) {
  if (!enteredPerm) return state;
  let fired = [];
  for (const pid of Object.keys(state.players)) {
    for (const watcher of triggerSourcesOf(state, pid)) {
      fired = fired.concat(triggersForEvent(state, { event: "permanentEnters", sourcePermanent: watcher, triggeringPermanent: enteredPerm }));
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * DIES-TRIGGER MULTIPLIER expansion (Teysa Karlov, CR 603.x). Given the list of triggered abilities that
 * fired because a CREATURE died (each a pending-trigger whose `.controller` is the ability's controller —
 * makePendingTrigger sets it to the source permanent's controller), return the list with each entry repeated
 * one ADDITIONAL time per diesTriggerMultiplier static its controller controls (Teysa → +1 = fires twice; two
 * Teysas → +2 = fires 3× — the official ruling). Each duplicate is a DISTINCT pending-trigger (a shallow copy)
 * so flushTriggers/buildTriggerStack builds it into its own stack object with independently-chosen targets and
 * ordering (CR 603.x — the extra instance is a separate ability, not a re-resolve of the first). Per-controller
 * count is memoized within the call (a batch of simultaneous deaths shares one board scan per controller). A 0
 * multiplier leaves the list unchanged — the no-Teysa fast path. Pure.
 */
const multiplyDiesTriggers = (state, fired) => multiplyTriggers(state, fired, diesTriggerMultiplierCount);
// ATTACK-TRIGGER MULTIPLIER (Isshin, Two Heavens as One) — the same expansion keyed on the attack
// statics instead. One shared body so the two can never diverge on the distinct-instance rule.
const multiplyAttackTriggers = (state, fired) => multiplyTriggers(state, fired, attackTriggerMultiplierCount);
function multiplyTriggers(state, fired, countFor) {
  if (!fired.length) return fired;
  const countByController = new Map();
  const multFor = (controller) => {
    if (controller == null) return 0;
    if (!countByController.has(controller)) countByController.set(controller, countFor(state, controller));
    return countByController.get(controller);
  };
  // Fast path: no multiplier anywhere → return the original list untouched.
  let anyExtra = false;
  for (const t of fired) { if (multFor(t.controller) > 0) { anyExtra = true; break; } }
  if (!anyExtra) return fired;
  const out = [];
  for (const t of fired) {
    out.push(t);
    const extra = multFor(t.controller);
    for (let i = 0; i < extra; i++) out.push({ ...t }); // a distinct additional instance
  }
  return out;
}

export function checkDiesTriggers(state, dead) {
  // SELF-LTB (Wave 4): drain any "leaves the battlefield" events queued by gameState.detachPermanentFromAll
  // FIRST (every death path runs destroyLethalCreatures → moveCardToZone → detach, then checkDiesTriggers),
  // so an orphaned Aura's PiG-return trigger (Rancor) is enqueued alongside the creature's dies triggers.
  // ⭐ ORPHANED-AURA LOOK-BACK (CR 603.10a) — captured HERE because checkLeavesTriggers below CLEARS the
  // queue, and this is the only place the binned Aura still exists as data.
  //
  // THE DEFECT THIS CLOSES: when a creature dies, detachPermanentFromAll (the single battlefield-exit
  // chokepoint) puts every Aura on it straight into the graveyard (CR 704.5n) — BEFORE this function runs.
  // The watcher sweep below iterates triggerSourcesOf, which is BATTLEFIELD ONLY, so an Aura's own
  // "When enchanted creature dies, …" was never looked for at all. Measured end-to-end: Bequeathal drew
  // ZERO cards while being credited native-trigger. CR 603.10a is explicit that an ability that triggers on
  // the event which caused its source to leave still triggers — the game looks back in time.
  //
  // ⛔ SCOPED TO AURAS, and to graveyard exits, on purpose. An EQUIPMENT stays on the battlefield when its
  // host dies (it merely unattaches), so it is already in the watcher sweep and must NOT be double-fired
  // from here. A bounce/exile exit is not this case either. Each candidate is still matched to the specific
  // dead creature by its look-back `attachments` at the fire site, so an Aura that fell off some OTHER
  // creature in the same batch of deaths can never fire off this one.
  const orphanedAuras = (state.pendingLeaveEvents || [])
    .filter((e) => e?.card && e.toGraveyard && /\bAura\b/.test(String(e.card.type || e.card.type_line || "")))
    .map((e) => ({ id: e.id, controller: e.controller, card: e.card, attachedTo: null }));
  let state2 = checkLeavesTriggers(state);
  if (!dead || !dead.length) return state2;
  // DEATHS-THIS-TURN (CR 700.4): bump each dying creature's controller's per-turn death tally BEFORE firing
  // dies-triggers, so a dies-triggered "for each creature that died this turn" payoff (and the "if a creature
  // died this turn" intervening-if) reads the up-to-date count. recordCreatureDeaths excludes exiled-instead /
  // non-creature look-backs (CR 700.4 — only creatures put into a graveyard "died").
  state2 = recordCreatureDeaths(state2, dead);
  let fired = [];
  for (const d of dead) {
    if (!d?.card) continue;
    // EXILE-INSTEAD (CR 614 replacement + CR 700.4): a creature exiled instead of being put into a
    // graveyard never DIED — it fires NO dies-triggers (its own or any watcher's). The per-turn death
    // tally already excluded these (recordCreatureDeaths); the trigger fire loop must too, or every
    // Lava-Coil-class removal feeds phantom Blood-Artist drains into self-play outcomes (R1.1, audit
    // 2026-07-09). Leaves-the-battlefield triggers still fired above via checkLeavesTriggers — exile IS
    // an LTB event, it just isn't a death.
    if (d.exileInstead) continue;
    // SHUFFLE-INSTEAD (CR 614) - the sibling of exileInstead above. A permanent replaced into its owner's
    // library was never put into a graveyard, so it never DIED (CR 700.4) and fires no dies-trigger, its own
    // or any watcher's. Without this a Blood Artist drained off a death that did not happen.
    if (d.shuffledInstead) continue;
    // SELF-LTB (Wave 4): carry the dead creature's former `attachments` ids on the look-back so the
    // equippedCreature scope (Sword of the Realms) can match its watcher (CR 603.10a look-back).
    // DIES-TRIGGER-RESOURCE-PAYOFFS (Wave 3b): also carry the dying creature's last-known POWER (CR 603.6e),
    // captured at the SBA/destroy/sacrifice look-back BEFORE the permanent left the battlefield. Threaded as
    // ctx.dyingPower so a "<payoff> equal to its power" dies-trigger (Goldvein Hydra Treasures, Lifeblood
    // Hydra gain+draw, Feral Ghoul rad) reads the real on-board power. ONLY the SOURCE's OWN dies-trigger
    // ("when THIS creature dies") references "its power"; a surviving watcher ("whenever a creature dies")
    // that reads a magnitude off the triggering creature would also want it, so it's carried on both fires
    // (a watcher that doesn't use it simply ignores the ctx key). A dead entry with no captured power (PW SBA,
    // an unsized CDA) carries `undefined` → the payoff resolves to 0 (a clean no-op, never a fabricated count).
    // All fires read `state2` (post-checkLeavesTriggers, consistent with the return below).
    // COUNTER-PREDICATE dies scope (BLITZ CNT-1, CR 603.10a/603.6e last-known-info): carry the dying
    // creature's `counters` snapshot on the look-back so scopeMatches' requiresCounter gate ("a creature you
    // control WITH A +1/+1 COUNTER ON IT dies" — Meltstrider Eulogist) reads its last-known counter bag. The
    // undying/persist intervening-if already relies on d.counters being captured by every death constructor;
    // this exposes the same snapshot on the triggering permanent (mirrors `attachments`). Absent → {} (0 of any).
    // DAMAGED-BY (CR 603.6e last-known-info): the ids of everything that dealt damage to this creature this
    // turn, snapshotted by the death constructors while the permanent still existed. The Sengir Vampire
    // family ("whenever a creature dealt damage by ~ this turn dies") is a WATCHER trigger whose condition is
    // a fact about the DEAD creature, so it can only be answered from the look-back - the permanent is gone
    // by the time the watcher sweep below runs. Added to the SINGULAR path only; the batch path
    // ("whenever one or more creatures die") has no member of this family.
    const lookBack = { id: d.id, controller: d.controller, card: d.card, attachments: d.attachments || [], counters: d.counters || {}, damagedBy: d.damagedBy || [] };
    // SELF-DIES "if it was a creature" (CR 603.4 + 603.6e last-known-info) — the "Enduring"/Glimmer dies-return
    // intervening-if reads whether the DYING object was a creature. Captured from the death look-back's card
    // type line (the object's last-known characteristics, fixed once it left the battlefield), so
    // interveningIf.js reads an identical value at flush AND resolution (the source is gone by then). A
    // creature-front DFC / an Enchantment Creature both read true; a non-creature look-back reads false.
    const diesCtx = { triggeringWasCreature: /\bCreature\b/i.test(String(d.card?.type || d.card?.type_line || "")) };
    // triggeringCardId (UNDEAD BUTLER, 2026-08-15): the dead CARD's durable id, for a dies payoff that
    // must find the card in a graveyard at RESOLVE time ("you may exile it" — the optional-exile-self
    // payment). The permanent is gone by then; the card id is the only stable key. Additive + inert.
    if (d.card?.id) diesCtx.triggeringCardId = d.card.id;
    if (d.power != null) diesCtx.dyingPower = d.power;
    // KW-UNDYING (CR 702.92a + 603.6e last-known-info): the undying intervening-if reads whether the DYING
    // object had any +1/+1 counters AS IT LAST EXISTED on the battlefield. Stamped ONLY when the death
    // look-back carried its `counters` snapshot (every modeled death constructor does) — an entry without
    // one leaves the flag undefined, and interveningIf.js returns null on undefined (can't confirm → the
    // trigger drops, FN-safe — NEVER a fail-open return, which could loop a countered body forever).
    if (d.counters) diesCtx.triggeringHadNoPlusCounters = !((d.counters["+1/+1"] || 0) > 0);
    // KW-PERSIST (PS-1): the -1/-1 mirror of the undying stamp above, same LKI snapshot.
    if (d.counters) diesCtx.triggeringHadNoMinusCounters = !((d.counters["-1/-1"] || 0) > 0);
    // MODULAR (BLITZ MOD-1, CR 702.43a + 603.6e LKI): the actual COUNT of +1/+1 counters the dying object had
    // as it last existed on the battlefield — the magnitude the modular dies payoff moves ("put ITS +1/+1
    // counters on target artifact creature"). Read off the SAME death look-back `counters` snapshot the undying/
    // persist booleans use, so a modular creature grown by added counters (Arcbound Ravager's sac, an Overseer
    // upkeep) moves its FULL total. Stamped only when the snapshot was captured; an entry without one leaves the
    // key undefined → resolveScaledAmount reads 0 → a clean no-op (never a fabricated count).
    if (d.counters) diesCtx.triggeringPlusCounterCount = d.counters["+1/+1"] || 0;
    // COUNTER-TRANSFER (census slice 37, CR 603.6e LKI): the dying object's WHOLE counter bag, for
    // "put ITS counters on target creature you control" (Star Pupil, Essence Channeler, Spiteful Squad).
    // Distinct from triggeringPlusCounterCount above, which is only the +1/+1 magnitude the MODULAR payoff
    // moves — this shape moves every counter type the creature had, so it needs the bag, not a number.
    // Copied (not aliased) off the same death look-back snapshot, so a later mutation can't reach back
    // into it. Stamped only when a snapshot exists; absent → the resolver moves nothing, never invents.
    if (d.counters) diesCtx.triggeringCounterBag = { ...d.counters };
    // POWER-DIFFERED (Jason Bright, CR 603.6e LKI): the dies intervening-if "its power was different from
    // its base power" compares the look-back's EFFECTIVE power (counters + anthems + pumps) against its
    // BASE power (printed / 7b-set). Stamped only when BOTH were captured; a missing capture leaves the
    // flag undefined → interveningIf.js returns null (can't confirm → FN-safe drop, never a guessed draw).
    if (d.power != null && d.basePower != null) diesCtx.triggeringPowerDifferedFromBase = d.power !== d.basePower;
    fired = fired.concat(triggersForEvent(state2, { event: "dies", sourcePermanent: lookBack, triggeringPermanent: lookBack, triggeringContext: diesCtx }));
    for (const pid of Object.keys(state2.players)) {
      for (const watcher of triggerSourcesOf(state2, pid)) {
        fired = fired.concat(triggersForEvent(state2, { event: "dies", sourcePermanent: watcher, triggeringPermanent: lookBack, triggeringContext: diesCtx }));
      }
    }
    // ⭐ …and the Auras that fell off THIS creature as it died (CR 603.10a — see the capture at the top).
    // `scopeMatches`'s equippedCreature branch ALREADY resolves this linkage from the dead creature's
    // look-back `attachments`, which is why nothing about the match needed changing: these sources simply
    // had to be OFFERED.
    //
    // ⚠️ THE LINE BELOW IS A CHEAP PRE-FILTER, NOT A SAFETY GATE — said plainly because it looks like one.
    // A mutation deleting it SURVIVED, including against a two-hosts-dying-at-once test written specifically
    // to catch an over-fire: scopeMatches enforces the identical `attachments` membership itself, so
    // correctness does not depend on this line. It stays only to skip the obviously-unrelated orphans on a
    // wide board (every orphan is otherwise offered against every death in the batch). The real gate is
    // scopeMatches; if that branch is ever loosened, this line will NOT save you.
    for (const orphan of orphanedAuras) {
      if (!(d.attachments || []).includes(orphan.id)) continue;
      fired = fired.concat(triggersForEvent(state2, { event: "dies", sourcePermanent: orphan, triggeringPermanent: lookBack, triggeringContext: diesCtx }));
    }
  }
  // The no-singular-trigger fast path must STILL run the batch pass: a board can hold ONLY batch watchers
  // (Morbid Opportunist alone), in which case `fired` is empty and a bare `return state2` would silently skip
  // them — the card classifies native and never fires, the exact metric-over-claims-runtime drift the CREED
  // forbids. Caught by the n=1 test, which is why that test exists despite looking redundant beside n=3.
  // ===== GRANTED DIES-EXILE (RIVAZ, 2026-08-15) ===== a dead creature whose permanent carried the granted
  // 'When this creature dies, exile it.' (diesExileAfter on the look-back — stamped at cast by the Rivaz
  // trigger, carried through PERMANENT_ETB) has its card moved graveyard → exile HERE, after all death
  // processing (the death REALLY happened — dies triggers fired, the tally counted, unlike exileInstead).
  // Applied immediately rather than as its own stack object: the granted trigger is deterministic and
  // choiceless, and the immediate move is CASTER-PESSIMAL (paper lets the owner order undying/recursion
  // triggers to beat the exile; this model never does) — an under-delivery for the grant's own recipient,
  // never an over-fire. A card no longer in its owner's graveyard (already recurred/replaced) is skipped —
  // a clean FN, mirroring the CR "new object" fizzle.
  const exileGrantedDead = (s) => {
    let out = s;
    for (const d of dead) {
      if (!d?.diesExileAfter || d.exileInstead || d.shuffledInstead || !d.card?.id) continue;
      for (const pid of Object.keys(out.players || {})) {
        const gy = out.players[pid]?.graveyard || [];
        const gi = gy.findIndex((c) => c?.id === d.card.id);
        if (gi === -1) continue;
        const card = gy[gi];
        out = { ...out, players: { ...out.players, [pid]: { ...out.players[pid], graveyard: [...gy.slice(0, gi), ...gy.slice(gi + 1)], exile: [...(out.players[pid].exile || []), card] } } };
        out = logEvent(out, { kind: "spell-effect", effect: "granted-dies-exile", cardName: card.name, controller: d.controller });
        break;
      }
    }
    return out;
  };
  if (!fired.length) return exileGrantedDead(checkDiesBatchTriggers(state2, dead));
  // DIES-TRIGGER MULTIPLIER (Teysa Karlov): every fire here is caused by a CREATURE dying (event "dies",
  // triggeringPermanent a dead creature) → each qualifying ability triggers an additional time per multiplier
  // its controller controls. Applied AFTER the fired list is fully built so a batch of simultaneous deaths is
  // multiplied uniformly. checkPlaneswalkerDiesTriggers deliberately does NOT call this — a planeswalker dying
  // is not "a creature dying" (CR — Teysa's clause names creatures), so PW-death triggers are never doubled.
  fired = multiplyDiesTriggers(state2, fired);
  const afterSingular = { ...state2, pendingTriggers: [...(state2.pendingTriggers || []), ...fired] };
  // BATCHED DEATHS (CR 603.1) — the once-per-batch watchers ("Whenever one or more creatures die") fire off
  // the SAME death list at the SAME site. Chained here rather than wired into the 10+ call sites that reach
  // checkDiesTriggers (combat, destroy, sacrifice, amass, SBA …) so no death path can silently miss them —
  // a missed site would be a watcher that never fires while the metric credits the card native.
  //
  // NOT passed through multiplyDiesTriggers: a doubler (Teysa) arguably multiplies a batch trigger too, but
  // leaving it unmultiplied is the UNDER-fire, which is the safe direction. Deliberate, not overlooked.
  return exileGrantedDead(checkDiesBatchTriggers(afterSingular, dead));
}

/**
 * BATCHED DEATHS (CR 603.1) — fire `diesBatch` watchers ONCE for a batch of simultaneous deaths.
 *
 * The whole point, and the only thing that makes this safe: the `break` below. A watcher fires exactly ONCE
 * per call no matter how many creatures died, which is what "Whenever ONE OR MORE creatures die" means. The
 * singular `dies` path (checkDiesTriggers) fires once PER creature and is untouched — a diesBatch descriptor
 * can never enter that loop because it carries a different event name, so the over-fire is unrepresentable.
 *
 * Scope is evaluated by handing each dead creature to triggersForEvent in turn and taking the FIRST watcher
 * hit: that reuses the identical scopeMatches logic the singular path uses (controller scope, not-self,
 * layer-aware creature-ness) rather than duplicating it. The CR-603.10a look-back carries `attachments` and
 * `counters` exactly as checkDiesTriggers builds it, so a scope needing last-known info reads the same bag.
 *
 * EXILE-INSTEAD (CR 614 + 700.4) is filtered first, mirroring checkDiesTriggers: a creature exiled instead of
 * being put into a graveyard never DIED, so it must not contribute to the batch — otherwise a Lava-Coil-class
 * removal would fire a death watcher that saw no death.
 *
 * Pure — appends to pendingTriggers.
 */
export function checkDiesBatchTriggers(state, dead) {
  const deaths = (dead || []).filter((d) => d?.card && !d.exileInstead);
  if (!deaths.length) return state;
  let fired = [];
  for (const pid of Object.keys(state.players)) {
    for (const watcher of triggerSourcesOf(state, pid)) {
      for (const d of deaths) {
        const lookBack = { id: d.id, controller: d.controller, card: d.card, attachments: d.attachments || [], counters: d.counters || {} };
        const hits = triggersForEvent(state, { event: "diesBatch", sourcePermanent: watcher, triggeringPermanent: lookBack });
        if (hits.length) { fired = fired.concat(hits); break; }  // ONCE per watcher per batch — CR 603.1
      }
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * PLANESWALKER-DIES (CR 700.4 / 704.5i) — fire "dies" triggers for a batch of PLANESWALKERS that just went
 * to a graveyard (destroyZeroLoyaltyPlaneswalkers' `dead` look-back, shape `{ id, controller, name, card }`).
 * A planeswalker "dies" in the CR-700.4 sense (it's put into a graveyard from the battlefield); the ONLY
 * modeled watcher that responds is the creatureOrPwYouControl scope (Cruel Celebrant — "a creature OR
 * PLANESWALKER you control dies"). Every creature-only dies scope (creatureYouControl / eachCreature /
 * subtypeYouControl / self) correctly SKIPS a planeswalker triggering-permanent (its isCreaturePerm /
 * subtype / id check is false for a PW), so reusing the generic dies event here can NOT mis-fire a
 * creature-death watcher — the new scope is the sole path a PW death reaches. A planeswalker's OWN
 * "when this dies" self-trigger would fire here too (CR-correct), but no native PW carries one (the two
 * corpus PWs with a dies trigger watch CREATURES and are arbiter-pw tier anyway), so this is collateral-free.
 *
 * Deliberately does NOT drain pendingLeaveEvents (unlike checkDiesTriggers) — the creature death pass at the
 * same SBA already drained it; draining again here is a harmless no-op but the separation keeps the two
 * dispatches independent. No dyingPower ctx (a planeswalker has no power → an amount-scaled payoff would read
 * 0, but the only modeled watcher is the flat each-opponent drain). Pure — appends to pendingTriggers.
 */
export function checkPlaneswalkerDiesTriggers(state, deadPw) {
  if (!deadPw || !deadPw.length) return state;
  let fired = [];
  for (const d of deadPw) {
    if (!d?.card) continue;
    const lookBack = { id: d.id, controller: d.controller, card: d.card };
    // self ("when this planeswalker dies") + every surviving watcher ("a creature or planeswalker you control dies")
    fired = fired.concat(triggersForEvent(state, { event: "dies", sourcePermanent: lookBack, triggeringPermanent: lookBack }));
    for (const pid of Object.keys(state.players)) {
      for (const watcher of triggerSourcesOf(state, pid)) {
        fired = fired.concat(triggersForEvent(state, { event: "dies", sourcePermanent: watcher, triggeringPermanent: lookBack }));
      }
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * SELF-LTB (Wave 4) — fire "leaves the battlefield" (LTB / put-into-a-graveyard) triggers for the
 * permanents gameState.detachPermanentFromAll recorded on `state.pendingLeaveEvents` (a plain-JSON look-back
 * list: `{ id, controller, card, toGraveyard }`, CR 603.6e/603.10a), then ALWAYS CLEAR the queue (idempotent
 * — a second call sees an empty list). gameState can't import triggers.js (circular-import hazard), so the
 * emit-side only records data and this triggers-side drains it. Each leave fires its OWN watcher (a self-LTB
 * trigger like Rancor's PiG-return — the only "ltb" detector today, so a plain creature/equipment leaving
 * matches nothing and is a no-op). This is the GENERIC LTB emitter the brief asks for (Wave-5
 * LTB-counter-relocation, The Ozolith, reuses it without re-plumbing). Pure; appends to pendingTriggers.
 *
 * The look-back is BOTH sourcePermanent and triggeringPermanent (the self pattern, mirroring
 * checkDiesTriggers' self path) so scopeMatches' "self" fires and the resolver gets the leaving object's
 * card in context (makePendingTrigger threads triggeringCardId/triggeringController). A token leaving carries
 * no return semantics — the resolver self-guards on card.token (CR 111.7), so emitting it here is harmless.
 */
export function checkLeavesTriggers(state) {
  const events = state.pendingLeaveEvents || [];
  if (!events.length) return state;
  // Always clear the queue, whether or not anything matched, so events never leak across SBA checks.
  const cleared = { ...state, pendingLeaveEvents: [] };
  let fired = [];
  for (const e of events) {
    if (!e?.card) continue;
    // The look-back carries `leftToGraveyard` so the PiG watcher scopes (graveyard-only) can distinguish a
    // graveyard exit from a bounce/exile; the LEAVES watcher (Nadier's token-leaves) ignores it (fires on any exit).
    const lookBack = { id: e.id, controller: e.controller, card: e.card, leftToGraveyard: !!e.toGraveyard };
    // EARTHBEND-RETURN (CR 603.7) — the animated land's "when it dies or is exiled, return it to the battlefield
    // tapped" delayed trigger. Flag-driven (combat.applyEarthbend set `earthbendReturn`; gameState.recordLeaveEvent
    // carried it + the destination zone onto this look-back). Fire ONLY on a graveyard (dies) or exile exit — never
    // a bounce to hand / tuck to library. The land's own oracle has no such trigger, so it's synthesized here to ride
    // the normal pendingTriggers flush; the marker effectClause routes to zones.applyEarthbendReturn (return tapped).
    if (e.earthbendReturn && (e.toZone === "graveyard" || e.toZone === "exile")) {
      const desc = { event: "earthbendReturn", scope: "self", whose: "any", optional: false, effectClause: `[earthbend-return:${e.toZone}] return it to the battlefield tapped` };
      fired = fired.concat(makePendingTrigger(desc, lookBack, lookBack, {}));
    }
    // DETAIN-RETURN (DT-1, CR 610.3a) — the leaving permanent carried linked exiles (Banishing Light /
    // Banisher Priest: "exile … until this <word> leaves the battlefield"). Synthesized on ANY exit —
    // graveyard, exile, bounce, tuck (the "until" duration ends however the detainer leaves), UNLIKE
    // earthbend's dies-or-exiled rider. The links ride the trigger context; zones.applyDetainReturn
    // re-enters each card from its owner's exile zone (a gone card is a clean no-op).
    if (e.detainedExile?.length) {
      const desc = { event: "detainReturn", scope: "self", whose: "any", optional: false, effectClause: "[detain-return] return the exiled cards to the battlefield" };
      fired = fired.concat(makePendingTrigger(desc, lookBack, lookBack, { detainedExile: e.detainedExile }));
    }
    // SELF-PiG ("ltb") — the Aura self-PiG-return (Rancor), printed "is put INTO A GRAVEYARD from the
    // battlefield" (CR 700.4 — NOT a bounce/exile). Fire "ltb" ONLY for a graveyard exit; a bounce/exile leave
    // is recorded but not fired here (firing would WRONGLY return a bounced Aura — a false positive). The self
    // scope reads sourcePermanent === triggeringPermanent (the look-back is both).
    if (e.toGraveyard) {
      fired = fired.concat(triggersForEvent(cleared, { event: "ltb", sourcePermanent: lookBack, triggeringPermanent: lookBack }));
    }
    // LEAVES-SELF (BLITZ LV-1) — the leaving permanent's OWN "enters or leaves the battlefield" half:
    // fired on EVERY exit (graveyard, exile, bounce, tuck — CR 603.6c "leaves the battlefield" has no
    // zone gate, unlike the graveyard-only "ltb" self-PiG above). The look-back rides as BOTH source and
    // triggering (the self pattern), so scope "self" matches the permanent that just left.
    fired = fired.concat(triggersForEvent(cleared, { event: "leavesSelf", sourcePermanent: lookBack, triggeringPermanent: lookBack }));
    // WATCHER LTB / PiG ("permanentLeaves") — the aristocrats LTB drains (Marionette Apprentice/Master,
    // Nadier's Nightblade, Tablet of Epityr). scopeMatches' permanentLeaves scopes gate on the leaving
    // permanent's type / controller / token-ness / graveyard-ness. A bounce/exile leave is passed too — only
    // the tokenYouControlLeaves scope (any exit) responds; the PiG scopes require leftToGraveyard, so a
    // bounced creature/artifact never fires a PiG drain.
    //
    // SELF-source FIRST (the look-back as BOTH source and triggering) — a permanent whose OWN
    // "an artifact you control is put into a graveyard" watcher should fire when IT dies (Tablet of Epityr,
    // Marionette Master): by the time this runs the permanent is already in the graveyard, so it is NOT in
    // triggerSourcesOf (the battlefield scan) below. The bare ("an artifact you control") scope self-matches;
    // an "another …" scope (excludeSelf) skips itself via the id check, so a self-excluding watcher never
    // mis-fires on its own death. The battlefield scan below then covers every OTHER (surviving) watcher.
    fired = fired.concat(triggersForEvent(cleared, { event: "permanentLeaves", sourcePermanent: lookBack, triggeringPermanent: lookBack }));
    for (const pid of Object.keys(cleared.players)) {
      for (const watcher of triggerSourcesOf(cleared, pid)) {
        fired = fired.concat(triggersForEvent(cleared, { event: "permanentLeaves", sourcePermanent: watcher, triggeringPermanent: lookBack }));
      }
    }
  }
  if (!fired.length) return cleared;
  return { ...cleared, pendingTriggers: [...(cleared.pendingTriggers || []), ...fired] };
}

/**
 * Enqueue step-boundary triggers (CR 603.2b) for the given event ("upkeep" /
 * "draw" / "endStep"). Scans every battlefield permanent; the descriptor's
 * `whose:"yours"` gate (applied in triggersForEvent) fires "your upkeep" only on
 * the controller's own turn while "each upkeep" fires on every turn. Pure.
 */
export function checkStepTriggers(state, event) {
  let fired = [];
  // UPKEEP-PLAYER REFERENT (BLITZ TR-2 — CR 503.1a): at an upkeep-step entry, the player whose upkeep it is
  // IS the active player. Thread it as ctx.upkeepPlayerId so an "each player's upkeep" trigger's rewritten
  // "the upkeep player <effect>" atoms (who:"upkeepPlayer") bind the right player at resolution — pinned in
  // the context at ENQUEUE time, so a delayed resolution can never drift to another seat. Additive plain
  // data on every upkeep descriptor's context; every non-upkeepPlayer consumer ignores it.
  // Widened to the DRAW step (CR 504.1): the player whose draw step it is is likewise the active player, so
  // an "each player's draw step" trigger's rewritten "the upkeep player <effect>" atoms bind the same way.
  // The field keeps its historical name — read it as "the player whose STEP it is". ⚠️ This threading and
  // triggerRouting's who:"upkeepPlayer" event check are a DOUBLE GATE and must be widened together: thread
  // without routing and the card is refused; route without threading and the referent is unset at
  // resolution and the clause silently no-ops — the dropped-clause FP.
  const stepCtx = (event === "upkeep" || event === "draw") ? { upkeepPlayerId: state.activePlayer } : {};
  for (const pid of Object.keys(state.players)) {
    for (const perm of triggerSourcesOf(state, pid)) {
      // A GY-FUNCTIONING descriptor never fires from the battlefield - its own text says where it works
      // (CR 603.3d). Excluded here, fired only by the graveyard scan below. Third instance of this shape
      // (checkMilledTriggers, checkCastTriggers); see the Eidolon note that the exclusion is a PRE-FILTER,
      // not the safety gate - the effect keys on a sourceCardId only the graveyard scan stamps.
      fired = fired.concat(triggersForEvent(state, { event, sourcePermanent: perm, triggeringContext: stepCtx, descriptorFilter: (d) => !d.functionsFromGraveyard }));
    }
    // ===== GY-FUNCTIONING step triggers (Old One Eye's first-main return, CR 603.3d) =====
    for (const gyCard of state.players[pid]?.graveyard || []) {
      fired = fired.concat(triggersForEvent(state, {
        event,
        sourcePermanent: { id: `gy-${gyCard.id}`, controller: pid, card: gyCard },
        triggeringContext: { ...stepCtx, sourceCardId: gyCard.id },
        descriptorFilter: (d) => !!d.functionsFromGraveyard,
      }));
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * Enqueue attack triggers (CR 508.3) for the full declared-attacker batch in
 * state.combat.attackers: each attacker's own "whenever this attacks" plus every
 * "whenever a creature you control attacks" watcher the attacking player
 * controls. Context carries the defenderId. Pure.
 */
export function checkAttackTriggers(state) {
  const attackers = state.combat?.attackers || [];
  if (!attackers.length) return state;
  let fired = [];
  // ===== "WHENEVER YOU ATTACK" — fires ONCE per combat (not per attacker) =====
  // All attackers belong to the same active player, so we use the first entry's attackingPlayer.
  // triggerSourcesOf covers battlefield permanents + emblems; triggersForEvent gates on scope:"you"
  // (always true) + whose:"any", so the trigger fires regardless of whose turn it is.
  const attackingPlayer = attackers[0]?.attackingPlayer;
  if (attackingPlayer) {
    // BATTALION / ATTACK-COUNT gate (CR 702.101a) — a youAttack descriptor may carry `minAttackers` and
    // `requireSelfAttacking`. Both are evaluated HERE, against the DECLARED batch, because that is the only
    // point where the full attacking set is known (CR 508.1 declares them simultaneously, so counting at a
    // per-attacker site would see a partial batch and misfire).
    // The count is the attacking player's OWN declared attackers — every entry in state.combat.attackers
    // belongs to the active player, which is the same assumption the once-per-combat pass already makes.
    const attackerIds = new Set(attackers.map((a) => a.permanentId));
    const attackerCount = attackers.length;
    for (const watcher of triggerSourcesOf(state, attackingPlayer)) {
      const raw = triggersForEvent(state, { event: "youAttack", sourcePermanent: watcher, triggeringPermanent: null, triggeringContext: {} });
      fired = fired.concat(raw.filter((t) => {
        const d = t?.descriptor || t;
        // A descriptor with neither field is an ordinary "whenever you attack" — unchanged, byte-for-byte.
        if (d?.minAttackers != null && attackerCount < d.minAttackers) return false;
        if (d?.requireSelfAttacking && !attackerIds.has(watcher.id)) return false;
        return true;
      }));
    }
  }
  // ===== PER-ATTACKER triggers ("this attacks", "a creature you control attacks") =====
  for (const a of attackers) {
    const lk = findPermanent(state, a.permanentId);
    if (!lk) continue;
    const attackerPerm = lk.permanent;
    // SC-1: carry the pw-attack marker so a "attacks a PLAYER"-conditioned trigger (Sword Coast Sailor's
    // life-comparison intervening-if) can FN-drop on a planeswalker attack (CR — attacking a walker is
    // not attacking a player). Absent on a face attack; every other consumer ignores it.
    const context = { defenderId: a.defender, ...(a.defenderPlaneswalkerId ? { defenderPlaneswalkerId: a.defenderPlaneswalkerId } : {}) };
    // self ("this attacks") + the attacker's own "creature you control attacks"
    fired = fired.concat(triggersForEvent(state, { event: "attacks", sourcePermanent: attackerPerm, triggeringPermanent: attackerPerm, triggeringContext: context }));
    // ATTACKS-OR-BECOMES-TARGET (CR 603.2) — the ATTACK site of Goldspan's compound self-trigger. The
    // descriptor is scope:"self", so it fires ONLY for the attacking permanent's own compound trigger (never a
    // watcher's) — the becomes-target site is handled separately in checkCastTriggers. Same per-attacker batch
    // as "attacks" above, so it can't drift from the declare-attackers event.
    fired = fired.concat(triggersForEvent(state, { event: "attacksOrBecomesTarget", sourcePermanent: attackerPerm, triggeringPermanent: attackerPerm, triggeringContext: context }));
    // CHOSEN-TYPE (Kindred Discovery) — the "attacks" half. The attacking player's watchers (Kindred is an
    // Enchantment they control) fire when this attacker is a creature they control of the chosen type. Same
    // attacker batch as the "attacks" event above (CR 508.3), so it can't drift from the per-attacker fire.
    for (const watcher of triggerSourcesOf(state, a.attackingPlayer)) {
      fired = fired.concat(triggersForEvent(state, { event: "chosenTypeEntersOrAttacks", sourcePermanent: watcher, triggeringPermanent: attackerPerm, triggeringContext: context }));
    }
    // other watchers the attacking player controls
    for (const watcher of triggerSourcesOf(state, a.attackingPlayer)) {
      if (watcher.id === attackerPerm.id) continue;
      fired = fired.concat(triggersForEvent(state, { event: "attacks", sourcePermanent: watcher, triggeringPermanent: attackerPerm, triggeringContext: context }));
    }
    // ATTACHED watchers ANOTHER player controls (BLITZ OC-1 hardening) — an Aura/Equipment attached to
    // this attacker whose controller is NOT the attacking player (an Ordeal cast on an opponent's
    // creature — legal per its bare "Enchant creature", CR 303.4; or a host that changed control). Its
    // "Whenever enchanted/equipped creature attacks" descriptor (the equippedCreature attached-linkage
    // scope) would otherwise silently never fire: the scan above covers ONLY the attacking player's
    // watchers — a dropped trigger in a reachable state (a forbidden FP once the card claims native).
    // Walk the attacker's attachments and fire exactly the not-already-scanned controllers' watchers
    // (the id-set gate makes a double-fire impossible by construction; scopeMatches re-checks the
    // attached linkage as always).
    for (const attachId of attackerPerm.attachments || []) {
      const alk = findPermanent(state, attachId);
      if (!alk || alk.controller === a.attackingPlayer) continue; // already scanned above
      // anyCreature EXCLUDED here: an attached watcher on another player's battlefield is ALSO covered by
      // the all-non-attacking-players scan below — without this filter an anyCreature descriptor on an
      // attached permanent would double-fire (the subtypeGlobal de-dup pattern, applied at both sites).
      fired = fired.concat(triggersForEvent(state, { event: "attacks", sourcePermanent: alk.permanent, triggeringPermanent: attackerPerm, triggeringContext: context, scopeFilter: (s) => s !== "anyCreature" }));
    }
    // ===== ANY-CREATURE watchers on NON-attacking players' battlefields (Caltrops — "Whenever a creature
    // attacks") ===== The scans above cover the attacker itself + every watcher the ATTACKING player
    // controls, so together with this scan each watcher/attacker pair is visited exactly once by
    // construction. Gated to exactly the anyCreature scope so no other descriptor gains a second site.
    for (const [pid, pl] of Object.entries(state.players || {})) {
      if (pid === a.attackingPlayer) continue; // the attacking side is fully covered above
      void pl;
      for (const watcher of triggerSourcesOf(state, pid)) {
        fired = fired.concat(triggersForEvent(state, { event: "attacks", sourcePermanent: watcher, triggeringPermanent: attackerPerm, triggeringContext: context, scopeFilter: (s) => s === "anyCreature" }));
      }
    }
  }
  // ===== KW-EXALTED (CR 702.83a — BLITZ EX-1, the rampage fire-time pattern) ===== "Whenever a creature
  // you control attacks alone, that creature gets +1/+1 until end of turn." Fires ONLY when the attacking
  // player declared EXACTLY ONE attacker: count the exalted instances across THAT player's battlefield
  // (any permanent type carries it — Finest Hour is an enchantment; reminder-stripped, one count per
  // printed instance), then push ONE aggregated fire-time descriptor pumping the LONE ATTACKER +N/+N
  // (sourcePermanent = triggeringPermanent = the attacker, so "this creature" binds to it — behaviorally
  // identical to N separate +1/+1 triggers for the symmetric until-EOT pump). The "exalted" event name has
  // no generic firing site (coverage-only elsewhere), so nothing double-fires.
  if (attackers.length === 1) {
    const soleLk = findPermanent(state, attackers[0].permanentId);
    const atkPlayer = attackers[0].attackingPlayer;
    // ===== ATTACKS-ALONE (BLITZ TR-2, CR 506.5) ===== exactly ONE creature was declared as an attacker, so
    // every "attacks alone" trigger fires — the SAME structural gate exalted's aggregated fire rides (CR
    // 702.83b defers to 506.5), so the detection metric and this fire site can't drift: a multi-attacker
    // declaration never enters this block, so an attacksAlone descriptor can NEVER over-fire (the FP the
    // old blanket detection guard existed to prevent). Scan the attacking player's watchers (battlefield +
    // emblems) with the SOLE attacker as the triggering permanent: scope "self" matches only the attacker's
    // own printed trigger (id check); scope "creatureYouControl" matches every watcher of the attacking
    // player (the watcher itself included — the bare "a creature you control" reading). The context carries
    // the declared defender so a "defending player …" payoff (Nefarox — CR 508.5) binds, mirroring the
    // per-attacker "attacks" context above. Fired ONCE per combat by construction (one declaration batch).
    if (soleLk && atkPlayer) {
      const aloneCtx = { defenderId: attackers[0].defender, ...(attackers[0].defenderPlaneswalkerId ? { defenderPlaneswalkerId: attackers[0].defenderPlaneswalkerId } : {}) };
      for (const watcher of triggerSourcesOf(state, atkPlayer)) {
        fired = fired.concat(triggersForEvent(state, { event: "attacksAlone", sourcePermanent: watcher, triggeringPermanent: soleLk.permanent, triggeringContext: aloneCtx }));
      }
    }
    if (soleLk && atkPlayer) {
      // SLIVER INTERIORS (BLITZ SP-1): per permanent, printed instances via the STRUCTURAL counter
      // (a grant line "…have exalted" is no longer mis-counted as the granter's own instance) PLUS
      // granted instances via the layer-6 index (First Sliver's Chosen / Sublime Archangel anthems,
      // until-EOT grants) — gate-aware, one +1/+1 per instance across the whole battlefield (702.83a).
      let exaltedCount = 0;
      for (const p of state.players?.[atkPlayer]?.battlefield || []) {
        exaltedCount += keywordInstanceCount(state, p.id, "Exalted",
          exaltedKeywordCount(p.card?.oracle || p.card?.oracle_text || ""));
      }
      if (exaltedCount > 0) {
        const descriptor = {
          event: "exalted", scope: "self", whose: "any", effect: null,
          effectClause: `this creature gets +${exaltedCount}/+${exaltedCount} until end of turn`,
          optional: false, sourceText: `Exalted ×${exaltedCount}`,
        };
        fired.push(makePendingTrigger(descriptor, soleLk.permanent, soleLk.permanent, {}));
      }
    }
  }
  if (!fired.length) return state;
  // ATTACKS-WHILE (Pugnacious Hammerskull) — the FIRE-TIME-ONLY event condition, evaluated HERE at
  // declaration against the live board (the single enqueue point, so every lane above is gated
  // uniformly). Deliberately NOT interveningIf: the printed "attacks while <cond>" is part of the
  // trigger EVENT and is never re-checked at resolution. Strict — anything but an affirmative true
  // refuses to fire (the detection carve admitted only interveningIfParseable conditions, so a null
  // here means the state cannot answer; refusing is the FN-safe direction).
  fired = fired.filter((t) => {
    const d = t?.descriptor || t;
    if (!d?.attacksWhileIf) return true;
    return evaluateInterveningIf(state, d.attacksWhileIf, t?.controller, { sourcePermanentId: t?.source?.permanentId ?? null }) === true;
  });
  if (!fired.length) return state;
  // ATTACK-TRIGGER MULTIPLIER (Isshin, CR 603.x): every ability in this list fired because a creature
  // attacked, so each is repeated once per attack-multiplier static ITS controller controls. Applied at
  // the single enqueue point so every attack event above — youAttack, per-attacker attacks, exalted —
  // multiplies uniformly rather than one lane at a time.
  fired = multiplyAttackTriggers(state, fired);
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

// ── BASILISK TOUCH shared vocabulary (BLITZ DG-1 + BT-2 — the Deathgazer contact family) ──
// One anchored regex + filter table consumed by BOTH the detectTriggers coverage descriptor and the
// checkBlockTriggers fire site (no drift between what classifies and what fires). Exactly the four
// EVIDENCED partner filters; the bare alternative is LAST so a filtered wording can never fall through
// to it, and the sentence-end lookahead rejects any rider after "at end of combat" (CREED, FN-safe).
const BASILISK_TOUCH_RE = /(?:^|[\n.;]\s*)whenever this creature blocks or becomes blocked by (a nonblack creature|a non-wall creature|a green or white creature|a creature), destroy that creature at end of combat(?=\s*(?:\.|\n|$))/i;
const BASILISK_FILTERS = {
  "a nonblack creature": { tag: "nonblack", filter: { kind: "notColor", color: "B" } },                       // Deathgazer / Dread Specter (DG-1)
  "a non-wall creature": { tag: "non-wall", filter: { kind: "notSubtypeOrChangeling", subtype: "wall" } },    // Rock Basilisk / Cockatrice / Thicket Basilisk
  "a green or white creature": { tag: "green-or-white", filter: { kind: "anyColor", colors: ["G", "W"] } },   // Abomination
  "a creature": { tag: "any", filter: null },                                                                  // Venomous Dragonfly / Tangle Asp
};
function basiliskTouchOf(oracle) {
  const m = String(oracle || "").replace(/\([^)]*\)/g, " ").match(BASILISK_TOUCH_RE);
  return m ? BASILISK_FILTERS[m[1].toLowerCase()] || null : null;
}
// Does the contact PARTNER satisfy the printed filter RIGHT NOW? Every read is layer-aware — the same
// live reads the rest of combat enforcement uses — because firing on a partner the filter excludes
// would destroy a creature the card never touches (a forbidden FP):
//   notColor / anyColor — permanentColors (deriveCharacteristics; the engine's live color truth).
//   notSubtypeOrChangeling — permanentTypes' layer-4-aware subtypes UNIONED with the changeling gate:
//     a changeling has EVERY creature type (CR 702.73a), so it IS a Wall and "non-Wall" EXCLUDES it —
//     the trigger does NOT fire on a changeling partner. permanentHasKeyword reads changeling
//     layer-aware (printed ∪ granted), the widest exclusion (missing one would be the FP direction).
// An unknown filter kind never fires (FN-safe).
function basiliskPartnerMatches(state, filter, partnerId) {
  if (!filter) return true;
  if (filter.kind === "notColor") {
    return !(permanentColors(state, partnerId) || []).some((c) => String(c).toUpperCase() === filter.color);
  }
  if (filter.kind === "anyColor") {
    const have = new Set((permanentColors(state, partnerId) || []).map((c) => String(c).toUpperCase()));
    return filter.colors.some((c) => have.has(c));
  }
  if (filter.kind === "notSubtypeOrChangeling") {
    if (permanentHasKeyword(state, partnerId, "changeling")) return false;
    const subs = (permanentTypes(state, partnerId)?.subtypes || []).map((s) => String(s).toLowerCase());
    return !subs.includes(filter.subtype);
  }
  return false;
}

/**
 * BLOCK triggers (subsystem 2) — at the declare-blockers step, enqueue the SELF block triggers the spine
 * detected but never fired: each BLOCKER's "Whenever this creature blocks, …" (CR 509.1a) and each ATTACKER
 * that became blocked's "Whenever this creature becomes blocked, …" (CR 509.1h). Both are scope:"self" (the
 * only modeled block-trigger shape — classifyCondition leaves compound/restricted forms undetected), so the
 * source IS the triggering permanent. Each creature fires AT MOST ONCE (a creature blocking/blocked by
 * several is still one "blocks"/"becomes blocked" event — CR 509.1; deduped by id). Mirrors checkAttackTriggers; pure.
 */
export function checkBlockTriggers(state) {
  const blockers = state.combat?.blockers || [];
  if (!blockers.length) return state;
  let fired = [];
  const seenBlocker = new Set();
  for (const b of blockers) {
    if (!b?.blockerId || seenBlocker.has(b.blockerId)) continue;
    seenBlocker.add(b.blockerId);
    const lk = findPermanent(state, b.blockerId);
    if (!lk) continue;
    fired = fired.concat(triggersForEvent(state, { event: "blocks", sourcePermanent: lk.permanent, triggeringPermanent: lk.permanent, triggeringContext: {} }));
  }
  const seenAttacker = new Set();
  for (const b of blockers) {
    if (!b?.attackerId || seenAttacker.has(b.attackerId)) continue;
    seenAttacker.add(b.attackerId);
    const lk = findPermanent(state, b.attackerId);
    if (!lk) continue;
    // DEFENDING-PLAYER (CR 509.1h) — thread the blocked attacker's declared defender into the context so a
    // becomes-blocked effect that reads "defending player" (AFFLICT — "defending player loses N life") resolves
    // to the right player. The attacker's `defender` was stamped at declare-attackers (checkAttackTriggers uses
    // the same field). Absent (a synthetic combat with no attacker record) → applyLoseLife's defendingPlayer
    // branch is a clean no-op, never a fabricated/wrong loss. Non-afflict becomes-blocked effects ignore it.
    const attackerRec = (state.combat?.attackers || []).find((a) => a?.permanentId === b.attackerId);
    const context = attackerRec?.defender ? { defenderId: attackerRec.defender } : {};
    fired = fired.concat(triggersForEvent(state, { event: "becomesBlocked", sourcePermanent: lk.permanent, triggeringPermanent: lk.permanent, triggeringContext: context }));
  }
  // BECOMES-BLOCKED-BY-A-CREATURE (BLITZ CT-1, CR 509.3d) — the "by a creature" wording triggers ONCE
  // FOR EACH creature that blocks (a double-block = two triggers = the self-pump twice), so this loop is
  // per block PAIR with NO attacker dedup — the deliberate contrast with the seenAttacker-deduped
  // becomesBlocked loop above (CR 509.3c — the bare wording is once per combat). The ATTACKER is both
  // source and triggering permanent (the scope:"self" contract — its "this creature" self-pump binds to
  // it, exactly like the becomesBlocked loop above); the per-BLOCKER multiplicity is carried by the
  // per-pair fire count, and the modeled effect never reads the blocker. Routed through
  // triggersForEvent so printed AND granted lines fire (Retaliation's group grant re-detects on the
  // quoted body via grantedTriggersForGroup).
  for (const b of blockers) {
    if (!b?.blockerId || !b?.attackerId) continue;
    const att = findPermanent(state, b.attackerId);
    const blk = findPermanent(state, b.blockerId);
    if (!att || !blk) continue;
    fired = fired.concat(triggersForEvent(state, { event: "becomesBlockedByCreature", sourcePermanent: att.permanent, triggeringPermanent: att.permanent, triggeringContext: {} }));
    // ⭐ BLOCKS-A-CREATURE (CR 509.1a/509.3d) — the BLOCKER's mirror of the line above, in the same per-pair
    // loop with the same NO-DEDUP contract: a creature blocking two attackers fires twice, once per blocked
    // creature, which is what "blocks a creature" means (the bare "blocks" wording above is deduped instead).
    // ⛔ SOURCE AND TRIGGERING PERMANENT ARE DIFFERENT HERE — source is the blocker (its card prints the
    // ability, so "this creature" binds to it), triggering is the attacker it blocked (so "that creature"
    // binds to THAT). Every other block event in this function passes the same permanent twice.
    fired = fired.concat(triggersForEvent(state, { event: "blocksCreature", sourcePermanent: blk.permanent, triggeringPermanent: att.permanent, triggeringContext: {} }));
  }
  // BUSHIDO (subsystem 2) — the combined "blocks OR becomes blocked" event fires for a creature in EITHER
  // role: each blocker AND each blocked attacker. Deduped across both roles so a creature that somehow
  // blocks AND is blocked the same combat still fires its bushido once (CR 702.46a — one event).
  const seenEither = new Set();
  for (const id of [...seenBlocker, ...seenAttacker]) {
    if (seenEither.has(id)) continue;
    seenEither.add(id);
    const lk = findPermanent(state, id);
    if (!lk) continue;
    fired = fired.concat(triggersForEvent(state, { event: "blocksOrBecomesBlocked", sourcePermanent: lk.permanent, triggeringPermanent: lk.permanent, triggeringContext: {} }));
  }
  // RAMPAGE (subsystem 2, CR 702.23a) — a Rampage N attacker blocked by ≥2 creatures gets +N/+N "for each
  // creature blocking it beyond the first" = N × (blockerCount − 1). The amount is DYNAMIC, so fire a
  // fire-time descriptor directly via makePendingTrigger (the detectTriggers "rampage" descriptor is
  // coverage-only). Blocked by exactly 1 → 0 creatures beyond the first → no pump, no trigger (CR 702.23a).
  const blockerCount = {};
  for (const b of blockers) if (b?.attackerId) blockerCount[b.attackerId] = (blockerCount[b.attackerId] || 0) + 1;
  for (const [attId, count] of Object.entries(blockerCount)) {
    if (count < 2) continue;
    const lk = findPermanent(state, attId);
    if (!lk) continue;
    const ramp = String(lk.permanent.card?.oracle || lk.permanent.card?.oracle_text || "").match(/\brampage (\d+)\b/i);
    if (!ramp) continue;
    const amt = parseInt(ramp[1], 10) * (count - 1);
    if (amt <= 0) continue;
    const descriptor = { event: "rampage", scope: "self", whose: "any", effect: null, effectClause: `this creature gets +${amt}/+${amt} until end of turn`, optional: false, sourceText: `Rampage ${ramp[1]}` };
    fired.push(makePendingTrigger(descriptor, lk.permanent, lk.permanent, {}));
  }
  // PER-BLOCKER PUMP (BLITZ RE-1 — the rampage sibling): a blocked attacker printed "becomes blocked,
  // it gets +N/+M until end of turn for each creature blocking it" pumps N×count/M×count — counting ALL
  // blockers (one blocker ⇒ one pump, where rampage's beyond-the-first would be zero). Same fire-time
  // dynamic-descriptor pattern as rampage; the detectTriggers "perBlockerPump" descriptor is coverage-only.
  for (const [attId, count] of Object.entries(blockerCount)) {
    if (count < 1) continue;
    const lk = findPermanent(state, attId);
    if (!lk) continue;
    const pbp = String(lk.permanent.card?.oracle || lk.permanent.card?.oracle_text || "").replace(/\([^)]*\)/g, " ")
      .match(/(?:^|[\n.;]\s*)whenever this creature becomes blocked, (?:it|this creature) gets \+(\d+)\/\+(\d+) until end of turn for each creature blocking it\b/i);
    if (!pbp) continue;
    const p = parseInt(pbp[1], 10) * count;
    const tf = parseInt(pbp[2], 10) * count;
    if (p <= 0 && tf <= 0) continue;
    const descriptor = { event: "perBlockerPump", scope: "self", whose: "any", effect: null, effectClause: `this creature gets +${p}/+${tf} until end of turn`, optional: false, sourceText: `becomes blocked per-blocker pump ×${count}` };
    fired.push(makePendingTrigger(descriptor, lk.permanent, lk.permanent, {}));
  }
  // FLANKING (BLITZ FL-1, CR 702.25a) — per block PAIR: the blocked ATTACKER prints flanking (one fire
  // per printed instance, CR 702.25b) and the BLOCKER lacks flanking RIGHT NOW (layer-aware — a blocker
  // granted flanking is immune). The blocker rides as the TRIGGERING permanent so the synthesized
  // "the triggering creature gets -1/-1" debuffs IT. The detectTriggers "flanking" descriptor is
  // coverage-only; this is the sole firing site.
  for (const b of blockers) {
    if (!b?.blockerId || !b?.attackerId) continue;
    const att = findPermanent(state, b.attackerId);
    if (!att) continue;
    // SLIVER INTERIORS (BLITZ SP-1): printed instances (structural) PLUS layer-6 granted instances
    // (Sidewinder Sliver "All Sliver creatures have flanking", an Aura/pump "gains flanking") — one
    // fire per instance (CR 702.25b), read through the same gate-aware index the immunity check uses.
    const instances = keywordInstanceCount(state, b.attackerId, "Flanking",
      flankingKeywordCount(String(att.permanent.card?.oracle || att.permanent.card?.oracle_text || "")));
    if (instances <= 0) continue;
    if (permanentHasKeyword(state, b.blockerId, "Flanking")) continue; // a flanking blocker is immune (CR 702.25a)
    const blk = findPermanent(state, b.blockerId);
    if (!blk) continue;
    for (let i = 0; i < instances; i++) {
      const descriptor = { event: "flanking", scope: "self", whose: "any", effect: null, effectClause: "the triggering creature gets -1/-1 until end of turn", optional: false, sourceText: "Flanking" };
      fired.push(makePendingTrigger(descriptor, att.permanent, blk.permanent, {}));
    }
  }
  // CONTACT DAMAGE (BLITZ IE-1 — Inferno Elemental class): per block PAIR, BOTH directions — a creature
  // printing the contact line deals its N to the OTHER creature of the pair whether it blocks or is
  // blocked (once per pair partner, CR 603.2 — the "by a creature" wording is per-creature, unlike
  // bushido's once-per-event). The OTHER creature rides as the triggering permanent; the sentinel
  // effectClause's thatCreature referent lands the damage on it. Coverage-only descriptor; sole fire site.
  {
    const CONTACT_RE = /(?:^|[\n.;]\s*)whenever this creature blocks or becomes blocked by a creature, (?:it|this creature) deals (\d+) damage to that creature(?=\s*(?:\.|\n|$))/i;
    const contactOf = (perm) => {
      const m = String(perm.card?.oracle || perm.card?.oracle_text || "").replace(/\([^)]*\)/g, " ").match(CONTACT_RE);
      return m ? parseInt(m[1], 10) : null;
    };
    for (const b of blockers) {
      if (!b?.blockerId || !b?.attackerId) continue;
      const blk = findPermanent(state, b.blockerId);
      const att = findPermanent(state, b.attackerId);
      if (!blk || !att) continue;
      for (const [me, other] of [[blk, att], [att, blk]]) {
        const n = contactOf(me.permanent);
        if (n == null) continue;
        const descriptor = { event: "blocksOrBlockedByCreature", scope: "self", whose: "any", effect: null, effectClause: `this creature deals ${n} damage to the triggering creature`, optional: false, sourceText: `blocks-or-blocked contact damage ${n}` };
        fired.push(makePendingTrigger(descriptor, me.permanent, other.permanent, {}));
      }
    }
  }
  // BASILISK TOUCH (BLITZ DG-1 + BT-2 — the Deathgazer contact family): per block PAIR, BOTH directions
  // like IE-1 contact damage — a creature printing a basilisk line marks the OTHER creature of the pair
  // for destruction at end of combat, whether it blocks or is blocked (once per pair partner, CR 603.2).
  // The printed PARTNER filter (nonblack / non-Wall / green-or-white / none) is enforced HERE at fire
  // time via basiliskPartnerMatches — every read layer-aware (see the shared vocabulary above): a
  // partner the filter excludes never fires (CR 603.2 — the event doesn't match the trigger condition).
  // The OTHER creature rides as the triggering permanent; the sentinel effectClause's thatCreature
  // referent enqueues IT (the destroy-at-end-of-combat atom). Coverage-only descriptor in
  // detectTriggers (same basiliskTouchOf — no drift); this is the sole fire site.
  for (const b of blockers) {
    if (!b?.blockerId || !b?.attackerId) continue;
    const blk = findPermanent(state, b.blockerId);
    const att = findPermanent(state, b.attackerId);
    if (!blk || !att) continue;
    for (const [me, other] of [[blk, att], [att, blk]]) {
      const spec = basiliskTouchOf(me.permanent.card?.oracle || me.permanent.card?.oracle_text || "");
      if (!spec) continue;
      if (!basiliskPartnerMatches(state, spec.filter, other.permanent.id)) continue;
      const descriptor = { event: "blocksOrBlockedByCreature", scope: "self", whose: "any", effect: null, effectClause: "destroy the triggering creature at end of combat", optional: false, sourceText: `blocks-or-blocked ${spec.tag} delayed destroy` };
      fired.push(makePendingTrigger(descriptor, me.permanent, other.permanent, {}));
    }
  }
  // BLOCKS-A-FLYER PUMP (BLITZ BF-1 — the rampage-family fire-time pattern): per block PAIR, a blocker
  // printing "Whenever this creature blocks a creature with flying, it gets +N/+M until end of turn"
  // fires ONLY when its blocked attacker has flying RIGHT NOW (layer-aware — a granted flying counts,
  // a removed one doesn't; CR 509.1a reads the block event's object). The detectTriggers
  // "blocksFlyerPump" descriptor is coverage-only; this is the sole firing site (no double-fire).
  for (const b of blockers) {
    if (!b?.blockerId || !b?.attackerId) continue;
    const blk = findPermanent(state, b.blockerId);
    if (!blk) continue;
    const m = String(blk.permanent.card?.oracle || blk.permanent.card?.oracle_text || "").replace(/\([^)]*\)/g, " ")
      .match(/(?:^|[\n.;]\s*)whenever this creature blocks a creature with flying, (?:it|this creature) gets \+(\d+)\/\+(\d+) until end of turn\b/i);
    if (!m) continue;
    if (!permanentHasKeyword(state, b.attackerId, "Flying")) continue;
    const descriptor = { event: "blocksFlyerPump", scope: "self", whose: "any", effect: null, effectClause: `this creature gets +${m[1]}/+${m[2]} until end of turn`, optional: false, sourceText: `blocks-a-flyer pump +${m[1]}/+${m[2]}` };
    fired.push(makePendingTrigger(descriptor, blk.permanent, blk.permanent, {}));
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

// The permanent target types a stack object can carry — the set the becomes-target event scans (CR 603.2 —
// the event fires when a PERMANENT becomes a target; a player/spell/card target never triggers it).
const BECOMES_TARGET_PERM_TYPES = new Set(["creature", "permanent", "planeswalker", "artifact", "enchantment", "land"]);

/**
 * BECOMES-TARGET triggers (CR 603.2 — the "becomes the target of a spell or ability" event; the Phantasmal
 * Illusion family). Enqueue the SELF becomesTarget triggers for every PERMANENT `stackObj` targets that carries
 * one (printed via detectTriggers, or clone-carried on Phantasmal Image's copy oracle — both surface through
 * triggersForEvent's detectTriggers scan). Called at EVERY target-choice site — spell cast (applyCastSpell),
 * activated ability (applyActivateAbility), loyalty ability (applyActivateLoyalty), and triggered-ability
 * target selection (gameEngine.flushTriggers) — so the event fires no matter WHO or WHAT chooses the target
 * (CR 603.2 makes no controller distinction, unlike Heroic/Ward). The trigger goes on the stack ABOVE the
 * targeting object (the caller flushes immediately), so it resolves FIRST (CR 603.3b): the creature is
 * sacrificed, then the now-targetless spell/ability is countered on resolution (CR 608.2b) if it lost its
 * only legal target. Each targeted permanent fires AT MOST ONCE per stack object (a spell targeting the same
 * permanent twice is not a corpus shape; deduped by id for safety — CR 603.2 is one event per becoming-a-target).
 *
 * Fires for the TARGETED permanent as the source (self-scope), so ctx.sourceId = the targeted permanent and the
 * self-sac atom sacrifices exactly it. Pure — appends to pendingTriggers.
 *
 * GROUP FORM (becomesTargetGroup, CR 603.2 — "a creature you control becomes the target of a SPELL", Gargos /
 * Venerated Rotpriest): the watcher is a DIFFERENT permanent than the targeted creature, so for each targeted
 * CREATURE we ALSO fan out to that creature's controller's watchers (triggerSourcesOf), threading the targeted
 * creature as the triggeringPermanent — scopeMatches "creatureYouControl" gates it to same-controller watchers.
 * SPELL-ONLY (CR 115.1): the group form fires ONLY when the targeting stack object is a SPELL (stackObj.kind ===
 * "spell"), never an activated/loyalty/triggered ability (Gargos's printed event is "of a spell", not "…or
 * ability"). The self form still fires at every target-choice site (its printed event is "a spell or ability").
 */
export function checkBecomesTargetTriggers(state, stackObj) {
  const targets = stackObj?.targets || [];
  if (!targets.length) return state;
  const isSpell = stackObj?.kind === "spell"; // GROUP form is spell-only (CR 115.1 — target chosen at cast)
  let fired = [];
  const seen = new Set();
  for (const t of targets) {
    if (!t || !BECOMES_TARGET_PERM_TYPES.has(t.type)) continue; // player/spell/card targets don't trigger it
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    const lk = findPermanent(state, t.id);
    if (!lk?.permanent) continue; // a target that already left the battlefield (a fizzled earlier target) — skip
    // VALIANT gate (descriptor.targeterIsController): "…a spell or ability YOU CONTROL". For this SELF
    // scope the watcher IS the targeted permanent, so "you" is that permanent's controller — compare it
    // against the controller of the spell/ability doing the targeting. Dropped, not skipped upstream,
    // because the unnarrowed watchers on the same permanent must still fire from the same scan.
    //
    // ⛔ A MISSING stackObj.controller MUST NOT PASS. Every one of the four target-choice sites supplies it
    // (verified at each call site), but an undefined on both sides of a `===` would compare EQUAL and fire
    // Valiant off an opponent's spell — the exact over-fire the card exists to exclude. So the comparison
    // requires a truthy controller.
    const targeter = stackObj?.controller;
    fired = fired.concat(triggersForEvent(state, {
      event: "becomesTarget",
      sourcePermanent: lk.permanent,
      triggeringPermanent: lk.permanent,
      triggeringContext: {},
    }).filter((tr) => !tr?.descriptor?.targeterIsController
      || (!!targeter && targeter === lk.permanent.controller)));
    // GROUP fan-out (spell-only): a CREATURE the targeted creature's controller controls became a spell's
    // target → fire every "a creature you control becomes the target of a spell" watcher that controller has.
    // scopeMatches("creatureYouControl") requires the triggering creature and the watcher share a controller,
    // so scanning only the targeted creature's controller's sources is exact (an opponent's watcher never
    // matches). isCreaturePerm gate on the target: the group anchor's subject is "a creature you control".
    if (isSpell && isCreaturePerm(lk.permanent)) {
      for (const watcher of triggerSourcesOf(state, lk.permanent.controller)) {
        fired = fired.concat(triggersForEvent(state, {
          event: "becomesTargetGroup",
          sourcePermanent: watcher,
          triggeringPermanent: lk.permanent,
          triggeringContext: {},
        }));
      }
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * Enqueue combat-damage triggers (CR 510.2) for the attackers that dealt combat damage to a PLAYER this
 * step — driven by combatResolution's `playerEvents` (kind "combat-damage-player"), so they fire exactly
 * when real damage landed on a player. Each such attacker fires its own "Whenever this creature deals
 * combat damage to a player" plus every "a creature you control deals combat damage to a player" watcher
 * the attacking player controls. Mirrors checkAttackTriggers; pure. Called BEFORE the lethal-damage SBA
 * (a trading attacker may die to the SBA, but it triggered at the damage event — CR 510.2; abilities
 * that triggered on combat damage are put on the stack after the SBA, CR 510.3a — so we capture them
 * pre-SBA while the source still resolves).
 */
export function checkCombatDamageTriggers(state, playerEvents) {
  const hits = (playerEvents || []).filter((e) => e.kind === "combat-damage-player");
  if (!hits.length) return state;
  let fired = [];
  // subtypeGlobal is fired ONLY by the dedicated all-players scan below (with the dealer-controller
  // beneficiary), so the per-attacker self + attacking-player paths EXCLUDE it — preventing a double-fire
  // for a global watcher the attacking player happens to control.
  const notGlobal = (scope) => scope !== "subtypeGlobal";
  for (const ev of hits) {
    const lk = findPermanent(state, ev.attackerId);
    if (!lk) continue;
    const attackerPerm = lk.permanent;
    const context = { damagedPlayerId: ev.defender, combatDamageAmount: ev.amount };
    // self ("this creature deals combat damage to a player")
    fired = fired.concat(triggersForEvent(state, { event: "combatDamageToPlayer", sourcePermanent: attackerPerm, triggeringPermanent: attackerPerm, triggeringContext: context, scopeFilter: notGlobal }));
    // RECIPIENT SIDE (CR 510.2) — "Whenever a creature deals combat damage to YOU". Scanned off the
    // DAMAGED player's permanents, which is the only difference from every dealer-side scan in this
    // function: same event, same attacker as the triggering permanent, opposite watcher owner. Fires once
    // per damage event, so two attackers connecting fire it twice (CR 510.2 resolves damage simultaneously
    // but each source's damage is its own event — matching how the dealer-side paths already count).
    for (const watcher of triggerSourcesOf(state, ev.defender)) {
      fired = fired.concat(triggersForEvent(state, { event: "combatDamageToYou", sourcePermanent: watcher, triggeringPermanent: attackerPerm, triggeringContext: context }));
    }
    // the attacking player's "a creature you control deals combat damage to a player" watchers
    for (const watcher of triggerSourcesOf(state, ev.attackingPlayer)) {
      if (watcher.id === attackerPerm.id) continue;
      fired = fired.concat(triggersForEvent(state, { event: "combatDamageToPlayer", sourcePermanent: watcher, triggeringPermanent: attackerPerm, triggeringContext: context, scopeFilter: notGlobal }));
    }
    // ATTACHED watchers ANOTHER player controls (the OC-1-hardening mirror, flagged in that commit) — an
    // Aura/Equipment attached to this attacker whose controller is NOT the attacking player (a cdmg-watcher
    // aura cast on an opponent's creature, or a host that changed control). Its "enchanted/equipped creature
    // deals combat damage" descriptor (the equippedCreature attached-linkage scope) would otherwise silently
    // never fire — the scan above covers only the attacking player's permanents. Controller-gated exactly
    // like the checkAttackTriggers walk (same-controller attachments were already scanned above; the
    // attacker itself rides the self path), so a double-fire is impossible by construction.
    for (const attachId of attackerPerm.attachments || []) {
      const alk = findPermanent(state, attachId);
      if (!alk || alk.controller === ev.attackingPlayer) continue; // already scanned above
      fired = fired.concat(triggersForEvent(state, { event: "combatDamageToPlayer", sourcePermanent: alk.permanent, triggeringPermanent: attackerPerm, triggeringContext: context, scopeFilter: notGlobal }));
    }
    // GLOBAL SUBTYPE watchers (Synapse/Brood Sliver — "Whenever a Sliver deals combat damage to a player,
    // ITS CONTROLLER may …"). The subject is ANY player's matching-subtype creature, so scan EVERY player's
    // sources (not just the attacking player's), firing ONLY subtypeGlobal descriptors. The effect resolves
    // for the DEALING creature's controller (ev.attackingPlayer), threaded as the beneficiary override — so
    // an OPPONENT's Sliver connecting makes that OPPONENT (not the watcher's controller) the beneficiary.
    // The attacker itself can be a global watcher (self-inclusion via scopeMatches), so it is NOT excluded
    // here (it isn't double-fired: the self/attacking-player paths above skip subtypeGlobal entirely).
    for (const pid of Object.keys(state.players || {})) {
      for (const watcher of triggerSourcesOf(state, pid)) {
        fired = fired.concat(triggersForEvent(state, { event: "combatDamageToPlayer", sourcePermanent: watcher, triggeringPermanent: attackerPerm, triggeringContext: context, beneficiary: ev.attackingPlayer, scopeFilter: (scope) => scope === "subtypeGlobal" }));
      }
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * GLOBAL SUBTYPE combat-damage-TO-A-CREATURE (CR 510.2 — combat damage dealt) — enqueue "Whenever a
 * <Subtype> deals combat damage to a creature, destroy that creature" triggers (Toxin Sliver). Driven by
 * combatResolution's `creatureDamageEvents` (one `{ dealerId, dealerController, damagedCreatureId }` per
 * source→creature combat-damage pairing this step), so it fires exactly when a real creature took combat
 * damage from a creature. UNLIKE checkCombatDamageTriggers (player damage), the trigger watches the DEALING
 * creature's subtype but its effect ("destroy THAT creature") acts on the DAMAGED creature — so we thread the
 * DAMAGED creature as the triggering permanent (→ ctx.triggeringPermanentId → "destroy the triggering
 * creature" → thatCreature) and gate the SUBTYPE here on the DEALER. The subject is ANY player's
 * matching-subtype creature (GLOBAL — no "you control"), so scan EVERY player's sources. The authoritative
 * subtype check (parseSubtypeList exact) is here on the dealer, so a non-member dealer never fires (no
 * over-fire). The DEALER's controller is threaded as the beneficiary (CR 608.2c — "that creature" resolves for
 * the dealing creature's controller; the destroy itself is controller-agnostic, but the beneficiary keeps the
 * pending trigger's `controller` correct). The dealer can itself be a global watcher (self-inclusion is moot —
 * its own subtype is checked the same way). Called BEFORE the lethal SBA at the call site, like the player path
 * (a trading dealer is still present to bind to). Pure — appends to pendingTriggers.
 */
export function checkCombatDamageToCreatureTriggers(state, creatureDamageEvents) {
  const hits = (creatureDamageEvents || []).filter((e) => e && e.dealerId != null && e.damagedCreatureId != null);
  if (!hits.length) return state;
  let fired = [];
  for (const ev of hits) {
    const dealerLk = findPermanent(state, ev.dealerId);
    const damagedLk = findPermanent(state, ev.damagedCreatureId);
    if (!dealerLk || !damagedLk) continue; // dealer/target already left the battlefield → no binding
    const dealerPerm = dealerLk.permanent;
    const damagedPerm = damagedLk.permanent;
    for (const pid of Object.keys(state.players || {})) {
      for (const watcher of triggerSourcesOf(state, pid)) {
        // SUBTYPE gate on the DEALER (authoritative): only fire watchers whose subtype filter the dealing
        // creature carries. detectTriggers caches descriptors, so read them once per watcher.
        const descriptors = detectTriggers(watcher.card).filter((d) => d.event === "combatDamageToCreature"
          && (d.scope === "subtypeGlobalToCreature" || d.scope === "selfDealerToCreature"));
        if (!descriptors.length) continue;
        for (const d of descriptors) {
          // TWO WAYS TO PICK THE DEALER, and each scope uses exactly one.
          //   subtypeGlobalToCreature — the dealer must CARRY the printed subtype (Toxin Sliver).
          //   self (Voracious Cobra)  — the dealer must BE this watcher. Identity, not subtype, which is why
          //     the self descriptor carries no subtypeFilter; running it through subtypeFilterMatches with an
          //     absent filter would match EVERY dealer and fire the Cobra's destroy off an unrelated
          //     creature's combat damage — the widest possible over-fire.
          if (d.scope === "selfDealerToCreature") {
            if (ev.dealerId !== watcher.id) continue;
          } else if (!subtypeFilterMatches(dealerPerm.card, d.subtypeFilter)) continue; // a non-member dealer → no fire
          // triggeringPermanent = the DAMAGED creature (the destroy target → ctx.triggeringPermanentId).
          // scopeMatches("subtypeGlobalToCreature") confirms it's a creature; the SUBTYPE gate above (on the
          // DEALER) is the authoritative one. We call makePendingTrigger DIRECTLY (not via triggersForEvent) for
          // two reasons: (1) the subtype here is checked on the DEALER, not the triggeringPermanent, so
          // triggersForEvent's scope path can't carry it; (2) the 5th arg sets `controller` = the DEALER's
          // controller (CR 608.2c — "that creature" resolves for the dealing creature's controller). The
          // dealingPermanentId rides the context for completeness. One descriptor per push (a distinct object).
          if (!scopeMatches(d, watcher, damagedPerm, state)) continue;
          fired.push(makePendingTrigger(d, watcher, damagedPerm, { dealingPermanentId: ev.dealerId }, ev.dealerController));
        }
      }
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * ENRAGE / DAMAGE-RECEIVED (CR 603.2 — "Whenever this creature is dealt damage, …") — enqueue the
 * dealtDamage trigger for every creature that took damage this event. `events` is a list of
 * `{ creatureId, amount }` collected at the damage-application chokepoint (combatResolution's per-step
 * damage tally, or applyDamageEffect's per-target hits) — ONE entry per creature with the TOTAL amount
 * dealt to it this event (CR 510.2 — combat damage dealt simultaneously, so multiple simultaneous sources trigger it EXACTLY ONCE; CR 120.8 —
 * the caller already excluded 0/prevented damage, so every entry has amount > 0). The trigger is
 * SELF-scope (the source IS the damaged creature), so only that creature's OWN watcher fires — no other
 * battlefield watcher is scanned (the modeled enrage shape is self-only; a non-self "whenever a creature
 * is dealt damage" stays UNDETECTED → Arbiter). ctx.dealtDamageAmount carries the FINAL dealt amount
 * (already reflecting any Wave-5a damage doubler) for an amount-scaled payoff. Fired BEFORE the lethal SBA
 * at the call site, so the pending trigger captures while the source still resolves; the counter/effect
 * resolves at the next priority point — a creature that died to the SBA self-no-ops (selfTargets → [] when
 * the source left), which IS the "(It must survive the damage to get the counter)" reminder (CR 704.5g
 * order). Pure — appends to pendingTriggers.
 */
/**
 * SPIRIT LINK (BLITZ SL-1) — the DEALT-BY lifelink-trigger family: "Whenever this creature deals
 * [combat] damage, you gain that much life." (Zebra Unicorn / Warrior Angel / Exalted Angel's line /
 * Sunhome Enforcer's combat-only form) and the ATTACHED form "Whenever enchanted creature deals damage,
 * you gain that much life." (Spirit Link / Vampiric Link / Spirit Loop / Armadillo Cloak's line — the
 * GAIN goes to the AURA's controller, not the host's). Returns {subject, combatOnly} or null.
 * One reader shared by detectTriggers (the coverage-only descriptor), the aura residue admission, and
 * checkDealtByTriggers (the runtime fire) — no drift.
 */
const RE_DEALT_BY_SELF = /(?:^|[\n.;])\s*whenever this creature deals (combat )?damage, you gain that much life\s*(?:\.|$)/i;
const RE_DEALT_BY_ENCH = /(?:^|[\n.;])\s*whenever enchanted creature deals (combat )?damage, you gain that much life\s*(?:\.|$)/i;
export function dealtByLinkOf(card) {
  const o = String(card?.oracle || card?.oracle_text || "");
  let m = o.match(RE_DEALT_BY_SELF);
  if (m) return { subject: "self", combatOnly: !!m[1] };
  m = o.match(RE_DEALT_BY_ENCH);
  if (m) return { subject: "enchanted", combatOnly: !!m[1] };
  return null;
}

/**
 * SL-1 — fire the dealt-by links for a batch of damage-DEALING sources ({sourceId, amount}, per damage
 * event: one combat-damage step total per source — CR 510.2 simultaneity — or one spell/ability
 * resolution total). For each source: its OWN self link fires for its controller; each ATTACHMENT
 * carrying the enchanted link fires for the ATTACHMENT's controller (CR — the Aura's "you"). A
 * combat-only link fires only when isCombat. The descriptor is the rampage-style synthesized shape
 * (the coverage-only detectTriggers twin never fires generically — this is the sole site); the payoff
 * "you gain that much life" resolves through the standard flush with ctx.combatDamageAmount = the total.
 */
export function checkDealtByTriggers(state, events, { isCombat = false } = {}) {
  const hits = (events || []).filter((e) => e && e.sourceId != null && e.amount > 0);
  if (!hits.length) return state;
  let fired = [];
  for (const ev of hits) {
    const lk = findPermanent(state, ev.sourceId);
    if (!lk) continue; // the dealer already left — CR 603.6d look-back is out of scope for this family (FN-safe)
    const context = { combatDamageAmount: ev.amount, dealtDamageAmount: ev.amount };
    const selfLink = dealtByLinkOf(lk.permanent.card);
    if (selfLink && selfLink.subject === "self" && (!selfLink.combatOnly || isCombat)) {
      const desc = { event: "dealtBy", scope: "self", whose: "any", effect: null, effectClause: "you gain that much life", optional: false, sourceText: "dealt-by lifegain link" };
      fired.push(makePendingTrigger(desc, lk.permanent, lk.permanent, context));
    }
    for (const attId of lk.permanent.attachments || []) {
      const att = findPermanent(state, attId);
      if (!att) continue;
      const link = dealtByLinkOf(att.permanent.card);
      if (link && link.subject === "enchanted" && (!link.combatOnly || isCombat)) {
        const desc = { event: "dealtBy", scope: "self", whose: "any", effect: null, effectClause: "you gain that much life", optional: false, sourceText: "attached dealt-by lifegain link" };
        fired.push(makePendingTrigger(desc, att.permanent, lk.permanent, context)); // the AURA's controller gains
      }
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

export function checkDealtDamageTriggers(state, events) {
  const hits = (events || []).filter((e) => e && e.creatureId != null && e.amount > 0);
  if (!hits.length) return state;
  let fired = [];
  for (const ev of hits) {
    const lk = findPermanent(state, ev.creatureId);
    if (!lk) continue; // the creature already left the battlefield before this fire — no source to bind
    const perm = lk.permanent;
    // ctx.dealtDamageAmount is the canonical enrage amount; ctx.combatDamageAmount is its ALIAS so the
    // existing "that many" countContext atoms (parser binds "draw/create/rad that many" → combatDamageAmount)
    // scale on an enrage trigger too — in this context "that many" = the damage dealt TO this creature
    // (Illusory Ambusher "draw that many cards", Hornet Nest, Saber Ants). Per-trigger context, so the alias
    // never leaks into a combat-damage-to-player payoff fired in the same flush (each carries its own ctx).
    const context = { dealtDamageAmount: ev.amount, combatDamageAmount: ev.amount };
    // self ("this creature is dealt damage"): the source and the triggering permanent are the same object.
    fired = fired.concat(triggersForEvent(state, { event: "dealtDamage", sourcePermanent: perm, triggeringPermanent: perm, triggeringContext: context }));
    // WATCHER SCAN — "Whenever a creature you control is dealt damage, …" (Rite of Passage): the watcher is a
    // DIFFERENT permanent than the damaged creature. Scan the damaged creature's controller's trigger sources
    // and fire each creatureYouControl-scoped dealtDamage watcher (scopeMatches gates the controller + that the
    // triggering permanent is a creature). Skip the damaged creature itself (its self trigger already fired
    // above, so it can't double-fire). Mirrors checkAttackTriggers' per-attacker watcher scan.
    for (const watcher of triggerSourcesOf(state, perm.controller)) {
      if (watcher.id === perm.id) continue;
      fired = fired.concat(triggersForEvent(state, { event: "dealtDamage", sourcePermanent: watcher, triggeringPermanent: perm, triggeringContext: context }));
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * BATCH combat-damage (CR 510.4) — "Whenever one or more [<FILTER>] creatures you control deal combat damage
 * to a player" fires ONCE per combat per controller who connected, NOT once per attacker. From the same
 * `playerEvents` checkCombatDamageTriggers reads, collect each attacking player's CONNECTING attacker
 * permanents, then fire each "combatDamageBatch" watcher that player controls exactly once (triggeringPermanent
 * is null — it's a batch event, not a single creature). A SUBTYPE/PROPERTY-FILTERED batch (Olivia — "outlaws";
 * Thopter Spy Network — "artifact creatures"; Rooftop Bypass — "nontoken creatures") fires ONLY when at least
 * one of that controller's connecting creatures matches the filter (batchDealerMatches on the real dealers — a
 * non-matching attacker connecting alone never fires it, CREED). The bare unfiltered batch fires on any
 * connection. Pure — appends to pendingTriggers; the effect rides the normal flush → EffectProgram path
 * (Treasure/Food/investigate/draw/…).
 */
export function checkBatchCombatDamageTriggers(state, playerEvents) {
  const hits = (playerEvents || []).filter((e) => e.kind === "combat-damage-player" && e.amount > 0);
  if (!hits.length) return state;
  // Per attacking player, the set of THEIR attacker permanents that CONNECTED this combat (dealt player damage).
  // A SUBTYPE/PROPERTY-FILTERED batch descriptor (Olivia — "outlaws"; Thopter — "artifact creatures") fires for
  // a controller ONLY when at least one of these connecting permanents matches its filter. The bare unfiltered
  // batch (Grim Hireling) fires whenever the set is non-empty (any connection). This is the load-bearing CREED
  // gate: a non-matching attacker connecting alone (a non-outlaw beside Olivia, all else blocked) must NOT fire
  // the filtered batch — the filter is checked on the actual DEALERS, never assumed.
  const connectingByPlayer = new Map();
  for (const e of hits) {
    const lk = findPermanent(state, e.attackerId);
    if (!lk) continue; // a trading attacker already gone before this fire — can't bind its card; skip for the gate
    if (!connectingByPlayer.has(e.attackingPlayer)) connectingByPlayer.set(e.attackingPlayer, []);
    connectingByPlayer.get(e.attackingPlayer).push(lk.permanent);
  }
  let fired = [];
  for (const [pid, connecting] of connectingByPlayer) {
    // The descriptor gate: a filtered batch keeps only if SOME connecting creature matches; a bare batch (no
    // filter fields) always passes via batchDealerMatches's any-creature fall-through. detectTriggers caches
    // descriptors, so this is cheap per watcher. perDefender descriptors are EXCLUDED here — they fire in
    // the per-defender pass below (once per damaged player, with the pair's damage total), never twice.
    const descriptorFilter = (d) => !d.perDefender && connecting.some((perm) => batchDealerMatches(d, perm, state));
    for (const watcher of triggerSourcesOf(state, pid)) {
      fired = fired.concat(triggersForEvent(state, { event: "combatDamageBatch", sourcePermanent: watcher, triggeringPermanent: null, triggeringContext: { batchController: pid }, descriptorFilter }));
    }
  }
  // PER-DEFENDER pass (Quartzwood Crasher's ruling: the ability triggers once for EACH player dealt damage) —
  // a perDefender batch descriptor fires once per (controller, defender) pair, and its ctx carries THAT
  // defender's damage total summed over descriptor-MATCHING dealers only ("the amount of damage those
  // creatures dealt to that player this combat"). The ctx keys mirror the singular combat-damage path
  // ({damagedPlayerId, combatDamageAmount}), so payload atoms (ptContext/countContext) are shared. Keyword
  // classes are enumerated from the DEALERS (layer-aware permanentHasKeyword), so a descriptor whose keyword
  // no connecting dealer has simply never fires (the same no-over-fire gate as the filtered batch). A dealer
  // that traded (already left the battlefield) was skipped at the connecting gate above — its damage is
  // excluded from the total: an under-fire, the same accepted look-back limitation as the batch filter gate.
  const pairHits = new Map(); // pid -> Map(defenderId -> [{ perm, amount }])
  for (const e of hits) {
    const lk = findPermanent(state, e.attackerId);
    if (!lk || e.defender == null) continue;
    if (!pairHits.has(e.attackingPlayer)) pairHits.set(e.attackingPlayer, new Map());
    const byDef = pairHits.get(e.attackingPlayer);
    if (!byDef.has(e.defender)) byDef.set(e.defender, []);
    byDef.get(e.defender).push({ perm: lk.permanent, amount: e.amount });
  }
  for (const [pid, byDef] of pairHits) {
    for (const [defenderId, dealerHits] of byDef) {
      // Per keyword class present among this pair's dealers: total damage from dealers HAVING that keyword.
      const classTotals = new Map();
      for (const h of dealerHits) {
        for (const kw of FILTERABLE_ETB_KEYWORDS) {
          if (permanentHasKeyword(state, h.perm.id, kw)) classTotals.set(kw, (classTotals.get(kw) || 0) + h.amount);
        }
      }
      for (const [kw, total] of classTotals) {
        const descriptorFilter = (d) => d.perDefender === true && d.batchKeyword === kw;
        const ctx = { batchController: pid, damagedPlayerId: defenderId, combatDamageAmount: total };
        for (const watcher of triggerSourcesOf(state, pid)) {
          fired = fired.concat(triggersForEvent(state, { event: "combatDamageBatch", sourcePermanent: watcher, triggeringPermanent: null, triggeringContext: ctx, descriptorFilter }));
        }
      }
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * TRIG-LIFEGAIN — enqueue "Whenever you gain life" triggers (CR 119.3 lifegain event) for the player who
 * just gained life. Fired at each gainLife site (the gain-life effect atom + combat lifelink). Scans ONLY
 * `gainingPlayerId`'s trigger sources, so "you gain life" fires for the gainer alone — the descriptor uses
 * whose:"any" (life gain is turn-agnostic; the "yours"/activePlayer gate would wrongly drop off-turn gains).
 * No-op on a non-positive amount or unknown player. Pure — appends to pendingTriggers (flushed at the next
 * priority point, like the combat-damage triggers). The amount rides the context for any amount-aware effect.
 */
export function checkLifegainTriggers(state, gainingPlayerId, offeredAmount = 0) {
  // ⚠️ CALLER CONTRACT: every call site passes the amount the EFFECT OFFERED, not the amount gained.
  // Those were the same number until the life-gain replacement landed (CR 614.1 — Rhox Faithmender doubles,
  // Angel of Vitality adds), and nine call sites would each have had to learn the difference. Converting
  // HERE fixes all nine at once and cannot drift: a site that forgets is still correct.
  //
  // Reading the replacement off the POST-gain state is exact, not an approximation — gainLife moves no
  // permanents, so the replacement sources on the battlefield are identical before and after the gain it
  // just applied. CR 119.3: a "whenever you gain life" trigger sees the life actually gained, so a
  // "for each 1 life you gained" rider must count 8 under a Faithmender, not the 4 the spell said.
  const amount = applyLifeGainReplacement(state, gainingPlayerId, offeredAmount);
  if (!gainingPlayerId || !(amount > 0) || !state.players?.[gainingPlayerId]) return state;
  let fired = [];
  for (const perm of triggerSourcesOf(state, gainingPlayerId)) {
    // lifegainAmount — the event-specific ctx key the EC-1b "that many" counter atom reads (countContext:
    // "lifegainAmount" via resolveScaledAmount); named distinctly (never the generic `amount`) so the referent
    // gate can pin it to THIS event, the combatDamageAmount/countersPlaced discipline exactly.
    fired = fired.concat(triggersForEvent(state, { event: "lifegain", sourcePermanent: perm, triggeringContext: { gainingPlayerId, amount, lifegainAmount: amount } }));
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * TRIG-DRAW / TRIG-DRAW2 — enqueue card-draw triggers for the player who just drew. Fired at each draw
 * site (the turn-based draw-step draw + the spell/EFFECT_PROGRAM draw atom) with `count` = cards ACTUALLY
 * drawn (the caller passes the real delta, so a deck-out draw of fewer fires fewer). Two events:
 *  - "cardDrawn" ("Whenever you draw a card"): each card is a SEPARATE draw (CR 121.2 — "drawn one at a
 *    time"), so a batch of N fires N times (e.g. Lorescale Coatl gets N counters) — triggersForEvent is
 *    re-called per card so each pending trigger is a distinct object.
 *  - "drawSecond" ("…your second card each turn"): fires ONCE iff this batch crossed the 2nd draw of the
 *    turn. cardsDrawnThisTurn was already incremented by drawCards (reset for ALL seats at untap via
 *    resetCardsDrawnAllPlayers), so the batch covered (drawnAfter-count, drawnAfter]; the 2nd card is in it
 *    when drawnAfter-count < 2 <= drawnAfter.
 * Scans ONLY the drawing player's sources (whose:"any"; drawing is turn-agnostic, like lifegain — the
 * "yours"/activePlayer gate would drop off-turn draws). Pure — appends to pendingTriggers.
 */
export function checkCardDrawnTriggers(state, drawingPlayerId, count = 1) {
  if (!drawingPlayerId || !(count > 0) || !state.players?.[drawingPlayerId]) return state;
  const drawnAfter = state.players[drawingPlayerId].cardsDrawnThisTurn;
  const crossedSecond = (drawnAfter - count) < 2 && drawnAfter >= 2; // the 2nd draw of the turn was in this batch
  let fired = [];
  // OWN-draw watchers: cardDrawn (per card) + the whose:"any" drawSecond ("you draw your second card each
  // turn"). Both scan ONLY the drawer's own sources — the drawing player IS the "you". The drawSecond scan is
  // restricted to whose:"any" so an OPPONENT-scoped drawSecond descriptor (Faerie Mastermind, whose:"opponent")
  // sitting on the DRAWER's own permanent never fires here — triggersForEvent does NOT gate whose:"opponent",
  // so without this filter a self-owned Faerie would wrongly fire on the owner's own 2nd draw. The opponent
  // path is handled in the all-players scan below.
  const anyScopedDrawSecond = (d) => d.whose !== "opponent";
  for (const perm of triggerSourcesOf(state, drawingPlayerId)) {
    for (let i = 0; i < count; i++) {
      fired = fired.concat(triggersForEvent(state, { event: "cardDrawn", sourcePermanent: perm, triggeringContext: { drawingPlayerId }, scopeFilter: (scope) => scope !== "opponentDraw" }));
    }
    if (crossedSecond) {
      fired = fired.concat(triggersForEvent(state, { event: "drawSecond", sourcePermanent: perm, triggeringContext: { drawingPlayerId }, descriptorFilter: anyScopedDrawSecond }));
    }
  }
  // OPPONENT-draw watchers (Faerie Mastermind): "Whenever an opponent draws their second card each turn, you
  // draw a card." Scan EVERY player's watchers for a whose:"opponent" drawSecond descriptor and fire it once
  // when the DRAWING player is an opponent of the watcher's controller (mirrors checkMilledTriggers' opponent
  // gate). The drawer's own permanents are excluded by the opponent gate (a player is never their own
  // opponent), so there's no overlap with the own-draw scan above. The payoff resolves for the SOURCE's
  // controller (makePendingTrigger's default) — "you draw a card" = the Faerie's owner, not the drawer.
  if (crossedSecond) {
    for (const pid of Object.keys(state.players)) {
      for (const watcher of triggerSourcesOf(state, pid)) {
        for (const d of detectTriggers(watcher.card).filter((x) => x.event === "drawSecond" && x.whose === "opponent")) {
          if (!opponentsOf(state, watcher.controller).includes(drawingPlayerId)) continue;
          fired.push(makePendingTrigger(d, watcher, null, { drawingPlayerId }));
        }
      }
    }
  }
  // TRIG-DRAW-OPPONENT (Smothering Tithe) — the drawer's OPPONENTS' watchers see "Whenever an opponent draws a
  // card". Scan each opponent-of-the-drawer's sources for the scope:"opponentDraw" descriptor ONLY (scopeFilter),
  // firing once per card drawn (each draw is a separate event, CR 121.2 — like the "you draw" path). The payer for
  // the taxed-treasure payoff is drawingPlayerId (threaded into the context, spread into ctx by runEffectProgram).
  // Mirrors checkMilledTriggers/checkCastTriggers: the whose gate is the opponents-of-drawer scan itself.
  for (const oppId of opponentsOf(state, drawingPlayerId)) {
    for (const perm of triggerSourcesOf(state, oppId)) {
      for (let i = 0; i < count; i++) {
        fired = fired.concat(triggersForEvent(state, { event: "cardDrawn", sourcePermanent: perm, triggeringContext: { drawingPlayerId }, scopeFilter: (scope) => scope === "opponentDraw" }));
      }
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * TRIG-DISCARD (CR 701.9a — "To discard a card, move it from its owner's hand to that player's graveyard").
 * Enqueue "Whenever an opponent discards a card" watchers for the player who just discarded.
 *
 * Scans each OPPONENT-OF-THE-DISCARDER's sources — the opponent gate IS the scan, mirroring the Smothering
 * Tithe opponentDraw path and checkMilledTriggers. The discarder's own permanents are never scanned (a player
 * is not their own opponent), so a self-discard can't fire its own controller's watcher.
 *
 * ⚠️ ONE FIRE PER CARD (CR 603.2): discarding two cards is two events, so a two-card discard gives Liliana's
 * Caress two separate triggers, not one doubled one. Callers pass the number of cards ACTUALLY discarded —
 * never the number requested — so a discard that ran out of hand fires fewer.
 *
 * discardingPlayerId is the event-specific ctx key the who:"discardingPlayer" payoff reads; named distinctly
 * (never a generic `player`) so triggerRouting's referent gate can pin it to THIS event.
 */
export function checkDiscardTriggers(state, discardingPlayerId, count = 1) {
  if (!discardingPlayerId || !(count > 0) || !state.players?.[discardingPlayerId]) return state;
  let fired = [];
  for (const oppId of opponentsOf(state, discardingPlayerId)) {
    for (const perm of triggerSourcesOf(state, oppId)) {
      for (let i = 0; i < count; i++) {
        fired = fired.concat(triggersForEvent(state, { event: "discarded", sourcePermanent: perm, triggeringContext: { discardingPlayerId },
          scopeFilter: (s) => s === "opponentDiscard" }));
      }
    }
  }
  // ⭐⭐ SELF DISCARD — the DISCARDING player's OWN watchers ("Whenever you discard a card, …"). This scan is
  // the entire "you" gate, exactly as the opponent scan above is the "opponent" gate; nothing downstream
  // distinguishes them, which is why each scan is scopeFilter-ed to its own scope.
  // ⛔ THE FILTERS ARE LOAD-BEARING IN BOTH DIRECTIONS. Without them a self-scoped watcher would ALSO fire
  // off an opponent's discard (it is on the board during that scan too) and an opponent-scoped watcher would
  // fire off its own controller's discard — two over-fires, in opposite directions, from one omission.
  for (const perm of triggerSourcesOf(state, discardingPlayerId)) {
    for (let i = 0; i < count; i++) {
      fired = fired.concat(triggersForEvent(state, { event: "discarded", sourcePermanent: perm, triggeringContext: { discardingPlayerId },
        scopeFilter: (s) => s === "youDiscard" }));
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * TRIG-SACRIFICE — does the sacrificed permanent match this "Whenever you sacrifice a <subject>" descriptor?
 * EXACT type-predicate (the sac'd thing is always the controller's own, so there's no controller scope to
 * check). `sacrificed` is a lookBack { id, controller, card } captured BEFORE the permanent left the
 * battlefield (so card.type is readable). "another" excludes the source permanent itself.
 */
function sacScopeMatches(d, watcher, sacrificed) {
  if (d.sacAnother && sacrificed.id === watcher.id) return false;
  // NONTOKEN filter (Fumulus, the Infestation — "a player sacrifices a NONTOKEN creature"): a sacrificed
  // TOKEN never satisfies this descriptor (CR 111.1 — a token is still the stated card type, so it isn't
  // the type check that excludes it, just the printed "nontoken" restriction itself).
  if (d.nontokenFilter && sacrificed.card?.token) return false;
  // SUBTYPE sac scope (Captain Lannery Storm "sacrifice a Treasure") — the sac'd permanent's TYPE LINE must
  // carry the subtype word-bounded (CR 205.3 — subtypes follow the "—"; a substring check would mis-match,
  // e.g. "Treasure" within a longer word). A Treasure token's type line is "Token Artifact — Treasure", so
  // it matches; any non-matching sac does not fire (no over-fire). Word-bounded + escaped for safety.
  if (d.sacSubtype) {
    const ts = String(sacrificed.card?.type || sacrificed.card?.type_line || "");
    const esc = String(d.sacSubtype).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${esc}\\b`).test(ts);
  }
  switch (d.sacScope) {
    case "permanent": return true;
    case "creature": return isCreaturePerm(sacrificed);
    case "artifact": return /\bArtifact\b/.test(String(sacrificed.card?.type || sacrificed.card?.type_line || ""));
    default: return false;
  }
}

/**
 * TRIG-SACRIFICE — enqueue "Whenever you sacrifice a <permanent|creature|artifact>" triggers for the player
 * who just sacrificed, PLUS "Whenever A PLAYER sacrifices a <X>" (Mayhem Devil et al., scope:"anyPlayerSac")
 * for every player's watchers regardless of who did the sacrificing. Fired at each sacrifice chokepoint (the
 * effect/edict sac + the cost sac), AFTER the permanent has moved to the graveyard, with the captured
 * permanent passed as `sacrificed` (a lookBack so its type is readable post-move). The "you"-scope half scans
 * only the SACRIFICING player's surviving watchers — the common case is a separate watcher ("Whenever you
 * sacrifice another permanent, …" on a DIFFERENT permanent); a permanent's trigger on its OWN sacrifice is a
 * SAFE false-negative (it already left → not a watcher, true for both scopes). Each watcher's sacScope is
 * matched EXACTLY against the sacrificed permanent's type (so creature-scope never fires on an artifact sac,
 * and vice-versa). whose:"any" is moot for both scopes (player-scope is carried on `scope` itself here, not
 * `whose`). Pure.
 */
export function checkSacrificeTriggers(state, sacrificingPlayerId, sacrificed) {
  if (!sacrificed?.card || !state.players?.[sacrificingPlayerId]) return state;
  // TOKEN-CHANGE on-sacrifice (Mirkwood Bats) — a sacrificed TOKEN fires every tokenChange watcher with
  // onSacrifice. Checked at the SAME sac chokepoints as the type-scope sac triggers above (this function is
  // called from all four — the effect/edict sac, the cost sac, and the Treasure-crack-for-mana sac), so a
  // sacrificed Treasure TOKEN drains for Mirkwood Bats. Gated on the sac'd card's token-ness (CR 111.1) — a
  // NON-token sacrifice never fires it (no over-fire). One firing per sac call (each sac is one token event).
  const sacIsToken = !!sacrificed.card?.token;
  let fired = [];
  for (const watcher of triggerSourcesOf(state, sacrificingPlayerId)) {
    for (const d of detectTriggers(watcher.card).filter((x) => x.event === "sacrifice" && x.scope !== "anyPlayerSac")) {
      if (!sacScopeMatches(d, watcher, sacrificed)) continue;
      fired.push(makePendingTrigger(d, watcher, sacrificed, {}));
    }
    if (sacIsToken) {
      for (const d of detectTriggers(watcher.card).filter((x) => x.event === "tokenChange" && x.onSacrifice)) {
        fired.push(makePendingTrigger(d, watcher, sacrificed, {}));
      }
    }
  }
  // ANY-PLAYER SAC WATCHERS (Mayhem Devil et al.) — scanned across EVERY player's battlefield, mirroring
  // checkDiesTriggers' cross-player scan: the ability cares WHO sacrificed, not who controls the watcher, so
  // it must also fire for a watcher the sacrificing player DOESN'T control. sacScopeMatches' "another" check
  // (sacrificed.id === watcher.id) still correctly excludes a permanent seeing its own sacrifice.
  for (const pid of Object.keys(state.players)) {
    for (const watcher of triggerSourcesOf(state, pid)) {
      for (const d of detectTriggers(watcher.card).filter((x) => x.event === "sacrifice" && x.scope === "anyPlayerSac")) {
        if (!sacScopeMatches(d, watcher, sacrificed)) continue;
        fired.push(makePendingTrigger(d, watcher, sacrificed, {}));
      }
    }
  }
  // SELF-SACRIFICE trigger (BLITZ OC-1 — "When you sacrifice this Aura, <payoff>", the Ordeal cycle). The
  // sacrificed permanent's OWN youSacrificeThis descriptors fire off the LOOK-BACK (CR 603.10a — sacrifice
  // triggers look back in time; the permanent has already left, so the battlefield watcher scan above can
  // never see it). Source = triggering = the sacrificed look-back {id, controller, card} — makePendingTrigger
  // reads exactly those fields, and the payoff programs (draw / gain-life / damage / discard / land tutor)
  // never need the source on the battlefield (the dies-trigger precedent). Gated on the sacrificer BEING the
  // sacrificed permanent's controller — always true for a real sacrifice (CR 701.21a: a player can't
  // sacrifice a permanent they don't control), so this is a pure belt against a malformed caller. Fires from
  // EVERY sacrifice chokepoint (this function is the single funnel) and from NO other exit path — an SBA /
  // destroy / bounce never calls it, so the payoff never over-fires (CREED).
  if (sacrificingPlayerId === sacrificed.controller) {
    for (const d of detectTriggers(sacrificed.card).filter((x) => x.event === "youSacrificeThis")) {
      fired.push(makePendingTrigger(d, sacrificed, sacrificed, {}));
    }
  }
  if (!fired.length) return state;
  // DIES-TRIGGER MULTIPLIER (Teysa Karlov): sacrificing a CREATURE puts it into a graveyard — it "died" (CR
  // 700.4) — so a "whenever you sacrifice a creature" ability that fired is ALSO caused by a creature dying
  // and Teysa doubles it (the official ruling names sacrifice triggers explicitly). GATED on the sacrificed
  // permanent being a CREATURE: a non-creature sacrifice (Treasure/Clue/Food, or the Mirkwood-Bats onSacrifice
  // token drain off a NON-creature token) is NOT a creature dying, so it's never doubled (no over-fire — the
  // CREED gate). Uses the same shared expansion as the dies dispatch (per-controller multiplier, distinct
  // additional instances). A non-creature sac leaves the fired list unchanged (a clean skip).
  if (/\bcreature\b/i.test(String(sacrificed.card?.type || sacrificed.card?.type_line || ""))) {
    fired = multiplyDiesTriggers(state, fired);
  }
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * TOKEN-CHANGE on-create (Mirkwood Bats) — enqueue tokenChange triggers (onCreate) for the player who just
 * created `numCreated` tokens. Fired at the token-mint chokepoints (the create-token / create-named-token /
 * create-token-copy atoms, via fireTokenCreatedTriggers in atoms/tokens.js) AFTER the tokens are on the
 * battlefield. Each token created is a SEPARATE event (CR 111.1 — each token is its own object; Bloomburrow
 * ruling — creating multiple tokens at once triggers Mirkwood Bats that many times), so the descriptor fires
 * ONCE PER token. Scans ONLY the creating player's watchers (the "you create" subject). Pure — appends to
 * pendingTriggers. A 0 / missing count is a clean no-op.
 */
export function checkTokenCreatedTriggers(state, creatingPlayerId, numCreated = 1) {
  if (!creatingPlayerId || !(numCreated > 0) || !state.players?.[creatingPlayerId]) return state;
  let fired = [];
  for (const watcher of triggerSourcesOf(state, creatingPlayerId)) {
    const descriptors = detectTriggers(watcher.card).filter((x) => x.event === "tokenChange" && x.onCreate);
    for (const d of descriptors) {
      for (let i = 0; i < numCreated; i++) fired.push(makePendingTrigger(d, watcher, watcher, {}));
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * COUNTERS-PLACED on-event (CR 122.1 / 122.6) — enqueue "Whenever you put one or more +1/+1 counters on a
 * creature [you control]" triggers for the player who just placed them. Fired at the +1/+1 placement
 * chokepoint (counters.js applyAddCounter, AFTER the counters are on the creatures), passing:
 *   - `placingPlayerId` — the controller resolving the counter-placement spell/ability ("you" in the
 *     trigger; CR — the trigger watches YOUR placements, so a placement BY an opponent never fires your
 *     ability). ONLY this player's watchers are scanned (controller-scoped, like checkTokenCreatedTriggers).
 *   - `placedOnYours` — total +1/+1 counters this event put on creatures the PLACER controls.
 *   - `placedOnAny`   — total +1/+1 counters this event put on ANY creature (the placer's + others').
 * CR 122.6: a single counter-placement is ONE event regardless of how many counters or which creatures, so
 * the descriptor fires EXACTLY ONCE per call (not per counter, not per creature) — distinct from the per-token
 * checkTokenCreatedTriggers. "that many"/"that much" rides as ctx.countersPlaced (the scope's matching count).
 * The scope:"creatureYouControl" trigger fires with count=placedOnYours (only when >0); scope:"creature" with
 * count=placedOnAny. Pure — appends to pendingTriggers; a 0 count for a scope is a clean skip (that trigger
 * didn't see a qualifying placement). The effect rides the normal flush → buildTriggerStack path, so a payoff
 * that can't parse HIGH routes the WHOLE trigger to the Arbiter no-op, never a partial.
 */
export function checkCounterPlacedTriggers(state, { placingPlayerId, placedOnYours = 0, placedOnAny = 0 } = {}) {
  if (!placingPlayerId || !state.players?.[placingPlayerId]) return state;
  if (!(placedOnAny > 0)) return state; // no +1/+1 counter actually placed on a creature → no event
  let fired = [];
  for (const watcher of triggerSourcesOf(state, placingPlayerId)) {
    for (const d of detectTriggers(watcher.card).filter((x) => x.event === "countersPlaced")) {
      // The count this scope cares about: own-creatures-only ("on a creature you control") or any creature.
      const count = d.scope === "creatureYouControl" ? placedOnYours : placedOnAny;
      if (!(count > 0)) continue; // this scope saw no qualifying counter → it doesn't fire (clean skip)
      fired.push(makePendingTrigger(d, watcher, watcher, { countersPlaced: count }));
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * MONARCH (CR 725) — enqueue "Whenever you become the monarch, <effect>" triggers for the player who just
 * took the crown. Called from monarch.becomeMonarch (the ONE crown chokepoint), so it fires for BOTH the
 * effect-atom path (Palace Sentinels / Custodi Lich ETB, Feast of Succession) AND the combat-steal path.
 * Scans ONLY the new monarch's own sources — the new monarch IS the "you" — mirroring
 * checkCounterPlacedTriggers' placingPlayer scope, so no whose-gate is needed. Pure; appends to
 * pendingTriggers (flushed at the next priority point, CR 603.3). No-op until a "you become the monarch"
 * watcher is on that player's battlefield.
 */
export function checkBecomesMonarchTriggers(state, newMonarchId) {
  if (!newMonarchId || !state.players?.[newMonarchId]) return state;
  let fired = [];
  for (const watcher of triggerSourcesOf(state, newMonarchId)) {
    for (const d of detectTriggers(watcher.card).filter((x) => x.event === "becomesMonarch")) {
      fired.push(makePendingTrigger(d, watcher, watcher, { newMonarchId }));
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/** The cast spell's mana value: prefer a numeric cmc/mana_value, else 0 (a missing cost can't pass a >=N gate). */
function spellManaValue(spellCard) {
  if (typeof spellCard?.cmc === "number") return spellCard.cmc;
  if (typeof spellCard?.mana_value === "number") return spellCard.mana_value;
  return 0;
}

/**
 * CASCADE (CR 702.85a) — the cascading spell's OWN mana value, the cap the dig measures "costs less" against.
 * Prefers a numeric cmc/mana_value, else SUMS the pips of the printed mana cost (CR 202.3) so a test/runtime
 * card carrying only a `mana`/`mana_cost` string still resolves a correct cap — the same MV arithmetic
 * tutorManaValue (library.js) uses, replicated here so triggers.js stays a leaf (no library import / cycle).
 * {X}/{Y}/{Z} count 0 (CR 202.3b — X is 0 on the stack outside its own cost context); a 2-generic hybrid pip
 * ({2/W}) counts its largest component (CR 202.3f); a colored/phyrexian pip counts 1.
 */
function cascadingSpellManaValue(spellCard) {
  if (typeof spellCard?.cmc === "number") return spellCard.cmc;
  if (typeof spellCard?.mana_value === "number") return spellCard.mana_value;
  let mv = 0;
  for (const sym of String(spellCard?.mana || spellCard?.mana_cost || "").matchAll(/\{([^}]+)\}/g)) {
    const s = sym[1];
    if (/^\d+$/.test(s)) mv += parseInt(s, 10);
    else if (/^[XYZ]$/i.test(s)) mv += 0;
    else { const lead = s.match(/^(\d+)/); mv += lead ? parseInt(lead[1], 10) : 1; }
  }
  return mv;
}

/** MILL-ON-EVENT — front-face type line (CR 712.4a / 712.8a). A card in the library has ONLY its front-face
 * characteristics, so an MDFC whose BACK is a land (Malakir Rebirth // Malakir Mire) is a NONLAND when milled.
 * Mirrors gameState.frontFaceTypeLine (kept local so triggers.js stays a leaf — no gameState type import). */
function frontFaceType(card) {
  const faces = card?.card_faces;
  const raw = Array.isArray(faces) && faces.length > 0
    ? String(faces[0]?.type_line || faces[0]?.type || "")
    : String(card?.type || card?.type_line || "");
  return raw.split("//")[0];
}
function isNonlandCard(card) {
  return !/\bLand\b/.test(frontFaceType(card));
}

/**
 * MILL-ON-EVENT (Wave 3b, CR 701.13a) — enqueue "milled" triggers for ONE player-mill event. `milledCards`
 * is the ordered batch of card objects that just moved from `milledByPlayer`'s library to their graveyard
 * (captured by the caller — the mill effect atom or the inherent radiation ability — BEFORE/at the mill so
 * the front-face type is readable). Fires every battlefield/emblem watcher of EVERY player, because the
 * corpus triggers watch mills globally ("one or more nonland cards are milled" / "a player mills …"):
 *   - BATCH descriptors (perCard:false) fire ONCE for this event when ≥1 matching card was milled (CR
 *     701.13a — milling is a single event; the count rides the context for an amount-aware payoff).
 *   - PER-CARD descriptors (perCard:true) fire ONCE PER matching card milled (each milled card is its own
 *     object — Glowing One's "you gain 1 life" per nonland is N separate triggers).
 * `milledFilter:"nonland"` counts only nonland cards (front-face); null counts all. The `whose:"opponent"`
 * gate (Infesting Radroach) requires the MILLING player to be an opponent of the watcher's controller.
 * Pure — appends to pendingTriggers; the effect rides the normal flush → buildTriggerStack path, so a
 * payoff that can't parse HIGH (a "once each turn"/scaling/conditional rider) routes the WHOLE trigger to
 * the Arbiter no-op, never a partial (CLAUDE.md §1.2). No-op on an empty/missing mill (a clean library no-op).
 */
/**
 * LIFE-LOSS-ON-EVENT (SHELF M3, CR 118.4 — Mindcrank's "Whenever an opponent loses life, that player
 * mills that many cards"): enqueue "lifeLost" triggers for ONE life-loss event. Fired from the loseLife
 * chokepoint itself (gameState's registered watcher — see registerLifeLossWatcher below), so DAMAGE-caused
 * loss (CR 119.3) fires it too — every life change routes through loseLife. `whose:"opponent"` requires the
 * LOSING player to be an opponent of the watcher's controller. The loser + amount ride the context
 * (ctx.lifeLostPlayerId / ctx.lifeLostAmount) for the who/countContext payoff referents. Pure — appends to
 * pendingTriggers; the flush at the next priority checkpoint routes a HIGH payoff natively or the whole
 * trigger to the Arbiter no-op (never a partial). A 0-amount loss never reaches here (loseLife gates >0).
 */
export function checkLifeLossTriggers(state, { playerId, amount } = {}) {
  if (!playerId || !state.players?.[playerId] || !(amount > 0)) return state;
  const fired = [];
  for (const pid of Object.keys(state.players)) {
    for (const watcher of triggerSourcesOf(state, pid)) {
      for (const d of detectTriggers(watcher.card).filter((x) => x.event === "lifeLost")) {
        if (d.whose === "opponent" && !opponentsOf(state, watcher.controller).includes(playerId)) continue;
        fired.push(makePendingTrigger(d, watcher, null, { lifeLostPlayerId: playerId, lifeLostAmount: amount }));
      }
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}
// Register at module load: gameState (a leaf) exposes the seam; every runtime path loads triggers.js
// (via the engine), so the watcher is live wherever games actually run.
registerLifeLossWatcher(checkLifeLossTriggers);

/**
 * BECOMES-UNTAPPED triggers (Mesmeric Orb — SHELF S6): drain `state.pendingUntapEvents` (recorded by
 * gameState.untapAll / untapPermanent for every real tapped→untapped transition — the pendingLeaveEvents
 * pattern) and fire each event's watchers ("Whenever a permanent becomes untapped, …"). The untapped
 * permanent is threaded as triggeringPermanent (still on the battlefield) with ctx.untappedControllerId for
 * the "that permanent's controller" payoff referent. ALWAYS clears the queue (idempotent — a second call
 * sees an empty list). Fired by gameEngine after the untap step and by the untap atoms after their
 * untapPermanent calls. A board with no untapped-watcher exits after the (cheap) descriptor scan.
 */
export function checkUntapTriggers(state) {
  const events = state.pendingUntapEvents || [];
  if (!events.length) return state;
  const { pendingUntapEvents: _drop, ...cleared } = state;
  let fired = [];
  for (const ev of events) {
    const lk = findPermanent(cleared, ev.id);
    const trig = lk ? { id: ev.id, controller: lk.controller, card: lk.permanent.card } : { id: ev.id, controller: ev.controller, card: null };
    for (const pid of Object.keys(cleared.players)) {
      for (const watcher of triggerSourcesOf(cleared, pid)) {
        fired = fired.concat(triggersForEvent(cleared, {
          event: "untapped", sourcePermanent: watcher, triggeringPermanent: trig,
          triggeringContext: { untappedControllerId: ev.controller },
        }));
      }
    }
  }
  if (!fired.length) return cleared;
  return { ...cleared, pendingTriggers: [...(cleared.pendingTriggers || []), ...fired] };
}

/**
 * BECOMES-TAPPED SELF triggers (BLITZ TR-1, CR 701.26a): drain `state.pendingTapEvents` (recorded by
 * gameState.tapPermanent / regeneratePermanent for every real untapped→tapped transition — the
 * pendingUntapEvents mirror; the ETB-tap sites pass fromEnter so a permanent that ENTERS tapped never records
 * an event) and fire each tapped permanent's OWN "Whenever this creature becomes tapped, …" watcher. Self-scope
 * only (the checkEvolvesTriggers / checkBecomesMonstrousTriggers pattern): the tapped permanent is BOTH the
 * source and the triggering permanent, so a self-referential payoff ("it deals 1 damage", "put a +1/+1 counter
 * on this creature") binds correctly. ALWAYS clears the queue (idempotent — a second call sees an empty list).
 * Drained at the flushTriggers funnel (every priority-grant checkpoint), so a tap recorded during action
 * dispatch (mana / crew / cost / attack) or stack resolution is converted before its flush. A vanished source
 * (tapped, then left the battlefield before the flush) no-ops. Pure.
 */
/**
 * COUNTERS-PUT-ON SELF triggers (CR 122.6): drain `state.pendingCounterEvents` (recorded by
 * gameState.addCounter for every real placement, and by resolvers.enterPermanent for the enters-with half)
 * and fire each recipient's OWN "Whenever one or more +1/+1 counters are put on this creature" watcher.
 *
 * CR 122.6 is why the ETB path records too: counters given to an object AS IT ENTERS count as counters put
 * on it. That is the OPPOSITE of the becomes-tapped sibling, which deliberately skips enters-tapped.
 *
 * ONE FIRING PER PLACEMENT EVENT, not per counter (the singular wording is not detected at all, so no
 * per-counter shape reaches here). The counter TYPE must match the descriptor's. Self-scope only, mirroring
 * checkTapTriggers: the recipient is BOTH source and triggering permanent, so a self-referential payoff
 * binds. ALWAYS clears the queue (idempotent — a re-entrant flush never double-fires). A vanished recipient
 * no-ops. Pure.
 */
export function checkCounterTriggers(state) {
  const events = state.pendingCounterEvents || [];
  if (!events.length) return state;
  const { pendingCounterEvents: _drop, ...cleared } = state;
  let fired = [];
  for (const ev of events) {
    const lk = findPermanent(cleared, ev.id);
    if (!lk) continue; // left the battlefield before the flush → no-op, never a fabricated fire
    fired = fired.concat(
      detectTriggers(lk.permanent.card)
        .filter((d) => d.event === "countersPut" && d.scope === "self" && d.counterType === ev.type)
        .map((d) => makePendingTrigger(d, lk.permanent, lk.permanent, {}))
    );
    // SCOPED COUNTERS-PUT — WATCHERS ("a creature you control receives counters"), as opposed to the
    // receiving permanent's own self-trigger handled just above. Routed through triggersForEvent so the
    // shared scopeMatches vocabulary does the controller/not-self work rather than a bespoke check.
    //
    // The `scope !== "self"` half of the descriptorFilter is load-bearing: scopeMatches would also match a
    // SELF descriptor when the watcher happens to BE the receiving permanent, which the loop above already
    // fired — so without it every self-trigger would fire twice. counterType is re-checked here for the same
    // reason it is above: a -1/-1 placement must never trip a +1/+1 watcher.
    for (const pid of Object.keys(cleared.players)) {
      for (const watcher of triggerSourcesOf(cleared, pid)) {
        fired = fired.concat(triggersForEvent(cleared, {
          event: "countersPut", sourcePermanent: watcher, triggeringPermanent: lk.permanent,
          descriptorFilter: (d) => d.scope !== "self" && d.counterType === ev.type,
        }));
      }
    }
  }
  if (!fired.length) return cleared;
  return { ...cleared, pendingTriggers: [...(cleared.pendingTriggers || []), ...fired] };
}

export function checkTapTriggers(state) {
  const events = state.pendingTapEvents || [];
  if (!events.length) return state;
  const { pendingTapEvents: _drop, ...cleared } = state;
  let fired = [];
  for (const ev of events) {
    const lk = findPermanent(cleared, ev.id);
    if (!lk) continue;
    // ⚠️ ROUTED THROUGH triggersForEvent, not a hand-rolled detectTriggers filter. The old form read
    // `lk.permanent.card` — the PRINTED card — so it could not see a GROUP-GRANTED becomes-tapped ability
    // ("Creatures you control have \"Whenever this creature becomes tapped …\"" — Tale of Katara and Toph).
    // The recipient creatures' own cards say nothing about tapping, so the granted trigger never fired while
    // the granting card classified native: a runtime-vacuous native, this engine's recurring trap.
    //
    // The shared path also applies the gates this one skipped entirely — `whose:"yours"` (the activePlayer
    // check, without which a first-tap-during-YOUR-turns ability fires on opponents' turns too: an over-fire)
    // and scopeMatches. The once-per-turn latch rides downstream in flushTriggers either way.
    //
    // Self-scoped by construction: the tapped permanent is passed as BOTH source and triggering permanent, so
    // scope:"self" still matches exactly as before, and non-self becomes-tapped subjects stay UNDETECTED at
    // classifyCondition (a deliberate refusal), so nothing new can fire here.
    fired = fired.concat(triggersForEvent(cleared, {
      event: "becomesTapped",
      sourcePermanent: lk.permanent,
      triggeringPermanent: lk.permanent,
    }));
  }
  if (!fired.length) return cleared;
  return { ...cleared, pendingTriggers: [...(cleared.pendingTriggers || []), ...fired] };
}

/**
 * GY-EVENT triggers (Syr Konrad, the Grim / Bloodchief Ascension — SHELF S7): drain
 * `state.pendingGraveyardEvents` (recorded by every graveyard-array write site — gameState.
 * recordGraveyardEvents documents the inventory) and fire the battlefield watchers whose descriptor
 * matches each event:
 *   event "gyEnter"  — "a … card is put into a graveyard from …" (dir:"enter"; ev.zone = the FROM zone)
 *   event "gyLeave"  — "a … card leaves your graveyard"          (dir:"leave"; ev.zone = the TO zone)
 * Descriptor gates (ALL must pass — each is a closed check, never a fail-open):
 *   gyCardType   — the moved card's FRONT-face type line must contain it (CR 712.8a; null = any card)
 *   gyOwnerScope — whose graveyard: "you" (the watcher's controller's), "opponent" (an opponent-of-the-
 *                  watcher's), "any"
 *   excludeFromBattlefield — enter-only: skip events whose from-zone is the battlefield (Syr Konrad's
 *                  second clause — his dies clause covers those, so the union never double-fires)
 * Fires PER CARD (CR 603.2 — each moved card is a distinct event; a "one or more" batch shape is NOT
 * emitted by detection, so no batch collapse exists here). ALWAYS clears the queue (idempotent). Fired
 * at the gameEngine.flushTriggers funnel — every settlement path (action dispatch, stack resolution,
 * step automatics) flushes there, so a recorded event is converted before its flush. Tokens never reach
 * the queue (recordGraveyardEvents filters them — a token is not a card, CR 111.1).
 */
export function checkGraveyardEventTriggers(state) {
  const events = state.pendingGraveyardEvents || [];
  if (!events.length) return state;
  const { pendingGraveyardEvents: _drop, ...cleared } = state;
  let fired = [];
  for (const ev of events) {
    const evEvent = ev.dir === "leave" ? "gyLeave" : "gyEnter";
    for (const pid of Object.keys(cleared.players)) {
      for (const watcher of triggerSourcesOf(cleared, pid)) {
        for (const d of detectTriggers(watcher.card).filter((x) => x.event === evEvent)) {
          if (d.gyCardType && !new RegExp(`\\b${d.gyCardType}\\b`).test(frontFaceType(ev.card))) continue;
          if (d.gyOwnerScope === "you" && ev.gyOwner !== watcher.controller) continue;
          if (d.gyOwnerScope === "opponent" && !opponentsOf(cleared, watcher.controller).includes(ev.gyOwner)) continue;
          if (d.excludeFromBattlefield && ev.zone === "battlefield") continue;
          // KISHLA SKIMMER — "during your turn": the event only fires while the WATCHER's controller is
          // the active player (the printed turn rider; the Wavebreak turn-gate's mirror).
          if (d.duringYourTurn && cleared.activePlayer !== watcher.controller) continue;
          // gyOwnerId rides the context so a "that player" payoff (Bloodchief Ascension's drain) can bind
          // the graveyard's owner at resolution; the card trio mirrors the milled-trigger context shape.
          fired.push(makePendingTrigger(d, watcher, null, {
            gyCardId: ev.card?.id, gyCardName: ev.card?.name, gyOwnerId: ev.gyOwner, gyZone: ev.zone, gyDir: ev.dir,
          }));
        }
      }
    }
  }
  // BATCHED GY-LEAVE (CR 603.1) — the once-per-batch watchers. Runs over the SAME drained queue, firing each
  // matching watcher EXACTLY ONCE no matter how many cards left, which is what "one or more cards leave your
  // graveyard" means. Placed after the per-card loop and BEFORE the empty-fired return, so it still runs on a
  // board holding ONLY batch watchers — the early-return trap that bit the diesBatch arm (no singular watcher
  // fired, so a bare `return cleared` would have skipped the batch pass entirely).
  //
  // The filter predicates are the singular loop's, reused verbatim: gyCardType against the front face, and
  // gyOwnerScope pinning "your graveyard" to the watcher's controller. The first matching event supplies the
  // ctx card/owner so a payoff naming the card still binds something real.
  // Both DIRECTIONS share one pass — the only difference is which descriptor event name and which half of the
  // drained queue. gyEnterBatch adds an optional gyFromZone filter ("…from your library" — Sidisi's mill
  // payoff, as opposed to "from anywhere"); gyLeaveBatch never sets it, so its behaviour is unchanged.
  for (const [dir, evName] of [["leave", "gyLeaveBatch"], ["enter", "gyEnterBatch"]]) {
    const dirEvents = events.filter((ev) => ev.dir === dir);
    if (!dirEvents.length) continue;
    for (const pid of Object.keys(cleared.players)) {
      for (const watcher of triggerSourcesOf(cleared, pid)) {
        for (const d of detectTriggers(watcher.card).filter((x) => x.event === evName)) {
          const hit = dirEvents.find((ev) => {
            if (d.gyCardType && !new RegExp(`\\b${d.gyCardType}\\b`).test(frontFaceType(ev.card))) return false;
            if (d.gyOwnerScope === "you" && ev.gyOwner !== watcher.controller) return false;
            if (d.gyFromZone && ev.zone !== d.gyFromZone) return false;
            return true;
          });
          if (!hit) continue;   // nothing in this batch matched — no fire (never a fabricated trigger)
          fired.push(makePendingTrigger(d, watcher, null, {
            gyCardId: hit.card?.id, gyCardName: hit.card?.name, gyOwnerId: hit.gyOwner, gyZone: hit.zone, gyDir: hit.dir,
          }));
        }
      }
    }
  }
  if (!fired.length) return cleared;
  return { ...cleared, pendingTriggers: [...(cleared.pendingTriggers || []), ...fired] };
}

/**
 * EVOLVES triggers (Watchful Radstag — SHELF S7, CR 702.100f): fire the SOURCE permanent's own
 * "Whenever this creature evolves, …" watchers the moment its evolve counter is placed (called by the
 * evolve-counter-self resolver, after the counter lands). The evolving permanent is threaded as
 * triggeringPermanent so a copy payoff's "it" (create-token-copy → ctx.triggeringPermanentId, the
 * DIES-COPY binding) resolves to the evolved creature. Self-scope only; a vanished source no-ops.
 */
export function checkEvolvesTriggers(state, permanentId) {
  const lk = findPermanent(state, permanentId);
  if (!lk) return state;
  const fired = detectTriggers(lk.permanent.card)
    .filter((d) => d.event === "evolves")
    .map((d) => makePendingTrigger(d, lk.permanent, lk.permanent, {}));
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * BECOMES-MONSTROUS triggers (Alpha Deathclaw — SHELF S7, CR 701.32d): fire the SOURCE permanent's own
 * "when this creature becomes monstrous" watchers the moment applyMonstrosity performs the real
 * not-yet-monstrous transition (an already-monstrous re-activation never calls this). Self-scope only
 * (the checkEvolvesTriggers pattern); a vanished source no-ops.
 */
export function checkBecomesMonstrousTriggers(state, permanentId) {
  const lk = findPermanent(state, permanentId);
  if (!lk) return state;
  const fired = detectTriggers(lk.permanent.card)
    .filter((d) => d.event === "becomesMonstrous")
    .map((d) => makePendingTrigger(d, lk.permanent, lk.permanent, {}));
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * SAGA CHAPTER triggers (CR 714.3 — Vault 12, SHELF S7): fire every chapter the lore count just CROSSED
 * — chapter n fires iff from < n ≤ to. Called by resolvers.enterPermanent (0 → the entry count; Doubling
 * Season doubling the entry lore counter correctly fires I AND II — the famous interaction) and by
 * gameEngine's draw-step lore addition. Transitions only, so a chapter can never re-fire. A vanished
 * source no-ops.
 */
export function checkSagaChapterTriggers(state, permanentId, from, to) {
  const lk = findPermanent(state, permanentId);
  if (!lk) return state;
  const fired = detectTriggers(lk.permanent.card)
    .filter((d) => d.event === "sagaChapter" && d.chapter > from && d.chapter <= to)
    .map((d) => makePendingTrigger(d, lk.permanent, lk.permanent, {}));
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

export function checkMilledTriggers(state, { milledByPlayer, milledCards } = {}) {
  const cards = Array.isArray(milledCards) ? milledCards : [];
  if (!milledByPlayer || !state.players?.[milledByPlayer] || cards.length === 0) return state;
  const nonlandCount = cards.filter(isNonlandCard).length;
  let fired = [];
  for (const pid of Object.keys(state.players)) {
    for (const watcher of triggerSourcesOf(state, pid)) {
      // A GY-FUNCTIONING descriptor (functionsFromGraveyard — Radroach) never fires from the battlefield:
      // its printed zone statement (CR 603.3d) says it functions in the graveyard only. The graveyard scan
      // below is its sole fire site.
      for (const d of detectTriggers(watcher.card).filter((x) => x.event === "milled" && !x.functionsFromGraveyard)) {
        // whose:"opponent" — the MILLING player must be an opponent of this watcher's controller.
        if (d.whose === "opponent" && !opponentsOf(state, watcher.controller).includes(milledByPlayer)) continue;
        // The filtered count this trigger cares about: nonland-only or every milled card.
        const matchCount = d.milledFilter === "nonland" ? nonlandCount : cards.length;
        if (matchCount === 0) continue; // no matching card milled → this descriptor doesn't fire
        const context = { milledByPlayer, milledCount: cards.length, nonlandMilledCount: nonlandCount };
        // PER-CARD fires once per matching card (CR 701.13a — each milled card is a distinct object); BATCH
        // fires exactly once for the whole event. makePendingTrigger is re-called so each is a distinct object.
        const times = d.perCard ? matchCount : 1;
        for (let i = 0; i < times; i++) fired.push(makePendingTrigger(d, watcher, null, context));
      }
    }
    // ===== GY-FUNCTIONING milled triggers (Infesting Radroach — SHELF S7, CR 603.3d) ===== scan this
    // player's GRAVEYARD for cards whose milled trigger functions from there ("…if this creature is in your
    // graveyard, you may return it to your hand"). The source is the graveyard CARD (the makePendingTrigger
    // look-back precedent — a non-battlefield source object); sourceCardId rides the context so BOTH the
    // intervening-if zone check (interveningIf.js — re-evaluated at flush AND resolution, CR 603.4) and the
    // gy-self-return atom key on the exact card. detectTriggers' WeakMap cache serves this scan at the same
    // cost as the battlefield one. The card just milled THIS event fires too (it IS in the graveyard as the
    // trigger condition is checked — CR-correct for a from-the-graveyard ability).
    for (const gyCard of state.players[pid]?.graveyard || []) {
      for (const d of detectTriggers(gyCard).filter((x) => x.event === "milled" && x.functionsFromGraveyard)) {
        if (d.whose === "opponent" && !opponentsOf(state, pid).includes(milledByPlayer)) continue;
        const matchCount = d.milledFilter === "nonland" ? nonlandCount : cards.length;
        if (matchCount === 0) continue;
        const context = { milledByPlayer, milledCount: cards.length, nonlandMilledCount: nonlandCount, sourceCardId: gyCard.id };
        const source = { id: `gy-${gyCard.id}`, controller: pid, card: gyCard };
        const times = d.perCard ? matchCount : 1;
        for (let i = 0; i < times; i++) fired.push(makePendingTrigger(d, source, null, context));
      }
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/** Does the cast spell match a cast trigger's modeled spell-type filter? */
function spellMatchesFilter(filter, spellCard) {
  const t = typeStr(spellCard);
  // CAST-SUBTYPE — "subtype:Name" → the cast spell's type line carries that subtype (word-bounded so
  // "Elf" doesn't match "Elfin…"; type lines are space/em-dash delimited so a bare \b is exact enough).
  if (typeof filter === "string" && filter.startsWith("subtype:")) {
    const sub = filter.slice(8);
    return new RegExp(`\\b${sub.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t);
  }
  // PARAMETERIZED object filters: typed-list (ANY listed type/subtype on the line, CR 205.2), the X-spell
  // printed-cost test (CR 107.3), and the mana-value threshold (CR 202.3).
  if (filter && typeof filter === "object") {
    switch (filter.kind) {
      case "typed":
        return filter.words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t));
      // CONJUNCTIVE typed filter (Rivaz "Dragon CREATURE spell") — EVERY listed word must be on the line
      // ("typed" is any-of; using it here would fire on every creature spell, an over-fire).
      case "typedAll":
        return filter.words.every((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t));
      case "hasX":
        return /\{x\}/i.test(String(spellCard?.mana ?? spellCard?.mana_cost ?? ""));
      case "manaValue": {
        const mv = spellManaValue(spellCard);
        return filter.op === "gte" ? mv >= filter.value : mv <= filter.value;
      }
      default: return false;
    }
  }
  switch (filter) {
    case "any": return true;
    case "instantSorcery": return /Instant|Sorcery/.test(t);
    case "creature": return /Creature/.test(t);
    case "noncreature": return !/Creature/.test(t);
    case "artifact": return /Artifact/.test(t);
    case "enchantment": return /Enchantment/.test(t);
    // HISTORIC (BLITZ TR-3, CR 700.6) — legendary supertype ∨ artifact card type ∨ Saga subtype, all of which
    // appear literally on the type line (word-bounded so "Saga" doesn't match a longer token). An Artifact
    // Creature / Legendary Instant / Enchantment — Saga all read historic, exactly as the rule reads.
    case "historic": return /\b(?:Legendary|Artifact|Saga)\b/.test(t);
    // MULTICOLORED (BLITZ TR-3, CR 105.2b) — two or more of the five colors, read from the cast spell's colors
    // (colorsOf: Scryfall's baked colors array, or a mana-cost pip derivation; devoid → colorless, never multi).
    case "multicolored": return colorsOf(spellCard).length >= 2;
    // ⭐ COLORLESS (CR 105.2c) — the ABSENCE of colour, so an empty colour set. Not a sixth colour: folding it
    // into the colour test below would make every colourless spell match every colour filter. `colorsOf`
    // returns [] for a devoid spell, which is exactly right here (Kozilek's Sentinel, Molten Nursery).
    case "colorless": return colorsOf(spellCard).length === 0;
    default:
      // ⭐ SINGLE COLOUR — "color:R" etc. Read from the same colorsOf() the multicolored branch trusts, so a
      // devoid spell (no colours) correctly matches NO colour filter.
      if (typeof filter === "string" && filter.startsWith("color:")) {
        return colorsOf(spellCard).includes(filter.slice(6));
      }
      return false;
  }
}

// The canonical Prowess ability (CR 702.108) as a descriptor — built once from the reminder text so the
// runtime prowess trigger rides the EXACT detectTriggers -> makePendingTrigger -> buildTriggerStack ->
// self-pump (#238) path, with NO change to detectTriggers (which would churn the trigger-counting
// coverage classifiers — a "Prowess + ETB" creature's detected-vs-shaped count would mismatch).
let _prowessDescriptor;
function prowessDescriptor() {
  if (!_prowessDescriptor) {
    _prowessDescriptor = detectTriggers({ oracle: "Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn." }).find((d) => d.event === "cast");
  }
  return _prowessDescriptor;
}

/**
 * Enqueue cast-spell triggers (CR 603.2) when `spellCard` is cast by `casterId`. Scans
 * every battlefield permanent for a "Whenever … casts a … spell" watcher whose `whose`
 * (you / opponent / any caster) and `spellFilter` (the modeled types) match this cast,
 * and enqueues it. The trigger then rides the normal flush → stack path, so it inherits
 * the EffectProgram routing (an unmodeled effect like "untap this" stays a no-op, never
 * fabricated). Context carries the cast spell's name + type for future referential
 * effects. Pure — appends to pendingTriggers and returns new state.
 */
export function checkCastTriggers(state, { spellCard, casterId, targets = [], xValue = null, stackObjectId = null, castFromZone = null }) {
  if (!spellCard) return state;
  // `castingPlayerId` carries the CASTER's seat into every cast-trigger's context (spread into the resolver ctx by
  // runEffectProgram). Load-bearing for OPPONENT-PAYS-TO-DENY (taxed-payment) — the pay-decision belongs to the
  // player who cast, not the watcher's controller. Additive + inert for every existing cast trigger (no other
  // consumer reads it). See docs/orchestration/corpus-levers-buildspec.md.
  // castSpellMv (KELLAN, SHELF S7): the cast spell's mana value, for a watcher payoff whose magnitude/cap is
  // RELATIONAL to the triggering cast ("cast a permanent spell with EQUAL OR LESSER mana value" — Kellan, the
  // Kid). Same MV reader the cascade cap uses; additive + inert for every existing cast trigger.
  // castStackObjectId (RIVAZ, 2026-08-15): the cast SPELL's own stack id, for a grant effect that must
  // stamp the triggering spell ("it gains …" where "it" is the cast spell — the grant rides the stack
  // object into PERMANENT_ETB). Additive + inert for every existing cast trigger, like castSpellMv above.
  const context = { castSpellName: spellCard?.name, castSpellType: typeStr(spellCard), castingPlayerId: casterId, castSpellMv: cascadingSpellManaValue(spellCard), castStackObjectId: stackObjectId };
  let fired = [];
  for (const pid of Object.keys(state.players)) {
    for (const watcher of triggerSourcesOf(state, pid)) {
      // A GY-FUNCTIONING descriptor must not fire from the BATTLEFIELD: its own text says it functions from
      // the graveyard (CR 603.3d), so an Eidolon on the battlefield watching you cast a multicolored spell
      // does nothing. Excluded here; the graveyard scan below is what fires it. Same detectTriggers cache
      // serves both scans, and the flag routes them — the checkMilledTriggers precedent.
      //
      // ⚠️ THIS EXCLUSION IS NOT THE SAFETY GATE, and that was MEASURED, not assumed: a mutation deleting it
      // SURVIVED the whole test file. The reason is that the rewritten effect ([gy-self-return:hand]) keys on
      // ctx.sourceCardId, which only the graveyard scan stamps — so a battlefield fire resolves to nothing
      // regardless. What this line actually buys is that no phantom trigger is put on the stack at all, which
      // is a real difference (a visible trigger that does nothing is a bug report waiting to happen) and is
      // what the battlefield test now pins. If the gy-self-return atom is ever changed to fall back to a
      // by-name lookup, THIS LINE BECOMES LOAD-BEARING — and nothing here will warn you.
      const descriptors = detectTriggers(watcher.card).filter(d => d.event === "cast" && !d.functionsFromGraveyard);
      for (const d of descriptors) {
        if (d.whose === "you" && casterId !== watcher.controller) continue;
        if (d.whose === "opponent" && !opponentsOf(state, watcher.controller).includes(casterId)) continue;
        // CAST-FROM-NONHAND (Vega, SHELF K1): fires ONLY when the cast's source zone is known and isn't
        // the hand. An unthreaded caller (castFromZone undefined) under-fires — never over-fires (CREED).
        if (d.castNotFromHand && (!castFromZone || castFromZone === "hand")) continue;
        // CAST-FROM-EXACT-ZONE (Rivaz): fires ONLY when the cast's source zone is known AND equals the
        // descriptor's zone. An unthreaded caller (castFromZone undefined) under-fires — never over-fires.
        if (d.castFromZoneOnly && castFromZone !== d.castFromZoneOnly) continue;
        // FIRST-<KIND>-SPELL-EACH-TURN (CR 603.2) — the gate is on the CASTER's own per-turn count, so each
        // opponent gets their own first spell. recordSpellCast increments BEFORE this runs (the storm site
        // depends on the same ordering), so the triggering spell is already counted and "first" reads as
        // exactly 1. A later spell that turn reads 2+ and is skipped; the count is zeroed for every seat at
        // untap, so an off-turn instant still counts against the right game-turn.
        if (d.firstEachTurn) {
          const caster = state.players[casterId];
          const n = d.firstEachTurn === "noncreature" ? (caster?.noncreatureSpellsCastThisTurn || 0) : (caster?.spellsCastThisTurn || 0);
          if (n !== 1) continue;
        }
        // CHOSEN-TYPE cast filter (Door of Destinies / Chronicle of Victory) — the cast spell must carry the
        // WATCHER's stored chosenType (CR 614.12). spellMatchesFilter has no watcher, so it's resolved here
        // via permHasChosenType (subtype OR changeling); an unset chosenType yields false (a SAFE no-op).
        // The CREATURE-SPELL variant (Vanquisher's Banner, creatureOnly) additionally requires the cast spell
        // to BE a creature spell — a Kindred/Tribal NONCREATURE spell of the chosen type (a changeling
        // instant, an Elf-typed sorcery) fires Door/Chronicle but never Vanquisher's, matching the print.
        if (d.spellFilter && d.spellFilter.kind === "chosenType") {
          if (!permHasChosenType(spellCard, watcher.chosenType)) continue;
          if (d.spellFilter.creatureOnly && !spellMatchesFilter("creature", spellCard)) continue;
        } else if (!spellMatchesFilter(d.spellFilter, spellCard)) {
          continue;
        }
        fired.push(makePendingTrigger(d, watcher, null, context));
      }
    }
    // ===== GY-FUNCTIONING cast triggers (the Eidolon cycle, CR 603.3d) ===== scan this player's GRAVEYARD
    // for cards whose cast-trigger functions from there. The source is the graveyard CARD, not a battlefield
    // permanent (the makePendingTrigger look-back precedent set by checkMilledTriggers), and sourceCardId
    // rides the context so the gy-self-return atom keys on the exact card rather than on a name.
    //
    // ⚠️ `pid` IS THE WATCHER'S SEAT, NOT THE CASTER'S — the graveyard scanned belongs to the player whose
    // card is watching, and d.whose is then checked against the CASTER. Getting this backwards would let
    // your Eidolon return itself when an OPPONENT cast the multicolored spell, which "whenever YOU cast"
    // does not say. Both directions are pinned in the test.
    for (const gyCard of state.players[pid]?.graveyard || []) {
      for (const d of detectTriggers(gyCard).filter(x => x.event === "cast" && x.functionsFromGraveyard)) {
        if (d.whose === "you" && casterId !== pid) continue;
        if (d.whose === "opponent" && !opponentsOf(state, pid).includes(casterId)) continue;
        if (!spellMatchesFilter(d.spellFilter, spellCard)) continue;
        const source = { id: `gy-${gyCard.id}`, controller: pid, card: gyCard };
        fired.push(makePendingTrigger(d, source, null, { ...context, sourceCardId: gyCard.id }));
      }
    }
  }
  // HEROIC (CR 702.35): for each targeted battlefield permanent that the CASTER controls,
  // fire any heroic triggers on that permanent. Targets are the cast-time chosen targets
  // threaded from applyCastSpell; scope:"self" + whose:"you" — only fires when the caster
  // controls the targeted permanent (self-targeting spells like "target creature you control
  // gets +2/+2" are the primary heroic enablers).
  for (const target of targets) {
    if (!target?.id) continue;
    let targetPerm = null;
    for (const pid of Object.keys(state.players)) {
      targetPerm = (state.players[pid]?.battlefield || []).find(p => p.id === target.id);
      if (targetPerm) break;
    }
    if (!targetPerm || targetPerm.controller !== casterId) continue;
    for (const d of detectTriggers(targetPerm.card).filter(x => x.event === "heroic")) {
      fired.push(makePendingTrigger(d, targetPerm, null, context));
    }
  }
  // ===== BECOMES-TARGET-OF-A-SPELL (CR 115.1) ===== the CAST site of Goldspan's compound self-trigger. Unlike
  // HEROIC above (gated to a spell the TARGET's own controller casts, CR 702.35), "becomes the target of a
  // spell" fires for a spell ANY player casts that targets the permanent — so this loop does NOT gate on the
  // target's controller. Each chosen target that resolves to a battlefield permanent (any seat) fires its own
  // scope:"self" attacksOrBecomesTarget descriptor. A spell targeting the same permanent MULTIPLE times still
  // fires the ability once per targeting instance is out of scope here — but `targets` carries one entry per
  // chosen target object, so a single-target spell fires exactly once (the common case; the Goldspan corpus is
  // all single-target enablers). Via triggersForEvent so a granted/group-granted variant is honored uniformly.
  for (const target of targets) {
    if (!target?.id) continue;
    let targetPerm = null;
    for (const pid of Object.keys(state.players)) {
      targetPerm = (state.players[pid]?.battlefield || []).find(p => p.id === target.id);
      if (targetPerm) break;
    }
    if (!targetPerm) continue;
    fired = fired.concat(triggersForEvent(state, { event: "attacksOrBecomesTarget", sourcePermanent: targetPerm, triggeringPermanent: targetPerm, triggeringContext: context }));
  }
  // ===== TRIG-PROWESS (CR 702.108) ===== Prowess is a printed keyword = "Whenever you cast a noncreature
  // spell, this creature gets +1/+1 until end of turn." detectTriggers can't see it (no When/Whenever
  // text), so fire it here for each of the CASTER's prowess creatures on a noncreature cast, via the same
  // descriptor -> the identical flush -> #238 self-pump path. Printed-keyword detection mirrors how
  // coverage classifies prowess (granted prowess isn't modeled anywhere — a consistent, honest scope).
  if (spellMatchesFilter("noncreature", spellCard)) {
    for (const perm of state.players[casterId]?.battlefield || []) {
      if (isCreaturePerm(perm) && hasKeyword(perm.card, "Prowess")) {
        fired.push(makePendingTrigger(prowessDescriptor(), perm, null, context));
      }
    }
  }
  // TRIG-CAST2 (CR 601): "Whenever you cast your second spell each turn." recordSpellCast (applyCastSpell)
  // just incremented the caster's count BEFORE this call, and spells are cast one at a time, so it equals
  // exactly 2 on the 2nd cast of the turn (reset for all seats at untap → fires again next turn). Fires for
  // the CASTER's own watchers only (scope "you"), so no whose gate is needed — never on an opponent's cast.
  const castCount = state.players[casterId]?.spellsCastThisTurn;
  if (castCount === 2) {
    for (const watcher of triggerSourcesOf(state, casterId)) {
      for (const d of detectTriggers(watcher.card).filter((x) => x.event === "castSecond")) {
        fired.push(makePendingTrigger(d, watcher, null, context));
      }
    }
  }
  // TRIG-CASTNTH (CR 601): "Whenever (you|an opponent|a player) casts (your|their) <Nth> spell each turn." The
  // count just incremented in applyCastSpell is the CASTER's running total, so it equals descriptor.nth EXACTLY
  // ONCE this turn (the off-by-one trap: the count is already post-increment, so an Nth trigger compares ===
  // nth, NOT > nth-1 — a single fire on the Nth cast). A "you" watcher fires only when its controller IS the
  // caster; an "opponent" watcher fires only when the caster is one of the watcher's opponents (so each
  // opponent's Mind's Dilation fires once on that opponent's Nth cast); an "any" watcher ("a player casts their
  // second spell" — Lotho, Corrupt Shirriff) passes BOTH guards → fires for its controller on EVERY player's Nth
  // cast (its own and each opponent's). Scanned across ALL seats so opponent/any watchers see the cast. The
  // PAYOFF still must parse HIGH at flush to fire natively.
  for (const pid of Object.keys(state.players)) {
    for (const watcher of triggerSourcesOf(state, pid)) {
      for (const d of detectTriggers(watcher.card).filter((x) => x.event === "castNth")) {
        if (castCount !== d.nth) continue;
        if (d.whose === "you" && casterId !== watcher.controller) continue;
        if (d.whose === "opponent" && !opponentsOf(state, watcher.controller).includes(casterId)) continue;
        // DURING-EACH-OPPONENT'S-TURN (2026-08-14, Wavebreak Hippocamp): fire only when the ACTIVE
        // player is an opponent of the watcher's controller — the printed turn scope, never wider.
        if (d.duringOpponentsTurn && !opponentsOf(state, watcher.controller).includes(state.activePlayer)) continue;
        fired.push(makePendingTrigger(d, watcher, null, context));
      }
    }
  }
  // ===== SELF-CAST (CR 603.2 + 601.2) ===== the SPELL's OWN "When you cast this spell, <effect>" trigger
  // (Hydroid Krasis, Desolation Twin, the Eldrazi cast-payoffs). Unlike every watcher above, the source is
  // the spell being cast — not a battlefield permanent — so it's fired HERE off spellCard directly (the same
  // non-watcher cast handling heroic/prowess use). detectSelfCast (the registered detector) yields the
  // event:"selfCast" descriptor with the effectClause; we enqueue ONE pending trigger whose source is the
  // spell, threading the cast's chosen X into context.xValue so a half-X / X-amount payoff resolves at the
  // real X (buildTriggerStack reads context.xValue into the EFFECT_PROGRAM params). It goes on the stack
  // ABOVE the spell and resolves first (flushTriggers runs immediately after this in applyCastSpell), CR-correct.
  // A minimal source descriptor (the spell's id/card) is enough — the modeled payoffs (gain/draw/create-token)
  // are controller effects that never read the source permanent; an unmodeled payoff still drops to the
  // Arbiter no-op at flush (buildTriggerStack's α1 gate). No `whose` gate is needed: a self-cast trigger is
  // always the caster's own (the spell is on the stack under casterId), so the effect's controller IS casterId.
  const selfCastSource = { id: spellCard.id, card: spellCard, controller: casterId };
  // STORM (CR 702.40a) — the storm trigger copies the spell N = the number of spells cast BEFORE it this turn.
  // recordSpellCast (applyCastSpell) just incremented the caster's spellsCastThisTurn to THIS spell's ordinal,
  // so spells-cast-before-it = that count - 1, snapshotted HERE at cast (deterministic, never re-counted at
  // resolution — the copies are independent, CR 707.10c). Snapshot the storm spell's frozen resolution payload
  // off its stack object so the copy atom is self-contained (it survives the original being countered before the
  // storm trigger resolves). Both ride on the trigger's context (threaded into the EFFECT_PROGRAM params by
  // buildTriggerStack via trigger.context); a non-storm self-cast trigger sets none → byte-identical.
  const stormCount = Math.max(0, (state.players[casterId]?.spellsCastThisTurn || 0) - 1);
  const stormStackObj = stackObjectId ? (state.stack || []).find((o) => o.id === stackObjectId) : null;
  // CASCADE (CR 702.85a) — the dig stops at the first nonland card that "costs less" than the CASCADING spell,
  // i.e. mana value STRICTLY LESS than the spell's own mana value (CR 702.85a — measured against the spell on
  // the stack). Snapshot that mana value HERE at cast (off the spell card, the same MV reader the discover/tutor
  // paths use) and thread it onto the cascade trigger's context so applyCascadeAtom reads a concrete cap at
  // resolution — never re-derived, serialize-stable. A non-cascade self-cast trigger sets none → byte-identical.
  const cascadeSpellMv = cascadingSpellManaValue(spellCard);
  for (const d of detectTriggers(spellCard).filter((x) => x.event === "selfCast")) {
    const extra = d.stormCopy
      ? { stormCount, stormSourcePayload: stormStackObj?.payload || null, stormSourceCard: { name: spellCard.name, type: typeStr(spellCard) } }
      : d.cascade
      ? { cascadeSpellMv }
      : {};
    fired.push(makePendingTrigger(d, selfCastSource, null, { ...context, xValue, ...extra }));
  }
  if (!fired.length) return state;
  // CAST-TRIGGER MULTIPLIER (Veyran, Voice of Duality) — the fourth member of the multiplier family,
  // applied at the same point in its enqueue site as the dies / attack / ETB ones: after the full fired
  // list is built, so every watcher that legitimately fired gets its extra instance and nothing else
  // does. multiplyTriggers keys on each pending trigger's CONTROLLER (the ability's controller, per the
  // card's "a triggered ability of a permanent you control"), never on the caster.
  //
  // ⚠️ ONLY instant/sorcery casts reach the multiplier, and that is enforced by the guard below rather
  // than by the site: checkCastTriggers fires for EVERY cast (a creature spell included), while Veyran's
  // line is scoped to "an instant or sorcery spell". Reading the site alone as sufficient — the argument
  // that holds for the ETB and attack siblings — would double a creature-cast watcher Veyran does not
  // affect. Measured before this line existed, on a board with a creature cast.
  if (/\b(instant|sorcery)\b/i.test(typeStr(spellCard))) {
    fired = multiplyTriggers(state, fired, (st, ctrl) => castTriggerMultiplierCount(st, ctrl));
  }
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * ===== MAGECRAFT COPY HALF (BLITZ MC-1, CR 707.10) ===== Enqueue the "cast OR copy" watchers when a spell is
 * COPIED (put on the stack as a copy — CR 707.10, "a copy of a spell isn't cast"). Fired ONCE per copy created,
 * by the copy-creation sites (applyCopySpell / applyCopyCreatureSpell in effects/atoms/stack.js).
 *
 * DISCIPLINE (the cardinal guard): this scans the SAME watcher set as checkCastTriggers but fires ONLY the
 * descriptors carrying `firesOnCopy` — magecraft's "Whenever you cast OR copy an instant or sorcery spell". A
 * plain "Whenever you cast a[n] … spell" descriptor has NO firesOnCopy flag, so it is NEVER fired here: a copy
 * is not a cast (CR 707.10), and a generic cast trigger firing on a copy would be a forbidden false-positive.
 *
 * `copiedSpellCard` is the copiable card of the object being copied (carries at least a type line); the
 * instantSorcery filter is re-applied so a copied CREATURE spell (Double Major, CR 707.10f) never fires
 * magecraft — only an instant/sorcery copy does. `controllerId` is the copy's controller (you copy — CR 707.10),
 * the beneficiary the `whose:"you"` gate binds to. Pure — appends to pendingTriggers and returns new state
 * (flushed on the next priority pass by the same finalizeStackResolution path as any other pending trigger).
 */
export function checkCopyTriggers(state, { copiedSpellCard, controllerId }) {
  if (!copiedSpellCard || !state?.players?.[controllerId]) return state;
  const context = {
    castSpellName: copiedSpellCard?.name,
    castSpellType: typeStr(copiedSpellCard),
    castingPlayerId: controllerId,
    castSpellMv: cascadingSpellManaValue(copiedSpellCard),
  };
  const fired = [];
  for (const pid of Object.keys(state.players)) {
    for (const watcher of triggerSourcesOf(state, pid)) {
      const descriptors = detectTriggers(watcher.card).filter((d) => d.event === "cast" && d.firesOnCopy);
      for (const d of descriptors) {
        // whose:"you" = the copy's controller must BE the watcher's controller (magecraft is "whenever YOU …
        // copy"). "opponent" is honored for symmetry though no printed "cast or copy" trigger uses it.
        if (d.whose === "you" && controllerId !== watcher.controller) continue;
        if (d.whose === "opponent" && !opponentsOf(state, watcher.controller).includes(controllerId)) continue;
        if (!spellMatchesFilter(d.spellFilter, copiedSpellCard)) continue;
        fired.push(makePendingTrigger(d, watcher, null, context));
      }
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

// ─── Intervening-if (CR 603.4) ──────────────────────────────────────────────────

/**
 * Evaluate a trigger's intervening-if. Phase-1 recognizes a small condition
 * vocabulary; unknown conditions FAIL OPEN (return true) so we never fabricate a
 * "doesn't fire" outcome.
 */
export function checkInterveningIf(state, pendingTrigger) {
  const cond = pendingTrigger?.descriptor?.interveningIf;
  if (!cond) return true;
  const c = String(cond).toLowerCase();
  const player = state.players?.[pendingTrigger.controller];
  let m = c.match(/you have (\d+) or more life/);
  if (m) return (player?.life || 0) >= parseInt(m[1], 10);
  m = c.match(/you have (\d+) or (fewer|less) life/);
  if (m) return (player?.life || 0) <= parseInt(m[1], 10);
  m = c.match(/you control (\d+) or more (\w+)/);
  if (m) {
    const n = parseInt(m[1], 10);
    const re = new RegExp(m[2], "i");
    const count = (player?.battlefield || []).filter(p => re.test(typeStr(p.card))).length;
    return count >= n;
  }
  return true; // unknown → fail-open
}

// ─── Resolution ─────────────────────────────────────────────────────────────────
// W4: `applyTriggerEffect` (the Phase-1 naive resolution lane) was DELETED. It duplicated the shared
// effect primitives WITH DRIFT — drew via drawCards without firing "whenever you draw" triggers, and
// resolved eachOpponent "damage" as plain loseLife (no infect/wither/enrage/replacement handling). Every
// live trigger resolves through the EFFECT_PROGRAM interpreter (whose atoms call the shared
// spellEffects primitives) or the manual/Arbiter no-op.

// ─── CHOSEN-TYPE-ENTERS-OR-ATTACKS detector (Kindred Discovery) ─────────────────
// "Whenever a creature you control of the chosen type enters or attacks, draw a card." — a COMPOUND-event
// (enters OR attacks) trigger whose subject is filtered by a DYNAMIC creature type (chosen at ETB, stored on
// the permanent as `chosenType`). classifyCondition's compound-event guard (eventVerbs >= 2 on enters+attacks)
// Arbiter-routes it, so the registry seam reaches this detector. We map it to ONE descriptor on a synthetic
// `chosenTypeEntersOrAttacks` event that BOTH checkEnterTriggers and checkAttackTriggers fire (the scope —
// chosenTypeYouControl — reads the source's stored chosenType + the triggering creature's subtype/changeling).
//
// CREED ANCHOR: matched ONLY on the EXACT bare Kindred shape, end-anchored — "a creature you control of the
// chosen type enters or attacks". A qualified subject ("a nontoken creature …" — Molten Echoes is enters-only
// and stays Arbiter; "another creature …" — Bloodline Pretender is enters-only), a different/extra event, or
// any rider leaves residue → no match → Arbiter (a SAFE false-negative, never an over-fire). The effect still
// has to parse HIGH (triggerRoutesNatively) for the card to flip — "draw a card" does; an unmodeled payoff
// keeps the whole card body-only. The "enters or attacks" disjunction order is fixed by the printed text.
function detectChosenTypeEntersOrAttacks(condition) {
  if (/^a creature you control of the chosen type enters or attacks$/.test(String(condition).toLowerCase().trim())) {
    return { event: "chosenTypeEntersOrAttacks", scope: "chosenTypeYouControl", whose: "any" };
  }
  return null;
}
registerTriggerDetector(detectChosenTypeEntersOrAttacks);

// ─── CHOSEN-TYPE CAST detector (Door of Destinies / Chronicle of Victory; Vanquisher's Banner) ──────────
// "Whenever you cast a spell of the chosen type, <effect>" (Door "put a charge counter on this artifact",
// Chronicle of Victory "draw a card") and the CREATURE-SPELL variant "Whenever you cast a creature spell of
// the chosen type, draw a card" (Vanquisher's Banner — BLITZ TC-1). A CAST trigger whose spell filter is the
// SOURCE's stored chosenType (CR 614.12 — picked at ETB). The inline cast matcher anchors on "…spell$" so the
// "of the chosen type" rider leaves residue → classifyCondition returns falsy → this registry detector reaches
// the condition. It maps to the normal cast event with a `{ kind:"chosenType" }` filter; checkCastTriggers
// resolves that filter against the WATCHER's chosenType via permHasChosenType (the filter alone can't —
// spellMatchesFilter has no watcher). The CREATURE-SPELL form additionally carries `creatureOnly: true`:
// checkCastTriggers then also requires the cast spell to BE a creature spell (its type line carries
// "Creature"), so a Kindred/Tribal NONCREATURE spell of the chosen type fires Door/Chronicle but NOT
// Vanquisher's — exactly the printed difference. The "you cast" scope means it fires only for the source's
// controller. CREED ANCHOR: matched ONLY on the EXACT bare shapes, end-anchored; a different caster ("an
// opponent…"), an extra rider, or any other spell qualifier ("a red spell of the chosen type") leaves residue
// → no match → Arbiter (a SAFE false-negative, never an over-fire). The effect still has to parse HIGH
// (triggerRoutesNatively) for the card to flip native.
function detectChosenTypeCast(condition) {
  const c = String(condition).toLowerCase().trim();
  if (/^you cast a spell of the chosen type$/.test(c)) {
    return { event: "cast", scope: "castWatcher", whose: "you", spellFilter: { kind: "chosenType" } };
  }
  if (/^you cast a creature spell of the chosen type$/.test(c)) {
    return { event: "cast", scope: "castWatcher", whose: "you", spellFilter: { kind: "chosenType", creatureOnly: true } };
  }
  return null;
}
registerTriggerDetector(detectChosenTypeCast);

// MONARCH (CR 725) — "Whenever you become the monarch, <effect>" (Custodi Lich). The becomesMonarch event is
// fired from monarch.becomeMonarch for the player who just took the crown; checkBecomesMonarchTriggers already
// scopes the scan to that player's own sources, so this descriptor needs no whose-gate. A THIRD-PERSON form
// ("whenever a player / an opponent becomes the monarch" — Knights of the Black Rose, Garland) carries an
// intervening-if or a control-change payoff and stays unmatched → Arbiter (a SAFE false-negative).
function detectBecomesMonarch(condition) {
  return /^you become the monarch$/i.test(String(condition || "").trim()) ? { event: "becomesMonarch", scope: "self", whose: "you" } : null;
}
registerTriggerDetector(detectBecomesMonarch);

// ─── SELF-CAST detector (Hydroid Krasis, Desolation Twin, the Eldrazi cast-payoffs) ──────────────
// "When you cast THIS spell, <effect>" (CR 603.2 + 601.2 — the SPELL's OWN cast trigger). Distinct from every
// other cast trigger in this file: those are battlefield WATCHERS ("Whenever you cast a[n] <…> spell, …") that
// scan permanents at cast (checkCastTriggers). A self-cast trigger lives on the spell being cast — its source is
// the spell itself, not a permanent — and fires exactly once, as the spell goes on the stack, with the trigger
// going on the stack ABOVE the spell so it resolves FIRST (CR 603.3b). The runtime path is checkCastTriggers'
// self-cast block (it already handles the other non-watcher cast cases — heroic/prowess), which enqueues a
// pending trigger keyed on event:"selfCast" with the cast's chosen X threaded into context.xValue, so a half-X /
// X-amount payoff (Hydroid's "gain half X life and draw half X cards") resolves at the real X.
//
// CREED ANCHOR: matched ONLY on the EXACT bare self-referential condition, end-anchored. The general cast
// matcher (classifyCondition's castM) returns falsy for "you cast this spell" because "this" is in
// NON_SUBTYPE_CAST_WORDS (castSpellFilter("this") === null), so this registry detector cleanly owns the shape
// without colliding with the watcher path. A different caster, a spell-type rider, or any other text fails the
// `$` anchor → no match → Arbiter (a SAFE false-negative). The effect still has to parse HIGH for the card to
// flip native (buildTriggerStack re-gates the program), and a card carrying an UNMODELED sibling clause
// (Emerge / Rebound / Annihilator / the Kozilek graveyard-shuffle trigger) stays body-only via the standard
// allTriggerSentencesModeled / residue gates — verified by the corpus flip-diff.
function detectSelfCast(condition) {
  if (/^you cast this spell$/.test(String(condition).toLowerCase().trim())) {
    return { event: "selfCast", scope: "self", whose: "you" };
  }
  return null;
}
registerTriggerDetector(detectSelfCast);

// ─── PHASE-TRIGGER-FRAMEWORK (Wave 1) registration ──────────────────────────────
// Register the phase/step detector for the four step-kinds the inline classifyCondition doesn't cover
// (combat-on-your-turn, each-combat, first-main-phase, each-opponent's-upkeep). Done HERE — at the
// BOTTOM of triggers.js, after registerTriggerDetector + _triggerDetectors are defined — so it has
// GLOBAL visibility: every importer of triggers.js (runtime AND the coverage metric) sees the detector.
// The import is hoisted; triggerScheduler.js defines only pure functions (no top-level register call)
// and references opponentsOf only at call-time, so this import is load-safe (no TDZ cycle). The module
// must NOT also self-register — registering both here and there would push the detector twice.
import { detectPhaseTrigger } from "./triggerScheduler.js";
registerTriggerDetector(detectPhaseTrigger);
// GLOBAL SUBTYPE combat-damage ("a <Subtype> deals combat damage to a player, its controller may …" —
// Synapse/Brood Sliver). Registered here (defined above in this module, no import) so every importer —
// runtime AND the coverage metric — sees it. Consulted only after the inline classifyCondition returns
// falsy, which it does for the global form (the inline combat-damage block returns only for the you-control
// shapes), so this is purely additive (no existing classification changes).
registerTriggerDetector(detectSubtypeGlobalCombatDamage);
// GLOBAL SUBTYPE combat-damage-TO-A-CREATURE ("a <Subtype> deals combat damage to a creature, destroy that
// creature" — Toxin Sliver). Registered here (defined above, no import) so every importer — runtime AND the
// coverage metric — sees it. Consulted only after the inline classifyCondition returns falsy, which it does for
// the to-a-creature form (the inline combat-damage block returns only for the to-a-PLAYER you-control shapes),
// so this is purely additive (no existing classification changes).
registerTriggerDetector(detectSubtypeGlobalCombatDamageToCreature);
registerTriggerDetector(detectSelfCombatDamageToCreatureDestroy); // the SELF twin (Voracious Cobra) — same event, same rewrite, same firing site; only the scope differs
registerTriggerDetector(detectSelfCombatDamageToCreatureTapLock); // ⭐ the SECOND payoff shape on that same event/scope/fire site (Kashi-Tribe family) — tap-and-lock instead of destroy
// GLOBAL SUBTYPE damage → controller-lifegain ("a <Subtype> deals damage, its controller gains that much life"
// — Essence Sliver). Registered here (defined above, no import) so every importer — runtime AND the coverage
// metric — sees it. Consulted only after the inline classifyCondition returns falsy, which it does for the bare
// "deals damage" form (the inline combat-damage block only handles the "…combat damage to a player/creature/an
// opponent" shapes, and the self-scope "deals damage to a player/opponent" — none match "a <Subtype> deals
// damage"), so this is purely additive (no existing classification changes).
registerTriggerDetector(detectSubtypeGlobalDamageLifegain);

/**
 * STATE TRIGGERS (CR 603.8) — "When you control no Islands, sacrifice this creature." (Seasinger,
 * Barbarian Outcast; 19 corpus carriers, all one shape). Unlike every other trigger here the condition is
 * not a discrete event: it is CHECKED CONTINUOUSLY and the ability triggers whenever the state exists, at
 * the same cadence as state-based actions — so this is called from the CR 704.3 fixpoint (sba.js).
 *
 * THE LATCH (CR 603.8): a state trigger does NOT re-trigger every time the state is re-checked. It fires
 * when the condition becomes true, and only becomes eligible again once the condition has been FALSE. The
 * flag rides the permanent (`_stateTrigArmed`), mirroring renown's `renowned` / monstrosity's `monstrous`:
 * a latch inside the checker rather than a fail-open board read that would enqueue a fresh copy on every
 * single SBA pass (an unbounded-trigger FP, and this checker runs several times per priority window).
 *
 * The condition is evaluated by the SHARED interveningIf evaluator, so the metric and the runtime agree by
 * construction — a condition it can't read was never detected in the first place (classifyCondition gates
 * on interveningIfParseable), so `null` here is unreachable-by-construction and treated as "not met".
 * Pure: returns new state with any fired triggers appended to pendingTriggers.
 */
export function checkStateTriggers(state) {
  let fired = [];
  let players = null;
  for (const pid of Object.keys(state.players || {})) {
    for (const perm of triggerSourcesOf(state, pid)) {
      const descriptors = detectTriggers(perm.card).filter((d) => d.event === "stateTrigger");
      if (!descriptors.length) continue;
      for (const d of descriptors) {
        const met = evaluateInterveningIf(state, d.stateCondition, perm.controller, { sourcePermanentId: perm.id }) === true;
        const armed = perm._stateTrigArmed === true;
        if (met && !armed) {
          fired.push(makePendingTrigger(d, perm, perm, {}));
          players = players || { ...state.players };
          players[pid] = { ...players[pid], battlefield: (players[pid].battlefield || []).map((p) => (p.id === perm.id ? { ...p, _stateTrigArmed: true } : p)) };
        } else if (!met && armed) {
          // The state stopped being true — re-arm so a later re-entry into the state triggers again.
          players = players || { ...state.players };
          players[pid] = { ...players[pid], battlefield: (players[pid].battlefield || []).map((p) => (p.id === perm.id ? { ...p, _stateTrigArmed: false } : p)) };
        }
      }
    }
  }
  if (!fired.length && !players) return state;
  const base = players ? { ...state, players } : state;
  return fired.length ? { ...base, pendingTriggers: [...(base.pendingTriggers || []), ...fired] } : base;
}
