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
  // ONCE-PER-TURN gate (COUNTERS-PLACED — Earth Kingdom General "gain that much life. Do this only once each
  // turn."): if this source already fired its once-per-turn gain-life this turn, suppress it (safe no-op — the
  // trigger resolved, but the gain is skipped per CR's frequency restriction). Mirrors applyDiscoverAtom's
  // latch; only the controller "you gain" form carries oncePerTurn (the once-per-turn life corpus is "you gain").
  if (atom.oncePerTurn) {
    const gateKey = `${ctx.sourceId || ""}_gain-life`;
    if ((state.onceTriggersFiredThisTurn || {})[gateKey]) return state;
  }
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
  if (atom.who === "defendingPlayer") {
    // DEFENDING-PLAYER (CR 509.1a) — the per-attacker defending player gains (ctx.defenderId, set by
    // triggers.checkAttackTriggers for the ATTACKS event). Absent → a clean no-op. Fires the defending
    // player's lifegain triggers (CR 119.3), mirroring the targeted-gain resolver.
    const pid = ctx.defenderId;
    if (pid && next.players[pid]) {
      next = gainLife(next, { playerId: pid, amount });
      if (amount > 0) next = checkLifegainTriggers(next, pid, amount);
    }
    return logEvent(next, { kind: "spell-effect", effect: "gain-life", who: "defendingPlayer", amount });
  }
  next = gainLife(next, { playerId: ctx.controller, amount });
  // TRIG-LIFEGAIN (CR 119.3): the controller gained life → fire their "Whenever you gain life" triggers.
  if (amount > 0) next = checkLifegainTriggers(next, ctx.controller, amount);
  next = logEvent(next, { kind: "spell-effect", effect: "gain-life", controller: ctx.controller, amount });
  // Set the once-per-turn latch (regardless of the gained amount — the effect ran, so the gate is consumed).
  if (atom.oncePerTurn) {
    const gateKey = `${ctx.sourceId || ""}_gain-life`;
    next = { ...next, onceTriggersFiredThisTurn: { ...(next.onceTriggersFiredThisTurn || {}), [gateKey]: true } };
  }
  return next;
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
  } else if (atom.who === "defendingPlayer") {
    // DEFENDING-PLAYER (CR 509.1a) — the per-attacker defending player, ctx.defenderId (set by
    // triggers.checkAttackTriggers for the ATTACKS event). Absent (a spell / non-attack trigger) → a clean
    // no-op, never a fabricated loss or a wrong recipient. Mirrors the damagedPlayer referent resolvers.
    const pid = ctx.defenderId;
    if (pid && next.players[pid]) next = loseLife(next, { playerId: pid, amount });
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
  // ===== SOURCE-STAT (DYNAMIC-COUNT keystone) ===== "you gain life equal to the triggering creature's
  // toughness/power" — the amount is the TRIGGERING (entering) creature's layer-aware toughness/power at
  // resolution (Verdant Sun's Avatar "Whenever this creature or another creature you control enters, you gain
  // life equal to that creature's toughness"; the Archon of Redemption "…power" family). "the triggering
  // creature's …" is the SENTINEL detectTriggers rewrites "that creature's …" to (gated to the ETB
  // entering-creature scopes), so a SPELL's anaphoric "that creature's toughness" never reaches this matcher
  // and stays low → Arbiter (CREED — sentinel gate). amountCount → the shared countForSpec triggering-stat kind
  // (read off ctx.triggeringPermanentId); resolveScaledAmount computes it (× per:1). who:"controller" (you gain).
  const sst = t.match(/^(?:you )?gain life equal to the triggering creature's (toughness|power)$/);
  if (sst) return { op: "gain-life", amountCount: { kind: sst[1] === "toughness" ? "triggeringToughness" : "triggeringPower", per: 1 }, targetType: null };
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
  // ===== DEFENDING-PLAYER (CR 509.1a — the player being attacked) ===== "defending player loses N life" /
  // "defending player gains N life". who:"defendingPlayer" reads ctx.defenderId, the per-attacker defending
  // player carried by triggers.checkAttackTriggers (the ATTACKS event referent — distinct from the
  // combat-damage who:"damagedPlayer"). NON-targeted (the defender is the trigger's referent, not a chosen
  // target → targetType:null → routes natively on the attack-trigger flush, programNeedsChosenTarget → false),
  // and a clean no-op outside an attacks trigger (no ctx.defenderId → applyLoseLife's defendingPlayer branch
  // skips, never a fabricated loss or wrong recipient). The combat-damage referent gate in triggerRouting.js
  // restricts this referent to the ATTACKS event (a spell / non-attack trigger leaves it unset → Arbiter).
  // FIXED-N only; a for-each/scaled/rider form ("…equal to the number of …") fails the `$` anchor → Arbiter.
  // The compound "defending player loses N life and you gain N life" (Brutal Hordechief, Agate-Blade Assassin,
  // Campaign of Vengeance) splits on "and" upstream — this matcher takes the loss half, the controller "you
  // gain N life" matcher above takes the gain half.
  m = t.match(/^defending player loses (\d+) life$/);
  if (m) return { op: "lose-life", amount: parseInt(m[1], 10), who: "defendingPlayer", targetType: null };
  m = t.match(/^defending player gains (\d+) life$/);
  if (m) return { op: "gain-life", amount: parseInt(m[1], 10), who: "defendingPlayer", targetType: null };
  return null;
}

/**
 * ===== DRAIN-X (Exsanguinate) ===== "Each opponent loses X life. You gain life equal to the life lost this
 * way." (CR 118.10) — each opponent loses the chosen X (ctx.xValue), and the controller gains the SUM of life
 * ACTUALLY lost. "Life lost this way" counts the full amount each player lost regardless of going below 0
 * (CR 118.10 — losing 5 from 2 life is still 5 life lost), so the gain = X × (number of opponents who were
 * present to lose). Computed from the loss applied (X per living opponent), so an eliminated/missing opponent
 * contributes nothing (a clean count, never fabricated). Fires each opponent's life-loss path (loseLife) and
 * the controller's lifegain triggers on the total. X=0 (cast for free / X chosen 0) drains nothing and gains
 * nothing (CR 107.3). The amount comes ONLY from amountX → ctx.xValue (the matcher is X-gated); no fixed form.
 */
export function applyDrainEachOpponent(state, atom, ctx) {
  let next = state;
  const per = Math.max(0, atom.amountX ? (ctx.xValue || 0) : (atom.amount || 0));
  let lost = 0;
  for (const opp of opponentsOf(next, ctx.controller)) {
    if (!next.players[opp]) continue;
    next = loseLife(next, { playerId: opp, amount: per });
    lost += per; // CR 118.10 — life lost is the full amount, even past 0
  }
  if (lost > 0) {
    next = gainLife(next, { playerId: ctx.controller, amount: lost });
    next = checkLifegainTriggers(next, ctx.controller, lost); // CR 119.3 — the controller's "whenever you gain life"
  }
  return logEvent(next, { kind: "spell-effect", effect: "drain-each-opponent", controller: ctx.controller, per, lost });
}

export const lifeResolvers = {
  "gain-life": applyGainLife,
  "lose-life": applyLoseLife,
  "drain-each-opponent": applyDrainEachOpponent, // DRAIN-X (Exsanguinate) — each opp loses X, you gain the total drained
};
