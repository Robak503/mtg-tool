/**
 * effects/castModifiers.js — cast-cost extraction + spell-disposition strips.
 *
 * Extracted verbatim from parser.js (slice 5 of the parser.js decomposition,
 * 2026-07-18). Three families, all consumed by parseEffectProgram's pre-parse:
 *   - ADDITIONAL COSTS (ADDCOST-1/2, AC-1): extractAdditionalCosts — the "as an
 *     additional cost" sentence → supported cost specs (sacrifice / payLife / discard).
 *   - ALTERNATIVE COSTS: extractAltCost (+ the private ALT_COST_MATCHERS table and
 *     parseAltCostCondition) — the "you may cast ~ without paying its mana cost if …"
 *     family → supported alt-cost specs.
 *   - VACUOUS-LINE + DISPOSITION STRIPS: stripSelfCostReduction / stripStormKeywordLine /
 *     stripDevoidLine (resolution-invariant line strips) and the two spell-disposition
 *     peels stripSelfShuffleIntoLibrary (Sun's Zenith / Beacon family → selfShuffle) /
 *     stripReboundLine (rebound is FN-safe for the normal cast).
 *
 * matchKickedSpellEffect deliberately STAYS in parser.js: it re-parses both its halves
 * through the FULL clause pipeline (parseEffectClause + programConfidence) — moving it
 * would force a cycle.
 *
 * LEAF over the parseHelpers leaf (SMALL_NUM word→count, for the AC-1 count-of-N
 * cost forms); every function is `String|card → spec|String`. parser.js imports the
 * 7 functions back (all called from parseEffectProgram) plus the two SUPPORTED_*
 * kind sets — they feed programConfidence's LOW-until-vetted cost gates, so the
 * vetted-kind vocabulary and its extractors stay in one file.
 */
import { SMALL_NUM } from "./parseHelpers.js";

const ADDITIONAL_COST_RE = /\bas an additional cost to cast this spell,\s*([^.]+)\.\s*/i;
// ADDCOST-1 sac victims — single types PLUS the "artifact or creature" UNION (Deadly Dispute, Deadly
// Dispute-style "sacrifice an artifact or creature"). The union is enforced as one sacType key
// ("artifactOrCreature"); legalChoices.sacTypeMatches offers a victim matching EITHER type.
const SAC_COST_RE = /^sacrifice (?:a|an) (artifact or creature|creature or artifact|creature|permanent|artifact|enchantment|land)$/i;
// AC-1 (count-of-N, CR 601.2f) — the PLURAL form: "sacrifice two/three/four/five <type>s" (Bankrupt in Blood,
// Phyrexian Tribute "sacrifice two creatures"; Gaea's Balance "sacrifice five lands"). Canonicalized to the SAME
// singular sacType key the N=1 form emits (creatures→creature, lands→land), so sacTypeMatches is untouched; the
// only new field is `count:N`. The "artifact or creature" union stays N=1-only (no count-N corpus card needs it).
const SAC_COUNT_COST_RE = /^sacrifice (two|three|four|five) (creatures|permanents|artifacts|enchantments|lands)$/i;
const PAYLIFE_COST_RE = /^pay (\d+) life$/i;                        // ADDCOST-2 — no-choice life cost (N already numeric)
const DISCARD_COST_RE = /^discard (?:a|an|one) card$/i;            // ADDCOST-2 — the N=1 form
const DISCARD_COUNT_COST_RE = /^discard (two|three|four|five) cards$/i; // AC-1 (count-of-N) — "discard two/three… cards" (Cathartic Reunion)
// ADDCOST-3 (census slice 33) — "exile a <type> card from your graveyard" (Makeshift Mauler, Stitched
// Drake class). SINGULAR ONLY, exactly how the sacrifice lane started: the count-N forms ("exile two/three
// creature cards") and every X form ("exile X cards from your graveyard") stay unmodeled → Arbiter, a safe
// false negative. A graveyard is a public zone and the choice is a free one, so legalChoices picks a victim
// with the same least-valuable policy the discard cost already uses.
const EXILE_GY_COST_RE = /^exile (?:a|an) (creature|artifact|land|instant or sorcery) card from your graveyard$/i;
export const SUPPORTED_ADDITIONAL_COST_KINDS = new Set(["sacrifice", "payLife", "discard", "exileFromGraveyard"]);

/**
 * Pull a modeled additional cost off a spell's oracle. Returns `{ costs, rest }`:
 *   - `costs`: `[cost]` when the (sole) additional cost is a modeled type AND the remaining effect does NOT
 *     reference the paid-cost object; otherwise `null`. Modeled cost shapes:
 *       `{ kind:"sacrifice", sacType }` (ADDCOST-1, N=1) · `{ kind:"sacrifice", sacType, count:N }` (AC-1, N>1) ·
 *       `{ kind:"payLife", amount }` · `{ kind:"discard", count:N }` (N=1 or, AC-1, N>1).
 *   - `rest`: the oracle with the cost sentence removed — ONLY when `costs !== null`; otherwise the oracle
 *     unchanged (so the un-strippable cost sentence keeps the card LOW).
 * CONSERVATIVE by construction: anything but a modeled cost form (a count, a compound, an "or pay {N}" alt,
 * an X-life, a multi-card discard) leaves the oracle untouched → Arbiter.
 */
export function extractAdditionalCosts(oracle) {
  const m = ADDITIONAL_COST_RE.exec(oracle);
  if (!m) return { costs: null, rest: oracle };
  const phrase = m[1].trim();
  const sac = SAC_COST_RE.exec(phrase);
  const sacN = SAC_COUNT_COST_RE.exec(phrase);   // AC-1 count-of-N — tried only when the N=1 singular form misses
  const life = PAYLIFE_COST_RE.exec(phrase);
  const disc = DISCARD_COST_RE.exec(phrase);
  const discN = DISCARD_COUNT_COST_RE.exec(phrase); // AC-1 count-of-N
  const exGy = EXILE_GY_COST_RE.exec(phrase);      // ADDCOST-3 — exile a typed card from your own graveyard
  let cost, selfRef = null;
  if (sac) {
    // Canonicalize the "artifact or creature" / "creature or artifact" union to one sacType key.
    const raw = sac[1].toLowerCase();
    const sacType = (raw === "artifact or creature" || raw === "creature or artifact") ? "artifactOrCreature" : raw;
    cost = { kind: "sacrifice", sacType };                                            // N=1 — BYTE-IDENTICAL (no count field)
    selfRef = /\bsacrificed\b/i;
  }
  else if (sacN) {
    // AC-1: "sacrifice two/three… <type>s" — the plural type is stripped to the singular sacType key the N=1
    // form uses (creatures→creature, lands→land), so sacTypeMatches / the whole cost pipeline is unchanged.
    const sacType = sacN[2].toLowerCase().replace(/s$/, "");
    cost = { kind: "sacrifice", sacType, count: SMALL_NUM[sacN[1].toLowerCase()] };
    selfRef = /\bsacrificed\b/i;
  }
  else if (life) { cost = { kind: "payLife", amount: parseInt(life[1], 10) }; }       // no-choice: deduct N at cast
  else if (disc) { cost = { kind: "discard", count: 1 }; selfRef = /\bdiscarded\b/i; } // N=1 — BYTE-IDENTICAL
  else if (discN) { cost = { kind: "discard", count: SMALL_NUM[discN[1].toLowerCase()] }; selfRef = /\bdiscarded\b/i; } // AC-1 N>1
  // ADDCOST-3: the paid card is EXILED, so an effect reading it back ("the exiled card") can't be fed the
  // cost details — the selfRef guard below drops such a card to LOW exactly like the sacrifice/discard forms.
  else if (exGy) { cost = { kind: "exileFromGraveyard", cardType: exGy[1].toLowerCase() }; selfRef = /\bexiled\b/i; }
  else return { costs: null, rest: oracle };                   // unmodeled cost-type / count / compound → LOW
  const rest = (oracle.slice(0, m.index) + oracle.slice(m.index + m[0].length)).trim();
  // Self-reference guard: an effect that reads the paid-cost object ("…damage equal to the sacrificed
  // creature's power", "the sacrificed creature", "for each card discarded") can't be fed the cost details —
  // leave the whole card LOW. UNMODELED_MARKERS catches "equal to"/"for each"; this is belt-and-suspenders.
  if (selfRef && selfRef.test(rest)) {
    // SACRIFICED REFERENT — the guard above exists because the effect "can't be fed the cost details". That
    // premise is now FALSE for exactly three magnitudes: actionDispatcher captures the victim's layer-aware
    // power/toughness and its mana value at COST-PAYMENT time (CR 608.2h + 603.6e LKI), and countForSpec
    // reads them back through the sacrificedPower / sacrificedToughness / sacrificedManaValue kinds.
    //
    // So the guard is NARROWED, not lifted: the card is admitted only when EVERY "sacrificed" mention in the
    // remaining text is one of those three modeled phrases. Any other self-reference — naming the creature as
    // an OBJECT ("return the sacrificed creature"), its colors/types, or a discard/exile referent (whose cost
    // details are still uncaptured) — keeps the whole card LOW exactly as before.
    const SAC_MODELED = /\bthe sacrificed (?:creature|permanent|artifact)'s (?:power|toughness|mana value)\b/gi;
    const isSacCost = cost.kind === "sacrifice";
    const residual = isSacCost ? rest.replace(SAC_MODELED, " ") : rest;
    if (!(isSacCost && !selfRef.test(residual))) return { costs: null, rest: oracle };
  }
  return { costs: [cost], rest };
}

// ===== ALT-COST (CR 601.2b / 118.9) — a PRINTED alternative casting cost ("… rather than pay this spell's
// mana cost" / "you may cast this spell without paying its mana cost"). Treated EXACTLY like the
// CAST_KEYWORD_LINE strips (flashback / jump-start / overload — see stripStormKeywordLine & friends): strip
// the alternative-casting sentence, parse the REMAINING effect through the normal all-or-nothing pipeline,
// and attach `altCost` metadata to the program. The card becomes native because its EFFECT is fully modeled
// AND it is castable at its PRINTED mana cost (Cyclonic Rift / Firebolt / Chemister's Insight are all
// native-spell today by exactly this logic). The alt-cost is an OPTIONAL alternative the engine RECORDS
// (program.altCost, forward-compatible) but does not yet OFFER — a safe false-NEGATIVE on an optional
// cost-reduction: the card never plays WRONG, it only forgoes a legal discount. Actually OFFERING the alt-cost
// at the cast path (so the AI pays life/exiles/sacs to cast it) is separate play-quality work. CONSERVATIVE:
// only a MODELED {kind,condition} strips; anything else leaves the sentence in place → the card stays LOW.
// Wave 3a models the FREE kind, condition controlCommander only (Fierce Guardianship, Deadly Rollick, Flawless
// Maneuver — the "free if you control a commander" cycle); pitch/sac/return kinds + other conditions land next.
// Anchored to a whole sentence at oracle start or after a newline; the condition capture forbids commas /
// periods / newlines so it can never span into the effect body.
export const SUPPORTED_ALT_COST_KINDS = new Set(["free", "payLifeExilePitch", "exileColorCard", "sacrificeCreature", "payLife", "returnLandsToHand"]);

// Map a captured "if <cond>," phrase → a condition enum (a STRING — inert metadata today, since the alt-cost is
// recorded but not yet OFFERED; the future cast-path offer will evaluate it). An UNRECOGNIZED condition → null,
// which rejects the whole alt-cost so the card stays LOW (never credit a gate we can't name). Absent → "always".
function parseAltCostCondition(phrase) {
  if (phrase == null) return "always";
  const p = phrase.trim().toLowerCase();
  if (p === "you control a commander") return "controlCommander";
  if (p === "it's not your turn") return "notYourTurn";
  if (p === "an opponent controls a forest and you control an island") return "submergeGate"; // Submerge
  const land = p.match(/^you control an? (\w+)$/);
  if (land) {
    const sub = land[1][0].toUpperCase() + land[1].slice(1);
    if (["Swamp", "Island", "Forest", "Mountain", "Plains"].includes(sub)) return "controlLand:" + sub;
  }
  return null;                                            // unmodeled condition → reject → stays LOW
}

// The modeled printed-alt-cost sentence shapes. Each: an anchored regex (a whole sentence at oracle start or
// after a newline; the captures can never span into the effect body) + a builder → an altCost descriptor, or
// null to REJECT (leave the sentence in → the card stays LOW). Tried in order; the first that both matches AND
// builds non-null wins. Only the FREE kind waives mana entirely (a future offer reuses action.freeCast); the
// pitch/sac/return kinds pay their own printed cost. All are recorded as metadata only for now (§ extractAltCost).
const ALT_COST_MATCHERS = [
  // FREE — "[if <cond>, ]you may cast this spell without paying its mana cost." (Fierce Guardianship, Submerge).
  { re: /(?:^|\n)\s*(?:if ([^,.\n]+), )?you may cast this spell without paying its mana cost\.\s*/i,
    build: (m) => { const c = parseAltCostCondition(m[1]); return c && { kind: "free", condition: c }; } },
  // PITCH-LIFE-EXILE — "you may pay N life and exile a <color> card from your hand rather than pay this spell's mana cost." (Force of Will).
  { re: /(?:^|\n)\s*you may pay (\d+) life and exile an? (\w+) card from your hand rather than pay this spell's mana cost\.\s*/i,
    build: (m) => ({ kind: "payLifeExilePitch", amount: Number(m[1]), color: m[2].toLowerCase(), condition: "always" }) },
  // EXILE-COLOR — "[if it's not your turn, ]you may exile a <color> card from your hand rather than pay this spell's mana cost." (Force of Negation, Misdirection).
  { re: /(?:^|\n)\s*(if it's not your turn, )?you may exile an? (\w+) card from your hand rather than pay this spell's mana cost\.\s*/i,
    build: (m) => ({ kind: "exileColorCard", color: m[2].toLowerCase(), condition: m[1] ? "notYourTurn" : "always" }) },
  // SAC-CREATURE — "you may sacrifice a [nontoken ]<color> creature rather than pay this spell's mana cost." (Flare of Denial / Cultivation).
  { re: /(?:^|\n)\s*you may sacrifice a (nontoken )?(\w+) creature rather than pay this spell's mana cost\.\s*/i,
    build: (m) => ({ kind: "sacrificeCreature", nontoken: !!m[1], color: m[2].toLowerCase(), condition: "always" }) },
  // PAYLIFE — "[if <cond>, ]you may pay N life rather than pay this spell's mana cost." (Snuff Out — controlLand Swamp).
  { re: /(?:^|\n)\s*(?:if ([^,.\n]+), )?you may pay (\d+) life rather than pay this spell's mana cost\.\s*/i,
    build: (m) => { const c = parseAltCostCondition(m[1]); return c && { kind: "payLife", amount: Number(m[2]), condition: c }; } },
  // RETURN-LANDS — "you may return two <Subtype>s you control to their owner's hand rather than pay this spell's mana cost." (Gush).
  { re: /(?:^|\n)\s*you may return (two|three) (\w+)s you control to their owner's hand rather than pay this spell's mana cost\.\s*/i,
    build: (m) => ({ kind: "returnLandsToHand", count: m[1] === "two" ? 2 : 3, subtype: m[2][0].toUpperCase() + m[2].slice(1), condition: "always" }) },
];

export function extractAltCost(oracle) {
  for (const { re, build } of ALT_COST_MATCHERS) {
    const m = re.exec(oracle);
    if (!m) continue;
    const altCost = build(m);
    if (!altCost) continue;                                          // matched shape but unmodeled detail (bad condition) → leave LOW
    const rest = (oracle.slice(0, m.index) + oracle.slice(m.index + m[0].length)).trim();
    if (!rest) continue;                                             // no effect body left → nothing to model
    return { altCost, rest };
  }
  return { altCost: null, rest: oracle };
}

// SELF-COST-REDUCTION sentence (CR 601.2f) — "This spell costs {N} less to cast …" reduces the spell's CAST
// cost only; it is NEVER a resolution effect (the mana value and the on-stack effect are untouched, CR 202.3).
// So for the EFFECT program it is pure residue — strip it before parsing so an otherwise-modeled spell isn't
// dragged LOW by a cast-cost line the resolver never runs (Blasphemous Act: "This spell costs {1} less to cast
// for each creature on the battlefield. Blasphemous Act deals 13 damage to each creature." → the strip leaves
// the bare modeled mass-burn). Anchored to a sentence that STARTS with "this spell costs {" and contains "less
// to cast", so it can only ever consume a real cast-cost-reduction sentence — never resolution text (which
// never opens with "This spell costs {"). The actual reduction is applied independently at the cast site by
// legalChoices.selfCostReductionForSpell (which reads the raw card oracle, not this program), so stripping it
// here cannot drop a modeled reduction. An UNmodeled reduction metric simply isn't applied at cast (the engine
// pays full price — a SAFE limitation), but the effect now resolves natively instead of routing to the Arbiter.
const SELF_COST_REDUCTION_SENTENCE_RE = /this spell costs \{[^}]+\} less to cast[^.]*\.\s*/gi;
export function stripSelfCostReduction(oracle) {
  return String(oracle || "").replace(SELF_COST_REDUCTION_SENTENCE_RE, " ").trim();
}

// STORM (CR 702.40) — strip the whole "Storm (…reminder…)" KEYWORD line before parsing the spell's effect.
// Storm is a TRIGGERED ability (its own copy-spell trigger, modeled in triggers/coverage), NOT part of the
// spell's resolution effect — so the body (create-token / gain-life / …) must be parsed on its own. Without the
// strip, stripReminder leaves a bare "Storm" residue clause that drags an otherwise-HIGH spell to LOW (its
// effect would then route to the Arbiter no-op at resolution). Line-anchored on the keyword's canonical reminder
// signature (CR 702.40a) so a card merely NAMED "…Storm" without the keyword is untouched. The runtime cast path
// (actionDispatcher.applyCastSpell) and the coverage classifier (spellIsNative) BOTH parse through here, so they
// agree on the body; the storm trigger fires separately (checkCastTriggers) and copies the spell.
export function stripStormKeywordLine(oracle) {
  return /\bcopy it for each spell cast before it this turn\b/i.test(String(oracle || ""))
    ? String(oracle).replace(/(?:^|\n)[^\n]*\bcopy it for each spell cast before it this turn\b[^\n]*(?=\n|$)/i, "\n")
    : oracle;
}

// DEVOID (CR 702.114, BLITZ DV-1) — strip the whole "Devoid (This card has no color.)" KEYWORD line before
// parsing an instant/sorcery's effect. Devoid is a CHARACTERISTIC-DEFINING ability (layer 1) that makes the
// card colorless in every zone; it carries NO parseable atom and has ZERO effect on the spell's resolution
// (the colorless status is already baked into the card's colors:[] and honored by every color chokepoint —
// colorsOf/colorsOfSpell/permanentColors + the cast-time sourceColors). Without the strip, a devoid keyword
// clause drags an otherwise-HIGH body (Complete Disregard's power-filtered exile, Void Shatter's counter+exile)
// to LOW — exactly the residue trap stripStormKeywordLine fixes for storm, and the resolution-invariant strip
// stripCastKeywordLines makes for madness/foretell. The runtime cast path (actionDispatcher.applyCastSpell /
// legalChoices) and the coverage classifier (spellIsNative) BOTH parse through parseEffectProgram, so they
// agree on the devoid-free body — no metric-vs-runtime drift (the CREED). Line-anchored on a WHOLE "Devoid"
// line (+ optional reminder paren), so a GRANT ("Slivers you control have devoid and annihilator 1.") or a
// "cast a spell with devoid" reference is never touched — and those live on permanents/lands anyway, for which
// parseEffectProgram returns null. Byte-identical body for a spell without the line.
export function stripDevoidLine(oracle) {
  return /^[ \t]*devoid\b[ \t]*(?:\([^)]*\))?[ \t]*$/im.test(String(oracle || ""))
    ? String(oracle).replace(/(?:^|\n)[ \t]*devoid\b[ \t]*(?:\([^)]*\))?[ \t]*(?=\n|$)/i, "\n")
    : oracle;
}

/**
 * ===== SELF-SHUFFLE DISPOSITION ===== (Green Sun's Zenith + the whole Sun's Zenith / Beacon family) — a spell
 * whose LAST sentence is "Shuffle <this> into its owner's library." shuffles ITSELF into its owner's library on
 * resolution INSTEAD of going to the graveyard (a printed replacement of CR 608.2m — the exact mechanical mirror
 * of Finale of Revelation's "Exile <this>." selfExile). The subject is the card's OWN name (the corpus prints
 * this template ONLY as a self-tuck: exactly the five "Sun's Zenith" + five "Beacon" instants/sorceries — every
 * "shuffle it/that card into its owner's library" that names something ELSE is a triggered/replacement/activated
 * ability on a permanent, none of them an instant/sorcery resolution disposition), so this is name-anchored to
 * the card itself and can never fire on another card's body clause.
 *
 * Strips the trailing self-shuffle sentence from the oracle and returns { body, selfShuffle:true }; the body then
 * parses through the normal pipeline (Green Sun's color-creature X-tutor, Blue Sun's draw-X, Red Sun's damage,
 * White Sun's tokens, Beacon of Destruction's damage — all already-modeled effects), and the program is stamped
 * `selfShuffle` so runEffectProgram's GY-1 shuffles the spell into the library instead of the graveyard. If the
 * self-shuffle sentence is absent, returns { body: oracle, selfShuffle:false } (byte-identical to no-op). The
 * body still has to parse HIGH on its own merits — a family member whose body is unmodeled (Black Sun's "-1/-1
 * on each creature", Beacon of Immortality's "double life") stays LOW → Arbiter (CREED: never a partial credit).
 */
export function stripSelfShuffleIntoLibrary(card, oracle) {
  const nm = String(card?.name || "").trim();
  if (!nm) return { body: oracle, selfShuffle: false };
  // Match the trailing "Shuffle <CardName> into its owner's library." sentence (case-insensitive, apostrophe-
  // normalized). Anchored to the END so it only strips a genuine trailing disposition, and the subject MUST be
  // this card's own name (escaped) — never a generic "it"/"that card" (those are the permanent-ability shapes).
  const esc = nm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\s*shuffle ${esc} into its owner['’]s library\\.?\\s*$`, "i");
  if (!re.test(oracle)) return { body: oracle, selfShuffle: false };
  return { body: oracle.replace(re, "").trim(), selfShuffle: true };
}

/**
 * ===== REBOUND DISPOSITION ===== (CR 702.88) — a spell with keyword `Rebound` on its LAST line. Rebound is
 * NOT a vacuous cast-keyword (it is DELIBERATELY excluded from CAST_KEYWORD_LINE): it changes the spell's
 * resolution disposition — "If you cast this spell from your hand, EXILE it as it resolves" (CR 702.88a),
 * replacing the default CR 608.2m graveyard put. It ALSO grants a delayed triggered ability at the
 * controller's next upkeep offering an OPTIONAL recast from exile (CR 702.88c/d).
 *
 * We model rebound FAITHFULLY by two moves and NOT a text-strip:
 *   (1) EXILE-ON-RESOLUTION — the body is peeled off and the produced HIGH program is stamped `selfExile`, so
 *       runEffectProgram's GY-1 puts the spell into EXILE, not the graveyard. This is the REAL state divergence
 *       that a naive strip would violate (letting the card hit the graveyard — a forbidden FP that changes
 *       every "cards in graveyard" / graveyard-recursion read). It reuses the EXACT selfExile disposition that
 *       Finale of Revelation's "Exile <this>." already threads (finishSpellResolution, { selfExile }).
 *   (2) DECLINE-THE-RECAST — the delayed upkeep recast is OPTIONAL (CR 702.88d "you MAY cast"). We do not set
 *       up the delayed ability; the engine simply never offers it, which is EXACTLY the CR-legal line where the
 *       controller DECLINES to recast (CR 702.88e — a declined rebound card stays in exile for the rest of the
 *       game). The resulting state (card permanently in exile, never recast) is a real reachable state, and —
 *       critically — declining FABRICATES NOTHING (the FP direction): we never conjure a free spell. Not
 *       offering the free recast is a SAFE false-negative on the UPSIDE; the mandatory exile disposition (the
 *       only part whose omission would be a wrong play) is modeled exactly.
 *
 * The strip is anchored to a TRAILING `Rebound` keyword line — every rebound printing prints it last (verified
 * across the corpus) — optionally followed by its reminder parenthetical (six wordings exist; a bare `Rebound`
 * with no reminder also occurs, e.g. Unnatural Summons). The body then parses through the normal pipeline and
 * must earn a HIGH tier ON ITS OWN merits: an unmodeled body (Ephemerate's flicker, Consuming Vapors' edict,
 * World at War's extra-combat) stays LOW → Arbiter, which disposes the spell itself, so the selfExile flag is
 * inert there. Returns { body, rebound }. A card without the line yields { body: oracle, rebound: false }
 * (byte-identical to the prior behavior).
 */
export function stripReboundLine(oracle) {
  // Trailing `Rebound`, on its own (a newline / sentence boundary before it), optionally followed by a single
  // (non-nesting) reminder parenthetical, at end of string. The keyword line carries NO body effect, so peeling
  // it never removes a real clause. `(?<=^|[\n.])` — the keyword starts a line or follows a sentence period.
  const re = /(?:^|[\n.])\s*rebound\b(?:\s*\([^)]*\))?\s*$/i;
  if (!re.test(oracle)) return { body: oracle, rebound: false };
  // Replace only the matched tail; keep the preceding sentence's terminating period (the match's leading
  // boundary char) by capturing it back is unnecessary — the tail begins at the newline/period boundary, and we
  // want to KEEP a body-ending period. Use a callback to preserve a leading "." (a body sentence's period).
  const body = oracle.replace(re, (m) => (m.startsWith(".") ? "." : "")).trim();
  return { body, rebound: true };
}
