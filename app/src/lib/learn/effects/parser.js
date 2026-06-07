/**
 * effects/parser.js — oracle text → EffectProgram (Phase-2 P2.2 keystone, P2.5
 * multi-atom generalization).
 *
 * An `EffectProgram` is the serializable, ordered representation of an
 * instant/sorcery's instructions: `{ version, source, confidence, structure,
 * atoms, modal, xSpell, unparsedTail }`. Resolution runs the atoms in order
 * (`effects/runProgram.js`) under the reserved `effect-program` resolver key.
 *
 * THE FAIL-SAFE (CLAUDE.md §1.2/§8): the parser is "incomplete but never wrong".
 *  - P2.2 rated a program `high` only for a single clean clause matching one
 *    modeled pattern.
 *  - P2.5 makes it a real MULTI-ATOM parser: it SPLITS the oracle into clauses
 *    (on ". " / ";" / top-level " and ") and re-parses EACH clause to an atom.
 *    A program is `high` ONLY when EVERY clause parses to a known, resolvable
 *    atom — the ALLOWLIST discipline (every split clause fully accounted for),
 *    not a denylist of bad markers. ANY unparseable clause → `low`, ZERO atoms →
 *    the Arbiter seam. So "Deal 2 damage to target creature. Draw a card." lights
 *    up as a 2-atom program, while "... and you gain 3 life" stays low until the
 *    gain-life atom exists (P2.7) — incremental by construction, never wrong.
 *
 * Confidence is ALL-OR-NOTHING and a pure function of the program shape
 * (`programConfidence`): high runs every atom, low runs none.
 *
 * Leaf-ish: imports only the proven legacy clause parser + the atom table. Does
 * NOT import gameState, resolvers, or the runner — so it can't introduce a cycle.
 */

import { parseSpellEffect, parseCreatureTargetRestrictions } from "../spellEffects.js";
import { ATOM_RESOLVERS } from "./effectAtoms.js";

/**
 * The atom ops the interpreter can resolve natively — DERIVED from the resolver
 * table so the HIGH-confidence gate and the resolver set can never drift apart.
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

/** Strip reminder text in parens + collapse whitespace. */
function stripReminder(text) {
  return String(text || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
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

function makeProgram({ confidence, structure = "sequence", atoms = [], modal = null, xSpell = false, unparsedTail = null }) {
  return { version: 1, source: "parser", confidence, structure, atoms, modal, xSpell, unparsedTail: unparsedTail ?? null };
}

/**
 * Markers that mean a clause carries semantics we do NOT model — a rider, an
 * unmodeled restriction, a variable amount, a conditional, a different actor.
 * A clause containing one drops to low → the Arbiter seam, so the interpreter is
 * never confidently wrong about something it didn't model. (NOTE: "and" is NOT
 * here — P2.5 SPLITS on it instead of denying it; each split clause is then
 * checked on its own merits.)
 */
const UNMODELED_MARKERS = /\b(unless|instead|rather than|where|for each|equal to|divided|as long as|if|then|may|choose (?:one|two|three)|another|other target|up to|each of|beginning of|next turn|non(?:black|blue|white|red|green|land|artifact|creature)|attacking|blocking|tapped|untapped|without|wither|infect|with (?:flying|reach|trample|lifelink|deathtouch|vigilance|menace|haste|first strike|double strike|hexproof|indestructible|protection|ward|shadow|power|toughness|mana value)|that (?:player|creature|deals|has|was|spell)|you don't control|an opponent controls|you control|your opponents control|its (?:owner|controller))\b/i;

/**
 * Is a SINGLE clause (already split on sentence / `;` / top-level " and ") fully
 * accounted for — no comma-joined second instruction the loose pattern parse
 * would silently drop, and no unmodeled marker? Conservative (a false "not clean"
 * is safe → Arbiter). Reminder text is stripped first.
 */
function isCleanClause(text) {
  const s = stripReminder(text);
  if (s.includes(",")) return false;
  if (UNMODELED_MARKERS.test(s)) return false;
  return true;
}

/**
 * Split an oracle into clauses on sentence boundaries (". "), semicolons, and
 * top-level " and ". Each modeled atom shape ("deals N damage to …", "destroy
 * target creature …", "draw N cards", "target creature gets +X/+Y until end of
 * turn") contains no internal " and ", so splitting on it never severs a modeled
 * clause — but it DOES separate a rider ("… and you gain 3 life") into its own
 * clause, which then either parses to a known atom or forces the whole program low.
 */
function splitClauses(oracle) {
  const clauses = [];
  for (let sentence of stripReminder(oracle).split(/(?:\.\s+|;\s*)/)) {
    sentence = sentence.replace(/\.\s*$/, "").trim();
    if (!sentence) continue;
    for (const c of sentence.split(/\s+\band\b\s+/i)) {
      const t = c.trim();
      if (t) clauses.push(t);
    }
  }
  return clauses;
}

/**
 * Parse ONE clause into an atom (+ its target restrictions), or null when the
 * clause carries anything we don't model. The creature-target ALLOWLIST
 * (`parseCreatureTargetRestrictions`) models controller/tapped/power; any other
 * qualifier leaves a residue → null. Non-creature atoms must pass `isCleanClause`.
 */
function parseClauseToAtom(cardType, clause) {
  const s = stripReminder(clause);
  if (!s) return null;
  const sub = { type: cardType, oracle: s };
  const atom = legacyToAtom(parseSpellEffect(sub));
  if (!atom || !KNOWN.has(atom.op)) return null;

  // The legacy draw regex matches "draw" anywhere — but the draw atom means the
  // CONTROLLER draws. A clause where a different subject draws ("Two target players
  // each draw a card", "that player draws") must NOT parse as a controller-draw. So
  // the draw clause must START with "draw" / "you draw" (CR 121 — "you" is the
  // controller). Otherwise the actor is unmodeled → Arbiter.
  if (atom.op === "draw" && !/^(?:you )?draw\b/i.test(s)) return null;

  if ((atom.op === "deal-damage" || atom.op === "destroy") && atom.targetType === "creature") {
    const { restrictions, clean, cleanedOracle } = parseCreatureTargetRestrictions(sub);
    if (!(clean && isCleanClause(cleanedOracle))) return null;
    return restrictions.length ? { ...atom, restrictions } : atom;
  }
  if (!isCleanClause(s)) return null;
  return atom;
}

/**
 * Modal prefix — "Choose one —". P2.5 supports EXACTLY-ONE modal ("Choose one")
 * only; "choose two", "choose up to one", "one or both" stay low (the player picks
 * multiple modes — a combinatorial cast expansion deferred to the Arbiter for now).
 */
const MODAL_RE = /^choose one\s*[—–-]\s*/i;

/**
 * Parse a "Choose one —" modal into `{ chooseCount, upTo, modes:[{label, atoms}] }`,
 * or null if not modal, or `{ modes: null }` if a mode is unmodeled (→ low). Modes
 * are split on bullet "•" or "; or " / " or ". Each mode is itself a (usually
 * single) clause sequence parsed via `parseClauseToAtom`, so a mode can be
 * multi-clause too.
 */
function parseModal(cardType, oracle) {
  const stripped = stripReminder(oracle);
  const m = stripped.match(MODAL_RE);
  if (!m) return null;
  const rest = stripped.slice(m[0].length).trim();
  const rawModes = rest.includes("•")
    ? rest.split("•")
    : rest.split(/\s*;\s*or\s+|\s+\bor\b\s+/i);
  const parts = rawModes.map(p => p.replace(/^[•\s]+/, "").replace(/\.\s*$/, "").trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const modes = [];
  for (const part of parts) {
    const clauses = splitClauses(part);
    const atoms = [];
    let ok = clauses.length > 0;
    for (const clause of clauses) {
      const atom = parseClauseToAtom(cardType, clause);
      if (!atom) { ok = false; break; }
      atoms.push(atom);
    }
    if (!ok) return { chooseCount: 1, upTo: false, modes: null }; // an unmodeled mode → low
    modes.push({ label: part, atoms });
  }
  return { chooseCount: 1, upTo: false, modes };
}

/**
 * Parse a card into an EffectProgram, or null.
 *
 * Returns null ONLY when the card is NOT an instant/sorcery with oracle text
 * (a permanent enters via the ETB path; a card with no oracle has nothing to
 * parse). An instant/sorcery WITH text always returns a program: `high` when
 * EVERY clause (or, for modal, every mode) parses to a known atom, `low` (zero
 * atoms → Arbiter seam) otherwise. NEVER null for a non-permanent spell, NEVER a
 * fabricated effect.
 */
export function parseEffectProgram(card) {
  if (!isInstantOrSorcery(card) || !oracleOf(card)) return null;

  const oracle = oracleOf(card);
  const cardType = typeOf(card);

  // Modal "Choose one —": each mode is its own sub-program. HIGH iff every mode
  // parses fully (all-or-nothing across modes).
  const modal = parseModal(cardType, oracle);
  if (modal) {
    if (modal.modes && modal.modes.every(mode => mode.atoms.every(a => KNOWN.has(a.op)))) {
      return makeProgram({ confidence: "high", structure: "modal", atoms: [], modal, unparsedTail: null });
    }
    return makeProgram({ confidence: "low", structure: "modal", atoms: [], modal: null, unparsedTail: oracle });
  }

  // Bulleted text that ISN'T a "Choose one —" modal (e.g. "Tiered (Choose one
  // additional cost.) • … • …", level-up, saga chapters) means MODE/TIER choices,
  // NOT a sequence. The clause splitter would otherwise treat each bullet as a
  // sequential clause and, say, deal every tier's damage at once. Route to Arbiter.
  if (stripReminder(oracle).includes("•")) {
    return makeProgram({ confidence: "low", atoms: [], unparsedTail: oracle });
  }

  // Multi-clause sequence: split, then parse EACH clause. All-or-nothing.
  const clauses = splitClauses(oracle);
  const atoms = [];
  let allParsed = clauses.length > 0;
  for (const clause of clauses) {
    const atom = parseClauseToAtom(cardType, clause);
    if (!atom) { allParsed = false; break; }
    atoms.push(atom);
  }
  if (allParsed && atoms.length > 0 && atoms.every(a => KNOWN.has(a.op))) {
    return makeProgram({ confidence: "high", atoms, unparsedTail: null });
  }

  // Any clause unmodeled → low confidence, ZERO atoms. Resolution hands the whole
  // spell to the Arbiter (never a partial execution, never a fabricated effect).
  return makeProgram({ confidence: "low", atoms: [], unparsedTail: oracle });
}

/**
 * The authoritative confidence gate — a PURE function of the program shape.
 * High iff the program has at least one atom AND every atom is a known,
 * resolvable op. Low otherwise (including an empty/absent program). Widening
 * "high" must be a deliberate, reviewed change — the `parser.test.js` corpus pins
 * every "must drop to low" oracle as a merge gate.
 */
export function programConfidence(program) {
  if (!program) return "low";
  if (program.structure === "modal") {
    const modes = program.modal?.modes;
    if (!Array.isArray(modes) || modes.length < 2) return "low";
    return modes.every(mode => Array.isArray(mode.atoms) && mode.atoms.length > 0 && mode.atoms.every(a => KNOWN.has(a.op)))
      ? "high" : "low";
  }
  if (!Array.isArray(program.atoms) || program.atoms.length === 0) return "low";
  return program.atoms.every(a => KNOWN.has(a.op)) ? "high" : "low";
}
