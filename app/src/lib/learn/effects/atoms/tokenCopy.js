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
 *   - ", except the token isn't legendary"  — a REAL type-line modification (CR 707.9a) since sba.js
 *     implemented CR 704.5j: stamped as atom.notLegendary → tokens.js pushes the stripLegendary
 *     copy-rider, so Miirym's token copies of legendary Dragons survive the legend rule.
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
const TOKEN_COPY_RE = /^create a token that(?:'s| is) a copy of (this creature|it)(, except the token isn't legendary)?$/;
// TOKEN-COPY + ADD-CARD-TYPE rider (Vaultborn Tyrant — "create a token that's a copy of it, except it's an
// artifact in addition to its other types"; also Ochre Jelly's self form). CR 707.9a — the copy gains the
// named CARD TYPE (a supertype-position add, LEFT of the "—"), so the minted token genuinely IS that type
// for every type-line read (artifact-scoped batch combat, artifact-matters triggers) — a FAITHFUL whole-card
// model, NOT a dropped rider. DISTINCT from the creature-SUBtype add ("except it's a 4/4 Hero" — a P/T + a
// subtype we still defer). Anchored to the exact "it's an <cardtype> in addition to its other types" tail;
// the <cardtype> must be in ADDABLE_CARD_TYPES (a printed permanent card type the copy snapshot can carry
// cleanly). An OPTIONAL leading ", except the token isn't legendary" no-op is tolerated. The card type is
// prepended to the type line via snapshotCopiedCard's addCardType rider (cloneCopy.addCardTypeToLine).
const TOKEN_COPY_ADD_CARDTYPE_RE = /^create a token that(?:'s| is) a copy of (this creature|it)(?:, except the token isn't legendary)?, except it's an ([a-z]+) in addition to its other types$/;
// Card types the copy snapshot can add cleanly (a printed permanent card type — no zone/cast implications
// for a permanent already on the battlefield). "artifact"/"enchantment" are the corpus forms; a NON-permanent
// or supertype word falls through the allowlist → null → Arbiter (CREED — never a mis-typed copy).
const ADDABLE_CARD_TYPES = new Set(["artifact", "enchantment"]);
// TOKEN-COPY-TARGET — "create a token that's a copy of target creature you control" (Quasiduplicate,
// Cackling Counterpart, Self-Reflection, Multiversal Recruitment). The resolver ALREADY supports
// copySource:"target" (resolveCopySource → ctx.targets[0]); only the recognition was missing. The optional
// ", except it isn't legendary" tail is STAMPED (atom.notLegendary → the stripLegendary copy-rider —
// CR 704.5j is enforced now, so the strip is what keeps a copied legend's token alive). A
// type-addition / stat-change "except" ("4/4 Hero") is NOT matched → low → Arbiter (it would change the
// copy's characteristics — a subtype feeds the live subtype-ETB/attacks/dies scopes). targetType "creature"
// + the you-control restriction so the cast path / enumerateTargets offers ONLY the controller's own
// creatures (never an opponent's, which would be illegal).
// THE KIKI FAMILY (shelf D26 — Kiki-Jiki, Tempestra, Orthion, The Fire Crystal) widens the same anchor: "ANOTHER target"
// (the source can't copy itself — notSource), "target NONLEGENDARY creature" (a negated supertype restriction), ", except it
// has haste" (the copy's own haste, part of its copiable values, CR 707.9b — the same addKeyword rider as the "the token
// has" form), and the counted plural "create five tokens that are copies of …" (Orthion). Their "It gains haste." and
// "Sacrifice it at the beginning of the next end step." are the parser's minted-token folds, not this anchor's.
const TOKEN_COPY_TARGET_RE = /^create (?:a token that(?:'s| is) a copy|(two|three|four|five) tokens that are copies) of (another )?target (nonlegendary )?creature you control(?:, except it (isn't legendary|has haste))?$/;
const COPY_COUNT = { two: 2, three: 3, four: 4, five: 5 };
// FLASH PHOTOGRAPHY (POD-SIM THREE · KN-3, 2026-09-05): "Create a token that's a copy of target permanent." — any permanent, any
// controller. An Aura or a Saga is never a legal target here (an Aura token needs an attach choice the token path does not
// raise — CR 303.4f; a Saga token needs its lore counter — CR 714.2): a narrower target pool is a false negative, a token
// that enters wrong is an FP. The card's own "as though it had flash if it targets a permanent you control" line is
// stripped by the normalizer and NOT honored at runtime — sorcery-speed only (a false negative, documented).
const TOKEN_COPY_TARGET_PERMANENT_RE = /^create a token that(?:'s| is) a copy of target permanent$/;
// TOKEN-COPY-UPTOONE-MVX — "create a token that's a copy of up to one target creature with mana value X or
// less" (Here Comes a New Hero!, an {X} sorcery). CR 601.2c — the target is OPTIONAL (0-or-1: `optionalTarget`),
// and its legality is bounded by the spell's chosen X (CR 202.3b — X is bound at cast). The copy is UNRESTRICTED
// on controller (ANY player's creature is a legal target, so NO you-control restriction), scoped only by the
// MV≤X cap, which the cast-time target enumerator enforces per-X via a `manaValue`/`valueX` restriction
// (resolved from ctx.xValue, exactly like a tutor's mvCapX but at the TARGET-legality layer). `mvCapX:true` on
// the atom (a) marks it so the program derives xSpell:true — the cast path must enumerate affordable X so
// ctx.xValue reaches the target enumerator — and (b) documents the X-bound cap. NO copiable-value rider
// (no keyword/type/legendary "except"): the anchor is EXACT + end-anchored, so any rider fails → null → low →
// Arbiter (CREED whole-card). copySource:"target" reuses the proven resolver, which already treats an absent
// target (declined "up to one") as a CR 111.12 clean no-op (no token). NO "you control" — the resolver copies
// whatever creature was targeted, of any controller.
const TOKEN_COPY_UPTOONE_MVX_RE = /^create a token that(?:'s| is) a copy of up to one target creature with mana value x or less$/;
// TOKEN-COPY-TARGET-KEYWORD — the same target-copy with a MODELED-KEYWORD grant rider on the COPY
// (Irenicus's Vile Duplication: "…except the token has flying and it isn't legendary."). CR 707.9a — the
// copy GAINS the granted keyword(s); the resolver threads them through snapshotCopiedCard's addKeyword rider
// (writes card.keywords, which layers' printedKeywords seeds from), EXACTLY like a clone's "it has flying"
// rider, so the minted token genuinely flies at runtime. Anchored to "the token has <kw>[ and it isn't
// legendary]" — the "the token" subject (Irenicus) is DISTINCT from the bare "it has <kw>" form (which stays
// null → Arbiter: that form pairs with stat/type riders we don't model), keeping the existing CREED pin
// intact. Every granted keyword must be in GRANTABLE_KEYWORDS (the layer-enforceable set the clone rider also
// restricts to) — an unmodeled keyword fails the gate → null → low → Arbiter (whole-card CREED, no partial).
const TOKEN_COPY_TARGET_KEYWORD_RE = /^create a token that(?:'s| is) a copy of target creature you control, except the token has ([a-z' ]+?)(,? and it isn't legendary)?$/;
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
    // ⭐ "except the token isn't legendary" is a REAL type-line modification (CR 707.9a), not a no-op.
    // ⛔⛔ THIS TAIL USED TO BE SWALLOWED AND DROPPED, justified as "the legend rule is unenforced". sba.js
    // implements CR 704.5j now, so a LEGENDARY token copy of a legendary permanent dies to the rule the
    // instant it enters — which for MIIRYM, SENTINEL WYRM (a token copy of each legendary Dragon you cast)
    // meant the card did NOTHING AT ALL. The flag rides to the resolver, which passes the same
    // stripLegendary rider cloneCopy uses.
    return { op: "create-token-copy", copySource, count: 1, targetType: null, ...(m[2] ? { notLegendary: true } : {}) };
  }
  // ADD-CARD-TYPE rider (Vaultborn Tyrant, Ochre Jelly) — a copy that gains a CARD TYPE ("…except it's an
  // artifact in addition to its other types"). Faithfully modeled: the type is prepended to the copy's type
  // line (snapshotCopiedCard addCardType rider), so the token genuinely IS that type. Anchored + allowlisted;
  // an unmodeled card type / a stat-or-subtype rider falls through → null → Arbiter (CREED whole-card).
  const cm = t.match(TOKEN_COPY_ADD_CARDTYPE_RE);
  if (cm) {
    const copySource = cm[1] === "this creature" ? "self" : "triggering";
    const cardType = cm[2];
    if (ADDABLE_CARD_TYPES.has(cardType)) {
      const Cap = cardType.charAt(0).toUpperCase() + cardType.slice(1);
      return { op: "create-token-copy", copySource, count: 1, targetType: null, addCardTypes: [Cap] };
    }
    return null; // an un-addable card type → Arbiter (no partial copy)
  }
  if (TOKEN_COPY_TARGET_PERMANENT_RE.test(t)) { // KN-3 (Flash Photography)
    return { op: "create-token-copy", copySource: "target", count: 1, targetType: "permanent", restrictions: [{ kind: "typeNeg", type: "aura" }, { kind: "typeNeg", type: "saga" }] };
  }
  const tm = t.match(TOKEN_COPY_TARGET_RE);
  if (tm) {
    const restrictions = [{ kind: "controller", who: "you" }];
    if (tm[2]) restrictions.push({ kind: "notSource" });
    if (tm[3]) restrictions.push({ kind: "supertype", value: "legendary", negate: true });
    return { op: "create-token-copy", copySource: "target", count: tm[1] ? COPY_COUNT[tm[1]] : 1, targetType: "creature", restrictions,
      ...(tm[4] === "isn't legendary" ? { notLegendary: true } : {}), ...(tm[4] === "has haste" ? { grantKeywords: ["haste"] } : {}) };
  }
  // TOKEN-COPY-UPTOONE-MVX (Here Comes a New Hero!) — an {X}-bound OPTIONAL (up-to-one) target copy capped at
  // MV≤X. optionalTarget → the cast may take 0 or 1 target (expandAtoms offers a decline); the manaValue/valueX
  // restriction is resolved from the chosen X at cast-time target enumeration (creatureSatisfiesRestrictions
  // reads ctx.xValue). mvCapX marks the atom so parseEffectClause derives xSpell:true. No controller restriction
  // (any player's creature is legal), no copiable-value rider.
  if (TOKEN_COPY_UPTOONE_MVX_RE.test(t)) {
    return {
      op: "create-token-copy",
      copySource: "target",
      count: 1,
      targetType: "creature",
      optionalTarget: true,
      mvCapX: true,
      restrictions: [{ kind: "manaValue", op: "<=", valueX: true }],
    };
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
    // copy that silently drops a keyword).
    // ⛔ THE ", and it isn't legendary" TAIL IS STAMPED, NOT SWALLOWED (Codex fix #1, 2026-08-30): this arm
    // used to consume the tail as an unstamped optional group — a live dropped rider once sba.js began
    // enforcing CR 704.5j (a legendary token copy died to the rule the card exempts it from). Same
    // notLegendary flag as the sibling arms → tokens.js pushes the stripLegendary copy-rider.
    const kws = km[1].split(/\s+and\s+/).map((k) => k.trim()).filter(Boolean);
    if (kws.length && kws.every((k) => GRANTABLE_KEYWORDS.has(k))) {
      return { op: "create-token-copy", copySource: "target", count: 1, targetType: "creature", grantKeywords: kws, restrictions: [{ kind: "controller", who: "you" }], ...(km[2] ? { notLegendary: true } : {}) };
    }
  }
  return null;
}
