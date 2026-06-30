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
// TOKEN-COPY-TARGET — "create a token that's a copy of target creature you control" (Quasiduplicate,
// Cackling Counterpart, Self-Reflection, Multiversal Recruitment). The resolver ALREADY supports
// copySource:"target" (resolveCopySource → ctx.targets[0]); only the recognition was missing. The optional
// ", except it isn't legendary" tail is a NO-OP (the legend rule is unenforced — no atom field). A
// type-addition / stat-change "except" ("4/4 Hero") is NOT matched → low → Arbiter (it would change the
// copy's characteristics — a subtype feeds the live subtype-ETB/attacks/dies scopes). targetType "creature"
// + the you-control restriction so the cast path / enumerateTargets offers ONLY the controller's own
// creatures (never an opponent's, which would be illegal).
const TOKEN_COPY_TARGET_RE = /^create a token that(?:'s| is) a copy of target creature you control(?:, except it isn't legendary)?$/;
// TOKEN-COPY-TARGET-KEYWORD — the same target-copy with a MODELED-KEYWORD grant rider on the COPY
// (Irenicus's Vile Duplication: "…except the token has flying and it isn't legendary."). CR 707.9a — the
// copy GAINS the granted keyword(s); the resolver threads them through snapshotCopiedCard's addKeyword rider
// (writes card.keywords, which layers' printedKeywords seeds from), EXACTLY like a clone's "it has flying"
// rider, so the minted token genuinely flies at runtime. Anchored to "the token has <kw>[ and it isn't
// legendary]" — the "the token" subject (Irenicus) is DISTINCT from the bare "it has <kw>" form (which stays
// null → Arbiter: that form pairs with stat/type riders we don't model), keeping the existing CREED pin
// intact. Every granted keyword must be in GRANTABLE_KEYWORDS (the layer-enforceable set the clone rider also
// restricts to) — an unmodeled keyword fails the gate → null → low → Arbiter (whole-card CREED, no partial).
const TOKEN_COPY_TARGET_KEYWORD_RE = /^create a token that(?:'s| is) a copy of target creature you control, except the token has ([a-z' ]+?)(?:,? and it isn't legendary)?$/;
// TOKEN-COPY-EACH — "for each token you control, create a token that's a copy of that permanent" (Second
// Harvest, CR 707.1). DISTINCT from every single-source form above: this copies EACH of the controller's
// TOKEN permanents once (a per-source for-each), so it carries NO copySource referent (the resolver iterates
// the controller's token battlefield) and NO targetType (no chosen target — programNeedsChosenTarget stays
// false, the program routes natively on the spell-resolution path). The resolver (applyCreateTokenCopyEach)
// snapshots the source-token list up front (CR 608.2 — the copies are created simultaneously, not re-copied)
// and copies each via the SAME printed snapshot (snapshotCopiedCard, CR 707.2 — no counters/auras). Anchored
// to the EXACT whole clause (an extra rider would change the copy → it would fail the anchor → null → low →
// Arbiter, CREED whole-card). "that permanent" is the per-iteration token referent (resolved by the resolver,
// never first-legal-target picked).
const TOKEN_COPY_EACH_RE = /^for each token you control, create a token that(?:'s| is) a copy of that permanent$/;
// Layer-enforceable, layer-GRANTABLE combat keywords (mirrors cloneCopy.js RIDER_KEYWORDS exactly — granting
// one to a copy behaves like a printed instance). Kept as a local literal so this leaf imports nothing new.
const GRANTABLE_KEYWORDS = new Set([
  "flying", "reach", "first strike", "double strike", "trample", "deathtouch",
  "lifelink", "vigilance", "menace", "haste",
]);

export function tokenCopyParser(clause) {
  const t = String(clause).toLowerCase().replace(/[’]/g, "'").trim();
  const m = t.match(TOKEN_COPY_RE);
  if (m) {
    const copySource = m[1] === "this creature" ? "self" : "triggering";
    return { op: "create-token-copy", copySource, count: 1, targetType: null };
  }
  if (TOKEN_COPY_TARGET_RE.test(t)) {
    return { op: "create-token-copy", copySource: "target", count: 1, targetType: "creature", restrictions: [{ kind: "controller", who: "you" }] };
  }
  // TOKEN-COPY-EACH (Second Harvest) — copy EACH token you control. No copySource / targetType (the resolver
  // iterates the controller's token battlefield, snapshotting up front). A separate op so it routes to its own
  // per-source resolver, NOT the single-source applyCreateTokenCopy.
  if (TOKEN_COPY_EACH_RE.test(t)) {
    return { op: "create-token-copy-each", targetType: null };
  }
  const km = t.match(TOKEN_COPY_TARGET_KEYWORD_RE);
  if (km) {
    // Split the granted-keyword list on " and " ("flying and vigilance"); every keyword must be modeled +
    // grantable, else the whole card is unmodeled → null → low → Arbiter (CREED whole-card, never a partial
    // copy that silently drops a keyword). The trailing ", and it isn't legendary" no-op is already consumed.
    const kws = km[1].split(/\s+and\s+/).map((k) => k.trim()).filter(Boolean);
    if (kws.length && kws.every((k) => GRANTABLE_KEYWORDS.has(k))) {
      return { op: "create-token-copy", copySource: "target", count: 1, targetType: "creature", grantKeywords: kws, restrictions: [{ kind: "controller", who: "you" }] };
    }
  }
  return null;
}
