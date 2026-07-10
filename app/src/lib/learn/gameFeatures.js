/**
 * gameFeatures.js — Learn-to-Play GROUNDWORK Track-1a: the STATE FEATURIZER.
 *
 * WHAT THIS IS: a pure, deterministic function that turns a live game `state`
 * (gameState.js shape) into a compact, INTERPRETABLE numeric feature vector from
 * ONE player's perspective. It is the substrate for a future value function — a
 * "who's winning / how hard should I push" evaluator — trained on (state-features
 * → eventual-win) pairs harvested from offline self-play (see selfPlayRunner.js
 * `recordTrajectory`).
 *
 * WHAT THIS IS NOT: it is NOT policy/per-action data (which action to take from a
 * state). That is a LATER track — this captures only the VALUE-function substrate
 * (state → eventual win). It also never mutates the engine, never fetches, never
 * fabricates: every number is read straight off real state via the same layer-aware
 * accessors combat/SBAs use (permanentPower/Toughness/IsCreature — CR 613), so a
 * feature can't drift from what the engine actually sees.
 *
 * STABILITY CONTRACT: the return is a NAMED-feature object (not a bare array) so it
 * stays human-readable and EXTENSIBLE — a new feature is a new key, never a silent
 * positional shift that would corrupt previously-recorded training data. A consumer
 * that wants a fixed-order numeric vector calls `featureVector` (below), which reads
 * `FEATURE_KEYS` — the one authoritative ordering.
 *
 * PERSPECTIVE: every "own_*" field is from `playerId`'s seat; every "opp_*" field
 * aggregates over that player's opponents (opponentsOf — all enemies, both modes).
 * Differentials (life_diff, board_power_diff, …) are own − best-opponent, so a
 * single sign tells you who is ahead on that axis from this seat.
 */

import { opponentsOf } from "./gameState.js";
import { permanentPower, permanentToughness, permanentIsCreature } from "./layers.js";

/**
 * The recorded-features VERSION, stamped into every recorded grind game header
 * (`header.featuresV`) so a distill/training consumer can trust dimensionality and
 * meaning across engine releases without inspecting rows. Bump when FEATURE_KEYS
 * changes OR when a header-derivation contract changes (the consumer gates on it).
 *
 * 1 — FEATURE_KEYS v1/v2-era vector; manaHealth windows on GLOBAL player-turns (the
 *     units bug — landsByT5/commanderOnlineTurn unusable; Omnath 2026-07-10).
 * 2 — the featuresV=2 bundle (Omnath 2026-07-10, one bump, all gates in one rule):
 *     manaHealth counts each seat's OWN turns (+ ownTurns; screw/flood null till 5 own
 *     turns) · per-seat `mull` {ships, finalHandSize, bottomedCount} in seatStats ·
 *     header `startSeat`/`turnOrder` · header `decisionsCount` · header `pilotV`
 *     (persona-pack era marker, null until the builder exposes it).
 * 3 — ROWS v3 (M5.1, the nearTie/top-k unpark): rows gain `castScores` (the cast
 *     chooser's top-3 {cardId, name, score}, ascending = best-first) + `scoreGap`
 *     (runnerUp − best; a small gap = a near-tie fork). Null on every non-cast
 *     decision — the scored-class scope. Headers unchanged from 2.
 */
export const FEATURES_VERSION = 3;

/**
 * The authoritative feature ORDER. `featureVector` reads this so the numeric vector
 * is stable across releases; appending a new feature here (and to `featurizeState`)
 * extends the vector WITHOUT renumbering the existing positions. Keep these two in
 * lock-step — the test asserts every key here is produced by featurizeState.
 */
export const FEATURE_KEYS = [
  // ── self: vitals ──
  "own_life",
  "own_poison",
  // ── self: board ──
  "own_creatures",
  "own_board_power",
  "own_board_toughness",
  "own_untapped_creatures",
  "own_attackers", // creatures that could attack: a creature, untapped, not summoning-sick
  "own_permanents",
  "own_lands",
  "own_untapped_lands",
  // ── self: resources ──
  "own_hand_size",
  "own_library_size",
  "own_available_mana", // mana currently floating in the pool (steady-state usually 0; non-zero mid-resolution)
  // ── opponents: aggregate (all enemies) ──
  "opp_count", // living opponents — shrinks in Commander as seats are eliminated
  "opp_life_total", // summed life across opponents
  "opp_life_max", // the healthiest opponent's life (the hardest seat to close)
  "opp_life_min", // the most-killable opponent's life
  "opp_creatures",
  "opp_board_power",
  "opp_board_toughness",
  "opp_permanents",
  "opp_hand_size", // summed cards in opponents' hands (pressure / interaction they may hold)
  // ── differentials (own − best opponent on that axis): one sign = who's ahead ──
  "life_diff", // own_life − opp_life_max
  "board_power_diff", // own_board_power − opp_board_power
  "creature_diff", // own_creatures − opp_creatures
  "card_advantage", // own_hand_size − mean opponent hand size
  // ── tempo / clock ──
  "turn", // game turn number (proxy for game length / how late it is)
  "is_active_player", // 1 if it's this seat's turn right now, else 0
];

/** Count of mana currently in a player's pool (all colors). Floating mana is usually
 *  0 in steady-state (it empties between steps) but non-zero mid-resolution. */
function poolTotal(pool) {
  if (!pool) return 0;
  return ("W" in pool ? pool.W : 0) +
    (pool.U || 0) + (pool.B || 0) + (pool.R || 0) + (pool.G || 0) + (pool.C || 0);
}

/** Is this permanent a LAND right now? Type-line read (lands have no layer-aware
 *  P/T to derive); covers DFCs via the joined type string. Cheap + honest. */
function isLand(perm) {
  const t = String(perm?.card?.type || perm?.card?.type_line || "");
  return /\bLand\b/.test(t);
}

/**
 * Per-seat board roll-up computed ONCE per player (so the O(battlefield) walk isn't
 * repeated for power, toughness, creature-count, attacker-count, land-count). Uses the
 * layer-aware accessors for creature-ness and P/T so an animated land / anthem / counter
 * is reflected exactly as combat + the SBAs see it (CR 613) — never the printed-only value.
 */
function summarizeBoard(state, playerId) {
  const player = state.players?.[playerId];
  const out = {
    permanents: 0,
    creatures: 0,
    boardPower: 0,
    boardToughness: 0,
    untappedCreatures: 0,
    attackers: 0,
    lands: 0,
    untappedLands: 0,
  };
  if (!player) return out;
  for (const perm of player.battlefield || []) {
    out.permanents += 1;
    if (isLand(perm)) {
      out.lands += 1;
      if (!perm.tapped) out.untappedLands += 1;
    }
    if (permanentIsCreature(state, perm.id)) {
      out.creatures += 1;
      // P/T floored at 0 for aggregate "board strength" (a creature can be at negative
      // CR toughness mid-wipe; a negative summed board-power would be a misleading feature).
      out.boardPower += Math.max(0, permanentPower(state, perm.id));
      out.boardToughness += Math.max(0, permanentToughness(state, perm.id));
      if (!perm.tapped) out.untappedCreatures += 1;
      // "Could attack" proxy (CR 508.1a): a creature that is untapped and not summoning-sick.
      // (Doesn't model defender/"can't attack" riders — a coarse threat proxy, documented as such.)
      if (!perm.tapped && !perm.summoningSick) out.attackers += 1;
    }
  }
  return out;
}

/**
 * featurizeState(state, playerId) → a documented, named numeric feature object from
 * `playerId`'s perspective. PURE: reads state, mutates nothing, fetches nothing.
 *
 * Every value is a finite Number (a missing/edge case resolves to 0, never NaN/null),
 * so the object is directly serializable as a training row. See FEATURE_KEYS for the
 * canonical ordering; `featureVector` projects this object onto that order.
 *
 * @param {object} state     a gameState.js game state
 * @param {string} playerId  the seat to view from ("user" | "ai" | "ai1".."ai3")
 * @returns {Object<string, number>} named feature → value
 */
export function featurizeState(state, playerId) {
  const player = state?.players?.[playerId];
  // A seat that no longer exists (eliminated in Commander) features as an all-zero,
  // dead board — honest (it IS gone), never a throw that would abort a recording run.
  const opps = player ? opponentsOf(state, playerId) : [];

  const ownBoard = summarizeBoard(state, playerId);
  const ownLife = player ? player.life : 0;
  const ownPoison = player ? (player.poison || 0) : 0;

  // Opponent aggregates over LIVING opponents (a removed seat isn't in state.players).
  let oppCount = 0;
  let oppLifeTotal = 0;
  let oppLifeMax = 0;
  let oppLifeMin = Infinity;
  let oppCreatures = 0;
  let oppBoardPower = 0;
  let oppBoardToughness = 0;
  let oppPermanents = 0;
  let oppHandSize = 0;
  for (const oid of opps) {
    const op = state.players[oid];
    if (!op) continue;
    oppCount += 1;
    const life = op.life || 0;
    oppLifeTotal += life;
    if (life > oppLifeMax) oppLifeMax = life;
    if (life < oppLifeMin) oppLifeMin = life;
    const b = summarizeBoard(state, oid);
    oppCreatures += b.creatures;
    oppBoardPower += b.boardPower;
    oppBoardToughness += b.boardToughness;
    oppPermanents += b.permanents;
    oppHandSize += (op.hand || []).length;
  }
  if (!Number.isFinite(oppLifeMin)) oppLifeMin = 0; // no living opponents

  const ownHandSize = player ? (player.hand || []).length : 0;
  const meanOppHand = oppCount > 0 ? oppHandSize / oppCount : 0;

  return {
    // self: vitals
    own_life: ownLife,
    own_poison: ownPoison,
    // self: board
    own_creatures: ownBoard.creatures,
    own_board_power: ownBoard.boardPower,
    own_board_toughness: ownBoard.boardToughness,
    own_untapped_creatures: ownBoard.untappedCreatures,
    own_attackers: ownBoard.attackers,
    own_permanents: ownBoard.permanents,
    own_lands: ownBoard.lands,
    own_untapped_lands: ownBoard.untappedLands,
    // self: resources
    own_hand_size: ownHandSize,
    own_library_size: player ? (player.library || []).length : 0,
    own_available_mana: player ? poolTotal(player.manaPool) : 0,
    // opponents: aggregate
    opp_count: oppCount,
    opp_life_total: oppLifeTotal,
    opp_life_max: oppLifeMax,
    opp_life_min: oppLifeMin,
    opp_creatures: oppCreatures,
    opp_board_power: oppBoardPower,
    opp_board_toughness: oppBoardToughness,
    opp_permanents: oppPermanents,
    opp_hand_size: oppHandSize,
    // differentials (own − best opponent on that axis)
    life_diff: ownLife - oppLifeMax,
    board_power_diff: ownBoard.boardPower - oppBoardPower,
    creature_diff: ownBoard.creatures - oppCreatures,
    card_advantage: ownHandSize - meanOppHand,
    // tempo / clock
    turn: state?.turn || 0,
    is_active_player: state?.activePlayer === playerId ? 1 : 0,
  };
}

/**
 * Project a featurizeState object onto the canonical FEATURE_KEYS order → a plain
 * Number[]. The bridge to any numeric ML consumer that wants a fixed-length vector;
 * a key absent from `features` reads 0 (forward-compatible with older recorded rows).
 */
export function featureVector(features) {
  return FEATURE_KEYS.map((k) => {
    const v = features?.[k];
    return Number.isFinite(v) ? v : 0;
  });
}
