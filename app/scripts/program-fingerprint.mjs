/**
 * program-fingerprint.mjs — the SEAM acceptance gate (R1).
 *
 * Dumps, for every real card, a canonical fingerprint of the FULL parser output the
 * RUNTIME executes — not the classifyCard tier. The tier diff is necessary but NOT
 * sufficient: classifyCard collapses a rich program to a coarse boolean-driven label
 * (programConfidence === "high"), so a clause that rebinds from one HIGH op to a
 * DIFFERENT high op (e.g. fight -> deal-damage) keeps its tier identical while the
 * runtime resolves a different effect — the CREED-forbidden false-positive, invisible
 * to a tier-only flip-diff. This tool diffs the artifact the engine actually runs.
 *
 * The fingerprint covers the ENTIRE recognition surface the parser.js matcher-registry
 * seam touches (parseExtendedAtom -> parseClauseToAtom), mirroring how coverage.js
 * consumes the parser per card:
 *   - the whole-card / spell parse:        parseEffectClause(oracle, type)
 *   - every detected trigger's effect:     parseEffectClause(d.effectClause, "Instant")
 *   - every activated ability:             a.program and a.modeled, as parseActivatedAbilities built them
 *   - every loyalty ability:               l.program and l.modeled, as parseLoyaltyAbilities built them
 * Plus programConfidence(...) on each, since the high/low gate is what routing keys on.
 *
 * WHY THE ABILITIES' OWN PROGRAMS (2026-11-03 — the pw22 review): an activated ability's runtime program is not a re-parse of its
 * effect clause as "Instant" text. parseActivatedAbilities parses the clause with the card's own name read as "this" source
 * (normalizeSelfName) and the cost's X, so a re-parse of the raw clause can read LOW on both sides while the program the runtime
 * offers moves — Simic Slaw's "{2}, Sacrifice: Draw X cards and gain X life, where X is the number of charge counters on Simic Slaw." went from unmodeled to
 * modeled with an identical re-parse line. A loyalty ability's program is parsed with its own options (parseLoyaltyAbilities). The
 * whole object the runtime reads is fingerprinted instead, `modeled` included (the gate the offer keys on).
 *
 * Canonicalization sorts object keys recursively, so a key-ORDER change never shows as
 * a false diff while any value/op/targetType/restriction/amount/duration change does.
 *
 * USAGE (headless, orchestrator-invoked — never an agent's throwaway):
 *   MTG_APP_ROOT=<main-tree>/app node scripts/program-fingerprint.mjs > candidate.tsv
 * then run the same on a baseline worktree at the pre-change master SHA and `diff`.
 * Pure builtins + local imports (no node_modules); the corpus loads via MTG_APP_ROOT.
 *
 * ACCEPTANCE for the seam refactor (STEP 2): the diff is EMPTY (byte-identical program
 * for all 34,160 cards). A non-empty diff = a recognition behavior change = NOT a pure
 * refactor; investigate every line before the seam can land.
 */
import { publicCard, allCards } from "../src/lib/server/cardIndex.js";
import { parseEffectClause, programConfidence } from "../src/lib/learn/effects/parser.js";
import { detectTriggers } from "../src/lib/learn/triggers.js";
import { parseActivatedAbilities } from "../src/lib/learn/effects/abilities.js";
import { parseLoyaltyAbilities } from "../src/lib/learn/effects/loyaltyAbilities.js";

// Same real-card filter measure-coverage.mjs uses (tokens/emblems/etc. are not real cards).
function isRealCard(c) {
  const t = c.type || "";
  if (!t) return false;
  return !/\b(Token|Emblem|Scheme|Plane|Phenomenon|Vanguard|Dungeon|Conspiracy|Sticker|Attraction|Card)\b/.test(t);
}

// Deterministic, key-sorted serialization so key-order churn never reads as a behavior change.
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
}

// The parser output + its confidence gate, canonicalized. Confidence is included because
// a high<->low flip changes routing even when the atom list looks similar.
function parsed(clause, type) {
  let prog;
  try { prog = parseEffectClause(String(clause || ""), type || ""); } catch (e) { return { err: String(e && e.message || e) }; }
  return { conf: programConfidence(prog), prog };
}

// An ability's own program (the one the runtime runs) + its confidence and offer gate.
function own(program, modeled) {
  return { conf: programConfidence(program), prog: program ?? null, modeled: !!modeled };
}

// Per-card fingerprint over the WHOLE recognition surface (spell + triggers + activated + loyalty).
function fingerprint(card) {
  const type = card.type || "";
  const oracle = card.oracle || "";
  const fp = { spell: parsed(oracle, type) };
  try {
    fp.triggers = (detectTriggers(card) || []).map((d) => parsed(d.effectClause, "Instant"));
  } catch (e) { fp.triggers = { err: String(e && e.message || e) }; }
  try {
    fp.activated = (parseActivatedAbilities(card) || []).map((a) => own(a.program, a.modeled));
  } catch (e) { fp.activated = { err: String(e && e.message || e) }; }
  try {
    fp.loyalty = (parseLoyaltyAbilities(card) || []).map((l) => own(l.program, l.modeled));
  } catch (e) { fp.loyalty = { err: String(e && e.message || e) }; }
  return canonical(fp);
}

const out = [];
for (const raw of allCards()) {
  let c;
  try { c = publicCard(raw); } catch { continue; }
  if (!isRealCard(c)) continue;
  out.push(`${c.name}\t${fingerprint(c)}`);
}
out.sort();
process.stdout.write(out.join("\n") + "\n");
