/**
 * Phase 6 PR 10.1 — manaModel.js
 *
 * The missing piece that makes the learn engine playable: what mana a
 * permanent can produce, and how to pay a spell's cost from the pool +
 * untapped sources. Before this, `manaPool` was never filled, so no spell
 * was ever castable and the driver auto-piloted into the safety cap.
 *
 * Design (see docs/phase6-playable-engine.md §5 PR 10.1):
 *   - Sources are untapped permanents with a mana ability: lands + non-
 *     creature rocks (no summoning-sickness gate) + creature dorks (gated
 *     by summoning sickness unless Haste).
 *   - A source produces `amount` mana of ONE chosen color from `colors`.
 *     (Sol Ring = {colors:["C"], amount:2}; a dual = {colors:["W","U"],
 *     amount:1}.)
 *   - Payment is greedy, MOST-CONSTRAINED-SOURCE-FIRST: colored pips are
 *     satisfied from the source with the fewest color options first, so a
 *     dual that's the only source of a needed color isn't wasted paying
 *     generic. Pathological multicolor costs fall to "can't afford" — never
 *     to fabricated mana.
 *
 * Pure: no fetches, no mutation. `canAfford`/`planPayment` never change
 * state — the dispatcher commits taps. This separation (pure planner +
 * separate commit) keeps castability checks side-effect free.
 *
 * Near-leaf: it imports constants from gameState plus `permanentHasKeyword` from
 * the layer engine (so a creature dork GRANTED Haste by an Aura/anthem can tap on
 * the turn it would otherwise be summoning-sick). It operates on already-parsed
 * cost objects (from legalChoices.parseManaCost), so there is no import cycle with
 * legalChoices, and layers imports none of these modules so that edge is acyclic too.
 */

import { MANA_COLORS, addMana, addCounter, cardSelfPreventsUntap, moveCardToZone, tapPermanent, findPermanent, loseLife, gainLife, logEvent, removeCounter, setDoesNotUntapNext, opponentsOf, playerLifeLocked } from "./gameState.js"; // + gainLife (2026-10-17, the land lines): a mana ability that makes each opponent gain life (Grove of the Burnwillows); + addCounter — 2026-10-17: Wall of Roots' -0/-1 counter cost // + removeCounter — STAGE ④-4: the counter-removal mana commit; + setDoesNotUntapNext — STAGE ④-5: the "doesn't untap during your next untap step" rider
import { checkTapForManaTriggers, checkLifegainTriggers } from "./triggers.js"; // + checkLifegainTriggers (2026-10-17, the land lines): Grove of the Burnwillows' opponents gain life as its tap resolves; + ④-D: "tapped for mana" watchers fire at the one tap commit
import { sacrificePermanentForCost } from "./costSacrifice.js"; // SG-3 / SAC-TREASURE: a permanent sacrificed to a mana cost leaves through THE cost sacrifice (dies, sacrifice watchers, the leave drain — CR 603.3b), the one the activated-ability and additional costs use
import { permanentHasKeyword, grantedManaSpecsFor, permanentTypes, permanentHasCardType, summoningSickNow, deriveCharacteristics, permIsEveryCreatureType, permanentColors, faceUpTypeLine, permanentSubtypes } from "./layers.js"; // + faceUpTypeLine: the face that is up of a combined "Front // Back" card — the derive's own read, shared by manaModel's face-up mana read; + permanentSubtypes: the land types an "instead" condition names (Urza's Tower)
import { CR_CREATURE_TYPES } from "./effects/creatureTypes.js"; // QUARTET Phase 4 step 3 (2026-09-06): the closed CR creature-type vocabulary for spend restrictions ("only to cast a Ninja or Turtle spell") — a zero-import leaf
import { countForSpec } from "./effects/atoms/shared.js"; // MANA-VARIABLE: resolve a count-derived mana amount (leaf-safe: shared → gameState only)
import { COUNT_SUBTYPE } from "./effects/parseHelpers.js"; // #766 — the curated subtype allowlist for "for each <Subtype> on the battlefield" (parseHelpers imports only keywords.js; staticAbilityParser, imported below, already loads it)
import { parseAuraLandManaBonus, parseGlobalTapManaAugment, artifactActivationsLocked, abilitiesAsThoughHasteFor, choosesColorOnEnter } from "./staticAbilityParser.js"; // + SG-18: haste-for-abilities at the mana-source sick gate // AURA-LAND-MANA-BOOST + GLOBAL-TAP-AUGMENT: extra mana from a "tapped for mana" boost (leaf: static parser → keywords only); NR-1: the artifact-activation lock; + choosesColorOnEnter (2026-10-17): the chosen-colour mana leg reads the name-led chooser (Throne of Eldraine)
import { PHYREXIAN_LIFE_PER_PIP } from "./attackTax.js"; // 2 life per Phyrexian symbol (CR 107.4f) — one constant for the cast, the activation and the attack tax (attackTax imports only parseHelpers: no cycle)
import { manaMultiplier } from "./replacementEffects.js"; // MANA-MULTIPLIER: ×N tap-for-mana replacement (Mana Reflection/Nyxbloom; leaf, no cycle)
import { evaluateInterveningIf } from "./interveningIf.js"; // CONDITION-GATED mana (CR 602.5) — interveningIf imports ONLY gameState, so this is a one-way edge with no cycle (checked before adding it)
import { commanderColorIdentityOf } from "./commanderIdentity.js"; // "your commander's color identity" (CR 903.4) — the shared read off the seat's stamp (a zero-import leaf)
import { parseFaceBlock } from "./splitCard.js"; // THE FACE THAT IS UP — the front face's own text, its "<name> - <type> {mana}" header peeled (splitCard imports nothing)
import { characteristicTypeLine, characteristicColors } from "./faceUp.js"; // the spell being cast's type line and colours — the face being cast (CR 712.8c), for the spend restrictions; a zone card's colours (the imprinted card, The Grey Havens' graveyard) (a leaf)

// A board with one seat and empty zones — enough for evaluateInterveningIf to ANSWER a condition or admit it
// cannot. Used only by conditionIsExpressible, never for a real verdict.
// The probe carries ONE stamped permanent (the "probe-src" the context names, enteredOnTurn 0 on turn 0) so a
// per-source condition — "this land entered this turn" (stage ④-3, Gathering Place) — probes as decidable;
// every board-count condition still returns a boolean (a count of one is still a count).
const _PROBE_STATE = { turn: 0, players: { probe: { battlefield: [{ id: "probe-src", card: { name: "__probe__", type: "Land" }, enteredOnTurn: 0 }], graveyard: [], hand: [], library: [], life: 40 } } };

/**
 * Can `evaluateInterveningIf` actually DECIDE this condition? It returns a boolean when it understands the
 * phrase and `null` when it cannot confirm.
 *
 * ⚠️ THIS GUARD IS WHY THE METRIC STAYS HONEST. Tagging every gate onto the product and letting manaSources
 * drop anything not `=== true` would be safe at RUNTIME but would credit the card native-mana while its
 * source could never be offered — a runtime-vacuous native, the same class as the vacuous subtype filter and
 * the aura grants that never applied. An inexpressible gate must PARK the card instead, which is what
 * manaProductionImpl does with this answer.
 *
 * No try/catch (removed 2026-10-18). The old one answered any throw with false, parking the card silently. A probe
 * reached it 656 times running manaProduction over all 34,620 real cards, and again in the tier snapshot, the full
 * suite and an 80-game seeded batch, and saw no throw: the evaluator answers a phrase it does not know with null. A
 * throw here would be a field a real state has and _PROBE_STATE lacks, to add to the probe, not a card to park unseen
 * (CLAUDE.md §1.2).
 */
function conditionIsExpressible(condition) {
  return typeof evaluateInterveningIf(_PROBE_STATE, condition, "probe", { sourcePermanentId: "probe-src" }) === "boolean";
}

// ─── Card → mana production ────────────────────────────────────────────────────

// Basic lands by name — the most reliable signal (card.oracle is sometimes
// thin in the slim index). Snow-Covered variants strip the prefix.
const BASIC_LAND_MANA = {
  Plains: ["W"],
  Island: ["U"],
  Swamp: ["B"],
  Mountain: ["R"],
  Forest: ["G"],
  Wastes: ["C"],
};

// Known mana rocks — a small belt-and-suspenders table for when oracle text
// is missing/thin. The oracle parser below handles most rocks on its own
// ("{T}: Add {C}{C}" etc.); this is the safety net for the iconic ones.
const KNOWN_ROCKS = {
  "Sol Ring": { colors: ["C"], amount: 2 },
  // Mana Crypt's {C}{C} is real every turn; the upkeep coin-flip damage is an UNMODELED DRAWBACK
  // (parked — biases data toward the controller, but the mana itself is never phantom).
  // Mana Vault is deliberately ABSENT: "doesn't untap during your untap step" is unmodeled (untapAll
  // frees everything), so a standing-source entry fabricated a free repeatable 3-mana rock every turn —
  // the oracle path below routes such cards out via the untap-restriction gate instead.
  "Mana Crypt": { colors: ["C"], amount: 2 },
  "Mind Stone": { colors: ["C"], amount: 1 },
  // Arcane Signet and Fellwar Stone are deliberately ABSENT (2026-10-16): this table answers BEFORE the oracle parse and can only
  // say a fixed colour set, so it made both all five colours — Arcane Signet on a mono-green deck or with no commander at all,
  // Fellwar Stone facing no land. Their colours are read off the board (parseAddClause's commanderColorIdentity and
  // landsOpponentsControlCouldProduce arms), and a copy with no oracle text makes nothing — an under-count, the safe side.
};

const COLOR_SET = new Set(MANA_COLORS);
const CHOSEN_COLOR_AMOUNT_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5 };

// The order GENERIC is paid from mana already made (the floating pool, a tap's surplus, a restricted entry): COLORLESS
// FIRST, then W→U→B→R→G. Any type of mana pays generic (CR 107.4b), but a colored mana left floating can still pay a
// later colored pip this step (CR 106.4 — the pool empties only as the step ends), while a colorless one pays only generic
// or a colorless symbol ({C}, CR 107.4c). So spending the colorless first never costs a later payment the other order
// could make, except one with a colorless pip — rare. With colorless LAST, a {2}{R} paid from {R:3, C:2} spent all three
// red and left a Lightning Bolt uncastable behind two colorless (measured 2026-09-30, shelf slice D26).
const GENERIC_SPEND_ORDER = ["C", "W", "U", "B", "R", "G"];

function typeLineOf(card) {
  return String(card?.type || card?.type_line || "");
}

function oracleOf(card) {
  return String(card?.oracle || card?.oracle_text || "");
}

/**
 * SNOW SOURCE DETECTOR (BLITZ SN-1, CR 205.4a + 106.3): a permanent is a snow source when the SUPERTYPE
 * "Snow" is printed on its type line — Snow-Covered basics ("Basic Snow Land — Island"), snow lands
 * ("Snow Land"), snow artifacts/creatures ("Snow Artifact Creature — Golem"). Mana produced by such a
 * permanent can pay a {S} pip (CR 107.4h). Read off the TYPE LINE only (never oracle text or name),
 * word-anchored and case-sensitive on the capitalized supertype, so a lowercase "snow" in reminder/rules
 * text ("{S} can be paid with one mana from a snow source") never counts. A plain Forest is NOT snow; a
 * Snow-Covered Forest IS. This is the PRINTED supertype — a permanent MADE snow by a continuous effect
 * (Rimefeather Owl's ice-counter static) is not credited here, a safe under-count (CREED), not modeled.
 */
export function isSnowPermanent(card) {
  return /\bSnow\b/.test(typeLineOf(card));
}

// Strip reminder text (parentheses). Used TYPE-AWARELY in manaProduction — see the note there.
function stripReminder(text) {
  return String(text || "").replace(/\([^)]*\)/g, " ");
}

function hasHaste(card) {
  const kws = Array.isArray(card?.keywords) ? card.keywords : [];
  if (kws.some(k => String(k).toLowerCase() === "haste")) return true;
  return /\bhaste\b/i.test(oracleOf(card));
}

// ===== MANA-VARIABLE (wave2a) ===== map a metric TAIL (the text after "Add … {C}/X mana") to a
// `countForSpec` spec. ANCHORED to a curated set of known metrics ONLY; an unrecognized metric
// returns null so the caller leaves the card NON-NATIVE (CREED: never a fabricated amount). The
// returned spec is consumed by countForSpec(state, {controller, source}, spec) at resolution
// (CR 608.2g — a count-derived mana amount is computed when the ability resolves, not at cast).
//
// `tail` includes the connector ("for each …", "equal to …", "where X is …"), which is normalized
// away first so the SAME metric body matches regardless of which connector introduced it.
const VAR_COLOR_WORD = { white: "W", blue: "U", black: "B", red: "R", green: "G" };

// ===== MANA-AMOUNT — the FIXED quantity in "Add <N> mana of any (one) color". The number-word range that
// actually appears in the corpus (survey: one 585 · two 34 · three 23 · four 2 · ten 2 · a bare digit 1×;
// five included defensively). Returns the integer, or null when the token is NOT a recognized fixed
// quantity — most importantly "x" (a VARIABLE amount: "Add X mana of any one color, where X is …" is
// handled by Shape B / left non-native; a bare "Add X mana …" with no metric must stay 1, never fabricate
// X). Any other word (or none) → null so the caller keeps the FN-safe default of 1 (CREED: an unquantified
// or unrecognized phrasing under-counts to 1, never over-counts). Pure string→int.
const NUMBER_WORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
function parseFixedQuantity(token) {
  const w = String(token || "").trim().toLowerCase();
  if (/^\d+$/.test(w)) return parseInt(w, 10);   // a literal digit ("Add 1 mana of any color")
  if (w in NUMBER_WORD) return NUMBER_WORD[w];    // a number word ("two", "three", … "ten")
  return null;                                     // "x" or anything else → caller defaults to 1 (never fabricate)
}

function parseManaMetric(tail, card) {
  // Strip the leading connector + any "the/your/an amount of" filler so the body is the bare metric.
  const t = String(tail || "")
    .trim().replace(/\.$/, "").replace(/\s+/g, " ").toLowerCase()
    .replace(/^(?:for each|equal to|where x is)\s+/, "")
    .replace(/^(?:the|your|an amount of)\s+/, "");

  // "<type> you control" (from "for each creature you control") or "number of <type>s you control"
  // (from "equal to the number of enchantments you control") → permanents of a card TYPE.
  let m = t.match(/^(?:number of )?([a-z]+?)s? you control$/);
  if (m) {
    const cardType = m[1];
    if (["creature", "artifact", "enchantment", "land", "planeswalker"].includes(cardType)) {
      return { kind: "permanentsYouControl", cardType };
    }
    // ⭐ SUBTYPE COUNTS (Elvish Archdruid #942 "for each Elf you control", Magus of the Coffers "for each
    // Swamp you control"). countSelfSpecOnBoard ALREADY honours `subtype` — only this parser was card-types
    // only, so the counter has been ready the whole time.
    //
    // THE VOCABULARY GATE IS THE WHOLE SAFETY ARGUMENT. The counter word-matches the type line
    // CASE-SENSITIVELY, so an unvetted word would match nothing, the ability would produce ZERO, and the
    // card would still classify native — a mana source that makes no mana, which is worse than parking it.
    // Two ways a word earns admission, both checkable without a card index:
    //   • it is one of the five BASIC LAND types (a closed set, always real);
    //   • the SOURCE CARD ITSELF carries it in its own type line — an Elf counting Elves proves "Elf" is a
    //     printed subtype. A card counting a subtype it doesn't share (none in the top-5000) is refused:
    //     an under-count, the safe direction.
    const Word = cardType.charAt(0).toUpperCase() + cardType.slice(1);
    const BASIC = ["Plains", "Island", "Swamp", "Mountain", "Forest"];
    const ownTypeLine = String(card?.type || card?.type_line || "");
    if (BASIC.includes(Word) || new RegExp(`\\b${Word}\\b`).test(ownTypeLine)) {
      return { kind: "permanentsYouControl", subtype: Word };
    }
    return null;
  }

  // ── FOUR LAND COUNTS (2026-10-17 — the land {C} fallback). Each line used to parse to nothing, so the land read its
  // "{C}" fallback in its place and the land gate credited the line; each is now read, and made (extraManaLineProducts).
  // "BASIC <type> you control" (Cabal Stronghold "{3}, {T}: Add {B} for each basic Swamp you control."): a permanent of that
  // basic land type that also has the basic supertype (CR 205.4c — a dual with the type is no basic land). A closed vocabulary.
  m = t.match(/^(?:number of )?basic (plains|island|swamp|mountain|forest)s? you control$/);
  if (m) return { kind: "basicSubtypeYouControl", subtype: m[1].charAt(0).toUpperCase() + m[1].slice(1) };
  // "<land type> land(s) you control" (Urza's Workshop "for each Urza's land you control"): a land type (CR 205.3i) the SOURCE's
  // own type line carries — the subtype counts' vocabulary gate above.
  m = t.match(/^(?:number of )?([a-z']+) lands? you control$/);
  if (m) {
    const Word = m[1].charAt(0).toUpperCase() + m[1].slice(1);
    return LAND_TYPE_WORDS.has(m[1]) && new RegExp(`\\b${Word}\\b`).test(String(card?.type || card?.type_line || ""))
      ? { kind: "permanentsYouControl", subtype: Word } : null;
  }
  // "OTHER <subtype>s you control" (Baldur's Gate "where X is the number of other Gates you control"): the subtype count without
  // the source itself (countForSpec's excludeSelf — ctx.source on the mana path). The same vocabulary gate; card types not read.
  m = t.match(/^(?:number of )?other ([a-z]+?)s? you control$/);
  if (m) {
    const Word = m[1].charAt(0).toUpperCase() + m[1].slice(1);
    if (["Creature", "Artifact", "Enchantment", "Land", "Planeswalker"].includes(Word)) return null;
    return new RegExp(`\\b${Word}\\b`).test(String(card?.type || card?.type_line || "")) ? { kind: "permanentsYouControl", subtype: Word, excludeSelf: true } : null;
  }
  // "<colour> creature card(s) in your graveyard" (Crypt of Agadeem "for each black creature card in your graveyard"): the
  // controller's graveyard, each card's front-face types and colours (CR 712.8a, 202.2).
  m = t.match(/^(?:number of )?(white|blue|black|red|green) creature cards? in your graveyard$/);
  if (m) return { kind: "creatureCardsOfColorInGraveyard", color: VAR_COLOR_WORD[m[1]] };

  // ⭐ ALL-SEATS SUBTYPE COUNT (play-weighted #766 — Priest of Titania "{T}: Add {G} for each Elf on the battlefield"; Wirewood
  // Channeler "Add X mana of any one color, where X is the number of Elves on the battlefield"; Cloudpost "Add {C} for each Locus
  // on the battlefield"). "On the battlefield" is every player's battlefield, the source included (the Priest's ruling: it counts
  // "Priest of Titania itself as well as Elves controlled by other players"): countForSpec's subtypeOnBattlefield, the count
  // Brightstone Ritual and Magma Sliver already read — each permanent's front-face type line, or, for a creature type, every
  // creature type (a changeling: layers.permIsEveryCreatureType). Read live as the mana ability resolves, by manaSources (the
  // planner, and the explicit tap through manualManaTaps).
  // THE VOCABULARY GATE: the word must be a COUNT_SUBTYPE entry — the curated, collision-free subtype allowlist parseCountSource
  // reads, irregular plurals included ("elves" is Elf). Any other word parks the card: a word no type line carries would count
  // nothing, a source that makes no mana while the card read native.
  m = t.match(/^(?:number of )?([a-z]+) on the battlefield$/);
  if (m) return COUNT_SUBTYPE[m[1]] ? { kind: "subtypeOnBattlefield", subtype: COUNT_SUBTYPE[m[1]] } : null;

  // "greatest power among (other) creatures you control" → max layer-resolved power.
  m = t.match(/^greatest power among (other )?creatures you control$/);
  if (m) return { kind: "greatestPowerYouControl", ...(m[1] ? { excludeSelf: true } : {}) };

  // ⭐ SELF-POWER ("{T}: Add X mana of any one color, where X is this creature's power") — Heronblade Elite,
  // Kami of Whispered Hopes, and the NAMED variants Doc Samson / Mona Lisa. Distinct from the greatest-power
  // metric above: this reads the SOURCE, so a bigger creature elsewhere must not inflate it.
  //
  // ⛔ THE SELF-REFERENCE GATE IS THE SAFETY ARGUMENT. Printed text names the source three ways — "this
  // creature", the full name, or the SHORT name (the pre-comma portion: "Helga" for "Helga, Skittish Seer").
  // Every other "<something>'s power" on a real card is a REFERENT to a different object ("that creature's",
  // "the sacrificed creature's", "the exiled card's"), and those must not land here: they'd read the source's
  // power for a value that belongs to another permanent — a fabricated amount. So the name arm matches only
  // against THIS card's own name and refuses everything else (an unmodelled metric → null → the card parks,
  // the safe direction).
  // ⭐ SELF-COUNTERS ("{T}: Add {G} for each +1/+1 counter on this creature" — Gyre Sage). The counter twin
  // of the self-power metric below, and it carries the SAME self-reference gate for the same reason: every
  // other "counter on <X>" on a real card is a referent to a DIFFERENT object ("that creature", "target
  // creature"), and reading the source's counters for a value belonging elsewhere would fabricate an amount.
  // So only the source's own three spellings are accepted — "this creature", the full name, or the pre-comma
  // short name — and anything else returns null → the card parks (the safe direction).
  {
    const cm = t.match(/^\+1\/\+1 counter on (.+)$/);
    if (cm) {
      const subj = cm[1].trim();
      const own = String(card?.name || "").toLowerCase();
      const short = own.split(",")[0].trim();
      if (subj === "this creature" || subj === "it" || (own && (subj === own || (short && subj === short)))) {
        return { kind: "selfCounters", counter: "+1/+1" };
      }
      return null; // a referent to another object — never read the source's counters for it
    }
    // The CHARGE-counter twin (play-weighted P·15 — Everflowing Chalice: "{T}: Add {C} for each charge counter on this
    // artifact"). The same self-reference gate: only "this artifact" — any other subject is another object's counters.
    if (/^charge counter on this artifact$/.test(t)) return { kind: "selfCounters", counter: "charge" };
    // The STORAGE-counter land twin (2026-10-17 — City of Shadows: "{T}: Add {C} for each storage counter on this land"). It read
    // nothing and the land made a fallback {C} with no counter on it; the same self-reference gate — only "this land".
    if (/^storage counter on this land$/.test(t)) return { kind: "selfCounters", counter: "storage" };
  }
  if (/^this creature's power$/.test(t)) return { kind: "selfPower" };
  m = t.match(/^(.+)'s power$/);
  if (m) {
    const own = String(card?.name || "").toLowerCase();
    const short = own.split(",")[0].trim();
    if (own && (m[1] === own || (short && m[1] === short))) return { kind: "selfPower" };
    return null;
  }

  // "greatest toughness among (other) creatures you control" → max layer-resolved toughness.
  // (Only the "other" form exists on real cards — Bighorner's life clause / Arbor Adherent.)
  m = t.match(/^greatest toughness among (other )?creatures you control$/);
  if (m) return { kind: "greatestToughnessYouControl", ...(m[1] ? { excludeSelf: true } : {}) };

  // "devotion to <color>" (from "equal to your devotion to green") → count of that color's
  // mana-symbol pips across permanents you control.
  m = t.match(/^devotion to (white|blue|black|red|green)$/);
  if (m) return { kind: "devotion", color: VAR_COLOR_WORD[m[1]] };

  return null;
}

/**
 * Parse the first "Add ..." mana clause out of oracle text into `{ colors, amount }`, or a
 * VARIABLE-amount clause into `{ colors, amount: 0, amountSpec }`, or null if there's no
 * (modeled) mana production.
 *
 *   "Add {G}"                          → { colors: ["G"], amount: 1 }
 *   "Add {C}{C}"                       → { colors: ["C"], amount: 2 }  (concat, same color)
 *   "{T}: Add {W} or {U}."             → { colors: ["W","U"], amount: 1 }  ("or" = choice)
 *   "Add one mana of any color."       → { colors: ["W","U","B","R","G"], amount: 1 }
 *   "Add {G} for each creature …"      → { colors: ["G"], amount: 0, amountSpec:{…} }
 *   "Add X mana of any one color, where X is the number of enchantments …"
 *                                      → { colors:[5], amount: 0, amountSpec:{…} }
 *   "Add a +1/+1 counter"              → null (no mana symbols)
 *   "Add {G} for each <unrecognized>"  → null (unmodeled metric — card stays NON-NATIVE)
 */
function parseAddClause(oracle, card) {
  if (!/\badd\b/i.test(oracle)) return null;

  // STAGE ④-5 — the ANY-COLOUR painland (Grand Coliseum): "{T}: Add {C}.\n{T}: Add one mana of any color. This land
  // deals 1 damage to you." — the two-colour painland shape (below) with all five colours painful. Read FIRST,
  // before the generic any-colour branches, which would otherwise return the colours without the pain (the
  // honest-main rule then demotes the card to its plain {C}). Admitted ONLY together with painColors.
  {
    const painAny = String(oracle || "").trim().match(
      /^(?:This land enters tapped\.\n)?\{T\}: Add \{C\}\.\n\{T\}: Add one mana of any color\.[^\n]*? deals (\d+) damage to you\.$/i,
    );
    if (painAny) {
      return { colors: ["C", "W", "U", "B", "R", "G"], amount: 1, painColors: ["W", "U", "B", "R", "G"], painAmount: parseInt(painAny[1], 10) };
    }
  }

  // ⭐ IMPRINTED-CARD COLORS (Chrome Mox) — "Add one mana of any of the exiled card's colors." A CHOICE of
  // one mana among the imprinted card's colors, so unlike the bundles below it needs no new product shape:
  // `colors` (the existing choice set) resolved live from the permanent's stamp, amount 1.
  //
  // ⛔ THE WHOLE POINT IS THE GATE. `colorsFromImprint` is resolved in manaSources against `perm.imprinted`,
  // and a permanent with NO stamp produces NOTHING — it never becomes a source at all. A bare Chrome Mox is
  // a dead card, and modeling it as "any color" would be a turn-one ritual the printed card cannot cast:
  // the forbidden false-positive direction, the same shape already refused for Mox Opal's metalcraft gate.
  // An imprinted COLORLESS card (Chrome Mox can exile one) is likewise no colors and no mana — correct, and
  // the reason the resolver checks the color list rather than merely the stamp's presence.
  //
  // Checked before the symbol-anchored arms below for the same reason as VIVID: the clause has no {SYM}.
  if (/\badd one mana of any of the exiled card's colors\b/i.test(oracle)) {
    return { colors: [], amount: 1, colorsFromImprint: true };
  }
  // ⭐ VIVID / BOARD-DERIVED BUNDLE (Bloom Tender, Faeburrow Elder) — "For each color among permanents you
  // control, add one mana of THAT color." The same simultaneous one-of-each shape as the karoo family below,
  // except the color set is read off the LIVE board at tap time rather than printed, so it is modeled as
  // `fixedSpec` (resolved in manaSources) rather than a static `fixed`. `amount:0` is a placeholder the
  // resolver replaces with the live tally — never a produced-zero.
  //
  // ⚠️ It CANNOT ride the existing amountSpec path: that yields N mana freely spendable across `colors`, so on
  // a W/G board it would pay {G}{G} — the same forbidden false positive the karoo fix below removes.
  //
  // Checked FIRST because this clause carries NO mana symbols: every arm below either anchors on a {SYM} or
  // bails at `symbols.length === 0`, so a later placement is dead code (measured — it returned null there).
  if (/\bfor each color among permanents you control, add one mana of that color\b/i.test(oracle)) {
    return { colors: ["W", "U", "B", "R", "G"], amount: 0, fixedSpec: { kind: "colorsAmongPermanents" } };
  }

  // ===== MANA-VARIABLE — checked FIRST so the bigger variable ability wins over a small fixed/any-
  // color one on the SAME card (Arbor Adherent has a line-1 "Add one mana of any color" AND a line-2
  // variable "Add X mana …, where X is …"; the variable line is the modeled one). Each shape is
  // anchored at the metric. An unmodeled metric → null (NOT amount:1) → the card stays non-native.

  // Shape A — fixed color symbol(s) + a "for each"/"equal to" connector introducing the metric:
  // "Add (an amount of )?{C}… (for each|equal to) <metric>". The connector + metric is captured whole
  // and parseManaMetric normalizes the connector away.
  let v = oracle.match(/\bAdd (?:an amount of )?((?:\{[WUBRGC]\})+)(?: mana)? ((?:for each|equal to) [^.]+)/i);
  if (v) {
    const symbols = [...v[1].matchAll(/\{([WUBRGC])\}/gi)].map(x => x[1].toUpperCase());
    const spec = parseManaMetric(v[2], card);
    if (spec && symbols.length) return { colors: [...new Set(symbols)], amount: 0, amountSpec: spec };
    return null; // unmodeled metric (or no symbol) — non-native, never a fabricated fallback
  }

  // Shape B — "Add X mana (of any one color | of any color | in any combination of colors)?, where X
  // is <metric>". All three color forms produce X mana the payment planner spends across the five
  // colors freely, so they share the same all-five-colors amountSpec return. "in any combination of
  // colors" (Selvala, Heart of the Wilds) is the strict-superset form — the player distributes the X
  // among any colors — and the planner's per-pip color choice models it EXACTLY (colors:[all 5] +
  // amountSpec resolved live from the metric). An unmodeled metric still → null (CREED).
  v = oracle.match(/\bAdd X mana(?: of any(?: one)? color| in any combination of colors)?, (where X is [^.]+)/i);
  if (v) {
    const spec = parseManaMetric(v[1], card);
    if (spec) return { colors: ["W", "U", "B", "R", "G"], amount: 0, amountSpec: spec };
    return null; // unmodeled metric — non-native
  }
  // Shape B over TWO named colours (2026-10-17 — Vivi Ornitier: "Add X mana in any combination of {U} and/or {R}, where X is
  // Vivi Ornitier's power"). The bare-symbol arm below read the two symbols and dropped the X: one mana at any power, a 0/3
  // Vivi included. Now X is the metric, over exactly those two colours (the planner credits one activation as X of one of
  // them — an under-read of "any combination", never more); an unmodelled metric makes nothing.
  v = oracle.match(/\bAdd X mana in any combination of \{([WUBRGC])\} and\/or \{([WUBRGC])\}, (where X is [^.]+)/i);
  if (v) {
    const spec = parseManaMetric(v[3], card);
    if (spec) return { colors: [...new Set([v[1].toUpperCase(), v[2].toUpperCase()])], amount: 0, amountSpec: spec };
    return null;
  }

  // "Add <N> mana of any (one) color" → any of the five colors, amount = the QUANTITY word. The token
  // immediately before "mana of any …" is captured and parsed by parseFixedQuantity: "two"→2 (Zaxara),
  // "three"→3 (Black Lotus / Gilded Lotus), a digit→that number, an UNQUANTIFIED/unrecognized form (or a
  // bare "X" with no metric) → 1 (FN-safe default — never fabricate). Previously this hardcoded amount:1,
  // so the sim under-produced for every multi-mana any-color source (~60 corpus cards incl. the Lotuses,
  // Zaxara, Goldspan's Treasure). RUNTIME-ONLY: classifyCard never calls manaProduction, so the native-mana
  // tier is unchanged — this corrects only the runtime AMOUNT. The X-with-metric forms ("Add X mana …,
  // where X is …") already matched Shape B above (amountSpec), so they never reach here.
  // SHELF-85 S17 (2026-09-04 — Plaza of Heroes "{T}: Add one mana of any color among legendary permanents you control"):
  // ONE mana whose colour is drawn from the LIVE colours of the controller's legendary permanents. Placed BEFORE the
  // free any-colour arm, which used to swallow this line and launder it into an unrestricted any-colour source (a
  // colourless board still made every colour — the forbidden FP). `colorsAmongSpec` is resolved in manaSources; no
  // legendary permanent with a colour → the source is not offered (produce nothing, never a fabricated colour).
  if (/\badd one mana of any color among legendary permanents you control\b/i.test(oracle)) {
    return { colors: ["W", "U", "B", "R", "G"], amount: 1, colorsAmongSpec: { kind: "legendaryPermanentsYouControl" } };
  }
  // SHELF-85 Phase 3 (2026-09-05 — Incubation Druid "{T}: Add one mana of any type that a land you control could produce"):
  // ONE mana whose type is drawn from what the controller's LANDS can make right now (the Exotic Orchard / Reflecting Pool
  // family, read on the controller's own side). Same discipline as Plaza's arm: a colour set resolved LIVE in manaSources
  // (each land's own production ∪ its granted basic types), never the free any-colour arm — no land that makes a type means
  // the source is not offered. The card's "If this creature has a +1/+1 counter on it, add three mana of that type instead"
  // rider is read by manaProduction's "instead" read (2026-10-17): three of the same set while the counter is there.
  if (/\badd one mana of any type that a land you control could produce\b/i.test(oracle)) {
    return { colors: ["W", "U", "B", "R", "G", "C"], amount: 1, colorsAmongSpec: { kind: "landsYouControlCouldProduce" } };
  }
  // PLAZA OF HARMONY (2026-10-17 — the land {C} fallback): "{T}: Add one mana of any type that a Gate you control could produce." —
  // the same set narrowed to the controller's lands of one land type (CR 205.3i; landsCouldProduce's `subtype`). It parsed to
  // nothing, the land {C} fallback answered for it, and the land gate credited a line the engine never made.
  {
    const lt = oracle.match(/\badd one mana of any type that an? ([a-z']+) you control could produce\b/i);
    if (lt && lt[1].toLowerCase() !== "land" && LAND_TYPE_WORDS.has(lt[1].toLowerCase())) {
      return { colors: ["W", "U", "B", "R", "G", "C"], amount: 1, colorsAmongSpec: { kind: "landsYouControlCouldProduce", subtype: lt[1] } };
    }
  }
  // ── Three more colour sets the free any-colour arm below used to read as all five (2026-10-16). Each is resolved LIVE in
  // manaSources (colorsAmongFor); an empty set means the line makes no mana, never a fabricated colour.
  // MOX AMBER — "{T}: Add one mana of any color among legendary creatures and planeswalkers you control." Plaza's shape over a
  // narrower set: a legendary permanent counts only while it is a creature or a planeswalker (a legendary enchantment, land or
  // artifact gives it nothing).
  if (/\badd one mana of any color among legendary creatures and planeswalkers you control\b/i.test(oracle)) {
    return { colors: ["W", "U", "B", "R", "G"], amount: 1, colorsAmongSpec: { kind: "legendaryCreaturesAndPlaneswalkersYouControl" } };
  }
  // METEOR CRATER (2026-10-17) — "{T}: Choose a color of a permanent you control. Add one mana of that color." One mana of a colour
  // some permanent its controller controls has right now (CR 105.2; its ruling: colorless can't be chosen). It used to parse as no
  // mana and take the land's colourless fallback: {C} whatever the board, a coloured permanent or none.
  if (/\bchoose a color of a permanent you control\. add one mana of that color\b/i.test(oracle)) {
    return { colors: ["W", "U", "B", "R", "G"], amount: 1, colorsAmongSpec: { kind: "permanentsYouControl" } };
  }
  // "YOUR COMMANDER'S COLOR IDENTITY" — Command Tower, Arcane Signet, Commander's Sphere, Path of Ancestry, Hidden Hideout, Command
  // Mine / Command Power Plant (their "instead" upgrade is read by manaProduction's rider read, 2026-10-17). The colours are the
  // controller's commander's color identity (CR 903.4), read off the seat's stamp (commanderIdentity.commanderColorIdentityOf). No
  // commander, or one whose identity is unknown, leaves the quality undefined and the ability makes nothing (CR 903.4f); a
  // colourless commander names no colour, so nothing either.
  if (/\badd one mana of any color in your commander['’]s color identity\b/i.test(oracle)) {
    return { colors: ["W", "U", "B", "R", "G"], amount: 1, colorsAmongSpec: { kind: "commanderColorIdentity" } };
  }
  // "ANY COLOR THAT A LAND … COULD PRODUCE" (CR 106.7) — Exotic Orchard, Fellwar Stone, Quirion / Sylvok Explorer (a land an
  // opponent controls), Harvester Druid (a land you control), Star Compass (a basic land you control). Incubation Druid's
  // "any TYPE" form above includes colourless; these say "any COLOR", so {C} is never theirs (colorsOnly).
  {
    const cp = oracle.match(/\badd one mana of any color that a (basic )?land (you control|an opponent controls) could produce\b/i);
    if (cp) {
      const kind = /^you/i.test(cp[2]) ? "landsYouControlCouldProduce" : "landsOpponentsControlCouldProduce";
      return { colors: ["W", "U", "B", "R", "G"], amount: 1, colorsAmongSpec: { kind, colorsOnly: true, ...(cp[1] ? { basicOnly: true } : {}) } };
    }
  }
  // THE PAINFUL ANY-COLOUR LINE AS A WHOLE TEXT (2026-10-17 — the land lines; Grand Coliseum's and Tarnished Citadel's second line read
  // alone by the land gate — the two-line arm at the top reads their whole text): "{T}: Add one mana of any color. This land deals N
  // damage to you." The free any-colour arm below dropped the damage.
  const painAnyLine = String(oracle || "").trim().match(/^\{T\}: Add one mana of any color\.[^\n]*? deals (\d+) damage to you\.$/i);
  if (painAnyLine) return { colors: ["W", "U", "B", "R", "G"], amount: 1, painColors: ["W", "U", "B", "R", "G"], painAmount: parseInt(painAnyLine[1], 10) };
  // THE GREY HAVENS (2026-10-17 — the land lines): "{T}: Add one mana of any color among legendary creature cards in your
  // graveyard." One mana of a colour some legendary creature card in its controller's graveyard has (CR 202.2 — a card is the
  // colours of its mana cost); resolved live by colorsAmongFor, none → no mana. The free any-colour arm below read it as all five.
  if (/\badd one mana of any color among legendary creature cards in your graveyard\b/i.test(oracle)) {
    return { colors: ["W", "U", "B", "R", "G"], amount: 1, colorsAmongSpec: { kind: "legendaryCreatureCardsInYourGraveyard" } };
  }
  // ⛔ THE FREE ANY-COLOUR ARMS READ ONLY AN UNQUALIFIED "any color" (2026-10-17 — the land lines). Each qualified set this parser
  // reads has its own arm above; anything else written after "any (one) color" narrows or prices the mana — "signed in this
  // card's art box …" (Artist Alley), "that shares a color with a permanent a player controls" (Reflective Gate), "that appears
  // on your top" (The Big Top), "chosen as you drafted …" (Paliano, the High City), "and lose life equal to …" (Blustering
  // Barnyard) — and reading it as all five was a free any-colour source. These arms skip such a clause (the arms below still read
  // the card's other lines — Artist Alley's plain {C}); alone it makes nothing (FN-safe). After "any color" the sentence may end,
  // or go on with a comma, an "instead" rider (manaProduction reads it) or a "for each" count.
  const qualifiedAnyColor = (m) => !/^(?:\s*$|[.,]|\s+instead\b|\s+for each\b)/i.test(oracle.slice(m.index + m[0].length));
  const firstUnqualified = (re) => { for (const m of oracle.matchAll(re)) if (!qualifiedAnyColor(m)) return m; return null; };
  let any = firstUnqualified(/add\b[^.]*?\b(\S+)\s+mana of any(?: one)? color/gi);
  if (any) {
    const n = parseFixedQuantity(any[1]);
    return { colors: ["W", "U", "B", "R", "G"], amount: n == null ? 1 : n };
  }
  // FIXED ANY-COMBINATION (Rivaz of the Claw "{T}: Add two mana in any combination of colors." — the
  // Dragons-shelf restricted-source class, 2026-08-15): the fixed-amount sibling of Shape B directly
  // above, same all-five-colors planner semantics (per-pip color choice models "any combination"
  // exactly). Discovered as a HOLLOW spot: the Phase-4 witness hand-built its planner source, so the
  // production side silently never offered Rivaz's tap at all. The restriction is NOT read here —
  // restrictedManaProduction strips the "Spend this mana only …" sentence, re-parses through this arm,
  // and re-attaches the parsed restriction, so the credited source always carries it (no laundering).
  const anyCombo = oracle.match(/\bAdd (a|an|one|two|three|four|five|\d+) mana in any combination of colors/i);
  if (anyCombo) {
    // ⛔ MANA-PIP ACTIVATION COSTS REFUSE (caught on this arm's own first flip-diff): Terrarion
    // ("{2}, {T}, Sacrifice…") and Orb of Dragonkind ("{1}, {T}…") carry a mana cost the source model
    // has no field for — crediting them would mint the two mana WITHOUT the printed payment, strictly
    // better than the card (the forbidden FP). Only {T}/{Q} costs pass; a pip-bearing cost line
    // returns null and the card stays non-native (FN-safe).
    const line = oracle.split("\n").find((l) => /add\b.*\bmana in any combination of colors/i.test(l)) || "";
    const costSeg = line.includes(":") ? line.split(":")[0] : "";
    if (/\{(?![tq]\})[^}]*\}/i.test(costSeg)) return null;
    const n = parseFixedQuantity(anyCombo[1]);
    return { colors: ["W", "U", "B", "R", "G"], amount: n == null ? 1 : n };
  }
  // ⭐ PAINLAND (Shivan Reef, Adarkar Wastes, Karplusan Forest, Battlefield Forge, Llanowar Wastes, Caves of
  // Koilos, Yavimaya Coast, Brushland, Underground River, Sulfurous Springs — 10 corpus cards, all premium
  // fixing). Two separate {T} abilities:
  //     {T}: Add {C}.
  //     {T}: Add {U} or {R}. This land deals 1 damage to you.
  // parseAddClause reads the FIRST Add clause and stops, so every one of these modelled as COLORLESS ONLY —
  // a functional Wastes. Lands are credited native by BEING lands, so no coverage number ever showed it
  // (the third find of that blind spot this run).
  //
  // ⛔ THE LIFE COST IS WHY THIS IS NOT A ONE-LINE COLOUR UNION. Taking the coloured half and ignoring
  // "deals 1 damage to you" would hand the engine a PAINLESS painland — strictly better than printed, the
  // forbidden direction. The colours are admitted ONLY together with `painColors`/`painAmount`, which
  // commitManaTap applies when the tap actually picks one of them. Tapping for {C} costs nothing, exactly as
  // printed.
  //
  // Anchored to the whole two-line shape: any other rider (Mogg Hollows' "doesn't untap", the filter lands'
  // mana-cost activation) does NOT match and keeps its existing colourless read — a safe FN, and those are
  // scoped separately in the ledger.
  {
    // The optional leading "This land enters tapped." is the SLOW painland half of the cycle (Skyshroud
    // Forest, Scabland, Pine Barrens, Salt Flats, Caldera Lake) — the identical two abilities with an
    // enters-tapped rider in front. The original anchor started at "{T}: Add {C}" and so silently missed
    // FIVE of the fifteen. The rider itself needs no modelling here: entering tapped is handled on the
    // play-land path, and it cannot make the land produce anything it otherwise wouldn't.
    const pain = String(oracle || "").trim().match(
      /^(?:This land enters tapped\.\n)?\{T\}: Add \{C\}\.\n\{T\}: Add \{([WUBRG])\} or \{([WUBRG])\}\.[^\n]*? deals (\d+) damage to you\.$/i,
    );
    if (pain) {
      const a = pain[1].toUpperCase(), b = pain[2].toUpperCase();
      return { colors: ["C", a, b], amount: 1, painColors: [a, b], painAmount: parseInt(pain[3], 10) };
    }
    // THE PAINFUL PAIR AS A WHOLE TEXT (2026-10-17 — the land lines): "{T}: Add {W} or {B}. This land deals 1 damage to you." read by
    // itself — a painland's second line probed alone by the land gate (landLineMana), Murmuring Bosk's second line read as its own
    // record (PAIN_PAIR_MANA_LINE_RE). The bare arm below read the two colours and dropped the damage: a painless pair.
    const painPair = String(oracle || "").trim().match(/^\{T\}: Add \{([WUBRG])\} or \{([WUBRG])\}\.[^\n]*? deals (\d+) damage to you\.$/i);
    if (painPair) {
      const a = painPair[1].toUpperCase(), b = painPair[2].toUpperCase();
      return { colors: [a, b], amount: 1, painColors: [a, b], painAmount: parseInt(painPair[3], 10) };
    }
    // ⭐ SINGLE-ABILITY PAINLAND (the Odyssey threshold cycle — Cabal Pit, Barbarian Ring, Cephalid
    // Coliseum, Centaur Garden, Nomad Stadium — plus Fogwell's Gym, Elves of Deep Shadow, Ancient Tomb). ONE ability whose
    // every activation deals damage to its controller:
    //     "{T}: Add {B}. This land deals 1 damage to you."
    //     "{T}: Add {C}{C}. This land deals 2 damage to you."
    // Their first Add clause parsed fine and the damage rider was simply DROPPED. That is a PAINLESS painland:
    // strictly better than printed, already live in the FORBIDDEN direction.
    //
    // ⭐ ANY ONE SYMBOL, REPEATED (2026-10-16 — Ancient Tomb). This arm used to take ONE coloured symbol, so a colourless
    // bundle ("{C}{C}") fell through to the bare parse below and Ancient Tomb made {C}{C} with no damage at all. The symbol
    // may be any of the six and repeat; the amount is the count. Damage dealt to a player by a source without infect is
    // life lost (CR 120.3a) — commitManaTap's painLife, on the planner's tap and the explicit tap alike (tapRecordFor).
    //
    // ⭐ CONDITIONAL DAMAGE (2026-10-16 — Tomb of Urami: "deals 1 damage to you if you don't control an Ogre"). This used to be
    // excluded as unmodelled, which left the land PAINLESS whatever the board — the forbidden direction. The condition rides
    // the product as `painCondition` when the intervening-if evaluator can answer it, and manaSources leaves the damage off
    // only while it is FALSE as the ability resolves (CR 605.3b). A condition it cannot answer is not stamped, so the damage
    // is always dealt — worse than printed, the safe side.
    //
    // The `[^.\n]*?` covers the older printings that self-reference by name instead of "This land".
    const pain1 = String(oracle || "").trim().match(
      /^(?:This land enters tapped\.\n)?\{T\}: Add ((\{[WUBRGC]\})\2*)\. [^.\n]*? deals (\d+) damage to you(?: if ([^.\n]+))?\.(?:\n|$)/i,
    );
    if (pain1) {
      const col = pain1[2].charAt(1).toUpperCase();
      const condition = pain1[4] ? pain1[4].trim() : null;
      return { colors: [col], amount: pain1[1].length / 3, painColors: [col], painAmount: parseInt(pain1[3], 10), ...(condition && conditionIsExpressible(condition) ? { painCondition: condition } : {}) };
    }
    // ⭐ BLESSING-GATED PAIN (shelf D5, 2026-09-30 — Temur Elevator: "Ascend\n{T}: Add {G}, {U}, or {R}. If you don't
    // have the city's blessing, you lose 1 life."). Its first Add clause parsed and the life loss was DROPPED — a
    // painless tri-land, the forbidden direction, hidden only because the Ascend line kept the card parked. Now the
    // loss rides the painland fields with `painUnlessCitysBlessing`, and manaSources leaves the pain off once the
    // controller has the city's blessing (the one condition this reads — any other "If you don't …" stays unmatched).
    const blessingPain = String(oracle || "").trim().match(
      /^(?:Ascend(?: \([^)\n]*\))?\n)?\{T\}: Add \{([WUBRG])\}, \{([WUBRG])\}, or \{([WUBRG])\}\. If you don't have the city['’]s blessing, you lose (\d+) life\.$/i,
    );
    if (blessingPain) {
      const cols = [blessingPain[1], blessingPain[2], blessingPain[3]].map((c) => c.toUpperCase());
      return { colors: cols, amount: 1, painColors: cols, painAmount: parseInt(blessingPain[4], 10), painUnlessCitysBlessing: true };
    }
  }
  // The no-quantity form ("Add mana of any color") — keep the original FN-safe amount:1; unqualified only, as above.
  if (firstUnqualified(/add\b[^.]*\bmana of any(?: one)? color/gi)) return { colors: ["W", "U", "B", "R", "G"], amount: 1 };

  // CHOSEN-COLOR LEG (LANDS-TIER slice 12, 2026-09-03) — "{T}: Add one mana of the chosen color." (Night Market,
  // Uncharted Haven, Crossroads Village …) and "{T}: Add {U} or one mana of the chosen color." (the Thriving
  // lands, the Gates). The color is not printed: it is the `chosenColor` stamped on the PERMANENT as it
  // entered (both enter sites; CR 614.12b's durable choice). The spec carries `chosenColor: true` and only
  // the FIXED option (if any) in `colors`; manaSources resolves the leg against the live permanent, and an
  // unstamped permanent yields only its fixed option (or nothing) — never a fabricated color (CREED).
  // ⛔ ONLY when the card itself prints the choice ("As … enters, choose a color") — the sentence the enter
  // sites stamp from. A mana line that names "the chosen color" with no choice on the card has no stamp to
  // read and must stay unparsed (an unreachable source credited native-mana is the FP the reachability pins
  // guard). The check is a local regex, not the static reader, to keep this module a leaf.
  // + THE AMOUNT AND THE NAME-LED CHOOSER (play-weighted #890, 2026-10-17 — Throne of Eldraine "{T}: Add four mana of the chosen
  // color.", "As Throne of Eldraine enters, choose a color."): N mana of the one chosen colour, the chooser read by the static
  // reader the enter sites stamp through (choosesColorOnEnter — it reads the card's own name too). A fixed option beside the
  // chosen colour stays the one-mana form only.
  const cc = oracle.match(/\bAdd (?:\{([WUBRG])\} or )?(one|two|three|four|five) mana of the chosen color\b/i);
  if (cc && (cc[2].toLowerCase() === "one" || !cc[1])
      && (/\bas (?:it|this [a-z]+) enters, choose a color\b/i.test(oracle) || choosesColorOnEnter(card))) {
    return { colors: cc[1] ? [cc[1].toUpperCase()] : [], amount: CHOSEN_COLOR_AMOUNT_WORDS[cc[2].toLowerCase()], chosenColor: true };
  }
  const m = oracle.match(/Add ([^.]*)/i);
  if (!m) return null;
  const clause = m[1];
  const symbols = [...clause.matchAll(/\{([WUBRGC])\}/gi)].map(x => x[1].toUpperCase());
  if (symbols.length === 0) return null;

  const unique = [...new Set(symbols)];
  // " or " between symbols = the player CHOOSES one (amount 1, several options).
  // Plain concatenation ("{C}{C}") = produces all of them (amount = count).
  if (/\bor\b/i.test(clause)) {
    return { colors: unique, amount: 1 };
  }
  // ⭐ MIXED FIXED BUNDLE (the karoo / signet family — "Add {G}{W}", 51 corpus cards incl. every bounce land
  // and every Signet). A plain concatenation of DIFFERENT colors produces ONE OF EACH, simultaneously — it is
  // not a choice and not N-of-one-color. Without the per-color tally the planner's primary component picked a
  // single color and credited `amount` of it, which was wrong in BOTH directions, measured on the real card:
  // a Selesnya Signet REFUSED {G}{W} (the only thing it actually does — a false negative) and PAID {G}{G}
  // (which it cannot — the forbidden false positive).
  //
  // `amount` is left as the total so every existing consumer (the multiplier, the 0-amount drop, the tap
  // record) keeps reading the same field; `fixed` is the per-color breakdown the planner spends. Stamped ONLY
  // when >1 distinct color, so every single-color source ("{C}{C}", "{G}") keeps its exact previous shape.
  if (unique.length > 1) {
    const fixed = {};
    for (const s of symbols) fixed[s] = (fixed[s] || 0) + 1;
    return { colors: unique, amount: symbols.length, fixed };
  }
  return { colors: unique, amount: symbols.length };
}

/**
 * Does this card's MANA ability pay for itself by SACRIFICING the source — a ONE-SHOT mana
 * artifact/token (Treasure / Gold / Lotus Petal) — rather than a repeatable tap source? True when the
 * line whose effect is the "Add …" clause carries "Sacrifice this/~" in its COST (left of the colon).
 * The mana subsystem sacrifices such a source on use instead of just tapping it, so it can't ramp
 * forever (the TOK-2 correctness invariant: a minted Treasure is one mana, then gone). Precise
 * per-line so a normal rock ("{T}: Add {C}") or dork ("{T}: Add {G}") is never flagged.
 */
function manaAbilitySacrificesSelf(oracle) {
  for (const line of String(oracle || "").split(/\n+/)) {
    const ci = line.indexOf(":");
    if (ci === -1) continue;
    if (/\badd\b/i.test(line.slice(ci + 1)) && /\bsacrifice (?:this|~)\b/i.test(line.slice(0, ci))) return true;
  }
  return false;
}

/**
 * Does this card's MANA ability require tapping ({T} in its COST — left of the colon)? Summoning
 * sickness (CR 302.6) gates a {T}/{Q} ability, but a NON-tap mana ability — a sac-for-mana Eldrazi
 * Spawn / Treasure ("Sacrifice this token: Add {C}") — is usable the turn the creature enters, so a
 * freshly-made Spawn can ramp immediately (the WALT-TOKEN-ABIL token-mana correctness invariant).
 * Precise per-line so the flag reflects the line whose effect is the "Add …" clause.
 */
function manaAbilityRequiresTap(oracle) {
  for (const line of String(oracle || "").split(/\n+/)) {
    const ci = line.indexOf(":");
    if (ci === -1) continue;
    if (/\badd\b/i.test(line.slice(ci + 1)) && /\{t\}/i.test(line.slice(0, ci))) return true;
  }
  return false;
}

/**
 * EXILE-FROM-GRAVEYARD mana cost (Molt Tender "{T}, Exile a card from your graveyard: Add one mana of
 * any color", 2026-08-15) — the ONE consumable the sub-system now actually PAYS: commitManaTap exiles a
 * graveyard card when the tap commits, and the availability gate skips the source when the graveyard is
 * empty, so the carve out of the phantom-mana gate below mints nothing it doesn't pay for. Precise
 * per-line, mirroring manaAbilitySacrificesSelf; the exact bare-article wording only ("a card" — a
 * typed/counted exile stays consumable → refused, FN-safe).
 */
function manaAbilityExilesGyCard(oracle) {
  for (const line of String(oracle || "").split(/\n+/)) {
    const ci = line.indexOf(":");
    if (ci === -1) continue;
    if (/\badd\b/i.test(line.slice(ci + 1)) && /(?:^|,)\s*exile a card from your graveyard\s*$/i.test(line.slice(0, ci))) return true;
  }
  return false;
}

/**
 * The EFFECT text (right of the colon) of a card's ACTIVATED mana ability — the line whose COST is left of a
 * colon and whose effect contains "Add" ({T}: Add … / a sac or mana cost : Add …). Returns null when the
 * card has NO activated mana ability — a bare or TRIGGERED/ETB "Add …" (Hidden Herbalists' "Revolt — When
 * this enters, … add {G}{G}", Mardu Warshrieker's Raid) is a ONE-SHOT, not a repeatable mana source. Without
 * this gate, manaProduction read such a clause and `manaSources` minted a PHANTOM standing source the sim
 * tapped every turn for free, ignoring the ETB-once + the Revolt/Raid condition (a confirmed P1 FP). Parsing
 * the activated line specifically also fixes a card carrying BOTH an ETB "add" and a real "{T}: Add" (reads
 * the activated one, not the first). Per-line, mirroring manaAbilityRequiresTap.
 */
/**
 * SACRIFICE-A-CREATURE MANA COST (SG-3, 2026-09-03 — Ashnod's Altar "Sacrifice a creature: Add {C}{C}",
 * Phyrexian Altar "Sacrifice a creature: Add one mana of any color"; the Squirrel Girl deck). Carved OUT of the
 * phantom-mana refusal exactly as the exile-from-graveyard cost was, because it is now PAID for real:
 * manaSources gates the source on ANOTHER creature the controller controls, and commitManaTap sacrifices the
 * least-valuable one through the dies chokepoint (dies triggers fire — a sacrificed creature dies, CR 700.4).
 * The cost must be exactly "Sacrifice a creature" (optionally after "{T},"); "Sacrifice an artifact" /
 * "Sacrifice a Saproling" and any rider stay refused (the phantom-mana FN).
 */
function manaAbilitySacrificesCreature(oracle) {
  // ⛔ EVERY activated mana line must carry the cost, not just one: the production is parsed off the card as a
  // whole (the first "Add"), so a card with a FREE "{T}: Add {C}" line beside a "{T}, Sacrifice a creature:
  // Add {B}{B}" line (Phyrexian Tower) keeps its free tap and must NOT be stamped with a sacrifice it never
  // pays for — that flag would sacrifice a creature on every {C}. Such a card's sac line stays an under-offer.
  const manaLines = String(oracle || "").split(/\n+/).filter((line) => {
    const ci = line.indexOf(":");
    return ci !== -1 && /\badd\b/i.test(line.slice(ci + 1));
  });
  if (!manaLines.length) return false;
  return manaLines.every((line) => /^(?:\{t\},\s*)?sacrifice a creature\s*$/i.test(line.slice(0, line.indexOf(":")).trim()));
}

/**
 * SACRIFICE-A-FOOD MANA COST (play-weighted #803, 2026-10-17 — Gilded Goose "{T}, Sacrifice a Food: Add one mana of any color.").
 * The Altars' twin with another victim kind, paid for real the same way: manaSources offers the source only while its controller
 * controls a Food other than the source (CR 118.3), and commitManaTap sacrifices the least valuable one through the cost
 * sacrifice. Every activated mana line must carry exactly this cost (optionally after "{T},") — the creature twin's all-lines
 * rule; any other sacrifice ("an artifact", "a Saproling") stays refused.
 */
function manaAbilitySacrificesFood(oracle) {
  const manaLines = String(oracle || "").split(/\n+/).filter((line) => {
    const ci = line.indexOf(":");
    return ci !== -1 && /\badd\b/i.test(line.slice(ci + 1));
  });
  if (!manaLines.length) return false;
  return manaLines.every((line) => /^(?:\{t\},\s*)?sacrifice a food\s*$/i.test(line.slice(0, line.indexOf(":")).trim()));
}

/**
 * EXILE-FROM-HAND MANA (SG-6, 2026-09-03 — Elvish Spirit Guide "Exile this card from your hand: Add {G}", Simian
 * Spirit Guide "… Add {R}"; 2 corpus cards). A mana ability of a card IN HAND (CR 605.1a — a mana ability may
 * be activated from any zone its cost allows): the production carries `fromHand`, manaSources walks the HAND
 * for such cards (and never offers the same card as a battlefield tap — the ability does not exist there),
 * and commitManaTap exiles the card instead of tapping a permanent. Exactly "Exile this card/creature from
 * your hand"; any other zone or rider stays refused (the phantom-mana FN).
 */
function manaAbilityExilesSelfFromHand(oracle) {
  for (const line of String(oracle || "").split(/\n+/)) {
    const ci = line.indexOf(":");
    if (ci === -1) continue;
    // The effect half must be the bare "Add <symbols>." — a rider after it ("Activate only during your turn")
    // would be silently dropped by the hand-source path, so such a line is refused (the FN direction).
    if (/^\s*add (?:\{[wubrgc]\})+\.?\s*$/i.test(line.slice(ci + 1)) && /^exile this (?:card|creature) from your hand$/i.test(line.slice(0, ci).trim())) return true;
  }
  return false;
}

function activatedManaText(oracle) {
  for (const line of String(oracle || "").split(/\n+/)) {
    const ci = line.indexOf(":");
    if (ci === -1) continue;
    const rhs = line.slice(ci + 1);
    if (/\badd\b/i.test(rhs)) return rhs;
  }
  return null;
}

// The COST (left of the colon) of every ACTIVATED mana line ("<cost>: Add …"), in oracle order. The first
// entry is the line manaProduction MODELS (parseAddClause / manaAbilityRequiresTap read the first "Add").
function activatedManaCosts(oracle) {
  const costs = [];
  for (const line of String(oracle || "").split(/\n+/)) {
    const ci = line.indexOf(":");
    if (ci === -1) continue;
    if (/\badd\b/i.test(line.slice(ci + 1))) costs.push(line.slice(0, ci));
  }
  return costs;
}

// Can the SIM actually PAY this activation cost when it taps a standing mana source? True for a {T} cost
// (tap — gated by summoning sickness), a self-SACRIFICE (cracked on use, flagged `sacrifices`), or a PURE
// MANA cost ({…} symbols, nothing else — a mana FILTER the sim pays from its pool, e.g. Prismite
// "{2}: Add one mana of any color"; a {Q} line — Pili-Pala — never reaches here, manaLineRefused drops it). These three are the only repeatable/standing
// costs the mana subsystem models — everything else (a non-self sacrifice, pay-life, discard, remove-counter,
// exile, tap-OTHER-permanents, return-to-hand) is a resource the sim doesn't spend.
/**
 * TAP-OTHER COST — parse "Tap N untapped <filter> you control" out of a mana ability's cost, or null.
 *
 * Returns `{ count, filter }` where filter is "creature" | a creature subtype (lowercased) | "token" |
 * "food" — the vocabulary the corpus actually prints for this shape. A filter outside that set returns null
 * and the card keeps its refusal (CREED: an un-enforced payer filter would let the sim tap something the
 * card never allowed).
 *
 * ⛔ SUMMONING SICKNESS DOES NOT APPLY TO THE PAYERS (CR 302.6). Sickness restricts the {T} symbol in a
 * creature's OWN cost; "Tap an untapped creature you control" is a cost of the SOURCE's ability, so a
 * just-played creature is a legal payer. The naive implementation filters payers by `!summoningSick` and is
 * wrong in the RESTRICTIVE direction — a safe FN, but a real fidelity loss on exactly the turn these cards
 * are meant to matter. Pinned in the test rather than left to a future reader's memory.
 */
/**
 * PAY-LIFE COST — parse "Pay N life" out of a mana ability's cost, or null.
 *
 * ⭐ THE SIM CAN PAY THIS. The compound-cost guard lumps pay-life in with the consumables it refuses
 * (discard, remove-counter, exile, return-to-hand) because none of them were spendable — but LIFE is tracked
 * state with a `loseLife` mutator, so the cost is payable in exactly the way tap-OTHER now is: gate the
 * source on affordability at manaSources, and actually spend it at commit.
 *
 * ⛔ Fixed amounts only, and the REST of the cost must be {T} / mana symbols. A second consumable (Hazel of
 * the Rootbloom pays life AND taps X tokens) leaves residue and refuses — this graduates ONE more cost kind,
 * not the guard entirely.
 */
function parsePayLifeCost(oracle) {
  const line = String(oracle || "").split(/\n+/).find((l) => /:/.test(l) && /\badd\b/i.test(l.split(":").slice(1).join(":")));
  if (!line) return null;
  const cost = line.split(":")[0] || "";
  const m = cost.match(/\bpay (\d+) life\b/i);
  if (!m) return null;
  const rest = cost.replace(m[0], " ").replace(/\{[^}]*\}/g, " ").replace(/[\s,]/g, "");
  if (rest !== "") return null;
  return { amount: parseInt(m[1], 10) };
}

function parseTapOtherCost(oracle) {
  const line = String(oracle || "").split(/\n+/).find((l) => /\btap (?:an|two|three|a)\b[^:]*:/i.test(l) && /\badd\b/i.test(l));
  if (!line) return null;
  const cost = line.split(":")[0] || "";
  // One qualifier word is read: "legendary" (Relic of Legends' "Tap an untapped legendary creature you control" — play-weighted
  // #535, 2026-10-17), which makes the filter the two-word "legendary creature". Any other qualifier ("blue creature", "nontoken
  // artifacts") is no match here and refuses, as before.
  const m = cost.match(/\btap (an|a|two|three) untapped (legendary )?([a-z]+)s? you control\b/i);
  if (!m) return null;
  const count = { a: 1, an: 1, two: 2, three: 3 }[m[1].toLowerCase()];
  if (!count) return null;
  // ⚠️ THE PAYER NOUN IS PLURAL WHENEVER THE COUNT IS, and the first cut of this missed it entirely: `([a-z]+)s?`
  // is GREEDY, so "two untapped Elves" captured "elves" and "two untapped creatures" captured "creatures" —
  // neither in the allowlist, so every count>1 card silently kept its refusal while the count==1 cards flipped.
  // A partial flip across identical printed shapes, which is the same tell that uncovered the destroy-CREATURE
  // lead hole earlier today. De-pluralize against the allowlist rather than widening it with plural spellings,
  // so the vocabulary stays one entry per real noun.
  const raw = m[3].toLowerCase();
  const qualifier = m[2] ? m[2].toLowerCase() : "";
  const candidates = [raw];
  if (raw.endsWith("ves")) candidates.push(`${raw.slice(0, -3)}f`);   // elves → elf
  if (raw.endsWith("s")) candidates.push(raw.slice(0, -1));            // creatures → creature
  const filter = candidates.map((c) => qualifier + c).find((c) => TAP_OTHER_FILTERS.has(c));
  // The payer vocabulary the corpus prints for this shape. Anything else → null → the card keeps its refusal.
  if (!filter) return null;
  // The REST of the cost must be modelable on its own terms — a {T} and/or mana symbols. A third consumable
  // (remove a counter, pay life) still refuses: this graduates ONE cost kind, not the compound guard entirely.
  const rest = cost.replace(m[0], " ").replace(/\{[^}]*\}/g, " ").replace(/[\s,]/g, "");
  if (rest !== "") return null;
  return { count, filter };
}
// Each entry earned its place by MEASUREMENT — a parked mana card whose only blocker was this noun. "permanent"
// (Gene Pollinator, cdh) and "druid" (Seton, Krosan Protector) were added 2026-07-29 on that basis; the corpus
// prints many other payer nouns, but on tap-for-EFFECT abilities this seam never sees. "legendary creature" (Relic of Legends,
// play-weighted #535) was added 2026-10-17 on the same basis.
const TAP_OTHER_FILTERS = new Set(["creature", "elf", "token", "food", "artifact", "permanent", "druid", "legendary creature"]);

/** Is this battlefield permanent a CREATURE right now (layer 4, CR 613.1d — the type-line audit)? A God below its devotion, a
 *  bestowed Aura, an attached reconfigure Equipment and a slumbering Arixmethes are not; an animated land or a crewed Vehicle is.
 *  The Altar victim pool and its offer gates read it, so none of them feeds a non-creature as one. Its face that is up (CR 712.8d —
 *  layers.permanentHasCardType): a Westvale Abbey or a Fable of the Mirror-Breaker is no creature, whatever its back face prints. */
function isCreatureNow(state, perm) {
  return !!perm && permanentHasCardType(state, perm.id, "Creature");
}

/** Is this battlefield permanent a FOOD right now (an artifact type, CR 205.3g — any Food artifact: a Food token, Tough Cookie)?
 *  Gilded Goose's "Sacrifice a Food" victim pool and its offer gates read it (play-weighted #803, 2026-10-17). */
function isFoodNow(state, perm) {
  return !!perm && permanentSubtypes(state, perm.id).some((st) => String(st).toLowerCase() === "food");
}

/** The victim test of a source's "Sacrifice a <kind>" cost (a creature for the Altars, a Food for Gilded Goose), or null. */
function sacVictimTest(s) {
  if (s?.sacrificesCreature) return isCreatureNow;
  if (s?.sacrificesFood) return isFoodNow;
  return null;
}

/**
 * ONE VICTIM PER SACRIFICE COST (2026-10-17). A mana ability is activated like any activated ability (CR 605.3, 602.2b): its whole
 * cost is paid first (CR 601.2h — no partial payment; CR 118.3 — no resources, no payment) and only then does it resolve and add
 * its mana (CR 605.3b). Two sources that each print "Sacrifice a creature" / "Sacrifice a Food" therefore can't share one victim:
 * the first activation sacrifices it and the second has nothing to pay with. The planner (planPaymentCore's claims), affordability
 * (canAfford runs the same planner) and the commit (commitPaymentPlan) all assign through assignSacVictims below.
 *   · picksSacVictim — a record or tap whose cost sacrifices ANOTHER permanent of a kind (the Altars, Phyrexian Tower's and
 *     Lazotep Quarry's second lines, Thermopod, Gilded Goose);
 *   · leavesAsItPays — a record or tap whose own permanent leaves as it commits (a self-sacrifice — a Treasure, an Eldrazi Spawn
 *     — or a depletion land's last counter): it commits before any victim is picked, so it can't be anyone's victim.
 */
const picksSacVictim = (s) => !!(s?.sacrificesCreature || s?.sacrificesFood);
const leavesAsItPays = (s) => !!(s?.sacrifices || s?.sacrificeIfNoCounters);
/**
 * + THE OTHER RESOURCES A COST CONSUMES (2026-10-17, the follow-up). The same rule holds two more shared resources:
 *   · picksGyCard — "Exile a card from your graveyard" (Molt Tender, Rubble Rouser): one DISTINCT graveyard card per activation
 *     (`gyExileIds` on the record, the graveyard's cards; the same assignment as the sacrifices — a card is never a permanent, so
 *     the two pools never meet);
 *   · paysLife — "Pay N life" (Treasonous Ogre, Mana Confluence, the horizon lands and 28 more): a player may pay life only up to
 *     their life total (CR 119.4), so the payment's life costs together must fit; the engine keeps its per-source policy for the
 *     whole payment — at least 1 life left (`lifeAvail`, the controller's life when manaSources read the record).
 * `claimsResource` — a record whose cost takes from one of these pools (or a sacrifice victim).
 */
const picksGyCard = (s) => !!s?.exilesGyCard;
const paysLife = (s) => s?.payLife != null && s.payLife > 0;
const claimsResource = (s) => picksSacVictim(s) || picksGyCard(s) || paysLife(s);

/** The ids of the permanents `player` controls that can feed source record `prod`'s sacrifice cost NOW (never the source), or
 *  null when `prod` sacrifices no other permanent. manaSources stamps them on the record (`sacVictimIds`). */
function sacVictimIdsFor(state, player, sourceId, prod) {
  const isVictim = sacVictimTest(prod);
  return isVictim ? (player.battlefield || []).filter((p) => p.id !== sourceId && isVictim(state, p)).map((p) => p.id) : null;
}

/**
 * THE ORDER THE SACRIFICES COMMIT IN, for `entries` ([{ source, candidates }]) and the chosen `victims` (an id or null per entry):
 * a source that is another entry's victim pays first (it is tapped or activated, then sacrificed — Gilded Goose eats its Food,
 * then Phyrexian Altar eats the Goose); otherwise entry order. Null when two sources would each have to go first (each the
 * other's victim — two Thermopods), which no order can pay.
 */
function sacCommitOrder(entries, victims) {
  const n = entries.length;
  const before = entries.map(() => new Set());
  for (let i = 0; i < n; i++) {
    if (victims[i] == null) continue;
    for (let j = 0; j < n; j++) if (j !== i && entries[j].source === victims[i]) before[i].add(j);
  }
  const order = [];
  const placed = new Set();
  while (order.length < n) {
    let next = -1;
    for (let i = 0; i < n && next < 0; i++) if (!placed.has(i) && [...before[i]].every((j) => placed.has(j))) next = i;
    if (next < 0) return null;
    placed.add(next);
    order.push(next);
  }
  return order;
}

/** The most entries a distinct-victim assignment can serve, order ignored (augmenting paths) — an upper bound for the search. */
function sacMatchingBound(entries) {
  const owner = new Map(); // victim id → entry index
  const augment = (i, seen) => {
    for (const v of entries[i].candidates) {
      if (seen.has(v)) continue;
      seen.add(v);
      if (!owner.has(v) || augment(owner.get(v), seen)) { owner.set(v, i); return true; }
    }
    return false;
  };
  let n = 0;
  for (let i = 0; i < entries.length; i++) if (augment(i, new Set())) n++;
  return n;
}

/**
 * ASSIGN ONE DISTINCT VICTIM TO EACH SACRIFICE COST. `entries` — [{ source, candidates }], the candidates in preference order (the
 * commit lists the least valuable first). Returns { victims, order } — a victim id per entry and an order sacCommitOrder accepts —
 * or null. Without `allowSkip` every entry must get a victim (the planner's question: can these claims all be paid?). With it
 * (the commit, against the live board) an entry may get none — that cost is unpaid and its source makes nothing — and the
 * assignment serving the most entries wins, the earlier entries taking their earlier candidates. Depth-first; the claims of one
 * payment are a handful, and the search stops at the matching bound.
 */
function assignSacVictims(entries, { allowSkip = false } = {}) {
  const n = entries.length;
  if (!n) return { victims: [], order: [] };
  const bound = sacMatchingBound(entries);
  if (!allowSkip && bound < n) return null;
  const pick = new Array(n).fill(null);
  const used = new Set();
  let best = null;
  let bestCount = -1;
  const dfs = (i, count) => {
    if (bestCount === bound || count + (n - i) <= bestCount) return;
    if (i === n) {
      const order = sacCommitOrder(entries, pick);
      if (order) { best = { victims: [...pick], order }; bestCount = count; }
      return;
    }
    for (const v of entries[i].candidates) {
      if (used.has(v)) continue;
      used.add(v);
      pick[i] = v;
      dfs(i + 1, count + 1);
      used.delete(v);
      pick[i] = null;
      if (bestCount === bound) return;
    }
    if (allowSkip) dfs(i + 1, count);
  };
  dfs(0, 0);
  return best;
}

/** Can every consumed cost among these planner records (one payment's claims) be paid? Each sacrifice its own victim (a record that
 *  leaves as it pays takes its permanent out of every candidate list first), each graveyard exile its own card, and the life costs
 *  together leave at least 1 life (CR 119.4; the per-source policy, for the whole payment). A life record whose `lifeAvail` is
 *  unknown (a hand-built record) adds no budget check. */
function consumedClaimsPayable(records) {
  const gone = new Set(records.filter(leavesAsItPays).map((r) => r.permanentId));
  const entries = [
    ...records.filter(picksSacVictim).map((r) => ({ source: r.permanentId, candidates: (r.sacVictimIds || []).filter((id) => !gone.has(id)) })),
    ...records.filter(picksGyCard).map((r) => ({ source: r.permanentId, candidates: r.gyExileIds || [] })),
  ];
  if (entries.length && assignSacVictims(entries) === null) return false;
  const lifeRecords = records.filter((r) => paysLife(r) && r.lifeAvail != null);
  if (lifeRecords.length) {
    const life = Math.min(...lifeRecords.map((r) => r.lifeAvail));
    if (!(life > lifeRecords.reduce((n, r) => n + r.payLife, 0))) return false;
  }
  return true;
}

/** The commit's victim preference: the least valuable first — lowest mana value, then name (SG-3, the house pick). */
function victimValueOrder(a, b) {
  const mvOf = (p) => { const cost = String(p.card?.mana_cost || p.card?.mana || ""); let n = 0; for (const m of cost.matchAll(/\{([^}]+)\}/g)) n += /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : (m[1] === "X" ? 0 : 1); return n; };
  return mvOf(a) - mvOf(b) || String(a.card?.name || "").localeCompare(String(b.card?.name || ""));
}

/** The live victims of tap `tap`'s sacrifice cost on `state`, least valuable first: the controller's permanents of its kind NOW,
 *  never its source, never one the action's own costs still need (`reserved`). */
function liveSacVictims(state, playerId, tap, reserved) {
  const isVictim = sacVictimTest(tap);
  if (!isVictim) return [];
  return (state.players[playerId]?.battlefield || [])
    .filter((p) => p.id !== tap.permanentId && !reserved?.has(p.id) && isVictim(state, p))
    .sort(victimValueOrder);
}

/** The live graveyard cards tap `tap`'s exile cost may take on `state`, oldest first (Molt Tender's house pick): never one the
 *  action's own costs still need (`reserved` — the card it exiles, the card cast or activated from the graveyard). */
function liveGyCards(state, playerId, reserved) {
  return (state.players[playerId]?.graveyard || []).filter((c) => !reserved?.has(c.id));
}

/** Is this card a CREATURE by printed type? Used only to scope the payer-ordering sickness key. */
function isCreatureCardType(card) {
  return new RegExp(`\\bcreature\\b`, "i").test(String(card?.type || card?.type_line || ""));
}

/** Does a battlefield permanent match a printed tap-OTHER payer filter? Front-face type line — and, for a creature-type filter
 *  ("Tap an untapped Elf you control"), every creature type (P·39: a changeling, Mirror Entity's activation, an animated Mutavault). */
function matchesTapOtherFilter(state, perm, filter) {
  const tl = String(perm?.card?.type || perm?.card?.type_line || "").toLowerCase();
  // A CARD TYPE is the one it has now (layer 4 — the type-line audit): Springleaf Drum's "Tap an untapped creature you control"
  // can't tap a God below its devotion, and can tap an animated land; its face that is up (CR 712.8d), so a Westvale Abbey is no
  // creature to tap. A subtype stays the printed word (or every creature type).
  const CARD_TYPE_WORDS = { creature: "Creature", artifact: "Artifact", land: "Land", enchantment: "Enchantment" };
  const word = (w) => (CARD_TYPE_WORDS[w] ? permanentHasCardType(state, perm.id, CARD_TYPE_WORDS[w])
    : new RegExp(`\\b${w}\\b`).test(tl) || permIsEveryCreatureType(state, perm.id));
  if (filter === "token") return !!perm?.card?.token || !!perm?.token;
  // ⛔ "PERMANENT" MUST NOT GO THROUGH THE WORD-BOUND TEST. The word never appears in a type line, so
  // `\bpermanent\b` is a gate NO printed card can satisfy — the source would be built, then never offered,
  // and Gene Pollinator would look modeled while producing nothing. That is the VACUOUS FILTER this codebase
  // has shipped twice before (Norn's Choirmaster, Keleth) and it is silent in every metric. Everything on a
  // battlefield IS a permanent (CR 110.1), so the honest predicate is "yes".
  if (filter === "permanent") return true;
  // "legendary creature" (Relic of Legends): the supertype and the card type it has NOW (layer 4 — a creature that became a
  // copy of a nonlegendary one is no payer; an animated legendary land is).
  if (filter === "legendary creature") return permanentHasCardType(state, perm.id, "Legendary") && permanentHasCardType(state, perm.id, "Creature");
  return word(filter);   // card type (creature / artifact) or subtype (elf / druid / food) — word-bound test
}

// The SELF-SACRIFICE a mana cost may carry — "Sacrifice this artifact", "Sacrifice this token", "Sacrifice ~": the phrase and
// ONE noun. Anything written after the noun ("Sacrifice this artifact and a creature") is left behind as residue.
const SELF_SAC_COST_RE = /\bsacrifice (?:this [a-z]+|~)/gi;
// A SELF-INCLUDED GROUP GRANT — Basal Sliver's "All Slivers have \"Sacrifice this permanent: Add {B}{B}.\"" on a Sliver.
// stripNonSelfQuotedGrants has already removed every quoted grant the card is not inside, so a has/have quote still here
// is the card's own ability, and its cost starts at the opening quote: "All Slivers have" is the grant, not a cost item.
// (The matcher is that function's own subject shape.) Only has/have: a "gain" quote (Rain of Filth's lands until end of
// turn) or a sharing clause (Oddric, Lunar Marquis — "the activated ability \"Sacrifice this creature: Add {C}.\"", which
// Oddric has only while another creature of his controller does) is never the card's own standing ability, so its text
// stays residue and the line refuses.
const SELF_GRANT_PREAMBLE_RE = /^[^.\n"“]*?\bha(?:ve|s)\b[^.\n"“]*?["“]/i;

function manaCostModelable(cost) {
  // ONE RESIDUE RULE FOR EVERY COST SHAPE: drop a self-included grant's preamble, then strip the mana symbols ({T}, {Q} and
  // the pips manaActivationCost charges), a SELF-sacrifice (the production flags `sacrifices` and the commit path cracks the
  // source — Treasure / Gold / Lotus Petal / Eldrazi Spawn) and the separators; the cost is modelable only when NOTHING is
  // left.
  //
  // COMPOUND-COST GUARD (SHELF S7 audit catch — Sphere of the Suns / Channeler Initiate / Spell Satchel / Springleaf Drum):
  // "{T}, Remove a charge counter …" / "{T}, Tap an untapped creature …" is NOT a plain tap dork — riding the {T} half
  // alone minted PHANTOM mana every turn (the consumable half was never spent, never even required).
  //
  // ⛔ THE SELF-SACRIFICE HALF IS HELD TO THE SAME RULE. It used to be its own branch that accepted ANY cost containing a
  // self-sacrifice, so Lion's Eye Diamond ("Discard your hand, Sacrifice this artifact: Add three mana of any one color.")
  // and Overeager Apprentice ("Discard a card, Sacrifice this creature: Add {B}{B}{B}.") were plain one-shot sources —
  // three mana for the sacrifice, the discard never charged nor required (driven on a board: Phyrexian Arena cast off
  // either card with the whole hand kept). Cheaper than printed, the forbidden direction. Both now refuse, an honest
  // under-offer until the discard is paid for real — and Lion's Eye Diamond needs more than a payment flag: "Activate only
  // as an instant" (CR 602.5e) means only while its controller has priority, never in the middle of paying a cost (CR
  // 601.2g / 605.3a), so the auto-payer can never crack it, and the hand it discards still holds any card about to be
  // cast from it.
  return cost.replace(SELF_GRANT_PREAMBLE_RE, "").replace(/\{[^}]*\}/g, " ").replace(SELF_SAC_COST_RE, " ").replace(/[\s,]/g, "") === "";
}

// ── A MANA LINE NO RECORD CAN HONOUR (2026-10-17) ───────────────────────────────────────────────────────────────────────────
// The cost items a mana record carries and the commit actually pays, each with the field that pays it: {T} (the tap) and the
// mana pips (activationCost — manaActivationCost / the planner's funding); a self-sacrifice (`sacrifices`); "Pay N life"
// (`payLife`); "Tap N untapped <filter> you control" (`extraTap`); "Sacrifice a creature" (`sacrificesCreature`); "Exile a card
// from your graveyard" (`exilesGyCard`); "Exile this card from your hand" (`fromHand`); the storage and no-{T} counter removals
// (`removesCounters`); a {T} single-counter removal and Wall of Roots' -0/-1 counter (`removesCounters` mode "one",
// `putsCounter` — 2026-10-17, each admitted only in its whole anchored line: ONE_COUNTER_MANA_LINE_RE / PUT_COUNTER_MANA_LINE_RE).
// Each reader below still applies its own stricter shape; this list only says what COULD be paid.
// {Q} is deliberately absent: nothing untaps the source, and manaSources offers only untapped permanents — the opposite of
// what an untap-symbol cost needs (CR 107.6).
// The single-counter item: a land's (charge, mining, depletion — 2026-10-17 morning) and, since the evening's slice, the same {T}
// form on an artifact or a creature (Sphere of the Suns' charge, Spell Satchel's book, Channeler Initiate's -1/-1 counter).
const ONE_COUNTER_COST_RE = /\bremove an? (?:charge|mining|depletion|book|-1\/-1) counter from this (?:land|artifact|creature)\b/gi;
const PUT_COUNTER_COST_RE = /\bput an? -0\/-1 counter on this creature\b/gi;
const PAID_MANA_COST_ITEMS = [
  /\{(?!Q\})[^}]*\}/gi,
  /\bsacrifice (?:this [a-z]+|~)/gi,
  /\bpay \d+ life\b/gi,
  /\btap (?:an|a|two|three) untapped (?:legendary creatures?|[a-z]+) you control\b/gi, // + "legendary creature" (Relic of Legends, 2026-10-17)
  /\bsacrifice a creature\b/gi,
  /\bsacrifice a food\b/gi, // play-weighted #803 (Gilded Goose) — `sacrificesFood`
  /\bexile a card from your graveyard\b/gi,
  /\bexile this (?:card|creature) from your hand\b/gi,
  /\bremove any number of (?:storage|charge|oil|mining|ki) counters from this (?:land|artifact|creature)\b/gi,
  /\bremove an? (?:charge|\+1\/\+1|-1\/-1) counter from this (?:artifact|creature|enchantment)\b/gi,
  ONE_COUNTER_COST_RE,
  PUT_COUNTER_COST_RE,
];
/**
 * THE TWO COUNTER-COST MANA LINES A RECORD PAYS (2026-10-17), whole-line anchored — a line whose cost holds either counter
 * item but whose text is anything else is refused by manaLineRefused, never read past its rider:
 *   · ONE_COUNTER_MANA_LINE_RE — "{T}, Remove a <kind> counter from this <land|artifact|creature>: Add <mana>." with the
 *     depletion and mining lands' "If there are no <kind> counters on this land, sacrifice it." (Gemstone Mine; Hickory
 *     Woodlot, Peat Bog, Remote Farm, Sandstone Needle, Saprazzan Skerry; the Vivid lands, Tendo Ice Bridge, Mirrodin's Core;
 *     since the evening slice Sphere of the Suns, Spell Satchel and Channeler Initiate — the same cost on an artifact or a
 *     creature). The record removes ONE counter (`removesCounters` mode "one"), is offered only while one is there (CR 118.3),
 *     and the sacrifice is the ability's own instruction, followed as it resolves (CR 605.3b, 608.2c) — `sacrificeIfNoCounters`,
 *     a land's only. Component Pouch's "Add two mana of different colors." is no shape a record holds (two of one colour would
 *     be the forbidden side), so its line stays refused.
 *   · PUT_COUNTER_MANA_LINE_RE — Wall of Roots' "Put a -0/-1 counter on this creature: Add {G}. Activate only once each turn."
 *     The record puts the counter on (`putsCounter`, through gameState.addCounter — a counter doubler applies, CR 122.6), has no
 *     {T} (usable tapped or summoning sick) and the once-each-turn limit (manaActivationLimit).
 */
const ONE_COUNTER_MANA_LINE_RE = /^\{T\}, Remove an? (charge|mining|depletion|book|-1\/-1) counter from this (land|artifact|creature): (Add (?:(?:\{[WUBRGC]\})+|one mana of any color)\.)( If there are no \1 counters on this land, sacrifice it\.)?$/i;
const PUT_COUNTER_MANA_LINE_RE = /^Put an? (-0\/-1) counter on this creature: (Add (?:\{[WUBRGC]\})+\.)(?: Activate only once each turn\.)?$/i;
// An ability word ahead of a cost ("Parley — {T}", "Metalcraft — {T}", "Vivid — {T}") has no rules meaning (CR 207.2c).
const ABILITY_WORD_PREFIX_RE = /^[^{}:—"“|]*—\s*/;
// The one "for each …, add" form a record reads: the vivid bundle (parseAddClause's fixedSpec).
const VIVID_ADD_SENTENCE_RE = /^for each color among permanents you control, add one mana of that color\b/i;

/**
 * Is this "<cost>: … Add …" line one no mana record can honour? Each way below was a false positive the parse used to mint
 * (the cost, the condition or the owner dropped, the mana kept) — on the planner's tap and the explicit tap alike, since both
 * read manaSources:
 *   · A LOYALTY ABILITY. A loyalty symbol in the cost makes it a loyalty ability (CR 606.2), and a loyalty ability is never
 *     a mana ability (CR 605.1a). "+1" / "−10" / "0" is no cost item a record pays, so the line goes: Chandra, Torch of
 *     Defiance's "+1: Add {R}{R}.", The Aetherspark's "−10: Add ten mana of any one color.", Ugin, Eye of the Storms' "0: Add
 *     {C}{C}{C}." and 22 more were sources the planner spent at any time, an opponent's turn included — no loyalty paid,
 *     none of a loyalty ability's main-phase timing (CR 606.3); Liliana of the Dark Realms read her −6 emblem's quoted Swamp grant as her own
 *     {B}{B}{B}{B}. Whatever mana a loyalty ability makes is the loyalty program's to resolve, never a standing source's.
 *   · AN ABILITY QUOTED INSIDE A SENTENCE. When the line's first colon sits inside a quoted ability, what stands before it is
 *     a trigger or an effect, not a cost: Roxanne, Starfall Savant's Meteorite token ("… with \"When this token enters, …\"
 *     and \"{T}: Add one mana of any color.\"" — the token strip takes only the first quote), Glorious Sunrise's modal "Target
 *     land gains \"{T}: Add {G}{G}{G}\"", Princess Yue's and Hydro-Man, Fluid Felon's "becomes a land and gains \"{T}: Add …\""
 *     after a death or an end step, and Old-Growth Troll's and Harold and Bob, First Numens' Aura-after-death grant to a
 *     Forest each read as the card's own tap. An ability an effect says an object "gains" or "has" is that object's (CR
 *     113.10); a self-included grant ("All Slivers have \"…") keeps its preamble out of the cost, as manaCostModelable does.
 *   · A TARGET. An activated ability is a mana ability only if it doesn't require a target (CR 605.1a — "up to one" still
 *     requires one, CR 115.6). Deathrite Shaman ("{T}: Exile target land card from a graveyard. Add one mana of any color.")
 *     was free any-colour mana with no land card anywhere; Soulbright Flamekin and Soulbright Seeker ("Target creature gains
 *     trample … If this is the third time this ability has resolved this turn, add …") made {R}{R}{R}{R} or eight {R} on
 *     every activation, a loop out of one red mana; Red Death, Shipwrecker made {R} without goading anything.
 *   · A CONDITION OR A COUNT AHEAD OF THE ADD. The sentence holding the line's first "add" opens "If …" (the Soulbrights,
 *     a coin flip) or "For each …" (Selvala, Explorer Returned's "For each nonland card revealed this way, add {G}"), so
 *     the amount is the condition's or the count's — the parse read the bare symbols as a flat amount. The vivid bundle,
 *     read for real, is the one exception.
 *   · AN "UNLESS" ON THE ADD (2026-10-17). Rhystic Cave's "Add one mana of that color unless any player pays {1}." makes its mana
 *     only if no player pays (CR 118.12a) — another player's choice no record holds. It took the land's {C} fallback.
 *   · A COST ITEM NO RECORD PAYS (PAID_MANA_COST_ITEMS). The phantom-mana gate below names consumables one by one, so
 *     every cost it doesn't name rode through as free: "Mill a card" (Deranged Assistant, Millikin), "Forage" (Thornvault
 *     Forager — read as two mana of any colours over its plain {G}), "Collect evidence 3" (Cryptex), "Sacrifice X Goats"
 *     (Springjack Pasture), a station threshold ("12+ | {G}, {T}: Add {G} for each creature you control" — Evendo, Waking
 *     Haven, read as its main product with no counters on it), {Q}. Wall of Roots' -0/-1 counter and the land single-counter
 *     removal (Gemstone Mine, the depletion and Vivid lands) were in this list for a morning (free forever, never emptied, never
 *     sacrificed); since the same day's counter-cost slice a record pays them, in their whole anchored line only (below).
 * Lines only — a refused line is dropped before the parse, so a card's other, honest line still makes its mana (Springjack's
 * "{T}: Add {C}.", Thornvault Forager's "{T}: Add {G}."). Reminder text is read past; a kept self-grant's preamble ("All
 * Slivers have \"…") is not a cost.
 */
function manaLineRefused(line) {
  const t = String(line || "").replace(/\([^)]*\)/g, " ");
  const ci = t.indexOf(":");
  if (ci === -1) return false;
  const effect = t.slice(ci + 1);
  if (!/\badd\b/i.test(effect)) return false;
  // "target" the noun or adjective of THIS ability ("target land card", "any target", "Target opponent"); a "when that mana
  // is spent … you may choose new targets for the copy" rider (Pyromancer's Goggles, Magus Lucea Kane) is the copy's, not a
  // target of the mana ability, so the plural is not read.
  if (/\btarget\b/i.test(effect)) return true;
  const sentence = (effect.split(/(?<=\.)\s+/).find((s) => /\badd\b/i.test(s)) || "").trim();
  if (/^(?:if|for each)\b/i.test(sentence) && !VIVID_ADD_SENTENCE_RE.test(sentence)) return true;
  // "… UNLESS <a player does something>" on the add (2026-10-17 — Rhystic Cave: "Add one mana of that color unless any player pays
  // {1}."): the mana is made only if no player takes the option as the ability resolves (CR 118.12a), a choice of other players
  // no record holds. The line used to parse to nothing and take the land's colourless fallback — {C}, a type it never makes.
  if (/\bunless\b/i.test(sentence)) return true;
  let cost = t.slice(0, ci).replace(SELF_GRANT_PREAMBLE_RE, "").replace(ABILITY_WORD_PREFIX_RE, "");
  // A counter cost a record pays only in its whole anchored line (2026-10-17): anything else written around it is refused. The
  // single-counter item binds a land's line, and any line that also taps ({T}) — the same text with no {T} on an artifact, a
  // creature or an enchantment is the per-counter form (Pentad Prism, Mana Bloom), read by its own anchored reader below.
  const whole = t.replace(/\s+/g, " ").trim();
  if (new RegExp(ONE_COUNTER_COST_RE.source, "i").test(cost) && (/\{T\}/i.test(cost) || /\bfrom this land\b/i.test(cost)) && !ONE_COUNTER_MANA_LINE_RE.test(whole)) return true;
  if (new RegExp(PUT_COUNTER_COST_RE.source, "i").test(cost) && !PUT_COUNTER_MANA_LINE_RE.test(whole)) return true;
  for (const re of PAID_MANA_COST_ITEMS) cost = cost.replace(re, " ");
  return cost.replace(/[\s,]/g, "") !== "";
}

/**
 * THE PER-TURN LIMIT A MANA LINE PRINTS (2026-10-17) — `{ perTurn?, yourTurnOnly?, opponentsTurnOnly? }`, or null. A restriction on an activated
 * ability's use holds for that object every turn (CR 602.5b), a mana ability's included; manaSources reads the activation
 * ledger the activated abilities already keep (state.activatedOncePerTurn — `${permanentId}:${line}` → { turn, n }, a record
 * from an earlier turn counting zero) and commitManaTap stamps it. Before this a no-{T} line was held to its limit only by the
 * commit tapping it, which it must not (CR 107.5) — so every printed form on a no-{T} mana line in the corpus is read here:
 *   · "Activate only once each turn." — Kozilek's Translator, Wall of Roots, the Devotees, the Scarecrows, Ronin;
 *   · "Activate only during your turn and only once each turn." — Vivi Ornitier (her controller's turn only);
 *   · "Activate no more than twice / three times each turn." — Manaforge Cinder;
 *   · "If this ability has been activated four or more times this turn, sacrifice this creature at the beginning of the next
 *     end step." (Initiates of the Ebon Hand, Farrelite Priest) — read as three each turn: the activations it allows with no
 *     sacrifice. The delayed sacrifice a fourth would set up is not modelled, so a fourth is never offered (an under-offer).
 *   · "Activate only during an opponent's turn." (Lavinia, Foil to Conspiracy — a {T} line, 2026-10-17 evening): no count, a
 *     turn gate only (`opponentsTurnOnly`) — a player can't begin to activate an ability that's prohibited (CR 602.5). It
 *     tapped on her controller's own turn.
 * `perTurn` is absent on a turn-only gate: nothing is counted, and no ledger entry is stamped.
 */
function manaActivationLimit(line) {
  const t = String(line || "").replace(/\([^)]*\)/g, " ");
  const ci = t.indexOf(":");
  if (ci === -1) return null;
  const effect = t.slice(ci + 1);
  if (!/\badd\b/i.test(effect)) return null;
  if (/\bActivate only during an opponent['’]s turn\.?$/i.test(effect.trim())) return { opponentsTurnOnly: true };
  if (/\bActivate only during your turn and only once each turn\b/i.test(effect)) return { perTurn: 1, yourTurnOnly: true };
  if (/\bActivate only once each turn\b/i.test(effect)) return { perTurn: 1 };
  const noMore = effect.match(/\bActivate no more than (twice|three times) each turn\b/i);
  if (noMore) return { perTurn: /^twice$/i.test(noMore[1]) ? 2 : 3 };
  if (/\bIf this ability has been activated four or more times this turn, sacrifice this creature at the beginning of the next end step\b/i.test(effect)) return { perTurn: 3 };
  return null;
}
// The ledger key of a limited mana line on a permanent — the activated abilities' own shape (permId:rawLine, legalChoices).
const manaLimitKey = (permId, limit) => `${permId}:${limit.line}`;
// Activations of this limited line already made this turn (a record from an earlier turn counts zero — self-expiring).
function manaLimitUsed(state, permId, limit) {
  const rec = state?.activatedOncePerTurn?.[manaLimitKey(permId, limit)];
  return rec && rec.turn === state.turn ? rec.n : 0;
}
// May this limited line be activated now? Its turn gate (its controller's turn only — Vivi Ornitier; an opponent's turn only —
// Lavinia) and, when it counts, the activations left this turn.
function manaLimitAllows(state, playerId, permId, limit) {
  if (limit.yourTurnOnly && state.activePlayer !== playerId) return false;
  if (limit.opponentsTurnOnly && !opponentsOf(state, playerId).includes(state.activePlayer)) return false;
  return limit.perTurn == null || manaLimitUsed(state, permId, limit) < limit.perTurn;
}

// Is the cost an UNPAYABLE, non-repeatable CONSUMABLE the sim can't spend — so registering its "Add …" as a
// free, tapless, standing source would mint PHANTOM mana every turn? The named consumable set: a non-self
// SACRIFICE (Utopia Mycon "Sacrifice a Saproling", Ashnod's Altar "Sacrifice a creature"), PAY N LIFE
// (Treasonous Ogre), DISCARD (Skirge Familiar), REMOVE A COUNTER (Cryptic Trilobite — a FINITE counter pool
// the sim would treat as infinite), EXILE-as-cost (Simian Spirit Guide — also never a battlefield source),
// TAP-OTHER permanents (Heritage Druid convoke-style — the sim doesn't tap the other Elves), or RETURN-to-hand
// (Grinning Ignus). Excludes a cost that is ONLY a {T}, mana symbols and/or a self-sacrifice (manaCostModelable — the
// Treasure case, handled by `sacrifices`); a self-sacrifice with a consumable beside it (Lion's Eye Diamond's discard) is
// consumable like any other.
function manaCostConsumable(cost) {
  // A modelable line (plain {T} / pure-mana / self-sac — incl. the Treasure "{T}, Sacrifice this" compound)
  // is never consumable. The old blanket {T} exemption let a COMPOUND "{T}, Remove a counter / Tap another /
  // Discard …" cost ride its tap half straight past this gate (the SHELF S7 phantom-mana audit catch) —
  // deferring to manaCostModelable keeps the two checks pairwise-consistent by construction.
  if (manaCostModelable(cost)) return false;
  return (
    /\bsacrifice\b/i.test(cost) ||
    /\bpay\b[^]*\blife\b/i.test(cost) ||
    /\bdiscard\b/i.test(cost) ||
    /\bremove\b[^]*\bcounter/i.test(cost) ||
    /\bexile\b/i.test(cost) ||
    /\btap\b/i.test(cost) ||
    /\breturn\b[^]*\bhand\b/i.test(cost)
  );
}

/**
 * PHANTOM-MANA (consumable-cost) GATE. True when a NON-LAND's activated "Add …" ability is paid by a
 * CONSUMABLE / non-repeatable cost the sim can't spend (a non-self sacrifice / pay-life / discard /
 * remove-counter / exile / tap-other / return-to-hand) AND it has NO modelable mana line at all (no real
 * {T}: dork, self-sac, or pure-mana filter). Such a source is NOT a free, tapless, repeatable standing
 * source — without this gate manaSources read e.g. Utopia Mycon's "Sacrifice a Saproling: Add {C}{C}" as
 * free mana every turn, so the self-play sim paid with PHANTOM mana (dirtying training data). Mirrors the
 * earlier TRIGGERED/ETB phantom gate (activatedManaText): RUNTIME-ONLY — classifyCard never calls
 * manaProduction, so the native-mana tier is unchanged; this fixes only the sim's runtime mana.
 *
 * FN-safe: gates ONLY when EVERY activated mana line is unpayable, so a card with a real {T}: / pure-mana
 * line keeps that source. A mana FILTER ({mana}: Add) and a {T}: dork are never consumable → never gated.
 * Any cost item no record pays ("Mill a card", "Forage") never reaches here either: manaLineRefused drops the line first
 * (2026-10-17), so this gate sees only lines whose every cost item is payable — a loyalty line included (CR 605.1a / 606.2 —
 * never a mana ability). The counter-cost lines a record pays (Wall of Roots, the land single-counter removal) return from
 * their own reader in manaProductionImpl before this gate is consulted.
 */
function manaAbilityCostUnpayable(oracle) {
  const costs = activatedManaCosts(oracle);
  if (!costs.length) return false;            // no activated mana line — handled by the activatedManaText gate
  if (costs.some(manaCostModelable)) return false; // a real tap / self-sac / pure-mana line exists → keep it
  return manaCostConsumable(costs[0]);        // the modeled (first) line is an unpayable consumable resource
}

/**
 * Remove the QUOTED ability a card confers on a TOKEN it CREATES ("Create a … token with \"…\"" or the
 * two-sentence "…token[ named N]. It has \"…\"" form, normalized here to the "with" form) — that ability
 * belongs to the TOKEN, not the card. Without this, a card's OWN mana production is fabricated from its
 * token's ability: an Eldrazi Spawn-maker (Blisterpod, Nest Invader) reads as a sac-for-{C} source it
 * isn't, and the engine would offer "sacrifice Blisterpod for {C}" — a fabricated ability (a false
 * positive). SCOPED to a CREATE-TOKEN context only, so a self-granting lord ("All Slivers have \"{T}:
 * Add …\"" — Gemhide IS a Sliver, a real source) and a non-token mana-grant anthem ("Creatures you
 * control have \"…\"" — a separate concern) are left intact. Mirrors the parser's splitClauses
 * normalization; shared by coverage.hasManaAbility so the classifier and runtime can't drift.
 */
export function stripCreatedTokenAbilities(text) {
  const norm = String(text || "").replace(
    // singular "It has" AND plural "They have" — both bind a token's quoted ability; kept in lockstep with the
    // parser's splitClauses normalization so the mana FP-guard strips a plural-token maker's ability too (Dread
    // Drone's "…tokens. They have \"Sacrifice this token: Add {C}\"" must not fabricate Dread Drone's own mana).
    /(\bcreates?\b[^.]*?\btokens?\b[^.]*?)\.\s+(?:it has|they have) (["“'])/gi,
    "$1 with $2",
  );
  return norm.replace(
    /(\bcreates?\b[^."]*?\btokens?\b[^."]*?(?: named [^."]*?)? with )(["“][^"”]*["”])/gi,
    "$1 ",
  );
}

/**
 * Strip a QUOTED ability this card GRANTS to a GROUP ("Creatures you control have "{T}: Add one mana of
 * any color."" — Cryptolith Rite; "Lands you control have …" — Chromatic Lantern; "Enchanted creature
 * has …" — Multani's Harmony) UNLESS the card provably SELF-INCLUDES in the grant's subject scope
 * (Gemhide/Manaweft Sliver — "All Slivers have …" on a Sliver — legitimately self-produces, test-pinned).
 * Without this the GRANTER itself read its quoted "Add" as its OWN mana ability and became a phantom
 * standing source (the engine tapped Cryptolith Rite — an Enchantment — for fabricated mana). Recipients
 * get the ability through the real grant channel (layers.grantedManaSpecsFor → manaSources), so stripping
 * here never drops real production. Membership: a subject noun (singularized; -ves→-f, invariant -us
 * kept) must appear in the card's OWN type line; "other …" and attachment subjects ("enchanted/equipped/
 * fortified …") never self-include; "permanents" always does (every battlefield card is a permanent).
 * No typeLine → conservative strip — an under-count, never a phantom (CREED). Generalizes the old
 * Aura-only quoted-grant guard; shared with coverage.hasManaAbility so classifier and metric agree.
 */
export function stripNonSelfQuotedGrants(text, typeLine) {
  const tl = String(typeLine || "").toLowerCase();
  // AURA BLANKET STRIP (restored — the pre-generalization guard): an Aura NEVER self-produces via
  // quoted text — its quotes always describe an ability conferred to the HOST (delivered at runtime
  // via layers.grantedManaSpecsFor). The has/have-anchored guard below misses non-has introducers
  // ("is a Treasure artifact with \"{T}: …\"" — Minimus Containment) and conjunction-chained quotes
  // ("has \"{T}: Add {C}\" and \"{T}, Pay 1 life: …\"" — Lithoform Blight), which minted the Aura
  // itself as a phantom standing source. Stripping ALL quoted segments for Auras is safe: at worst
  // an under-count (CREED), never a phantom. EXTENDED (P0-residual FP wave) to Equipment /
  // Fortification: an attachment's quotes likewise always confer to the host ("Equipped creature
  // gets +2/+2 and has vigilance and "{T}: Add {G}"" — Summoning Materia / Lotus Ring credited
  // the EQUIPMENT itself as a standing source).
  if (/\b(?:aura|equipment|fortification)\b/.test(tl)) {
    return String(text || "").replace(/["“][^"”]*["”]/g, " ");
  }
  return String(text || "").replace(
    // The matcher spans CONJUNCTION-CHAINED grants: "...has vigilance and "{T}: Add ..."" (Honored
    // Hierarch — keyword words between has/have and the quote) and "...has "A" and "B"" (chained
    // quotes captured as ONE group, kept/stripped together — a partial keep of a chain is never
    // correct, so the whole chain shares one verdict).
    /([^.\n"\u201c]*?\bha(?:ve|s)\b[^.\n"\u201c]*?)((?:["\u201c][^"\u201d]*["\u201d])(?:\s*,?\s*(?:and\s+)?["\u201c][^"\u201d]*["\u201d])*)/gi,
    (whole, subject, quote) => {
      const sub = subject.toLowerCase();
      if (/\bother\b/.test(sub) || /\b(?:enchanted|equipped|fortified)\b/.test(sub)) return subject + " ";
      // NON-BATTLEFIELD-ZONE GRANT (Topsoil Turner class): a grant to cards in a HAND/GRAVEYARD/LIBRARY
      // can never include the battlefield granter itself, even when the granter's type line matches the
      // granted set. Strip \u2192 FN-safe: never a phantom standing source off a zone the permanent isn't in.
      if (/\bin your (?:hand|graveyard|library)\b|\bin exile\b/.test(sub)) return subject + " ";
      // CONDITIONAL GRANT (P0-residual FP wave): a grant whose membership this card-level, stateless
      // model cannot evaluate must never credit the granter's own standing production —
      //   • "As long as <condition>, this creature has …" (Honored Hierarch renown / Mul Daya top-card)
      //   • a restrictive "with …" subject ("Each creature you control WITH A COUNTER ON IT has …"
      //     — Rishkar, Peema Renegade).
      // Strip → FN-safe: the runtime under-counts a live Rishkar-with-counter rather than
      // fabricating a dead one.
      if (/\bas long as\b/.test(sub) || /\bwith\b/.test(sub)) return subject + " ";
      // SPEND-RESTRICTED GRANT: quoted mana carrying an unmodeled spend restriction ("{T}: Add {C}.
      // This mana can't be spent to cast a nonartifact spell." — Battery Bearer) must not become
      // general-purpose standing mana even for a legit self-includer: the payment planner has no
      // restricted-mana concept → route out (FN-safe).
      if (/can't be spent|spend this mana only/i.test(String(quote || ""))) return subject + " ";
      if (!tl) return subject + " ";
      if (/\bpermanents?\b/.test(sub)) return whole;
      for (const w of sub.match(/[a-z]+/g) || []) {
        let sing = w;
        if (/ves$/.test(sing)) sing = sing.slice(0, -3) + "f";
        else if (!/us$/.test(sing) && sing.endsWith("s")) sing = sing.slice(0, -1);
        if (sing.length >= 3 && new RegExp("\\b" + sing + "\\b", "i").test(tl)) return whole;
      }
      return subject + " ";
    },
  // ── GAINS-FORM PHANTOM SOURCES (Codex fix #4 fallout, 2026-08-30) ──────────────────────────────
  // The has/have matcher above never sees a "gains \"…\"" grant, and two real phantoms hid there:
  //   · Topsoil Turner — "each Forest and Treefolk card IN YOUR HAND perpetually gains \"{T}: Add
  //     {G}{G}.\"" (a hand-zone grant can never include the battlefield granter, type match or not);
  //   · Alpine Moon — "Lands YOUR OPPONENTS CONTROL … lose all abilities and gain \"{T}: Add {C}.\""
  //     (an opponents-scoped grant likewise never includes the granter).
  // Both credited the GRANTER itself with the quoted production. This second pass strips a gains-form
  // quote ONLY when (a) it could mint a phantom source at all (an "add" inside the quote) AND (b) the
  // subject is one of those two provably-non-self classes. Everything else returns `whole` untouched —
  // ⛔ DELIBERATELY: a first draft stripped every unmatched gains-subject and ate Rivaz of the Claw's
  // dies-exile grant ("it gains \"When this creature dies, exile it.\"" — no mana inside, and the text
  // is load-bearing for the classifier + the runtime grant stamp). Caught by rivazOfTheClaw.test.js.
  ).replace(
    /([^.\n"“]*?\b(?:perpetually\s+)?gains?\b[^.\n"“]*?)((?:["“][^"”]*["”])(?:\s*,?\s*(?:and\s+)?["“][^"”]*["”])*)/gi,
    (whole, subject, quote) => {
      if (!/\badd\b/i.test(String(quote || ""))) return whole; // no mana inside — never a phantom source
      const sub = subject.toLowerCase();
      if (/\bin your (?:hand|graveyard|library)\b|\bin exile\b/.test(sub)) return subject + " ";
      if (/\byour opponents?\b|\ban opponent controls\b|\bopponents? control\b/.test(sub)) return subject + " ";
      return whole; // unknown gains-subject: keep the text (pre-existing behavior — never widen on a guess)
    },
  );
}

/**
 * What mana can this card's mana ability produce? Returns `{ colors, amount[, sacrifices] }`
 * or null if it isn't a mana source. Resolution order: basic-land name → known-rock table →
 * oracle "Add" parse → land fallback (colorless). `sacrifices:true` marks a one-shot source the
 * mana commit path sacrifices on use (Treasure / Gold) — only ever set on the oracle-parsed branch
 * (basics/known-rocks/land-fallback are all repeatable).
 *
 * Reminder text (parentheses) is read TYPE-AWARELY:
 *   - LAND: keep the raw oracle. The original dual lands / type-granting lands print their mana
 *     ability ENTIRELY as reminder text ("({T}: Add {W} or {U}.)" — Tundra, Badlands, shocklands,
 *     triomes), because the basic land types grant it intrinsically. Stripping there would drop the
 *     ability and the land would fall through to the colorless fallback (a {W}/{U} → {C} regression).
 *   - NON-LAND: strip reminder first. A creature/artifact whose only "Add … mana" text is in reminder
 *     is describing a TOKEN it creates ("…create a Treasure token. (It's an artifact with "{T},
 *     Sacrifice this token: Add one mana of any color.")" — Brazen Freebooter) or a keyword's mana
 *     (firebending) — NOT its own ability. Reading it would mis-offer the permanent as a tappable mana
 *     source in `manaSources`. A genuine rock/dork states its ability in MAIN text, so stripping never
 *     drops a real source. (Matches the coverage.hasManaAbility reminder fix; CR 207.2.)
 */
// Per-card memo (overhaul wave 2): manaProduction is pure per card object and was re-parsed on
// every manaSources enumeration (the stripNonSelfQuotedGrants regex alone was ~3% of self-play
// CPU). Results are shared + treated read-only by every caller (verified: records copy or spread
// before any modification). WeakMap — GCs with the card.
const _prodMemo = new WeakMap();
// KW-ENGINES (CR 702.179): "Max speed — <ability>" is live only while its controller's speed is 4.
const MAX_SPEED_PREFIX = /^\s*max speed\s*[—–-]\s*/i;

/**
 * EXTRA MANA LINES (STAGE ④-3, 2026-09-03 — the multi-line-mana correction's runtime half). manaProduction
 * models ONE product per card (the first Add line, with riders merged only where the whole-card detectors read
 * them); a land printing a SECOND tap-mana ability never offered it — 114 lands, 55 of them credited "land".
 * This admits a second line ONLY in its complete, rider-free forms — "{T}: Add …" or "{T}, Sacrifice this
 * land: Add …", optionally "Activate only if <expressible condition>." — parsed through the SAME manaProduction
 * on a single-line virtual card, and only when it adds what the main product does not already cover (a colour
 * the main lacks, a gate, or a sacrifice cost). A line carrying a pain / pay-life / doesn't-untap /
 * counter-removal rider fails the anchor on purpose: its single-line product would silently drop the rider
 * (a painless painland tap), the forbidden direction. Never the main line itself. Memoized per card object.
 */
/**
 * A MANA LINE WHOSE WHOLE COST TAPS OTHER PERMANENTS (play-weighted #535, 2026-10-17): "Tap an untapped <filter> you control: Add
 * <mana>." — no {T} of its own, nothing after the add. Printed after a "{T}: Add …" line (Relic of Legends) it is a second ability
 * (CR 113.2c) the whole-card parse never reads (that parse takes the first activated mana line — the {T} one — with its own
 * cost), so it rides as an extra record: its single-line product carries `extraTap` (parseTapOtherCost, whose filter vocabulary
 * still decides — an unknown payer noun parses to nothing) and `requiresTap: false`, so manaSources resolves its payers off the
 * live board and it is activatable while its source is tapped (CR 107.5). As a card's ONLY mana line (Birchlore Rangers, Seton,
 * Heritage Druid, Urza) it is the main product, as before. Whole-line anchored: a rider (a spend restriction — Grand Architect)
 * fails it.
 */
const TAP_OTHER_NO_TAP_MANA_LINE_RE = /^Tap (?:an|a|two|three) untapped (?:legendary )?[a-z]+ you control: Add (?:(?:\{[WUBRGC]\})+|one mana of any color)\.$/i;
/**
 * THE SAME COST WITH THE SOURCE'S OWN {T} (2026-10-17 — Holdout Settlement, Survivors' Encampment, Scene of the Crime): "{T}, Tap an
 * untapped creature you control: Add one mana of any color." beside the land's plain "{T}: Add {C}.". Two abilities (CR 113.2c)
 * sharing the land's one {T}; this one also taps a creature its controller controls (CR 118.3 — none untapped, no activation; a
 * creature that came under its control this turn may pay, CR 302.6 — its {T} is not the cost). A land's raw-oracle parse used to
 * return before the tap-other reader ran, so the line kept no payer: Holdout Settlement made any colour with no creature tapped
 * (its plain line's reminder text kept the honest-main rule from finding it) and the other two never offered the line. On a land
 * it now leaves the whole-card parse beside another mana line and rides as its own extra record carrying `extraTap`
 * (manaProductionImpl, extraManaLineProducts); as a land's only mana line it is the product, with its payer. On a nonland the
 * line was already read with its payer (Springleaf Drum, Loam Dryad), and the extra-line read finds it covered by the main.
 * Whole-line anchored: a rider fails it.
 */
const TAP_OTHER_TAP_MANA_LINE_RE = /^\{T\}, Tap (?:an|a|two|three) untapped (?:legendary )?[a-z]+ you control: Add (?:(?:\{[WUBRGC]\})+|one mana of any color)\.$/i;
const EXTRA_MANA_LINE_RE = /^(?:\{T\}(?:, Sacrifice this land)?: Add (?:(?:\{[WUBRGC]\})+|\{[WUBRGC]\} or \{[WUBRGC]\}|one mana of any color)\.(?: Activate only if [^.]+\.)?|\{T\}, Pay \d life: Add one mana of any color\.|\{T\}, Remove any number of (?:storage|charge|oil|mining|ki) counters from this (?:land|artifact|creature): Add \{[WUBRGC]\}(?:, then add an additional \{[WUBRGC]\})? for each (?:storage|charge|oil|mining|ki) counters? removed this way\.|\{T\}: Add \{[WUBRGC]\} or \{[WUBRGC]\}\. This land doesn't untap during your next untap step\.|\{T\}: Add one mana of any color\. Spend this mana only to cast an? [a-z]+ spell of the chosen type(?:, and that spell can't be countered)?(?: or (?:to )?activate an ability of an? (?:[a-z]+ )?source of the chosen type)?\.|\{T\}: Add one mana of any color\. Spend this mana only to cast an? [a-z]+(?:, [a-z]+)*(?:,? or [a-z]+)? spells?(?: or (?:to )?activate an ability of an? [a-z]+(?:, [a-z]+)*(?:,? or [a-z]+)?(?: source)?)?\.|\{T\}: Add (?:\{[WUBRGC]\})+\. Spend this mana only to cast [^.]+\.(?: Activate only if [^.]+\.)?|\{T\}: Add one mana of any color among legendary permanents you control\.|\{T\}, Remove an? (?:charge|mining|depletion) counter from this land: Add (?:(?:\{[WUBRGC]\})+|one mana of any color)\.(?: If there are no (?:charge|mining|depletion) counters on this land, sacrifice it\.)?)$/i; // + 2026-10-17: the single-counter land line (the Vivid lands, Tendo Ice Bridge, Mirrodin's Core) rides as its own record, removing its counter (ONE_COUNTER_MANA_LINE_RE); + STAGE ④-4: the tap-only counter-removal forms; + STAGE ④-5: the doesn't-untap duals; + CAP-CAVERN: the chosen-type any-colour line (Cavern of Souls, Unclaimed Territory); + SHELF-85 S17: the fixed-type restricted any-colour line (Mech Hangar "Spend this mana only to cast a Pilot or Vehicle spell.") — the per-line product carries its restriction (restrictedManaProduction), never a free colour
// A PLAIN tap line: complete, ungated, no sacrifice — the line a multi-line card can always tap for.
const PLAIN_MANA_LINE_RE = /^\{T\}: Add (?:(?:\{[WUBRGC]\})+|\{[WUBRGC]\} or \{[WUBRGC]\}|one mana of any color)\.$/i;
/**
 * A LAND'S SECOND MANA LINE THAT ITS SINGLE-LINE PRODUCT CARRIES WHOLE (2026-10-17 — the land lines). Each of these parsed alone
 * and was credited by the land gate (coverage.landFullyCovered, through landLineMana's single-line read), but no record made it:
 * the whole-card parse takes the land's plain line, and EXTRA_MANA_LINE_RE didn't admit the shape. Admitted on a LAND only, in its
 * whole anchored form, and only where the line's own product carries every rider it prints:
 *   · "{T}, Pay N life: Add <colour(s) | any colour>." with an optional "Activate only if …" — the Amonkhet deserts (Shefet Dunes,
 *     Ipnu Rivulet, Ramunap Ruins, Hashep Oasis), Spire of Industry ("… Activate only if you control an artifact."): `payLife` and
 *     the gate (an inexpressible gate drops the line before the parse — no product, nothing admitted);
 *   · "{T}, Sacrifice a creature: Add …" — Phyrexian Tower: `sacrificesCreature` (CR 118.3 — no creature, no activation);
 *   · The Grey Havens' graveyard colour set (`colorsAmongSpec`, read live by colorsAmongFor);
 *   · four spend-restricted lines whose restriction parseSpendRestriction reads whole (CR 106.6): Power Depot's "artifact spells or
 *     activate abilities of artifacts", Tournament Grounds' three-colour "Knight or Equipment spell", Maelstrom of the Spirit
 *     Dragon's "a Dragon spell or an Omen spell" (an Omen is a spell type, CR 205.3k), Brotherhood Headquarters' "an Assassin spell
 *     or a spell that has freerunning, or … an ability of an Assassin source".
 * EXTRA_MANA_LINE_RE itself is untouched: honestMultiLineMain reads it to decide which merges are unsafe, and every one of these
 * lines must keep the land's main product its plain line.
 */
const LAND_EXTRA_MANA_LINE_RE = /^(?:\{T\}, Pay \d+ life: Add (?:(?:\{[WUBRGC]\})+|one mana of any color)\.(?: Activate only if [^.]+\.)?|\{T\}, Sacrifice a creature: Add (?:(?:\{[WUBRGC]\})+|one mana of any color)\.|\{T\}: Add one mana of any color among legendary creature cards in your graveyard\.|\{T\}: Add one mana of any color\. Spend this mana only to cast [a-z]+ spells or activate abilities of [a-z]+s\.|\{T\}: Add \{[WUBRG]\}, \{[WUBRG]\}, or \{[WUBRG]\}\. Spend this mana only to cast an? [a-z]+ or [a-z]+ spell\.|\{T\}: Add one mana of any color\. Spend this mana only to cast an? [a-z]+ spell or an? [a-z]+ spell\.|\{T\}: Add one mana of any color\. Spend this mana only to cast an? [a-z]+ spell or a spell that has [a-z]+, or to activate an ability of an? [a-z]+ source\.)$/i;
/**
 * A MANA-COSTED LINE BESIDE THE LAND'S PLAIN LINE (2026-10-17 — the land lines): "{1}, {T}: Add one mana of any color." (Talon Gates
 * of Madara, Planar Nexus, Hidden Grotto, Unknown Shores and 12 more), "{2}, {T}: …" (School of the Unseen, Henge of Ramos), the
 * Homelands keeps' "{1}, {T}: Add {R}." / "{2}, {T}: Add {B} or {G}." (Koskun Keep, An-Havva Township, Wizards' School, Aysen
 * Abbey, Castle Sengir), Crystal Quarry's "{5}, {T}: Add {W}{U}{B}{R}{G}.", Crypt of the Eternals' "{1}, {T}: Add {U}, {B}, or {R}.",
 * Opal Palace's commander-identity line. Two abilities (CR 113.2c) sharing the land's one {T}; the whole-card parse takes the plain
 * line, so the costed one was never made — and credited. It rides as its own record: the "Add" sentence read alone behind a bare
 * {T}, its mana cost carried as `activationCost` (the free-activation fix — the planner funds it from other mana first, the explicit
 * tap from the floating pool). A known "when that mana is spent" sentence after the add rides as `spentRider` (MANA_SPENT_RIDERS);
 * any other text after it fails the anchor. The cost prefix admits mana pips only, so a non-mana cost item never drops on the way in.
 */
const COSTED_MANA_LINE_RE = /^((?:\{(?:\d+|[WUBRGC])\}, )+)\{T\}: (Add (?:(?:\{[WUBRGC]\})+|\{[WUBRGC]\} or \{[WUBRGC]\}|\{[WUBRGC]\}, \{[WUBRGC]\}, or \{[WUBRGC]\}|one mana of any color(?: in your commander['’]s color identity)?)\.)(?: (.+))?$/;
/**
 * A CHOICE AMONG FIXED BUNDLES BEHIND A MANA COST (2026-10-17 — the filter lands: Rugged Prairie, Cascade Bluffs, Flooded Grove, Fetid
 * Heath, Twilight Mire, Graven Cairns, Mystic Gate, Sunken Ruins, Fire-Lit Thicket, Wooded Bastion): "{R/W}, {T}: Add {R}{R}, {R}{W},
 * or {W}{W}." Read alone the line misparsed as ONE mana of R or W, which the land gate credited; the whole card made its plain {C}
 * alone. The ability makes two mana in one of the printed combinations, chosen as it resolves (CR 605.3b), behind a hybrid cost
 * paid with either half (CR 107.4e). It rides as one record per bundle, each `fixed` to its tally (one colour twice is that colour,
 * amount 2), all behind the same `activationCost` and sharing the land's one {T} — so the planner funds the hybrid from other mana
 * and activates the bundle the payment needs (costedActivationOrders), and the explicit tap offers each bundle (`bundle` names it —
 * the action's key beside the colour). Each bundle is two or more symbols; a one-symbol list is a colour choice, read above.
 */
const BUNDLE_CHOICE_MANA_LINE_RE = /^((?:\{(?:\d+|[WUBRGC]|[WUBRG]\/[WUBRG])\}, )+)\{T\}: Add ((?:\{[WUBRGC]\}){2,}(?:, (?:\{[WUBRGC]\}){2,})*,? or (?:\{[WUBRGC]\}){2,})\.$/;
/**
 * TWO LAND LINES WITH A RIDER ON THE ADD (2026-10-17 — the land lines), each beside the land's own main product:
 *   · PAIN_PAIR_MANA_LINE_RE — Murmuring Bosk's "{T}: Add {W} or {B}. This land deals 1 damage to you." (its main is its Forest {G}):
 *     the pair's own product carries the damage (parseAddClause's single-line pain pair), dealt as the ability resolves (`painColors`;
 *     damage to a player from a source without infect is life lost, CR 120.3a). A painland's pair is covered by its merged main.
 *   · OPPONENTS_GAIN_MANA_LINE_RE — Grove of the Burnwillows' "{T}: Add {R} or {G}. Each opponent gains 1 life.": the life gain is the
 *     same ability's effect, done as it resolves (CR 605.3b, 119.3) — `opponentsGainLife`, paid by commitManaTap through gainLife
 *     (a "can't gain life" or a gain replacement applies there). Its plain {C} gives nothing.
 */
const PAIN_PAIR_MANA_LINE_RE = /^\{T\}: Add \{([WUBRG])\} or \{([WUBRG])\}\. This land deals (\d+) damage to you\.$/i;
const OPPONENTS_GAIN_MANA_LINE_RE = /^\{T\}: Add \{([WUBRG])\} or \{([WUBRG])\}\. Each opponent gains (\d+) life\.$/i;
/**
 * THE "WHEN THAT MANA IS SPENT" SENTENCES A COSTED LAND LINE MAY CARRY (2026-10-17 — the land lines), each made at the cast site
 * (actionDispatcher) when the spell its mana paid for qualifies — the mana is spent from the plan's own taps, so floating mana (the
 * explicit tap) keeps no rider and manualManaTaps never offers such a record (as Path of Ancestry's):
 *   · Opal Palace — "If you spend this mana to cast your commander, it enters with a number of additional +1/+1 counters on it equal
 *     to the number of times it's been cast from the command zone this game." — `commanderCounters`: the commander's command-zone
 *     cast count after this cast (CR 903.8 counts those casts) as +1/+1 counters it enters with (CR 614.1c), per Palace tap spent;
 *   · Guildmages' Forum — "If that mana is spent on a multicolored creature spell, that creature enters with an additional +1/+1
 *     counter on it." — `multicoloredCreatureCounter`: one counter per Forum tap spent on a creature spell of two or more colours.
 */
const MANA_SPENT_RIDERS = [
  [/^If you spend this mana to cast your commander, it enters with a number of additional \+1\/\+1 counters on it equal to the number of times it['’]s been cast from the command zone this game\.$/, { kind: "commanderCounters" }],
  [/^If that mana is spent on a multicolored creature spell, that creature enters with an additional \+1\/\+1 counter on it\.$/, { kind: "multicoloredCreatureCounter" }],
];
// "Max speed — {T}: Add …" beside the land's plain line (Muraganda Raceway, 2026-10-17): the gated line rides as its own record, live
// only while its controller's speed is 4 (CR 702.179e — the same gate manaSources applies to a max-speed main product).
const MAX_SPEED_MANA_LINE_RE = /^Max speed\s*[—–-]\s*(\{T\}: Add (?:\{[WUBRGC]\})+\.)$/i;

/**
 * HONEST MAIN PRODUCT for a multi-line card (STAGE ④-3 — two live FPs the whole-card merge produced, both found
 * by this slice's witness): (a) Ancient Spring / Havenwood Battleground — "{T}: Add {U}." beside "{T}, Sacrifice
 * this land: Add {W}{B}." merged into ONE product carrying `sacrifices`, so the plain tap SACRIFICED the land;
 * (b) Grand Coliseum / The Secret Lair — "{T}: Add {C}." beside an any-colour line with a rider ("This land
 * deals 1 damage to you" / "Say the secret word … Scry 1") merged into a PAINLESS any-colour product. Rule:
 * when the card prints a plain tap line and the merged product either carries a sacrifice or takes colours
 * from a rider-bearing line without carrying that rider (no painColors / payLife / restriction), the main
 * product is the plain line's own single-line product; the other lines ride as extra records (or stay
 * unmodelled — FN-safe). A merge that DOES carry its rider (Shivan Reef's painColors) is untouched.
 */
function honestMultiLineMain(card, result) {
  if (!result) return result;
  const lines = faceUpOracle(card).split(/\n+/).map((l) => l.trim()).filter(Boolean);
  // Every tap-mana line, INCLUDING a mana-costed one ("{1}, {T}: Add one mana of any color." — Hall of Oracles):
  // that cost is exactly what the merge drops, so the line must count as a rider-bearing tap line here.
  const tapLines = lines.filter((l) => /^[^:]*\{T\}[^:]*: Add\b/i.test(l));
  // A merged `sacrifices` is checked even with ONE tap line: Spawning Bed's plain "{T}: Add {C}." picked up a
  // sacrifice from its NON-mana line (the quoted "Sacrifice this token: Add {C}" in its token text) and the
  // plain tap sacrificed the land — found by the corpus census of this slice.
  if (tapLines.length < 2 && !result.sacrifices) return result;
  const plain = tapLines.find((l) => PLAIN_MANA_LINE_RE.test(l));
  if (!plain) return result;
  const plainProd = manaProductionImpl({ ...card, oracle: plain, oracle_text: plain });
  if (!plainProd || !plainProd.colors?.length) return result;
  const plainColors = new Set(plainProd.colors);
  const unsafeSac = !!result.sacrifices && !/sacrifice/i.test(plain);
  const foreign = (result.colors || []).filter((c) => !plainColors.has(c));
  const riderless = !result.painColors && result.payLife == null && !result.restriction;
  // V2 (2026-09-04): a PAY-LIFE line is unsafe to merge even though it is now an honest extra record (Starting
  // Town "{T}: Add {C}." + "{T}, Pay 1 life: Add one mana of any color." — the whole-card merge read the pay-life
  // cost off the FIRST add line, found none, and offered a FREE any-colour main; the plain line is the main, the
  // pay-life line rides as an extra carrying its cost).
  const unsafeMerge = foreign.length > 0 && riderless && tapLines.some((l) => l !== plain && (!EXTRA_MANA_LINE_RE.test(l) || /\bPay \d+ life\b/i.test(l)) && foreign.some((c) => new RegExp(c === "C" ? "\\{C\\}" : `\\{${c}\\}|any color`, "i").test(l)));
  // A LAND'S COUNT LINE READ AS ITS MAIN (2026-10-17 — the land {C} fallback): parseAddClause reads a variable-amount line first
  // wherever it is printed, so with the land counts read, Crypt of Agadeem's main became "{2}, {T}: Add {B} for each black
  // creature card …" (the explicit tap then offered no {B} with an empty graveyard) and Urza's Workshop's became its metalcraft
  // count WITHOUT the gate (the gate is read off the first mana line, the plain one). On a land the plain line is the main
  // product; the count line rides as its own record with its cost and gate (extraManaLineProducts' COSTED_COUNT_MANA_LINE_RE).
  const landCountMain = /\bLand\b/.test(typeLineOf(faceUpManaCard(card))) && !!result.amountSpec && !plainProd.amountSpec;
  if (!unsafeSac && !unsafeMerge && !landCountMain) return result;
  return { ...plainProd, ...(result.activationCondition && /activate only if/i.test(plain) ? { activationCondition: result.activationCondition } : {}) };
}
const _extraMemo = new WeakMap();
/**
 * "INSTEAD" RIDERS (2026-10-17 evening) — "<cost>: Add <base>. If <condition>, add <upgrade> instead." / "…, instead add <upgrade>."
 * The parse read only the first "Add" sentence, so the line always made its base: Urza's Tower, Mine and Power Plant never made
 * their Tron mana, and River of Tears made {U} after a land drop, where it makes only {B} — a colour the card can't make then.
 * Gemstone Caverns' luck-counter rider was dropped by its own strip (P·8). The rider is now read as the ability resolves (CR
 * 605.3b): the product carries `insteadUpgrade` { condition, product } and manaSources — the planner's and the explicit tap's
 * one read — makes the upgrade instead of the base while the condition holds (withInsteadUpgrade). Conditions read:
 *   · controlsEach — "you control an Urza's Mine and an Urza's Power-Plant": a phrase of land types (CR 205.3i) is a permanent
 *     you control with those subtypes (their rulings: land types, not names — one Planar Nexus is both); a phrase of capitalised
 *     words that are not all land types is a name ("a Command Tower and a Command Power Plant");
 *   · playedLandThisTurn — "you played a land this turn": a land is played only on its controller's own turn (CR 305.3), so
 *     the land-play count (reset at that player's untap step) is read only then;
 *   · selfCounter — "<this permanent / its own name> has a <kind> counter on it" (CR 201.5): Gemstone Caverns' luck counter
 *     (unreachable today — the opening-hand action is never offered — so it still makes {C}), Incubation Druid's +1/+1;
 *   · (2026-10-17) controlsEach with names of CREATURES — Tower Worker's "you control creatures named Mine Worker and Power Plant
 *     Worker" (its ruling: at least one creature of each name);
 *   · (2026-10-17) interveningIf — any condition the intervening-if evaluator decides, read through it as the ability resolves:
 *     Leafkin Druid's "you control four or more creatures", Raucous Audience's and Ilysian Caryatid's "you control a creature
 *     with power 4 or greater" (layer-aware power — a Hill Giant with a +1/+1 counter counts).
 * Any other condition (A-Town's "If you're in a city that starts with an A", Ugin's Labyrinth's exiled card, Brood Astronomer's
 * Planet, Sarevok's Tome's initiative, Undermountain Adventurer's dungeon) keeps the base and stamps `insteadUnread`: an
 * under-read the runtime may keep (each upgrade is more mana, except A-Town's any colour, which the old any-colour arm had made
 * unconditional), but a card carrying one is not fully modelled — coverage.landFullyCovered reads the flag, and since 2026-10-17
 * the native-mana tier does too (Leafkin Druid, Raucous Audience, Ilysian Caryatid and Tower Worker were credited native while
 * the runtime made only their base).
 */
const INSTEAD_RIDER_RE = /(\bAdd ([^.]+)\.)\s+If ([^,.]+), (?:add ([^.]+?) instead|instead add ([^.]+?))\./i;
const LAND_TYPE_WORDS = new Set(["cave", "desert", "forest", "gate", "island", "lair", "locus", "mine", "mountain", "plains", "planet", "power-plant", "sphere", "swamp", "tower", "town", "urza's"]);
const straightApostrophes = (s) => String(s || "").replace(/’/g, "'");
// The rider on a mana ability's own line — the colon before the "Add" sentence, and no quoted ability on the line.
function insteadRiderMatch(line) {
  const ci = line.indexOf(":");
  if (ci === -1 || /["“”]/.test(line)) return null;
  const m = INSTEAD_RIDER_RE.exec(line);
  return m && m.index > ci ? m : null;
}
// A condition the intervening-if evaluator DECIDES (2026-10-17 — Leafkin Druid's "you control four or more creatures", Raucous
// Audience's and Ilysian Caryatid's "you control a creature with power 4 or greater"): read through that evaluator, the reader an
// "Activate only if" mana gate already uses (Fanatic of Rhonas), layer-aware (permanentHasTypeWord, creaturePower). Consulted only
// after the kinds below read nothing, so none of their reads move; one the evaluator can't decide stays unread.
function parseInsteadCondition(text, card) {
  const c = straightApostrophes(text).trim();
  return parseInsteadConditionKind(c, card) || (conditionIsExpressible(c) ? { kind: "interveningIf", text: c } : null);
}
// TOWER WORKER (2026-10-17): "you control creatures named Mine Worker and Power Plant Worker" — its ruling: at least one creature
// named each. Two capitalised names, each a creature its controller controls (the name the permanent has now — a copy's).
const CONTROLS_CREATURES_NAMED_RE = /^you control creatures named ((?:[A-Z][A-Za-z'-]*\s?)+?) and ((?:[A-Z][A-Za-z'-]*\s?)+)$/;
function parseInsteadConditionKind(c, card) {
  if (/^you played a land this turn$/i.test(c)) return { kind: "playedLandThisTurn" };
  const named = c.match(CONTROLS_CREATURES_NAMED_RE);
  if (named) return { kind: "controlsEach", of: [named[1], named[2]].map((n) => ({ name: n.trim(), cardType: "Creature" })) };
  const own = c.match(/^(.+?) has an? ([a-z+/0-9-]+) counter on it$/i);
  if (own) {
    const subject = own[1].trim().toLowerCase();
    const name = straightApostrophes(card?.name).toLowerCase();
    return /^this (?:land|creature|artifact|enchantment|permanent)$/.test(subject) || (name && subject === name)
      ? { kind: "selfCounter", counter: own[2].toLowerCase() } : null;
  }
  const ctl = c.match(/^you control (an? .+)$/i);
  if (!ctl) return null;
  const of = [];
  for (const part of ctl[1].split(/,?\s+and\s+(?=an?\s)/i)) {
    const words = (part.match(/^an? (.+)$/i)?.[1] || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    if (words.every((w) => LAND_TYPE_WORDS.has(w.toLowerCase()))) of.push({ subtypes: words });
    else if (words.every((w) => /^[A-Z][A-Za-z'-]*$/.test(w))) of.push({ name: words.join(" ") });
    else return null;
  }
  return { kind: "controlsEach", of };
}
// The upgrade's own mana: "<N> mana of that type" / "<N> mana of <the base's own words>" is N of the base's set (Incubation Druid,
// Command Mine); anything else is parsed as its own "Add" clause, and only a plain product (symbols or any colour) is taken.
function parseInsteadUpgrade(baseText, upText, base, card) {
  const up = String(upText || "").trim();
  const q = up.match(/^(\S+) mana of (.+)$/i);
  const bq = String(baseText || "").trim().match(/^(\S+) mana of (.+)$/i);
  if (q) {
    const n = parseFixedQuantity(q[1]);
    const desc = q[2].trim().toLowerCase();
    if (n && (/^that (?:type|color)$/.test(desc) || (bq && bq[2].trim().toLowerCase() === desc))) {
      if (base.amountSpec || base.fixed || base.fixedSpec || !base.colors?.length) return null;
      return { colors: [...base.colors], amount: n, ...(base.colorsAmongSpec ? { colorsAmongSpec: { ...base.colorsAmongSpec } } : {}) };
    }
  }
  const made = parseAddClause(`Add ${up}.`, card);
  return made && Object.keys(made).every((k) => k === "colors" || k === "amount" || k === "fixed") ? made : null;
}
// The rider read onto the product its line made (or `insteadUnread` when it can't be read — or when the card's product is not
// that line's own: a rider never rides another line's mana).
function withInsteadRider(card, hits, keptLines, result) {
  if (hits.length !== 1) return { ...result, insteadUnread: true };
  const [{ m, i }] = hits;
  const lineProd = manaProduction({ ...card, oracle: keptLines[i], oracle_text: keptLines[i] });
  const condition = parseInsteadCondition(m[3], card);
  const product = productKey(lineProd) === productKey(result) ? parseInsteadUpgrade(m[2], m[4] ?? m[5], result, card) : null;
  return condition && product ? { ...result, insteadUpgrade: { condition, product } } : { ...result, insteadUnread: true };
}
/** Does an "instead" rider's condition hold for this permanent right now (parseInsteadCondition's kinds; any other is false)? */
function insteadConditionHolds(state, playerId, perm, condition) {
  const player = state?.players?.[playerId];
  switch (condition?.kind) {
    case "playedLandThisTurn":
      return state.activePlayer === playerId && (player?.landsPlayedThisTurn || 0) > 0;
    case "selfCounter":
      return (perm?.counters?.[condition.counter] || 0) > 0;
    case "controlsEach": {
      const bf = player?.battlefield || [];
      const lc = (s) => straightApostrophes(s).toLowerCase();
      return condition.of.every((req) => bf.some((p) => (req.subtypes
        ? req.subtypes.every((st) => permanentSubtypes(state, p.id).some((x) => lc(x) === lc(st)))
        : lc(manaCardOf(state, p)?.name) === lc(req.name) && (!req.cardType || permanentHasCardType(state, p.id, req.cardType)))));
    }
    case "interveningIf":
      return evaluateInterveningIf(state, condition.text, playerId, { sourcePermanentId: perm?.id }) === true;
    default:
      return false;
  }
}
/**
 * The production a permanent's printed ability makes right now, its "instead" rider applied — the upgrade's mana replaces the
 * base's (CR 605.3b, read as the ability resolves); every cost rider of the line is kept. Read by manaSources (the planner and
 * the explicit tap) and landsCouldProduce (CR 106.7 — what the ability would produce if it resolved now).
 */
function withInsteadUpgrade(state, playerId, perm, prod) {
  if (!prod?.insteadUpgrade || !insteadConditionHolds(state, playerId, perm, prod.insteadUpgrade.condition)) return prod;
  const { insteadUpgrade, colors: _c, amount: _a, fixed: _f, colorsAmongSpec: _s, amountSpec: _as, fixedSpec: _fs, ...riders } = prod;
  return { ...riders, ...insteadUpgrade.product };
}
const CHOSEN_TYPE_COUNT_MANA_LINE_RE = /^((?:\{[^}]+\}, )*)\{T\}: Choose a color\. Add an amount of mana of that color equal to the number of creatures you control of the chosen type\.$/i;
/**
 * A COUNT OR ANY-COMBINATION LINE BEHIND A MANA COST, BESIDE ANOTHER MANA LINE (2026-10-17 — the land {C} fallback): Cabal
 * Stronghold's "{3}, {T}: Add {B} for each basic Swamp you control.", Crypt of Agadeem's "{2}, {T}: Add {B} for each black
 * creature card in your graveyard.", Urza's Workshop's "Metalcraft — {T}: Add {C} for each Urza's land you control. Activate only
 * if you control three or more artifacts.", Baldur's Gate's "{2}, {T}: Add X mana of any one color, where X is the number of
 * other Gates you control.", Cascading Cataracts' "{5}, {T}: Add five mana in any combination of colors." Each printed beside a
 * plain "{T}: Add …" line, which is the card's main product; the line was never made — its single-line read fell to the land
 * {C} fallback, which credited it. It rides as its own record: the "Add" sentence (and its "Activate only if" gate) read alone
 * behind a bare {T}, its mana cost carried as `activationCost` (the free-activation fix — the planner funds it from other mana
 * first). The cost prefix admits mana pips only, so a non-mana cost item is never dropped on the way in; an ability word is
 * no rules text (CR 207.2c). A line that IS the card's main product (Cabal Coffers, Gaea's Cradle) is not read twice.
 */
const COSTED_COUNT_MANA_LINE_RE = /^(?:[A-Z][a-z]+ — )?((?:\{(?:\d+|[WUBRGC])\}, )*)\{T\}: (Add (?:\{[WUBRGC]\} for each [^.]+|X mana of any one color, where X is [^.]+|(?:two|three|four|five) mana in any combination of colors)\.(?: Activate only if [^.]+\.)?)$/;
/**
 * NYKTHOS (2026-10-17): "{2}, {T}: Choose a color. Add an amount of mana of that color equal to your devotion to that color."
 * (CR 700.5 — the mana symbols of that colour among the mana costs of permanents its controller controls). The amount depends on
 * the colour chosen, so one record per colour: each makes devotion-to-it of it (countForSpec's devotion), all five sharing the
 * land's one {T} (the planner taps a permanent once), each behind the {2}. Its line was credited off the land {C} fallback and
 * never made — Nykthos tapped for its plain {C} alone.
 */
const DEVOTION_TO_CHOSEN_MANA_LINE_RE = /^((?:\{(?:\d+|[WUBRGC])\}, )*)\{T\}: Choose a color\. Add an amount of mana of that color equal to your devotion to that color\.(?: \([^)]*\))?$/i;
/**
 * THE FACE THAT IS UP, for every mana reader in this file (CR 712.8d — a double-faced permanent with its front face up has
 * only that face's characteristics; CR 712.14 — one put onto the battlefield from anywhere but the stack enters front face
 * up). A card with a combined "Front // Back" type line carries both faces' text in its bundled oracle (cardIndex.oracleText:
 * "<name> - <type> {mana}" headers, a "//" line between), and the engine never turns a back face up (layers.faceUpTypeLine),
 * so on the battlefield it makes only its FRONT face's mana: that face's own type line decides whether it is a land, and
 * that face's own text decides what it adds. A modal face that was played or cast enters as its own single-face card
 * (modalDfc.mdfcFaceCards) and passes through unchanged — so a back-face land played as its back face taps for its own mana.
 * Text already narrowed to one line (a per-line probe of a combined card) keeps that line; a front block that doesn't parse
 * leaves no text, so no mana (the safe side).
 * ⛔ Before this read the parse took the whole combined card: a back face's Land made the front a land (raw oracle, reminder
 * text and created-token quotes kept) and both faces' text read as one card. Storm the Vault tapped for {U} per artifact and
 * sacrificed itself (its front's Treasure reminder, its back's "Add {U} for each artifact"); a reanimated Drowner of Truth
 * paid {C} to sacrifice itself for {C} (its Spawn tokens' quoted ability); Tamiyo, Inquisitive Student was a free any-colour
 * source off her back face's loyalty ability.
 */
function faceUpManaCard(card) {
  if (!typeLineOf(card).includes(" // ")) return card;
  const oracle = oracleOf(card);
  const blocks = oracle.split(/\n\/\/\n/);
  const text = blocks.length > 1 ? (parseFaceBlock(blocks[0])?.oracle ?? "") : oracle;
  const type = faceUpTypeLine(card);
  return { ...card, type, type_line: type, oracle: text, oracle_text: text };
}
const faceUpOracle = (card) => oracleOf(faceUpManaCard(card));

/**
 * THE ACTIVATION COST of a card's main mana ability (the free-activation fix, 2026-10-01): the MANA part of the cost printed
 * before the colon of the line the main product comes from — the Signets' "{1}, {T}: Add {U}{B}.", the {1} filter lands,
 * Cabal Coffers' "{2}, {T}: …", Selvala's "{G}, {T}: …". null when that product comes from a line with no mana in its cost
 * (a plain "{T}: Add …" — the common case), or when the card makes no mana.
 *
 * ⛔ Before this existed the planner tapped these for FREE: the parse reads the "Add" clause and nothing read the "{1}," in
 * front of it — a lone Dimir Signet paid {U}{B} with no other mana on the board, and a Signet plus an Island cast a
 * three-mana spell (both probed live). The planner now funds the activation from OTHER mana before the source produces
 * (planPaymentOnce), the commit charges it, and the explicit tap charges it to the pool.
 *
 * Which line: a main product that some no-mana-cost "Add" line makes on its own is that line's, and free. Otherwise it is a
 * mana-costed line's — the first whose own product matches, else the first costed line (charging a cost the product might
 * not carry is the safe direction). A pip this reader can't price ({X}, Phyrexian, snow, {2/W}) gives { unpayable: true }:
 * the source is never funded and never offered (FN-safe).
 */
const _actCostMemo = new WeakMap();
const productKey = (p) => JSON.stringify([[...(p?.colors || [])].sort(), p?.amount ?? null, p?.amountSpec ?? null, p?.fixed ?? null, !!p?.sacrifices]);
function parseActivationManaCost(costPart) {
  const cost = { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] };
  let any = false;
  for (const m of String(costPart).matchAll(/\{([^}]+)\}/g)) {
    const pip = m[1].trim().toUpperCase();
    if (pip === "T" || pip === "Q" || pip === "E") continue;
    any = true;
    if (/^\d+$/.test(pip)) { cost.generic += parseInt(pip, 10); continue; }
    if (/^[WUBRGC]$/.test(pip)) { cost[pip] += 1; continue; }
    const h = /^([WUBRG])\/([WUBRG])$/.exec(pip);
    if (h) { cost.hybrid.push([h[1], h[2]]); continue; }
    return { unpayable: true };
  }
  return any ? cost : null;
}
export function manaActivationCost(card) {
  if (!card || typeof card !== "object") return null;
  if (_actCostMemo.has(card)) return _actCostMemo.get(card);
  let out = null;
  const main = manaProduction(card);
  if (main) {
    const face = faceUpManaCard(card); // the main product is the face that is up's, so are the lines it is matched against
    const priced = oracleOf(face).split(/\n+/).map((l) => l.trim()).filter((l) => /^[^:]+:.*\bAdd\b/i.test(l))
      .map((l) => ({ l, cost: parseActivationManaCost(l.slice(0, l.indexOf(":"))) }));
    const key = productKey(main);
    const lineKey = (l) => productKey(manaProduction({ ...face, oracle: l, oracle_text: l }));
    const costed = priced.filter((x) => x.cost !== null);
    if (costed.length && !priced.some((x) => x.cost === null && lineKey(x.l) === key)) {
      out = (costed.find((x) => lineKey(x.l) === key) || costed[0]).cost;
    }
  }
  _actCostMemo.set(card, out);
  return out;
}
export function extraManaLineProducts(card, mainProd) {
  if (!card || typeof card !== "object") return [];
  if (_extraMemo.has(card)) return _extraMemo.get(card);
  const face = faceUpManaCard(card); // the face that is up's own lines, each parsed as that face
  const lines = oracleOf(face).split(/\n+/).map((l) => l.trim()).filter(Boolean);
  // No "which line is the main" guess: the main product's own colours decide. A complete line whose colours the
  // main already covers (and that adds no gate or sacrifice) IS the main line, or a duplicate of it — skipped.
  // A complete line adding a colour the main lacks is an extra even when it is printed FIRST (a plain
  // "{T}: Add {C}." beside an any-colour line the merge chose — the free colourless tap the census counted).
  const out = [];
  const isLand = /\bLand\b/.test(typeLineOf(face));
  for (const line of lines) {
    // ── THE LAND LINES (2026-10-17): a land's costed, bundle, max-speed and rider-bearing second lines — each regex's note says
    // what it admits. A land's only; a line the main product already makes at no more cost (mainMakesProduct) is not read twice.
    if (isLand) {
      const bc = BUNDLE_CHOICE_MANA_LINE_RE.exec(line);
      if (bc) {
        const activationCost = parseActivationManaCost(bc[1]);
        if (activationCost && !activationCost.unpayable) {
          for (const bundleText of bc[2].split(/,? or |, /)) {
            const symbols = [...bundleText.matchAll(/\{([WUBRGC])\}/g)].map((x) => x[1]);
            const fixed = {};
            for (const c of symbols) fixed[c] = (fixed[c] || 0) + 1;
            out.push({ colors: Object.keys(fixed), amount: symbols.length, fixed, requiresTap: true, activationCost, bundle: symbols.join(""), extraLine: line });
          }
        }
        continue;
      }
      const cl = COSTED_MANA_LINE_RE.exec(line);
      if (cl) {
        const activationCost = parseActivationManaCost(cl[1]);
        const rider = cl[3] ? MANA_SPENT_RIDERS.find(([re]) => re.test(cl[3]))?.[1] : null;
        if (cl[3] && !rider) continue; // an unread sentence after the add: the line is not made (FN-safe)
        const bare = `{T}: ${cl[2]}`;
        const prod = activationCost && !activationCost.unpayable ? manaProduction({ ...face, oracle: bare, oracle_text: bare }) : null;
        if (prod?.colors?.length && !mainMakesProduct(card, mainProd, prod, activationCost)) {
          out.push({ ...prod, activationCost, ...(rider ? { spentRider: { ...rider } } : {}), extraLine: line });
        }
        continue;
      }
      const ms = MAX_SPEED_MANA_LINE_RE.exec(line);
      if (ms) {
        const prod = manaProduction({ ...face, oracle: ms[1], oracle_text: ms[1] });
        if (prod?.colors?.length) out.push({ ...prod, requiresMaxSpeed: true, extraLine: line });
        continue;
      }
      const pain = PAIN_PAIR_MANA_LINE_RE.test(line);
      const gain = OPPONENTS_GAIN_MANA_LINE_RE.exec(line);
      if (pain || gain || LAND_EXTRA_MANA_LINE_RE.test(line)) {
        let prod = manaProduction({ ...face, oracle: line, oracle_text: line });
        if (gain && prod) prod = { ...prod, opponentsGainLife: parseInt(gain[3], 10) };
        // The pair's damage must ride its product (parseAddClause's single-line pain pair); a painless read is never offered.
        if (pain && !prod?.painColors) continue;
        if (prod?.colors?.length && !mainMakesProduct(card, mainProd, prod, null)) out.push({ ...prod, extraLine: line });
        continue;
      }
    }
    // THREE TREE CITY (play-weighted P·7): "{2}, {T}: Choose a color. Add an amount of mana of that color equal to the number of
    // creatures you control of the chosen type." — any ONE colour, sized by the creatures of the type THIS permanent chose as
    // it entered (CR 614.12; manaSources resolves the count off the permanent's stamped chosenType), behind a mana cost the
    // planner funds before the line produces (activationCost — the free-activation fix). The cost prefix admits mana pips
    // only, so a non-mana cost item can never be dropped on the way in.
    const ctc = CHOSEN_TYPE_COUNT_MANA_LINE_RE.exec(line);
    if (ctc) {
      const activationCost = parseActivationManaCost(ctc[1]);
      if (!activationCost?.unpayable) out.push({ colors: ["W", "U", "B", "R", "G"], amount: 0, amountSpec: { kind: "creaturesOfSourceChosenType" }, ...(activationCost ? { activationCost } : {}), extraLine: line });
      continue;
    }
    // NYKTHOS (DEVOTION_TO_CHOSEN_MANA_LINE_RE): one record per colour, each its devotion to that colour, behind the line's cost.
    // A land's line only: Nyx Lotus prints it as its only mana line, so it has no main product and manaSources reads no extra
    // line of it (a null main is a refused card — Joraga Treespeaker's level bands); making it is its own slice.
    const dev = /\bLand\b/.test(typeLineOf(face)) ? DEVOTION_TO_CHOSEN_MANA_LINE_RE.exec(line) : null;
    if (dev) {
      const activationCost = parseActivationManaCost(dev[1]);
      if (!activationCost?.unpayable) {
        for (const color of ["W", "U", "B", "R", "G"]) out.push({ colors: [color], amount: 0, amountSpec: { kind: "devotion", color }, requiresTap: true, ...(activationCost ? { activationCost } : {}), extraLine: line });
      }
      continue;
    }
    // A COUNT OR ANY-COMBINATION LINE BEHIND A MANA COST (COSTED_COUNT_MANA_LINE_RE): its "Add" sentence read alone behind a bare
    // {T}; nothing when the count isn't read, the cost can't be priced, or the line is the card's main product already.
    const ccl = COSTED_COUNT_MANA_LINE_RE.exec(line);
    if (ccl) {
      const activationCost = parseActivationManaCost(ccl[1]);
      const bare = `{T}: ${ccl[2]}`;
      const prod = activationCost?.unpayable ? null : manaProduction({ ...face, oracle: bare, oracle_text: bare });
      if (prod?.colors?.length && !(mainProd && productKey(prod) === productKey(mainProd))) out.push({ ...prod, ...(activationCost ? { activationCost } : {}), extraLine: line });
      continue;
    }
    // + 2026-10-17: the {T} form on a land (TAP_OTHER_TAP_MANA_LINE_RE — Holdout Settlement), its single-line product carrying its payer.
    const tapOtherLine = TAP_OTHER_NO_TAP_MANA_LINE_RE.test(line) || TAP_OTHER_TAP_MANA_LINE_RE.test(line);
    if (!EXTRA_MANA_LINE_RE.test(line) && !tapOtherLine) continue;
    const prod = manaProduction({ ...face, oracle: line, oracle_text: line });
    if (!prod || !prod.colors?.length) continue;
    // A tap-other line is a source only with its payers: a product without `extraTap` (a land's raw-oracle parse keeps no payer)
    // would be the line's mana for nothing — never offered.
    if (tapOtherLine && !prod.extraTap) continue;
    // Covered = the main already offers this: every colour, the same sacrifice cost, and the same gate (a card whose
    // ONLY mana line is gated — Tablet of Compleation — has that line AS its main; it must not ride twice).
    const covered = !!mainProd && prod.colors.every((c) => (mainProd.colors || []).includes(c))
      && !!prod.sacrifices === !!mainProd.sacrifices
      // S17 (Plaza of Heroes): a RESTRICTED line is never "the same" as an unrestricted main (nor vice versa), and a
      // board-derived colour set (colorsAmongSpec) is not the placeholder five it parses to — both ride as extras.
      && !!prod.restriction === !!mainProd.restriction
      && (prod.colorsAmongSpec?.kind || null) === (mainProd.colorsAmongSpec?.kind || null)
      && (prod.activationCondition || null) === (mainProd.activationCondition || null)
      // STAGE ④-4: a counter-removal line is its own ability — covered only by a main that IS that same line
      // (the Batteries), never by a plain tap of the same colour (Mage-Ring Network's storage line rides).
      && (prod.removesCounters?.type || null) === (mainProd.removesCounters?.type || null)
      && (prod.removesCounters?.mode || null) === (mainProd.removesCounters?.mode || null)
      // 2026-10-17: a tap-other line (Relic of Legends) is its own ability — its payers are its cost, and it has no {T} — never
      // covered by a {T} line making the same colours.
      && !!prod.extraTap === !!mainProd.extraTap;
    if (covered) continue;
    out.push({ ...prod, extraLine: line });
  }
  _extraMemo.set(card, out);
  return out;
}

/**
 * WHAT ONE PRINTED LINE OF A LAND MAKES, as the runtime makes it (2026-10-17 — the land {C} fallback): coverage.landFullyCovered's
 * per-line read, so the land gate credits a mana line only when the engine plays it. null when the line makes nothing.
 *   · one of the card's extra mana records (extraManaLineProducts) — Three Tree City's and Nykthos' costed lines, the count lines,
 *     a storage land's counter line, a Verge's gated colour;
 *   · the line read alone (manaProduction on the single line — the gate's read before this, which covers the main line);
 *   · the "one mana of the chosen color" line of a card whose main product is that chosen colour: read alone it has no chooser
 *     beside it, so it parses to nothing (the chosen-colour arm needs the card's "As it enters, choose a color"), and the land
 *     {C} fallback used to answer for it — every chosen-colour land (Night Market, Big Apple, 3 a.m.) was credited on a {C}.
 * Reminder text is ignored when the line is matched (the gate reads lines with it stripped; the card's own lines keep it).
 * The line read alone counts only when the card's main product makes it (mainMakesProduct, 2026-10-17 — the land lines): a filter
 * land's hybrid line, a "{1}, {T}: Add one mana of any color" beside a plain {C}, Phyrexian Tower's sacrifice line are extra records
 * now, and a line no record makes is not credited.
 */
const CHOSEN_COLOR_MANA_LINE_RE = /^\{T\}: Add (?:\{[WUBRG]\} or )?one mana of the chosen color\.$/i;
export function landLineMana(card, line) {
  if (!card || typeof card !== "object") return null;
  const norm = (t) => stripReminder(String(t || "")).replace(/\s+/g, " ").trim();
  const want = norm(line);
  if (!want) return null;
  const main = manaProduction(card);
  // An extra record's line as printed, and a max-speed line also as effects/abilities.js rewrites it for parseActivatedAbilities
  // ("Max speed — {T}: Add {C}{C}." → "{T}: Add {C}{C}. Activate only if your speed is 4.") — the land gate checks both spellings.
  // An ability word is no rules text (CR 207.2c) and the activated-ability parser strips it ("Metalcraft — {T}: …" — Urza's
  // Workshop's count line), so the label-less spelling is the record's too.
  const keysOf = (e) => {
    const ms = MAX_SPEED_MANA_LINE_RE.exec(e.extraLine);
    if (ms) return [norm(e.extraLine), norm(`${ms[1].replace(/\.$/, "")}. Activate only if your speed is 4.`)];
    return [norm(e.extraLine), norm(String(e.extraLine).replace(ABILITY_WORD_PREFIX_RE, ""))];
  };
  const extra = extraManaLineProducts(card, main).find((e) => keysOf(e).includes(want));
  if (extra) return extra;
  const face = faceUpManaCard(card);
  const raw = String(line).trim();
  const single = manaProduction({ name: face.name, type: typeLineOf(face), oracle: raw });
  // ⛔ THE LINE READ ALONE COUNTS ONLY WHEN THE CARD'S MAIN PRODUCT MAKES IT (2026-10-17 — the land lines). Read alone, a line
  // parses whether or not the whole card ever makes it: 54 single-faced lands (12 in the play-weighted top 1,000) were credited
  // "land" on a line no record made — the filter lands' hybrid line (misread alone as one mana of either colour), a costed
  // "{1}, {T}: Add one mana of any color" beside a plain {C}, Phyrexian Tower's sacrifice line, Spire of Industry's gated pay-life
  // line. Each is now an extra record (read above) or not credited; the single-line read stands only for the main's own line.
  if (single && mainMakesProduct(card, main, single, lineManaCost(raw))) return single;
  return main?.chosenColor && CHOSEN_COLOR_MANA_LINE_RE.test(want) ? main : null;
}
// The mana part of a line's own cost (before its colon), or null for a cost with no mana in it.
function lineManaCost(line) {
  const ci = String(line || "").indexOf(":");
  return ci === -1 ? null : parseActivationManaCost(line.slice(0, ci));
}
/**
 * DOES THE CARD'S MAIN PRODUCT MAKE WHAT THIS LINE MAKES, AT NO MORE COST? (2026-10-17 — the land lines.) True when every colour of
 * `prod` is the main's (the same board-derived set, chosen colour or imprint, where either has one), its amount is no more (the same
 * count or bundle where either has one), the main asks no cost or carries no condition the line doesn't — a sacrifice, a creature,
 * a graveyard card, more life, a payer, counters, a gate, a spend restriction, a skipped untap, Max speed, damage on a colour the
 * line makes, a per-turn limit, an opponent's life gain — and its mana cost (manaActivationCost) is none or the line's own. The
 * land gate reads a line alone only when this holds (landLineMana), and extraManaLineProducts' land readers skip a line it holds
 * for (it is the main's own line or one the main betters: a duplicate record would only be the costlier way to the same mana).
 */
function mainMakesProduct(card, main, prod, lineCost) {
  if (!main || !prod) return false;
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  if ((prod.colorsAmongSpec || main.colorsAmongSpec) && !same(prod.colorsAmongSpec, main.colorsAmongSpec)) return false;
  if (!!prod.chosenColor !== !!main.chosenColor || !!prod.colorsFromImprint !== !!main.colorsFromImprint) return false;
  if (!(prod.colors || []).every((c) => (main.colors || []).includes(c))) return false;
  if (prod.amountSpec || main.amountSpec || prod.fixedSpec || main.fixedSpec) {
    if (!same(prod.amountSpec, main.amountSpec) || !same(prod.fixedSpec, main.fixedSpec)) return false;
  } else if ((prod.amount ?? 1) > (main.amount ?? 1)) return false;
  if ((prod.fixed || main.fixed) && !same(prod.fixed, main.fixed)) return false;
  for (const k of ["sacrifices", "sacrificesCreature", "sacrificesFood", "exilesGyCard", "fromHand", "doesNotUntapNext", "requiresMaxSpeed"]) if (main[k] && !prod[k]) return false;
  for (const k of ["extraTap", "removesCounters", "putsCounter", "activationCondition", "restriction", "opponentsGainLife"]) if (main[k] != null && !same(main[k], prod[k])) return false;
  if (main.activationLimit && !same({ ...main.activationLimit, line: null }, prod.activationLimit ? { ...prod.activationLimit, line: null } : null)) return false;
  if ((main.payLife ?? 0) > (prod.payLife ?? 0)) return false;
  const pained = (main.painColors || []).filter((c) => (prod.colors || []).includes(c));
  if (pained.length) {
    if (!pained.every((c) => (prod.painColors || []).includes(c)) || (prod.painAmount || 0) < (main.painAmount || 0)) return false;
    if (!main.painCondition && !main.painUnlessCitysBlessing && (prod.painCondition || prod.painUnlessCitysBlessing)) return false;
  }
  if (prod.requiresTap === false && main.requiresTap !== false) return false;
  if (prod.insteadUpgrade && !same(prod.insteadUpgrade, main.insteadUpgrade)) return false;
  const mainCost = manaActivationCost(card);
  if (mainCost && !same(mainCost, lineCost)) return false;
  return true;
}

export function manaProduction(card) {
  if (!card) return null;
  if (typeof card === "object") {
    if (_prodMemo.has(card)) return _prodMemo.get(card);
    // THE FACE THAT IS UP (faceUpManaCard): a combined "Front // Back" card makes its front face's mana and nothing else — every
    // read below runs on that face alone. The memo stays keyed on the real card.
    {
      const face = faceUpManaCard(card);
      if (face !== card) {
        const result = manaProduction(face);
        _prodMemo.set(card, result);
        return result;
      }
    }
    // SAGA CHAPTER LINES (play-weighted P·4 — Urza's Saga, "I — This Saga gains \"{T}: Add {C}.\""): a chapter is a TRIGGERED
    // ability (CR 714.2b), and a quoted "{T}: Add …" inside one is an ability the Saga GAINS when that chapter resolves (the
    // self-grant, offered off the board by grantedManaSpecsFor) — never one it has from the start. The Add matcher below
    // reads "Add" anywhere, so it tapped Urza's Saga for {C} the moment it landed, chapter I still on the stack. A Saga's
    // chapter lines are dropped before the parse; the memo stays keyed on the real card.
    // The re-parse also runs with the type line BLANKED, and that is load-bearing, not only the recursion stop: the land
    // fallback credits {C} to any land whose text says "add" (a basic's reminder text is its real ability), so with the type
    // kept Urza's Saga still made {C} off its own reminder ("add a lore counter"). (A double-faced Saga — Welcome to . . . //
    // Jurassic Park, whose back face is a land — reaches this branch already read as its front face, by the face-up read above.)
    // Measured over every Saga in the bundled oracle: four reads change, all four phantoms removed — Urza's Saga, Song of
    // Freyalise (the enchantment itself tapped for any color), Huatli, Poet of Unity (her back face's chapter II read as
    // her own) and Welcome to . . . ; none gained.
    if (/\bSaga\b/.test(String(card.type ?? card.type_line ?? ""))) {
      const kept = String(card.oracle ?? card.oracle_text ?? "").split("\n").filter((l) => !/^\s*[IV]+(?:\s*,\s*[IV]+)*\s*—/.test(l)).join("\n");
      const result = manaProduction({ ...card, oracle: kept, oracle_text: kept, type: "", type_line: "" });
      _prodMemo.set(card, result);
      return result;
    }
    // "INSTEAD" RIDERS (INSTEAD_RIDER_RE, 2026-10-17 evening; P·8 had stripped Gemstone Caverns' alone): the rider sentence is
    // dropped before the parse, so the base is read as the line's own product — the any-colour arm used to read Gemstone Caverns'
    // and A-Town's rider as the line's mana, with no counter and in no city — and the rider rides that product as
    // `insteadUpgrade` (manaSources makes the upgrade while its condition holds) or `insteadUnread`.
    {
      const lines = String(card.oracle ?? card.oracle_text ?? "").split("\n");
      const hits = lines.map((l, i) => ({ m: insteadRiderMatch(l), i })).filter((h) => h.m);
      if (hits.length) {
        const keptLines = lines.map((l, i) => { const h = hits.find((x) => x.i === i); return h ? l.replace(h.m[0], () => h.m[1]) : l; });
        const kept = keptLines.join("\n");
        const base = manaProduction({ ...card, oracle: kept, oracle_text: kept });
        const result = base && withInsteadRider(card, hits, keptLines, base);
        _prodMemo.set(card, result);
        return result;
      }
    }
    // KW-ENGINES "Max speed —" split (CR 702.179): the generic Add matcher below reads "Add" ANYWHERE
    // in the oracle, so a "Max speed — {T}: Add {R}{R}." line was offered UNGATED — free double-red at
    // speed zero, measured live (Endrider Catalyzer). Split per line, the condition-gate discipline:
    // parse the PLAIN lines first (a card with an ungated source keeps it and the gated extra stays a
    // safe under-offer); a card whose ONLY production is max-speed-prefixed parses those lines with the
    // prefix stripped and carries `requiresMaxSpeed` — manaSources gates it on live speed.
    let result;
    // `gateOracle` feeds the activation-gate detection below: for a max-speed card it is the text the
    // modelled production actually came from, so a gate can never mis-bind across the split.
    let gateOracle = null;
    const rawOracle = String(card.oracle ?? card.oracle_text ?? "");
    if (rawOracle.split("\n").some((l) => MAX_SPEED_PREFIX.test(l))) {
      const plain = rawOracle.split("\n").filter((l) => !MAX_SPEED_PREFIX.test(l)).join("\n");
      const plainCard = { ...card, oracle: plain, oracle_text: plain };
      result = manaProductionImpl(plainCard) || restrictedManaProduction(plainCard);
      gateOracle = plain;
      if (!result) {
        const gated = rawOracle.split("\n").filter((l) => MAX_SPEED_PREFIX.test(l)).map((l) => l.replace(MAX_SPEED_PREFIX, "")).join("\n");
        const gatedCard = { ...card, oracle: gated, oracle_text: gated };
        const gatedProd = manaProductionImpl(gatedCard) || restrictedManaProduction(gatedCard);
        if (gatedProd) result = { ...gatedProd, requiresMaxSpeed: true };
        gateOracle = gated;
      }
    } else {
      result = manaProductionImpl(card) || restrictedManaProduction(card);
    }
    // CONDITION-GATED source (CR 602.5): carry the gate ON the product so manaSources can evaluate it live
    // against the board.
    //
    // ⚠️ THE GATE MUST COME FROM A MANA LINE, AND BE ONE THE EVALUATOR CAN ANSWER. This used to take the
    // first "activate only if …" ANYWHERE in the oracle, which was safe only while manaProductionImpl nulled
    // the whole card on an inexpressible gate. Now that the refusal is per-LINE, two ways to mis-stamp open
    // up, and both are wrong in the under-delivering direction (a source gated on something that isn't its
    // gate simply stops producing):
    //   • an INEXPRESSIBLE gate — its line was already dropped from what was parsed, so the modelled mana is
    //     unconditional and must not inherit it (Bleachbone Verge's plain "{T}: Add {B}." beside a gated
    //     "{T}: Add {W}. Activate only if you control a Plains or a Swamp");
    //   • a gate on a NON-MANA ability — Madblind Mountain's gated ability is a SHUFFLE, and its mana is the
    //     basic-land reminder "({T}: Add {R}.)".
    // So: only a line that BOTH produces mana AND carries an answerable gate may stamp one. Mox Opal /
    // Fanatic of Rhonas are unaffected (expressible gate on the mana line) and stay live-gated — pinned.
    // Mirrors what the impl actually PARSES: drop inexpressibly-gated lines, then take the FIRST remaining
    // line that produces mana — parseAddClause reads the first Add clause, so that is the modelled ability
    // and only ITS gate may apply. A card with an unconditional mana line AND a separate gated one
    // (Fanatic of Rhonas: plain "{T}: Add {G}." then a Ferocious-gated "{T}: Add {G}{G}{G}{G}.") therefore
    // keeps its unconditional production ungated — the older any-match form wrongly gated the {G} on
    // ferocious, which silently switched the dork off until a 4-power creature was out.
    const modelledManaLine = result && (gateOracle ?? oracleOf(card)).split(/\n+/)
      .filter((line) => {
        const g = line.match(/\bactivate (?:this ability )?only if ([^.]+)\./i);
        return !(g && !conditionIsExpressible(g[1]));
      })
      .find((line) => /\badd\b/i.test(line));
    const gate = modelledManaLine && modelledManaLine.match(/\bactivate (?:this ability )?only if ([^.]+)\./i);
    if (gate) result = { ...result, activationCondition: gate[1].trim() };
    // THE PER-TURN LIMIT a mana line prints (manaActivationLimit, 2026-10-17): read off the card's mana lines that survive
    // manaLineRefused; the first limited one stamps the product, keyed by its own text. A card whose main product comes from
    // another, unlimited line takes the limit too — an under-offer, never an extra activation.
    if (result) {
      const limited = (gateOracle ?? oracleOf(card)).split(/\n+/).map((l) => l.trim())
        .filter((l) => !manaLineRefused(l)).map((l) => ({ l, limit: manaActivationLimit(l) })).find((x) => x.limit);
      if (limited) result = { ...result, activationLimit: { ...limited.limit, line: limited.l } };
    }
    result = honestMultiLineMain(card, result);
    _prodMemo.set(card, result);
    return result;
  }
  return manaProductionImpl(card) || restrictedManaProduction(card);
}

/**
 * SPEND-RESTRICTED production — attempted ONLY when the unrestricted path already produced nothing.
 *
 * ⭐ THAT ORDERING IS THE WHOLE SAFETY ARGUMENT. This runs exclusively on cards `manaProductionImpl` has
 * ALREADY refused (null), so no card that produces mana today can have its production changed, re-typed or
 * re-scoped by this function. The blast radius is exactly "cards that made no mana at all", which is why the
 * tier diff for this change can only ever GAIN.
 *
 * The restricted lines are stripped of their restriction SENTENCE and re-parsed, so the "Add" clause is read
 * by the same parser as every other source — then the restriction rides back on the product as `restriction`,
 * for manaSources to carry and planPayment to enforce.
 */
function restrictedManaProduction(card) {
  // ⛔ QUOTED GRANTS ARE NOT THIS CARD'S MANA, and skipping this check was a live FP I shipped into the
  // suite for one run. Battery Bearer ("Creatures you control have \"{T}: Add {C}. This mana can't be spent
  // to cast a nonartifact spell.\"") and Inga and Esika grant a restricted ability to OTHER creatures; the
  // granter taps for nothing at all. Stripping the restriction sentence and re-parsing credited the GRANTER
  // with {C} — a fabricated source on a card that makes no mana, which is worse than the restriction bug
  // this whole function exists to fix.
  //
  // So the restriction must be printed OUTSIDE any quoted span to count. A card whose only restriction lives
  // inside a grant falls through to the unchanged refusal, and the granted spec keeps being read by
  // layers.grantedManaSpecsFor on the HOST — where teaching it restrictions is a separate, unbuilt job.
  const unquoted = oracleOf(card).replace(/"[^"]*"/g, " ");
  if (!/\b(?:spend this mana only|can't be spent to)\b/i.test(unquoted)) return null;
  const restriction = parseSpendRestriction(oracleOf(card));
  if (!restriction) return null;
  const stripped = oracleOf(card).replace(/\s*Spend this mana only[^.]*\./gi, "").replace(/\s*This mana can't be spent to[^.]*\./gi, ""); // + the negative form (Powerstone, 2026-09-06)
  if (!/\badd\b/i.test(stripped)) return null;
  const prod = manaProductionImpl({ ...card, oracle: stripped, oracle_text: stripped });
  if (!prod) return null;
  return { ...prod, restriction };
}

// ===== SPEND-RESTRICTED MANA (CR 106.6) — the CAST half ==============================================
// "Spend this mana only to cast a creature spell." (Herd Heirloom) · "… only to cast artifact spells or
// activate abilities of artifacts." (Dalakos) · "… only to cast your commander." (Jeweled Lotus).
//
// ⭐ THIS IS THE GRADUATION OF A CAPABILITY PIN, and the pin named its own condition: the guard above reads
// "route the whole card out … UNTIL RESTRICTIONS ARE REAL". They are now real for the CAST half.
//
// ⛔ ONLY THE CAST HALF, AND THAT ASYMMETRY IS THE SAFETY. A card permitting "cast artifact spells OR
// activate abilities of artifacts" is modeled as permitting only the CAST — the engine therefore uses the
// source in a STRICT SUBSET of the situations the printed card allows. Under-using a permission is a safe
// false negative; over-using one is the forbidden FP this whole guard exists for. So every "or activate …"
// tail is deliberately ignored rather than approximated.
//
// Returns { castTypes: [...] } — a list of type-line words, ANY of which satisfies the restriction (the
// printed "or"/"and/or" between spell types is a permission list, not a conjunction) — or null, which keeps
// the card refused exactly as before. NULL IS THE DEFAULT for everything not explicitly recognised:
// "to activate abilities", "to pay cumulative upkeep costs", "on costs that contain {X}", and every other
// non-cast permission still routes the card to the Arbiter.
const SPEND_CAST_TYPE_WORDS = new Set([
  // card types (CR 205.2a) — matched as \b<word>\b against the spell's type line
  "artifact", "creature", "enchantment", "instant", "sorcery", "planeswalker", "battle", "land",
  // subtypes that appear in printed spend restrictions, each a real type-line word
  "aura", "equipment", "dinosaur", "myr", "angel", "dwarf", "saga", "elemental", "vehicle",
  // (QUARTET Phase 4, 2026-08-15 — the Dragons-deck restricted sources: Rivaz of the Claw
  // "Dragon creature spells", Dragonlord's Servant-class rocks. A real type-line word, word-bounded
  // like every sibling.)
  "dragon",
  // SHELF-85 S17 (2026-09-04 — Mech Hangar "Spend this mana only to cast a Pilot or Vehicle spell"): Pilot is a real
  // creature-subtype word on the type line (the Shorikai / Prodigy tokens are Pilots), word-bounded like every sibling.
  "pilot",
  // SHELF-85 S17 (2026-09-04 — Plaza of Heroes "Spend this mana only to cast a legendary spell"): a supertype word
  // (CR 205.4), verbatim on the type line, word-bounded like every sibling.
  "legendary",
  // 2026-10-17 (the land lines — Maelstrom of the Spirit Dragon "… a Dragon spell or an Omen spell"): Omen is a spell type of instants
  // and sorceries (CR 205.3k), on the type line of a card cast as an Omen. This engine casts an omen card only normally (omenPrepare.js),
  // so no Omen spell reaches its stack yet; the word is read, never matched to a creature cast normally (CR 720.4).
  "omen",
]);
// The keywords a spend restriction may name a spell by — "a spell that has freerunning" (Brotherhood Headquarters, 2026-10-17): the
// cast card's own keyword (spendRestrictionAllows reads its keyword list and its keyword line). A closed list; any other word refuses.
const SPEND_CAST_KEYWORDS = new Set(["freerunning"]);
/**
 * MANA-SPENT RIDER (SHELF-85 V11, 2026-09-04 — Path of Ancestry): "When that mana is spent to cast a creature spell that
 * shares a creature type with your commander, scry 1." — a reflexive trigger on the mana THIS source made. Parsed here
 * so manaSources stamps it on the record, planPayment carries it on the tap, and the cast site (actionDispatcher)
 * enqueues the trigger when the cast spell qualifies. Exactly this printing (one corpus carrier); anything wider → null.
 */
export function parseManaSpentRider(card) {
  const text = String(card?.oracle || card?.oracle_text || "");
  if (!/\bwhen that mana is spent to cast a creature spell that shares a creature type with your commander, scry 1\./i.test(text)) return null;
  return { kind: "scry", amount: 1, castType: "creature", sharesCommanderType: true };
}

export function parseSpendRestriction(oracle) {
  const text = String(oracle || "").toLowerCase();
  const clauses = [...text.matchAll(/spend this mana only ([^.]*)\./g)].map((m) => m[1]);
  // THE NEGATIVE FORM (QUARTET Phase 4 step 3, 2026-09-06 — the Powerstone token "This mana can't be spent to cast a nonartifact
  // spell.", Battery Bearer's grant): "can't be spent to cast a non<Type> spell" = casts of that type ONLY, and — because the
  // sentence restricts CASTING alone — every ability spend stays legal (abilityOf "@any"). A negated word outside the
  // vocabulary refuses the whole restriction (null → a safe FN, never a laundered pool).
  const negatives = [...text.matchAll(/this mana can't be spent to cast (?:a |an )?non([a-z]+) spells?\./g)].map((m) => m[1]);
  if (!clauses.length && !negatives.length) return null;
  const types = new Set();
  const abilityOf = [];
  for (const neg of negatives) {
    if (!SPEND_CAST_TYPE_WORDS.has(neg)) return null;
    types.add(neg);
    if (!abilityOf.includes("@any")) abilityOf.push("@any");
  }
  let chosenType = false;
  let uncounterableIfSpent = false;
  // COLOUR WORDS (QUARTET Phase 4 step 3's last class, 2026-09-06 — Shrine of the Forsaken Gods "only to cast colorless spells",
  // Eldrazi Temple "colorless Eldrazi spells or activate abilities of colorless Eldrazi"): a colour PREDICATE beside the type
  // words — the cast card's colours (castColorless) and the activating source's colours (abilityColorless), both checked by
  // spendRestrictionAllows against context the sites pass (castCard / activatingColors).
  let castColorless = false;
  let abilityColorless = false;
  const castKeywords = [];
  let castMonocolored = null;
  for (const rawClause of clauses) {
    // TWO "a <type> spell" ITEMS (2026-10-17 — Maelstrom of the Spirit Dragon "to cast a Dragon spell or an Omen spell"): the cast list
    // below reads "cast <list> spell(s)" once, so the second item was dropped — a restriction narrower than printed. Folded into one
    // list ("a Dragon or an Omen spell") before it is read; each word is still checked against the vocabulary.
    const clause = rawClause.replace(/\b(an? [a-z]+) spell or (an? [a-z]+) spell\b/g, (m, x, y) => `${x} or ${y} spell`);
    // "… OR A SPELL THAT HAS <keyword>" (2026-10-17 — Brotherhood Headquarters "to cast an Assassin spell or a spell that has freerunning,
    // or to activate an ability of an Assassin source"): a cast permission by keyword (SPEND_CAST_KEYWORDS). It was dropped, and the
    // record paid for Assassin spells only. An unlisted keyword refuses the whole restriction (a safe FN).
    for (const km of clause.matchAll(/\bor a spell that has ([a-z]+)(?=$|[,.])/g)) {
      if (!SPEND_CAST_KEYWORDS.has(km[1])) return null;
      if (!castKeywords.includes(km[1])) castKeywords.push(km[1]);
    }
    // ACTIVATION-ONLY (SG-18, 2026-09-03 — Shang-Chi "Spend this mana only to activate abilities of creature sources."):
    // the ONE permission is ACTIVATING a creature's ability — no cast at all. Modeled as `abilityOf: ["creature"]`;
    // spendRestrictionAllows honours it only when the payment site threads `activatingIsCreature` (the permanent
    // activated-ability offer + its dispatch), so a spell or a non-creature's ability can never spend it. Only the
    // "creature" word for now (the sole corpus form) — any other source word keeps the whole card refused.
    // (2026-09-06, QUARTET Phase 4 step 3: the plain form now rides the LIST loop below — any vocabulary word, matched at
    // payment against the activating source's type line; "creature" still reads the layer-aware flag.)
    // CHOSEN-TYPE (CAP-CAVERN, 2026-09-03 — CR 614.12 / 106.6): "Spend this mana only to cast a creature spell of
    // the chosen type[, and that spell can't be countered]." (Cavern of Souls, Unclaimed Territory, Secluded
    // Courtyard). The type word must be a vocabulary word; the CHOSEN type is unknown here (no permanent in
    // hand) — the restriction is stamped `chosenType` and manaSources resolves it per permanent
    // (resolveSourceRestriction) into the conjunctive "<chosen> <word>" entry, or refuses the source when the
    // permanent never chose. The "can't be countered" tail rides as `uncounterableIfSpent`, which the payment
    // plan carries to the cast site (a spell that spent this mana is stamped uncounterable).
    {
      // + the ABILITY tail on the chosen-type form (QUARTET Phase 4 step 3, 2026-09-06 — Secluded Courtyard "… or activate an
      // ability of a creature source of the chosen type"): abilityOf carries the "@chosenType" placeholder, which
      // resolveSourceRestriction swaps for the land's chosen word so the activation branch matches the source's type line.
      const ct = /^to cast an? ([a-z]+) spell of the chosen type(, and that spell can't be countered)?( or (?:to )?activate an ability of an? (?:[a-z]+ )?source of the chosen type)?$/.exec(clause.trim());
      if (ct) {
        if (!SPEND_CAST_TYPE_WORDS.has(ct[1])) return null;
        types.add(ct[1]);
        chosenType = true;
        if (ct[2]) uncounterableIfSpent = true;
        if (ct[3]) abilityOf.push("@chosenType");
        continue;
      }
    }
    // MONOCOLORED SPELLS OF THE CHOSEN COLOUR (play-weighted #890, 2026-10-17 — Throne of Eldraine "Spend this mana only to cast
    // monocolored spells of that color."): a colour predicate on the cast spell, not a type word — exactly one colour (CR 105.2a:
    // monocolored), the source's chosen one. "that color" is the colour the source chose as it entered: stamped `@chosenColor`
    // here and resolved per permanent (resolveSourceRestriction); an unresolved one pays for nothing. Only the whole clause.
    if (/^to cast monocolored spells of that color$/.test(clause.trim())) { castMonocolored = "@chosenColor"; continue; }
    // COMMANDER (CR 903.3) — a designation, not a type-line word, so it gets its own token rather than
    // riding SPEND_CAST_TYPE_WORDS where it could never match a printed line (the vacuous-filter failure).
    if (/\bto cast your commander\b/.test(clause)) { types.add("@commander"); continue; }
    // BARE "to cast spells" (Klauth — QUARTET Phase 4, 2026-08-15): ANY spell qualifies, but activated
    // abilities do NOT — a real restriction the type-word vocabulary can't express (no word matches every
    // type line), so it gets its own token like @commander. spendRestrictionAllows honors it for any
    // castCard; the no-context default-deny still refuses ability payments (they thread no castCard).
    if (/^to cast spells$/.test(clause.trim())) { types.add("@any-spell"); continue; }
    // QUARTET Phase 4 step 3 (2026-09-06 — Avengers Tower "… to cast a Hero spell or to activate an ability of a Hero source",
    // Base Camp, Villainous Hideout, Jasmine Dragon Tea Shop, Brotherhood Headquarters): the ABILITY tail — the mana may also
    // pay an ability of a source of the named type(s). Recorded in abilityOf beside the cast types; spendRestrictionAllows
    // matches the ACTIVATING source's type line at payment (the sites pass activatingTypeLine). Closed vocabulary (the
    // curated words + CR creature types); an unlisted word refuses the whole clause (a safe FN).
    for (const am of clause.matchAll(/\b(?:to )?activate an ability of an? ([a-z, ]+?)(?: source)?(?=$|[,.]|\s+(?:or|and)\b)/g)) {
      for (const w of am[1].split(/\s*(?:,|\bor\b|\band\b)\s*/)) {
        const word = w.trim().replace(/^(?:a|an|the)\s+/, "").trim();
        if (!word) continue;
        if (!(SPEND_CAST_TYPE_WORDS.has(word) || CR_CREATURE_TYPES.has(word))) return null;
        abilityOf.push(word);
      }
    }
    // Take only the "cast …" spans; anything after "or activate"/"or to activate"/"or pay" is a permission
    // this model deliberately declines to use.
    // ⛔ THE LOOKAHEAD IS THE ANTI-LOSSY GUARD, and omitting it was a live over-delivery caught by an
    // existing pin. Helga, Skittish Seer prints "Spend this mana only to cast creature spells WITH MANA
    // VALUE 4 OR GREATER or creature spells with {X} in their mana costs" — a prefix match read that as
    // "creature spells", modeling a restriction STRICTLY LOOSER than printed, which is the forbidden FP
    // direction and precisely the lossy-clause-tail class probe-lossy-clause-tails.mjs exists to find.
    // So "spell(s)" must be followed by the END of the permission or another permission — never by a
    // qualifier ("with …", "that …", "of the chosen type", "with no abilities"). A qualified restriction
    // yields no types and the card stays refused, exactly as before.
    // the plural ability tail with a colour word (Eldrazi Temple "activate abilities of colorless Eldrazi") — the singular
    // "an ability of a <Subtype> source" tail is handled below; "abilities of creature sources" above.
    // The tail is a LIST ("abilities of artifact sources or creature sources"): every item is honoured or the whole clause is
    // refused — never a silent subset. A continuation that is another permission ("or cast …", "or pay …") ends the list.
    for (const pa of clause.matchAll(/\bactivate abilities of ((?:colorless )?[a-z]+(?: sources?)?(?:(?:,\s*|\s+or\s+|\s+and\s+)(?!(?:cast|pay|to)\b)(?:colorless )?[a-z]+(?: sources?)?)*)/g)) {
      for (const item of pa[1].split(/\s*(?:,|\bor\b|\band\b)\s*/)) {
        const colorless = /^colorless\s+/.test(item);
        const word = item.replace(/^colorless\s+/, "").replace(/\s+sources?$/, "").replace(/s$/, "");
        if (!word) continue;
        if (!(SPEND_CAST_TYPE_WORDS.has(word) || CR_CREATURE_TYPES.has(word))) return null;
        if (!abilityOf.includes(word)) abilityOf.push(word); // the plain "abilities of creature sources" arm above may already hold it
        if (colorless) abilityColorless = true;
      }
    }
    for (const cm of clause.matchAll(/\bcast ([a-z, /]*?)\s*spells?(?=$|[,.]|\s+(?:or|and)\b)/g)) {
      let list = cm[1];
      if (/^\s*colorless\b/.test(list)) {
        castColorless = true;
        list = list.replace(/^\s*colorless\s*/, "");
        if (!list.trim()) { types.add("@any-spell"); continue; } // bare "colorless spells" — any COLOURLESS spell (the colour check runs first)
      }
      for (const w of list.split(/\s*(?:,|\/|\bor\b|\band\b)\s*/)) {
        const phrase = w.trim().replace(/^(?:a|an|the)\s+/, "").trim();
        if (!phrase) continue;
        // CONJUNCTIVE PHRASE (QUARTET Phase 4, 2026-08-15 — Rivaz "Dragon CREATURE spells"): a multi-word
        // type phrase means the spell must match EVERY word ("dragon creature" ≠ any creature). Each word
        // must be in the vocabulary (one stranger → refuse the whole card, unchanged); the WHOLE phrase is
        // kept as one entry, and spendRestrictionAllows tests all of an entry's words conjunctively —
        // AND within an entry, OR across entries. A single-word phrase is byte-identical to before.
        const words = phrase.split(/\s+/);
        // QUARTET Phase 4 step 3 (2026-09-06 — Turtle Lair "Spend this mana only to cast a Ninja or Turtle spell", Sliver Hive):
        // beside the curated word list, ANY CR creature type (the closed vocabulary) is a real type-line word — the same
        // \b<word>\b test spendRestrictionAllows applies at payment, so the parse and the planner cannot disagree.
        if (!words.every((word) => SPEND_CAST_TYPE_WORDS.has(word) || CR_CREATURE_TYPES.has(word))) return null;
        types.add(words.join(" "));
      }
    }
  }
  if (!types.size && !abilityOf.length && !castColorless && !castKeywords.length && !castMonocolored) return null;
  // Monocolored-of-a-colour is the WHOLE permission (Throne of Eldraine): beside another permission the two would be read as one
  // list (either pays), which no printed card says — refused (a safe FN).
  if (castMonocolored && (types.size || abilityOf.length || castColorless || castKeywords.length)) return null;
  return { castTypes: [...types], ...(castMonocolored ? { castMonocolored } : {}), ...(castKeywords.length ? { castKeywords } : {}), ...(abilityOf.length ? { abilityOf } : {}), ...(chosenType ? { chosenType: true } : {}), ...(uncounterableIfSpent ? { uncounterableIfSpent: true } : {}),
    ...(castColorless ? { castColorless: true } : {}), ...(abilityColorless ? { abilityColorless: true } : {}) };
}

/**
 * CHOSEN-TYPE RESOLUTION (CAP-CAVERN): a `chosenType` restriction is meaningless until the permanent has chosen —
 * resolve it against the live permanent into the conjunctive "<chosen> <word>" entries spendRestrictionAllows
 * already evaluates (every word on the type line). A permanent that never chose gets an EMPTY castTypes list
 * (`unresolvedChosenType`), which spendRestrictionAllows can never satisfy — the source is offered to nothing,
 * never laundered into unrestricted mana (null would mean UNRESTRICTED here — the forbidden direction).
 */
export function resolveSourceRestriction(restriction, perm) {
  // THE CHOSEN COLOUR (Throne of Eldraine, 2026-10-17): "@chosenColor" becomes the permanent's stamped colour; none stamped → a
  // colour no spell has ("@unresolved"), so the record pays for nothing (manaSources drops such a source before this anyway).
  if (restriction?.castMonocolored === "@chosenColor") {
    const c = MANA_COLORS.includes(perm?.chosenColor) ? perm.chosenColor : "@unresolved";
    return { ...restriction, castMonocolored: c };
  }
  if (!restriction || !restriction.chosenType) return restriction;
  const chosen = String(perm?.chosenType || "").trim().toLowerCase();
  if (!chosen) return { ...restriction, castTypes: [], ...(restriction.abilityOf ? { abilityOf: [] } : {}), unresolvedChosenType: true };
  return { ...restriction, castTypes: (restriction.castTypes || []).map((w) => `${chosen} ${w}`),
    // the chosen-type ABILITY tail (Secluded Courtyard, 2026-09-06): the placeholder becomes the chosen word itself
    ...(restriction.abilityOf ? { abilityOf: restriction.abilityOf.map((w) => (w === "@chosenType" ? chosen : w)) } : {}) };
}

/** Does `card` satisfy a spend restriction? Used by the payment planner via its spend context. */
export function spendRestrictionAllows(restriction, castCard, opts = {}) {
  if (!restriction) return true;                       // unrestricted source
  // ACTIVATION-ONLY (SG-18): a cast never qualifies; an activation qualifies iff the site threaded the activating
  // permanent's creature-ness (true). Missing context → refuse (the default-deny posture).
  // QUARTET Phase 4 step 3 (2026-09-06): an ACTIVATION (no castCard) is paid only by an abilityOf record — "creature" reads the
  // layer-aware flag the sites already pass; a SUBTYPE (Hero, Ally, Villain, Assassin …) reads the activating source's type
  // line (activatingTypeLine). A record with BOTH cast types and ability types (Avengers Tower) pays either purpose.
  if (!castCard) {
    // COLOUR WORDS (Eldrazi Temple): the activating source must be colourless — read off activatingColors (layer-aware, passed
    // by every activation site); no colour context ⇒ REFUSE.
    if (restriction.abilityColorless && (!Array.isArray(opts.activatingColors) || opts.activatingColors.length)) return false;
    for (const t of restriction.abilityOf || []) {
      if (t === "@any") return true;                   // the negative cast-only form (Powerstone): every ability spend is legal
      if (t === "creature") { if (opts.activatingIsCreature === true) return true; continue; }
      // ⚠️ P·39 — a source made every creature type by an effect (Mirror Entity's activation, an animated Mutavault) is read by
      // its printed type line here: the activation sites pass only that string. A documented UNDER-read, the safe direction —
      // Hero-only mana is refused for it, never spent where it may not be.
      if (opts.activatingTypeLine && new RegExp(`\\b${t}\\b`, "i").test(String(opts.activatingTypeLine))) return true;
    }
    return false;                                      // no context / no matching source ⇒ REFUSE (the default-deny posture)
  }
  if (!castCard) return false;                         // ⛔ NO CONTEXT ⇒ REFUSE (see planPayment)
  // MONOCOLORED SPELLS OF A COLOUR (Throne of Eldraine, 2026-10-17): the cast spell has exactly one colour (CR 105.2a), that one.
  // Read off the face being cast (characteristicColors — a hybrid pip counts each colour, so a {W/U} spell is multicolored, CR 202.2d;
  // a double-faced spell is its front face's colour, CR 712.8c, so Invasion of Vryn is a monocolored blue spell).
  if (restriction.castMonocolored != null) {
    const cs = characteristicColors(castCard);
    return cs.length === 1 && cs[0] === restriction.castMonocolored;
  }
  // COLOUR WORDS (Shrine of the Forsaken Gods / Eldrazi Temple): a coloured spell never qualifies for a colourless-only record —
  // checked BEFORE the type walk so the bare "@any-spell" of "colorless spells" cannot short-circuit past it. The face being cast's
  // colours (characteristicColors): Delver of Secrets is a blue spell, though its combined card carries an empty top-level array.
  if (restriction.castColorless && characteristicColors(castCard).length) return false;
  // The SPELL's type line — the face being cast (CR 712.8c; the cast lane hands over a projected split, Adventure or modal face, and
  // any other double-faced card is cast front face up): Cavern of Souls naming Dinosaur does not pay for Invasion of Ikoria, whose
  // back face is the Dinosaur, nor Mishra's Workshop for Invasion of Vryn, whose back face is the artifact.
  const typeLine = characteristicTypeLine(castCard).toLowerCase();
  for (const t of restriction.castTypes || []) {
    if (t === "@commander") { if (opts.isCommander) return true; continue; }
    if (t === "@any-spell") return true; // bare "cast spells" — any castCard qualifies (context presence IS the spell-ness)
    // A multi-word entry is CONJUNCTIVE ("dragon creature" — every word must sit on the type line;
    // parseSpendRestriction's phrase note). A single-word entry is byte-identical to before.
    // P·39b — a cast spell that is every creature type (castEvery: Changeling, or its caster's Maskwood Nexus — the spend context
    // carries it) meets every CREATURE-type word (Cavern of Souls' chosen type, "only to cast a Dinosaur spell"); a card type or an
    // Aura / Equipment / Vehicle word is still read off the type line (CR 205.3d).
    if (t.split(/\s+/).every((word) => new RegExp(`\\b${word}\\b`).test(typeLine) || (opts.castEvery === true && CR_CREATURE_TYPES.has(word)))) return true;
  }
  // A KEYWORD PERMISSION ("a spell that has freerunning" — Brotherhood Headquarters, 2026-10-17): the cast card has the keyword — on its
  // keyword list, or a line of its own text that starts with it (the keyword with its cost, "Freerunning {1}{B}").
  for (const kw of restriction.castKeywords || []) {
    if ((castCard.keywords || []).some((k) => String(k).toLowerCase() === kw)) return true;
    if (new RegExp(`^${kw}\\b`, "im").test(String(castCard.oracle || castCard.oracle_text || ""))) return true;
  }
  return false;
}

function manaProductionImpl(card) {
  if (!card) return null;

  // ⛔ SPEND-RESTRICTED MANA (CR 106.6) — "{T}: Add {U}. Spend this mana only to cast an artifact spell."
  // The payment planner has NO restricted-mana concept, so modelling this source at all hands the engine
  // GENERAL-PURPOSE mana from a restricted one: strictly better than the printed card, and the forbidden
  // FP direction. Route the whole card out (null → Arbiter, a clean FN) until restrictions are real.
  //
  // ⚠️ THIS GUARD ALREADY EXISTED — for QUOTED/GRANTED abilities only (stripNonSelfQuotedGrants, "Battery
  // Bearer"), with that same reasoning written out. A card's OWN printed mana line had no such check, so
  // 59 non-land cards were credited native-mana with their restriction silently dropped (Troyan #5599,
  // Fabrication Foundry #9980, Rootcoil Creeper #9861). Found by probe-lossy-clause-tails.mjs, which
  // injects an unmodelable tail into each printed line and reports the lines whose tail changes nothing.
  //
  // LANDS are unaffected in the metric (they are credited playable by BEING lands) but are routed here too,
  // so the runtime never mints unrestricted mana from a restricted land either.
  // ⚠️ ALSO PER-LINE, same over-reach as the condition gate below. The restriction is real and the refusal
  // stays — but killing the WHOLE CARD took UNRESTRICTED abilities down with it. Measured: the Village cycle
  // (Oakhollow / Lilypad / Rockface / Mudflat / Lupinflower), Tournament Grounds and Castle Garenbrig each
  // print a plain unrestricted mana line ("{T}: Add {C}." — Castle Garenbrig "{T}: Add {G}.") beside a
  // restricted one, and produced NOTHING AT ALL.
  //
  // Keeping only the UNRESTRICTED line is exactly what the card can do with no strings attached: the
  // restricted ability stays unmodeled (still refused, so the engine never gets general-purpose mana out of
  // a restricted source — the FP this guard exists for), and the card gains only mana it genuinely makes
  // freely. A card whose ONLY mana line is restricted still parses to nothing and returns null, unchanged.
  const unrestrictedLines = oracleOf(card)
    .split(/\n+/)
    .filter((line) => !/\b(?:spend this mana only|can't be spent to)\b/i.test(line));
  if (!/\badd\b/i.test(unrestrictedLines.join("\n")) && /\b(?:spend this mana only|can't be spent to)\b/i.test(oracleOf(card))) return null;

  // ⛔ CONDITION-GATED MANA (CR 602.5) — "Metalcraft — {T}: Add one mana of any color. Activate only if you
  // control three or more artifacts." (Mox Opal #241, Fanatic of Rhonas #418). manaSources has no concept of
  // an activation CONDITION, so the source was offered unconditionally: verified on a board, a lone Mox Opal
  // with metalcraft UNMET produced any colour. Turn-one ritual out of a card that should be dead.
  //
  // Same family as the spend restriction above and the same verdict — an ignored RESTRICTION makes the engine
  // play a card strictly better than the printed one, which is the forbidden direction. Route the card out
  // (null → Arbiter, a clean FN) until conditions are real.
  //
  // NARROW ON PURPOSE: only the "activate only if <condition>" board gate. "Activate only as a sorcery" is a
  // TIMING rule handled elsewhere and is not swept up here, and neither is any additive rider — an ignored
  // tail that ADDS an effect merely under-delivers (a safe FN), which is why this guard targets conditions
  // rather than every unread word.
  // ⚠️ PER-LINE, NOT PER-CARD. This guard used to match "activate only if …" ANYWHERE in the oracle and null
  // the WHOLE card. An ability is per-line (CR 113.3), so a gated SECOND ability was killing an
  // UNCONDITIONAL first one — measured: 30 corpus LANDS produced NO MANA AT ALL, including the entire Verge
  // cycle (Bleachbone Verge prints a plain "{T}: Add {B}." and a separate conditional "{T}: Add {W}.
  // Activate only if you control a Plains or a Swamp") and Madblind Mountain, whose gated ability is a
  // SHUFFLE — not a mana ability at all. A land that taps for nothing is a soft-lock-grade playability bug,
  // and lands are tier-blind so no coverage number ever showed it.
  //
  // Dropping the gated LINES and parsing what remains keeps the refusal exactly where it belongs: a card
  // whose ONLY mana line is the gated one has nothing left to parse and still returns null (Mox Opal,
  // Fanatic of Rhonas — pinned). Nothing that used to be modelled changes, because an unconditional line was
  // always safe to read; this only stops the guard from taking innocent lines down with it.
  // Starts from `unrestrictedLines` (spend-restricted lines already removed above), so the two per-line
  // refusals compose: what survives both is text the card can do freely and unconditionally.
  const gatedOracle = unrestrictedLines
    .filter((line) => {
      const g = line.match(/\bactivate (?:this ability )?only if ([^.]+)\./i);
      return !(g && !conditionIsExpressible(g[1]));
    })
    .join("\n");
  if (!/\badd\b/i.test(gatedOracle)) {
    // Every Add clause lived on a gated line → the card's mana is genuinely condition-gated → refuse, as before.
    if (/\badd\b/i.test(oracleOf(card))) return null;
  }

  const name = String(card.name || "");
  const baseName = name.replace(/^Snow-Covered\s+/i, "").trim();
  if (BASIC_LAND_MANA[baseName]) {
    return { colors: [...BASIC_LAND_MANA[baseName]], amount: 1 };
  }
  if (KNOWN_ROCKS[name]) {
    return { colors: [...KNOWN_ROCKS[name].colors], amount: KNOWN_ROCKS[name].amount };
  }

  // Type-aware reminder handling (see the note above): lands keep the raw oracle (their reminder-text
  // ability is real), non-lands strip it (a reminder "Add … mana" describes a token/keyword, not their
  // own ability). The same `oracleForAdd` feeds the sacrifice-for-mana check so a Treasure (no reminder
  // parens) still flags `sacrifices`, while a token-MAKER's reminder no longer mints a phantom source.
  const isLandCard = /\bLand\b/.test(typeLineOf(card));
  // Non-lands also strip a CREATED TOKEN's quoted ability (stripCreatedTokenAbilities) — a card's own
  // mana production must not be fabricated from the ability of a token it makes (Blisterpod is not a
  // sac-for-{C} source; its Eldrazi Spawn is). The minted TOKEN's own oracle (unquoted "Sacrifice this
  // token: Add {C}") has no create-token context, so it's untouched and still reads as a real source.
  // `gatedOracle` (not the raw oracle) is the base: the condition-gate filter above already removed any LINE
  // whose ability is gated on an inexpressible board condition, so what remains is only what the card can do
  // unconditionally. Without threading it here the filter would be computed and never read — the
  // captured-but-unread trap — and the gated line's Add clause could still be picked up.
  let oracleForAdd = isLandCard
    ? gatedOracle
    : stripCreatedTokenAbilities(stripReminder(gatedOracle));
  // AURA self-source guard (subsystem 1 / CREED): an Aura's quoted granted ability ("Enchanted creature
  // has \"{T}: Add one mana of any color.\"" — Multani's Harmony; "Enchanted land has \"{T}: Add …\"" —
  // Settlement) is conferred to the HOST (read at runtime via layers.grantedManaSpecsFor), NOT the Aura's
  // OWN production. stripReminder only removes (parens), so the double-quoted grant survives and parseAddClause
  // would mint the AURA itself as a phantom mana source — double-counting the granted spec. Strip the quoted
  // grant for Aura-type cards so the Aura is never its own source. AURA-SCOPED: a CREATURE that self-includes
  // via its own quoted text (Gemhide/Manaweft Sliver "All Slivers have \"{T}: Add …\"") legitimately
  // self-produces and is left intact (Gemhide is a Creature, not an Aura — test-pinned).
  // GROUP/AURA GRANT GUARD (generalizes the old Aura-only strip): a quoted granted ability belongs to
  // the RECIPIENTS (delivered at runtime via layers.grantedManaSpecsFor → manaSources), never to the
  // granter's own production — unless the granter self-includes in the grant scope (Gemhide). Lands stay
  // exempt with the rest of the raw-oracle land path above.
  if (!isLandCard) oracleForAdd = stripNonSelfQuotedGrants(oracleForAdd, typeLineOf(card));
  // A LAND'S TRIGGERED "ADD" IS NO TAP (2026-10-17 — the land lines). A land keeps its raw oracle, and the parse below reads the first
  // "Add" anywhere, so Crumbling Vestige's "When this land enters, add one mana of any color." was its standing tap — any colour
  // every turn, where its only mana ability is "{T}: Add {C}." (Branch of Vitu-Ghazi's turned-face-up mana likewise). A triggered
  // ability is no activated ability (CR 603.1, 605.1a); its one-shot mana is the trigger's to resolve. The nonland twin of this rule
  // is the activated-line gate below.
  if (isLandCard) oracleForAdd = oracleForAdd.split("\n").filter((l) => !(/^\s*(?:When|Whenever|At)\b/i.test(l) && /\badd\b/i.test(l))).join("\n");
  // UNTAP RESTRICTION — the guard's premise CHANGED, so the guard did (2026-07-27).
  //
  // It used to read: "'doesn't untap during your untap step' is not modeled (untapAll frees everything each
  // untap step), so a standing source carrying it produces PHANTOM repeatable mana — Mana Vault read as a
  // free 3-mana rock every turn." That was true and the refusal was right. It is no longer true: the
  // restriction IS enforced, by gameState's untap step via cardSelfPreventsUntap — verified on a driven
  // board, where a tapped Sol Ring untaps on the controller's next untap step and a tapped Basalt Monolith
  // does not.
  //
  // Leaving the blanket refusal in place had stopped being safe and started being a BUG: Mana Vault, Basalt
  // Monolith and Grim Monolith were offered NO mana ability at all — dead permanents, not merely
  // under-counted ones. They tap for mana once, which is exactly what the printed card does.
  //
  // The "your NEXT untap step" wording still routes out, deliberately. That form is a ONE-SHOT rider inside
  // an activated ability (the Cloudcrest Lake / Vec Townships slow-dual family), NOT a continuous lock —
  // gameState excludes it from RE_SELF_NO_UNTAP_THIS for that reason, so nothing enforces it here either.
  // Sharing cardSelfPreventsUntap is what keeps this guard and the runtime from drifting apart again.
  if (!isLandCard && /doesn't untap during your (?:next )?untap step/i.test(oracleForAdd) && !cardSelfPreventsUntap(card)) return null;
  // LEVEL-BANDED CARD (P0-residual FP wave): a leveler's abilities are scoped to level bands the
  // flat oracle parse cannot see — Joraga Treespeaker's "{T}: Add {G}{G}" belongs to LEVEL 1-4,
  // but the parser credited it at level 0. No static credit is possible → route out (FN-safe;
  // mirrors staticAbilityParser.isLevelGated).
  if (!isLandCard && (/\blevel up\b/i.test(oracleForAdd) || /\bLEVEL \d/.test(oracleForAdd))) return null;
  // A NON-LAND repeatable mana source must have an ACTIVATED mana ability ("<cost>: Add …"). A triggered/ETB/
  // landfall/upkeep/death or spell-effect "Add …" (no colon) is a ONE-SHOT and must NOT mint a standing source
  // (the Hidden Herbalists phantom-mana FP — manaSources tapped it every turn for free). GATE on the existence
  // of an activated line, but still parse the WHOLE oracle so parseAddClause keeps its multi-clause selection
  // (Arbor Adherent's variable line, Prismatic Lens' any-color line, etc. — unchanged). Lands keep raw-oracle
  // parsing (intrinsic/reminder-printed mana + the colorless fallback).
  // ENERGY-GATED MANA (CR 122.1e): a "<cost>, Pay {E}: Add …" line is NOT free repeatable mana — the sim can't
  // yet spend energy, so crediting it would mint PHANTOM mana every turn (Servant of the Conduit / Solar
  // Transformer read as free any-color dorks; Aether Hub's any-color line over-counted vs its real free {C}).
  // Strip the gated ability (lands included) so parseAddClause sees only the ENERGY-FREE mana: Aether Hub keeps
  // its {C}, and a source whose ONLY mana is energy-gated produces nothing → null → non-native, correctly.
  oracleForAdd = oracleForAdd.replace(/[^.\n]*\bpay (?:\{e\})+[^.\n:]*:\s*add\b[^.\n]*\.?/gi, " ");
  // A MANA LINE NO RECORD CAN HONOUR (2026-10-17 — manaLineRefused: a loyalty ability, an ability quoted inside a sentence, a
  // target, a condition or count ahead of the add, a cost item no record pays) is dropped here, lands included, before any
  // reader below sees it. A card whose only mana line goes makes nothing (a land too: its colourless fallback needs an "add"
  // left to read).
  oracleForAdd = oracleForAdd.split("\n").filter((line) => !manaLineRefused(line)).join("\n");
  // ===== COUNTER-REMOVAL MANA (STAGE ④-4, 2026-09-03 — CR 605.1a / 122.1) ===== the tap-only, mana-cost-free
  // forms: "{T}, Remove any number of <K> counters from this <noun>: Add {M} for each <K> counter removed this
  // way." (the storage lands — Fountain of Cho, Mage-Ring Network, Subterranean Hangar …) and "…: Add {M}, then
  // add an additional {M} for each <K> counter removed this way." (the Mana Batteries). The AMOUNT is resolved
  // LIVE by manaSources from the permanent's counters (greedy-max — "any number" makes removing them all legal;
  // surplus floats) and the commit removes exactly the counters the plan priced. Only fires when this is the
  // card's ONLY tap-mana line (the Batteries); a storage land's plain "{T}: Add {C}." stays its main product
  // and the removal line rides as an EXTRA line (extraManaLineProducts parses it alone, where it IS the only
  // line). The {1}-costed forms (the Saltcrusted Steppe cycle, Petalmane Baku) stay refused: no mana-costed source.
  {
    const crm = oracleForAdd.match(/^\{T\}, Remove any number of (storage|charge|oil|mining|ki) counters from this (?:land|artifact|creature): Add \{([WUBRGC])\}(, then add an additional \{([WUBRGC])\})? for each \1 counters? removed this way\.?$/im);
    const otherTapLine = crm && /^\{T\}(?:, [^:\n]*)?: Add\b/im.test(oracleForAdd.replace(crm[0], ""));
    if (crm && !otherTapLine && (!crm[3] || crm[4] === crm[2])) {
      return { colors: [crm[2]], amount: crm[3] ? 1 : 0, requiresTap: true, removesCounters: { type: crm[1], mode: crm[3] ? "plusOne" : "perCounter" } };
    }
  }
  // ===== DOESN'T-UNTAP RIDER (STAGE ④-5, 2026-09-03 — CR 502.2) ===== "{T}: Add {A} or {B}. This land doesn't
  // untap during your next untap step." (the Tempest duals — Mogg Hollows, Rootwater Depths, Caldera Lake …;
  // 10 corpus lands, every one a SECOND line beside a plain "{T}: Add {C}."). Parsed here as a single line
  // (the extra-line path hands it over alone); the rider rides the product as `doesNotUntapNext`, the plan
  // carries it, and the commit stamps the permanent after the tap so the next untap step skips it.
  {
    const dnu = oracleForAdd.trim().match(/^\{T\}: Add \{([WUBRGC])\} or \{([WUBRGC])\}\. This land doesn't untap during your next untap step\.$/i);
    if (dnu) return { colors: [dnu[1].toUpperCase(), dnu[2].toUpperCase()], amount: 1, requiresTap: true, doesNotUntapNext: true };
  }
  // ===== REMOVE-A-COUNTER MANA, NO {T} (the 09-06 plan's stage ③ · 37, 2026-09-30 — CR 605.1a / 602.2b) ===== "Remove a
  // <K> counter from this <artifact|creature|enchantment>: Add {C}." / "…: Add one mana of any color." (Pentad Prism, Gemstone
  // Array, Crystalline Crawler, Morselhoarder, Workhorse, Druids' Repository). No tap: each activation pays ONE counter for ONE
  // mana (its colour chosen per activation), so the permanent is as many one-mana sources as it has counters — manaSources
  // expands it (`repeatable` records the planner lets coexist, `noTap` so the commit never taps), and the commit removes one
  // counter per record. Usable tapped and summoning-sick (no {T}), never multiplied (not "tapped for mana"). Whole-line anchored
  // and only as the card's ONLY Add line: a rider fails the anchor and parks (Mana Cache's "Any player may activate…", Cryptic
  // Trilobite's spend restriction) — except Mana Bloom's "Activate only once each turn." (2026-10-17 evening): manaProduction's
  // limit read stamps it, and manaSources offers at most the activations left this turn.
  {
    const rcm = oracleForAdd.match(/^Remove an? (charge|\+1\/\+1|-1\/-1) counter from this (?:artifact|creature|enchantment): Add (\{C\}|one mana of any color)\.?(?: Activate only once each turn\.)?$/im);
    const otherAddLine = rcm && /\bAdd\b/.test(oracleForAdd.replace(rcm[0], ""));
    if (rcm && !otherAddLine) {
      return { colors: rcm[2] === "{C}" ? ["C"] : ["W", "U", "B", "R", "G"], amount: 1, requiresTap: false, removesCounters: { type: rcm[1], mode: "each" } };
    }
  }
  // ===== A LAND'S TAP-OTHER LINE (2026-10-17 — TAP_OTHER_TAP_MANA_LINE_RE) ===== a land keeps its raw oracle and returns from the
  // activated-source branch below before the tap-other reader runs, so its "{T}, Tap an untapped creature you control: Add …" line
  // kept no payer. Beside another mana line (Holdout Settlement, Survivors' Encampment, Scene of the Crime — each beside a plain
  // "{T}: Add {C}.") it leaves the whole-card parse, which then reads the land's own plain line, and rides as its own extra record
  // (extraManaLineProducts parses it alone, where this block returns it); as the land's only mana line it is the product, its
  // payer carried as `extraTap` (manaSources resolves the payers off the live board). A payer noun parseTapOtherCost doesn't read
  // makes nothing — never the colourless fallback.
  if (isLandCard) {
    const lines = oracleForAdd.split("\n").map((l) => l.trim());
    const tapOtherLine = lines.find((l) => TAP_OTHER_TAP_MANA_LINE_RE.test(l));
    if (tapOtherLine) {
      const others = lines.filter((l) => l !== tapOtherLine);
      if (!others.some((l) => /\badd\b/i.test(l))) {
        const made = parseAddClause(tapOtherLine, card);
        const payer = parseTapOtherCost(tapOtherLine);
        return made && payer ? { ...made, requiresTap: true, extraTap: payer } : null;
      }
      oracleForAdd = others.join("\n");
    }
  }
  // ===== THE TWO COUNTER-COST LINES A RECORD PAYS (2026-10-17 — ONE_COUNTER_MANA_LINE_RE / PUT_COUNTER_MANA_LINE_RE) =====
  // manaLineRefused has already dropped every line whose counter cost isn't in its whole anchored form, so a line here is one of
  // the two. As the card's ONLY mana line it is the product: Gemstone Mine and the depletion lands ({T}, one counter removed per
  // activation, `sacrificeIfNoCounters` for their "If there are no <kind> counters on this land, sacrifice it"), Sphere of the
  // Suns, Spell Satchel and Channeler Initiate (the same {T} cost on an artifact or a creature, 2026-10-17 evening), Wall of Roots
  // (no {T}, a -0/-1 counter put on — its once-each-turn rider is stamped by manaProduction's limit read). Beside another mana
  // line (the Vivid lands, Tendo Ice Bridge, Mirrodin's Core) it leaves the whole-card parse — the plain line is the card's own
  // product, never merged with a coloured line whose counter it doesn't pay — and rides as its own extra record
  // (extraManaLineProducts parses it alone, where this block returns it).
  {
    const lines = oracleForAdd.split("\n").map((l) => l.trim());
    const counterLine = lines.find((l) => ONE_COUNTER_MANA_LINE_RE.test(l) || PUT_COUNTER_MANA_LINE_RE.test(l));
    if (counterLine) {
      const others = lines.filter((l) => l !== counterLine);
      if (!others.some((l) => /\badd\b/i.test(l))) {
        const lc = ONE_COUNTER_MANA_LINE_RE.exec(counterLine);
        if (lc) {
          // The depletion / mining sacrifice is a land's own sentence ("… on this land, sacrifice it"); the same {T} cost on an
          // artifact or a creature (Sphere of the Suns, Spell Satchel, Channeler Initiate) removes its counter and nothing more.
          if (lc[4] && lc[2].toLowerCase() !== "land") return null;
          const made = parseAddClause(lc[3], card);
          return made && { ...made, requiresTap: true, removesCounters: { type: lc[1].toLowerCase(), mode: "one" }, ...(lc[4] ? { sacrificeIfNoCounters: true } : {}) };
        }
        const pc = PUT_COUNTER_MANA_LINE_RE.exec(counterLine);
        const made = parseAddClause(pc[2], card);
        return made && { ...made, requiresTap: false, putsCounter: { type: pc[1] } };
      }
      oracleForAdd = others.join("\n");
    }
  }
  const fromOracle = parseAddClause(oracleForAdd, card);
  // A NON-LAND activated mana ability must also be PAYABLE by the sim as a standing source. An ability whose
  // only cost is a CONSUMABLE/non-repeatable resource the sim can't spend — a non-self sacrifice (Utopia Mycon
  // "Sacrifice a Saproling: Add {C}{C}"), pay-life, discard, remove-counter, exile, tap-OTHER, return-to-hand —
  // is NOT a free, tapless, repeatable source. Reading it minted PHANTOM mana the self-play sim "paid" every
  // turn for free (dirtying training data). Gate it like the TRIGGERED/ETB phantom case above. Lands are exempt
  // (raw-oracle parsing + their colorless fallback). RUNTIME-ONLY: classifyCard never calls manaProduction.
  // EXILE-FROM-GY COST (Molt Tender) — carved OUT of the phantom-mana refusal below because it is now
  // PAID for real: commitManaTap exiles a graveyard card on the tap, and manaSources gates the source on
  // a non-empty graveyard. The flag rides the production so both halves key off one read.
  const exilesGyCard = manaAbilityExilesGyCard(oracleForAdd);
  const sacrificesCreature = manaAbilitySacrificesCreature(oracleForAdd); // SG-3 — paid for real (see the helper)
  const sacrificesFood = manaAbilitySacrificesFood(oracleForAdd); // play-weighted #803 — Gilded Goose, paid for real (see the helper)
  const exilesSelfFromHand = manaAbilityExilesSelfFromHand(oracleForAdd); // SG-6 — a hand-zone source (see the helper)
  const isActivatedSource =
    isLandCard || (activatedManaText(oracleForAdd) != null && (!manaAbilityCostUnpayable(oracleForAdd) || exilesGyCard || sacrificesCreature || sacrificesFood || exilesSelfFromHand));
  // STAGE ④-5 (2026-09-03): the PAY-LIFE cost is read HERE, before the activated-source return, so a LAND's
  // "{T}, Pay 1 life: Add …" carries it (Horizon Canopy / Silent Clearing / the Horizon cycle / Mana Confluence
  // used to return from this block with their colours and NO cost — a free Mana Confluence, measured).
  const payLife = parsePayLifeCost(oracleForAdd);
  if (fromOracle && isActivatedSource) {
    const requiresTap = manaAbilityRequiresTap(oracleForAdd);
    const lifeRider = payLife ? { payLife: payLife.amount } : {};
    return manaAbilitySacrificesSelf(oracleForAdd)
      ? { ...fromOracle, sacrifices: true, requiresTap, ...lifeRider }
      : { ...fromOracle, requiresTap, ...(exilesGyCard ? { exilesGyCard: true } : {}), ...(sacrificesCreature ? { sacrificesCreature: true } : {}), ...(sacrificesFood ? { sacrificesFood: true } : {}), ...(exilesSelfFromHand ? { fromHand: true } : {}), ...lifeRider };
  }

  // ===== TAP-OTHER COST (CR 118.4 / 302.6) =====================================================
  // "{T}, Tap an untapped creature you control: Add one mana of any color." (Springleaf Drum, Loam Dryad,
  // Saruli Caretaker, Jaspera Sentinel, Dragonbroods' Relic) and the tapless "Tap two untapped Elves you
  // control: Add …" (Birchlore Rangers, Supportive Parents, Baylen).
  //
  // ⭐ THIS GRADUATES THE COMPOUND-COST GUARD ABOVE, WHICH NAMED ITS OWN CONDITION: it refuses tap-OTHER
  // costs because "the sim doesn't tap the other Elves". The sim taps them now — `extraTap` rides to
  // manaSources (which refuses to offer the source unless enough untapped payers exist) and on to
  // commitManaTap (which taps them), mirroring exactly how `sacrifices` carries the Treasure self-crack.
  //
  // ⛔ AND THE GATE IS THE PAYERS EXISTING, not the text parsing. A source offered without checking that N
  // untapped payers are on the board is the PHANTOM MANA the guard was written for — the sim would "pay" a
  // cost it never had. Availability is resolved against the live board in manaSources, never here.
  const tapOther = parseTapOtherCost(oracleForAdd);
  if (fromOracle && tapOther && !isLandCard) {
    return { ...fromOracle, requiresTap: manaAbilityRequiresTap(oracleForAdd), extraTap: tapOther };
  }

  // ===== PAY-LIFE COST =====================================================================
  // "{T}, Pay 2 life: Add one mana of any color." (Staff of Compleation, Myr Convert, Standing Stones,
  // Blightsoil Druid) and the tapless "Pay 1 life: Add …" (Lord of the Forsaken, Kozilek's Translator).
  // Same graduation as tap-OTHER directly above: the cost is real state the sim can spend, so it is gated on
  // affordability in manaSources and actually paid in commitManaTap.
  // (`payLife` was read above, before the activated-source return, so lands carry it too — STAGE ④-5.)
  if (fromOracle && payLife) {
    return { ...fromOracle, requiresTap: manaAbilityRequiresTap(oracleForAdd), payLife: payLife.amount };
  }

  // ⛔ NO MANA FROM AN UNREADABLE LINE (2026-10-17 — the land {C} fallback). This arm used to make {C} for any land whose oracle
  // says "add" anywhere but whose mana line the parser couldn't read ("a land we couldn't otherwise parse still taps for
  // something — assume colorless"). That {C} was wrong in play and credited in the metric: Crypt of Agadeem made {C} where it
  // prints {B}; Gem Bazaar, Cryptic Spires, Forsaken and Captivating Crossroads and City of Shadows made a {C} they can't make;
  // and coverage.landFullyCovered, which reads each line through this parser, counted every unreadable line as modelled —
  // Cabal Stronghold, Urza's Workshop, Cascading Cataracts and Baldur's Gate on a second line the engine never made, Nykthos on
  // its devotion line, and every chosen-colour land on its own mana line (now read in the card's context, landLineMana). The
  // fallback's first narrowing (54 lands with no mana ability at all made {C} — manaLandNoAbility.test.js) kept this half; this
  // removes it. A land now makes mana from exactly two places here:
  //   • ITS PLAIN LINE, when the whole-card parse failed on another line. parseAddClause gives up on the WHOLE text when one of
  //     its arms matches a line it then can't price — a count it can't read ("Add {C} for each storage counter removed this
  //     way" — Mage-Ring Network), an any-combination line behind a mana cost (Cascading Cataracts' "{5}, {T}: Add five mana in
  //     any combination of colors") — so a plain "{T}: Add …" printed beside it (CR 113.2c: a separate ability) is read alone.
  //   • ITS BASIC LAND TYPES (CR 305.6): a land with a basic land type has the intrinsic "{T}: Add [symbol]" even when its text
  //     doesn't say so — Fabled Path of Searo Point ("Legendary Land — Mountain") taps for {R}. The fallback made {C}, a colour
  //     no basic type makes; a nonbasic with basic types normally prints the ability as reminder text, which parses above.
  // Anything else makes NOTHING — an under-count, the safe direction (CREED). Urborg, Tomb of Yawgmoth and Yavimaya, Cradle of
  // Growth carry no basic type of their own: the type they grant reaches them through manaSources (grantedBasicTypeColors).
  if (isLandCard) {
    const plain = oracleForAdd.split("\n").map((l) => l.trim()).find((l) => PLAIN_MANA_LINE_RE.test(l));
    if (plain && plain !== oracleForAdd.trim()) return manaProductionImpl({ ...card, oracle: plain, oracle_text: plain });
    const tl = typeLineOf(card);
    const intrinsic = Object.entries(BASIC_LAND_MANA).filter(([sub]) => sub !== "Wastes" && new RegExp(`\\b${sub}\\b`).test(tl)).map(([, colors]) => colors[0]);
    if (intrinsic.length) return { colors: intrinsic, amount: 1, requiresTap: true };
    return null;
  }
  return null;
}

// ─── AURA-LAND-MANA-BOOST ───────────────────────────────────────────────────────

/**
 * The EXTRA mana an "Enchant land" mana-boost Aura (Wild Growth / Overgrowth / Fertile Ground)
 * adds when its host LAND taps for mana — as `[{ colors, amount }, …]`, one entry per attached
 * boost-Aura, or `[]`. This is a TRIGGERED MANA ABILITY (CR 605.1b): it resolves INLINE alongside
 * the land's own mana, so it rides on the land source rather than being its own tappable source —
 * the LAND taps; the Aura is NOT tapped or consumed and fires every time. Reads the host's
 * `attachments` (permanent ids) and parses each attached Aura's boost clause. Pure.
 *
 * Read by manaSources — the one read the auto-pay planner and the explicit tap (manualManaTaps) share — so the two
 * can't drift (the CREED two-sites invariant).
 */
export function landAuraManaBonus(state, landPerm) {
  const out = [];
  for (const attId of landPerm?.attachments || []) {
    const lk = findPermanent(state, attId);
    if (!lk) continue;
    const bonus = parseAuraLandManaBonus(lk.permanent?.card);
    if (!bonus) continue;
    // CHOSEN-COLOR (Utopia Sprawl): the boost adds one mana of the color CHOSEN AS THE AURA ENTERED
    // (CR 614.12b), stamped durably on the Aura permanent as `chosenColor` (resolvers.enterPermanent).
    // Resolve the marker here — the ONLY read-site that has the attached Aura permanent. If the stamp is
    // somehow missing (never happens: the native gate requires the choice line, and ETB always picks),
    // DROP the bonus rather than fabricate a color (safe FN, CREED).
    if (bonus.chosenColor) {
      const chosen = lk.permanent?.chosenColor;
      if (chosen) out.push({ colors: [chosen], amount: bonus.amount });
      continue;
    }
    out.push({ colors: [...bonus.colors], amount: bonus.amount });
  }
  return out;
}

/**
 * GLOBAL TAP-FOR-MANA AUGMENT (CR 605.1b) — the extra FIXED-color mana that the controller's "Whenever
 * you tap a <land|creature> for mana, add …" permanents (Groundchuck & Dirtbag, Leyline of Abundance,
 * Badgermole Cub) add when `sourcePerm` — a permanent `playerId` is tapping for mana — qualifies. Like the
 * land-enchant Aura boost, this is a TRIGGERED MANA ABILITY that resolves INLINE (the augment permanent is
 * NOT tapped; it fires on EVERY qualifying tap). Returns `[{ colors, amount }, …]`, one entry per augment
 * permanent whose subject ("land"/"creature") matches the tapped source's type, or `[]`.
 *
 * Controller-scoped ("Whenever YOU tap …" — CR 605): only `playerId`'s own augment permanents count. The
 * subject match reads the tapped source's TYPE LINE (a Land matches "land"; a Creature matches "creature"
 * — a creature-LAND like a manland matches both, exactly as the cards read). Pure.
 *
 * Read by manaSources — the one read the auto-pay planner and the explicit tap (manualManaTaps) share — so the two
 * can't drift (the CREED two-sites invariant).
 */
// The five basic land types (CR 305.6) a tap-augment may gate on. Anything else the parser emits as a
// subject ("land"/"creature"/"nonland-permanent") is handled by its own gate above.
const BASIC_LAND_SUBTYPES = new Set(["forest", "island", "swamp", "mountain", "plains"]);

export function globalTapManaAugment(state, playerId, sourcePerm) {
  const player = state?.players?.[playerId];
  if (!player || !sourcePerm) return [];
  const srcType = typeLineOf(sourcePerm.card);
  // The tapped permanent AS IT IS NOW (layer 4 — the type-line audit): a slumbering Arixmethes is a land, not a creature (no
  // Leyline of Abundance bonus, and no Kinnan bonus for a "nonland" tap); an animated land is a creature and still a land; its
  // face that is up (CR 712.8d — a Westvale Abbey tapped for {C} is no creature). A source the battlefield doesn't hold (a hand
  // card exiled for mana) keeps the printed read.
  const live = !!findPermanent(state, sourcePerm.id);
  const srcIsLand = live ? permanentHasCardType(state, sourcePerm.id, "Land") : /\bLand\b/.test(srcType);
  const srcIsCreature = live ? permanentHasCardType(state, sourcePerm.id, "Creature") : /\bCreature\b/.test(srcType);
  // NONLAND MANA DOUBLER (BLITZ MD-1, Kinnan): a "nonland permanent" is any tapped mana source whose type
  // line is NOT a Land — a mana rock (Sol Ring/Signet), a mana dork (a creature IS nonland), a Treasure. The
  // subject-gate is the whole point: a LAND tapped under a nonland-only doubler adds NOTHING (never fire on a
  // land tap). A creature-LAND (Dryad Arbor) is still a Land → excluded, exactly as "nonland permanent" reads.
  const srcIsNonland = !srcIsLand;
  const out = [];
  // MANA FLARE (BLITZ MF-1): an allPlayers augment ("Whenever a PLAYER taps a land for mana, THAT PLAYER
  // adds …") benefits the TAPPING player (`playerId`) no matter who controls the carrier — so the scan
  // covers EVERY battlefield, with the controller gate applied only to the controller-scoped ("Whenever
  // YOU tap …") forms. Symmetric by construction: the AI opponents' land taps ride a user-owned Mana Flare
  // exactly as the user's do (each seat's manaSources/actionsTapForMana calls in with its own playerId).
  for (const pid of Object.keys(state.players || {})) {
    for (const perm of state.players[pid]?.battlefield || []) {
      const aug = parseGlobalTapManaAugment(perm.card);
      if (!aug) continue;
      if (!aug.allPlayers && pid !== playerId) continue; // controller-scoped: only the tapper's own carriers
      // MONARCH GATE (Regal Behemoth, CR 725) — a condition:"monarch" augment adds the extra mana ONLY while
      // this player holds the crown. Not the monarch → no extra mana (no phantom production, CREED). The
      // become-monarch event / crown-steal keep state.monarchId current, so this reads the live crown.
      if (aug.condition === "monarch" && state.monarchId !== playerId) continue;
      if (aug.subject === "land" && !srcIsLand) continue;
      if (aug.subject === "creature" && !srcIsCreature) continue;
      if (aug.subject === "nonland-permanent" && !srcIsNonland) continue; // MD-1: never fire on a LAND tap
      // BASIC-LAND SUBTYPE (Crypt Ghast "Whenever you tap a SWAMP for mana", Nirkana Revenant, Nissa): the
      // tapped source must be a Land AND carry that subtype (CR 305.6). Read off the PRINTED type line, like
      // every sibling gate in this function — which means a Mountain that is also a Swamp only because of
      // Urborg does NOT trigger Crypt Ghast. That is an under-count, not a wrong fire: the safe direction,
      // and the honest note is cheaper than a layers import this leaf can't take without a cycle.
      if (BASIC_LAND_SUBTYPES.has(aug.subject) && !(srcIsLand && new RegExp(`\\b${aug.subject}\\b`, "i").test(srcType))) continue;
      // A BASIC LAND (Gauntlet of Power, Lavaleaper — 2026-10-17): a land with the Basic supertype (CR 205.4c), read off the
      // printed type line like the subtype gate above. "permanent" (Forsaken Monument) is any tapped source.
      if (aug.subject === "basic-land" && !(srcIsLand && /\bBasic\b/.test(srcType))) continue;
      // THE CONDITIONAL FORMS (2026-10-17): `whenProduces` — the colour the tap's own mana must include (Forsaken Monument's
      // {C}; Caged Sun's and Gauntlet of Power's chosen colour, read off THIS carrier's stored `chosenColor` — none stored, no
      // extra mana, never a guessed colour). The bonus carries it; the planner and the explicit tap add the extra mana only
      // when the tap made that colour (planPaymentCore's tapSource, manualManaTaps), and manaSources drops it from a source
      // that can't make that colour at all.
      if (aug.whenProduces) {
        const color = aug.whenProduces === "chosen" ? perm.chosenColor : aug.whenProduces;
        if (!color || !MANA_COLORS.includes(color)) continue;
        out.push({ colors: [color], whenProduces: color, amount: aug.amount });
        continue;
      }
      // sameAsProduced (MF-1): the bonus's TYPE is the type this tap produces — resolved by the consumer
      // (manaSources stamps the source's production colors; planPayment/actionsTapForMana credit the
      // PRIMARY chosen color), never an independent color pick (the off-type FP, CREED).
      out.push(aug.sameAsProduced
        ? { sameAsProduced: true, amount: aug.amount }
        : { colors: [...aug.colors], amount: aug.amount });
    }
  }
  // THE AUGMENTS A SPELL CREATED UNTIL END OF TURN (2026-10-17 — High Tide, Bubbling Muck, Molten Tide; effects/atoms/misc.js
  // applyTapManaAugmentEot): this turn's entries only (CR 514.2 — they end with the turn), "a player" for any tapper, "you" for the
  // caster; the tapped land must carry the basic land type, read off the printed type line like the permanent augments above.
  for (const e of state.tapManaAugmentsEot || []) {
    if (e.turn !== state.turn) continue;
    if (!e.allPlayers && e.controller !== playerId) continue;
    if (!(srcIsLand && BASIC_LAND_SUBTYPES.has(e.subject) && new RegExp(`\\b${e.subject}\\b`, "i").test(srcType))) continue;
    out.push({ colors: [...e.colors], amount: e.amount });
  }
  return out;
}

/**
 * AURA-MANA-GRANT SUPPLEMENT — an Aura that grants its HOST a tap-for-mana ability ("Enchanted land has
 * \"{T}: Add one mana of any color.\"" — Settlement / Sheltered Aerie) gives a host that ALREADY produces
 * mana (a LAND) a SECOND {T} ability. The host taps ONCE and picks the best, so its single-tap output
 * upgrades to the granted spec WHEN that spec strictly dominates the host's own production: the granted
 * colors are a superset of the own colors (any-color ⊇ one own color) AND the granted amount ≥ own amount.
 * Otherwise (neither dominates — a {C}{C} land granted "Add {G}") the own ability is kept (a safe
 * under-count, never an overclaim). Only grants MARKED `via:"attached"` supplement — a group grant
 * (Gemhide self-include, unmarked) must NOT upgrade the granter's own source (it would mis-model a double).
 * The host still produces ONE record (one tap), so this never fabricates an extra tap. Pure.
 *
 * Read by manaSources, which the explicit tap reads too (manualManaTaps) — the CREED two-sites invariant: the auto-pay
 * planner and the explicit tap must read the same effective production.
 */
export function applyAuraManaGrantSupplement(state, perm, prod) {
  if (!prod || prod.amountSpec) return prod;          // only fixed-amount own producers (lands/rocks) supplement
  const ownColors = prod.colors || [];
  for (const g of grantedManaSpecsFor(state, perm.id)) {
    // Two supplementing kinds, both a SINGLE-tap dominating upgrade of the host's own production (never an
    // extra tap):
    //   • via:"attached" — a genuinely-distinct AURA ability granting a LAND host a second {T} (Settlement).
    //   • upgrade:true — a GROUP static UPGRADING an artifact token's OWN mana ability (Goldspan Dragon —
    //     "Treasures you control have \"{T}, Sacrifice this artifact: Add two mana of any one color\"": the
    //     Treasure's printed "one" is replaced by "two"). The group-grant dedup in manaSources normally SKIPS
    //     a recipient that already produces its own mana (to avoid a double-tap); this marker is the explicit
    //     opt-in for the ONE case where the grant is a strict IN-PLACE upgrade of that same tap-for-mana
    //     ability (a single tap, never a phantom second source). The granter (a non-token permanent — Goldspan
    //     is a Dragon) can't self-include via a Treasure selector, so it never mis-upgrades its own source.
    if (g.via !== "attached" && !g.upgrade) continue;
    const gColors = g.colors || [];
    const superset = gColors.length >= ownColors.length && ownColors.every((c) => gColors.includes(c));
    if (superset && (g.amount ?? 0) >= (prod.amount ?? 0)) {
      return { ...prod, colors: [...gColors], amount: g.amount };
    }
  }
  return prod;
}

/**
 * A GRANTED MANA ABILITY (CR 113.10 — an effect that says a permanent "has" an ability adds it to that permanent): the
 * production a permanent with NO mana ability of its own offers through the first grant that affects it — Gemhide /
 * Manaweft Sliver, Cryptolith Rite, an Aura's or Equipment's "has \"{T}: Add …\"", Urza's Saga's chapter, Basal Sliver's
 * self-sacrifice, Ninja Pizza's Foods. The spec IS the quoted ability (staticAbilityParser.parseGrantedManaSpec), so every
 * flag it carries rides through: `sacrifices` cracks the RECIPIENT on use (commitManaTap sacrifices the source it taps), and a
 * cost with no {T} (`requiresTap: false`) is activatable while summoning sick (CR 302.6) and is not tapping it for mana (CR
 * 106.12), so Mana Reflection leaves it alone. Only the grant's ROUTING markers stay behind — `via` and `upgrade` decide
 * whether a grant may supplement a host's OWN production (applyAuraManaGrantSupplement) and say nothing about the ability.
 *
 * ⛔ The fallback this replaces rebuilt the record from `colors` and `amount` alone and forced `requiresTap: true`, at both
 * mana-source sites: a Metallic Sliver beside Basal Sliver made {B}{B} every turn and was never sacrificed (Mana Reflection
 * doubled it), and a Food under Ninja Pizza became a permanent any-colour rock. Cheaper than printed, the forbidden direction.
 *
 * Null when no grant applies. Only the FIRST grant is read: a permanent granted two mana abilities (a Sliver under Gemhide
 * and Basal) is offered one of them — an under-offer, never a second source on one permanent.
 */
export function grantedManaProduction(state, perm) {
  const [spec] = grantedManaSpecsFor(state, perm.id);
  if (!spec) return null;
  const { via: _via, upgrade: _upgrade, asChoice: _asChoice, ...ability } = spec;
  return { ...ability, requiresTap: spec.requiresTap !== false };
}

/**
 * A PLAIN ONE-MANA {T} LINE — one mana of a colour set (`colors` is a choice when the amount is one), paid by {T} and nothing
 * else. The only rider it may carry is a painful colour's damage (`painColors` and its amount / condition / city's-blessing
 * exemption), which tapRecordFor charges per colour, so more colours beside it change nothing about it. `insteadUpgrade` is
 * allowed because withInsteadUpgrade has already resolved it by the time a grant is read: an upgraded line has its upgrade's
 * amount and fails the one-mana test, an un-upgraded one makes its base. Any other field — a cost, a condition, a limit, a
 * restriction, a count, a fixed bundle, a board-read colour set, a chosen colour — applies to the WHOLE ability, so the line
 * is not plain and is never merged with another (an unknown field included: a new rider costs a land the merge, never
 * adds one).
 */
const PLAIN_ONE_MANA_TAP_FIELDS = new Set(["colors", "amount", "requiresTap", "painColors", "painAmount", "painCondition", "painUnlessCitysBlessing", "insteadUpgrade"]);
function isPlainOneManaTap(p) {
  if (!p || p.amount !== 1 || p.requiresTap === false || !Array.isArray(p.colors) || p.colors.length === 0) return false;
  return Object.keys(p).every((k) => PLAIN_ONE_MANA_TAP_FIELDS.has(k) || p[k] == null || p[k] === false);
}

/**
 * A GRANTED TAP AS A CHOICE ON THE LAND'S OWN TAP (play-weighted #85, 2026-10-17 — Chromatic Lantern, Joiner Adept: "Lands you
 * control have \"{T}: Add one mana of any color.\""). A land with its own plain one-mana {T} line now has two abilities (CR
 * 113.2c, 113.10), each costing the same {T}: a tapped land can activate neither again (CR 107.5), so the two are ONE record
 * whose colours are both abilities' — a Forest beside the Lantern taps once, for {G} or any other colour; a Wastes for {C} or
 * any colour. A colour the granted ability makes is made painlessly through it, so it leaves the land's painful set (Karplusan
 * Forest's {R} beside the Lantern deals no damage). Only grants marked `asChoice` (staticAbilityParser's land grant, emitted
 * only for a plain one-mana {T} spec) merge, and only into a plain one-mana {T} line; a land whose own line is anything else —
 * Ancient Tomb's {C}{C}, Gaea's Cradle's count, Mana Confluence's life, Command Tower's identity — keeps its own record alone
 * (merging there would make the own line's amount in any colour, or charge its cost on the granted colours): an under-offer.
 * A land with no mana ability of its own never reaches here — it takes the granted ability whole (grantedManaProduction).
 */
function withGrantedChoice(state, perm, prod) {
  if (!isPlainOneManaTap(prod)) return prod;
  let out = prod;
  for (const g of grantedManaSpecsFor(state, perm.id)) {
    // The grant is a plain one-mana {T} ability by construction: staticAbilityParser marks `asChoice` on no other spec.
    if (!g.asChoice) continue;
    out = { ...out, colors: [...new Set([...out.colors, ...g.colors])] };
    if (out.painColors) {
      const painful = out.painColors.filter((c) => !g.colors.includes(c));
      if (painful.length) out.painColors = painful;
      else {
        const { painColors: _pc, painAmount: _pa, painCondition: _pcond, painUnlessCitysBlessing: _pcb, ...painless } = out;
        out = painless;
      }
    }
  }
  return out;
}

/**
 * THE ONE READ of a permanent's production once the mana abilities granted to it are counted — made by manaSources, which both
 * the planner and the explicit tap (manualManaTaps) read, so the two cannot drift. A permanent with a
 * mana ability of its own keeps it (upgraded in place by a dominating Aura / Equipment / `upgrade` grant — never a second tap: the
 * DEDUP that keeps a self-including granter like Gemhide Sliver from tapping twice; and since 2026-10-17 a land's plain one-mana
 * {T} line takes an `asChoice` land grant's colours on the same tap — withGrantedChoice); one without takes its granted ability
 * whole.
 */
export function withGrantedMana(state, perm, prod) {
  return prod ? applyAuraManaGrantSupplement(state, perm, withGrantedChoice(state, perm, prod)) : grantedManaProduction(state, perm);
}

// ─── Battlefield → available sources ───────────────────────────────────────────

/**
 * Permanents that can produce mana right now — untapped ones, and tapped ones through a mana ability with no {T} in its cost
 * (CR 107.5; 2026-10-17) — as `{ permanentId, colors, amount }`. Lands + non-creature rocks have no
 * summoning-sickness gate; creature dorks are excluded while summoning sick
 * (unless they have Haste).
 *
 * AURA-LAND-MANA-BOOST: a land carrying a mana-boost Aura also reports `bonus: [{colors,amount},…]`
 * — the additional mana that appears INLINE when this source taps (it doesn't tap the Aura). The
 * planner (planPayment) credits it on tap; the bonus is NOT a separate tappable source.
 */
/**
 * ④-BE (CR 305.6) — the colours a LAND permanent taps for because of a basic land type it was GRANTED (Urborg's Swamp,
 * Yavimaya's Forest) rather than printed. Returns [] for a non-land, for a land with no granted basic type, and for every
 * board with no such static in play (the printed subtypes are subtracted, so a real Forest gains nothing here).
 */
function grantedBasicTypeColors(state, perm) {
  const printedLine = String(perm?.card?.type || perm?.card?.type_line || "");
  if (!/\bLand\b/i.test(printedLine)) return [];
  const eff = permanentTypes(state, perm.id);
  if (!eff.types.includes("Land")) return [];
  const out = [];
  for (const [Sub, colors] of Object.entries(BASIC_LAND_MANA)) {
    if (Sub === "Wastes") continue; // a granted "Wastes" is not a real subtype (CR 305.6 lists the five basic types)
    if (!eff.subtypes.some((s) => String(s).toLowerCase() === Sub.toLowerCase())) continue;
    // ⛔ NO "skip the PRINTED subtypes" filter here, deliberately: it was written, mutation-tested, and found to be
    // unobservable — every printed basic type in the corpus already reaches manaProduction (a basic by name, a typed
    // nonbasic through its own printed or reminder "{T}: Add …" line, e.g. Dryad Arbor and Murmuring Bosk), so the
    // Set-merge below de-duplicates it to the same colours and the complex-source guard blocks any inflation. Deleted
    // rather than kept as dead logic; if it ever returns it needs a test that can see it.
    out.push(...colors);
  }
  return [...new Set(out)];
}

/**
 * THE MANA TYPES THESE PLAYERS' LANDS COULD PRODUCE (CR 106.7) — the live union of each land's own production (manaProduction,
 * basics included via CR 305.6) and the basic types it was granted (Urborg / Yavimaya). A land whose own set is board-derived
 * (colorsAmongSpec) is skipped — Exotic Orchard facing Exotic Orchard is no recursion, an under-read — except a Command Tower's,
 * which is its CONTROLLER's commander's color identity, read off that seat and never off another land. `basicOnly` keeps lands
 * with the basic supertype (Star Compass); `colorsOnly` drops colourless (every "any color" form — only "any type" keeps {C}).
 */
function landsCouldProduce(state, playerIds, { basicOnly = false, colorsOnly = false, subtype = null } = {}) {
  const types = new Set();
  for (const pid of playerIds) {
    for (const p of state?.players?.[pid]?.battlefield || []) {
      const face = String(p.card?.type || p.card?.type_line || "").split(" // ")[0];
      if (!/\bLand\b/i.test(face)) continue;
      if (basicOnly && !/\bBasic\b/i.test(face)) continue;
      // `subtype` (Plaza of Harmony, 2026-10-17): only the lands of that land type, as they are now.
      if (subtype && !permanentSubtypes(state, p.id).some((st) => String(st).toLowerCase() === subtype.toLowerCase())) continue;
      // Its "instead" rider applied (2026-10-17 evening): a River of Tears after its controller's land drop could produce {B}, not {U}.
      const lp = withInsteadUpgrade(state, pid, p, manaProduction(p.card));
      if (lp && !lp.colorsAmongSpec) for (const c of lp.colors || []) types.add(c);
      else if (lp?.colorsAmongSpec?.kind === "commanderColorIdentity") for (const c of commanderColorIdentityOf(state, pid) || []) types.add(c);
      for (const c of grantedBasicTypeColors(state, p)) types.add(c);
    }
  }
  return [...types].filter((c) => !colorsOnly || c !== "C");
}

/**
 * THE COLOURS A BOARD-DERIVED MANA LINE CAN MAKE RIGHT NOW (`colorsAmongSpec`, parsed by parseAddClause), read as the ability
 * resolves (CR 605.3b — a mana ability resolves as it is activated). Empty means the line makes no mana and manaSources drops its
 * record. An unrecognised kind is EMPTY, never the parser's five-colour placeholder: a spec without a reader here makes nothing.
 *   · legendaryPermanentsYouControl (Plaza of Heroes) — each legendary permanent's current colours (CR 613.1e);
 *   · legendaryCreaturesAndPlaneswalkersYouControl (Mox Amber) — the same, only while it is a creature or a planeswalker;
 *   · landsYouControlCouldProduce / landsOpponentsControlCouldProduce — landsCouldProduce over the controller / its opponents;
 *   · commanderColorIdentity — the controller's commander's color identity; none (or unknown) is null → nothing (CR 903.4f);
 *   · permanentsYouControl (Meteor Crater) — each permanent the controller controls, its current colours (CR 105.2).
 */
function colorsAmongFor(state, playerId, spec) {
  const bf = state?.players?.[playerId]?.battlefield || [];
  const colorsOfEach = (perms) => [...new Set(perms.flatMap((p) => permanentColors(state, p.id)))].filter((c) => c !== "C");
  switch (spec?.kind) {
    case "legendaryPermanentsYouControl":
      return colorsOfEach(bf.filter((p) => /\bLegendary\b/i.test(String(p.card?.type || p.card?.type_line || "").split(" // ")[0])));
    case "legendaryCreaturesAndPlaneswalkersYouControl":
      return colorsOfEach(bf.filter((p) => permanentHasCardType(state, p.id, "Legendary")
        && (permanentHasCardType(state, p.id, "Creature") || permanentHasCardType(state, p.id, "Planeswalker"))));
    case "landsYouControlCouldProduce":
      return landsCouldProduce(state, [playerId], spec);
    case "landsOpponentsControlCouldProduce":
      return landsCouldProduce(state, opponentsOf(state, playerId), spec);
    case "commanderColorIdentity":
      return commanderColorIdentityOf(state, playerId) || [];
    case "permanentsYouControl": // Meteor Crater (2026-10-17 evening) — the current colours of every permanent its controller controls
      return colorsOfEach(bf);
    // The Grey Havens (2026-10-17, the land lines) — each legendary creature CARD in its controller's graveyard, its colours (CR
    // 202.2; a double-faced card's front face, characteristicColors). A card in a graveyard is no permanent: no layer reads it.
    case "legendaryCreatureCardsInYourGraveyard":
      return [...new Set((state?.players?.[playerId]?.graveyard || [])
        .filter((c) => { const t = String(c?.type || c?.type_line || "").split(" // ")[0]; return /\bLegendary\b/.test(t) && /\bCreature\b/.test(t); })
        .flatMap((c) => characteristicColors(c)))].filter((c) => COLOR_SET.has(c));
    default:
      return [];
  }
}

// LAYER-1 COPY (the play-weighted program, P·26 — Shifting Woodland; Thespian's Stage, Mizzium Transreliquat): a permanent that
// BECAME a copy (CR 707.2, 613.1a) has the copied card's mana abilities and never its printed ones — a Stage that became a Forest
// taps for {G} only, and one that became a Bear taps for nothing. layers.deriveCharacteristics owns which copy wins (CR 613.7b).
function manaCardOf(state, perm) {
  return deriveCharacteristics(state, perm.id)?.copiableValues || perm.card;
}

/**
 * THE TAP-OTHER PAYERS (`extraTap` — "Tap N untapped <filter> you control"): the ids of the untapped permanents the record will tap,
 * or null when there are too few (CR 118.3 — no source then, not a cheaper one). One reader for a main product and an extra
 * line (Relic of Legends' tap-a-legend line, 2026-10-17), so the two can't drift.
 */
function tapOtherPayers(state, player, perm, prod) {
  // ⛔ THE SOURCE EXCLUDES ITSELF ONLY WHEN IT IS ALREADY TAPPING ITSELF. Springleaf Drum pays {T} as
  // part of the same cost, so it cannot also be the tapped creature — and it is an Artifact anyway.
  // Birchlore Rangers has NO {T}: its cost is purely "Tap two untapped Elves you control", and the
  // Rangers IS an untapped Elf, so it is a legal payer for its own ability. Excluding it unconditionally
  // is wrong in the RESTRICTIVE direction — it would demand two OTHER Elves where the card asks for two
  // Elves total. (When it does pay, it ends up tapped, so the ability cannot be reused — which falls out
  // of the tapping rather than needing its own rule.)
  const payers = (player.battlefield || [])
    .filter((p) => (prod.requiresTap ? p.id !== perm.id : true) && !p.tapped && matchesTapOtherFilter(state, p, prod.extraTap.filter))
    .sort(tapCostPayerOrder);
  return payers.length < prod.extraTap.count ? null : payers.slice(0, prod.extraTap.count).map((p) => p.id);
}

/**
 * THE TAP-COST PAYER ORDER — a comparator over battlefield permanents, cheapest payer first. One policy for the tap-other mana payers
 * above and the activated "Tap N untapped <filter> you control" cost's frozen set (legalChoices, the filtered payers — Clock of Omens,
 * Cryptbreaker, Whirler Rogue, 2026-10-18).
 * Payer preference, cheapest-first: a SUMMONING-SICK permanent has nothing else to do this turn, and
 * among the rest a NON-MANA-SOURCE is preferred. ⚠️ That second key matters as soon as "permanent" is an
 * allowed payer noun (Gene Pollinator): tapping a LAND to make one mana is a legal but pointless play
 * that nets zero, and the sim would have made it on every activation. This is a policy, not a rule —
 * both orderings are legal — so it is stated as one. A stable sort keeps battlefield order within a key.
 * ⚠️ THE SICKNESS KEY IS CREATURE-SCOPED. `createPermanent` stamps summoningSick on EVERY fresh
 * permanent, lands included, and sickness is meaningless for a land tapped as a COST — so an
 * unscoped key sorted a just-played Forest ahead of a ready creature and picked the land. Caught by
 * asserting which payer was chosen rather than only that one was.
 */
export function tapCostPayerOrder(a, b) {
  return (Number(isCreatureCardType(b.card) && !!b.summoningSick) - Number(isCreatureCardType(a.card) && !!a.summoningSick))
    || (Number(!!manaProduction(a.card)) - Number(!!manaProduction(b.card)));
}

export function manaSources(state, playerId) {
  const player = state?.players?.[playerId];
  if (!player) return [];
  // MANA-MULTIPLIER (×N tap-for-mana replacement): the product of every Mana Reflection (×2) / Nyxbloom
  // Ancient (×3) THIS player controls — controller-scoped, computed ONCE per call (CR 605.1b/616). Applied
  // below to TAP sources only (a sac-for-mana Treasure/Spawn is not "tapped for mana" → never multiplied).
  // ×1 with none, so the common case is a no-op.
  const manaMult = manaMultiplier(state, playerId);
  // ── ARTIFACT-ACTIVATION LOCK (BLITZ NR-1, CR 604.2 — Null Rod / Stony Silence / Collector Ouphe):
  // a mana ability is an ACTIVATED ability (CR 605.1a), so while any battlefield carries the lock, NO
  // artifact permanent is a mana source — Sol Ring can't tap, a Treasure can't be cracked (its "{T},
  // Sacrifice this artifact: Add …" is an activated ability of an artifact), an artifact LAND's tap is
  // off too. This is THE affordability/payment chokepoint: every canAfford/planPayment consumer (cast
  // affordability, X ceilings, ward/pay prompts, the dispatcher's auto-tap) reads sources from here, so
  // gating here means a locked source is never counted affordable AND never tapped in payment. The
  // Artifact test is layer-aware (permanentTypes, after layer 4 — an animated artifact is still an
  // artifact) and only runs while a carrier is out (the lock is board-rare). A NON-artifact source is
  // untouched: an Eldrazi Spawn's sac (creature), a land's tap, a triggered tap-augment bonus riding a
  // nonartifact land (CR 603.2 — triggered abilities are not locked).
  const artLocked = artifactActivationsLocked(state);
  const sources = [];
  for (const perm of player.battlefield) {
    // A TAPPED permanent is still a source when its mana ability has no {T} to pay (CR 107.5 — only the tap symbol needs it
    // untapped; 2026-10-17): Ashnod's Altar, Kozilek's Translator, Wall of Roots, a no-{T} remove-a-counter source (stage ③ ·
    // 37 — Crystalline Crawler taps to add its own counter, then spends them). One whose own ability taps is skipped here; one
    // with no ability of its own is decided once its granted ability is read (below). manaProduction is memoized per card.
    // One whose own ability taps but that prints an EXTRA line with no {T} (Relic of Legends' tap-a-legend line, 2026-10-17)
    // still offers that line: its own record is skipped, the extra lines are read (extraLineSources), after the locks below.
    const card = manaCardOf(state, perm); // P·26 — a permanent that BECAME a copy taps for the copy's mana, not its printed mana
    let ownLineTapped = false;
    if (perm.tapped) {
      const own = manaProduction(card);
      if (own && own.requiresTap !== false) {
        if (!extraManaLineProducts(perm.card, manaProduction(perm.card)).some((e) => e.requiresTap === false)) continue;
        ownLineTapped = true;
      }
    }
    // ACTIVATED-LOCK (BLITZ AU-2, CR 605.1a): a mana ability IS an activated ability, so a permanent under the
    // layer-6 "activatedAbilitiesLocked" grant (an Arrest-class Aura, or Koma mode 1) is NOT a mana source —
    // the mana-path twin of the stack-ability gate in legalChoices. Board-rare (only that grant sets it), so
    // this is a no-op for the common case; mirrors the NR-1 artifact-lock skip just below.
    if (permanentHasKeyword(state, perm.id, "activatedAbilitiesLocked")) continue; // AU-2
    if (artLocked && permanentTypes(state, perm.id).types.includes("Artifact")) continue; // NR-1
    if (ownLineTapped) { sources.push(...extraLineSources(state, playerId, player, perm, manaMult)); continue; }
    let prod = manaProduction(card);
    // REMOVE-A-COUNTER, NO {T} (stage ③ · 37): one one-mana record per counter on it right now. `repeatable` lets the planner
    // spend several (a permanent's OTHER lines are one {T} and exclude each other; these are separate activations), `noTap`
    // keeps the commit from tapping it, and each record removes exactly one counter. Summoning sickness doesn't apply (no {T},
    // CR 302.6) and a mana multiplier doesn't either (not tapped for mana), so this runs before both.
    // A PRINTED PER-TURN LIMIT on such a line (Mana Bloom's "Activate only once each turn", 2026-10-17 evening) caps the records
    // at the activations left this turn, each stamping the ledger (`limitKey`); a capped single record is no longer `repeatable`,
    // so the explicit tap offers it — there is exactly one activation to take.
    if (prod?.removesCounters?.mode === "each") {
      const lim = prod.activationLimit;
      if (lim && !manaLimitAllows(state, playerId, perm.id, lim)) continue;
      const counters = perm.counters?.[prod.removesCounters.type] || 0;
      const n = lim?.perTurn != null ? Math.min(counters, lim.perTurn - manaLimitUsed(state, perm.id, lim)) : counters;
      for (let i = 0; i < n; i++) {
        sources.push({ permanentId: perm.id, colors: prod.colors, amount: 1, removesCounters: { type: prod.removesCounters.type, count: 1 }, repeatable: !lim || n > 1, noTap: true, ...(lim?.perTurn != null ? { limitKey: manaLimitKey(perm.id, lim) } : {}) });
      }
      continue;
    }
    // THE "INSTEAD" RIDER (withInsteadUpgrade, 2026-10-17 evening): the printed ability's upgrade replaces its base while the
    // condition holds — Urza's Tower's {C}{C}{C}, River of Tears' {B} after a land drop — before any grant or gate reads it.
    prod = withInsteadUpgrade(state, playerId, perm, prod);
    // ⭐ GRANTED BASIC LAND TYPE (④-BE, CR 305.6 — Urborg / Yavimaya / Blanket of Night): a land whose EFFECTIVE subtypes
    // include a basic type it does not print has that type's INTRINSIC mana ability, "{T}: Add <colour>". Merged into the
    // land's own one-mana tap source (so it stays ONE tap for one mana, just with more colour choices), or synthesized when
    // the land prints no mana ability at all. Anything more complex than a plain single-mana tap — an amount ≠ 1, a
    // no-tap/conditional/restricted/chosen-colour source, a cost rider — is left untouched (a safe FN, never an inflated
    // pool). Gated on layer-4 subtypes actually GRANTED, so a printed basic keeps its own production byte-for-byte.
    const grantedLandColors = grantedBasicTypeColors(state, perm);
    if (grantedLandColors.length) {
      if (!prod) {
        prod = { colors: grantedLandColors, amount: 1, requiresTap: true };
      } else if (prod.amount === 1 && prod.requiresTap !== false && !prod.chosenColor && !prod.restriction
                 && !prod.activationCondition && !prod.removesCounters && !prod.extraTap && !prod.payLife && !prod.fromHand) {
        const merged = [...new Set([...(prod.colors || []), ...grantedLandColors])];
        if (merged.length !== (prod.colors || []).length) prod = { ...prod, colors: merged };
      }
    }
    // GRANTED MANA (withGrantedMana — read here for the planner and the explicit tap alike): a permanent with NO own mana
    // ability takes the ability a lord / Aura / Equipment grants it, every cost flag included (Basal Sliver's self-sacrifice).
    // DEDUP (the double-grant landmine): when the permanent ALREADY produces mana from its OWN card, keep the own source and
    // SKIP the grant — the granter (a Sliver) self-includes via "All Slivers", and manaModel already reads its quoted text as
    // its own source (the test-pinned Gemhide self-production). Granting it again would tap it twice. A recipient with its own
    // DIFFERENT ability also keeps only its own (a safe under-count, never a fabricated extra tap), unless the grant dominates
    // it in place (AURA-MANA-GRANT: a land's own tap upgrades to a dominating aura grant), or it is a land grant marked
    // `asChoice` (Chromatic Lantern, 2026-10-17) and the land's own line is a plain one-mana {T} tap: the granted colours join
    // that ONE tap's choices (withGrantedChoice).
    prod = withGrantedMana(state, perm, prod);
    if (!prod) continue;
    if (perm.tapped && prod.requiresTap !== false) continue; // CR 107.5 — a {T} ability (own or granted) needs it untapped
    if (prod.fromHand) continue; // SG-6 — an exile-from-HAND ability does not exist on the battlefield permanent
    // THE PER-TURN LIMIT (manaActivationLimit — CR 602.5b): a line already activated its limit-many times this turn is not a
    // source again until the next turn; one limited to its controller's turn (Vivi Ornitier) is no source on another's, one
    // limited to an opponent's turn (Lavinia, 2026-10-17 evening) none on its controller's own (CR 602.5).
    if (prod.activationLimit && !manaLimitAllows(state, playerId, perm.id, prod.activationLimit)) continue;
    // LANDS-12 — resolve the CHOSEN-COLOR leg against THIS permanent's stamp (see parseAddClause). Unstamped →
    // only the fixed option remains; a spec with no fixed option and no stamp produces nothing (never a guess).
    if (prod.chosenColor) {
      const stamped = perm.chosenColor;
      const colors = stamped ? [...new Set([...(prod.colors || []), stamped])] : [...(prod.colors || [])];
      if (!colors.length) continue;
      prod = { ...prod, colors };
    }
    // ⛔ CONDITION-GATED SOURCE (CR 602.5) — "Activate only if you control three or more artifacts" (Mox Opal
    // #241, Fanatic of Rhonas #418). Evaluated LIVE here, at the ONE chokepoint every consumer of the source
    // list goes through; gating at each consumer instead would guarantee one of them forgets. `!== true` so a
    // condition that cannot be confirmed blocks rather than passes — the FN-safe direction, and the same
    // comparison legalChoices uses for activated abilities.
    if (prod.activationCondition
      && evaluateInterveningIf(state, prod.activationCondition, playerId, { sourcePermanentId: perm.id }) !== true) continue;
    // STAGE ④-4: a MAIN counter-removal product (the Mana Batteries — their only mana line) resolves its amount
    // from the permanent's live counters, plus one for the Battery form; nothing to add → no source.
    // 2026-10-17: a SINGLE-counter land line ("one" — Gemstone Mine, the depletion lands) keeps its printed amount and removes
    // one counter; with none of that kind left the cost can't be paid (CR 118.3) and the land is no source.
    if (prod.removesCounters) {
      const n = perm.counters?.[prod.removesCounters.type] || 0;
      if (prod.removesCounters.mode === "one") {
        if (n < 1) continue;
        prod = { ...prod, removesCountersLive: { type: prod.removesCounters.type, count: 1 } };
      } else {
        const a = (prod.removesCounters.mode === "plusOne" ? 1 : 0) + n;
        if (a <= 0) continue;
        prod = { ...prod, amount: a, removesCountersLive: { type: prod.removesCounters.type, count: n } };
      }
    }
    // KW-ENGINES (CR 702.179) — a "Max speed —" mana ability is live ONLY while its controller's speed
    // is 4. Gated here at the same single chokepoint as the activation condition, for the same reason:
    // every affordability/payment consumer reads sources from here, so a below-max source is never
    // counted affordable and never tapped. (Before the speed subsystem existed this line was offered
    // UNGATED — free {R}{R} at speed zero, measured live on Endrider Catalyzer.)
    if (prod.requiresMaxSpeed && (player.speed || 0) < 4) continue;
    // The PRINTED card, deliberately (not the copy): it picks which sickness read applies — a printed creature's stamped flag,
    // or the layer-aware summoningSickNow for everything else, which is the read that sees a land that became a creature copy.
    // Its FACE THAT IS UP (CR 712.8d) — the pair of layers.summoningSickNow's printed arm: Hostile Hostel's combined line says
    // "Creature", and the land could not tap the turn it was played.
    const isCreature = /Creature/.test(faceUpTypeLine(perm.card));
    // GRANTED Haste counts (read through the layer engine), not just printed — a mana dork
    // enchanted/anthemed with Haste can tap the turn it enters. Falls back to the printed
    // seed when there are no continuous effects (the common case), so the hot path is cheap.
    // EXCEPTION (CR 302.6): summoning sickness gates a {T}/{Q} ability, but a sac-for-mana ability with
    // NO {T} (an Eldrazi Spawn "Sacrifice this token: Add {C}", or a Treasure on a creature body) is
    // usable the turn the creature enters — so a freshly-created Spawn ramps immediately. All other
    // summoning-sick creatures (Haste-less {T} dorks) stay excluded exactly as before.
    // ⭐ GENERALISED (CR 302.6): sickness gates a {T}/{Q} ability, so ANY mana ability whose cost carries no
    // {T} is usable the turn the creature enters — not just the sac-for-mana case this originally covered.
    // The old `prod.sacrifices && !prod.requiresTap` was the same rule stated over one example: a Birchlore
    // Rangers ("Tap two untapped Elves you control: Add …", no {T} of its own) is legal the turn it lands and
    // was being gated as though it tapped. Same CR clause as the tap-OTHER payer rule directly below — the
    // engine now applies it on both sides of that cost instead of one.
    // ⚠️ `=== false`, NOT `!prod.requiresTap`. Lands, basics and the iconic rocks carry NO `requiresTap` key
    // at all, and undefined means "DOES tap" — the loose form made every mass-animated land usable the turn
    // it was played, which the CR 302.6 land test caught immediately. Only an ability the parser EXPLICITLY
    // determined has no {T} in its cost qualifies.
    const usableWhileSick = prod.requiresTap === false;
    // summoningSickNow (NV-1, CR 302.6): layer-aware — printed creatures read the stamped flag exactly
    // as before; a MASS-ANIMATED land played this turn is newly gated (its {T} mana ability is a sick
    // creature's); a Treasure/stolen non-creature keeps its old never-gated verdict.
    if ((isCreature ? !!perm.summoningSick : summoningSickNow(state, perm)) && !usableWhileSick
        && !permanentHasKeyword(state, perm.id, "Haste")
        && !abilitiesAsThoughHasteFor(state, perm.controller)) continue; // SG-18 (Shang-Chi): abilities as though haste
    // MANA-VARIABLE: a count-derived amount (Gaea's Cradle "for each creature", Karametra "devotion",
    // Bighorner "greatest power", …) is resolved LIVE against the controller's board (CR 608.2g),
    // floored at 0 — never the parser's amount:0 placeholder. ctx.source = this permanent so an
    // excludeSelf metric ("greatest … among OTHER creatures") drops it. A repeatable tap source with
    // a resolved amount of 0 still appears (it's a legal-but-pointless tap); the action layer
    // (actionsTapForMana) skips offering a 0-mana tap.
    // ⛔ TAP-OTHER AVAILABILITY GATE — resolve the PAYERS against the live board before this source is
    // offered at all. This is the whole reason the compound-cost guard refused these cards: an offered
    // source whose extra cost is never checked is PHANTOM MANA the sim "pays" for free, every turn.
    // Payers are the controller's untapped permanents matching the printed filter, EXCLUDING the source
    // itself (it is already tapping via its own {T}). Too few payers → no source, not a cheaper source.
    //
    // ⭐ SUMMONING SICKNESS IS DELIBERATELY NOT A FILTER (CR 302.6): sickness restricts the {T} symbol in a
    // creature's OWN cost, and this is a cost of the SOURCE's ability — a creature played this turn is a
    // legal payer. Ordering prefers sick payers precisely because they are the ones with nothing else to do.
    // ⛔ PAY-LIFE AFFORDABILITY — the twin of the tap-OTHER gate below. A source whose life cost is never
    // checked is the same phantom mana in a different currency.
    //
    // ⚠️ STRICTLY GREATER THAN, not >=. Paying life down to exactly 0 is LEGAL (CR 118.4) and then loses the
    // game to a state-based action — so a >= gate lets the sim kill itself for one mana, which is a legal
    // move no player would make and a corrupted training game. Declining that last point of life is a
    // DELIBERATE narrowing (a safe FN on a line the sim should never want), not a rules claim.
    if (prod.payLife != null && !((player.life ?? 0) > prod.payLife)) continue;
    // A life total that can't change pays no life (CR 119.8 — Teferi's Protection's lock, the gate activated abilities already have;
    // 2026-10-17): loseLife leaves the total where it is, so the line would have made its mana for nothing.
    if (prod.payLife != null && playerLifeLocked(state, playerId)) continue;
    let extraTaps = null;
    if (prod.extraTap) {
      extraTaps = tapOtherPayers(state, player, perm, prod); // the payers, resolved off the live board (one reader, main and extra lines)
      if (!extraTaps) continue;                                // cannot pay → not a source
    }
    const baseAmount = prod.amountSpec
      ? Math.max(0, countForSpec(state, { controller: playerId, source: perm }, prod.amountSpec))
      : prod.amount;
    // MANA-MULTIPLIER: multiply mana from TAPPING a permanent (Mana Reflection ×2 / Nyxbloom ×3). A source
    // is "tapped for mana" unless its ability EXPLICITLY doesn't tap (`requiresTap === false` — a pure-mana
    // filter like Prismite "{2}: Add …", or a non-tap sac like an Eldrazi Spawn "Sacrifice this: Add {C}").
    // Lands / basics / iconic rocks carry no `requiresTap` key (undefined) and DO tap, so they multiply; a
    // {T}-cost Treasure (requiresTap:true) is tapped-for-mana too, so it multiplies (CR 605 ruling). The
    // factor is ×1 when the player controls no multiplier, so this is a no-op in the common case.
    const amount = prod.requiresTap === false ? baseAmount : baseAmount * manaMult;
    // AURA-LAND-MANA-BOOST: a LAND carrying a mana-boost Aura yields extra mana inline on tap. Only
    // lands enchant-eligible for these auras, but the helper is a no-op for non-lands (no attachments
    // parse to a land-mana bonus), so it's cheap + safe to call unconditionally.
    // GLOBAL-TAP-AUGMENT: a separate "Whenever you tap a <land|creature> for mana, add …" permanent the
    // controller owns adds extra fixed-color mana inline when this matching source taps (Groundchuck &
    // Dirtbag, Leyline of Abundance). Both boosts ride on THIS source's tap (neither taps the augmenter),
    // so they concat into one `bonus` list the planner credits on tap. (MANA-MULTIPLIER applies to the
    // source's OWN production above; an additive triggered boost is NOT multiplied — CR 605.1b/616.)
    // MANA FLARE (MF-1): a sameAsProduced bonus's reachable color set IS the source's own production set
    // (the extra pip is the type this tap produced), so stamp prod.colors here — planPayment's flex/can-make
    // reads stay exact (no new color reach) and its sameAsProduced pick binds the bonus to the primary color.
    // ⛔ ONLY A TAP FOR MANA (2026-10-17 — CR 106.12, 106.12a): every one of these boosts is "whenever … is tapped for mana",
    // and a permanent is tapped for mana only by a mana ability with {T} in its cost. An Ashnod's Altar activation or an Eldrazi
    // Spawn sacrificed for mana is not one, so Kinnan, Bonder Prodigy added a phantom mana to both — the same `requiresTap ===
    // false` that keeps the multiplier off above.
    const bonus = (prod.requiresTap === false ? [] : [...landAuraManaBonus(state, perm), ...globalTapManaAugment(state, playerId, perm)])
      .map((b) => (b.sameAsProduced ? { sameAsProduced: true, colors: [...prod.colors], amount: b.amount } : b));
    // A CONDITIONAL bonus (`whenProduces` — Forsaken Monument, Caged Sun, Gauntlet of Power; 2026-10-17) rides only a record that
    // can make its colour — the record's final colours (or its fixed bundle), so a Forest never carries Forsaken Monument's {C}.
    const bonusFor = (colors, fixedMap) => bonus.filter((b) => !b.whenProduces || (fixedMap ? (fixedMap[b.whenProduces] || 0) > 0 : (colors || []).includes(b.whenProduces)));
    // SNOW (SN-1, CR 107.4h): stamp sources produced by a snow permanent so planPayment can pay a {S} pip
    // with one mana from here (a {S} is NEVER paid from a non-snow source). The snow flag is the SOURCE
    // permanent's printed supertype — independent of what color/amount it makes.
    // MIXED FIXED BUNDLE (karoo / signet): carry the per-color tally, scaled by the SAME multiplier factor
    // applied to `amount` above so a doubled Selesnya Signet makes {G}{G}{W}{W} — not four of one color, and
    // not an unscaled single bundle. Absent on every single-color source, so the shape is unchanged there.
    const scale = prod.requiresTap === false ? 1 : manaMult;
    // VIVID (Bloom Tender / Faeburrow Elder): resolve the board-derived bundle LIVE (CR 608.2g) — one mana per
    // DISTINCT color among the controller's permanents. An empty/colorless board yields no colors, which must
    // stay a produce-nothing source rather than a fabricated mana (CREED); `amount` follows the same tally, so
    // the 0-amount drop below removes it from the payable set exactly like any other zero producer.
    // Each permanent's colors are its CURRENT ones (permanentColors — CR 613.1e, the front face of a double-faced one, CR
    // 712.8d): a Faeburrow Elder Cerulean Wisps turned blue makes {U}, not the {G}{W} it prints — a printed read minted mana
    // of colors no permanent had. manaSources runs outside the layer system, so the full derive is safe to read here.
    const dynFixed = prod.fixedSpec?.kind === "colorsAmongPermanents"
      ? Object.fromEntries([...new Set((player.battlefield || []).flatMap((p) => permanentColors(state, p.id)))].map((c) => [c, scale]))
      : null;
    // A BOARD-DERIVED COLOUR SET (colorsAmongFor) — Plaza of Heroes (S17), Incubation Druid (2026-09-05), and since 2026-10-16
    // Mox Amber, the commander's-color-identity sources (Command Tower, Arcane Signet …) and the "could produce" lands (Exotic
    // Orchard, Fellwar Stone, Star Compass, Harvester Druid): narrow the parser's placeholder to the live set. An empty set
    // means no colour can be made → the MAIN record is not offered, but the card's EXTRA lines still are (a `continue` here
    // would take Plaza's honest {C} line with it).
    let dropMain = false;
    if (prod.colorsAmongSpec) {
      const among = colorsAmongFor(state, playerId, prod.colorsAmongSpec);
      if (among.length) prod = { ...prod, colors: among };
      else dropMain = true;
    }
    // THE DAMAGE A PAINFUL LINE DEALS (painColors): off once the controller has the city's blessing (shelf D5 — Temur
    // Elevator), and off while a printed "if <condition>" is FALSE as the ability resolves (Tomb of Urami beside an Ogre,
    // CR 605.3b). Every other tap deals it, the planner's and the explicit one alike (tapRecordFor).
    const painOn = !!prod.painColors && !(prod.painUnlessCitysBlessing && player.citysBlessing === true)
      && !(prod.painCondition && evaluateInterveningIf(state, prod.painCondition, playerId, { sourcePermanentId: perm.id }) === false);
    // THE FREE-ACTIVATION FIX: the main record carries the mana cost of the line it comes from (null for a plain {T} line);
    // the planner funds it before the source produces. A cost the reader can't price drops the main record (FN-safe).
    const mainActivationCost = manaActivationCost(perm.card);
    if (mainActivationCost?.unpayable) dropMain = true;
    const fixed = dynFixed || (prod.fixed ? Object.fromEntries(Object.entries(prod.fixed).map(([c, n]) => [c, n * scale])) : null);
    // A bundle's TOTAL is its own tally — for the printed karoo family this equals `amount` exactly (two
    // symbols × the multiplier), and for the board-derived VIVID form it is the live color count, replacing
    // the parser's amount:0 placeholder. One rule covers both, so the two can never disagree. A bundle that
    // resolves to no colors totals 0 and is dropped by the `amount > 0` filter in planPayment — the
    // produce-nothing case, never a fabricated mana.
    const bundleTotal = fixed ? Object.values(fixed).reduce((a, b) => a + b, 0) : amount;
    // STAYS TAPPED (CR 502.3): a permanent whose own text keeps it from untapping in its untap step (Mana Vault, Basalt
    // and Grim Monolith) — the untap step's own read, so the two cannot drift. Its tap costs the mana of the turns it
    // stays tapped; the generic tap order (planPaymentCore's tapAny) never promotes it ahead of a source that untaps.
    const staysTapped = cardSelfPreventsUntap(perm.card);
    // THE COST RIDERS OF THE LINE ITSELF (2026-10-17), carried to the tap record (tapRecordFor) and paid by commitManaTap:
    //   · noTap — the line has no {T}: the commit never taps the source, and it is not tapped for mana (CR 107.5, 106.12);
    //   · putsCounter — Wall of Roots' -0/-1 counter, put on as the cost;
    //   · sacrificeIfNoCounters — the depletion / mining land's own "if there are no <kind> counters on this land, sacrifice it";
    //   · limitKey — the activation ledger entry the commit stamps (manaActivationLimit).
    const lineRiders = {
      ...(prod.requiresTap === false ? { noTap: true } : {}),
      ...(prod.putsCounter ? { putsCounter: { ...prod.putsCounter } } : {}),
      ...(prod.sacrificeIfNoCounters && prod.removesCountersLive ? { sacrificeIfNoCounters: true } : {}),
      ...(prod.activationLimit?.perTurn != null ? { limitKey: manaLimitKey(perm.id, prod.activationLimit) } : {}),
    };
    // IMPRINT (CR 207.2c) — Chrome Mox's reachable colors ARE the imprinted card's colors, read live off the
    // stamp resolveImprintChoice wrote. NO stamp (declined, or never offered) and NO colors (a colorless card
    // was imprinted) both mean this permanent is not a mana source: `continue` rather than push an
    // empty-colors source, so it is never offered, never tapped, and never fabricates a color. This is the
    // gate the whole imprint build order existed to make possible.
    if (prod.colorsFromImprint) {
      // The exiled card's colours (characteristicColors — a double-faced card in exile is its front face's, CR 712.8a: Delver of Secrets
      // makes {U}; its combined card carries Scryfall's empty top-level colours).
      const imprintedColors = (perm.imprinted ? characteristicColors(perm.imprinted) : []).filter((c) => MANA_COLORS.includes(c));
      if (!imprintedColors.length) continue;
      const imprintBonus = bonusFor(imprintedColors, null);
      sources.push({ permanentId: perm.id, colors: imprintedColors, amount: bundleTotal, sacrifices: !!prod.sacrifices, ...(isSnowPermanent(perm.card) ? { snow: true } : {}), ...(imprintBonus.length ? { bonus: imprintBonus } : {}), ...(prod.restriction ? { restriction: resolveSourceRestriction(prod.restriction, perm) } : {}), ...(extraTaps ? { extraTaps } : {}), ...(prod.payLife != null ? { payLife: prod.payLife, lifeAvail: player.life ?? 0 } : {}), ...(staysTapped ? { staysTapped: true } : {}), ...lineRiders });
      continue;
    }
    // EXILE-FROM-GY COST (Molt Tender): the source exists ONLY while the graveyard has a card to pay
    // with — an empty graveyard means the cost can't be paid, so the source is never offered (the
    // availability half of the phantom-gate carve; commitManaTap is the payment half).
    if (prod.exilesGyCard && (player.graveyard || []).length === 0) continue;
    // + 2026-10-17 — its candidate cards ride the record (`gyExileIds`, oldest first) so the planner gives each exile cost of a payment
    // its own card (assignSacVictims — two Molt Tenders can't share one).
    const gyExileIds = prod.exilesGyCard ? (player.graveyard || []).map((c) => c.id) : null;
    // SG-3 — a sacrifice-a-creature source needs ANOTHER creature to feed it (never the source itself, never
    // offered on an empty board): no victim → no source (CR 601.2h — the cost cannot be paid). A creature NOW (the type-line
    // audit); Gilded Goose's a Food NOW, never the source (CR 118.3). The victims ride the record (`sacVictimIds`) so the planner
    // gives each sacrifice cost of a payment its own (assignSacVictims — two Altars can't share one creature).
    const sacVictimIds = sacVictimIdsFor(state, player, perm.id, prod);
    if (sacVictimIds && !sacVictimIds.length) continue;
    const mainBonus = bonusFor(fixed ? Object.keys(fixed) : prod.colors, fixed && Object.keys(fixed).length > 1 ? fixed : null);
    if (!dropMain) sources.push({ permanentId: perm.id, colors: fixed ? Object.keys(fixed) : prod.colors, amount: bundleTotal, sacrifices: !!prod.sacrifices, ...(mainActivationCost ? { activationCost: mainActivationCost } : {}), ...(parseManaSpentRider(perm.card) ? { spentRider: parseManaSpentRider(perm.card) } : {}), /* V11 */ ...(prod.exilesGyCard ? { exilesGyCard: true, gyExileIds } : {}), ...(prod.sacrificesCreature ? { sacrificesCreature: true } : {}), ...(prod.sacrificesFood ? { sacrificesFood: true } : {}), ...(sacVictimIds ? { sacVictimIds } : {}), ...(fixed ? { fixed } : {}), ...(painOn ? { painColors: prod.painColors, painAmount: prod.painAmount } : {}), ...(isSnowPermanent(perm.card) ? { snow: true } : {}), ...(mainBonus.length ? { bonus: mainBonus } : {}), ...(prod.restriction ? { restriction: resolveSourceRestriction(prod.restriction, perm) } : {}), ...(extraTaps ? { extraTaps } : {}), ...(prod.payLife != null ? { payLife: prod.payLife, lifeAvail: player.life ?? 0 } : {}), ...(prod.removesCountersLive ? { removesCounters: prod.removesCountersLive } : {}), ...(staysTapped ? { staysTapped: true } : {}), ...lineRiders });
    // STAGE ④-3 — EXTRA MANA LINES (extraLineSources): each its own record on the SAME permanent.
    sources.push(...extraLineSources(state, playerId, player, perm, manaMult));
  }
  // SG-6 — EXILE-FROM-HAND sources (Elvish / Simian Spirit Guide): a mana ability of a card in HAND. Offered
  // as a one-shot source keyed by the card's id (the committer exiles it); never a tap, never repeatable.
  for (const card of player.hand || []) {
    const prod = manaProduction(card);
    if (!prod || !prod.fromHand) continue;
    sources.push({ permanentId: card.id, colors: prod.colors, amount: prod.amount ?? 1, sacrifices: false, fromHand: true });
  }
  return sources;
}

/**
 * STAGE ④-3 — A PERMANENT'S EXTRA MANA LINES as source records (extraManaLineProducts): a second, complete "{T}: Add …" line the
 * main product does not cover (a gated colour line — Tainted Isle / the Verges / Gathering Place; a free "{T}: Add {C}" beside a
 * painful any-colour line — Grand Coliseum; a "{T}, Sacrifice this land: Add …" ritual line) and, since 2026-10-17, a no-{T}
 * tap-other line (Relic of Legends). Each is its own record on the SAME permanent; the planner treats a permanent's {T}
 * records as one tap (tapSource). Gated live exactly like the main product. Read by manaSources for every permanent it
 * reaches — and for a TAPPED one whose own line needs {T} when one of these lines has none (CR 107.5): Relic of Legends'
 * tap-a-legend line after its {T} line was used.
 */
function extraLineSources(state, playerId, player, perm, manaMult) {
  const out = [];
  const staysTapped = cardSelfPreventsUntap(perm.card);
  for (const extra of extraManaLineProducts(perm.card, manaProduction(perm.card))) {
    if (extra.activationCondition && evaluateInterveningIf(state, extra.activationCondition, playerId, { sourcePermanentId: perm.id }) !== true) continue;
    if (perm.tapped && extra.requiresTap !== false) continue; // CR 107.5 — a tapped permanent offers only a line with no {T}
    if (extra.activationLimit && !manaLimitAllows(state, playerId, perm.id, extra.activationLimit)) continue;
    const exFixed = extra.fixed && Object.keys(extra.fixed).length > 1 ? extra.fixed : null;
    // STAGE ④-4: a counter-removal line's amount is the permanent's LIVE counters (plus one for the Battery form). A single-
    // counter land line ("one" — the Vivid lands, Tendo Ice Bridge, Mirrodin's Core, 2026-10-17) keeps its printed amount,
    // removes one counter, and is no source with none of that kind left (CR 118.3).
    const crCount = extra.removesCounters ? (perm.counters?.[extra.removesCounters.type] || 0) : 0;
    const oneCounter = extra.removesCounters?.mode === "one";
    if (oneCounter && crCount < 1) continue;
    const exMult = extra.requiresTap === false ? 1 : manaMult; // a no-{T} line is not tapped for mana (CR 106.12)
    const exAmount = extra.removesCounters && !oneCounter ? ((extra.removesCounters.mode === "plusOne" ? 1 : 0) + crCount) * exMult
      : exFixed ? Object.values(exFixed).reduce((a, b) => a + b, 0)
      : extra.amountSpec ? Math.max(0, countForSpec(state, { controller: playerId, source: perm }, extra.amountSpec)) * exMult // P·7 — a count read live (Three Tree City)
      : (extra.amount ?? 1) * exMult;
    if (exAmount <= 0) continue;
    // V2 (2026-09-04 — Starting Town "{T}, Pay 1 life: Add one mana of any color" beside a free "{T}: Add {C}"): a
    // pay-life extra line carries its life cost onto the record (the planner and commitPaymentPlan already honour
    // `payLife` on a source — the painland/City-of-Brass lane) and is gated exactly like the main product: no life,
    // no source. Without both halves the any-colour tap would be free — the forbidden direction.
    if (extra.payLife != null && (!((player.life ?? 0) > extra.payLife) || playerLifeLocked(state, playerId))) continue; // + CR 119.8, as on a main product
    // A TAP-OTHER line (Relic of Legends' "Tap an untapped legendary creature you control", 2026-10-17): its payers resolved off the
    // live board by the main product's own reader; too few → no record (CR 118.3). Carried on the record, tapped by the commit.
    const exTaps = extra.extraTap ? tapOtherPayers(state, player, perm, extra) : null;
    if (extra.extraTap && !exTaps) continue;
    // THE LAND LINES (2026-10-17): Phyrexian Tower's creature to sacrifice — none but the source, no activation (CR 118.3); Muraganda
    // Raceway's Max speed (CR 702.179e); a board-derived colour set read live (Opal Palace's commander identity, The Grey Havens'
    // graveyard — empty, no record); a painful pair's damage (Murmuring Bosk), on the same terms as a main product's; Grove of the
    // Burnwillows' opponents' life; a costed line's "when that mana is spent" rider; a bundle's name for the explicit tap.
    const exVictimIds = sacVictimIdsFor(state, player, perm.id, extra); // its victims ride the record, as on a main product
    if (exVictimIds && !exVictimIds.length) continue;
    // An exile-a-graveyard-card line (none is an extra line in the bundle today) is gated and carried like a main product's.
    if (extra.exilesGyCard && !(player.graveyard || []).length) continue;
    const exGyIds = extra.exilesGyCard ? (player.graveyard || []).map((c) => c.id) : null;
    if (extra.requiresMaxSpeed && (player.speed || 0) < 4) continue;
    let exColors = exFixed ? Object.keys(exFixed) : extra.colors;
    if (extra.colorsAmongSpec) {
      exColors = colorsAmongFor(state, playerId, extra.colorsAmongSpec);
      if (!exColors.length) continue;
    }
    const exPainOn = !!extra.painColors && !(extra.painUnlessCitysBlessing && player.citysBlessing === true)
      && !(extra.painCondition && evaluateInterveningIf(state, extra.painCondition, playerId, { sourcePermanentId: perm.id }) === false);
    out.push({ permanentId: perm.id, colors: exColors, amount: exAmount, sacrifices: !!extra.sacrifices, ...(extra.sacrificesCreature ? { sacrificesCreature: true } : {}), ...(extra.sacrificesFood ? { sacrificesFood: true } : {}), ...(exVictimIds ? { sacVictimIds: exVictimIds } : {}), ...(exGyIds ? { exilesGyCard: true, gyExileIds: exGyIds } : {}), ...(exPainOn ? { painColors: extra.painColors, painAmount: extra.painAmount } : {}), ...(extra.opponentsGainLife ? { opponentsGainLife: extra.opponentsGainLife } : {}), ...(extra.spentRider ? { spentRider: { ...extra.spentRider } } : {}), ...(extra.bundle ? { bundle: extra.bundle } : {}), ...(extra.activationCost ? { activationCost: extra.activationCost } : {}), ...(extra.payLife != null ? { payLife: extra.payLife, lifeAvail: player.life ?? 0 } : {}), ...(exFixed ? { fixed: exFixed } : {}), ...(isSnowPermanent(perm.card) ? { snow: true } : {}), ...(extra.removesCounters ? { removesCounters: { type: extra.removesCounters.type, count: oneCounter ? 1 : crCount } } : {}), ...(extra.sacrificeIfNoCounters && extra.removesCounters ? { sacrificeIfNoCounters: true } : {}), ...(extra.requiresTap === false ? { noTap: true } : {}), ...(extra.putsCounter ? { putsCounter: { ...extra.putsCounter } } : {}), ...(extra.activationLimit?.perTurn != null ? { limitKey: manaLimitKey(perm.id, extra.activationLimit) } : {}), ...(extra.doesNotUntapNext ? { doesNotUntapNext: true } : {}), ...(extra.restriction ? { restriction: resolveSourceRestriction(extra.restriction, perm) } : {}), ...(exTaps ? { extraTaps: exTaps } : {}), ...(staysTapped ? { staysTapped: true } : {}), extraLine: true }); // + CAP-CAVERN: a restricted extra line carries its (resolved) restriction
  }
  return out;
}
/**
 * The battlefield permanents an action's OWN costs still need once its mana is paid — its sacrifice victims, the
 * creatures and lands it taps or returns, the Equipment it unattaches, and its source when the source taps, is sacrificed
 * or is exiled as part of the cost. commitPaymentPlan keeps a sacrifice-a-creature mana source off these, and
 * withoutUnfeedableSacSources keeps such a source out of the plan when nothing else could feed it.
 * + THE GRAVEYARD CARDS IT STILL NEEDS (2026-10-17 — the exile-a-graveyard-card mana cost, Molt Tender): the cards its own cost
 * exiles (`exileGyIds`, `exileGyCardId(s)`, escape's `escapeCast.exileIds`), the card CAST from the graveyard (it is on the stack
 * while the costs are paid, CR 601.2a — no card to exile), and the card whose graveyard ability is activated (exiling it pays for an
 * ability that then does nothing, or — "Exile this card from your graveyard" — leaves its own cost unpayable). Card ids and
 * permanent ids never collide, so one set carries both.
 */
export function costReservedPermanentIds(action) {
  const ids = new Set();
  const add = (v) => { if (Array.isArray(v)) v.forEach(add); else if (v != null) ids.add(v); };
  for (const key of ["sacCreatureId", "sacCountIds", "sacXIds", "sacLandIds", "sacId", "tapCreatureId", "tapCountIds", "tapIds",
    "teamworkTapIds", "returnLandId", "returnLandIds", "returnPermId", "unattachEquipmentId",
    "exileGyIds", "exileGyCardId", "exileGyCardIds"]) add(action?.[key]);
  if (action?.permanentId != null && (action.tapSelf || action.sacSelf || action.exileSelf)) ids.add(action.permanentId);
  add(action?.escapeCast?.exileIds);
  if (action?.cardId != null && (action.fromZone === "graveyard" || action.kind === "activate-gy-recursion" || action.kind === "activate-gy-exile")) ids.add(action.cardId);
  return ids;
}

/**
 * Drop every sacrifice-a-creature mana source that has no creature left to feed it once `reserved` (the action's own
 * cost permanents) is set aside. manaSources offers such a source while ANY other creature is there; when the only
 * other creature is the very one the action sacrifices or taps, the source cannot pay (CR 601.2h) and must not count
 * toward affordability. Shared by the offer and the payment so the two cannot diverge.
 * Each kept source's victims (`sacVictimIds`) lose the reserved ones too (2026-10-17), so the planner never gives a reserved
 * permanent to an Altar as its own victim: two Altars beside two creatures, one of them the action's, pay one mana, not two.
 * + An exile-a-graveyard-card source (Molt Tender) the same way (2026-10-17): its cards (`gyExileIds`) lose the reserved ones — the
 * card cast from the graveyard, the cards the action's own cost exiles — and with none left it is no source.
 */
export function withoutUnfeedableSacSources(state, playerId, sources, reserved) {
  if (!reserved || !sources.some((s) => sacVictimTest(s) || picksGyCard(s))) return sources;
  const bf = state?.players?.[playerId]?.battlefield || [];
  const gy = state?.players?.[playerId]?.graveyard || [];
  // Each kind reads its own pool: a creature NOW for the Altars, a Food NOW for Gilded Goose (the type-line audit).
  const out = [];
  for (const s of sources) {
    const isVictim = sacVictimTest(s);
    let next = s;
    if (isVictim) {
      const ids = (Array.isArray(s.sacVictimIds) ? s.sacVictimIds : bf.filter((c) => c.id !== s.permanentId && isVictim(state, c)).map((c) => c.id))
        .filter((id) => !reserved.has(id));
      if (!ids.length) continue;
      next = { ...next, sacVictimIds: ids };
    }
    if (picksGyCard(s)) {
      const cards = (Array.isArray(s.gyExileIds) ? s.gyExileIds : gy.map((c) => c.id)).filter((id) => !reserved.has(id));
      if (!cards.length) continue;
      next = { ...next, gyExileIds: cards };
    }
    out.push(next);
  }
  return out;
}

/**
 * The mana sources an ACTIVATED ability's payment may draw on — the dispatcher's own derivation (applyActivateAbility), moved here
 * (2026-10-17) so the offer can ask the same question: a source paying part of the ability's own cost (its {T}, its sacrifice, its
 * exile; the creature it taps; the land it returns; the N it sacrifices) can't also tap for mana, a one-shot victim can't be cracked,
 * and no Altar or Molt Tender may take a permanent or card the ability's own costs need (withoutUnfeedableSacSources).
 */
export function activationPaymentSources(state, action) {
  const sacCountExcluded = new Set(action.sacCountIds || []);
  return withoutUnfeedableSacSources(state, action.playerId, sourcesExcludingOneShotVictim(
    manaSources(state, action.playerId).filter((s) =>
      !((action.tapSelf || action.sacSelf || action.exileSelf) && s.permanentId === action.permanentId) &&
      !(action.tapCreatureId && s.permanentId === action.tapCreatureId) &&
      !(action.tapCountIds || []).includes(s.permanentId) && // V6 slice 2 — the N frozen tap victims can't tap for mana either
      // γ1g: a LAND returned to hand for a "Return a land you control" cost (Oboro) can't ALSO tap for mana — it's gone before the
      // {mana} is paid.
      !(action.returnLandId && s.permanentId === action.returnLandId) &&
      !sacCountExcluded.has(s.permanentId)),
    action.sacCreatureId,
  ), costReservedPermanentIds(action));
}

/**
 * The mana sources a GRAVEYARD ability's payment may draw on (Purple Pentapus's return, Seasoned Pyromancer's exile — 2026-10-17):
 * every source, less a creature its "Tap an untapped creature you control" cost taps (`tapIds` — it can't also tap for mana: beside
 * Cryptolith Rite the planner tapped it for {B} and the tap cost then found it tapped, COST_UNPAYABLE) and any source whose own
 * tap-other payers include it, with no Altar or Molt Tender taking what the ability's own costs need (the tapped creature, the card
 * itself, the cards it exiles). Shared by the offer and the dispatcher.
 */
export function graveyardActivationPaymentSources(state, action) {
  const tapped = new Set(action.tapIds || []);
  const sources = tapped.size
    ? manaSources(state, action.playerId).filter((s) => !tapped.has(s.permanentId) && !(s.extraTaps || []).some((id) => tapped.has(id)))
    : manaSources(state, action.playerId);
  return withoutUnfeedableSacSources(state, action.playerId, sources, costReservedPermanentIds(action));
}

/**
 * W3 (overhaul pass, the γ1b/addCost double-spend guard): a ONE-SHOT mana source (a source the
 * commit path SACRIFICES on use — Treasure/Gold/Eldrazi Spawn) that is ALSO the chosen sacrifice
 * victim of the very cost being paid cannot be cracked for that cost's mana: planPayment would
 * consume it and the dispatcher's victim re-find would throw PERM_NOT_FOUND on an OFFERED action.
 * A REPEATABLE victim stays available — tap-then-sacrifice is legal (the dispatcher taps before
 * sacrificing). Shared by legalChoices (affordability) and actionDispatcher (payment) so the
 * offered set and the executed payment can never diverge. Pure.
 */
export function sourcesExcludingOneShotVictim(sources, victimId) {
  if (!victimId) return sources;
  return sources.filter((s) => !(s.sacrifices && s.permanentId === victimId));
}

/**
 * The mana sources a CAST's payment may draw on — the dispatcher's own derivation, shared with the target-tax
 * re-check in legalChoices (stage ③ · 44) so a cast offered at its taxed cost and the payment that follows read
 * the same sources.
 * · EMERGE (CR 702.119): the creature sacrificed to emerge can't ALSO tap for mana to pay the reduced cost (the γ1
 *   double-spend guard, matching the offer's affordability check and the activated-ability sac path). Emerge keeps
 *   this stricter always-exclude (a documented conservative FN); plain casts keep every source.
 * · AC-1 (count-of-N sacrifice, CR 601.2f): none of the N frozen `sacCountIds` victims that are ONE-SHOT sources
 *   (Treasure/Gold/Spawn) may also be cracked — the additional-cost loop re-finds each one to sacrifice.
 * · W3 (two-sites invariant): the single chosen victim, if a one-shot source, likewise (PERM_NOT_FOUND on an
 *   offered action otherwise); a repeatable victim still taps first, legally.
 * No emerge and no victims → every source, the same array manaSources returns.
 */
export function castPaymentSources(state, action) {
  let sources = action.emerge && action.sacCreatureId
    ? manaSources(state, action.playerId).filter((s) => s.permanentId !== action.sacCreatureId)
    : manaSources(state, action.playerId);
  if (action.sacCountIds?.length) {
    const sacCountSet = new Set(action.sacCountIds);
    sources = sources.filter((s) => !(s.sacrifices && sacCountSet.has(s.permanentId)));
  }
  // · TEAMWORK (shelf D16): a creature tapped to pay teamwork can't also tap for mana to pay the spell — the emerge
  //   double-spend guard, for the teamwork tap set the cast carries.
  if (action.teamworkTapIds?.length) {
    const tw = new Set(action.teamworkTapIds);
    sources = sources.filter((s) => !tw.has(s.permanentId));
  }
  // · A sacrifice-a-creature source (the Altars) needs a creature the cast's own costs do not already claim.
  sources = withoutUnfeedableSacSources(state, action.playerId, sources, costReservedPermanentIds(action));
  return sourcesExcludingOneShotVictim(sources, action.sacCreatureId);
}

/**
 * THE TAP RECORD — what tapping source record `s` (a manaSources record, or the planner's copy of one) for `color` commits:
 * the mana, the inline `bonus` picks, and every cost rider of the source, so commitManaTap pays the cost the source prints.
 * Built here for BOTH taps — the planner's (planPaymentCore's tapSource) and the explicit one a person takes
 * (manualManaTaps) — so the two can't drift: a rider added to the planner rides the explicit tap too. A mana ability is
 * activated like any ability (CR 602.2b): its whole cost is paid, never part of it (CR 601.2h) — and the explicit tap used to
 * skip every rider but the self-sacrifice.
 *   · painLife — a painland's damage, only for a painful colour (its {C} half is free);
 *   · payLifeCost / extraTaps / sacrificesCreature / exilesGyCard / removesCounters / putsCounter — the printed costs (pay
 *     life, tap other permanents, sacrifice a creature, exile a graveyard card, remove counters, put a counter on);
 *   · sacrifices / fromHand / noTap / doesNotUntapNext — how the source itself pays (sacrificed, exiled from hand, not
 *     tapped — every line with no {T} in its cost, CR 107.5 — skips its next untap step);
 *   · sacrificeIfNoCounters / limitKey — what the ability does as it resolves (a depletion or mining land sacrificed with its
 *     last counter gone) and the per-turn activation ledger entry it stamps;
 *   · uncounterableIfSpent / spentRider — what the mana carries to the cast site.
 * `fixed` (a karoo's / Signet's bundle) only when it names two or more colours, as the planner reads it.
 */
export function tapRecordFor(s, color, bonus = []) {
  const fixed = s.fixed && Object.keys(s.fixed).length > 1 ? s.fixed : null;
  const painHit = Array.isArray(s.painColors) && s.painColors.includes(color) ? (s.painAmount || 0) : 0;
  return { permanentId: s.permanentId, color, amount: s.amount ?? 1, ...(Array.isArray(s.extraTaps) ? { extraTaps: [...s.extraTaps] } : {}), ...(s.payLife != null ? { payLifeCost: s.payLife } : {}), ...(painHit ? { painLife: painHit } : {}), ...(fixed && { fixed: { ...fixed } }), ...(s.sacrifices && { sacrifices: true }), ...(s.exilesGyCard && { exilesGyCard: true }), ...(s.sacrificesCreature && { sacrificesCreature: true }), ...(s.sacrificesFood && { sacrificesFood: true }), ...(s.fromHand && { fromHand: true }), ...(s.removesCounters && { removesCounters: s.removesCounters }), ...(s.sacrificeIfNoCounters && { sacrificeIfNoCounters: true }), ...(s.putsCounter && { putsCounter: { ...s.putsCounter } }), ...(s.limitKey && { limitKey: s.limitKey }), ...(s.noTap && { noTap: true }), /* ③ · 37 + 2026-10-17: every no-{T} line */ ...(s.doesNotUntapNext && { doesNotUntapNext: true }), ...(s.restriction?.uncounterableIfSpent && { uncounterableIfSpent: true }), ...(s.spentRider && { spentRider: s.spentRider }), /* SHELF-85 V11 (Path of Ancestry): the "when that mana is spent" rider rides the tap to the cast site */ ...(s.opponentsGainLife && { opponentsGainLife: s.opponentsGainLife }), ...(s.bundle && { bundle: s.bundle }), /* 2026-10-17, the land lines: Grove of the Burnwillows' opponents' life; a filter land's bundle, the explicit tap's key */ ...(bonus.length && { bonus }) }; // + CAP-CAVERN: the cast site reads uncounterableIfSpent off the taps
}

/**
 * THE EXPLICIT TAP'S OPTIONS — every tap a person may take by hand right now (legalChoices.actionsTapForMana offers them; the
 * dispatcher's applyTapForMana re-derives the one taken from here and commits it, never trusting the action's fields). One
 * per (source, colour), a fixed bundle once, each a tapRecordFor record plus the line's `activationCost`.
 *
 * Read off manaSources — the planner's own records — so every gate the planner applies holds here too, at the one
 * chokepoint: an "Activate only if" condition (Mox Opal, CR 602.5), life the controller can't spare (Mana Confluence), too few
 * untapped permanents to tap (Birchlore Rangers, Springleaf Drum), no creature to sacrifice (Ashnod's Altar), an empty
 * graveyard (Molt Tender), Max speed, a colour set read off the board (Plaza of Heroes, Incubation Druid, Chrome Mox), the
 * activation locks, summoning sickness, granted abilities, multipliers and boosts. The explicit path used to rebuild all of
 * this from manaProduction and dropped the costs — free mana. A planner source is NOT offered by hand when:
 *   · it is a card in hand (a Spirit Guide) or one of a no-{T} remove-a-counter source's per-counter records (Pentad Prism) —
 *     planner-only, as before. Any other no-{T} line (Ashnod's Altar, Kozilek's Translator, Wall of Roots) is offered, tapped or
 *     not, and the dispatcher doesn't tap it;
 *   · its mana is spend-restricted (CR 106.6) or carries a "when that mana is spent" rider: floating mana keeps neither;
 *   · an earlier record of the same permanent already offers that colour (or bundle): the action names a permanent and a colour —
 *     plus a filter land's `bundle` — so each pair is ONE option, the first record making it, and the dispatcher's re-derivation
 *     finds that record alone. A permanent's main record comes first, so its EXTRA lines (Crystal Vein's sacrifice line, Starting
 *     Town's pay-life line, a storage land's counters, Talon Gates' "{1}, {T}: any colour", a filter land's bundles) are offered
 *     for what the plain line beside them can't make (2026-10-17, the land lines — before, only Relic of Legends' tap-other line
 *     was; every other extra line was planner-only);
 *   · it makes nothing right now (Gaea's Cradle with no creatures).
 * An activation cost is left to the caller: the offer requires the floating pool to pay it, the dispatcher charges it.
 */
export function manualManaTaps(state, playerId) {
  const out = [];
  const offered = new Set(); // `${permanentId}:${color}` — the action names only these two, so each pair is ONE option
  for (const s of manaSources(state, playerId)) {
    if (s.fromHand || s.repeatable) continue;
    if (s.restriction || s.spentRider) continue;
    // A PERMANENT'S EXTRA LINE IS OFFERED FOR WHAT NO EARLIER RECORD OF IT OFFERS (2026-10-17 — the land lines). The action names a
    // permanent and a colour (and a bundle, below), and manaSources lists a permanent's main record before its extra lines, so the
    // first record making a colour holds that colour (`offered`) — a costlier line never looks like the free one beside it — and
    // the dispatcher's re-derivation finds that same record. An extra line used to be planner-only (the Relic of Legends slice
    // opened its tap-other line): Talon Gates of Madara's "{1}, {T}: any colour", Phyrexian Tower's sacrifice line, Spire of
    // Industry's and Starting Town's pay-life lines, a Vivid land's charge counter, a Verge's gated colour are now each offered
    // for the colours the plain line beside it can't make, every cost charged (tapRecordFor; an activation cost from the pool).
    // A FILTER LAND'S BUNDLES (`bundle` — "RR", "RW", "WW") are one option each: two share a first colour, so the bundle is the key.
    if (!((s.amount ?? 1) > 0)) continue;
    const fixed = s.fixed && Object.keys(s.fixed).length > 1 ? s.fixed : null;
    for (const color of fixed ? [Object.keys(fixed)[0]] : (s.colors || []).filter((c) => COLOR_SET.has(c))) {
      const key = `${s.permanentId}:${s.bundle || color}`;
      if (offered.has(key)) continue;
      offered.add(key);
      // A bonus makes its own colour (an any-colour boost its first); a sameAsProduced one (Mana Flare) the colour this tap made.
      // A conditional bonus (`whenProduces`, 2026-10-17) only when this tap makes its colour (a fixed bundle: when the bundle holds it).
      const bonus = (s.bonus || [])
        .filter((b) => !b.whenProduces || (fixed ? (fixed[b.whenProduces] || 0) > 0 : b.whenProduces === color))
        .map((b) => ({ color: b.sameAsProduced ? color : b.colors[0], amount: b.amount }));
      out.push({ ...tapRecordFor(s, color, bonus), ...(s.activationCost ? { activationCost: s.activationCost } : {}) });
    }
  }
  return out;
}

// ─── Payment planning ──────────────────────────────────────────────────────────

/**
 * Plan how to pay `cost` from the current `pool` plus tapping `sources`.
 * Returns `{ taps: [{ permanentId, color, amount }], spend: {W,U,B,R,G,C} }`
 * or null when it can't be paid.
 *
 * `spend` is the EXACT per-color amount to remove from the topped-up pool —
 * the dispatcher applies the taps (`addMana`) then subtracts `spend` verbatim.
 * Returning the exact spend (rather than re-deriving payment with a second
 * heuristic) is what guarantees "affordable per planPayment" == "actually
 * paid": there's no algorithm divergence that could strand mana and throw.
 * Surplus from an over-producing source (Sol Ring on a single generic) floats.
 *
 * Greedy: colored pips are paid SCARCEST-COLOR-FIRST (fewest producing sources
 * first) from the most-constrained source, so the sole source of a color isn't
 * wasted on a more-flexible pip. Hybrid pips pay the cheapest colored side;
 * generic is paid last, colorless first (GENERIC_SPEND_ORDER), so the colored
 * mana is what floats; Phyrexian symbols are paid with their mana or 2 life (planWithPhyrexian — mana first); X counts as 0.
 * Pathological multicolor costs
 * fall to "can't afford" (null) — never to fabricated mana.
 */
/**
 * @param spendContext  what this payment is FOR — `{ castCard, isCommander }`. Used to admit
 *   spend-restricted sources (CR 106.6); its `activatingPermanentId` only orders the generic taps (tapAny).
 *
 * ⛔ DEFAULT-DENY, AND IT IS LOAD-BEARING FOR EVERY CALLER I DID NOT TOUCH. A restricted source is dropped
 * unless a context is supplied AND satisfies it, so the ~9 existing call sites that pass no context keep
 * behaving exactly as they did — they simply never see restricted mana. A new call site that forgets to
 * thread context under-pays (a clean MANA_SHORT) instead of silently spending restricted mana on the wrong
 * thing. The unsafe direction requires an explicit, wrong context; the safe direction is the default.
 */
/**
 * ONE-SHOT SOURCES ONLY WHEN THE COST NEEDS THEM (2026-10-16). A source spent for good — it sacrifices itself (a Treasure,
 * an Eldrazi Spawn, Blood Pet, a Sliver under Basal Sliver), sacrifices a creature (Ashnod's Altar) or is a card exiled from
 * hand (Simian Spirit Guide) — pays only when the cost cannot be paid without one. Pass A plans without them; only if it
 * fails does pass B plan with every source, exactly as before, so affordability is pass B's and never moves. Pip by pip
 * cannot do this: Dark Ritual's {B} beside a Swamp and a Sliver under Basal Sliver went to whichever came first on the
 * battlefield, and an equal-flexibility tie-break would still tap the Swamp for Doom Blade's {B} and then sacrifice the
 * Sliver for its {1}, where the Sliver's {B}{B} alone pays both.
 * + LIFE WITH NO TAP (2026-10-17): a no-{T} line that costs life (Treasonous Ogre's "Pay 3 life: Add {R}", Blood Celebrant,
 * Kozilek's Translator) waits for pass B too. It used to be held to one use per untap by the commit wrongly tapping it; once
 * it no longer taps (CR 107.5) nothing else stops it paying life on every payment in board order, ahead of an untapped land.
 * A play policy, never a legality change — pass B still counts it.
 *
 * THE WHOLE-BOARD GENERIC ORDER (2026-10-17 — Nykthos). The generic tap promotes a plain colorless permanent (tapAny), and each
 * planner call judged "plain" from the records it was handed — a subset in every pass that splits the list, so Nykthos, Shrine
 * to Nyx (its devotion line held out of the direct pass) was tapped for one {C} before a land (holdsBack has the list).
 * planPayment now plans twice when a permanent has a plain {C} record beside a line that holds it back:
 *   1. with each call's own judgment, exactly as before — this plan decides affordability, which therefore never moves;
 *   2. counting that line wherever it sits in the whole list (`board`), and returns that plan when it also pays, else plan 1.
 * Plan 2 alone is not a safe planner: the costed pass is greedy, and what the funding call taps decides the colors left for the
 * rest — funding a Signet from a Swamp where a {C} paid before stranded a {B} pip (alone, on 20,000 random boards of real mana
 * cards, it lost 33 payable costs and found 65 the old order misses). A board with no such permanent plans once (both plans are
 * the same there). canAfford runs plan 1 alone.
 */
const isOneShotSource = (s) => !!(s && (s.sacrifices || s.sacrificesCreature || s.sacrificesFood || s.fromHand || (s.noTap && s.payLife != null)));
export function planPayment(pool, sources, cost, spendContext = null) {
  const all = sources || [];
  return planWithPhyrexian(cost, spendContext, (manaCost, base) => {
    const plan = planPaymentPasses(pool, all, manaCost, spendContext, null, base);
    if (!plan || !boardJudgmentCanDiffer(all)) return plan;
    return planPaymentPasses(pool, all, manaCost, spendContext, all, base) ?? plan;
  });
}

/**
 * PHYREXIAN MANA (CR 107.4f, 2026-10-17). Each Phyrexian symbol of a cost (`cost.phyrexian` — "B" for {B/P}, "G/U" for the hybrid
 * Phyrexian {G/U/P}) is paid with one mana of its colour (either colour) OR 2 life. Until this slice the planner skipped them
 * ("assumed paid with life") and no payment charged the life: Dismember cost {1}, Gitaxian Probe nothing.
 * The planner pays them with MANA FIRST: it tries the fewest symbols in life — none, then one, then two … (each set of that size in
 * symbol order) — turning every other symbol into its coloured pip (a hybrid one into a hybrid pip) and planning the rest as any
 * cost; the first plan that pays wins, and `phyrexianLife` on the plan is the life it pays (commitPaymentPlan charges it).
 * The life is a claim of the payment like a pay-life source's (planPaymentCore's `claims`, consumedClaimsPayable): together the
 * payment's life costs must leave at least 1 life — the engine's policy, CR 119.4 allowing payment down to 0 — and none is paid
 * while the life total can't change (CR 119.8). The payer's life comes in `spendContext` (`lifePaymentContext`: `life`,
 * `lifeLocked`); with none, a symbol is paid with its mana only (the safe direction — never a free symbol).
 * `attempt(manaCost, baseClaims)` plans one conversion.
 */
function planWithPhyrexian(cost, spendContext, attempt) {
  const pips = cost?.phyrexian || [];
  if (!pips.length) return attempt(cost, null);
  const life = spendContext?.life;
  const lifeOk = Number.isFinite(life) && !spendContext?.lifeLocked;
  for (let k = 0; k <= (lifeOk ? pips.length : 0); k++) {
    const lifeAmount = k * PHYREXIAN_LIFE_PER_PIP;
    if (k > 0 && !(life > lifeAmount)) break;
    for (const lifeSet of combinationsOf(pips.length, k)) {
      const plan = attempt(phyrexianAsMana(cost, lifeSet), k > 0 ? [{ permanentId: "phyrexian-life", payLife: lifeAmount, lifeAvail: life }] : null);
      if (plan) return k > 0 ? { ...plan, phyrexianLife: lifeAmount } : plan;
    }
  }
  return null;
}
/** Every k-element subset of 0..n-1, as index sets, in lexicographic order. */
function combinationsOf(n, k) {
  const out = [];
  const walk = (start, picked) => {
    if (picked.length === k) { out.push(new Set(picked)); return; }
    for (let i = start; i < n; i++) walk(i + 1, [...picked, i]);
  };
  walk(0, []);
  return out;
}
/** The cost with its Phyrexian symbols paid in mana except those in `lifeSet` (indices): a {B/P} becomes a {B} pip, a {G/U/P} a
 *  {G/U} hybrid pip; the symbols paid with life are gone from it (their life is the plan's base claim). */
function phyrexianAsMana(cost, lifeSet) {
  const next = { ...cost, phyrexian: [], hybrid: [...(cost.hybrid || [])] };
  (cost.phyrexian || []).forEach((p, i) => {
    if (lifeSet.has(i)) return;
    const colors = String(p).split("/").filter((c) => COLOR_SET.has(c));
    if (colors.length === 1) next[colors[0]] = (next[colors[0]] || 0) + 1;
    else if (colors.length > 1) next.hybrid.push(colors);
  });
  return next;
}

/** The payer's life for the Phyrexian life lane (planWithPhyrexian): spread into a payment's `spendContext`. */
export function lifePaymentContext(state, playerId) {
  return { life: state?.players?.[playerId]?.life ?? 0, lifeLocked: playerLifeLocked(state, playerId) };
}
/**
 * The one-shot two-pass above; `board` — null for each call's own judgment, else the list the generic tap judges by.
 * + VICTIM CONTENTION (2026-10-17): the planner passes over a sacrifice source whose victim another source of the same payment
 * already claimed, and the greedy order decides which one claims it — Phyrexian Altar first in board order took the one creature
 * for one mana, and Ashnod's Altar, which makes {C}{C} from the same creature, could no longer pay {2}. So when no plan pays and
 * the list holds such a contention (two sacrifice costs sharing a victim, or a self-sacrificing source that is a victim), the
 * planner tries again without each contended record in turn (once each, never nested) and takes the first plan that pays. A
 * board without contention plans exactly as before; affordability only grows by plans the board can make.
 */
function planPaymentPasses(pool, all, cost, spendContext, board, base = null) {
  const plan = planPaymentPassesOnce(pool, all, cost, spendContext, board, base);
  if (plan) return plan;
  for (const r of victimContention(all, base)) {
    const retry = planPaymentPassesOnce(pool, all.filter((s) => s !== r), cost, spendContext, board, base);
    if (retry) return retry;
  }
  return null;
}
// `base` (every pass below): the payment's claims before any source is tapped — the Phyrexian symbols paid with life (planWithPhyrexian).
function planPaymentPassesOnce(pool, all, cost, spendContext, board, base = null) {
  if (all.some(isOneShotSource)) {
    const kept = planPaymentRemovalAware(pool, all.filter((s) => !isOneShotSource(s)), cost, spendContext, board, base);
    if (kept) return kept;
  }
  return planPaymentRemovalAware(pool, all, cost, spendContext, board, base);
}
/** The records a contention retry may leave out: every sacrifice source and every self-sacrificing victim, when two sacrifice
 *  costs list the same victim or a victim leaves as it pays; every pay-life source, when their life costs together don't fit
 *  (2026-10-17, the follow-up — Boseiju taken first spent 2 of 3 life where two Mana Confluences pay {2} for 2); none otherwise.
 *  (Exile-a-graveyard-card sources need no retry: any card pays any of them, so passing over the one without a card loses nothing.) */
function victimContention(all, base = null) {
  const out = [];
  const pickers = all.filter(picksSacVictim);
  if (pickers.length) {
    const listed = new Map(); // victim id → how many sacrifice records list it
    for (const p of pickers) for (const id of p.sacVictimIds || []) listed.set(id, (listed.get(id) || 0) + 1);
    const eaten = all.filter((s) => leavesAsItPays(s) && listed.has(s.permanentId));
    if ([...listed.values()].some((n) => n > 1) || eaten.length) out.push(...pickers, ...eaten);
  }
  const lifers = all.filter((s) => paysLife(s) && s.lifeAvail != null);
  const baseLife = (base || []).filter((s) => paysLife(s) && s.lifeAvail != null); // + the Phyrexian symbols' life (planWithPhyrexian)
  const budget = [...lifers, ...baseLife];
  if (lifers.length > (baseLife.length ? 0 : 1) && !(Math.min(...budget.map((s) => s.lifeAvail)) > budget.reduce((n, s) => n + s.payLife, 0))) out.push(...lifers);
  return [...new Set(out)];
}
/**
 * STAGE ④-4 — TWO-PASS PLANNING around counter-removal sources. A storage land offers two records on one
 * permanent (its plain tap and its counter-removal line) and the greedy planner tries sources in order:
 * taking the plain tap first would exclude the removal sibling and report a payable {3} as unpayable, while
 * taking the removal first would burn every stored counter to pay a single {C}. So: pass A plans WITHOUT the
 * removal records (the counters are preserved whenever the cost can be met without them); only if that fails
 * does pass B plan with every record, a permanent's larger sibling first. Boards with no removal record take
 * pass A alone — byte-identical to the single-pass planner. A record that PUTS a counter on its source (Wall of Roots' -0/-1,
 * 2026-10-17) waits for pass B too: each one shrinks it for good.
 */
const spendsCounter = (s) => !!(s && (s.removesCounters || s.putsCounter));
function planPaymentRemovalAware(pool, sources, cost, spendContext = null, board = null, base = null) {
  const hasRemoval = (sources || []).some(spendsCounter);
  if (!hasRemoval) return planPaymentOnce(pool, sources, cost, spendContext, board, base);
  const passA = planPaymentOnce(pool, (sources || []).filter((s) => !spendsCounter(s)), cost, spendContext, board, base);
  if (passA) return passA;
  const ordered = [...(sources || [])].sort((a, b) => (a.permanentId === b.permanentId ? (b.amount || 0) - (a.amount || 0) : 0));
  return planPaymentOnce(pool, ordered, cost, spendContext, board, base);
}

/**
 * MANA-COSTED SOURCES (the free-activation fix, 2026-10-01) — a source carrying `activationCost` (a Signet's {1}, a filter
 * land's, Cabal Coffers' {2}) produces only after that cost is paid (CR 602.2b — the costs come first; CR 605.3b — a mana
 * ability resolves as it is activated), and never out of its own output. So:
 *   1. the cost is first tried WITHOUT any costed source — nothing to fund, the common case, exactly the old plan;
 *   2. otherwise the costed sources are activated one at a time, in board order, each FUNDED by the core planner from the
 *      pool, the uncosted sources still untapped and the mana earlier activations made (two Signets chain off one land) —
 *      never from itself — and its output joins the pool; after each activation the whole cost is tried again.
 * The funding rides the plan as `activationSpend`, deducted by commitPaymentPlan beside `spend` and kept OUT of `spend`,
 * which every reader treats as mana spent on the spell (converge, sunburst, the mana-spent riders). The activated source's
 * tap record is built by the core itself (activatedSourceTap), so its riders ride exactly as on any other tap — and the
 * core's own filters decide what can be tapped with no spend context: a spend-restricted source is refused, since its
 * output would join the pool unrestricted (the laundering the core's full-consumption filter prevents) — a safe
 * under-offer. The order is deterministic; a cleverer one could pay a few more costs (FN-safe), never one the board can't.
 */
function addTapMana(pool, tap) {
  const next = { ...pool };
  if (tap.fixed) for (const [c, n] of Object.entries(tap.fixed)) next[c] = (next[c] || 0) + n;
  else next[tap.color] = (next[tap.color] || 0) + (tap.amount ?? 1);
  for (const b of tap.bonus || []) next[b.color] = (next[b.color] || 0) + b.amount;
  return next;
}
/** The tap record of an activated costed source, built by the core from the source alone (an empty pool, one pip of the colour
 *  the cost still needs most) — so every rider rides as on any tap; null when the core won't tap it with no spend context. */
function activatedSourceTap(s, cost, curPool, claims = null) {
  const colors = (s.colors || []).filter((c) => COLOR_SET.has(c));
  const want = colors.find((c) => (cost?.[c] || 0) > (curPool[c] || 0)) || colors[0];
  return want ? planPaymentCore(null, [s], { [want]: 1 }, null, null, claims)?.taps?.[0] ?? null : null;
}
/**
 * Pay a mana-costed source's activation out of the FLOATING POOL alone — the explicit tap (a manual mana ability: no auto-tap
 * of other sources here, the player floats first): coloured pips, then hybrid, then generic (colourless first). Returns the
 * pool after the payment, or null when it can't be paid (or the cost can't be priced). Pure.
 */
export function payActivationFromPool(pool, cost) {
  if (!cost || cost.unpayable) return null;
  const p = {};
  for (const c of MANA_COLORS) p[c] = pool?.[c] || 0;
  for (const c of ["W", "U", "B", "R", "G", "C"]) {
    if ((cost[c] || 0) > p[c]) return null;
    p[c] -= cost[c] || 0;
  }
  for (const opts of cost.hybrid || []) {
    const c = opts.find((o) => p[o] > 0);
    if (!c) return null;
    p[c] -= 1;
  }
  let g = cost.generic || 0;
  for (const c of GENERIC_SPEND_ORDER) { const take = Math.min(p[c], g); p[c] -= take; g -= take; }
  return g > 0 ? null : p;
}
/**
 * THE ORDERS THE COSTED SOURCES ARE TRIED IN (2026-10-17 — Nykthos): board order, as before, except that one permanent's several
 * costed records — alternatives sharing its one {T} (Nykthos' five devotion records, one per colour) — are tried best first: a
 * record making a colour the cost has pips of, then the larger amount. Only one record per permanent is ever activated (the
 * loop's `spent`), and the first one the core will tap is the one taken, so in board order Nykthos made one blue (devotion 1)
 * for a cost of four green. When that order pays nothing, each other alternative of such a permanent is tried first in turn
 * (one more greedy pass per alternative — Nykthos' blue for {U}{G} beside three green devotion), so every plan found is one the
 * board makes. A permanent with one costed record (a Signet, Cabal Coffers, Three Tree City) keeps its place, and a board
 * without such a permanent runs the single pass it always did.
 */
function costedActivationOrders(all, cost) {
  const groups = new Map();
  for (const s of all) {
    if (!s?.activationCost) continue;
    if (!groups.has(s.permanentId)) groups.set(s.permanentId, []);
    groups.get(s.permanentId).push(s);
  }
  const needs = (s) => ((s.colors || []).some((c) => c !== "C" && (cost?.[c] || 0) > 0) ? 1 : 0);
  // (A filter land's three bundles — 2026-10-17 — are such alternatives: each is tried first in turn below, so the bundle a payment
  // needs is found whichever is tried first.)
  for (const [id, g] of groups) if (g.length > 1) groups.set(id, [...g].sort((a, b) => (needs(b) - needs(a)) || ((b.amount ?? 1) - (a.amount ?? 1))));
  // Each permanent's records keep the slots they had in board order; only who fills them changes.
  const fill = (byId) => {
    const next = new Map([...byId.keys()].map((id) => [id, 0]));
    return all.filter((s) => s?.activationCost).map((s) => { const i = next.get(s.permanentId); next.set(s.permanentId, i + 1); return byId.get(s.permanentId)[i]; });
  };
  const orders = [fill(groups)];
  for (const [id, g] of groups) {
    for (let k = 1; k < g.length; k++) orders.push(fill(new Map([...groups, [id, [g[k], ...g.filter((_, j) => j !== k)]]])));
  }
  return orders;
}
function planPaymentOnce(pool, sources, cost, spendContext = null, board = null, base = null) {
  const all = sources || [];
  const claims = () => (base ? [...base] : null); // each call starts from the payment's own base claims (planPaymentCore appends)
  if (!all.some((s) => s?.activationCost)) return planPaymentCore(pool, all, cost, spendContext, board, claims());
  const free = all.filter((s) => !s?.activationCost);
  const direct = planPaymentCore(pool, free, cost, spendContext, board, claims());
  if (direct || !cost) return direct;
  for (const order of costedActivationOrders(all, cost)) {
    const plan = activateCostedInOrder(pool, free, order, cost, spendContext, board, base);
    if (plan) return plan;
  }
  return null;
}
function activateCostedInOrder(pool, free, order, cost, spendContext, board, base = null) {
  let curPool = {};
  for (const c of MANA_COLORS) curPool[c] = pool?.[c] || 0;
  let remaining = free;
  const preTaps = [];
  const activationSpend = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  const spent = new Set();
  // 2026-10-17 — the sacrifices this payment's earlier calls planned (each call appends its own on success): an Altar that funds a
  // Signet and a second Altar in the rest call can't both take the one creature (planPaymentCore's `claims`). It starts from the
  // payment's base claims (the Phyrexian symbols paid with life).
  const claims = [...(base || [])];
  for (const s of order) {
    if (!s?.activationCost || spent.has(s.permanentId)) continue; // (an unpriceable cost never reaches here — manaSources drops that record)
    if (!activatedSourceTap(s, cost, curPool, [...claims])) continue; // the core won't tap it (restricted / produces nothing / no victim left) — don't fund it
    const fund = planPaymentCore(curPool, remaining.filter((r) => r.permanentId !== s.permanentId), s.activationCost, null, board, claims);
    if (!fund) continue;
    for (const tap of fund.taps) curPool = addTapMana(curPool, tap);
    for (const c of MANA_COLORS) { curPool[c] -= fund.spend[c] || 0; activationSpend[c] += fund.spend[c] || 0; }
    const tap = activatedSourceTap(s, cost, curPool, claims);
    if (!tap) return null; // its funding took the victim its own cost needed — this order pays nothing (no costed source sacrifices another today)
    curPool = addTapMana(curPool, tap);
    preTaps.push(...fund.taps, tap);
    const gone = new Set([s.permanentId, ...fund.taps.map((x) => x.permanentId)]);
    for (const id of gone) spent.add(id);
    remaining = remaining.filter((r) => !gone.has(r.permanentId));
    const rest = planPaymentCore(curPool, remaining, cost, spendContext, board, claims);
    if (rest) return { ...rest, taps: [...preTaps, ...rest.taps], activationSpend };
  }
  return null;
}

// The fields of a planner source record (plannerSourceRecord) that are not riders — see isPlainColorless.
const PLAIN_TAP_FIELDS = new Set(["permanentId", "colors", "amount", "bonus", "used"]);

/** planPaymentCore's working record for one source (its `avail`): every field the plan and the committer read, a rider's
 *  absence spelled out (null / false / 0). The whitelist above and isPlainColorless read these records. */
function plannerSourceRecord(s) {
  return {
    permanentId: s.permanentId,
    colors: s.colors.filter(c => COLOR_SET.has(c)),
    amount: s.amount ?? 1,
    sacrifices: !!s.sacrifices,   // one-shot source (Treasure/Gold) — the commit path sacrifices it
    // AURA-LAND-MANA-BOOST: extra mana produced INLINE when this source (a land) taps — each entry
    // {colors, amount}. Credited on tap; the bonus is part of the land tap, never a separate tap.
    // MANA FLARE (MF-1): a sameAsProduced bonus keeps its marker — tapSource binds its color to the
    // PRIMARY's chosen color (the type this tap produced), never an independent pick (CREED, off-type FP).
    // + a CONDITIONAL bonus (`whenProduces`, 2026-10-17 — Forsaken Monument, Caged Sun) keeps its colour: tapSource credits it only
    //   when the tap's own mana is that colour. One whose colour the record can't make is dropped here too (a hand-built record).
    bonus: Array.isArray(s.bonus) ? s.bonus.map(b => ({ colors: b.colors.filter(c => COLOR_SET.has(c)), amount: b.amount, ...(b.sameAsProduced && { sameAsProduced: true }), ...(b.whenProduces && { whenProduces: b.whenProduces }) }))
      .filter(b => b.amount > 0 && b.colors.length && (!b.whenProduces || (s.fixed && Object.keys(s.fixed).length > 1 ? (s.fixed[b.whenProduces] || 0) > 0 : (s.colors || []).includes(b.whenProduces)))) : [],
    snow: !!s.snow,   // SNOW (SN-1): a source produced by a snow permanent — the only kind that can pay a {S} pip
    // SPEND-RESTRICTED (CR 106.6): the permission this source's mana carries. Filtered out entirely in planPaymentCore
    // unless the caller supplied a spend context that satisfies it — see the DEFAULT-DENY note.
    restriction: s.restriction || null,
    // TAP-OTHER payers, resolved by manaSources against the live board. Carried verbatim so the plan the
    // committer executes is the plan the planner priced — the same "affordable == actually paid" invariant
    // the fixed-bundle and painland fields exist to hold.
    extraTaps: Array.isArray(s.extraTaps) ? [...s.extraTaps] : null,
    payLife: s.payLife ?? null,
    spentRider: s.spentRider ?? null, // SHELF-85 V11 (Path of Ancestry): the "when that mana is spent" rider rides the tap to the cast site
    // PAINLAND: the colours that cost life, and how much. Carried so tapSource can stamp the tap.
    painColors: Array.isArray(s.painColors) ? s.painColors : null,
    painAmount: s.painAmount || 0,
    // MIXED FIXED BUNDLE (karoo / signet): a per-color tally this source produces SIMULTANEOUSLY. When
    // present it REPLACES the primary component's "pick one color × amount" — see tapSource.
    fixed: s.fixed && Object.keys(s.fixed).length > 1 ? { ...s.fixed } : null,
    // COST RIDERS carried into the plan so the committer pays what the planner priced (SG-3, 2026-09-03):
    // the sacrifice-a-creature cost (the Altars) and — found while wiring it — the exile-from-graveyard
    // cost (Molt Tender), which the direct tap action carried but this planned path silently dropped
    // (a planned Molt Tender tap exiled nothing; now it does).
    sacrificesCreature: !!s.sacrificesCreature,
    sacrificesFood: !!s.sacrificesFood, // play-weighted #803 — Gilded Goose's Food, sacrificed by the commit
    // 2026-10-17 — the permanents that can feed that sacrifice (manaSources' `sacVictimIds`): the planner's claims give each
    // sacrifice cost of one payment its own (assignSacVictims). A sacrificing record without the list has no victim it can claim.
    sacVictimIds: picksSacVictim(s) ? (Array.isArray(s.sacVictimIds) ? [...s.sacVictimIds] : []) : null,
    exilesGyCard: !!s.exilesGyCard,
    // 2026-10-17 (the follow-up) — the graveyard cards that exile cost may take (`gyExileIds`; none known → none claimable) and the
    // life a pay-life line is paid from (`lifeAvail`): the planner's claims hold both, as they hold the sacrifice victims.
    gyExileIds: s.exilesGyCard ? (Array.isArray(s.gyExileIds) ? [...s.gyExileIds] : []) : null,
    lifeAvail: s.payLife != null && s.lifeAvail != null ? s.lifeAvail : null,
    fromHand: !!s.fromHand, // SG-6 — the source is a HAND card; the committer exiles it instead of tapping
    removesCounters: s.removesCounters || null, // STAGE ④-4 — the counters this tap removes (the commit removes exactly these)
    doesNotUntapNext: !!s.doesNotUntapNext, // STAGE ④-5 — the tapped land skips its controller's next untap step
    staysTapped: !!s.staysTapped, // the permanent doesn't untap in its untap step at all (Mana Vault) — read by tapAny only
    repeatable: !!s.repeatable, // STAGE ③ · 37 — one of several separate activations of a no-{T} remove-a-counter source
    noTap: !!s.noTap,           // STAGE ③ · 37 — the commit doesn't tap it (its cost is the counter); 2026-10-17 — every line with no {T}
    putsCounter: s.putsCounter || null,             // 2026-10-17 — Wall of Roots' -0/-1 counter, put on by the commit
    sacrificeIfNoCounters: !!s.sacrificeIfNoCounters, // 2026-10-17 — a depletion / mining land's last counter sacrifices it
    limitKey: s.limitKey || null,                   // 2026-10-17 — the per-turn activation ledger entry the commit stamps
    opponentsGainLife: s.opponentsGainLife || 0,     // 2026-10-17 (the land lines) — Grove of the Burnwillows: each opponent gains this much as the tap resolves
    bundle: s.bundle || null,                       // 2026-10-17 (the land lines) — a filter land's bundle (the explicit tap's key; the commit reads `fixed`)
    used: false,
  };
}

// A PLAIN COLORLESS record (a plannerSourceRecord): colorless mana and nothing else, at no cost beyond the tap. Any other field set
// on the record is a rider — life, a sacrifice, an exile, counters, a skipped untap (staysTapped: Mana Vault, the Monoliths),
// tapping others, a spend restriction, snow (its mana also pays {S}, CR 107.4h) — and keeps it out, a rider added later
// included: a new field costs a source its promotion (the old board order), never promotes one.
function isPlainColorless(s) {
  if (!s.colors.every((c) => c === "C") || !s.bonus.every((b) => b.colors.every((c) => c === "C"))) return false;
  for (const k in s) if (!PLAIN_TAP_FIELDS.has(k) && s[k] != null && s[k] !== false && s[k] !== 0) return false;
  return true;
}

// A source record (manaSources' or the planner's own) that is plain colorless and not behind an activation cost (a cost beyond the tap).
const isPlainRecord = (s) => !s.activationCost && isPlainColorless(plannerSourceRecord(s));

/** THE PERMANENTS THE GENERIC TAP PROMOTES (tapAny): permanentId → true when EVERY record the permanent has in `records` is plain. */
function plainColorlessPermanents(records) {
  const plain = new Map();
  for (const s of records) plain.set(s.permanentId, (plain.get(s.permanentId) ?? true) && isPlainRecord(s));
  return plain;
}
/**
 * A LINE THAT HOLDS ITS PERMANENT BACK FROM THE PROMOTION wherever it sits in the board (2026-10-17 — Nykthos): any record that is
 * not plain, except a spend-restricted one. planPaymentCore judges the records it was handed, and those are a subset in every
 * pass that splits the list: planPaymentOnce's direct pass and activateCostedInOrder's funding and rest calls see only the records
 * without an activation cost, planPayment's pass A holds out the one-shot records, planPaymentRemovalAware's pass A the counter
 * records. Judged on the subset, Nykthos, Shrine to Nyx ("{T}: Add {C}." beside its "{2}, {T}:" devotion line) looked like Wastes
 * and spent its tap on one {C} for generic before any land (measured by the Omnath self-play lane on its deck); so did Three Tree
 * City, the filter lands and the "{1}, {T}: Add one mana of any color" lands, Crystal Vein, Phyrexian Tower and a storage land
 * holding counters. In planPayment's plan 2 such a line anywhere on the board keeps its permanent in board order, as Mogg Hollows
 * always did. A SPEND-RESTRICTED line is not one: it counts only when this payment may spend it (the core keeps it then), as
 * 3d121554 judged it — Eldrazi Temple keeps its place paying for an Eldrazi and goes first for anything else. Its mana pays a
 * narrow set of spells where a basic's color pays any; whether it should hold Cavern of Souls or Eldrazi Temple back too is a
 * play question left open (RUN-LEDGER 2026-10-17). Records only: a line that makes nothing has no record (Nykthos at devotion 0
 * offers just its {C}), so that permanent is still promoted.
 */
const holdsBack = (s) => !s.restriction && !isPlainRecord(s);
/** Can planPayment's two plans differ on this list? Only through a permanent with a plain record AND a line that holds it back. */
function boardJudgmentCanDiffer(board) {
  const plain = new Set(), held = new Set();
  for (const s of board) {
    if (isPlainRecord(s)) plain.add(s.permanentId);
    else if (holdsBack(s)) held.add(s.permanentId);
  }
  for (const id of plain) if (held.has(id)) return true;
  return false;
}

/** `board` — null: the generic tap judges by this call's own records; else also by every line of the whole list (planPayment's plan 2).
 *  `claims` — null, or the planner records an earlier call of the SAME payment already tapped (activateCostedInOrder's funding and
 *  rest calls): this call's sacrifice costs and self-sacrifices must fit beside theirs (assignSacVictims), and on success this
 *  call's own records are appended to it, so the next call sees them too. */
function planPaymentCore(pool, sources, cost, spendContext = null, board = null, claims = null) {
  const spend = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  if (!cost) return { taps: [], spend };

  // ⭐ POOL-RESTRICTED SUB-POOL (QUARTET Phase 4 core, 2026-08-15 — CR 106.6 on TRIGGER-GRANTED mana:
  // Klauth's "add X … Spend this mana only to cast spells"). The per-color pool cannot carry a
  // restriction (the laundering hazard the source-filter's full-consumption condition documents), so
  // restricted mana lives in TAGGED ENTRIES (player.restrictedMana — threaded here as
  // spendContext.restrictedEntries; the default-deny posture holds: no context ⇒ no entries seen).
  // A PRE-PASS spends qualifying entries FIRST (restricted-first — never strand restricted mana when a
  // legal spend exists), colored pips then generic; the remainder STAYS TAGGED in its entry (partial
  // spends can't launder — unlike source surplus, which floats untagged and so keeps its
  // full-consumption guard unchanged). Hybrid pips are deliberately NOT entry-payable (conservative —
  // a rare planner null where a cleverer order could pay, FN-safe). The plan carries `entrySpends` so
  // commitPaymentPlan deducts the EXACT amounts from the EXACT entries — the same
  // "affordable == actually paid" invariant the taps hold.
  const entrySpends = [];
  const rEntries = (spendContext?.restrictedEntries || [])
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e && spendRestrictionAllows(e.restriction, spendContext?.castCard, { isCommander: !!spendContext?.isCommander, activatingIsCreature: spendContext?.activatingIsCreature === true, activatingTypeLine: spendContext?.activatingTypeLine || null, activatingColors: spendContext?.activatingColors ?? null, castEvery: spendContext?.castEvery === true }));
  if (rEntries.length) {
    let effCost = { ...cost };
    for (const { e, i } of rEntries) {
      const es = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
      let any = false;
      for (const c of MANA_COLORS) { // colored pips first — the entry's exact colors
        const take = Math.min(e.pool?.[c] || 0, effCost[c] || 0);
        if (take > 0) { es[c] += take; effCost = { ...effCost, [c]: effCost[c] - take }; any = true; }
      }
      for (const c of GENERIC_SPEND_ORDER) { // then generic from what's left in the entry — its colorless first
        const left = (e.pool?.[c] || 0) - es[c];
        const take = Math.min(left, effCost.generic || 0);
        if (take > 0) { es[c] += take; effCost = { ...effCost, generic: effCost.generic - take }; any = true; }
      }
      if (any) entrySpends.push({ entry: i, spend: es });
    }
    cost = effCost; // the greedy below pays only what the entries could not
  }

  const working = {};
  for (const c of MANA_COLORS) working[c] = pool?.[c] || 0;

  // `amount ?? 1` (NOT `|| 1`, plannerSourceRecord): a hand-built source with NO amount field defaults to 1 (the legacy
  // contract), but a resolved variable source with an explicit amount of 0 (Gaea's Cradle / Sanctum
  // Weaver on an empty board) must NOT be floored UP to 1 — that would fabricate mana (MANA-VARIABLE
  // CREED). A non-positive source produces nothing right now, so drop it from the payable set.
  const avail = sources
    .map(plannerSourceRecord)
    .filter(s => s.amount > 0)
    // ⛔ SPEND-RESTRICTED FILTER (CR 106.6). Two conditions, both required:
    //   1. the spend context satisfies the printed permission (default-deny — no context means no);
    //   2. ⭐ the source's ENTIRE output is consumed by this cost.
    // Condition 2 is the one that is easy to miss and fatal to omit. Surplus from an over-producing source
    // FLOATS into the mana pool (documented at the tap loop below), and pool mana carries NO restriction tag —
    // so a 3-mana restricted source spent on a 1-mana creature spell would leave 2 GENERAL-PURPOSE mana
    // behind, laundering the restriction away in a single tap. Requiring full consumption makes that
    // unreachable without teaching the pool about restrictions, which is a much larger change.
    // The bound is the cost's total pip count: generic + colored + hybrid.
    .filter(s => {
      if (!s.restriction) return true;
      if (!spendRestrictionAllows(s.restriction, spendContext?.castCard, { isCommander: !!spendContext?.isCommander, activatingIsCreature: spendContext?.activatingIsCreature === true, activatingTypeLine: spendContext?.activatingTypeLine || null, activatingColors: spendContext?.activatingColors ?? null, castEvery: spendContext?.castEvery === true })) return false;
      const totalPips = (cost.generic || 0)
        + MANA_COLORS.reduce((n, col) => n + (cost[col] || 0), 0)
        + (Array.isArray(cost.hybrid) ? cost.hybrid.length : 0);
      return s.amount <= totalPips;
    });
  const taps = [];
  const spendOne = (color) => { working[color] -= 1; spend[color] += 1; };

  // ONE VICTIM PER SACRIFICE COST (2026-10-17). `mine` — the records this call taps that sacrifice another permanent or leave as
  // they pay. A source is tapped only if every sacrifice cost of the payment so far (the earlier calls' `claims`, `mine`, and it)
  // can still be paid with its own victim: the second Altar beside one creature, an Eldrazi Spawn that is the Altar's only
  // victim, Gilded Goose's only Food claimed twice — each is passed over, never planned for mana its cost can't pay.
  // + the follow-up: a graveyard card per exile cost (the second Molt Tender beside one card) and the payment's life costs together
  // (the second Treasonous Ogre at 4 life) are claims of the same kind.
  const mine = [];
  // THE RESTRICTED MANA THIS CALL MAKES (2026-10-17 — Throne of Eldraine): each spend-restricted tap's own mana and its restriction,
  // so the part the payment leaves unspent keeps the restriction (restrictedSurplus, below). A bonus riding the tap is another
  // ability's mana (a triggered mana ability, CR 605.1b) and carries no restriction.
  const restrictedMade = [];
  const victimsHold = (s) => {
    if (!claimsResource(s) && !leavesAsItPays(s)) return true;
    const all = [...(claims || []), ...mine, s];
    return !all.some(claimsResource) || consumedClaimsPayable(all);
  };

  // AURA-LAND-MANA-BOOST: a source's full producible-color set = its OWN colors ∪ every boost-Aura
  // bonus's colors (the bonus mana appears INLINE when the land taps, CR 605.1b). So a Forest carrying
  // Fertile Ground ("additional one mana of any color") can satisfy an OFF-color pip via the bonus,
  // even though the Forest's own mana is only {G}. A bonus is never independently tappable — it rides
  // on the same land tap, so the colors merge per-SOURCE here, not as a separate source.
  const sourceCanMake = (s, color) =>
    s.colors.includes(color) || s.bonus.some(b => b.colors.includes(color));

  // Tap a source, assigning `wantColor` (if given) from whichever component can make it, then crediting
  // every other component greedily to a STILL-NEEDED color (cost minus spend minus working), else its
  // first color. Records the chosen primary `color` + `bonus` picks on the tap so the commit path
  // (commitPaymentPlan / commitManaTap) adds the identical mana — no planner/commit divergence. Returns
  // the assigned `wantColor` (or the primary's chosen color for a generic tap). Every choice is a legal
  // mana the source genuinely produces — never fabricated; surplus floats.
  const tapSource = (s, wantColor) => {
    s.used = true;
    if (claimsResource(s) || leavesAsItPays(s)) mine.push(s);
    // STAGE ④-3: a permanent's OTHER mana-line records are the same {T} — one tap, one line (CR 605.3a). Mark
    // every sibling record of this permanent used so the planner can never tap it twice through two lines.
    // + STAGE ③ · 37: records that are each their own ACTIVATION (a no-{T} remove-a-counter source — one record per counter)
    // don't exclude one another; nothing here is a shared {T}.
    // + 2026-10-17 (Relic of Legends): a record with NO {T} (`noTap`) doesn't share its permanent's {T} either — Relic's {T} line and
    // its tap-a-legend line are two activations, two mana — unless one of the two sacrifices the permanent (the other could no
    // longer follow it).
    // ⛔ AND A PERMANENT THIS TAP TAPS IS TAPPED ONCE (CR 107.5, 118.3). The permanents it taps are its source (unless the line has
    // no {T}) and its tap-other payers (`extraTaps`); afterwards none of them can pay a {T} record of its own or be another
    // record's payer. Before this, Springleaf Drum beside a lone Llanowar Elves paid {2}: the Elves tapped for {G} AND as the
    // Drum's payer — mana a board can't make. (manaSources resolves each record's payers against the untapped board alone;
    // only the plan sees two records claim one permanent.)
    const tappedNow = new Set([...(s.noTap || s.fromHand ? [] : [s.permanentId]), ...(s.extraTaps || [])]);
    for (const o of avail) {
      if (o === s || o.used) continue;
      const sameTap = o.permanentId === s.permanentId && !o.fromHand && !s.fromHand && !(o.repeatable && s.repeatable)
        && ((!o.noTap && !s.noTap) || o.sacrifices || s.sacrifices);
      if (sameTap
        || (!o.noTap && !o.fromHand && tappedNow.has(o.permanentId))
        || (o.extraTaps || []).some((id) => tappedNow.has(id))) o.used = true;
    }
    // Components: the primary land mana (one chosen color from s.colors) + each bonus entry.
    const components = [{ colors: s.colors, amount: s.amount, primary: true }, ...s.bonus.map(b => ({ colors: b.colors, amount: b.amount, primary: false, sameAsProduced: !!b.sameAsProduced, whenProduces: b.whenProduces || null }))];
    let primaryColor = null;
    const bonusPicks = [];
    let assigned = false;
    // A FIXED BONUS THAT MAKES THE WANTED COLOUR (2026-10-17 — Breeding Pool under High Tide or Vernal Bloom paying {G}{U}): when a
    // bonus of fixed colours can make `wantColor` and the source's own mana can make another colour the cost still needs, the bonus
    // takes `wantColor` and the primary that other colour — one tap, both pips. Taking `wantColor` with the primary left the bonus a
    // second {U} and the {G} unpaid (a false "can't afford"). A conditional or same-type bonus follows the primary and can't do this.
    const stillNeeded = (c) => (cost[c] || 0) - (spend[c] || 0) - (working[c] || 0) > 0;
    const bonusTakesWant = !!wantColor && !s.fixed
      && s.bonus.some((b) => !b.sameAsProduced && !b.whenProduces && b.colors.includes(wantColor))
      && s.colors.some((c) => c !== wantColor && stillNeeded(c));
    const pickColor = (comp) => {
      // If we still owe `wantColor` and this component can make it, spend it there first.
      if (!assigned && wantColor && comp.colors.includes(wantColor) && !(comp.primary && bonusTakesWant)) { assigned = true; return wantColor; }
      if (comp.primary && bonusTakesWant) return comp.colors.find((c) => c !== wantColor && stillNeeded(c));
      // Else prefer a color the cost STILL needs (helps later pips), else the component's first color.
      const needed = comp.colors.find(c => (cost[c] || 0) - (spend[c] || 0) - (working[c] || 0) > 0);
      if (needed) return needed;
      // Nothing owed in a colour (a generic tap): the source's own mana takes a colour that makes a conditional extra mana
      // (2026-10-17 — Breeding Pool under a green Caged Sun taps for {G}{G}, not a bare {U}). A source with no such bonus is unchanged.
      if (comp.primary) {
        const boosted = comp.colors.find((c) => s.bonus.some((b) => b.whenProduces === c));
        if (boosted) return boosted;
      }
      return comp.colors[0];
    };
    for (const comp of components) {
      // MIXED FIXED BUNDLE (karoo / signet): the primary component is NOT a color choice — it produces its
      // exact tally, all colors at once. Credit each and skip pickColor entirely. `primaryColor` is set to the
      // bundle's first color purely so a sameAsProduced bonus (Mana Flare on a karoo) has a legal type this
      // source genuinely produced to bind to — the bundle itself is never re-added through it.
      if (comp.primary && s.fixed) {
        for (const [c, n] of Object.entries(s.fixed)) working[c] += n;
        if (wantColor && s.fixed[wantColor] > 0) assigned = true;
        primaryColor = Object.keys(s.fixed)[0];
        continue;
      }
      // A CONDITIONAL bonus (`whenProduces`, 2026-10-17): added only when THIS tap's own mana included its colour — the primary's
      // chosen colour, or a fixed bundle holding it (Caged Sun: "causes you to add one or more mana of the chosen color"; Forsaken
      // Monument's ruling: "only if it produces one or more {C}"). Otherwise the trigger never happened: nothing is credited or
      // committed. The primary component comes first, so its colour is known here.
      if (comp.whenProduces) {
        const made = s.fixed ? (s.fixed[comp.whenProduces] || 0) > 0 : primaryColor === comp.whenProduces;
        if (!made) continue;
        working[comp.whenProduces] += comp.amount;
        bonusPicks.push({ color: comp.whenProduces, amount: comp.amount });
        continue;
      }
      // MANA FLARE (MF-1, CR 106.1b): a sameAsProduced bonus is "one mana of any type THAT LAND PRODUCED" — its
      // color IS the primary's chosen color (the primary component is first, so primaryColor is already set),
      // NEVER an independent pick: one Adarkar Wastes tap under Mana Flare makes WW or UU, never W+U (CREED).
      const color = comp.sameAsProduced ? primaryColor : pickColor(comp);
      working[color] += comp.amount;
      if (comp.primary) primaryColor = color;
      else bonusPicks.push({ color, amount: comp.amount });
    }
    // The commit record (every cost rider of the source) is built by tapRecordFor — the one builder the explicit tap shares.
    taps.push(tapRecordFor(s, primaryColor, bonusPicks));
    if (s.restriction) restrictedMade.push({ restriction: s.restriction, made: s.fixed ? { ...s.fixed } : { [primaryColor]: s.amount } });
    return wantColor && assigned ? wantColor : primaryColor;
  };

  // Tap the most-constrained untapped source that can make `color` (via own mana OR a boost-Aura bonus).
  const tapForColor = (color) => {
    let best = -1;
    let bestLen = Infinity;
    for (let i = 0; i < avail.length; i++) {
      const s = avail[i];
      if (s.used || !sourceCanMake(s, color) || !victimsHold(s)) continue;
      // Constraint = how many distinct colors this source can make (own ∪ bonus); the least-flexible wins.
      const flex = new Set([...s.colors, ...s.bonus.flatMap(b => b.colors)]).size;
      if (flex < bestLen) { bestLen = flex; best = i; }
    }
    if (best === -1) return false;
    tapSource(avail[best], color);
    return true;
  };

  let plainIds = null; // permanentId → promoted (plainColorlessPermanents, and in plan 2 holdsBack over `board`), built on the first generic tap

  // Tap a source for GENERIC, `owed` still unpaid. Returns a color it produced. A play-quality order, never a legality
  // change (any mana pays generic, CR 107.4b):
  //   1. a PLAIN COLORLESS PERMANENT first (Sol Ring, Mind Stone, Wastes) — the source-side twin of GENERIC_SPEND_ORDER.
  //      Colorless mana pays generic and little else (a {C} pip, CR 107.4c), so spending it keeps the colored sources
  //      untapped for a colored pip later. In board order, Purphoros's {2}{R} beside Mountain, Mountain, Mountain,
  //      Sol Ring tapped all three Mountains and left a Lightning Bolt uncastable (measured 2026-10-16). EVERY record of
  //      the permanent must be plain colorless (this call's records; in planPayment's plan 2 also every line holdsBack finds
  //      on the board): a colored second line (Mogg Hollows), a costed line (Nykthos' devotion, Three Tree City, a filter
  //      land), a sacrifice line (Crystal Vein), a spend-restricted line this payment may spend (Eldrazi Temple, for an
  //      Eldrazi) or a storage land's counter line keeps the whole permanent where it was. Among them, the SMALLEST THAT COVERS what is still owed (Mind Stone for a {1}, Sol Ring
  //      for a {2}); if none covers it, board order. Not "least surplus": every source smaller than `owed` has none, so a
  //      {2} beside Wastes and Thran Dynamo took the Wastes, still needed the Dynamo and floated two — the Dynamo alone
  //      floats one. Never the permanent whose own ability this pays for (spendContext.activatingPermanentId):
  //      Mutavault paying its own {1} would animate tapped, so it keeps its board place. One still goes first when it
  //      OVER-produces (Sol Ring for a lone {1}): the surplus floats to the end of the step (CR 106.4) and the next
  //      payment spends it first, so within the step the colored source kept untapped pays everything the rock would
  //      have, and a colored pip besides. It loses only when the surplus goes unspent AND a later step wants more mana
  //      than color — the planner sees the cost, not the hand.
  //   2. then any other REPEATABLE source, board order;
  //   3. then a one-shot sacrifice source (Treasure/Gold) — never crack a Treasure while an untapped land/rock could pay.
  const tapAny = (owed) => {
    if (!plainIds) {
      plainIds = plainColorlessPermanents(avail);
      if (board) for (const s of board) if (holdsBack(s)) plainIds.set(s.permanentId, false); // plan 2: a line this pass holds out still counts
    }
    let first = null;
    let cover = null;
    let coverMade = Infinity;
    for (const s of avail) {
      if (s.used || s.colors.length === 0 || !plainIds.get(s.permanentId) || s.permanentId === spendContext?.activatingPermanentId) continue;
      const made = s.amount + s.bonus.reduce((n, b) => n + b.amount, 0);
      if (!first) first = s;
      if (made >= owed && made < coverMade) { cover = s; coverMade = made; }
    }
    let best = cover || first;
    // ONE PERMANENT, SEVERAL PLAIN COLORLESS LINES (2026-10-17 — Urza's Workshop: "{T}: Add {C}." and, with metalcraft, "{T}: Add
    // {C} for each Urza's land you control"): its records share its one {T}, so when nothing covers what is owed and board order
    // reaches it, it taps its biggest line — the first record would spend the tap on one {C} and strand the rest.
    if (!cover && first) {
      for (const o of avail) {
        if (!o.used && o !== best && o.permanentId === first.permanentId && o.colors.length && o.amount + o.bonus.reduce((n, b) => n + b.amount, 0) > best.amount + best.bonus.reduce((n, b) => n + b.amount, 0)) best = o;
      }
    }
    if (best) return tapSource(best, null);
    for (const preferSac of [false, true]) {
      for (const s of avail) {
        if (s.used || s.colors.length === 0 || !!s.sacrifices !== preferSac || !victimsHold(s)) continue;
        return tapSource(s, null);
      }
    }
    return null;
  };

  // 0. SNOW pips ({S}, CR 107.4h / 106.3): each {S} must be paid with ONE mana from a snow source. Snow is
  // STRICTLY the most-constrained requirement (only snow-stamped sources qualify), so it is satisfied FIRST —
  // tapping the LEAST color-flexible snow source (fewest distinct colors) so a snow dual stays free for a
  // colored pip below. The tapped source's mana enters `working`; one unit is spent on the {S} pip (surplus
  // floats). No untapped snow source ⇒ the whole cost is unaffordable (null) — a {S} is NEVER fake-paid from
  // non-snow mana (THE CREED forbidden FP). Pool mana carries no snow provenance, so a {S} is paid only by a
  // fresh snow tap here; a floating snow mana that could legally pay it is a safe under-count (FN, CREED).
  let snowNeeded = cost.snow || 0;
  while (snowNeeded > 0) {
    let best = -1;
    let bestLen = Infinity;
    for (let i = 0; i < avail.length; i++) {
      const s = avail[i];
      if (s.used || !s.snow || !victimsHold(s)) continue;
      const flex = new Set([...s.colors, ...s.bonus.flatMap(b => b.colors)]).size;
      if (flex < bestLen) { bestLen = flex; best = i; }
    }
    if (best === -1) return null;                 // no untapped snow source → {S} unpayable
    const color = tapSource(avail[best], null);   // tap it; its mana enters `working`
    spendOne(color);                              // one mana from the snow source pays this {S} pip
    snowNeeded -= 1;
  }

  // 1. Colored + colorless pips, scarcest color first. Scarcity = how many sources (plus current pool)
  // can produce it; paying the scarce color first avoids stranding the only source of a color on a
  // more-flexible pip. A source counts toward a color it can make via its own mana OR a boost bonus.
  const producerCount = (color) =>
    (working[color] || 0) + avail.filter(s => !s.used && sourceCanMake(s, color)).length;
  const coloredNeeded = ["W", "U", "B", "R", "G", "C"].filter(c => (cost[c] || 0) > 0);
  coloredNeeded.sort((a, b) => producerCount(a) - producerCount(b));

  for (const color of coloredNeeded) {
    let need = cost[color] || 0;
    while (need > 0) {
      if (working[color] > 0) { spendOne(color); need -= 1; continue; }
      if (tapForColor(color)) { spendOne(color); need -= 1; continue; }
      return null;
    }
  }

  // 2. Hybrid pips — pay one colored option.
  for (const options of cost.hybrid || []) {
    const colored = options.filter(o => COLOR_SET.has(o));
    let paid = false;
    for (const opt of colored) {
      if (working[opt] > 0) { spendOne(opt); paid = true; break; }
    }
    if (!paid) {
      for (const opt of colored) {
        if (tapForColor(opt)) { spendOne(opt); paid = true; break; }
      }
    }
    if (!paid) return null;
  }

  // 3. Generic — any mana works. Spend the pool first, then tap. Colorless first, both here and after each tap
  // (GENERIC_SPEND_ORDER): the colored mana is what keeps floating for a later colored pip.
  let generic = cost.generic || 0;
  // RESTRICTED MANA FIRST (2026-10-17 — Throne of Eldraine): mana a restricted tap made that no pip has taken pays the generic before
  // the open pool does, so floating open mana stays open and less restricted mana is left over (restrictedSurplus, below). A play
  // order only — any mana pays generic (CR 107.4b) and this payment may spend the restricted mana.
  if (generic > 0 && restrictedMade.length) {
    const made = {};
    for (const r of restrictedMade) for (const [c, n] of Object.entries(r.made)) made[c] = (made[c] || 0) + n;
    for (const c of GENERIC_SPEND_ORDER) {
      let unspent = Math.max(0, (made[c] || 0) - (spend[c] || 0));
      while (generic > 0 && unspent > 0 && working[c] > 0) { spendOne(c); generic -= 1; unspent -= 1; }
    }
  }
  if (generic > 0) {
    for (const c of GENERIC_SPEND_ORDER) {
      while (generic > 0 && working[c] > 0) { spendOne(c); generic -= 1; }
    }
  }
  while (generic > 0) {
    const color = tapAny(generic);
    if (color === null) return null;
    // A tap that makes colorless beside a color (a karoo's {C}{U}) pays with its colorless, whichever symbol it prints
    // first; then the color the tap was taken for.
    for (const c of ["C", color]) {
      while (generic > 0 && working[c] > 0) { spendOne(c); generic -= 1; }
    }
    // MIXED FIXED BUNDLE (karoo / signet): a tap can produce SEVERAL colors at once, and `tapAny` reports only
    // the primary. Draining just that one stranded the rest — a Selesnya Signet could not pay {2}, which it
    // plainly does. Generic is paid LAST (snow → colored → here), so nothing colored is still owed and any
    // color left in `working` is legitimately spendable on generic. A single-color tap leaves nothing extra
    // here, so this is a no-op for every source that isn't a bundle. Surplus still floats.
    for (const c of GENERIC_SPEND_ORDER) {
      while (generic > 0 && working[c] > 0) { spendOne(c); generic -= 1; }
    }
  }

  if (claims) claims.push(...mine); // the next call of the same payment sees this call's sacrifices (activateCostedInOrder)
  // ⭐ THE RESTRICTED SURPLUS (2026-10-17 — Throne of Eldraine's four, "Spend this mana only to cast monocolored spells of that color").
  // A restricted tap's mana that this payment does not spend keeps its restriction (CR 106.6): it goes to the restricted-mana pool as a
  // tagged entry (player.restrictedMana — the QUARTET Phase 4 entries the next payment's pre-pass reads), never into the open pool.
  // The payment may spend the restricted mana on any part of itself (the filter above admitted the source for it), so the spend is
  // attributed to the restricted mana first, in tap order: what is left of each restricted tap is its entry. Before this, when
  // floating open mana paid part of the cost, the restricted tap's leftover stayed in the open pool as ordinary mana — a floating
  // {R} spent on Darksteel Ingot's {3} beside Mishra's Workshop left an open {C} the player never had (laundered; the full-
  // consumption filter bounds the AMOUNT left, not its colour or its restriction). commitPaymentPlan moves each entry out of the
  // open pool.
  let restrictedSurplus = null;
  if (restrictedMade.length) {
    const unattributed = { ...spend };
    restrictedSurplus = [];
    for (const r of restrictedMade) {
      const left = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
      let any = false;
      for (const [c, n] of Object.entries(r.made)) {
        const used = Math.min(n, unattributed[c] || 0);
        unattributed[c] = (unattributed[c] || 0) - used;
        if (n - used > 0) { left[c] = n - used; any = true; }
      }
      if (any) restrictedSurplus.push({ pool: left, restriction: r.restriction });
    }
    if (!restrictedSurplus.length) restrictedSurplus = null;
  }
  return { taps, spend, ...(entrySpends.length ? { entrySpends } : {}), ...(restrictedSurplus ? { restrictedSurplus } : {}) };
}

/**
 * Can `cost` be paid from `pool` plus tapping `sources`? Pure — no mutation.
 * legalChoices uses this for cast-spell legality. planPayment's plan 1 decides affordability, so it alone is run here.
 */
export function canAfford(pool, sources, cost, spendContext = null) {
  return planWithPhyrexian(cost, spendContext, (manaCost, base) => planPaymentPasses(pool, sources || [], manaCost, spendContext, null, base)) !== null;
}

/**
 * W1 — THE single mana-tap commit (one tap of a payment plan, or one explicit tap-for-mana action; both
 * carry the same `{ color, amount, bonus, sacrifices, permanentId }` shape). Add the source's mana to the
 * pool (plus any inline boost-Aura bonus — the Aura is NOT tapped/consumed, CR 605.1b), then either TAP a
 * repeatable land/rock/dork or — for a one-shot sacrifice-for-mana source (Treasure / Gold / Lotus Petal / an
 * Eldrazi Spawn / a Sliver granted Basal Sliver's ability, `tap.sacrifices`) — SACRIFICE it so it can't ramp
 * again (the TOK-2 correctness invariant), through costSacrifice.sacrificePermanentForCost: a creature dies (CR 700.4), every
 * "whenever you sacrifice …" watcher fires (SAC-TREASURE, CR 701.21a), and the pending leave event drains NOW
 * (LEAVE-DRAIN, CR 603.3b) so permanentLeaves watchers stack in cost order, not at the NEXT stack resolution
 * against a battlefield that may have changed (the stale-scan FP window). Shared by every payment path — the
 * dispatcher's plan commits, applyTapForMana's explicit tap, and payManaCost's resolution-layer payment —
 * so the commit semantics can't drift.
 * `victimId` (commitPaymentPlan's assignment, assignSacVictims): the permanent this tap's "Sacrifice a <kind>" cost takes — null for
 * none — instead of the least valuable one found here (the explicit tap's single activation, a hand-built tap).
 */
export function commitManaTap(state, playerId, tap, { reserved = null, victimId } = {}) {
  // THE SACRIFICE-A-<KIND> COST FIRST (SG-3 — Ashnod's / Phyrexian Altar, Phyrexian Tower, Thermopod; play-weighted #803 — Gilded
  // Goose's Food). A mana ability's costs are paid before it resolves and adds its mana (CR 605.3, 602.2b, 601.2h; CR 605.3b), so
  // the victim is found and sacrificed before anything is added: the least valuable OTHER permanent of its kind (lowest mana
  // value, then name — never the source, never one the action's own costs still need, `reserved`: feeding one of those to the
  // Altar would leave that cost unpayable a moment later), or the one commitPaymentPlan assigned. It goes through the cost
  // sacrifice, so its dies and sacrifice triggers fire (CR 700.4). NO VICTIM (one the same payment's other sacrifice already took,
  // or one gone since the plan) → the cost can't be paid (CR 118.3), so the ability isn't activated: nothing is added, tapped or
  // paid, and the unpaid cost is logged. Until 2026-10-17 the mana was added first and kept when the victim was missing — two
  // Altars beside one creature made two mana from one sacrifice.
  // + THE OTHER CONSUMED COSTS FIRST TOO (2026-10-17, the follow-up): "Exile a card from your graveyard" (Molt Tender, Rubble Rouser)
  // takes the oldest graveyard card the action doesn't need, and "Pay N life" needs that much
  // life (CR 119.4 — a player may pay life only up to their life total). Every one is checked before any is paid (CR 601.2h — no
  // partial payment): one that can't be paid leaves the ability unactivated — nothing added, tapped or paid, the unpaid cost logged.
  // Until then the graveyard exile and the life came after the mana: an empty graveyard logged `exile-gy-cost-unpaid` and kept the
  // mana, and life went below 0.
  const isVictim = sacVictimTest(tap);
  let victim = null;
  if (isVictim) {
    const live = liveSacVictims(state, playerId, tap, reserved); // a creature / Food NOW (the type-line audit) — Ashnod's Altar never eats a God below its devotion
    victim = victimId === undefined ? live[0] : live.find((p) => p.id === victimId);
    if (!victim) return logEvent(state, { kind: "mana", event: `sacrifice-${tap.sacrificesCreature ? "creature" : "food"}-cost-unpaid`, permanentId: tap.permanentId, playerId });
  }
  let gyCard = null;
  if (tap.exilesGyCard) {
    gyCard = liveGyCards(state, playerId, reserved)[0] || null;
    if (!gyCard) return logEvent(state, { kind: "mana", event: "exile-gy-cost-unpaid", permanentId: tap.permanentId, playerId });
  }
  if (tap.payLifeCost && (!((state.players[playerId]?.life ?? 0) >= tap.payLifeCost) || playerLifeLocked(state, playerId))) { // CR 119.4, 119.8
    return logEvent(state, { kind: "mana", event: "pay-life-cost-unpaid", permanentId: tap.permanentId, playerId, amount: tap.payLifeCost });
  }
  let paidVictim = null;
  if (victim) {
    state = sacrificePermanentForCost(state, playerId, victim);
    paidVictim = { kind: tap.sacrificesCreature ? "creature" : "food", victim };
  }
  if (gyCard) state = moveCardToZone(state, { playerId, fromZone: "graveyard", toZone: "exile", cardId: gyCard.id });
  if (tap.payLifeCost) state = loseLife(state, { playerId, amount: tap.payLifeCost });
  // MIXED FIXED BUNDLE (karoo / signet): the tap produces its exact per-color tally, so the commit adds each
  // color rather than `amount` of the single recorded `color`. Reading the plan's OWN breakdown is what keeps
  // "affordable per planPayment" == "actually paid" for these sources — the invariant this whole seam exists
  // to hold. Absent on every other tap, which keeps the single-color path byte-identical.
  let next = tap.fixed
    ? Object.entries(tap.fixed).reduce((st, [color, amount]) => addMana(st, { playerId, color, amount }), state)
    : addMana(state, { playerId, color: tap.color, amount: tap.amount ?? 1 });
  for (const b of tap.bonus || []) next = addMana(next, { playerId, color: b.color, amount: b.amount });
  // PAINLAND (CR 118.4 — paying life / taking damage from your own land). The coloured half of a painland
  // costs life, and admitting the colours WITHOUT this would be a painless painland: strictly better than
  // printed, the forbidden direction. Stamped by the planner only when the tap actually chose a painful
  // colour, so the free {C} half is unaffected.
  if (tap.painLife) {
    next = loseLife(next, { playerId, amount: tap.painLife });
  }
  // 2026-10-17 (the land lines) — "Each opponent gains N life." on the mana ability itself (Grove of the Burnwillows): the ability's own
  // effect, done as it resolves (CR 605.3b, 119.3), through gainLife (a "can't gain life" or a gain replacement applies there); each
  // opponent's "whenever you gain life" triggers fire for what it actually gained, as the each-opponent gain-life atom fires them.
  if (tap.opponentsGainLife) {
    for (const opp of opponentsOf(next, playerId)) {
      const before = next.players[opp]?.life ?? 0;
      next = gainLife(next, { playerId: opp, amount: tap.opponentsGainLife });
      const gained = (next.players[opp]?.life ?? 0) - before;
      if (gained > 0) next = checkLifegainTriggers(next, opp, gained);
    }
  }
  // ⛔ TAP-OTHER: pay the printed extra cost by actually tapping the payers manaSources reserved. Without
  // this the source produces mana for free — the PHANTOM MANA the compound-cost guard refused these cards to
  // prevent, reintroduced one layer down. Done BEFORE the source's own tap/sacrifice so a failure here
  // cannot leave the source spent with the cost unpaid.
  for (const id of tap.extraTaps || []) next = tapPermanent(next, id);
  // ⛔ PAY-LIFE (`payLifeCost` — named apart from a painland's `painLife` so the two never fold together) and the EXILE-FROM-GY
  // cost (Molt Tender — the oldest graveyard card, the riot discipline's deterministic house pick) were paid at the top, before the
  // mana (2026-10-17). The sacrifice-a-<kind> cost too; its log line keeps its place here.
  if (paidVictim) {
    const { kind, victim: v } = paidVictim;
    next = logEvent(next, { kind: "mana", event: `sacrifice-${kind}-cost`, permanentId: tap.permanentId, playerId, victimId: v.id, victimName: v.card?.name });
  }
  // SG-6 — EXILE-FROM-HAND source (the Spirit Guides): the "permanent" is a hand card; the cost is exiling it.
  // Nothing taps. If the card has already left the hand (a race the offer can't see) the tap is logged unpaid
  // rather than fabricated, mirroring the other cost riders.
  if (tap.fromHand) {
    const inHand = (next.players[playerId]?.hand || []).some((c) => c.id === tap.permanentId);
    if (inHand) {
      next = moveCardToZone(next, { playerId, fromZone: "hand", toZone: "exile", cardId: tap.permanentId });
      return logEvent(next, { kind: "mana", event: "exile-from-hand-cost", cardId: tap.permanentId, playerId });
    }
    return logEvent(next, { kind: "mana", event: "exile-from-hand-cost-unpaid", cardId: tap.permanentId, playerId });
  }
  // STAGE ④-4 — COUNTER-REMOVAL COST: pay the printed cost for real — remove exactly the counters the plan
  // priced (CR 601.2h via 602.2b), before the tap so a failure here can never leave the source spent unpaid.
  if (tap.removesCounters && tap.removesCounters.count > 0) {
    next = removeCounter(next, { permanentId: tap.permanentId, type: tap.removesCounters.type, amount: tap.removesCounters.count });
    next = logEvent(next, { kind: "mana", event: "remove-counters-cost", permanentId: tap.permanentId, playerId, counterType: tap.removesCounters.type, removed: tap.removesCounters.count });
  }
  // 2026-10-17 — A COUNTER PUT ON AS THE COST (Wall of Roots' "Put a -0/-1 counter on this creature"): through addCounter, so a
  // counter doubler applies (CR 122.6) and a "counters are put on" watcher sees it. A Wall that reaches 0 toughness dies to the
  // next state-based check, as a cost may legally leave it (CR 118.3 only asks that the counter can be put on).
  if (tap.putsCounter) {
    next = addCounter(next, { permanentId: tap.permanentId, type: tap.putsCounter.type, amount: 1 });
    next = logEvent(next, { kind: "mana", event: "put-counter-cost", permanentId: tap.permanentId, playerId, counterType: tap.putsCounter.type });
  }
  // 2026-10-17 — THE PER-TURN LIMIT (manaActivationLimit, CR 602.5b): stamp the activation ledger the activated abilities share
  // (actionDispatcher's applyActivateAbility writes the same { turn, n } shape), so manaSources stops offering the line once its
  // limit is reached this turn. A record from an earlier turn restarts at 1.
  if (tap.limitKey) {
    const prev = next.activatedOncePerTurn?.[tap.limitKey];
    const n = (prev && prev.turn === next.turn ? prev.n : 0) + 1;
    next = { ...next, activatedOncePerTurn: { ...(next.activatedOncePerTurn || {}), [tap.limitKey]: { turn: next.turn, n } } };
  }
  if (tap.sacrifices) {
    // The source pays with itself — the RECIPIENT of a granted self-sacrifice included (grantedManaProduction keeps the flag).
    const sacPerm = next.players[playerId]?.battlefield?.find((p) => p.id === tap.permanentId);
    next = sacrificePermanentForCost(next, playerId, sacPerm || { id: tap.permanentId });
  } else if (tap.noTap) {
    // A LINE WITH NO {T} IN ITS COST doesn't tap its source (CR 107.5 — the tap symbol is what taps it) and is not "tapped for
    // mana" (CR 106.12), so no tapped-for-mana watcher fires: STAGE ③ · 37's remove-a-counter sources (Pentad Prism) and, since
    // 2026-10-17, every other one — Ashnod's and Phyrexian Altar, Birchlore Rangers (only the Elves it pays with tap), Kozilek's
    // Translator, Wall of Roots, the mana filters. Before, only the counter sources carried the flag and the rest were tapped:
    // used once and done until the untap step, and "becomes tapped" watchers fired for a tap that never happened.
  } else {
    next = tapPermanent(next, tap.permanentId);
    // STAGE ④-5 — the doesn't-untap rider: the land tapped through this line skips its controller's next untap
    // step (CR 502.2 — the same flag the untap step already honours for every other "doesn't untap" source).
    if (tap.doesNotUntapNext) next = setDoesNotUntapNext(next, tap.permanentId, true);
    // ④-D — TAPPED FOR MANA (CR 605.3): the permanent was tapped for mana; its own "you tap this … for mana" watcher
    // and every "you tap a land / an opponent taps a land for mana" watcher enqueue here (a Treasure cracked for
    // mana is a sacrifice, not a tap — the branch above never reaches this line).
    if (!tap.fromHand) next = checkTapForManaTriggers(next, { permanentId: tap.permanentId, tapperId: playerId });
  }
  // 2026-10-17 — "IF THERE ARE NO <kind> COUNTERS ON THIS LAND, SACRIFICE IT." (Gemstone Mine, the depletion lands): the mana
  // ability's own instruction, followed in order as it resolves, after the mana is added (CR 605.3b — it resolves immediately;
  // CR 608.2c — in the order written). It is neither a triggered ability (no "when / whenever / at", CR 603.1) nor a state-based
  // action, so it is checked here, once, against the counters left after the cost. The land leaves through THE cost sacrifice's
  // sequence (costSacrifice.sacrificePermanentForCost) although this is an effect: a mana ability resolves outside the stack, so
  // no resolution finalizer drains the leave event after it — the case that helper exists for (CR 701.21a; the sacrifice
  // watchers fire, a land doesn't die).
  if (tap.sacrificeIfNoCounters && tap.removesCounters) {
    const land = next.players[playerId]?.battlefield?.find((p) => p.id === tap.permanentId);
    if (land && !((land.counters?.[tap.removesCounters.type] || 0) > 0)) {
      next = sacrificePermanentForCost(next, playerId, land);
      next = logEvent(next, { kind: "mana", event: "sacrificed-no-counters", permanentId: tap.permanentId, playerId, counterType: tap.removesCounters.type, cardName: land.card?.name });
    }
  }
  return next;
}

/**
 * W1 — THE single payment-plan commit: execute every tap of a `planPayment` plan via `commitManaTap`,
 * then deduct EXACTLY what the plan spent from the topped-up pool. Using the plan's own breakdown (not a
 * second payment heuristic) guarantees the deduction always succeeds — no divergence that could strand a
 * hybrid pip after the cast was already deemed affordable. Any surplus from an over-producing source
 * (Sol Ring on a single generic) floats — the floating-mana behavior we want. Lives here (a leaf) so BOTH
 * the dispatcher's five pay-at-cost paths (cast / activate / cycle / companion / plot) and the resolution
 * layer's payManaCost commit through one implementation — the 3-way copy-paste this replaced is the exact
 * seam where tap-for-mana semantics used to drift.
 */
export function commitPaymentPlan(state, playerId, plan, { reserved = null } = {}) {
  let next = state;
  // A sacrifice-a-creature source (Ashnod's / Phyrexian Altar) picks its victim as it commits, so it commits LAST: every
  // creature the same plan taps for mana (Cryptolith Rite, Enduring Vitality) is tapped first, and only then may one be
  // sacrificed. Committed in plan order, the Altar could sacrifice a creature a later tap of the plan still named
  // ("Permanent … not found"), ending the game in a dispatch error. A plan with no such source keeps its order.
  // + Gilded Goose's Food (play-weighted #803): picked as it commits too.
  // + ONE VICTIM EACH (2026-10-17): once the other taps are in, the sacrifices are assigned together on the live board
  // (assignSacVictims — a distinct victim each, the least valuable first, never `reserved`), and a source that is another's victim
  // pays first (Gilded Goose taps and eats its Food, then Phyrexian Altar eats the Goose; committed the other way the Goose's own
  // tap found no permanent). A sacrifice left without a victim pays nothing and makes nothing (commitManaTap). The planner gives
  // every sacrifice of its plan a victim the same way, so on a plan made from this board none is left out.
  // + An exile-a-graveyard-card tap (Molt Tender) commits with the other taps, each taking the oldest card the action doesn't need
  // (any card pays it, so taking them in turn is the distinct assignment); the planner counted one card per exile, so none runs dry.
  const taps = plan?.taps || [];
  const picking = taps.filter(picksSacVictim);
  for (const tap of picking.length ? taps.filter((t) => !picksSacVictim(t)) : taps) next = commitManaTap(next, playerId, tap, { reserved });
  if (picking.length) {
    const entries = picking.map((t) => ({ source: t.permanentId, candidates: liveSacVictims(next, playerId, t, reserved).map((p) => p.id) }));
    const { victims, order } = assignSacVictims(entries, { allowSkip: true });
    for (const i of order) next = commitManaTap(next, playerId, picking[i], { reserved, victimId: victims[i] });
  }
  const topped = next.players[playerId].manaPool;
  const nextPool = {};
  // + activationSpend (the free-activation fix): what funded a mana-costed source — paid out of the pool, never counted as spent on the spell.
  for (const col of Object.keys(topped)) nextPool[col] = (topped[col] || 0) - (plan?.spend?.[col] || 0) - (plan?.activationSpend?.[col] || 0);
  // POOL-RESTRICTED SUB-POOL (QUARTET Phase 4): deduct the planner's entrySpends from the EXACT tagged
  // entries it priced (indices into player.restrictedMana at plan time); an emptied entry is dropped.
  // The remainder stays tagged — a partial spend can never launder restricted mana into the open pool.
  let restrictedMana = next.players[playerId].restrictedMana;
  if (plan?.entrySpends?.length && Array.isArray(restrictedMana)) {
    restrictedMana = restrictedMana.map((e, i) => {
      const es = plan.entrySpends.find((x) => x.entry === i);
      if (!es) return e;
      const p = { ...e.pool };
      for (const c of Object.keys(es.spend)) p[c] = Math.max(0, (p[c] || 0) - (es.spend[c] || 0));
      return { ...e, pool: p };
    }).filter((e) => Object.values(e.pool).some((n) => n > 0));
  }
  // THE RESTRICTED SURPLUS (2026-10-17): the restricted mana the payment left unspent leaves the open pool for a tagged entry with its
  // restriction (planPaymentCore's restrictedSurplus) — the entries drain with the pool at each step's end (gameEngine).
  if (plan?.restrictedSurplus?.length) {
    for (const e of plan.restrictedSurplus) for (const c of Object.keys(e.pool)) nextPool[c] = (nextPool[c] || 0) - (e.pool[c] || 0);
    restrictedMana = [...(Array.isArray(restrictedMana) ? restrictedMana : []), ...plan.restrictedSurplus.map((e) => ({ pool: { ...e.pool }, restriction: e.restriction }))];
  }
  // P·37 — the until-end-of-turn hold on "this mana" (Birgi) never exceeds what is left of its color: a payment that spent the held
  // mana lowers it, so mana added later in the step can't survive the drain on its account.
  const holdEot = next.players[playerId].manaHoldEot;
  const clamped = holdEot ? Object.fromEntries(Object.entries(holdEot).map(([c, n]) => [c, Math.min(n, nextPool[c] || 0)])) : holdEot;
  let out = { ...next, players: { ...next.players, [playerId]: { ...next.players[playerId], manaPool: nextPool, ...(holdEot ? { manaHoldEot: clamped } : {}), ...(restrictedMana !== next.players[playerId].restrictedMana ? { restrictedMana } : {}) } } };
  // PHYREXIAN MANA PAID WITH LIFE (CR 107.4f, 119.4 — 2026-10-17): the 2 life per symbol the planner chose (planWithPhyrexian),
  // through the one life-loss chokepoint the pay-life mana lines and the attack tax's Phyrexian pips use. Part of the total cost
  // (CR 601.2h); the planner already held it beside the payment's other life costs, so the life is there to pay.
  if (plan?.phyrexianLife > 0) {
    out = loseLife(out, { playerId, amount: plan.phyrexianLife });
    out = logEvent(out, { kind: "mana", event: "phyrexian-life", playerId, amount: plan.phyrexianLife });
  }
  return out;
}

/**
 * SOFT-CNT — pay a FIXED generic cost of `amount` from `playerId`'s pool + untapped mana sources
 * (the "unless its controller pays {N}" escape on Force Spike / Mana Leak / …). Plans the payment with
 * `planPayment` (the SAME planner the cast path uses, so "affordable" == "actually paid" — no second
 * heuristic that could strand mana), commits via `commitPaymentPlan` (the SAME committer the cast path
 * uses). Returns `{ state, paid }`: `paid:false` with state UNCHANGED when the player can't afford it
 * (the caller then counters the spell), never fabricated mana. `amount <= 0` is a trivial `paid:true`
 * no-op. Kept here (a leaf) so the resolution layer can pay without importing the dispatcher (which
 * would cycle).
 */
export function payGenericMana(state, playerId, amount) {
  const n = Math.max(0, Math.trunc(Number(amount) || 0));
  if (n === 0) return { state, paid: true };
  return payManaCost(state, playerId, { generic: n });
}

/**
 * KW-WARD-PR2 — pay an ARBITRARY mana cost (colored / hybrid / generic, the full `planPayment` cost shape)
 * from `playerId`'s pool + untapped sources. Generalizes payGenericMana (which now delegates here) so a
 * non-all-generic ward — `Ward {1}{U}`, `Ward {W/U}` — can be paid exactly like a cast cost, never as a
 * generic approximation (which would mis-charge the wrong color = a CREED false positive). Same contract as
 * payGenericMana: `{ state, paid }`, `paid:false` with state UNCHANGED when unaffordable, never fabricated
 * mana. A zero / empty cost is a trivial `paid:true`. The corpus has no true colored-mana ward today
 * (only Minthara's `Ward {X}`, which stays unmodeled) — this exists so the cost form is COMPLETE, not
 * partial, the moment such a card is played.
 */
export function payManaCost(state, playerId, cost) {
  const c = cost || {};
  const empty =
    !(c.generic > 0) &&
    !MANA_COLORS.some((col) => (c[col] || 0) > 0) && // MANA_COLORS includes C (colorless pip)
    !(Array.isArray(c.hybrid) && c.hybrid.length) &&
    !(Array.isArray(c.phyrexian) && c.phyrexian.length); // 2026-10-17 — a lone {W/P} is a cost, never a free payment
  if (empty) return { state, paid: true, lifePaid: 0 };
  const player = state?.players?.[playerId];
  if (!player) return { state, paid: false };
  // The payer's life rides the context, so a Phyrexian symbol may be paid with 2 life (planWithPhyrexian — mana first).
  const plan = planPayment(player.manaPool, manaSources(state, playerId), c, lifePaymentContext(state, playerId));
  if (!plan) return { state, paid: false };
  return { state: commitPaymentPlan(state, playerId, plan), paid: true, lifePaid: plan.phyrexianLife || 0 };
}

// Internal exports for tests.
export const _internals = { parseAddClause, hasHaste, BASIC_LAND_MANA, KNOWN_ROCKS };
