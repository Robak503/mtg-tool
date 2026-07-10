/**
 * epochStats.js — EPOCH-2 per-game instrumentation (Colton-approved 2026-07-09, Omnath's
 * addendum; rides the ONE schemaVersion-3 bump): per-seat finish ranks, the win-condition
 * taxonomy, and per-seat mana-health — all derived at game end from the engine's own log +
 * terminal state. Pure reads, zero engine hooks, zero recording overhead during play.
 *
 * FINISH RANKS (label density ×4 for learning; TrueSkill-ready):
 *   winner = 1 · surviving non-winners tie at the best remaining rank (2 with a winner,
 *   1 on a clock/draw end with no winner) · eliminated seats rank bottom-up in elimination
 *   order (first out = last place). eliminatedAtTurn = the elimination event's turn.
 *
 * WIN CONDITION (v1 enum — shapes per the addendum, one honest deviation):
 *   win-game-effect | commander-damage | poison | decking | damage | clock | draw | stuck
 *   "damage" = the final elimination was life≤0 — combat vs burn is NOT distinguished in v1
 *   (the log's death events don't carry the source class; noted in COMMS). "concession-cascade"
 *   can't occur in self-play (no concessions).
 *
 * MANA HEALTH (per seat): landsByT5 (play-land events, turns 1–5) · commanderOnlineTurn
 *   (first cast-spell of a commander name) · screw (landsByT5 < 3) · flood (landsByT5 ≥ 6)
 *   · colorMissEvents: null — PARKED (castable-but-for-pips holds need an engine-side counter
 *   at the legal-set layer; recording it here would fabricate a number).
 */

import { hasWonGame } from "./learnSession.js";

const NON_DECISIVE = new Set(["timeout", "engine-stuck", "dispatch-error", "setup-error", "unexpected"]);

/**
 * @param {object} args
 * @param {object} args.state    terminal game state
 * @param {Array}  args.log      the full game log (state.log at terminal)
 * @param {string} args.result   runner result token
 * @param {string|null} args.winnerSeat
 * @param {string[]} args.seats  the mode's engine seats, pod order
 * @param {Object<string,string[]>} [args.commandersBySeat]  seat → commander card names
 * @returns {{ seats: Object, winCondition: string }}
 */
export function computeEpochStats({ state, log = [], result, winnerSeat = null, seats = [], commandersBySeat = {} }) {
  const eliminations = log.filter((e) => e?.kind === "player-eliminated");
  const eliminatedOrder = eliminations.map((e) => e.player);
  const eliminatedAt = new Map(eliminations.map((e) => [e.player, e.turn ?? null]));

  // ── finish ranks ──
  const n = seats.length;
  const perSeat = {};
  // Eliminated seats: first out = rank n, next = n-1, …
  eliminatedOrder.forEach((seat, i) => {
    perSeat[seat] = { finishRank: n - i, eliminatedAtTurn: eliminatedAt.get(seat) };
  });
  // Survivors: winner = 1; the rest tie at the best remaining rank.
  const survivors = seats.filter((s) => !(s in perSeat));
  const bestRemaining = winnerSeat && survivors.includes(winnerSeat) ? 2 : 1;
  for (const s of survivors) {
    perSeat[s] = s === winnerSeat
      ? { finishRank: 1, eliminatedAtTurn: null }
      : { finishRank: bestRemaining, eliminatedAtTurn: null };
  }

  // ── win condition ──
  let winCondition;
  if (NON_DECISIVE.has(result)) winCondition = result === "timeout" ? "clock" : "stuck";
  else if (result === "draw" || result === "turn-limit") winCondition = result === "turn-limit" ? "clock" : "draw";
  else if (winnerSeat && hasWonGame(state, winnerSeat)) winCondition = "win-game-effect";
  else {
    const last = eliminations[eliminations.length - 1];
    if (!last) winCondition = "damage"; // decisive with no elimination event — legacy path safety
    else if (last.commanderLethal) winCondition = "commander-damage";
    else if ((last.poison ?? 0) >= 10) winCondition = "poison";
    else if (last.decked) winCondition = "decking";
    else winCondition = "damage";
  }

  // ── mana health ──
  for (const seat of seats) {
    const lands = log.filter((e) => e?.kind === "play-land" && e.playerId === seat && (e.turn ?? 99) <= 5).length;
    const cmdNames = new Set((commandersBySeat[seat] || []).filter(Boolean));
    let commanderOnlineTurn = null;
    if (cmdNames.size) {
      const firstCast = log.find((e) => e?.kind === "cast-spell" && e.playerId === seat && cmdNames.has(e.cardName));
      commanderOnlineTurn = firstCast ? firstCast.turn ?? null : null;
    }
    perSeat[seat] = {
      ...(perSeat[seat] || { finishRank: null, eliminatedAtTurn: null }),
      manaHealth: {
        landsByT5: lands,
        commanderOnlineTurn,
        screw: lands < 3,
        flood: lands >= 6,
        colorMissEvents: null, // parked — needs a legal-set-layer counter; never fabricate
      },
    };
  }

  return { seats: perSeat, winCondition };
}
