/**
 * effects/atoms/tokenCopy.js — WAVE 5b TOKEN-COPY clause parser (CR 707.1 — "create a token that's a
 * copy of …").
 *
 * A PURE clause-parser export (`tokenCopyParser`) wired into the additive parser seam
 * (parser.js: registerClauseParser, at the file bottom — done by the integrator). Per the leaf-DAG
 * discipline this module MUST NOT import effects/parser.js (that back-edge would TDZ-crash
 * CLAUSE_PARSERS at load); it exports a pure `(clause) => Atom | null` the integrator registers.
 *
 * RECOGNIZED FORMS (EXACT anchors only — never a permissive "copy of anything" matcher; an unmodeled
 * rider or scope leaves the program LOW → non-native, a CREED-safe false-negative):
 *
 *   "create a token that's a copy of this creature"
 *       → copySource:"self"  (Scute Swarm's 6+ branch; the ability source = ctx.sourceId).
 *   "create a token that's a copy of it"
 *       → copySource:"triggering" (Miirym — "it" = the triggering nontoken Dragon; ctx.triggeringPermanentId).
 *
 * Each form tolerates exactly the CLEAN copiable-value / combat-state riders, ALL anchored after the
 * source phrase and reduced to nothing else:
 *   - ", except the token isn't legendary"  — a NO-OP (the legend rule is unenforced); recognized so
 *     Miirym matches, but carries no atom field.
 *   - " that enters tapped" / "; it enters tapped" forms are NOT in scope here (Miirym/Scute don't use
 *     them); the entersTapped/entersAttacking atom fields exist for the resolver but no in-deck clause
 *     reaches them yet, so the parser stays narrow (any tapped/attacking rider currently → null → low).
 *
 * FORBIDDEN (→ null → low → Arbiter, never a partial/silent flip):
 *   - A TYPE-ADDITION rider ("…except it's a 4/4 Hero", "…except it's an artifact in addition", Vehicle):
 *     adding a subtype feeds the live subtype-ETB/attacks/dies trigger scopes — a forbidden false positive,
 *     so the WHOLE card routes non-native (the anchor below admits ONLY the isn't-legendary rider).
 *   - A TARGET source ("…a copy of target attacking creature", Thousand-Faced Shadow) — a chosen target
 *     plus enters-tapped-and-attacking plus ninjutsu is too many unmodeled parts; left to the Arbiter.
 *   - "another <Subtype>", a filtered/counted copy, or any trailing residue.
 *
 * The copySource atom carries NO targetType, so programNeedsChosenTarget stays false and the program
 * routes natively on the trigger flush (the SELF / TRIGGERING referent is resolved at resolution from
 * ctx, never first-legal-target picked).
 */

// Anchored: "create a token that's a copy of {this creature | it}" + an OPTIONAL ", except the token
// isn't legendary" tail and nothing else. Apostrophes normalized to straight by the caller. "that's"
// is the contraction-stripped form; the full "that is a copy" is also accepted.
const TOKEN_COPY_RE = /^create a token that(?:'s| is) a copy of (this creature|it)(?:, except the token isn't legendary)?$/;

export function tokenCopyParser(clause) {
  const t = String(clause).toLowerCase().replace(/[’]/g, "'").trim();
  const m = t.match(TOKEN_COPY_RE);
  if (!m) return null;
  const copySource = m[1] === "this creature" ? "self" : "triggering";
  return { op: "create-token-copy", copySource, count: 1, targetType: null };
}
