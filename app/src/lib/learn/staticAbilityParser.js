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

import { GRANTABLE_STATIC_KEYWORDS, canonicalCombatKeyword } from "./keywords.js";

// The grantable-keyword set + canonical-caser live in keywords.js as the SINGLE source of truth,
// so a granted keyword can never be one the engine doesn't enforce. The STATIC path (this module:
// anthems/lords + attached Equipment/Auras) uses the static superset — the combat keywords PLUS
// indestructible (now enforced by the destroy effect + lethal SBA). The combat-trick grant path
// (effects/parser.js) keeps the combat-only set, so the two can't drift. Menace is excluded from
// both (unenforced).
const GRANTABLE_KEYWORDS = GRANTABLE_STATIC_KEYWORDS;

// Permanent-type subject words → the cardTypes the layer selector filters on. "permanents" → no
// type filter (any permanent). Used by the indestructible-grant branch below; layers.matchesSelector
// applies cardTypes generally, so this is NOT creature-restricted like the anthem path.
const PERMANENT_TYPE_CARD_TYPES = {
  artifact: ["Artifact"], artifacts: ["Artifact"],
  enchantment: ["Enchantment"], enchantments: ["Enchantment"],
  land: ["Land"], lands: ["Land"],
  permanent: [], permanents: [],
};

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

// ─── TRUNK-SELFBUFF: count-scaled self static buff ──────────────────────────────
// A continuous (layer-7c) self-buff whose magnitude is a board count — "this creature gets +X/+Y for each
// <countsource>" (Nim Lasher, Benalish Honor Guard…). The layer engine re-evaluates the count each P/T
// computation. The count phrase is parsed to a SERIALIZABLE spec here; layers.js evaluates it (cycle-safe:
// parser.js's richer parseCountSource isn't importable — parser.js imports THIS module).
const SELF_COUNT_CARDTYPE = { creature: "Creature", creatures: "Creature", artifact: "Artifact", artifacts: "Artifact", land: "Land", lands: "Land", enchantment: "Enchantment", enchantments: "Enchantment" };
const SELF_COUNT_BASIC = { plains: "Plains", island: "Island", islands: "Island", swamp: "Swamp", swamps: "Swamp", mountain: "Mountain", mountains: "Mountain", forest: "Forest", forests: "Forest" };

/**
 * Parse the count phrase of a self "for each <X>" into a `{ kind:"permanentsYouControl", cardType|subtype }`
 * spec, or null. DELIBERATELY NARROW + allowlist-free: only "<card type> you control" and "<basic land>
 * you control" — the dup-free, unambiguous sources. A subtype ("Goblin"), "other", graveyard, hand, or any
 * opponent/qualified count → null → the clause produces NO descriptor → the card stays LOW (Arbiter, never a
 * fabricated buff). CREED: a miss is safe; a wrong count across 100s of cards is forbidden.
 */
function parseSelfCountSource(phrase) {
  const p = phrase.toLowerCase().trim().replace(/\.\s*$/, "");
  let m;
  if ((m = p.match(/^(creatures?|artifacts?|lands?|enchantments?) you control$/))) return { kind: "permanentsYouControl", cardType: SELF_COUNT_CARDTYPE[m[1]] };
  if ((m = p.match(/^(plains|islands?|swamps?|mountains?|forests?) you control$/))) return { kind: "permanentsYouControl", subtype: SELF_COUNT_BASIC[m[1]] };
  return null;
}

/**
 * Replace the card's OWN name with "this creature" so a name-based self-reference ("Nim Lasher gets +1/+0
 * …", common on older cards) reads the same as modern "This creature gets …" templating. Word-bounded on
 * the FULL name only (never a partial), so it can't touch an unrelated card's name in the text.
 */
function selfNormalizeOracle(oracle, name) {
  if (!name) return String(oracle || "");
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(oracle || "").replace(new RegExp(`\\b${esc}\\b`, "g"), "this creature");
}

/**
 * Try every supported pattern against one clause; push any descriptor(s) found
 * into `out`. The patterns are intentionally narrow and ordered most-specific
 * first so a tribal/color anthem doesn't also match the generic anthem.
 */
function parseClause(clause, out) {
  const c = clause.toLowerCase();

  // ── TRUNK-SELFBUFF: a STATIC self-buff scaled by a board count (layer 7c dynamic) ──
  // "This creature gets +X/+Y for each <countsource>" (Nim Lasher, Benalish Honor Guard…). A CONTINUOUS
  // effect, so it's exempt from the `for each` guard below — but ONLY this exact self-referential static
  // shape, with a MODELED count source. Tight: whole-clause anchored, self subject, no trigger/activated/
  // one-shot prefix, and parseSelfCountSource must recognize the source (else NO descriptor → the card
  // stays LOW → Arbiter, never a fabricated buff). The card name was normalized to "this creature" upstream.
  if (!/^(?:when|whenever|at)\b/.test(c) && !/\bwhenever\b/.test(c) && !c.includes(":") && !/\b(?:until end of turn|this turn)\b/.test(c)) {
    const feM = c.match(/^(?:this creature|it) gets ([+-]\d+)\/([+-]\d+) for each (.+)$/);
    if (feM) {
      const countSpec = parseSelfCountSource(feM[3]);
      if (countSpec) {
        out.push({
          layer: 7,
          sublayer: "7c",
          op: { layerOp: "ptModifyDynamicCount", countSpec, perPower: signed(feM[1]), perToughness: signed(feM[2]) },
          affects: { mode: "self" },
          duration: { kind: "permanent" },
        });
      }
      return; // a self-for-each clause — handled (or intentionally dropped to LOW on an unmodeled source)
    }
  }

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

  // ── Non-creature indestructible grant (layer 6, 613.1f) ─────────────────────
  // "<Artifacts|Enchantments|Lands|Permanents> [you control] are/have indestructible" —
  // the linking-verb ("are/is indestructible") + permanent-type templating the creature
  // selector below can't express. Grants indestructible (the one modeled non-combat keyword)
  // to the matching permanents; the layer engine's selector applies the cardTypes filter, so a
  // grant-to-self ("Artifacts you control are indestructible" → Darksteel Forge protects itself)
  // and a broad "permanents you control" (Avacyn) both resolve correctly. ALL-OR-NOTHING: the
  // tail must reduce EXACTLY to "indestructible" (a combined "indestructible and hexproof" we
  // can't fully model drops out → Arbiter, never a silent partial grant). Creature "<creatures>
  // … have <kw>" grants stay on the anthem path below (it also handles combat-keyword combos).
  // The symmetric "<type>s are indestructible" (no "you control") → controllerScope "each" is
  // intentional and corpus-validated: the only real card it hits is Terra Eternal ("All lands
  // have indestructible"), for which an all-players grant IS correct.
  const grantM = c.match(/^(all|other|each)?\s*(artifacts?|enchantments?|lands?|permanents?)\s+(?:you control\s+)?(?:are|is|have|has)\s+(.+)$/);
  if (grantM) {
    const tail = grantM[3].replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
    if (tail === "indestructible") {
      out.push({
        layer: 6,
        op: { layerOp: "addKeyword", keyword: "indestructible" },
        affects: {
          mode: "dynamic",
          selector: {
            controllerScope: /\byou control\b/.test(c) ? "you" : "each",
            cardTypes: PERMANENT_TYPE_CARD_TYPES[grantM[2]],
            excludeSelf: grantM[1] === "other",
          },
        },
        duration: { kind: "permanent" },
      });
      return; // a non-creature type subject never also carries a creature anthem
    }
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

const canonicalKeyword = canonicalCombatKeyword;

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
  const rawOracle = String(card?.oracle || card?.oracle_text || "");
  if (!rawOracle || isLevelGated(rawOracle)) return [];
  const oracle = selfNormalizeOracle(rawOracle, card?.name); // TRUNK-SELFBUFF: name-based self-ref → "this creature"
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
  const oracle = selfNormalizeOracle(String(card?.oracle || card?.oracle_text || ""), card?.name); // match the runtime's name-normalized parse
  for (const clause of abilityClauses(oracle)) {
    const produced = [];
    parseClause(clause, produced);
    if (produced.length > 0) continue;          // a modeled static clause
    if (isKeywordOnlyClause(clause)) continue;   // keyword-only / vanilla line
    return false;                                // unmodeled residue (trigger/activated/…)
  }
  return true;
}

/**
 * Parse one "<subject> creature gets +X/+Y [and has KW…]" / "<subject> creature has KW…"
 * clause (subject = "equipped" for Equipment, "enchanted" for an Aura) into layer
 * descriptors, or null if the clause carries ANYTHING we don't model. ALL-OR-NOTHING (the
 * clause must reduce EXACTLY to a +N/+N P/T mod and/or grantable keywords) so a rider
 * ("can't be blocked", "is a 4/4") is never silently dropped.
 */
function parseAttachedClause(c, subject) {
  let rest = c.replace(new RegExp(`^${subject} creature\\s+`), "").trim();
  const out = [];
  const ptMatch = rest.match(/^gets?\s+([+-]\d+)\/([+-]\d+)\b/);
  if (ptMatch) {
    out.push({ layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: signed(ptMatch[1]), toughness: signed(ptMatch[2]) }, duration: { kind: "permanent" } });
    rest = rest.slice(ptMatch[0].length).trim().replace(/^and\s+/, "").trim(); // "+1/+1 and has flying"
  }
  if (rest) {
    const haveMatch = rest.match(/^(?:has|have)\s+(.+)$/);
    if (!haveMatch) return null;                       // residue that isn't a keyword grant
    const words = haveMatch[1].split(/,|\band\b/).map(w => w.trim().replace(/[^a-z ]/g, "").trim()).filter(Boolean);
    if (words.length === 0) return null;
    for (const w of words) {
      if (!GRANTABLE_KEYWORDS.has(w)) return null;     // an unmodeled keyword/rider → whole bonus drops
      out.push({ layer: 6, op: { layerOp: "addKeyword", keyword: canonicalKeyword(w) }, duration: { kind: "permanent" } });
    }
  }
  return out.length ? out : null;
}

/**
 * A clause that touches the ATTACHED CREATURE — the granted abilities are templated as
 * "Equipped/Enchanted creature …" or, in condensed text, a leading pronoun ("It can't be
 * blocked.") or a conditional ("As long as enchanted creature is …, it …"). The
 * equipment/aura's OWN body (a self-keyword, the "Equip {cost}" line) is NOT about the
 * creature. Used to make the bonus ALL-OR-NOTHING over every creature clause.
 */
function touchesAttachedCreature(c, subject) {
  return c.includes(`${subject} creature`) || /^it\b/.test(c) || /^that creature\b/.test(c);
}

/**
 * The static bonus an Equipment ("equipped creature") or Aura ("enchanted creature") grants
 * the creature it's attached to — "gets +X/+Y" and/or "has [keyword]" — as partial
 * continuous-effect descriptors (no `affects`; `layers.staticEffectsOf` scopes them to the
 * attached creature ONLY when `attachedTo` is set). ALL-OR-NOTHING per the "no silent gaps"
 * rule: if ANY clause that TOUCHES the attached creature isn't a clean "+X/+Y and/or
 * grantable keywords" grant — a separate-sentence rider, a conditional, a triggered ability —
 * the WHOLE bonus drops to [] (a clean false-negative → body-only, never a misleading partial
 * buff). The card's own body keywords / Equip line are ignored. `subject` defaults to the one
 * the card uses. Pure.
 */
export function parseAttachedBonus(card, subjectOverride) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  const subject = subjectOverride || (/enchanted creature/i.test(oracle) ? "enchanted" : "equipped");
  const out = [];
  let saw = false;
  for (const clause of abilityClauses(oracle)) {
    const c = clause.toLowerCase();
    if (!touchesAttachedCreature(c, subject)) continue;          // the card's own body — ignore
    const parsed = c.startsWith(`${subject} creature`) ? parseAttachedClause(c, subject) : null;
    if (!parsed) return [];                                       // a creature clause we can't fully model
    out.push(...parsed);
    saw = true;
  }
  return saw ? out : [];
}

/** Back-compat alias — the equipment bonus is the attached bonus with the "equipped" subject. */
export const parseEquipmentBonus = (card) => parseAttachedBonus(card, "equipped");
/** An Aura's "Enchanted creature gets/has …" bonus (same machinery, "enchanted" subject). */
export const parseAuraBonus = (card) => parseAttachedBonus(card, "enchanted");

/** Split oracle into ability clauses (period / semicolon / newline). Exported for coverage. */
export function equipmentAbilityClauses(oracle) {
  return abilityClauses(oracle);
}

/** True when the card's TYPE line marks it an Aura (CR 303.4). */
export function isAuraCard(card) {
  return /\bAura\b/.test(String(card?.type || card?.type_line || ""));
}

/**
 * The subject of an Aura's "Enchant <subject>" keyword ability (CR 702.5), lowercased —
 * "creature", "permanent", "creature you control", "land", "player", … — or null if the
 * card has no Enchant line. The modeled subset is EXACTLY "creature" (any creature, no
 * controller/zone restriction); everything else stays unmodeled.
 */
function auraEnchantSubject(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  for (const clause of abilityClauses(oracle)) {
    const m = clause.trim().match(/^enchant\s+(.+)$/i);
    if (m) return m[1].trim().toLowerCase();
  }
  return null;
}

/**
 * Clauses on an Aura that are NEITHER the "Enchant …" keyword line NOR a clause that
 * touches the enchanted creature (those are the modeled bonus). A non-empty residue means
 * the Aura carries something we DON'T model (a triggered ability, an activated ability, a
 * static effect on the controller) — so attaching it and applying only the P/T/keyword
 * bonus would SILENTLY drop that text. Used to keep `isNativeAura` all-or-nothing.
 */
function auraResidueClauses(card) {
  const oracle = String(card?.oracle || card?.oracle_text || "");
  const out = [];
  for (const clause of abilityClauses(oracle)) {
    const c = clause.toLowerCase().trim();
    if (/^enchant\b/.test(c)) continue;                       // the Enchant keyword line
    if (touchesAttachedCreature(c, "enchanted")) continue;    // a creature-bonus clause
    out.push(clause);
  }
  return out;
}

/**
 * Is this Aura one the engine can play END-TO-END natively? ALL of (no silent gaps):
 *   1. type line is an Aura,
 *   2. it enchants EXACTLY "creature" (no controller/zone restriction, not a non-creature),
 *   3. `parseAuraBonus` yields a non-empty all-or-nothing P/T + keyword bonus, AND
 *   4. there is NO residual clause (no triggered/activated/controller-static text we'd drop).
 * When any fails, the Aura is NOT native — the cast path routes it to the Arbiter seam
 * rather than entering a do-nothing permanent. Single source of truth for the runtime
 * (legalChoices/actionDispatcher) AND the coverage metric, so they can't drift. Pure.
 */
export function isNativeAura(card) {
  if (!isAuraCard(card)) return false;
  if (auraEnchantSubject(card) !== "creature") return false;
  if (!parseAuraBonus(card).length) return false;
  return auraResidueClauses(card).length === 0;
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
