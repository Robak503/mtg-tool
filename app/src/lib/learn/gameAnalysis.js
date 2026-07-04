/**
 * gameAnalysis.js — post-game play-quality analysis (the "reality report", P5).
 *
 * PURE analysis over a FINISHED game: it reads the recorded decision trajectory
 * (`game.decisionTrajectory.rows`, present when the runner ran with
 * `recordDecisions:true`) + the engine's own `game.log` (creature-dies events). It
 * mutates NOTHING and imports NOTHING from the runner/engine — an observation layer,
 * not a decision one, so it can never change how a game plays (behavior-neutral;
 * classifyCard / the runner are untouched by this module existing).
 *
 * Shared by `scripts/play-quality-probe.mjs` (the A/B instrument) AND the self-play
 * `analyze` route (P5 DeckView reality report), so the two can never drift — the
 * probe consumes `analyzeGame`; the route consumes `analyzeGame` + `summarizeSeatReality`.
 *
 * Attacker-vs-blocker death attribution joins the combat `creature-dies` events (turn,
 * controller, cardName) against the names that seat declared attacking/blocking that
 * turn — a name-level join (duplicate names blur it slightly), fine for aggregates.
 */

// A turn where the active seat did NOTHING but pass priority / play a land is a "dead turn"
// (no spell, no attack, no ability) — the tempo-waste signal.
const DEAD_KINDS = new Set(["pass-priority", "play-land"]);

/**
 * Per-seat play-quality metrics for one finished game. Returns
 * `{ [seat]: { deadTurns, activeTurns, casts, lands, xValues, mulligans,
 *   attacksDeclared, blocksDeclared, attackerDeaths, blockerDeaths, otherCombatDeaths } }`.
 */
export function analyzeGame(game) {
  const perSeat = {};
  const seatOf = (seat) => (perSeat[seat] ??= {
    activeTurnKinds: new Map(), // turn -> [action kinds] while this seat was the active player
    casts: 0,
    lands: 0,
    xValues: [],
    mulligans: 0,
    attacks: new Map(), // turn -> Set(creature names declared attacking)
    blocks: new Map(), // turn -> Set(creature names declared blocking)
    attackerDeaths: 0,
    blockerDeaths: 0,
    otherCombatDeaths: 0,
  });

  for (const row of game.decisionTrajectory?.rows || []) {
    const s = seatOf(row.seat);
    const kind = row.action?.kind || "";
    if (kind === "mulligan-ship") s.mulligans += 1;
    if (row.features?.is_active_player === 1) {
      const list = s.activeTurnKinds.get(row.turn) || [];
      list.push(kind);
      s.activeTurnKinds.set(row.turn, list);
    }
    if (kind === "cast-spell") {
      s.casts += 1;
      if (row.action.xValue != null) s.xValues.push(row.action.xValue);
    } else if (kind === "play-land") {
      s.lands += 1;
    } else if (kind === "declare-attacker") {
      if (!s.attacks.has(row.turn)) s.attacks.set(row.turn, new Set());
      s.attacks.get(row.turn).add(row.action.name);
    } else if (kind === "declare-blocker") {
      if (!s.blocks.has(row.turn)) s.blocks.set(row.turn, new Set());
      s.blocks.get(row.turn).add(row.action.name);
    }
  }

  for (const ev of game.log || []) {
    if (ev?.kind !== "creature-dies" || ev.cause !== "combat" || !perSeat[ev.controller]) continue;
    const s = perSeat[ev.controller];
    if (s.attacks.get(ev.turn)?.has(ev.cardName)) s.attackerDeaths += 1;
    else if (s.blocks.get(ev.turn)?.has(ev.cardName)) s.blockerDeaths += 1;
    else s.otherCombatDeaths += 1;
  }

  const out = {};
  for (const [seat, s] of Object.entries(perSeat)) {
    let dead = 0;
    for (const kinds of s.activeTurnKinds.values()) {
      if (kinds.length > 0 && kinds.every((k) => DEAD_KINDS.has(k))) dead += 1;
    }
    out[seat] = {
      deadTurns: dead,
      activeTurns: s.activeTurnKinds.size,
      casts: s.casts,
      lands: s.lands,
      xValues: s.xValues,
      mulligans: s.mulligans,
      attacksDeclared: [...s.attacks.values()].reduce((n, set) => n + set.size, 0),
      blocksDeclared: [...s.blocks.values()].reduce((n, set) => n + set.size, 0),
      attackerDeaths: s.attackerDeaths,
      blockerDeaths: s.blockerDeaths,
      otherCombatDeaths: s.otherCombatDeaths,
    };
  }
  return out;
}

/**
 * DECK REALITY REPORT — aggregate ONE seat's per-game metrics across a batch of finished
 * games into the averages a DeckView report shows: how the deck ACTUALLY played (tempo,
 * curve realization, combat outcomes), mined from real self-play rather than the paper list.
 * `games` are finished games (recordDecisions:true); `seat` is the seat the deck piloted.
 * Returns null when the seat never appears (nothing to report — never a fabricated zero row).
 */
export function summarizeSeatReality(games, seat) {
  let n = 0;
  const acc = {
    activeTurns: 0, deadTurns: 0, casts: 0, lands: 0, xCasts: 0, xSum: 0,
    mulligans: 0, attacksDeclared: 0, blocksDeclared: 0, attackerDeaths: 0, blockerDeaths: 0,
  };
  for (const g of games || []) {
    const m = analyzeGame(g)[seat];
    if (!m) continue;
    n += 1;
    acc.activeTurns += m.activeTurns;
    acc.deadTurns += m.deadTurns;
    acc.casts += m.casts;
    acc.lands += m.lands;
    acc.xCasts += m.xValues.length;
    acc.xSum += m.xValues.reduce((a, b) => a + b, 0);
    acc.mulligans += m.mulligans;
    acc.attacksDeclared += m.attacksDeclared;
    acc.blocksDeclared += m.blocksDeclared;
    acc.attackerDeaths += m.attackerDeaths;
    acc.blockerDeaths += m.blockerDeaths;
  }
  if (n === 0) return null;
  const per = (x) => x / n;
  return {
    games: n,
    avgActiveTurns: per(acc.activeTurns),
    avgDeadTurns: per(acc.deadTurns),
    deadTurnRate: acc.activeTurns ? acc.deadTurns / acc.activeTurns : 0, // fraction of the deck's turns that did nothing
    avgCasts: per(acc.casts),
    avgLands: per(acc.lands),
    mulliganRate: per(acc.mulligans), // mulligans taken per game
    avgX: acc.xCasts ? acc.xSum / acc.xCasts : null, // avg X paid on X-spells (null if none cast)
    xCastsPerGame: per(acc.xCasts),
    avgAttacks: per(acc.attacksDeclared),
    avgBlocks: per(acc.blocksDeclared),
    avgAttackerDeaths: per(acc.attackerDeaths),
    avgBlockerDeaths: per(acc.blockerDeaths),
  };
}
