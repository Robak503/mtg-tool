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

function stripReminder(text) {
  return String(text || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Modeled combat/keyword grants for the "it has <kw>" rider AND the printed pre-copy keyword line.
// RESTRICTED to keywords the layer engine actually enforces and can GRANT (keywords.GRANTABLE…),
// so granting one to a copy behaves EXACTLY like a printed instance — never a fake ability. Kept
// as a local literal (a tiny, stable set) so this leaf doesn't import the keywords module.
const RIDER_KEYWORDS = new Set([
  "flying", "reach", "first strike", "double strike", "trample", "deathtouch",
  "lifelink", "vigilance", "menace", "haste",
]);
// Creature SUBtypes only — a card-type/supertype change ("it's an artifact…", "it's legendary…")
// has runtime/zone implications the copy snapshot doesn't model, so those route to the Arbiter.
const CARD_TYPES_SUPERTYPES = /\b(?:artifact|enchantment|creature|land|planeswalker|battle|instant|sorcery|legendary|basic|snow|world|tribal|kindred)\b/;

/**
 * Parse ONE "except …" rider sub-clause into a modeled atom, or null (= unmodeled → the whole
 * clone routes to the Arbiter). The clause is reminder-stripped, lowercased, name elided to `~`,
 * leading "and "/trailing "." removed. Atoms (CR 707.9 / 707.9a copy modifications):
 *   { kind: "addType", subtype }     — "it's a Bird in addition to its other types"
 *   { kind: "addKeyword", keywords } — "it has flying" / "it has flying and vigilance" (modeled kws only)
 *   { kind: "setPT", power, toughness } — "it's 7/7"
 *   { kind: "grantVanishing", n }    — "it has vanishing 3 if that creature doesn't have vanishing"
 */
export function parseCloneRider(clause) {
  // Lowercase so a directly-called rider (mixed-case "Bird") parses the same as the spec-level path
  // (which lowercases the whole oracle first). Subtype words are re-capitalized on the way out.
  let cl = String(clause || "").toLowerCase().trim().replace(/^and\s+/, "").replace(/\.$/, "").trim();
  if (!cl) return null;

  // "it isn't legendary" (Spark Double) — a NO-OP rider (the legend rule is unenforced by the engine), so it
  // carries no atom field but IS recognized (returning a no-op kind) so the all-or-nothing rider gate doesn't
  // park the whole clone over an unenforced-but-harmless modification. Mirrors the tokenCopy isn't-legendary
  // no-op exactly. Distinct from "it's legendary in addition …" (Sakashima), which ADDS a supertype + pairs
  // with an unmodeled granted-ability rider — that card parks (it never reaches a clean rider list here).
  if (/^it (?:isn'?t|is not) legendary$|^it'?s not legendary$/.test(cl)) return { kind: "noop" };

  // "it's N/N" — a copy that sets base P/T (Quicksilver Gargantuan). CR 707.9.
  let m = cl.match(/^it'?s (\d+)\/(\d+)$/);
  if (m) return { kind: "setPT", power: parseInt(m[1], 10), toughness: parseInt(m[2], 10) };

  // "it has vanishing N if that creature doesn't have vanishing" (Flesh Duplicate). CR 707.9a + 702.63a.
  m = cl.match(/^it has vanishing (\d+) if that creature doesn'?t have vanishing$/);
  if (m) return { kind: "grantVanishing", n: parseInt(m[1], 10) };

  // CONDITIONAL ENTERS-WITH-COUNTER (Spark Double, CR 707.9a + 614.1c + 122.6a) — "it enters with an
  // additional +1/+1 counter on it if it's a creature" / "it enters with an additional loyalty counter on it
  // if it's a planeswalker". A REPLACEMENT that adds ONE counter to the ENTERING PERMANENT (counters live on
  // the permanent, not the copiable card), GATED on the copy's resulting card type — so it's applied by the
  // clone-resolution path (resolveCloneChoice), which knows the copied card, NOT by snapshotCopiedCard.
  // Anchored to exactly the +1/+1-if-creature and loyalty-if-planeswalker shapes (a literal singular counter).
  m = cl.match(/^it enters with an additional (\+1\/\+1|loyalty) counter on it if it'?s an? (creature|planeswalker)$/);
  if (m) return { kind: "entersWithCounterIf", counterType: m[1], n: 1, ifType: m[2] };

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
export function parseCloneSpec(card) {
  let t = stripReminder(card?.oracle || card?.oracle_text || "").toLowerCase();
  const name = card?.name ? escapeRegex(String(card.name).toLowerCase()) : null;
  if (name) t = t.replace(new RegExp(name, "g"), "~");
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
  const m = t.match(
    /^(?:you may have (?:~|this creature) enter|(?:~|this creature) enters?)(?: the battlefield)? as a copy of (any creature on the battlefield|a creature you control|a creature or planeswalker you control)( with mana value less than or equal to the amount of mana spent to cast this creature)?(?:, except (.+?))?\.?$/,
  );
  if (!m) return null;

  let riders = [];
  if (m[3]) {
    // Split the rider clause into sub-clauses on ", and " / ", " / " and ", parse each. ANY
    // unmodeled sub-clause fails the whole card (CREED: whole copy or nothing).
    const subs = m[3].split(/,\s*and\s+|,\s+|\s+and\s+/).map((s) => s.trim()).filter(Boolean);
    for (const s of subs) {
      const atom = parseCloneRider(s);
      if (!atom) return null;
      riders.push(atom);
    }
  }
  return {
    optional: /^you may\b/.test(t),
    scope: m[1] === "a creature you control" ? "youControl"
      : m[1] === "a creature or planeswalker you control" ? "youControlCreatureOrPw"
        : "any",
    mvLimit: !!m[2],
    riders,
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
  return /Creature/.test(typeLine(card)) && parseCloneSpec(card) !== null;
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
 */
export function cloneCandidates(state, controller, scope, mvCap = null) {
  const out = [];
  const youControlOnly = scope === "youControl" || scope === "youControlCreatureOrPw";
  const allowPw = scope === "youControlCreatureOrPw";
  for (const pid of Object.keys(state.players)) {
    if (youControlOnly && pid !== controller) continue;
    for (const perm of state.players[pid].battlefield) {
      const copiable = isCreatureCard(perm.card) || (allowPw && isPlaneswalkerCard(perm.card));
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
    } else if (r.kind === "grantVanishing") {
      // Conditional: only grant when the copied creature doesn't ALREADY have vanishing (CR 702.63a /
      // 707.9a). Append "Vanishing N" to the oracle (keyword-position) so fading.js sees it both at ETB
      // (entersWithFadeCounters) and each upkeep (applyFadeVanishUpkeep). Idempotent on the keyword.
      const oracle = String(card.oracle || card.oracle_text || "");
      if (!/(?:^|\n|, |; )vanishing\s+\d+/i.test(oracle)) {
        card = { ...card, oracle: (oracle ? oracle.replace(/\s*$/, "") + "\n" : "") + "Vanishing " + r.n };
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
