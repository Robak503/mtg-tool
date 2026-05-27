/**
 * gameInsights.js — pure summariser over goldfish run records.
 *
 * Reads an array of run records (from /api/games or in-memory) and produces a
 * structured snapshot of how the deck has been performing. No fetch, no fs —
 * just data in / data out, so it can run server-side (in the games-summary
 * route), client-side (GarfieldPanel), or inside an agent's context-builder.
 *
 * Input shape (each run, as written by /api/games):
 *   {
 *     deckId, deckName, archetype, archetypeConfidence,
 *     score, mulligans, summary,
 *     openingHand, bottomedFromMulligan, openingLands,
 *     turns: [{ turn, draw, land, cast: [string], mana, handSize }, ...],
 *     savedAt,
 *   }
 *
 * Output shape:
 *   {
 *     count, deckId, deckName,
 *     archetype: { consensus, confidence, distribution: {name: count} },
 *     score: { avg, min, max, recent5Avg, trend: "improving"|"regressing"|"flat" },
 *     mulligan: { rate, avgCount },
 *     pacing: {
 *       commanderByTurn4Rate,
 *       earlyRampRate,
 *       earlyDrawRate,
 *       threatByTurn5Rate,
 *     },
 *     weakSignals: [string],   // "Commander rarely on curve" etc.
 *     strongSignals: [string],
 *     samples: { newest3: [{ savedAt, score, summary }] },
 *   }
 */

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function modeOf(values) {
  if (!values.length) return null;
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  let bestCount = 0;
  for (const [k, c] of counts) {
    if (c > bestCount) { best = k; bestCount = c; }
  }
  return { value: best, count: bestCount };
}

function detectThreatByTurn5(summary) {
  // The v2 goldfish summary contains either "first threat turn N" or
  // "no clear threat by turn 6". We extract turn N and compare to <=5.
  const match = String(summary || "").match(/first threat turn (\d+)/);
  if (!match) return false;
  return Number(match[1]) <= 5;
}

function detectCommanderByTurn4(summary) {
  const match = String(summary || "").match(/commander on turn (\d+)/);
  if (!match) return false;
  return Number(match[1]) <= 4;
}

function summariseGameHistoryInternal(runs) {
  if (!runs || runs.length === 0) {
    return { count: 0 };
  }

  const sorted = [...runs].sort((a, b) =>
    String(b.savedAt || "").localeCompare(String(a.savedAt || ""))
  );

  // Archetype distribution.
  const archetypeCounts = {};
  for (const run of sorted) {
    const a = run.archetype || "unknown";
    archetypeCounts[a] = (archetypeCounts[a] || 0) + 1;
  }
  const consensus = modeOf(sorted.map(r => r.archetype || "unknown"));

  // Scores.
  const scores = sorted.map(r => Number(r.score) || 0);
  const recent5 = scores.slice(0, 5);
  const older5 = scores.slice(5, 10);
  const recent5Avg = recent5.length ? Math.round(avg(recent5)) : 0;
  const older5Avg = older5.length ? Math.round(avg(older5)) : recent5Avg;
  let trend = "flat";
  if (recent5.length >= 3 && older5.length >= 3) {
    const delta = recent5Avg - older5Avg;
    if (delta >= 6) trend = "improving";
    else if (delta <= -6) trend = "regressing";
  }

  // Mulligan rate (any mulligans = "had to") and average mulligan count.
  const mulligans = sorted.map(r => Number(r.mulligans) || 0);
  const mulliganRunCount = mulligans.filter(m => m > 0).length;

  // Pacing — derived from the summary string for runs that have one. Falls
  // back to inspecting turns[] for runs without a summary.
  let commanderHits = 0, rampHits = 0, drawHits = 0, threatHits = 0;
  for (const run of sorted) {
    const s = run.summary || "";
    if (detectCommanderByTurn4(s)) commanderHits += 1;
    if (s.includes("early ramp online")) rampHits += 1;
    if (s.includes("card flow appeared")) drawHits += 1;
    if (detectThreatByTurn5(s)) threatHits += 1;
  }

  const pacing = {
    commanderByTurn4Rate: pct(commanderHits, sorted.length),
    earlyRampRate: pct(rampHits, sorted.length),
    earlyDrawRate: pct(drawHits, sorted.length),
    threatByTurn5Rate: pct(threatHits, sorted.length),
  };

  // Translate into plain-English signals. "Weak" = something to fix. "Strong"
  // = something to keep doing.
  const weakSignals = [];
  const strongSignals = [];
  if (pacing.commanderByTurn4Rate < 40 && sorted.length >= 3) {
    weakSignals.push(`Commander lands by turn 4 in only ${pacing.commanderByTurn4Rate}% of runs — consider ramp or cost reduction`);
  } else if (pacing.commanderByTurn4Rate >= 70) {
    strongSignals.push(`Commander reliably on curve (${pacing.commanderByTurn4Rate}% by turn 4)`);
  }
  if (pacing.earlyRampRate < 40 && sorted.length >= 3 && consensus?.value !== "control") {
    weakSignals.push(`Early ramp shows up in only ${pacing.earlyRampRate}% of runs`);
  } else if (pacing.earlyRampRate >= 70) {
    strongSignals.push(`Early ramp is online ${pacing.earlyRampRate}% of the time`);
  }
  if (pacing.earlyDrawRate < 30 && sorted.length >= 3) {
    weakSignals.push(`Card draw rarely shows up early (${pacing.earlyDrawRate}%) — risk of running out of gas`);
  }
  if (pacing.threatByTurn5Rate < 50 && sorted.length >= 3 && consensus?.value !== "control") {
    weakSignals.push(`A clean threat lands by turn 5 only ${pacing.threatByTurn5Rate}% of the time`);
  } else if (pacing.threatByTurn5Rate >= 80) {
    strongSignals.push(`Threats land on schedule (${pacing.threatByTurn5Rate}% by turn 5)`);
  }
  if (mulliganRunCount / sorted.length > 0.5 && sorted.length >= 4) {
    weakSignals.push(`Mulliganing on ${pct(mulliganRunCount, sorted.length)}% of runs — opening hands aren't holding up`);
  }

  return {
    count: sorted.length,
    deckId: sorted[0]?.deckId || null,
    deckName: sorted[0]?.deckName || null,
    archetype: {
      consensus: consensus?.value || null,
      confidence: consensus ? pct(consensus.count, sorted.length) : 0,
      distribution: archetypeCounts,
    },
    score: {
      avg: scores.length ? Math.round(avg(scores)) : 0,
      min: scores.length ? Math.min(...scores) : 0,
      max: scores.length ? Math.max(...scores) : 0,
      recent5Avg,
      trend,
    },
    mulligan: {
      rate: pct(mulliganRunCount, sorted.length),
      avgCount: Number(avg(mulligans).toFixed(2)),
    },
    pacing,
    weakSignals,
    strongSignals,
    samples: {
      newest3: sorted.slice(0, 3).map(r => ({
        savedAt: r.savedAt,
        score: r.score,
        summary: r.summary,
        archetype: r.archetype,
      })),
    },
  };
}

export function summariseGameHistory(runs) {
  return summariseGameHistoryInternal(runs);
}

/**
 * Compact one-paragraph summary intended for an LLM system prompt. Plain text,
 * no markdown headers, single trailing newline. Returns "" when there's
 * insufficient data so the caller can safely concatenate.
 */
export function formatInsightsForAgent(insights) {
  if (!insights || !insights.count || insights.count < 2) return "";
  const lines = [];
  lines.push(`## Goldfish History for this Deck`);
  lines.push(`This deck has been simulated ${insights.count} times locally (Garfield v2).`);
  if (insights.archetype?.consensus) {
    lines.push(`Detected archetype: ${insights.archetype.consensus} (${insights.archetype.confidence}% of runs).`);
  }
  if (insights.score) {
    lines.push(`Average score: ${insights.score.avg}/100 (recent 5-run avg ${insights.score.recent5Avg}, trend: ${insights.score.trend}).`);
  }
  if (insights.mulligan && insights.mulligan.rate >= 0) {
    lines.push(`Mulligan rate: ${insights.mulligan.rate}% (avg ${insights.mulligan.avgCount} mulligans per run).`);
  }
  if (insights.pacing) {
    lines.push(`Pacing — commander by turn 4: ${insights.pacing.commanderByTurn4Rate}%; early ramp: ${insights.pacing.earlyRampRate}%; early card flow: ${insights.pacing.earlyDrawRate}%; threat by turn 5: ${insights.pacing.threatByTurn5Rate}%.`);
  }
  if (insights.weakSignals?.length) {
    lines.push(`Observed weaknesses: ${insights.weakSignals.join("; ")}.`);
  }
  if (insights.strongSignals?.length) {
    lines.push(`Strengths: ${insights.strongSignals.join("; ")}.`);
  }
  lines.push(`Use these observations as concrete evidence when discussing the deck. Do not fabricate stats beyond what is listed above.`);
  return lines.join("\n");
}
