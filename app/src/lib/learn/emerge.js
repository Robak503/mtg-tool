/**
 * emerge.js — EMERGE (CR 702.97) as a modeled ALTERNATIVE cast cost.
 *
 * "Emerge {cost} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by
 * that creature's mana value.)" lets the caster cast an Eldrazi by sacrificing a creature and paying the
 * emerge cost MINUS the sacrificed creature's mana value (CR 702.97a). A variant "Emerge from artifact
 * {cost}" sacrifices an ARTIFACT instead (CR 702.97c). The spell still goes on the stack as a normal cast,
 * so its OWN abilities — a "When you cast this spell, <effect>" self-cast trigger (CR 601.2i) and any ETB —
 * fire EXACTLY as they would on a hard-cast. Emerge changes ONLY how/what you pay, never the permanent's
 * printed text. This is the SAME shape the engine already models for Plot / Warp / Bestow: an alternative
 * cast cost whose body resolves identically.
 *
 * SCOPE (this slice — whole-card per THE CREED):
 *   an Eldrazi/creature whose body (the Emerge keyword LINE stripped) is ALREADY a native tier under the
 *   existing machinery — a keyword-only body (Flying / Trample / haste …) OR a body whose ONLY non-keyword
 *   text is a modeled self-cast / ETB trigger that classifyCard credits (Wretched Gryff = Flying + "When you
 *   cast this spell, draw a card"; It of the Horrid Swarm = "…create two 1/1 green Insect tokens"). The
 *   Emerge classifier (coverage.js) strips the keyword line and re-classifies the bare body, crediting the
 *   card the SAME tier its body earns — so the metric credits EXACTLY what the runtime plays.
 *
 * RUNTIME (the alt-cast path):
 *   1. legalChoices.castActionsFromZone emits the NORMAL hard-cast (full printed cost) AND — for each legal
 *      sacrifice victim (a creature, or an artifact for "Emerge from artifact") — an EMERGE cast whose `cost`
 *      is the emerge cost with its GENERIC portion reduced by that victim's mana value (floored at {0}; the
 *      colored pips are never reduced, matching the engine's cost-reduction floor) and which carries
 *      `sacCreatureId` (the victim) + `emerge:true`.
 *   2. actionDispatcher.applyCastSpell pays the (reduced) mana — EXCLUDING the victim from the mana sources
 *      so a sacrificed mana dork can't ALSO tap to pay (the γ1 double-spend guard) — then sacrifices the
 *      victim via sacrificePermanentForCost (battlefield→graveyard + its dies/sacrifice watchers), then puts
 *      the spell on the stack. The self-cast / ETB trigger fires through the normal checkCastTriggers /
 *      PERMANENT_ETB path — no resolver change needed.
 *
 * EXPLICITLY DEFERRED (the BODY gate handles these — they stay body-only → Arbiter, never a fabricated credit):
 *   - Any Emerge card whose BODY is unmodeled once the keyword line is stripped (Elder Deep-Fiend's "tap up to
 *     four target permanents"; Adipose Offspring's conditional token-X-by-toughness; Distended Mindbender's
 *     two-card targeted discard; Crabomination's exile-and-cast). parseEmergeCard returns null for them
 *     because the stripped body does NOT classify native.
 *   - An emerge cost the cost parser can't represent cleanly (an {X} emerge — none in the real corpus).
 *   - Herigast's "Each creature spell you cast has emerge" GRANT is a separate static (its own body carries it
 *     as residue, so it stays body-only) — this slice models only a card's OWN printed Emerge keyword.
 *
 * Leaf module: no engine import. The coverage classifier and the runtime legalChoices path BOTH call these
 * pure functions, so the metric credits EXACTLY the cards the engine plays (no duplicated determination).
 */

const stripReminder = (s) => String(s || "").replace(/\([^)]*\)/g, " ");

// A clean Emerge cost line: "Emerge [from <type>] {cost}" at the start of a line, the cost one-or-more mana
// pips, and nothing but reminder text after. The optional "from <word>" captures the artifact variant
// ("Emerge from artifact"). Anchored to line start so a mid-text "emerge" mention can never match. The
// reminder is stripped before matching, so the trailing "(You may cast …)" is gone.
const EMERGE_LINE_RE = /^emerge(?:\s+from\s+(\w+))?\s+((?:\{[^}]+\})+)\s*$/im;

/**
 * The parsed Emerge cost of a card, or null. Returns `{ pips, sacType }` where `pips` is the RAW pip string
 * ("{5}{U}") and `sacType` is the lowercase permanent type to sacrifice ("creature" by default, or "artifact"
 * for "Emerge from artifact"). null for: no emerge line, or an {X}/{Y}/{Z} emerge pip (a magnitude the cost
 * path can't bound — defer). CONSERVATIVE: a miss is a safe false-negative (the card hard-casts only).
 */
export function parseEmergeCost(card) {
  const oracle = stripReminder(card?.oracle || card?.oracle_text || "");
  const m = EMERGE_LINE_RE.exec(oracle);
  if (!m) return null;
  const sacType = (m[1] || "creature").toLowerCase();
  const pips = m[2];
  // An {X}/{Y}/{Z} emerge cost is a magnitude the reduced-cost enumeration can't bound → defer (CREED).
  if (/\{[XYZ]\}/i.test(pips)) return null;
  return { pips, sacType };
}

/**
 * Remove the "Emerge [from <type>] {cost} (reminder…)" LINE from an oracle, leaving the bare base body.
 * Used by the coverage gate (so the stripped body re-classifies on its own merits) and reusable by any
 * caller that needs the non-emerge body. Conservative: only strips a line that matches the clean Emerge
 * cost shape (reminder parens and all), so a card without a clean emerge line is returned unchanged.
 */
export function stripEmergeLine(oracle) {
  return String(oracle || "")
    .replace(/(?:^|\n)[^\n]*\bemerge(?:\s+from\s+\w+)?\s+(?:\{[^}]+\})+[^\n]*(?=\n|$)/i, "\n")
    .trim();
}

/**
 * EMERGE whole-card gate. Returns `{ pips, sacType, bodyTier }` when the card (a) is a CREATURE with (b) a
 * clean Emerge cost AND (c) a body — the Emerge keyword line stripped — that the injected `classifyStripped`
 * predicate classifies into a NATIVE tier. Otherwise null.
 *
 * `classifyStripped` is `(strippedCard) => tier` (classifyCard, injected to keep emerge.js a leaf). The card
 * passed to it is a shallow copy with the Emerge line removed from its oracle, so it re-runs the FULL native
 * cascade (keyword-only → trigger → activated → static → composite) on the bare body — the card earns its
 * body's tier, no fabricated credit. `isNative` is `(tier) => boolean` (isNativeTier), also injected.
 *
 * All-or-nothing (THE CREED): an unmodeled body clause keeps the stripped body body-only → null → the card
 * stays body-only (Arbiter for the unmodeled part; the engine can still hard-cast it). The SINGLE source of
 * truth for both the coverage credit and the runtime (legalChoices reads the same parseEmergeCost).
 */
export function parseEmergeCard(card, classifyStripped, isNative) {
  const type = String(card?.type || card?.type_line || "").toLowerCase();
  if (!/\bcreature\b/.test(type)) return null;          // Emerge cards are all creatures (CR 702.97a)
  const emerge = parseEmergeCost(card);
  if (!emerge) return null;
  if (typeof classifyStripped !== "function" || typeof isNative !== "function") return null;
  const stripped = { ...card, oracle: stripEmergeLine(card?.oracle || card?.oracle_text || "") };
  const bodyTier = classifyStripped(stripped);
  if (!isNative(bodyTier)) return null;                 // the bare body must itself be native (whole-card)
  return { pips: emerge.pips, sacType: emerge.sacType, bodyTier };
}
