/**
 * mothmanRad.js — The Wise Mothman's dual-event rad trigger:
 *   "Whenever The Wise Mothman enters or attacks, each player gets a rad counter."
 *
 * WHY A TARGETED HOOK (the urDragonAttack.js / xCastToken.js / #319 pattern):
 *   Cindy's trigger compiler CANNOT reach this trigger and extending it is out of lane:
 *     - the condition "enters or attacks" names TWO trigger events, so detectTriggers' compound-event guard
 *       (triggers.js — `eventVerbs >= 2 → null`, the exact guard whose comment names Grave Titan's identical
 *       "enters or attacks") routes the WHOLE card to the Arbiter rather than silently fire on one half — a
 *       deliberate CREED-safe false-negative. The disjunction is NOT modeled, so the trigger never binds.
 *   The in-lane move (Walt's manual §3 + the #319 precedent) is a SELF-CONTAINED synchronous hook that
 *   applies the effect DIRECTLY, with ZERO change to detectTriggers / parseEffectClause. Corpus sweep
 *   (38,170 cards): the "enters or attacks, each player gets a rad counter" templating is UNIQUE to The Wise
 *   Mothman — a single-card hook, exactly as urDragonAttack is essentially The Ur-Dragon's.
 *
 * WHAT IS vs ISN'T MODELED HERE (CREED — honest partial, mirrors The Ur-Dragon pre-completion):
 *   - The EFFECT "each player gets a rad counter" is ALREADY a modeled atom (effectAtoms.applyRad, op "rad",
 *     who "eachPlayer"; parser.js maps this exact phrase). This hook only supplies the missing TRIGGER bind,
 *     mirroring applyRad's eachPlayer iteration EXACTLY (all live players, eliminated = clean skip).
 *   - The rad counters are consumed by the inherent radiation ability already wired at each player's
 *     precombat main (gameEngine — applyRadiation: mill N, lose 1 life + remove 1 counter per nonland milled,
 *     CR 728.1). So this delivers REAL runtime damage, not dead counters.
 *   - Mothman's THIRD clause ("Whenever one or more nonland cards are milled, put a +1/+1 counter on each of
 *     up to X target creatures…") is NOT modeled — so Mothman stays NON-NATIVE at the coverage metric
 *     (honest), and clause 3 is a SAFE under-fire. This hook flips no coverage tier; it adds runtime play.
 *
 * COORDINATION (read before touching the compound-event guard): this hook is the SINGLE source of Mothman's
 *   rad. If Cindy's compiler later learns to detect the "enters or attacks" disjunction (the directive's
 *   "RAD trigger-binding once Cindy's compiler detects the disjunction"), it MUST exclude this card — or this
 *   hook MUST be removed — to avoid double-firing the rad counters.
 *
 * CR: 603.6a (the ETB trigger fires when the permanent enters); 508.3 (the attack trigger fires when it is
 * declared as an attacker; the engine fires attack triggers at the declare-blockers transition, when the
 * full attacker batch is in state.combat.attackers); 728.1 (radiation — the rad-counter payoff).
 *
 * Self-contained + pure (returns a new state). The counter bump is order-independent (rad sits inert until
 * its controller's next precombat main), so applying it synchronously is observably identical to enqueuing a
 * trigger — same rationale urDragonAttack applies its draw synchronously. ADDITIVE only.
 */
import { addRadCounters, logEvent, findPermanent } from "./gameState.js";

// Two capture groups: (1) the trigger SUBJECT, (2) the rad AMOUNT. Anchored on the corpus-unique tail; the
// `[^\n.]` class keeps the subject within the single clause line (oracle clauses are newline-separated).
const MOTHMAN_RAD = /whenever\b\s*([^\n.]*?)\benters or attacks, each player gets (a|an|one|two|three|four|five|\d+) rad counters?\b/i;
const WORD_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

/**
 * Parse a card's "<self> enters or attacks → each player gets N rad counters" trigger. Strips reminder text.
 * Returns { amount } or null. CREED self-reference guard: the subject MUST be THIS card (its own name — full
 * or the pre-comma short name, CR 201.4 — or "this creature/permanent/vehicle"), NOT a watcher on OTHER
 * permanents ("a creature you control enters or attacks" is a DIFFERENT event this card-self hook must not
 * mis-fire). No such watcher-form card exists today (the templating is Mothman-unique); the guard is drift
 * insurance.
 */
export function parseMothmanRad(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "").replace(/\([^)]*\)/g, " ").toLowerCase();
  const m = oracle.match(MOTHMAN_RAD);
  if (!m) return null;
  const subject = m[1].trim();
  const nameL = String(card?.name ?? "").toLowerCase();
  const shortName = nameL.split(",")[0].trim(); // CR 201.4 legendary self-ref
  const isSelf =
    /^this (?:creature|permanent|vehicle)$/.test(subject) ||
    (shortName.length >= 3 && subject.includes(shortName));
  if (!isSelf) return null;
  const tok = m[2].toLowerCase();
  const amount = WORD_NUM[tok] ?? parseInt(tok, 10);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount };
}

/**
 * Give `amount` rad counters to EACH player (CR — "each player" includes the controller). Mirrors
 * effectAtoms.applyRad's eachPlayer branch exactly: iterate every live player, skip a missing/eliminated
 * seat, log the same { effect: "rad", who: "eachPlayer" } shape. Pure.
 */
function grantRadEachPlayer(state, amount, sourceName) {
  let next = state;
  for (const pid of Object.keys(next.players)) {
    if (next.players[pid]) next = addRadCounters(next, { playerId: pid, amount });
  }
  return logEvent(next, { kind: "spell-effect", effect: "rad", who: "eachPlayer", amount, source: sourceName });
}

/**
 * ETB half — when a permanent that carries the Mothman rad trigger ENTERS, each player gets its rad counter.
 * Called from the single ETB-fire chokepoint (checkEnterTriggers, triggers.js) so it covers EVERY entry path
 * (cast/clone/aura, reanimation, token, cheat-in). No-op for every other card. Pure.
 */
export function applyMothmanRadOnEnter(state, enteredPerm) {
  const spec = parseMothmanRad(enteredPerm?.card);
  if (!spec) return state;
  return grantRadEachPlayer(state, spec.amount, enteredPerm?.card?.name);
}

/**
 * Attack half — at the declare-blockers transition, each attacking permanent that carries the Mothman rad
 * trigger gives each player its rad counter. Fires once per matching attacker (Mothman is legendary, so
 * normally one; a token/clone copy attacking alongside it correctly fires twice — one trigger per source).
 * No attacking carrier → no-op. Pure.
 */
export function applyMothmanRadOnAttack(state) {
  const attackers = state.combat?.attackers || [];
  if (!attackers.length) return state;
  let next = state;
  for (const a of attackers) {
    const perm = findPermanent(next, a.permanentId)?.permanent;
    const spec = parseMothmanRad(perm?.card);
    if (!spec) continue;
    next = grantRadEachPlayer(next, spec.amount, perm?.card?.name);
  }
  return next;
}
