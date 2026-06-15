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

import { parseEffectProgram, programConfidence } from "./effects/parser.js";

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
  const clauses = t.split(/[,;\n]|\band\b/).map((c) => c.trim()).filter(Boolean);
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
  // Permanent (creature / artifact / enchantment / battle): the body always works.
  if (isKeywordOnly(oracle)) return "native-body";
  if (hasManaAbility(oracle)) return "native-mana";
  return "body-only";
}

export const NATIVE_TIERS = new Set(["land", "native-mana", "native-body", "native-spell"]);
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
