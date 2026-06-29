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

/**
 * Evaluate an intervening-if condition for `controllerId` against `state`.
 * Returns true / false (the condition's truth) or null (outside the modeled vocabulary → caller must
 * treat as "can't confirm": the trigger does NOT route natively / does NOT fire).
 */
export function evaluateInterveningIf(state, condition, controllerId) {
  const c = String(condition || "").toLowerCase().trim();
  if (!state?.players?.[controllerId]) return false; // controller gone → condition unmet

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
  const probe = { players: { __probe__: { battlefield: [], graveyard: [] } } };
  return evaluateInterveningIf(probe, condition, "__probe__") !== null;
}
