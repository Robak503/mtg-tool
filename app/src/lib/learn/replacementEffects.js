/**
 * replacementEffects.js — counter & token DOUBLING replacement effects (Wave 3, brief #6).
 *
 * THE WAVE-3 PREREQUISITE + the brief's #1 false-positive risk. Doublers replace a counter-placement or
 * token-creation event with a larger one (CR 616). This is a LEAF module (mirrors cardEffects.js): pure
 * functions over `state`, importing NOTHING from the engine — so gameState.js / resolvers.js / tokens.js /
 * amass.js can all import it without a cycle. Detection is by ANCHORED oracle-clause matchers (not card
 * name), so a functional reprint with the same clause is covered, and an unrelated card is not.
 *
 * The two replaced event families:
 *   - COUNTER additions: "twice that many" (multiplicative x2 — Doubling Season, Branching Evolution,
 *     Corpsejack, Primal Vigor, Vorinclex) or "that many plus one" (additive +1 — Hardened Scales). The
 *     controller of the affected permanent orders multiple replacements (CR 616.1e) → the sim plays to win:
 *     ALL additives first, THEN ALL multiplicatives (base 1 + Hardened Scales + Primal Vigor = (1+1)*2 = 4).
 *     Two x2 stack to x4. A "+1/+1" doubler only affects +1/+1 counters; a generic "counters" doubler (Doubling
 *     Season / Vorinclex) affects any counter kind. Vorinclex ALSO halves (floor) counters on an opponent's
 *     permanent.
 *   - TOKEN creation: "twice that many ... tokens" (Doubling Season, Parallel Lives, Anointed Procession,
 *     Primal Vigor, Mondrak) → tokenMultiplier = 2^k.
 *
 * SCOPE: most doublers are "you control" (apply only to a recipient the doubler's controller controls);
 * Primal Vigor is GLOBAL (every player); Vorinclex doubles its controller's and halves opponents'. We never
 * double an opponent's counters/tokens for a "you" doubler (the forbidden FP). FFA pods → any two distinct
 * players are opponents.
 *
 * RECURSION: the multiplier is computed ONCE and applied to the count/amount at the put/create event — never
 * a post-event "add more" (that would double-fire ETB/dies and break CR 616 once-per-event semantics), and a
 * doubler-created token is just minted (no re-entry into the multiply path).
 */

function oracleOf(card) {
  return String(card?.oracle ?? card?.oracle_text ?? card?.text ?? "").toLowerCase();
}

// A doubler's RECIPIENT must be GENERIC (the noun right after the determiner is creature/permanent/artifact/…),
// never a subtype list. A "you"-scoped doubler whose recipient is a subtype ("an Army, Goblin, or Orc you
// control" — Mauhúr) would otherwise over-apply to EVERY permanent the controller has, since the runtime layer
// only tracks the controller, not the recipient's subtype — a forbidden over-fire. Requiring a generic recipient
// drops the counter profile for such cards (FN-safe: the runtime never over-fires, and the card stays non-native).
const RECIPIENT_GENERIC = /\bon (?:a|an|each|any|that|another)\s+(?:(?:nontoken|target|other)\s+)*(?:creature|permanent|artifact|planeswalker|enchantment|land|battle|player|spacecraft|planet)\b/;

/**
 * Classify a single permanent's card into its doubler profile, or null. Parses by sentence so a card with
 * BOTH a counter clause and a token clause (Doubling Season / Primal Vigor / Vorinclex) is captured fully.
 * Returns { counter: {op, factor, kind, scope}|null, halvesOpponents: bool, token: {factor, scope}|null,
 *   tokenAdd: {filter, additive, scope}|null }.
 *   - counter.op: "multiply" (factor 2) | "additive" (factor is the +N, e.g. 1)
 *   - counter.kind: "+1/+1" (only +1/+1 counters) | "any" (any counter type)
 *   - token: MULTIPLICATIVE doubler (×2^k over all token kinds — Doubling Season / Mondrak)
 *   - tokenAdd: ADDITIVE, kind-FILTERED bonus (+N of a specific token — Xorn = +1 Treasure)
 *   - scope: "you" | "global"
 */
export function doublerProfile(card) {
  const o = oracleOf(card);
  if (!o) return null;
  // CLASS doublers are LEVEL-gated (Innkeeper's Talent: the doubling is its Level-3 ability). The runtime layer
  // can't track Class levels, so an always-on doubler would over-apply from Level 1 — a forbidden FP. Skip the
  // whole card (FN-safe: under-model the rare Class doubler rather than mis-resolve every counter while it's
  // under-leveled).
  const type = String(card?.type ?? card?.type_line ?? "").toLowerCase();
  if (/\bclass\b/.test(type)) return null;
  let counter = null;
  let token = null;
  let tokenAdd = null;
  let halvesOpponents = false;
  for (const raw of o.split(".")) {
    const s = raw.trim();
    if (!s) continue;
    // Temporal/date-gated clause (Hosting Season Secret Lair "While it's October …") — the layer can't evaluate
    // the calendar gate, so applying the doubler unconditionally is an FP. Skip the sentence (FN-safe).
    if (/while it'?s /.test(s)) continue;
    // Counter-placement clause — both PASSIVE ("[+1/+1] counters would be put on …", Branching Evolution /
    // Hardened Scales / Primal Vigor / Corpsejack) and ACTIVE ("[you] would put one or more counters on …",
    // Doubling Season / Vorinclex).
    const counterPut = /counters? would be put on/.test(s) || /would put (?:one or more )?counters? on/.test(s);
    // Token-creation clause — ACTIVE ("[would] create one or more tokens", Doubling Season / Parallel Lives /
    // Anointed Procession) and PASSIVE ("one or more tokens would be created", Primal Vigor / Mondrak).
    const tokenCreate = /(?:create|creates) one or more tokens?/.test(s) || /one or more tokens? would be created/.test(s);
    if (counterPut) {
      // Vorinclex's opponent clause HALVES (round down) counters put on an opponent's permanent/player.
      if (/(an opponent would put|an opponent controls)/.test(s) && /half that many/.test(s)) {
        halvesOpponents = true;
      } else {
        const kind = /\+1\/\+1 counters?/.test(s) ? "+1/+1" : "any";
        // SCOPE — must be EXPLICIT, never a blind "else global":
        //  • you-scope: "you control" / "you would put" / "your team controls" (Pir — this engine has NO
        //    teammates in 1v1/FFA, so "your team" == you; without this Pir's +1 leaked onto opponents).
        //  • global: ONLY a genuinely generic recipient ("on a/each/any creature|permanent|planeswalker|
        //    player|spacecraft|planet", e.g. Primal Vigor "put on a creature").
        //  • neither → a SELF-NAME recipient ("would be put on Mowu") or other restricted form. Modeling that
        //    as global would leak the doubler onto EVERY player (Mowu's +1 hitting all counters) — a forbidden
        //    FP. Leave scope null → no counter profile (FN-safe: a self-only doubler is under-modeled, never
        //    over-applied).
        let scope = null;
        // "you" scope requires a GENERIC recipient (RECIPIENT_GENERIC) — a subtype-restricted recipient
        // ("Army, Goblin, or Orc you control") would over-fire onto every permanent you control.
        if (RECIPIENT_GENERIC.test(s) && (/you control/.test(s) || /you would put/.test(s) || /your team controls?/.test(s))) scope = "you";
        else if (/\b(?:put on|on) (?:a|an|each|any|that) (?:creature|permanent|planeswalker|player|spacecraft|planet)\b/.test(s)) scope = "global";
        if (scope) {
          if (/twice that many/.test(s)) counter = { op: "multiply", factor: 2, kind, scope };
          else if (/that many plus (one|1)/.test(s)) counter = { op: "additive", factor: 1, kind, scope };
        }
      }
    }
    if (tokenCreate && /twice that many/.test(s)) {
      token = { factor: 2, scope: /under your control|you control/.test(s) ? "you" : "global" };
    }
    // ── TOKEN-ADDITIVE (Xorn, CR 614) — a NARROWER token-count replacement: "If you would create one or more
    // <Kind> tokens, instead create those tokens plus an additional <Kind> token." Not a ×2 multiply — a FIXED
    // +1 of a SPECIFIC token kind (Xorn = Treasure). Distinct field from `token` (the multiplicative doubler) so
    // tokenMultiplier stays byte-identical. Anchored to the exact "create one or more <Kind> … plus an additional
    // <Kind>" template. Only Treasure is minted as a MODELED named token (NAMED_TOKENS), so we admit ONLY the
    // Treasure filter — any other kind (a hypothetical "additional Clue") would still route through
    // applyCreateNamedToken and could be added later, but is left unmodeled here (FN-safe: no over-mint). The
    // "you" scope is intrinsic to the template ("If YOU would create …"); a minted Treasure is never itself a
    // Xorn, so this cannot recurse. If the two <Kind>s in the clause disagree, no profile (defensive).
    const addM = s.match(/if you would create one or more (treasure) tokens?,? instead create those tokens plus an additional (treasure) token/);
    if (addM && addM[1] === addM[2]) {
      tokenAdd = { filter: addM[1], additive: 1, scope: "you" };
    }
  }
  if (!counter && !token && !tokenAdd && !halvesOpponents) return null;
  return { counter, token, tokenAdd, halvesOpponents };
}

/**
 * COVERAGE (metric): is this card a PURE doubler — a replacement-static Enchantment whose ENTIRE text is
 * doubling clauses (Doubling Season, Parallel Lives, Anointed Procession, Branching Evolution, Primal Vigor)?
 * Those flip native-static (the runtime doubling fully models them). A doubler on a CREATURE / PLANESWALKER /
 * with an ACTIVATED ability (Mondrak, Vorinclex, Corpsejack) has an unmodeled body and stays NON-NATIVE
 * (CREED whole-card) — excluded here. Conservative: requires an Enchantment-only type AND every non-reminder
 * sentence to be a doubling clause (any other ability → not pure → body-only).
 */
export function isPureDoubler(card) {
  if (!doublerProfile(card)) return false;
  const type = String(card?.type ?? card?.type_line ?? "").toLowerCase();
  if (!/\benchantment\b/.test(type)) return false;
  if (/\bcreature\b|\bplaneswalker\b|\bartifact\b/.test(type)) return false;
  const o = oracleOf(card).replace(/\([^)]*\)/g, " "); // strip reminder text
  for (const raw of o.split(".")) {
    const s = raw.trim();
    if (!s) continue;
    const counterClause = (/counters? would be put on/.test(s) || /would put (?:one or more )?counters? on/.test(s)) &&
      (/twice that many/.test(s) || /that many plus (one|1)/.test(s) || /half that many/.test(s));
    const tokenClause = (/(?:create|creates) one or more tokens?/.test(s) || /one or more tokens? would be created/.test(s)) &&
      /twice that many/.test(s);
    if (!counterClause && !tokenClause) return false; // an unmodeled non-doubling sentence → not a pure doubler
  }
  return true;
}

/**
 * Is sentence `s` (already lowercased) a doubler clause the runtime MODELS? SINGLE SOURCE OF TRUTH shared with
 * the coverage residue-strip so "what we strip from the card for the whole-card check" can never drift from
 * "what the runtime actually applies". Mirrors doublerProfile's clause logic: the your-side counter multiply/
 * additive (generic recipient + you/global scope), the Vorinclex opponent-counter HALVE, and the token-creation
 * doubler. A token-HALVE (Halving Season "an opponent would create … half that many … tokens") is NOT modeled
 * (tokenMultiplier has no halving) → returns false → the clause is NOT stripped → the card stays non-native.
 */
export function isModeledDoublerSentence(s) {
  const counterPut = /counters? would be put on/.test(s) || /would put (?:one or more )?counters? on/.test(s);
  if (counterPut) {
    if (/(an opponent would put|an opponent controls)/.test(s) && /half that many/.test(s)) return true; // opponent counter-halve
    if (/twice that many/.test(s) || /that many plus (one|1)/.test(s)) {
      const youScope = RECIPIENT_GENERIC.test(s) && (/you control/.test(s) || /you would put/.test(s) || /your team controls?/.test(s));
      const globalScope = /\b(?:put on|on) (?:a|an|each|any|that) (?:creature|permanent|planeswalker|player|spacecraft|planet)\b/.test(s);
      return youScope || globalScope;
    }
  }
  if ((/(?:create|creates) one or more tokens?/.test(s) || /one or more tokens? would be created/.test(s)) && /twice that many/.test(s)) return true;
  // TOKEN-ADDITIVE (Xorn) — the exact Treasure "+1 additional" replacement the runtime applies (tokenAdditive).
  // Only the Treasure filter is modeled (Treasure is the only MODELED named token an additive can mint); a
  // hypothetical "additional Clue" is NOT matched here → its clause survives as residue → card stays non-native.
  if (/if you would create one or more treasure tokens?,? instead create those tokens plus an additional treasure token/.test(s)) return true;
  return false;
}

/**
 * Strip every MODELED doubler sentence from `oracle`, IN PLACE, for the coverage whole-card residue check.
 * Removes ONLY the doubler sentence(s), preserving every other character/structure — crucially the reminder-text
 * parentheticals (a split-and-rejoin reflow mangles "(… . … .)" and breaks downstream reminder-stripping, which
 * over-permits the residue check — e.g. Solid Ground's earthbend reminder). Each `…sentence.` is tested by
 * isModeledDoublerSentence; a match is excised (its leading separator kept), everything else passes through
 * untouched. Only removes what the runtime applies — an unmodeled doubler-shaped clause (token-halve) survives
 * as residue, keeping its card off the native tier (CREED).
 */
export function stripModeledDoublerClauses(oracle) {
  return String(oracle || "").replace(
    /(^|[\n.]\s*)([^.\n]*\.)/g,
    (m, sep, sentence) => (isModeledDoublerSentence(sentence.trim().toLowerCase()) ? sep : m),
  );
}

/** Every (ownerId, profile) doubler permanent across ALL battlefields. */
function allDoublers(state) {
  const out = [];
  for (const pid of Object.keys(state?.players || {})) {
    for (const perm of state.players[pid].battlefield || []) {
      const profile = doublerProfile(perm.card);
      if (profile) out.push({ ownerId: pid, profile });
    }
  }
  return out;
}

/** A counter doubler applies to a recipient when it is global, or "you" and the owner controls the recipient. */
function counterDoublerApplies(d, ownerId, recipientId) {
  if (!d) return false;
  return d.scope === "global" || ownerId === recipientId;
}

/**
 * The final counter amount put on `recipientControllerId`'s permanent after all doublers, given a base amount
 * and the counter TYPE being added (e.g. "+1/+1", "loyalty", "rad"). CR 616.1e greedy-max ordering: additives
 * first, then multiplicatives; then a Vorinclex opponent-halve (floor) last (the affected player orders to
 * maximize, so doubling-then-halving beats halving-then-doubling). Floors at 0. A "+1/+1"-only doubler is
 * skipped for any non-"+1/+1" counter type.
 */
export function applyCounterDoubling(state, recipientControllerId, counterType, baseAmount) {
  const base = Math.max(0, Number(baseAmount) || 0);
  if (base === 0) return 0;
  let additive = 0;
  let multiplier = 1;
  let halve = false;
  for (const { ownerId, profile } of allDoublers(state)) {
    const c = profile.counter;
    if (c && (c.kind !== "+1/+1" || counterType === "+1/+1") && counterDoublerApplies(c, ownerId, recipientControllerId)) {
      if (c.op === "additive") additive += c.factor;
      else multiplier *= c.factor;
    }
    // Vorinclex: halve counters placed on a permanent controlled by an opponent of the Vorinclex controller.
    if (profile.halvesOpponents && ownerId !== recipientControllerId) halve = true;
  }
  let amount = (base + additive) * multiplier;
  if (halve) amount = Math.floor(amount / 2);
  return Math.max(0, amount);
}

/**
 * The token-count multiplier for tokens created under `recipientControllerId`'s control: 2^k over the token
 * doublers that apply (global, or "you" owned by the recipient). Recursion-safe — applied once to the count.
 */
export function tokenMultiplier(state, recipientControllerId) {
  let mult = 1;
  for (const { ownerId, profile } of allDoublers(state)) {
    const t = profile.token;
    if (t && (t.scope === "global" || ownerId === recipientControllerId)) mult *= t.factor;
  }
  return mult;
}

/**
 * The ADDITIVE token bonus (Xorn, CR 614) for tokens of `tokenName` (e.g. "treasure") created under
 * `recipientControllerId`'s control: the sum of every tokenAdd.additive over the applicable additive-token
 * replacements (scope "you" → owned by the recipient; "global" reserved, none printed). The bonus is added ONCE
 * PER CREATION EVENT (Xorn = "plus AN additional Treasure", one extra regardless of the base count), so the
 * caller applies it to the whole batch, not per-token. `tokenName` is compared case-insensitively against the
 * profile's `filter`; a non-matching token kind (a Clue when only a Treasure-additive is out) gets 0. Two Xorns
 * stack additively (+2). Pure; a minted Treasure is never itself an additive source, so this cannot recurse.
 */
export function tokenAdditive(state, recipientControllerId, tokenName) {
  const kind = String(tokenName || "").toLowerCase();
  if (!kind) return 0;
  let add = 0;
  for (const { ownerId, profile } of allDoublers(state)) {
    const ta = profile.tokenAdd;
    if (ta && ta.filter === kind && (ta.scope === "global" || ownerId === recipientControllerId)) add += ta.additive;
  }
  return add;
}

// ─── MANA-MULTIPLIER — "If you tap a permanent for mana, it produces N times as much" (CR 605.1b/616) ──────
//
// A REPLACEMENT effect on mana PRODUCTION: when the controller TAPS a permanent for mana, the amount of that
// mana is multiplied. Mana Reflection ("twice as much", ×2) and Nyxbloom Ancient ("three times as much", ×3)
// are the only two real cards with this exact template. Detection is by ANCHORED clause (not card name) so a
// functional reprint is covered. A LEAF helper (this whole module imports nothing from the engine), consumed
// by manaModel.manaSources at the tap site.
//
// SCOPE — "If YOU tap a permanent for mana": the effect belongs to the doubler's CONTROLLER and multiplies
// the mana THEY produce by tapping. So manaMultiplier(state, playerId) is the product of every factor over
// the multiplier permanents PLAYER controls — never an opponent's (the forbidden FP). Two stack
// multiplicatively (Mana Reflection + Nyxbloom = ×6), exactly like two token doublers.
//
// TAP-ONLY (CR 605 ruling, Gatherer): the effect replaces mana from "tapping a permanent for mana". A
// sac-for-mana source (Treasure / Gold / Eldrazi Spawn — "Sacrifice this: Add …", NO {T}) is NOT tapped for
// mana, so it is NOT multiplied. manaModel applies this only to a source whose ability requires tapping
// (`requiresTap`), never to a `sacrifices` one-shot. FN-safe: a non-tap source is under-counted (its base
// amount), never over-produced.

/**
 * The mana-multiplier factor a card contributes, or null. Returns `{ factor }`:
 *   "If you tap a permanent for mana, it produces twice as much of that mana instead."  → { factor: 2 }
 *   "… it produces three times as much of that mana instead."                            → { factor: 3 }
 * Anchored to the exact "tap a permanent for mana" + "N times as much" template. "you" scope is intrinsic to
 * the template ("If YOU tap …"), so there's no global/opponent variant to model. Any other multiplier word
 * (none appears on a real card) → null (FN-safe: an unrecognized factor is never fabricated).
 */
const MANA_MULT_WORD = { twice: 2, "two times": 2, "three times": 3, "four times": 4 };
export function manaMultiplierProfile(card) {
  const o = oracleOf(card);
  if (!o) return null;
  // Must be the controller-scoped tap-for-mana replacement: "if you tap a permanent for mana, it produces
  // <N> as much of that mana instead". Capture the multiplier word and map it; an unmapped word → null.
  const m = o.match(/if you tap a permanent for mana, it produces (twice|two times|three times|four times) as much of that mana instead/);
  if (!m) return null;
  const factor = MANA_MULT_WORD[m[1]];
  return factor ? { factor } : null;
}

/**
 * The TAP-for-mana multiplier for mana `controllerId` produces by tapping: the product of every
 * manaMultiplierProfile factor over the permanents `controllerId` controls (×1 with none, ×2 Mana
 * Reflection, ×3 Nyxbloom, ×6 both). Controller-scoped — an opponent's Mana Reflection never multiplies
 * `controllerId`'s mana. Pure; applied ONCE to a source's produced amount at the tap site (manaSources).
 */
export function manaMultiplier(state, controllerId) {
  let mult = 1;
  for (const perm of state?.players?.[controllerId]?.battlefield || []) {
    const p = manaMultiplierProfile(perm.card);
    if (p) mult *= p.factor;
  }
  return mult;
}

/**
 * COVERAGE (whole-card residue): is sentence `s` (already lowercased) the MODELED mana-multiplier clause?
 * SINGLE SOURCE OF TRUTH shared with the coverage residue-strip (mirrors isModeledDoublerSentence) so "what
 * we strip for the whole-card check" can't drift from "what the runtime applies". Only the exact
 * controller-scoped tap-for-mana template the runtime multiplies returns true.
 */
export function isModeledManaMultiplierSentence(s) {
  return /if you tap a permanent for mana, it produces (?:twice|two times|three times|four times) as much of that mana instead/.test(s);
}

/**
 * Strip the MODELED mana-multiplier sentence from `oracle` for the coverage whole-card residue check (mirrors
 * stripModeledDoublerClauses). Removes ONLY that sentence, preserving everything else (incl. reminder-text
 * parentheticals). An unmodeled multiplier-shaped clause survives as residue → keeps its card off the native
 * tier (CREED).
 */
export function stripModeledManaMultiplierClauses(oracle) {
  return String(oracle || "").replace(
    /(^|[\n.]\s*)([^.\n]*\.)/g,
    (m, sep, sentence) => (isModeledManaMultiplierSentence(sentence.trim().toLowerCase()) ? sep : m),
  );
}
