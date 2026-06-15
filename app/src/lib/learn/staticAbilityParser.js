/**
 * staticAbilityParser.js — bounded oracle → static continuous-effect interpreter
 * (Phase-7 PR-9). Recognizes a small, SAFE, high-confidence grammar of static
 * P/T-boost and keyword-grant abilities (anthems + tribal lords — the owner
 * plays Slivers) and emits partial `ContinuousEffect` descriptors (sans
 * id/timestamp/source — `layers.staticEffectsOf` fills those).
 *
 * Anti-fabrication discipline (CLAUDE.md §1.2), mirroring keywords.js:
 *   - Match only at ABILITY-LINE positions (clause starts), so reminder text and
 *     conditional / "can't be blocked by creatures with flying" clauses never
 *     false-match.
 *   - A miss yields NO effect (the creature just doesn't get the buff) — never a
 *     fabricated one. False negatives are safe; false positives are forbidden.
 *   - Granted keywords are validated against a known set; unknown words are
 *     ignored, never granted.
 *
 * CR grounding: static abilities create continuous effects (CR 604.2, 611.3);
 * P/T boosts apply in layer 7c (CR 613.4c); granted keywords in layer 6
 * (CR 613.1f). Phase-2 grows THIS grammar; the layer engine itself is general.
 *
 * Pure; imports only the keyword vocabulary. Returns plain JSON descriptors.
 */

import { COMBAT_KEYWORDS } from "./keywords.js";

// Keywords we will GRANT via a static ability. Restricted to the combat-relevant
// evergreen set the engine actually models, so a parsed grant always maps to real
// engine behavior (no granting a keyword nothing reads).
const GRANTABLE_KEYWORDS = new Set(COMBAT_KEYWORDS.map(k => k.toLowerCase()));

// Color words → WUBRG letters (for "white creatures you control get +1/+1").
const COLOR_WORDS = { white: "W", blue: "U", black: "B", red: "R", green: "G" };

/**
 * Split oracle text into ability clauses, anchored on sentence / line / clause
 * boundaries (period, semicolon, newline). Each clause is matched independently
 * at its start, so a buff pattern can't match mid-sentence.
 */
function abilityClauses(oracle) {
  return String(oracle)
    .split(/[\n.;]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/** Parse a signed integer like "+1" / "-1" / "+2". */
function signed(str) {
  return parseInt(str, 10) || 0;
}

/**
 * Normalize a captured plural subtype word into its canonical proper-noun form
 * ("slivers" → "Sliver"). Creature subtypes are proper nouns; matching is
 * case-insensitive downstream, but the canonical case keeps descriptors readable
 * for the explain panel.
 */
function normalizeSubtype(word) {
  let w = word.trim();
  if (w.endsWith("s")) w = w.slice(0, -1);
  return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w;
}

/**
 * Try every supported pattern against one clause; push any descriptor(s) found
 * into `out`. The patterns are intentionally narrow and ordered most-specific
 * first so a tribal/color anthem doesn't also match the generic anthem.
 */
function parseClause(clause, out) {
  const c = clause.toLowerCase();

  // ── STATIC-ONLY GUARD (CLAUDE.md §1.2: a miss is safe; a false grant is forbidden) ──
  // A continuous effect is created only by a STATIC ability. Bail on any marker of a
  // triggered / activated / one-shot / variable / conditional ability so we never
  // fabricate a PERMANENT board buff the oracle doesn't grant statically. Examples
  // this rejects (each verified to formerly false-match): "Whenever ~ attacks, other
  // creatures you control get +1/+1 until end of turn." (triggered), "{G}: Creatures
  // you control get +1/+1 until end of turn." (activated), "Other Sliver creatures
  // get +1/+1 for each other Sliver" (variable — can't quantify), "...get +2/+2 as
  // long as you control a Forest." (conditional — can't evaluate).
  if (
    /^(?:when|whenever|at)\b/.test(c) ||      // triggered ability (leading keyword)
    /\bwhenever\b/.test(c) ||                 // embedded trigger (comma-joined clause)
    c.includes(":") ||                        // activated ability ("cost: effect")
    /\buntil end of turn\b/.test(c) ||        // one-shot duration, not static
    /\bthis turn\b/.test(c) ||                // one-shot duration, not static
    /\bfor each\b/.test(c) ||                 // variable magnitude we can't quantify
    /\bas long as\b/.test(c)                  // conditional we can't evaluate
  ) {
    return;
  }

  // ── P/T anthems / lords (layer 7c, 613.4c) ──────────────────────────────────
  // "get +X/+Y" with explicit signs is the anthem/lord signature.
  const ptMatch = c.match(/\bgets?\s+([+-]\d+)\/([+-]\d+)\b/);
  if (ptMatch) {
    const power = signed(ptMatch[1]);
    const toughness = signed(ptMatch[2]);
    const affects = parseCreatureSelector(c);
    if (affects) {
      out.push({
        layer: 7,
        sublayer: "7c",
        op: { layerOp: "ptModify", power, toughness },
        affects,
        duration: { kind: "permanent" },
      });
      // P2.10: do NOT return — a clause can grant a buff AND a keyword in one breath
      // ("creatures you control get +1/+1 and have vigilance"). Fall through so the
      // keyword-grant pass below also fires (it no-ops when there's no "have <kw>").
    }
  }

  // ── Keyword grants (layer 6, 613.1f) ────────────────────────────────────────
  // "<selector> have <keyword>[ and <keyword>...]"
  const haveMatch = c.match(/\b(?:have|has)\s+(.+)$/);
  if (haveMatch) {
    const affects = parseCreatureSelector(c);
    if (affects) {
      const kws = extractKeywords(haveMatch[1]);
      for (const kw of kws) {
        out.push({
          layer: 6,
          op: { layerOp: "addKeyword", keyword: kw },
          affects,
          duration: { kind: "permanent" },
        });
      }
    }
  }
}

/**
 * Pull granted keyword names out of a "have <...>" tail, validated against the
 * grantable set. "flying and vigilance" → ["Flying","Vigilance"]; unknown words
 * are dropped (never fabricated). Returns canonical-cased keyword names.
 */
function extractKeywords(tail) {
  const found = [];
  // Split on commas / "and" so "flying, first strike, and trample" parses.
  for (const raw of tail.split(/,|\band\b/)) {
    const word = raw.trim().replace(/[^a-z ]/g, "").trim();
    if (!word) continue;
    if (GRANTABLE_KEYWORDS.has(word)) {
      found.push(canonicalKeyword(word));
    }
  }
  return found;
}

function canonicalKeyword(lower) {
  return COMBAT_KEYWORDS.find(k => k.toLowerCase() === lower) || lower;
}

/**
 * Build the AffectSpec selector for a creature-buff clause, or null if the clause
 * isn't a recognized "<creatures> [you control]" target. Always restricts to
 * Creatures (cardTypes:["Creature"]) so a non-creature is never buffed by a
 * creature anthem, and recognizes:
 *   - "(all|other|each) <Subtype>s [creatures] you control" → tribal lord
 *   - "<color> creatures you control"                       → color anthem
 *   - "creatures you control"                               → generic anthem
 *   - "all/other <Subtype>s" (no "you control")             → symmetric tribal
 * "other" sets excludeSelf (the lord doesn't pump itself); "you control" scopes
 * to the source's controller, otherwise the effect is symmetric ("each").
 */
function parseCreatureSelector(c) {
  const youControl = /\byou control\b/.test(c);
  const controllerScope = youControl ? "you" : "each";

  // Every pattern is ANCHORED to the clause start (^): the buffed set must be the
  // SUBJECT of the clause. This is what stops a comma-joined effect body (e.g. the
  // tail of a trigger after the static guard) from matching as an anthem.

  // Tribal / determiner anthem: "(all|other|each) <word> [creatures] [you control] get…"
  let m = c.match(/^(all|other|each)\s+([a-z]+)\s+(?:creatures?\s+)?(?:you control\s+)?(?:gets?|gains?|has|have)\b/);
  if (m) {
    const determiner = m[1];
    const word = m[2];
    if (word !== "creature" && word !== "creatures") {
      // Tribal lord: "(all|other|each) <Subtype>s [creatures] [you control] …".
      return {
        mode: "dynamic",
        selector: {
          controllerScope,
          cardTypes: ["Creature"],
          subtypes: [normalizeSubtype(word)],
          excludeSelf: determiner === "other",
        },
      };
    }
    // P2.10: determiner + bare "creatures": "(all|other|each) creatures [you control] …".
    // The generic regex below only matches a LITERAL "creatures you control" start, so the
    // common LORD anthem "Other creatures you control get +1/+1" and "Each creature you
    // control gets …" would otherwise fall through unmatched. "other" excludes the source
    // (a lord doesn't pump itself); all/each include it.
    return {
      mode: "dynamic",
      selector: { controllerScope, cardTypes: ["Creature"], excludeSelf: determiner === "other" },
    };
  }

  // Color anthem: "<color> creatures you control"
  m = c.match(/^(white|blue|black|red|green)\s+creatures?\s+you control\b/);
  if (m) {
    return {
      mode: "dynamic",
      selector: {
        controllerScope: "you",
        cardTypes: ["Creature"],
        colors: [COLOR_WORDS[m[1]]],
      },
    };
  }

  // Generic anthem: "creatures you control [get|have]"
  if (/^creatures?\s+you control\s+(?:gets?|gains?|has|have)\b/.test(c)) {
    return {
      mode: "dynamic",
      selector: { controllerScope: "you", cardTypes: ["Creature"] },
    };
  }

  // P2.10 symmetric anthem: bare "creatures get|gain|have …" (no "you control") buffs EVERY
  // controller's creatures (a global static, e.g. "Creatures get +1/+1"). Anchored so
  // "creatures you control get …" (caught above) and "creatures with flying get …" (a
  // qualified subset we don't model) never reach here.
  if (/^creatures?\s+(?:gets?|gains?|has|have)\b/.test(c)) {
    return {
      mode: "dynamic",
      selector: { controllerScope: "each", cardTypes: ["Creature"] },
    };
  }

  return null;
}

/**
 * LEVEL-GATED card guard (CLAUDE.md §1.2). On a leveler ("Level up {cost}" + "LEVEL
 * N-M" bands) or a Class ("{cost}: Level N"), a buff line like "Creatures you control
 * get +1/+1" is only active at the right LEVEL — but it sits on its own (colon-less)
 * line, so per-clause parsing can't tell which band it belongs to and would fabricate
 * an always-on anthem. We can't model levels, so we parse NO static abilities from
 * these cards (→ Arbiter/body-only). Conservative: a miss is safe, a false grant isn't.
 */
function isLevelGated(oracle) {
  return /\blevel up\b/i.test(oracle) ||      // Rise-of-Eldrazi levelers
    /\bLEVEL \d+(?:-\d+|\+)?\b/.test(oracle) || // their "LEVEL 1-3" band headers
    /:\s*Level \d/i.test(oracle);              // Class "{cost}: Level N"
}

/**
 * Parse a permanent's oracle into static continuous-effect descriptors (partial:
 * no id/timestamp/source). Bounded — recognizes the anthem/lord grammar above;
 * everything else yields []. Pure.
 */
export function parseStaticAbilities(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  if (!oracle || isLevelGated(oracle)) return [];
  const out = [];
  for (const clause of abilityClauses(oracle)) {
    parseClause(clause, out);
  }
  return out;
}

/**
 * True when EVERY ability clause of the card is a modeled static effect or keyword-only
 * text — i.e. the static parser covers the WHOLE (non-body) card, so a pure anthem
 * ("Glorious Anthem") or a vanilla-body lord ("Benalish Marshal") plays fully natively
 * (body + layer anthem). The coverage metric (`coverage.permanentStaticCovered`) calls
 * this. `isKeywordOnlyClause` is INJECTED (coverage owns the keyword vocabulary) so this
 * module stays a leaf — no coverage→static→coverage import cycle.
 *
 * Conservative: a leveler (parseStaticAbilities already returns []) or ANY unmodeled
 * clause (a trigger/activated/conditional next to the anthem) → false. Mirrors the
 * runtime exactly (the same parseClause the layer engine consumes).
 */
export function staticAbilitiesCoverCard(card, isKeywordOnlyClause) {
  if (parseStaticAbilities(card).length === 0) return false; // none, or leveler-gated
  for (const clause of abilityClauses(String(card?.oracle || card?.oracle_text || ""))) {
    const produced = [];
    parseClause(clause, produced);
    if (produced.length > 0) continue;          // a modeled static clause
    if (isKeywordOnlyClause(clause)) continue;   // keyword-only / vanilla line
    return false;                                // unmodeled residue (trigger/activated/…)
  }
  return true;
}

/**
 * Granular helpers for the COMPOSITE coverage classifier (coverage.permanentFullyCovered),
 * which subtracts trigger + activated clauses itself before checking the static residue —
 * so it needs the per-clause static test + the leveler guard, not the whole-card wrapper.
 */
export function clauseProducesStatic(clause) {
  const out = [];
  parseClause(String(clause || ""), out);
  return out.length > 0;
}
export function isLevelGatedOracle(oracle) {
  return isLevelGated(String(oracle || ""));
}
