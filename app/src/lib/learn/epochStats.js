/**
 * epochStats.js — EPOCH-2 per-game instrumentation (Colton-approved 2026-07-09, Omnath's
 * addendum; rides the ONE schemaVersion-3 bump): per-seat finish ranks, the win-condition
 * taxonomy, per-seat mana-health, the per-seat MULLIGAN summary, and the game's TURN ORDER —
 * all derived at game end from the engine's own log + terminal state. Pure reads, zero engine
 * hooks, zero recording overhead during play.
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
 * MANA HEALTH (per seat — featuresV=2 UNITS FIX, Omnath 2026-07-10): every window counts the
 *   seat's OWN turns, not global player-turn indexes (the old read flagged 198/200 games as
 *   all-seats-screwed because game-turn 5 ≈ each seat's 1st turn). The turn-owner map comes
 *   from the per-turn untap step events ({kind:"step", step:"untap", player}); a seat's Nth
 *   own turn = the Nth such event for that seat.
 *   · landsByT5 — lands played during the seat's OWN first 5 turns (lands only happen on own
 *     turns, CR 305.1). · ownTurns — how many own turns the seat STARTED (consumers gate the
 *     flags on it). · screw/flood — null until the seat has had 5 own turns (a truncated
 *     window must never fabricate a flag), else lands<3 / lands≥6. · commanderOnlineTurn —
 *     the seat's OWN-turn index when its commander was first cast (a flash cast between own
 *     turns reports the count of own turns started, the honest "on/after turn N" read).
 *   · colorMissEvents: null — PARKED (needs a legal-set-layer counter; never fabricate).
 *
 * MULLIGAN SUMMARY (per seat — featuresV=2, Omnath 2026-07-10): {ships, finalHandSize,
 *   bottomedCount} read off the final mulligan-keep event ({player, mulligans, bottomed} —
 *   London: final hand = 7 − bottomed). null when the log carries no keep event for the seat
 *   (a legacy/mulligan-off game — absent, never fabricated).
 *
 * TURN ORDER (featuresV=2): the seats in the order they actually took turns (from the same
 *   turn-owner map) — headers are the only prune survivor, so who-was-on-the-play must live
 *   there (startSeat = turnOrder[0]; the runner also reports state.startingPlayer).
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
 * @returns {{ seats: Object, winCondition: string, turnOrder: string[]|null }}
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

  // ── turn-owner map (the featuresV=2 units backbone) ──
  // Each turn's untap step logs {kind:"step", step:"untap", player} with the global turn stamped
  // (appendLog). turnStarts[seat] = ASCENDING list of the global turns that seat's own turns began.
  const turnStarts = new Map(seats.map((s) => [s, []]));
  const ownersByTurn = []; // [{turn, player}] in log order (ascending turns)
  for (const e of log) {
    if (e?.kind === "step" && e.step === "untap" && e.player && turnStarts.has(e.player)) {
      turnStarts.get(e.player).push(e.turn ?? 0);
      ownersByTurn.push({ turn: e.turn ?? 0, player: e.player });
    }
  }
  // The seat's OWN-turn index at global turn T = how many of its turns had started by T.
  const seatTurnAt = (seat, globalTurn) => {
    const starts = turnStarts.get(seat) || [];
    let k = 0;
    for (const t of starts) { if (t <= (globalTurn ?? 0)) k++; else break; }
    return k;
  };
  // TURN ORDER: the first n distinct owners, in the order they took turns. null when the log has
  // no step events at all (a legacy/minimal log — absent, never guessed).
  let turnOrder = null;
  if (ownersByTurn.length) {
    const seen = new Set();
    turnOrder = [];
    for (const { player } of ownersByTurn) {
      if (!seen.has(player)) { seen.add(player); turnOrder.push(player); }
      if (turnOrder.length === seats.length) break;
    }
  }

  // ── mana health (per-seat units) + mulligan summary ──
  for (const seat of seats) {
    const ownTurns = (turnStarts.get(seat) || []).length;
    // Lands played during the seat's OWN first 5 turns. Lands are played only on the owner's turn
    // (CR 305.1), so filtering the seat's play-land events by its own-turn index is exact.
    const lands = log.filter((e) => e?.kind === "play-land" && e.playerId === seat
      && seatTurnAt(seat, e.turn) >= 1 && seatTurnAt(seat, e.turn) <= 5).length;
    const cmdNames = new Set((commandersBySeat[seat] || []).filter(Boolean));
    let commanderOnlineTurn = null;
    if (cmdNames.size) {
      const firstCast = log.find((e) => e?.kind === "cast-spell" && e.playerId === seat && cmdNames.has(e.cardName));
      commanderOnlineTurn = firstCast ? (seatTurnAt(seat, firstCast.turn) || null) : null;
    }
    // MULLIGAN summary — the seat's final keep event ({player, mulligans, bottomed}); London final
    // hand = 7 − bottomed. Absent event (legacy / mulligan-off) → null, never fabricated.
    const keep = log.find((e) => e?.kind === "mulligan-keep" && e.player === seat);
    const mull = keep
      ? { ships: keep.mulligans ?? 0, finalHandSize: 7 - (keep.bottomed ?? 0), bottomedCount: keep.bottomed ?? 0 }
      : null;
    perSeat[seat] = {
      ...(perSeat[seat] || { finishRank: null, eliminatedAtTurn: null }),
      manaHealth: {
        landsByT5: lands,
        ownTurns,
        commanderOnlineTurn,
        // A truncated window (the game ended before this seat's 5th turn) must never fabricate a
        // screw/flood flag — null until 5 own turns have started (consumers also get ownTurns).
        screw: ownTurns >= 5 ? lands < 3 : null,
        flood: ownTurns >= 5 ? lands >= 6 : null,
        colorMissEvents: null, // parked — needs a legal-set-layer counter; never fabricate
      },
      mull,
    };
  }

  return { seats: perSeat, winCondition, turnOrder };
}
