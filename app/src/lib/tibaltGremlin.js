/**
 * tibaltGremlin.js — the policy behind Tibalt's uninvited red interjection.
 *
 * Colton's 07-20 order; Omnath's design (COMMS 2026-07-27 ~23:05). This module is the POLICY only — the
 * decision of whether a bubble may exist at all. It is pure and has no UI, because every hazard in this
 * feature lives in the decision rather than in the rendering.
 *
 * ── THE DECISION THAT KILLS MOST OF THE HAZARD MECHANICALLY ──────────────────────────────────────────
 * The gremlin is EVENT-triggered, never TURN-triggered. He hangs off completed actions — a deck saved, an
 * import finished, a bench stat crossing a threshold — and is not wired into the chat loop at all.
 *
 * That single choice structurally excludes every dangerous case. A user mid-question, mid-rules-answer,
 * mid-adjudication, or asking for help is producing MESSAGES, not EVENTS, so there is nothing for him to
 * fire on. It is deliberately not a sentiment check: "is the user frustrated" is a false-positive machine,
 * and a wrong guess there lands a joke on someone having a bad time.
 *
 * ── THE LAW THAT MAKES HIM USABLE ────────────────────────────────────────────────────────────────────
 * He must be RIGHT. A roast that is merely mean is worthless; mean AND correct is the most useful feedback
 * in the app. So `finding` is required, and a null finding produces NO BUBBLE AT ALL — not an empty one,
 * not a generic quip. That is Omnath's mutation-check and it is pinned in the tests.
 */

/** Events he may hang off. A chat turn is deliberately not one of them. */
export const GREMLIN_EVENTS = new Set(["deck.saved", "deck.imported", "bench.statCrossedThreshold"]);

/**
 * Surfaces where a jab is vetoed regardless of everything else. Each is a person who must not be
 * interrupted, not a UI preference:
 *  - academy      — someone LEARNING is exactly who the roast law protects
 *  - arbiter/rules — a joke on a rules answer damages the one thing that must read as exact
 *  - crucible-postmortem — a lost game is a text, not a wound; a gremlin turns it back into a wound
 *  - keeper       — the front hall exists for people who are lost
 */
export const VETOED_SURFACES = new Set(["academy", "arbiter", "rules", "crucible-postmortem", "keeper"]);

export const CAPS = {
  sessionCap: 1,              // one per session, hard
  spacingMs: 6 * 60 * 60_000, // 6h between any two fires
  rollingCap: 3,              // per 7 days
  rollingWindowMs: 7 * 24 * 60 * 60_000,
};

/** Fresh per-profile gremlin state. Persisted by the caller; this module never does I/O. */
export function emptyGremlinState() {
  return {
    firedThisSession: 0,
    lastFireAt: 0,
    recentFires: [],            // timestamps, for the rolling cap
    suppressed: {},             // `${deckId}:${findingKey}` -> the stat value when we jabbed
    consecutiveIgnores: 0,      // drives ignore-decay
  };
}

/** Ignore-decay: two consecutive unreacted bubbles DOUBLE the spacing until one lands. */
function effectiveSpacing(state) {
  const doublings = Math.floor((state.consecutiveIgnores || 0) / 2);
  return CAPS.spacingMs * Math.pow(2, Math.min(doublings, 6));   // capped so it cannot overflow to absurdity
}

/**
 * May Tibalt interject right now?
 *
 * Returns `{ allow: boolean, reason: string }`. The reason is always populated — a silent refusal is
 * useless when tuning, and every "no" here is a rule someone chose on purpose.
 */
export function shouldInterject({
  event,
  finding = null,
  surface = null,
  profile = null,
  deckId = null,
  isFirstDeck = false,
  isFirstImport = false,
  findingAlreadyOnScreen = false,
  state = emptyGremlinState(),
  now = Date.now(),
} = {}) {
  const no = (reason) => ({ allow: false, reason });

  // ── The profile gate. Default OFF for everyone; Colton's is ON. Guests never get an uninvited jab.
  if (!profile?.gremlinEnabled) return no("disabled");

  // ── EVENT, not a chat turn. This is the structural exclusion, so it is checked first.
  if (!event || !GREMLIN_EVENTS.has(event.kind)) return no("not-a-gremlin-event");

  // ── THE BAR: a real, specific, actionable finding. No finding, no joke — no exceptions.
  if (!finding || !finding.key || !finding.text) return no("no-finding");

  // ── HARD BLOCKS. Any one vetoes regardless of caps or findings.
  if (surface && VETOED_SURFACES.has(surface)) return no(`vetoed-surface:${surface}`);
  // The briefs forbid punching at someone's first deck. This is that law in code, not a preference.
  if (isFirstDeck) return no("first-deck");
  if (isFirstImport) return no("first-import");
  // Karn just said it — an echo is not a gremlin.
  if (findingAlreadyOnScreen) return no("already-on-screen");

  // ── PER-FINDING SUPPRESSION, keyed on the FINDING rather than the clock. This is the layer that
  //    separates a gremlin from a heckler: once he has jabbed about `draw-count-low` on THAT deck, the
  //    key is dead for that deck until the underlying stat actually changes. Without it every cap below
  //    merely rations the same nag.
  const key = `${deckId || "-"}:${finding.key}`;
  if (Object.prototype.hasOwnProperty.call(state.suppressed || {}, key)) {
    const jabbedAt = state.suppressed[key];
    if (jabbedAt === finding.value) return no("suppressed-unchanged");
  }

  // ── CAPS.
  if ((state.firedThisSession || 0) >= CAPS.sessionCap) return no("session-cap");
  const since = now - (state.lastFireAt || 0);
  if (state.lastFireAt && since < effectiveSpacing(state)) return no("spacing");
  const recent = (state.recentFires || []).filter((t) => now - t < CAPS.rollingWindowMs);
  if (recent.length >= CAPS.rollingCap) return no("rolling-cap");

  return { allow: true, reason: "ok" };
}

/** Record a fire. Pure — returns the next state; the caller persists it. */
export function recordFire(state, { deckId, finding, now = Date.now() } = {}) {
  const key = `${deckId || "-"}:${finding?.key}`;
  return {
    ...state,
    firedThisSession: (state.firedThisSession || 0) + 1,
    lastFireAt: now,
    recentFires: [...(state.recentFires || []).filter((t) => now - t < CAPS.rollingWindowMs), now],
    suppressed: { ...(state.suppressed || {}), [key]: finding?.value },
  };
}

/**
 * Record what the user did with a bubble. `ignored` drives the decay; anything else resets it — he reads
 * the room, and if it keeps not landing he goes quiet on his own rather than needing to be switched off.
 *
 * The reaction is also the tuning signal Omnath's REACTION LOG consumes. We EMIT it; the ledger is his.
 */
export function recordReaction(state, reaction) {
  if (reaction === "ignored") return { ...state, consecutiveIgnores: (state.consecutiveIgnores || 0) + 1 };
  return { ...state, consecutiveIgnores: 0 };
}
