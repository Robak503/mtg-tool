/**
 * effects/atoms/life.js — life-total atoms (gain-life, lose-life).
 */

import { logEvent, gainLife, loseLife, opponentsOf } from "../../gameState.js";
import { checkLifegainTriggers } from "../../triggers.js";
import { resolveScaledAmount } from "./shared.js";
import { parseCountSource } from "../parseHelpers.js"; // seam batch 17: shared count-source parser (leaf, cycle-free) for the scaled life clauses

/** "You gain N life" (CR 119.3) — the spell's controller gains life. FOR-EACH: the amount may be a board
 *  count × per (resolveScaledAmount), e.g. "gain 2 life for each creature you control". who:"target" — the
 *  chosen player(s) gain ("Target player gains N life": Soothing Balm, Heroes' Reunion); each travels in
 *  ctx.targets and fires THAT player's lifegain triggers (mirrors applyLoseLife's targeted form). */
export function applyGainLife(state, atom, ctx) {
  let next = state;
  const amount = Math.max(0, resolveScaledAmount(state, atom, ctx) || 0);
  if (atom.who === "target") {
    for (const t of ctx.targets || []) {
      if (t.type === "player" && next.players[t.id]) {
        next = gainLife(next, { playerId: t.id, amount });
        if (amount > 0) next = checkLifegainTriggers(next, t.id, amount); // the TARGET's "whenever you gain life" triggers (CR 119.3)
      }
    }
    return logEvent(next, { kind: "spell-effect", effect: "gain-life", who: "target", amount });
  }
  next = gainLife(next, { playerId: ctx.controller, amount });
  // TRIG-LIFEGAIN (CR 119.3): the controller gained life → fire their "Whenever you gain life" triggers.
  if (amount > 0) next = checkLifegainTriggers(next, ctx.controller, amount);
  return logEvent(next, { kind: "spell-effect", effect: "gain-life", controller: ctx.controller, amount });
}

/** "You lose N life" / "Each opponent loses N life" / "Each player loses N life" (CR 119.3). Non-targeted.
 *  FOR-EACH: the amount may be a board count × per (resolveScaledAmount). */
export function applyLoseLife(state, atom, ctx) {
  let next = state;
  const amount = Math.max(0, resolveScaledAmount(state, atom, ctx) || 0);
  if (atom.who === "eachPlayer") {
    // ===== EACH-PLAYER ===== (EP-3) EVERY player loses N life (symmetric — Crushing Disappointment).
    // Non-targeted, so it resolves identically on a spell or a trigger. An eliminated player isn't in
    // state.players (skipped); loseLife to 0 lets the loss SBA fire at the next check, as elsewhere.
    for (const pid of Object.keys(next.players)) {
      if (next.players[pid]) next = loseLife(next, { playerId: pid, amount });
    }
  } else if (atom.who === "eachOpponent") {
    for (const opp of opponentsOf(next, ctx.controller)) {
      if (next.players[opp]) next = loseLife(next, { playerId: opp, amount });
    }
  } else if (atom.who === "target") {
    // DEATH-DRAIN-TARGETED — "target player/opponent loses N life" (Blood Artist family). The chosen player
    // travels in ctx.targets (the flush chooser / cast path picked an opponent — atomTargetIntent "enemy"),
    // mirroring the targeted-draw resolver. An eliminated / missing target is a clean no-op.
    for (const t of ctx.targets || []) {
      if (t.type === "player" && next.players[t.id]) next = loseLife(next, { playerId: t.id, amount });
    }
  } else {
    next = loseLife(next, { playerId: ctx.controller, amount });
  }
  return logEvent(next, { kind: "spell-effect", effect: "lose-life", who: atom.who || "controller", amount });
}

/**
 * LIFE clause parser (gain-life ⇄ lose-life) — co-extracted from parseExtendedAtom (seam batch 17 / Wave C).
 * TWO clusters, original first-match order preserved:
 *   SCALED FOR-EACH (parseCountSource leaf): "gain N life for each X" / "gain life equal to the number of X" /
 *     "each opponent loses N life for each X" / "each player loses N life for each X" / "lose N life for each X"
 *     — amountCount × per, computed at resolution; an unmodeled count source (parseCountSource → null) drops the
 *     whole clause → low → Arbiter (the `src ? … : null`).
 *   FIXED-N: "you gain N life" / "you lose N life" (controller) / "each opponent loses N life" / "target
 *     player|opponent loses N life" (who:"target", offensive — atomTargetIntent → enemy) / "each player loses N
 *     life" (symmetric). Numeric N only; a for-each/scaled/rider variant fails the `$` anchor → Arbiter.
 * The draw "for each"/"equal to the number of" branches sit ABOVE these in parseExtendedAtom and STAY inline —
 * they use a disjoint "draw …" anchor (no cross-match), so leaving them while lifting the life branches is
 * order-safe. Pure; uses the parseCountSource leaf. Registered via registerClauseParser in parser.js.
 */
export function lifeClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[’]/g, "'");
  let mfe = t.match(/^(?:you )?gain (\d+) life for each (.+)$/);
  if (mfe) {
    const src = parseCountSource(mfe[2]);
    return src ? { op: "gain-life", amountCount: { ...src, per: parseInt(mfe[1], 10) }, targetType: null } : null;
  }
  mfe = t.match(/^(?:you )?gain life equal to the number of (.+)$/);
  if (mfe) {
    const src = parseCountSource(mfe[1]);
    return src ? { op: "gain-life", amountCount: { ...src, per: 1 }, targetType: null } : null;
  }
  mfe = t.match(/^each opponent loses (\d+) life for each (.+)$/);
  if (mfe) {
    const src = parseCountSource(mfe[2]);
    return src ? { op: "lose-life", who: "eachOpponent", amountCount: { ...src, per: parseInt(mfe[1], 10) }, targetType: null } : null;
  }
  mfe = t.match(/^each player loses (\d+) life for each (.+)$/);
  if (mfe) {
    const src = parseCountSource(mfe[2]);
    return src ? { op: "lose-life", who: "eachPlayer", amountCount: { ...src, per: parseInt(mfe[1], 10) }, targetType: null } : null;
  }
  mfe = t.match(/^(?:you )?lose (\d+) life for each (.+)$/);
  if (mfe) {
    const src = parseCountSource(mfe[2]);
    return src ? { op: "lose-life", who: "controller", amountCount: { ...src, per: parseInt(mfe[1], 10) }, targetType: null } : null;
  }
  let m = t.match(/^(?:you )?gain (\d+) life$/);
  if (m) return { op: "gain-life", amount: parseInt(m[1], 10), targetType: null };
  m = t.match(/^(?:you )?lose (\d+) life$/);
  if (m) return { op: "lose-life", amount: parseInt(m[1], 10), who: "controller", targetType: null };
  m = t.match(/^each opponent loses (\d+) life$/);
  if (m) return { op: "lose-life", amount: parseInt(m[1], 10), who: "eachOpponent", targetType: null };
  m = t.match(/^target (player|opponent) loses (\d+) life$/);
  if (m) return { op: "lose-life", amount: parseInt(m[2], 10), who: "target", targetType: m[1] };
  m = t.match(/^target player gains (\d+) life$/);
  if (m) return { op: "gain-life", amount: parseInt(m[1], 10), who: "target", targetType: "player" }; // LIFE-GAIN-TARGET — applyGainLife who:"target"
  m = t.match(/^each player loses (\d+) life$/);
  if (m) return { op: "lose-life", amount: parseInt(m[1], 10), who: "eachPlayer", targetType: null };
  return null;
}

export const lifeResolvers = {
  "gain-life": applyGainLife,
  "lose-life": applyLoseLife,
};
