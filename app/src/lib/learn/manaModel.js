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

import { MANA_COLORS, addMana, cardSelfPreventsUntap, moveCardToZone, tapPermanent, findPermanent, loseLife, logEvent } from "./gameState.js";
import { checkSacrificeTriggers, checkLeavesTriggers } from "./triggers.js"; // SAC-TREASURE: a cracked one-shot mana source is a sacrifice; LEAVE-DRAIN: its exit drains at cost time (CR 603.3b)
import { permanentHasKeyword, grantedManaSpecsFor, permanentTypes, summoningSickNow, colorsOf } from "./layers.js";
import { countForSpec } from "./effects/atoms/shared.js"; // MANA-VARIABLE: resolve a count-derived mana amount (leaf-safe: shared → gameState only)
import { parseAuraLandManaBonus, parseGlobalTapManaAugment, artifactActivationsLocked } from "./staticAbilityParser.js"; // AURA-LAND-MANA-BOOST + GLOBAL-TAP-AUGMENT: extra mana from a "tapped for mana" boost (leaf: static parser → keywords only); NR-1: the artifact-activation lock
import { manaMultiplier } from "./replacementEffects.js"; // MANA-MULTIPLIER: ×N tap-for-mana replacement (Mana Reflection/Nyxbloom; leaf, no cycle)
import { evaluateInterveningIf } from "./interveningIf.js"; // CONDITION-GATED mana (CR 602.5) — interveningIf imports ONLY gameState, so this is a one-way edge with no cycle (checked before adding it)

// A board with one seat and empty zones — enough for evaluateInterveningIf to ANSWER a condition or admit it
// cannot. Used only by conditionIsExpressible, never for a real verdict.
const _PROBE_STATE = { players: { probe: { battlefield: [], graveyard: [], hand: [], library: [], life: 40 } } };

/**
 * Can `evaluateInterveningIf` actually DECIDE this condition? It returns a boolean when it understands the
 * phrase and `null` when it cannot confirm.
 *
 * ⚠️ THIS GUARD IS WHY THE METRIC STAYS HONEST. Tagging every gate onto the product and letting manaSources
 * drop anything not `=== true` would be safe at RUNTIME but would credit the card native-mana while its
 * source could never be offered — a runtime-vacuous native, the same class as the vacuous subtype filter and
 * the aura grants that never applied. An inexpressible gate must PARK the card instead, which is what
 * manaProductionImpl does with this answer.
 */
function conditionIsExpressible(condition) {
  try {
    return typeof evaluateInterveningIf(_PROBE_STATE, condition, "probe", { sourcePermanentId: "probe-src" }) === "boolean";
  } catch {
    return false;
  }
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
  "Arcane Signet": { colors: ["W", "U", "B", "R", "G"], amount: 1 },
  "Fellwar Stone": { colors: ["W", "U", "B", "R", "G"], amount: 1 },
};

const COLOR_SET = new Set(MANA_COLORS);

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

  // "Add <N> mana of any (one) color" → any of the five colors, amount = the QUANTITY word. The token
  // immediately before "mana of any …" is captured and parsed by parseFixedQuantity: "two"→2 (Zaxara),
  // "three"→3 (Black Lotus / Gilded Lotus), a digit→that number, an UNQUANTIFIED/unrecognized form (or a
  // bare "X" with no metric) → 1 (FN-safe default — never fabricate). Previously this hardcoded amount:1,
  // so the sim under-produced for every multi-mana any-color source (~60 corpus cards incl. the Lotuses,
  // Zaxara, Goldspan's Treasure). RUNTIME-ONLY: classifyCard never calls manaProduction, so the native-mana
  // tier is unchanged — this corrects only the runtime AMOUNT. The X-with-metric forms ("Add X mana …,
  // where X is …") already matched Shape B above (amountSpec), so they never reach here.
  let any = oracle.match(/add\b[^.]*?\b(\S+)\s+mana of any(?: one)? color/i);
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
    // ⭐ SINGLE-ABILITY PAINLAND (the Odyssey threshold cycle — Cabal Pit, Barbarian Ring, Cephalid
    // Coliseum, Centaur Garden, Nomad Stadium — plus Fogwell's Gym). ONE coloured ability that costs life:
    //     "{T}: Add {B}. This land deals 1 damage to you."
    // These were NOT colourless — their first Add clause IS coloured, so they parsed fine and the damage
    // rider was simply DROPPED. That is a PAINLESS painland: strictly better than printed, and unlike the
    // two-line cycle's under-delivery this one was already live in the FORBIDDEN direction.
    //
    // ⛔ UNCONDITIONAL DAMAGE ONLY. Tomb of Urami prints "deals 1 damage to you IF YOU DON'T CONTROL AN
    // OGRE" — a condition nothing here models. Charging it always would over-charge, so it is excluded and
    // stays exactly as it is (a known, recorded gap rather than a new wrong answer).
    //
    // The `\.` before the lookahead is what does that work: the conditional printing has no period there
    // ("…damage to you IF you don't…"), so it simply never matches. A second `!/damage to you if/` guard was
    // written here first and MUTATION-CHECKED AS REDUNDANT — removing it changed nothing, because this
    // anchor already excluded the card. Dropped rather than kept: a guard that cannot be seen to fail
    // implies protection it does not add.
    //
    // The `[^.\n]*?` covers the older printings that self-reference by name instead of "This land".
    const pain1 = String(oracle || "").trim().match(
      /^(?:This land enters tapped\.\n)?\{T\}: Add \{([WUBRG])\}\. [^.\n]*? deals (\d+) damage to you\.(?:\n|$)/i,
    );
    if (pain1) {
      const col = pain1[1].toUpperCase();
      return { colors: [col], amount: 1, painColors: [col], painAmount: parseInt(pain1[2], 10) };
    }
  }
  // The no-quantity form ("Add mana of any color") — keep the original FN-safe amount:1.
  if (/add\b[^.]*\bmana of any(?: one)? color/i.test(oracle)) {
    return { colors: ["W", "U", "B", "R", "G"], amount: 1 };
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
// MANA cost ({…} symbols + {Q}, nothing else — a mana FILTER the sim pays from its pool, e.g. Prismite
// "{2}: Add one mana of any color", Pili-Pala "{2}, {Q}: …"). These three are the only repeatable/standing
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
  const m = cost.match(/\btap (an|a|two|three) untapped ([a-z]+)s? you control\b/i);
  if (!m) return null;
  const count = { a: 1, an: 1, two: 2, three: 3 }[m[1].toLowerCase()];
  if (!count) return null;
  // ⚠️ THE PAYER NOUN IS PLURAL WHENEVER THE COUNT IS, and the first cut of this missed it entirely: `([a-z]+)s?`
  // is GREEDY, so "two untapped Elves" captured "elves" and "two untapped creatures" captured "creatures" —
  // neither in the allowlist, so every count>1 card silently kept its refusal while the count==1 cards flipped.
  // A partial flip across identical printed shapes, which is the same tell that uncovered the destroy-CREATURE
  // lead hole earlier today. De-pluralize against the allowlist rather than widening it with plural spellings,
  // so the vocabulary stays one entry per real noun.
  const raw = m[2].toLowerCase();
  const candidates = [raw];
  if (raw.endsWith("ves")) candidates.push(`${raw.slice(0, -3)}f`);   // elves → elf
  if (raw.endsWith("s")) candidates.push(raw.slice(0, -1));            // creatures → creature
  const filter = candidates.find((c) => TAP_OTHER_FILTERS.has(c));
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
// prints many other payer nouns, but on tap-for-EFFECT abilities this seam never sees.
const TAP_OTHER_FILTERS = new Set(["creature", "elf", "token", "food", "artifact", "permanent", "druid"]);

/** Is this card a CREATURE by printed type? Used only to scope the payer-ordering sickness key. */
function isCreatureCardType(card) {
  return new RegExp(`\\bcreature\\b`, "i").test(String(card?.type || card?.type_line || ""));
}

/** Does a battlefield permanent match a printed tap-OTHER payer filter? Front-face type line only. */
function matchesTapOtherFilter(perm, filter) {
  const tl = String(perm?.card?.type || perm?.card?.type_line || "").toLowerCase();
  const word = (w) => new RegExp(`\\b${w}\\b`).test(tl);
  if (filter === "token") return !!perm?.card?.token || !!perm?.token;
  // ⛔ "PERMANENT" MUST NOT GO THROUGH THE WORD-BOUND TEST. The word never appears in a type line, so
  // `\bpermanent\b` is a gate NO printed card can satisfy — the source would be built, then never offered,
  // and Gene Pollinator would look modeled while producing nothing. That is the VACUOUS FILTER this codebase
  // has shipped twice before (Norn's Choirmaster, Keleth) and it is silent in every metric. Everything on a
  // battlefield IS a permanent (CR 110.1), so the honest predicate is "yes".
  if (filter === "permanent") return true;
  return word(filter);   // card type (creature / artifact) or subtype (elf / druid / food) — word-bound test
}

function manaCostModelable(cost) {
  if (/\{t\}/i.test(cost)) {
    // COMPOUND-COST GUARD (SHELF S7 audit catch — Sphere of the Suns / Channeler Initiate / Spell Satchel /
    // Springleaf Drum): "{T}, Remove a charge counter …" / "{T}, Tap an untapped creature …" is NOT a plain
    // tap dork — riding the {T} half alone minted PHANTOM mana every turn (the consumable half was never
    // spent, never even required). A {T} line is modelable only when the rest of the cost is mana symbols,
    // separators, or a SELF-sacrifice (the Treasure/Gold compound "{T}, Sacrifice this artifact" — the
    // production parse flags `sacrifices` and the commit path cracks it, so that pair stays fully modeled).
    return cost.replace(/\{[^}]*\}/g, " ").replace(/\bsacrifice (?:this|~)[^,:]*/gi, " ").replace(/[\s,]/g, "") === "";
  }
  if (/\bsacrifice (?:this|~)\b/i.test(cost)) return true; // self-sac one-shot (Treasure/Gold) — cracked on use
  return cost.replace(/\{[^}]*\}/g, "").replace(/[\s,]/g, "") === ""; // pure-mana / {Q} filter (payable from pool)
}

// Is the cost an UNPAYABLE, non-repeatable CONSUMABLE the sim can't spend — so registering its "Add …" as a
// free, tapless, standing source would mint PHANTOM mana every turn? The named consumable set: a non-self
// SACRIFICE (Utopia Mycon "Sacrifice a Saproling", Ashnod's Altar "Sacrifice a creature"), PAY N LIFE
// (Treasonous Ogre), DISCARD (Skirge Familiar), REMOVE A COUNTER (Cryptic Trilobite — a FINITE counter pool
// the sim would treat as infinite), EXILE-as-cost (Simian Spirit Guide — also never a battlefield source),
// TAP-OTHER permanents (Heritage Druid convoke-style — the sim doesn't tap the other Elves), or RETURN-to-hand
// (Grinning Ignus). Excludes self-sac (the Treasure case, handled by `sacrifices`) and a {T} cost (a real dork).
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
 * "Put a -0/-1 counter" (Wall of Roots, a real once-per-turn dork) is NOT "remove a counter" → kept. A
 * planeswalker loyalty cost (+N/−N) is not in the consumable set → PWs are left for a dedicated lane.
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

export function manaProduction(card) {
  if (!card) return null;
  if (typeof card === "object") {
    if (_prodMemo.has(card)) return _prodMemo.get(card);
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
  const stripped = oracleOf(card).replace(/\s*Spend this mana only[^.]*\./gi, "");
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
]);
export function parseSpendRestriction(oracle) {
  const text = String(oracle || "").toLowerCase();
  const clauses = [...text.matchAll(/spend this mana only ([^.]*)\./g)].map((m) => m[1]);
  if (!clauses.length) return null;
  const types = new Set();
  for (const clause of clauses) {
    // COMMANDER (CR 903.3) — a designation, not a type-line word, so it gets its own token rather than
    // riding SPEND_CAST_TYPE_WORDS where it could never match a printed line (the vacuous-filter failure).
    if (/\bto cast your commander\b/.test(clause)) { types.add("@commander"); continue; }
    // BARE "to cast spells" (Klauth — QUARTET Phase 4, 2026-08-15): ANY spell qualifies, but activated
    // abilities do NOT — a real restriction the type-word vocabulary can't express (no word matches every
    // type line), so it gets its own token like @commander. spendRestrictionAllows honors it for any
    // castCard; the no-context default-deny still refuses ability payments (they thread no castCard).
    if (/^to cast spells$/.test(clause.trim())) { types.add("@any-spell"); continue; }
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
    for (const cm of clause.matchAll(/\bcast ([a-z, /]*?)\s*spells?(?=$|[,.]|\s+(?:or|and)\b)/g)) {
      for (const w of cm[1].split(/\s*(?:,|\/|\bor\b|\band\b)\s*/)) {
        const phrase = w.trim().replace(/^(?:a|an|the)\s+/, "").trim();
        if (!phrase) continue;
        // CONJUNCTIVE PHRASE (QUARTET Phase 4, 2026-08-15 — Rivaz "Dragon CREATURE spells"): a multi-word
        // type phrase means the spell must match EVERY word ("dragon creature" ≠ any creature). Each word
        // must be in the vocabulary (one stranger → refuse the whole card, unchanged); the WHOLE phrase is
        // kept as one entry, and spendRestrictionAllows tests all of an entry's words conjunctively —
        // AND within an entry, OR across entries. A single-word phrase is byte-identical to before.
        const words = phrase.split(/\s+/);
        if (!words.every((word) => SPEND_CAST_TYPE_WORDS.has(word))) return null;
        types.add(words.join(" "));
      }
    }
  }
  return types.size ? { castTypes: [...types] } : null;
}

/** Does `card` satisfy a spend restriction? Used by the payment planner via its spend context. */
export function spendRestrictionAllows(restriction, castCard, opts = {}) {
  if (!restriction) return true;                       // unrestricted source
  if (!castCard) return false;                         // ⛔ NO CONTEXT ⇒ REFUSE (see planPayment)
  const typeLine = String(castCard.type || castCard.type_line || "").toLowerCase();
  for (const t of restriction.castTypes || []) {
    if (t === "@commander") { if (opts.isCommander) return true; continue; }
    if (t === "@any-spell") return true; // bare "cast spells" — any castCard qualifies (context presence IS the spell-ness)
    // A multi-word entry is CONJUNCTIVE ("dragon creature" — every word must sit on the type line;
    // parseSpendRestriction's phrase note). A single-word entry is byte-identical to before.
    if (t.split(/\s+/).every((word) => new RegExp(`\\b${word}\\b`).test(typeLine))) return true;
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
  const isActivatedSource =
    isLandCard || (activatedManaText(oracleForAdd) != null && (!manaAbilityCostUnpayable(oracleForAdd) || exilesGyCard));
  if (fromOracle && isActivatedSource) {
    const requiresTap = manaAbilityRequiresTap(oracleForAdd);
    return manaAbilitySacrificesSelf(oracleForAdd)
      ? { ...fromOracle, sacrifices: true, requiresTap }
      : { ...fromOracle, requiresTap, ...(exilesGyCard ? { exilesGyCard: true } : {}) };
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
  const payLife = parsePayLifeCost(oracleForAdd);
  if (fromOracle && payLife && !isLandCard) {
    return { ...fromOracle, requiresTap: manaAbilityRequiresTap(oracleForAdd), payLife: payLife.amount };
  }

  // A land we couldn't otherwise parse still taps for something — assume colorless so it can at least pay
  // generic. Never invents a color.
  //
  // ⛔ BUT ONLY WHEN IT PLAUSIBLY HAS A MANA ABILITY AT ALL. The premise "every land taps for something" is
  // simply FALSE for a large, heavily-played class, and this fallback was minting a repeatable, TAPLESS {C}
  // for every one of them — 54 corpus lands, led by **every fetchland** (Polluted Delta #36, Evolving Wilds
  // #18, Terramorphic Expanse #27, Fabled Passage #50, the whole Onslaught/Zendikar cycle) plus Maze of Ith,
  // Glacial Chasm, Diamond Valley and Dark Depths. A fetchland has NO mana ability — it sacrifices itself to
  // search. Measured live: a battlefield holding nothing but Maze of Ith could pay {1}. In a fetch-heavy
  // deck that is a fistful of fabricated mana every turn, and it goes straight into self-play training data,
  // which is the exact failure the phantom-mana gates elsewhere in this file exist to prevent.
  //
  // Two ways a land earns the fallback, and nothing else:
  //   • a BASIC LAND TYPE — the intrinsic ability of CR 305.6, which is printed nowhere in the oracle. This
  //     arm should be unreachable (the basic path returns its colored mana far above) and is kept anyway:
  //     stripping production from a basic would be catastrophic, so it must not depend on ordering.
  //   • the word "add" ANYWHERE in its oracle — it prints a mana ability this parser merely failed to read,
  //     which is the case the fallback was actually written for.
  //
  // Everything else now produces NOTHING. That is an UNDER-count, the safe direction (CREED).
  // ⚠️ KNOWN UNDER-COUNT, ACCEPTED: Urborg, Tomb of Yawgmoth and Yavimaya, Cradle of Growth ("Each land is
  // a Swamp/Forest in addition to its other land types") DO tap for mana in real Magic, via a basic type
  // they grant themselves. They print no "add" and carry no basic subtype, so they now produce nothing.
  // They were already WRONG here — credited {C} when they should make {B}/{G} — so this trades a wrong
  // answer for a missing one, which is the direction the creed requires. Modelling the self-granted type is
  // its own slice; pinned in manaLandNoAbility.test.js so it cannot be "fixed" by re-widening this.
  if (isLandCard) {
    const tl = typeLineOf(card).toLowerCase();
    // "basic" catches Wastes, whose type line is a bare "Basic Land" with NO subtype (the word Wastes is
    // only its NAME — an easy and wrong thing to match on). The subtype list catches a nonbasic that carries
    // basic types (Tundra, "Land — Plains Island").
    const hasBasicType = /\bbasic\b/.test(tl) || [...BASIC_LAND_SUBTYPES].some((b) => new RegExp(`\\b${b}\\b`).test(tl));
    if (hasBasicType || /\badd\b/i.test(oracleForAdd)) return { colors: ["C"], amount: 1 };
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
 * Used by BOTH read-sites (manaSources / legalChoices.actionsTapForMana) through this single helper
 * so the auto-pay planner and the explicit tap can't drift (the CREED two-sites invariant).
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
 * Shared by BOTH read-sites (manaSources / legalChoices.actionsTapForMana) through this single helper so
 * the auto-pay planner and the explicit tap can't drift (the CREED two-sites invariant).
 */
// The five basic land types (CR 305.6) a tap-augment may gate on. Anything else the parser emits as a
// subject ("land"/"creature"/"nonland-permanent") is handled by its own gate above.
const BASIC_LAND_SUBTYPES = new Set(["forest", "island", "swamp", "mountain", "plains"]);

export function globalTapManaAugment(state, playerId, sourcePerm) {
  const player = state?.players?.[playerId];
  if (!player || !sourcePerm) return [];
  const srcType = typeLineOf(sourcePerm.card);
  const srcIsLand = /\bLand\b/.test(srcType);
  const srcIsCreature = /\bCreature\b/.test(srcType);
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
      // sameAsProduced (MF-1): the bonus's TYPE is the type this tap produces — resolved by the consumer
      // (manaSources stamps the source's production colors; planPayment/actionsTapForMana credit the
      // PRIMARY chosen color), never an independent color pick (the off-type FP, CREED).
      out.push(aug.sameAsProduced
        ? { sameAsProduced: true, amount: aug.amount }
        : { colors: [...aug.colors], amount: aug.amount });
    }
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
 * Shared by manaSources + legalChoices.actionsTapForMana (the CREED two-sites invariant — the auto-pay
 * planner and the explicit tap must read the same effective production).
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

// ─── Battlefield → available sources ───────────────────────────────────────────

/**
 * Untapped permanents that can produce mana right now, as
 * `{ permanentId, colors, amount }`. Lands + non-creature rocks have no
 * summoning-sickness gate; creature dorks are excluded while summoning sick
 * (unless they have Haste).
 *
 * AURA-LAND-MANA-BOOST: a land carrying a mana-boost Aura also reports `bonus: [{colors,amount},…]`
 * — the additional mana that appears INLINE when this source taps (it doesn't tap the Aura). The
 * planner (planPayment) credits it on tap; the bonus is NOT a separate tappable source.
 */
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
    if (perm.tapped) continue;
    // ACTIVATED-LOCK (BLITZ AU-2, CR 605.1a): a mana ability IS an activated ability, so a permanent under the
    // layer-6 "activatedAbilitiesLocked" grant (an Arrest-class Aura, or Koma mode 1) is NOT a mana source —
    // the mana-path twin of the stack-ability gate in legalChoices. Board-rare (only that grant sets it), so
    // this is a no-op for the common case; mirrors the NR-1 artifact-lock skip just below.
    if (permanentHasKeyword(state, perm.id, "activatedAbilitiesLocked")) continue; // AU-2
    if (artLocked && permanentTypes(state, perm.id).types.includes("Artifact")) continue; // NR-1
    let prod = manaProduction(perm.card);
    // GROUP-GRANT: a permanent with NO own mana ability can have a {T}: Add … MANA ability GRANTED by a lord
    // (Gemhide/Manaweft "All Slivers have \"{T}: Add one mana of any color\"" — every OTHER Sliver gains it).
    // DEDUP (the double-grant landmine): when the permanent ALREADY produces mana from its OWN card, keep the
    // own source and SKIP the grant — the granter (a Sliver) self-includes via "All Slivers", and manaModel
    // already reads its quoted text as its own source (the test-pinned Gemhide self-production). Granting it
    // again would tap it twice. A recipient with its own DIFFERENT ability also keeps only its own (a safe
    // under-count, never a fabricated extra tap). So the grant only ever ADDS a source where there was none.
    if (!prod) {
      const granted = grantedManaSpecsFor(state, perm.id);
      if (granted.length) prod = { colors: granted[0].colors, amount: granted[0].amount, requiresTap: true };
    } else {
      prod = applyAuraManaGrantSupplement(state, perm, prod);   // AURA-MANA-GRANT: a land's own tap upgrades to a dominating aura grant
    }
    if (!prod) continue;
    // ⛔ CONDITION-GATED SOURCE (CR 602.5) — "Activate only if you control three or more artifacts" (Mox Opal
    // #241, Fanatic of Rhonas #418). Evaluated LIVE here, at the ONE chokepoint every consumer of the source
    // list goes through; gating at each consumer instead would guarantee one of them forgets. `!== true` so a
    // condition that cannot be confirmed blocks rather than passes — the FN-safe direction, and the same
    // comparison legalChoices uses for activated abilities.
    if (prod.activationCondition
      && evaluateInterveningIf(state, prod.activationCondition, playerId, { sourcePermanentId: perm.id }) !== true) continue;
    // KW-ENGINES (CR 702.179) — a "Max speed —" mana ability is live ONLY while its controller's speed
    // is 4. Gated here at the same single chokepoint as the activation condition, for the same reason:
    // every affordability/payment consumer reads sources from here, so a below-max source is never
    // counted affordable and never tapped. (Before the speed subsystem existed this line was offered
    // UNGATED — free {R}{R} at speed zero, measured live on Endrider Catalyzer.)
    if (prod.requiresMaxSpeed && (player.speed || 0) < 4) continue;
    const isCreature = /Creature/.test(typeLineOf(perm.card));
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
        && !permanentHasKeyword(state, perm.id, "Haste")) continue;
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
    let extraTaps = null;
    if (prod.extraTap) {
      // ⛔ THE SOURCE EXCLUDES ITSELF ONLY WHEN IT IS ALREADY TAPPING ITSELF. Springleaf Drum pays {T} as
      // part of the same cost, so it cannot also be the tapped creature — and it is an Artifact anyway.
      // Birchlore Rangers has NO {T}: its cost is purely "Tap two untapped Elves you control", and the
      // Rangers IS an untapped Elf, so it is a legal payer for its own ability. Excluding it unconditionally
      // is wrong in the RESTRICTIVE direction — it would demand two OTHER Elves where the card asks for two
      // Elves total. (When it does pay, it ends up tapped, so the ability cannot be reused — which falls out
      // of the tapping rather than needing its own rule.)
      const payers = (player.battlefield || [])
        .filter((p) => (prod.requiresTap ? p.id !== perm.id : true) && !p.tapped && matchesTapOtherFilter(p, prod.extraTap.filter))
        // Payer preference, cheapest-first: a SUMMONING-SICK permanent has nothing else to do this turn, and
        // among the rest a NON-MANA-SOURCE is preferred. ⚠️ That second key matters as soon as "permanent" is an
        // allowed payer noun (Gene Pollinator): tapping a LAND to make one mana is a legal but pointless play
        // that nets zero, and the sim would have made it on every activation. This is a policy, not a rule —
        // both orderings are legal — so it is stated as one.
        // ⚠️ THE SICKNESS KEY IS CREATURE-SCOPED. `createPermanent` stamps summoningSick on EVERY fresh
        // permanent, lands included, and sickness is meaningless for a land tapped as a COST — so an
        // unscoped key sorted a just-played Forest ahead of a ready creature and picked the land. Caught by
        // asserting which payer was chosen rather than only that one was.
        .sort((a, b) =>
          (Number(isCreatureCardType(b.card) && !!b.summoningSick) - Number(isCreatureCardType(a.card) && !!a.summoningSick))
          || (Number(!!manaProduction(a.card)) - Number(!!manaProduction(b.card))));
      if (payers.length < prod.extraTap.count) continue;                 // cannot pay → not a source
      extraTaps = payers.slice(0, prod.extraTap.count).map((p) => p.id);
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
    const bonus = [...landAuraManaBonus(state, perm), ...globalTapManaAugment(state, playerId, perm)]
      .map((b) => (b.sameAsProduced ? { sameAsProduced: true, colors: [...prod.colors], amount: b.amount } : b));
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
    const dynFixed = prod.fixedSpec?.kind === "colorsAmongPermanents"
      ? Object.fromEntries([...new Set((player.battlefield || []).flatMap((p) => colorsOf(p.card)))].map((c) => [c, scale]))
      : null;
    const fixed = dynFixed || (prod.fixed ? Object.fromEntries(Object.entries(prod.fixed).map(([c, n]) => [c, n * scale])) : null);
    // A bundle's TOTAL is its own tally — for the printed karoo family this equals `amount` exactly (two
    // symbols × the multiplier), and for the board-derived VIVID form it is the live color count, replacing
    // the parser's amount:0 placeholder. One rule covers both, so the two can never disagree. A bundle that
    // resolves to no colors totals 0 and is dropped by the `amount > 0` filter in planPayment — the
    // produce-nothing case, never a fabricated mana.
    const bundleTotal = fixed ? Object.values(fixed).reduce((a, b) => a + b, 0) : amount;
    // IMPRINT (CR 207.2c) — Chrome Mox's reachable colors ARE the imprinted card's colors, read live off the
    // stamp resolveImprintChoice wrote. NO stamp (declined, or never offered) and NO colors (a colorless card
    // was imprinted) both mean this permanent is not a mana source: `continue` rather than push an
    // empty-colors source, so it is never offered, never tapped, and never fabricates a color. This is the
    // gate the whole imprint build order existed to make possible.
    if (prod.colorsFromImprint) {
      const imprintedColors = (perm.imprinted?.colors || []).filter((c) => MANA_COLORS.includes(c));
      if (!imprintedColors.length) continue;
      sources.push({ permanentId: perm.id, colors: imprintedColors, amount: bundleTotal, sacrifices: !!prod.sacrifices, ...(isSnowPermanent(perm.card) ? { snow: true } : {}), ...(bonus.length ? { bonus } : {}), ...(prod.restriction ? { restriction: prod.restriction } : {}), ...(extraTaps ? { extraTaps } : {}), ...(prod.payLife != null ? { payLife: prod.payLife } : {}) });
      continue;
    }
    // EXILE-FROM-GY COST (Molt Tender): the source exists ONLY while the graveyard has a card to pay
    // with — an empty graveyard means the cost can't be paid, so the source is never offered (the
    // availability half of the phantom-gate carve; commitManaTap is the payment half).
    if (prod.exilesGyCard && (player.graveyard || []).length === 0) continue;
    sources.push({ permanentId: perm.id, colors: fixed ? Object.keys(fixed) : prod.colors, amount: bundleTotal, sacrifices: !!prod.sacrifices, ...(prod.exilesGyCard ? { exilesGyCard: true } : {}), ...(fixed ? { fixed } : {}), ...(prod.painColors ? { painColors: prod.painColors, painAmount: prod.painAmount } : {}), ...(isSnowPermanent(perm.card) ? { snow: true } : {}), ...(bonus.length ? { bonus } : {}), ...(prod.restriction ? { restriction: prod.restriction } : {}), ...(extraTaps ? { extraTaps } : {}), ...(prod.payLife != null ? { payLife: prod.payLife } : {}) });
  }
  return sources;
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
 * phyrexian pips are assumed paid with life (not mana); X counts as 0.
 * Pathological multicolor costs
 * fall to "can't afford" (null) — never to fabricated mana.
 */
/**
 * @param spendContext  what this payment is FOR — `{ castCard, isCommander }`. Used ONLY to admit
 *   spend-restricted sources (CR 106.6).
 *
 * ⛔ DEFAULT-DENY, AND IT IS LOAD-BEARING FOR EVERY CALLER I DID NOT TOUCH. A restricted source is dropped
 * unless a context is supplied AND satisfies it, so the ~9 existing call sites that pass no context keep
 * behaving exactly as they did — they simply never see restricted mana. A new call site that forgets to
 * thread context under-pays (a clean MANA_SHORT) instead of silently spending restricted mana on the wrong
 * thing. The unsafe direction requires an explicit, wrong context; the safe direction is the default.
 */
export function planPayment(pool, sources, cost, spendContext = null) {
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
    .filter(({ e }) => e && spendRestrictionAllows(e.restriction, spendContext?.castCard, { isCommander: !!spendContext?.isCommander }));
  if (rEntries.length) {
    let effCost = { ...cost };
    for (const { e, i } of rEntries) {
      const es = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
      let any = false;
      for (const c of MANA_COLORS) { // colored pips first — the entry's exact colors
        const take = Math.min(e.pool?.[c] || 0, effCost[c] || 0);
        if (take > 0) { es[c] += take; effCost = { ...effCost, [c]: effCost[c] - take }; any = true; }
      }
      for (const c of MANA_COLORS) { // then generic from what's left in the entry
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

  // `amount ?? 1` (NOT `|| 1`): a hand-built source with NO amount field defaults to 1 (the legacy
  // contract), but a resolved variable source with an explicit amount of 0 (Gaea's Cradle / Sanctum
  // Weaver on an empty board) must NOT be floored UP to 1 — that would fabricate mana (MANA-VARIABLE
  // CREED). A non-positive source produces nothing right now, so drop it from the payable set.
  const avail = sources
    .map(s => ({
      permanentId: s.permanentId,
      colors: s.colors.filter(c => COLOR_SET.has(c)),
      amount: s.amount ?? 1,
      sacrifices: !!s.sacrifices,   // one-shot source (Treasure/Gold) — the commit path sacrifices it
      // AURA-LAND-MANA-BOOST: extra mana produced INLINE when this source (a land) taps — each entry
      // {colors, amount}. Credited on tap; the bonus is part of the land tap, never a separate tap.
      // MANA FLARE (MF-1): a sameAsProduced bonus keeps its marker — tapSource binds its color to the
      // PRIMARY's chosen color (the type this tap produced), never an independent pick (CREED, off-type FP).
      bonus: Array.isArray(s.bonus) ? s.bonus.map(b => ({ colors: b.colors.filter(c => COLOR_SET.has(c)), amount: b.amount, ...(b.sameAsProduced && { sameAsProduced: true }) })).filter(b => b.amount > 0 && b.colors.length) : [],
      snow: !!s.snow,   // SNOW (SN-1): a source produced by a snow permanent — the only kind that can pay a {S} pip
      // SPEND-RESTRICTED (CR 106.6): the permission this source's mana carries. Filtered out entirely below
      // unless the caller supplied a spend context that satisfies it — see the DEFAULT-DENY note.
      restriction: s.restriction || null,
      // TAP-OTHER payers, resolved by manaSources against the live board. Carried verbatim so the plan the
      // committer executes is the plan the planner priced — the same "affordable == actually paid" invariant
      // the fixed-bundle and painland fields exist to hold.
      extraTaps: Array.isArray(s.extraTaps) ? [...s.extraTaps] : null,
      payLife: s.payLife ?? null,
      // PAINLAND: the colours that cost life, and how much. Carried so tapSource can stamp the tap.
      painColors: Array.isArray(s.painColors) ? s.painColors : null,
      painAmount: s.painAmount || 0,
      // MIXED FIXED BUNDLE (karoo / signet): a per-color tally this source produces SIMULTANEOUSLY. When
      // present it REPLACES the primary component's "pick one color × amount" — see tapSource.
      fixed: s.fixed && Object.keys(s.fixed).length > 1 ? { ...s.fixed } : null,
      used: false,
    }))
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
      if (!spendRestrictionAllows(s.restriction, spendContext?.castCard, { isCommander: !!spendContext?.isCommander })) return false;
      const totalPips = (cost.generic || 0)
        + MANA_COLORS.reduce((n, col) => n + (cost[col] || 0), 0)
        + (Array.isArray(cost.hybrid) ? cost.hybrid.length : 0);
      return s.amount <= totalPips;
    });
  const taps = [];
  const spendOne = (color) => { working[color] -= 1; spend[color] += 1; };

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
    // Components: the primary land mana (one chosen color from s.colors) + each bonus entry.
    const components = [{ colors: s.colors, amount: s.amount, primary: true }, ...s.bonus.map(b => ({ colors: b.colors, amount: b.amount, primary: false, sameAsProduced: !!b.sameAsProduced }))];
    let primaryColor = null;
    const bonusPicks = [];
    let assigned = false;
    const pickColor = (comp) => {
      // If we still owe `wantColor` and this component can make it, spend it there first.
      if (!assigned && wantColor && comp.colors.includes(wantColor)) { assigned = true; return wantColor; }
      // Else prefer a color the cost STILL needs (helps later pips), else the component's first color.
      const needed = comp.colors.find(c => (cost[c] || 0) - (spend[c] || 0) - (working[c] || 0) > 0);
      return needed || comp.colors[0];
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
      // MANA FLARE (MF-1, CR 106.1b): a sameAsProduced bonus is "one mana of any type THAT LAND PRODUCED" — its
      // color IS the primary's chosen color (the primary component is first, so primaryColor is already set),
      // NEVER an independent pick: one Adarkar Wastes tap under Mana Flare makes WW or UU, never W+U (CREED).
      const color = comp.sameAsProduced ? primaryColor : pickColor(comp);
      working[color] += comp.amount;
      if (comp.primary) primaryColor = color;
      else bonusPicks.push({ color, amount: comp.amount });
    }
    // PAINLAND: stamp the life cost ONLY when the chosen colour is one of the painful ones — a tap for
    // the free {C} half costs nothing, exactly as printed.
    const painHit = s.painColors && s.painColors.includes(primaryColor) ? s.painAmount : 0;
    taps.push({ permanentId: s.permanentId, color: primaryColor, amount: s.amount, ...(s.extraTaps ? { extraTaps: s.extraTaps } : {}), ...(s.payLife != null ? { payLifeCost: s.payLife } : {}), ...(painHit ? { painLife: painHit } : {}), ...(s.fixed && { fixed: { ...s.fixed } }), ...(s.sacrifices && { sacrifices: true }), ...(s.exilesGyCard && { exilesGyCard: true }), ...(bonusPicks.length && { bonus: bonusPicks }) });
    return wantColor && assigned ? wantColor : primaryColor;
  };

  // Tap the most-constrained untapped source that can make `color` (via own mana OR a boost-Aura bonus).
  const tapForColor = (color) => {
    let best = -1;
    let bestLen = Infinity;
    for (let i = 0; i < avail.length; i++) {
      const s = avail[i];
      if (s.used || !sourceCanMake(s, color)) continue;
      // Constraint = how many distinct colors this source can make (own ∪ bonus); the least-flexible wins.
      const flex = new Set([...s.colors, ...s.bonus.flatMap(b => b.colors)]).size;
      if (flex < bestLen) { bestLen = flex; best = i; }
    }
    if (best === -1) return false;
    tapSource(avail[best], color);
    return true;
  };

  // Tap any remaining source (for generic). Returns a color it produced. Prefers a REPEATABLE source
  // over a one-shot sacrifice source (Treasure/Gold) so we never crack a Treasure for generic while an
  // untapped land/rock could pay it — a play-quality refinement, not a legality change.
  const tapAny = () => {
    for (const preferSac of [false, true]) {
      for (const s of avail) {
        if (s.used || s.colors.length === 0 || !!s.sacrifices !== preferSac) continue;
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
      if (s.used || !s.snow) continue;
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

  // 3. Generic — any mana works. Spend the pool first, then tap.
  let generic = cost.generic || 0;
  if (generic > 0) {
    for (const c of MANA_COLORS) {
      while (generic > 0 && working[c] > 0) { spendOne(c); generic -= 1; }
    }
  }
  while (generic > 0) {
    const color = tapAny();
    if (color === null) return null;
    while (generic > 0 && working[color] > 0) { spendOne(color); generic -= 1; }
    // MIXED FIXED BUNDLE (karoo / signet): a tap can produce SEVERAL colors at once, and `tapAny` reports only
    // the primary. Draining just that one stranded the rest — a Selesnya Signet could not pay {2}, which it
    // plainly does. Generic is paid LAST (snow → colored → here), so nothing colored is still owed and any
    // color left in `working` is legitimately spendable on generic. A single-color tap leaves nothing extra
    // here, so this is a no-op for every source that isn't a bundle. Surplus still floats.
    for (const c of MANA_COLORS) {
      while (generic > 0 && working[c] > 0) { spendOne(c); generic -= 1; }
    }
  }

  return { taps, spend, ...(entrySpends.length ? { entrySpends } : {}) };
}

/**
 * Can `cost` be paid from `pool` plus tapping `sources`? Pure — no mutation.
 * legalChoices uses this for cast-spell legality.
 */
export function canAfford(pool, sources, cost, spendContext = null) {
  return planPayment(pool, sources, cost, spendContext) !== null;
}

/**
 * W1 — THE single mana-tap commit (one tap of a payment plan, or one explicit tap-for-mana action; both
 * carry the same `{ color, amount, bonus, sacrifices, permanentId }` shape). Add the source's mana to the
 * pool (plus any inline boost-Aura bonus — the Aura is NOT tapped/consumed, CR 605.1b), then either TAP a
 * repeatable land/rock/dork or — for a one-shot sacrifice-for-mana source (Treasure / Gold / Lotus Petal,
 * `tap.sacrifices`) — SACRIFICE it (battlefield → graveyard) so it can't ramp again (the TOK-2 correctness
 * invariant). Those sources are non-creatures, so no dies trigger fires; routing the removal through
 * moveCardToZone keeps it on the one shared zone-move path. The crack fires "whenever you sacrifice an
 * artifact/permanent" (SAC-TREASURE, CR 701.21) and drains the pending leave event NOW (LEAVE-DRAIN,
 * CR 603.3b) so permanentLeaves watchers stack in cost order, not at the NEXT stack resolution against a
 * battlefield that may have changed (the stale-scan FP window). Shared by every payment path — the
 * dispatcher's plan commits, applyTapForMana's explicit tap, and payManaCost's resolution-layer payment —
 * so the commit semantics can't drift.
 */
export function commitManaTap(state, playerId, tap) {
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
  // ⛔ TAP-OTHER: pay the printed extra cost by actually tapping the payers manaSources reserved. Without
  // this the source produces mana for free — the PHANTOM MANA the compound-cost guard refused these cards to
  // prevent, reintroduced one layer down. Done BEFORE the source's own tap/sacrifice so a failure here
  // cannot leave the source spent with the cost unpaid.
  for (const id of tap.extraTaps || []) next = tapPermanent(next, id);
  // ⛔ PAY-LIFE: spend the printed cost. Named `payLifeCost` and NOT `painLife` on purpose — painlands
  // already own that field, and folding the two would make a painland's colour choice and an ability's
  // printed cost indistinguishable in the plan.
  if (tap.payLifeCost) next = loseLife(next, { playerId, amount: tap.payLifeCost });
  // EXILE-FROM-GY COST (Molt Tender) — PAY the printed cost for real: exile a graveyard card as the tap
  // commits (the payment half of the phantom-gate carve; manaSources' non-empty gate is the offer half).
  // Deterministic house pick, the riot discipline: the FIRST (oldest) graveyard card — a smarter pick is
  // a play-quality upgrade, never a rules question. An empty graveyard here (a same-plan earlier tap
  // drained it) exiles nothing and the tap still resolves — logged distinctly so the under-pay is VISIBLE,
  // never silent; the offer gate makes this vanishingly rare.
  if (tap.exilesGyCard) {
    const gy = next.players[playerId]?.graveyard || [];
    if (gy.length) {
      next = moveCardToZone(next, { playerId, fromZone: "graveyard", toZone: "exile", cardId: gy[0].id });
    } else {
      next = logEvent(next, { kind: "mana", event: "exile-gy-cost-unpaid", permanentId: tap.permanentId, playerId });
    }
  }
  if (tap.sacrifices) {
    const sacPerm = next.players[playerId]?.battlefield?.find(p => p.id === tap.permanentId); // capture pre-move (for the type)
    next = moveCardToZone(next, { playerId, fromZone: "battlefield", toZone: "graveyard", cardId: tap.permanentId });
    if (sacPerm) next = checkSacrificeTriggers(next, playerId, { id: sacPerm.id, controller: playerId, card: sacPerm.card });
    next = checkLeavesTriggers(next);
  } else {
    next = tapPermanent(next, tap.permanentId);
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
export function commitPaymentPlan(state, playerId, plan) {
  let next = state;
  for (const tap of plan?.taps || []) next = commitManaTap(next, playerId, tap);
  const topped = next.players[playerId].manaPool;
  const nextPool = {};
  for (const col of Object.keys(topped)) nextPool[col] = (topped[col] || 0) - (plan?.spend?.[col] || 0);
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
  return { ...next, players: { ...next.players, [playerId]: { ...next.players[playerId], manaPool: nextPool, ...(restrictedMana !== next.players[playerId].restrictedMana ? { restrictedMana } : {}) } } };
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
    !(Array.isArray(c.hybrid) && c.hybrid.length);
  if (empty) return { state, paid: true };
  const player = state?.players?.[playerId];
  if (!player) return { state, paid: false };
  const plan = planPayment(player.manaPool, manaSources(state, playerId), c);
  if (!plan) return { state, paid: false };
  return { state: commitPaymentPlan(state, playerId, plan), paid: true };
}

// Internal exports for tests.
export const _internals = { parseAddClause, hasHaste, BASIC_LAND_MANA, KNOWN_ROCKS };
