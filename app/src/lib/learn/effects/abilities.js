/**
 * effects/abilities.js — activated-ability detection (Phase-2 P2.9).
 *
 * An activated ability is `[cost]: [effect]` (CR 602.1). This module splits a
 * permanent's oracle text into its activated-ability lines and, for each, parses the
 * COST (the part before the colon) and the EFFECT (the part after). It is the single
 * source of truth both the runtime (`legalChoices.actionsActivateAbility` /
 * `actionDispatcher.applyActivateAbility`) and the coverage metric
 * (`coverage.permanentActivatedCovered`) read, so the two can never drift.
 *
 * THE FAIL-SAFE (CLAUDE.md §1.2/§8): an ability is only `modeled` (playable on the
 * stack) when its WHOLE cost reduces to the modeled subset — mana pips + `{T}` — AND
 * its effect parses to a HIGH, non-modal, non-X EffectProgram. Any unmodeled cost item
 * (Sacrifice / Pay N life / Discard / {Q} / {X} / {S} / {E} / …) or unmodeled effect
 * leaves the ability un-offered (never a cost we can't pay, never a fabricated effect).
 * MANA abilities (`{cost}: Add …`) resolve through the existing no-stack tap-for-mana
 * path (CR 605.3a), so they're flagged `isManaEffect` and excluded from the stack path.
 *
 * Leaf-ish: imports only the effect parser. No gameState, no legalChoices (which would
 * cycle), no mana model — the mana COST string is returned raw for the caller's
 * `parseManaCost`, so this stays a pure leaf.
 */

import { parseEffectClause, programConfidence, programNeedsChosenTarget } from "./parser.js";
import { parseLeveler, isLevelerFrame } from "../leveler.js";
// CONDITION rider (CR 602.5d) — the metric⇄runtime shared shape gate. interveningIf.js imports only
// gameState.js (which does NOT import this module), so this edge is acyclic.
import { activationConditionParseable } from "../interveningIf.js";
import { selfNormalizeOracle } from "../staticAbilityParser.js"; // leaf-importing module — cycle-safe; the shared self-name grammar

/** Strip reminder text (parens) but PRESERVE newlines so per-ability line splitting works. */
function stripReminder(text) {
  return String(text || "").replace(/\([^)]*\)/g, " ").replace(/[ \t]+/g, " ");
}

/**
 * Strip a trailing RUNTIME-ENFORCED timing restriction from an activated ability's EFFECT clause before it is
 * parsed. Such a rider governs WHEN the ability may be activated, never WHAT it does; when the runtime ALREADY
 * enforces at-least-as-strict a window, dropping the sentence can NEVER let the engine play an ability sooner
 * or more often than the card allows (THE CREED — a strict, safe simplification, exactly like the cost-only
 * keyword strips). Without the strip the trailing sentence is swept into the effect program and drags an
 * otherwise-HIGH effect ("Put two +1/+1 counters on each creature you control. Activate only as a sorcery.")
 * to LOW, silently parking a fully-modelable ability. Single-sourced here so the parser and the coverage metric
 * strip identically. Two riders are stripped, BOTH implied by the offer gate (legalChoices.actionsActivate-
 * Ability offers activated abilities ONLY when it is the controller's own main step, they hold priority, and —
 * for a sorceryOnly ability — the stack is empty):
 *   • "Activate [this ability] only as a sorcery." (CR 602.5i) — own main + empty stack, already the gate.
 *   • "Activate [this ability] only during your turn." (BLITZ AA-1) — own MAIN step is a STRICT SUBSET of
 *     "your turn", so the engine's window is always inside the printed one; stripping only ever UNDER-offers
 *     (never at instant speed on your turn, which the card would allow) — a safe false-negative, never an FP.
 * BOTH are whole-clause anchored ($ after the phrase) so a rider carrying an EXTRA, un-enforced condition —
 * "…during your turn, before attackers are declared." (Capricious Sorcerer), "…no more than twice each turn."
 * (Pit Imp), "…only if <condition>." (Cinder Crawler) — does NOT match and the ability stays parked, because
 * offering it in the engine's main-step window WOULD violate that extra constraint (a forbidden FP).
 */
/**
 * PRECOMBAT-ONLY rider (census slice, 2026-07-28) — "Activate only during your turn, before attackers are
 * declared." (26 corpus carriers) and the bare "Activate only before attackers are declared." (2 more).
 *
 * NOT strippable like the two riders below it, and that distinction is the whole slice. The offer gate's
 * window is `step === "main"`, which covers BOTH main phases — and the postcombat main is AFTER attackers
 * are declared. So stripping this rider would let the engine activate the ability in a window the card
 * forbids: a false positive, not a safe simplification. It is flagged instead, and legalChoices NARROWS
 * the window to the precombat main for a flagged ability. Narrowing can only ever under-offer.
 *
 * The bare form ("only before attackers are declared", no turn clause) legally allows an OPPONENT'S turn
 * too; the engine never offers on an opponent's turn, so treating it identically is an under-offer — safe.
 *
 * DELIBERATELY UNMATCHED: "Activate only during an OPPONENT'S turn, before attackers are declared."
 * (Nettling Imp). The engine's window and the card's are DISJOINT — it could never be legally offered at
 * all, so it must stay parked rather than be credited into a window the card forbids.
 */
const PRECOMBAT_RIDER = /\.?\s*Activate (?:this ability )?only (?:during your turn, )?before attackers are declared\.?\s*$/i;
/**
 * CONDITION rider (census slice, 2026-07-28) — "Activate only if <board condition>." (CR 602.5d). 62 corpus
 * cards where this rider is the SOLE blocker.
 *
 * Unlike the timing riders above, this one restricts WHETHER, not WHEN — and it is a pure NARROWING of a
 * window that already exists, so a wrong answer can only ever under-offer. That is what makes it the safe
 * shape to build.
 *
 * It is stripped ONLY when `activationConditionParseable` says the offer gate can actually read the
 * condition, and the condition then rides the ability so both sites key off THIS parse. An unreadable
 * condition (the FILTERED spell-count form "you've cast a noncreature spell this turn", the delirium
 * card-type-count form, "creatures you control have total power 4 or greater") is left IN the clause, which
 * keeps the ability LOW and parks the card — a false negative, which is the safe direction. Stripping one
 * without enforcement would hand the engine an unconditional ability the card never printed.
 */
const CONDITION_RIDER = /\.?\s*Activate (?:this ability )?only if ([^.]+)\.\s*$/i;
const OPPONENT_TURN_RIDER = /Activate (?:this ability )?only during an opponent's turn/i;

// CR 602.5i — "Activate only as a sorcery" means own main, priority, AND AN EMPTY STACK. The generic offer
// gate covers own-turn + main step but NOT the empty-stack half, so the rider cannot simply be stripped as
// "already enforced": the engine would offer the ability in response to a spell on the stack, which the card
// forbids. Measured 2026-07-29 on a plain "{2}: Draw a card. Activate only as a sorcery." — correctly
// withheld on an opponent's turn and in the controller's own combat, and WRONGLY offered with a non-empty
// stack. Same literal as the strip below so the flag and the strip can never disagree about the phrase.
const SORCERY_TIMING_RIDER = /\.?\s*Activate (?:this ability )?only as a sorcery\.?\s*$/i;
export function abilityIsSorcerySpeedOnly(clause) {
  return SORCERY_TIMING_RIDER.test(String(clause || ""));
}

// FABLED PASSAGE's trailing bonus (CR 701.19 fetch + a conditional untap) — "…, then shuffle. THEN IF YOU
// CONTROL FOUR OR MORE LANDS, UNTAP THAT LAND." Without this the whole ability failed to parse and the card
// was **completely dead**: no action offered at all, on a land ranked #50 that sits in three of the shelf's
// decks. The coverage metric cannot see it — every land classifies `tier: "land"` regardless.
//
// ⛔ THIS IS A DELIBERATE UNDER-DELIVERY, NOT A MODEL OF THE RIDER. Dropped, the fetched land stays TAPPED
// when it should sometimes untap — the player gets LESS than printed, which is the safe direction and the
// same asymmetry probe-ignored-restrictions is built on: an ignored tail that ADDS under-delivers (FN,
// safe); an ignored tail that RESTRICTS over-delivers (FP, forbidden). This one only ever adds.
//
// NARROW ON PURPOSE — anchored to the printed sentence, and this is a ONE-CARD shape (corpus-verified: the
// only card printing it is Fabled Passage). It is NOT a general "drop a trailing sentence you cannot parse"
// rule, which would eventually swallow a RESTRICTION and flip the direction to forbidden.
const BONUS_UNTAP_RIDER = /\.?\s*Then if you control (?:two|three|four|five|\d+) or more lands, untap that land\.?\s*$/i;
function stripBonusUntapRider(clause) {
  return String(clause || "").replace(BONUS_UNTAP_RIDER, "").trim();
}

function stripEnforcedTimingRider(clause) {
  return String(clause || "")
    .replace(/\.?\s*Activate (?:this ability )?only as a sorcery\.?\s*$/i, "")
    .replace(/\.?\s*Activate (?:this ability )?only during your turn\.?\s*$/i, "")
    .trim();
}

/**
 * GY EXILE-COST ABILITY (BLITZ GY-2 — Seasoned Pyromancer / Runehorn Hellkite / the Soul cycle,
 * CR 602.2 + 113.6d): "<mana>, Exile this card from your graveyard: <effect>." The exile IS the cost
 * (paid at activation — the card leaves the graveyard before the ability resolves, so the ability is
 * structurally once-per-copy). V1 models the NON-TARGETED, non-modal, non-X HIGH effects only (a
 * chosen-target effect needs cast-time target enumeration on this lane — the natural GY-3); the
 * "Activate only as a sorcery" rider is recognized and enforced at the offer gate. Shared
 * single-source: the legalChoices enumerator, the dispatcher, and the coverage classifier all key off
 * THIS parse. Returns { manaPips, program, effectClause, sorceryOnly, raw } or null.
 */
const GY_EXILE_SORC_RIDER = /\.?\s*Activate (?:this ability )?only as a sorcery\.?\s*$/i;

// PER-TURN ACTIVATION LIMIT (BLITZ ONCE-1) — the two printed frames of the same restriction. The counted
// frame ("Activate no more than twice each turn." — Pit Imp, Phyrexian Battleflies; "…three times…" —
// Soul Kiss) is why the parsed value is a COUNT and not a boolean. The word list and the alternation are
// derived from one source so a word can never match the regex without having a count here.
const LIMIT_WORDS = { once: 1, twice: 2, "three times": 3, "four times": 4, "five times": 5 };
const LIMIT_RIDER = new RegExp(
  `\\.?\\s*Activate (?:this ability )?(?:only once|no more than (${Object.keys(LIMIT_WORDS).join("|")})) each turn\\.?\\s*$`,
  "i",
);
export function parseGraveyardExileAbility(card) {
  const oracle = stripReminder(String(card?.oracle || card?.oracle_text || ""));
  for (const rawLine of oracle.split("\n")) {
    // KW-ENGINES (CR 702.179d) — "Max speed — {3}, Exile this card from your graveyard: …" (the
    // Aetherdrift Surveyor cycle). The prefix gates the ability on speed 4; peel it and carry
    // `maxSpeed` so the offer site withholds below max — never an ungated view of a gated ability.
    const ms = rawLine.trim().match(/^max speed\s*[—–]\s*/i);
    const line = ms ? rawLine.trim().slice(ms[0].length) : rawLine;
    const m = line.trim().match(/^((?:\{[^}]+\})+), exile this card from your graveyard: (.+)$/i);
    if (!m) continue;
    let eff = m[2].trim();
    // The SAME gate in its rider spelling — parseActivatedAbilities rewrites "Max speed —" into
    // "Activate only if your speed is 4." (one condition, two entry paths), so this parser must
    // read both and stamp the same flag.
    const msRider = /\.?\s*activate only if your speed is 4\.?\s*$/i.test(eff);
    if (msRider) eff = eff.replace(/\.?\s*activate only if your speed is 4\.?\s*$/i, "").trim();
    const gated = !!ms || msRider;
    const sorceryOnly = GY_EXILE_SORC_RIDER.test(eff);
    if (sorceryOnly) eff = eff.replace(GY_EXILE_SORC_RIDER, "").trim();
    const program = parseEffectClause(normalizeSelfName(eff, card), "Instant");
    if (!program || programConfidence(program) !== "high") return null;
    if (program.modal || program.xSpell) return null;                    // v1 — the plain shape only
    if ((program.atoms || []).some((a) => !!a.targetType)) return null;  // v1 — non-targeted only (GY-3 adds enumeration)
    return { manaPips: m[1], program, effectClause: eff, sorceryOnly, raw: rawLine.trim(), ...(gated && { maxSpeed: true }) };
  }
  return null;
}

/**
 * GY SELF-RECURSION (BLITZ GY-1 — Reassembling Skeleton / Sanitarium Skeleton class, CR 602.2 + 113.6d:
 * an ability activated from the graveyard because its effect can only make sense there): the exact line
 * "<mana cost>: Return this card from your graveyard to <your hand | the battlefield [tapped]>." —
 * MANA-only cost, whole-line anchored (a rider / a non-mana cost item / "at the beginning" delayed forms
 * fail → the card stays body-only, a safe FN). Shared single-source: legalChoices' graveyard enumerator,
 * the dispatcher, AND the coverage classifier all key off THIS parse, so offer/pay/metric cannot drift.
 * Returns { manaPips, dest, entersTapped, raw } or null.
 */
export function parseGraveyardSelfRecursion(card) {
  const oracle = stripReminder(String(card?.oracle || card?.oracle_text || ""));
  for (const line of oracle.split("\n")) {
    // GR-1 (BLITZ — Stitchwing Skaab / Advanced Stitchwing / Ghoulsteed / Geralf's Masterpiece): an
    // optional ", Discard N card(s)" COST RIDER between the mana and the colon. BARE "card(s)" only —
    // a TYPED discard ("Discard a creature card" — Kraul Swarm) has a word between the article and
    // "card", fails the anchor, and the whole line stays unmodeled (FN-safe; a typed victim filter is
    // its own vocabulary). Every other rider (sacrifice / exile / tap — the probed family) likewise
    // fails → body-only. The bare mana-only form is byte-identical to before (the rider group optional).
    const m = line.trim().match(/^((?:\{[^}]+\})+)(?:, discard (a|two|three|four) cards?)?: return this card from your graveyard to (your hand|the battlefield)( tapped)?\.?$/i);
    if (m) {
      const W = { a: 1, two: 2, three: 3, four: 4 };
      return {
        manaPips: m[1],
        discardCards: m[2] ? (W[m[2].toLowerCase()] || 0) : 0,
        dest: m[3].toLowerCase() === "your hand" ? "hand" : "battlefield",
        entersTapped: !!m[4],
        raw: line.trim(),
      };
    }
    // GR-2 (census slice 35) — the EXILE-FROM-GRAVEYARD cost rider: "<mana>, Exile a/an/another <type> card
    // from your graveyard: Return this card …" (Scrapheap Scrounger, Bin Chicken, Postmortem Professor).
    // SINGULAR ONLY, the same way every other cost lane here started — the count forms ("exile two other
    // creature cards", "exile seven other cards") stay unmodeled → body-only, a safe FN.
    // SELF IS ALWAYS EXCLUDED as a victim, for "a/an" as well as "another": the card being returned is
    // itself sitting in this graveyard, and paying the cost with it would exile the very object the ability
    // returns. Excluding it is both the sane line and the one that can't produce a self-referential paradox.
    const ex = line.trim().match(/^((?:\{[^}]+\})+), exile (?:a|an|another) (creature|artifact|land|enchantment|instant or sorcery) card from your graveyard: return this card from your graveyard to (your hand|the battlefield)( tapped)?\.?$/i);
    if (ex) {
      return {
        manaPips: ex[1],
        discardCards: 0,
        exileFromGy: { cardType: ex[2].toLowerCase(), count: 1 },
        dest: ex[3].toLowerCase() === "your hand" ? "hand" : "battlefield",
        entersTapped: !!ex[4],
        raw: line.trim(),
      };
    }
  }
  return null;
}

/**
 * Self-name normalization (CR 201.4 — a card referring to itself by name means THIS object). An activated
 * effect like "Regenerate Wolverine." means "Regenerate this permanent" — the engine's effect parser anchors
 * the self-regen / self-pump atoms on "this creature"/"this permanent", so map the card's OWN name (full and
 * the pre-comma short name, e.g. "Wolverine, Best There Is" → "Wolverine") onto "this creature" before
 * parsing. Word-bounded, longest-first, so it only ever rewrites the literal self-name (never a substring of
 * another word). A card with no name, or whose clause doesn't mention it, is returned unchanged.
 */
function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function normalizeSelfName(clause, card) {
  const name = String(card?.name || "").trim();
  if (!name) return clause;
  const forms = [name];
  const short = name.split(",")[0].trim();
  if (short && short !== name) forms.push(short);
  // Longest first so the full name is consumed before the short prefix.
  forms.sort((a, b) => b.length - a.length);
  let out = clause;
  for (const f of forms) {
    out = out.replace(new RegExp(`\\b${escapeRe(f)}\\b`, "g"), "this creature");
  }
  return out;
}

// γ1c/CC-2/CC-3 — the remove-counter cost item, SINGLE-SOURCED pieces so the "from this/~/it" form and the
// CC-3 "from <CardName>" form can never drift on the count vocabulary or the type token. Count words cover
// the printed corpus (a/an/one…fifty) plus bare digits ("Remove 100 charge counters…", Vexing Puzzlebox);
// the type token keeps "+1/+1"/"-1/-1" verbatim alongside named kinds (charge, spore, ki, divinity…).
const RC_COUNT = "(a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|fifty|\\d+)";
const RC_TYPE = "([+\\-\\w/]+)";
// The noun after "this" is COSMETIC (matches the sacSelf allowlist; see the γ1c doc at the use site).
const RC_SELF_RE = new RegExp(
  `^remove ${RC_COUNT} ${RC_TYPE} (counters?) from (?:this|~|it)(?: creature| permanent| artifact| enchantment| land| aura| equipment| token| vehicle)?$`, "i");

/**
 * CC-3 (BLITZ SELF-NAME COUNTER COSTS) — the SAME γ1c/CC-2 remove-counter cost item, with the from-object
 * printed as the card's OWN NAME instead of "this <noun>/~/it" (CR 201.5 — text that refers to the object
 * it's on by name means just that particular object; the older comments in this file cite the same rule
 * under its legacy 201.4 number): "Remove a charge counter from Umezawa's Jitte: …", the Myojin cycle's "Remove a
 * divinity counter from Myojin of Cleansing Fire: …", and the legendary SHORT-name convention ("Remove a
 * +1/+1 counter from Mikaeus" on "Mikaeus, the Lunarch" — the pre-comma short form, the SAME two forms
 * normalizeSelfName maps on the effect side, so cost and effect self-name handling can't disagree).
 *
 * The name anchor is EXACT and whole-tail (`^…$`): the from-tail must equal the card's full or short name
 * VERBATIM (regex-escaped — never a substring, never another card's name, no trailing text). A COMPOUND
 * item ("Remove twelve time counters from Trenzalore Clocktower and exile it") or a trailing noun fails the
 * anchor → the whole cost parks (the CC-2 fail-closed discipline, a safe FN). A FULL name containing a
 * comma can never appear here (the caller splits cost items on ","), but the printed convention is the
 * short form anyway — the census corpus prints "from Arwen", never "from Arwen, Mortal Queen".
 *
 * Returns the SAME match-group layout as RC_SELF_RE (count/type/noun) so the caller's number/noun
 * agreement gate and count parse apply unchanged. A card-less caller (no name) gets null — the coverage
 * mirror (isActivatedAbilityLine) threads the card for exactly this reason, keeping metric and runtime in
 * lockstep (the CA-1/EV-3 shared-parser pattern): the metric can never credit a line the runtime can't pay.
 */
function execRemoveCounterFromSelfName(item, card) {
  if (!/^remove /i.test(item)) return null;                 // cheap gate — skip regex construction otherwise
  const name = String(card?.name || "").trim();
  if (!name) return null;
  const forms = [name];
  const short = name.split(",")[0].trim();
  if (short && short !== name) forms.push(short);
  const alt = forms.map(escapeRe).join("|");
  return new RegExp(`^remove ${RC_COUNT} ${RC_TYPE} (counters?) from (?:${alt})$`, "i").exec(item);
}

/** LANDS-TIER slice 3 — "Sacrifice <this card's own name>" as a cost item (Inventors' Fair). Same anchoring
 *  as execRemoveCounterFromSelfName: full name or the legendary short name, whole item, nothing else. (A
 *  comma-bearing full name can never arrive here whole — the cost string is split on commas first — which
 *  is fine: a legendary names itself by its SHORT name in its own text, the only printed shape.) */
function execSacrificeSelfName(item, card) {
  if (!/^sacrifice /i.test(item)) return null;                // cheap gate — skip regex construction otherwise
  const name = String(card?.name || "").trim();
  if (!name) return null;
  const forms = [name];
  const short = name.split(",")[0].trim();
  if (short && short !== name) forms.push(short);
  const alt = forms.map(escapeRe).join("|");
  return new RegExp(`^sacrifice (?:${alt})$`, "i").exec(item);
}

/**
 * γ1i (SHELF CAP14) — the "Unattach an Equipment from <SELF>" cost item, self-name anchored EXACTLY as
 * execRemoveCounterFromSelfName above is, and for the same reason: the printed card names itself (CR 201.5),
 * so the from-tail must equal this card's full or legendary SHORT name verbatim — never a substring, never
 * another permanent. Captain America, First Avenger prints "Unattach an Equipment from Captain America"
 * (the short form). The "this creature"/"this permanent"/"it" self-references are accepted too, so a future
 * card templated the modern way parses without a second arm.
 *
 * ⛔ THE ANCHOR IS THE WHOLE SAFETY. A variant naming ANOTHER permanent ("from target creature"), a COUNT
 * ("Unattach two Equipment"), or an AURA subject fails `^…$` → the cost parks → the ability stays unmodeled
 * → body-only. That is the fail-closed direction: unattaching the wrong permanent as a cost is a real
 * board change the coverage tier cannot see.
 */
function execUnattachFromSelfName(item, card) {
  if (!/^unattach an equipment from /i.test(item)) return null;   // cheap gate — skip regex construction
  const forms = ["this creature", "this permanent", "it"];
  const name = String(card?.name || "").trim();
  if (name) {
    forms.push(name);
    const short = name.split(",")[0].trim();
    if (short && short !== name) forms.push(short);
  }
  const alt = forms.map(escapeRe).join("|");
  return new RegExp(`^unattach an equipment from (?:${alt})$`, "i").exec(item);
}

/**
 * A single pip the engine's mana model understands. {X}/{Q}/{E} are deliberately NOT mana. {S} (snow,
 * CR 107.4h / 106.3) IS a modeled mana pip as of BLITZ SN-1: it flows verbatim into `manaPips`, and
 * parseManaCost records it as `cost.snow`, which planPayment can satisfy ONLY from a snow source's mana
 * (never fake-paid from non-snow mana — THE CREED). So a cost carrying {S} is no longer dropped to null.
 */
function pipIsMana(pipRaw) {
  const P = String(pipRaw).trim().toUpperCase();
  return /^\d+$/.test(P) ||
    ["W", "U", "B", "R", "G", "C", "S"].includes(P) ||
    /^[WUBRG]\/P$/.test(P) ||           // phyrexian
    /^[WUBRG2]\/[WUBRG]$/.test(P);       // hybrid (incl. {2/C}-style)
}

/**
 * Parse an ability cost (the text before the colon) into `{ manaPips, tapSelf }`, or
 * null when ANY cost item is outside the modeled subset (mana pips — incl. `{S}` snow — + `{T}`). The
 * ALLOWLIST discipline: every comma-separated item must be exactly `{T}` or a run of
 * pure mana pips — a leftover word (Sacrifice/Discard/Pay) or a non-mana symbol
 * ({X}/{Q}/{E}) drops the whole cost to null, so we never offer an ability whose
 * cost we can't pay. A `{S}` pip flows into `manaPips` and becomes `cost.snow`, which
 * planPayment satisfies ONLY from a snow source (SN-1).
 *
 * `card` (optional, CC-3) — the card the cost is printed on, threaded ONLY so the remove-counter item can
 * recognize the self-name form ("Remove a charge counter from Umezawa's Jitte") via CR 201.5. A card-less
 * call parses every other shape identically and simply never matches the self-name form (fail-closed).
 */
export function parseAbilityCost(costStr, card = null) {
  const items = String(costStr || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!items.length) return null;
  let manaPips = "";
  let tapSelf = false;
  let costX = false;
  let payLife = 0;
  let payEnergy = 0;
  let sacSelf = false;
  let sacOther = null;
  let sacCount = null;
  let sacX = null;
  let exileSelf = false;
  let removeCounter = null;
  let tapCreature = null;
  let returnLand = null;
  let unattachEquipment = null; // γ1i — "Unattach an Equipment from <self>" (CAP14): a chosen attached Equipment
  let discardCard = 0;
  let discardCardFilter = null; // γ1h-TYPED — "Discard a creature card" (Tortured Existence)
  let exileGyCount = null;      // LANDS-4 — "Exile N [<type>] cards from your graveyard" (Mines of Moria, Grim Lavamancer)
  for (const item of items) {
    if (/^\{t\}$/i.test(item)) { tapSelf = true; continue; }
    // γ1h — DISCARD-A-CARD cost (BLITZ DC-1 — Rummaging Goblin "{T}, Discard a card: Draw a card."; the
    // looter class + the Immobilizing Ink / Tin Street Market granted interiors): a CHOICE cost — WHICH
    // hand card to pitch. The parser records the shape; legalChoices expands one action per DISTINCT-named
    // hand card (copies are fungible) and gates on a non-empty hand; the dispatcher moves the chosen card
    // hand → graveyard BEFORE the ability goes on the stack (CR 601.2h — never activate without paying).
    // Whole-item anchored ($): a COUNT ("discard two cards"), a filter ("discard a creature card"), or
    // "discard your hand" doesn't match → null (deferred, a safe FN).
    if (/^discard a card$/i.test(item)) { discardCard = 1; continue; }
    // γ1h-TYPED (Tortured Existence "{B}, Discard a creature card: …", 2026-08-15): the TYPED discard
    // cost — same choice shape, the hand pool narrowed to cards whose FRONT-FACE type line carries the
    // type (CR 712.4a, the graveyard/tutor front-face discipline). legalChoices filters the victims;
    // the dispatcher re-validates the chosen card (defense in depth — a non-matching pitch is the FP).
    // Basic card types only; a subtype/color/compound filter still nulls (deferred, a safe FN).
    {
      const tm = item.match(/^discard an? (creature|artifact|enchantment|land|instant|sorcery|planeswalker) card$/i);
      if (tm) { discardCard = 1; discardCardFilter = tm[1].toLowerCase(); continue; }
    }
    // γ1f — TAP-CREATURE cost (Earthcraft "Tap an untapped creature you control: …"): a CHOICE cost
    // (CR 602.1b — "tap an untapped creature you control" is a cost to tap ANOTHER permanent, distinct
    // from the source's own {T}). The player picks WHICH untapped creature they control to tap (like
    // the sacOther victim pick); the parser only records the shape. legalChoices expands one action per
    // legal untapped creature you control, and the dispatcher taps it (excluding it from the mana
    // sources — a creature tapped for the cost can't also tap for mana). Whole-item anchored ($) so a
    // COUNT ("tap two untapped creatures"), a subtype filter, or an "you control or a land" compound
    // doesn't match → null (deferred), keeping the all-or-nothing gate — a safe false-negative.
    if (/^tap an untapped creature you control$/i.test(item)) { tapCreature = { another: false }; continue; }
    // γ1g — RETURN-A-LAND cost (Oboro Breezecaller "{2}, Return a land you control to its owner's hand:
    // Untap target land."): a CHOICE cost — the player picks WHICH land they control to bounce to its owner's
    // hand (CR 601.2b / 118 — returning a permanent you control to hand as an activation cost). The parser only
    // records the shape; legalChoices expands one action per legal land you control (excluding any that would
    // silently drop its OWN leaves-the-battlefield trigger — the shared bounce/leave fail-safe), and the
    // dispatcher ACTUALLY moves the chosen land battlefield → its owner's hand (CREED — never activate without
    // paying the cost). Whole-item anchored ($) so a COUNT ("return two lands"), a subtype filter ("return a
    // Forest"), or a "to their owner's hand" plural variant doesn't match → deferred, keeping the all-or-nothing
    // gate (a safe false-negative → Arbiter).
    if (/^return a land you control to its owner's hand$/i.test(item)) { returnLand = { another: false }; continue; }
    // γ1i — UNATTACH-AN-EQUIPMENT cost (SHELF CAP14, CR 701.3c — Captain America, First Avenger:
    // "{3}, Unattach an Equipment from Captain America: …"): a CHOICE cost — the player picks WHICH
    // Equipment attached to the SOURCE to remove. The parser only records the shape; legalChoices expands
    // one action per Equipment currently attached to the source (and offers nothing when none is), and the
    // dispatcher actually unattaches the chosen one before the ability goes on the stack (CR 601.2h —
    // never activate without paying). The chosen Equipment's MANA VALUE is threaded into resolution, which
    // is what makes this cost different from its siblings: the EFFECT is sized by the cost that was paid.
    // Whole-item anchored ($) over the SELF-NORMALIZED subject, so a variant naming another permanent, a
    // count, or an Aura doesn't match → deferred, keeping the all-or-nothing gate (a safe FN → Arbiter).
    if (execUnattachFromSelfName(item, card)) { unattachEquipment = { from: "self" }; continue; }
    // γ1 — two NO-CHOICE non-mana costs the engine pays without a player decision:
    //   "Pay N life"          → deduct N life (the caller checks affordability).
    //   "Sacrifice this[ …]"  → sacrifice the SOURCE permanent (no "which one?" choice).
    const lifeM = /^pay (\d+) life$/i.exec(item);
    if (lifeM) { payLife += parseInt(lifeM[1], 10); continue; }
    // γ1e — "Pay {E}…" (energy, CR 122.1e): a NO-CHOICE numeric resource cost, one per {E} pip. legalChoices
    // gates the activation on player.energy >= payEnergy; actionDispatcher deducts it via spendEnergy at activate
    // time (CREED — never activate without paying). The energy GAIN side is modeled (add-energy, Slice A).
    const energyM = /^pay ((?:\{e\})+)$/i.exec(item);
    if (energyM) { payEnergy += (energyM[1].match(/\{e\}/gi) || []).length; continue; }
    // "Sacrifice this[ <noun>]" (BLITZ EQ-2 — CR 701.21a): sacrifice the SOURCE permanent. The noun after
    // "this" is COSMETIC — CR 701.21a sacrifices the object the ability is on regardless of how the card
    // names it — so an Aura ("Sacrifice this Aura"), Equipment ("Sacrifice this Equipment"), Vehicle, or a
    // self-referential token noun resolves IDENTICALLY to the base "Sacrifice this creature/permanent/…"
    // forms: the source leaves the battlefield as the activation cost. Whole-item anchored ($) so a COMPOUND
    // cost ("Sacrifice this Aura and a creature") never prefix-matches and silently drops its trailing item.
    if (/^sacrifice (?:this|~)(?: creature| permanent| artifact| enchantment| land| aura| equipment| token| vehicle)?$/i.test(item)) { sacSelf = true; continue; }
    // LANDS-TIER slice 3 (Inventors' Fair "{4}, {T}, Sacrifice Inventors' Fair: …", 2026-09-03): a LEGENDARY
    // permanent names ITSELF in its sacrifice cost (CR 201.5 — the name means "this object"). Self-name
    // anchored EXACTLY as execRemoveCounterFromSelfName / the γ1i unattach item are: the item must equal
    // "sacrifice <full name>" or "sacrifice <legendary short name>" verbatim — never a substring, never
    // "sacrifice a <name>" (a different object). Requires the caller to pass `card` (the runtime activated
    // lane and the classifier both do); with no card there is no name and the item falls through to null.
    if (execSacrificeSelfName(item, card)) { sacSelf = true; continue; }
    // γ1c — two more NO-CHOICE self costs:
    //   "Exile this[ <type>]"            → exile the SOURCE from the battlefield (NOT "dies"; no dies
    //                                      triggers). The `$` anchor excludes "Exile this card from your
    //                                      graveyard" (a graveyard ability) and "…from exile" variants.
    //   "Remove a <type> counter from this" → remove one counter of <type> from the SOURCE (no choice).
    if (/^exile (?:this|~)(?: creature| permanent| artifact| enchantment| land)?$/i.test(item)) { exileSelf = true; continue; }
    // The item MUST END after the optional permanent-type noun ($) — like the exileSelf allowlist — so a
    // COMPOUND cost ("Remove a quest counter from this enchantment AND SACRIFICE IT") doesn't match the
    // prefix and silently drop its trailing cost (a partial-payment false-positive); it routes to the Arbiter.
    // CC-2 (BLITZ COUNTER-COST) — the count may be PLURAL: "Remove three spore counters from this creature"
    // (the Thallid class), "Remove three charge counters from this artifact" (Lux Cannon / Golem Foundry),
    // "Remove two +1/+1 counters from this creature" (Experiment One / Mindless Automaton), up to the printed
    // extremes ("Remove 100 charge counters…", Vexing Puzzlebox). The cost is payable ONLY while the source
    // HAS ≥N counters of that kind (CR 118.3 — a cost can't be paid without the full resources; legalChoices
    // gates on it), and payment removes EXACTLY N at activation time (CR 601.2h via 602.2b), through the SAME
    // per-permanent counter pile the layer system reads (a +1/+1 removal drops P/T immediately). The noun list
    // matches the sacSelf allowlist (…| token| vehicle — Reckoner Bankbuster's "from this Vehicle"): the noun
    // is COSMETIC, the cost always removes from the SOURCE object. CC-3: the from-object may also be the
    // card's OWN NAME (full or legendary pre-comma short form — CR 201.5; see execRemoveCounterFromSelfName's
    // exact-anchor doc). Still fail-closed: an X-count ("Remove X storage counters" — Dreadship Reef), "any
    // number", "all", an UNTYPED "Remove a counter" (a which-kind choice), a NON-self name, and every
    // from-among / other-permanent form miss the anchors → the whole cost parks (safe FN).
    const rcM = RC_SELF_RE.exec(item) || execRemoveCounterFromSelfName(item, card);
    if (rcM) {
      const W = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, twenty: 20, fifty: 50 };
      const n = W[rcM[1].toLowerCase()] ?? parseInt(rcM[1], 10);
      // NUMBER/NOUN AGREEMENT, fail closed: 1 ↔ "counter", ≥2 ↔ "counters". A mismatched pairing (or a
      // digit 0) is no printed oracle shape — return null so the whole cost parks rather than guess a count.
      if (!Number.isInteger(n) || n < 1 || (n === 1) !== (rcM[3].toLowerCase() === "counter")) return null;
      // Keep "+1/+1" / "-1/-1" verbatim (the counter-model keys); lowercase named types (charge, spore…).
      removeCounter = { type: /^[+-]\d/.test(rcM[2]) ? rcM[2] : rcM[2].toLowerCase(), count: n };
      continue;
    }
    // γ1b — "Sacrifice a/an/another <type>": a CHOICE cost. The single victim is picked at offer time
    // (legalChoices expands one action per legal sacrificeable permanent of <type>), so the parser only
    // records the shape; "another" excludes the source. A COUNT ("two creatures") or a compound type
    // ("a creature or planeswalker") doesn't match → null (deferred), keeping the all-or-nothing gate.
    // SAC-UNION (2026-08-07) — the printed cost unions join the singles (Ragamuffyn / Dredge "a creature or
    // land", Ertai the Corrupted / Blood Aspirant "a creature or enchantment", Spark Reaper "a creature or
    // planeswalker"). Union alternatives FIRST in the alternation, canonicalized to the same camelCase keys
    // the cast-cost lane emits, so legalChoices' sacTypeMatches serves both grammars with ONE evaluator —
    // the artifactOrCreature pattern, extended. An unlisted compound still falls through → null (deferred).
    // SAC-NONTOKEN (2026-08-07) — the optional `nontoken ` qualifier (Knight of the Last Breath, Korozda
    // Guildmage, Infernal Tribute, Thopter Foundry — all four carriers live on THIS grammar; the cast-cost
    // lane has ZERO, measured, so per the TF-1 criterion it stays untouched there). The flag rides the cost
    // and legalChoices' victim gather enforces it with the same `!v.card?.token` check the alt-cost
    // sacrificeCreature lane already uses.
    // ⛔ ADDING A GROUP RENUMBERS THE CAPTURES (the CV-3 lesson): the noun moves from [2] to [3]. The
    // incumbent forms are pinned byte-identical in sacUnionCost.test.js / sacNontoken.test.js.
    // LANDS-TIER slice 4 (Mines of Moria "{3}{R}, {T}, Exile three cards from your graveyard: …", 2026-09-03):
    // "Exile N [<type>] card(s) from your graveyard" as a BATTLEFIELD activated cost (CR 601.2h / 602.2b) —
    // 63 corpus carriers (Grim Lavamancer, Graveyard Marshal, Fungal Plots …). The graveyard-recursion
    // lane's `exileFromGy` (GR-2, a card acting FROM the graveyard) is the model: legalChoices freezes N
    // legal victims on the action, the dispatcher re-verifies each is still in the graveyard and moves it to
    // exile BEFORE the ability goes on the stack. Type words are exactly the ones cardMatchesAddCostType
    // reads (creature / artifact / land) or none ("cards" = any); "permanent card", a tribal word, "all",
    // "X" → no match → the whole cost parks (FN-safe — never an under-paid cost).
    const egM = /^exile (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) (?:(creature|artifact|land) )?cards? from your graveyard$/i.exec(item);
    if (egM) {
      const W = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
      const n = W[egM[1].toLowerCase()] ?? parseInt(egM[1], 10);
      if (!Number.isInteger(n) || n < 1) return null;
      exileGyCount = { count: n, cardType: egM[2] ? egM[2].toLowerCase() : "any" };
      continue;
    }
    const sacOtherM = /^sacrifice (a|an|another) (nontoken )?(creature or enchantment|creature or planeswalker|creature or land|creature|permanent|artifact|enchantment|land)$/i.exec(item);
    if (sacOtherM) {
      const SAC_UNION_CANON = { "creature or enchantment": "creatureOrEnchantment", "creature or planeswalker": "creatureOrPlaneswalker", "creature or land": "creatureOrLand" };
      const rawType = sacOtherM[3].toLowerCase();
      sacOther = { type: SAC_UNION_CANON[rawType] || rawType, another: /^another$/i.test(sacOtherM[1]),
        ...(sacOtherM[2] ? { nontoken: true } : {}) };
      continue;
    }
    // γ1b-SUBTYPE — "Sacrifice a/an/another <Subtype>" (Koma "Sacrifice another Serpent"; Goblin Sledder
    // "Sacrifice a Goblin"; Strands of Night "Sacrifice a Swamp"; Wand of the Elements "Sacrifice an Island"):
    // a CHOICE cost scoped to a SUBTYPE rather than a base card type. The victim is any PERMANENT you control
    // whose type line carries that subtype — so it works uniformly for a CREATURE subtype (Goblin/Serpent), a
    // LAND subtype (Swamp/Island — those sac a LAND, never a creature, so scoping to "creature" would make the
    // cost unpayable yet still count native: a CREED metric over-claim), or an artifact subtype. type:"permanent"
    // + the subtype filter is exactly CR-correct (CR 701.16 — sacrifice a permanent you control matching the
    // description); legalChoices' sacTypeMatches narrows on the subtype and the leave-trigger fail-safe still
    // applies. Gated to a SINGLE Capitalized word (a real subtype is one capitalized token on the type line)
    // NOT a base card type (those are the case-insensitive branch above) — so a lowercase noun or a compound
    // phrase ("a creature or planeswalker") never matches → null (deferred), preserving the all-or-nothing gate.
    const sacSubM = /^[Ss]acrifice (a|an|another) ([A-Z][a-z]+)$/.exec(item);
    if (sacSubM) { sacOther = { type: "permanent", subtype: sacSubM[2].toLowerCase(), another: /^another$/i.test(sacSubM[1]) }; continue; }
    // γ1d — SAC-N-SUBTYPE: "Sacrifice <N> <Subtype>s" (a COUNT ≥ 2 of a FUNGIBLE value-TOKEN subtype —
    // "Sacrifice three Treasures" / "Sacrifice two Foods", Ruthless Knave / Savvy Hunter / Olivia / Magda).
    // Scoped DELIBERATELY to the fungible value-token subtypes (Treasure/Clue/Food/Gold/Blood/Map/Powerstone/
    // Incubator) — those are interchangeable tokens, so paying N of them is a NO-DECISION cost (any N satisfy
    // it identically, CR 701.16); the runtime auto-picks N matching permanents. A COUNT-sac of a DISTINGUISHABLE
    // class ("two artifacts", "two creatures", "two other artifacts and/or creatures") is a REAL choice (which
    // value permanents to give up) the auto-pick can't make faithfully — those stay UNMODELED → Arbiter (a safe
    // false-negative, never a mis-paid cost). type:"permanent" + the subtype filter reuses sacTypeMatches exactly
    // like the single-subtype branch; count is the parsed integer the legalChoices victim-gather and the
    // dispatcher payment both read. Word-numbers two–five and digits 2–5 only (a higher fixed count is rare and
    // still routes to the Arbiter). Singular/plural tolerated on the subtype noun ("Foods"/"Food").
    const sacNM = /^[Ss]acrifice (two|three|four|five|2|3|4|5) ([A-Z][a-z]+?)s?$/.exec(item);
    if (sacNM) {
      const FUNGIBLE = new Set(["treasure", "clue", "food", "gold", "blood", "map", "powerstone", "incubator"]);
      const sub = sacNM[2].toLowerCase();
      if (FUNGIBLE.has(sub)) {
        const words = { two: 2, three: 3, four: 4, five: 5 };
        sacCount = { type: "permanent", subtype: sub, count: words[sacNM[1]] ?? parseInt(sacNM[1], 10) };
        continue;
      }
      return null; // a fixed-count sac of a non-fungible/unknown subtype → unmodeled (deferred)
    }
    // γ1e — SAC-X-SUBTYPE: "Sacrifice X <Subtype>" (a VARIABLE count the PLAYER chooses at activation — "Sacrifice
    // X Treasures", Grim Hireling). Scoped to the SAME fungible value-token subtypes as γ1d (Treasure/Clue/Food/…):
    // those tokens are interchangeable, so paying X of them is a NO-DECISION cost given a chosen X (any X satisfy it
    // identically, CR 701.16); the runtime offers one action per affordable X (1..available) and auto-picks X victims.
    // The X threads into the ability's EFFECT (Grim Hireling's "-X/-X" reads the SAME X the player paid), so the
    // caller (parseActivatedAbilities) parses the effect with hasX:true and REQUIRES an X-scaled (amountX) atom —
    // an effect that doesn't consume X would leave the sac-X choice with no payoff (a broken half-model). A sac-X of
    // a DISTINGUISHABLE / non-fungible class ("Sacrifice X creatures/lands/artifacts", Eliminate the Competition /
    // Krav / Champion of Stray Souls) is a REAL choice the auto-pick can't make faithfully → null (deferred, a safe
    // false-negative). Singular/plural tolerated on the subtype noun; ONE capitalized subtype word only.
    const sacXM = /^[Ss]acrifice X ([A-Z][a-z]+?)s?$/.exec(item);
    if (sacXM) {
      const FUNGIBLE = new Set(["treasure", "clue", "food", "gold", "blood", "map", "powerstone", "incubator"]);
      const sub = sacXM[1].toLowerCase();
      if (FUNGIBLE.has(sub)) { sacX = { type: "permanent", subtype: sub }; continue; }
      return null; // a variable-count sac of a non-fungible/unknown subtype → unmodeled (deferred)
    }
    // γ1f — ACTIVATED-{X} (Candelabra of Tawnos "{X}, {T}: Untap X target lands."): a lone `{X}` cost item is a
    // GENERIC-X mana cost the player picks at activation (CR 601.2b/107.3). It threads into `manaPips` verbatim
    // (parseManaCost sets hasX/xCount++), and legalChoices' actionsActivateAbility now enumerates one action per
    // affordable X (like the cast path's X-spell branch). Gated to a STANDALONE `{X}` item ONLY — a mixed pip
    // ("{2}{X}") or a second `{X}` ({X}{X} — a double-X activated cost, none in the corpus) is rare and NOT split
    // into its own item, so it falls through to the multi-pip run below where `pipIsMana("X")` is false → null
    // (deferred, a safe false-negative). Recording costX lets parseActivatedAbilities require an X-scaled effect.
    if (/^\{x\}$/i.test(item)) { costX = true; manaPips += "{X}"; continue; }
    const pips = [...item.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    if (pips.length === 0) return null;                          // a wordy item we don't model → unmodeled
    if (item.replace(/\{[^}]+\}/g, "").trim() !== "") return null; // leftover text around the pips → unmodeled
    if (!pips.every(pipIsMana)) return null;                      // {X}/{Q}/{E}/… → unmodeled ({S} IS mana, SN-1)
    manaPips += pips.map((p) => `{${p.trim().toUpperCase()}}`).join("");
  }
  return { manaPips, tapSelf, payLife, payEnergy, sacSelf, sacOther, sacCount, sacX, exileSelf, removeCounter, tapCreature, returnLand, unattachEquipment, discardCard, discardCardFilter, costX, exileGyCount };
}

/** True when an ability's EFFECT is a mana ability ("Add …") — those use the no-stack path. */
function effectIsManaAbility(clause) {
  // A QUOTED GRANT belongs to a TOKEN this effect creates — it is NOT this ability's own mana output.
  // "{4}, {T}: Create a 1/1 colorless Eldrazi Scion creature token. It has \"Sacrifice this token: Add {C}.\""
  // is a token-maker, not a mana ability. Reading the grant's "Add {C}" as this ability's output flags it
  // isManaEffect, which routes the whole ability into the mana model (a lane that cannot drive a
  // token-maker) and skips building its effect program entirely — so the card parked with an effect clause
  // that parses HIGH the moment anything else looks at it. Strip quoted spans before the test; a real mana
  // ability never carries one, so this can only ever RELEASE a wrongly-flagged token-maker.
  const c = String(clause).replace(/"[^"]*"|[“][^”]*[”]/g, " ").trim();
  return /^add\b/i.test(c) || /\badd\b\s+(\{[wubrgc]|one\b|two\b|three\b|four\b|five\b|that much|an amount|x\b|mana\b)/i.test(c);
}

/**
 * DOUBLE-MANA-POOL (Doubling Cube — "Double the amount of each type of unspent mana you have.").
 * This is a MANA ability (CR 605.1a — an activated ability with no target that could put mana into its
 * controller's pool), so it resolves without using the stack (CR 605.3a), exactly like a tap-for-mana
 * ability — NOT through the stack effect-program interpreter. `effectIsManaAbility` above keys on "Add …"
 * and misses this doubling wording, so we flag it here as a distinct mana-effect kind. The runtime
 * (legalChoices.actionsDoubleManaPool → actionDispatcher.applyDoubleManaPool) doubles every color in the
 * activating player's pool. Gated to the EXACT printed shape — a doubling of "each type of unspent mana
 * you have" — so it matches ONLY Doubling Cube's effect (audited corpus-wide: the sole card with this
 * wording); any other doubling clause (a static mana-doubler like Mana Reflection, worded as a replacement
 * effect, never as "{cost}: Double …") never reaches this matcher. Tolerates the "each type of" phrasing
 * only (the printed Oracle) — a variant that doubled a SUBSET, added a cap, or drained life would not
 * match and would stay unmodeled → Arbiter (a safe false-negative, never a partial application — THE CREED).
 */
function effectIsDoubleManaPool(clause) {
  return /^double the amount of each type of unspent mana you have\.?$/i.test(String(clause).trim());
}

/**
 * γ1 fail-safe — would sacrificing this permanent as a COST silently drop one of its OWN triggers?
 * The self-sac path fires only creature "dies" triggers (checkDiesTriggers); a "leaves the battlefield"
 * / "when you sacrifice this" trigger, or a COMPOUND condition the detector under-splits ("…enters AND
 * when you sacrifice it", "…enters OR leaves the battlefield"), would NOT be put on the stack — a silent
 * partial application. When true, the card's self-sac ability stays UNMODELED so the WHOLE card routes
 * to the Arbiter instead (CLAUDE.md §1.2 — a false-negative is safe; a partial application is forbidden).
 * "X or another creature dies" is NOT flagged: that's one event (all-creature scope), fired by the dies
 * path — only a second WHEN-clause or a distinct leave/sacrifice verb trips this.
 *
 * CR 700.4 dies-EQUIVALENT wording ("is put into a graveyard from the battlefield") and the exile/zone
 * LTB variants ("put into exile from the battlefield") ALSO trip this: the dies detector keys on the
 * literal word "dies", so checkDiesTriggers never fires for that wording — without this guard a victim
 * worded that way (Brood of Cockroaches, the God-Eternal cycle…) would have its death trigger silently
 * dropped on sacrifice. Conservative by design — route the whole card to the Arbiter.
 */
/**
 * CAST-RESTRICTION: "Cast this spell only during the declare attackers step and only if you've been attacked
 * this step." (Defiant Stand, Rally the Troops, Scorching Winds, Assassin's Blade and 10 more — the Fallen
 * Empires / Alliances combat-trick cycle.)
 *
 * A TIMING + STATE gate on the cast itself, printed as a whole sentence rather than a keyword. It is
 * enforced in legalChoices' cast loop (the card is simply not offered outside the window), which is why the
 * classifier is allowed to credit the sentence — the restriction is really imposed, not stripped as vacuous.
 * The distinction matters: crediting an UNENFORCED cast restriction would let the engine play a combat trick
 * at any time, which is a materially stronger card than the one printed.
 *
 * ⛔ THE WHOLE SENTENCE IS ANCHORED, both halves together. A card printing only the step half ("only during
 * the declare attackers step") without the been-attacked condition is a DIFFERENT restriction and stays
 * unmodeled — the gate below would under-restrict it. Exact-match or nothing (CREED).
 */
const CAST_ONLY_WHEN_ATTACKED_RE =
  /(?:^|[\n.;]\s*)cast this spell only during the declare attackers step and only if you(?:'|’)ve been attacked this step\s*(?:\.|$)/i;
/** Does this card carry the declare-attackers-and-attacked cast restriction? */
export function castOnlyWhenAttacked(card) {
  return CAST_ONLY_WHEN_ATTACKED_RE.test(String(card?.oracle ?? card?.oracle_text ?? ""));
}
/**
 * Is `playerId` in the window that restriction names — the declare-attackers step, with at least one
 * attacker declared AGAINST them? `defender` on each attacker entry is the defending PLAYER id (a
 * planeswalker attack still names its controller there), so a player attacked only via their planeswalker
 * still counts as attacked, which is correct: CR 508.1 declares attackers against a player, planeswalker or
 * battle they control.
 */
export function hasBeenAttackedThisStep(state, playerId) {
  if (state?.step !== "declare-attackers") return false;
  return (state?.combat?.attackers || []).some((a) => a?.defender === playerId);
}

export function sacrificeDropsTrigger(oracle) {
  // Match each trigger CLAUSE wherever it starts — not anchored to the start of a line/sentence — so an
  // ability-word prefix ("Praesidium Protectiva — When this creature is put into your graveyard…") or
  // reminder text "(When a creature is put into your graveyard from the battlefield…)" is still seen.
  // Callers pass the RAW oracle (reminder included) so death-keyword reminders (Recover…) are caught.
  const clauses = String(oracle).match(/(?:When|Whenever|At)\b[^.]*/gi) || [];
  for (const s of clauses) {
    if (/\b(?:and|or)\s+when(?:ever)?\b/i.test(s)) return true;       // a second embedded when-clause
    if (/\bleaves the battlefield\b/i.test(s)) return true;           // LTB — see the SAC-scoped exception below
    if (/\bwhen(?:ever)? you sacrifice\b/i.test(s)) return true;      // a sacrifice trigger
    // CR 700.4 dies-equiv / zone-LTB. EXCEPTION (verified 2026-07-25, runtime not by reading): the SELF form
    // — "When this <artifact|creature|enchantment|permanent|land|aura> is put into a graveyard from the
    // battlefield, …" — is no longer missed. detectTriggers maps it to the `ltb` event, and the cost-sac path
    // itself fires it: actionDispatcher.sacrificePermanentForCost calls moveCardToZone (which queues the leave
    // event) and then checkLeavesTriggers for a non-creature / checkDiesTriggers for a creature, whose first
    // line drains the same queue. Probed end to end on Implement of Examination before narrowing this.
    // Every OTHER subject ("another creature you control is put into…", a player/zone variant) stays flagged:
    // those are watcher shapes this fail-safe was really written for, and none were re-verified here.
    if (/\bput into\b[^.]*\bfrom the battlefield\b/i.test(s)
        && !/\bthis (?:artifact|creature|enchantment|permanent|land|aura) is put into a graveyard from the battlefield\b/i.test(s)) return true;
  }
  return false;
}

/**
 * SELF-LTB EXCEPTION, SCOPED TO THE SACRIFICE COST (verified 2026-08-02 by RUNTIME probe, not by
 * reading — the discipline the put-into-a-graveyard narrowing was earned with).
 *
 * `sacrificeDropsTrigger` is a CARD-level fail-safe reused by three different cost shapes
 * (sacrifice-self, exile-self, remove-counter). Its blanket LTB arm is right for two of them and
 * wrong for one: the SAC path DOES fire a SELF "leaves the battlefield" trigger, on both branches —
 *   non-creature → moveCardToZone (queues the leave event) + checkLeavesTriggers
 *   creature     → moveCardToZone + checkDiesTriggers, whose first line drains that same queue
 * — probed end to end (1 pending trigger, token actually minted, each time; selfLtbCostSac.test.js).
 *
 * ⛔ THE SCOPE IS THE SAFETY ARGUMENT. The EXILE-SELF path was NOT probed, so it keeps the blanket
 * refusal — widening on an unverified path is exactly the forbidden direction, and the existing pin
 * for that shape stays true by construction. (The REMOVE-COUNTER path got its own probed, narrower
 * answer on 2026-08-03 — see removeCounterCostCannotLeave below.) This helper answers ONE narrower
 * question: "ignoring a SELF-LTB clause, would a sacrifice still drop something?"
 */
export function sacrificeDropsTriggerIgnoringSelfLtb(oracle) {
  const withoutSelfLtb = String(oracle || "").replace(
    /(?:When|Whenever)\b[^.]*\bthis (?:artifact|creature|enchantment|permanent|land|aura|equipment|vehicle) (?:enters or )?leaves the battlefield\b[^.]*\.?/gi,
    " ",
  );
  return sacrificeDropsTrigger(withoutSelfLtb);
}

/**
 * REMOVE-COUNTER, NON-LEAVING (verified 2026-08-03 by RUNTIME probe — vatOfRebirth.test.js — the same
 * discipline the sac-scoped and put-into-a-graveyard narrowings were earned with).
 *
 * The shared γ1 fail-safe exists because a COST that removes the SOURCE from the battlefield would
 * silently drop trigger shapes the leave paths don't fire. Paying a remove-counter cost moves NOTHING
 * off the battlefield — the source stays put and every watcher printed on it keeps firing (probed:
 * Vat of Rebirth's put-into-a-graveyard watcher still enqueues after the ability is activated) — so
 * the fail-safe is vacuous for that cost shape, EXCEPT when the counter removal itself can make the
 * source leave:
 *   • a P/T counter ("+1/+1": lethal removal drops derived toughness → SBA 704.5f kills the source)
 *     keeps the blanket refusal;
 *   • "time" / "fade" (vanishing, CR 702.63c, sacrifices on the last time counter's removal; fading
 *     kept in the same bucket as cheap paranoia) keep the blanket refusal.
 * Any other NAMED counter type (oil, charge, spore, …) cannot move the source. Applies ONLY to a
 * PURE remove-counter cost — a compound cost that also sacs/exiles keeps the blanket refusal on its
 * other item, exactly as before (that path stays unprobed).
 */
export function removeCounterCostCannotLeave(rc) {
  return !!rc && !/^[+-]/.test(rc.type) && rc.type !== "time" && rc.type !== "fade";
}

/**
 * KW-CYCLING (CR 702.29a): the card's plain, FULLY-MODELED cycling cost — "Cycling {2}" → "{2}",
 * "Cycling {3}{R}" → "{3}{R}". Returns null when the card has no plain cycling, OR when it carries a
 * cycle/discard TRIGGER ("when you cycle this card" / "whenever you cycle or discard") — that trigger
 * is unmodeled (the trigger-compiler lane), so we must NOT offer a native cycle that would silently
 * drop it (THE CREED). TYPEcycling (Plainscycling/Landcycling, CR 702.29e) is excluded by the
 * line-start anchor — its library search needs the tutor atom, so it routes to the Arbiter until covered.
 */
export function parseCyclingCost(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  // ANY "When/Whenever … cycle[d]" trigger within a single clause (until the period) is an unmodeled
  // cycle trigger — gate the whole card. BROAD on purpose (a false-negative is safe): catches the
  // bare "When you cycle this card …" AND the split form "When you cast OR cycle ~, create a token …"
  // (Warped Tusker / Drownyard Lurker) + "Whenever you cycle or discard …" (Curator of Mysteries).
  if (/\b(?:when|whenever)\b[^.]*\bcycle/i.test(oracle)) return null;
  const m = oracle.match(/(?:^|\n)\s*cycling\s+((?:\{[^}]+\})+)/i);
  return m ? m[1] : null;
}

/**
 * DISCARD-COST HAND ABILITY (Waker of Waves, Ultimo, Visionary's Dance, Elemental Masterpiece and 13 more):
 * "<mana>, Discard this card: <effect>" — an activated ability played from HAND, exactly cycling's shape
 * with an arbitrary effect where cycling hard-codes "draw a card". Returns { cost, effectText } | null.
 *
 * ⛔ THE SAME CYCLE/DISCARD-TRIGGER GATE cycling carries, and for the same CREED reason: a card whose
 * discard would ALSO fire an unmodeled "when you discard" trigger must not be offered here, or activating it
 * silently drops that trigger. Broad on purpose — a false negative is safe.
 *
 * ⛔ ANCHORED TO A WHOLE LINE with a leading mana cost. "Discard this card" appearing as part of a larger
 * cost, or inside a permanent's ability, never matches. The EFFECT is returned as raw text and is gated by
 * the CALLER (legalChoices requires a HIGH, NON-TARGETED program) — this parser makes no claim about it.
 */
export function parseDiscardCostAbility(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  if (/\b(?:when|whenever)\b[^.]*\b(?:cycle|discard)/i.test(oracle)) return null;
  for (const line of oracle.split("\n")) {
    const m = line.trim().match(/^((?:\{[^}]+\})+), Discard this card: (.+)$/i);
    if (m) return { cost: m[1], effectText: m[2].trim() };
  }
  return null;
}

/**
 * LIFE-COST CYCLING (Street Wraith — "Cycling—Pay 2 life.", SHELF S7): the cycling cost is a LIFE
 * payment instead of mana. Returns the integer life cost, or null. Same cycle-trigger gate as the
 * mana form (an unmodeled cycle trigger parks the whole card). Paying life IS losing life
 * (CR 118.8), so the dispatcher routes it through loseLife — life-loss watchers fire, as printed.
 */
export function parseCyclingLifeCost(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  if (/\b(?:when|whenever)\b[^.]*\bcycle/i.test(oracle)) return null;
  const m = oracle.match(/(?:^|\n)\s*cycling\s*[—–-]\s*pay (\d+) life\b/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * PLOT (CR 702.171) — "Plot {cost}" is a special action: any time you could cast a sorcery you may pay
 * the plot cost and exile the card face-up from your hand ("plotted"); on a LATER turn you may cast it
 * from exile WITHOUT paying its mana cost (CR 702.171b). Returns the plot mana-cost STRING the caller
 * feeds to parseManaCost, or null when plot isn't a clean modeled action for this card.
 *
 * GATES (a false-negative is SAFE; a fabricated/partial plot is FORBIDDEN — CLAUDE.md §1.2):
 *   • Only a printed "Plot {cost}" line (line-anchored, mana-only cost). A non-mana plot cost would
 *     match nothing → null.
 *   • A "when/whenever … plot" TRIGGER (e.g. a future "whenever you plot a card" watcher) is unmodeled
 *     → gate the whole card to null, exactly like the cycling-trigger gate. BROAD on purpose.
 *   • A card that GRANTS plot to OTHER cards ("… has plot", "you may plot … from the top of your
 *     library" — Fblthp, Lost on the Range) is NOT a self-plot card: its "plot" mentions never begin a
 *     line as "Plot {cost}", so the cost regex doesn't match → null. (Its unmodeled granting body also
 *     keeps it non-native, so it's never offered — defense in depth.)
 */
export function parsePlotCost(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  // Any "When/Whenever … plot" trigger within a clause is an unmodeled plot trigger — gate the card.
  if (/\b(?:when|whenever)\b[^.]*\bplot/i.test(oracle)) return null;
  const m = oracle.match(/(?:^|\n)\s*plot\s+((?:\{[^}]+\})+)/i);
  return m ? m[1] : null;
}

/**
 * WARP (CR 702.176, Edge of Eternities) — "Warp {cost}" is an ALTERNATIVE cast cost from hand: you may cast
 * the card for its warp cost, then exile it at the beginning of the next end step, and may cast it from exile
 * on a later turn. It changes ONLY how/when the card is cast — never WHAT the card does on resolution or what
 * the permanent's printed abilities are. Every card carrying Warp ALSO has a normal printed mana cost, so the
 * engine hard-casts it at full price and resolves its body 100% CORRECTLY; the only unmodeled part is the
 * optional cheaper/temporary cast, which can NEVER mis-resolve / mis-count / drop a payoff clause / fabricate
 * (THE CREED — the SAME safe trade the Plot/Convoke/Spectacle cost gates make). A hard-cast permanent simply
 * stays on the battlefield exactly as printed (the "exile at end step" rider only applies to a WARP cast,
 * which the engine never offers), so crediting its body is faithful to what the runtime actually plays.
 *
 * Returns the warp mana-cost STRING, or null when warp isn't a clean modeled alternative for this card.
 * GATES (a false-negative is SAFE; a fabricated/partial credit is FORBIDDEN — CLAUDE.md §1.2), mirroring
 * parsePlotCost: only a printed "Warp {cost}" LINE (line-anchored, mana-only cost), and any "when/whenever …
 * warp" TRIGGER (a future "whenever you cast a spell for its warp cost" watcher) gates the whole card to null.
 */
export function parseWarpCost(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  // Any "When/Whenever … warp" trigger within a clause is an unmodeled warp trigger — gate the card.
  if (/\b(?:when|whenever)\b[^.]*\bwarp/i.test(oracle)) return null;
  const m = oracle.match(/(?:^|\n)\s*warp\s+((?:\{[^}]+\})+)/i);
  return m ? m[1] : null;
}

/**
 * CREW N (BLITZ VH-1, CR 702.121 — Vehicles): "Crew N (Tap any number of creatures you control with total
 * power N or more: This Vehicle becomes an artifact creature until end of turn.)" Returns the integer N, or
 * null when the card has no clean printed "Crew N" line (reminder text rides the line — line-anchored match).
 * A "when/whenever … crew(s|ed)" TRIGGER elsewhere on the card is NOT gated here — the classify strip only
 * removes the Crew line itself, so an unmodeled crew-watcher trigger still blocks the card downstream
 * (whole-card CREED). Only a Vehicle's own printed line matches; a granted/quoted "crew" never has the
 * line-anchored shape.
 */
export function parseCrewCost(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  const m = oracle.match(/(?:^|\n)\s*crew (\d+)\b/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * All activated-ability lines on a permanent, as serializable descriptors. Each entry:
 *   { index, raw, costStr, effectClause, manaPips, tapSelf, costModeled, isManaEffect,
 *     program, modeled, needsTarget }
 *
 * A line counts as an activated ability only when the cost (left of the first colon)
 * contains a `{…}` symbol — this excludes flavor/rules colons and pure word-costs we
 * don't model (those stay in the coverage gap rather than being mis-detected). `modeled`
 * is the gate the runtime offers on; the coverage metric reads the full list.
 */
/**
 * MODAL-ACTIVATED line-join (CR 602.1 / 700.2): a "Choose one —" modal activated ability prints each mode on
 * its OWN bullet line ("Sacrifice another Serpent: Choose one —\n• Tap target permanent. …\n• Koma gains …" —
 * Koma). Fold a continuation line that starts with a bullet "•" back onto the preceding line, so the ability's
 * full modal effect ("Choose one — • … • …") is ONE line: the parser sees the whole modal effect, and the
 * coverage residue strips (permanentActivatedCovered / permanentFullyCovered) drop the whole ability as one
 * activated-ability line instead of leaving the mode bullets as apparent residue. Only a LEADING-bullet line
 * is folded (a real new ability / keyword / trigger line never starts with "•"), so this can't merge two
 * distinct abilities — strictly a promotion for the split modal layout. SINGLE SOURCE OF TRUTH for both the
 * parser and the coverage metric, so they can't drift. Input is the (reminder-stripped) oracle; returns the
 * trimmed, folded, non-empty lines.
 */
export function foldModalBulletLines(oracle) {
  const rawLines = String(oracle || "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const lines = [];
  for (const l of rawLines) {
    if (/^•/.test(l) && lines.length) lines[lines.length - 1] += ` ${l}`;
    else lines.push(l);
  }
  return lines;
}

/**
 * OUTLAST (CR 702.107a) — rewrite each "Outlast [cost]" line into the ability it IS:
 * "[cost], {T}: Put a +1/+1 counter on this creature. Activate only as a sorcery."
 *
 * ⭐ EXPORTED SO THE COVERAGE MIRROR CANNOT DRIFT. coverage.js's `isActivatedAbilityLine` is documented as
 * an exact mirror of this parser's detection, and it keys on a COLON — which a bare "Outlast {W}" line does
 * not have. Expanding here and letting coverage duplicate the regex would put that mirror one edit away from
 * lying; both sides call this instead, so the keyword is one sentence in one place.
 */
export function expandOutlastLines(oracle) {
  return String(oracle || "").split("\n").map((ln) => {
    const m = ln.trim().match(/^outlast\s*((?:\{[^}]+\})+)$/i);
    return m ? `${m[1]}, {T}: Put a +1/+1 counter on this creature. Activate only as a sorcery.` : ln;
  }).join("\n");
}
export function parseActivatedAbilities(card) {
  // ABILITY-WORD LABEL on an ACTIVATED line (CR 207.2c — "Sleight of Hand — {8}: Draw two cards.", the CLB
  // Invokers; "Come Fly With Me — {2}, Sacrifice a creature: …", Jason Bright): a TRUE ability word carries
  // NO rules meaning, so strip a leading "<Words> — " when a BRACE COST follows the dash. CRITICAL GATE
  // (CREED): run on the RAW oracle BEFORE stripReminder, and skip any line whose reminder text mentions
  // "activate" — that's the signature of a RULES-BEARING dash-templated KEYWORD ability, not a flavor
  // label: Boast (CR 702.142a — attacked-this-turn + once/turn), Exhaust (once ever), Power-up (once ever
  // + a cost reduction), whose restrictions live ONLY in the reminder. Those lines keep their label → the
  // cost parser fails on it → the ability stays unmodeled → body-only (a SAFE FN, never a spammable
  // free-activation FP). A future dash-keyword with an activation restriction prints the same reminder, so
  // the gate holds without a name list.
  const rawOracle = String(card?.oracle || card?.oracle_text || "");
  const labelStripped = rawOracle.split("\n").map((ln) => {
    // KW-ENGINES "Max speed —" (CR 702.179d) is RULES-BEARING, not a flavor label — the ability is
    // live only at speed 4. The generic label strip below was silently eating it (an ungated view of
    // a gated ability — the credited-but-wrong class). Rewrite it into the "Activate only if" rider
    // idiom instead, so the EXISTING condition machinery (CONDITION_RIDER → activationCondition-
    // Parseable → the offer gate's evaluateInterveningIf) parses, attaches, and enforces it — the
    // metric and the runtime key off the same parse by construction.
    const ms = ln.match(/^max speed\s*[—–]\s*/i);
    if (ms) {
      const body = ln.slice(ms[0].length).trim().replace(/\.?\s*$/, "");
      return `${body}. Activate only if your speed is 4.`;
    }
    // CAP14: the charset admits an ELLIPSIS so a flavor label that carries one strips too — Captain
    // America's paired "Throw ... — {3}, …" / "... Catch — At the beginning …". The gates that make this
    // safe are unchanged and are what bound the widen: the label must still be followed by a DASH and then
    // a BRACE COST (the `(?=\{)` lookahead), and any line whose reminder text mentions "activate" is skipped
    // above as a rules-bearing keyword. A dotted label with no brace cost after it still never matches.
    return /\([^)]*activate/i.test(ln) ? ln : ln.replace(/^[A-Za-z][A-Za-z'.\- ]{0,40}\s[—–]\s*(?=\{)/, "");
  }).join("\n");
  // ===== OUTLAST (CR 702.107a) — expand the keyword into the ability it IS ==========================
  // "Outlast [cost]" means "[cost], {T}: Put a +1/+1 counter on this creature. Activate only as a sorcery."
  // That expansion is ALREADY FULLY MODELED here: the counter atom, the {T}, and the sorcery-timing gate are
  // each in use elsewhere, and writing the sentence out by hand classifies native-activated. So the keyword
  // needed no new machinery — only to be said in words the parser already knows.
  //
  // ⭐ THE SAME SHAPE AS THE AFTERMATH SLICE: a finished mechanism delivering nothing because the printed
  // keyword line was never turned into it. Rewriting the LINE rather than hand-building an ability object is
  // deliberate — it routes through the identical cost/effect/timing path as a printed ability, so outlast
  // cannot drift away from the sentence it is defined as.
  //
  // ⛔ The printed reminder says "Outlast only as a sorcery"; the expansion says "Activate only as a sorcery"
  // because that is the phrasing the timing gate reads, and CR 702.107a defines them as the same restriction.
  const oracle = expandOutlastLines(stripReminder(labelStripped));
  if (!oracle.trim()) return [];
  // LEVEL UP (BLITZ LV-1, CR 702.87 / 711): a LEVELER frame routes to the dedicated lane. Its band
  // striations otherwise leak into this loop as ALWAYS-ON activated abilities (Brimstone Mage's
  // "{T}: This creature deals 3 damage…" was parsed modeled with ZERO level counters — a live FP the
  // leveler lane fixes: band abilities are emitted ONLY with their level gate, and ONLY when the WHOLE
  // card is modeled; otherwise the frame emits nothing at all — a safe FN, exactly today's park).
  if (isLevelerFrame(rawOracle)) return levelerActivatedAbilities(card);
  // Card-level: would a self-sac drop a trigger? Use the RAW oracle (reminder included) so a death
  // keyword whose trigger lives in reminder text (Recover…) is caught, matching the victim path.
  const sacUnsafe = sacrificeDropsTrigger(card?.oracle || card?.oracle_text || "");
  // The SAC-scoped variant (self-LTB ignored). Used ONLY for a pure sacrifice-self cost below.
  const sacUnsafeIgnoringSelfLtb = sacrificeDropsTriggerIgnoringSelfLtb(card?.oracle || card?.oracle_text || "");
  const out = [];
  let index = 0;
  for (const line of foldModalBulletLines(oracle)) {
    if (!line) continue;
    // "Equip {cost}" — the attach activated ability (CR 702.6); no colon, the cost is mana
    // and the effect is to attach to a creature you control (the ATTACH resolver, not an
    // effect program). Sorcery-speed only. A non-mana / typed equip cost ("Equip — Sacrifice
    // …", "Equip legendary creature {2}") doesn't match → unmodeled (body-only).
    const em = !line.includes(":") && line.match(/^equip\b\s*(?:[—–-])?\s*((?:\{[^}]+\})+)$/i);
    if (em) {
      const cost = parseAbilityCost(em[1]);
      out.push({
        index: index++, raw: line, costStr: line, effectClause: "",
        manaPips: cost?.manaPips ?? null, tapSelf: false, costModeled: !!cost,
        isManaEffect: false, program: null, modeled: !!cost, needsTarget: true, isEquipAbility: true,
      });
      continue;
    }
    // "Reconfigure {cost}" (CR 702.151) — an Equipment that is ALSO a creature. The ATTACH half is
    // mechanically identical to Equip (attach to a creature you control, sorcery speed), so it carries
    // isEquipAbility and rides the SAME attach resolver, legality path and target enumeration — no new
    // runtime lane. The reminder parenthetical is tolerated because these lines print with it.
    //
    // ⛔ THE HALF THAT IS NOT EQUIP IS THE TYPE CHANGE, and it is the whole reason this is CREED-safe:
    // CR 702.151b says that while attached the Equipment is NOT a creature. layers.js emits a layer-4
    // removeCardType for exactly that (mirroring bestow, the same shape) — WITHOUT it, attaching would leave
    // a creature that can still attack and block, i.e. strictly better than printed.
    //
    // ⚠️ UNATTACH IS NOT OFFERED. Reconfigure can also pay the cost to unattach; the engine only offers the
    // attach direction, so a player can never take that line. That is an UNDER-offer — a safe false negative,
    // the same argument the plain-activated-attach branch below makes about instant-speed re-equipping.
    const rcm = !line.includes(":") && line.match(/^reconfigure\s*(?:[—–-])?\s*((?:\{[^}]+\})+)(?:\s*\(.*\))?$/i);
    if (rcm) {
      const cost = parseAbilityCost(rcm[1]);
      out.push({
        index: index++, raw: line, costStr: line, effectClause: "",
        manaPips: cost?.manaPips ?? null, tapSelf: false, costModeled: !!cost,
        isManaEffect: false, program: null, modeled: !!cost, needsTarget: true, isEquipAbility: true,
        isReconfigure: true,
      });
      continue;
    }
    // "Equip [quality] {cost}" — a RESTRICTED equip variant (CR 702.6c). Identical to a plain Equip EXCEPT its
    // legal targets are narrowed to a creature you control that HAS the stated quality (legalChoices enforces it
    // via `equipQuality`). Two qualities are modeled — the ones the runtime can evaluate from state:
    //   "commander" → isCommander travels the card (CR 903.3);
    //   "legendary creature" → the target's type line is Legendary (Excalibur, Sword of Eden — Cap America deck).
    // Any OTHER quality ("Equip Human {1}") is deliberately NOT matched here → body-only (whole-card CREED).
    const ecm = !line.includes(":") && line.match(/^equip\s+commander\s*(?:[—–-])?\s*((?:\{[^}]+\})+)$/i);
    if (ecm) {
      const cost = parseAbilityCost(ecm[1]);
      out.push({
        index: index++, raw: line, costStr: line, effectClause: "",
        manaPips: cost?.manaPips ?? null, tapSelf: false, costModeled: !!cost,
        isManaEffect: false, program: null, modeled: !!cost, needsTarget: true, isEquipAbility: true,
        equipQuality: "commander",
      });
      continue;
    }
    const elm = !line.includes(":") && line.match(/^equip\s+legendary\s+creature\s*(?:[—–-])?\s*((?:\{[^}]+\})+)$/i);
    if (elm) {
      const cost = parseAbilityCost(elm[1]);
      out.push({
        index: index++, raw: line, costStr: line, effectClause: "",
        manaPips: cost?.manaPips ?? null, tapSelf: false, costModeled: !!cost,
        isManaEffect: false, program: null, modeled: !!cost, needsTarget: true, isEquipAbility: true,
        equipQuality: "legendary",
      });
      continue;
    }
    // ATTACH-AS-A-PLAIN-ACTIVATED-ABILITY (CR 701.3 — Cranial Plating / Horned Helm / Sparring Collar /
    // Healer's Headdress / Neurok Stealthsuit, one Mirrodin cycle). Mechanically identical to Equip, but
    // printed as an ordinary "{cost}: <effect>" line instead of the keyword, so the three colon-less Equip
    // branches above can't see it. Carrying isEquipAbility routes it to the SAME ATTACH resolver — no new
    // runtime lane, no new resolver, no new legality path.
    //
    // TIMING IS THE ONE REAL DIFFERENCE, and it lands on the safe side. The printed ability has NO
    // sorcery-speed restriction (instant-speed re-equipping is the entire reason this cycle exists), while
    // the engine offers activated abilities only in the controller's own main step. Own-main is a strict
    // SUBSET of "whenever you have priority", so the engine can only ever UNDER-offer it — a safe false
    // negative, the same argument AA-1 makes for "Activate only during your turn."
    //
    // Mana-only cost, anchored whole-line ($): a typed or additional cost, or any trailing rider, falls
    // through to the generic parse and lands wherever its effect really parses (CREED — whole line or nothing).
    const am = line.match(/^((?:\{[^}]+\})+):\s*attach this equipment to target creature you control\.?$/i);
    if (am) {
      const cost = parseAbilityCost(am[1]);
      out.push({
        index: index++, raw: line, costStr: am[1], effectClause: "",
        manaPips: cost?.manaPips ?? null, tapSelf: false, costModeled: !!cost,
        isManaEffect: false, program: null, modeled: !!cost, needsTarget: true, isEquipAbility: true,
      });
      continue;
    }
    const ci = line.indexOf(":");
    if (ci === -1) continue;
    // QUOTED-GRANT GUARD (CR 113.7) — a GROUP-GRANT / attached static grants a quoted ability to OTHER
    // permanents ("Treasures you control have \"{T}, Sacrifice this artifact: Add two mana of any one
    // color.\"" — Goldspan Dragon; "Sliver creatures you control have \"{T}: Add …\"" — Manaweft). The
    // ability's colon sits INSIDE the quotes, so the naive first-colon split mis-reads the whole grant line
    // as THIS card's own activated ability with an unparseable cost ("Treasures you control have \"{T}, …")
    // → modeled:false → a false residue that fails permanentFullyCovered's every-modeled gate on a MIXED
    // (trigger + group-grant) card. The grant is a STATIC (staticAbilityParser owns it), never the card's own
    // activated ability. Detect it by odd double-quote parity before the split colon (the colon is inside an
    // open quote) → skip the line. A normal activated ability has no quote before its cost colon (parity 0),
    // so this is inert for every printed ability. Straight " and curly “/” both count.
    const preColonQuotes = (line.slice(0, ci).match(/["“”]/g) || []).length;
    if (preColonQuotes % 2 === 1) continue;   // colon inside a quoted granted ability → a static grant, not our own
    let costStr = line.slice(0, ci).trim();
    // BOAST (CR 702.135) — an ABILITY WORD (CR 207.2c), so "Boast" itself has no rules meaning; the whole
    // rule lives in its reminder text: "Activate only if this creature attacked this turn and only once
    // each turn." Strip the label so parseAbilityCost sees the real cost, then carry BOTH halves of that
    // reminder as enforced facts — the once-per-turn limit through the existing activationLimit ledger,
    // and the attacked-this-turn condition through a new PER-PERMANENT flag checked at the offer gate.
    //
    // Per-permanent matters: the seat-level `attackedThisTurn` already existed for Raid, and reading it
    // here would offer boast whenever ANY of your creatures attacked — a different, much looser card.
    const isBoast = /^boast\s*[—–-]\s*/i.test(costStr);
    if (isBoast) costStr = costStr.replace(/^boast\s*[—–-]\s*/i, "").trim();
    // POWER-UP — an ABILITY WORD (CR 207.2c) exactly like Boast above: the label carries no rules meaning
    // and the whole restriction lives in the reminder, "(Activate each power-up ability only once. Reduce
    // the cost by its mana cost if it entered this turn.)". Strip the label so parseAbilityCost sees the
    // real cost, and carry the limit as an ENFORCED fact — never strip a restriction we don't enforce.
    //
    // ⛔ THE LIMIT IS ONCE PER **GAME**, NOT PER TURN, and that distinction is the whole safety property.
    // The existing ONCE-1 ledger is deliberately self-expiring ("a record from an earlier turn counts as
    // ZERO uses"), so reusing it as-is would hand out one free activation EVERY TURN — an engine strictly
    // more permissive than the card. Hence activationLimitScope:"game", which both the offer gate and the
    // dispatcher stamp read; the per-turn behaviour of every existing carrier is untouched (scope absent).
    //
    // ⚠️ The reminder's SECOND clause (the cost reduction while it entered this turn) is deliberately NOT
    // modelled: not applying a discount makes the ability cost MORE, an under-offer — the safe direction.
    const isPowerUp = /^power-up\s*[—–-]\s*/i.test(costStr);
    if (isPowerUp) costStr = costStr.replace(/^power-up\s*[—–-]\s*/i, "").trim();
    // ⭐ EXHAUST (CR 702.180a) — "Exhaust — {cost}: <effect>. (Activate each exhaust ability only once.)"
    // Structurally identical to POWER-UP directly above: an ability-word label with no rules meaning, whose
    // entire restriction is a ONCE-PER-GAME activation limit. Strip the label so parseAbilityCost sees the
    // real cost, and carry the limit as an ENFORCED fact through the SAME `activationLimitScope:"game"`
    // ledger POWER-UP already uses — both the offer gate (legalChoices reads the scope) and the dispatcher
    // stamp ship today.
    // ⛔⛔ STRIPPING THE LABEL WITHOUT THE LIMIT WOULD BE THE FORBIDDEN DIRECTION, and it is the whole reason
    // this arm carries a scope rather than just deleting the prefix. The per-turn ONCE-1 ledger is
    // self-expiring by design ("a record from an earlier turn counts as ZERO uses"), so reusing it would
    // hand out one free activation EVERY TURN — an engine strictly more permissive than the card, on 39
    // carriers. Never strip a restriction the runtime doesn't enforce.
    const isExhaust = /^exhaust\s*[—–-]\s*/i.test(costStr);
    if (isExhaust) costStr = costStr.replace(/^exhaust\s*[—–-]\s*/i, "").trim();
    // Strip a trailing "Activate only as a sorcery" timing rider (CR 602.5i) — a WHEN restriction the runtime
    // already enforces (activated abilities are offered only at main / sorcery speed), never a WHAT, so the
    // effect parses on its real payload instead of being dragged LOW by the trailing sentence.
    // PER-TURN ACTIVATION LIMIT (BLITZ ONCE-1, generalized from a boolean to a COUNT): a FREQUENCY
    // restriction printed as a trailing rider (Hollow Scavenger / Drillworks Mole class). Strippable for the
    // effect parse ONLY because the runtime enforces it — legalChoices' per-turn ledger gate
    // (state.activatedOncePerTurn, keyed permId:rawLine) + the dispatcher stamp. Stripping without that
    // enforcement would be a spammable FP; the limit rides the ability so both sites key off THIS parse.
    // Two printed frames carry the restriction: the modern "Activate only once each turn." and the COUNTED
    // "Activate no more than N times each turn." (Pit Imp, Phyrexian Battleflies, Soul Kiss). activationLimit
    // is the COUNT, never a boolean — a boolean cannot express "twice", which is exactly the gap here. The
    // "only once" frame parses as 1, so its 56 native carriers keep byte-identical behavior.
    const rawEffect = line.slice(ci + 1).trim();
    // CONDITION rider (CR 602.5d) — peeled FIRST because it is end-anchored and can sit AFTER a timing
    // rider on the same line ("… Activate only once each turn. Activate only if a creature died this
    // turn."). Peeling it first is what lets the end-anchored LIMIT/PRECOMBAT riders below still see their
    // own tail. Stripped only when the offer gate can read it (the shared metric⇄runtime gate).
    const condM = CONDITION_RIDER.exec(rawEffect);
    const condition = condM && activationConditionParseable(condM[1].trim()) ? condM[1].trim() : null;
    const afterCondition = condition ? rawEffect.replace(CONDITION_RIDER, "").trim() : rawEffect;
    const limitM = afterCondition.match(LIMIT_RIDER);
    // A matched count word is always a LIMIT_WORDS key (the alternation is built from it), but fall back to
    // "no limit, don't strip" rather than NaN if that ever drifts — a safe false negative.
    const activationLimit = limitM ? (limitM[1] ? LIMIT_WORDS[limitM[1].toLowerCase()] ?? null : 1) : null;
    const preCombatOnly = PRECOMBAT_RIDER.test(afterCondition) && !OPPONENT_TURN_RIDER.test(afterCondition);
    const afterPrecombat = preCombatOnly ? afterCondition.replace(PRECOMBAT_RIDER, "").trim() : afterCondition;
    const beforeTimingStrip = activationLimit ? afterPrecombat.replace(LIMIT_RIDER, "").trim() : afterPrecombat;
    // Read the flag off the PRE-strip text — after the strip the phrase is gone by construction.
    const sorceryOnly = abilityIsSorcerySpeedOnly(beforeTimingStrip);
    let effectClause = stripBonusUntapRider(stripEnforcedTimingRider(beforeTimingStrip));
    // SELF-NAME + GENDERED-SUBJECT normalization (the Power-up bodies, 2026-08-14 — She-Hulk "Put a
    // +1/+1 counter on She-Hulk", Abomination "… He fights up to one target creature an opponent
    // controls"): a legend's ability body names itself (CR 201.4 — the name means "this object") and the
    // Marvel printings use gendered subject pronouns for the follow-up sentence. Route the name through
    // the SAME selfNormalizeOracle grammar the static path trusts (longest-form-first, tribe-word guard),
    // then rewrite a SENTENCE-LEADING "He/She " — on a creature's own activated body that subject is
    // unambiguously the source. Every rewritten clause still re-gates through parseEffectClause (LOW on
    // anything unmodeled, FN-safe).
    if (card?.name && /creature/i.test(String(card.type || card.type_line || ""))) {
      effectClause = selfNormalizeOracle(effectClause, card.name, card.type || card.type_line);
      effectClause = effectClause.replace(/(^|\.\s+)(?:he|she)\s+/gi, (m, lead) => lead + "this creature ");
    }
    if (!costStr || !effectClause) continue;

    // CC-3 — thread the card so a SELF-NAME remove-counter cost item ("Remove a charge counter from
    // Umezawa's Jitte") parses (CR 201.5). Every other cost shape is card-independent.
    const cost = parseAbilityCost(costStr, card);
    // A real activated ability's cost is either symbol-bearing ({mana}/{T}) or a modeled word-cost
    // (γ1: "Pay N life" / "Sacrifice this"). A colon with neither to its left is flavor/rules text
    // (a level band, a Class line, a keyword-action colon) → skip, so we never mis-detect.
    if (!costStr.includes("{") && !cost) continue;

    // DOUBLE-MANA-POOL (Doubling Cube): a mana ability (CR 605.1a) with the doubling wording rather than
    // "Add …" — flag it as a mana effect (routes off the stack path, via actionsDoubleManaPool) and carry
    // a `doubleManaPool` marker the runtime enumerator/dispatcher key on. `isManaEffect` true ⇒ no stack
    // program is parsed and `modeled` stays false (like every mana ability), so it's never offered as a
    // stack `activate-ability`.
    const doubleManaPool = effectIsDoubleManaPool(effectClause);
    const isManaEffect = effectIsManaAbility(effectClause) || doubleManaPool;
    // γ1e — a "Sacrifice X <fungible subtype>" cost makes the ability's X a PLAYER CHOICE that threads into the
    // EFFECT (Grim Hireling: "-X/-X" scales by the X Treasures paid). Parse the effect with hasX:true so an
    // amount-X atom binds to ctx.xValue, and REQUIRE the effect to be an X-scaled program (see the effectHigh
    // gate below) — a sac-X whose effect DOESN'T consume X would leave the paid X with no payoff (a half-model,
    // CREED). Every other cost keeps hasX:false (the prior behavior — no {X} in an activated cost otherwise).
    const sacX = cost?.sacX ?? null;
    // γ1f — ACTIVATED-{X} (Candelabra of Tawnos "{X}, {T}: Untap X target lands."): a lone `{X}` mana cost item
    // makes the ability's X a PLAYER CHOICE bound at activation. Like sacX, the effect MUST be X-scaled — the
    // paid X must be consumed (here: the TARGET COUNT = X, a targetCountX atom); a fixed effect under a mana-{X}
    // cost would leave the X with no payoff (a half-model). Parse with hasX:true and require an xSpell program.
    const costX = cost?.costX ?? false;
    let program = null;
    let effectHigh = false;
    if (cost && !isManaEffect) {
      // CR 201.4: rewrite the card's own name → "this creature" so a self-referential effect
      // ("Regenerate Wolverine.") matches the engine's self-anchored atoms.
      program = parseEffectClause(normalizeSelfName(effectClause, card), "Instant", { hasX: !!sacX || costX });
      // γ1f — the ONLY X-payoff the activated-{X} RUNTIME wires (legalChoices.actionsActivateAbility) is a
      // TARGET-COUNT = X set (a targetCountX atom, expanded per-X). An {X}-cost ability whose effect scales X some
      // OTHER way (an amountX magnitude — "{X}: deal X damage") parses xSpell:true but has NO runtime path here,
      // so gating it modeled would over-claim native for a card the engine can't offer. Require a targetCountX
      // atom so classify (metric) and the runtime stay in lock-step; every other {X} activated effect stays parked
      // (a safe false-negative → Arbiter) until its runtime lane is built.
      const costXTargetCount = !!program && (program.atoms || []).some((a) => a.targetCountX);
      // MODAL-ACTIVATED (CR 602.1 / 700.2 — Koma "Sacrifice another Serpent: Choose one — …"): a "Choose one"
      // modal effect IS playable here. The runtime offers ONE action per mode (legalChoices →
      // expandCastChoices expands mode × target combos, stamping chosenMode) and the dispatcher executes the
      // chosen mode's atoms (applyActivateAbility threads chosenMode → runProgram), exactly like a modal
      // SPELL — so a HIGH modal program is no longer silently dropped. X-modes stay excluded (the activated
      // X-choice expansion isn't wired); a "Choose two/one or more" modal also rides this (expandCastChoices
      // handles the mode-combinations). The all-or-nothing modal HIGH gate (every mode parses) already
      // guarantees no mode is silently un-modeled, so this can't half-resolve.
      // sacX (γ1e): the effect must be ANY X-scaled program (xSpell — Grim Hireling's amountX "-X/-X" is wired by
      // the sacX runtime path). costX (γ1f): NARROWER — only a targetCountX program (the sole wired runtime lane).
      // Both require HIGH + non-modal (the activated X-choice × modal-mode cross-expansion isn't wired). Every
      // non-X ability keeps the original gate: HIGH, non-modal, non-X (a stray {X} effect under a non-X cost stays
      // parked). A mis-model (X paid, nothing consumes it) is a forbidden half-model — the gate forbids it.
      effectHigh = sacX
        ? (!!program && programConfidence(program) === "high" && !!program.xSpell && !program.modal)
        : costX
          ? (!!program && programConfidence(program) === "high" && costXTargetCount && !program.modal)
          : (!!program && programConfidence(program) === "high" && !program.xSpell);
    }
    out.push({
      index: index++,
      raw: line,
      costStr,
      effectClause,
      activationLimit: activationLimit ?? (isBoast || isPowerUp || isExhaust ? 1 : null), // ONCE-1 — N activations per turn, or null (runtime-enforced frequency restriction)
      ...(isPowerUp || isExhaust ? { activationLimitScope: "game" } : {}), // POWER-UP / EXHAUST — "only once", never re-armed by a new turn
      ...(isPowerUp ? { powerUp: true } : {}), // the powerUpOnly cost reducer (Hulk, Gamma Goliath) gates on this — Exhaust must NOT ride it
      preCombatOnly, // "before attackers are declared" — legalChoices narrows the window to the PRECOMBAT main
      sorceryOnly,   // CR 602.5i "Activate only as a sorcery" — legalChoices adds the EMPTY-STACK half the generic main-step gate does not cover

      boast: isBoast, // CR 702.135 — offer gate requires perm.attackedThisTurn (per-permanent, not per-seat)
      condition, // CR 602.5d "Activate only if <cond>" — legalChoices evaluates it; null when absent OR unreadable
      manaPips: cost?.manaPips ?? null,
      tapSelf: cost?.tapSelf ?? false,
      payLife: cost?.payLife ?? 0,     // γ1 — "Pay N life" cost item (the runtime deducts it)
      payEnergy: cost?.payEnergy ?? 0, // γ1e — "Pay {E}…" energy cost (legalChoices gates on player.energy; dispatcher spends it)
      sacSelf: cost?.sacSelf ?? false, // γ1 — "Sacrifice this" cost item (the runtime sacs the source)
      sacOther: cost?.sacOther ?? null, // γ1b — "Sacrifice a/another <type>": legalChoices picks the victim
      sacCount: cost?.sacCount ?? null, // γ1d — "Sacrifice N <fungible subtype>": legalChoices auto-picks N victims
      sacX,                             // γ1e — "Sacrifice X <fungible subtype>": player chooses X, X threads to the effect
      costX,                            // γ1f — "{X}" mana cost item: player chooses X, X = the effect's target count
      exileSelf: cost?.exileSelf ?? false,     // γ1c — "Exile this": exile the source from the battlefield
      removeCounter: cost?.removeCounter ?? null, // γ1c — "Remove a <type> counter from this"
      tapCreature: cost?.tapCreature ?? null,  // γ1f — "Tap an untapped creature you control": legalChoices picks the creature
      discardCard: cost?.discardCard ?? 0,     // γ1h — "Discard a card": legalChoices expands per distinct hand card (DC-1)
      exileGyCount: cost?.exileGyCount ?? null, // LANDS-4 — "Exile N [<type>] cards from your graveyard": legalChoices freezes N victims (exileGyIds)
      discardCardFilter: cost?.discardCardFilter ?? null, // γ1h-TYPED — "Discard a creature card" (Tortured Existence): the victim pool narrows to the front-face type
      returnLand: cost?.returnLand ?? null,    // γ1g — "Return a land you control to its owner's hand": legalChoices picks the land, dispatcher bounces it
      unattachEquipment: cost?.unattachEquipment ?? null, // γ1i (CAP14) — "Unattach an Equipment from <self>": legalChoices picks the Equipment, dispatcher unattaches it + threads its mana value
      costModeled: !!cost,
      isManaEffect,
      doubleManaPool, // DOUBLE-MANA-POOL (Doubling Cube) — the runtime doubles the activator's pool (no stack)
      program,
      // Playable on the stack: cost is mana+{T}(+pay-life/self-sac/exile/remove-counter), effect is HIGH
      // (non-modal, non-X), NOT a mana ability (no-stack path), AND — for a cost that can make the source
      // LEAVE the battlefield (self-sac, self-exile, OR a remove-counter that can be LETHAL: a +1/+1
      // removal drops derived toughness, so the source dies) — leaving won't silently drop one of the
      // card's own triggers (the shared γ1 fail-safe; a normal "When this dies" still fires via the dies
      // path, so it's not flagged and not over-restricted).
      // SELF-LTB EXCEPTION, sacrifice-only (see sacrificeDropsTriggerIgnoringSelfLtb): a PURE
      // sacrifice-self cost may ignore a SELF-LTB clause, because that path provably fires it. A cost
      // that ALSO exiles-self keeps the blanket refusal — that path is unprobed.
      // REMOVE-COUNTER EXCEPTION (see removeCounterCostCannotLeave): a PURE remove-counter cost whose
      // counter type cannot make the source leave (named, non-P/T, non-time/fade) skips the fail-safe
      // entirely — nothing leaves the battlefield when it is paid, so no trigger can be dropped
      // (runtime-probed on Vat of Rebirth). A lethal (+1/+1) or vanishing (time) removal keeps it.
      modeled: !!cost && !isManaEffect && effectHigh
        && !((cost.sacSelf || cost.exileSelf || cost.removeCounter)
          && (cost.sacSelf && !cost.exileSelf && !cost.removeCounter ? sacUnsafeIgnoringSelfLtb
            : !cost.sacSelf && !cost.exileSelf && removeCounterCostCannotLeave(cost.removeCounter) ? false
            : sacUnsafe)),
      needsTarget: effectHigh && !!program && programNeedsChosenTarget(program),
    });
  }
  return out;
}

// ─── LEVEL UP (BLITZ LV-1 — CR 702.87 / 711) ─────────────────────────────────────────────────────
//
// The leveler lane: "Level up [cost]" IS an activated ability — CR 702.87a defines it as
// "[Cost]: Put a level counter on this permanent. Activate only as a sorcery." — so the frame is
// rewritten to EXACTLY that CR text and parsed through the SAME loop as every printed ability
// (the add-named-counter-self atom resolves it; the counter is plain serializable permanent
// state). Band colon-lines (Brimstone Mage's pingers, Kargan Dragonlord's firebreathing) are
// parsed identically and stamped with their band's `levelGate` ({atLeast, atMost|null} on the
// SOURCE's own `level` counters) — legalChoices offers them only while the gate is open
// (CR 711.2a/b: the band's abilities exist only at those counts).
//
// WHOLE-CARD-OR-NOTHING (THE CREED): abilities are emitted ONLY when the ENTIRE card is modeled —
// the frame parses (leveler.js), the card is a creature, nothing precedes the bands, every band
// has a printed P/T box and only closed-vocabulary keyword lines + fully-MODELED colon lines. One
// unmodeled band line (islandwalk, "can't be blocked…", a banded trigger, a quoted mana grant, an
// unparsed cost) ⇒ the frame emits NOTHING — no level-up offer, no band abilities, no statics
// (staticAbilityParser gates on this same function via the injected validator), so a parked
// leveler plays exactly as before this slice: a vanilla body. Never a half-leveled permanent.
const _levelerMemo = new WeakMap(); // card -> bundle | null (card objects are immutable, house convention)

function levelerActivatedAbilities(card) {
  return modeledLeveler(card)?.abilities ?? [];
}

/**
 * The single whole-card gate for the leveler frame. Returns
 *   { levelUpPips, bands: [{ atLeast, atMost, power, toughness, keywords[], anthems[] }], abilities: [...] }
 * when EVERY piece of the card is modeled, else null. Consumed by: this file (the activated lane),
 * staticAbilityParser (band P/T + keyword statics, via registerLevelerCardValidator — injected by
 * coverage.js / legalChoices.js to avoid the load-time cycle), and coverage.js (the classifier).
 * Metric and runtime share THIS parse, so they cannot drift.
 */
export function modeledLeveler(card) {
  if (typeof card === "object" && card !== null && _levelerMemo.has(card)) return _levelerMemo.get(card);
  const bundle = computeModeledLeveler(card);
  if (typeof card === "object" && card !== null) _levelerMemo.set(card, bundle);
  return bundle;
}

function computeModeledLeveler(card) {
  const lv = parseLeveler(card);
  if (!lv) return null;
  // Creature levelers only (the one printed non-creature leveler — Under-Construction Skyscraper,
  // a Land — has band MANA abilities the mana lane doesn't band-gate; it stays exactly as before).
  if (!/\bcreature\b/i.test(String(card?.type || card?.type_line || ""))) return null;
  // CR 711.4: a line outside every band would be a normal always-on ability. No printed creature
  // leveler has one; fail closed rather than guess where it belongs.
  if (lv.preBandLines.length) return null;
  for (const b of lv.bands) {
    if (!b.pt) return null;                 // every band must carry its printed P/T box (CR 711.2a)
    if (b.unmodeledLines.length) return null; // an unbucketed band line parks the whole card
  }
  // Rewrite the frame to its CR-702.87a text and parse through the ONE activated-ability loop.
  // The synthetic oracle has no "Level up" line and no band headers, so the recursive call takes
  // the normal path. Band colon-lines keep their exact printed text — the raw→gate map below
  // re-attaches each descriptor to its band (duplicate text across bands would be ambiguous →
  // fail closed; no printed leveler duplicates a line).
  const levelUpLine = `${lv.levelUpPips}: Put a level counter on this permanent.`;
  const gateByRaw = new Map();
  const syntheticLines = [levelUpLine];
  for (const b of lv.bands) {
    const gate = { atLeast: b.atLeast, atMost: b.atMost };
    for (const line of b.colonLines) {
      if (gateByRaw.has(line) || line === levelUpLine) return null; // ambiguous mapping → park
      gateByRaw.set(line, gate);
      syntheticLines.push(line);
    }
  }
  const abilities = parseActivatedAbilities({
    name: card?.name,
    type: String(card?.type || card?.type_line || ""),
    oracle: syntheticLines.join("\n"),
  });
  // Every synthetic line must have produced a descriptor (a line the loop silently skipped —
  // an unparseable cost shape — would otherwise vanish from the audit) and every descriptor
  // must be fully modeled. One miss ⇒ the whole card parks.
  if (abilities.length !== syntheticLines.length) return null;
  const stamped = abilities.map((ab) => {
    if (ab.raw === levelUpLine) {
      // CR 702.87a "Activate only as a sorcery": enforced at the offer gate (legalChoices requires
      // canCastSorcerySpeed — own main, empty stack), not just the main-step approximation.
      return { ...ab, isLevelUp: true, sorceryOnly: true };
    }
    return { ...ab, levelGate: gateByRaw.get(ab.raw) };
  });
  if (stamped.some((ab) => !ab.isLevelUp && !ab.levelGate)) return null; // a descriptor from nowhere → park
  if (!stamped.every((ab) => ab.modeled)) return null;
  return {
    levelUpPips: lv.levelUpPips,
    bands: lv.bands.map((b) => ({
      atLeast: b.atLeast,
      atMost: b.atMost,
      power: b.pt.power,
      toughness: b.pt.toughness,
      keywords: [...b.keywords],
      anthems: b.anthems.map((a) => ({ ...a })), // SG-1: band group anthems, source-gated on this band
    })),
    abilities: stamped,
  };
}

// Host = the enchanted/equipped CREATURE (Aura/Equipment) OR an enchanted LAND (a land-enchanting Aura that
// grants the land an activated ability — Squirrel Nest "Enchanted land has \"{T}: Create a 1/1 …\"", Caustic
// Tar, Barbed Field). The quoted body is parsed identically; the caller enumerates it on the host permanent
// (a land taps for its {T} cost with no summoning-sickness gate). A land-MANA grant ("{T}: Add …") is the
// phase-1a path and is filtered out by isManaEffect below, so this never double-counts a mana land-aura.
// AC-1 (BLITZ day 2): the COMPOUND pump form "Enchanted creature gets +N/+N and has \"…\"" (Deviant
// Glee / Trollhide / Lunarch Mantle) carries its granted ability behind an optional "gets ±N/±N and "
// infix — the quoted body is extracted identically; the P/T half is the layer engine's
// (parseAttachedClause folds it, CREED-gated on the same group-activated validator).
const GRANTED_ACTIVATED_LINE = /^(?:enchanted|equipped) (?:creature|land)\s+(?:gets [+-]\d+\/[+-]\d+ and )?(?:has|have)\s+["“]([^"”]+)["”]\s*\.?$/i;

/**
 * GRANTED activated abilities (subsystem 1 phase 1b) — an Aura/Equipment that grants the enchanted/equipped
 * CREATURE an activated ability: "Enchanted creature has \"{T}: This creature deals 1 damage to any
 * target.\"" (Hermetic Study), "\"{B}: This creature gets +1/+1 until end of turn.\"" (Midnight Covenant),
 * "Equipped creature has \"{T}: This creature deals 2 damage to any target.\"" (Bow of the Hunter). The
 * QUOTED ability text is parsed through the SAME parseActivatedAbilities path, so its cost / effect /
 * `modeled` flag / target shape are identical to a printed ability — the runtime + coverage can't drift.
 *
 * The descriptors are enumerated by the caller ON THE HOST permanent (legalChoices), so "this creature"
 * / "you" in the granted effect bind to the host / its controller at resolution (sourceId = host). A
 * granted MANA ability (phase 1a, the tap-for-mana path) and a granted TRIGGERED ability (a different
 * runtime — phase 1c) are NOT returned here. Pure; card-based (no state). Returns [] for a non-grant card.
 */
export function parseGrantedActivatedAbilities(card) {
  const oracle = stripReminder(card?.oracle || card?.oracle_text || "");
  if (!oracle.trim()) return [];
  const out = [];
  for (const rawLine of oracle.split(/\n+/)) {
    const m = rawLine.trim().match(GRANTED_ACTIVATED_LINE);
    if (!m) continue;
    const quoted = m[1].trim();
    if (/^(?:when|whenever|at the beginning)/i.test(quoted)) continue;   // granted TRIGGERED ability → phase 1c
    for (const ab of parseActivatedAbilities({ name: "Granted", type: "Creature", oracle: quoted })) {
      if (ab.isManaEffect) continue;                                     // granted MANA ability → phase 1a path
      out.push({ ...ab, granted: true, index: 1000 + out.length });
    }
  }
  return out;
}

/**
 * GROUP-GRANT (CR 113.7) — whether a quoted group-grant body ("{2}: Regenerate this permanent.", "{2},
 * Sacrifice this permanent: Draw a card.") is a FULLY-MODELED, non-mana ACTIVATED ability. The single CREED
 * gate staticAbilityParser registers its group-activated emission with (registerGroupActivatedBodyValidator)
 * AND that legalChoices filters the runtime enumeration on — single-sourced here, over the SAME
 * parseActivatedAbilities a printed ability uses, so classification and runtime can't drift. A targeted/
 * X-scaling/otherwise-unmodeled body returns false → no grant emitted, none offered (a safe FN → Arbiter).
 */
export function isModeledGroupActivatedBody(quoted) {
  const abs = parseActivatedAbilities({ name: "GroupGranted", type: "Creature", oracle: String(quoted || "") });
  return abs.length > 0 && abs.every((a) => a.modeled && !a.isManaEffect);
}
