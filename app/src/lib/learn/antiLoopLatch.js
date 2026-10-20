/**
 * antiLoopLatch.js — the question the session driver's anti-loop latch asks after every auto-decided non-pass action:
 * did the action change the game? (learnSession.advanceUntilDecision; PR 10.4, 2026-06-05.)
 *
 * WHY THE LATCH EXISTS. The driver applies one auto-decided action per tick. An action that changes nothing leaves the
 * same state, the same offered set and the same pick on the next tick, so the seat would take it for ever. PR 10.3's loop
 * was the textbook case: a Vigilance attacker stayed untapped after its declaration, so it was offered again, and every
 * re-declaration appended another copy of the same attacker entry. The latch answers "nothing changed" by passing
 * priority FROM THE STATE BEFORE THE ACTION, which moves the game on. (The re-declaration itself is closed at the source —
 * legalChoices offers no declared attacker — so the latch is the defence behind it, for any action that changes nothing.)
 *
 * WHAT COUNTS AS A CHANGE. Two reads, cheapest first:
 *   1. `progressSignature` — the field list the latch has always read (turn, phase, step, the distinct attackers and
 *      blockers, stack depth, the active player's hand and mana pool, the battlefield count, the pending-window flags).
 *      A different signature is a change; this is the common case and costs a few array walks.
 *   2. When the signature is the same, the whole state is compared — every player, permanent, zone, effect and pending
 *      object — except the BOOKKEEPING fields below. Reading only the field list (until 2026-10-20) threw real actions
 *      away: a crew that took effect at once tapped creatures and added a type-changing effect (22 AI crews in an
 *      80-game A/B, all lost; crew uses the stack since 2026-10-18); turning a manifest face up paid by tapping lands
 *      flips a permanent and taps others; a creature that can block more than one adds a second block with a blocker
 *      already counted; "done" in Etali's cast-from-among window clears a flag the list never read, so the window never
 *      closed. None of that moves a signature field.
 *
 * BOOKKEEPING, ignored by the comparison: the event log (a history of what happened, not a game object), the priority
 * holder and the count of consecutive passes (every action restates them — the actor keeps priority, CR 117.3c), and the
 * engine's monotonic counters (the id sequence, layer timestamps, the PRNG position), which move only alongside a change
 * the comparison sees elsewhere.
 *
 * REPEATS FOLD. Arrays are compared with exact repeats removed (first occurrences kept, order kept): appending a second
 * copy of an element already present is not a change. That is PR 10.3's loop in the whole-state read — the duplicate
 * attacker entry, and the duplicate defender in the attacker's per-turn memo — and it is why the signature counted
 * DISTINCT attackers rather than raw lengths. A new element, a removed one, a changed one or a new order is a change.
 *
 * Keys whose value is undefined are absent (the state is plain JSON: it saves and restores through JSON).
 * A leaf module: it reads plain state and imports nothing.
 */

/**
 * A cheap fingerprint of "meaningful progress" — the latch's first read. Uses DISTINCT combat permanent counts (not raw
 * lengths) so a re-declare-style loop, which would grow a raw length, is still caught as no-progress.
 *
 * The mid-resolution pending windows (free-cast / cascade / discover) are part of the signature: RESOLVING one (e.g. a
 * free-cast DECLINE, which may change nothing else) IS progress — without these bits the latch would roll a decline back
 * to a force-pass on the pre-decline state, resurrecting the pending flag forever (the livelock this guards against). A
 * pending flag is one-way per window (cleared by exactly one action, re-set only by a new spell that also changes the
 * stack), so it can never make a genuine no-op loop look live.
 */
export function progressSignature(state) {
  const active = state.players[state.activePlayer];
  const handCount = active ? active.hand.length : 0;
  const poolTotal = active ? Object.values(active.manaPool).reduce((a, b) => a + b, 0) : 0;
  const bfCount = Object.values(state.players).reduce((sum, p) => sum + p.battlefield.length, 0);
  const distinctAttackers = new Set((state.combat?.attackers || []).map((a) => a.permanentId)).size;
  const distinctBlockers = new Set((state.combat?.blockers || []).map((b) => b.blockerId)).size;
  const pendings =
    (state.pendingFreeCast ? 1 : 0) +
    (state.pendingCascade ? 2 : 0) +
    (state.pendingDiscover ? 4 : 0);
  return [
    state.turn,
    state.phase,
    state.step,
    distinctAttackers,
    distinctBlockers,
    state.stack.length,
    handCount,
    poolTotal,
    bfCount,
    pendings,
  ].join("|");
}

/** Top-level state fields an action rewrites without changing the game (see the header). */
export const LATCH_BOOKKEEPING_KEYS = Object.freeze(["log", "priorityHolder", "consecutivePasses", "idSeq", "timestampCounter", "rngSeed"]);
const BOOKKEEPING = new Set(LATCH_BOOKKEEPING_KEYS);

function isObject(v) {
  return v !== null && typeof v === "object";
}

/** A canonical text for one array element: sorted keys, undefined-valued keys left out. Used only to find repeats. */
function canonical(v) {
  if (!isObject(v)) return v === undefined ? "u" : JSON.stringify(v) ?? String(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
}

function withoutRepeats(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const key = canonical(x);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(x);
  }
  return out;
}

function sameArrays(a, b) {
  if (a.length === b.length) {
    let i = 0;
    while (i < a.length && same(a[i], b[i])) i += 1;
    if (i === a.length) return true;
  }
  const ua = withoutRepeats(a);
  const ub = withoutRepeats(b);
  if (ua.length === a.length && ub.length === b.length && a.length === b.length) return false; // no repeats: already different
  return ua.length === ub.length && ua.every((x, i) => same(x, ub[i]));
}

function sameObjects(a, b, skip = null) {
  for (const k of Object.keys(a)) {
    if (skip?.has(k)) continue;
    const va = a[k];
    const vb = b[k];
    if (va === undefined && vb === undefined) continue;
    if (!same(va, vb)) return false;
  }
  for (const k of Object.keys(b)) {
    if (skip?.has(k) || k in a) continue;
    if (b[k] !== undefined) return false;
  }
  return true;
}

function same(a, b) {
  if (a === b) return true;
  if (!isObject(a) || !isObject(b)) return a !== a && b !== b; // NaN is NaN; any other primitive difference is a change
  const arr = Array.isArray(a);
  if (arr !== Array.isArray(b)) return false;
  return arr ? sameArrays(a, b) : sameObjects(a, b);
}

/**
 * Did dispatching an auto-decided non-pass action change the game? `before` is the state the action was chosen on,
 * `after` the state dispatchAction returned. False only when nothing outside the bookkeeping fields moved (repeats
 * folded) — the case the latch passes priority on instead.
 */
export function actionChangedGame(before, after) {
  if (before === after) return false;
  if (progressSignature(before) !== progressSignature(after)) return true;
  return !sameObjects(before, after, BOOKKEEPING);
}
