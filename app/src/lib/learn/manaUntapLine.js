/**
 * manaUntapLine.js — the AI's line for "{X}, {T}: Untap X target lands" (Candelabra of Tawnos, Magus of the
 * Candelabra) and for where a land's mana enchantments go (2026-10-03).
 *
 * THE RULES (Colton, 2026-10-03):
 *   - the untap exists to untap Gaea's Cradle, or a land with mana enchantments on it, and make a large amount
 *     of mana — "if it doesn't go mana positive then there's no choice";
 *   - mana enchantments stack on the SAME land, so one untap pays for all of them.
 *
 * WHAT THE AI DID BEFORE: nothing. It never activates a targeted ability (pickSafeAbilityActivation) and never
 * taps a land except to pay a cost, so the untap was dead cardboard; each mana Aura went on whichever own land
 * sorted first.
 *
 * THE LINE:
 *   VALUE of a land = the mana it adds when tapped (a count read live — Gaea's Cradle — plus every mana Aura on
 *     it and every "whenever you tap a land for mana" augment), taken from manaModel.manaSources.
 *   THE PLAN = the X lands worth the most, for the smallest X that nets the most mana (Σ value − X). A land
 *     worth 1 never enters it (it adds what its X costs). It is only a plan while the gain is positive AND it
 *     puts a card the seat holds, and cannot pay for now, within reach.
 *   THE STEPS, one action per decision: tap each planned land for mana (the mana floats in the pool), then
 *     activate the untap on exactly those lands. The cast follows by the AI's ordinary cast pick.
 *
 * Everything here chooses among actions the engine offered (a tap-for-mana, an activation, an Aura's target).
 * `orderUntapTargets` only changes the ORDER targets are enumerated in, so the best set per X is the first one
 * offered and survives the option cap; it adds and removes nothing below the cap.
 *
 * Pure reads of game state. Imports manaModel and gameState; opponentAI and legalChoices import it.
 */
import { manaSources, landAuraManaBonus } from "./manaModel.js";
import { findPermanent } from "./gameState.js";

const isLandCard = (card) => /\bLand\b/.test(String(card?.type || card?.type_line || ""));
const sourceTotal = (source) => (source.amount ?? 1) + (source.bonus || []).reduce((sum, b) => sum + (b.amount || 0), 0);

/**
 * The mana `permanentId` adds to `playerId` when it is tapped for mana — read as if it were untapped, so a tapped
 * land has its value too. 0 for a permanent `playerId` does not control or that is not a mana source.
 */
export function manaValueOf(state, playerId, permanentId) {
  const player = state?.players?.[playerId];
  const perm = (player?.battlefield || []).find((p) => p.id === permanentId);
  if (!perm) return 0;
  const asUntapped = perm.tapped
    ? { ...state, players: { ...state.players, [playerId]: { ...player, battlefield: player.battlefield.map((p) => (p.id === permanentId ? { ...p, tapped: false } : p)) } } }
    : state;
  let best = 0;
  for (const source of manaSources(asUntapped, playerId)) {
    if (source.permanentId === permanentId && !source.sacrifices) best = Math.max(best, sourceTotal(source));
  }
  return best;
}

/** Is this offered activation "untap X target lands" for an {X} cost? */
export function isManaUntapAction(action) {
  if (action?.kind !== "activate-ability") return false;
  const atoms = action.program?.atoms || [];
  return atoms.length === 1 && atoms[0].op === "untap" && atoms[0].targetType === "land" && !!atoms[0].targetCountX
    && (action.targets || []).length === action.xValue;
}

/** Is this program the untap line's ability? (for the offer-order hook, which has no action yet) */
export function isManaUntapProgram(program) {
  const atoms = program?.atoms || [];
  return atoms.length === 1 && atoms[0].op === "untap" && atoms[0].targetType === "land" && !!atoms[0].targetCountX;
}

/**
 * Targets for "untap X target lands", best first: the activating player's TAPPED lands by the mana they add,
 * then everything else in its given order. The first X-subset enumerated is then the X best lands to untap.
 */
export function orderUntapTargets(state, playerId, targets) {
  const scored = targets.map((target, index) => {
    const perm = findPermanent(state, target.id)?.permanent;
    const value = perm && perm.controller === playerId && perm.tapped ? manaValueOf(state, playerId, target.id) : 0;
    return { target, index, value };
  });
  scored.sort((a, b) => (b.value - a.value) || (a.index - b.index));
  return scored.map((s) => s.target);
}

/** The seat's total mana right now: what floats in the pool plus every untapped source. */
function availableMana(state, playerId) {
  const pool = state.players[playerId].manaPool || {};
  const floating = Object.values(pool).reduce((sum, n) => sum + (typeof n === "number" ? n : 0), 0);
  return floating + manaSources(state, playerId).reduce((sum, s) => sum + (s.sacrifices ? 0 : sourceTotal(s)), 0);
}

/** Nonland cards in hand that no offered cast-spell action can cast right now. */
function unpayableHeldCards(state, playerId, actions) {
  const castable = new Set(actions.filter((a) => a.kind === "cast-spell").map((a) => a.cardId));
  return (state.players[playerId].hand || []).filter((card) => !isLandCard(card) && !castable.has(card.id));
}

/**
 * The best untap plan: { lands: [{ id, value, tapped }], x, gain } — the x most valuable lands the seat controls,
 * for the smallest x (among the X values the offered activations carry) with the largest gain
 * Σ value − (the activation's whole mana cost). null when no x gains mana.
 */
export function bestUntapPlan(state, playerId, untapActions) {
  const lands = (state.players[playerId].battlefield || [])
    .filter((p) => isLandCard(p.card))
    .map((p) => ({ id: p.id, value: manaValueOf(state, playerId, p.id), tapped: !!p.tapped }))
    .sort((a, b) => (b.value - a.value) || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  // the cheapest offered activation for each X (two untappers on the battlefield may price X differently)
  const costOfX = new Map();
  for (const a of untapActions) {
    if (!costOfX.has(a.xValue) || a.cmc < costOfX.get(a.xValue)) costOfX.set(a.xValue, a.cmc);
  }
  let best = null;
  for (const [x, cost] of [...costOfX].sort((a, b) => a[0] - b[0])) {
    const chosen = lands.slice(0, x);
    const gain = chosen.reduce((sum, l) => sum + l.value, 0) - cost;
    if (gain > 0 && (best === null || gain > best.gain)) best = { lands: chosen, x, gain };
  }
  return best;
}

/**
 * The next action of the untap line, or null. `actions` = everything offered this decision.
 * Only on the seat's own main phase with an empty stack, with an untap activation offered, and only when the plan
 * brings a held card the seat cannot pay for now within reach.
 */
export function manaUntapLineAction(state, playerId, actions) {
  if (state.activePlayer !== playerId || !/main/i.test(String(state.phase || "")) || (state.stack || []).length > 0) return null;
  const untapActions = actions.filter(isManaUntapAction);
  const held = unpayableHeldCards(state, playerId, actions);
  const plan = bestUntapPlan(state, playerId, untapActions);
  if (!plan) return null;
  const reach = availableMana(state, playerId) + plan.gain;
  if (!held.some((card) => typeof card.cmc === "number" && card.cmc <= reach)) return null;
  // 1 — float the planned lands' mana, most valuable first
  const toTap = plan.lands.find((l) => !l.tapped);
  if (toTap) return actions.find((a) => a.kind === "tap-for-mana" && a.permanentId === toTap.id) || null;
  // 2 — every planned land is tapped: untap exactly those lands
  const want = plan.lands.map((l) => String(l.id)).sort();
  const sameTargets = (a) => {
    const got = (a.targets || []).map((t) => String(t.id)).sort();
    return got.length === want.length && got.every((id, i) => id === want[i]);
  };
  const matches = untapActions.filter(sameTargets);
  return matches.length ? matches.reduce((cheapest, a) => (a.cmc < cheapest.cmc ? a : cheapest)) : null;
}

/**
 * Where a land mana Aura goes: among the offered targets (the caster's own lands), the land already carrying the
 * most mana Auras; ties keep the given order. Returns the chosen action, or null for no options.
 */
export function pickManaAuraTarget(state, auraActions) {
  let best = null;
  let bestCount = -1;
  for (const action of auraActions) {
    const land = findPermanent(state, action.targets?.[0]?.id)?.permanent;
    const count = land ? landAuraManaBonus(state, land).length : 0;
    if (count > bestCount) { best = action; bestCount = count; }
  }
  return best;
}
