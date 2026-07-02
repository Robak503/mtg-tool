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

import { MANA_COLORS, addMana, moveCardToZone, tapPermanent, findPermanent } from "./gameState.js";
import { checkSacrificeTriggers, checkLeavesTriggers } from "./triggers.js"; // SAC-TREASURE: a cracked one-shot mana source is a sacrifice; LEAVE-DRAIN: its exit drains at cost time (CR 603.3b)
import { permanentHasKeyword, grantedManaSpecsFor } from "./layers.js";
import { countForSpec } from "./effects/atoms/shared.js"; // MANA-VARIABLE: resolve a count-derived mana amount (leaf-safe: shared → gameState only)
import { parseAuraLandManaBonus, parseGlobalTapManaAugment } from "./staticAbilityParser.js"; // AURA-LAND-MANA-BOOST + GLOBAL-TAP-AUGMENT: extra mana from a "tapped for mana" boost (leaf: static parser → keywords only)
import { manaMultiplier } from "./replacementEffects.js"; // MANA-MULTIPLIER: ×N tap-for-mana replacement (Mana Reflection/Nyxbloom; leaf, no cycle)

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

function parseManaMetric(tail) {
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
    return null;
  }

  // "greatest power among (other) creatures you control" → max layer-resolved power.
  m = t.match(/^greatest power among (other )?creatures you control$/);
  if (m) return { kind: "greatestPowerYouControl", ...(m[1] ? { excludeSelf: true } : {}) };

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
function parseAddClause(oracle) {
  if (!/\badd\b/i.test(oracle)) return null;

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
    const spec = parseManaMetric(v[2]);
    if (spec && symbols.length) return { colors: [...new Set(symbols)], amount: 0, amountSpec: spec };
    return null; // unmodeled metric (or no symbol) — non-native, never a fabricated fallback
  }

  // Shape B — "Add X mana (of any one color | of any color)?, where X is <metric>". "in any
  // combination of colors" (Selvala) is deliberately NOT matched here → falls through to null below.
  v = oracle.match(/\bAdd X mana(?: of any(?: one)? color)?, (where X is [^.]+)/i);
  if (v) {
    const spec = parseManaMetric(v[1]);
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
function manaCostModelable(cost) {
  if (/\{t\}/i.test(cost)) return true;                    // {T}: a tap dork (summoning-sickness gated)
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
  if (/\{t\}/i.test(cost)) return false;
  if (/\bsacrifice (?:this|~)\b/i.test(cost)) return false;
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
    /(\bcreates?\b[^.]*?\btokens?\b[^.]*?)\.\s+it has (["“'])/gi,
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
export function manaProduction(card) {
  if (!card) return null;
  if (typeof card === "object") {
    if (_prodMemo.has(card)) return _prodMemo.get(card);
    const result = manaProductionImpl(card);
    _prodMemo.set(card, result);
    return result;
  }
  return manaProductionImpl(card);
}

function manaProductionImpl(card) {
  if (!card) return null;

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
  let oracleForAdd = isLandCard
    ? oracleOf(card)
    : stripCreatedTokenAbilities(stripReminder(oracleOf(card)));
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
  // UNMODELED UNTAP RESTRICTION (CREED): "doesn't untap during your untap step" is not modeled (untapAll
  // frees everything each untap step), so a standing source carrying it produces PHANTOM repeatable mana —
  // Mana Vault read as a free 3-mana rock every turn. Route such non-lands out of the mana model entirely
  // (a safe under-count: the card still casts and resolves; it just never auto-taps for mana).
  if (!isLandCard && /doesn't untap during your (?:next )?untap step/i.test(oracleForAdd)) return null;
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
  const fromOracle = parseAddClause(oracleForAdd);
  // A NON-LAND activated mana ability must also be PAYABLE by the sim as a standing source. An ability whose
  // only cost is a CONSUMABLE/non-repeatable resource the sim can't spend — a non-self sacrifice (Utopia Mycon
  // "Sacrifice a Saproling: Add {C}{C}"), pay-life, discard, remove-counter, exile, tap-OTHER, return-to-hand —
  // is NOT a free, tapless, repeatable source. Reading it minted PHANTOM mana the self-play sim "paid" every
  // turn for free (dirtying training data). Gate it like the TRIGGERED/ETB phantom case above. Lands are exempt
  // (raw-oracle parsing + their colorless fallback). RUNTIME-ONLY: classifyCard never calls manaProduction.
  const isActivatedSource =
    isLandCard || (activatedManaText(oracleForAdd) != null && !manaAbilityCostUnpayable(oracleForAdd));
  if (fromOracle && isActivatedSource) {
    const requiresTap = manaAbilityRequiresTap(oracleForAdd);
    return manaAbilitySacrificesSelf(oracleForAdd)
      ? { ...fromOracle, sacrifices: true, requiresTap }
      : { ...fromOracle, requiresTap };
  }

  // A land we couldn't otherwise parse still taps for something — assume
  // colorless so it can at least pay generic. Never invents a color.
  if (isLandCard) {
    return { colors: ["C"], amount: 1 };
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
    if (bonus) out.push({ colors: [...bonus.colors], amount: bonus.amount });
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
export function globalTapManaAugment(state, playerId, sourcePerm) {
  const player = state?.players?.[playerId];
  if (!player || !sourcePerm) return [];
  const srcType = typeLineOf(sourcePerm.card);
  const srcIsLand = /\bLand\b/.test(srcType);
  const srcIsCreature = /\bCreature\b/.test(srcType);
  const out = [];
  for (const perm of player.battlefield) {
    const aug = parseGlobalTapManaAugment(perm.card);
    if (!aug) continue;
    if (aug.subject === "land" && !srcIsLand) continue;
    if (aug.subject === "creature" && !srcIsCreature) continue;
    out.push({ colors: [...aug.colors], amount: aug.amount });
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
    if (g.via !== "attached") continue;               // only a genuinely-distinct aura ability supplements
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
  const sources = [];
  for (const perm of player.battlefield) {
    if (perm.tapped) continue;
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
    const isCreature = /Creature/.test(typeLineOf(perm.card));
    // GRANTED Haste counts (read through the layer engine), not just printed — a mana dork
    // enchanted/anthemed with Haste can tap the turn it enters. Falls back to the printed
    // seed when there are no continuous effects (the common case), so the hot path is cheap.
    // EXCEPTION (CR 302.6): summoning sickness gates a {T}/{Q} ability, but a sac-for-mana ability with
    // NO {T} (an Eldrazi Spawn "Sacrifice this token: Add {C}", or a Treasure on a creature body) is
    // usable the turn the creature enters — so a freshly-created Spawn ramps immediately. All other
    // summoning-sick creatures (Haste-less {T} dorks) stay excluded exactly as before.
    const usableWhileSick = prod.sacrifices && !prod.requiresTap;
    if (isCreature && perm.summoningSick && !usableWhileSick
        && !permanentHasKeyword(state, perm.id, "Haste")) continue;
    // MANA-VARIABLE: a count-derived amount (Gaea's Cradle "for each creature", Karametra "devotion",
    // Bighorner "greatest power", …) is resolved LIVE against the controller's board (CR 608.2g),
    // floored at 0 — never the parser's amount:0 placeholder. ctx.source = this permanent so an
    // excludeSelf metric ("greatest … among OTHER creatures") drops it. A repeatable tap source with
    // a resolved amount of 0 still appears (it's a legal-but-pointless tap); the action layer
    // (actionsTapForMana) skips offering a 0-mana tap.
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
    const bonus = [...landAuraManaBonus(state, perm), ...globalTapManaAugment(state, playerId, perm)];
    sources.push({ permanentId: perm.id, colors: prod.colors, amount, sacrifices: !!prod.sacrifices, ...(bonus.length ? { bonus } : {}) });
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
export function planPayment(pool, sources, cost) {
  const spend = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  if (!cost) return { taps: [], spend };

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
      bonus: Array.isArray(s.bonus) ? s.bonus.map(b => ({ colors: b.colors.filter(c => COLOR_SET.has(c)), amount: b.amount })).filter(b => b.amount > 0 && b.colors.length) : [],
      used: false,
    }))
    .filter(s => s.amount > 0);
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
    const components = [{ colors: s.colors, amount: s.amount, primary: true }, ...s.bonus.map(b => ({ colors: b.colors, amount: b.amount, primary: false }))];
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
      const color = pickColor(comp);
      working[color] += comp.amount;
      if (comp.primary) primaryColor = color;
      else bonusPicks.push({ color, amount: comp.amount });
    }
    taps.push({ permanentId: s.permanentId, color: primaryColor, amount: s.amount, ...(s.sacrifices && { sacrifices: true }), ...(bonusPicks.length && { bonus: bonusPicks }) });
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
  }

  return { taps, spend };
}

/**
 * Can `cost` be paid from `pool` plus tapping `sources`? Pure — no mutation.
 * legalChoices uses this for cast-spell legality.
 */
export function canAfford(pool, sources, cost) {
  return planPayment(pool, sources, cost) !== null;
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
  let next = addMana(state, { playerId, color: tap.color, amount: tap.amount ?? 1 });
  for (const b of tap.bonus || []) next = addMana(next, { playerId, color: b.color, amount: b.amount });
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
  return { ...next, players: { ...next.players, [playerId]: { ...next.players[playerId], manaPool: nextPool } } };
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
