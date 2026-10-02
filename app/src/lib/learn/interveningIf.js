/**
 * interveningIf.js — a STRICT board-query evaluator for triggered-ability intervening-if conditions
 * (CR 603.4). Near-LEAF: its ONLY engine import is the layer-aware `creaturePower` reader from gameState.js
 * (for the power-qualified creature query) — a deliberately one-directional edge: gameState's transitive
 * closure (ptPrimitive / layers / staticAbilityParser / protection / keywords) never imports interveningIf,
 * so no cycle is introduced and gameEngine / resolvers / coverage can still consult this without one.
 *
 * CR 603.4 — an intervening-if is checked at BOTH the trigger event (flush, before the ability goes on the
 * stack) AND on resolution. If the condition is false at either point, the ability does nothing. So the
 * evaluator is consulted twice: gameEngine.buildTriggerStack drops the trigger when the condition is false
 * at flush; resolvers.js (EFFECT_PROGRAM) re-checks at resolution. This mirrors the win-game intervening-if
 * machinery (effects/atoms/winGame.js evaluateWinThreshold) but for the GENERAL conditional-trigger family.
 *
 * STRICT, never fail-open: `evaluate` returns true/false for a condition it can read, and `null` for one
 * outside its vocabulary. `interveningIfParseable` (the pure shape check, used by the coverage metric AND
 * the flush gate) returns true ONLY for conditions `evaluate` reads — so a trigger is credited native /
 * routed natively ONLY when its condition is genuinely modeled. Everything else stays body-only / Arbiter
 * (false-negative SAFE; a mis-evaluated condition would be a forbidden FP — CREED).
 *
 * SCOPE (v1) — the controller's-board queries, which are the largest clean cluster on the corpus:
 *   "you control a/an/<N> or more <type|subtype>"         (control an artifact, two or more Gates, …)
 *   "you control a/an/<N> or more tapped/untapped <filter>" (a tapped creature, two or more tapped creatures)
 *   "you control a/an/<N> or more token(s)"               (three or more tokens)
 *   "you control no <filter>"                             (no untapped lands, no Snakes)
 *   "you control a/an/<N> or more creature(s) with power N or {greater|more}" (Colossal Majesty, Garruk's
 *      Uprising, Beastbond Outcaster) — a LAYER-AWARE power query (counters + anthems count), evaluated
 *      against creaturePower at flush AND resolution, mirroring the `powerAtLeast` count-source vocabulary.
 *   "[there are|you have] <N> or more <type> cards in your graveyard" (three or more creature cards …)
 *   "an opponent controls more <lands|creatures|artifacts|enchantments> than you" (Knight of the White
 *      Orchid, Loyal Warhound, Ticket Tortoise, Linvala) — an existential board-count compare vs each
 *      opponent (CR 104.3a); and "an opponent has more <life|cards in hand> than you" (Linvala).
 *   "you have N or {less|fewer|more} life" (Convalescent Care "5 or less", Convalescence "10 or less") — the
 *      controller's own life vs a fixed threshold; a pure player.life compare (≤ for less/fewer, ≥ for more).
 *   "you control another <Subtype>" (Dwynen's Elite "another Elf", Ghitu Journeymage "another Wizard",
 *      Apothecary Geist "another Spirit", Resistance Squad "another Human") — a CURATED creature subtype,
 *      excluding the entering permanent (CR 113.7), keyed on ctx.triggeringPermanentId like SAME-NAME ETB.
 *   "[a creature|N or more creatures] died this turn" (Twinblade Assassins, Deathreap Ritual, Bulette, the
 *      Morbid family; Inga "three or more", Lagomos "five or more", Tallyman "seven or more") — a TURN-EVENT
 *      history read off the per-turn creature-death tally (gameState.creaturesDiedThisTurn, bumped at the death
 *      chokepoint, reset for all seats at untap). "a creature died" ≡ "1 or more died" (≥1); the cardinal form
 *      compares the all-seats death total (CR 700.4 — any player's creature dying counts) to N.
 *   "a creature died under your control this turn" (Denethor Ruling Steward, Faramir Field Commander,
 *      Essenceknit Scholar — BLITZ IF-1) — the CONTROLLER-SCOPED variant: the controller's OWN
 *      creaturesDiedThisTurn tally (keyed on the dying creature's controller) is ≥1, NOT the all-seats sum.
 *   "you('ve) gained life this turn" / "you('ve) gained N or more life this turn" (Regal Bloodlord, Courier
 *      Bat, Griffin Aerie, Angelic Accord, Indulging Patrician, Valkyrie Harbinger, The Gaffer — BLITZ LG-1)
 *      — a CONTROLLER-SCOPED turn-event read off the per-seat lifeGainedThisTurn ledger (gameState.gainLife
 *      bumps it at the single life-gain chokepoint, reset all-seats at untap). The ledger sums the turn's
 *      TOTAL gained (CR 119.3), so the bare form is ≥1 and the cardinal compares the running total to N — the
 *      exact GAIN mirror of the lifeLostThisTurn reads below.
 *   "an opponent lost life this turn" (Lion Vulture, Savage Gorger, Bloodtithe Collector, Arrogant Outlaw —
 *      BLITZ IF-1) — the ≥1 case of the OPP-LOST-LIFE lifeLostThisTurn ledger (bare form, no number word).
 *   the TRAP CONDITIONS (shelf D17 — the Zendikar Trap cycle): "an opponent cast a <color> spell / N or more spells
 *      this turn", "an opponent drew N or more cards this turn", "an opponent gained life this turn", "an opponent had
 *      N or more cards put into their graveyard from anywhere this turn" — opponent existentials over the per-seat
 *      ledgers — and the live combat: "N or more creatures are attacking", "exactly one creature is attacking", "a
 *      <color> creature [with flying] is attacking" (see THE TRAP CONDITIONS below).
 *   "you're the monarch" (Throne Warden, Garrulous Sycophant, Skyline Despot, Faramir Steward of Gondor —
 *      BLITZ IF-1) — the controller holds the monarch designation now (CR 725.1); a live state.monarchId read
 *      (the same field manaModel's Regal Behemoth mana-augment gate reads).
 *   "you have no cards in hand" (Bloodhall Priest, Hollowborn Barghest — BLITZ IF-1) — the controller's hand
 *      is empty (controllerMetric "cards in hand" === 0), reusing the opponent hand-compare's reader.
 *   "it was kicked" (CR 702.33e) — the kicker ETB-trigger condition (Goblin Ruinblaster, Torch Slinger,
 *      Heartstabber Mosquito …): a per-PERMANENT cast-decision flag read off the entering permanent's
 *      `wasKicked` (stamped by resolvers.enterPermanent on a kicked cast), keyed on ctx.triggeringPermanentId.
 *   "tribute wasn't paid" / "tribute was paid" (CR 702.96e) — the Tribute ETB-trigger condition (Pharagax
 *      Giant, Ornitharch, Nessian Demolok, Snake of the Golden Grove …): a per-PERMANENT decision flag read
 *      off the entering permanent's `tributePaid` (stamped by resolvers.enterPermanent when the opponent
 *      chose at ETB), keyed on ctx.triggeringPermanentId exactly like the kicked flag.
 * DEFERRED to the Arbiter (stay LOW): color/multicolored permanents, other power comparisons ("power N or
 * less", toughness), OTHER turn-event history (a NON-creature died, "a permanent left the battlefield this
 * turn", the compound "you gained AND lost life this turn", the 2HG "your team gained life this turn"),
 * subtype-scoped death counts ("a Zubera died"), the
 * OTHER cast-decision flags (bargain), the remaining state flags (city's blessing, initiative — no live
 * tracking) — each a future increment.
 */

import { creaturePower, creatureToughness, findPermanent } from "./gameState.js"; // layer-aware P/T readers (counters + anthems) — one-way edge, no cycle; + findPermanent (shelf D17 — attackers still on the battlefield)
// Layer-aware KEYWORD + COLOR readers for the "you control a <filter>" family (CR 613 — a granted keyword and
// an effect-changed color are real characteristics). One-way edge: layers.js imports gameState / keywords /
// staticAbilityParser / protection, none of which reach interveningIf.js, so this adds no cycle. Verified with
// `node --input-type=module -e "import './src/lib/learn/legalChoices.js'"` per the RUN-LEDGER's mandate — a
// green suite is NOT evidence the module graph still loads (vitest resolves in a different order than node).
import { permanentHasKeyword, permanentColors, permanentTypes, permanentIsCreature, permIsEveryCreatureType, permanentHasCardType } from "./layers.js"; // + permanentIsCreature (P·32 — Selvala: every OTHER creature, layer-aware) // + permIsEveryCreatureType (P·39) // + permanentHasCardType (#511 — a card type a layer-4 effect added: Liquimetal Torque's artifact)
import { CR_CREATURE_TYPES } from "./effects/creatureTypes.js"; // P·39 — every creature type answers for a creature type only (CR 205.3d); a zero-import leaf
import { cardIsEveryCreatureType } from "./everyCreatureType.js"; // P·39b — a graveyard card that is every creature type (Changeling, its owner's Maskwood Nexus) for "there is an Elf card in your graveyard"; a leaf over keywords.js
import { hasCitysBlessing } from "./ascend.js"; // shelf D5 — the city's blessing designation (ascend.js imports only gameState)

// ─── cardinal vocabulary ────────────────────────────────────────────────────────
const NUM_WORD = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, twenty: 20, thirty: 30, forty: 40, fifty: 50, // + thirteen (Blasphemous Edict, play-weighted #509)
};
function parseCount(token) {
  const t = String(token || "").trim().toLowerCase();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  if (Object.prototype.hasOwnProperty.call(NUM_WORD, t)) return NUM_WORD[t];
  return null;
}
// The cardinal alternation is DERIVED from NUM_WORD (#509), in its key order — the order the hand-written alternation had — so
// a word the regex matches always has a value: parseCount never returns null for a NUM_RE capture.
const NUM_RE = `(\\d+|${Object.keys(NUM_WORD).join("|")})`;

function typeStr(card) {
  return String(card?.type || card?.type_line || "");
}

// The CARD TYPES (CR 205.2a) delirium counts. Kindred is Tribal's current name for the SAME type, so both
// spellings map to one entry — a graveyard holding a Tribal card and a Kindred card has one type, not two.
const CARD_TYPE_WORDS = ["artifact", "battle", "creature", "enchantment", "instant", "kindred", "tribal", "land", "planeswalker", "sorcery"];
// The two printed framings of the same board question (see the reader for why they share one). Anchored
// whole-string: a PER-OBJECT variant ("IT has the greatest power…", "ENCHANTED PERMANENT is a creature
// with…") needs a referent this lane has no thread for, and an "each creature … with the greatest power"
// universal is a different claim entirely — all fall through to null → Arbiter (CREED).
const GREATEST_POWER_RE = /^you control (?:a creature with the greatest power among creatures on the battlefield|the creature with the greatest power or tied for the greatest power)$/;
// ⭐ GREATEST MANA VALUE AMONG ARTIFACTS (SHELF-85 S17, 2026-09-04 — Padeem "you control the artifact with the greatest mana
// value or tied for the greatest mana value"): the greatest-power question one column over, asked of ARTIFACTS on the
// battlefield. Mana value is read from the card (cmc when the index carries it, else the printed cost summed: generic
// digits at face value, X at 0, every other symbol — coloured, hybrid, phyrexian, snow — at 1, a numbered hybrid
// {2/W} at its number, CR 202.3), so a Treasure token (no cost) reads 0 and can still tie on an all-token board.
const GREATEST_ARTIFACT_MV_RE = /^you control the artifact with the greatest mana value or tied for the greatest mana value$/;
function manaValueOfCardLocal(card) {
  if (typeof card?.cmc === "number" && Number.isFinite(card.cmc)) return card.cmc;
  const cost = String(card?.mana ?? card?.mana_cost ?? "");
  let total = 0;
  for (const sym of cost.match(/\{[^}]+\}/g) || []) {
    const inner = sym.slice(1, -1);
    if (/^\d+$/.test(inner)) total += Number(inner);
    else if (/^x$/i.test(inner)) total += 0;
    else if (/^(\d+)\/[wubrg]$/i.test(inner)) total += Number(inner.split("/")[0]);
    else total += 1;
  }
  return total;
}
/** Distinct card types among the controller's graveyard. Reads only the type line's HEAD (before the em
 *  dash) so a subtype ("— Equipment") can never be miscounted as a card type. */
function cardTypesInGraveyard(state, controllerId) {
  const seen = new Set();
  for (const card of state.players?.[controllerId]?.graveyard || []) {
    const head = typeStr(card).split("—")[0].toLowerCase();
    for (const t of CARD_TYPE_WORDS) {
      if (new RegExp(`\\b${t}\\b`).test(head)) seen.add(t === "tribal" ? "kindred" : t);
    }
  }
  return seen.size;
}

// Does a permanent match a parsed FILTER ({ kind, word, state, powerAtLeast })? `state` (the game state) is
// threaded only for the layer-aware power read; it's unused by the type/token/tapped gates.
function permMatchesFilter(perm, filter, state) {
  if (!perm) return false;
  // tapped/untapped state gate
  if (filter.state === "tapped" && !perm.tapped) return false;
  if (filter.state === "untapped" && perm.tapped) return false;
  // POWER gate (layer-aware: counters + anthems count, read at flush AND resolution like the powerAtLeast
  // count-source). Only stamped on a creature filter (parseFilter requires kind:"type" word:"Creature").
  if (filter.powerAtLeast != null && !(creaturePower(perm, state) >= filter.powerAtLeast)) return false;
  // KEYWORD gate — "creature with flying" (CR 702). LAYER-AWARE via permanentHasKeyword, so a granted or
  // counter-conferred keyword counts, which is the only honest read for a condition checked live.
  if (filter.keyword && !permanentHasKeyword(state, perm.id, filter.keyword)) return false;
  // COLOR gate — "a blue permanent" (CR 105.2). LAYER-AWARE via permanentColors (layer 5), so a permanent
  // turned blue by an effect IS a blue permanent. FAIL-CLOSED on unresolvable colors: undercounting parks the
  // card, overcounting would fire an ability whose condition is false (a forbidden FP).
  if (filter.color) {
    // permanentColors returns an ARRAY (deriveCharacteristics spreads its Set before returning), so read it as
    // one — an absent/empty result fails closed.
    const colors = permanentColors(state, perm.id);
    if (!Array.isArray(colors) || !colors.includes(filter.color)) return false;
  }
  if (filter.colorNeg) {
    // CR 105.2 — "nonblue" means NOT blue, which a colourless permanent satisfies. Fail-closed on an
    // unresolvable read: if the colours cannot be enumerated we must not claim the permanent lacks one.
    const colors = permanentColors(state, perm.id);
    if (!Array.isArray(colors) || colors.includes(filter.colorNeg)) return false;
  }
  if (filter.notWords) {
    // A type/supertype/subtype EXCLUSION — the permanent must carry NONE of these words on its front face
    // (CR 712.4a), mirroring the positive scan directly below.
    const face = typeStr(perm.card).split(" // ")[0];
    // P·39 — every creature type (a changeling, Mirror Entity's activation, an animated Mutavault) carries every CREATURE-type
    // word too, so it is never "non-Human" (CR 205.3d keeps it to creature types — "nonland" is untouched).
    // #511 — and a card type a layer-4 effect added is carried too: a creature Liquimetal Torque made an artifact is not a
    // "nonartifact creature" (CR 613.1d). layers.permanentHasCardType reads the derive's types (card types and supertypes), so
    // a subtype word answers no there.
    if (filter.notWords.some((w) => new RegExp(`\\b${w}\\b`, "i").test(face)
      || (CR_CREATURE_TYPES.has(String(w).toLowerCase()) && permIsEveryCreatureType(state, perm.id))
      || permanentHasCardType(state, perm.id, w))) return false;
  }
  if (filter.colorless) {
    // CR 105.2c — colourless is having NO colours at all, so an unresolvable read fails closed the OTHER way
    // from the colour gate: if we cannot enumerate colours we must not claim the permanent is colourless.
    const colors = permanentColors(state, perm.id);
    if (!Array.isArray(colors) || colors.length > 0) return false;
  }
  if (filter.kind === "all") return true;                  // "permanent(s)"
  if (filter.kind === "token") return !!(perm.token || perm.card?.token);
  // TYPE UNION vs TYPE CONJUNCTION, and the difference is load-bearing. `word` may be an array:
  //   • a UNION ("artifact or enchantment") matches a permanent carrying ANY listed word — `.some()`;
  //   • a CONJUNCTION ("snow land" → ["Land","Snow"], flagged allWords) needs EVERY word — `.every()`.
  // Using `.some()` for the conjunction would make "you control four or more snow permanents" count ordinary
  // lands, i.e. fire an ability whose condition is false. A single word keeps its exact prior behaviour
  // (a one-element array reduces to the same single test under either quantifier).
  const words = Array.isArray(filter.word) ? filter.word : [filter.word];
  // type/subtype containment: whole-word, Title-cased singular ("creatures" → \bCreature\b). A SUBTYPE a continuous effect
  // granted counts too (CR 613.1d, 205.1b — Urborg's Swamp, Dryad of the Ilysian Grove's every basic land type), read off the
  // layer engine: a Dryad player with only Forests does control an Island, so "When you control no Islands, sacrifice this
  // creature" must not fire. The printed line still answers everything it always did.
  // A CARD TYPE a continuous effect added counts the same way (#511, CR 613.1d): a creature Liquimetal Torque or Stone by Sunlight
  // made an artifact is an artifact, so "you control an artifact" holds and "you control no artifacts" does not.
  const hit = (w) => new RegExp(`\\b${w}\\b`, "i").test(typeStr(perm.card))
    || permanentTypes(state, perm.id).subtypes.includes(w)
    || (CR_CREATURE_TYPES.has(String(w).toLowerCase()) && permIsEveryCreatureType(state, perm.id)) // P·39 — "you control a Goblin": every creature type
    || permanentHasCardType(state, perm.id, w);
  return filter.allWords ? words.every(hit) : words.some(hit);
}

// Words that read as a "you control a <word>" filter but are NOT card types/subtypes — a DESIGNATION or
// characteristic the type line never carries, so a naive \bWord\b type-line scan would silently count 0
// and mis-evaluate the condition (a forbidden FP — e.g. "you control a commander" is your commander, not a
// "Commander"-typed permanent). Reject these → the condition stays unparseable → Arbiter (false-negative SAFE).
const NON_TYPE_WORDS = new Set(["commander", "monarch", "creature's", "spell", "card", "blessing"]);

// KEYWORDS admissible in a "you control a <noun> with <keyword>" filter. A CURATED set on purpose: an
// unrecognised word must fall through to null (→ Arbiter) rather than become a keyword nobody grants, which
// would evaluate the condition FALSE forever while the shape gate still reported "readable" — the same trap
// the Plains-singularization note below documents, and a forbidden FP under the CREED.
const FILTER_KEYWORDS = new Set([
  "flying", "reach", "trample", "vigilance", "haste", "menace", "defender", "flash",
  "deathtouch", "lifelink", "first", "double", "hexproof", "indestructible", "shroud",
  "fear", "intimidate", "shadow", "horsemanship", "changeling", "infect", "wither", "banding",
]);
const COLOR_LETTER = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
// Words admissible on the NEGATED side of a filter ("nonland permanent", "nonartifact creature"). Card types
// plus the two supertypes that are printed in the type line and therefore word-scannable. A curated set on
// purpose: an unrecognised negated word would exclude NOTHING, i.e. quietly widen the filter to everything —
// the dangerous direction, and the mirror of the positive case where an unknown word matches nothing.
const NEGATABLE_TYPE_WORDS = new Set(["artifact", "creature", "enchantment", "land", "planeswalker", "token", "basic", "legendary", "snow"]);

// PLANESWALKER SUBTYPES (CR 205.3j) — "you control a Teferi planeswalker" (the Superfriends payoffs; 7 corpus
// carriers across Ajani / Chandra / Gideon / Liliana / Teferi / Vraska / Yanggu).
//
// ⭐ DERIVED FROM THE BUNDLE BY SCRIPT, NOT WRITTEN FROM MEMORY — every entry is a word that appears after
// "Planeswalker —" on a real card's type line in the shipped Scryfall snapshot. That matters twice: card
// characteristics never come from recall in this codebase, and an invented name here would be a filter that
// matches nothing and therefore reads FALSE forever while the shape gate says "readable".
//
// The filter is a CONJUNCTION (the name AND "Planeswalker" must both appear on the type line), so an entry
// that is merely unusual cannot create a false match — it can only fail to match, which is the safe direction.
const PLANESWALKER_SUBTYPES = new Set([
  "abian", "ajani", "aminatou", "angrath", "arlinn", "ashiok", "bahamut", "basri", "bolas", "calix", "chandra",
  "comet", "dack", "dakkon", "daretti", "davriel", "deb", "dellian", "dihada", "domri", "dovin", "duck",
  "dungeon", "ellywick", "elminster", "elspeth", "equipment", "ersta", "estrid", "freyalise", "garruk",
  "gideon", "grist", "guff", "huatli", "inzerva", "jace", "jared", "jaya", "jeska", "kaito", "karn", "kasmina",
  "kaya", "kiora", "koth", "liliana", "lolth", "lukka", "luxior", "master", "minsc", "monopoly", "mordenkainen",
  "nahiri", "narset", "niko", "nissa", "nixilis", "oko", "quintorius", "ral", "rowan", "saheeli", "samut",
  "sarkhan", "serra", "sivitri", "sorin", "svega", "szat", "tamiyo", "tasha", "teferi", "teyo", "tezzeret",
  "tibalt", "tyvar", "ugin", "urza", "venser", "vivien", "vraska", "vronos", "wanderer", "will", "windgrace",
  "wrenn", "xenagos", "yanggu", "yanling", "you", "zariel",
]);

// Parse a filter phrase ("artifacts", "tapped creatures", "tokens", "permanents", "untapped lands",
// "Gates") into { kind, word, state } — or null if it isn't a clean single-word type/subtype filter.
function parseFilter(phrase) {
  let p = String(phrase || "").trim().toLowerCase();
  let state = null;
  const sm = p.match(/^(tapped|untapped)\s+(.+)$/);
  if (sm) { state = sm[1]; p = sm[2].trim(); }
  // POWER-QUALIFIED CREATURE — "creature(s) with power N or {greater|more}" (Colossal Majesty et al). Mirrors
  // the `powerAtLeast` count-source vocabulary EXACTLY: only "creature(s)", only the "N or greater/more" form
  // (a "power N or less" / "toughness …" qualifier fails the anchor → null → Arbiter, CREED). The power is
  // read LAYER-AWARE at evaluation (permMatchesFilter → creaturePower). Combinable with a tapped/untapped state.
  const pm = p.match(/^creatures? with power (\d+) or (?:greater|more)$/);
  if (pm) return { kind: "type", word: "Creature", state, powerAtLeast: parseInt(pm[1], 10) };
  // ⭐ NEGATION (2026-07-30) — "non-Human creature", "nonland permanent", "nonartifact creature", "nonblue
  // creature". THE SAME AXIS ONE MORE TIME: the shared TARGET grammar (parseCreatureTargetRestrictions) has
  // carried `typeNeg`, `colorNeg` and a negated `subtype` for a while, and this CONDITION grammar had none of
  // them — so the same printed filter was readable when a spell targeted with it and unreadable when a trigger
  // asked about it.
  //
  // Colour negation rides `colorNeg`; a type/subtype negation rides `notWords`, which permMatchesFilter
  // requires the permanent to carry NONE of. The remaining noun goes through parseFilter normally, so
  // "non-Human creature" is {Creature} minus {Human} and "nonland permanent" is {all} minus {Land}.
  //
  // ⛔ The negated word must be a colour, a card type, or a curated creature subtype — otherwise it would
  // become a type-line scan that matches nothing, which reads as "everything qualifies" on the NEGATED side
  // (the dangerous direction here, unlike the positive case where it reads as "nothing qualifies").
  const negM = p.match(/^non-?([a-z]+) (.+)$/);
  if (negM) {
    const word = negM[1];
    const inner = parseFilter(negM[2]);
    if (!inner || inner.notWords || inner.colorNeg) return null;
    if (COLOR_LETTER[word]) return { ...inner, state: inner.state ?? state, colorNeg: COLOR_LETTER[word] };
    if (NEGATABLE_TYPE_WORDS.has(word) || CONTROL_SUBTYPE_ALLOW.has(word)) {
      return { ...inner, state: inner.state ?? state, notWords: [word.charAt(0).toUpperCase() + word.slice(1)] };
    }
    return null;
  }
  // ⭐ TYPE CONJUNCTION — "artifact creature" (CR 205.2b, a permanent with BOTH card types). Distinct from the
  // " or " union arm below: this one needs EVERY word, so it sets allWords. Both sides must be clean
  // single-word CARD TYPES — a subtype pairing ("Goblin creature") is the positive-subtype path, not this.
  const conjM = p.match(/^(artifact|enchantment|land|creature|planeswalker) (artifact|enchantment|land|creature|planeswalker)s?$/);
  if (conjM && conjM[1] !== conjM[2]) {
    const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
    return { kind: "type", word: [cap(conjM[1]), cap(conjM[2])], state, allWords: true };
  }
  // ⭐ THE VOCABULARY WIDENINGS BELOW ARE ONE AXIS FIX, and each one reaches ALL THREE LANES at once —
  // interveningIfParseable (triggers), spellConditionParseable (spells) and activationConditionParseable
  // (activated abilities) are three probes over this ONE grammar, exactly as conditionVocabularyReaders.test.js
  // states. A census of the parked corpus put 45 cards on "you control <filter>" phrases this parser could not
  // read, while permMatchesFilter's own gates (tapped state, layer-aware power) showed the machinery was there.
  // Each arm is whole-anchored: anything it cannot read falls through to null → Arbiter (false-negative SAFE).
  //
  // KEYWORD-QUALIFIED filter — "creature with flying" / "creature with a mana value" no. Only a KEYWORD, and
  // only the curated combat/evasion set, so a mis-read word can never silently count 0 (which would evaluate
  // the condition FALSE forever while the shape gate still said "readable" — the Plains-singularization trap
  // documented below, and a forbidden FP). Read LAYER-AWARE at evaluation.
  // The base noun is routed back through parseFilter rather than hand-built, so NON_TYPE_WORDS still applies
  // ("a spell with flying" must NOT become a "Spell"-typed filter) and "permanent" still means kind:"all".
  const km = p.match(/^(.+?) with ([a-z]+)$/);
  if (km && FILTER_KEYWORDS.has(km[2])) {
    const inner = parseFilter(km[1]);
    return inner && !inner.keyword ? { ...inner, state: inner.state ?? state, keyword: km[2] } : null;
  }
  // COLOR-QUALIFIED filter — "a blue permanent" (Ephara's Enlightenment class), "a white creature". The colour
  // word is stripped and rides as `color`; the remaining noun goes through the normal type path below, so
  // "blue permanent" → {kind:"all", color:"U"} and "white creature" → {kind:"type", word:"Creature"}.
  const colM = p.match(/^(white|blue|black|red|green) (.+)$/);
  if (colM) {
    const inner = parseFilter(colM[2]);
    return inner ? { ...inner, state: inner.state ?? state, color: COLOR_LETTER[colM[1]] } : null;
  }
  // COLORLESS is the ABSENCE of colour (CR 105.2c), not a sixth colour — so it needs its own predicate
  // (`colors` empty) rather than a letter membership test. Kept beside the colour arm because the phrasing is
  // parallel and mis-filing it as a colour would make every colourless permanent fail to match.
  const clM = p.match(/^colorless (.+)$/);
  if (clM) {
    const inner = parseFilter(clM[1]);
    return inner ? { ...inner, state: inner.state ?? state, colorless: true } : null;
  }
  // TYPE UNION — "artifact or enchantment" (Sanctum Weaver / Hall of Heliod's Generosity class). BOTH sides
  // must be clean single-word TYPE filters with no state/rider of their own, so the union is exactly the two
  // type-line words and nothing is silently dropped. A union involving "permanent"/"token" (whose match isn't
  // a type-line word) or any qualified side → null → Arbiter. "<A> and/or <B>" is the same union (shelf D31 — The
  // Indomitable's "three or more tapped Pirates and/or Vehicles": a permanent that is either, or both, counts once).
  const um = p.match(/^([a-z]+) (?:or|and\/or) (?:an? )?([a-z]+)$/);
  if (um) {
    const a = parseFilter(um[1]), b = parseFilter(um[2]);
    if (a && b && a.kind === "type" && b.kind === "type" && !a.state && !b.state && !a.powerAtLeast && !b.powerAtLeast
        && !a.keyword && !b.keyword && !a.color && !b.color) {
      return { kind: "type", word: [a.word, b.word], state };
    }
    return null;
  }
  // SNOW supertype (CR 205.4h) — "snow permanents" / "snow lands". "Snow" IS printed in the type line's
  // supertype slot, so it reads through the same word-anchored path as a card type; it just isn't a word the
  // singular/Title-case path would reach on its own because it always PREFIXES another type word.
  // PLANESWALKER SUBTYPE (CR 205.3j) — "a Teferi planeswalker". Structurally the SAME conjunction the snow
  // arm below builds: the type line must carry BOTH the name and "Planeswalker", so `allWords` is set and the
  // quantifier is `.every()`. Using a union here would make "a Teferi planeswalker" true for ANY planeswalker.
  const pwM = p.match(/^([a-z]+) planeswalkers?$/);
  if (pwM && PLANESWALKER_SUBTYPES.has(pwM[1])) {
    const name = pwM[1].charAt(0).toUpperCase() + pwM[1].slice(1);
    return { kind: "type", word: [name, "Planeswalker"], state, allWords: true };
  }
  const snowM = p.match(/^snow (.+)$/);
  if (snowM) {
    const inner = parseFilter(snowM[1]);
    if (!inner) return null;
    const words = inner.kind === "all" ? ["Snow"] : [...(Array.isArray(inner.word) ? inner.word : [inner.word]), "Snow"];
    return { kind: "type", word: words, state: inner.state ?? state, allWords: true };
  }
  // LEGENDARY / BASIC supertypes (CR 205.4a) — "a legendary creature" (Rivendell / Mines of Moria / Minas
  // Tirith: "enters tapped unless you control a legendary creature", 6 corpus lands) and "two or more basic
  // lands" (Sodden Verdure's cycle, 10 lands). Structurally the SNOW arm one more time: both words are
  // printed in the type line ("Legendary Creature — …", "Basic Land — …"), so the conjunction is a two-word
  // `allWords` scan — and it MUST be a conjunction, because a union would make "a legendary creature" true
  // for any creature at all. Nested supertypes ("legendary snow …") fall through the inner parseFilter.
  const superM = p.match(/^(legendary|basic) (.+)$/);
  if (superM) {
    const inner = parseFilter(superM[2]);
    if (!inner) return null;
    const sup = superM[1] === "legendary" ? "Legendary" : "Basic";
    const words = inner.kind === "all" ? [sup] : [...(Array.isArray(inner.word) ? inner.word : [inner.word]), sup];
    return { kind: "type", word: words, state: inner.state ?? state, allWords: true };
  }
  // must be a single word now (no riders like "you control", "named ...", or an unmodeled power/toughness rider)
  if (!/^[a-z]+$/.test(p)) return null;
  // INVARIANT BASIC-LAND TYPES (CR 205.3i): "Plains" is spelled the same singular and plural — a naive
  // trailing-s strip yields "Plain", whose \bPlain\b type-line scan matches NOTHING, so an intervening-if
  // like "you control two or more Plains" would evaluate FALSE forever while interveningIfParseable still
  // returns true → a native-classified trigger that can never fire (Gwyllion / Duergar Hedge-Mage). Keep the
  // basic land types verbatim. (Island/Swamp/Mountain/Forest singularize correctly, but pinning all five is
  // the clearest guard.)
  const BASIC_LAND_TYPES = { plains:"Plains", island:"Island", swamp:"Swamp", mountain:"Mountain", forest:"Forest", wastes:"Wastes" };
  if (BASIC_LAND_TYPES[p]) return { kind: "type", word: BASIC_LAND_TYPES[p], state };
  const singular = p.replace(/s$/, "");
  if (NON_TYPE_WORDS.has(singular) || NON_TYPE_WORDS.has(p)) return null; // a designation, not a type → Arbiter
  if (singular === "permanent") return { kind: "all", state };
  if (singular === "token") return { kind: "token", state };
  const word = singular.charAt(0).toUpperCase() + singular.slice(1); // type lines are Title-Cased
  return { kind: "type", word, state };
}

function controllerBoard(state, controllerId) {
  return state?.players?.[controllerId]?.battlefield || [];
}

// DEATHS-THIS-TURN (CR 700.4) — total creatures that died this turn across ALL seats (the sum of every
// player's per-turn creaturesDiedThisTurn tally). "a creature died this turn" / "N or more creatures died this
// turn" are unscoped, so any player's creature dying counts. A seat with no tally → 0.
function deathsThisTurnTotal(state) {
  return Object.values(state?.players || {}).reduce((sum, pl) => sum + (pl?.creaturesDiedThisTurn || 0), 0);
}

// Opponent ids = every seat that ISN'T the controller. Computed inline from the live player map (NOT via
// gameState.opponentsOf, which assertPlayer-throws on the synthetic probe id used by interveningIfParseable).
// Stable order (Object.keys); used only for "an opponent <comparison> than you" (an existential over opponents),
// so order doesn't affect the result. A 1-seat probe board yields no opponents → the comparison is vacuously
// false there, which is exactly what interveningIfParseable wants (a parseable shape returns a boolean, not null).
function opponentIds(state, controllerId) {
  return Object.keys(state?.players || {}).filter((id) => id !== controllerId);
}

// ===== OPPONENT-COMPARISON (CR 603.4 board query — the "behind on a resource" ramp/payoff family) =========
// "an opponent <controls more X | has more Y> than you" — TRUE iff AT LEAST ONE opponent's tally strictly
// exceeds the controller's (CR 104.3a — each opponent is compared independently; "an opponent" = the existential).
// METRIC kinds (each a count the live state exposes directly, never fabricated):
//   controls more <permanent-type>  → battlefield permanents of that card type (lands/creatures/artifacts/
//                                      enchantments), a word-anchored type-line read (reuses parseFilter).
//   has more life                   → player.life
//   has more cards in hand          → player.hand.length
// Strictly LAYER-IRRELEVANT (a pure count/total compare), so it's read identically at flush AND resolution.
const OPP_CONTROLS_MORE_RE = /^an opponent controls more (lands|creatures|artifacts|enchantments) than you$/;
const OPP_HAS_MORE_RE = /^an opponent has more (life|cards in hand) than you$/;

// ===== OPPONENT CONTROLS N-OR-MORE (CR 603.4 board query — the "opponent has a board" payoff family) =======
// "an opponent controls a/an/<N> or more <filter>" (Defense of the Heart "three or more creatures") — TRUE iff
// AT LEAST ONE opponent controls ≥N permanents matching the filter (CR 104.3a — each opponent counted
// independently; "an opponent" = the existential over opponents). Distinct from OPP_CONTROLS_MORE (a compare
// vs the controller's own count): this is an ABSOLUTE per-opponent threshold. The filter reuses parseFilter /
// permMatchesFilter (so type/subtype/token/tapped-state all work, layer-irrelevant board counts read
// identically at flush AND resolution). A single opponent's board of ≥N matches satisfies it; a malformed
// filter → parseFilter null → the whole condition is unparseable → Arbiter (false-negative SAFE, CREED).
const OPP_CONTROLS_N_RE = new RegExp(`^an opponent controls ${NUM_RE}(?: or more)? (.+)$`);

// ===== CONTROLLER LIFE THRESHOLD (CR 603.4 board query — the "low-on-life payoff" family) ==================
// "you have N or {less|fewer|more} life" — a pure player.life numeric compare for the CONTROLLER (NOT an
// opponent existential like OPP_HAS_MORE). "N or less"/"N or fewer" → life ≤ N (Convalescent Care "5 or less",
// Convalescence "10 or less"); "N or more" → life ≥ N. Life is a single integer the live state exposes
// directly (player.life), strictly LAYER-IRRELEVANT, so it reads identically at flush AND resolution like
// every other board-count condition. CREED: a deterministic numeric compare, never fail-open — a malformed
// or out-of-vocabulary life phrase falls through to the final `return null` → Arbiter (false-negative SAFE).
const CTRL_LIFE_THRESHOLD_RE = /^you have (\d+) or (less|fewer|more) life$/;
// ⭐ THE SAME THRESHOLD SHAPE, CROSSED WITH THE OTHER TWO METRICS controllerMetric ALREADY READS (2026-07-30).
// "you have no cards in hand" was modeled and "you have N or less life" was modeled, but the HAND count had
// only its zero case and the LIBRARY count had nothing — while `controllerMetric` has read `player.hand.length`
// since the opponent hand-compare shipped. Both are single integers off live state, layer-irrelevant, so they
// read identically at flush and at resolution like every sibling here.
// "a card in hand" is the ≥1 form (NUM_RE already maps "a" → 1). An EXACT life total gets its own anchor
// because "exactly N" is not expressible as a one-sided threshold.
const CTRL_HAND_THRESHOLD_RE = new RegExp(`^you have ${NUM_RE}(?: or (less|fewer|more))? cards? in hand$`);
const CTRL_LIBRARY_THRESHOLD_RE = new RegExp(`^you have ${NUM_RE} or (less|fewer|more) cards in your library$`);
const CTRL_LIFE_EXACT_RE = /^you have exactly (\d+) life$/;

export function controllerMetric(state, controllerId, kind) { // exported 2026-09-05 — TITHE's targeted-opponent compare (library.js) reads the same tally
  const player = state?.players?.[controllerId];
  if (!player) return 0;
  if (kind === "life") return player.life || 0;
  if (kind === "cards in hand") return (player.hand || []).length;
  // a permanent-type count — word-anchored type-line match (singular Title-case), mirroring parseFilter; a type a layer-4
  // effect added counts too (#511 — both sides of "an opponent controls more artifacts than you" see a Torqued creature)
  const word = kind.replace(/s$/, "");
  const re = new RegExp(`\\b${word.charAt(0).toUpperCase() + word.slice(1)}\\b`, "i");
  return (player.battlefield || []).filter((p) => re.test(typeStr(p.card)) || permanentHasCardType(state, p.id, word)).length;
}

// ===== CONTROL-ANOTHER-SUBTYPE (CR 603.4 + 113.7 — "another" excludes the trigger source) =================
// "you control another <Subtype>" (Dwynen's Elite "another Elf", Ghitu Journeymage "another Wizard", Apothecary
// Geist "another Spirit", Resistance Squad "another Human") — TRUE iff the controller controls a creature of that
// subtype OTHER THAN the entering permanent (the trigger's triggeringPermanent, threaded as ctx.triggeringPermanentId
// exactly like SAME-NAME ETB). The subtype must be in the CURATED creature-subtype allowlist (a proper noun that
// appears verbatim ONLY in the subtype portion of a type line — no left-of-dash collision — so a `\b<sub>\b`
// type-line containment selects exactly the subtyped creatures, CR 205.3m). A non-curated word ("Outlaw" is a
// DESIGNATION, not a creature type; a color; a card type) is NOT in the set → null → Arbiter (CREED: never a
// mis-scoped / fabricated tribal gate). Mirrors the curated MASS_CREATURE_SUBTYPES allowlist discipline.
const CTRL_ANOTHER_SUBTYPE_RE = /^you control another ([a-z]+)$/;
const CONTROL_SUBTYPE_ALLOW = new Set([
  "elf", "wizard", "spirit", "human", "goblin", "dragon", "zombie", "vampire", "merfolk", "warrior",
  "knight", "soldier", "cleric", "angel", "demon", "sliver", "dinosaur", "bird", "snake", "cat",
]);

// ===== KICKED ETB (CR 702.33e + 603.4) =======================================================
// "it was kicked" — the intervening-if on a kicker creature's ETB trigger ("When this creature enters, if it
// was kicked, <effect>" — Goblin Ruinblaster, Torch Slinger, Heartstabber Mosquito …). A per-PERMANENT
// cast-decision flag, NOT a board query: it reads whether the ENTERING permanent was cast for its kicker cost.
// enterPermanent stamps `perm.wasKicked = true` when the cast paid the kicker (resolvers.js, threaded from the
// kicked cast); a normal cast leaves it unset. Keyed on ctx.triggeringPermanentId exactly like SAME-NAME ETB,
// so it reads the SAME entering permanent at BOTH the flush check (the permanent is already on the battlefield
// when ETB triggers flush) AND the resolution re-check (CR 603.4 second check). A non-kicked entry → false
// (the trigger is dropped / does nothing); a missing entering permanent → null (can't confirm → FN-safe, never
// fail-open). This closes the kicker entry in the DEFERRED list (cast-decision flags) for the ETB-trigger shape.
const KICKED_ETB_RE = /^it was kicked$/;
// "{R}{R} was spent to cast it" (lowercased by the evaluator) — the self-ETB spent-pips shape (shelf D4).
const SPENT_PIPS_ETB_RE = /^((?:\{[wubrg]\})+) was spent to cast it$/;

// ===== X-VALUE THRESHOLD (CR 608.2h — the {X} locked at resolution) ===========================
// "x is N or more" / "x is N or greater" — the intervening-if on a Ravenous creature's synthesized ETB
// draw trigger ("Ravenous (… If X is 5 or more, draw a card when it enters.)"). X is the value paid for the
// {X} cost, locked as the permanent resolves (CR 608.2h) and threaded into the entering permanent's OWN
// ETB-trigger context as ctx.xValue (checkEnterTriggers stamps enteredPerm.xValue → the self-ETB context).
// It's a fixed number for the life of the trigger, so it reads IDENTICALLY at the flush check AND the
// resolution re-check (CR 603.4). A missing xValue (a non-X entry, or the amount unthreaded) → null (can't
// confirm → FN-safe, never fail-open); a present xValue compares numerically. "or more"/"or greater" only —
// the ONLY threshold direction Ravenous prints (X≥5).
const X_THRESHOLD_RE = /^x is (\d+) or (?:more|greater)$/;

// ===== TRIBUTE ETB (CR 702.96e + 603.4) ======================================================
// "tribute wasn't paid" / "tribute was paid" — the intervening-if on a Tribute creature's ETB trigger
// ("When this creature enters, if tribute wasn't paid, <effect>" — Pharagax Giant, Ornitharch, Nessian
// Demolok, Snake of the Golden Grove …). Like the kicked flag, this is a per-PERMANENT decision flag, NOT a
// board query: it reads whether the OPPONENT chose to pay tribute (put N +1/+1 counters on the entering
// creature) AS it entered. resolvers.enterPermanent stamps `perm.tributePaid` (true = an opponent paid →
// the counters were added; false = every opponent declined → the "if tribute wasn't paid" effect runs)
// EXACTLY when the card carries Tribute (parseTribute); a non-tribute permanent leaves it undefined. Keyed
// on the entering permanent (ctx.triggeringPermanentId) like KICKED_ETB, so it reads identically at the flush
// check (the permanent is on the battlefield when ETB triggers flush) AND the resolution re-check (CR 603.4
// second check). The flag is a definite boolean once tribute resolves, so "wasn't paid" → !tributePaid and
// "was paid" → tributePaid; a missing entering permanent or an unstamped flag → null (can't confirm → the
// trigger stays unrouted / on the Arbiter — FN-safe, never fail-open). Straight + curly apostrophe tolerated.
const TRIBUTE_NOT_PAID_RE = /^tribute wasn['’]t paid$/;
const TRIBUTE_PAID_RE = /^tribute was paid$/;

// ===== NOT-A-TOKEN (CR 111.7 + 603.4) ========================================================
// "it's not a token" / "it isn't a token" — the intervening-if on a self-dies trigger whose payoff copies
// the dying creature ("When this creature dies, if it's not a token, create a token that's a copy of it…" —
// Vaultborn Tyrant, Ochre Jelly). "it" (CR 608.2c) is the object the ability triggered on — for a self-scope
// dies trigger that's the DEAD source itself. A per-PERMANENT token-status read, NOT a board query: the
// dead source's token-ness is threaded through the trigger context as ctx.triggeringCardIsToken (makePending-
// Trigger stamps !!triggeringPermanent.card.token, and checkDiesTriggers sets triggeringPermanent === the
// dead look-back for the self path). Read identically at flush (the death look-back is fixed once the SBA
// ran) AND resolution (CR 603.4 second check — the source is gone, so its captured token-ness can't change).
// This is the non-recurse guard the printed card carries: a TOKEN Vaultborn copy dying reads
// triggeringCardIsToken=true → "it's not a token" is false → no further copy (mirrors Miirym's nontoken
// gate). A missing/undefined flag → null (can't confirm → FN-safe, never fail-open). Straight + curly
// apostrophe tolerated. Anchored EXACTLY to the token-status shape (a color/type "it's not a <X>" variant
// falls through → Arbiter, CREED — never a mis-read designation).
const NOT_A_TOKEN_RE = /^it(?:'s| is)? ?not a token$|^it isn['’]t a token$/;

// ===== WAS-A-CREATURE (CR 603.4 + 603.6e last-known-info) ====================================
// "it was a creature" — the intervening-if on the "Enduring"/Glimmer self-dies-return trigger ("When this
// creature dies, if it was a creature, return it to the battlefield … It's an enchantment." — Enduring
// Curiosity, Tenacity, Vitality, Innocence, Courage). "it" (CR 608.2c) is the object the ability triggered
// on — the DEAD source itself. A per-PERMANENT last-known-info read, NOT a board query: the dying object may
// already be in a graveyard by resolution, so its captured creature-ness (fixed at the death look-back, CR
// 603.6e) is the only faithful read. Threaded through the trigger context as ctx.triggeringWasCreature
// (checkDiesTriggers stamps it from the death look-back's card type line). Read identically at flush (the
// look-back is fixed once the SBA ran) AND resolution (CR 603.4 second check — the source is gone, its
// captured type can't change). An Enchantment Creature dying reads true → the return runs; a permanent that
// had lost its creature type before dying reads false → the trigger does nothing (CR 603.4 drop). A
// missing/undefined flag → null (can't confirm → FN-safe, never fail-open). Anchored EXACTLY (a "was a <X>"
// type/color variant falls through → Arbiter, CREED — never a mis-read designation).
const WAS_A_CREATURE_RE = /^it was a creature$/;

// ===== HAD-NO-+1/+1-COUNTERS (KW-UNDYING, CR 702.92a + 603.6e) ===============================
// "it had no +1/+1 counters on it" — the intervening-if on the synthesized UNDYING dies-return trigger.
// "it" (CR 608.2c) is the dead source itself; "had" is a per-PERMANENT last-known-info read (the object is
// in a graveyard by now, counters don't travel to it), so the faithful value is the death look-back's
// counters snapshot, threaded as ctx.triggeringHadNoPlusCounters (checkDiesTriggers stamps it from
// d.counters). Identical at flush AND resolution (CR 603.4 second check — the snapshot is fixed). This is
// what terminates the undying loop: the returned body carries a +1/+1 counter, so its NEXT death reads
// false → no second return. A missing/undefined flag → null (can't confirm → FN-safe drop, never a
// fail-open return — fail-open would loop a countered body forever). Anchored EXACTLY; a "-1/-1"/named-
// counter variant (persist et al) falls through → Arbiter (CREED).
const HAD_NO_PLUS_COUNTERS_RE = /^it had no \+1\/\+1 counters on it$/;
// KW-PERSIST (BLITZ PS-1, CR 702.79a) — undying's minus-twin: the LKI counter-lessness read off
// ctx.triggeringHadNoMinusCounters (stamped by checkDiesTriggers from the death look-back).
const HAD_NO_MINUS_COUNTERS_RE = /^it had no -1\/-1 counters on it$/;
// HAD-ANY-COUNTERS (The Ozolith, W2 — CR 603.6e) — the ANY-KIND positive of the undying pair: "it had
// counters on it" reads the LEAVE look-back's counter snapshot (ctx.triggeringHadCounters, stamped by
// checkLeavesTriggers off pendingLeaveEvents' counters field). Same LKI discipline: the value is frozen
// history, identical at flush AND resolution. Missing → null (FN-safe drop).
const HAD_ANY_COUNTERS_RE = /^it had counters on it$/;

// ===== POWER-DIFFERED-FROM-BASE (Jason Bright — CR 603.4 + 603.6e) ===========================
// "its power was different from its base power" — the intervening-if on Jason Bright's tribal dies trigger
// ("Whenever a Zombie or Mutant you control dies, if its power was different from its base power, draw a
// card."). "its" (CR 608.2c) is the dead triggering creature; both values are LAST-KNOWN-INFO reads fixed
// at the death look-back (effective power = counters/anthems/pumps included; base power = printed or a
// layer-7b set value, CR 613.4a) and threaded as ctx.triggeringPowerDifferedFromBase (checkDiesTriggers
// stamps it from d.power vs d.basePower). Identical at flush AND resolution. A missing/undefined flag →
// null (can't confirm → FN-safe, never a fail-open draw). Anchored EXACTLY (a toughness/"greater than"
// variant falls through → Arbiter, CREED).
const POWER_DIFFERED_RE = /^its power was different from its base power$/;

// ===== IN-YOUR-GRAVEYARD (Infesting Radroach — CR 603.3d zone statement) ====================
// "this creature is in your graveyard" — the intervening-if on a GRAVEYARD-FUNCTIONING trigger ("Whenever
// an opponent mills a nonland card, if this creature is in your graveyard, you may return it to your
// hand."). A LIVE zone check on the SOURCE CARD (ctx.sourceCardId, threaded by checkMilledTriggers'
// graveyard scan): true iff that exact card is in the CONTROLLER's graveyard right now — re-evaluated at
// flush AND resolution (CR 603.4 second check — the card may have been exiled/recurred in between; the
// return then correctly doesn't happen). A missing sourceCardId (a battlefield-fired trigger / no context)
// → null (can't confirm → FN-safe drop). Anchored EXACTLY.
const IN_YOUR_GRAVEYARD_RE = /^this creature is in your graveyard$/;

// ===== SAME-NAME ETB (Guardian Project, CR 603.4 + 201.2) ====================================
// "it doesn't have the same name as another creature you control or a creature card in your graveyard"
// — a per-PERMANENT condition keyed on the entering creature (the trigger's triggeringPermanent). True
// iff NO OTHER creature you control AND NO creature card in your graveyard shares the entering creature's
// name. CR 201.2: two objects have "the same name" when they share an English name string (a nameless /
// empty-name token can't match a real card). "another creature you control" (CR 109.1 / 113.7 — "another"
// excludes the object itself) → exclude the entering permanent by id when scanning the battlefield. The
// graveyard half is a plain name+creature-card scan (the entering permanent is never in the graveyard, so
// no self-exclusion needed there). The entering permanent is supplied via `ctx.triggeringPermanentId`
// (checkEnterTriggers threads enteredPerm), resolved against the controller's battlefield.
const SAME_NAME_ETB_RE = /^it doesn't have the same name as another creature you control or a creature card in your graveyard$/;

// ===== EVOLVE-COMPARE (KW-EVOLVE, CR 702.100a/d — SHELF S7) ==================================
// "that creature has greater power or toughness than this creature" — the synthesized evolve trigger's
// intervening-if: LAYER-AWARE P/T of the ENTERING creature (ctx.triggeringPermanentId) vs the SOURCE
// (ctx.sourcePermanentId), re-read live at flush AND resolution (CR 702.100d — the comparison uses
// current values both times). Either permanent gone → null (can't confirm → FN-safe drop, the engine's
// vanished-referent convention).
const EVOLVE_COMPARE_RE = /^that creature has greater power or toughness than this creature$/;

// ===== STRICTLY THE GREATEST POWER (the play-weighted program, P·32 — Selvala, Heart of the Wilds: "its controller may draw a
// card if its power is greater than each other creature's power") ===== the ENTERING creature (ctx.triggeringPermanentId) has a
// layer-aware power greater than that of every OTHER creature on the battlefield, each player's — strictly: a tie is not greater.
// Read as the instruction resolves (CR 608.2). The entering creature gone → null (can't confirm → FN-safe drop, the
// vanished-referent convention).
const POWER_GREATEST_STRICT_RE = /^its power is greater than each other creature's power$/;

// ===== OPPONENT-LOST-LIFE (Bloodchief Ascension trigger 1 — SHELF S7) ========================
// "an opponent lost N or more life this turn" — read the per-seat lifeLostThisTurn ledger (stamped at the
// gameState.loseLife chokepoint, reset for all seats at untap). An absent tally IS zero (fail-closed: the
// ledger can't miss a loss — every life-loss path funnels through loseLife). Boolean always, never null.
const OPP_LOST_LIFE_RE = new RegExp(`^an opponent lost ${NUM_RE} or more life this turn$`);
// BLITZ IF-1 (CR 119.3) — the bare "an opponent lost life this turn" (Lion Vulture, Savage Gorger, Bloodtithe
// Collector, Arrogant Outlaw …) is the ≥1 case of the SAME lifeLostThisTurn ledger: any life lost by any
// opponent this turn satisfies it. No number word, so it's a DISTINCT anchor from OPP_LOST_LIFE_RE; both read
// the identical ledger (identical at flush AND resolution), differing only in the threshold (≥1 vs ≥N).
const OPP_LOST_LIFE_ANY_RE = /^an opponent lost life this turn$/;

// ===== OPPONENT-DEALT-DAMAGE (CR 120.3 — KW-BLOODTHIRST, 2026-07-25) ==========================
// "an opponent was dealt damage this turn" (the bloodthirst condition, 26 corpus carriers). Reads the
// per-seat damageTakenThisTurn ledger — DAMAGE ONLY, deliberately NOT lifeLostThisTurn: a drain, a
// pay-life cost, or "each player loses 1 life" all lose life without ANY damage being dealt, and
// crediting those would fire bloodthirst on a turn nobody was damaged (the forbidden FP). gameState's
// loseLife tallies this ledger only when its `combatDamage` flag is defined — which exactly the two
// damage callers pass and no non-damage loss does. Absent tally = 0 = false (fail-closed).
const OPP_DEALT_DAMAGE_RE = /^an opponent was dealt damage this turn$/;

// ===== THE TRAP CONDITIONS (shelf D17, 2026-09-30 — the Zendikar Trap cycle's "If <condition>, you may pay <cost> rather than
// pay this spell's mana cost") ===== each an existential over the condition controller's OPPONENTS read off a per-seat,
// per-turn ledger reset for every seat at untap — the opponent twins this header's DEFERRED list names — or a live read of
// the current combat. Boolean always (an absent tally is zero), so the spell probe reads each as parseable:
//   "an opponent cast a <color> spell this turn" (Ricochet Trap) — spellColorsCastThisTurn, stamped at the cast chokepoint;
//   "an opponent cast N or more spells this turn" (Mindbreak Trap) — spellsCastThisTurn;
//   "an opponent drew N or more cards this turn" (Runeflare Trap) — cardsDrawnThisTurn;
//   "an opponent gained life this turn" (Needlebite Trap) — lifeGainedThisTurn;
//   "an opponent had N or more cards put into their graveyard from anywhere this turn" (Ravenous Trap) — gyEnteredThisTurn,
//     which counts CARDS only (tokens are filtered at its chokepoint);
//   "N or more creatures are attacking" / "exactly one creature is attacking" / "a <color> creature [with flying] is
//     attacking" (Lethargy, Pitfall, Slingbow, Nemesis) — the declared attackers still on the battlefield, colours and
//     flying read layer-aware. Outside combat nothing is attacking.
// + "has cast" and a two-color "a blue or black spell" (shelf D18 — Veil of Summer): either color satisfies it.
const OPP_CAST_COLOR_RE = /^an opponent (?:has )?cast an? (white|blue|black|red|green)(?: or (white|blue|black|red|green))? spell this turn$/;
const OPP_CAST_N_RE = new RegExp(`^an opponent cast ${NUM_RE} or more spells this turn$`);
const OPP_DREW_N_RE = new RegExp(`^an opponent drew ${NUM_RE} or more cards this turn$`);
const OPP_GAINED_LIFE_RE = /^an opponent gained life this turn$/;
const OPP_GY_N_RE = new RegExp(`^an opponent had ${NUM_RE} or more cards put into their graveyard from anywhere this turn$`);
const ATTACKING_N_RE = new RegExp(`^${NUM_RE} or more creatures are attacking$`);
const ATTACKING_ONE_RE = /^exactly one creature is attacking$/;
const ATTACKING_COLOR_RE = /^an? (white|blue|black|red|green) creature( with flying)? is attacking$/;
const TRAP_COLOR_LETTER = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
function attackersOnBattlefield(state) {
  return (state?.combat?.attackers || []).filter((a) => findPermanent(state, a.permanentId));
}

// ===== THOSE ATTACKERS AT YOU (Mangara, the Diplomat — CR 508.1b, 506.4, 603.4) ==============
// "two or more of those creatures are attacking you and/or planeswalkers you control" — "those creatures" are the attackers
// the opponent DECLARED (context.declaredAttackers, the snapshot checkAttackTriggers' opponent-attacks pass stamps with the
// player or planeswalker each was declared attacking, CR 508.1b). The intervening-if is read at flush and again on
// resolution (CR 603.4), and the card's ruling says how each creature is read on resolution:
//   · still on the battlefield — its current information: it counts only while it is still attacking. A creature is removed
//     from combat (CR 506.4) when its combat record is gone (an effect removed it), when it regenerated (the
//     removedFromCombat flag, CR 701.19a), or when its controller changed — still controlled by the attacking player.
//   · left the battlefield — its last known information (CR 608.2h): the player or planeswalker it was attacking as it left,
//     which is what it was declared attacking.
// A planeswalker attack counts only while that planeswalker is still on the battlefield under your control: one that left
// or changed control is removed from combat (CR 506.4) and the creature attacks nothing (CR 506.4c). Pure.
const ATTACKERS_AT_YOU_RE = /^two or more of those creatures are attacking you and\/or planeswalkers you control$/;
function declaredAttackersAtYou(state, controllerId, context) {
  const declared = context?.declaredAttackers;
  if (!Array.isArray(declared)) return null;
  let n = 0;
  for (const d of declared) {
    if (d?.defender !== controllerId) continue;
    if (d.defenderPlaneswalkerId && findPermanent(state, d.defenderPlaneswalkerId)?.controller !== controllerId) continue;
    const lk = findPermanent(state, d.permanentId);
    if (lk) {
      const inCombat = (state?.combat?.attackers || []).some((a) => a?.permanentId === d.permanentId);
      if (!inCombat || lk.permanent.removedFromCombat || lk.controller !== context.attackingPlayerId) continue;
    }
    n++;
  }
  return n;
}

// ===== EXCESS-DAMAGE (Rith, Liberated Primeval — CR 120.4a, 2026-08-15) ======================
// "a creature or planeswalker an opponent controlled was dealt excess damage this turn" — reads the
// excessDamageThisTurn ledger stamped at the gameState.markCombatDamage chokepoint (every creature-damage
// path funnels there; a stale-turn ledger reads false). The ledger records the DAMAGED creature's
// controller, so "an opponent controlled" is resolved here against the CONDITION's controller — Rith's
// own creatures taking excess damage never satisfy it. Deliberately under-detecting (deathtouch excess +
// the planeswalker loyalty path are uncredited — the trigger under-fires, never over-fires, CREED).
const EXCESS_DAMAGE_OPP_RE = /^a creature or planeswalker an opponent controlled was dealt excess damage this turn$/;

// ===== MONARCH-STATUS (CR 725.1 + 603.4 — BLITZ IF-1) ========================================
// "you're the monarch" (Throne Warden, Garrulous Sycophant, Skyline Despot, Faramir Steward of Gondor …) —
// the controller currently holds the monarch designation (CR 725.1: "The monarch is a designation a player
// can have"). A LIVE read of state.monarchId — the SAME field the mana-augment gate reads for Regal Behemoth
// (manaModel.js: `state.monarchId !== playerId`) and the crown-steal / become-monarch events keep current.
// True iff state.monarchId === controllerId; no monarch (undefined) → false (CR 603.4 drop). Layer-irrelevant
// single-value read, identical at flush AND resolution. NOT the "you control a monarch" filter (a designation,
// not a typed permanent — still rejected by NON_TYPE_WORDS); this anchors the monarch STATUS predicate.
const MONARCH_STATUS_RE = /^you(?:'?re| are) the monarch$/;

// ===== YOU-CONTROL-YOUR-COMMANDER (CR 903 + 603.4 — the Lieutenant cycle) ====================
// "if you control your commander" (Loyal Drake, Loyal Subordinate, Loyal Apprentice, Loyal Guardian,
// Siege-Gang Lieutenant, Ironwill Forger — all "At the beginning of combat on your turn, if you control your
// commander, …"; the "Lieutenant —" prefix on each is a pure CR 207.2c ability-word label, stripped upstream
// like Landfall/Raid/Enrage). A LIVE read of whether the controller's board carries a permanent stamped
// `isCommander: true` (gameState.js tags every commander card at command-zone→battlefield, travels with the
// permanent for its lifetime there) — NOT the generic "you control a commander" TYPE filter (rejected by
// NON_TYPE_WORDS above; a commander is a designation, not a card type, same distinction as MONARCH-STATUS).
// Layer-irrelevant board-presence read, identical at flush AND resolution. Loyal Unicorn's "creatures you
// control gain vigilance" half rides the SAME condition on the same trigger line — covered by this one check.
const YOU_CONTROL_YOUR_COMMANDER_RE = /^you control your commanders?$/;

// ===== NO-CARDS-IN-HAND (CR 603.4 — BLITZ IF-1) ==============================================
// "you have no cards in hand" (Bloodhall Priest, Hollowborn Barghest, Hollow One shape …) — the controller's
// hand is empty. Reuses the SAME controllerMetric "cards in hand" reader (player.hand.length) the opponent
// hand-compare uses; true iff that count is 0. A single count off the live state, layer-irrelevant, identical
// at flush AND resolution. Anchored EXACTLY — a "that player has no cards in hand" (opponent-scoped) variant
// falls through → null → Arbiter (CREED — never a mis-scoped hand read).
const NO_CARDS_IN_HAND_RE = /^you have no cards in hand$/;

// ===== CREATURE-DIED-UNDER-YOUR-CONTROL (CR 700.4 + 603.4 — BLITZ IF-1) ======================
// "a creature died under your control this turn" (Denethor Ruling Steward, Faramir Field Commander,
// Essenceknit Scholar) — a CONTROLLER-SCOPED turn-event history read off the per-seat creaturesDiedThisTurn
// tally (gameState.js increments it for `d.controller` — the controller of the dying creature — at the death
// chokepoint, reset for all seats at untap). "died" = battlefield→graveyard (CR 700.4); "under your control"
// scopes it to the CONTROLLER's own tally (NOT the all-seats sum that the unscoped "a creature died this turn"
// reads). True iff the controller's tally is ≥1. Layer-irrelevant, identical at flush AND resolution.
const CREATURE_DIED_UNDER_CONTROL_RE = /^a creature died under your control this turn$/;

// ===== CONTROLLER-GAINED-LIFE (CR 119.3 + 603.4 — BLITZ LG-1) ================================
// "you('ve) gained life this turn" (Regal Bloodlord, Courier Bat, Lathiel …) and "you('ve) gained N or more
// life this turn" (Griffin Aerie / The Gaffer "3 or more", Angelic Accord / Valkyrie Harbinger "4 or more",
// Resplendent Angel "5 or more" …) — a CONTROLLER-SCOPED turn-event history read off the per-seat
// lifeGainedThisTurn ledger (gameState.gainLife increments it for the GAINING player at the single life-gain
// chokepoint, reset for all seats at untap alongside lifeLostThisTurn). The ledger sums the turn's TOTAL life
// gained (CR 119.3 — cumulative, so 1+1+1 satisfies "3 or more"), so the bare form is the ≥1 case and the
// cardinal form compares that running total to N. The exact GAIN mirror of the OPP-LOST-LIFE lifeLostThisTurn
// reads (bare + "N or more"); layer-irrelevant, identical at flush AND resolution. Controller-scoped — "your
// team gained" (2HG), "an opponent gained life this turn" (opponent existential), and the compound "you gained
// and lost life this turn" all fail these EXACT anchors → fall through → null → Arbiter (CREED, never a
// mis-scoped read). Straight + curly apostrophe on the "you've" contraction tolerated.
const CTRL_GAINED_LIFE_ANY_RE = /^you(?:['’]ve| have)? gained life this turn$/;
const CTRL_GAINED_LIFE_N_RE = new RegExp(`^you(?:['’]ve| have)? gained ${NUM_RE} or more life this turn$`);

// ===== SOURCE-COUNTER-THRESHOLD (Bloodchief Ascension trigger 2 — SHELF S7, CR 603.4) ========
// "this <noun> has N or more <type> counters on it" — a LIVE read of the SOURCE permanent's counters
// (ctx.sourcePermanentId, threaded by makePendingTrigger), re-evaluated at flush AND resolution. The
// source gone from the battlefield → null (can't confirm → FN-safe drop, the engine convention for a
// vanished source). Anchored; the counter type is a bare word matched against the counters map key.
// + the P/T spellings (shelf D19 — Ingenious Prodigy's "one or more +1/+1 counters"): "+1/+1" / "-1/-1" ARE the map keys.
const SOURCE_COUNTER_THRESHOLD_RE = new RegExp(`^this (?:enchantment|artifact|creature|permanent) has ${NUM_RE} or more (\\+1/\\+1|-1/-1|[a-z]+) counters on it$`);
// SOURCE-HAS-ANY-COUNTERS (The Ozolith, W2 — CR 603.4): the threshold-less, kind-less sibling — "this
// permanent has counters on it" (the rewriteSelfNameInterveningIf-normalized form of "<Name> has counters
// on it"). Same live source read + FN-safe drops, true iff ANY counter kind sits at ≥1.
const SOURCE_HAS_ANY_COUNTERS_RE = /^this (?:enchantment|artifact|creature|permanent) has counters on it$/;

function isCreatureCard(card) {
  return /\bcreature\b/i.test(typeStr(card));
}
// A permanent is a creature when its (layer-aware-irrelevant for this name gate) printed type line says so.
// Reading the card's type line is sufficient here: the same-name gate compares the entering creature against
// OTHER creatures — a non-creature permanent sharing the name (rare) shouldn't block the draw (CR cares about
// "another CREATURE you control"). Mirrors isCreatureCard so on-field and graveyard checks stay consistent.
function isCreaturePermLocal(perm) {
  return /\bcreature\b/i.test(typeStr(perm?.card));
}

/**
 * Evaluate an intervening-if condition for `controllerId` against `state`.
 * Returns true / false (the condition's truth) or null (outside the modeled vocabulary → caller must
 * treat as "can't confirm": the trigger does NOT route natively / does NOT fire).
 *
 * `context` (optional) carries the trigger's runtime context — notably `triggeringPermanentId`, the
 * entering permanent for an ETB trigger — needed by per-permanent conditions (the SAME-NAME ETB shape).
 * Pure board-count conditions ignore it, so existing callers (which omit it) are unaffected.
 */
/**
 * ⭐ TOP-LEVEL DISJUNCTION (2026-07-30) — "you control a Desert OR there is a Desert card in your graveyard"
 * (the 6-card Desert cycle), "you gained or lost life this turn"-style compounds, and the "…or if …" frame.
 *
 * ⛔ THE WHOLE CONDITION IS ALWAYS TRIED FIRST, and that ordering is the entire safety argument. Many single
 * conditions legitimately contain " or " — "power 4 or greater", "N or more", "attacking or blocking",
 * "gained or lost life this turn". Splitting eagerly would shatter a READABLE condition into two unreadable
 * halves and REGRESS every card carrying one. Gating the split behind the whole form's failure makes "no
 * regressions" structural rather than something to be re-verified.
 *
 * ⛔ AND BOTH HALVES MUST BE INDEPENDENTLY READABLE. If either returns null the disjunction returns null, so
 * an unreadable half can never be treated as false — which would answer a definite "no" to a question the
 * engine cannot actually evaluate.
 *
 * ⚠️ WHY THIS WAS NOT BUILT WHEN IT WAS FIRST PROPOSED: a probe of the Desert cycle's two halves showed the
 * graveyard half was ALSO unreadable, so a splitter would have gained exactly zero. It is built now because
 * the singular graveyard reader above made that half readable — the sequencing was the point, and RULE 1b is
 * what stopped a useless version of this from shipping two slices ago.
 */
export function evaluateInterveningIf(state, condition, controllerId, context = null) {
  const whole = evaluateSingleCondition(state, condition, controllerId, context);
  if (whole !== null) return whole;
  const c = String(condition || "").toLowerCase().trim();
  // The printed compound frames: "<A> or <B>" and "<A> or if <B>" (the latter appears inside activation
  // riders — "…this turn or if you've sacrificed a Food this turn").
  const parts = c.split(/\s+or(?:\s+if)?\s+/);
  if (parts.length !== 2) return null;
  const left = evaluateSingleCondition(state, parts[0].trim(), controllerId, context);
  if (left === null) return null;
  const right = evaluateSingleCondition(state, parts[1].trim(), controllerId, context);
  if (right === null) return null;
  return left || right;
}

function evaluateSingleCondition(state, condition, controllerId, context = null) {
  const c = String(condition || "").toLowerCase().trim();
  if (!state?.players?.[controllerId]) return false; // controller gone → condition unmet

  // ===== NO-MANA-SPENT (SG-13, 2026-09-03 — Vexing Bauble, CR 603.4) ===== "…, if no mana was spent to cast
  // it, …" on a cast trigger. Reads the cast context's `manaSpent` (threaded by checkCastTriggers from the
  // dispatcher's payment plan): a definite false → true; a definite true → false; anything else (an
  // alternative-cost cast, a context without the field) → null, "can't confirm" — never a fired guess.
  if (c === "no mana was spent to cast it") {
    if (typeof context?.manaSpent !== "boolean") return null;
    return context.manaSpent === false;
  }
  // ===== CAST FROM A GRAVEYARD (the play-weighted program, P·23 — "If this spell was cast from a graveyard, …": Sevinne's
  // Reclamation, the Increasing cycle, Secrets of the Key) ===== the resolving spell's own cast-time stamp
  // (actionDispatcher.applyCastSpell writes context.castFromGraveyard for a graveyard cast). A definite answer either way:
  // a spell cast from any other zone carries no stamp, and a copy was never cast (stack.spellCopyPayload strips it).
  if (c === "this spell was cast from a graveyard") return context?.castFromGraveyard === true;
  // ===== CAST DURING YOUR MAIN PHASE, THE SPELL SIDE (play-weighted #564 — Unbreakable Formation's Addendum; "Addendum" is
  // a CR 207.2c ability word with no rules meaning, so the condition is the printed text after it) ===== the resolving
  // spell's own cast-time stamp: actionDispatcher.applyCastSpell writes context.castDuringMainPhase as a DEFINITE boolean
  // on every instant/sorcery program cast (castDuringMainPhaseNow — the caster is the active player and the phase is a main
  // phase, CR 505.1). Anything without a boolean stamp reads null, never a guess: a copy (never cast, CR 707.10 —
  // stack.spellCopyPayload strips the stamp), an ability, or an evaluator that does not pass the spell's context through.
  // The shape probes (spellConditionParseable, conditionIsDecidable, interveningIfParseable) supply no stamp, so they read
  // null exactly as before this reader existed: the generic conditional lanes cannot admit the phrase. Its one consumer is
  // the group grant's "those creatures" rider (atoms/combat.applyGrantKeywordsGroup), which hands over the spell's context.
  if (c === "you cast this spell during your main phase") return typeof context?.castDuringMainPhase === "boolean" ? context.castDuringMainPhase : null;
  // ===== THE CITY'S BLESSING (shelf D5, 2026-09-30 — CR 702.131) ===== "if you have the city's blessing" (a trigger's
  // intervening-if; the "Activate only if …" rider on Arch of Orazca; a spell's condition). A player designation, set by
  // ascend.grantCitysBlessings and never cleared — always a definite answer.
  if (/^you have the city['’]s blessing$/.test(c)) return hasCitysBlessing(state, controllerId);
  // ===== CRIME THIS TURN (shelf D9, 2026-09-30 — CR 700.13) ===== "if you've committed a crime this turn" (Servant of the
  // Stinger). The per-turn flag triggers.checkCrimeTriggers stamps; unset reads false, a definite answer.
  if (/^you['’]ve committed a crime this turn$/.test(c)) return state?.players?.[controllerId]?.crimeCommittedThisTurn === true;
  // ===== MANA-SPENT AMOUNT (④-Z, 2026-09-03 — the Opus cycle: Thunderdrum Soloist, Tackle Artist, Spectacular
  // Skywhale …) ===== "N or more mana was spent to cast that spell" and its complement "fewer than N mana was spent
  // to cast that spell" (the base half of an "… instead" pair). Reads the cast context's `manaSpentAmount` (threaded
  // by checkCastTriggers from the dispatcher's payment plan): a number → a definite answer; anything else (an
  // alternative-cost cast, a non-cast context) → null, "can't confirm" — never a fired guess.
  {
    const ge = c.match(/^(\w+) or more mana was spent to cast that spell$/);
    const lt = c.match(/^fewer than (\w+) mana was spent to cast that spell$/);
    if (ge || lt) {
      const w = (ge || lt)[1];
      const n = NUM_WORD[w] ?? (/^\d+$/.test(w) ? parseInt(w, 10) : NaN);
      if (!Number.isInteger(n)) return null;
      if (typeof context?.manaSpentAmount !== "number") return null;
      return ge ? context.manaSpentAmount >= n : context.manaSpentAmount < n;
    }
  }

  // ===== NOT-A-MANA-ABILITY (CAP-BRACERS, 2026-09-03 — Illusionist's Bracers / Rings of Brighthearth, CR 605.3b)
  // ===== "…, if it isn't a mana ability, …" on an ability-activated trigger. Reads the activation context's
  // `activatedIsManaAbility` (threaded by checkAbilityActivatedTriggers — a mana ability never uses the stack,
  // so every stack activation stamps a definite false): false → true; true → false; missing → null.
  if (c === "it isn't a mana ability") {
    if (typeof context?.activatedIsManaAbility !== "boolean") return null;
    return context.activatedIsManaAbility === false;
  }
  // ===== THOSE ATTACKERS AT YOU (play-weighted #610 — Mangara, the Diplomat: "Whenever an opponent attacks with creatures, if
  // two or more of those creatures are attacking you and/or planeswalkers you control, …") ===== reads the declaration the
  // opponent-attacks pass threads into the context (triggers.checkAttackTriggers); no declaration → null, never a guess.
  if (ATTACKERS_AT_YOU_RE.test(c)) {
    const n = declaredAttackersAtYou(state, controllerId, context);
    return n === null ? null : n >= 2;
  }

  // ===== CLASH RESULT (STAGE ④-1, 2026-09-03 — CR 701.22) ===== "you won the clash": the parser's normalized
  // form of "If you win" after a clash atom. Reads the stamp the clash applier wrote for THIS controller
  // (`state.clashResult`); no stamp, another player's stamp, or a non-boolean → null (never a guess). The
  // collapse always emits the clash atom immediately before this conditional, so the stamp is never stale.
  if (c === "you won the clash") {
    const r = state?.clashResult;
    if (!r || r.controller !== controllerId || typeof r.won !== "boolean") return null;
    return r.won;
  }

  // ===== ENTERED-THIS-TURN (STAGE ④-3, 2026-09-03 — Gathering Place / Dark Fortress and their siblings:
  // "Activate only if this land entered this turn or if you control a basic land", CR 602.5) ===== the
  // source permanent's own `enteredOnTurn` stamp (written by every enter path) against the current turn.
  // No source, a source not on any battlefield, or an unstamped permanent → null ("can't confirm" — never
  // an offered mana source on a guess). The noun is restricted to permanent-type words (a self-reference).
  {
    const etM = c.match(/^this (?:land|creature|permanent|artifact|enchantment) entered this turn$/);
    if (etM) {
      const sourceId = context?.sourcePermanentId;
      if (!sourceId) return null;
      let perm = null;
      for (const pid of Object.keys(state.players || {})) {
        perm = (state.players[pid]?.battlefield || []).find((p) => p.id === sourceId) || perm;
      }
      if (!perm || perm.enteredOnTurn == null || state.turn == null) return null;
      return perm.enteredOnTurn === state.turn;
    }
  }

  // ===== SELF TAP-STATE (CR 603.4 + 106.1) ===== "…, if this artifact is untapped, …" (Howling Mine #723,
  // Blinkmoth Urn, Genesis Chamber) and its inverse "if this artifact is tapped" (Mana Vault #145). The
  // source's own tap state is the most directly checkable condition there is — one boolean on the permanent
  // — but the existing machinery only understood BOARD-COUNT conditions ("you control two or more untapped
  // lands"), so every card in this family parked. 29 cards carry it across five wordings; "this creature"
  // (14) and "this artifact" (5+1) are the bulk.
  //
  // Evaluated LIVE against the battlefield, which is exactly what CR 603.4 wants: an intervening-if is
  // checked when the trigger would go on the stack AND again as it resolves, so a Mana Vault untapped in
  // between correctly stops its own trigger. A missing source (it left the battlefield) returns null rather
  // than false — "can't confirm" is FN-safe and matches the EVOLVE-COMPARE precedent below. The noun is
  // restricted to permanent-type words: "this <type>" is always a self-reference (CR 109.2), and the list
  // keeps a stray phrase from riding a lookup that would answer about the wrong object.
  // SELF POWER THRESHOLD (Level Up's granted "…if IT has power 10 or greater, draw a card"; Hog-Monkey
  // Rampage). The board-wide form ("you control a creature with power N or greater") already exists above;
  // this is the SELF referent, resolved through the same context.sourcePermanentId the tapped check below
  // uses. "it" is accepted alongside "this creature" because a SELF-scope trigger's pronoun binds to the
  // source (CR 608.2c) and the trigger layer only routes this shape self-scoped.
  //
  // ⭐ LAYER-AWARE by construction: creaturePower(perm, state) is the same live reader the powerAtLeast
  // filter uses, so counters and pumps count — which is the entire point on a card that DOUBLES its counters
  // and then asks whether it got big enough. A printed-power read would answer about the wrong creature.
  //
  // Missing referent or a source that has left the battlefield → null, not false: "can't confirm" is
  // FN-safe (the effect is skipped), while false would be a confident wrong answer.
  {
    const powM = c.match(/^(?:this creature|it) has power (\d+) or (?:greater|more)$/);
    if (powM) {
      const sourceId = context?.sourcePermanentId;
      if (!sourceId) return null;
      for (const pid of Object.keys(state.players || {})) {
        for (const p of state.players[pid]?.battlefield || []) {
          if (p.id === sourceId) return creaturePower(p, state) >= parseInt(powM[1], 10);
        }
      }
      return null;
    }
  }
  // ===== SELF P/T THRESHOLD, "its <power|toughness> is N or <less|greater>" (CR 603.4) =============
  // The Young Hero Role's granted trigger: "Whenever this creature attacks, if its toughness is 3 or less, put
  // a +1/+1 counter on it." (Role tokens phase 2.)
  //
  // ⭐ AN AXIS FIX. The arm directly above already reads a self POWER threshold — but only in the
  // "has power N or greater" phrasing and only upward. Everything else in the family was unparseable:
  // "its power is N or less", "its toughness is N or less", "its toughness is N or greater". Same referent,
  // same readers, same context field; only the wording and the direction differed.
  //
  // ⭐ LAYER-AWARE BY CONSTRUCTION, and that is the whole point on this Role. creaturePower /
  // creatureToughness are the live layer-aware readers, so a creature that has ALREADY collected +1/+1
  // counters correctly stops qualifying for "toughness 3 or less" — the self-limiting behaviour the printed
  // Role is designed around. A printed-P/T read would pump it forever.
  //
  // "its" (CR 608.2c) binds to the object the ability is on — the source — so this reads
  // context.sourcePermanentId exactly like its power sibling. That is also what makes it correct for the
  // GRANTED copy: the Role grants the ability to the enchanted creature, so the source IS that creature.
  // Missing referent, or a source that has left the battlefield → null ("can't confirm"), never false.
  //
  // ⚠️ SHIPPED ONCE BEFORE AND REVERTED: on its own this flipped ZERO cards, because no corpus card PRINTS
  // this condition — only the Young Hero token carries it. It lands here, with the Role that needs it.
  {
    const ptM = c.match(/^its (power|toughness) is (\d+) or (less|fewer|greater|more)$/);
    if (ptM) {
      const sourceId = context?.sourcePermanentId;
      if (!sourceId) return null;
      for (const pid of Object.keys(state.players || {})) {
        for (const p of state.players[pid]?.battlefield || []) {
          if (p.id !== sourceId) continue;
          const value = ptM[1] === "power" ? creaturePower(p, state) : creatureToughness(p, state);
          const threshold = parseInt(ptM[2], 10);
          return /^(?:less|fewer)$/.test(ptM[3]) ? value <= threshold : value >= threshold;
        }
      }
      return null;
    }
  }
  {
    const tapM = c.match(/^this (?:artifact|creature|enchantment|land|permanent|planeswalker|battle|token|equipment|vehicle) is (un)?tapped$/);
    if (tapM) {
      const sourceId = context?.sourcePermanentId;
      if (!sourceId) return null;                       // referent missing → can't confirm (FN-safe)
      for (const pid of Object.keys(state.players || {})) {
        for (const p of state.players[pid]?.battlefield || []) {
          if (p.id === sourceId) return tapM[1] ? !p.tapped : !!p.tapped;
        }
      }
      return null;                                      // left the battlefield → can't confirm (FN-safe)
    }
  }

  // EVOLVE-COMPARE (KW-EVOLVE) — layer-aware P/T of the entering creature vs the source, read live.
  if (EVOLVE_COMPARE_RE.test(c)) {
    const enteringId = context?.triggeringPermanentId;
    const sourceId = context?.sourcePermanentId;
    if (!enteringId || !sourceId) return null; // referents missing → can't confirm (FN-safe)
    let entering = null, source = null;
    for (const pid of Object.keys(state.players || {})) {
      for (const p of state.players[pid]?.battlefield || []) {
        if (p.id === enteringId) entering = p;
        if (p.id === sourceId) source = p;
      }
    }
    if (!entering || !source) return null;     // a referent left the battlefield → can't confirm (FN-safe)
    return creaturePower(entering, state) > creaturePower(source, state)
      || creatureToughness(entering, state) > creatureToughness(source, state);
  }

  // STRICTLY THE GREATEST POWER (P·32 — Selvala) — the entering creature vs every other creature on every battlefield.
  if (POWER_GREATEST_STRICT_RE.test(c)) {
    const entering = context?.triggeringPermanentId ? findPermanent(state, context.triggeringPermanentId)?.permanent : null;
    if (!entering) return null; // it left the battlefield → can't confirm (FN-safe)
    const power = creaturePower(entering, state);
    for (const pid of Object.keys(state.players)) {
      for (const p of state.players[pid].battlefield) {
        if (p.id !== entering.id && permanentIsCreature(state, p.id) && creaturePower(p, state) >= power) return false;
      }
    }
    return true;
  }

  // OPPONENT-LOST-LIFE (Bloodchief Ascension) — the per-seat lifeLostThisTurn ledger; absent = 0 (fail-closed).
  {
    const m = c.match(OPP_LOST_LIFE_RE);
    if (m) {
      const n = parseCount(m[1]);
      return opponentIds(state, controllerId).some((pid) => (state.players[pid]?.lifeLostThisTurn || 0) >= n);
    }
  }
  // OPPONENT-LOST-LIFE (bare, ≥1 — BLITZ IF-1, CR 119.3) — the SAME ledger, threshold ≥1 (any opponent lost
  // any life this turn). Distinct anchor from the "N or more" form; both read lifeLostThisTurn identically.
  if (OPP_LOST_LIFE_ANY_RE.test(c)) {
    return opponentIds(state, controllerId).some((pid) => (state.players[pid]?.lifeLostThisTurn || 0) >= 1);
  }
  // THE TRAP CONDITIONS (shelf D17) — see the regex block: opponent existentials over per-turn ledgers, and the live combat.
  {
    const opp = (read) => opponentIds(state, controllerId).some((pid) => read(state.players[pid] || {}));
    let t = c.match(OPP_CAST_COLOR_RE);
    if (t) return opp((p) => [t[1], t[2]].filter(Boolean).some((w) => (p.spellColorsCastThisTurn || []).includes(TRAP_COLOR_LETTER[w])));
    t = c.match(OPP_CAST_N_RE);
    if (t) { const n = parseCount(t[1]); return n == null ? null : opp((p) => (p.spellsCastThisTurn || 0) >= n); }
    t = c.match(OPP_DREW_N_RE);
    if (t) { const n = parseCount(t[1]); return n == null ? null : opp((p) => (p.cardsDrawnThisTurn || 0) >= n); }
    if (OPP_GAINED_LIFE_RE.test(c)) return opp((p) => (p.lifeGainedThisTurn || 0) >= 1);
    t = c.match(OPP_GY_N_RE);
    if (t) { const n = parseCount(t[1]); return n == null ? null : opp((p) => (p.gyEnteredThisTurn || 0) >= n); }
    t = c.match(ATTACKING_N_RE);
    if (t) { const n = parseCount(t[1]); return n == null ? null : attackersOnBattlefield(state).length >= n; }
    if (ATTACKING_ONE_RE.test(c)) return attackersOnBattlefield(state).length === 1;
    t = c.match(ATTACKING_COLOR_RE);
    if (t) {
      return attackersOnBattlefield(state).some((a) => (permanentColors(state, a.permanentId) || []).includes(TRAP_COLOR_LETTER[t[1]])
        && (!t[2] || permanentHasKeyword(state, a.permanentId, "Flying")));
    }
  }
  // OPPONENT-DEALT-DAMAGE (KW-BLOODTHIRST) — the DAMAGE-only sibling of the life-loss read above.
  if (OPP_DEALT_DAMAGE_RE.test(c)) {
    return opponentIds(state, controllerId).some((pid) => (state.players[pid]?.damageTakenThisTurn || 0) >= 1);
  }
  // EXCESS-DAMAGE (Rith — CR 120.4a): the ledger read. Turn-matched (a stale ledger is false), scoped to
  // the condition controller's OPPONENTS (the ledger stores the damaged creature's controller).
  if (EXCESS_DAMAGE_OPP_RE.test(c)) {
    const led = state?.excessDamageThisTurn;
    if (!led || led.turn !== state?.turn) return false;
    const opps = opponentIds(state, controllerId);
    return (led.controllers || []).some((pid) => opps.includes(pid));
  }

  // MONARCH-STATUS (CR 725.1 — BLITZ IF-1) — the controller holds the monarch designation right now. A live
  // read of state.monarchId (the field manaModel's Regal Behemoth gate reads); no monarch → false (CR 603.4
  // drop). Layer-irrelevant, identical at flush AND resolution.
  if (MONARCH_STATUS_RE.test(c)) return state?.monarchId === controllerId;

  // YOU-CONTROL-YOUR-COMMANDER (CR 903 — the Lieutenant cycle) — true iff any permanent on the controller's
  // board carries the isCommander stamp. It's a game-STATE quality that rides the CARD, not the permanent
  // wrapper (card.isCommander, stamped at seat build — the same field layers.js/legalChoices.js/targeting.js
  // all read via p.card?.isCommander). Board-presence read, identical at flush AND resolution.
  if (YOU_CONTROL_YOUR_COMMANDER_RE.test(c)) return controllerBoard(state, controllerId).some((p) => p.card?.isCommander === true);

  // NO-CARDS-IN-HAND (CR 603.4 — BLITZ IF-1) — the controller's hand is empty. Reuses controllerMetric's
  // "cards in hand" reader (player.hand.length); true iff 0. Identical at flush AND resolution.
  if (NO_CARDS_IN_HAND_RE.test(c)) return controllerMetric(state, controllerId, "cards in hand") === 0;

  // CREATURE-DIED-UNDER-YOUR-CONTROL (CR 700.4 — BLITZ IF-1) — the CONTROLLER's own per-seat creaturesDiedThisTurn
  // tally is ≥1 (a creature they controlled died this turn). Distinct from the unscoped "a creature died this
  // turn" (deathsThisTurnTotal across all seats); this reads only the controller's tally. Identical at flush AND
  // resolution. A seat with no tally → 0 → false.
  if (CREATURE_DIED_UNDER_CONTROL_RE.test(c)) return (state.players[controllerId]?.creaturesDiedThisTurn || 0) >= 1;

  // CONTROLLER-GAINED-LIFE (CR 119.3 — BLITZ LG-1) — the CONTROLLER's own per-seat lifeGainedThisTurn tally
  // (the turn's TOTAL life gained). Bare form ≥1; the cardinal form compares the running total to N. The exact
  // GAIN mirror of the OPP-LOST-LIFE reads; a seat with no tally → 0 → false. Identical at flush AND resolution.
  if (CTRL_GAINED_LIFE_ANY_RE.test(c)) return (state.players[controllerId]?.lifeGainedThisTurn || 0) >= 1;
  {
    const m = c.match(CTRL_GAINED_LIFE_N_RE);
    if (m) {
      const n = parseCount(m[1]);
      if (n == null) return null;
      return (state.players[controllerId]?.lifeGainedThisTurn || 0) >= n;
    }
  }

  // SOURCE-COUNTER-THRESHOLD (Bloodchief Ascension) — live read of the SOURCE permanent's counters.
  {
    const m = c.match(SOURCE_COUNTER_THRESHOLD_RE);
    if (m) {
      const srcId = context?.sourcePermanentId;
      if (!srcId) return null; // no source in context → can't confirm (FN-safe; never fail-open)
      const src = controllerBoard(state, controllerId).find((p) => p.id === srcId);
      if (!src) return null;   // source left the battlefield → can't confirm (FN-safe drop)
      return (src.counters?.[m[2]] || 0) >= parseCount(m[1]);
    }
  }
  // SOURCE-HAS-ANY-COUNTERS (The Ozolith, W2) — the kind-less sibling: any counter kind ≥1, same drops.
  if (SOURCE_HAS_ANY_COUNTERS_RE.test(c)) {
    const srcId = context?.sourcePermanentId;
    if (!srcId) return null;
    const src = controllerBoard(state, controllerId).find((p) => p.id === srcId);
    if (!src) return null;
    return Object.values(src.counters || {}).some((n) => n > 0);
  }

  // SAME-NAME ETB (Guardian Project) — needs the entering permanent from the trigger context.
  // SATORU (POD-SIM THREE · BI-5, 2026-09-05): "if none of them were cast or no mana was spent to cast them" — read off the
  // ENTERING permanent's arrival stamps: not cast at all (ninjutsu, reanimation, a put), or cast for no mana (a free or
  // alt-cost cast — `castForNoMana`, threaded from the dispatcher's payment plan). No entering permanent → can't confirm.
  if (/^none of them were cast or no mana was spent to cast them$/.test(c)) {
    const triggeringId = context?.triggeringPermanentId;
    if (!triggeringId) return null;
    const entering = controllerBoard(state, controllerId).find((p) => p.id === triggeringId);
    if (!entering) return null;
    return !entering.wasCast || entering.castForNoMana === true;
  }
  if (SAME_NAME_ETB_RE.test(c)) {
    const triggeringId = context?.triggeringPermanentId;
    if (!triggeringId) return null; // no entering permanent in context → can't confirm (FN-safe; never fail-open)
    const board = controllerBoard(state, controllerId);
    const entering = board.find((p) => p.id === triggeringId);
    // The entering permanent must be findable + named to evaluate (CR 201.2 — comparison is by name string).
    const name = entering?.card?.name ?? entering?.name;
    if (!entering || !name) return null; // can't read the entering creature's name → can't confirm (FN-safe)
    const nm = String(name).toLowerCase();
    // (a) another creature you control with the same name (exclude the entering permanent itself — "another")
    const dupOnField = board.some((p) =>
      p.id !== triggeringId && isCreaturePermLocal(p) && String(p.card?.name ?? p.name ?? "").toLowerCase() === nm);
    if (dupOnField) return false;
    // (b) a creature CARD in your graveyard with the same name
    const gy = state.players[controllerId].graveyard || [];
    const dupInGy = gy.some((card) => isCreatureCard(card) && String(card?.name ?? "").toLowerCase() === nm);
    return !dupInGy; // "doesn't have the same name as …" → true when NEITHER duplicate exists
  }

  // KICKED ETB (CR 702.33e) — "it was kicked": read the entering permanent's was-kicked flag (a per-PERMANENT
  // cast-decision flag, stamped by resolvers.enterPermanent as perm.wasKicked when the kicker cost was paid).
  // Keyed on the entering permanent (ctx.triggeringPermanentId) like SAME-NAME ETB, so it reads identically at
  // flush (the permanent is on the battlefield when ETB triggers flush) AND resolution (CR 603.4 second check).
  if (KICKED_ETB_RE.test(c)) {
    const triggeringId = context?.triggeringPermanentId;
    if (!triggeringId) return null; // no entering permanent in context → can't confirm (FN-safe; never fail-open)
    const board = controllerBoard(state, controllerId);
    const entering = board.find((p) => p.id === triggeringId);
    if (!entering) return null;      // entering permanent already gone → can't confirm (FN-safe)
    return entering.wasKicked === true; // a normal (un-kicked) cast leaves wasKicked unset → false (CR 603.4 drop)
  }

  // SPENT PIPS (shelf D4, 2026-09-30 — Vibrance, and the hybrid "was spent" ETB cycle: Gruul Scrapper, Steamcore Weird,
  // Catharsis, Deceit …) — "{R}{R} was spent to cast it": every pip is a colour that at least that much mana of was spent
  // ("{W}{U}" = at least one white AND one blue). Read off the entering permanent's `manaSpentByColor` (the dispatcher's
  // payment plan, stamped by resolvers.enterPermanent), keyed on ctx.triggeringPermanentId like the kicked shape above. A
  // permanent that wasn't cast spent nothing to cast it → false; one cast for an alternative cost the engine doesn't tally
  // → null, never a guess.
  {
    const pips = c.match(SPENT_PIPS_ETB_RE);
    if (pips) {
      const triggeringId = context?.triggeringPermanentId;
      if (!triggeringId) return null;
      const entering = controllerBoard(state, controllerId).find((p) => p.id === triggeringId);
      if (!entering) return null;
      const spent = entering.manaSpentByColor;
      if (!spent) return entering.wasCast === true ? null : false;
      const need = {};
      for (const [, col] of pips[1].matchAll(/\{([wubrg])\}/g)) need[col.toUpperCase()] = (need[col.toUpperCase()] || 0) + 1;
      return Object.entries(need).every(([col, n]) => (Number(spent[col]) || 0) >= n);
    }
  }

  // CAST-vs-PUT ETB (CR 603.2) — "if you cast it": the ETB fires ONLY when the permanent got here by being
  // CAST, not put onto the battlefield by another effect (reanimation, a Show and Tell, a blink returning
  // it, a token copy). 38 corpus cards carry this rider and none could be modelled without it; it is the
  // SOLE blocker on five, Tiamat and Zacama, Primal Calamity among them.
  //
  // Read exactly like the kicked flag above and for the same reason: it is a per-PERMANENT fact about HOW
  // this object arrived, so it belongs on the permanent (resolvers.enterPermanent stamps `wasCast` from the
  // two CAST resolvers — PERMANENT_ETB and AURA_ETB) and is keyed on ctx.triggeringPermanentId so it reads
  // identically at flush and at the CR 603.4 resolution re-check.
  //
  // ⛔ EVERY UNCERTAIN PATH RETURNS null OR false, NEVER true. A permanent put onto the battlefield by any
  // other route simply never gets the stamp, so it reads false and the trigger correctly does not fire —
  // the safe direction. Fail-open here would hand a free Tiamat tutor to every reanimation effect, which is
  // precisely the abuse the printed rider exists to prevent.
  if (/^you cast (?:it|this creature|this permanent)$/.test(c)) {
    const triggeringId = context?.triggeringPermanentId;
    if (!triggeringId) return null;  // no entering permanent in context → can't confirm (FN-safe)
    const board = controllerBoard(state, controllerId);
    const entering = board.find((p) => p.id === triggeringId);
    if (!entering) return null;      // already gone → can't confirm (FN-safe)
    return entering.wasCast === true;
  }
  // CAST-FROM-HAND (CR 601.2 / 400.7) — "if you cast it from your hand" (Furnace Dragon, Reiver Demon,
  // Angel of the Dire Hour, Wakening Sun's Avatar, Coal Stoker). The same per-permanent fact as the bare
  // "you cast it" arm above, narrowed by the ZONE the spell was cast from (resolvers.enterPermanent stamps
  // castFromZone from the cast resolvers only).
  //
  // ⛔ The zone is what these riders are FOR — every carrier is a heavy sweep whose printed cost is that
  // you had to hard-cast it. An unstamped permanent (reanimated / blinked / put in by an effect) reads
  // false, never true, so the sweep does not fire for free. Same fail-safe direction as wasCast, and it
  // matters more here: these are board wipes.
  // DESCEND (CR 700.11) — "if you descended this turn": a PERMANENT CARD was put into your graveyard from
  // anywhere this turn. Read off the per-player `descendedThisTurn` tally that recordGraveyardEvents stamps
  // at the single graveyard-entry chokepoint, reset for every seat at untap alongside gyEnteredThisTurn.
  //
  // ⛔ NARROWER than the gyEnteredThisTurn tally sitting beside it: an instant or sorcery hitting the
  // graveyard raises that counter and is NOT a descend, and a dying TOKEN is not a card at all (CR 111.7).
  // Reading the wrong tally would fire every carrier off a cantrip — all of these are end-step riders on
  // permanents that are meant to reward actually losing permanents.
  //
  // An absent tally (a seat that has not descended, or a state predating the stamp) reads 0 → false, never
  // null: "has not descended" is a KNOWN answer, not an unconfirmable one, so the trigger correctly does
  // not fire rather than parking on the Arbiter. A missing SEAT is already handled by this function's
  // opening guard (controller gone → false, "condition unmet"), so there is no seat check here — an added
  // one would be dead code, and its first draft documented a null return this function never makes.
  if (/^you descended this turn$/.test(c)) return (state.players[controllerId].descendedThisTurn || 0) > 0;
  // ===== ELIDED-SUBJECT CONJUNCTION ===== "if you control an artifact and an enchantment" (Naomi, Pillar of
  // Order; Kami of Terrible Secrets). The printed English drops the repeated subject: it means "you control
  // an artifact AND you control an enchantment", so the second half is the bare noun "an enchantment" and is
  // NOT a condition on its own.
  //
  // ⛔ THAT IS WHY THIS IS NOT A GENERIC " and " SPLITTER. Measured across the corpus: all 18 AND-shaped
  // unparseable conditions have a half that does not read standalone, so a generic splitter is worth
  // exactly ZERO — and it would be actively dangerous, because several conditions carry an " and " that is
  // INTERNAL and must never be split ("your devotion to white and black is seven or greater", "you gained
  // and lost life this turn", "three or more instant and sorcery spells"). Splitting those would evaluate
  // nonsense halves and answer confidently.
  //
  // So: whole-clause anchored on the ONE shape that elides a "you control" subject, with each half rebuilt
  // into a full condition and handed back to this same evaluator — which re-gates the noun against the
  // curated type/subtype vocabulary (a designation like "a commander" is refused there, not here). Either
  // half unreadable → null, never a silent false.
  {
    const conj = c.match(/^you control (an? [a-z]+) and (an? [a-z]+)$/);
    if (conj) {
      const left = evaluateSingleCondition(state, `you control ${conj[1]}`, controllerId, context);
      if (left === null) return null;
      const right = evaluateSingleCondition(state, `you control ${conj[2]}`, controllerId, context);
      if (right === null) return null;
      return left && right;
    }
  }
  if (/^you cast (?:it|this creature|this permanent) from your hand$/.test(c)) {
    const triggeringId = context?.triggeringPermanentId;
    if (!triggeringId) return null;
    const board = controllerBoard(state, controllerId);
    const entering = board.find((p) => p.id === triggeringId);
    if (!entering) return null;
    return entering.wasCast === true && entering.castFromZone === "hand";
  }
  // CAST DURING YOUR MAIN PHASE (SHELF-85 · Light-Paws L4 Sentinel's Mark, 2026-09-05 — the Addendum: "When this Aura
  // enters, if you cast it during your main phase, …"): the triggering permanent's `castDuringMainPhase` stamp, written at
  // the cast chokepoint (the caster is the active player and the phase is a main phase, CR 505.1) and carried onto the
  // entering permanent by the cast resolvers. A permanent that arrived any other way carries no stamp and reads false.
  if (/^you cast (?:it|this creature|this permanent|this aura) during your main phase$/.test(c)) {
    const triggeringId = context?.triggeringPermanentId;
    if (!triggeringId) return null;
    const board = controllerBoard(state, controllerId);
    const entering = board.find((p) => p.id === triggeringId);
    if (!entering) return null;
    return entering.wasCast === true && entering.castDuringMainPhase === true;
  }
  // ⭐ ENTERED-OR-CAST FROM THE LIBRARY (SHELF-85 K9, 2026-09-04 — Fblthp "If it entered from your library or was cast from
  // your library, draw two cards instead"): the entering permanent's two stamps — `castFromZone` (the cast lane's zone,
  // "library" for the play-from-top lane) and `enteredFromZone` (enterCardFromZone's, for a put-onto-battlefield). A
  // permanent that arrived any other way carries neither and reads false; no referent → null (unreadable).
  if (/^it entered from your library or was cast from your library$/.test(c)) {
    const triggeringId = context?.triggeringPermanentId;
    if (!triggeringId) return null;
    const entering = controllerBoard(state, controllerId).find((p) => p.id === triggeringId);
    if (!entering) return null;
    return entering.castFromZone === "library" || entering.enteredFromZone === "library";
  }

  // X-VALUE THRESHOLD (CR 608.2h) — "x is N or more": read the paid {X} threaded into THIS trigger's
  // context (ctx.xValue, stamped by checkEnterTriggers from enteredPerm.xValue). A definite number for the
  // life of the trigger, so it compares identically at flush AND resolution (CR 603.4 second check). An
  // absent/non-numeric xValue (a non-X entry, or the amount unthreaded) → null (can't confirm → FN-safe,
  // never fail-open — the trigger stays unrouted). This is what gates Ravenous's "draw a card" on X≥5.
  {
    const xm = c.match(X_THRESHOLD_RE);
    if (xm) {
      const x = context?.xValue;
      if (typeof x !== "number") return null; // no X in context → can't confirm (FN-safe)
      return x >= parseInt(xm[1], 10);
    }
  }

  // TRIBUTE ETB (CR 702.96e) — "tribute wasn't paid" / "tribute was paid": read the entering permanent's
  // tributePaid flag (a per-PERMANENT decision flag, stamped by resolvers.enterPermanent as perm.tributePaid
  // = true when an opponent paid tribute / false when every opponent declined, set AS the creature entered).
  // Keyed on the entering permanent (ctx.triggeringPermanentId) like KICKED_ETB, so it reads identically at
  // flush (the permanent is on the battlefield when ETB triggers flush) AND resolution (CR 603.4 second check).
  // A definite boolean once tribute resolves; an unstamped flag (a non-tribute permanent, or the entering
  // permanent already gone) → null (can't confirm → FN-safe, never fail-open — the trigger stays unrouted).
  if (TRIBUTE_NOT_PAID_RE.test(c) || TRIBUTE_PAID_RE.test(c)) {
    const triggeringId = context?.triggeringPermanentId;
    if (!triggeringId) return null; // no entering permanent in context → can't confirm (FN-safe; never fail-open)
    const board = controllerBoard(state, controllerId);
    const entering = board.find((p) => p.id === triggeringId);
    if (!entering || typeof entering.tributePaid !== "boolean") return null; // not a resolved-tribute permanent → can't confirm (FN-safe)
    return TRIBUTE_NOT_PAID_RE.test(c) ? entering.tributePaid === false : entering.tributePaid === true;
  }

  // NOT-A-TOKEN (CR 111.7) — "it's not a token" / "it isn't a token": read the triggering (dead, for a self-
  // dies trigger) object's token-ness off the context flag (ctx.triggeringCardIsToken, stamped by
  // makePendingTrigger as !!triggeringPermanent.card.token). NOT a board scan — the object may be in a
  // graveyard by now, so its captured token status (fixed at the death look-back) is the only faithful read,
  // and it's identical at flush AND resolution (CR 603.4 second check). A definite boolean once the trigger
  // fires; an undefined flag (no context / not a per-object trigger) → null (can't confirm → FN-safe).
  if (NOT_A_TOKEN_RE.test(c)) {
    const isToken = context?.triggeringCardIsToken;
    if (typeof isToken !== "boolean") return null; // no per-object token flag in context → can't confirm (FN-safe)
    return isToken === false; // "it's not a token" → true iff the triggering object was NOT a token
  }

  // WAS-A-CREATURE (CR 603.6e) — "it was a creature": read the dying object's captured creature-ness off the
  // context flag (ctx.triggeringWasCreature, stamped by checkDiesTriggers from the death look-back type line).
  // NOT a board scan — the object is in a graveyard by now, so its last-known creature-ness (fixed at the death
  // look-back) is the only faithful read, identical at flush AND resolution (CR 603.4 second check). A definite
  // boolean once the dies trigger fires; an undefined flag (no context / not a per-object dies trigger) → null
  // (can't confirm → FN-safe, never fail-open).
  if (WAS_A_CREATURE_RE.test(c)) {
    const wasCreature = context?.triggeringWasCreature;
    if (typeof wasCreature !== "boolean") return null; // no per-object was-creature flag → can't confirm (FN-safe)
    return wasCreature === true; // "it was a creature" → true iff the dying object was a creature
  }

  // HAD-NO-+1/+1-COUNTERS (KW-UNDYING, CR 702.92a + 603.6e) — read the dying object's counter-lessness off
  // the context flag (ctx.triggeringHadNoPlusCounters, stamped by checkDiesTriggers from the death
  // look-back's counters snapshot). NOT a board scan — the object is in a graveyard by now. A definite
  // boolean once the dies trigger fires from a stamped look-back; undefined (no snapshot / not a dies
  // trigger) → null (can't confirm → FN-safe drop, never a fail-open return).
  if (HAD_NO_PLUS_COUNTERS_RE.test(c)) {
    const hadNone = context?.triggeringHadNoPlusCounters;
    if (typeof hadNone !== "boolean") return null; // no per-object counters snapshot → can't confirm (FN-safe)
    return hadNone === true; // "it had no +1/+1 counters on it" → true iff the LKI showed none
  }
  // KW-PERSIST (BLITZ PS-1, CR 702.79a) — the -1/-1 mirror of the undying branch above, same LKI discipline.
  if (HAD_NO_MINUS_COUNTERS_RE.test(c)) {
    const hadNone = context?.triggeringHadNoMinusCounters;
    if (typeof hadNone !== "boolean") return null; // no per-object counters snapshot → can't confirm (FN-safe)
    return hadNone === true;
  }
  // HAD-ANY-COUNTERS (The Ozolith, W2) — the any-kind positive twin, read off the LEAVE look-back.
  if (HAD_ANY_COUNTERS_RE.test(c)) {
    const had = context?.triggeringHadCounters;
    if (typeof had !== "boolean") return null;     // no leave snapshot in context → can't confirm (FN-safe)
    return had === true;
  }

  // LIFE-COMPARISON (BLITZ SC-1 — Sword Coast Sailor / the background quartet: "no opponent has more life
  // than that player"): "that player" = the ATTACKED player (ctx.defenderId, threaded by
  // checkAttackTriggers); true iff every opponent OF THE TRIGGER'S CONTROLLER has life ≤ that player's.
  // A planeswalker attack (ctx.defenderPlaneswalkerId set) is NOT "attacks a player" — FN-drop (null),
  // never a mis-fire; likewise a missing referent (a non-attack event).
  if (/^no opponent has more life than that player$/.test(c)) {
    if (context?.defenderPlaneswalkerId) return null; // a pw attack isn't "attacks a player" (CR)
    const pid = context?.defenderId;
    if (!pid || !state?.players?.[pid]) return null;  // no attacked-player referent → can't confirm
    const targetLife = state.players[pid].life;
    for (const [id, pl] of Object.entries(state.players)) {
      if (id === controllerId) continue;              // "no OPPONENT" — the controller's own life is irrelevant
      if ((pl?.life ?? 0) > targetLife) return false;
    }
    return true;
  }

  // TRAINING (CR 702.148a, census slice 52) — "Whenever this creature attacks WITH ANOTHER CREATURE WITH
  // GREATER POWER, put a +1/+1 counter on this creature."
  //
  // The comparison is against the OTHER ATTACKERS in this combat, not the whole board: a bigger creature
  // sitting at home does not train anything. So it reads state.combat.attackers, excludes the source itself,
  // and compares layer-aware power (counters, anthems, Auras and Equipment all count on both sides — a
  // trainee whose power is being pumped mid-combat must stop qualifying, and does).
  if (/^another attacking creature has greater power$/.test(c)) {
    const sourceId = context?.sourcePermanentId;
    if (!sourceId) return null;                       // no source referent → can't confirm (FN-safe)
    const byId = new Map();
    for (const pid of Object.keys(state.players || {})) {
      for (const p of state.players[pid]?.battlefield || []) byId.set(p.id, p);
    }
    const source = byId.get(sourceId);
    if (!source) return null;                         // source left the battlefield → can't confirm
    const srcPower = creaturePower(source, state);
    for (const a of state.combat?.attackers || []) {
      if (a.permanentId === sourceId) continue;       // "ANOTHER" — never itself
      const other = byId.get(a.permanentId);
      if (other && creaturePower(other, state) > srcPower) return true;
    }
    return false;
  }

  // DETHRONE (CR 702.104a, census slice 46) — "attacks the player with the most life or tied for most life".
  //
  // Deliberately NOT the SC-1 branch above, though the two look alike. Sword Coast Sailor asks whether no
  // OPPONENT has more life than the attacked player; dethrone asks whether that player has the most life
  // among ALL players, the attacking player INCLUDED. The difference is live in a pod: at 40 life attacking
  // an opponent on 30 while a third sits on 20, SC-1's question answers yes and dethrone's answers NO —
  // you are the one on the throne. Reusing that branch would have put counters on the wrong board states.
  //
  // A planeswalker attack is not "attacks a player" (CR) → null, an FN-drop rather than a mis-fire.
  if (/^that player has the most life or is tied for most life$/.test(c)) {
    if (context?.defenderPlaneswalkerId) return null;
    const pid = context?.defenderId;
    if (!pid || !state?.players?.[pid]) return null;  // no attacked-player referent → can't confirm (FN-safe)
    const targetLife = state.players[pid].life;
    for (const pl of Object.values(state.players || {})) {
      if ((pl?.life ?? 0) > targetLife) return false; // ALL players, controller included — "or tied" allows ==
    }
    return true;
  }

  // POWER-DIFFERED-FROM-BASE (Jason Bright, CR 603.6e) — read the dying object's effective-vs-base power
  // comparison off the context flag (stamped by checkDiesTriggers from the death look-back's power +
  // basePower captures). Undefined (an unstamped death path / not a dies trigger) → null (FN-safe).
  if (POWER_DIFFERED_RE.test(c)) {
    const differed = context?.triggeringPowerDifferedFromBase;
    if (typeof differed !== "boolean") return null; // no per-object power snapshot → can't confirm (FN-safe)
    return differed === true;
  }

  // IN-YOUR-GRAVEYARD (CR 603.3d) — the source card must be in the CONTROLLER's graveyard right now (a
  // live scan, not a snapshot — the zone can change between flush and resolution, CR 603.4).
  if (IN_YOUR_GRAVEYARD_RE.test(c)) {
    const cardId = context?.sourceCardId;
    if (!cardId) return null; // no source-card thread → can't confirm (FN-safe)
    return (state.players[controllerId]?.graveyard || []).some((card) => card.id === cardId);
  }

  // "you control no <filter>"  → count == 0
  // ===== GREATEST POWER ON THE BATTLEFIELD ===== "you control a creature with the greatest power among
  // creatures on the battlefield" (High Score) and "you control the creature with the greatest power or tied
  // for the greatest power" (7 corpus carriers between them). Both wordings are the SAME question — does the
  // controller control a creature whose power ties or beats every creature on the battlefield — so they
  // share one reader rather than two near-identical ones. "Greatest" INCLUDES ties in both framings, which is
  // why the comparison is >= against the board maximum rather than a strict >.
  //
  // Layer-aware on both sides via creaturePower: an anthem that lifts an opponent's creature past mine
  // flips this condition, exactly as it would at a real table. An EMPTY battlefield is false, not null —
  // "you control a creature with…" cannot be satisfied when you control no creature, and that is a definite
  // answer rather than an unreadable one.
  if (GREATEST_POWER_RE.test(c)) {
    const everyone = [];
    for (const pid of Object.keys(state.players || {})) {
      for (const p of controllerBoard(state, pid)) if (isCreaturePermLocal(p)) everyone.push({ p, pid });
    }
    if (!everyone.length) return false;
    const max = Math.max(...everyone.map(({ p }) => creaturePower(p, state)));
    return everyone.some(({ p, pid }) => pid === controllerId && creaturePower(p, state) >= max);
  }
  // GREATEST MANA VALUE AMONG ARTIFACTS (Padeem) — every artifact on the battlefield, any controller; true when one of
  // the controller's artifacts reaches the maximum (a tie counts, as printed). No artifacts anywhere → false. An artifact by a
  // layer-4 effect (#511 — a Torqued creature) is one of them, on either side of the comparison.
  if (GREATEST_ARTIFACT_MV_RE.test(c)) {
    const everyone = [];
    for (const pid of Object.keys(state.players || {})) {
      for (const p of controllerBoard(state, pid)) if (/\bArtifact\b/.test(typeStr(p.card)) || permanentHasCardType(state, p.id, "Artifact")) everyone.push({ p, pid });
    }
    if (!everyone.length) return false;
    const max = Math.max(...everyone.map(({ p }) => manaValueOfCardLocal(p.card)));
    return everyone.some(({ p, pid }) => pid === controllerId && manaValueOfCardLocal(p.card) >= max);
  }

  // ORDERING: this sits ABOVE the generic "you control <N> <filter>" family on purpose. That matcher
  // matches "you control A creature with the greatest power among…", fails to parse the filter, and
  // returns null — swallowing this shape before it is ever reached. Anchored first, it wins its own
  // exact wording and the generic family is unchanged for everything else.
  // ⭐ SOURCE-EXCLUDING "no <filter>" (CR 113.7 / 109.5) — "you control no OTHER creatures" (the Hermit /
  // lone-creature payoffs), "you control no other colorless creatures", and the equivalent printed as a
  // trailing exclusion: "you control no Thopters OTHER THAN this creature". The incumbent arm below already
  // counts a filtered board to zero; the only new thing is dropping the ability's own source from the count.
  //
  // ⛔ FAIL-CLOSED WITHOUT A SOURCE, matching the `notSource` target-restriction precedent. If the referent is
  // unknown we cannot exclude it, and answering from the unexcluded count would say FALSE on a board where the
  // source is the only match — suppressing an ability whose printed condition is TRUE. So: null → Arbiter.
  // Placed ABOVE the incumbent so "no other creatures" cannot be shaved to the filter "other creatures"
  // (parseFilter strips "other" as filler, which would silently drop the exclusion entirely — the same trap
  // the mass-damage recipient delegation hit one slice earlier).
  // "you DON'T control ANOTHER <filter>" joined 2026-08-14 (Pugnacious Hammerskull's attacks-while
  // condition) — the same source-excluding zero-count, third printed spelling.
  let m = c.match(/^you control no other (.+)$/) || c.match(/^you control no (.+?) other than this [a-z]+$/) || c.match(/^you don't control another (.+)$/);
  if (m) {
    const filter = parseFilter(m[1]);
    if (!filter) return null;
    const sourceId = context?.sourcePermanentId;
    if (!sourceId) return null;
    return controllerBoard(state, controllerId)
      .filter((p) => p.id !== sourceId && permMatchesFilter(p, filter, state)).length === 0;
  }

  m = c.match(/^you control no (.+)$/) || c.match(/^you don't control (?:a|an|any) (.+)$/);
  if (m) {
    const filter = parseFilter(m[1]);
    if (!filter) return null;
    return controllerBoard(state, controllerId).filter((p) => permMatchesFilter(p, filter, state)).length === 0;
  }

  // OPPONENT-SCOPED zero (CR 104.3a) — "your opponents control no creatures". Universal across opponents, not
  // existential: the phrase is only satisfied when EVERY opponent's board is empty of the filter, which is why
  // this reads as a total over all opposing battlefields rather than a `.some()`.
  m = c.match(/^your opponents control no (.+)$/);
  if (m) {
    const filter = parseFilter(m[1]);
    if (!filter) return null;
    return Object.keys(state.players || {})
      .filter((pid) => pid !== controllerId)
      .every((pid) => (state.players[pid]?.battlefield || []).filter((p) => permMatchesFilter(p, filter, state)).length === 0);
  }

  // DAMAGE-RIDER (2026-08-14 — Marauding Raptor): "the triggering creature is a <subtype> dealt damage
  // by this source" — a SENTINEL phrase only the ETB entering-creature rewrite produces (no card prints
  // it). TRUE iff the triggering permanent is on a battlefield, its damagedBy list contains THIS source
  // (recordDamageSource stamps it; prevention shields skip the stamp — so this is the honest CR "dealt
  // damage this way", never subtype-alone), AND its type line carries the subtype. Fail-closed: a
  // missing referent (either id, or the permanent already gone) → null → the conditional rejects.
  m = c.match(/^the triggering creature is an? ([a-z]+) dealt damage by this source$/);
  if (m) {
    const tid = context?.triggeringPermanentId;
    const sid = context?.sourcePermanentId;
    if (!tid || !sid) return null;
    let perm = null;
    for (const pid of Object.keys(state.players || {})) {
      perm = (state.players[pid]?.battlefield || []).find((p) => p.id === tid) || perm;
    }
    if (!perm) return false; // the entering creature already left — it was not "dealt damage this way" in any live sense
    const typeLine = String(perm.card?.type || perm.card?.type_line || "").toLowerCase();
    const hasSubtype = new RegExp(`\\b${m[1]}\\b`).test(typeLine)
      || permIsEveryCreatureType(state, perm.id); // P·39 — every creature type is a Dinosaur too
    const wasDamagedBySource = (perm.damagedBy || []).includes(sid);
    return hasSubtype && wasDamagedBySource;
  }

  // BONEHOARD (2026-08-14) — "you exiled a land/nonland card this way": reads the transient stamp the
  // impulse-exile resolver writes (overwritten per impulse; the emitting fold places the impulse atom
  // first in the same program, so the read is always fresh). No stamp at all → null (fail-closed — the
  // condition only exists behind the fold's sentinel, so a stampless read means a broken program).
  m = c.match(/^you exiled a (land|nonland) card this way$/);
  if (m) {
    const stamp = state?._impulseExiledTypes;
    if (!stamp) return null;
    return m[1] === "land" ? !!stamp.land : !!stamp.nonland;
  }

  // BETOR (2026-08-14) — "creatures you control have total toughness N or greater": the LAYER-AWARE
  // toughness SUM across the controller's creatures (pumps/counters/anthems count — creatureToughness
  // reads the live board at resolution, the powerAtLeast discipline). An empty board sums 0 (a definite
  // false against any printed N — the parseable probe needs no extra field).
  m = c.match(/^creatures you control have total toughness (\d+) or greater$/);
  if (m) {
    const need = parseInt(m[1], 10);
    let total = 0;
    for (const perm of controllerBoard(state, controllerId)) {
      if (isCreaturePermLocal(perm)) total += creatureToughness(perm, state);
    }
    return total >= need;
  }

  // "you control a/an/<N> [or more|or fewer|or less] [other] <filter>"
  //
  // LANDS-TIER EXTENSIONS (2026-09-02 — the "enters tapped unless …" family, 107 corpus lands):
  //   · "or fewer" / "or less" → a ≤ comparator (the 11 fast lands: "unless you control two or fewer other
  //     lands"). Previously only "or more" parsed, so those conditions were unreadable.
  //   · "OTHER" → the entering / source permanent is EXCLUDED from the count (CR 109.5). At land entry the
  //     land itself is already on the battlefield (the play-land path pushes it first), so "two or more
  //     other lands" MUST not count it — that is the difference between a fast land entering untapped on
  //     turn three and on turn two. The excluded id is threaded as context.sourcePermanentId (the same key
  //     the equip-cost site already passes) with triggeringPermanentId as the trigger-side fallback.
  //     ⛔ Fail closed: "other" with NO id to exclude → null → not evaluable (a count that might include the
  //     object itself is the over-count FP), which is also what keeps the parseable probe honest.
  // ===== LANDS WITH DIFFERENT NAMES (SHELF-85 Phase 2 · T3, 2026-09-04 — Field of the Dead "if you control seven or more
  // lands with different names") ===== the number of DISTINCT card names among the controller's battlefield lands
  // (land-ness read off the live type line — an animated land is still a land; a non-land never counts), compared to the
  // printed threshold. Sits ABOVE the generic "you control <N> <filter>" family below, which would swallow "lands with
  // different names" as an unparseable filter and return null. Whole-clause anchored.
  m = c.match(new RegExp(`^you control ${NUM_RE} or more lands with different names$`));
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    const names = new Set();
    for (const perm of state?.players?.[controllerId]?.battlefield || []) {
      if (/\bLand\b/.test(String(perm?.card?.type || perm?.card?.type_line || ""))) names.add(String(perm.card?.name || ""));
    }
    names.delete("");
    return names.size >= n;
  }
  m = c.match(new RegExp(`^you control ${NUM_RE}(?: or (more|fewer|less))? (other )?(.+)$`));
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    const cmp = m[2] === "fewer" || m[2] === "less" ? "le" : "ge";
    const other = !!m[3];
    const filter = parseFilter(m[4]);
    if (!filter) return null;
    const excludeId = other ? (context?.sourcePermanentId ?? context?.triggeringPermanentId ?? null) : null;
    if (other && !excludeId) return null;
    const count = controllerBoard(state, controllerId)
      .filter((p) => !(other && p.id === excludeId) && permMatchesFilter(p, filter, state)).length;
    return cmp === "le" ? count <= n : count >= n;
  }

  // ===== OPPONENT COUNT (CR 800.1 — the multiplayer-gated cycle) ===== "you have N or more opponents"
  // (Spectator Seating and the Battlebond/Commander land cycle — 10 corpus lands: "enters tapped unless you
  // have two or more opponents"). A live seat count, never a board scan: opponentIds() is every seat that is
  // not the controller, so a two-player game reads 1 and a four-seat pod reads 3. On the single-seat probe
  // board this is 0 → a definite false, which is exactly what interveningIfParseable needs.
  m = c.match(new RegExp(`^you have ${NUM_RE} or more opponents$`));
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    return opponentIds(state, controllerId).length >= n;
  }

  // ===== ANY-PLAYER LIFE THRESHOLD ===== "a player has N or less life" (the Ixalan/Outlaws "13 or less"
  // land cycle, 10 corpus lands). EXISTENTIAL over ALL seats INCLUDING the controller (CR 104.3a — "a player"
  // is any player), which is what separates it from CTRL_LIFE_THRESHOLD ("you have …") and OPP_HAS_MORE
  // ("an opponent has …"). A missing life field reads 0 (the probe board), a definite boolean either way.
  m = c.match(new RegExp(`^a player has ${NUM_RE} or (?:less|fewer) life$`));
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    return Object.values(state?.players || {}).some((pl) => (pl?.life || 0) <= n);
  }

  // ===== OPPONENTS' COLLECTIVE COUNT ===== "your opponents control N or more <filter>" (the "eight or more
  // lands" cycle, 5 corpus lands). "Your opponents control" is the SUM across every opponent (CR 800.1 —
  // a plural-subject count, not the per-opponent existential OPP_CONTROLS_N reads). Same parseFilter /
  // permMatchesFilter machinery, so type / subtype / union filters all work; a malformed filter → null.
  m = c.match(new RegExp(`^your opponents control ${NUM_RE} or more (.+)$`));
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    const filter = parseFilter(m[2]);
    if (!filter) return null;
    const total = opponentIds(state, controllerId)
      .reduce((sum, oid) => sum + (state.players[oid]?.battlefield || []).filter((p) => permMatchesFilter(p, filter, state)).length, 0);
    return total >= n;
  }

  // ===== CORRUPTED (CR 122 / 704.5c) ===== "an opponent has <N> or more poison counters" — the dominant
  // printed form by a wide margin (17 of the 23 poison-conditioned clauses in the corpus). Existential
  // across opponents (CR 104.3a): ANY one opponent at or past the threshold satisfies it. Reads the poison
  // track that already exists on player state — the same one infect/toxic damage feeds.
  //
  // DELIBERATELY UNMATCHED, each a distinct SHAPE rather than a wording variant:
  //   "its controller has …"  — needs a triggering object to resolve "its"; no such thread on this lane.
  //   "you control three or more artifacts AND an opponent has …" — a CONJUNCTION. This vocabulary reads a
  //                             single clause, and half-evaluating a compound is a false positive, not a
  //                             partial credit.
  //   "target player has FEWER than nine …" / "you have more …" — different comparator and scope.
  // Each falls through to null → Arbiter (CREED — false-negative safe).
  m = c.match(new RegExp(`^an opponent has ${NUM_RE} or more poison counters$`));
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    return opponentIds(state, controllerId).some((oid) => (state.players[oid]?.poison || 0) >= n);
  }

  // ===== DELIRIUM (CR 702.9a's sibling ability word) ===== "[there are] <N> or more card types among cards
  // in your graveyard". Counts DISTINCT card types across the whole graveyard, not cards — one
  // "Artifact Creature — Golem" contributes TWO. Only the type line's head (before the em dash) is read, so
  // a SUBTYPE never counts as a type. Kindred and Tribal are the same card type under two printed names
  // (CR 205.2a), so they fold to one entry rather than double-counting a graveyard holding both.
  // CEPHALID COLISEUM (KN-4): threshold — "Activate only if there are seven or more cards in your graveyard" (CR 702.x-era
  // ability word; the count is YOUR graveyard, read at activation).
  m = c.match(new RegExp(`^(?:there are )?${NUM_RE} or more cards in your graveyard$`));
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    return (state.players?.[controllerId]?.graveyard || []).length >= n;
  }
  m = c.match(new RegExp(`^(?:there are )?${NUM_RE} or more card types among cards in your graveyard$`));
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    return cardTypesInGraveyard(state, controllerId) >= n;
  }

  // ===== FORMIDABLE (CR 702.113a) ===== "creatures you control have total power <N> or greater". Layer-aware
  // (counters + anthems count) via the same creaturePower reader every other power comparison here uses, so
  // an anthem effect moves this condition exactly as it moves the board.
  m = c.match(new RegExp(`^creatures you control have total power ${NUM_RE} or greater$`));
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    const total = controllerBoard(state, controllerId)
      .filter((p) => isCreaturePermLocal(p))
      .reduce((sum, p) => sum + creaturePower(p, state), 0);
    return total >= n;
  }

  // "[there are|you have] <N> or more cards in your graveyard" — the UNTYPED total (the classic Threshold
  // wording, CR 702.9a, printed as an activation rider: "Activate only if there are seven or more cards in
  // your graveyard"). Distinct from the TYPED form directly below, which counts only cards whose type line
  // matches — so this one is anchored on a bare "cards" and cannot swallow "…seven or more CREATURE cards…".
  m = c.match(new RegExp(`^(?:there are|you have) ${NUM_RE} or more cards? in your graveyard$`));
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    return (state.players[controllerId].graveyard || []).length >= n;
  }

  // ⭐ THE SINGULAR FORM — "there is|there's a <type> card in your graveyard" (2026-07-30). The ≥1 case of the
  // two counters directly above and below, which had only ever been reachable through the "N or more" wording.
  // The typed scan is word-anchored against the whole type line, so a SUBTYPE comes along for free: "desert
  // card" matches "Land — Desert", "lesson card" matches "Sorcery — Lesson".
  //
  // ⚠️ IT INHERITS ITS SIBLING'S EXPOSURE, DELIBERATELY AND NOT SILENTLY: an unrecognised word becomes a
  // type-line scan that matches nothing and therefore reads FALSE forever while the shape gate says
  // "readable". The typed COUNT reader below has carried exactly that exposure since it shipped. Mirroring it
  // keeps one behaviour instead of two; diverging here (a curated allowlist on the singular arm only) would
  // mean the same phrase answered differently depending on whether it said "a" or "one or more".
  // P·39b — a card that is every creature type (a changeling; a creature card under its owner's Maskwood Nexus) is an Elf card
  // (Dawnhand Eulogist); "a Desert card" or "a creature card" is never met by it (CR 205.3d). The counted and two-type forms below
  // have no creature-type printing in the corpus and read the type line alone.
  m = c.match(/^(?:there is|there's|there are) an? ([a-z]+) card in your graveyard$/);
  if (m) {
    const singularWord = m[1].replace(/s$/, "");
    const w = singularWord.charAt(0).toUpperCase() + singularWord.slice(1);
    const re = new RegExp(`\\b${w}\\b`, "i");
    const every = CR_CREATURE_TYPES.has(singularWord.toLowerCase());
    return (state.players[controllerId].graveyard || []).some((card) => re.test(typeStr(card)) || (every && cardIsEveryCreatureType(state, card, controllerId)));
  }
  m = c.match(/^(?:there is|there's) a card in your graveyard$/);
  if (m) return (state.players[controllerId].graveyard || []).length >= 1;
  // CREATURE-CARD-TO-GRAVEYARD-THIS-TURN (SHELF-85 · Halfshell Q3 Raphael, Fiendish Savior, 2026-09-05): a LOOK-BACK, not a
  // graveyard read — the card may have left the graveyard again (reanimated, exiled) and the condition still holds. Answered
  // from the per-player turn stamp gameState.moveCardToZone writes at the graveyard chokepoint (cards only, CR 111.1 —
  // a token creature dying never counts). "Your" = the controller's graveyard.
  if (c === "a creature card was put into your graveyard from anywhere this turn") {
    const stamp = state.players[controllerId]?.creatureCardToGraveyardTurn;
    return stamp != null && stamp === state.turn;
  }
  // VOID (the 09-06 plan's stage ③ · 11, 2026-09-30 — Edge of Eternities: Insatiable Skittermaw, Kavaron Skywarden, Voidforged
  // Titan …): "a nonland permanent left the battlefield this turn or a spell was warped this turn". A LOOK-BACK over every
  // seat, answered from the global turn stamp gameState.moveCardToZone writes at the battlefield exit (any player's nonland
  // permanent, a token included). The warp half is exactly false here, not an under-read: the engine never offers a warp
  // cast (coverage's WARP note), so no spell is ever warped.
  if (c === "a nonland permanent left the battlefield this turn or a spell was warped this turn") {
    return state.nonlandLeftBattlefieldTurn != null && state.nonlandLeftBattlefieldTurn === state.turn;
  }

  // ===== TWO-TYPE CONJUNCTION (2026-08-12 — Flow State "there is an instant card and a sorcery card in
  // your graveyard") ===== BOTH singular type checks must hold, each through the SAME word-anchored
  // type-line scan the singular arm above uses (and inheriting its stated exposure the same way).
  m = c.match(/^there (?:is|are) an? ([a-z]+) card and an? ([a-z]+) card in your graveyard$/);
  if (m) {
    const gy = state.players[controllerId].graveyard || [];
    return [m[1], m[2]].every((w) => {
      const word = w.replace(/s$/, "");
      const re = new RegExp(`\\b${word.charAt(0).toUpperCase() + word.slice(1)}\\b`, "i");
      return gy.some((card) => re.test(typeStr(card)));
    });
  }

  // ===== SPELL MASTERY (CR 207.2c ability word — 2026-08-12) ===== "there are two or more instant
  // and/or sorcery cards in your graveyard" — the UNION count (a card matching EITHER type counts once;
  // the same Instant|Sorcery word-anchored read library.js's bespoke Animist's Awakening arm uses). The
  // single-type arm below can't see this phrase (its `([a-z]+)` word stops at the slash), so this arm
  // sits beside it rather than widening it.
  m = c.match(new RegExp(`^(?:there are|you have) ${NUM_RE} or more instant and/or sorcery cards? in your graveyard$`));
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    const gy = state.players[controllerId].graveyard || [];
    return gy.filter((card) => /\b(?:Instant|Sorcery)\b/i.test(typeStr(card))).length >= n;
  }

  // "[there are|you have] <N> or more <type> cards in your graveyard"
  m = c.match(new RegExp(`^(?:there are|you have) ${NUM_RE} or more ([a-z]+) cards? in your graveyard$`));
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    const singular = m[2].replace(/s$/, "");
    const word = singular.charAt(0).toUpperCase() + singular.slice(1);
    const re = new RegExp(`\\b${word}\\b`, "i");
    const gy = state.players[controllerId].graveyard || [];
    return gy.filter((card) => re.test(typeStr(card))).length >= n;
  }

  // ===== FIRST-COMBAT-OF-THE-TURN (Increment 3b, 2026-08-12 — Karlach "Whenever you attack, if it's the
  // first combat phase of the turn, …"; Scourge of the Throne's "attacks the player with the most life"
  // kin shares the tally) ===== reads the turn-stamped combat tally enterCombatPostProcess maintains at
  // EVERY beginning-of-combat entry (normal walk + both extra-phase jumps): count 1 during the turn's
  // first combat, 2+ inside the extras — so the gate closes exactly when the extra combat it granted
  // begins (the non-recursion guarantee, CR 500.8's practical shape).
  m = c.match(/^it's the first combat phase of the turn$/);
  // ⛔ the tally must EXIST before the turn compare — with both fields absent, undefined === undefined is
  // TRUE and the read crashes (caught by the first probe run; the guard order is the fix, not optional).
  if (m) return (state.combatsThisTurn && state.combatsThisTurn.turn === state.turn ? state.combatsThisTurn.count : 0) === 1;

  // "an opponent controls more <lands|creatures|artifacts|enchantments> than you"
  m = c.match(OPP_CONTROLS_MORE_RE);
  if (m) {
    const mine = controllerMetric(state, controllerId, m[1]);
    return opponentIds(state, controllerId).some((oid) => controllerMetric(state, oid, m[1]) > mine);
  }
  // "an opponent has more <life|cards in hand> than you"
  m = c.match(OPP_HAS_MORE_RE);
  if (m) {
    const mine = controllerMetric(state, controllerId, m[1]);
    return opponentIds(state, controllerId).some((oid) => controllerMetric(state, oid, m[1]) > mine);
  }

  // ⭐ THE INVERSE DIRECTION of the compare directly above — "you have more life than an opponent". Existential
  // over opponents (CR 104.3a): satisfied as soon as ONE opponent is below you.
  //
  // ⛔ NOT the negation of OPP_HAS_MORE, and that is worth stating because it looks like one. With a single
  // opponent on equal life BOTH phrases are false, so implementing either as `!other` would answer wrongly on
  // a tie. Each gets its own strict comparison in its own direction.
  m = c.match(/^you have more (life|cards in hand) than an opponent$/);
  if (m) {
    const mine = controllerMetric(state, controllerId, m[1]);
    return opponentIds(state, controllerId).some((oid) => mine > controllerMetric(state, oid, m[1]));
  }
  // "an opponent controls a/an/<N> or more <filter>" — an ABSOLUTE per-opponent board threshold (Defense of
  // the Heart "an opponent controls three or more creatures"). Anchored AFTER OPP_CONTROLS_MORE so the
  // compare-vs-you form ("more … than you") wins its exact wording first; this matches the cardinal form. TRUE
  // iff some opponent controls ≥N filter-matching permanents (existential, CR 104.3a). An unparseable filter
  // (parseFilter null) drops the whole condition → Arbiter (FN-safe, never a fabricated board read — CREED).
  m = c.match(OPP_CONTROLS_N_RE);
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    const filter = parseFilter(m[2]);
    if (!filter) return null;
    return opponentIds(state, controllerId).some((oid) =>
      controllerBoard(state, oid).filter((p) => permMatchesFilter(p, filter, state)).length >= n);
  }

  // "you have N or {less|fewer|more} life" — the controller's own life vs a fixed threshold (Convalescent
  // Care, Convalescence). Pure player.life compare (CR 603.4), layer-irrelevant, read identically at flush
  // AND resolution. "less"/"fewer" → ≤ N; "more" → ≥ N.
  m = c.match(CTRL_LIFE_THRESHOLD_RE);
  if (m) {
    const threshold = parseInt(m[1], 10);
    const life = controllerMetric(state, controllerId, "life");
    return m[2] === "more" ? life >= threshold : life <= threshold;
  }

  // EXACT life total — "you have exactly 1 life". Not expressible as a one-sided threshold, so its own anchor.
  m = c.match(CTRL_LIFE_EXACT_RE);
  if (m) return controllerMetric(state, controllerId, "life") === parseInt(m[1], 10);

  // KW-ENGINES MAX SPEED (CR 702.179d) — "your speed is 4": the condition the "Max speed —" ability
  // prefix rewrites into (effects/abilities.js). Reads the live player speed; a player with no speed
  // has 0 and fails. Exact anchor — no printed card words a speed threshold any other way.
  if (/^your speed is 4$/.test(c)) return (state.players?.[controllerId]?.speed || 0) >= 4;

  // HAND COUNT, all three directions. The bare form ("you have a card in hand", "you have three cards in hand")
  // is the ≥N reading: a hand of five satisfies "you have a card in hand". "or fewer/less" flips it, and the
  // ZERO case keeps its own exact anchor above this one, so that incumbent is untouched.
  m = c.match(CTRL_HAND_THRESHOLD_RE);
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    const held = controllerMetric(state, controllerId, "cards in hand");
    return (m[2] === "less" || m[2] === "fewer") ? held <= n : held >= n;
  }

  // LIBRARY COUNT — "you have 200 or more cards in your library" (Battle of Wits). One integer off live state.
  m = c.match(CTRL_LIBRARY_THRESHOLD_RE);
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    const lib = (state?.players?.[controllerId]?.library || []).length;
    return m[2] === "more" ? lib >= n : lib <= n;
  }

  // ===== TURN-EVENT HISTORY (CR 700.4) ===== "[a creature | N or more creatures] died this turn" — read off
  // the per-turn creature-death tally (gameState.creaturesDiedThisTurn per seat, bumped at the death chokepoint).
  // "a creature died this turn" is the ≥1 case; the cardinal form ("three or more creatures died this turn")
  // compares the ALL-SEATS death total to N (CR 700.4 — any player's creature dying counts). Evaluated at flush
  // AND resolution like every other intervening-if; the counter resets for all seats at untap, so it reads the
  // current turn's deaths only. A subtype-scoped ("a Zubera died") or "an opponent's creature died" variant
  // fails the anchor → falls through → null → Arbiter (CREED — never a mis-scoped death count).
  m = c.match(/^a creature died this turn$/);
  if (m) return deathsThisTurnTotal(state) >= 1;
  m = c.match(new RegExp(`^${NUM_RE} or more creatures died this turn$`));
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    return deathsThisTurnTotal(state) >= n;
  }

  // ===== ATTACKED-THIS-TURN (RAID, CR 508.1) ===== "you attacked this turn" — read off the controller's
  // per-turn attackedThisTurn flag (stamped when they declare an attacker in actionDispatcher.applyDeclareAttacker,
  // reset for all seats at untap). A per-CREATURE variant ("this creature attacked this turn"), a "with a
  // creature" qualifier, or a negated form fails the anchor → null → Arbiter (CREED — never a mis-scoped Raid read).
  if (/^you attacked this turn$/.test(c)) return state?.players?.[controllerId]?.attackedThisTurn === true;
  // ===== SACRIFICED-THIS-TURN (SHELF-85 · Bumble F6 Elanor Gardner, 2026-09-05) ===== "you sacrificed a Food this turn" /
  // "you've sacrificed a permanent this turn" — read off the controller's per-turn sacrifice memo (stamped at the
  // sacrifice chokepoint, reset at turn start). A word is matched word-bounded against each sacrificed card's type
  // line ("Food" on "Token Artifact — Food", "creature" on any creature); "permanent" = any sacrifice. An empty or
  // absent memo reads FALSE (not null) — so the parseable probe admits the shape and an untouched turn is simply "no".
  const sacM = c.match(/^you(?:'ve| have)? sacrificed (?:a|an|one or more) ([a-z]+?)s? this turn$/);
  if (sacM) {
    const list = state?.players?.[controllerId]?.sacrificedThisTurn || [];
    if (sacM[1] === "permanent") return list.length > 0;
    const re = new RegExp(`\\b${sacM[1]}\\b`, "i");
    return list.some((e) => re.test(String(e?.type || "")));
  }
  // MINAS TIRITH (SHELF-85 · Otharri O7, 2026-09-05): "you attacked with N or more creatures this turn" — the RAID flag
  // generalised to a COUNT, read off the per-permanent attacked-this-turn memo (KT-1) over the controller's battlefield.
  // A creature that attacked and left the battlefield is not counted — a lower bound, the false-negative-safe side.
  m = c.match(new RegExp(`^you attacked with ${NUM_RE} or more creatures this turn$`));
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    const attacked = (state?.players?.[controllerId]?.battlefield || []).filter((p) => p.attackedThisTurn === true).length;
    return attacked >= n;
  }

  // ===== YOUR FIRST THREE TURNS (V2, 2026-09-04 — Starting Town "This land enters tapped unless it's your first,
  // second, or third turn of the game") ===== read off the controller's own turn ordinal (player.turnsTaken, stamped at
  // the untap step of each of that seat's turns; 0 before the first untap counts as the first turn). The exact printed
  // list only — "first turn", "second or third" and every other span fail the anchor → null → Arbiter (CREED).
  if (/^it's your first, second, or third turn of the game$/.test(c)) return (state?.players?.[controllerId]?.turnsTaken || 0) <= 3;

  // ===== CARDS-DRAWN-THIS-TURN (SHELF-85 V5, 2026-09-04 — Proft's Eidetic Memory "At the beginning of combat on your
  // turn, if you've drawn more than one card this turn, …") ===== read off the controller's own per-turn draw tally
  // (player.cardsDrawnThisTurn — bumped at the one draw chokepoint, drawCards; reset for every seat at untap — the same
  // field the "draw your second card each turn" triggers read). "more than one" only; a numeric or opponent-scoped
  // variant fails the anchor → null → Arbiter (CREED — never a mis-scoped draw-count read).
  if (/^you've drawn more than one card this turn$/.test(c)) return (state?.players?.[controllerId]?.cardsDrawnThisTurn || 0) > 1;

  // ===== SECOND RESOLUTION THIS TURN (SHELF-85 V10, 2026-09-04 — Scythecat Cub "If this is the second time this ability
  // has resolved this turn, double … instead") ===== read off the per-turn ledger gameEngine keeps for triggered
  // abilities (`abilityResolutionsThisTurn`, keyed by the ability key the flush stamps into the trigger context and bumped
  // AFTER each resolution), so during a resolution the count is the number of PRIOR resolutions: "second time" = exactly
  // one. No key in the context (a spell, the parse-time probe) → false — the printed base half runs, the FN-safe side.
  // CARPET OF FLOWERS (POD-SIM THREE · KT-10a, 2026-09-05): "if you haven't added mana with this ability this turn" — a
  // per-ability, per-turn latch. The add-mana resolver stamps `manaAddedByAbilityThisTurn[abilityKey] = turn` when it runs
  // under a trigger context carrying the key; the stamp is cleared at untap. No key (an unkeyed caller) → false, fail closed.
  if (/^you haven't added mana with this ability this turn$/.test(c)) {
    const key = context?.abilityKey;
    if (!key) return false;
    const rec = state?.manaAddedByAbilityThisTurn?.[key];
    return !(rec && rec.turn === state?.turn);
  }
  if (/^this is the second time this ability has resolved this turn$/.test(c)) {
    const key = context?.abilityKey;
    if (!key) return false;
    const rec = state?.abilityResolutionsThisTurn?.[key];
    return !!rec && rec.turn === state?.turn && rec.n === 1;
  }

  // ===== SPELLS-CAST-THIS-TURN (CR 700.4) ===== "you've cast [a|N or more] spell(s) this turn" — read off the
  // controller's per-turn spellsCastThisTurn counter (bumped at the cast chokepoint, TRIG-CAST2; reset for all
  // seats at untap — the SAME source the native "cast your second spell" triggers read). Loan Shark's ETB
  // "if you've cast two or more spells this turn". A FILTERED ("a noncreature spell") or opponent-scoped variant
  // fails the anchor → falls through → null → Arbiter (CREED — never a mis-scoped spell-count read).
  m = c.match(new RegExp(`^you've cast ${NUM_RE}(?: or more)? spells? this turn$`));
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    return (state?.players?.[controllerId]?.spellsCastThisTurn || 0) >= n;
  }

  // ⭐ ===== THE PER-TURN LEDGER, CROSSED WITH THE COUNT-THRESHOLD SHAPE (2026-07-30) =====
  // The two readers directly above each NAMED their own missing arm — "a FILTERED ('a noncreature spell')
  // variant fails the anchor" and "a 'with a creature' qualifier, or a negated form fails the anchor". Both
  // were capability statements, and in every case below the LEDGER FIELD ALREADY EXISTED and simply had no
  // reader. gameState tracks noncreatureSpellsCastThisTurn, attackedThisTurn, landsPlayedThisTurn,
  // spellsCastThisTurn, lifeGainedThisTurn and lifeLostThisTurn; nothing new is stamped by this slice.
  //
  // ⛔ AND ONE PRINTED PHRASE IS REFUSED ON PURPOSE, which is the honest half of the same census:
  // "you haven't cast a spell FROM YOUR HAND this turn" (3 cards). `spellsCastThisTurn` counts casts from
  // ANY zone — it cannot tell a hand cast from a flashback or an escape — so reading it here would answer
  // FALSE for a player who has only cast from the graveyard, i.e. suppress an ability whose printed condition
  // is TRUE. A confidently-wrong answer is forbidden (CREED), so the zone-qualified form stays on the Arbiter
  // until casts are tracked per source zone.

  // NONCREATURE spell count (CR 700.4) — Seeker of Insight / Bonecache Overseer class. The counter is bumped
  // at the same cast chokepoint as spellsCastThisTurn and reset for all seats at untap.
  m = c.match(new RegExp(`^you've cast ${NUM_RE}(?: or more)? noncreature spells? this turn$`));
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    return (state?.players?.[controllerId]?.noncreatureSpellsCastThisTurn || 0) >= n;
  }

  // ATTACKED, with the "with a creature" qualifier and the NEGATED form (CR 508.1a — only creatures are ever
  // declared as attackers, so "attacked" and "attacked with a creature" are the same event; the qualifier is
  // flavour, not a narrowing). The negation reads the same flag: an unstamped seat has not attacked, which is
  // exactly what "didn't attack" means at any point before their declare-attackers step.
  if (/^you attacked with a creature this turn$/.test(c)) return state?.players?.[controllerId]?.attackedThisTurn === true;
  // CREATED A TOKEN THIS TURN (play-weighted P·11 — Idol of Oblivion's "Activate only if you created a token this turn", Bennie
  // Bracks' end-step intervening-if): the per-turn flag the mint chokepoint stamps (tokens.fireTokenEnterTriggers — real tokens
  // only) and the untap reset clears. An unstamped seat created none.
  if (/^you created a token this turn$/.test(c)) return state?.players?.[controllerId]?.createdTokenThisTurn === true;
  if (/^you (?:didn't|did not) attack(?: with a creature)? this turn$/.test(c)) return state?.players?.[controllerId]?.attackedThisTurn !== true;
  if (/^you haven't attacked this turn$/.test(c)) return state?.players?.[controllerId]?.attackedThisTurn !== true;

  // NEGATED per-turn counters — "you didn't play a land this turn" (CR 305.2 land-play tracking) and
  // "you didn't cast a spell this turn". Both are the zero case of a counter that already exists; the
  // land-play counter is the same one the land-drop rule reads, so there is no second source of truth.
  if (/^you (?:didn't|did not) play a land this turn$/.test(c)) return (state?.players?.[controllerId]?.landsPlayedThisTurn || 0) === 0;
  if (/^you (?:didn't|did not) cast a spell this turn$/.test(c)) return (state?.players?.[controllerId]?.spellsCastThisTurn || 0) === 0;

  // LIFE CHANGED EITHER WAY — "you gained or lost life this turn". A disjunction whose BOTH halves are already
  // tracked separately, which is the only reason it is safe to read as one: either counter being non-zero
  // satisfies it, and neither is inferred from the other.
  if (/^you (?:gained or lost|lost or gained) life this turn$/.test(c)) {
    const pl = state?.players?.[controllerId];
    return (pl?.lifeGainedThisTurn || 0) > 0 || (pl?.lifeLostThisTurn || 0) > 0;
  }

  // "you control another <Subtype>" — a curated creature subtype, OTHER THAN the entering permanent (CR 113.7)
  m = c.match(CTRL_ANOTHER_SUBTYPE_RE);
  if (m) {
    const sub = m[1];
    if (!CONTROL_SUBTYPE_ALLOW.has(sub)) return null; // non-creature-type word (designation/color) → Arbiter (CREED)
    const triggeringId = context?.triggeringPermanentId;
    if (!triggeringId) return null; // "another" needs the entering permanent to exclude → can't confirm (FN-safe)
    const re = new RegExp(`\\b${sub.charAt(0).toUpperCase() + sub.slice(1)}\\b`, "i");
    return controllerBoard(state, controllerId).some((p) =>
      p.id !== triggeringId && isCreaturePermLocal(p) && (re.test(typeStr(p.card)) || permIsEveryCreatureType(state, p.id))); // P·39 — "another Elf": every creature type is one
  }

  // ⭐ "you control another <FILTER>" (2026-07-30) — the general form of the bare-subtype arm directly above:
  // "another non-Human creature", "another artifact creature", "another colorless creature", "another nonland
  // permanent", "another creature with power 4 or greater". Same board scan, same exclusion, but the noun goes
  // through parseFilter so the whole widened vocabulary (colour, colourless, keyword, union, type) applies.
  //
  // ⛔ THE REFERENT RULE IS UNCHANGED, AND THAT IS DELIBERATE. `activationCondition.test.js` pins that an
  // ACTIVATED ability may not answer "another" — "a trigger can supply the triggering permanent; an activated
  // ability cannot. If this ever returns true, the activation probe is claiming a context it does not have."
  // A source-relative reading is arguable, but that is a JUDGEMENT pin about referent semantics, not a
  // capability marker, and this slice is widening the FILTER vocabulary only. Absent triggering referent →
  // null → Arbiter, exactly as before.
  m = c.match(/^you control another (.+)$/);
  if (m) {
    const filter = parseFilter(m[1]);
    if (!filter) return null;
    const triggeringId = context?.triggeringPermanentId;
    if (!triggeringId) return null;
    return controllerBoard(state, controllerId).some((p) => p.id !== triggeringId && permMatchesFilter(p, filter, state));
  }

  // ===== GLOBAL CREATURE COUNT (play-weighted #509 — Blasphemous Edict's "if there are thirteen or more creatures on the
  // battlefield") ===== "there are N or more creatures on the battlefield": EVERY player's creatures (the battlefield is a shared
  // zone, CR 400.1), judged LAYER-AWARE through permanentIsCreature — an animated land counts, a creature turned into a
  // noncreature does not. parseFilter's type-line read is deliberately not used here: it sees the PRINTED type, so it would miss
  // an animated land and overcount a creature that is no longer one.
  m = c.match(new RegExp(`^there are ${NUM_RE} or more creatures on the battlefield$`));
  if (m) {
    let creatures = 0;
    for (const pl of Object.values(state.players)) {
      for (const perm of pl.battlefield) if (permanentIsCreature(state, perm.id)) creatures++;
    }
    return creatures >= parseCount(m[1]); // NUM_RE is derived from NUM_WORD, so the count is never null here
  }

  // ===== GLOBAL BOARD-EMPTY (CR 603.4 + 400.1 — Pyrohemia / Pestilence / Sarcomancy) ============
  // "no <filter> are on the battlefield" (Pyrohemia, Pestilence: "At the beginning of the end step, if no
  // creatures are on the battlefield, sacrifice this enchantment.") and the "there are no <filter> on the
  // battlefield" spelling (Sarcomancy's upkeep self-damage).
  //
  // ⭐ THE CONTROLLER-SCOPED SIBLING ALREADY EXISTED — "you control no <filter>" reads natively, and a probe
  // confirmed the identical trigger with that condition classifies native-trigger while this one parked. The
  // ONLY missing piece was the GLOBAL scope, so this is a scope widening over the same parseFilter /
  // permMatchesFilter vocabulary, not new machinery.
  //
  // ⛔ THE SCOPE IS THE WHOLE POINT, AND GETTING IT WRONG WOULD BE A FORBIDDEN FP. The battlefield is a
  // SHARED zone (CR 400.1) — "no creatures are on the battlefield" asks about EVERY seat's permanents, not
  // the controller's. Reading only controllerBoard would sacrifice Pyrohemia while an opponent's creature is
  // still out, which is a confident wrong answer rather than a safe refusal. So this scans every player.
  //
  // Layer-irrelevant board count → identical at flush AND resolution (CR 603.4's two checks). An
  // un-parseable filter word → null → Arbiter (false-negative SAFE), exactly like every sibling above.
  {
    const m = c.match(/^(?:there are )?no ([a-z]+) (?:are )?on the battlefield$/);
    if (m) {
      const filter = parseFilter(m[1]);
      if (!filter) return null;                        // not a clean type/subtype word → can't confirm (FN-safe)
      for (const pid of Object.keys(state.players || {})) {
        for (const perm of state.players[pid]?.battlefield || []) {
          if (permMatchesFilter(perm, filter, state)) return false;   // one match → the condition is false
        }
      }
      return true;                                     // nothing anywhere matches → "no <filter>" holds
    }
  }

  return null; // outside the modeled vocabulary → not native / not fired (never fail-open)
}

/**
 * Pure SHAPE check: is this condition one `evaluate` can read? Evaluated against an empty probe board —
 * a parseable shape returns a boolean (true/false on the empty board), an unparseable one returns null.
 * Used by the coverage metric (triggerRoutesNatively) AND the flush gate (buildTriggerStack) so the
 * metric never claims a routing the engine won't perform.
 */
export function interveningIfParseable(condition) {
  // The probe board carries a synthetic entering permanent (id "__entering__", a named creature) so a
  // per-PERMANENT shape (SAME-NAME ETB) returns a boolean here instead of null-for-missing-context. A pure
  // board-count shape ignores the extra permanent and a non-creature name, so its truth on the empty-ish
  // board is unchanged. An unparseable condition still returns null → false. The probe also stamps a
  // definite `tributePaid` boolean so the TRIBUTE ETB shape returns a boolean here (the runtime stamps it
  // for real on every tribute permanent); a non-tribute board-shape ignores the extra field. The probe
  // context ALSO carries a definite `triggeringCardIsToken` boolean so the NOT-A-TOKEN shape returns a
  // boolean here (the runtime stamps it for real off every triggering permanent's card.token); every other
  // shape ignores the extra context field. It ALSO carries a definite `triggeringWasCreature` boolean so the
  // WAS-A-CREATURE shape returns a boolean here (the runtime stamps it for real off every dying object's type
  // line); every other shape ignores the extra field.
  const entering = { id: "__entering__", card: { name: "__probe_name__", type: "Creature" }, tributePaid: false };
  // The probe graveyard holds the probe source card so the IN-YOUR-GRAVEYARD zone check (Radroach) returns
  // a boolean here (the runtime threads a real sourceCardId from the graveyard scan).
  // The probe ALSO carries a definite _impulseExiledTypes stamp so the BONEHOARD exiled-type shapes
  // return a boolean here (the runtime stamp is written by every impulse-exile resolution).
  // `clashResult`: a definite stamp so the CLASH-RESULT shape ("you won the clash", stage ④-1) probes as
  // readable; the runtime stamps the real result on every clash.
  const probe = { players: { __probe__: { battlefield: [entering], graveyard: [{ id: "__probe_gy__" }] } }, _impulseExiledTypes: { land: false, nonland: false }, clashResult: { controller: "__probe__", won: true } };
  // The probe context ALSO carries a definite numeric `xValue` so the X-VALUE THRESHOLD shape ("x is N or
  // more") returns a boolean here (the runtime stamps a real xValue on every {X}-cost entry via
  // checkEnterTriggers); every other shape ignores the extra field.
  // It ALSO carries a definite `triggeringHadNoPlusCounters` boolean so the KW-UNDYING shape ("it had no
  // +1/+1 counters on it") returns a boolean here (the runtime stamps it off every death look-back's
  // counters snapshot); every other shape ignores the extra field.
  // It ALSO carries `sourcePermanentId` pointing at the probe permanent so the SOURCE-COUNTER-THRESHOLD
  // shape returns a boolean here (the runtime threads the real source id via makePendingTrigger's context);
  // the probe permanent has no counters → false, still a definite boolean.
  // `triggeringHadCounters` — the HAD-ANY-COUNTERS leave-look-back shape (The Ozolith) returns a boolean
  // here (the runtime stamps it off every leave event's counters snapshot); every other shape ignores it.
  // `declaredAttackers`: an empty declaration so the THOSE-ATTACKERS-AT-YOU shape (Mangara) probes as readable; the runtime
  // threads the real declaration off checkAttackTriggers' opponent-attacks pass.
  return evaluateInterveningIf(probe, condition, "__probe__", { triggeringPermanentId: "__entering__", triggeringCardIsToken: false, triggeringWasCreature: true, triggeringHadNoPlusCounters: true, triggeringHadNoMinusCounters: true, triggeringHadCounters: true, triggeringPowerDifferedFromBase: true, defenderId: "__probe__", sourceCardId: "__probe_gy__", sourcePermanentId: "__entering__", xValue: 0, manaSpent: true, activatedIsManaAbility: false, declaredAttackers: [] }) !== null; // activatedIsManaAbility: a definite boolean so the NOT-A-MANA-ABILITY shape (Illusionist's Bracers) probes as readable; the runtime threads false off every stack activation. manaSpent: a definite boolean so the NO-MANA-SPENT shape (Vexing Bauble) probes as readable; the runtime threads the real value off every cast
}

/**
 * SPELL-side shape check (BLITZ CD-1): is this a condition a resolving INSTANT/SORCERY can read with only
 * the context a spell supplies — the controller and the live board/player/turn state, but NO triggering
 * permanent, source permanent, defender, or per-object flag? Probes `evaluateInterveningIf` with an
 * EMPTY single-seat board and an EMPTY context (no per-object thread), so:
 *   • a board/player/turn query ("you control a Wizard", "you control no artifacts", "a creature died this
 *     turn", "an opponent controls more creatures than you", "you have no cards in hand") returns a boolean
 *     (its truth on the empty board) → readable → true;
 *   • a PER-OBJECT condition that needs a referent a spell can't provide ("you control another Elf" needs the
 *     triggering permanent to exclude; "it was kicked"; the source-counter / same-name shapes) returns null
 *     → NOT readable → false.
 * This is the metric⇄runtime shared gate for a conditional spell rider: the parser attaches a `condition`
 * to a gated atom ONLY when this returns true, so the coverage claim ("native") is always backed by a
 * condition the resolver (runProgram → the same evaluateInterveningIf) can actually evaluate — a condition
 * a spell can't read stays LOW → Arbiter (false-negative SAFE; a wrongly-applied rider would be a forbidden
 * FP, CREED). Reuses the readers verbatim — no re-implementation. Straight mirror of interveningIfParseable
 * but with the SPELL context (no per-object probe fields), which is exactly what distinguishes the two.
 */
export function spellConditionParseable(condition) {
  const probe = { players: { __probe__: { battlefield: [], graveyard: [], hand: [], library: [], life: 20 } }, clashResult: { controller: "__probe__", won: true } }; // clashResult: the CLASH-RESULT shape (stage ④-1) is spell-readable (a spell can clash — Titan's Revenge)
  return evaluateInterveningIf(probe, condition, "__probe__", {}) !== null;
}

/**
 * ACTIVATION-side shape check (census slice, 2026-07-28): is this a condition the OFFER GATE can read for an
 * "Activate only if <condition>." rider (CR 602.5d)? The third sibling of the same probe family, and the
 * distinction between the three is exactly the CONTEXT each caller can honestly supply:
 *   • interveningIfParseable — a trigger: has a triggering object and every per-object flag;
 *   • spellConditionParseable — a resolving spell: has NO object thread at all;
 *   • this one — an activated ability: has the SOURCE PERMANENT (the permanent whose ability it is) and
 *     nothing else. No triggering object, no dying-object snapshot, no defender.
 * So a board/player/turn query ("there are seven or more cards in your graveyard", "a creature died this
 * turn", "you control a creature with flying") is readable, and a per-TRIGGER shape ("it was kicked", "you
 * control another Elf" — which needs a triggering permanent to exclude) is NOT, and stays parked.
 *
 * This is the metric⇄runtime shared gate for the rider: abilities.js attaches `condition` to the parsed
 * ability ONLY when this returns true, so a "native" claim is always backed by a condition legalChoices can
 * actually evaluate. An unreadable condition leaves the rider IN the effect clause, which drags the ability
 * LOW → the card parks → Arbiter. Never a stripped-but-unenforced restriction, which would be a spammable
 * false positive (CREED — false-negative safe, false-positive forbidden).
 */
export function activationConditionParseable(condition) {
  // `enteredOnTurn: 0` + `turn: 0`: a definite stamp so the ENTERED-THIS-TURN shape (stage ④-3, Gathering
  // Place) probes as readable; the runtime reads the real stamp every enter path writes.
  const src = { id: "__src__", card: { name: "__probe_name__", type: "Creature" }, enteredOnTurn: 0 };
  const probe = { turn: 0, players: { __probe__: { battlefield: [src], graveyard: [], hand: [], library: [], life: 20 } } };
  return evaluateInterveningIf(probe, condition, "__probe__", { sourcePermanentId: "__src__" }) !== null;
}
