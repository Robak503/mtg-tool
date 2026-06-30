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
 *   "an opponent controls more <lands|creatures|artifacts|enchantments> than you" (Knight of the White
 *      Orchid, Loyal Warhound, Ticket Tortoise, Linvala) — an existential board-count compare vs each
 *      opponent (CR 104.3a); and "an opponent has more <life|cards in hand> than you" (Linvala).
 *   "you have N or {less|fewer|more} life" (Convalescent Care "5 or less", Convalescence "10 or less") — the
 *      controller's own life vs a fixed threshold; a pure player.life compare (≤ for less/fewer, ≥ for more).
 *   "you control another <Subtype>" (Dwynen's Elite "another Elf", Ghitu Journeymage "another Wizard",
 *      Apothecary Geist "another Spirit", Resistance Squad "another Human") — a CURATED creature subtype,
 *      excluding the entering permanent (CR 113.7), keyed on ctx.triggeringPermanentId like SAME-NAME ETB.
 *   "[a creature|N or more creatures] died this turn" (Twinblade Assassins, Deathreap Ritual, Bulette, the
 *      Morbid family; Inga "three or more", Lagomos "five or more", Tallyman "seven or more") — a TURN-EVENT
 *      history read off the per-turn creature-death tally (gameState.creaturesDiedThisTurn, bumped at the death
 *      chokepoint, reset for all seats at untap). "a creature died" ≡ "1 or more died" (≥1); the cardinal form
 *      compares the all-seats death total (CR 700.4 — any player's creature dying counts) to N.
 *   "it was kicked" (CR 702.33e) — the kicker ETB-trigger condition (Goblin Ruinblaster, Torch Slinger,
 *      Heartstabber Mosquito …): a per-PERMANENT cast-decision flag read off the entering permanent's
 *      `wasKicked` (stamped by resolvers.enterPermanent on a kicked cast), keyed on ctx.triggeringPermanentId.
 *   "tribute wasn't paid" / "tribute was paid" (CR 702.96e) — the Tribute ETB-trigger condition (Pharagax
 *      Giant, Ornitharch, Nessian Demolok, Snake of the Golden Grove …): a per-PERMANENT decision flag read
 *      off the entering permanent's `tributePaid` (stamped by resolvers.enterPermanent when the opponent
 *      chose at ETB), keyed on ctx.triggeringPermanentId exactly like the kicked flag.
 * DEFERRED to the Arbiter (stay LOW): color/multicolored permanents, other power comparisons ("power N or
 * less", toughness), OTHER turn-event history (a NON-creature died, "you gained life this turn", attacked),
 * subtype-scoped death counts ("a Zubera died"), the OTHER cast-decision flags (bargain), state flags
 * (monarch, city's blessing) — each a future increment.
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

// DEATHS-THIS-TURN (CR 700.4) — total creatures that died this turn across ALL seats (the sum of every
// player's per-turn creaturesDiedThisTurn tally). "a creature died this turn" / "N or more creatures died this
// turn" are unscoped, so any player's creature dying counts. A seat with no tally → 0.
function deathsThisTurnTotal(state) {
  return Object.values(state?.players || {}).reduce((sum, pl) => sum + (pl?.creaturesDiedThisTurn || 0), 0);
}

// Opponent ids = every seat that ISN'T the controller. Computed inline from the live player map (NOT via
// gameState.opponentsOf, which assertPlayer-throws on the synthetic probe id used by interveningIfParseable).
// Stable order (Object.keys); used only for "an opponent <comparison> than you" (an existential over opponents),
// so order doesn't affect the result. A 1-seat probe board yields no opponents → the comparison is vacuously
// false there, which is exactly what interveningIfParseable wants (a parseable shape returns a boolean, not null).
function opponentIds(state, controllerId) {
  return Object.keys(state?.players || {}).filter((id) => id !== controllerId);
}

// ===== OPPONENT-COMPARISON (CR 603.4 board query — the "behind on a resource" ramp/payoff family) =========
// "an opponent <controls more X | has more Y> than you" — TRUE iff AT LEAST ONE opponent's tally strictly
// exceeds the controller's (CR 104.3a — each opponent is compared independently; "an opponent" = the existential).
// METRIC kinds (each a count the live state exposes directly, never fabricated):
//   controls more <permanent-type>  → battlefield permanents of that card type (lands/creatures/artifacts/
//                                      enchantments), a word-anchored type-line read (reuses parseFilter).
//   has more life                   → player.life
//   has more cards in hand          → player.hand.length
// Strictly LAYER-IRRELEVANT (a pure count/total compare), so it's read identically at flush AND resolution.
const OPP_CONTROLS_MORE_RE = /^an opponent controls more (lands|creatures|artifacts|enchantments) than you$/;
const OPP_HAS_MORE_RE = /^an opponent has more (life|cards in hand) than you$/;

// ===== CONTROLLER LIFE THRESHOLD (CR 603.4 board query — the "low-on-life payoff" family) ==================
// "you have N or {less|fewer|more} life" — a pure player.life numeric compare for the CONTROLLER (NOT an
// opponent existential like OPP_HAS_MORE). "N or less"/"N or fewer" → life ≤ N (Convalescent Care "5 or less",
// Convalescence "10 or less"); "N or more" → life ≥ N. Life is a single integer the live state exposes
// directly (player.life), strictly LAYER-IRRELEVANT, so it reads identically at flush AND resolution like
// every other board-count condition. CREED: a deterministic numeric compare, never fail-open — a malformed
// or out-of-vocabulary life phrase falls through to the final `return null` → Arbiter (false-negative SAFE).
const CTRL_LIFE_THRESHOLD_RE = /^you have (\d+) or (less|fewer|more) life$/;

function controllerMetric(state, controllerId, kind) {
  const player = state?.players?.[controllerId];
  if (!player) return 0;
  if (kind === "life") return player.life || 0;
  if (kind === "cards in hand") return (player.hand || []).length;
  // a permanent-type count — word-anchored type-line match (singular Title-case), mirroring parseFilter
  const word = kind.replace(/s$/, "");
  const re = new RegExp(`\\b${word.charAt(0).toUpperCase() + word.slice(1)}\\b`, "i");
  return (player.battlefield || []).filter((p) => re.test(typeStr(p.card))).length;
}

// ===== CONTROL-ANOTHER-SUBTYPE (CR 603.4 + 113.7 — "another" excludes the trigger source) =================
// "you control another <Subtype>" (Dwynen's Elite "another Elf", Ghitu Journeymage "another Wizard", Apothecary
// Geist "another Spirit", Resistance Squad "another Human") — TRUE iff the controller controls a creature of that
// subtype OTHER THAN the entering permanent (the trigger's triggeringPermanent, threaded as ctx.triggeringPermanentId
// exactly like SAME-NAME ETB). The subtype must be in the CURATED creature-subtype allowlist (a proper noun that
// appears verbatim ONLY in the subtype portion of a type line — no left-of-dash collision — so a `\b<sub>\b`
// type-line containment selects exactly the subtyped creatures, CR 205.3m). A non-curated word ("Outlaw" is a
// DESIGNATION, not a creature type; a color; a card type) is NOT in the set → null → Arbiter (CREED: never a
// mis-scoped / fabricated tribal gate). Mirrors the curated MASS_CREATURE_SUBTYPES allowlist discipline.
const CTRL_ANOTHER_SUBTYPE_RE = /^you control another ([a-z]+)$/;
const CONTROL_SUBTYPE_ALLOW = new Set([
  "elf", "wizard", "spirit", "human", "goblin", "dragon", "zombie", "vampire", "merfolk", "warrior",
  "knight", "soldier", "cleric", "angel", "demon", "sliver", "dinosaur", "bird", "snake", "cat",
]);

// ===== KICKED ETB (CR 702.33e + 603.4) =======================================================
// "it was kicked" — the intervening-if on a kicker creature's ETB trigger ("When this creature enters, if it
// was kicked, <effect>" — Goblin Ruinblaster, Torch Slinger, Heartstabber Mosquito …). A per-PERMANENT
// cast-decision flag, NOT a board query: it reads whether the ENTERING permanent was cast for its kicker cost.
// enterPermanent stamps `perm.wasKicked = true` when the cast paid the kicker (resolvers.js, threaded from the
// kicked cast); a normal cast leaves it unset. Keyed on ctx.triggeringPermanentId exactly like SAME-NAME ETB,
// so it reads the SAME entering permanent at BOTH the flush check (the permanent is already on the battlefield
// when ETB triggers flush) AND the resolution re-check (CR 603.4 second check). A non-kicked entry → false
// (the trigger is dropped / does nothing); a missing entering permanent → null (can't confirm → FN-safe, never
// fail-open). This closes the kicker entry in the DEFERRED list (cast-decision flags) for the ETB-trigger shape.
const KICKED_ETB_RE = /^it was kicked$/;

// ===== TRIBUTE ETB (CR 702.96e + 603.4) ======================================================
// "tribute wasn't paid" / "tribute was paid" — the intervening-if on a Tribute creature's ETB trigger
// ("When this creature enters, if tribute wasn't paid, <effect>" — Pharagax Giant, Ornitharch, Nessian
// Demolok, Snake of the Golden Grove …). Like the kicked flag, this is a per-PERMANENT decision flag, NOT a
// board query: it reads whether the OPPONENT chose to pay tribute (put N +1/+1 counters on the entering
// creature) AS it entered. resolvers.enterPermanent stamps `perm.tributePaid` (true = an opponent paid →
// the counters were added; false = every opponent declined → the "if tribute wasn't paid" effect runs)
// EXACTLY when the card carries Tribute (parseTribute); a non-tribute permanent leaves it undefined. Keyed
// on the entering permanent (ctx.triggeringPermanentId) like KICKED_ETB, so it reads identically at the flush
// check (the permanent is on the battlefield when ETB triggers flush) AND the resolution re-check (CR 603.4
// second check). The flag is a definite boolean once tribute resolves, so "wasn't paid" → !tributePaid and
// "was paid" → tributePaid; a missing entering permanent or an unstamped flag → null (can't confirm → the
// trigger stays unrouted / on the Arbiter — FN-safe, never fail-open). Straight + curly apostrophe tolerated.
const TRIBUTE_NOT_PAID_RE = /^tribute wasn['’]t paid$/;
const TRIBUTE_PAID_RE = /^tribute was paid$/;

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

  // KICKED ETB (CR 702.33e) — "it was kicked": read the entering permanent's was-kicked flag (a per-PERMANENT
  // cast-decision flag, stamped by resolvers.enterPermanent as perm.wasKicked when the kicker cost was paid).
  // Keyed on the entering permanent (ctx.triggeringPermanentId) like SAME-NAME ETB, so it reads identically at
  // flush (the permanent is on the battlefield when ETB triggers flush) AND resolution (CR 603.4 second check).
  if (KICKED_ETB_RE.test(c)) {
    const triggeringId = context?.triggeringPermanentId;
    if (!triggeringId) return null; // no entering permanent in context → can't confirm (FN-safe; never fail-open)
    const board = controllerBoard(state, controllerId);
    const entering = board.find((p) => p.id === triggeringId);
    if (!entering) return null;      // entering permanent already gone → can't confirm (FN-safe)
    return entering.wasKicked === true; // a normal (un-kicked) cast leaves wasKicked unset → false (CR 603.4 drop)
  }

  // TRIBUTE ETB (CR 702.96e) — "tribute wasn't paid" / "tribute was paid": read the entering permanent's
  // tributePaid flag (a per-PERMANENT decision flag, stamped by resolvers.enterPermanent as perm.tributePaid
  // = true when an opponent paid tribute / false when every opponent declined, set AS the creature entered).
  // Keyed on the entering permanent (ctx.triggeringPermanentId) like KICKED_ETB, so it reads identically at
  // flush (the permanent is on the battlefield when ETB triggers flush) AND resolution (CR 603.4 second check).
  // A definite boolean once tribute resolves; an unstamped flag (a non-tribute permanent, or the entering
  // permanent already gone) → null (can't confirm → FN-safe, never fail-open — the trigger stays unrouted).
  if (TRIBUTE_NOT_PAID_RE.test(c) || TRIBUTE_PAID_RE.test(c)) {
    const triggeringId = context?.triggeringPermanentId;
    if (!triggeringId) return null; // no entering permanent in context → can't confirm (FN-safe; never fail-open)
    const board = controllerBoard(state, controllerId);
    const entering = board.find((p) => p.id === triggeringId);
    if (!entering || typeof entering.tributePaid !== "boolean") return null; // not a resolved-tribute permanent → can't confirm (FN-safe)
    return TRIBUTE_NOT_PAID_RE.test(c) ? entering.tributePaid === false : entering.tributePaid === true;
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

  // "an opponent controls more <lands|creatures|artifacts|enchantments> than you"
  m = c.match(OPP_CONTROLS_MORE_RE);
  if (m) {
    const mine = controllerMetric(state, controllerId, m[1]);
    return opponentIds(state, controllerId).some((oid) => controllerMetric(state, oid, m[1]) > mine);
  }
  // "an opponent has more <life|cards in hand> than you"
  m = c.match(OPP_HAS_MORE_RE);
  if (m) {
    const mine = controllerMetric(state, controllerId, m[1]);
    return opponentIds(state, controllerId).some((oid) => controllerMetric(state, oid, m[1]) > mine);
  }

  // "you have N or {less|fewer|more} life" — the controller's own life vs a fixed threshold (Convalescent
  // Care, Convalescence). Pure player.life compare (CR 603.4), layer-irrelevant, read identically at flush
  // AND resolution. "less"/"fewer" → ≤ N; "more" → ≥ N.
  m = c.match(CTRL_LIFE_THRESHOLD_RE);
  if (m) {
    const threshold = parseInt(m[1], 10);
    const life = controllerMetric(state, controllerId, "life");
    return m[2] === "more" ? life >= threshold : life <= threshold;
  }

  // ===== TURN-EVENT HISTORY (CR 700.4) ===== "[a creature | N or more creatures] died this turn" — read off
  // the per-turn creature-death tally (gameState.creaturesDiedThisTurn per seat, bumped at the death chokepoint).
  // "a creature died this turn" is the ≥1 case; the cardinal form ("three or more creatures died this turn")
  // compares the ALL-SEATS death total to N (CR 700.4 — any player's creature dying counts). Evaluated at flush
  // AND resolution like every other intervening-if; the counter resets for all seats at untap, so it reads the
  // current turn's deaths only. A subtype-scoped ("a Zubera died") or "an opponent's creature died" variant
  // fails the anchor → falls through → null → Arbiter (CREED — never a mis-scoped death count).
  m = c.match(/^a creature died this turn$/);
  if (m) return deathsThisTurnTotal(state) >= 1;
  m = c.match(new RegExp(`^${NUM_RE} or more creatures died this turn$`));
  if (m) {
    const n = parseCount(m[1]);
    if (n == null) return null;
    return deathsThisTurnTotal(state) >= n;
  }

  // "you control another <Subtype>" — a curated creature subtype, OTHER THAN the entering permanent (CR 113.7)
  m = c.match(CTRL_ANOTHER_SUBTYPE_RE);
  if (m) {
    const sub = m[1];
    if (!CONTROL_SUBTYPE_ALLOW.has(sub)) return null; // non-creature-type word (designation/color) → Arbiter (CREED)
    const triggeringId = context?.triggeringPermanentId;
    if (!triggeringId) return null; // "another" needs the entering permanent to exclude → can't confirm (FN-safe)
    const re = new RegExp(`\\b${sub.charAt(0).toUpperCase() + sub.slice(1)}\\b`, "i");
    return controllerBoard(state, controllerId).some((p) =>
      p.id !== triggeringId && isCreaturePermLocal(p) && re.test(typeStr(p.card)));
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
  // board is unchanged. An unparseable condition still returns null → false. The probe also stamps a
  // definite `tributePaid` boolean so the TRIBUTE ETB shape returns a boolean here (the runtime stamps it
  // for real on every tribute permanent); a non-tribute board-shape ignores the extra field.
  const entering = { id: "__entering__", card: { name: "__probe_name__", type: "Creature" }, tributePaid: false };
  const probe = { players: { __probe__: { battlefield: [entering], graveyard: [] } } };
  return evaluateInterveningIf(probe, condition, "__probe__", { triggeringPermanentId: "__entering__" }) !== null;
}
