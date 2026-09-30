/**
 * effects/textNormalize.js — the oracle-text normalization + card-field leaf.
 *
 * Pure `String|card → String|boolean` helpers extracted verbatim from parser.js
 * (slice 1 of the parser.js decomposition, 2026-07-18). Two families:
 *   - CARD ACCESSORS: typeOf / isInstantOrSorcery / oracleOf / manaOf / hasXCost —
 *     read a card's type/oracle/mana fields defensively (either the raw Scryfall or
 *     the slim-index shape).
 *   - VACUOUS-RIDER + CAST-KEYWORD STRIPS: stripReminder + the four rider strips
 *     (regeneration / uncounterable / no-max-hand-size / cast-keyword lines) that let
 *     a modeled BODY parse while the stripped rider's meaning is either enforced
 *     elsewhere (CANT_REGEN_TEST re-detects the regen rider in parseEffectClause) or
 *     genuinely vacuous in this engine. Plus rewriteAmountX (the {X}-amount sentinel
 *     rewrite for the numeric clause parsers).
 *
 * LEAF — imports nothing; no cycle risk. parser.js imports the exported names back.
 * manaOf, CANT_REGEN_SUBJECTS/STRIP, CAST_KEYWORD_LINE, MADNESS_LINE stay
 * module-private (no external consumer). CANT_REGEN_TEST is exported: the
 * parseEffectClause wrapper re-detects the regen rider to stamp `cannotRegenerate`.
 */

/**
 * ABILITY-WORD LABELS (CR 207.2c) — "Landfall — Whenever …", "Morbid — …if a creature died this turn…".
 * The rule (read out of knowledge/mtg-judge/data/cr/cr_current.json) states ability words "have no special
 * rules meaning", and every carrier writes its own gate into the text, so removing the label is LOSSLESS.
 *
 * ⛔ IT LIVES IN THIS LEAF SO THERE IS EXACTLY ONE COPY. triggers.js strips it before trigger detection and
 * parser.js strips it before the spell parse; two copies of a CR-derived list is precisely how a metric and
 * a runtime drift apart on this project. Anchored to line-start + label + dash, so it can only ever consume
 * label-then-dash and never rules text.
 *
 * ⛔ ONLY LABELS WITH MEASURED FLIPS ARE LISTED. ~32 more 207.2c words appear in the corpus and measured
 * ZERO (adamant, battalion, channel, coven, domain, converge …). They are safe to add but UNTESTED, and an
 * untested entry in a list that can only loosen is how it grows past what anyone checked.
 */
export const ABILITY_WORD_LABEL_RE =
  // ④-AK (2026-09-03): the REST of CR 207.2c's list joined, traced word-for-word to the bundled rules text
  // (knowledge/mtg-judge/data/cr/cr_current.json, "207.2c") — adamant, addendum, celebration, chroma, cohort,
  // converge, council's dilemma, coven, descend 8, disappear, domain, eminence, fathomless descent, join forces,
  // kinship, pack tactics, parley, radiance, repartee, revolt, secret council, spell mastery, strive, tempting offer,
  // will of the council. An ability word has "no special rules meaning" by the CR's own definition, so the CR list
  // is a stronger gate than a measured flip. ⛔ FOUR 207.2c WORDS ARE DELIBERATELY LEFT OUT because the text AFTER
  // them is not an ability of the permanent: bloodrush, channel and grandeur label abilities activated FROM HAND
  // ("Bloodrush — {R}, Discard this card: …"), renew labels one activated FROM THE GRAVEYARD (the GY-3 lane peels it
  // itself), and sweep labels an ADDITIONAL COST ("Sweep — Return any number of Islands you control …") — stripped,
  // each would read as a battlefield activation or an effect, the forbidden direction (mutation-proven for two).
  // And SPELL MASTERY stays out for the opposite reason: an existing arm reads the label itself (the first
  // flip-diff LOST Animist's Awakening to the strip — "Spell mastery — If …, untap those lands" is parsed whole).
  /^(?:landfall|constellation|eerie|heroic|magecraft|treasure hunter|fast healing|enrage|raid|flurry of blows|flurry|eukrasia|opus|lieutenant|imprint|valiant|alliance|delirium|metalcraft|threshold|rally|morbid|ferocious|survival|descend 4|descend 8|formidable|paradox|fateful hour|hellbent|undergrowth|infusion|vivid|void|battalion|battle cry|inspired|avoidance|mega flare|adamant|addendum|celebration|chroma|cohort|converge|council's dilemma|council’s dilemma|coven|disappear|domain|eminence|fathomless descent|join forces|kinship|pack tactics|parley|radiance|repartee|revolt|secret council|strive|tempting offer|will of the council)(?:\s*\([^)]*\))?\s*[—–-]\s*/gim;

/** Remove a leading CR 207.2c ability-word label from every line that carries one. */
export function stripAbilityWordLabel(oracle) {
  return String(oracle || "").replace(ABILITY_WORD_LABEL_RE, "");
}

export function typeOf(card) {
  return String(card?.type || card?.type_line || "");
}
export function isInstantOrSorcery(card) {
  return /Instant|Sorcery/.test(typeOf(card));
}
export function oracleOf(card) {
  return String(card?.oracle || card?.oracle_text || "");
}
function manaOf(card) {
  return String(card?.mana || card?.mana_cost || "");
}
/** Does the card's mana cost carry an {X} pip (Fireball, Blaze, Stroke of Genius…)? */
export function hasXCost(card) {
  return /\{X\}/i.test(manaOf(card));
}

/** Strip reminder text in parens + collapse whitespace. */
export function stripReminder(text) {
  return String(text || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

// MTG-001 — the "(They|It|That creature|Those creatures|A creature destroyed this way|Creatures destroyed this
// way) can't be regenerated." rider. Anchored to these subject forms only, so a DAMAGE rider ("a creature dealt
// damage this way can't be regenerated this turn" — Incinerate) does NOT match (it requires "DESTROYED this way",
// not "dealt damage this way"). The "destroyed this way" forms cover Damn / Decree of Pain / In Garruk's Wake's
// single ("Destroy target creature. A creature destroyed this way can't be regenerated.") + mass ("Destroy all
// creatures. …") riders. STRIP (CANT_REGEN_STRIP) and DETECT (CANT_REGEN_TEST) are derived from one source so
// they can never drift: whatever the parse text strips, the parseEffectClause wrapper must detect.
const CANT_REGEN_SUBJECTS = /\b(?:they|it|that creature|those creatures|a creature destroyed this way|creatures destroyed this way) can'?t be regenerated\b/;
const CANT_REGEN_STRIP = new RegExp(CANT_REGEN_SUBJECTS.source + "\\.?", "gi");
export const CANT_REGEN_TEST = new RegExp(CANT_REGEN_SUBJECTS.source, "i");
/**
 * Remove the "can't be regenerated" rider from the PARSE TEXT so the rest of the card (Wrath of God's
 * "Destroy all creatures", Terminate's "Destroy target creature") still matches its anchored pattern. The
 * rider is NOT vacuous — regeneration shields ARE modeled (CR 701.19; applyDestroyEffect / the lethal SBA
 * consume them) — so the parseEffectClause wrapper re-detects it (CANT_REGEN_TEST) and stamps
 * `cannotRegenerate` on the resulting destroy atom(s), and applyDestroyEffect then ignores shields for that
 * destruction. Stripping here is purely to let the lead effect parse; the rider's MEANING is preserved.
 */
export function stripRegenerationRider(text) {
  return String(text || "").replace(CANT_REGEN_STRIP, " ");
}

/**
 * Remove the "This spell can't be countered[ by spells or abilities]." rider — VACUOUS for the effect
 * parser: uncounterability is ENFORCED at the counter-target enumerator (spellEffects.enumerateTargets
 * excludes an on-card "can't be countered" spell from a counter's legal targets), NOT by the effect
 * program, so the spell resolves IDENTICALLY whether or not the parser sees this clause. Stripping it
 * (rather than failing the all-or-nothing gate on an otherwise-unmodeled clause) lets a modeled spell
 * carrying it — Supreme Verdict ("Destroy all creatures. … This spell can't be countered."), Rending
 * Volley — parse natively. Anchored to the "this spell can't be countered" sentence only.
 */
export function stripUncounterableRider(text) {
  return String(text || "").replace(/\bthis spell can'?t be countered(?: by spells or abilities)?\b\.?/gi, " ");
}

/**
 * Drop the "You have no maximum hand size for the rest of the game." rider — VACUOUS in this engine, exactly
 * like the uncounterable rider above. The cleanup-step discard-to-max-hand-size is NOT implemented
 * (gameEngine cleanup is a documented placeholder; the narrator only describes the discard), so a player
 * never discards down to a maximum regardless of this static — the resolution is IDENTICAL whether or not
 * the parser sees this clause. Stripping it (rather than failing the all-or-nothing gate) lets Ancient Silver
 * Dragon's "roll a d20. Draw cards equal to the result." parse natively. Anchored to the exact sentence only.
 * (If a future slice implements cleanup discard, this strip must be revisited — the static would then matter.)
 */
export function stripNoMaxHandSizeRider(text) {
  return String(text || "").replace(/\byou have no maximum hand size for the rest of the game\b\.?/gi, " ");
}

/**
 * KWSTRIP-1 — strip a VACUOUS cast/alternate-cost keyword LINE so the spell's actual BODY can parse (the
 * #200 vacuous-rider precedent; zero new resolver). Each of these keywords is a different WAY to cast or
 * use the card — foretell / suspend (cast later from exile), splice onto Arcane (graft the text onto an
 * Arcane spell), recover (a graveyard ability), harmonize, basic landcycling (discard-to-fetch from hand)
 * — NONE of which changes the spell's resolution when it is cast NORMALLY, so the engine resolves the body
 * identically whether or not the parser sees the keyword line. Anchored to a whole LINE that STARTS with
 * the keyword + its cost, so it can never eat a body sentence (a suspend card's "Exile ~ with N time
 * counters" body stays intact → still LOW, correctly). DELIBERATELY EXCLUDES rebound / cipher / conspire /
 * learn / proliferate / amass — those DO add an effect (recast / encode / copy / Lesson / extra effect),
 * so their card must stay LOW → Arbiter (never strip a non-vacuous keyword).
 */
// `cycling\s*\{` (KW-CYCLING) strips the plain-cycling line so a cycling SPELL's body parses native —
// UNLIKE the unenforced keywords above, cycling IS enforced (the from-hand `cycle` activation in
// legalChoices/actionDispatcher actually discards-and-draws), so the spell counts native honestly. The
// `^…cycling` anchor never matches "plainscycling"/"landcycling" — typecycling stays unstripped (its
// search variant routes to the Arbiter until the tutor atom covers it).
//
// ALTCAST-STRIP (flashback insight generalized): jump-start / retrace / escape are ALL just from-graveyard
// recast options — `Jump-start` (recast from GY paying the mana cost + discarding a card), `Retrace` (recast
// from GY discarding a land), `Escape—{cost}, Exile N cards` (recast from GY paying an exile cost). NONE
// changes the spell's resolution when it is cast NORMALLY from hand, so the body resolves identically and the
// keyword line is vacuous → stripped. The recast itself stays a SAFE false-negative (the engine won't offer
// the GY cast). Any escape PAYOFF rider ("if this spell was cast for its escape cost, …") lives in the BODY,
// not on the keyword line, so it self-gates the card to the Arbiter — stripping the line cannot fabricate it.
//
// ALTCAST-STRIP-2 — the alternate-COST / alternate-TIMING family: spectacle ("cast for spectacle cost if an
// opponent lost life"), prowl ("…if you dealt combat damage with a Rogue"), surge ("…if you/a teammate cast
// another spell"), miracle ("cast for miracle cost when you draw it"). Each is purely a different way/cost/
// timing to cast; the BODY resolves identically on a normal cast, so the line is vacuous → stripped. awaken
// is the ESCAPE-CLASS: `Awaken N—{cost}` carries a bonus ("If you cast this for awaken, ALSO put N counters
// on a land and it becomes a creature") that is CONDITIONAL on the awaken cast, so for a normal cast the body
// alone is the complete resolution (not offering awaken is a SAFE FN, exactly like escape's exile cost). The
// `awaken\s+\d+\s*[—–-]` anchor (number + dash) matches "Awaken 3—{4}{U}{U}" but NOT the MDFC face header
// "Awaken the Blood Avatar - Sorcery". DELIBERATELY EXCLUDES kicker (its kicked effect lives in the body →
// the card self-gates anyway), spree (modal additional costs that ADD effects), and bestow/dash/evoke/blitz
// (those add a kept effect / change the card's mode → NOT vacuous).
// OVERLOAD (CR 702.96) — "Overload {cost}": cast for the overload cost and change every "target" in the
// spell's text to "each". The PRINTED (non-overload) mode IS the single-target text; a NORMAL cast resolves
// it exactly as written (the runtime hard-casts at the normal cost with normal targeting and never offers the
// overload mode), so the line is vacuous for the normal cast — JOINING the family. The only unmodeled part is
// the optional overload "each" rewrite, which can never mis-resolve a normal cast (THE CREED, the same
// alternative-cost trade as spectacle/prowl). Anchored to a line-leading "overload {", so a prose mention or an
// "overload" TRIGGER (never line-leading with a brace cost) is untouched. Damn ("Destroy target creature. …"),
// Cyclonic Rift, Mizzium Mortars, Vandalblast, Electrickery, etc. flip native-spell on their printed mode.
// FLASHBACK NON-MANA COST (Dread Return "Flashback—Sacrifice three creatures", Deep Analysis, Lava Dart,
// Battle Screech): flashback's cost may be a NON-MANA cost written with an em-dash ("Flashback—<cost>")
// instead of a brace mana cost ("Flashback {cost}"). Both are the SAME pure alternate-cast keyword (cast the
// card from the GRAVEYARD for the flashback cost, then exile it, CR 702.34) — vacuous for the from-hand cast,
// which resolves the printed body identically and goes to the graveyard. The runtime never offers the
// graveyard re-cast (a SAFE false-negative, exactly like the already-stripped mana-cost flashback), so
// stripping the line lets the base body parse. `flashback\s*(?:\{|[—–-])` covers both cost shapes.
// BUYBACK (CR 702.27) / ENTWINE (702.42) / CONSPIRE (702.78) — census slice 2026-07-24, the same
// optional-ADDITIONAL-cost class as spectacle/prowl/surge: each changes the resolution ONLY when its
// cost was paid at cast (buyback → return to hand instead of graveyard; entwine → both modes;
// conspire → copy), and the engine never pays them — a normal cast resolves the printed body
// byte-identically and the spell graveyards normally. Vacuous line for the normal cast → stripped.
// Entwine's normal cast is the printed CHOOSE-ONE modal, which the modal engine already owns.
// Conspire is a bare keyword after reminder-strip (no brace cost), so it anchors on the word alone —
// a "whenever you cast a spell with conspire" trigger is never line-leading and stays untouched.
// MAYHEM (Duskmourn) — a discarded-this-turn GRAVEYARD cast window: the flashback twin exactly
// (cast from GY for the mayhem cost; vacuous for the from-hand cast), joining on flashback's basis.
// WEB-SLINGING — "You may cast this spell for {2}{G} if you also return a tapped creature you control to
// its owner's hand." A pure ALTERNATIVE COST, the prowl / spectacle / surge class already in this list:
// declining means casting for the printed mana cost, which is what the engine does anyway.
// IMPENDING N—{cost} — "If you cast this spell for its impending cost, it enters with N time counters and
// isn't a creature until the last is removed." An alternative CAST MODE. Declining means the normal cast:
// the permanent enters as an ordinary creature, which is a real complete play (and the one the engine
// already takes). The time-counter half exists ONLY in the mode that was not chosen.
// ⛔ NOT ADMITTED, and recorded so the refusals are not re-litigated:
//   · POISON TOLERANCE +N ("it takes N additional poison counters for you to lose the game") is MANDATORY
//     and raises a real loss threshold — gameState models losing at ten or more, so ignoring the line would
//     make a player lose when the card says they survive. That is a WRONG game state, not a missed option.
//   · PARADIGM exiles the spell UNCONDITIONALLY ("Then exile this spell"), so ignoring it graveyards a card
//     that should be in exile — a board difference with no unpaid state to hide behind.
// UNDAUNTED (CR 702.150a) — "This spell costs {1} less to cast for each opponent." A pure COST REDUCTION,
// which is DELVE's exact twin: delve is already credited on "not delving = paying full cost", and not
// applying undaunted is likewise paying full cost. The engine casts at the printed price, which is STRICTLY
// HARDER than the card allows — the safe direction, and it changes nothing about what resolves.
// BARGAIN (CR 702.166a) — "You may sacrifice an artifact, enchantment, or token as you cast this spell." An
// optional ADDITIONAL cost, the replicate/buyback class: declining leaves the spell simply not bargained,
// which is a real complete play. Its carriers' "…costs {N} less to cast if it's bargained" line is a
// SEPARATE sentence already handled, so declining only means paying full price. ⛔ `bargain\b` cannot match
// the "if it's bargained" references — no word boundary between "bargain" and "ed" — and the anchor is
// line-leading anyway.
// CIPHER (CR 702.98a) — joins on this block's OWN stated basis: it changes the resolution only when the
// option is taken, and the engine never takes it, so a normal cast resolves the printed body byte-identically
// and the spell graveyards normally. "Then you MAY exile this spell card encoded on a creature you control" is
// declined, and the encoded-copy trigger that the reminder describes exists only if it was taken — verified,
// not assumed: detectTriggers returns ZERO for a cipher carrier, so nothing leaks in as a phantom descriptor.
// Bare keyword after reminder-strip (no brace cost), so it anchors on the word alone, exactly like conspire.
// The keyword-only credit in coverage.js carries the matching rationale for the PERMANENT-residue side.
const CAST_KEYWORD_LINE = /^[ \t]*(?:foretell\s*\{|freerunning\s*\{|suspend\s+\d+\s*[—–-]|splice onto arcane\s*\{|recover\s*\{|harmonize\s*\{|(?:basic land|[a-z]+)?cycling\s*\{|flashback\s*(?:\{|[—–-])|jump-start\b|retrace\b|escape\s*[—–-]|spectacle\s*\{|prowl\s*\{|surge\s*\{|miracle\s*\{|overload\s*\{|awaken\s+\d+\s*[—–-]|buyback\s*\{|entwine\s*\{|conspire\b|cipher\b|undaunted\b|bargain\b|web-slinging\s*\{|impending\s+\d+\s*[—–-]|mayhem\s*\{|dredge\s+\d)[^\n]*$/gim;
// ⭐ TYPECYCLING joined the cycling entry 2026-08-14 (Step Through's "Wizardcycling {2}"): `[a-z]+cycling`
// covers wizardcycling / slivercycling / mountaincycling etc. — the SAME vacuous-for-the-normal-cast
// justification as plain cycling (a hand-side alternative that never touches the spell's own resolution;
// the permanent path already treated it that way — Vedalken Aethermage).
// MADNESS_LINE needs a TIGHTER anchor than the others: a madness line can be COMPOUND
// ("Madness {R}, cycling {1}{R}, kicker {2}{R}, buyback {4}{R}" — Blast from the Past), and buyback's
// kept "return to hand as it resolves" effect lives ONLY on that line. A greedy `[^\n]*$` strip would drop
// it → an FP (the card would flip native without the buyback return). So madness is stripped ONLY when its
// line is madness-ALONE: the cost, an optional reminder paren, then end-of-line. A compound keyword line
// (comma + another keyword after the cost) does NOT match and stays intact → the card keeps its non-vacuous
// rider and correctly routes to the Arbiter. Madness itself (cast-from-exile on discard) is vacuous for the
// normal cast, so a madness-alone body resolves identically.
const MADNESS_LINE = /^[ \t]*madness\s*(?:\{[^}]*\})+[ \t]*(?:\([^\n]*\))?[ \t]*$/gim;
// SPLIT_SECOND_LINE — the spell-side twin of the COVERED_KEYWORDS credit for permanents (census slice 42).
// Split second prints with NO cost, so it cannot ride CAST_KEYWORD_LINE, whose every alternative anchors on a
// cost brace or dash; and a greedy `[^\n]*$` tail would be unsafe on a costless keyword. So it takes the
// TIGHT MADNESS_LINE shape instead: the bare keyword, an optional reminder paren, end of line. A compound
// line stays intact and the card correctly parks (FN-safe).
//
// The restriction itself is really enforced — legalChoices.splitSecondOnStack suppresses casts and non-mana
// activations for every player while such a spell is on the stack. This strip only stops the printed keyword
// LINE from parking the spell body, exactly as dredge needed when it hit this same permanent/spell split.
const SPLIT_SECOND_LINE = /^[ \t]*split second[ \t]*(?:\([^\n]*\))?[ \t]*$/gim;
// DECLARE-ATTACKERS CAST WINDOW (the Fallen Empires / Alliances combat-trick cycle — Defiant Stand, Rally
// the Troops, Scorching Winds, Assassin's Blade, Eightfold Maze, Just Fate, Treetop Defense, Warrior's
// Stand): "Cast this spell only during the declare attackers step and only if you've been attacked this
// step." A whole SENTENCE rather than a keyword, carrying no atom of its own, so it parked every body
// behind it.
//
// ⭐ SAME BASIS AS SPLIT SECOND DIRECTLY ABOVE, and that basis is the whole argument: the restriction is
// REALLY ENFORCED — legalChoices' cast-offer chokepoint refuses the card unless `hasBeenAttackedThisStep`
// (declare-attackers step AND an attacker declared against this player). This strip only stops the printed
// line from parking the body. Crediting an UNENFORCED cast restriction would hand the engine a combat trick
// playable at any time, which is a strictly stronger card than the printed one.
//
// ⛔ BOTH HALVES ANCHORED TOGETHER. A card printing only the step half without the been-attacked condition
// is a DIFFERENT restriction that the gate would under-enforce, so it must not match here (CREED).
// SHUFFLE-INSTEAD-OF-GRAVEYARD (CR 614) on the SPELL side - Nexus of Fate. "If Nexus of Fate would be put
// into a graveyard from anywhere, reveal it and shuffle it into its owner's library instead." Same
// replacement as the permanents, but an instant needs the sentence off its BODY so the extra-turn effect
// parses. Enforced at gameState.moveCardToZone, which redirects any graveyard-bound move for such a card -
// so this strip only stops the printed line from parking the body, exactly like SPLIT SECOND above.
// SELF-FLASH PERMISSION (a printed permission, not the CR 702.8 keyword) - "You may cast this spell as
// though it had flash[ if X is 3 or less]." Sometimes with a rider: "If you cast it any time a sorcery
// couldn't have been cast, the controller of the permanent it becomes sacrifices it at the beginning of the
// next cleanup step." (Spider Climb, Lightning Reflexes, Mystic Veil, Soar, Rout, Ghitu Fire and 8 more.)
//
// VACUOUS FOR THE CAST THIS ENGINE MAKES, and that was VERIFIED on a board rather than assumed: these cards
// are offered ONLY in a main phase, while a real instant in the same hand is offered in upkeep and
// declare-blockers too. The engine never takes the flash permission, so the permission changes nothing AND
// its drawback can never trigger - the rider is conditioned on casting "any time a sorcery couldn't have
// been cast", which never happens here. Same basis as the morph / ninjutsu / madness strips, and as the bare
// "Flash" keyword already admitted in auraResidueClauses: an alternative way to play the card that the
// runtime does not offer. FN-safe - the engine plays a strictly weaker, rules-correct card.
//
// ANCHORED TO A LINE THAT STARTS WITH THE PERMISSION, so a card granting flash to something ELSE ("You may
// cast creature spells as though they had flash") is never touched. Exported because the PERMANENT side
// needs the identical strip - 8 of the 14 carriers are Auras/enchantments that never reach the spell parser
// - and one shared regex is the only way the metric and the parser cannot drift.
// DISCARD-COST HAND ABILITY line - "<mana>, Discard this card: <effect>" (cycling generalized).
// ONE regex, three readers (abilities.parseDiscardCostAbility, the spell-path strip in parser.js, and the
// residue strip in coverage.js) so the runtime gate and the metric cannot drift apart.
export const DISCARD_COST_ABILITY_LINE = /^(?:\{[^}]+\})+, Discard this card: /i;
export const FLASH_PERMISSION_LINE = /^[ \t]*you may cast this spell as though it had flash[^\n]*$/gim;
/** Drop the self-flash permission line (with any rider) - see the note above for why it is vacuous here. */
export function stripFlashPermissionLine(text) {
  return String(text || "").replace(FLASH_PERMISSION_LINE, " ");
}
const SHUFFLE_INSTEAD_OF_GY_LINE =
  /(?:^|[\n.;])[ \t]*if [^\n]* would be put into a graveyard from anywhere,[^\n]*instead[ \t]*\.?[ \t]*$/gim;
const CAST_ONLY_DECLARE_ATTACKERS_LINE =
  /(?:^|[\n.;])[ \t]*cast this spell only during the declare attackers step and only if you(?:'|’)ve been attacked this step[ \t]*\.?[ \t]*$/gim;
// CAST ONLY AFTER ANOTHER SPELL (the 09-06 plan's stage ③ · 12, 2026-09-30 — Illusory Angel, Skyshroud Condor, Hewed Stone
// Retainers): "Cast this spell only if you've cast another spell this turn." A cast restriction (CR 601.3) on the same basis
// as the declare-attackers one above: REALLY ENFORCED at legalChoices' cast-offer chokepoint (spellsCastThisTurn ≥ 1), so
// this strip only stops the printed line from parking the body. ONE pattern for the detector
// (effects/abilities.castOnlyAfterAnotherSpell) and the strip, so the gate and the metric cannot drift. The whole sentence
// is anchored: another count ("two or more spells") is a different restriction and stays residue.
export const CAST_ONLY_AFTER_ANOTHER_SPELL_PATTERN = "^[ \\t]*cast this spell only if you(?:'|’)ve cast another spell this turn\\.?[ \\t]*$";
/** Drop the "cast this spell only if you've cast another spell this turn" line — see the note above. */
export function stripCastOnlyAfterAnotherSpellLine(text) {
  return String(text || "").replace(new RegExp(CAST_ONLY_AFTER_ANOTHER_SPELL_PATTERN, "gim"), " ");
}
export function stripCastKeywordLines(text) {
  return String(text || "")
    // FLASHBACK RIDER GUARD (hollow closed 2026-09-05, surfaced by Visions of Dominance's flip): CAST_KEYWORD_LINE strips a
    // Flashback line WHOLE. A trailing sentence is honest to drop only when it modifies the flashback cast itself — "This
    // spell costs {X} less to cast THIS WAY" / "If you cast this spell THIS WAY, …" — because the engine never offers a
    // flashback cast (a safe FN). Any OTHER trailing sentence is an ability the classifier would silently credit, so the
    // line is fenced behind a prefix the keyword regex cannot match; it stays as residue and the card parks (CREED).
    // Every printed Flashback trailing sentence today is "this way"-scoped (Visions cycle, Light Up the Night) — zero
    // corpus impact; the guard exists for the shape the corpus has not printed yet.
    .replace(/^([ \t]*flashback\s*(?:\{[^}]+\})+)(\s*\([^)]*\))?\.\s*([^\n]*\S)[ \t]*$/gim, (m, head, reminder, rest) => {
      const tail = String(rest).replace(/\([^)]*\)/g, " ").trim();
      if (!tail || /\bthis way\b/i.test(tail)) return m;
      return `unmodeled rider on ${head.trim()}. ${rest}`; // the fence must not itself start with "flashback" + a dash (the keyword regex accepts that)
    })
    .replace(CAST_KEYWORD_LINE, " ")
    .replace(MADNESS_LINE, " ")
    .replace(SPLIT_SECOND_LINE, " ")
    .replace(CAST_ONLY_DECLARE_ATTACKERS_LINE, " ")
    .replace(SHUFFLE_INSTEAD_OF_GY_LINE, " ")
    .replace(FLASH_PERMISSION_LINE, " ");
}

/**
 * For an {X}-cost spell, rewrite the X in the AMOUNT slot of a modeled clause to a
 * sentinel "1" so the proven numeric clause parser recognizes the shape; the caller
 * stamps `amountX` and drops the sentinel. ONLY the amount slot is rewritten — a
 * power/cardinality X ("power X or less", "X target creatures", "gain X life") is
 * left intact so it stays unmodeled → low. Returns the rewritten clause, or null
 * when no amount-X shape matches (so a fixed clause in an X-spell parses numerically).
 */
export function rewriteAmountX(clause) {
  const damage = /(deals?\s+)X(\s+damage\b)/i;
  const draw = /(\bdraws?\s+)X(\s+cards?\b)/i; // "draws?" covers the each-player/target form ("target player draws X cards", "each player draws X cards") in addition to the controller "draw X cards"
  // (`gets?` on the NEGATIVE forms ONLY — TOXIC DELUGE 2026-08-15: "All creatures GET -X/-X". The
  // POSITIVE form stays singular `gets`: widening it hijacked Finale of Devastation's "creatures you
  // control get +X/+X and gain haste…" away from its own conditional team-pump path — a measured LOST
  // on this slice's first flip-diff, reverted the same hour.)
  const pumpSym = /(\bgets\s+)\+X\/\+X\b/i;
  // NEGATIVE symmetric X-pump (X-PUMP-NEG): "gets -X/-X" — a debuff scaled by the chosen X (Grim Hireling's
  // "Target creature gets -X/-X until end of turn", paid with X sacrificed Treasures). Rewrites to the sentinel
  // "-1/-1" so the numeric pump clause parses, and reports xSign:-1 so the caller stamps amountXNeg — the
  // resolver then applies -X/-X (both pips = -ctx.xValue) and the lethal SBA drops a creature to <=0 toughness.
  const pumpSymNeg = /(\bgets?\s+)-X\/-X\b/i;
  // DOUBLED NEGATIVE X-pump (Nuclear Fallout — SHELF S7): "gets twice -X/-X" — both pips subtract 2·X.
  // Rewrites to the same "-1/-1" sentinel; xTimes:2 rides out so the caller stamps amountXTimes.
  const pumpSymNegTwice = /(\bgets?\s+)twice -X\/-X\b/i;
  // ASYMMETRIC X-pump (X-PUMP-ASYM): ONE pip is +X, the other a printed value — "+X/+0" / "+X/+2"
  // (slot "p") and "+0/+X" / "+2/+X" (slot "t"). The non-X pip MUST be a digit (so these can never
  // match the symmetric +X/+X handled above). The caller carries the printed ptDelta + amountXSlot so
  // the resolver scales only the marked pip; the other reads its printed value.
  const pumpXP = /(\bgets\s+\+)X(\/[+]\d+\b)/i;
  const pumpXT = /(\bgets\s+[+]\d+\/[+])X\b/i;
  if (damage.test(clause)) return { clause: clause.replace(damage, (_, a, b) => `${a}1${b}`), xSlot: null };
  if (draw.test(clause)) return { clause: clause.replace(draw, (_, a, b) => `${a}1${b}`), xSlot: null };
  if (pumpSym.test(clause)) return { clause: clause.replace(pumpSym, (_, a) => `${a}+1/+1`), xSlot: null };
  if (pumpSymNegTwice.test(clause)) return { clause: clause.replace(pumpSymNegTwice, (_, a) => `${a}-1/-1`), xSlot: null, xSign: -1, xTimes: 2 };
  if (pumpSymNeg.test(clause)) return { clause: clause.replace(pumpSymNeg, (_, a) => `${a}-1/-1`), xSlot: null, xSign: -1 };
  if (pumpXP.test(clause)) return { clause: clause.replace(pumpXP, (_, a, b) => `${a}1${b}`), xSlot: "p" };
  if (pumpXT.test(clause)) return { clause: clause.replace(pumpXT, (_, a) => `${a}1`), xSlot: "t" };
  return null;
}

// ── TORPOR ORB (residue grind RG-2, 2026-09-05 — Torpor Orb / Hushwing Gryff / Tocatli Honor Guard): "Creatures entering
// don't cause abilities to trigger." CR 603.2 — while a carrier is on ANY battlefield, a CREATURE entering raises no
// enters events at all (its own ETB, every "whenever a creature enters" watcher). ONE reader in this leaf, imported by the
// static parser's marker (the classifier side) and by the enters-event dispatchers (the runtime side) — no drift. A live
// scan (the carrier leaving lifts it), symmetric (CR 109.2), and the carrier's own arrival counts (Hushwing Gryff silences
// its own entrance — the published ruling) because the scan runs once the carrier is already on the battlefield.
export const ENTERS_DONT_TRIGGER_RE = /(?:^|[\n.;])\s*creatures entering don't cause abilities to trigger\s*(?:\.|$)/i;
export function entersDontTriggerOf(card) {
  return ENTERS_DONT_TRIGGER_RE.test(String(card?.oracle || card?.oracle_text || "").replace(/[’]/g, "'"));
}
// ── SKIP YOUR DRAW STEP (residue grind RG-4, 2026-09-05 — Wild Wasteland / Taigam, Sidisi's Hand / Null Profusion / Recycle):
// CR 614.10 — the CONTROLLER's own draw step is skipped. Controller-scoped on purpose ("your"): an opponent's carrier never
// skips yours. Read by the turn engine's draw-step case for the active player; the marker in parseStaticAbilities credits it.
export const SKIP_DRAW_STEP_RE = /(?:^|[\n.;])\s*skip your draw step\s*(?:\.|$)/i;
export function skipsDrawStepOf(card) {
  return SKIP_DRAW_STEP_RE.test(String(card?.oracle || card?.oracle_text || ""));
}
export function skipsDrawStep(state, playerId) {
  for (const perm of (state?.players?.[playerId]?.battlefield || [])) if (skipsDrawStepOf(perm.card)) return true;
  return false;
}
// ── FIST OF SUNS (residue grind RG-5, 2026-09-05 — Fist of Suns / Jodah, Archmage Eternal): "You may pay {W}{U}{B}{R}{G}
// rather than pay the mana cost for spells you cast." CR 118.9 — a board-granted ALTERNATIVE cost for every spell the
// carrier's controller casts. Controller-scoped ("spells YOU cast"). Read by the hand-cast enumeration (legalChoices), which
// offers a second cast variant whose cost IS the five pips — the normal payment path pays it; the marker in
// parseStaticAbilities credits the line.
export const WUBRG_ALT_COST_RE = /(?:^|[\n.;])\s*you may pay \{W\}\{U\}\{B\}\{R\}\{G\} rather than pay the mana cost for spells you cast\s*(?:\.|$)/i;
export function grantsWubrgAltCostOf(card) {
  return WUBRG_ALT_COST_RE.test(String(card?.oracle || card?.oracle_text || ""));
}
export function grantsWubrgAltCost(state, playerId) {
  for (const perm of (state?.players?.[playerId]?.battlefield || [])) if (grantsWubrgAltCostOf(perm.card)) return true;
  return false;
}
// ── THE SPELL'S OWN FIXED-MANA ALTERNATIVE COST (residue grind RG-8, 2026-09-05 — the Bringers "You may pay {W}{U}{B}{R}{G}
// rather than pay this spell's mana cost."): the pips, or null. The hand-cast enumeration emits the same cost-VARIANT action
// RG-5 built for Fist of Suns (the ordinary payment path pays the pips; never the altCost branch, which pays no mana); the
// classifier's permanent lane covers the sentence as modelled residue; castModifiers strips it for a spell's program parse.
export const FIXED_MANA_ALT_COST_RE = /(?:^|\n)\s*you may pay ((?:\{[WUBRG]\})+) rather than pay this spell's mana cost\.?\s*(?:\n|$)/i;
// THE TRAP FORM (shelf D17 — the Zendikar Trap cycle): "If <condition>, you may pay <cost> rather than pay this spell's mana
// cost." The same cost-variant, offered only while the condition holds — read by the shared interveningIf reader at the
// cast site, and stripped for the program parse (castModifiers) only when that reader can parse it, so the two agree. The
// cost may carry generic pips ({0} — Mindbreak Trap; {1}{G} — Baloth Cage Trap). Returns { pips, condition } or null.
export const CONDITIONAL_FIXED_MANA_ALT_COST_RE = /(?:^|\n)\s*if ([^,.\n]+), you may pay ((?:\{(?:[WUBRG]|\d+)\})+) rather than pay this spell's mana cost\.?\s*(?:\n|$)/i;
export function conditionalFixedManaAltCostOf(card) {
  // The CR 207.2c label comes off first ("Raid — If you attacked this turn, you may pay {U} …" — Admiral's Order), exactly as
  // the program parse strips it, so the offer reads the sentence the strip credited.
  const m = CONDITIONAL_FIXED_MANA_ALT_COST_RE.exec(stripAbilityWordLabel(String(card?.oracle || card?.oracle_text || "")));
  return m ? { pips: m[2].toUpperCase(), condition: m[1].trim().toLowerCase() } : null;
}
export function fixedManaAltCostOf(card) {
  const m = FIXED_MANA_ALT_COST_RE.exec(String(card?.oracle || card?.oracle_text || ""));
  return m ? m[1].toUpperCase() : null;
}
// ── ELESH NORN, MOTHER OF MACHINES (shelf D20): "Permanents entering don't cause abilities of permanents your opponents control
// to trigger." Torpor Orb's sibling, scoped the other way: ANY permanent entering still raises its enters events, but no
// ability of a PERMANENT controlled by an opponent of a carrier's controller triggers from one — their own enters abilities and
// their watchers alike. Emblems and graveyard-functioning cards are not permanents and are untouched. A live scan (the carrier
// leaving lifts it), run with the carrier already on the battlefield, so its own entrance counts (CR 603.10 — the continuous
// effects that exist immediately after the event decide what triggers).
export const OPP_ENTERS_DONT_TRIGGER_RE = /(?:^|[\n.;])\s*permanents entering don't cause abilities of permanents your opponents control to trigger\s*(?:\.|$)/i;
export function oppEntersDontTriggerOf(card) {
  const o = String(card?.oracle || card?.oracle_text || "");
  return o.includes("opponents control to trigger") && OPP_ENTERS_DONT_TRIGGER_RE.test(o.replace(/[’]/g, "'"));
}
/** ONE battlefield scan per enters event → a predicate: are `pid`'s PERMANENTS' abilities silenced — does another player
 *  control a carrier? (The dispatchers run on every land drop, so the scan is not repeated per watcher or per player.) */
export function entersSilencer(state) {
  const carriers = [];
  for (const [pid, pl] of Object.entries(state?.players || {})) {
    if ((pl?.battlefield || []).some((perm) => oppEntersDontTriggerOf(perm.card))) carriers.push(pid);
  }
  return (pid) => carriers.some((c) => c !== pid);
}
export function creatureEntersSuppressed(state, enteredPerm) {
  // Only a CREATURE entering is silenced — read off the printed front-face type line at entry (an artifact, an enchantment,
  // a land entering still triggers everything). An animated-later permanent entered as whatever it was printed as.
  if (!/\bCreature\b/i.test(String(enteredPerm?.card?.type || enteredPerm?.card?.type_line || "").split(" // ")[0])) return false;
  for (const pl of Object.values(state?.players || {})) {
    for (const perm of (pl.battlefield || [])) if (entersDontTriggerOf(perm.card)) return true;
  }
  return false;
}
