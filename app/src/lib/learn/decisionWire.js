/**
 * decisionWire.js — the ONE wire-only view of a learn-session decision (SD-4).
 *
 * Every pendingChoice pause in the session driver spreads the WHOLE
 * state.pendingChoice onto the decision (`{ kind: "tutor-search", ...pc }`) —
 * including `resume`, the suspended effect-program continuation runProgram
 * recorded (program atoms, targets, context, chained queues), plus other
 * engine internals (`effectAtoms`, `queue`, `filter`, `restIds`, …). Those are
 * server memory, not UI data: the HTTP routes previously shipped them verbatim
 * (the old per-route stripDecisionForWire only touched kind==="ask" and was an
 * identity copy even there).
 *
 * decisionViewForWire() is applied at ALL FOUR routes (start/step/choose/resume):
 *   - a non-pending kind ("ask" / "unresolved" / "game-over" / "dispatch-error" /
 *     "engine-stuck" / the discover ask) passes through in today's exact shape;
 *   - a PENDING_CHOICE_KINDS decision is re-emitted through a field WHITELIST —
 *     everything the UI legitimately renders (LearnView's pending panels), and
 *     nothing else. `optional` is flattened from `decision.optional ??
 *     decision.resume?.optional` so the WI-2 mandatory-clone signal survives the
 *     strip (LearnView.jsx already reads it in exactly that order).
 *
 * The IN-PROCESS play API (gameApi act()/nextDecision) stays UNSTRIPPED — the
 * v1 contract exposes full decisions to pilots; this is a wire-only view.
 *
 * The client answers with ids only (cardId / permId / keep[] / value / mode) and
 * the server settles from state.pendingChoice, so nothing stripped here is ever
 * round-tripped.
 */

import { PENDING_CHOICE_KINDS } from "./pendingChoice.js";

/**
 * Everything a pending-choice panel renders (see LearnView.jsx's pending panels;
 * `victim` — HandDiscardPanel:1099 — and `restTo` — ImpulseDigPanel:1162 — are
 * UI-read and therefore kept). Engine internals — `resume`, `effectAtoms`,
 * `queue`, `filter`, `restIds`, `atomIndex`, `spellId`, `sourceId`, ids of
 * suspended programs — are NOT listed and never reach the wire.
 */
const PENDING_WIRE_FIELDS = [
  "kind",
  "controller",
  "sourceName",
  "cardName",
  "spellName",
  "candidates",
  "cards",
  "mode",
  "amount",
  "cost",
  "modes",
  "sac",
  "disc",
  "zone",
  "effectOp",
  "subtype",
  "available",
  "affordable",
  "count",
  "filterLabel",
  "destination",
  "remaining",
  "victim",
  "restTo",
  "from", // change-target (shelf D14) — the redirected object's current target, { id, name, type, controller }, for the panel's "from" line
  "toZone", // milled-pick — MilledPickPanel's banner switch ("exile": exile from your graveyard; "playFree": Dauthi Voidwalker's free play, P·28)
];

/**
 * Build the wire view of a decision. Non-pending kinds pass through unchanged
 * (today's shape); pending kinds are whitelisted. Null-safe.
 *
 * @param {object|null} decision  a { kind, ... } decision from the session driver
 * @returns {object|null} the decision as it should appear on the HTTP wire
 */
export function decisionViewForWire(decision) {
  if (!decision) return null;
  if (!PENDING_CHOICE_KINDS.includes(decision.kind)) return decision;
  const out = {};
  for (const field of PENDING_WIRE_FIELDS) {
    if (decision[field] !== undefined) out[field] = decision[field];
  }
  // WI-2 (CR 707.9): the mandatory-clone flag may live on the pc root (clone-search
  // sets `optional`) or on the suspended program (`resume.optional`). Flatten it so
  // the UI keeps its `decision.optional ?? decision.resume?.optional` first branch
  // working after `resume` is stripped.
  const optional = decision.optional ?? decision.resume?.optional;
  if (optional !== undefined) out.optional = optional;
  return out;
}

/**
 * Wire view of the interactive human-mulligan ask (kind:"mulligan"). This pre-game decision
 * isn't a state.pendingChoice, so decisionViewForWire would pass it through untouched — but its
 * `hand` carries full engine card objects (whole oracle text, keyword atoms, …). Slim the hand
 * to exactly what the fanned-hand render + bottom-picker need: `id` (the selection key the
 * bottom-pick submits) + `name` (card art via /api/card-image) + `type_line` (tooltip). The
 * scalar fields (phase / seat / mulligans / options / bottomCount) are already wire-safe.
 * Non-mulligan decisions defer to decisionViewForWire (null-safe).
 */
export function mulliganDecisionForWire(decision) {
  if (!decision || decision.kind !== "mulligan") return decisionViewForWire(decision);
  const hand = (decision.hand || []).map((c) => {
    const typeLine = c.type_line || c.type;
    return { id: c.id, name: c.name, ...(typeLine ? { type_line: typeLine } : {}) };
  });
  return { ...decision, hand };
}
