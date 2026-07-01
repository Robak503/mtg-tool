/**
 * breakageReport.js — pure data-reduction over self-play game results.
 *
 * Takes the array of results from runSelfPlayBatch and mines each game's raw
 * `state.log` for the HONEST breakage signals the engine recorded during play,
 * then buckets them by card so the orchestrator gets a ranked "what's unmodeled /
 * broken" work queue, plus a human-readable .txt Colton can paste/share.
 *
 * CREED (ABSOLUTE): every count here traces to a REAL log entry. Nothing is
 * fabricated, inferred, or rounded up. A game that ended `engine-stuck` /
 * `dispatch-error` / `setup-error` is reported as a non-completion in the outcome
 * tally — never silently coerced into a draw or hidden.
 *
 * The breakage signals (all emitted by the engine, never by us):
 *   - spell-unresolved          (pendingArbiter.js) — per-card: cardName, controller, reason
 *   - stack-resolve-error       (gameEngine.js)     — a resolver threw; objectId + error
 *   - trigger-removed-no-target (gameEngine.js)     — a targeted trigger fizzled; source
 * Plus the terminal non-completions surfaced by advanceUntilDecision:
 *   - engine-stuck / dispatch-error / setup-error   (per-GAME, not per-card)
 */

// The per-card log kinds we mine. Each maps a log entry → the card name it blames.
const CARD_BREAKAGE_KINDS = {
  "spell-unresolved": (e) => e.cardName,
  "stack-resolve-error": (e) => e.cardName || e.source || null, // objectId-keyed; name when present
  "trigger-removed-no-target": (e) => e.source,
};

const UNKNOWN_CARD = "(unknown card)";

/**
 * Aggregate breakages across a batch of game results.
 *
 * @param {Array<object>} games  runSelfPlayGame results (each has .log, .result, .turns, .meta)
 * @returns {{
 *   cards: Array<{ card, count, kinds, sampleReason, sampleTurn }>,  // ranked, most frequent first
 *   outcomes: { total, completed, userWins, aiWins, draws, timeouts, engineStuck, dispatchError, setupError, unexpected },
 *   avgTurns: number,        // mean final turn across games that produced a turn count
 *   totalBreakages: number,  // total per-card breakage log entries counted
 *   games: Array,            // pass-through (for per-game one-liners in the txt)
 * }}
 */
export function aggregateBreakages(games) {
  const list = Array.isArray(games) ? games : [];

  // Per-card accumulator: name → { count, kinds:{kind:n}, sampleReason, sampleTurn }
  const byCard = new Map();
  let totalBreakages = 0;

  const outcomes = {
    total: list.length,
    completed: 0,
    userWins: 0,
    aiWins: 0,
    draws: 0,
    timeouts: 0,
    engineStuck: 0,
    dispatchError: 0,
    setupError: 0,
    unexpected: 0,
  };

  let turnSum = 0;
  let turnGames = 0;

  for (const game of list) {
    // --- outcome tally (honest about non-completions) ---
    switch (game.result) {
      case "user-wins": outcomes.userWins++; outcomes.completed++; break;
      case "ai-wins": outcomes.aiWins++; outcomes.completed++; break;
      case "draw": outcomes.draws++; outcomes.completed++; break;
      // A timePressure game that hit the turn cap: honestly a timeout (no fabricated W/L, trainingWeight 0
      // downstream) — its OWN labeled bucket, not "unexpected" noise in the honesty report.
      case "timeout": outcomes.timeouts++; break;
      case "engine-stuck": outcomes.engineStuck++; break;
      case "dispatch-error": outcomes.dispatchError++; break;
      case "setup-error": outcomes.setupError++; break;
      default: outcomes.unexpected++; break;
    }

    if (Number.isFinite(game.turns)) {
      turnSum += game.turns;
      turnGames++;
    }

    // --- per-card breakage mining from the raw log ---
    const log = Array.isArray(game.log) ? game.log : [];
    for (const entry of log) {
      const extractor = CARD_BREAKAGE_KINDS[entry?.kind];
      if (!extractor) continue;
      const rawName = extractor(entry);
      const card = rawName && String(rawName).trim() ? String(rawName) : UNKNOWN_CARD;

      let rec = byCard.get(card);
      if (!rec) {
        rec = { card, count: 0, kinds: {}, sampleReason: null, sampleTurn: null };
        byCard.set(card, rec);
      }
      rec.count++;
      rec.kinds[entry.kind] = (rec.kinds[entry.kind] || 0) + 1;
      totalBreakages++;

      // Keep the FIRST observed reason/turn as the sample (deterministic, real).
      if (rec.sampleReason == null) {
        rec.sampleReason = entry.reason || entry.error || null;
      }
      if (rec.sampleTurn == null && Number.isFinite(entry.turn)) {
        rec.sampleTurn = entry.turn;
      }
    }
  }

  // Rank: most frequent first, then a CODEPOINT tiebreak — the engine's replay-stable idiom
  // (localeCompare is environment/ICU-dependent, so identical runs could rank differently).
  const cards = [...byCard.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.card < b.card ? -1 : a.card > b.card ? 1 : 0;
  });

  const avgTurns = turnGames > 0 ? turnSum / turnGames : 0;

  return { cards, outcomes, avgTurns, totalBreakages, games: list };
}

/** Right-pad (or truncate) a string to a fixed column width for the table. */
function col(value, width) {
  const s = String(value ?? "");
  if (s.length >= width) return s.slice(0, width);
  return s + " ".repeat(width - s.length);
}

/** One-line per-game summary, e.g. "Vihaan vs Koma, Kellan, Omnath — ai-wins (turn 12)". */
function gameOneLiner(game) {
  const seats = game.meta?.seatNames || game.meta?.deckNames || [];
  let label;
  if (seats.length >= 2) {
    label = `${seats[0]} vs ${seats.slice(1).join(", ")}`;
  } else {
    label = game.meta?.userDeckName || "game";
  }
  const reason = game.reason ? ` [${game.reason}]` : "";
  return `  ${label} — ${game.result} (turn ${game.turns})${reason}`;
}

/**
 * Build a clean, human-readable plaintext breakage report from an aggregate.
 * Pure string construction — no I/O. Colton can paste this anywhere.
 *
 * @param {object} aggregate  output of aggregateBreakages
 * @param {object} [opts]
 * @param {string} [opts.title]     report title
 * @param {string[]} [opts.deckNames]  the deck roster the batch ran over
 * @param {string} [opts.mode]      "commander" | "standard"
 * @param {string} [opts.generatedAt]  ISO timestamp (defaults to now)
 * @returns {string}
 */
export function formatBreakageTxt(aggregate, opts = {}) {
  const {
    title = "MTG Tool — Self-Play Stress Test",
    deckNames = [],
    mode = "commander",
    generatedAt = new Date().toISOString(),
  } = opts;

  const agg = aggregate || { cards: [], outcomes: {}, avgTurns: 0, totalBreakages: 0, games: [] };
  const o = agg.outcomes || {};
  const lines = [];

  // ── Header ──
  lines.push("=".repeat(72));
  lines.push(title);
  lines.push("=".repeat(72));
  lines.push(`Generated:   ${generatedAt}`);
  lines.push(`Mode:        ${mode}`);
  lines.push(`Decks (${deckNames.length}):   ${deckNames.length ? deckNames.join(", ") : "(none)"}`);
  lines.push(`Games run:   ${o.total ?? 0}`);
  lines.push("");

  // ── Outcomes ──
  lines.push("OUTCOMES");
  lines.push("-".repeat(72));
  lines.push(`  Completed:        ${o.completed ?? 0} / ${o.total ?? 0}`);
  lines.push(`  User (seat 1) wins: ${o.userWins ?? 0}`);
  lines.push(`  Opponent wins:    ${o.aiWins ?? 0}`);
  lines.push(`  Draws:            ${o.draws ?? 0}`);
  lines.push(`  Avg turns/game:   ${agg.avgTurns ? agg.avgTurns.toFixed(1) : "0"}`);
  const nonCompletions = (o.timeouts ?? 0) + (o.engineStuck ?? 0) + (o.dispatchError ?? 0) + (o.setupError ?? 0) + (o.unexpected ?? 0);
  if (nonCompletions > 0) {
    lines.push("");
    lines.push("  NON-COMPLETIONS (engine could not finish — reported honestly):");
    if (o.timeouts) lines.push(`    timeout:         ${o.timeouts}`);
    if (o.engineStuck) lines.push(`    engine-stuck:    ${o.engineStuck}`);
    if (o.dispatchError) lines.push(`    dispatch-error:  ${o.dispatchError}`);
    if (o.setupError) lines.push(`    setup-error:     ${o.setupError}`);
    if (o.unexpected) lines.push(`    unexpected:      ${o.unexpected}`);
  }
  lines.push("");

  // ── Ranked breakage table ──
  lines.push("UNMODELED / BROKEN CARDS (ranked by frequency)");
  lines.push("-".repeat(72));
  if (!agg.cards.length) {
    lines.push("  None — no spell-unresolved / stack-resolve-error / trigger-removed");
    lines.push("  entries appeared in any game's log. (Either every card resolved");
    lines.push("  natively, or the decks played out without reaching them.)");
  } else {
    const CARD_W = 40;
    const COUNT_W = 7;
    lines.push(`  ${col("CARD", CARD_W)}${col("COUNT", COUNT_W)}KINDS`);
    lines.push(`  ${"-".repeat(CARD_W)}${"-".repeat(COUNT_W)}${"-".repeat(25)}`);
    for (const c of agg.cards) {
      const kinds = Object.entries(c.kinds)
        .map(([k, n]) => `${k}×${n}`)
        .join(", ");
      // A name at/over the column width gets a trailing space so COUNT never butts up.
      const name = c.card.length >= CARD_W ? `${c.card} ` : col(c.card, CARD_W);
      lines.push(`  ${name}${col(c.count, COUNT_W)}${kinds}`);
      if (c.sampleReason) {
        lines.push(`  ${col("", CARD_W + COUNT_W)}↳ ${c.sampleReason}${c.sampleTurn != null ? ` (turn ${c.sampleTurn})` : ""}`);
      }
    }
    lines.push("");
    lines.push(`  Total breakage log entries: ${agg.totalBreakages}`);
  }
  lines.push("");

  // ── Per-game one-liners ──
  lines.push("PER-GAME RESULTS");
  lines.push("-".repeat(72));
  if (!agg.games.length) {
    lines.push("  (no games)");
  } else {
    for (const g of agg.games) lines.push(gameOneLiner(g));
  }
  lines.push("");
  lines.push("=".repeat(72));
  lines.push("End of report. Breakage list = the engine's own honest signals; nothing");
  lines.push("here is fabricated. Feed the ranked card list to the coverage queue.");
  lines.push("=".repeat(72));

  return lines.join("\n");
}
