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
 *   - every activated ability's effect:    parseEffectClause(a.effectClause, "Instant")
 * Plus programConfidence(...) on each, since the high/low gate is what routing keys on.
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

// Per-card fingerprint over the WHOLE recognition surface (spell + triggers + activated).
function fingerprint(card) {
  const type = card.type || "";
  const oracle = card.oracle || "";
  const fp = { spell: parsed(oracle, type) };
  try {
    fp.triggers = (detectTriggers(card) || []).map((d) => parsed(d.effectClause, "Instant"));
  } catch (e) { fp.triggers = { err: String(e && e.message || e) }; }
  try {
    fp.activated = (parseActivatedAbilities(card) || []).map((a) => parsed(a.effectClause, "Instant"));
  } catch (e) { fp.activated = { err: String(e && e.message || e) }; }
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
