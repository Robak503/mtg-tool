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
import { GRANTABLE_COMBAT_KEYWORDS, canonicalCombatKeyword } from "../keywords.js";

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
function manaOf(card) {
  return String(card?.mana || card?.mana_cost || "");
}
/** Does the card's mana cost carry an {X} pip (Fireball, Blaze, Stroke of Genius…)? */
function hasXCost(card) {
  return /\{X\}/i.test(manaOf(card));
}

/** Strip reminder text in parens + collapse whitespace. */
function stripReminder(text) {
  return String(text || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Remove the "(They|It|That creature|Those creatures) can't be regenerated." rider — a
 * VACUOUS clause in this engine: regeneration shields aren't modeled, so a Destroy always
 * sends the creature to the graveyard whether or not it "can't be regenerated". Stripping it
 * (rather than failing the all-or-nothing gate on an unmodeled clause) is correct, NOT a
 * silent gap: honoring it would produce the IDENTICAL board state. This is what lets
 * Wrath of God / Damnation ("Destroy all creatures. They can't be regenerated.") and
 * regen-rider single-target removal parse natively. Anchored to the regen sentence only.
 */
function stripRegenerationRider(text) {
  return String(text || "").replace(/\b(?:they|it|that creature|those creatures) can'?t be regenerated\b\.?/gi, " ");
}

/**
 * Remove the "This spell can't be countered[ by spells or abilities]." rider — VACUOUS for the effect
 * parser: uncounterability is ENFORCED at the counter-target enumerator (spellEffects.enumerateTargets
 * excludes an on-card "can't be countered" spell from a counter's legal targets), NOT by the effect
 * program, so the spell resolves IDENTICALLY whether or not the parser sees this clause. Stripping it
 * (rather than failing the all-or-nothing gate on an otherwise-unmodeled clause) lets a modeled spell
 * carrying it — Supreme Verdict ("Destroy all creatures. … This spell can't be countered."), Rending
 * Volley — parse natively. Anchored to the "this spell can't be countered" sentence only.
 */
function stripUncounterableRider(text) {
  return String(text || "").replace(/\bthis spell can'?t be countered(?: by spells or abilities)?\b\.?/gi, " ");
}

/**
 * For an {X}-cost spell, rewrite the X in the AMOUNT slot of a modeled clause to a
 * sentinel "1" so the proven numeric clause parser recognizes the shape; the caller
 * stamps `amountX` and drops the sentinel. ONLY the amount slot is rewritten — a
 * power/cardinality X ("power X or less", "X target creatures", "gain X life") is
 * left intact so it stays unmodeled → low. Returns the rewritten clause, or null
 * when no amount-X shape matches (so a fixed clause in an X-spell parses numerically).
 */
function rewriteAmountX(clause) {
  const damage = /(deals?\s+)X(\s+damage\b)/i;
  const draw = /(\bdraw\s+)X(\s+cards?\b)/i;
  const pump = /(\bgets\s+)\+X\/\+X\b/i;
  if (damage.test(clause)) return clause.replace(damage, (_, a, b) => `${a}1${b}`);
  if (draw.test(clause)) return clause.replace(draw, (_, a, b) => `${a}1${b}`);
  if (pump.test(clause)) return clause.replace(pump, (_, a) => `${a}+1/+1`);
  return null;
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
const UNMODELED_MARKERS = /\b(unless|instead|rather than|where|for each|equal to|divided|at random|as long as|if|then|may|choose (?:one|two|three)|another|other target|up to|each of|beginning of|next turn|non(?:black|blue|white|red|green|land|artifact|creature)|attacking|blocking|tapped|untapped|without|wither|infect|with (?:flying|reach|trample|lifelink|deathtouch|vigilance|menace|haste|first strike|double strike|hexproof|indestructible|protection|ward|shadow|power|toughness|mana value)|that (?:player|creature|deals|has|was|spell)|you don't control|an opponent controls|you control|your opponents control|its (?:owner|controller))\b/i;

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
    // A sentence that STARTS with "search your library" is ONE tutor instruction (P3.2):
    // its internal " and " ("reveal it, and put it into your hand", "search for X and Y")
    // is never a top-level effect boundary, so don't sever it. MUST be anchored to the
    // start — a sentence that merely CONTAINS it after a leading modeled effect ("Draw a
    // card and search your library …") must still split, or the leading atom (e.g. draw)
    // would parse HIGH while the tutor portion is silently dropped (a confident WRONG
    // partial execution — the cardinal-rule failure, P3.2 review catch). The tutor anchor
    // still drops anything it can't model in the whole sentence to low.
    if (/^search your library\b/i.test(sentence)) { clauses.push(sentence); continue; }
    // A combat trick that pumps AND grants a keyword ("Target creature gets +2/+2 and gains
    // trample until end of turn"), or grants several keywords ("gains flying and vigilance"),
    // joins its parts with " and " — NOT a top-level effect boundary. Keep the whole sentence
    // as one clause so parseExtendedAtom binds the pump + grant to the SAME target.
    if (/^target creature (?:gets [+-]\d+\/[+-]\d+ and )?gains\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // Overrun-style TEAM pump + keyword grant ("Creatures you control get +3/+3 and gain
    // trample until end of turn"): the " and " between the P/T bump and the grant is INTERNAL
    // to one team-pump instruction, not a top-level effect boundary. Keep the whole sentence so
    // parseExtendedAtom binds the controller-scoped pump + grant together (plural subject →
    // "gain", no trailing s).
    if (/^creatures you control get [+-]\d+\/[+-]\d+ and gain\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // Split on a top-level " and " OR a ", then " sequence ("Scry 2, then draw a card" — Preordain;
    // "Draw a card, then discard a card" — loot). The comma is required so an in-effect "then" (a
    // rarity) isn't severed; each split piece is still re-parsed on its own merits, so a mis-split
    // just yields an unmodeled clause → low → Arbiter, never a confident wrong partial.
    for (const c of sentence.split(/\s+\band\b\s+|,\s+then\s+/i)) {
      const t = c.trim();
      if (t) clauses.push(t);
    }
  }
  return clauses;
}

/**
 * P2.7 extended atoms — recognized by ANCHORED `^…$` matchers. Anchoring is the
 * ALLOWLIST discipline: the clause must reduce EXACTLY to the modeled shape, so a
 * match is clean by construction (any extra/unmodeled text fails the anchor → low).
 * Currently the NON-TARGETED life atoms; targeted ones (tap/bounce/exile/counters)
 * land in a later sub-step alongside the targeting wiring.
 */
const SMALL_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
// Spelled cardinals up to ten — mill amounts ("Mill three cards", "Mill ten cards") are spelled out.
const NUM_WORD = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/**
 * P3.2 tutor filter ALLOWLIST — the type / supertype / land-subtype words the engine can
 * match against a card's type line by literal containment (each word appears verbatim in
 * a real type line). A filter built only from these words is modeled; ANY other word
 * ("nonland", "permanent", "with", "named", a number, an un-listed creature subtype like
 * "dragon") makes the filter unmodeled → the tutor drops to low → Arbiter, so the engine
 * never silently mis-matches a filter it doesn't truly understand. (Creature-subtype
 * tribal tutors are a deliberate fast-follow once the subtype vocabulary is curated.)
 */
const TUTOR_FILTER_WORDS = new Set([
  "basic", "legendary", "snow", "land", "creature", "artifact", "enchantment",
  "instant", "sorcery", "planeswalker", "battle", "plains", "island", "swamp",
  "mountain", "forest", "equipment", "aura",
]);
/**
 * Parse a tutor's filter phrase (the words between "for a/an" and "card") into
 * `{ groups }` — an OR of AND-groups: "instant or sorcery" → [["instant"],["sorcery"]],
 * "basic land" → [["basic","land"]]. Returns null if ANY word is outside the allowlist
 * (→ the tutor is unmodeled → low). A card matches if ANY group's words ALL appear in
 * its type line (effectAtoms.cardMatchesTutorFilter).
 */
function parseTutorFilter(phrase) {
  const groups = String(phrase).trim().split(/\s+or\s+/).map((g) => g.trim().split(/\s+/).filter(Boolean));
  if (groups.length === 0 || groups.some((g) => g.length === 0)) return null;
  for (const g of groups) for (const w of g) if (!TUTOR_FILTER_WORDS.has(w)) return null;
  return { groups };
}

/**
 * Parse a combat-trick's granted-keyword phrase ("trample", "flying and vigilance",
 * "first strike, deathtouch, and lifelink") into canonical keyword names, or null if ANY
 * word is outside the enforced+layer-aware GRANTABLE set (menace / indestructible / hexproof
 * / "protection from red" / …). ALL-OR-NOTHING: one unmodeled keyword drops the whole grant
 * to null → the clause is unmodeled → low → Arbiter, never a fake/partial grant.
 */
function parseGrantedKeywords(phrase) {
  const words = String(phrase).split(/,|\band\b/).map((w) => w.trim()).filter(Boolean);
  if (words.length === 0) return null;
  const out = [];
  for (const w of words) {
    if (!GRANTABLE_COMBAT_KEYWORDS.has(w.toLowerCase())) return null;
    out.push(canonicalCombatKeyword(w));
  }
  return out;
}

function parseExtendedAtom(s) {
  const t = s.toLowerCase().replace(/[’]/g, "'"); // normalize curly apostrophe

  // Tutor — "Search your library for a/an [<FILTER>] card, [reveal it,] [and] put it into
  // your hand[, then shuffle]." HAND destination only, single card. The filter is OPTIONAL:
  // an UNFILTERED "search for a card" (Demonic Tutor) is modeled too (the picker shows the
  // whole library / the auto-pick takes the best). A FILTERED phrase must be ALLOWLISTED
  // (parseTutorFilter); an unmodeled filter ("nonland", "named X", "with mana value") /
  // multi-card ("two", "up to N") / battlefield/top destination all fail the anchor → low →
  // Arbiter. The fetched card is chosen at resolution (player picker, or auto-pick).
  const tm = t.match(/^search your library for an? (?:([a-z][a-z ]*?) )?cards?,?(?: reveal (?:it|that card),?)?(?: and)? put (?:it|that card) into your hand(?:,? (?:then |and )?shuffle(?: your library)?)?\.?$/);
  if (tm) {
    const phrase = tm[1]; // undefined for an unfiltered "a card"
    if (phrase === undefined) {
      return { op: "tutor", filter: null, filterLabel: "card", destination: "hand", targetType: null };
    }
    const filter = parseTutorFilter(phrase);
    return filter ? { op: "tutor", filter, filterLabel: `${phrase} card`, destination: "hand", targetType: null } : null;
  }
  // A standalone "[then] shuffle [your library]" clause (some cards put it in its own
  // sentence after the search) — shuffles the controller's library (CR 103.2).
  if (/^(?:then |and )?shuffle(?: your library)?$/.test(t)) return { op: "shuffle", targetType: null };
  let m = t.match(/^(?:you )?gain (\d+) life$/);
  if (m) return { op: "gain-life", amount: parseInt(m[1], 10), targetType: null };
  m = t.match(/^(?:you )?lose (\d+) life$/);
  if (m) return { op: "lose-life", amount: parseInt(m[1], 10), who: "controller", targetType: null };
  m = t.match(/^each opponent loses (\d+) life$/);
  if (m) return { op: "lose-life", amount: parseInt(m[1], 10), who: "eachOpponent", targetType: null };
  // Counter target spell (P3.1, CR 701.5a) — targets a SPELL on the stack, not a
  // permanent/player. Anchored ALLOWLIST: a tax/conditional/modal-target counter
  // ("…unless its controller pays {3}", "…or ability", "…up to two target spells",
  // "…with mana value 3 or less", "Counter target creature or planeswalker spell")
  // all fail the exact anchor → low → Arbiter, so a counter we can't faithfully model
  // is never confidently wrong. spellFilter is checked against the target's type line
  // at enumeration + resolution.
  if (/^counter target spell$/.test(t)) return { op: "counter", spellFilter: "any", targetType: "spell" };
  if (/^counter target noncreature spell$/.test(t)) return { op: "counter", spellFilter: "noncreature", targetType: "spell" };
  if (/^counter target creature spell$/.test(t)) return { op: "counter", spellFilter: "creature", targetType: "spell" };
  // Graveyard recursion (CR 608) — "Return target [creature] card from your graveyard to your
  // hand" (Raise Dead / Cemetery Recruitment; Regrowth for the unfiltered "card"). The target is
  // a CARD in the CASTER'S OWN graveyard (a PUBLIC zone), chosen at cast time like any target —
  // so it flows through the normal cast-time target enumeration, NO resolution-time picker. Only
  // the two clean filters are modeled: a creature card, or any card. A different filter
  // ("instant or sorcery card", "artifact card", "permanent card"), another zone ("from a
  // graveyard") or a multi-card / "up to" cardinality fails the exact anchor → low → Arbiter, so we
  // never silently mis-target the graveyard. The "to your hand" destination = return-from-graveyard;
  // "to the battlefield" = β-3b reanimation (the card enters as a permanent + fires ETB).
  if (/^return target creature card from your graveyard to your hand$/.test(t)) return { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "creature" };
  if (/^return target card from your graveyard to your hand$/.test(t)) return { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "any" };
  // β-3b reanimation — "Return target creature card from your graveyard to the battlefield" (Resurrection,
  // Zombify, Breath of Life). CREATURE only; "the battlefield under your control" / "tapped" / "with a
  // +1/+1 counter" / a non-creature card filter fails the exact anchor → low → Arbiter.
  if (/^return target creature card from your graveyard to the battlefield$/.test(t)) return { op: "reanimate", targetType: "graveyardCard", cardFilter: "creature" };
  // Targeted (single "target creature", no restriction — the anchor keeps it exact).
  if (/^tap target creature$/.test(t)) return { op: "tap", targetType: "creature" };
  if (/^untap target creature$/.test(t)) return { op: "untap", targetType: "creature" };
  if (/^return target creature to its owner's hand$/.test(t)) return { op: "bounce", targetType: "creature" };
  if (/^exile target creature$/.test(t)) return { op: "exile", targetType: "creature" };
  // β-3 — bounce a NON-creature permanent ("Return target permanent / nonland permanent / artifact …
  // to its owner's hand" — Boomerang, Eye of Nowhere, Void Snare). The bounce resolver (applyZoneMove)
  // already handles a "permanent" target and the enumerator already offers the #192 permanent types;
  // a controller restriction composes exactly like the destroy/exile path. A rider/filter → low → Arbiter.
  const bp = t.match(/^return target (nonland permanent|permanent|artifact|enchantment|land)(?: (an opponent controls|you don't control|you control))? to its owner's hand$/);
  if (bp) {
    const TT = { "permanent": "permanent", "nonland permanent": "nonlandPermanent", "artifact": "artifact", "enchantment": "enchantment", "land": "land" };
    const restrictions = bp[2] ? [{ kind: "controller", who: /^you control$/.test(bp[2]) ? "you" : "opponent" }] : [];
    return { op: "bounce", targetType: TT[bp[1]], restrictions };
  }
  // Targeted NON-CREATURE permanent removal (Disenchant / Naturalize / Stone Rain / "Destroy
  // target permanent"). CREATURE removal keeps its dedicated path (the richer creature-restriction
  // parser); this covers artifact / enchantment / land / permanent / nonland permanent / "artifact
  // or enchantment", with the SAME 3 controller restrictions the creature path models, enforced at
  // enumeration. A different filter ("artifact creature", "tapped artifact"), a non-controller
  // restriction, or a rider (a 2nd clause — Beast Within's "Its controller creates …") fails the
  // exact anchor → low → Arbiter. The new targetType is gated OUT of the trigger flush
  // (programContainsChosenPermanentRemoval) — first-legal could hit the controller's OWN permanent,
  // a forbidden mis-application; safe on the cast path where the player/AI choose the target.
  // β-2 adds the compound permanent-TYPE UNIONS ("X or Y", both already-modeled permanent types) to the
  // alternation — listed BEFORE the singles so the longer phrase wins. "creature or planeswalker" stays
  // OUT (planeswalkers aren't modeled as targetable permanents) → low → Arbiter.
  const rm = t.match(/^(destroy|exile) target (artifact or enchantment|creature or enchantment|creature or land|creature or artifact|artifact or land|enchantment or land|nonland permanent|artifact|enchantment|land|permanent)(?: (an opponent controls|you don't control|you control))?$/);
  if (rm) {
    const TT = {
      "artifact": "artifact", "enchantment": "enchantment", "land": "land", "permanent": "permanent",
      "nonland permanent": "nonlandPermanent", "artifact or enchantment": "artifactOrEnchantment",
      "creature or enchantment": "creatureOrEnchantment", "creature or land": "creatureOrLand",
      "creature or artifact": "creatureOrArtifact", "artifact or land": "artifactOrLand",
      "enchantment or land": "enchantmentOrLand",
    };
    const restrictions = rm[3] ? [{ kind: "controller", who: /^you control$/.test(rm[3]) ? "you" : "opponent" }] : [];
    return { op: rm[1] === "destroy" ? "destroy" : "exile", targetType: TT[rm[2]], restrictions };
  }
  // Combat-trick pump + keyword grant: "target creature gets +N/+N and gains KW[, KW][ and KW]
  // until end of turn" — a layer-7c P/T bump AND layer-6 keyword grant(s), both endOfTurn. The
  // granted keywords must ALL be in the enforced+layer-aware GRANTABLE set (parseGrantedKeywords),
  // else the whole clause is unmodeled → low → Arbiter (no fake/partial grant).
  let pg = t.match(/^target creature gets ([+-]\d+)\/([+-]\d+) and gains (.+) until end of turn$/);
  if (pg) {
    const kws = parseGrantedKeywords(pg[3]);
    return kws ? { op: "pump", targetType: "creature", ptDelta: { p: parseInt(pg[1], 10), t: parseInt(pg[2], 10) }, grantKeywords: kws } : null;
  }
  // Pure keyword grant (no P/T): "target creature gains KW[ and KW] until end of turn".
  pg = t.match(/^target creature gains (.+) until end of turn$/);
  if (pg) {
    const kws = parseGrantedKeywords(pg[1]);
    return kws ? { op: "pump", targetType: "creature", ptDelta: { p: 0, t: 0 }, grantKeywords: kws } : null;
  }
  // MASS effects (board wipes) — UNFILTERED "all creatures" only. Resolve to the SAME atoms
  // with the `eachCreature` scope (no chosen target; programNeedsChosenTarget excludes it),
  // so they hit every creature on every battlefield. A FILTERED wipe ("all creatures with
  // flying", "all creatures you don't control", "all non-Dragon creatures") fails the exact
  // anchor → low → Arbiter, since `eachCreature` would wrongly hit the unfiltered set. The
  // vacuous "they can't be regenerated" rider was already stripped (regeneration is unmodeled,
  // so a Destroy always reaches the graveyard regardless).
  if (/^destroy all creatures$/.test(t)) return { op: "destroy", targetType: "eachCreature" };
  if (/^exile all creatures$/.test(t)) return { op: "exile", targetType: "eachCreature" };
  m = t.match(/^(?:all creatures|each creature) gets? ([+-]\d+)\/([+-]\d+) until end of turn$/);
  if (m) return { op: "pump", targetType: "eachCreature", ptDelta: { p: parseInt(m[1], 10), t: parseInt(m[2], 10) } };
  // TEAM pump — "Creatures you control get +N/+N [and gain KW[, KW][ and KW]] until end of turn"
  // (Trumpet Blast, Inspired Charge, Overrun). A controller-scoped one-shot: it pumps EXACTLY the
  // creatures the caster controls AS IT RESOLVES (CR 611.2c — the set is locked when the effect
  // begins, NOT continuously re-evaluated like a static anthem). Modeled with the `scope:"youControl"`
  // marker (NOT a targetType — it's non-targeted, so it stays non-targeted across every
  // targetType-keyed path: programNeedsChosenTarget, atomTargetSpec, legalChoices). The resolver
  // (effectAtoms.applyPumpEffect) locks in the controller's creature ids and adds one fixed
  // layer-7c P/T effect (+ layer-6 keyword grant) per creature — reusing the combat-trick pump
  // loop verbatim. A FILTERED team pump ("creatures you control with flying", "other creatures you
  // control") fails the exact anchor → low → Arbiter (scope:youControl would hit the wrong set).
  let tp = t.match(/^creatures you control get ([+-]\d+)\/([+-]\d+) and gain (.+) until end of turn$/);
  if (tp) {
    const kws = parseGrantedKeywords(tp[3]);
    return kws ? { op: "pump", scope: "youControl", ptDelta: { p: parseInt(tp[1], 10), t: parseInt(tp[2], 10) }, grantKeywords: kws } : null;
  }
  tp = t.match(/^creatures you control get ([+-]\d+)\/([+-]\d+) until end of turn$/);
  if (tp) return { op: "pump", scope: "youControl", ptDelta: { p: parseInt(tp[1], 10), t: parseInt(tp[2], 10) } };
  // SELF-reference pump (trigger / activated vocabulary) — "this creature gets +N/+N until end of
  // turn" refers to the ability's SOURCE (CR 109.2 — "this creature" = the source permanent). NOT
  // a chosen target (target:"self", no targetType → stays non-targeted), so it routes natively on
  // the trigger-flush + activated paths, which thread the source permanent id into ctx.sourceId.
  // A spell never produces this (its text isn't "this creature"); if a self atom somehow lacks a
  // source it resolves to a no-op, never a fabricated pump.
  m = t.match(/^this creature gets ([+-]\d+)\/([+-]\d+) until end of turn$/);
  if (m) return { op: "pump", target: "self", ptDelta: { p: parseInt(m[1], 10), t: parseInt(m[2], 10) } };
  m = t.match(/^put (a|an|one|two|three|four|five|\d+) ([+-]1\/[+-]1) counters? on target creature$/);
  if (m) return { op: "add-counter", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), targetType: "creature" };
  // SELF-reference +1/+1 / -1/-1 counter — "put a +1/+1 counter on this creature" (the source).
  m = t.match(/^put (a|an|one|two|three|four|five|\d+) ([+-]1\/[+-]1) counters? on this creature$/);
  if (m) return { op: "add-counter", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), target: "self" };
  // ===== COUNTERS ===== TEAM distribution — "Put N +1/+1 (or -1/-1) counter(s) on each creature you
  // control" (Titania's Boon, Basri's Solidarity, Strength of the Pack N=2). NON-targeted, modeled with
  // the SAME `scope:"youControl"` marker the Overrun-style team pump uses (NOT a targetType — it stays
  // non-targeted across programNeedsChosenTarget / atomTargetSpec / legalChoices). The resolver's
  // `atomTargets` already routes `scope:"youControl"` -> controllerCreatureTargets (the controller's
  // creatures gathered AT RESOLUTION, CR 611.2c), and applyAddCounter reuses the single-target counter
  // loop verbatim — the -1/-1 lethal SBA included. ALL-OR-NOTHING anchored: any filter ("…you control
  // with flying", "…other than this creature", "…with a +1/+1 counter on it", "…that entered this turn")
  // or a variable "X counters" leaves trailing text -> fails `$` -> low -> Arbiter (the filtered subset
  // is a DIFFERENT set scope:youControl would wrongly buff in full). Numeric N only (no X).
  m = t.match(/^put (a|an|one|two|three|four|five|\d+) ([+-]1\/[+-]1) counters? on each creature you control$/);
  if (m) return { op: "add-counter", counterType: m[2], amount: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), scope: "youControl" };
  // create-token (P2.6): "Create N P/T <colors> <Subtypes> creature token(s)". Anchored
  // to end at "creature token(s)" — a keyword/ability rider ("…with flying", "…that's
  // tapped") fails the anchor → low, so a granted ability is never silently dropped.
  m = t.match(/^create (a|an|one|two|three|four|five|\d+) (\d+)\/(\d+) ([a-z/ ]+?) creature tokens?$/);
  if (m) return { op: "create-token", count: SMALL_NUM[m[1]] ?? parseInt(m[1], 10), power: parseInt(m[2], 10), toughness: parseInt(m[3], 10), descriptor: m[4].trim(), targetType: null };
  // Scry / surveil (CR 701.18 / 701.43) — look at the top N of YOUR library and reorder: keep any
  // on top (in any order), put the rest on the bottom (scry) or into your graveyard (surveil). A
  // resolution-time INTERACTIVE choice (the player decides; AI/Expert keep all on top) — non-
  // targeted, so it routes natively as a spell, trigger, or activated ability. Numeric N only; a
  // variable "scry X" / a modal "scry 1 or 2" leaves the anchor → low → Arbiter.
  m = t.match(/^scry (\d+)$/);
  if (m) return { op: "scry", amount: parseInt(m[1], 10), targetType: null };
  m = t.match(/^surveil (\d+)$/);
  if (m) return { op: "surveil", amount: parseInt(m[1], 10), targetType: null };
  // Mill (CR 701.13) — top N of a library to its graveyard. Non-targeted only: "you mill N" (self-
  // mill, for graveyard decks) and "each opponent mills N". "TARGET player mills N" (Glimpse the
  // Unthinkable) is deferred — a targeted mill on a TRIGGER would first-legal-target the controller
  // (mill yourself), the same hazard the counter atom gates, so we keep mill non-targeted for now.
  m = t.match(/^(?:you )?mill (\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "mill", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "controller", targetType: null };
  m = t.match(/^each opponent mills (\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "mill", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "eachOpponent", targetType: null };
  return null;
}

/**
 * Parse ONE clause into an atom (+ its target restrictions), or null when the
 * clause carries anything we don't model. The creature-target ALLOWLIST
 * (`parseCreatureTargetRestrictions`) models controller/tapped/power; any other
 * qualifier leaves a residue → null. Non-creature atoms must pass `isCleanClause`.
 */
function parseClauseToAtom(cardType, clause, hasX = false) {
  const s = stripReminder(clause);
  if (!s) return null;

  // α2 — "you may <effect>": an OPTIONAL effect the controller chooses to take (or not). Peel the
  // "you may" wrapper and parse the inner clause on its own merits; if it reduces to a fully-modeled
  // atom, stamp optional:true so the resolver offers a real yes/no (player) / auto-decides (AI),
  // never resolving it as mandatory. A "you may PAY …" (a cost — kicker) or an inner effect we don't
  // model falls through to null → gated as before (the bare "may" stays in UNMODELED_MARKERS, so
  // nothing else is loosened). Only a LEADING "you may" is an optional wrapper (a mid-clause "you
  // may" is a different shape the marker still catches).
  const mayMatch = /^you may (.+)$/i.exec(s);
  if (mayMatch) {
    if (/^pay\b/i.test(mayMatch[1])) return null;
    const inner = parseClauseToAtom(cardType, mayMatch[1], hasX);
    return inner ? { ...inner, optional: true } : null;
  }

  // X-amount variant (only for an {X}-cost spell). Rewrite the X in the AMOUNT slot
  // to a sentinel so the numeric clause parse models the shape, then stamp `amountX`
  // (the resolver substitutes the chosen X via ctx.xValue) and drop the sentinel
  // amount. A standalone X surviving the rewrite ("power X or less", "X target
  // creatures") is a non-amount X we don't model → drop to low. A clause with no
  // amount-X shape falls through to the numeric path (a fixed clause in an X-spell).
  if (hasX) {
    const rewritten = rewriteAmountX(s);
    if (rewritten) {
      if (/\bX\b/.test(rewritten)) return null;
      const base = parseClauseToAtom(cardType, rewritten, false);
      if (!base) return null;
      const atom = { op: base.op, targetType: base.targetType, amountX: true };
      if (base.restrictions) atom.restrictions = base.restrictions;
      if (base.duration) atom.duration = base.duration;
      // Carry a non-targetType binding (a self pump's target:"self") so an X-cost self atom can't
      // silently lose its binding and route a target-less/mis-targeted pump. (ptDelta is NOT
      // carried — an X atom reads its amount from ctx.xValue, not a printed delta.) No current
      // card reaches this (a spell never says "this creature"); it keeps the self-binding
      // invariant from regressing (adversarial-review hardening).
      if (base.target) atom.target = base.target;
      return atom;
    }
  }

  // Extended atoms (anchored ALLOWLIST) before the legacy parse.
  const ext = parseExtendedAtom(s);
  if (ext && KNOWN.has(ext.op)) return ext;

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
function parseModal(cardType, oracle, hasX = false) {
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
      const atom = parseClauseToAtom(cardType, clause, hasX);
      if (!atom) { ok = false; break; }
      atoms.push(atom);
    }
    if (!ok) return { chooseCount: 1, upTo: false, modes: null }; // an unmodeled mode → low
    modes.push({ label: part, atoms });
  }
  return { chooseCount: 1, upTo: false, modes };
}

// δ-1 hand disruption — the filter phrase between "you choose a/an" and "card" mapped to a modeled
// handFilter spec (the enumerator's predicate: `include` = front-face type must contain ANY, `exclude`
// = must contain NONE, `maxCmc` = the optional "mana value N or less"). ALLOWLIST: only these exact
// phrases are modeled — Duress, Thoughtseize, Distress, Inquisition, Coercion, Despise, Divest, Harsh
// Scrutiny. Any other filter ("nonblack", "with the highest mana value", a tribal type) isn't in the
// map → matchHandDisruption returns null → the whole spell routes to the Arbiter (CLAUDE.md §1.2).
const HAND_FILTER_MAP = {
  "": {},                                                      // Coercion — any card
  "nonland": { exclude: ["Land"] },                            // Thoughtseize / Distress / Inquisition
  "noncreature, nonland": { exclude: ["Creature", "Land"] },   // Duress
  "creature": { include: ["Creature"] },                       // Harsh Scrutiny
  "creature or planeswalker": { include: ["Creature", "Planeswalker"] }, // Despise
  "artifact or creature": { include: ["Artifact", "Creature"] },         // Divest
};

/**
 * Match the leading "Target <opponent|player> reveals their hand. You choose a <filter> card from it
 * [with mana value N or less]. That player discards that card." template (δ-1). Returns
 * `{ atom, rest }` — the `discard-chosen` atom plus the oracle text AFTER the template (rider
 * sentences like "You lose 2 life." / "Scry 1.") — or null when the text isn't this exact shape or
 * carries an unmodeled card filter. "You MAY choose …" (Reckoner Shakedown's optional branch) and the
 * exile/graveyard variant (Agonizing Remorse) don't match → Arbiter. `an?` matches the article whether
 * the filter starts with a vowel ("an artifact …") or not ("a nonland …").
 */
function matchHandDisruption(oracle) {
  const m = String(oracle).match(
    /^target (?:opponent|player) reveals their hand\. you choose an? ?([a-z, ]*?) ?card from it(?: with mana value (\d+) or less)?\. that player discards that card\.?/i,
  );
  if (!m) return null;
  const phrase = m[1].trim().toLowerCase();
  if (!(phrase in HAND_FILTER_MAP)) return null;               // an unmodeled filter → low → Arbiter
  const handFilter = { ...HAND_FILTER_MAP[phrase] };
  if (m[2]) handFilter.maxCmc = parseInt(m[2], 10);
  // δ-1b: the atom TARGETS the opponent (a player), bound at cast WITHOUT seeing their hand. The
  // handFilter rides along and is applied at RESOLUTION (applyDiscardChosen reveals that opponent's hand,
  // sets a pendingChoice of the matching cards). This is the faithful Duress flow — commit to the
  // opponent, THEN reveal — and in 4P it can't cross-opponent cherry-pick / leak other hands (the δ-1a
  // `handCard` cast-time model could). `who` records opponent-vs-player for completeness (both enumerate
  // opponents — a safe subset of "target player", never the caster's own hand).
  const who = /reveals their hand/i.test(m[0]) && /^target opponent/i.test(m[0]) ? "opponent" : "player";
  return { atom: { op: "discard-chosen", targetType: "opponent", handFilter, who }, rest: oracle.slice(m[0].length).trim() };
}

// δ-2 impulse-dig — spelled cardinals the "top <N> cards" template uses (2-10; bigger digs are rare).
const DIG_NUM = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/**
 * Match the "Look at the top N cards of your library. Put one of them into your hand and the rest
 * <on the bottom of your library [in any/a random order] | into your graveyard>." dig template (δ-2 —
 * Anticipate, Strategic Planning, Impulse — a 3-way "one to hand / one on top / one on bottom" split
 * like Telling Time correctly fails the anchor → Arbiter). Returns `{ atom, rest }`
 * — the `impulse-dig` atom plus any oracle text AFTER the template — or null. Like hand disruption this
 * SPANS two sentences (the "Put one … and the rest …" clause's internal " and " would be shattered by
 * splitClauses), so it's matched up front as ONE atom. ALL-OR-NOTHING ALLOWLIST: EXACTLY "put one …
 * into your hand" + rest → bottom or graveyard. A filtered dig ("put a creature card …"), a multi-pick
 * ("put two", "put any number"), "you may", a reveal, "rest in random order ON TOP", or an X/Domain
 * count all fail the anchor → low → Arbiter (never a fabricated dig).
 */
function matchImpulseDig(oracle) {
  const m = String(oracle).match(
    /^look at the top (\w+) cards? of your library\. put one of (?:them|those cards|these cards) into your hand and (?:put )?the rest (on the bottom of your library(?: in (?:any|a random) order)?|into your graveyard)\.?/i,
  );
  if (!m) return null;
  const amount = DIG_NUM[m[1].toLowerCase()];
  if (!amount) return null;                                     // "the top X cards" (variable) / unspelled → Arbiter
  const restTo = /graveyard/i.test(m[2]) ? "graveyard" : "bottom";
  return { atom: { op: "impulse-dig", amount, restTo }, rest: oracle.slice(m[0].length).trim() };
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
  // {X}-cost spell: the parser may stamp `amountX` on a damage/draw/pump atom whose
  // amount is the chosen X, bound at cast time (CR 601.2b) and read at resolution.
  return parseEffectClause(oracleOf(card), typeOf(card), { hasX: hasXCost(card) });
}

/**
 * Parse a raw effect-text clause into an EffectProgram, regardless of card type.
 *
 * This is `parseEffectProgram`'s body, factored out so a NON-spell effect clause —
 * a triggered ability's effect ("When ~ enters, <this>"), an activated ability's
 * effect ("{cost}: <this>") — runs through the SAME multi-clause / modal /
 * all-or-nothing-confidence pipeline and inherits the full P2.x atom family. The
 * confidence gate is identical: `high` iff every clause (or every mode) parses to a
 * known atom, `low` (zero atoms → Arbiter seam) otherwise. Returns null only for
 * empty text. NEVER a fabricated effect.
 *
 * `cardType` is the source's type line (used by clause parsers for type-sensitive
 * shapes); `hasX` marks an X in the relevant cost so amount-X atoms bind at choice
 * time (default false — permanent-ability effects rarely carry their own X).
 */
export function parseEffectClause(oracle, cardType = "", { hasX = false } = {}) {
  if (!oracle) return null;
  // Drop the vacuous "can't be regenerated" rider up front (regeneration is unmodeled), so a
  // board wipe / removal spell that carries it isn't forced low by an otherwise-unmodeled
  // clause. Safe: honoring it yields the identical state in this engine.
  oracle = stripRegenerationRider(oracle);
  // Drop the vacuous "This spell can't be countered" rider too — uncounterability is enforced at the
  // counter-target enumerator, not the effect program, so honoring it yields the identical resolution.
  oracle = stripUncounterableRider(oracle);

  // Multi-sentence templates whose effect SPANS sentences (so the clause splitter below would shatter
  // them into unmatchable fragments) are matched up front as ONE atom, then any RIDER sentences that
  // follow run through the normal clause pipeline. ALL-OR-NOTHING: HIGH only if every rider atom is
  // modeled too; an unmodeled rider → low → Arbiter (never a partial — the lead effect would fire while
  // the rider is silently dropped, the cardinal-rule failure).
  //   - δ-1 hand disruption ("…reveals their hand. You choose a card from it. That player discards …"
  //     + Thoughtseize "You lose 2 life" / Harsh Scrutiny "Scry 1").
  //   - δ-2 impulse-dig ("Look at the top N … Put one … into your hand and the rest …").
  const collapsed = (col) => {
    const atoms = [col.atom];
    for (const clause of (col.rest ? splitClauses(col.rest) : [])) {
      const a = parseClauseToAtom(cardType, clause, hasX);
      if (!a) return makeProgram({ confidence: "low", atoms: [], unparsedTail: oracle });
      atoms.push(a);
    }
    if (atoms.every(a => KNOWN.has(a.op))) {
      return makeProgram({ confidence: "high", atoms, xSpell: atoms.some(a => a.amountX), unparsedTail: null });
    }
    return makeProgram({ confidence: "low", atoms: [], unparsedTail: oracle });
  };
  const hd = matchHandDisruption(oracle);
  if (hd) return collapsed(hd);
  const dig = matchImpulseDig(oracle);
  if (dig) return collapsed(dig);

  // Modal "Choose one —": each mode is its own sub-program. HIGH iff every mode
  // parses fully (all-or-nothing across modes).
  const modal = parseModal(cardType, oracle, hasX);
  if (modal) {
    if (modal.modes && modal.modes.every(mode => mode.atoms.every(a => KNOWN.has(a.op)))) {
      const xSpell = modal.modes.some(mode => mode.atoms.some(a => a.amountX));
      return makeProgram({ confidence: "high", structure: "modal", atoms: [], modal, xSpell, unparsedTail: null });
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
    const atom = parseClauseToAtom(cardType, clause, hasX);
    if (!atom) { allParsed = false; break; }
    atoms.push(atom);
  }
  // α2 forward guard: an `optional` atom ("you may <effect>") wraps only its OWN clause, but a
  // conjoined "you may X and Y" splits into [optional X, mandatory Y] — ambiguous optionality scope
  // (a decline would force Y). A multi-atom program carrying any optional atom drops to LOW →
  // Arbiter rather than risk a partial. No printed card produces this today (the 144 native optionals
  // are single-atom); guards it before the vocabulary widens (α2 review).
  const optionalScopeOk = !(atoms.length > 1 && atoms.some(a => a.optional));
  if (allParsed && atoms.length > 0 && optionalScopeOk && atoms.every(a => KNOWN.has(a.op))) {
    // Drop a redundant `shuffle` atom that immediately follows a `tutor` (the tutor
    // already shuffles after its search, CR 701.19e) — some cards template the shuffle as
    // its own sentence, which would otherwise shuffle twice. P3.2 review cleanup.
    const seq = atoms.filter((a, i) => !(a.op === "shuffle" && atoms[i - 1]?.op === "tutor"));
    const xSpell = seq.some(a => a.amountX);
    return makeProgram({ confidence: "high", atoms: seq, xSpell, unparsedTail: null });
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

/**
 * Does the program contain an atom that REQUIRES a chosen target (vs. self / each-*
 * atoms that resolve with no target)? The single source of truth for the
 * trigger-flush routing gate (gameEngine.triggerStackPayload) AND the coverage
 * classifier (coverage.permanentTriggersCovered) — kept here so the runtime and the
 * metric can never drift. eachOpponent/eachCreature resolve without a chosen target.
 */
export function programNeedsChosenTarget(program) {
  if (!program) return false;
  const atoms = program.structure === "modal"
    ? (program.modal?.modes || []).flatMap(m => m.atoms || [])
    : (program.atoms || []);
  return atoms.some(a => a.targetType && !["eachOpponent", "eachCreature"].includes(a.targetType));
}

/**
 * Does the program contain a `counter` atom (P3.1)? The single source of truth for the
 * one place the counter atom must NOT route natively: the trigger-flush path
 * (gameEngine.buildTriggerStack). There, targets are auto-chosen by the default
 * first-legal chooser, which has no enemy-awareness and no self-exclusion — so an ETB
 * "counter target spell" (Mystic Snake) would silently counter the CONTROLLER'S OWN
 * spell when it's the first legal target on the stack (CLAUDE.md §1.2 — a confident
 * WRONG play, worse than the Arbiter route). Counter is SAFE on the cast path (the user
 * picks the target interactively; the AI holds counters) and the activated path (user-
 * picked; the AI doesn't activate), so the gate is narrow: trigger flush + the coverage
 * metric that mirrors it. Lift it once an enemy-aware/interactive flush chooser exists.
 */
export function programContainsCounter(program) {
  if (!program) return false;
  const atoms = program.structure === "modal"
    ? (program.modal?.modes || []).flatMap(m => m.atoms || [])
    : (program.atoms || []);
  return atoms.some(a => a.op === "counter");
}

// The chosen-target NON-CREATURE permanent-removal targetTypes (Disenchant / Stone Rain class). A
// SET so the parser, the trigger gate, and the enumerator can't drift on which types are covered.
export const PERMANENT_TARGET_TYPES = new Set([
  "artifact", "enchantment", "land", "permanent", "nonlandPermanent", "artifactOrEnchantment",
  "creatureOrEnchantment", "creatureOrLand", "creatureOrArtifact", "artifactOrLand", "enchantmentOrLand", // β-2 unions
]);

/**
 * Does the program contain a CHOSEN-TARGET non-creature permanent-removal atom (destroy/exile target
 * artifact/enchantment/land/permanent/…)? Gated OUT of the trigger flush (gameEngine.buildTriggerStack)
 * for the SAME reason as `counter`: the default first-legal flush chooser has no enemy-awareness, so a
 * trigger's "destroy target artifact" would silently destroy the CONTROLLER'S OWN permanent when it
 * sorts first — a confident WRONG play (CLAUDE.md §1.2). SAFE on the cast path (the user picks; the AI
 * holds non-creature removal), so the gate is narrow: the trigger flush + the coverage metric that
 * mirrors it. Lift it once an enemy-aware/interactive flush chooser exists. (CREATURE removal keeps
 * its existing trigger behavior — different targetType, unchanged by this gate.)
 */
export function programContainsChosenPermanentRemoval(program) {
  if (!program) return false;
  const atoms = program.structure === "modal"
    ? (program.modal?.modes || []).flatMap(m => m.atoms || [])
    : (program.atoms || []);
  return atoms.some(a => (a.op === "destroy" || a.op === "exile") && PERMANENT_TARGET_TYPES.has(a.targetType));
}

/**
 * The intended target SIDE for one atom — the basis for the α1 trigger-flush allowlist + the
 * enemy/own chooser (gameEngine.chooseTriggerTargets).
 *   "enemy"     — removal / disruption / damage aimed at an opponent's permanent / spell / the
 *                 opponent (deal-damage, destroy, exile, counter, tap, a negative -X/-X pump, a
 *                 -1/-1 counter).
 *   "own"       — a buff / utility the controller aims at their own side (a positive pump, a +1/+1
 *                 counter, untap, return-a-card-from-your-graveyard).
 *   "ambiguous" — could go either way (bounce), or any unknown targeting atom → NEVER auto-routed
 *                 on a trigger (the flush gates it to the Arbiter rather than risk a wrong target).
 * Returns null for a NON-targeting atom (no targetType, or an each/mass scope; self/team pumps carry
 * no targetType so they land here too) — those never need a chosen target.
 */
export function atomTargetIntent(atom) {
  if (!atom) return null;
  const tt = atom.targetType;
  if (!tt || tt === "eachOpponent" || tt === "eachCreature") return null;
  switch (atom.op) {
    case "deal-damage":
    case "destroy":
    case "exile":
    case "counter":
    case "tap":
      return "enemy";
    case "pump":
      return (atom.ptDelta && ((atom.ptDelta.p || 0) < 0 || (atom.ptDelta.t || 0) < 0)) ? "enemy" : "own";
    case "add-counter":
      return (typeof atom.counterType === "string" && atom.counterType.trim().startsWith("-")) ? "enemy" : "own";
    case "untap":
    case "return-from-graveyard":
    case "reanimate":
      // The target is a card in the CASTER'S OWN graveyard — always own-side, so a reanimation TRIGGER
      // ("When this enters, return target creature card from your graveyard to the battlefield") routes
      // natively (programTriggerTargetsResolvable → true; the chooser's only candidates are own-gy cards).
      return "own";
    case "bounce":
      return "ambiguous";
    default:
      return "ambiguous";
  }
}

/**
 * Can every chosen-target atom in this program have its target placed on a provably-correct side by
 * the α1 trigger chooser? True when no targeting atom is "ambiguous" (every one is enemy- or
 * own-intent, or is non-targeting). The single source of truth for the trigger-flush ALLOWLIST:
 * gameEngine.buildTriggerStack routes a targeted trigger natively only when this holds, and
 * coverage.triggerRoutesNatively MIRRORS it so the metric can't claim a routing the engine won't do.
 */
export function programTriggerTargetsResolvable(program) {
  if (!program) return false;
  const atoms = program.structure === "modal"
    ? (program.modal?.modes || []).flatMap(m => m.atoms || [])
    : (program.atoms || []);
  return atoms.every(a => atomTargetIntent(a) !== "ambiguous");
}

/**
 * Does the program contain a MASS creature-removal atom — destroy / exile / -X-X scoped to
 * `eachCreature` (a board wipe)? The AI HOLDS these (opponentAI.pickCastAction): the engine
 * resolves a symmetric wipe correctly, but the AI can't yet weigh whether nuking the board
 * helps or hurts it, and an indiscriminate Wrath into its own developed board plays terribly.
 * The player casts wipes normally. Narrow + deferred — lift it once a board-state-aware wipe
 * heuristic exists. (Mass DAMAGE, e.g. Pyroclasm, is intentionally NOT gated here — it's a
 * pre-existing cast and small symmetric burn is often a fine aggressive play.)
 */
export function programContainsMassRemoval(program) {
  if (!program) return false;
  const atoms = program.structure === "modal"
    ? (program.modal?.modes || []).flatMap(m => m.atoms || [])
    : (program.atoms || []);
  return atoms.some(a => a.targetType === "eachCreature" && ["destroy", "exile", "pump"].includes(a.op));
}

/**
 * Does the program contain a controller-scoped TEAM pump (`scope:"youControl"`, an Overrun /
 * Trumpet Blast / Inspired Charge "creatures you control get +N/+N [and gain KW] until end of
 * turn")? The AI HOLDS these for now (opponentAI.pickCastAction): a team pump only earns its
 * value cast pre-combat into a profitable attack, and the AI can't yet time it — casting it
 * blindly in its main phase (or with no creatures) wastes the card. Holding is SAFE (the buff
 * is the AI's own, so a miss only costs tempo, never a wrong play); the player casts it normally.
 * Narrow + deferred — lift it once a "pump my team before a good attack" heuristic exists.
 */
export function programContainsTeamPump(program) {
  if (!program) return false;
  const atoms = program.structure === "modal"
    ? (program.modal?.modes || []).flatMap(m => m.atoms || [])
    : (program.atoms || []);
  return atoms.some(a => a.op === "pump" && a.scope === "youControl");
}
