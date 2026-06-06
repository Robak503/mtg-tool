/**
 * effects/parser.js — oracle text → EffectProgram (Phase-2 P2.2 keystone).
 *
 * An `EffectProgram` is the serializable, ordered representation of an
 * instant/sorcery's instructions: `{ version, source, confidence, structure,
 * atoms, unparsedTail }`. Resolution runs the atoms in order (`effects/runProgram.js`)
 * under the reserved `effect-program` resolver key — additive, never overloading
 * `spell.effect`.
 *
 * THE FAIL-SAFE (CLAUDE.md §1.2/§8): the parser is "incomplete but never wrong".
 * It rates a program `high` ONLY for the exact patterns the proven legacy parser
 * (`spellEffects.parseSpellEffect`) recognizes — built ON it, so there is no
 * second parser to drift. Anything else (an instant/sorcery with text we can't
 * model) returns a `low`-confidence program with ZERO atoms, which routes to the
 * Arbiter seam at resolution. A `high` program NEVER contains an unmodeled atom.
 *
 * Confidence is ALL-OR-NOTHING and a pure function of the program shape
 * (`programConfidence`): high runs every atom, low runs none.
 *
 * Leaf-ish: imports only the proven legacy parser. Does NOT import gameState,
 * resolvers, or the runner — so it can't introduce a cycle.
 */

import { parseSpellEffect } from "../spellEffects.js";
import { ATOM_RESOLVERS } from "./effectAtoms.js";

/**
 * The atom ops the interpreter can resolve natively — DERIVED from the resolver
 * table so the HIGH-confidence gate and the resolver set can never drift apart.
 * (If an op is "known" but has no resolver, programConfidence could rate HIGH a
 * program runEffectProgram can't fully run — a partial-execution hole. Deriving
 * makes the all-or-nothing invariant structural, not a hand-maintained coincidence.)
 * parser → effectAtoms → spellEffects is a safe leaf edge (no cycle).
 */
export const KNOWN_ATOM_OPS = Object.freeze(Object.keys(ATOM_RESOLVERS));
const KNOWN = new Set(KNOWN_ATOM_OPS);

function typeOf(card) {
  return String(card?.type || card?.type_line || "");
}
function isInstantOrSorcery(card) {
  return /Instant|Sorcery/.test(typeOf(card));
}
function oracleOf(card) {
  return String(card?.oracle || card?.oracle_text || "");
}

/** Map a legacy effect descriptor to a single EffectProgram atom (or null). */
function legacyToAtom(effect) {
  if (!effect) return null;
  if (effect.kind === "damage") return { op: "deal-damage", amount: effect.amount, targetType: effect.targetType };
  if (effect.kind === "destroy") return { op: "destroy", targetType: effect.targetType || "creature" };
  if (effect.kind === "draw") return { op: "draw", amount: effect.amount, targetType: null };
  if (effect.kind === "pump") return { op: "pump", ptDelta: effect.ptDelta, targetType: effect.targetType || "creature", duration: effect.duration || "endOfTurn" };
  return null;
}

function makeProgram({ confidence, atoms, unparsedTail }) {
  return { version: 1, source: "parser", confidence, structure: "sequence", atoms, unparsedTail: unparsedTail ?? null };
}

/**
 * Markers that mean the legacy single-pattern parse would SILENTLY IGNORE real
 * semantics (a rider, a restriction, a second clause, a modal, a variable amount,
 * a different actor). The legacy regexes are deliberately loose — e.g. "destroy
 * target [^.]+ creature" happily matches "destroy target creature UNLESS its
 * controller pays {2}" and would resolve a plain destroy, which is WRONG. Anything
 * carrying one of these drops to low confidence → the Arbiter seam, so the
 * interpreter is never confidently wrong about something it didn't model. A
 * false-low (routing a clean spell to the judge) is safe; a false-high is forbidden.
 */
const UNMODELED_MARKERS = /\b(unless|instead|rather than|where|for each|equal to|divided|as long as|if|then|may|choose (?:one|two|three)|non(?:black|blue|white|red|green|land|artifact|creature)|attacking|blocking|tapped|untapped|with (?:flying|reach|trample|lifelink|deathtouch|vigilance|menace|haste|first strike|double strike|hexproof|indestructible|protection|ward|power|toughness|mana value)|that (?:player|creature|deals|has|was|spell)|you don't control|an opponent controls|you control|its (?:owner|controller))\b/i;

/**
 * Is the oracle a single clean clause that exactly matches one known pattern with
 * no unmodeled rider/restriction/second-clause? Reminder text in parens is
 * stripped first. Conservative by construction (a false "not clean" is safe).
 */
function isCleanSingleClause(oracle) {
  const stripped = oracle.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  // More than one sentence/clause → not a single clean clause (multi-clause is P2.5).
  if (/\.\s+\S/.test(stripped) || stripped.includes(";")) return false;
  // A coordinating conjunction or a comma joins a SECOND instruction the loose
  // single-pattern parse would silently drop or mis-target — e.g. "deals 3 damage
  // to any target AND you gain 3 life" (Lightning Helix), "...and 2 damage to you"
  // (Char), "draw two cards, discard a card", "destroy target creature and target
  // land". None of the three modeled clean patterns (burn to a target, destroy a
  // creature, draw N) ever legitimately contains a standalone "and" or a comma, so
  // this drops every conjunction-rider to low → the Arbiter resolves the whole spell.
  if (/\band\b/i.test(stripped) || stripped.includes(",")) return false;
  if (UNMODELED_MARKERS.test(stripped)) return false;
  return true;
}

/**
 * Parse a card into an EffectProgram, or null.
 *
 * Returns null ONLY when the card is NOT an instant/sorcery with oracle text
 * (i.e. a permanent — which enters via the ETB path — or a card with no oracle).
 * An instant/sorcery WITH text always returns a program: `high` when the legacy
 * parser recognizes it, `low` (zero atoms → Arbiter seam) when it doesn't. It is
 * NEVER null for a non-permanent spell, and NEVER fabricates an effect.
 */
export function parseEffectProgram(card) {
  if (!isInstantOrSorcery(card) || !oracleOf(card)) return null;

  const oracle = oracleOf(card);
  const atom = legacyToAtom(parseSpellEffect(card));
  // HIGH only for a known atom AND a clean single clause — so a loose legacy match
  // on a rider/restricted/multi-clause oracle never resolves the wrong thing.
  if (atom && KNOWN.has(atom.op) && isCleanSingleClause(oracle)) {
    return makeProgram({ confidence: "high", atoms: [atom], unparsedTail: null });
  }
  // An instant/sorcery WITH text we can't confidently model → low confidence,
  // ZERO atoms. Resolution hands it to the Arbiter (never a fabricated effect).
  return makeProgram({ confidence: "low", atoms: [], unparsedTail: oracle });
}

/**
 * The authoritative confidence gate — a PURE function of the program shape.
 * High iff the program has at least one atom AND every atom is a known,
 * resolvable op. Low otherwise (including an empty/absent program). Widening
 * "high" must be a deliberate, reviewed change — the `parserCorpus` test pins
 * every "must drop to low" oracle as a merge gate.
 */
export function programConfidence(program) {
  if (!program || !Array.isArray(program.atoms) || program.atoms.length === 0) return "low";
  return program.atoms.every(a => KNOWN.has(a.op)) ? "high" : "low";
}
