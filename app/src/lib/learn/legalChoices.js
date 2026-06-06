/**
 * Phase 6 — Learn-to-Play: legalChoices.js
 *
 * Given a GameState and a player who currently holds priority (or is
 * declaring attackers/blockers), generate the list of legal actions
 * they can take. The decisionGate (PR5) presents these to the user
 * (Beginner: ask every time, Intermediate: auto+confirm, Expert:
 * silent-pick).
 *
 * Scope (per design doc §5 step 3):
 *   - pass-priority
 *   - play-land   (sorcery-speed, own main, stack empty, ≤1 land per turn)
 *   - cast-spell  (sorcery vs instant timing; mana-cost can-afford check)
 *   - declare-attacker candidates (untapped creatures, no summoning sick
 *                                   unless haste; own creatures only)
 *   - declare-blocker candidates  (untapped creatures of the defending
 *                                   player against an active attacker)
 *
 * Deferred to later PRs:
 *   - Activate-ability (needs an ability schema layer)
 *   - Target selection (caller picks; legalChoices just exposes that
 *     targets are required and how many)
 *   - Complex cost-payment beyond plain mana costs (life, tap-this,
 *     sacrifice, etc.) — surfaces as needsCostPayment: true so the
 *     decisionGate / Arbiter handle it
 *   - Modes / X-spells / hybrid pips beyond the parser hint
 *
 * Pure: takes a GameState, returns plain JS arrays/objects. No mutation,
 * no fetch.
 */

import { getZone, opponentOf, opponentsOf, totalAvailableMana } from "./gameState.js";
import { canAfford, manaSources, manaProduction } from "./manaModel.js";
import { hasKeyword } from "./keywords.js";
import { permanentHasKeyword } from "./layers.js";
import { parseSpellEffect, enumerateTargets, effectNeedsTarget } from "./spellEffects.js";

// ─── Mana cost parser + can-afford check ──────────────────────────────────────

const SINGLE_COLORS = new Set(["W", "U", "B", "R", "G"]);

/**
 * Parse a mana cost string like "{2}{U}{U}" into a structured object:
 *   { generic: 2, W: 0, U: 2, B: 0, R: 0, G: 0, C: 0, hasX: false,
 *     hybrid: [], phyrexian: [], anyColor: 0 }
 *
 * Conventions:
 *   - Plain digits → generic (treated as a single chunk; "{10}" → 10)
 *   - W/U/B/R/G  → that color's pip
 *   - C          → colorless (distinct from generic — only colorless mana works)
 *   - X/Y/Z      → hasX flag (caller picks value; 0 used in can-afford check)
 *   - Hybrid {W/U} or {2/U} or {U/P} (phyrexian) → tracked in arrays; the
 *     can-afford check uses the cheaper option per pip (a rough but
 *     workable heuristic for v1)
 *
 * This parser is forgiving: malformed pips are silently dropped rather
 * than throwing, because cardpool variance is real and we'd rather
 * surface "can't afford" than crash the engine. The Arbiter can be
 * consulted for the unusual ones.
 */
export function parseManaCost(costString) {
  const cost = {
    generic: 0,
    W: 0, U: 0, B: 0, R: 0, G: 0, C: 0,
    hasX: false,
    hybrid: [],     // [["W","U"], ...]
    phyrexian: [],  // ["U","B",...] — can be paid with 2 life
    anyColor: 0,    // count of "any color" pips (rare)
  };
  if (typeof costString !== "string" || !costString) return cost;

  const pips = [...costString.matchAll(/\{([^}]+)\}/g)].map(m => m[1].trim());
  for (const raw of pips) {
    const pip = raw.toUpperCase();

    // Plain integer → generic.
    if (/^\d+$/.test(pip)) {
      cost.generic += parseInt(pip, 10);
      continue;
    }
    // X / Y / Z
    if (pip === "X" || pip === "Y" || pip === "Z") {
      cost.hasX = true;
      continue;
    }
    // Single color
    if (SINGLE_COLORS.has(pip)) {
      cost[pip] += 1;
      continue;
    }
    if (pip === "C") {
      cost.C += 1;
      continue;
    }
    // Phyrexian pip — "{U/P}" or "{W/P}"
    if (/^[WUBRG]\/P$/.test(pip)) {
      cost.phyrexian.push(pip[0]);
      continue;
    }
    // Hybrid — "{W/U}" or "{2/W}" or rare "{B/G/P}"
    if (pip.includes("/")) {
      const parts = pip.split("/").filter(p => p && p !== "P");
      cost.hybrid.push(parts);
      continue;
    }
    // Unknown — leave it dropped. Arbiter territory.
  }
  return cost;
}

/**
 * Check whether a player's current mana pool can pay a parsed cost.
 * Conservative: hybrid pips check whether either option is payable
 * (preferring the colored side when both are color pips); phyrexian
 * pips are NOT counted toward the mana cost in v1 (the caller can
 * opt to pay 2 life — surfaced via canAffordWithPhyrexian).
 *
 * Returns true/false. No "how would you pay" plan — that's PR4.
 */
export function canPayManaCost(manaPool, cost) {
  if (!cost) return true;
  let remaining = { ...manaPool };
  const subtract = (color, amount) => {
    if ((remaining[color] || 0) < amount) return false;
    remaining = { ...remaining, [color]: (remaining[color] || 0) - amount };
    return true;
  };

  // Colored pips first (they're hardest to pay).
  for (const color of ["W", "U", "B", "R", "G", "C"]) {
    if ((cost[color] || 0) > 0 && !subtract(color, cost[color])) return false;
  }
  // Hybrid pips: try the cheapest payable side.
  for (const options of cost.hybrid) {
    let paid = false;
    for (const opt of options) {
      if (/^\d+$/.test(opt)) {
        // Numeric side of a {2/W} pip — would pay 2 generic. Skip for
        // now and rely on the colored side; if that fails we'll see
        // can-afford = false. Engineering simplicity > completeness in v1.
        continue;
      }
      if ((remaining[opt] || 0) > 0) {
        remaining = { ...remaining, [opt]: remaining[opt] - 1 };
        paid = true;
        break;
      }
    }
    if (!paid) return false;
  }
  // Generic — any mana works (colored counts as generic).
  if (cost.generic > 0) {
    const totalRemaining = Object.values(remaining).reduce((s, v) => s + v, 0);
    if (totalRemaining < cost.generic) return false;
  }
  return true;
}

/**
 * Total mana value (CMC) from a parsed cost. Used for sort hints and
 * curve analysis, not legality. X counts as 0 here.
 */
export function totalCmc(cost) {
  return (cost.generic || 0)
    + (cost.W || 0) + (cost.U || 0) + (cost.B || 0) + (cost.R || 0) + (cost.G || 0)
    + (cost.C || 0)
    + cost.hybrid.length
    + cost.phyrexian.length;
}

// ─── Card type predicates ────────────────────────────────────────────────────

function typeLineOf(card) {
  if (!card) return "";
  if (typeof card.type === "string" && card.type) return card.type;
  if (typeof card.type_line === "string") return card.type_line;
  // DFC fallback — front face.
  if (Array.isArray(card.card_faces) && card.card_faces[0]) {
    return card.card_faces[0].type_line || card.card_faces[0].type || "";
  }
  return "";
}

function isLand(card)        { return typeLineOf(card).includes("Land"); }
function isInstant(card)     { return typeLineOf(card).includes("Instant"); }
function isCreature(card)    { return typeLineOf(card).includes("Creature"); }
function isSorcerySpeed(card) {
  const type = typeLineOf(card);
  // Sorcery-speed = anything that ISN'T Instant and isn't "flash" tagged.
  // Flash check is a v1.5 add — for now any non-instant defaults to sorcery.
  return !type.includes("Instant");
}
// hasKeyword is imported from keywords.js (oracle-aware) — a local copy here
// previously shadowed it (keyword-array-only, oracle-blind), so Haste / Flying
// checks silently failed on real cards that carry oracle text but no keywords
// array. Removed; all call sites now use the import.

function manaCostOf(card) {
  if (!card) return "";
  if (typeof card.mana === "string") return card.mana;
  if (typeof card.mana_cost === "string") return card.mana_cost;
  if (Array.isArray(card.card_faces) && card.card_faces[0]) {
    return card.card_faces[0].mana_cost || card.card_faces[0].mana || "";
  }
  return "";
}

// ─── Timing rules ─────────────────────────────────────────────────────────────

/**
 * Can the player cast a sorcery-speed card right now?
 * Per CR 307.1: only during own main phase, when the stack is empty,
 * and only the active player. Lands follow the same window.
 */
function canCastSorcerySpeed(state, playerId) {
  return (
    state.activePlayer === playerId &&
    state.priorityHolder === playerId &&
    state.stack.length === 0 &&
    (state.phase === "precombat-main" || state.phase === "postcombat-main") &&
    state.step === "main"
  );
}

/**
 * Can the player cast an instant-speed card right now?
 * Per CR 307.1: any time you have priority. We don't validate priority
 * timing windows further (e.g., during damage resolution); the engine
 * surfaces priority via state.priorityHolder.
 */
function canCastInstantSpeed(state, playerId) {
  return state.priorityHolder === playerId;
}

// ─── Action generators ───────────────────────────────────────────────────────

function actionPassPriority(playerId) {
  return { kind: "pass-priority", playerId };
}

function actionsPlayLand(state, playerId) {
  if (!canCastSorcerySpeed(state, playerId)) return [];
  const player = state.players[playerId];
  if (player.landsPlayedThisTurn >= 1) return [];

  return player.hand
    .filter(card => isLand(card))
    .map(card => ({
      kind: "play-land",
      playerId,
      cardId: card.id,
      name: card.name,
    }));
}

function actionsCastSpell(state, playerId) {
  const player = state.players[playerId];
  const actions = [];

  for (const card of player.hand) {
    if (isLand(card)) continue;

    const sorcerySpeed = isSorcerySpeed(card);
    const timingOk = sorcerySpeed
      ? canCastSorcerySpeed(state, playerId)
      : canCastInstantSpeed(state, playerId);
    if (!timingOk) continue;

    const cost = parseManaCost(manaCostOf(card));
    // Castable if the pool PLUS what untapped lands/rocks/dorks could produce
    // covers the cost — the dispatcher auto-taps to pay. (Pool-only would
    // never be castable since nothing pre-fills it.)
    const affordable = canAfford(player.manaPool, manaSources(state, playerId), cost);
    if (!affordable) continue;

    const effect = parseSpellEffect(card);
    const base = {
      kind: "cast-spell",
      playerId,
      cardId: card.id,
      name: card.name,
      cost,
      cmc: totalCmc(cost),
      effect: effect || null,
    };

    if (effectNeedsTarget(effect)) {
      // Targeted spell: one cast action per legal target (the action-expansion
      // pattern, same as multi-defender combat). No legal target → can't cast.
      const targets = enumerateTargets(state, playerId, effect);
      if (targets.length === 0) continue;
      for (const t of targets) {
        actions.push({ ...base, targets: [t], targetName: t.name, needsTargets: true });
      }
    } else {
      actions.push({ ...base, targets: [], needsTargets: false });
    }
  }
  return actions;
}

/**
 * Tap-for-mana: any untapped mana source the player controls, one action per
 * (source, color) so a dual surfaces "tap for W" and "tap for U" separately.
 * Mana abilities are technically instant-speed (CR 605.3a), but surfacing
 * them at every priority window would spam the learner. v1 gates to the
 * player's OWN main phase — the window where you'd float mana to cast or to
 * pump Omnath. Casting still auto-taps at any speed via the dispatcher, so
 * this action is only the explicit manual-tap / float path (Beginner +
 * floating-mana decks). Auto modes ignore it, so they never loop on it.
 */
function actionsTapForMana(state, playerId) {
  if (state.activePlayer !== playerId) return [];
  if (state.priorityHolder !== playerId) return [];
  if (state.step !== "main") return [];
  const player = state.players[playerId];
  const actions = [];
  for (const perm of player.battlefield) {
    if (perm.tapped) continue;
    const prod = manaProduction(perm.card);
    if (!prod) continue;
    const isCreature = /Creature/.test(String(perm.card?.type || perm.card?.type_line || ""));
    // Granted Haste counts here too (a lord that hastes your mana dorks).
    if (isCreature && perm.summoningSick && !permanentHasKeyword(state, perm.id, "Haste")) continue;
    for (const color of prod.colors) {
      actions.push({
        kind: "tap-for-mana",
        playerId,
        permanentId: perm.id,
        color,
        amount: prod.amount,
        name: perm.card.name,
      });
    }
  }
  return actions;
}

function actionsDeclareAttacker(state, playerId) {
  // Only the active player declares attackers, and only in the
  // declare-attackers step. legalChoices doesn't enforce step phase
  // hard — the caller passes the step intent. We check explicitly.
  if (state.activePlayer !== playerId) return [];
  if (state.step !== "declare-attackers") return [];

  // Creatures already attacking this combat can't be re-declared. Tapping on
  // attack already excludes most, but a Vigilance attacker stays untapped —
  // this set is what stops it (and any future no-tap attacker) from looping.
  const declared = new Set((state.combat?.attackers || []).map(a => a.permanentId));
  const player = state.players[playerId];
  const attackers = player.battlefield
    .filter(p => isCreature(p.card))
    .filter(p => !p.tapped)
    .filter(p => !declared.has(p.id))
    // Granted Haste (Concordant Crossroads, sliver) counts, not just printed.
    .filter(p => !p.summoningSick || permanentHasKeyword(state, p.id, "Haste"));

  // Standard (a lone opponent): the dispatcher auto-fills the defender, so emit
  // one action per creature — unchanged shape.
  const defenders = opponentsOf(state, playerId);
  if (defenders.length <= 1) {
    return attackers.map(p => ({
      kind: "declare-attacker",
      playerId,
      permanentId: p.id,
      name: p.card.name,
    }));
  }

  // Commander (multiple opponents): each attacker contributes one action per
  // legal defender (CR 506.2) — the player picks who each creature swings at.
  const actions = [];
  for (const p of attackers) {
    for (const defenderId of defenders) {
      actions.push({
        kind: "declare-attacker",
        playerId,
        permanentId: p.id,
        name: p.card.name,
        defenderId,
      });
    }
  }
  return actions;
}

function actionsDeclareBlocker(state, playerId, declaredAttackers = []) {
  if (state.activePlayer === playerId) return [];  // active player attacks, doesn't block
  if (state.step !== "declare-blockers") return [];
  if (declaredAttackers.length === 0) return [];

  // A creature already assigned as a blocker this combat can't block again.
  const assigned = new Set((state.combat?.blockers || []).map(b => b.blockerId));
  const player = state.players[playerId];
  const candidateBlockers = player.battlefield
    .filter(p => isCreature(p.card))
    .filter(p => !p.tapped)
    .filter(p => !assigned.has(p.id));

  // Enforce evasion through the layer engine so GRANTED flying/reach counts
  // (sliver lord, anthem), not just printed: a creature with flying can only be
  // blocked by creatures with flying or reach (CR 509.1b / 702.9c).
  const canBlock = (blockerId, attackerId) => {
    if (attackerId && permanentHasKeyword(state, attackerId, "Flying")) {
      return permanentHasKeyword(state, blockerId, "Flying") || permanentHasKeyword(state, blockerId, "Reach");
    }
    return true;
  };

  // For each candidate blocker, surface one action per attacker it could
  // legally block. v1 doesn't enforce "must block X" effects (Lure, etc.) or
  // menace's 2+-blocker requirement — those are Arbiter / future cases.
  const actions = [];
  for (const blocker of candidateBlockers) {
    for (const attackerId of declaredAttackers) {
      if (!canBlock(blocker.id, attackerId)) continue;
      actions.push({
        kind: "declare-blocker",
        playerId,
        permanentId: blocker.id,
        attackerId,
        name: blocker.card.name,
      });
    }
  }
  return actions;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Aggregate all legal actions the given player can take right now.
 * Returns an array — empty when the player has nothing legal (the
 * decisionGate auto-passes in that case).
 *
 * Options:
 *   declaredAttackers: array of permanent IDs declared as attacking
 *                      this combat (used only during declare-blockers
 *                      to enumerate blocker candidates). Caller-supplied
 *                      because the engine tracks combat assignments
 *                      separately, not in state.
 */
export function legalActionsForPlayer(state, playerId, { declaredAttackers } = {}) {
  if (!state || !state.players?.[playerId]) {
    throw new Error(`legalActionsForPlayer: invalid playerId "${playerId}"`);
  }
  // Default the declared-attackers list from live combat state, so the
  // session driver gets blocker candidates without threading it explicitly.
  // (Tests may still pass an explicit list — including [] — which wins.)
  const attackerIds = declaredAttackers ?? (state.combat?.attackers || []).map(a => a.permanentId);
  const actions = [];

  // Pass priority — always available IF the player has priority.
  if (state.priorityHolder === playerId) {
    actions.push(actionPassPriority(playerId));
  }

  // Lands, spells, mana.
  actions.push(...actionsPlayLand(state, playerId));
  actions.push(...actionsCastSpell(state, playerId));
  actions.push(...actionsTapForMana(state, playerId));

  // Combat actions.
  actions.push(...actionsDeclareAttacker(state, playerId));
  actions.push(...actionsDeclareBlocker(state, playerId, attackerIds));

  return actions;
}

/**
 * Group the actions by kind for UI rendering. Returns:
 *   { "pass-priority": [...], "play-land": [...], "cast-spell": [...], ... }
 */
export function groupActionsByKind(actions) {
  const out = {};
  for (const action of actions) {
    if (!out[action.kind]) out[action.kind] = [];
    out[action.kind].push(action);
  }
  return out;
}

/**
 * Filter to a single kind — convenience for callers that only want
 * "what creatures could I attack with right now?"
 */
export function filterActions(actions, kind) {
  return actions.filter(a => a.kind === kind);
}

// ─── Internal exports (for testing) ───────────────────────────────────────────

export const _internals = {
  isLand,
  isCreature,
  isInstant,
  isSorcerySpeed,
  hasKeyword,
  typeLineOf,
  manaCostOf,
  canCastSorcerySpeed,
  canCastInstantSpeed,
  opponentOf,
  getZone,
  totalAvailableMana,
};
