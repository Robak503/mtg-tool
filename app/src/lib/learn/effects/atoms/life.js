/**
 * effects/atoms/life.js — life-total atoms (gain-life, lose-life).
 */

import { addPoison, logEvent, gainLife, loseLife, opponentsOf } from "../../gameState.js";
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
/**
 * POISON COUNTERS (CR 122 / 704.5c) — "Each opponent gets a poison counter." (Prologue to Phyresis,
 * Infectious Inquiry, Infectious Bite) and "Its controller gets a poison counter." (Pistus Strike).
 *
 * The poison TRACK has existed on player state since KW-POISON (gameState.addPoison, ten counters = loss),
 * and infect/toxic combat damage already feeds it — but no clause ever PARSED to it, so every card that
 * hands out poison outside combat was unmodelled. This is the parse+resolve pair, not a new subsystem.
 *
 * The `who` dispatch is a deliberate mirror of applyLoseLife below: same four recipients, same order, same
 * eliminated-player handling. Keeping them structurally identical is what stops the two drifting as new
 * recipient kinds are added — poison is a player resource like life, and it should read like one.
 */
/**
 * POISON clause parser (CR 122) — "<who> gets N poison counters."
 *   each opponent / each player  → non-targeted, who:"eachOpponent" | "eachPlayer"
 *   target player / target opponent → who:"target" + the matching targetType
 *   you                          → who:"controller"
 * Anchored whole-sentence. A qualified subject ("each opponent who attacked", "target player with …")
 * leaves residue, fails the `$`, and stays on the Arbiter — the same refusal every sibling player-payload
 * arm makes, and for the same reason: a recipient the engine can't restrict exactly is not a recipient.
 */
/**
 * INVESTIGATE for a NAMED player (CR 701.17a) — "Target player investigates." (Panther Pounce) and, via
 * the bound-referent arm, "Its controller investigates." (Fateful Absence).
 *
 * ⚠️ THE RECIPIENT FIELD IS `whoCreates`, NOT `who`. The Clue mint reads `whoCreates:"target"` off
 * ctx.targets (CR 111.2 — an effect may name a creator other than its controller). A first cut of this arm
 * emitted `who`, which the mint does not read, so every Clue went to the CASTER — the card classified
 * native while doing the wrong thing. The pre-existing actInvestigate pins caught it by name
 * ("a 3rd-person (wrong-owner) investigate is NOT native"), which is what those pins are for.
 *
 * ⛔ ONLY the single-target forms. `whoCreates` supports "target" or the controller and nothing else, so
 * "each opponent investigates" has no recipient the mint can honour and stays on the Arbiter — refusing is
 * the only honest option when the runtime cannot express the printed recipient.
 *
 * ⛔ "<who> shuffles their library" is deliberately NOT here. applyShuffle ignores any recipient and always
 * shuffles ctx.controller's library, so a target form would shuffle the CASTER's deck. That needs a
 * resolver dispatch, not a parse arm; measured worth 2 cards (Soldier of Fortune, Boggart Forager).
 */
export function playerInvestigateClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[\u2019]/g, "'").replace(/\.$/, "").trim();
  const m = t.match(/^(target player|target opponent) investigates$/);
  if (!m) return null;
  return { op: "create-named-token", token: "clue", count: 1, whoCreates: "target", targetType: m[1] === "target opponent" ? "opponent" : "player" };
}

export function poisonClauseParser(clause) {
  const t = String(clause || "").toLowerCase().replace(/[\u2019]/g, "'").replace(/\.$/, "").trim();
  const m = t.match(/^(each opponent|each player|target player|target opponent|you) gets? (a|an|one|two|three|\d+) poison counters?$/);
  if (!m) return null;
  const amount = /^\d+$/.test(m[2]) ? parseInt(m[2], 10) : { a: 1, an: 1, one: 1, two: 2, three: 3 }[m[2]];
  if (!amount) return null;
  const who = m[1] === "you" ? "controller"
    : m[1] === "each player" ? "eachPlayer"
    : m[1] === "each opponent" ? "eachOpponent"
    : "target";
  const targetType = who !== "target" ? null : (m[1] === "target opponent" ? "opponent" : "player");
  return { op: "add-poison", amount, who, targetType };
}

export function applyAddPoison(state, atom, ctx) {
  let next = state;
  const amount = Math.max(0, resolveScaledAmount(state, atom, ctx) || 0);
  if (amount === 0) return next;
  if (atom.who === "eachPlayer") {
    for (const pid of Object.keys(next.players)) {
      if (next.players[pid]) next = addPoison(next, { playerId: pid, amount });
    }
  } else if (atom.who === "eachOpponent") {
    for (const opp of opponentsOf(next, ctx.controller)) {
      if (next.players[opp]) next = addPoison(next, { playerId: opp, amount });
    }
  } else if (atom.who === "target") {
    // The chosen player travels in ctx.targets — and for the bound-referent form ("its controller") that
    // slice is the PROJECTED player, so this branch serves both without knowing which it got.
    for (const t of ctx.targets || []) {
      if (t.type === "player" && next.players[t.id]) next = addPoison(next, { playerId: t.id, amount });
    }
  } else if (atom.who === "controller" && next.players[ctx.controller]) {
    next = addPoison(next, { playerId: ctx.controller, amount });
  }
  return next;
}

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
  } else if (atom.who === "discardingPlayer") {
    // DISCARDING-PLAYER (CR 701.9a) — the player who just discarded, ctx.discardingPlayerId (threaded by
    // triggers.checkDiscardTriggers for the DISCARDED event). Absent (a spell / non-discard trigger) → a
    // clean no-op, never a fabricated loss or a wrong recipient. Mirrors the defendingPlayer/upkeepPlayer
    // referent resolvers, and matters more than most: the recipient here is the ability controller's
    // OPPONENT, so a fallback to ctx.controller would drain exactly the wrong seat.
    const pid = ctx.discardingPlayerId;
    if (pid && next.players[pid]) next = loseLife(next, { playerId: pid, amount });
  } else if (atom.who === "upkeepPlayer") {
    // UPKEEP-PLAYER (BLITZ TR-2 — Seizan, Perverter of Truth "that player loses 2 life …"): the player
    // whose upkeep it is, ctx.upkeepPlayerId (threaded by checkStepTriggers at every upkeep-step entry).
    // Absent (a spell / non-upkeep event) → a clean no-op, never a fabricated loss or a wrong recipient.
    const pid = ctx.upkeepPlayerId;
    if (pid && next.players[pid]) next = loseLife(next, { playerId: pid, amount });
  } else if (atom.who === "drawingPlayer") {
    // DRAWING-PLAYER (TP-3 — Scrawling Crawler "that player loses 1 life"): ctx.drawingPlayerId, threaded
    // by checkCardDrawnTriggers. Absent → a clean no-op, never a wrong recipient.
    const pid = ctx.drawingPlayerId;
    if (pid && next.players[pid]) next = loseLife(next, { playerId: pid, amount });
  } else if (atom.who === "castingPlayer") {
    // CASTING-PLAYER (TP-1 — Kambal, Consul of Allocation "that player loses 2 life and you gain 2 life"):
    // the seat that cast the spell, ctx.castingPlayerId (threaded by checkCastTriggers). Absent -> a clean
    // no-op, never a fabricated loss or a wrong recipient.
    const pid = ctx.castingPlayerId;
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
  // DYING REFERENT (CR 603.6e last-known information) — the DEATH-side sibling of the triggering-creature
  // arm above. "the dying creature's power" is the sentinel detectTriggers rewrites "its power" to on a
  // dies trigger; the ETB half of that same clause text rewrites to the TRIGGERING sentinel instead, because
  // only one of the two objects is still on the battlefield when the ability resolves.
  //
  // ⛔ countContext, NOT amountCount. The triggering/sacrificed arms read a live-or-stamped permanent
  // through countForSpec; the dying creature has LEFT, so its power exists only as the number checkDiesTriggers
  // captured on the death look-back (ctx.dyingPower). That is the SAME magnitude Lifeblood Hydra's collapsed
  // template and Feral Ghoul's rad payoff already read — one context key, three carriers, and now pinned to
  // the dies event by triggerRouting's referent gate so no other event can read it absent (→ a silent 0).
  const dyL = t.match(/^(?:you )?gain life equal to the dying creature's power$/);
  if (dyL) return { op: "gain-life", countContext: "dyingPower", targetType: null };
  // SACRIFICED REFERENT (CR 608.2h + 603.6e LKI) — the exact sibling of the triggering-creature arm above,
  // for the permanent sacrificed to pay this spell's ADDITIONAL COST: "you gain life equal to the sacrificed
  // creature's toughness" (Reckoner's Bargain #3671, Morbid Curiosity class). Same gain-life atom, same
  // amountCount shape; only the count KIND differs, and it resolves through the shared countForSpec
  // sacrificed* kinds off the stamp actionDispatcher writes at cost-payment time — the permanent is gone by
  // resolution, so it cannot be read from the board here. An unstamped cast reads 0 (a clean no-op).
  const sacL = t.match(/^(?:you )?gain life equal to the sacrificed (?:creature|permanent|artifact)'s (toughness|power|mana value)$/);
  if (sacL) {
    const kind = sacL[1] === "toughness" ? "sacrificedToughness" : sacL[1] === "power" ? "sacrificedPower" : "sacrificedManaValue";
    return { op: "gain-life", amountCount: { kind, per: 1 }, targetType: null };
  }
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
  // ===== UPKEEP-PLAYER LIFE LOSS (BLITZ TR-2, CR 503.1a / 119.3) ===== "the upkeep player loses N life" —
  // the SENTINEL detectTriggers emits for an "each player's upkeep" trigger's "that player loses N life"
  // (Seizan, Perverter of Truth's drain half). Corpus-clean phrase (only the event-gated rewrite produces
  // it); who:"upkeepPlayer" reads ctx.upkeepPlayerId, and the triggerRouting referent gate pins the atom to
  // the upkeep event (any other event leaves the referent unset → clean no-op). NON-targeted. FIXED-N only —
  // a scaled/half-life form ("loses half their life" — Havoc Festival) fails the `$` anchor → Arbiter.
  // ===== DISCARDING-PLAYER LIFE LOSS (CR 701.9a) ===== "the discarding player loses N life" — the sentinel
  // detectTriggers rewrites "that player loses N life" to on the `discarded` event (Liliana's Caress, Raiders'
  // Wake, Fell Specter). Structural twin of the upkeep-player arm below; only the ctx key differs.
  // who:"discardingPlayer" reads ctx.discardingPlayerId, and triggerRouting's referent gate pins the atom to
  // the discarded event so no other event can read it absent (→ 0 → a silently dropped clause).
  m = t.match(/^the discarding player loses (\d+) life$/);
  if (m) return { op: "lose-life", who: "discardingPlayer", amount: parseInt(m[1], 10), targetType: null };
  m = t.match(/^the upkeep player loses (\d+) life$/);
  if (m) return { op: "lose-life", amount: parseInt(m[1], 10), who: "upkeepPlayer", targetType: null };
  // ⭐ CASTING-PLAYER life loss (TP-1 — Kambal, Soot Imp, Yawgmoth's Edict, Scrawling Crawler): the same
  // structural twin, only the ctx key differs. Sentinel-gated exactly like its siblings above.
  m = t.match(/^the casting player loses (\d+) life$/);
  if (m) return { op: "lose-life", amount: parseInt(m[1], 10), who: "castingPlayer", targetType: null };
  // DRAWING-PLAYER life loss (TP-3 — Scrawling Crawler). Same twin, only the ctx key differs.
  m = t.match(/^the drawing player loses (\d+) life$/);
  if (m) return { op: "lose-life", amount: parseInt(m[1], 10), who: "drawingPlayer", targetType: null };
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

/**
 * ===== GY-OWNER-DRAIN (Bloodchief Ascension trigger 2 — SHELF S7) ===== "you may have that player lose N
 * life. If you do, you gain N2 life." on a gyEnter trigger — "that player" is the graveyard's owner
 * (ctx.gyOwnerId, threaded by checkGraveyardEventTriggers; the detectTriggers sentinel rewrite delivers
 * "the graveyard's owner" here, event-gated so no other referent reaches this atom). ONE composite atom:
 * the optional yes/no covers the whole drain, so the reflexive "If you do" is both-or-neither by
 * construction (never a lose without the gain). A missing/eliminated referent → logged no-op (never a
 * fabricated drain; the routing gate pins this atom to the one event whose context carries gyOwnerId).
 */
export function applyGyOwnerDrain(state, atom, ctx) {
  const pid = ctx.gyOwnerId;
  if (!pid || !state.players[pid]) {
    return logEvent(state, { kind: "spell-effect", effect: "gy-owner-drain-noop", controller: ctx.controller, reason: "no graveyard owner in context" });
  }
  let next = loseLife(state, { playerId: pid, amount: atom.lose || 0 });
  if ((atom.gain || 0) > 0 && next.players[ctx.controller]) {
    next = gainLife(next, { playerId: ctx.controller, amount: atom.gain });
    next = checkLifegainTriggers(next, ctx.controller, atom.gain); // CR 119.3 — the controller's "whenever you gain life"
  }
  return logEvent(next, { kind: "spell-effect", effect: "gy-owner-drain", controller: ctx.controller, target: pid, lose: atom.lose || 0, gain: atom.gain || 0 });
}

export const lifeResolvers = {
  "gain-life": applyGainLife,
  "lose-life": applyLoseLife,
  "add-poison": applyAddPoison,   // POISON (CR 122) — the parse+resolve pair for a track that already existed
  "drain-each-opponent": applyDrainEachOpponent, // DRAIN-X (Exsanguinate) — each opp loses X, you gain the total drained
  "gy-owner-drain": applyGyOwnerDrain, // GY-OWNER-DRAIN (Bloodchief Ascension) — the graveyard's owner loses N, you gain N2
};
