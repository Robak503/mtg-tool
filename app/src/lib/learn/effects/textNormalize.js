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
const CAST_KEYWORD_LINE = /^[ \t]*(?:foretell\s*\{|freerunning\s*\{|suspend\s+\d+\s*[—–-]|splice onto arcane\s*\{|recover\s*\{|harmonize\s*\{|basic landcycling\s*\{|cycling\s*\{|flashback\s*(?:\{|[—–-])|jump-start\b|retrace\b|escape\s*[—–-]|spectacle\s*\{|prowl\s*\{|surge\s*\{|miracle\s*\{|overload\s*\{|awaken\s+\d+\s*[—–-]|buyback\s*\{|entwine\s*\{|conspire\b|mayhem\s*\{)[^\n]*$/gim;
// MADNESS_LINE needs a TIGHTER anchor than the others: a madness line can be COMPOUND
// ("Madness {R}, cycling {1}{R}, kicker {2}{R}, buyback {4}{R}" — Blast from the Past), and buyback's
// kept "return to hand as it resolves" effect lives ONLY on that line. A greedy `[^\n]*$` strip would drop
// it → an FP (the card would flip native without the buyback return). So madness is stripped ONLY when its
// line is madness-ALONE: the cost, an optional reminder paren, then end-of-line. A compound keyword line
// (comma + another keyword after the cost) does NOT match and stays intact → the card keeps its non-vacuous
// rider and correctly routes to the Arbiter. Madness itself (cast-from-exile on discard) is vacuous for the
// normal cast, so a madness-alone body resolves identically.
const MADNESS_LINE = /^[ \t]*madness\s*(?:\{[^}]*\})+[ \t]*(?:\([^\n]*\))?[ \t]*$/gim;
export function stripCastKeywordLines(text) {
  return String(text || "").replace(CAST_KEYWORD_LINE, " ").replace(MADNESS_LINE, " ");
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
  const pumpSym = /(\bgets\s+)\+X\/\+X\b/i;
  // NEGATIVE symmetric X-pump (X-PUMP-NEG): "gets -X/-X" — a debuff scaled by the chosen X (Grim Hireling's
  // "Target creature gets -X/-X until end of turn", paid with X sacrificed Treasures). Rewrites to the sentinel
  // "-1/-1" so the numeric pump clause parses, and reports xSign:-1 so the caller stamps amountXNeg — the
  // resolver then applies -X/-X (both pips = -ctx.xValue) and the lethal SBA drops a creature to <=0 toughness.
  const pumpSymNeg = /(\bgets\s+)-X\/-X\b/i;
  // DOUBLED NEGATIVE X-pump (Nuclear Fallout — SHELF S7): "gets twice -X/-X" — both pips subtract 2·X.
  // Rewrites to the same "-1/-1" sentinel; xTimes:2 rides out so the caller stamps amountXTimes.
  const pumpSymNegTwice = /(\bgets\s+)twice -X\/-X\b/i;
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
