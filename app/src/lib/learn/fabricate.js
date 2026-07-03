/**
 * fabricate.js — KW-FABRICATE (CR 702.111a).
 *
 *   Fabricate N — "When this creature enters, put N +1/+1 counters on it OR create N 1/1 colorless
 *                 Servo artifact creature tokens." (a modal ETB triggered ability; the controller chooses.)
 *
 * Fabricate is a CHOICE (CR 702.111a): as its ETB ability resolves, the controller picks EITHER the
 * counters OR the Servo tokens — not both. Both branches are modeled here so the whole card plays:
 *
 *   • COUNTERS branch — N +1/+1 counters added to the entering permanent. Applied by enterPermanent AS the
 *     permanent enters (before the lethal SBA + before ETB watchers), exactly like the enters-with-+1/+1
 *     replacement, so its P/T is correct from turn 1. Routed through applyCounterDoubling (CR 616 — Doubling
 *     Season / Hardened Scales double the counters), like every other enters-with-counter write.
 *   • SERVO branch — N 1/1 colorless Servo artifact creature tokens minted onto the controller's battlefield,
 *     firing their ETB watchers (Soul Warden / Impact Tremors) AND artifact-ETB watchers (Servos ARE
 *     artifacts) via the shared fireTokenEnterTriggers seam, and doubled by the token multiplier (CR 616 —
 *     Doubling Season / Mondrak).
 *
 * The self-play engine makes a DETERMINISTIC choice (decideFabricate) — like tribute's decideTribute and the
 * chosen-type auto-pick: default to the counters (a bigger body, the simplest always-correct resolution).
 * Both branches are exercised + correct, so a future interactive picker is a pure refinement — neither branch
 * can mis-resolve or silently drop the payoff (THE CREED). A card whose OTHER text is unmodeled still stays
 * body-only (the classifier validates the rest of the card all-or-nothing); Fabricate itself never mis-counts.
 *
 * Pure: regex + board reads; the resolver returns a new state.
 */

import { createPermanent, mintId } from "./gameState.js";
import { tokenMultiplier } from "./replacementEffects.js";
import { fireTokenEnterTriggers } from "./effects/atoms/tokens.js";

// Keyword-position match (line start / keyword-list) so a reminder-text or granted mention can't false-fire —
// mirrors fading.js's FADING/VANISHING anchoring. "Fabricate N" always appears as its own keyword line (or
// comma/semicolon-joined in a keyword list), never mid-sentence, so this can only match the real keyword.
const FABRICATE = /(?:^|\n|, |; )fabricate\s+(\d+)/i;

/** { n } for a Fabricate N card, or null. */
export function parseFabricate(card) {
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "");
  const m = oracle.match(FABRICATE);
  return m ? { n: parseInt(m[1], 10) } : null;
}

/**
 * The self-play choice for Fabricate N (CR 702.111a). Deterministic, mirroring decideTribute: default to the
 * +1/+1 COUNTERS branch — a strictly-correct, always-legal resolution that makes the source a bigger threat
 * from turn 1. Returns "counters" | "servos". (A future value heuristic — e.g. prefer Servos with an
 * aristocrat/go-wide payoff on board — is a pure refinement; both branches already resolve correctly.)
 */
export function decideFabricate(/* state, controller, card */) {
  return "counters";
}

/**
 * Mint N 1/1 colorless Servo artifact creature tokens for `controller`, firing their ETB watchers via the
 * shared token seam and applying the CR 616 token multiplier (Doubling Season / Mondrak). Pure — returns a
 * new state. Mirrors applyCreateToken's minting but is inlined here because Fabricate's Servo is a fixed,
 * canonical token (no parsed descriptor). Called only by the Servo branch below.
 */
function createServoTokens(state, controller, n) {
  let next = state;
  const count = n * tokenMultiplier(next, controller);
  const mintedIds = [];
  for (let i = 0; i < count; i++) {
    const minted = mintId(next, "tok");
    next = minted.state;
    const card = {
      id: `tok-${minted.id}`,
      name: "Servo",
      type: "Token Artifact Creature — Servo",
      power: 1,
      toughness: 1,
      oracle: "",
      keywords: [],
      token: true,
    };
    const perm = createPermanent({ id: minted.id, card, controller });
    const player = next.players[controller];
    next = { ...next, players: { ...next.players, [controller]: { ...player, battlefield: [...player.battlefield, perm] } } };
    mintedIds.push(minted.id);
  }
  // A created token ENTERS (CR 603.6a) — fire its ETB watchers (creature-ETB Soul Warden/Impact Tremors +
  // artifact-ETB, since a Servo is an artifact creature) at the shared seam. No lethal SBA needed (a 1/1 is
  // alive), but the seam already runs it for 0/0 edge cases — here every Servo survives.
  next = fireTokenEnterTriggers(next, mintedIds);
  return next;
}

/**
 * Resolve Fabricate N's Servo branch on an already-entered permanent (called by enterPermanent AFTER the
 * source is on the battlefield, only when decideFabricate chose "servos"). The counters branch is applied
 * inline by enterPermanent's pre-entry counter write (so the source's P/T is right from turn 1). Pure.
 */
export function applyFabricateServos(state, card, controller) {
  const fab = parseFabricate(card);
  if (!fab || fab.n <= 0) return state;
  return createServoTokens(state, controller, fab.n);
}
