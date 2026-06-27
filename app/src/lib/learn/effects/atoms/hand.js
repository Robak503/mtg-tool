/**
 * effects/atoms/hand.js — hand-disruption atoms (discard, discard-chosen).
 */

import { handCardMatches } from "../../spellEffects.js";
import { logEvent, opponentsOf, moveCardToZone } from "../../gameState.js";
import { setPendingHandDiscardChoice, setPendingDiscardChoice } from "../../pendingChoice.js";
import { effectiveAmount } from "./shared.js";
import { NUM_WORD } from "../parseHelpers.js"; // seam batch 23: shared number-word map (leaf, cycle-free) for the discard family

/**
 * δ-1b targeted hand disruption (CR 701.8 discard) — Duress / Thoughtseize / Inquisition / Coercion /
 * Despise / Divest / Harsh Scrutiny. The spell targeted an OPPONENT at cast (a player target, chosen
 * WITHOUT seeing their hand — the faithful Duress flow). NOW it resolves: REVEAL that opponent's hand,
 * keep only the cards matching the atom's handFilter, and set a `pendingChoice` for the CASTER to pick
 * which one to discard (the driver surfaces a picker for the human, auto-picks the best card for the AI
 * / Expert — mirroring the tutor/scry/clone pause-or-autopick). The chosen card moves from the OPPONENT'S
 * hand to their graveyard in resolveHandDiscardChoice. Modeling the card pick at resolution (not cast)
 * is what makes 4P faithful: the caster commits to ONE opponent first and only ever sees THAT hand — no
 * cross-opponent cherry-pick, no leak of the other opponents' hands. An empty/no-match revealed hand is a
 * clean no-op (revealed nothing to take, CR 701.8 — no pause). Eliminated-target guard: a target that
 * left the game is skipped.
 */
export function applyDiscardChosen(state, atom, ctx) {
  const victim = (ctx.targets || []).find((t) => t.type === "player");
  if (!victim || !state.players[victim.id]) {
    return logEvent(state, { kind: "spell-effect", effect: "discard-chosen", controller: ctx.controller, victim: victim?.id ?? null, candidates: 0 });
  }
  const hf = atom.handFilter || {};
  const candidates = (state.players[victim.id].hand || [])
    .filter((c) => !c.token && handCardMatches(c, hf))
    .map((c) => ({ id: c.id, name: c.name }));
  // Revealed but nothing the spell can take → a clean no-op (no picker, the program continues).
  if (candidates.length === 0) {
    return logEvent(state, { kind: "spell-effect", effect: "discard-chosen", controller: ctx.controller, victim: victim.id, candidates: 0 });
  }
  // Pause for the caster's pick (driver surfaces a picker / auto-picks). runProgram attaches the resume.
  return setPendingHandDiscardChoice(state, { controller: ctx.controller, victim: victim.id, candidates, sourceName: ctx.cardName });
}

// ===== EACH-PLAYER ===== discard (EP-2)
/**
 * Walk the discard CHAIN (CR 701.8 — the DISCARDING player chooses which cards). `queue` is the remaining
 * discarders, head-first, each `{ playerId, remaining }`. For each in turn:
 *   - eliminated / empty hand / nothing left to discard → drop and move on (no-op).
 *   - hand ≤ remaining → a FORCED whole-hand discard (no real choice): pitch every card inline, move on.
 *   - hand > remaining → a REAL choice: pause via setPendingDiscardChoice for THIS discarder (the driver
 *     pauses a human, auto-discards an AI's cheapest), carrying the current queue so resolveDiscardChoice
 *     can decrement + re-enter. Returns the paused state immediately.
 * When the queue empties with no pause, returns the advanced state (the program continues / resumes).
 * Hidden-info safe: the discarder is the chooser of their own hand. Shared by applyDiscard (the atom's
 * first entry) and runProgram.resolveDiscardChoice (each subsequent pick), so ONE implementation drives
 * both the inline and the interactive paths.
 */
export function advanceDiscardChain(state, { queue, sourceName = null }) {
  let next = state;
  let q = queue || [];
  while (q.length) {
    const head = q[0];
    const player = next.players?.[head.playerId];
    if (!player) { q = q.slice(1); continue; } // discarder left the game (CR 800.4a) → skip
    const hand = (player.hand || []).filter((c) => !c.token);
    if (head.remaining <= 0 || hand.length === 0) { q = q.slice(1); continue; }
    if (hand.length <= head.remaining) {
      // Forced — the whole hand goes (no card left to keep, so no decision). Pitch inline, no pause.
      for (const c of hand) {
        next = moveCardToZone(next, { playerId: head.playerId, fromZone: "hand", toZone: "graveyard", cardId: c.id });
      }
      next = logEvent(next, { kind: "spell-effect", effect: "discard", controller: head.playerId, discarded: hand.length, forced: true });
      q = q.slice(1);
      continue;
    }
    // A real choice (hand > remaining): pause for this discarder's single-card pick.
    const candidates = hand.map((c) => ({ id: c.id, name: c.name }));
    return setPendingDiscardChoice(next, { controller: head.playerId, remaining: head.remaining, candidates, queue: q, sourceName });
  }
  return next;
}

/**
 * ===== EACH-PLAYER ===== discard (EP-2) — "Target player discards N cards" (Mind Rot / Fugue — the
 * VICTIM chooses) and "Each player discards N cards" (Delirium Skeins — every player chooses their own).
 * CR 701.8: the discarding player picks the cards, so this routes through the resolution-time pending-
 * choice CHAIN (advanceDiscardChain) — a human discarder gets a picker, an AI discards its cheapest, and
 * N>1 / multiple discarders resolve as a sequence of single-card picks. who:"target" reads the player
 * target(s) chosen at cast; who:"eachPlayer" enumerates every player, the controller first (APNAP-stable,
 * deterministic). A zero/empty amount or no live target is a clean logged no-op.
 */
export function applyDiscard(state, atom, ctx) {
  const amount = effectiveAmount(atom, ctx);
  if (!Number.isFinite(amount) || amount <= 0) {
    return logEvent(state, { kind: "spell-effect", effect: "discard", who: atom.who || "target", amount: 0 });
  }
  let discarders;
  if (atom.who === "controller") {
    // LOOT-1 — the caster discards (draw-then-discard loot). A single discarder; the chain pauses for the
    // human to pick which cards / auto-discards the AI's cheapest, exactly like the each/target forms.
    discarders = state.players?.[ctx.controller] ? [ctx.controller] : [];
  } else if (atom.who === "eachPlayer") {
    const seen = new Set();
    discarders = [ctx.controller, ...opponentsOf(state, ctx.controller)]
      .filter((pid) => state.players?.[pid] && !seen.has(pid) && seen.add(pid));
  } else if (atom.who === "eachOpponent") {
    discarders = opponentsOf(state, ctx.controller).filter((pid) => state.players?.[pid]);
  } else {
    discarders = (ctx.targets || [])
      .filter((t) => t.type === "player" && state.players?.[t.id])
      .map((t) => t.id);
  }
  if (discarders.length === 0) {
    return logEvent(state, { kind: "spell-effect", effect: "discard", who: atom.who || "target", amount, discarders: 0 });
  }
  const queue = discarders.map((pid) => ({ playerId: pid, remaining: amount }));
  return advanceDiscardChain(state, { queue, sourceName: ctx.cardName || null });
}

/**
 * DISCARD clause parser — migrated from parseExtendedAtom (seam batch 23 / Wave C). The full who-scoped discard
 * family, original first-match order: target player (who:"target", targetType:"player") / each player
 * (who:"eachPlayer") / each opponent (who:"eachOpponent") / controller ("[you] discard N cards"). Numeric/spelled
 * N only — "at random" / "X" / "their hand" / "half" / any trailing rider fails the `$` anchor → low → Arbiter
 * (the victim chooses, CR 701.8 — the resolver walks the discard chain). Pure; uses the NUM_WORD leaf. Registered
 * via registerClauseParser in parser.js.
 */
export function discardClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  let m = t.match(/^target player discards (\d+|a|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "discard", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "target", targetType: "player" };
  m = t.match(/^each player discards (\d+|a|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "discard", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "eachPlayer", targetType: null };
  m = t.match(/^each opponent discards (\d+|a|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "discard", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "eachOpponent", targetType: null };
  m = t.match(/^(?:you )?discard (\d+|a|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/);
  if (m) return { op: "discard", amount: NUM_WORD[m[1]] ?? parseInt(m[1], 10), who: "controller", targetType: null };
  return null;
}

export const handResolvers = {
  "discard-chosen": applyDiscardChosen,
  "discard": applyDiscard, // ===== EACH-PLAYER ===== target/each player discards N — victim chooses (CR 701.8)
};
