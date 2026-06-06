/**
 * spellEffects.js — bounded oracle-text spell effects for the learn engine.
 *
 * Instants and sorceries used to resolve as a no-op (only permanents did
 * anything). This parses the COMMON single-effect patterns and resolves them,
 * so removal/burn/draw actually work:
 *   - damage  — "deals N damage to <target | any target | each opponent | each creature>"
 *   - destroy — "destroy target creature"
 *   - draw    — "draw N cards" (controller)
 *
 * Targeting reuses the engine's action-expansion pattern (one cast-spell action
 * per legal target, like multi-defender combat). Anything we don't recognize
 * falls back to the existing no-op-with-log resolver — honest and bounded, not
 * a general rules engine. Pump / counters / "until end of turn" / modal /
 * conditional effects are deferred.
 *
 * Pure: every function returns data or a new state; no mutation, no fetch.
 */

import {
  loseLife,
  drawCards,
  moveCardToZone,
  findPermanent,
  markCombatDamage,
  destroyLethalCreatures,
  logEvent,
  opponentsOf,
  creaturePower,
  creatureToughness,
} from "./gameState.js";
import { checkDiesTriggers } from "./triggers.js";

const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

function typeOf(card) {
  return String(card?.type || card?.type_line || "");
}
function isCreature(card) {
  return typeOf(card).includes("Creature");
}

// ─── Parse ──────────────────────────────────────────────────────────────────

/**
 * Parse an instant/sorcery's oracle into an effect descriptor, or null when
 * it's a permanent (those enter the battlefield) or we don't recognize it.
 *
 *   { kind: "damage", amount, targetType: "creature"|"player"|"any"|"eachOpponent"|"eachCreature" }
 *   { kind: "destroy", targetType: "creature" }
 *   { kind: "draw", amount, targetType: null }
 */
export function parseSpellEffect(card) {
  if (!/Instant|Sorcery/.test(typeOf(card))) return null;
  const oracle = String(card?.oracle || card?.oracle_text || "");
  if (!oracle) return null;

  // Damage.
  let m = oracle.match(/deals?\s+(\d+)\s+damage\s+to\s+([^.]+)/i);
  if (m) {
    const amount = parseInt(m[1], 10);
    const tgt = m[2].toLowerCase();
    if (/each opponent/.test(tgt)) return { kind: "damage", amount, targetType: "eachOpponent" };
    if (/each creature/.test(tgt)) return { kind: "damage", amount, targetType: "eachCreature" };
    if (/any target/.test(tgt)) return { kind: "damage", amount, targetType: "any" };
    if (/target creature or (player|planeswalker)/.test(tgt)) return { kind: "damage", amount, targetType: "any" };
    if (/target (player|opponent)/.test(tgt)) return { kind: "damage", amount, targetType: "player" };
    if (/target[^,]*creature/.test(tgt)) return { kind: "damage", amount, targetType: "creature" };
    return null; // unrecognized damage target
  }

  // Destroy target creature (other destroy targets deferred).
  m = oracle.match(/destroy\s+target\s+([^.]+)/i);
  if (m && /creature/.test(m[1].toLowerCase())) {
    return { kind: "destroy", targetType: "creature" };
  }

  // Draw N cards (controller). "draws" (someone else) intentionally doesn't match.
  m = oracle.match(/\bdraw\s+(a|an|one|two|three|four|five|\d+)\s+cards?\b/i);
  if (m) {
    const w = m[1].toLowerCase();
    const amount = NUM_WORDS[w] ?? (parseInt(w, 10) || 1);
    return { kind: "draw", amount, targetType: null };
  }

  // Pump: "target creature gets +X/+Y until end of turn" (Giant Growth family).
  // Anchored to the whole clause so a rider/restriction variant doesn't match here;
  // the EffectProgram clean-clause gate is the second line of defense. Resolution
  // is the P2.3 `pump` atom (a CR 613.4c layer-7c effect), not the legacy
  // resolveSpellEffect (which has no pump branch and is no longer the cast path).
  m = oracle.match(/target creature gets ([+-]\d+)\/([+-]\d+)\s+until end of turn/i);
  if (m) {
    return { kind: "pump", targetType: "creature", ptDelta: { p: parseInt(m[1], 10), t: parseInt(m[2], 10) }, duration: "endOfTurn" };
  }

  return null;
}

/** Does this effect need the caster to choose a target? */
export function effectNeedsTarget(effect) {
  return !!effect && !!effect.targetType && !["eachOpponent", "eachCreature"].includes(effect.targetType);
}

// ─── Target enumeration ───────────────────────────────────────────────────────

/**
 * Legal targets for a targeted effect, as `{ type, id, controller?, name }`.
 * Empty for non-targeted effects (draw, each-opponent, each-creature).
 */
export function enumerateTargets(state, controllerId, effect) {
  if (!effectNeedsTarget(effect)) return [];
  const out = [];
  const addCreatures = () => {
    for (const pid of Object.keys(state.players)) {
      for (const perm of state.players[pid].battlefield) {
        if (isCreature(perm.card)) out.push({ type: "creature", id: perm.id, controller: pid, name: perm.card?.name });
      }
    }
  };
  const addPlayers = () => {
    for (const pid of Object.keys(state.players)) out.push({ type: "player", id: pid, name: pid });
  };
  if (effect.targetType === "creature") addCreatures();
  else if (effect.targetType === "player") addPlayers();
  else if (effect.targetType === "any") { addCreatures(); addPlayers(); }
  return out;
}

// ─── AI target selection ──────────────────────────────────────────────────────

function powerOf(state, t) {
  const lk = findPermanent(state, t.id);
  return lk ? creaturePower(lk.permanent, state) : 0;
}
function toughOf(state, t) {
  const lk = findPermanent(state, t.id);
  return lk ? creatureToughness(lk.permanent, state) : 0;
}

/**
 * The AI's target pick for a damage/destroy spell. Only ever targets an enemy;
 * returns null when there's no good enemy target (so the AI won't, say, destroy
 * its own creature). Heuristics: destroy the biggest enemy creature; burn the
 * biggest enemy creature it can kill, else the lowest-life enemy player.
 */
export function chooseAITarget(state, aiPlayerId, effect, targets) {
  if (!targets || targets.length === 0) return null;
  const enemies = new Set(opponentsOf(state, aiPlayerId));
  const enemyCreatures = targets.filter(t => t.type === "creature" && enemies.has(t.controller));
  const enemyPlayers = targets.filter(t => t.type === "player" && enemies.has(t.id));

  if (effect.kind === "destroy") {
    if (!enemyCreatures.length) return null;
    return [...enemyCreatures].sort((a, b) => powerOf(state, b) - powerOf(state, a))[0];
  }
  if (effect.kind === "damage") {
    const killable = enemyCreatures.filter(t => toughOf(state, t) > 0 && toughOf(state, t) <= effect.amount);
    if (killable.length) return killable.sort((a, b) => powerOf(state, b) - powerOf(state, a))[0];
    if (enemyPlayers.length) return [...enemyPlayers].sort((a, b) => state.players[a.id].life - state.players[b.id].life)[0];
    if (enemyCreatures.length) return [...enemyCreatures].sort((a, b) => powerOf(state, b) - powerOf(state, a))[0];
    return null;
  }
  return null;
}

// ─── Resolution ───────────────────────────────────────────────────────────────

/**
 * Per-effect resolution helpers — the single source of truth for each effect's
 * state mutation. `resolveSpellEffect` (the legacy `spell.effect` resolver) AND
 * the Phase-2 EffectProgram atoms (`effects/effectAtoms.js`) both call these, so
 * the interpreter's atoms are byte-for-byte equivalent to the legacy path by
 * construction — there is no second implementation to drift.
 */
export function applyDrawEffect(state, { controller, amount }) {
  const next = drawCards(state, { playerId: controller, count: Math.max(0, amount || 1) });
  return logEvent(next, { kind: "spell-effect", effect: "draw", controller, amount });
}

export function applyDestroyEffect(state, { controller, targets = [] }) {
  let next = state;
  const dead = [];
  for (const t of targets) {
    if (t.type !== "creature") continue;
    const lk = findPermanent(next, t.id);
    if (lk) {
      // Capture the look-back BEFORE the move (CR 603.10a), then destroy.
      dead.push({ id: t.id, controller: lk.controller, name: lk.permanent.card?.name, card: lk.permanent.card });
      next = moveCardToZone(next, { playerId: lk.controller, fromZone: "battlefield", toZone: "graveyard", cardId: t.id });
    }
  }
  next = checkDiesTriggers(next, dead);
  return logEvent(next, { kind: "spell-effect", effect: "destroy", controller, targets: targets.map(t => t.id) });
}

export function applyDamageEffect(state, { controller, amount: rawAmount, targetType, targets = [] }) {
  let next = state;
  const amount = Math.max(0, rawAmount || 0);
  if (targetType === "eachOpponent") {
    for (const opp of opponentsOf(next, controller)) if (next.players[opp]) next = loseLife(next, { playerId: opp, amount });
  } else if (targetType === "eachCreature") {
    for (const pid of Object.keys(next.players)) {
      for (const perm of next.players[pid].battlefield) {
        if (isCreature(perm.card)) next = markCombatDamage(next, { permanentId: perm.id, amount });
      }
    }
  } else {
    for (const t of targets) {
      if (t.type === "player" && next.players[t.id]) next = loseLife(next, { playerId: t.id, amount });
      else if (t.type === "creature" && findPermanent(next, t.id)) next = markCombatDamage(next, { permanentId: t.id, amount });
    }
  }
  const dmgResult = destroyLethalCreatures(next);
  next = checkDiesTriggers(dmgResult.state, dmgResult.dead);
  return logEvent(next, { kind: "spell-effect", effect: "damage", controller, amount, targets: targets.map(t => t.id) });
}

/**
 * Apply a parsed effect on resolution. Returns a new state. Damage runs the
 * shared lethal SBA so creatures it kills hit the graveyard. Delegates to the
 * per-effect helpers above (which the EffectProgram atoms also use).
 */
export function resolveSpellEffect(state, { effect, controller, targets = [] }) {
  if (!effect) return state;
  if (effect.kind === "draw") return applyDrawEffect(state, { controller, amount: effect.amount });
  if (effect.kind === "destroy") return applyDestroyEffect(state, { controller, targets });
  if (effect.kind === "damage") {
    return applyDamageEffect(state, { controller, amount: effect.amount, targetType: effect.targetType, targets });
  }
  return state;
}
