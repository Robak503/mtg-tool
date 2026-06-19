/**
 * cloneCopy.js — "enters the battlefield as a copy of a creature" (Clone / clone-style
 * permanents, CR 707). Leaf module: the clone classifier, the copiable-value snapshot
 * (CR 707.2), the legal copy-target candidates, and the deterministic auto-pick.
 *
 * SCOPE (this slice — bounded for correctness): only a PURE creature clone whose ENTIRE
 * oracle is "[You may have ~ enter | ~ enters] the battlefield as a copy of (a|any) creature
 * [you control] on the battlefield." An "except …" rider (Phyrexian Metamorph / Spark Double),
 * a non-creature copy, an ongoing/upkeep copy (Vesuvan Doppelganger), or any extra clause
 * fails the exact anchor → NOT a recognized clone → body-only/Arbiter, never a partial copy.
 *
 * MODEL: a snapshot. When the clone enters as a copy, its `card` becomes the source's copiable
 * values (a fresh object); the clone's ORIGINAL card is stashed as `permanent.printedCard` and
 * restored when it leaves the battlefield (CR 707.2 — in the graveyard it's the original card,
 * not the copy). Counters/auras/other-layer effects live on the PERMANENT, not the card, so
 * copying the card already excludes them (CR 707.2). The clone's own permanent identity (id,
 * summoning sickness, controller) is unchanged. ETB triggers of the copied creature fire for
 * free, because `enterPermanent` detects triggers from the (now-copied) `card.oracle`.
 *
 * Pure; imports only gameState board helpers — no cycle.
 */

import { findPermanent } from "./gameState.js";

const typeLine = (card) => String(card?.type || card?.type_line || "");
// Front-face only (CR 712.4a) — a battlefield permanent shows its front face; a clone copies a
// transform creature only when its FRONT is a creature.
const isCreatureCard = (card) => /Creature/.test(typeLine(card).split(" // ")[0]);

function stripReminder(text) {
  return String(text || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse a PURE creature-clone spec, or null. The WHOLE oracle (reminder stripped, the card's
 * own name elided to `~`) must reduce EXACTLY to the copy clause — the all-or-nothing gate that
 * keeps any unmodeled rider out. Returns `{ optional, scope }`:
 *   - optional: true for "You may have …" (you can decline → enters as a 0/0 → dies).
 *   - scope: "youControl" for "a creature you control", else "any" (any creature, any battlefield).
 */
export function parseCloneSpec(card) {
  let t = stripReminder(card?.oracle || card?.oracle_text || "").toLowerCase();
  const name = card?.name ? escapeRegex(String(card.name).toLowerCase()) : null;
  if (name) t = t.replace(new RegExp(name, "g"), "~");
  // Modern templating is "this creature enter as a copy of …" (no "the battlefield"); the older
  // wording "enter the battlefield as a copy of …" is also accepted ((?: the battlefield)?). Only
  // the two clean tails — "any creature on the battlefield" / "a creature you control" — match; a
  // subtype filter, an "except …" rider, or a non-creature copy fails the exact anchor.
  const m = t.match(
    /^(?:you may have (?:~|this creature) enter|(?:~|this creature) enters?)(?: the battlefield)? as a copy of (any creature on the battlefield|a creature you control)\.?$/,
  );
  if (!m) return null;
  return { optional: /^you may\b/.test(t), scope: m[1] === "a creature you control" ? "youControl" : "any" };
}

/** Is this card a clone the engine models (a creature whose whole text is the copy clause)? */
export function isCloneCard(card) {
  return /Creature/.test(typeLine(card)) && parseCloneSpec(card) !== null;
}

/**
 * Legal copy targets for a clone resolving under `controller` with the given scope: every
 * CREATURE permanent on the battlefield (CR 707 — copying happens on the battlefield), scoped to
 * the controller for "you control". As `{ id, name }` (battlefield permanent ids). The clone
 * itself isn't on the battlefield yet, so it can't be a candidate.
 */
export function cloneCandidates(state, controller, scope) {
  const out = [];
  for (const pid of Object.keys(state.players)) {
    if (scope === "youControl" && pid !== controller) continue;
    for (const perm of state.players[pid].battlefield) {
      if (isCreatureCard(perm.card)) out.push({ id: perm.id, name: perm.card?.name });
    }
  }
  return out;
}

/**
 * The copiable card a clone takes from its source (CR 707.2): the source's CURRENT card
 * (printed, or itself a copy — "copy the copy" works because a clone's card is already the
 * copied card), as a fresh object carrying the CLONE's own id (so two battlefield cards never
 * share one) and NEVER flagged a token (a copy of a token is a real object, CR 707.10a). Counters
 * and continuous effects are excluded automatically (they live on the permanent, not the card).
 */
export function snapshotCopiedCard(sourcePerm, cloneCard) {
  // A copy of a commander is NOT a commander (CR 903.3 — the designation is on the original card, not a
  // characteristic that copies). Strip isCommander like token, so a clone never inherits the designation.
  return { ...sourcePerm.card, id: cloneCard?.id, token: false, isCommander: false };
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
