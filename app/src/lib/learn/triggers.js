/**
 * triggers.js — triggered-ability detection + resolution (Phase-7 PR-5).
 *
 * Leaf module: imports ONLY gameState reads, so gameEngine/combat can import it
 * without a cycle (resolvers.js imports applyTriggerEffect from here in PR-6, so
 * this file must never import resolvers.js back). Detects triggered abilities
 * from a card's oracle text (the When/Whenever/At grammar, CR 603.1), matches
 * them to game events, and applies a small, FAIL-SAFE Phase-1 effect vocabulary
 * (gain/lose life, draw, damage-to-each-opponent). Anything it doesn't recognize
 * yields effect:null → the engine resolves it through the no-op/Arbiter path,
 * never a fabricated effect (CLAUDE.md §1.2).
 *
 * PR-5 ships detection + matching + application, all unit-tested, but NOTHING is
 * enqueued in a real game yet — the ETB/dies/step/attack hooks that call
 * triggersForEvent + enqueueTrigger land in PR-6..8.
 */

import {
  loseLife,
  gainLife,
  drawCards,
  opponentsOf,
  findPermanent,
  logEvent,
} from "./gameState.js";

const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
function parseCount(word) {
  if (word == null) return 1;
  const w = String(word).toLowerCase();
  return NUM_WORDS[w] ?? (parseInt(w, 10) || 1);
}
function oracleOf(card) {
  return String(card?.oracle || card?.oracle_text || "");
}
function typeStr(card) {
  return String(card?.type || card?.type_line || "");
}
function isCreaturePerm(perm) {
  return /Creature/.test(typeStr(perm?.card));
}

// ─── Detection ────────────────────────────────────────────────────────────────

/**
 * Split "<condition>, <effect>" (the text after the leading keyword, sans the
 * trailing period) into its parts, peeling off an "if <cond>," intervening
 * clause (CR 603.4) when present.
 */
function splitTriggerSentence(inner) {
  const firstComma = inner.indexOf(",");
  if (firstComma === -1) return null;
  const condition = inner.slice(0, firstComma).trim();
  let rest = inner.slice(firstComma + 1).trim();
  let interveningIf = null;
  if (/^if\b/i.test(rest)) {
    const nextComma = rest.indexOf(",");
    if (nextComma !== -1) {
      interveningIf = rest.slice(0, nextComma).replace(/^if\s+/i, "").trim();
      rest = rest.slice(nextComma + 1).trim();
    }
  }
  return { condition, effectClause: rest, interveningIf };
}

/**
 * Classify a trigger condition into { event, scope, whose } or null. selfRef is
 * "this <permanent>" or the card's own name. The CR 603.6d static guard makes
 * "enters tapped / enters with / as ~ enters" NOT an etb trigger.
 */
function classifyCondition(condRaw, cardName) {
  const c = condRaw.toLowerCase().trim();
  const nameL = String(cardName || "").toLowerCase();
  const selfRef = /\bthis\b/.test(c) || (nameL && c.includes(nameL));

  if (/\benters\b/.test(c) && !/\benters (the battlefield )?(tapped|with|as)\b/.test(c)) {
    if (selfRef) return { event: "etb", scope: "self", whose: "any" };
    if (/\banother creature\b/.test(c)) return { event: "etb", scope: "eachOtherCreature", whose: "any" };
    if (/\ba creature\b/.test(c)) return { event: "etb", scope: "eachCreature", whose: "any" };
  }
  if (/\bdies\b/.test(c)) {
    if (selfRef) return { event: "dies", scope: "self", whose: "any" };
    if (/\ba creature\b/.test(c)) return { event: "dies", scope: "eachCreature", whose: "any" };
  }
  if (/leaves the battlefield/.test(c) && selfRef) return { event: "ltb", scope: "self", whose: "any" };

  if (/beginning of (your|each) (upkeep|end step|draw step)/.test(c)) {
    const whose = /\beach\b/.test(c) ? "any" : "yours";
    const event = /end step/.test(c) ? "endStep" : /draw step/.test(c) ? "draw" : "upkeep";
    return { event, scope: "you", whose };
  }
  if (/\battacks\b/.test(c)) {
    if (selfRef) return { event: "attacks", scope: "self", whose: "any" };
    if (/a creature you control/.test(c)) return { event: "attacks", scope: "creatureYouControl", whose: "any" };
  }
  if (/\bblocks\b/.test(c) && selfRef) return { event: "blocks", scope: "self", whose: "any" };
  return null;
}

/**
 * Parse a Phase-1 trigger effect clause into a TriggerEffect, or null when it's
 * outside the bounded vocabulary (→ fail-safe no-op/Arbiter, never fabricated).
 */
function parseTriggerEffect(clauseRaw) {
  const c = clauseRaw.toLowerCase().trim();
  let m = c.match(/\bdraws?\s+(a|an|one|two|three|four|five|\d+)\s+cards?\b/);
  if (m) return { kind: "draw", amount: parseCount(m[1]), who: "controller" };
  m = c.match(/each opponent loses?\s+(\d+)\s+life/);
  if (m) return { kind: "loseLife", amount: parseInt(m[1], 10), who: "eachOpponent" };
  m = c.match(/deals?\s+(\d+)\s+damage to each opponent/);
  if (m) return { kind: "damage", amount: parseInt(m[1], 10), targetType: "eachOpponent" };
  m = c.match(/\bgains?\s+(\d+)\s+life/);
  if (m) return { kind: "gainLife", amount: parseInt(m[1], 10), who: "controller" };
  m = c.match(/\bloses?\s+(\d+)\s+life/);
  if (m) return { kind: "loseLife", amount: parseInt(m[1], 10), who: "controller" };
  return null;
}

const _detectCache = new WeakMap();

/**
 * All triggered abilities printed on a card, as serializable TriggerDescriptors.
 * Cached by card identity (the regex pass runs once per distinct card object).
 */
export function detectTriggers(card) {
  if (!card || typeof card !== "object") return [];
  if (_detectCache.has(card)) return _detectCache.get(card);
  const oracle = oracleOf(card);
  const out = [];
  if (oracle) {
    // Anchored at start / after a sentence boundary, like keywords.js — so a
    // mid-sentence "when" never false-matches.
    const re = /(?:^|[\n.;]\s*)(When|Whenever|At)\b\s+([^.]+)\./gi;
    let m;
    while ((m = re.exec(oracle)) !== null) {
      const inner = m[2].trim();
      const split = splitTriggerSentence(inner);
      if (!split) continue;
      const cls = classifyCondition(split.condition, card.name);
      if (!cls) continue;
      out.push({
        event: cls.event,
        scope: cls.scope,
        whose: cls.whose,
        optional: /\bmay\b/.test(split.effectClause.toLowerCase()),
        interveningIf: split.interveningIf,
        effect: parseTriggerEffect(split.effectClause),
        // Raw effect text so the flush stage (gameEngine, which can import the parser
        // without the triggers→parser→effectAtoms→triggers cycle) can parse it into a
        // full EffectProgram. P2.8 routes the rich-parsed program through the
        // EFFECT_PROGRAM resolver; `effect` stays the small fallback.
        effectClause: split.effectClause,
        sourceText: `${m[1]} ${inner}`,
      });
    }
  }
  _detectCache.set(card, out);
  return out;
}

/** Convenience: does this card have any trigger for the given event? */
export function hasTriggerFor(card, event) {
  return detectTriggers(card).some(d => d.event === event);
}

// ─── Matching ──────────────────────────────────────────────────────────────────

function scopeMatches(descriptor, sourcePermanent, triggeringPermanent) {
  switch (descriptor.scope) {
    case "self":
      return !triggeringPermanent || triggeringPermanent.id === sourcePermanent.id;
    case "you":
      return true; // step triggers — `whose` gates ownership
    case "eachCreature":
      return !!triggeringPermanent && isCreaturePerm(triggeringPermanent);
    case "eachOtherCreature":
      return !!triggeringPermanent && triggeringPermanent.id !== sourcePermanent.id && isCreaturePerm(triggeringPermanent);
    case "creatureYouControl":
      return !!triggeringPermanent && isCreaturePerm(triggeringPermanent) && triggeringPermanent.controller === sourcePermanent.controller;
    default:
      return false;
  }
}

function makePendingTrigger(descriptor, sourcePermanent, triggeringPermanent, triggeringContext) {
  const controller = sourcePermanent.controller;
  const context = {
    triggeringPermanentId: triggeringPermanent?.id,
    triggeringCardName: triggeringPermanent?.card?.name,
    triggeringController: triggeringPermanent?.controller,
    ...triggeringContext,
  };
  return {
    event: descriptor.event,
    source: { permanentId: sourcePermanent.id, cardId: sourcePermanent.card?.id, name: sourcePermanent.card?.name },
    controller,
    descriptor,
    context,
    targets: [],
    optional: descriptor.optional,
    // Serializable payload for flushTriggers -> stack. `resolver` MUST equal
    // RESOLVER_KEYS.TRIGGER_EFFECT — written as a literal so triggers.js stays a
    // leaf (resolvers.js imports applyTriggerEffect from here in PR-6).
    payload: {
      resolver: "trigger.effect",
      params: { effect: descriptor.effect, controller, targets: [], context },
    },
  };
}

/**
 * The PendingTriggers that fire for `event` from `sourcePermanent`, given the
 * object that caused the event (`triggeringPermanent`, may === source for
 * self-triggers) and any event extras (e.g. { defenderId }). Pure — returns data,
 * does not enqueue.
 */
export function triggersForEvent(state, { event, sourcePermanent, triggeringPermanent = null, triggeringContext = {} }) {
  if (!sourcePermanent?.card) return [];
  const descriptors = detectTriggers(sourcePermanent.card).filter(d => d.event === event);
  if (!descriptors.length) return [];
  const out = [];
  for (const d of descriptors) {
    if (!scopeMatches(d, sourcePermanent, triggeringPermanent)) continue;
    if (d.whose === "yours" && sourcePermanent.controller !== state.activePlayer) continue;
    out.push(makePendingTrigger(d, sourcePermanent, triggeringPermanent, triggeringContext));
  }
  return out;
}

/**
 * Enqueue dies triggers for a batch of creatures that just died (CR 603.6c).
 * `dead` is destroyLethalCreatures' return — [{ id, controller, name, card }],
 * the look-back snapshot (CR 603.10a), since the permanents are already in the
 * graveyard. For each death we fire its own "when this dies" trigger plus every
 * surviving battlefield watcher ("whenever a creature dies"). Pure — appends to
 * pendingTriggers and returns new state.
 *
 * Phase-1 limitation: simultaneously-dying watchers don't see each other's
 * deaths (a dead Blood Artist won't drain off another creature that died in the
 * same batch). The common case — a death + a surviving drain — is covered.
 */
export function checkDiesTriggers(state, dead) {
  if (!dead || !dead.length) return state;
  let fired = [];
  for (const d of dead) {
    if (!d?.card) continue;
    const lookBack = { id: d.id, controller: d.controller, card: d.card };
    fired = fired.concat(triggersForEvent(state, { event: "dies", sourcePermanent: lookBack, triggeringPermanent: lookBack }));
    for (const pid of Object.keys(state.players)) {
      for (const watcher of state.players[pid].battlefield) {
        fired = fired.concat(triggersForEvent(state, { event: "dies", sourcePermanent: watcher, triggeringPermanent: lookBack }));
      }
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * Enqueue step-boundary triggers (CR 603.2b) for the given event ("upkeep" /
 * "draw" / "endStep"). Scans every battlefield permanent; the descriptor's
 * `whose:"yours"` gate (applied in triggersForEvent) fires "your upkeep" only on
 * the controller's own turn while "each upkeep" fires on every turn. Pure.
 */
export function checkStepTriggers(state, event) {
  let fired = [];
  for (const pid of Object.keys(state.players)) {
    for (const perm of state.players[pid].battlefield) {
      fired = fired.concat(triggersForEvent(state, { event, sourcePermanent: perm }));
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * Enqueue attack triggers (CR 508.3) for the full declared-attacker batch in
 * state.combat.attackers: each attacker's own "whenever this attacks" plus every
 * "whenever a creature you control attacks" watcher the attacking player
 * controls. Context carries the defenderId. Pure.
 */
export function checkAttackTriggers(state) {
  const attackers = state.combat?.attackers || [];
  if (!attackers.length) return state;
  let fired = [];
  for (const a of attackers) {
    const lk = findPermanent(state, a.permanentId);
    if (!lk) continue;
    const attackerPerm = lk.permanent;
    const context = { defenderId: a.defender };
    // self ("this attacks") + the attacker's own "creature you control attacks"
    fired = fired.concat(triggersForEvent(state, { event: "attacks", sourcePermanent: attackerPerm, triggeringPermanent: attackerPerm, triggeringContext: context }));
    // other watchers the attacking player controls
    for (const watcher of state.players[a.attackingPlayer]?.battlefield || []) {
      if (watcher.id === attackerPerm.id) continue;
      fired = fired.concat(triggersForEvent(state, { event: "attacks", sourcePermanent: watcher, triggeringPermanent: attackerPerm, triggeringContext: context }));
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

// ─── Intervening-if (CR 603.4) ──────────────────────────────────────────────────

/**
 * Evaluate a trigger's intervening-if. Phase-1 recognizes a small condition
 * vocabulary; unknown conditions FAIL OPEN (return true) so we never fabricate a
 * "doesn't fire" outcome.
 */
export function checkInterveningIf(state, pendingTrigger) {
  const cond = pendingTrigger?.descriptor?.interveningIf;
  if (!cond) return true;
  const c = String(cond).toLowerCase();
  const player = state.players?.[pendingTrigger.controller];
  let m = c.match(/you have (\d+) or more life/);
  if (m) return (player?.life || 0) >= parseInt(m[1], 10);
  m = c.match(/you have (\d+) or (fewer|less) life/);
  if (m) return (player?.life || 0) <= parseInt(m[1], 10);
  m = c.match(/you control (\d+) or more (\w+)/);
  if (m) {
    const n = parseInt(m[1], 10);
    const re = new RegExp(m[2], "i");
    const count = (player?.battlefield || []).filter(p => re.test(typeStr(p.card))).length;
    return count >= n;
  }
  return true; // unknown → fail-open
}

// ─── Resolution ─────────────────────────────────────────────────────────────────

/**
 * Apply a Phase-1 TriggerEffect on resolution. Returns new state. Mirrors
 * spellEffects.resolveSpellEffect's structure (gain/lose life, draw,
 * damage-to-each-opponent). Targeted damage triggers are Phase-2 and resolve as
 * an honest "unresolved" log, never fabricated.
 */
export function applyTriggerEffect(state, { effect, controller, targets = [] }) {
  // `context` (the look-back snapshot) is accepted by callers but unused by the
  // Phase-1 effect vocabulary; targeted/contextual effects in Phase 2 will read it.
  if (!effect) return state; // fail-safe: unrecognized → no-op
  const amt = Math.max(0, effect.amount || 0);
  let next = state;
  switch (effect.kind) {
    case "gainLife":
      if (next.players[controller]) next = gainLife(next, { playerId: controller, amount: amt });
      return logEvent(next, { kind: "trigger-effect", effect: "gainLife", controller, amount: amt });
    case "loseLife":
      if (effect.who === "eachOpponent") {
        for (const opp of opponentsOf(next, controller)) if (next.players[opp]) next = loseLife(next, { playerId: opp, amount: amt });
      } else if (next.players[controller]) {
        next = loseLife(next, { playerId: controller, amount: amt });
      }
      return logEvent(next, { kind: "trigger-effect", effect: "loseLife", controller, who: effect.who, amount: amt });
    case "draw":
      if (next.players[controller]) next = drawCards(next, { playerId: controller, count: Math.max(0, effect.amount || 1) });
      return logEvent(next, { kind: "trigger-effect", effect: "draw", controller, amount: effect.amount });
    case "damage":
      if (effect.targetType === "eachOpponent") {
        for (const opp of opponentsOf(next, controller)) if (next.players[opp]) next = loseLife(next, { playerId: opp, amount: amt });
        return logEvent(next, { kind: "trigger-effect", effect: "damage", controller, targetType: "eachOpponent", amount: amt });
      }
      return logEvent(next, { kind: "trigger-effect-unresolved", controller, effect, targets });
    default:
      return logEvent(next, { kind: "trigger-effect-unresolved", controller, effect });
  }
}
