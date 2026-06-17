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
 *     arbiter-pw    — a planeswalker (loyalty system not modelled)
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

import { parseEffectProgram, parseEffectClause, programConfidence, programContainsCounter, programContainsChosenPermanentRemoval } from "./effects/parser.js";
import { detectTriggers } from "./triggers.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { staticAbilitiesCoverCard, clauseProducesStatic, isLevelGatedOracle, parseEquipmentBonus, equipmentAbilityClauses, isAuraCard, isNativeAura } from "./staticAbilityParser.js";
import { isCloneCard } from "./cloneCopy.js";

// Evergreen / common keywords the layer + combat engine already handles. A
// permanent whose only text is these plays natively (the body fights, the layer
// engine applies the keyword).
export const COVERED_KEYWORDS = [
  "flying", "reach", "first strike", "double strike", "trample", "deathtouch",
  "lifelink", "vigilance", "menace", "haste", "defender", "flash", "hexproof",
  "shroud", "indestructible", "ward", "protection", "prowess", "skulk",
  "intimidate", "fear", "horsemanship", "changeling", "devoid",
];

const stripReminder = (s) => String(s || "").replace(/\([^)]*\)/g, " ");

/** True when a permanent's oracle text is empty (vanilla) or only evergreen keywords. */
export function isKeywordOnly(oracle) {
  const t = stripReminder(oracle).toLowerCase().replace(/[’']/g, "'");
  if (!t.trim()) return true; // vanilla
  // Split on SENTENCE boundaries (. ! ?) too — not just , ; \n and. Otherwise a trailing non-keyword
  // sentence glued on by a strip ("flying  scry 1.") is swallowed whole by `startsWith("flying ")`
  // and mis-credited as keyword-only. Splitting on the period forces "scry 1" to stand alone and fail.
  const clauses = t.split(/[,;.!?\n]|\band\b/).map((c) => c.trim()).filter(Boolean);
  return clauses.every((c) =>
    COVERED_KEYWORDS.some((k) => c === k || c === `${k}.` || c.startsWith(`${k} `)),
  );
}

/**
 * True when a permanent's tap produces mana — the mana system taps rocks/dorks
 * generically, so its primary role plays even if a secondary ability doesn't.
 */
export function hasManaAbility(oracle) {
  return /\badd \{[wubrgcx]/i.test(oracle) ||
    /\badd (one|two|three|four|five|that much|an amount|\{)/i.test(oracle);
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
  // Mirror buildTriggerStack EXACTLY: a counter atom (Mystic Snake) AND a chosen-target non-creature
  // permanent removal ("destroy target artifact") are NOT routed through the trigger flush — the
  // first-legal auto-target could hit the controller's OWN spell/permanent — so a creature with one
  // stays in the gap, not native.
  return !!p && programConfidence(p) === "high" && p.structure !== "modal"
    && !programContainsCounter(p) && !programContainsChosenPermanentRemoval(p);
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
  return isKeywordOnly(residue);
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
export function permanentActivatedCovered(card) {
  const abilities = parseActivatedAbilities(card);
  if (abilities.length === 0) return false;
  // A single unmodeled ability (unmodeled cost OR effect, incl. complex mana abilities)
  // leaves the card in the gap — all-or-nothing, mirroring the all-or-nothing runtime.
  if (!abilities.every((a) => a.modeled)) return false;
  // Drop reminder, then every activated-ability-shaped line (a colon with a `{…}` cost to
  // its left — the same shape parseActivatedAbilities detects). The remainder (keywords,
  // and any trigger/static text) must be keyword-only/empty.
  const residue = stripReminder(card.oracle || "")
    .split(/\n+/)
    .filter((line) => {
      const ci = line.indexOf(":");
      return !(ci !== -1 && line.slice(0, ci).includes("{")); // keep non-ability lines
    })
    .join("\n");
  return isKeywordOnly(residue);
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

  // Residue: drop trigger sentences (anchored, the detectTriggers grammar) + activated-
  // ability lines (a colon with a `{…}` cost), then every remaining clause must be a
  // modeled static or keyword-only — no unmodeled trigger/static/other text survives.
  const afterTriggers = oracle.replace(/(?:^|[\n.;]\s*)(When|Whenever|At)\b[^.]+\./gi, "\n");
  const afterActivated = stripReminder(afterTriggers)
    .split(/\n+/)
    .filter((line) => {
      const ci = line.indexOf(":");
      return !(ci !== -1 && line.slice(0, ci).includes("{"));
    })
    .join("\n");
  for (const clause of afterActivated.split(/[\n.;]+/).map((s) => s.trim()).filter(Boolean)) {
    if (clauseProducesStatic(clause)) continue;  // a modeled static clause
    if (isKeywordOnly(clause)) continue;          // keyword-only / vanilla
    return false;                                 // unmodeled residue
  }
  return true;
}

/**
 * True when an Equipment's ENTIRE non-keyword text is the attach mechanic the engine now
 * plays: a modeled "Equip {cost}" ability + a cleanly-modeled "Equipped creature gets +X/+Y
 * / has [keyword]" bonus. ALL-OR-NOTHING (mirrors the runtime): every activated ability must
 * be a modeled Equip; the bonus must parse cleanly (a rider drops parseEquipmentBonus to []);
 * and nothing else may be left after the Equip + equipped-creature lines (no extra trigger/
 * activated text). A complex equipment (a triggered ability, a non-Equip activated ability,
 * an unmodeled bonus rider) stays body-only.
 */
export function permanentEquipmentCovered(card) {
  if (!/\bequipment\b/i.test(String(card?.type || ""))) return false;
  const abilities = parseActivatedAbilities(card);
  if (abilities.length === 0 || !abilities.every((a) => a.isEquipAbility && a.modeled)) return false;
  // The bonus parser is all-or-nothing over every equipped-creature clause: a non-empty result
  // guarantees EVERY clause touching the creature parsed cleanly (no rider silently dropped).
  if (parseEquipmentBonus(card).length === 0) return false;
  // Clause-granular residue (split on . ; \n — same as the bonus parser, so a period-joined
  // rider can't be swallowed by a whole-line strip). Every clause must be a modeled Equip
  // line or an equipped-creature clause (already validated clean above). ANYTHING else — a
  // self-keyword printed on the EQUIPMENT ("Indestructible"), an unmodeled equip variant
  // ("Equip Human {1}"), a non-Equip activated ability — leaves residue → body-only, so a
  // not-fully-modeled equipment is never over-claimed as native (CLAUDE.md "no silent gaps").
  const modeledEquipLine = /^equip\s*(?:[—–-])?\s*(?:\{[^}]+\})+$/i;
  for (const clause of equipmentAbilityClauses(stripReminder(card.oracle || ""))) {
    const c = clause.toLowerCase().trim();
    if (!c) continue;
    if (modeledEquipLine.test(c)) continue;
    if (/\bequipped creature\b/.test(c) || /^it\b/.test(c) || /^that creature\b/.test(c)) continue;
    return false; // residue the engine doesn't model → body-only
  }
  return true;
}

/**
 * Classify one card into a coverage tier. Input: { type, oracle, mana, name }
 * (the `publicCard` shape — type is the type line, oracle the full oracle text).
 */
export function classifyCard(card) {
  const type = String(card?.type || "").toLowerCase();
  const oracle = card?.oracle || "";
  if (/\bland\b/.test(type)) return "land";
  if (/\bplaneswalker\b/.test(type)) return "arbiter-pw";
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
  if (isKeywordOnly(oracle)) return "native-body";
  if (hasManaAbility(oracle)) return "native-mana";
  // Single-mechanism tiers first (the informative labels), then the composite catch-all for
  // multi-ability creatures whose pieces are each modeled but span types.
  if (permanentTriggersCovered(card)) return "native-trigger";   // P2.8: body + only-routing triggers
  if (permanentActivatedCovered(card)) return "native-activated"; // P2.9: body + only-modeled activated abilities
  if (staticAbilitiesCoverCard(card, isKeywordOnly)) return "native-static"; // P2.10: body + only-modeled static anthems
  if (permanentEquipmentCovered(card)) return "native-equipment"; // attach: Equip + a clean equipped-creature bonus
  if (permanentFullyCovered(card)) return "native-mixed";        // composite: modeled trigger + activated + static together
  return "body-only";
}

export const NATIVE_TIERS = new Set(["land", "native-mana", "native-body", "native-spell", "native-trigger", "native-activated", "native-static", "native-equipment", "native-aura", "native-clone", "native-mixed"]);
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
