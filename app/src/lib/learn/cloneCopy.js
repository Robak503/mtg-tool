/**
 * cloneCopy.js — "enters the battlefield as a copy of a creature" (Clone / clone-style
 * permanents, CR 707). Leaf module: the clone classifier, the copiable-value snapshot
 * (CR 707.2), the legal copy-target candidates, the modeled "except …" riders (CR 707.9), and
 * the deterministic auto-pick.
 *
 * SCOPE (bounded for correctness — all-or-nothing per the CREED):
 *   • A PURE creature clone whose ENTIRE oracle is "[You may have ~ enter | ~ enters] the
 *     battlefield as a copy of (a|any) creature [you control] on the battlefield."
 *   • A clone whose oracle is that copy clause PLUS an "except …" rider built EXCLUSIVELY from
 *     the MODELED rider atoms (parseCloneRider): add-subtype ("it's a Bird in addition to its
 *     other types"), grant a modeled keyword ("it has flying"), set fixed P/T ("it's 7/7"),
 *     conditional vanishing ("it has vanishing N if that creature doesn't have vanishing"), and
 *     — in the HEAD — an MV cap ("with mana value less than or equal to the amount of mana spent
 *     to cast this creature"). A modeled COMBAT-keyword printed line ahead of the copy clause
 *     (Mockingbird's "Flying") is consumed too, because the copy replaces it and the rider
 *     re-grants it.
 * Any unmodeled rider / head filter / extra clause / non-creature copy (Phyrexian Metamorph's
 * artifact scope, Spark Double's planeswalker scope, Phantasmal Image's becomes-target trigger,
 * Auton Soldier's myriad, Vesuvan Doppelganger's ongoing copy) fails the gate → NOT a recognized
 * clone → body-only/Arbiter, never a partial copy.
 *
 * MODEL: a snapshot. When the clone enters as a copy, its `card` becomes the source's copiable
 * values (a fresh object); the clone's ORIGINAL card is stashed as `permanent.printedCard` and
 * restored when it leaves the battlefield (CR 707.2 — in the graveyard it's the original card,
 * not the copy). The "except …" modifications (CR 707.9 / 707.9a) are applied to that snapshot
 * (added type / granted keyword / set P/T / granted vanishing become part of the copy's copiable
 * values) and to the entering permanent (the extra-counter rider would write counters), so the
 * copy is the WHOLE card, not a partial. Counters/auras/other-layer effects live on the
 * PERMANENT, not the card, so copying the card already excludes them (CR 707.2). The clone's own
 * permanent identity (id, summoning sickness, controller) is unchanged. ETB triggers of the
 * copied creature fire for free, because `enterPermanent` detects triggers from the (now-copied)
 * `card.oracle`.
 *
 * Pure leaf; imports only gameState board helpers — no cycle.
 */

import { findPermanent } from "./gameState.js";

const typeLine = (card) => String(card?.type || card?.type_line || "");
// Front-face only (CR 712.4a) — a battlefield permanent shows its front face; a clone copies a
// transform creature only when its FRONT is a creature.
const isCreatureCard = (card) => /Creature/.test(typeLine(card).split(" // ")[0]);
// Front-face planeswalker (CR 712.4a) — a clone with a "creature or planeswalker" scope (Spark Double) may
// copy a battlefield permanent whose FRONT is a planeswalker; the copy then enters with its starting loyalty
// (enterPermanent's castsAsPlaneswalker path) plus any conditional loyalty rider.
const isPlaneswalkerCard = (card) => /Planeswalker/.test(typeLine(card).split(" // ")[0]);
// Front-face artifact (CR 712.4a) — a clone with an "artifact or creature" scope (Phyrexian Metamorph) may
// copy a battlefield permanent whose FRONT is an artifact (including a NON-creature artifact); the copy enters
// as that artifact (plus the "it's an artifact" rider, harmless-idempotent when it's already one).
const isArtifactCard = (card) => /Artifact/.test(typeLine(card).split(" // ")[0]);

function stripReminder(text) {
  return String(text || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// BECOMES-TARGET SAC TRIGGER (the Phantasmal Illusion family, CR 603.2) — the EXACT modeled granted trigger
// Phantasmal Image confers: "When this creature becomes the target of a spell or ability, sacrifice it." A leaf
// recognizer (cloneCopy stays a leaf — no triggers.js import); it mirrors triggers.classifyCondition's
// becomesTarget anchor + the SELF_SAC_IT_RE effect ("sacrifice it") so the granted body is credited ONLY when
// it's the same self-sac trigger the runtime fires on the copy. Reminder-stripped, lowercased, whitespace-
// collapsed, trailing period optional. Any other quoted body (a different effect, a rider) fails → the clone PARKs.
const BECOMES_TARGET_SAC_RE = /^when(?:ever)? this creature becomes the target of a spell or ability, sacrifice it\.?$/;
function isBecomesTargetSacTriggerText(quoted) {
  const t = stripReminder(quoted).toLowerCase().trim();
  return BECOMES_TARGET_SAC_RE.test(t);
}
// The canonical (title-case-verb) oracle line snapshotCopiedCard appends to the copy, so detectTriggers reads a
// printed-instance-identical trigger sentence. parseCloneRider lowercases the whole clause, so restore the
// leading "When" capitalization that detectTriggers' When/Whenever/At grammar anchors on.
function normalizeGrantedTriggerText() {
  return "When this creature becomes the target of a spell or ability, sacrifice it.";
}

// Modeled combat/keyword grants for the "it has <kw>" rider AND the printed pre-copy keyword line.
// RESTRICTED to keywords the layer engine actually enforces and can GRANT (keywords.GRANTABLE…),
// so granting one to a copy behaves EXACTLY like a printed instance — never a fake ability. Kept
// as a local literal (a tiny, stable set) so this leaf doesn't import the keywords module.
const RIDER_KEYWORDS = new Set([
  "flying", "reach", "first strike", "double strike", "trample", "deathtouch",
  "lifelink", "vigilance", "menace", "haste",
]);
// Creature SUBtypes only — a card-type/supertype change ("it's legendary…") has runtime/zone
// implications the copy snapshot doesn't model, so those route to the Arbiter. The two ADDABLE
// permanent card types (artifact/enchantment) are handled by their own rider below (addCardType) —
// the copy snapshot genuinely prepends them to the type line — so they're excluded here to avoid the
// generic addType (subtype) branch mis-parsing "it's an artifact…" as a subtype.
const CARD_TYPES_SUPERTYPES = /\b(?:artifact|enchantment|creature|land|planeswalker|battle|instant|sorcery|legendary|basic|snow|world|tribal|kindred)\b/;
// Permanent card types the copy snapshot can faithfully PREPEND to a copied permanent's type line via
// snapshotCopiedCard's addCardType rider (addCardTypeToLine): the copy genuinely IS that card type for
// every type-line read. Mirrors tokenCopy.js ADDABLE_CARD_TYPES exactly (Vaultborn Tyrant / Phyrexian
// Metamorph). Artifact/Enchantment only — a Creature/Land/Planeswalker addition has P/T-or-zone
// implications the snapshot doesn't model, so those are NOT addable → the rider PARKs.
const ADDABLE_CARD_TYPES = new Set(["artifact", "enchantment"]);

/**
 * Parse ONE "except …" rider sub-clause into a modeled atom, or null (= unmodeled → the whole
 * clone routes to the Arbiter). The clause is reminder-stripped, lowercased, name elided to `~`,
 * leading "and "/trailing "." removed. Atoms (CR 707.9 / 707.9a copy modifications):
 *   { kind: "addType", subtype }     — "it's a Bird in addition to its other types"
 *   { kind: "addKeyword", keywords } — "it has flying" / "it has flying and vigilance" (modeled kws only)
 *   { kind: "setPT", power, toughness } — "it's 7/7"
 *   { kind: "grantVanishing", n }    — "it has vanishing 3 if that creature doesn't have vanishing"
 *   { kind: "retainOwnAbilities" }   — "it has ~'s other abilities" (marker; parseCloneSpec fills oracle/keywords)
 */
export function parseCloneRider(clause) {
  // Lowercase so a directly-called rider (mixed-case "Bird") parses the same as the spec-level path
  // (which lowercases the whole oracle first). Subtype words are re-capitalized on the way out.
  let cl = String(clause || "").toLowerCase().trim().replace(/^and\s+/, "").replace(/\.$/, "").trim();
  if (!cl) return null;

  // "it isn't legendary" (Spark Double) — a NO-OP rider (the legend rule is unenforced by the engine), so it
  // carries no atom field but IS recognized (returning a no-op kind) so the all-or-nothing rider gate doesn't
  // park the whole clone over an unenforced-but-harmless modification. Mirrors the tokenCopy isn't-legendary
  // no-op exactly.
  if (/^it (?:isn'?t|is not) legendary$|^it'?s not legendary$/.test(cl)) return { kind: "noop" };

  // ===== PRONOUN GENERALITY (CR 707.9a) — a rider names the copy with whatever pronoun the card's flavour
  // uses. "his name is Impossible Man", "he's 4/4", "he has flying" are the SAME riders as the "it" forms
  // below; only the pronoun differs. Normalize before the arms rather than duplicating each one, so a future
  // rider gets every pronoun for free. Measured: without this, Impossible Man and Hulkling parked on riders
  // the vocabulary already understood.
  cl = cl.replace(/^(?:he|she|they)'s\b/, "it's").replace(/^(?:he|she|they) (has|have)\b/, "it has")
    .replace(/^(?:his|her|their) name is\b/, "its name is");

  // ===== NAME RIDER (CR 707.9a) — "except its name is <X>". The copy keeps the ORIGINAL card's name
  // (Sarkhan, Soul Aflame; Impossible Man; Hulkling, Young Avenger). This is NOT a no-op: names are read by
  // name-matching effects and by the legend rule, so the copy must genuinely carry the stated name rather
  // than the copied creature's. Applied in snapshotCopiedCard.
  //
  // ⛔ THE CANONICAL FORM IS THE ELIDED ONE, and a pin caught me assuming otherwise. parseCloneSpec replaces
  // the card's own name with `~` before the riders are split, so the rider that actually reaches here from a
  // printed card reads "its name is ~" — not the spelled-out name. Returning `~` as a literal would stamp
  // the copy with the name "~". It maps to a marker the applier resolves against the COPYING CARD, which is
  // exactly what `~` denotes. The spelled-out branch is kept for a caller that hands over un-elided text.
  let nm = cl.match(/^its name is (.+)$/);
  if (nm) {
    const raw = nm[1].trim();
    return raw === "~" ? { kind: "setName", selfName: true } : { kind: "setName", name: raw };
  }

  // ⛔ NOT ADDED: "it's legendary in addition to its other types" (Sarkhan, Soul Aflame). I briefly
  // made this a no-op on the grounds that the engine does not enforce the legend rule (CR 704.5j) — and
  // clone.test.js's existing pin caught it. The legend rule is not the point: LEGENDARY-MATTERS effects
  // are real here (Bard Class taxes "Legendary spells"; anthems and ETB triggers scope on it), so a copy
  // that should BE legendary and is not would be credited native with the modification silently dropped —
  // the forbidden direction. Modelling it properly means PREPENDING the supertype to the copy's type line
  // (the way addCardType does for artifact/enchantment, but further left); until then it stays null and
  // the card parks. Consequence, recorded honestly: Sarkhan stays parked even after the copy wave lands.

  // "it has ~'s other abilities" (Sakashima of a Thousand Faces, CR 707.9) — the copy ALSO KEEPS the clone
  // card's OWN abilities (everything on the clone but the copy clause itself). A MARKER atom: parseCloneSpec
  // fills in `.oracle` / `.keywords` from the own-ability clauses it stripped off the tail (the name-elided
  // `~` is why this can't fall through to the generic "it has <kw>" rider — that char class excludes `~`).
  // parseCloneSpec only emits this marker when EVERY own-ability clause it stripped is modeled, so the append
  // is the WHOLE set of retained abilities, never a partial.
  if (/^it has ~'?s other abilities$/.test(cl)) return { kind: "retainOwnAbilities" };

  // "it's N/N" — a copy that sets base P/T (Quicksilver Gargantuan). CR 707.9.
  let m = cl.match(/^it'?s (\d+)\/(\d+)$/);
  if (m) return { kind: "setPT", power: parseInt(m[1], 10), toughness: parseInt(m[2], 10) };

  // "it has vanishing N if that creature doesn't have vanishing" (Flesh Duplicate). CR 707.9a + 702.63a.
  m = cl.match(/^it has vanishing (\d+) if that creature doesn'?t have vanishing$/);
  if (m) return { kind: "grantVanishing", n: parseInt(m[1], 10) };

  // GRANT A BECOMES-TARGET SAC TRIGGER (Phantasmal Image, CR 707.9a + 603.2) — 'it has "When this creature
  // becomes the target of a spell or ability, sacrifice it."'. The copy GAINS the printed self-sac trigger the
  // Illusion family carries; snapshotCopiedCard appends its quoted body to the copy's oracle so detectTriggers
  // sees it exactly like a printed instance, and the becomes-target event (checkBecomesTargetTriggers) fires it
  // on the copy at every target-choice site. Anchored to EXACTLY the modeled becomes-target-sac trigger (the
  // quoted text must parse to the same becomesTarget/self-sac descriptor the printed siblings do) — any other
  // granted quoted ability leaves this null → the whole clone PARKs (CREED all-or-nothing). The quote is
  // preserved intact through parseCloneSpec's quote-aware rider split (its internal comma/period never splits it).
  m = cl.match(/^it has\s+["“](.+?)["”]\.?$/);
  if (m && isBecomesTargetSacTriggerText(m[1])) {
    return { kind: "grantTrigger", oracle: normalizeGrantedTriggerText(m[1]) };
  }

  // CONDITIONAL ENTERS-WITH-COUNTER (Spark Double, CR 707.9a + 614.1c + 122.6a) — "it enters with an
  // additional +1/+1 counter on it if it's a creature" / "it enters with an additional loyalty counter on it
  // if it's a planeswalker". A REPLACEMENT that adds ONE counter to the ENTERING PERMANENT (counters live on
  // the permanent, not the copiable card), GATED on the copy's resulting card type — so it's applied by the
  // clone-resolution path (resolveCloneChoice), which knows the copied card, NOT by snapshotCopiedCard.
  // Anchored to exactly the +1/+1-if-creature and loyalty-if-planeswalker shapes (a literal singular counter).
  m = cl.match(/^it enters with an additional (\+1\/\+1|loyalty) counter on it if it'?s an? (creature|planeswalker)$/);
  if (m) return { kind: "entersWithCounterIf", counterType: m[1], n: 1, ifType: m[2] };

  // "it's an artifact in addition to its other types" (Phyrexian Metamorph, CR 707.9a) — add a permanent
  // CARD TYPE (artifact/enchantment) to the copy. The type is PREPENDED to the copy's type line by
  // snapshotCopiedCard's addCardType rider (addCardTypeToLine), so the copy genuinely IS that card type for
  // every type-line read (artifact-matters triggers, the artifact-scoped batch combat gate). Anchored to the
  // singular addable card types only; a Creature/Land/Planeswalker/supertype addition (P/T-or-zone
  // implications the snapshot doesn't model) falls through → null → PARK. Mirrors tokenCopy.js's
  // TOKEN_COPY_ADD_CARDTYPE_RE for the token form of the same modification.
  m = cl.match(/^it'?s an? ([a-z]+) in addition to its other types$/);
  if (m && ADDABLE_CARD_TYPES.has(m[1])) {
    const Cap = m[1].charAt(0).toUpperCase() + m[1].slice(1);
    return { kind: "addCardType", cardType: Cap };
  }

  // "it's a <Subtype> in addition to its other [creature] types" — add a creature subtype (CR 707.9).
  // Must be a SUBTYPE only; a card-type/supertype change is unmodeled (CARD_TYPES_SUPERTYPES → null).
  m = cl.match(/^it'?s (?:a |an )?([a-z][a-z' ]*?) in addition to its other (?:creature )?types$/);
  if (m && !CARD_TYPES_SUPERTYPES.test(m[1])) {
    const subtype = m[1].trim();
    // single subtype word only (a multi-word "Faerie Shapeshifter" is fine too — all words capitalize)
    if (subtype && /^[a-z' ]+$/.test(subtype)) {
      const Subtypes = subtype.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      return { kind: "addType", subtype: Subtypes };
    }
  }

  // "it has <kw>[ and <kw>]" — grant modeled keyword(s) (CR 707.9a). Every kw must be modeled.
  m = cl.match(/^it has ([a-z' ]+)$/);
  if (m) {
    const kws = m[1].split(/\s+and\s+/).map((k) => k.trim()).filter(Boolean);
    if (kws.length && kws.every((k) => RIDER_KEYWORDS.has(k))) return { kind: "addKeyword", keywords: kws };
  }

  return null; // unmodeled rider → caller PARKs the whole card
}

/**
 * Peel any 'it has "…"' granted-ability sub-clause(s) out of a rider clause so its opaque QUOTE (with internal
 * commas/periods) survives the comma/"and" split (Phantasmal Image, CR 707.9a). Returns { quotedClauses, remainder }:
 * `quotedClauses` are the extracted 'it has "…"' units (each an intact rider sub-clause for parseCloneRider);
 * `remainder` is the rider text with those units + their joining " and "/", " removed, ready for the normal split.
 * Non-quoted riders yield an empty quotedClauses and remainder === input (byte-identical to the old path). Pure.
 */
function extractQuotedRiderClauses(riderText) {
  const quotedClauses = [];
  // Match 'it has "<anything up to the closing quote>"' plus any FLANKING connector (", "/", and "/" and ") so
  // removing the clause leaves the remaining riders cleanly split-able. The quote is opaque (its internal ,/. never
  // split). Each removed span becomes a single space; the remainder is whitespace-collapsed + trimmed below.
  const RE = /(?:,?\s*and\s+|,\s*)?it has\s+["“][^"”]*["”]\.?(?:\s*,?\s*and\s+|,\s*)?/gi;
  const remainder = String(riderText || "").replace(RE, (match) => {
    const inner = match.match(/it has\s+["“][^"”]*["”]\.?/i);
    if (inner) quotedClauses.push(inner[0].trim());
    return " ";
  }).replace(/\s+/g, " ").replace(/^[,\s]+|[,\s]+$/g, "").trim();
  return { quotedClauses, remainder };
}

/**
 * Parse a creature-clone spec, or null. The WHOLE oracle (reminder stripped, the card's own name
 * elided to `~`) must reduce to the copy clause, optionally preceded by modeled printed keyword
 * lines and optionally followed by an "except …" rider built ONLY from modeled atoms — the
 * all-or-nothing gate that keeps any unmodeled mechanic out. Returns:
 *   { optional, scope, mvLimit, riders }
 *     - optional: true for "You may have …" (you can decline → enters as a 0/0 → dies).
 *     - scope: "youControl" for "a creature you control", else "any".
 *     - mvLimit: true when the head restricts the target to "mana value ≤ mana spent to cast this".
 *     - riders: array of modeled rider atoms (empty for a pure clone).
 */
/**
 * ⭐ THE COST-KEYWORD PRE-STRIP, MOVED HERE SO BOTH SIDES SHARE IT (2026-07-29).
 *
 * parseCloneSpec requires the WHOLE oracle to be the copy clause, so a cost-only keyword line — "Plot {2}{U}"
 * (Visage Bandit), Convoke, Affinity — made it return null. coverage.js knew that and stripped those lines
 * BEFORE calling isCloneCard… but the RUNTIME (resolvers.js PERMANENT_ETB) called isCloneCard on the RAW
 * card. So Visage Bandit classified `native-clone` and, on a board with a legal copy target, raised NO
 * clone choice at all: it entered as itself. A runtime-vacuous native, and invisible to the tier.
 *
 * Verified behaviourally before and after, with Clone / Mirror Image as live controls.
 *
 * Doing the strip INSIDE the shared readers is what makes the divergence impossible to reintroduce: every
 * consumer — classifier, resolver, legalChoices' X-cost check — now sees the same text. Those keywords are
 * cost-only and the runtime hard-casts at full cost (the Ninjutsu/Convoke precedent), so removing them for
 * SHAPE detection can never over-claim a non-clone.
 */
function stripCostOnlyLines(oracle) {
  return String(oracle || "")
    // "Plot {cost}" / "Convoke" / "Affinity for X" style lines carry no copy semantics.
    .replace(/(?:^|\n)[^\n]*\bplot\s+(?:\{[^}]+\})+[^\n]*(?=\n|$)/gi, "\n")
    .replace(/(?:^|\n)\s*(?:convoke|affinity for [^\n.]+|improvise|delve)\s*(?=\n|$)/gi, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function parseCloneSpec(card) {
  let t = stripReminder(stripCostOnlyLines(card?.oracle || card?.oracle_text || "")).toLowerCase();
  const nameL = card?.name ? String(card.name).toLowerCase() : null;
  if (nameL) {
    t = t.replace(new RegExp(escapeRegex(nameL), "g"), "~");
    // Legendary cards refer to themselves by their SHORT name in their own text (CR 201.4) — the pre-comma
    // part ("Pantlaza") or, for the comma-less "<First> …" style, the FIRST word ("Sakashima of a Thousand
    // Faces" → "Sakashima"). The full-name elision above misses those, so also elide the short/first-word
    // form for legends (word-bounded, ≥3 chars, distinct from the full name) — mirrors triggers.js's
    // legendary self-reference handling so a copy clause / rider templated with the short name anchors.
    const isLegendary = /legendary/i.test(String(card?.type || card?.type_line || ""));
    if (isLegendary) {
      const shortForms = new Set();
      const comma = nameL.split(",")[0].trim();
      if (comma && comma !== nameL) shortForms.add(comma);
      if (!nameL.includes(",") && /\s/.test(nameL)) shortForms.add(nameL.split(/\s+/)[0]);
      for (const sf of shortForms) {
        if (sf.length >= 3) t = t.replace(new RegExp("\\b" + escapeRegex(sf) + "\\b", "g"), "~");
      }
    }
  }
  // A clone that KEEPS its own abilities (Sakashima's "except it has ~'s other abilities") has extra
  // ability clauses trailing the copy clause. Strip the MODELED own-ability clauses off the tail before
  // anchoring the copy clause, and remember them (their ORIGINAL oracle text + own keywords) so the
  // retainOwnAbilities rider can re-append the WHOLE set to the copy. All-or-nothing: if any trailing
  // own-ability clause is UNmodeled, `own` is null and the copy clause won't `$`-anchor → PARK.
  const { head: headText, own } = stripOwnAbilityTail(t, card);
  t = headText;
  // Consume modeled printed keyword tokens AHEAD of the copy clause (Mockingbird's "flying ").
  // Each must be a modeled combat keyword; an unmodeled pre-copy keyword/ability (ninjutsu,
  // changeling, convoke, improvise, flash, prototype…) is NOT consumed → the head won't anchor →
  // null (PARK). The copy replaces these printed keywords anyway; a rider re-grants what's kept.
  t = stripLeadingKeywords(t);
  // Modern templating is "this creature enter as a copy of …" (no "the battlefield"); the older
  // wording "enter the battlefield as a copy of …" is also accepted ((?: the battlefield)?). The
  // tail is one of the clean scopes, optionally + the MV cap, optionally + ", except <rider>".
  // SCOPE "a creature or planeswalker you control" (Spark Double) — the copy may be a planeswalker; the
  // entry path (enterPermanent castsAsPlaneswalker) gives a copied PW its starting loyalty, and the
  // conditional counter rider (entersWithCounterIf) adds the +1/+1-if-creature / loyalty-if-planeswalker.
  // SCOPE "another creature you control" (Sakashima) — a "you control" scope that excludes the clone itself;
  // since the clone isn't on the battlefield yet when candidates are gathered, "another" is naturally
  // satisfied, so it maps to the same youControl candidate set.
  // SCOPE "any artifact or creature on the battlefield" (Phyrexian Metamorph) — the copy may be a NON-creature
  // ARTIFACT too (front-face, CR 712.4a). Copying an artifact snapshots its whole card (mana abilities /
  // activated abilities resolve through the same runtime as the source, CR 707.2) and — with the addCardType
  // "it's an artifact" rider — the entering permanent is an artifact (non-creature artifacts enter without a
  // lethal-toughness SBA, so they don't die like a 0/0 clone). enterPermanent handles a non-creature card
  // (summoningSick only stamped for creatures).
  // NON-CREATURE clone cards (Sculpting Steel = Artifact, Copy Artifact = Enchantment, Masterwork of Ingenuity =
  // Artifact — Equipment) template "this artifact|Equipment|enchantment enter as a copy of …", so the subject
  // noun is any permanent word, not just "this creature". The copy REPLACES the clone's characteristics with a
  // snapshot of an ARTIFACT / EQUIPMENT (proven runtime — anyArtifactOrCreature already copies artifacts), so
  // artifact/Equipment scopes are runtime-safe; enchantment / nonland-permanent scopes are NOT modeled yet →
  // they don't match here → PARK (Copy Enchantment, Clever Impersonator stay Arbiter, a safe false-negative).
  const m = t.match(
    /^(?:you may have (?:~|this (?:creature|artifact|equipment|enchantment)) enter|(?:~|this (?:creature|artifact|equipment|enchantment)) enters?)(?: the battlefield)? as a copy of (any creature on the battlefield|any artifact or creature on the battlefield|any artifact on the battlefield|any equipment on the battlefield|a creature you control|another creature you control|a creature or planeswalker you control)( with mana value less than or equal to the amount of mana spent to cast this creature)?(?:, except (.+?))?\.?$/,
  );
  if (!m) return null;

  let riders = [];
  if (m[3]) {
    // QUOTE-AWARE rider split (Phantasmal Image, CR 707.9a) — a granted-ability rider carries a QUOTED trigger
    // whose own text has internal commas/periods ('it has "When this creature becomes the target of a spell or
    // ability, sacrifice it."'). Splitting the whole rider clause on ", "/" and " would shatter that quote. So
    // FIRST peel off any 'it has "…"' sub-clause as a single unit (its quote is opaque to the split), parse it
    // as a grantTrigger atom, and split ONLY the remainder on the normal delimiters. A leading/trailing " and "
    // joining the quoted clause to the others is consumed with it. Non-quoted riders keep the exact old split.
    const { quotedClauses, remainder } = extractQuotedRiderClauses(m[3]);
    const subs = remainder.split(/,\s*and\s+|,\s+|\s+and\s+/).map((s) => s.trim()).filter(Boolean);
    for (const q of quotedClauses) subs.push(q);
    for (const s of subs) {
      let atom = parseCloneRider(s);
      if (!atom) return null;
      // "it has ~'s other abilities" is only a WHOLE, faithful copy modification when EVERY own-ability
      // clause we stripped off the tail is modeled (own !== null) — else the retained set would be a
      // partial (a forbidden FP), so PARK. When modeled, carry the concrete own-ability oracle + keywords
      // on the rider so snapshotCopiedCard re-appends them to the copy.
      if (atom.kind === "retainOwnAbilities") {
        if (!own) return null;
        atom = { ...atom, oracle: own.oracle, keywords: own.keywords };
      }
      riders.push(atom);
    }
  }
  return {
    optional: /^you may\b/.test(t),
    scope: m[1] === "a creature you control" || m[1] === "another creature you control" ? "youControl"
      : m[1] === "a creature or planeswalker you control" ? "youControlCreatureOrPw"
        : m[1] === "any artifact or creature on the battlefield" ? "anyArtifactOrCreature"
          : m[1] === "any artifact on the battlefield" ? "anyArtifact"
            : m[1] === "any equipment on the battlefield" ? "anyEquipment"
              : "any",
    mvLimit: !!m[2],
    riders,
  };
}

/**
 * Split the MODELED "own ability" clauses off the TAIL of a clone's normalized oracle so the copy clause can
 * `$`-anchor, and return them so a retainOwnAbilities rider can re-append the clone's own abilities to the copy
 * (Sakashima of a Thousand Faces, CR 707.9). Only a fixed set of own abilities is modeled — each has NO
 * runtime battlefield effect, so appending its text to the copy is faithful and inert:
 *   • the legend-rule-off static ("The 'legend rule' doesn't apply to permanents you control.") — the legend
 *     rule is UNENFORCED by the engine (see the isn't-legendary no-op), so this is a harmless inert line.
 *   • Partner — a bare keyword with no battlefield behavior (it only matters at commander assignment, and a
 *     copy is never a commander per CR 903.3 — snapshotCopiedCard already strips isCommander).
 * `own.oracle` is the ORIGINAL (reminder-preserved) card oracle lines for those abilities; `own.keywords` is
 * the clone's own keywords (e.g. Partner). Returns { head, own }: `head` is the oracle with those tail clauses
 * removed; `own` is null when the tail has NO extra clauses (a plain clone — nothing to retain) OR when it has
 * an UNmodeled extra clause (→ head keeps it, the copy clause won't anchor, the card PARKs).
 */
function stripOwnAbilityTail(normalized, card) {
  // Modeled tail-clause matchers on the normalized (reminder-stripped, name-elided, lowercased) text.
  const OWN_ABILITY_CLAUSES = [
    /the "legend rule" doesn'?t apply to permanents you control\./,
    /the legend rule doesn'?t apply to permanents you control\./,
    /\bpartner\b\.?/,
  ];
  let head = normalized;
  let strippedAny = false;
  let changed = true;
  while (changed) {
    changed = false;
    for (const re of OWN_ABILITY_CLAUSES) {
      const anchored = new RegExp("\\s*" + re.source + "\\s*$", re.flags);
      if (anchored.test(head)) {
        head = head.replace(anchored, "").trim();
        strippedAny = true;
        changed = true;
        break;
      }
    }
  }
  if (!strippedAny) return { head, own: null };
  // Reconstruct the ORIGINAL own-ability oracle lines (reminder text preserved) + own keywords from the card,
  // dropping the copy clause. A clone's own abilities appended to the copy must read as printed instances.
  const rawLines = String(card?.oracle || card?.oracle_text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const ownLines = rawLines.filter((l) => !/enter(?:s)?(?: the battlefield)? as a copy of/i.test(l));
  return {
    head,
    own: {
      oracle: ownLines.join("\n"),
      keywords: Array.isArray(card?.keywords) ? [...card.keywords] : [],
    },
  };
}

/** Strip leading MODELED combat-keyword tokens (and a leading "flying, " list) before the copy
 *  clause. Returns the remainder. Stops at the first token that isn't a modeled keyword, so an
 *  unmodeled pre-copy mechanic is left in place (the head regex then fails → PARK). */
function stripLeadingKeywords(t) {
  let s = t;
  // Sort longest-first so "first strike"/"double strike" match before "first"/"double".
  const kws = [...RIDER_KEYWORDS].sort((a, b) => b.length - a.length);
  let changed = true;
  while (changed) {
    changed = false;
    for (const kw of kws) {
      const re = new RegExp("^" + escapeRegex(kw) + "(?:[.,]|\\s)\\s*", "i");
      if (re.test(s)) { s = s.replace(re, ""); changed = true; break; }
    }
  }
  return s.trim();
}

/** Is this card a clone the engine models (a creature whose whole text is the copy clause,
 *  optionally + modeled printed keywords + a fully-modeled "except …" rider)? */
export function isCloneCard(card) {
  const spec = parseCloneSpec(card);
  if (spec === null) return false;
  // A CREATURE clone card (Clone, Phyrexian Metamorph, Spark Double) is native for any modeled scope — unchanged.
  if (/Creature/.test(typeLine(card))) return true;
  // A NON-creature clone card (Sculpting Steel = Artifact, Copy Artifact = Enchantment, Masterwork of Ingenuity =
  // Artifact — Equipment) is native ONLY for the runtime-proven artifact/Equipment copy scopes: it enters as a
  // snapshot of an artifact (the anyArtifactOrCreature runtime already copies artifacts; enterPermanent handles a
  // non-creature card). A creature-copy scope on a non-creature card would become a creature — not modeled → PARK.
  return spec.scope === "anyArtifact" || spec.scope === "anyEquipment";
}

/** Mana value of a mana-cost string (CR 202.3): each `{N}` digit pip adds N; `{X}`/`{Y}`/`{Z}`
 *  add 0; every other pip (color, {C}, hybrid `{W/U}`, phyrexian `{U/P}`) adds 1 (CR 202.3f). A
 *  tiny self-contained parser so this stays a leaf (no legalChoices import). */
function manaValueOfCost(costString) {
  let mv = 0;
  for (const m of String(costString || "").matchAll(/\{([^}]+)\}/g)) {
    const pip = m[1].trim().toUpperCase();
    if (/^\d+$/.test(pip)) mv += parseInt(pip, 10);
    else if (pip === "X" || pip === "Y" || pip === "Z") mv += 0;
    else mv += 1; // single color, C, hybrid, or phyrexian — 1 each
  }
  return mv;
}
const manaValueOfCard = (card) => manaValueOfCost(card?.mana || card?.mana_cost || "");

/**
 * The MV cap for an MV-limited clone (Mockingbird: "copy any creature with mana value ≤ the amount
 * of mana spent to cast this creature"). The mana spent = the clone's FIXED pips (everything but
 * {X}, since X adds 0 to the cost's MV) + the value paid for X. For Mockingbird {X}{U}: fixed MV =
 * 1, so cap = xValue + 1. Returns the cap, or null when the spec has no MV limit (every creature
 * is then a candidate).
 */
export function cloneMvCap(cloneCard, spec, xValue = 0) {
  if (!spec?.mvLimit) return null;
  return manaValueOfCost(cloneCard?.mana || cloneCard?.mana_cost || "") + (Number(xValue) || 0);
}

/**
 * Legal copy targets for a clone resolving under `controller` with the given scope: every
 * CREATURE permanent on the battlefield (CR 707 — copying happens on the battlefield), scoped to
 * the controller for "you control", and (when `mvCap` is a number) restricted to creatures whose
 * mana value is ≤ the cap (Mockingbird). As `{ id, name }` (battlefield permanent ids). The clone
 * itself isn't on the battlefield yet, so it can't be a candidate.
 *
 * SCOPE "youControlCreatureOrPw" (Spark Double) — the controller's CREATURES *and* PLANESWALKERS are both
 * legal (front-face, CR 712.4a). Both copy correctly: a creature copy enters as the snapshot; a planeswalker
 * copy enters with its starting loyalty via enterPermanent's castsAsPlaneswalker path. (No MV cap pairs with
 * this scope in the corpus; the cap filter still applies harmlessly if one ever did.)
 *
 * SCOPE "anyArtifactOrCreature" (Phyrexian Metamorph) — every ARTIFACT *and* every CREATURE on ANY player's
 * battlefield is legal (front-face, CR 712.4a — an artifact-front DFC copies as its artifact side). A copied
 * NON-creature artifact enters as an artifact (no lethal SBA, doesn't die like a 0/0). An artifact creature
 * satisfies both predicates and is offered once (the `||`).
 */
export function cloneCandidates(state, controller, scope, mvCap = null) {
  const out = [];
  const youControlOnly = scope === "youControl" || scope === "youControlCreatureOrPw";
  const allowPw = scope === "youControlCreatureOrPw";
  const allowArtifact = scope === "anyArtifactOrCreature";
  // ARTIFACT-ONLY / EQUIPMENT-ONLY scopes (Sculpting Steel / Copy Artifact = anyArtifact; Masterwork of
  // Ingenuity = anyEquipment) — copy ONLY an artifact (any player's battlefield), not a plain creature. An
  // artifact creature IS an artifact and stays a legal source; Equipment is the "Equipment" artifact subtype.
  const artifactOnly = scope === "anyArtifact";
  const equipmentOnly = scope === "anyEquipment";
  for (const pid of Object.keys(state.players)) {
    if (youControlOnly && pid !== controller) continue;
    for (const perm of state.players[pid].battlefield) {
      const copiable = (artifactOnly || equipmentOnly)
        ? (isArtifactCard(perm.card) && (!equipmentOnly || /\bEquipment\b/i.test(typeLine(perm.card))))
        : (isCreatureCard(perm.card) || (allowPw && isPlaneswalkerCard(perm.card)) || (allowArtifact && isArtifactCard(perm.card)));
      if (!copiable) continue;
      if (mvCap != null && manaValueOfCard(perm.card) > mvCap) continue; // CR 707 head MV filter
      out.push({ id: perm.id, name: perm.card?.name });
    }
  }
  return out;
}

/** Append a creature SUBtype to a type line "in addition to its other types" (CR 707.9). Inserts a
 *  "— Subtypes" section if there's no dash, else appends (idempotent — never duplicates). */
function addSubtypeToLine(line, subtype) {
  const l = String(line || "");
  const re = new RegExp("\\b" + escapeRegex(subtype) + "\\b", "i");
  if (re.test(l)) return l; // already a subtype of the copy
  if (l.includes("—")) return l.replace(/\s*$/, "") + " " + subtype;
  return (l.trim() + " — " + subtype).trim();
}

/** PREPEND a card TYPE (Artifact/Enchantment/…) to a type line "in addition to its other types"
 *  (CR 707.9a — Vaultborn Tyrant: "…except it's an artifact in addition to its other types"). A card type
 *  lives to the LEFT of the "—" (before the subtypes), so "Creature — Dinosaur" → "Artifact Creature —
 *  Dinosaur"; a line with no dash simply prepends. Idempotent (never duplicates a type it already carries).
 *  Distinct from addSubtypeToLine (which appends a creature SUBtype after the dash). */
function addCardTypeToLine(line, cardType) {
  const l = String(line || "");
  const re = new RegExp("\\b" + escapeRegex(cardType) + "\\b", "i");
  if (re.test(l)) return l; // already this card type
  return (cardType + " " + l.trim()).trim();
}

/**
 * The copiable card a clone takes from its source (CR 707.2): the source's CURRENT card
 * (printed, or itself a copy — "copy the copy" works because a clone's card is already the
 * copied card), as a fresh object carrying the CLONE's own id (so two battlefield cards never
 * share one) and NEVER flagged a token (a copy of a token is a real object, CR 707.10a). Counters
 * and continuous effects are excluded automatically (they live on the permanent, not the card).
 *
 * `riders` (from the clone's "except …" clause, CR 707.9 / 707.9a) modify the snapshot so the copy
 * is the WHOLE card: add-subtype edits the type line; grant-keyword adds to the card's `keywords`
 * array (layers' printedKeywords seeds from it — a granted instance behaves like a printed one);
 * set-P/T overwrites base power/toughness; grant-vanishing appends the keyword (only when the copy
 * doesn't already have vanishing — the conditional), so the ETB time-counter add + the upkeep
 * remove-or-sacrifice (fading.js, keyed off the card's oracle) run for free.
 */
export function snapshotCopiedCard(sourcePerm, cloneCard, riders = []) {
  // A copy of a commander is NOT a commander (CR 903.3 — the designation is on the original card, not a
  // characteristic that copies). Strip isCommander like token, so a clone never inherits the designation.
  let card = { ...sourcePerm.card, id: cloneCard?.id, token: false, isCommander: false, commanderInstanceId: undefined };
  for (const r of riders || []) {
    if (r.kind === "addType") {
      card = { ...card, type: addSubtypeToLine(card.type || card.type_line, r.subtype) };
      if (card.type_line) card.type_line = addSubtypeToLine(card.type_line, r.subtype);
    } else if (r.kind === "addCardType") {
      // CR 707.9a — a CARD-TYPE addition ("…it's an artifact in addition to its other types", Vaultborn
      // Tyrant). The type goes to the LEFT of the "—", so the copy genuinely IS that card type (an
      // artifact/enchantment) for every type-line read (the artifact-scoped batch combat gate, artifact-
      // matters triggers). NOT a subtype append.
      card = { ...card, type: addCardTypeToLine(card.type || card.type_line, r.cardType) };
      if (card.type_line) card.type_line = addCardTypeToLine(card.type_line, r.cardType);
    } else if (r.kind === "addKeyword") {
      const have = Array.isArray(card.keywords) ? card.keywords.map((k) => String(k).toLowerCase()) : [];
      const add = r.keywords.filter((k) => !have.includes(k));
      card = { ...card, keywords: [...(Array.isArray(card.keywords) ? card.keywords : []), ...add] };
    } else if (r.kind === "setPT") {
      card = { ...card, power: r.power, toughness: r.toughness };
    } else if (r.kind === "setName") {
      // NAME RIDER (CR 707.9a) — "except its name is <X>". The copy keeps the copying card's OWN name
      // (Sarkhan, Soul Aflame; Impossible Man; Hulkling). NOT cosmetic: names are read by name-matching
      // effects and the legend rule, and the "another creature named ~" self-exclusions that several
      // clone-adjacent cards carry.
      //
      // ⚠️ CASING: parseCloneRider lowercases its input to match, so `r.name` is lowercase and
      // title-casing it back is lossy ("Scion of the Ur-Dragon" → "Scion Of The Ur-Dragon"). The rider
      // always restates the COPYING CARD'S OWN name, so prefer that card's real printed name — exact, not
      // reconstructed. Fall back to the parsed text if the two ever disagree, rather than silently
      // stamping a name the rider did not ask for.
      // `selfName` (the elided `~` form, which is what a printed card actually produces) resolves against
      // the COPYING CARD outright. A spelled-out name prefers that card too when the two agree, purely for
      // its exact printed casing; otherwise the RIDER TEXT wins, so a disagreement never stamps a name the
      // card did not ask for. With no cloneCard there is nothing to resolve `~` against, so the copied name
      // stands rather than a literal "~".
      const printed = cloneCard?.name;
      if (r.selfName) { if (printed) card = { ...card, name: printed }; }
      else card = { ...card, name: (printed && String(printed).toLowerCase() === r.name) ? printed : r.name };
    } else if (r.kind === "grantVanishing") {
      // Conditional: only grant when the copied creature doesn't ALREADY have vanishing (CR 702.63a /
      // 707.9a). Append "Vanishing N" to the oracle (keyword-position) so fading.js sees it both at ETB
      // (entersWithFadeCounters) and each upkeep (applyFadeVanishUpkeep). Idempotent on the keyword.
      const oracle = String(card.oracle || card.oracle_text || "");
      if (!/(?:^|\n|, |; )vanishing\s+\d+/i.test(oracle)) {
        card = { ...card, oracle: (oracle ? oracle.replace(/\s*$/, "") + "\n" : "") + "Vanishing " + r.n };
      }
    } else if (r.kind === "grantTrigger") {
      // GRANT A BECOMES-TARGET SAC TRIGGER (Phantasmal Image, CR 707.9a + 603.2) — append the granted trigger's
      // canonical oracle line ("When this creature becomes the target of a spell or ability, sacrifice it.") to
      // the copy's oracle, so detectTriggers reads it exactly like a printed instance and the becomes-target event
      // (checkBecomesTargetTriggers) fires it on the copy at every target-choice site. "this creature" binds to the
      // copy (the trigger's source). Idempotent — never duplicates a line the copied creature already carries
      // (an Illusion copied by Phantasmal Image already has it). Appended AFTER the type/keyword riders so the
      // Illusion add-type is already applied; the copy is then the WHOLE card (all riders), never a partial.
      const oracle = String(card.oracle || card.oracle_text || "");
      const line = String(r.oracle || "").trim();
      if (line && !oracle.includes(line)) {
        card = { ...card, oracle: (oracle ? oracle.replace(/\s*$/, "") + "\n" : "") + line };
      }
    } else if (r.kind === "retainOwnAbilities") {
      // "it has ~'s other abilities" (Sakashima, CR 707.9) — the copy ALSO KEEPS the clone's own abilities.
      // Append the clone's own-ability oracle lines to the copy's oracle and union its own keywords onto the
      // copy's keyword array, so the copy carries them as printed instances. These own abilities are the
      // modeled inert set (legend-rule-off static, Partner) parseCloneSpec verified — no ETB trigger, no
      // battlefield behavior — so appending them mints the WHOLE copy, never a partial. Idempotent per line.
      const oracle = String(card.oracle || card.oracle_text || "");
      const addLines = String(r.oracle || "").split("\n").map((l) => l.trim()).filter(Boolean)
        .filter((l) => !oracle.includes(l));
      if (addLines.length) {
        card = { ...card, oracle: (oracle ? oracle.replace(/\s*$/, "") + "\n" : "") + addLines.join("\n") };
      }
      const ownKws = Array.isArray(r.keywords) ? r.keywords : [];
      if (ownKws.length) {
        const have = Array.isArray(card.keywords) ? card.keywords.map((k) => String(k).toLowerCase()) : [];
        const add = ownKws.filter((k) => !have.includes(String(k).toLowerCase()));
        if (add.length) card = { ...card, keywords: [...(Array.isArray(card.keywords) ? card.keywords : []), ...add] };
      }
    }
  }
  return card;
}

const ptScore = (card) => (Number(card?.power) || 0) + (Number(card?.toughness) || 0);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Deterministically auto-pick the best creature to copy (Expert autopilot + opponents — no
 * picker shown): the highest printed power+toughness, locale-free tie-break by name then id
 * (serialize-stable). Returns a permanent id, or null when there's no candidate (the clone then
 * enters as itself → a 0/0 → dies). Uses PRINTED P/T (a leaf read, no layer engine) — a sensible,
 * deterministic heuristic; the player's own clone surfaces an interactive picker instead.
 */
export function autoPickCloneCandidate(state, pendingChoice) {
  const cands = (pendingChoice?.candidates || [])
    .map((c) => ({ ...c, perm: findPermanent(state, c.id)?.permanent }))
    .filter((c) => c.perm);
  if (cands.length === 0) return null;
  return [...cands].sort((a, b) =>
    ptScore(b.perm.card) - ptScore(a.perm.card) ||
    cmp(String(a.name || ""), String(b.name || "")) ||
    cmp(String(a.id || ""), String(b.id || "")),
  )[0].id;
}
