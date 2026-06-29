/**
 * interveningIf.js — a STRICT board-query evaluator for triggered-ability intervening-if conditions
 * (CR 603.4). Near-LEAF: its ONLY engine import is the layer-aware `creaturePower` reader from gameState.js
 * (for the power-qualified creature query) — a deliberately one-directional edge: gameState's transitive
 * closure (ptPrimitive / layers / staticAbilityParser / protection / keywords) never imports interveningIf,
 * so no cycle is introduced and gameEngine / resolvers / coverage can still consult this without one.
 *
 * CR 603.4 — an intervening-if is checked at BOTH the trigger event (flush, before the ability goes on the
 * stack) AND on resolution. If the condition is false at either point, the ability does nothing. So the
 * evaluator is consulted twice: gameEngine.buildTriggerStack drops the trigger when the condition is false
 * at flush; resolvers.js (EFFECT_PROGRAM) re-checks at resolution. This mirrors the win-game intervening-if
 * machinery (effects/atoms/winGame.js evaluateWinThreshold) but for the GENERAL conditional-trigger family.
 *
 * STRICT, never fail-open: `evaluate` returns true/false for a condition it can read, and `null` for one
 * outside its vocabulary. `interveningIfParseable` (the pure shape check, used by the coverage metric AND
 * the flush gate) returns true ONLY for conditions `evaluate` reads — so a trigger is credited native /
 * routed natively ONLY when its condition is genuinely modeled. Everything else stays body-only / Arbiter
 * (false-negative SAFE; a mis-evaluated condition would be a forbidden FP — CREED).
 *
 * SCOPE (v1) — the controller's-board queries, which are the largest clean cluster on the corpus:
 *   "you control a/an/<N> or more <type|subtype>"         (control an artifact, two or more Gates, …)
 *   "you control a/an/<N> or more tapped/untapped <filter>" (a tapped creature, two or more tapped creatures)
 *   "you control a/an/<N> or more token(s)"               (three or more tokens)
 *   "you control no <filter>"                             (no untapped lands, no Snakes)
 *   "you control a/an/<N> or more creature(s) with power N or {greater|more}" (Colossal Majesty, Garruk's
 *      Uprising, Beastbond Outcaster) — a LAYER-AWARE power query (counters + anthems count), evaluated
 *      against creaturePower at flush AND resolution, mirroring the `powerAtLeast` count-source vocabulary.
 *   "[there are|you have] <N> or more <type> cards in your graveyard" (three or more creature cards …)
 * DEFERRED to the Arbiter (stay LOW): color/multicolored permanents, other power comparisons ("power N or
 * less", toughness), turn-event history ("a creature died this turn"), state flags (monarch, city's
 * blessing) — each a future increment.
 */

import { creaturePower } from "./gameState.js"; // layer-aware power reader (counters + anthems) — one-way edge, no cycle

// ─── cardinal vocabulary ────────────────────────────────────────────────────────
const NUM_WORD = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, twenty: 20, thirty: 30, forty: 40, fifty: 50,
};
function parseCount(token) {
  const t = String(token || "").trim().toLowerCase();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  if (Object.prototype.hasOwnProperty.call(NUM_WORD, t)) return NUM_WORD[t];
  return null;
}
const NUM_RE = "(\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty)";

function typeStr(card) {
  return String(card?.type || card?.type_line || "");
}

// Does a permanent match a parsed FILTER ({ kind, word, state, powerAtLeast })? `state` (the game state) is
// threaded only for the layer-aware power read; it's unused by the type/token/tapped gates.
function permMatchesFilter(perm, filter, state) {
  if (!perm) return false;
  // tapped/untapped state gate
  if (filter.state === "tapped" && !perm.tapped) return false;
  if (filter.state === "untapped" && perm.tapped) return false;
  // POWER gate (layer-aware: counters + anthems count, read at flush AND resolution like the powerAtLeast
  // count-source). Only stamped on a creature filter (parseFilter requires kind:"type" word:"Creature").
  if (filter.powerAtLeast != null && !(creaturePower(perm, state) >= filter.powerAtLeast)) return false;
  if (filter.kind === "all") return true;                  // "permanent(s)"
  if (filter.kind === "token") return !!(perm.token || perm.card?.token);
  // type/subtype containment: whole-word, Title-cased singular ("creatures" → \bCreature\b)
  const re = new RegExp(`\\b${filter.word}\\b`, "i");
  return re.test(typeStr(perm.card));
}

// Words that read as a "you control a <word>" filter but are NOT card types/subtypes — a DESIGNATION or
// characteristic the type line never carries, so a naive \bWord\b type-line scan would silently count 0
// and mis-evaluate the condition (a forbidden FP — e.g. "you control a commander" is your commander, not a
// "Commander"-typed permanent). Reject these → the condition stays unparseable → Arbiter (false-negative SAFE).
const NON_TYPE_WORDS = new Set(["commander", "monarch", "creature's", "spell", "card", "blessing"]);

// Parse a filter phrase ("artifacts", "tapped creatures", "tokens", "permanents", "untapped lands",
// "Gates") into { kind, word, state } — or null if it isn't a clean single-word type/subtype filter.
function parseFilter(phrase) {
  let p = String(phrase || "").trim().toLowerCase();
  let state = null;
  const sm = p.match(/^(tapped|untapped)\s+(.+)$/);
  if (sm) { state = sm[1]; p = sm[2].trim(); }
  // POWER-QUALIFIED CREATURE — "creature(s) with power N or {greater|more}" (Colossal Majesty et al). Mirrors
  // the `powerAtLeast` count-source vocabulary EXACTLY: only "creature(s)", only the "N or greater/more" form
  // (a "power N or less" / "toughness …" qualifier fails the anchor → null → Arbiter, CREED). The power is
  // read LAYER-AWARE at evaluation (permMatchesFilter → creaturePower). Combinable with a tapped/untapped state.
  const pm = p.match(/^creatures? with power (\d+) or (?:greater|more)$/);
  if (pm) return { kind: "type", word: "Creature", state, powerAtLeast: parseInt(pm[1], 10) };
  // must be a single word now (no riders like "you control", "named ...", or an unmodeled power/toughness rider)
  if (!/^[a-z]+$/.test(p)) return null;
  const singular = p.replace(/s$/, "");
  if (NON_TYPE_WORDS.has(singular) || NON_TYPE_WORDS.has(p)) return null; // a designation, not a type → Arbiter
  if (singular === "permanent") return { kind: "all", state };
  if (singular === "token") return { kind: "token", state };
  const word = singular.charAt(0).toUpperCase() + singular.slice(1); // type lines are Title-Cased
  return { kind: "type", word, state };
}

function controllerBoard(state, controllerId) {
  return state?.players?.[controllerId]?.battlefield || [];
}

// ===== SAME-NAME ETB (Guardian Project, CR 603.4 + 201.2) ====================================
// "it doesn't have the same name as another creature you control or a creature card in your graveyard"
// — a per-PERMANENT condition keyed on the entering creature (the trigger's triggeringPermanent). True
// iff NO OTHER creature you control AND NO creature card in your graveyard shares the entering creature's
// name. CR 201.2: two objects have "the same name" when they share an English name string (a nameless /
// empty-name token can't match a real card). "another creature you control" (CR 109.1 / 113.7 — "another"
// excludes the object itself) → exclude the entering permanent by id when scanning the battlefield. The
// graveyard half is a plain name+creature-card scan (the entering permanent is never in the graveyard, so
// no self-exclusion needed there). The entering permanent is supplied via `ctx.triggeringPermanentId`
// (checkEnterTriggers threads enteredPerm), resolved against the controller's battlefield.
const SAME_NAME_ETB_RE = /^it doesn't have the same name as another creature you control or a creature card in your graveyard$/;

function isCreatureCard(card) {
  return /\bcreature\b/i.test(typeStr(card));
}
// A permanent is a creature when its (layer-aware-irrelevant for this name gate) printed type line says so.
// Reading the card's type line is sufficient here: the same-name gate compares the entering creature against
// OTHER creatures — a non-creature permanent sharing the name (rare) shouldn't block the draw (CR cares about
// "another CREATURE you control"). Mirrors isCreatureCard so on-field and graveyard checks stay consistent.
function isCreaturePermLocal(perm) {
  return /\bcreature\b/i.test(typeStr(perm?.card));
}

/**
 * Evaluate an intervening-if condition for `controllerId` against `state`.
 * Returns true / false (the condition's truth) or null (outside the modeled vocabulary → caller must
 * treat as "can't confirm": the trigger does NOT route natively / does NOT fire).
 *
 * `context` (optional) carries the trigger's runtime context — notably `triggeringPermanentId`, the
 * entering permanent for an ETB trigger — needed by per-permanent conditions (the SAME-NAME ETB shape).
 * Pure board-count conditions ignore it, so existing callers (which omit it) are unaffected.
 */
export function evaluateInterveningIf(state, condition, controllerId, context = null) {
  const c = String(condition || "").toLowerCase().trim();
  if (!state?.players?.[controllerId]) return false; // controller gone → condition unmet

  // SAME-NAME ETB (Guardian Project) — needs the entering permanent from the trigger context.
  if (SAME_NAME_ETB_RE.test(c)) {
    const triggeringId = context?.triggeringPermanentId;
    if (!triggeringId) return null; // no entering permanent in context → can't confirm (FN-safe; never fail-open)
    const board = controllerBoard(state, controllerId);
    const entering = board.find((p) => p.id === triggeringId);
    // The entering permanent must be findable + named to evaluate (CR 201.2 — comparison is by name string).
    const name = entering?.card?.name ?? entering?.name;
    if (!entering || !name) return null; // can't read the entering creature's name → can't confirm (FN-safe)
    const nm = String(name).toLowerCase();
    // (a) another creature you control with the same name (exclude the entering permanent itself — "another")
    const dupOnField = board.some((p) =>
      p.id !== triggeringId && isCreaturePermLocal(p) && String(p.card?.name ?? p.name ?? "").toLowerCase() === nm);
    if (dupOnField) return false;
    // (b) a creature CARD in your graveyard with the same name
    const gy = state.players[controllerId].graveyard || [];
    const dupInGy = gy.some((card) => isCreatureCard(card) && String(card?.name ?? "").toLowerCase() === nm);
    return !dupInGy; // "doesn't have the same name as …" → true when NEITHER duplicate exists
  }

  // "you control no <filter>"  → count == 0
  let m = c.match(/^you control no (.+)$/);
  if (m) {
    const filter = parseFilter(m[1]);
    if (!filter) return null;
    return controllerBoard(state, controllerId).filter((p) => permMatchesFilter(p, filter, state)).length === 0;
  }

  // "you control a/an/<N> or more <filter>"
  m = c.match(new RegExp(`^you control ${NUM_RE}(?: or more)? (.+)$`));
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    const filter = parseFilter(m[2]);
    if (!filter) return null;
    return controllerBoard(state, controllerId).filter((p) => permMatchesFilter(p, filter, state)).length >= n;
  }

  // "[there are|you have] <N> or more <type> cards in your graveyard"
  m = c.match(new RegExp(`^(?:there are|you have) ${NUM_RE} or more ([a-z]+) cards? in your graveyard$`));
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    const singular = m[2].replace(/s$/, "");
    const word = singular.charAt(0).toUpperCase() + singular.slice(1);
    const re = new RegExp(`\\b${word}\\b`, "i");
    const gy = state.players[controllerId].graveyard || [];
    return gy.filter((card) => re.test(typeStr(card))).length >= n;
  }

  return null; // outside the modeled vocabulary → not native / not fired (never fail-open)
}

/**
 * Pure SHAPE check: is this condition one `evaluate` can read? Evaluated against an empty probe board —
 * a parseable shape returns a boolean (true/false on the empty board), an unparseable one returns null.
 * Used by the coverage metric (triggerRoutesNatively) AND the flush gate (buildTriggerStack) so the
 * metric never claims a routing the engine won't perform.
 */
export function interveningIfParseable(condition) {
  // The probe board carries a synthetic entering permanent (id "__entering__", a named creature) so a
  // per-PERMANENT shape (SAME-NAME ETB) returns a boolean here instead of null-for-missing-context. A pure
  // board-count shape ignores the extra permanent and a non-creature name, so its truth on the empty-ish
  // board is unchanged. An unparseable condition still returns null → false.
  const entering = { id: "__entering__", card: { name: "__probe_name__", type: "Creature" } };
  const probe = { players: { __probe__: { battlefield: [entering], graveyard: [] } } };
  return evaluateInterveningIf(probe, condition, "__probe__", { triggeringPermanentId: "__entering__" }) !== null;
}
