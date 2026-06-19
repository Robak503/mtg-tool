/**
 * coverage.js — how much of a deck the Academy engine plays NATIVELY.
 *
 * The metric for Phase 7's "road to 100%". A card is classified into a tier that
 * mirrors what the engine ACTUALLY does when you play it, so the headline number
 * climbs automatically as each coverage phase ships (no separate bookkeeping):
 *
 *   native tiers (the engine does the mechanically-right thing):
 *     land          — a land (the mana system taps it)
 *     native-mana   — a permanent whose tap produces mana (rocks/dorks)
 *     native-body   — a vanilla or keyword-only creature/permanent (body + layers)
 *     native-spell  — an instant/sorcery whose EffectProgram parses HIGH
 *   gap tiers (bounces to the Arbiter, or only the body works):
 *     body-only     — a permanent with abilities the engine doesn't model yet
 *     arbiter-spell — an instant/sorcery the EffectProgram can't model
 *     native-planeswalker — a planeswalker whose every loyalty ability is fully modelled (PW-1; counts native)
 *     playable-pw   — PW-2 hybrid: plays natively (loyalty/combat/modelled abilities) but ≥1 ability
 *                     routes to the Arbiter at activation (NOT counted native — partial coverage)
 *     arbiter-pw    — a planeswalker with unmodelled static/triggered residual text (whole card → Arbiter)
 *     unknown       — not found in the card index
 *
 * Pure: depends only on the EffectProgram parser (no card index, no filesystem),
 * so it runs in CI. The dev dashboard (scripts/measure-coverage.mjs) feeds it
 * enriched cards from the local index; tests feed it fixtures.
 *
 * As P2.8+ land, extend `classifyCard` to recognise the newly-modelled shapes
 * (e.g. an ETB whose clause parses HIGH → native-body), calling the SAME engine
 * parsers the runtime uses so the metric stays honest.
 */

import { parseEffectProgram, parseEffectClause, programConfidence, programNeedsChosenTarget, programTriggerTargetsResolvable } from "./effects/parser.js";
import { detectTriggers } from "./triggers.js";
import { parseActivatedAbilities, parseAbilityCost } from "./effects/abilities.js";
import { staticAbilitiesCoverCard, clauseProducesStatic, isLevelGatedOracle, parseEquipmentBonus, equipmentAbilityClauses, isAuraCard, isNativeAura } from "./staticAbilityParser.js";
import { isCloneCard } from "./cloneCopy.js";
import { planeswalkerNativelyCovered, planeswalkerPlayable } from "./effects/loyaltyAbilities.js";
import { castsAsPlaneswalker, isPlaneswalker } from "./gameState.js";
import { isEnforcedEvasionClause } from "./combatEvasion.js";
import { stripCreatedTokenAbilities } from "./manaModel.js";
import { hasKeyword } from "./keywords.js";

// KW-POISON CREED GUARD: infect/wither replace ALL damage from the source (CR 702.90b / 702.79b),
// but the engine routes only COMBAT damage through that replacement (combatResolution.js). A creature
// with infect or wither AND a non-combat damage-dealing ability (a pinger / a "deal N damage" trigger)
// would mis-resolve that ability's damage as ordinary damage instead of -1/-1 counters / poison — a
// CREED false positive. Such a card stays body-only until non-combat infect routing is enforced (the
// damage-atom follow-up). Pure keyword-only infect/wither creatures are unaffected: they only ever deal
// COMBAT damage, which IS enforced, so they still flip native-body above. Toxic is exempt — it adds
// poison ONLY on combat damage (CR 702.180a), so a toxic creature's other damage abilities are ordinary.
function infectWitherWithNonCombatDamage(card, oracle) {
  if (!(hasKeyword(card, "Infect") || hasKeyword(card, "Wither"))) return false;
  const nonReminder = String(oracle || "").replace(/\([^)]*\)/g, " ");
  return /\bdeals?\s+(?:\d+|x|that much)\s+damage|\bdeals?\s+damage\b/i.test(nonReminder);
}

// Keywords a keyword-only body counts native on — TWO classes, per Colton's
// "enforce, don't drop" policy (2026-06-18, docs/orchestration/retired-fp-ledger.md):
//
//  ENFORCED — the runtime consults the keyword (permanentHasKeyword / an SBA /
//  attack-legality / target-legality), so the body resolves CORRECTLY today:
//    flying·reach + the EVADE block-legality set — menace (≥2, CR 702.111b), skulk, fear,
//    intimidate, horsemanship, basic landwalk, unblockable, can't-block, can-block-only-flying —
//    all via combatEvasion.canBlockAttacker / the menace resolution-normalize · defender (can't
//    attack, CR 702.3b) · hexproof·shroud (enumerateTargets targetability — shroud untargetable by
//    all, hexproof untargetable by opponents; KW-UNTARGET) · prowess (a noncreature-cast self-pump
//    trigger — TRIG-PROWESS, triggers.checkCastTriggers) · first/double strike·trample·deathtouch·
//    lifelink (combatResolution) · vigilance (no attack-tap) · haste (summoning-sickness) ·
//    indestructible (lethal-damage SBA). flash (casting timing) + changeling/devoid (type/color
//    identity) likewise never mis-resolve.
//
//  INTERIM-FP — the rule is NOT enforced yet (a body currently mis-plays it), BUT the
//  mechanic is TRACTABLE: we KEEP it claimed native and BUILD the enforcement
//  (engine-first, Cindy's lane) rather than drop coverage. An accepted, time-boxed
//  trade — do NOT re-drop these (that was #255, SUPERSEDED); the enforcement tasks
//  restore correctness and each is logged in retired-fp-ledger.md:
//    ward·protection → ward = a TAX not an exclusion (CR 702.21, deferred); protection = DEBT (δ)
//  (Dropping to the Arbiter is the LAST RESORT — genuinely-hard/exotic mechanics only.)
export const COVERED_KEYWORDS = [
  "flying", "reach", "first strike", "double strike", "trample", "deathtouch",
  "lifelink", "vigilance", "menace", "haste", "defender", "flash", "hexproof",
  "shroud", "indestructible", "ward", "protection", "prowess", "skulk",
  "intimidate", "fear", "horsemanship", "shadow", "changeling", "devoid",
  // KW-POISON — ENFORCED in combatResolution.js: infect/wither reroute combat damage to a creature
  // into -1/-1 counters (CR 702.90b/702.79b); infect reroutes combat damage to a player into poison
  // (702.90a); toxic N adds N poison on top of normal player damage (702.180a); ten poison loses the
  // game (704.5c). "toxic" matches the oracle clause "toxic N" via the startsWith check.
  "infect", "wither", "toxic",
];

const stripReminder = (s) => String(s || "").replace(/\([^)]*\)/g, " ");

/**
 * True when a permanent's oracle text is empty (vanilla), only evergreen keywords, or an enforced
 * EVADE evasion clause (basic landwalk / unblockable / can't-block / can-block-only-flying). The
 * optional `name` is normalized to "this creature" so a self-clause printed with the card name
 * ("Invisible Stalker can't be blocked.") reads as a covered self-clause; a nameless caller simply
 * under-claims such self-clauses (safe — false-negative).
 */
export function isKeywordOnly(oracle, name) {
  let t = stripReminder(oracle).toLowerCase().replace(/[’']/g, "'");
  if (name) {
    const n = String(name).toLowerCase().replace(/[’']/g, "'").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (n) t = t.replace(new RegExp(`\\b${n}\\b`, "g"), "this creature");
  }
  if (!t.trim()) return true; // vanilla
  // Split on SENTENCE boundaries (. ! ?) too — not just , ; \n and. Otherwise a trailing non-keyword
  // sentence glued on by a strip ("flying  scry 1.") is swallowed whole by `startsWith("flying ")`
  // and mis-credited as keyword-only. Splitting on the period forces "scry 1" to stand alone and fail.
  const clauses = t.split(/[,;.!?\n]|\band\b/).map((c) => c.trim()).filter(Boolean);
  return clauses.every((c) =>
    COVERED_KEYWORDS.some((k) => c === k || c === `${k}.` || c.startsWith(`${k} `)) ||
    isEnforcedEvasionClause(c),
  );
}

/**
 * True when a permanent's tap produces mana — the mana system taps rocks/dorks
 * generically, so its primary role plays even if a secondary ability doesn't.
 *
 * Reminder text (parentheses) is STRIPPED first (CR 207.2 — reminder text is never
 * rules-bearing): otherwise a token-MAKER whose only "Add … mana" text lives inside the
 * reminder describing the token it creates ("…create a Treasure token. (It's an artifact
 * with "{T}, Sacrifice this token: Add one mana of any color.")" — Mahadi, Brazen Freebooter)
 * would be mis-claimed native-mana even though the permanent itself has NO mana ability and
 * its real ETB/trigger is unmodeled. A genuine mana source states its ability in the main
 * text, so stripping the reminder never drops a real rock/dork (matches the parser, which
 * strips reminders before matching).
 */
export function hasManaAbility(oracle) {
  // Strip a created token's quoted ability before reading the card's OWN mana — a token's "…Add …"
  // belongs to the token, not the card (mirrors manaModel.manaProduction, so the classifier and runtime
  // agree). Without this, an Eldrazi Spawn-maker is mis-tiered native-mana before its real trigger is
  // even checked (this tier is read at line ~341, ahead of permanentTriggersCovered).
  const t = stripCreatedTokenAbilities(stripReminder(oracle));
  return /\badd \{[wubrgcx]/i.test(t) ||
    /\badd (one|two|three|four|five|that much|an amount|\{)/i.test(t);
}

/** True when an instant/sorcery resolves fully through the EffectProgram interpreter. */
export function spellIsNative(card) {
  const program = parseEffectProgram({ type: card.type, oracle: card.oracle, mana: card.mana, name: card.name });
  return !!program && programConfidence(program) === "high";
}

/**
 * True when a permanent's ENTIRE non-keyword text is triggered abilities the engine
 * now fires natively (P2.8 + the flush-time target chooser): every detected trigger's
 * effect routes through the EffectProgram interpreter (high, non-modal — the same gate
 * `flushTriggers`/`buildTriggerStack` uses, including TARGETED triggers, whose targets
 * the flush chooser binds at stack time), AND nothing else is left after removing the
 * trigger sentences + reminder + keywords (no activated/static residue). This is the
 * common "body + one ETB value/removal trigger" creature — fully native now.
 *
 * Mirrors the runtime exactly: a MODAL trigger (would silently pick a mode) and an
 * INTERVENING-IF trigger (CR 603.4, condition unevaluated at flush) are NOT routed by
 * the engine, so they do NOT count as native.
 */
/**
 * Does ONE detected trigger route natively through the flush stage? HIGH, non-modal,
 * non-intervening-if EffectProgram — the exact gate `gameEngine.buildTriggerStack` uses.
 * The single source of truth for both `permanentTriggersCovered` and the composite
 * classifier, so the trigger-routing rule can't drift between them.
 */
function triggerRoutesNatively(d) {
  if (!d.effectClause || d.interveningIf) return false; // intervening-if → not routed
  const p = parseEffectClause(d.effectClause, "Instant");
  // Mirror buildTriggerStack's α1 ALLOWLIST EXACTLY: a HIGH non-modal trigger routes natively only
  // when every chosen-target atom is intent-resolvable (the enemy/own chooser can place it on a
  // correct side). An AMBIGUOUS targeting atom (bounce) stays in the gap, not native — so the metric
  // never claims a routing the runtime won't perform.
  return !!p && programConfidence(p) === "high" && p.structure !== "modal"
    && (!programNeedsChosenTarget(p) || programTriggerTargetsResolvable(p));
}

// The When/Whenever/At sentence shape (matches detectTriggers' grammar). Used to COUNT
// trigger-shaped sentences so an UNMODELED-event trigger ("Whenever you cast …", "…put
// into a graveyard …") can't be silently stripped from the residue and mis-credited.
const TRIGGER_SENTENCE_RE = /(?:^|[\n.;]\s*)(?:When|Whenever|At)\b\s+[^.]+\./gi;

/**
 * Every trigger-shaped sentence on the card is a DETECTED trigger that routes natively.
 * detectTriggers only returns descriptors for events it recognizes (etb/dies/step/attack);
 * an unrecognized trigger sentence is counted by the regex but absent from `detected`, so a
 * count mismatch means there's an unmodeled trigger → the card is NOT fully covered. This
 * closes the residue's blind spot (it strips ALL When/Whenever/At text regardless of model).
 */
function allTriggerSentencesModeled(card, oracle) {
  const shaped = (String(oracle).match(TRIGGER_SENTENCE_RE) || []).length;
  const detected = detectTriggers(card);
  if (detected.length !== shaped) return false;     // an unrecognized-event trigger sentence
  return detected.every(triggerRoutesNatively);      // every recognized trigger's effect routes
}

export function permanentTriggersCovered(card) {
  const triggers = detectTriggers(card); // card IS the publicCard shape — keep WeakMap cache hits
  if (triggers.length === 0) return false;
  if (!allTriggerSentencesModeled(card, card?.oracle || "")) return false;
  // Remove the trigger sentences (same anchored grammar detectTriggers uses); what's
  // left must be keyword-only/empty, or there's unmodeled activated/static text.
  const residue = String(card.oracle || "").replace(/(?:^|[\n.;]\s*)(When|Whenever|At)\b[^.]+\./gi, " ");
  return isKeywordOnly(residue, card?.name);
}

/**
 * True when a permanent's ENTIRE non-keyword text is activated abilities the engine now
 * plays natively (P2.9): EVERY detected `{cost}: effect` ability is `modeled` (cost
 * reduces to mana + `{T}`; effect parses HIGH, non-modal, non-X) — the same
 * `parseActivatedAbilities` gate the runtime offers on — AND nothing else is left after
 * removing the activated-ability lines + reminder + keywords.
 *
 * Conservative by construction (never over-claims):
 *  - It does NOT strip trigger sentences. A card with ANY trigger (or static) text keeps
 *    that text in the residue → NOT native-activated, because the engine would route the
 *    trigger to the Arbiter. The trigger+activated COMPOSITE (both modeled → native) is a
 *    deliberate later refinement; under-claiming here is safe, over-claiming is not.
 *  - A complex mana ability ("Add X mana where X is …") that slipped past `hasManaAbility`
 *    is `modeled:false` (its effect is a mana ability, not a stack effect), so it fails the
 *    every-modeled gate — never counted as covered.
 *
 * Simple mana dorks ("{T}: Add {G}") are caught earlier by `hasManaAbility` → native-mana,
 * so this fires on the value-ability case (a `{2}, {T}: Draw`, a `{T}`-pinger, a tapper…).
 */
/**
 * Does this single oracle line read as an activated ability the detector picks up? Mirrors the
 * EXACT detection guard in `parseActivatedAbilities` (a colon whose cost is symbol-bearing OR a
 * modeled word-cost — γ1's "Pay N life" / "Sacrifice this"), so the residue strippers below can
 * never drift from what the parser detects. Single source of truth = the shared `parseAbilityCost`.
 */
function isActivatedAbilityLine(line) {
  const ci = line.indexOf(":");
  if (ci === -1) return false;
  const costStr = line.slice(0, ci).trim();
  return costStr.includes("{") || !!parseAbilityCost(costStr);
}

export function permanentActivatedCovered(card) {
  const abilities = parseActivatedAbilities(card);
  if (abilities.length === 0) return false;
  // A single unmodeled ability (unmodeled cost OR effect, incl. complex mana abilities)
  // leaves the card in the gap — all-or-nothing, mirroring the all-or-nothing runtime.
  if (!abilities.every((a) => a.modeled)) return false;
  // Drop reminder, then every activated-ability-shaped line (the same shape the parser detects).
  // The remainder (keywords, and any trigger/static text) must be keyword-only/empty.
  const residue = stripReminder(card.oracle || "")
    .split(/\n+/)
    .filter((line) => !isActivatedAbilityLine(line))
    .join("\n");
  return isKeywordOnly(residue, card?.name);
}

/**
 * The COMPOSITE classifier: true when a permanent's ENTIRE non-body text is modeled, even
 * when it MIXES ability types (an ETB trigger + a `{T}` ability + a static anthem). The
 * single-mechanism predicates above each demand "no OTHER residue", so a multi-ability
 * creature reads body-only despite every piece being modeled — yet the engine already
 * plays all of them (the subsystems are independent). This unifies them: subtract the
 * trigger sentences + activated-ability lines, then require every remaining clause to be a
 * modeled static or keyword-only, with every trigger routing and every activated modeled.
 *
 * Conservative by construction: ANY unmodeled piece (a non-routing trigger, an unmodeled
 * activated cost/effect, an unmodeled static, a leveler) → false. Pure metric — it changes
 * only how cards are COUNTED, never what the engine does.
 */
export function permanentFullyCovered(card) {
  const oracle = String(card?.oracle || "");
  if (!oracle.trim()) return false;             // vanilla → native-body handles it
  if (isLevelGatedOracle(oracle)) return false;  // level-gated buffs aren't always-on

  // Every trigger-shaped sentence must be a detected trigger that routes (the count guard
  // closes the residue's blind spot for unmodeled-event triggers like "Whenever you cast …").
  if (!allTriggerSentencesModeled(card, oracle)) return false;
  const triggers = detectTriggers(card);
  const activated = parseActivatedAbilities(card);
  if (!activated.every((a) => a.modeled)) return false;     // an unmodeled activated ability

  // Need at least one MODELED ability (else this is keyword-only/vanilla, caught earlier).
  if (triggers.length === 0 && activated.length === 0) {
    if (!staticAbilitiesCoverCard(card, isKeywordOnly)) return false;
  }

  // Residue: drop trigger sentences (anchored, the detectTriggers grammar) + activated-ability
  // lines (the same shape the parser detects, incl. γ1 word-costs), then every remaining clause
  // must be a modeled static or keyword-only — no unmodeled trigger/static/other text survives.
  const afterTriggers = oracle.replace(/(?:^|[\n.;]\s*)(When|Whenever|At)\b[^.]+\./gi, "\n");
  const afterActivated = stripReminder(afterTriggers)
    .split(/\n+/)
    .filter((line) => !isActivatedAbilityLine(line))
    .join("\n");
  for (const clause of afterActivated.split(/[\n.;]+/).map((s) => s.trim()).filter(Boolean)) {
    if (clauseProducesStatic(clause)) continue;  // a modeled static clause
    if (isKeywordOnly(clause, card?.name)) continue;  // keyword-only / vanilla
    return false;                                 // unmodeled residue
  }
  return true;
}

/**
 * True when an Equipment's ENTIRE non-keyword text is the attach mechanic the engine now
 * plays: a modeled "Equip {cost}" ability + a cleanly-modeled "Equipped creature gets +X/+Y
 * / has [keyword]" bonus, plus (ETB-EQUIP-ATTACH) an optional natively-routing ETB-attach
 * trigger ("When this Equipment enters, attach it to target creature you control"). ALL-OR-
 * NOTHING (mirrors the runtime): every trigger sentence must route natively; every activated
 * ability must be a modeled Equip; the bonus must parse cleanly (a rider drops
 * parseEquipmentBonus to []); and nothing else may be left after the trigger + Equip +
 * equipped-creature lines. A complex equipment (a NON-routing trigger, a non-Equip activated
 * ability, an unmodeled bonus rider) stays body-only.
 */
export function permanentEquipmentCovered(card) {
  if (!/\bequipment\b/i.test(String(card?.type || ""))) return false;
  // ETB-EQUIP-ATTACH: allow a natively-routing trigger (the auto-attach). Require EVERY trigger to route,
  // then STRIP the trigger sentences so the Equip + bonus + residue checks below see only the static text
  // — exactly the prior behavior for a trigger-less equipment (the strip is a no-op there). A non-routing
  // trigger fails allTriggerSentencesModeled → body-only (never an over-claim).
  const oracle = String(card.oracle || "");
  if (!allTriggerSentencesModeled(card, oracle)) return false;
  const noTrig = { ...card, oracle: oracle.replace(/(?:^|[\n.;]\s*)(When|Whenever|At)\b[^.]+\./gi, " ") };
  const abilities = parseActivatedAbilities(noTrig);
  if (abilities.length === 0 || !abilities.every((a) => a.isEquipAbility && a.modeled)) return false;
  // The bonus parser is all-or-nothing over every equipped-creature clause: a non-empty result
  // guarantees EVERY clause touching the creature parsed cleanly (no rider silently dropped).
  if (parseEquipmentBonus(noTrig).length === 0) return false;
  // Clause-granular residue (split on . ; \n — same as the bonus parser, so a period-joined
  // rider can't be swallowed by a whole-line strip). Every clause must be a modeled Equip
  // line or an equipped-creature clause (already validated clean above). ANYTHING else — a
  // self-keyword printed on the EQUIPMENT ("Indestructible"), an unmodeled equip variant
  // ("Equip Human {1}"), a non-Equip activated ability — leaves residue → body-only, so a
  // not-fully-modeled equipment is never over-claimed as native (CLAUDE.md "no silent gaps").
  const modeledEquipLine = /^equip\s*(?:[—–-])?\s*(?:\{[^}]+\})+$/i;
  for (const clause of equipmentAbilityClauses(stripReminder(noTrig.oracle || ""))) {
    const c = clause.toLowerCase().trim();
    if (!c) continue;
    if (modeledEquipLine.test(c)) continue;
    if (/\bequipped creature\b/.test(c) || /^it\b/.test(c) || /^that creature\b/.test(c)) continue;
    return false; // residue the engine doesn't model → body-only
  }
  return true;
}

// ===== FIX-MANA-OVERCLAIM: residue gate on the native-mana tier =====
// `hasManaAbility` is loose by design, and `classifyCard` returned `native-mana` on its basis BEFORE the
// trigger/activated/mixed gates and WITHOUT requiring the rest of the card to be modeled — so a mana
// source with an unmodeled TRIGGER or level structure (Mana Crypt's upkeep coin-flip; Sorcerer Class's
// levels) was counted fully native: a metric over-claim (the runtime already routes the unmodeled piece
// to the Arbiter — `classifyCard` has no runtime consumer). This makes `native-mana` all-or-nothing like
// every other native tier: a mana source is native only when its non-mana TRIGGER text is modeled too.
//
// "Modeled" = the SAME gate the native-trigger tier uses (`allTriggerSentencesModeled`: every trigger-shaped
// sentence is a detected trigger whose effect routes natively), plus not level-gated. A "pure mana" trigger
// (an ETB/upkeep/cast "add {mana}") is deliberately NOT a free pass: the runtime mana model produces mana
// ONLY from tapping/sacrificing a `{T}`/sac source — it never fires triggered mana — so a triggered-mana-
// ONLY card (Burning-Tree Emissary, Coal Stoker) yields ZERO mana natively and is a genuine over-claim, not
// a false negative. (The smaller non-mana ACTIVATED-ability over-claim — Lantern of Revealing — is a
// fragile, separate follow-up: distinguishing a mana ability from a value ability is error-prone, and
// under-correcting is the safe direction.)
function manaCardResidueModeled(card, oracle) {
  return !isLevelGatedOracle(oracle) && allTriggerSentencesModeled(card, oracle);
}

/**
 * Classify one card into a coverage tier. Input: { type, oracle, mana, name }
 * (the `publicCard` shape — type is the type line, oracle the full oracle text).
 */
export function classifyCard(card) {
  const type = String(card?.type || "").toLowerCase();
  const oracle = card?.oracle || "";
  // A planeswalker (PW-1) — keyed on the FRONT face (castsAsPlaneswalker) so a creature-front DFC
  // (Jace, Vryn's Prodigy) classifies by its creature side below, matching how it actually casts.
  // Native when EVERY loyalty ability is a fully-modeled HIGH program and there's no unmodeled
  // residual text (planeswalkerNativelyCovered, the all-or-nothing CREED gate); otherwise the whole
  // walker routes to the Ollama-only Arbiter (arbiter-pw). CHECKED BEFORE the land tier so a Land
  // Planeswalker (Wrenn and One — type "Land Planeswalker") with unmodeled loyalty isn't masked as
  // native-`land` (FIX-PW-LAND-ORDER): all-or-nothing wins — an unmodeled loyalty ability → arbiter-pw.
  if (castsAsPlaneswalker(card)) {
    if (planeswalkerNativelyCovered(card)) return "native-planeswalker"; // every loyalty ability modeled (counts native)
    if (planeswalkerPlayable(card)) return "playable-pw";                // PW-2 hybrid: plays, some abilities → Arbiter (NOT counted native)
    return "arbiter-pw";                                                 // unmodeled static/trigger residue → whole card to the Arbiter
  }
  if (/\bland\b/.test(type)) return "land";
  // A DFC with a planeswalker BACK face but a non-PW front (Jace, Vryn's Prodigy; Valki // Tibalt)
  // enters as its front at runtime; its transform + back face are unmodeled, so it's NEVER native.
  // Classify body-only directly — running the creature native classifiers on the combined oracle could
  // false-positive (a stray "Add"/keyword line) and wrongly count it native (CREED). Caught here,
  // before those classifiers.
  if (isPlaneswalker(card)) return "body-only";
  if (/\b(instant|sorcery)\b/.test(type)) {
    return spellIsNative(card) ? "native-spell" : "arbiter-spell";
  }
  // An Aura's oracle describes effects on the ENCHANTED permanent, not the Aura itself, so the
  // generic permanent classifiers below (mana / trigger / activated / static) would mis-read
  // its text (e.g. a granted "{T}: Add …" on the enchanted land reads as a mana ability the
  // Aura doesn't have). An Aura is EITHER fully native (enter + attach + a clean
  // enchanted-creature bonus, no residue) OR body-only — whose cast routes to the Arbiter
  // seam, never a do-nothing permanent. Exhaustive + first, so no Aura slips into a wrong tier.
  if (isAuraCard(card)) return isNativeAura(card) ? "native-aura" : "body-only";
  // A clone (CR 707) — a creature whose WHOLE text is "enters as a copy of a creature" — now
  // plays natively (it suspends on a copy-choice and enters as a snapshot). Checked before the
  // generic classifiers (its copy clause isn't a trigger/static/mana ability they'd recognize).
  if (isCloneCard(card)) return "native-clone";
  // Permanent (creature / artifact / enchantment / battle): the body always works.
  if (isKeywordOnly(oracle, card?.name)) return "native-body";
  // KW-POISON CREED GUARD (see helper): an infect/wither creature with a non-combat damage ability mis-
  // resolves that damage (only combat infect/wither is routed), so it stays body-only — checked before
  // the native-mana/trigger/activated/mixed gates so a modeled pinger can't wrongly clear it to native.
  if (infectWitherWithNonCombatDamage(card, oracle)) return "body-only";
  // FIX-MANA-OVERCLAIM: a mana source counts native-mana only when its non-mana trigger text is modeled
  // too (else it falls through to the all-or-nothing trigger/activated/mixed gates → body-only/Arbiter).
  if (hasManaAbility(oracle) && manaCardResidueModeled(card, oracle)) return "native-mana";
  // Single-mechanism tiers first (the informative labels), then the composite catch-all for
  // multi-ability creatures whose pieces are each modeled but span types.
  if (permanentTriggersCovered(card)) return "native-trigger";   // P2.8: body + only-routing triggers
  if (permanentActivatedCovered(card)) return "native-activated"; // P2.9: body + only-modeled activated abilities
  if (staticAbilitiesCoverCard(card, isKeywordOnly)) return "native-static"; // P2.10: body + only-modeled static anthems
  if (permanentEquipmentCovered(card)) return "native-equipment"; // attach: Equip + a clean equipped-creature bonus
  if (permanentFullyCovered(card)) return "native-mixed";        // composite: modeled trigger + activated + static together
  return "body-only";
}

export const NATIVE_TIERS = new Set(["land", "native-mana", "native-body", "native-spell", "native-trigger", "native-activated", "native-static", "native-equipment", "native-aura", "native-clone", "native-mixed", "native-planeswalker"]);
export const isNativeTier = (tier) => NATIVE_TIERS.has(tier);

// Mechanism buckets for the gap (priority-ordered; first match wins) — the roadmap.
const BUCKETS = [
  ["ETB trigger", /when(ever)?\b[^.]{0,50}enters/i],
  ["Dies/LTB trigger", /when(ever)?\b[^.]{0,50}(dies|leaves the battlefield|put into a graveyard)/i],
  ["Attacks/blocks trigger", /when(ever)?\b[^.]{0,50}(attacks|blocks|deals combat damage)/i],
  ["Upkeep/phase trigger", /at the beginning of/i],
  ["Cast/spell trigger", /when(ever)? (you|a player|an opponent) cast/i],
  ["Activated ability", /(\{[^}]+\}|^[a-z ,'-]{1,40})\s*:\s/im],
  ["Static anthem/buff", /(creatures? you control|other creatures)[^.]{0,30}(get|gets|have|has)/i],
  ["Enters-as/replacement", /\bas (this|it) enters|\benters (the battlefield )?(tapped|with|as)/i],
  ["Static (aura/equip)", /\b(enchant|equipped creature|enchanted|as long as)\b/i],
  ["Spell effect (other)", /\b(draw|destroy|exile|return|counter|deals?|gains?|create|search|each|target)\b/i],
];

/** The dominant unmodeled mechanism on a card's oracle text (for roadmap bucketing). */
export function mechanismBucket(oracle) {
  const t = stripReminder(oracle);
  for (const [name, re] of BUCKETS) if (re.test(t)) return name;
  return "Other / unclassified";
}

/**
 * Summarise coverage over a list of enriched cards.
 * Input: [{ type, oracle, mana, name, qty }]. Returns counts by tier (weighted by
 * qty), the native percentage, and the gap bucketed by mechanism.
 */
export function coverageSummary(cards) {
  const tiers = {};
  const gap = {};
  let total = 0;
  let native = 0;
  for (const card of cards) {
    const qty = card.qty || 1;
    total += qty;
    const tier = classifyCard(card);
    tiers[tier] = (tiers[tier] || 0) + qty;
    if (isNativeTier(tier)) {
      native += qty;
    } else {
      const b = mechanismBucket(card.oracle || "");
      gap[b] = (gap[b] || 0) + qty;
    }
  }
  return { total, native, pct: total ? Math.round((native / total) * 100) : 0, tiers, gap };
}
